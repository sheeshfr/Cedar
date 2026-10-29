/**
 * Cedar - Virtual Vault & Storage Engine (OPFS + IndexedDB Hybrid)
 * 100% Client-Side, Zero Dependencies, High-Capacity & Standalone-Ready.
 *
 * Utilizes the browser's Storage Quota API (up to 60% of available disk space,
 * tens to hundreds of gigabytes) without requiring user folder-picker dialogs.
 *
 * Tier 1: OPFS (Origin Private File System) via navigator.storage.getDirectory()
 * Tier 2: IndexedDB Object Store fallback ('outpost_virtual_vault_db')
 * Eviction Protection: navigator.storage.persist()
 */

(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  if (typeof window.Cedar.isLocalServer !== 'boolean') {
    const _host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';
    window.Cedar.isLocalServer = (
      _host === 'localhost' ||
      _host === '127.0.0.1' ||
      _host.endsWith('.local')
    );
  }

  const IDB_NAME = 'cedar_virtual_vault_db';
  const IDB_VERSION = 1;
  const STORE_FILES = 'files';
  const STORE_META = 'metadata';

  let opfsRootHandle = null;
  let idbInstance = null;
  let activeMode = 'uninitialized'; // 'opfs' | 'indexeddb' | 'memory'
  let isPersisted = false;
  const memoryFallbackStore = new Map();

  // =========================================================================
  // PERSISTENT STORAGE INITIALIZATION
  // =========================================================================
  async function requestPersistentStorage() {
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        isPersisted = await navigator.storage.persist();
        console.log(`[VirtualVault] Persistent storage status: ${isPersisted ? 'Granted' : 'Default/Prompt'}`);
      }
    } catch (e) {
      console.warn('[VirtualVault] Could not request persistent storage:', e);
    }
  }

  // =========================================================================
  // TIER 1: OPFS (Origin Private File System) ENGINE
  // =========================================================================
  async function initOPFS() {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
        const root = await navigator.storage.getDirectory();
        if (root && typeof root.getFileHandle === 'function') {
          // Perform a quick sanity write to confirm write permission in sandbox
          const testHandle = await root.getFileHandle('__cedar_probe__.tmp', { create: true });
          const writable = await testHandle.createWritable();
          await writable.write('ok');
          await writable.close();
          await root.removeEntry('__cedar_probe__.tmp');

          opfsRootHandle = root;
          activeMode = 'opfs';
          console.log('[VirtualVault] Initialized Tier 1 storage: OPFS (Origin Private File System).');
          return true;
        }
      }
    } catch (e) {
      console.warn('[VirtualVault] OPFS unavailable or restricted in this context:', e);
    }
    return false;
  }

  async function resolveOpfsHandle(path, create = false, kind = 'file') {
    if (!opfsRootHandle) throw new Error('OPFS root is not initialized.');
    const parts = path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
    if (parts.length === 0) return opfsRootHandle;

    let current = opfsRootHandle;
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

  async function opfsWriteFile(path, data) {
    const fileHandle = await resolveOpfsHandle(path, true, 'file');
    const writable = await fileHandle.createWritable();
    try {
      if (typeof data === 'string') {
        await writable.write(data);
      } else if (data instanceof Blob) {
        await writable.write(data);
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        await writable.write(data);
      } else {
        await writable.write(JSON.stringify(data, null, 2));
      }
      await writable.close();
      return true;
    } catch (err) {
      try { await writable.abort(); } catch (e) {}
      throw err;
    }
  }

  async function opfsReadFile(path, as = 'text') {
    const fileHandle = await resolveOpfsHandle(path, false, 'file');
    const file = await fileHandle.getFile();
    if (as === 'blob') return file;
    if (as === 'arraybuffer') return await file.arrayBuffer();
    if (as === 'json') {
      const txt = await file.text();
      return JSON.parse(txt);
    }
    return await file.text();
  }

  async function opfsDeleteFile(path) {
    const parts = path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
    if (parts.length === 0) return false;
    const fileName = parts.pop();
    let current = opfsRootHandle;
    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part, { create: false });
      } catch (e) {
        return false;
      }
    }
    await current.removeEntry(fileName);
    return true;
  }

  async function opfsListFiles(dirPath = '', recursive = false) {
    const results = [];
    let dirHandle = opfsRootHandle;
    if (dirPath) {
      try {
        dirHandle = await resolveOpfsHandle(dirPath, false, 'directory');
      } catch (e) {
        return [];
      }
    }

    async function scan(handle, currentPath) {
      for await (const [name, entry] of handle.entries()) {
        const itemPath = currentPath ? `${currentPath}/${name}` : name;
        if (entry.kind === 'file') {
          try {
            const f = await entry.getFile();
            results.push({
              name: name,
              path: itemPath,
              kind: 'file',
              size: f.size,
              lastModified: f.lastModified,
              mimeType: f.type
            });
          } catch (e) {
            results.push({ name, path: itemPath, kind: 'file' });
          }
        } else if (entry.kind === 'directory') {
          results.push({
            name: name,
            path: itemPath,
            kind: 'directory'
          });
          if (recursive) {
            await scan(entry, itemPath);
          }
        }
      }
    }

    await scan(dirHandle, dirPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
    return results;
  }

  // =========================================================================
  // TIER 2: INDEXED DB FALLBACK ENGINE
  // =========================================================================
  function openIndexedDatabase() {
    if (idbInstance) return Promise.resolve(idbInstance);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES, { keyPath: 'path' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };
      req.onsuccess = (e) => {
        idbInstance = e.target.result;
        resolve(idbInstance);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function idbWriteFile(path, data) {
    const db = await openIndexedDatabase();
    const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    let fileBlob = null;
    let mimeType = 'text/plain';

    if (data instanceof Blob) {
      fileBlob = data;
      mimeType = data.type || 'application/octet-stream';
    } else if (data instanceof ArrayBuffer) {
      fileBlob = new Blob([data]);
    } else if (data instanceof Uint8Array) {
      fileBlob = new Blob([data.buffer]);
    } else if (typeof data === 'string') {
      fileBlob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    } else {
      fileBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      mimeType = 'application/json';
    }

    const record = {
      path: cleanPath,
      name: cleanPath.split('/').pop(),
      blob: fileBlob,
      size: fileBlob.size,
      mimeType: mimeType,
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function idbReadFile(path, as = 'text') {
    const db = await openIndexedDatabase();
    const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.get(cleanPath);
      req.onsuccess = async () => {
        const item = req.result;
        if (!item || !item.blob) {
          return reject(new Error(`File not found: ${cleanPath}`));
        }
        if (as === 'blob') return resolve(item.blob);
        if (as === 'arraybuffer') return resolve(await item.blob.arrayBuffer());
        const text = await item.blob.text();
        if (as === 'json') {
          return resolve(JSON.parse(text));
        }
        resolve(text);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function idbDeleteFile(path) {
    const db = await openIndexedDatabase();
    const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const req = store.delete(cleanPath);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function idbListFiles(dirPath = '', recursive = false) {
    const db = await openIndexedDatabase();
    const cleanDir = dirPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = req.result || [];
        const matches = [];
        const seenDirs = new Set();

        records.forEach(r => {
          if (cleanDir && !r.path.startsWith(`${cleanDir}/`)) return;
          const relPath = cleanDir ? r.path.slice(cleanDir.length + 1) : r.path;
          const parts = relPath.split('/');

          if (parts.length === 1 || recursive) {
            matches.push({
              name: r.name,
              path: r.path,
              kind: 'file',
              size: r.size,
              lastModified: r.updatedAt,
              mimeType: r.mimeType
            });
          }

          if (parts.length > 1 && !recursive) {
            const immediateDir = parts[0];
            if (!seenDirs.has(immediateDir)) {
              seenDirs.add(immediateDir);
              matches.push({
                name: immediateDir,
                path: cleanDir ? `${cleanDir}/${immediateDir}` : immediateDir,
                kind: 'directory'
              });
            }
          }
        });
        resolve(matches);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // =========================================================================
  // TIER 3: IN-MEMORY FALLBACK (LAST RESORT)
  // =========================================================================
  async function memWriteFile(path, data) {
    const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    let blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data)]);
    memoryFallbackStore.set(cleanPath, {
      path: cleanPath,
      name: cleanPath.split('/').pop(),
      blob: blob,
      size: blob.size,
      updatedAt: Date.now()
    });
    return true;
  }

  async function memReadFile(path, as = 'text') {
    const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const item = memoryFallbackStore.get(cleanPath);
    if (!item) throw new Error(`File not found in memory: ${cleanPath}`);
    if (as === 'blob') return item.blob;
    if (as === 'arraybuffer') return await item.blob.arrayBuffer();
    const text = await item.blob.text();
    if (as === 'json') return JSON.parse(text);
    return text;
  }

  async function memDeleteFile(path) {
    const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    return memoryFallbackStore.delete(cleanPath);
  }

  async function memListFiles(dirPath = '', recursive = false) {
    const cleanDir = dirPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const results = [];
    for (const [path, r] of memoryFallbackStore.entries()) {
      if (cleanDir && !path.startsWith(`${cleanDir}/`)) continue;
      results.push({
        name: r.name,
        path: r.path,
        kind: 'file',
        size: r.size,
        lastModified: r.updatedAt
      });
    }
    return results;
  }

  let initPromise = null;

  function unwrapDataUrlString(input) {
    if (typeof input !== 'string') return '';
    let current = input.trim();
    let depth = 0;
    while (depth < 10 && current.startsWith('data:')) {
      const commaIdx = current.indexOf(',');
      if (commaIdx === -1) break;
      const payload = current.slice(commaIdx + 1).trim();
      // "data:" in base64 starts with "ZGF0YT" ("ZGF0YTo")
      if (!payload.startsWith('ZGF0YT')) break;
      try {
        const decoded = atob(payload.replace(/\s/g, ''));
        if (decoded && decoded.trim().startsWith('data:')) {
          current = decoded.trim();
          depth++;
          continue;
        }
      } catch (e) {}
      break;
    }
    return current;
  }

  function dataUrlStringToBlob(dataUrl) {
    const clean = unwrapDataUrlString(dataUrl);
    if (!clean || !clean.startsWith('data:')) return null;
    try {
      const commaIdx = clean.indexOf(',');
      if (commaIdx === -1) return null;
      const header = clean.slice(0, commaIdx);
      const payload = clean.slice(commaIdx + 1);
      const mimeMatch = header.match(/^data:([^;,]+)/i);
      const mime = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : 'image/png';
      if (/;base64/i.test(header)) {
        const bstr = atob(payload.replace(/\s/g, ''));
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
      } else {
        return new Blob([decodeURIComponent(payload)], { type: mime });
      }
    } catch (e) {
      return null;
    }
  }

  async function ensureBinaryImageBlob(blob) {
    if (!blob || !(blob instanceof Blob) || blob.size < 6) return { blob, repaired: false };
    try {
      const headBuf = await blob.slice(0, 16).arrayBuffer();
      const b = new Uint8Array(headBuf);
      // Check if blob bytes start with ASCII "data:" (100, 97, 116, 97, 58)
      if (b[0] === 100 && b[1] === 97 && b[2] === 116 && b[3] === 97 && b[4] === 58) {
        const txt = await blob.text();
        const repairedBlob = dataUrlStringToBlob(txt);
        if (repairedBlob && repairedBlob.size > 0) {
          return { blob: repairedBlob, repaired: true };
        }
      }
    } catch (e) {}
    return { blob, repaired: false };
  }

  window.unwrapCorruptedDataUrl = unwrapDataUrlString;
  window.Cedar.unwrapCorruptedDataUrl = unwrapDataUrlString;

  // =========================================================================
  // PUBLIC CEDAR VIRTUAL STORAGE INTERFACE
  // =========================================================================
  const CedarVirtualStorage = {
    async init() {
      if (activeMode !== 'uninitialized') return activeMode;
      if (initPromise) return await initPromise;
      initPromise = (async () => {
        await requestPersistentStorage();
        const hasOpfs = await initOPFS();
        if (hasOpfs) {
          activeMode = 'opfs';
        } else {
          try {
            await openIndexedDatabase();
            activeMode = 'indexeddb';
            console.log('[VirtualVault] Initialized Tier 2 storage: IndexedDB fallback.');
          } catch (e) {
            activeMode = 'memory';
            console.warn('[VirtualVault] IndexedDB failed, using memory fallback:', e);
          }
        }
        return activeMode;
      })();
      return await initPromise;
    },

    getMode() {
      return activeMode;
    },

    isOPFS() {
      return activeMode === 'opfs';
    },

    getOpfsRootHandle() {
      return opfsRootHandle;
    },

    async getStorageQuota() {
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
        try {
          const est = await navigator.storage.estimate();
          const quotaMB = est.quota ? Math.round(est.quota / (1024 * 1024)) : 0;
          const usageMB = est.usage ? Math.round(est.usage / (1024 * 1024)) : 0;
          const availableMB = Math.max(0, quotaMB - usageMB);
          const percentUsed = (est.quota && est.usage) ? ((est.usage / est.quota) * 100).toFixed(1) : 0;

          return {
            usageBytes: est.usage || 0,
            quotaBytes: est.quota || 0,
            usageMB,
            quotaMB,
            availableMB,
            percentUsed,
            isPersisted,
            mode: activeMode
          };
        } catch (e) {
          console.warn('[VirtualVault] Could not estimate quota:', e);
        }
      }
      return {
        usageMB: 0,
        quotaMB: 0,
        availableMB: 0,
        percentUsed: 0,
        isPersisted,
        mode: activeMode
      };
    },

    async writeFile(path, data) {
      if (activeMode === 'uninitialized') await this.init();
      let payload = data;
      const isImgPath = /\.(webp|jpg|jpeg|png|gif|svg|ico|avif)$/i.test(String(path || ''));
      if (typeof payload === 'string' && (payload.trim().startsWith('data:image/') || (isImgPath && payload.trim().startsWith('data:')))) {
        const converted = dataUrlStringToBlob(payload);
        if (converted) payload = converted;
      } else if (payload instanceof Blob && isImgPath) {
        const checked = await ensureBinaryImageBlob(payload);
        if (checked && checked.blob) payload = checked.blob;
      }
      if (activeMode === 'opfs') return await opfsWriteFile(path, payload);
      if (activeMode === 'indexeddb') return await idbWriteFile(path, payload);
      return await memWriteFile(path, payload);
    },

    async writeBlob(path, blob) {
      return await this.writeFile(path, blob);
    },

    async readFile(path, as = 'text') {
      if (activeMode === 'uninitialized') await this.init();
      let res;
      if (activeMode === 'opfs') res = await opfsReadFile(path, as);
      else if (activeMode === 'indexeddb') res = await idbReadFile(path, as);
      else res = await memReadFile(path, as);

      if (as === 'blob' && res instanceof Blob && /\.(webp|jpg|jpeg|png|gif|svg|ico|avif)$/i.test(String(path || ''))) {
        const checked = await ensureBinaryImageBlob(res);
        if (checked.repaired && checked.blob) {
          res = checked.blob;
          // Self-heal the file in storage so subsequent reads are already binary
          try {
            if (activeMode === 'opfs') await opfsWriteFile(path, res);
            else if (activeMode === 'indexeddb') await idbWriteFile(path, res);
            else await memWriteFile(path, res);
          } catch (e) {}
        }
      }
      return res;
    },

    async readBlob(path) {
      return await this.readFile(path, 'blob');
    },

    async deleteFile(path) {
      if (activeMode === 'uninitialized') await this.init();
      if (activeMode === 'opfs') return await opfsDeleteFile(path);
      if (activeMode === 'indexeddb') return await idbDeleteFile(path);
      return await memDeleteFile(path);
    },

    async listFiles(dirPath = '', recursive = false) {
      if (activeMode === 'uninitialized') await this.init();
      if (activeMode === 'opfs') return await opfsListFiles(dirPath, recursive);
      if (activeMode === 'indexeddb') return await idbListFiles(dirPath, recursive);
      return await memListFiles(dirPath, recursive);
    },

    async fileExists(path) {
      try {
        await this.readFile(path, 'blob');
        return true;
      } catch (e) {
        return false;
      }
    },

    async clear() {
      // 1. Wipe OPFS entries if available
      try {
        if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
          const root = opfsRootHandle || (await navigator.storage.getDirectory().catch(() => null));
          if (root && typeof root.entries === 'function') {
            for await (const [name] of root.entries()) {
              try {
                await root.removeEntry(name, { recursive: true });
              } catch (e) {
                console.warn('[VirtualVault] Failed to remove OPFS entry ' + name + ':', e);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[VirtualVault] OPFS clear error:', err);
      }

      // 2. Wipe IndexedDB virtual stores
      try {
        if (idbInstance) {
          try { idbInstance.close(); } catch (e) {}
          idbInstance = null;
        }
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(IDB_NAME);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        });
      } catch (err) {
        console.warn('[VirtualVault] IndexedDB delete error:', err);
      }

      // 3. Clear memory store
      memoryFallbackStore.clear();

      console.log('[VirtualVault] Virtual storage cleared completely.');
      return true;
    }
  };

  const OutpostVirtualStorage = CedarVirtualStorage;

  // Initialize immediately on script load
  OutpostVirtualStorage.init().catch(err => {
    console.warn('[VirtualVault] Auto-init error:', err);
  });

  window.CedarVirtualStorage = CedarVirtualStorage;
  window.OutpostVirtualStorage = CedarVirtualStorage;
  window.Cedar.virtualStorage = CedarVirtualStorage;
  window.Outpost.virtualStorage = CedarVirtualStorage;
})();
