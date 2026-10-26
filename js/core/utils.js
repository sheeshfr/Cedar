/**
 * Cedar - Utility Functions & Packaging Engine
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  // --- Helper: Get Application Configured Timezone ---
  function getAppTimezone() {
    try {
      if (window.projectConfig && window.projectConfig.timezone) {
        return window.projectConfig.timezone;
      }
    } catch (e) {}
    try {
      const cfg = localStorage.getItem('cedar_config') || localStorage.getItem('outpost_config');
      if (cfg) {
        const parsed = JSON.parse(cfg);
        if (parsed && parsed.timezone) return parsed.timezone;
      }
    } catch (e) {}
    return 'America/Chicago';
  }

  // --- Helper: Get Local Date in YYYY-MM-DD Format (eliminates UTC midnight rollover) ---
  function getLocalIsoDate(dateObj = new Date()) {
    try {
      if (typeof dateObj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateObj.trim())) {
        return dateObj.trim();
      }
      const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
      if (isNaN(d.getTime())) return '';
      const tz = getAppTimezone();
      return d.toLocaleDateString('en-CA', { timeZone: tz });
    } catch (e) {
      try {
        const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch (err) {
        return '';
      }
    }
  }

  function formatDateDisplay(isoDateString) {
    if (!isoDateString) return 'Undated';
    try {
      if (typeof isoDateString !== 'string') {
        isoDateString = getLocalIsoDate(isoDateString);
      } else if (isoDateString.includes('T')) {
        isoDateString = getLocalIsoDate(new Date(isoDateString));
      }
      const trimmed = String(isoDateString).trim();
      const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        const day = parseInt(m[3], 10);
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[month]} ${String(day).padStart(2, '0')}, ${year}`;
      }
      return isoDateString;
    } catch (e) {
      return isoDateString;
    }
  }

  // --- Helper: Generate URL Slug ---
  // Uses up to 30 characters; if the last word is cut off at the limit, that word gets removed completely.
  function generateSlug(text, defaultSlug = '', maxChars = 30) {
    if (!text) return defaultSlug;
    const fullSlug = text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-_]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!fullSlug) return defaultSlug;
    if (!maxChars || maxChars <= 0 || fullSlug.length <= maxChars) {
      return fullSlug;
    }

    let sliced = fullSlug.slice(0, maxChars);
    if (sliced.endsWith('-')) {
      return sliced.replace(/-+$/, '') || defaultSlug;
    }

    if (fullSlug[maxChars] === '-') {
      return sliced.replace(/-+$/, '') || defaultSlug;
    }

    const fullWords = fullSlug.split('-');
    const slicedWords = sliced.split('-');
    const lastIdx = slicedWords.length - 1;
    const lastPart = slicedWords[lastIdx];
    const fullWord = fullWords[lastIdx] || '';

    // If the last word was cut off, remove that word completely (unless it is the only word)
    if (lastPart.length < fullWord.length && slicedWords.length > 1) {
      slicedWords.pop();
      sliced = slicedWords.join('-');
    }

    return sliced.replace(/^-+|-+$/g, '') || defaultSlug;
  }

  // --- Helper: Check if a post/page has ever been published (locking its URL slug) ---
  function hasDraftBeenPublished(draft) {
    if (!draft) return false;
    if (draft.type === 'page') {
      return Boolean(
        draft.everPublished ||
        draft.publishedAt ||
        draft.publishedSlug ||
        (typeof window.isBuiltInPage === 'function' && window.isBuiltInPage(draft))
      );
    }
    return Boolean(
      draft.status === 'published' ||
      draft.everPublished ||
      draft.publishedAt ||
      draft.publishedDate ||
      draft.publishedSlug
    );
  }

  // --- Helper: Should the URL slug auto-sync to the title? ---
  // Adjusts to the title up until the moment the post gets published (unless manually overridden).
  function shouldAutoSyncSlugFromTitle(draft) {
    if (!draft) return false;
    if (hasDraftBeenPublished(draft)) return false;
    if (draft.slugManuallyEdited) return false;
    return true;
  }

  // --- Helper: Strip Markdown Syntax & Raw URLs to Pure Prose Text ---
  function stripMarkdownToPlainText(md) {
    if (!md || typeof md !== 'string') return '';
    let text = md;
    // Strip custom block directives
    text = text.replace(/:::youtube[^\n]*:::/gi, ' ');
    text = text.replace(/:::gallery[\s\S]*?:::/gi, ' ');
    text = text.replace(/:::share:::/gi, ' ');
    text = text.replace(/:::caption\s+([^\n]*?):::/gi, '$1\n');
    // Images: ![alt](url "caption") -> extract caption or alt text if not placeholder, otherwise strip
    text = text.replace(/!\[([^\]]*)\]\([^)]*(?:\s+["']([^"']*)["'])?\)/g, function(match, alt, cap) {
      const chosen = (cap || alt || '').trim();
      if (!chosen || chosen === 'Image' || chosen === 'Attached Image' || chosen === 'Add caption here...' || chosen === 'Add image caption here...') {
        return '';
      }
      return ' ' + chosen + ' ';
    });
    // Links: [anchor text](url) -> keep ONLY anchor text! Strip the URL!
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    // Markdown headers (# Header) -> Header
    text = text.replace(/^#{1,6}\s+/gm, '');
    // Blockquotes (> Quote) -> Quote
    text = text.replace(/^>\s+/gm, '');
    // Horizontal rules (---, ***, ___)
    text = text.replace(/^[-*_]{3,}\s*$/gm, '\n');
    // Fenced code blocks: preserve code content, strip fences
    text = text.replace(/```[\s\S]*?```/g, function(match) {
      return match.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
    });
    // Inline code (`code`) -> code
    text = text.replace(/`([^`\n]+)`/g, '$1');
    // List markers: unordered (*, -, +, bullet) and ordered (1., 1)) - DO THIS BEFORE BOLD/ITALIC!
    text = text.replace(/^[\*\-\+\u2022]\s+/gm, '');
    text = text.replace(/^\d+[\.\)]\s+/gm, '');
    // Bold, italic, strikethrough formatting markers (single line only to prevent multiline greed)
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1');
    text = text.replace(/\*([^*\n]+)\*/g, '$1');
    text = text.replace(/(?:^|\s)__([^_\n]+)__(?=\s|$)/g, ' $1 ');
    text = text.replace(/(?:^|\s)_([^_\n]+)_(?=\s|$)/g, ' $1 ');
    text = text.replace(/~~([^~\n]+)~~/g, '$1');
    // HTML tags: <br> -> \n, closing block tags -> \n, other tags -> ' '
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n');
    text = text.replace(/<[^>]*>/g, ' ');
    // Entities: &nbsp; &amp; etc.
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/&[a-zA-Z0-9#]+;/gi, ' ');
    // Normalize whitespace and newlines
    text = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  // --- Helper: Extract Clean Human Prose Text from Canvas DOM ---
  function getCanvasProsePlainText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    // Remove editor UI controls, drag indicators, hover bars, buttons, svgs
    const controls = clone.querySelectorAll(
      '.figure-hover-actions, .block-hover-actions, .gallery-item-controls, ' +
      '.image-hover-pill-bar, .image-add-caption-btn, .gallery-item-btn, ' +
      '.gallery-item-delete-btn, .gallery-item-btn-sep, .figure-action-sep, ' +
      '.image-side-add-btn, #canvas-drop-indicator, .canvas-drop-indicator, ' +
      '.image-sanitizing-placeholder, .page-recent-posts-block, .page-individual-post-block, button, svg'
    );
    for (let i = 0; i < controls.length; i++) {
      controls[i].remove();
    }

    // Process img elements: if no figcaption, fall back to meaningful alt text
    const imgs = clone.querySelectorAll('img');
    for (let j = 0; j < imgs.length; j++) {
      const img = imgs[j];
      const fig = img.closest('figure');
      if (!fig || !fig.querySelector('figcaption')) {
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt && alt !== 'Image' && alt !== 'Attached Image') {
          const span = document.createElement('span');
          span.textContent = ' ' + alt + ' ';
          img.replaceWith(span);
        } else {
          img.remove();
        }
      } else {
        img.remove();
      }
    }

    // Ignore placeholder captions
    const caps = clone.querySelectorAll('figcaption, .gallery-caption');
    for (let k = 0; k < caps.length; k++) {
      const txt = caps[k].textContent.trim();
      if (txt === 'Add caption here...' || txt === 'Add image caption here...') {
        caps[k].remove();
      }
    }

    // Replace <br> elements with newlines
    const brs = clone.querySelectorAll('br');
    for (let m = 0; m < brs.length; m++) {
      brs[m].replaceWith(document.createTextNode('\n'));
    }

    // Append newline to all block elements so adjacent blocks never merge words
    const blockSelectors = 'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, hr, tr, th, td, figcaption, figure, section, article, header, footer';
    const blocks = clone.querySelectorAll(blockSelectors);
    for (let n = 0; n < blocks.length; n++) {
      blocks[n].appendChild(document.createTextNode('\n'));
    }

    const raw = clone.textContent || '';
    return raw
      .replace(/\u00A0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // --- Helper: Universal Clean Prose Statistics (Words, Characters, Text) ---
  function getCleanProseStats(input, isHtml = false) {
    let cleanText = '';
    if (isHtml) {
      if (typeof input === 'string') {
        const tmp = document.createElement('div');
        tmp.innerHTML = input;
        cleanText = getCanvasProsePlainText(tmp);
      } else if (input && typeof input.cloneNode === 'function') {
        cleanText = getCanvasProsePlainText(input);
      }
    } else {
      cleanText = stripMarkdownToPlainText(input || '');
    }

    const words = cleanText ? cleanText.split(/\s+/).filter(w => w.length > 0).length : 0;
    const chars = cleanText ? cleanText.length : 0;
    return {
      text: cleanText,
      words,
      chars
    };
  }

  // --- Helper: Calculate Reading Time (accurate clean prose counting) ---
  function calculateReadTime(markdownText, override = '', isHtml = false) {
    if (override && override.trim()) return override.trim();
    const stats = getCleanProseStats(markdownText, isHtml);
    const minutes = Math.max(1, Math.ceil(stats.words / 200));
    return `${minutes} min read`;
  }


  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }


  // =========================================================================
  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }


  // =========================================================================
  // TOAST ALERTS & MODAL CONTROLS
  // =========================================================================
  // Helper to find any active/open modal that has user focus
  function findActiveModalElement() {
    const overlays = Array.from(document.querySelectorAll('.modal-overlay, #modal-ftue, .ftue-modal-backdrop'));
    for (let i = overlays.length - 1; i >= 0; i--) {
      const el = overlays[i];
      if (!el || el.style.display === 'none') continue;
      const comp = window.getComputedStyle(el);
      if (comp.display !== 'none' && comp.visibility !== 'hidden' && parseFloat(comp.opacity || '1') > 0) {
        return el;
      }
    }
    return null;
  }

  let _lastToastMsg = '';
  let _lastToastTime = 0;

  function showToast(message, type = 'success') {
    const now = Date.now();
    if (message === _lastToastMsg && (now - _lastToastTime < 400)) {
      return;
    }
    _lastToastMsg = message;
    _lastToastTime = now;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // De-duplicate: Never stack identical toasts on top of each other
    Array.from(container.children).forEach(child => {
      if (child.textContent.trim() === String(message).trim()) {
        child.remove();
      }
    });

    const activeModal = findActiveModalElement();
    if (activeModal) {
      // A modal/popup currently has user focus: anchor the notification directly below the popup card
      const modalCard = activeModal.querySelector('.modal-card, .notes-composer-modal-card, .ftue-modal-card, .modal-export-card, [class*="modal-card"]') || activeModal;
      const rect = modalCard.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;

      container.classList.add('toast-below-modal');
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.right = 'auto';
      container.style.zIndex = '100060';

      if (spaceBelow >= 55) {
        container.style.top = `${Math.round(rect.bottom + 14)}px`;
        container.style.bottom = 'auto';
      } else {
        container.style.top = 'auto';
        container.style.bottom = '20px';
      }
    } else {
      // General notification: anchor in the bottom center of the viewport
      container.classList.remove('toast-below-modal');
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.right = 'auto';
      container.style.top = 'auto';
      container.style.bottom = '28px';
      container.style.zIndex = '100050';
    }

    const toast = document.createElement('div');
    const typeClass = type === 'warning' ? 'toast-warning' : (type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : ''));
    toast.className = `toast ${typeClass}`.trim();
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
          container.classList.remove('toast-below-modal');
          container.style.top = 'auto';
          container.style.bottom = '28px';
        }
      }, 250);
    }, 2800);
  }



  function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      }).catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (err) {
      alert('Failed to copy.');
    }
    document.body.removeChild(ta);
  }

  function triggerDownload(filename, content, mimeType = 'text/html') {
    let blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  function dataUrlToBlob(dataUrl) {
    try {
      const parts = dataUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.warn('Could not convert dataUrl to Blob:', e);
      return null;
    }
  }


  // =========================================================================
  // PURE CLIENT-SIDE MULTI-FILE PKZIP ARCHIVER (Zero dependencies)
  // =========================================================================
  async function createMultiFileZip(files) {
    const textEncoder = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[i] = c;
    }

    function crc32(buf) {
      let crc = 0 ^ (-1);
      for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
      }
      return (crc ^ (-1)) >>> 0;
    }

    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    let localHeaders = [];
    let fileDatas = [];
    let cdHeaders = [];
    let currentOffset = 0;

    for (const file of files) {
      let fileBytes;
      if (typeof file.data === 'string') {
        fileBytes = textEncoder.encode(file.data);
      } else if (file.data instanceof Uint8Array) {
        fileBytes = file.data;
      } else if (file.data instanceof Blob) {
        const arrayBuf = await file.data.arrayBuffer();
        fileBytes = new Uint8Array(arrayBuf);
      } else {
        fileBytes = new Uint8Array(0);
      }

      const nameBytes = textEncoder.encode(file.name);
      const fileCrc = crc32(fileBytes);

      // Local Header
      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, fileCrc, true);
      lv.setUint32(18, fileBytes.length, true);
      lv.setUint32(22, fileBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      // Central Directory Header
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, fileCrc, true);
      cv.setUint32(20, fileBytes.length, true);
      cv.setUint32(24, fileBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, currentOffset, true);
      cd.set(nameBytes, 46);

      localHeaders.push(lh);
      fileDatas.push(fileBytes);
      cdHeaders.push(cd);

      currentOffset += lh.length + fileBytes.length;
    }

    const cdOffset = currentOffset;
    let cdSize = 0;
    cdHeaders.forEach(c => cdSize += c.length);

    // EOCD
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdOffset, true);
    ev.setUint16(20, 0, true);

    const totalSize = currentOffset + cdSize + eocd.length;
    const zipBuffer = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < files.length; i++) {
      zipBuffer.set(localHeaders[i], offset); offset += localHeaders[i].length;
      zipBuffer.set(fileDatas[i], offset);    offset += fileDatas[i].length;
    }
    for (let i = 0; i < cdHeaders.length; i++) {
      zipBuffer.set(cdHeaders[i], offset);    offset += cdHeaders[i].length;
    }
    zipBuffer.set(eocd, offset);

    return zipBuffer;
  }



  // --- Helper: Merge Adjacent Lists (UL/OL) & Remove Empty List Spacers ---
  function mergeAdjacentLists(container) {
    if (!container || !container.querySelectorAll) return false;
    let modified = false;

    function isEmptySpacer(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      if (el === document.activeElement || (document.activeElement && el.contains(document.activeElement))) return false;
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.anchorNode && (el === sel.anchorNode || el.contains(sel.anchorNode))) return false;
      if (el.hasAttribute('data-intentional') || el.dataset?.intentional || el.dataset?.blockType) return false;

      const tag = el.tagName.toLowerCase();
      if (tag === 'p' || tag === 'div') {
        const text = el.textContent.replace(/[\u200B-\u200D\uFEFF\s]/g, '');
        if (!text) {
          const nonBr = Array.from(el.children).filter(c => c.tagName.toLowerCase() !== 'br');
          return nonBr.length === 0;
        }
      }
      return false;
    }

    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;
      const lists = Array.from(container.querySelectorAll('ul, ol'));

      for (let i = 0; i < lists.length; i++) {
        const list = lists[i];
        if (!list.parentNode) continue;

        const tag = list.tagName.toLowerCase();
        let next = list.nextSibling;

        const spacersToRemove = [];
        let candidate = next;
        while (candidate) {
          if (candidate.nodeType === Node.TEXT_NODE && !candidate.textContent.trim()) {
            spacersToRemove.push(candidate);
            candidate = candidate.nextSibling;
          } else if (candidate.nodeType === Node.ELEMENT_NODE && isEmptySpacer(candidate)) {
            spacersToRemove.push(candidate);
            candidate = candidate.nextSibling;
          } else {
            break;
          }
        }

        if (candidate && candidate.nodeType === Node.ELEMENT_NODE && candidate.tagName.toLowerCase() === tag && candidate !== list) {
          spacersToRemove.forEach(s => s.remove());
          while (candidate.firstChild) {
            const child = candidate.firstChild;
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
              if (child.hasAttribute('value')) {
                child.removeAttribute('value');
              }
            }
            list.appendChild(child);
          }
          candidate.remove();
          modified = true;
          continueLoop = true;
          break;
        }
      }
    }
    return modified;
  }

  const MUTED_COVER_PALETTE = [
    '#27272a', // zinc dark
    '#202024', // neutral graphite
    '#242428', // deep iron
    '#2a2a2e', // carbon
    '#1f1f23', // charcoal
    '#2d2d32', // stone grey
    '#222226', // obsidian
    '#28282c', // slate grey
    '#1e1e22', // slate dark
    '#26262a', // basalt
    '#232327', // granite
    '#2b2b30', // ash grey
  ];

  function getMutedCoverColor(seed) {
    if (!seed) return MUTED_COVER_PALETTE[0];
    const s = String(seed);
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % MUTED_COVER_PALETTE.length;
    return MUTED_COVER_PALETTE[idx];
  }

  // Export to Cedar/Outpost namespace and global window
  window.escapeHtml = escapeHtml;
  window.generateSlug = generateSlug;
  window.calculateReadTime = calculateReadTime;
  window.formatDateDisplay = formatDateDisplay;
  window.getLocalIsoDate = getLocalIsoDate;
  window.formatBytes = formatBytes;
  window.showToast = showToast;
  window.copyToClipboard = copyToClipboard;
  window.fallbackCopy = fallbackCopy;
  /**
   * Checks whether an image is referenced in a draft's content, canvas, markdown, or cover
   */
  function isImageReferencedInDraft(img, draft, liveCanvasProse = null) {
    if (!img || !draft) return false;
    const filename = img.filename || '';
    const relPath = img.relativePath || (filename ? `blog/images/${filename}` : '');
    const dataUrl = img.dataUrl || '';

    // 1. If live DOM canvas is provided or currently active
    const canvas = liveCanvasProse || ((typeof currentDraft !== 'undefined' && currentDraft && currentDraft.id === draft.id) ? document.getElementById('rich-canvas-prose') : null);
    if (canvas && typeof canvas.querySelectorAll === 'function') {
      const imgs = canvas.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (el.closest && el.closest('.page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card')) continue;
        const src = el.getAttribute('src') || '';
        const origSrc = el.getAttribute('data-original-src') || '';
        const imgName = el.getAttribute('data-img-name') || el.dataset?.imgName || el.dataset?.filename || '';

        if (filename && (imgName === filename || src.includes(filename) || origSrc.includes(filename))) return true;
        if (relPath && (origSrc === relPath || src.includes(relPath))) return true;
        if (dataUrl && src === dataUrl) return true;
      }
    }

    // 2. Check draft.coverImage / coverImageOriginal / featuredImage
    const coverFields = [draft.coverImage, draft.coverImageOriginal, draft.featuredImage];
    for (let j = 0; j < coverFields.length; j++) {
      const c = coverFields[j];
      if (typeof c === 'string' && c) {
        if (filename && c.includes(filename)) return true;
        if (relPath && c.includes(relPath)) return true;
        if (dataUrl && c === dataUrl) return true;
      }
    }

    // 3. Check markdown
    if (typeof draft.markdown === 'string' && draft.markdown) {
      if (filename && draft.markdown.includes(filename)) return true;
      if (relPath && draft.markdown.includes(relPath)) return true;
      if (dataUrl && draft.markdown.includes(dataUrl)) return true;
    }

    // 4. Check proseHtml & html
    const htmlCombined = (draft.proseHtml || '') + (draft.html || '');
    if (htmlCombined) {
      if (filename && htmlCombined.includes(filename)) return true;
      if (relPath && htmlCombined.includes(relPath)) return true;
      if (dataUrl && htmlCombined.includes(dataUrl)) return true;
    }

    // Note: tempImages is intentionally NOT checked here. Images that are removed from
    // the canvas or markdown must be purged immediately so phantom images never linger.

    return false;
  }

  /**
   * Checks whether an image is used anywhere else across all drafts, author avatars, or standalone mediaLibrary
   */
  function isImageUsedAnywhereElse(filename, excludeDraftId = null) {
    if (!filename) return false;

    // 1. Is it a standalone upload in projectConfig.mediaLibrary?
    if (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.mediaLibrary)) {
      if (projectConfig.mediaLibrary.some(m => m && m.filename === filename)) return true;
    }

    // 2. Is it in any other draft?
    const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : [];
    for (let k = 0; k < allDrafts.length; k++) {
      const d = allDrafts[k];
      if (excludeDraftId && d.id === excludeDraftId) continue;
      if (isImageReferencedInDraft({ filename }, d)) return true;
    }

    // 3. Is it used in author avatars?
    if (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.authors)) {
      if (projectConfig.authors.some(a => (typeof a === 'object' && a?.avatar && a.avatar.includes(filename)))) return true;
    }

    // 4. Is it used in site branding / logo / favicon / masthead?
    if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) {
      const b = projectConfig.design.branding;
      if (b) {
        if (b.generalLogo && b.generalLogo.includes(filename)) return true;
        if (b.tabLogo && b.tabLogo.includes(filename)) return true;
      }
      const mh = projectConfig.design.masthead;
      if (mh && mh.elements && mh.elements.logo && mh.elements.logo.customImage && mh.elements.logo.customImage.includes(filename)) return true;
    }

    return false;
  }

  /**
   * Safely deletes an orphaned image file from memory registry and virtual vault storage
   */
  async function cleanupOrphanedImageStorage(filename, excludeDraftId = null) {
    if (!filename) return;
    if (isImageUsedAnywhereElse(filename, excludeDraftId)) return;

    // Remove from in-memory registry
    if (typeof imageRegistry !== 'undefined' && imageRegistry) {
      imageRegistry.delete(filename);
      imageRegistry.delete(`/blog/images/${filename}`);
      imageRegistry.delete(`blog/images/${filename}`);
    }

    // Remove from Virtual Vault (OPFS / IndexedDB)
    if ((typeof window.CedarVirtualStorage !== 'undefined' && window.CedarVirtualStorage) || (typeof window.OutpostVirtualStorage !== 'undefined' && window.OutpostVirtualStorage)) {
      try {
        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).deleteFile(`blog/images/${filename}`);
      } catch (e) {}
      try {
        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).deleteFile(`media/${filename}`);
      } catch (e) {}
    }

    // Remove from SheeshVault (FSA)
    if (typeof window.SheeshVault !== 'undefined' && window.SheeshVault && typeof window.SheeshVault.deleteFile === 'function') {
      try {
        await window.SheeshVault.deleteFile(`blog/images/${filename}`);
      } catch (e) {}
      try {
        await window.SheeshVault.deleteFile(`media/${filename}`);
      } catch (e) {}
    }
  }

  /**
   * Reconciles draft.images against actual content:
   * 1. Recovers gallery / prose images into draft.images and imageRegistry
   * 2. Removes orphaned images and storage immediately from draft.images AND draft.tempImages
   */
  function reconcileDraftImages(draft, liveCanvasProse = null) {
    if (!draft) return [];
    if (!Array.isArray(draft.images)) draft.images = [];

    // Purge any corrupted image items that have data URLs or blob URLs as filenames
    draft.images = draft.images.filter(im => im && im.filename && !im.filename.startsWith('data:') && !im.filename.startsWith('blob:'));
    if (Array.isArray(draft.tempImages)) {
      draft.tempImages = draft.tempImages.filter(im => im && im.filename && !im.filename.startsWith('data:') && !im.filename.startsWith('blob:'));
    }

    // Helper: register an image found in canvas or HTML
    function registerDiscoveredImage(src, origSrc, imgName, alt) {
      if (!src && !origSrc && !imgName && !alt) return;
      let filename = imgName;
      if (!filename && origSrc && !origSrc.startsWith('data:') && !origSrc.startsWith('blob:')) {
        filename = origSrc.split('/').pop().split('\\').pop().split('?')[0];
      }
      if (!filename && src && !src.startsWith('data:') && !src.startsWith('blob:')) {
        filename = src.split('/').pop().split('\\').pop().split('?')[0];
      }
      if (!filename && alt && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(alt.trim())) {
        filename = alt.trim().split('/').pop().split('\\').pop();
      }
      if (!filename || filename.startsWith('data:') || filename.startsWith('blob:')) return;

      const isDataOrBlob = src && (src.startsWith('data:') || src.startsWith('blob:'));
      const dataUrl = isDataOrBlob ? src : '';
      const relPath = (origSrc && !origSrc.startsWith('data:')) ? origSrc : (filename ? `/blog/images/${filename}` : '');

      let existing = draft.images.find(im => im && (im.filename === filename || (im.relativePath && im.relativePath.endsWith(filename))));
      if (existing) {
        if (!existing.dataUrl && dataUrl) existing.dataUrl = dataUrl;
        if (!existing.relativePath && relPath) existing.relativePath = relPath;
        if (!existing.src && src) existing.src = src;
      } else {
        existing = {
          filename: filename,
          relativePath: relPath,
          dataUrl: dataUrl,
          src: src,
          alt: alt || 'Image'
        };
        draft.images.push(existing);
      }

      if (dataUrl && typeof window !== 'undefined' && window.imageRegistry) {
        window.imageRegistry.set(filename, { dataUrl, filename, relativePath: relPath });
        window.imageRegistry.set(`/blog/images/${filename}`, { dataUrl, filename, relativePath: relPath });
        window.imageRegistry.set(`blog/images/${filename}`, { dataUrl, filename, relativePath: relPath });
      }
    }

    // 1a. Scan live DOM canvas if available
    const canvas = liveCanvasProse || ((typeof currentDraft !== 'undefined' && currentDraft && currentDraft.id === draft.id) ? document.getElementById('rich-canvas-prose') : null);
    if (canvas && typeof canvas.querySelectorAll === 'function') {
      const imgs = canvas.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (el.closest && el.closest('.page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card')) continue;
        const src = el.getAttribute('src') || '';
        const origSrc = el.getAttribute('data-original-src') || el.dataset?.originalSrc || '';
        const imgName = el.getAttribute('data-img-name') || el.dataset?.imgName || el.dataset?.filename || '';
        const alt = el.getAttribute('alt') || '';
        registerDiscoveredImage(src, origSrc, imgName, alt);
      }
    }

    // 1b. Scan draft.proseHtml and draft.html (recovers gallery images and embedded media)
    const htmlCombined = (draft.proseHtml || '') + (draft.html || '');
    if (htmlCombined) {
      try {
        const doc = new DOMParser().parseFromString(`<body>${htmlCombined}</body>`, 'text/html');
        const imgs = doc.body.querySelectorAll('img');
        for (let i = 0; i < imgs.length; i++) {
          const el = imgs[i];
          if (el.closest && el.closest('.page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card')) continue;
          const src = el.getAttribute('src') || '';
          const origSrc = el.getAttribute('data-original-src') || el.dataset?.originalSrc || '';
          const imgName = el.getAttribute('data-img-name') || el.dataset?.imgName || el.dataset?.filename || '';
          const alt = el.getAttribute('alt') || '';
          registerDiscoveredImage(src, origSrc, imgName, alt);
        }
      } catch (e) {
        const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        let m;
        while ((m = imgRe.exec(htmlCombined)) !== null) {
          const fullTag = m[0];
          const src = m[1];
          const nameMatch = fullTag.match(/data-img-name=["']([^"']+)["']/i);
          const origMatch = fullTag.match(/data-original-src=["']([^"']+)["']/i);
          registerDiscoveredImage(src, origMatch ? origMatch[1] : '', nameMatch ? nameMatch[1] : '', '');
        }
      }
    }

    // 1c. Ensure all draft.images with dataUrl are registered in imageRegistry
    if (typeof window !== 'undefined' && window.imageRegistry) {
      draft.images.forEach(im => {
        if (im && im.filename && im.dataUrl) {
          window.imageRegistry.set(im.filename, { dataUrl: im.dataUrl, filename: im.filename, relativePath: im.relativePath });
          window.imageRegistry.set(`/blog/images/${im.filename}`, { dataUrl: im.dataUrl, filename: im.filename, relativePath: im.relativePath });
          window.imageRegistry.set(`blog/images/${im.filename}`, { dataUrl: im.dataUrl, filename: im.filename, relativePath: im.relativePath });
        }
      });
    }

    // 2. Identify and purge unreferenced images from draft.images AND draft.tempImages
    const validImages = [];
    const removedImages = [];

    draft.images.forEach(img => {
      if (img && img.filename && isImageReferencedInDraft(img, draft, liveCanvasProse)) {
        validImages.push(img);
      } else {
        removedImages.push(img);
      }
    });

    draft.images = validImages;

    if (Array.isArray(draft.tempImages)) {
      const purgedTemp = [];
      draft.tempImages = draft.tempImages.filter(im => {
        if (!im || !im.filename) return false;
        const isRef = isImageReferencedInDraft(im, draft, liveCanvasProse);
        if (!isRef) {
          purgedTemp.push(im);
          return false;
        }
        return true;
      });
      purgedTemp.forEach(im => {
        if (!removedImages.some(r => r.filename === im.filename)) {
          removedImages.push(im);
        }
      });
    }

    // If draft.coverImage was pointing to a removed/unreferenced image, clear it or reset to first valid
    if (draft.coverImage && removedImages.some(r => r.filename && draft.coverImage.includes(r.filename))) {
      draft.coverImage = validImages.length > 0 ? (validImages[0].relativePath || validImages[0].filename) : '';
      draft.coverImageRemoved = false;
    }

    if (removedImages.length > 0) {
      removedImages.forEach(img => {
        if (img && img.filename) {
          cleanupOrphanedImageStorage(img.filename, draft.id);
        }
      });
      if (typeof updateImagesCount === 'function' && typeof currentDraft !== 'undefined' && currentDraft && currentDraft.id === draft.id) {
        updateImagesCount();
      }
    }

    return validImages;
  }

  window.generateSlug = generateSlug;
  window.getAppTimezone = getAppTimezone;
  window.getLocalIsoDate = getLocalIsoDate;
  window.formatDateDisplay = formatDateDisplay;
  window.isImageReferencedInDraft = isImageReferencedInDraft;
  window.isImageUsedAnywhereElse = isImageUsedAnywhereElse;
  window.cleanupOrphanedImageStorage = cleanupOrphanedImageStorage;
  window.reconcileDraftImages = reconcileDraftImages;
  window.stripMarkdownToPlainText = stripMarkdownToPlainText;
  window.getCanvasProsePlainText = getCanvasProsePlainText;
  window.getCleanProseStats = getCleanProseStats;
  window.calculateReadTime = calculateReadTime;

  /**
   * Resolves any image target (relative URL, filename, clean basename, object, or data URL)
   * to a renderable URL using draft.images, imageRegistry, or mediaLibrary.
   */
  function resolvePostImage(imgUrlOrObj, draft) {
    if (!imgUrlOrObj) return '';
    let target = '';
    if (typeof imgUrlOrObj === 'object' && imgUrlOrObj !== null) {
      target = imgUrlOrObj.dataUrl || imgUrlOrObj.data || imgUrlOrObj.url || imgUrlOrObj.src || imgUrlOrObj.filename || '';
    } else {
      target = String(imgUrlOrObj).trim();
    }
    if (!target) return '';

    // If target is already a data URL, blob URL, or external http(s) URL, return it immediately
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(target)) {
      return target;
    }

    const cleanName = target.split('/').pop().split('\\').pop().toLowerCase();
    const cleanNoPrefix = target.replace(/^\/?(blog\/)?images\//i, '').toLowerCase();

    // Helper to test if an image item matches
    function matchImage(im) {
      if (!im) return '';
      if (typeof im === 'string') {
        if (/^(data:image\/|blob:|https?:\/\/)/i.test(im)) {
          const sName = im.split('/').pop().split('\\').pop().toLowerCase();
          if (im === target || sName === cleanName || sName === cleanNoPrefix) return im;
        }
        return '';
      }
      const fn = (im.filename || im.name || '').trim().toLowerCase();
      const rel = (im.relativePath || '').trim().toLowerCase();
      const data = im.dataUrl || im.data || (im.blob ? URL.createObjectURL(im.blob) : '') || im.url || im.src || im.relativePath || '';

      if (cleanName && cleanName.length >= 3 && fn && (fn === cleanName || fn === cleanNoPrefix || fn === target.toLowerCase())) return data;
      if (cleanName && cleanName.length >= 3 && rel && (rel === target.toLowerCase() || rel.endsWith('/' + cleanName) || rel.endsWith('\\' + cleanName) || rel === cleanName)) return data;
      if (cleanNoPrefix && cleanNoPrefix.length >= 3 && rel && (rel.endsWith('/' + cleanNoPrefix) || rel.endsWith('\\' + cleanNoPrefix) || rel === cleanNoPrefix)) return data;
      if (data && (data === target)) return data;
      return '';
    }

    // 1. Check in draft.images and draft proseHtml if draft is provided
    if (draft) {
      if (Array.isArray(draft.images)) {
        for (const im of draft.images) {
          const res = matchImage(im);
          if (res && (/^(data:image\/|blob:|https?:\/\/|\/?(blog\/)?images\/|\/?media\/)/i.test(res))) return res;
        }
      }
      const draftProse = (draft.proseHtml || '') + (draft.html || '');
      if (draftProse && (draftProse.includes(cleanName) || draftProse.includes(cleanNoPrefix) || draftProse.includes(target))) {
        const imgRe = /<img[^>]+src=["'](data:image\/[^"']+|blob:[^"']+)["'][^>]*>/gi;
        let m;
        while ((m = imgRe.exec(draftProse)) !== null) {
          const fullTag = m[0];
          const srcData = m[1];
          if (fullTag.includes(cleanName) || fullTag.includes(cleanNoPrefix) || fullTag.includes(target)) {
            if (typeof window !== 'undefined' && window.imageRegistry) {
              window.imageRegistry.set(cleanName, { dataUrl: srcData, filename: cleanName });
              window.imageRegistry.set(`/blog/images/${cleanName}`, { dataUrl: srcData, filename: cleanName });
            }
            return srcData;
          }
        }
      }
    }

    // 2. Check in window.imageRegistry
    if (typeof window !== 'undefined' && window.imageRegistry) {
      const regKeys = [
        target,
        cleanName,
        cleanNoPrefix,
        `/blog/images/${cleanName}`,
        `blog/images/${cleanName}`,
        `/images/${cleanName}`,
        `images/${cleanName}`
      ];
      for (const k of regKeys) {
        if (typeof window.imageRegistry.has === 'function' && window.imageRegistry.has(k)) {
          const reg = window.imageRegistry.get(k);
          const res = matchImage(reg);
          if (res) return res;
        } else if (typeof window.imageRegistry.get === 'function') {
          const reg = window.imageRegistry.get(k);
          if (reg) {
            const res = matchImage(reg);
            if (res) return res;
          }
        }
      }
    }

    // 3. Check across all drafts in memory (images & proseHtml) ONLY IF no specific draft was provided
    if (!draft) {
      const allDrafts = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
        ? window.CedarStore.getAllDrafts()
        : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []));
      for (const d of allDrafts) {
      if (Array.isArray(d.images)) {
        for (const im of d.images) {
          const res = matchImage(im);
          if (res && (/^(data:image\/|blob:|https?:\/\/|\/?(blog\/)?images\/|\/?media\/)/i.test(res))) return res;
        }
      }
      const otherProse = (d.proseHtml || '') + (d.html || '');
      if (otherProse && (otherProse.includes(cleanName) || otherProse.includes(cleanNoPrefix) || otherProse.includes(target))) {
        const imgRe = /<img[^>]+src=["'](data:image\/[^"']+|blob:[^"']+)["'][^>]*>/gi;
        let m;
        while ((m = imgRe.exec(otherProse)) !== null) {
          const fullTag = m[0];
          const srcData = m[1];
          if (fullTag.includes(cleanName) || fullTag.includes(cleanNoPrefix) || fullTag.includes(target)) {
            return srcData;
          }
        }
      }
    }
    }

    // 4. Check projectConfig.mediaLibrary
    const pConf = (typeof projectConfig !== 'undefined' && projectConfig) || (typeof window !== 'undefined' && window.projectConfig);
    if (pConf && Array.isArray(pConf.mediaLibrary)) {
      for (const im of pConf.mediaLibrary) {
        const res = matchImage(im);
        if (res && (/^(data:image\/|blob:|https?:\/\/|\/?(blog\/)?images\/|\/?media\/)/i.test(res))) return res;
      }
    }

    // 5. Static local asset check
    if (target.startsWith('images/') || target.startsWith('/images/') || target.startsWith('blog/images/') || target.startsWith('/blog/images/') || target.startsWith('media/') || target.startsWith('/media/')) {
      return target;
    }

    return '';
  }

  /**
   * Resolves the primary featured/cover image for a post by inspecting:
   * 1. coverImage / featuredImage / coverImageOriginal
   * 2. Attached images in post.images and post.tempImages
   * 3. First markdown image syntax ![...](...)
   * Returns empty string if no valid image is found.
   */
  function getPostFeaturedImage(post) {
    if (!post) return '';

    // If post explicitly had its cover removed, do not auto-pick a thumbnail
    if (post.coverImageRemoved) return '';

    // 1. Explicit cover or featured fields
    const explicitCandidates = [
      post.coverImage,
      post.featuredImage,
      post.coverImageOriginal
    ].filter(Boolean);

    for (const cand of explicitCandidates) {
      const r = resolvePostImage(cand, post);
      if (r) return r;
    }

    // 2. If post has no body content and no markdown/HTML, it has no featured image
    const md = typeof post.markdown === 'string' ? post.markdown : '';
    const prose = typeof post.proseHtml === 'string' ? post.proseHtml : '';
    const html = typeof post.html === 'string' ? post.html : '';
    const contentStr = (md + ' ' + prose + ' ' + html).trim();
    if (!contentStr || contentStr === '<p><br></p>' || contentStr === '<p></p>') {
      return '';
    }

    // 3. Attached images that are actually referenced in the post's content
    if (Array.isArray(post.images) && post.images.length > 0) {
      for (const im of post.images) {
        if (!im) continue;
        const fn = im.filename || (typeof im === 'string' ? im.split('/').pop().split('\\').pop() : '');
        const rel = im.relativePath || (typeof im === 'string' ? im : '');
        const src = im.src || '';
        const isUsed = (fn && contentStr.includes(fn)) || (rel && contentStr.includes(rel)) || (src && contentStr.includes(src));
        if (isUsed) {
          const r = resolvePostImage(im, post);
          if (r) return r;
        }
      }
    }

    // 4. First markdown image syntax ![...](...)
    if (md) {
      const match = md.match(/!\[.*?\]\((.*?)\)/);
      if (match && match[1]) {
        const r = resolvePostImage(match[1].trim(), post);
        if (r) return r;
      }
    }

    // 5. First HTML image syntax <img ... src="..." ...>
    if (prose || html) {
      const match = (prose + ' ' + html).match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1]) {
        const r = resolvePostImage(match[1].trim(), post);
        if (r) return r;
      }
    }

    return '';
  }

  window.generateSlug = generateSlug;
  window.hasDraftBeenPublished = hasDraftBeenPublished;
  window.shouldAutoSyncSlugFromTitle = shouldAutoSyncSlugFromTitle;
  window.triggerDownload = triggerDownload;
  window.dataUrlToBlob = dataUrlToBlob;
  window.setVal = setVal;
  window.getVal = getVal;
  window.createMultiFileZip = createMultiFileZip;
  window.mergeAdjacentLists = mergeAdjacentLists;
  window.MUTED_COVER_PALETTE = MUTED_COVER_PALETTE;
  window.getMutedCoverColor = getMutedCoverColor;
  window.resolvePostImage = resolvePostImage;
  window.getPostFeaturedImage = getPostFeaturedImage;

  const utilsExports = {
    escapeHtml,
    generateSlug,
    calculateReadTime,
    stripMarkdownToPlainText,
    getCanvasProsePlainText,
    getCleanProseStats,
    formatDateDisplay,
    getLocalIsoDate,
    formatBytes,
    showToast,
    copyToClipboard,
    fallbackCopy,
    triggerDownload,
    dataUrlToBlob,
    setVal,
    getVal,
    createMultiFileZip,
    mergeAdjacentLists,
    MUTED_COVER_PALETTE,
    getMutedCoverColor,
    isImageReferencedInDraft,
    isImageUsedAnywhereElse,
    cleanupOrphanedImageStorage,
    reconcileDraftImages,
    resolvePostImage,
    getPostFeaturedImage
  };

  window.Cedar.utils = utilsExports;
  window.Outpost.utils = utilsExports;
})();
