/**
 * Cedar Preview — Router, Navigation, URL Sync & App Lifecycle
 */
(function () {
  'use strict';
  window.CedarPreview = window.CedarPreview || window.OutpostPreview || {};
  window.OutpostPreview = window.CedarPreview;

  let lastRenderedFingerprint = '';

  const getConfig = () => window.projectConfig || {};
  const getDrafts = () => window.drafts || [];

  function getSiteTitle() {
    const cfg = getConfig();
    const brand = (cfg.design && cfg.design.branding) || {};
    return brand.siteTitle || cfg.name || cfg.domain || 'Cedar';
  }

  function getSiteTagline() {
    const cfg = getConfig();
    const brand = (cfg.design && cfg.design.branding) || {};
    return (brand.tagline !== undefined && brand.tagline !== null) ? brand.tagline : (cfg.subtitle || '');
  }

  function parseQueryParams(queryString) {
    const params = {};
    if (!queryString) return params;
    const cleanQuery = queryString.startsWith('?') ? queryString.slice(1) : queryString;
    cleanQuery.split('&').forEach(part => {
      if (!part) return;
      const [key, val] = part.split('=');
      params[decodeURIComponent(key)] = val !== undefined ? decodeURIComponent(val) : true;
    });
    return params;
  }

  /**
   * Parse any hash or clean URL into a normalized route object.
   * Handles both #/... and #... styles, query strings, and clean pathnames.
   */
  
    function isLocalPreviewServer() {
      const h = (window.location && window.location.hostname) || '';
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    }
    function isPreviewSubpathMode() {
      if (window.__CEDAR_PRODUCTION__ || window.__CEDAR_STATIC_DATA__) return false;
      const p = (window.location && window.location.pathname) || '';
      return p === '/preview.html' || p.endsWith('/preview.html') || p.includes('/preview.html/');
    }
    function getSiteBasePrefix() {
      if (!isPreviewSubpathMode()) return '';
      const p = (window.location && window.location.pathname) || '';
      const idx = p.indexOf('/preview.html');
      return idx !== -1 ? p.slice(0, idx + '/preview.html'.length) : '/preview.html';
    }
    window.isPreviewSubpathMode = isPreviewSubpathMode;
    window.getSiteBasePrefix = getSiteBasePrefix;

    function toPreviewUrl(canonical) {
      const prefix = getSiteBasePrefix();
      const useHashForStaticPreview = isPreviewSubpathMode() && !isLocalPreviewServer();
      let clean = (canonical || '').trim();
      if (!clean || clean === '#' || clean === '#/' || clean === '/' || clean === '/preview.html' || clean === '/preview.html/' || clean === prefix || clean === prefix + '/') {
        if (useHashForStaticPreview) return prefix + '#/';
        return prefix || '/';
      }
      clean = clean.replace(/^#\/?/, '/');
      if (prefix && clean.startsWith(prefix + '/')) {
        clean = clean.slice(prefix.length);
      } else if (clean.startsWith('/preview.html/')) {
        clean = clean.slice('/preview.html'.length);
      } else if (clean === '/preview.html' || (prefix && clean === prefix)) {
        if (useHashForStaticPreview) return prefix + '#/';
        return prefix || '/';
      }
      if (!clean.startsWith('/')) clean = '/' + clean;
      if (useHashForStaticPreview) {
        return prefix + '#' + clean;
      }
      return prefix ? (prefix + clean) : clean;
    }
    window.toPreviewUrl = toPreviewUrl;

    function buildPostUrl(draft) {
      const prefix = getSiteBasePrefix();
      if (!draft) return prefix || '/';
      if (draft.isRedirect && (draft.redirectUrl || draft.url)) {
        return draft.redirectUrl || draft.url;
      }
      let slug = draft.slug || draft.id;
      if (!slug) return prefix || '/';
      if (draft.type === 'page') {
        return (prefix || '') + '/' + encodeURIComponent(slug);
      } else {
        let cat = draft.permalinkCat !== undefined ? draft.permalinkCat : (draft.tag || (draft.categories && draft.categories[0]) || 'uncategorized');
        if (!cat) cat = 'uncategorized';
        // Replace spaces with dashes and encode
        let catStr = encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-')) + '/';
        return (prefix || '') + '/' + catStr + encodeURIComponent(slug) + '/';
      }
    }
    window.buildPostUrl = buildPostUrl;

    function findCategoryBySlug(slugOrName) {
      if (!slugOrName) return null;
      const cleanTarget = slugOrName.toLowerCase().trim().replace(/\s+/g, '-');
      if (cleanTarget === 'uncategorized') return 'uncategorized';
      const allCats = new Set(['uncategorized']);
      (getConfig().categories || []).forEach(c => {
        const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
        if (val) allCats.add(val);
      });
      (getDrafts() || []).forEach(d => {
        if (!d) return;
        if (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) {
          const cat = String(d.categoryAggregate || d.title || '').trim();
          if (cat) allCats.add(cat);
        }
        if (d.status === 'published' && !d.hidden && !d.retired) {
          if (d.tag) allCats.add(d.tag.trim());
          if (Array.isArray(d.categories)) d.categories.forEach(c => c && allCats.add(String(c).trim()));
        }
      });
      for (const cat of allCats) {
        if (cat.toLowerCase().trim().replace(/\s+/g, '-') === cleanTarget || cat.toLowerCase().trim() === cleanTarget) {
          return cat;
        }
      }
      return null;
    }
    window.findCategoryBySlug = findCategoryBySlug;

    function buildCategoryUrl(category, page = 1) {
      const prefix = getSiteBasePrefix();
      if (!category || category === 'ALL') return (prefix || '') + '/blog';
      const catSlug = encodeURIComponent(category.toLowerCase().trim().replace(/\s+/g, '-'));
      if (page > 1) {
        return `${prefix}/${catSlug}/${page}`;
      }
      return `${prefix}/${catSlug}`;
    }
    window.buildCategoryUrl = buildCategoryUrl;

    function resolveAssetUrl(url) {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) return url;
      if (url.startsWith('/')) return url;
      return '/' + url;
    }
    window.resolveAssetUrl = resolveAssetUrl;

    function parseRoute() {
      let rawHash = window.location.hash || '';
      let pathname = window.location.pathname || '';

      // If no hash, inspect pathname for clean preview or production URLs (e.g. /preview.html/about, /about/, /category/slug/)
      if (!rawHash || rawHash === '#' || rawHash === '#/') {
        const activeBlogPath = (typeof window.resolveProjectBlogPath === 'function') ? window.resolveProjectBlogPath() : '';
        let cleanP = pathname.replace(/\/preview\.html(?:\/|$)/i, '/').replace(/\/index\.html(?:\/|$)/i, '/');
        if (activeBlogPath && activeBlogPath !== 'blog' && cleanP.startsWith('/' + activeBlogPath)) {
          cleanP = cleanP.slice(activeBlogPath.length + 1);
        }
        if (cleanP.startsWith('/preview/')) cleanP = cleanP.slice(8);
        else if (cleanP === '/preview') cleanP = '';
        if (cleanP.startsWith('/')) cleanP = cleanP.slice(1);
        if (cleanP) {
          rawHash = '#' + cleanP;
        }
      }

      let h = (rawHash || '').trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.startsWith('/')) h = h.slice(1);

    // Extract query string
    let queryString = '';
    if (h.includes('?')) {
      const qIdx = h.indexOf('?');
      queryString = h.slice(qIdx + 1);
      h = h.slice(0, qIdx);
    }
    const query = parseQueryParams(queryString);

    // Home routes
    if (!h || h === 'home' || h === '/' || h === 'index.html') {
      return { view: 'home', canonicalHash: '#/' };
    }

    // Backend #write/:slug or #write?post=... or #write?page=... or #write?id=...
    if (h === 'write' || h.startsWith('write/')) {
      const parts = h.split('/');
      const slugOrId = parts[1] || query.post || query.page || query.id;
      if (slugOrId) {
        const found = getDrafts().find(d => d.id === slugOrId || d.slug === slugOrId);
        if (found && (found.isCategoryAggregate || String(found.id || '').startsWith('page_cat_'))) {
          const catName = found.categoryAggregate || found.title || found.slug;
          const catSlug = encodeURIComponent((found.slug || slugOrId).toLowerCase().replace(/\s+/g, '-'));
          return { view: 'posts', page: 1, category: catName, canonicalHash: `#/${catSlug}` };
        }
        const slug = (found && found.slug) ? found.slug : slugOrId;
        const type = (found && found.type === 'page') ? 'page' : 'post';
        return { view: 'reader', type: type, slug: slug, canonicalHash: `#/${encodeURIComponent(slug)}` };
      }
      return { view: 'home', canonicalHash: '#/' };
    }

    const segments = h.split('/').map(s => decodeURIComponent(s).trim()).filter(Boolean);
    const rootToken = (segments[0] || '').toLowerCase();

    // 0. Secret About Cedar Page
    if (rootToken === 'about-cedar') {
      return { view: 'reader', type: 'page', slug: 'about-cedar', canonicalHash: '#/about-cedar' };
    }

    // 1. Primary Blog Route: /blog (archive) or /blog/:slug (reader) or /blog/page/:num
    if (rootToken === 'blog') {
      if (segments.length === 1) {
        let page = 1;
        if (query.page) page = parseInt(query.page, 10) || 1;
        const category = query.category || query.cat || null;
        if (category) {
          const matchedCat = findCategoryBySlug(category) || category;
          const catSlug = encodeURIComponent(matchedCat.toLowerCase().replace(/\s+/g, '-'));
          const canonical = page > 1 ? `#/${catSlug}/${page}` : `#/${catSlug}`;
          return { view: 'posts', page: page, category: matchedCat, canonicalHash: canonical };
        }
        let canonical = page > 1 ? `#/blog?page=${page}` : '#/blog';
        return { view: 'posts', page: page, category: null, canonicalHash: canonical };
      }
      if (segments[1] === 'page' && segments[2]) {
        const page = parseInt(segments[2], 10) || 1;
        return { view: 'posts', page: page, category: query.category || query.cat || null, canonicalHash: page > 1 ? `#/blog?page=${page}` : '#/blog' };
      }
      const slug = segments.slice(1).join('/');
      const draft = getDrafts().find(d => d.slug === slug || d.id === slug);
      const itemType = (draft && draft.type === 'page') ? 'page' : 'post';
      return { view: 'reader', type: itemType, slug: slug, canonicalHash: `#/${encodeURIComponent(slug)}` };
    }

    // 2. All Posts Archive: /posts or /all
    if ((rootToken === 'posts' || rootToken === 'all') && segments.length === 1) {
      let page = 1;
      if (query.page) page = parseInt(query.page, 10) || 1;
      const category = query.category || query.cat || null;
      let canonical = '#/blog';
      const qParts = [];
      if (category) qParts.push(`category=${encodeURIComponent(category)}`);
      if (page > 1) qParts.push(`page=${page}`);
      if (qParts.length > 0) canonical += '?' + qParts.join('&');
      return { view: 'posts', page: page, category: category, canonicalHash: canonical };
    }
    if ((rootToken === 'posts' || rootToken === 'all') && segments[1] === 'page' && segments[2]) {
      const page = parseInt(segments[2], 10) || 1;
      return { view: 'posts', page: page, category: query.category || query.cat || null, canonicalHash: page > 1 ? `#/blog?page=${page}` : '#/blog' };
    }

    // 3. Legacy Single Post Reader: /posts/:slug or /post/:slug
    if ((rootToken === 'posts' || rootToken === 'post') && segments.length >= 2) {
      const slug = segments.slice(1).join('/');
      return { view: 'reader', type: 'post', slug: slug, canonicalHash: `#/${encodeURIComponent(slug)}` };
    }

    // 4. Legacy Static Pages: /pages/:slug or /page/:slug
    if ((rootToken === 'pages' || rootToken === 'page') && segments.length >= 2) {
      const slug = segments.slice(1).join('/');
      if (slug.toLowerCase() === 'posts' || slug.toLowerCase() === 'blog' || slug.toLowerCase() === 'all') {
        return { view: 'posts', page: 1, canonicalHash: '#/blog' };
      }
      const directDraft = getDrafts().find(d => d.slug === slug || d.id === slug);
      if (directDraft && (directDraft.isCategoryAggregate || String(directDraft.id || '').startsWith('page_cat_'))) {
        const catName = directDraft.categoryAggregate || directDraft.title || slug;
        const catSlug = encodeURIComponent((directDraft.slug || slug).toLowerCase().replace(/\s+/g, '-'));
        return { view: 'posts', page: 1, category: catName, canonicalHash: `#/${catSlug}` };
      }
      return { view: 'reader', type: 'page', slug: slug, canonicalHash: `#/${encodeURIComponent(slug)}` };
    }

    // 5. Legacy notes routes redirect to posts
    if (rootToken === 'notes' || rootToken === 'note') {
      return { view: 'posts', page: 1, canonicalHash: '#/blog' };
    }

    // 6. Author Profile: /author/:name or /authors/:name
    if ((rootToken === 'author' || rootToken === 'authors') && segments.length >= 2) {
      let authorName = segments[1];
      let tab = query.tab || 'articles';
      if (segments.length >= 3 && ['articles', 'notes', 'all', 'posts'].includes(segments[2].toLowerCase())) {
        tab = segments[2].toLowerCase() === 'posts' ? 'articles' : segments[2].toLowerCase();
      }
      let canonical = `#/author/${encodeURIComponent(authorName)}`;
      if (tab && tab !== 'articles') canonical += `?tab=${encodeURIComponent(tab)}`;
      return { view: 'author', name: authorName, tab: tab, canonicalHash: canonical };
    }

    function findCategoryPageDraft(catName) {
      if (!catName) return null;
      const targetLower = String(catName).trim().toLowerCase();
      const targetSlug = targetLower.replace(/\s+/g, '-');
      return getDrafts().find(d => {
        if (!d || d.type !== 'page') return false;
        const agg = (d.categoryAggregate || '').trim().toLowerCase();
        const title = (d.title || '').trim().toLowerCase();
        const slug = (d.slug || '').trim().toLowerCase().replace(/^pages\//, '');
        return agg === targetLower || title === targetLower || slug === targetSlug;
      }) || null;
    }

    // 7. Category Archive: /category/:name or /categories/:name (with optional page number)
    if ((rootToken === 'category' || rootToken === 'categories') && segments.length >= 2) {
      const cat = findCategoryBySlug(segments[1]) || segments[1];
      if (typeof window.isCategoryPageHidden === 'function' && window.isCategoryPageHidden(cat)) {
        return { view: 'home', canonicalHash: '#/' };
      }
      const catSlug = encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-'));
      let page = 1;
      if (segments.length >= 3 && /^\d+$/.test(segments[2])) {
        page = parseInt(segments[2], 10) || 1;
      } else if (query.page) {
        page = parseInt(query.page, 10) || 1;
      }
      const canonical = page > 1 ? `#/${catSlug}/${page}` : `#/${catSlug}`;
      return { view: 'posts', page: page, category: cat, canonicalHash: canonical };
    }

    // 8. Direct Category Route: /:category or /:category/:page or /:category/:slug
    const matchedCategory = findCategoryBySlug(segments[0]);
    if (matchedCategory) {
      const catSlug = encodeURIComponent(matchedCategory.toLowerCase().replace(/\s+/g, '-'));
      // Page 1: /category or /category/
      if (segments.length === 1) {
        if (typeof window.isCategoryPageHidden === 'function' && window.isCategoryPageHidden(matchedCategory)) {
          return { view: 'home', canonicalHash: '#/' };
        }
        let page = 1;
        if (query.page) page = parseInt(query.page, 10) || 1;
        const canonical = page > 1 ? `#/${catSlug}/${page}` : `#/${catSlug}`;
        return { view: 'posts', page: page, category: matchedCategory, canonicalHash: canonical };
      }
      // Page N: /category/2 or /category/2/
      if (segments.length === 2 && /^\d+$/.test(segments[1])) {
        if (typeof window.isCategoryPageHidden === 'function' && window.isCategoryPageHidden(matchedCategory)) {
          return { view: 'home', canonicalHash: '#/' };
        }
        const page = parseInt(segments[1], 10) || 1;
        const canonical = page > 1 ? `#/${catSlug}/${page}` : `#/${catSlug}`;
        return { view: 'posts', page: page, category: matchedCategory, canonicalHash: canonical };
      }
      // Single post under category: /category/post-slug/
      if (segments.length >= 2) {
        const targetSlug = segments[segments.length - 1];
        const draft = getDrafts().find(d => d.slug === targetSlug || d.id === targetSlug);
        if (draft) {
          return { view: 'reader', type: draft.type || 'post', slug: draft.slug || draft.id, canonicalHash: buildPostUrl(draft) };
        }
      }
    }

    // Fallback: /:categoryName/:pageNum where category wasn't statically indexed
    if (segments.length === 2 && /^\d+$/.test(segments[1])) {
      const rawCat = segments[0];
      const page = parseInt(segments[1], 10) || 1;
      const catSlug = encodeURIComponent(rawCat.toLowerCase().replace(/\s+/g, '-'));
      const canonical = page > 1 ? `#/${catSlug}/${page}` : `#/${catSlug}`;
      return { view: 'posts', page: page, category: rawCat, canonicalHash: canonical };
    }

    // Fallback: check if slug matches a post or page directly
    const segmentsForFallback = h.replace(/\/$/, '').split('/');
    const lastSegment = segmentsForFallback[segmentsForFallback.length - 1];
    const directDraft = getDrafts().find(d => d.slug === lastSegment || d.id === lastSegment);

    if (directDraft) {
      if (directDraft.isRedirect && (directDraft.redirectUrl || directDraft.url)) {
        const dest = directDraft.redirectUrl || directDraft.url;
        window.location.href = dest;
        return { view: 'home', canonicalHash: '#/' };
      }
      if (directDraft.isCategoryAggregate || String(directDraft.id || '').startsWith('page_cat_')) {
        const catName = directDraft.categoryAggregate || directDraft.title || lastSegment;
        const catSlug = encodeURIComponent((directDraft.slug || lastSegment).toLowerCase().replace(/\s+/g, '-'));
        return { view: 'posts', page: 1, category: catName, canonicalHash: `#/${catSlug}` };
      }
      return { view: 'reader', type: directDraft.type || 'post', slug: directDraft.slug || directDraft.id, canonicalHash: buildPostUrl(directDraft) };
    }

    return { view: 'home', canonicalHash: '#/' };
  }

  function notifyParentNavigated(canonicalHash, pageTitle, route) {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'CEDAR_PREVIEW_NAVIGATED',
          hash: canonicalHash,
          title: pageTitle,
          route: route
        }, '*');
      } catch (e) {}
    }
  }

  function updatePageTitle(titleStr) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titleStr;
    document.title = titleStr;
  }

  function maybeRenderApp() {
    const currentHash = getWorkspaceFingerprint();
    if (currentHash === lastRenderedFingerprint) {
      return; // No change: DO NOT touch DOM, completely eliminates flickering
    }
    lastRenderedFingerprint = currentHash;
    renderApp();
  }

  function route(options = {}) {
    const r = parseRoute();
    const siteTitle = getSiteTitle();
    const tagline = getSiteTagline();

    if (r.canonicalHash) {
      try {
        let cleanUrl = toPreviewUrl(r.canonicalHash);
        if (window.location.pathname + window.location.search !== cleanUrl) {
          const rawPath = window.location.pathname.replace(/\/preview\.html(?:\/|$)/i, '/').replace(/^\/+|\/+$/g, '');
          const rawHash = (window.location.hash || '').replace(/^#\/?/, '').trim();
          const hasRequestedSubroute = Boolean(rawPath || rawHash);
          if (r.canonicalHash === '#/' && hasRequestedSubroute && !window.__hasSyncedWithServer) {
            // Do not wipe URL to home while initial server sync is pending
          } else {
            history.replaceState(null, '', cleanUrl);
          }
        }
      } catch (e) {
        if (window.location.hash !== r.canonicalHash) {
          window.location.hash = r.canonicalHash;
        }
      }
    }

    if (r.view === 'posts') {
      let pageTitle = `All Posts — ${siteTitle}`;
      if (r.category && r.category !== 'ALL') {
        pageTitle = `${r.category} Articles — ${siteTitle}`;
      }
      updatePageTitle(pageTitle);
      renderAllPosts(r.page || 1, r.category || null);
      notifyParentNavigated(r.canonicalHash, pageTitle, r);
    } else if (r.view === 'reader') {
      const renderedItem = renderReader(r.type || 'post', r.slug, r.page || 1);
      const isLinks = renderedItem && (renderedItem.id === 'page_links' || renderedItem.slug === 'links' || r.slug === 'links');
      let pageTitle = isLinks
        ? (renderedItem.linksData?.profile?.headline || renderedItem.title || 'Links')
        : `${(renderedItem && renderedItem.title) || 'Article'} — ${siteTitle}`;
      updatePageTitle(pageTitle);
      notifyParentNavigated(r.canonicalHash, pageTitle, r);
    } else if (r.view === 'author') {
      const pageTitle = `${r.name} — Profile — ${siteTitle}`;
      updatePageTitle(pageTitle);
      if (typeof renderAuthorProfile === 'function') renderAuthorProfile(r.name, r.tab || 'articles');
      notifyParentNavigated(r.canonicalHash, pageTitle, r);
    } else {
      const pageTitle = tagline ? `${siteTitle} — ${tagline}` : `${siteTitle} — Home`;
      updatePageTitle(pageTitle);
      renderHome(options);
      notifyParentNavigated(r.canonicalHash, pageTitle, r);
    }
  }

  function navigateTo(targetRoute, options = {}) {
    window.__hasInAppNavigated = true;
    let clean = (targetRoute || '').trim();
    let previewUrl = toPreviewUrl(clean);
    
    if (options.replace) {
      try {
        history.replaceState(null, '', previewUrl);
      } catch (e) {
        window.location.hash = clean;
      }
    } else {
      try {
        history.pushState(null, '', previewUrl);
      } catch (e) {
        window.location.hash = clean;
      }
    }
    route(options);
  }

  function renderApp(options = {}) {
    const prevScrollY = (typeof options.scrollY === 'number')
      ? options.scrollY
      : (window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || (document.body ? document.body.scrollTop : 0) || 0);

    lastRenderedFingerprint = getWorkspaceFingerprint();
    try {
      const brandLink = document.getElementById('header-brand-link');
      if (brandLink) brandLink.setAttribute('href', toPreviewUrl('/'));
      const footerPowered = document.getElementById('footer-powered-by');
      if (footerPowered) footerPowered.setAttribute('href', toPreviewUrl('/about-cedar/'));
      updateBranding();
    } catch (err) {
      console.error('[Preview] Error in updateBranding:', err);
    }
    try {
      route(options);
    } catch (err) {
      console.error('[Preview] Error in route: ' + (err && (err.stack || err.message || err)));
    }

    if (prevScrollY > 0) {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
      requestAnimationFrame(() => {
        window.scrollTo({ top: prevScrollY, behavior: 'instant' });
      });
    }
  }

  window.renderApp = renderApp;
  window.renderHome = renderHome;
  window.maybeRenderApp = maybeRenderApp;
  window.route = route;
  window.navigateTo = navigateTo;

  window.CedarPreview.renderApp = renderApp;
  window.OutpostPreview.renderApp = renderApp;
  window.CedarPreview.maybeRenderApp = maybeRenderApp;
  window.OutpostPreview.maybeRenderApp = maybeRenderApp;
  window.CedarPreview.route = route;
  window.OutpostPreview.route = route;
  window.CedarPreview.parseRoute = parseRoute;
  window.CedarPreview.navigateTo = navigateTo;

  // Back buttons
  const btnBack = document.getElementById('btn-reader-back');
  if (btnBack) {
    btnBack.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.__hasInAppNavigated && window.history.length > 1) {
        window.history.back();
      } else {
        const hash = window.location.hash || '';
        if (hash.startsWith('#/pages/')) {
          navigateTo('/');
        } else {
          navigateTo('blog');
        }
      }
    });
  }

  const btnBottomBack = document.getElementById('btn-reader-bottom-back');
  if (btnBottomBack) {
    btnBottomBack.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('blog');
    });
  }

  const btnPostsBack = document.getElementById('btn-posts-back-home');
  if (btnPostsBack) {
    btnPostsBack.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('/');
    });
  }

  // Storage event listener for real-time reactivity (same origin)
  window.addEventListener('storage', () => {
    const prevScrollY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
    loadWorkspaceData();
    applyThemeToPreview();
    maybeRenderApp();
    if (prevScrollY > 0) {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
      requestAnimationFrame(() => window.scrollTo({ top: prevScrollY, behavior: 'instant' }));
    }
  });

  // PostMessage listener for real-time theme & navigation updates from Cedar studio
  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'CEDAR_THEME_CHANGED' || e.data.type === 'OUTPOST_THEME_CHANGED') {
      applyThemeToPreview(e.data.themeId);
    } else if (e.data.type === 'CEDAR_BRANDING_UPDATED') {
      if (e.data.projectConfig) {
        window.projectConfig = e.data.projectConfig;
        if (typeof setProjectConfig === 'function') setProjectConfig(e.data.projectConfig);
        else if (typeof window.setProjectConfig === 'function') window.setProjectConfig(e.data.projectConfig);
      }
      if (typeof updateBranding === 'function') updateBranding();
    } else if (e.data.type === 'CEDAR_CONFIG_CHANGED' || e.data.type === 'CEDAR_WORKSPACE_UPDATED') {
      const prevScrollY = (typeof e.data.scrollY === 'number')
        ? e.data.scrollY
        : (window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0);

      if (e.data.projectConfig) {
        window.projectConfig = e.data.projectConfig;
        if (typeof setProjectConfig === 'function') setProjectConfig(e.data.projectConfig);
        else if (typeof window.setProjectConfig === 'function') window.setProjectConfig(e.data.projectConfig);
      }
      if (Array.isArray(e.data.drafts)) {
        window.drafts = e.data.drafts;
        if (typeof setDrafts === 'function') setDrafts(e.data.drafts);
        else if (typeof window.setDrafts === 'function') window.setDrafts(e.data.drafts);
      }
      if (typeof applyThemeToPreview === 'function') {
        applyThemeToPreview(e.data.themeId || (window.projectConfig && window.projectConfig.design && window.projectConfig.design.blogTheme));
      }
      if (typeof updateBranding === 'function') updateBranding();
      renderApp({ preserveScroll: true, scrollY: prevScrollY });
      if (prevScrollY > 0) {
        window.scrollTo({ top: prevScrollY, behavior: 'instant' });
        requestAnimationFrame(() => window.scrollTo({ top: prevScrollY, behavior: 'instant' }));
      }
    } else if (e.data.type === 'CEDAR_PREVIEW_NAVIGATE_TO') {
      if (e.data.hash) {
        navigateTo(e.data.hash);
      }
    }
  });

  // Periodic live-sync polling only for standalone preview instances (not embedded in studio iframe or production static build)
  if (!window.__CEDAR_PRODUCTION__ && !window.__CEDAR_STATIC_DATA__) {
    try {
      if (!window.parent || window.parent === window) {
        setInterval(syncWithServer, 2500);
      }
    } catch (_) {
      setInterval(syncWithServer, 2500);
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  // Intercept navigation links for smooth client-side routing
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;

    if (link.target === '_blank' || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('javascript:')) {
      return;
    }

    if (link.id === 'header-brand-link' || href === '#/' || href === '/' || href === '/preview.html' || href === '/preview.html/' || href === '#') {
      e.preventDefault();
      navigateTo('/');
      return;
    }

    if (href.startsWith('/preview.html/')) {
      e.preventDefault();
      const sub = href.slice('/preview.html/'.length);
      navigateTo('#/' + sub);
      return;
    }

    if (href.startsWith('#/')) {
      e.preventDefault();
      navigateTo(href);
      return;
    }

    if (href.startsWith('/') && !/\.(xml|json|png|jpg|jpeg|webp|gif|svg|ico|css|js|pdf|zip)$/i.test(href.split('?')[0])) {
      e.preventDefault();
      navigateTo('#/' + href.replace(/^\/+/, ''));
      return;
    }
  });

  // Mobile headroom scroll handler (hides header when scrolling down, reveals on scroll up)
  function initMobileHeadroom() {
    let lastScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    let ticking = false;
    const header = document.querySelector('.site-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
          const scrollDelta = currentScrollY - lastScrollY;

          if (window.innerWidth <= 899) {
            if (currentScrollY <= 15) {
              header.classList.remove('header-hidden');
            } else if (scrollDelta > 6 && currentScrollY > 60) {
              header.classList.add('header-hidden');
            } else if (scrollDelta < -6) {
              header.classList.remove('header-hidden');
            }
          } else {
            header.classList.remove('header-hidden');
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // Init on DOM ready or immediate
  async function init() {
    loadWorkspaceData();
    applyThemeToPreview();
    const drafts = (typeof getDrafts === 'function') ? getDrafts() : [];
    const isStandalone = !(window.parent && window.parent !== window && window.parent.projectConfig);
    if (isStandalone && (!drafts || drafts.length === 0)) {
      await syncWithServer();
    }
    renderApp();
    syncWithServer();
    initMobileHeadroom();
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CEDAR_PREVIEW_FRAME_READY' }, '*');
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
