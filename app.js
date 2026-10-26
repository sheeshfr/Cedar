/**
 * Cedar Application Engine (v3.1)
 * Focused Writing Experience with Live Markdown Sync & Client-Side Image Sanitizer
 * 100% Client-Side, Zero Dependencies, Standalone & Offline Ready
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  // Seamless legacy storage migration from Outpost to Cedar
  (function migrateOutpostStorageToCedar() {
    if (typeof localStorage === 'undefined') return;
    try {
      const keys = [
        'theme', 'vault_path', 'vault_connected', 'vault_name', 'vault_mode',
        'project', 'active_author', 'ftue_completed', 'trigger_ftue',
        'user_domain', 'user_blog_path', 'notes_img_counter_v1',
        'sanitization_user_choice', 'media_tags', 'dash_sidebar_collapsed',
        'branding_files_v1', 'browser_backup_drafts', 'browser_backup_project',
        'browser_backup_mode', 'browser_backup_timestamp'
      ];
      for (const k of keys) {
        const oldVal = localStorage.getItem('outpost_' + k);
        if (oldVal !== null && localStorage.getItem('cedar_' + k) === null) {
          localStorage.setItem('cedar_' + k, oldVal);
        }
      }
    } catch (e) {}
  })();

  // =========================================================================
  // COMPONENT PARTIAL LOADER
  // =========================================================================
  async function loadHTMLPartials() {
    let targets = Array.from(document.querySelectorAll('[data-include]'));
    let depth = 0;
    while (targets.length > 0 && depth < 5) {
      await Promise.all(targets.map(async el => {
        const src = el.getAttribute('data-include');
        if (!src) return;
        try {
          const fetchUrl = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
          const res = await fetch(fetchUrl, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          el.outerHTML = html;
        } catch (err) {
          console.error(`[Cedar Component Loader] Failed to load ${src}:`, err);
        }
      }));
      targets = Array.from(document.querySelectorAll('[data-include]'));
      depth++;
    }
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async function init() {
    window.__initErrors = [];

    // Step 0: Load HTML Component Partials into DOM
    await loadHTMLPartials();

    // Apply active theme immediately to newly injected DOM partials (without overwriting storage before Vault hydration)
    const ftue = window.CedarFTUE || window.OutpostFTUE;
    if (ftue && typeof ftue.applyLiveTheme === 'function') {
      const activeTheme = (typeof localStorage !== 'undefined' && (localStorage.getItem('cedar_editor_theme') || localStorage.getItem('cedar_theme') || localStorage.getItem('outpost_theme'))) || 'basalt';
      ftue.applyLiveTheme(activeTheme, false);
    }

    // 1. Attach router event listeners immediately (ZenTube Architecture Rule 1)
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);

    // 0. Initialize Plugin Architecture
    if (window.Cedar.emit) window.Cedar.emit('app:boot');
    if (window.Cedar.plugins && typeof window.Cedar.plugins.initAll === 'function') {
      window.Cedar.plugins.initAll();
    }
    if (typeof window.syncBlockTypeDropdown === 'function') {
      window.syncBlockTypeDropdown();
    }

    // Auto-populate and reconcile drafts and config from connected external Vault (if any)
    let hasExternalVault = false;
    try {
      let savedVaultPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path') || (window.projectConfig && window.projectConfig.vaultPath)) || '').trim();
      const savedVaultName = ((localStorage.getItem('cedar_vault_name') || localStorage.getItem('outpost_vault_name')) || '').trim();
      const isDisconnect = localStorage.getItem('cedar_vault_disconnected') === '1';
      if (!savedVaultPath && !isDisconnect) {
        try {
          const vpUrl = '/api/vault-path' + (savedVaultName ? '?folder=' + encodeURIComponent(savedVaultName) : '');
          const vpRes = await fetch(vpUrl);
          if (vpRes.ok) {
            const vpData = await vpRes.json();
            const resolvedVp = (vpData && (vpData.path || vpData.defaultPath) || '').trim();
            if (resolvedVp) {
              savedVaultPath = resolvedVp;
              localStorage.setItem('cedar_vault_path', savedVaultPath);
              localStorage.setItem('cedar_vault_connected', '1');
              if (vpData.folderName) localStorage.setItem('cedar_vault_name', vpData.folderName);
            }
          }
        } catch (e) {}
      }
      hasExternalVault = Boolean(savedVaultPath && !isDisconnect && !/[\\/]website[\\/]cedar[\\/]?$/i.test(savedVaultPath));

      if (hasExternalVault) {
        const draftsKey = window.STORAGE_KEY_DRAFTS || 'sheesh_static_writer_drafts_v2';
        const existingDraftsRaw = localStorage.getItem(draftsKey);
        let needsHydration = true;
        if (existingDraftsRaw) {
          try {
            const parsed = JSON.parse(existingDraftsRaw);
            if (Array.isArray(parsed) && parsed.some(d => d && (d.type === 'post' || String(d.id || '').startsWith('post_') || d.type === 'note'))) {
              needsHydration = false;
            }
          } catch (e) {}
        }
        try {
          let res = await fetch(`/api/vault-read?folder=${encodeURIComponent(savedVaultPath)}&file=${encodeURIComponent('editor/drafts.json')}&as=json`, { cache: 'no-cache' });
          if (!res.ok) {
            res = await fetch(`/api/vault-read?folder=${encodeURIComponent(savedVaultPath)}&file=${encodeURIComponent('writer/drafts.json')}&as=json`, { cache: 'no-cache' });
          }
          if (!res.ok) {
            res = await fetch(`/api/vault-read?folder=${encodeURIComponent(savedVaultPath)}&file=${encodeURIComponent('static-writer/drafts.json')}&as=json`, { cache: 'no-cache' });
          }
          if (res.ok) {
            const fileDrafts = await res.json();
            if (Array.isArray(fileDrafts) && fileDrafts.length > 0) {
              if (needsHydration) {
                if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function') {
                  window.CedarStore.hydrateFromList(fileDrafts);
                  window.drafts = window.CedarStore.getAllDrafts();
                } else {
                  window.drafts = fileDrafts;
                }
                if (window.CedarStore && typeof window.CedarStore.persistToLocalStorage === 'function') {
                  window.CedarStore.persistToLocalStorage(window.drafts);
                } else {
                  try {
                    localStorage.setItem(draftsKey, JSON.stringify(window.drafts));
                  } catch (qErr) {}
                }
                window.__vaultDraftsHydratedAtBoot = true;
                localStorage.setItem('cedar_ftue_completed', '1');
                try { localStorage.setItem('outpost_ftue_completed', '1'); } catch (e) {}
              } else {
                if (window.CedarStore && typeof window.CedarStore.reconcileDiskDrafts === 'function') {
                  const recRes = window.CedarStore.reconcileDiskDrafts(fileDrafts);
                  window.drafts = window.CedarStore.getAllDrafts();
                  window.__vaultDraftsHydratedAtBoot = true;
                  if (window.CedarStore && typeof window.CedarStore.persistToLocalStorage === 'function') {
                    window.CedarStore.persistToLocalStorage(window.drafts);
                  } else if (recRes.updated) {
                    try {
                      localStorage.setItem(draftsKey, JSON.stringify(window.drafts));
                    } catch (e) {}
                  }
                  if (recRes.updated && typeof window.renderDashboard === 'function') {
                    window.renderDashboard();
                  }
                }
              }
            }
          }
        } catch (e) {}

        const projKey = window.STORAGE_KEY_PROJECT || 'sheesh_static_writer_project_v1';
        const existingProjRaw = localStorage.getItem(projKey);
        try {
          let editorCfg = null;
          let writerCfg = null;
          let rootCfg = null;
          try {
            const resEditor = await fetch(`/api/vault-read?folder=${encodeURIComponent(savedVaultPath)}&file=${encodeURIComponent('editor/config.json')}&as=json`, { cache: 'no-cache' });
            if (resEditor.ok) editorCfg = await resEditor.json();
          } catch (e) {}
          try {
            const resWriter = await fetch(`/api/vault-read?folder=${encodeURIComponent(savedVaultPath)}&file=${encodeURIComponent('writer/config.json')}&as=json`, { cache: 'no-cache' });
            if (resWriter.ok) writerCfg = await resWriter.json();
          } catch (e) {}
          try {
            const resRoot = await fetch(`/api/vault-read?folder=${encodeURIComponent(savedVaultPath)}&file=config.json&as=json`, { cache: 'no-cache' });
            if (resRoot.ok) rootCfg = await resRoot.json();
          } catch (e) {}

          let fileConfig = null;
          const candidates = [editorCfg, writerCfg, rootCfg].filter(Boolean);
          if (candidates.length > 0) {
            candidates.sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0));
            fileConfig = Object.assign({}, ...candidates.reverse());
          }

          if (fileConfig && typeof fileConfig === 'object') {
            let localProj = {};
            if (existingProjRaw) {
              try { localProj = JSON.parse(existingProjRaw) || {}; } catch (e) { localProj = {}; }
            }

            // Merge categories without duplicates, PRESERVING canonical casing
            const mergedCategories = [];
            const seenCats = new Set();
            []
              .concat(Array.isArray(fileConfig.categories) ? fileConfig.categories : [])
              .concat(Array.isArray(localProj.categories) ? localProj.categories : [])
              .forEach(c => {
                const trimmed = String(c || '').trim();
                const key = trimmed.toLowerCase();
                if (trimmed && key !== 'uncategorized' && key !== 'posts' && !seenCats.has(key)) {
                  seenCats.add(key);
                  mergedCategories.push(trimmed);
                }
              });

            const mergedDesign = Object.assign(
              {},
              localProj.design || {},
              fileConfig.design || {}
            );
            if ((localProj.design && localProj.design.branding) || (fileConfig.design && fileConfig.design.branding)) {
              mergedDesign.branding = Object.assign({}, (localProj.design && localProj.design.branding) || {}, (fileConfig.design && fileConfig.design.branding) || {});
            }
            if ((localProj.design && localProj.design.masthead) || (fileConfig.design && fileConfig.design.masthead)) {
              mergedDesign.masthead = Object.assign({}, (localProj.design && localProj.design.masthead) || {}, (fileConfig.design && fileConfig.design.masthead) || {});
            }
            if ((localProj.design && localProj.design.toggles) || (fileConfig.design && fileConfig.design.toggles)) {
              mergedDesign.toggles = Object.assign({}, (localProj.design && localProj.design.toggles) || {}, (fileConfig.design && fileConfig.design.toggles) || {});
            }

            const mergedProj = Object.assign({}, localProj, fileConfig, {
              categories: mergedCategories.length > 0 ? mergedCategories : (fileConfig.categories || localProj.categories || []),
              design: mergedDesign,
              mediaPreferences: Object.assign({}, localProj.mediaPreferences || {}, fileConfig.mediaPreferences || {})
            });

            // Resolve editorTheme from Vault config or design theme
            const resolvedEditorTheme = mergedProj.editorTheme
              || (mergedProj.design && (mergedProj.design.blogTheme || mergedProj.design.activeTheme))
              || localStorage.getItem('cedar_editor_theme')
              || localStorage.getItem('cedar_theme')
              || 'basalt';
            mergedProj.editorTheme = resolvedEditorTheme;

            try {
              let safeProj = mergedProj;
              if (Array.isArray(mergedProj.mediaLibrary) && mergedProj.mediaLibrary.some(m => m && m.dataUrl && m.dataUrl.length > 500)) {
                safeProj = {
                  ...mergedProj,
                  mediaLibrary: mergedProj.mediaLibrary.map(m => {
                    if (!m || typeof m !== 'object') return m;
                    const copy = { ...m };
                    if (copy.dataUrl && copy.dataUrl.length > 500) delete copy.dataUrl;
                    delete copy.blob;
                    return copy;
                  })
                };
              }
              localStorage.setItem(projKey, JSON.stringify(safeProj));
              localStorage.setItem('cedar_editor_theme', resolvedEditorTheme);
              localStorage.setItem('cedar_theme', resolvedEditorTheme);
              if (mergedProj.domain) localStorage.setItem('cedar_user_domain', mergedProj.domain);
              if (mergedProj.blogPath) localStorage.setItem('cedar_user_blog_path', mergedProj.blogPath);
              if (typeof mergedProj.layoutOverride === 'boolean') {
                localStorage.setItem('cedar_layout_override', mergedProj.layoutOverride ? 'true' : 'false');
              }
              if (typeof mergedProj.rssEnabled === 'boolean') {
                localStorage.setItem('cedar_rss_enabled', mergedProj.rssEnabled ? 'true' : 'false');
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[Cedar] Storage hydration:', e);
    }

    const stepNames = [
      'loadProjectFromStorage',
      'loadDraftsFromStorage',
      'syncDraftToForm',
      'setupRichTextFormatting',
      'setupFormattingToolbar',
      'setupEditorMediaModalControls',
      'setupImageClipboardAndDrop',
      'setupExportHub',
      'setupImportControls',
      'setupVaultIntegration',
      'initGitHubSyncUI',
      'setupDashboard',
      'setupGlobalSearch',
      'setupViewControls',
      'setupInputBindings'
    ];

    stepNames.forEach(name => {
      try {
        const fn = (typeof window[name] === 'function') ? window[name] : (function() {
          try { return eval(name); } catch(e) { return null; }
        })();
        if (typeof fn === 'function') {
          fn();
        } else {
          console.warn(`[Cedar] Init step ${name} is not available.`);
        }
      } catch (err) {
        console.error(`Error in ${name}:`, err);
        window.__initErrors.push({ step: name, message: err.message, stack: err.stack });
      }
    });

    // 2. Boot initial route
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      const urlParams = new URLSearchParams(window.location.search || '');
      const queryTab = urlParams.get('tab');
      const bootTab = (queryTab && ['home', 'posts', 'pages', 'media', 'categories', 'designer', 'export', 'settings', 'preview'].includes(queryTab)) ? queryTab : 'home';
      window.location.hash = '#' + bootTab;
      handleRoute();
    } else {
      handleRoute();
    }

    // Ensure drafts in storage and preview frames are primed right after startup
    try {
      const currentPostCount = (window.CedarStore && typeof window.CedarStore.getPosts === 'function')
        ? window.CedarStore.getPosts().length
        : (Array.isArray(window.drafts) ? window.drafts.filter(d => d && (d.type === 'post' || String(d.id || '').startsWith('post_'))).length : 0);
      if (typeof window.saveDraftsToStorage === 'function' && (currentPostCount > 0 || !hasExternalVault)) {
        window.saveDraftsToStorage();
      }
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        window.updateAllPreviewFrames();
        setTimeout(window.updateAllPreviewFrames, 150);
        setTimeout(window.updateAllPreviewFrames, 500);
      }
    } catch (_) {}

    // 3. First Time User Experience (FTUE) Blank Slate & Nuclear Reset Trigger Check
    if (ftue) {
      if (typeof ftue.init === 'function') {
        ftue.init();
      }
      if (typeof ftue.checkAndLaunch === 'function') {
        ftue.checkAndLaunch();
      }
    }

    if (window.Cedar.emit) {
      window.Cedar.emit('app:ready');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); });
  } else {
    init();
  }

  window.init = init;
  window.Cedar.init = init;
  window.Outpost.init = init;
})();

