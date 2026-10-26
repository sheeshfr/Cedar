/**
 * Cedar - Post Pipeline & Grid Management
 * Handles kanban pipeline columns, all-posts grid view, quick ideas list,
 * and quick idea multiline input textarea resizing.
 */
(function () {
  'use strict';
  let resizeQuickIdeaInput;


  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  let quickIdeasExpanded = false;

  function renderPostsPipeline() {
    let posts = (window.CedarStore && typeof window.CedarStore.getPosts === 'function')
      ? window.CedarStore.getPosts()
      : (Array.isArray(window.drafts) ? window.drafts.filter(d => (!d.type || d.type === 'post') && d.type !== 'page') : []);

    posts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const ideas = posts.filter(p => p.status === 'idea');
    renderQuickIdeasList(ideas);

    const cardsDrafts = document.getElementById('cards-drafts');
    const cardsPub = document.getElementById('cards-published');
    if (cardsDrafts || cardsPub) {
      const activePosts = posts.filter(d => d.type !== 'note' && d.status !== 'idea');
      const draftsList = activePosts.filter(p => !p.status || p.status === 'draft');
      const published = activePosts.filter(p => p.status === 'published');
      if (cardsDrafts) renderPipelineColumn('cards-drafts', draftsList, 'draft');
      if (cardsPub) renderPipelineColumn('cards-published', published, 'published');
    }
  }


  function renderQuickIdeasList(ideas) {
    const listContainer = document.getElementById('quick-ideas-list');
    const toggleBtn = document.getElementById('btn-quick-ideas-toggle');
    if (!listContainer) return;

    if (ideas.length === 0) {
      listContainer.innerHTML = '<div class="quick-ideas-empty">No quick ideas yet. Jot down ideas on the left!</div>';
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    const maxVisible = 3;
    const isOverLimit = ideas.length > maxVisible;
    const visibleIdeas = ideas.slice(0, maxVisible);

    listContainer.innerHTML = '';
    visibleIdeas.forEach(post => {
      const item = document.createElement('div');
      item.className = 'quick-idea-item';
      item.dataset.id = post.id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.title = 'Click to edit idea';

      const ideaText = post.markdown || post.title || '';

      item.innerHTML = `
        <button type="button" class="quick-idea-delete-btn" data-action="delete" title="Delete Idea" aria-label="Delete Idea">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"></line><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"></line></svg>
        </button>
        <div class="quick-idea-text">${escapeHtml(ideaText)}</div>
      `;

      item.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete"]');
        if (delBtn) {
          e.stopPropagation();
          deleteItem(post.id);
          return;
        }
        if (typeof openPostInEditor === 'function') openPostInEditor(post.id);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof openPostInEditor === 'function') openPostInEditor(post.id);
        }
      });

      listContainer.appendChild(item);
    });

    if (toggleBtn) {
      if (isOverLimit) {
        toggleBtn.style.display = 'block';
        toggleBtn.textContent = 'Show More Ideas';
      } else {
        toggleBtn.style.display = 'none';
      }
    }
  }


  const POSTS_PAGE_SIZE = 20;
  window._postsColumnPages = window._postsColumnPages || {};

  function createMoreCard(columnType, remainingCount, totalCount) {
    const card = document.createElement('div');
    card.className = 'pipeline-card posts-more-card';
    const subRoute = (columnType === 'draft') ? 'drafts' : columnType;
    card.dataset.targetSub = subRoute;

    const labelMap = {
      draft: 'Drafts',
      published: 'Published Posts',
      hidden: 'Hidden Posts'
    };
    const label = labelMap[columnType] || 'Posts';

    card.innerHTML = `
      <div class="posts-more-card-inner">
        <div class="posts-more-card-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
        <div class="posts-more-card-count">+${remainingCount} More ${label}</div>
        <div class="posts-more-card-sub">View all ${totalCount} &rarr;</div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateTo(subRoute);
    });

    return card;
  }

  function createPipelineCardElement(post, columnType) {
    const card = document.createElement('div');
    card.dataset.id = post.id;

    let actionsHtml = '';
    if (columnType === 'idea') {
      actionsHtml = `
        <button type="button" class="card-btn" data-action="promote-to-draft" title="Start writing this post">Start Draft &rarr;</button>
      `;
    }

    if (columnType === 'idea') {
      card.className = 'pipeline-card card-idea';
      const ideaText = post.markdown || post.title || '';
      const isMulti = ideaText.includes('\n') || ideaText.length > 50;
      if (isMulti) card.classList.add('card-idea-multiline');

      card.innerHTML = `
        <button type="button" class="card-idea-delete-btn" data-action="delete" title="Delete Idea" aria-label="Delete Idea">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"></line><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"></line></svg>
        </button>
        <div class="card-scratchpad-text" contenteditable="plaintext-only" data-placeholder="Write your note here...">${escapeHtml(ideaText)}</div>
        <div class="card-actions-bar">
          ${actionsHtml}
        </div>
      `;

      const padEl = card.querySelector('.card-scratchpad-text');
      if (padEl) {
        padEl.addEventListener('click', (e) => e.stopPropagation());

        const updateLayout = () => {
          const val = padEl.innerText.trim();
          const multi = val.includes('\n') || val.length > 50;
          card.classList.toggle('card-idea-multiline', multi);
        };

        padEl.addEventListener('input', () => {
          const val = padEl.innerText.trim();
          post.markdown = padEl.innerText;
          post.title = val.split('\n')[0] || 'Untitled Idea';
          post.updatedAt = Date.now();
          saveDraftsToStorage();
          updateLayout();
        });

        padEl.addEventListener('blur', () => {
          post.markdown = padEl.innerText;
          const val = padEl.innerText.trim();
          post.title = val.split('\n')[0] || 'Untitled Idea';
          post.updatedAt = Date.now();
          saveDraftsToStorage();
          renderDashboard();
        });
      }
    } else {
      const isHiddenCol = (columnType === 'hidden');
      card.className = `pipeline-card card-${columnType}`;
      const isPublished = (columnType === 'published');

      const rawPubDate = post.publishedDate || post.date || post.publishedAt || post.createdAt || post.updatedAt;
      const dateDisplay = (isPublished && rawPubDate)
        ? (typeof window.formatDateDisplay === 'function'
            ? window.formatDateDisplay(rawPubDate)
            : new Date(rawPubDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: '2-digit' }))
        : '';

      let coverHtml = '';
      const resolvedCover = (typeof getPostFeaturedImage === 'function')
        ? getPostFeaturedImage(post)
        : (typeof resolvePostImage === 'function' ? resolvePostImage(post.coverImage || post.featuredImage, post) : '');

      if (resolvedCover) {
        const mutedColor = (typeof getMutedCoverColor === 'function')
          ? getMutedCoverColor(post.id || post.slug || post.title)
          : '#27272a';
        coverHtml = `
          <div class="card-cover-wrap" style="background-color: ${mutedColor};">
            <img src="${escapeHtml(resolvedCover)}" alt="" class="card-cover-thumb" onerror="if (this.parentElement) this.parentElement.style.display='none';">
          </div>
        `;
      }

      const designCfg = (window.projectConfig && window.projectConfig.design) || {};
      const spotlightBlock = Array.isArray(designCfg.homeBlocks) ? designCfg.homeBlocks.find(b => b.type === 'spotlight' && b.enabled !== false) : null;
      const isFeaturedEnabled = designCfg.featured !== false && Boolean(spotlightBlock || designCfg.featured === true);
      const effectiveMode = designCfg.featuredMode || (spotlightBlock && spotlightBlock.config && spotlightBlock.config.featuredMode) || 'latest';
      const showManualStar = isFeaturedEnabled && effectiveMode === 'manual';

      const isStarred = Boolean(post.starred || post.featured || post.isFeatured);
      const starBtnHtml = showManualStar ? `
        <button type="button" class="card-btn-star ${isStarred ? 'is-starred' : ''}" data-action="toggle-star" title="${isStarred ? 'Featured Story (Click to Unfeature)' : 'Feature Story on Homepage'}" aria-label="Toggle Featured Story" style="background: none; border: none; cursor: pointer; padding: 4px; display: inline-flex; align-items: center; justify-content: center; color: ${isStarred ? '#f59e0b' : 'var(--text-muted, #71717a)'}; border-radius: 6px; flex-shrink: 0; transition: transform 0.15s ease, color 0.15s ease;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isStarred ? '#f59e0b' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
      ` : '';

      const cornerBtnHtml = isPublished
        ? `<button type="button" class="card-hover-delete-btn card-hover-revert-btn" data-action="revert-draft" title="Revert to Draft" aria-label="Revert to Draft"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg></button>`
        : `<button type="button" class="card-hover-delete-btn" data-action="delete" title="Delete Draft" aria-label="Delete Draft">&times;</button>`;

      card.innerHTML = `
        ${cornerBtnHtml}
        ${coverHtml}
        <div class="card-content-wrap">
          <div class="card-main-header" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="flex: 1; min-width: 0;">
              <h4 class="card-title">${escapeHtml(post.title || 'Untitled Post')}</h4>
            </div>
            ${starBtnHtml}
          </div>
          ${post.subtitle ? `<p class="card-excerpt">${escapeHtml(post.subtitle)}</p>` : ''}
          ${dateDisplay ? `<div class="card-date">${escapeHtml(dateDisplay)}</div>` : ''}
        </div>
      `;
    }

    card.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'toggle-star') {
          const nextVal = !(post.starred || post.featured || post.isFeatured);
          if (nextVal && Array.isArray(window.drafts)) {
            window.drafts.forEach(d => {
              if (d && d !== post && String(d.id) !== String(post.id)) {
                d.starred = false;
                d.featured = false;
                d.isFeatured = false;
              }
            });
          }
          post.starred = nextVal;
          post.featured = nextVal;
          post.isFeatured = nextVal;
          post.updatedAt = Date.now();
          saveDraftsToStorage();
          renderAllPostsGrid();
          if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
          if (typeof showToast === 'function') {
            showToast(nextVal ? `⭐ Set "${post.title || 'Untitled'}" as Featured Story` : `Removed "${post.title || 'Untitled'}" from Featured Story`);
          }
          return;
        } else if (action === 'publish') {
          setItemStatus(post.id, 'published');
          saveDraftsToStorage();
          renderAllPostsGrid();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
          if (typeof updateAllPreviewFrames === 'function') updateAllPreviewFrames();
          if (typeof showToast === 'function') showToast(`Post "${post.title || 'Untitled'}" published`);
        } else if (action === 'promote-to-draft') {
          if (!post.title || post.title === 'Untitled Idea') {
            const text = (post.markdown || '').trim();
            post.title = text.split('\n')[0].slice(0, 80) || 'Untitled Post';
          }
          setItemStatus(post.id, 'draft');
          openPostInEditor(post.id);
        } else if (action === 'edit') {
          openPostInEditor(post.id);
        } else if (action === 'hide') {
          post.hidden = true;
          post.retired = true;
          saveDraftsToStorage();
          renderAllPostsGrid();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
          if (typeof showToast === 'function') showToast(`Post "${post.title}" hidden from public site`);
        } else if (action === 'unhide') {
          post.hidden = false;
          post.retired = false;
          saveDraftsToStorage();
          renderAllPostsGrid();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
          if (typeof showToast === 'function') showToast(`Post "${post.title}" is now visible`);
        } else if (action === 'revert-draft') {
          const confirmed = (typeof window.showConfirmDialog === 'function')
            ? await window.showConfirmDialog({
                title: 'Revert to Draft?',
                message: `Are you sure you want to revert "${post.title || 'Untitled'}" back to a draft?`,
                confirmText: 'Revert to Draft',
                isDanger: true
              })
            : confirm(`Are you sure you want to revert "${post.title || 'Untitled'}" to a draft?`);
          if (!confirmed) return;
          setItemStatus(post.id, 'draft');
          if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
          if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
            window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
          }
          if (typeof renderAllPostsGrid === 'function') renderAllPostsGrid();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
          if (typeof updateAllPreviewFrames === 'function') updateAllPreviewFrames();
          if (typeof showToast === 'function') showToast(`Post "${post.title || 'Untitled'}" reverted to draft`);
        } else if (action === 'delete') {
          if (columnType !== 'idea') {
            const confirmed = (typeof window.showConfirmDialog === 'function')
              ? await window.showConfirmDialog({
                  title: 'Delete Draft?',
                  message: `Are you sure you want to delete "${post.title || 'Untitled'}"?`,
                  confirmText: 'Delete',
                  isDanger: true
                })
              : confirm(`Are you sure you want to delete "${post.title || 'Untitled'}"?`);
            if (!confirmed) return;
            await deleteItem(post.id, { skipConfirm: true });
          } else {
            deleteItem(post.id);
          }
          renderAllPostsGrid();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
        }
        return;
      }
      if (columnType === 'idea') {
        const padEl = card.querySelector('.card-scratchpad-text');
        if (padEl) padEl.focus();
        return;
      }
      openPostInEditor(post.id);
    });

    return card;
  }

  function renderPipelineColumn(containerId, items, columnType, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (items.length === 0) {
      const emptyLabel = columnType === 'draft'
        ? 'No draft posts yet'
        : (columnType === 'published'
          ? 'No published posts yet'
          : (columnType === 'hidden'
            ? 'No hidden posts'
            : 'No items yet'));
      container.innerHTML = `
        <div class="pipeline-empty-state" style="grid-column: 1 / -1;">
          <div class="empty-text">${emptyLabel}</div>
        </div>
      `;
      return;
    }

    const limit = options.limit;
    const isLimited = typeof limit === 'number' && limit > 0;

    let pagedItems;
    let currentPage = 1;
    let totalPages = 1;

    if (isLimited) {
      pagedItems = items.slice(0, limit);
    } else {
      currentPage = window._postsColumnPages[containerId] || 1;
      totalPages = Math.ceil(items.length / POSTS_PAGE_SIZE);
      if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
      window._postsColumnPages[containerId] = currentPage;
      pagedItems = items.slice((currentPage - 1) * POSTS_PAGE_SIZE, currentPage * POSTS_PAGE_SIZE);
    }

    container.innerHTML = '';
    pagedItems.forEach(post => {
      const card = createPipelineCardElement(post, columnType);
      container.appendChild(card);
    });

    // Append "+X More" card if in limited mode and extra items exist
    if (isLimited && options.showMoreCard && items.length > limit) {
      const remaining = items.length - limit;
      const moreCard = createMoreCard(columnType, remaining, items.length);
      container.appendChild(moreCard);
    }

    // Pagination for non-limited (subpage or full column) views
    if (!isLimited && totalPages > 1) {
      const pagination = document.createElement('div');
      pagination.className = 'pipeline-column-pagination';
      pagination.innerHTML = `
        <button type="button" class="btn-pagination-prev" ${currentPage <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>&larr; Prev</button>
        <span class="pagination-page-label">Page ${currentPage} of ${totalPages}</span>
        <button type="button" class="btn-pagination-next" ${currentPage >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>Next Page &rarr;</button>
      `;

      pagination.querySelector('.btn-pagination-prev')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPage > 1) {
          window._postsColumnPages[containerId] = currentPage - 1;
          renderPipelineColumn(containerId, items, columnType, options);
          container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      pagination.querySelector('.btn-pagination-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPage < totalPages) {
          window._postsColumnPages[containerId] = currentPage + 1;
          renderPipelineColumn(containerId, items, columnType, options);
          container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      container.appendChild(pagination);
    }
  }


  function updatePostsCategoryFilterOptions() {
    const select = document.getElementById('posts-category-filter');
    if (!select) return;

    const currentVal = (select.value || '').trim();
    const projConfig = window.projectConfig;
    const cats = (projConfig && Array.isArray(projConfig.categories))
      ? projConfig.categories.filter(c => c && c.trim().toLowerCase() !== 'uncategorized' && c.trim().toLowerCase() !== 'posts')
      : [];

    if (Array.isArray(window.drafts)) {
      const isLinks = (typeof window.isLinksDraft === 'function')
        ? window.isLinksDraft
        : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));
      window.drafts.forEach(d => {
        if (d.type === 'page' || d.type === 'note' || d.status === 'idea' || isLinks(d)) return;
        if (d.tag && d.tag.trim()) {
          const t = d.tag.trim();
          if (t.toLowerCase() !== 'uncategorized' && t.toLowerCase() !== 'posts' && !cats.some(c => c.toLowerCase() === t.toLowerCase())) {
            cats.push(t);
          }
        }
        if (Array.isArray(d.categories)) {
          d.categories.forEach(c => {
            if (c && typeof c === 'string' && c.trim()) {
              const ct = c.trim();
              if (ct.toLowerCase() !== 'uncategorized' && ct.toLowerCase() !== 'posts' && !cats.some(existing => existing.toLowerCase() === ct.toLowerCase())) {
                cats.push(ct);
              }
            }
          });
        }
      });
    }

    const stateKey = cats.join('|') + '::' + currentVal;
    if (select._renderedState !== stateKey) {
      select._renderedState = stateKey;
      let html = '<option value="">All Categories</option>';
      cats.forEach(cat => {
        const isSel = currentVal && cat.toLowerCase() === currentVal.toLowerCase();
        html += `<option value="${escapeHtml(cat)}"${isSel ? ' selected' : ''}>${escapeHtml(cat)}</option>`;
      });
      const isUncatSel = currentVal.toLowerCase() === 'uncategorized';
      html += `<option value="Uncategorized"${isUncatSel ? ' selected' : ''}>Uncategorized</option>`;
      select.innerHTML = html;
      if (currentVal) {
        select.value = currentVal;
      }
    }

    if (!select._hasChangeListener) {
      select._hasChangeListener = true;
      select.addEventListener('change', () => {
        window._postsColumnPages = {};
        renderAllPostsGrid();
      });
    }
  }
  window.updatePostsCategoryFilterOptions = updatePostsCategoryFilterOptions;

  function renderAllPostsGrid() {
    updatePostsCategoryFilterOptions();

    let posts = (window.CedarStore && typeof window.CedarStore.getPosts === 'function')
      ? window.CedarStore.getPosts()
      : (Array.isArray(window.drafts) ? window.drafts.filter(d => (!d.type || d.type === 'post') && d.type !== 'page') : []);

    posts = posts.filter(d => d && d.type !== 'note' && d.status !== 'idea');
    posts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Deduplicate posts strictly by ID or non-empty slug so duplicates never appear
    const seenPostKeys = new Set();
    posts = posts.filter(p => {
      if (!p) return false;
      const idKey = p.id ? ('id:' + p.id) : null;
      const slugKey = (p.slug && p.slug !== 'untitled-post') ? ('slug:' + p.slug.toLowerCase().trim()) : null;
      if (idKey && seenPostKeys.has(idKey)) return false;
      if (slugKey && seenPostKeys.has(slugKey)) return false;
      if (idKey) seenPostKeys.add(idKey);
      if (slugKey) seenPostKeys.add(slugKey);
      return true;
    });

    const searchInput = document.getElementById('posts-search-input');
    const searchQuery = (searchInput?.value || '').trim().toLowerCase();
    if (searchQuery) {
      posts = posts.filter(p => {
        const title = (p.title || '').toLowerCase();
        const subtitle = (p.subtitle || '').toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : (typeof p.tag === 'string' ? p.tag.toLowerCase() : '');
        const md = (p.markdown || '').toLowerCase();
        return title.includes(searchQuery) || subtitle.includes(searchQuery) || tags.includes(searchQuery) || md.includes(searchQuery);
      });
    }

    const categoryFilter = document.getElementById('posts-category-filter');
    const selectedCategory = (categoryFilter?.value || '').trim();
    if (selectedCategory) {
      posts = posts.filter(p => {
        const normSel = selectedCategory.toLowerCase();
        if (normSel === 'all' || normSel === 'all posts' || normSel === 'all-posts') {
          return true;
        }
        const postTag = (p.tag || '').trim();
        const postCats = Array.isArray(p.categories) ? p.categories : [];
        if (normSel === 'uncategorized') {
          const hasNoTag = !postTag || postTag.toLowerCase() === 'uncategorized' || postTag.toLowerCase() === 'posts';
          const hasNoCats = postCats.length === 0 || postCats.every(c => !c || c.toLowerCase() === 'uncategorized' || c.toLowerCase() === 'posts');
          return hasNoTag && hasNoCats;
        }
        return (postTag && postTag.toLowerCase() === normSel) ||
               postCats.some(c => c && c.toLowerCase() === normSel);
      });
    }

    const hiddenList = [];
    const draftsList = posts.filter(p => (p.status === 'draft' || p.status === 'scheduled' || !p.status));
    const published = posts.filter(p => p.status === 'published');

    const countDraftsEl = document.getElementById('posts-overview-count-drafts') || document.getElementById('posts-count-drafts');
    const countPubEl = document.getElementById('posts-overview-count-published') || document.getElementById('posts-count-published');
    const countHiddenEl = document.getElementById('posts-overview-count-hidden') || document.getElementById('posts-count-hidden');
    if (countDraftsEl) countDraftsEl.textContent = draftsList.length;
    if (countPubEl) countPubEl.textContent = published.length;
    if (countHiddenEl) countHiddenEl.textContent = hiddenList.length;

    if (typeof updateDashboardCounts === 'function') {
      updateDashboardCounts();
    }

    const currentSub = (window.currentPostsSubTab || 'all').toLowerCase();
    const overviewContainer = document.getElementById('posts-overview-container');
    const subpageContainer = document.getElementById('posts-subpage-container');

    // Update active state in sidebar sub-navigation and parent Posts tab ONLY when currently on Posts
    const isPostsTabActive = (window.currentDashboardTab === 'posts') || 
                             (window.location.hash && (
                                window.location.hash.startsWith('#posts') || 
                                window.location.hash.startsWith('#drafts') || 
                                window.location.hash.startsWith('#published') || 
                                window.location.hash.startsWith('#hidden')
                             ));

    if (isPostsTabActive) {
      const postsSubWrap = document.getElementById('sidebar-posts-sub-wrap');
      if (postsSubWrap) {
        postsSubWrap.style.display = 'flex';
        postsSubWrap.querySelectorAll('[data-posts-sub]').forEach(subItem => {
          subItem.classList.toggle('active', subItem.dataset.postsSub === currentSub);
        });
      }

      const postsTabBtn = document.getElementById('sidebar-tab-posts');
      if (postsTabBtn) {
        postsTabBtn.classList.toggle('active', currentSub === 'all');
        postsTabBtn.classList.toggle('parent-active', currentSub !== 'all');
      }
    }

    if (currentSub === 'drafts' || currentSub === 'published' || currentSub === 'hidden') {
      if (overviewContainer) overviewContainer.style.display = 'none';
      if (subpageContainer) subpageContainer.style.display = 'flex';

      const subpageHeading = document.getElementById('posts-subpage-heading');
      const subpageCount = document.getElementById('posts-subpage-count');
      const subpageDot = document.getElementById('posts-subpage-dot');

      let targetList = [];
      let colType = 'draft';
      let title = 'Drafts';

      if (currentSub === 'drafts') {
        targetList = draftsList;
        colType = 'draft';
        title = 'Drafts';
        if (subpageDot) {
          subpageDot.className = 'col-dot dot-draft';
          subpageDot.style.backgroundColor = '';
        }
      } else if (currentSub === 'published') {
        targetList = published;
        colType = 'published';
        title = 'Published';
        if (subpageDot) {
          subpageDot.className = 'col-dot dot-published';
          subpageDot.style.backgroundColor = '';
        }
      } else if (currentSub === 'hidden') {
        targetList = hiddenList;
        colType = 'hidden';
        title = 'Hidden';
        if (subpageDot) {
          subpageDot.className = 'col-dot dot-hidden';
          subpageDot.style.backgroundColor = 'var(--text-muted, #71717a)';
        }
      }

      if (subpageHeading) subpageHeading.textContent = title;
      if (subpageCount) subpageCount.textContent = targetList.length;

      renderPipelineColumn('posts-cards-subpage', targetList, colType, { isSubpage: true });

    } else {
      if (overviewContainer) overviewContainer.style.display = 'flex';
      if (subpageContainer) subpageContainer.style.display = 'none';

      // 1. Drafts: first 3 + Show More option
      renderPipelineColumn('posts-cards-drafts', draftsList, 'draft', { limit: 3, showMoreCard: true });
      // 2. Published: first 10 + Show More option
      renderPipelineColumn('posts-cards-published', published, 'published', { limit: 10, showMoreCard: true });
    }

    applyPostsViewModes();
  }

  const DEFAULT_VIEW_MODE = 'grid';

  function getPostsViewMode() {
    try {
      if (localStorage.getItem('cedar_posts_view_mode') !== 'grid') {
        localStorage.setItem('cedar_posts_view_mode', 'grid');
      }
      if (window.projectConfig && window.projectConfig.postsViewMode !== 'grid') {
        window.projectConfig.postsViewMode = 'grid';
      }
    } catch (e) {}
    return 'grid';
  }

  function getSectionViewMode(sectionName) {
    return 'grid';
  }

  function setSectionViewMode(sectionName, mode) {
    setAllPostsViewMode('grid');
  }

  function setAllPostsViewMode() {
    try {
      localStorage.setItem('cedar_posts_view_mode', 'grid');
      if (window.projectConfig) {
        window.projectConfig.postsViewMode = 'grid';
        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage();
        }
      }
    } catch (e) {}
    applyPostsViewModes();
  }

  function applyPostsViewModes() {
    const headerViewToggle = document.getElementById('posts-view-toggle');
    if (headerViewToggle) {
      headerViewToggle.remove();
    }

    // Posts are always rendered in Grid View
    const targetGrids = [
      'posts-cards-drafts',
      'posts-cards-published',
      'posts-cards-hidden',
      'posts-cards-subpage'
    ];
    targetGrids.forEach(id => {
      const gridEl = document.getElementById(id);
      if (gridEl) {
        gridEl.classList.remove('is-list-view');
      }
    });

    document.querySelectorAll('#pane-posts .posts-horizontal-grid, #pane-posts .posts-subpage-grid').forEach(el => {
      el.classList.remove('is-list-view');
    });
  }

  function initPipelineEvents() {
    // 3. Quick Idea Form & Auto-expanding Multiline Textarea
    const quickIdeaForm = document.getElementById('form-quick-idea');
    const quickIdeaInput = document.getElementById('input-quick-idea');

    resizeQuickIdeaInput = function() {
      if (!quickIdeaInput) return;
      quickIdeaInput.style.height = 'auto';
      const borderOffset = (quickIdeaInput.offsetHeight - quickIdeaInput.clientHeight) || 2;
      const scrollH = quickIdeaInput.scrollHeight + borderOffset;
      const newHeight = Math.min(240, Math.max(70, scrollH));
      quickIdeaInput.style.height = newHeight + 'px';
      quickIdeaInput.style.overflowY = scrollH > 240 ? 'auto' : 'hidden';
    }

    if (quickIdeaInput) {
      quickIdeaInput.addEventListener('input', resizeQuickIdeaInput);
      quickIdeaInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (e.shiftKey) {
            // Shift + Enter: insert newline and expand downward
            setTimeout(resizeQuickIdeaInput, 0);
          } else {
            // Plain Enter: submit the idea
            e.preventDefault();
            const submitBtn = document.getElementById('btn-quick-idea-submit');
            if (submitBtn) {
              submitBtn.click();
            } else if (quickIdeaForm) {
              quickIdeaForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
          }
        }
      });
    }

    if (quickIdeaForm) {
      quickIdeaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = (quickIdeaInput?.value || '').trim();
        if (!text) return;
        const firstLine = text.split('\n')[0].trim().slice(0, 80);
        const newIdea = createNewDraftModel(firstLine || 'Quick Idea', 'blank', 'post', 'idea');
        newIdea.markdown = text;
        newIdea.subtitle = '';
        if (!Array.isArray(window.drafts)) window.drafts = [];
        window.drafts.unshift(newIdea);
        saveDraftsToStorage();
        if (quickIdeaInput) {
          quickIdeaInput.value = '';
          quickIdeaInput.style.height = '70px';
          quickIdeaInput.style.overflowY = 'hidden';
        }
        renderDashboard();
        showToast('Added to quick ideas');
      });
    }


    const postsSearchInput = document.getElementById('posts-search-input');
    if (postsSearchInput) {
      postsSearchInput.addEventListener('input', () => {
        window._postsColumnPages = {};
        renderAllPostsGrid();
      });
    }

    const postsCategoryFilter = document.getElementById('posts-category-filter');
    if (postsCategoryFilter && !postsCategoryFilter._hasChangeListener) {
      postsCategoryFilter._hasChangeListener = true;
      postsCategoryFilter.addEventListener('change', () => {
        window._postsColumnPages = {};
        renderAllPostsGrid();
      });
    }

    applyPostsViewModes();
  }

  window.renderPostsPipeline = renderPostsPipeline;
  window.renderPipelineColumn = renderPipelineColumn;
  window.renderAllPostsGrid = renderAllPostsGrid;
  window.renderQuickIdeasList = renderQuickIdeasList;
  window.resizeQuickIdeaInput = function() { return resizeQuickIdeaInput ? resizeQuickIdeaInput() : undefined; };
  window.initPipelineEvents = initPipelineEvents;
  window.applyPostsViewModes = applyPostsViewModes;
  window.setSectionViewMode = setSectionViewMode;
  window.setAllPostsViewMode = setAllPostsViewMode;
  window.getSectionViewMode = getSectionViewMode;
  window.getPostsViewMode = getPostsViewMode;

  Object.assign(window.Cedar.dashboard, {
    renderPostsPipeline,
    renderPipelineColumn,
    renderAllPostsGrid,
    renderQuickIdeasList,
    resizeQuickIdeaInput: window.resizeQuickIdeaInput,
    initPipelineEvents,
    applyPostsViewModes,
    setSectionViewMode,
    setAllPostsViewMode,
    getSectionViewMode,
    getPostsViewMode
  });
})();
