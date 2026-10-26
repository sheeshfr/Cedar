/**
 * Cedar — Vault (BYOC Local Drive & Storage Engine)
 * 100% Client-Side, Zero Dependencies, Standalone & Offline Ready
 * Uses the Native File System Access API with IndexedDB Persistence & PKZIP Backup/Restore.
 */

(function () {
  'use strict';

  // --- Storage & DB Constants ---
  const DB_NAME = 'sheesh_vault_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'root_dir_handle';
  const METADATA_FILE = 'vault.json';

  // --- In-Memory State ---
  let rootHandle = null;
  let vaultInfo = null;
  const eventListeners = new Map();

  // =========================================================================
  // INDEXED DB PERSISTENCE FOR DIRECTORY HANDLES
  // =========================================================================
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveHandleToDb(handle) {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(handle, HANDLE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('[Vault] Could not save handle to IndexedDB:', err);
    }
  }

  async function getHandleFromDb() {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('[Vault] Could not get handle from IndexedDB:', err);
      return null;
    }
  }

  async function removeHandleFromDb() {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(HANDLE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('[Vault] Could not remove handle from IndexedDB:', err);
    }
  }

  // =========================================================================
  // PERMISSION HELPERS
  // =========================================================================
  async function verifyPermission(fileHandle, readWrite = true) {
    if (!fileHandle) return false;
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    try {
      if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
      }
      if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
      }
    } catch (e) {
      console.warn('[Vault] Permission verification failed:', e);
    }
    return false;
  }

  // =========================================================================
  // PKZIP GENERATOR & PARSER (Zero Dependencies)
  // =========================================================================
  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
  }

  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  async function createZipArchive(files) {
    const textEncoder = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    let localHeaders = [];
    let fileDatas = [];
    let cdHeaders = [];
    let currentOffset = 0;

    for (const file of files) {
      let fileBytes;
      if (typeof file.data === 'string') {
        fileBytes = textEncoder.encode(file.data);
      } else if (file.data instanceof Uint8Array) {
        fileBytes = file.data;
      } else if (file.data instanceof Blob) {
        const ab = await file.data.arrayBuffer();
        fileBytes = new Uint8Array(ab);
      } else if (file.data instanceof ArrayBuffer) {
        fileBytes = new Uint8Array(file.data);
      } else {
        fileBytes = new Uint8Array(0);
      }

      const cleanName = file.name.replace(/\\/g, '/').replace(/^\/+/, '');
      const nameBytes = textEncoder.encode(cleanName);
      const fileCrc = crc32(fileBytes);

      // Local Header
      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true); // uncompressed
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, fileCrc, true);
      lv.setUint32(18, fileBytes.length, true);
      lv.setUint32(22, fileBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      // Central Directory Header
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, fileCrc, true);
      cv.setUint32(20, fileBytes.length, true);
      cv.setUint32(24, fileBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, currentOffset, true);
      cd.set(nameBytes, 46);

      localHeaders.push(lh);
      fileDatas.push(fileBytes);
      cdHeaders.push(cd);

      currentOffset += lh.length + fileBytes.length;
    }

    const cdOffset = currentOffset;
    let cdSize = 0;
    cdHeaders.forEach(c => (cdSize += c.length));

    // End of Central Directory Record
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdOffset, true);
    ev.setUint16(20, 0, true);

    const totalSize = currentOffset + cdSize + eocd.length;
    const zipBuffer = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < files.length; i++) {
      zipBuffer.set(localHeaders[i], offset);
      offset += localHeaders[i].length;
      zipBuffer.set(fileDatas[i], offset);
      offset += fileDatas[i].length;
    }
    for (let i = 0; i < cdHeaders.length; i++) {
      zipBuffer.set(cdHeaders[i], offset);
      offset += cdHeaders[i].length;
    }
    zipBuffer.set(eocd, offset);

    return zipBuffer;
  }

  // Simple ZIP extractor for uncompressed (store) & deflate-raw (using DecompressionStream)
  async function parseZipArchive(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder();
    const files = [];

    // Find EOCD by scanning backwards from end
    let eocdOffset = -1;
    for (let i = arrayBuffer.byteLength - 22; i >= Math.max(0, arrayBuffer.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Invalid ZIP file: End of Central Directory signature not found.');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    let offset = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        break;
      }

      const method = view.getUint16(offset + 10, true);
      const compSize = view.getUint32(offset + 20, true);
      const uncompSize = view.getUint32(offset + 24, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const nameBytes = uint8.subarray(offset + 46, offset + 46 + nameLen);
      const fileName = textDecoder.decode(nameBytes);

      // Read local header to find data offset
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      const rawData = uint8.subarray(dataOffset, dataOffset + compSize);
      let decompressedData;

      if (method === 0) {
        // Stored (no compression)
        decompressedData = rawData;
      } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
        // Deflate
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(rawData);
        writer.close();
        const response = new Response(ds.readable);
        const ab = await response.arrayBuffer();
        decompressedData = new Uint8Array(ab);
      } else {
        decompressedData = rawData;
      }

      if (!fileName.endsWith('/')) {
        files.push({
          name: fileName,
          data: decompressedData,
          size: uncompSize
        });
      }

      offset += 46 + nameLen + extraLen + commentLen;
    }

    return files;
  }

  // =========================================================================
  // FILE SYSTEM ACCESS WRAPPER
  // =========================================================================
  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    try {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result || '';
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function uint8ArrayToBase64(u8arr) {
    let binary = '';
    const len = u8arr.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(u8arr[i]);
    }
    return btoa(binary);
  }

  function createServerBridgeHandle(folderPath, folderName) {
    const normPath = (folderPath || '').trim();
    const name = folderName || normPath.split(/[\\/]/).filter(Boolean).pop() || 'cedar';
    return {
      isServerBridge: true,
      kind: 'directory',
      name: name,
      path: normPath
    };
  }

  async function resolvePathOnHandle(dirHandle, path, create = false, kind = 'file') {
    if (!dirHandle) throw new Error('No directory handle provided.');
    const parts = path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
    if (parts.length === 0) return dirHandle;

    let current = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create });
    }

    const lastPart = parts[parts.length - 1];
    if (kind === 'directory') {
      return await current.getDirectoryHandle(lastPart, { create });
    } else {
      return await current.getFileHandle(lastPart, { create });
    }
  }

  async function resolvePathHandle(path, create = false, kind = 'file') {
    if (!rootHandle) throw new Error('No vault directory connected.');
    return await resolvePathOnHandle(rootHandle, path, create, kind);
  }

  async function writeFileToDirHandle(dirHandle, path, data) {
    if (dirHandle && dirHandle.isServerBridge) {
      let content = data;
      let encoding = 'utf-8';
      if (data instanceof Blob) {
        content = await blobToBase64(data);
        encoding = 'base64';
      } else if (data instanceof ArrayBuffer) {
        content = uint8ArrayToBase64(new Uint8Array(data));
        encoding = 'base64';
      } else if (data instanceof Uint8Array) {
        content = uint8ArrayToBase64(data);
        encoding = 'base64';
      } else if (typeof data === 'object') {
        content = JSON.stringify(data, null, 2);
      }

      const res = await fetch('/api/vault-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: dirHandle.path,
          filePath: path,
          content: content,
          encoding: encoding
        })
      });
      if (!res.ok) {
        throw new Error(`Local Bridge write failed (${res.status}): ${res.statusText}`);
      }
      return true;
    }

    const fileHandle = await resolvePathOnHandle(dirHandle, path, true, 'file');
    const writable = await fileHandle.createWritable();

    if (typeof data === 'string') {
      await writable.write(data);
    } else if (data instanceof Blob || data instanceof ArrayBuffer || data instanceof Uint8Array) {
      await writable.write(data);
    } else if (typeof data === 'object') {
      await writable.write(JSON.stringify(data, null, 2));
    }

    await writable.close();
    return true;
  }

  async function readFileFromDirHandle(dirHandle, path, as = 'text') {
    if (dirHandle && dirHandle.isServerBridge) {
      try {
        const res = await fetch(`/api/vault-read?folder=${encodeURIComponent(dirHandle.path)}&file=${encodeURIComponent(path)}&as=${encodeURIComponent(as)}`);
        if (!res.ok) return null;
        if (as === 'json') return await res.json();
        if (as === 'blob') return await res.blob();
        if (as === 'arrayBuffer' || as === 'arraybuffer') return await res.arrayBuffer();
        return await res.text();
      } catch (e) {
        return null;
      }
    }

    try {
      const fileHandle = await resolvePathOnHandle(dirHandle, path, false, 'file');
      const file = await fileHandle.getFile();
      if (as === 'json') {
        const text = await file.text();
        return JSON.parse(text);
      } else if (as === 'blob') {
        return file;
      } else if (as === 'arrayBuffer' || as === 'arraybuffer') {
        return await file.arrayBuffer();
      } else {
        return await file.text();
      }
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e;
      return null;
    }
  }

  async function removeDirEntry(dirHandle, path) {
    if (!dirHandle) return false;
    if (dirHandle.isServerBridge && dirHandle.path) {
      try {
        const res = await fetch('/api/vault-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderPath: dirHandle.path,
            filePath: path
          })
        });
        return res.ok;
      } catch (e) {
        return false;
      }
    }
    try {
      const parts = path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
      if (parts.length === 0) return false;
      const target = parts.pop();
      let current = dirHandle;
      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: false });
      }
      await current.removeEntry(target, { recursive: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function isExistingCedarFolder(dirHandle) {
    if (!dirHandle) return false;
    try {
      if (dirHandle.getFileHandle) {
        try { await dirHandle.getFileHandle('config.json'); return true; } catch (e) {}
        try { await dirHandle.getFileHandle('vault.json'); return true; } catch (e) {}
      }
      if (dirHandle.path) {
        const resp = await fetch(`/api/check-folder?path=${encodeURIComponent(dirHandle.path)}`);
        if (resp.ok) {
          const data = await resp.json();
          return Boolean(data.isCedar || data.isOutpost);
        }
      }
    } catch (err) {}
    return false;
  }
  const isExistingOutpostFolder = isExistingCedarFolder;
  async function _legacyIsExistingOutpostFolder(dirHandle) {
    if (!dirHandle) return false;
    if (dirHandle.isServerBridge) {
      try {
        const res = await fetch(`/api/check-folder?path=${encodeURIComponent(dirHandle.path)}`);
        if (res.ok) {
          const data = await res.json();
          return Boolean(data.isCedar || data.isOutpost);
        }
      } catch (e) {}
      return false;
    }

    try {
      try {
        await dirHandle.getFileHandle('config.json');
        return true;
      } catch (e) {}
      try {
        await dirHandle.getFileHandle('vault.json');
        return true;
      } catch (e) {}
      try {
        const wr = await dirHandle.getDirectoryHandle('writer');
        try {
          await wr.getFileHandle('drafts.json');
          return true;
        } catch (e) {}
      } catch (e) {}
      try {
        const sw = await dirHandle.getDirectoryHandle('static-writer');
        try {
          await sw.getFileHandle('drafts.json');
          return true;
        } catch (e) {}
      } catch (e) {}
      try {
        const b = await dirHandle.getDirectoryHandle('blog');
        for await (const [name, entry] of b.entries()) {
          if (name !== 'images') return true;
        }
      } catch (e) {}
    } catch (err) {
      console.warn('[Vault] Check existing folder notice:', err);
    }
    return false;
  }

  async function copyBlogToFolder(dirHandle, options = {}) {
    if (!dirHandle) throw new Error('No target directory provided.');

    // 0. Cloudflare Pages guardrails (.cfignore)
    const cfIgnoreContent = [
      '# Cedar Cloudflare Guardrails - Do NOT deploy internal, draft, or hidden assets',
      'editor/',
      'writer/',
      'static-writer/',
      'blog/drafts/',
      'blog/hidden/',
      'pages/hidden/',
      'drafts/',
      'hidden/',
      'backups/',
      'notes/',
      '*.draft.*',
      '**/draft.json',
      'drafts.json',
      'vault.json',
      'notes.json',
      'sync.json',
      '_authors_archive/',
      '_designer_archive/',
      '_legacy_archive/',
      '_notes_archive/',
      '__pycache__/'
    ].join('\n') + '\n';
    await writeFileToDirHandle(dirHandle, '.cfignore', cfIgnoreContent);

    // 1. config.json and writer/config.json
    const resolvedEditorTheme = (window.projectConfig?.design && (window.projectConfig.design.customColors || window.projectConfig.design.blogTheme || window.projectConfig.design.activeTheme))
      || window.projectConfig?.editorTheme
      || localStorage.getItem('cedar_theme')
      || localStorage.getItem('cedar_editor_theme')
      || 'basalt';
    const configData = Object.assign({}, window.projectConfig || {}, {
      schemaVersion: 150,
      buildToken: 'v150',
      name: window.projectConfig?.name || 'Cedar',
      subtitle: window.projectConfig?.subtitle || '',
      description: window.projectConfig?.description || 'Drop-in Blog Engine',
      domain: window.projectConfig?.domain || '',
      blogPath: window.projectConfig?.blogPath || 'blog',
      baseUrl: window.projectConfig?.baseUrl || '/blog/',
      timezone: window.projectConfig?.timezone || 'America/Chicago',
      defaultAuthor: window.projectConfig?.defaultAuthor || '',
      defaultCategory: window.projectConfig?.defaultCategory || 'Uncategorized',
      authors: window.projectConfig?.authors || [],
      categories: window.projectConfig?.categories || [],
      autoCategoryPages: window.projectConfig?.autoCategoryPages !== false,
      rssEnabled: Boolean(window.projectConfig?.rssEnabled),
      layoutOverride: Boolean(window.projectConfig?.layoutOverride),
      sanitizeImages: window.projectConfig?.sanitizeImages !== false,
      mediaPreferences: window.projectConfig?.mediaPreferences || {},
      editorTheme: resolvedEditorTheme,
      design: window.projectConfig?.design || null,
      vaultPath: (localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || window.projectConfig?.vaultPath || '',
      lastUpdated: Date.now()
    });
    const configSerialized = JSON.stringify(configData, null, 2);
    await writeFileToDirHandle(dirHandle, 'config.json', configSerialized);
    await writeFileToDirHandle(dirHandle, 'editor/config.json', configSerialized);
    try { await writeFileToDirHandle(dirHandle, 'writer/config.json', configSerialized); } catch (e) {}

    // 2. editor/drafts.json (and clean up legacy static-writer/ and pages/drafts/)
    const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
    await writeFileToDirHandle(dirHandle, 'editor/drafts.json', JSON.stringify(draftsList, null, 2));
    try { await writeFileToDirHandle(dirHandle, 'writer/drafts.json', JSON.stringify(draftsList, null, 2)); } catch (e) {}
    await removeDirEntry(dirHandle, 'static-writer');
    await removeDirEntry(dirHandle, 'pages/drafts');

    // 3. vault.json
    await writeFileToDirHandle(dirHandle, 'vault.json', JSON.stringify({
      name: dirHandle.name || 'Cedar Vault',
      createdAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      version: '1.0',
      site: 'Cedar'
    }, null, 2));

    // 4. Posts (/blog/{drafts,published,hidden}/<slug>/) & Pages (/pages/{published,hidden}/<slug>/)
    const globalLayoutOverride = Boolean(window.projectConfig?.layoutOverride);
    for (const draft of draftsList) {
      if (draft.type === 'note') continue;
      const isPostId = Boolean(draft.id && String(draft.id).startsWith('post_'));
      const isPage = !isPostId && Boolean(draft.type === 'page' || draft.isCategoryAggregate || (draft.id && String(draft.id).startsWith('page_')));
      if (isPage) {
        draft.type = 'page';
        draft.status = 'published';
      } else if (isPostId) {
        draft.type = 'post';
      }
      const slug = draft.slug || (typeof window.generateSlug === 'function' ? window.generateSlug(draft.title) : '') || (isPage ? 'untitled-page' : 'untitled-post');
      
      const isHidden = Boolean(draft.hidden || draft.retired);
      const isPublished = isPage ? !isHidden : (!isHidden && (draft.status === 'published'));

      const baseRoot = isPage ? 'pages' : 'blog';
      const statusSubfolder = isHidden ? 'hidden' : (isPublished ? 'published' : 'drafts');
      const folder = `${baseRoot}/${statusSubfolder}/${slug}`;

      // Remove stale status folders for this slug so each item only lives in its current status folder
      const validStatuses = isPage ? ['published', 'hidden'] : ['drafts', 'published', 'hidden'];
      for (const st of validStatuses) {
        if (st !== statusSubfolder) {
          await removeDirEntry(dirHandle, `${baseRoot}/${st}/${slug}`);
        }
      }
      if (isPage) {
        for (const pst of ['drafts', 'published', 'hidden']) {
          await removeDirEntry(dirHandle, `blog/${pst}/${slug}`);
        }
      }
      // Clean up legacy top-level folders if migrating
      if (slug !== 'drafts' && slug !== 'published' && slug !== 'hidden') {
        await removeDirEntry(dirHandle, `blog/${slug}`);
        await removeDirEntry(dirHandle, `pages/${slug}`);
        await removeDirEntry(dirHandle, `posts/${slug}`);
        await removeDirEntry(dirHandle, `drafts/${slug}`);
        await removeDirEntry(dirHandle, `hidden/${slug}`);
      }

      const md = (typeof window.generateMarkdownWithFrontmatter === 'function')
        ? window.generateMarkdownWithFrontmatter(draft)
        : (draft.markdown || '');

      await writeFileToDirHandle(dirHandle, `${folder}/index.md`, md);
      await writeFileToDirHandle(dirHandle, `${folder}/draft.json`, JSON.stringify(draft, null, 2));

      // ONLY published posts and pages generate public index.html for Cloudflare to deploy.
      // When Layout Override is enabled (globally or per-post/page), preserve existing manual index.html designs on disk.
      if (isPublished) {
        const isOverrideProtected = Boolean(globalLayoutOverride || draft.layoutOverride);
        let skipHtmlWrite = false;
        if (isOverrideProtected && !draft.customHtml) {
          try {
            const existingHtml = await readFileFromDirHandle(dirHandle, `${folder}/index.html`, 'text');
            if (existingHtml && existingHtml.trim()) {
              skipHtmlWrite = true;
            }
          } catch (e) {}
        }
        if (!skipHtmlWrite) {
          const html = (typeof window.generateFullHtml === 'function')
            ? window.generateFullHtml(draft)
            : (draft.proseHtml || '');
          await writeFileToDirHandle(dirHandle, `${folder}/index.html`, html);
        }
      }

      // Related media (images within this post/page) live directly inside the post/page folder
      if (Array.isArray(draft.images)) {
        for (const img of draft.images) {
          let blob = img.blob;
          if (!blob && img.dataUrl) {
            blob = dataUrlToBlob(img.dataUrl);
          }
          if (blob && img.filename) {
            await writeFileToDirHandle(dirHandle, `${folder}/${img.filename}`, blob);
          }
        }
      }
    }

    // 5. RSS Feeds (feed.xml and blog/feed.xml)
    const isRssEnabled = (typeof resolveProjectRssEnabled === 'function')
      ? resolveProjectRssEnabled()
      : Boolean(window.projectConfig?.rssEnabled);
    if (isRssEnabled) {
      const publishedPosts = draftsList.filter(d => (d.type === 'post' || !d.type) && (!d.status || d.status === 'published') && !d.hidden && !d.retired);
      if (typeof window.generateRssFeedXml === 'function' && window.projectConfig) {
        const rssFeed = window.generateRssFeedXml(publishedPosts, window.projectConfig);
        await writeFileToDirHandle(dirHandle, 'feed.xml', rssFeed);
        await writeFileToDirHandle(dirHandle, 'blog/feed.xml', rssFeed);
      }
    } else {
      // Remove feed.xml from local vault so readers stop receiving feeds
      try { await dirHandle.removeEntry('feed.xml'); } catch (e) {}
      try {
        const blogHandle = await dirHandle.getDirectoryHandle('blog');
        await blogHandle.removeEntry('feed.xml');
      } catch (e) {}
    }

    // 6. Site-Wide Media in /media/ (branding logos, author images, etc.)
    const brandingSources = {};
    if (window.projectConfig?.design?.branding?.files) {
      Object.assign(brandingSources, window.projectConfig.design.branding.files);
    }
    if (window.brandingFiles) {
      Object.assign(brandingSources, window.brandingFiles);
    }
    try {
      const storedBranding = JSON.parse((localStorage.getItem('cedar_branding_files_v1') || localStorage.getItem('outpost_branding_files_v1')) || '{}');
      Object.assign(brandingSources, storedBranding);
    } catch (e) {}

    const brand = window.projectConfig?.design?.branding || {};
    if (brand.generalLogo && brand.generalLogo.startsWith('data:')) {
      brandingSources['media/branding/logo.png'] = brand.generalLogo;
      brandingSources['media/branding/icon.png'] = brand.tabLogo || brand.generalLogo;
      brandingSources['media/branding/logo-original.png'] = brand.originalLogo || brand.generalLogo;
    }

    for (const [rawPath, fileData] of Object.entries(brandingSources)) {
      // Normalize any legacy images/branding/ or blog/images/branding/ path into media/branding/
      const baseName = rawPath.split('/').pop() || 'logo.png';
      const targetMediaPath = `media/branding/${baseName}`;
      let blob = null;
      if (fileData instanceof Blob) {
        blob = fileData;
      } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        blob = dataUrlToBlob(fileData);
      }
      if (blob) {
        await writeFileToDirHandle(dirHandle, targetMediaPath, blob);
      }
    }

    // Author Avatars -> media/authors/
    if (Array.isArray(window.projectConfig?.authors)) {
      for (const auth of window.projectConfig.authors) {
        if (auth && typeof auth === 'object' && auth.avatar && auth.avatar.startsWith('data:')) {
          const authSlug = String(auth.name || 'author').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const avBlob = dataUrlToBlob(auth.avatar);
          if (avBlob) {
            await writeFileToDirHandle(dirHandle, `media/authors/${authSlug}_avatar.jpg`, avBlob);
          }
        }
      }
    }

    // 7. Delete from old handle if move operation requested
    if (options.deleteFromOldHandle && options.deleteFromOldHandle !== dirHandle) {
      const entriesToRemove = ['posts', 'pages', 'blog', 'media', 'writer', 'static-writer', 'drafts', 'hidden', 'config.json', 'notes.json', 'feed.xml', 'notes.xml', 'vault.json'];
      for (const name of entriesToRemove) {
        try {
          await removeDirEntry(options.deleteFromOldHandle, name);
        } catch (err) {}
      }
    }

    return true;
  }

  async function listSubfolderEntries(dirHandle, subPath) {
    if (!dirHandle) return [];
    if (dirHandle.isServerBridge && dirHandle.path) {
      try {
        const res = await fetch(`/api/vault-list?folder=${encodeURIComponent(dirHandle.path)}&subpath=${encodeURIComponent(subPath)}`);
        if (!res.ok) return [];
        const items = await res.json();
        return Array.isArray(items) ? items : [];
      } catch (e) {
        return [];
      }
    }
    try {
      const subHandle = await resolvePathOnHandle(dirHandle, subPath, false, 'directory');
      const out = [];
      for await (const [name, entry] of subHandle.entries()) {
        out.push({ name, kind: entry.kind });
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  async function loadBlogFromFolder(dirHandle) {
    if (!dirHandle) return false;

    // 1. Read editor/config.json, writer/config.json and config.json
    try {
      let editorCfg = null;
      let writerCfg = null;
      let rootCfg = null;
      try { editorCfg = await readFileFromDirHandle(dirHandle, 'editor/config.json', 'json'); } catch (e) {}
      try { writerCfg = await readFileFromDirHandle(dirHandle, 'writer/config.json', 'json'); } catch (e) {}
      try { rootCfg = await readFileFromDirHandle(dirHandle, 'config.json', 'json'); } catch (e) {}

      let cfg = null;
      const candidates = [editorCfg, writerCfg, rootCfg].filter(Boolean);
      if (candidates.length > 0) {
        candidates.sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0));
        cfg = Object.assign({}, ...candidates.reverse());
      }

      if (cfg && typeof cfg === 'object') {
        if (cfg.design && window.projectConfig && window.projectConfig.design) {
          cfg.design = Object.assign({}, window.projectConfig.design, cfg.design);
        }
        Object.assign(window.projectConfig, cfg);

        const resolvedEditorTheme = (cfg.design && (cfg.design.customColors || cfg.design.blogTheme || cfg.design.activeTheme))
          || cfg.editorTheme
          || localStorage.getItem('cedar_theme')
          || localStorage.getItem('cedar_editor_theme')
          || 'basalt';
        window.projectConfig.editorTheme = resolvedEditorTheme;

        try {
          localStorage.setItem('cedar_editor_theme', resolvedEditorTheme);
          localStorage.setItem('cedar_theme', resolvedEditorTheme);
          if (cfg.domain) localStorage.setItem('cedar_user_domain', cfg.domain);
          if (cfg.blogPath) localStorage.setItem('cedar_user_blog_path', cfg.blogPath);
          if (cfg.layoutOverride !== undefined) {
            localStorage.setItem('cedar_layout_override', cfg.layoutOverride ? 'true' : 'false');
          }
          if (cfg.rssEnabled !== undefined) {
            localStorage.setItem('cedar_rss_enabled', cfg.rssEnabled ? 'true' : 'false');
          }
        } catch (e) {}

        if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {
          (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(resolvedEditorTheme, false);
        }
        if (cfg.mediaPreferences && typeof window.applyMediaPreferences === 'function') {
          window.applyMediaPreferences(Boolean(cfg.mediaPreferences.roundedImages));
        }
        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage();
        }
      }
    } catch (e) {
      console.warn('[Vault] Could not parse config.json:', e);
    }

    // 2. Read editor/drafts.json (with fallback to writer/drafts.json and legacy static-writer/drafts.json)
    let loadedDrafts = null;
    try {
      loadedDrafts = await readFileFromDirHandle(dirHandle, 'editor/drafts.json', 'json');
    } catch (e) {}
    if (!Array.isArray(loadedDrafts)) {
      try {
        loadedDrafts = await readFileFromDirHandle(dirHandle, 'writer/drafts.json', 'json');
      } catch (e) {}
    }
    if (!Array.isArray(loadedDrafts)) {
      try {
        loadedDrafts = await readFileFromDirHandle(dirHandle, 'static-writer/drafts.json', 'json');
      } catch (e) {}
    }

    if (!Array.isArray(loadedDrafts)) {
      loadedDrafts = [];
    }

    // Reconcile per-post and per-page folders (blog/{published,drafts,hidden} & pages/{published,drafts,hidden})
    // so user-edited post/page data files are respected
    const mergeFolderDraft = (dJson, fallbackSlug, forcedType) => {
      if (!dJson || typeof dJson !== 'object') return;
      if (!dJson.slug && fallbackSlug) dJson.slug = fallbackSlug;
      const isPostId = Boolean(dJson.id && String(dJson.id).startsWith('post_'));
      if (!isPostId && (dJson.isCategoryAggregate || forcedType === 'page' || (dJson.id && String(dJson.id).startsWith('page_')))) {
        dJson.type = 'page';
      } else if (isPostId) {
        dJson.type = 'post';
      }
else {
        loadedDrafts.push(dJson);
      }
    };

    const scanTierFolder = async (basePath, expectedType) => {
      try {
        const entries = await listSubfolderEntries(dirHandle, basePath);
        if (!Array.isArray(entries) || entries.length === 0) return;
        await Promise.all(entries.map(async (entry) => {
          if (entry.kind === 'directory' && !['drafts', 'published', 'hidden', 'images', 'media', 'rss'].includes(entry.name)) {
            const slug = entry.name;
            try {
              const dJson = await readFileFromDirHandle(dirHandle, `${basePath}/${slug}/draft.json`, 'json');
              if (dJson) {
                mergeFolderDraft(dJson, slug, expectedType);
              } else if (!loadedDrafts.some(d => d.slug === slug)) {
                const md = await readFileFromDirHandle(dirHandle, `${basePath}/${slug}/index.md`, 'text');
                if (md && typeof window.importContent === 'function') {
                  const parsed = window.importContent(md);
                  if (parsed) {
                    parsed.slug = slug;
                    if (expectedType) parsed.type = expectedType;
                    mergeFolderDraft(parsed, slug, expectedType);
                  }
                }
              }
            } catch (err) {}
          }
        }));
      } catch (err) {}
    };

    // Parallelize folder scans for immediate fast load without the 4-second delay
    await Promise.all([
      scanTierFolder('blog/published', 'post'),
      scanTierFolder('blog/drafts', 'post'),
      scanTierFolder('blog/hidden', 'post'),
      scanTierFolder('pages/published', 'page'),
      scanTierFolder('pages/hidden', 'page'),
      scanTierFolder('blog', null),
      scanTierFolder('pages', 'page'),
      scanTierFolder('drafts', null),
      scanTierFolder('hidden', null)
    ]);

    // Reconcile disk drafts with in-memory drafts so fresh local status changes (like Revert to Draft) are not overwritten
    if (Array.isArray(loadedDrafts) && loadedDrafts.length > 0) {
      if (window.CedarStore) {
        const currentPostCount = typeof window.CedarStore.getPosts === 'function' ? window.CedarStore.getPosts().length : 0;
        if (currentPostCount === 0 && typeof window.CedarStore.hydrateFromList === 'function') {
          window.CedarStore.hydrateFromList(loadedDrafts);
        } else if (typeof window.CedarStore.reconcileDiskDrafts === 'function') {
          window.CedarStore.reconcileDiskDrafts(loadedDrafts);
        }
        loadedDrafts = window.CedarStore.getAllDrafts();
      }
      window.drafts = loadedDrafts;
      if (!window.currentDraft && loadedDrafts.length > 0) {
        window.currentDraft = loadedDrafts[0];
      }
    }

    // Hydrate binary images from the connected folder into memory (imageRegistry, authors, mediaLibrary, drafts) and Virtual Storage
    try {
      await hydrateImagesFromFolder(dirHandle);
    } catch (imgHydrateErr) {
      console.warn('[Vault] Image hydration notice:', imgHydrateErr);
    }

    if (Array.isArray(loadedDrafts) && loadedDrafts.length > 0) {
      const draftsKey = window.STORAGE_KEY_DRAFTS || 'sheesh_static_writer_drafts_v2';
      try {
        localStorage.setItem(draftsKey, JSON.stringify(loadedDrafts));
      } catch (qErr) {}
      if (typeof window.saveDraftsToStorage === 'function') {
        window.saveDraftsToStorage();
      }
    }

    // Refresh views and active editor canvas
    if (typeof window.hydrateCanvasImages === 'function') {
      const canvasProse = document.getElementById('rich-canvas-prose');
      if (canvasProse) window.hydrateCanvasImages(canvasProse, window.currentDraft);
    }
    if (typeof window.updateCoverPreview === 'function') window.updateCoverPreview();
    if (typeof window.updateCedarTitle === 'function') window.updateCedarTitle(); else if (typeof window.updateOutpostTitle === 'function') window.updateOutpostTitle();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
    if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
    if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
    if (typeof window.renderDerivedMediaLibrary === 'function') window.renderDerivedMediaLibrary();
    if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
    if (typeof window.renderProjectSettings === 'function') window.renderProjectSettings();
    if (typeof window.renderTaxonomy === 'function') window.renderTaxonomy();
    if (typeof window.renderSettingsAuthorProfile === 'function') window.renderSettingsAuthorProfile();
    if (typeof window.renderDesigner === 'function') window.renderDesigner();
    if (typeof window.updateAllPreviewFrames === 'function') window.updateAllPreviewFrames();

    return true;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      if (!blob || !(blob instanceof Blob)) return resolve('');
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }

  function applyHydratedImageMap(hydratedMap) {
    if (!hydratedMap || hydratedMap.size === 0) return false;
    window.imageRegistry = window.imageRegistry || new Map();
    let configChanged = false;
    let draftsChanged = false;

    for (const [cleanName, info] of hydratedMap.entries()) {
      const regEntry = {
        filename: cleanName,
        relativePath: info.relPath.startsWith('/') ? info.relPath : '/' + info.relPath,
        blob: info.blob,
        objectUrl: info.objectUrl,
        dataUrl: info.dataUrl,
        src: info.dataUrl || info.objectUrl
      };
      const keys = [
        cleanName,
        info.relPath,
        '/' + info.relPath.replace(/^\/+/, ''),
        `blog/images/${cleanName}`,
        `/blog/images/${cleanName}`,
        `images/${cleanName}`,
        `/images/${cleanName}`,
        `media/${cleanName}`,
        `media/authors/${cleanName}`,
        `media/branding/${cleanName}`
      ];
      keys.forEach(k => {
        if (k) window.imageRegistry.set(k, regEntry);
      });
    }

    // 1. Reconcile Author Avatars & Branding in window.projectConfig
    const cfg = window.projectConfig;
    if (cfg && typeof cfg === 'object') {
      if (Array.isArray(cfg.authors)) {
        cfg.authors.forEach(auth => {
          if (!auth || typeof auth !== 'object' || !auth.avatar) return;
          if (!auth.avatar.startsWith('data:')) {
            const base = String(auth.avatar).split('/').pop().split('\\').pop();
            const found = hydratedMap.get(base) || hydratedMap.get(base.toLowerCase());
            if (found && found.dataUrl) {
              auth.avatarFile = auth.avatar;
              auth.avatar = found.dataUrl;
              configChanged = true;
            }
          }
        });
      }
      if (cfg.authorAvatar && typeof cfg.authorAvatar === 'string' && !cfg.authorAvatar.startsWith('data:')) {
        const base = cfg.authorAvatar.split('/').pop().split('\\').pop();
        const found = hydratedMap.get(base) || hydratedMap.get(base.toLowerCase());
        if (found && found.dataUrl) {
          cfg.authorAvatar = found.dataUrl;
          configChanged = true;
        }
      }
      if (Array.isArray(cfg.mediaLibrary)) {
        cfg.mediaLibrary.forEach(m => {
          if (!m || !m.filename) return;
          const base = String(m.filename).split('/').pop().split('\\').pop();
          const found = hydratedMap.get(base) || hydratedMap.get(base.toLowerCase());
          if (found) {
            m.blob = found.blob;
            m.objectUrl = found.objectUrl;
            m.dataUrl = found.dataUrl || found.objectUrl;
            m.src = found.dataUrl || found.objectUrl;
          }
        });
      }
    }

    // 2. Reconcile Draft Images in window.drafts & CedarStore
    const allDrafts = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
      ? window.CedarStore.getAllDrafts()
      : (Array.isArray(window.drafts) ? window.drafts : []);
    allDrafts.forEach(d => {
      if (!d) return;
      if (Array.isArray(d.images)) {
        d.images.forEach(im => {
          if (!im) return;
          const fn = typeof im === 'string' ? im : (im.filename || im.relativePath || im.src || '');
          const base = String(fn).split('/').pop().split('\\').pop();
          const found = hydratedMap.get(base) || hydratedMap.get(base.toLowerCase());
          if (found && typeof im === 'object') {
            im.blob = found.blob;
            im.objectUrl = found.objectUrl;
            im.dataUrl = found.dataUrl || found.objectUrl;
            im.src = found.dataUrl || found.objectUrl;
            draftsChanged = true;
          }
        });
      }
    });

    if (configChanged && typeof window.saveProjectToStorage === 'function') {
      try { window.saveProjectToStorage(); } catch (e) {}
    }
    return configChanged || draftsChanged;
  }

  async function hydrateImagesFromFolder(dirHandle) {
    if (!dirHandle) return;
    const isImgFile = (name) => /\.(webp|jpg|jpeg|png|gif|svg|ico|avif)$/i.test(String(name || ''));
    const candidateDirs = new Set([
      'images',
      'blog/images',
      'media',
      'media/authors',
      'media/branding'
    ]);

    const allDrafts = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
      ? window.CedarStore.getAllDrafts()
      : (Array.isArray(window.drafts) ? window.drafts : []);
    allDrafts.forEach(d => {
      if (d && d.slug) {
        const s = d.slug;
        if (d.type === 'page') {
          candidateDirs.add(`pages/published/${s}`);
          candidateDirs.add(`pages/hidden/${s}`);
        } else {
          candidateDirs.add(`blog/published/${s}`);
          candidateDirs.add(`blog/drafts/${s}`);
          candidateDirs.add(`blog/hidden/${s}`);
        }
      }
    });

    const filePathsToRead = [];
    const seenFilenames = new Set();

    await Promise.all(Array.from(candidateDirs).map(async (subDir) => {
      try {
        const entries = await listSubfolderEntries(dirHandle, subDir);
        if (!Array.isArray(entries)) return;
        for (const entry of entries) {
          if (entry.kind === 'file' && isImgFile(entry.name)) {
            const key = entry.name.toLowerCase();
            if (!seenFilenames.has(key)) {
              seenFilenames.add(key);
              filePathsToRead.push({ name: entry.name, relPath: `${subDir}/${entry.name}` });
            }
          }
        }
      } catch (e) {}
    }));

    if (filePathsToRead.length === 0) return;

    const hydratedMap = new Map();
    const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;

    await Promise.all(filePathsToRead.map(async ({ name, relPath }) => {
      try {
        const blob = await readFileFromDirHandle(dirHandle, relPath, 'blob');
        if (!blob || !(blob instanceof Blob) || blob.size === 0) return;
        const objectUrl = URL.createObjectURL(blob);
        const dataUrl = await blobToDataUrl(blob);
        const info = { filename: name, relPath, blob, objectUrl, dataUrl };
        hydratedMap.set(name, info);
        hydratedMap.set(name.toLowerCase(), info);

        if (vStorage && typeof vStorage.writeBlob === 'function') {
          try {
            await vStorage.writeBlob(`blog/images/${name}`, blob);
            await vStorage.writeBlob(relPath, blob);
          } catch (e) {}
        }
      } catch (e) {}
    }));

    applyHydratedImageMap(hydratedMap);
  }

  async function hydrateImagesFromVirtualStorage() {
    const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
    if (!vStorage || typeof vStorage.listFiles !== 'function' || typeof vStorage.readFile !== 'function') return false;

    const isImgFile = (name) => /\.(webp|jpg|jpeg|png|gif|svg|ico|avif)$/i.test(String(name || ''));
    let allFiles = [];
    try {
      allFiles = await vStorage.listFiles('', true);
    } catch (e) {
      return false;
    }
    if (!Array.isArray(allFiles) || allFiles.length === 0) return false;

    const imgFiles = [];
    const seenFilenames = new Set();
    for (const f of allFiles) {
      if (!f || f.kind === 'directory') continue;
      const name = f.name || String(f.path || '').split('/').pop();
      if (name && isImgFile(name)) {
        const key = name.toLowerCase();
        if (!seenFilenames.has(key)) {
          seenFilenames.add(key);
          imgFiles.push({ name, relPath: f.path || `blog/images/${name}` });
        }
      }
    }
    if (imgFiles.length === 0) return false;

    const hydratedMap = new Map();
    await Promise.all(imgFiles.map(async ({ name, relPath }) => {
      try {
        // Skip if already in imageRegistry with a valid dataUrl
        if (window.imageRegistry && window.imageRegistry.has(name)) {
          const existing = window.imageRegistry.get(name);
          if (existing && existing.dataUrl && existing.dataUrl.startsWith('data:')) return;
        }
        const blob = await vStorage.readFile(relPath, 'blob');
        if (!blob || !(blob instanceof Blob) || blob.size === 0) return;
        const objectUrl = URL.createObjectURL(blob);
        const dataUrl = await blobToDataUrl(blob);
        const info = { filename: name, relPath, blob, objectUrl, dataUrl };
        hydratedMap.set(name, info);
        hydratedMap.set(name.toLowerCase(), info);
      } catch (e) {}
    }));

    if (hydratedMap.size === 0) return false;
    const changed = applyHydratedImageMap(hydratedMap);
    if (changed) {
      if (typeof window.hydrateCanvasImages === 'function') {
        const canvasProse = document.getElementById('rich-canvas-prose');
        if (canvasProse) window.hydrateCanvasImages(canvasProse, window.currentDraft);
      }
      if (typeof window.updateCoverPreview === 'function') window.updateCoverPreview();
      if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
      if (typeof window.renderDerivedMediaLibrary === 'function') window.renderDerivedMediaLibrary();
    }
    return changed;
  }

  async function resolveVisiblePath() {
    if (rootHandle && rootHandle.isServerBridge && rootHandle.path) {
      return rootHandle.path;
    }
    const folderName = rootHandle ? rootHandle.name : '';
    let savedPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || window.projectConfig?.vaultPath || '').trim();

    if (savedPath) {
      return savedPath;
    }

    if (folderName) {
      try {
        const res = await fetch(`/api/vault-path?folder=${encodeURIComponent(folderName)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.defaultPath) {
            localStorage.setItem('cedar_vault_path', data.defaultPath);
            if (window.projectConfig) window.projectConfig.vaultPath = data.defaultPath;
            return data.defaultPath;
          }
        }
      } catch (e) {}
    }

    return savedPath || folderName || 'In-Browser Storage (No Local Folder Linked)';
  }

  async function writeVaultFile(path, data) {
    if (rootHandle) {
      await writeFileToDirHandle(rootHandle, path, data);
    }

    // Mirror to High-Capacity Virtual Vault (OPFS / IndexedDB)
    if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile === 'function') {
      try {
        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile(path, data);
      } catch (err) {
        console.warn('[Vault] Virtual Vault mirror write warning:', err);
      }
    }

    if (!rootHandle && !(window.CedarVirtualStorage || window.OutpostVirtualStorage)) {
      throw new Error('Vault is not connected.');
    }
    return true;
  }

  async function readVaultFile(path, as = 'text') {
    if (rootHandle) {
      if (rootHandle.isServerBridge) {
        return await readFileFromDirHandle(rootHandle, path, as);
      }
      try {
        const fileHandle = await resolvePathHandle(path, false, 'file');
        const file = await fileHandle.getFile();
        if (as === 'json') {
          const text = await file.text();
          return JSON.parse(text);
        } else if (as === 'blob') {
          return file;
        } else if (as === 'arrayBuffer' || as === 'arraybuffer') {
          return await file.arrayBuffer();
        } else {
          return await file.text();
        }
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e;
      }
    }

    // Fall back to High-Capacity Virtual Vault (OPFS / IndexedDB)
    if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).readFile === 'function') {
      try {
        return await (window.CedarVirtualStorage || window.OutpostVirtualStorage).readFile(path, as.toLowerCase());
      } catch (e) {
        return null;
      }
    }

    if (!rootHandle) throw new Error('Vault is not connected.');
    return null;
  }

  async function listVaultDirectory(dirPath = '', recursive = false) {
    const results = [];
    const seenPaths = new Set();

    if (rootHandle) {
      if (rootHandle.isServerBridge && rootHandle.path) {
        async function scanBridge(currentPath) {
          const items = await listSubfolderEntries(rootHandle, currentPath);
          for (const item of items) {
            const entryPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            results.push({
              name: item.name,
              kind: item.kind,
              path: entryPath
            });
            seenPaths.add(entryPath);
            if (recursive && item.kind === 'directory') {
              await scanBridge(entryPath);
            }
          }
        }
        await scanBridge(dirPath.replace(/^\/+|\/+$/g, ''));
      } else {
        try {
          let targetHandle = rootHandle;
          if (dirPath && dirPath !== '.' && dirPath !== '/') {
            targetHandle = await resolvePathHandle(dirPath, false, 'directory');
          }

          async function scan(handle, currentPath) {
            for await (const [name, entry] of handle.entries()) {
              const entryPath = currentPath ? `${currentPath}/${name}` : name;
              results.push({
                name,
                kind: entry.kind,
                path: entryPath
              });
              seenPaths.add(entryPath);
              if (recursive && entry.kind === 'directory') {
                await scan(entry, entryPath);
              }
            }
          }

          await scan(targetHandle, dirPath.replace(/^\/+|\/+$/g, ''));
        } catch (e) {
          if (e.name !== 'NotFoundError') {
            console.warn('[Vault] listDirectory error:', e);
          }
        }
      }
    }

    // Also include files from Virtual Vault
    if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).listFiles === 'function') {
      try {
        const vFiles = await (window.CedarVirtualStorage || window.OutpostVirtualStorage).listFiles(dirPath, recursive);
        vFiles.forEach(vf => {
          if (!seenPaths.has(vf.path)) {
            seenPaths.add(vf.path);
            results.push(vf);
          }
        });
      } catch (e) {}
    }

    return results;
  }

  async function deleteVaultFile(path) {
    if (!rootHandle) return false;
    return await removeDirEntry(rootHandle, path);
  }

  // Ensures standard folder layout: editor/, writer/, blog/{drafts,published,hidden}/, pages/{published,hidden}/, media/, backups/, vault.json
  async function ensureVaultStructure() {
    if (!rootHandle) return;
    try {
      if (!rootHandle.isServerBridge) {
        await rootHandle.getDirectoryHandle('editor', { create: true });
        await rootHandle.getDirectoryHandle('writer', { create: true });

        const blogDir = await rootHandle.getDirectoryHandle('blog', { create: true });
        await blogDir.getDirectoryHandle('drafts', { create: true });
        await blogDir.getDirectoryHandle('published', { create: true });
        await blogDir.getDirectoryHandle('hidden', { create: true });

        const pagesDir = await rootHandle.getDirectoryHandle('pages', { create: true });
        await pagesDir.getDirectoryHandle('published', { create: true });
        await pagesDir.getDirectoryHandle('hidden', { create: true });
        try { await pagesDir.removeEntry('drafts', { recursive: true }); } catch (e) {}

        const mediaDir = await rootHandle.getDirectoryHandle('media', { create: true });
        mediaDir.getDirectoryHandle('branding', { create: true });
        mediaDir.getDirectoryHandle('authors', { create: true });

        await rootHandle.getDirectoryHandle('backups', { create: true });
      } else {
        await removeDirEntry(rootHandle, 'pages/drafts');
      }

      // Ensure .cfignore exists
      try {
        const hasCf = await readFileFromDirHandle(rootHandle, '.cfignore', 'text');
        if (!hasCf || !hasCf.includes('editor/')) {
          const cfIgnore = [
            '# Cedar Cloudflare Guardrails - Do NOT deploy internal, draft, or hidden assets',
            'editor/',
            'writer/',
            'static-writer/',
            'blog/drafts/',
            'blog/hidden/',
            'pages/hidden/',
            'drafts/',
            'hidden/',
            'backups/',
            'notes/',
            '*.draft.*',
            '**/draft.json',
            'drafts.json',
            'vault.json',
            'notes.json',
            'sync.json',
            '_authors_archive/',
            '_designer_archive/',
            '_legacy_archive/',
            '_notes_archive/',
            '__pycache__/'
          ].join('\n') + '\n';
          await writeFileToDirHandle(rootHandle, '.cfignore', cfIgnore);
        }
      } catch (e) {}

      // Read or create vault.json
      let meta = await readVaultFile(METADATA_FILE, 'json');
      if (!meta) {
        meta = {
          name: rootHandle.name || 'Cedar Vault',
          createdAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          version: '1.0',
          site: 'Cedar'
        };
        await writeVaultFile(METADATA_FILE, meta);
      } else {
        meta.lastSyncedAt = new Date().toISOString();
        await writeVaultFile(METADATA_FILE, meta);
      }
      vaultInfo = meta;
    } catch (e) {
      console.warn('[Vault] ensureVaultStructure notice:', e);
    }
  }

  // =========================================================================
  // PUBLIC VAULT API
  // =========================================================================
  const Vault = {
    isSupported() {
      const hasFsa = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
      const isLocalHost = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:'
      );
      return hasFsa || isLocalHost;
    },

    isNativeFsaSupported() {
      return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    },

    isConnected() {
      return rootHandle !== null;
    },

    getFolderName() {
      return rootHandle ? rootHandle.name : null;
    },

    getRootHandle() {
      return rootHandle;
    },

    createServerBridgeHandle,

    async setRootHandle(handle) {
      rootHandle = handle;
      if (handle) {
        localStorage.removeItem('cedar_vault_disconnected'); try { localStorage.removeItem('outpost_vault_disconnected'); } catch(e){}
        if (handle.isServerBridge) {
          localStorage.setItem('cedar_vault_mode', 'server_bridge');
          localStorage.setItem('cedar_vault_path', handle.path);
          localStorage.setItem('cedar_vault_name', handle.name);
          localStorage.setItem('cedar_vault_connected', '1');
        } else {
          localStorage.removeItem('cedar_vault_mode'); try { localStorage.removeItem('outpost_vault_mode'); } catch(e){}
          if (handle.name) localStorage.setItem('cedar_vault_name', handle.name);
          localStorage.setItem('cedar_vault_connected', '1');
          await saveHandleToDb(handle);
        }
        await ensureVaultStructure();
        this.emit('connected', { name: handle.name, info: vaultInfo });
      } else {
        vaultInfo = null;
        try {
          localStorage.setItem('cedar_vault_disconnected', '1');
          try { localStorage.setItem('outpost_vault_disconnected', '1'); } catch(e){}
          localStorage.removeItem('cedar_vault_connected');
          localStorage.removeItem('cedar_vault_path');
          localStorage.removeItem('cedar_vault_name');
          localStorage.removeItem('cedar_vault_mode');
          localStorage.removeItem('outpost_vault_connected');
          localStorage.removeItem('outpost_vault_path');
          localStorage.removeItem('outpost_vault_name');
          localStorage.removeItem('outpost_vault_mode');
        } catch (e) {}
        await removeHandleFromDb();
        this.emit('disconnected');
      }
      updateAllVaultBadges();
      return rootHandle;
    },

    async verifyPermission(fileHandle, readWrite = true) {
      if (fileHandle && fileHandle.isServerBridge) return true;
      return await verifyPermission(fileHandle, readWrite);
    },

    resolvePathOnHandle,
    writeFileToDirHandle,
    readFileFromDirHandle,
    isExistingCedarFolder,
    isExistingOutpostFolder,
    copyBlogToFolder,
    loadBlogFromFolder,
    resolveVisiblePath,
    removeHandleFromDb,

    getVaultInfo() {
      return vaultInfo;
    },

    async connect() {
      if (!this.isSupported()) {
        throw new Error('Native folder sync is not supported in this environment.');
      }

      if (this.isNativeFsaSupported()) {
        try {
          let handle;
          try {
            handle = await window.showDirectoryPicker({
              mode: 'readwrite',
              startIn: 'documents'
            });
          } catch (pickerErr) {
            if (pickerErr && pickerErr.name === 'AbortError') throw pickerErr;
            handle = await window.showDirectoryPicker({
              mode: 'readwrite'
            });
          }

          const hasPerm = await verifyPermission(handle, true);
          if (!hasPerm) {
            throw new Error('Permission to access directory was denied.');
          }

          rootHandle = handle;
          localStorage.removeItem('cedar_vault_disconnected'); try { localStorage.removeItem('outpost_vault_disconnected'); } catch(e){}
          if (handle && handle.name) localStorage.setItem('cedar_vault_name', handle.name);
          localStorage.setItem('cedar_vault_connected', '1');
          await saveHandleToDb(handle);
          await ensureVaultStructure();
          this.emit('connected', { name: handle.name, info: vaultInfo });
          updateAllVaultBadges();
          return handle;
        } catch (err) {
          if (err.name === 'AbortError') return null; // User cancelled
          console.error('[Vault] Connection failed:', err);
          throw err;
        }
      } else {
        // Fallback for Firefox and non-FSA environments
        if (((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)) && typeof window.Outpost.vaultSync.openServerBridgeModal === 'function') {
          ((window.Cedar.vaultSync) || (window.Outpost.vaultSync)).openServerBridgeModal('initial');
          return null;
        }
      }
    },

    async reconnectIfPossible() {
      const isExplicitlyDisconnected = localStorage.getItem('cedar_vault_disconnected') === '1';
      if (isExplicitlyDisconnected) return false;

      // 1. Try Native FSA if handle is in DB and permission is still granted
      if (this.isNativeFsaSupported()) {
        try {
          const savedHandle = await getHandleFromDb();
          if (savedHandle) {
            const hasPerm = await verifyPermission(savedHandle, true);
            if (hasPerm) {
              rootHandle = savedHandle;
              await ensureVaultStructure();
              await loadBlogFromFolder(rootHandle);
              localStorage.setItem('cedar_vault_connected', '1');
              localStorage.setItem('cedar_vault_name', savedHandle.name);
              this.emit('connected', { name: savedHandle.name, info: vaultInfo });
              updateAllVaultBadges();
              return true;
            } else {
              // Permission requires a user gesture (e.g. after browser restart); unlock automatically on first interaction
              updateAllVaultBadges('needs-permission');
              if (!window.__cedarAutoUnlockBound) {
                window.__cedarAutoUnlockBound = true;
                const unlockOnGesture = async () => {
                  window.removeEventListener('pointerdown', unlockOnGesture, true);
                  window.removeEventListener('keydown', unlockOnGesture, true);
                  window.__cedarAutoUnlockBound = false;
                  try {
                    await Vault.requestSavedPermission();
                  } catch (e) {}
                };
                window.addEventListener('pointerdown', unlockOnGesture, { capture: true, once: true });
                window.addEventListener('keydown', unlockOnGesture, { capture: true, once: true });
              }
            }
          }
        } catch (e) {
          console.warn('[Vault] Auto-reconnect native FSA failed:', e);
        }
      }

      // 2. Check stored external user Vault path (never use the Cedar application directory itself)
      let savedPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || window.projectConfig?.vaultPath || '').trim();
      if (savedPath && /[\\/]website[\\/]cedar[\\/]?$/i.test(savedPath)) {
        savedPath = '';
        localStorage.removeItem('cedar_vault_path');
        try { localStorage.removeItem('outpost_vault_path'); } catch (e) {}
        if (window.projectConfig) delete window.projectConfig.vaultPath;
      }
      let isConn = (localStorage.getItem('cedar_vault_connected') || localStorage.getItem('outpost_vault_connected')) === '1' || Boolean(savedPath);

      if ((isConn || savedPath) && savedPath) {
        const savedName = (localStorage.getItem('cedar_vault_name') || localStorage.getItem('outpost_vault_name')) || savedPath.split(/[\\/]/).filter(Boolean).pop() || 'Vault';
        rootHandle = createServerBridgeHandle(savedPath, savedName);
        await ensureVaultStructure();
        await loadBlogFromFolder(rootHandle);
        localStorage.setItem('cedar_vault_connected', '1');
        localStorage.setItem('cedar_vault_path', savedPath);
        localStorage.setItem('cedar_vault_name', savedName);
        this.emit('connected', { name: rootHandle.name, info: vaultInfo });
        updateAllVaultBadges();
        return true;
      }

      return false;
    },

    async requestSavedPermission() {
      const savedHandle = await getHandleFromDb();
      if (savedHandle) {
        const hasPerm = await verifyPermission(savedHandle, true);
        if (hasPerm) {
          rootHandle = savedHandle;
          await ensureVaultStructure();
          await loadBlogFromFolder(rootHandle);
          localStorage.setItem('cedar_vault_connected', '1');
          localStorage.setItem('cedar_vault_name', savedHandle.name);
          this.emit('connected', { name: savedHandle.name, info: vaultInfo });
          updateAllVaultBadges();
          return true;
        }
      }
      return false;
    },

    async disconnect() {
      rootHandle = null;
      vaultInfo = null;
      await removeHandleFromDb();
      try {
        localStorage.setItem('cedar_vault_disconnected', '1');
        try { localStorage.setItem('outpost_vault_disconnected', '1'); } catch (e) {}
        localStorage.removeItem('cedar_vault_connected');
        localStorage.removeItem('cedar_vault_path');
        localStorage.removeItem('cedar_vault_name');
        localStorage.removeItem('cedar_vault_mode');
        localStorage.removeItem('outpost_vault_connected');
        localStorage.removeItem('outpost_vault_path');
        localStorage.removeItem('outpost_vault_name');
        localStorage.removeItem('outpost_vault_mode');
      } catch (e) {}
      this.emit('disconnected');
      updateAllVaultBadges();
    },

    async readFile(path, as = 'text') {
      return await readVaultFile(path, as);
    },

    async writeFile(path, data) {
      const res = await writeVaultFile(path, data);
      this.emit('file-written', { path });
      return res;
    },

    async deleteFile(path) {
      const res = await deleteVaultFile(path);
      this.emit('file-deleted', { path });
      return res;
    },

    async listFiles(dirPath = '', recursive = false) {
      return await listVaultDirectory(dirPath, recursive);
    },

    async exportZip() {
      const filesToZip = [];

      if (rootHandle) {
        // Collect all files from the live folder recursively
        const allEntries = await listVaultDirectory('', true);
        for (const entry of allEntries) {
          if (entry.kind === 'file') {
            try {
              const data = await readVaultFile(entry.path, 'blob');
              if (data) {
                filesToZip.push({ name: entry.path, data });
              }
            } catch (e) {
              console.warn('[Vault] Skip file on export:', entry.path, e);
            }
          }
        }
      } else {
        // Fallback: bundle local browser storage (drafts, settings) into zip
        const drafts = localStorage.getItem('sheesh_static_writer_drafts_v2') || localStorage.getItem('sheesh_static_writer_drafts') || '[]';
        filesToZip.push({
          name: 'editor/drafts.json',
          data: drafts
        });
        filesToZip.push({
          name: 'writer/drafts.json',
          data: drafts
        });
        const projectRaw = localStorage.getItem('sheesh_static_writer_project_v1');
        if (projectRaw) {
          try {
            const pObj = JSON.parse(projectRaw);
            pObj.schemaVersion = pObj.schemaVersion || 150;
            pObj.buildToken = pObj.buildToken || 'v150';
            filesToZip.push({
              name: 'config.json',
              data: JSON.stringify(pObj, null, 2)
            });
          } catch (e) {
            filesToZip.push({ name: 'config.json', data: projectRaw });
          }
        }
        filesToZip.push({
          name: 'vault.json',
          data: JSON.stringify({
            name: 'Browser Local Vault',
            exportedAt: new Date().toISOString(),
            source: 'Cedar High-Capacity Virtual Vault'
          }, null, 2)
        });

        // Collect all assets and files stored in High-Capacity Virtual Vault (OPFS/IndexedDB)
        if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).listFiles === 'function') {
          try {
            const vEntries = await (window.CedarVirtualStorage || window.OutpostVirtualStorage).listFiles('', true);
            for (const ve of vEntries) {
              if (ve.kind === 'file') {
                if (ve.path === 'editor/drafts.json' || ve.path === 'writer/drafts.json' || ve.path === 'static-writer/drafts.json' || ve.path === 'config.json' || ve.path === 'vault.json') {
                  continue;
                }
                try {
                  const blob = await (window.CedarVirtualStorage || window.OutpostVirtualStorage).readBlob(ve.path);
                  if (blob) {
                    filesToZip.push({ name: ve.path, data: blob });
                  }
                } catch (e) {}
              }
            }
          } catch (e) {
            console.warn('[Vault] Error collecting virtual files for export:', e);
          }
        }
      }

      if (filesToZip.length === 0) {
        filesToZip.push({
          name: 'vault.json',
          data: JSON.stringify({ name: 'Empty Vault', createdAt: new Date().toISOString() }, null, 2)
        });
      }

      const zipBytes = await createZipArchive(filesToZip);
      return new Blob([zipBytes], { type: 'application/zip' });
    },

    parseZipArchive,
    createZipArchive,

    async importZip(fileOrBlob) {
      const arrayBuf = await fileOrBlob.arrayBuffer();
      const extractedFiles = await parseZipArchive(arrayBuf);

      let importedCount = 0;
      for (const file of extractedFiles) {
        const targetFileName = file.name.replace(/^static-writer\//, 'editor/').replace(/^writer\//, 'editor/');
        if (rootHandle) {
          await writeVaultFile(targetFileName, file.data);
          importedCount++;
        }

        // Sync drafts to browser localStorage
        if (file.name.includes('drafts.json')) {
          const text = new TextDecoder().decode(file.data);
          localStorage.setItem('sheesh_static_writer_drafts_v2', text);
          if (!rootHandle) importedCount++;
        }

        // Sync project configuration to browser localStorage
        if (file.name === 'config.json' || file.name.endsWith('/config.json')) {
          const text = new TextDecoder().decode(file.data);
          try {
            const cfg = JSON.parse(text);
            localStorage.setItem('sheesh_static_writer_project_v1', text);
            if (cfg.domain) {
              localStorage.setItem('cedar_user_domain', cfg.domain);
            }
            if (!rootHandle) importedCount++;
          } catch (e) {
            console.warn('[Vault] Failed to parse config.json during import:', e);
          }
        }
      }

      this.emit('imported', { count: importedCount, total: extractedFiles.length });
      return importedCount;
    },

    // Event Bus
    on(event, callback) {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(callback);
    },

    off(event, callback) {
      if (!eventListeners.has(event)) return;
      const list = eventListeners.get(event).filter(cb => cb !== callback);
      eventListeners.set(event, list);
    },

    emit(event, data) {
      if (eventListeners.has(event)) {
        eventListeners.get(event).forEach(cb => {
          try {
            cb(data);
          } catch (e) {
            console.error(`[Vault] Event error (${event}):`, e);
          }
        });
      }
      // Also dispatch DOM CustomEvent
      window.dispatchEvent(new CustomEvent(`sheesh-vault:${event}`, { detail: data }));
    }
  };

  // =========================================================================
  // SITE-WIDE UI INJECTION (Header Badge & Control Modal)
  // =========================================================================

  function updateAllVaultBadges(statusOverride) {
    const isConnected = Vault.isConnected();
    const folderName = Vault.getFolderName();
    const badges = document.querySelectorAll('.vault-header-btn, #btn-vault-status, [data-vault-badge]');

    badges.forEach(badge => {
      const label = badge.querySelector('.vault-label') || badge.querySelector('span:not(.vault-dot)') || badge;

      if (statusOverride === 'needs-permission') {
        badge.classList.remove('connected');
        badge.classList.add('needs-permission');
        if (label && label !== badge) label.textContent = 'Unlock Storage';
        badge.title = 'Click to reconnect your saved local folder';
      } else if (isConnected) {
        badge.classList.add('connected');
        badge.classList.remove('needs-permission');
        if (label && label !== badge) label.textContent = folderName ? `Storage: ${folderName}` : 'Storage: Connected';
        badge.title = `Connected to local hard drive folder: ${folderName}`;
      } else {
        badge.classList.remove('connected', 'needs-permission');
        if (label && label !== badge) label.textContent = 'Connect Storage';
        badge.title = 'Connect a local folder or portable hard drive to sync your data';
      }
    });

    // Also update modal UI if open
    updateModalStats();

    // Notify app of vault status changes
    try {
      window.dispatchEvent(new CustomEvent('sheesh-vault-status-changed'));
    } catch (e) {}

    try {
      if (((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)) && typeof window.Outpost.vaultSync.updateSyncStatusUI === 'function') {
        ((window.Cedar.vaultSync) || (window.Outpost.vaultSync)).updateSyncStatusUI();
      }
    } catch (e) {}
  }

  async function updateModalStats() {
    const modal = document.getElementById('modal-vault-manager');
    if (!modal || modal.style.display === 'none') return;

    const statusTitle = document.getElementById('vault-modal-status-title');
    const folderPathText = document.getElementById('vault-modal-folder-name');
    const btnConnect = document.getElementById('btn-vault-modal-connect');
    const btnDisconnect = document.getElementById('btn-vault-modal-disconnect');
    const filesList = document.getElementById('vault-modal-file-list');
    const storageNotice = document.getElementById('vault-modal-storage-notice');

    if (Vault.isConnected()) {
      const folderName = Vault.getFolderName();
      if (statusTitle) statusTitle.innerHTML = `<span class="vault-dot connected"></span> Connected to Hard Drive`;
      if (folderPathText) folderPathText.textContent = `📁 ${folderName} (Active Read/Write Sync)`;
      if (btnConnect) btnConnect.textContent = 'Switch Folder';
      if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
      if (storageNotice) storageNotice.textContent = 'All changes auto-sync to your hard drive in real time.';

      // Load file list preview
      if (filesList) {
        filesList.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 0.5rem 0;">Scanning storage structure...</div>';
        try {
          const files = await Vault.listFiles('', true);
          if (files.length === 0) {
            filesList.innerHTML = '<div style="color: #64748b; font-size: 0.85rem;">Storage initialized. No user files stored yet.</div>';
          } else {
            let html = '<div class="vault-file-tree">';
            files.slice(0, 15).forEach(f => {
              const icon = f.kind === 'directory' ? '📁' : '📄';
              html += `<div class="vault-file-item"><span>${icon} ${escapeHtml(f.path)}</span></div>`;
            });
            if (files.length > 15) {
              html += `<div class="vault-file-item more" style="color: #94a3b8;">...and ${files.length - 15} more items</div>`;
            }
            html += '</div>';
            filesList.innerHTML = html;
          }
        } catch (e) {
          filesList.innerHTML = `<div style="color: #ef4444; font-size: 0.85rem;">Could not read folder tree: ${escapeHtml(e.message)}</div>`;
        }
      }
    } else {
      if (statusTitle) statusTitle.innerHTML = `<span class="vault-dot"></span> No Folder Linked (In-Browser Storage)`;
      if (folderPathText) folderPathText.textContent = 'No local folder linked. Data is currently stored only in browser cache.';
      if (btnConnect) btnConnect.textContent = 'Select Folder on Hard Drive';
      if (btnDisconnect) btnDisconnect.style.display = 'none';
      if (storageNotice) storageNotice.textContent = 'Link a local folder (or hard drive) to enable permanent file synchronization.';
      if (filesList) {
        filesList.innerHTML = '<div style="color: #64748b; font-size: 0.85rem; padding: 0.5rem 0;">Connect a folder to see live files on your disk.</div>';
      }
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function injectVaultModal() {
    if (document.getElementById('modal-vault-manager')) return;

    const modalHtml = `
    <div class="modal-overlay" id="modal-vault-manager" style="display: none; z-index: 10000;">
      <div class="modal-card modal-vault-card">
        <div class="modal-header">
          <div class="vault-modal-header-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <h3 class="modal-title">Sheesh Vault — Hard Drive BYOC</h3>
          </div>
          <button type="button" class="modal-close-btn" data-close-vault-modal>&times;</button>
        </div>

        <div class="modal-body vault-modal-body">
          <!-- Connection Status Box -->
          <div class="vault-status-box">
            <div class="vault-status-header">
              <h4 id="vault-modal-status-title"><span class="vault-dot"></span> No Vault Linked</h4>
              <span class="vault-badge-pill">100% Private & Serverless</span>
            </div>
            <div class="vault-folder-display" id="vault-modal-folder-name">
              No local folder linked.
            </div>
            <p class="vault-status-subtext" id="vault-modal-storage-notice">
              Link a folder on your portable hard drive or PC to synchronize all posts, drafts, and media.
            </p>
            <div class="vault-actions-row">
              <button type="button" class="btn btn-primary" id="btn-vault-modal-connect">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>Select Folder on Hard Drive</span>
              </button>
              <button type="button" class="btn btn-danger-outline" id="btn-vault-modal-disconnect" style="display: none;">
                Disconnect
              </button>
            </div>
          </div>

          <!-- Directory Contents Preview -->
          <div class="vault-section">
            <h5 class="vault-section-title">Drive Vault Explorer</h5>
            <div class="vault-file-list-wrap" id="vault-modal-file-list">
              <div style="color: #64748b; font-size: 0.85rem;">Scanning files...</div>
            </div>
          </div>

          <!-- Universal Backup & Restore (ZIP) -->
          <div class="vault-section vault-zip-section">
            <h5 class="vault-section-title">Site-Wide Backup & Migration</h5>
            <p class="vault-section-desc">Download a complete, offline ZIP archive of your vault or restore one from another device.</p>
            <div class="vault-zip-actions">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-vault-export-zip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Export Local (.ZIP)</span>
              </button>
              <label class="btn btn-secondary btn-sm" style="cursor: pointer; margin: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span>Import Vault (.ZIP)</span>
                <input type="file" id="input-vault-import-zip" accept=".zip" style="display: none;">
              </label>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-vault-modal>Close</button>
        </div>
      </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Bind Modal Events
    const modal = document.getElementById('modal-vault-manager');
    const closeBtns = modal.querySelectorAll('[data-close-vault-modal]');
    closeBtns.forEach(b => b.addEventListener('click', () => (modal.style.display = 'none')));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    const btnConnect = document.getElementById('btn-vault-modal-connect');
    if (btnConnect) {
      btnConnect.addEventListener('click', async () => {
        try {
          if (!Vault.isConnected() && (await getHandleFromDb())) {
            const reconnected = await Vault.requestSavedPermission();
            if (reconnected) {
              updateModalStats();
              return;
            }
          }
          await Vault.connect();
          updateModalStats();
        } catch (err) {
          alert('Could not connect folder: ' + err.message);
        }
      });
    }

    const btnDisconnect = document.getElementById('btn-vault-modal-disconnect');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', async () => {
        if (confirm('Disconnect this local folder from Cedar? Your files will remain safely on your hard drive.')) {
          await Vault.disconnect();
          updateModalStats();
        }
      });
    }

    const btnExportZip = document.getElementById('btn-vault-export-zip');
    if (btnExportZip) {
      btnExportZip.addEventListener('click', async () => {
        btnExportZip.disabled = true;
        btnExportZip.textContent = 'Packaging ZIP...';
        try {
          const zipBlob = await Vault.exportZip();
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sheesh-vault-backup-${new Date().toISOString().split('T')[0]}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          alert('Failed to export storage ZIP: ' + err.message);
        } finally {
          btnExportZip.disabled = false;
          btnExportZip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Export Local (.ZIP)</span>`;
        }
      });
    }

    const inputImportZip = document.getElementById('input-vault-import-zip');
    if (inputImportZip) {
      inputImportZip.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (typeof promptImportWithBackupOption === 'function') {
          promptImportWithBackupOption(file, () => {
            updateModalStats();
          });
        }
      });
    }
  }

  function openVaultModal() {
    injectVaultModal();
    const modal = document.getElementById('modal-vault-manager');
    if (modal) {
      modal.style.display = 'flex';
      updateModalStats();
    }
  }

  function bindHeaderVaultButtons() {
    const buttons = document.querySelectorAll('.vault-header-btn, #btn-vault-status, [data-open-vault]');
    buttons.forEach(btn => {
      if (btn._hasVaultClickBound) return;
      btn._hasVaultClickBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openVaultModal();
      });
    });
  }

  // =========================================================================
  // INIT ENGINE
  // =========================================================================
  let _initVaultPromise = null;
  async function initVault() {
    injectVaultModal();
    bindHeaderVaultButtons();
    if (!_initVaultPromise) {
      _initVaultPromise = (async () => {
        await Vault.reconnectIfPossible();
        try {
          await hydrateImagesFromVirtualStorage();
        } catch (e) {}
      })();
    }
    await _initVaultPromise;
    bindHeaderVaultButtons();
    updateAllVaultBadges();
  }
  Vault.init = initVault;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVault);
  } else {
    initVault();
  }

  // Export to global scope
  window.SheeshVault = Vault;
  window.initVault = initVault;
  window.openSheeshVault = openVaultModal;

})();
