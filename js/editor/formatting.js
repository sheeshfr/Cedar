/**
 * Cedar Editor — Formatting Toolbar & Selection Engine
 * Handles inline formatting, block style swapping, caret buffers, and toolbar UI synchronization.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  const coreSwapCurrentBlock = (window.Cedar?.editor?.swapCurrentBlock || window.Outpost?.editor?.swapCurrentBlock);
  const coreSplitBlockToNewParagraph = (window.Cedar?.editor?.splitBlockToNewParagraph || window.Outpost?.editor?.splitBlockToNewParagraph);

  let savedSelectionRange = null;

  function isProseContainer(node) {
    if (!node) return false;
    const canvas = document.getElementById('rich-canvas-prose');
    let curr = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return Boolean(canvas && canvas.contains(curr));
  }

  function isTitleContainer(node) {
    if (!node) return false;
    const title = document.getElementById('rich-canvas-title');
    let curr = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return Boolean(title && title.contains(curr));
  }

  function isSubtitleContainer(node) {
    if (!node) return false;
    const sub = document.getElementById('rich-canvas-subtitle');
    let curr = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return Boolean(sub && sub.contains(curr));
  }

  function isEditableContainer(node) {
    return isProseContainer(node) || isTitleContainer(node) || isSubtitleContainer(node);
  }

  function saveCurrentSelection() {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && isProseContainer(activeEl)) {
      const parentBlock = activeEl.closest('.page-individual-post-block, .page-recent-posts-block, .captioned-image-container, .custom-gallery-grid, .video-wrapper, .article-share-block, .article-rss-block');
      if (parentBlock) {
        window._lastActiveBlock = parentBlock;
        savedSelectionRange = null;
        window._savedSelectionRange = null;
      }
      updateToolbarActiveStates();
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (isProseContainer(range.commonAncestorContainer)) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const nonEditableBar = node && node.closest ? node.closest('[contenteditable="false"]') : null;
        if (nonEditableBar) {
          window._lastActiveBlock = nonEditableBar;
          savedSelectionRange = null;
          window._savedSelectionRange = null;
          updateToolbarActiveStates();
          return;
        }
        savedSelectionRange = range.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
        const canvas = document.getElementById('rich-canvas-prose');
        while (node && node.parentNode !== canvas && node !== canvas) {
          node = node.parentNode;
        }
        if (node && node.parentNode === canvas) {
          window._lastActiveBlock = node;
          if (canvas) {
            canvas.querySelectorAll('.selected, .selected-item').forEach(el => {
              if (el !== node) el.classList.remove('selected', 'selected-item');
            });
          }
          window._selectedImageBlock = null;
          window._lastActiveImageBlock = null;
        }
      }
    }
    updateToolbarActiveStates();
  }

  function restoreEditorSelection() {
    const canvas = document.getElementById('rich-canvas-prose');
    const sel = window.getSelection();

    if (window._savedSelectionRange === null) {
      savedSelectionRange = null;
    }

    if (savedSelectionRange && isProseContainer(savedSelectionRange.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRange);
      return savedSelectionRange;
    }

    if (sel && sel.rangeCount > 0 && isProseContainer(sel.getRangeAt(0).commonAncestorContainer)) {
      return sel.getRangeAt(0);
    }

    if (canvas) {
      if (window._lastActiveBlock && window._lastActiveBlock.parentNode === canvas) {
        focusNodeCaret(window._lastActiveBlock, false);
        if (sel && sel.rangeCount > 0) return sel.getRangeAt(0);
      }
      canvas.focus();
    }
    return null;
  }

  function formatInline(command) {
    restoreEditorSelection();
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
    document.execCommand(command, false, null);
    const canvas = document.getElementById('rich-canvas-prose');
    if (canvas) {
      normalizeCustomColorNodes(canvas);
    }
    saveCurrentSelection();
    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('format', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function unwrapElementPreservingChildren(el) {
    if (!el || !el.parentNode) return;
    const parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }

  function splitInlineElementAtRange(inlineEl, range) {
    if (!inlineEl || !inlineEl.parentNode || !range) return null;
    const parent = inlineEl.parentNode;

    // Extract afterRange FIRST so range.startContainer / range.startOffset are never shifted
    const afterRange = document.createRange();
    afterRange.selectNodeContents(inlineEl);
    afterRange.setStart(range.endContainer, range.endOffset);
    const afterFrag = afterRange.extractContents();

    // Extract beforeRange SECOND; what remains inside inlineEl is the exact middle selection
    // WITH all intermediate inline formatting tags (<u>, <s>, <strong>, <em>, etc.) preserved!
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(inlineEl);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const beforeFrag = beforeRange.extractContents();

    const pruneEmptyInlineShells = (root) => {
      if (!root || !root.querySelectorAll) return;
      let removed = true;
      while (removed) {
        removed = false;
        root.querySelectorAll('u, s, del, strike, strong, b, em, i, span, mark, code, a').forEach(el => {
          const txt = (el.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (!txt && !el.querySelector('img, br')) {
            el.remove();
            removed = true;
          }
        });
      }
    };

    pruneEmptyInlineShells(beforeFrag);
    pruneEmptyInlineShells(afterFrag);
    pruneEmptyInlineShells(inlineEl);

    const middleFrag = document.createDocumentFragment();
    while (inlineEl.firstChild) {
      middleFrag.appendChild(inlineEl.firstChild);
    }

    const hasVisibleOrNodes = (frag) => {
      if (!frag) return false;
      const text = (frag.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
      if (text.length > 0) return true;
      return Boolean(frag.querySelector && frag.querySelector('img, br'));
    };

    let beforeNode = null;
    if (hasVisibleOrNodes(beforeFrag)) {
      beforeNode = inlineEl.cloneNode(false);
      beforeNode.appendChild(beforeFrag);
      parent.insertBefore(beforeNode, inlineEl);
    }

    const middleMarker = document.createTextNode('');
    parent.insertBefore(middleMarker, inlineEl);

    let afterNode = null;
    if (hasVisibleOrNodes(afterFrag)) {
      afterNode = inlineEl.cloneNode(false);
      afterNode.appendChild(afterFrag);
      parent.insertBefore(afterNode, inlineEl);
    }

    parent.removeChild(inlineEl);

    const newRange = document.createRange();
    newRange.setStartBefore(middleMarker);
    newRange.setEndAfter(middleMarker);
    newRange.deleteContents();

    if (middleFrag && middleFrag.childNodes.length > 0) {
      const firstChild = middleFrag.firstChild;
      const lastChild = middleFrag.lastChild;
      newRange.insertNode(middleFrag);
      if (firstChild && lastChild) {
        newRange.setStartBefore(firstChild);
        newRange.setEndAfter(lastChild);
      }
    }

    return { range: newRange, beforeNode, afterNode };
  }

  function applyInlineCode() {
    restoreEditorSelection();
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
    const sel = window.getSelection();
    const canvas = document.getElementById('rich-canvas-prose');
    if (!sel || !sel.rangeCount || !canvas) return;

    const range = sel.getRangeAt(0);
    if (!canvas.contains(range.commonAncestorContainer)) return;

    let anchorEl = range.commonAncestorContainer;
    if (anchorEl.nodeType === Node.TEXT_NODE) anchorEl = anchorEl.parentNode;
    if (anchorEl && anchorEl.closest && anchorEl.closest('pre')) {
      return;
    }

    const enclosingCode = (anchorEl && anchorEl.closest) ? anchorEl.closest('code:not(pre code)') : null;

    if (sel.isCollapsed) {
      if (enclosingCode && canvas.contains(enclosingCode)) {
        const visibleText = (enclosingCode.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
        if (!visibleText) {
          // Empty inline code: unwrap and leave caret in parent block
          const parent = enclosingCode.parentNode;
          const zwsp = document.createTextNode('\u200B');
          parent.replaceChild(zwsp, enclosingCode);
          const newRange = document.createRange();
          newRange.setStart(zwsp, 1);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedSelectionRange = newRange.cloneRange();
          window._savedSelectionRange = savedSelectionRange;
        } else {
          // Caret is inside non-empty <code>: split or step outside <code> so typing continues in normal text
          const postRange = document.createRange();
          postRange.selectNodeContents(enclosingCode);
          postRange.setStart(range.startContainer, range.startOffset);
          const postText = (postRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

          let targetAfterNode = enclosingCode;
          if (postText.length > 0) {
            const splitRes = splitInlineElementAtRange(enclosingCode, range);
            if (splitRes && splitRes.beforeNode) {
              targetAfterNode = splitRes.beforeNode;
            }
          }

          const zwsp = document.createTextNode('\u200B');
          if (targetAfterNode && targetAfterNode.parentNode) {
            targetAfterNode.parentNode.insertBefore(zwsp, targetAfterNode.nextSibling);
          } else {
            range.insertNode(zwsp);
          }
          const newRange = document.createRange();
          newRange.setStart(zwsp, 1);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedSelectionRange = newRange.cloneRange();
          window._savedSelectionRange = savedSelectionRange;
        }
      } else {
        // Caret is outside <code>: insert <code>\u200B</code> and place caret inside
        const codeEl = document.createElement('code');
        const zwsp = document.createTextNode('\u200B');
        codeEl.appendChild(zwsp);
        range.insertNode(codeEl);

        const newRange = document.createRange();
        newRange.setStart(zwsp, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }

      updateToolbarActiveStates();
      if (typeof window.recordAction === 'function') window.recordAction('format', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    // Non-collapsed selection
    if (enclosingCode && canvas.contains(enclosingCode)) {
      const splitRes = splitInlineElementAtRange(enclosingCode, range);
      if (splitRes && splitRes.range) {
        sel.removeAllRanges();
        sel.addRange(splitRes.range);
        savedSelectionRange = splitRes.range.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }
    } else {
      const contents = range.extractContents();
      contents.querySelectorAll('code').forEach(nested => unwrapElementPreservingChildren(nested));
      const code = document.createElement('code');
      code.appendChild(contents);
      range.insertNode(code);

      // Merge with immediately adjacent <code> siblings if any
      if (code.previousSibling && code.previousSibling.nodeType === Node.ELEMENT_NODE && code.previousSibling.tagName === 'CODE') {
        const prev = code.previousSibling;
        while (prev.lastChild) {
          code.insertBefore(prev.lastChild, code.firstChild);
        }
        prev.remove();
      }
      if (code.nextSibling && code.nextSibling.nodeType === Node.ELEMENT_NODE && code.nextSibling.tagName === 'CODE') {
        const next = code.nextSibling;
        while (next.firstChild) {
          code.appendChild(next.firstChild);
        }
        next.remove();
      }

      const newRange = document.createRange();
      newRange.selectNodeContents(code);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedSelectionRange = newRange.cloneRange();
      window._savedSelectionRange = savedSelectionRange;
    }

    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('format', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function applyHighlight() {
    restoreEditorSelection();
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
    const sel = window.getSelection();
    const canvas = document.getElementById('rich-canvas-prose');
    if (!sel || !sel.rangeCount || !canvas) return;

    const range = sel.getRangeAt(0);
    if (!canvas.contains(range.commonAncestorContainer)) return;

    let anchorEl = range.commonAncestorContainer;
    if (anchorEl.nodeType === Node.TEXT_NODE) anchorEl = anchorEl.parentNode;
    if (anchorEl && anchorEl.closest && anchorEl.closest('pre')) {
      return;
    }

    const enclosingMark = (anchorEl && anchorEl.closest) ? anchorEl.closest('mark') : null;

    if (sel.isCollapsed) {
      if (enclosingMark && canvas.contains(enclosingMark)) {
        const visibleText = (enclosingMark.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
        if (!visibleText) {
          const parent = enclosingMark.parentNode;
          const zwsp = document.createTextNode('\u200B');
          parent.replaceChild(zwsp, enclosingMark);
          const newRange = document.createRange();
          newRange.setStart(zwsp, 1);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedSelectionRange = newRange.cloneRange();
          window._savedSelectionRange = savedSelectionRange;
        } else {
          const postRange = document.createRange();
          postRange.selectNodeContents(enclosingMark);
          postRange.setStart(range.startContainer, range.startOffset);
          const postText = (postRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

          let targetAfterNode = enclosingMark;
          if (postText.length > 0) {
            const splitRes = splitInlineElementAtRange(enclosingMark, range);
            if (splitRes && splitRes.beforeNode) {
              targetAfterNode = splitRes.beforeNode;
            }
          }

          const zwsp = document.createTextNode('\u200B');
          if (targetAfterNode && targetAfterNode.parentNode) {
            targetAfterNode.parentNode.insertBefore(zwsp, targetAfterNode.nextSibling);
          } else {
            range.insertNode(zwsp);
          }
          const newRange = document.createRange();
          newRange.setStart(zwsp, 1);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedSelectionRange = newRange.cloneRange();
          window._savedSelectionRange = savedSelectionRange;
        }
      } else {
        const markEl = document.createElement('mark');
        markEl.className = 'cedar-highlight';
        const zwsp = document.createTextNode('\u200B');
        markEl.appendChild(zwsp);
        range.insertNode(markEl);

        const newRange = document.createRange();
        newRange.setStart(zwsp, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }

      updateToolbarActiveStates();
      if (typeof window.recordAction === 'function') window.recordAction('format', true);
      if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    // Non-collapsed selection
    if (enclosingMark && canvas.contains(enclosingMark)) {
      const splitRes = splitInlineElementAtRange(enclosingMark, range);
      if (splitRes && splitRes.range) {
        sel.removeAllRanges();
        sel.addRange(splitRes.range);
        savedSelectionRange = splitRes.range.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }
    } else {
      const contents = range.extractContents();
      const existingMarks = Array.from(contents.querySelectorAll('mark'));
      // If the entire selection was already wrapped in <mark>, unwrap it to toggle off
      const onlyMarkChildren = existingMarks.length > 0 && Array.from(contents.childNodes).every(n =>
        (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) ||
        (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'MARK')
      );
      if (onlyMarkChildren) {
        existingMarks.forEach(nested => unwrapElementPreservingChildren(nested));
        const firstChild = contents.firstChild;
        const lastChild = contents.lastChild;
        range.insertNode(contents);
        if (firstChild && lastChild) {
          const newRange = document.createRange();
          newRange.setStartBefore(firstChild);
          newRange.setEndAfter(lastChild);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedSelectionRange = newRange.cloneRange();
          window._savedSelectionRange = savedSelectionRange;
        }
      } else {
        existingMarks.forEach(nested => unwrapElementPreservingChildren(nested));
        const mark = document.createElement('mark');
        mark.className = 'cedar-highlight';
        mark.appendChild(contents);
        range.insertNode(mark);

        if (mark.previousSibling && mark.previousSibling.nodeType === Node.ELEMENT_NODE && mark.previousSibling.tagName === 'MARK') {
          const prev = mark.previousSibling;
          while (prev.lastChild) {
            mark.insertBefore(prev.lastChild, mark.firstChild);
          }
          prev.remove();
        }
        if (mark.nextSibling && mark.nextSibling.nodeType === Node.ELEMENT_NODE && mark.nextSibling.tagName === 'MARK') {
          const next = mark.nextSibling;
          while (next.firstChild) {
            mark.appendChild(next.firstChild);
          }
          next.remove();
        }

        const newRange = document.createRange();
        newRange.selectNodeContents(mark);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }
    }

    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('format', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function resolveRangeTextEndpoint(node, offset, isEnd) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      return { node, offset: Math.max(0, Math.min(offset, (node.nodeValue || '').length)) };
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const children = node.childNodes;
      if (!children || children.length === 0) return null;
      if (!isEnd) {
        const startIdx = Math.max(0, Math.min(offset, children.length - 1));
        for (let i = startIdx; i < children.length; i++) {
          const walker = document.createTreeWalker(children[i], NodeFilter.SHOW_TEXT, null, false);
          const firstTxt = children[i].nodeType === Node.TEXT_NODE ? children[i] : walker.nextNode();
          if (firstTxt) return { node: firstTxt, offset: 0 };
        }
      } else {
        const endIdx = Math.max(0, Math.min(offset - 1, children.length - 1));
        for (let i = endIdx; i >= 0; i--) {
          if (children[i].nodeType === Node.TEXT_NODE) {
            return { node: children[i], offset: (children[i].nodeValue || '').length };
          }
          const walker = document.createTreeWalker(children[i], NodeFilter.SHOW_TEXT, null, false);
          let lastTxt = null;
          let cur = walker.nextNode();
          while (cur) {
            lastTxt = cur;
            cur = walker.nextNode();
          }
          if (lastTxt) return { node: lastTxt, offset: (lastTxt.nodeValue || '').length };
        }
      }
    }
    return null;
  }

  function normalizeCustomColorNodes(container) {
    if (!container || !container.querySelectorAll) return;

    // Capture live selection text endpoints inside container so DOM wrapper restructuring never drops selection
    const sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    let savedStartPt = null;
    let savedEndPt = null;
    let wasCollapsed = false;
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (container.contains(r.commonAncestorContainer)) {
        wasCollapsed = r.collapsed;
        savedStartPt = resolveRangeTextEndpoint(r.startContainer, r.startOffset, false);
        savedEndPt = wasCollapsed ? savedStartPt : resolveRangeTextEndpoint(r.endContainer, r.endOffset, true);
      }
    }

    // 1. Strip any rogue inline color / text-decoration-color styles injected by browser execCommand/backspace on inline tags
    container.querySelectorAll('u[style], s[style], del[style], strike[style], strong[style], b[style], em[style], i[style]').forEach(el => {
      if (el.closest('[contenteditable="false"]')) return;
      if (el.style) {
        el.style.color = '';
        el.style.textDecorationColor = '';
        el.style.backgroundColor = '';
        if (!el.getAttribute('style') || !el.getAttribute('style').trim()) {
          el.removeAttribute('style');
        }
      }
    });

    // 1B. If browser injected text-decoration: underline directly onto a span.cedar-custom-color, move it to an inner <u>
    container.querySelectorAll('span.cedar-custom-color[style]').forEach(span => {
      if (span.closest('[contenteditable="false"]')) return;
      const td = (span.style.textDecoration || span.style.textDecorationLine || '').toLowerCase();
      const customHex = (span.getAttribute('data-custom-color') || span.style.color || '').trim().toLowerCase();
      if (td.includes('underline')) {
        const alreadyU = span.children.length === 1 && span.childNodes.length === 1 && span.firstElementChild.tagName === 'U';
        if (!alreadyU && !span.closest('u')) {
          const u = document.createElement('u');
          while (span.firstChild) {
            u.appendChild(span.firstChild);
          }
          span.appendChild(u);
        }
      }
      if (customHex) {
        span.setAttribute('data-custom-color', customHex);
        span.setAttribute('style', `color: ${customHex};`);
      }
    });

    // 2. Ensure span.cedar-custom-color is always outside inline formatting tags (u, s, del, strike, strong, b, em, i, a)
    // and never nested inside another span.cedar-custom-color so that underline (<u>) and strikethrough (<s>)
    // always inherit their text's exact color (currentColor).
    const inlineTagsToPushInside = new Set(['U', 'S', 'DEL', 'STRIKE', 'STRONG', 'B', 'EM', 'I', 'A']);
    let moved = true;
    let guard = 0;
    while (moved && guard < 80) {
      moved = false;
      guard++;
      const colorSpans = Array.from(container.querySelectorAll('span.cedar-custom-color'));
      for (let i = 0; i < colorSpans.length; i++) {
        const span = colorSpans[i];
        if (!span.parentNode || !container.contains(span)) continue;
        const parent = span.parentElement;
        if (!parent || parent === container) continue;

        const isParentColorSpan = parent.tagName === 'SPAN' && parent.classList && parent.classList.contains('cedar-custom-color');
        const isParentInlineFormat = inlineTagsToPushInside.has(parent.tagName) && !parent.classList.contains('post-card') && !parent.classList.contains('post-card-link') && !parent.classList.contains('btn');

        if (!isParentColorSpan && !isParentInlineFormat) continue;
        const grandParent = parent.parentNode;
        if (!grandParent) continue;

        if (isParentColorSpan) {
          const spanColor = (span.getAttribute('data-custom-color') || span.style?.color || '').trim().toLowerCase();
          const parentColor = (parent.getAttribute('data-custom-color') || parent.style?.color || '').trim().toLowerCase();
          if (spanColor === parentColor) {
            unwrapElementPreservingChildren(span);
            moved = true;
            break;
          }
        }

        // Split `parent` around `span`
        const beforeNodes = [];
        const afterNodes = [];
        let seenSpan = false;
        Array.from(parent.childNodes).forEach(child => {
          if (child === span) {
            seenSpan = true;
          } else if (!seenSpan) {
            beforeNodes.push(child);
          } else {
            afterNodes.push(child);
          }
        });

        const hasMeaningfulContent = (nodes) => nodes.some(n => {
          if (n.nodeType === Node.TEXT_NODE) return (n.nodeValue || '').length > 0;
          if (n.nodeType === Node.ELEMENT_NODE) {
            if (n.tagName === 'BR' || n.tagName === 'IMG') return true;
            return (n.textContent || '').length > 0 || Boolean(n.querySelector && n.querySelector('br, img'));
          }
          return false;
        });

        if (hasMeaningfulContent(beforeNodes)) {
          const beforeClone = parent.cloneNode(false);
          beforeNodes.forEach(n => beforeClone.appendChild(n));
          grandParent.insertBefore(beforeClone, parent);
        }

        if (isParentInlineFormat) {
          // Wrap span's inner contents in a clone of `parent` (unless already wrapped in the same tag)
          const onlyChildSameTag = span.children.length === 1 &&
            span.childNodes.length === 1 &&
            span.firstElementChild.tagName === parent.tagName;
          if (!onlyChildSameTag) {
            const innerClone = parent.cloneNode(false);
            while (span.firstChild) {
              innerClone.appendChild(span.firstChild);
            }
            span.appendChild(innerClone);
          }
        }
        grandParent.insertBefore(span, parent);

        if (hasMeaningfulContent(afterNodes)) {
          const afterClone = parent.cloneNode(false);
          afterNodes.forEach(n => afterClone.appendChild(n));
          grandParent.insertBefore(afterClone, parent);
        }

        grandParent.removeChild(parent);
        moved = true;
        break;
      }
    }

    // 3. Merge adjacent sibling span.cedar-custom-color with identical color
    container.querySelectorAll('span.cedar-custom-color').forEach(span => {
      if (!span.parentNode) return;
      const color = (span.getAttribute('data-custom-color') || span.style?.color || '').trim().toLowerCase();
      let next = span.nextSibling;
      while (next && next.nodeType === Node.ELEMENT_NODE && next.tagName === 'SPAN' && next.classList.contains('cedar-custom-color')) {
        const nextColor = (next.getAttribute('data-custom-color') || next.style?.color || '').trim().toLowerCase();
        if (nextColor === color) {
          const toRemove = next;
          next = next.nextSibling;
          while (toRemove.firstChild) {
            span.appendChild(toRemove.firstChild);
          }
          toRemove.remove();
        } else {
          break;
        }
      }
    });

    // 4. Merge adjacent identical inline formatting siblings (e.g. <u>a</u><u>b</u> -> <u>ab</u>)
    container.querySelectorAll('u, s, del, strike, strong, b, em, i').forEach(el => {
      if (!el.parentNode) return;
      let next = el.nextSibling;
      while (next && next.nodeType === Node.ELEMENT_NODE && next.tagName === el.tagName && !next.getAttribute('style') && !el.getAttribute('style')) {
        const toRemove = next;
        next = next.nextSibling;
        while (toRemove.firstChild) {
          el.appendChild(toRemove.firstChild);
        }
        toRemove.remove();
      }
    });

    // Restore live selection if endpoints are still connected in container
    if (sel && savedStartPt && savedEndPt && savedStartPt.node && savedEndPt.node &&
        savedStartPt.node.isConnected && savedEndPt.node.isConnected) {
      try {
        const restored = document.createRange();
        restored.setStart(savedStartPt.node, savedStartPt.offset);
        if (wasCollapsed) {
          restored.collapse(true);
        } else {
          restored.setEnd(savedEndPt.node, savedEndPt.offset);
        }
        sel.removeAllRanges();
        sel.addRange(restored);
        savedSelectionRange = restored.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      } catch (e) {}
    }
  }

  function applyFontColor(colorValue) {
    const normalizedColor = (!colorValue || colorValue === 'default') ? 'default' : colorValue.trim().toLowerCase();
    const activeMode = window.activeMode || 'canvas';

    if (activeMode === 'markdown') {
      const mdInput = document.getElementById('markdown-input');
      if (!mdInput) return;
      if (normalizedColor === 'default') {
        const start = mdInput.selectionStart;
        const end = mdInput.selectionEnd;
        const selected = mdInput.value.substring(start, end);
        const stripped = selected.replace(/<span\b[^>]*class=["'][^"']*cedar-custom-color[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '$1');
        insertMarkdownAtCursor(stripped, '', '');
      } else {
        insertMarkdownAtCursor(
          `<span class="cedar-custom-color" data-custom-color="${normalizedColor}" style="color: ${normalizedColor};">`,
          '</span>',
          'colored text'
        );
      }
      return;
    }

    restoreEditorSelection();
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
    const sel = window.getSelection();
    const canvas = document.getElementById('rich-canvas-prose');
    if (!sel || !sel.rangeCount || !canvas) return;

    let range = sel.getRangeAt(0);
    if (!canvas.contains(range.commonAncestorContainer)) return;

    let anchorEl = range.commonAncestorContainer;
    if (anchorEl.nodeType === Node.TEXT_NODE) anchorEl = anchorEl.parentNode;
    const enclosingColorSpan = (anchorEl && anchorEl.closest) ? anchorEl.closest('span.cedar-custom-color') : null;

    if (sel.isCollapsed) {
      // Collect active inline formatting tags (u, s, del, strike, strong, b, em, i) inside enclosingColorSpan
      // so stepping out of or switching color on a collapsed caret preserves underline/bold/italic/strikethrough
      const activeFormattingTags = [];
      if (enclosingColorSpan && anchorEl) {
        let curr = anchorEl;
        while (curr && curr !== enclosingColorSpan && enclosingColorSpan.contains(curr)) {
          if (curr.nodeType === Node.ELEMENT_NODE && ['U', 'S', 'DEL', 'STRIKE', 'STRONG', 'B', 'EM', 'I'].includes(curr.tagName)) {
            activeFormattingTags.push(curr.cloneNode(false));
          }
          curr = curr.parentNode;
        }
      }
      const wrapZwspInActiveTags = (zwspNode) => {
        let current = zwspNode;
        for (let i = 0; i < activeFormattingTags.length; i++) {
          const wrapper = activeFormattingTags[i].cloneNode(false);
          wrapper.appendChild(current);
          current = wrapper;
        }
        return current;
      };

      if (normalizedColor === 'default') {
        if (enclosingColorSpan && canvas.contains(enclosingColorSpan)) {
          const visibleText = (enclosingColorSpan.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (!visibleText) {
            const parent = enclosingColorSpan.parentNode;
            const zwsp = document.createTextNode('\u200B');
            const wrapped = wrapZwspInActiveTags(zwsp);
            parent.replaceChild(wrapped, enclosingColorSpan);
            const newRange = document.createRange();
            newRange.setStart(zwsp, 1);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            savedSelectionRange = newRange.cloneRange();
            window._savedSelectionRange = savedSelectionRange;
          } else {
            const postRange = document.createRange();
            postRange.selectNodeContents(enclosingColorSpan);
            postRange.setStart(range.startContainer, range.startOffset);
            const postText = (postRange.toString() || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

            let targetAfterNode = enclosingColorSpan;
            if (postText.length > 0) {
              const splitRes = splitInlineElementAtRange(enclosingColorSpan, range);
              if (splitRes && splitRes.beforeNode) {
                targetAfterNode = splitRes.beforeNode;
              }
            }

            const zwsp = document.createTextNode('\u200B');
            const wrapped = wrapZwspInActiveTags(zwsp);
            if (targetAfterNode && targetAfterNode.parentNode) {
              targetAfterNode.parentNode.insertBefore(wrapped, targetAfterNode.nextSibling);
            } else {
              range.insertNode(wrapped);
            }
            const newRange = document.createRange();
            newRange.setStart(zwsp, 1);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            savedSelectionRange = newRange.cloneRange();
            window._savedSelectionRange = savedSelectionRange;
          }
          normalizeCustomColorNodes(canvas);
        }
      } else {
        // Custom hex color selected with collapsed caret
        if (enclosingColorSpan && canvas.contains(enclosingColorSpan)) {
          const currentSpanColor = (enclosingColorSpan.getAttribute('data-custom-color') || '').toLowerCase();
          if (currentSpanColor === normalizedColor) {
            updateToolbarActiveStates();
            return;
          }
          const visibleText = (enclosingColorSpan.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (!visibleText) {
            enclosingColorSpan.setAttribute('data-custom-color', normalizedColor);
            enclosingColorSpan.style.color = normalizedColor;
            normalizeCustomColorNodes(canvas);
            updateToolbarActiveStates();
            if (typeof window.recordAction === 'function') window.recordAction('format', true);
            if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
            return;
          }
          // Split existing color span at caret and insert new color span
          const splitRes = splitInlineElementAtRange(enclosingColorSpan, range);
          if (splitRes && splitRes.range) {
            range = splitRes.range;
          }
        }

        const span = document.createElement('span');
        span.className = 'cedar-custom-color';
        span.setAttribute('data-custom-color', normalizedColor);
        span.style.color = normalizedColor;
        const zwsp = document.createTextNode('\u200B');
        const wrapped = wrapZwspInActiveTags(zwsp);
        span.appendChild(wrapped);
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.setStart(zwsp, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
        normalizeCustomColorNodes(canvas);
      }

      updateToolbarActiveStates();
      if (typeof window.recordAction === 'function') window.recordAction('format', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    // Non-collapsed selection (highlighted text)
    if (enclosingColorSpan && canvas.contains(enclosingColorSpan)) {
      const splitRes = splitInlineElementAtRange(enclosingColorSpan, range);
      if (splitRes && splitRes.range) {
        range = splitRes.range;
      }
    }

    if (normalizedColor === 'default') {
      const contents = range.extractContents();
      contents.querySelectorAll('span.cedar-custom-color').forEach(s => unwrapElementPreservingChildren(s));
      contents.querySelectorAll('[style]').forEach(el => {
        if (el.style) {
          el.style.color = '';
          el.style.textDecorationColor = '';
          if (!el.getAttribute('style') || !el.getAttribute('style').trim()) {
            el.removeAttribute('style');
          }
        }
      });
      const firstChild = contents.firstChild;
      const lastChild = contents.lastChild;
      range.insertNode(contents);
      if (firstChild && lastChild && firstChild.parentNode && lastChild.parentNode) {
        const newRange = document.createRange();
        newRange.setStartBefore(firstChild);
        newRange.setEndAfter(lastChild);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }
      normalizeCustomColorNodes(canvas);
    } else {
      const contents = range.extractContents();
      contents.querySelectorAll('span.cedar-custom-color').forEach(s => unwrapElementPreservingChildren(s));
      const span = document.createElement('span');
      span.className = 'cedar-custom-color';
      span.setAttribute('data-custom-color', normalizedColor);
      span.style.color = normalizedColor;
      span.appendChild(contents);
      range.insertNode(span);

      if (span.isConnected) {
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        window._savedSelectionRange = savedSelectionRange;
      }

      normalizeCustomColorNodes(canvas);
    }

    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('format', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function resetActiveInlineFormatting() {
    const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
    commands.forEach(cmd => {
      try {
        if (document.queryCommandState(cmd)) {
          document.execCommand(cmd, false, null);
        }
      } catch (e) {}
    });
  }

  function setElementAlignment(el, align) {
    if (!el || !el.style) return;
    el.classList.remove('align-left', 'align-center', 'align-right');
    if (align === 'left' || !align) {
      el.style.textAlign = '';
      el.removeAttribute('align');
      const styledChildren = el.querySelectorAll ? el.querySelectorAll('[align], [style*="text-align"], .align-left, .align-center, .align-right') : [];
      styledChildren.forEach(child => {
        child.classList.remove('align-left', 'align-center', 'align-right');
        if (child.style) child.style.textAlign = '';
        if (child.removeAttribute) child.removeAttribute('align');
      });
    } else {
      el.style.textAlign = align;
      el.setAttribute('align', align);
      el.classList.add(`align-${align}`);
    }
  }

  function applyBlockAlignment(align) {
    restoreEditorSelection();
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();

    const canvas = document.getElementById('rich-canvas-prose');
    const sel = window.getSelection();

    // 1. Browser native execCommand
    const cmdMap = {
      'left': 'justifyLeft',
      'center': 'justifyCenter',
      'right': 'justifyRight'
    };
    const cmd = cmdMap[align] || 'justifyLeft';
    try {
      document.execCommand(cmd, false, null);
    } catch (e) {}

    // 2. Selected non-text block (e.g. image figure or quote)
    const selectedNonText = canvas ? canvas.querySelector('.selected, .captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, blockquote.selected') : null;
    if (selectedNonText) {
      setElementAlignment(selectedNonText, align);
    }

    // 3. Find and apply/clear alignment on target block element(s) in canvas
    if (sel && sel.rangeCount > 0 && canvas) {
      const range = sel.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      if (canvas.contains(node)) {
        // Nearest block element (p, heading, blockquote, div)
        let targetBlock = node;
        while (targetBlock && targetBlock !== canvas && !['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div'].includes(targetBlock.tagName?.toLowerCase())) {
          targetBlock = targetBlock.parentNode;
        }
        if (targetBlock && targetBlock !== canvas) {
          setElementAlignment(targetBlock, align);
        }

        // Top-level block elements intersecting the selection range
        Array.from(canvas.children).forEach(child => {
          if (range.intersectsNode(child)) {
            setElementAlignment(child, align);
          }
        });
      }
    }

    saveCurrentSelection();
    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('align', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function applyBlockIndent(direction = 'toggle') {
    const activeMode = window.activeMode || 'canvas';
    if (activeMode === 'markdown') {
      const mdInput = document.getElementById('markdown-input');
      if (!mdInput) return;
      if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
      const start = mdInput.selectionStart;
      const end = mdInput.selectionEnd;
      const val = mdInput.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      let lineEnd = val.indexOf('\n', end);
      if (lineEnd === -1) lineEnd = val.length;
      const line = val.substring(lineStart, lineEnd);
      const indentMatch = line.match(/^<(p|div|h[1-6]|blockquote)\b[^>]*data-indent=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/\1>$/i);
      let newLine = line;
      if (indentMatch) {
        const tag = indentMatch[1];
        const curLevel = parseInt(indentMatch[2], 10) || 1;
        const inner = indentMatch[3];
        let nextLevel = curLevel;
        if (direction === 'outdent') nextLevel = curLevel - 1;
        else if (direction === 'indent') nextLevel = Math.min(4, curLevel + 1);
        else nextLevel = 0;
        newLine = nextLevel > 0 ? `<${tag} data-indent="${nextLevel}">${inner}</${tag}>` : inner;
      } else if (direction !== 'outdent') {
        newLine = `<p data-indent="1">${line || 'Indented text'}</p>`;
      }
      mdInput.value = val.substring(0, lineStart) + newLine + val.substring(lineEnd);
      mdInput.selectionStart = lineStart;
      mdInput.selectionEnd = lineStart + newLine.length;
      if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    restoreEditorSelection();
    const sel = window.getSelection();
    const canvas = document.getElementById('rich-canvas-prose');
    if (!canvas) return;

    const targetBlocks = [];
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      if (canvas.contains(node)) {
        Array.from(canvas.children).forEach(child => {
          if (range.intersectsNode(child) && ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'DIV'].includes(child.tagName)) {
            if (!child.classList.contains('captioned-image-container') &&
                !child.classList.contains('custom-gallery-grid') &&
                !child.classList.contains('video-wrapper') &&
                !child.classList.contains('article-share-block') &&
                !child.classList.contains('article-rss-block') &&
                !child.classList.contains('page-recent-posts-block') &&
                !child.classList.contains('page-individual-post-block')) {
              targetBlocks.push(child);
            }
          }
        });

        if (targetBlocks.length === 0) {
          let curr = node;
          while (curr && curr.parentNode !== canvas && curr !== canvas && curr !== document.body) {
            curr = curr.parentNode;
          }
          if (curr && curr.parentNode === canvas && ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'DIV'].includes(curr.tagName)) {
            targetBlocks.push(curr);
          }
        }
      }
    }

    if (targetBlocks.length === 0 && window._lastActiveBlock && window._lastActiveBlock.parentNode === canvas) {
      if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'DIV'].includes(window._lastActiveBlock.tagName)) {
        targetBlocks.push(window._lastActiveBlock);
      }
    }

    if (targetBlocks.length === 0) return;
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();

    targetBlocks.forEach(block => {
      const curLevel = parseInt(block.getAttribute('data-indent') || '0', 10) || 0;
      let nextLevel = curLevel;
      if (direction === 'indent') {
        nextLevel = Math.min(4, curLevel + 1);
      } else if (direction === 'outdent') {
        nextLevel = Math.max(0, curLevel - 1);
      } else {
        // 'toggle' from toolbar button: if unindented -> 1; if already indented -> 0
        nextLevel = curLevel > 0 ? 0 : 1;
      }

      if (nextLevel > 0) {
        block.setAttribute('data-indent', String(nextLevel));
      } else {
        block.removeAttribute('data-indent');
      }
    });

    saveCurrentSelection();
    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('indent', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  /**
   * Automatically maintains approximately 1/3rd of the viewport window
   * as empty breathing space below the active typing line/block.
   */
  function maintainCaretScrollBuffer(smooth = false) {
    const container = document.querySelector('.canvas-scroll-container');
    if (!container) return;

    const cRect = container.getBoundingClientRect();
    const cHeight = container.clientHeight;
    if (!cHeight) return;

    // Buffer threshold: ensure active caret/line has at least 1/3rd of the viewport below it
    const bottomThreshold = cRect.bottom - (cHeight / 3);
    let targetBottom = null;
    const activeMode = window.activeMode || 'canvas';

    if (activeMode === 'markdown') {
      const mdInput = document.getElementById('markdown-input');
      if (mdInput && document.activeElement === mdInput) {
        const cs = window.getComputedStyle(mdInput);
        const lh = parseFloat(cs.lineHeight) || 28;
        const textBefore = mdInput.value.substring(0, mdInput.selectionStart);
        const lines = textBefore.split('\n').length;
        const mdRect = mdInput.getBoundingClientRect();
        targetBottom = mdRect.top + (lines * lh);
      }
    }

    if (targetBottom === null) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          targetBottom = rects[0].bottom;
        } else {
          let node = range.startContainer;
          if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            targetBottom = node.getBoundingClientRect().bottom;
          }
        }
      }
    }

    if (targetBottom === null && document.activeElement && container.contains(document.activeElement)) {
      targetBottom = document.activeElement.getBoundingClientRect().bottom;
    }

    if (targetBottom !== null) {
      const delta = targetBottom - bottomThreshold;
      if (delta > 0) {
        if (smooth) {
          container.scrollBy({ top: delta, behavior: 'smooth' });
        } else {
          container.scrollTop += delta;
        }
      }
    }
  }

  function focusNodeCaret(el, atStart = false) {
    if (!el) return;
    const target = el.querySelector('p') || el.querySelector('code') || el;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(atStart ? true : false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const canvas = el.closest ? (el.closest('[contenteditable="true"]') || document.getElementById('rich-canvas-prose')) : document.getElementById('rich-canvas-prose');
    if (canvas && typeof canvas.focus === 'function') {
      canvas.focus();
    } else if (typeof el.focus === 'function') {
      el.focus();
    }
    savedSelectionRange = range.cloneRange();
    window._savedSelectionRange = savedSelectionRange;
    let node = target;
    while (node && node.parentNode !== canvas && node !== canvas) {
      node = node.parentNode;
    }
    if (node && node.parentNode === canvas) {
      window._lastActiveBlock = node;
      if (canvas) {
        canvas.querySelectorAll('.selected, .selected-item').forEach(el => {
          if (el !== node) el.classList.remove('selected', 'selected-item');
        });
      }
      window._selectedImageBlock = null;
      window._lastActiveImageBlock = null;
    }
  }

  function splitBlockToNewParagraph(topBlock, canvasProse) {
    if ((window.Cedar?.editor?.splitBlockToNewParagraph || window.Outpost?.editor?.splitBlockToNewParagraph) && (window.Cedar.editor || window.Outpost.editor).splitBlockToNewParagraph !== splitBlockToNewParagraph) {
      return (window.Cedar.editor || window.Outpost.editor).splitBlockToNewParagraph(topBlock, canvasProse);
    }
    if (coreSplitBlockToNewParagraph) {
      return coreSplitBlockToNewParagraph(topBlock, canvasProse);
    }
    if (!canvasProse) canvasProse = document.getElementById('rich-canvas-prose');
    const newP = document.createElement('p');
    newP.innerHTML = '<br>';

    if (!topBlock || topBlock === canvasProse) {
      canvasProse.appendChild(newP);
      focusNodeCaret(newP, true);
      resetActiveInlineFormatting();
      updateToolbarActiveStates();
      maintainCaretScrollBuffer();
      return;
    }

    // Void or container blocks without editable inline text splitting
    if (topBlock.classList.contains('captioned-image-container') ||
        topBlock.classList.contains('custom-gallery-grid') ||
        topBlock.classList.contains('post-nav-grid') ||
        topBlock.classList.contains('video-wrapper') ||
        topBlock.classList.contains('article-share-block') ||
        topBlock.tagName === 'BLOCKQUOTE' ||
        topBlock.tagName === 'PRE' ||
        topBlock.tagName === 'HR') {
      topBlock.parentNode.insertBefore(newP, topBlock.nextSibling);
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse, newP);
      focusNodeCaret(newP, true);
      resetActiveInlineFormatting();
      updateToolbarActiveStates();
      if (typeof window.recordAction === 'function') window.recordAction('enter-new-block', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      maintainCaretScrollBuffer();
      return;
    }

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    if (!range.collapsed) {
      range.deleteContents();
    }

    const preRange = document.createRange();
    preRange.selectNodeContents(topBlock);
    preRange.setEnd(range.startContainer, range.startOffset);
    const preFragment = preRange.cloneContents();
    const isAtStart = (preFragment.textContent || '').length === 0 && !preFragment.querySelector('img, iframe, hr, audio, video');
    const isEmptyBlock = (topBlock.textContent || '').trim().length === 0 && !topBlock.querySelector('img, iframe, hr, audio, video');

    if (isAtStart && !isEmptyBlock) {
      topBlock.parentNode.insertBefore(newP, topBlock);
      if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse, newP);
      updateToolbarActiveStates();
      if (typeof window.recordAction === 'function') window.recordAction('enter-new-block', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(topBlock);
    endRange.setStart(range.endContainer, range.endOffset);
    const extracted = endRange.extractContents();

    const hasText = extracted.textContent && extracted.textContent.trim().length > 0;
    const hasMedia = !!(extracted.querySelector && extracted.querySelector('img, iframe, video, audio, hr'));

    if (hasText || hasMedia) {
      newP.innerHTML = '';
      if (extracted.children.length === 1 && extracted.firstElementChild.tagName === 'P') {
        while (extracted.firstElementChild.firstChild) {
          newP.appendChild(extracted.firstElementChild.firstChild);
        }
      } else {
        newP.appendChild(extracted);
      }
    } else {
      newP.innerHTML = '<br>';
    }

    // Clean up topBlock if it was emptied
    if (topBlock.textContent.trim().length === 0 && !topBlock.querySelector('img, iframe, hr, video, audio')) {
      topBlock.innerHTML = '<br>';
    } else {
      try {
        topBlock.querySelectorAll('strong, em, b, i, u, s, strike, del, a, code, span').forEach(el => {
          if (!el.textContent && !el.children.length) el.remove();
        });
      } catch (e) {}
    }

    topBlock.parentNode.insertBefore(newP, topBlock.nextSibling);
    if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvasProse, newP);
    focusNodeCaret(newP, true);
    resetActiveInlineFormatting();
    updateToolbarActiveStates();
    if (typeof window.recordAction === 'function') window.recordAction('enter-new-block', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    maintainCaretScrollBuffer();
  }

  function swapCurrentBlock(targetType) {
    if (typeof coreSwapCurrentBlock === 'function') {
      return coreSwapCurrentBlock(targetType);
    }
    restoreEditorSelection();
    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
    const canvas = document.getElementById('rich-canvas-prose');
    const sel = window.getSelection();
    const activeMode = window.activeMode || 'canvas';

    if (activeMode === 'markdown') {
      const mdInput = document.getElementById('markdown-input');
      if (!mdInput) return;
      const start = mdInput.selectionStart;
      const end = mdInput.selectionEnd;
      const val = mdInput.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      let lineEnd = val.indexOf('\n', end);
      if (lineEnd === -1) lineEnd = val.length;
      const curLine = val.substring(lineStart, lineEnd);
      let cleanLine = curLine.replace(/^(#{1,6}\s*|>(\s*\[!(NOTE|WARNING)\])?\s*|---\s*|```[a-z]*\s*)/i, '').trim();

      let rep = cleanLine;
      switch (targetType) {
        case 'text':
        case 'p':
          rep = cleanLine;
          break;
        case 'callout-note':
          rep = `> [!NOTE]\n> ${cleanLine || 'Add your informative note or tip here.'}`;
          break;
        case 'callout-warning':
          rep = `> [!WARNING]\n> Caution: Make sure to check your configuration before continuing.`;
          break;
        case 'hr':
          rep = `\n---\n\n`;
          break;
        case 'h2':
          rep = `## ${cleanLine || 'Heading 2'}`;
          break;
        case 'h3':
          rep = `### ${cleanLine || 'Heading 3'}`;
          break;
        case 'h4':
          rep = `#### ${cleanLine || 'Heading 4'}`;
          break;
        case 'quote':
        case 'blockquote':
          rep = `> ${cleanLine || 'Quote text here...'}`;
          break;
        case 'codeblock':
        case 'code':
          rep = `\`\`\`\n${cleanLine || '// Code here'}\n\`\`\``;
          break;
      }
      mdInput.value = val.substring(0, lineStart) + rep + val.substring(lineEnd);
      mdInput.selectionStart = lineStart + rep.length;
      mdInput.selectionEnd = lineStart + rep.length;
      mdInput.focus();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    if (!sel || !sel.rangeCount) {
      if (canvas) canvas.focus();
      return;
    }

    const range = sel.getRangeAt(0);

    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;
    if ((targetType === 'quote' || targetType === 'blockquote') && hasSelection) {
      let startNode = range.startContainer;
      if (startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentNode;
      let startBlock = startNode;
      while (startBlock && startBlock.parentNode !== canvas && startBlock !== canvas && startBlock !== document.body) {
        startBlock = startBlock.parentNode;
      }

      let endNode = range.endContainer;
      if (endNode.nodeType === Node.TEXT_NODE) endNode = endNode.parentNode;
      let endBlock = endNode;
      while (endBlock && endBlock.parentNode !== canvas && endBlock !== canvas && endBlock !== document.body) {
        endBlock = endBlock.parentNode;
      }

      // If selection is already inside a blockquote, toggle OFF (unquote back to <p>)
      if (startBlock && startBlock.tagName === 'BLOCKQUOTE') {
        const childPs = Array.from(startBlock.querySelectorAll('p'));
        const frag = document.createDocumentFragment();
        let firstP = null;
        if (childPs.length > 0) {
          childPs.forEach(p => {
            const newP = document.createElement('p');
            let html = p.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
            newP.innerHTML = html.trim() ? html : '<br>';
            frag.appendChild(newP);
            if (!firstP) firstP = newP;
          });
        } else {
          const newP = document.createElement('p');
          let html = startBlock.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
          newP.innerHTML = html.trim() ? html : '<br>';
          frag.appendChild(newP);
          firstP = newP;
        }
        startBlock.parentNode.replaceChild(frag, startBlock);
        if (firstP) focusNodeCaret(firstP, true);
        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvas, firstP);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        if (typeof window.recordAction === 'function') window.recordAction('unformat-quote', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }

      if (startBlock && startBlock.parentNode === canvas && endBlock && endBlock.parentNode === canvas) {
        const preRange = document.createRange();
        preRange.setStart(startBlock, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preFragment = preRange.cloneContents();
        const preHasText = (preFragment.textContent && preFragment.textContent.trim().length > 0) ||
                           (preFragment.querySelector && preFragment.querySelector('img, a, code, strong, em'));

        const postRange = document.createRange();
        postRange.setStart(range.endContainer, range.endOffset);
        postRange.setEnd(endBlock, endBlock.childNodes.length);
        const postFragment = postRange.cloneContents();
        const postHasText = (postFragment.textContent && postFragment.textContent.trim().length > 0) ||
                            (postFragment.querySelector && postFragment.querySelector('img, a, code, strong, em'));

        const quoteFragment = range.cloneContents();

        const newQuote = document.createElement('blockquote');
        newQuote.setAttribute('data-block-type', 'quote');

        const hasBlockChildren = Array.from(quoteFragment.childNodes).some(n =>
          n.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE'].includes(n.tagName)
        );

        if (hasBlockChildren) {
          Array.from(quoteFragment.childNodes).forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV'].includes(child.tagName)) {
              const p = document.createElement('p');
              p.innerHTML = child.innerHTML;
              newQuote.appendChild(p);
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
              const p = document.createElement('p');
              p.textContent = child.textContent;
              newQuote.appendChild(p);
            } else {
              newQuote.appendChild(child);
            }
          });
        } else {
          const quoteP = document.createElement('p');
          if (quoteFragment.childNodes.length > 0) {
            quoteP.appendChild(quoteFragment);
          } else {
            quoteP.innerHTML = 'Quote text here...';
          }
          newQuote.appendChild(quoteP);
        }

        const insertAnchor = startBlock;

        if (preHasText) {
          const preP = document.createElement('p');
          preP.appendChild(preFragment);
          canvas.insertBefore(preP, insertAnchor);
        }

        canvas.insertBefore(newQuote, insertAnchor);

        if (postHasText) {
          const postP = document.createElement('p');
          postP.appendChild(postFragment);
          canvas.insertBefore(postP, insertAnchor);
        }

        let cur = startBlock;
        while (cur) {
          const next = cur.nextElementSibling;
          const isEnd = (cur === endBlock);
          cur.remove();
          if (isEnd) break;
          cur = next;
        }

        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvas);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        if (typeof focusNodeCaret === 'function') {
          focusNodeCaret(newQuote, false);
        }
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        if (typeof window.recordAction === 'function') window.recordAction('format-quote', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }
    }

    let node = range.commonAncestorContainer;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    if (isTitleContainer(node) || isSubtitleContainer(node)) {
      if (typeof window.showToast === 'function') window.showToast('Title and Subtitle are fixed header elements.', 'info');
      return;
    }

    // Find the enclosing top-level block inside canvas
    let block = node;
    while (block && block.parentNode !== canvas && block !== canvas && block !== document.body) {
      block = block.parentNode;
    }

    if (!block || block.parentNode !== canvas) {
      block = document.createElement('p');
      block.innerHTML = '<br>';
      if (canvas) canvas.appendChild(block);
    }

    // If current block is already a BLOCKQUOTE:
    // Toggling quote or changing to text/p will unquote back to standard paragraph(s)
    if (block.tagName === 'BLOCKQUOTE') {
      if (targetType === 'quote' || targetType === 'blockquote' || targetType === 'text' || targetType === 'p') {
        const childPs = Array.from(block.querySelectorAll('p'));
        const frag = document.createDocumentFragment();
        let firstP = null;
        if (childPs.length > 0) {
          childPs.forEach(p => {
            const newP = document.createElement('p');
            let html = p.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
            newP.innerHTML = html.trim() ? html : '<br>';
            frag.appendChild(newP);
            if (!firstP) firstP = newP;
          });
        } else {
          const newP = document.createElement('p');
          let html = block.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
          newP.innerHTML = html.trim() ? html : '<br>';
          frag.appendChild(newP);
          firstP = newP;
        }
        block.parentNode.replaceChild(frag, block);
        if (firstP) focusNodeCaret(firstP, true);
        if (typeof window.cleanConsecutiveEmptyParagraphs === 'function') window.cleanConsecutiveEmptyParagraphs(canvas, firstP);
        if (typeof window.ensureTrailingTextBlock === 'function') window.ensureTrailingTextBlock();
        updateToolbarActiveStates();
        if (typeof window.recordAction === 'function') window.recordAction('unformat-quote', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }
    }

    // Extract text content cleanly
    let rawText = '';
    if (block.tagName === 'PRE') {
      const code = block.querySelector('code');
      rawText = code ? code.textContent : block.textContent;
    } else if (block.classList.contains('captioned-image-container') || block.classList.contains('custom-gallery-grid') || block.classList.contains('post-nav-grid') || block.tagName === 'HR') {
      const newBlock = document.createElement('p');
      newBlock.innerHTML = '<br>';
      block.parentNode.insertBefore(newBlock, block.nextSibling);
      block = newBlock;
      rawText = '';
    } else {
      rawText = (block.innerText || block.textContent || '').trim();
    }

    let newEl;
    switch (targetType) {
      case 'text':
      case 'p':
        newEl = document.createElement('p');
        newEl.innerHTML = rawText ? (window.escapeHtml ? window.escapeHtml(rawText) : rawText) : '<br>';
        break;

      case 'callout-note':
        newEl = document.createElement('blockquote');
        const noteContent = rawText || 'Add your informative note or tip here.';
        newEl.innerHTML = `<p><strong>[!NOTE]</strong><br/>${window.escapeHtml ? window.escapeHtml(noteContent) : noteContent}</p>`;
        break;

      case 'callout-warning':
        newEl = document.createElement('blockquote');
        const warnContent = rawText || 'Caution: Make sure to check your configuration before continuing.';
        newEl.innerHTML = `<p><strong>[!WARNING]</strong><br/>${window.escapeHtml ? window.escapeHtml(warnContent) : warnContent}</p>`;
        break;

      case 'quote':
      case 'blockquote':
        newEl = document.createElement('blockquote');
        newEl.setAttribute('data-block-type', 'quote');
        const quoteP = document.createElement('p');
        const htmlContent = block.innerHTML.trim();
        if (htmlContent && htmlContent !== '<br>') {
          quoteP.innerHTML = block.innerHTML;
        } else {
          quoteP.innerHTML = '<br>';
        }
        newEl.appendChild(quoteP);
        break;

      case 'h2':
        newEl = document.createElement('h2');
        newEl.innerHTML = rawText ? (window.escapeHtml ? window.escapeHtml(rawText) : rawText) : 'Heading 2';
        break;

      case 'h3':
        newEl = document.createElement('h3');
        newEl.innerHTML = rawText ? (window.escapeHtml ? window.escapeHtml(rawText) : rawText) : 'Heading 3';
        break;

      case 'h4':
        newEl = document.createElement('h4');
        newEl.innerHTML = rawText ? (window.escapeHtml ? window.escapeHtml(rawText) : rawText) : 'Heading 4';
        break;

      case 'codeblock':
      case 'code':
        newEl = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = rawText || '// Code here';
        newEl.appendChild(codeEl);
        break;

      case 'hr':
        newEl = document.createElement('hr');
        newEl.style.cssText = 'border:0; border-top: 1px solid rgba(255,255,255,0.1); margin: 2.5rem 0;';
        const nextP = document.createElement('p');
        nextP.innerHTML = '<br>';
        block.parentNode.replaceChild(newEl, block);
        newEl.parentNode.insertBefore(nextP, newEl.nextSibling);
        focusNodeCaret(nextP);
        updateToolbarActiveStates();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
    }

    if (newEl) {
      block.parentNode.replaceChild(newEl, block);
      focusNodeCaret(newEl);
      updateToolbarActiveStates();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    }
  }

  function formatBlockStyle(targetTag) {
    swapCurrentBlock(targetTag);
  }

  function buildBlockTypeMenuItemsHtml(currentBlock = 'p') {
    const isText = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'codeblock'].includes(currentBlock);
    const isImg = (currentBlock === 'images');
    const isMedia = (currentBlock === 'media');
    const isQuote = (currentBlock === 'quote');
    const isDivider = (currentBlock === 'divider');

    return `
      <button type="button" tabindex="-1" unselectable="on" class="toolbar-menu-item${isText ? ' active' : ''}" data-action="swap-block-text">Text</button>
      <button type="button" tabindex="-1" unselectable="on" class="toolbar-menu-item${isImg ? ' active' : ''}" data-action="swap-block-images">Images</button>
      <button type="button" tabindex="-1" unselectable="on" class="toolbar-menu-item${isMedia ? ' active' : ''}" data-action="swap-block-media">Embedded Media</button>
      <button type="button" tabindex="-1" unselectable="on" class="toolbar-menu-item${isQuote ? ' active' : ''}" data-action="swap-block-quote">Quote</button>
      <button type="button" tabindex="-1" unselectable="on" class="toolbar-menu-item${isDivider ? ' active' : ''}" data-action="swap-block-divider">Divider Line</button>
    `;
  }

  function updateToolbarActiveStates() {
    const canvas = document.getElementById('rich-canvas-prose');
    const selectedNonText = canvas ? canvas.querySelector('.selected, .captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected, hr.selected, .canvas-divider.selected, blockquote.selected') : null;

    const sel = window.getSelection();
    let node = null;
    if (sel && sel.rangeCount > 0) {
      node = sel.getRangeAt(0).commonAncestorContainer;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    }

    if (!selectedNonText && !node) {
      clearToolbarActiveStates();
      return;
    }

    const styleLabel = document.getElementById('tb-current-style-label');
    const styleBtn = document.getElementById('tb-btn-style-dropdown');
    const blockTypeLabel = document.getElementById('tb-current-block-type-label');
    const blockTypeBtn = document.getElementById('tb-btn-more-dropdown');

    // 1. If cursor is in Title: Title is guaranteed (H1 Bold)
    if (node && isTitleContainer(node)) {
      clearToolbarActiveStates();
      if (styleLabel) styleLabel.textContent = 'Title';
      if (blockTypeLabel) blockTypeLabel.textContent = 'Type';
      if (styleBtn) {
        styleBtn.classList.remove('active');
        styleBtn.classList.add('locked');
        styleBtn.title = 'Article Title is guaranteed (H1 Bold)';
      }
      return;
    }

    // 2. If cursor is in Subtitle: Subtitle is guaranteed
    if (node && isSubtitleContainer(node)) {
      clearToolbarActiveStates();
      if (styleLabel) styleLabel.textContent = 'Subtitle';
      if (blockTypeLabel) blockTypeLabel.textContent = 'Type';
      if (styleBtn) {
        styleBtn.classList.remove('active');
        styleBtn.classList.add('locked');
        styleBtn.title = 'Article Subtitle is guaranteed';
      }
      return;
    }

    if (!selectedNonText && node && !isProseContainer(node)) {
      clearToolbarActiveStates();
      return;
    }

    // Native queryCommandState for inline styles & lists
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    let isStrike = false;
    let isUl = false;
    let isOl = false;

    try { isBold = document.queryCommandState('bold'); } catch (e) {}
    try { isItalic = document.queryCommandState('italic'); } catch (e) {}
    try { isUnderline = document.queryCommandState('underline'); } catch (e) {}
    try { isStrike = document.queryCommandState('strikeThrough'); } catch (e) {}
    try { isUl = document.queryCommandState('insertUnorderedList'); } catch (e) {}
    try { isOl = document.queryCommandState('insertOrderedList'); } catch (e) {}

    // Walk ancestry for code, highlight, links, blockquote, headings, and custom font color inside prose
    let isCode = false;
    let isHighlight = false;
    let isLink = false;
    let isQuote = false;
    let activeCustomColor = 'default';
    let currentBlock = 'p';

    if (selectedNonText) {
      if (selectedNonText.tagName === 'HR' || selectedNonText.classList.contains('canvas-divider')) {
        currentBlock = 'divider';
      } else if (selectedNonText.classList.contains('captioned-image-container') || selectedNonText.classList.contains('custom-gallery-grid')) {
        currentBlock = 'images';
      } else if (selectedNonText.classList.contains('video-wrapper') || selectedNonText.dataset.blockType === 'media') {
        currentBlock = 'media';
      } else if (selectedNonText.classList.contains('article-share-block') || selectedNonText.dataset.blockType === 'share') {
        currentBlock = 'share';
      } else if (selectedNonText.classList.contains('article-rss-block') || selectedNonText.dataset.blockType === 'rss') {
        currentBlock = 'rss';
      } else if (selectedNonText.classList.contains('page-recent-posts-block') || selectedNonText.dataset.blockType === 'recent-posts') {
        currentBlock = 'recent-posts';
      } else if (selectedNonText.classList.contains('page-individual-post-block') || selectedNonText.dataset.blockType === 'individual-post') {
        currentBlock = 'individual-post';
      } else if (selectedNonText.tagName === 'BLOCKQUOTE' || selectedNonText.dataset.blockType === 'quote') {
        currentBlock = 'quote';
        isQuote = true;
      }
    } else {
      let curr = node;
      while (curr && curr !== canvas && curr !== document.body) {
        const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
        if (tag === 'hr' || (curr.classList && curr.classList.contains('canvas-divider'))) {
          currentBlock = 'divider';
        }
        if (tag === 'code') isCode = true;
        if (tag === 'mark') isHighlight = true;
        if (tag === 'u') isUnderline = true;
        if (tag === 'a') isLink = true;
        if (activeCustomColor === 'default' && curr.classList && curr.classList.contains('cedar-custom-color')) {
          const customHex = (curr.getAttribute('data-custom-color') || '').trim().toLowerCase();
          if (customHex) activeCustomColor = customHex;
        }
        if (tag === 'blockquote') {
          isQuote = true;
          currentBlock = 'quote';
        }
        if (tag === 'strong' || tag === 'b') isBold = true;
        if (tag === 'em' || tag === 'i') isItalic = true;
        if (tag === 'del' || tag === 's' || tag === 'strike') isStrike = true;
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre'].includes(tag)) {
          if (tag === 'pre') currentBlock = 'codeblock';
          else currentBlock = tag;
        }
        if (curr.classList && (curr.classList.contains('captioned-image-container') || curr.classList.contains('custom-gallery-grid'))) {
          currentBlock = 'images';
        }
        if (curr.classList && (curr.classList.contains('video-wrapper') || curr.dataset.blockType === 'media')) {
          currentBlock = 'media';
        }
        if (curr.classList && (curr.classList.contains('article-share-block') || curr.dataset.blockType === 'share')) {
          currentBlock = 'share';
        }
        if (curr.classList && (curr.classList.contains('article-rss-block') || curr.dataset.blockType === 'rss')) {
          currentBlock = 'rss';
        }
        if (curr.classList && (curr.classList.contains('page-recent-posts-block') || curr.dataset.blockType === 'recent-posts')) {
          currentBlock = 'recent-posts';
        }
        if (curr.classList && (curr.classList.contains('page-individual-post-block') || curr.dataset.blockType === 'individual-post')) {
          currentBlock = 'individual-post';
        }
        curr = curr.parentNode;
      }
    }

    // Toggle button active classes
    setBtnActive('bold', isBold);
    setBtnActive('italic', isItalic);
    setBtnActive('underline', isUnderline);
    setBtnActive('strikethrough', isStrike);
    setBtnActive('highlight', isHighlight);
    setBtnActive('code', isCode);
    setBtnActive('link', isLink);
    setBtnActive('quote', isQuote);
    setBtnActive('ul', isUl);
    setBtnActive('ol', isOl);

    // Update Font Color indicator & menu swatches
    const fontColorIndicator = document.getElementById('tb-font-color-indicator');
    const fontColorBtn = document.getElementById('tb-btn-font-color');
    const fontColorMenu = document.getElementById('tb-font-color-menu');
    if (fontColorIndicator) {
      fontColorIndicator.style.background = activeCustomColor === 'default' ? 'var(--text-primary)' : activeCustomColor;
    }
    if (fontColorBtn) {
      fontColorBtn.classList.toggle('active', activeCustomColor !== 'default');
    }
    if (fontColorMenu) {
      fontColorMenu.querySelectorAll('[data-action="font-color"]').forEach(btn => {
        const btnColor = (btn.dataset.color || 'default').toLowerCase();
        btn.classList.toggle('active', btnColor === activeCustomColor);
      });
    }

    // Check block alignment
    let currentAlign = 'left';
    try {
      if (document.queryCommandState('justifyCenter')) currentAlign = 'center';
      else if (document.queryCommandState('justifyRight')) currentAlign = 'right';
      else if (document.queryCommandState('justifyLeft')) currentAlign = 'left';
    } catch (e) {}

    const targetAlignEl = selectedNonText || node;
    if (targetAlignEl) {
      let block = targetAlignEl;
      while (block && block !== canvas && block !== document.body) {
        const alignAttr = block.getAttribute ? block.getAttribute('align') : '';
        const textAlign = block.style ? block.style.textAlign : '';
        if (textAlign === 'center' || alignAttr === 'center' || (block.classList && block.classList.contains('align-center'))) {
          currentAlign = 'center';
          break;
        } else if (textAlign === 'right' || alignAttr === 'right' || (block.classList && block.classList.contains('align-right'))) {
          currentAlign = 'right';
          break;
        } else if (textAlign === 'left' || alignAttr === 'left' || (block.classList && block.classList.contains('align-left'))) {
          currentAlign = 'left';
          break;
        }
        block = block.parentNode;
      }
    }

    setBtnActive('align-left', currentAlign === 'left');
    setBtnActive('align-center', currentAlign === 'center');
    setBtnActive('align-right', currentAlign === 'right');

    // Check block indent
    let currentIndent = 0;
    if (targetAlignEl) {
      let block = targetAlignEl;
      while (block && block !== canvas && block !== document.body) {
        if (block.getAttribute) {
          const ind = parseInt(block.getAttribute('data-indent') || '0', 10);
          if (ind > 0) {
            currentIndent = ind;
            break;
          }
        }
        block = block.parentNode;
      }
    }
    setBtnActive('indent', currentIndent > 0);

    // Map to the Block Types: Text, Images, Embedded Media, Quote, Share Button, Subscribe, Individual Post, Recent Posts, Divider Line
    const isNonTextBlock = ['images', 'media', 'quote', 'share', 'rss', 'recent-posts', 'individual-post', 'divider'].includes(currentBlock);
    let blockTypeTitle = 'Text';
    if (currentBlock === 'images') blockTypeTitle = 'Images';
    else if (currentBlock === 'media') blockTypeTitle = 'Embedded Media';
    else if (currentBlock === 'quote') blockTypeTitle = 'Quote';
    else if (currentBlock === 'share') blockTypeTitle = 'Share Button';
    else if (currentBlock === 'rss') blockTypeTitle = 'Subscribe';
    else if (currentBlock === 'recent-posts') blockTypeTitle = 'Recent Posts';
    else if (currentBlock === 'individual-post') blockTypeTitle = 'URL';
    else if (currentBlock === 'divider') blockTypeTitle = 'Divider Line';

    // Update Style Dropdown label & lock state
    if (styleLabel) {
      const nameMap = {
        'h2': 'Heading 2',
        'h3': 'Heading 3',
        'h4': 'Heading 4',
        'quote': 'Blockquote',
        'codeblock': 'Code Block',
        'p': 'Style'
      };
      if (['images', 'media', 'share', 'rss', 'recent-posts', 'individual-post', 'divider'].includes(currentBlock)) {
        styleLabel.textContent = 'Style';
      } else {
        styleLabel.textContent = nameMap[currentBlock] || 'Style';
      }
    }
    if (styleBtn) {
      if (['images', 'media', 'share', 'rss', 'recent-posts', 'individual-post', 'divider'].includes(currentBlock)) {
        styleBtn.classList.add('locked');
        styleBtn.title = 'Style options only apply to text blocks';
        styleBtn.classList.remove('active');
      } else {
        styleBtn.classList.remove('locked');
        styleBtn.title = 'Text Style';
        if (currentBlock !== 'p') {
          styleBtn.classList.add('active');
        } else {
          styleBtn.classList.remove('active');
        }
      }
    }

    // Update Type Dropdown label: keep static as 'Type'
    if (blockTypeLabel) {
      blockTypeLabel.textContent = 'Type';
    }
    if (blockTypeBtn) {
      const isCustomBlock = ['images', 'media', 'quote', 'divider'].includes(currentBlock);
      blockTypeBtn.classList.toggle('active', isCustomBlock);
    }

    // Update Insert Dropdown label: keep static as 'Insert'
    const pageBlockLabel = document.getElementById('tb-current-page-block-label');
    const pageBlockBtn = document.getElementById('tb-btn-page-blocks-dropdown');
    if (pageBlockLabel) {
      pageBlockLabel.textContent = 'Insert';
    }
    if (pageBlockBtn) {
      const isInsertBlock = ['share', 'rss', 'individual-post', 'divider'].includes(currentBlock);
      pageBlockBtn.classList.toggle('active', isInsertBlock);
    }
    const pageBlocksMenu = document.getElementById('tb-page-blocks-menu');
    if (pageBlocksMenu) {
      const btnDiv = pageBlocksMenu.querySelector('[data-action="swap-block-divider"]');
      const btnShare = pageBlocksMenu.querySelector('[data-action="swap-block-share"]');
      const btnRss = pageBlocksMenu.querySelector('[data-action="swap-block-rss"]');
      const btnInd = pageBlocksMenu.querySelector('[data-action="swap-block-individual-post"]');
      const btnRec = pageBlocksMenu.querySelector('[data-action="swap-block-recent-posts"]');
      if (btnDiv) btnDiv.classList.toggle('active', currentBlock === 'divider');
      if (btnShare) btnShare.classList.toggle('active', currentBlock === 'share');
      if (btnRss) btnRss.classList.toggle('active', currentBlock === 'rss');
      if (btnInd) {
        btnInd.classList.toggle('active', currentBlock === 'individual-post');
        if (btnInd.textContent !== 'URL') btnInd.textContent = 'URL';
      }
      if (btnRec) btnRec.remove();
    }

    // Update Type Dropdown Menu (#tb-more-menu) active classes without rebuilding DOM
    const moreMenu = document.getElementById('tb-more-menu');
    if (moreMenu) {
      if (moreMenu.children.length === 0) {
        moreMenu.innerHTML = buildBlockTypeMenuItemsHtml(currentBlock);
      } else {
        const isText = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'codeblock'].includes(currentBlock);
        const isImg = (currentBlock === 'images');
        const isMedia = (currentBlock === 'media');
        const isQuote = (currentBlock === 'quote');
        const isDivider = (currentBlock === 'divider');

        const btnText = moreMenu.querySelector('[data-action="swap-block-text"]');
        const btnImg = moreMenu.querySelector('[data-action="swap-block-images"]');
        const btnMedia = moreMenu.querySelector('[data-action="swap-block-media"]');
        const btnQuote = moreMenu.querySelector('[data-action="swap-block-quote"]');
        const btnDiv = moreMenu.querySelector('[data-action="swap-block-divider"]');

        if (btnText) btnText.classList.toggle('active', isText);
        if (btnImg) btnImg.classList.toggle('active', isImg);
        if (btnMedia) btnMedia.classList.toggle('active', isMedia);
        if (btnQuote) btnQuote.classList.toggle('active', isQuote);
        if (btnDiv) btnDiv.classList.toggle('active', isDivider);
      }
    }
  }

  function setBtnActive(action, isActive) {
    const btn = document.querySelector(`.editor-formatting-toolbar [data-action="${action}"]`);
    if (btn) {
      if (isActive) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  function clearToolbarActiveStates() {
    document.querySelectorAll('.editor-formatting-toolbar .toolbar-btn.active, .editor-formatting-toolbar .toolbar-dropdown-btn.active').forEach(btn => {
      btn.classList.remove('active');
    });
    setBtnActive('align-left', false);
    setBtnActive('align-center', false);
    setBtnActive('align-right', false);
    setBtnActive('indent', false);
    setBtnActive('underline', false);
    setBtnActive('highlight', false);
    const styleLabel = document.getElementById('tb-current-style-label');
    const styleBtn = document.getElementById('tb-btn-style-dropdown');
    if (styleLabel) styleLabel.textContent = 'Style';
    if (styleBtn) {
      styleBtn.classList.remove('locked');
      styleBtn.title = 'Text Style';
    }
    const blockTypeLabel = document.getElementById('tb-current-block-type-label');
    if (blockTypeLabel) blockTypeLabel.textContent = 'Type';
    const blockTypeBtn = document.getElementById('tb-btn-more-dropdown');
    if (blockTypeBtn) blockTypeBtn.classList.remove('active');
    const moreMenu = document.getElementById('tb-more-menu');
    if (moreMenu) {
      if (moreMenu.children.length === 0) {
        moreMenu.innerHTML = buildBlockTypeMenuItemsHtml('p');
      } else {
        moreMenu.querySelectorAll('.toolbar-menu-item').forEach(b => {
          b.classList.toggle('active', b.dataset.action === 'swap-block-text');
        });
      }
    }
    const pageBlockLabel = document.getElementById('tb-current-page-block-label');
    if (pageBlockLabel) pageBlockLabel.textContent = 'Insert';
    const pageBlockBtn = document.getElementById('tb-btn-page-blocks-dropdown');
    if (pageBlockBtn) pageBlockBtn.classList.remove('active');
    const pageBlocksMenu = document.getElementById('tb-page-blocks-menu');
    if (pageBlocksMenu) {
      pageBlocksMenu.querySelectorAll('.toolbar-menu-item').forEach(b => b.classList.remove('active'));
    }
    const fontColorIndicator = document.getElementById('tb-font-color-indicator');
    if (fontColorIndicator) fontColorIndicator.style.background = 'var(--text-primary)';
    const fontColorMenu = document.getElementById('tb-font-color-menu');
    if (fontColorMenu) {
      fontColorMenu.querySelectorAll('[data-action="font-color"]').forEach(b => {
        b.classList.toggle('active', b.dataset.color === 'default');
      });
    }
  }

  function setupFormattingToolbar() {
    const canvasProse = document.getElementById('rich-canvas-prose');
    const toolbar = document.getElementById('editor-formatting-toolbar');

    // Continuous selection saving
    document.addEventListener('selectionchange', saveCurrentSelection);
    document.addEventListener('keyup', saveCurrentSelection);
    document.addEventListener('mouseup', saveCurrentSelection);
    document.addEventListener('input', saveCurrentSelection);
    if (typeof window.setupHistoryListeners === 'function') window.setupHistoryListeners();

    if (toolbar) {
      // Prevent mousedown on toolbar from ever stealing focus
      toolbar.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
          e.preventDefault();
        }
      });

      // Central Toolbar Click Dispatcher
      toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        e.preventDefault();

        // Dropdown menu toggle
        if (btn.classList.contains('toolbar-dropdown-btn')) {
          if (btn.classList.contains('locked')) {
            return;
          }
          const wrap = btn.closest('.toolbar-dropdown-wrap');
          const menu = wrap ? wrap.querySelector('.toolbar-dropdown-menu') : null;
          if (menu) {
            const isOpen = menu.classList.contains('show');
            document.querySelectorAll('.toolbar-dropdown-menu').forEach(m => m.classList.remove('show'));
            document.querySelectorAll('.toolbar-dropdown-btn').forEach(b => b.classList.remove('open'));
            if (!isOpen) {
              menu.classList.add('show');
              btn.classList.add('open');
            }
          }
          return;
        }

        // Close all dropdowns
        document.querySelectorAll('.toolbar-dropdown-menu').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.toolbar-dropdown-btn').forEach(b => b.classList.remove('open'));

        const action = btn.dataset.action;
        if (action) {
          executeToolbarAction(action, btn.dataset.color || null);
          return;
        }

        if (btn.id === 'tb-btn-undo') {
          if (typeof window.undo === 'function') window.undo();
        } else if (btn.id === 'tb-btn-redo') {
          if (typeof window.redo === 'function') window.redo();
        } else if (btn.id === 'tb-btn-insert-image') {
          if (typeof window.openModal === 'function') window.openModal('modal-insert-image');
          if (typeof window.renderEditorMediaPopup === 'function') window.renderEditorMediaPopup();
        } else if (btn.id === 'tb-btn-insert-youtube') {
          const ytInput = document.getElementById('yt-dialog-url');
          if (ytInput) ytInput.value = '';
          if (typeof window.openModal === 'function') window.openModal('modal-insert-youtube');
        }
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.toolbar-dropdown-wrap')) {
        document.querySelectorAll('.toolbar-dropdown-menu').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.toolbar-dropdown-btn').forEach(b => b.classList.remove('open'));
      }
    });

    // Link Modal Confirm Button
    const btnConfirmLink = document.getElementById('btn-confirm-insert-link');
    if (btnConfirmLink) {
      btnConfirmLink.addEventListener('click', () => {
        const url = (document.getElementById('link-dialog-url').value || '').trim();
        const customText = (document.getElementById('link-dialog-text').value || '').trim();

        if (!url) {
          alert('Please enter a destination URL.');
          return;
        }

        const activeMode = window.activeMode || 'canvas';
        if (activeMode === 'markdown') {
          const displayText = customText || url;
          insertMarkdownAtCursor(`[${displayText}](${url})`);
          if (typeof window.closeModal === 'function') window.closeModal('modal-insert-link');
          if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          return;
        }

        restoreEditorSelection();
        if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
        const sel = window.getSelection();
        const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed;

        if (hasSelection && !customText) {
          document.execCommand('createLink', false, url);
        } else {
          const displayText = customText || url;
          const a = document.createElement('a');
          a.href = url;
          a.textContent = displayText;

          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(a);
            const newRange = document.createRange();
            newRange.selectNode(a);
            sel.removeAllRanges();
            sel.addRange(newRange);
          } else {
            const canvas = document.getElementById('rich-canvas-prose');
            if (canvas) canvas.appendChild(a);
          }
        }

        if (typeof window.recordAction === 'function') window.recordAction('link-insert', true);
        if (typeof window.closeModal === 'function') window.closeModal('modal-insert-link');
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.showToast === 'function') window.showToast('Link inserted!');
      });
    }

    // Keyboard Shortcuts Interceptor
    window.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = (e.key || '').toLowerCase();

      // Quote Block: Ctrl+Q / Cmd+Q
      if (isCtrlOrCmd && (key === 'q' || e.code === 'KeyQ') && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const active = document.activeElement;
        const title = document.getElementById('rich-canvas-title');
        const sub = document.getElementById('rich-canvas-subtitle');
        if (active === title || active === sub || (active && (title?.contains(active) || sub?.contains(active)))) {
          return;
        }
        if (typeof window.toggleQuoteBlock === 'function') {
          window.toggleQuoteBlock();
        } else if (typeof toggleQuoteBlock === 'function') {
          toggleQuoteBlock();
        } else if (typeof swapCurrentBlock === 'function') {
          swapCurrentBlock('quote');
        }
        return;
      }

      // Tab / Shift+Tab inside prose canvas -> Indent / Outdent block
      if (e.key === 'Tab' && !isCtrlOrCmd && !e.altKey) {
        const active = document.activeElement;
        const canvas = document.getElementById('rich-canvas-prose');
        if (canvas && (active === canvas || canvas.contains(active))) {
          if (e.target && e.target.closest && e.target.closest('.individual-post-url-input, figcaption, .gallery-caption, pre')) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          applyBlockIndent(e.shiftKey ? 'outdent' : 'indent');
          return;
        }
      }

      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey) {
        const active = document.activeElement;
        const title = document.getElementById('rich-canvas-title');
        const sub = document.getElementById('rich-canvas-subtitle');

        // Undo: Ctrl+Z (or Cmd+Z on Mac)
        if (key === 'z' && !e.shiftKey) {
          if (typeof window.isEditorFocusedOrActive === 'function' && window.isEditorFocusedOrActive()) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.undo === 'function') window.undo();
            return;
          }
        }

        // Redo: Ctrl+Y (Windows/Linux) OR Ctrl+Shift+Z (universal) OR Cmd+Shift+Z (Mac)
        if (key === 'y' || (key === 'z' && e.shiftKey)) {
          if (typeof window.isEditorFocusedOrActive === 'function' && window.isEditorFocusedOrActive()) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.redo === 'function') window.redo();
            return;
          }
        }

        if (active === title || active === sub) {
          if (['b', 'i', 'u', 's', 'k', 'e', 'h', 'x'].includes(key)) {
            e.preventDefault();
            return;
          }
        }

        // Bold: Ctrl+B
        if (key === 'b' && !e.shiftKey) {
          e.preventDefault();
          formatInline('bold');
          return;
        }

        // Italic: Ctrl+I
        if (key === 'i' && !e.shiftKey) {
          e.preventDefault();
          formatInline('italic');
          return;
        }

        // Underline: Ctrl+U
        if (key === 'u' && !e.shiftKey) {
          e.preventDefault();
          formatInline('underline');
          return;
        }

        // Strikethrough: Ctrl+Shift+X or Ctrl+Shift+S
        if (e.shiftKey && (key === 'x' || key === 's')) {
          e.preventDefault();
          formatInline('strikeThrough');
          return;
        }

        // Highlight: Ctrl+Shift+H
        if (e.shiftKey && key === 'h') {
          e.preventDefault();
          applyHighlight();
          return;
        }

        // Link: Ctrl+K
        if (key === 'k') {
          e.preventDefault();
          if (typeof window.openLinkModal === 'function') window.openLinkModal();
          return;
        }

        // Inline Code: Ctrl+E
        if (key === 'e' && !e.shiftKey) {
          e.preventDefault();
          applyInlineCode();
          return;
        }

        // Text Alignment: Ctrl+Shift+L, Ctrl+Shift+E, Ctrl+Shift+R
        if (e.shiftKey) {
          if (key === 'l') {
            e.preventDefault();
            executeToolbarAction('align-left');
            return;
          }
          if (key === 'e') {
            e.preventDefault();
            executeToolbarAction('align-center');
            return;
          }
          if (key === 'r') {
            e.preventDefault();
            executeToolbarAction('align-right');
            return;
          }
        }

        // Save / Export: Ctrl+S
        if (key === 's') {
          e.preventDefault();
          if (typeof window.handlePublishAction === 'function') window.handlePublishAction();
          return;
        }

        // Mode Switch: Ctrl+M
        if (key === 'm' && !e.shiftKey) {
          e.preventDefault();
          const activeMode = window.activeMode || 'canvas';
          if (typeof window.setEditorMode === 'function') {
            window.setEditorMode(activeMode === 'canvas' ? 'markdown' : 'canvas');
          }
          return;
        }
      }

      if (e.altKey) {
        const key = e.key;
        if (key === '2') { e.preventDefault(); formatBlockStyle('h2'); return; }
        if (key === '3') { e.preventDefault(); formatBlockStyle('h3'); return; }
        if (key === '4') { e.preventDefault(); formatBlockStyle('h4'); return; }
        if (key === '0') { e.preventDefault(); formatBlockStyle('p'); return; }
      }
    });
  }

  function toggleMarkdownQuote() {
    const mdInput = document.getElementById('markdown-input');
    if (!mdInput) return;
    mdInput.focus();

    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();

    const start = mdInput.selectionStart;
    const end = mdInput.selectionEnd;
    const val = mdInput.value;

    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = val.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = val.length;

    const selectedLinesText = val.substring(lineStart, lineEnd);
    const lines = selectedLinesText.split('\n');

    const nonEmptyLines = lines.filter(l => l.trim().length > 0);
    const allAreQuotes = nonEmptyLines.length > 0 && nonEmptyLines.every(l => /^>\s?/.test(l.trim()));

    let newLines;
    if (allAreQuotes) {
      newLines = lines.map(line => line.replace(/^(\s*)>\s?/, '$1'));
    } else {
      if (lines.length === 1 && lines[0].trim().length === 0) {
        newLines = ['> Quote text here...'];
      } else {
        newLines = lines.map(line => {
          const clean = line.replace(/^(#{1,6}\s*)/, '');
          return `> ${clean}`;
        });
      }
    }

    const replacement = newLines.join('\n');
    mdInput.value = val.substring(0, lineStart) + replacement + val.substring(lineEnd);
    mdInput.selectionStart = lineStart;
    mdInput.selectionEnd = lineStart + replacement.length;

    if (typeof window.autoResizeMarkdownTextarea === 'function') window.autoResizeMarkdownTextarea();
    if (typeof window.recordAction === 'function') window.recordAction('toggle-quote', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function toggleQuoteBlock() {
    const activeMode = window.activeMode || 'canvas';
    if (activeMode === 'markdown') {
      toggleMarkdownQuote();
      return;
    }
    if (typeof swapCurrentBlock === 'function') {
      swapCurrentBlock('quote');
    } else if (typeof window.swapCurrentBlock === 'function') {
      window.swapCurrentBlock('quote');
    }
  }

  function insertMarkdownAtCursor(before, after = '', placeholder = '') {
    const mdInput = document.getElementById('markdown-input');
    if (!mdInput) return;
    mdInput.focus();

    if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();

    const start = mdInput.selectionStart;
    const end = mdInput.selectionEnd;
    const val = mdInput.value;
    const selected = val.substring(start, end) || placeholder;

    const replacement = before + selected + after;
    mdInput.value = val.substring(0, start) + replacement + val.substring(end);

    mdInput.selectionStart = start + before.length;
    mdInput.selectionEnd = start + before.length + selected.length;

    if (typeof window.autoResizeMarkdownTextarea === 'function') window.autoResizeMarkdownTextarea();
    if (typeof window.recordAction === 'function') window.recordAction('insert-markdown', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  function executeToolbarAction(action, value = null) {
    const activeMode = window.activeMode || 'canvas';

    if (activeMode === 'markdown') {
      switch (action) {
        case 'bold':
          insertMarkdownAtCursor('**', '**', 'bold text');
          break;
        case 'italic':
          insertMarkdownAtCursor('*', '*', 'italic text');
          break;
        case 'underline':
          insertMarkdownAtCursor('<u>', '</u>', 'underlined text');
          break;
        case 'strikethrough':
          insertMarkdownAtCursor('~~', '~~', 'strikethrough text');
          break;
        case 'highlight':
          insertMarkdownAtCursor('<mark class="cedar-highlight">', '</mark>', 'highlighted text');
          break;
        case 'code':
          insertMarkdownAtCursor('`', '`', 'code');
          break;
        case 'font-color':
          applyFontColor(value || 'default');
          break;
        case 'indent':
          applyBlockIndent('toggle');
          break;
        case 'align-left': {
          const mdInput = document.getElementById('markdown-input');
          if (mdInput) {
            const start = mdInput.selectionStart;
            const end = mdInput.selectionEnd;
            const text = mdInput.value.substring(start, end);
            const stripped = text.replace(/<\/?(p|div|h[1-6])[^>]*align=["']?(center|right|left)["']?[^>]*>/gi, '').trim();
            insertMarkdownAtCursor(stripped, '', '');
          }
          break;
        }
        case 'align-center':
          insertMarkdownAtCursor('<p align="center">', '</p>', 'centered text');
          break;
        case 'align-right':
          insertMarkdownAtCursor('<p align="right">', '</p>', 'right-aligned text');
          break;
        case 'link':
          if (typeof window.openLinkModal === 'function') window.openLinkModal();
          break;
        case 'quote':
        case 'format-quote':
        case 'swap-block-quote':
          toggleQuoteBlock();
          break;
        case 'ul':
          insertMarkdownAtCursor('\n- ', '\n', 'list item');
          break;
        case 'ol':
          insertMarkdownAtCursor('\n1. ', '\n', 'list item');
          break;
        case 'swap-block-text':
        case 'format-p':
          swapCurrentBlock('text');
          break;
        case 'swap-block-images':
          swapCurrentBlock('images');
          break;
        case 'swap-block-media':
          swapCurrentBlock('media');
          break;
        case 'swap-block-share':
          swapCurrentBlock('share');
          break;
        case 'swap-block-rss':
          swapCurrentBlock('rss');
          break;
        case 'swap-block-recent-posts':
          swapCurrentBlock('recent-posts');
          break;
        case 'swap-block-individual-post':
          swapCurrentBlock('individual-post');
          break;
        case 'swap-block-divider':
          insertMarkdownAtCursor('\n\n---\n\n', '', '');
          break;
        case 'delete-current-block': {
          const mdInput = document.getElementById('markdown-input');
          if (mdInput) {
            const start = mdInput.selectionStart;
            const val = mdInput.value;
            const lineStart = val.lastIndexOf('\n', start - 1) + 1;
            let lineEnd = val.indexOf('\n', start);
            if (lineEnd === -1) lineEnd = val.length;
            else lineEnd += 1;
            mdInput.value = val.substring(0, lineStart) + val.substring(lineEnd);
            mdInput.setSelectionRange(lineStart, lineStart);
            mdInput.focus();
            if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
          }
          break;
        }
        case 'format-h2':
          swapCurrentBlock('h2');
          break;
        case 'format-h3':
          swapCurrentBlock('h3');
          break;
        case 'format-h4':
          swapCurrentBlock('h4');
          break;
        case 'format-codeblock':
          swapCurrentBlock('codeblock');
          break;
        case 'insert-hr':
          swapCurrentBlock('hr');
          break;
        case 'insert-callout-note':
          swapCurrentBlock('callout-note');
          break;
        case 'insert-callout-warning':
          swapCurrentBlock('callout-warning');
          break;
        case 'insert-cta-btn':
          const btnUrl = prompt('Enter button destination URL:', 'https://');
          if (btnUrl) {
            const btnText = prompt('Enter button label:', 'Click Here');
            const esc = window.escapeHtml || (s => s);
            if (typeof window.insertHtmlAtCursor === 'function') {
              window.insertHtmlAtCursor(`<div style="text-align:center; margin: 1.5rem 0;" contenteditable="false"><a href="${esc(btnUrl)}" class="btn btn-primary" style="display:inline-block; padding: 0.6rem 1.4rem; font-weight:700; text-decoration:none; border-radius: 8px;">${esc(btnText || 'Click Here')} &rarr;</a></div><p><br></p>`);
            }
          }
          break;
        case 'insert-secondary-btn':
          const secUrl = prompt('Enter button destination URL:', 'https://');
          if (secUrl) {
            const secText = prompt('Enter button label:', 'Read More');
            const esc = window.escapeHtml || (s => s);
            if (typeof window.insertHtmlAtCursor === 'function') {
              window.insertHtmlAtCursor(`<div style="text-align:center; margin: 1.5rem 0;" contenteditable="false"><a href="${esc(secUrl)}" class="btn btn-secondary" style="display:inline-block; padding: 0.6rem 1.4rem; font-weight:600; text-decoration:none; border-radius: 8px;">${esc(secText || 'Read More')}</a></div><p><br></p>`);
            }
          }
          break;
        case 'insert-link-box':
          insertMarkdownAtCursor('\n> *Check out our related articles:*\n> - [Related Article Title](#)\n\n');
          break;
        case 'open-gallery-modal':
          document.getElementById('gallery-dialog-urls').value = '';
          document.getElementById('gallery-dialog-caption').value = '';
          if (typeof window.openModal === 'function') window.openModal('modal-insert-gallery');
          break;
        case 'open-adjacent-posts-modal':
          if (document.getElementById('dialog-nav-prev-title')) document.getElementById('dialog-nav-prev-title').value = '';
          if (document.getElementById('dialog-nav-prev-slug')) document.getElementById('dialog-nav-prev-slug').value = '';
          if (document.getElementById('dialog-nav-next-title')) document.getElementById('dialog-nav-next-title').value = '';
          if (document.getElementById('dialog-nav-next-slug')) document.getElementById('dialog-nav-next-slug').value = '';
          if (typeof window.openModal === 'function') window.openModal('modal-insert-adjacent-posts');
          break;
      }
      return;
    }

    const sel = window.getSelection();
    let node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
    if (isTitleContainer(node) || isSubtitleContainer(node)) {
      // Title and Subtitle guarantee their fixed structure and bold typography.
      // Toolbar formatting actions are not applicable to Title or Subtitle.
      return;
    }

    switch (action) {
      case 'bold':
        formatInline('bold');
        break;
      case 'italic':
        formatInline('italic');
        break;
      case 'underline':
        formatInline('underline');
        break;
      case 'strikethrough':
        formatInline('strikeThrough');
        break;
      case 'highlight':
        applyHighlight();
        break;
      case 'code':
        applyInlineCode();
        break;
      case 'font-color':
        applyFontColor(value || 'default');
        break;
      case 'align-left':
        applyBlockAlignment('left');
        break;
      case 'align-center':
        applyBlockAlignment('center');
        break;
      case 'align-right':
        applyBlockAlignment('right');
        break;
      case 'indent':
        applyBlockIndent('toggle');
        break;
      case 'link':
        if (typeof window.openLinkModal === 'function') window.openLinkModal();
        break;
      case 'quote':
      case 'format-quote':
      case 'swap-block-quote':
        toggleQuoteBlock();
        break;
      case 'ul':
      case 'ol': {
        restoreEditorSelection();
        if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();

        const sel = window.getSelection();
        const listType = (action === 'ol' ? 'ol' : 'ul');
        const cProse = document.getElementById('rich-canvas-prose');

        let handledCustom = false;

        if (sel && sel.isCollapsed && sel.rangeCount && cProse) {
          const range = sel.getRangeAt(0);
          const insideList = (range.startContainer.closest ? range.startContainer.closest('li, ul, ol') : (range.startContainer.parentElement ? range.startContainer.parentElement.closest('li, ul, ol') : null));

          if (!insideList) {
            let block = range.startContainer;
            if (block.nodeType === Node.TEXT_NODE) block = block.parentNode;
            while (block && block.parentNode !== cProse && block !== cProse && block !== document.body) {
              block = block.parentNode;
            }

            if (block && block.parentNode === cProse && (block.tagName === 'P' || block.tagName === 'DIV' || block.tagName === 'BLOCKQUOTE')) {
              let textBefore = '';
              try {
                const preRange = document.createRange();
                preRange.setStart(block, 0);
                preRange.setEnd(range.startContainer, range.startOffset);
                textBefore = preRange.toString().replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '');
              } catch (err) {
                textBefore = (block.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '');
              }

              const rawBlockText = (block.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '');
              const hasMedia = Boolean(block.querySelector && block.querySelector('img, video, audio, iframe, hr'));

              if (rawBlockText.length === 0 && !hasMedia) {
                // Convert the empty block to the list
                const newList = document.createElement(listType);
                if (block.style && block.style.textAlign) newList.style.textAlign = block.style.textAlign;
                const newLi = document.createElement('li');
                newLi.innerHTML = '<br>';
                newList.appendChild(newLi);
                block.parentNode.replaceChild(newList, block);
                if (window.mergeAdjacentLists) window.mergeAdjacentLists(cProse);
                focusNodeCaret(newLi, true);
                handledCustom = true;
              } else if (textBefore.length > 0) {
                // Text before caret: start a new list immediately below this block
                let postFragment = null;
                try {
                  const postRange = document.createRange();
                  postRange.setStart(range.startContainer, range.startOffset);
                  postRange.setEnd(block, block.childNodes.length);
                  postFragment = postRange.extractContents();
                } catch (err) {
                  postFragment = document.createDocumentFragment();
                }

                // Strip trailing <br> and empty whitespace from block so it doesn't leave an empty blank line
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

                const newList = document.createElement(listType);
                if (block.style && block.style.textAlign) newList.style.textAlign = block.style.textAlign;
                const newLi = document.createElement('li');

                const hasPostText = postFragment && (postFragment.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '').length > 0;
                const hasPostElements = Boolean(postFragment && postFragment.querySelector && postFragment.querySelector('img, video, audio, iframe, svg, canvas, input, hr, a, strong, b, em, i, u, s, code'));

                if (hasPostText || hasPostElements) {
                  let walker = document.createTreeWalker(postFragment, NodeFilter.SHOW_TEXT, null, false);
                  let firstTextNode = walker.nextNode();
                  while (firstTextNode) {
                    if (firstTextNode.textContent) {
                      firstTextNode.textContent = firstTextNode.textContent.replace(/^[\u00A0\s]+/, '');
                      if (!firstTextNode.textContent && firstTextNode.parentNode) {
                        const p = firstTextNode.parentNode;
                        p.removeChild(firstTextNode);
                        walker = document.createTreeWalker(postFragment, NodeFilter.SHOW_TEXT, null, false);
                        firstTextNode = walker.nextNode();
                        continue;
                      }
                    }
                    break;
                  }
                  newLi.appendChild(postFragment);
                  if (!newLi.hasChildNodes() || (!newLi.textContent.trim() && !newLi.querySelector('br, img'))) {
                    newLi.innerHTML = '<br>';
                  }
                } else {
                  newLi.innerHTML = '<br>';
                }

                newList.appendChild(newLi);
                block.parentNode.insertBefore(newList, block.nextSibling);
                if (window.mergeAdjacentLists) window.mergeAdjacentLists(cProse);
                const targetLi = newLi.isConnected ? newLi : (newList.lastElementChild || newLi);
                focusNodeCaret(targetLi, true);
                handledCustom = true;
              }
            }
          }
        }

        if (!handledCustom) {
          if (listType === 'ol') {
            document.execCommand('insertOrderedList', false, null);
          } else {
            document.execCommand('insertUnorderedList', false, null);
          }
          if (window.mergeAdjacentLists && cProse) {
            window.mergeAdjacentLists(cProse);
          }
        }

        if (typeof window.recordAction === 'function') window.recordAction('format', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        break;
      }
      case 'swap-block-text':
      case 'format-p':
        swapCurrentBlock('text');
        break;
      case 'swap-block-images':
        swapCurrentBlock('images');
        break;
      case 'swap-block-media':
        swapCurrentBlock('media');
        break;
      case 'swap-block-share':
        swapCurrentBlock('share');
        break;
      case 'swap-block-rss':
        swapCurrentBlock('rss');
        break;
      case 'swap-block-recent-posts':
        swapCurrentBlock('recent-posts');
        break;
      case 'swap-block-individual-post':
        swapCurrentBlock('individual-post');
        break;
      case 'swap-block-divider':
        swapCurrentBlock('divider');
        break;
      case 'delete-current-block':
        if (typeof window.deleteCurrentBlock === 'function') window.deleteCurrentBlock();
        break;
      case 'format-h2':
        swapCurrentBlock('h2');
        break;
      case 'format-h3':
        swapCurrentBlock('h3');
        break;
      case 'format-h4':
        swapCurrentBlock('h4');
        break;
      case 'format-codeblock':
        swapCurrentBlock('codeblock');
        break;
      case 'insert-cta-btn': {
        const btnUrl = prompt('Enter button destination URL:', 'https://');
        if (btnUrl) {
          const btnText = prompt('Enter button label:', 'Click Here');
          const esc = window.escapeHtml || (s => s);
          if (typeof window.insertHtmlAtCursor === 'function') {
            window.insertHtmlAtCursor(`<div style="text-align:center; margin: 1.5rem 0;" contenteditable="false"><a href="${esc(btnUrl)}" class="btn btn-primary" style="display:inline-block; padding: 0.6rem 1.4rem; font-weight:700; text-decoration:none; border-radius: 8px;">${esc(btnText || 'Click Here')} &rarr;</a></div><p><br></p>`);
          }
        }
        break;
      }
      case 'insert-secondary-btn': {
        const secUrl = prompt('Enter button destination URL:', 'https://');
        if (secUrl) {
          const secText = prompt('Enter button label:', 'Read More');
          const esc = window.escapeHtml || (s => s);
          if (typeof window.insertHtmlAtCursor === 'function') {
            window.insertHtmlAtCursor(`<div style="text-align:center; margin: 1.5rem 0;" contenteditable="false"><a href="${esc(secUrl)}" class="btn btn-secondary" style="display:inline-block; padding: 0.6rem 1.4rem; font-weight:600; text-decoration:none; border-radius: 8px;">${esc(secText || 'Read More')}</a></div><p><br></p>`);
          }
        }
        break;
      }
      case 'insert-link-box':
        if (typeof window.insertHtmlAtCursor === 'function') {
          window.insertHtmlAtCursor('<blockquote><p><em>*Check out our related articles:*<br/>- <a href="#">Related Article Title</a></em></p></blockquote><p><br></p>');
        }
        break;
      case 'insert-hr':
        swapCurrentBlock('hr');
        break;
      case 'open-gallery-modal':
        document.getElementById('gallery-dialog-urls').value = '';
        document.getElementById('gallery-dialog-caption').value = '';
        if (typeof window.openModal === 'function') window.openModal('modal-insert-gallery');
        break;
      case 'insert-callout-note':
        swapCurrentBlock('callout-note');
        break;
      case 'insert-callout-warning':
        swapCurrentBlock('callout-warning');
        break;
      case 'open-adjacent-posts-modal':
        if (document.getElementById('dialog-nav-prev-title')) document.getElementById('dialog-nav-prev-title').value = '';
        if (document.getElementById('dialog-nav-prev-slug')) document.getElementById('dialog-nav-prev-slug').value = '';
        if (document.getElementById('dialog-nav-next-title')) document.getElementById('dialog-nav-next-title').value = '';
        if (document.getElementById('dialog-nav-next-slug')) document.getElementById('dialog-nav-next-slug').value = '';
        if (typeof window.openModal === 'function') window.openModal('modal-insert-adjacent-posts');
        break;
      default:
        const reg = (window.Cedar?.registry?.blocks || window.Outpost?.registry?.blocks)?.get(action);
        if (reg) {
          if (typeof reg.action === 'function') {
            reg.action();
          } else {
            swapCurrentBlock(action);
          }
        }
        break;
    }
  }

  // Exports
  window.isProseContainer = isProseContainer;
  window.isTitleContainer = isTitleContainer;
  window.isSubtitleContainer = isSubtitleContainer;
  window.isEditableContainer = isEditableContainer;
  window.saveCurrentSelection = saveCurrentSelection;
  window.restoreEditorSelection = restoreEditorSelection;
  window.formatInline = formatInline;
  window.applyInlineCode = applyInlineCode;
  window.applyHighlight = applyHighlight;
  window.applyFontColor = applyFontColor;
  window.applyBlockIndent = applyBlockIndent;
  window.normalizeCustomColorNodes = normalizeCustomColorNodes;
  window.formatBlockStyle = formatBlockStyle;
  window.focusNodeCaret = focusNodeCaret;
  window.resetActiveInlineFormatting = resetActiveInlineFormatting;
  window.maintainCaretScrollBuffer = maintainCaretScrollBuffer;
  window.swapCurrentBlock = swapCurrentBlock;
  window.toggleQuoteBlock = toggleQuoteBlock;
  window.splitBlockToNewParagraph = splitBlockToNewParagraph;
  window.updateToolbarActiveStates = updateToolbarActiveStates;
  window.setBtnActive = setBtnActive;
  window.clearToolbarActiveStates = clearToolbarActiveStates;
  window.setupFormattingToolbar = setupFormattingToolbar;
  window.insertMarkdownAtCursor = insertMarkdownAtCursor;
  window.executeToolbarAction = executeToolbarAction;
  window.applyBlockAlignment = applyBlockAlignment;
  window.setElementAlignment = setElementAlignment;

  const formattingExports = {
    isProseContainer,
    isTitleContainer,
    isSubtitleContainer,
    isEditableContainer,
    saveCurrentSelection,
    restoreEditorSelection,
    formatInline,
    applyInlineCode,
    applyHighlight,
    applyFontColor,
   