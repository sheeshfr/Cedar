/**
 * Cedar Editor — History & Undo/Redo Engine
 * Intelligent macro-action grouping, snapshot management, and word-processor spec undo/redo.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  const MAX_HISTORY = 120;
  const MACRO_INACTIVITY_MS = 3500;

  let undoStack = [];
  let redoStack = [];
  let checkpointState = null;
  let isApplyingHistory = false;
  let macroInactivityTimer = null;
  let activeEditBlockNode = null;
  let sessionSentenceCompleted = false;

  function getCaretOffset(element) {
    let caretOffset = 0;
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (element.contains(range.commonAncestorContainer)) {
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(element);
          preCaretRange.setEnd(range.endContainer, range.endOffset);
          caretOffset = preCaretRange.toString().length;
        }
      }
    } catch (e) {
      caretOffset = 0;
    }
    return caretOffset;
  }

  function setCaretOffset(element, offset) {
    if (!element) return;
    element.focus();
    try {
      const sel = window.getSelection();
      if (!sel) return;

      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(true);

      let currentOffset = 0;
      let found = false;

      function traverse(node) {
        if (found) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.nodeValue.length;
          if (currentOffset + len >= offset) {
            const target = Math.max(0, Math.min(offset - currentOffset, len));
            range.setStart(node, target);
            range.collapse(true);
            found = true;
            return;
          }
          currentOffset += len;
        } else {
          for (let i = 0; i < node.childNodes.length; i++) {
            traverse(node.childNodes[i]);
            if (found) return;
          }
        }
      }

      traverse(element);

      if (!found) {
        range.selectNodeContents(element);
        range.collapse(false);
      }

      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      element.focus();
    }
  }

  function cleanProseHtmlForStorage(html) {
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
        body.querySelectorAll('.captioned-image-container, .custom-gallery-grid').forEach(container => {
          if (container.parentElement && container.parentElement !== body) {
            let topBlock = container;
            while (topBlock.parentElement && topBlock.parentElement !== body) {
              topBlock = topBlock.parentElement;
            }
            if (topBlock && topBlock.parentElement === body) {
              body.insertBefore(container, topBlock.nextSibling);
              if (!topBlock.textContent.trim() && !topBlock.querySelector('img, video, iframe, hr, svg')) {
                topBlock.remove();
              }
            }
          }
        });
        body.querySelectorAll('img').forEach(img => {
          const imgName = (img.getAttribute('data-img-name') || '').trim();
          const origSrc = (img.getAttribute('data-original-src') || '').trim();
          if (imgName && (!origSrc || origSrc.startsWith('data:'))) {
            const cleanFn = imgName.split('/').pop().split('\\').pop();
            img.setAttribute('data-original-src', `/blog/images/${cleanFn}`);
          }
          if (!img.closest('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .image-sanitizing-placeholder, .gallery-split-img-box, .page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card')) {
            const src = img.getAttribute('src') || '';
            if (src) {
              const figContainer = doc.createElement('div');
              figContainer.className = 'captioned-image-container';
              figContainer.setAttribute('contenteditable', 'false');
              figContainer.setAttribute('tabindex', '0');
              const fig = doc.createElement('figure');
              const wrap = doc.createElement('div');
              wrap.className = 'image-media-wrapper';
              const clonedImg = img.cloneNode(true);
              clonedImg.setAttribute('draggable', 'false');
              wrap.appendChild(clonedImg);
              fig.appendChild(wrap);
              figContainer.appendChild(fig);
              let topBlock = img;
              while (topBlock.parentElement && topBlock.parentElement !== body) {
                topBlock = topBlock.parentElement;
              }
              if (topBlock === img) {
                body.replaceChild(figContainer, img);
              } else if (topBlock && topBlock.parentElement === body) {
                img.remove();
                if (!topBlock.textContent.trim() && !topBlock.querySelector('img, video, iframe, hr, svg')) {
                  body.replaceChild(figContainer, topBlock);
                } else {
                  body.insertBefore(figContainer, topBlock.nextSibling);
                }
              }
            }
          }
        });
        body.querySelectorAll('code:not(pre code), span.cedar-custom-color').forEach(el => {
          const visible = (el.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (!visible && !el.querySelector('img, br')) {
            el.remove();
          }
        });
        return body.innerHTML.replace(/\u200B/g, '').trim();
      }
    } catch (e) {
      console.warn('cleanProseHtmlForStorage error:', e);
    }
    html = html.replace(/<div\s+id=["']canvas-drop-indicator["'][^>]*>[\s\S]*?<\/div>/gi, '');
    html = html.replace(/<button\b(?![^>]*(?:btn-share-article|btn-rss-subscribe|btn-copy-share-url))[^>]*>[\s\S]*?<\/button>/gi, '');
    html = html.replace(/\b(selected|selected-item|drop-merge-target|block-is-dragging|item-is-dragging|dragover-slot)\b/gi, '');
    html = html.replace(/\bdrop-indicator-[a-z0-9_-]+\b/gi, '');
    html = html.replace(/class=["']([^"']*)["']/gi, (match, classes) => {
      const cleaned = classes.trim().replace(/\s+/g, ' ');
      return cleaned ? `class="${cleaned}"` : '';
    });
    return html.trim();
  }

  function getEditorSnapshot() {
    const canvasProse = document.getElementById('rich-canvas-prose');
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const mdInput = document.getElementById('markdown-input');
    const activeMode = window.activeMode || 'canvas';

    const activeEl = document.activeElement;
    let focusedTarget = null;
    let caretOffset = 0;

    if (activeEl === canvasTitle) {
      focusedTarget = 'title';
      caretOffset = getCaretOffset(canvasTitle);
    } else if (activeEl === canvasSubtitle) {
      focusedTarget = 'subtitle';
      caretOffset = getCaretOffset(canvasSubtitle);
    } else if (canvasProse && (activeEl === canvasProse || canvasProse.contains(activeEl))) {
      focusedTarget = 'prose';
      caretOffset = getCaretOffset(canvasProse);
    } else if (activeEl === mdInput) {
      focusedTarget = 'markdown';
      caretOffset = mdInput ? mdInput.selectionStart : 0;
    }

    const currentDraft = window.currentDraft;

    return {
      title: canvasTitle ? canvasTitle.textContent : (currentDraft ? currentDraft.title || '' : ''),
      subtitle: canvasSubtitle ? canvasSubtitle.textContent : (currentDraft ? currentDraft.subtitle || '' : ''),
      proseHtml: canvasProse ? cleanProseHtmlForStorage(canvasProse.innerHTML) : '',
      markdown: mdInput ? mdInput.value : (currentDraft ? currentDraft.markdown || '' : ''),
      activeMode: activeMode || 'canvas',
      focusedTarget: focusedTarget,
      caretOffset: caretOffset,
      timestamp: Date.now()
    };
  }

  function isSnapshotsEqual(s1, s2) {
    if (!s1 || !s2) return false;
    if (s1.activeMode !== s2.activeMode) return false;
    if (s1.title !== s2.title || s1.subtitle !== s2.subtitle) return false;
    if (s1.activeMode === 'markdown') {
      return s1.markdown === s2.markdown;
    } else {
      return s1.proseHtml === s2.proseHtml;
    }
  }

  function updateHistoryButtonsUI() {
    const btnUndo = document.getElementById('tb-btn-undo');
    const btnRedo = document.getElementById('tb-btn-redo');
    const canUndo = canUndoAction();
    const canRedo = canRedoAction();

    if (btnUndo) {
      btnUndo.disabled = !canUndo;
      btnUndo.classList.toggle('disabled', !canUndo);
      btnUndo.title = canUndo ? 'Undo (Ctrl+Z)' : 'Nothing to undo';
    }
    if (btnRedo) {
      btnRedo.disabled = !canRedo;
      btnRedo.classList.toggle('disabled', !canRedo);
      btnRedo.title = canRedo ? 'Redo (Ctrl+Y)' : 'Nothing to redo';
    }
  }

  function getCurrentEditBlockNode() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.anchorNode;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        if (node && node.closest) {
          const block = node.closest('p, h1, h2, h3, h4, blockquote, pre, figcaption, .gallery-caption, li, #rich-canvas-title, #rich-canvas-subtitle, #markdown-input');
          if (block) return block;
        }
      }
      const active = document.activeElement;
      if (active && active.closest) {
        return active.closest('p, h1, h2, h3, h4, blockquote, pre, figcaption, .gallery-caption, li, #rich-canvas-title, #rich-canvas-subtitle, #markdown-input') || active;
      }
    } catch (e) {}
    return null;
  }

  function initHistory() {
    undoStack = [];
    redoStack = [];
    if (macroInactivityTimer) clearTimeout(macroInactivityTimer);
    macroInactivityTimer = null;
    activeEditBlockNode = null;
    sessionSentenceCompleted = false;
    checkpointState = getEditorSnapshot();
    updateHistoryButtonsUI();
  }

  function commitCheckpoint(liveState = null) {
    if (isApplyingHistory) return;
    if (macroInactivityTimer) {
      clearTimeout(macroInactivityTimer);
      macroInactivityTimer = null;
    }
    const currentLive = liveState || getEditorSnapshot();
    if (!checkpointState) {
      checkpointState = currentLive;
      updateHistoryButtonsUI();
      return;
    }

    if (!isSnapshotsEqual(currentLive, checkpointState)) {
      undoStack.push(checkpointState);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      checkpointState = currentLive;
      redoStack = [];
      activeEditBlockNode = getCurrentEditBlockNode();
      sessionSentenceCompleted = false;
      updateHistoryButtonsUI();
    }
  }

  function finalizeActiveTypingSession() {
    if (macroInactivityTimer) {
      clearTimeout(macroInactivityTimer);
      macroInactivityTimer = null;
    }
    const currentLive = getEditorSnapshot();
    if (checkpointState && !isSnapshotsEqual(currentLive, checkpointState)) {
      commitCheckpoint(currentLive);
    }
    activeEditBlockNode = null;
    sessionSentenceCompleted = false;
  }

  function recordMacroAction(actionType, details = {}) {
    if (isApplyingHistory) return;

    const currentBlock = getCurrentEditBlockNode();

    // 1. Block change detection:
    // If the user moved focus to a different block, finalize the previous block's edit!
    if (activeEditBlockNode && currentBlock && activeEditBlockNode !== currentBlock) {
      commitCheckpoint();
      activeEditBlockNode = currentBlock;
      sessionSentenceCompleted = false;
    } else if (!activeEditBlockNode && currentBlock) {
      activeEditBlockNode = currentBlock;
    }

    // 2. Sentence boundary detection within block:
    const char = details.char || '';
    if (['.', '!', '?'].includes(char)) {
      sessionSentenceCompleted = true;
    } else if (char === ' ' && sessionSentenceCompleted) {
      if (macroInactivityTimer) clearTimeout(macroInactivityTimer);
      macroInactivityTimer = setTimeout(() => {
        commitCheckpoint();
      }, 2000);
      updateHistoryButtonsUI();
      return;
    } else if (char && char !== ' ') {
      sessionSentenceCompleted = false;
    }

    // 3. Generous inactivity timeout for a thought pause (3.5s)
    if (macroInactivityTimer) clearTimeout(macroInactivityTimer);
    macroInactivityTimer = setTimeout(() => {
      commitCheckpoint();
    }, MACRO_INACTIVITY_MS);

    updateHistoryButtonsUI();
  }

  function recordAction(actionType, immediate = false, details = {}) {
    if (isApplyingHistory) return;
    if (immediate) {
      commitCheckpoint();
      return;
    }
    recordMacroAction(actionType, details);
  }

  function canUndoAction() {
    if (undoStack.length > 0) return true;
    if (checkpointState) {
      const live = getEditorSnapshot();
      return !isSnapshotsEqual(live, checkpointState);
    }
    return false;
  }

  function canRedoAction() {
    return redoStack.length > 0;
  }

  function undo() {
    if (typeof window.hideDropIndicator === 'function') {
      window.hideDropIndicator();
    }
    if (macroInactivityTimer) {
      clearTimeout(macroInactivityTimer);
      macroInactivityTimer = null;
    }

    const currentLive = getEditorSnapshot();

    // 1. If user has uncommitted changes in current macro session, revert back to checkpointState
    if (checkpointState && !isSnapshotsEqual(currentLive, checkpointState)) {
      redoStack.push(currentLive);
      applyEditorSnapshot(checkpointState);
      activeEditBlockNode = null;
      sessionSentenceCompleted = false;
      updateHistoryButtonsUI();
      return;
    }

    // 2. Pop the previous snapshot from undoStack
    if (undoStack.length === 0) return;

    redoStack.push(checkpointState);
    const targetState = undoStack.pop();
    checkpointState = targetState;
    applyEditorSnapshot(targetState);
    activeEditBlockNode = null;
    sessionSentenceCompleted = false;
    updateHistoryButtonsUI();
  }

  function redo() {
    if (typeof window.hideDropIndicator === 'function') {
      window.hideDropIndicator();
    }
    if (macroInactivityTimer) {
      clearTimeout(macroInactivityTimer);
      macroInactivityTimer = null;
    }

    if (redoStack.length === 0) return;

    const currentLive = getEditorSnapshot();
    undoStack.push(checkpointState || currentLive);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }

    const targetState = redoStack.pop();
    checkpointState = targetState;
    applyEditorSnapshot(targetState);
    activeEditBlockNode = null;
    sessionSentenceCompleted = false;
    updateHistoryButtonsUI();
  }

  function applyEditorSnapshot(snapshot) {
    if (!snapshot) return;
    isApplyingHistory = true;

    try {
      const canvasTitle = document.getElementById('rich-canvas-title');
      const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
      const canvasProse = document.getElementById('rich-canvas-prose');
      const mdInput = document.getElementById('markdown-input');
      const activeMode = window.activeMode || 'canvas';
      const currentDraft = window.currentDraft;

      // Mode switch if snapshot was in different mode
      if (snapshot.activeMode && snapshot.activeMode !== activeMode) {
        if (typeof window.setEditorMode === 'function') {
          window.setEditorMode(snapshot.activeMode);
        }
      }

      // Restore Title
      if (canvasTitle && canvasTitle.textContent !== snapshot.title) {
        canvasTitle.textContent = snapshot.title || '';
        const metaTitle = document.getElementById('meta-title');
        if (metaTitle) metaTitle.value = snapshot.title || '';
        const titleDisplay = document.getElementById('editor-header-title');
        if (titleDisplay) {
          titleDisplay.textContent = snapshot.title || (currentDraft && currentDraft.type === 'page' ? 'Untitled Page' : 'Untitled Post');
        }
        if (currentDraft) currentDraft.title = snapshot.title || '';
      }

      // Restore Subtitle
      if (canvasSubtitle && canvasSubtitle.textContent !== snapshot.subtitle) {
        canvasSubtitle.textContent = snapshot.subtitle || '';
        const metaSub = document.getElementById('meta-subtitle');
        if (metaSub) metaSub.value = snapshot.subtitle || '';
        if (currentDraft) currentDraft.subtitle = snapshot.subtitle || '';
      }

      // Restore Prose HTML
      if (canvasProse && cleanProseHtmlForStorage(canvasProse.innerHTML) !== snapshot.proseHtml) {
        canvasProse.innerHTML = cleanProseHtmlForStorage(snapshot.proseHtml) || '';
        const leftoverInd = canvasProse.querySelector('#canvas-drop-indicator');
        if (leftoverInd) leftoverInd.remove();
        if (typeof window.ensureImageCaptionElements === 'function') {
          window.ensureImageCaptionElements(canvasProse);
        }
        if (typeof window.hydratePageBlocks === 'function') {
          window.hydratePageBlocks(canvasProse, currentDraft, { isEditor: true, initialPage: 1 });
        }
      }
      window._selectedImageBlock = null;
      window._lastActiveImageBlock = null;
      window._activePlaceholderSlot = null;
      if (canvasProse) {
        canvasProse.querySelectorAll('.captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .page-recent-posts-block, .page-individual-post-block, .custom-gallery-item').forEach(c => {
          c.classList.remove('selected', 'selected-item');
        });
      }
      if (typeof window.hideDropIndicator === 'function') {
        window.hideDropIndicator();
      }

      // Restore Markdown
      if (mdInput && mdInput.value !== snapshot.markdown) {
        mdInput.value = snapshot.markdown || '';
        if (typeof window.autoResizeMarkdownTextarea === 'function') {
          window.autoResizeMarkdownTextarea();
        }
      }

      // Sync draft markdown & proseHtml
      if (currentDraft) {
        if (activeMode === 'canvas') {
          if (canvasProse) {
            currentDraft.proseHtml = cleanProseHtmlForStorage(canvasProse.innerHTML);
            if (typeof window.domToMarkdown === 'function') {
              currentDraft.markdown = window.domToMarkdown(canvasProse);
            }
          }
        } else {
          if (mdInput) {
            currentDraft.markdown = mdInput.value;
            if (typeof window.parseMarkdownToHtml === 'function') {
              currentDraft.proseHtml = window.parseMarkdownToHtml(mdInput.value);
            }
          }
        }
      }

      if (typeof window.updateStats === 'function') window.updateStats();
      if (typeof window.updateToolbarActiveStates === 'function') window.updateToolbarActiveStates();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();

      // Restore Focus and Caret
      if (snapshot.focusedTarget === 'title' && canvasTitle) {
        setCaretOffset(canvasTitle, snapshot.caretOffset || 0);
      } else if (snapshot.focusedTarget === 'subtitle' && canvasSubtitle) {
        setCaretOffset(canvasSubtitle, snapshot.caretOffset || 0);
      } else if (snapshot.focusedTarget === 'prose' && canvasProse) {
        setCaretOffset(canvasProse, snapshot.caretOffset || 0);
      } else if (snapshot.focusedTarget === 'markdown' && mdInput) {
        mdInput.focus();
        const pos = snapshot.caretOffset || 0;
        mdInput.setSelectionRange(pos, pos);
      }
    } finally {
      isApplyingHistory = false;
    }
  }

  function isEditorFocusedOrActive() {
    const openModal = document.querySelector('.modal-overlay:not([style*="display: none"])');
    if (openModal) return false;

    const active = document.activeElement;
    const canvasProse = document.getElementById('rich-canvas-prose');
    const canvasTitle = document.getElementById('rich-canvas-title');
    const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
    const mdInput = document.getElementById('markdown-input');
    const toolbar = document.getElementById('editor-formatting-toolbar');
    const editorView = document.getElementById('view-editor');

    if (canvasProse && (active === canvasProse || canvasProse.contains(active))) return true;
    if (active === canvasTitle || active === canvasSubtitle || active === mdInput) return true;
    if (toolbar && toolbar.contains(active)) return true;

    if (editorView && editorView.style.display !== 'none' && !editorView.classList.contains('hidden')) {
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !editorView.contains(active)) {
        return false;
      }
      return true;
    }
    return false;
  }

  function setupHistoryListeners() {
    const targets = [
      document.getElementById('rich-canvas-prose'),
      document.getElementById('rich-canvas-title'),
      document.getElementById('rich-canvas-subtitle'),
      document.getElementById('markdown-input')
    ].filter(Boolean);

    targets.forEach(el => {
      el.addEventListener('beforeinput', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('individual-post-url-input')) return;
        if (e.inputType === 'historyUndo') {
          e.preventDefault();
          undo();
        } else if (e.inputType === 'historyRedo') {
          e.preventDefault();
          redo();
        }
      });

      el.addEventListener('input', (e) => {
        if (isApplyingHistory) return;
        if (e.target && e.target.classList && e.target.classList.contains('individual-post-url-input')) return;
        const inputType = e.inputType || '';
        let action = 'insert';
        let char = e.data || '';

        if (inputType.startsWith('delete')) {
          action = 'delete';
        } else if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
          action = 'insert';
          char = '\n';
        } else if (inputType === 'insertFromPaste') {
          recordAction('paste', true);
          return;
        }

        recordAction(action, false, { char: char });
      });

      el.addEventListener('keydown', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('individual-post-url-input')) return;
        const sel = window.getSelection();
        const hasRangeSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 1;

        // If user is deleting or replacing a highlighted multi-character selection range:
        if (hasRangeSelection) {
          if (e.key === 'Backspace' || e.key === 'Delete' || (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1)) {
            commitCheckpoint();
          }
        } else if (e.key === 'Enter' && !e.shiftKey) {
          // Starting a new paragraph / line commits the completed block's edit!
          commitCheckpoint();
        }
      });

      el.addEventListener('focusout', (e) => {
        if (!e.relatedTarget || !el.contains(e.relatedTarget)) {
          finalizeActiveTypingSession();
        }
      });
    });

    // When clicking anywhere in the document, if clicking away from the active edit block, finalize it!
    document.addEventListener('mousedown', (e) => {
      if (activeEditBlockNode && e.target && !activeEditBlockNode.contains(e.target)) {
        finalizeActiveTypingSession();
      }
    });
  }

  // Exports
  window.getCaretOffset = getCaretOffset;
  window.setCaretOffset = setCaretOffset;
  window.cleanProseHtmlForStorage = cleanProseHtmlForStorage;
  window.getEditorSnapshot = getEditorSnapshot;
  window.isSnapshotsEqual = isSnapshotsEqual;
  window.updateHistoryButtonsUI = updateHistoryButtonsUI;
  window.getCurrentEditBlockNode = getCurrentEditBlockNode;
  window.initHistory = initHistory;
  window.commitCheckpoint = commitCheckpoint;
  window.finalizeActiveTypingSession = finalizeActiveTypingSession;
  window.recordMacroAction = recordMacroAction;
  window.recordAction = recordAction;
  window.canUndoAction = canUndoAction;
  window.canRedoAction = canRedoAction;
  window.undo = undo;
  window.redo = redo;
  window.applyEditorSnapshot = applyEditorSnapshot;
  window.isEditorFocusedOrActive = isEditorFocusedOrActive;
  window.setupHistoryListeners = setupHistoryListeners;

  const historyExports = {
    getCaretOffset,
    setCaretOffset,
    cleanProseHtmlForStorage,
    getEditorSnapshot,
    isSnapshotsEqual,
    updateHistoryButtonsUI,
    getCurrentEditBlockNode,
    initHistory,
    commitCheckpoint,
    finalizeActiveTypingSession,
    recordMacroAction,
    recordAction,
    canUndoAction,
    canRedoAction,
    undo,
    redo,
    applyEditorSnapshot,
    isEditorFocusedOrActive,
    setupHistoryListeners
  };

  window.Cedar.editor = Object.assign(window.Cedar.editor || {}, historyExports);
  window.Outpost.editor = window.Cedar.editor;
})();
