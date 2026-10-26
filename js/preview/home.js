/**
 * Cedar Preview — Home View & Blocks Renderer
 */
(function () {
  'use strict';
  window.CedarPreview = window.CedarPreview || window.OutpostPreview || {};
  window.OutpostPreview = window.CedarPreview;

  const getDrafts = () => window.drafts || [];
  const getConfig = () => window.projectConfig || {};
  const PAGE_PLACEHOLDERS = new Set([
    'page', 'new page', 'untitled page', 'untitled',
    'new-page', 'untitled-page'
  ]);
  let activeCategoryFilter = window.activeCategoryFilter || 'ALL';
  let activeFeedTab = window.activeFeedTab || 'latest';

  function isCategoryPageHidden(catName) {
    if (!catName) return false;
    const lower = String(catName).trim().toLowerCase();
    const slug = lower.replace(/\s+/g, '-');
    const catPage = (getDrafts() || []).find(d =>
      d.type === 'page' && (
        (d.isCategoryAggregate && (d.categoryAggregate || '').trim().toLowerCase() === lower) ||
        (d.title || '').trim().toLowerCase() === lower ||
        (d.slug || '').trim().toLowerCase() === slug
      )
    );
    return Boolean(catPage && (catPage.hidden || catPage.retired));
  }
  window.isCategoryPageHidden = isCategoryPageHidden;

  function getUserPublishedPages() {
    const isRssOff = (typeof getConfig === 'function' ? !getConfig().rssEnabled : false);
    const configuredCatsLower = new Set(
      (getConfig().categories || [])
        .map(c => (typeof c === 'object' ? (c.name || c.title || '') : String(c || '')).trim().toLowerCase())
        .filter(Boolean)
    );
    const rawPages = (getDrafts() || []).filter(d => {
      if (d.type !== 'page') return false;
      if (d.hidden || d.retired) return false;
      if (d.slug === 'about-cedar' || d.id === 'page_about_cedar') return false;
      if ((d.slug === 'rss' || d.id === 'page_rss') && isRssOff) return false;
      // Category pages are rendered via validCats so they don't duplicate in nav
      if (d.isCategoryAggregate || configuredCatsLower.has((d.title || '').trim().toLowerCase())) return false;
      return true;
    });
    const validPages = rawPages.filter(p => {
      const t = (p.title || '').trim().toLowerCase();
      let s = (p.slug || '').trim().toLowerCase();
      if (!t && !s) return false;
      // If the title itself is a placeholder or blank, filter it out
      if (!t || PAGE_PLACEHOLDERS.has(t)) return false;
      // If slug is missing or a placeholder, auto-heal slug from title
      if (!s || PAGE_PLACEHOLDERS.has(s)) {
        s = (typeof window.generateSlug === 'function')
          ? window.generateSlug(p.title || 'page')
          : t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        p.slug = s || 'page';
      }
      if (t === 'home' || s === 'home' || t === 'all' || s === 'all' || p.id === 'page_all') return false;
      return true;
    });

    // Deduplicate by slug and by title so duplicate nav links can NEVER render
    const deduped = [];
    const seenSlugs = new Set();
    const seenTitles = new Set();
    for (const p of validPages) {
      const s = (p.slug || '').trim().toLowerCase();
      const t = (p.title || '').trim().toLowerCase();
      if (s && seenSlugs.has(s)) continue;
      if (t && seenTitles.has(t)) continue;
      if (s) seenSlugs.add(s);
      if (t) seenTitles.add(t);
      deduped.push(p);
    }
    return deduped;
  }

  function updateNavLinks(activeRoute) {
    const pages = getUserPublishedPages();
    const navLinksEl = document.getElementById('header-nav-links');
    if (!navLinksEl) return;
    let html = `
      <li class="nav-search-item" style="display: inline-flex; align-items: center; margin: 0; padding: 0;">
        <button id="nav-search-btn" title="Search" style="background: transparent; border: none; cursor: pointer; color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; padding: 0; margin: 0; transition: color 0.15s ease;">
          <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="1.75 1.75 20.5 20.5" style="display: block;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
        </button>
      </li>
    `;
    
    const rawNavCats = (getConfig().categories && Array.isArray(getConfig().categories)) ? [...getConfig().categories] : [];
    if (rawNavCats.length === 0) {
      const draftsList = getDrafts() || [];
      const seenNav = new Set();
      draftsList.forEach(d => {
        if (!d) return;
        if (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) {
          const c = String(d.categoryAggregate || d.title || '').trim();
          if (c && !seenNav.has(c.toLowerCase())) {
            seenNav.add(c.toLowerCase());
            rawNavCats.push(c);
          }
        }
        if (d.status === 'published' && !d.hidden && !d.retired) {
          if (d.tag && !seenNav.has(d.tag.trim().toLowerCase())) {
            seenNav.add(d.tag.trim().toLowerCase());
            rawNavCats.push(d.tag.trim());
          }
          if (Array.isArray(d.categories)) {
            d.categories.forEach(cat => {
              const str = String(cat || '').trim();
              if (str && !seenNav.has(str.toLowerCase())) {
                seenNav.add(str.toLowerCase());
                rawNavCats.push(str);
              }
            });
          }
        }
      });
    }
    const validCats = rawNavCats.filter(c => {
      const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
      if (!val || val.toLowerCase() === 'uncategorized' || val.toLowerCase() === 'general' || val.toLowerCase() === 'posts') return false;
      if (isCategoryPageHidden(val)) return false;
      return true;
    });

    const hashStr = (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
    const pathStr = (window.location.pathname || '').replace(/^.*preview\.html\/?/i, '').trim().toLowerCase();
    const rawRoute = (hashStr || pathStr).replace(/\/+$/, '');
    const segments = rawRoute.split('/').filter(Boolean);
    const rootToken = segments[0] || '';

    const isHome = activeRoute === 'home' || (!rawRoute && (!activeRoute || activeRoute === 'home')) || rootToken === 'home';
    if (!isHome && document.body) {
      document.body.classList.remove('home-no-featured-with-cats');
    }

    // 1. Identify active category (if any)
    let activeCatSlug = null;
    if (!isHome) {
      if (activeRoute && activeRoute.startsWith('category:')) {
        const catName = activeRoute.slice(9).trim().toLowerCase();
        activeCatSlug = encodeURIComponent(catName.replace(/\s+/g, '-'));
      } else if (activeRoute && activeRoute.startsWith('page:')) {
        const pageSlug = activeRoute.slice(5).trim().toLowerCase();
        const matched = validCats.find(c => {
          const name = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim().toLowerCase();
          return name.replace(/\s+/g, '-') === pageSlug || encodeURIComponent(name.replace(/\s+/g, '-')) === pageSlug;
        });
        if (matched) {
          const mName = (typeof matched === 'object' ? (matched.name || matched.title || '') : String(matched)).trim();
          activeCatSlug = encodeURIComponent(mName.toLowerCase().replace(/\s+/g, '-'));
        }
      }

      if (!activeCatSlug && rootToken) {
        for (const c of validCats) {
          const catName = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
          const slug = encodeURIComponent(catName.toLowerCase().replace(/\s+/g, '-'));
          if (rootToken === slug.toLowerCase() || rootToken === catName.toLowerCase()) {
            activeCatSlug = slug;
            break;
          }
        }
      }
    }

    // 2. Identify active page (if any)
    let activePageSlug = null;
    if (!isHome && !activeCatSlug) {
      if (activeRoute && activeRoute.startsWith('page:')) {
        activePageSlug = activeRoute.slice(5).trim().toLowerCase();
      } else if (rootToken) {
        for (const p of pages) {
          const pSlug = (p.slug || p.id || '').trim().toLowerCase();
          if (pSlug && (rootToken === pSlug || pSlug.endsWith('/' + rootToken))) {
            activePageSlug = pSlug;
            break;
          }
        }
      }
    }

    // 3. "All" and Category links
    const allPage = (Array.isArray(window.drafts) ? window.drafts : (typeof getDrafts === 'function' ? getDrafts() : [])).find(d => d && (d.id === 'page_all' || d.slug === 'all' || (d.title || '').trim().toLowerCase() === 'all'));
    const isAllHidden = (getConfig() && (getConfig().allDisabled === true || getConfig().allEnabled === false)) ||
      (allPage ? (typeof window.isPageHidden === 'function' ? window.isPageHidden(allPage) : Boolean(allPage.hidden || allPage.retired)) : false);

    const allCategoryIdx = (typeof window.projectConfig?.allCategoryIndex === 'number')
      ? window.projectConfig.allCategoryIndex
      : (typeof projectConfig?.allCategoryIndex === 'number' ? projectConfig.allCategoryIndex : 0);

    const draftsList = (typeof getDrafts === 'function' ? getDrafts() : window.drafts) || [];

    const navItems = [];

    const navCatItems = validCats.map(c => {
      const catName = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
      const catSlug = encodeURIComponent(catName.toLowerCase().replace(/\s+/g, '-'));
      const isActive = !isHome && !activePageSlug && (activeCatSlug && activeCatSlug.toLowerCase() === catSlug.toLowerCase());
      const linkUrl = typeof window.toPreviewUrl === 'function' ? window.toPreviewUrl('#/' + catSlug) : `/preview.html/${catSlug}`;
      const matchedDraft = draftsList.find(d => d && (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) && String(d.categoryAggregate || d.title || '').trim().toLowerCase() === catName.toLowerCase());
      return {
        id: matchedDraft ? matchedDraft.id : `page_cat_${catSlug}`,
        slug: catSlug,
        title: catName,
        type: 'category',
        createdAt: matchedDraft ? (matchedDraft.createdAt || matchedDraft.updatedAt || 1) : 1,
        name: catName,
        url: linkUrl,
        isActive: isActive,
        html: `<li><a href="${linkUrl}" class="nav-link ${isActive ? 'active' : ''}">${escapeHtml(catName)}</a></li>`
      };
    });

    if (!isAllHidden) {
      const isAllExplicit = rootToken === 'blog' || rootToken === 'posts' || rootToken === 'all' || activeRoute === 'posts' || activeRoute === 'blog' || activeRoute === 'all' || (activeRoute && (activeRoute === 'page:all' || activeRoute === 'page:page_all'));
      const isAllActive = !isHome && !activeCatSlug && (!activePageSlug || activePageSlug === 'all') && isAllExplicit;
      const allHref = typeof window.toPreviewUrl === 'function' ? window.toPreviewUrl('#/blog') : '/preview.html/blog';
      const clampedIdx = Math.max(0, Math.min(allCategoryIdx, navCatItems.length));
      navCatItems.splice(clampedIdx, 0, {
        id: 'page_all',
        slug: 'all',
        title: 'All',
        type: 'all',
        name: 'All',
        url: allHref,
        isActive: isAllActive,
        html: `<li><a href="${allHref}" class="nav-link ${isAllActive ? 'active' : ''}">All</a></li>`
      });
    }

    navCatItems.forEach(item => navItems.push(item));

    // Helper to identify built-in pages
    const isBuiltInNavPage = (p) => {
      if (!p) return false;
      const s = (p.slug || '').trim().toLowerCase();
      const t = (p.title || '').trim().toLowerCase();
      const id = (p.id || '').trim().toLowerCase();
      return s === 'about' || t === 'about' || id === 'page_about' ||
             s === 'links' || t === 'links' || id === 'page_links' ||
             s === 'rss' || t === 'rss' || id === 'page_rss' ||
             s === 'all' || t === 'all' || id === 'page_all' ||
             s === 'posts' || t === 'posts' || s === 'about-cedar' || id === 'page_about_cedar';
    };

    // 5. User custom static pages & redirects
    const myPages = pages.filter(p => !isBuiltInNavPage(p));
    myPages.forEach(p => {
      const slug = (p.slug || p.id || '').trim();
      const label = (p.title || slug).trim();
      if (!label || PAGE_PLACEHOLDERS.has(label.toLowerCase())) return;
      const cleanSlug = slug.toLowerCase();
      const isActive = !isHome && !activeCatSlug && (activePageSlug === cleanSlug || activeRoute === `page:${cleanSlug}` || activeRoute === `blog:${cleanSlug}`);
      let itemHtml = '';
      if (p.isRedirect && (p.redirectUrl || p.url)) {
        const targetUrl = p.redirectUrl || p.url;
        const isExt = /^https?:\/\//i.test(targetUrl);
        const targetAttr = isExt ? 'target="_blank" rel="noopener noreferrer"' : '';
        itemHtml = `<li><a href="${escapeHtml(targetUrl)}" class="nav-link redirect-nav-link" ${targetAttr}>${escapeHtml(label)}</a></li>`;
      } else {
        itemHtml = `<li><a href="${window.buildPostUrl(p)}" class="nav-link ${isActive ? 'active' : ''}">${escapeHtml(label)}</a></li>`;
      }
      navItems.push({
        id: p.id,
        slug: slug,
        title: label,
        type: p.isRedirect ? 'redirect' : 'static',
        createdAt: p.createdAt || p.updatedAt || 0,
        html: itemHtml
      });
    });

    // 6. About page
    const aboutPage = pages.find(p => {
      const s = (p.slug || p.id || '').toLowerCase();
      const t = (p.title || '').trim().toLowerCase();
      return s === 'about' || t === 'about' || p.id === 'page_about';
    });
    if (aboutPage) {
      const slug = (aboutPage.slug || aboutPage.id || 'about').trim();
      const label = (aboutPage.title || 'About').trim();
      const cleanSlug = slug.toLowerCase();
      const isActive = !isHome && !activeCatSlug && (activePageSlug === cleanSlug || activeRoute === `page:${cleanSlug}` || activeRoute === `blog:${cleanSlug}` || activeRoute === 'about');
      navItems.push({
        id: aboutPage.id || 'page_about',
        slug: slug,
        title: label,
        type: 'builtin',
        html: `<li><a href="${window.buildPostUrl(aboutPage)}" class="nav-link ${isActive ? 'active' : ''}">${escapeHtml(label)}</a></li>`
      });
    }

    // 7. Links page
    const linksPage = pages.find(p => {
      const s = (p.slug || p.id || '').toLowerCase();
      const t = (p.title || '').trim().toLowerCase();
      return s === 'links' || t === 'links' || p.id === 'page_links';
    });
    if (linksPage) {
      const slug = (linksPage.slug || linksPage.id || 'links').trim();
      const label = (linksPage.title || 'Links').trim();
      const cleanSlug = slug.toLowerCase();
      const isActive = !isHome && !activeCatSlug && (activePageSlug === cleanSlug || activeRoute === `page:${cleanSlug}` || activeRoute === `blog:${cleanSlug}` || activeRoute === 'links');
      navItems.push({
        id: linksPage.id || 'page_links',
        slug: slug,
        title: label,
        type: 'builtin',
        html: `<li><a href="${window.buildPostUrl(linksPage)}" class="nav-link ${isActive ? 'active' : ''}">${escapeHtml(label)}</a></li>`
      });
    }

    // 8. RSS page
    const isRssOff = (typeof getConfig === 'function' ? !getConfig().rssEnabled : false);
    const rssPage = pages.find(p => {
      const s = (p.slug || p.id || '').toLowerCase();
      const t = (p.title || '').trim().toLowerCase();
      return s === 'rss' || t === 'rss' || p.id === 'page_rss';
    });
    if (rssPage) {
      const slug = (rssPage.slug || rssPage.id || 'rss').trim();
      const label = (rssPage.title || 'RSS').trim();
      const cleanSlug = slug.toLowerCase();
      const isActive = !isHome && !activeCatSlug && (activePageSlug === cleanSlug || activeRoute === `page:${cleanSlug}` || activeRoute === `blog:${cleanSlug}` || activeRoute === 'rss');
      navItems.push({
        id: rssPage.id || 'page_rss',
        slug: slug,
        title: label,
        type: 'builtin',
        html: `<li><a href="${window.buildPostUrl(rssPage)}" class="nav-link ${isActive ? 'active' : ''}">${escapeHtml(label)}</a></li>`
      });
    } else if (!isRssOff) {
      const rssDraft = (getDrafts() || []).find(d => d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
      const isRssHidden = rssDraft ? Boolean(rssDraft.hidden || rssDraft.retired) : false;
      if (!isRssHidden) {
        const isRssActive = !isHome && !activeCatSlug && (activePageSlug === 'rss' || activeRoute === 'page:rss' || activeRoute === 'rss');
        const rssHref = typeof window.toPreviewUrl === 'function' ? window.toPreviewUrl('#/rss') : '/preview.html/rss';
        navItems.push({
          id: 'page_rss',
          slug: 'rss',
          title: 'RSS',
          type: 'builtin',
          html: `<li><a href="${rssHref}" class="nav-link ${isRssActive ? 'active' : ''}">RSS</a></li>`
        });
      }
    }

    // Sort navigation items: custom order if user-arranged, otherwise Categories -> Static -> Redirects -> Built-Ins (chronological newest first)
    const cfg = (typeof getConfig === 'function' ? getConfig() : {}) || {};
    const getNavRank = (item) => {
      if (item.type === 'category' || item.type === 'all') return 1;
      if (item.type === 'static') return 2;
      if (item.type === 'redirect') return 3;
      return 4;
    };
    const getNavTime = (item) => {
      if (!item || item.type === 'all') return 0;
      if (typeof item.createdAt === 'number' && item.createdAt > 0) return item.createdAt;
      const m = String(item.id || '').match(/^page_(\d+)_/);
      if (m && m[1]) return Number(m[1]);
      return 0;
    };
    const compareNavDefault = (a, b) => {
      const rA = getNavRank(a);
      const rB = getNavRank(b);
      if (rA !== rB) return rA - rB;
      const tA = getNavTime(a);
      const tB = getNavTime(b);
      if (tA !== tB) return tB - tA;
      return 0;
    };

    if (cfg.pagesCustomOrderUserSet && Array.isArray(cfg.pagesCustomOrder) && cfg.pagesCustomOrder.length > 0) {
      const orderMap = new Map();
      cfg.pagesCustomOrder.forEach((id, idx) => orderMap.set(String(id).toLowerCase(), idx));
      navItems.sort((a, b) => {
        const aKey = (a.id || a.slug || a.title || '').toLowerCase();
        const bKey = (b.id || b.slug || b.title || '').toLowerCase();
        const aIdx = orderMap.has(aKey) ? orderMap.get(aKey) : (a.slug && orderMap.has(a.slug.toLowerCase()) ? orderMap.get(a.slug.toLowerCase()) : 99999);
        const bIdx = orderMap.has(bKey) ? orderMap.get(bKey) : (b.slug && orderMap.has(b.slug.toLowerCase()) ? orderMap.get(b.slug.toLowerCase()) : 99999);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return compareNavDefault(a, b);
      });
    } else {
      navItems.sort(compareNavDefault);
    }

    html += navItems.map(item => item.html).join('');
    navLinksEl.innerHTML = html;
  }


      function updateBranding() {
        const brand = (getConfig().design && getConfig().design.branding) || {};
        const siteName = getConfig().name || getConfig().domain || brand.siteTitle || 'Cedar';
        const tagline = (brand.tagline !== undefined && brand.tagline !== null) ? brand.tagline : (getConfig().subtitle || '');
        const logo = brand.generalLogo || 'logo.png';
        const favicon = brand.tabLogo || 'icon.png';

        document.getElementById('page-title').textContent = tagline ? `${siteName} — ${tagline}` : siteName;
        document.getElementById('header-title').textContent = siteName;
        const taglineEl = document.getElementById('header-tagline');
        if (taglineEl) {
          taglineEl.textContent = '';
          taglineEl.style.display = 'none';
        }
        const footerSiteNameEl = document.getElementById('footer-site-name');
        if (footerSiteNameEl) footerSiteNameEl.textContent = siteName;
        const footerDomainEl = document.getElementById('footer-domain-label');
        if (footerDomainEl) footerDomainEl.textContent = getConfig().domain ? `(${getConfig().domain})` : '';
        const createdYear = parseInt((getConfig().createdYear) ||
          (getConfig().createdAt ? new Date(getConfig().createdAt).getFullYear() : null) ||
          new Date().getFullYear(), 10);
        const currentYear = new Date().getFullYear();
        const yearText = (createdYear && createdYear < currentYear) ? `${createdYear}-${currentYear}` : currentYear;
        const footerYearEl = document.getElementById('footer-year');
        if (footerYearEl) footerYearEl.textContent = yearText;

        const logoEl = document.getElementById('header-logo');
        if (logoEl) logoEl.src = window.resolveAssetUrl(logo);

        const favEl = document.getElementById('site-favicon');
        if (favEl) favEl.href = window.resolveAssetUrl(favicon);

        const isRss = Boolean(getConfig().rssEnabled);
        const rssLinkPosts = document.getElementById('rss-link-posts');
        if (rssLinkPosts) {
          rssLinkPosts.disabled = !isRss;
          rssLinkPosts.style.display = isRss ? '' : 'none';
        }

        const baseContainerW = (getConfig().design && getConfig().design.containerWidth) || 1280;
        const syncResponsiveContainer = () => {
          if (window.innerWidth >= 1920) {
            const scaledW = Math.round(window.innerWidth * (baseContainerW / 1920));
            document.documentElement.style.setProperty('--container-width', `${scaledW}px`);
          } else {
            document.documentElement.style.setProperty('--container-width', `${baseContainerW}px`);
          }
        };
        syncResponsiveContainer();
        window.addEventListener('resize', syncResponsiveContainer);

        const isSticky = !!(getConfig().design && getConfig().design.stickyHeader);
        const headerEl = document.querySelector('.site-header');
        if (headerEl) {
          headerEl.classList.toggle('is-sticky', isSticky);
        }

        // Apply Masthead Layout Configuration (driven by block alignment: left, center, right)
        const mh = (getConfig().design && getConfig().design.masthead) || {};
        const blocks = (getConfig().design && getConfig().design.homeBlocks) || [];
        const mhBlock = blocks.find(b => b.id === 'b_masthead');
        const mhAlign = (mhBlock && (mhBlock.align || (mhBlock.config && mhBlock.config.align))) || mh.align || 'left';
        const mhH = (mhBlock && mhBlock.h) || mh.height || (mhAlign === 'center' ? 96 : 64);
        const els = mh.elements || {};
        const logoCfg = els.logo || { enabled: true };
        const titleCfg = els.title || { enabled: true };
        const navCfg = els.nav || { enabled: true };

        const navWrapEl = document.querySelector('.site-header .nav-wrap');
        const headerLogoEl = document.getElementById('header-logo');
        const headerTitleEl = document.getElementById('header-title');
        const headerTaglineEl = document.getElementById('header-tagline');
        const headerNavEl = document.querySelector('.site-header nav');
        const navLinksEl = document.getElementById('header-nav-links');
        const navSearchBtnEl = document.getElementById('nav-search-btn');
        const brandLinkEl = document.getElementById('header-brand-link');
        const brandTextEl = brandLinkEl ? brandLinkEl.querySelector('.brand-text') : null;
        if (brandLinkEl && !brandLinkEl._homeBound) {
          brandLinkEl._homeBound = true;
          brandLinkEl.addEventListener('click', (e) => {
            e.preventDefault();
            window.activeCategoryFilter = 'ALL'; activeCategoryFilter = 'ALL';
            if (window.navigateTo) window.navigateTo('/');
            else window.location.hash = '#/';
          });
        }


        if (headerTaglineEl) {
          headerTaglineEl.style.display = 'none';
        }

        const spacingMode = (mhBlock && mhBlock.config && mhBlock.config.spacing) || mh.spacing || 'auto';
        let userSpacingScale = (mhBlock && mhBlock.config && typeof mhBlock.config.spacingScale === 'number')
          ? mhBlock.config.spacingScale
          : (typeof mh.spacingScale === 'number' ? mh.spacingScale : 1.0);

        if (spacingMode === 'compact') userSpacingScale *= 0.65;
        else if (spacingMode === 'relaxed') userSpacingScale *= 1.45;

        let autoFactor = 1.0;
        if (spacingMode === 'auto' || spacingMode === 'relaxed') {
          autoFactor = Math.min(3.5, 1.0 + Math.max(0, mhH - 64) / 85);
        }
        const factor = Math.max(0.4, autoFactor * userSpacingScale);

        const lockupGap = Math.round(8 * Math.min(3.2, factor));
        const navGap = Math.round(10 * Math.min(3.4, factor));
        const logoGrowth = Math.min(1.65, 1.0 + Math.max(0, mhH - 64) / 360);
        const titleGrowth = Math.min(1.35, 1.0 + Math.max(0, mhH - 64) / 500);
        const dCfg = getConfig().design || {};
        if (typeof window.applyTypographyToPreview === 'function') {
          window.applyTypographyToPreview(dCfg);
        }
        const logoScale = typeof logoCfg.scale === 'number' ? logoCfg.scale : (typeof dCfg.logoScale === 'number' ? dCfg.logoScale : ((dCfg.branding && typeof dCfg.branding.logoScale === 'number') ? dCfg.branding.logoScale : 1.0));
        const titleScale = typeof titleCfg.scale === 'number' ? titleCfg.scale : (typeof dCfg.titleScale === 'number' ? dCfg.titleScale : ((dCfg.branding && typeof dCfg.branding.titleScale === 'number') ? dCfg.branding.titleScale : 1.0));
        const maxScale = Math.max(logoScale, titleScale, 1.0);
        const padV = Math.max(10, Math.round(10 * Math.max(0.5, factor) + (maxScale - 1) * 7));
        const logoSize = Math.round(44 * logoScale * logoGrowth);
        const minH = Math.max(mhH, logoSize + padV * 2, Math.round(1.25 * titleScale * titleGrowth * 24 + padV * 2));

        if (headerEl) {
          headerEl.style.height = 'auto';
          headerEl.style.minHeight = `${minH}px`;
        }

        if (brandLinkEl) {
          brandLinkEl.classList.remove('custom-masthead-link');
          brandLinkEl.style.position = 'relative';
          brandLinkEl.style.width = 'auto';
          brandLinkEl.style.height = 'auto';
          brandLinkEl.style.display = 'inline-flex';

          if (headerLogoEl) {
            headerLogoEl.style.position = 'static';
            headerLogoEl.style.left = '';
            headerLogoEl.style.top = '';
            headerLogoEl.style.display = logoCfg.enabled !== false ? 'block' : 'none';
            headerLogoEl.style.width = `${logoSize}px`;
            headerLogoEl.style.height = `${logoSize}px`;
            headerLogoEl.style.objectFit = 'contain';
            headerLogoEl.style.borderRadius = '6px';
            headerLogoEl.style.flexShrink = '0';
            headerLogoEl.style.margin = mhAlign === 'center' ? '0 auto' : '0';
          }

          if (headerTitleEl) {
            headerTitleEl.style.position = 'static';
            headerTitleEl.style.left = '';
            headerTitleEl.style.top = '';
            headerTitleEl.style.display = titleCfg.enabled !== false ? 'block' : 'none';
            headerTitleEl.style.fontSize = `${(1.25 * titleScale * titleGrowth).toFixed(2)}rem`;
            headerTitleEl.style.fontWeight = '800';
            headerTitleEl.style.whiteSpace = 'nowrap';
            headerTitleEl.style.textAlign = mhAlign === 'center' ? 'center' : mhAlign;
            headerTitleEl.style.margin = mhAlign === 'center' ? '0 auto' : '0';
          }

          if (navWrapEl) {
            navWrapEl.style.minHeight = `${minH}px`;
            navWrapEl.style.height = 'auto';
            navWrapEl.style.position = 'relative';
            navWrapEl.style.display = 'flex';
            navWrapEl.style.alignItems = 'center';
            navWrapEl.style.paddingTop = `${Math.max(0, padV)}px`;
            navWrapEl.style.paddingBottom = `${Math.max(0, padV)}px`;
            navWrapEl.style.boxSizing = 'border-box';
          }

          if (mhAlign === 'right') {
            if (navWrapEl) {
              navWrapEl.style.justifyContent = 'space-between';
              navWrapEl.style.flexDirection = 'row-reverse';
              navWrapEl.style.height = 'auto';
              navWrapEl.style.minHeight = `${minH}px`;
            }
            brandLinkEl.style.flexDirection = 'row-reverse';
            brandLinkEl.style.alignItems = 'center';
            brandLinkEl.style.justifyContent = 'flex-start';
            brandLinkEl.style.gap = `${Math.round(12 * Math.min(1.8, factor))}px`;
            brandLinkEl.style.textAlign = 'right';
            brandLinkEl.style.margin = '0';
            if (brandTextEl) {
              brandTextEl.style.alignItems = 'flex-end';
              brandTextEl.style.textAlign = 'right';
            }
          } else if (mhAlign === 'center') {
            if (navWrapEl) {
              navWrapEl.style.justifyContent = 'center';
              navWrapEl.style.alignItems = 'center';
              navWrapEl.style.flexDirection = 'column';
              navWrapEl.style.gap = `${navGap}px`;
              navWrapEl.style.height = 'auto';
              navWrapEl.style.minHeight = `${Math.max(minH, 96)}px`;
              navWrapEl.style.textAlign = 'center';
            }
            brandLinkEl.style.flexDirection = 'column';
            brandLinkEl.style.alignItems = 'center';
            brandLinkEl.style.justifyContent = 'center';
            brandLinkEl.style.gap = `${lockupGap}px`;
            brandLinkEl.style.textAlign = 'center';
            brandLinkEl.style.margin = '0 auto';
            if (brandTextEl) {
              brandTextEl.style.alignItems = 'center';
              brandTextEl.style.justifyContent = 'center';
              brandTextEl.style.textAlign = 'center';
            }
          } else {
            // left default
            if (navWrapEl) {
              navWrapEl.style.justifyContent = 'space-between';
              navWrapEl.style.flexDirection = 'row';
              navWrapEl.style.height = 'auto';
              navWrapEl.style.minHeight = `${minH}px`;
            }
            brandLinkEl.style.flexDirection = 'row';
            brandLinkEl.style.alignItems = 'center';
            brandLinkEl.style.justifyContent = 'flex-start';
            brandLinkEl.style.gap = `${Math.round(12 * Math.min(1.8, factor))}px`;
            brandLinkEl.style.textAlign = 'left';
            brandLinkEl.style.margin = '0';
            if (brandTextEl) {
              brandTextEl.style.alignItems = 'flex-start';
              brandTextEl.style.textAlign = 'left';
            }
          }
        }

        const navItemGap = `${Math.round(20 * Math.min(1.6, factor))}px`;
        if (headerNavEl) {
          headerNavEl.style.display = navCfg.enabled !== false ? 'flex' : 'none';
          headerNavEl.style.alignItems = 'center';
          headerNavEl.style.justifyContent = mhAlign === 'center' ? 'center' : 'flex-end';
          headerNavEl.style.flexWrap = 'nowrap';
          headerNavEl.style.margin = mhAlign === 'center' ? '0 auto' : '0';
          headerNavEl.style.padding = '0';
        }
        if (navLinksEl) {
          navLinksEl.style.display = 'flex';
          navLinksEl.style.alignItems = 'center';
          navLinksEl.style.flexWrap = 'wrap';
          navLinksEl.style.gap = `0.5rem ${navItemGap}`;
          navLinksEl.style.margin = '0';
          navLinksEl.style.padding = '0';
          navLinksEl.style.justifyContent = mhAlign === 'center' ? 'center' : 'flex-end';
        }
        if (navSearchBtnEl) {
          navSearchBtnEl.style.padding = '0';
          navSearchBtnEl.style.margin = '0';
        }
      }
      window.updateBranding = updateBranding;

      function getUserCustomPages() {
        return getUserPublishedPages().filter(p => {
          const t = (p.title || '').trim().toLowerCase();
          const s = (p.slug || '').trim().toLowerCase();
          const id = (p.id || '').trim().toLowerCase();
          return t !== 'about' && s !== 'about' && id !== 'page_about' &&
                 t !== 'links' && s !== 'links' && id !== 'page_links' &&
                 t !== 'rss' && s !== 'rss' && id !== 'page_rss' &&
                 t !== 'posts' && s !== 'posts' && t !== 'all' && s !== 'all' && id !== 'page_all';
        });
      }

      function extractPlainExcerpt(content, maxChars = 120) {
        if (!content || typeof content !== 'string') return '';
        let text = content;
        text = text.replace(/<[^>]*>/g, ' ');
        text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
        text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
        text = text.replace(/^#{1,6}\s+/gm, '');
        text = text.replace(/`{1,3}[^`]*`{1,3}/g, ' ');
        text = text.replace(/[*_~`]/g, '');
        text = text.replace(/^>\s+/gm, '');
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > maxChars) {
          return text.slice(0, maxChars).trim() + '...';
        }
        return text;
      }
      window.extractPlainExcerpt = extractPlainExcerpt;

      function createPostCardHtml(p, fCfg = {}) {
        const slug = p.slug || p.id || 'post';
        const cat = p.tag || (p.categories && p.categories[0]) || '';
        const hasValidCategory = cat && cat.toLowerCase() !== 'uncategorized' && cat.toLowerCase() !== 'general';
        const readTime = calcReadTime(p.markdown);
        const dateDisplay = formatDate(p.publishedDate || p.date);
        const rawAuths = (Array.isArray(p.authors) && p.authors.length > 0) ? p.authors : [p.authorName || getConfig().defaultAuthor || 'Staff'];
        const authName = typeof window.formatAuthorsString === 'function' ? window.formatAuthorsString(rawAuths) : rawAuths.map(a => a?.name || a).join(', ');
        const authAvatar = getAuthorAvatar(rawAuths[0]);

        const showThumbnails = fCfg.showThumbnails !== false;
        const showCategoryBadge = fCfg.showCategoryBadge !== false;
        const showExcerpt = fCfg.showExcerpt !== false;
        const showMeta = fCfg.showMeta !== false;
        const layoutStyle = fCfg.layoutStyle || 'vertical';
        const deferredImages = fCfg.deferredImages === true;

        const mutedColor = getMutedCoverColor(p.id || p.slug || p.title);
        const resolvedCover = (typeof getPostFeaturedImage === 'function')
          ? getPostFeaturedImage(p)
          : (typeof resolvePostImage === 'function' ? resolvePostImage(p.coverImage || p.featuredImage, p) : '');
        
        let thumbWrapHtml = '';
        if (showThumbnails) {
          if (resolvedCover) {
            thumbWrapHtml = `
              <div class="post-card-img-wrap" style="background-color: ${mutedColor}; aspect-ratio: 16 / 9;">
                <div class="post-card-img-ambient" style="background-image: url('${escapeHtml(resolvedCover)}');"></div>
                <img src="${escapeHtml(resolvedCover)}" alt="" class="post-card-img" loading="lazy" onerror="if(this.parentElement) this.parentElement.style.display='none';">
              </div>
            `;
          } else {
            thumbWrapHtml = `
              <div class="post-card-img-wrap post-card-fallback-wrap" style="background-color: ${mutedColor}; aspect-ratio: 16 / 9;">
                <div class="post-card-fallback-glow"></div>
                <div class="post-card-fallback-glyph">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    <line x1="9" y1="7" x2="15" y2="7"/>
                    <line x1="9" y1="11" x2="13" y2="11"/>
                  </svg>
                </div>
              </div>
            `;
          }
        }

        const categoryEyebrowHtml = '';

        let cardAvatar = authAvatar;
        if (cardAvatar && !/^(https?:|data:|blob:|\/)/i.test(cardAvatar)) {
          cardAvatar = '/' + cardAvatar;
        }
        const avatarImgHtml = cardAvatar
          ? `<img src="${escapeHtml(cardAvatar)}" alt="${escapeHtml(authName)}" class="post-card-author-avatar" onerror="this.style.display='none';">`
          : '';

        const starBadge = (p.starred || p.featured || p.isFeatured)
          ? `<span class="post-card-star-badge" title="Featured Story" style="display: inline-flex; align-items: center; color: #f59e0b; margin-right: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>`
          : '';

        const metaRowHtml = showMeta
          ? `
            <div class="post-card-meta">
              ${starBadge}
              <span class="post-card-author" style="cursor: pointer;" onclick="event.stopPropagation(); event.preventDefault(); if (window.navigateTo) window.navigateTo('#/author/' + encodeURIComponent('${escapeHtml(authName)}')); else window.location.hash='#/author/' + encodeURIComponent('${escapeHtml(authName)}');">${avatarImgHtml}By <span style="text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(authName)}</span></span>
              <span>&bull;</span>
              <time>${dateDisplay}</time>
              ${readTime ? `<span>&bull;</span><span>${readTime}</span>` : ''}
            </div>
          `
          : (starBadge ? `<div class="post-card-meta">${starBadge}</div>` : '');

        const descText = (p.subtitle || p.customDesc || '').trim() ||
          extractPlainExcerpt(p.markdown || p.content || p.proseHtml || '', 115);

        const descHtml = showExcerpt && descText
          ? `<p class="post-card-desc">${escapeHtml(descText)}</p>`
          : '';

        const cardLayoutClass = layoutStyle === 'horizontal' ? 'layout-horizontal' : '';
        const indexAttr = (fCfg.index !== undefined && fCfg.index !== null) ? ` data-index="${fCfg.index}"` : '';

        if (!resolvedCover) {
          const titleStr = String(p.title || 'Untitled Post').trim();
          const subStr = (showExcerpt && descText) ? String(descText).trim() : '';
          const titleRows = Math.min(2, Math.max(1, Math.ceil(titleStr.length / 18)));
          const subRows = subStr ? Math.min(3, Math.max(1, Math.ceil(subStr.length / 32))) : 0;
          const totalRows = titleRows + subRows;
          const maxRowChars = Math.max(Math.min(titleStr.length, 20) * 1.35, Math.min(subStr.length, 34));
          const padX = Math.min(3.1, Math.max(1.65, 1.2 + maxRowChars * 0.048)).toFixed(2);
          const padY = Math.min(1.9, Math.max(0.9, 0.58 + totalRows * 0.25)).toFixed(2);
          const tiltDeg = (-4.2 / Math.sqrt(totalRows)).toFixed(2);

          const cfgDesign = (getConfig() && getConfig().design) || {};
          const swooshType = cfgDesign.showcaseSwoosh || cfgDesign.backgroundSwoosh || 'jazz_cup';
          const swooshSvgHtml = buildShowcaseSwooshSvg(swooshType, p.id || p.slug || p.title, p);
          const clusterModeClass = subStr ? 'has-subtitle' : 'title-only';

          return `
            <a href="${window.buildPostUrl(p)}" class="post-card post-card-no-cover ${cardLayoutClass}"${indexAttr}>
              <div class="post-card-img-wrap post-card-showcase-wrap" style="aspect-ratio: 16 / 9;">
                <div class="post-card-showcase-cluster ${clusterModeClass}" data-rows="${totalRows}" style="--splash-pad-x: ${padX}rem; --splash-pad-y: ${padY}rem; --splash-tilt: ${tiltDeg}deg;">
                  ${swooshSvgHtml}
                  <div class="post-card-showcase-text">
                    ${categoryEyebrowHtml}
                    <h4 class="post-card-title post-card-showcase-title">${escapeHtml(p.title || 'Untitled Post')}</h4>
                    ${descHtml}
                  </div>
                </div>
              </div>
              <div class="post-card-body post-card-showcase-body">
                ${metaRowHtml}
              </div>
            </a>
          `;
        }

        return `
          <a href="${window.buildPostUrl(p)}" class="post-card ${cardLayoutClass}"${indexAttr}>
            ${thumbWrapHtml}
            <div class="post-card-body">
              ${categoryEyebrowHtml}
              <h4 class="post-card-title">${escapeHtml(p.title || 'Untitled Post')}</h4>
              ${metaRowHtml}
              ${descHtml}
            </div>
          </a>
        `;
      }

      const SWOOSH_CONCRETE_STYLES = ['jazz_cup', 'highlighter', 'comic_pop', 'aura_wash', 'arcade_neon'];

      function hashSwooshSeed(seedNum, keyStr, idx) {
        let h = ((Number(seedNum) || 133742) ^ 0x9e3779b9) >>> 0;
        const s = `${seedNum}::${keyStr}::${idx}`;
        for (let i = 0; i < s.length; i++) {
          h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b) >>> 0;
          h = (h ^ (h >>> 13)) >>> 0;
        }
        h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
      }

      function resolvePostSwooshAssignment(postOrKey, allPostsOpt, designCfgOpt) {
        const cfgDesign = designCfgOpt || (getConfig() && getConfig().design) || {};
        const rawMode = cfgDesign.showcaseSwoosh || cfgDesign.backgroundSwoosh || 'jazz_cup';
        const postObj = (postOrKey && typeof postOrKey === 'object') ? postOrKey : null;
        const postKey = postObj
          ? String(postObj.id || postObj.slug || postObj.title || 'post')
          : String(postOrKey || 'post');

        if (rawMode !== 'random') {
          return { style: rawMode, varSeed: postKey };
        }

        const seedNum = Number(cfgDesign.showcaseSwooshSeed) || 133742;
        const savedMap = (cfgDesign.showcaseSwooshMap && typeof cfgDesign.showcaseSwooshMap === 'object')
          ? cfgDesign.showcaseSwooshMap
          : null;

        if (savedMap) {
          const hit = savedMap[postKey] || (postObj && postObj.id && savedMap[String(postObj.id)]) || (postObj && postObj.slug && savedMap[String(postObj.slug)]);
          if (hit && SWOOSH_CONCRETE_STYLES.includes(hit.style)) {
            return { style: hit.style, varSeed: hit.varSeed || `${seedNum}:${postKey}` };
          }
        }

        const rawList = Array.isArray(allPostsOpt) ? allPostsOpt : (getDrafts() || []);
        const validPosts = rawList.filter(p => p && p.type !== 'page' && !p.isCategoryAggregate && !String(p.id || '').startsWith('page_'));
        const getPostKey = (item) => String(item?.id || item?.slug || item?.title || 'post');
        const getPostTime = (item) => {
          const t = new Date(item.publishedDate || item.date || item.publishedAt || item.createdAt || 0).getTime();
          if (!isNaN(t) && t > 0) return t;
          return Number(item.publishedAt || item.createdAt || 0) || 0;
        };

        const sorted = [...validPosts].sort((a, b) => {
          const tA = getPostTime(a);
          const tB = getPostTime(b);
          if (tA !== tB) return tA - tB;
          const cA = Number(a.createdAt || 0);
          const cB = Number(b.createdAt || 0);
          if (cA !== cB) return cA - cB;
          return getPostKey(a).localeCompare(getPostKey(b));
        });

        const recentAll = [];
        const recentNoCover = [];
        let matched = null;

        sorted.forEach((p, idx) => {
          const key = getPostKey(p);
          const hasCover = Boolean((p.coverImage || p.featuredImage || p.heroImage || p.banner || p.image || '').trim());
          const hasNoCover = !hasCover;
          const preserved = savedMap && (savedMap[key] || (p.id && savedMap[String(p.id)]) || (p.slug && savedMap[String(p.slug)]));

          let chosenStyle = '';
          let varSeed = '';

          if (preserved && SWOOSH_CONCRETE_STYLES.includes(preserved.style)) {
            chosenStyle = preserved.style;
            varSeed = preserved.varSeed || `${seedNum}:${key}:${idx}`;
          } else {
            let eligible = SWOOSH_CONCRETE_STYLES.filter(st => {
              if (recentAll.includes(st)) return false;
              if (hasNoCover && recentNoCover.includes(st)) return false;
              return true;
            });
            if (eligible.length === 0) {
              eligible = SWOOSH_CONCRETE_STYLES.filter(st => !recentAll.includes(st));
            }
            if (eligible.length === 0) {
              eligible = SWOOSH_CONCRETE_STYLES.slice();
            }
            const h = hashSwooshSeed(seedNum, key, idx);
            chosenStyle = eligible[h % eligible.length];
            varSeed = `${seedNum}:${key}:${h}`;
          }

          recentAll.push(chosenStyle);
          if (recentAll.length > 2) recentAll.shift();
          if (hasNoCover) {
            recentNoCover.push(chosenStyle);
            if (recentNoCover.length > 2) recentNoCover.shift();
          }

          if (
            key === postKey ||
            (postObj && postObj.id && String(p.id) === String(postObj.id)) ||
            (postObj && postObj.slug && String(p.slug) === String(postObj.slug)) ||
            String(p.id) === postKey ||
            String(p.slug) === postKey
          ) {
            matched = { style: chosenStyle, varSeed };
          }
        });

        if (matched) return matched;
        const fallbackH = hashSwooshSeed(seedNum, postKey, 0);
        return {
          style: SWOOSH_CONCRETE_STYLES[fallbackH % SWOOSH_CONCRETE_STYLES.length],
          varSeed: `${seedNum}:${postKey}:${fallbackH}`
        };
      }
      window.resolvePostSwooshAssignment = resolvePostSwooshAssignment;

      function buildShowcaseSwooshSvg(swooshType, seed, postObj) {
        let type = swooshType || 'jazz_cup';
        let effSeed = seed;
        if (type === 'random') {
          const resolved = resolvePostSwooshAssignment(postObj || seed);
          type = resolved.style || 'jazz_cup';
          effSeed = resolved.varSeed || seed;
        }
        let hash = 0;
        const s = String(effSeed || 'cedar');
        for (let i = 0; i < s.length; i++) {
          hash = ((hash << 5) - hash) + s.charCodeAt(i);
          hash |= 0;
        }
        const v = Math.abs(hash) % 4;

        if (type === 'highlighter') {
          const vars = [
            // Var 0: Twin angled chisel marker passes + overlapping accent slash
            `<g class="splash-brush-base">
              <polygon points="18,46 392,24 408,76 4,98" />
              <polygon points="10,92 414,68 398,136 28,154" />
            </g>
            <g class="splash-brush-accent">
              <path d="M22,88 L396,62" fill="none" stroke-width="18" stroke-linecap="square" />
              <path d="M44,126 L372,104" fill="none" stroke-width="8" stroke-linecap="square" opacity="0.65" />
            </g>`,
            // Var 1: Three staggered chisel-tip highlighter bands + double underline accent
            `<g class="splash-brush-base">
              <polygon points="26,32 378,20 390,62 14,74" />
              <polygon points="6,72 412,56 402,106 18,120" />
              <polygon points="36,114 388,98 376,148 24,160" />
            </g>
            <g class="splash-brush-accent">
              <path d="M18,74 L402,54" fill="none" stroke-width="14" stroke-linecap="square" />
              <path d="M38,132 L380,114" fill="none" stroke-width="10" stroke-linecap="square" opacity="0.7" />
            </g>`,
            // Var 2: Wide notched marker block + dual offset neon rails
            `<g class="splash-brush-base">
              <polygon points="8,42 406,18 394,88 414,96 396,152 16,164 28,104 4,94" />
            </g>
            <g class="splash-brush-accent">
              <path d="M14,66 L398,42" fill="none" stroke-width="15" stroke-linecap="square" />
              <path d="M24,118 L386,96" fill="none" stroke-width="12" stroke-linecap="square" opacity="0.6" />
            </g>`,
            // Var 3: Z-swipe connected chisel strokes + diagonal accent cut
            `<g class="splash-brush-base">
              <polygon points="12,36 398,22 410,66 24,82" />
              <polygon points="390,54 38,118 20,156 404,96" />
              <polygon points="18,114 412,96 398,154 8,166" />
            </g>
            <g class="splash-brush-accent">
              <path d="M26,58 L392,42 L34,132 L396,118" fill="none" stroke-width="12" stroke-linecap=" butt" stroke-linejoin="bevel" />
            </g>`
          ];
          return `<svg class="post-card-showcase-splash" data-swoosh="highlighter" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
        }

        if (type === 'comic_pop') {
          const vars = [
            // Var 0: Memphis skewed action badge + offset zig-zag + pop dots
            `<g class="splash-brush-base">
              <polygon points="24,34 398,18 412,138 8,158" />
              <circle cx="18" cy="24" r="6" /><circle cx="404" cy="154" r="7" /><circle cx="386" cy="164" r="4.5" />
            </g>
            <g class="splash-brush-accent">
              <polygon points="36,46 408,30 394,150 20,166" fill="none" stroke-width="6" stroke-linejoin="miter" />
              <path d="M28,96 L74,64 L112,110 L164,58 L208,108 L262,54 L308,106 L362,52 L398,88" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
            </g>`,
            // Var 1: Dynamic 12-point comic action burst + speed lines
            `<g class="splash-brush-base">
              <polygon points="8,88 38,54 22,26 114,40 168,14 236,36 312,14 348,42 408,24 388,78 416,124 354,138 372,166 278,148 212,170 148,146 62,168 78,132 10,140" />
            </g>
            <g class="splash-brush-accent">
              <path d="M34,76 L386,52 M28,112 L392,88 M56,138 L364,120" fill="none" stroke-width="9" stroke-linecap="round" />
            </g>`,
            // Var 2: Tilted zine tape strips + Memphis squiggle + triangles
            `<g class="splash-brush-base">
              <polygon points="10,52 384,22 406,96 28,128" />
              <polygon points="32,88 412,64 392,152 14,166" />
              <polygon points="396,18 414,32 390,38" />
              <polygon points="8,142 26,158 6,164" />
            </g>
            <g class="splash-brush-accent">
              <path d="M20,104 Q56,52 92,102 T164,98 T236,94 T308,90 T380,86" fill="none" stroke-width="13" stroke-linecap="round" />
            </g>`,
            // Var 3: Lightning-notched pop banner + offset frame
            `<g class="splash-brush-base">
              <polygon points="16,28 408,22 384,84 414,96 392,158 10,162 36,98 6,86" />
            </g>
            <g class="splash-brush-accent">
              <polyline points="28,44 394,38 372,88 398,98 380,146 24,150" fill="none" stroke-width="8" />
              <path d="M42,88 L378,72" fill="none" stroke-width="14" stroke-linecap="round" opacity="0.7" />
            </g>`
          ];
          return `<svg class="post-card-showcase-splash" data-swoosh="comic_pop" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
        }

        if (type === 'aura_wash') {
          const vars = [
            // Var 0: Twin organic cloud waves + flowing silk calligraphy wave + pearls
            `<g class="splash-brush-base">
              <path d="M16,96 C10,50 68,20 142,32 C196,12 278,14 328,36 C384,26 418,62 408,104 C416,144 362,168 298,154 C238,172 152,170 98,150 C38,164 4,132 16,96 Z" />
              <circle cx="24" cy="34" r="6" /><circle cx="396" cy="28" r="5" /><circle cx="404" cy="152" r="6.5" />
            </g>
            <g class="splash-brush-accent">
              <path d="M18,102 C82,42 154,142 224,82 C288,28 346,128 404,72" fill="none" stroke-width="14" stroke-linecap="round" />
              <path d="M32,122 C96,68 166,156 236,102 C298,52 354,140 396,94" fill="none" stroke-width="6" stroke-linecap="round" opacity="0.6" />
            </g>`,
            // Var 1: Billowing 3-lobe watercolor splash + looping ribbon
            `<g class="splash-brush-base">
              <path d="M8,84 C14,34 88,16 164,34 C224,10 318,16 378,44 C420,64 416,126 372,148 C312,174 218,166 154,148 C82,168 12,142 8,84 Z" />
              <circle cx="392" cy="30" r="7" /><circle cx="18" cy="148" r="5.5" />
            </g>
            <g class="splash-brush-accent">
              <path d="M22,78 C94,134 172,26 248,88 C312,140 364,48 402,84" fill="none" stroke-width="15" stroke-linecap="round" />
            </g>`,
            // Var 2: Sweeping tidal wash + dual harmonic sine ripples
            `<g class="splash-brush-base">
              <path d="M12,112 C28,54 112,18 208,26 C298,14 392,32 412,82 C422,128 352,166 258,158 C162,172 48,164 12,112 Z" />
              <circle cx="44" cy="32" r="5" /><circle cx="378" cy="158" r="6" />
            </g>
            <g class="splash-brush-accent">
              <path d="M16,86 Q114,32 210,86 T404,86" fill="none" stroke-width="13" stroke-linecap="round" />
              <path d="M24,116 Q118,64 214,116 T396,116" fill="none" stroke-width="7" stroke-linecap="round" opacity="0.65" />
            </g>`,
            // Var 3: Asymmetric overlapping pebble-wash clouds + S-curve thread
            `<g class="splash-brush-base">
              <path d="M20,68 C36,22 132,14 218,32 C304,12 404,34 410,92 C414,146 326,170 232,154 C138,172 28,152 10,104 C4,86 12,78 20,68 Z" />
            </g>
            <g class="splash-brush-accent">
              <path d="M20,118 C112,28 298,154 398,56" fill="none" stroke-width="16" stroke-linecap="round" />
              <path d="M42,64 C138,148 286,28 384,116" fill="none" stroke-width="6" stroke-linecap="round" opacity="0.55" />
            </g>`
          ];
          return `<svg class="post-card-showcase-splash" data-swoosh="aura_wash" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
        }

        if (type === 'arcade_neon') {
          const vars = [
            // Var 0: Skewed cyber speed-louvers + synth laser pulse + star sparkles
            `<g class="splash-brush-base">
              <polygon points="28,28 408,16 386,62 6,74" />
              <polygon points="18,78 398,66 376,112 4,124" />
              <polygon points="34,128 412,116 392,158 14,168" />
            </g>
            <g class="splash-brush-accent">
              <polyline points="12,114 96,52 134,108 238,34 276,98 378,28 408,64" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <polyline points="26,134 108,74 146,126 250,56 286,116 392,48" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7" />
            </g>`,
            // Var 1: Stepped retro-horizon slash bars + geometric chevron beam
            `<g class="splash-brush-base">
              <polygon points="12,36 396,18 412,56 28,74" />
              <polygon points="6,82 406,64 392,108 18,126" />
              <polygon points="24,132 414,114 398,156 10,168" />
            </g>
            <g class="splash-brush-accent">
              <polyline points="16,96 210,32 404,96" fill="none" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
              <polyline points="36,128 210,68 384,128" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.65" />
            </g>`,
            // Var 2: Twin cassette-stripe wings + synthwave frequency pulse
            `<g class="splash-brush-base">
              <polygon points="8,44 412,22 392,92 18,114" />
              <polygon points="22,98 406,76 384,154 6,168" />
            </g>
            <g class="splash-brush-accent">
              <polyline points="10,94 78,94 106,36 142,146 178,44 214,134 248,54 282,124 316,78 410,78" fill="none" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
            </g>`,
            // Var 3: Perspective speed rails + dual offset laser streaks
            `<g class="splash-brush-base">
              <polygon points="36,24 414,24 382,72 4,72" />
              <polygon points="20,78 398,78 366,126 6,126" />
              <polygon points="44,132 410,132 384,164 18,164" />
            </g>
            <g class="splash-brush-accent">
              <path d="M10,136 L406,36" fill="none" stroke-width="15" stroke-linecap="round" />
              <path d="M24,158 L414,62" fill="none" stroke-width="7" stroke-linecap="round" opacity="0.7" />
            </g>`
          ];
          return `<svg class="post-card-showcase-splash" data-swoosh="arcade_neon" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
        }

        // Default: 'jazz_cup' ("90s Cup") — 4 variations
        const jazzVars = [
          // Var 0: Classic upward-right 4-stroke sweep + triple-peak zig-zag ribbon
          `<g class="splash-brush-base">
            <path d="M8,136 C48,88 106,42 162,18 C178,11 190,19 178,32 C142,68 92,116 44,158 C24,174 2,154 8,136 Z" />
            <path d="M52,164 C118,108 198,52 284,16 C304,8 318,20 300,36 C234,88 158,138 88,178 C64,190 36,178 52,164 Z" />
            <path d="M138,168 C210,122 292,72 378,34 C398,25 412,39 392,54 C324,102 246,144 174,180 C150,190 122,180 138,168 Z" />
            <path d="M236,162 C292,128 352,94 404,68 C418,61 422,75 408,86 C362,118 308,148 262,172 C244,180 222,170 236,162 Z" />
            <circle cx="188" cy="18" r="5" /><circle cx="312" cy="22" r="6" /><circle cx="398" cy="36" r="4.5" /><circle cx="28" cy="158" r="5.5" /><circle cx="118" cy="176" r="4.5" />
          </g>
          <g class="splash-brush-accent">
            <path d="M16,120 C54,82 88,48 108,44 C120,42 96,102 110,108 C126,114 196,42 228,36 C242,33 214,94 230,100 C248,106 318,40 350,36 C364,34 336,86 352,92 C368,98 394,68 412,56" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M36,132 C72,98 100,68 116,64 C126,62 108,112 122,116 C138,120 206,58 234,52 C246,50 224,104 238,108 C254,112 322,56 352,52" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.65" />
          </g>`,
          // Var 1: Wide fanned 3-stroke sweep + double-crest wave ribbon
          `<g class="splash-brush-base">
            <path d="M6,124 C64,74 138,32 212,14 C232,9 244,22 224,36 C162,78 96,122 36,156 C14,168 -4,142 6,124 Z" />
            <path d="M64,162 C144,104 236,48 334,18 C356,11 368,26 346,42 C264,96 178,144 98,178 C72,188 46,176 64,162 Z" />
            <path d="M168,170 C244,126 326,80 402,44 C418,36 424,52 406,66 C342,110 268,148 198,180 C176,188 152,180 168,170 Z" />
            <circle cx="242" cy="18" r="5.5" /><circle cx="364" cy="24" r="5" /><circle cx="48" cy="166" r="6" />
          </g>
          <g class="splash-brush-accent">
            <path d="M12,108 C68,52 124,32 146,38 C164,44 132,112 154,116 C178,120 262,34 298,32 C316,30 288,102 310,106 C332,110 382,64 410,48" fill="none" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M28,126 C82,74 132,54 152,58 C168,62 144,122 164,126 C186,130 268,52 302,50" fill="none" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" />
          </g>`,
          // Var 2: Staggered 4-blade slash + 4-peak lightning jazz ribbon
          `<g class="splash-brush-base">
            <path d="M12,148 C58,96 118,46 178,18 C194,10 206,20 192,34 C148,74 96,124 46,166 C26,180 4,164 12,148 Z" />
            <path d="M78,154 C138,100 212,48 292,16 C310,9 322,22 304,36 C242,84 174,132 110,170 C88,182 62,168 78,154 Z" />
            <path d="M154,168 C222,118 302,66 384,28 C402,20 414,34 396,48 C332,96 258,142 188,178 C166,188 138,180 154,168 Z" />
            <path d="M252,166 C306,130 362,92 408,62 C420,54 424,68 410,80 C370,114 318,146 276,174 C258,184 238,176 252,166 Z" />
            <circle cx="204" cy="16" r="5" /><circle cx="322" cy="18" r="5.5" /><circle cx="96" cy="176" r="5" />
          </g>
          <g class="splash-brush-accent">
            <path d="M14,126 C46,84 76,48 92,46 C104,44 84,98 96,102 C110,106 162,42 184,38 C196,36 176,94 190,98 C204,102 262,38 286,34 C298,32 278,88 292,92 C308,96 368,42 408,36" fill="none" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" />
          </g>`,
          // Var 3: Twin sweeping brush wings + central bridge + S-curve ribbon
          `<g class="splash-brush-base">
            <path d="M4,132 C56,82 124,36 196,16 C216,10 228,24 208,38 C152,78 92,122 38,160 C18,174 -6,150 4,132 Z" />
            <path d="M68,166 C148,112 242,56 344,20 C366,12 380,26 358,42 C274,98 184,146 104,180 C78,190 50,178 68,166 Z" />
            <path d="M184,164 C256,122 336,78 406,46 C420,39 424,54 408,66 C348,106 278,144 212,176 C192,184 168,174 184,164 Z" />
            <circle cx="226" cy="18" r="6" /><circle cx="376" cy="26" r="5" /><circle cx="144" cy="178" r="5" />
          </g>
          <g class="splash-brush-accent">
            <path d="M18,114 C74,56 136,36 162,44 C184,50 156,112 182,116 C210,120 292,36 336,34 C358,33 338,92 362,94 C382,96 402,72 414,58" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M34,130 C88,76 144,56 168,62 C188,68 164,124 188,128 C214,132 296,54 338,52" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" />
          </g>`
        ];
        return `<svg class="post-card-showcase-splash" data-swoosh="jazz_cup" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${jazzVars[v]}</svg>`;
      }
      window.buildShowcaseSwooshSvg = buildShowcaseSwooshSvg;

      function matchPostToCategory(p, cat) {
        if (typeof window.postMatchesCategory === 'function') {
          return window.postMatchesCategory(p, cat);
        }
        if (!p || !cat) return false;
        const norm = String(cat).trim().toLowerCase();
        if (norm === 'all' || norm === 'all posts' || norm === 'all-posts' || norm === 'page_all') return true;
        const target = norm.replace(/-/g, ' ');
        const targetSlug = norm.replace(/\s+/g, '-');
        const check = v => {
          if (!v) return false;
          const s = String(v).trim().toLowerCase();
          return s === target || s.replace(/\s+/g, '-') === targetSlug || s.replace(/-/g, ' ') === target;
        };
        return check(p.tag) || (Array.isArray(p.categories) && p.categories.some(check));
      }

      function resolveFeaturedPost(publishedPosts, homeBlocks) {
        const design = getConfig().design || {};
        if (design.featured === false) return null;
        const spotlightBlock = (homeBlocks || []).find(b => b.type === 'spotlight' && b.enabled !== false);
        if (!spotlightBlock || !Array.isArray(publishedPosts) || publishedPosts.length === 0) {
          return null;
        }

        const validCandidates = publishedPosts.filter(p => p && p.type !== 'page' && !p.isCategoryAggregate && !String(p.id).startsWith('page_'));
        if (validCandidates.length === 0) {
          return null;
        }

        const sorted = [...validCandidates].sort((a, b) => {
          const tB = new Date(b.publishedDate || b.date || b.createdAt || 0).getTime() || 0;
          const tA = new Date(a.publishedDate || a.date || a.createdAt || 0).getTime() || 0;
          if (tB !== tA) return tB - tA;
          return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        });

        const pCfg = spotlightBlock.config || {};
        const rawMode = design.featuredMode || pCfg.featuredMode || 'latest';
        const mode = (rawMode === 'category') ? 'category' : 'latest';

        if (mode === 'category') {
          const validCats = (getConfig().categories || [])
            .map(c => typeof c === 'object' ? (c.name || c.title || '') : String(c))
            .map(s => s.trim())
            .filter(s => s && s.toLowerCase() !== 'uncategorized' && s.toLowerCase() !== 'posts');
          const targetCat = (design.featuredCategory || pCfg.featuredCategory || validCats[0] || '').trim();
          if (!targetCat) return null;
          return sorted.find(p => matchPostToCategory(p, targetCat)) || null;
        }

        // Default: 'latest' (All - Recent: newest published post from all posts)
        return sorted[0] || null;
      }

      function renderHomePostsGrid(publishedPosts, homeBlocks) {
        const feedBlock = homeBlocks.find(b => b.type === 'post_feed');
        const gridEl = document.getElementById('posts-grid');
        if (!gridEl) return;

        const fCfg = (feedBlock && feedBlock.config) || {};
        const cols = fCfg.cols || 2;
        const limit = fCfg.limit || 4;

        gridEl.className = `posts-grid cols-${cols}`;

        let eligiblePosts = [...publishedPosts];
        const spotlightSec = document.getElementById('section-spotlight');
        const spotlightBlock = (homeBlocks || []).find(b => b.type === 'spotlight' && b.enabled !== false);
        const designCfg = (getConfig().design) || {};
        const isSpotlightActive = Boolean(spotlightBlock && designCfg.featured !== false);

        // Featured post in Spotlight must never appear in Recent Posts when Spotlight is showing
        const featuredPost = isSpotlightActive ? resolveFeaturedPost(publishedPosts, homeBlocks) : null;
        if (featuredPost) {
          eligiblePosts = publishedPosts.filter(p => {
            if (p === featuredPost) return false;
            if (featuredPost.id && p.id && String(p.id) === String(featuredPost.id)) return false;
            if (featuredPost.slug && p.slug && String(p.slug) === String(featuredPost.slug)) return false;
            if (featuredPost.title && p.title && String(p.title) === String(featuredPost.title)) return false;
            return true;
          });
        }
        eligiblePosts.sort((a, b) => new Date(b.publishedDate || b.date || 0) - new Date(a.publishedDate || a.date || 0));

        let filteredPosts = eligiblePosts;
        if (activeCategoryFilter !== 'ALL') {
          filteredPosts = publishedPosts.filter(p => matchPostToCategory(p, activeCategoryFilter));
        } else if (!isSpotlightActive || (!spotlightSec || spotlightSec.style.display === 'none')) {
          filteredPosts = publishedPosts;
        }

        const countEl = document.getElementById('grid-post-count');
        if (countEl) {
          countEl.textContent = '';
        }

        const postsToShow = filteredPosts.slice(0, limit);
        if (postsToShow.length === 0) {
          let emptyTitle = 'No posts yet.';
          let emptySub = 'Posts created in Cedar will appear here.';
          if (activeCategoryFilter !== 'ALL') {
            emptyTitle = 'No posts found in this category.';
            emptySub = 'Try selecting another category or view all posts.';
          }
          gridEl.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 3rem 1rem; text-align: center; color: var(--text-dim);">
              ${emptyTitle ? `<p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">${emptyTitle}</p>` : ''}
              <span style="font-size: 0.92rem; color: var(--text-muted);">${emptySub}</span>
            </div>
          `;
        } else {
          gridEl.innerHTML = postsToShow.map(p => createPostCardHtml(p, fCfg)).join('');
        }
      }

      function renderSpotlightSlideHtml(featured, spotlightBlock) {
        const pCfg = (spotlightBlock && spotlightBlock.config) || {};
        const spotlightColor = getMutedCoverColor(featured.id || featured.slug || featured.title);
        const spotImgUrl = (typeof getPostFeaturedImage === 'function')
          ? getPostFeaturedImage(featured)
          : (typeof resolvePostImage === 'function' ? resolvePostImage(featured.coverImage || featured.featuredImage, featured) : '');

        const rawAuths = (Array.isArray(featured.authors) && featured.authors.length > 0)
          ? featured.authors
          : [featured.authorName || getConfig().defaultAuthor || 'Staff'];
        const authName = typeof window.formatAuthorsString === 'function' ? window.formatAuthorsString(rawAuths) : rawAuths.map(a => a?.name || a).join(', ');
        const authAvatar = (typeof getAuthorAvatar === 'function') ? getAuthorAvatar(rawAuths[0]) : '';
        let spotAvatar = authAvatar;
        if (spotAvatar && !/^(https?:|data:|blob:|\/)/i.test(spotAvatar)) {
          spotAvatar = '/' + spotAvatar;
        }
        const avatarImgHtml = spotAvatar
          ? `<img src="${escapeHtml(spotAvatar)}" alt="${escapeHtml(authName)}" class="post-card-author-avatar" onerror="this.style.display='none';">`
          : '';
        const formattedDate = formatDate(featured.publishedDate || featured.date) || '';
        const descText = featured.subtitle || featured.customDesc || (featured.markdown ? featured.markdown.slice(0, 180) + '...' : '');

        const customBadge = (pCfg.badgeText && pCfg.badgeText !== 'FEATURED STORY') ? pCfg.badgeText.trim() : '';
        const effectiveBadge = customBadge || 'Featured';

        const badgeHtml = (effectiveBadge && pCfg.showBadge !== false)
          ? `
            <div class="spotlight-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span>${escapeHtml(effectiveBadge)}</span>
            </div>
          `
          : '';

        if (!spotImgUrl) {
          const titleStr = String(featured.title || 'Untitled Post').trim();
          const rawSub = (featured.subtitle || featured.customDesc || '').trim() ||
            extractPlainExcerpt(featured.markdown || featured.content || featured.proseHtml || '', 140);
          const subStr = String(rawSub || '').trim();
          const titleRows = Math.min(2, Math.max(1, Math.ceil(titleStr.length / 18)));
          const subRows = subStr ? Math.min(3, Math.max(1, Math.ceil(subStr.length / 32))) : 0;
          const totalRows = titleRows + subRows;
          const maxRowChars = Math.max(Math.min(titleStr.length, 20) * 1.35, Math.min(subStr.length, 34));
          const padX = Math.min(3.1, Math.max(1.65, 1.2 + maxRowChars * 0.048)).toFixed(2);
          const padY = Math.min(1.9, Math.max(0.9, 0.58 + totalRows * 0.25)).toFixed(2);
          const tiltDeg = (-4.2 / Math.sqrt(totalRows)).toFixed(2);

          const cfgDesign = (getConfig() && getConfig().design) || {};
          const swooshType = cfgDesign.showcaseSwoosh || cfgDesign.backgroundSwoosh || 'jazz_cup';
          const swooshSvgHtml = buildShowcaseSwooshSvg(swooshType, featured.id || featured.slug || featured.title, featured);
          const spotDescHtml = subStr ? `<p class="post-card-desc">${escapeHtml(subStr)}</p>` : '';
          const readTime = calcReadTime(featured.markdown || featured.proseHtml || featured.html || '');
          const clusterModeClass = subStr ? 'has-subtitle' : 'title-only';

          return `
            <a href="${window.buildPostUrl(featured)}" class="spotlight-carousel-slide post-card-no-cover spotlight-no-cover">
              <div class="spotlight-img-wrap post-card-img-wrap post-card-showcase-wrap" style="aspect-ratio: 16 / 9;">
                <div class="post-card-showcase-cluster ${clusterModeClass}" data-rows="${totalRows}" style="--splash-pad-x: ${padX}rem; --splash-pad-y: ${padY}rem; --splash-tilt: ${tiltDeg}deg;">
                  ${swooshSvgHtml}
                  <div class="post-card-showcase-text">
                    <h2 class="spotlight-title post-card-title post-card-showcase-title">${escapeHtml(featured.title || 'Untitled Post')}</h2>
                    ${spotDescHtml}
                  </div>
                </div>
              </div>
              ${badgeHtml}
              <div class="spotlight-meta">
                <span class="spotlight-author" style="cursor: pointer; display: inline-flex; align-items: center;" onclick="event.stopPropagation(); event.preventDefault(); if (window.navigateTo) window.navigateTo('#/author/' + encodeURIComponent('${escapeHtml(authName)}')); else window.location.hash='#/author/' + encodeURIComponent('${escapeHtml(authName)}');">${avatarImgHtml}By <span style="text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(authName)}</span></span>
                <span class="spotlight-sep">&bull;</span>
                <time class="spotlight-date">${escapeHtml(formattedDate)}</time>
                ${readTime ? `<span class="spotlight-sep">&bull;</span><span>${readTime}</span>` : ''}
              </div>
            </a>
          `;
        }

        const imgWrapHtml = `
          <div class="spotlight-img-wrap" style="background-color: ${spotlightColor}; aspect-ratio: 16 / 9;">
            <div class="spotlight-img-ambient" style="background-image: url('${escapeHtml(spotImgUrl)}');"></div>
            <img src="${escapeHtml(spotImgUrl)}" alt="" class="spotlight-img" onerror="this.parentElement.style.display='none';">
          </div>
        `;

        return `
          <a href="${window.buildPostUrl(featured)}" class="spotlight-carousel-slide">
            ${imgWrapHtml}
            ${badgeHtml}
            <h2 class="spotlight-title">${escapeHtml(featured.title || 'Untitled Post')}</h2>
            <div class="spotlight-meta">
              <span class="spotlight-author" style="cursor: pointer; display: inline-flex; align-items: center;" onclick="event.stopPropagation(); event.preventDefault(); if (window.navigateTo) window.navigateTo('#/author/' + encodeURIComponent('${escapeHtml(authName)}')); else window.location.hash='#/author/' + encodeURIComponent('${escapeHtml(authName)}');">${avatarImgHtml}By <span style="text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(authName)}</span></span>
              <span class="spotlight-sep">&bull;</span>
              <time class="spotlight-date">${escapeHtml(formattedDate)}</time>
            </div>
            ${descText ? `<p class="spotlight-desc">${escapeHtml(descText)}</p>` : ''}
          </a>
        `;
      }

      // Render Home View
      function renderHome(options = {}) {
        const vHome = document.getElementById('view-home');
        const wasHomeActive = Boolean(vHome && vHome.style.display === 'block');
        const prevScrollY = (typeof options.scrollY === 'number')
          ? options.scrollY
          : (window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || (document.body ? document.body.scrollTop : 0) || 0);

        document.body.classList.remove('is-links-page');
        document.documentElement.classList.remove('is-links-page');
        if (vHome) vHome.style.display = 'block';
        const vPosts = document.getElementById('view-posts');
        if (vPosts) vPosts.style.display = 'none';
        const vReader = document.getElementById('view-reader');
        if (vReader) vReader.style.display = 'none';
        const vNotes = document.getElementById('view-notes');
        if (vNotes) vNotes.style.display = 'none';
        const vSingleNote = document.getElementById('view-note-single');
        if (vSingleNote) vSingleNote.style.display = 'none';
        const vAuthor = document.getElementById('view-author');
        if (vAuthor) vAuthor.style.display = 'none';

        // Only scroll to top if transitioning to home from another view
        if (!wasHomeActive && !options.preserveScroll) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }

        updateNavLinks('home');

        const isLinks = (d) => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData));
        const publishedPosts = getDrafts().filter(d => (d.type === 'post' || !d.type) && d.type !== 'page' && d.type !== 'note' && d.status === 'published' && !d.hidden && !d.retired && !d.isCategoryAggregate && !String(d.id).startsWith('page_') && !isLinks(d));
        const pages = getDrafts().filter(d => (d.type === 'page' || isLinks(d)) && !d.hidden && !d.retired && d.slug !== 'about-cedar' && d.id !== 'page_about_cedar');
        const authors = (getConfig().authors || []).filter(a => typeof a === 'object' ? !a.retired : true);
        const designCfg = getConfig().design || {};
        const rawHomeBlocks = designCfg.homeBlocks || [];
        const homeBlocks = rawHomeBlocks.filter(b => {
          if (!b || b.enabled === false) return false;
          if (b.type === 'authors' && designCfg.authorBar !== true) return false;
          if (b.type === 'spotlight' && designCfg.featured === false) return false;
          if (b.type === 'categories_shelf' && designCfg.categoryBar === false) return false;
          return true;
        });

        if (!homeBlocks.some(b => b.type === 'spotlight') && designCfg.featured !== false && !rawHomeBlocks.some(b => b && b.type === 'spotlight' && b.enabled === false)) {
          homeBlocks.push({ id: 'b_spotlight', type: 'spotlight', x: 320, y: 64, w: 1280, h: 256, stretchWidth: false, enabled: true, config: {} });
        }

        if (!homeBlocks.some(b => b.type === 'categories_shelf') && designCfg.categoryBar !== false) {
          homeBlocks.push({ id: 'b_categories', type: 'categories_shelf', x: 320, y: 320, w: 1280, h: 80, enabled: true, config: { title: 'Category' } });
        }

        if (!homeBlocks.some(b => b.type === 'post_feed') && !rawHomeBlocks.some(b => b && b.type === 'post_feed' && b.enabled === false)) {
          homeBlocks.push({ id: 'b_feed', type: 'post_feed', x: 320, y: 400, w: 1280, h: 384, stretchWidth: false, enabled: true, config: { title: 'Recent Posts', limit: 6, cols: 2, layoutStyle: 'vertical' } });
        }

        // 1. Designer Hero Beacon Banner Block
        const heroSection = document.getElementById('section-hero-beacon');
        const heroBlock = homeBlocks.find(b => b.type === 'hero_beacon');
        if (heroSection) {
          if (heroBlock) {
            heroSection.style.display = 'block';
            const bCfg = heroBlock.config || {};
            const bTitle = (bCfg.title && bCfg.title !== '[Main Hero Headline / Welcome Message]')
              ? bCfg.title
              : 'Welcome to Cedar';
            const bSub = (bCfg.sub && !bCfg.sub.includes('— Describe your publication') && !bCfg.sub.includes('Dispatches, essays'))
              ? bCfg.sub
              : '';
            const bBtn = (bCfg.buttonText && bCfg.buttonText !== '[Call to Action Button →]')
              ? bCfg.buttonText
              : 'Explore Articles →';

            const titleEl = document.getElementById('hero-beacon-title');
            if (titleEl) titleEl.textContent = bTitle;
            const subEl = document.getElementById('hero-beacon-sub');
            if (subEl) subEl.textContent = bSub;
            const btnEl = document.getElementById('hero-beacon-btn');
            if (btnEl) btnEl.innerHTML = escapeHtml(bBtn).replace('&amp;rarr;', '&rarr;');

            const containerEl = document.getElementById('hero-beacon-container');
            if (containerEl) {
              if (heroBlock.stretchWidth) {
                containerEl.style.maxWidth = '100%';
                containerEl.style.padding = '0';
                const cardEl = document.getElementById('hero-beacon-card');
                if (cardEl) {
                  cardEl.style.borderRadius = '0';
                  cardEl.style.borderLeft = 'none';
                  cardEl.style.borderRight = 'none';
                }
              } else {
                containerEl.style.maxWidth = '';
                containerEl.style.padding = '';
                const cardEl = document.getElementById('hero-beacon-card');
                if (cardEl) {
                  cardEl.style.borderRadius = '';
                  cardEl.style.border = '';
                  cardEl.style.borderLeft = '';
                  cardEl.style.borderRight = '';
                }
              }
            }
            const hAlign = heroBlock.align || (heroBlock.config && heroBlock.config.align) || 'left';
            const hCardEl = document.getElementById('hero-beacon-card');
            if (hCardEl) {
              hCardEl.style.textAlign = hAlign;
              hCardEl.style.alignItems = hAlign === 'center' ? 'center' : (hAlign === 'right' ? 'flex-end' : 'flex-start');
            }
          } else {
            heroSection.style.display = 'none';
          }
        }

        // 2. Spotlight Block (Single Featured Post based on Featured Logic: 'manual' | 'latest' | 'category')
        if (window._spotlightCarouselTimer) {
          clearInterval(window._spotlightCarouselTimer);
          window._spotlightCarouselTimer = null;
        }
        const spotlightSec = document.getElementById('section-spotlight');
        const spotlightBlock = homeBlocks.find(b => b.type === 'spotlight');
        if (spotlightSec) {
          const featuredPost = spotlightBlock ? resolveFeaturedPost(publishedPosts, homeBlocks) : null;
          if (spotlightBlock && featuredPost) {
            spotlightSec.style.display = 'block';
            const spotCont = document.getElementById('spotlight-container');
            const viewportEl = document.getElementById('spotlight-carousel-viewport');
            const trackEl = document.getElementById('spotlight-carousel-track');
            const navEl = document.getElementById('spotlight-carousel-nav');
            const spotCard = document.getElementById('spotlight-link');

            if (spotCard) spotCard.style.display = 'none';
            if (viewportEl) {
              viewportEl.style.display = 'block';
              viewportEl.onmouseenter = null;
              viewportEl.onmouseleave = null;
            }
            if (navEl) navEl.style.display = 'none';

            if (spotCont) {
              if (spotlightBlock.stretchWidth) {
                spotCont.style.maxWidth = '100%';
                spotCont.style.padding = '0';
                if (viewportEl) {
                  viewportEl.style.borderRadius = '0';
                  viewportEl.style.borderLeft = 'none';
                  viewportEl.style.borderRight = 'none';
                }
              } else {
                spotCont.style.maxWidth = '';
                spotCont.style.padding = '';
                if (viewportEl) {
                  viewportEl.style.borderRadius = '';
                  viewportEl.style.border = '';
                }
              }
            }

            if (trackEl) {
              trackEl.innerHTML = renderSpotlightSlideHtml(featuredPost, spotlightBlock);
              trackEl.style.transform = 'none';
            }
          } else {
            spotlightSec.style.display = 'none';
          }
        }

        // 3. Editorial Signage Block (Permanently disabled)
        const signSec = document.getElementById('section-signage');
        if (signSec) {
          signSec.style.display = 'none';
        }

        // 4. Media Showcase Block
        const mediaSec = document.getElementById('section-media-showcase');
        const mediaBlock = homeBlocks.find(b => b.type === 'media_showcase');
        if (mediaSec) {
          if (mediaBlock) {
            mediaSec.style.display = 'block';
            const mCfg = mediaBlock.config || {};
            const mImg = document.getElementById('media-showcase-img');
            const mCaption = document.getElementById('media-showcase-caption');
            const brandLogo = (getConfig().design && getConfig().design.branding && getConfig().design.branding.generalLogo) || 'logo.png';
            if (mImg) {
              mImg.src = window.resolveAssetUrl(mCfg.imageUrl || brandLogo);
              mImg.style.display = 'block';
            }
            if (mCaption) {
              mCaption.textContent = mCfg.caption || '[Media Showcase Caption / Image Description Placeholder]';
            }
            const mediaContainer = document.getElementById('media-showcase-container');
            if (mediaContainer) {
              if (mediaBlock.stretchWidth) {
                mediaContainer.style.maxWidth = '100%';
                mediaContainer.style.padding = '0';
              } else {
                mediaContainer.style.maxWidth = '';
                mediaContainer.style.padding = '';
              }
            }
          } else {
            mediaSec.style.display = 'none';
          }
        }

        // 5. Category Filter Shelf Block (Unified Feed Header Bar)
        const catBlock = homeBlocks.find(b => b.type === 'categories_shelf') || (designCfg.categoryBar !== false ? { type: 'categories_shelf', enabled: true } : null);
        const filterSection = document.getElementById('section-filters');
        if (filterSection) filterSection.style.display = 'none';

        const feedHeaderWrap = document.getElementById('feed-header-wrap');
        const feedCatWrap = document.getElementById('feed-header-categories');
        const filterBar = document.getElementById('category-filter-bar');
        const viewAllLink = document.getElementById('category-view-all-link');
        const feedActions = document.getElementById('feed-header-actions');
        if (viewAllLink) viewAllLink.style.display = 'none';
        if (feedActions) feedActions.style.display = 'none';

        if (feedCatWrap) {
          function syncCategoryViewAll() {
            if (!viewAllLink) return;
            if (activeCategoryFilter && activeCategoryFilter !== 'ALL') {
              const catSlug = encodeURIComponent(activeCategoryFilter.toLowerCase().replace(/\s+/g, '-'));
              const targetHref = typeof window.toPreviewUrl === 'function' ? window.toPreviewUrl('#/' + catSlug) : `/preview.html/${catSlug}`;
              viewAllLink.setAttribute('href', targetHref);
              viewAllLink.textContent = `View All ${activeCategoryFilter} \u2192`;
            } else {
              const targetHref = typeof window.toPreviewUrl === 'function' ? window.toPreviewUrl('#/blog') : '/preview.html/blog';
              viewAllLink.setAttribute('href', targetHref);
              viewAllLink.textContent = 'View All Posts \u2192';
            }
          }

          if (catBlock && publishedPosts.length > 0) {
            feedCatWrap.style.display = 'flex';

            if (filterBar) {
              let filterHtml = `
                <button type="button" class="filter-pill ${activeCategoryFilter === 'ALL' ? 'active' : ''}" data-cat="ALL">
                  <span>All Posts</span>
                </button>
              `;

              const configuredCats = (getConfig().categories || []).filter(c => {
                const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
                if (!val || val.toLowerCase() === 'uncategorized' || val.toLowerCase() === 'general') return false;
                if (isCategoryPageHidden(val)) return false;
                return true;
              }).map(c => typeof c === 'object' ? (c.name || c.title || '') : String(c));

              if (activeCategoryFilter !== 'ALL' && isCategoryPageHidden(activeCategoryFilter)) {
                activeCategoryFilter = 'ALL';
                window.activeCategoryFilter = 'ALL';
              }

              // Show strictly 1:1 what categories exist in projectConfig.categories (never harvest phantom categories)
              const orderedCats = [...configuredCats];

              if (orderedCats.length === 0) {
                feedCatWrap.style.display = 'none';
                if (feedHeaderWrap) {
                  const hasHeroOrFeatured = Boolean((spotlightBlock && spotlightSec && spotlightSec.style.display !== 'none') || (heroSection && heroSection.style.display !== 'none'));
                  if (hasHeroOrFeatured) {
                    feedHeaderWrap.style.display = 'block';
                    feedHeaderWrap.classList.add('divider-only');
                  } else {
                    feedHeaderWrap.style.display = 'none';
                    feedHeaderWrap.classList.remove('divider-only');
                  }
                }
                activeCategoryFilter = 'ALL';
                window.activeCategoryFilter = 'ALL';
                syncCategoryViewAll();
              } else {
                feedCatWrap.style.display = 'flex';
                if (feedHeaderWrap) {
                  feedHeaderWrap.style.display = 'flex';
                  feedHeaderWrap.classList.remove('divider-only');
                }

                orderedCats.forEach(cat => {
                  const isAct = (activeCategoryFilter || '').toLowerCase() === cat.toLowerCase();
                  filterHtml += `
                    <button type="button" class="filter-pill ${isAct ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
                      <span>${escapeHtml(cat)}</span>
                    </button>
                  `;
                });

                filterBar.innerHTML = filterHtml;
                filterBar.querySelectorAll('.filter-pill').forEach(btn => {
                  btn.addEventListener('click', () => {
                    activeCategoryFilter = btn.dataset.cat || 'ALL';
                    window.activeCategoryFilter = activeCategoryFilter;
                    filterBar.querySelectorAll('.filter-pill').forEach(b => {
                      const bCat = b.dataset.cat || 'ALL';
                      const isAct = (activeCategoryFilter === 'ALL' && bCat === 'ALL') ||
                                    (activeCategoryFilter !== 'ALL' && bCat.toLowerCase() === activeCategoryFilter.toLowerCase());
                      b.classList.toggle('active', isAct);
                    });
                    syncCategoryViewAll();
                    renderHomePostsGrid(publishedPosts, homeBlocks);
                  });
                });
                syncCategoryViewAll();
              }
            }
          } else {
            feedCatWrap.style.display = 'none';
            if (feedHeaderWrap) {
              const hasHeroOrFeatured = Boolean((spotlightBlock && spotlightSec && spotlightSec.style.display !== 'none') || (heroSection && heroSection.style.display !== 'none'));
              if (hasHeroOrFeatured) {
                feedHeaderWrap.style.display = 'block';
                feedHeaderWrap.classList.add('divider-only');
              } else {
                feedHeaderWrap.style.display = 'none';
                feedHeaderWrap.classList.remove('divider-only');
              }
            }
            syncCategoryViewAll();
          }
        }

        const hasHeroOrFeaturedNow = Boolean(
          (spotlightBlock && spotlightSec && spotlightSec.style.display !== 'none') ||
          (heroSection && heroSection.style.display !== 'none')
        );
        const isCatBarShowing = Boolean(
          feedHeaderWrap &&
          feedHeaderWrap.style.display !== 'none' &&
          !feedHeaderWrap.classList.contains('divider-only') &&
          feedCatWrap &&
          feedCatWrap.style.display !== 'none'
        );
        if (document.body) {
          document.body.classList.toggle('home-no-featured-with-cats', !hasHeroOrFeaturedNow && isCatBarShowing);
        }

        // 6. Recent Posts Feed Block
        const feedSec = document.getElementById('section-feed');
        const feedBlock = homeBlocks.find(b => b.type === 'post_feed');
        if (feedSec) {
          if (feedBlock) {
            feedSec.style.display = 'block';
            const feedContainer = document.getElementById('feed-container');
            if (feedContainer) {
              if (feedBlock.stretchWidth) {
                feedContainer.style.maxWidth = '100%';
                feedContainer.style.padding = '0';
              } else {
                feedContainer.style.maxWidth = '';
                feedContainer.style.padding = '';
              }
            }
            const headingEl = document.getElementById('grid-heading');
            if (headingEl) {
              headingEl.textContent = '';
              headingEl.style.display = 'none';
            }
            renderHomePostsGrid(publishedPosts, homeBlocks);
          } else {
            feedSec.style.display = 'none';
          }
        }

        // 7. Newsletter Wire Block
        const wireSec = document.getElementById('section-wire');
        const wireBlock = homeBlocks.find(b => b.type === 'wire');
        if (wireSec) {
          if (wireBlock) {
            wireSec.style.display = 'block';
            const wireContainer = document.getElementById('wire-container');
            const wireCard = document.getElementById('wire-card');
            if (wireContainer && wireCard) {
              if (wireBlock.stretchWidth) {
                wireContainer.style.maxWidth = '100%';
                wireContainer.style.padding = '0';
                wireCard.style.borderRadius = '0';
                wireCard.style.borderLeft = 'none';
                wireCard.style.borderRight = 'none';
              } else {
                wireContainer.style.maxWidth = '';
                wireContainer.style.padding = '';
                wireCard.style.borderRadius = '';
                wireCard.style.border = '';
                wireCard.style.borderLeft = '';
                wireCard.style.borderRight = '';
              }
            }
            const wCfg = wireBlock.config || {};
            const wireTitle = (wCfg.title && (!wCfg.title.includes('Outpost Dispatches') && !wCfg.title.includes('Cedar Dispatches'))) ? wCfg.title : 'Subscribe to the Wire';
            const wireSub = (wCfg.sub && !wCfg.sub.includes('telegraph dispatches')) ? wCfg.sub : 'Receive our latest articles and updates directly in your inbox.';
            document.getElementById('wire-title').textContent = wireTitle;
            document.getElementById('wire-sub').textContent = wireSub;
          } else {
            wireSec.style.display = 'none';
          }
        }



        // 8. Static Pages Shelf (Permanently disabled — pages live in header navigation)
        const pagesSec = document.getElementById('section-pages');
        const pagesGrid = document.getElementById('pages-grid');
        if (pagesSec) {
          pagesSec.style.display = 'none';
        }
        if (pagesGrid) {
          pagesGrid.innerHTML = '';
        }

        // 9. Authors Showcase
        const authorsSec = document.getElementById('section-authors');
        const authorsBlock = homeBlocks.find(b => b.type === 'authors');
        const authorsGrid = document.getElementById('authors-grid');
        if (authorsSec && authorsGrid) {
          if (designCfg.authorBar === true && authorsBlock && authors.length > 0) {
            authorsSec.style.display = 'block';
            const authorsContainer = document.getElementById('authors-container');
            if (authorsContainer) {
              if (authorsBlock.stretchWidth) {
                authorsContainer.style.maxWidth = '100%';
                authorsContainer.style.padding = '0';
              } else {
                authorsContainer.style.maxWidth = '';
                authorsContainer.style.padding = '';
              }
            }
            let authHtml = '';
            authors.forEach(a => {
              const aName = typeof a === 'object' ? a.name : a;
              const aRole = typeof a === 'object' && a.bio ? a.bio : 'Signal Operator';
              const aAvatar = getAuthorAvatar(a);

              let gridAvatar = aAvatar;
              if (gridAvatar && !/^(https?:|data:|blob:|\/)/i.test(gridAvatar)) {
                gridAvatar = '/' + gridAvatar;
              }
              const avatarEl = gridAvatar
                ? `<img src="${escapeHtml(gridAvatar)}" class="author-card-avatar" alt="${escapeHtml(aName)}" onerror="this.style.display='none';">`
                : '';

              authHtml += `
                <div class="author-card" style="cursor: pointer; transition: transform 0.18s ease, border-color 0.18s ease;" onclick="if (window.navigateTo) window.navigateTo('#/author/' + encodeURIComponent('${escapeHtml(aName)}')); else window.location.hash='#/author/' + encodeURIComponent('${escapeHtml(aName)}');" title="View profile for ${escapeHtml(aName)}">
                  ${avatarEl}
                  <div class="author-card-info">
                    <div class="author-card-name" style="text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(aName)}</div>
                    <div class="author-card-role">${escapeHtml(aRole)}</div>
                  </div>
                </div>
              `;
            });
            authorsGrid.innerHTML = authHtml;
          } else {
            authorsSec.style.display = 'none';
            authorsGrid.innerHTML = '';
          }
        }

        // 10. Footer Block Configuration
        const footerBlock = homeBlocks.find(b => b.type === 'footer');
        const footerEl = document.querySelector('.site-footer');
        const footerWrapEl = document.querySelector('.site-footer .footer-wrap');
        if (footerEl) {
          if (footerBlock) {
            footerEl.style.display = '';
            if (footerWrapEl) {
              if (footerBlock.stretchWidth) {
                footerWrapEl.style.maxWidth = '100%';
                footerWrapEl.style.paddingLeft = '2rem';
                footerWrapEl.style.paddingRight = '2rem';
              } else {
                footerWrapEl.style.maxWidth = '';
                footerWrapEl.style.paddingLeft = '';
                footerWrapEl.style.paddingRight = '';
              }
            }
          } else {
            footerEl.style.display = 'none';
          }
        }

        // =========================================================================
        // 11. Dynamic Block Reordering & Multi-column Grid Row Assembly
        // Guarantees that preview.html renders in the exact order and row alignment
        // as configured in the Cedar Designer Studio canvas.
        // =========================================================================
        const viewHome = document.getElementById('view-home');
        if (viewHome) {
          // Unpack any sections from previous .preview-grid-row wrappers
          viewHome.querySelectorAll('.preview-grid-row').forEach(row => {
            Array.from(row.children).forEach(child => viewHome.appendChild(child));
            row.remove();
          });

          const SECTION_MAP = {
            hero_beacon: document.getElementById('section-hero-beacon'),
            spotlight: document.getElementById('section-spotlight'),
            signage: document.getElementById('section-signage'),
            media_showcase: document.getElementById('section-media-showcase'),
            categories_shelf: document.getElementById('section-filters'),
            post_feed: document.getElementById('section-feed'),
            wire: document.getElementById('section-wire'),
            pages: document.getElementById('section-pages'),
            authors: document.getElementById('section-authors')
          };

          // Filter active content blocks (masthead, footer, and pages shelf excluded from home body)
          const activeBlocks = homeBlocks.filter(b => b.type !== 'masthead' && b.type !== 'footer' && b.type !== 'pages');
          const totalCols = (getConfig().design && getConfig().design.columns) || 8;
          const baseContainerW = (getConfig().design && getConfig().design.containerWidth) || 1280;
          const containerX = Math.round((1920 - baseContainerW) / 2);
          const colW = baseContainerW / totalCols;

          // Hide all sections for block types that are not active in homeBlocks
          const activeTypes = new Set(activeBlocks.map(b => b.type));
          Object.keys(SECTION_MAP).forEach(type => {
            if (!activeTypes.has(type)) {
              const secEl = SECTION_MAP[type];
              if (secEl) secEl.style.display = 'none';
            }
          });

          // Sort active blocks primarily by vertical position (y), secondarily by x
          const sortedBlocks = [...activeBlocks].sort((a, b) => {
            if (Math.abs((a.y || 0) - (b.y || 0)) > 16) {
              return (a.y || 0) - (b.y || 0);
            }
            return (a.x || 0) - (b.x || 0);
          });

          // Group blocks that share the same vertical row for side-by-side layout
          const rows = [];
          sortedBlocks.forEach(b => {
            const lastRow = rows[rows.length - 1];
            if (lastRow && lastRow.length > 0 && !b.stretchWidth) {
              const bX = b.x !== undefined ? b.x : containerX;
              const bW = b.w || baseContainerW;
              const bY = b.y || 0;
              const bH = b.h || 64;

              const allNonStretched = lastRow.every(p => !p.stretchWidth);
              if (allNonStretched) {
                const noHOverlap = lastRow.every(p => {
                  const pX = p.x !== undefined ? p.x : containerX;
                  const pW = p.w || baseContainerW;
                  const hOverlap = (pX < bX + bW - 8) && (pX + pW > bX + 8);
                  return !hOverlap;
                });

                const first = lastRow[0];
                const fY = first.y || 0;
                const fH = first.h || 64;
                const vOverlap = (fY < bY + bH - 8) && (fY + fH > bY + 8);
                const closeY = Math.abs(bY - fY) <= 48;

                if (noHOverlap && (vOverlap || closeY)) {
                  lastRow.push(b);
                  return;
                }
              }
            }
            rows.push([b]);
          });

          // Append rows in sorted order into #view-home
          rows.forEach(row => {
            if (row.length === 1) {
              const b = row[0];
              const secEl = SECTION_MAP[b.type];
              if (secEl && secEl.style.display !== 'none') {
                secEl.style.gridColumn = '';
                secEl.style.width = '';
                secEl.style.margin = '';
                secEl.style.padding = '';
                const innerCont = secEl.querySelector('.container');
                if (innerCont) {
                  if (b.stretchWidth) {
                    innerCont.style.maxWidth = '100%';
                    innerCont.style.padding = '0';
                    innerCont.style.margin = '0';
                  } else if (b.w && b.w < baseContainerW) {
                    innerCont.style.maxWidth = `${b.w}px`;
                    const relX = Math.max(0, (b.x || containerX) - containerX);
                    if (relX > 16) {
                      innerCont.style.marginLeft = `${relX}px`;
                      innerCont.style.marginRight = 'auto';
                    } else {
                      innerCont.style.margin = '0 auto';
                    }
                  } else {
                    innerCont.style.maxWidth = '';
                    innerCont.style.padding = '';
                    innerCont.style.margin = '';
                  }
                }
                viewHome.appendChild(secEl);
              }
            } else {
              // Multi-block side-by-side row
              const rowEl = document.createElement('div');
              rowEl.className = 'preview-grid-row container';
              rowEl.style.setProperty('--columns', String(totalCols));
              let hasVisible = false;
              row.forEach(b => {
                const secEl = SECTION_MAP[b.type];
                if (secEl && secEl.style.display !== 'none') {
                  hasVisible = true;
                  const blockRelX = Math.max(0, (b.x || containerX) - containerX);
                  const colStart = Math.min(totalCols, Math.max(1, Math.round(blockRelX / colW) + 1));
                  const colSpan = Math.min(totalCols - colStart + 1, Math.max(1, Math.round((b.w || baseContainerW) / colW)));
                  secEl.style.gridColumn = `${colStart} / span ${colSpan}`;
                  secEl.style.width = '100%';
                  secEl.style.padding = '0';
                  secEl.style.margin = '0';
                  const innerCont = secEl.querySelector('.container');
                  if (innerCont) {
                    innerCont.style.maxWidth = '100%';
                    innerCont.style.padding = '0';
                    innerCont.style.margin = '0';
                  }
                  rowEl.appendChild(secEl);
                }
              });
              if (hasVisible) {
                viewHome.appendChild(rowEl);
              }
            }
          });

          // Guarantee that if categories shelf is active, it is placed immediately above section-feed
          const catSecEl = SECTION_MAP['categories_shelf'];
          const feedSecEl = SECTION_MAP['post_feed'];
          if (catSecEl && feedSecEl && catSecEl.style.display !== 'none' && feedSecEl.parentNode) {
            feedSecEl.parentNode.insertBefore(catSecEl, feedSecEl);
          }
        }

        if ((wasHomeActive || options.preserveScroll) && prevScrollY > 0) {
          window.scrollTo({ top: prevScrollY, behavior: 'instant' });
          requestAnimationFrame(() => {
            window.scrollTo({ top: prevScrollY, behavior: 'instant' });
          });
        }
      }

      // Render All Posts View (#/posts)


  window.CedarPreview.updateBranding = updateBranding;
  window.OutpostPreview.updateBranding = updateBranding;
  window.CedarPreview.getUserPublishedPages = getUserPublishedPages;
  window.OutpostPreview.getUserPublishedPages = getUserPublishedPages;
  window.CedarPreview.getUserCustomPages = getUserCustomPages;
  window.OutpostPreview.getUserCustomPages = getUserCustomPages;
  window.CedarPreview.createPostCardHtml = createPostCardHtml;
  window.OutpostPreview.createPostCardHtml = createPostCardHtml;
  window.CedarPreview.renderHomePostsGrid = renderHomePostsGrid;
  window.OutpostPreview.renderHomePostsGrid = renderHomePostsGrid;
  window.CedarPreview.renderHome = renderHome;
  window.OutpostPreview.renderHome = renderHome;

  window.updateBranding = updateBranding;
  window.getUserPublishedPages = getUserPublishedPages;
  window.getUserCustomPages = getUserCustomPages;
  window.createPostCardHtml = createPostCardHtml;
  window.resolveFeaturedPost = resolveFeaturedPost;
  window.CedarPreview.resolveFeaturedPost = resolveFeaturedPost;
  window.OutpostPreview.resolveFeaturedPost = resolveFeaturedPost;
  window.renderHomePostsGrid = renderHomePostsGrid;
  window.renderHome = renderHome;
  window.updateNavLinks = updateNavLinks;
  window.CedarPreview.updateNavLinks = updateNavLinks;
  window.OutpostPreview.updateNavLinks = updateNavLinks;
})();
