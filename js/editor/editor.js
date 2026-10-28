/**
 * Cedar - Editor Coordinator Engine
 * Module: js/editor/editor.js
 * 
 * Responsibilities:
 * - Coordinates state synchronization between Drafts, Canvas DOM, and Settings Form
 * - Live stats compilation (word count, character count, estimated read-time)
 * - Navigation footer & cover image preview rendering
 * - Mode switching (Live Rich Canvas ⇄ Markdown Source View)
 * - Post metadata input bindings & title/slug synchronization
 * - Publishing flow trigger and new post/page creation
 * - Unified export of the entire modular editor subsystem
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  window.activeMode = window.activeMode || 'canvas';
  let activeMode = window.activeMode;

  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  const cleanProseHtmlForStorage = function(html) {
    if (typeof window.cleanProseHtmlForStorage === 'function') {
      return window.cleanProseHtmlForStorage(html);
    }
    if (!html) return '';
    try {
      if (typeof DOMParser !== 'undefined') {
        const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
        const body = doc.body;
        body.querySelectorAll('.page-recent-posts-block, .page-individual-post-block').forEach(pb => {
          pb.innerHTML = '';
          pb.removeAttribute('data-editing-url');
        });
        const toRemove = [
          '#canvas-drop-indicator',
          '.canvas-drop-indicator',
          '.image-side-add-btn',
          '.image-add-caption-btn',
          '.gallery-item-controls',
          '.figure-hover-actions',
          '.block-hover-actions',
          '.image-hover-pill-bar',
          '.gallery-slot-placeholder',
          '.btn-slot-choose-media',
          '.btn-add-multi-image',
          '.btn-combine-adjacent-images',
          '.btn-cancel-placeholder',
          '.figure-action-btn',
          '.gallery-item-btn',
          '.gallery-item-delete-btn'
        ];
        toRemove.forEach(sel => body.querySelectorAll(sel).forEach(el => el.remove()));
        body.querySelectorAll('.selected, .selected-item, .drop-merge-target, .block-is-dragging, .item-is-dragging, .dragover-slot, .dragover').forEach(el => {
          el.classList.remove('selected', 'selected-item', 'drop-merge-target', 'block-is-dragging', 'item-is-dragging', 'dragover-slot', 'dragover');
        });
        body.querySelectorAll('figcaption, .gallery-caption').forEach(fc => {
          const text = (fc.textContent || '').trim();
          if (!text || text === 'Add caption here...' || text === 'Add image caption here...') {
            fc.remove();
          }
        });
        return body.innerHTML.trim();
      }
    } catch (e) {}
    html = html.replace(/<div\s+id=["']canvas-drop-indicator["'][^>]*>[\s\S]*?<\/div>/gi, '');
    html = html.replace(/\b(selected|selected-item|drop-merge-target|block-is-dragging|item-is-dragging|dragover-slot)\b/gi, '');
    return html.trim();
  };

  // =========================================================================
  // CATEGORY SELECTION & METADATA
  // =========================================================================

  function updateWorkspaceUrlPrefix() {
    const slugPrefixEl = document.getElementById('workspace-url-prefix') || document.querySelector('.input-with-prefix .input-prefix');
    if (!slugPrefixEl) return;
    const curDraft = window.currentDraft;
    if (!curDraft) {
      slugPrefixEl.textContent = '/uncategorized/';
      return;
    }
    if (curDraft.type === 'page') {
      slugPrefixEl.textContent = '/';
      return;
    }
    const rawCat = (curDraft.permalinkCat !== undefined && curDraft.permalinkCat !== null && String(curDraft.permalinkCat).trim() !== '')
      ? String(curDraft.permalinkCat).trim()
      : ((curDraft.tag || (Array.isArray(curDraft.categories) && curDraft.categories[0]) || '').trim());
    const normCat = (!rawCat || rawCat.toLowerCase() === 'uncategorized' || rawCat.toLowerCase() === 'posts')
      ? 'uncategorized'
      : rawCat;
    const catSlug = encodeURIComponent(normCat.toLowerCase().replace(/\s+/g, '-'));
    slugPrefixEl.textContent = `/${catSlug}/`;
  }
  window.updateWorkspaceUrlPrefix = updateWorkspaceUrlPrefix;

  function updateCategorySelectUI() {
    const select = document.getElementById('meta-tag');
    if (!select) return;

    const projConfig = window.projectConfig;
    const curDraft = window.currentDraft;

    if (projConfig && !Array.isArray(projConfig.categories)) {
      projConfig.categories = [];
    }

    const createdCategories = (projConfig && Array.isArray(projConfig.categories))
      ? projConfig.categories.filter(c => c && c.trim().toLowerCase() !== 'uncategorized' && c.trim().toLowerCase() !== 'posts')
      : [];

    let currentTag = (curDraft && curDraft.tag && typeof curDraft.tag === 'string') ? curDraft.tag.trim() : '';
    if (!currentTag && curDraft && Array.isArray(curDraft.categories) && curDraft.categories.length > 0) {
      const firstCat = String(curDraft.categories[0] || '').trim();
      if (firstCat && firstCat.toLowerCase() !== 'uncategorized' && firstCat.toLowerCase() !== 'posts') {
        currentTag = firstCat;
      }
    }
    if (currentTag.toLowerCase() === 'uncategorized' || currentTag.toLowerCase() === 'posts') {
      currentTag = '';
    }

    // Case-insensitive match against createdCategories (single source of truth)
    let matchedCategory = currentTag
      ? (createdCategories.find(c => c.toLowerCase() === currentTag.toLowerCase()) || null)
      : null;

    // Reconcile curDraft category and tag fields strictly against createdCategories
    if (curDraft) {
      if (matchedCategory) {
        curDraft.tag = matchedCategory;
        if (!Array.isArray(curDraft.categories) || curDraft.categories.length === 0) {
          curDraft.categories = [matchedCategory];
        } else if (!curDraft.categories.some(c => c.toLowerCase() === matchedCategory.toLowerCase())) {
          curDraft.categories.unshift(matchedCategory);
        }
      } else {
        curDraft.tag = '';
        curDraft.categories = [];
      }
    }

    select.innerHTML = '';

    // If the post has no category selected yet, leave a blank space
    if (!matchedCategory) {
      const blankOpt = document.createElement('option');
      blankOpt.value = '';
      blankOpt.textContent = '';
      blankOpt.selected = true;
      select.appendChild(blankOpt);
    }

    // Only show created categories
    createdCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (matchedCategory && cat.toLowerCase() === matchedCategory.toLowerCase()) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    const pTag = document.getElementById('preview-category-tag');
    if (pTag) {
      pTag.textContent = matchedCategory || 'Uncategorized';
    }

    select.onchange = () => {
      const chosen = select.value.trim();
      const curDraft = window.currentDraft;
      const prevTag = (curDraft && curDraft.tag) ? curDraft.tag : '';
      const nextTag = (chosen && chosen.toLowerCase() !== 'uncategorized' && chosen.toLowerCase() !== 'posts') ? chosen : '';
      let nextCategories = nextTag ? [nextTag] : [];
      if (curDraft && Array.isArray(curDraft.categories) && curDraft.categories.length > 1 && nextTag) {
        nextCategories = [nextTag, ...curDraft.categories.filter(c => c && c.toLowerCase() !== nextTag.toLowerCase() && c.toLowerCase() !== prevTag.toLowerCase())];
      } else if (!nextTag) {
        nextCategories = [];
      }

      const applySelect = (keepUrl = false) => {
        if (curDraft) {
          curDraft.tag = nextTag;
          curDraft.categories = nextCategories;
          if (!keepUrl) {
            curDraft.permalinkCat = nextTag || 'uncategorized';
          }
          curDraft._categoryPromptAnswered = true;
        }

        if (chosen) {
          const blankOpt = select.querySelector('option[value=""]');
          if (blankOpt) blankOpt.remove();
        }

        const pTag = document.getElementById('preview-category-tag');
        if (pTag) {
          pTag.textContent = (curDraft && curDraft.tag) ? curDraft.tag : 'Uncategorized';
        }

        updateWorkspaceUrlPrefix();
        if (typeof window.updateCategorySelectedTriggerText === 'function') {
          window.updateCategorySelectedTriggerText();
        }
        if (typeof window.renderSetupCategoryChips === 'function') {
          window.renderSetupCategoryChips();
        }
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      };

      if (typeof window.promptCategoryChangeWarning === 'function') {
        const warned = window.promptCategoryChangeWarning({
          draft: curDraft,
          newCategories: nextCategories,
          newTag: nextTag,
          onProceed: () => applySelect(false),
          onCancel: () => {
            select.value = prevTag || '';
          }
        });
        if (warned) return;
      }

      applySelect(false);
    };
  }

  // =========================================================================
  // DRAFT ⇄ FORM SYNCHRONIZATION
  // =========================================================================

  function syncDraftToForm() {
    const curDraft = window.currentDraft;
    const formatDate = (d) => (typeof window.formatDateDisplay === 'function') ? window.formatDateDisplay(d) : (d || '');
    const defaultAuthName = (typeof window.resolveProjectDefaultAuthor === 'function')
      ? window.resolveProjectDefaultAuthor()
      : ((window.projectConfig && window.projectConfig.defaultAuthor) || '');
    const defaultAuthInit = (defaultAuthName.charAt(0) || '').toUpperCase();

    if (!curDraft) {
      setVal('meta-title', '');
      setVal('meta-subtitle', '');
      setVal('meta-slug', '');
      setVal('meta-date', '');
      updateCategorySelectUI();
      setVal('meta-author-name', defaultAuthName);
      setVal('meta-author-initial', defaultAuthInit);
      setVal('meta-cover-image', '');
      setVal('nav-prev-title', '');
      setVal('nav-prev-slug', '');
      setVal('nav-next-title', '');
      setVal('nav-next-slug', '');
      setVal('meta-override-readtime', '');
      setVal('meta-custom-desc', '');
      setVal('markdown-input', '');

      const canvasTitle = document.getElementById('rich-canvas-title');
      const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
      if (canvasTitle) {
        canvasTitle.textContent = '';
        canvasTitle.dataset.loadedDraftId = '';
      }
      if (canvasSubtitle) {
        canvasSubtitle.textContent = '';
        canvasSubtitle.dataset.loadedDraftId = '';
      }
      const tagBadge = document.getElementById('preview-category-tag');
      if (tagBadge) tagBadge.textContent = 'Uncategorized';
      const authorName = document.getElementById('preview-author-name');
      if (authorName) authorName.textContent = defaultAuthName;
      const authorAvatar = document.getElementById('preview-author-avatar');
      if (authorAvatar) authorAvatar.textContent = defaultAuthInit;
      const dateEl = document.getElementById('preview-date');
      if (dateEl) {
        dateEl.textContent = '';
        dateEl.setAttribute('datetime', '');
      }
      const canvasProse = document.getElementById('rich-canvas-prose');
      if (canvasProse) {
        canvasProse.innerHTML = '';
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      }

      updateNavFooterPreview();
      updateCoverPreview();
      updateStats();
      updateDraftsCount();
      updateImagesCount();
      updateEditorHeader();
      return;
    }

    // Post Settings Form
    const localToday = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
    if (curDraft.status === 'published') {
      curDraft.everPublished = true;
      if (!curDraft.publishedSlug && curDraft.slug) {
        curDraft.publishedSlug = curDraft.slug;
      }
    } else {
      curDraft.publishedDate = null;
      curDraft.publishedAt = null;
      curDraft.editedDate = null;
      curDraft.editedAt = null;
      curDraft.hasUnpublishedEdits = false;
      if (!curDraft.publishDateUserSet) {
        curDraft.date = localToday;
      }
    }
    const defaultSlugPlaceholder = curDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
    const shouldAutoSync = (typeof window.shouldAutoSyncSlugFromTitle === 'function')
      ? window.shouldAutoSyncSlugFromTitle(curDraft)
      : (!curDraft.everPublished && curDraft.status !== 'published' && !curDraft.slugManuallyEdited);
    if (shouldAutoSync && curDraft.title && curDraft.title.trim() && typeof window.generateSlug === 'function') {
      curDraft.slug = window.generateSlug(curDraft.title.trim(), defaultSlugPlaceholder, 30);
    }
    setVal('meta-title', curDraft.title);
    setVal('meta-subtitle', curDraft.subtitle);
    setVal('meta-slug', curDraft.slug);
    updateWorkspaceUrlPrefix();
    setVal('meta-date', curDraft.date);
    updateCategorySelectUI();
    setVal('meta-author-name', curDraft.authorName || defaultAuthName);
    setVal('meta-author-initial', curDraft.authorInitial || defaultAuthInit);
    setVal('meta-cover-image', curDraft.coverImage);
    setVal('nav-prev-title', curDraft.navPrevTitle);
    setVal('nav-prev-slug', curDraft.navPrevSlug);
    setVal('nav-next-title', curDraft.navNextTitle);
    setVal('nav-next-slug', curDraft.navNextSlug);
    setVal('meta-override-readtime', curDraft.overrideReadTime);
    setVal('meta-custom-desc', curDraft.customDesc);
    setVal('markdown-input', curDraft.markdown);

    // Rich Canvas Live Header
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    if (canvasTitle) {
      canvasTitle.dataset.loadedDraftId = curDraft.id || '';
      canvasTitle.textContent = curDraft.title || '';
    }
    if (canvasSubtitle) {
      canvasSubtitle.dataset.loadedDraftId = curDraft.id || '';
      canvasSubtitle.textContent = curDraft.subtitle || '';
    }
    updateCanvasHeaderVisibility(curDraft);
    const tagBadge = document.getElementById('preview-category-tag');
    if (tagBadge) tagBadge.textContent = curDraft.tag || 'Uncategorized';
    const authorName = document.getElementById('preview-author-name');
    if (authorName) authorName.textContent = curDraft.authorName || defaultAuthName;
    const authorAvatar = document.getElementById('preview-author-avatar');
    if (authorAvatar) authorAvatar.textContent = (curDraft.authorInitial || defaultAuthInit).toUpperCase();
    const dateEl = document.getElementById('preview-date');
    if (dateEl) {
      const pubDate = curDraft.publishedDate || curDraft.date;
      if (curDraft.status === 'published' && curDraft.editedDate && curDraft.editedDate !== pubDate) {
        dateEl.innerHTML = `${formatDate(pubDate)} &bull; Edited ${formatDate(curDraft.editedDate)}`;
      } else {
        dateEl.textContent = formatDate(pubDate);
      }
      dateEl.setAttribute('datetime', pubDate || '');
    }

    // Rich Canvas Prose HTML
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (canvasProse) {
      if (curDraft.proseHtml) {
        canvasProse.innerHTML = cleanProseHtmlForStorage(curDraft.proseHtml);
      } else {
        canvasProse.innerHTML = (typeof window.parseMarkdownToHtml === 'function')
          ? window.parseMarkdownToHtml(curDraft.markdown || '')
          : (curDraft.markdown || '');
      }
      canvasProse.querySelectorAll('#canvas-drop-indicator').forEach(el => el.remove());
      if (typeof window.normalizeCustomColorNodes === 'function') window.normalizeCustomColorNodes(canvasProse);
      if (typeof window.normalizeRawImages === 'function') window.normalizeRawImages(canvasProse);
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      if (typeof window.ensureImageCaptionElements === 'function') window.ensureImageCaptionElements(canvasProse);
      if (typeof window.hydrateCanvasImages === 'function') window.hydrateCanvasImages(canvasProse, curDraft);
      if (typeof window.hydratePageBlocks === 'function') window.hydratePageBlocks(canvasProse, curDraft, { isEditor: true, initialPage: 1 });
    }

    // Prev / Next Navigation Footer
    updateNavFooterPreview();
    updateCoverPreview();
    updateStats();
    updateDraftsCount();
    updateImagesCount();
    updateEditorHeader();
    if (typeof window.initHistory === 'function') window.initHistory();
  }

  function syncFormToDraft() {
    const inEditor = window.currentView === 'editor' || (window.location && window.location.hash && window.location.hash.startsWith('#write'));
    if (!inEditor) return;

    const curDraft = window.currentDraft;
    if (!curDraft) return;
    const defaultAuthName = (typeof window.resolveProjectDefaultAuthor === 'function')
      ? window.resolveProjectDefaultAuthor()
      : ((window.projectConfig && window.projectConfig.defaultAuthor) || '');
    const defaultAuthInit = (defaultAuthName.charAt(0) || '').toUpperCase();

    // 1. Title Sync: prioritize active living canvas title or post settings modal
    const canvasTitle = document.getElementById('rich-canvas-title');
    const setupTitle = document.getElementById('setup-post-title');
    const exportModal = document.getElementById('modal-export');
    const isExportOpen = exportModal && (exportModal.style.display === 'flex' || exportModal.classList.contains('open'));

    // Guard: Only scrape living canvas if canvas is bound to this curDraft!
    const isCanvasTitleBound = canvasTitle && (!canvasTitle.dataset.loadedDraftId || canvasTitle.dataset.loadedDraftId === curDraft.id);

    const prevDraftTitle = curDraft.title || '';
    if (isExportOpen && setupTitle && setupTitle.value !== undefined) {
      curDraft.title = setupTitle.value.trim();
      if (canvasTitle && isCanvasTitleBound) canvasTitle.textContent = curDraft.title;
    } else if (isCanvasTitleBound && canvasTitle && canvasTitle.textContent.trim()) {
      curDraft.title = (canvasTitle.textContent || '').trim();
      if (setupTitle) setupTitle.value = curDraft.title;
    } else if (curDraft.title) {
      if (setupTitle) setupTitle.value = curDraft.title;
      if (canvasTitle && isCanvasTitleBound) canvasTitle.textContent = curDraft.title;
    } else if (setupTitle && isExportOpen) {
      curDraft.title = (setupTitle.value || '').trim();
    } else {
      curDraft.title = getVal('meta-title') || curDraft.title || '';
    }
    const reservedSyncNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
    const isBuiltInCurPage = Boolean(curDraft.id === 'page_about' || curDraft.id === 'page_rss' || curDraft.id === 'page_links' || curDraft.id === 'page_all' || curDraft.id === 'page_about_cedar');
    if (curDraft.type === 'page' && !isBuiltInCurPage && reservedSyncNames.has((curDraft.title || '').trim().toLowerCase())) {
      if (typeof window.showToast === 'function') {
        window.showToast("Woah! That's a reserved name - pick something else.");
      }
      curDraft.title = reservedSyncNames.has(prevDraftTitle.trim().toLowerCase()) ? '' : prevDraftTitle;
      if (canvasTitle && isCanvasTitleBound) canvasTitle.textContent = curDraft.title;
      if (setupTitle) setupTitle.value = curDraft.title;
    }
    const metaTitle = document.getElementById('meta-title');
    if (metaTitle) metaTitle.value = curDraft.title;

    if (typeof window.updateCedarTitle === 'function') {
      window.updateCedarTitle();
    } else if (typeof window.updateOutpostTitle === 'function') {
      window.updateOutpostTitle();
    }

    // 2. Subtitle Sync: prioritize active living canvas subtitle or post settings modal
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const setupSubtitle = document.getElementById('setup-post-subtitle');
    const isCanvasSubBound = canvasSubtitle && (!canvasSubtitle.dataset.loadedDraftId || canvasSubtitle.dataset.loadedDraftId === curDraft.id);

    if (isExportOpen && setupSubtitle && setupSubtitle.value !== undefined) {
      curDraft.subtitle = setupSubtitle.value.trim();
      if (canvasSubtitle && isCanvasSubBound) canvasSubtitle.textContent = curDraft.subtitle;
    } else if (isCanvasSubBound && canvasSubtitle && canvasSubtitle.textContent.trim()) {
      curDraft.subtitle = (canvasSubtitle.textContent || '').trim();
      if (setupSubtitle) setupSubtitle.value = curDraft.subtitle;
    } else if (curDraft.subtitle) {
      if (setupSubtitle) setupSubtitle.value = curDraft.subtitle;
      if (canvasSubtitle && isCanvasSubBound) canvasSubtitle.textContent = curDraft.subtitle;
    } else if (setupSubtitle && isExportOpen) {
      curDraft.subtitle = (setupSubtitle.value || '').trim();
    } else {
      curDraft.subtitle = getVal('meta-subtitle') || curDraft.subtitle || '';
    }
    const metaSubtitle = document.getElementById('meta-subtitle');
    if (metaSubtitle) metaSubtitle.value = curDraft.subtitle;

    // 3. Slug & Date
    const setupSlug = document.getElementById('setup-post-slug');
    const metaSlug = document.getElementById('meta-slug');
    const defaultSlugPlaceholder = (curDraft.type === 'page' ? 'untitled-page' : 'untitled-post');
    const shouldAutoSync = (typeof window.shouldAutoSyncSlugFromTitle === 'function')
      ? window.shouldAutoSyncSlugFromTitle(curDraft)
      : (!curDraft.everPublished && curDraft.status !== 'published' && !curDraft.slugManuallyEdited);
    const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
      ? window.hasDraftBeenPublished(curDraft)
      : Boolean(curDraft.status === 'published' || curDraft.everPublished || curDraft.publishedAt || curDraft.publishedDate || curDraft.publishedSlug);
    let curSlug = (curDraft.slug || getVal('meta-slug') || '').trim();
    if (shouldAutoSync || !curSlug || curSlug === 'untitled-page' || curSlug === 'untitled-post' || curSlug === 'untitled-article') {
      if (curDraft.title && curDraft.title.trim() && typeof window.generateSlug === 'function') {
        const gen = window.generateSlug(curDraft.title.trim(), defaultSlugPlaceholder, 30);
        if (gen && gen !== 'untitled-page' && gen !== 'untitled-post') {
          curSlug = gen;
        }
      }
    }
    const slugVal = (!wasEverPublished && !shouldAutoSync && isExportOpen && setupSlug && setupSlug.value.trim() && setupSlug.value.trim() !== 'untitled-page' && setupSlug.value.trim() !== 'untitled-post')
      ? setupSlug.value.trim()
      : (curSlug || defaultSlugPlaceholder);
    curDraft.slug = slugVal;
    if (setupSlug && !isExportOpen) setupSlug.value = curDraft.slug;
    if (metaSlug) metaSlug.value = curDraft.slug;

    const setupDate = document.getElementById('setup-post-date');
    const dateVal = (isExportOpen && setupDate && setupDate.value)
      ? setupDate.value
      : (curDraft.date || getVal('meta-date'));
    curDraft.date = dateVal || curDraft.date;

    // Categories are managed via Post Settings (#setup-category-chips).
    // Never let the collapsed #meta-tag select wipe curDraft.categories or curDraft.tag.
    if (!Array.isArray(curDraft.categories)) {
      curDraft.categories = [];
    }
    curDraft.categories = curDraft.categories
      .map(c => typeof c === 'string' ? c.trim() : '')
      .filter(c => c && c.toLowerCase() !== 'uncategorized' && c.toLowerCase() !== 'posts');

    const rawTag = (typeof curDraft.tag === 'string') ? curDraft.tag.trim() : '';
    const normTag = (rawTag.toLowerCase() === 'uncategorized' || rawTag.toLowerCase() === 'posts') ? '' : rawTag;
    if (normTag) {
      curDraft.tag = normTag;
      if (!curDraft.categories.some(c => c.toLowerCase() === normTag.toLowerCase())) {
        curDraft.categories.unshift(normTag);
      }
    } else if (curDraft.categories.length > 0) {
      curDraft.tag = curDraft.categories[0];
    } else {
      curDraft.tag = '';
    }

    const selectTag = document.getElementById('meta-tag');
    if (selectTag) {
      selectTag.value = curDraft.tag || '';
    }
    curDraft.authorName = getVal('meta-author-name') || defaultAuthName;
    curDraft.authorInitial = getVal('meta-author-initial') || defaultAuthInit;

    const exportModalEl = document.getElementById('modal-export');
    if (exportModalEl && exportModalEl.style.display === 'flex') {
      const metaCoverEl = document.getElementById('meta-cover-image');
      if (metaCoverEl) metaCoverEl.value = curDraft.coverImage || '';
    } else {
      curDraft.coverImage = getVal('meta-cover-image');
    }
    curDraft.navPrevTitle = getVal('nav-prev-title');
    curDraft.navPrevSlug = getVal('nav-prev-slug');
    curDraft.navNextTitle = getVal('nav-next-title');
    curDraft.navNextSlug = getVal('nav-next-slug');
    curDraft.overrideReadTime = getVal('meta-override-readtime');
    curDraft.customDesc = getVal('meta-custom-desc');

    const canvasProse = document.getElementById('rich-canvas-prose');
    const mdInput = document.getElementById('markdown-input');
    const currentMode = window.activeMode || activeMode || 'canvas';

    if (currentMode === 'canvas') {
      if (canvasProse) {
        if (window.mergeAdjacentLists) {
          window.mergeAdjacentLists(canvasProse);
        }
        if (typeof window.normalizeCustomColorNodes === 'function') {
          window.normalizeCustomColorNodes(canvasProse);
        }
        curDraft.proseHtml = cleanProseHtmlForStorage(canvasProse.innerHTML);
        curDraft.markdown = (typeof window.domToMarkdown === 'function') ? window.domToMarkdown(canvasProse) : (curDraft.markdown || '');
        setVal('markdown-input', curDraft.markdown);
        if (typeof window.reconcileDraftImages === 'function') {
          window.reconcileDraftImages(curDraft, canvasProse);
        }
      }
    } else {
      if (mdInput) {
        curDraft.markdown = mdInput.value;
        curDraft.proseHtml = (typeof window.parseMarkdownToHtml === 'function') ? window.parseMarkdownToHtml(mdInput.value) : mdInput.value;
        if (typeof window.reconcileDraftImages === 'function') {
          window.reconcileDraftImages(curDraft);
        }
      }
    }
    updateImagesCount();
    curDraft.updatedAt = Date.now();
  }

  function clearEditorCanvasDOM() {
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const canvasProse = document.getElementById('rich-canvas-prose');
    const metaTitle = document.getElementById('meta-title');
    const metaSubtitle = document.getElementById('meta-subtitle');
    const metaSlug = document.getElementById('meta-slug');
    const mdInput = document.getElementById('markdown-input');
    const setupTitle = document.getElementById('setup-post-title');
    const setupSubtitle = document.getElementById('setup-post-subtitle');
    const setupSlug = document.getElementById('setup-post-slug');

    if (canvasTitle) {
      canvasTitle.textContent = '';
      canvasTitle.dataset.loadedDraftId = '';
    }
    if (canvasSubtitle) {
      canvasSubtitle.textContent = '';
      canvasSubtitle.dataset.loadedDraftId = '';
    }
    if (canvasProse) canvasProse.innerHTML = '';
    if (metaTitle) metaTitle.value = '';
    if (metaSubtitle) metaSubtitle.value = '';
    if (metaSlug) metaSlug.value = '';
    if (mdInput) mdInput.value = '';
    if (setupTitle) setupTitle.value = '';
    if (setupSubtitle) setupSubtitle.value = '';
    if (setupSlug) setupSlug.value = '';
  }
  window.clearEditorCanvasDOM = clearEditorCanvasDOM;

  // =========================================================================
  // PREVIEWS & STATS
  // =========================================================================

  function updateNavFooterPreview() {
    const curDraft = window.currentDraft;
    const prevCard = document.getElementById('preview-nav-prev');
    const prevTitle = document.getElementById('preview-nav-prev-title');
    const nextCard = document.getElementById('preview-nav-next');
    const nextTitle = document.getElementById('preview-nav-next-title');

    if (prevCard && prevTitle) {
      if (curDraft && curDraft.navPrevTitle && curDraft.navPrevSlug) {
        prevCard.style.display = 'flex';
        prevTitle.textContent = curDraft.navPrevTitle;
      } else {
        prevCard.style.display = 'none';
      }
    }

    if (nextCard && nextTitle) {
      if (curDraft && curDraft.navNextTitle && curDraft.navNextSlug) {
        nextCard.style.display = 'flex';
        nextTitle.textContent = curDraft.navNextTitle;
      } else {
        nextCard.style.display = 'none';
      }
    }
  }

  function updateCoverPreview() {
    const metaCover = document.getElementById('meta-cover-image');
    const wrap = document.getElementById('cover-preview-container');
    const img = document.getElementById('cover-preview-img');
    if (!metaCover || !wrap || !img) return;

    const url = metaCover.value.trim();
    if (url) {
      let displayUrl = url;
      if (typeof window.resolvePostImage === 'function') {
        const resolved = window.resolvePostImage(url, window.currentDraft);
        if (resolved) displayUrl = resolved;
      } else if (window.imageRegistry && window.imageRegistry.has(url)) {
        displayUrl = window.imageRegistry.get(url).dataUrl;
      }
      img.src = displayUrl;
      wrap.style.display = 'block';

      const isAlreadyResolved = displayUrl && (displayUrl.startsWith('data:') || displayUrl.startsWith('blob:') || /^https?:\/\//i.test(displayUrl));
      const cleanName = String(url).split('?')[0].split('#')[0].split('/').pop().split('\\').pop();
      if (!isAlreadyResolved && cleanName && cleanName !== 'img' && typeof window.resolveMediaBlob === 'function') {
        window.resolveMediaBlob(cleanName, null).then(res => {
          if (res && (res.objectUrl || res.dataUrl)) {
            img.src = res.dataUrl || res.objectUrl;
          }
        }).catch(() => {});
      }
    } else {
      wrap.style.display = 'none';
      img.src = '';
    }
  }

  function updateStats() {
    const curDraft = window.currentDraft;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const mdInput = document.getElementById('markdown-input');

    let words = 0;
    let chars = 0;
    let readTime = '1 min read';

    if (activeMode === 'canvas' && canvasProse) {
      const stats = (typeof window.getCleanProseStats === 'function')
        ? window.getCleanProseStats(canvasProse, true)
        : { words: 0, chars: 0 };
      words = stats.words;
      chars = stats.chars;

      const titleText = (canvasTitle ? (canvasTitle.innerText || canvasTitle.textContent || '') : '').trim();
      if (titleText) {
        const titleStats = (typeof window.getCleanProseStats === 'function')
          ? window.getCleanProseStats(titleText, false)
          : { words: titleText.split(/\s+/).filter(Boolean).length, chars: titleText.length };
        words += titleStats.words;
        chars += titleStats.chars;
      }

      const subText = (canvasSubtitle ? (canvasSubtitle.innerText || canvasSubtitle.textContent || '') : '').trim();
      if (subText) {
        const subStats = (typeof window.getCleanProseStats === 'function')
          ? window.getCleanProseStats(subText, false)
          : { words: subText.split(/\s+/).filter(Boolean).length, chars: subText.length };
        words += subStats.words;
        chars += subStats.chars;
      }

      readTime = (typeof window.calculateReadTime === 'function')
        ? window.calculateReadTime(canvasProse, curDraft ? curDraft.overrideReadTime : '', true)
        : `${Math.max(1, Math.ceil(words / 200))} min read`;
    } else {
      const rawMd = mdInput ? mdInput.value : (curDraft ? curDraft.markdown || '' : '');
      const stats = (typeof window.getCleanProseStats === 'function')
        ? window.getCleanProseStats(rawMd, false)
        : { words: 0, chars: 0 };
      words = stats.words;
      chars = stats.chars;

      const titleText = (curDraft && curDraft.title ? curDraft.title : '').trim();
      if (titleText) {
        const titleStats = (typeof window.getCleanProseStats === 'function')
          ? window.getCleanProseStats(titleText, false)
          : { words: titleText.split(/\s+/).filter(Boolean).length, chars: titleText.length };
        words += titleStats.words;
        chars += titleStats.chars;
      }

      const subText = (curDraft && curDraft.subtitle ? curDraft.subtitle : '').trim();
      if (subText) {
        const subStats = (typeof window.getCleanProseStats === 'function')
          ? window.getCleanProseStats(subText, false)
          : { words: subText.split(/\s+/).filter(Boolean).length, chars: subText.length };
        words += subStats.words;
        chars += subStats.chars;
      }

      readTime = (typeof window.calculateReadTime === 'function')
        ? window.calculateReadTime(rawMd, curDraft ? curDraft.overrideReadTime : '', false)
        : `${Math.max(1, Math.ceil(words / 200))} min read`;
    }

    const wordsCanvas = document.getElementById('stat-words-canvas');
    const charsCanvas = document.getElementById('stat-chars-canvas');
    const wordsMd = document.getElementById('stat-words-md');
    const charsMd = document.getElementById('stat-chars-md');
    const headerReadTime = document.getElementById('header-read-time');
    const canvasReadTime = document.getElementById('canvas-read-time-pill');
    const previewReadTime = document.getElementById('preview-readtime');
    const exportStats = document.getElementById('export-badge-stats');

    const wordsStr = `${words.toLocaleString()} words`;
    const charsStr = `${chars.toLocaleString()} characters`;

    if (wordsCanvas) wordsCanvas.textContent = wordsStr;
    if (charsCanvas) charsCanvas.textContent = charsStr;
    if (wordsMd) wordsMd.textContent = wordsStr;
    if (charsMd) charsMd.textContent = charsStr;
    if (headerReadTime) headerReadTime.textContent = readTime;
    if (canvasReadTime) canvasReadTime.textContent = readTime;
    const isPage = window.currentDraft && window.currentDraft.type === 'page';
    if (exportStats) {
      if (isPage) {
        exportStats.style.display = 'none';
      } else {
        exportStats.style.display = '';
        exportStats.textContent = `${readTime} · ${wordsStr} · ${charsStr}`;
      }
    }
  }

  function updateDraftsCount() {
    const el = document.getElementById('drafts-count');
    const draftsList = window.drafts || [];
    if (el) el.textContent = draftsList.length;
  }

  function updateImagesCount() {
    const el = document.getElementById('images-count');
    const curDraft = window.currentDraft;
    const count = (curDraft && curDraft.images) ? curDraft.images.length : 0;
    if (el) el.textContent = count;
  }

  function autoResizeMarkdownTextarea() {
    const mdInput = document.getElementById('markdown-input');
    if (mdInput) {
      mdInput.style.height = 'auto';
      mdInput.style.height = Math.max(450, mdInput.scrollHeight) + 'px';
    }
  }

  // =========================================================================
  // MODE SWITCHER (Rich Canvas ⇄ Markdown Source)
  // =========================================================================

  function setEditorMode(mode) {
    if (window.commitCheckpoint) window.commitCheckpoint();
    activeMode = mode;
    window.activeMode = mode;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const mdInput = document.getElementById('markdown-input');
    const btnToggleMode = document.getElementById('btn-toggle-editor-mode');
    const labelToggleMode = document.getElementById('label-sidebar-mode-toggle');
    const iconCode = document.querySelector('.mode-icon-code');
    const iconPost = document.querySelector('.mode-icon-post');

    if (mode === 'markdown') {
      // 1. Serialize rich canvas to markdown
      if (canvasProse) {
        if (window.mergeAdjacentLists) {
          window.mergeAdjacentLists(canvasProse);
        }
        if (window.currentDraft) window.currentDraft.proseHtml = cleanProseHtmlForStorage(canvasProse.innerHTML);
        const compiledMd = (typeof window.domToMarkdown === 'function') ? window.domToMarkdown(canvasProse) : (window.currentDraft?.markdown || '');
        if (window.currentDraft) window.currentDraft.markdown = compiledMd;
        if (mdInput) {
          mdInput.value = compiledMd;
        }
      }

      // 2. Seamless in-canvas swap
      if (canvasProse) canvasProse.style.display = 'none';
      if (mdInput) {
        mdInput.style.display = 'block';
        autoResizeMarkdownTextarea();
        mdInput.focus();
      }

      // 3. Update Toggle to 'See Post'
      if (labelToggleMode) labelToggleMode.textContent = 'See Post';
      if (btnToggleMode) {
        btnToggleMode.classList.add('in-code-mode');
        btnToggleMode.title = 'Switch back to Rich Canvas Post View (Ctrl+M)';
      }
      if (iconCode) iconCode.style.display = 'none';
      if (iconPost) iconPost.style.display = 'inline-block';
    } else {
      // 1. Compile raw markdown back into canvas HTML
      const rawMd = mdInput ? mdInput.value : (window.currentDraft ? window.currentDraft.markdown : '');
      if (window.currentDraft) window.currentDraft.markdown = rawMd;
      if (canvasProse) {
        canvasProse.innerHTML = (typeof window.parseMarkdownToHtml === 'function') ? window.parseMarkdownToHtml(rawMd) : rawMd;
        if (window.mergeAdjacentLists) {
          window.mergeAdjacentLists(canvasProse);
        }
        if (typeof window.normalizeRawImages === 'function') window.normalizeRawImages(canvasProse);
        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        if (typeof window.ensureImageCaptionElements === 'function') window.ensureImageCaptionElements(canvasProse);
        if (typeof window.hydrateCanvasImages === 'function') window.hydrateCanvasImages(canvasProse, window.currentDraft);
        if (typeof window.hydratePageBlocks === 'function') window.hydratePageBlocks(canvasProse, window.currentDraft, { isEditor: true, initialPage: 1 });
        if (window.currentDraft) window.currentDraft.proseHtml = cleanProseHtmlForStorage(canvasProse.innerHTML);
      }

      // 2. Seamless in-canvas swap
      if (mdInput) mdInput.style.display = 'none';
      if (canvasProse) {
        canvasProse.style.display = 'block';
        canvasProse.focus();
      }

      // 3. Update Toggle to 'See Code'
      if (labelToggleMode) labelToggleMode.textContent = 'See Code';
      if (btnToggleMode) {
        btnToggleMode.classList.remove('in-code-mode');
        btnToggleMode.title = 'Switch to Markdown Code View (Ctrl+M)';
      }
      if (iconCode) iconCode.style.display = 'inline-block';
      if (iconPost) iconPost.style.display = 'none';
    }

    updateStats();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (window.commitCheckpoint) window.commitCheckpoint();
  }

  // =========================================================================
  // INPUT BINDINGS & LIVE LISTENERS
  // =========================================================================

  function setupInputBindings() {
    const inputs = [
      'meta-title', 'meta-subtitle', 'meta-slug', 'meta-date', 'meta-tag',
      'meta-author-name', 'meta-author-initial', 'meta-cover-image',
      'nav-prev-title', 'nav-prev-slug', 'nav-next-title', 'nav-next-slug',
      'meta-override-readtime', 'meta-custom-desc'
    ];

    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const onSettingsChange = () => {
          if (!window.currentDraft) return;
          window.currentDraft.settingsEdited = true;
          const notice = document.getElementById('post-settings-notice');
          if (notice) notice.style.display = 'none';
        };

        el.addEventListener('input', () => {
          onSettingsChange();
          const curDraft = window.currentDraft;
          if (!curDraft) return;
          if (id === 'meta-title') {
            const titleVal = el.value;
            const rTitle = document.getElementById('rich-canvas-title');
            if (rTitle) rTitle.textContent = titleVal;
            const isUntitled = !curDraft.slug ||
                               curDraft.slug === 'untitled-post' ||
                               curDraft.slug === 'untitled-article' ||
                               curDraft.slug === 'untitled-page';
            const shouldAutoSync = (typeof window.shouldAutoSyncSlugFromTitle === 'function')
              ? window.shouldAutoSyncSlugFromTitle(curDraft)
              : (!curDraft.everPublished && curDraft.status !== 'published' && !curDraft.slugManuallyEdited);
            if ((shouldAutoSync || isUntitled) && typeof window.generateSlug === 'function') {
              const newSlug = window.generateSlug(titleVal, (curDraft.type === 'page' ? 'untitled-page' : 'untitled-post'), 30);
              const metaSlug = document.getElementById('meta-slug');
              if (metaSlug) metaSlug.value = newSlug;
              const setupSlug = document.getElementById('setup-post-slug');
              if (setupSlug) setupSlug.value = newSlug;
              curDraft.slug = newSlug;
              if (typeof window.updateEditorUrlSlug === 'function') window.updateEditorUrlSlug(newSlug);
            }
          }
          if (id === 'meta-slug') {
            const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
              ? window.hasDraftBeenPublished(curDraft)
              : Boolean(curDraft.status === 'published' || curDraft.everPublished || curDraft.publishedAt || curDraft.publishedDate || curDraft.publishedSlug);
            if (wasEverPublished) {
              return;
            }
            const defaultPlaceholder = curDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
            const cleanSlug = el.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            const autoTitleSlug = (typeof window.generateSlug === 'function')
              ? window.generateSlug(curDraft.title || '', defaultPlaceholder, 30)
              : defaultPlaceholder;
            curDraft.slug = cleanSlug || autoTitleSlug;
            curDraft.slugManuallyEdited = Boolean(cleanSlug && cleanSlug !== autoTitleSlug);
            const setupSlug = document.getElementById('setup-post-slug');
            if (setupSlug) setupSlug.value = curDraft.slug;
            if (typeof window.updateEditorUrlSlug === 'function') window.updateEditorUrlSlug(curDraft.slug);
          }
          if (id === 'meta-subtitle') {
            const rSub = document.getElementById('rich-canvas-subtitle');
            if (rSub) rSub.textContent = el.value;
          }
          if (id === 'meta-tag') {
            const pTag = document.getElementById('preview-category-tag');
            if (pTag) pTag.textContent = el.value || 'Uncategorized';
          }
          if (id === 'meta-author-name') {
            const pAuth = document.getElementById('preview-author-name');
            const defAuth = (typeof window.resolveProjectDefaultAuthor === 'function')
              ? window.resolveProjectDefaultAuthor()
              : ((window.projectConfig && window.projectConfig.defaultAuthor) || '');
            if (pAuth) pAuth.textContent = el.value || defAuth;
          }
          if (id === 'meta-author-initial') {
            const pAv = document.getElementById('preview-author-avatar');
            const defAuth = (typeof window.resolveProjectDefaultAuthor === 'function')
              ? window.resolveProjectDefaultAuthor()
              : ((window.projectConfig && window.projectConfig.defaultAuthor) || '');
            if (pAv) pAv.textContent = (el.value || defAuth.charAt(0) || '').toUpperCase();
          }
          if (id === 'meta-date') {
            if (((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)) && typeof ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).handleDateChange === 'function') {
              ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).handleDateChange(el, window.currentDraft);
              return;
            }
            if (window.currentDraft) window.currentDraft.publishDateUserSet = true;
            const pDate = document.getElementById('preview-date');
            if (pDate && typeof window.formatDateDisplay === 'function') {
              pDate.textContent = window.formatDateDisplay(el.value);
            }
          }
          if (id === 'meta-cover-image') {
            updateCoverPreview();
          }
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        });

        if (id === 'meta-slug') {
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              el.blur();
            }
          });
          el.addEventListener('blur', async () => {
            const curDraft = window.currentDraft;
            if (!curDraft) return;
            const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
              ? window.hasDraftBeenPublished(curDraft)
              : Boolean(curDraft.status === 'published' || curDraft.everPublished || curDraft.publishedAt || curDraft.publishedDate || curDraft.publishedSlug);
            if (!wasEverPublished) return;
            const lockedSlug = curDraft.publishedSlug || curDraft.slug || '';
            const cleanSlug = el.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            if (!cleanSlug || cleanSlug === lockedSlug) {
              el.value = lockedSlug;
              return;
            }
            const confirmed = (typeof window.showConfirmDialog === 'function')
              ? await window.showConfirmDialog({
                  title: 'Are you sure?',
                  message: 'Changing this URL slug might break existing links. Are you sure you want to change it?',
                  confirmText: 'Yes',
                  cancelText: 'Cancel',
                  isDanger: true
                })
              : true;
            if (confirmed) {
              curDraft.slug = cleanSlug;
              curDraft.publishedSlug = cleanSlug;
              curDraft.slugCommitted = true;
              curDraft.slugManuallyEdited = true;
              el.value = cleanSlug;
              const setupSlug = document.getElementById('setup-post-slug');
              if (setupSlug) setupSlug.value = cleanSlug;
              if (typeof window.updateEditorUrlSlug === 'function') window.updateEditorUrlSlug(cleanSlug);
              if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
            } else {
              el.value = lockedSlug;
              const setupSlug = document.getElementById('setup-post-slug');
              if (setupSlug) setupSlug.value = lockedSlug;
            }
          });
        }

        el.addEventListener('change', onSettingsChange);
      }
    });

    // Living Canvas Title & Subtitle Direct Typing
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const canvasProse = document.getElementById('rich-canvas-prose');

    if (canvasTitle) {
      const reservedPageNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
      const isBuiltInPageDraft = (d) => Boolean(d && (d.id === 'page_about' || d.id === 'page_rss' || d.id === 'page_links' || d.id === 'page_all' || d.id === 'page_about_cedar'));

      canvasTitle.addEventListener('input', () => {
        const curDraft = window.currentDraft;
        if (!curDraft) return;
        const val = canvasTitle.textContent.trim();
        if (curDraft.type === 'page' && !isBuiltInPageDraft(curDraft) && reservedPageNames.has(val.toLowerCase())) {
          if (typeof window.showToast === 'function') {
            window.showToast("Woah! That's a reserved name - pick something else.");
          }
          return;
        }
        const metaTitle = document.getElementById('meta-title');
        if (metaTitle) metaTitle.value = val;
        curDraft.title = val;
        const titleDisplay = document.getElementById('editor-header-title');
        if (titleDisplay) {
          titleDisplay.textContent = val || (curDraft.type === 'page' ? 'Untitled Page' : 'Untitled Post');
        }

        const isUntitled = !curDraft.slug ||
                           curDraft.slug === 'untitled-post' ||
                           curDraft.slug === 'untitled-article' ||
                           curDraft.slug === 'untitled-page';
        const shouldAutoSync = (typeof window.shouldAutoSyncSlugFromTitle === 'function')
          ? window.shouldAutoSyncSlugFromTitle(curDraft)
          : (!curDraft.everPublished && curDraft.status !== 'published' && !curDraft.slugManuallyEdited);
        if ((shouldAutoSync || isUntitled) && typeof window.generateSlug === 'function') {
          const newSlug = window.generateSlug(val, (curDraft.type === 'page' ? 'untitled-page' : 'untitled-post'), 30);
          const metaSlug = document.getElementById('meta-slug');
          if (metaSlug) metaSlug.value = newSlug;
          const setupSlug = document.getElementById('setup-post-slug');
          if (setupSlug) setupSlug.value = newSlug;
          curDraft.slug = newSlug;
          if (typeof window.updateEditorUrlSlug === 'function') window.updateEditorUrlSlug(newSlug);
        }
        updateStats();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      });

      canvasTitle.addEventListener('blur', () => {
        const curDraft = window.currentDraft;
        const val = canvasTitle.textContent.trim();
        if (curDraft && curDraft.type === 'page' && !isBuiltInPageDraft(curDraft) && reservedPageNames.has(val.toLowerCase())) {
          if (typeof window.showToast === 'function') {
            window.showToast("Woah! That's a reserved name - pick something else.");
          }
          canvasTitle.textContent = curDraft.title && !reservedPageNames.has(curDraft.title.trim().toLowerCase()) ? curDraft.title : '';
        }
        if (curDraft && curDraft.type === 'page' && canvasProse) {
          const recentBlock = canvasProse.querySelector('.page-recent-posts-block');
          if (recentBlock && typeof window.hydrateSingleRecentPostsBlock === 'function') {
            window.hydrateSingleRecentPostsBlock(recentBlock, curDraft, { isEditor: true, initialPage: 1 });
          }
        }
        updateStats();
      });

      canvasTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (canvasSubtitle) {
            canvasSubtitle.focus();
          } else if (canvasProse) {
            canvasProse.focus();
          }
        }
      });

      canvasTitle.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const clean = text.replace(/[\r\n]+/g, ' ');
        document.execCommand('insertText', false, clean);
        canvasTitle.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(updateStats, 0);
      });
    }

    if (canvasSubtitle) {
      canvasSubtitle.addEventListener('input', () => {
        const curDraft = window.currentDraft;
        if (!curDraft) return;
        const val = canvasSubtitle.textContent.trim();
        const metaSubtitle = document.getElementById('meta-subtitle');
        if (metaSubtitle) metaSubtitle.value = val;
        curDraft.subtitle = val;
        updateStats();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      });

      canvasSubtitle.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const clean = text.replace(/[\r\n]+/g, ' ');
        document.execCommand('insertText', false, clean);
        canvasSubtitle.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(updateStats, 0);
      });

      canvasSubtitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (canvasProse) {
            canvasProse.focus();
          }
        } else if (e.key === 'Backspace' && canvasSubtitle.textContent.trim() === '') {
          e.preventDefault();
          if (canvasTitle) {
            canvasTitle.focus();
            const sel = window.getSelection();
            if (sel) {
              sel.selectAllChildren(canvasTitle);
              sel.collapseToEnd();
            }
          }
        }
      });
    }

    // Clear cover button
    const btnClearCover = document.getElementById('btn-clear-cover');
    if (btnClearCover) {
      btnClearCover.addEventListener('click', () => {
        const metaCover = document.getElementById('meta-cover-image');
        if (metaCover) metaCover.value = '';
        updateCoverPreview();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      });
    }

    // Rich Canvas Prose input, paste & blur
    if (canvasProse) {
      canvasProse.addEventListener('input', () => {
        updateStats();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.maintainCaretScrollBuffer === 'function') window.maintainCaretScrollBuffer();
      });

      canvasProse.addEventListener('paste', () => {
        setTimeout(updateStats, 0);
      });

      canvasProse.addEventListener('blur', () => {
        if (window.mergeAdjacentLists) {
          window.mergeAdjacentLists(canvasProse);
        }
        updateStats();
      });
    }

    // Markdown textarea input
    const mdInput = document.getElementById('markdown-input');
    if (mdInput) {
      mdInput.addEventListener('input', () => {
        updateStats();
        autoResizeMarkdownTextarea();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.maintainCaretScrollBuffer === 'function') window.maintainCaretScrollBuffer();
      });

      mdInput.addEventListener('paste', (e) => {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (clipboardData) {
          const text = (clipboardData.getData('text/plain') || '').trim();
          if (/^https?:\/\/[^\s]+$/i.test(text) || /^www\.[a-z0-9\-]+(\.[a-z0-9\-]+)+/i.test(text)) {
            const start = mdInput.selectionStart;
            const end = mdInput.selectionEnd;
            if (start !== end) {
              e.preventDefault();
              const selected = mdInput.value.substring(start, end);
              const formatted = text.startsWith('www.') ? 'https://' + text : text;
              const replacement = `[${selected}](${formatted})`;
              mdInput.setRangeText(replacement, start, end, 'select');
              updateStats();
              if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
              return;
            }
          }
        }
        setTimeout(updateStats, 0);
      });

      mdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          requestAnimationFrame(() => {
            if (typeof window.maintainCaretScrollBuffer === 'function') window.maintainCaretScrollBuffer();
          });
        }
      });
    }

    // Meta slug manual sync from title CTA
    const metaSyncSlugBtn = document.getElementById('meta-btn-sync-slug');
    if (metaSyncSlugBtn) {
      metaSyncSlugBtn.addEventListener('click', async () => {
        const curDraft = window.currentDraft;
        if (!curDraft) return;
        const title = curDraft.title || '';
        const newSlug = (typeof window.generateSlug === 'function')
          ? window.generateSlug(title, (curDraft.type === 'page' ? 'untitled-page' : 'untitled-post'), 30)
          : 'untitled-post';
        const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
          ? window.hasDraftBeenPublished(curDraft)
          : Boolean(curDraft.status === 'published' || curDraft.everPublished || curDraft.publishedAt || curDraft.publishedDate || curDraft.publishedSlug);
        if (wasEverPublished && newSlug !== (curDraft.publishedSlug || curDraft.slug)) {
          const confirmed = (typeof window.showConfirmDialog === 'function')
            ? await window.showConfirmDialog({
                title: 'Are you sure?',
                message: 'Changing this URL slug might break existing links. Are you sure you want to change it?',
                confirmText: 'Yes',
                cancelText: 'Cancel',
                isDanger: true
              })
            : true;
          if (!confirmed) return;
          curDraft.publishedSlug = newSlug;
          curDraft.slugCommitted = true;
        }
        curDraft.slugManuallyEdited = false;
        const metaSlug = document.getElementById('meta-slug');
        if (metaSlug) metaSlug.value = newSlug;
        const setupSlug = document.getElementById('setup-post-slug');
        if (setupSlug) setupSlug.value = newSlug;
        curDraft.slug = newSlug;
        updateWorkspaceUrlPrefix();
        if (typeof window.updateEditorUrlSlug === 'function') window.updateEditorUrlSlug(newSlug);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.showToast === 'function') {
          const prefixEl = document.getElementById('workspace-url-prefix');
          const prefix = prefixEl ? prefixEl.textContent : '/';
          window.showToast(`URL slug synced: ${prefix}${newSlug}/`);
        }
      });
    }

    // Delete Page CTA button in topbar
    const btnDeletePage = document.getElementById('btn-delete-page');
    if (btnDeletePage) {
      btnDeletePage.addEventListener('click', () => {
        const curDraft = window.currentDraft;
        if (!curDraft || curDraft.type !== 'page') return;
        if (typeof window.deleteItem === 'function') {
          window.deleteItem(curDraft.id);
        }
      });
    }

    // Dedicated Post/Page Settings button
    const btnPostSettings = document.getElementById('btn-open-post-settings');
    if (btnPostSettings) {
      btnPostSettings.addEventListener('click', handleOpenPostSettings);
    }

    // Preview button for static pages
    const btnEditorPreview = document.getElementById('btn-editor-preview');
    if (btnEditorPreview) {
      btnEditorPreview.addEventListener('click', (e) => {
        syncFormToDraft();
        saveDraftsToStorage();
        if (typeof window.openLocalPreviewTab === 'function') {
          window.openLocalPreviewTab(e);
        }
      });
    }


    // Publish CTA button in topbar (routes to Post Settings)
    const btnPublish = document.getElementById('btn-publish-post');
    if (btnPublish) {
      btnPublish.addEventListener('click', handleOpenPostSettings);
    }

    // Status badge pill is a purely informational indicator (non-interactive)
  }

  // =========================================================================
  // ACTIONS & CREATION DISPATCHERS
  // =========================================================================

  function isPostSettingsConfigured(draft) {
    if (!draft) return false;

    // 1. Must have a real title
    const title = (draft.title || '').trim();
    const isTitleBlankOrDefault = !title || /^untitled\s+(post|page|draft|article)$/i.test(title);
    if (isTitleBlankOrDefault) return false;

    // 2. Must have a real slug
    const slug = (draft.slug || '').trim();
    const isSlugBlankOrDefault = !slug || /^untitled-(post|page|draft|article)$/i.test(slug);
    if (isSlugBlankOrDefault) return false;

    // 3. Must be edited or non-blank in settings
    if (draft.settingsEdited) return true;

    const hasCategory = Boolean(draft.tag && draft.tag.trim());
    const hasSubtitle = Boolean(draft.subtitle && draft.subtitle.trim());
    const hasCover = Boolean(draft.coverImage && draft.coverImage.trim());
    const hasCustomDesc = Boolean(draft.customDesc && draft.customDesc.trim());

    return hasCategory || hasSubtitle || hasCover || hasCustomDesc;
  }

  function handleOpenPostSettings() {
    if (!window.currentDraft) return;

    syncFormToDraft();

    if (typeof window.openPublishDrawer === 'function') {
      window.openPublishDrawer();
    } else if (typeof window.openModal === 'function') {
      window.openModal('modal-export');
    } else {
      const btnExport = document.getElementById('btn-open-export');
      if (btnExport) btnExport.click();
    }
  }

  function handleDirectPublish() {
    handleOpenPostSettings();
  }

  function handleNewPost() {
    if (typeof window.createNewDraftModel !== 'function') return;
    const newPost = window.createNewDraftModel('', 'blank', 'post', 'draft');
    if (window.drafts) window.drafts.unshift(newPost);
    window.currentDraft = newPost;
    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    if (typeof window.openPostInEditor === 'function') {
      window.openPostInEditor(newPost);
    }
    if (typeof window.showToast === 'function') window.showToast('Created new blank post!');
  }

  function createNewStaticPage() {
    if (typeof window.createNewDraftModel !== 'function') return;
    const newPage = window.createNewDraftModel('', 'blank', 'page', 'published');
    newPage.type = 'page';
    newPage.status = 'published';
    newPage.hidden = false;
    newPage.retired = false;
    if (window.drafts) window.drafts.unshift(newPage);
    window.currentDraft = newPage;
    // Note: Do not save to persistent storage or log activity yet.
    // If the user leaves the page blank and presses back, it will be discarded rather than saved as an Untitled Page.
    if (typeof window.openPostInEditor === 'function') {
      window.openPostInEditor(newPage);
    }
  }
  window.createNewStaticPage = createNewStaticPage;

  function handleNewPage() {
    if (typeof window.openAddPageModal === 'function') {
      window.openAddPageModal();
      return;
    }
    createNewStaticPage();
  }
  window.handleNewPage = handleNewPage;

  function updateEditorHeader() {
    const titleDisplay = document.getElementById('editor-header-title');
    const typeBadge = document.getElementById('editor-type-badge');
    const typePill = document.getElementById('editor-header-type-pill');
    const btnBack = document.getElementById('btn-back-to-dashboard');
    const statusSelect = document.getElementById('editor-status-select');
    const statusBadge = document.getElementById('editor-post-status-badge');
    const btnDeletePage = document.getElementById('btn-delete-page');
    const saveBar = document.getElementById('draft-status-bar');
    const curDraft = window.currentDraft;

    if (typeof window.applyMediaPreferences === 'function') {
      window.applyMediaPreferences();
    }

    if (!curDraft) {
      if (titleDisplay) {
        titleDisplay.textContent = 'Untitled Post';
        titleDisplay.title = 'Untitled Post';
      }
      if (typePill) {
        typePill.textContent = 'Post';
        typePill.style.background = 'rgba(var(--accent-rgb, 113, 113, 122), 0.16)';
        typePill.style.color = 'var(--accent-primary, #fafafa)';
        typePill.style.border = '1px solid rgba(var(--accent-rgb, 113, 113, 122), 0.3)';
      }
      if (btnBack) {
        btnBack.setAttribute('href', '#posts');
        const span = btnBack.querySelector('span');
        if (span) span.textContent = 'Posts';
        btnBack.setAttribute('title', 'Return to Posts');
      }
      document.querySelectorAll('.page-blocks-only').forEach(el => {
        el.style.display = el.classList.contains('toolbar-divider') ? 'block' : 'inline-flex';
      });
      if (typeBadge) {
        typeBadge.textContent = 'Post';
        typeBadge.classList.remove('type-page');
      }
      if (statusSelect) statusSelect.value = 'draft';
      if (statusBadge) {
        statusBadge.textContent = 'Draft';
        statusBadge.className = 'editor-post-status-badge status-draft';
        statusBadge.removeAttribute('title');
      }
      if (btnDeletePage) btnDeletePage.style.display = 'none';
      return;
    }

    if (btnDeletePage) {
      btnDeletePage.style.display = 'none';
    }

    const isPage = Boolean(
      curDraft && (
        curDraft.type === 'page' ||
        curDraft.isCategoryAggregate ||
        (curDraft.id && String(curDraft.id).startsWith('page_')) ||
        (window.location.hash && window.location.hash.startsWith('#write/page'))
      )
    );
    if (isPage && curDraft) {
      curDraft.type = 'page';
    }

    if (titleDisplay) {
      const title = curDraft.title || (isPage ? 'Untitled Page' : 'Untitled Post');
      titleDisplay.textContent = title;
      titleDisplay.title = title;
    }
    if (typePill) {
      typePill.textContent = isPage ? 'Page' : 'Post';
      typePill.style.background = 'rgba(var(--accent-rgb, 113, 113, 122), 0.16)';
      typePill.style.color = 'var(--accent-primary, #fafafa)';
      typePill.style.border = '1px solid rgba(var(--accent-rgb, 113, 113, 122), 0.3)';
    }
    if (btnBack) {
      const prev = window.cedarPreviousDashboardPage;
      let bHash = isPage ? '#pages' : '#posts';
      let bLabel = isPage ? 'Pages' : 'Posts';
      if (prev && typeof window.isValidPreviousPage === 'function' && window.isValidPreviousPage(prev) && prev.type !== 'editor' && prev.type !== 'write') {
        if (prev.type === 'home') {
          bHash = '#home';
          bLabel = 'Home';
        } else if (isPage) {
          bHash = '#pages';
          bLabel = 'Pages';
        } else {
          bHash = '#posts';
          bLabel = 'Posts';
        }
      }
      btnBack.setAttribute('href', bHash);
      const span = btnBack.querySelector('span');
      if (span) span.textContent = bLabel;
      btnBack.setAttribute('title', `Return to ${bLabel}`);
    }

    // Featured / Page Blocks are universally available in both posts and pages
    document.querySelectorAll('.page-blocks-only').forEach(el => {
      el.style.display = el.classList.contains('toolbar-divider') ? 'block' : 'inline-flex';
    });

    if (typeBadge) {
      typeBadge.textContent = isPage ? 'Static Page' : 'Post';
      typeBadge.classList.toggle('type-page', isPage);
    }
    if (statusSelect) {
      statusSelect.value = curDraft.status || 'draft';
    }

    const isUnsaved = saveBar && saveBar.classList.contains('is-unsaved');

    // 1. Settings button & Preview button
    const btnPostSettings = document.getElementById('btn-open-post-settings');
    const btnEditorPreview = document.getElementById('btn-editor-preview');

    if (btnPostSettings) {
      btnPostSettings.style.display = 'inline-flex';
      const labelText = isPage ? 'Page Settings' : 'Post Settings';
      btnPostSettings.title = labelText;
      const settingsLabel = document.getElementById('label-post-settings-btn');
      if (settingsLabel) {
        settingsLabel.textContent = labelText;
      }
    }
    if (btnEditorPreview) {
      btnEditorPreview.style.display = 'inline-flex';
    }

    // 2. Status Badge Pill (Dedicated status indicator, non-interactive; hidden for pages)
    if (statusBadge) {
      if (isPage) {
        statusBadge.style.display = 'none';
      } else {
        statusBadge.style.display = 'inline-flex';
        if (curDraft.status === 'published') {
          statusBadge.textContent = isUnsaved ? 'Unsaved edits' : 'Published';
          statusBadge.className = isUnsaved ? 'editor-post-status-badge status-edited' : 'editor-post-status-badge status-published';
        } else if (curDraft.status === 'scheduled') {
          statusBadge.textContent = 'Scheduled';
          statusBadge.className = 'editor-post-status-badge status-scheduled';
        } else {
          statusBadge.textContent = 'Draft';
          statusBadge.className = 'editor-post-status-badge status-draft';
        }
      }
      statusBadge.removeAttribute('title');
    }


    // 4. Topbar Publish button removed — publishing happens exclusively via Post Settings
    const publishBtn = document.getElementById('btn-publish-post');
    if (publishBtn) {
      publishBtn.style.display = 'none';
    }

    // 5. Update Title and Subtitle visibility on canvas
    updateCanvasHeaderVisibility(curDraft);
  }

  function handlePublishAction() {
    // Publishing happens exclusively via Post/Page Settings modal
    if (typeof window.handleOpenPostSettings === 'function') {
      window.handleOpenPostSettings();
    } else {
      const btn = document.getElementById('btn-open-post-settings');
      if (btn) btn.click();
    }
  }

  function updateCanvasHeaderVisibility(draft) {
    const curDraft = draft || window.currentDraft;
    if (!curDraft) return;
    const isPage = curDraft.type === 'page';
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const header = document.querySelector('.article-header');

    // Title and Subtitle visibility sliders apply specifically to pages (default: true)
    const showTitle = !isPage || curDraft.showTitle !== false;
    const showSubtitle = !isPage || curDraft.showSubtitle !== false;

    if (canvasTitle) {
      if (!showTitle) {
        canvasTitle.style.setProperty('display', 'none', 'important');
      } else {
        canvasTitle.style.removeProperty('display');
      }
    }
    if (canvasSubtitle) {
      if (!showSubtitle) {
        canvasSubtitle.style.setProperty('display', 'none', 'important');
      } else {
        canvasSubtitle.style.removeProperty('display');
      }
    }
    if (header) {
      header.classList.toggle('all-hidden', !showTitle && !showSubtitle);
      if (!showTitle && !showSubtitle) {
        header.style.setProperty('display', 'none', 'important');
      } else {
        header.style.removeProperty('display');
      }
    }
  }

  // =========================================================================
  // GLOBAL & NAMESPACE EXPORTS
  // =========================================================================

  window.updateCategorySelectUI = updateCategorySelectUI;
  window.syncDraftToForm = syncDraftToForm;
  window.syncFormToDraft = syncFormToDraft;
  window.updateNavFooterPreview = updateNavFooterPreview;
  window.updateCoverPreview = updateCoverPreview;
  window.updateStats = updateStats;
  window.updateDraftsCount = updateDraftsCount;
  window.updateImagesCount = updateImagesCount;
  window.autoResizeMarkdownTextarea = autoResizeMarkdownTextarea;
  window.setEditorMode = setEditorMode;
  window.setupInputBindings = setupInputBindings;
  window.isPostSettingsConfigured = isPostSettingsConfigured;
  window.handlePublishAction = handlePublishAction;
  window.handleNewPost = handleNewPost;
  window.handleNewPage = handleNewPage;
  window.handleOpenPostSettings = handleOpenPostSettings;
  window.updateEditorHeader = updateEditorHeader;
  window.updateCanvasHeaderVisibility = updateCanvasHeaderVisibility;
  window.clearEditorCanvasDOM = clearEditorCanvasDOM;

  const coordinatorExports = {
    updateCategorySelectUI,
    syncDraftToForm,
    syncFormToDraft,
    clearEditorCanvasDOM,
    updateNavFooterPreview,
    updateCoverPreview,
    updateStats,
    updateDraftsCount,
    updateImagesCount,
    autoResizeMarkdownTextarea,
    setEditorMode,
    setupInputBindings,
    isPostSettingsConfigured,
    handlePublishAction,
    handleOpenPostSettings,
    handleNewPost,
    handleNewPage,
    createNewStaticPage,
    updateEditorHeader,
    updateCanvasHeaderVisibility
  };

  // Flush any pending draft changes immediately upon page unload or reload
  window.addEventListener('beforeunload', () => {
    try {
      const cur = window.currentDraft;
      if (typeof window.syncFormToDraft === 'function') {
        window.syncFormToDraft();
      }
      if (cur && typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(cur)) {
        if (typeof window.discardBlankDraft === 'function') {
          window.discardBlankDraft(cur);
        }
      } else if (typeof window.saveDraftsToStorage === 'function') {
        window.saveDraftsToStorage();
      }
    } catch (e) {}
  });

  window.Cedar.editor = Object.assign(window.Cedar.editor || {}, coordinatorExports);
  window.Outpost.editor = window.Cedar.editor;
})();
