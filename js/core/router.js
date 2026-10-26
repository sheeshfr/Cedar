/**
 * Cedar - SPA Router, Navigation & View Controller
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  // Cleanse any poisoned or stale previous page session data
  try {
    const s = sessionStorage.getItem('cedar_previous_page') || sessionStorage.getItem('outpost_previous_page');
    if (s) {
      const p = JSON.parse(s);
      if (p && (p.type === 'settings' || p.type === 'authors' || (p.targetHash && (p.targetHash.includes('settings') || p.targetHash.includes('authors'))))) {
        sessionStorage.removeItem('cedar_previous_page');
        sessionStorage.removeItem('outpost_previous_page');
      }
    }
  } catch (e) {}

  let currentDashboardTab = window.currentDashboardTab || 'home';
  window.currentDashboardTab = currentDashboardTab;

  // =========================================================================
  // SPA ROUTER & MODAL STATE
  // =========================================================================
  // SPA HASH ROUTING & HISTORY (ZenTube Anchor & Query Architecture)
  // =========================================================================
  const ROUTE_TO_MODAL = {
    'import': 'modal-import',
    'images': 'modal-images'
  };

  const MODAL_TO_ROUTE = {
    'modal-import': 'import',
    'modal-images': 'images'
  };

  window.ROUTE_TO_MODAL = ROUTE_TO_MODAL;
  window.MODAL_TO_ROUTE = MODAL_TO_ROUTE;

  function isCategoryAggregateItem(itemOrId) {
    if (!itemOrId) return false;
    const currentCatsLower = new Set(
      (window.projectConfig?.categories || [])
        .map(c => (typeof c === 'object' ? (c.name || c.title || '') : String(c || '')).trim().toLowerCase())
        .filter(Boolean)
    );
    if (typeof window.isCategoryPageItem === 'function') {
      if (typeof itemOrId === 'object') {
        return window.isCategoryPageItem(itemOrId, currentCatsLower);
      }
    }
    const rawTarget = typeof itemOrId === 'string'
      ? itemOrId.trim().toLowerCase()
      : String(itemOrId.slug || itemOrId.id || itemOrId.title || '').trim().toLowerCase();

    if (typeof itemOrId === 'object' && itemOrId !== null) {
      if (itemOrId.isCategoryAggregate || String(itemOrId.id || '').startsWith('page_cat_')) return true;
    }
    if (rawTarget.startsWith('page_cat_')) return true;

    if (currentCatsLower.has(rawTarget)) return true;

    if (window.projectConfig && Array.isArray(window.projectConfig.categories)) {
      const match = window.projectConfig.categories.some(c => {
        const str = typeof c === 'object' ? (c.name || c.title || '') : String(c || '');
        const slug = str.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return slug === rawTarget || str.toLowerCase() === rawTarget;
      });
      if (match) return true;
    }

    if (Array.isArray(window.drafts)) {
      const matchDraft = window.drafts.find(d => {
        const dId = String(d.id || '').toLowerCase();
        const dSlug = String(d.slug || '').toLowerCase();
        const dTitle = String(d.title || '').toLowerCase();
        return (dId === rawTarget || dSlug === rawTarget || dTitle === rawTarget) &&
               (d.isCategoryAggregate || dId.startsWith('page_cat_'));
      });
      if (matchDraft) return true;
    }

    return false;
  }

  function isAllPageItem(itemOrId) {
    if (!itemOrId) return false;
    const rawTarget = typeof itemOrId === 'string'
      ? itemOrId.trim().toLowerCase()
      : String(itemOrId.slug || itemOrId.id || itemOrId.title || '').trim().toLowerCase();
    return rawTarget === 'page_all' || rawTarget === 'all';
  }

  function parseRoute(rawHash) {
    let clean = (rawHash || '').trim();
    if (clean.startsWith('#/')) clean = clean.slice(2);
    else if (clean.startsWith('#')) clean = clean.slice(1);
    else if (clean.startsWith('/')) clean = clean.slice(1);

    if (!clean) {
      const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
      if (/\/help\/?$/i.test(pathname)) {
        return { view: 'dashboard', tab: 'help', sub: null, postSlug: null, pageSlug: null, draftId: null, modal: null, isLegacy: false };
      }
      const urlParams = new URLSearchParams(window.location.search || '');
      const queryTab = urlParams.get('tab');
      const validTabs = ['home', 'posts', 'pages', 'media', 'categories', 'designer', 'export', 'publish', 'settings', 'preview', 'help'];
      if (queryTab && validTabs.includes(queryTab)) {
        return { view: 'dashboard', tab: queryTab, sub: null, postSlug: null, pageSlug: null, draftId: null, modal: null, isLegacy: false };
      }
      return { view: 'dashboard', tab: 'home', sub: null, postSlug: null, pageSlug: null, draftId: null, modal: null, isLegacy: false };
    }

    const [pathPart, queryPart] = clean.split('?');
    const params = new URLSearchParams(queryPart || '');

    let modal = params.get('modal') || null;
    let postSlug = params.get('post') || null;
    let pageSlug = params.get('page') || null;
    let draftId = params.get('id') || null;
    let sub = params.get('sub') || null;
    let isLegacy = (rawHash || '').startsWith('#/');

    const pathSegments = (pathPart || '').split('/').filter(Boolean).map(seg => {
      try {
        return decodeURIComponent(seg);
      } catch (e) {
        return seg;
      }
    });
    const rootToken = pathSegments[0] || '';

    // Dedicated Links Page route: #links
    if (rootToken === 'links') {
      return {
        view: 'links',
        tab: null,
        sub: null,
        postSlug: null,
        pageSlug: 'links',
        draftId: 'page_links',
        noteNumber: null,
        modal: null,
        isLegacy: false
      };
    }

    // Editor routes: #write or legacy #editor or #/editor/:id
    if (rootToken === 'editor' || rootToken === 'write') {
      if (rootToken === 'editor') isLegacy = true;
      if (pathSegments.length > 1) {
        let segIdx = 1;
        let explicitType = params.get('type') || null;
        if (pathSegments[1] === 'page' || pathSegments[1] === 'post') {
          explicitType = pathSegments[1];
          segIdx = 2;
        }
        const seg = pathSegments[segIdx] || (explicitType ? null : pathSegments[1]);
        if (seg && !ROUTE_TO_MODAL[seg]) {
          draftId = seg;
          if (explicitType === 'page') {
            pageSlug = seg;
            postSlug = null;
          } else if (explicitType === 'post') {
            postSlug = seg;
            pageSlug = null;
          } else {
            postSlug = seg;
            pageSlug = seg;
          }
        } else if (seg && ROUTE_TO_MODAL[seg]) {
          modal = seg;
        }
        if (pathSegments[segIdx + 1] && ROUTE_TO_MODAL[pathSegments[segIdx + 1]]) {
          modal = pathSegments[segIdx + 1];
        }
      }

      if (pageSlug === 'links' || draftId === 'page_links' || draftId === 'links') {
        return {
          view: 'links',
          tab: null,
          sub: null,
          postSlug: null,
          pageSlug: 'links',
          draftId: 'page_links',
          noteNumber: null,
          modal: null,
          isLegacy: isLegacy
        };
      }

      const rawTarget = String(pageSlug || postSlug || draftId || '').trim().toLowerCase();
      if (rawTarget && (isAllPageItem(rawTarget) || isCategoryAggregateItem(rawTarget) || rawTarget === 'about-cedar' || rawTarget === 'page_about_cedar')) {
        const isCat = isCategoryAggregateItem(rawTarget);
        return {
          view: 'dashboard',
          tab: 'pages',
          sub: isCat ? 'categories' : 'builtin',
          postSlug: null,
          pageSlug: null,
          draftId: null,
          noteNumber: null,
          modal: null,
          isLegacy: isLegacy
        };
      }

      return {
        view: 'editor',
        tab: null,
        sub: null,
        postSlug: postSlug,
        pageSlug: pageSlug,
        draftId: draftId,
        noteNumber: null,
        modal: ROUTE_TO_MODAL[modal] ? modal : null,
        isLegacy: isLegacy
      };
    }

    if (rootToken === 'export-bundle') {
      setTimeout(() => {
        if (typeof window.openPublishDrawer === 'function') {
          window.openPublishDrawer();
        }
      }, 50);
      return {
        view: 'editor',
        tab: null,
        sub: null,
        postSlug: postSlug,
        pageSlug: pageSlug,
        draftId: draftId,
        noteNumber: null,
        modal: null,
        isLegacy: true
      };
    }

    // Modal directly as root token: e.g. #import or legacy #/images
    if (ROUTE_TO_MODAL[rootToken]) {
      return {
        view: 'dashboard',
        tab: 'home',
        sub: null,
        postSlug: null,
        pageSlug: null,
        draftId: null,
        noteNumber: null,
        modal: rootToken,
        isLegacy: true
      };
    }

    // Dashboard tabs: #home, #posts, #pages, #media, #designer, #export, #settings, #preview, #help
    const validTabs = ['home', 'posts', 'pages', 'media', 'designer', 'export', 'publish', 'settings', 'preview', 'help'];
    let tab = 'home';
    if (validTabs.includes(rootToken)) {
      tab = (rootToken === 'export') ? 'publish' : rootToken;
      if (rootToken === 'posts' && pathSegments[1] && ['drafts', 'published', 'hidden', 'all'].includes(pathSegments[1].toLowerCase())) {
        sub = pathSegments[1].toLowerCase();
      }
      if (rootToken === 'pages' && pathSegments[1] && ['my-pages', 'categories', 'builtin', 'all'].includes(pathSegments[1].toLowerCase())) {
        sub = pathSegments[1].toLowerCase();
      }
    } else if (rootToken === 'categories' || rootToken === 'taxonomy') {
      tab = 'pages';
      sub = 'categories';
      isLegacy = true;
    } else if (rootToken === 'design') {
      tab = 'designer';
    } else if (rootToken === 'site-info' || rootToken === 'siteinfo' || rootToken === 'site') {
      tab = 'settings';
    } else if (rootToken.startsWith('settings-sec-')) {
      tab = 'settings';
      sub = rootToken;
    } else if (rootToken.startsWith('help-sec-')) {
      tab = 'help';
      sub = rootToken;
    } else if (rootToken === 'drafts' || rootToken === 'published' || rootToken === 'hidden') {
      tab = 'posts';
      sub = rootToken;
    } else if (rootToken === 'my-pages' || rootToken === 'builtin') {
      tab = 'pages';
      sub = rootToken;
    } else if (rootToken === 'hidden-pages') {
      tab = 'pages';
      sub = 'all';
    } else if (rootToken === 'notes' || rootToken === 'note' || rootToken === 'canvas' || rootToken === 'ideas') {
      // Legacy routes redirect to Posts
      tab = 'posts';
      isLegacy = true;
    } else if (rootToken === 'authors' || rootToken === 'author') {
      // Authors role terminated; redirect to Home dashboard
      tab = 'home';
      isLegacy = true;
    }

    // Legacy tab subpath modal: e.g. posts/export-bundle
    if (pathSegments.length > 1) {
      if (ROUTE_TO_MODAL[pathSegments[1]]) {
        modal = pathSegments[1];
        isLegacy = true;
      }
    }

    let previewRoute = null;
    if (rootToken === 'preview') {
      previewRoute = params.get('route') || params.get('path') || (pathSegments.length > 1 ? '/' + pathSegments.slice(1).join('/') : null);
    }

    return {
      view: 'dashboard',
      tab: tab,
      sub: sub,
      postSlug: null,
      pageSlug: null,
      draftId: null,
      noteNumber: null,
      previewRoute: previewRoute,
      modal: ROUTE_TO_MODAL[modal] ? modal : null,
      isLegacy: isLegacy
    };
  }

  function buildCanonicalUrl(route, draft) {
    if (route.view === 'links') {
      return '#links';
    }
    if (route.view === 'editor') {
      let slugOrId = '';
      if (draft) {
        const hasSlug = draft.slug && draft.slug !== 'untitled-post' && draft.slug !== 'untitled-page';
        slugOrId = hasSlug ? draft.slug : draft.id;
      } else if (route.postSlug) {
        slugOrId = route.postSlug;
      } else if (route.pageSlug) {
        slugOrId = route.pageSlug;
      } else if (route.draftId) {
        slugOrId = route.draftId;
      }

      const q = route.modal ? ('?modal=' + encodeURIComponent(route.modal)) : '';
      const isPage = Boolean(
        (draft && (draft.type === 'page' || draft.isCategoryAggregate || (draft.id && String(draft.id).startsWith('page_')))) ||
        (route.pageSlug && !route.postSlug)
      );
      const prefix = isPage ? '#write/page' : '#write';
      return prefix + (slugOrId ? '/' + encodeURIComponent(slugOrId) : '') + q;
    } else {
      let tab = route.tab || 'home';
      if (tab === 'posts' && route.sub && ['drafts', 'published', 'hidden'].includes(route.sub.toLowerCase())) {
        return '#' + route.sub.toLowerCase();
      }
      if (tab === 'pages' && route.sub && ['my-pages', 'categories', 'builtin'].includes(route.sub.toLowerCase())) {
        if (route.sub.toLowerCase() === 'categories') {
          return '#pages/categories';
        }
        return '#' + route.sub.toLowerCase();
      }
      if (tab === 'help') {
        if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:') {
          const base = (window.location.pathname || '/').replace(/\/help\/?$/i, '/').replace(/\/index\.html$/i, '/');
          return (base.endsWith('/') ? base : base + '/') + 'help/';
        }
        return '#/help/';
      }
      if (tab === 'designer') {
        tab = 'design';
      }
      const params = new URLSearchParams();
      if (route.previewRoute) {
        params.set('route', route.previewRoute);
      }
      if (route.modal) {
        params.set('modal', route.modal);
      }
      const q = params.toString();
      return '#' + tab + (q ? '?' + q : '');
    }
  }

  let _isNavigating = false;

  function navigateTo(path, replace = false) {
    let clean = (path || '').trim();
    if (clean.startsWith('#/')) clean = clean.slice(2);
    else if (clean.startsWith('#')) clean = clean.slice(1);
    else if (clean.startsWith('/')) clean = clean.slice(1);

    // Normalize legacy editor path
    if (clean.startsWith('editor/')) {
      const parts = clean.split('/');
      const dId = parts[1];
      const m = parts[2];
      clean = `write/${encodeURIComponent(dId)}${m ? '?modal=' + encodeURIComponent(m) : ''}`;
    } else if (clean === 'editor') {
      clean = 'write';
    } else if (clean === 'designer') {
      clean = 'design';
    } else if (clean === 'site-info' || clean === 'siteinfo' || clean === 'site') {
      clean = 'settings';
    } else if (clean === 'posts?sub=drafts') {
      clean = 'drafts';
    } else if (clean === 'posts?sub=published') {
      clean = 'published';
    } else if (clean === 'posts?sub=hidden') {
      clean = 'hidden';
    } else if (clean.startsWith('posts?sub=')) {
      const sub = clean.slice('posts?sub='.length).toLowerCase();
      if (['drafts', 'published', 'hidden'].includes(sub)) {
        clean = sub;
      }
    } else if (clean === 'pages?sub=categories' || clean === 'pages/categories') {
      clean = 'pages/categories';
    } else if (clean === 'pages?sub=my-pages') {
      clean = 'my-pages';
    } else if (clean === 'pages?sub=builtin') {
      clean = 'builtin';
    } else if (clean === 'pages?sub=hidden-pages' || clean === 'pages?sub=hidden' || clean === 'hidden-pages') {
      clean = 'pages';
    } else if (clean.startsWith('pages?sub=')) {
      const sub = clean.slice('pages?sub='.length).toLowerCase();
      if (['my-pages', 'builtin'].includes(sub)) {
        clean = sub;
      } else if (sub === 'categories') {
        clean = 'pages/categories';
      } else {
        clean = 'pages';
      }
    } else if (clean.startsWith('write?')) {
      const qStr = clean.slice(6);
      const sp = new URLSearchParams(qStr);
      const targetSlug = sp.get('post') || sp.get('page') || sp.get('id');
      const m = sp.get('modal');
      clean = targetSlug ? `write/${encodeURIComponent(targetSlug)}${m ? '?modal=' + encodeURIComponent(m) : ''}` : 'write';
    }

    if ((clean === 'settings' || clean.startsWith('settings-sec-')) && window._suppressSettingsReopen) {
      console.warn('[Cedar Router] Navigation to settings suppressed during exit transition');
      return;
    }

    if (clean === 'help/') clean = 'help';
    if (clean !== 'settings' && !clean.startsWith('settings-sec-')) {
      document.body.classList.remove('settings-view-active');
    }

    const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:';
    const curPathname = (typeof window !== 'undefined' && window.location && window.location.pathname) || '/';
    const onHelpPathname = /\/help\/?$/i.test(curPathname);

    if (clean === 'help' || clean.startsWith('help-sec-')) {
      const helpBase = curPathname.replace(/\/help\/?$/i, '/').replace(/\/index\.html$/i, '/');
      const helpUrl = (helpBase.endsWith('/') ? helpBase : helpBase + '/') + 'help/' + (clean.startsWith('help-sec-') ? '#' + clean : '');
      _isNavigating = true;
      if (isHttp) {
        try {
          if (replace) {
            window.history.replaceState(null, '', helpUrl);
          } else if (curPathname + window.location.hash !== helpUrl) {
            window.history.pushState(null, '', helpUrl);
          }
        } catch (e) {
          window.location.hash = '#/help/';
        }
      } else {
        window.location.hash = '#/help/';
      }
      _lastHandledRouteTime = 0;
      handleRoute();
      setTimeout(() => { _isNavigating = false; }, 80);
      return;
    }

    const targetHash = '#' + clean;
    if (onHelpPathname && isHttp) {
      const rootBase = curPathname.replace(/\/help\/?$/i, '/') || '/';
      const targetFull = (rootBase.endsWith('/') ? rootBase : rootBase + '/') + targetHash;
      _isNavigating = true;
      try {
        if (replace) {
          window.history.replaceState(null, '', targetFull);
        } else {
          window.history.pushState(null, '', targetFull);
        }
      } catch (e) {
        window.location.hash = targetHash;
      }
      _lastHandledRouteTime = 0;
      handleRoute();
      setTimeout(() => { _isNavigating = false; }, 80);
      return;
    }

    if (window.location.hash === targetHash) {
      _lastHandledRouteTime = 0;
      handleRoute();
      return;
    }
    _isNavigating = true;
    if (replace) {
      try {
        window.history.replaceState(null, '', targetHash);
      } catch (e) {}
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      handleRoute();
    } else {
      window.location.hash = targetHash;
    }
    setTimeout(() => { _isNavigating = false; }, 80);
  }


  // =========================================================================
  // VIEW SWITCHERS & SIDEBAR
  // =========================================================================
  function setupViewControls() {
    const sidebar = document.getElementById('writer-sidebar');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const closeBtn = document.getElementById('btn-close-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    function openSidebar() {
      if (sidebar) sidebar.classList.remove('collapsed');
      if (toggleBtn) toggleBtn.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.add('collapsed');
      if (toggleBtn) toggleBtn.classList.remove('active');
      if (backdrop) backdrop.classList.remove('active');
    }

    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (typeof window.openModal === 'function') {
          window.openModal('modal-export');
        } else if (sidebar && sidebar.classList.contains('collapsed')) {
          openSidebar();
        } else {
          closeSidebar();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeSidebar);
    }

    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    // Return to Dashboard Button in Editor Topbar
    const btnBackToDash = document.getElementById('btn-back-to-dashboard');
    if (btnBackToDash) {
      btnBackToDash.addEventListener('click', (e) => {
        if (e.preventDefault) e.preventDefault();
        const cur = window.currentDraft || currentDraft;
        if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
        if (cur && typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(cur)) {
          if (typeof window.discardBlankDraft === 'function') {
            window.discardBlankDraft(cur);
          }
        } else {
          if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
        }
        const target = btnBackToDash.getAttribute('href') || (window.cedarPreviousDashboardPage && window.cedarPreviousDashboardPage.targetHash) || (currentDashboardTab || 'posts');
        navigateTo(target);
      });
    }

    // Mode Switcher Toggle (See Code / See Post in Post Settings sidebar)
    const btnToggleMode = document.getElementById('btn-toggle-editor-mode');
    if (btnToggleMode) {
      btnToggleMode.addEventListener('click', () => {
        setEditorMode(activeMode === 'canvas' ? 'markdown' : 'canvas');
      });
    }

    const btnCanvas = document.getElementById('btn-mode-canvas');
    if (btnCanvas) btnCanvas.addEventListener('click', () => setEditorMode('canvas'));

    const btnMd = document.getElementById('btn-mode-markdown');
    if (btnMd) btnMd.addEventListener('click', () => setEditorMode('markdown'));

    // Image Manager button
    const btnOpenImages = document.getElementById('btn-open-images');
    if (btnOpenImages) {
      btnOpenImages.addEventListener('click', () => {
        renderImageManagerList();
        openModal('modal-images');
      });
    }

    const btnPickCover = document.getElementById('btn-pick-cover-image');
    if (btnPickCover) {
      btnPickCover.addEventListener('click', () => {
        renderImageManagerList();
        openModal('modal-images');
      });
    }

    // Drafts Modal
    const btnOpenDrafts = document.getElementById('btn-open-drafts');
    if (btnOpenDrafts) {
      btnOpenDrafts.addEventListener('click', () => {
        renderDraftsList();
        openModal('modal-drafts');
      });
    }

    const btnCreateDraft = document.getElementById('btn-create-new-draft');
    if (btnCreateDraft) {
      btnCreateDraft.addEventListener('click', () => {
        const newDraft = createNewDraftModel('', 'blank', 'post', 'draft');
        drafts.unshift(newDraft);
        currentDraft = newDraft;
        saveDraftsToStorage();
        openPostInEditor(newDraft);
        showToast('Created new draft!');
      });
    }

    const btnExportDrafts = document.getElementById('btn-export-all-drafts');
    if (btnExportDrafts) {
      btnExportDrafts.addEventListener('click', () => {
        const json = JSON.stringify(drafts, null, 2);
        triggerDownload(`cedar-all-drafts-${Date.now()}.json`, json, 'application/json');
      });
    }

    // Modal Close Buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) closeModal(modal);
      });
    });

    // Global guard: prevent dragging from inside a modal/popup out onto the backdrop
    // from triggering backdrop click-to-close listeners.
    if (!window._cedarModalDragGuardBound) {
      window._cedarModalDragGuardBound = true;
      let lastMouseDownTarget = null;
      let lastMouseUpTarget = null;
      document.addEventListener('mousedown', (e) => {
        lastMouseDownTarget = e.target;
      }, true);
      document.addEventListener('mouseup', (e) => {
        lastMouseUpTarget = e.target;
      }, true);
      document.addEventListener('click', (e) => {
        const downTarget = lastMouseDownTarget;
        const upTarget = lastMouseUpTarget;
        lastMouseDownTarget = null;
        lastMouseUpTarget = null;
        if (
          e.target &&
          e.target.classList &&
          (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-backdrop')) &&
          downTarget &&
          (downTarget !== e.target || (upTarget && upTarget !== e.target))
        ) {
          e.stopImmediatePropagation();
          e.stopPropagation();
        }
      }, true);
    }

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      let mouseDownOnOverlay = false;
      overlay.addEventListener('mousedown', (e) => {
        mouseDownOnOverlay = (e.target === overlay);
      });
      overlay.addEventListener('click', (e) => {
        if (overlay.id === 'modal-ftue') return;
        if (e.target === overlay && mouseDownOnOverlay) closeModal(overlay);
        mouseDownOnOverlay = false;
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = Array.from(document.querySelectorAll('.modal-overlay')).filter(m => m.style.display !== 'none' && m.id !== 'modal-ftue');
        if (openModals.length > 0) {
          openModals.forEach(m => closeModal(m));
        }
        closeSidebar();
      }
    });
  }


  // =========================================================================
  // PREVIOUS PAGE TRACKING & SETTINGS BACK BUTTON
  // =========================================================================
  const PAGE_TYPE_LABELS = {
    'posts': 'Back to Posts',
    'drafts': 'Back to Drafts',
    'published': 'Back to Published',
    'hidden': 'Back to Hidden',
    'pages': 'Back to Pages',
    'design': 'Back to Design',
    'designer': 'Back to Design',
    'board': 'Back to Board',
    'home': 'Back to Home',
    'media': 'Back to Media',
    'categories': 'Back to Categories',
    'export': 'Back to Publish',
    'publish': 'Back to Publish',
    'editor': 'Back to Editor',
    'write': 'Back to Editor',
    'preview': 'Back to Preview',
    'help': 'Back to Help'
  };

  const INVALID_PREV_PAGES = new Set(['settings', 'authors', 'author', 'welcome', 'configs', 'moreconfigs', 'import', 'new', 'moresettings']);

  function isValidPreviousPage(pageInfo) {
    if (!pageInfo || typeof pageInfo !== 'object') return false;
    const type = (pageInfo.type || '').toLowerCase();
    const hash = (pageInfo.targetHash || '').toLowerCase();
    if (!hash || typeof hash !== 'string') return false;
    if (INVALID_PREV_PAGES.has(type)) return false;
    if (type.startsWith('settings')) return false;
    if (hash === '#settings' || hash.startsWith('#settings') || hash === '#authors' || hash.startsWith('#authors')) return false;
    return true;
  }

  function setPreviousCedarPage(pageInfo) {
    if (!isValidPreviousPage(pageInfo)) return;
    window.cedarPreviousPage = pageInfo;
    window.outpostPreviousPage = pageInfo;
    try {
      sessionStorage.setItem('cedar_previous_page', JSON.stringify(pageInfo));
      sessionStorage.setItem('outpost_previous_page', JSON.stringify(pageInfo));
    } catch (e) {}
  }
  const setPreviousOutpostPage = setPreviousCedarPage;

  function getPreviousCedarPage() {
    if (isValidPreviousPage(window.cedarPreviousPage)) {
      return window.cedarPreviousPage;
    }
    if (isValidPreviousPage(window.outpostPreviousPage)) {
      return window.outpostPreviousPage;
    }
    try {
      const stored = sessionStorage.getItem('cedar_previous_page') || sessionStorage.getItem('outpost_previous_page');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidPreviousPage(parsed)) {
          window.cedarPreviousPage = parsed;
          window.outpostPreviousPage = parsed;
          return parsed;
        } else {
          sessionStorage.removeItem('cedar_previous_page');
          sessionStorage.removeItem('outpost_previous_page');
        }
      }
    } catch (e) {}
    if (window.previousDashboardTab && isValidPreviousPage({ type: window.previousDashboardTab, targetHash: '#' + window.previousDashboardTab })) {
      const pTab = window.previousDashboardTab;
      return {
        type: pTab,
        label: PAGE_TYPE_LABELS[pTab] || ('Back to ' + pTab.charAt(0).toUpperCase() + pTab.slice(1)),
        targetHash: '#' + pTab
      };
    }
    return {
      type: 'home',
      label: 'Back to Home',
      targetHash: '#home'
    };
  }

  function exitSettingsView() {
    window._suppressSettingsReopen = true;
    setTimeout(() => { window._suppressSettingsReopen = false; }, 400);

    document.body.classList.remove('settings-view-active');
    const prev = (typeof getPreviousCedarPage === 'function') ? getPreviousCedarPage() : null;
    let target = (prev && isValidPreviousPage(prev)) ? prev.targetHash : '#home';
    if (!target || !isValidPreviousPage({ type: target.replace(/^#/, ''), targetHash: target })) {
      target = '#home';
    }
    navigateTo(target);

    // Guaranteed DOM reset: ensures sidebar and topbar are immediately visible and settings hidden
    document.body.classList.remove('settings-view-active');
    const paneSettings = document.getElementById('pane-settings');
    if (paneSettings) {
      paneSettings.style.display = 'none';
      paneSettings.classList.remove('active');
    }
    const cleanTarget = target.replace(/^#/, '').split('?')[0];
    const paneName = ['drafts', 'published', 'hidden'].includes(cleanTarget) ? 'posts' : (cleanTarget === 'design' ? 'designer' : cleanTarget);
    const targetPane = document.getElementById('pane-' + paneName) || document.getElementById('pane-home');
    if (targetPane) {
      targetPane.style.display = 'flex';
      targetPane.classList.add('active');
    }
  }
  window.exitSettingsView = exitSettingsView;

  function updateSettingsBackButton() {
    const btn = document.getElementById('btn-settings-back');
    const labelEl = document.getElementById('settings-toc-back-label');
    if (!btn && !labelEl) return;
    const prev = getPreviousCedarPage();
    let displayLabel = 'Back to Home';
    let targetHash = '#home';

    if (prev && isValidPreviousPage(prev)) {
      targetHash = prev.targetHash;
      displayLabel = prev.label || ('Back to ' + prev.type.charAt(0).toUpperCase() + prev.type.slice(1));
    }

    if (labelEl) {
      labelEl.textContent = displayLabel;
    }
    if (btn) {
      btn.setAttribute('title', displayLabel);
      btn.setAttribute('aria-label', displayLabel);
      btn.setAttribute('data-target-hash', targetHash);
      btn.setAttribute('href', targetHash);
      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        exitSettingsView();
      };
    }
  }

  function exitExportView() {
    const prev = (typeof getPreviousCedarPage === 'function') ? getPreviousCedarPage() : null;
    let target = (prev && isValidPreviousPage(prev) && prev.targetHash !== '#export' && prev.targetHash !== '#publish') ? prev.targetHash : '#home';
    if (!target || target === '#export' || target === '#publish') {
      target = '#home';
    }
    navigateTo(target);

    const paneExport = document.getElementById('pane-export');
    if (paneExport) {
      paneExport.style.display = 'none';
      paneExport.classList.remove('active');
    }
    const cleanTarget = target.replace(/^#/, '').split('?')[0];
    const paneName = ['drafts', 'published', 'hidden'].includes(cleanTarget) ? 'posts' : (cleanTarget === 'design' ? 'designer' : cleanTarget);
    const targetPane = document.getElementById('pane-' + paneName) || document.getElementById('pane-home');
    if (targetPane) {
      targetPane.style.display = 'flex';
      targetPane.classList.add('active');
    }
  }
  window.exitExportView = exitExportView;

  function updateExportBackButton() {
    const btn = document.getElementById('btn-export-back');
    const labelEl = document.getElementById('export-toc-back-label');
    if (!btn && !labelEl) return;
    const prev = getPreviousCedarPage();
    let displayLabel = 'Back to Home';
    let targetHash = '#home';

    if (prev && isValidPreviousPage(prev) && prev.targetHash !== '#export' && prev.targetHash !== '#publish') {
      targetHash = prev.targetHash;
      displayLabel = prev.label || ('Back to ' + prev.type.charAt(0).toUpperCase() + prev.type.slice(1));
    }

    if (labelEl) {
      labelEl.textContent = displayLabel;
    }
    if (btn) {
      btn.setAttribute('title', displayLabel);
      btn.setAttribute('aria-label', displayLabel);
      btn.setAttribute('data-target-hash', targetHash);
      btn.setAttribute('href', targetHash);
      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        exitExportView();
      };
    }
  }
  window.updateExportBackButton = updateExportBackButton;

  // Global delegated click listener for settings and export exit controls (capture phase guarantees execution)
  document.addEventListener('click', function(e) {
    const exitBtn = e.target && e.target.closest && e.target.closest('#btn-settings-back, [data-exit-settings], .btn-settings-close-floating, #btn-settings-close-floating, #btn-export-back, [data-exit-export]');
    if (exitBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (exitBtn.id === 'btn-export-back' || exitBtn.hasAttribute('data-exit-export') || exitBtn.closest('#pane-export')) {
        exitExportView();
      } else {
        exitSettingsView();
      }
    }
  }, true);

  // Global delegated click listener for all dashboard tabs, sidebar items, and shell navigation
  document.addEventListener('click', function(e) {
    if (!e.target || !e.target.closest) return;

    // 1. Dashboard Tab button (expanded and mini items)
    const tabBtn = e.target.closest('[data-dash-tab]');
    if (tabBtn) {
      const tab = tabBtn.dataset.dashTab;
      if (tab) {
        if (e.preventDefault) e.preventDefault();
        if (tab === 'settings' && window._suppressSettingsReopen) return;
        navigateTo(tab);
        return;
      }
    }

    // 2. Posts Sub navigation item in sidebar
    const subBtn = e.target.closest('[data-posts-sub]');
    if (subBtn) {
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      const sub = subBtn.dataset.postsSub;
      if (sub === 'all') {
        navigateTo('posts');
      } else {
        navigateTo(sub);
      }
      return;
    }

    // 2b. Pages Sub navigation item in sidebar
    const pagesSubBtn = e.target.closest('[data-pages-sub]');
    if (pagesSubBtn) {
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      const sub = pagesSubBtn.dataset.pagesSub;
      if (sub === 'all') {
        navigateTo('pages');
      } else {
        navigateTo(sub.startsWith('pages/') ? sub : ('pages/' + sub));
      }
      return;
    }

    // 3. Posts Sub Link (Show More buttons and Back to All Posts)
    const subLink = e.target.closest('[data-posts-sub-link]');
    if (subLink) {
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      const sub = subLink.dataset.postsSubLink;
      if (sub === 'all') {
        navigateTo('posts');
      } else {
        navigateTo(sub);
      }
      return;
    }

    // 3b. Pages Sub Link (Show More buttons and Back to All Pages)
    const pagesSubLink = e.target.closest('[data-pages-sub-link]');
    if (pagesSubLink) {
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      const sub = pagesSubLink.dataset.pagesSubLink;
      if (sub === 'all') {
        navigateTo('pages');
      } else {
        navigateTo(sub.startsWith('pages/') ? sub : ('pages/' + sub));
      }
      return;
    }

    // 4. Brand logo click navigates to home
    const brandBtn = e.target.closest('#brand-logo-btn');
    if (brandBtn) {
      if (e.preventDefault) e.preventDefault();
      navigateTo('home');
      return;
    }

    // 5. Topbar Settings button
    const topSettingsBtn = e.target.closest('#btn-topbar-settings');
    if (topSettingsBtn) {
      e.preventDefault();
      if (!window._suppressSettingsReopen) {
        navigateTo('settings');
      }
      return;
    }

    // 6. Return to Dashboard Button in Editor Topbar
    const btnBackToDash = e.target.closest('#btn-back-to-dashboard');
    if (btnBackToDash) {
      e.preventDefault();
      const cur = window.currentDraft || currentDraft;
      if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
      if (cur && typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(cur)) {
        if (typeof window.discardBlankDraft === 'function') {
          window.discardBlankDraft(cur);
        }
      } else {
        if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
      }
      const target = btnBackToDash.getAttribute('href') || (window.cedarPreviousDashboardPage && window.cedarPreviousDashboardPage.targetHash) || (window.currentDashboardTab || 'posts');
      navigateTo(target);
      return;
    }

    // 7. Return to Pages Button in Links Topbar
    const btnBackLinks = e.target.closest('#btn-links-back');
    if (btnBackLinks) {
      e.preventDefault();
      const prev = window.cedarPreviousDashboardPage;
      const target = (prev && isValidPreviousPage(prev) && prev.type !== 'editor' && prev.type !== 'write')
        ? prev.targetHash
        : '#pages';
      navigateTo(target);
      return;
    }

    // 8. Toggle Visibility in Links Topbar
    const btnToggleLinks = e.target.closest('#btn-links-toggle-visibility');
    if (btnToggleLinks) {
      e.preventDefault();
      toggleLinksPageVisibility();
      return;
    }
  });

  // Escape key handler: pressing Esc while in Settings or Export returns to dashboard
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const openModals = Array.from(document.querySelectorAll('.modal-overlay')).filter(m => m.style.display !== 'none' && m.id !== 'modal-ftue');
      if (openModals.length === 0) {
        if (document.body.classList.contains('settings-view-active')) {
          e.preventDefault();
          exitSettingsView();
        } else if ((window.currentDashboardTab === 'export' || window.currentDashboardTab === 'publish')) {
          e.preventDefault();
          exitExportView();
        }
      }
    }
  });

  window.PAGE_TYPE_LABELS = PAGE_TYPE_LABELS;
  window.setPreviousCedarPage = setPreviousCedarPage;
  window.setPreviousOutpostPage = setPreviousCedarPage;
  window.getPreviousCedarPage = getPreviousCedarPage;
  window.getPreviousOutpostPage = getPreviousCedarPage;
  window.updateSettingsBackButton = updateSettingsBackButton;

  function renderViewDOM(viewName) {
    window.currentView = viewName;
    const dashEl = document.getElementById('view-dashboard');
    const editorEl = document.getElementById('view-editor');
    const linksEl = document.getElementById('view-links');

    if (viewName === 'editor') {
      if (currentDashboardTab === 'designer') {
        const D = (window.Cedar && window.Cedar.designer) || (window.Outpost && window.Outpost.designer);
        if (D && typeof D.revertUnsavedChanges === 'function') {
          D.revertUnsavedChanges();
        }
      }
      document.body.classList.remove('designer-studio-active');
      document.body.classList.remove('settings-view-active');
      if (dashEl) dashEl.style.display = 'none';
      if (linksEl) linksEl.style.display = 'none';
      if (editorEl) editorEl.style.display = 'flex';
      setPreviousCedarPage({
        type: 'editor',
        label: 'Back to Editor',
        targetHash: window.location.hash && (window.location.hash.startsWith('#write') || window.location.hash.startsWith('#editor')) ? window.location.hash : '#write'
      });
    } else if (viewName === 'links') {
      if (currentDashboardTab === 'designer') {
        const D = (window.Cedar && window.Cedar.designer) || (window.Outpost && window.Outpost.designer);
        if (D && typeof D.revertUnsavedChanges === 'function') {
          D.revertUnsavedChanges();
        }
      }
      document.body.classList.remove('designer-studio-active');
      document.body.classList.remove('settings-view-active');
      if (dashEl) dashEl.style.display = 'none';
      if (editorEl) editorEl.style.display = 'none';
      if (linksEl) linksEl.style.display = 'flex';
      if (typeof updateLinksViewUI === 'function') {
        updateLinksViewUI();
      }
      setPreviousCedarPage({
        type: 'links',
        label: 'Back to Links',
        targetHash: '#links'
      });
    } else {
      if (editorEl) editorEl.style.display = 'none';
      if (linksEl) linksEl.style.display = 'none';
      if (dashEl) dashEl.style.display = 'flex';
      if (typeof window.clearEditorCanvasDOM === 'function') {
        window.clearEditorCanvasDOM();
      }
    }
  }

  function renderDashboardTabDOM(tabName, route) {
    if (currentDashboardTab === 'designer' && tabName !== 'designer') {
      const D = (window.Cedar && window.Cedar.designer) || (window.Outpost && window.Outpost.designer);
      if (D && typeof D.revertUnsavedChanges === 'function') {
        D.revertUnsavedChanges();
      }
    }
    if (tabName !== 'designer' && tabName !== 'settings' && tabName !== 'export' && tabName !== 'publish' && currentDashboardTab && currentDashboardTab !== 'designer' && currentDashboardTab !== 'settings' && currentDashboardTab !== 'export' && currentDashboardTab !== 'publish') {
      window.previousDashboardTab = currentDashboardTab;
    }
    currentDashboardTab = tabName;
    window.currentDashboardTab = currentDashboardTab;

    // Record previous non-settings & non-export page type and target hash
    if (tabName !== 'settings' && tabName !== 'export' && tabName !== 'publish') {
      let pageType = tabName;
      let targetHash = '#' + tabName;
      if (tabName === 'posts' && route && route.sub && ['drafts', 'published', 'hidden'].includes(route.sub.toLowerCase())) {
        pageType = route.sub.toLowerCase();
        targetHash = '#' + pageType;
      } else if (tabName === 'designer') {
        pageType = 'design';
        targetHash = '#design';
      }
      let label = PAGE_TYPE_LABELS[pageType] || PAGE_TYPE_LABELS[tabName] || ('Back to ' + pageType.charAt(0).toUpperCase() + pageType.slice(1));

      const dashPageInfo = {
        type: pageType,
        label: label,
        targetHash: targetHash
      };
      window.cedarPreviousDashboardPage = dashPageInfo;
      setPreviousCedarPage(dashPageInfo);
    } else if (tabName === 'settings') {
      updateSettingsBackButton();
    } else if (tabName === 'export' || tabName === 'publish') {
      updateExportBackButton();
      if (window.Cedar && window.Cedar.vaultSync && typeof window.Cedar.vaultSync.updateSyncStatusUI === 'function') {
        window.Cedar.vaultSync.updateSyncStatusUI();
      }
      if (typeof window.initExportWebLinks === 'function') {
        window.initExportWebLinks();
      }
      if (typeof window.initGitHubSyncUI === 'function') {
        window.initGitHubSyncUI();
      } else if (window.Cedar && window.Cedar.githubSync && typeof window.Cedar.githubSync.initSyncUI === 'function') {
        window.Cedar.githubSync.initSyncUI();
      }
    }

    document.body.classList.remove('designer-studio-active');
    document.body.classList.remove('settings-view-active');
    if (tabName !== 'settings') {
      const paneSettings = document.getElementById('pane-settings');
      if (paneSettings) {
        paneSettings.style.display = 'none';
        paneSettings.classList.remove('active');
      }
    }
    const activeSub = (route && route.sub) ? route.sub.toLowerCase() : 'all';
    window.currentPostsSubTab = (tabName === 'posts') ? activeSub : 'all';
    window.currentPagesSubTab = (tabName === 'pages') ? activeSub : 'all';

    // Toggle posts sub-navigation in sidebar
    const postsSubWrap = document.getElementById('sidebar-posts-sub-wrap');
    if (postsSubWrap) {
      if (tabName === 'posts') {
        postsSubWrap.style.display = 'flex';
        postsSubWrap.querySelectorAll('[data-posts-sub]').forEach(subItem => {
          subItem.classList.toggle('active', subItem.dataset.postsSub === activeSub);
        });
      } else {
        postsSubWrap.style.display = 'none';
        postsSubWrap.querySelectorAll('[data-posts-sub]').forEach(subItem => {
          subItem.classList.remove('active');
        });
      }
    }

    // Toggle pages sub-navigation in sidebar
    const pagesSubWrap = document.getElementById('sidebar-pages-sub-wrap');
    if (pagesSubWrap) {
      if (tabName === 'pages') {
        pagesSubWrap.style.display = 'flex';
        pagesSubWrap.querySelectorAll('[data-pages-sub]').forEach(subItem => {
          subItem.classList.toggle('active', subItem.dataset.pagesSub === activeSub);
        });
      } else {
        pagesSubWrap.style.display = 'none';
        pagesSubWrap.querySelectorAll('[data-pages-sub]').forEach(subItem => {
          subItem.classList.remove('active');
        });
      }
    }

    // Toggle active state on top-level tabs
    document.querySelectorAll('[data-dash-tab]').forEach(btn => {
      const bTab = btn.dataset.dashTab;
      const isTabMatch = (bTab === tabName) || (tabName === 'publish' && bTab === 'export') || (tabName === 'export' && bTab === 'publish');
      if (isTabMatch) {
        if (tabName === 'posts' || tabName === 'pages') {
          const isMini = btn.classList.contains('mini-item');
          btn.classList.toggle('active', isMini || activeSub === 'all');
          btn.classList.toggle('parent-active', !isMini && activeSub !== 'all');
        } else {
          btn.classList.add('active');
          btn.classList.remove('parent-active');
        }
      } else {
        btn.classList.remove('active');
        btn.classList.remove('parent-active');
      }
    });
    document.querySelectorAll('.dash-pane').forEach(pane => {
      pane.style.display = 'none';
      pane.classList.remove('active');
    });

    const activePane = document.getElementById(`pane-${tabName}`) || ((tabName === 'publish' || tabName === 'export') ? document.getElementById('pane-export') : null);
    if (activePane) {
      activePane.style.display = 'flex';
      activePane.classList.add('active');
    }
    if (typeof window.updateTopbarSaveButtonVisibility === 'function') {
      window.updateTopbarSaveButtonVisibility();
    }

    const mainContent = document.querySelector('.dash-main-content');
    if (mainContent && !(route && route.sub && (route.sub.startsWith('settings-sec-') || route.sub.startsWith('design-sec-') || route.sub.startsWith('export-sec-')))) {
      mainContent.scrollTop = 0;
    }

    if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {
      const designName = window.projectConfig && window.projectConfig.design && (window.projectConfig.design.blogTheme || window.projectConfig.design.activeTheme);
      const designTheme = ((designName === 'custom' || String(designName).startsWith('custom_')) && window.projectConfig?.design?.customColors)
        ? window.projectConfig.design.customColors
        : designName;
      const curTheme = designTheme || (typeof localStorage !== 'undefined' && (localStorage.getItem('cedar_theme') || localStorage.getItem('cedar_editor_theme') || localStorage.getItem('outpost_theme'))) || 'mulberry_plum';
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(curTheme, false);
    }

    if (tabName === 'home') {
      if (typeof window.renderHomeActivityStream === 'function') {
        window.renderHomeActivityStream();
      }
    }

    if (tabName === 'authors') {
      navigateTo('home', true);
      return;
    }

    if (tabName === 'categories') {
      if (typeof window.renderTaxonomy === 'function') {
        window.renderTaxonomy();
      }
      if (typeof window.renderProjectSettings === 'function') {
        window.renderProjectSettings();
      }
    }

    if (tabName === 'settings') {
      updateSettingsBackButton();
      if (typeof window.renderProjectSettings === 'function') {
        window.renderProjectSettings();
      }
      if (typeof window.initSettingsScrollSpy === 'function') {
        window.initSettingsScrollSpy();
      }
      if (typeof window.updateSettingsActiveSection === 'function') {
        setTimeout(window.updateSettingsActiveSection, 50);
      }
      if (route && route.sub && route.sub.startsWith('settings-sec-')) {
        setTimeout(() => {
          const targetEl = document.getElementById(route.sub);
          const container = document.querySelector('.dash-main-content');
          if (targetEl && container) {
            const cRect = container.getBoundingClientRect();
            const tRect = targetEl.getBoundingClientRect();
            container.scrollTo({ top: tRect.top - cRect.top + container.scrollTop - 20, behavior: 'smooth' });
          }
        }, 60);
      }
    }

    if (tabName === 'designer') {
      if (typeof window.saveDraftsToStorage === 'function') {
        window.saveDraftsToStorage();
      }
      if (typeof window.syncLiveWorkspaceData === 'function') {
        window.syncLiveWorkspaceData();
      }
      if (typeof window.renderDesigner === 'function') {
        window.renderDesigner();
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        window.updateAllPreviewFrames();
      }
    }

    if (tabName === 'help') {
      if (typeof window.initHelpScrollSpy === 'function') {
        window.initHelpScrollSpy();
      }
      if (route && route.sub && route.sub.startsWith('help-sec-')) {
        setTimeout(() => {
          const targetEl = document.getElementById(route.sub);
          const container = document.querySelector('.dash-main-content');
          if (targetEl && container) {
            const cRect = container.getBoundingClientRect();
            const tRect = targetEl.getBoundingClientRect();
            container.scrollTo({ top: tRect.top - cRect.top + container.scrollTop - 20, behavior: 'smooth' });
          }
        }, 60);
      }
    }

    if (tabName === 'preview') {
      const frame = document.getElementById('preview-site-frame');
      if (frame) {
        let targetSub = (route && route.previewRoute) || window._currentPreviewIframeHash || '#/';
        if (!targetSub.startsWith('#')) targetSub = '#' + (targetSub.startsWith('/') ? targetSub : '/' + targetSub);
        frame.src = 'preview.html?t=' + Date.now() + targetSub;
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        setTimeout(window.updateAllPreviewFrames, 100);
      }
    }

    renderDashboard();
  }

  function switchView(viewName) {
    const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
    if (viewName === 'editor') {
      if (currentDraft) {
        openPostInEditor(currentDraft);
      } else if (draftsList.length > 0) {
        openPostInEditor(draftsList[0]);
      } else {
        handleNewPost();
      }
    } else {
      navigateTo(currentDashboardTab || 'home');
    }
  }

  function switchDashboardTab(tabName) {
    navigateTo(tabName);
  }

  function findDraftBySlugOrId(slugOrId, hintType = null) {
    if (!slugOrId) return null;
    if (window.CedarStore && typeof window.CedarStore.get === 'function') {
      const match = (hintType === 'post')
        ? window.CedarStore.getPost(slugOrId)
        : ((hintType === 'page') ? window.CedarStore.getPage(slugOrId) : window.CedarStore.get(slugOrId));
      if (match) return match;
    }
    const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
    if (draftsList.length === 0) return null;

    const raw = String(slugOrId).trim();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw).trim();
    } catch (e) {}

    const rawLower = raw.toLowerCase();
    const decodedLower = decoded.toLowerCase();

    const isPage = (d) => Boolean(d && (d.type === 'page' || d.isCategoryAggregate || (d.id && String(d.id).startsWith('page_'))));

    // 1. Exact ID match
    let found = draftsList.find(d => d && (d.id === raw || d.id === decoded));
    if (found) return found;
    found = draftsList.find(d => d && d.id && (d.id.toLowerCase() === rawLower || d.id.toLowerCase() === decodedLower));
    if (found) return found;

    // 2. Slug match with type hinting
    const searchSlugs = (list) => {
      // Exact slug match
      let match = list.find(d => d && d.slug && (d.slug === raw || d.slug === decoded));
      if (match) return match;
      // Case-insensitive slug match
      match = list.find(d => d && d.slug && (d.slug.toLowerCase() === rawLower || d.slug.toLowerCase() === decodedLower));
      if (match) return match;
      // Partial / sanitized slug match
      const cleanTarget = decodedLower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (cleanTarget) {
        match = list.find(d => {
          if (!d || !d.slug) return false;
          const cleanSlug = String(d.slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          return cleanSlug === cleanTarget;
        });
        if (match) return match;
      }
      // Title match fallback
      match = list.find(d => d && d.title && d.title.trim().toLowerCase() === decodedLower);
      if (match) return match;
      return null;
    };

    if (hintType === 'page') {
      const pageList = draftsList.filter(isPage);
      found = searchSlugs(pageList);
      if (found) return found;
      const nonPageList = draftsList.filter(d => !isPage(d));
      found = searchSlugs(nonPageList);
      if (found) return found;
    } else if (hintType === 'post') {
      const postList = draftsList.filter(d => !isPage(d));
      found = searchSlugs(postList);
      if (found) return found;
      const pageList = draftsList.filter(isPage);
      found = searchSlugs(pageList);
      if (found) return found;
    } else {
      found = searchSlugs(draftsList);
      if (found) return found;
    }

    // 3. Fallback: check currentDraft or active draft from localStorage
    if (window.currentDraft) {
      const cd = window.currentDraft;
      if (cd.id === raw || cd.id === decoded || (cd.slug && (cd.slug.toLowerCase() === rawLower || cd.slug.toLowerCase() === decodedLower))) {
        return cd;
      }
    }
    const activeId = localStorage.getItem('sheesh_static_writer_active_id_v2') || localStorage.getItem('sheesh_static_writer_active_id');
    if (activeId && (activeId === raw || activeId === decoded)) {
      found = draftsList.find(d => d && d.id === activeId);
      if (found) return found;
    }

    return null;
  }

  function openPostInEditor(itemOrId) {
    if (itemOrId === 'page_links' || itemOrId === 'links') {
      window.location.hash = '#links';
      return;
    }
    const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
    let draft = null;
    const isPageItem = (d) => Boolean(d && (d.type === 'page' || d.isCategoryAggregate || (d.id && String(d.id).startsWith('page_'))));

    if (typeof itemOrId === 'object' && itemOrId !== null) {
      draft = itemOrId;
    } else if (typeof itemOrId === 'string') {
      const cameFromPages = window.cedarPreviousDashboardPage && window.cedarPreviousDashboardPage.type === 'pages';
      draft = findDraftBySlugOrId(itemOrId, cameFromPages ? 'page' : null);
    }

    if (draft && (draft.id === 'page_links' || draft.slug === 'links' || (draft.title || '').trim().toLowerCase() === 'links')) {
      window.location.hash = '#links';
      return;
    }

    const isCat = isCategoryAggregateItem(draft || itemOrId);
    const isAll = isAllPageItem(draft || itemOrId);
    if (isCat || isAll) {
      navigateTo(isCat ? 'pages/categories' : 'pages/builtin');
      return;
    }

    if (!draft) {
      const cameFromPages = window.cedarPreviousDashboardPage && window.cedarPreviousDashboardPage.type === 'pages';
      const prefix = cameFromPages ? 'write/page/' : 'write/';
      if (typeof itemOrId === 'string') {
        navigateTo(`${prefix}${encodeURIComponent(itemOrId)}`);
      } else {
        navigateTo('home');
      }
      return;
    }

    if (isPageItem(draft)) {
      draft.type = 'page';
    }

    const hasSlug = draft.slug && draft.slug !== 'untitled-post' && draft.slug !== 'untitled-page';
    const slugOrId = hasSlug ? draft.slug : draft.id;
    if (isPageItem(draft)) {
      navigateTo(`write/page/${encodeURIComponent(slugOrId)}`);
    } else {
      navigateTo(`write/${encodeURIComponent(slugOrId)}`);
    }
  }

  function updateEditorUrlSlug(newSlug) {
    const curDraft = window.currentDraft || (typeof currentDraft !== 'undefined' ? currentDraft : null);
    if (window.currentView !== 'editor' || !curDraft) return;
    const currentRoute = parseRoute(window.location.hash);
    if (currentRoute.view !== 'editor') return;

    const hasSlug = newSlug && newSlug !== 'untitled-post' && newSlug !== 'untitled-page';
    const slugOrId = hasSlug ? newSlug : currentDraft.id;
    const q = currentRoute.modal ? `?modal=${encodeURIComponent(currentRoute.modal)}` : '';
    const isPage = currentDraft.type === 'page' || currentDraft.isCategoryAggregate || (currentDraft.id && String(currentDraft.id).startsWith('page_'));
    const prefix = isPage ? '#write/page/' : '#write/';

    const targetHash = `${prefix}${encodeURIComponent(slugOrId)}${q}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }

  let _lastHandledRouteKey = '';
  let _lastHandledRouteTime = 0;

  function handleRoute() {
    const rawHash = window.location.hash || '';
    const rawPathname = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
    const routeKey = rawPathname + rawHash;
    const now = Date.now();
    if (routeKey === _lastHandledRouteKey && (now - _lastHandledRouteTime < 40)) {
      return;
    }
    _lastHandledRouteKey = routeKey;
    _lastHandledRouteTime = now;

    // Close lightbox, delete confirm modal, and mobile sidebar if open whenever route changes
    if (typeof window.closeMediaLightbox === 'function') {
      window.closeMediaLightbox(false);
    }
    if (typeof window.closeMobileSidebar === 'function') {
      window.closeMobileSidebar();
    }
    const modalDelConfirm = document.getElementById('modal-image-delete-confirm');
    if (modalDelConfirm && modalDelConfirm.style.display !== 'none') {
      modalDelConfirm.style.display = 'none';
      window._pendingDeleteFilename = null;
    }

    let cleanHash = rawHash.trim();
    if (cleanHash.startsWith('#/')) cleanHash = cleanHash.slice(2);
    else if (cleanHash.startsWith('#')) cleanHash = cleanHash.slice(1);
    cleanHash = cleanHash.split('?')[0];

    const FTUE_ROUTES = ['welcome', 'configs', 'moreconfigs', 'import', 'new', 'moresettings', 'unsupported'];
    const modalFtue = document.getElementById('modal-ftue');
    const isFtueOpen = modalFtue && modalFtue.style.display !== 'none';

    if (FTUE_ROUTES.includes(cleanHash) || (isFtueOpen && cleanHash === '')) {
      if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).handleHashRoute === 'function') {
        (window.CedarFTUE || window.OutpostFTUE).handleHashRoute(cleanHash || 'welcome');
      }
      return;
    }

    const route = parseRoute(window.location.hash);

    // If leaving editor view, persist work first (or discard if actually blank page)
    if (window.currentView === 'editor' && route.view !== 'editor') {
      const cur = window.currentDraft || currentDraft;
      if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
      if (cur && typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(cur)) {
        if (typeof window.discardBlankDraft === 'function') {
          window.discardBlankDraft(cur);
        }
      } else {
        saveDraftsToStorage();
      }
      if (typeof window.clearEditorCanvasDOM === 'function') {
        window.clearEditorCanvasDOM();
      }
    }

    if (route.view === 'editor') {
      const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
      let targetDraft = null;
      const isDraftPageItem = (d) => Boolean(d && (d.type === 'page' || d.isCategoryAggregate || (d.id && String(d.id).startsWith('page_'))));

      const lookupSlugOrId = route.postSlug || route.pageSlug || route.draftId;
      if (lookupSlugOrId) {
        let hint = null;
        if (route.pageSlug && !route.postSlug) hint = 'page';
        else if (route.postSlug && !route.pageSlug) hint = 'post';
        targetDraft = findDraftBySlugOrId(lookupSlugOrId, hint);
      }

      if (!targetDraft && (route.postSlug || route.pageSlug || route.draftId)) {
        const activeId = localStorage.getItem('sheesh_static_writer_active_id_v2') || localStorage.getItem('sheesh_static_writer_active_id');
        targetDraft = (activeId ? draftsList.find(d => d.id === activeId) : null) || draftsList[0] || null;
        if (!targetDraft) {
          showToast('Requested post was not found, returning to pipeline');
          navigateTo('home', true);
          return;
        }
      }

      if (!targetDraft) {
        if (window.currentDraft) {
          targetDraft = window.currentDraft;
        } else if (currentDraft) {
          targetDraft = currentDraft;
        } else if (draftsList.length > 0) {
          targetDraft = draftsList[0];
        } else {
          handleNewPost();
          return;
        }
      }

      if (isCategoryAggregateItem(targetDraft) || isAllPageItem(targetDraft) || (targetDraft && (targetDraft.id === 'page_about_cedar' || targetDraft.slug === 'about-cedar'))) {
        const isCat = isCategoryAggregateItem(targetDraft);
        navigateTo(isCat ? 'pages/categories' : 'pages/builtin', true);
        return;
      }

      if (isDraftPageItem(targetDraft)) {
        targetDraft.type = 'page';
      }

      const cur = window.currentDraft || (typeof currentDraft !== 'undefined' ? currentDraft : null);
      if (window.currentView === 'editor' && cur && cur.id !== targetDraft.id) {
        if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
        if (typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(cur)) {
          if (typeof window.discardBlankDraft === 'function') {
            window.discardBlankDraft(cur);
          }
        } else {
          saveDraftsToStorage();
        }
      }

      window.currentDraft = targetDraft;
      currentDraft = targetDraft;
      saveDraftsToStorage();

      // Canonicalize address bar if legacy format was used or slug available
      const canonicalHash = buildCanonicalUrl(route, currentDraft);
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(null, '', canonicalHash);
      }

      renderViewDOM('editor');
      syncDraftToForm();
      updateEditorHeader();

      // Update back button href & title in editor topbar
      const btnBackToDash = document.getElementById('btn-back-to-dashboard');
      if (btnBackToDash) {
        const prev = window.cedarPreviousDashboardPage;
        const isPage = isDraftPageItem(currentDraft);
        let bHash = isPage ? '#pages' : '#posts';
        let bLabel = isPage ? 'Pages' : 'Posts';
        if (prev && isValidPreviousPage(prev) && prev.type !== 'editor' && prev.type !== 'write') {
          bHash = prev.targetHash;
          bLabel = prev.type === 'posts' ? 'Posts' : (prev.type.charAt(0).toUpperCase() + prev.type.slice(1));
        }
        btnBackToDash.setAttribute('href', bHash);
        const spanLabel = btnBackToDash.querySelector('span');
        if (spanLabel) spanLabel.textContent = bLabel;
      }
    } else if (route.view === 'links') {
      if (window.location.hash !== '#links') {
        try {
          window.history.replaceState(null, '', '#links');
        } catch (e) {}
      }
      renderViewDOM('links');
      if (typeof window.syncLinksPageDraft === 'function') {
        window.currentDraft = window.syncLinksPageDraft(window.projectConfig);
      }
      updateLinksViewUI();
      if (typeof window.renderLinksStudio === 'function') {
        try { window.renderLinksStudio(); } catch (e) {}
      } else if (window.Cedar && window.Cedar.links && typeof window.Cedar.links.render === 'function') {
        try { window.Cedar.links.render(); } catch (e) {}
      }
    } else {
      // Dashboard view
      currentDashboardTab = route.tab;
      window.currentDashboardTab = currentDashboardTab;

      // Canonicalize address bar if legacy format was used or hash is missing
      const canonicalUrl = buildCanonicalUrl(route, null);
      if (route.tab === 'help' && canonicalUrl.startsWith('/')) {
        const curPath = (window.location && window.location.pathname) || '';
        if (curPath !== canonicalUrl) {
          try {
            window.history.replaceState(null, '', canonicalUrl + (window.location.hash || ''));
          } catch (e) {}
        }
      } else {
        const curPath = (window.location && window.location.pathname) || '';
        if (/\/help\/?$/i.test(curPath) && window.location.protocol !== 'file:') {
          const rootBase = curPath.replace(/\/help\/?$/i, '/') || '/';
          try {
            window.history.replaceState(null, '', (rootBase.endsWith('/') ? rootBase : rootBase + '/') + canonicalUrl);
          } catch (e) {}
        } else if (window.location.hash !== canonicalUrl) {
          try {
            window.history.replaceState(null, '', canonicalUrl);
          } catch (e) {}
          if (window.location.hash !== canonicalUrl) {
            window.location.hash = canonicalUrl;
          }
        }
      }

      renderViewDOM('dashboard');
      renderDashboardTabDOM(route.tab, route);

      if (route.tab === 'designer') {
        const sub = route.sub || 'home';
        if (((window.Cedar && window.Cedar.designer) || (window.Outpost && window.Outpost.designer)) && typeof (window.Cedar.designer || window.Outpost.designer).switchSubtab === 'function') {
          (window.Cedar.designer || window.Outpost.designer).switchSubtab(sub);
        } else if (typeof window.switchDesignerSubtab === 'function') {
          window.switchDesignerSubtab(sub);
        }
      }
    }

    if (typeof updateCedarTitle === 'function') {
      updateCedarTitle();
    } else if (typeof updateOutpostTitle === 'function') {
      if (typeof updateCedarTitle === 'function') updateCedarTitle(); else if (typeof updateOutpostTitle === 'function') updateOutpostTitle();
    }

    // Modal state sync
    const targetModalId = route.modal ? ROUTE_TO_MODAL[route.modal] : null;
    Object.values(ROUTE_TO_MODAL).forEach(modalId => {
      if (modalId !== targetModalId) {
        const m = document.getElementById(modalId);
        if (m) m.style.display = 'none';
      }
    });

    if (targetModalId) {
      const modalEl = document.getElementById(targetModalId);
      if (modalEl) {
        if (targetModalId === 'modal-export') {
          prepareExportModal();
        } else if (targetModalId === 'modal-images') {
          renderImageManagerList();
        } else if (targetModalId === 'modal-drafts') {
          renderDraftsList();
        } else if (targetModalId === 'modal-import') {
          populateVaultImportItems();
        } else if (targetModalId === 'modal-settings') {
          renderProjectSettings();
        }
        modalEl.style.display = 'flex';
      }
    }
  }

  function toggleLinksPageVisibility() {
    let linksDraft = (typeof window.syncLinksPageDraft === 'function')
      ? window.syncLinksPageDraft(window.projectConfig)
      : (window.drafts || []).find(d => d.type === 'page' && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links'));
    if (!linksDraft) {
      if (typeof window.createDefaultLinksPage === 'function') {
        linksDraft = window.createDefaultLinksPage();
        (window.drafts = window.drafts || []).push(linksDraft);
      } else {
        return;
      }
    }
    window.currentDraft = linksDraft;
    const willBeHidden = !linksDraft.hidden;
    linksDraft.hidden = willBeHidden;
    linksDraft.retired = willBeHidden;
    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
      window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
    }
    if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
    if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
    updateLinksViewUI();
    if (typeof window.showToast === 'function') {
      window.showToast(willBeHidden ? 'Page "Links" hidden from public site' : 'Page "Links" is now visible');
    }
  }

  function updateLinksViewUI() {
    const linksDraft = (window.drafts || []).find(d => d.type === 'page' && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links'));
    const isHidden = !linksDraft || Boolean(linksDraft.hidden || linksDraft.retired);
    const badge = document.getElementById('links-status-badge');
    const toggleBtn = document.getElementById('btn-links-toggle-visibility');
    const backBtn = document.getElementById('btn-links-back');

    if (badge) {
      badge.textContent = isHidden ? 'Hidden' : 'Published';
      badge.className = `editor-post-status-badge ${isHidden ? 'status-hidden' : 'status-published'}`;
      badge.removeAttribute('style');
    }

    if (toggleBtn) {
      toggleBtn.textContent = isHidden ? 'Unhide' : 'Hide';
      toggleBtn.title = isHidden ? 'Make Links page visible on public site' : 'Hide Links page from public site';
    }

    if (backBtn) {
      const prev = window.cedarPreviousDashboardPage;
      let bHash = '#pages';
      let bLabel = 'Pages';
      if (prev && isValidPreviousPage(prev) && prev.type !== 'editor' && prev.type !== 'write') {
        bHash = prev.targetHash;
        bLabel = prev.type === 'posts' ? 'Posts' : (prev.type.charAt(0).toUpperCase() + prev.type.slice(1));
      }
      backBtn.setAttribute('href', bHash);
      const spanLabel = backBtn.querySelector('span');
      if (spanLabel) spanLabel.textContent = bLabel;
    }
    if (typeof window.renderLinksStudio === 'function') {
      try { window.renderLinksStudio(); } catch (e) {}
    } else if (window.Cedar && window.Cedar.links && typeof window.Cedar.links.render === 'function') {
      try { window.Cedar.links.render(); } catch (e) {}
    }
  }

  window.ROUTE_TO_MODAL = ROUTE_TO_MODAL;
  window.parseRoute = parseRoute;
  window.buildCanonicalUrl = buildCanonicalUrl;
  window.navigateTo = navigateTo;
  window.setupViewControls = setupViewControls;
  window.renderViewDOM = renderViewDOM;
  window.renderDashboardTabDOM = renderDashboardTabDOM;
  window.switchView = switchView;
  window.switchDashboardTab = switchDashboardTab;
  window.findDraftBySlugOrId = findDraftBySlugOrId;
  window.openPostInEditor = openPostInEditor;
  window.updateEditorUrlSlug = updateEditorUrlSlug;
  window.handleRoute = handleRoute;
  window.toggleLinksPageVisibility = toggleLinksPageVisibility;
  window.updateLinksViewUI = updateLinksViewUI;

  const routerExports = {
    ROUTE_TO_MODAL,
    parseRoute,
    buildCanonicalUrl,
    navigateTo,
    setupViewControls,
    renderViewDOM,
    renderDashboardTabDOM,
    switchView,
    switchDashboardTab,
    openPostInEditor,
    updateEditorUrlSlug,
    handleRoute,
    toggleLinksPageVisibility,
    updateLinksViewUI,
    setPreviousCedarPage,
    setPreviousOutpostPage,
    getPreviousCedarPage,
    getPreviousOutpostPage,
    updateSettingsBackButton
  };
  window.Cedar.router = routerExports;
  window.Outpost.router = routerExports;
  const _routerOldExport = {
    ROUTE_TO_MODAL,
    parseRoute,
    buildCanonicalUrl,
    navigateTo,
    setupViewControls,
    renderViewDOM,
    renderDashboardTabDOM,
    switchView,
    switchDashboardTab,
    openPostInEditor,
    updateEditorUrlSlug,
    handleRoute,
    setPreviousOutpostPage,
    getPreviousOutpostPage,
    updateSettingsBackButton
  };
})();
