(function() {
  function initSearch() {
    const btn = document.getElementById('nav-search-btn');
    const modal = document.getElementById('search-modal');
    if (!btn || !modal) return;

    const input = document.getElementById('search-modal-input');
    const resultsContainer = document.getElementById('search-modal-results');

    function openModal() {
      modal.style.display = 'flex';
      input.value = '';
      resultsContainer.innerHTML = '';
      input.focus();
    }

    function closeModal() {
      modal.style.display = 'none';
    }

    if (btn) btn.addEventListener('click', openModal);
    document.addEventListener('click', (e) => {
      const searchBtn = e.target.closest('#nav-search-btn');
      if (searchBtn) {
        e.preventDefault();
        openModal();
      }
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('search-modal-wrap')) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch(input.value.trim());
      }
    });
    
    let timeout;
    input.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        performSearch(input.value.trim());
      }, 300);
    });
  }

  function getSearchScore(post, query) {
    const q = query.toLowerCase();
    const title = (post.title || '').toLowerCase();
    const desc = (post.excerpt || post.description || '').toLowerCase();
    const cat = (post.tag || (post.categories && post.categories[0]) || '').toLowerCase();
    const markdown = (post.markdown || '').toLowerCase();
    
    if (title === q) return 100;
    if (title.includes(q)) return 50;
    if (cat.includes(q)) return 30;
    if (desc.includes(q)) return 20;
    
    const qChars = q.replace(/\s+/g, '');
    let i = 0, j = 0;
    while (i < qChars.length && j < title.length) {
      if (qChars[i] === title[j]) i++;
      j++;
    }
    if (i === qChars.length) return 10;
    
    if (markdown.includes(q)) return 5;
    
    return 0;
  }

  function resolveItemImage(item) {
    if (!item) return '';
    if (typeof window.getPostFeaturedImage === 'function') {
      const feat = window.getPostFeaturedImage(item);
      if (feat) return feat;
    }
    if (typeof window.resolvePostImage === 'function') {
      const r = window.resolvePostImage(item.coverImage || item.featuredImage, item);
      if (r) return r;
    }
    const cand = item.coverImage || item.featuredImage || '';
    if (/^(data:|blob:|https?:\/\/)/i.test(cand)) return cand;
    if (typeof window.resolveAssetUrl === 'function') {
      return window.resolveAssetUrl(cand);
    }
    return cand;
  }

  function performSearch(query) {
    const resultsContainer = document.getElementById('search-modal-results');
    if (!query) {
      resultsContainer.innerHTML = '';
      return;
    }

    const drafts = window.drafts || [];
    const publishedPosts = drafts.filter(d => (d.type === 'post' || !d.type) && d.type !== 'page' && d.type !== 'note' && !d.isCategoryAggregate && !String(d.id).startsWith('page_') && d.status === 'published' && !d.hidden && !d.retired);
    const publishedPages = drafts.filter(d => d.type === 'page' && !d.hidden && !d.retired && d.slug !== 'about-cedar' && d.id !== 'page_about_cedar');
    const authors = (window.projectConfig && window.projectConfig.authors) ? window.projectConfig.authors : [];

    const matchedAuthors = authors.filter(a => {
      const n = (typeof a === 'object' ? a.name : String(a)).toLowerCase();
      const r = (a && typeof a === 'object' && a.role ? a.role : '').toLowerCase();
      const b = (a && typeof a === 'object' && a.bio ? a.bio : '').toLowerCase();
      const h = (a && typeof a === 'object' && a.handle ? a.handle : '').toLowerCase();
      const q = query.toLowerCase();
      return n.includes(q) || r.includes(q) || b.includes(q) || h.includes(q);
    });

    const scoredPosts = publishedPosts.map(p => ({ post: p, score: getSearchScore(p, query) }))
                                      .filter(x => x.score > 0)
                                      .sort((a, b) => b.score - a.score);

    const scoredPages = publishedPages.map(p => ({ page: p, score: getSearchScore(p, query) }))
                                      .filter(x => x.score > 0)
                                      .sort((a, b) => b.score - a.score);

    let html = '';

    if (matchedAuthors.length > 0) {
      html += `<div class="search-section-title">PEOPLE</div>`;
      matchedAuthors.forEach(a => {
        const aName = (typeof a === 'object' ? a.name : String(a)) || 'Author';
        const rawAvatar = (typeof window.getAuthorAvatar === 'function') ? window.getAuthorAvatar(a) : (a && typeof a === 'object' ? a.avatar : '');
        let resolvedAvatar = (typeof window.resolvePostImage === 'function' ? window.resolvePostImage(rawAvatar) : rawAvatar) || (typeof window.resolveAssetUrl === 'function' ? window.resolveAssetUrl(rawAvatar) : rawAvatar) || '';
        const initial = escapeHtml(aName.trim().charAt(0).toUpperCase() || 'A');
        html += `
          <a href="#/author/${encodeURIComponent(aName)}" class="search-result-item" onclick="document.getElementById('search-modal').style.display='none'">
            <div class="search-result-avatar search-result-fallback" style="width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; position: relative; overflow: hidden; background: var(--border-card); display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">${initial}</span>
              ${resolvedAvatar ? `<img src="${escapeHtml(resolvedAvatar)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.remove();">` : ''}
            </div>
            <div class="search-result-info">
              <div class="search-result-title">${escapeHtml(aName)}</div>
            </div>
          </a>
        `;
      });
    }

    if (scoredPosts.length > 0) {
      html += `<div class="search-section-title">POSTS</div>`;
      scoredPosts.forEach(item => {
        const p = item.post;
        const postImg = resolveItemImage(p);
        const fallbackIcon = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`;
        const imgHtml = `
          <div class="search-result-img search-result-fallback" style="width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0; position: relative; overflow: hidden; background: var(--border-card); display: flex; align-items: center; justify-content: center;">
            <span style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${fallbackIcon}</span>
            ${postImg ? `<img src="${escapeHtml(postImg)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" onerror="this.remove();">` : ''}
          </div>
        `;
        
        const dateObj = new Date(p.publishedDate || p.date || Date.now());
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        
        html += `
          <a href="${window.buildPostUrl(p)}" class="search-result-item" onclick="document.getElementById('search-modal').style.display='none'">
            ${imgHtml}
            <div class="search-result-info">
              <div class="search-result-title">${escapeHtml(p.title || 'Untitled Post')}</div>
            </div>
            ${dateStr ? `<div class="search-result-date">&middot; ${dateStr}</div>` : ''}
          </a>
        `;
      });
    }

    if (scoredPages.length > 0) {
      html += `<div class="search-section-title">PAGES</div>`;
      scoredPages.forEach(item => {
        const p = item.page;
        const pageImg = resolveItemImage(p);
        const isCat = Boolean(p.isCategoryAggregate || String(p.id).startsWith('page_cat_'));
        const iconSvg = isCat
          ? `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>`
          : `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        const imgHtml = `
          <div class="search-result-img search-result-fallback" style="width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0; position: relative; overflow: hidden; background: var(--border-card); display: flex; align-items: center; justify-content: center;">
            <span style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${iconSvg}</span>
            ${pageImg ? `<img src="${escapeHtml(pageImg)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" onerror="this.remove();">` : ''}
          </div>
        `;
        
        const pageUrl = window.buildPostUrl(p);
        const tagLabel = isCat ? 'Category' : 'Page';

        html += `
          <a href="${pageUrl}" class="search-result-item" onclick="document.getElementById('search-modal').style.display='none'">
            ${imgHtml}
            <div class="search-result-info">
              <div class="search-result-title">${escapeHtml(p.title || 'Untitled Page')}</div>
            </div>
            <div class="search-result-date" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7;">${tagLabel}</div>
          </a>
        `;
      });
    }

    if (!html) {
      html = `<div class="search-result-empty">No results found for "${escapeHtml(query)}"</div>`;
    }

    resultsContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', initSearch);
  window.initSearchModal = initSearch;
})();






