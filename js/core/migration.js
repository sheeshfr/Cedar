/**
 * Cedar Static Writing Engine — Token Versioning & Migration Pipeline (v3.3.4)
 * Schema Version: 150 (Token: v150)
 * Minimum Compatible Version: 125 (Breaking Engine Rewrite Threshold)
 * Zero Dependencies, Standalone & Offline Ready
 */
(function () {
  'use strict';

  const CURRENT_SCHEMA_VERSION = 150;
  const CURRENT_BUILD_TOKEN = 'v150';
  const MIN_COMPATIBLE_VERSION = 125;

  const textDecoder = new TextDecoder('utf-8');
  const textEncoder = new TextEncoder();

  /**
   * Helper to decode text safely from Uint8Array, ArrayBuffer, or string
   */
  function decodeContent(data) {
    if (typeof data === 'string') return data;
    if (data instanceof Uint8Array) return textDecoder.decode(data);
    if (data instanceof ArrayBuffer) return textDecoder.decode(new Uint8Array(data));
    return '';
  }

  /**
   * Helper to encode content to Uint8Array
   */
  function encodeContent(str) {
    return textEncoder.encode(str);
  }

  /**
   * Inspects extracted archive files to determine site validity and token version
   * @param {Array<{name: string, data: Uint8Array|string, size?: number}>} files
   */
  function inspectArchive(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return {
        isValid: false,
        error: 'Archive contains no accessible files.',
        schemaVersion: null,
        buildToken: null
      };
    }

    // Find key Cedar manifests (prefer editor/config.json or cedar_config.json over stripped root config.json)
    const configFile = files.find(f => f.name === 'editor/config.json' || f.name.endsWith('/editor/config.json'))
      || files.find(f => f.name === 'cedar_config.json' || f.name.endsWith('/cedar_config.json'))
      || files.find(f => f.name === 'writer/config.json' || f.name.endsWith('/writer/config.json'))
      || files.find(f => f.name === 'config.json' || f.name.endsWith('/config.json'));
    const draftsFile = files.find(f =>
      f.name === 'editor/drafts.json' ||
      f.name === 'writer/drafts.json' ||
      f.name === 'static-writer/drafts.json' ||
      f.name === 'drafts.json' ||
      f.name.endsWith('/drafts.json') ||
      f.name.endsWith('/drafts_v2.json')
    );
    const vaultFile = files.find(f => f.name === 'vault.json' || f.name.endsWith('/vault.json'));

    if (!configFile && !draftsFile && !vaultFile) {
      return {
        isValid: false,
        error: 'This archive is not a valid Cedar blog archive (missing blog configuration and content manifests).',
        schemaVersion: null,
        buildToken: null
      };
    }

    let configObj = null;
    let draftsArray = [];
    let detectedTitle = 'Imported Cedar Blog';
    let detectedSubtitle = '';
    let rawSchema = null;
    let rawToken = null;

    // Parse config.json if present
    if (configFile) {
      try {
        const text = decodeContent(configFile.data);
        configObj = JSON.parse(text);
        if (configObj) {
          detectedTitle = configObj.name || configObj.siteTitle || detectedTitle;
          detectedSubtitle = configObj.subtitle || (configObj.design && configObj.design.branding && configObj.design.branding.tagline) || configObj.tagline || '';
          rawSchema = configObj.schemaVersion;
          rawToken = configObj.buildToken;
        }
      } catch (err) {
        console.warn('[Migration] Failed to parse config.json:', err);
      }
    }

    // Parse drafts.json if present
    if (draftsFile) {
      try {
        const text = decodeContent(draftsFile.data);
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          draftsArray = parsed;
        }
      } catch (err) {
        console.warn('[Migration] Failed to parse drafts.json:', err);
      }
    }

    // Determine numeric version number
    let versionNum = null;
    if (typeof rawSchema === 'number' && !isNaN(rawSchema)) {
      versionNum = rawSchema;
    } else if (rawToken) {
      const match = String(rawToken).match(/\d+/);
      if (match) versionNum = parseInt(match[0], 10);
    }

    // If version cannot be found from token/schema, infer from design structure
    if (versionNum === null) {
      if (configObj && configObj.design && configObj.design.columns === 8 && configObj.design.canvasWidth === 1920) {
        versionNum = 125; // Modern baseline
      } else {
        // Legacy Sheesh format (e.g. 4-column, 512px canvas, or pre-modular)
        versionNum = 50;
      }
    }

    const tokenLabel = rawToken || ('v' + versionNum);
    const isLegacy = versionNum < MIN_COMPATIBLE_VERSION;
    const isCompatible = versionNum >= MIN_COMPATIBLE_VERSION && versionNum <= CURRENT_SCHEMA_VERSION;
    const isNewer = versionNum > CURRENT_SCHEMA_VERSION;

    let message = '';
    if (isLegacy) {
      message = `Your token says ${tokenLabel} but we're now on version v${CURRENT_SCHEMA_VERSION}, and at change v${MIN_COMPATIBLE_VERSION}, we made a major engine rewrite (1920px canvas, 8-column layout, multi-author attribution, and modular blocks). We will automatically translate and modernize your site data during import.`;
    } else if (isCompatible) {
      message = `Archive token ${tokenLabel} is fully compatible with Cedar v${CURRENT_SCHEMA_VERSION}. Ready for direct clean import.`;
    } else {
      message = `Archive token ${tokenLabel} was created with a newer version of Cedar (current engine: v${CURRENT_SCHEMA_VERSION}). Attempting direct import.`;
    }

    return {
      isValid: true,
      error: null,
      schemaVersion: versionNum,
      buildToken: tokenLabel,
      isLegacy,
      isCompatible,
      isNewer,
      needsTranslation: isLegacy,
      message,
      configFile,
      draftsFile,
      vaultFile,
      configObj,
      draftsCount: draftsArray.length,
      siteTitle: detectedTitle,
      siteSubtitle: detectedSubtitle,
      totalFiles: files.length
    };
  }

  /**
   * Translates a legacy archive (< v125) into modern v150 structure
   * @param {Array<{name: string, data: Uint8Array|string, size?: number}>} files
   * @param {Object} inspection
   */
  function translateLegacyArchive(files, inspection) {
    const updatedFiles = [...files];

    // 1. Modernize Project Configuration
    let configObj = inspection.configObj || (typeof window.getDefaultProjectConfig === 'function' ? window.getDefaultProjectConfig() : {});
    
    // Stamp modern tokens
    configObj.schemaVersion = CURRENT_SCHEMA_VERSION;
    configObj.buildToken = CURRENT_BUILD_TOKEN;
    configObj.name = configObj.name || inspection.siteTitle || 'Cedar';
    configObj.subtitle = configObj.subtitle || inspection.siteSubtitle || '';
    configObj.description = configObj.description || 'Cedar Studio';
    configObj.baseUrl = (configObj.baseUrl && configObj.baseUrl !== '/posts/' && configObj.baseUrl !== '/pages/') ? configObj.baseUrl : '/blog/';
    configObj.defaultAuthor = configObj.defaultAuthor || (typeof localStorage !== 'undefined' ? (localStorage.getItem('cedar_active_author') || '') : '');
    configObj.defaultCategory = configObj.defaultCategory || 'Uncategorized';

    // Normalize authors array
    if (!Array.isArray(configObj.authors) || configObj.authors.length === 0) {
      configObj.authors = [
        {
          name: configObj.defaultAuthor,
          avatar: '',
          bio: '',
          joinDate: 'Joined ' + new Date().getFullYear(),
          retired: false
        }
      ];
    }

    // Normalize categories array
    if (!Array.isArray(configObj.categories) || configObj.categories.length === 0) {
      configObj.categories = ['Uncategorized'];
    }

    // Modernize Design Grid & Blocks (Translate 4-col/legacy to 8-col 1920px)
    configObj.design = configObj.design || {};
    configObj.design.snapEnabled = true;
    configObj.design.gridSize = 160;
    configObj.design.canvasWidth = 1920;
    configObj.design.containerWidth = 1280;
    configObj.design.columns = 8;
    configObj.design.containerLocked = true;
    configObj.design.scaleMode = 'auto';
    configObj.design.deviceMode = 'desktop';
    configObj.design.activeTheme = configObj.design.activeTheme || 'gaslamp_gazette';

    // Normalize branding
    configObj.design.branding = configObj.design.branding || {};
    configObj.design.branding.siteTitle = configObj.name;
    configObj.design.branding.tagline = configObj.subtitle;
    configObj.design.branding.generalLogo = configObj.design.branding.generalLogo || '';
    configObj.design.branding.tabLogo = configObj.design.branding.tabLogo || '';

    // Translate blocks if legacy
    if (Array.isArray(configObj.design.homeBlocks)) {
      configObj.design.homeBlocks = configObj.design.homeBlocks.map(block => {
        const b = { ...block };
        // If old 4-column coordinates: scale x and w
        if (b.w && b.w <= 4) {
          b.w = Math.min(8, b.w * 2);
          b.x = (b.x || 0) * 2;
        }
        // If pixel coordinates from old 512px/1024px canvas
        if (b.w && b.w < 320 && b.stretchWidth) {
          b.w = 1920;
          b.x = 0;
        } else if (b.w && b.w < 600 && !b.stretchWidth) {
          b.w = 1280;
          b.x = 320;
        }
        return b;
      });
    }

    // Re-encode config.json
    const configBytes = encodeContent(JSON.stringify(configObj, null, 2));
    const cfgIdx = updatedFiles.findIndex(f => f.name === 'config.json' || f.name.endsWith('/config.json'));
    if (cfgIdx >= 0) {
      updatedFiles[cfgIdx] = { ...updatedFiles[cfgIdx], data: configBytes, size: configBytes.length };
    } else {
      updatedFiles.push({ name: 'config.json', data: configBytes, size: configBytes.length });
    }

    // 2. Modernize Drafts
    let drafts = [];
    const draftsFile = updatedFiles.find(f =>
      f.name === 'editor/drafts.json' ||
      f.name === 'writer/drafts.json' ||
      f.name === 'static-writer/drafts.json' ||
      f.name === 'drafts.json' ||
      f.name.endsWith('/drafts.json')
    );

    if (draftsFile) {
      try {
        const text = decodeContent(draftsFile.data);
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          drafts = parsed;
        }
      } catch (e) {
        console.warn('[Migration] Could not parse drafts for translation:', e);
      }
    }

    // Normalize each draft
    const now = Date.now();
    drafts = drafts.map((d, index) => {
      const draft = { ...d };
      draft.id = draft.id || ('draft_' + now + '_' + index);
      draft.type = (draft.isPage || draft.type === 'page') ? 'page' : 'post';
      draft.status = draft.status || (draft.published ? 'published' : 'draft');
      draft.title = draft.title || 'Untitled';
      draft.subtitle = draft.subtitle || '';
      draft.slug = draft.slug || draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      draft.authorName = draft.authorName || draft.author || configObj.defaultAuthor;
      draft.authors = Array.isArray(draft.authors) && draft.authors.length > 0 ? draft.authors : [draft.authorName];
      draft.categories = Array.isArray(draft.categories) && draft.categories.length > 0 ? draft.categories : [draft.tag || configObj.defaultCategory];
      draft.tag = draft.tag || draft.categories[0] || 'Uncategorized';
      draft.markdown = typeof draft.markdown === 'string' ? draft.markdown : (draft.content || '');
      draft.coverImage = draft.coverImage || '';
      draft.images = Array.isArray(draft.images) ? draft.images : [];
      draft.createdAt = draft.createdAt || now;
      draft.updatedAt = draft.updatedAt || now;
      return draft;
    });

    // Re-encode editor/drafts.json and writer/drafts.json
    const draftsBytes = encodeContent(JSON.stringify(drafts, null, 2));
    const editorIdx = updatedFiles.findIndex(f => f.name === 'editor/drafts.json');
    if (editorIdx >= 0) {
      updatedFiles[editorIdx] = { ...updatedFiles[editorIdx], name: 'editor/drafts.json', data: draftsBytes, size: draftsBytes.length };
    } else {
      updatedFiles.push({ name: 'editor/drafts.json', data: draftsBytes, size: draftsBytes.length });
    }
    const draftsIdx = updatedFiles.findIndex(f =>
      f.name === 'writer/drafts.json' ||
      f.name === 'static-writer/drafts.json' ||
      f.name === 'drafts.json' ||
      f.name.endsWith('/drafts.json')
    );
    if (draftsIdx >= 0) {
      updatedFiles[draftsIdx] = { ...updatedFiles[draftsIdx], name: 'writer/drafts.json', data: draftsBytes, size: draftsBytes.length };
    } else {
      updatedFiles.push({ name: 'writer/drafts.json', data: draftsBytes, size: draftsBytes.length });
    }

    return {
      translatedFiles: updatedFiles,
      configObj,
      drafts,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      buildToken: CURRENT_BUILD_TOKEN
    };
  }

  /**
   * Applies imported archive data to localStorage and vault
   * @param {Array<{name: string, data: Uint8Array|string}>} files
   * @param {Object} [options]
   */
  async function applyImport(files, options = {}) {
    let importedDraftsCount = 0;
    let configUpdated = false;

    // 0. Extract and cache binary media files into Virtual Vault & build base64 lookup for avatars
    const vStorage = (typeof window !== 'undefined' && (window.CedarVirtualStorage || window.OutpostVirtualStorage)) || null;
    const importedMediaBlobs = new Map();
    const getMimeForExt = (fn) => {
      const ext = String(fn || '').split('.').pop().toLowerCase();
      if (ext === 'webp') return 'image/webp';
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
      if (ext === 'png') return 'image/png';
      if (ext === 'gif') return 'image/gif';
      if (ext === 'svg') return 'image/svg+xml';
      if (ext === 'ico') return 'image/x-icon';
      if (ext === 'avif') return 'image/avif';
      return 'application/octet-stream';
    };
    const uint8ToDataUrl = (u8, mime) => {
      try {
        let binary = '';
        const len = u8.byteLength;
        const chunkSize = 0x8000;
        for (let i = 0; i < len; i += chunkSize) {
          binary += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunkSize, len)));
        }
        return `data:${mime};base64,${btoa(binary)}`;
      } catch (e) {
        return '';
      }
    };

    for (const file of files) {
      if (!file || !file.name || !/\.(webp|jpg|jpeg|png|gif|svg|ico|avif)$/i.test(file.name)) continue;
      try {
        const cleanPath = String(file.name).replace(/\\/g, '/').replace(/^\/+/, '');
        const cleanFilename = cleanPath.split('/').pop();
        const mime = getMimeForExt(cleanFilename);
        const bytes = file.data instanceof Uint8Array
          ? file.data
          : (file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : null);
        if (!bytes || bytes.byteLength === 0) continue;
        const blob = new Blob([bytes], { type: mime });
        importedMediaBlobs.set(cleanFilename, { bytes, blob, mime, cleanPath });
        importedMediaBlobs.set(cleanFilename.toLowerCase(), { bytes, blob, mime, cleanPath });
        importedMediaBlobs.set(cleanPath.toLowerCase(), { bytes, blob, mime, cleanPath });
        if (vStorage && typeof vStorage.writeBlob === 'function') {
          await vStorage.writeBlob(`blog/images/${cleanFilename}`, blob);
          await vStorage.writeBlob(cleanPath, blob);
        }
      } catch (e) {}
    }

    // 1. Sync config.json & milestones.json first so deleted tombstones can filter drafts
    const milestonesFile = files.find(f =>
      f.name === 'editor/milestones.json' ||
      f.name === 'writer/milestones.json' ||
      f.name === 'milestones.json' ||
      f.name.endsWith('/milestones.json')
    );
    let parsedFileMilestones = [];
    if (milestonesFile) {
      try {
        const msArr = JSON.parse(decodeContent(milestonesFile.data));
        if (Array.isArray(msArr)) parsedFileMilestones = msArr;
      } catch (e) {}
    }

    const configFile = files.find(f => f.name === 'editor/config.json' || f.name.endsWith('/editor/config.json'))
      || files.find(f => f.name === 'cedar_config.json' || f.name.endsWith('/cedar_config.json'))
      || files.find(f => f.name === 'writer/config.json' || f.name.endsWith('/writer/config.json'))
      || files.find(f => f.name === 'config.json' || f.name.endsWith('/config.json'));

    let importedDeletedIds = new Set();
    let importedDeletedSlugs = new Set();
    if (configFile) {
      const configText = decodeContent(configFile.data);
      try {
        const cfg = JSON.parse(configText);
        if (Array.isArray(cfg.deletedDraftIds)) {
          cfg.deletedDraftIds.forEach(id => id && importedDeletedIds.add(String(id)));
          try { localStorage.setItem('cedar_deleted_draft_ids', JSON.stringify(cfg.deletedDraftIds)); } catch (e) {}
        }
        if (Array.isArray(cfg.deletedSlugs)) {
          cfg.deletedSlugs.forEach(s => s && importedDeletedSlugs.add(String(s).trim().toLowerCase()));
          try { localStorage.setItem('cedar_deleted_slugs', JSON.stringify(cfg.deletedSlugs)); } catch (e) {}
        }
        if (Array.isArray(cfg.deletedCategories) && Array.isArray(cfg.categories)) {
          const delCatsLower = new Set(cfg.deletedCategories.map(c => String(c || '').trim().toLowerCase()).filter(Boolean));
          cfg.categories = cfg.categories.filter(c => !delCatsLower.has(String(c || '').trim().toLowerCase()));
        }

        // Hydrate author avatars from media/authors/
        if (Array.isArray(cfg.authors)) {
          cfg.authors.forEach(auth => {
            if (!auth || typeof auth !== 'object') return;
            if (!auth.avatar || !String(auth.avatar).startsWith('data:')) {
              const avBase = auth.avatar ? String(auth.avatar).split('/').pop().split('\\').pop() : '';
              const authSlug = (typeof window.generateSlug === 'function' ? window.generateSlug(auth.name || 'author') : String(auth.name || 'author').toLowerCase().replace(/[^a-z0-9]+/g, '-')) || 'author';
              const matched = (avBase && (importedMediaBlobs.get(avBase) || importedMediaBlobs.get(avBase.toLowerCase())))
                || importedMediaBlobs.get(`media/authors/${authSlug}_avatar.jpg`)
                || importedMediaBlobs.get(`${authSlug}_avatar.jpg`)
                || importedMediaBlobs.get(`${authSlug}_avatar.png`)
                || importedMediaBlobs.get(`${authSlug}_avatar.webp`)
                || importedMediaBlobs.get('author_avatar.jpg')
                || importedMediaBlobs.get('author_avatar.png');
              if (matched && matched.bytes) {
                const dUrl = uint8ToDataUrl(matched.bytes, matched.mime);
                if (dUrl) {
                  if (auth.avatar) auth.avatarFile = auth.avatar;
                  auth.avatar = dUrl;
                  cfg.authorAvatar = dUrl;
                }
              }
            }
          });
        }

        // Hydrate branding logos & favicon from media/branding/
        cfg.design = cfg.design || {};
        cfg.design.branding = cfg.design.branding || {};
        const br = cfg.design.branding;
        br.files = br.files || {};
        const logoBlob = importedMediaBlobs.get('media/branding/logo.png') || importedMediaBlobs.get('media/branding/site_logo.png');
        const origBlob = importedMediaBlobs.get('media/branding/logo-original.png') || logoBlob;
        const favBlob = importedMediaBlobs.get('media/branding/icon.png') || importedMediaBlobs.get('media/branding/favicon.png');
        if (logoBlob && logoBlob.bytes) {
          const dUrl = uint8ToDataUrl(logoBlob.bytes, logoBlob.mime);
          if (dUrl) {
            if (!br.generalLogo || !String(br.generalLogo).startsWith('data:')) br.generalLogo = dUrl;
            br.files['media/branding/logo.png'] = dUrl;
          }
        }
        if (origBlob && origBlob.bytes) {
          const dUrl = uint8ToDataUrl(origBlob.bytes, origBlob.mime);
          if (dUrl) {
            if (!br.originalLogo || !String(br.originalLogo).startsWith('data:')) br.originalLogo = dUrl;
            br.files['media/branding/logo-original.png'] = dUrl;
          }
        }
        if (favBlob && favBlob.bytes && !br.faviconExplicitlyRemoved) {
          const dUrl = uint8ToDataUrl(favBlob.bytes, favBlob.mime);
          if (dUrl) {
            if (!br.tabLogo || !String(br.tabLogo).startsWith('data:')) br.tabLogo = dUrl;
            br.files['media/branding/icon.png'] = dUrl;
          }
        }
        if (Object.keys(br.files).length > 0) {
          try { localStorage.setItem('cedar_branding_files_v1', JSON.stringify(br.files)); } catch (e) {}
        }

        // Merge Milestones from milestones.json, config.milestones, and activityLog
        const mergedMilestones = [];
        const seenMsIds = new Set();
        const logMilestones = Array.isArray(cfg.activityLog)
          ? cfg.activityLog.filter(a => a && a.type === 'milestone').map(a => ({
              id: (a.data && a.data.id) || a.id,
              text: (a.data && a.data.text) || a.text || '',
              date: (a.data && a.data.date) || a.date || '',
              timestamp: a.timestamp || Date.now(),
              authorName: (a.data && a.data.authorName) || a.authorName || ''
            }))
          : [];
        []
          .concat(parsedFileMilestones)
          .concat(Array.isArray(cfg.milestones) ? cfg.milestones : [])
          .concat(logMilestones)
          .forEach(m => {
            if (m && m.id && m.text && !seenMsIds.has(m.id)) {
              seenMsIds.add(m.id);
              mergedMilestones.push(m);
            }
          });
        cfg.milestones = mergedMilestones;
        try {
          localStorage.setItem('cedar_milestones_v1', JSON.stringify(mergedMilestones));
          if (Array.isArray(cfg.activityLog)) {
            localStorage.setItem('cedar_activity_log', JSON.stringify(cfg.activityLog));
          }
        } catch (e) {}

        // Restore GitHub repo, branch, and PAT if present in studio config
        if (cfg.githubRepo) {
          try { localStorage.setItem('cedar_github_repo', cfg.githubRepo); } catch (e) {}
        }
        if (cfg.githubBranch) {
          try { localStorage.setItem('cedar_github_branch', cfg.githubBranch); } catch (e) {}
        }
        if (cfg.githubToken) {
          try { localStorage.setItem('cedar_github_pat', cfg.githubToken); } catch (e) {}
        }

        const finalConfigText = JSON.stringify(cfg);
        localStorage.setItem('sheesh_static_writer_project_v1', finalConfigText);
        if (cfg.domain) {
          localStorage.setItem('cedar_user_domain', cfg.domain);
          try { localStorage.setItem('outpost_user_domain', cfg.domain); } catch (e) {}
        }
        if (typeof window.projectConfig !== 'undefined') {
          window.projectConfig = cfg;
        }
        configUpdated = true;
      } catch (e) {
        console.warn('[Migration] Failed to parse config during applyImport:', e);
      }
    }

    // 2. Sync drafts.json (filtering any deleted draft tombstones)
    const draftsFile = files.find(f =>
      f.name === 'editor/drafts.json' ||
      f.name === 'writer/drafts.json' ||
      f.name === 'static-writer/drafts.json' ||
      f.name === 'drafts.json' ||
      f.name.endsWith('/drafts.json')
    );
    if (draftsFile) {
      const draftsText = decodeContent(draftsFile.data);
      try {
        let parsed = JSON.parse(draftsText);
        if (Array.isArray(parsed)) {
          if (importedDeletedIds.size > 0 || importedDeletedSlugs.size > 0) {
            parsed = parsed.filter(d => {
              if (!d) return false;
              if (d.id && importedDeletedIds.has(String(d.id))) return false;
              const slugKey = String(d.slug || '').trim().toLowerCase();
              if (slugKey && importedDeletedSlugs.has(slugKey)) return false;
              return true;
            });
          }
          localStorage.setItem('sheesh_static_writer_drafts_v2', JSON.stringify(parsed));
          importedDraftsCount = parsed.length;
          if (typeof window.drafts !== 'undefined') {
            window.drafts = parsed;
          }
        }
      } catch (e) {
        console.warn('[Migration] Failed to parse drafts during applyImport:', e);
      }
    }

    // 3. Sync to Vault if connected
    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {
      for (const file of files) {
        try {
          await window.SheeshVault.writeVaultFile(file.name, file.data);
        } catch (err) {
          console.warn('[Migration] Vault write skipped for', file.name, err);
        }
      }
    }

    // 4. Mark FTUE completed and clear trigger
    localStorage.setItem('cedar_ftue_completed', '1');
        try { localStorage.setItem('outpost_ftue_completed', '1'); } catch (e) {}
    localStorage.removeItem('cedar_trigger_ftue');
        try { localStorage.removeItem('outpost_trigger_ftue'); } catch (e) {}

    if ((window.Cedar && window.Cedar.emit) || (window.Outpost && window.Outpost.emit)) {
          const emitter = (window.Cedar && window.Cedar.emit) ? window.Cedar : window.Outpost;
      emitter.emit('migration:imported', {
        draftsCount: importedDraftsCount,
        configUpdated
      });
    }

    return {
      success: true,
      draftsCount: importedDraftsCount,
      configUpdated
    };
  }

  // Export to global Cedar namespace
  const cedarMigExports = {
    CURRENT_SCHEMA_VERSION,
    inspectArchive,
    translateLegacyArchive,
    applyImport
  };
  window.CedarMigration = cedarMigExports;
  window.OutpostMigration = cedarMigExports;
  const _migOldExport = {
    CURRENT_SCHEMA_VERSION,
    CURRENT_BUILD_TOKEN,
    MIN_COMPATIBLE_VERSION,
    inspectArchive,
    translateLegacyArchive,
    applyImport,
    decodeContent,
    encodeContent
  };
})();
