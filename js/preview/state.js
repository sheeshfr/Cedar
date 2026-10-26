/**
 * Cedar Preview — State Management, Live Sync & Data Resolvers
 */
(function () {
  'use strict';
  window.CedarPreview = window.CedarPreview || window.OutpostPreview || {};
  window.OutpostPreview = window.CedarPreview;

  const CP1252_CHAR_TO_BYTE = {
    '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
    '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
    '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
    '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
    '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
    '\u017E': 0x9E, '\u0178': 0x9F
  };
  const MOJIBAKE_REGEX = /[\u00C2-\u00F4][\u0080-\u00BF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]+/g;
  const _utf8Decoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8', { fatal: true }) : null;

  function repairUtf8Mojibake(str) {
    if (!str || typeof str !== 'string' || !_utf8Decoder || !MOJIBAKE_REGEX.test(str)) return str;
    MOJIBAKE_REGEX.lastIndex = 0;
    let cur = str;
    let prev = null;
    while (cur !== prev && MOJIBAKE_REGEX.test(cur)) {
      prev = cur;
      MOJIBAKE_REGEX.lastIndex = 0;
      cur = cur.replace(MOJIBAKE_REGEX, (match) => {
        try {
          const bytes = new Uint8Array(match.length);
          for (let i = 0; i < match.length; i++) {
            const ch = match[i];
            const mapped = CP1252_CHAR_TO_BYTE[ch];
            if (mapped !== undefined) {
              bytes[i] = mapped;
            } else {
              const code = ch.charCodeAt(0);
              if (code > 0xFF) return match;
              bytes[i] = code;
            }
          }
          return _utf8Decoder.decode(bytes);
        } catch (_) {
          return match;
        }
      });
    }
    return cur;
  }
  window.repairUtf8Mojibake = repairUtf8Mojibake;

  function healDraftMojibake(d) {
    if (!d || typeof d !== 'object') return;
    const fields = ['title', 'subtitle', 'markdown', 'proseHtml', 'html', 'customDesc', 'bodyExcerpt'];
    for (const f of fields) {
      if (typeof d[f] === 'string' && d[f]) {
        d[f] = repairUtf8Mojibake(d[f]);
      }
    }
  }

      let projectConfig = {
        name: 'Cedar',
        domain: '',
        defaultAuthor: 'Cedar Staff',
        createdAt: Date.now(),
        createdYear: new Date().getFullYear(),
        authors: [],
        categories: [],
        design: {
          columns: 8,
          containerWidth: 1280,
          activeTheme: 'gaslamp_gazette',
          stickyHeader: false,
          branding: {
            generalLogo: '',
            tabLogo: 'icon.png',
            siteTitle: 'Cedar',
            tagline: ''
          },
          homeBlocks: [
            { id: 'b_masthead', type: 'masthead', x: 0, y: 0, w: 1920, h: 96, align: 'center', stretchWidth: true, config: { align: 'center' } },
            { id: 'b_spotlight', type: 'spotlight', x: 320, y: 96, w: 1280, h: 256, stretchWidth: false, config: {} },
            { id: 'b_categories', type: 'categories_shelf', x: 320, y: 352, w: 1280, h: 80, stretchWidth: false, config: { title: 'Category' } },
            { id: 'b_feed', type: 'post_feed', x: 320, y: 432, w: 1280, h: 384, stretchWidth: false, config: { title: 'Recent Posts', limit: 6, cols: 2, layoutStyle: 'vertical' } },
            { id: 'b_footer', type: 'footer', x: 320, y: 816, w: 1280, h: 64, stretchWidth: false, config: {} }
          ]
        }
      };
      window.projectConfig = projectConfig;

      let drafts = []; window.drafts = drafts; window.OutpostPreview.drafts = drafts;
      let activeCategoryFilter = 'ALL';
      const getConfig = () => window.projectConfig || projectConfig || {};

      // Storage keys matching Cedar core
      const STORAGE_KEY_DRAFTS = 'sheesh_static_writer_drafts_v2';
      const LEGACY_STORAGE_DRAFTS = 'sheesh_static_writer_drafts';
      const STORAGE_KEY_PROJECT = 'sheesh_static_writer_project_v1';
      const STORAGE_KEY_DOMAIN = 'cedar_user_domain';

      // Muted color references for missing 1280x720 cover images


      function getWorkspaceFingerprint() {
        try {
          const p = projectConfig || window.projectConfig || {};
          const dList = (Array.isArray(drafts) && drafts.length > 0) ? drafts : (Array.isArray(window.drafts) ? window.drafts : []);
          const dPart = dList.map(d => `${d.id}:${d.updatedAt || d.date || ''}:${d.title || ''}:${d.coverImage || ''}:${d.status || ''}:${d.tag || ''}:${Array.isArray(d.categories) ? d.categories.join(',') : ''}:${Boolean(d.starred || d.featured || d.isFeatured)}:${(d.proseHtml || '').length}:${(d.markdown || '').length}`).join(';');
          const authPart = (p.authors || []).map(a => `${(typeof a === 'object' ? a?.name : a) || ''}:${(typeof a === 'object' ? a?.avatar : '') || ''}`).join(';');
          const blocksPart = (p.design && Array.isArray(p.design.homeBlocks))
            ? p.design.homeBlocks.map(b => `${b.id}:${b.type}:${b.x}:${b.y}:${b.w}:${b.h}:${b.stretchWidth}:${b.align}:${JSON.stringify(b.config || {})}`).join(';')
            : '';
          const brandPart = (p.design && p.design.branding) ? JSON.stringify(p.design.branding) : '';
          const isRoundedMedia = Boolean((p.mediaPreferences && p.mediaPreferences.roundedImages) || (p.design && p.design.roundedImages));
          const radiusPart = `${(p.design && p.design.blockRadius !== undefined) ? p.design.blockRadius : ''}:${isRoundedMedia}`;
          const customPart = JSON.stringify((p.design && p.design.customColors) || '');
          const themePart = (p.design && (p.design.blogTheme || p.design.activeTheme)) || '';
          const layoutPart = (p.design && p.design._layoutThemeName) || '';
          const designFlagsPart = p.design
            ? `${Boolean(p.design.featured)}:${p.design.featuredMode || 'latest'}:${p.design.featuredCategory || ''}:${Boolean(p.design.categoryBar)}:${p.design.postLayout || ''}:${p.design.showcaseSwoosh || ''}:${p.design.showcaseSwooshSeed || ''}:${JSON.stringify(p.design.showcaseSwooshMap || {})}:${p.design.siteFont || ''}:${p.design.titleFont || ''}:${p.design.headerAlign || ''}:${p.design.brandingMode || ''}:${p.design.logoScale || ''}:${p.design.titleScale || ''}`
            : '';
          const catPart = Array.isArray(p.categories) ? p.categories.join(',') : '';
          return `${p.name || ''}|${p.domain || ''}|${themePart}|${customPart}|${layoutPart}|${designFlagsPart}|${radiusPart}|${catPart}|${authPart}|${dList.length}|${dPart}|${blocksPart}|${brandPart}`;
        } catch (e) {
          return '';
        }
      }



      async function syncWithServer() {
        if (window.__CEDAR_PRODUCTION__ || window.__CEDAR_STATIC_DATA__) {
          window.__hasSyncedWithServer = true;
          return;
        }
        // Guard: if running in an iframe inside Cedar Studio, Studio parent is the authoritative source of truth.
        // Direct memory & postMessage updates keep preview in sync without background fetch race conditions.
        try {
          if (window.parent && window.parent !== window && window.parent.projectConfig && Array.isArray(window.parent.drafts) && window.parent.drafts.length > 0) {
            return;
          }
        } catch (_) {}

        try {
          let data = null;
          const h = (window.location && window.location.hostname) || '';
          const isLocalServer = Boolean((window.Cedar && window.Cedar.isLocalServer) || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local'));
          if (isLocalServer) {
            try {
              const res = await fetch('/api/live-sync');
              if (res.ok) {
                data = await res.json();
              }
            } catch (_) {}
          }
          if (!data) {
            // Static web host (e.g. cedar.pub) or offline fallback: sync from opener, IndexedDB (CedarVirtualStorage), or localStorage
            let fallbackProj = null;
            let fallbackDrafts = null;
            try {
              if (window.opener && !window.opener.closed) {
                if (window.opener.projectConfig) {
                  fallbackProj = JSON.parse(JSON.stringify(window.opener.projectConfig));
                }
                const openerDrafts = (window.opener.CedarStore && typeof window.opener.CedarStore.getAllDrafts === 'function')
                  ? window.opener.CedarStore.getAllDrafts()
                  : window.opener.drafts;
                if (Array.isArray(openerDrafts) && openerDrafts.length > 0) {
                  fallbackDrafts = JSON.parse(JSON.stringify(openerDrafts));
                }
              }
            } catch (_) {}
            const vs = window.CedarVirtualStorage || window.OutpostVirtualStorage;
            if (vs && typeof vs.readFile === 'function') {
              if (!fallbackProj) {
                try {
                  const vpRaw = await vs.readFile('config.json', 'json').catch(() => null)
                    || await vs.readFile('cedar_config.json', 'json').catch(() => null)
                    || await vs.readFile('editor/config.json', 'json').catch(() => null)
                    || await vs.readFile('project.json', 'json').catch(() => null);
                  const vp = typeof vpRaw === 'string' ? JSON.parse(vpRaw) : vpRaw;
                  if (vp && typeof vp === 'object') fallbackProj = vp;
                } catch (_) {}
              }
              if (!fallbackDrafts) {
                try {
                  const vdRaw = await vs.readFile('editor/drafts.json', 'json').catch(() => null)
                    || await vs.readFile('writer/drafts.json', 'json').catch(() => null);
                  const vd = typeof vdRaw === 'string' ? JSON.parse(vdRaw) : vdRaw;
                  if (Array.isArray(vd) && vd.length > 0) fallbackDrafts = vd;
                } catch (_) {}
              }
            }
            if (!fallbackProj) {
              try {
                const rawP = localStorage.getItem(STORAGE_KEY_PROJECT);
                if (rawP) fallbackProj = JSON.parse(rawP);
              } catch (_) {}
            }
            if (!fallbackDrafts) {
              try {
                const rawD = localStorage.getItem(STORAGE_KEY_DRAFTS) || localStorage.getItem(LEGACY_STORAGE_DRAFTS);
                if (rawD) fallbackDrafts = JSON.parse(rawD);
              } catch (_) {}
            }
            if (fallbackProj || fallbackDrafts) {
              data = { project: fallbackProj, drafts: fallbackDrafts };
            }
          }
          if (data) {
            if (data.project) {
              const parsedProject = typeof data.project === 'string' ? JSON.parse(data.project) : data.project;
              if (Array.isArray(parsedProject.authors)) {
                parsedProject.authors.forEach(pAuth => {
                  const existing = (projectConfig.authors || []).find(a => (a?.name || a) === (pAuth?.name || pAuth));
                  if (existing && existing.avatar && !pAuth.avatar) {
                    pAuth.avatar = existing.avatar;
                  }
                });
              }
              projectConfig = Object.assign(projectConfig, parsedProject);
              // Also merge any categories from localStorage if present
              try {
                const localRawProj = localStorage.getItem(STORAGE_KEY_PROJECT);
                if (localRawProj) {
                  const lp = JSON.parse(localRawProj);
                  if (lp && Array.isArray(lp.categories)) {
                    const combined = [...(projectConfig.categories || []), ...lp.categories];
                    const seen = new Set();
                    projectConfig.categories = combined.filter(c => {
                      const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
                      if (!val) return false;
                      const low = val.toLowerCase();
                      if (low === 'uncategorized' || low === 'posts') return false;
                      if (seen.has(low)) return false;
                      seen.add(low);
                      return true;
                    });
                  }
                }
              } catch (e) {}
              if (Array.isArray(projectConfig.categories)) {
                projectConfig.categories = projectConfig.categories.filter(c => {
                  const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
                  return val && val.toLowerCase() !== 'uncategorized' && val.toLowerCase() !== 'posts';
                });
              }
              let appliedLocalDesign = false;
              const localRaw = localStorage.getItem(STORAGE_KEY_PROJECT);
              if (localRaw) {
                try {
                  const lp = JSON.parse(localRaw);
                  const lpTime = Number(lp && lp.lastUpdated) || 0;
                  const srvTime = Number(parsedProject && parsedProject.lastUpdated) || 0;
                  if (lp && lp.design && (!parsedProject || !parsedProject.design || lpTime >= srvTime)) {
                    projectConfig.design = Object.assign({}, (parsedProject && parsedProject.design) || {}, lp.design);
                    appliedLocalDesign = true;
                  }
                } catch (e) {}
              }
              if (!appliedLocalDesign && parsedProject && parsedProject.design) {
                const srvTime = Number(parsedProject.lastUpdated) || 0;
                const localTime = Number(projectConfig.lastUpdated) || 0;
                if (!projectConfig.design || Object.keys(projectConfig.design).length === 0 || srvTime >= localTime) {
                  projectConfig.design = parsedProject.design;
                }
              }
              const savedRss = localStorage.getItem('cedar_rss_enabled') || localStorage.getItem('outpost_rss_enabled');
              const explicitlyDisabled = localStorage.getItem('cedar_rss_user_explicitly_disabled') === 'true';
              if (explicitlyDisabled) {
                projectConfig.rssEnabled = false;
              } else if (savedRss !== null) {
                projectConfig.rssEnabled = savedRss === 'true';
              } else {
                projectConfig.rssEnabled = false;
              }
              window.projectConfig = projectConfig;
              if (!projectConfig.design) projectConfig.design = {};
              projectConfig.design.authorBar = false;
              if (!Array.isArray(projectConfig.design.homeBlocks) || projectConfig.design.homeBlocks.length === 0 || !projectConfig.design.homeBlocks.some(b => b && b.type !== 'masthead' && b.type !== 'footer')) {
                projectConfig.design.homeBlocks = [
                  { id: 'b_masthead', type: 'masthead', x: 320, y: 0, w: 1280, h: 64, stretchWidth: false, config: {} },
                  { id: 'b_spotlight', type: 'spotlight', x: 320, y: 64, w: 1280, h: 256, stretchWidth: false, config: {} },
                  { id: 'b_categories', type: 'categories_shelf', x: 320, y: 320, w: 1280, h: 80, stretchWidth: false, config: { title: 'Category' } },
                  { id: 'b_feed', type: 'post_feed', x: 320, y: 400, w: 1280, h: 384, stretchWidth: false, config: { title: 'Recent Posts', limit: 6, cols: 2, layoutStyle: 'vertical' } },
                  { id: 'b_footer', type: 'footer', x: 320, y: 784, w: 1280, h: 64, stretchWidth: false, config: {} }
                ];
              }
            }
            if (data.domain) {
              projectConfig.domain = data.domain;
            }
            if (data.drafts !== undefined && data.drafts !== null) {
              const parsedDrafts = typeof data.drafts === 'string' ? JSON.parse(data.drafts) : data.drafts;
              if (Array.isArray(parsedDrafts)) {
                let localDrafts = null;
                const rawLocal = localStorage.getItem(STORAGE_KEY_DRAFTS) || localStorage.getItem(LEGACY_STORAGE_DRAFTS);
                if (rawLocal) {
                  try { localDrafts = JSON.parse(rawLocal); } catch (e) {}
                }
                const baseList = (Array.isArray(localDrafts) && localDrafts.length > 0)
                  ? localDrafts
                  : (Array.isArray(drafts) && drafts.length > 0 ? drafts : []);
                if (baseList.length > 0) {
                  const serverMap = new Map();
                  parsedDrafts.forEach(d => {
                    if (d.id) serverMap.set(d.id, d);
                    if (d.slug) serverMap.set(d.slug, d);
                  });
                  // Purge phantom posts from baseList
                  const sanitizedBase = baseList.filter(d => {
                    if (!d) return false;
                    if (d.type === 'post' && d.isCategoryAggregate) return false;
                    return true;
                  });
                  const merged = sanitizedBase.map(d => {
                    const s = serverMap.get(d.id) || serverMap.get(d.slug);
                    if (!s) return d;
                    const sTime = Number(s.updatedAt || 0);
                    const dTime = Number(d.updatedAt || 0);
                    // Keep whichever draft has the most recent updatedAt, protecting local edits
                    return (sTime > dTime) ? s : d;
                  });
                  const localKeys = new Set(sanitizedBase.map(d => d.id || d.slug));
                  parsedDrafts.forEach(d => {
                    if (!localKeys.has(d.id) && !localKeys.has(d.slug)) {
                      merged.push(d);
                    }
                  });
                  drafts = merged;
                } else {
                  drafts = parsedDrafts;
                }
                if (Array.isArray(drafts)) {
                  drafts = drafts.filter(d => {
                    if (!d) return false;
                    if (d.type === 'post' && d.isCategoryAggregate) return false;
                    return true;
                  });
                  drafts.forEach(d => {
                    healDraftMojibake(d);
                    if (d && d.type === 'page') {
                      if (d.status !== 'hidden') d.status = 'published';
                      if (d.hidden === undefined && d.retired === undefined) {
                        const s = (d.slug || '').toLowerCase().trim();
                        const id = (d.id || '').toLowerCase().trim();
                        const t = (d.title || '').toLowerCase().trim();
                        const isBuiltIn = id === 'page_about' || s === 'about' || t === 'about' ||
                                          id === 'page_links' || s === 'links' || t === 'links' ||
                                          id === 'page_rss' || s === 'rss' || t === 'rss';
                        if (!isBuiltIn) {
                          d.hidden = false;
                          d.retired = false;
                        }
                      }
                    }
                    if (d && d.type === 'page' && (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_'))) {
                      // preserve category title
                      // preserve category aggregate
                      d.coverImage = '';
                      delete d.featuredImage;
                    }
                    // preserve tag
                    if (Array.isArray(d.categories)) {
                      d.categories = d.categories.filter(c => Boolean(c));
                    }
                    if (d.type === 'post') {
                      const mdT = (d.markdown || '').trim();
                      const prT = (d.proseHtml || '').trim();
                      const htT = (d.html || '').trim();
                      const cvT = (d.coverImage || '').trim();
                      if (!mdT && (!prT || prT === '<p><br></p>' || prT === '<p></p>') && !htT && !cvT) {
                        d.images = [];
                        d.tempImages = [];
                        d.coverImage = '';
                        delete d.featuredImage;
                      }
                    }
                  });
                }
                window.drafts = drafts; window.OutpostPreview.drafts = drafts;
                try {
                  localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
                } catch (e) {}
              }
            }
            const rssPage = drafts.find(d => d.type === 'page' && (d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
            if (rssPage && typeof window.generateRssPageData === 'function') {
              const rssData = window.generateRssPageData(projectConfig);
              rssPage.subtitle = rssData.subtitle;
              rssPage.markdown = rssData.markdown;
              rssPage.proseHtml = rssData.proseHtml;
            }
            const existingCedarPage = drafts.find(d => d.type === 'page' && (d.slug === 'about-cedar' || d.id === 'page_about_cedar'));
            if (existingCedarPage) {
              existingCedarPage.subtitle = '';
              existingCedarPage.showSubtitle = false;
              if (existingCedarPage.markdown) {
                existingCedarPage.markdown = existingCedarPage.markdown.replace(/^#\s+About\s+Cedar\s*\n+/i, '');
              }
            }
            if (!drafts.some(d => d.type === 'page' && (d.slug === 'about-cedar' || d.id === 'page_about_cedar'))) {
              if (typeof window.createDefaultAboutCedarPage === 'function') {
                drafts.push(window.createDefaultAboutCedarPage());
              } else if (typeof createDefaultAboutCedarPage === 'function') {
                drafts.push(createDefaultAboutCedarPage());
              }
            }
          if (typeof indexImages === 'function') indexImages();
            if (Array.isArray(projectConfig.design.homeBlocks)) {
              projectConfig.design.homeBlocks = projectConfig.design.homeBlocks.filter(b => {
                if (!b || b.type === 'signage' || b.type === 'authors') return false;
                return true;
              });
            }
            applyThemeToPreview();
            window.__hasSyncedWithServer = true;
            maybeRenderApp();
          }
        } catch (e) {}
      }

      // Load state from localStorage or fallback
      // Load state from parent, memory, or localStorage fallback
      function loadWorkspaceData() {
        try {
          let parentHasProject = false;
          let parentHasDrafts = false;

          // Priority 0: Production static site bundle (window.__CEDAR_STATIC_DATA__)
          if (window.__CEDAR_STATIC_DATA__ && typeof window.__CEDAR_STATIC_DATA__ === 'object') {
            if (window.__CEDAR_STATIC_DATA__.project && typeof window.__CEDAR_STATIC_DATA__.project === 'object') {
              projectConfig = Object.assign(projectConfig, JSON.parse(JSON.stringify(window.__CEDAR_STATIC_DATA__.project)));
              window.projectConfig = projectConfig;
              parentHasProject = true;
            }
            if (Array.isArray(window.__CEDAR_STATIC_DATA__.drafts)) {
              drafts = JSON.parse(JSON.stringify(window.__CEDAR_STATIC_DATA__.drafts));
              window.drafts = drafts;
              window.CedarPreview.drafts = drafts;
              window.OutpostPreview.drafts = drafts;
              parentHasDrafts = true;
            }
            window.__hasSyncedWithServer = true;
          }

          // Priority 1: Check window.parent (iframe) or window.opener (new tab) on same origin
          const sourceWindow = (!parentHasProject && !parentHasDrafts)
            ? ((window.parent && window.parent !== window)
                ? window.parent
                : (window.opener && !window.opener.closed ? window.opener : null))
            : null;

          if (sourceWindow) {
            try {
              if (sourceWindow.projectConfig && typeof sourceWindow.projectConfig === 'object') {
                projectConfig = Object.assign(projectConfig, JSON.parse(JSON.stringify(sourceWindow.projectConfig)));
                window.projectConfig = projectConfig;
                parentHasProject = true;
              }
              const srcDrafts = (sourceWindow.CedarStore && typeof sourceWindow.CedarStore.getAllDrafts === 'function')
                ? sourceWindow.CedarStore.getAllDrafts()
                : sourceWindow.drafts;
              if (Array.isArray(srcDrafts) && srcDrafts.length > 0) {
                drafts = JSON.parse(JSON.stringify(srcDrafts));
                window.drafts = drafts;
                window.CedarPreview.drafts = drafts;
                window.OutpostPreview.drafts = drafts;
                parentHasDrafts = true;
              }
            } catch (err) {}
          }

          if (!parentHasProject) {
            const rawProject = localStorage.getItem(STORAGE_KEY_PROJECT);
            if (rawProject) {
              projectConfig = Object.assign(projectConfig, JSON.parse(rawProject));
              if (Array.isArray(projectConfig.categories)) {
                projectConfig.categories = projectConfig.categories.filter(c => {
                  const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
                  return val && val.toLowerCase() !== 'uncategorized' && val.toLowerCase() !== 'posts';
                });
              }
              window.projectConfig = projectConfig;
            }
          }
          if (!projectConfig.design) projectConfig.design = {};
          projectConfig.design.authorBar = false;
          if (!Array.isArray(projectConfig.design.homeBlocks) || projectConfig.design.homeBlocks.length === 0 || !projectConfig.design.homeBlocks.some(b => b && b.type !== 'masthead' && b.type !== 'footer')) {
            projectConfig.design.homeBlocks = [
              { id: 'b_masthead', type: 'masthead', x: 320, y: 0, w: 1280, h: 64, stretchWidth: false, config: {} },
              { id: 'b_spotlight', type: 'spotlight', x: 320, y: 64, w: 1280, h: 256, stretchWidth: false, config: {} },
              { id: 'b_categories', type: 'categories_shelf', x: 320, y: 320, w: 1280, h: 80, stretchWidth: false, config: { title: 'Category' } },
              { id: 'b_feed', type: 'post_feed', x: 320, y: 400, w: 1280, h: 384, stretchWidth: false, config: { title: 'Recent Posts', limit: 6, cols: 2, layoutStyle: 'vertical' } },
              { id: 'b_footer', type: 'footer', x: 320, y: 784, w: 1280, h: 64, stretchWidth: false, config: {} }
            ];
          }
          if (!window.__CEDAR_STATIC_DATA__) {
            const savedDomain = localStorage.getItem(STORAGE_KEY_DOMAIN);
            if (savedDomain && !projectConfig.domain) projectConfig.domain = savedDomain.trim();
            const savedRss = localStorage.getItem('cedar_rss_enabled') || localStorage.getItem('outpost_rss_enabled');
            const explicitlyDisabled = localStorage.getItem('cedar_rss_user_explicitly_disabled') === 'true';
            if (explicitlyDisabled) {
              projectConfig.rssEnabled = false;
            } else if (savedRss !== null) {
              projectConfig.rssEnabled = savedRss === 'true';
            } else if (projectConfig.rssEnabled === undefined) {
              projectConfig.rssEnabled = false;
            }
          } else if (projectConfig.rssEnabled === undefined) {
            projectConfig.rssEnabled = false;
          }

          // Priority 2: In-memory drafts assigned directly onto window.drafts
          if (!parentHasDrafts) {
            if (Array.isArray(window.drafts) && window.drafts.length > 0) {
              drafts = JSON.parse(JSON.stringify(window.drafts));
              parentHasDrafts = true;
            }
          }

          // Priority 3: Fallback to localStorage
          if (!parentHasDrafts) {
            const rawDrafts = localStorage.getItem(STORAGE_KEY_DRAFTS) || localStorage.getItem(LEGACY_STORAGE_DRAFTS);
            if (rawDrafts) {
              drafts = JSON.parse(rawDrafts);
            } else if (!Array.isArray(drafts)) {
              drafts = [];
            }
          }

          if (Array.isArray(drafts)) {
            drafts = drafts.filter(d => {
              if (!d) return false;
              if (d.type === 'post' && d.isCategoryAggregate) return false;
              return true;
            });
            drafts.forEach(d => {
              healDraftMojibake(d);
              if (d && d.type === 'page') {
                if (d.status !== 'hidden') d.status = 'published';
                if (d.hidden === undefined && d.retired === undefined) {
                  const s = (d.slug || '').toLowerCase().trim();
                  const id = (d.id || '').toLowerCase().trim();
                  const t = (d.title || '').toLowerCase().trim();
                  const isBuiltIn = id === 'page_about' || s === 'about' || t === 'about' ||
                                    id === 'page_links' || s === 'links' || t === 'links' ||
                                    id === 'page_rss' || s === 'rss' || t === 'rss';
                  if (!isBuiltIn) {
                    d.hidden = false;
                    d.retired = false;
                  }
                }
              }
              if (d && d.type === 'page' && (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_'))) {
                // preserve category title
                // preserve category aggregate
                d.coverImage = '';
                delete d.featuredImage;
              }
              // generic tags
              if (Array.isArray(d.categories)) {
                d.categories = d.categories.filter(c => Boolean(c));
              }
            });
          }
          window.drafts = drafts; window.OutpostPreview.drafts = drafts;

          // Filter out legacy placeholder pages and notes
          drafts = drafts.filter(d => {
            if (d.type === 'note') return false;
            if (d.type === 'page') {
              const t = (d.title || '').trim().toLowerCase();
              const s = (d.slug || '').trim().toLowerCase();
              return t !== 'contact & signals' && t !== 'page' && s !== 'contact' && s !== 'contact-signals' && s !== 'page';
            }
            return true;
          });

          // Deduplicate RSS and About pages in preview
          const rssMatches = drafts.filter(d => d && d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
          if (rssMatches.length > 1) {
            const keep = rssMatches.find(d => d.id === 'page_rss') || rssMatches[0];
            drafts = drafts.filter(d => !rssMatches.includes(d) || d === keep);
          }
          const aboutMatches = drafts.filter(d => d && d.type === 'page' && (d.id === 'page_about' || d.slug === 'about' || (d.title || '').trim().toLowerCase() === 'about'));
          if (aboutMatches.length > 1) {
            const keep = aboutMatches.find(d => d.id === 'page_about') || aboutMatches[0];
            drafts = drafts.filter(d => !aboutMatches.includes(d) || d === keep);
          }
          const isLinksDraft = (d) => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData));
          const linksMatches = drafts.filter(d => isLinksDraft(d));
          if (linksMatches.length > 0) {
            const keep = linksMatches.find(d => d.id === 'page_links') || linksMatches[0];
            keep.id = 'page_links';
            keep.slug = 'links';
            keep.type = 'page';
            keep.title = 'Links';
            delete keep.coverImage;
            delete keep.featuredImage;
            if (linksMatches.length > 1) {
              drafts = drafts.filter(d => !linksMatches.includes(d) || d === keep);
            }
          }

          const allMatches = drafts.filter(d => d && d.type === 'page' && (d.id === 'page_all' || d.slug === 'all' || (d.title || '').trim().toLowerCase() === 'all'));
          if (allMatches.length > 1) {
            const keep = allMatches.find(d => d.id === 'page_all') || allMatches[0];
            drafts = drafts.filter(d => !allMatches.includes(d) || d === keep);
          }

          const defAuth = projectConfig.defaultAuthor || '';
          const rssPage = drafts.find(d => d && d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
          if (!rssPage) {
            const rssData = (typeof window.generateRssPageData === 'function') ? window.generateRssPageData(getConfig()) : null;
            drafts.push({
              id: 'page_rss',
              type: 'page',
              status: 'published',
              title: 'RSS',
              slug: 'rss',
              subtitle: rssData ? rssData.subtitle : 'Subscribe to published articles via RSS feed syndication.',
              authorName: defAuth,
              authors: [defAuth],
              markdown: rssData ? rssData.markdown : '',
              proseHtml: rssData ? rssData.proseHtml : '',
              hidden: !projectConfig.rssEnabled,
              retired: !projectConfig.rssEnabled,
              date: new Date().toISOString().split('T')[0]
            });
          } else {
            const isRssOn = !rssPage.hidden && !rssPage.retired;
            projectConfig.rssEnabled = isRssOn;
            try { localStorage.setItem('cedar_rss_enabled', isRssOn ? 'true' : 'false'); } catch (e) {}
            if (typeof window.generateRssPageData === 'function') {
              const rssData = window.generateRssPageData(getConfig());
              if (!rssPage.markdown && !rssPage.proseHtml) {
                rssPage.subtitle = rssData.subtitle;
                rssPage.markdown = rssData.markdown;
                rssPage.proseHtml = rssData.proseHtml;
              }
            }
          }
          const existingAbout = drafts.find(d => d.type === 'page' && (d.slug === 'about' || (d.title || '').trim().toLowerCase() === 'about'));
          if (!existingAbout) {
            drafts.push({
              id: 'page_about',
              type: 'page',
              status: 'published',
              title: 'About',
              slug: 'about',
              subtitle: '',
              authorName: defAuth,
              authors: [defAuth],
              markdown: '',
              proseHtml: '',
              hidden: true,
              retired: true,
              date: new Date().toISOString().split('T')[0]
            });
          } else {
            const md = (existingAbout.markdown || '').trim();
            const isBoilerplateMd = !md || md.includes('Welcome to **Cedar**') || md.includes('Welcome to **Outpost**');
            if (isBoilerplateMd) {
              existingAbout.markdown = '';
              existingAbout.proseHtml = '';
            }
            if (existingAbout.subtitle === 'About this publication, its author, and philosophy.') {
              existingAbout.subtitle = '';
            }
            if (isBoilerplateMd && !existingAbout.subtitle) {
              existingAbout.hidden = true;
              existingAbout.retired = true;
            }
          }
          const existingLinks = drafts.find(d => isLinksDraft(d));
          if (!existingLinks) {
            drafts.push({
              id: 'page_links',
              type: 'page',
              status: 'published',
              title: 'Links',
              slug: 'links',
              subtitle: '',
              authorName: defAuth,
              authors: [defAuth],
              markdown: '',
              proseHtml: '',
              hidden: true,
              retired: true,
              date: new Date().toISOString().split('T')[0]
            });
          }
          const existingAll = drafts.find(d => d && d.type === 'page' && (d.id === 'page_all' || d.slug === 'all' || (d.title || '').trim().toLowerCase() === 'all'));
          if (!existingAll) {
            drafts.push({
              id: 'page_all',
              type: 'page',
              status: 'published',
              title: 'All',
              slug: 'all',
              subtitle: '',
              authorName: defAuth,
              authors: [defAuth],
              markdown: ':::recent-posts layout="grid":::',
              proseHtml: '<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="grid" contenteditable="false"></div>',
              layout: 'grid',
              hasHadRecentPostsInit: true,
              hidden: false,
              retired: false,
              date: new Date().toISOString().split('T')[0]
            });
          }
          if (typeof indexImages === 'function') indexImages();
          if (Array.isArray(projectConfig.design.homeBlocks)) {
            projectConfig.design.homeBlocks = projectConfig.design.homeBlocks.filter(b => {
              if (!b || b.type === 'signage' || b.type === 'authors') return false;
              return true;
            });
          }
          window.drafts = drafts;
          window.CedarPreview.drafts = drafts;
          window.OutpostPreview.drafts = drafts;
          applyThemeToPreview();
        } catch (e) {
          console.warn('[Preview] Could not load localStorage:', e);
          if (!Array.isArray(drafts)) drafts = [];
        }
      }

      function postMatchesCategory(post, categoryName) {
        if (!post || !categoryName) return false;
        const normCat = String(categoryName).trim().toLowerCase();
        if (normCat === 'all' || normCat === 'all posts' || normCat === 'all-posts' || normCat === 'page_all') return true;
        const target = normCat.replace(/-/g, ' ');
        const targetSlug = normCat.replace(/\s+/g, '-');

        const checkVal = (v) => {
          if (!v) return false;
          const str = String(v).trim().toLowerCase();
          const strSlug = str.replace(/\s+/g, '-');
          return str === target || strSlug === targetSlug || str.replace(/-/g, ' ') === target;
        };

        if (checkVal(post.tag)) return true;
        if (Array.isArray(post.categories)) {
          return post.categories.some(checkVal);
        }
        return false;
      }
      window.postMatchesCategory = postMatchesCategory;
      window.CedarPreview.postMatchesCategory = postMatchesCategory;

      // Safe HTML escaping
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function formatDate(dateStr) {
        if (!dateStr) return 'Recent';
        try {
          if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
            const parts = dateStr.trim().split('-').map(Number);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
          }
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return String(dateStr);
          const tz = (window.projectConfig && window.projectConfig.timezone) || undefined;
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
        } catch (e) {
          return String(dateStr);
        }
      }

      function calcReadTime(text) {
        if (!text) return '1 min read';
        const words = text.trim().split(/\s+/).length;
        const mins = Math.max(1, Math.ceil(words / 200));
        return `${mins} min read`;
      }

      function indexImages() {
        window.imageRegistry = window.imageRegistry || new Map();
        if (Array.isArray(drafts)) {
          drafts.forEach(d => {
            if (Array.isArray(d.images)) {
              d.images.forEach(img => {
                if (img && (img.filename || img.name)) {
                  const fn = (img.filename || img.name).trim();
                  window.imageRegistry.set(fn, img);
                  if (img.relativePath) window.imageRegistry.set(img.relativePath, img);
                  window.imageRegistry.set(`/blog/images/${fn}`, img);
                  window.imageRegistry.set(`blog/images/${fn}`, img);
                  window.imageRegistry.set(`images/${fn}`, img);
                }
              });
            }
          });
        }
        const mediaLib = (projectConfig && Array.isArray(projectConfig.mediaLibrary)) ? projectConfig.mediaLibrary : [];
        mediaLib.forEach(img => {
          if (img && (img.filename || img.name)) {
            const fn = (img.filename || img.name).trim();
            window.imageRegistry.set(fn, img);
            if (img.relativePath) window.imageRegistry.set(img.relativePath, img);
            window.imageRegistry.set(`/blog/images/${fn}`, img);
            window.imageRegistry.set(`blog/images/${fn}`, img);
            window.imageRegistry.set(`images/${fn}`, img);
          }
        });
      }

      function resolvePostImage(imgUrlOrObj, draft) {
        if (!imgUrlOrObj) return '';
        let target = '';
        if (typeof imgUrlOrObj === 'object') {
          target = imgUrlOrObj.dataUrl || imgUrlOrObj.data || imgUrlOrObj.url || imgUrlOrObj.src || imgUrlOrObj.filename || '';
        } else {
          target = String(imgUrlOrObj).trim();
        }
        if (!target) return '';

        // If target is already a data URL or external URL, return it
        if (/^(data:|blob:|https?:\/\/)/i.test(target)) {
          return target;
        }

        // Clean filename for registry matching
        const cleanName = target.split('/').pop().split('\\').pop();

        // 1. Check in draft.images and draft.tempImages if draft is provided
        const draftImgs = [
          ...(draft && Array.isArray(draft.images) ? draft.images : []),
          ...(draft && Array.isArray(draft.tempImages) ? draft.tempImages : [])
        ];
        if (draftImgs.length > 0) {
          const match = draftImgs.find(im => {
            if (!im) return false;
            const imFn = (im.filename || im.name || '').trim();
            const imPath = (im.relativePath || '').trim();
            return (imFn && imFn === cleanName) || (imPath && (imPath === target || imPath.endsWith(cleanName)));
          });
          if (match) {
            const res = match.dataUrl || match.data || match.url || match.src || match.relativePath;
            if (res) return res;
          }
        }

        // 2. Check in window.imageRegistry
        if (window.imageRegistry && typeof window.imageRegistry.get === 'function') {
          let reg = window.imageRegistry.get(target) ||
                    window.imageRegistry.get(cleanName) ||
                    window.imageRegistry.get(`/blog/images/${cleanName}`) ||
                    window.imageRegistry.get(`blog/images/${cleanName}`) ||
                    window.imageRegistry.get(`images/${cleanName}`);
          if (reg) {
            const res = typeof reg === 'object' ? (reg.dataUrl || reg.data || reg.url || reg.src || reg.relativePath) : reg;
            if (res) return res;
          }
        }

        // 3. Check in projectConfig.mediaLibrary
        const mediaLib = (window.projectConfig && Array.isArray(window.projectConfig.mediaLibrary))
          ? window.projectConfig.mediaLibrary
          : [];
        const mediaMatch = mediaLib.find(im => {
          if (!im) return false;
          const imFn = (im.filename || im.name || '').trim();
          return (imFn && imFn === cleanName) || (im.url && im.url === target);
        });
        if (mediaMatch) {
          const res = mediaMatch.dataUrl || mediaMatch.data || mediaMatch.url || mediaMatch.src || mediaMatch.relativePath;
          if (res) return res;
        }

        // 4. Check across all drafts in memory ONLY IF no draft was provided
        if (!draft && Array.isArray(drafts)) {
          for (const d of drafts) {
            const dImgs = [
              ...(Array.isArray(d.images) ? d.images : []),
              ...(Array.isArray(d.tempImages) ? d.tempImages : [])
            ];
            const dMatch = dImgs.find(im => {
              if (!im) return false;
              const imFn = (im.filename || im.name || '').trim().toLowerCase();
              const imPath = (im.relativePath || '').trim().toLowerCase();
              return cleanName && cleanName.length >= 3 && (imFn === cleanName.toLowerCase() || imPath.endsWith('/' + cleanName.toLowerCase()));
            });
            if (dMatch) {
              const res = dMatch.dataUrl || dMatch.data || dMatch.url || dMatch.src || dMatch.relativePath;
              if (res) return res;
            }
          }
        }

        if (draft && draft.slug && cleanName && !target.startsWith('/') && !target.includes('/')) {
          const baseFolder = draft.type === 'page' ? 'pages' : 'blog';
          return `/${baseFolder}/published/${encodeURIComponent(draft.slug)}/${cleanName}`;
        }

        return target;
      }

      function getPostFeaturedImage(post) {
        if (!post) return '';

        // If post explicitly had its cover removed, do not auto-pick a thumbnail
        if (post.coverImageRemoved) return '';

        // 1. Explicit cover or featured fields
        const explicitCandidates = [
          post.coverImage,
          post.featuredImage,
          post.coverImageOriginal
        ].filter(Boolean);

        for (const cand of explicitCandidates) {
          const r = resolvePostImage(cand, post);
          if (r) return r;
        }

        // 2. If post has no body content and no markdown/HTML, it has no featured image
        const md = typeof post.markdown === 'string' ? post.markdown : '';
        const prose = typeof post.proseHtml === 'string' ? post.proseHtml : '';
        const html = typeof post.html === 'string' ? post.html : '';
        const contentStr = (md + ' ' + prose + ' ' + html).trim();
        if (!contentStr || contentStr === '<p><br></p>' || contentStr === '<p></p>') {
          return '';
        }

        // 3. Attached images that are actually referenced in the post's content
        if (Array.isArray(post.images) && post.images.length > 0) {
          for (const im of post.images) {
            if (!im) continue;
            const fn = im.filename || (typeof im === 'string' ? im.split('/').pop().split('\\').pop() : '');
            const rel = im.relativePath || (typeof im === 'string' ? im : '');
            const src = im.src || '';
            const isUsed = (fn && contentStr.includes(fn)) || (rel && contentStr.includes(rel)) || (src && contentStr.includes(src));
            if (isUsed) {
              const r = resolvePostImage(im, post);
              if (r) return r;
            }
          }
        }

        // 4. First markdown image syntax ![...](...)
        if (md) {
          const match = md.match(/!\[.*?\]\((.*?)\)/);
          if (match && match[1]) {
            const r = resolvePostImage(match[1].trim(), post);
            if (r) return r;
          }
        }

        // 5. First HTML image syntax <img ... src="..." ...>
        if (prose || html) {
          const match = (prose + ' ' + html).match(/<img[^>]+src=["']([^"']+)["']/i);
          if (match && match[1]) {
            const r = resolvePostImage(match[1].trim(), post);
            if (r) return r;
          }
        }

        return '';
      }

      function getAuthorAvatar(authorNameOrObj) {
        if (!authorNameOrObj) return '';
        let avatarVal = '';
        if (typeof authorNameOrObj === 'object') {
          avatarVal = authorNameOrObj.avatar || authorNameOrObj.image || authorNameOrObj.photo || authorNameOrObj.authorAvatar || '';
        }
        const name = typeof authorNameOrObj === 'object' ? (authorNameOrObj.name || '') : String(authorNameOrObj).trim();

        if (!avatarVal) {
          // Search in current in-scope projectConfig as well as window.projectConfig
          const authorsList = (projectConfig && Array.isArray(projectConfig.authors))
            ? projectConfig.authors
            : ((window.projectConfig && Array.isArray(window.projectConfig.authors)) ? window.projectConfig.authors : []);

          if (name) {
            const found = authorsList.find(a => {
              if (!a) return false;
              const aName = (typeof a === 'object' ? a.name : String(a)).trim().toLowerCase();
              return aName === name.toLowerCase();
            });
            if (found && typeof found === 'object') {
              avatarVal = found.avatar || found.image || found.photo || '';
            }
          }

          // Fallback: If only 1 author configured or matches defaultAuthor
          if (!avatarVal && authorsList.length > 0) {
            const def = (projectConfig && projectConfig.defaultAuthor) || (window.projectConfig && window.projectConfig.defaultAuthor) || '';
            if (!name || (def && name.toLowerCase() === def.toLowerCase()) || authorsList.length === 1) {
              const first = authorsList[0];
              if (first && typeof first === 'object') {
                avatarVal = first.avatar || first.image || first.photo || '';
              }
            }
          }

          // Fallback: Search localStorage directly
          if (!avatarVal && typeof localStorage !== 'undefined') {
            try {
              const storedProj = JSON.parse(localStorage.getItem('cedar_project') || localStorage.getItem(STORAGE_KEY_PROJECT) || localStorage.getItem('outpost_project') || '{}');
              if (Array.isArray(storedProj.authors)) {
                const found = storedProj.authors.find(a => {
                  if (!a) return false;
                  const aName = (typeof a === 'object' ? a.name : String(a)).trim().toLowerCase();
                  return !name || aName === name.toLowerCase();
                });
                if (found && typeof found === 'object') {
                  avatarVal = found.avatar || found.image || found.photo || '';
                }
              }
              if (!avatarVal) {
                avatarVal = localStorage.getItem('cedar_user_avatar') || localStorage.getItem('outpost_user_avatar') || '';
              }
            } catch (e) {}
          }
        }

        if (!avatarVal) return '';
        let res = resolvePostImage(avatarVal);
        if (res && !/^(https?:|data:|blob:|\/)/i.test(res)) {
          res = '/' + res;
        }
        return res;
      }


      // Render Branding across Header & Footer


  window.CedarPreview.STORAGE_KEY_DRAFTS = STORAGE_KEY_DRAFTS;
  window.OutpostPreview.STORAGE_KEY_DRAFTS = STORAGE_KEY_DRAFTS;
  window.CedarPreview.STORAGE_KEY_PROJECT = STORAGE_KEY_PROJECT;
  window.OutpostPreview.STORAGE_KEY_PROJECT = STORAGE_KEY_PROJECT;
  window.CedarPreview.getWorkspaceFingerprint = getWorkspaceFingerprint;
  window.OutpostPreview.getWorkspaceFingerprint = getWorkspaceFingerprint;
  window.CedarPreview.syncWithServer = syncWithServer;
  window.OutpostPreview.syncWithServer = syncWithServer;
  window.CedarPreview.loadWorkspaceData = loadWorkspaceData;
  window.OutpostPreview.loadWorkspaceData = loadWorkspaceData;
  window.CedarPreview.escapeHtml = escapeHtml;
  window.OutpostPreview.escapeHtml = escapeHtml;
  window.CedarPreview.formatDate = formatDate;
  window.OutpostPreview.formatDate = formatDate;
  window.CedarPreview.calcReadTime = calcReadTime;
  window.OutpostPreview.calcReadTime = calcReadTime;
  window.CedarPreview.indexImages = indexImages;
  window.OutpostPreview.indexImages = indexImages;
  window.CedarPreview.resolvePostImage = resolvePostImage;
  window.OutpostPreview.resolvePostImage = resolvePostImage;
  window.CedarPreview.getPostFeaturedImage = getPostFeaturedImage;
  window.OutpostPreview.getPostFeaturedImage = getPostFeaturedImage;
  window.CedarPreview.getAuthorAvatar = getAuthorAvatar;
  window.OutpostPreview.getAuthorAvatar = getAuthorAvatar;

  function setDrafts(d) {
    if (Array.isArray(d)) {
      d.forEach(healDraftMojibake);
      drafts = d;
      window.drafts = drafts;
      window.CedarPreview.drafts = drafts;
      window.OutpostPreview.drafts = drafts;
    }
  }

  function setProjectConfig(cfg) {
    if (cfg && typeof cfg === 'object') {
      projectConfig = cfg;
      window.projectConfig = projectConfig;
    }
  }

  window.CedarPreview.setDrafts = setDrafts;
  window.OutpostPreview.setDrafts = setDrafts;
  window.CedarPreview.setProjectConfig = setProjectConfig;
  window.OutpostPreview.setProjectConfig = setProjectConfig;

  window.getWorkspaceFingerprint = getWorkspaceFingerprint;
  window.syncWithServer = syncWithServer;
  window.loadWorkspaceData = loadWorkspaceData;
  window.escapeHtml = escapeHtml;
  window.formatDate = formatDate;
  window.calcReadTime = calcReadTime;
  window.indexImages = indexImages;
  window.resolvePostImage = resolvePostImage;
  window.getPostFeaturedImage = getPostFeaturedImage;
  window.getAuthorAvatar = getAuthorAvatar;
  window.setDrafts = setDrafts;
  window.setProjectConfig = setProjectConfig;
})();
