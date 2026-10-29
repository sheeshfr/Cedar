/**
 * Cedar - Rich Text Canvas & Interactive Block Interactions
 * Module: js/editor/canvas.js
 * 
 * Responsibilities:
 * - Prose canvas event routing and default paragraph formatting
 * - Click delegation for figures, galleries, embeds, and captions
 * - Universal block Enter handling (creating a clean new paragraph below any block)
 * - Safe Backspace / Delete handling for captions and non-text blocks
 * - Centered caret positioning for new/empty captions
 * - Dynamic trailing text block maintenance & 1/3rd viewport typing scroll buffer
 * - Deletion of selected or caret-enclosed top-level blocks
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  /**
   * Helper to validate and link a URL (blog post, blog page, or external web link) inside an Individual Post block
   */
  async function applyIndividualPostUrlLink(blockEl, explicitUrl = '') {
    window.applyIndividualPostUrlLink = applyIndividualPostUrlLink;
    if (!blockEl) return;
    const input = blockEl.querySelector('.individual-post-url-input');
    const addBtn = blockEl.querySelector('.btn-link-individual-post');
    const rawUrl = (explicitUrl || (input ? input.value : '') || blockEl.getAttribute('data-url') || '').trim();
    if (!rawUrl) {
      if (typeof window.showToast === 'function') {
        window.showToast('Please enter or paste a URL to add.', 'info');
      }
      if (input) input.focus();
      return;
    }

    const origBtnText = addBtn ? addBtn.textContent : 'Add';
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Searching...';
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Fetching link preview...', 'info');
      }
    }

    try {
      // 1. Check if the URL resolves to a blog post or blog page from the user's blog
      const blogResolver = window.resolveBlogItemFromUrl || window.Cedar?.editor?.resolveBlogItemFromUrl;
      const matchedBlogItem = typeof blogResolver === 'function' ? blogResolver(rawUrl) : null;

      if (matchedBlogItem && matchedBlogItem.type === 'post') {
        const post = matchedBlogItem.item;
        if (window.commitCheckpoint) window.commitCheckpoint();
        blockEl.setAttribute('data-item-type', 'post');
        blockEl.setAttribute('data-post-id', post.id || '');
        blockEl.setAttribute('data-post-slug', post.slug || '');
        blockEl.removeAttribute('data-page-id');
        blockEl.removeAttribute('data-page-slug');
        blockEl.removeAttribute('data-url');
        blockEl.removeAttribute('data-title');
        blockEl.removeAttribute('data-subtitle');
        blockEl.removeAttribute('data-image');
        blockEl.removeAttribute('data-domain');
        blockEl.removeAttribute('data-icon');
        delete blockEl.dataset.editingUrl;

        if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
          window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
        }
        if (typeof window.recordAction === 'function') window.recordAction('link-individual-post', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.showToast === 'function') {
          window.showToast(`✓ Linked to post: "${post.title || post.slug}"`);
        }
        return;
      }

      if (matchedBlogItem && matchedBlogItem.type === 'page') {
        const page = matchedBlogItem.item;
        if (window.commitCheckpoint) window.commitCheckpoint();
        blockEl.setAttribute('data-item-type', 'page');
        blockEl.setAttribute('data-page-id', page.id || '');
        blockEl.setAttribute('data-page-slug', page.slug || '');
        blockEl.removeAttribute('data-post-id');
        blockEl.removeAttribute('data-post-slug');
        blockEl.removeAttribute('data-url');
        blockEl.removeAttribute('data-title');
        blockEl.removeAttribute('data-subtitle');
        blockEl.removeAttribute('data-image');
        blockEl.removeAttribute('data-domain');
        blockEl.removeAttribute('data-icon');
        delete blockEl.dataset.editingUrl;

        if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
          window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
        }
        if (typeof window.recordAction === 'function') window.recordAction('link-individual-post', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.showToast === 'function') {
          window.showToast(`✓ Linked to page: "${page.title || page.slug}"`);
        }
        return;
      }

      // 2. Not an internal post or page -> fetch link metadata for external web link
      const metaFetcher = window.fetchLinkMetadata || window.Cedar?.editor?.fetchLinkMetadata;
      const meta = typeof metaFetcher === 'function' ? await metaFetcher(rawUrl) : null;

      if (window.commitCheckpoint) window.commitCheckpoint();
      blockEl.setAttribute('data-item-type', 'external');
      blockEl.setAttribute('data-url', (meta && meta.url) || rawUrl);
      if (meta && meta.title) blockEl.setAttribute('data-title', meta.title); else blockEl.removeAttribute('data-title');
      if (meta && meta.subtitle) blockEl.setAttribute('data-subtitle', meta.subtitle); else blockEl.removeAttribute('data-subtitle');
      if (meta && meta.image) blockEl.setAttribute('data-image', meta.image); else blockEl.removeAttribute('data-image');
      if (meta && meta.domain) blockEl.setAttribute('data-domain', meta.domain); else blockEl.removeAttribute('data-domain');
      if (meta && meta.icon) blockEl.setAttribute('data-icon', meta.icon); else blockEl.removeAttribute('data-icon');

      blockEl.removeAttribute('data-post-id');
      blockEl.removeAttribute('data-post-slug');
      blockEl.removeAttribute('data-page-id');
      blockEl.removeAttribute('data-page-slug');
      delete blockEl.dataset.editingUrl;

      if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
        window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
      }
      if (typeof window.recordAction === 'function') window.recordAction('link-individual-post', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      if (typeof window.showToast === 'function') {
        const domainText = (meta && meta.domain) ? ` (${meta.domain})` : '';
        window.showToast(`✓ Added link card${domainText}`);
      }
    } catch (err) {
      console.error('Failed to link URL in individual-post block:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('Could not fetch link info. Created basic card.', 'info');
      }
    } finally {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = origBtnText;
      }
    }
  }

  /**
   * Deletes whichever block is currently selected, or the block enclosing the selection caret.
   */
  function deleteCurrentBlock() {
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return;
    const selectedBlock = canvasProse.querySelector('.selected, .captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected');
    if (selectedBlock) {
      if (typeof window.deleteBlock === 'function') {
        window.deleteBlock(selectedBlock);
      } else {
        selectedBlock.remove();
      }
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      let topBlock = node;
      while (topBlock && topBlock.parentNode !== canvasProse && topBlock !== canvasProse) {
        topBlock = topBlock.parentNode;
      }
      if (topBlock && topBlock.parentNode === canvasProse) {
        if (typeof window.deleteBlock === 'function') {
          window.deleteBlock(topBlock);
        } else {
          topBlock.remove();
        }
      }
    }
  }

  /**
   * Initializes rich text canvas behaviors, event handlers, and keyboard shortcuts.
   */
  function setupRichTextFormatting() {
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return;

    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) {}

    canvasProse.addEventListener('focus', () => {
      try {
        document.execCommand('defaultParagraphSeparator', false, 'p');
      } catch (e) {}
    });

    canvasProse.addEventListener('mousedown', (e) => {
      if (!e.target || e.target === canvasProse) return;
      const inCaption = e.target.closest ? e.target.closest('figcaption, .gallery-caption') : null;
      const inNonText = !inCaption && e.target.closest
        ? e.target.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider')
        : null;
      if (!inNonText) {
        canvasProse.querySelectorAll('.selected, .selected-item').forEach(el => el.classList.remove('selected', 'selected-item'));
        window._selectedImageBlock = null;
        window._lastActiveImageBlock = null;
      }
    });

    // Click handler for figure resize buttons, delete, move up/down, add image, and selection
    canvasProse.addEventListener('click', (e) => {

      // Allow normal focus & interaction inside the Individual Post URL input
      if (e.target.closest('.individual-post-url-input')) {
        e.stopPropagation();
        return;
      }

      // Allow pagination buttons inside Recent Posts block to work without interference
      if (e.target.closest('.recent-posts-pagination')) {
        return;
      }

      // View layout toggle (Grid / List) on Recent Posts or Individual Post blocks
      const layoutBtn = e.target.closest('[data-action="set-page-block-layout"]');
      if (layoutBtn) {
        e.preventDefault();
        e.stopPropagation();
        const newLayout = layoutBtn.dataset.layout === 'list' ? 'list' : 'grid';
        const blockEl = layoutBtn.closest('.page-recent-posts-block, .page-individual-post-block');
        if (blockEl) {
          if (window.commitCheckpoint) window.commitCheckpoint();
          blockEl.setAttribute('data-layout', newLayout);
          if (blockEl.classList.contains('page-recent-posts-block')) {
            if (typeof window.hydrateSingleRecentPostsBlock === 'function') {
              window.hydrateSingleRecentPostsBlock(blockEl, window.currentDraft, { isEditor: true, initialPage: 1 });
            }
          } else if (blockEl.classList.contains('page-individual-post-block')) {
            if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
              window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
            }
          }
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
        return;
      }

      // Toggle URL bar on Individual Post block ("Change Post" / "Link Post")
      const editUrlBtn = e.target.closest('.btn-edit-individual-post-url');
      if (editUrlBtn) {
        e.preventDefault();
        e.stopPropagation();
        const blockEl = editUrlBtn.closest('.page-individual-post-block');
        if (blockEl) {
          blockEl.dataset.editingUrl = blockEl.dataset.editingUrl === 'true' ? 'false' : 'true';
          if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
            window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
          }
          if (blockEl.dataset.editingUrl === 'true') {
            setTimeout(() => {
              const input = blockEl.querySelector('.individual-post-url-input');
              if (input) {
                input.focus();
                input.select();
              }
            }, 20);
          }
        }
        return;
      }

      // Link Post button inside Individual Post URL bar
      const linkPostBtn = e.target.closest('.btn-link-individual-post');
      if (linkPostBtn) {
        e.preventDefault();
        e.stopPropagation();
        const blockEl = linkPostBtn.closest('.page-individual-post-block');
        if (blockEl) {
          applyIndividualPostUrlLink(blockEl);
        }
        return;
      }

      // Cancel URL edit button
      const cancelEditUrlBtn = e.target.closest('.btn-cancel-edit-url');
      if (cancelEditUrlBtn) {
        e.preventDefault();
        e.stopPropagation();
        const blockEl = cancelEditUrlBtn.closest('.page-individual-post-block');
        if (blockEl) {
          delete blockEl.dataset.editingUrl;
          if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
            window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
          }
        }
        return;
      }

      // Link clicked inside prose: show floating link popup (except inside non-text cards like post-card or share-block)
      const clickedLink = e.target.closest('a');
      if (clickedLink && canvasProse.contains(clickedLink) && !clickedLink.closest('.figure-hover-actions, .share-block-card, .captioned-image-container .image-hover-actions, .page-recent-posts-block, .page-individual-post-block')) {
        e.preventDefault();
        e.stopPropagation();
        if (((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)) && typeof ((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)).show === 'function') {
          ((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)).show(clickedLink);
        }
        return;
      } else {
        if (clickedLink && clickedLink.closest('.page-recent-posts-block, .page-individual-post-block')) {
          e.preventDefault();
        }
        if (((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)) && typeof ((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)).hide === 'function') {
          ((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)).hide();
        }
      }

      // Side '+' button clicked (left or right)
      const sideAddBtn = e.target.closest('.image-side-add-btn');
      if (sideAddBtn) {
        e.preventDefault();
        e.stopPropagation();
        const side = sideAddBtn.dataset.side || 'right';
        const block = sideAddBtn.closest('.captioned-image-container, .custom-gallery-grid');
        if (block && typeof window.addSideBySideSlot === 'function') {
          window.addSideBySideSlot(block, side);
        }
        return;
      }

      // Cancel placeholder slot
      const cancelPlaceholderBtn = e.target.closest('.btn-cancel-placeholder');
      if (cancelPlaceholderBtn) {
        e.preventDefault();
        e.stopPropagation();
        const slot = cancelPlaceholderBtn.closest('.gallery-slot-placeholder');
        const gallery = slot ? slot.closest('.custom-gallery-grid') : null;
        if (gallery && typeof window.cancelGalleryPlaceholder === 'function') {
          window.cancelGalleryPlaceholder(gallery);
        }
        return;
      }

      // Choose Media button inside slot
      const chooseMediaBtn = e.target.closest('.btn-slot-choose-media');
      if (chooseMediaBtn) {
        e.preventDefault();
        e.stopPropagation();
        const slot = chooseMediaBtn.closest('.gallery-slot-placeholder');
        if (slot) {
          window._activePlaceholderSlot = slot;
          if (typeof window.openModal === 'function') {
            window.openModal('modal-insert-image');
            if (typeof window.renderEditorMediaPopup === 'function') {
              window.renderEditorMediaPopup();
            }
          }
        }
        return;
      }

      // Click on placeholder slot itself to focus it
      const slotPlaceholder = e.target.closest('.gallery-slot-placeholder');
      if (slotPlaceholder) {
        e.preventDefault();
        e.stopPropagation();
        window._activePlaceholderSlot = slotPlaceholder;
        slotPlaceholder.focus();
        return;
      }

      // Handle 'Add Caption' button click on image (single figure or gallery)
      const addCapBtn = e.target.closest('.image-add-caption-btn');
      if (addCapBtn) {
        e.preventDefault();
        e.stopPropagation();

        if (window.commitCheckpoint) window.commitCheckpoint();

        const gallery = addCapBtn.closest('.custom-gallery-grid');
        if (gallery) {
          document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block').forEach(c => c.classList.remove('selected'));
          window._selectedImageBlock = null;
          window._lastActiveImageBlock = gallery;

          let pCap = (gallery.nextElementSibling && gallery.nextElementSibling.classList.contains('gallery-caption')) ? gallery.nextElementSibling : null;
          if (!pCap) {
            pCap = document.createElement('p');
            pCap.className = 'gallery-caption';
            pCap.contentEditable = "true";
            pCap.setAttribute('placeholder', 'Add caption here...');
            gallery.parentNode.insertBefore(pCap, gallery.nextSibling);
          }
          gallery.classList.add('has-caption');

          setTimeout(() => {
            pCap.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(pCap);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
          return;
        }

        const container = addCapBtn.closest('.captioned-image-container');
        if (!container) return;
        const figure = container.querySelector('figure');
        if (!figure) return;

        document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block').forEach(c => c.classList.remove('selected'));

        let figcaption = figure.querySelector('figcaption');
        if (!figcaption) {
          figcaption = document.createElement('figcaption');
          figcaption.contentEditable = "true";
          figcaption.setAttribute('placeholder', 'Add caption here...');
          figure.appendChild(figcaption);
        }
        container.classList.add('has-caption');

        setTimeout(() => {
          figcaption.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(figcaption);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }, 0);
        return;
      }

      // Move gallery item left (backward in rotation)
      const moveLeftBtn = e.target.closest('.btn-move-item-left');
      if (moveLeftBtn) {
        e.preventDefault();
        e.stopPropagation();
        const galleryGrid = moveLeftBtn.closest('.custom-gallery-grid');
        const idx = parseInt(moveLeftBtn.dataset.index, 10);
        if (galleryGrid && !isNaN(idx) && typeof window.moveGalleryImage === 'function') {
          window.moveGalleryImage(galleryGrid, idx, 'left');
        }
        return;
      }

      // Move gallery item right (forward in rotation)
      const moveRightBtn = e.target.closest('.btn-move-item-right');
      if (moveRightBtn) {
        e.preventDefault();
        e.stopPropagation();
        const galleryGrid = moveRightBtn.closest('.custom-gallery-grid');
        const idx = parseInt(moveRightBtn.dataset.index, 10);
        if (galleryGrid && !isNaN(idx) && typeof window.moveGalleryImage === 'function') {
          window.moveGalleryImage(galleryGrid, idx, 'right');
        }
        return;
      }

      // Combine adjacent images side-by-side button
      const combineBtn = e.target.closest('.btn-combine-adjacent-images');
      if (combineBtn) {
        e.preventDefault();
        e.stopPropagation();
        const thisBlock = combineBtn.closest('.captioned-image-container, .custom-gallery-grid');
        if (thisBlock && typeof window.getAdjacentImageBlock === 'function' && typeof window.mergeImageBlocks === 'function') {
          const adj = window.getAdjacentImageBlock(thisBlock);
          if (adj && adj.block) {
            if (adj.direction === 'prev') {
              window.mergeImageBlocks(adj.block, thisBlock);
            } else {
              window.mergeImageBlocks(thisBlock, adj.block);
            }
          }
        }
        return;
      }

      // Add another picture button
      const addMultiBtn = e.target.closest('.btn-add-multi-image');
      if (addMultiBtn) {
        e.preventDefault();
        e.stopPropagation();
        const container = addMultiBtn.closest('.custom-gallery-grid, .captioned-image-container');
        if (container) {
          window._activeAddMultiImageTarget = container;
          if (typeof window.openModal === 'function') {
            window.openModal('modal-insert-image');
          }
        }
        return;
      }

      // Image selection when clicking on or beside an image inside .captioned-image-container
      const imageContainer = e.target.closest('.captioned-image-container');
      if (imageContainer && !e.target.closest('figcaption, button, .image-hover-pill-bar, .figure-hover-actions')) {
        document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
        imageContainer.classList.add('selected');
        window._selectedImageBlock = imageContainer;
        window._lastActiveImageBlock = imageContainer;
        window._lastActiveBlock = imageContainer;
        window._savedSelectionRange = null;
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch (err) {}
        if (!imageContainer.hasAttribute('tabindex')) imageContainer.setAttribute('tabindex', '0');
        imageContainer.focus();
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      // Click on Share button block inside editor: NEVER copy or activate button; simply highlight / select the block
      const shareBlock = e.target.closest('.article-share-block');
      if (shareBlock) {
        e.preventDefault();
        e.stopPropagation();
        canvasProse.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
        shareBlock.classList.add('selected');
        window._lastActiveBlock = shareBlock;
        window._selectedImageBlock = null;
        window._savedSelectionRange = null;
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch (err) {}
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      // Click on Subscribe (RSS) button block inside editor: NEVER copy or activate button; simply highlight / select the block
      const rssBlock = e.target.closest('.article-rss-block');
      if (rssBlock) {
        e.preventDefault();
        e.stopPropagation();
        canvasProse.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
        rssBlock.classList.add('selected');
        window._lastActiveBlock = rssBlock;
        window._selectedImageBlock = null;
        window._savedSelectionRange = null;
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch (err) {}
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      // Block selection across other non-text block types
      const otherContainer = e.target.closest('.custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block');
      if (otherContainer && !e.target.isContentEditable) {
        if (!e.target.closest('.gallery-item-delete-btn') && !e.target.closest('.btn-move-item-left') && !e.target.closest('.btn-move-item-right') && !e.target.closest('.image-add-caption-btn') && !e.target.closest('.gallery-split-badge') && !e.target.closest('.figure-action-btn') && !e.target.closest('.image-side-add-btn') && !e.target.closest('.page-block-view-btn') && !e.target.closest('.btn-edit-individual-post-url') && !e.target.closest('.btn-link-individual-post')) {
          if (e.target.closest('.article-share-block, .article-rss-block, .btn-share-article, .btn-copy-share-url, .btn-rss-subscribe')) {
            e.preventDefault();
          }
          document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
          otherContainer.classList.add('selected');
          window._lastActiveBlock = otherContainer;
          window._selectedImageBlock = otherContainer.classList.contains('custom-gallery-grid') ? otherContainer : null;
          if (otherContainer.classList.contains('custom-gallery-grid')) {
            window._lastActiveImageBlock = otherContainer;
            const clickedItem = e.target.closest('.custom-gallery-item');
            otherContainer.querySelectorAll('.custom-gallery-item').forEach(it => it.classList.remove('selected-item'));
            if (clickedItem) {
              clickedItem.classList.add('selected-item');
            }
          }
          window._savedSelectionRange = null;
          try {
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
          } catch (err) {}
          if (typeof otherContainer.focus === 'function') otherContainer.focus();
          if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
          return;
        }
      }

      // Decrease Image Scale (-) button
      const scaleDownBtn = e.target.closest('.btn-scale-img-down');
      if (scaleDownBtn) {
        e.preventDefault();
        e.stopPropagation();
        const container = scaleDownBtn.closest('.captioned-image-container');
        if (container && typeof window.stepImageScale === 'function') {
          window.stepImageScale(container, 'down');
        }
        return;
      }

      // Increase Image Scale (+) button
      const scaleUpBtn = e.target.closest('.btn-scale-img-up');
      if (scaleUpBtn) {
        e.preventDefault();
        e.stopPropagation();
        const container = scaleUpBtn.closest('.captioned-image-container');
        if (container && typeof window.stepImageScale === 'function') {
          window.stepImageScale(container, 'up');
        }
        return;
      }

      // Move Up button
      const moveUpBtn = e.target.closest('.btn-move-block-up');
      if (moveUpBtn) {
        e.preventDefault();
        e.stopPropagation();
        const container = moveUpBtn.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-individual-post-block');
        if (container && container.previousElementSibling) {
          if (window.commitCheckpoint) window.commitCheckpoint();
          const nextAfter = container.nextElementSibling;
          const orphanedTrailingP = (
            nextAfter &&
            nextAfter === canvasProse.lastElementChild &&
            nextAfter.tagName === 'P' &&
            (!nextAfter.textContent.trim() || nextAfter.innerHTML === '<br>') &&
            nextAfter.getAttribute('data-intentional-space') !== 'true'
          ) ? nextAfter : null;
          container.parentNode.insertBefore(container, container.previousElementSibling);
          if (orphanedTrailingP && orphanedTrailingP.parentNode === canvasProse && orphanedTrailingP !== container.nextElementSibling) {
            orphanedTrailingP.remove();
          }
          if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
          if (window.recordAction) window.recordAction('block-move-up', true);
          if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Moved block up');
        }
        return;
      }

      // Move Down button
      const moveDownBtn = e.target.closest('.btn-move-block-down');
      if (moveDownBtn) {
        e.preventDefault();
        e.stopPropagation();
        const container = moveDownBtn.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-individual-post-block');
        if (container && container.nextElementSibling) {
          if (container.nextElementSibling.classList.contains('page-recent-posts-block')) {
            if (typeof window.showToast === 'function') {
              window.showToast('Nothing can be placed below the Recent Posts block.', 'info');
            }
            return;
          }
          if (window.commitCheckpoint) window.commitCheckpoint();
          container.parentNode.insertBefore(container, container.nextElementSibling.nextSibling);
          if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
          if (window.recordAction) window.recordAction('block-move-down', true);
          if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Moved block down');
        }
        return;
      }

      // Delete Block button
      const deleteBtn = e.target.closest('.btn-delete-fig');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const container = deleteBtn.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block');
        if (container) {
          if (typeof window.deleteBlock === 'function') {
            window.deleteBlock(container);
          } else {
            container.remove();
          }
        }
        return;
      }

      // Individual gallery item delete button
      const itemDeleteBtn = e.target.closest('.gallery-item-delete-btn');
      if (itemDeleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const galleryGrid = itemDeleteBtn.closest('.custom-gallery-grid');
        const idx = parseInt(itemDeleteBtn.dataset.index, 10);
        if (galleryGrid && !isNaN(idx) && typeof window.removeImageFromGallery === 'function') {
          window.removeImageFromGallery(galleryGrid, idx);
        }
        return;
      }

      // View all images when clicking +N badge
      const splitBadge = e.target.closest('.gallery-split-badge');
      if (splitBadge) {
        e.preventDefault();
        e.stopPropagation();
        const galleryGrid = splitBadge.closest('.custom-gallery-grid');
        if (galleryGrid) {
          const imgs = Array.from(galleryGrid.querySelectorAll('.custom-gallery-item img')).map(im => im.src);
          if (typeof window.openNoteImageLightbox === 'function') {
            window.openNoteImageLightbox(imgs, 3);
          } else if (typeof window.openMediaLightbox === 'function') {
            const firstImg = galleryGrid.querySelectorAll('.custom-gallery-item img')[3] || galleryGrid.querySelector('img');
            if (firstImg) window.openMediaLightbox(firstImg.src);
          }
        }
        return;
      }

      // Clicking inside a Page-Exclusive Block (Recent Posts / Individual Post) selects the block & prevents card navigation in editor
      const clickedPageBlock = e.target.closest('.page-recent-posts-block, .page-individual-post-block');
      if (clickedPageBlock && canvasProse.contains(clickedPageBlock)) {
        const cardLink = e.target.closest('a.post-card, .post-card a');
        if (cardLink) {
          e.preventDefault();
        }
        document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
        clickedPageBlock.classList.add('selected');
        window._selectedImageBlock = null;
        window._lastActiveBlock = clickedPageBlock;
        window._savedSelectionRange = null;
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch (err) {}
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      // Click on Divider Line (HR) inside editor: select the divider block
      const clickedHr = e.target.closest('hr, .canvas-divider');
      if (clickedHr && canvasProse.contains(clickedHr)) {
        document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
        clickedHr.classList.add('selected');
        window._selectedImageBlock = null;
        window._lastActiveBlock = clickedHr;
        window._savedSelectionRange = null;
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch (err) {}
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      // Check if user clicked horizontally beside an image block (only when clicking directly on canvasProse background, never inside a text block)
      if (e.target === canvasProse) {
        const allImageBlocks = Array.from(canvasProse.querySelectorAll('.captioned-image-container, .custom-gallery-grid'));
        let clickedBesideBlock = null;
        for (const ib of allImageBlocks) {
          const rect = ib.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            clickedBesideBlock = ib;
            break;
          }
        }

        if (clickedBesideBlock) {
          document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
          clickedBesideBlock.classList.add('selected');
          window._selectedImageBlock = clickedBesideBlock;
          window._lastActiveImageBlock = clickedBesideBlock;
          window._lastActiveBlock = clickedBesideBlock;
          window._savedSelectionRange = null;
          try {
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
          } catch (err) {}
          if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
          return;
        }
      }

      // If clicked elsewhere, check if we need to cancel an active placeholder
      if (window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode) {
        const activeGal = window._activePlaceholderSlot.closest('.custom-gallery-grid');
        if (activeGal && !activeGal.contains(e.target)) {
          const inModal = e.target.closest ? e.target.closest('.modal-backdrop, .modal, .toast-container, .image-side-add-btn') : null;
          if (!inModal && typeof window.cancelGalleryPlaceholder === 'function') {
            window.cancelGalleryPlaceholder(activeGal);
          }
        }
      }

      // If clicked elsewhere (such as inside a text block), deselect non-text blocks completely
      document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
      window._selectedImageBlock = null;
      window._lastActiveImageBlock = null;
      if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
    });

    // Global click listener to cancel active placeholder when clicking outside canvasProse
    document.addEventListener('click', (e) => {
      if (window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode) {
        const activeGal = window._activePlaceholderSlot.closest('.custom-gallery-grid');
        if (activeGal && !activeGal.contains(e.target)) {
          const inModal = e.target.closest ? e.target.closest('.modal-backdrop, .modal, .toast-container, .image-side-add-btn') : null;
          if (!inModal && typeof window.cancelGalleryPlaceholder === 'function') {
            window.cancelGalleryPlaceholder(activeGal);
          }
        }
      }
    });

    // Escape key listener to cancel active placeholder
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode) {
        const activeGal = window._activePlaceholderSlot.closest('.custom-gallery-grid');
        if (activeGal && typeof window.cancelGalleryPlaceholder === 'function') {
          window.cancelGalleryPlaceholder(activeGal);
        }
      }
    });

    const NON_TEXT_BLOCK_SELECTOR = '.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, .post-nav-grid, hr, [contenteditable="false"]';

    function isNonTextBlock(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      if (el.getAttribute('contenteditable') === 'false') return true;
      return el.matches ? el.matches(NON_TEXT_BLOCK_SELECTOR) : false;
    }

    function getTopLevelEditableBlock(node) {
      if (!node) return null;
      let curr = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
      while (curr && curr.parentNode !== canvasProse && curr !== canvasProse && curr !== document.body) {
        curr = curr.parentNode;
      }
      if (curr && curr.parentNode === canvasProse && !isNonTextBlock(curr)) {
        return curr;
      }
      return null;
    }

    function placeCaretInBlock(blockEl, atStart = true) {
      if (!blockEl) return;
      if (typeof window.focusNodeCaret === 'function') {
        window.focusNodeCaret(blockEl, atStart);
        return;
      }
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(blockEl);
        range.collapse(atStart);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {}
    }
    window.placeCaretInBlock = placeCaretInBlock;

    function findEnclosingListItem(sel, target) {
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        if (node && node.closest) {
          const li = node.closest('li');
          if (li && canvasProse.contains(li)) return li;
        }
        const container = range.startContainer;
        if (container && (container.tagName === 'UL' || container.tagName === 'OL')) {
          const offset = range.startOffset;
          const child = container.childNodes[offset] || container.children[offset];
          if (child && child.tagName === 'LI') return child;
          const prevChild = container.childNodes[offset - 1] || container.children[offset - 1];
          if (prevChild && prevChild.tagName === 'LI') return prevChild;
        }
        let common = range.commonAncestorContainer;
        if (common && common.nodeType === Node.TEXT_NODE) common = common.parentNode;
        if (common && common.closest) {
          const li = common.closest('li');
          if (li && canvasProse.contains(li)) return li;
        }
      }
      if (target && target.closest) {
        const li = target.closest('li');
        if (li && canvasProse.contains(li)) return li;
      }
      if (document.activeElement && document.activeElement.closest) {
        const li = document.activeElement.closest('li');
        if (li && canvasProse.contains(li)) return li;
      }
      return null;
    }

    function isCaretAtStartOfListItem(li, range) {
      if (!li || !range || !range.collapsed) return false;
      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(li);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preText = (preRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
        if (preText.length > 0) return false;
        const clone = preRange.cloneContents();
        if (clone.querySelector && clone.querySelector('img, video, audio, iframe, hr, table, button, svg, input, canvas, br')) {
          return false;
        }
        return true;
      } catch (e) {
        return false;
      }
    }

    function placeCaretAtEndOfNode(el) {
      if (!el) return;
      const canvas = el.closest ? (el.closest('[contenteditable="true"]') || canvasProse) : canvasProse;
      if (canvas && typeof canvas.focus === 'function') canvas.focus();

      if (el.classList && (el.classList.contains('captioned-image-container') || el.classList.contains('custom-gallery-grid') || el.classList.contains('video-wrapper') || el.classList.contains('article-share-block') || el.classList.contains('article-rss-block') || el.classList.contains('page-recent-posts-block') || el.classList.contains('page-individual-post-block') || el.tagName === 'HR')) {
        const caption = el.querySelector && el.querySelector('figcaption, .gallery-caption');
        if (caption) {
          placeCaretAtEndOfNode(caption);
          return;
        }
        if (typeof window.selectBlockElement === 'function') {
          window.selectBlockElement(el);
          return;
        }
      }

      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      let lastText = null;
      let tNode = walker.nextNode();
      while (tNode) {
        if (tNode.textContent && tNode.textContent.length > 0) {
          lastText = tNode;
        }
        tNode = walker.nextNode();
      }

      if (lastText) {
        range.setStart(lastText, lastText.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        window._savedSelectionRange = range.cloneRange();
      } else if (typeof window.focusNodeCaret === 'function') {
        window.focusNodeCaret(el, false);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        window._savedSelectionRange = range.cloneRange();
      }
    }

    function placeCaretAtStartOfNode(el) {
      if (!el) return;
      const canvas = el.closest ? (el.closest('[contenteditable="true"]') || canvasProse) : canvasProse;
      if (canvas && typeof canvas.focus === 'function') canvas.focus();

      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      const firstText = walker.nextNode();
      if (firstText) {
        range.setStart(firstText, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        window._savedSelectionRange = range.cloneRange();
      } else if (typeof window.focusNodeCaret === 'function') {
        window.focusNodeCaret(el, true);
      } else {
        range.selectNodeContents(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        window._savedSelectionRange = range.cloneRange();
      }
    }

    function convertListItemToParagraph(li, listParent) {
      if (!li || !listParent) return;

      if (window.commitCheckpoint) window.commitCheckpoint();

      const newP = document.createElement('p');
      if (li.style && li.style.textAlign) {
        newP.style.textAlign = li.style.textAlign;
      } else if (listParent.style && listParent.style.textAlign) {
        newP.style.textAlign = listParent.style.textAlign;
      }

      while (li.firstChild) {
        newP.appendChild(li.firstChild);
      }
      if (!newP.hasChildNodes() || (!newP.textContent.trim() && !newP.querySelector('br, img'))) {
        newP.innerHTML = '<br>';
      }

      const prevSib = li.previousElementSibling;
      const nextSib = li.nextElementSibling;
      const listItems = Array.from(listParent.children).filter(el => el.tagName === 'LI');

      if (listItems.length <= 1) {
        if (listParent.parentNode) {
          listParent.parentNode.replaceChild(newP, listParent);
        }
      } else if (!prevSib) {
        if (listParent.tagName === 'OL' && listParent.hasAttribute('start')) {
          const origStart = parseInt(listParent.getAttribute('start') || '1', 10);
          listParent.setAttribute('start', String(origStart + 1));
        }
        li.remove();
        if (listParent.parentNode) {
          listParent.parentNode.insertBefore(newP, listParent);
        }
      } else if (!nextSib) {
        li.remove();
        if (listParent.parentNode) {
          listParent.parentNode.insertBefore(newP, listParent.nextSibling);
        }
      } else {
        const nextList = document.createElement(listParent.tagName);
        if (listParent.className) nextList.className = listParent.className;
        if (listParent.tagName === 'OL') {
          let itemsBefore = 0;
          let walk = li.previousElementSibling;
          while (walk) {
            if (walk.tagName === 'LI') itemsBefore++;
            walk = walk.previousElementSibling;
          }
          const origStart = parseInt(listParent.getAttribute('start') || '1', 10);
          nextList.setAttribute('start', String(origStart + itemsBefore + 1));
        }

        let curr = li.nextSibling;
        while (curr) {
          const next = curr.nextSibling;
          nextList.appendChild(curr);
          curr = next;
        }
        li.remove();

        if (listParent.parentNode) {
          listParent.parentNode.insertBefore(newP, listParent.nextSibling);
          if (nextList.hasChildNodes()) {
            newP.parentNode.insertBefore(nextList, newP.nextSibling);
          }
        }
      }

      if (!listParent.querySelector('li')) {
        listParent.remove();
      }

      placeCaretAtStartOfNode(newP);
      setTimeout(() => {
        if (newP && newP.isConnected) {
          placeCaretAtStartOfNode(newP);
        }
      }, 0);

      if (typeof window.ensureTrailingTextBlock === 'function') {
        window.ensureTrailingTextBlock();
      }
      if (typeof window.resetActiveInlineFormatting === 'function') {
        window.resetActiveInlineFormatting();
      }
      if (typeof window.updateToolbarActiveStates === 'function') {
        window.updateToolbarActiveStates();
      }
      if (typeof window.recordAction === 'function') {
        window.recordAction('outdent-list-item', true);
      }
      if (typeof window.updateStats === 'function') {
        window.updateStats();
      }
      if (typeof window.scheduleAutosave === 'function') {
        window.scheduleAutosave();
      }
    }

    function removeBlankListItemAndFocusAbove(li, listParent) {
      if (!li || !listParent) return;

      if (window.commitCheckpoint) window.commitCheckpoint();

      const prevLi = li.previousElementSibling;
      const nextLi = li.nextElementSibling;
      const prevBlock = listParent.previousElementSibling;

      li.remove();

      const remainingLis = listParent.querySelectorAll('li');
      if (remainingLis.length === 0) {
        listParent.remove();
      }

      if (prevLi && prevLi.isConnected) {
        placeCaretAtEndOfNode(prevLi);
        setTimeout(() => {
          if (prevLi && prevLi.isConnected) placeCaretAtEndOfNode(prevLi);
        }, 0);
      } else if (prevBlock && prevBlock.isConnected) {
        placeCaretAtEndOfNode(prevBlock);
        setTimeout(() => {
          if (prevBlock && prevBlock.isConnected) placeCaretAtEndOfNode(prevBlock);
        }, 0);
      } else if (nextLi && nextLi.isConnected) {
        placeCaretAtStartOfNode(nextLi);
        setTimeout(() => {
          if (nextLi && nextLi.isConnected) placeCaretAtStartOfNode(nextLi);
        }, 0);
      } else {
        if (typeof window.ensureTrailingTextBlock === 'function') {
          window.ensureTrailingTextBlock();
        }
        const firstBlock = canvasProse.firstElementChild;
        if (firstBlock) {
          placeCaretAtStartOfNode(firstBlock);
          setTimeout(() => {
            if (firstBlock && firstBlock.isConnected) placeCaretAtStartOfNode(firstBlock);
          }, 0);
        }
      }

      if (typeof window.ensureTrailingTextBlock === 'function') {
        window.ensureTrailingTextBlock();
      }
      if (typeof window.resetActiveInlineFormatting === 'function') {
        window.resetActiveInlineFormatting();
      }
      if (typeof window.updateToolbarActiveStates === 'function') {
        window.updateToolbarActiveStates();
      }
      if (typeof window.recordAction === 'function') {
        window.recordAction('remove-blank-list-item', true);
      }
      if (typeof window.updateStats === 'function') {
        window.updateStats();
      }
      if (typeof window.scheduleAutosave === 'function') {
        window.scheduleAutosave();
      }
    }

    function isBlankListItem(li) {
      if (!li || li.tagName !== 'LI') return false;
      if (li.querySelector('img, video, audio, iframe, hr, table, button, svg, input, canvas, ul, ol')) {
        return false;
      }
      const text = (li.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '');
      return text.length === 0;
    }

    function exitListItemToNewParagraph(li, listParent) {
      if (!li || !listParent) return;

      if (window.commitCheckpoint) window.commitCheckpoint();

      const newP = document.createElement('p');
      newP.innerHTML = '<br>';
      newP.dataset.intentional = 'true';

      const prevSib = li.previousElementSibling;
      const nextSib = li.nextElementSibling;
      const listItems = Array.from(listParent.children).filter(el => el.tagName === 'LI');

      if (listItems.length <= 1) {
        // li is the only list item in this list element
        if (listParent.parentNode) {
          listParent.parentNode.replaceChild(newP, listParent);
        }
      } else if (!nextSib) {
        // li is the last item: keep preceding items, place newP after list
        li.remove();
        if (listParent.parentNode) {
          listParent.parentNode.insertBefore(newP, listParent.nextSibling);
        }
      } else if (!prevSib) {
        // li is the first item: keep following items, place newP before list
        if (listParent.tagName === 'OL' && listParent.hasAttribute('start')) {
          const origStart = parseInt(listParent.getAttribute('start') || '1', 10);
          listParent.setAttribute('start', String(origStart + 1));
        }
        li.remove();
        if (listParent.parentNode) {
          listParent.parentNode.insertBefore(newP, listParent);
        }
      } else {
        // li is in the middle: split list around newP
        const nextList = document.createElement(listParent.tagName);
        if (listParent.className) nextList.className = listParent.className;
        if (listParent.tagName === 'OL') {
          let itemsBefore = 0;
          let walk = li.previousElementSibling;
          while (walk) {
            if (walk.tagName === 'LI') itemsBefore++;
            walk = walk.previousElementSibling;
          }
          const origStart = parseInt(listParent.getAttribute('start') || '1', 10);
          nextList.setAttribute('start', String(origStart + itemsBefore));
        }

        let curr = li.nextSibling;
        while (curr) {
          const next = curr.nextSibling;
          nextList.appendChild(curr);
          curr = next;
        }
        li.remove();

        if (listParent.parentNode) {
          listParent.parentNode.insertBefore(newP, listParent.nextSibling);
          if (nextList.hasChildNodes()) {
            newP.parentNode.insertBefore(nextList, newP.nextSibling);
          }
        }
      }

      if (!listParent.querySelector('li')) {
        listParent.remove();
      }

      if (typeof window.ensureTrailingTextBlock === 'function') {
        window.ensureTrailingTextBlock();
      }

      placeCaretInBlock(newP, true);
      setTimeout(() => {
        if (newP && newP.isConnected) {
          placeCaretInBlock(newP, true);
        }
      }, 0);

      if (typeof window.resetActiveInlineFormatting === 'function') {
        window.resetActiveInlineFormatting();
      }
      if (typeof window.updateToolbarActiveStates === 'function') {
        window.updateToolbarActiveStates();
      }
      if (typeof window.recordAction === 'function') {
        window.recordAction('exit-list-to-paragraph', true);
      }
      if (typeof window.updateStats === 'function') {
        window.updateStats();
      }
      if (typeof window.scheduleAutosave === 'function') {
        window.scheduleAutosave();
      }
    }
    window.isBlankListItem = isBlankListItem;
    window.exitListItemToNewParagraph = exitListItemToNewParagraph;
    window.convertListItemToParagraph = convertListItemToParagraph;
    window.removeBlankListItemAndFocusAbove = removeBlankListItemAndFocusAbove;
    window.isCaretAtStartOfListItem = isCaretAtStartOfListItem;
    window.findEnclosingListItem = findEnclosingListItem;

    function removeEmptyEditableBlockSafely(topBlock, direction = 'backward') {
      if (!topBlock || topBlock.parentNode !== canvasProse) return;
      const prevSib = topBlock.previousElementSibling;
      const nextSib = topBlock.nextElementSibling;

      // If preceding block is a corrupted/empty non-text container, purge it immediately
      if (direction === 'backward' && prevSib && isNonTextBlock(prevSib)) {
        const isPrevEmpty = !prevSib.querySelector('img, iframe, video, button, svg') && !prevSib.textContent.trim();
        if (isPrevEmpty) {
          prevSib.remove();
          topBlock.innerHTML = '<br>';
          placeCaretInBlock(topBlock, true);
          if (typeof window.recordAction === 'function') window.recordAction('delete-block', true);
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }
      }

      // Forward delete on mandatory trailing text block has nothing in front, so do nothing!
      if (direction === 'forward' && !nextSib) {
        return;
      }

      // If topBlock is the تنها block on the entire canvas and is empty, keep it alive
      if (direction === 'backward' && !prevSib && !nextSib) {
        topBlock.innerHTML = '<br>';
        placeCaretInBlock(topBlock, true);
        return;
      }

      // If topBlock is an empty paragraph immediately after another editable text block,
      // remove ONLY this single empty line and move the caret to the end of prevSib!
      if (direction === 'backward' && prevSib && !isNonTextBlock(prevSib)) {
        if (window.commitCheckpoint) window.commitCheckpoint();
        topBlock.remove();
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        placeCaretAtEndOfNode(prevSib);
        if (typeof window.recordAction === 'function') window.recordAction('delete-empty-line', true);
        if (typeof window.updateStats === 'function') window.updateStats();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }

      // If topBlock is the mandatory trailing text block after a non-text block at the very end of canvasProse,
      // or if preceding block is an HR divider line, allow Backspace to select the preceding non-text block, or delete it if already selected.
      if (direction === 'backward' && (!nextSib || prevSib.tagName === 'HR' || (prevSib.classList && prevSib.classList.contains('canvas-divider'))) && isNonTextBlock(prevSib)) {
        if (prevSib.classList.contains('selected')) {
          if (typeof window.deleteBlock === 'function') {
            window.deleteBlock(prevSib);
          } else {
            prevSib.remove();
          }
          topBlock.innerHTML = '<br>';
          placeCaretInBlock(topBlock, true);
          if (typeof window.recordAction === 'function') window.recordAction('delete-block', true);
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }

        canvasProse.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        prevSib.classList.add('selected');
        window._lastActiveBlock = prevSib;
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      const rawTextClean = (topBlock.textContent || '').replace(/[\u200B-\u200D\uFEFF\s\u00A0]/g, '');
      const hasMediaInTop = Boolean(topBlock.querySelector && topBlock.querySelector('img, video, iframe, hr, audio'));
      const isTopEmpty = rawTextClean.length === 0 && !hasMediaInTop;

      // If forward delete toward following non-text block:
      // ONLY intercept with selecting the following block if topBlock actually has content.
      // If topBlock is empty, it MUST be removed, pulling the following block up!
      if (direction === 'forward' && nextSib && isNonTextBlock(nextSib) && !isTopEmpty) {
        if (nextSib.classList.contains('selected')) {
          if (typeof window.deleteBlock === 'function') {
            window.deleteBlock(nextSib);
          } else {
            nextSib.remove();
          }
          if (typeof window.recordAction === 'function') window.recordAction('delete-block', true);
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }

        canvasProse.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        nextSib.classList.add('selected');
        window._lastActiveBlock = nextSib;
        if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
        return;
      }

      if (window.commitCheckpoint) window.commitCheckpoint();

      // Find nearest surviving editable block to receive the caret
      let targetEditable = null;
      let placeAtStart = false;

      if (direction === 'backward') {
        let p = prevSib;
        while (p && isNonTextBlock(p)) {
          p = p.previousElementSibling;
        }
        if (p && !isNonTextBlock(p)) {
          targetEditable = p;
          placeAtStart = false;
        } else {
          let n = nextSib;
          while (n && isNonTextBlock(n)) {
            n = n.nextElementSibling;
          }
          if (n && !isNonTextBlock(n)) {
            targetEditable = n;
            placeAtStart = true;
          }
        }
      } else {
        // Forward delete on an empty block:
        // If nextSib is an editable text block, pull it up into topBlock's spot and place caret at its start.
        // If nextSib is a non-text block and prevSib is editable, keep caret above the non-text block.
        if (nextSib && !isNonTextBlock(nextSib)) {
          targetEditable = nextSib;
          placeAtStart = true;
        } else {
          let p = prevSib;
          while (p && isNonTextBlock(p)) {
            p = p.previousElementSibling;
          }
          if (p && !isNonTextBlock(p)) {
            targetEditable = p;
            placeAtStart = false;
          } else {
            let n = nextSib;
            while (n && isNonTextBlock(n)) {
              n = n.nextElementSibling;
            }
            if (n && !isNonTextBlock(n)) {
              targetEditable = n;
              placeAtStart = true;
            }
          }
        }
      }

      topBlock.remove();
      const trailing = (typeof window.ensureTrailingTextBlock === 'function') ? window.ensureTrailingTextBlock() : null;
      if (!targetEditable && trailing && !isNonTextBlock(trailing)) {
        targetEditable = trailing;
        placeAtStart = true;
      }

      if (targetEditable && targetEditable.isConnected) {
        placeCaretInBlock(targetEditable, placeAtStart);
      } else {
        try {
          const sel = window.getSelection();
          if (sel) sel.removeAllRanges();
        } catch (err) {}
      }

      if (typeof window.recordAction === 'function') window.recordAction('delete-empty-line', true);
      if (typeof window.updateStats === 'function') window.updateStats();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    }

    // Merges secondBlock into the end of firstBlock, keeping the caret at the exact join point
    function mergeTwoEditableBlocks(firstBlock, secondBlock) {
      if (!firstBlock || !secondBlock || !firstBlock.parentNode || !secondBlock.parentNode) return;
      const firstRaw = (firstBlock.textContent || '').replace(/[\u200B-\u200D\uFEFF\s\u00A0]/g, '');
      const firstHasMedia = Boolean(firstBlock.querySelector && firstBlock.querySelector('img, video, iframe, hr, audio'));
      const secondRaw = (secondBlock.textContent || '').replace(/[\u200B-\u200D\uFEFF\s\u00A0]/g, '');
      const secondHasMedia = Boolean(secondBlock.querySelector && secondBlock.querySelector('img, video, iframe, hr, audio'));

      if (firstRaw.length === 0 && !firstHasMedia) {
        if (window.commitCheckpoint) window.commitCheckpoint();
        firstBlock.remove();
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        placeCaretInBlock(secondBlock, true);
        if (typeof window.recordAction === 'function') window.recordAction('delete-empty-line', true);
        if (typeof window.updateStats === 'function') window.updateStats();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }

      if (secondRaw.length === 0 && !secondHasMedia) {
        if (!secondBlock.nextElementSibling) {
          placeCaretAtEndOfNode(firstBlock);
          return;
        }
        if (window.commitCheckpoint) window.commitCheckpoint();
        secondBlock.remove();
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        placeCaretAtEndOfNode(firstBlock);
        if (typeof window.recordAction === 'function') window.recordAction('delete-empty-line', true);
        if (typeof window.updateStats === 'function') window.updateStats();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }

      if (window.commitCheckpoint) window.commitCheckpoint();
      while (firstBlock.lastChild && firstBlock.lastChild.nodeType === Node.ELEMENT_NODE && firstBlock.lastChild.tagName === 'BR') {
        firstBlock.removeChild(firstBlock.lastChild);
      }

      const caretMarker = document.createElement('span');
      caretMarker.setAttribute('data-cedar-merge-caret', 'true');
      firstBlock.appendChild(caretMarker);

      if (secondBlock.tagName === 'UL' || secondBlock.tagName === 'OL') {
        const firstLi = secondBlock.querySelector('li');
        if (firstLi) {
          while (firstLi.firstChild) {
            if (firstLi.firstChild.nodeType === Node.ELEMENT_NODE && firstLi.firstChild.tagName === 'BR' && !firstLi.firstChild.nextSibling) {
              firstLi.removeChild(firstLi.firstChild);
              break;
            }
            firstBlock.appendChild(firstLi.firstChild);
          }
          firstLi.remove();
        }
        if (!secondBlock.querySelector('li')) {
          secondBlock.remove();
        }
      } else if (secondBlock.tagName === 'BLOCKQUOTE') {
        const innerP = secondBlock.querySelector('p') || secondBlock;
        while (innerP.firstChild) {
          if (innerP.firstChild.nodeType === Node.ELEMENT_NODE && innerP.firstChild.tagName === 'BR' && !innerP.firstChild.nextSibling) {
            innerP.removeChild(innerP.firstChild);
            break;
          }
          firstBlock.appendChild(innerP.firstChild);
        }
        if (innerP !== secondBlock) innerP.remove();
        if (!secondBlock.textContent.trim()) secondBlock.remove();
      } else {
        while (secondBlock.firstChild) {
          if (secondBlock.firstChild.nodeType === Node.ELEMENT_NODE && secondBlock.firstChild.tagName === 'BR' && !secondBlock.firstChild.nextSibling) {
            secondBlock.removeChild(secondBlock.firstChild);
            break;
          }
          firstBlock.appendChild(secondBlock.firstChild);
        }
        secondBlock.remove();
      }

      const sel = window.getSelection();
      if (sel && caretMarker.parentNode) {
        const r = document.createRange();
        if (caretMarker.previousSibling && caretMarker.previousSibling.nodeType === Node.TEXT_NODE) {
          r.setStart(caretMarker.previousSibling, caretMarker.previousSibling.nodeValue.length);
        } else if (caretMarker.nextSibling && caretMarker.nextSibling.nodeType === Node.TEXT_NODE) {
          r.setStart(caretMarker.nextSibling, 0);
        } else {
          r.setStartBefore(caretMarker);
        }
        r.collapse(true);
        caretMarker.remove();
        sel.removeAllRanges();
        sel.addRange(r);
        window._savedSelectionRange = r.cloneRange();
      } else if (caretMarker.parentNode) {
        caretMarker.remove();
      }

      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      if (typeof window.recordAction === 'function') window.recordAction('delete-merge', true);
      if (typeof window.updateStats === 'function') window.updateStats();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    }

    // Beforeinput safeguard: prevent browser native merge/delete of preceding/following non-text blocks or captions
    canvasProse.addEventListener('beforeinput', (e) => {
      const inputType = e.inputType || '';
      if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
        const selForList = window.getSelection();
        const li = findEnclosingListItem(selForList, e.target);
        if (li && canvasProse.contains(li) && isBlankListItem(li)) {
          const listParent = li.closest('ul, ol');
          if (listParent && canvasProse.contains(listParent)) {
            e.preventDefault();
            exitListItemToNewParagraph(li, listParent);
            return;
          }
        }
      }

      if (inputType.startsWith('delete')) {
        const selForList = window.getSelection();
        const li = findEnclosingListItem(selForList, e.target);
        if (li && canvasProse.contains(li)) {
          const listParent = li.closest('ul, ol');
          if (listParent && canvasProse.contains(listParent)) {
            if (isBlankListItem(li)) {
              if (inputType.includes('Backward') || inputType === 'deleteByCut') {
                e.preventDefault();
                removeBlankListItemAndFocusAbove(li, listParent);
                return;
              }
            }
            if (selForList && selForList.rangeCount) {
              const range = selForList.getRangeAt(0);
              if (inputType.includes('Backward') && isCaretAtStartOfListItem(li, range)) {
                e.preventDefault();
                convertListItemToParagraph(li, listParent);
                return;
              }
            }
          }
        }
        let captionEl = null;
        if (e.target && (e.target.tagName === 'FIGCAPTION' || (e.target.classList && e.target.classList.contains('gallery-caption')))) {
          captionEl = e.target;
        } else {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            let node = sel.anchorNode;
            if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            if (node && node.closest) captionEl = node.closest('figcaption, .gallery-caption');
          }
        }
        if (captionEl) {
          const text = (captionEl.textContent || '').trim();
          if (!text) {
            e.preventDefault();
            return;
          }
          const sel = window.getSelection();
          if (inputType.includes('Backward') && sel && sel.rangeCount && sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const isAtStart = (range.startOffset === 0) && (
              range.startContainer === captionEl ||
              range.startContainer === captionEl.firstChild ||
              (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0 && !range.startContainer.previousSibling)
            );
            if (isAtStart) {
              e.preventDefault();
              return;
            }
          }
        }

        // Guard top-level editable blocks adjacent to non-text blocks from Chromium native delete across contenteditable="false"
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const topBlock = getTopLevelEditableBlock(range.commonAncestorContainer);
          if (topBlock) {
            const prevSib = topBlock.previousElementSibling;
            const nextSib = topBlock.nextElementSibling;
            const rawText = (topBlock.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
            const hasMedia = Boolean(topBlock.querySelector && topBlock.querySelector('img, video, iframe, hr, audio'));

            if (range.collapsed) {
              const preRange = document.createRange();
              preRange.selectNodeContents(topBlock);
              preRange.setEnd(range.startContainer, range.startOffset);
              const preText = (preRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

              const postRange = document.createRange();
              postRange.selectNodeContents(topBlock);
              postRange.setStart(range.endContainer, range.endOffset);
              const postText = (postRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

              if (inputType.includes('Backward')) {
                if (rawText.length === 0 && !hasMedia) {
                  e.preventDefault();
                  removeEmptyEditableBlockSafely(topBlock, 'backward');
                  return;
                }
                if (preText.length === 0 && !hasMedia && prevSib && !isNonTextBlock(prevSib)) {
                  e.preventDefault();
                  mergeTwoEditableBlocks(prevSib, topBlock);
                  return;
                }
                if (preText.length === 0 && !hasMedia && !prevSib) {
                  e.preventDefault();
                  return;
                }
                if (preText.length === 0 && !hasMedia && isNonTextBlock(prevSib)) {
                  e.preventDefault();
                  if (rawText.trim().length === 0) {
                    removeEmptyEditableBlockSafely(topBlock, 'backward');
                  } else if (!prevSib.classList.contains('page-recent-posts-block')) {
                    if (typeof window.deleteBlock === 'function') window.deleteBlock(prevSib);
                    else prevSib.remove();
                    if (topBlock.isConnected) placeCaretInBlock(topBlock, true);
                  }
                  return;
                }
                if (preText.length === 1 && postText.length === 0 && !hasMedia && (isNonTextBlock(prevSib) || isNonTextBlock(nextSib))) {
                  e.preventDefault();
                  if (window.commitCheckpoint) window.commitCheckpoint();
                  topBlock.innerHTML = '<br>';
                  placeCaretInBlock(topBlock, true);
                  if (typeof window.updateStats === 'function') window.updateStats();
                  if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
                  return;
                }
              } else if (inputType.includes('Forward')) {
                if (!nextSib && postText.length === 0) {
                  e.preventDefault();
                  return;
                }
                const cleanRawText = (rawText || '').replace(/[\s\u00A0]/g, '');
                if (cleanRawText.length === 0 && !hasMedia) {
                  e.preventDefault();
                  if (nextSib && isNonTextBlock(nextSib) && !nextSib.classList.contains('page-recent-posts-block')) {
                    if (typeof window.deleteBlock === 'function') window.deleteBlock(nextSib);
                    else nextSib.remove();
                    if (topBlock.isConnected) placeCaretInBlock(topBlock, true);
                  } else {
                    removeEmptyEditableBlockSafely(topBlock, 'forward');
                  }
                  return;
                }
                if (postText.length === 0 && !hasMedia && isNonTextBlock(nextSib)) {
                  e.preventDefault();
                  if (!nextSib.classList.contains('page-recent-posts-block')) {
                    if (typeof window.deleteBlock === 'function') window.deleteBlock(nextSib);
                    else nextSib.remove();
                    if (topBlock.isConnected) placeCaretAtEndOfNode(topBlock);
                  }
                  return;
                }
                if (postText.length === 0 && !hasMedia && nextSib && !isNonTextBlock(nextSib)) {
                  e.preventDefault();
                  mergeTwoEditableBlocks(topBlock, nextSib);
                  return;
                }
                if (postText.length === 1 && preText.length === 0 && !hasMedia && isNonTextBlock(nextSib)) {
                  e.preventDefault();
                  if (window.commitCheckpoint) window.commitCheckpoint();
                  topBlock.innerHTML = '<br>';
                  placeCaretInBlock(topBlock, true);
                  if (typeof window.updateStats === 'function') window.updateStats();
                  if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
                  return;
                }
              }
            }
          }
        }
      }
    });

    // Keyboard handlers for captions, figure deletion, and block navigation
    canvasProse.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;

      // 0. If user is typing inside the Individual Post URL input, handle Enter/Escape and prevent prose shortcuts
      if (e.target && e.target.classList && e.target.classList.contains('individual-post-url-input')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const blockEl = e.target.closest('.page-individual-post-block');
          if (blockEl) applyIndividualPostUrlLink(blockEl);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          const blockEl = e.target.closest('.page-individual-post-block');
          if (blockEl && (blockEl.getAttribute('data-post-id') || blockEl.getAttribute('data-page-id') || blockEl.getAttribute('data-url'))) {
            delete blockEl.dataset.editingUrl;
            if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
              window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
            }
          }
          return;
        }
        e.stopPropagation();
        return;
      }

      if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key !== 'Meta' && e.key !== 'Escape') {
        if (((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)) && typeof ((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)).hide === 'function') {
          ((window.Cedar && window.Cedar.linkPopup) || (window.Outpost && window.Outpost.linkPopup)).hide();
        }
      }

      // Quote Block toggle: Ctrl+Q / Cmd+Q
      if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ') && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.toggleQuoteBlock === 'function') {
          window.toggleQuoteBlock();
        } else if (typeof window.swapCurrentBlock === 'function') {
          window.swapCurrentBlock('quote');
        }
        return;
      }

      // 1. Detect if active focus/caret is inside a caption (figcaption or gallery-caption)
      let captionEl = null;
      if (e.target && (e.target.tagName === 'FIGCAPTION' || (e.target.classList && e.target.classList.contains('gallery-caption')))) {
        captionEl = e.target;
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          let node = sel.anchorNode;
          if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          if (node && node.closest) {
            captionEl = node.closest('figcaption, .gallery-caption');
          }
        }
      }

      if (captionEl) {
        const isGalleryCap = captionEl.classList.contains('gallery-caption');
        const text = (captionEl.textContent || '').trim();
        const parentBlock = isGalleryCap ? captionEl.previousElementSibling : captionEl.closest('.captioned-image-container');

        // Backspace or Delete inside caption
        if (e.key === 'Backspace' || e.key === 'Delete') {
          // If empty caption, remove caption and refocus parent block without deleting parent block
          if (!text) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            captionEl.remove();
            if (parentBlock) {
              parentBlock.classList.remove('has-caption');
              parentBlock.classList.remove('selected');
              setTimeout(() => {
                if (parentBlock && parentBlock.parentNode) {
                  parentBlock.focus();
                }
              }, 0);
            }
            if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
            return;
          }

          // If caption has text, but cursor is collapsed at offset 0, prevent Backspace
          // from deleting/merging the preceding block (gallery/image)!
          const sel = window.getSelection();
          if (e.key === 'Backspace' && sel && sel.rangeCount && sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const isAtStart = (range.startOffset === 0) && (
              range.startContainer === captionEl ||
              range.startContainer === captionEl.firstChild ||
              (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0 && !range.startContainer.previousSibling)
            );
            if (isAtStart) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return;
            }
          }

          // If not empty and not at start: allow normal browser text deletion
          return;
        }

        // If user hits Escape in caption
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (!text) {
            captionEl.remove();
            if (parentBlock) {
              parentBlock.classList.remove('has-caption');
              parentBlock.classList.remove('selected');
            }
          }
          if (parentBlock) {
            setTimeout(() => {
              if (parentBlock && parentBlock.parentNode) {
                parentBlock.focus();
              }
            }, 0);
          }
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }

        // On Enter: if empty, remove caption and move to next paragraph; if not empty, move to next paragraph
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const targetToSplit = isGalleryCap ? captionEl : parentBlock;
          if (!text) {
            captionEl.remove();
            if (parentBlock) parentBlock.classList.remove('has-caption');
            if (parentBlock && typeof window.splitBlockToNewParagraph === 'function') {
              window.splitBlockToNewParagraph(parentBlock, canvasProse);
              return;
            }
          }
          if (targetToSplit && typeof window.splitBlockToNewParagraph === 'function') {
            window.splitBlockToNewParagraph(targetToSplit, canvasProse);
          }
          return;
        }

        // Any other key inside caption: allow normal typing
        return;
      }

      // 2. Delete selected or focused block on backspace / delete (when not inside an input/caption)
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const activeEl = document.activeElement;
        const isInCaptionOrInput = Boolean(activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'FIGCAPTION' ||
          (activeEl.classList && activeEl.classList.contains('gallery-caption')) ||
          (activeEl.closest && activeEl.closest('figcaption, .gallery-caption, input, textarea'))
        ));
        if (!isInCaptionOrInput) {
          const selGalleryItem = canvasProse.querySelector('.custom-gallery-item.selected-item, .custom-gallery-item.selected');
          if (selGalleryItem && canvasProse.contains(selGalleryItem)) {
            e._cedarBlockKeyHandled = true;
            e.preventDefault();
            e.stopPropagation();
            const galleryGrid = selGalleryItem.closest('.custom-gallery-grid');
            const idx = parseInt(selGalleryItem.dataset.index, 10);
            if (galleryGrid && !isNaN(idx) && typeof window.removeImageFromGallery === 'function') {
              window.removeImageFromGallery(galleryGrid, idx);
            } else if (galleryGrid) {
              selGalleryItem.remove();
              if (galleryGrid.querySelectorAll('.custom-gallery-item').length === 0) {
                if (typeof window.deleteBlock === 'function') window.deleteBlock(galleryGrid);
                else galleryGrid.remove();
              }
            }
            return;
          }

          const activeBlock = (activeEl && activeEl.closest ? activeEl.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider') : null);
          const selectedBlock = canvasProse.querySelector('.captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected, hr.selected, .canvas-divider.selected, .selected') ||
            (window._selectedImageBlock && canvasProse.contains(window._selectedImageBlock) && window._selectedImageBlock.classList.contains('selected') ? window._selectedImageBlock : null) ||
            activeBlock;
          if (selectedBlock && canvasProse.contains(selectedBlock)) {
            e._cedarBlockKeyHandled = true;
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.deleteBlock === 'function') {
              window.deleteBlock(selectedBlock);
            } else {
              selectedBlock.remove();
            }
            return;
          }
        }

        // 2A. List item (bullet or number) backspace / delete handling:
        // - If blank: Backspace removes this list item and returns cursor to end of text above it
        // - If has text & caret at line start: Backspace ends the bullet/numbered point for this line, converting to a paragraph
        const selForList = window.getSelection();
        let isSelectionCollapsedOrEmpty = true;
        if (selForList && selForList.rangeCount) {
          const range = selForList.getRangeAt(0);
          if (!range.collapsed) {
            isSelectionCollapsedOrEmpty = ((range.toString() || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '').length === 0);
          }
        }

        const liTarget = findEnclosingListItem(selForList, e.target);
        if (liTarget && canvasProse.contains(liTarget)) {
          const listParent = liTarget.closest('ul, ol');
          if (listParent && canvasProse.contains(listParent)) {
            if (isBlankListItem(liTarget) && isSelectionCollapsedOrEmpty) {
              e.preventDefault();
              e.stopPropagation();
              removeBlankListItemAndFocusAbove(liTarget, listParent);
              return;
            }
            if (e.key === 'Backspace' && selForList && selForList.rangeCount) {
              const range = selForList.getRangeAt(0);
              if (isCaretAtStartOfListItem(liTarget, range)) {
                e.preventDefault();
                e.stopPropagation();
                convertListItemToParagraph(liTarget, listParent);
                return;
              }
            }
          }
        }

        // 2B. Clean inline <code> and .cedar-custom-color Backspace handling
        const selInline = window.getSelection();
        if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey && selInline && selInline.rangeCount && selInline.isCollapsed) {
          const rangeInline = selInline.getRangeAt(0);
          let anchorNode = rangeInline.startContainer;
          if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) anchorNode = anchorNode.parentNode;

          const inlineCodeEl = (anchorNode && anchorNode.closest) ? anchorNode.closest('code:not(pre code)') : null;
          if (inlineCodeEl && canvasProse.contains(inlineCodeEl)) {
            const visibleCodeText = (inlineCodeEl.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
            const preCodeRange = document.createRange();
            preCodeRange.selectNodeContents(inlineCodeEl);
            preCodeRange.setEnd(rangeInline.startContainer, rangeInline.startOffset);
            const preCodeText = (preCodeRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

            const postCodeRange = document.createRange();
            postCodeRange.selectNodeContents(inlineCodeEl);
            postCodeRange.setStart(rangeInline.endContainer, rangeInline.endOffset);
            const postCodeText = (postCodeRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

            if (visibleCodeText.length === 0) {
              // Empty <code> chip -> remove <code> cleanly on Backspace
              e.preventDefault();
              e.stopPropagation();
              if (window.commitCheckpoint) window.commitCheckpoint();
              const parentBlock = inlineCodeEl.parentNode;
              const zwsp = document.createTextNode('\u200B');
              parentBlock.replaceChild(zwsp, inlineCodeEl);
              const newRange = document.createRange();
              newRange.setStart(zwsp, 1);
              newRange.collapse(true);
              selInline.removeAllRanges();
              selInline.addRange(newRange);
              window._savedSelectionRange = newRange.cloneRange();
              if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
              if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
              return;
            } else if (preCodeText.length === 1 && postCodeText.length === 0) {
              // Deleting the last visible character inside <code> -> keep <code> alive with \u200B
              // so Chromium doesn't destroy <code> or inject broken inline <span style="...">
              e.preventDefault();
              e.stopPropagation();
              if (window.commitCheckpoint) window.commitCheckpoint();
              const zwsp = document.createTextNode('\u200B');
              inlineCodeEl.innerHTML = '';
              inlineCodeEl.appendChild(zwsp);
              const newRange = document.createRange();
              newRange.setStart(zwsp, 1);
              newRange.collapse(true);
              selInline.removeAllRanges();
              selInline.addRange(newRange);
              window._savedSelectionRange = newRange.cloneRange();
              if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
              if (typeof window.updateStats === 'function') window.updateStats();
              if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
              return;
            }
          }

          const inlineMarkEl = (anchorNode && anchorNode.closest) ? anchorNode.closest('mark') : null;
          if (inlineMarkEl && canvasProse.contains(inlineMarkEl)) {
            const visibleMarkText = (inlineMarkEl.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
            if (visibleMarkText.length === 0) {
              e.preventDefault();
              e.stopPropagation();
              const parentBlock = inlineMarkEl.parentNode;
              const zwsp = document.createTextNode('\u200B');
              parentBlock.replaceChild(zwsp, inlineMarkEl);
              const newRange = document.createRange();
              newRange.setStart(zwsp, 1);
              newRange.collapse(true);
              selInline.removeAllRanges();
              selInline.addRange(newRange);
              window._savedSelectionRange = newRange.cloneRange();
              if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
              return;
            }
          }

          const inlineColorEl = (anchorNode && anchorNode.closest) ? anchorNode.closest('span.cedar-custom-color') : null;
          if (inlineColorEl && canvasProse.contains(inlineColorEl)) {
            const visibleColorText = (inlineColorEl.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
            if (visibleColorText.length === 0) {
              e.preventDefault();
              e.stopPropagation();
              const parentBlock = inlineColorEl.parentNode;
              const zwsp = document.createTextNode('\u200B');
              parentBlock.replaceChild(zwsp, inlineColorEl);
              const newRange = document.createRange();
              newRange.setStart(zwsp, 1);
              newRange.collapse(true);
              selInline.removeAllRanges();
              selInline.addRange(newRange);
              window._savedSelectionRange = newRange.cloneRange();
              if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
              return;
            }
          }
        }

        // 2C. When editing inside a top-level text block in canvasProse, protect adjacent non-text blocks
        // (images, galleries, videos, page blocks) from Chromium's native deleteContentBackward / deleteContentForward!
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const topBlock = getTopLevelEditableBlock(range.commonAncestorContainer);
          if (topBlock) {
            const prevSib = topBlock.previousElementSibling;
            const nextSib = topBlock.nextElementSibling;
            const rawText = (topBlock.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
            const hasMedia = Boolean(topBlock.querySelector && topBlock.querySelector('img, video, iframe, hr, audio'));

            if (range.collapsed) {
              const preRange = document.createRange();
              preRange.selectNodeContents(topBlock);
              preRange.setEnd(range.startContainer, range.startOffset);
              const preText = (preRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

              const postRange = document.createRange();
              postRange.selectNodeContents(topBlock);
              postRange.setStart(range.endContainer, range.endOffset);
              const postText = (postRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

              if (e.key === 'Backspace') {
                // Outdent on Backspace when caret is at the very start of an indented block
                const curIndent = parseInt(topBlock.getAttribute('data-indent') || '0', 10) || 0;
                if (preText.length === 0 && curIndent > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (typeof window.applyBlockIndent === 'function') {
                    window.applyBlockIndent('outdent');
                  } else {
                    if (curIndent > 1) topBlock.setAttribute('data-indent', String(curIndent - 1));
                    else topBlock.removeAttribute('data-indent');
                  }
                  return;
                }
                // Case 1: Block is already completely empty (<p><br></p>) -> remove 1 single empty line cleanly
                if (rawText.length === 0 && !hasMedia) {
                  e.preventDefault();
                  e.stopPropagation();
                  removeEmptyEditableBlockSafely(topBlock, 'backward');
                  return;
                }
                // Case 1B: Caret is at the very start of topBlock and previous sibling is a text block
                if (preText.length === 0 && !hasMedia && prevSib && !isNonTextBlock(prevSib)) {
                  e.preventDefault();
                  e.stopPropagation();
                  mergeTwoEditableBlocks(prevSib, topBlock);
                  return;
                }
                if (preText.length === 0 && !hasMedia && !prevSib) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                // Case 2: Caret is at the very beginning of topBlock (offset 0) and previous sibling is a non-text block
                if (preText.length === 0 && !hasMedia && isNonTextBlock(prevSib)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (rawText.trim().length === 0) {
                    removeEmptyEditableBlockSafely(topBlock, 'backward');
                  } else if (!prevSib.classList.contains('page-recent-posts-block')) {
                    if (typeof window.deleteBlock === 'function') window.deleteBlock(prevSib);
                    else prevSib.remove();
                    if (topBlock.isConnected) placeCaretInBlock(topBlock, true);
                  }
                  return;
                }
                // Case 3: Block has 1 character before caret and 0 after (e.g. a single space between two images),
                // so Backspace will empty the block. Replace with <br> cleanly instead of letting Chromium touch adjacent blocks.
                if (!e.ctrlKey && !e.metaKey && !e.altKey && preText.length === 1 && postText.length === 0 && !hasMedia && (isNonTextBlock(prevSib) || isNonTextBlock(nextSib))) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (window.commitCheckpoint) window.commitCheckpoint();
                  topBlock.innerHTML = '<br>';
                  placeCaretInBlock(topBlock, true);
                  if (typeof window.recordAction === 'function') window.recordAction('delete', false);
                  if (typeof window.updateStats === 'function') window.updateStats();
                  if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
                  return;
                }
              } else if (e.key === 'Delete') {
                // Forward delete: ONLY affects content IN FRONT (nextSib)!
                // If at the end of topBlock with nothing in front, Delete does nothing!
                if (!nextSib && postText.length === 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                const cleanRawText = (rawText || '').replace(/[\s\u00A0]/g, '');
                // Case 1: Block is completely empty (<p><br></p>) -> if nextSib is media, delete media; otherwise remove empty line cleanly
                if (cleanRawText.length === 0 && !hasMedia) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (nextSib && isNonTextBlock(nextSib) && !nextSib.classList.contains('page-recent-posts-block')) {
                    if (typeof window.deleteBlock === 'function') window.deleteBlock(nextSib);
                    else nextSib.remove();
                    if (topBlock.isConnected) placeCaretInBlock(topBlock, true);
                  } else {
                    removeEmptyEditableBlockSafely(topBlock, 'forward');
                  }
                  return;
                }
                // Case 2: Caret is at the very end of topBlock and next sibling is a non-text/media block -> delete that media block and pull everything below up a row
                if (postText.length === 0 && !hasMedia && isNonTextBlock(nextSib)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!nextSib.classList.contains('page-recent-posts-block')) {
                    if (typeof window.deleteBlock === 'function') window.deleteBlock(nextSib);
                    else nextSib.remove();
                    if (topBlock.isConnected) placeCaretAtEndOfNode(topBlock);
                  }
                  return;
                }
                // Case 2B: Caret is at the very end of topBlock and next sibling is a text block -> break nextSib and pull its words up into topBlock at the caret
                if (postText.length === 0 && !hasMedia && nextSib && !isNonTextBlock(nextSib)) {
                  e.preventDefault();
                  e.stopPropagation();
                  mergeTwoEditableBlocks(topBlock, nextSib);
                  return;
                }
                // Case 3: Block has 1 character after caret and 0 before, adjacent to a non-text block in front
                if (!e.ctrlKey && !e.metaKey && !e.altKey && postText.length === 1 && preText.length === 0 && !hasMedia && isNonTextBlock(nextSib)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (window.commitCheckpoint) window.commitCheckpoint();
                  topBlock.innerHTML = '<br>';
                  placeCaretInBlock(topBlock, true);
                  if (typeof window.recordAction === 'function') window.recordAction('delete', false);
                  if (typeof window.updateStats === 'function') window.updateStats();
                  if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
                  return;
                }
              }
            } else {
              // Non-collapsed selection inside topBlock: if selecting the entire text of topBlock while adjacent to a non-text block
              const preRange = document.createRange();
              preRange.selectNodeContents(topBlock);
              preRange.setEnd(range.startContainer, range.startOffset);
              const preText = (preRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

              const postRange = document.createRange();
              postRange.selectNodeContents(topBlock);
              postRange.setStart(range.endContainer, range.endOffset);
              const postText = (postRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

              if (preText.length === 0 && postText.length === 0 && !hasMedia && (isNonTextBlock(prevSib) || isNonTextBlock(nextSib))) {
                e.preventDefault();
                e.stopPropagation();
                if (window.commitCheckpoint) window.commitCheckpoint();
                topBlock.innerHTML = '<br>';
                placeCaretInBlock(topBlock, true);
                if (typeof window.recordAction === 'function') window.recordAction('delete', true);
                if (typeof window.updateStats === 'function') window.updateStats();
                if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
                return;
              }
            }
          }
        }
      }

      // 3. Universal Block Enter Handler:
      // Pressing enter from within any block starts a new text block (<p><br></p>) underneath it!
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        if (e.target.tagName === 'FIGCAPTION' || (e.target.classList && e.target.classList.contains('gallery-caption'))) return;

        // A. If a non-text block is currently selected or focused:
        const activeBlock = (document.activeElement && document.activeElement.closest ? document.activeElement.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider') : null);
        const selectedBlock = canvasProse.querySelector('.selected, .captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected, hr.selected, .canvas-divider.selected') || activeBlock;
        if (selectedBlock) {
          e.preventDefault();
          if (typeof window.splitBlockToNewParagraph === 'function') {
            window.splitBlockToNewParagraph(selectedBlock, canvasProse);
          }
          return;
        }

        // B. Standard block enter
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          let node = range.commonAncestorContainer;
          if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;

          // If inside a blank list item (bullet or number), exit cleanly to a new paragraph
          const li = findEnclosingListItem(sel, e.target);
          if (li && canvasProse.contains(li)) {
            const listParent = li.closest('ul, ol');
            if (listParent && canvasProse.contains(listParent)) {
              if (isBlankListItem(li)) {
                e.preventDefault();
                e.stopPropagation();
                exitListItemToNewParagraph(li, listParent);
                return;
              }
              // Non-blank list item: allow native list item continuation
              return;
            }
          }

          // If inside a list item (li) or list container, let native list continuation take place
          if (node && node.closest && node.closest('li, ul, ol')) {
            return;
          }

          // Find the enclosing top-level block inside canvasProse
          let topBlock = node;
          while (topBlock && topBlock.parentNode !== canvasProse && topBlock !== canvasProse && topBlock !== document.body) {
            topBlock = topBlock.parentNode;
          }

          if (topBlock) {
            if (topBlock.parentNode === canvasProse) {
              const raw = (topBlock.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
              if ((topBlock.tagName === 'P' || topBlock.tagName === 'DIV') && /^(\-{3,}|\*{3,}|\_{3,})$/.test(raw)) {
                e.preventDefault();
                window._lastActiveBlock = topBlock;
                if (typeof window.swapCurrentBlock === 'function') {
                  window.swapCurrentBlock('divider');
                  return;
                }
              }
              e.preventDefault();
              if (window.commitCheckpoint) window.commitCheckpoint();
              if (typeof window.splitBlockToNewParagraph === 'function') {
                window.splitBlockToNewParagraph(topBlock, canvasProse);
              }
              return;
            } else if (topBlock === canvasProse) {
              e.preventDefault();
              if (window.commitCheckpoint) window.commitCheckpoint();
              if (typeof window.splitBlockToNewParagraph === 'function') {
                window.splitBlockToNewParagraph(null, canvasProse);
              }
              return;
            }
          }
        }
      }

      // Allow ArrowRight at the end of inline <code> or <mark> to step out cleanly
      if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount && sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          let anchorEl = range.startContainer;
          if (anchorEl && anchorEl.nodeType === Node.TEXT_NODE) anchorEl = anchorEl.parentNode;
          const inlineCodeEl = (anchorEl && anchorEl.closest) ? anchorEl.closest('code:not(pre code), mark') : null;
          if (inlineCodeEl && canvasProse.contains(inlineCodeEl)) {
            const postRange = document.createRange();
            postRange.selectNodeContents(inlineCodeEl);
            postRange.setStart(range.endContainer, range.endOffset);
            const postText = postRange.toString();
            if (postText.length === 0) {
              const nextSib = inlineCodeEl.nextSibling;
              if (!nextSib || (nextSib.nodeType === Node.ELEMENT_NODE && nextSib.tagName === 'BR')) {
                e.preventDefault();
                const zwsp = document.createTextNode('\u200B');
                inlineCodeEl.parentNode.insertBefore(zwsp, inlineCodeEl.nextSibling);
                const newRange = document.createRange();
                newRange.setStart(zwsp, 1);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                window._savedSelectionRange = newRange.cloneRange();
                if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
                return;
              }
            }
          }
        }
      }

      // Allow Shift+Enter inside code blocks to insert a newline inside code
      if (e.key === 'Enter' && e.shiftKey && !e.isComposing) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          let node = sel.getRangeAt(0).commonAncestorContainer;
          if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          if (node && (node.tagName === 'PRE' || node.tagName === 'CODE' || (node.closest && node.closest('pre')))) {
            e.preventDefault();
            document.execCommand('insertText', false, '\n');
            return;
          }
        }
      }

      // 4. Auto-convert list shortcut when typing space after -, *, • or 1., 1)
      if (e.key === ' ' || e.code === 'Space') {
        const sel = window.getSelection();
        if (sel && sel.isCollapsed && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          let block = range.startContainer;
          if (block.nodeType === Node.TEXT_NODE) block = block.parentNode;
          while (block && block.parentNode !== canvasProse && block !== canvasProse && block !== document.body) {
            block = block.parentNode;
          }
          if (block && block.parentNode === canvasProse && (block.tagName === 'P' || block.tagName === 'DIV')) {
            let fullPreText = '';
            let preRange = null;
            try {
              preRange = document.createRange();
              preRange.setStart(block, 0);
              preRange.setEnd(range.startContainer, range.startOffset);
              fullPreText = preRange.toString();
            } catch (err) {
              fullPreText = range.startContainer.textContent ? range.startContainer.textContent.slice(0, range.startOffset) : '';
            }

            let isSubsequentLine = false;
            let lineTextBeforeCaret = '';

            const lastNl = Math.max(fullPreText.lastIndexOf('\n'), fullPreText.lastIndexOf('\r'));
            if (lastNl !== -1) {
              isSubsequentLine = true;
              lineTextBeforeCaret = fullPreText.slice(lastNl + 1).replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, ' ').trim();
            } else if (preRange) {
              const preFrag = preRange.cloneContents();
              const brList = preFrag.querySelectorAll('br');
              if (brList.length > 0) {
                isSubsequentLine = true;
                const lastBr = brList[brList.length - 1];
                let afterText = '';
                let node = lastBr.nextSibling;
                while (node) {
                  afterText += (node.textContent || '');
                  node = node.nextSibling;
                }
                lineTextBeforeCaret = afterText.replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, ' ').trim();
              } else {
                isSubsequentLine = false;
                lineTextBeforeCaret = fullPreText.replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, ' ').trim();
              }
            } else {
              isSubsequentLine = false;
              lineTextBeforeCaret = fullPreText.replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, ' ').trim();
            }

            let listType = null;
            if (/^[\*\-\+\u2022]$/.test(lineTextBeforeCaret)) {
              listType = 'ul';
            } else if (/^\d+[\.\)]$/.test(lineTextBeforeCaret)) {
              listType = 'ol';
            }

            if (listType) {
              e.preventDefault();
              if (window.commitCheckpoint) window.commitCheckpoint();

              // Extract any existing text or elements after the caret so they move into the new list item
              let fragment = null;
              try {
                const postRange = document.createRange();
                postRange.setStart(range.startContainer, range.startOffset);
                postRange.setEnd(block, block.childNodes.length);
                fragment = postRange.extractContents();
              } catch (err) {
                fragment = document.createDocumentFragment();
              }

              const newList = document.createElement(listType);
              if (block.style && block.style.textAlign) {
                newList.style.textAlign = block.style.textAlign;
              }
              const newLi = document.createElement('li');

              const hasText = fragment && (fragment.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '').length > 0;
              const hasElements = Boolean(fragment && fragment.querySelector && fragment.querySelector('img, video, audio, iframe, svg, canvas, input, hr, a, strong, b, em, i, u, s, code'));

              if (hasText || hasElements) {
                // Strip one or more leading whitespaces from the first text node in fragment
                let walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null, false);
                let firstTextNode = walker.nextNode();
                while (firstTextNode) {
                  if (firstTextNode.textContent) {
                    firstTextNode.textContent = firstTextNode.textContent.replace(/^[\u00A0\s]+/, '');
                    if (!firstTextNode.textContent && firstTextNode.parentNode) {
                      const p = firstTextNode.parentNode;
                      p.removeChild(firstTextNode);
                      walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null, false);
                      firstTextNode = walker.nextNode();
                      continue;
                    }
                  }
                  break;
                }
                newLi.appendChild(fragment);
                if (!newLi.hasChildNodes() || (!newLi.textContent.trim() && !newLi.querySelector('br, img'))) {
                  newLi.innerHTML = '<br>';
                }
              } else {
                newLi.innerHTML = '<br>';
              }

              newList.appendChild(newLi);

              if (isSubsequentLine) {
                // Remove the trigger characters from the text node containing the caret
                let targetTextNode = null;
                let targetOffset = range.startOffset;
                if (range.startContainer.nodeType === Node.TEXT_NODE) {
                  targetTextNode = range.startContainer;
                } else if (range.startContainer.childNodes && range.startOffset > 0) {
                  const prevChild = range.startContainer.childNodes[range.startOffset - 1];
                  if (prevChild && prevChild.nodeType === Node.TEXT_NODE) {
                    targetTextNode = prevChild;
                    targetOffset = prevChild.textContent.length;
                  }
                }
                if (targetTextNode) {
                  const nodeText = targetTextNode.textContent || '';
                  const beforeOffset = nodeText.slice(0, targetOffset);
                  const afterOffset = nodeText.slice(targetOffset);
                  const strippedBefore = beforeOffset.replace(/[\*\-\+\u2022\d\.\)\s\u00A0]+$/, '');
                  targetTextNode.textContent = strippedBefore + afterOffset;
                  if (!targetTextNode.textContent.length && targetTextNode.parentNode) {
                    targetTextNode.parentNode.removeChild(targetTextNode);
                  }
                }

                // Clean up any trailing whitespace and <br> nodes at the end of block
                while (block.lastChild) {
                  if (block.lastChild.nodeType === Node.TEXT_NODE && !block.lastChild.textContent.trim()) {
                    block.removeChild(block.lastChild);
                  } else if (block.lastChild.tagName === 'BR') {
                    block.removeChild(block.lastChild);
                  } else {
                    break;
                  }
                }
                if (!block.hasChildNodes() || !block.textContent.trim()) {
                  block.innerHTML = '<br>';
                }

                block.parentNode.insertBefore(newList, block.nextSibling);
              } else {
                block.parentNode.replaceChild(newList, block);
              }

              if (window.mergeAdjacentLists) {
                window.mergeAdjacentLists(canvasProse);
              }
              const targetLi = newLi.isConnected ? newLi : (newList.lastElementChild || newLi);

              // Position caret at the beginning of the list item text
              const newRange = document.createRange();
              let caretPlaced = false;
              const liWalker = document.createTreeWalker(targetLi, NodeFilter.SHOW_TEXT, null, false);
              const firstLiText = liWalker.nextNode();
              if (firstLiText) {
                newRange.setStart(firstLiText, 0);
                newRange.collapse(true);
                caretPlaced = true;
              }
              if (!caretPlaced) {
                newRange.selectNodeContents(targetLi);
                newRange.collapse(true);
              }
              sel.removeAllRanges();
              sel.addRange(newRange);
              window._savedSelectionRange = newRange.cloneRange();
              if (window.recordAction) window.recordAction('list-shortcut', true);
              if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
              return;
            }
          }
        }
      }
    });

    // Global fallback for selected/focused image container: Backspace deletes, Enter starts new text block,
    // and prevents browser back navigation outside editable text areas.
    if (!(window._hasCedarImageBlockKeydown || document._hasCedarImageBlockKeydown)) {
      window._hasCedarImageBlockKeydown = true;
      document._hasCedarImageBlockKeydown = true;

      function isCaretInEditableText(activeEl) {
        if (!activeEl) return false;
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return true;
        if (activeEl.tagName === 'FIGCAPTION' || (activeEl.classList && activeEl.classList.contains('gallery-caption'))) return true;
        if (activeEl.closest && activeEl.closest('figcaption, .gallery-caption, input, textarea')) return true;

        const ceTrue = activeEl.closest ? activeEl.closest('[contenteditable="true"]') : null;
        const ceFalse = activeEl.closest ? activeEl.closest('[contenteditable="false"]') : null;
        if (ceTrue && (!ceFalse || !ceTrue.contains(ceFalse) || !ceFalse.contains(activeEl))) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const anchor = sel.anchorNode;
            const anchorEl = anchor ? (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor) : null;
            if (anchorEl && anchorEl.closest && anchorEl.closest('[contenteditable="false"]')) {
              return false;
            }
          }
          return true;
        }

        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const anchor = sel.anchorNode;
          const anchorEl = anchor ? (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor) : null;
          const selCeTrue = anchorEl && anchorEl.closest ? anchorEl.closest('[contenteditable="true"]') : null;
          const selCeFalse = anchorEl && anchorEl.closest ? anchorEl.closest('[contenteditable="false"]') : null;
          if (selCeTrue && (!selCeFalse || !selCeTrue.contains(selCeFalse) || !selCeFalse.contains(anchorEl))) {
            return true;
          }
        }
        return false;
      }

      function handleGlobalBlockKeydown(e) {
        if (e._cedarBlockKeyHandled) return;
        const activeEl = document.activeElement;
        const isInCaptionOrInput = Boolean(activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'FIGCAPTION' ||
          (activeEl.classList && activeEl.classList.contains('gallery-caption')) ||
          (activeEl.closest && activeEl.closest('figcaption, .gallery-caption, input, textarea'))
        ));

        if (!isInCaptionOrInput) {
          // 1. Detect if a gallery item is explicitly selected
          const selGalleryItem = canvasProse ? canvasProse.querySelector('.custom-gallery-item.selected-item, .custom-gallery-item.selected') : null;
          const activeGalleryItem = (activeEl && activeEl.closest) ? activeEl.closest('.custom-gallery-item') : null;
          const targetGalleryItem = selGalleryItem || activeGalleryItem;

          if (targetGalleryItem && (e.key === 'Backspace' || e.key === 'Delete')) {
            e._cedarBlockKeyHandled = true;
            e.preventDefault();
            e.stopPropagation();
            const galleryGrid = targetGalleryItem.closest('.custom-gallery-grid');
            const idx = parseInt(targetGalleryItem.dataset.index, 10);
            if (galleryGrid && !isNaN(idx) && typeof window.removeImageFromGallery === 'function') {
              window.removeImageFromGallery(galleryGrid, idx);
            } else if (galleryGrid) {
              targetGalleryItem.remove();
              if (galleryGrid.querySelectorAll('.custom-gallery-item').length === 0) {
                if (typeof window.deleteBlock === 'function') window.deleteBlock(galleryGrid);
                else galleryGrid.remove();
              }
            }
            return;
          }

          // 2. Detect if an image, figure, or other non-text block is explicitly selected
          let explicitSelectedBlock = null;
          if (canvasProse) {
            explicitSelectedBlock = canvasProse.querySelector('.captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected, hr.selected, .canvas-divider.selected, .selected');
          }
          if (!explicitSelectedBlock && window._selectedImageBlock && document.contains(window._selectedImageBlock) && window._selectedImageBlock.classList.contains('selected')) {
            explicitSelectedBlock = window._selectedImageBlock;
          }

          if (explicitSelectedBlock) {
            if (e.key === 'Backspace' || e.key === 'Delete') {
              e._cedarBlockKeyHandled = true;
              e.preventDefault();
              e.stopPropagation();
              window._selectedImageBlock = null;
              window._lastActiveImageBlock = null;
              window._lastActiveBlock = null;
              if (typeof window.deleteBlock === 'function') {
                window.deleteBlock(explicitSelectedBlock);
              } else {
                explicitSelectedBlock.remove();
              }
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e._cedarBlockKeyHandled = true;
              e.preventDefault();
              e.stopPropagation();
              if (typeof window.splitBlockToNewParagraph === 'function') {
                window.splitBlockToNewParagraph(explicitSelectedBlock, canvasProse);
              }
              return;
            }
          }
        }

        const inEditable = isCaretInEditableText(activeEl);

        // Protect user from browser history back navigation when pressing Backspace outside text editing
        if (e.key === 'Backspace' && !inEditable) {
          e.preventDefault();
        }

        if (inEditable) return;

        // 2. Detect if an image, figure, or other non-text block is targeted
        let targetBlock = null;

        if (activeEl && activeEl.closest) {
          targetBlock = activeEl.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider');
        }

        if (!targetBlock && canvasProse) {
          targetBlock = canvasProse.querySelector('.captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected, hr.selected, .canvas-divider.selected, .selected');
        }

        if (!targetBlock && window._selectedImageBlock && document.contains(window._selectedImageBlock) && window._selectedImageBlock.classList.contains('selected')) {
          targetBlock = window._selectedImageBlock;
        }

        if (!targetBlock) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const anchor = sel.anchorNode;
            const anchorEl = anchor ? (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor) : null;
            if (anchorEl && anchorEl.closest) {
              targetBlock = anchorEl.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider');
            }
          }
        }

        if (targetBlock) {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e._cedarBlockKeyHandled = true;
            e.preventDefault();
            e.stopPropagation();
            window._selectedImageBlock = null;
            window._lastActiveImageBlock = null;
            window._lastActiveBlock = null;
            if (typeof window.deleteBlock === 'function') {
              window.deleteBlock(targetBlock);
            } else {
              targetBlock.remove();
            }
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e._cedarBlockKeyHandled = true;
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.splitBlockToNewParagraph === 'function') {
              window.splitBlockToNewParagraph(targetBlock, canvasProse);
            }
            return;
          }
        }
      }

      window.addEventListener('keydown', handleGlobalBlockKeydown, false);
      document.addEventListener('keydown', handleGlobalBlockKeydown, false);
    }

    // Input / typing ensures trailing text block & maintains 1/3rd bottom window space
    canvasProse.addEventListener('input', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('individual-post-url-input')) {
        return;
      }

      // 1. Clean up zero-width space placeholders (\u200B) once real characters are typed into the same text node
      const selForCleanup = window.getSelection();
      let activeTextNode = null;
      let activeOffset = 0;
      if (selForCleanup && selForCleanup.rangeCount && selForCleanup.isCollapsed) {
        const r = selForCleanup.getRangeAt(0);
        if (r.startContainer && r.startContainer.nodeType === Node.TEXT_NODE) {
          activeTextNode = r.startContainer;
          activeOffset = r.startOffset;
        }
      }

      const textWalker = document.createTreeWalker(canvasProse, NodeFilter.SHOW_TEXT, null, false);
      const textNodesToClean = [];
      let tNode = textWalker.nextNode();
      while (tNode) {
        if (tNode.nodeValue && tNode.nodeValue.length > 1 && tNode.nodeValue.includes('\u200B')) {
          const withoutZwsp = tNode.nodeValue.replace(/\u200B/g, '');
          if (withoutZwsp.length > 0) {
            textNodesToClean.push(tNode);
          }
        }
        tNode = textWalker.nextNode();
      }

      textNodesToClean.forEach(node => {
        const orig = node.nodeValue;
        if (node === activeTextNode) {
          const beforeCaret = orig.slice(0, activeOffset);
          const removedBefore = (beforeCaret.match(/\u200B/g) || []).length;
          node.nodeValue = orig.replace(/\u200B/g, '');
          const newOffset = Math.max(0, Math.min(node.nodeValue.length, activeOffset - removedBefore));
          try {
            const newRange = document.createRange();
            newRange.setStart(node, newOffset);
            newRange.collapse(true);
            selForCleanup.removeAllRanges();
            selForCleanup.addRange(newRange);
            window._savedSelectionRange = newRange.cloneRange();
          } catch (err) {}
        } else {
          node.nodeValue = orig.replace(/\u200B/g, '');
        }
      });

      // 2. Strip any Chromium-injected inline style spans (<span style="..."> / <font>) that are NOT .cedar-custom-color
      // (Chromium's DeleteSelectionCommand injects <span style="background-color:...; color:...;"> when backspacing across inline tags)
      canvasProse.querySelectorAll('span[style], font').forEach(el => {
        if (el.closest('[contenteditable="false"]')) return;
        if (el.tagName === 'SPAN' && el.classList.contains('cedar-custom-color') && el.getAttribute('data-custom-color')) {
          const customHex = el.getAttribute('data-custom-color');
          const td = (el.style.textDecoration || el.style.textDecorationLine || '').toLowerCase();
          if (td.includes('underline') && !el.closest('u')) {
            const alreadyU = el.children.length === 1 && el.childNodes.length === 1 && el.firstElementChild.tagName === 'U';
            if (!alreadyU) {
              const u = document.createElement('u');
              while (el.firstChild) {
                u.appendChild(el.firstChild);
              }
              el.appendChild(u);
            }
          }
          if (el.style.backgroundColor || el.style.fontFamily || el.style.fontSize || el.style.textDecoration || el.style.textDecorationLine || el.style.textDecorationColor) {
            el.removeAttribute('style');
            el.style.color = customHex;
          }
          return;
        }
        const parent = el.parentNode;
        if (parent) {
          const fw = (el.style && el.style.fontWeight) ? String(el.style.fontWeight).toLowerCase() : '';
          const td = (el.style && (el.style.textDecoration || el.style.textDecorationLine)) ? String(el.style.textDecoration || el.style.textDecorationLine).toLowerCase() : '';
          const isBoldSpan = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600;
          const isUnderlineSpan = td.includes('underline');
          if (isBoldSpan && !el.closest('strong, b, h1, h2, h3, h4')) {
            const strong = document.createElement('strong');
            while (el.firstChild) {
              strong.appendChild(el.firstChild);
            }
            parent.replaceChild(strong, el);
          } else if (isUnderlineSpan && !el.closest('u')) {
            const u = document.createElement('u');
            while (el.firstChild) {
              u.appendChild(el.firstChild);
            }
            parent.replaceChild(u, el);
          } else {
            while (el.firstChild) {
              parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
          }
        }
      });

      if (typeof window.normalizeCustomColorNodes === 'function') {
        window.normalizeCustomColorNodes(canvasProse);
      }

      // Check for horizontal rule (divider) shortcut: ---, ***, or ___ in a block
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        let block = sel.anchorNode;
        if (block && block.nodeType === Node.TEXT_NODE) block = block.parentNode;
        while (block && block.parentNode !== canvasProse && block !== canvasProse && block !== document.body) {
          block = block.parentNode;
        }
        if (block && block.parentNode === canvasProse && (block.tagName === 'P' || block.tagName === 'DIV')) {
          const raw = (block.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
          if (/^(\-{3,}|\*{3,}|\_{3,})$/.test(raw)) {
            window._lastActiveBlock = block;
            if (typeof window.swapCurrentBlock === 'function') {
              window.swapCurrentBlock('divider');
              return;
            }
          }
        }
      }

      if (typeof window.normalizeRawImages === 'function') {
        window.normalizeRawImages(canvasProse);
      }
      if (typeof window.ensureTrailingTextBlock === 'function') {
        window.ensureTrailingTextBlock();
      }
      if (typeof window.maintainCaretScrollBuffer === 'function') {
        window.maintainCaretScrollBuffer();
      }
    });

    // Click below post in canvas container focuses trailing text block
    const scrollContainer = document.querySelector('.canvas-scroll-container');
    if (scrollContainer && !scrollContainer._hasCedarHeadroomListener) {
      scrollContainer._hasCedarHeadroomListener = true;
      let lastScrollTop = scrollContainer.scrollTop || 0;
      let ticking = false;
      const editorView = document.getElementById('view-editor');

      scrollContainer.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const currentScrollTop = Math.max(0, scrollContainer.scrollTop || 0);
            const scrollDelta = currentScrollTop - lastScrollTop;

            if (window.innerWidth <= 768 && editorView) {
              if (currentScrollTop <= 15) {
                editorView.classList.remove('editor-header-hidden');
              } else if (scrollDelta > 6 && currentScrollTop > 50) {
                editorView.classList.add('editor-header-hidden');
              } else if (scrollDelta < -6) {
                editorView.classList.remove('editor-header-hidden');
              }
            } else if (editorView) {
              editorView.classList.remove('editor-header-hidden');
            }

            lastScrollTop = currentScrollTop;
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    }

    if (scrollContainer && !(scrollContainer._hasCedarTrailingClickListener || scrollContainer._hasOutpostTrailingClickListener)) {
      scrollContainer._hasCedarTrailingClickListener = true;
      scrollContainer._hasOutpostTrailingClickListener = true;
      scrollContainer.addEventListener('click', (ev) => {
        // 1. Do not interrupt active text selection
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().length > 0) {
          return;
        }

        if (ev.target.closest('#rich-canvas-title') ||
            ev.target.closest('#rich-canvas-subtitle') ||
            ev.target.closest('.toolbar-btn') ||
            ev.target.closest('.figure-action-btn') ||
            ev.target.closest('figcaption') ||
            ev.target.closest('.share-block-card') ||
            ev.target.closest('.page-recent-posts-block') ||
            ev.target.closest('.page-individual-post-block')) {
          return;
        }

        // In Markdown Mode: clicking below text focuses the end of markdown-input
        if (window.activeMode === 'markdown') {
          const mdInput = document.getElementById('markdown-input');
          if (mdInput) {
            const rect = mdInput.getBoundingClientRect();
            if (ev.clientY > rect.bottom + 5) {
              mdInput.focus();
              mdInput.selectionStart = mdInput.value.length;
              mdInput.selectionEnd = mdInput.value.length;
              if (typeof window.maintainCaretScrollBuffer === 'function') {
                window.maintainCaretScrollBuffer();
              }
            }
          }
          return;
        }

        // 2. Only handle clicks strictly below the bottom of the article prose content
        const lastEl = canvasProse.lastElementChild;
        if (lastEl) {
          if (lastEl.classList.contains('page-recent-posts-block')) {
            return;
          }
          const rect = lastEl.getBoundingClientRect();
          if (ev.clientY <= rect.bottom + 5) {
            return;
          }
        }

        if (ev.target === scrollContainer ||
            ev.target.classList.contains('focused-writing-container') ||
            ev.target.classList.contains('article-wrapper') ||
            ev.target.classList.contains('article-container') ||
            ev.target === canvasProse) {
          document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block, .page-recent-posts-block, .page-individual-post-block, hr, .canvas-divider, .selected, .selected-item').forEach(c => c.classList.remove('selected', 'selected-item'));
          window._selectedImageBlock = null;
          window._lastActiveImageBlock = null;
          const trailingP = typeof window.ensureTrailingTextBlock === 'function' ? window.ensureTrailingTextBlock() : null;
          if (trailingP && typeof window.focusNodeCaret === 'function') {
            window.focusNodeCaret(trailingP, false);
            if (typeof window.maintainCaretScrollBuffer === 'function') {
              window.maintainCaretScrollBuffer();
            }
          }
        }
      });
    }

    // Initialize block drag-and-drop
    if (!(canvasProse._hasCedarDragListener || canvasProse._hasOutpostDragListener)) {
      canvasProse._hasCedarDragListener = true;
      canvasProse._hasOutpostDragListener = true;
      if (typeof window.setupBlockDragAndDrop === 'function') {
        window.setupBlockDragAndDrop(canvasProse);
      }
    }

    // Paste handler for figcaption and Smart URL pasting
    canvasProse.addEventListener('paste', (e) => {
      if (e.target && e.target.closest && e.target.closest('input, textarea')) {
        return;
      }

      if (e.target.tagName === 'FIGCAPTION' || (e.target.classList && e.target.classList.contains('gallery-caption'))) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
        document.execCommand('insertText', false, cleanText);
        return;
      }

      if (e._cedarImageHandled || e._outpostImageHandled) return;

      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;
      const pastedText = (clipboardData.getData('text/plain') || '').trim();

      function isPastedUrl(text) {
        if (!text) return false;
        const str = text.trim();
        if (/\s/.test(str)) return false;
        if (/\.(png|jpe?g|webp|gif|svg|avif)(\?[^\s]*)?$/i.test(str)) return false;
        if (/^https?:\/\/[^\s]+$/i.test(str)) return true;
        if (/^www\.[a-z0-9\-]+(\.[a-z0-9\-]+)+([/?#][^\s]*)?$/i.test(str)) return true;
        if (/^[a-z0-9\-]+(\.[a-z0-9\-]+)+([/?#][^\s]*)?$/i.test(str) && !str.includes('@')) return true;
        if (/^\/(blog|posts|pages|category)?\/[a-z0-9\-_/]+$/i.test(str)) return true;
        try {
          const parsed = new URL(str.includes('://') ? str : `https://${str}`);
          return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname && parsed.hostname.includes('.'));
        } catch (err) {
          return false;
        }
      }

      if (isPastedUrl(pastedText)) {
        let formattedUrl = pastedText;
        if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://') && !formattedUrl.startsWith('/')) {
          formattedUrl = 'https://' + formattedUrl;
        }

        const sel = window.getSelection();
        const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;

        // Scenario 3: Highlighted text within a text body -> become Hyperlink Text
        if (hasSelection) {
          e.preventDefault();
          e.stopPropagation();
          document.execCommand('createLink', false, formattedUrl);
          const anchor = (sel.anchorNode && sel.anchorNode.closest) ? sel.anchorNode.closest('a') : (sel.anchorNode && sel.anchorNode.parentNode?.closest('a'));
          if (anchor) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noopener noreferrer');
          }
          if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Hyperlink attached to text');
          return;
        }

        // Find top block inside canvasProse
        let currentBlock = null;
        if (sel && sel.rangeCount > 0) {
          let node = sel.getRangeAt(0).startContainer;
          if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          while (node && node.parentNode !== canvasProse && node !== canvasProse) {
            node = node.parentNode;
          }
          if (node && node.parentNode === canvasProse) {
            currentBlock = node;
          }
        }
        if (!currentBlock && e.target && e.target !== canvasProse && canvasProse.contains(e.target)) {
          let node = e.target;
          while (node && node.parentNode !== canvasProse && node !== canvasProse) {
            node = node.parentNode;
          }
          if (node && node.parentNode === canvasProse) {
            currentBlock = node;
          }
        }

        function isBlankTextBlock(block) {
          if (!block) return false;
          if (block.classList && (
            block.classList.contains('captioned-image-container') ||
            block.classList.contains('custom-gallery-grid') ||
            block.classList.contains('page-individual-post-block') ||
            block.classList.contains('page-recent-posts-block') ||
            block.classList.contains('video-wrapper') ||
            block.classList.contains('article-share-block') ||
            block.classList.contains('article-rss-block')
          )) {
            return false;
          }
          const text = (block.textContent || '').trim();
          if (text.length > 0) return false;
          const nonBrElements = Array.from(block.children).filter(ch => ch.tagName !== 'BR');
          if (nonBrElements.length > 0) return false;
          return true;
        }

        // Scenario 1: Blank text box -> instantly turn into the URL box!
        if (currentBlock && isBlankTextBlock(currentBlock)) {
          e.preventDefault();
          e.stopPropagation();

          if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();

          const temp = document.createElement('div');
          temp.innerHTML = (typeof window.createIndividualPostBlockHtml === 'function')
            ? window.createIndividualPostBlockHtml('', 'grid', '', { 'data-url': formattedUrl })
            : `<div class="page-individual-post-block" data-block-type="individual-post" data-layout="grid" data-url="${formattedUrl}" contenteditable="false" draggable="true"></div>`;

          const blockEl = temp.firstElementChild;
          currentBlock.parentNode.replaceChild(blockEl, currentBlock);

          if (typeof window.hydrateSingleIndividualPostBlock === 'function') {
            window.hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
          }

          const urlInput = blockEl.querySelector('.individual-post-url-input');
          if (urlInput) {
            urlInput.value = formattedUrl;
          }

          if (typeof applyIndividualPostUrlLink === 'function') {
            applyIndividualPostUrlLink(blockEl, formattedUrl);
          } else if (typeof window.applyIndividualPostUrlLink === 'function') {
            window.applyIndividualPostUrlLink(blockEl, formattedUrl);
          }

          if (typeof window.ensureTrailingTextBlock === 'function') {
            window.ensureTrailingTextBlock();
          }
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }

        // Scenario 2: Body of text with collapsed selection -> insert hyperlink text
        if (sel && sel.rangeCount > 0) {
          e.preventDefault();
          e.stopPropagation();

          const range = sel.getRangeAt(0);
          range.deleteContents();

          const a = document.createElement('a');
          a.href = formattedUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = pastedText;

          range.insertNode(a);

          const afterRange = document.createRange();
          afterRange.setStartAfter(a);
          afterRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(afterRange);

          if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Hyperlink inserted');
          return;
        }
      }
    });

    // Focusout / blur handler on figcaption and gallery-caption: if empty, undoes itself!
    canvasProse.addEventListener('focusout', (e) => {
      if (e.target && (e.target.tagName === 'FIGCAPTION' || (e.target.classList && e.target.classList.contains('gallery-caption')))) {
        const captionEl = e.target;
        const isGalleryCap = captionEl.classList.contains('gallery-caption');
        const container = isGalleryCap ? captionEl.previousElementSibling : captionEl.closest('.captioned-image-container');
        const text = (captionEl.textContent || '').trim();
        if (!text || text === 'Add caption here...' || text === 'Add image caption here...') {
          captionEl.remove();
          if (container) {
            container.classList.remove('has-caption');
          }
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        } else {
          if (container) {
            container.classList.add('has-caption');
          }
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
      }
    });

    // Ensure caret in empty figcaption / gallery-caption is centered
    canvasProse.addEventListener('click', (e) => {
      const cap = e.target.closest ? e.target.closest('figcaption, .gallery-caption') : null;
      if (cap && (!cap.textContent || !cap.textContent.trim())) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(cap);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    canvasProse.addEventListener('focusin', (e) => {
      const cap = (e.target && (e.target.tagName === 'FIGCAPTION' || (e.target.classList && e.target.classList.contains('gallery-caption')))) ? e.target : null;
      if (cap && (!cap.textContent || !cap.textContent.trim())) {
        setTimeout(() => {
          if (document.activeElement === cap && (!cap.textContent || !cap.textContent.trim())) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(cap);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }, 0);
      }
    });

    // Export list helpers for testability and external access
    window.findEnclosingListItem = findEnclosingListItem;
    window.isCaretAtStartOfListItem = isCaretAtStartOfListItem;
    window.isBlankListItem = isBlankListItem;
    window.removeBlankListItemAndFocusAbove = removeBlankListItemAndFocusAbove;
    window.convertListItemToParagraph = convertListItemToParagraph;
    window.exitListItemToNewParagraph = exitListItemToNewParagraph;

    // Ensure caption buttons and states are synchronized for existing images
    if (typeof window.ensureImageCaptionElements === 'function') {
      window.ensureImageCaptionElements(canvasProse);
    }
  }

  // =========================================================================
  // GLOBAL & NAMESPACE EXPORTS
  // =========================================================================

  window.deleteCurrentBlock = deleteCurrentBlock;
  window.setupRichTextFormatting = setupRichTextFormatting;
  window.applyIndividualPostUrlLink = applyIndividualPostUrlLink;

  const canvasExports = {
    deleteCurrentBlock,
    setupRichTextFormatting,
    applyIndividualPostUrlLink,
    findEnclosingListItem: (...args) => (window.findEnclosingListItem ? window.findEnclosingListItem(...args) : null),
    isCaretAtStartOfListItem: (...args) => (window.isCaretAtStartOfListItem ? window.isCaretAtStartOfListItem(...args) : false),
    isBlankListItem: (...args) => (window.isBlankListItem ? window.isBlankListItem(...args) : false),
    removeBlankListItemAndFocusAbove: (...args) => (window.removeBlankListItemAndFocusAbove ? window.removeBlankListItemAndFocusAbove(...args) : null),
    convertListItemToParagraph: (...args) => (window.convertListItemToParagraph ? window.convertListItemToParagraph(...args) : null),
    exitListItemToNewParagraph: (...args) => (window.exitListItemToNewParagraph ? window.exitListItemToNewParagraph(...args) : null)
  };

  window.Cedar.editor = Object.assign(window.Cedar.editor || {}, canvasExports);
  window.Outpost.editor = window.Cedar.editor;
})();
