/**
 * Cedar - Universal Global Search Engine
 * Multi-entity full-text search across posts, notes, static pages, media assets,
 * categories, and tags with keyboard shortcuts and highlight navigation.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  function setupGlobalSearch() {
    const searchWrap = document.getElementById('dash-global-search-container');
    const searchInput = document.getElementById('dash-global-search-input');
    const clearBtn = document.getElementById('dash-search-clear-btn');
    const resultsDropdown = document.getElementById('dash-search-results-dropdown');
    if (!searchInput || !resultsDropdown) return;

    let selectedIndex = -1;

    // Ctrl+K / Cmd+K global shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (searchWrap && !searchWrap.contains(e.target)) {
        closeDropdown();
      }
    });

    function closeDropdown() {
      resultsDropdown.style.display = 'none';
      resultsDropdown.innerHTML = '';
      selectedIndex = -1;
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        closeDropdown();
        searchInput.focus();
      });
    }

    function highlightText(text, q) {
      if (!text) return '';
      const safe = escapeHtml(text);
      if (!q) return safe;
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedQ})`, 'gi');
      return safe.replace(regex, '<mark>$1</mark>');
    }

    function extractSnippet(fullText, q) {
      if (!fullText) return '';
      const lower = fullText.toLowerCase();
      const idx = lower.indexOf(q.toLowerCase());
      if (idx === -1) {
        return escapeHtml(fullText.slice(0, 75)) + (fullText.length > 75 ? '...' : '');
      }
      const start = Math.max(0, idx - 25);
      const end = Math.min(fullText.length, idx + q.length + 45);
      let snippet = fullText.slice(start, end);
      if (start > 0) snippet = '...' + snippet;
      if (end < fullText.length) snippet = snippet + '...';
      return highlightText(snippet, q);
    }

    function updateSelection(items) {
      items.forEach((it, i) => {
        if (i === selectedIndex) {
          it.classList.add('selected');
          it.scrollIntoView({ block: 'nearest' });
        } else {
          it.classList.remove('selected');
        }
      });
    }

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
      if (!q) {
        closeDropdown();
        return;
      }

      const qLower = q.toLowerCase();

      const isLinks = (typeof window.isLinksDraft === 'function')
        ? window.isLinksDraft
        : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));

      // 1. Search Posts (Drafts, Published - excluding notes/ideas/links)
      const postMatches = drafts.filter(d => d.type !== 'page' && d.type !== 'note' && d.status !== 'idea' && !isLinks(d)).filter(d => {
        return (d.title && d.title.toLowerCase().includes(qLower)) ||
               (d.markdown && d.markdown.toLowerCase().includes(qLower)) ||
               (d.tag && d.tag.toLowerCase().includes(qLower)) ||
               (d.subtitle && d.subtitle.toLowerCase().includes(qLower)) ||
               (d.slug && d.slug.toLowerCase().includes(qLower));
      }).slice(0, 6);

      // 1b. Search Ideas
      const ideaMatches = drafts.filter(d => d.type !== 'page' && d.status === 'idea' && !isLinks(d)).filter(d => {
        return (d.title && d.title.toLowerCase().includes(qLower)) ||
               (d.markdown && d.markdown.toLowerCase().includes(qLower));
      }).slice(0, 4);

      // 2. Search Static Pages
      const pageMatches = drafts.filter(d => (d.type === 'page' || isLinks(d)) && d.id !== 'page_about_cedar' && d.slug !== 'about-cedar').filter(d => {
        return (d.title && d.title.toLowerCase().includes(qLower)) ||
               (d.markdown && d.markdown.toLowerCase().includes(qLower)) ||
               (d.slug && d.slug.toLowerCase().includes(qLower));
      }).slice(0, 4);

      // 3. Search Media Assets
      const allImages = getAllUniqueImages();
      const mediaMatches = allImages.filter(img => {
        return (img.filename && img.filename.toLowerCase().includes(qLower)) ||
               (img.postTitle && img.postTitle.toLowerCase().includes(qLower)) ||
               (img.alt && img.alt.toLowerCase().includes(qLower)) ||
               (img.caption && img.caption.toLowerCase().includes(qLower));
      }).slice(0, 4);

      // 4. Search Categories / Tags
      const allCategories = (projectConfig.categories || []);
      const tagMatches = allCategories.filter(cat => cat.toLowerCase().includes(qLower)).slice(0, 4);

      const totalMatches = postMatches.length + noteMatches.length + pageMatches.length + mediaMatches.length + tagMatches.length;

      if (totalMatches === 0) {
        resultsDropdown.innerHTML = `
          <div class="search-empty-state">
            <div class="empty-icon">🔍</div>
            <div>No matching posts, notes, pages, tags, or media found for "<strong>${escapeHtml(q)}</strong>"</div>
          </div>
        `;
        resultsDropdown.style.display = 'block';
        selectedIndex = -1;
        return;
      }

      let html = '';

      // Render Posts
      if (postMatches.length > 0) {
        html += `<div class="search-group-header"><span>Posts</span><span>${postMatches.length}</span></div>`;
        postMatches.forEach(p => {
          const pillClass = p.status === 'published' ? 'pill-published' : 'pill-draft';
          const pillLabel = p.status === 'published' ? 'Published' : 'Draft';
          const icon = p.status === 'published' ? '🚀' : '📝';
          const snippet = extractSnippet(p.markdown || p.subtitle || p.slug, q);
          html += `
            <div class="search-result-item" data-action="open-post" data-id="${escapeHtml(p.id)}">
              <div class="search-result-icon">${icon}</div>
              <div class="search-result-content">
                <div class="search-result-title-row">
                  <span class="search-result-title">${highlightText(p.title || 'Untitled', q)}</span>
                  <span class="search-result-pill ${pillClass}">${pillLabel}</span>
                  ${p.tag ? `<span class="search-result-pill pill-tag">${escapeHtml(p.tag)}</span>` : ''}
                </div>
                <div class="search-result-snippet">${snippet}</div>
              </div>
            </div>
          `;
        });
      }

      // Render Ideas
      if (ideaMatches.length > 0) {
        html += `<div class="search-group-header"><span>Ideas</span><span>${ideaMatches.length}</span></div>`;
        ideaMatches.forEach(n => {
          const snippet = extractSnippet(n.markdown || n.title, q);
          html += `
            <div class="search-result-item" data-action="open-idea" data-id="${escapeHtml(n.id)}">
              <div class="search-result-icon">💡</div>
              <div class="search-result-content">
                <div class="search-result-title-row">
                  <span class="search-result-title">${highlightText(n.title || 'Untitled Idea', q)}</span>
                  <span class="search-result-pill pill-idea">Idea</span>
                </div>
                <div class="search-result-snippet">${snippet}</div>
              </div>
            </div>
          `;
        });
      }

      // Render Static Pages
      if (pageMatches.length > 0) {
        html += `<div class="search-group-header"><span>Static Pages</span><span>${pageMatches.length}</span></div>`;
        pageMatches.forEach(p => {
          const snippet = extractSnippet(p.markdown || p.slug, q);
          html += `
            <div class="search-result-item" data-action="open-page" data-id="${escapeHtml(p.id)}">
              <div class="search-result-icon">📄</div>
              <div class="search-result-content">
                <div class="search-result-title-row">
                  <span class="search-result-title">${highlightText(p.title || 'Untitled Page', q)}</span>
                  <span class="search-result-pill pill-page">Page</span>
                </div>
                <div class="search-result-snippet">${snippet}</div>
              </div>
            </div>
          `;
        });
      }

      // Render Media Assets
      if (mediaMatches.length > 0) {
        html += `<div class="search-group-header"><span>Media Assets</span><span>${mediaMatches.length}</span></div>`;
        mediaMatches.forEach(m => {
          const src = m.dataUrl || (m.blob ? URL.createObjectURL(m.blob) : '');
          html += `
            <div class="search-result-item" data-action="open-media" data-filename="${escapeHtml(m.filename)}">
              <div class="search-result-icon">
                ${src ? `<img src="${src}" alt="${escapeHtml(m.filename)}">` : '🖼️'}
              </div>
              <div class="search-result-content">
                <div class="search-result-title-row">
                  <span class="search-result-title">${highlightText(m.filename, q)}</span>
                  <span class="search-result-pill pill-media">Media</span>
                </div>
                <div class="search-result-snippet">${m.postTitle ? `In post: ${escapeHtml(m.postTitle)}` : ''}</div>
              </div>
            </div>
          `;
        });
      }

      // Render Tags
      if (tagMatches.length > 0) {
        html += `<div class="search-group-header"><span>Tags & Categories</span><span>${tagMatches.length}</span></div>`;
        tagMatches.forEach(tag => {
          const count = drafts.filter(d => d.tag === tag).length;
          html += `
            <div class="search-result-item" data-action="filter-tag" data-tag="${escapeHtml(tag)}">
              <div class="search-result-icon">🏷️</div>
              <div class="search-result-content">
                <div class="search-result-title-row">
                  <span class="search-result-title">${highlightText(tag, q)}</span>
                  <span class="search-result-pill pill-tag">${count} ${count === 1 ? 'post' : 'posts'}</span>
                </div>
                <div class="search-result-snippet">Filter pipeline by category</div>
              </div>
            </div>
          `;
        });
      }

      html += `
        <div class="search-dropdown-footer">
          <span>↑↓ to navigate • ↵ to select</span>
          <span>Esc to dismiss</span>
        </div>
      `;

      resultsDropdown.innerHTML = html;
      resultsDropdown.style.display = 'block';
      selectedIndex = -1;

      // Click listeners
      resultsDropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          executeSearchAction(item);
        });
      });
    });

    function executeSearchAction(item) {
      if (!item) return;
      const action = item.dataset.action;
      const id = item.dataset.id;
      const filename = item.dataset.filename;
      const tag = item.dataset.tag;

      closeDropdown();
      searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';

      if (action === 'open-post' || action === 'open-page' || action === 'open-idea' || action === 'open-note') {
        openPostInEditor(id);
      } else if (action === 'open-media') {
        navigateTo('media');
        const mediaSearch = document.getElementById('media-search-input');
        if (mediaSearch) {
          mediaSearch.value = filename;
          renderDerivedMediaLibrary();
        }
      } else if (action === 'filter-tag') {
        navigateTo('posts');
        const catFilter = document.getElementById('select-category-filter');
        if (catFilter) {
          catFilter.value = tag;
          renderDashboardPipeline();
        }
      }
    }

    searchInput.addEventListener('keydown', (e) => {
      const items = Array.from(resultsDropdown.querySelectorAll('.search-result-item'));
      if (!items.length || resultsDropdown.style.display === 'none') {
        if (e.key === 'Escape') closeDropdown();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelection(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          executeSearchAction(items[selectedIndex]);
        } else if (items.length > 0) {
          executeSearchAction(items[0]);
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });
  }

  window.setupGlobalSearch = setupGlobalSearch;

  Object.assign(window.Cedar.dashboard, {
    setupGlobalSearch
  });
})();
