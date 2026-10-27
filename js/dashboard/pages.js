/**
 * Cedar - Static Pages Management
 * Handles static pages grid rendering, search filtering, creation,
 * auto category aggregate pages synchronization, and confirmation handling.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  let isPagesEditMode = false;
  let editModeSnapshot = null;
  const editModePendingTitles = {};
  const editModePendingUrls = {};
  const sessionPinnedHiddenState = new Map();

  function getPageSortKey(page) {
    if (!page) return '';
    return String(page.id || page.slug || page.title || '').trim().toLowerCase();
  }

  function getSortHiddenState(page) {
    const k = getPageSortKey(page);
    if (k && sessionPinnedHiddenState.has(k)) {
      return sessionPinnedHiddenState.get(k);
    }
    return isPageHidden(page);
  }

  function captureEditModeInputs() {
    document.querySelectorAll('#pane-pages .card-title-input').forEach(input => {
      const pageId = input.dataset.pageId;
      const isCat = input.dataset.isCat === 'true';
      const catName = input.dataset.catName;
      const key = isCat ? `cat_${catName}` : `page_${pageId}`;
      if (input.value !== undefined) {
        input.setAttribute('value', input.value);
        if (input.dataset) {
          input.dataset.currentValue = input.value;
        }
        editModePendingTitles[key] = input.value;
      }
    });
    document.querySelectorAll('#pane-pages .card-url-input').forEach(input => {
      const pageId = input.dataset.pageId;
      if (pageId && input.value !== undefined) {
        input.setAttribute('value', input.value);
        editModePendingUrls[pageId] = input.value;
      }
    });
  }

  window._onPagesTitleInput = function (input) {
    if (!input) return;
    const pageId = input.dataset.pageId;
    const isCat = input.dataset.isCat === 'true';
    const catName = input.dataset.catName;
    const key = isCat ? `cat_${catName}` : `page_${pageId}`;
    editModePendingTitles[key] = input.value;
  };

  window._onPagesUrlInput = function (input) {
    if (!input) return;
    const pageId = input.dataset.pageId;
    if (pageId) {
      editModePendingUrls[pageId] = input.value;
    }
  };

  function enterPagesEditMode() {
    if (isPagesEditMode) return;
    const searchInput = document.getElementById('pages-search-input');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
    }
    for (const k in editModePendingTitles) delete editModePendingTitles[k];
    for (const k in editModePendingUrls) delete editModePendingUrls[k];
    const currentDraftsList = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
      ? window.CedarStore.getAllDrafts()
      : Array.from(window.drafts || []);
    editModeSnapshot = {
      drafts: JSON.parse(JSON.stringify(currentDraftsList)),
      categories: window.projectConfig && Array.isArray(window.projectConfig.categories)
        ? JSON.parse(JSON.stringify(window.projectConfig.categories))
        : [],
      allCategoryIndex: window.projectConfig ? window.projectConfig.allCategoryIndex : 0,
      allDisabled: window.projectConfig ? window.projectConfig.allDisabled : false,
      rssEnabled: window.projectConfig ? window.projectConfig.rssEnabled : true,
      pagesViewMode: 'list',
      pagesCustomOrder: window.projectConfig && Array.isArray(window.projectConfig.pagesCustomOrder)
        ? [...window.projectConfig.pagesCustomOrder]
        : [],
      pagesCustomOrderUserSet: Boolean(window.projectConfig && window.projectConfig.pagesCustomOrderUserSet)
    };
    isPagesEditMode = true;
    updatePagesEditModeUI();
    renderStaticPages();
  }

  function cancelPagesEditMode() {
    for (const k in editModePendingTitles) delete editModePendingTitles[k];
    for (const k in editModePendingUrls) delete editModePendingUrls[k];
    if (editModeSnapshot) {
      if (Array.isArray(editModeSnapshot.drafts)) {
        const restored = JSON.parse(JSON.stringify(editModeSnapshot.drafts));
        if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function') {
          window.CedarStore.hydrateFromList(restored);
        } else {
          window.drafts = restored;
        }
      }
      if (window.projectConfig) {
        if (Array.isArray(editModeSnapshot.categories)) {
          window.projectConfig.categories = JSON.parse(JSON.stringify(editModeSnapshot.categories));
        }
        window.projectConfig.allCategoryIndex = editModeSnapshot.allCategoryIndex;
        window.projectConfig.allDisabled = editModeSnapshot.allDisabled;
        window.projectConfig.rssEnabled = editModeSnapshot.rssEnabled;
        window.projectConfig.pagesViewMode = 'list';
        window.projectConfig.pagesCustomOrder = editModeSnapshot.pagesCustomOrder;
        window.projectConfig.pagesCustomOrderUserSet = editModeSnapshot.pagesCustomOrderUserSet;
      }
      try {
        localStorage.setItem('cedar_pages_view_mode', 'list');
      } catch (e) {}
      editModeSnapshot = null;
    }
    isPagesEditMode = false;
    updatePagesEditModeUI();
    renderStaticPages();
  }

  function savePagesEditMode() {
    captureEditModeInputs();
    const inputs = document.querySelectorAll('#pane-pages .card-title-input');
    let anyChanged = false;
    const processedRenames = new Set();

    inputs.forEach(input => {
      const pageId = input.dataset.pageId;
      const isCategory = input.dataset.isCat === 'true';
      const catName = input.dataset.catName;
      const key = isCategory ? `cat_${catName}` : `page_${pageId}`;
      const newTitle = (editModePendingTitles[key] !== undefined ? editModePendingTitles[key] : (input.value || input.dataset.currentValue || '')).trim();
      const originalTitle = (input.dataset.originalTitle || '').trim();

      if (!newTitle || newTitle === originalTitle) return;

      if (isCategory) {
        const oldCatName = catName || originalTitle;
        const renameKey = `${oldCatName.toLowerCase()}->${newTitle.toLowerCase()}`;
        if (!processedRenames.has(renameKey) && typeof window.renameCategory === 'function') {
          processedRenames.add(renameKey);
          window.renameCategory(oldCatName, newTitle);
          anyChanged = true;
        }
      } else if (pageId && Array.isArray(window.drafts)) {
        const draft = window.drafts.find(d => d.id === pageId);
        if (draft) {
          const isBuiltIn = isBuiltInPage(draft);
          const reservedNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
          if (!isBuiltIn && reservedNames.has(newTitle.toLowerCase())) {
            if (typeof window.showToast === 'function') window.showToast("Woah! That's a reserved name - pick something else.");
            return;
          }
          const oldTitle = originalTitle;
          draft.title = newTitle;
          draft.updatedAt = Date.now();
          if (!isBuiltIn && typeof window.generateSlug === 'function') {
            draft.slug = window.generateSlug(newTitle);
          }
          if (typeof window.logActivity === 'function') {
            window.logActivity('page', {
              action: 'renamed',
              id: draft.id,
              title: newTitle,
              oldTitle: oldTitle,
              slug: draft.slug
            });
          }
          anyChanged = true;
        }
      }
    });

    const urlInputs = document.querySelectorAll('#pane-pages .card-url-input');
    urlInputs.forEach(input => {
      const pageId = input.dataset.pageId;
      if (pageId) {
        const draft = Array.isArray(window.drafts) ? window.drafts.find(d => d.id === pageId) : null;
        const storePage = (window.CedarStore && typeof window.CedarStore.getPage === 'function') ? window.CedarStore.getPage(pageId) : null;
        const target = draft || storePage;
        if (target && target.isRedirect) {
          let newUrl = (editModePendingUrls[pageId] !== undefined ? editModePendingUrls[pageId] : (input.value || '')).trim();
          if (newUrl && !newUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i) && !newUrl.startsWith('/') && !newUrl.startsWith('#')) {
            newUrl = 'https://' + newUrl;
          }
          if (newUrl && newUrl !== target.redirectUrl) {
            if (draft) {
              draft.redirectUrl = newUrl;
              draft.url = newUrl;
              draft.updatedAt = Date.now();
            }
            if (storePage && storePage !== draft) {
              storePage.redirectUrl = newUrl;
              storePage.url = newUrl;
              storePage.updatedAt = Date.now();
            }
            anyChanged = true;
          }
        }
      }
    });

    for (const pageId in editModePendingUrls) {
      const draft = Array.isArray(window.drafts) ? window.drafts.find(d => d.id === pageId) : null;
      const storePage = (window.CedarStore && typeof window.CedarStore.getPage === 'function') ? window.CedarStore.getPage(pageId) : null;
      const target = draft || storePage;
      if (target && target.isRedirect) {
        let newUrl = (editModePendingUrls[pageId] || '').trim();
        if (newUrl && !newUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i) && !newUrl.startsWith('/') && !newUrl.startsWith('#')) {
          newUrl = 'https://' + newUrl;
        }
        if (newUrl && newUrl !== target.redirectUrl) {
          if (draft) {
            draft.redirectUrl = newUrl;
            draft.url = newUrl;
            draft.updatedAt = Date.now();
          }
          if (storePage && storePage !== draft) {
            storePage.redirectUrl = newUrl;
            storePage.url = newUrl;
            storePage.updatedAt = Date.now();
          }
          anyChanged = true;
        }
      }
    }

    for (const key in editModePendingTitles) {
      const newTitle = (editModePendingTitles[key] || '').trim();
      if (!newTitle) continue;
      if (key.startsWith('cat_')) {
        const oldCatName = key.slice(4);
        const renameKey = `${oldCatName.toLowerCase()}->${newTitle.toLowerCase()}`;
        if (oldCatName.toLowerCase() !== newTitle.toLowerCase() && !processedRenames.has(renameKey) && typeof window.renameCategory === 'function') {
          processedRenames.add(renameKey);
          window.renameCategory(oldCatName, newTitle);
          anyChanged = true;
        }
      } else if (key.startsWith('page_')) {
        const pageId = key.slice(5);
        if (Array.isArray(window.drafts)) {
          const draft = window.drafts.find(d => d.id === pageId);
          if (draft && draft.title !== newTitle) {
            const isBuiltIn = isBuiltInPage(draft);
            const reservedNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
            if (!isBuiltIn && reservedNames.has(newTitle.toLowerCase())) {
              if (typeof window.showToast === 'function') window.showToast("Woah! That's a reserved name - pick something else.");
              continue;
            }
            const oldTitle = draft.title;
            draft.title = newTitle;
            draft.updatedAt = Date.now();
            if (!isBuiltIn && typeof window.generateSlug === 'function') {
              draft.slug = window.generateSlug(newTitle);
            }
            const storePage = (window.CedarStore && typeof window.CedarStore.getPage === 'function') ? window.CedarStore.getPage(pageId) : null;
            if (storePage && storePage !== draft) {
              storePage.title = newTitle;
              storePage.slug = draft.slug;
              storePage.updatedAt = draft.updatedAt;
            }
            if (typeof window.logActivity === 'function') {
              window.logActivity('page', {
                action: 'renamed',
                id: draft.id,
                title: newTitle,
                oldTitle: oldTitle,
                slug: draft.slug
              });
            }
            anyChanged = true;
          }
        }
      }
    }

    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
      window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
    }
    if (typeof window.showToast === 'function') window.showToast('Changes saved');

    for (const k in editModePendingTitles) delete editModePendingTitles[k];
    for (const k in editModePendingUrls) delete editModePendingUrls[k];
    editModeSnapshot = null;
    isPagesEditMode = false;
    updatePagesEditModeUI();
    renderStaticPages();
  }

  function initPagesEditModeListeners() {
    const btnToggleEdit = document.getElementById('btn-pages-toggle-edit');
    if (btnToggleEdit && !btnToggleEdit._hasEditListener) {
      btnToggleEdit._hasEditListener = true;
      btnToggleEdit.addEventListener('click', () => {
        enterPagesEditMode();
      });
    }

    const btnEditCancel = document.getElementById('btn-pages-edit-cancel');
    if (btnEditCancel && !btnEditCancel._hasCancelListener) {
      btnEditCancel._hasCancelListener = true;
      btnEditCancel.addEventListener('click', () => {
        cancelPagesEditMode();
      });
    }

    const btnEditSave = document.getElementById('btn-pages-edit-save');
    if (btnEditSave && !btnEditSave._hasSaveListener) {
      btnEditSave._hasSaveListener = true;
      btnEditSave.addEventListener('click', () => {
        savePagesEditMode();
      });
    }
  }

  function updatePagesEditModeUI() {
    const toggleBtn = document.getElementById('btn-pages-toggle-edit');
    const actionsWrap = document.getElementById('pages-edit-mode-actions');
    const headerViewToggle = document.getElementById('pages-view-toggle');
    const searchBox = document.querySelector('#pane-pages .header-search-box');
    const panePages = document.getElementById('pane-pages');
    if (panePages) {
      panePages.classList.toggle('is-edit-mode', Boolean(isPagesEditMode));
    }

    if (toggleBtn) {
      if (isPagesEditMode) {
        toggleBtn.textContent = 'Editing';
        toggleBtn.classList.add('is-editing');
        toggleBtn.style.cursor = 'default';
        toggleBtn.style.opacity = '0.6';
      } else {
        toggleBtn.textContent = 'Edit';
        toggleBtn.classList.remove('is-editing');
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.opacity = '1';
      }
    }

    if (searchBox) {
      searchBox.style.display = isPagesEditMode ? 'none' : 'flex';
    }

    if (actionsWrap) {
      actionsWrap.style.display = isPagesEditMode ? 'inline-flex' : 'none';
    }

    if (headerViewToggle) {
      headerViewToggle.remove();
    }
  }

  function syncAutoCategoryToggles(checked) {
    const isChecked = (typeof checked === 'boolean')
      ? checked
      : (window.projectConfig ? (window.projectConfig.autoCategoryPages !== false) : true);
    document.querySelectorAll('#toggle-auto-category-pages, #toggle-auto-category-pages-panel, [data-auto-cat-toggle]').forEach(el => {
      el.checked = isChecked;
    });
  }

  function syncCategoryPages() {
    if (!window.projectConfig) return false;
    window.projectConfig.autoCategoryPages = true;

    if (!Array.isArray(window.drafts)) {
      window.drafts = [];
    }

    // Purge test categories from window.projectConfig.categories
    if (Array.isArray(window.projectConfig.categories)) {
      window.projectConfig.categories = window.projectConfig.categories.filter(c => {
        const s = String(c || '').trim().toLowerCase();
        return Boolean(s);
      });
    }

    // 1. Gather all active categories from projectConfig.categories + post tags/categories
    const forbiddenPageNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'feed', 'links', 'all']);
    const categorySet = new Set();
    if (Array.isArray(window.projectConfig.categories)) {
      window.projectConfig.categories.forEach(c => {
        const str = String(c || '').trim();
        if (str && !forbiddenPageNames.has(str.toLowerCase())) {
          categorySet.add(str);
        }
      });
    }

    // Also check drafts for any assigned categories
    window.drafts.forEach(d => {
      if (!d) return;
      if (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) {
        // Do not resurrect categories from auto-generated aggregate pages
        return;
      }
      if (d.type === 'page' || d.type === 'note' || d.status === 'idea') return;
      if (d.tag) {
        const str = String(d.tag).trim();
        if (str && !forbiddenPageNames.has(str.toLowerCase())) {
          categorySet.add(str);
        }
      }
      if (Array.isArray(d.categories)) {
        d.categories.forEach(c => {
          const str = String(c || '').trim();
          if (str && !forbiddenPageNames.has(str.toLowerCase())) {
            categorySet.add(str);
          }
        });
      }
    });

    let changed = false;

    if (!Array.isArray(window.projectConfig.categories)) {
      window.projectConfig.categories = [];
    }
    categorySet.forEach(c => {
      if (!window.projectConfig.categories.some(existing => String(existing).toLowerCase() === c.toLowerCase())) {
        window.projectConfig.categories.push(c);
        changed = true;
      }
    });

    // Purge any phantom posts in window.drafts that share a slug with a category,
    // and purge any accidental auto-generated category pages with built-in slugs like 'rss' or 'about'
    const categorySlugs = new Set([...categorySet].map(c => (typeof window.generateSlug === 'function' ? window.generateSlug(c) : c.toLowerCase().replace(/[^a-z0-9]+/g, '-'))));
    const preCount = window.drafts.length;
    window.drafts = window.drafts.filter(d => {
      if (d && d.type === 'post' && (d.isCategoryAggregate || String(d.id || '').startsWith('page_')) && d.slug && categorySlugs.has(d.slug.toLowerCase())) {
        if (window.CedarStore && d.id && typeof window.CedarStore.removePost === 'function') {
          window.CedarStore.removePost(d.id);
        }
        return false;
      }
      if (d && (d.isCategoryAggregate || String(d.id).startsWith('page_cat_'))) {
        const s = (d.slug || '').trim().toLowerCase();
        const t = (d.title || '').trim().toLowerCase();
        const catStr = (d.categoryAggregate || d.title || '').trim().toLowerCase();
        if (forbiddenPageNames.has(s) || forbiddenPageNames.has(t)) {
          if (window.CedarStore && d.id && typeof window.CedarStore.removePage === 'function') {
            window.CedarStore.removePage(d.id);
          }
          return false;
        }
        // Purge orphan category pages whose category is no longer in categorySet
        const match = [...categorySet].some(validCat => validCat.toLowerCase() === catStr || validCat.toLowerCase() === t);
        if (!match) {
          if (window.CedarStore && d.id && typeof window.CedarStore.removePage === 'function') {
            window.CedarStore.removePage(d.id);
          }
          return false;
        }
      }
      return true;
    });
    if (window.drafts.length !== preCount) {
      changed = true;
    }

    // 2. Ensure each active category has a minimal page:
    // "if there happens to be an existing page with the exact same name as the category, simply don't make the auto-generated page."
    categorySet.forEach(catName => {
      const lower = catName.toLowerCase();
      if (forbiddenPageNames.has(lower)) return;
      const catSlug = typeof window.generateSlug === 'function' ? window.generateSlug(catName) : lower.replace(/[^a-z0-9]+/g, '-');
      if (forbiddenPageNames.has(catSlug)) return;
      const existing = window.drafts.find(d => {
        if (d.type !== 'page') return false;
        return (d.title || '').trim().toLowerCase() === lower || (d.slug || '').trim().toLowerCase() === catSlug;
      });

      if (!existing) {
        const slug = typeof window.generateSlug === 'function' ? window.generateSlug(catName) : catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const newPage = {
          id: `page_cat_${slug || Date.now()}`,
          type: 'page',
          status: 'published',
          title: catName,
          slug: slug,
          subtitle: '',
          layout: 'grid',
          markdown: ':::recent-posts layout="grid":::',
          proseHtml: '<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="grid" contenteditable="false"></div>',
          isCategoryAggregate: true,
          categoryAggregate: catName,
          hasHadRecentPostsInit: true,
          hidden: false,
          retired: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        window.drafts.push(newPage);
        if (window.CedarStore && typeof window.CedarStore.upsertPage === 'function') {
          window.CedarStore.upsertPage(newPage);
        }
        changed = true;
      } else {
        if (existing.title !== catName) {
          existing.title = catName;
          changed = true;
        }
        if (existing.categoryAggregate !== catName) {
          existing.categoryAggregate = catName;
          changed = true;
        }
        if (existing.hidden === undefined) {
          existing.hidden = false;
        }
        if (existing.retired === undefined) {
          existing.retired = false;
        }
        if (!existing.layout) {
          const curMd = String(existing.markdown || '');
          existing.layout = curMd.includes('layout="list"') ? 'list' : 'grid';
        }
        if (!existing.hasHadRecentPostsInit) {
          const curHtml = String(existing.proseHtml || '');
          const curMd = String(existing.markdown || '');
          const curLayout = existing.layout || 'grid';
          if (!curHtml.includes('page-recent-posts-block') && !curMd.includes(':::recent-posts')) {
            existing.proseHtml = (curHtml ? curHtml + '\n' : '') + `<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="${curLayout}" contenteditable="false"></div>`;
            existing.markdown = (curMd ? curMd + '\n\n' : '') + `:::recent-posts layout="${curLayout}":::`;
          }
          existing.hasHadRecentPostsInit = true;
          changed = true;
        }
        if (existing.coverImage) {
          existing.coverImage = '';
          changed = true;
        }
        if (existing.featuredImage) {
          delete existing.featuredImage;
          changed = true;
        }
        // Clean up any post-card thumbnail images that were previously extracted into the category page by normalizeRawImages
        if (Array.isArray(existing.images) && existing.images.some(im => im && /^image-[a-z0-9]+\.jpg$/i.test(im.filename || '') && String(im.relativePath || '').startsWith('data:image/'))) {
          const badNames = new Set(
            existing.images
              .filter(im => im && /^image-[a-z0-9]+\.jpg$/i.test(im.filename || '') && String(im.relativePath || '').startsWith('data:image/'))
              .map(im => im.filename)
          );
          existing.images = existing.images.filter(im => !im || !badNames.has(im.filename));
          if (Array.isArray(existing.tempImages)) {
            existing.tempImages = existing.tempImages.filter(im => !im || !badNames.has(im.filename));
          }
          if (existing.proseHtml && typeof DOMParser !== 'undefined') {
            try {
              const doc = new DOMParser().parseFromString(`<body>${existing.proseHtml}</body>`, 'text/html');
              doc.body.querySelectorAll('.captioned-image-container').forEach(container => {
                const img = container.querySelector('img');
                const imgName = img ? (img.getAttribute('data-img-name') || '') : '';
                const origSrc = img ? (img.getAttribute('data-original-src') || '') : '';
                if (badNames.has(imgName) || origSrc.startsWith('data:image/')) {
                  container.remove();
                }
              });
              existing.proseHtml = doc.body.innerHTML.trim();
            } catch (e) {}
          }
          if (existing.markdown) {
            existing.markdown = existing.markdown
              .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)\s*/g, '')
              .trim();
          }
          changed = true;
        }
      }
    });

    if (changed && typeof window.saveDraftsToStorage === 'function') {
      window.saveDraftsToStorage();
    }

    return changed;
  }

  function isAllPage(p) {
    if (!p) return false;
    const id = (p.id || '').trim().toLowerCase();
    const slug = (p.slug || '').trim().toLowerCase();
    const title = (p.title || '').trim().toLowerCase();
    return id === 'page_all' || slug === 'all' || title === 'all';
  }
  window.isAllPage = isAllPage;

  function isBuiltInPage(p) {
    if (!p) return false;
    const id = (p.id || '').trim().toLowerCase();
    const slug = (p.slug || '').trim().toLowerCase();
    const title = (p.title || '').trim().toLowerCase();
    return id === 'page_rss' || id === 'page_about' || id === 'page_links' || id === 'page_all' ||
           slug === 'rss' || slug === 'about' || slug === 'links' || slug === 'all' ||
           title === 'rss' || title === 'about' || title === 'links' || title === 'all';
  }
  window.isBuiltInPage = isBuiltInPage;

  function isCategoryPageItem(p, currentCatsLower) {
    if (!p || isBuiltInPage(p)) return false;
    if (p.isCategoryAggregate || String(p.id || '').startsWith('page_cat_')) return true;
    const titleLower = (p.title || '').trim().toLowerCase();
    const catLower = (p.categoryAggregate || '').trim().toLowerCase();
    return Boolean(currentCatsLower && ((titleLower && currentCatsLower.has(titleLower)) || (catLower && currentCatsLower.has(catLower))));
  }

  const DEFAULT_PAGES_VIEW_MODE = 'list';
  const DEFAULT_PAGES_SORT_MODE = 'type';
  const PAGES_PAGE_SIZE = 100;
  window._pagesColumnPages = window._pagesColumnPages || {};

  function getPagesSortMode() {
    if (window.projectConfig && window.projectConfig.pagesSortMode) {
      return window.projectConfig.pagesSortMode;
    }
    try {
      const mode = localStorage.getItem('cedar_pages_sort_mode');
      if (mode === 'alphabetical' || mode === 'type' || mode === 'custom') return mode;
    } catch (e) {}
    return DEFAULT_PAGES_SORT_MODE;
  }

  function setPagesSortMode(mode) {
    if (!window.projectConfig) window.projectConfig = {};
    window.projectConfig.pagesSortMode = mode;
    try {
      localStorage.setItem('cedar_pages_sort_mode', mode);
    } catch (e) {}
    const select = document.getElementById('pages-sort-filter-select');
    if (select && select.value !== mode) {
      select.value = mode;
    }
    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage();
    }
  }

  function getPagesViewMode() {
    try {
      if (localStorage.getItem('cedar_pages_view_mode') !== 'list') {
        localStorage.setItem('cedar_pages_view_mode', 'list');
      }
      if (window.projectConfig && window.projectConfig.pagesViewMode !== 'list') {
        window.projectConfig.pagesViewMode = 'list';
      }
    } catch (e) {}
    return 'list';
  }

  function setPagesViewMode() {
    try {
      localStorage.setItem('cedar_pages_view_mode', 'list');
      if (window.projectConfig) {
        window.projectConfig.pagesViewMode = 'list';
        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage();
        }
      }
    } catch (e) {}
    applyPagesViewModes();
    initPagesEditModeListeners();
  }

  function applyPagesViewModes() {
    const headerViewToggle = document.getElementById('pages-view-toggle');
    if (headerViewToggle) {
      headerViewToggle.remove();
    }

    // Pages are always rendered in List View
    const targetGrids = [
      'pages-cards-all',
      'pages-cards-my-pages',
      'pages-cards-categories',
      'pages-cards-builtin',
      'pages-cards-subpage'
    ];
    targetGrids.forEach(id => {
      const gridEl = document.getElementById(id);
      if (gridEl) {
        gridEl.classList.add('is-list-view');
      }
    });

    document.querySelectorAll('#pane-pages .posts-horizontal-grid, #pane-pages .posts-subpage-grid').forEach(el => {
      el.classList.add('is-list-view');
    });
  }

  function isPageHidden(p) {
    if (!p) return false;

    // Check "All" page
    if (isAllPage(p)) {
      if (window.projectConfig && (window.projectConfig.allDisabled === true || window.projectConfig.allEnabled === false)) return true;
      try {
        if (localStorage.getItem('cedar_all_disabled') === 'true') return true;
      } catch (e) {}
      return Boolean(p.hidden === true || p.retired === true);
    }

    // Check specifically for the 3 built-in pages that default to OFF: About, Links, RSS
    const id = (p.id || '').trim().toLowerCase();
    const slug = (p.slug || '').trim().toLowerCase();
    const title = (p.title || '').trim().toLowerCase();
    const isAbout = id === 'page_about' || id === 'page_about_cedar' || slug === 'about' || slug === 'about-cedar' || title === 'about';
    const isLinks = id === 'page_links' || slug === 'links' || title === 'links';
    const isRss = id === 'page_rss' || slug === 'rss' || title === 'rss';

    if (isAbout || isLinks || isRss) {
      if (isRss && window.projectConfig && window.projectConfig.rssEnabled === false) return true;
      if (p.hidden === undefined && p.retired === undefined) return true;
      return Boolean(p.hidden || p.retired);
    }

    // ALL OTHER PAGES (The 'All' category page, user categories, user custom pages) default to ON!
    // They are only OFF if explicitly hidden (p.hidden === true or p.retired === true)
    return Boolean(p.hidden === true || p.retired === true);
  }

  function createPagesMoreCard(sectionType, remainingCount, totalCount) {
    const card = document.createElement('div');
    card.className = 'pipeline-card posts-more-card';
    const subRoute = sectionType;
    card.dataset.targetSub = subRoute;

    const labelMap = {
      'my-pages': 'Pages',
      'categories': 'Categories',
      'builtin': 'Built-In Pages'
    };
    const label = labelMap[subRoute] || 'Pages';

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

  function removeCategoryGhost() {
    document.querySelectorAll('.category-drag-ghost-preview').forEach(el => el.remove());
  }

  function handleUniversalPageDrop(e, container) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isPagesEditMode) {
      return;
    }
    const draggedEl = window._activeDraggedPageEl;
    const draggedId = window._activeDraggedPageId;
    if (!draggedEl || !draggedId) {
      return;
    }
    window._dragDropped = true;

    document.querySelectorAll('.page-card').forEach(c => {
      c.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
    });

    if (!window.projectConfig) window.projectConfig = {};

    const targetContainer = container || document.getElementById('pages-cards-all') || draggedEl.parentElement;
    const currentDomCards = Array.from(targetContainer.querySelectorAll('.page-card'));
    const fullOrderedIds = currentDomCards.map(c => c.getAttribute('data-page-id')).filter(Boolean);

    if (fullOrderedIds.length === 0) return;

    // 1. Save new custom order
    window.projectConfig.pagesCustomOrder = fullOrderedIds;
    window.projectConfig.pagesCustomOrderUserSet = true;

    // 2. Keep projectConfig.categories and allCategoryIndex in sync with their order in the list
    const catCards = currentDomCards.filter(c => c.hasAttribute('data-cat-name'));
    const catList = catCards.map(c => c.getAttribute('data-cat-name')).filter(Boolean);
    if (catList.length > 0) {
      const newAllIdx = catList.findIndex(c => String(c).toLowerCase() === 'all');
      window.projectConfig.allCategoryIndex = (newAllIdx >= 0) ? newAllIdx : 0;
      window.projectConfig.categories = catList.filter(c => String(c).toLowerCase() !== 'all');
    }

    if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
    renderStaticPages();
    if (typeof window.renderTaxonomy === 'function') window.renderTaxonomy();
    if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
    if (typeof window.renderPipelineGrid === 'function') window.renderPipelineGrid();
    if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
    if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
    if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
    if (typeof window.showToast === 'function') window.showToast('Reordered pages');
  }

  function handleCategoryDrop(e, container) {
    handleUniversalPageDrop(e, container);
  }

  function handleCategoryDropAtGhost(e, container) {
    handleUniversalPageDrop(e, container);
  }

  function createPageCardDOM(page, isHiddenCard = false) {
    const card = document.createElement('div');
    const slug = page.slug || (typeof generateSlug === 'function' ? generateSlug(page.title) : (page.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const isAll = isAllPage(page);
    const isBuiltIn = isBuiltInPage(page) && !isAll;

    const currentCatsLower = new Set(
      (window.projectConfig?.categories || [])
        .map(c => (typeof c === 'object' ? (c.name || c.title || '') : String(c || '')).trim().toLowerCase())
        .filter(Boolean)
    );
    const isCat = isCategoryPageItem(page, currentCatsLower) || isAll;
    const isNonEditable = isCat || isAll;
    const catName = isAll ? 'All' : (page.categoryAggregate || page.title || '');

    const isUserMade = !isBuiltIn && !isCat;

    card.className = `page-card pipeline-card ${isCat ? 'category-page-card' : ''} ${isHiddenCard ? 'is-retired is-hidden card-hidden' : ''}`;
    card.style.cursor = isPagesEditMode ? 'grab' : 'pointer';
    if (page.id) card.setAttribute('data-page-id', page.id);
    if (slug) card.setAttribute('data-slug', slug);
    if (isCat || isAll) {
      card.setAttribute('data-cat-name', catName);
    }
    card.setAttribute('draggable', isPagesEditMode ? 'true' : 'false');

    // Visibility Toggle Button on the right side: red Disabled or green Enabled
    const visibilityActionBtn = isHiddenCard
      ? `<button type="button" class="card-btn card-btn-status-disabled card-btn-disabled" data-action="enable" title="Disabled – click to enable">Disabled</button>`
      : `<button type="button" class="card-btn card-btn-status-enabled card-btn-enabled" data-action="disable" title="Enabled – click to disable">Enabled</button>`;

    // Deletion: only available in Edit Mode for deletable items (not built-in, not 'All')
    const isDeletable = !isBuiltIn && !isAll;
    const canDelete = isPagesEditMode && isDeletable;

    const deleteBtnHtml = canDelete
      ? `<button type="button" class="card-btn card-btn-danger" data-action="${isCat ? 'delete-cat' : 'delete'}">Delete</button>`
      : '';

    const hoverDeleteBtnHtml = '';

    const currentLayout = page.layout === 'list' || (page.markdown && page.markdown.includes('layout="list"')) || (page.proseHtml && page.proseHtml.includes('data-layout="list"')) ? 'list' : 'grid';

    const layoutToggleHtml = (isPagesEditMode && (isCat || isAll))
      ? `
        <div class="posts-view-toggle cat-card-view-toggle" role="group" aria-label="Layout Mode">
          <button type="button" class="posts-view-btn ${currentLayout === 'grid' ? 'active is-active' : ''}" data-cat-layout="grid" title="Grid Layout">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <span>Grid</span>
          </button>
          <button type="button" class="posts-view-btn ${currentLayout === 'list' ? 'active is-active' : ''}" data-cat-layout="list" title="List Layout">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            <span>List</span>
          </button>
        </div>
      `
      : '';

    const actionsHtml = `
      ${deleteBtnHtml}
      ${visibilityActionBtn}
    `;

    const pendingTitleKey = isCat ? `cat_${catName}` : `page_${page.id}`;
    const displayTitle = (isPagesEditMode && editModePendingTitles[pendingTitleKey] !== undefined)
      ? editModePendingTitles[pendingTitleKey]
      : (page.title || '');

    // Title: Only user categories and user-made custom pages can be renamed.
    // Built-in pages (About, Links, RSS) and the All aggregate page cannot be renamed.
    const isTitleEditable = isPagesEditMode && ((isCat && !isAll) || isUserMade);

    // Page Type Tag Badge next to title: Redirect, Category, Static, Built-In
    let pageTypeTag = 'Static';
    let badgeClass = 'badge-static';

    if (page.isRedirect) {
      pageTypeTag = 'Redirect';
      badgeClass = 'badge-redirect';
    } else if (isCat || isAll) {
      pageTypeTag = 'Category';
      badgeClass = 'badge-category';
    } else if (isBuiltIn) {
      pageTypeTag = 'Built-In';
      badgeClass = 'badge-builtin';
    } else {
      pageTypeTag = 'Static';
      badgeClass = 'badge-static';
    }

    const redirectIconSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    const typeBadge = page.isRedirect
      ? `<span class="badge ${badgeClass}" data-action="goto-redirect" title="Open ${escapeHtml(page.redirectUrl || page.url || '')} in a new tab">${pageTypeTag} ${redirectIconSvg}</span>`
      : `<span class="badge ${badgeClass}" title="${pageTypeTag} page">${pageTypeTag}</span>`;
    const redirectGoToBtn = '';

    const displayUrl = (isPagesEditMode && page.id && editModePendingUrls[page.id] !== undefined)
      ? editModePendingUrls[page.id]
      : (page.redirectUrl || page.url || '');
    const redirectUrlDisplay = (isPagesEditMode && page.isRedirect)
      ? `<input type="text" class="card-url-input" style="font-weight: 400 !important; font-size: 0.82rem; color: var(--text-secondary, #a1a1aa); margin-top: 4px;" value="${escapeHtml(displayUrl)}" placeholder="https://example.com" data-page-id="${page.id || ''}" onclick="event.stopPropagation();" oninput="if (window._onPagesUrlInput) window._onPagesUrlInput(this);">`
      : (page.isRedirect ? `<span class="card-redirect-url-sub" style="display: block; font-size: 0.75rem; font-weight: 400; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;" title="${escapeHtml(page.redirectUrl || page.url || '')}">${escapeHtml(page.redirectUrl || page.url || '')}</span>` : '');

    const titleHtml = isTitleEditable
      ? `<div style="display: flex; flex-direction: column; width: 100%;"><div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"><input type="text" class="card-title-input" value="${escapeHtml(displayTitle)}" placeholder="Title" data-page-id="${page.id || ''}" data-is-cat="${isCat ? 'true' : 'false'}" data-cat-name="${isCat ? escapeHtml(catName) : ''}" data-original-title="${escapeHtml(page.title || '')}" onclick="event.stopPropagation();" oninput="if (window._onPagesTitleInput) window._onPagesTitleInput(this);">${typeBadge}${redirectGoToBtn}</div>${redirectUrlDisplay}</div>`
      : `<div style="display: flex; flex-direction: column;"><div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"><h4 class="card-title" style="margin: 0;">${escapeHtml(page.title || 'Untitled Page')}</h4>${typeBadge}${redirectGoToBtn}</div>${redirectUrlDisplay}</div>`;

    card.innerHTML = `
      ${hoverDeleteBtnHtml}
      <div class="card-content-wrap">
        <div class="card-main-header">
          ${isPagesEditMode ? `
            <span class="category-drag-handle page-drag-handle" title="Drag to reorder page" aria-label="Drag to reorder page">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5"></circle>
                <circle cx="11" cy="3" r="1.5"></circle>
                <circle cx="5" cy="8" r="1.5"></circle>
                <circle cx="11" cy="8" r="1.5"></circle>
                <circle cx="5" cy="13" r="1.5"></circle>
                <circle cx="11" cy="13" r="1.5"></circle>
              </svg>
            </span>` : ''}
          ${titleHtml}
          ${layoutToggleHtml}
        </div>
        <div class="card-list-actions">
          ${actionsHtml}
        </div>
      </div>
    `;

    // Prevent card drag when clicking or dragging to highlight text inside inputs or buttons
    const syncCardDraggableForTarget = (target) => {
      if (!isPagesEditMode) {
        card._suppressCardDrag = true;
        card.draggable = false;
        card.setAttribute('draggable', 'false');
        return;
      }
      const inInteractive = target && typeof target.closest === 'function' &&
        target.closest('input, textarea, button, select, a, .posts-view-toggle, .card-title-input, .card-url-input, .badge-redirect');
      if (inInteractive) {
        card._suppressCardDrag = true;
        card.draggable = false;
        card.setAttribute('draggable', 'false');
      } else {
        card._suppressCardDrag = false;
        card.draggable = true;
        card.setAttribute('draggable', 'true');
      }
    };

    card.addEventListener('pointerdown', (e) => {
      syncCardDraggableForTarget(e.target);
    }, true);

    card.addEventListener('mousedown', (e) => {
      syncCardDraggableForTarget(e.target);
    }, true);

    card.addEventListener('touchstart', (e) => {
      syncCardDraggableForTarget(e.target);
    }, { capture: true, passive: true });

    card.querySelectorAll('input, textarea').forEach(inp => {
      inp.setAttribute('draggable', 'false');
      inp.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      inp.addEventListener('focus', () => {
        card._suppressCardDrag = true;
        card.draggable = false;
        card.setAttribute('draggable', 'false');
      });
    });

    // Universal Drag and Drop Events for ALL page cards in Edit Mode
    card.addEventListener('dragstart', (e) => {
      if (!isPagesEditMode || card._suppressCardDrag) {
        e.preventDefault();
        return;
      }
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('.posts-view-toggle')) {
        e.preventDefault();
        return;
      }
      window._activeDraggedPageId = page.id || page.slug;
      window._activeDraggedPageEl = card;
      window._dragDropped = false;
      const container = card.parentElement;
      if (container) {
        window._dragInitialOrder = Array.from(container.querySelectorAll('.page-card'))
          .map(c => c.getAttribute('data-page-id'));
      }
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', window._activeDraggedPageId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      document.querySelectorAll('.page-card').forEach(c => {
        c.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
      });
      if (!window._dragDropped && window._dragInitialOrder && card.parentElement) {
        // Revert to original order if drag was cancelled
        const container = card.parentElement;
        const currentCardsMap = new Map();
        Array.from(container.querySelectorAll('.page-card')).forEach(c => {
          currentCardsMap.set(c.getAttribute('data-page-id'), c);
        });
        window._dragInitialOrder.forEach(id => {
          const el = currentCardsMap.get(id);
          if (el) container.appendChild(el);
        });
      }
      window._activeDraggedPageId = null;
      window._activeDraggedPageEl = null;
      window._dragInitialOrder = null;
    });

    card.addEventListener('dragover', (e) => {
      if (!isPagesEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const draggedEl = window._activeDraggedPageEl;
      if (!draggedEl || draggedEl === card) return;

      const container = card.parentElement;
      if (!container || draggedEl.parentElement !== container) return;

      const rect = card.getBoundingClientRect();
      const isListView = card.closest('.is-list-view') !== null;
      const isAfter = isListView
        ? (e.clientY > rect.top + rect.height / 2)
        : (e.clientX > rect.left + rect.width / 2);

      // Move the single dragged card into position to show what things will look like if dropped right there
      const targetSibling = isAfter ? card.nextElementSibling : card;
      if (targetSibling !== draggedEl && draggedEl.nextElementSibling !== targetSibling) {
        container.insertBefore(draggedEl, targetSibling);
      }
    });

    card.addEventListener('drop', (e) => {
      handleUniversalPageDrop(e, card.parentElement);
    });

    card.addEventListener('click', async (e) => {
      // Handle category layout toggle [Grid | List]
      const layoutBtn = e.target.closest('[data-cat-layout]');
      if (layoutBtn) {
        e.stopPropagation();
        if (!isPagesEditMode) return;
        captureEditModeInputs();
        const chosenLayout = layoutBtn.dataset.catLayout === 'list' ? 'list' : 'grid';
        page.layout = chosenLayout;
        page.markdown = `:::recent-posts layout="${chosenLayout}":::`;
        page.proseHtml = `<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="${chosenLayout}" contenteditable="false"></div>`;
        page.updatedAt = Date.now();
        if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
        if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
          window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
        }
        const toggleWrap = layoutBtn.closest('.cat-card-view-toggle');
        if (toggleWrap) {
          toggleWrap.querySelectorAll('[data-cat-layout]').forEach(b => {
            const active = b.dataset.catLayout === chosenLayout;
            b.classList.toggle('active', active);
            b.classList.toggle('is-active', active);
          });
        }
        if (typeof showToast === 'function') showToast(`${page.title} layout set to ${chosenLayout}`);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        const act = btn.dataset.action;
        if (act === 'goto-redirect') {
          const targetUrl = page.redirectUrl || page.url;
          if (targetUrl) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
          return;
        } else if (act === 'edit') {
          if (isPagesEditMode || isNonEditable) {
            return;
          }
          if (page.id === 'page_links' || page.slug === 'links' || (page.title || '').trim().toLowerCase() === 'links') {
            window.location.hash = '#links';
          } else {
            openPostInEditor(page.id);
          }
        } else if (act === 'links') {
          if (isPagesEditMode) return;
          window.location.hash = '#links';
        } else if (act === 'disable' || act === 'hide') {
          if (isPagesEditMode) {
            captureEditModeInputs();
          }
          const sortKey = getPageSortKey(page);
          if (sortKey && !sessionPinnedHiddenState.has(sortKey)) {
            sessionPinnedHiddenState.set(sortKey, isPageHidden(page));
          }
          const nowTs = Date.now();
          page.hidden = true;
          page.retired = true;
          page.updatedAt = nowTs;
          if (window.currentDraft && window.currentDraft.id === page.id) {
            window.currentDraft.hidden = true;
            window.currentDraft.retired = true;
            window.currentDraft.updatedAt = nowTs;
          }
          if (Array.isArray(window.drafts)) {
            const d = window.drafts.find(item => item && (item.id === page.id || (page.slug && item.slug === page.slug)));
            if (d) {
              d.hidden = true;
              d.retired = true;
              d.updatedAt = nowTs;
            }
          }
          if (window.CedarStore && typeof window.CedarStore.getPage === 'function') {
            const storePage = window.CedarStore.getPage(page.id) || (page.slug ? window.CedarStore.getPage(page.slug) : null);
            if (storePage) {
              storePage.hidden = true;
              storePage.retired = true;
              storePage.updatedAt = nowTs;
            }
          }
          const isRss = (page.id === 'page_rss' || page.slug === 'rss' || (page.title || '').trim().toLowerCase() === 'rss');
          if (isRss) {
            try {
              localStorage.setItem('cedar_rss_user_explicitly_disabled', 'true');
            } catch (e) {}
            if (window.projectConfig) {
              window.projectConfig.rssEnabled = false;
            }
            try {
              localStorage.setItem('cedar_rss_enabled', 'false');
              localStorage.setItem('outpost_rss_enabled', 'false');
            } catch (e) {}
            if (typeof saveProjectToStorage === 'function') {
              saveProjectToStorage();
            }
          }
          const isAll = isAllPage(page);
          if (isAll) {
            try {
              localStorage.setItem('cedar_all_disabled', 'true');
            } catch (e) {}
            if (window.projectConfig) {
              window.projectConfig.allDisabled = true;
              window.projectConfig.allEnabled = false;
            }
            if (typeof saveProjectToStorage === 'function') {
              saveProjectToStorage();
            }
          }
          if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
          if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
            window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
          }
          renderStaticPages();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
          if (typeof showToast === 'function') showToast(`Page "${page.title}" disabled from public site`);
        } else if (act === 'enable' || act === 'unhide') {
          if (isPagesEditMode) {
            captureEditModeInputs();
          }
          const sortKey = getPageSortKey(page);
          if (sortKey && !sessionPinnedHiddenState.has(sortKey)) {
            sessionPinnedHiddenState.set(sortKey, isPageHidden(page));
          }
          const nowTs = Date.now();
          page.hidden = false;
          page.retired = false;
          page.status = 'published';
          page.updatedAt = nowTs;
          if (window.currentDraft && window.currentDraft.id === page.id) {
            window.currentDraft.hidden = false;
            window.currentDraft.retired = false;
            window.currentDraft.status = 'published';
            window.currentDraft.updatedAt = nowTs;
          }
          if (Array.isArray(window.drafts)) {
            const d = window.drafts.find(item => item && (item.id === page.id || (page.slug && item.slug === page.slug)));
            if (d) {
              d.hidden = false;
              d.retired = false;
              d.status = 'published';
              d.updatedAt = nowTs;
            }
          }
          if (window.CedarStore && typeof window.CedarStore.getPage === 'function') {
            const storePage = window.CedarStore.getPage(page.id) || (page.slug ? window.CedarStore.getPage(page.slug) : null);
            if (storePage) {
              storePage.hidden = false;
              storePage.retired = false;
              storePage.status = 'published';
              storePage.updatedAt = nowTs;
            }
          }
          const isRss = (page.id === 'page_rss' || page.slug === 'rss' || (page.title || '').trim().toLowerCase() === 'rss');
          if (isRss) {
            try {
              localStorage.removeItem('cedar_rss_user_explicitly_disabled');
            } catch (e) {}
            if (window.projectConfig) {
              window.projectConfig.rssEnabled = true;
            }
            try {
              localStorage.setItem('cedar_rss_enabled', 'true');
              localStorage.setItem('outpost_rss_enabled', 'true');
            } catch (e) {}
            if (typeof saveProjectToStorage === 'function') {
              saveProjectToStorage();
            }
            if (typeof window.syncRssPageDraft === 'function') {
              window.syncRssPageDraft(window.projectConfig);
            }
          }
          const isAll = isAllPage(page);
          if (isAll) {
            try {
              localStorage.removeItem('cedar_all_disabled');
            } catch (e) {}
            if (window.projectConfig) {
              window.projectConfig.allDisabled = false;
              window.projectConfig.allEnabled = true;
            }
            if (typeof saveProjectToStorage === 'function') {
              saveProjectToStorage();
            }
          }
          if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
          if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
            window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
          }
          renderStaticPages();
          if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
          if (typeof showToast === 'function') {
            if (isRss) {
              showToast('RSS page and syndication enabled');
            } else {
              showToast(`Page "${page.title}" enabled on public site`);
            }
          }
        } else if (act === 'delete') {
          if (isBuiltIn || isAll) return;
          const confirmed = (typeof window.showConfirmDialog === 'function')
            ? await window.showConfirmDialog({
                title: 'Delete Page?',
                message: `Are you sure you want to delete page "${page.title || 'Untitled'}"?`,
                confirmText: 'Delete',
                isDanger: true
              })
            : confirm(`Are you sure you want to delete page "${page.title}"?`);

          if (confirmed) {
            if (editModeSnapshot && Array.isArray(editModeSnapshot.drafts)) {
              editModeSnapshot.drafts = editModeSnapshot.drafts.filter(d => d && d.id !== page.id && (!page.slug || d.slug !== page.slug));
            }
            if (typeof window.deleteItem === 'function') {
              await window.deleteItem(page.id, { skipConfirm: true });
            } else if (Array.isArray(window.drafts)) {
              window.drafts = window.drafts.filter(d => d.id !== page.id);
              if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
              renderStaticPages();
              if (typeof updateDashboardCounts === 'function') updateDashboardCounts();
              if (typeof showToast === 'function') showToast(`Page "${page.title}" deleted`);
            }
          }
        } else if (act === 'delete-cat') {
          if (isBuiltIn || isAll) return;
          const confirmed = (typeof window.showConfirmDialog === 'function')
            ? await window.showConfirmDialog({
                title: 'Delete Category?',
                message: `Are you sure you want to delete category "${catName}"?`,
                confirmText: 'Delete',
                isDanger: true
              })
            : confirm(`Are you sure you want to delete category "${catName}"?`);

          if (confirmed) {
            if (editModeSnapshot) {
              if (Array.isArray(editModeSnapshot.drafts)) {
                editModeSnapshot.drafts = editModeSnapshot.drafts.filter(d => d && d.id !== page.id);
              }
              if (Array.isArray(editModeSnapshot.categories)) {
                editModeSnapshot.categories = editModeSnapshot.categories.filter(c => String(c).toLowerCase() !== catName.toLowerCase());
              }
            }
            if (window.projectConfig && Array.isArray(window.projectConfig.categories)) {
              window.projectConfig.categories = window.projectConfig.categories.filter(c => String(c).toLowerCase() !== catName.toLowerCase());
              if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
            }
            if (Array.isArray(window.drafts)) {
              window.drafts = window.drafts.filter(d => d.id !== page.id);
              window.drafts.forEach(d => {
                if (!d || d.type === 'page') return;
                let postChanged = false;
                if (d.tag && d.tag.trim().toLowerCase() === catName.toLowerCase()) {
                  d.tag = '';
                  postChanged = true;
                }
                if (Array.isArray(d.categories)) {
                  const origLen = d.categories.length;
                  d.categories = d.categories.filter(c => c && c.trim().toLowerCase() !== catName.toLowerCase());
                  if (d.categories.length !== origLen) postChanged = true;
                }
                if (!d.tag && Array.isArray(d.categories) && d.categories.length > 0) {
                  d.tag = d.categories[0];
                  postChanged = true;
                }
                if (postChanged) d.updatedAt = Date.now();
              });
              if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
            }
            renderStaticPages();
            if (typeof window.renderTaxonomy === 'function') window.renderTaxonomy();
            if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
            if (typeof window.updatePostsCategoryFilterOptions === 'function') window.updatePostsCategoryFilterOptions();
            if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
            if (typeof window.renderPipelineGrid === 'function') window.renderPipelineGrid();
            if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
            if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
            if (typeof window.showToast === 'function') showToast(`Deleted category "${catName}"`);
          }
        }
        return;
      }

      // Card body clicks:
      if (isPagesEditMode) {
        return;
      }

      if (isCat || isAll) {
        const filterCat = isAll ? '' : (catName || page.title || '').trim();

        // 1. Clear posts search input
        const postsSearchInput = document.getElementById('posts-search-input');
        if (postsSearchInput) {
          postsSearchInput.value = '';
        }

        // 3. Reset posts pagination
        window._postsColumnPages = {};

        // 4. Update posts category dropdown options
        if (typeof updatePostsCategoryFilterOptions === 'function') {
          updatePostsCategoryFilterOptions();
        }

        const catFilterSelect = document.getElementById('posts-category-filter');
        if (catFilterSelect) {
          if (!filterCat) {
            catFilterSelect.value = '';
          } else {
            const matchedOpt = Array.from(catFilterSelect.options).find(opt => opt.value.trim().toLowerCase() === filterCat.toLowerCase());
            if (matchedOpt) {
              catFilterSelect.value = matchedOpt.value;
            } else {
              catFilterSelect.value = filterCat;
            }
          }
        }

        // 5. Navigate to posts tab
        if (typeof navigateTo === 'function') {
          navigateTo('posts');
        } else if (typeof switchPane === 'function') {
          switchPane('pane-posts');
        } else {
          window.location.hash = '#posts';
        }

        // 6. Ensure dropdown value is retained and render grid
        if (catFilterSelect) {
          if (!filterCat) {
            catFilterSelect.value = '';
          } else {
            const matchedOpt = Array.from(catFilterSelect.options).find(opt => opt.value.trim().toLowerCase() === filterCat.toLowerCase());
            if (matchedOpt) {
              catFilterSelect.value = matchedOpt.value;
            } else {
              catFilterSelect.value = filterCat;
            }
          }
        }

        if (typeof renderAllPostsGrid === 'function') {
          renderAllPostsGrid();
        } else if (window.Cedar && window.Cedar.dashboard && typeof window.Cedar.dashboard.renderAllPostsGrid === 'function') {
          window.Cedar.dashboard.renderAllPostsGrid();
        }
        return;
      }

      if (page.isRedirect) {
        openEditRedirectModal(page);
        return;
      }

      if (page.id === 'page_links' || page.slug === 'links' || (page.title || '').trim().toLowerCase() === 'links') {
        window.location.hash = '#links';
      } else {
        openPostInEditor(page.id);
      }
    });

    return card;
  }

  function renderPagesColumn(containerId, items, sectionType, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (items.length === 0) {
      const emptyLabel = sectionType === 'my-pages'
        ? 'No static pages yet'
        : (sectionType === 'categories'
          ? 'No category pages yet'
          : (sectionType === 'builtin'
            ? 'No built-in pages'
            : 'No pages yet'));
      container.innerHTML = `
        <div class="pipeline-empty-state" style="grid-column: 1 / -1; width: 100%;">
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
      currentPage = window._pagesColumnPages[containerId] || 1;
      totalPages = Math.ceil(items.length / PAGES_PAGE_SIZE);
      if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
      window._pagesColumnPages[containerId] = currentPage;
      pagedItems = items.slice((currentPage - 1) * PAGES_PAGE_SIZE, currentPage * PAGES_PAGE_SIZE);
    }

    container.innerHTML = '';
    pagedItems.forEach(page => {
      container.appendChild(createPageCardDOM(page, isPageHidden(page)));
    });

    if (!container._hasUniversalDragListeners) {
      container._hasUniversalDragListeners = true;
      container.addEventListener('dragover', (e) => {
        if (!isPagesEditMode) return;
        const draggedEl = window._activeDraggedPageEl;
        if (!draggedEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (e.target === container || !e.target.closest('.page-card')) {
          if (container.lastElementChild !== draggedEl) {
            container.appendChild(draggedEl);
          }
        }
      });
      container.addEventListener('drop', (e) => {
        if (!isPagesEditMode) return;
        handleUniversalPageDrop(e, container);
      });
    }

    // Append "+X More" card if in limited mode and extra items exist
    if (isLimited && options.showMoreCard && items.length > limit) {
      const remaining = items.length - limit;
      const moreCard = createPagesMoreCard(sectionType, remaining, items.length);
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
          window._pagesColumnPages[containerId] = currentPage - 1;
          renderPagesColumn(containerId, items, sectionType, options);
          container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      pagination.querySelector('.btn-pagination-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPage < totalPages) {
          window._pagesColumnPages[containerId] = currentPage + 1;
          renderPagesColumn(containerId, items, sectionType, options);
          container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      container.appendChild(pagination);
    }
  }

  function renderStaticPages() {
    // Keep switch in sync with projectConfig and sync active category pages
    syncAutoCategoryToggles();
    syncCategoryPages();
    updatePagesEditModeUI();
    initPagesEditModeListeners();

    let allPages = (window.CedarStore && typeof window.CedarStore.getPages === 'function')
      ? window.CedarStore.getPages()
      : (Array.isArray(window.drafts) ? window.drafts.filter(d => d && (d.type === 'page' || d.isCategoryAggregate)) : []);

    // Auto-heal any user page whose title is real but slug is placeholder or empty
    allPages.forEach(p => {
      if (p && p.type === 'page' && p.title && (!p.slug || p.slug === 'untitled-page' || p.slug === 'untitled-post')) {
        const t = (p.title || '').trim();
        if (t && (typeof PAGE_PLACEHOLDERS === 'undefined' || !PAGE_PLACEHOLDERS.has(t.toLowerCase()))) {
          p.slug = (typeof window.generateSlug === 'function')
            ? window.generateSlug(t, 'untitled-page', 30)
            : t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
      }
    });

    // Filter out internal hidden pages (about-cedar), dummy pages, test duplicates, and actually blank pages
    const deletedSet = (window.CedarStore && typeof window.CedarStore.getDeletedIdsSet === 'function')
      ? window.CedarStore.getDeletedIdsSet()
      : new Set();
    allPages = allPages.filter(d => {
      if (!d) return false;
      if (d.id && deletedSet.has(String(d.id))) return false;
      if (d.id === 'page_about_cedar' || d.slug === 'about-cedar') return false;
      if (typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(d)) return false;
      return true;
    });
    allPages.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Deduplicate by slug and by title (for user pages) so duplicate cards can never render
    const dedupedAllPages = [];
    const seenSlugs = new Set();
    const seenTitles = new Set();
    for (const p of allPages) {
      const slugKey = (p.slug || '').trim().toLowerCase();
      const titleKey = (p.title || '').trim().toLowerCase();
      if (slugKey && seenSlugs.has(slugKey)) continue;
      if (titleKey && !isBuiltInPage(p) && seenTitles.has(titleKey)) continue;
      if (slugKey) seenSlugs.add(slugKey);
      if (titleKey && !isBuiltInPage(p)) seenTitles.add(titleKey);
      dedupedAllPages.push(p);
    }
    allPages = dedupedAllPages;

    const searchInput = document.getElementById('pages-search-input');
    const searchQuery = (searchInput?.value || '').trim().toLowerCase();
    if (searchQuery) {
      allPages = allPages.filter(p => {
        const title = (p.title || '').toLowerCase();
        const slug = (p.slug || '').toLowerCase();
        const subtitle = (p.subtitle || '').toLowerCase();
        const md = (p.markdown || '').toLowerCase();
        const cat = (p.categoryAggregate || '').toLowerCase();
        return title.includes(searchQuery) || slug.includes(searchQuery) || subtitle.includes(searchQuery) || md.includes(searchQuery) || cat.includes(searchQuery);
      });
    }

    const currentCatsLower = new Set(
      (window.projectConfig?.categories || [])
        .map(c => (typeof c === 'object' ? (c.name || c.title || '') : String(c || '')).trim().toLowerCase())
        .filter(Boolean)
    );

    // Default ordering procedure:
    // 1. Enabled pages before Disabled pages
    // 2. Section order: Categories first (1), then Static Pages (2), then Redirects (3), then Built-Ins (4)
    // 3. Within each section, arrange chronologically so whatever is newest appears at the top
    const getTypeRank = (p) => {
      if (isCategoryPageItem(p, currentCatsLower) || isAllPage(p)) return 1;
      if (!isBuiltInPage(p) && !p.isRedirect) return 2; // Static
      if (p.isRedirect) return 3; // Redirect
      return 4; // Built-In
    };

    const getPageCreatedTime = (p) => {
      if (!p || isAllPage(p)) return 0;
      if (typeof p.createdAt === 'number' && p.createdAt > 0) return p.createdAt;
      const m = String(p.id || '').match(/^page_(\d+)_/);
      if (m && m[1]) return Number(m[1]);
      if (typeof p.updatedAt === 'number' && p.updatedAt > 0) return p.updatedAt;
      return 0;
    };

    const comparePagesByDefaultProcedure = (a, b) => {
      const hiddenA = getSortHiddenState(a);
      const hiddenB = getSortHiddenState(b);
      if (hiddenA !== hiddenB) return hiddenA ? 1 : -1;
      const rankA = getTypeRank(a);
      const rankB = getTypeRank(b);
      if (rankA !== rankB) return rankA - rankB;
      const timeA = getPageCreatedTime(a);
      const timeB = getPageCreatedTime(b);
      if (timeA !== timeB) return timeB - timeA;
      if (rankA === 4) {
        const orderMap = { 'about': 1, 'links': 2, 'rss': 3 };
        const aSlug = (a.slug || a.id || a.title || '').toLowerCase().replace(/^page_/, '');
        const bSlug = (b.slug || b.id || b.title || '').toLowerCase().replace(/^page_/, '');
        return (orderMap[aSlug] || 99) - (orderMap[bSlug] || 99);
      }
      return (a.title || '').localeCompare(b.title || '');
    };

    const hasUserCustomOrder = Boolean(
      window.projectConfig &&
      window.projectConfig.pagesCustomOrderUserSet &&
      Array.isArray(window.projectConfig.pagesCustomOrder) &&
      window.projectConfig.pagesCustomOrder.length > 0
    );

    if (hasUserCustomOrder) {
      const customOrder = [...window.projectConfig.pagesCustomOrder];
      const pageByIdOrSlug = new Map();
      allPages.forEach(p => {
        if (p.id) pageByIdOrSlug.set(String(p.id).toLowerCase(), p);
        if (p.slug) pageByIdOrSlug.set(String(p.slug).toLowerCase(), p);
      });

      const isInCustomOrder = (p) => {
        const idKey = String(p.id || '').toLowerCase();
        const slugKey = String(p.slug || '').toLowerCase();
        return customOrder.some(k => {
          const kl = String(k || '').toLowerCase();
          return (idKey && kl === idKey) || (slugKey && kl === slugKey);
        });
      };

      const missingPages = allPages.filter(p => !isInCustomOrder(p));
      if (missingPages.length > 0) {
        // Sort oldest-to-newest so that as each is inserted at the top of its section, the newest ends up first
        missingPages.sort((a, b) => -comparePagesByDefaultProcedure(a, b));
        missingPages.forEach(np => {
          const npId = np.id || np.slug;
          if (!npId) return;
          const npHidden = getSortHiddenState(np);
          const npRank = getTypeRank(np);

          let insertIdx = -1;
          // 1. Insert right before the first existing page in customOrder with the same hidden state and same section rank (newest at top of section)
          for (let i = 0; i < customOrder.length; i++) {
            const ep = pageByIdOrSlug.get(String(customOrder[i] || '').toLowerCase());
            if (!ep) continue;
            if (getSortHiddenState(ep) === npHidden && getTypeRank(ep) === npRank) {
              insertIdx = i;
              break;
            }
          }
          // 2. If no page of this section exists yet, insert right after the last page with same hidden state and a preceding section rank
          if (insertIdx === -1) {
            for (let i = customOrder.length - 1; i >= 0; i--) {
              const ep = pageByIdOrSlug.get(String(customOrder[i] || '').toLowerCase());
              if (!ep) continue;
              if (getSortHiddenState(ep) === npHidden && getTypeRank(ep) < npRank) {
                insertIdx = i + 1;
                break;
              }
            }
          }
          // 3. Otherwise, insert before the first page with same hidden state and a later section rank
          if (insertIdx === -1) {
            for (let i = 0; i < customOrder.length; i++) {
              const ep = pageByIdOrSlug.get(String(customOrder[i] || '').toLowerCase());
              if (!ep) continue;
              if (getSortHiddenState(ep) === npHidden && getTypeRank(ep) > npRank) {
                insertIdx = i;
                break;
              }
            }
          }
          // 4. Otherwise, if enabled, insert before the first disabled page
          if (insertIdx === -1 && !npHidden) {
            for (let i = 0; i < customOrder.length; i++) {
              const ep = pageByIdOrSlug.get(String(customOrder[i] || '').toLowerCase());
              if (ep && getSortHiddenState(ep)) {
                insertIdx = i;
                break;
              }
            }
          }

          if (insertIdx >= 0 && insertIdx <= customOrder.length) {
            customOrder.splice(insertIdx, 0, npId);
          } else {
            customOrder.push(npId);
          }
        });
        window.projectConfig.pagesCustomOrder = customOrder;
        if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
      }

      const orderMap = new Map();
      customOrder.forEach((id, idx) => {
        orderMap.set(String(id).toLowerCase(), idx);
      });

      allPages.sort((a, b) => {
        const hiddenA = getSortHiddenState(a);
        const hiddenB = getSortHiddenState(b);
        if (hiddenA !== hiddenB) return hiddenA ? 1 : -1;
        const aId = (a.id || a.slug || '').toLowerCase();
        const bId = (b.id || b.slug || '').toLowerCase();
        const aIdx = orderMap.has(aId) ? orderMap.get(aId) : (a.slug && orderMap.has(a.slug.toLowerCase()) ? orderMap.get(a.slug.toLowerCase()) : 99999);
        const bIdx = orderMap.has(bId) ? orderMap.get(bId) : (b.slug && orderMap.has(b.slug.toLowerCase()) ? orderMap.get(b.slug.toLowerCase()) : 99999);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return comparePagesByDefaultProcedure(a, b);
      });
    } else {
      allPages.sort(comparePagesByDefaultProcedure);
    }

    // 1. Built-In pages (About, Links, RSS)
    const builtInPages = allPages.filter(p => isBuiltInPage(p) && !isAllPage(p));

    // 2. Category pages (All + user category aggregate pages)
    const userCategoryPages = allPages.filter(p => !isBuiltInPage(p) && isCategoryPageItem(p, currentCatsLower));
    const categoryPages = [...userCategoryPages];
    const allPage = allPages.find(p => isAllPage(p));
    if (allPage && !categoryPages.includes(allPage)) {
      categoryPages.unshift(allPage);
    }

    // 3. Static Pages (custom user-made static pages and redirects)
    const myPages = allPages.filter(p => !isBuiltInPage(p) && !isCategoryPageItem(p, currentCatsLower));

    // Update section counts in overview
    const countAllEl = document.getElementById('pages-overview-count-all');
    if (countAllEl) countAllEl.textContent = allPages.length;

    const countMyPagesEl = document.getElementById('pages-overview-count-my-pages');
    const countCategoriesEl = document.getElementById('pages-overview-count-categories');
    const countBuiltInEl = document.getElementById('pages-overview-count-builtin');
    if (countMyPagesEl) countMyPagesEl.textContent = myPages.length;
    if (countCategoriesEl) countCategoriesEl.textContent = categoryPages.length;
    if (countBuiltInEl) countBuiltInEl.textContent = builtInPages.length;

    if (typeof updateDashboardCounts === 'function') {
      updateDashboardCounts();
    }

    const currentSub = (window.currentPagesSubTab || 'all').toLowerCase();
    const overviewContainer = document.getElementById('pages-overview-container');
    const subpageContainer = document.getElementById('pages-subpage-container');

    // Update active state in sidebar sub-navigation and parent Pages tab ONLY when currently on Pages
    const isPagesTabActive = (window.currentDashboardTab === 'pages') ||
                             (window.location.hash && window.location.hash.startsWith('#pages'));

    if (isPagesTabActive) {
      const pagesSubWrap = document.getElementById('sidebar-pages-sub-wrap');
      if (pagesSubWrap) {
        pagesSubWrap.style.display = 'flex';
        pagesSubWrap.querySelectorAll('[data-pages-sub]').forEach(subItem => {
          subItem.classList.toggle('active', subItem.dataset.pagesSub === currentSub);
        });
      }

      const pagesTabBtn = document.getElementById('sidebar-tab-pages');
      if (pagesTabBtn) {
        pagesTabBtn.classList.toggle('active', currentSub === 'all');
        pagesTabBtn.classList.toggle('parent-active', currentSub !== 'all');
      }
    }

    if (currentSub === 'my-pages' || currentSub === 'categories' || currentSub === 'builtin') {
      if (overviewContainer) overviewContainer.style.display = 'none';
      if (subpageContainer) subpageContainer.style.display = 'flex';

      const subpageHeading = document.getElementById('pages-subpage-heading');
      const subpageCount = document.getElementById('pages-subpage-count');
      const subpageDot = document.getElementById('pages-subpage-dot');

      let targetList = [];
      let secType = 'all';
      let title = 'All Pages';

      if (currentSub === 'my-pages') {
        targetList = myPages;
        secType = 'my-pages';
        title = 'Static Pages';
        if (subpageDot) {
          subpageDot.className = 'col-dot dot-published';
          subpageDot.style.backgroundColor = '';
          subpageDot.style.boxShadow = '';
        }
      } else if (currentSub === 'categories') {
        targetList = categoryPages;
        secType = 'categories';
        title = 'Categories';
        if (subpageDot) {
          subpageDot.className = 'col-dot';
          subpageDot.style.backgroundColor = '#a855f7';
          subpageDot.style.boxShadow = '0 0 8px rgba(168, 85, 247, 0.4)';
        }
      } else if (currentSub === 'builtin') {
        targetList = builtInPages;
        secType = 'builtin';
        title = 'Built-In';
        if (subpageDot) {
          subpageDot.className = 'col-dot';
          subpageDot.style.backgroundColor = '#38bdf8';
          subpageDot.style.boxShadow = '0 0 8px rgba(56, 189, 248, 0.4)';
        }
      }

      if (subpageHeading) subpageHeading.textContent = title;
      if (subpageCount) subpageCount.textContent = targetList.length;

      renderPagesColumn('pages-cards-subpage', targetList, secType, { isSubpage: true });

    } else {
      if (overviewContainer) overviewContainer.style.display = 'flex';
      if (subpageContainer) subpageContainer.style.display = 'none';

      // 1. Unified Single Column for all pages
      renderPagesColumn('pages-cards-all', allPages, 'all');

      // 2. Also populate legacy column elements if present
      if (document.getElementById('pages-cards-categories')) {
        renderPagesColumn('pages-cards-categories', categoryPages, 'categories');
      }
      if (document.getElementById('pages-cards-my-pages')) {
        renderPagesColumn('pages-cards-my-pages', myPages, 'my-pages');
      }
      if (document.getElementById('pages-cards-builtin')) {
        renderPagesColumn('pages-cards-builtin', builtInPages, 'builtin');
      }
    }

    applyPagesViewModes();
  }

  let editingRedirectPageId = null;

  function openAddPageModal() {
    editingRedirectPageId = null;
    const modal = document.getElementById('modal-add-page-choice');
    if (!modal) return;
    const stepChoice = document.getElementById('add-page-step-choice');
    const stepCategory = document.getElementById('add-page-step-category');
    const stepRedirect = document.getElementById('add-page-step-redirect');
    const btnCancel = document.getElementById('btn-cancel-add-page-choice');
    const btnBack = document.getElementById('btn-back-add-page-choice');
    const btnSubmit = document.getElementById('btn-submit-new-category');
    const btnSubmitRedirect = document.getElementById('btn-submit-new-redirect');
    const title = document.getElementById('add-page-modal-title');
    const desc = document.getElementById('add-page-modal-desc');
    const inputCat = document.getElementById('input-add-page-cat-name');
    const inputRedirectTitle = document.getElementById('input-add-page-redirect-title');
    const inputRedirectUrl = document.getElementById('input-add-page-redirect-url');
    const iconPage = document.getElementById('add-page-modal-icon-page');
    const iconCat = document.getElementById('add-page-modal-icon-cat');
    const iconRedirect = document.getElementById('add-page-modal-icon-redirect');

    if (stepChoice) stepChoice.style.display = 'flex';
    if (stepCategory) stepCategory.style.display = 'none';
    if (stepRedirect) stepRedirect.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'inline-flex';
    if (btnBack) btnBack.style.display = 'none';
    if (btnSubmit) btnSubmit.style.display = 'none';
    if (btnSubmitRedirect) {
      btnSubmitRedirect.style.display = 'none';
      btnSubmitRedirect.textContent = 'Add Redirect';
    }
    if (iconPage) iconPage.style.display = 'inline-block';
    if (iconCat) iconCat.style.display = 'none';
    if (iconRedirect) iconRedirect.style.display = 'none';
    if (title) title.textContent = 'Add Page';
    if (desc) desc.textContent = 'Choose what type of page you would like to create';
    if (inputCat) inputCat.value = '';
    if (inputRedirectTitle) inputRedirectTitle.value = '';
    if (inputRedirectUrl) inputRedirectUrl.value = '';

    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  function openEditRedirectModal(page) {
    if (!page) return;
    initAddPageModalEvents();
    editingRedirectPageId = page.id;

    const modal = document.getElementById('modal-add-page-choice');
    if (!modal) return;
    const stepChoice = document.getElementById('add-page-step-choice');
    const stepCategory = document.getElementById('add-page-step-category');
    const stepRedirect = document.getElementById('add-page-step-redirect');
    const btnCancel = document.getElementById('btn-cancel-add-page-choice');
    const btnBack = document.getElementById('btn-back-add-page-choice');
    const btnSubmit = document.getElementById('btn-submit-new-category');
    const btnSubmitRedirect = document.getElementById('btn-submit-new-redirect');
    const title = document.getElementById('add-page-modal-title');
    const desc = document.getElementById('add-page-modal-desc');
    const inputRedirectTitle = document.getElementById('input-add-page-redirect-title');
    const inputRedirectUrl = document.getElementById('input-add-page-redirect-url');
    const iconPage = document.getElementById('add-page-modal-icon-page');
    const iconCat = document.getElementById('add-page-modal-icon-cat');
    const iconRedirect = document.getElementById('add-page-modal-icon-redirect');

    if (stepChoice) stepChoice.style.display = 'none';
    if (stepCategory) stepCategory.style.display = 'none';
    if (stepRedirect) stepRedirect.style.display = 'flex';
    if (btnCancel) btnCancel.style.display = 'inline-flex';
    if (btnBack) btnBack.style.display = 'none';
    if (btnSubmit) btnSubmit.style.display = 'none';
    if (btnSubmitRedirect) {
      btnSubmitRedirect.style.display = 'inline-flex';
      btnSubmitRedirect.textContent = 'Save Changes';
    }
    if (iconPage) iconPage.style.display = 'none';
    if (iconCat) iconCat.style.display = 'none';
    if (iconRedirect) iconRedirect.style.display = 'inline-block';
    if (title) title.textContent = 'Edit Redirect';
    if (desc) desc.textContent = 'Update the page title and target URL for this redirect.';
    if (inputRedirectTitle) {
      inputRedirectTitle.value = page.title || '';
      setTimeout(() => inputRedirectTitle.focus(), 50);
    }
    if (inputRedirectUrl) {
      inputRedirectUrl.value = page.redirectUrl || page.url || '';
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  function closeAddPageModal() {
    editingRedirectPageId = null;
    const modal = document.getElementById('modal-add-page-choice');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }

  function initAddPageModalEvents() {
    const modal = document.getElementById('modal-add-page-choice');
    if (!modal || modal.dataset.eventsBound === 'true') return;
    modal.dataset.eventsBound = 'true';

    const btnClose = document.getElementById('btn-close-add-page-choice');
    const btnCancel = document.getElementById('btn-cancel-add-page-choice');
    const btnBack = document.getElementById('btn-back-add-page-choice');
    const btnSubmit = document.getElementById('btn-submit-new-category');
    const btnSubmitRedirect = document.getElementById('btn-submit-new-redirect');
    const btnChoiceStatic = document.getElementById('btn-choice-static-page');
    const btnChoiceCategory = document.getElementById('btn-choice-category');
    const btnChoiceRedirect = document.getElementById('btn-choice-redirect');
    const stepChoice = document.getElementById('add-page-step-choice');
    const stepCategory = document.getElementById('add-page-step-category');
    const stepRedirect = document.getElementById('add-page-step-redirect');
    const title = document.getElementById('add-page-modal-title');
    const desc = document.getElementById('add-page-modal-desc');
    const inputCat = document.getElementById('input-add-page-cat-name');
    const inputRedirectTitle = document.getElementById('input-add-page-redirect-title');
    const inputRedirectUrl = document.getElementById('input-add-page-redirect-url');
    const iconPage = document.getElementById('add-page-modal-icon-page');
    const iconCat = document.getElementById('add-page-modal-icon-cat');
    const iconRedirect = document.getElementById('add-page-modal-icon-redirect');

    if (btnClose) btnClose.addEventListener('click', closeAddPageModal);
    if (btnCancel) btnCancel.addEventListener('click', closeAddPageModal);

    let mouseDownOnModalBackdrop = false;
    modal.addEventListener('mousedown', (e) => {
      mouseDownOnModalBackdrop = (e.target === modal);
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal && mouseDownOnModalBackdrop) closeAddPageModal();
      mouseDownOnModalBackdrop = false;
    });

    if (btnChoiceStatic) {
      btnChoiceStatic.addEventListener('click', () => {
        closeAddPageModal();
        if (typeof window.createNewStaticPage === 'function') {
          window.createNewStaticPage();
        }
      });
    }

    if (btnChoiceCategory) {
      btnChoiceCategory.addEventListener('click', () => {
        if (stepChoice) stepChoice.style.display = 'none';
        if (stepCategory) stepCategory.style.display = 'flex';
        if (stepRedirect) stepRedirect.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
        if (btnBack) btnBack.style.display = 'inline-flex';
        if (btnSubmit) btnSubmit.style.display = 'inline-flex';
        if (btnSubmitRedirect) btnSubmitRedirect.style.display = 'none';
        if (iconPage) iconPage.style.display = 'none';
        if (iconCat) iconCat.style.display = 'inline-block';
        if (iconRedirect) iconRedirect.style.display = 'none';
        if (title) title.textContent = 'Create Category';
        if (desc) desc.textContent = 'Enter a name for the new category and its aggregate page.';
        if (inputCat) {
          inputCat.value = '';
          setTimeout(() => inputCat.focus(), 50);
        }
      });
    }

    if (btnChoiceRedirect) {
      btnChoiceRedirect.addEventListener('click', () => {
        editingRedirectPageId = null;
        if (stepChoice) stepChoice.style.display = 'none';
        if (stepCategory) stepCategory.style.display = 'none';
        if (stepRedirect) stepRedirect.style.display = 'flex';
        if (btnCancel) btnCancel.style.display = 'none';
        if (btnBack) btnBack.style.display = 'inline-flex';
        if (btnSubmit) btnSubmit.style.display = 'none';
        if (btnSubmitRedirect) {
          btnSubmitRedirect.style.display = 'inline-flex';
          btnSubmitRedirect.textContent = 'Add Redirect';
        }
        if (iconPage) iconPage.style.display = 'none';
        if (iconCat) iconCat.style.display = 'none';
        if (iconRedirect) iconRedirect.style.display = 'inline-block';
        if (title) title.textContent = 'Add Redirect';
        if (desc) desc.textContent = 'Enter a page title and bookmark URL to redirect visitors to.';
        if (inputRedirectTitle) {
          inputRedirectTitle.value = '';
          setTimeout(() => inputRedirectTitle.focus(), 50);
        }
        if (inputRedirectUrl) {
          inputRedirectUrl.value = '';
        }
      });
    }

    if (btnBack) {
      btnBack.addEventListener('click', () => {
        editingRedirectPageId = null;
        if (stepChoice) stepChoice.style.display = 'flex';
        if (stepCategory) stepCategory.style.display = 'none';
        if (stepRedirect) stepRedirect.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'inline-flex';
        if (btnBack) btnBack.style.display = 'none';
        if (btnSubmit) btnSubmit.style.display = 'none';
        if (btnSubmitRedirect) {
          btnSubmitRedirect.style.display = 'none';
          btnSubmitRedirect.textContent = 'Add Redirect';
        }
        if (iconPage) iconPage.style.display = 'inline-block';
        if (iconCat) iconCat.style.display = 'none';
        if (iconRedirect) iconRedirect.style.display = 'none';
        if (title) title.textContent = 'Add Page';
        if (desc) desc.textContent = 'Choose what type of page you would like to create';
      });
    }

    const handleCreateRedirectSubmit = () => {
      const titleVal = (inputRedirectTitle?.value || '').trim();
      let urlVal = (inputRedirectUrl?.value || '').trim();

      if (!titleVal) {
        if (typeof window.showToast === 'function') window.showToast('Please enter a page title.');
        if (inputRedirectTitle) inputRedirectTitle.focus();
        return;
      }
      const reservedRedirectNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
      if (reservedRedirectNames.has(titleVal.toLowerCase())) {
        if (typeof window.showToast === 'function') window.showToast("Woah! That's a reserved name - pick something else.");
        if (inputRedirectTitle) inputRedirectTitle.focus();
        return;
      }
      if (!urlVal) {
        if (typeof window.showToast === 'function') window.showToast('Please enter a bookmark / target URL.');
        if (inputRedirectUrl) inputRedirectUrl.focus();
        return;
      }

      if (!urlVal.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i) && !urlVal.startsWith('/') && !urlVal.startsWith('#')) {
        urlVal = 'https://' + urlVal;
      }

      const redirectSlug = (typeof window.generateSlug === 'function')
        ? window.generateSlug(titleVal, 'redirect', 30)
        : titleVal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Check if editing an existing redirect page
      if (editingRedirectPageId) {
        let updated = false;
        if (window.CedarStore && typeof window.CedarStore.getPage === 'function') {
          const storePage = window.CedarStore.getPage(editingRedirectPageId);
          if (storePage) {
            storePage.title = titleVal;
            storePage.slug = redirectSlug;
            storePage.redirectUrl = urlVal;
            storePage.url = urlVal;
            storePage.updatedAt = Date.now();
            if (typeof window.CedarStore.upsert === 'function') {
              window.CedarStore.upsert(storePage);
            }
            updated = true;
          }
        }
        if (Array.isArray(window.drafts)) {
          const draftPage = window.drafts.find(d => d && d.id === editingRedirectPageId);
          if (draftPage) {
            draftPage.title = titleVal;
            draftPage.slug = redirectSlug;
            draftPage.redirectUrl = urlVal;
            draftPage.url = urlVal;
            draftPage.updatedAt = Date.now();
            updated = true;
          }
        }
        if (updated) {
          if (typeof window.saveDraftsToStorage === 'function') {
            window.saveDraftsToStorage();
          }
          renderStaticPages();
          if (typeof window.updateDashboardCounts === 'function') updateDashboardCounts();
          if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
          closeAddPageModal();
          if (typeof window.showToast === 'function') window.showToast(`Updated redirect page "${titleVal}"`);
          return;
        }
      }

      const redirectId = 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      const newRedirect = {
        id: redirectId,
        type: 'page',
        isRedirect: true,
        redirectUrl: urlVal,
        url: urlVal,
        title: titleVal,
        slug: redirectSlug,
        status: 'published',
        hidden: false,
        retired: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      if (window.CedarStore && typeof window.CedarStore.upsert === 'function') {
        window.CedarStore.upsert(newRedirect);
      } else if (Array.isArray(window.drafts)) {
        window.drafts.unshift(newRedirect);
      }
      if (typeof window.saveDraftsToStorage === 'function') {
        window.saveDraftsToStorage();
      }

      if (typeof window.logActivity === 'function') {
        window.logActivity('page', { action: 'created', id: redirectId, title: titleVal, isRedirect: true, url: urlVal });
      }

      renderStaticPages();
      if (typeof window.updateDashboardCounts === 'function') updateDashboardCounts();
      if (typeof window.updateLivePreview === 'function') window.updateLivePreview();

      closeAddPageModal();
      if (typeof window.showToast === 'function') window.showToast(`Added redirect page "${titleVal}"`);
    };

    if (btnSubmitRedirect) {
      btnSubmitRedirect.addEventListener('click', handleCreateRedirectSubmit);
    }

    if (inputRedirectTitle) {
      inputRedirectTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (inputRedirectUrl) inputRedirectUrl.focus();
        }
      });
    }

    if (inputRedirectUrl) {
      inputRedirectUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCreateRedirectSubmit();
        }
      });
    }

    const handleCreateCategorySubmit = () => {
      if (!inputCat) return;
      const rawVal = inputCat.value.trim();
      if (!rawVal) {
        if (typeof window.showToast === 'function') window.showToast('Please enter a category name.');
        inputCat.focus();
        return;
      }
      const forbiddenNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
      if (forbiddenNames.has(rawVal.toLowerCase())) {
        if (typeof window.showToast === 'function') window.showToast("Woah! That's a reserved name - pick something else.");
        return;
      }

      if (!window.projectConfig) window.projectConfig = {};
      if (!Array.isArray(window.projectConfig.categories)) window.projectConfig.categories = [];

      const exists = window.projectConfig.categories.some(c => String(c).trim().toLowerCase() === rawVal.toLowerCase());
      if (exists) {
        if (typeof window.showToast === 'function') window.showToast(`Category "${rawVal}" already exists.`);
        return;
      }

      // Add to projectConfig.categories
      window.projectConfig.categories.push(rawVal);
      if (typeof window.saveProjectToStorage === 'function') {
        window.saveProjectToStorage();
      }

      // Sync category aggregate pages (creates draft page)
      if (typeof window.syncCategoryPages === 'function') {
        window.syncCategoryPages();
      }

      // ONLY log category creation activity — DO NOT log page creation!
      if (typeof window.logActivity === 'function') {
        window.logActivity('category', { action: 'added', categoryName: rawVal });
      }

      // Refresh UI components
      renderStaticPages();
      if (typeof window.renderTaxonomy === 'function') window.renderTaxonomy();
      if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
      if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
      if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
      if (typeof window.updateLivePreview === 'function') window.updateLivePreview();

      closeAddPageModal();
      if (typeof window.showToast === 'function') window.showToast(`Created category "${rawVal}" and aggregate page`);
    };

    if (btnSubmit) {
      btnSubmit.addEventListener('click', handleCreateCategorySubmit);
    }

    if (inputCat) {
      inputCat.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCreateCategorySubmit();
        }
      });
    }
  }

  function initPagesEvents() {
    initAddPageModalEvents();

    const btnNewPageHeader = document.getElementById('btn-pages-new-page');
    if (btnNewPageHeader && !btnNewPageHeader.dataset.choiceBound) {
      btnNewPageHeader.dataset.choiceBound = 'true';
      btnNewPageHeader.addEventListener('click', (e) => {
        e.preventDefault();
        openAddPageModal();
      });
    }

    const pagesSearchInput = document.getElementById('pages-search-input');
    if (pagesSearchInput) {
      pagesSearchInput.addEventListener('input', () => {
        renderStaticPages();
      });
    }

    // Sort / Filter Select (Alphabetical, Category Type, Custom)
    const sortSelect = document.getElementById('pages-sort-filter-select');
    if (sortSelect && !sortSelect.dataset.listenerBound) {
      sortSelect.dataset.listenerBound = 'true';
      sortSelect.value = getPagesSortMode();
      sortSelect.addEventListener('change', () => {
        if (isPagesEditMode) {
          captureEditModeInputs();
        }
        const chosenMode = sortSelect.value;
        if (chosenMode === 'custom') {
          if (!window.projectConfig) window.projectConfig = {};
          if (!Array.isArray(window.projectConfig.pagesCustomOrder) || window.projectConfig.pagesCustomOrder.length === 0) {
            const currentDomCards = Array.from(document.querySelectorAll('#pages-cards-all .page-card'));
            window.projectConfig.pagesCustomOrder = currentDomCards.map(c => c.getAttribute('data-page-id')).filter(Boolean);
          }
        }
        setPagesSortMode(chosenMode);
        renderStaticPages();
        if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
        const modeLabels = {
          'alphabetical': 'Alphabetical',
          'type': 'Category Type',
          'custom': 'Custom'
        };
        if (typeof window.showToast === 'function') {
          window.showToast(`Sorted by ${modeLabels[chosenMode] || chosenMode}`);
        }
      });
    }

    // Auto Category Pages switch toggle (supports header and categories panel toggles)
    const modal = document.getElementById('modal-confirm-disable-cat-pages');
    const btnCancel = document.getElementById('btn-cancel-disable-cat-pages');
    const btnClose = document.getElementById('btn-close-disable-cat-pages');
    const btnConfirmKeep = document.getElementById('btn-confirm-keep-cat-pages');
    const btnConfirmRemove = document.getElementById('btn-confirm-remove-cat-pages');
    const btnConfirmLegacy = document.getElementById('btn-confirm-disable-cat-pages');

    const openDisableModal = () => {
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
      }
    };

    const closeDisableModal = () => {
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
      }
    };

    syncAutoCategoryToggles();

    const autoCatToggles = document.querySelectorAll('#toggle-auto-category-pages, #toggle-auto-category-pages-panel, [data-auto-cat-toggle]');
    autoCatToggles.forEach(t => {
      if (t.dataset.listenerBound === 'true') return;
      t.dataset.listenerBound = 'true';
      t.addEventListener('change', () => {
        if (!t.checked) {
          // User is trying to turn OFF: keep checked visually and show confirmation modal
          syncAutoCategoryToggles(true);
          openDisableModal();
        } else {
          // User turned ON (rechecked): "still make a new page from the category. if there happens to be an existing page with the exact same name as the category, simply don't make the auto-generated page."
          if (!window.projectConfig) window.projectConfig = {};
          window.projectConfig.autoCategoryPages = true;
          if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
          syncCategoryPages();
          renderStaticPages();
          syncAutoCategoryToggles(true);
          if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
          if (typeof window.showToast === 'function') showToast('Auto category pages turned on');
        }
      });
    });

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        closeDisableModal();
        syncAutoCategoryToggles(true);
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        closeDisableModal();
        syncAutoCategoryToggles(true);
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeDisableModal();
          syncAutoCategoryToggles(true);
        }
      });
    }

    // Yes, leave existing pages: "yes, don't remove anything."
    if (btnConfirmKeep) {
      btnConfirmKeep.addEventListener('click', () => {
        closeDisableModal();
        syncAutoCategoryToggles(false);
        if (!window.projectConfig) window.projectConfig = {};
        window.projectConfig.autoCategoryPages = false;
        if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();

        renderStaticPages();
        if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
        if (typeof window.showToast === 'function') showToast('Auto category pages turned off (pages kept)');
      });
    }

    // No, remove pages: "no, simply remove the pages that have the exact same name as the current categories."
    if (btnConfirmRemove) {
      btnConfirmRemove.addEventListener('click', () => {
        closeDisableModal();
        syncAutoCategoryToggles(false);
        if (!window.projectConfig) window.projectConfig = {};
        window.projectConfig.autoCategoryPages = false;
        if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();

        const currentCats = (window.projectConfig?.categories || []).map(c => String(c).trim().toLowerCase()).filter(Boolean);
        if (Array.isArray(window.drafts)) {
          window.drafts = window.drafts.filter(d => {
            if (d.type !== 'page') return true;
            const titleLower = (d.title || '').trim().toLowerCase();
            return !currentCats.includes(titleLower);
          });
          if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
        }

        renderStaticPages();
        if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
        if (typeof window.showToast === 'function') showToast('Auto category pages turned off (matching pages removed)');
      });
    }

    if (btnConfirmLegacy) {
      btnConfirmLegacy.addEventListener('click', () => {
        if (btnConfirmRemove) {
          btnConfirmRemove.click();
        }
      });
    }

    applyPagesViewModes();
    initPagesEditModeListeners();
  }

  window.getPagesViewMode = getPagesViewMode;
  window.setPagesViewMode = setPagesViewMode;
  window.getPagesSortMode = getPagesSortMode;
  window.setPagesSortMode = setPagesSortMode;
  window.handleUniversalPageDrop = handleUniversalPageDrop;
  window.applyPagesViewModes = applyPagesViewModes;
  window.syncAutoCategoryToggles = syncAutoCategoryToggles;
  window.syncCategoryPages = syncCategoryPages;
  window.renderStaticPages = renderStaticPages;
  window.initPagesEvents = initPagesEvents;
  window.isCategoryPageItem = isCategoryPageItem;
  window.isBuiltInPage = isBuiltInPage;
  window.openAddPageModal = openAddPageModal;
  window.closeAddPageModal = closeAddPageModal;
  window.initAddPageModalEvents = initAddPageModalEvents;

  Object.assign(window.Cedar.dashboard, {
    getPagesViewMode,
    setPagesViewMode,
    getPagesSortMode,
    setPagesSortMode,
    handleUniversalPageDrop,
    applyPagesViewModes,
    syncAutoCategoryToggles,
    syncCategoryPages,
    renderStaticPages,
    initPagesEvents,
    isCategoryPageItem,
    isBuiltInPage,
    openAddPageModal,
    closeAddPageModal,
    initAddPageModalEvents
  });
})();
