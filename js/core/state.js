/**

 * Cedar - State Management & Storage Persistence

 */

(function () {

  'use strict';



  window.Cedar = window.Cedar || window.Outpost || {};

  window.Outpost = window.Cedar;

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



  // --- Constants & Storage Keys ---

  window.STORAGE_KEY_DRAFTS = 'sheesh_static_writer_drafts_v2';

  window.STORAGE_KEY_ACTIVE = 'sheesh_static_writer_active_id_v2';

  window.STORAGE_KEY_PROJECT = 'sheesh_static_writer_project_v1';

  window.STORAGE_KEY_DOMAIN = 'cedar_user_domain';

  window.STORAGE_KEY_BLOG_PATH = 'cedar_user_blog_path';

  window.STORAGE_KEY_RSS_ENABLED = 'cedar_rss_enabled';

  window.STORAGE_KEY_LAYOUT_OVERRIDE = 'cedar_layout_override';

  window.LEGACY_STORAGE_DRAFTS = 'sheesh_static_writer_drafts';

  window.LEGACY_STORAGE_ACTIVE = 'sheesh_static_writer_active_id';



  // --- Global Application State ---

  let drafts = window.drafts || [];

  let currentDraft = window.currentDraft || null;

  let projectConfig = window.projectConfig || null;

  try {

    Object.defineProperty(window, 'currentDraft', {

      get() { return currentDraft; },

      set(v) { currentDraft = v; },

      configurable: true

    });

    let draftsProxy = null;
    function getDraftsProxy() {
      if (!draftsProxy && typeof Proxy !== 'undefined') {
        const dummyTarget = [];
        draftsProxy = new Proxy(dummyTarget, {
          get(target, prop, receiver) {
            const store = window.CedarStore;
            if (!store || typeof store.getAllDrafts !== 'function') {
              return Reflect.get(drafts, prop, receiver);
            }
            if (prop === 'length') {
              return store.getAllDrafts().length;
            }
            if (typeof prop === 'string' && !isNaN(prop)) {
              return store.getAllDrafts()[Number(prop)];
            }
            if (prop === Symbol.iterator) {
              return function* () {
                const all = store.getAllDrafts();
                for (const it of all) yield it;
              };
            }
            if (prop === 'push') {
              return function (...items) {
                items.forEach(it => {
                  if (it && it.id) store.upsert(it);
                });
                return store.getAllDrafts().length;
              };
            }
            if (prop === 'unshift') {
              return function (...items) {
                items.forEach(it => {
                  if (it && it.id) store.upsert(it);
                });
                return store.getAllDrafts().length;
              };
            }
            if (prop === 'splice') {
              return function (start, deleteCount, ...items) {
                const all = store.getAllDrafts();
                const s = start < 0 ? Math.max(0, all.length + start) : Math.min(start, all.length);
                const cnt = deleteCount === undefined ? all.length - s : Math.min(deleteCount, all.length - s);
                const removed = [];
                for (let i = 0; i < cnt; i++) {
                  const rem = all[s + i];
                  if (rem && rem.id) {
                    store.remove(rem.id);
                    removed.push(rem);
                  }
                }
                items.forEach(it => {
                  if (it && it.id) store.upsert(it);
                });
                return removed;
              };
            }
            // Delegate all standard array methods (find, filter, map, forEach, some, every, slice, etc.)
            const all = store.getAllDrafts();
            const val = all[prop];
            if (typeof val === 'function') {
              return val.bind(all);
            }
            return val;
          },
          set(target, prop, value, receiver) {
            const store = window.CedarStore;
            if (store && typeof prop === 'string' && !isNaN(prop) && value && value.id) {
              store.upsert(value);
              return true;
            }
            return Reflect.set(drafts, prop, value);
          }
        });
      }
      return draftsProxy || drafts;
    }

    Object.defineProperty(window, 'drafts', {

      get() {
        return getDraftsProxy();
      },

      set(v) {
        if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function' && Array.isArray(v)) {
          if (!window.CedarStore._isHydrating) {
            window.CedarStore.hydrateFromList(v);
          }
        } else {
          drafts.length = 0;
          if (Array.isArray(v)) {
            for (let i = 0; i < v.length; i++) drafts.push(v[i]);
          }
        }
      },

      configurable: true

    });

    Object.defineProperty(window, 'projectConfig', {

      get() { return projectConfig; },

      set(v) { projectConfig = v; },

      configurable: true

    });

  } catch (e) {

    window.drafts = drafts;

    window.currentDraft = currentDraft;

    window.projectConfig = projectConfig;

  }

  window.saveTimeout = null;

  window.activeMode = 'canvas'; // 'canvas' | 'markdown'

  window.savedSelectionRange = null;

  window.currentView = 'dashboard'; // 'dashboard' | 'editor'

  window.currentDashboardTab = 'home'; // 'home' | 'posts' | 'pages' | 'media' | 'categories' | 'export'

  window.quickIdeasExpanded = false;



  window.getDefaultProjectConfig = function() {

    return {

      schemaVersion: 150,

      buildToken: 'v150',

      name: 'Cedar',

      subtitle: '',

      description: 'Cedar Studio',

      domain: '',

      blogPath: 'blog',

      baseUrl: '/blog/',

      rssEnabled: false,

      layoutOverride: false,

      createdAt: Date.now(),

      createdYear: new Date().getFullYear(),

      defaultAuthor: (typeof localStorage !== 'undefined' && (localStorage.getItem('cedar_active_author') || localStorage.getItem('outpost_active_author'))) || '',

      defaultCategory: 'Uncategorized',

      authors: [],

      categories: [],

      autoCategoryPages: true,

      sanitizeImages: true,

      mediaPreferences: {

        roundedImages: false

      },

      activityLog: [],

      milestones: [],

      mediaLibrary: [],

      deletedImages: [],

      design: {

        snapEnabled: true,

        gridSize: 160,

        canvasWidth: 1920,

        containerWidth: 1280,

        columns: 8,

        containerLocked: true,

        scaleMode: 'auto',

        deviceMode: 'desktop',

        activeTheme: 'gaslamp_gazette',

        headerAlign: 'center',

        brandingMode: 'both',

        featured: true,

        featuredMode: 'latest',

        postLayout: 'grid',

        categoryBar: true,

        stickyHeader: false,

        branding: {

          generalLogo: 'images/Lamp.png',

          tabLogo: 'icon.png',

          siteTitle: 'Cedar',

          tagline: '',

          signage: 'EST. 2026 // GASLAMP CO.',

          footerNotice: 'Published from the Cedar Static Engine. All rights reserved.',

          accentGlow: 'amber'

        },

        mastheadPresets: {},

        masthead: {

          align: 'center',

          height: 96,

          snapGrid: 16,

          snapEnabled: true,

          uiVisible: true,

          gridVisible: true,

          image2SpacingDefault: true,

          elements: {

            logo: { enabled: true, x: 96, y: 144, size: 48, scale: 1.0 },

            title: { enabled: true, x: 144, y: 160, scale: 1.0 }

          }

        },

        homeBlocks: [

          { id: 'b_masthead', type: 'masthead', x: 0, relX: 0, y: 0, w: 1920, h: 96, align: 'center', stretchWidth: true, config: { align: 'center' } },

          { id: 'b_spotlight', type: 'spotlight', x: 0, relX: 0, y: 96, w: 1920, h: 400, config: { layout: 'standard', featuredMode: 'latest', featuredCategory: '' } },

          { id: 'b_categories', type: 'categories_shelf', x: 320, relX: 0, y: 496, w: 1280, h: 80, config: { title: 'Category' } },

          { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 576, w: 1280, h: 384, stretchWidth: false, config: { title: 'Latest Publications', limit: 4, cols: 2, layoutStyle: 'vertical' } },

          { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 960, w: 1280, h: 64, stretchWidth: false, config: {} }

        ]

      }

    };

  };



  projectConfig = window.getDefaultProjectConfig();

  window.projectConfig = projectConfig;



  window.resolveProjectSiteName = function() {

    let name = (projectConfig.name || '').trim();

    if (name === 'My Blog Slice') name = '';

    const domain = (projectConfig.domain || localStorage.getItem(STORAGE_KEY_DOMAIN) || '').trim();

    if (!name && domain) {

      name = domain;

      projectConfig.name = domain;

    }

    return name;

  };



  window.resolveProjectDomain = function() {

    let domain = (projectConfig.domain || localStorage.getItem(STORAGE_KEY_DOMAIN) || '').trim();

    domain = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    return domain;

  };



  window.resolveProjectBlogPath = function() {

    let rawPath = projectConfig.blogPath;

    if (rawPath === undefined || rawPath === null) {

      const stored = localStorage.getItem(STORAGE_KEY_BLOG_PATH);

      rawPath = (stored !== null && stored !== undefined) ? stored : 'blog';

    }

    rawPath = String(rawPath).trim();

    rawPath = rawPath.replace(/^\/+|\/+$/g, '');

    rawPath = rawPath.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');

    return rawPath;

  };



  window.resolveProjectLiveUrl = function() {

    const domain = window.resolveProjectDomain();

    if (!domain) return '';

    const blogPath = window.resolveProjectBlogPath();

    return blogPath ? `https://${domain}/${blogPath}/` : `https://${domain}/`;

  };



  window.resolveProjectLocalUrl = function(hash) {
    const targetHash = hash || '#/';
    const normalizedHash = targetHash.startsWith('#') ? targetHash : '#' + targetHash;
    if (typeof window !== 'undefined' && window.location && window.location.href && !window.location.href.startsWith('file:')) {
      if (window.location.port === '8081') {
        return `${window.location.origin}/${hash || ''}`;
      }
      try {
        return new URL('preview.html' + normalizedHash, window.location.href).href;
      } catch (e) {}
    }
    return `http://localhost:8080/preview.html${normalizedHash}`;
  };



  window.resolveProjectRssEnabled = function() {

    const draftsList = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []);

    const rssDraft = draftsList.find(d => d && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));

    if (rssDraft) {

      const isVisible = !rssDraft.hidden && !rssDraft.retired;

      if (window.projectConfig) {

        window.projectConfig.rssEnabled = isVisible;

      }

      return isVisible;

    }

    if (window.projectConfig && typeof window.projectConfig.rssEnabled === 'boolean') {

      return window.projectConfig.rssEnabled;

    }

    try {

      const stored = localStorage.getItem(STORAGE_KEY_RSS_ENABLED);

      if (stored !== null) {

        return stored === 'true';

      }

    } catch (e) {}

    return false;

  };



  window.resolveProjectLayoutOverride = function() {

    if (window.projectConfig && typeof window.projectConfig.layoutOverride === 'boolean') {

      return window.projectConfig.layoutOverride;

    }

    try {

      const stored = localStorage.getItem(window.STORAGE_KEY_LAYOUT_OVERRIDE || 'cedar_layout_override');

      if (stored !== null) {

        return stored === 'true';

      }

    } catch (e) {}

    return false;

  };



  window.resolveProjectDefaultAuthor = function() {

    let auth = (projectConfig.defaultAuthor || '').trim();

    if (auth === 'My Blog Slice' || auth === 'sheesh') auth = '';





    // If no valid default author, check active notes author from localStorage

    if (!auth) {

      try {

        const activeAuth = ((localStorage.getItem('cedar_active_author') || localStorage.getItem('outpost_active_author')) || '').trim();

        if (activeAuth && activeAuth !== 'My Blog Slice' && activeAuth !== 'sheesh') {

          auth = activeAuth;

        }

      } catch (e) {}

    }



    // If still no valid default author, pick the first active non-retired author

    if (!auth && Array.isArray(projectConfig.authors)) {

      const firstActive = projectConfig.authors.find(a => {

        if (typeof a === 'object' && a !== null) {

          return !a.retired && a.name && a.name !== 'My Blog Slice' && a.name !== 'sheesh';

        }

        return a && a !== 'My Blog Slice' && a !== 'sheesh';

      });

      if (firstActive) {

        auth = window.getAuthorName(firstActive);

      }

    }



    // Check drafts for an author name if available

    if (!auth && Array.isArray(window.drafts)) {

      const dAuthor = window.drafts.find(d => d && (d.authorName || d.author));

      if (dAuthor) {

        const dName = (dAuthor.authorName || dAuthor.author || '').trim();

        if (dName && dName !== 'My Blog Slice' && dName !== 'sheesh') {

          auth = dName;

        }

      }

    }



    // Never fall back to site name / blog title

    if (!auth) {

      try {

        const stored = (localStorage.getItem('cedar_active_author') || localStorage.getItem('outpost_active_author') || '').trim();

        if (stored && stored !== 'My Blog Slice' && stored !== 'sheesh') {

          auth = stored;

        }

      } catch (e) {}

    }

    if (!auth) {

      auth = '';

    }



    // Every site HAS to have a default author - persist it

    projectConfig.defaultAuthor = auth;



    // Ensure this default author exists in projectConfig.authors

    if (auth && Array.isArray(projectConfig.authors)) {

      const authLower = auth.toLowerCase();

      const match = projectConfig.authors.find(a => {

        const aName = (typeof window.getAuthorName === 'function' ? window.getAuthorName(a) : (a?.name || a)) || '';

        return aName.trim().toLowerCase() === authLower;

      });

      if (!match) {

        projectConfig.authors.unshift(window.normalizeAuthorObject(auth));

      }

    }



    return auth;

  };



  window.getActiveNotesAuthorName = function() {

    return (typeof window.resolveProjectDefaultAuthor === 'function')

      ? window.resolveProjectDefaultAuthor()

      : ((projectConfig && projectConfig.defaultAuthor) || '');

  };



  window.getActiveNotesAuthorObj = function() {

    const name = window.getActiveNotesAuthorName();

    return (typeof window.normalizeAuthorObject === 'function')

      ? window.normalizeAuthorObject(name)

      : { name: name, avatar: '', bio: '', joinDate: 'Joined 2026', retired: false };

  };



  window.setActiveNotesAuthor = function(name) {};





  window.formatAuthorsString = function(authors) {

    if (!authors) return '';

    let names = [];

    if (Array.isArray(authors)) {

      names = authors.map(a => {

        if (typeof window.getAuthorName === 'function') return window.getAuthorName(a);

        return (typeof a === 'object' && a !== null ? (a.name || '') : String(a || ''));

      }).map(s => s.trim()).filter(Boolean);

    } else if (typeof authors === 'string') {

      const trimmed = authors.trim();

      if (!trimmed) return '';

      return trimmed;

    }

    const uniqueNames = [];

    names.forEach(n => {

      if (!uniqueNames.some(u => u.toLowerCase() === n.toLowerCase())) uniqueNames.push(n);

    });

    if (uniqueNames.length === 0) return '';

    if (uniqueNames.length === 1) return uniqueNames[0];

    if (uniqueNames.length === 2) return `${uniqueNames[0]} & ${uniqueNames[1]}`;

    return `${uniqueNames.slice(0, -1).join(', ')} & ${uniqueNames[uniqueNames.length - 1]}`;

  };



  window.formatAuthorsByline = function(authors) {

    const str = window.formatAuthorsString(authors);

    return str ? `By ${str}` : '';

  };



  window.getAuthorName = function(a) {

    if (!a) return '';

    return typeof a === 'object' ? (a.name || '').trim() : String(a).trim();

  };



  window.normalizeAuthorObject = function(a, defaultJoinDate) {

    if (!a) return null;

    const nowIso = new Date().toISOString().split('T')[0];

    if (typeof a === 'string') {

      const name = a.trim();

      return {

        name: name,

        avatar: '',

        banner: '',

        bio: '',

        joinDate: defaultJoinDate || ('Joined ' + new Date().getFullYear()),

        retired: false

      };

    }

    const name = (a.name || '').trim();

    let date = (a.joinDate || '').trim();

    if (!date) date = defaultJoinDate || ('Joined ' + new Date().getFullYear());

    let avatar = (a.avatar || '').trim();

    const avLower = avatar.toLowerCase();

    const banner = (a.banner || a.background || '').trim();

    return {

      name: name,

      avatar: avatar,

      banner: banner,

      bio: a.bio || '',

      joinDate: date,

      retired: Boolean(a.retired)

    };

  };



  window.replaceDefaultAuthorEverywhere = function(oldAuthor, newAuthor) {

    oldAuthor = (oldAuthor || '').trim();

    newAuthor = (newAuthor || '').trim();

    if (!newAuthor || oldAuthor.toLowerCase() === newAuthor.toLowerCase()) return false;



    // 1. In projectConfig.authors: replace old default author with new default author

    if (!Array.isArray(projectConfig.authors)) projectConfig.authors = [];

    const idx = projectConfig.authors.findIndex(a => (window.getAuthorName(a) || '').toLowerCase() === oldAuthor.toLowerCase());

    if (idx !== -1) {

      if (typeof projectConfig.authors[idx] === 'object' && projectConfig.authors[idx] !== null) {

        projectConfig.authors[idx].name = newAuthor;

      } else {

        projectConfig.authors[idx] = window.normalizeAuthorObject(newAuthor);

      }

    } else if (!projectConfig.authors.some(a => (window.getAuthorName(a) || '').toLowerCase() === newAuthor.toLowerCase())) {

      projectConfig.authors.unshift(window.normalizeAuthorObject(newAuthor));

    }

    // Clean and deduplicate authors while preserving existing avatars & bios

    const authorMap = new Map();

    projectConfig.authors.forEach(a => {

      const norm = window.normalizeAuthorObject(a);

      if (!norm || !norm.name || norm.name === 'My Blog Slice' || norm.name === 'sheesh') return;

      const lower = norm.name.toLowerCase();

      if (!authorMap.has(lower)) {

        authorMap.set(lower, norm);

      } else {

        const existing = authorMap.get(lower);

        if (!existing.avatar && norm.avatar) existing.avatar = norm.avatar;

        if (!existing.banner && norm.banner) existing.banner = norm.banner;

        if (!existing.bio && norm.bio) existing.bio = norm.bio;

        if ((!existing.joinDate || existing.joinDate === 'Joined 2026' || existing.joinDate === '2026') && norm.joinDate) {

          existing.joinDate = norm.joinDate;

        }

      }

    });

    projectConfig.authors = Array.from(authorMap.values());



    // 2. In drafts: update all instances where oldAuthor was used

    let draftsChanged = false;

    if (oldAuthor && Array.isArray(window.drafts)) {

      window.drafts.forEach(d => {

        let changed = false;

        if (d.authorName === oldAuthor) {

          d.authorName = newAuthor;

          changed = true;

        } else if (d.authorName && d.authorName.includes(oldAuthor)) {

          const parts = d.authorName.split(',').map(p => p.trim());

          if (parts.includes(oldAuthor)) {

            d.authorName = parts.map(p => p === oldAuthor ? newAuthor : p).join(', ');

            changed = true;

          }

        }

        if (Array.isArray(d.authors)) {

          if (d.authors.includes(oldAuthor)) {

            d.authors = d.authors.map(a => a === oldAuthor ? newAuthor : a);

            d.authors = Array.from(new Set(d.authors));

            d.authorName = (typeof window.formatAuthorsString === 'function') ? window.formatAuthorsString(d.authors) : d.authors.join(', ');

            changed = true;

          }

        }

        if (changed) {

          if (d.authorName) {

            d.authorInitial = d.authorName.charAt(0).toUpperCase();

          }

          d.updatedAt = Date.now();

          draftsChanged = true;

        }

      });

    }



    // 3. Check currentDraft

    if (oldAuthor && window.currentDraft) {

      let curChanged = false;

      if (window.currentDraft.authorName === oldAuthor) {

        window.currentDraft.authorName = newAuthor;

        curChanged = true;

      } else if (window.currentDraft.authorName && window.currentDraft.authorName.includes(oldAuthor)) {

        const parts = window.currentDraft.authorName.split(',').map(p => p.trim());

        if (parts.includes(oldAuthor)) {

          window.currentDraft.authorName = parts.map(p => p === oldAuthor ? newAuthor : p).join(', ');

          curChanged = true;

        }

      }

      if (Array.isArray(window.currentDraft.authors) && window.currentDraft.authors.includes(oldAuthor)) {

        window.currentDraft.authors = window.currentDraft.authors.map(a => a === oldAuthor ? newAuthor : a);

        window.currentDraft.authors = Array.from(new Set(window.currentDraft.authors));

        window.currentDraft.authorName = (typeof window.formatAuthorsString === 'function') ? window.formatAuthorsString(window.currentDraft.authors) : window.currentDraft.authors.join(', ');

        curChanged = true;

      }

      if (curChanged) {

        if (window.currentDraft.authorName) {

          window.currentDraft.authorInitial = window.currentDraft.authorName.charAt(0).toUpperCase();

        }

        window.currentDraft.updatedAt = Date.now();

        draftsChanged = true;

      }

    }



    if (draftsChanged && typeof saveDraftsToStorage === 'function') {

      saveDraftsToStorage();

    }



    if (typeof window.renderAllPostsGrid === 'function') {

      window.renderAllPostsGrid();

    }

    if (typeof window.renderPostsPipeline === 'function') {

      window.renderPostsPipeline();

    }

    if (typeof window.renderSetupAuthorChips === 'function') {

      window.renderSetupAuthorChips();

    }



    return true;

  };



  window.reconcileAuthorsFromDrafts = function() {

    if (typeof projectConfig === 'undefined' || !projectConfig) return false;

    if (!Array.isArray(projectConfig.authors)) projectConfig.authors = [];



    const isDeletedAuthor = (name) => {

      if (!name || !Array.isArray(projectConfig.deletedAuthors)) return false;

      const lower = name.trim().toLowerCase();

      return projectConfig.deletedAuthors.some(d => (typeof d === 'string' ? d.trim().toLowerCase() : '') === lower);

    };



    let changed = false;

    const authorPool = new Map(); // lowercase name -> { displayName, avatar, earliestTime }



    // 1. Gather all authors from drafts (posts, notes, replies)

    const allDrafts = (Array.isArray(window.drafts) && window.drafts.length > 0)

      ? window.drafts

      : (typeof drafts !== 'undefined' && Array.isArray(drafts) ? drafts : []);



    if (Array.isArray(allDrafts)) {

      allDrafts.forEach(d => {

        if (!d) return;

        const candidateNames = [];

        if (d.authorName && typeof d.authorName === 'string') {

          d.authorName.split(',').forEach(n => candidateNames.push(n.trim()));

        }

        if (Array.isArray(d.authors)) {

          d.authors.forEach(a => {

            const aName = (typeof a === 'string') ? a.trim() : (a && a.name ? a.name.trim() : '');

            if (aName) candidateNames.push(aName);

          });

        }

        if (d.author && typeof d.author === 'string') {

          candidateNames.push(d.author.trim());

        }



        const draftAvatar = d.authorAvatar || '';

        const created = d.createdAt || d.updatedAt || Date.now();



        candidateNames.forEach(rawName => {

          if (!rawName || rawName === 'My Blog Slice' || rawName === 'sheesh' || isDeletedAuthor(rawName)) return;

          const lower = rawName.toLowerCase();

          if (!authorPool.has(lower)) {

            authorPool.set(lower, {

              displayName: rawName,

              avatar: draftAvatar,

              earliestTime: created

            });

          } else {

            const existing = authorPool.get(lower);

            if (!existing.avatar && draftAvatar) {

              existing.avatar = draftAvatar;

            }

            if (created < existing.earliestTime) {

              existing.earliestTime = created;

            }

          }

        });

      });

    }



    // 2. Gather from activityLog if present

    if (projectConfig && Array.isArray(projectConfig.activityLog)) {

      projectConfig.activityLog.forEach(item => {

        if (!item || !item.data) return;

        if (item.action === 'deleted' || item.data.action === 'deleted') return;

        const rawName = item.data.authorName || '';

        if (!rawName || rawName === 'My Blog Slice' || rawName === 'sheesh' || isDeletedAuthor(rawName)) return;

        const lower = rawName.toLowerCase();

        const avatar = item.data.authorAvatar || '';

        const created = item.timestamp || Date.now();

        if (!authorPool.has(lower)) {

          authorPool.set(lower, {

            displayName: rawName,

            avatar: avatar,

            earliestTime: created

          });

        } else {

          const existing = authorPool.get(lower);

          if (!existing.avatar && avatar) {

            existing.avatar = avatar;

          }

        }

      });

    }



    // 3. Reconcile with projectConfig.authors

    authorPool.forEach((info, lower) => {

      if (isDeletedAuthor(lower) || isDeletedAuthor(info.displayName)) return;

      const avatar = info.avatar || '';

      const cleanDisplayName = info.displayName.charAt(0).toUpperCase() + info.displayName.slice(1);

      const joinIsoDate = info.earliestTime ? new Date(info.earliestTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];



      // Find in projectConfig.authors (case-insensitive)

      const match = projectConfig.authors.find(a => {

        const aName = (typeof window.getAuthorName === 'function' ? window.getAuthorName(a) : (a?.name || a)) || '';

        return aName.toLowerCase() === lower;

      });



      if (!match) {

        // Author exists in drafts/notes but was missing in projectConfig.authors!

        const newAuthor = {

          name: cleanDisplayName,

          avatar: avatar,

          bio: '',

          joinDate: joinIsoDate,

          retired: false

        };

        projectConfig.authors.push(newAuthor);

        changed = true;

      } else if (typeof match === 'object' && match !== null) {

        if (!match.avatar && avatar) {

          match.avatar = avatar;

          changed = true;

        }

        if (!match.joinDate || match.joinDate === 'Joined 2026' || match.joinDate === '2026') {

          match.joinDate = joinIsoDate;

          changed = true;

        }

      }

    });




    // 4. Guarantee all drafts, notes, and replies use canonical author names

    const canonicalAuthorMap = new Map();

    if (Array.isArray(projectConfig.authors)) {

      projectConfig.authors.forEach(a => {

        const aName = (typeof window.getAuthorName === 'function' ? window.getAuthorName(a) : (a?.name || a)) || '';

        if (aName) {

          canonicalAuthorMap.set(aName.toLowerCase(), aName);

        }

      });

    }

    const defAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((projectConfig && projectConfig.defaultAuthor) || '');

    if (defAuth) canonicalAuthorMap.set(defAuth.toLowerCase(), defAuth);



    let draftsNeedSave = false;

    allDrafts.forEach(d => {

      if (!d) return;

      if (d.authorName && canonicalAuthorMap.has(d.authorName.trim().toLowerCase())) {

        const canonical = canonicalAuthorMap.get(d.authorName.trim().toLowerCase());

        if (d.authorName !== canonical) {

          d.authorName = canonical;

          d.authorInitial = canonical.charAt(0).toUpperCase();

          draftsNeedSave = true;

        }

      }

      if (Array.isArray(d.authors)) {

        let authChanged = false;

        const normalizedList = d.authors.map(a => {

          const aStr = (typeof a === 'string' ? a : (a?.name || '')).trim();

          if (aStr && canonicalAuthorMap.has(aStr.toLowerCase())) {

            const canonical = canonicalAuthorMap.get(aStr.toLowerCase());

            if (aStr !== canonical) authChanged = true;

            return canonical;

          }

          return aStr;

        });

        const deduped = [];

        const seen = new Set();

        normalizedList.forEach(name => {

          if (!name) return;

          const lowerName = name.toLowerCase();

          if (!seen.has(lowerName)) {

            seen.add(lowerName);

            deduped.push(name);

          } else {

            authChanged = true;

          }

        });

        if (authChanged) {

          d.authors = deduped;

          draftsNeedSave = true;

        }

      }

      if (d.replyToAuthor && canonicalAuthorMap.has(d.replyToAuthor.trim().toLowerCase())) {

        const canonical = canonicalAuthorMap.get(d.replyToAuthor.trim().toLowerCase());

        if (d.replyToAuthor !== canonical) {

          d.replyToAuthor = canonical;

          draftsNeedSave = true;

        }

      }

    });



    if (window.currentDraft) {

      if (window.currentDraft.authorName && canonicalAuthorMap.has(window.currentDraft.authorName.trim().toLowerCase())) {

        window.currentDraft.authorName = canonicalAuthorMap.get(window.currentDraft.authorName.trim().toLowerCase());

        window.currentDraft.authorInitial = window.currentDraft.authorName.charAt(0).toUpperCase();

      }

      if (Array.isArray(window.currentDraft.authors)) {

        window.currentDraft.authors = window.currentDraft.authors.map(a => {

          const aStr = (typeof a === 'string' ? a : (a?.name || '')).trim();

          return (aStr && canonicalAuthorMap.has(aStr.toLowerCase())) ? canonicalAuthorMap.get(aStr.toLowerCase()) : aStr;

        });

        const deduped = [];

        const seen = new Set();

        window.currentDraft.authors.forEach(name => {

          if (!name) return;

          const lower = name.toLowerCase();

          if (!seen.has(lower)) {

            seen.add(lower);

            deduped.push(name);

          }

        });

        window.currentDraft.authors = deduped;

      }

    }



    if (draftsNeedSave && typeof saveDraftsToStorage === 'function') {

      saveDraftsToStorage();

    }



    if (changed) {

      if (typeof saveProjectToStorage === 'function') {

        saveProjectToStorage();

      }

    }

    return changed || draftsNeedSave;

  };



  window.imageRegistry = new Map();



  function updateCedarTitle() {

    const siteTitle = ((projectConfig && projectConfig.name) || (projectConfig && projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.siteTitle) || 'Cedar').trim();

    let pageName = 'Home';



    if (typeof currentView !== 'undefined' && currentView === 'editor') {

      if (typeof currentDraft !== 'undefined' && currentDraft && currentDraft.title && currentDraft.title.trim()) {

        pageName = currentDraft.title.trim();

      } else {

        pageName = (typeof currentDraft !== 'undefined' && currentDraft && currentDraft.type === 'page') ? 'Untitled Page' : 'Untitled Post';

      }

    } else if (typeof currentView !== 'undefined' && currentView === 'links') {

      pageName = 'Links';

    } else {

      const tab = (typeof currentDashboardTab !== 'undefined' && currentDashboardTab) ? currentDashboardTab : 'home';

      const TAB_NAMES = {

        home: 'Home',

        posts: 'Posts',

        pages: 'Pages',

        categories: 'Categories',

        media: 'Media',

        designer: 'Design',

        export: 'Export',

        publish: 'Publish',

        settings: 'Settings',

        help: 'Help',

        preview: 'Live Preview'

      };

      pageName = TAB_NAMES[tab] || (tab.charAt(0).toUpperCase() + tab.slice(1));

    }



    document.title = pageName ? `${pageName} — ${siteTitle}` : siteTitle;

  }



  function updateOutpostTitle() {

    return updateCedarTitle();

  }



  // =========================================================================

  function createNewDraftModel(title = '', template = 'blank', type = 'post', status = 'draft') {

    const id = (type === 'page' ? 'page_' : 'post_') + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const today = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function') ? resolveProjectDefaultAuthor() : ((projectConfig && projectConfig.defaultAuthor) ? projectConfig.defaultAuthor : '');

    const hasInitialTitle = !!(title && title.trim());

    const initialSlug = hasInitialTitle

      ? generateSlug(title, '', 20)

      : (type === 'page' ? 'untitled-page' : 'untitled-post');



    let draft = {

      id: id,

      type: type, // 'post' | 'page'

      status: type === 'page' ? 'published' : status, // Pages only have published/hidden, never draft

      title: title,

      subtitle: '',

      starred: false,

      showTitle: true,

      showSubtitle: true,

      slug: initialSlug,

      slugCommitted: hasInitialTitle,

      date: today,

      publishDateUserSet: false,

      tag: '',

      categories: [],

      authors: defaultAuth ? [defaultAuth] : [],

      authorName: defaultAuth,

      authorInitial: defaultAuth.charAt(0).toUpperCase(),

      coverImage: '',

      navPrevTitle: '',

      navPrevSlug: '',

      navNextTitle: '',

      navNextSlug: '',

      overrideReadTime: '',

      customDesc: '',

      markdown: '',

      proseHtml: '',

      layoutOverride: false,

      customHtml: '',

      customCss: '',

      images: [], // array of image objects currently active in prose

      tempImages: [], // array of lingering images associated with this post

      hasUnpublishedEdits: false,

      publishedAt: null,

      publishedDate: null,

      editedAt: null,

      editedDate: null,

      createdAt: Date.now(),

      updatedAt: Date.now()

    };



    if (template && TEMPLATES[template]) {

      const t = TEMPLATES[template];

      draft.title = t.title || draft.title;

      draft.subtitle = t.subtitle || '';

      draft.slug = generateSlug(draft.title, '', 20);

      draft.slugCommitted = true;

      draft.tag = t.tag || draft.tag;

      draft.coverImage = t.coverImage || '';

      draft.markdown = t.markdown || '';

    }



    return draft;

  }



  function createNewNoteModel() {

    return null;

  }



  // --- Helper: Format Date for Display ---



  // =========================================================================

  // PRESET TEMPLATES

  // =========================================================================

  const TEMPLATES = {

    blank: {

      title: '',

      subtitle: '',

      tag: '',

      coverImage: '',

      markdown: ''

    }

  };





  // =========================================================================

  function loadProjectFromStorage() {

    try {

      const raw = localStorage.getItem(STORAGE_KEY_PROJECT);

      if (raw) {

        projectConfig = Object.assign(projectConfig, JSON.parse(raw));

      }

      const savedTheme = (projectConfig.design && (projectConfig.design.customColors || projectConfig.design.blogTheme || projectConfig.design.activeTheme)) || projectConfig.editorTheme || localStorage.getItem('cedar_theme') || localStorage.getItem('cedar_editor_theme') || 'basalt';

      projectConfig.editorTheme = (typeof savedTheme === 'object') ? 'custom' : savedTheme;

      try {

        localStorage.setItem('cedar_editor_theme', projectConfig.editorTheme);

        localStorage.setItem('cedar_theme', projectConfig.editorTheme);

      } catch (e) {}

      if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {

        (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(savedTheme, false);

      }

      if (!Array.isArray(projectConfig.deletedImages)) {

        projectConfig.deletedImages = [];

      }

      if (!Array.isArray(projectConfig.categories)) {

        projectConfig.categories = [];

      }


      if (!projectConfig.defaultCategory) {

        projectConfig.defaultCategory = 'Uncategorized';

      }

      if (projectConfig.autoCategoryPages === undefined) {

        projectConfig.autoCategoryPages = true;

      }

      if (projectConfig.layoutOverride === undefined) {

        try {

          projectConfig.layoutOverride = localStorage.getItem(STORAGE_KEY_LAYOUT_OVERRIDE) === 'true';

        } catch (e) {

          projectConfig.layoutOverride = false;

        }

      }

      // RSS Syndication: Default to OFF unless explicitly enabled

      const isRssExplicitlyEnabled = (function() {

        try {

          if (projectConfig.rssEnabled === true) return true;

          if (projectConfig.rssEnabled === false) return false;

          const stored = localStorage.getItem(STORAGE_KEY_RSS_ENABLED);

          if (stored !== null) return stored === 'true';

          return false;

        } catch (e) { return false; }

      })();



      if (isRssExplicitlyEnabled) {

        projectConfig.rssEnabled = true;

        try {

          localStorage.setItem(STORAGE_KEY_RSS_ENABLED, 'true');

        } catch (e) {}

      } else {

        projectConfig.rssEnabled = false;

        try {

          localStorage.setItem(STORAGE_KEY_RSS_ENABLED, 'false');

        } catch (e) {}

      }

      delete projectConfig.rssIncludeNotes;

      delete projectConfig.rssSeparateNotes;



      // 1. Clean legacy boilerplate & test artifacts

      if (projectConfig.name === 'My Blog Slice' || projectConfig.name === 'Test Blog') {

        projectConfig.name = '';

      }

      if (projectConfig.defaultAuthor === 'My Blog Slice' || projectConfig.defaultAuthor === 'sheesh') {

        projectConfig.defaultAuthor = '';

      }

      if (Array.isArray(projectConfig.authors)) {

        const authorMap = new Map();

        projectConfig.authors.forEach(a => {

          const norm = window.normalizeAuthorObject(a);

          if (!norm || !norm.name) return;

          const name = norm.name;

          if (name === 'My Blog Slice' || name === 'sheesh') return;

          const lower = name.toLowerCase();

          if (lower === norm.name) {

            norm.name = norm.name.charAt(0).toUpperCase() + norm.name.slice(1);

          }

          if (!authorMap.has(lower)) {

            authorMap.set(lower, norm);

          } else {

            const existing = authorMap.get(lower);

            // Safely merge: never discard existing avatar, bio, or historical date

            if (!existing.avatar && norm.avatar) {

              existing.avatar = norm.avatar;

            }

            if (!existing.bio && norm.bio) {

              existing.bio = norm.bio;

            }

            if ((!existing.joinDate || existing.joinDate === 'Joined 2026' || existing.joinDate === '2026') && norm.joinDate) {

              existing.joinDate = norm.joinDate;

            }

            if (norm.retired && !existing.retired) {

              existing.retired = true;

            }

          }

        });




        projectConfig.authors = Array.from(authorMap.values());



        const legacyBoilerplateBios = [

          'Author & Editor.',

          'Editor & Author.',

          'Author & Contributor.'

        ];

        projectConfig.authors.forEach(a => {

          if (a && a.bio) {

            const trimmedBio = a.bio.trim();

            const aName = window.getAuthorName(a) || '';

            if (legacyBoilerplateBios.includes(trimmedBio) || trimmedBio === `${aName} Editor & Author.` || trimmedBio === `${aName} Author & Editor.`) {

              a.bio = '';

            }

          }

        });

      } else {

        projectConfig.authors = [];

      }



      // 2. Load domain and reconcile

      const savedDomain = (localStorage.getItem(STORAGE_KEY_DOMAIN) || '').trim();

      if (savedDomain && !projectConfig.domain) {

        projectConfig.domain = savedDomain;

      }

      if (projectConfig.domain) {

        projectConfig.domain = projectConfig.domain.trim();

      }



      // Load blogPath and reconcile

      const savedBlogPath = localStorage.getItem(STORAGE_KEY_BLOG_PATH);

      if (savedBlogPath !== null && (projectConfig.blogPath === undefined || projectConfig.blogPath === null)) {

        projectConfig.blogPath = savedBlogPath;

      }

      if (projectConfig.blogPath === undefined || projectConfig.blogPath === null) {

        projectConfig.blogPath = 'blog';

      }

      if (!projectConfig.baseUrl || projectConfig.baseUrl === '/posts/' || projectConfig.baseUrl === '/pages/') {

        projectConfig.baseUrl = '/blog/';

      }



      // 3. If site name is blank, duplicate domain or default to Cedar

      if (!projectConfig.name || !projectConfig.name.trim()) {

        if (projectConfig.domain) {

          projectConfig.name = projectConfig.domain;

        } else {

          projectConfig.name = (projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.siteTitle) || 'Cedar';

        }

      }



      if (!projectConfig.subtitle && projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.tagline) {

        projectConfig.subtitle = projectConfig.design.branding.tagline;

      }



      // 4. Default author is required and strictly decoupled from site name

      if (!projectConfig.defaultAuthor || !projectConfig.defaultAuthor.trim()) {

        const activeStored = ((localStorage.getItem('cedar_active_author') || localStorage.getItem('outpost_active_author')) || '').trim();

        if (activeStored && activeStored !== 'My Blog Slice' && activeStored !== 'sheesh') {

          projectConfig.defaultAuthor = activeStored;

        } else {

          projectConfig.defaultAuthor = resolveProjectDefaultAuthor();

        }

      }

      const effectiveAuthor = (projectConfig.defaultAuthor || resolveProjectDefaultAuthor() || '').trim();

      if (effectiveAuthor) {

        projectConfig.defaultAuthor = effectiveAuthor;

        if (!Array.isArray(projectConfig.authors)) projectConfig.authors = [];

        // Ensure no empty-named authors remain in projectConfig.authors

        projectConfig.authors = projectConfig.authors.filter(a => {

          if (!a) return false;

          const aName = (typeof a === 'object' ? a.name : a) || '';

          return aName.trim().length > 0 && aName.trim() !== 'My Blog Slice' && aName.trim() !== 'sheesh';

        });

        if (!projectConfig.authors.some(a => (window.getAuthorName(a) || '').toLowerCase() === effectiveAuthor.toLowerCase())) {

          projectConfig.authors.unshift(window.normalizeAuthorObject(effectiveAuthor));

        }

      }



      if (!Array.isArray(projectConfig.categories)) {

        projectConfig.categories = [];

      }


      // Never allow "Uncategorized" or "Posts" in projectConfig.categories

      projectConfig.categories = projectConfig.categories.filter(c => c && c.trim().toLowerCase() !== 'uncategorized' && c.trim().toLowerCase() !== 'posts');

      if (projectConfig.defaultCategory && projectConfig.defaultCategory.trim().toLowerCase() === 'posts') {

        projectConfig.defaultCategory = 'Uncategorized';

      }



      if ((!localStorage.getItem('cedar_sanitization_user_choice') && !localStorage.getItem('outpost_sanitization_user_choice'))) {

        projectConfig.sanitizeImages = true;

      } else if (projectConfig.sanitizeImages === undefined) {

        projectConfig.sanitizeImages = true;

      }

      if (!Array.isArray(projectConfig.mediaLibrary)) {

        projectConfig.mediaLibrary = [];

      }

      if (Array.isArray(projectConfig.activityLog)) {

        projectConfig.activityLog = projectConfig.activityLog.filter(a => {

          if (!a) return false;

          if (a.id === 'synth-page-page_about_cedar' || a.id === 'act-page-page_about_cedar') return false;

          if (a.type === 'page' && a.data && (a.data.id === 'page_about_cedar' || a.data.slug === 'about-cedar' || String(a.data.title || '').trim().toLowerCase() === 'about cedar')) return false;

          return true;

        });

        projectConfig.activityLog.forEach(a => {

          if (a && a.data) {

            delete a.data.images;

            delete a.data.tempImages;

            delete a.data.proseHtml;

          }

        });

      }



      // Ensure creation dates are tracked accurately from publication history

      let earliestPubTime = null;

      try {

        const rawDrafts = localStorage.getItem(STORAGE_KEY_DRAFTS) || localStorage.getItem(LEGACY_STORAGE_DRAFTS);

        if (rawDrafts) {

          const parsed = JSON.parse(rawDrafts);

          if (Array.isArray(parsed) && parsed.length > 0) {

            const draftDates = parsed.map(d => d.createdAt || (d.date ? new Date(d.date).getTime() : 0)).filter(t => t > 0);

            if (draftDates.length > 0) {

              earliestPubTime = Math.min(...draftDates);

            }

          }

        }

      } catch (e) {}



      if (!projectConfig.createdAt || (earliestPubTime && projectConfig.createdAt > earliestPubTime)) {

        projectConfig.createdAt = earliestPubTime || Date.now();

      }

      if (!projectConfig.createdYear) {

        projectConfig.createdYear = new Date(projectConfig.createdAt).getFullYear();

      }



      // Ensure design object and branding are populated

      if (!projectConfig.design) projectConfig.design = {};

      projectConfig.design = Object.assign({

        snapEnabled: true,

        gridSize: 160,

        canvasWidth: 1920,

        containerWidth: 1280,

        columns: 8,

        containerLocked: true,

        scaleMode: 'auto',

        deviceMode: 'desktop',

        activeTheme: 'gaslamp_gazette',

        stickyHeader: false,

        branding: {},

        homeBlocks: []

      }, projectConfig.design);

      if (!projectConfig.design.canvasWidth || projectConfig.design.canvasWidth < 1280) {

        projectConfig.design.canvasWidth = 1920;

      }

      if (!projectConfig.design.containerWidth) {

        projectConfig.design.containerWidth = 1280;

      }

      if (!projectConfig.design.columns || projectConfig.design.columns === 10) {

        projectConfig.design.columns = 8;

      }

      if (!projectConfig.design.gridSize || projectConfig.design.gridSize === 128) {

        projectConfig.design.gridSize = 160;

      }

      projectConfig.design.branding = Object.assign({

        generalLogo: '',

        tabLogo: 'icon.png',

        siteTitle: projectConfig.name || 'Cedar',

        tagline: '',

        signage: `EST. ${projectConfig.createdYear} // GASLAMP CO.`,

        footerNotice: 'Published from the Cedar Static Engine. All rights reserved.',

        accentGlow: 'amber'

      }, projectConfig.design.branding || {});

      if (projectConfig.design.branding.generalLogo === 'logo.png' || projectConfig.design.branding.generalLogo === '/logo.png') {

        projectConfig.design.branding.generalLogo = '';

      }

      if (!projectConfig.design.mastheadPresets) {

        projectConfig.design.mastheadPresets = {};

      }

      if (!projectConfig.design.masthead) {

        projectConfig.design.masthead = {};

      }

      const rawMh = projectConfig.design.masthead;

      const rawEls = rawMh.elements || {};

      const needsImage2Migration = !rawMh.image2SpacingDefault ||

        (rawEls.logo && rawEls.logo.x !== 96) ||

        (rawEls.title && rawEls.title.x !== 144) ||

        (rawEls.title && rawEls.title.y !== 160) ||

        rawEls.subtitle;



      projectConfig.design.masthead = Object.assign({

        align: 'center',

        height: 96,

        snapGrid: 16,

        snapEnabled: true,

        uiVisible: true,

        gridVisible: true,

        image2SpacingDefault: true,

        elements: {}

      }, rawMh);



      // Guarantee UI toggle is ON by default

      projectConfig.design.masthead.uiVisible = true;

      projectConfig.design.masthead.gridVisible = true;



      if (needsImage2Migration) {

        projectConfig.design.masthead.image2SpacingDefault = true;

        projectConfig.design.masthead.elements = {

          logo: { enabled: true, x: 96, y: 144, size: 48, scale: (rawEls.logo && rawEls.logo.scale) || 1.0 },

          title: { enabled: true, x: 144, y: 160, scale: (rawEls.title && rawEls.title.scale) || 1.0 }

        };

      } else {

        projectConfig.design.masthead.elements = Object.assign({

          logo: { enabled: true, x: 96, y: 144, size: 48, scale: 1.0 },

          title: { enabled: true, x: 144, y: 160, scale: 1.0 }

        }, projectConfig.design.masthead.elements || {});

      }

      delete projectConfig.design.masthead.elements.nav;

      delete projectConfig.design.masthead.elements.subtitle;



      // Sanitize homeBlocks: preserve layout theme blocks, eradicate any signage or authors block

      const rawBlocks = Array.isArray(projectConfig.design.homeBlocks) ? projectConfig.design.homeBlocks : [];

      projectConfig.design.authorBar = false;

      let cleanedBlocks = rawBlocks.filter(b => {

        if (!b || !b.type || b.type === 'signage' || b.type === 'authors' || b.type === 'pages') return false;

        return true;

      });

      const layoutName = String((projectConfig.design && projectConfig.design._layoutThemeName) || '').toUpperCase();

      if (layoutName !== 'CUSTOM' && (layoutName.includes('18XX') || layoutName.includes('NO_FEATURED') || layoutName.includes('NO FEATURED'))) {

        cleanedBlocks = cleanedBlocks.filter(b => b && b.type !== 'spotlight' && b.type !== 'categories_shelf');

      }

      if (layoutName !== 'CUSTOM' && (layoutName.includes('22XX') || layoutName.includes('LONG_ARTICLES') || layoutName.includes('LONG ARTICLES'))) {

        cleanedBlocks = cleanedBlocks.filter(b => b && b.type !== 'pages');

      }

      if (cleanedBlocks.length === 0 || !cleanedBlocks.some(b => b && b.type !== 'masthead' && b.type !== 'footer')) {

        cleanedBlocks = [

          { id: 'b_masthead', type: 'masthead', x: 0, relX: 0, y: 0, w: 1920, h: 96, align: 'center', stretchWidth: true, config: { align: 'center' } },

          { id: 'b_spotlight', type: 'spotlight', x: 0, relX: 0, y: 96, w: 1920, h: 400, config: { layout: 'standard', featuredMode: 'latest', featuredCategory: '' } },

          { id: 'b_categories', type: 'categories_shelf', x: 320, relX: 0, y: 496, w: 1280, h: 80, config: { title: 'Category' } },

          { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 576, w: 1280, h: 384, stretchWidth: false, config: { title: 'Latest Publications', limit: 6, cols: 2, layoutStyle: 'vertical' } },

          { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 960, w: 1280, h: 64, stretchWidth: false, config: {} }

        ];

      }

      projectConfig.design.homeBlocks = cleanedBlocks;



      if (!projectConfig.mediaPreferences) {

        projectConfig.mediaPreferences = { roundedImages: false };

      } else if (typeof projectConfig.mediaPreferences.roundedImages !== 'boolean') {

        projectConfig.mediaPreferences.roundedImages = false;

      }



      updateOutpostTitle();

      if (typeof window.applyMediaPreferences === 'function') {

        window.applyMediaPreferences();

      }

    } catch (e) {

      console.warn('Failed to load project config:', e);

    }

  }



  window.applyMediaPreferences = function(pref) {

    const isRounded = (pref !== undefined)

      ? Boolean(pref)

      : Boolean(window.projectConfig && window.projectConfig.mediaPreferences && window.projectConfig.mediaPreferences.roundedImages);

    const radius = isRounded ? '8px' : '0px';

    document.documentElement.style.setProperty('--post-image-radius', radius);

    const canvas = document.getElementById('rich-canvas-prose') || document.getElementById('canvas-prose');

    if (canvas) {

      canvas.classList.toggle('media-images-rounded', isRounded);

    }

  };



  // Immediately initialize projectConfig from storage on module load

  loadProjectFromStorage();



  function saveProjectToStorage(options) {

    let effectiveConfig = projectConfig;



    try {

      const currentEditorTheme = (effectiveConfig.design && (effectiveConfig.design.blogTheme || effectiveConfig.design.activeTheme)) || localStorage.getItem('cedar_theme') || localStorage.getItem('cedar_editor_theme') || effectiveConfig.editorTheme || 'basalt';

      effectiveConfig.editorTheme = (typeof currentEditorTheme === 'object') ? 'custom' : currentEditorTheme;

      projectConfig.editorTheme = effectiveConfig.editorTheme;

    } catch (e) {}

    effectiveConfig.lastUpdated = new Date().toISOString();



    if (Array.isArray(effectiveConfig.activityLog)) {

      effectiveConfig.activityLog = effectiveConfig.activityLog.filter(a => {

        if (!a) return false;

        if (a.id === 'synth-page-page_about_cedar' || a.id === 'act-page-page_about_cedar') return false;

        if (a.type === 'page' && a.data && (a.data.id === 'page_about_cedar' || a.data.slug === 'about-cedar' || String(a.data.title || '').trim().toLowerCase() === 'about cedar')) return false;

        return true;

      });

      effectiveConfig.activityLog.forEach(a => {

        if (a && a.data) {

          delete a.data.images;

          delete a.data.tempImages;

          delete a.data.proseHtml;

        }

      });

    }



    const serializedConfig = JSON.stringify(effectiveConfig, null, 2);



    // 1. High-Capacity Virtual Vault (OPFS / IndexedDB)

    if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile === 'function') {

      try {

        (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile('config.json', serializedConfig);

        (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile('cedar_config.json', serializedConfig);

        (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile('editor/config.json', serializedConfig);

        try { (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile('writer/config.json', serializedConfig); } catch (e) {}

      } catch (e) {

        console.warn('[CedarStorage] Virtual Vault config sync warning:', e);

      }

    }



    // 2. Physical Vault Sync (if connected or savedVaultPath is configured)

    const savedVaultPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || (window.projectConfig && window.projectConfig.vaultPath) || '').trim();

    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {

      try {

        window.SheeshVault.writeFile('config.json', serializedConfig);

        window.SheeshVault.writeFile('cedar_config.json', serializedConfig);

        window.SheeshVault.writeFile('editor/config.json', serializedConfig);

        try { window.SheeshVault.writeFile('writer/config.json', serializedConfig); } catch (e) {}

      } catch (e) {}

    } else if (savedVaultPath && (window.Cedar && window.Cedar.isLocalServer)) {

      try {

        fetch('/api/vault-write', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            folderPath: savedVaultPath,

            filePath: 'config.json',

            content: serializedConfig,

            encoding: 'utf-8'

          })

        }).catch(() => {});

        fetch('/api/vault-write', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            folderPath: savedVaultPath,

            filePath: 'cedar_config.json',

            content: serializedConfig,

            encoding: 'utf-8'

          })

        }).catch(() => {});

        fetch('/api/vault-write', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            folderPath: savedVaultPath,

            filePath: 'editor/config.json',

            content: serializedConfig,

            encoding: 'utf-8'

          })

        }).catch(() => {});

      } catch (e) {}

    }



    // 3. LocalStorage Mirror

    try {

      if (effectiveConfig.editorTheme) {

        localStorage.setItem('cedar_editor_theme', effectiveConfig.editorTheme);

        localStorage.setItem('cedar_theme', effectiveConfig.editorTheme);

      } else if (effectiveConfig.design && effectiveConfig.design.activeTheme) {

        localStorage.setItem('cedar_theme', effectiveConfig.design.activeTheme);

      }



      // Safeguard localStorage: ensure no massive Base64 strings are stored in projectConfig

      let safeConfig = effectiveConfig;

      let needsClone = false;



      // 1. Sanitize mediaLibrary

      let safeMedia = effectiveConfig.mediaLibrary;

      if (Array.isArray(effectiveConfig.mediaLibrary)) {

        const hasBase64 = effectiveConfig.mediaLibrary.some(m => m && m.dataUrl && m.dataUrl.length > 500);

        if (hasBase64) {

          needsClone = true;

          safeMedia = effectiveConfig.mediaLibrary.map(m => {

            if (!m) return m;

            const copy = { ...m };

            if (copy.dataUrl && copy.dataUrl.length > 500) {

              delete copy.dataUrl;

            }

            delete copy.blob;

            return copy;

          });

        }

      }



      // 2. Preserve author avatars (avatars are preserved so they are never deleted on save)

      let safeAuthors = effectiveConfig.authors;



      if (needsClone) {

        safeConfig = {

          ...effectiveConfig,

          mediaLibrary: safeMedia,

          authors: safeAuthors

        };

      }



      try {

        localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(safeConfig));

      } catch (quotaErr) {

        const slimConfig = JSON.parse(JSON.stringify(safeConfig));

        if (slimConfig.design && slimConfig.design.branding) {

          delete slimConfig.design.branding.files;

          delete slimConfig.design.branding.originalLogo;

        }

        localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(slimConfig));

      }

      if (projectConfig.domain !== undefined) {

        localStorage.setItem(STORAGE_KEY_DOMAIN, projectConfig.domain);

      }

      if (projectConfig.blogPath !== undefined) {

        localStorage.setItem(STORAGE_KEY_BLOG_PATH, projectConfig.blogPath);

      }

      updateOutpostTitle();

    } catch (e) {

      console.warn('[CedarStorage] LocalStorage quota reached for project config, preserved in Virtual Vault:', e);

    }



    if (typeof window.syncLiveWorkspaceData === 'function') {

      window.syncLiveWorkspaceData();

    }

  }



  function isAllDraft(d) {

    if (!d) return false;

    const id = String(d.id || '').trim().toLowerCase();

    const slug = String(d.slug || '').trim().toLowerCase();

    const title = String(d.title || '').trim().toLowerCase();

    return id === 'page_all' || slug === 'all' || title === 'all';

  }

  window.isAllDraft = isAllDraft;



  function createDefaultAllPage() {

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((projectConfig && projectConfig.defaultAuthor) || '');

    const now = Date.now();

    return {

      id: 'page_all',

      type: 'page',

      status: 'published',

      title: 'All',

      slug: 'all',

      subtitle: '',

      authorName: defaultAuth,

      authors: [defaultAuth],

      authorInitial: defaultAuth.charAt(0).toUpperCase(),

      markdown: ':::recent-posts layout="grid":::',

      proseHtml: '<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="grid" contenteditable="false"></div>',

      layout: 'grid',

      hasHadRecentPostsInit: true,

      hidden: false,

      retired: false,

      images: [],

      createdAt: now - 86400000 * 2,

      updatedAt: now - 86400000 * 2,

      publishedAt: now - 86400000 * 2,

      date: new Date(now - 86400000 * 2).toISOString().split('T')[0],

      publishedDate: new Date(now - 86400000 * 2).toISOString().split('T')[0]

    };

  }

  window.createDefaultAllPage = createDefaultAllPage;
