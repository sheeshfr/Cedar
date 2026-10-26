/**
 * Cedar Preview — Article Reader & All Posts Archive
 */
(function () {
  'use strict';

  const getDrafts = () => window.drafts || [];
  const getConfig = () => window.projectConfig || {};


  function isMatchingImage(srcA, srcB) {
    if (!srcA || !srcB) return false;
    if (srcA === srcB) return true;
    const cleanA = srcA.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
    const cleanB = srcB.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
    if (cleanA === cleanB) return true;
    const fileA = cleanA.split('/').pop();
    const fileB = cleanB.split('/').pop();
    if (fileA && fileB && fileA === fileB && !fileA.startsWith('data:') && !fileA.startsWith('blob:')) return true;
    return false;
  }

  window.CedarPreview = window.CedarPreview || window.OutpostPreview || {};
  window.OutpostPreview = window.CedarPreview;

  let activeAllCategoryFilter = 'ALL';
  let currentAllPostsPage = 1;
  const POSTS_PER_PAGE = 15;
  let cachedPublishedPosts = [];

  function setupAllPostsImageObserver(gridEl) {
    if (window._allPostsImageObserver) {
      window._allPostsImageObserver.disconnect();
      window._allPostsImageObserver = null;
    }

    const cards = Array.from(gridEl.querySelectorAll('.post-card[data-index]'));
    if (cards.length === 0) return;

    function loadImageForIndex(targetIdx) {
      const card = gridEl.querySelector(`.post-card[data-index="${targetIdx}"]`);
      if (!card) return;
      const img = card.querySelector('img[data-src]');
      if (img && img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.onload = () => img.classList.add('is-loaded');
      }
    }

    if (!('IntersectionObserver' in window)) {
      cards.forEach((_, idx) => loadImageForIndex(idx));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const idx = parseInt(card.dataset.index, 10);
          // Load visible card + 2 extra loaded ahead at a time
          loadImageForIndex(idx);
          loadImageForIndex(idx + 1);
          loadImageForIndex(idx + 2);
          observer.unobserve(card);
        }
      });
    }, {
      rootMargin: '50px 0px',
      threshold: 0.01
    });

    window._allPostsImageObserver = observer;
    cards.forEach(card => observer.observe(card));
  }

  function renderPaginationBar(totalPages, currentPage) {
    const paginationEl = document.getElementById('all-posts-pagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
      paginationEl.style.display = 'none';
      paginationEl.innerHTML = '';
      return;
    }

    paginationEl.style.display = 'flex';
    let html = '';

    // Previous Button
    html += `
      <button type="button" class="pagination-btn pagination-prev" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}" title="Previous Page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span>Previous</span>
      </button>
    `;

    // Page Numbers
    html += `<div class="pagination-pages">`;
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
        html += `
          <button type="button" class="pagination-page-num ${p === currentPage ? 'is-active' : ''}" data-page="${p}" aria-label="Page ${p}">
            ${p}
          </button>
        `;
      } else if (p === currentPage - 3 || p === currentPage + 3) {
        html += `<span class="pagination-ellipsis">&hellip;</span>`;
      }
    }
    html += `</div>`;

    // Next Button
    html += `
      <button type="button" class="pagination-btn pagination-next" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}" title="Next Page">
        <span>Next</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `;

    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = parseInt(btn.dataset.page, 10);
        if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages && targetPage !== currentPage) {
          if (activeAllCategoryFilter && activeAllCategoryFilter !== 'ALL') {
            const catSlug = encodeURIComponent(activeAllCategoryFilter.toLowerCase().replace(/\s+/g, '-'));
            const targetHash = targetPage > 1 ? `#/${catSlug}/${targetPage}` : `#/${catSlug}`;
            if (window.navigateTo) window.navigateTo(targetHash);
            else window.location.hash = targetHash;
          } else {
            const qParts = [];
            if (targetPage > 1) {
              qParts.push('page=' + targetPage);
            }
            const targetHash = '#/blog' + (qParts.length > 0 ? '?' + qParts.join('&') : '');
            if (window.navigateTo) window.navigateTo(targetHash);
            else window.location.hash = targetHash;
          }
        }
      });
    });
  }

  function renderAllPosts(page = 1, category = null) {
    document.body.classList.remove('is-links-page');
    document.documentElement.classList.remove('is-links-page');
    const vPosts = document.getElementById('view-posts');
    const wasPostsActive = Boolean(vPosts && vPosts.style.display === 'block');
    const prevScrollY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;

    document.getElementById('view-home').style.display = 'none';
    if (vPosts) vPosts.style.display = 'block';
    document.getElementById('view-reader').style.display = 'none';
    const vNotes = document.getElementById('view-notes');
    if (vNotes) vNotes.style.display = 'none';
    const vSingleNote = document.getElementById('view-note-single');
    if (vSingleNote) vSingleNote.style.display = 'none';
    const vAuthor = document.getElementById('view-author');
    if (vAuthor) vAuthor.style.display = 'none';

    if (!wasPostsActive) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (prevScrollY > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: prevScrollY, behavior: 'instant' }));
    }

    updateNavLinks((category && category !== 'ALL') ? `category:${category}` : 'posts');

    const isAllCat = Boolean(!category || category.toUpperCase() === 'ALL' || category.trim().toLowerCase() === 'all posts' || category.trim().toLowerCase() === 'all-posts' || category === 'page_all');
    const isHiddenCatPage = Boolean(category && !isAllCat && typeof window.isCategoryPageHidden === 'function' && window.isCategoryPageHidden(category));
    activeAllCategoryFilter = (category && !isAllCat && !isHiddenCatPage) ? category : 'ALL';

    if (typeof page === 'number' && page >= 1) {
      currentAllPostsPage = page;
    }

    const isLinks = (d) => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData));
    const publishedPosts = getDrafts()
      .filter(d => (d.type === 'post' || !d.type) && d.type !== 'page' && d.type !== 'note' && d.status === 'published' && !d.hidden && !d.retired && !isLinks(d));
    cachedPublishedPosts = publishedPosts
      .sort((a, b) => {
        const tA = new Date(a.publishedDate || a.date || a.createdAt || 0).getTime();
        const tB = new Date(b.publishedDate || b.date || b.createdAt || 0).getTime();
        if (tB !== tA) return tB - tA;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

    const filterSection = document.getElementById('section-all-filters');
    if (filterSection) {
      filterSection.style.display = 'none';
    }
    const filterBar = document.getElementById('all-category-filter-bar');
    if (filterBar) {
      filterBar.innerHTML = '';
    }

    renderAllPostsGrid(cachedPublishedPosts);
  }

  function renderAllPostsGrid(publishedPosts) {
    const gridEl = document.getElementById('all-posts-grid');
    if (!gridEl) return;

    const isCategoryPage = Boolean(activeAllCategoryFilter && activeAllCategoryFilter !== 'ALL');
    const effectivePageSize = POSTS_PER_PAGE;

    const headingEl = document.getElementById('all-posts-heading');
    if (headingEl) {
      headingEl.textContent = isCategoryPage ? activeAllCategoryFilter : 'All Posts';
    }

    const homeBlocks = (getConfig().design && getConfig().design.homeBlocks) || [];
    const feedBlock = homeBlocks.find(b => b.type === 'post_feed');
    const fCfg = (feedBlock && feedBlock.config) || {};
    const isRowLayout = (fCfg.layoutStyle === 'horizontal' || fCfg.cols === 1);

    if (isRowLayout) {
      gridEl.className = 'posts-grid posts-list-view cols-1';
    } else {
      gridEl.className = 'posts-grid cols-3';
    }

    let filteredPosts = publishedPosts;
    if (isCategoryPage) {
      const matcher = (typeof window.postMatchesCategory === 'function')
        ? window.postMatchesCategory
        : (p, cat) => {
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
          };
      filteredPosts = publishedPosts.filter(p => matcher(p, activeAllCategoryFilter));
    }

    const totalPosts = filteredPosts.length;
    const totalPages = Math.ceil(totalPosts / effectivePageSize) || 1;
    if (currentAllPostsPage > totalPages) currentAllPostsPage = totalPages;
    if (currentAllPostsPage < 1) currentAllPostsPage = 1;

    const countEl = document.getElementById('all-posts-count');
    if (countEl) {
      countEl.style.display = 'none';
      countEl.textContent = '';
    }

    const paginationEl = document.getElementById('all-posts-pagination');

    if (filteredPosts.length === 0) {
      const emptyMsg = publishedPosts.length === 0
        ? 'No published posts yet.'
        : 'No published posts found in this category.';
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 4rem 1rem; text-align: center; color: var(--text-dim);">
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${emptyMsg}</p>
          <span style="font-size: 0.85rem;">Drafts and ideas in Cedar remain offline until published.</span>
        </div>
      `;
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    const startIndex = (currentAllPostsPage - 1) * effectivePageSize;
    const pagePosts = filteredPosts.slice(startIndex, startIndex + effectivePageSize);

    gridEl.innerHTML = pagePosts.map((p, idx) => {
      return (typeof window.createPostCardHtml === 'function')
        ? window.createPostCardHtml(p, {
            deferredImages: true,
            index: idx,
            showThumbnails: fCfg.showThumbnails !== false,
            showCategoryBadge: fCfg.showCategoryBadge !== false,
            showExcerpt: fCfg.showExcerpt !== false,
            showMeta: fCfg.showMeta !== false,
            layoutStyle: isRowLayout ? 'horizontal' : 'vertical'
          })
        : '';
    }).join('');

    setupAllPostsImageObserver(gridEl);
    renderPaginationBar(totalPages, currentAllPostsPage);
  }

  const LINKTREE_GRADIENTS = {
    sunset: 'linear-gradient(135deg, #1e1b4b 0%, #431407 50%, #18181b 100%)',
    aurora: 'linear-gradient(135deg, #022c22 0%, #064e3b 40%, #0f172a 100%)',
    cyber: 'linear-gradient(135deg, #2e0854 0%, #09090b 60%, #083344 100%)',
    midnight: 'radial-gradient(ellipse at top, #1e293b 0%, #09090b 100%)',
    candy: 'linear-gradient(135deg, #4a044e 0%, #1e1b4b 50%, #0369a1 100%)',
    amber: 'linear-gradient(135deg, #451a03 0%, #1c1917 100%)'
  };

  function applyLinksPageBackground(design) {
    const rw = document.getElementById('view-reader');
    if (!rw) return;
    rw.classList.remove('linktree-pattern-grid', 'linktree-pattern-dots', 'linktree-pattern-stripes');
    rw.style.background = '';
    rw.style.backgroundColor = '';
    rw.style.backgroundImage = '';
    rw.style.backgroundSize = '';
    rw.style.backgroundPosition = '';
    rw.style.backgroundAttachment = '';
    if (!design) return;

    const { bgType, bgColor, bgGradient, bgPattern, bgImageUrl } = design;
    if (bgType === 'color' && bgColor) {
      rw.style.backgroundColor = bgColor;
      rw.style.setProperty('--links-page-bg', bgColor);
    } else if (bgType === 'gradient' && bgGradient) {
      const grad = LINKTREE_GRADIENTS[bgGradient] || bgGradient;
      rw.style.background = grad;
      rw.style.setProperty('--links-page-bg', '#0f172a');
    } else if (bgType === 'pattern' && bgPattern) {
      if (bgColor) rw.style.backgroundColor = bgColor;
      rw.classList.add(`linktree-pattern-${bgPattern}`);
      rw.style.setProperty('--links-page-bg', bgColor || '#0f172a');
    } else if (bgType === 'image' && bgImageUrl) {
      let resolved = bgImageUrl;
      if (window.imageRegistry && window.imageRegistry.has(resolved)) {
        resolved = window.imageRegistry.get(resolved).dataUrl || resolved;
      }
      rw.style.backgroundImage = `url('${resolved}')`;
      rw.style.backgroundSize = 'cover';
      rw.style.backgroundPosition = 'center';
      rw.style.backgroundAttachment = 'fixed';
      rw.style.setProperty('--links-page-bg', '#0f172a');
    }
  }

  function resetLinksPageBackground() {
    const rw = document.getElementById('view-reader');
    if (!rw) return;
    rw.classList.remove('linktree-pattern-grid', 'linktree-pattern-dots', 'linktree-pattern-stripes');
    rw.style.background = '';
    rw.style.backgroundColor = '';
    rw.style.backgroundImage = '';
    rw.style.backgroundSize = '';
    rw.style.backgroundPosition = '';
    rw.style.backgroundAttachment = '';
  }

  function renderLinktreePageHtml(item) {
    const data = item.linksData || {};
    const profile = data.profile || {};
    const design = data.design || {};
    const cardStyle = design.cardStyle || 'rounded';
    const cardStyleClass = `card-style-${cardStyle}`;
    let rawItems = Array.isArray(data.items) ? data.items.filter(i => i && i.enabled !== false) : [];
    
    // Purge legacy dummy links
    rawItems = rawItems.filter(i => {
      if (i.id === 'link_fb' || i.id === 'link_ig' || i.id === 'link_tw') return false;
      const url = (i.url || '').toLowerCase();
      const title = (i.title || '').toLowerCase();
      const sub = (i.subtitle || '').toLowerCase();
      if (url === 'https://facebook.com' || url === 'facebook.com' || (title === 'facebook' && sub === 'facebook.com')) return false;
      if (url === 'https://instagram.com' || url === 'instagram.com' || (title === 'instagram' && sub === 'instagram.com')) return false;
      if (url === 'https://twitter.com' || url === 'twitter.com' || (title === 'twitter' && sub === 'twitter.com')) return false;
      return true;
    });

    const cfg = (typeof getConfig === 'function' ? getConfig() : window.projectConfig) || {};
    const siteTitle = (cfg.design?.branding?.siteTitle) || cfg.name || 'Cedar';
    const siteLogo = (cfg.design?.branding?.generalLogo) || 'images/Lamp.png';

    if (rawItems.length === 0) {
      rawItems = [{
        id: 'link_blog',
        title: `${siteTitle} Blog`,
        subtitle: 'Latest essays and stories',
        url: '/blog/',
        icon: siteLogo,
        enabled: true
      }];
    } else {
      rawItems.forEach(it => {
        if (it && (it.id === 'link_blog' || it.url === '/blog/' || it.url === 'blog')) {
          if (it.subtitle === 'Read articles and essays') it.subtitle = 'Latest essays and stories';
          if (it.title === 'Blog') it.title = `${siteTitle} Blog`;
          if (it.icon === 'blog' && !it.customIcon) it.icon = siteLogo;
        }
      });
    }

    const items = rawItems;
    const defAuth = (typeof resolveProjectDefaultAuthor === 'function') ? resolveProjectDefaultAuthor() : (cfg.defaultAuthor || '');
    const headline = profile.headline || `Welcome to ${defAuth}'s link site!`;
    const bio = profile.bio || '';

    let avatarUrl = profile.avatar;
    if (avatarUrl && window.imageRegistry && window.imageRegistry.has(avatarUrl)) {
      avatarUrl = window.imageRegistry.get(avatarUrl).dataUrl || avatarUrl;
    }
    if (!avatarUrl) {
      const authors = Array.isArray(cfg.authors) ? cfg.authors : [];
      const authorObj = authors.find(a => ((typeof a === 'object' ? a.name : a) || '').toLowerCase() === defAuth.toLowerCase());
      if (authorObj && typeof authorObj === 'object' && authorObj.avatar) {
        avatarUrl = authorObj.avatar;
      }
    }
    if (avatarUrl && !avatarUrl.startsWith('data:') && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('/')) {
      avatarUrl = '/' + avatarUrl;
    }

    const brandSvgs = (window.Cedar?.links?.BRAND_ICONS) || {
      blog: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
      facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
      instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`,
      twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
      github: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
      youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
      discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
      reddit: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.197-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`,
      tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
      twitch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`,
      spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
      patreon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.82 2.41a8.59 8.59 0 1 0 0 17.18 8.59 8.59 0 0 0 0-17.18zM2.41 21.59h3.76V2.41H2.41z"/></svg>`,
      substack: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg>`,
      bluesky: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566 1.01 1.2 1.764 1.2 3.99c0 1.116.51 7.214.848 8.414.773 2.744 3.528 3.518 5.752 3.12-3.864 1.066-5.88 3.238-3.08 7.396 3.328 4.938 6.564-1.042 7.28-2.614.716 1.572 3.952 7.552 7.28 2.614 2.8-4.158.784-6.33-3.08-7.396 2.224.398 4.98-.376 5.752-3.12.338-1.2.848-7.298.848-8.414 0-2.226-1.366-2.98-4.002-1.185C16.046 4.747 13.087 8.686 12 10.8z"/></svg>`,
      threads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.213-8.184-3.535C2.274 18.257 1.5 15.426 1.5 12.062c0-3.411.83-6.264 2.468-8.48C5.642 1.296 8.448.024 11.996 0c3.674 0 6.54 1.306 8.517 3.882 1.838 2.395 2.71 5.717 2.592 9.873-.03.94-.108 1.826-.234 2.656h-2.317c.106-.71.168-1.464.186-2.247.103-3.626-.63-6.425-2.18-8.318C16.974 3.93 14.707 2.8 11.996 2.8c-2.88 0-5.116 1.01-6.646 3.003C3.904 7.697 3.25 10.024 3.25 12.062c0 3.125.688 5.485 2.046 7.016 1.417 1.597 3.488 2.428 6.157 2.447h.007c2.408 0 4.34-.694 5.742-2.063 1.258-1.229 1.99-2.91 2.184-5.008-.756.408-1.636.685-2.628.825-.38 2.684-1.848 4.208-4.22 4.208-2.457 0-4.02-1.745-4.02-4.475 0-3.056 1.942-4.995 4.887-4.995 1.54 0 2.822.484 3.81 1.44.02-.34.03-.68.03-1.02 0-2.38-.636-4.148-1.89-5.257-1.127-.996-2.73-1.5-4.767-1.5-2.58 0-4.423.868-5.632 2.653-.55.813-.902 1.815-1.047 2.977h-1.9c.162-1.55.674-2.898 1.52-4.01C8.28 2.683 10.74 1.5 13.902 1.5c2.535 0 4.58.67 6.08 1.99 1.63 1.437 2.457 3.655 2.457 6.592 0 .43-.016.86-.046 1.29-.028.38-.066.75-.113 1.11.83 1.22 1.272 2.76 1.272 4.54 0 3.01-.986 5.437-2.932 7.213C18.665 24.084 15.82 24 12.186 24z"/></svg>`,
      steam: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 14.819C1.903 20.099 6.492 24 12 24c6.627 0 12-5.373 12-12S18.627 0 11.979 0z"/></svg>`,
      itch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.27 3.535A2.39 2.39 0 0 0 .546 5.79v1.758a5.1 5.1 0 0 0 1.5 3.693 4.67 4.67 0 0 0 3.344 1.348 4.7 4.7 0 0 0 3.692-1.782A4.7 4.7 0 0 0 12.774 12.6a4.7 4.7 0 0 0 3.692-1.782A4.7 4.7 0 0 0 20.158 12.6a4.67 4.67 0 0 0 3.344-1.348 5.1 5.1 0 0 0 1.5-3.693V5.79a2.39 2.39 0 0 0-1.724-2.255L19.46.993A6.8 6.8 0 0 0 15.65 0H8.35a6.8 6.8 0 0 0-3.81.993zM8.5 7.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM1.5 14.25v6a3.75 3.75 0 0 0 3.75 3.75h13.5A3.75 3.75 0 0 0 22.5 20.25v-6a5.96 5.96 0 0 1-2.342.844v3.406a1.5 1.5 0 0 1-1.5 1.5h-1.5a1.5 1.5 0 0 1-1.5-1.5V15h-7.316v3a1.5 1.5 0 0 1-1.5 1.5h-1.5a1.5 1.5 0 0 1-1.5-1.5v-3.406A5.96 5.96 0 0 1 1.5 14.25z"/></svg>`,
      linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
      link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
      globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
    };

    let cardsHtml = '';
    items.forEach(it => {
      let iconMarkup = '';
      let iconSrc = it.icon || 'link';
      if (iconSrc && window.imageRegistry && window.imageRegistry.has(iconSrc)) {
        iconSrc = window.imageRegistry.get(iconSrc).dataUrl || iconSrc;
      }
      if (iconSrc && (iconSrc.startsWith('data:') || iconSrc.startsWith('http') || iconSrc.includes('.') || iconSrc.includes('/'))) {
        iconMarkup = `<img src="${escapeHtml(iconSrc)}" alt="" onerror="this.style.display='none';">`;
      } else if (brandSvgs[iconSrc]) {
        iconMarkup = brandSvgs[iconSrc];
      } else {
        iconMarkup = brandSvgs.link || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
      }

      let targetUrl = it.url || '#';
      if (targetUrl === '/blog/' || targetUrl === '/blog' || targetUrl === 'blog') {
        targetUrl = '#/blog';
      }
      const isExternal = /^https?:\/\//i.test(targetUrl);
      const targetAttr = isExternal ? 'target="_blank" rel="noopener noreferrer"' : '';

      cardsHtml += `
        <a href="${escapeHtml(targetUrl)}" ${targetAttr} class="linktree-card-btn popout-3d ${escapeHtml(cardStyleClass)}">
          <div class="linktree-card-icon">${iconMarkup}</div>
          <div class="linktree-card-text">
            <span class="linktree-card-title">${escapeHtml(it.title || 'Link')}</span>
            ${it.subtitle ? `<span class="linktree-card-sub">${escapeHtml(it.subtitle)}</span>` : ''}
          </div>
        </a>
      `;
    });

    return `
      <div class="linktree-page-wrap">
        ${avatarUrl ? `<div class="linktree-avatar-wrap">
          <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(headline)}" class="linktree-avatar-img" onerror="this.style.display='none';">
        </div>` : ''}
        <h1 class="linktree-headline">${escapeHtml(headline)}</h1>
        ${(bio && bio.trim()) ? `<p class="linktree-bio">${escapeHtml(bio.trim())}</p>` : ''}

        <div class="linktree-cards-container">
          ${cardsHtml || '<p class="linktree-empty-notice">No active links yet.</p>'}
        </div>
      </div>
    `;
  }


      // Render Article / Page Reader View
      function renderReader(type, slug, pageNum = 1) {
        const cleanSlug = decodeURIComponent(slug || '').trim().toLowerCase();
        const drafts = getDrafts();
        // Priority 1: Match by slug or id matching the requested type
        let item = drafts.find(d => {
          const s = (d.slug || '').trim().toLowerCase();
          const sClean = s.replace(/^(pages|posts|blog)\//, '');
          const id = (d.id || '').trim().toLowerCase();
          const matches = (s === cleanSlug || sClean === cleanSlug || id === cleanSlug);
          if (!matches) return false;
          if (type && d.type && d.type === type) return true;
          return false;
        });
        // Priority 2: Match by slug or id regardless of type
        if (!item) {
          item = drafts.find(d => {
            const s = (d.slug || '').trim().toLowerCase();
            const sClean = s.replace(/^(pages|posts|blog)\//, '');
            const id = (d.id || '').trim().toLowerCase();
            return (s === cleanSlug || sClean === cleanSlug || id === cleanSlug);
          });
        }
        if (!item) {
          renderHome();
          return null;
        }

        if (item.isCategoryAggregate || String(item.id || '').startsWith('page_cat_') || item.id === 'page_all' || cleanSlug === 'all') {
          const cat = (item.id === 'page_all' || cleanSlug === 'all') ? null : (item.categoryAggregate || item.title);
          renderAllPosts(pageNum || 1, cat);
          return null;
        }

        const vReader = document.getElementById('view-reader');
        const wasReaderActive = Boolean(vReader && vReader.style.display === 'block');
        const prevScrollY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;

        document.getElementById('view-home').style.display = 'none';
        document.getElementById('view-posts').style.display = 'none';
        if (vReader) vReader.style.display = 'block';
        const vNotes = document.getElementById('view-notes');
        if (vNotes) vNotes.style.display = 'none';
        const vSingleNote = document.getElementById('view-note-single');
        if (vSingleNote) vSingleNote.style.display = 'none';
        const vAuthor = document.getElementById('view-author');
        if (vAuthor) vAuthor.style.display = 'none';

        if (!wasReaderActive) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        } else if (prevScrollY > 0) {
          requestAnimationFrame(() => window.scrollTo({ top: prevScrollY, behavior: 'instant' }));
        }

        const isPage = item.type === 'page' || type === 'page';
        const isRss = isPage && (item.id === 'page_rss' || item.slug === 'rss' || slug === 'rss');
        const isLinks = isPage && (item.id === 'page_links' || item.slug === 'links' || slug === 'links');

        if (isLinks) {
          document.body.classList.add('is-links-page');
          document.documentElement.classList.add('is-links-page');
          applyLinksPageBackground(item.linksData?.design);
          const rH = document.getElementById('reader-header') || document.querySelector('.reader-header');
          if (rH) rH.style.display = 'none';
          const rM = document.getElementById('reader-meta-bar') || document.querySelector('.reader-meta-bar');
          if (rM) rM.style.display = 'none';
        } else {
          document.body.classList.remove('is-links-page');
          document.documentElement.classList.remove('is-links-page');
          resetLinksPageBackground();
        }
        if (isRss && typeof window.generateRssPageData === 'function') {
          const rssData = window.generateRssPageData(getConfig());
          item.subtitle = rssData.subtitle;
          item.markdown = rssData.markdown;
          item.proseHtml = rssData.proseHtml;
        } else if (isLinks && typeof window.generateLinksPageData === 'function') {
          const linksData = window.generateLinksPageData(item.linksData, getConfig());
          item.subtitle = linksData.subtitle;
          item.markdown = linksData.markdown;
          item.proseHtml = linksData.proseHtml;
        }
        if (isPage) {
          updateNavLinks(`page:${slug}`);
        } else {
          const postCat = item.tag || (item.categories && item.categories[0]) || '';
          if (postCat && postCat.toLowerCase() !== 'uncategorized' && postCat.toLowerCase() !== 'general') {
            updateNavLinks(`category:${postCat}`);
          } else {
            updateNavLinks('blog');
          }
        }

        const readerTopBar = document.querySelector('.reader-top-bar');
        if (readerTopBar) {
          readerTopBar.style.display = isPage ? 'none' : 'flex';
        }
        const bottomBackBtn = document.getElementById('btn-reader-bottom-back');
        if (bottomBackBtn && bottomBackBtn.parentElement) {
          bottomBackBtn.parentElement.style.display = isPage ? 'none' : '';
          bottomBackBtn.innerHTML = '&larr; See More Posts';
        }

        const isAboutCedar = (item.slug === 'about-cedar' || item.id === 'page_about_cedar');
        if (isAboutCedar) {
          item.subtitle = '';
          item.showSubtitle = false;
        }

        const showTitle = !isPage || item.showTitle !== false;
        const showSubtitle = !isAboutCedar && (!isPage || item.showSubtitle !== false);

        const readerTitle = document.getElementById('reader-title');
        const readerSubtitle = document.getElementById('reader-subtitle');
        if (readerTitle) {
          readerTitle.textContent = item.title || 'Untitled Post';
          readerTitle.style.display = showTitle ? '' : 'none';
        }
        if (readerSubtitle) {
          readerSubtitle.textContent = item.subtitle || '';
          readerSubtitle.style.display = (showSubtitle && item.subtitle) ? '' : 'none';
        }

        const readerHeader = document.getElementById('reader-header') || document.querySelector('.reader-header');
        if (readerHeader) {
          if (isLinks) {
            readerHeader.style.display = 'none';
          } else if (isPage) {
            readerHeader.style.display = '';
            readerHeader.classList.toggle('all-hidden', !showTitle && !showSubtitle);
          }
        }

        const readerTagEl = document.getElementById('reader-tag');
        if (readerTagEl) {
          if (isPage) {
            if (item.slug === 'about-cedar' || item.id === 'page_about_cedar') {
              readerTagEl.style.display = 'inline-block';
              readerTagEl.textContent = 'Cedar';
            } else {
              readerTagEl.style.display = 'none';
            }
          } else {
            readerTagEl.style.display = 'none';
          }
        }

        // Meta Bar
        const rawAuths = (Array.isArray(item.authors) && item.authors.length > 0)
          ? item.authors
          : [item.authorName || getConfig().defaultAuthor || 'Cedar Staff'];
        const authName = typeof window.formatAuthorsString === 'function' ? window.formatAuthorsString(rawAuths) : rawAuths.map(a => a?.name || a).join(', ');
        const authorObj = typeof resolveAuthor === 'function' ? resolveAuthor(rawAuths[0]) : null;
        let authAvatar = (authorObj && authorObj.avatar) ? authorObj.avatar : (typeof getAuthorAvatar === 'function' ? getAuthorAvatar(rawAuths[0]) : '');
        if (authAvatar && !/^(https?:|data:|blob:|\/)/i.test(authAvatar)) {
          authAvatar = '/' + authAvatar;
        }
        const avatarHtml = authAvatar
          ? `<img src="${escapeHtml(authAvatar)}" alt="${escapeHtml(authName)}" class="post-card-author-avatar" style="width: 22px; height: 22px; margin-right: 6px; vertical-align: middle; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none';">`
          : '';

        const metaBar = document.getElementById('reader-meta-bar');
        if (!isPage) {
          metaBar.style.display = 'flex';
          metaBar.innerHTML = `
            <a href="#/author/${encodeURIComponent(authName)}" style="display: inline-flex; align-items: center; text-decoration: none; color: inherit; cursor: pointer;">${avatarHtml}By&nbsp;<strong style="text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(authName)}</strong></a>
            <span>&bull;</span>
            <time>${formatDate(item.publishedDate || item.date)}</time>
            <span>&bull;</span>
            <span>${calcReadTime(item.markdown)}</span>
            ${item.editedDate ? `<span>&bull;</span><span>(Edited ${formatDate(item.editedDate)})</span>` : ''}
          `;
        } else {
          metaBar.style.display = 'none';
          metaBar.innerHTML = '';
        }

        // Custom CSS override for post/page
        let customCssStyleEl = document.getElementById('reader-custom-css');
        if (item.customCss && typeof item.customCss === 'string' && item.customCss.trim()) {
          if (!customCssStyleEl) {
            customCssStyleEl = document.createElement('style');
            customCssStyleEl.id = 'reader-custom-css';
            document.head.appendChild(customCssStyleEl);
          }
          customCssStyleEl.textContent = item.customCss;
        } else if (customCssStyleEl) {
          customCssStyleEl.textContent = '';
        }

        // Prose Content
        const proseEl = document.getElementById('reader-prose');
        const isOverrideActive = Boolean(item.layoutOverride || getConfig().layoutOverride);
        if (isLinks) {
          proseEl.innerHTML = renderLinktreePageHtml(item);
        } else if (isOverrideActive && item.customHtml && typeof item.customHtml === 'string' && item.customHtml.trim()) {
          proseEl.innerHTML = item.customHtml;
        } else if (item.proseHtml && typeof item.proseHtml === 'string' && item.proseHtml.trim()) {
          proseEl.innerHTML = item.proseHtml;
        } else if (typeof window.parseMarkdownToHtml === 'function') {
          try {
            proseEl.innerHTML = window.parseMarkdownToHtml(item.markdown || '');
          } catch (e) {
            console.warn('[Preview] parseMarkdownToHtml error:', e);
            proseEl.textContent = item.markdown || '';
          }
        } else {
          proseEl.textContent = item.markdown || '';
        }

        // Clean up any canvas editor UI artifacts from prose (preserving user-authored buttons)
        const canvasSelectorsToRemove = [
          '.figure-hover-actions',
          '.block-hover-actions',
          '.gallery-item-controls',
          '.image-hover-pill-bar',
          '.image-add-caption-btn',
          '.figure-action-btn',
          '.gallery-item-btn',
          '.gallery-item-delete-btn',
          '.gallery-item-btn-sep',
          '.figure-action-sep',
          '.image-side-add-btn',
          '.btn-add-multi-image',
          '.btn-combine-adjacent-images',
          '.btn-cancel-placeholder',
          '.gallery-slot-placeholder',
          '.btn-slot-choose-media',
          '.gallery-placeholder-inner',
          '.page-block-editor-bar',
          '.individual-post-url-bar',
          '#canvas-drop-indicator',
          '.canvas-drop-indicator'
        ];
        canvasSelectorsToRemove.forEach(sel => {
          proseEl.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Remove empty or placeholder captions
        proseEl.querySelectorAll('figcaption, .gallery-caption').forEach(fc => {
          const text = (fc.textContent || '').trim();
          if (!text || text === 'Add caption here...' || text === 'Add image caption here...') {
            fc.remove();
          }
        });

        // Strip editor interactive attributes & classes
        proseEl.querySelectorAll('a').forEach(a => {
          const h = a.getAttribute('href');
          if (h && (h.startsWith('http://') || h.startsWith('https://'))) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
        });
        proseEl.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        proseEl.querySelectorAll('[placeholder]').forEach(el => el.removeAttribute('placeholder'));
        proseEl.querySelectorAll('[draggable]').forEach(el => el.removeAttribute('draggable'));
        proseEl.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
        proseEl.querySelectorAll('.selected, .selected-item, .drop-merge-target, .block-is-dragging, .item-is-dragging, .dragover-slot, .dragover').forEach(el => {
          el.classList.remove('selected', 'selected-item', 'drop-merge-target', 'block-is-dragging', 'item-is-dragging', 'dragover-slot', 'dragover');
        });

        // Hydrate Page-Exclusive Blocks (Recent Posts & Individual Post)
        if (isPage) {
          proseEl.querySelectorAll('.category-archive-feed').forEach(el => el.remove());
          if (item.isCategoryAggregate || item.id === 'page_all' || item.slug === 'all' || String(item.id || '').startsWith('page_cat_')) {
            const chosenLayout = item.layout === 'list' || (item.markdown && item.markdown.includes('layout="list"')) ? 'list' : 'grid';
            const curRecent = proseEl.querySelector('.page-recent-posts-block');
            if (curRecent) {
              curRecent.setAttribute('data-layout', chosenLayout);
            } else {
              const recentDiv = document.createElement('div');
              recentDiv.className = 'page-recent-posts-block';
              recentDiv.setAttribute('data-block-type', 'recent-posts');
              recentDiv.setAttribute('data-layout', chosenLayout);
              proseEl.appendChild(recentDiv);
            }
          }
          if (typeof window.hydratePageBlocks === 'function') {
            window.hydratePageBlocks(proseEl, item, { isEditor: false, initialPage: pageNum || 1 });
          }
        } else {
          // Recent Posts block remains page-exclusive, but Individual Post / Link cards can embed anywhere
          proseEl.querySelectorAll('.page-recent-posts-block').forEach(el => el.remove());
          if (typeof window.hydratePageBlocks === 'function') {
            window.hydratePageBlocks(proseEl, item, { isEditor: false });
          }
        }

        // Resolve any relative image sources in prose against imageRegistry
        proseEl.querySelectorAll('img').forEach(imgEl => {
          const src = imgEl.getAttribute('src');
          if (src) {
            const resolved = resolvePostImage(src, item);
            if (resolved && resolved !== src) {
              imgEl.src = resolved;
            }
          }
        });

        // Helper to check if two image references point to the same asset
        function isMatchingImage(srcA, srcB) {
          if (!srcA || !srcB) return false;
          if (srcA === srcB) return true;
          const cleanA = srcA.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
          const cleanB = srcB.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
          if (cleanA === cleanB) return true;
          const fileA = cleanA.split('/').pop();
          const fileB = cleanB.split('/').pop();
          if (fileA && fileB && fileA === fileB && !fileA.startsWith('data:') && !fileA.startsWith('blob:')) return true;
          return false;
        }

        // Cover Image: Deduplicate against prose content so featured image never shows twice
        const coverWrap = document.getElementById('reader-cover-wrap');
        const coverImg = document.getElementById('reader-cover-img');
        const resolvedCover = resolvePostImage(item.coverImage || item.featuredImage, item);

        const proseImages = Array.from(proseEl.querySelectorAll('img')).filter(imgEl => !imgEl.closest('.page-recent-posts-block, .page-individual-post-block'));
        const isCoverInProse = Boolean(resolvedCover && proseImages.some(imgEl => {
          const s = imgEl.getAttribute('src') || imgEl.src || '';
          const orig = imgEl.dataset.originalSrc || '';
          return isMatchingImage(s, resolvedCover) ||
                 isMatchingImage(s, item.coverImage) ||
                 isMatchingImage(s, item.featuredImage) ||
                 (orig && (isMatchingImage(orig, resolvedCover) || isMatchingImage(orig, item.coverImage)));
        }));

        if (resolvedCover && !isCoverInProse) {
          const readerColor = getMutedCoverColor(item.id || item.slug || item.title);
          if (coverWrap) {
            coverWrap.style.backgroundColor = readerColor;
            coverWrap.style.aspectRatio = '16 / 9';
            coverWrap.style.display = 'block';
          }
          coverImg.src = resolvedCover;
          coverImg.alt = '';
          coverImg.style.display = 'block';
          coverImg.onerror = () => {
            if (coverWrap) coverWrap.style.display = 'none';
          };
        } else {
          if (coverWrap) coverWrap.style.display = 'none';
          coverImg.src = '';
          coverImg.alt = '';
          coverImg.style.display = 'none';
        }

        // Prev / Next Navigation for posts (disabled per user request)
        const postNavEl = document.getElementById('reader-post-nav');
        if (postNavEl) {
          postNavEl.style.display = 'none';
          postNavEl.innerHTML = '';
        }
        return item;
      }

  function encodeHtmlAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function resolveAuthor(authorName) {
    const defaultAuthor = (getConfig().defaultAuthor || 'Author').trim();
    const targetName = (authorName || defaultAuthor || 'Author').trim();
    const authors = Array.isArray(getConfig().authors) ? getConfig().authors : [];
    const match = authors.find(a => {
      const aName = (typeof a === 'object' && a !== null) ? (a.name || '') : String(a || '');
      return aName.trim().toLowerCase() === targetName.toLowerCase();
    });

    let avatar = '';
    let banner = '';
    let bio = '';
    let joinDate = '';

    if (match && typeof match === 'object') {
      avatar = match.avatar || '';
      banner = match.banner || match.background || '';
      bio = match.bio || '';
      joinDate = match.joinDate || '';
    }


    if (avatar && !/^(https?:|data:|blob:|\/)/i.test(avatar)) {
      avatar = '/' + avatar;
    }

    if (!joinDate) {
      joinDate = 'Joined ' + new Date().getFullYear();
    } else if (!joinDate.toLowerCase().startsWith('joined')) {
      const parts = joinDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        joinDate = 'Joined ' + d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      } else {
        joinDate = 'Joined ' + joinDate;
      }
    }

    const cleanDomain = (getConfig().domain || 'cedar.site').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const cleanHandle = targetName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const handle = `@${cleanHandle}.${cleanDomain}`;

    return {
      name: targetName,
      initial: (targetName.charAt(0) || 'A').toUpperCase(),
      avatar: avatar,
      banner: banner,
      bio: bio,
      joinDate: joinDate,
      handle: handle
    };
  }



  function renderAuthorProfile(authorName) {
    document.body.classList.remove('is-links-page');
    document.documentElement.classList.remove('is-links-page');
    const vHome = document.getElementById('view-home');
    const vPosts = document.getElementById('view-posts');
    const vReader = document.getElementById('view-reader');
    const vAuthor = document.getElementById('view-author');

    const wasAuthorActive = Boolean(vAuthor && vAuthor.style.display === 'block');
    const prevScrollY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;

    if (vHome) vHome.style.display = 'none';
    if (vPosts) vPosts.style.display = 'none';
    if (vReader) vReader.style.display = 'none';
    if (vAuthor) vAuthor.style.display = 'block';

    if (!wasAuthorActive) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (prevScrollY > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: prevScrollY, behavior: 'instant' }));
    }
    updateNavLinks('author');

    const cleanTarget = decodeURIComponent(authorName || '').trim();
    const authorObj = resolveAuthor(cleanTarget);

    const isLinks = (d) => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData));
    const authorPosts = (getDrafts() || [])
      .filter(d => (d.type === 'post' || !d.type) && d.type !== 'page' && d.status === 'published' && !d.hidden && !d.retired && !isLinks(d))
      .filter(d => {
        const a = (d.author || d.authorName || getConfig().defaultAuthor || 'Author').trim().toLowerCase();
        return a === cleanTarget.toLowerCase();
      })
      .sort((a, b) => new Date(b.publishedDate || b.date || 0) - new Date(a.publishedDate || a.date || 0));

    // Top Bar
    const topBarName = document.getElementById('author-top-bar-name');
    const topBarCount = document.getElementById('author-top-bar-count');
    if (topBarName) topBarName.textContent = authorObj.name;
    if (topBarCount) topBarCount.textContent = `${authorPosts.length} article${authorPosts.length === 1 ? '' : 's'}`;

    // Back button
    const backBtn = document.getElementById('btn-author-back');
    if (backBtn && !backBtn._bound) {
      backBtn._bound = true;
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const vAuth = document.getElementById('view-author');
        if (vAuth) vAuth.style.display = 'none';
        if (window.history.length > 1) {
          window.history.back();
        } else if (typeof window.navigateTo === 'function') {
          window.navigateTo('/');
        } else {
          window.location.hash = '#/';
        }
      });
    }

    // Banner Background
    const bannerEl = document.getElementById('author-profile-banner');
    if (bannerEl) {
      if (authorObj.banner) {
        bannerEl.style.backgroundImage = `url("${authorObj.banner}")`;
      } else {
        bannerEl.style.backgroundImage = 'linear-gradient(135deg, #27272a 0%, #18181b 100%)';
      }
    }

    // Avatar
    const avatarWrap = document.getElementById('author-profile-avatar-wrap');
    if (avatarWrap) {
      let resolvedAv = authorObj.avatar;
      if (resolvedAv && !/^(https?:|data:|blob:|\/)/i.test(resolvedAv)) {
        resolvedAv = '/' + resolvedAv;
      }
      if (resolvedAv) {
        avatarWrap.innerHTML = `<img src="${escapeHtml(resolvedAv)}" alt="${escapeHtml(authorObj.name)}" onerror="this.parentElement.textContent='${escapeHtml(authorObj.initial)}'">`;
      } else {
        avatarWrap.textContent = authorObj.initial;
      }
    }

    // Name & Handle
    const nameEl = document.getElementById('author-profile-display-name');
    const handleEl = document.getElementById('author-profile-handle');
    if (nameEl) nameEl.textContent = authorObj.name;
    if (handleEl) handleEl.textContent = authorObj.handle;

    // Stats
    const statPosts = document.getElementById('author-stat-posts');
    const statPostsLabel = document.getElementById('author-stat-posts-label');
    const statJoin = document.getElementById('author-stat-join');
    if (statPosts) statPosts.textContent = authorPosts.length;
    if (statPostsLabel) {
      statPostsLabel.textContent = authorPosts.length === 1 ? 'article' : 'articles';
    } else if (statPosts && statPosts.parentElement) {
      statPosts.parentElement.innerHTML = `<strong id="author-stat-posts">${authorPosts.length}</strong> <span id="author-stat-posts-label">${authorPosts.length === 1 ? 'article' : 'articles'}</span>`;
    }
    if (statJoin) statJoin.textContent = authorObj.joinDate;

    // Bio
    const bioEl = document.getElementById('author-profile-bio');
    if (bioEl) {
      if (authorObj.bio && authorObj.bio.trim()) {
        bioEl.textContent = authorObj.bio.trim();
        bioEl.style.display = 'block';
      } else {
        bioEl.style.display = 'none';
      }
    }

    // Content Stream
    const streamEl = document.getElementById('author-tab-content-stream');
    if (streamEl) {
      if (authorPosts.length === 0) {
        streamEl.innerHTML = `
          <div style="text-align: center; padding: 3rem 1rem; color: var(--text-dim); background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 12px;">
            <p style="font-size: 1rem; margin-bottom: 0.25rem;">No published articles by this author yet.</p>
          </div>
        `;
      } else {
        streamEl.innerHTML = `
          <div class="posts-grid cols-2" style="width: 100%;">
            ${authorPosts.map(p => (typeof window.createPostCardHtml === 'function') ? window.createPostCardHtml(p, { showExcerpt: true, showDate: true, showAuthor: false, showCategoryBadge: true }) : '').join('')}
          </div>
        `;
      }
    }

    return authorObj;
  }

  window.CedarPreview.renderAllPosts = renderAllPosts;
  window.OutpostPreview.renderAllPosts = renderAllPosts;
  window.CedarPreview.renderAllPostsGrid = renderAllPostsGrid;
  window.OutpostPreview.renderAllPostsGrid = renderAllPostsGrid;
  window.CedarPreview.renderReader = renderReader;
  window.OutpostPreview.renderReader = renderReader;
  window.CedarPreview.renderAuthorProfile = renderAuthorProfile;
  window.OutpostPreview.renderAuthorProfile = renderAuthorProfile;
  window.CedarPreview.isMatchingImage = isMatchingImage;
  window.OutpostPreview.isMatchingImage = isMatchingImage;

  window.renderAllPosts = renderAllPosts;
  window.renderAllPostsGrid = renderAllPostsGrid;
  window.renderReader = renderReader;
  window.renderAuthorProfile = renderAuthorProfile;
  window.isMatchingImage = isMatchingImage;
})();
