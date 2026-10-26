/**
 * Cedar - Block & Media Drag-and-Drop Engine
 * Module: js/editor/drag-drop.js
 * 
 * Responsibilities:
 * - Fluid drag-and-drop for top-level prose blocks, images, galleries, and embeds
 * - Dragging individual gallery items to reorder, populate slots, or extract into standalone blocks
 * - Smart drop indicators with support for left/right margin drops and bottom visibility space drops
 * - Drop protection across false drop zones (top toolbar, site header, sidebars)
 * - Safe drag cancellation and state cleanup (Escape, dragend, mouseup, blur)
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  function setupBlockDragAndDrop(canvasProse) {
    if (!canvasProse) return;
    let draggedBlock = null;
    let draggedGalleryItem = null;
    let dropAction = null; // { targetBlock, position: 'before'|'after'|'merge'|'extract'|'slot', indicatorY, slot }

    const scrollContainer = canvasProse.closest('.canvas-scroll-container') ||
                            document.querySelector('.canvas-scroll-container') ||
                            canvasProse.parentElement;

    function getDropIndicator() {
      let ind = document.getElementById('canvas-drop-indicator');
      const container = canvasProse.parentElement || canvasProse;
      if (!ind || ind.parentElement !== container) {
        if (ind) ind.remove();
        ind = document.createElement('div');
        ind.id = 'canvas-drop-indicator';
        ind.classList.remove('visible');
        ind.style.display = 'none';
        container.appendChild(ind);
      }
      return ind;
    }

    function getTopBlock(el) {
      if (!el || el === canvasProse || !canvasProse.contains(el)) return null;
      let curr = el;
      while (curr && curr.parentNode !== canvasProse) {
        curr = curr.parentNode;
      }
      if (curr && curr.id === 'canvas-drop-indicator') return null;
      return curr;
    }

    function clearIndicators() {
      document.body.classList.remove('is-dragging-active');
      const ind = document.getElementById('canvas-drop-indicator');
      if (ind) {
        ind.classList.remove('visible');
        ind.style.display = 'none';
      }
      canvasProse.querySelectorAll('#canvas-drop-indicator').forEach(el => el.remove());
      const container = canvasProse.parentElement;
      if (container) {
        container.querySelectorAll('#canvas-drop-indicator').forEach(el => {
          el.style.display = 'none';
        });
      }
      canvasProse.querySelectorAll('.drop-merge-target').forEach(el => {
        el.classList.remove('drop-merge-target');
      });
      canvasProse.querySelectorAll('.drop-indicator-top, .drop-indicator-bottom').forEach(el => {
        el.classList.remove('drop-indicator-top', 'drop-indicator-bottom');
      });
      canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(el => {
        el.classList.remove('dragover-slot');
      });
      dropAction = null;
    }

    function isFalseDropZone(e) {
      if (!e) return false;
      const target = e.target;
      if (target && target.closest && target.closest('#editor-formatting-toolbar, .site-header, .writer-sidebar, #writer-sidebar, .dash-main-wrap, #view-dashboard, .toast-container')) {
        return true;
      }
      const tb = document.getElementById('editor-formatting-toolbar');
      if (tb) {
        const tbRect = tb.getBoundingClientRect();
        if (e.clientY <= tbRect.bottom) {
          return true;
        }
      }
      const header = document.querySelector('.site-header');
      if (header) {
        const headerRect = header.getBoundingClientRect();
        if (e.clientY <= headerRect.bottom) {
          return true;
        }
      }
      const sidebar = document.getElementById('writer-sidebar');
      if (sidebar && !sidebar.classList.contains('collapsed')) {
        const sideRect = sidebar.getBoundingClientRect();
        if (e.clientX >= sideRect.left) {
          return true;
        }
      }
      return false;
    }

    function calculateDropTarget(e) {
      let children = Array.from(canvasProse.children).filter(child => {
        if (!child || child === draggedBlock || child.id === 'canvas-drop-indicator') return false;
        if (child.nodeType !== Node.ELEMENT_NODE) return false;
        return true;
      });

      if (children.length === 0) {
        let p = document.createElement('p');
        p.innerHTML = '<br>';
        canvasProse.appendChild(p);
        children = [p];
      }

      const canvasRect = canvasProse.getBoundingClientRect();
      const mouseY = e.clientY;
      const isDraggedImage = typeof window.isImageBlock === 'function' ? window.isImageBlock(draggedBlock) : false;
      const isHorizontallyOverCanvas = (e.clientX >= canvasRect.left && e.clientX <= canvasRect.right);

      // Check if dragging an entire image onto another image -> TRIGGER MERGE TARGET!
      if (!draggedGalleryItem && isDraggedImage && isHorizontallyOverCanvas) {
        for (let i = 0; i < children.length; i++) {
          const block = children[i];
          if (typeof window.isImageBlock === 'function' && window.isImageBlock(block)) {
            const rect = block.getBoundingClientRect();
            const topMergeZone = rect.top + rect.height * 0.2;
            const bottomMergeZone = rect.bottom - rect.height * 0.2;
            if (mouseY >= topMergeZone && mouseY <= bottomMergeZone) {
              return {
                targetBlock: block,
                position: 'merge'
              };
            }
          }
        }
      }

      // Check if hovering before first child (above its midpoint)
      const firstMid = children[0].getBoundingClientRect().top + children[0].getBoundingClientRect().height / 2;
      if (mouseY < firstMid) {
        return {
          targetBlock: children[0],
          position: 'before',
          prevBlock: null
        };
      }

      // Check gaps between adjacent children
      for (let i = 0; i < children.length - 1; i++) {
        const curr = children[i];
        const next = children[i + 1];
        const currMid = curr.getBoundingClientRect().top + curr.getBoundingClientRect().height / 2;
        const nextMid = next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2;

        if (mouseY >= currMid && mouseY < nextMid) {
          // Exactly between curr and next
          if (next.classList.contains('page-recent-posts-block')) {
            return {
              targetBlock: next,
              position: 'before',
              prevBlock: curr
            };
          }
          return {
            targetBlock: next,
            position: 'before',
            prevBlock: curr
          };
        }
      }

      // Below last child's midpoint
      const lastChild = children[children.length - 1];
      if (lastChild.classList.contains('page-recent-posts-block')) {
        return {
          targetBlock: lastChild,
          position: 'before',
          prevBlock: children.length > 1 ? children[children.length - 2] : null
        };
      }

      return {
        targetBlock: lastChild,
        position: 'after',
        prevBlock: lastChild
      };
    }

    canvasProse.addEventListener('dragstart', (e) => {
      if (e.target && e.target.closest && e.target.closest('.individual-post-url-input')) {
        return;
      }

      // 1. Check if dragging an individual gallery item
      const item = e.target.closest ? e.target.closest('.custom-gallery-item') : null;
      if (item && !item.classList.contains('gallery-slot-placeholder')) {
        const gal = item.closest('.custom-gallery-grid');
        const img = item.querySelector('img');
        const idx = parseInt(item.dataset.index, 10);
        if (gal && img && !isNaN(idx)) {
          draggedGalleryItem = {
            gallery: gal,
            itemElement: item,
            index: idx,
            imgData: {
              src: img.src,
              originalSrc: img.dataset.originalSrc || img.src,
              imgName: img.dataset.imgName || '',
              alt: img.alt || 'Gallery image'
            }
          };
          window._draggedGalleryItem = draggedGalleryItem;
          item.classList.add('item-is-dragging');
          document.body.classList.add('is-dragging-active');
          draggedBlock = null;
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', 'cedar-gallery-item');
        try { e.dataTransfer.setData('application/x-cedar-gallery-item', 'true'); } catch (err) {}
              e.dataTransfer.setData('text/uri-list', '');
            } catch (err) {}
          }
          return;
        }
      }

      // 2. Otherwise dragging a top block
      const block = getTopBlock(e.target);
      if (!block) return;
      if (block.classList.contains('page-recent-posts-block')) {
        e.preventDefault();
        return;
      }
      draggedBlock = block;
      block.classList.add('block-is-dragging');
      document.body.classList.add('is-dragging-active');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', 'cedar-block');
        try { e.dataTransfer.setData('application/x-cedar-block', 'true'); } catch (err) {}
        } catch (err) {}
      }
    });

    function onDragOver(e) {
      if (!draggedBlock && !draggedGalleryItem) return;
      e.preventDefault();

      if (isFalseDropZone(e)) {
        clearIndicators();
        dropAction = null;
        if (e.dataTransfer) {
          try { e.dataTransfer.dropEffect = 'none'; } catch (err) {}
        }
        return;
      }

      if (e.dataTransfer) {
        try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
      }

      // Check if hovering over a placeholder slot in a gallery
      const overSlot = e.target && e.target.closest ? e.target.closest('.gallery-slot-placeholder') : null;
      if (overSlot) {
        canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(s => {
          if (s !== overSlot) s.classList.remove('dragover-slot');
        });
        overSlot.classList.add('dragover-slot');
        const ind = getDropIndicator();
        ind.classList.remove('visible');
        ind.style.display = 'none';
        canvasProse.querySelectorAll('.drop-merge-target').forEach(el => el.classList.remove('drop-merge-target'));
        dropAction = { type: 'slot', slot: overSlot };
        return;
      } else {
        canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(s => s.classList.remove('dragover-slot'));
      }

      function updateDropIndicator(target) {
        const ind = getDropIndicator();
        const container = canvasProse.parentElement || canvasProse;
        const cRect = container.getBoundingClientRect();
        const canvasRect = canvasProse.getBoundingClientRect();

        let topY;
        if (target.prevBlock && target.targetBlock && target.prevBlock !== target.targetBlock) {
          const prevRect = target.prevBlock.getBoundingClientRect();
          const nextRect = target.targetBlock.getBoundingClientRect();
          topY = Math.round(((prevRect.bottom + nextRect.top) / 2) - cRect.top);
        } else if (target.position === 'before') {
          const bRect = target.targetBlock.getBoundingClientRect();
          topY = Math.round(bRect.top - cRect.top - 3);
        } else {
          const bRect = target.targetBlock.getBoundingClientRect();
          topY = Math.round(bRect.bottom - cRect.top + 3);
        }

        ind.style.top = topY + 'px';
        ind.style.left = Math.round(canvasRect.left - cRect.left) + 'px';
        ind.style.width = Math.round(canvasRect.width) + 'px';
        ind.classList.add('visible');
        ind.style.display = 'block';
      }

      // If dragging a gallery item out onto canvas or margins or bottom space
      if (draggedGalleryItem) {
        const target = calculateDropTarget(e);
        if (!target || !target.targetBlock) {
          clearIndicators();
          return;
        }
        canvasProse.querySelectorAll('.drop-merge-target').forEach(el => el.classList.remove('drop-merge-target'));
        updateDropIndicator(target);
        dropAction = { type: 'extract', ...target };
        return;
      }

      // Normal block drag
      const target = calculateDropTarget(e);
      if (!target || !target.targetBlock) {
        clearIndicators();
        return;
      }

      if (target.position === 'merge') {
        const ind = getDropIndicator();
        ind.classList.remove('visible');
        ind.style.display = 'none';
        canvasProse.querySelectorAll('.drop-merge-target').forEach(el => {
          if (el !== target.targetBlock) el.classList.remove('drop-merge-target');
        });
        target.targetBlock.classList.add('drop-merge-target');
        dropAction = target;
      } else {
        canvasProse.querySelectorAll('.drop-merge-target').forEach(el => el.classList.remove('drop-merge-target'));
        updateDropIndicator(target);
        dropAction = target;
      }
    }

    function onDragLeave(e) {
      if (!scrollContainer || !scrollContainer.contains(e.relatedTarget)) {
        clearIndicators();
      }
    }

    function onDrop(e) {
      if (!draggedBlock && !draggedGalleryItem) return;

      if (isFalseDropZone(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleDragTermination();
        return;
      }

      canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(s => s.classList.remove('dragover-slot'));

      // Case A: Dropping onto a placeholder slot
      const targetSlot = (e.target && e.target.closest ? e.target.closest('.gallery-slot-placeholder') : null) ||
                         (dropAction && dropAction.type === 'slot' ? dropAction.slot : null);

      if (targetSlot) {
        e.preventDefault();
        e.stopPropagation();

        if (draggedGalleryItem) {
          const srcItem = draggedGalleryItem;
          draggedGalleryItem = null;
          window._draggedGalleryItem = null;
          clearIndicators();
          if (window.commitCheckpoint) window.commitCheckpoint();
          if (srcItem.gallery === targetSlot.closest('.custom-gallery-grid')) {
            srcItem.itemElement.remove();
          } else {
            if (typeof window.removeImageFromGallery === 'function') {
              window.removeImageFromGallery(srcItem.gallery, srcItem.index, true);
            }
          }
          if (typeof window.populateGalleryPlaceholder === 'function') {
            window.populateGalleryPlaceholder(targetSlot, srcItem.imgData);
          }
          if (window.recordAction) window.recordAction('gallery-slot-populate', true);
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }

        if (draggedBlock && (typeof window.isImageBlock === 'function' && window.isImageBlock(draggedBlock))) {
          const sourceBlock = draggedBlock;
          draggedBlock = null;
          clearIndicators();
          const img = sourceBlock.querySelector('img');
          if (img) {
            if (window.commitCheckpoint) window.commitCheckpoint();
            const imgData = {
              src: img.src,
              originalSrc: img.dataset.originalSrc || img.src,
              imgName: img.dataset.imgName || '',
              alt: img.alt || 'Image'
            };
            if (typeof window.populateGalleryPlaceholder === 'function') {
              window.populateGalleryPlaceholder(targetSlot, imgData);
            }
            if (typeof window.deleteBlock === 'function') {
              window.deleteBlock(sourceBlock);
            } else {
              sourceBlock.remove();
            }
            if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
            if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
            if (window.recordAction) window.recordAction('gallery-slot-populate', true);
            if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
            if (typeof window.showToast === 'function') window.showToast('Moved image into gallery & removed old block');
          }
          return;
        }
      }

      // Case B: Dragging an image OUT of a gallery into its own block on canvas (or margins, or bottom space)
      if (draggedGalleryItem) {
        e.preventDefault();
        e.stopPropagation();
        const srcItem = draggedGalleryItem;
        draggedGalleryItem = null;
        window._draggedGalleryItem = null;
        const currentAction = dropAction;
        clearIndicators();

        if (currentAction && currentAction.targetBlock) {
          if (window.commitCheckpoint) window.commitCheckpoint();
          const figureHtml = (typeof window.createFigureHtml === 'function')
            ? window.createFigureHtml(srcItem.imgData.src, srcItem.imgData.originalSrc, srcItem.imgData.imgName, srcItem.imgData.alt, '', 'full')
            : `<div class="captioned-image-container" data-size="full"><figure><img src="${srcItem.imgData.src}"></figure></div>`;
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = figureHtml;
          const newFig = tempDiv.firstElementChild;

          let insertRef = currentAction.position === 'before'
            ? currentAction.targetBlock
            : (currentAction.targetBlock.nextElementSibling && currentAction.targetBlock.nextElementSibling.classList.contains('gallery-caption')
                ? currentAction.targetBlock.nextElementSibling.nextSibling
                : currentAction.targetBlock.nextSibling);
          canvasProse.insertBefore(newFig, insertRef);

          // Remove the image from the source gallery with skipHistory = true
          if (typeof window.removeImageFromGallery === 'function') {
            window.removeImageFromGallery(srcItem.gallery, srcItem.index, true);
          }

          if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
          if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
          if (typeof window.ensureImageCaptionElements === 'function') window.ensureImageCaptionElements(canvasProse);

          document.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block').forEach(c => c.classList.remove('selected'));
          newFig.classList.add('selected');
          window._selectedImageBlock = newFig;
          window._lastActiveImageBlock = newFig;

          if (window.recordAction) window.recordAction('image-extract', true);
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Extracted image into its own block!');
        } else {
          handleDragTermination();
        }
        return;
      }

      // Case C: Normal block reorder or merge
      if (!draggedBlock) return;
      e.preventDefault();
      e.stopPropagation();
      const currentAction = dropAction;
      const currentDragged = draggedBlock;
      draggedBlock = null;
      clearIndicators();

      if (currentAction && currentAction.targetBlock && currentAction.targetBlock !== currentDragged) {
        if (currentAction.position === 'merge' && (typeof window.isImageBlock === 'function' && window.isImageBlock(currentDragged) && window.isImageBlock(currentAction.targetBlock))) {
          if (typeof window.mergeImageBlocks === 'function') {
            window.mergeImageBlocks(currentAction.targetBlock, currentDragged);
          }
        } else {
          if (window.commitCheckpoint) window.commitCheckpoint();
          let insertRef = currentAction.position === 'before'
            ? currentAction.targetBlock
            : (currentAction.targetBlock.nextElementSibling && currentAction.targetBlock.nextElementSibling.classList.contains('gallery-caption')
                ? currentAction.targetBlock.nextElementSibling.nextSibling
                : currentAction.targetBlock.nextSibling);
          canvasProse.insertBefore(currentDragged, insertRef);
          if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse);
          if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
          if (window.recordAction) window.recordAction('block-drag-reorder', true);
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          if (typeof window.showToast === 'function') window.showToast('Block moved!');
        }
        if (typeof window.ensureImageCaptionElements === 'function') window.ensureImageCaptionElements(canvasProse);
        const recentPosts = canvasProse.querySelector('.page-recent-posts-block');
        if (recentPosts && canvasProse.lastElementChild !== recentPosts) {
          canvasProse.appendChild(recentPosts);
        }
      } else {
        handleDragTermination();
      }
      return;
    }

    function handleDragTermination() {
      clearIndicators();
      if (draggedBlock) {
        draggedBlock.classList.remove('block-is-dragging');
        draggedBlock = null;
      }
      if (draggedGalleryItem) {
        if (draggedGalleryItem.itemElement) {
          draggedGalleryItem.itemElement.classList.remove('item-is-dragging');
        }
        draggedGalleryItem = null;
        window._draggedGalleryItem = null;
      }
      if (canvasProse) {
        canvasProse.querySelectorAll('.gallery-slot-placeholder.dragover-slot').forEach(s => s.classList.remove('dragover-slot'));
        canvasProse.querySelectorAll('.block-is-dragging').forEach(b => b.classList.remove('block-is-dragging'));
        canvasProse.querySelectorAll('.item-is-dragging').forEach(i => i.classList.remove('item-is-dragging'));
      }
    }

    if (scrollContainer) {
      scrollContainer.addEventListener('dragover', onDragOver);
      scrollContainer.addEventListener('dragleave', onDragLeave);
      scrollContainer.addEventListener('drop', onDrop);
    }

    if (canvasProse && canvasProse !== scrollContainer) {
      canvasProse.addEventListener('dragover', onDragOver);
      canvasProse.addEventListener('drop', onDrop);
    }

    const toolbar = document.getElementById('editor-formatting-toolbar');
    if (toolbar) {
      toolbar.addEventListener('dragover', (e) => {
        if (draggedBlock || draggedGalleryItem) {
          e.preventDefault();
          clearIndicators();
          dropAction = null;
          if (e.dataTransfer) {
            try { e.dataTransfer.dropEffect = 'none'; } catch (err) {}
          }
        }
      });
      toolbar.addEventListener('drop', (e) => {
        if (draggedBlock || draggedGalleryItem) {
          e.preventDefault();
          e.stopPropagation();
          handleDragTermination();
        }
      });
    }

    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
      siteHeader.addEventListener('dragover', (e) => {
        if (draggedBlock || draggedGalleryItem) {
          e.preventDefault();
          clearIndicators();
          dropAction = null;
          if (e.dataTransfer) {
            try { e.dataTransfer.dropEffect = 'none'; } catch (err) {}
          }
        }
      });
      siteHeader.addEventListener('drop', (e) => {
        if (draggedBlock || draggedGalleryItem) {
          e.preventDefault();
          e.stopPropagation();
          handleDragTermination();
        }
      });
    }

    window.addEventListener('dragover', (e) => {
      if (draggedBlock || draggedGalleryItem) {
        if (isFalseDropZone(e)) {
          e.preventDefault();
          clearIndicators();
          dropAction = null;
          if (e.dataTransfer) {
            try { e.dataTransfer.dropEffect = 'none'; } catch (err) {}
          }
        }
      }
    });

    window.addEventListener('drop', (e) => {
      if (draggedBlock || draggedGalleryItem) {
        e.preventDefault();
        e.stopPropagation();
        handleDragTermination();
      }
    });

    window.hideDropIndicator = handleDragTermination;
    document.addEventListener('dragend', handleDragTermination);
    document.addEventListener('mouseup', handleDragTermination);
    window.addEventListener('blur', handleDragTermination);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') handleDragTermination();
    });
  }

  // =========================================================================
  // GLOBAL & NAMESPACE EXPORTS
  // =========================================================================

  window.setupBlockDragAndDrop = setupBlockDragAndDrop;

  const dragExports = {
    setupBlockDragAndDrop
  };

  window.Cedar.editor = Object.assign(window.Cedar.editor || {}, dragExports);
  window.Outpost.editor = window.Cedar.editor;
})();