function createDefaultAboutPage() {

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((projectConfig && projectConfig.defaultAuthor) || '');

    const now = Date.now();

    return {

      id: 'page_about',

      type: 'page',

      status: 'published',

      title: 'About',

      slug: 'about',

      subtitle: '',

      authorName: defaultAuth,

      authors: [defaultAuth],

      authorInitial: defaultAuth.charAt(0).toUpperCase(),

      markdown: '',

      proseHtml: '',

      hidden: true,

      retired: true,

      images: [],

      createdAt: now - 86400000 * 2,

      updatedAt: now - 86400000 * 2,

      publishedAt: now - 86400000 * 2,

      date: new Date(now - 86400000 * 2).toISOString().split('T')[0],

      publishedDate: new Date(now - 86400000 * 2).toISOString().split('T')[0]

    };

  }



  function isLinksDraft(d) {

    if (!d) return false;

    const id = String(d.id || '').trim().toLowerCase();

    const slug = String(d.slug || '').trim().toLowerCase();

    const title = String(d.title || '').trim().toLowerCase();

    return id === 'page_links' || slug === 'links' || title === 'links' || Boolean(d.linksData && typeof d.linksData === 'object');

  }

  window.isLinksDraft = isLinksDraft;



  function createDefaultLinksPage() {

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((projectConfig && projectConfig.defaultAuthor) || '');

    const now = Date.now();

    const linksData = {

      profile: {

        headline: `Welcome to ${defaultAuth}'s link site!`,

        bio: 'See what I am up to.',

        avatar: ''

      },

      items: [

        {

          id: 'link_blog',

          title: ((projectConfig && projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.siteTitle)

            ? `${projectConfig.design.branding.siteTitle} Blog`

            : ((projectConfig && projectConfig.name) ? `${projectConfig.name} Blog` : 'Cedar Blog')),

          subtitle: 'Latest essays and stories',

          url: '/blog/',

          icon: ((projectConfig && projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.generalLogo) || 'images/Lamp.png'),

          enabled: true

        }

      ]

    };

    return {

      id: 'page_links',

      type: 'page',

      status: 'published',

      title: 'Links',

      slug: 'links',

      subtitle: 'See what I am up to.',

      authorName: defaultAuth,

      authors: [defaultAuth],

      authorInitial: defaultAuth.charAt(0).toUpperCase(),

      markdown: '',

      proseHtml: '',

      linksData: linksData,

      hidden: true,

      retired: true,

      images: [],

      createdAt: now - 86400000 * 2,

      updatedAt: now - 86400000 * 2,

      publishedAt: now - 86400000 * 2,

      date: new Date(now - 86400000 * 2).toISOString().split('T')[0],

      publishedDate: new Date(now - 86400000 * 2).toISOString().split('T')[0]

    };

  }



  function createDefaultAboutCedarPage() {

    const fixedTs = 1735689600000;

    return {

      id: 'page_about_cedar',

      type: 'page',

      status: 'published',

      title: 'About Cedar',

      slug: 'about-cedar',

      subtitle: '',

      showSubtitle: false,

      authorName: 'Cedar',

      authors: ['Cedar'],

      authorInitial: 'C',

      hidden: true,

      retired: true,

      isSecret: true,

      markdown: `> After a decade-plus of experimenting with blogging tools, I never found one I really liked. Cedar is my attempt at pulling the best parts of classic writers into a single, focused experience.

**Cedar** is an open-source, web-based static blog generator built to keep writing simple. Out of the box, it:

- **Gives you a focused writing studio** for drafting and formatting posts.
- **Manages your posts, pages, and media** in one place.
- **Organizes your static site files** automatically so they are always ready to publish.
- **Makes deploying effortless**—whether pushing straight to GitHub or exporting a \`.zip\`.

### 100% Local-First

Even though Cedar runs in your browser, everything you create stays 100% on your machine until you choose to move it elsewhere. You can work directly in your browser's local storage, save your project to a folder on your computer or a portable SSD, or publish straight to GitHub.

Whatever your workflow, Cedar handles the file structure behind the scenes—so you get all the speed and ownership of a static site without ever having to wrestle with files and folders.

[Try Cedar at cedar.pub](https://cedar.pub) • [View Source on GitHub](https://github.com/sheeshfr/Cedar)`.trim(),

      proseHtml: `<blockquote>After a decade-plus of experimenting with blogging tools, I never found one I really liked. Cedar is my attempt at pulling the best parts of classic writers into a single, focused experience.</blockquote><p><strong>Cedar</strong> is an open-source, web-based static blog generator built to keep writing simple. Out of the box, it:</p><ul><li><strong>Gives you a focused writing studio</strong> for drafting and formatting posts.</li><li><strong>Manages your posts, pages, and media</strong> in one place.</li><li><strong>Organizes your static site files</strong> automatically so they are always ready to publish.</li><li><strong>Makes deploying effortless</strong>—whether pushing straight to GitHub or exporting a <code>.zip</code>.</li></ul><h3>100% Local-First</h3><p>Even though Cedar runs in your browser, everything you create stays 100% on your machine until you choose to move it elsewhere. You can work directly in your browser's local storage, save your project to a folder on your computer or a portable SSD, or publish straight to GitHub.</p><p>Whatever your workflow, Cedar handles the file structure behind the scenes—so you get all the speed and ownership of a static site without ever having to wrestle with files and folders.</p><p><a href="https://cedar.pub" target="_blank" rel="noopener noreferrer">Try Cedar at cedar.pub</a> &nbsp;&bull;&nbsp; <a href="https://github.com/sheeshfr/Cedar" target="_blank" rel="noopener noreferrer">View Source on GitHub</a></p>`,

      images: [],

      createdAt: fixedTs,

      updatedAt: fixedTs,

      publishedAt: fixedTs,

      date: '2025-01-01',

      publishedDate: '2025-01-01'

    };

  }

  window.createDefaultAboutCedarPage = createDefaultAboutCedarPage;



  function createRssShowcaseCardHtml(feedUrl) {
    const safeUrl = String(feedUrl || '/feed.xml').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<div class="rss-feed-showcase-card" data-block-type="rss-box" contenteditable="false"><div class="rss-feed-url-display"><span class="rss-feed-icon-badge" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor"></circle></svg></span><code class="rss-live-feed-url">${safeUrl}</code></div><button type="button" class="popout-3d btn-rss-subscribe rss-copy-btn" title="Copy RSS feed link to clipboard"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy Link</span></button></div>`;
  }
  window.createRssShowcaseCardHtml = createRssShowcaseCardHtml;

  function formatMarkdownToHtmlQuick(md) {

    if (!md) return '';

    if (typeof window !== 'undefined' && typeof window.parseMarkdownToHtml === 'function') {

      try {

        return window.parseMarkdownToHtml(md);

      } catch (e) {}

    }

    const lines = md.split('\n');

    let out = [];

    let inUl = false;

    let inOl = false;

    function closeLists() {

      if (inUl) { out.push('</ul>'); inUl = false; }

      if (inOl) { out.push('</ol>'); inOl = false; }

    }

    function fmtInlines(t) {

      return t

        .replace(/`([^`]+)`/g, '<code>$1</code>')

        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

        .replace(/\*([^*]+)\*/g, '<em>$1</em>')

        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    }

    for (let line of lines) {

      let trimmed = line.trim();

      if (!trimmed) {

        closeLists();

        continue;

      }

      if (/^:::rss-box(?:\s+([^\n]+?))?\s*:::$/i.test(trimmed)) {
        closeLists();
        const m = trimmed.match(/^:::rss-box(?:\s+([^\n]+?))?\s*:::$/i);
        const boxUrl = (m && m[1]) ? m[1].trim() : ((typeof resolveAutoDetectedSiteBaseUrl === 'function' ? resolveAutoDetectedSiteBaseUrl() : '') + '/feed.xml');
        out.push(createRssShowcaseCardHtml(boxUrl));
        continue;
      }

      if (trimmed.startsWith('<div class="rss-feed-showcase-card"')) {
        closeLists();
        out.push(trimmed);
        continue;
      }

      if (trimmed.startsWith('>')) {

        closeLists();

        out.push(`<blockquote><p>${fmtInlines(trimmed.replace(/^>\s?/, ''))}</p></blockquote>`);

      } else if (trimmed === '---') {

        closeLists();

        out.push('<hr class="canvas-divider" style="border:0; border-top: 1px solid rgba(255,255,255,0.1); margin: 2.25rem 0;" />');

      } else if (trimmed.startsWith('#### ')) {

        closeLists();

        out.push(`<h4>${fmtInlines(trimmed.replace(/^####\s+/, ''))}</h4>`);

      } else if (trimmed.startsWith('### ')) {

        closeLists();

        out.push(`<h3>${fmtInlines(trimmed.replace(/^###\s+/, ''))}</h3>`);

      } else if (trimmed.startsWith('## ')) {

        closeLists();

        out.push(`<h2>${fmtInlines(trimmed.replace(/^##\s+/, ''))}</h2>`);

      } else if (trimmed.startsWith('# ')) {

        closeLists();

        out.push(`<h1>${fmtInlines(trimmed.replace(/^#\s+/, ''))}</h1>`);

      } else if (/^[\*\-\+]\s+/.test(trimmed)) {

        if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }

        out.push(`<li>${fmtInlines(trimmed.replace(/^[\*\-\+]\s+/, ''))}</li>`);

      } else if (/^:::rss-box(?:\s+([^\n]+?))?\s*:::$/i.test(trimmed)) {

        closeLists();

        const m = trimmed.match(/^:::rss-box(?:\s+([^\n]+?))?\s*:::$/i);

        const siteBase = (typeof resolveAutoDetectedSiteBaseUrl === 'function') ? resolveAutoDetectedSiteBaseUrl() : '';

        const feedUrl = (m && m[1] && m[1].trim()) ? m[1].trim() : (siteBase ? `${siteBase}/feed.xml` : '/feed.xml');

        out.push(`<div class="rss-feed-showcase-card" data-block-type="rss-box" contenteditable="false"><div class="rss-feed-url-display"><span class="rss-feed-icon-badge" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor"></circle></svg></span><code class="rss-live-feed-url">${escapeHtml(feedUrl)}</code></div><button type="button" class="popout-3d btn-rss-subscribe rss-copy-btn" title="Copy RSS feed link to clipboard"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy Link</span></button></div>`);

      } else if (/^\d+\.\s+/.test(trimmed)) {

        if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }

        out.push(`<li>${fmtInlines(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);

      } else {

        closeLists();

        out.push(`<p>${fmtInlines(trimmed)}</p>`);

      }

    }

    closeLists();

    return out.join('\n');

  }



  function resolveAutoDetectedSiteBaseUrl(config) {
    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : (typeof window !== 'undefined' && window.projectConfig ? window.projectConfig : {})) || {};
    const rawDomain = String(cfg.domain || cfg.detectedDomain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const validDomain = (rawDomain && rawDomain !== '[your domain]' && !rawDomain.includes('[') && !/^localhost(?::\d+)?$/i.test(rawDomain) && !/^127\.0\.0\.1(?::\d+)?$/.test(rawDomain))
      ? rawDomain
      : '';

    if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
      const host = String(window.location.hostname || '').toLowerCase();
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      const pathname = String(window.location.pathname || '');
      const isEditorOrPreviewShell = !window.__CEDAR_PRODUCTION__ && (
        pathname === '/preview.html' ||
        pathname.endsWith('/preview.html') ||
        pathname.includes('/preview.html/') ||
        Boolean(typeof document !== 'undefined' && document.getElementById('view-dashboard'))
      );

      let subpath = pathname
        .replace(/\/index\.html$/i, '')
        .replace(/\/preview\.html(?:\/.*)?$/i, '')
        .replace(/\/(?:pages|blog)\/(?:published|drafts|hidden)\/[^/]+\/?$/i, '')
        .replace(/\/(?:rss|feed|links|about-cedar|about|all|all-posts|posts|blog|help)\/?$/i, '');

      if (typeof document !== 'undefined') {
        const markerScript = document.querySelector('script[src*="site-data.js"], script[src*="js/preview/reader.js"]');
        if (markerScript) {
          const srcAttr = markerScript.getAttribute('src') || '';
          if (srcAttr.startsWith('/') && !srcAttr.startsWith('//')) {
            const m = srcAttr.match(/^(.*)\/(?:site-data\.js|js\/preview\/reader\.js)/i);
            if (m) subpath = m[1] || '';
          }
        }
      }
      subpath = subpath.replace(/\/+$/, '');
      if (subpath && !subpath.startsWith('/')) subpath = '/' + subpath;

      if (!isLocal && !isEditorOrPreviewShell) {
        return `${window.location.origin}${subpath}`;
      }
      if (validDomain) {
        return `https://${validDomain}`;
      }
      return `${window.location.origin}${subpath}`;
    }

    if (validDomain) {
      return `https://${validDomain}`;
    }
    return '';
  }
  window.resolveAutoDetectedSiteBaseUrl = resolveAutoDetectedSiteBaseUrl;

  function generateRssPageData(config) {

    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};

    const siteBase = resolveAutoDetectedSiteBaseUrl(cfg);

    const siteName = cfg.name || 'Cedar';

    const postsUrl = siteBase ? `${siteBase}/feed.xml` : '/feed.xml';

    let title = 'RSS';

    let subtitle = 'Follow new posts in your favorite feed reader—no algorithms, no inbox clutter.';

    let markdown = `:::rss-box ${postsUrl}:::

### How It Works

1. **Copy the feed link** above.
2. **Paste it into any RSS reader**—like [NetNewsWire](https://netnewswire.com), [Feedly](https://feedly.com), [Reeder](https://reederapp.com), or [Inoreader](https://www.inoreader.com).
3. **Done.** Every time a new post goes live on **${siteName}**, it'll show up automatically in your feed.`.trim();

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((cfg && cfg.defaultAuthor) || '');

    const proseHtml = formatMarkdownToHtmlQuick(markdown);

    return {

      title,

      subtitle,

      markdown,

      proseHtml,

      authorName: defaultAuth

    };

  }



  function deduplicateDrafts(targetDrafts) {

    if (!Array.isArray(targetDrafts)) return targetDrafts;



    // 1. Deduplicate RSS Pages

    const rssIndices = [];

    targetDrafts.forEach((d, idx) => {

      if (d && d.type === 'page') {

        const id = String(d.id || '').trim().toLowerCase();

        const slug = String(d.slug || '').trim().toLowerCase();

        const title = String(d.title || '').trim().toLowerCase();

        if (id === 'page_rss' || slug === 'rss' || title === 'rss') {

          rssIndices.push(idx);

        }

      }

    });



    if (rssIndices.length > 1) {

      let bestIdx = rssIndices[0];

      let bestScore = -1;

      rssIndices.forEach(idx => {

        const d = targetDrafts[idx];

        let score = 0;

        if (d.id === 'page_rss') score += 10;

        if (d.slug === 'rss') score += 5;

        if (d.markdown && d.markdown.trim()) score += 2;

        if (d.proseHtml && d.proseHtml.trim()) score += 2;

        score += Math.min(Number(d.updatedAt || 0) / 1e12, 5);

        if (score > bestScore) {

          bestScore = score;

          bestIdx = idx;

        }

      });



      const canonicalRss = targetDrafts[bestIdx];

      canonicalRss.id = 'page_rss';

      canonicalRss.slug = 'rss';

      canonicalRss.type = 'page';

      canonicalRss.title = 'RSS';



      const indicesToRemove = new Set(rssIndices.filter(i => i !== bestIdx));

      for (let i = targetDrafts.length - 1; i >= 0; i--) {

        if (indicesToRemove.has(i)) {

          targetDrafts.splice(i, 1);

        }

      }

    }



    // 2. Deduplicate About Pages

    const aboutIndices = [];

    targetDrafts.forEach((d, idx) => {

      if (d && d.type === 'page') {

        const id = String(d.id || '').trim().toLowerCase();

        const slug = String(d.slug || '').trim().toLowerCase();

        const title = String(d.title || '').trim().toLowerCase();

        if (id === 'page_about' || slug === 'about' || title === 'about') {

          aboutIndices.push(idx);

        }

      }

    });



    if (aboutIndices.length > 1) {

      let bestIdx = aboutIndices[0];

      let bestScore = -1;

      aboutIndices.forEach(idx => {

        const d = targetDrafts[idx];

        let score = 0;

        if (d.id === 'page_about') score += 10;

        if (d.slug === 'about') score += 5;

        if (d.markdown && d.markdown.trim()) score += 2;

        if (d.proseHtml && d.proseHtml.trim()) score += 2;

        score += Math.min(Number(d.updatedAt || 0) / 1e12, 5);

        if (score > bestScore) {

          bestScore = score;

          bestIdx = idx;

        }

      });



      const canonicalAbout = targetDrafts[bestIdx];

      canonicalAbout.id = 'page_about';

      canonicalAbout.slug = 'about';

      canonicalAbout.type = 'page';

      canonicalAbout.title = 'About';



      const indicesToRemove = new Set(aboutIndices.filter(i => i !== bestIdx));

      for (let i = targetDrafts.length - 1; i >= 0; i--) {

        if (indicesToRemove.has(i)) {

          targetDrafts.splice(i, 1);

        }

      }

    }



    // 3. Deduplicate About Cedar Pages

    const aboutCedarIndices = [];

    targetDrafts.forEach((d, idx) => {

      if (d && d.type === 'page') {

        const id = String(d.id || '').trim().toLowerCase();

        const slug = String(d.slug || '').trim().toLowerCase();

        if (id === 'page_about_cedar' || slug === 'about-cedar') {

          aboutCedarIndices.push(idx);

        }

      }

    });

    if (aboutCedarIndices.length > 1) {

      const canonical = targetDrafts[aboutCedarIndices[0]];

      canonical.id = 'page_about_cedar';

      canonical.slug = 'about-cedar';

      const indicesToRemove = new Set(aboutCedarIndices.slice(1));

      for (let i = targetDrafts.length - 1; i >= 0; i--) {

        if (indicesToRemove.has(i)) {

          targetDrafts.splice(i, 1);

        }

      }

    }



    // 4. Deduplicate and strictly normalize Links Pages (Links is NEVER a post)

    const linksIndices = [];

    targetDrafts.forEach((d, idx) => {

      if (isLinksDraft(d)) {

        linksIndices.push(idx);

      }

    });



    if (linksIndices.length > 0) {

      let bestIdx = linksIndices[0];

      let bestScore = -1;

      linksIndices.forEach(idx => {

        const d = targetDrafts[idx];

        let score = 0;

        if (d.id === 'page_links') score += 10;

        if (d.type === 'page') score += 5;

        if (d.slug === 'links') score += 5;

        if (d.linksData && Array.isArray(d.linksData.items) && d.linksData.items.length > 0) score += 5;

        if (d.subtitle && d.subtitle.trim()) score += 2;

        score += Math.min(Number(d.updatedAt || 0) / 1e12, 5);

        if (score > bestScore) {

          bestScore = score;

          bestIdx = idx;

        }

      });



      const canonicalLinks = targetDrafts[bestIdx];



      // Merge user subtitle and linksData from any duplicate drafts if missing

      linksIndices.forEach(idx => {

        if (idx === bestIdx) return;

        const other = targetDrafts[idx];

        if (other) {

          if (!canonicalLinks.subtitle && other.subtitle) canonicalLinks.subtitle = other.subtitle;

          if ((!canonicalLinks.linksData || !canonicalLinks.linksData.items || canonicalLinks.linksData.items.length === 0) && other.linksData) {

            canonicalLinks.linksData = other.linksData;

          }

        }

      });



      canonicalLinks.id = 'page_links';

      canonicalLinks.slug = 'links';

      canonicalLinks.type = 'page';

      canonicalLinks.title = 'Links';

      delete canonicalLinks.coverImage;

      delete canonicalLinks.featuredImage;



      if (linksIndices.length > 1) {

        const indicesToRemove = new Set(linksIndices.filter(i => i !== bestIdx));

        for (let i = targetDrafts.length - 1; i >= 0; i--) {

          if (indicesToRemove.has(i)) {

            targetDrafts.splice(i, 1);

          }

        }

      }

    }



    // 5. Deduplicate All Pages

    const allIndices = [];

    targetDrafts.forEach((d, idx) => {

      if (d && d.type === 'page' && isAllDraft(d)) {

        allIndices.push(idx);

      }

    });



    if (allIndices.length > 0) {

      let bestIdx = allIndices[0];

      let bestScore = -1;

      allIndices.forEach(idx => {

        const d = targetDrafts[idx];

        let score = 0;

        if (d.id === 'page_all') score += 10;

        if (d.slug === 'all') score += 5;

        if (d.markdown && d.markdown.trim()) score += 2;

        if (d.proseHtml && d.proseHtml.trim()) score += 2;

        score += Math.min(Number(d.updatedAt || 0) / 1e12, 5);

        if (score > bestScore) {

          bestScore = score;

          bestIdx = idx;

        }

      });



      const canonicalAll = targetDrafts[bestIdx];

      canonicalAll.id = 'page_all';

      canonicalAll.slug = 'all';

      canonicalAll.type = 'page';

      canonicalAll.title = 'All';



      if (allIndices.length > 1) {

        const indicesToRemove = new Set(allIndices.filter(i => i !== bestIdx));

        for (let i = targetDrafts.length - 1; i >= 0; i--) {

          if (indicesToRemove.has(i)) {

            targetDrafts.splice(i, 1);

          }

        }

      }

    }



    // 6. Deduplicate any remaining pages by slug and by title (case-insensitive)
    const seenPageSlugs = new Map();
    const seenPageTitles = new Map();
    for (let i = 0; i < targetDrafts.length; i++) {
      const d = targetDrafts[i];
      if (!d) continue;
      if (d.type === 'page') {
        const t = (d.title || '').trim();
        const tLow = t.toLowerCase();
        let s = (d.slug || '').trim().toLowerCase();
        if ((!s || s === 'untitled-page' || s === 'untitled-post') && t && tLow !== 'untitled page' && tLow !== 'page' && tLow !== 'untitled') {
          s = (typeof generateSlug === 'function') ? generateSlug(t, 'untitled-page', 20) : tLow.replace(/[^a-z0-9]+/g, '-');
          d.slug = s;
        }
        if (s) {
          if (!seenPageSlugs.has(s)) {
            seenPageSlugs.set(s, i);
          } else {
            const prevIdx = seenPageSlugs.get(s);
            const prevDraft = targetDrafts[prevIdx];
            const prevTime = Number(prevDraft?.updatedAt || 0);
            const curTime = Number(d.updatedAt || 0);
            if (curTime > prevTime) {
              targetDrafts[prevIdx] = null;
              seenPageSlugs.set(s, i);
            } else {
              targetDrafts[i] = null;
              continue;
            }
          }
        }
        if (tLow && s !== 'about' && s !== 'links' && s !== 'rss' && s !== 'all') {
          if (!seenPageTitles.has(tLow)) {
            seenPageTitles.set(tLow, i);
          } else {
            const prevIdx = seenPageTitles.get(tLow);
            const prevDraft = targetDrafts[prevIdx];
            const prevTime = Number(prevDraft?.updatedAt || 0);
            const curTime = Number(d.updatedAt || 0);
            if (curTime > prevTime) {
              targetDrafts[prevIdx] = null;
              seenPageTitles.set(tLow, i);
            } else {
              targetDrafts[i] = null;
            }
          }
        }
      }
    }

    // 7. Deduplicate posts strictly by matching ID or matching non-empty slug (never by title)
    const seenPostIds = new Map();
    const seenPostSlugs = new Map();

    for (let i = 0; i < targetDrafts.length; i++) {
      const d = targetDrafts[i];
      if (!d || targetDrafts[i] === null) continue;
      // Skip pages, notes, ideas, links
      if (d.type === 'page' || d.type === 'note' || d.status === 'idea' || (typeof isLinksDraft === 'function' && isLinksDraft(d))) {
        continue;
      }
      if (d.id && String(d.id).startsWith('page_')) continue;

      const idKey = d.id ? String(d.id).trim() : null;
      const slugKey = (d.slug && String(d.slug).trim() && d.slug !== 'untitled-post') ? String(d.slug).trim().toLowerCase() : null;

      let matchIdx = null;
      if (idKey && seenPostIds.has(idKey)) {
        matchIdx = seenPostIds.get(idKey);
      } else if (slugKey && seenPostSlugs.has(slugKey)) {
        matchIdx = seenPostSlugs.get(slugKey);
      }

      if (matchIdx !== null && matchIdx !== i && targetDrafts[matchIdx] !== null) {
        const prevDraft = targetDrafts[matchIdx];
        const prevTime = Number(prevDraft.updatedAt || prevDraft.createdAt || 0);
        const curTime = Number(d.updatedAt || d.createdAt || 0);

        const curWins = curTime >= prevTime;
        const winner = curWins ? d : prevDraft;
        const loser = curWins ? prevDraft : d;
        const winIdx = curWins ? i : matchIdx;
        const loseIdx = curWins ? matchIdx : i;

        // If one copy was published and the other was a duplicate draft creation, preserve published status
        if (loser.status === 'published' && winner.status !== 'published' && (!winner.updatedAt || winner.updatedAt <= loser.updatedAt)) {
          winner.status = 'published';
        }

        // Preserve non-empty fields from loser if winner lacks them
        if (!winner.markdown && loser.markdown) winner.markdown = loser.markdown;
        if (!winner.proseHtml && loser.proseHtml) winner.proseHtml = loser.proseHtml;
        if (!winner.coverImage && loser.coverImage) winner.coverImage = loser.coverImage;
        if ((!winner.images || winner.images.length === 0) && Array.isArray(loser.images) && loser.images.length > 0) {
          winner.images = [...loser.images];
        }
        if ((!winner.categories || winner.categories.length === 0) && Array.isArray(loser.categories) && loser.categories.length > 0) {
          winner.categories = [...loser.categories];
        }
        if (!winner.tag && loser.tag) winner.tag = loser.tag;
        if (!winner.subtitle && loser.subtitle) winner.subtitle = loser.subtitle;
        if (!winner.authorName && loser.authorName) winner.authorName = loser.authorName;

        targetDrafts[loseIdx] = null;

        if (winner.id) seenPostIds.set(String(winner.id).trim(), winIdx);
        if (winner.slug && winner.slug !== 'untitled-post') seenPostSlugs.set(String(winner.slug).trim().toLowerCase(), winIdx);
      } else {
        if (idKey) seenPostIds.set(idKey, i);
        if (slugKey) seenPostSlugs.set(slugKey, i);
      }
    }

    for (let i = targetDrafts.length - 1; i >= 0; i--) {

      if (targetDrafts[i] === null) {

        targetDrafts.splice(i, 1);

      }

    }



    return targetDrafts;

  }



  function syncRssPageDraft(config) {

    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};

    const rssData = generateRssPageData(cfg);

    const targetDrafts = (typeof window !== 'undefined' && Array.isArray(window.drafts))

      ? window.drafts

      : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);



    deduplicateDrafts(targetDrafts);



    let rssDraft = targetDrafts.find(d => d && d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));

    if (rssDraft) {

      rssDraft.id = 'page_rss';

      rssDraft.slug = 'rss';

      rssDraft.title = 'RSS';

      const isRssOn = !rssDraft.hidden && !rssDraft.retired;

      if (window.projectConfig) window.projectConfig.rssEnabled = isRssOn;

      if (cfg) cfg.rssEnabled = isRssOn;

      try {
        const rssStr = isRssOn ? 'true' : 'false';
        if (localStorage.getItem(STORAGE_KEY_RSS_ENABLED) !== rssStr) {
          localStorage.setItem(STORAGE_KEY_RSS_ENABLED, rssStr);
        }
      } catch (e) {}



      // Refresh default RSS page template while preserving custom user edits
      const curRssMd = String(rssDraft.markdown || '').trim();
      const curRssHtml = String(rssDraft.proseHtml || '').trim();
      if (!curRssMd || curRssMd.includes('### Available Feeds') || curRssMd.includes('## RSS Syndication') || curRssMd.includes(':::rss-box') || curRssHtml.includes(':::rss-box')) {
        if (rssDraft.subtitle !== rssData.subtitle || rssDraft.markdown !== rssData.markdown || rssDraft.proseHtml !== rssData.proseHtml) {
          rssDraft.updatedAt = Date.now();
        }
        rssDraft.subtitle = rssData.subtitle;
        rssDraft.markdown = rssData.markdown;
        rssDraft.proseHtml = rssData.proseHtml;
      }

    } else {

      const isRssOn = (typeof resolveProjectRssEnabled === 'function') ? resolveProjectRssEnabled() : (cfg.rssEnabled !== undefined ? Boolean(cfg.rssEnabled) : false);

      rssDraft = {

        id: 'page_rss',

        type: 'page',

        status: 'published',

        title: 'RSS',

        slug: 'rss',

        subtitle: rssData.subtitle,

        authorName: rssData.authorName,

        authors: [rssData.authorName],

        authorInitial: (rssData.authorName || 'A').charAt(0).toUpperCase(),

        markdown: rssData.markdown,

        proseHtml: rssData.proseHtml,

        hidden: !isRssOn,

        retired: !isRssOn,

        images: [],

        createdAt: Date.now() - 86400000,

        updatedAt: Date.now(),

        publishedAt: Date.now() - 86400000,

        date: new Date().toISOString().split('T')[0],

        publishedDate: new Date().toISOString().split('T')[0]

      };

      targetDrafts.push(rssDraft);

    }

    return rssDraft;

  }



  function generateLinksPageData(linksData, config) {

    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((cfg && cfg.defaultAuthor) || '');



    const data = linksData || {};

    const profile = data.profile || {};

    const items = Array.isArray(data.items) ? data.items : [];



    const headline = profile.headline || `Welcome to ${defaultAuth}'s link site!`;

    const bio = profile.bio || 'See what I am up to.';



    let markdown = `# ${headline}\n\n${bio}\n\n---\n\n`;

    items.forEach(it => {

      if (it && it.enabled !== false && it.title && it.url) {

        markdown += `- [${it.title}](${it.url})${it.subtitle ? ` — ${it.subtitle}` : ''}\n`;

      }

    });



    return {

      title: 'Links',

      subtitle: bio,

      markdown: markdown.trim(),

      proseHtml: formatMarkdownToHtmlQuick(markdown),

      authorName: defaultAuth

    };

  }



  function syncLinksPageDraft(config) {

    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};

    const targetDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))

      ? drafts

      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);



    deduplicateDrafts(targetDrafts);



    let linksDraft = targetDrafts.find(d => isLinksDraft(d));

    if (!linksDraft) {

      linksDraft = createDefaultLinksPage();

      targetDrafts.push(linksDraft);

    } else {

      if (!linksDraft.linksData) {

        const def = createDefaultLinksPage();

        linksDraft.linksData = def.linksData;

      }

      linksDraft.id = 'page_links';

      linksDraft.slug = 'links';

      linksDraft.title = 'Links';

      linksDraft.type = 'page';

      delete linksDraft.coverImage;

      delete linksDraft.featuredImage;

    }



    // Ensure linksData.items is purged of legacy dummy links (Facebook, Instagram, Twitter)

    if (linksDraft && linksDraft.linksData) {

      if (!Array.isArray(linksDraft.linksData.items)) {

        linksDraft.linksData.items = [];

      }

      const siteTitle = (cfg.design?.branding?.siteTitle) || cfg.name || 'Cedar';

      const siteLogo = (cfg.design?.branding?.generalLogo) || 'images/Lamp.png';

      linksDraft.linksData.items = linksDraft.linksData.items.filter(i => i && i.id !== 'link_fb' && i.id !== 'link_ig' && i.id !== 'link_tw');

      if (linksDraft.linksData.items.length === 0) {
        linksDraft.linksData.items = [
          {
            id: 'link_blog',

            title: `${siteTitle} Blog`,

            subtitle: 'Latest essays and stories',

            url: '/blog/',

            icon: siteLogo,

            enabled: true

          }

        ];

      } else {

        linksDraft.linksData.items.forEach(it => {

          if (it && (it.id === 'link_blog' || it.url === '/blog/' || it.url === 'blog')) {

            if (it.subtitle === 'Read articles and essays') it.subtitle = 'Latest essays and stories';

            if (it.title === 'Blog') it.title = `${siteTitle} Blog`;

            if (it.icon === 'blog' && !it.customIcon) it.icon = siteLogo;

          }

        });

      }

    }



    return linksDraft;

  }



  window.deduplicateDrafts = deduplicateDrafts;

  window.generateRssPageData = generateRssPageData;

  window.syncRssPageDraft = syncRssPageDraft;

  window.generateLinksPageData = generateLinksPageData;

  window.syncLinksPageDraft = syncLinksPageDraft;



  function createDefaultRssPage(config) {

    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};

    const rssData = generateRssPageData(cfg);

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')

      ? resolveProjectDefaultAuthor()

      : ((cfg && cfg.defaultAuthor) || '');

    const now = Date.now();

    return {

      id: 'page_rss',

      type: 'page',

      status: 'published',

      title: 'RSS',

      slug: 'rss',

      subtitle: rssData.subtitle,

      authorName: defaultAuth,

      authors: [defaultAuth],

      authorInitial: defaultAuth.charAt(0).toUpperCase(),

      markdown: rssData.markdown,

      proseHtml: rssData.proseHtml,

      hidden: true,

      retired: true,

      images: [],

      createdAt: now - 86400000,

      updatedAt: now - 86400000,

      publishedAt: now - 86400000,

      date: new Date(now - 86400000).toISOString().split('T')[0],

      publishedDate: new Date(now - 86400000).toISOString().split('T')[0]

    };

  }



  // =========================================================================
  // CEDAR SINGLE SOURCE OF TRUTH STORE (CedarStore)
  // Physical partition of posts and pages, single deterministic persistence coordinator.
  // =========================================================================

  const CedarStore = {
    _posts: new Map(),
    _pages: new Map(),
    _subscribers: new Set(),
    _statusChangeTimestamps: new Map(),

    subscribe(fn) {
      if (typeof fn === 'function') {
        this._subscribers.add(fn);
        return () => this._subscribers.delete(fn);
      }
      return () => {};
    },

    notify() {
      this._subscribers.forEach(fn => {
        try { fn(this); } catch (e) { console.warn('[CedarStore] subscriber error:', e); }
      });
    },

    getPosts() {
      return Array.from(this._posts.values());
    },

    getPages() {
      for (const p of this._pages.values()) {
        if (p && p.type === 'page' && p.title && (!p.slug || p.slug === 'untitled-page' || p.slug === 'untitled-post')) {
          const t = (p.title || '').trim();
          if (t && t.toLowerCase() !== 'untitled page' && t.toLowerCase() !== 'page') {
            p.slug = (typeof generateSlug === 'function') ? generateSlug(t, 'untitled-page', 20) : t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          }
        }
      }
      return Array.from(this._pages.values()).filter(p => Boolean(p));
    },

    getAllDrafts() {
      return [...this._posts.values(), ...this.getPages()];
    },

    getPost(idOrSlug) {
      if (!idOrSlug) return null;
      if (this._posts.has(idOrSlug)) return this._posts.get(idOrSlug);
      const low = String(idOrSlug).toLowerCase().trim();
      for (const p of this._posts.values()) {
        if (p.slug && p.slug.toLowerCase().trim() === low) return p;
      }
      return null;
    },

    getPage(idOrSlug) {
      if (!idOrSlug) return null;
      if (this._pages.has(idOrSlug)) return this._pages.get(idOrSlug);
      const low = String(idOrSlug).toLowerCase().trim();
      for (const p of this._pages.values()) {
        if (p.slug && p.slug.toLowerCase().trim() === low) return p;
      }
      return null;
    },

    get(idOrSlug) {
      return this.getPost(idOrSlug) || this.getPage(idOrSlug) || null;
    },

    isPageItem(item) {
      if (!item) return false;
      if (item.type === 'page' || item.isCategoryAggregate) return true;
      const id = String(item.id || '');
      if (id.startsWith('page_') || id.startsWith('page-')) return true;
      if (item.linksData) return true;
      const slug = (item.slug || '').trim().toLowerCase();
      if (slug === 'about' || slug === 'rss' || slug === 'about-cedar' || slug === 'links' || slug === 'all') return true;
      return false;
    },

    recordStatusChange(id) {
      if (id) this._statusChangeTimestamps.set(id, Date.now());
    },

    upsertPost(post) {
      if (!post || !post.id) return post;
      post.type = 'post';
      this._posts.set(post.id, post);
      this._syncWindowDrafts();
      return post;
    },

    upsertPage(page) {
      if (!page || !page.id) return page;
      page.type = 'page';
      this._pages.set(page.id, page);
      this._syncWindowDrafts();
      return page;
    },

    upsert(item) {
      if (!item || !item.id) return item;
      if (this.isPageItem(item)) {
        return this.upsertPage(item);
      }
      return this.upsertPost(item);
    },

    removePost(id) {
      const res = this._posts.delete(id);
      this._syncWindowDrafts();
      return res;
    },

    removePage(id) {
      const res = this._pages.delete(id);
      this._syncWindowDrafts();
      return res;
    },

    remove(id) {
      const r1 = this._posts.delete(id);
      const r2 = this._pages.delete(id);
      this._syncWindowDrafts();
      return r1 || r2;
    },

    _syncWindowDrafts() {
      const all = this.getAllDrafts();
      drafts.length = 0;
      for (let i = 0; i < all.length; i++) {
        drafts.push(all[i]);
      }
    },

    _ensureBuiltInPages() {
      // 1. RSS
      if (!this._pages.has('page_rss')) {
        const rss = (typeof createDefaultRssPage === 'function')
          ? createDefaultRssPage(window.projectConfig)
          : { id: 'page_rss', type: 'page', title: 'RSS', slug: 'rss', status: 'published', hidden: true, retired: true };
        this._pages.set('page_rss', rss);
      } else if (typeof syncRssPageDraft === 'function') {
        syncRssPageDraft(window.projectConfig);
      }
      const rssDraft = this._pages.get('page_rss');
      if (rssDraft) {
        rssDraft.id = 'page_rss';
        rssDraft.slug = 'rss';
        rssDraft.title = 'RSS';
        const isRssOn = !rssDraft.hidden && !rssDraft.retired;
        if (window.projectConfig) window.projectConfig.rssEnabled = isRssOn;
        try { localStorage.setItem(STORAGE_KEY_RSS_ENABLED, isRssOn ? 'true' : 'false'); } catch (e) {}
      }

      // 2. About
      if (!this._pages.has('page_about')) {
        const about = (typeof createDefaultAboutPage === 'function')
          ? createDefaultAboutPage()
          : { id: 'page_about', type: 'page', title: 'About', slug: 'about', status: 'published', hidden: true, retired: true };
        this._pages.set('page_about', about);
      }
      const aboutDraft = this._pages.get('page_about');
      if (aboutDraft) {
        aboutDraft.id = 'page_about';
        aboutDraft.slug = 'about';
        aboutDraft.title = 'About';
        const md = (aboutDraft.markdown || '').trim();
        if (md.includes('Welcome to **Cedar**') || md.includes('Welcome to **Outpost**')) {
          aboutDraft.markdown = '';
          aboutDraft.proseHtml = '';
          if (aboutDraft.subtitle === 'About this publication, its author, and philosophy.') {
            aboutDraft.subtitle = '';
          }
        }
      }

      // 3. About Cedar
      if (!this._pages.has('page_about_cedar')) {
        const aboutCedar = (typeof createDefaultAboutCedarPage === 'function')
          ? createDefaultAboutCedarPage()
          : { id: 'page_about_cedar', type: 'page', title: 'About Cedar', slug: 'about-cedar', status: 'published', hidden: true, retired: true };
        this._pages.set('page_about_cedar', aboutCedar);
      }
      const cedarDraft = this._pages.get('page_about_cedar');
      if (cedarDraft) {
        const canonicalCedar = (typeof createDefaultAboutCedarPage === 'function') ? createDefaultAboutCedarPage() : null;
        cedarDraft.id = 'page_about_cedar';
        cedarDraft.slug = 'about-cedar';
        cedarDraft.title = 'About Cedar';
        cedarDraft.subtitle = '';
        cedarDraft.showSubtitle = false;
        cedarDraft.hidden = true;
        cedarDraft.retired = true;
        if (canonicalCedar) {
          cedarDraft.markdown = canonicalCedar.markdown;
          cedarDraft.proseHtml = canonicalCedar.proseHtml;
        }
      }

      // 4. Links
      if (!this._pages.has('page_links')) {
        const links = (typeof createDefaultLinksPage === 'function')
          ? createDefaultLinksPage()
          : { id: 'page_links', type: 'page', title: 'Links', slug: 'links', status: 'published', hidden: true, retired: true };
        this._pages.set('page_links', links);
      }
      const linksDraft = this._pages.get('page_links');
      if (linksDraft) {
        linksDraft.id = 'page_links';
        linksDraft.slug = 'links';
        linksDraft.title = 'Links';
        delete linksDraft.coverImage;
        delete linksDraft.featuredImage;
        if (!linksDraft.linksData && typeof createDefaultLinksPage === 'function') {
          linksDraft.linksData = createDefaultLinksPage().linksData;
        } else if (linksDraft.linksData && Array.isArray(linksDraft.linksData.items)) {
          linksDraft.linksData.items = linksDraft.linksData.items.filter(i => i && i.id !== 'link_fb' && i.id !== 'link_ig' && i.id !== 'link_tw');
          if (linksDraft.linksData.items.length === 0 && typeof createDefaultLinksPage === 'function') {
            linksDraft.linksData.items = createDefaultLinksPage().linksData.items;
          }
        }
      }

      // 5. All
      if (!this._pages.has('page_all')) {
        const all = (typeof createDefaultAllPage === 'function')
          ? createDefaultAllPage()
          : { id: 'page_all', type: 'page', title: 'All', slug: 'all', status: 'published', hidden: false, retired: false };
        this._pages.set('page_all', all);
      }
      const allDraft = this._pages.get('page_all');
      if (allDraft) {
        allDraft.id = 'page_all';
        allDraft.slug = 'all';
        allDraft.title = 'All';
        const isAllExplicitlyDisabled = (window.projectConfig && (window.projectConfig.allDisabled === true || window.projectConfig.allEnabled === false)) ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('cedar_all_disabled') === 'true');
        if (isAllExplicitlyDisabled) {
          allDraft.hidden = true;
          allDraft.retired = true;
        } else if (allDraft.hidden === undefined && allDraft.retired === undefined) {
          allDraft.hidden = false;
          allDraft.retired = false;
        }
        if (!allDraft.hasHadRecentPostsInit) {
          const curHtml = String(allDraft.proseHtml || '');
          const curMd = String(allDraft.markdown || '');
          const curLayout = allDraft.layout || 'grid';
          if (!curHtml.includes('page-recent-posts-block') && !curMd.includes(':::recent-posts')) {
            allDraft.proseHtml = (curHtml ? curHtml + '\n' : '') + `<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="${curLayout}" contenteditable="false"></div>`;
            allDraft.markdown = (curMd ? curMd + '\n\n' : '') + `:::recent-posts layout="${curLayout}":::`;
          }
          allDraft.hasHadRecentPostsInit = true;
        }
      }
    },

    _isHydrating: false,

    getDeletedIdsSet() {
      const set = new Set();
      try {
        const raw = localStorage.getItem('cedar_deleted_draft_ids');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) arr.forEach(id => { if (id) set.add(String(id)); });
        }
      } catch (e) {}
      if (window.projectConfig && Array.isArray(window.projectConfig.deletedDraftIds)) {
        window.projectConfig.deletedDraftIds.forEach(id => { if (id) set.add(String(id)); });
      }
      return set;
    },

    markIdDeleted(id) {
      if (!id) return;
      const set = this.getDeletedIdsSet();
      set.add(String(id));
      const arr = Array.from(set);
      try {
        localStorage.setItem('cedar_deleted_draft_ids', JSON.stringify(arr));
      } catch (e) {}
      if (window.projectConfig) {
        window.projectConfig.deletedDraftIds = arr;
      }
    },

    isPurgedTestPage() {
      return false;
    },

    healDraftItem(d) {
      if (!d || typeof d !== 'object') return false;
      let changed = false;
      if (typeof window.repairUtf8Mojibake === 'function') {
        const fields = ['title', 'subtitle', 'markdown', 'proseHtml', 'html', 'customDesc', 'bodyExcerpt'];
        for (const f of fields) {
          if (typeof d[f] === 'string' && d[f]) {
            const fixed = window.repairUtf8Mojibake(d[f]);
            if (fixed !== d[f]) {
              d[f] = fixed;
              changed = true;
            }
          }
        }
      }
      return changed;
    },

    persistToLocalStorage(draftsList) {
      const list = Array.isArray(draftsList) ? draftsList : this.getAllDrafts();
      const key = window.STORAGE_KEY_DRAFTS || STORAGE_KEY_DRAFTS || 'sheesh_static_writer_drafts_v2';
      try {
        localStorage.removeItem('cedar_browser_backup_drafts');
        localStorage.removeItem('outpost_browser_backup_drafts');
        localStorage.removeItem(window.LEGACY_STORAGE_DRAFTS || 'sheesh_static_writer_drafts');
      } catch (e) {}
      try {
        localStorage.setItem(key, JSON.stringify(list));
        return true;
      } catch (qErr1) {
        try {
          const slimProse = list.map(d => {
            if (!d || typeof d !== 'object') return d;
            let slimHtml = d.proseHtml;
            if (slimHtml && typeof slimHtml === 'string') {
              slimHtml = slimHtml.replace(/<img\b([^>]*?)>/gi, (fullTag, attrs) => {
                const origMatch = attrs.match(/data-original-src=["']([^"']+)["']/i);
                const srcMatch = attrs.match(/\bsrc=["'](data:image\/[^"']+)["']/i);
                if (origMatch && srcMatch) {
                  return fullTag.replace(srcMatch[0], `src="${origMatch[1]}"`);
                }
                return fullTag;
              });
            }
            return { ...d, proseHtml: slimHtml };
          });
          localStorage.setItem(key, JSON.stringify(slimProse));
          return true;
        } catch (qErr2) {
          try {
            const slimAll = list.map(d => {
              if (!d || typeof d !== 'object') return d;
              let slimHtml = d.proseHtml;
              if (slimHtml && typeof slimHtml === 'string') {
                slimHtml = slimHtml.replace(/<img\b([^>]*?)>/gi, (fullTag, attrs) => {
                  const origMatch = attrs.match(/data-original-src=["']([^"']+)["']/i);
                  const srcMatch = attrs.match(/\bsrc=["'](data:image\/[^"']+)["']/i);
                  if (origMatch && srcMatch) {
                    return fullTag.replace(srcMatch[0], `src="${origMatch[1]}"`);
                  }
                  return fullTag;
                });
              }
              const slimImages = Array.isArray(d.images)
                ? d.images.map(im => (im && typeof im === 'object' && im.dataUrl) ? { ...im, dataUrl: undefined, blob: undefined } : im)
                : d.images;
              const slimTemp = Array.isArray(d.tempImages)
                ? d.tempImages.map(im => (im && typeof im === 'object' && im.dataUrl) ? { ...im, dataUrl: undefined, blob: undefined } : im)
                : d.tempImages;
              return { ...d, proseHtml: slimHtml, images: slimImages, tempImages: slimTemp };
            });
            localStorage.setItem(key, JSON.stringify(slimAll));
            return true;
          } catch (qErr3) {
            return false;
          }
        }
      }
    },

    hydrateFromList(rawList) {
      if (this._isHydrating) return;
      this._isHydrating = true;
      try {
        rawList = Array.isArray(rawList) ? [...rawList] : [];
        this._posts.clear();
        this._pages.clear();
        const deletedIds = this.getDeletedIdsSet();

      const sampleTitles = new Set([
        '10 Reasons Why Offline-First Web Tools Win',
        'Deploying a Static Blog with Cloudflare Pages and Git',
        'Welcome to Your Drop-in Blog Engine',
        'About Our Publication',
        'Contact & Signals'
      ]);
      const sampleSlugs = new Set([
        '10-reasons-why-offline-first-web-tools-win',
        'deploying-a-static-blog-with-cloudflare-pages-and-git',
        'welcome-to-your-drop-in-blog-engine',
        'about-our-publication',
        'contact-signals'
      ]);

      for (let d of rawList) {
        if (!d || !d.id) continue;
        if (deletedIds.has(String(d.id))) continue;
        if (sampleTitles.has(d.title) || sampleSlugs.has(d.slug)) continue;
        this.healDraftItem(d);
        if (this.isPurgedTestPage(d)) continue;


        // Image & prose cleanup
        if (typeof window.reconcileDraftImages === 'function') {
          window.reconcileDraftImages(d);
        }
        if (d.proseHtml) {
          let cleaned = (typeof window.cleanProseHtmlForStorage === 'function')
            ? window.cleanProseHtmlForStorage(d.proseHtml)
            : d.proseHtml;
          cleaned = cleaned.replace(/<div\s+id=["']canvas-drop-indicator["'][^>]*>[\s\S]*?<\/div>/gi, '');
          cleaned = cleaned.replace(/(selected|selected-item)/gi, '');
          cleaned = cleaned.replace(/class=["']([^"']*)["']/gi, (match, classes) => {
            const c = classes.trim().replace(/\s+/g, ' ');
            return c ? `class="${c}"` : '';
          });
          d.proseHtml = cleaned;
        }


        const isPage = this.isPageItem(d);
        if (isPage) {
          d.type = 'page';
          if (d.status !== 'hidden') d.status = 'published';
          if (typeof isPageActuallyBlank === 'function' && isPageActuallyBlank(d)) {
            continue;
          }
          const lowSlug = (d.slug || '').toLowerCase().trim();
          if (lowSlug === 'rss' || d.id === 'page_rss') {
            d.id = 'page_rss';
            d.slug = 'rss';
            d.title = 'RSS';
          } else if (lowSlug === 'about' || d.id === 'page_about') {
            d.id = 'page_about';
            d.slug = 'about';
            d.title = 'About';
          } else if (lowSlug === 'about-cedar' || d.id === 'page_about_cedar') {
            d.id = 'page_about_cedar';
            d.slug = 'about-cedar';
            d.title = 'About Cedar';
          } else if (lowSlug === 'links' || d.id === 'page_links') {
            d.id = 'page_links';
            d.slug = 'links';
            d.title = 'Links';
            delete d.coverImage;
            delete d.featuredImage;
          } else if (lowSlug === 'all' || d.id === 'page_all') {
            d.id = 'page_all';
            d.slug = 'all';
            d.title = 'All';
            delete d.coverImage;
            delete d.featuredImage;
          }
          this._pages.set(d.id, d);
        } else {
          d.type = 'post';
          if (!d.status) d.status = 'draft';
          if (!d.createdAt) d.createdAt = d.updatedAt || Date.now();
          if (!d.updatedAt) d.updatedAt = Date.now();
          if (!d.images) d.images = [];
          if (d.layoutOverride === undefined) d.layoutOverride = false;
          if (d.customHtml === undefined) d.customHtml = '';
          if (d.customCss === undefined) d.customCss = '';
          if (d.tag && (d.tag.trim().toLowerCase() === 'posts' || d.tag.trim().toLowerCase() === 'uncategorized')) {
            d.tag = '';
          }

          // Auto-heal UTC rollover
          if (d.createdAt && typeof getLocalIsoDate === 'function') {
            const localCreated = getLocalIsoDate(d.createdAt);
            const utcCreated = new Date(d.createdAt).toISOString().split('T')[0];
            if (localCreated && utcCreated && localCreated !== utcCreated) {
              if (d.date === utcCreated) d.date = localCreated;
              if (d.publishedDate === utcCreated) d.publishedDate = localCreated;
              if (d.editedDate === utcCreated) d.editedDate = localCreated;
            }
          }

          const localToday = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
          if (d.status === 'published') {
            if (!d.publishedDate) d.publishedDate = d.date || (typeof getLocalIsoDate === 'function' ? getLocalIsoDate(d.createdAt) : new Date(d.createdAt || Date.now()).toLocaleDateString('en-CA'));
            const pubParts = String(d.publishedDate).split('-').map(Number);
            if (pubParts.length === 3 && d.publishedDate < localToday) {
              const pubNoonTs = new Date(pubParts[0], pubParts[1] - 1, pubParts[2], 12, 0, 0, 0).getTime();
              if (!d.publishedAt || d.publishedAt > pubNoonTs + 86400000) {
                d.publishedAt = pubNoonTs;
              }
            } else if (!d.publishedAt) {
              d.publishedAt = d.createdAt || Date.now();
            }
          }
          this._posts.set(d.id, d);
        }
      }

      this._ensureBuiltInPages();


      this._syncWindowDrafts();
      } finally {
        this._isHydrating = false;
      }
    },

    reconcileDiskDrafts(diskDrafts) {
      if (!Array.isArray(diskDrafts) || diskDrafts.length === 0) return { updated: false };
      let anyUpdated = false;
      const deletedIds = this.getDeletedIdsSet();

      for (const [id, pageItem] of Array.from(this._pages.entries())) {
        if (this.healDraftItem(pageItem)) anyUpdated = true;
        if (deletedIds.has(String(id)) || this.isPurgedTestPage(pageItem)) {
          this._pages.delete(id);
          anyUpdated = true;
        }
      }
      for (const [id, postItem] of Array.from(this._posts.entries())) {
        if (this.healDraftItem(postItem)) anyUpdated = true;
        if (deletedIds.has(String(id)) || this.isPurgedTestPage(postItem)) {
          this._posts.delete(id);
          anyUpdated = true;
        }
      }

      for (const diskItem of diskDrafts) {
        if (!diskItem || !diskItem.id) continue;
        if (deletedIds.has(String(diskItem.id))) continue;
        this.healDraftItem(diskItem);
        if (this.isPurgedTestPage(diskItem)) continue;
        const isPage = this.isPageItem(diskItem);
        const targetMap = isPage ? this._pages : this._posts;

        let localItem = targetMap.get(diskItem.id);
        if (!localItem && diskItem.slug && diskItem.slug !== 'untitled-post' && diskItem.slug !== 'untitled-page') {
          const dSlug = diskItem.slug.toLowerCase().trim();
          for (const it of targetMap.values()) {
            if (it.slug && it.slug.toLowerCase().trim() === dSlug) {
              localItem = it;
              break;
            }
          }
        }

        if (!localItem) {
          if (isPage) {
            diskItem.type = 'page';
            this._pages.set(diskItem.id, diskItem);
          } else {
            diskItem.type = 'post';
            this._posts.set(diskItem.id, diskItem);
          }
          anyUpdated = true;
        } else {
          const memTime = Number(localItem.updatedAt || localItem.createdAt || 0);
          const diskTime = Number(diskItem.updatedAt || diskItem.createdAt || 0);
          const recentStatusChange = (this._statusChangeTimestamps.get(localItem.id) && (Date.now() - this._statusChangeTimestamps.get(localItem.id) < 30000));

          if (diskTime >= memTime) {
            const preservedStatus = recentStatusChange ? localItem.status : diskItem.status;
            Object.assign(localItem, diskItem);
            if (recentStatusChange) localItem.status = preservedStatus;
            this.healDraftItem(localItem);
            anyUpdated = true;
          } else {
            const savedTitle = localItem.title;
            const savedStatus = localItem.status;
            const savedSlug = localItem.slug;
            const savedMd = localItem.markdown;
            const savedHtml = localItem.proseHtml;
            const savedUpdated = localItem.updatedAt;
            Object.assign(localItem, diskItem, {
              title: savedTitle,
              status: savedStatus,
              slug: savedSlug,
              markdown: savedMd,
              proseHtml: savedHtml,
              updatedAt: savedUpdated
            });
            if (this.healDraftItem(localItem)) anyUpdated = true;
          }
        }
      }

      if (anyUpdated) {
        this._syncWindowDrafts();
        this.persistToLocalStorage(this.getAllDrafts());
        this.notify();
      }
      return { updated: anyUpdated };
    }
  };

  window.CedarStore = CedarStore;

  function loadDraftsFromStorage() {
    loadProjectFromStorage();

    if (typeof window !== 'undefined' && window.__vaultDraftsHydratedAtBoot && CedarStore && (CedarStore._posts.size > 0 || CedarStore._pages.size > 0)) {
      window.__vaultDraftsHydratedAtBoot = false;
      drafts = CedarStore.getAllDrafts();
      window.drafts = drafts;
      if (typeof window.reconcileAuthorsFromDrafts === 'function') {
        window.reconcileAuthorsFromDrafts();
      }
      return;
    }

    let parsed = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DRAFTS) || localStorage.getItem(LEGACY_STORAGE_DRAFTS);
      if (raw) {
        parsed = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load drafts from localStorage:', e);
      parsed = [];
    }

    const preCount = Array.isArray(parsed) ? parsed.length : 0;
    const parsedPostsCount = Array.isArray(parsed)
      ? parsed.filter(d => d && (d.type === 'post' || String(d.id || '').startsWith('post_'))).length
      : 0;
    const existingPostsCount = (CedarStore && CedarStore._posts) ? CedarStore._posts.size : 0;

    if (existingPostsCount > 0 && parsedPostsCount === 0) {
      if (Array.isArray(parsed) && parsed.length > 0) {
        CedarStore.reconcileDiskDrafts(parsed);
      }
    } else {
      CedarStore.hydrateFromList(parsed);
    }
    drafts = CedarStore.getAllDrafts();
    window.drafts = drafts;

    if (typeof window.reconcileAuthorsFromDrafts === 'function') {
      window.reconcileAuthorsFromDrafts();
    }

    if (drafts.length !== preCount && (parsedPostsCount > 0 || existingPostsCount > 0)) {
      saveDraftsToStorage();
    }
  }

  // =========================================================================

  // BLANK PAGE SANITIZATION & DISCARD

  // =========================================================================

  function isPageActuallyBlank(draft) {

    if (!draft) return false;

    const isPageType = draft.type === 'page' || String(draft.id || '').startsWith('page_');

    if (!isPageType) return false;



    // Never consider built-in pages blank (About, RSS, Links, All, etc.)

    const id = (draft.id || '').trim().toLowerCase();

    const slug = (draft.slug || '').trim().toLowerCase();

    const rawTitle = (draft.title || '').trim();

    const titleLower = rawTitle.toLowerCase();

    if (

      id === 'page_rss' || id === 'page_about' || id === 'page_links' || id === 'page_all' || id === 'page_about_cedar' ||

      slug === 'rss' || slug === 'about' || slug === 'links' || slug === 'all' || slug === 'about-cedar' ||

      titleLower === 'rss' || titleLower === 'about' || titleLower === 'links' || titleLower === 'all' || titleLower === 'about cedar' ||

      draft.isBuiltIn

    ) {

      return false;

    }



    // Never consider redirect pages blank
    if (draft.isRedirect || draft.redirectUrl) return false;

    // Never consider category aggregate pages blank

    if (draft.isCategoryAggregate || String(draft.id || '').startsWith('page_cat_')) return false;

    const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);

    if (proj && Array.isArray(proj.categories)) {

      const catSet = new Set(proj.categories.map(c => String(c).trim().toLowerCase()));

      if (catSet.has(titleLower) || catSet.has(slug)) return false;

    }



    // Check title: if user provided a meaningful title (not empty, not default placeholder)

    if (rawTitle && titleLower !== 'untitled page' && titleLower !== 'untitled' && titleLower !== 'new page') {

      return false;

    }



    // Check subtitle

    if ((draft.subtitle || '').trim().length > 0) return false;



    // Check cover image

    if ((draft.coverImage || '').trim().length > 0) return false;



    // Check images array

    if (Array.isArray(draft.images) && draft.images.length > 0) return false;



    // Check customHtml / customCss

    if ((draft.customHtml || '').trim().length > 0) return false;

    if ((draft.customCss || '').trim().length > 0) return false;



    // Check markdown

    if (draft.markdown) {

      const strippedMd = draft.markdown

        .replace(/[\s\u200B\u00A0\uFEFF]/g, '')

        .replace(/&nbsp;/gi, '')

        .trim();

      if (strippedMd.length > 0) return false;

    }



    // Check proseHtml

    if (draft.proseHtml) {

      const html = draft.proseHtml.trim();

      if (/<(img|figure|iframe|hr|table|pre|blockquote|video|audio|svg|canvas)\b/i.test(html)) {

        return false;

      }

      if (/\b(page-recent-posts-block|page-individual-post-block|custom-gallery-grid|article-share-block)\b/i.test(html)) {

        return false;

      }

      const textOnly = html

        .replace(/<[^>]*>/g, '')

        .replace(/&nbsp;/gi, '')

        .replace(/[\s\u200B\u00A0\uFEFF]/g, '')

        .trim();

      if (textOnly.length > 0) return false;

    }



    // Check live DOM elements if currently in editor for this draft

    if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.currentDraft && window.currentDraft.id === draft.id) {

      const canvasTitle = document.getElementById('rich-canvas-title');

      if (canvasTitle) {

        const ct = (canvasTitle.textContent || '').trim();

        const ctl = ct.toLowerCase();

        if (ct && ctl !== 'untitled page' && ctl !== 'untitled' && ctl !== 'new page') {

          return false;

        }

      }

      const canvasSub = document.getElementById('rich-canvas-subtitle');

      if (canvasSub && (canvasSub.textContent || '').trim().length > 0) {

        return false;

      }

      const canvasProse = document.getElementById('rich-canvas-prose');

      if (canvasProse) {

        if (canvasProse.querySelector('img, figure, iframe, hr, table, pre, blockquote, video, audio, .page-recent-posts-block, .page-individual-post-block, .custom-gallery-grid, .article-share-block')) {

          return false;

        }

        const pt = (canvasProse.textContent || '')

          .replace(/&nbsp;/gi, '')

          .replace(/[\s\u200B\u00A0\uFEFF]/g, '')

          .trim();

        if (pt.length > 0) return false;

      }

      const mdInput = document.getElementById('markdown-input');

      if (mdInput) {

        const mt = (mdInput.value || '')

          .replace(/&nbsp;/gi, '')

          .replace(/[\s\u200B\u00A0\uFEFF]/g, '')

          .trim();

        if (mt.length > 0) return false;

      }

    }



    return true;

  }



  function discardBlankDraft(draft) {

    if (!draft) return;

    const targetId = draft.id;

    if (!targetId) return;



    if (typeof window !== 'undefined' && Array.isArray(window.drafts)) {

      window.drafts = window.drafts.filter(d => d && d.id !== targetId);

    }

    if (typeof drafts !== 'undefined' && Array.isArray(drafts)) {

      drafts = drafts.filter(d => d && d.id !== targetId);

    }



    const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);

    if (proj && Array.isArray(proj.activityLog)) {

      proj.activityLog = proj.activityLog.filter(a => !(a && a.data && a.data.id === targetId));

      try {

        localStorage.setItem('cedar_activity_log', JSON.stringify(proj.activityLog));

      } catch (e) {}

    }

    if (typeof window !== 'undefined' && Array.isArray(window.activityLog)) {

      window.activityLog = window.activityLog.filter(a => !(a && a.data && a.data.id === targetId));

    }



    if (typeof window !== 'undefined' && window.currentDraft && window.currentDraft.id === targetId) {

      window.currentDraft = null;

    }

    if (typeof currentDraft !== 'undefined' && currentDraft && currentDraft.id === targetId) {

      currentDraft = null;

    }



    saveDraftsToStorage();



    if (typeof window !== 'undefined') {

      if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();

      if (typeof window.renderStaticPages === 'function') window.renderStaticPages();

      if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();

    }

  }



  window.isPageActuallyBlank = isPageActuallyBlank;

  window.discardBlankDraft = discardBlankDraft;



  // Immediately initialize drafts from storage on module load

  loadDraftsFromStorage();



  async function saveDraftsToStorage() {

    let savedInVirtual = false;

    let savedInLocal = false;



    if (window.CedarStore) {
      if (Array.isArray(window.drafts)) {
        window.drafts.forEach(d => {
          if (d && d.id) {
            const existing = window.CedarStore.get(d.id);
            if (!existing) {
              window.CedarStore.upsert(d);
            } else if (existing !== d) {
              const explicitlyUnpublished = Boolean(
                d.userUnpublished ||
                existing.userUnpublished ||
                (typeof localStorage !== 'undefined' && localStorage.getItem('cedar_user_unpublished_' + d.id) === 'true')
              );
              const wasPublished = Boolean(
                d.status === 'published' || existing.status === 'published' ||
                d.everPublished || existing.everPublished ||
                d.publishedAt || existing.publishedAt ||
                d.publishedDate || existing.publishedDate ||
                d.publishedSlug || existing.publishedSlug
              );
              Object.assign(existing, d);
              if (!explicitlyUnpublished && wasPublished) {
                existing.status = 'published';
                existing.everPublished = true;
                existing.publishedSlug = d.publishedSlug || existing.publishedSlug || d.slug || existing.slug;
                existing.slugCommitted = true;
                existing.publishedDate = d.publishedDate || existing.publishedDate || d.date || existing.date;
                existing.publishedAt = d.publishedAt || existing.publishedAt || d.createdAt || existing.createdAt;
              }
            }
          }
        });
      }
      drafts = window.CedarStore.getAllDrafts();
    } else if (window.drafts && Array.isArray(window.drafts)) {
      drafts = window.drafts;
    }

    const cur = (typeof window !== 'undefined' && window.currentDraft) || currentDraft;
    const inEditor = typeof window !== 'undefined' && window.currentView === 'editor';

    if (inEditor && cur && Array.isArray(drafts)) {
      if (cur.type === 'page' && isPageActuallyBlank(cur) && !inEditor) {
        drafts = drafts.filter(d => d && d.id !== cur.id);
      } else {
        cur.updatedAt = Date.now();
        const idx = drafts.findIndex(d => d && d.id === cur.id);
        if (idx !== -1) {
          const existing = drafts[idx];
          if (existing && existing !== cur) {
            const explicitlyUnpublished = Boolean(
              cur.userUnpublished ||
              existing.userUnpublished ||
              (typeof localStorage !== 'undefined' && localStorage.getItem('cedar_user_unpublished_' + cur.id) === 'true')
            );
            const wasPublished = Boolean(
              cur.status === 'published' || existing.status === 'published' ||
              cur.everPublished || existing.everPublished ||
              cur.publishedAt || existing.publishedAt ||
              cur.publishedDate || existing.publishedDate ||
              cur.publishedSlug || existing.publishedSlug
            );
            if (!explicitlyUnpublished && wasPublished && cur.status === 'draft') {
              cur.status = 'published';
              cur.everPublished = true;
              cur.publishedSlug = cur.publishedSlug || existing.publishedSlug || cur.slug || existing.slug;
              cur.slugCommitted = true;
              cur.publishedDate = cur.publishedDate || existing.publishedDate || cur.date || existing.date;
              cur.publishedAt = cur.publishedAt || existing.publishedAt || cur.createdAt || existing.createdAt;
            }
          }
          drafts[idx] = cur;
        } else {
          drafts.unshift(cur);
        }
        if (window.CedarStore && typeof window.CedarStore.upsert === 'function') {
          window.CedarStore.upsert(cur);
        }
      }
    }



    if (Array.isArray(drafts)) {

      // Purge any blank pages if not currently active in editor

      drafts = drafts.filter(d => {

        if (!d) return false;

        if (d.type === 'page' && isPageActuallyBlank(d)) {

          if (inEditor && cur && cur.id === d.id) {

            return true;

          }

          return false;

        }

        return true;

      });

      window.drafts = drafts;

      deduplicateDrafts(drafts);

    }



    // Guarantee draft categories, tags, proseHtml, and tempImages are clean before saving

    if (Array.isArray(drafts)) {

      drafts.forEach(d => {

        if (d.type !== 'page' && d.type !== 'note' && d.status !== 'idea') {

          if (!Array.isArray(d.categories)) d.categories = [];

          d.categories = d.categories

            .map(c => typeof c === 'string' ? c.trim() : '')

            .filter(c => c && c.toLowerCase() !== 'uncategorized' && c.toLowerCase() !== 'posts');

          const rawTag = (typeof d.tag === 'string') ? d.tag.trim() : '';

          const normTag = (rawTag.toLowerCase() === 'uncategorized' || rawTag.toLowerCase() === 'posts') ? '' : rawTag;

          if (normTag) {

            d.tag = normTag;

            if (!d.categories.some(c => c.toLowerCase() === normTag.toLowerCase())) {

              d.categories.unshift(normTag);

            }

          } else if (d.categories.length > 0) {

            d.tag = d.categories[0];

          } else {

            d.tag = '';

          }

        }

        if (d.proseHtml) {

          let cleaned = (typeof window.cleanProseHtmlForStorage === 'function')

            ? window.cleanProseHtmlForStorage(d.proseHtml)

            : d.proseHtml;

          cleaned = cleaned.replace(/<div\s+id=["']canvas-drop-indicator["'][^>]*>[\s\S]*?<\/div>/gi, '');

          cleaned = cleaned.replace(/\b(selected|selected-item)\b/gi, '');

          cleaned = cleaned.replace(/class=["']([^"']*)["']/gi, (match, classes) => {

            const c = classes.trim().replace(/\s+/g, ' ');

            return c ? `class="${c}"` : '';

          });

          d.proseHtml = cleaned;

        }

        if (typeof window.reconcileDraftImages === 'function') {

          window.reconcileDraftImages(d);

        }

        if (Array.isArray(d.tempImages) && Array.isArray(d.images)) {

          const activeNames = new Set(d.images.map(im => im && im.filename).filter(Boolean));

          d.tempImages = d.tempImages.filter(im => im && im.filename && activeNames.has(im.filename)).map(im => {

            if (im && im.dataUrl) {

              const slim = { ...im };

              delete slim.dataUrl;

              delete slim.blob;

              return slim;

            }

            return im;

          });

        }

      });

    }



    window.drafts = drafts;



    // 1. LocalStorage Mirror (Immediate synchronous persistence first so reloads never read stale state)

    try {

      const serialized = JSON.stringify(drafts);

      try {

        localStorage.setItem(STORAGE_KEY_DRAFTS, serialized);

        savedInLocal = true;

      } catch (quotaErr) {

        // Free redundant backup keys and retry

        try {

          localStorage.removeItem('cedar_browser_backup_drafts');

          localStorage.removeItem('outpost_browser_backup_drafts');

          localStorage.removeItem(LEGACY_STORAGE_DRAFTS);

        } catch (e) {}

        try {

          localStorage.setItem(STORAGE_KEY_DRAFTS, serialized);

          savedInLocal = true;

        } catch (quotaErr2) {

          // Slim inline dataUrl duplicates in proseHtml where d.images already stores the dataUrl

          const slimDrafts = drafts.map(d => {

            if (!d || !d.proseHtml || !Array.isArray(d.images) || d.images.length === 0) return d;

            const slimHtml = d.proseHtml.replace(/<img\b([^>]*?)>/gi, (fullTag, attrs) => {

              const origMatch = attrs.match(/data-original-src=["']([^"']+)["']/i);

              const srcMatch = attrs.match(/\bsrc=["'](data:image\/[^"']+)["']/i);

              if (origMatch && srcMatch) {

                return fullTag.replace(srcMatch[0], `src="${origMatch[1]}"`);

              }

              return fullTag;

            });

            return { ...d, proseHtml: slimHtml };

          });

          try {

            localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(slimDrafts));

            savedInLocal = true;

          } catch (quotaErr3) {

            // Tier 3: Strip heavy base64 dataUrl payloads from images for the 5MB localStorage mirror
            // (Full high-res images remain intact in memory, IndexedDB CedarVirtualStorage, and local disk)
            const ultraSlimDrafts = slimDrafts.map(d => {

              if (!d) return d;

              const copy = { ...d };

              if (Array.isArray(copy.images)) {

                copy.images = copy.images.map(im => {

                  if (!im || !im.dataUrl) return im;

                  const imCopy = { ...im };

                  delete imCopy.dataUrl;

                  return imCopy;

                });

              }

              if (typeof copy.coverImage === 'string' && copy.coverImage.startsWith('data:image/') && copy.coverImage.length > 4096) {

                const matchingImg = Array.isArray(d.images) && d.images.find(im => im && im.dataUrl === copy.coverImage && im.filename);

                if (matchingImg && matchingImg.filename) {

                  copy.coverImage = matchingImg.relativePath || matchingImg.filename;

                } else {

                  copy.coverImage = '';

                }

              }

              if (typeof copy.featuredImage === 'string' && copy.featuredImage.startsWith('data:image/') && copy.featuredImage.length > 4096) {

                copy.featuredImage = copy.coverImage || '';

              }

              if (typeof copy.proseHtml === 'string' && copy.proseHtml.includes('data:image/') && copy.proseHtml.length > 16384) {

                copy.proseHtml = copy.proseHtml.replace(/\bsrc=["'](data:image\/[^"']{4096,})["']/gi, 'src=""');

              }

              return copy;

            });

            localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(ultraSlimDrafts));

            savedInLocal = true;

          }

        }

      }

      if (cur) {

        localStorage.setItem(STORAGE_KEY_ACTIVE, cur.id);

      } else {

        localStorage.removeItem(STORAGE_KEY_ACTIVE);

      }

    } catch (e) {

      console.warn('[CedarStorage] LocalStorage quota warning:', e);

    }



    // 2. High-Capacity Virtual Vault (OPFS / IndexedDB)

    if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile === 'function') {

      try {

        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile('editor/drafts.json', drafts);

        try { await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeFile('writer/drafts.json', drafts); } catch (e) {}

        savedInVirtual = true;

      } catch (vErr) {

        console.warn('[CedarStorage] Virtual Vault drafts sync warning:', vErr);

      }

    }



    // 3. Physical Vault or Server Bridge (if connected)

    let savedInVault = false;

    const savedVaultPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path') || (window.projectConfig && window.projectConfig.vaultPath)) || '').trim();

    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {

      try {

        await window.SheeshVault.writeFile('editor/drafts.json', drafts);

        try { await window.SheeshVault.writeFile('writer/drafts.json', drafts); } catch (e) {}

        savedInVault = true;

      } catch (vErr) {

        console.warn('[Cedar] Could not auto-sync to vault:', vErr);

      }

    } else if (savedVaultPath && (window.Cedar && window.Cedar.isLocalServer)) {

      try {

        const res = await fetch('/api/vault-write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderPath: savedVaultPath,
            filePath: 'editor/drafts.json',
            content: JSON.stringify(drafts, null, 2),
            encoding: 'utf-8'
          })
        });
        if (res.ok) savedInVault = true;
        try {
          await fetch('/api/vault-write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folderPath: savedVaultPath,
              filePath: 'writer/drafts.json',
              content: JSON.stringify(drafts, null, 2),
              encoding: 'utf-8'
            })
          });
        } catch (wErr) {}

      } catch (bridgeErr) {

        console.warn('[Cedar] Could not auto-sync to server bridge vault:', bridgeErr);

      }

    }



    // 4. Live Server Sync (for live preview & server backup)

    if (typeof window.syncLiveWorkspaceData === 'function') {

      window.syncLiveWorkspaceData();

    }

    if (typeof window.updateAllPreviewFrames === 'function') {

      window.updateAllPreviewFrames();

    }



    if (savedInVault) {

      const folderName = window.SheeshVault.getFolderName();

      updateSaveStatus(true, `Saved to ${folderName || 'Local Storage'}`);

    } else if (savedInLocal || savedInVirtual) {

      updateSaveStatus(true, 'Saved');

    } else {

      updateSaveStatus(false, 'Storage Full!');

    }

  }



  function markDraftAsEdited() {

    const cur = window.currentDraft || currentDraft;

    if (!cur) return;

    if (cur.status === 'published') {

      cur.hasUnpublishedEdits = true;

      cur.editedAt = Date.now();

      cur.editedDate = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');

      if (typeof updateEditorHeader === 'function') {

        updateEditorHeader();

      }

    }

  }



  function scheduleAutosave() {

    updateSaveStatus(false, 'Saving...');

    markDraftAsEdited();

    clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {

      const cur = window.currentDraft || currentDraft;

      if (cur) {

        if (typeof window.syncFormToDraft === 'function') {

          window.syncFormToDraft();

        }

        cur.updatedAt = Date.now();

        saveDraftsToStorage();

        updateStats();

        updateEditorHeader();

      }

    }, 300);

  }



  function updateSaveStatus(isSaved, text) {

    const bar = document.getElementById('draft-status-bar');

    const dot = document.getElementById('save-status-dot');

    const txt = document.getElementById('save-status-text');

    const statusBadge = document.getElementById('editor-post-status-badge');

    const dDot = document.getElementById('designer-save-dot');

    const dTxt = document.getElementById('designer-save-text');

    const ddDot = document.getElementById('designer-drawer-save-dot');

    const ddTxt = document.getElementById('designer-drawer-save-text');



    if (bar) {

      if (isSaved) {

        bar.classList.remove('is-unsaved');

        bar.classList.add('is-saved');

      } else {

        bar.classList.remove('is-saved');

        bar.classList.add('is-unsaved');

      }

    }



    const dotClass = isSaved ? 'draft-indicator' : 'draft-indicator saving';

    if (dot) dot.className = dotClass;

    if (dDot) dDot.className = dotClass;

    if (ddDot) ddDot.className = dotClass;



    // For writer topbar: text stays fixed as 'Saved' to prevent layout shifting

    if (txt) txt.textContent = 'Saved';



    const cur = window.currentDraft || currentDraft;

    // Update status badge & settings/preview buttons on writer topbar (status badge & post settings hidden for pages)

    const isPage = Boolean(

      cur && (

        cur.type === 'page' ||

        cur.isCategoryAggregate ||

        (cur.id && String(cur.id).startsWith('page_')) ||

        (window.location.hash && window.location.hash.startsWith('#write/page'))

      )

    );

    if (isPage && cur) {

      cur.type = 'page';

    }

    const btnPostSettings = document.getElementById('btn-open-post-settings');

    const btnEditorPreview = document.getElementById('btn-editor-preview');



    if (btnPostSettings) {

      btnPostSettings.style.display = 'inline-flex';

      const labelText = isPage ? 'Page Settings' : 'Post Settings';

      btnPostSettings.title = labelText;

      const settingsLabel = document.getElementById('label-post-settings-btn');

      if (settingsLabel) settingsLabel.textContent = labelText;

    }

    if (btnEditorPreview) {

      btnEditorPreview.style.display = 'inline-flex';

    }



    if (isPage) {

      if (statusBadge) statusBadge.style.display = 'none';

    } else if (cur) {

      if (statusBadge) {

        statusBadge.style.display = 'inline-flex';

        if (currentDraft.status === 'published') {

          statusBadge.textContent = isSaved ? 'Published' : 'Unsaved edits';

          statusBadge.className = isSaved ? 'editor-post-status-badge status-published' : 'editor-post-status-badge status-edited';

        } else if (currentDraft.status === 'scheduled') {

          statusBadge.textContent = 'Scheduled';

          statusBadge.className = 'editor-post-status-badge status-scheduled';

        } else {

          statusBadge.textContent = 'Draft';

          statusBadge.className = 'editor-post-status-badge status-draft';

        }

        statusBadge.removeAttribute('title');

      }

    }



    let displayText = 'Saved';

    if (text) {

      displayText = text;

    } else if (window.SheeshVault && window.SheeshVault.isConnected()) {

      displayText = `Saved to ${window.SheeshVault.getFolderName() || 'Local Storage'}`;

    }



    if (dTxt) dTxt.textContent = displayText;

    if (ddTxt) ddTxt.textContent = displayText;

  }





  function setItemStatus(id, newStatus) {

    const item = drafts.find(d => d.id === id);

    if (!item) return;

    const wasEverPublished = Boolean(item.status === 'published' || item.everPublished || item.publishedAt || item.publishedDate || item.publishedSlug);
    item.status = newStatus;

    if (newStatus === 'published') {
      delete item.userUnpublished;
      try { localStorage.removeItem('cedar_user_unpublished_' + id); } catch (e) {}
    } else if (newStatus === 'draft') {
      item.userUnpublished = true;
      try { localStorage.setItem('cedar_user_unpublished_' + id, 'true'); } catch (e) {}
    }

    if (newStatus === 'published' || wasEverPublished) {
      item.everPublished = true;
      if (!item.publishedSlug && item.slug) {
        item.publishedSlug = item.slug;
      }
      item.slugCommitted = true;
    }

    item.updatedAt = Date.now();

    if (window.CedarStore && typeof window.CedarStore.recordStatusChange === 'function') {
      window.CedarStore.recordStatusChange(id);
    }
    if (window.CedarStore && typeof window.CedarStore.upsert === 'function') {
      window.CedarStore.upsert(item);
    }



    const todayIso = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');

    if (newStatus === 'published') {

      const pubDate = item.publishedDate || item.date || todayIso;

      item.publishedDate = pubDate;

      const parts = String(pubDate).split('-').map(Number);

      if (pubDate < todayIso) {

        item.publishedAt = (parts.length === 3) ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime() : Date.now();

        item.editedDate = todayIso;

        item.editedAt = Date.now();

      } else {

        if (!item.publishedAt) item.publishedAt = Date.now();

      }

      item.scheduled = false;

      delete item.scheduledAt;

      delete item.scheduledTime;

      delete item.scheduledDate;

    } else if (newStatus === 'draft') {

      item.scheduled = false;

      delete item.scheduledAt;

      delete item.scheduledTime;

      delete item.scheduledDate;

      if (item.slug) {
        if (window.SheeshVault && typeof window.SheeshVault.deleteFile === 'function') {
          try {
            window.SheeshVault.deleteFile(`blog/published/${item.slug}`);
            window.SheeshVault.deleteFile(`blog/hidden/${item.slug}`);
          } catch (e) {}
        }
        const savedVaultPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || '').trim();
        if (savedVaultPath && (window.Cedar && window.Cedar.isLocalServer)) {
          try {
            fetch('/api/vault-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: savedVaultPath, targetPath: `blog/published/${item.slug}` })
            });
          } catch (e) {}
        }
      }

    }



    if (currentDraft && currentDraft.id === id) {

      currentDraft.status = item.status;

      currentDraft.publishedDate = item.publishedDate;

      currentDraft.publishedAt = item.publishedAt;

      currentDraft.editedDate = item.editedDate;

      currentDraft.editedAt = item.editedAt;

      currentDraft.scheduled = item.scheduled;

    }



    saveDraftsToStorage();

    renderDashboard();

    showToast(`Moved "${item.title || 'Untitled'}" to ${newStatus.toUpperCase()}`);

  }



  function duplicateItem(id) {

    const item = drafts.find(d => d.id === id);

    if (!item) return;

    const copy = JSON.parse(JSON.stringify(item));

    copy.id = (copy.type === 'page' ? 'page_' : 'post_') + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    copy.title = (copy.title || 'Untitled') + ' (Copy)';

    copy.slug = generateSlug(copy.title, '', 20);

    copy.slugCommitted = true;

    copy.status = 'draft';

    copy.createdAt = Date.now();

    copy.updatedAt = Date.now();

    drafts.unshift(copy);

    if (window.CedarStore && typeof window.CedarStore.upsert === 'function') {
      window.CedarStore.upsert(copy);
    }

    saveDraftsToStorage();

    renderDashboard();

    showToast(`Duplicated "${copy.title}"`);

  }



  function deleteItem(id, options) {

    let item = drafts.find(d => d && (d.id === id || d.slug === id));

    if (!item && typeof window !== 'undefined' && Array.isArray(window.drafts)) {

      item = window.drafts.find(d => d && (d.id === id || d.slug === id));

    }

    const realId = item ? item.id : id;



    if (item) {

      const isAll = (typeof window.isAllPage === 'function')

        ? window.isAllPage(item)

        : (function(p) {

            if (!p) return false;

            const itemId = (p.id || '').trim().toLowerCase();

            const itemSlug = (p.slug || '').trim().toLowerCase();

            const itemTitle = (p.title || '').trim().toLowerCase();

            return itemId === 'page_all' || itemSlug === 'all' || itemTitle === 'all';

          })(item);



      const isBuiltIn = typeof window.isBuiltInPage === 'function'

        ? window.isBuiltInPage(item)

        : (function(p) {

            if (!p) return false;

            const itemId = (p.id || '').trim().toLowerCase();

            const itemSlug = (p.slug || '').trim().toLowerCase();

            const itemTitle = (p.title || '').trim().toLowerCase();

            return itemId === 'page_rss' || itemId === 'page_about' || itemId === 'page_about_cedar' || itemId === 'page_links' || itemId === 'page_all' ||

                   itemSlug === 'rss' || itemSlug === 'about' || itemSlug === 'about-cedar' || itemSlug === 'links' || itemSlug === 'all' ||

                   itemTitle === 'rss' || itemTitle === 'about' || itemTitle === 'about cedar' || itemTitle === 'links' || itemTitle === 'all';

          })(item);



      if (isBuiltIn || isAll) {

        if (typeof showToast === 'function') showToast('Built-in pages cannot be deleted');

        return;

      }



      // Page deletion permitted directly (hide feature removed)

      // Deleting a published post requires reverting to draft first (two-step deletion process)
      if (item.type === 'post' && item.status === 'published') {
        if (typeof showToast === 'function') showToast('Published posts cannot be deleted directly. Revert to draft first.');
        return;
      }

    }



    const title = item?.title || 'this item';

    if (!(options && options.skipConfirm) && !confirm(`Are you sure you want to delete "${title}"?`)) return;



    const wasInEditor = window.currentView === 'editor' || (window.location && window.location.hash && window.location.hash.startsWith('#write'));



    clearTimeout(saveTimeout);



    // Clean up all orphaned images and lingering temp images associated with this draft

    if (item) {

      const allImages = [...(item.images || []), ...(item.tempImages || [])];

      allImages.forEach(img => {

        if (img && img.filename && typeof cleanupOrphanedImageStorage === 'function') {

          cleanupOrphanedImageStorage(img.filename, realId);

        }

      });

    }



    // 1. Remove from in-memory drafts

    drafts = drafts.filter(d => {
      if (!d) return false;
      if (d.id === realId || (item?.slug && d.slug === item.slug) || d.slug === realId) return false;
      return true;
    });
    window.drafts = drafts;

    if (window.CedarStore && typeof window.CedarStore.markIdDeleted === 'function') {
      window.CedarStore.markIdDeleted(realId);
    }

    if (window.CedarStore && typeof window.CedarStore.remove === 'function') {
      window.CedarStore.remove(realId);
    }

    if (currentDraft && (currentDraft.id === realId || currentDraft.slug === realId)) {

      currentDraft = null;

      window.currentDraft = null;

    }



    // 2. Remove from projectConfig.activityLog and window.activityLog

    const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);

    if (proj && Array.isArray(proj.activityLog)) {

      proj.activityLog = proj.activityLog.filter(a => !(a && (a.id === realId || a.data?.id === realId || (item?.slug && a.data?.slug === item.slug))));

      try {

        localStorage.setItem('cedar_activity_log', JSON.stringify(proj.activityLog));

      } catch (e) {}

    }

    if (typeof window !== 'undefined' && Array.isArray(window.activityLog)) {

      window.activityLog = window.activityLog.filter(a => !(a && (a.id === realId || a.data?.id === realId || (item?.slug && a.data?.slug === item.slug))));

    }



    // 3. Remove from physical Vault folder or Server Bridge if connected

    const itemSlug = item?.slug || (item?.title && typeof window.generateSlug === 'function' ? window.generateSlug(item.title) : '');
    const candidatePaths = itemSlug ? [
      `blog/published/${itemSlug}`,
      `blog/drafts/${itemSlug}`,
      `blog/hidden/${itemSlug}`,
      `blog/${itemSlug}`,
      `pages/published/${itemSlug}`,
      `pages/hidden/${itemSlug}`,
      `pages/${itemSlug}`
    ] : [];

    if (window.SheeshVault && typeof window.SheeshVault.deleteFile === 'function' && candidatePaths.length > 0) {
      try {
        candidatePaths.forEach(cp => window.SheeshVault.deleteFile(cp));
      } catch (e) {}
    }
    const bridgeVaultPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path') || (window.projectConfig && window.projectConfig.vaultPath)) || '').trim();
    if (bridgeVaultPath && candidatePaths.length > 0 && (window.Cedar && window.Cedar.isLocalServer)) {
      candidatePaths.forEach(cp => {
        fetch('/api/vault-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: bridgeVaultPath, filePath: cp })
        }).catch(() => {});
      });
    }



    // 4. Remove from Virtual Vault / OPFS

    const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;

    if (vStorage && typeof vStorage.deleteFile === 'function' && itemSlug) {

      try {

        vStorage.deleteFile(`blog/published/${itemSlug}/draft.json`);

        vStorage.deleteFile(`blog/drafts/${itemSlug}/draft.json`);

        vStorage.deleteFile(`blog/hidden/${itemSlug}/draft.json`);

        vStorage.deleteFile(`pages/published/${itemSlug}/draft.json`);

        vStorage.deleteFile(`pages/hidden/${itemSlug}/draft.json`);

      } catch (e) {}

    }



    // 5. Persist changes

    saveDraftsToStorage();

    if (typeof saveProjectToStorage === 'function') saveProjectToStorage();



    // 6. Refresh UI components

    renderDashboard();

    if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();

    if (typeof window.renderPostsPipeline === 'function') window.renderPostsPipeline();

    if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();

    if (typeof window.renderStaticPages === 'function') window.renderStaticPages();



    showToast(`Deleted "${title}"`);



    const exportModal = document.getElementById('modal-export');

    if (exportModal) {

      exportModal.style.display = 'none';

      exportModal.classList.remove('active');

    }



    if (wasInEditor) {

      const isPage = item?.type === 'page';

      if (typeof window.navigateTo === 'function') {

        window.navigateTo(isPage ? 'pages' : 'posts');

      } else {

        window.location.hash = isPage ? '#tab=pages' : '#tab=posts';

      }

    }

  }



  // Export to window

  window.deduplicateDrafts = deduplicateDrafts;

  window.resolveProjectDomain = resolveProjectDomain;

  window.resolveProjectBlogPath = resolveProjectBlogPath;

  window.resolveProjectLiveUrl = resolveProjectLiveUrl;

  window.resolveProjectLocalUrl = resolveProjectLocalUrl;

  window.resolveProjectRssEnabled = resolveProjectRssEnabled;

  window.updateCedarTitle = updateCedarTitle;

  window.updateOutpostTitle = updateCedarTitle;

  window.createNewDraftModel = createNewDraftModel;

  window.createNewNoteModel = createNewNoteModel;

  window.createDefaultAboutPage = createDefaultAboutPage;

  window.createDefaultLinksPage = createDefaultLinksPage;

  window.createDefaultRssPage = createDefaultRssPage;

  window.loadProjectFromStorage = loadProjectFromStorage;

  window.saveProjectToStorage = saveProjectToStorage;

  window.loadDraftsFromStorage = loadDraftsFromStorage;

  window.saveDraftsToStorage = saveDraftsToStorage;

  window.scheduleAutosave = scheduleAutosave;

  window.markDraftAsEdited = markDraftAsEdited;

  window.updateSaveStatus = updateSaveStatus;

  window.setItemStatus = setItemStatus;

  window.duplicateItem = duplicateItem;

  window.deleteItem = deleteItem;

  window.isPageActuallyBlank = isPageActuallyBlank;

  window.discardBlankDraft = discardBlankDraft;



  const cedarStateExports = {

    get drafts() { return window.drafts; },

    set drafts(v) { window.drafts = v; },

    get currentDraft() { return window.currentDraft; },

    set currentDraft(v) { window.currentDraft = v; },

    get projectConfig() { return window.projectConfig; },

    set projectConfig(v) { window.projectConfig = v; },

    get activeMode() { return window.activeMode; },

    set activeMode(v) { window.activeMode = v; },

    get currentView() { return window.currentView; },

    set currentView(v) { window.currentView = v; },

    get currentDashboardTab() { return window.currentDashboardTab; },

    set currentDashboardTab(v) { window.currentDashboardTab = v; },

    resolveProjectDomain,

    resolveProjectBlogPath,

    resolveProjectLiveUrl,

    resolveProjectLocalUrl,

    imageRegistry: window.imageRegistry,

    TEMPLATES: window.TEMPLATES

  };

  window.Cedar.state = cedarStateExports;

  window.Outpost.state = cedarStateExports;

  const _stateOldExport = {

    get drafts() { return window.drafts; },

    set drafts(v) { window.drafts = v; },

    get currentDraft() { return window.currentDraft; },

    set currentDraft(v) { window.currentDraft = v; },

    get projectConfig() { return window.projectConfig; },

    set projectConfig(v) { window.projectConfig = v; },

    get activeMode() { return window.activeMode; },

    set activeMode(v) { window.activeMode = v; },

    get currentView() { return window.currentView; },

    set currentView(v) { window.currentView = v; },

    get currentDashboardTab() { return window.currentDashboardTab; },

    set currentDashboardTab(v) { window.currentDashboardTab = v; },

    resolveProjectDomain,

    resolveProjectBlogPath,

    resolveProjectLiveUrl,

    resolveProjectLocalUrl,

    imageRegistry: window.imageRegistry,

    TEMPLATES: window.TEMPLATES

  };



  const cedarStorageExports = {

    loadProjectFromStorage,

    saveProjectToStorage,

    loadDraftsFromStorage,

    saveDraftsToStorage,

    scheduleAutosave,

    markDraftAsEdited,

    updateSaveStatus,

    createNewDraftModel,

    createNewNoteModel,

    setItemStatus,

    duplicateItem,

    deleteItem,

    isPageActuallyBlank,

    discardBlankDraft

  };

  window.Cedar.storage = cedarStorageExports;

  window.Outpost.storage = cedarStorageExports;

  const _storageOldExport = {

    loadProjectFromStorage,

    saveProjectToStorage,

    loadDraftsFromStorage,

    saveDraftsToStorage,

    scheduleAutosave,

    markDraftAsEdited,

    updateSaveStatus,

    createNewDraftModel,

    createNewNoteModel,

    setItemStatus,

    duplicateItem,

    deleteItem,

    isPageActuallyBlank,

    discardBlankDraft

  };

})();

