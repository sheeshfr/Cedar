/**
 * Cedar - Media Engine (Figures, Galleries, Lightboxes & Sanitized Uploads)
 * Module: js/editor/media.js
 * 
 * Responsibilities:
 * - Single figure and custom gallery grid HTML markup generation
 * - Dynamic side-by-side slot expansion, placeholder slots, and slot cancel/populate
 * - Gallery rotation reordering and item removal / degradation back to single figure
 * - Image block detection and multi-image merging
 * - 3-Column Editor Media Picker popup (Draft images, library images, search, selection)
 * - Dialog confirm handlers (Image URL, YouTube video, multi-image gallery, adjacent post links)
 * - Clipboard and desktop file drop image upload and client-side sanitization
 * - Safe HTML block/inline insertion at cursor (insertHtmlAtCursor)
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  const escapeHtml = window.escapeHtml || function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // =========================================================================
  // FIGURE & GALLERY HTML GENERATION
  // =========================================================================

  /**
   * Generates clean HTML markup for a standalone captioned image block.
   */
  function createFigureHtml(imgSrc, originalSrc, imgName, altText, caption, size = 'full', scaleWidth = '', pixelated = false) {
    const trimmedCaption = (caption || '').trim();
    const hasCaption = trimmedCaption.length > 0 && trimmedCaption !== 'Add caption here...' && trimmedCaption !== 'Add image caption here...';
    const scaleAttr = scaleWidth ? ` data-scale-width="${escapeHtml(scaleWidth)}"` : '';
    const pixAttr = pixelated ? ` data-pixelated="true"` : '';
    const figStyle = scaleWidth ? ` style="width: ${escapeHtml(scaleWidth)}; max-width: 100%;"` : '';
    const wrapStyle = scaleWidth ? ` style="width: 100%; max-width: 100%;"` : '';
    const imgStyle = `style="${scaleWidth ? 'width: 100%; max-width: 100%;' : ''}${pixelated ? ' image-rendering: pixelated;' : ''}"`;
    return `<div class="captioned-image-container${hasCaption ? ' has-caption' : ''}" data-size="${size}"${scaleAttr}${pixAttr} contenteditable="false" draggable="true" tabindex="0">
      <figure${figStyle}>
        <div class="image-media-wrapper"${wrapStyle}>
          <button type="button" class="image-side-add-btn side-left" data-side="left" title="Add picture to the left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <img src="${escapeHtml(imgSrc)}" data-original-src="${escapeHtml(originalSrc)}" data-img-name="${escapeHtml(imgName)}" alt="${escapeHtml(altText)}" ${imgStyle} loading="lazy" draggable="false">
          <button type="button" class="image-side-add-btn side-right" data-side="right" title="Add picture to the right">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <div class="figure-hover-actions">
            <button type="button" class="figure-action-btn btn-scale-img-down" title="Decrease Image Scale (-)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button type="button" class="figure-action-btn btn-scale-img-up" title="Increase Image Scale (+)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
          <button type="button" class="image-add-caption-btn" title="Add Caption">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Caption</span>
          </button>
        </div>${hasCaption ? `
        <figcaption contenteditable="true" placeholder="Add caption here...">${escapeHtml(trimmedCaption)}</figcaption>` : ''}
      </figure>
    </div>`;
  }

  /**
   * Generates clean HTML markup for a multi-picture gallery grid.
   */
  function createGalleryHtml(images, isEditor = true) {
    const count = images.length;
    if (count === 0) return '';
    const hasPlaceholder = images.some(im => im && im.isPlaceholder);
    const countAttr = count >= 5 ? 'more' : count.toString();
    let itemsHtml = '';

    const renderControls = (idx) => isEditor ? `
      <div class="gallery-item-controls">
        <button type="button" class="gallery-item-btn btn-move-item-left" data-index="${idx}" title="Move backward in rotation">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <button type="button" class="gallery-item-btn btn-move-item-right" data-index="${idx}" title="Move forward in rotation">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
      <button type="button" class="image-add-caption-btn" data-index="${idx}" title="Add Caption">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>Add Caption</span>
      </button>` : '';

    const renderItem = (img, idx) => {
      if (img && img.isPlaceholder) {
        return `<div class="custom-gallery-item gallery-slot-placeholder" data-index="${idx}" tabindex="0" title="Click to choose image, paste (Ctrl+V), or drag an image here">
          <button type="button" class="btn-cancel-placeholder" title="Cancel">&times;</button>
          <div class="gallery-placeholder-inner">
            <div class="placeholder-icon-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </div>
            <span class="placeholder-title">+ Add Image</span>
            <button type="button" class="btn-slot-choose-media">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <span>Choose Media</span>
            </button>
            <span class="placeholder-subtitle">Paste, drop, or drag an image here</span>
          </div>
        </div>`;
      }
      return `<div class="custom-gallery-item" data-index="${idx}" ${isEditor ? 'draggable="true"' : ''}>
        <img src="${escapeHtml(img.src)}" data-original-src="${escapeHtml(img.originalSrc || img.src)}" ${img.imgName ? `data-img-name="${escapeHtml(img.imgName)}"` : ''} alt="${escapeHtml(img.alt || 'Gallery image')}" loading="lazy" draggable="false">
        ${renderControls(idx)}
      </div>`;
    };

    if (count <= 4) {
      images.forEach((img, idx) => {
        itemsHtml += renderItem(img, idx);
      });
    } else {
      // 5 or more images: display first 3, then a split 4th item with a "+N" badge
      for (let idx = 0; idx < 3; idx++) {
        itemsHtml += renderItem(images[idx], idx);
      }

      const img4 = images[3];
      const moreCount = count - 4;
      if (img4 && img4.isPlaceholder) {
        itemsHtml += renderItem(img4, 3);
      } else {
        itemsHtml += `<div class="custom-gallery-item gallery-item-split" data-index="3" ${isEditor ? 'draggable="true"' : ''}>
          <div class="gallery-split-half gallery-split-img-box">
            <img src="${escapeHtml(img4.src)}" data-original-src="${escapeHtml(img4.originalSrc || img4.src)}" ${img4.imgName ? `data-img-name="${escapeHtml(img4.imgName)}"` : ''} alt="${escapeHtml(img4.alt || 'Gallery image')}" loading="lazy" draggable="false">
            ${renderControls(3)}
          </div>
          <div class="gallery-split-half gallery-split-badge" data-action="view-more" title="${moreCount} more ${moreCount === 1 ? 'image' : 'images'} in collection">
            <span class="gallery-badge-number">+${moreCount}</span>
          </div>
        </div>`;
      }

      // Hidden items for images 4..count-1 (preserved in DOM for serialization)
      for (let idx = 4; idx < count; idx++) {
        const img = images[idx];
        itemsHtml += `<div class="custom-gallery-item gallery-item-hidden" data-index="${idx}" style="display: none;" ${isEditor ? 'draggable="true"' : ''}>
          <img src="${escapeHtml(img.src)}" data-original-src="${escapeHtml(img.originalSrc || img.src)}" ${img.imgName ? `data-img-name="${escapeHtml(img.imgName)}"` : ''} alt="${escapeHtml(img.alt || 'Gallery image')}" loading="lazy">
          ${renderControls(idx)}
        </div>`;
      }
    }

    let sideButtons = '';
    if (isEditor && !hasPlaceholder) {
      sideButtons = `
        <button type="button" class="image-side-add-btn side-left" data-side="left" title="Add picture to the left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button type="button" class="image-side-add-btn side-right" data-side="right" title="Add picture to the right">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      `;
    }

    return `<div class="custom-gallery-grid" data-count="${countAttr}" ${hasPlaceholder ? 'data-has-placeholder="true"' : ''} ${isEditor ? 'contenteditable="false" draggable="true" tabindex="0"' : 'contenteditable="false"'}>
      ${itemsHtml}
      ${sideButtons}
    </div>`;
  }

  // =========================================================================
  // GALLERY TRANSFORMATIONS & PLACEHOLDER SLOTS
  // =========================================================================

  /**
   * Converts a single figure block into a 2-image gallery side-by-side.
   */
  function convertSingleImageToGallery(singleContainer, newImg) {
    if (!singleContainer) return;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const existingImg = singleContainer.querySelector('img');
    const existingCaption = singleContainer.querySelector('figcaption');
    const capText = existingCaption ? (existingCaption.textContent || '').trim() : '';

    const images = [
      {
        src: existingImg ? (existingImg.src || '') : '',
        originalSrc: existingImg ? (existingImg.dataset.originalSrc || existingImg.src) : '',
        imgName: existingImg ? (existingImg.dataset.imgName || '') : '',
        alt: existingImg ? (existingImg.alt || 'Image') : 'Image'
      },
      {
        src: newImg.dataUrl || newImg.src,
        originalSrc: newImg.relativePath || newImg.originalSrc || newImg.dataUrl || newImg.src,
        imgName: newImg.filename || newImg.imgName || '',
        alt: newImg.alt || 'Image'
      }
    ];

    if (window.commitCheckpoint) window.commitCheckpoint();
    const galHtml = createGalleryHtml(images, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = galHtml;
    const newGal = tempDiv.firstElementChild;

    const parent = singleContainer.parentNode;
    const nextSib = singleContainer.nextElementSibling;
    parent.replaceChild(newGal, singleContainer);

    // Clean up empty paragraph immediately following the container if any
    if (nextSib && nextSib.tagName === 'P' && (!nextSib.textContent.trim() || nextSib.innerHTML === '<br>')) {
      nextSib.remove();
    }

    if (capText && capText !== 'Add caption here...' && capText !== 'Add image caption here...') {
      const pCap = document.createElement('p');
      pCap.className = 'gallery-caption';
      pCap.contentEditable = 'true';
      pCap.textContent = capText;
      parent.insertBefore(pCap, newGal.nextSibling);
    }

    window._selectedImageBlock = null;
    window._lastActiveImageBlock = null;
    if (window.recordAction) window.recordAction('image-insert', true);

    if (canvasProse) {
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
    }
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.showToast === 'function') window.showToast('Created 2-picture side-by-side section!');
  }

  /**
   * Adds an additional image to an existing gallery block.
   */
  function addImageToGallery(galleryGrid, newImg) {
    if (!galleryGrid) return;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const imgs = Array.from(galleryGrid.querySelectorAll('.custom-gallery-item img'));
    const existingImages = imgs.map(img => ({
      src: img.src,
      originalSrc: img.dataset.originalSrc || img.src,
      imgName: img.dataset.imgName || '',
      alt: img.alt || 'Gallery image'
    }));

    existingImages.push({
      src: newImg.dataUrl || newImg.src,
      originalSrc: newImg.relativePath || newImg.originalSrc || newImg.dataUrl || newImg.src,
      imgName: newImg.filename || newImg.imgName || '',
      alt: newImg.alt || 'Gallery image'
    });

    if (window.commitCheckpoint) window.commitCheckpoint();
    const nextHtml = createGalleryHtml(existingImages, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = nextHtml;
    const newGal = tempDiv.firstElementChild;
    const nextSib = galleryGrid.nextElementSibling;
    galleryGrid.parentNode.replaceChild(newGal, galleryGrid);

    // Clean up empty paragraph immediately following the gallery if any
    if (nextSib && nextSib.tagName === 'P' && (!nextSib.textContent.trim() || nextSib.innerHTML === '<br>')) {
      nextSib.remove();
    }

    window._selectedImageBlock = null;
    window._lastActiveImageBlock = null;
    if (window.recordAction) window.recordAction('image-insert', true);

    if (canvasProse) {
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
    }
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.showToast === 'function') window.showToast(`Added image to gallery (${existingImages.length} images)`);
  }

  /**
   * Moves a gallery item left or right in presentation rotation.
   */
  function moveGalleryImage(galleryGrid, index, direction) {
    if (!galleryGrid) return;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const imgs = Array.from(galleryGrid.querySelectorAll('.custom-gallery-item img'));
    if (index < 0 || index >= imgs.length || imgs.length <= 1) return;

    if (window.commitCheckpoint) window.commitCheckpoint();
    const existingImages = imgs.map(img => ({
      src: img.src,
      originalSrc: img.dataset.originalSrc || img.src,
      imgName: img.dataset.imgName || '',
      alt: img.alt || 'Gallery image'
    }));

    const origCap = (galleryGrid.nextElementSibling && galleryGrid.nextElementSibling.classList.contains('gallery-caption'))
      ? (galleryGrid.nextElementSibling.textContent || '').trim()
      : '';

    const total = existingImages.length;
    if (direction === 'left' || direction === -1) {
      if (index > 0) {
        const tmp = existingImages[index];
        existingImages[index] = existingImages[index - 1];
        existingImages[index - 1] = tmp;
      } else {
        const item = existingImages.shift();
        existingImages.push(item);
      }
    } else {
      if (index < total - 1) {
        const tmp = existingImages[index];
        existingImages[index] = existingImages[index + 1];
        existingImages[index + 1] = tmp;
      } else {
        const item = existingImages.pop();
        existingImages.unshift(item);
      }
    }

    const nextHtml = createGalleryHtml(existingImages, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = nextHtml;
    const newGal = tempDiv.firstElementChild;
    galleryGrid.parentNode.replaceChild(newGal, galleryGrid);

    if (origCap && origCap !== 'Add caption here...' && origCap !== 'Add image caption here...') {
      if (!newGal.nextElementSibling || !newGal.nextElementSibling.classList.contains('gallery-caption')) {
        const pCap = document.createElement('p');
        pCap.className = 'gallery-caption';
        pCap.contentEditable = 'true';
        pCap.textContent = origCap;
        newGal.parentNode.insertBefore(pCap, newGal.nextSibling);
      }
      newGal.classList.add('has-caption');
    }

    newGal.classList.add('selected');
    window._selectedImageBlock = newGal;
    window._lastActiveImageBlock = newGal;
    newGal.focus();

    if (canvasProse) {
      ensureImageCaptionElements(canvasProse);
    }
    if (window.recordAction) window.recordAction('image-reorder', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.showToast === 'function') window.showToast(`Moved image ${direction === 'left' ? 'left' : 'right'} in rotation`);
  }

  /**
   * Removes an individual image from a gallery. If 1 image remains, converts to single figure.
   */
  function removeImageFromGallery(galleryGrid, index, skipHistory = false) {
    if (!galleryGrid) return;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const imgs = Array.from(galleryGrid.querySelectorAll('.custom-gallery-item img'));
    if (index < 0 || index >= imgs.length) return;

    if (!skipHistory && window.commitCheckpoint) {
      window.commitCheckpoint();
    }
    const existingImages = imgs.map(img => ({
      src: img.src,
      originalSrc: img.dataset.originalSrc || img.src,
      imgName: img.dataset.imgName || '',
      alt: img.alt || 'Gallery image'
    }));

    const origCap = (galleryGrid.nextElementSibling && galleryGrid.nextElementSibling.classList.contains('gallery-caption'))
      ? (galleryGrid.nextElementSibling.textContent || '').trim()
      : '';

    const removedImg = imgs[index];
    const removedFn = removedImg ? (removedImg.getAttribute('data-img-name') || removedImg.dataset?.imgName || removedImg.dataset?.filename || (removedImg.src && !removedImg.src.startsWith('data:') ? removedImg.src.split('/').pop().split('?')[0] : '')) : '';

    existingImages.splice(index, 1);

    if (removedFn && typeof window.currentDraft !== 'undefined' && window.currentDraft) {
      const curDraft = window.currentDraft;
      if (Array.isArray(curDraft.images)) {
        curDraft.images = curDraft.images.filter(im => im && im.filename !== removedFn);
      }
      if (Array.isArray(curDraft.tempImages)) {
        curDraft.tempImages = curDraft.tempImages.filter(im => im && im.filename !== removedFn);
      }
      if (curDraft.coverImage && curDraft.coverImage.includes(removedFn)) {
        curDraft.coverImage = '';
        curDraft.coverImageRemoved = false;
      }
      if (typeof window.cleanupOrphanedImageStorage === 'function') {
        window.cleanupOrphanedImageStorage(removedFn, curDraft.id);
      }
      if (typeof window.updateImagesCount === 'function') {
        window.updateImagesCount();
      }
    }

    if (existingImages.length === 0) {
      if (galleryGrid.nextElementSibling && galleryGrid.nextElementSibling.classList.contains('gallery-caption')) {
        galleryGrid.nextElementSibling.remove();
      }
      if (typeof window.deleteBlock === 'function') {
        window.deleteBlock(galleryGrid);
      } else {
        galleryGrid.remove();
      }
      if (!skipHistory && window.recordAction) {
        window.recordAction('delete-block', true);
      }
    } else if (existingImages.length === 1) {
      const single = existingImages[0];
      const figureHtml = createFigureHtml(single.src, single.originalSrc, single.imgName, single.alt, origCap, 'full');
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = figureHtml;
      const newFig = tempDiv.firstElementChild;

      if (galleryGrid.nextElementSibling && galleryGrid.nextElementSibling.classList.contains('gallery-caption')) {
        galleryGrid.nextElementSibling.remove();
      }

      galleryGrid.parentNode.replaceChild(newFig, galleryGrid);
      newFig.classList.add('selected');
      window._selectedImageBlock = newFig;
      window._lastActiveImageBlock = newFig;
      newFig.focus();
      if (!skipHistory && window.recordAction) {
        window.recordAction('image-update', true);
      }
      if (typeof window.showToast === 'function') window.showToast('Gallery converted to single image');
    } else {
      const nextHtml = createGalleryHtml(existingImages, true);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = nextHtml;
      const newGal = tempDiv.firstElementChild;
      galleryGrid.parentNode.replaceChild(newGal, galleryGrid);

      if (origCap && origCap !== 'Add caption here...' && origCap !== 'Add image caption here...') {
        if (!newGal.nextElementSibling || !newGal.nextElementSibling.classList.contains('gallery-caption')) {
          const pCap = document.createElement('p');
          pCap.className = 'gallery-caption';
          pCap.contentEditable = 'true';
          pCap.textContent = origCap;
          newGal.parentNode.insertBefore(pCap, newGal.nextSibling);
        }
        newGal.classList.add('has-caption');
      }

      newGal.classList.add('selected');
      window._selectedImageBlock = newGal;
      window._lastActiveImageBlock = newGal;
      newGal.focus();
      if (!skipHistory && window.recordAction) {
        window.recordAction('image-update', true);
      }
      if (typeof window.showToast === 'function') window.showToast(`Updated gallery (${existingImages.length} images)`);
    }

    if (canvasProse) {
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      ensureImageCaptionElements(canvasProse);
    }
    if (!skipHistory && typeof window.scheduleAutosave === 'function') {
      window.scheduleAutosave();
    }
  }

  /**
   * Adds an interactive placeholder slot to the left or right side of a figure/gallery.
   */
  function addSideBySideSlot(block, side = 'right') {
    if (!block || !block.parentNode) return;
    const canvasProse = document.getElementById('rich-canvas-prose');

    // If there is already an active placeholder elsewhere, cancel it first
    if (window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode) {
      const activeGallery = window._activePlaceholderSlot.closest('.custom-gallery-grid');
      if (activeGallery) {
        cancelGalleryPlaceholder(activeGallery);
      }
    }

    let existingImages = [];
    let origCap = '';

    if (block.classList.contains('captioned-image-container')) {
      const img = block.querySelector('img');
      const caption = block.querySelector('figcaption');
      origCap = caption ? (caption.textContent || '').trim() : '';
      if (origCap === 'Add caption here...' || origCap === 'Add image caption here...') origCap = '';
      if (img) {
        existingImages.push({
          src: img.src,
          originalSrc: img.dataset.originalSrc || img.src,
          imgName: img.dataset.imgName || '',
          alt: img.alt || 'Image'
        });
      }
    } else if (block.classList.contains('custom-gallery-grid')) {
      origCap = block.dataset.originalCaption || '';
      const imgs = Array.from(block.querySelectorAll('.custom-gallery-item:not(.gallery-slot-placeholder) img'));
      imgs.forEach(im => {
        existingImages.push({
          src: im.src,
          originalSrc: im.dataset.originalSrc || im.src,
          imgName: im.dataset.imgName || '',
          alt: im.alt || 'Gallery image'
        });
      });
    }

    if (existingImages.length === 0) return;

    const placeholderItem = { isPlaceholder: true };
    const items = side === 'left' ? [placeholderItem, ...existingImages] : [...existingImages, placeholderItem];

    if (window.commitCheckpoint) window.commitCheckpoint();
    const galHtml = createGalleryHtml(items, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = galHtml;
    const newGal = tempDiv.firstElementChild;
    newGal.dataset.hasPlaceholder = 'true';
    if (origCap) {
      newGal.dataset.originalCaption = origCap;
    }

    block.parentNode.replaceChild(newGal, block);

    // Clean up empty paragraph immediately following the container if any
    const nextSib = newGal.nextElementSibling;
    if (nextSib && nextSib.tagName === 'P' && (!nextSib.textContent.trim() || nextSib.innerHTML === '<br>')) {
      nextSib.remove();
    }

    const slot = newGal.querySelector('.gallery-slot-placeholder');
    window._activePlaceholderSlot = slot;
    document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block').forEach(c => c.classList.remove('selected'));
    newGal.classList.add('selected');
    window._selectedImageBlock = newGal;
    window._lastActiveImageBlock = newGal;

    if (slot) {
      slot.focus();
    }

    ensureImageCaptionElements(canvasProse);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  /**
   * Cancels an unfilled placeholder slot, restoring the original single figure or gallery.
   */
  function cancelGalleryPlaceholder(gallery, skipHistory = false) {
    if (!gallery || !gallery.parentNode) {
      window._activePlaceholderSlot = null;
      return;
    }
    const canvasProse = document.getElementById('rich-canvas-prose');
    const imgs = Array.from(gallery.querySelectorAll('.custom-gallery-item:not(.gallery-slot-placeholder) img')).map(im => ({
      src: im.src,
      originalSrc: im.dataset.originalSrc || im.src,
      imgName: im.dataset.imgName || '',
      alt: im.alt || 'Image'
    }));

    const origCap = gallery.dataset.originalCaption || '';

    if (imgs.length === 1) {
      const single = imgs[0];
      const figureHtml = createFigureHtml(single.src, single.originalSrc, single.imgName, single.alt, origCap, 'full');
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = figureHtml;
      const newFig = tempDiv.firstElementChild;
      gallery.parentNode.replaceChild(newFig, gallery);
      ensureImageCaptionElements(newFig);
      newFig.classList.add('selected');
      window._selectedImageBlock = newFig;
      window._lastActiveImageBlock = newFig;
    } else if (imgs.length > 1) {
      const nextHtml = createGalleryHtml(imgs, true);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = nextHtml;
      const newGal = tempDiv.firstElementChild;
      gallery.parentNode.replaceChild(newGal, gallery);
      ensureImageCaptionElements(newGal);
      newGal.classList.add('selected');
      window._selectedImageBlock = newGal;
      window._lastActiveImageBlock = newGal;
    } else {
      gallery.remove();
    }

    window._activePlaceholderSlot = null;
    if (canvasProse) {
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      ensureImageCaptionElements(canvasProse);
    }
    if (!skipHistory && typeof window.scheduleAutosave === 'function') {
      window.scheduleAutosave();
    }
  }

  /**
   * Populates an active placeholder slot with a newly selected or uploaded image.
   */
  function populateGalleryPlaceholder(slot, newImg) {
    if (!slot || !slot.parentNode) return;
    const gallery = slot.closest('.custom-gallery-grid');
    if (!gallery || !gallery.parentNode) return;
    const canvasProse = document.getElementById('rich-canvas-prose');

    if (window.commitCheckpoint) window.commitCheckpoint();

    const items = Array.from(gallery.querySelectorAll('.custom-gallery-item'));
    const finalImages = [];

    items.forEach(item => {
      if (item === slot) {
        finalImages.push({
          src: newImg.dataUrl || newImg.src,
          originalSrc: newImg.relativePath || newImg.originalSrc || newImg.dataUrl || newImg.src,
          imgName: newImg.filename || newImg.imgName || '',
          alt: newImg.alt || 'Gallery image'
        });
      } else {
        const im = item.querySelector('img');
        if (im) {
          finalImages.push({
            src: im.src,
            originalSrc: im.dataset.originalSrc || im.src,
            imgName: im.dataset.imgName || '',
            alt: im.alt || 'Gallery image'
          });
        }
      }
    });

    const origCap = gallery.dataset.originalCaption || '';
    const nextHtml = createGalleryHtml(finalImages, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = nextHtml;
    const newGal = tempDiv.firstElementChild;
    const nextSib = gallery.nextElementSibling;

    gallery.parentNode.replaceChild(newGal, gallery);

    if (nextSib && nextSib.tagName === 'P' && (!nextSib.textContent.trim() || nextSib.innerHTML === '<br>')) {
      nextSib.remove();
    }

    if (origCap && origCap !== 'Add caption here...' && origCap !== 'Add image caption here...') {
      if (!newGal.nextElementSibling || !newGal.nextElementSibling.classList.contains('gallery-caption')) {
        const pCap = document.createElement('p');
        pCap.className = 'gallery-caption';
        pCap.contentEditable = 'true';
        pCap.textContent = origCap;
        newGal.parentNode.insertBefore(pCap, newGal.nextSibling);
      }
    }

    window._activePlaceholderSlot = null;
    document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block').forEach(c => c.classList.remove('selected'));
    window._selectedImageBlock = null;
    window._lastActiveImageBlock = null;

    if (canvasProse) {
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      ensureImageCaptionElements(canvasProse);
    }

    if (window.recordAction) window.recordAction('image-insert', true);
    if (typeof window.updateImagesCount === 'function') window.updateImagesCount();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.showToast === 'function') window.showToast(`Added image to gallery (${finalImages.length} images)`);
  }

  // =========================================================================
  // IMAGE BLOCK PREDICATES & MERGING
  // =========================================================================

  function isImageBlock(el) {
    if (!el || !el.classList) return false;
    return el.classList.contains('captioned-image-container') || el.classList.contains('custom-gallery-grid');
  }

  function getAdjacentImageBlock(block) {
    if (!block || !block.parentNode) return null;
    let prev = block.previousElementSibling;
    while (prev && prev.tagName === 'P' && (!prev.textContent.trim() || prev.innerHTML === '<br>')) {
      prev = prev.previousElementSibling;
    }
    if (prev && isImageBlock(prev)) {
      return { block: prev, direction: 'prev' };
    }
    let next = block.nextElementSibling;
    if (next && next.classList.contains('gallery-caption')) {
      next = next.nextElementSibling;
    }
    while (next && next.tagName === 'P' && (!next.textContent.trim() || next.innerHTML === '<br>')) {
      next = next.nextElementSibling;
    }
    if (next && isImageBlock(next)) {
      return { block: next, direction: 'next' };
    }
    return null;
  }

  function mergeImageBlocks(targetBlock, sourceBlock) {
    if (!targetBlock || !sourceBlock || targetBlock === sourceBlock) return null;
    const canvasProse = document.getElementById('rich-canvas-prose');

    // Collect images from targetBlock
    const targetImgs = Array.from(targetBlock.querySelectorAll('img')).map(im => ({
      src: im.src,
      originalSrc: im.dataset.originalSrc || im.src,
      imgName: im.dataset.imgName || '',
      alt: im.alt || 'Gallery image'
    }));

    // Collect images from sourceBlock
    const sourceImgs = Array.from(sourceBlock.querySelectorAll('img')).map(im => ({
      src: im.src,
      originalSrc: im.dataset.originalSrc || im.src,
      imgName: im.dataset.imgName || '',
      alt: im.alt || 'Gallery image'
    }));

    if (targetImgs.length === 0 && sourceImgs.length === 0) return null;
    const combinedImages = [...targetImgs, ...sourceImgs];

    // Caption handling: preserve any non-default caption from target or source
    const targetCap = targetBlock.querySelector('figcaption') ||
      (targetBlock.nextElementSibling && targetBlock.nextElementSibling.classList.contains('gallery-caption') ? targetBlock.nextElementSibling : null);
    const sourceCap = sourceBlock.querySelector('figcaption') ||
      (sourceBlock.nextElementSibling && sourceBlock.nextElementSibling.classList.contains('gallery-caption') ? sourceBlock.nextElementSibling : null);

    const targetText = targetCap ? (targetCap.textContent || '').trim() : '';
    const sourceText = sourceCap ? (sourceCap.textContent || '').trim() : '';
    const capText = (targetText && targetText !== 'Add caption here...' && targetText !== 'Add image caption here...') ? targetText :
                    ((sourceText && sourceText !== 'Add caption here...' && sourceText !== 'Add image caption here...') ? sourceText : '');

    if (window.commitCheckpoint) window.commitCheckpoint();

    // Create new gallery HTML
    const galHtml = createGalleryHtml(combinedImages, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = galHtml;
    const newGal = tempDiv.firstElementChild;

    const parent = targetBlock.parentNode;
    parent.replaceChild(newGal, targetBlock);

    // If sourceBlock has an adjacent gallery-caption paragraph, remove it
    if (sourceBlock.nextElementSibling && sourceBlock.nextElementSibling.classList.contains('gallery-caption')) {
      sourceBlock.nextElementSibling.remove();
    }
    sourceBlock.remove();

    // Clean empty paragraphs in between or adjacent
    if (canvasProse) {
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
    }

    // If there was a caption, add or update gallery-caption
    if (capText) {
      const pCap = document.createElement('p');
      pCap.className = 'gallery-caption';
      pCap.contentEditable = 'true';
      pCap.textContent = capText;
      newGal.parentNode.insertBefore(pCap, newGal.nextSibling);
    }

    // Select and focus the new gallery
    document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block').forEach(c => c.classList.remove('selected'));
    newGal.classList.add('selected');
    window._selectedImageBlock = newGal;
    window._lastActiveImageBlock = newGal;
    newGal.focus();

    if (canvasProse) {
      ensureImageCaptionElements(canvasProse);
    }

    if (window.recordAction) window.recordAction('image-merge', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.showToast === 'function') window.showToast(`Combined ${combinedImages.length} images side-by-side!`);
    return newGal;
  }

  // =========================================================================
  // RAW IMAGE NORMALIZATION PASS
  // =========================================================================

  /**
   * Normalizes any raw <img> elements in the editor canvas into full Cedar captioned image containers.
   * Ensures every image has rounded corners, caption button, and side '+' buttons to create image rows.
   */
  function normalizeRawImages(root) {
    if (!root) root = document.getElementById('rich-canvas-prose');
    if (!root || typeof root.querySelectorAll !== 'function') return;

    // 1. Ensure any .captioned-image-container or .custom-gallery-grid is a direct top-level child of root (never nested inside a <p> or inline block)
    const nestedBlocks = Array.from(root.querySelectorAll('.captioned-image-container, .custom-gallery-grid')).filter(el => {
      return el.parentElement && el.parentElement !== root && !el.closest('.page-recent-posts-block, .page-individual-post-block, .post-card');
    });
    nestedBlocks.forEach(blockEl => {
      let topAncestor = blockEl;
      while (topAncestor.parentElement && topAncestor.parentElement !== root) {
        topAncestor = topAncestor.parentElement;
      }
      if (topAncestor && topAncestor.parentElement === root) {
        root.insertBefore(blockEl, topAncestor.nextSibling);
        const clone = topAncestor.cloneNode(true);
        clone.querySelectorAll('.captioned-image-container, .custom-gallery-grid').forEach(c => c.remove());
        if (!clone.textContent.trim() && !clone.querySelector('img, video, iframe, hr, svg, pre, blockquote, table')) {
          topAncestor.remove();
        }
      }
    });

    // 2. Find all <img> elements not wrapped in recognized Cedar containers or page blocks
    const rawImgs = Array.from(root.querySelectorAll('img')).filter(img => {
      return !img.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .image-sanitizing-placeholder, .gallery-split-img-box, .page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card');
    });

    if (rawImgs.length === 0 && nestedBlocks.length === 0) return;

    rawImgs.forEach(img => {
      const src = img.getAttribute('src') || img.src || '';
      if (!src) return;
      const rawName = img.getAttribute('data-img-name') || img.dataset.imgName;
      const imgName = rawName || ((src.startsWith('data:') || src.startsWith('blob:')) ? ('image-' + Date.now().toString(36) + '.jpg') : (src.split('/').pop().split('?')[0] || 'image.jpg'));
      const rawOrig = img.getAttribute('data-original-src') || img.dataset.originalSrc || '';
      const originalSrc = (rawOrig && !rawOrig.startsWith('data:') && !rawOrig.startsWith('blob:'))
        ? rawOrig
        : `/blog/images/${imgName}`;
      const alt = img.getAttribute('alt') || img.alt || 'Image';

      // Keep currentDraft images list synchronized
      if (window.currentDraft) {
        if (!window.currentDraft.images) window.currentDraft.images = [];
        if (!window.currentDraft.tempImages) window.currentDraft.tempImages = [];
        const exists = window.currentDraft.images.some(im => im.dataUrl === src || im.relativePath === originalSrc || im.filename === imgName);
        if (!exists) {
          const item = {
            filename: imgName,
            relativePath: originalSrc,
            dataUrl: src,
            src: src,
            alt: alt
          };
          window.currentDraft.images.push(item);
          window.currentDraft.tempImages.push(item);
        }
      }

      const figureHtml = createFigureHtml(src, originalSrc, imgName, alt, '', 'full');
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = figureHtml;
      const figureBlock = tempDiv.firstElementChild;

      // Find the direct child of root that encloses this image
      let parent = img.parentElement;
      if (parent === root) {
        root.replaceChild(figureBlock, img);
      } else {
        let topBlock = img;
        while (topBlock && topBlock.parentElement !== root) {
          topBlock = topBlock.parentElement;
        }

        if (topBlock && topBlock.parentElement === root) {
          // If the topBlock only contains this image (and maybe whitespace/br)
          const clone = topBlock.cloneNode(true);
          clone.querySelectorAll('img').forEach(i => i.remove());
          const hasOtherContent = clone.textContent.trim().length > 0 || clone.querySelector('video, iframe, svg, pre, blockquote, hr, table');

          if (!hasOtherContent && topBlock.querySelectorAll('img').length === 1) {
            root.replaceChild(figureBlock, topBlock);
          } else {
            // If topBlock contains other text/content, remove img and insert figureBlock after topBlock
            img.remove();
            if (topBlock.nextSibling) {
              root.insertBefore(figureBlock, topBlock.nextSibling);
            } else {
              root.appendChild(figureBlock);
            }
          }
        } else if (img.parentElement) {
          img.parentElement.replaceChild(figureBlock, img);
        }
      }

      ensureImageCaptionElements(figureBlock);
    });

    if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(root);
    if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
    if (typeof window.updateImagesCount === 'function') window.updateImagesCount();
  }

  // =========================================================================
  // CAPTION & WRAPPER SYNCHRONIZATION
  // =========================================================================

  // =========================================================================
  // SMART IMAGE SIZING, INTEGER SCALING & +/- SCALE CONTROLS
  // =========================================================================

  const MIN_IMAGE_WIDTH_PX = 246;

  function getEditorMarginWidth(container) {
    const proseEl = (container && container.closest)
      ? container.closest('#rich-canvas-prose, .article-prose, .canvas-prose')
      : document.getElementById('rich-canvas-prose');
    if (proseEl && proseEl.clientWidth > 200) {
      return proseEl.clientWidth;
    }
    return 820;
  }

  function buildImageScaleSteps(naturalWidth, marginWidth) {
    const minAdjustablePx = Math.min(MIN_IMAGE_WIDTH_PX, marginWidth);
    const isTiny = naturalWidth > 0 && naturalWidth < MIN_IMAGE_WIDTH_PX;
    const stepsSet = new Set();

    // Always include the exact minimum size (246px / 30% of 820px) as the lowest step
    stepsSet.add(minAdjustablePx);

    if (isTiny) {
      // Integer multiples of naturalWidth (2x, 3x, 4x...) that are >= minAdjustablePx and <= marginWidth
      let k = 1;
      while (k * naturalWidth <= marginWidth) {
        const px = Math.round(k * naturalWidth);
        if (px >= minAdjustablePx) {
          stepsSet.add(px);
        }
        k++;
      }
      if (stepsSet.size < 5) {
        [0.30, 0.44, 0.58, 0.72, 0.86, 1.00].forEach(pct => {
          const px = Math.max(minAdjustablePx, Math.round(marginWidth * pct));
          if (px <= marginWidth) stepsSet.add(px);
        });
      }
      stepsSet.add(marginWidth);
    } else {
      // Clean percentage steps of marginWidth starting at 30% (246px) up to 100%
      [0.30, 0.44, 0.58, 0.72, 0.86, 1.00].forEach(pct => {
        const px = Math.max(minAdjustablePx, Math.round(marginWidth * pct));
        if (px <= marginWidth) stepsSet.add(px);
      });
      if (naturalWidth >= minAdjustablePx && naturalWidth < marginWidth) {
        stepsSet.add(Math.round(naturalWidth));
      }
    }

    const sorted = Array.from(stepsSet).sort((a, b) => a - b);
    // Filter out steps that are too close (< 24px apart) except keep first (minAdjustablePx) and last (marginWidth)
    const filtered = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || i === sorted.length - 1 || sorted[i] - filtered[filtered.length - 1] >= 24) {
        filtered.push(sorted[i]);
      }
    }
    return filtered;
  }

  function updateScaleButtonsState(container, renderedPx, marginWidth) {
    if (!container) return;
    const minAdjustablePx = Math.min(MIN_IMAGE_WIDTH_PX, marginWidth);
    const downBtn = container.querySelector('.btn-scale-img-down');
    const upBtn = container.querySelector('.btn-scale-img-up');
    if (downBtn) {
      const atMin = renderedPx <= minAdjustablePx + 4;
      downBtn.classList.toggle('is-at-limit', atMin);
    }
    if (upBtn) {
      const atMax = renderedPx >= marginWidth - 4;
      upBtn.classList.toggle('is-at-limit', atMax);
    }
  }

  function applySmartImageSizing(container) {
    if (!container || !container.classList || !container.classList.contains('captioned-image-container')) return;
    const figure = container.querySelector('figure');
    const wrapper = container.querySelector('.image-media-wrapper');
    const img = container.querySelector('img');
    if (!figure || !wrapper || !img) return;

    if (!img.complete || !img.naturalWidth) {
      if (!img._hasCedarSmartSizeLoad) {
        img._hasCedarSmartSizeLoad = true;
        img.addEventListener('load', () => {
          img._hasCedarSmartSizeLoad = false;
          applySmartImageSizing(container);
        }, { once: true });
      }
      return;
    }

    const naturalWidth = img.naturalWidth;
    const marginWidth = getEditorMarginWidth(container);
    const minAdjustablePx = Math.min(MIN_IMAGE_WIDTH_PX, marginWidth);
    const isTiny = naturalWidth > 0 && naturalWidth < MIN_IMAGE_WIDTH_PX;

    if (isTiny) {
      container.setAttribute('data-pixelated', 'true');
      img.style.imageRendering = 'pixelated';
    } else if (container.getAttribute('data-pixelated') !== 'true') {
      img.style.imageRendering = '';
    }

    let scaleWidth = (container.getAttribute('data-scale-width') || '').trim();

    if (!scaleWidth) {
      // Smart default rule of thumb:
      // 1. Pictures naturally smaller than minimum size (246px): bump up to minimum size (246px) with crisp pixel rendering
      // 2. Huge pictures (>= marginWidth): scale down to 100% of editor margins
      // 3. Medium pictures (246px .. marginWidth): display at natural width within margins
      if (isTiny) {
        scaleWidth = `${minAdjustablePx}px`;
        container.setAttribute('data-scale-width', scaleWidth);
      } else if (naturalWidth >= marginWidth * 0.92) {
        scaleWidth = '100%';
        container.setAttribute('data-scale-width', scaleWidth);
      } else {
        scaleWidth = `${Math.max(minAdjustablePx, naturalWidth)}px`;
        container.setAttribute('data-scale-width', scaleWidth);
      }
    } else {
      // Clamp existing scaleWidth within [minAdjustablePx, marginWidth]
      if (scaleWidth.endsWith('px')) {
        const pxVal = parseFloat(scaleWidth);
        if (!isNaN(pxVal)) {
          if (pxVal > marginWidth) {
            scaleWidth = '100%';
          } else if (pxVal < minAdjustablePx) {
            scaleWidth = `${minAdjustablePx}px`;
          }
          container.setAttribute('data-scale-width', scaleWidth);
        }
      } else if (scaleWidth.endsWith('%')) {
        const pctVal = parseFloat(scaleWidth);
        if (!isNaN(pctVal)) {
          const minPct = Math.ceil((minAdjustablePx / marginWidth) * 100);
          const clampedPct = Math.min(100, Math.max(minPct, pctVal));
          scaleWidth = `${clampedPct}%`;
          container.setAttribute('data-scale-width', scaleWidth);
        }
      }
    }

    figure.style.width = scaleWidth;
    figure.style.maxWidth = '100%';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '100%';
    img.style.width = '100%';
    img.style.maxWidth = '100%';

    const renderedPx = scaleWidth.endsWith('%')
      ? Math.round((parseFloat(scaleWidth) / 100) * marginWidth)
      : (parseFloat(scaleWidth) || marginWidth);
    updateScaleButtonsState(container, renderedPx, marginWidth);
  }

  function stepImageScale(container, direction) {
    if (!container || !container.classList || !container.classList.contains('captioned-image-container')) return;
    let figure = container.querySelector('figure');
    let wrapper = container.querySelector('.image-media-wrapper');
    const img = container.querySelector('img');
    if (!figure || !wrapper) {
      ensureImageCaptionElements(container);
      figure = container.querySelector('figure');
      wrapper = container.querySelector('.image-media-wrapper');
    }
    if (!figure || !wrapper || !img) return;

    const naturalWidth = img.naturalWidth || 820;
    const marginWidth = getEditorMarginWidth(container);
    const minAdjustablePx = Math.min(MIN_IMAGE_WIDTH_PX, marginWidth);
    const isTiny = naturalWidth > 0 && naturalWidth < MIN_IMAGE_WIDTH_PX;

    const steps = buildImageScaleSteps(naturalWidth, marginWidth);
    if (steps.length === 0) return;

    let currentBasePx = 0;
    const existingScaleAttr = (container.getAttribute('data-scale-width') || '').trim();
    if (existingScaleAttr.endsWith('%')) {
      const pctVal = parseFloat(existingScaleAttr);
      if (!isNaN(pctVal) && pctVal > 0) {
        currentBasePx = Math.round((pctVal / 100) * marginWidth);
      }
    } else if (existingScaleAttr.endsWith('px')) {
      const pxVal = parseFloat(existingScaleAttr);
      if (!isNaN(pxVal) && pxVal > 0) {
        currentBasePx = Math.round(pxVal);
      }
    }
    if (!currentBasePx) {
      currentBasePx = figure.getBoundingClientRect().width || img.getBoundingClientRect().width || marginWidth;
    }
    const currentWidth = Math.min(marginWidth, Math.max(minAdjustablePx, Math.round(currentBasePx)));

    let nextPx = null;
    if (direction === 'up') {
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] > currentWidth + 6) {
          nextPx = steps[i];
          break;
        }
      }
      if (nextPx === null) {
        if (currentWidth < marginWidth - 2) {
          nextPx = marginWidth;
        } else {
          updateScaleButtonsState(container, marginWidth, marginWidth);
          return;
        }
      }
    } else {
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i] < currentWidth - 6) {
          nextPx = steps[i];
          break;
        }
      }
      if (nextPx === null) {
        if (currentWidth > minAdjustablePx + 2) {
          nextPx = minAdjustablePx;
        } else {
          updateScaleButtonsState(container, minAdjustablePx, marginWidth);
          return;
        }
      }
    }

    if (window.commitCheckpoint) window.commitCheckpoint();

    let scaleValue = '';
    if (nextPx >= marginWidth - 2) {
      scaleValue = '100%';
    } else if (isTiny) {
      // Keep exact pixel width for integer-scaled small images so pixels stay sharp
      scaleValue = `${nextPx}px`;
      container.setAttribute('data-pixelated', 'true');
      img.style.imageRendering = 'pixelated';
    } else {
      const pct = Math.min(100, Math.max(Math.ceil((minAdjustablePx / marginWidth) * 100), Math.round((nextPx / marginWidth) * 100)));
      scaleValue = `${pct}%`;
    }

    container.setAttribute('data-scale-width', scaleValue);
    figure.style.width = scaleValue;
    figure.style.maxWidth = '100%';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '100%';
    img.style.width = '100%';
    img.style.maxWidth = '100%';

    updateScaleButtonsState(container, nextPx, marginWidth);

    if (window.recordAction) window.recordAction('image-scale', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function ensureImageCaptionElements(root) {
    if (!root) return;
    if (typeof normalizeRawImages === 'function') {
      normalizeRawImages(root);
    }
    root.querySelectorAll('#canvas-drop-indicator').forEach(el => el.remove());
    const containers = root.classList && root.classList.contains('captioned-image-container')
      ? [root]
      : Array.from(root.querySelectorAll('.captioned-image-container'));
    containers.forEach(container => {
      if (container.getAttribute('contenteditable') !== 'false') {
        container.setAttribute('contenteditable', 'false');
      }
      if (container.getAttribute('draggable') !== 'true') {
        container.setAttribute('draggable', 'true');
      }
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '0');
      }
      let figure = container.querySelector('figure');
      if (!figure) {
        const directImg = container.querySelector('img');
        if (!directImg) return;
        figure = document.createElement('figure');
        figure.appendChild(directImg);
        const directCap = container.querySelector('figcaption');
        if (directCap) figure.appendChild(directCap);
        container.insertBefore(figure, container.firstChild);
      }
      let wrapper = figure.querySelector('.image-media-wrapper');
      if (!wrapper) {
        const directImg = figure.querySelector('img');
        if (directImg) {
          wrapper = document.createElement('div');
          wrapper.className = 'image-media-wrapper';
          figure.insertBefore(wrapper, directImg);
          wrapper.appendChild(directImg);
        }
      }
      if (wrapper) {
        const imgEl = wrapper.querySelector('img');
        if (imgEl && imgEl.getAttribute('draggable') !== 'false') {
          imgEl.setAttribute('draggable', 'false');
        }

        // Strip out any obsolete pill bars, extra buttons or duplicates
        wrapper.querySelectorAll('.image-hover-pill-bar, .image-add-photo-btn, .btn-add-multi-image, .btn-combine-adjacent-images').forEach(el => el.remove());

        // Ensure side '+' buttons (left and right)
        let leftBtn = wrapper.querySelector('.image-side-add-btn.side-left');
        if (!leftBtn) {
          leftBtn = document.createElement('button');
          leftBtn.type = 'button';
          leftBtn.className = 'image-side-add-btn side-left';
          leftBtn.dataset.side = 'left';
          leftBtn.title = 'Add picture to the left';
          leftBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          wrapper.appendChild(leftBtn);
        }
        let rightBtn = wrapper.querySelector('.image-side-add-btn.side-right');
        if (!rightBtn) {
          rightBtn = document.createElement('button');
          rightBtn.type = 'button';
          rightBtn.className = 'image-side-add-btn side-right';
          rightBtn.dataset.side = 'right';
          rightBtn.title = 'Add picture to the right';
          rightBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          wrapper.appendChild(rightBtn);
        }

        // Ensure strictly ONE .image-add-caption-btn exists directly in wrapper
        const capBtns = Array.from(wrapper.querySelectorAll('.image-add-caption-btn'));
        if (capBtns.length === 0) {
          const capBtn = document.createElement('button');
          capBtn.type = 'button';
          capBtn.className = 'image-add-caption-btn';
          capBtn.title = 'Add Caption';
          capBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Caption</span>
          `;
          wrapper.appendChild(capBtn);
        } else if (capBtns.length > 1) {
          for (let i = 1; i < capBtns.length; i++) {
            capBtns[i].remove();
          }
        }

        // Ensure strictly ONE .figure-hover-actions with Decrease Scale (-) and Increase Scale (+) buttons only (no Delete button)
        let hoverActions = wrapper.querySelector('.figure-hover-actions');
        const needsScaleButtonsUpgrade = hoverActions && (!hoverActions.querySelector('.btn-scale-img-down') || !hoverActions.querySelector('.btn-scale-img-up') || hoverActions.querySelector('.btn-move-block-up, .btn-move-block-down, .btn-delete-fig, .figure-action-sep'));
        if (!hoverActions || needsScaleButtonsUpgrade) {
          if (!hoverActions) {
            hoverActions = document.createElement('div');
            hoverActions.className = 'figure-hover-actions';
            wrapper.appendChild(hoverActions);
          }
          hoverActions.innerHTML = `
            <button type="button" class="figure-action-btn btn-scale-img-down" title="Decrease Image Scale (-)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button type="button" class="figure-action-btn btn-scale-img-up" title="Increase Image Scale (+)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          `;
        }
      }

      applySmartImageSizing(container);

      const figcaption = figure.querySelector('figcaption');
      if (figcaption) {
        const text = (figcaption.textContent || '').trim();
        if ((!text || text === 'Add caption here...' || text === 'Add image caption here...') && document.activeElement !== figcaption) {
          figcaption.remove();
          container.classList.remove('has-caption');
        } else if (text && text !== 'Add caption here...' && text !== 'Add image caption here...') {
          container.classList.add('has-caption');
        }
      } else {
        container.classList.remove('has-caption');
      }
    });

    // Also check galleries
    const galleries = root.querySelectorAll('.custom-gallery-grid');
    galleries.forEach(gal => {
      if (gal.getAttribute('contenteditable') !== 'false') {
        gal.setAttribute('contenteditable', 'false');
      }
      if (gal.getAttribute('draggable') !== 'true') {
        gal.setAttribute('draggable', 'true');
      }
      if (!gal.hasAttribute('tabindex')) {
        gal.setAttribute('tabindex', '0');
      }
      gal.querySelectorAll('.figure-hover-actions, .image-hover-pill-bar, .image-add-photo-btn, .btn-add-multi-image, .btn-combine-adjacent-images').forEach(el => el.remove());

      // Check caption state
      const nextP = gal.nextElementSibling;
      const pCap = (nextP && nextP.classList.contains('gallery-caption')) ? nextP : null;
      if (pCap) {
        const text = (pCap.textContent || '').trim();
        if ((!text || text === 'Add caption here...' || text === 'Add image caption here...') && document.activeElement !== pCap) {
          pCap.remove();
          gal.classList.remove('has-caption');
        } else if (text && text !== 'Add caption here...' && text !== 'Add image caption here...') {
          gal.classList.add('has-caption');
        }
      } else {
        gal.classList.remove('has-caption');
      }

      // Ensure all real gallery items have draggable attribute, controls, and caption button
      const items = Array.from(gal.querySelectorAll('.custom-gallery-item:not(.gallery-slot-placeholder)'));
      items.forEach((item, idx) => {
        const gImg = item.querySelector('img');
        if (gImg && gImg.getAttribute('draggable') !== 'false') {
          gImg.setAttribute('draggable', 'false');
        }
        if (item.getAttribute('draggable') !== 'true') {
          item.setAttribute('draggable', 'true');
        }
        item.dataset.index = idx.toString();

        const targetContainer = item.classList.contains('gallery-item-split') 
          ? item.querySelector('.gallery-split-img-box') 
          : item;
        if (!targetContainer) return;

        // Ensure controls (left/right reorder arrows only; deletion is via Backspace/Delete key)
        let controls = targetContainer.querySelector('.gallery-item-controls');
        if (!controls || controls.querySelector('.gallery-item-delete-btn, .gallery-item-btn-sep')) {
          if (!controls) {
            controls = document.createElement('div');
            controls.className = 'gallery-item-controls';
            targetContainer.appendChild(controls);
          }
          controls.innerHTML = `
            <button type="button" class="gallery-item-btn btn-move-item-left" data-index="${idx}" title="Move backward in rotation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <button type="button" class="gallery-item-btn btn-move-item-right" data-index="${idx}" title="Move forward in rotation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
          `;
        } else {
          controls.querySelectorAll('.gallery-item-btn').forEach(b => b.dataset.index = idx.toString());
        }

        // Ensure Add Caption button
        let capBtn = targetContainer.querySelector('.image-add-caption-btn');
        if (!capBtn) {
          capBtn = document.createElement('button');
          capBtn.type = 'button';
          capBtn.className = 'image-add-caption-btn';
          capBtn.dataset.index = idx.toString();
          capBtn.title = 'Add Caption';
          capBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Caption</span>
          `;
          targetContainer.appendChild(capBtn);
        } else {
          capBtn.dataset.index = idx.toString();
        }
      });

      // Side buttons on gallery (only when not containing a placeholder)
      if (gal.dataset.hasPlaceholder === 'true') {
        gal.querySelectorAll('.image-side-add-btn').forEach(b => b.remove());
      } else {
        let leftBtn = gal.querySelector('.image-side-add-btn.side-left');
        if (!leftBtn) {
          leftBtn = document.createElement('button');
          leftBtn.type = 'button';
          leftBtn.className = 'image-side-add-btn side-left';
          leftBtn.dataset.side = 'left';
          leftBtn.title = 'Add picture to the left';
          leftBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          gal.appendChild(leftBtn);
        }
        let rightBtn = gal.querySelector('.image-side-add-btn.side-right');
        if (!rightBtn) {
          rightBtn = document.createElement('button');
          rightBtn.type = 'button';
          rightBtn.className = 'image-side-add-btn side-right';
          rightBtn.dataset.side = 'right';
          rightBtn.title = 'Add picture to the right';
          rightBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          gal.appendChild(rightBtn);
        }
      }
    });

    hydrateCanvasImages(root, window.currentDraft);
  }

  /**
   * Hydrates all content <img> elements inside the editor canvas (or given container)
   * using draft.images, window.imageRegistry, projectConfig.mediaLibrary, CedarVirtualStorage, or SheeshVault.
   */
  function hydrateCanvasImages(root, draft) {
    if (!root) root = document.getElementById('rich-canvas-prose');
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const curDraft = draft || window.currentDraft;

    const contentImgs = Array.from(root.querySelectorAll('img')).filter(img => {
      return !img.closest('.page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card');
    });
    if (contentImgs.length === 0) return;

    const extractCleanFn = (val) => {
      if (!val || typeof val !== 'string') return '';
      const trimmed = val.trim();
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) return '';
      const base = trimmed.split('/').pop().split('\\').pop().split('?')[0].split('#')[0].trim();
      if (!base || base.toLowerCase() === 'img' || base.toLowerCase() === 'image') return '';
      return base;
    };

    // Collect markdown image references in order as fallback
    const mdImageUrls = [];
    if (curDraft && typeof curDraft.markdown === 'string' && curDraft.markdown) {
      const md = curDraft.markdown;
      const tokenRe = /:::gallery([\s\S]*?):::|!\[[^\]]*\]\(([^\s\)\"]+)(?:\s+"[^"]*")?\)/gi;
      let m;
      while ((m = tokenRe.exec(md)) !== null) {
        if (m[1] !== undefined) {
          const cleanInner = m[1].replace(/:::caption[\s\S]*?:::/gi, '');
          cleanInner.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
            const imMatch = line.match(/!\[.*?\]\((.*?)\)/);
            mdImageUrls.push(imMatch ? imMatch[1].trim() : line);
          });
        } else if (m[2]) {
          mdImageUrls.push(m[2].trim());
        }
      }
    }

    contentImgs.forEach((imgEl, idx) => {
      const rawSrc = imgEl.getAttribute('src') || '';
      const origSrc = imgEl.getAttribute('data-original-src') || imgEl.dataset?.originalSrc || '';
      const imgName = imgEl.getAttribute('data-img-name') || imgEl.dataset?.imgName || '';
      const alt = imgEl.getAttribute('alt') || '';

      let cleanName = extractCleanFn(imgName) || extractCleanFn(origSrc) || extractCleanFn(rawSrc);
      if (!cleanName && alt && /\.(webp|png|jpe?g|gif|svg|avif)$/i.test(alt.trim())) {
        cleanName = extractCleanFn(alt.trim());
      }
      if (!cleanName && mdImageUrls[idx]) {
        cleanName = extractCleanFn(mdImageUrls[idx]);
      }
      if (!cleanName && curDraft && Array.isArray(curDraft.images) && curDraft.images[idx] && curDraft.images[idx].filename) {
        cleanName = extractCleanFn(curDraft.images[idx].filename);
      }

      if (cleanName) {
        imgEl.setAttribute('data-img-name', cleanName);
        if (imgEl.dataset) imgEl.dataset.imgName = cleanName;
        if (!origSrc || origSrc.startsWith('blob:') || origSrc.startsWith('data:') || origSrc === 'img' || origSrc.endsWith('/img')) {
          const canonicalRel = `/blog/images/${cleanName}`;
          imgEl.setAttribute('data-original-src', canonicalRel);
          if (imgEl.dataset) imgEl.dataset.originalSrc = canonicalRel;
        }
      }

      // 1. Synchronous resolution from draft.images, imageRegistry, mediaLibrary
      const currentAttrSrc = imgEl.getAttribute('src') || '';
      if (!currentAttrSrc.startsWith('data:image/')) {
        const lookupTarget = cleanName || origSrc || rawSrc;
        if (lookupTarget && typeof window.resolvePostImage === 'function') {
          const resolved = window.resolvePostImage(lookupTarget, curDraft);
          if (resolved && (resolved.startsWith('data:image/') || resolved.startsWith('blob:') || /^https?:\/\//i.test(resolved))) {
            if (currentAttrSrc !== resolved) {
              imgEl.src = resolved;
            }
          }
        }
      }

      // 2. Async vault/storage blob hydration helper (for OPFS/IndexedDB, SheeshVault, Server Bridge, or stale blob: URLs)
      const hydrateFromVault = () => {
        if (!cleanName || typeof window.resolveMediaBlob !== 'function') return;
        if (imgEl._isHydratingFromVault) return;
        imgEl._isHydratingFromVault = true;
        window.resolveMediaBlob(cleanName, { src: origSrc || rawSrc, postSlug: curDraft?.slug }).then(blob => {
          imgEl._isHydratingFromVault = false;
          if (!blob || !(blob instanceof Blob) || blob.size === 0) return;
          const objUrl = URL.createObjectURL(blob);
          imgEl.src = objUrl;
          const pFigEarly = imgEl.closest ? imgEl.closest('.captioned-image-container') : null;
          if (pFigEarly) applySmartImageSizing(pFigEarly);

          const reader = new FileReader();
          reader.onloadend = () => {
            const dUrl = typeof reader.result === 'string' ? reader.result : '';
            const finalUrl = dUrl || objUrl;
            if (dUrl && imgEl.isConnected) {
              imgEl.src = dUrl;
            }
            const pFigDone = imgEl.closest ? imgEl.closest('.captioned-image-container') : null;
            if (pFigDone) applySmartImageSizing(pFigDone);
            const relPath = `/blog/images/${cleanName}`;
            const regEntry = {
              filename: cleanName,
              relativePath: relPath,
              blob: blob,
              objectUrl: objUrl,
              dataUrl: finalUrl,
              src: finalUrl
            };
            if (window.imageRegistry) {
              window.imageRegistry.set(cleanName, regEntry);
              window.imageRegistry.set(relPath, regEntry);
              window.imageRegistry.set(`blog/images/${cleanName}`, regEntry);
            }
            if (curDraft) {
              if (!Array.isArray(curDraft.images)) curDraft.images = [];
              const existing = curDraft.images.find(im => im && String(im.filename || '').toLowerCase() === cleanName.toLowerCase());
              if (existing) {
                existing.blob = blob;
                existing.objectUrl = objUrl;
                existing.dataUrl = finalUrl;
                existing.src = finalUrl;
              } else {
                curDraft.images.push({ ...regEntry, alt: alt || 'Image' });
              }
            }
          };
          reader.readAsDataURL(blob);
        }).catch(() => {
          imgEl._isHydratingFromVault = false;
        });
      };

      if (!imgEl._hasCedarHydrateError) {
        imgEl._hasCedarHydrateError = true;
        imgEl.addEventListener('error', () => {
          hydrateFromVault();
        });
      }

      const afterSyncSrc = imgEl.getAttribute('src') || '';
      if (!afterSyncSrc || (!afterSyncSrc.startsWith('data:') && !afterSyncSrc.startsWith('blob:') && !/^https?:\/\//i.test(afterSyncSrc))) {
        hydrateFromVault();
      }
      const parentFig = imgEl.closest ? imgEl.closest('.captioned-image-container') : null;
      if (parentFig) {
        applySmartImageSizing(parentFig);
      }
    });
  }

  // =========================================================================
  // 3-COLUMN EDITOR MEDIA SELECTION POPUP
  // =========================================================================

  function renderEditorMediaPopup() {
    const draftSec = document.getElementById('sec-editor-draft-images');
    const draftGrid = document.getElementById('grid-editor-draft-images');
    const separator = document.getElementById('sep-editor-media');
    const libGrid = document.getElementById('grid-editor-media-library');
    const searchInput = document.getElementById('editor-media-search');
    const clearBtn = document.getElementById('btn-editor-media-search-clear');
    const insertSelectedBtn = document.getElementById('btn-insert-selected-image');
    if (!libGrid) return;

    if (insertSelectedBtn) {
      insertSelectedBtn.disabled = true;
    }
    window._selectedEditorMediaImg = null;

    const searchVal = (searchInput?.value || '').toLowerCase().trim();
    if (clearBtn) {
      clearBtn.style.display = searchVal ? 'flex' : 'none';
    }
    const cleanSearch = searchVal.replace(/^#+/, '').trim();

    // 1. Collect Active Draft Images for this post
    const draftImagesMap = new Map();
    const curDraft = window.currentDraft;
    if (curDraft) {
      if (typeof window.reconcileDraftImages === 'function') {
        window.reconcileDraftImages(curDraft);
      }
      if (Array.isArray(curDraft.images)) {
        curDraft.images.forEach(img => {
          if (img && img.filename) {
            draftImagesMap.set(img.filename, img);
          }
        });
      }
    }
    let draftImages = Array.from(draftImagesMap.values());
    if (searchVal) {
      draftImages = draftImages.filter(img =>
        (img.filename && img.filename.toLowerCase().includes(searchVal)) ||
        (img.postTitle && img.postTitle.toLowerCase().includes(searchVal)) ||
        (img.tags && img.tags.some(t => t.toLowerCase().includes(cleanSearch)))
      );
    }

    // 2. Collect General Media Library Images
    let libImages = (typeof window.getAllUniqueImages === 'function') ? window.getAllUniqueImages() : [];
    if (searchVal) {
      libImages = libImages.filter(img =>
        (img.filename && img.filename.toLowerCase().includes(searchVal)) ||
        (img.postTitle && img.postTitle.toLowerCase().includes(searchVal)) ||
        (img.tags && img.tags.some(t => t.toLowerCase().includes(cleanSearch)))
      );
    }

    function createMediaCard(img) {
      const item = document.createElement('div');
      item.className = 'editor-masonry-item';
      item.dataset.filename = img.filename;

      const src = img.objectUrl || img.dataUrl || (img.filename ? `blog/images/${img.filename}` : '');
      const displayTitle = img.title || (img.postTitle && img.postTitle !== 'Media Library' ? img.postTitle : img.filename);

      item.innerHTML = `
        <img src="${escapeHtml(src || '')}" alt="${escapeHtml(img.filename || '')}" class="editor-masonry-img" loading="lazy">
        <div class="editor-masonry-overlay">
          <span class="editor-masonry-title">${escapeHtml(displayTitle)}</span>
        </div>
      `;

      const imgEl = item.querySelector('.editor-masonry-img');
      const hydratePopupThumb = () => {
        if (typeof window.resolveMediaBlob !== 'function') return;
        window.resolveMediaBlob(img.filename, img).then(blob => {
          if (blob) {
            img.blob = blob;
            img.objectUrl = URL.createObjectURL(blob);
            if (!img.dataUrl || !img.dataUrl.startsWith('data:')) {
              img.dataUrl = img.objectUrl;
              const reader = new FileReader();
              reader.onloadend = () => {
                if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
                  img.dataUrl = reader.result;
                }
              };
              reader.readAsDataURL(blob);
            }
            if (imgEl) imgEl.src = img.dataUrl || img.objectUrl;
          }
        }).catch(() => {});
      };

      if (!src || (!src.startsWith('data:') && !src.startsWith('blob:'))) {
        hydratePopupThumb();
      } else if (imgEl) {
        imgEl.addEventListener('error', () => {
          hydratePopupThumb();
        }, { once: true });
      }

      // Single click: highlight image across either grid
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.editor-masonry-item').forEach(el => el.classList.remove('is-highlighted'));
        item.classList.add('is-highlighted');
        window._selectedEditorMediaImg = img;
        if (insertSelectedBtn) insertSelectedBtn.disabled = false;
      });

      // Double click: insert directly into post editor
      item.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertMediaIntoPostEditor(img);
      });

      return item;
    }

    // Render Draft Images section if any exist
    if (draftSec && draftGrid) {
      if (draftImages.length > 0) {
        draftSec.style.display = 'block';
        if (separator) separator.style.display = 'flex';
        draftGrid.innerHTML = '';
        draftImages.forEach(img => {
          draftGrid.appendChild(createMediaCard(img));
        });
      } else {
        draftSec.style.display = 'none';
        if (separator) separator.style.display = 'none';
        draftGrid.innerHTML = '';
      }
    }

    // Render Library Images
    libGrid.innerHTML = '';
    if (libImages.length === 0) {
      if (draftImages.length === 0) {
        if (searchVal) {
          libGrid.innerHTML = '<p class="empty-hint" style="column-span: all; text-align: center; padding: 2.5rem 1rem; color: var(--text-muted, #71717a); margin: 0;">No images match your search.</p>';
        } else {
          libGrid.innerHTML = `
            <div class="empty-hint" style="column-span: all; text-align: center; padding: 3rem 1rem; color: var(--text-muted, #71717a); margin: 0;">
              <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: var(--text-primary, #fff);">No images found in your media library.</p>
              <p style="margin: 0; font-size: 0.8rem;">Click "Upload" above to add images.</p>
            </div>
          `;
        }
      }
    } else {
      libImages.forEach(img => {
        libGrid.appendChild(createMediaCard(img));
      });
    }
  }

  function insertMediaIntoPostEditor(img) {
    if (!img) return;
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return;

    const cleanFn = (img.filename && img.filename !== 'img')
      ? String(img.filename).split('/').pop().split('\\').pop()
      : 'image.jpg';
    const relPath = (img.relativePath && !img.relativePath.startsWith('blob:') && !img.relativePath.startsWith('data:'))
      ? img.relativePath
      : `/blog/images/${cleanFn}`;
    const url = (img.dataUrl && img.dataUrl.startsWith('data:'))
      ? img.dataUrl
      : (img.objectUrl || img.dataUrl || relPath);
    const alt = cleanFn || 'Image';
    const cap = '';
    const figureHtml = createFigureHtml(url, relPath, cleanFn, alt, cap, "full");
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = figureHtml;
    const figureEl = tempDiv.firstElementChild;

    const curDraft = window.currentDraft;
    if (curDraft) {
      if (!curDraft.images) curDraft.images = [];
      if (!curDraft.tempImages) curDraft.tempImages = [];
      const imgObj = {
        filename: cleanFn,
        relativePath: relPath,
        dataUrl: url,
        objectUrl: img.objectUrl,
        blob: img.blob
      };
      if (!curDraft.images.some(i => i.filename === cleanFn)) {
        curDraft.images.push(imgObj);
      }
      if (!curDraft.tempImages.some(i => i.filename === cleanFn)) {
        curDraft.tempImages.push(imgObj);
      }
    }

    // Check if a placeholder slot is active in a gallery
    if (window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode) {
      const slot = window._activePlaceholderSlot;
      window._activePlaceholderSlot = null;
      populateGalleryPlaceholder(slot, {
        dataUrl: url,
        relativePath: relPath,
        filename: cleanFn,
        alt: alt
      });
      hydrateCanvasImages(canvasProse, curDraft);
      if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
      return;
    }

    // Check if this is an "+ Add Image" action to create or expand a multi-picture section
    if (window._activeAddMultiImageTarget && window._activeAddMultiImageTarget.parentNode) {
      const target = window._activeAddMultiImageTarget;
      window._activeAddMultiImageTarget = null;

      if (target.classList.contains('captioned-image-container')) {
        convertSingleImageToGallery(target, {
          dataUrl: url,
          relativePath: relPath,
          filename: cleanFn,
          alt: alt
        });
      } else if (target.classList.contains('custom-gallery-grid')) {
        addImageToGallery(target, {
          dataUrl: url,
          relativePath: relPath,
          filename: cleanFn,
          alt: alt
        });
      }

      hydrateCanvasImages(canvasProse, curDraft);
      if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
      return;
    }

    // Determine current/target block
    const isTargetSwap = Boolean(window._activeInsertTargetBlock);
    let currentBlock = window._activeInsertTargetBlock;
    window._activeInsertTargetBlock = null;

    if (!currentBlock || !currentBlock.parentNode || currentBlock.closest('#rich-canvas-prose') !== canvasProse) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== canvasProse) {
          if (node.parentNode === canvasProse) {
            currentBlock = node;
            break;
          }
          node = node.parentNode;
        }
      }
    }

    if (!currentBlock || currentBlock.parentNode !== canvasProse) {
      currentBlock = canvasProse.lastElementChild;
    }

    function isBlockEmpty(el) {
      if (typeof window.isTrulyEmptyBlock === 'function') {
        return window.isTrulyEmptyBlock(el);
      }
      if (!el) return true;
      if (el.tagName !== 'P' && el.tagName !== 'DIV') return false;
      if (el.getAttribute('contenteditable') === 'false') return false;
      if (el.querySelector('img, iframe, video, hr, input, button, .custom-gallery-grid')) return false;
      const clean = el.textContent.replace(/[\s\u200B\u00A0]+/g, '');
      return clean.length === 0;
    }

    if (window.commitCheckpoint) window.commitCheckpoint();

    if (typeof window.insertOrReplaceBlockInCanvas === 'function') {
      window.insertOrReplaceBlockInCanvas(currentBlock, figureEl, canvasProse);
    } else if (!currentBlock) {
      canvasProse.appendChild(figureEl);
    } else if (isBlockEmpty(currentBlock)) {
      currentBlock.parentNode.replaceChild(figureEl, currentBlock);
    } else {
      currentBlock.parentNode.insertBefore(figureEl, currentBlock.nextSibling);
    }

    if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
    const trailingP = typeof window.ensureTrailingTextBlock === 'function' ? window.ensureTrailingTextBlock() : null;
    hydrateCanvasImages(canvasProse, curDraft);

    if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
    if (window.recordAction) window.recordAction('image-insert', true);

    if (trailingP && typeof window.focusNodeCaret === 'function') {
      window.focusNodeCaret(trailingP, false);
    } else if (canvasProse) {
      canvasProse.focus();
    }

    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.showToast === 'function') window.showToast('Image inserted!');
  }

  // =========================================================================
  // INSERT HTML AT CURSOR
  // =========================================================================

  function insertHtmlAtCursor(html) {
    if (window.commitCheckpoint) window.commitCheckpoint();
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return;
    canvasProse.focus();

    // Check if html contains top-level block elements
    const isBlockHtml = /^\s*<(div|figure|blockquote|hr|pre)/i.test(html);
    if (isBlockHtml) {
      if (typeof window.restoreEditorSelection === 'function') window.restoreEditorSelection();
      const sel = window.getSelection();
      let currentBlock = null;
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        while (node && node.parentNode !== canvasProse && node !== canvasProse) {
          node = node.parentNode;
        }
        if (node && node.parentNode === canvasProse) {
          currentBlock = node;
        }
      }

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const newBlock = tempDiv.firstElementChild;

      if (newBlock) {
        if (typeof window.insertOrReplaceBlockInCanvas === 'function') {
          window.insertOrReplaceBlockInCanvas(currentBlock, newBlock, canvasProse);
        } else if (currentBlock && (!currentBlock.textContent.trim() || currentBlock.innerHTML === '<br>')) {
          currentBlock.parentNode.replaceChild(newBlock, currentBlock);
        } else if (currentBlock) {
          currentBlock.parentNode.insertBefore(newBlock, currentBlock.nextSibling);
        } else {
          canvasProse.appendChild(newBlock);
        }
        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        if (window.recordAction) window.recordAction('insert-html', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }
    }

    let inserted = false;
    const savedRange = window._savedSelectionRange;
    if (savedRange) {
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
        inserted = document.execCommand('insertHTML', false, html);
      } catch (e) {
        inserted = false;
      }
    }
    if (!inserted) {
      try {
        inserted = document.execCommand('insertHTML', false, html);
      } catch (e) {
        inserted = false;
      }
    }
    if (!inserted) {
      canvasProse.insertAdjacentHTML('beforeend', html);
    }
    if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
    if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
    if (window.recordAction) window.recordAction('insert-html', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  // =========================================================================
  // CLIPBOARD & DRAG/DROP SANITIZED IMAGE HANDLER
  // =========================================================================

  function setupImageClipboardAndDrop() {
    const canvasProse = document.getElementById('rich-canvas-prose');

    // 1. Central paste event listener (Ctrl+V with screenshot/image/file)
    async function handlePasteEvent(e) {
      if ((e._cedarImageHandled || e._outpostImageHandled)) return;

      const viewEditor = document.getElementById('view-editor');
      if (!canvasProse) return;

      // Only handle paste if editor view is active
      const isEditorVisible = (viewEditor && viewEditor.style.display !== 'none') ||
                              window.currentView === 'editor' ||
                              window.location.hash.startsWith('#write') ||
                              window.location.hash.startsWith('#editor') ||
                              (canvasProse && canvasProse.offsetParent !== null);
      if (!isEditorVisible) return;

      // Don't intercept paste inside foreign modals or global search input
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.id === 'global-search-input' || activeEl.closest('#modal-settings, #modal-export, #modal-import, #modal-ftue'))) {
        return;
      }

      const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
      if (!clipboardData) return;

      const imageFiles = [];

      // Check clipboard files first (e.g. copied from Windows Explorer or screenshot tool)
      if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const f = clipboardData.files[i];
          if (f && (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(f.name))) {
            imageFiles.push(f);
          }
        }
      }

      // Also check clipboard items
      if (imageFiles.length === 0 && clipboardData.items && clipboardData.items.length > 0) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item && (item.type.indexOf('image') !== -1 || item.kind === 'file')) {
            const f = item.getAsFile();
            if (f && (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(f.name))) {
              imageFiles.push(f);
            }
          }
        }
      }

      if (imageFiles.length > 0) {
        e._cedarImageHandled = true;
        e._outpostImageHandled = true;
        e.preventDefault();
        e.stopPropagation();

        for (let i = 0; i < imageFiles.length; i++) {
          await handleImageUploadAndInsert(imageFiles[i]);
        }
        return;
      }

      // Check if text/plain or text/html contains an image URL or image tag
      const plainText = (clipboardData.getData('text/plain') || '').trim();
      const htmlText = clipboardData.getData('text/html') || '';

      let detectedUrl = null;
      let detectedAlt = 'Image';
      const mdMatch = plainText.match(/!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/i);
      if (mdMatch) {
        detectedAlt = mdMatch[1] || 'Image';
        detectedUrl = mdMatch[2];
      } else if (/^https?:\/\/[^\s]+?\.(png|jpe?g|webp|gif|svg|avif)(\?[^\s]*)?$/i.test(plainText) || /^https?:\/\/images\.unsplash\.com\/[^\s]+$/i.test(plainText)) {
        detectedUrl = plainText;
      } else if (htmlText) {
        const imgMatch = htmlText.match(/<img[^>]+src=["'](https?:\/\/[^"']+|data:image\/[^"']+|blob:[^"']+|\/?blog\/images\/[^"']+)["']/i) ||
                         (!plainText ? htmlText.match(/<img[^>]+src=["']([^"']+)["']/i) : null);
        if (imgMatch && imgMatch[1]) {
          detectedUrl = imgMatch[1];
        }
      }

      if (detectedUrl) {
        e._cedarImageHandled = true;
        e._outpostImageHandled = true;
        e.preventDefault();
        e.stopPropagation();

        try {
          if (detectedUrl.startsWith('data:image/')) {
            const arr = detectedUrl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            await handleImageUploadAndInsert(blob);
            return;
          }

          const resp = await fetch(detectedUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob && blob.type.startsWith('image/')) {
              await handleImageUploadAndInsert(blob);
              return;
            }
          }
        } catch (err) {}

        await handleImageUploadAndInsert({
          src: detectedUrl,
          dataUrl: detectedUrl,
          relativePath: detectedUrl,
          filename: 'web-image.jpg',
          alt: detectedAlt
        });
        return;
      }

      // If text/HTML was pasted, ensure any raw/inline images are normalized into standalone figure boxes and adjacent lists are merged
      setTimeout(() => {
        if (canvasProse) {
          normalizeRawImages(canvasProse);
          ensureImageCaptionElements(canvasProse);
          if (window.mergeAdjacentLists) {
            window.mergeAdjacentLists(canvasProse);
          }
        }
      }, 10);
    }

    // Attach to both document and canvasProse so paste is caught regardless of focus state
    document.addEventListener('paste', handlePasteEvent);
    if (canvasProse) {
      canvasProse.addEventListener('paste', handlePasteEvent);
    }

    // 2. Drag & Drop on prose canvas (for external image files, web images, and HTML)
    function resolveDropTargetBlock(e, canvasProse) {
      if (!canvasProse) return null;
      const target = e.target;

      // Check if dropped on a placeholder slot
      const slot = target.closest ? target.closest('.gallery-slot-placeholder') : null;
      if (slot) return slot;

      // Check if dropped directly on or within an image block or gallery
      const imgBlock = target.closest ? target.closest('.captioned-image-container, .custom-gallery-grid') : null;
      if (imgBlock) return imgBlock;

      // Find caret position from mouse coordinates
      let dropRange = null;
      if (document.caretRangeFromPoint) {
        dropRange = document.caretRangeFromPoint(e.clientX, e.clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) {
          dropRange = document.createRange();
          dropRange.setStart(pos.offsetNode, pos.offset);
          dropRange.collapse(true);
        }
      }

      if (dropRange) {
        let node = dropRange.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        while (node && node.parentNode !== canvasProse && node !== canvasProse) {
          node = node.parentNode;
        }
        if (node && node.parentNode === canvasProse) {
          return node;
        }
      }

      // Check ancestor up to canvasProse
      let curr = target;
      while (curr && curr.parentNode !== canvasProse && curr !== canvasProse) {
        curr = curr.parentNode;
      }
      if (curr && curr.parentNode === canvasProse) {
        return curr;
      }

      // If dropped on margins or scroll container, find vertically closest child block
      const children = Array.from(canvasProse.children);
      if (children.length > 0) {
        for (let i = 0; i < children.length; i++) {
          const rect = children[i].getBoundingClientRect();
          if (e.clientY < rect.bottom) {
            return children[i];
          }
        }
        return children[children.length - 1];
      }

      return null;
    }

    function isExternalImageDrag(e) {
      if (document.body.classList.contains('is-dragging-active')) return false;
      if (!e.dataTransfer) return false;
      const types = Array.from(e.dataTransfer.types || []);
      if (types.includes('Files')) return true;
      if (types.includes('text/uri-list')) return true;
      if (types.includes('text/html')) return true;
      if (types.some(t => t.toLowerCase().includes('image'))) return true;
      return false;
    }

    const onDragOver = (e) => {
      if (!isExternalImageDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (canvasProse) canvasProse.classList.add('dragover');

      const slot = e.target.closest ? e.target.closest('.gallery-slot-placeholder') : null;
      if (canvasProse) {
        canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(el => {
          if (el !== slot) el.classList.remove('dragover-slot');
        });
      }
      if (slot) slot.classList.add('dragover-slot');
    };

    const onDragLeave = (e) => {
      if (!e.relatedTarget || (!canvasProse?.contains(e.relatedTarget) && !scrollContainer?.contains(e.relatedTarget))) {
        if (canvasProse) {
          canvasProse.classList.remove('dragover');
          canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(el => el.classList.remove('dragover-slot'));
        }
      }
    };

    const onDrop = async (e) => {
      if (e._cedarInternalDropHandled || document.body.classList.contains('is-dragging-active')) return;
      if (canvasProse) {
        canvasProse.classList.remove('dragover');
        canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(el => el.classList.remove('dragover-slot'));
      }

      const dt = e.dataTransfer;
      if (!dt) return;

      const files = dt.files ? Array.from(dt.files) : [];
      const imageFiles = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(f.name));

      if (imageFiles.length === 0 && dt.items) {
        for (let i = 0; i < dt.items.length; i++) {
          const item = dt.items[i];
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f && (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(f.name))) {
              imageFiles.push(f);
            }
          }
        }
      }

      let detectedUrl = null;
      let detectedAlt = 'Image';
      const html = dt.getData('text/html') || '';
      const uriList = dt.getData('text/uri-list') || '';
      const plainText = (dt.getData('text/plain') || '').trim();

      if (imageFiles.length === 0) {
        if (html) {
          const imgMatch = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+|data:image\/[^"']+)["']/i);
          if (imgMatch) {
            detectedUrl = imgMatch[1];
            const altMatch = html.match(/<img[^>]+alt=["']([^"']*)["']/i);
            if (altMatch && altMatch[1]) detectedAlt = altMatch[1];
          }
        }
        if (!detectedUrl && uriList) {
          const lines = uriList.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
          if (lines.length > 0 && (/^https?:\/\//i.test(lines[0]) || lines[0].startsWith('data:image/'))) {
            detectedUrl = lines[0];
          }
        }
        if (!detectedUrl && plainText) {
          const mdMatch = plainText.match(/!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/i);
          if (mdMatch) {
            detectedAlt = mdMatch[1] || 'Image';
            detectedUrl = mdMatch[2];
          } else if (/^https?:\/\/[^\s]+?\.(png|jpe?g|webp|gif|svg|avif)(\?[^\s]*)?$/i.test(plainText) || /^https?:\/\/images\.unsplash\.com\/[^\s]+$/i.test(plainText)) {
            detectedUrl = plainText;
          }
        }
      }

      if (imageFiles.length === 0 && !detectedUrl) return;

      e.preventDefault();
      e.stopPropagation();

      const targetBlock = resolveDropTargetBlock(e, canvasProse);

      if (imageFiles.length > 0) {
        let currTarget = targetBlock;
        for (let i = 0; i < imageFiles.length; i++) {
          await handleImageUploadAndInsert(imageFiles[i], currTarget);
        }
        return;
      }

      if (detectedUrl) {
        try {
          if (detectedUrl.startsWith('data:image/')) {
            const arr = detectedUrl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            await handleImageUploadAndInsert(blob, targetBlock);
            return;
          }

          const resp = await fetch(detectedUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob && blob.type.startsWith('image/')) {
              await handleImageUploadAndInsert(blob, targetBlock);
              return;
            }
          }
        } catch (err) {}

        await handleImageUploadAndInsert({
          src: detectedUrl,
          dataUrl: detectedUrl,
          relativePath: detectedUrl,
          filename: detectedUrl.split('/').pop().split('?')[0] || 'web-image.jpg',
          alt: detectedAlt
        }, targetBlock);
      }
    };

    const scrollContainer = canvasProse ? (canvasProse.closest('.canvas-scroll-container') || document.querySelector('.canvas-scroll-container')) : null;

    if (canvasProse) {
      canvasProse.addEventListener('dragover', onDragOver);
      canvasProse.addEventListener('dragleave', onDragLeave);
      canvasProse.addEventListener('drop', onDrop);
    }
    if (scrollContainer && scrollContainer !== canvasProse) {
      scrollContainer.addEventListener('dragover', onDragOver);
      scrollContainer.addEventListener('dragleave', onDragLeave);
      scrollContainer.addEventListener('drop', onDrop);
    }

    // MutationObserver on canvasProse to auto-normalize any raw <img> elements
    if (canvasProse && !canvasProse._hasRawImageObserver) {
      canvasProse._hasRawImageObserver = true;
      const observer = new MutationObserver((mutations) => {
        let needsNormalize = false;
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'IMG' && !node.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .image-sanitizing-placeholder, .gallery-split-img-box, .page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card')) {
                needsNormalize = true;
                break;
              }
              if (node.querySelector) {
                const candidateImgs = Array.from(node.querySelectorAll('img')).filter(img => {
                  return !img.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .image-sanitizing-placeholder, .gallery-split-img-box, .page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card');
                });
                if (candidateImgs.length > 0) {
                  needsNormalize = true;
                  break;
                }
              }
            }
          }
          if (needsNormalize) break;
        }
        if (needsNormalize) {
          setTimeout(() => {
            normalizeRawImages(canvasProse);
            ensureImageCaptionElements(canvasProse);
          }, 0);
        }
      });
      observer.observe(canvasProse, { childList: true, subtree: true });
    }

    // 3. Drop zone in Image Manager Modal
    const mgrDropzone = document.getElementById('img-mgr-dropzone');
    const mgrFileInput = document.getElementById('img-mgr-file-input');

    if (mgrDropzone) {
      mgrDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        mgrDropzone.classList.add('dragover');
      });

      mgrDropzone.addEventListener('dragleave', () => {
        mgrDropzone.classList.remove('dragover');
      });

      mgrDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        mgrDropzone.classList.remove('dragover');
        if (e.dataTransfer.files) {
          handleImageManagerFiles(e.dataTransfer.files);
        }
      });
    }

    if (mgrFileInput) {
      mgrFileInput.addEventListener('change', (e) => {
        if (e.target.files) {
          handleImageManagerFiles(e.target.files);
        }
      });
    }
  }

  async function handleImageUploadAndInsert(fileOrObj, explicitTargetBlock) {
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return;

    // If an active placeholder slot is waiting for an image, or explicitTargetBlock is a slot, populate it!
    const slot = (explicitTargetBlock && explicitTargetBlock.classList && explicitTargetBlock.classList.contains('gallery-slot-placeholder') && canvasProse.contains(explicitTargetBlock))
      ? explicitTargetBlock
      : (window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode && canvasProse.contains(window._activePlaceholderSlot) ? window._activePlaceholderSlot : null);

    if (slot) {
      window._activePlaceholderSlot = null;
      try {
        const sanitizedObj = await getSanitized(fileOrObj);
        const curDraft = window.currentDraft;
        if (curDraft) {
          if (!curDraft.images) curDraft.images = [];
          if (!curDraft.tempImages) curDraft.tempImages = [];
          if (!curDraft.images.some(im => im.filename === sanitizedObj.filename)) {
            curDraft.images.push(sanitizedObj);
          }
          if (!curDraft.tempImages.some(im => im.filename === sanitizedObj.filename)) {
            curDraft.tempImages.push(sanitizedObj);
          }
        }
        populateGalleryPlaceholder(slot, sanitizedObj);
        return;
      } catch (err) {
        console.error('Placeholder populate error:', err);
        if (typeof window.showToast === 'function') window.showToast('Failed to process and add image to gallery slot.');
        return;
      }
    }

    if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);

    async function getSanitized(input) {
      const slug = window.currentDraft ? window.currentDraft.slug : 'article';
      if (input instanceof Blob || (typeof File !== 'undefined' && input instanceof File)) {
        if (typeof window.sanitizeImage === 'function') {
          return await window.sanitizeImage(input, slug);
        }
        return {
          filename: input.name || ('image-' + Date.now().toString(36) + '.jpg'),
          relativePath: `blog/images/${input.name || 'image.jpg'}`,
          dataUrl: URL.createObjectURL(input),
          src: URL.createObjectURL(input),
          alt: input.name || 'Image'
        };
      } else if (input && (input.src || input.dataUrl)) {
        return {
          filename: input.filename || ('image-' + Date.now().toString(36) + '.jpg'),
          relativePath: input.relativePath || input.src || input.dataUrl,
          dataUrl: input.dataUrl || input.src,
          src: input.src || input.dataUrl,
          alt: input.alt || 'Image'
        };
      }
      throw new Error('Unsupported image input');
    }

    // 1. Resolve whether we are targeting an existing image block to merge into a multi-picture gallery
    let targetImageBlock = null;

    if (explicitTargetBlock && (explicitTargetBlock.classList.contains('captioned-image-container') || explicitTargetBlock.classList.contains('custom-gallery-grid'))) {
      targetImageBlock = explicitTargetBlock;
    } else if (window._activeAddMultiImageTarget && window._activeAddMultiImageTarget.parentNode && canvasProse.contains(window._activeAddMultiImageTarget)) {
      targetImageBlock = window._activeAddMultiImageTarget;
      window._activeAddMultiImageTarget = null;
    }

    // IF TARGETING AN EXISTING IMAGE BLOCK: MERGE INTO MULTI-IMAGE GALLERY!
    if (targetImageBlock && (targetImageBlock.classList.contains('captioned-image-container') || targetImageBlock.classList.contains('custom-gallery-grid'))) {
      try {
        const sanitizedObj = await getSanitized(fileOrObj);
        const curDraft = window.currentDraft;
        if (curDraft) {
          if (!curDraft.images) curDraft.images = [];
          if (!curDraft.tempImages) curDraft.tempImages = [];
          if (!curDraft.images.some(im => im.filename === sanitizedObj.filename)) {
            curDraft.images.push(sanitizedObj);
          }
          if (!curDraft.tempImages.some(im => im.filename === sanitizedObj.filename)) {
            curDraft.tempImages.push(sanitizedObj);
          }
        }

        if (targetImageBlock.classList.contains('captioned-image-container')) {
          convertSingleImageToGallery(targetImageBlock, sanitizedObj);
        } else if (targetImageBlock.classList.contains('custom-gallery-grid')) {
          addImageToGallery(targetImageBlock, sanitizedObj);
        }

        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        ensureImageCaptionElements(canvasProse);

        if (typeof window.updateImagesCount === 'function') window.updateImagesCount();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.showToast === 'function') window.showToast(`Image added to gallery & organized into blog/images/${sanitizedObj.filename}!`);
        return;
      } catch (err) {
        console.error('Image sanitization/merge error:', err);
        if (typeof window.showToast === 'function') window.showToast('Failed to process and add image to gallery.');
        return;
      }
    }

    // 2. Otherwise: standard single image insertion
    const isTargetSwap = Boolean(explicitTargetBlock || window._activeInsertTargetBlock);
    let currentBlock = explicitTargetBlock || window._activeInsertTargetBlock;
    window._activeInsertTargetBlock = null;

    if (!currentBlock || !currentBlock.parentNode || currentBlock.closest('#rich-canvas-prose') !== canvasProse) {
      if (typeof window.restoreEditorSelection === 'function') window.restoreEditorSelection();
      const sel = window.getSelection();
      currentBlock = null;
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        while (node && node.parentNode !== canvasProse && node !== canvasProse) {
          node = node.parentNode;
        }
        if (node && node.parentNode === canvasProse) {
          currentBlock = node;
        }
      }
    }

    // If no block selected or if canvas only contains empty paragraphs, target appropriately
    const allChildren = Array.from(canvasProse.children);
    const allEmpty = allChildren.length > 0 && allChildren.every(c => c.tagName === 'P' && (!c.textContent.trim() || c.innerHTML === '<br>'));
    if (allEmpty) {
      currentBlock = allChildren[0];
    } else if (!currentBlock && canvasProse.children.length > 0) {
      const lastChild = canvasProse.lastElementChild;
      if (lastChild && lastChild.tagName === 'P' && (!lastChild.textContent.trim() || lastChild.innerHTML === '<br>')) {
        currentBlock = lastChild;
      }
    }

    if (window.commitCheckpoint) window.commitCheckpoint();
    const placeholderId = 'ph_' + Date.now();
    const placeholderDiv = document.createElement('div');
    placeholderDiv.className = 'image-sanitizing-placeholder';
    placeholderDiv.id = placeholderId;
    placeholderDiv.innerHTML = `<div class="sanitizing-spinner"></div><span class="sanitizing-text">Sanitizing & saving image for blog/images/...</span>`;

    // Insert placeholder cleanly: only replace currentBlock if it is a truly blank block
    if (typeof window.insertOrReplaceBlockInCanvas === 'function') {
      window.insertOrReplaceBlockInCanvas(currentBlock, placeholderDiv, canvasProse);
    } else if (currentBlock && (!currentBlock.textContent.trim() || currentBlock.innerHTML === '<br>')) {
      currentBlock.parentNode.replaceChild(placeholderDiv, currentBlock);
    } else if (currentBlock) {
      currentBlock.parentNode.insertBefore(placeholderDiv, currentBlock.nextSibling);
    } else {
      canvasProse.appendChild(placeholderDiv);
    }

    try {
      const sanitizedObj = await getSanitized(fileOrObj);
      const curDraft = window.currentDraft;
      if (curDraft) {
        if (!curDraft.images) curDraft.images = [];
        if (!curDraft.tempImages) curDraft.tempImages = [];
        if (!curDraft.images.some(im => im.filename === sanitizedObj.filename)) {
          curDraft.images.push(sanitizedObj);
        }
        if (!curDraft.tempImages.some(im => im.filename === sanitizedObj.filename)) {
          curDraft.tempImages.push(sanitizedObj);
        }
      }

      const placeholderEl = document.getElementById(placeholderId);
      if (placeholderEl && placeholderEl.parentNode) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createFigureHtml(sanitizedObj.dataUrl, sanitizedObj.relativePath, sanitizedObj.filename, 'Image', '', 'full');
        const figureContainer = tempDiv.firstElementChild;
        placeholderEl.parentNode.replaceChild(figureContainer, placeholderEl);

        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
        const trailingP = typeof window.ensureTrailingTextBlock === 'function' ? window.ensureTrailingTextBlock() : null;
        ensureImageCaptionElements(canvasProse);

        if (window.recordAction) window.recordAction('image-insert', true);

        if (trailingP && typeof window.focusNodeCaret === 'function') {
          window.focusNodeCaret(trailingP, false);
        } else if (canvasProse) {
          canvasProse.focus();
        }
      }

      if (typeof window.updateImagesCount === 'function') window.updateImagesCount();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      if (typeof window.showToast === 'function') window.showToast(`Image sanitized & organized into blog/images/${sanitizedObj.filename}!`);
    } catch (err) {
      console.error('Image sanitization error:', err);
      const placeholderEl = document.getElementById(placeholderId);
      if (placeholderEl && placeholderEl.parentNode) placeholderEl.remove();
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
      if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
      if (typeof window.showToast === 'function') window.showToast('Failed to process and sanitize image.');
    }
  }

  async function handleImageManagerFiles(fileList) {
    let addedCount = 0;
    const curDraft = window.currentDraft;
    const slug = curDraft ? curDraft.slug : 'article';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type.startsWith('image/')) {
        try {
          if (typeof window.sanitizeImage === 'function') {
            const sanitizedObj = await window.sanitizeImage(file, slug);
            if (curDraft) {
              if (!curDraft.images) curDraft.images = [];
              curDraft.images.push(sanitizedObj);
            }
            addedCount++;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (addedCount > 0) {
      if (typeof window.renderImageManagerList === 'function') window.renderImageManagerList();
      if (typeof window.updateImagesCount === 'function') window.updateImagesCount();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      if (typeof window.showToast === 'function') window.showToast(`Sanitized & added ${addedCount} image(s) to post!`);
    }
  }

  // =========================================================================
  // MODAL CONTROLS & DIALOG WIRING
  // =========================================================================

  function setupEditorMediaModalControls() {
    const edMediaSearch = document.getElementById('editor-media-search');
    const edMediaSearchClear = document.getElementById('btn-editor-media-search-clear');
    if (edMediaSearch && !edMediaSearch._hasCedarMediaListener) {
      edMediaSearch._hasCedarMediaListener = true;
      edMediaSearch.addEventListener('input', () => {
        renderEditorMediaPopup();
      });
    }
    if (edMediaSearchClear && !edMediaSearchClear._hasCedarMediaListener) {
      edMediaSearchClear._hasCedarMediaListener = true;
      edMediaSearchClear.addEventListener('click', () => {
        if (edMediaSearch) {
          edMediaSearch.value = '';
          edMediaSearch.focus();
        }
        renderEditorMediaPopup();
      });
    }

    const btnEdUpload = document.getElementById('btn-editor-upload-image');
    const inputEdUpload = document.getElementById('input-editor-media-upload');
    if (btnEdUpload && inputEdUpload && !btnEdUpload._hasCedarMediaListener) {
      btnEdUpload._hasCedarMediaListener = true;
      btnEdUpload.addEventListener('click', () => {
        inputEdUpload.click();
      });
      inputEdUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0 && typeof window.handleMediaUpload === 'function') {
          await window.handleMediaUpload(files);
          inputEdUpload.value = '';
          renderEditorMediaPopup();
        }
      });
    }

    const btnInsertSelected = document.getElementById('btn-insert-selected-image');
    if (btnInsertSelected && !btnInsertSelected._hasCedarMediaListener) {
      btnInsertSelected._hasCedarMediaListener = true;
      btnInsertSelected.addEventListener('click', () => {
        if (window._selectedEditorMediaImg) {
          insertMediaIntoPostEditor(window._selectedEditorMediaImg);
        }
      });
    }

    const btnToggleManualUrl = document.getElementById('btn-toggle-manual-url');
    const manualUrlSec = document.getElementById('editor-manual-url-section');
    if (btnToggleManualUrl && manualUrlSec && !btnToggleManualUrl._hasCedarMediaListener) {
      btnToggleManualUrl._hasCedarMediaListener = true;
      btnToggleManualUrl.addEventListener('click', () => {
        const isHidden = manualUrlSec.style.display === 'none';
        manualUrlSec.style.display = isHidden ? 'block' : 'none';
        btnToggleManualUrl.textContent = isHidden ? 'Hide manual URL fields' : 'Or insert by URL / Caption...';
      });
    }

    // Connect Image / YouTube / Gallery Confirm Dialogs
    const btnConfirmImg = document.getElementById('btn-confirm-insert-image');
    if (btnConfirmImg && !btnConfirmImg._hasCedarMediaListener) {
      btnConfirmImg._hasCedarMediaListener = true;
      btnConfirmImg.addEventListener('click', () => {
        const url = (document.getElementById('img-dialog-url')?.value || '').trim();
        const cap = (document.getElementById('img-dialog-caption')?.value || '').trim();
        const alt = (document.getElementById('img-dialog-alt')?.value || '').trim() || 'Image';
        if (!url) {
          alert('Please provide an image URL.');
          return;
        }

        // Check if a placeholder slot is active in a gallery
        if (window._activePlaceholderSlot && window._activePlaceholderSlot.parentNode) {
          const slot = window._activePlaceholderSlot;
          window._activePlaceholderSlot = null;
          populateGalleryPlaceholder(slot, {
            dataUrl: url,
            relativePath: url,
            filename: 'img',
            alt: alt
          });
          if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
          return;
        }

        // Check if this is an "+ Add Image" action to create or expand a multi-picture section
        if (window._activeAddMultiImageTarget && window._activeAddMultiImageTarget.parentNode) {
          const target = window._activeAddMultiImageTarget;
          window._activeAddMultiImageTarget = null;

          if (target.classList.contains('captioned-image-container')) {
            convertSingleImageToGallery(target, {
              dataUrl: url,
              relativePath: url,
              filename: 'img',
              alt: alt
            });
          } else if (target.classList.contains('custom-gallery-grid')) {
            addImageToGallery(target, {
              dataUrl: url,
              relativePath: url,
              filename: 'img',
              alt: alt
            });
          }

          if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
          return;
        }

        const canvasProse = document.getElementById('rich-canvas-prose');
        // Check if an active block was targeted for Images
        if (window._activeInsertTargetBlock && window._activeInsertTargetBlock.parentNode) {
          const target = window._activeInsertTargetBlock;
          window._activeInsertTargetBlock = null;
          if (window.commitCheckpoint) window.commitCheckpoint();
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = createFigureHtml(url, url, "img", alt, cap, "full");
          const newFigure = tempDiv.firstElementChild;
          if (typeof window.insertOrReplaceBlockInCanvas === 'function') {
            window.insertOrReplaceBlockInCanvas(target, newFigure, canvasProse);
          } else {
            target.parentNode.insertBefore(newFigure, target.nextSibling);
          }
          window._lastActiveBlock = newFigure;
          if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
          if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
          if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Image block inserted!');
          return;
        }

        insertHtmlAtCursor(createFigureHtml(url, url, "img", alt, cap, "full"));
        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        if (typeof window.closeModal === 'function') window.closeModal('modal-insert-image');
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      });
    }

    const btnConfirmYt = document.getElementById('btn-confirm-insert-youtube');
    if (btnConfirmYt && !btnConfirmYt._hasCedarMediaListener) {
      btnConfirmYt._hasCedarMediaListener = true;
      btnConfirmYt.addEventListener('click', () => {
        const val = (document.getElementById('yt-dialog-url')?.value || '').trim();
        const ytId = (typeof window.extractYouTubeId === 'function') ? window.extractYouTubeId(val) : val;
        if (!ytId) {
          alert('Please enter a valid YouTube URL or 11-character video ID.');
          return;
        }
        const videoHtml = `<div class="video-wrapper" contenteditable="false" data-block-type="media" draggable="true"><iframe src="https://www.youtube-nocookie.com/embed/${ytId}?rel=0&amp;autoplay=0&amp;showinfo=0&amp;enablejsapi=0" width="728" height="409" frameborder="0" allow="autoplay; fullscreen" allowfullscreen="true" loading="lazy"></iframe><div class="figure-hover-actions"><button type="button" class="figure-action-btn btn-move-block-up" title="Move Up"> </button><button type="button" class="figure-action-btn btn-move-block-down" title="Move Down"> </button><div class="figure-action-sep"></div><button type="button" class="figure-action-btn btn-delete-fig" title="Delete Media"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Delete</span></button></div></div>`;
        const canvasProse = document.getElementById('rich-canvas-prose');

        if (window._activeInsertTargetBlock && window._activeInsertTargetBlock.parentNode) {
          const target = window._activeInsertTargetBlock;
          window._activeInsertTargetBlock = null;
          if (window.commitCheckpoint) window.commitCheckpoint();
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = videoHtml;
          const newVideo = tempDiv.firstElementChild;
          if (typeof window.insertOrReplaceBlockInCanvas === 'function') {
            window.insertOrReplaceBlockInCanvas(target, newVideo, canvasProse);
          } else {
            target.parentNode.insertBefore(newVideo, target.nextSibling);
          }
          window._lastActiveBlock = newVideo;
          if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
          if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
          if (typeof window.closeModal === 'function') window.closeModal('modal-insert-youtube');
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Embedded media block inserted!');
          return;
        }

        insertHtmlAtCursor(videoHtml);
        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        if (typeof window.closeModal === 'function') window.closeModal('modal-insert-youtube');
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      });
    }

    const btnConfirmGal = document.getElementById('btn-confirm-insert-gallery');
    if (btnConfirmGal && !btnConfirmGal._hasCedarMediaListener) {
      btnConfirmGal._hasCedarMediaListener = true;
      btnConfirmGal.addEventListener('click', () => {
        const raw = (document.getElementById('gallery-dialog-urls')?.value || '').trim();
        const cap = (document.getElementById('gallery-dialog-caption')?.value || '').trim();
        const urls = raw.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) {
          alert('Please provide at least one image URL.');
          return;
        }
        const images = urls.map(u => ({ src: u, originalSrc: u, alt: '' }));
        let block = createGalleryHtml(images, true);
        if (cap) block += `<p class="gallery-caption" contenteditable="true">${escapeHtml(cap)}</p>`;
        block += `<p><br></p>`;
        insertHtmlAtCursor(block);
        if (typeof window.closeModal === 'function') window.closeModal('modal-insert-gallery');
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      });
    }

    const btnConfirmAdj = document.getElementById('btn-confirm-insert-adjacent-posts');
    if (btnConfirmAdj && !btnConfirmAdj._hasCedarMediaListener) {
      btnConfirmAdj._hasCedarMediaListener = true;
      btnConfirmAdj.addEventListener('click', () => {
        const prevTitle = (document.getElementById('dialog-nav-prev-title')?.value || '').trim();
        const prevSlug = (document.getElementById('dialog-nav-prev-slug')?.value || '').trim();
        const nextTitle = (document.getElementById('dialog-nav-next-title')?.value || '').trim();
        const nextSlug = (document.getElementById('dialog-nav-next-slug')?.value || '').trim();

        const hasPrev = prevTitle || prevSlug;
        const hasNext = nextTitle || nextSlug;

        let gridHtml = '<div class="post-nav-grid" contenteditable="false" style="margin: 2.5rem 0;">\n';
        if (hasPrev || !hasNext) {
          const pTitle = prevTitle || 'Previous Article';
          const pSlug = prevSlug ? (prevSlug.startsWith('/') || prevSlug.startsWith('http') ? prevSlug : `/blog/${prevSlug}/`) : '#';
          gridHtml += `  <a href="${escapeHtml(pSlug)}" class="post-nav-card" onclick="return false;">\n` +
                      `    <span class="post-nav-dir">&larr; Older Article</span>\n` +
                      `    <span class="post-nav-title" contenteditable="true">${escapeHtml(pTitle)}</span>\n` +
                      `  </a>\n`;
        }
        if (hasNext || !hasPrev) {
          const nTitle = nextTitle || 'Next Article';
          const nSlug = nextSlug ? (nextSlug.startsWith('/') || nextSlug.startsWith('http') ? nextSlug : `/blog/${nextSlug}/`) : '#';
          gridHtml += `  <a href="${escapeHtml(nSlug)}" class="post-nav-card next" onclick="return false;">\n` +
                      `    <span class="post-nav-dir">Newer Article &rarr;</span>\n` +
                      `    <span class="post-nav-title" contenteditable="true">${escapeHtml(nTitle)}</span>\n` +
                      `  </a>\n`;
        }
        gridHtml += '</div><p><br></p>';

        if (typeof window.activeMode !== 'undefined' && window.activeMode === 'markdown') {
          if (typeof window.insertMarkdownAtCursor === 'function') {
            window.insertMarkdownAtCursor('\n' + gridHtml + '\n');
          }
        } else {
          insertHtmlAtCursor(gridHtml);
        }
        if (typeof window.closeModal === 'function') window.closeModal('modal-insert-adjacent-posts');
        if (typeof window.showToast === 'function') window.showToast('Inserted Next / Previous Posts block!');
      });
    }
  }

  // Auto-connect modal controls on DOM ready or immediate if ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEditorMediaModalControls);
  } else {
    setTimeout(setupEditorMediaModalControls, 0);
  }

  // =========================================================================
  // GLOBAL & NAMESPACE EXPORTS
  // =========================================================================

  window.normalizeRawImages = normalizeRawImages;
  window.createFigureHtml = createFigureHtml;
  window.createGalleryHtml = createGalleryHtml;
  window.convertSingleImageToGallery = convertSingleImageToGallery;
  window.addImageToGallery = addImageToGallery;
  window.moveGalleryImage = moveGalleryImage;
  window.removeImageFromGallery = removeImageFromGallery;
  window.normalizeRawImages = normalizeRawImages;
  window.addSideBySideSlot = addSideBySideSlot;
  window.cancelGalleryPlaceholder = cancelGalleryPlaceholder;
  window.populateGalleryPlaceholder = populateGalleryPlaceholder;
  window.isImageBlock = isImageBlock;
  window.getAdjacentImageBlock = getAdjacentImageBlock;
  window.mergeImageBlocks = mergeImageBlocks;
  window.ensureImageCaptionElements = ensureImageCaptionElements;
  window.applySmartImageSizing = applySmartImageSizing;
  window.stepImageScale = stepImageScale;
  window.hydrateCanvasImages = hydrateCanvasImages;
  window.renderEditorMediaPopup = renderEditorMediaPopup;
  window.insertMediaIntoPostEditor = insertMediaIntoPostEditor;
  window.insertHtmlAtCursor = insertHtmlAtCursor;
  window.setupImageClipboardAndDrop = setupImageClipboardAndDrop;
  window.handleImageUploadAndInsert = handleImageUploadAndInsert;
  window.handleImageManagerFiles = handleImageManagerFiles;
  window.setupEditorMediaModalControls = setupEditorMediaModalControls;

  const mediaExports = {
    normalizeRawImages,
    createFigureHtml,
    createGalleryHtml,
    convertSingleImageToGallery,
    addImageToGallery,
    moveGalleryImage,
    removeImageFromGallery,
    addSideBySideSlot,
    cancelGalleryPlaceholder,
    populateGalleryPlaceholder,
    isImageBlock,
    getAdjacentImageBlock,
    mergeImageBlocks,
    ensureImageCaptionElements,
    applySmartImageSizing,
    stepImageScale,
    hydrateCanvasImages,
    renderEditorMediaPopup,
    insertMediaIntoPostEditor,
    insertHtmlAtCursor,
    setupImageClipboardAndDrop,
    handleImageUploadAndInsert,
    handleImageManagerFiles,
    setupEditorMediaModalControls
  };

  window.Cedar.editor = Object.assign(window.Cedar.editor || {}, mediaExports);
  window.Outpost.editor = window.Cedar.editor;
})();
