/**
 * Cedar - Modals, Dialogs & Hubs
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  function openLinkModal(defaultUrl, defaultText) {
    if (typeof saveCurrentSelection === 'function') {
      saveCurrentSelection();
    }
    const sel = window.getSelection();
    const selectedText = (defaultText !== undefined && defaultText !== null)
      ? defaultText
      : ((sel && sel.rangeCount > 0) ? sel.toString().trim() : '');

    const urlInput = document.getElementById('link-dialog-url');
    const textInput = document.getElementById('link-dialog-text');

    if (urlInput) urlInput.value = (defaultUrl !== undefined && defaultUrl !== null) ? defaultUrl : '';
    if (textInput) textInput.value = selectedText;

    openModal('modal-insert-link');
    setTimeout(() => {
      if (urlInput) {
        urlInput.focus();
        urlInput.select();
      }
    }, 100);
  }


  // =========================================================================
  // IMAGE MANAGER MODAL LIST
  // =========================================================================
  function renderImageManagerList() {
    const grid = document.getElementById('img-manager-grid');
    const countLabel = document.getElementById('img-mgr-count-label');
    if (!grid) return;
    grid.innerHTML = '';

    const images = (currentDraft && currentDraft.images) ? currentDraft.images : [];
    if (countLabel) countLabel.textContent = `${images.length} image(s) attached`;

    if (images.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #71717a; font-size: 0.9rem;">No images added to this draft yet. Drop or paste images above!</div>`;
      return;
    }

    images.forEach((img, idx) => {
      const card = document.createElement('div');
      card.className = 'img-manager-card';

      card.innerHTML = `
        <div class="img-card-thumb-wrap">
          <img src="${img.dataUrl}" alt="${escapeHtml(img.filename)}" class="img-card-thumb">
          <span class="img-card-sanitized-badge">🛡️ Sanitized</span>
        </div>
        <div class="img-card-body">
          <div class="img-card-name" title="${escapeHtml(img.filename)}">${escapeHtml(img.filename)}</div>
          <div class="img-card-meta">
            <span>${img.width} &times; ${img.height}</span>
            <span>${formatBytes(img.size)}</span>
          </div>
          <div class="img-card-actions">
            <button type="button" class="img-card-btn btn-insert-mgr" title="Insert figure at cursor in text">+ Insert</button>
            <button type="button" class="img-card-btn btn-cover-mgr" title="Set as Cover Image">★ Cover</button>
            <button type="button" class="img-card-btn btn-copy-path-mgr" title="Copy Path">Path</button>
            <button type="button" class="img-card-btn btn-download-mgr" title="Download sanitized file">📥</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-insert-mgr').addEventListener('click', () => {
        const figHtml = (typeof createFigureHtml === 'function')
          ? createFigureHtml(img.dataUrl, img.relativePath, img.filename, 'Image', '', 'full')
          : `<div class="captioned-image-container"><figure><div class="image-media-wrapper"><img src="${img.dataUrl}" data-original-src="${img.relativePath}" data-img-name="${img.filename}" alt="Image" loading="lazy"><button type="button" class="image-add-caption-btn" title="Add Caption"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Add Caption</span></button></div></figure></div>`;
        insertHtmlAtCursor(figHtml + '<p><br></p>');
        closeModal('modal-images');
        showToast(`Inserted ${img.filename} into post!`);
      });

      card.querySelector('.btn-cover-mgr').addEventListener('click', () => {
        document.getElementById('meta-cover-image').value = img.relativePath;
        currentDraft.coverImage = img.relativePath;
        updateCoverPreview();
        scheduleAutosave();
        showToast(`Set ${img.filename} as cover image!`);
      });

      card.querySelector('.btn-copy-path-mgr').addEventListener('click', () => {
        copyToClipboard(img.relativePath, `Copied path: ${img.relativePath}`);
      });

      card.querySelector('.btn-download-mgr').addEventListener('click', () => {
        triggerDownload(img.filename, img.blob, img.mimeType);
      });

      grid.appendChild(card);
    });
  }


  // =========================================================================
  // EXPORT HUB, PUBLISH SETUP & 1280x720 CROPPING STUDIO
  // =========================================================================

  // Helper: Extract clean base filename from any image path/url (ignoring folders, query, hash)
  function getImageBaseFilename(src) {
    if (!src || typeof src !== 'string') return '';
    const clean = src.split('?')[0].split('#')[0].trim();
    if (clean.startsWith('data:') || clean.startsWith('blob:')) return '';
    return clean.split('/').pop().trim();
  }

  // Helper: Resolve any image reference (relative path, filename, dataUrl, external url) to a valid displayable URL
  function resolveImageDisplayUrl(src, draft = currentDraft) {
    if (!src || typeof src !== 'string') return '';
    const trimmed = src.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

    // 1. Direct registry lookup
    if (typeof imageRegistry !== 'undefined' && imageRegistry) {
      if (imageRegistry.has(trimmed)) {
        const reg = imageRegistry.get(trimmed);
        if (reg) {
          if (reg.dataUrl) return reg.dataUrl;
          if (reg.objectUrl) return reg.objectUrl;
          if (reg.blob) {
            try { return URL.createObjectURL(reg.blob); } catch (e) {}
          }
          if (reg.src && (reg.src.startsWith('data:') || reg.src.startsWith('blob:'))) return reg.src;
          if (reg.url && (reg.url.startsWith('data:') || reg.url.startsWith('blob:'))) return reg.url;
        }
      }
    }

    // 2. Base filename lookup in imageRegistry across standard prefixes
    const filename = getImageBaseFilename(trimmed);
    if (filename && typeof imageRegistry !== 'undefined' && imageRegistry) {
      const candidates = [
        filename,
        `/blog/images/${filename}`,
        `blog/images/${filename}`,
        `/images/${filename}`,
        `images/${filename}`
      ];
      for (const c of candidates) {
        if (imageRegistry.has(c)) {
          const reg = imageRegistry.get(c);
          if (reg) {
            if (reg.dataUrl) return reg.dataUrl;
            if (reg.objectUrl) return reg.objectUrl;
            if (reg.blob) {
              try { return URL.createObjectURL(reg.blob); } catch (e) {}
            }
            if (reg.src && (reg.src.startsWith('data:') || reg.src.startsWith('blob:'))) return reg.src;
            if (reg.url && (reg.url.startsWith('data:') || reg.url.startsWith('blob:'))) return reg.url;
          }
        }
      }
    }

    // 3. Lookup in draft.images
    if (draft && Array.isArray(draft.images) && draft.images.length > 0) {
      let match = draft.images.find(im => 
        im && (im.relativePath === trimmed || im.filename === trimmed || im.dataUrl === trimmed)
      );
      if (!match && filename) {
        match = draft.images.find(im => 
          im && (im.filename === filename || (im.relativePath && getImageBaseFilename(im.relativePath) === filename))
        );
      }
      if (match) {
        if (match.dataUrl) return match.dataUrl;
        if (match.objectUrl) return match.objectUrl;
        if (match.blob) {
          try { return URL.createObjectURL(match.blob); } catch (e) {}
        }
        if (match.src && (match.src.startsWith('data:') || match.src.startsWith('blob:'))) return match.src;
        if (match.url && (match.url.startsWith('data:') || match.url.startsWith('blob:'))) return match.url;
      }
    }

    // 4. Lookup in draft.proseHtml and draft.html (crucial for gallery images with base64 data URLs)
    const targetDrafts = draft ? [draft] : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);
    const searchNeedle = (filename && filename.length >= 3) ? filename : (trimmed && trimmed.length >= 3 ? trimmed : null);
    if (searchNeedle) {
      for (const d of targetDrafts) {
        if (!d) continue;
        const htmlCombined = (d.proseHtml || '') + (d.html || '');
        if (htmlCombined && htmlCombined.includes(searchNeedle)) {
          const imgRe = /<img[^>]+src=["'](data:image\/[^"']+|blob:[^"']+)["'][^>]*>/gi;
          let m;
          while ((m = imgRe.exec(htmlCombined)) !== null) {
            const fullTag = m[0];
            const srcData = m[1];
            if (fullTag.includes(searchNeedle)) {
              if (filename && typeof imageRegistry !== 'undefined' && imageRegistry) {
                imageRegistry.set(filename, { dataUrl: srcData, filename });
                imageRegistry.set(`/blog/images/${filename}`, { dataUrl: srcData, filename });
                imageRegistry.set(`blog/images/${filename}`, { dataUrl: srcData, filename });
              }
              return srcData;
            }
          }
        }
      }
    }

    // 5. Lookup via window.resolvePostImage
    if (typeof window.resolvePostImage === 'function') {
      const res = window.resolvePostImage(trimmed, draft);
      if (res && (res.startsWith('data:') || res.startsWith('blob:') || /^https?:\/\//i.test(res))) {
        return res;
      }
    }

    // 6. Lookup in projectConfig.mediaLibrary
    if (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.mediaLibrary) && filename) {
      const libMatch = projectConfig.mediaLibrary.find(m => 
        m && (m.filename === filename || (m.relativePath && getImageBaseFilename(m.relativePath) === filename) || m.dataUrl === trimmed)
      );
      if (libMatch) {
        if (libMatch.dataUrl) return libMatch.dataUrl;
        if (libMatch.objectUrl) return libMatch.objectUrl;
        if (libMatch.blob) {
          try { return URL.createObjectURL(libMatch.blob); } catch (e) {}
        }
        if (libMatch.src && (libMatch.src.startsWith('data:') || libMatch.src.startsWith('blob:'))) return libMatch.src;
        if (libMatch.url && (libMatch.url.startsWith('data:') || libMatch.url.startsWith('blob:'))) return libMatch.url;
      }
    }

    // 7. Lookup across all drafts in memory
    const allDraftsList = (typeof drafts !== 'undefined' && Array.isArray(drafts))
      ? drafts
      : (typeof window !== 'undefined' && Array.isArray(window.drafts) ? window.drafts : []);
    for (const d of allDraftsList) {
      if (d === draft) continue;
      const dImgs = Array.isArray(d.images) ? d.images : [];
      const match = dImgs.find(im => 
        im && (im.relativePath === trimmed || im.filename === trimmed || im.filename === filename || (filename && im.relativePath && getImageBaseFilename(im.relativePath) === filename))
      );
      if (match) {
        if (match.dataUrl) return match.dataUrl;
        if (match.objectUrl) return match.objectUrl;
        if (match.blob) {
          try { return URL.createObjectURL(match.blob); } catch (e) {}
        }
        if (match.src && (match.src.startsWith('data:') || match.src.startsWith('blob:'))) return match.src;
        if (match.url && (match.url.startsWith('data:') || match.url.startsWith('blob:'))) return match.url;
      }
    }

    // 8. Fallback for static URLs
    return trimmed;
  }

  // Helper: Extract all available images in a draft (markdown, html, gallery, attached)
  function getDraftAvailableImages(draft) {
    if (!draft) return [];
    if (typeof window.reconcileDraftImages === 'function') {
      window.reconcileDraftImages(draft);
    }
    const found = [];
    const md = draft.markdown || '';

    // 1. Standard markdown images: ![alt](url)
    const mdRegex = /!\[.*?\]\(\s*<?([^\s\)>]+)>?(?:\s+["'].*?["'])?\s*\)/g;
    let match;
    while ((match = mdRegex.exec(md)) !== null) {
      if (match[1]) found.push(match[1].trim());
    }

    // 2. HTML <img> tags in markdown
    const htmlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((match = htmlRegex.exec(md)) !== null) {
      if (match[1]) found.push(match[1].trim());
    }

    // 3. Custom gallery blocks: :::gallery ... :::
    const galleryBlocks = md.match(/:::gallery[\s\S]*?:::/gi);
    if (galleryBlocks) {
      galleryBlocks.forEach(block => {
        const lines = block.replace(/:::gallery|:::/gi, '').split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const m = trimmed.match(/!\[.*?\]\(\s*<?([^\s\)>]+)>?/);
          if (m) found.push(m[1].trim());
          else if (/\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(trimmed) || trimmed.startsWith('data:image/') || trimmed.startsWith('images/') || trimmed.startsWith('/blog/images/')) {
            found.push(trimmed);
          }
        });
      });
    }

    // 4. HTML <img> tags in proseHtml and html (recovers gallery images and embedded media)
    const htmlCombined = (draft.proseHtml || '') + (draft.html || '');
    if (htmlCombined) {
      let hMatch;
      const hImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      while ((hMatch = hImgRegex.exec(htmlCombined)) !== null) {
        const fullTag = hMatch[0];
        const srcAttr = hMatch[1];
        const nameMatch = fullTag.match(/data-img-name=["']([^"']+)["']/i);
        const origMatch = fullTag.match(/data-original-src=["']([^"']+)["']/i);
        const altMatch = fullTag.match(/alt=["']([^"']+)["']/i);
        let name = nameMatch ? nameMatch[1] : '';
        const orig = origMatch ? origMatch[1] : '';
        const altVal = altMatch ? altMatch[1].trim() : '';
        if (!name && altVal && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(altVal)) {
          name = altVal.split('/').pop().split('\\').pop();
        }
        if (name && !name.startsWith('data:') && !name.startsWith('blob:')) {
          found.push(`/blog/images/${name}`);
        } else if (orig && !orig.startsWith('data:') && !orig.startsWith('blob:')) {
          found.push(orig);
        } else if (srcAttr && !srcAttr.startsWith('data:') && !srcAttr.startsWith('blob:')) {
          found.push(srcAttr);
        }
      }
    }

    // 5. Valid images in draft.images (already reconciled and verified referenced)
    if (Array.isArray(draft.images)) {
      draft.images.forEach(img => {
        if (!img) return;
        const p = (img.relativePath && !img.relativePath.startsWith('data:') && !img.relativePath.startsWith('blob:'))
          ? img.relativePath
          : (img.filename && !img.filename.startsWith('data:') && !img.filename.startsWith('blob:') ? `/blog/images/${img.filename}` : '');
        if (p) found.push(p);
      });
    }

    // Deduplicate images canonically by base filename
    const unique = [];
    const seenFilenames = new Set();

    found.forEach(rawUrl => {
      const u = (rawUrl || '').trim();
      if (!u || u.startsWith('data:') || u.startsWith('blob:')) return;

      const baseName = getImageBaseFilename(u).toLowerCase();
      if (baseName) {
        if (!seenFilenames.has(baseName)) {
          seenFilenames.add(baseName);

          // If draft.images has a canonical relativePath for this filename, use it
          let canonical = u;
          if (draft.images && Array.isArray(draft.images)) {
            const m = draft.images.find(im => im && (im.filename === baseName || getImageBaseFilename(im.relativePath) === baseName));
            if (m && m.relativePath && !m.relativePath.startsWith('data:')) canonical = m.relativePath;
          }
          unique.push(canonical);
        }
      }
    });

    // 6. If draft has an existing coverImage not in the list:
    // Only include if it is NOT a duplicate of an existing image AND is actually resolvable and referenced
    const activeCover = (draft.coverImage || '').trim();
    if (activeCover && !activeCover.startsWith('data:') && !activeCover.startsWith('blob:')) {
      const coverBase = getImageBaseFilename(activeCover).toLowerCase();
      const isAlreadyIncluded = coverBase ? seenFilenames.has(coverBase) : false;
      if (!isAlreadyIncluded) {
        const resolved = resolveImageDisplayUrl(activeCover, draft);
        const isValid = resolved && (resolved.startsWith('data:image/') || resolved.startsWith('blob:') || /^https?:\/\//i.test(resolved));
        const isReferenced = (typeof window.isImageReferencedInDraft === 'function')
          ? window.isImageReferencedInDraft({ filename: coverBase, relativePath: activeCover }, draft)
          : false;
        if (isValid && isReferenced) {
          unique.unshift(activeCover);
          if (coverBase) seenFilenames.add(coverBase);
        } else {
          // Stale / deleted cover image, clear it
          draft.coverImage = '';
        }
      }
    }

    return unique;
  }

  // Helper: Detect first image or embedded media in draft
  function detectFirstImageInDraft(draft) {
    const list = getDraftAvailableImages(draft);
    return list.length > 0 ? list[0] : '';
  }

  function renderSetupAuthorChips() {
    const container = document.getElementById('setup-author-chips');
    if (!container || !currentDraft) return;
    container.innerHTML = '';

    if (typeof window.reconcileAuthorsFromDrafts === 'function') {
      window.reconcileAuthorsFromDrafts();
    }

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')
      ? resolveProjectDefaultAuthor()
      : ((projectConfig && projectConfig.defaultAuthor) ? projectConfig.defaultAuthor : '');

    // Case-insensitive set of deleted author names that must never be shown
    const deletedNames = new Set(
      (projectConfig && Array.isArray(projectConfig.deletedAuthors))
        ? projectConfig.deletedAuthors.map(d => (typeof d === 'string' ? d.trim().toLowerCase() : '')).filter(Boolean)
        : []
    );

    // Case-insensitive set of retired author names
    const retiredNames = new Set(
      (projectConfig && Array.isArray(projectConfig.authors))
        ? projectConfig.authors
            .filter(a => typeof a === 'object' && a !== null && a.retired)
            .map(a => (a.name || '').trim().toLowerCase())
            .filter(Boolean)
        : []
    );

    // Build canonical author map (lowercase -> { name, isRetired, isDefault })
    // strictly from established authors (defaultAuthor & projectConfig.authors)
    const authorMap = new Map();

    if (defaultAuth && defaultAuth !== 'My Blog Slice' && defaultAuth !== 'sheesh') {
      const defLower = defaultAuth.trim().toLowerCase();
      if (!deletedNames.has(defLower)) {
        authorMap.set(defLower, {
          name: defaultAuth.trim(),
          isRetired: retiredNames.has(defLower),
          isDefault: true
        });
      }
    }

    if (projectConfig && Array.isArray(projectConfig.authors)) {
      projectConfig.authors.forEach(a => {
        const rawName = (typeof a === 'object' && a !== null) ? (a.name || '').trim() : String(a || '').trim();
        if (!rawName || rawName === 'My Blog Slice' || rawName === 'sheesh') return;
        const lower = rawName.toLowerCase();
        if (deletedNames.has(lower)) return;

        let canonical = rawName;
        if (canonical === canonical.toLowerCase()) {
          canonical = canonical.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        const isRet = (typeof a === 'object' && a !== null && a.retired) || retiredNames.has(lower);
        const isDef = lower === (defaultAuth || '').trim().toLowerCase();

        if (!authorMap.has(lower)) {
          authorMap.set(lower, {
            name: canonical,
            isRetired: isRet,
            isDefault: isDef
          });
        } else {
          const existing = authorMap.get(lower);
          if (canonical !== lower && existing.name === lower) {
            existing.name = canonical;
          }
          if (isRet) existing.isRetired = true;
          if (isDef) existing.isDefault = true;
        }
      });
    }

    // Canonicalize currentDraft.authors against authorMap
    if (!Array.isArray(currentDraft.authors) || currentDraft.authors.length === 0) {
      const fallback = (currentDraft.authorName && !deletedNames.has(currentDraft.authorName.trim().toLowerCase()))
        ? currentDraft.authorName.trim()
        : defaultAuth;
      currentDraft.authors = fallback ? [fallback] : [];
    }

    currentDraft.authors = currentDraft.authors
      .filter(a => a && a !== 'My Blog Slice' && a !== 'sheesh')
      .map(a => {
        const raw = (typeof a === 'string' ? a : (a?.name || '')).trim();
        if (!raw) return null;
        const lower = raw.toLowerCase();
        if (deletedNames.has(lower)) return null;
        if (authorMap.has(lower)) {
          return authorMap.get(lower).name;
        }
        return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      })
      .filter(Boolean);

    // Deduplicate currentDraft.authors case-insensitively
    const seenDraftAuthors = new Set();
    currentDraft.authors = currentDraft.authors.filter(a => {
      const lower = a.toLowerCase();
      if (seenDraftAuthors.has(lower)) return false;
      seenDraftAuthors.add(lower);
      return true;
    });

    if (currentDraft.authors.length === 0 && defaultAuth) {
      currentDraft.authors = [defaultAuth];
    }

    currentDraft.authorName = (typeof window.formatAuthorsString === 'function')
      ? window.formatAuthorsString(currentDraft.authors)
      : (currentDraft.authors.join(', ') || defaultAuth);
    if (currentDraft.authorName) {
      currentDraft.authorInitial = currentDraft.authorName.charAt(0).toUpperCase();
    }

    // If currentDraft already contains an author not in authorMap (e.g. historical attribution),
    // include them so their existing attribution remains visible without creating duplicate entries
    currentDraft.authors.forEach(a => {
      const lower = a.toLowerCase();
      if (!deletedNames.has(lower) && !authorMap.has(lower)) {
        authorMap.set(lower, {
          name: a,
          isRetired: retiredNames.has(lower),
          isDefault: false
        });
      }
    });

    // Only active (non-retired) authors are offered as choices, UNLESS currentDraft is already attributed to them
    const allAuthors = Array.from(authorMap.values()).filter(item => {
      if (item.isRetired) {
        return currentDraft.authors.some(a => a.toLowerCase() === item.name.toLowerCase());
      }
      return true;
    });

    function updateAuthorSelectedTriggerText() {
      const selectedTextEl = document.getElementById('setup-author-selected-text');
      if (selectedTextEl) {
        if (Array.isArray(currentDraft.authors) && currentDraft.authors.length > 0) {
          selectedTextEl.textContent = currentDraft.authors.join(', ');
          selectedTextEl.classList.remove('placeholder');
        } else if (currentDraft.authorName) {
          selectedTextEl.textContent = currentDraft.authorName;
          selectedTextEl.classList.remove('placeholder');
        } else {
          selectedTextEl.textContent = defaultAuth || 'Select author(s)...';
          if (!defaultAuth) selectedTextEl.classList.add('placeholder');
        }
      }
    }

    if (allAuthors.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'chips-empty';
      emptySpan.textContent = 'No active authors established. Manage authors in Authors tab.';
      container.appendChild(emptySpan);
      updateAuthorSelectedTriggerText();
      return;
    }

    // Default author is ALWAYS at the top of the author choices
    allAuthors.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    allAuthors.forEach((authorItem, idx) => {
      const author = authorItem.name;
      const isRetired = authorItem.isRetired;
      const isSelected = currentDraft.authors.some(a => a.toLowerCase() === author.toLowerCase());
      const label = document.createElement('label');
      label.className = `author-dropdown-item ${isSelected ? 'selected' : ''} ${isRetired ? 'is-retired' : ''}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'setup-author-checkbox';
      cb.id = `setup-author-cb-${idx}`;
      cb.checked = isSelected;

      const avatarSpan = document.createElement('span');
      avatarSpan.className = 'author-dropdown-avatar';
      avatarSpan.textContent = (author.charAt(0) || 'A').toUpperCase();

      const textSpan = document.createElement('span');
      textSpan.className = 'author-dropdown-name';
      textSpan.textContent = isRetired ? `${author} (Retired)` : author;
      if (isRetired) {
        textSpan.title = 'Retired Author';
      } else if (authorItem.isDefault) {
        textSpan.title = 'Default Author (Blog Name)';
      }

      cb.addEventListener('change', () => {
        if (!Array.isArray(currentDraft.authors)) currentDraft.authors = [];

        if (cb.checked) {
          if (!currentDraft.authors.some(a => a.toLowerCase() === author.toLowerCase())) {
            currentDraft.authors.push(author);
          }
          label.classList.add('selected');
        } else {
          currentDraft.authors = currentDraft.authors.filter(a => a.toLowerCase() !== author.toLowerCase());
          label.classList.remove('selected');
        }

        currentDraft.authorName = (typeof window.formatAuthorsString === 'function')
          ? window.formatAuthorsString(currentDraft.authors)
          : (currentDraft.authors.length > 0 ? currentDraft.authors.join(', ') : (defaultAuth || ''));
        currentDraft.authorInitial = (currentDraft.authorName.charAt(0) || 'A').toUpperCase();

        const metaName = document.getElementById('meta-author-name');
        const metaInit = document.getElementById('meta-author-initial');
        if (metaName) metaName.value = currentDraft.authorName;
        if (metaInit) metaInit.value = currentDraft.authorInitial;

        updateAuthorSelectedTriggerText();
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });

      label.appendChild(cb);
      label.appendChild(avatarSpan);
      label.appendChild(textSpan);
      container.appendChild(label);
    });

    updateAuthorSelectedTriggerText();
  }

  let pendingCategoryWarning = null;

  function promptCategoryChangeWarning({ draft, newCategories, newTag, onProceed, onCancel }) {
    const curDraft = draft || window.currentDraft || currentDraft;
    const isPublishedPost = Boolean(
      curDraft &&
      curDraft.type !== 'page' &&
      (curDraft.status === 'published' || curDraft.everPublished || curDraft.publishedAt || curDraft.publishedSlug)
    );
    if (!isPublishedPost) {
      return false;
    }

    // 1. Existing effective URL category:
    // If draft has an explicit permalinkCat, that's what was in its URL.
    // Otherwise, look at draft.tag or draft.categories[0].
    const rawOldCat = (curDraft.permalinkCat !== undefined && curDraft.permalinkCat !== null && String(curDraft.permalinkCat).trim() !== '')
      ? String(curDraft.permalinkCat).trim()
      : ((curDraft.tag || (Array.isArray(curDraft.categories) && curDraft.categories[0]) || '').trim());

    const normOld = (!rawOldCat || rawOldCat.toLowerCase() === 'uncategorized' || rawOldCat.toLowerCase() === 'posts')
      ? 'uncategorized'
      : rawOldCat;

    // 2. Target category:
    const rawNewCat = (newTag !== undefined && newTag !== null)
      ? String(newTag).trim()
      : ((Array.isArray(newCategories) && newCategories.length > 0) ? String(newCategories[0]).trim() : '');

    const normNew = (!rawNewCat || rawNewCat.toLowerCase() === 'uncategorized' || rawNewCat.toLowerCase() === 'posts')
      ? 'uncategorized'
      : rawNewCat;

    // 3. Compare slugified categories:
    const slugOld = normOld.toLowerCase().replace(/\s+/g, '-');
    const slugNew = normNew.toLowerCase().replace(/\s+/g, '-');

    if (slugOld === slugNew) {
      return false;
    }

    const modal = document.getElementById('modal-category-warning');
    if (!modal) return false;

    // Ensure handlers are attached
    if (typeof setupCategoryWarningModalHandlers === 'function') {
      setupCategoryWarningModalHandlers();
    }

    const postSlug = curDraft.slug || 'post';
    const curUrlEl = document.getElementById('cat-warn-current-url');
    const newUrlEl = document.getElementById('cat-warn-new-url');
    if (curUrlEl) curUrlEl.textContent = `/${slugOld}/${postSlug}/`;
    if (newUrlEl) newUrlEl.textContent = `/${slugNew}/${postSlug}/`;

    pendingCategoryWarning = {
      draft: curDraft,
      newCategories: Array.isArray(newCategories) ? [...newCategories] : (rawNewCat ? [rawNewCat] : []),
      newTag: rawNewCat,
      oldCat: normOld,
      newCat: normNew,
      onProceed,
      onCancel
    };

    modal.style.display = 'flex';
    modal.classList.add('active');
    return true;
  }
  window.promptCategoryChangeWarning = promptCategoryChangeWarning;

  function setupCategoryWarningModalHandlers() {
    const modal = document.getElementById('modal-category-warning');
    if (!modal || modal.dataset.catWarnAttached) return;
    modal.dataset.catWarnAttached = 'true';

    const btnCancel = document.getElementById('btn-cat-warn-cancel');
    const btnClose = document.getElementById('btn-close-cat-warn-modal');
    const btnKeep = document.getElementById('btn-cat-warn-keep');
    const btnChange = document.getElementById('btn-cat-warn-change');

    function closeCatWarn() {
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
      }
    }

    function doCancel() {
      const pending = pendingCategoryWarning;
      pendingCategoryWarning = null;
      closeCatWarn();
      if (pending && typeof pending.onCancel === 'function') {
        pending.onCancel();
      }
    }

    function doKeepUrl() {
      const pending = pendingCategoryWarning;
      pendingCategoryWarning = null;
      closeCatWarn();
      if (pending) {
        // Keep old category in permalinkCat so existing links don't break!
        pending.draft.permalinkCat = pending.oldCat;
        if (typeof pending.onProceed === 'function') {
          pending.onProceed({ keepUrl: true, oldCat: pending.oldCat });
        }
        if (typeof showToast === 'function') {
          showToast('✓ Category updated · Existing URL preserved');
        }
      }
    }

    function doChangeUrl() {
      const pending = pendingCategoryWarning;
      pendingCategoryWarning = null;
      closeCatWarn();
      if (pending) {
        // Update permalinkCat with new category so new URL is generated!
        pending.draft.permalinkCat = pending.newCat;
        if (typeof pending.onProceed === 'function') {
          pending.onProceed({ keepUrl: false, newCat: pending.newCat });
        }
        if (typeof showToast === 'function') {
          showToast('✓ Category & URL updated');
        }
      }
    }

    if (btnCancel) btnCancel.addEventListener('click', doCancel);
    if (btnClose) btnClose.addEventListener('click', doCancel);
    if (btnKeep) btnKeep.addEventListener('click', doKeepUrl);
    if (btnChange) btnChange.addEventListener('click', doChangeUrl);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) doCancel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none' && modal.style.display) {
        doCancel();
      }
    });
  }
  window.setupCategoryWarningModalHandlers = setupCategoryWarningModalHandlers;

  function updateCategorySelectedTriggerText() {
    const selectedTextEl = document.getElementById('setup-category-selected-text');
    if (!selectedTextEl) return;
    const curDraft = window.currentDraft || (typeof currentDraft !== 'undefined' ? currentDraft : null);
    if (!curDraft) return;
    if ((!Array.isArray(curDraft.categories) || curDraft.categories.length === 0) && curDraft.tag) {
      curDraft.categories = [curDraft.tag];
    }
    if (curDraft && Array.isArray(curDraft.categories) && curDraft.categories.length > 0) {
      selectedTextEl.textContent = curDraft.categories.join(', ');
      selectedTextEl.classList.remove('placeholder');
    } else {
      selectedTextEl.textContent = 'Select category...';
      selectedTextEl.classList.add('placeholder');
    }
  }

  function renderSetupCategoryChips() {
    const container = document.getElementById('setup-category-chips');
    const curDraft = window.currentDraft || (typeof currentDraft !== 'undefined' ? currentDraft : null);
    if (!container || !curDraft) return;

    const pConfig = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
    if (pConfig && !Array.isArray(pConfig.categories)) {
      pConfig.categories = [];
    }

    const forbiddenLower = new Set(['uncategorized', 'posts', 'all', 'all posts']);

    // Ensure categories from curDraft, category aggregate pages, and existing drafts are preserved
    if (pConfig && Array.isArray(pConfig.categories)) {
      const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
      draftsList.forEach(d => {
        if (!d) return;
        if (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) {
          const cName = String(d.categoryAggregate || d.title || '').trim();
          if (cName && !forbiddenLower.has(cName.toLowerCase()) && !pConfig.categories.some(c => String(c).trim().toLowerCase() === cName.toLowerCase())) {
            pConfig.categories.push(cName);
          }
        }
        if (d.tag && typeof d.tag === 'string' && d.tag.trim()) {
          const t = d.tag.trim();
          if (!forbiddenLower.has(t.toLowerCase()) && !pConfig.categories.some(c => String(c).trim().toLowerCase() === t.toLowerCase())) {
            pConfig.categories.push(t);
          }
        }
        if (Array.isArray(d.categories)) {
          d.categories.forEach(c => {
            const catStr = String(c || '').trim();
            if (catStr && !forbiddenLower.has(catStr.toLowerCase()) && !pConfig.categories.some(x => String(x).trim().toLowerCase() === catStr.toLowerCase())) {
              pConfig.categories.push(catStr);
            }
          });
        }
      });

      // Explicitly preserve curDraft's categories and tag
      if (curDraft.tag && typeof curDraft.tag === 'string' && curDraft.tag.trim()) {
        const t = curDraft.tag.trim();
        if (!forbiddenLower.has(t.toLowerCase()) && !pConfig.categories.some(c => String(c).trim().toLowerCase() === t.toLowerCase())) {
          pConfig.categories.push(t);
        }
      }
      if (Array.isArray(curDraft.categories)) {
        curDraft.categories.forEach(c => {
          const catStr = String(c || '').trim();
          if (catStr && !forbiddenLower.has(catStr.toLowerCase()) && !pConfig.categories.some(x => String(x).trim().toLowerCase() === catStr.toLowerCase())) {
            pConfig.categories.push(catStr);
          }
        });
      }
    }

    const createdCategories = (pConfig && Array.isArray(pConfig.categories))
      ? pConfig.categories.filter(c => c && !forbiddenLower.has(c.trim().toLowerCase()))
      : [];

    if (!Array.isArray(curDraft.categories)) {
      curDraft.categories = (curDraft.tag && curDraft.tag.trim()) ? [curDraft.tag.trim()] : [];
    }

    // Preserve valid curDraft categories, syncing case with createdCategories
    curDraft.categories = curDraft.categories.map(c => {
      const match = createdCategories.find(valid => valid.toLowerCase() === String(c || '').trim().toLowerCase());
      return match || c;
    }).filter(c => c && !forbiddenLower.has(String(c).trim().toLowerCase()));

    // If curDraft has a tag not in curDraft.categories, include it
    if (curDraft.tag && curDraft.tag.trim() && !forbiddenLower.has(curDraft.tag.trim().toLowerCase())) {
      const tNorm = curDraft.tag.trim().toLowerCase();
      if (!curDraft.categories.some(c => c.toLowerCase() === tNorm)) {
        const match = createdCategories.find(valid => valid.toLowerCase() === tNorm);
        curDraft.categories.push(match || curDraft.tag.trim());
      }
    }

    curDraft.tag = curDraft.categories.length > 0 ? curDraft.categories[0] : '';

    container.innerHTML = '';

    if (createdCategories.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'chips-empty';
      emptySpan.textContent = 'No categories created yet.';
      container.appendChild(emptySpan);
      updateCategorySelectedTriggerText();
      return;
    }

    createdCategories.forEach((cat, idx) => {
      const isSelected = curDraft.categories.some(c => c.toLowerCase() === cat.toLowerCase());
      const label = document.createElement('label');
      label.className = `category-dropdown-item ${isSelected ? 'selected' : ''}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'category-checkbox';
      cb.id = `setup-category-cb-${idx}`;
      cb.dataset.category = cat;
      cb.checked = isSelected;

      const textSpan = document.createElement('span');
      textSpan.className = 'category-dropdown-name';
      textSpan.textContent = cat;

      cb.addEventListener('change', () => {
        const activeDraft = window.currentDraft || currentDraft;
        if (!activeDraft) return;

        const prevCategories = Array.isArray(activeDraft.categories) ? [...activeDraft.categories] : [];
        const prevTag = activeDraft.tag || (prevCategories.length > 0 ? prevCategories[0] : '');

        let nextCategories = [...prevCategories];
        if (cb.checked) {
          if (!nextCategories.some(c => c.toLowerCase() === cat.toLowerCase())) {
            nextCategories.push(cat);
          }
        } else {
          nextCategories = nextCategories.filter(c => c.toLowerCase() !== cat.toLowerCase());
        }
        const nextTag = nextCategories.length > 0 ? nextCategories[0] : '';

        const applyCheckboxChange = () => {
          activeDraft.categories = nextCategories;
          activeDraft.tag = nextTag;
          activeDraft.permalinkCat = nextTag || 'uncategorized';
          activeDraft._categoryPromptAnswered = true;
          activeDraft.updatedAt = Date.now();
          if (typeof currentDraft !== 'undefined' && currentDraft && currentDraft.id === activeDraft.id) {
            currentDraft.categories = nextCategories;
            currentDraft.tag = nextTag;
            currentDraft.permalinkCat = activeDraft.permalinkCat;
            currentDraft._categoryPromptAnswered = true;
            currentDraft.updatedAt = activeDraft.updatedAt;
          }
          if (Array.isArray(window.drafts)) {
            const matched = window.drafts.find(d => d && d.id === activeDraft.id);
            if (matched) {
              matched.categories = nextCategories;
              matched.tag = nextTag;
              matched.permalinkCat = activeDraft.permalinkCat;
              matched.updatedAt = activeDraft.updatedAt;
            }
          }

          if (cb.checked) {
            label.classList.add('selected');
          } else {
            label.classList.remove('selected');
          }

          if (typeof window.updateCategorySelectUI === 'function') {
            window.updateCategorySelectUI();
          }
          if (typeof window.updateWorkspaceUrlPrefix === 'function') {
            window.updateWorkspaceUrlPrefix();
          }

          updateCategorySelectedTriggerText();
          updateVisualCardPreviews();
          updateBackgroundCodeStrings();
          if (typeof saveDraftsToStorage === 'function') {
            saveDraftsToStorage();
          }
          if (typeof scheduleAutosave === 'function') {
            scheduleAutosave();
          }
          if (typeof window.syncCategoryAggregatePages === 'function') {
            window.syncCategoryAggregatePages();
          }
        };

        const warned = promptCategoryChangeWarning({
          draft: activeDraft,
          newCategories: nextCategories,
          newTag: nextTag,
          onProceed: () => {
            applyCheckboxChange();
          },
          onCancel: () => {
            cb.checked = !cb.checked;
            if (cb.checked) {
              label.classList.add('selected');
            } else {
              label.classList.remove('selected');
            }
            activeDraft.categories = prevCategories;
            activeDraft.tag = prevTag;
            updateCategorySelectedTriggerText();
          }
        });

        if (!warned) {
          applyCheckboxChange();
        }
      });

      label.appendChild(cb);
      label.appendChild(textSpan);
      container.appendChild(label);
    });

    updateCategorySelectedTriggerText();
  }

  function renderSetupFeaturedImage() {
    const imgEl = document.getElementById('setup-featured-img');
    const emptyEl = document.getElementById('setup-featured-img-empty');
    const badgeEl = document.getElementById('setup-featured-img-badge');
    const btnEdit = document.getElementById('btn-open-crop-modal');
    const btnRemove = document.getElementById('btn-remove-featured-img');
    const cycleCountEl = document.getElementById('featured-img-cycle-count');
    const btnPrev = document.getElementById('btn-cycle-prev-img');
    const btnNext = document.getElementById('btn-cycle-next-img');
    if (!imgEl || !emptyEl || !currentDraft) return;

    const availableImages = getDraftAvailableImages(currentDraft);
    const totalCount = availableImages.length;

    // Auto-select first image if no cover image is set and hasn't been explicitly removed (posts only)
    if (currentDraft.type === 'page') {
      currentDraft.coverImage = '';
    } else if (totalCount > 0) {
      if (!currentDraft.coverImage && !currentDraft.coverImageRemoved) {
        currentDraft.coverImage = availableImages[0];
      } else if (currentDraft.coverImage) {
        const coverBase = getImageBaseFilename(currentDraft.coverImage).toLowerCase();
        const existsInAvailable = availableImages.some(u => {
          if (u.toLowerCase() === currentDraft.coverImage.toLowerCase()) return true;
          if (coverBase && getImageBaseFilename(u).toLowerCase() === coverBase) return true;
          return false;
        });
        if (!existsInAvailable) {
          currentDraft.coverImage = currentDraft.coverImageRemoved ? '' : availableImages[0];
        }
      }
    } else {
      currentDraft.coverImage = '';
    }

    const cover = (currentDraft.coverImage || '').trim();
    const hasImage = Boolean(cover);

    const metaCover = document.getElementById('meta-cover-image');
    if (metaCover) {
      metaCover.value = cover;
    }

    const btnReset = document.getElementById('btn-reset-featured-img');
    if (btnReset) {
      btnReset.disabled = totalCount === 0;
      btnReset.style.opacity = totalCount > 0 ? '1' : '0.45';
      btnReset.style.cursor = totalCount > 0 ? 'pointer' : 'not-allowed';
    }

    if (btnEdit) {
      btnEdit.disabled = !hasImage;
      btnEdit.style.opacity = hasImage ? '1' : '0.45';
      btnEdit.style.cursor = hasImage ? 'pointer' : 'not-allowed';
    }
    if (btnRemove) {
      btnRemove.disabled = !hasImage;
      btnRemove.style.opacity = hasImage ? '1' : '0.45';
      btnRemove.style.cursor = hasImage ? 'pointer' : 'not-allowed';
    }

    // Determine current index in available images
    let currentIndex = -1;
    if (hasImage) {
      const coverBase = getImageBaseFilename(cover).toLowerCase();
      currentIndex = availableImages.findIndex(u => {
        if (u.toLowerCase() === cover.toLowerCase()) return true;
        if (coverBase && getImageBaseFilename(u).toLowerCase() === coverBase) return true;
        return false;
      });
    }

    if (cycleCountEl) {
      if (totalCount === 0) {
        cycleCountEl.textContent = '(0/0)';
      } else if (!hasImage) {
        cycleCountEl.textContent = `(—/${totalCount})`;
      } else if (currentIndex !== -1) {
        cycleCountEl.textContent = `(${currentIndex + 1}/${totalCount})`;
      } else {
        cycleCountEl.textContent = `(1/${totalCount})`;
      }
    }

    const canCycle = totalCount > 1;
    if (btnPrev) {
      btnPrev.disabled = !canCycle;
    }
    if (btnNext) {
      btnNext.disabled = !canCycle;
    }

    if (hasImage) {
      const displaySrc = resolveImageDisplayUrl(cover, currentDraft);
      imgEl.onerror = () => {
        imgEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
      };
      imgEl.onload = () => {
        imgEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
      };
      imgEl.src = displaySrc;
      imgEl.style.display = 'block';
      emptyEl.style.display = 'none';
      if (badgeEl) badgeEl.style.display = 'none';
    } else {
      imgEl.src = '';
      imgEl.style.display = 'none';
      emptyEl.style.display = 'flex';
      if (badgeEl) badgeEl.style.display = 'none';
    }
  }

  function cycleDraftFeaturedImage(direction) {
    if (!currentDraft) return;
    const available = getDraftAvailableImages(currentDraft);
    if (available.length === 0) return;

    const cover = (currentDraft.coverImage || '').trim();
    const coverBase = getImageBaseFilename(cover).toLowerCase();
    let idx = available.findIndex(u => {
      if (u.toLowerCase() === cover.toLowerCase()) return true;
      if (coverBase && getImageBaseFilename(u).toLowerCase() === coverBase) return true;
      return false;
    });

    if (idx === -1) {
      idx = direction > 0 ? 0 : available.length - 1;
    } else {
      idx = (idx + direction + available.length) % available.length;
    }

    currentDraft.coverImage = available[idx];
    currentDraft.coverImageRemoved = false;
    currentDraft.coverImageOriginal = '';

    renderSetupFeaturedImage();
    updateVisualCardPreviews();
    updateBackgroundCodeStrings();
    if (typeof updateCoverPreview === 'function') updateCoverPreview();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
  }

  function resetDraftFeaturedImage() {
    if (!currentDraft) return;
    const available = getDraftAvailableImages(currentDraft);
    if (available.length > 0) {
      currentDraft.coverImage = available[0];
      currentDraft.coverImageRemoved = false;
      currentDraft.coverImageOriginal = '';
      if (typeof showToast === 'function') showToast('Reset to 1st image');
    } else {
      currentDraft.coverImage = '';
      currentDraft.coverImageRemoved = false;
      currentDraft.coverImageOriginal = '';
      if (typeof showToast === 'function') showToast('No images available', 'info');
    }

    renderSetupFeaturedImage();
    updateVisualCardPreviews();
    updateBackgroundCodeStrings();
    if (typeof updateCoverPreview === 'function') updateCoverPreview();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
  }

  // =========================================================================
  // FEATURED IMAGE FULLSCREEN LIGHTBOX / SELECTOR
  // =========================================================================
  let lightboxState = {
    isOpen: false,
    originalCover: '',
    images: [],
    activeIndex: 0
  };

  function openFeaturedImgLightbox() {
    if (!currentDraft) return;
    const available = getDraftAvailableImages(currentDraft);
    if (available.length === 0) {
      if (typeof showToast === 'function') {
        showToast('No images available in this draft yet.', 'info');
      }
      return;
    }

    const currentCover = (currentDraft.coverImage || '').trim();
    const coverBase = getImageBaseFilename(currentCover).toLowerCase();
    let idx = available.findIndex(u => {
      if (u.toLowerCase() === currentCover.toLowerCase()) return true;
      if (coverBase && getImageBaseFilename(u).toLowerCase() === coverBase) return true;
      return false;
    });
    if (idx === -1) idx = 0;

    lightboxState = {
      isOpen: true,
      originalCover: currentCover,
      images: available,
      activeIndex: idx
    };

    renderLightboxContent();

    const overlay = document.getElementById('modal-featured-img-lightbox');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.classList.add('active');
    }
  }

  function renderLightboxContent() {
    const imgEl = document.getElementById('lightbox-img-el');
    const countEl = document.getElementById('lightbox-cycle-count');
    const prevBtn = document.getElementById('lightbox-btn-prev');
    const nextBtn = document.getElementById('lightbox-btn-next');

    if (!lightboxState.images.length) return;

    const total = lightboxState.images.length;
    lightboxState.activeIndex = (lightboxState.activeIndex + total) % total;

    const currentImgSrc = lightboxState.images[lightboxState.activeIndex];
    const displaySrc = resolveImageDisplayUrl(currentImgSrc, currentDraft);

    if (imgEl) {
      imgEl.onerror = () => {
        imgEl.style.opacity = '0';
      };
      imgEl.onload = () => {
        imgEl.style.opacity = '1';
      };
      imgEl.src = displaySrc;
      imgEl.alt = getImageBaseFilename(currentImgSrc) || `Image ${lightboxState.activeIndex + 1}`;
    }
    if (countEl) {
      countEl.textContent = `${lightboxState.activeIndex + 1} / ${total}`;
    }

    const canCycle = total > 1;
    if (prevBtn) prevBtn.disabled = !canCycle;
    if (nextBtn) nextBtn.disabled = !canCycle;
  }

  function cycleLightbox(direction) {
    if (!lightboxState.isOpen || lightboxState.images.length <= 1) return;
    lightboxState.activeIndex = (lightboxState.activeIndex + direction + lightboxState.images.length) % lightboxState.images.length;
    renderLightboxContent();
  }

  function confirmLightboxImage() {
    if (!lightboxState.isOpen) return;
    if (lightboxState.images.length > 0 && currentDraft) {
      const selected = lightboxState.images[lightboxState.activeIndex];
      currentDraft.coverImage = selected;
      currentDraft.coverImageRemoved = false;
      currentDraft.coverImageOriginal = '';
      renderSetupFeaturedImage();
      updateVisualCardPreviews();
      updateBackgroundCodeStrings();
      if (typeof updateCoverPreview === 'function') updateCoverPreview();
      if (typeof scheduleAutosave === 'function') scheduleAutosave();
      if (typeof showToast === 'function') showToast('Featured image updated');
    }
    closeLightboxOverlay();
  }

  function cancelLightboxImage() {
    if (!lightboxState.isOpen) return;
    if (currentDraft) {
      currentDraft.coverImage = lightboxState.originalCover;
      renderSetupFeaturedImage();
    }
    closeLightboxOverlay();
  }

  function closeLightboxOverlay() {
    lightboxState.isOpen = false;
    const overlay = document.getElementById('modal-featured-img-lightbox');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.classList.remove('active');
    }
  }

  function updateVisualCardPreviews() {
    if (!currentDraft) return;
    // 1. Blog Feed Card
    const blogCardContainer = document.getElementById('export-preview-blog-card');
    if (blogCardContainer) {
      blogCardContainer.innerHTML = generateBlogCardHtml(currentDraft);
      blogCardContainer.querySelectorAll('img').forEach(img => {
        const s = img.getAttribute('src');
        if (s) {
          img.src = resolveImageDisplayUrl(s, currentDraft);
        }
      });
      blogCardContainer.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', (e) => e.preventDefault());
      });
    }

    // 2. Featured Banner
    const featuredCardContainer = document.getElementById('export-preview-featured-card');
    if (featuredCardContainer) {
      featuredCardContainer.innerHTML = generateFeaturedCardHtml(currentDraft);
      featuredCardContainer.querySelectorAll('img').forEach(img => {
        const s = img.getAttribute('src');
        if (s) {
          img.src = resolveImageDisplayUrl(s, currentDraft);
        }
      });
      featuredCardContainer.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', (e) => e.preventDefault());
      });
    }
  }

  function updateBackgroundCodeStrings() {
    if (!currentDraft) return;
    const fullHtml = generateFullHtml(currentDraft);
    const blogCardHtml = generateBlogCardHtml(currentDraft);
    const featuredCardHtml = generateFeaturedCardHtml(currentDraft);
    const mdWithFrontmatter = generateMarkdownWithFrontmatter(currentDraft);
    const jsonDraft = JSON.stringify(currentDraft, null, 2);

    const htmlCode = document.getElementById('export-html-code');
    const blogCardCode = document.getElementById('export-blog-card-code');
    const blogCardCode2 = document.getElementById('export-blog-card-code-2');
    const featuredCardCode = document.getElementById('export-featured-card-code');
    const featuredCardCode2 = document.getElementById('export-featured-card-code-2');
    const mdCode = document.getElementById('export-markdown-code');
    const jsonCode = document.getElementById('export-json-code');

    if (htmlCode) htmlCode.textContent = fullHtml;
    if (blogCardCode) blogCardCode.textContent = blogCardHtml;
    if (blogCardCode2) blogCardCode2.textContent = blogCardHtml;
    if (featuredCardCode) featuredCardCode.textContent = featuredCardHtml;
    if (featuredCardCode2) featuredCardCode2.textContent = featuredCardHtml;
    if (mdCode) mdCode.textContent = mdWithFrontmatter;
    if (jsonCode) jsonCode.textContent = jsonDraft;
  }

  function showPublishMenu(menuName) {
    const panelSetup = document.getElementById('tab-publish-setup');
    const panelCode = document.getElementById('tab-code-export');
    const btnClose = document.getElementById('btn-export-close');
    const btnBack = document.getElementById('btn-export-back');
    const modalTitle = document.getElementById('export-modal-title');
    const modalDesc = document.getElementById('export-modal-desc');

    if (menuName === 'code') {
      if (panelSetup) {
        panelSetup.classList.remove('active');
        panelSetup.style.display = 'none';
      }
      if (panelCode) {
        panelCode.classList.add('active');
        panelCode.style.display = 'flex';
      }
      if (btnClose) btnClose.style.display = 'none';
      if (btnBack) btnBack.style.display = 'inline-flex';
      if (modalTitle) modalTitle.textContent = 'Code Formats';
      if (modalDesc) modalDesc.textContent = 'All raw code snippets, generated standalone files, and machine-readable backups.';
    } else {
      if (panelSetup) {
        panelSetup.classList.add('active');
        panelSetup.style.display = 'flex';
      }
      if (panelCode) {
        panelCode.classList.remove('active');
        panelCode.style.display = 'none';
      }
      if (btnClose) {
        const isPage = window.currentDraft && window.currentDraft.type === 'page';
        btnClose.style.display = isPage ? 'none' : 'inline-flex';
      }
      if (btnBack) btnBack.style.display = 'none';
      if (modalTitle) modalTitle.textContent = 'Publish Setup';
      if (modalDesc) modalDesc.textContent = '';
    }
  }

  function autoResizeSetupTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    const isSub = (el.id === 'setup-post-subtitle');
    const minH = isSub ? 52 : 56;
    const computedH = el.scrollHeight > 0 ? (el.scrollHeight + 2) : minH;
    const newHeight = Math.max(minH, computedH);
    el.style.height = newHeight + 'px';
  }

  function updateUrlPreviewDisplay(slug) {
    const domainEl = document.getElementById('url-preview-domain');
    const slugEl = document.getElementById('url-preview-slug');
    
    let domain = '';
    if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.domain) {
      domain = projectConfig.domain;
    } else if (typeof STORAGE_KEY_DOMAIN !== 'undefined' && localStorage.getItem(STORAGE_KEY_DOMAIN)) {
      domain = localStorage.getItem(STORAGE_KEY_DOMAIN);
    }
    domain = (domain || '').trim();
    if (!domain) domain = 'yourdomain.com';
    domain = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    const activeSlug = (slug !== undefined && slug !== null && String(slug).trim() !== '') ? String(slug).trim() : ((currentDraft && currentDraft.slug) || 'my-awesome-post');

    if (domainEl) domainEl.textContent = domain;
    if (slugEl) slugEl.textContent = activeSlug;
  }

  function prepareExportModal() {
    if (!currentDraft) return;
    if (typeof window.reconcileDraftImages === 'function') {
      window.reconcileDraftImages(currentDraft);
    }
    syncFormToDraft();
    showPublishMenu('setup');

    if (currentDraft && currentDraft.status === 'published') {
      currentDraft._categoryPromptAnswered = false;
    }

    // 1. Auto-detect featured image if none set, or reset if current was deleted
    const available = getDraftAvailableImages(currentDraft);
    const autoImg = available.length > 0 ? available[0] : '';
    if (!currentDraft.coverImage || currentDraft.coverImage.trim() === '') {
      if (autoImg && !currentDraft.coverImageRemoved) {
        currentDraft.coverImage = autoImg;
        if (typeof updateCoverPreview === 'function') updateCoverPreview();
      }
    } else {
      const coverBase = getImageBaseFilename(currentDraft.coverImage).toLowerCase();
      const existsInAvailable = available.some(u => {
        if (u.toLowerCase() === currentDraft.coverImage.toLowerCase()) return true;
        if (coverBase && getImageBaseFilename(u).toLowerCase() === coverBase) return true;
        return false;
      });
      if (!existsInAvailable) {
        currentDraft.coverImage = (!currentDraft.coverImageRemoved && autoImg) ? autoImg : '';
        if (typeof updateCoverPreview === 'function') updateCoverPreview();
      }
    }

    // 2. Post Title & Subtitle
    const titleInput = document.getElementById('setup-post-title');
    if (titleInput) {
      titleInput.value = currentDraft.title || '';
      autoResizeSetupTextarea(titleInput);
    }

    const subtitleInput = document.getElementById('setup-post-subtitle');
    if (subtitleInput) {
      subtitleInput.value = currentDraft.subtitle || '';
      autoResizeSetupTextarea(subtitleInput);
    }

    // Canonical Slug & Date
    const defaultSlugPlaceholder = currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
    const isUntitledSlug = !currentDraft.slug || currentDraft.slug === 'untitled-post' || currentDraft.slug === 'untitled-page' || currentDraft.slug === 'untitled-article';
    const shouldAutoSync = (typeof window.shouldAutoSyncSlugFromTitle === 'function')
      ? window.shouldAutoSyncSlugFromTitle(currentDraft)
      : (!currentDraft.everPublished && currentDraft.status !== 'published' && !currentDraft.slugManuallyEdited);
    if ((shouldAutoSync || isUntitledSlug) && currentDraft.title && currentDraft.title.trim()) {
      if (typeof window.generateSlug === 'function') {
        const gen = window.generateSlug(currentDraft.title.trim(), defaultSlugPlaceholder, 30);
        if (gen && gen !== 'untitled-page' && gen !== 'untitled-post') {
          currentDraft.slug = gen;
        }
      }
    }
    const slug = currentDraft.slug || defaultSlugPlaceholder;
    const slugInput = document.getElementById('setup-post-slug');
    if (slugInput) {
      slugInput.value = currentDraft.slug || '';
      slugInput.dataset.confirmedSlug = currentDraft.slug || '';
    }

    const isPublished = currentDraft.status === 'published';
    if (isPublished) {
      currentDraft.everPublished = true;
      if (!currentDraft.publishedSlug && currentDraft.slug) {
        currentDraft.publishedSlug = currentDraft.slug;
      }
    }
    const localToday = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');

    if (!isPublished) {
      currentDraft.publishedDate = null;
      currentDraft.publishedAt = null;
      currentDraft.editedDate = null;
      currentDraft.editedAt = null;
      currentDraft.hasUnpublishedEdits = false;
      if (!currentDraft.publishDateUserSet) {
        currentDraft.date = localToday;
      }
    } else {
      // If published, heal pubDate and editedDate if backdated or edited after pubDate
      const pubDate = currentDraft.publishedDate || currentDraft.date;
      const lastModDate = (typeof getLocalIsoDate === 'function')
        ? getLocalIsoDate(currentDraft.updatedAt || Date.now())
        : localToday;
      if (pubDate && pubDate < localToday) {
        // Backdated post! Since it was worked on / published today after pubDate, editedDate is today (or lastModDate)
        if (!currentDraft.editedDate || currentDraft.editedDate < lastModDate) {
          currentDraft.editedDate = lastModDate;
          currentDraft.editedAt = currentDraft.updatedAt || Date.now();
        }
      }
    }

    const dateInput = document.getElementById('setup-post-date');
    if (dateInput) {
      dateInput.value = currentDraft.date || localToday;
      currentDraft.date = dateInput.value;
      if (isPublished) {
        currentDraft.publishedDate = currentDraft.date;
      }
    }

    function formatNumericDate(val) {
      if (!val) return '';
      const str = String(val).trim();
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        return `${m[2]}/${m[3]}/${m[1]}`;
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const tz = (typeof getAppTimezone === 'function') ? getAppTimezone() : 'America/Chicago';
        const iso = d.toLocaleDateString('en-CA', { timeZone: tz });
        const parts = iso.split('-');
        if (parts.length === 3) {
          return `${parts[1]}/${parts[2]}/${parts[0]}`;
        }
      }
      return String(val);
    }

    // Edited meta badge in line with Publish Date header
    const pillEdit = document.getElementById('pill-edited-on');
    const valEdit = document.getElementById('val-edited-on');
    if (pillEdit) {
      const pubDate = currentDraft.publishedDate || currentDraft.date;
      if (isPublished && currentDraft.editedDate && currentDraft.editedDate !== pubDate && valEdit) {
        valEdit.textContent = formatNumericDate(currentDraft.editedDate);
        pillEdit.style.display = 'inline-flex';
      } else {
        pillEdit.style.display = 'none';
      }
    }

    updateUrlPreviewDisplay(slug);

    const targetPath = document.getElementById('export-target-path');
    if (targetPath) targetPath.textContent = `blog/${slug}/index.html`;

    const targetPathCard = document.getElementById('export-target-path-card');
    if (targetPathCard) targetPathCard.textContent = `blog/${slug}/index.html`;

    const md = currentDraft.markdown || '';
    const stats = (typeof window.getCleanProseStats === 'function')
      ? window.getCleanProseStats(md, false)
      : { words: md.trim().split(/\s+/).filter(w => w.length > 0).length, chars: md.length };

    let totalExportWords = stats.words;
    let totalExportChars = stats.chars;
    if (currentDraft.title && currentDraft.title.trim()) {
      const tStats = (typeof window.getCleanProseStats === 'function')
        ? window.getCleanProseStats(currentDraft.title, false)
        : { words: currentDraft.title.trim().split(/\s+/).filter(Boolean).length, chars: currentDraft.title.length };
      totalExportWords += tStats.words;
      totalExportChars += tStats.chars;
    }
    if (currentDraft.subtitle && currentDraft.subtitle.trim()) {
      const sStats = (typeof window.getCleanProseStats === 'function')
        ? window.getCleanProseStats(currentDraft.subtitle, false)
        : { words: currentDraft.subtitle.trim().split(/\s+/).filter(Boolean).length, chars: currentDraft.subtitle.length };
      totalExportWords += sStats.words;
      totalExportChars += sStats.chars;
    }

    const readTime = (typeof window.calculateReadTime === 'function')
      ? window.calculateReadTime(md, currentDraft.overrideReadTime, false)
      : calculateReadTime(md, currentDraft.overrideReadTime);
    const isPage = currentDraft && currentDraft.type === 'page';
    const statsBadge = document.getElementById('export-badge-stats');
    if (statsBadge) {
      if (isPage) {
        statsBadge.style.display = 'none';
      } else {
        statsBadge.style.display = 'inline-block';
        statsBadge.textContent = `${readTime} · ${totalExportWords.toLocaleString()} words · ${totalExportChars.toLocaleString()} characters`;
      }
    }

    // 3. Attribute Credits Checkboxes
    renderSetupAuthorChips();

    // 4. SEO Keywords / Tags
    const keywordsInput = document.getElementById('setup-seo-keywords');
    if (keywordsInput) keywordsInput.value = currentDraft.keywords || '';

    // 5. Categories Multi-Assignment
    if (!Array.isArray(currentDraft.categories)) {
      currentDraft.categories = currentDraft.tag ? [currentDraft.tag] : [];
    }
    renderSetupCategoryChips();

    // 6. Featured Image Studio (1280 x 720)
    renderSetupFeaturedImage();

    // 7. Adjacent Post Links
    const prevTitle = document.getElementById('setup-nav-prev-title');
    const prevSlug = document.getElementById('setup-nav-prev-slug');
    const nextTitle = document.getElementById('setup-nav-next-title');
    const nextSlug = document.getElementById('setup-nav-next-slug');
    if (prevTitle) prevTitle.value = currentDraft.navPrevTitle || '';
    if (prevSlug) prevSlug.value = currentDraft.navPrevSlug || '';
    if (nextTitle) nextTitle.value = currentDraft.navNextTitle || '';
    if (nextSlug) nextSlug.value = currentDraft.navNextSlug || '';

    // 8. Advanced SEO & Overrides
    const overrideReadTime = document.getElementById('setup-meta-override-readtime');
    const customDesc = document.getElementById('setup-meta-custom-desc');
    if (overrideReadTime) overrideReadTime.value = currentDraft.overrideReadTime || '';
    if (customDesc) customDesc.value = currentDraft.customDesc || '';

    // 9. Post / Page Settings Heading and Publish button labels
    const isBuiltIn = typeof window.isBuiltInPage === 'function'
      ? window.isBuiltInPage(currentDraft)
      : (function(p) {
          if (!p) return false;
          const id = (p.id || '').trim().toLowerCase();
          const slug = (p.slug || '').trim().toLowerCase();
          const title = (p.title || '').trim().toLowerCase();
          return id === 'page_rss' || id === 'page_about' || id === 'page_about_cedar' || id === 'page_links' || id === 'page_all' ||
                 slug === 'rss' || slug === 'about' || slug === 'about-cedar' || slug === 'links' || slug === 'all' ||
                 title === 'rss' || title === 'about' || title === 'about cedar' || title === 'links' || title === 'all';
        })(currentDraft);

    const exportCard = document.querySelector('.modal-export-card');
    const exportOverlay = document.getElementById('modal-export');
    if (exportCard) {
      exportCard.classList.toggle('is-page-settings', isPage);
      exportCard.classList.toggle('is-builtin-page', Boolean(isPage && isBuiltIn));
    }
    if (exportOverlay) {
      exportOverlay.classList.toggle('is-page-settings', isPage);
      exportOverlay.classList.toggle('is-builtin-page', Boolean(isPage && isBuiltIn));
    }

    const featuredImgGroup = document.getElementById('setup-featured-img-group') || document.querySelector('.setup-featured-img-group');
    if (featuredImgGroup) featuredImgGroup.style.display = isPage ? 'none' : '';

    const categoryGroup = document.getElementById('setup-category-group') || document.querySelector('.setup-category-group');
    if (categoryGroup) categoryGroup.style.display = (isPage && isBuiltIn) ? 'none' : '';

    const pageVisibilityGroup = document.getElementById('setup-page-visibility-group') || document.querySelector('.setup-page-visibility-group');
    if (pageVisibilityGroup) pageVisibilityGroup.style.display = isPage ? 'block' : 'none';

    const toggleShowTitle = document.getElementById('setup-toggle-show-title');
    const toggleShowSubtitle = document.getElementById('setup-toggle-show-subtitle');
    if (toggleShowTitle) {
      toggleShowTitle.checked = currentDraft.showTitle !== false;
    }
    if (toggleShowSubtitle) {
      toggleShowSubtitle.checked = currentDraft.showSubtitle !== false;
    }
    const authorGroup = document.getElementById('setup-author-group') || document.querySelector('.setup-author-group');
    if (authorGroup) authorGroup.style.display = 'none';

    const dateGroup = document.getElementById('setup-date-group') || document.querySelector('.setup-date-group');
    if (dateGroup) dateGroup.style.display = isPage ? 'none' : '';

    const btnExportClose = document.getElementById('btn-export-close');
    if (btnExportClose) btnExportClose.style.display = isPage ? 'none' : 'inline-flex';

    const settingsHeading = document.getElementById('modal-settings-heading');
    if (settingsHeading) settingsHeading.textContent = isPage ? 'Page Settings' : 'Post Settings';
    const modalTitle = document.getElementById('export-modal-title');
    if (modalTitle) modalTitle.textContent = isPage ? 'Page Settings' : 'Post Settings';

    const labelFooter = document.getElementById('label-publish-post-footer');
    const labelBody = document.getElementById('label-publish-post-body');
    const pubActionText = isPublished ? (isPage ? 'Update Page' : 'Update Post') : (isPage ? 'Publish Page' : 'Publish Post');
    if (labelFooter) labelFooter.textContent = pubActionText;
    if (labelBody) labelBody.textContent = pubActionText;

    const btnOpenFull = document.getElementById('btn-open-full-preview');
    if (btnOpenFull) {
      btnOpenFull.title = isPage ? 'Open rendered page in a new tab' : 'Open rendered article in a new tab';
    }

    // 10. Visual Previews (Feed Card & Featured Banner)
    updateVisualCardPreviews();

    // 11. Background Code Strings
    updateBackgroundCodeStrings();

    // 12. Delete action visibility for both Posts and custom static Pages
    const btnExportDeletePage = document.getElementById('btn-export-delete-page');
    if (btnExportDeletePage) {
      if (isPage) {
        btnExportDeletePage.style.display = (!isBuiltIn) ? 'inline-flex' : 'none';
        const label = btnExportDeletePage.querySelector('span');
        if (label) label.textContent = 'Delete Page';
      } else {
        const isPublished = currentDraft && currentDraft.status === 'published';
        btnExportDeletePage.style.display = isPublished ? 'none' : 'inline-flex';
        const label = btnExportDeletePage.querySelector('span');
        if (label) label.textContent = 'Delete Post';
      }
    }

    // 13. Visibility toggle (Visible vs Hidden)
    updateModalPostVisibilityUI();
  }

  const SVG_POST_EYE = '<svg class="author-visibility-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

  const SVG_POST_EYE_OFF = '<svg class="author-visibility-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

  function updateModalPostVisibilityUI() {
    const btn = document.getElementById('btn-post-visibility-toggle');
    if (btn) btn.style.display = 'none';
  }

  let cropState = {
    img: null,
    fitScale: 1,
    zoomScale: 1,
    currentScale: 1,
    mode: 'fit',
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startPanX: 0,
    startPanY: 0
  };

  function renderCropCanvas() {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas || !cropState.img) return;
    const ctx = canvas.getContext('2d');

    // Solid dark canvas background for any letterbox / pillarbox in fit mode
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, 1280, 720);

    const nw = cropState.img.naturalWidth || cropState.img.width || 1280;
    const nh = cropState.img.naturalHeight || cropState.img.height || 720;
    const dw = nw * cropState.currentScale;
    const dh = nh * cropState.currentScale;

    ctx.drawImage(cropState.img, cropState.panX, cropState.panY, dw, dh);
  }

  function openCropModalWithImage(imgObj) {
    if (!imgObj) return;
    cropState.img = imgObj;
    const nw = imgObj.naturalWidth || imgObj.width || 1280;
    const nh = imgObj.naturalHeight || imgObj.height || 720;

    // 1280 x 720 calculations
    // Fit mode: stretch width or height to touch the 1280x720 aspect ratio boundary
    cropState.fitScale = Math.min(1280 / nw, 720 / nh);
    // Crop Zoom mode: zoom in just until the image takes up the entire 1280x720 canvas
    cropState.zoomScale = Math.max(1280 / nw, 720 / nh);

    // Default mode is 'fit'
    cropState.mode = 'fit';
    cropState.currentScale = cropState.fitScale;
    cropState.panX = (1280 - nw * cropState.currentScale) / 2;
    cropState.panY = (720 - nh * cropState.currentScale) / 2;

    const slider = document.getElementById('crop-zoom-slider');
    const valLabel = document.getElementById('crop-zoom-val');
    if (slider) {
      slider.min = Math.max(5, Math.round(cropState.fitScale * 50));
      slider.max = Math.max(300, Math.round(cropState.zoomScale * 250));
      slider.value = Math.round(cropState.currentScale * 100);
    }
    if (valLabel) valLabel.textContent = `${Math.round(cropState.currentScale * 100)}%`;

    const btnFit = document.getElementById('btn-crop-fit');
    if (btnFit) btnFit.classList.add('active');

    renderCropCanvas();
    const cropModal = document.getElementById('modal-crop-image');
    if (cropModal) cropModal.style.display = 'flex';
  }

  function setupExportHub() {
    setupCategoryWarningModalHandlers();

    const btnOpenExport = document.getElementById('btn-open-export');
    if (btnOpenExport) {
      btnOpenExport.addEventListener('click', () => {
        openModal('modal-export');
      });
    }

    // Author Multi-Select Dropdown Controls
    const authorWrap = document.getElementById('setup-author-dropdown-wrap');
    const authorBtn = document.getElementById('setup-author-dropdown-btn');
    const authorMenu = document.getElementById('setup-author-dropdown-menu');
    if (authorBtn && authorWrap && authorMenu && !authorBtn.dataset.listenerAttached) {
      authorBtn.dataset.listenerAttached = 'true';
      authorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close category dropdown if open
        const catWrap = document.getElementById('setup-category-dropdown-wrap');
        const catBtn = document.getElementById('setup-category-dropdown-btn');
        const catMenu = document.getElementById('setup-category-dropdown-menu');
        if (catWrap && catMenu) {
          catWrap.classList.remove('open');
          catMenu.style.display = 'none';
          if (catBtn) catBtn.setAttribute('aria-expanded', 'false');
        }

        const isOpen = authorWrap.classList.contains('open');
        if (isOpen) {
          authorWrap.classList.remove('open');
          authorMenu.style.display = 'none';
          authorBtn.setAttribute('aria-expanded', 'false');
        } else {
          if (typeof loadProjectFromStorage === 'function') loadProjectFromStorage();
          renderSetupAuthorChips();
          authorWrap.classList.add('open');
          authorMenu.style.display = 'block';
          authorBtn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', (e) => {
        if (!authorWrap.contains(e.target)) {
          authorWrap.classList.remove('open');
          authorMenu.style.display = 'none';
          authorBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Category Multi-Select Dropdown Controls
    const catWrap = document.getElementById('setup-category-dropdown-wrap');
    const catBtn = document.getElementById('setup-category-dropdown-btn');
    const catMenu = document.getElementById('setup-category-dropdown-menu');
    if (catBtn && catWrap && catMenu && !catBtn.dataset.listenerAttached) {
      catBtn.dataset.listenerAttached = 'true';
      catBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close author dropdown if open
        if (authorWrap && authorMenu) {
          authorWrap.classList.remove('open');
          authorMenu.style.display = 'none';
          if (authorBtn) authorBtn.setAttribute('aria-expanded', 'false');
        }

        const isOpen = catWrap.classList.contains('open');
        if (isOpen) {
          catWrap.classList.remove('open');
          catMenu.style.display = 'none';
          catBtn.setAttribute('aria-expanded', 'false');
        } else {
          if (typeof loadProjectFromStorage === 'function') loadProjectFromStorage();
          renderSetupCategoryChips();
          catWrap.classList.add('open');
          catMenu.style.display = 'block';
          catBtn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', (e) => {
        if (!catWrap.contains(e.target)) {
          catWrap.classList.remove('open');
          catMenu.style.display = 'none';
          catBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const btnManageAuthors = document.getElementById('btn-setup-manage-authors');
    if (btnManageAuthors && !btnManageAuthors.dataset.listenerAttached) {
      btnManageAuthors.dataset.listenerAttached = 'true';
      btnManageAuthors.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetUrl = new URL('#authors', window.location.href).href;
        window.open(targetUrl, '_blank');
      });
    }

    const btnManageCategories = document.getElementById('btn-setup-manage-categories');
    if (btnManageCategories && !btnManageCategories.dataset.listenerAttached) {
      btnManageCategories.dataset.listenerAttached = 'true';
      btnManageCategories.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetUrl = new URL('#categories', window.location.href).href;
        window.open(targetUrl, '_blank');
      });
    }

    window.addEventListener('focus', () => {
      const expModal = document.getElementById('modal-export');
      if (expModal && expModal.style.display !== 'none') {
        if (typeof loadProjectFromStorage === 'function') loadProjectFromStorage();
        renderSetupAuthorChips();
        renderSetupCategoryChips();
      }
    });

    // Navigation between Main Menu (Publish Setup) and Optional Sub-Menu (Code Formats)
    const btnShowCode = document.getElementById('btn-show-code-menu');
    if (btnShowCode) {
      btnShowCode.addEventListener('click', () => {
        showPublishMenu('code');
      });
    }

    const btnExportBack = document.getElementById('btn-export-back');
    if (btnExportBack) {
      btnExportBack.addEventListener('click', () => {
        showPublishMenu('setup');
      });
    }

    document.querySelectorAll('.btn-back-to-setup').forEach(btn => {
      btn.addEventListener('click', () => {
        showPublishMenu('setup');
      });
    });

    // 1. Post Title sync
    const titleInput = document.getElementById('setup-post-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        if (!currentDraft) return;
        autoResizeSetupTextarea(titleInput);
        currentDraft.title = titleInput.value;
        const metaTitle = document.getElementById('meta-title');
        if (metaTitle) metaTitle.value = currentDraft.title;
        const canvasTitle = document.getElementById('rich-canvas-title') || document.getElementById('canvas-title-input');
        if (canvasTitle) {
          if ('value' in canvasTitle) canvasTitle.value = currentDraft.title;
          else canvasTitle.textContent = currentDraft.title;
        }

        const isUntitled = !currentDraft.slug ||
                           currentDraft.slug === 'untitled-post' ||
                           currentDraft.slug === 'untitled-article' ||
                           currentDraft.slug === 'untitled-page';
        const shouldAutoSync = (typeof window.shouldAutoSyncSlugFromTitle === 'function')
          ? window.shouldAutoSyncSlugFromTitle(currentDraft)
          : (!currentDraft.everPublished && currentDraft.status !== 'published' && !currentDraft.slugManuallyEdited);
        if (shouldAutoSync || isUntitled) {
          const defaultPlaceholder = currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
          const newSlug = generateSlug(titleInput.value, defaultPlaceholder, 30);
          currentDraft.slug = newSlug;
          const slugInput = document.getElementById('setup-post-slug');
          if (slugInput) {
            slugInput.value = newSlug;
            slugInput.dataset.confirmedSlug = newSlug;
          }
          const metaSlug = document.getElementById('meta-slug');
          if (metaSlug) metaSlug.value = newSlug;
          const targetPath = document.getElementById('export-target-path');
          if (targetPath) targetPath.textContent = `blog/${newSlug || 'slug'}/index.html`;
          const targetPathCard = document.getElementById('export-target-path-card');
          if (targetPathCard) targetPathCard.textContent = `blog/${newSlug || 'slug'}/index.html`;
          if (typeof updateEditorUrlSlug === 'function') updateEditorUrlSlug(newSlug);
          updateUrlPreviewDisplay(newSlug);
        }

        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });

      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      });
    }

    // 1b. Post Subtitle sync
    const subtitleInput = document.getElementById('setup-post-subtitle');
    if (subtitleInput) {
      subtitleInput.addEventListener('input', () => {
        if (!currentDraft) return;
        autoResizeSetupTextarea(subtitleInput);
        currentDraft.subtitle = subtitleInput.value;
        const metaSubtitle = document.getElementById('meta-subtitle');
        if (metaSubtitle) metaSubtitle.value = currentDraft.subtitle;
        const canvasSubtitle = document.getElementById('rich-canvas-subtitle');
        if (canvasSubtitle) canvasSubtitle.textContent = currentDraft.subtitle;
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }

    // 1c. Canonical URL Slug sync
    const slugInput = document.getElementById('setup-post-slug');
    let pendingSlugConfirmPromise = null;

    function applyConfirmedSlugToDraft(cleanSlug) {
      if (!currentDraft) return;
      currentDraft.slug = cleanSlug;
      const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
        ? window.hasDraftBeenPublished(currentDraft)
        : Boolean(currentDraft.status === 'published' || currentDraft.everPublished || currentDraft.publishedAt || currentDraft.publishedDate || currentDraft.publishedSlug);
      if (wasEverPublished) {
        currentDraft.publishedSlug = cleanSlug;
        currentDraft.slugCommitted = true;
      }
      if (slugInput) {
        slugInput.value = cleanSlug;
        slugInput.dataset.confirmedSlug = cleanSlug;
      }
      const metaSlug = document.getElementById('meta-slug');
      if (metaSlug) metaSlug.value = cleanSlug;
      const targetPath = document.getElementById('export-target-path');
      if (targetPath) targetPath.textContent = `blog/${cleanSlug || 'slug'}/index.html`;
      const targetPathCard = document.getElementById('export-target-path-card');
      if (targetPathCard) targetPathCard.textContent = `blog/${cleanSlug || 'slug'}/index.html`;
      if (typeof updateEditorUrlSlug === 'function') updateEditorUrlSlug(cleanSlug);
      updateUrlPreviewDisplay(cleanSlug);
      updateVisualCardPreviews();
      updateBackgroundCodeStrings();
      if (typeof scheduleAutosave === 'function') scheduleAutosave();
    }

    async function commitManualSlugChange(rawSlugValue, { isFromSyncBtn = false } = {}) {
      if (!currentDraft) return true;
      if (pendingSlugConfirmPromise) return pendingSlugConfirmPromise;

      const defaultPlaceholder = currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
      const cleanSlug = (rawSlugValue || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
        ? window.hasDraftBeenPublished(currentDraft)
        : Boolean(currentDraft.status === 'published' || currentDraft.everPublished || currentDraft.publishedAt || currentDraft.publishedDate || currentDraft.publishedSlug);
      const lockedSlug = currentDraft.publishedSlug || currentDraft.slug || (slugInput && slugInput.dataset.confirmedSlug) || defaultPlaceholder;

      if (!wasEverPublished) {
        const autoTitleSlug = generateSlug(currentDraft.title || '', defaultPlaceholder, 30);
        if (!cleanSlug || isFromSyncBtn || cleanSlug === autoTitleSlug) {
          currentDraft.slugManuallyEdited = false;
          applyConfirmedSlugToDraft(cleanSlug || autoTitleSlug);
        } else {
          currentDraft.slugManuallyEdited = true;
          applyConfirmedSlugToDraft(cleanSlug);
        }
        return true;
      }

      if (!cleanSlug || cleanSlug === lockedSlug) {
        if (slugInput) slugInput.value = lockedSlug;
        const metaSlug = document.getElementById('meta-slug');
        if (metaSlug) metaSlug.value = lockedSlug;
        return true;
      }

      pendingSlugConfirmPromise = (async () => {
        const confirmed = await showConfirmDialog({
          title: 'Are you sure?',
          message: 'Changing this URL slug might break existing links. Are you sure you want to change it?',
          confirmText: 'Yes',
          cancelText: 'Cancel',
          isDanger: true
        });
        pendingSlugConfirmPromise = null;
        if (confirmed) {
          currentDraft.slugManuallyEdited = true;
          applyConfirmedSlugToDraft(cleanSlug);
          return true;
        } else {
          currentDraft.slug = lockedSlug;
          if (slugInput) {
            slugInput.value = lockedSlug;
            slugInput.dataset.confirmedSlug = lockedSlug;
          }
          const metaSlug = document.getElementById('meta-slug');
          if (metaSlug) metaSlug.value = lockedSlug;
          updateUrlPreviewDisplay(lockedSlug);
          return false;
        }
      })();

      return pendingSlugConfirmPromise;
    }

    if (slugInput) {
      slugInput.addEventListener('input', () => {
        if (!currentDraft) return;
        const wasEverPublished = (typeof window.hasDraftBeenPublished === 'function')
          ? window.hasDraftBeenPublished(currentDraft)
          : Boolean(currentDraft.status === 'published' || currentDraft.everPublished || currentDraft.publishedAt || currentDraft.publishedDate || currentDraft.publishedSlug);
        if (wasEverPublished) {
          // Wait until blur / Enter / Publish to prompt confirmation on published or formerly published posts
          return;
        }
        const defaultPlaceholder = currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
        const cleanSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        const autoTitleSlug = generateSlug(currentDraft.title || '', defaultPlaceholder, 30);
        currentDraft.slug = cleanSlug || autoTitleSlug;
        currentDraft.slugManuallyEdited = Boolean(cleanSlug && cleanSlug !== autoTitleSlug);
        const metaSlug = document.getElementById('meta-slug');
        if (metaSlug) metaSlug.value = currentDraft.slug;
        const targetPath = document.getElementById('export-target-path');
        if (targetPath) targetPath.textContent = `blog/${currentDraft.slug || 'slug'}/index.html`;
        const targetPathCard = document.getElementById('export-target-path-card');
        if (targetPathCard) targetPathCard.textContent = `blog/${currentDraft.slug || 'slug'}/index.html`;
        if (typeof updateEditorUrlSlug === 'function') updateEditorUrlSlug(currentDraft.slug);
        updateUrlPreviewDisplay(currentDraft.slug);
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });

      slugInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          slugInput.blur();
        }
      });

      slugInput.addEventListener('blur', (e) => {
        if (!currentDraft) return;
        const rel = e.relatedTarget;
        if (rel && (rel.id === 'btn-export-close' || rel.hasAttribute('data-close-modal'))) {
          const lockedSlug = currentDraft.publishedSlug || currentDraft.slug || slugInput.dataset.confirmedSlug || '';
          slugInput.value = lockedSlug;
          return;
        }
        commitManualSlugChange(slugInput.value);
      });
    }

    // 1c-ii. Sync Slug from Title CTA
    const syncSlugBtn = document.getElementById('setup-btn-sync-slug');
    if (syncSlugBtn) {
      syncSlugBtn.addEventListener('click', async () => {
        if (!currentDraft) return;
        const defaultPlaceholder = currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post';
        const title = currentDraft.title || (titleInput ? titleInput.value : '');
        const newSlug = generateSlug(title, defaultPlaceholder, 30);
        const ok = await commitManualSlugChange(newSlug, { isFromSyncBtn: true });
        if (ok && typeof showToast === 'function') {
          showToast(`URL slug synced: /blog/${newSlug}/`);
        }
      });
    }

    // 1c-iii. Page Title & Subtitle Visibility Sliders (Page Settings)
    const toggleShowTitle = document.getElementById('setup-toggle-show-title');
    const toggleShowSubtitle = document.getElementById('setup-toggle-show-subtitle');

    if (toggleShowTitle && !toggleShowTitle.dataset.listenerAttached) {
      toggleShowTitle.dataset.listenerAttached = 'true';
      toggleShowTitle.addEventListener('change', () => {
        if (!currentDraft) return;
        currentDraft.showTitle = toggleShowTitle.checked;
        if (window.currentDraft) window.currentDraft.showTitle = toggleShowTitle.checked;
        if (typeof window.updateCanvasHeaderVisibility === 'function') {
          window.updateCanvasHeaderVisibility(currentDraft);
        }
        if (typeof updateVisualCardPreviews === 'function') updateVisualCardPreviews();
        if (typeof updateBackgroundCodeStrings === 'function') updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }

    if (toggleShowSubtitle && !toggleShowSubtitle.dataset.listenerAttached) {
      toggleShowSubtitle.dataset.listenerAttached = 'true';
      toggleShowSubtitle.addEventListener('change', () => {
        if (!currentDraft) return;
        currentDraft.showSubtitle = toggleShowSubtitle.checked;
        if (window.currentDraft) window.currentDraft.showSubtitle = toggleShowSubtitle.checked;
        if (typeof window.updateCanvasHeaderVisibility === 'function') {
          window.updateCanvasHeaderVisibility(currentDraft);
        }
        if (typeof updateVisualCardPreviews === 'function') updateVisualCardPreviews();
        if (typeof updateBackgroundCodeStrings === 'function') updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }

    // 1d. Publish Date sync
    const dateInput = document.getElementById('setup-post-date');
    if (dateInput) {
      dateInput.addEventListener('change', () => {
        if (!currentDraft) return;
        if (((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)) && typeof (window.Cedar.scheduler || window.Outpost.scheduler).handleDateChange === 'function') {
          (window.Cedar.scheduler || window.Outpost.scheduler).handleDateChange(dateInput, currentDraft);
          return;
        }
        currentDraft.date = dateInput.value;
        currentDraft.publishDateUserSet = true;
        if (currentDraft.status === 'published') {
          currentDraft.publishedDate = dateInput.value;
          const parts = String(dateInput.value).split('-').map(Number);
          if (parts.length === 3) {
            currentDraft.publishedAt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime();
          }
          const todayIso = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
          if (dateInput.value < todayIso) {
            currentDraft.editedDate = todayIso;
            currentDraft.editedAt = Date.now();
          }
        }
        const metaDate = document.getElementById('meta-date');
        if (metaDate) metaDate.value = currentDraft.date;
        const previewDate = document.getElementById('preview-date');
        if (previewDate && typeof formatDateDisplay === 'function') {
          previewDate.textContent = formatDateDisplay(currentDraft.date);
          previewDate.setAttribute('datetime', currentDraft.date || '');
        }
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }

    // 1e. Adjacent Post Links sync
    const prevTitleInput = document.getElementById('setup-nav-prev-title');
    const prevSlugInput = document.getElementById('setup-nav-prev-slug');
    const nextTitleInput = document.getElementById('setup-nav-next-title');
    const nextSlugInput = document.getElementById('setup-nav-next-slug');

    [
      { el: prevTitleInput, key: 'navPrevTitle', metaId: 'nav-prev-title' },
      { el: prevSlugInput, key: 'navPrevSlug', metaId: 'nav-prev-slug' },
      { el: nextTitleInput, key: 'navNextTitle', metaId: 'nav-next-title' },
      { el: nextSlugInput, key: 'navNextSlug', metaId: 'nav-next-slug' }
    ].forEach(({ el, key, metaId }) => {
      if (el) {
        el.addEventListener('input', () => {
          if (!currentDraft) return;
          currentDraft[key] = el.value.trim();
          const metaEl = document.getElementById(metaId);
          if (metaEl) metaEl.value = el.value.trim();
          if (typeof updateNavFooterPreview === 'function') updateNavFooterPreview();
          updateBackgroundCodeStrings();
          if (typeof scheduleAutosave === 'function') scheduleAutosave();
        });
      }
    });

    // 1f. Advanced SEO & Overrides sync
    const overrideReadTimeInput = document.getElementById('setup-meta-override-readtime');
    if (overrideReadTimeInput) {
      overrideReadTimeInput.addEventListener('input', () => {
        if (!currentDraft) return;
        currentDraft.overrideReadTime = overrideReadTimeInput.value.trim();
        const m = document.getElementById('meta-override-readtime');
        if (m) m.value = currentDraft.overrideReadTime;
        const md = currentDraft.markdown || '';
        const stats = (typeof window.getCleanProseStats === 'function')
          ? window.getCleanProseStats(md, false)
          : { words: md.trim().split(/\s+/).filter(w => w.length > 0).length, chars: md.length };
        const readTime = (typeof window.calculateReadTime === 'function')
          ? window.calculateReadTime(md, currentDraft.overrideReadTime, false)
          : calculateReadTime(md, currentDraft.overrideReadTime);
        const isPage = currentDraft && currentDraft.type === 'page';
        const statsBadge = document.getElementById('export-badge-stats');
        if (statsBadge) {
          if (isPage) {
            statsBadge.style.display = 'none';
          } else {
            statsBadge.style.display = 'inline-block';
            statsBadge.textContent = `${readTime} · ${stats.words.toLocaleString()} words · ${stats.chars.toLocaleString()} characters`;
          }
        }
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }

    const customDescInput = document.getElementById('setup-meta-custom-desc');
    if (customDescInput) {
      customDescInput.addEventListener('input', () => {
        if (!currentDraft) return;
        currentDraft.customDesc = customDescInput.value.trim();
        const m = document.getElementById('meta-custom-desc');
        if (m) m.value = currentDraft.customDesc;
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }


    // 3. SEO Keywords sync
    const seoInput = document.getElementById('setup-seo-keywords');
    if (seoInput) {
      seoInput.addEventListener('input', () => {
        if (!currentDraft) return;
        currentDraft.keywords = seoInput.value;
        updateBackgroundCodeStrings();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
    }

    // 4. Add Category popup modal
    const btnAddCat = document.getElementById('btn-setup-add-category');
    const modalAddCat = document.getElementById('modal-add-category');
    const catInput = document.getElementById('modal-category-name-input');
    const btnSaveCat = document.getElementById('btn-save-cat-modal');
    const btnCancelCat = document.getElementById('btn-cancel-cat-modal');
    const btnCloseCat = document.getElementById('btn-close-cat-modal');

    const closeCatModal = () => {
      if (modalAddCat) {
        modalAddCat.style.display = 'none';
        modalAddCat.classList.remove('active');
      }
    };

    const openCatModal = () => {
      if (!modalAddCat || !catInput) return;
      catInput.value = '';
      modalAddCat.style.display = 'flex';
      modalAddCat.classList.add('active');
      setTimeout(() => catInput.focus(), 60);
    };

    const handleSaveNewCat = () => {
      if (!catInput) return;
      const val = catInput.value.trim();
      if (!val) {
        catInput.focus();
        return;
      }
      const reservedCatNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
      if (reservedCatNames.has(val.toLowerCase())) {
        if (typeof showToast === 'function') showToast("Woah! That's a reserved name - pick something else.");
        return;
      }
      if (!window.projectConfig) window.projectConfig = { categories: [] };
      if (!Array.isArray(window.projectConfig.categories)) window.projectConfig.categories = [];
      if (!window.projectConfig.categories.includes(val)) {
        window.projectConfig.categories.push(val);
        if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
      }

      const applyCatToDraft = () => {
        if (currentDraft) {
          if (!Array.isArray(currentDraft.categories)) currentDraft.categories = [];
          if (!currentDraft.categories.some(c => c.toLowerCase() === val.toLowerCase())) {
            currentDraft.categories.push(val);
          }
          currentDraft.tag = currentDraft.categories[0] || val;
          currentDraft.permalinkCat = currentDraft.tag || 'uncategorized';
          currentDraft._categoryPromptAnswered = true;
          currentDraft.updatedAt = Date.now();
          if (window.currentDraft && window.currentDraft.id === currentDraft.id) {
            window.currentDraft.categories = currentDraft.categories;
            window.currentDraft.tag = currentDraft.tag;
            window.currentDraft.permalinkCat = currentDraft.permalinkCat;
            window.currentDraft.updatedAt = currentDraft.updatedAt;
          }
        }
        renderSetupCategoryChips();
        if (typeof window.updateCategorySelectUI === 'function') {
          window.updateCategorySelectUI();
        }
        if (typeof window.updateWorkspaceUrlPrefix === 'function') {
          window.updateWorkspaceUrlPrefix();
        }
        if (typeof window.syncCategoryPages === 'function') window.syncCategoryPages();
        if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
        if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      };

      closeCatModal();
      if (typeof showToast === 'function') showToast(`Added category "${val}"`);

      if (currentDraft) {
        const prevCats = Array.isArray(currentDraft.categories) ? [...currentDraft.categories] : [];
        const nextCats = prevCats.some(c => c.toLowerCase() === val.toLowerCase()) ? prevCats : [...prevCats, val];
        const nextTag = nextCats[0] || val;
        const warned = promptCategoryChangeWarning({
          draft: currentDraft,
          newCategories: nextCats,
          newTag: nextTag,
          onProceed: () => applyCatToDraft(),
          onCancel: () => {
            renderSetupCategoryChips();
            if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
            if (typeof window.syncCategoryPages === 'function') window.syncCategoryPages();
            if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
            if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
          }
        });
        if (!warned) {
          applyCatToDraft();
        }
      }
    };

    if (btnAddCat) {
      btnAddCat.addEventListener('click', openCatModal);
    }
    if (btnSaveCat) {
      btnSaveCat.addEventListener('click', handleSaveNewCat);
    }
    if (btnCancelCat) {
      btnCancelCat.addEventListener('click', closeCatModal);
    }
    if (btnCloseCat) {
      btnCloseCat.addEventListener('click', closeCatModal);
    }
    if (modalAddCat) {
      modalAddCat.addEventListener('click', (e) => {
        if (e.target === modalAddCat) closeCatModal();
      });
      modalAddCat.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeCatModal();
        }
      });
    }
    if (catInput) {
      catInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveNewCat();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeCatModal();
        }
      });
    }

    // Shared Featured Image Import Processor
    function processImportedFeaturedImage(img, fileOrBlob, dataUrl) {
      if (!currentDraft) return;
      currentDraft.coverImageRemoved = false;
      const slug = currentDraft.slug || 'featured';
      const rand = Math.random().toString(36).substr(2, 5);
      let ext = 'png';
      if (fileOrBlob && fileOrBlob.name) {
        const parts = fileOrBlob.name.split('.');
        if (parts.length > 1) ext = parts.pop().toLowerCase();
      } else if (fileOrBlob && fileOrBlob.type) {
        if (fileOrBlob.type === 'image/jpeg') ext = 'jpg';
        else if (fileOrBlob.type === 'image/webp') ext = 'webp';
        else if (fileOrBlob.type === 'image/gif') ext = 'gif';
        else if (fileOrBlob.type === 'image/svg+xml') ext = 'svg';
        else ext = 'png';
      }
      const animInfo = (typeof window.detectAnimatedImageFromDataUrl === 'function')
        ? window.detectAnimatedImageFromDataUrl(dataUrl, fileOrBlob)
        : {
            animated: Boolean(
              ext === 'gif' ||
              (fileOrBlob && (fileOrBlob.type === 'image/gif' || /\.gif$/i.test(fileOrBlob.name || ''))) ||
              /^data:image\/gif/i.test(String(dataUrl || ''))
            ),
            ext: 'gif',
            mime: 'image/gif'
          };
      const isGif = Boolean(animInfo && animInfo.animated);
      if (isGif && animInfo.ext) ext = animInfo.ext;

      const isExact1280x720 = (img.naturalWidth === 1280 && img.naturalHeight === 720);
      const origFilename = isGif ? `${slug}-featured-${rand}.${ext}` : `${slug}-orig-${rand}.webp`;
      const origRelativePath = `/blog/images/${origFilename}`;

      let cleanDataUrl = dataUrl;
      if (isGif && typeof cleanDataUrl === 'string' && cleanDataUrl.startsWith('data:') && animInfo.mime) {
        cleanDataUrl = cleanDataUrl.replace(/^data:[^;,]+/i, `data:${animInfo.mime}`);
      }
      let isSanitized = false;
      if (!isGif && window.projectConfig?.sanitizeImages !== false) {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          cleanDataUrl = c.toDataURL('image/webp', 0.92);
          isSanitized = true;
        } catch (e) {}
      }

      const resolvedOrigBlob = isGif
        ? (fileOrBlob instanceof Blob ? fileOrBlob : (typeof window.dataUrlToBlob === 'function' ? window.dataUrlToBlob(cleanDataUrl) : null))
        : (isSanitized ? null : fileOrBlob);

      const origImgObj = {
        filename: origFilename,
        relativePath: origRelativePath,
        blob: resolvedOrigBlob,
        dataUrl: cleanDataUrl,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        size: (resolvedOrigBlob && resolvedOrigBlob.size) || (fileOrBlob && fileOrBlob.size) || 0,
        mimeType: isGif ? (animInfo.mime || 'image/gif') : (isSanitized ? 'image/webp' : ((fileOrBlob && fileOrBlob.type) || `image/${ext === 'jpg' ? 'jpeg' : ext}`)),
        sanitized: isSanitized || isGif,
        isOriginal: !(isExact1280x720 || isGif),
        createdAt: Date.now()
      };

      if (!currentDraft.images) currentDraft.images = [];
      // Clean up previous dedicated cover original image from images array only if it is not referenced in the post body
      if (currentDraft.coverImageOriginal) {
        currentDraft.images = currentDraft.images.filter(im => {
          if (!im || im.relativePath !== currentDraft.coverImageOriginal) return true;
          if (typeof window.isImageReferencedInDraft === 'function' && window.isImageReferencedInDraft(im, currentDraft)) return true;
          return !im.isOriginal && !im.isCropped;
        });
      }
      currentDraft.images.push(origImgObj);

      if (typeof imageRegistry !== 'undefined') {
        imageRegistry.set(origFilename, origImgObj);
        imageRegistry.set(origRelativePath, origImgObj);
        imageRegistry.set(`blog/images/${origFilename}`, origImgObj);
      }
      const vStorageOrig = window.CedarVirtualStorage || window.OutpostVirtualStorage;
      if (vStorageOrig && typeof vStorageOrig.writeBlob === 'function' && origImgObj.blob) {
        vStorageOrig.writeBlob(`blog/images/${origFilename}`, origImgObj.blob).catch(() => {});
        vStorageOrig.writeBlob(`media/${origFilename}`, origImgObj.blob).catch(() => {});
      }
      if (window.SheeshVault && window.SheeshVault.currentDirHandle && typeof window.SheeshVault.writeFileToVault === 'function' && origImgObj.blob) {
        window.SheeshVault.writeFileToVault(`blog/images/${origFilename}`, origImgObj.blob).catch(() => {});
      }

      currentDraft.coverImageOriginal = origRelativePath;

      if (isExact1280x720 || isGif) {
        // If image is already exact 1280x720 or is an animated GIF, use it directly without flattening on the crop canvas
        if (currentDraft.coverImage && currentDraft.coverImage !== origRelativePath) {
          currentDraft.images = currentDraft.images.filter(im => {
            if (!im || im.relativePath !== currentDraft.coverImage) return true;
            return !im.isCropped && !(typeof window.isImageReferencedInDraft === 'function' && window.isImageReferencedInDraft(im, currentDraft));
          });
        }
        currentDraft.coverImage = origRelativePath;
        renderSetupFeaturedImage();
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof updateCoverPreview === 'function') updateCoverPreview();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        showToast(isGif ? 'Animated GIF featured image applied!' : 'Featured image applied (exact 1280 × 720 standard)!');
      } else {
        // Non-1280x720: auto-open the crop modal to standardize
        openCropModalWithImage(img);
      }
    }

    // 5. Featured Image: Browse input
    const browseInput = document.getElementById('setup-browse-img-input');
    if (browseInput) {
      browseInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            processImportedFeaturedImage(img, file, ev.target.result);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        browseInput.value = '';
      });
    }

    // 6. Featured Image: Paste Modal & clipboard
    const btnOpenPaste = document.getElementById('btn-open-paste-modal');
    const pasteModal = document.getElementById('modal-paste-image');
    const pasteZone = document.getElementById('paste-zone-box');
    const btnClosePaste = document.getElementById('btn-close-paste-modal');
    const btnCancelPaste = document.getElementById('btn-cancel-paste-modal');
    const btnReadClipboard = document.getElementById('btn-read-clipboard');

    const openPaste = () => {
      if (pasteModal) pasteModal.style.display = 'flex';
      if (pasteZone) pasteZone.focus();
    };

    const closePaste = () => {
      if (pasteModal) pasteModal.style.display = 'none';
    };

    if (btnOpenPaste) btnOpenPaste.addEventListener('click', openPaste);
    if (btnClosePaste) btnClosePaste.addEventListener('click', closePaste);
    if (btnCancelPaste) btnCancelPaste.addEventListener('click', closePaste);

    const handlePasteBlob = (blob) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          closePaste();
          processImportedFeaturedImage(img, blob, e.target.result);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(blob);
    };

    window.addEventListener('paste', (e) => {
      if (!pasteModal || pasteModal.style.display === 'none') return;
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            handlePasteBlob(file);
            return;
          }
        }
      }
    });

    if (btnReadClipboard) {
      btnReadClipboard.addEventListener('click', async () => {
        try {
          if (!navigator.clipboard || !navigator.clipboard.read) {
            showToast('Direct clipboard read not supported. Please click box and press Ctrl + V.', 'warning');
            return;
          }
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                handlePasteBlob(blob);
                return;
              }
            }
          }
          showToast('No image found in clipboard', 'warning');
        } catch (err) {
          showToast('Clipboard permission denied. Please press Ctrl + V.', 'warning');
        }
      });
    }

    // 7. Featured Image: Edit Button (Loads uncropped original for re-framing)
    const btnOpenCrop = document.getElementById('btn-open-crop-modal');
    if (btnOpenCrop) {
      btnOpenCrop.addEventListener('click', () => {
        if (!currentDraft) return;
        if (!currentDraft.coverImageOriginal && currentDraft.coverImage) {
          currentDraft.coverImageOriginal = currentDraft.coverImage;
        }
        const origSrc = (currentDraft.coverImageOriginal || currentDraft.coverImage || '').trim();
        if (!origSrc) {
          showToast('No image to edit. Browse or paste an image first.', 'info');
          return;
        }
        let displaySrc = resolveImageDisplayUrl(origSrc, currentDraft);
        const img = new Image();
        img.onload = () => {
          openCropModalWithImage(img);
        };
        img.src = displaySrc;
      });
    }

    // 8. Featured Image: Remove Button
    const btnRemoveFeatured = document.getElementById('btn-remove-featured-img');
    if (btnRemoveFeatured) {
      btnRemoveFeatured.addEventListener('click', () => {
        if (!currentDraft) return;
        currentDraft.coverImage = '';
        currentDraft.coverImageOriginal = '';
        currentDraft.coverImageRemoved = true;
        renderSetupFeaturedImage();
        updateVisualCardPreviews();
        updateBackgroundCodeStrings();
        if (typeof updateCoverPreview === 'function') updateCoverPreview();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        showToast('Featured image removed');
      });
    }

    // 8b. Featured Image: Cycle Arrows (Previous & Next Image in Draft)
    const btnCyclePrev = document.getElementById('btn-cycle-prev-img');
    if (btnCyclePrev) {
      btnCyclePrev.addEventListener('click', (e) => {
        e.preventDefault();
        cycleDraftFeaturedImage(-1);
      });
    }
    const btnCycleNext = document.getElementById('btn-cycle-next-img');
    if (btnCycleNext) {
      btnCycleNext.addEventListener('click', (e) => {
        e.preventDefault();
        cycleDraftFeaturedImage(1);
      });
    }

    // 8c. Featured Image: Reset to 1st image
    const btnResetFeatured = document.getElementById('btn-reset-featured-img');
    if (btnResetFeatured) {
      btnResetFeatured.addEventListener('click', (e) => {
        e.preventDefault();
        resetDraftFeaturedImage();
      });
    }

    // 8d. Featured Image Fullscreen Lightbox / Selector
    const previewBox = document.getElementById('featured-img-preview-box');
    if (previewBox && !previewBox.dataset.listenerAttached) {
      previewBox.dataset.listenerAttached = 'true';
      previewBox.addEventListener('click', (e) => {
        openFeaturedImgLightbox();
      });
    }

    const btnLbPrev = document.getElementById('lightbox-btn-prev');
    if (btnLbPrev && !btnLbPrev.dataset.listenerAttached) {
      btnLbPrev.dataset.listenerAttached = 'true';
      btnLbPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleLightbox(-1);
      });
    }

    const btnLbNext = document.getElementById('lightbox-btn-next');
    if (btnLbNext && !btnLbNext.dataset.listenerAttached) {
      btnLbNext.dataset.listenerAttached = 'true';
      btnLbNext.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleLightbox(1);
      });
    }

    const btnLbConfirm = document.getElementById('lightbox-btn-confirm');
    if (btnLbConfirm && !btnLbConfirm.dataset.listenerAttached) {
      btnLbConfirm.dataset.listenerAttached = 'true';
      btnLbConfirm.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmLightboxImage();
      });
    }

    const btnLbCancel = document.getElementById('lightbox-btn-cancel');
    if (btnLbCancel && !btnLbCancel.dataset.listenerAttached) {
      btnLbCancel.dataset.listenerAttached = 'true';
      btnLbCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelLightboxImage();
      });
    }

    // Clicking outside the image/card on backdrop confirms ("This One")
    const lightboxOverlay = document.getElementById('modal-featured-img-lightbox');
    if (lightboxOverlay && !lightboxOverlay.dataset.listenerAttached) {
      lightboxOverlay.dataset.listenerAttached = 'true';
      lightboxOverlay.addEventListener('click', (e) => {
        if (e.target === lightboxOverlay || e.target.classList.contains('lightbox-stage')) {
          confirmLightboxImage();
        }
      });
    }

    // Keyboard navigation when Lightbox is open
    if (!window.__lightboxKeydownAttached) {
      window.__lightboxKeydownAttached = true;
      window.addEventListener('keydown', (e) => {
        if (!lightboxState.isOpen) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          cycleLightbox(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          cycleLightbox(1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          confirmLightboxImage();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelLightboxImage();
        }
      });
    }

    // 9. Crop Window Canvas Interactions
    const canvas = document.getElementById('crop-canvas');
    if (canvas) {
      const startDrag = (clientX, clientY) => {
        cropState.isDragging = true;
        cropState.dragStartX = clientX;
        cropState.dragStartY = clientY;
        cropState.startPanX = cropState.panX;
        cropState.startPanY = cropState.panY;
        canvas.style.cursor = 'grabbing';
      };

      const doDrag = (clientX, clientY) => {
        if (!cropState.isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const factorX = 1280 / (rect.width || 640);
        const factorY = 720 / (rect.height || 360);
        cropState.panX = cropState.startPanX + (clientX - cropState.dragStartX) * factorX;
        cropState.panY = cropState.startPanY + (clientY - cropState.dragStartY) * factorY;
        renderCropCanvas();
      };

      const endDrag = () => {
        cropState.isDragging = false;
        canvas.style.cursor = 'grab';
      };

      canvas.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', (e) => {
        if (cropState.isDragging) {
          e.preventDefault();
          doDrag(e.clientX, e.clientY);
        }
      });
      window.addEventListener('mouseup', endDrag);

      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      });
      window.addEventListener('touchmove', (e) => {
        if (cropState.isDragging && e.touches.length === 1) {
          doDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      });
      window.addEventListener('touchend', endDrag);
    }

    // Fit to Frame button (Default)
    const btnCropFit = document.getElementById('btn-crop-fit');
    if (btnCropFit) {
      btnCropFit.addEventListener('click', () => {
        if (!cropState.img) return;
        cropState.mode = 'fit';
        cropState.currentScale = cropState.fitScale;
        const nw = cropState.img.naturalWidth || cropState.img.width || 1280;
        const nh = cropState.img.naturalHeight || cropState.img.height || 720;
        cropState.panX = (1280 - nw * cropState.currentScale) / 2;
        cropState.panY = (720 - nh * cropState.currentScale) / 2;

        btnCropFit.classList.add('active');

        const slider = document.getElementById('crop-zoom-slider');
        if (slider) slider.value = Math.round(cropState.currentScale * 100);
        const valLabel = document.getElementById('crop-zoom-val');
        if (valLabel) valLabel.textContent = `${Math.round(cropState.currentScale * 100)}%`;

        renderCropCanvas();
      });
    }

    // Zoom Slider
    const cropSlider = document.getElementById('crop-zoom-slider');
    if (cropSlider) {
      cropSlider.addEventListener('input', () => {
        if (!cropState.img) return;
        const oldScale = cropState.currentScale;
        const newScale = parseFloat(cropSlider.value) / 100;
        
        // Zoom centered on canvas center (640, 360)
        const centerX = 640;
        const centerY = 360;
        cropState.panX = centerX - ((centerX - cropState.panX) * (newScale / oldScale));
        cropState.panY = centerY - ((centerY - cropState.panY) * (newScale / oldScale));
        cropState.currentScale = newScale;

        const valLabel = document.getElementById('crop-zoom-val');
        if (valLabel) valLabel.textContent = `${Math.round(newScale * 100)}%`;

        renderCropCanvas();
      });
    }

    // Apply Crop Button
    const btnApplyCrop = document.getElementById('btn-apply-crop');
    if (btnApplyCrop) {
      btnApplyCrop.addEventListener('click', () => {
        if (!currentDraft || !cropState.img) return;
        const canvasEl = document.getElementById('crop-canvas');
        if (!canvasEl) return;

        canvasEl.toBlob(async (blob) => {
          if (!blob) {
            showToast('Failed to crop image', 'error');
            return;
          }
          const slug = currentDraft.slug || 'featured';
          const rand = Math.random().toString(36).substr(2, 5);
          const filename = `${slug}-featured-1280x720-${rand}.webp`;
          const relativePath = `/blog/images/${filename}`;
          const dataUrl = canvasEl.toDataURL('image/webp', 0.92);

          const imgObj = {
            filename: filename,
            relativePath: relativePath,
            blob: blob,
            dataUrl: dataUrl,
            width: 1280,
            height: 720,
            size: blob.size,
            mimeType: 'image/webp',
            sanitized: true,
            isCropped: true,
            createdAt: Date.now()
          };

          if (!currentDraft.images) currentDraft.images = [];
          // Only overwrite previous dedicated cropped cover image, NEVER an in-post body image!
          if (currentDraft.coverImage && currentDraft.coverImage !== currentDraft.coverImageOriginal) {
            const prevCover = currentDraft.coverImage;
            currentDraft.images = currentDraft.images.filter(im => {
              if (!im || im.relativePath !== prevCover) return true;
              const isDedicatedCrop = Boolean(im.isCropped || /-featured-1280x720-[a-z0-9]+\./i.test(im.filename || ''));
              return !isDedicatedCrop;
            });
          }
          currentDraft.images.push(imgObj);

          if (typeof imageRegistry !== 'undefined') {
            imageRegistry.set(filename, imgObj);
            imageRegistry.set(relativePath, imgObj);
            imageRegistry.set(`blog/images/${filename}`, imgObj);
          }

          const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
          if (vStorage && typeof vStorage.writeBlob === 'function' && blob) {
            vStorage.writeBlob(`blog/images/${filename}`, blob).catch(() => {});
            vStorage.writeBlob(`media/${filename}`, blob).catch(() => {});
          }
          if (window.SheeshVault && window.SheeshVault.currentDirHandle && typeof window.SheeshVault.writeFileToVault === 'function' && blob) {
            window.SheeshVault.writeFileToVault(`blog/images/${filename}`, blob).catch(() => {});
          }

          currentDraft.coverImage = relativePath;
          currentDraft.coverImageRemoved = false;
          renderSetupFeaturedImage();
          updateVisualCardPreviews();
          updateBackgroundCodeStrings();
          if (typeof updateCoverPreview === 'function') updateCoverPreview();
          if (typeof scheduleAutosave === 'function') scheduleAutosave();

          const cropModal = document.getElementById('modal-crop-image');
          if (cropModal) cropModal.style.display = 'none';

          showToast('Featured image cropped to 1280 × 720 and applied!');
        }, 'image/webp', 0.92);
      });
    }

    // Close / Cancel buttons for crop modal
    const btnCloseCrop = document.getElementById('btn-close-crop-modal');
    const btnCancelCrop = document.getElementById('btn-cancel-crop-modal');
    const closeCrop = () => {
      const cropModal = document.getElementById('modal-crop-image');
      if (cropModal) cropModal.style.display = 'none';
      if (currentDraft && !currentDraft.coverImage && currentDraft.coverImageOriginal) {
        currentDraft.coverImageOriginal = '';
      }
      renderSetupFeaturedImage();
    };
    if (btnCloseCrop) btnCloseCrop.addEventListener('click', closeCrop);
    if (btnCancelCrop) btnCancelCrop.addEventListener('click', closeCrop);

    // 10. Toggle Code Previews (hidden by default)
    document.querySelectorAll('.btn-toggle-code').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.dataset.toggleTarget;
        const wrap = document.getElementById(targetId);
        if (!wrap) return;

        const isHidden = wrap.style.display === 'none' || !wrap.style.display;
        if (isHidden) {
          wrap.style.display = 'block';
          btn.innerHTML = '🙈 Hide Code';
          btn.classList.add('active');
        } else {
          wrap.style.display = 'none';
          btn.innerHTML = '👁️ Show Code';
          btn.classList.remove('active');
        }
      });
    });

    // 11. Open Full Standalone Article Preview in new window/tab
    const btnOpenFull = document.getElementById('btn-open-full-preview');
    if (btnOpenFull) {
      btnOpenFull.addEventListener('click', (e) => {
        if (!currentDraft) return;
        syncFormToDraft();
        if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
        if (typeof window.openLocalPreviewTab === 'function') {
          window.openLocalPreviewTab(e);
        } else {
          const html = generateFullHtml(currentDraft);
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        }
      });
    }

    // 12. Download Single index.html
    const btnDownloadHtml = document.getElementById('btn-download-html');
    if (btnDownloadHtml) {
      btnDownloadHtml.addEventListener('click', () => {
        if (!currentDraft) return;
        syncFormToDraft();
        const html = generateFullHtml(currentDraft);
        triggerDownload('index.html', html, 'text/html;charset=utf-8');
      });
    }

    const btnDownloadHtmlCodeCard = document.getElementById('btn-download-html-code-card');
    if (btnDownloadHtmlCodeCard) {
      btnDownloadHtmlCodeCard.addEventListener('click', () => {
        const mainBtn = document.getElementById('btn-download-html');
        if (mainBtn) mainBtn.click();
      });
    }

    // 13. Download Complete .ZIP with images!
    const btnDownloadZip = document.getElementById('btn-download-zip');
    if (btnDownloadZip) {
      btnDownloadZip.addEventListener('click', async () => {
        if (!currentDraft) return;
        syncFormToDraft();
        const isPage = currentDraft.type === 'page';
        const baseRoot = isPage ? 'pages' : 'blog';
        const isHidden = Boolean(currentDraft.hidden || currentDraft.retired);
        const isPublished = !isHidden && (currentDraft.status === 'published');
        const statusSubfolder = isHidden ? 'hidden' : (isPublished ? 'published' : 'drafts');
        const slug = currentDraft.slug || 'blog-post';
        const folder = `${baseRoot}/${statusSubfolder}/${slug}`;
        const html = generateFullHtml(currentDraft);
        const jsonDraft = JSON.stringify(currentDraft, null, 2);

        const files = [
          { name: `${folder}/index.html`, data: html },
          { name: `${folder}/draft.json`, data: jsonDraft }
        ];

        // Add all sanitized images directly inside the post/page folder in zip
        const images = (currentDraft && currentDraft.images) ? currentDraft.images : [];
        for (const img of images) {
          if (img.filename) {
            files.push({
              name: `${folder}/${img.filename}`,
              data: img.blob
            });
          }
        }

        const zipUint8 = await createMultiFileZip(files);
        const blob = new Blob([zipUint8], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    const btnDownloadZipFooter = document.getElementById('btn-download-zip-footer');
    if (btnDownloadZipFooter) {
      btnDownloadZipFooter.addEventListener('click', () => {
        const mainBtn = document.getElementById('btn-download-zip');
        if (mainBtn) mainBtn.click();
      });
    }

    // 13b. Unified Modal: Greater "Publish Post" Action
    let _isPublishingPostFromModal = false;
    async function publishPostFromModal(e) {
      if (!currentDraft || _isPublishingPostFromModal) return;
      if (typeof saveTimeout !== 'undefined') clearTimeout(saveTimeout);

      const modalPublishBtns = [
        document.getElementById('btn-publish-post-footer'),
        document.getElementById('btn-publish-post-body')
      ].filter(Boolean);
      const savedBtnStates = modalPublishBtns.map(btn => {
        const rect = btn.getBoundingClientRect();
        return {
          btn,
          html: btn.innerHTML,
          minWidth: btn.style.minWidth,
          minHeight: btn.style.minHeight,
          width: rect.width,
          height: rect.height
        };
      });
      const setModalBtnsSpinning = (spinning) => {
        savedBtnStates.forEach(st => {
          if (spinning) {
            if (st.width > 0) st.btn.style.minWidth = `${Math.round(st.width)}px`;
            if (st.height > 0) st.btn.style.minHeight = `${Math.round(st.height)}px`;
            st.btn.disabled = true;
            st.btn.innerHTML = `<span class="cedar-btn-spinner" aria-label="Publishing" role="status"></span>`;
          } else {
            st.btn.disabled = false;
            st.btn.style.minWidth = st.minWidth;
            st.btn.style.minHeight = st.minHeight;
            st.btn.innerHTML = st.html;
          }
        });
      };

      // Ensure form inputs in modal are synced
      const titleInput = document.getElementById('setup-post-title');
      if (titleInput && titleInput.value.trim()) currentDraft.title = titleInput.value.trim();

      const subtitleInput = document.getElementById('setup-post-subtitle');
      if (subtitleInput) currentDraft.subtitle = subtitleInput.value.trim();

      if (currentDraft.type === 'page') {
        const toggleTitle = document.getElementById('setup-toggle-show-title');
        const toggleSubtitle = document.getElementById('setup-toggle-show-subtitle');
        if (toggleTitle) currentDraft.showTitle = toggleTitle.checked;
        if (toggleSubtitle) currentDraft.showSubtitle = toggleSubtitle.checked;
      }

      const slugInput = document.getElementById('setup-post-slug');
      if (slugInput && typeof commitManualSlugChange === 'function') {
        const slugConfirmed = await commitManualSlugChange(slugInput.value);
        if (!slugConfirmed) return;
      }

      _isPublishingPostFromModal = true;
      const modalPublishStartTs = Date.now();
      setModalBtnsSpinning(true);
      try {
      if (typeof saveTimeout !== 'undefined') clearTimeout(saveTimeout);
      const inputSlugVal = slugInput ? slugInput.value.trim() : '';
      if (inputSlugVal && inputSlugVal !== 'untitled-page' && inputSlugVal !== 'untitled-post') {
        currentDraft.slug = inputSlugVal.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      } else if (!currentDraft.slug || currentDraft.slug === 'untitled-page' || currentDraft.slug === 'untitled-post') {
        currentDraft.slug = (typeof generateSlug === 'function')
          ? generateSlug(currentDraft.title || (currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post'), '', 30)
          : (currentDraft.type === 'page' ? 'untitled-page' : 'untitled-post');
      }

      const dateInput = document.getElementById('setup-post-date');
      if (dateInput && dateInput.value) {
        currentDraft.date = dateInput.value;
        currentDraft.publishedDate = dateInput.value;
      }

      const seoKeywords = document.getElementById('setup-seo-keywords');
      if (seoKeywords) currentDraft.keywords = seoKeywords.value.trim();

      // Directly sync checked categories from #setup-category-chips if present
      const catContainer = document.getElementById('setup-category-chips');
      if (catContainer && currentDraft.type !== 'page') {
        const allBoxes = catContainer.querySelectorAll('input.category-checkbox');
        if (allBoxes.length > 0) {
          const domCategories = [];
          allBoxes.forEach(box => {
            if (box.checked) {
              const catVal = (box.dataset.category || box.parentElement?.querySelector('.category-dropdown-name')?.textContent || '').trim();
              if (catVal && catVal.toLowerCase() !== 'uncategorized' && catVal.toLowerCase() !== 'posts') {
                domCategories.push(catVal);
              }
            }
          });
          currentDraft.categories = domCategories;
          currentDraft.tag = domCategories.length > 0 ? domCategories[0] : '';
        }
      }

      if (Array.isArray(currentDraft.categories) && currentDraft.categories.length > 0) {
        currentDraft.tag = currentDraft.categories[0];
      } else if (currentDraft.type !== 'page') {
        currentDraft.categories = [];
        currentDraft.tag = '';
      }

      const wasPublished = currentDraft.status === 'published';
      if (!currentDraft.type) {
        currentDraft.type = 'post';
      }
      if (currentDraft.type !== 'page') {
        currentDraft.hidden = false;
        currentDraft.retired = false;
      }
      currentDraft.status = 'published';
      currentDraft.everPublished = true;
      currentDraft.publishedSlug = currentDraft.slug;
      currentDraft.slugCommitted = true;
      currentDraft._categoryPromptAnswered = true;
      delete currentDraft.userUnpublished;
      try { localStorage.removeItem('cedar_user_unpublished_' + currentDraft.id); } catch (e) {}

      // When publishing: lock in current post images, and prune unused lingering temp images without duplicating heavy dataUrl strings
      if (currentDraft && Array.isArray(currentDraft.tempImages)) {
        if (!Array.isArray(currentDraft.images)) currentDraft.images = [];
        currentDraft.tempImages.forEach(im => {
          if (!im || !im.filename) return;
          const alreadyInImages = currentDraft.images.some(existing => existing && existing.filename === im.filename);
          if (!alreadyInImages && typeof window.isImageReferencedInDraft === 'function' && window.isImageReferencedInDraft(im, currentDraft)) {
            const regObj = (typeof imageRegistry !== 'undefined' && imageRegistry)
              ? (imageRegistry.get(im.filename) || imageRegistry.get(im.relativePath) || imageRegistry.get(`/blog/images/${im.filename}`))
              : null;
            currentDraft.images.push(regObj || im);
          }
        });
        const publishedFilenames = (currentDraft.images || []).map(im => im.filename);
        const unusedTempImages = currentDraft.tempImages.filter(im => {
          if (!im || !im.filename || publishedFilenames.includes(im.filename)) return false;
          if (typeof window.isImageReferencedInDraft === 'function' && window.isImageReferencedInDraft(im, currentDraft)) return false;
          return true;
        });
        unusedTempImages.forEach(im => {
          if (typeof cleanupOrphanedImageStorage === 'function') {
            cleanupOrphanedImageStorage(im.filename, currentDraft.id);
          }
        });
        currentDraft.tempImages = (currentDraft.images || []).map(im => ({
          filename: im.filename,
          relativePath: im.relativePath
        }));
      }

      // Clean up any stale draft folder in virtual storage and local disk vault when publishing
      if (currentDraft && currentDraft.slug) {
        const baseFolder = currentDraft.type === 'page' ? 'pages' : 'blog';
        const vStoragePub = window.CedarVirtualStorage || window.OutpostVirtualStorage;
        if (vStoragePub && typeof vStoragePub.deleteFile === 'function') {
          vStoragePub.deleteFile(`${baseFolder}/drafts/${currentDraft.slug}/draft.json`).catch(() => {});
          vStoragePub.deleteFile(`${baseFolder}/drafts/${currentDraft.slug}/index.md`).catch(() => {});
          vStoragePub.deleteFile(`${baseFolder}/drafts/${currentDraft.slug}/index.html`).catch(() => {});
        }
        if (window.SheeshVault && window.SheeshVault.currentDirHandle && typeof window.SheeshVault.deleteFolderFromVault === 'function') {
          window.SheeshVault.deleteFolderFromVault(`${baseFolder}/drafts/${currentDraft.slug}`).catch(() => {});
        }
      }

      // 1. Synchronize published date, publishedAt, and updatedAt
      const nowTs = Date.now();
      currentDraft.updatedAt = nowTs;
      const localToday = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
      const pubDateVal = (dateInput && dateInput.value) || currentDraft.date || localToday;
      currentDraft.date = pubDateVal;
      currentDraft.publishedDate = pubDateVal;

      const dateParts = pubDateVal.split('-').map(Number);
      const pubNoonTs = (dateParts.length === 3) ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0, 0).getTime() : nowTs;

      if (pubDateVal < localToday) {
        // Backdated post published or edited today!
        currentDraft.publishedAt = pubNoonTs;
        currentDraft.editedDate = localToday;
        currentDraft.editedAt = nowTs;
      } else {
        if (!currentDraft.publishedAt || wasPublished) {
          currentDraft.publishedAt = nowTs;
        }
        if (wasPublished) {
          currentDraft.editedAt = nowTs;
          currentDraft.editedDate = localToday;
        }
      }

      // Clear any lingering scheduled state
      currentDraft.scheduled = false;
      delete currentDraft.scheduledAt;
      delete currentDraft.scheduledTime;
      delete currentDraft.scheduledDate;

      // 2. Clear unpublished edits flag
      currentDraft.hasUnpublishedEdits = false;

      if (window.currentDraft && window.currentDraft.id === currentDraft.id && window.currentDraft !== currentDraft) {
        Object.assign(window.currentDraft, currentDraft);
      }
      if (window.CedarStore) {
        if (typeof window.CedarStore.recordStatusChange === 'function') {
          window.CedarStore.recordStatusChange(currentDraft.id);
        }
        if (typeof window.CedarStore.upsert === 'function') {
          window.CedarStore.upsert(currentDraft);
        }
      }
      if (Array.isArray(window.drafts)) {
        const dIdx = window.drafts.findIndex(d => d && d.id === currentDraft.id);
        if (dIdx !== -1) {
          window.drafts[dIdx] = currentDraft;
        }
      }

      // Save drafts to storage
      if (typeof saveDraftsToStorage === 'function') {
        await saveDraftsToStorage();
      }
      const elapsedModalPub = Date.now() - modalPublishStartTs;
      if (elapsedModalPub < 380) {
        await new Promise(r => setTimeout(r, 380 - elapsedModalPub));
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        window.updateAllPreviewFrames();
      }
      if (typeof window.syncLiveWorkspaceData === 'function') {
        window.syncLiveWorkspaceData();
      }

      if (typeof window.updateCategorySelectUI === 'function') {
        window.updateCategorySelectUI();
      }
      if (typeof updateEditorHeader === 'function') {
        updateEditorHeader();
      }
      if (typeof renderAllPostsGrid === 'function') {
        renderAllPostsGrid();
      }
      if (typeof renderPostsPipeline === 'function') {
        renderPostsPipeline();
      }
      if (typeof renderTaxonomy === 'function') {
        renderTaxonomy();
      }

      // Close modal
      closeModal('modal-export');

      // Feedback toast
      const isPage = currentDraft && currentDraft.type === 'page';
      if (wasPublished) {
        showToast(isPage ? '✓ Page updated!' : '✓ Post updated!', 'success');
      } else {
        showToast(isPage ? '🚀 Page published!' : '🚀 Post published!', 'success');
      }
      } finally {
        _isPublishingPostFromModal = false;
        setModalBtnsSpinning(false);
      }
    }

    const btnPublishFooter = document.getElementById('btn-publish-post-footer');
    if (btnPublishFooter) {
      btnPublishFooter.addEventListener('click', publishPostFromModal);
    }

    const btnPublishBody = document.getElementById('btn-publish-post-body');
    if (btnPublishBody) {
      btnPublishBody.addEventListener('click', publishPostFromModal);
    }

    const btnExportDeletePage = document.getElementById('btn-export-delete-page');
    if (btnExportDeletePage) {
      btnExportDeletePage.addEventListener('click', () => {
        if (!currentDraft) return;
        const isBuiltIn = typeof window.isBuiltInPage === 'function' ? window.isBuiltInPage(currentDraft) : false;
        if (isBuiltIn) return;
        if (typeof deleteItem === 'function') {
          deleteItem(currentDraft.id);
        }
      });
    }

    // Visibility toggle (eyeball button in modal header)
    const btnPostVisibilityToggle = document.getElementById('btn-post-visibility-toggle');
    if (btnPostVisibilityToggle) {
      btnPostVisibilityToggle.addEventListener('click', () => {
        if (!currentDraft) return;
        const isPage = currentDraft.type === 'page';
        const isRssPage = isPage && (currentDraft.id === 'page_rss' || currentDraft.slug === 'rss');
        const isRssOff = isRssPage && typeof resolveProjectRssEnabled === 'function' && !resolveProjectRssEnabled();
        const currentlyHidden = Boolean(currentDraft.hidden || currentDraft.retired || isRssOff);
        const newHidden = !currentlyHidden;

        currentDraft.hidden = newHidden;
        currentDraft.retired = newHidden;

        // If toggling RSS page visibility, keep projectConfig.rssEnabled directly in sync
        if (isRssPage) {
          const isRssEnabled = !newHidden;
          if (window.projectConfig) projectConfig.rssEnabled = isRssEnabled;
          try {
            if (isRssEnabled) {
              localStorage.removeItem('cedar_rss_user_explicitly_disabled');
              localStorage.setItem('cedar_rss_enabled', 'true');
            } else {
              localStorage.setItem('cedar_rss_user_explicitly_disabled', 'true');
              localStorage.setItem('cedar_rss_enabled', 'false');
            }
          } catch (e) {}
          if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
          if (isRssEnabled && typeof window.syncRssPageDraft === 'function') {
            window.syncRssPageDraft(window.projectConfig);
          }
        }

        updateModalPostVisibilityUI();
        if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();

        const itemType = isPage ? 'Page' : 'Post';
        if (typeof showToast === 'function') {
          showToast(`${itemType} set to ${newHidden ? 'Disabled' : 'Enabled'}`);
        }

        // Refresh views
        if (typeof renderStaticPages === 'function') renderStaticPages();
        if (typeof renderAllPostsGrid === 'function') renderAllPostsGrid();
        if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
      });
    }

    window.publishPostFromModal = publishPostFromModal;

    // 14. Copy HTML button
    const btnCopyHtml = document.getElementById('btn-copy-html');
    if (btnCopyHtml) {
      btnCopyHtml.addEventListener('click', () => {
        const code = document.getElementById('export-html-code');
        if (code) copyToClipboard(code.textContent, 'Copied full index.html code!');
      });
    }

    // 15. Copy Blog Card buttons
    const btnCopyBlogCard = document.getElementById('btn-copy-blog-card');
    if (btnCopyBlogCard) {
      btnCopyBlogCard.addEventListener('click', () => {
        const code = document.getElementById('export-blog-card-code');
        if (code) copyToClipboard(code.textContent, 'Copied Blog Post Card snippet!');
      });
    }

    const btnCopyBlogCard2 = document.getElementById('btn-copy-blog-card-2');
    if (btnCopyBlogCard2) {
      btnCopyBlogCard2.addEventListener('click', () => {
        const code = document.getElementById('export-blog-card-code-2') || document.getElementById('export-blog-card-code');
        if (code) copyToClipboard(code.textContent, 'Copied Blog Post Card snippet!');
      });
    }

    // 16. Copy Featured Banner buttons
    const btnCopyFeaturedCard = document.getElementById('btn-copy-featured-card');
    if (btnCopyFeaturedCard) {
      btnCopyFeaturedCard.addEventListener('click', () => {
        const code = document.getElementById('export-featured-card-code');
        if (code) copyToClipboard(code.textContent, 'Copied Featured Banner snippet!');
      });
    }

    const btnCopyFeaturedCard2 = document.getElementById('btn-copy-featured-card-2');
    if (btnCopyFeaturedCard2) {
      btnCopyFeaturedCard2.addEventListener('click', () => {
        const code = document.getElementById('export-featured-card-code-2') || document.getElementById('export-featured-card-code');
        if (code) copyToClipboard(code.textContent, 'Copied Featured Banner snippet!');
      });
    }

    // 17. Download & Copy Markdown
    const btnDownloadMd = document.getElementById('btn-download-md');
    if (btnDownloadMd) {
      btnDownloadMd.addEventListener('click', () => {
        if (!currentDraft) return;
        syncFormToDraft();
        const md = generateMarkdownWithFrontmatter(currentDraft);
        const slug = currentDraft.slug || 'post';
        triggerDownload(`${slug}.md`, md, 'text/markdown;charset=utf-8');
      });
    }

    const btnCopyMarkdown = document.getElementById('btn-copy-markdown');
    if (btnCopyMarkdown) {
      btnCopyMarkdown.addEventListener('click', () => {
        const code = document.getElementById('export-markdown-code');
        if (code) copyToClipboard(code.textContent, 'Copied Markdown + Frontmatter!');
      });
    }

    // 18. Download & Copy JSON Draft
    const btnDownloadJson = document.getElementById('btn-download-json');
    if (btnDownloadJson) {
      btnDownloadJson.addEventListener('click', () => {
        if (!currentDraft) return;
        syncFormToDraft();
        const jsonStr = JSON.stringify(currentDraft, null, 2);
        const filename = `${currentDraft.slug || 'draft'}.json`;
        triggerDownload(filename, jsonStr, 'application/json;charset=utf-8');
      });
    }

    const btnCopyJson = document.getElementById('btn-copy-json');
    if (btnCopyJson) {
      btnCopyJson.addEventListener('click', () => {
        if (!currentDraft) return;
        syncFormToDraft();
        const jsonStr = JSON.stringify(currentDraft, null, 2);
        copyToClipboard(jsonStr, 'Copied JSON Draft state!');
      });
    }
  }


  // =========================================================================
  // DRAFTS MANAGER
  // =========================================================================
  function renderDraftsList() {
    const listContainer = document.getElementById('drafts-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (drafts.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted, #888); font-size: 0.9rem;">
          No drafts created yet.
        </div>
      `;
      return;
    }

    drafts.forEach(d => {
      const item = document.createElement('div');
      item.className = `draft-item-card ${currentDraft && d.id === currentDraft.id ? 'active' : ''}`;
      
      const updatedStr = new Date(d.updatedAt || Date.now()).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      item.innerHTML = `
        <div class="draft-item-info">
          <div class="draft-item-title">${escapeHtml(d.title || 'Untitled Draft')}</div>
          <div class="draft-item-meta">
            <span>/blog/${escapeHtml(d.slug)}/</span> &bull; <span>Updated ${updatedStr}</span>
          </div>
        </div>
        <div class="draft-item-actions">
          <button type="button" class="btn btn-sm btn-ghost btn-duplicate" title="Duplicate Draft">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button type="button" class="btn-icon-danger btn-delete" title="Delete Draft">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-duplicate')) {
          e.stopPropagation();
          duplicateDraft(d.id);
          return;
        }
        if (e.target.closest('.btn-delete')) {
          e.stopPropagation();
          deleteDraft(d.id);
          return;
        }
        selectDraft(d.id);
      });

      listContainer.appendChild(item);
    });
  }

  function selectDraft(draftId) {
    const found = drafts.find(d => d.id === draftId);
    if (found) {
      currentDraft = found;
      saveDraftsToStorage();
      openPostInEditor(found);
    }
  }

  function duplicateDraft(draftId) {
    const orig = drafts.find(d => d.id === draftId);
    if (!orig) return;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    copy.title = copy.title + ' (Copy)';
    copy.slug = generateSlug(copy.title);
    copy.updatedAt = Date.now();
    drafts.unshift(copy);
    currentDraft = copy;
    saveDraftsToStorage();
    syncDraftToForm();
    renderDraftsList();
    showToast('Draft duplicated!');
  }

  function deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft?')) return;

    // Clean up all orphaned images and lingering temp images associated with this draft
    const targetDraft = drafts.find(d => d.id === draftId);
    if (targetDraft) {
      const allImages = [...(targetDraft.images || []), ...(targetDraft.tempImages || [])];
      allImages.forEach(img => {
        if (img && img.filename && typeof cleanupOrphanedImageStorage === 'function') {
          cleanupOrphanedImageStorage(img.filename, draftId);
        }
      });
    }

    drafts = drafts.filter(d => d.id !== draftId);
    if (typeof window !== 'undefined' && Array.isArray(window.drafts)) {
      window.drafts = window.drafts.filter(d => d && d.id !== draftId);
    }
    if (typeof window !== 'undefined' && window.CedarStore) {
      if (typeof window.CedarStore.markIdDeleted === 'function') {
        window.CedarStore.markIdDeleted(draftId);
      }
      if (typeof window.CedarStore.remove === 'function') {
        window.CedarStore.remove(draftId);
      }
    }
    if (targetDraft && targetDraft.slug) {
      const s = targetDraft.slug;
      const paths = [`blog/drafts/${s}`, `blog/published/${s}`, `blog/hidden/${s}`, `pages/published/${s}`, `pages/hidden/${s}`];
      paths.forEach(p => {
        if (window.SheeshVault && typeof window.SheeshVault.deleteFile === 'function') {
          try { window.SheeshVault.deleteFile(p); } catch (e) {}
        }
        const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
        if (vStorage && typeof vStorage.deleteFile === 'function') {
          try { vStorage.deleteFile(`${p}/draft.json`); } catch (e) {}
        }
      });
    }
    if (currentDraft && currentDraft.id === draftId) {
      currentDraft = drafts[0] || null;
    }
    saveDraftsToStorage();
    syncDraftToForm();
    renderDraftsList();
    showToast('Draft deleted.');
    if (!currentDraft) {
      navigateTo('posts');
    }
  }


  // =========================================================================
  // IMPORT CONTROLS
  // =========================================================================
  function setupImportControls() {
    const btnOpenImport = document.getElementById('btn-open-import');
    if (btnOpenImport) {
      btnOpenImport.addEventListener('click', () => {
        const pasteArea = document.getElementById('import-paste-area');
        if (pasteArea) pasteArea.value = '';
        populateVaultImportItems();
        openModal('modal-import');
      });
    }

    const btnDoImport = document.getElementById('btn-do-import');
    if (btnDoImport) {
      btnDoImport.addEventListener('click', () => {
        const pasteArea = document.getElementById('import-paste-area');
        const pasted = pasteArea ? pasteArea.value : '';
        if (!pasted.trim()) {
          alert('Please paste some content or choose a file to import.');
          return;
        }
        const importedDraft = importContent(pasted);
        if (importedDraft) {
          drafts.unshift(importedDraft);
          currentDraft = importedDraft;
          saveDraftsToStorage();
          openPostInEditor(importedDraft);
          showToast('Successfully imported article!');
        } else {
          alert('Could not parse the provided content into an article.');
        }
      });
    }

    let pendingImportZipFile = null;

    function promptImportWithBackupOption(file, onComplete) {
      if (!file) return;
      pendingImportZipFile = file;

      const modal = document.getElementById('modal-vault-import-confirm');
      const fnEl = document.getElementById('import-confirm-filename');
      if (fnEl) fnEl.textContent = `Selected archive: ${file.name}`;

      if (modal) {
        modal._onComplete = onComplete;
        modal.style.display = 'flex';
        return;
      }

      // Fallback if modal DOM element is missing
      const saveFirst = confirm(
        `Selected archive: ${file.name}\n\n` +
        `Do you want to save and export your existing Local Storage backup before overwriting your Cedar workspace?\n\n` +
        `• Click "OK" to download a backup of your existing Local Storage first, then import.\n` +
        `• Click "Cancel" to proceed with importing without exporting a backup.`
      );

      if (saveFirst) {
        if (typeof exportMasterSliceZip === 'function') {
          exportMasterSliceZip();
        }
        setTimeout(() => {
          executeZipImport(file, onComplete);
        }, 600);
      } else {
        executeZipImport(file, onComplete);
      }
    }

    async function executeZipImport(file, onComplete) {
      if (!file) return;
      try {
        if (window.SheeshVault && typeof window.SheeshVault.importZip === 'function') {
          const count = await window.SheeshVault.importZip(file);
          if (typeof loadDraftsFromStorage === 'function') loadDraftsFromStorage();
          if (typeof updateCedarTitle === 'function') updateCedarTitle(); else if (typeof updateOutpostTitle === 'function') updateOutpostTitle();
          if (typeof renderDashboard === 'function') renderDashboard();
          if (typeof renderSettingsAuthorProfile === 'function') renderSettingsAuthorProfile();
          if (typeof renderTaxonomy === 'function') renderTaxonomy();
          if (typeof renderProjectSettings === 'function') renderProjectSettings();
          if (typeof closeModal === 'function') closeModal('modal-import');
          showToast(`Successfully imported ${count} items from ${file.name}!`);
          if (typeof onComplete === 'function') onComplete(true);
        } else {
          alert('Local Storage ZIP engine is not initialized.');
        }
      } catch (err) {
        alert('Failed to import ZIP: ' + err.message);
        if (typeof onComplete === 'function') onComplete(false);
      } finally {
        pendingImportZipFile = null;
      }
    }

    // Modal buttons bindings for modal-vault-import-confirm
    const modalConfirm = document.getElementById('modal-vault-import-confirm');
    if (modalConfirm) {
      const closeBtn = document.getElementById('btn-close-vault-import-confirm');
      const cancelBtn = document.getElementById('btn-import-confirm-cancel');
      const overwriteBtn = document.getElementById('btn-import-confirm-overwrite');
      const saveFirstBtn = document.getElementById('btn-import-confirm-save-first');

      const hideConfirmModal = () => {
        modalConfirm.style.display = 'none';
        pendingImportZipFile = null;
        const inputSettings = document.getElementById('input-settings-import-zip');
        if (inputSettings) inputSettings.value = '';
        const inputVault = document.getElementById('input-vault-import-zip');
        if (inputVault) inputVault.value = '';
        const inputMain = document.getElementById('file-input');
        if (inputMain) inputMain.value = '';
      };

      if (closeBtn) closeBtn.addEventListener('click', hideConfirmModal);
      if (cancelBtn) cancelBtn.addEventListener('click', hideConfirmModal);
      modalConfirm.addEventListener('click', (e) => {
        if (e.target === modalConfirm) hideConfirmModal();
      });

      if (overwriteBtn) {
        overwriteBtn.addEventListener('click', () => {
          const fileToImport = pendingImportZipFile;
          const cb = modalConfirm._onComplete;
          modalConfirm.style.display = 'none';
          if (fileToImport) executeZipImport(fileToImport, cb);
        });
      }

      if (saveFirstBtn) {
        saveFirstBtn.addEventListener('click', () => {
          const fileToImport = pendingImportZipFile;
          const cb = modalConfirm._onComplete;
          modalConfirm.style.display = 'none';
          if (typeof exportMasterSliceZip === 'function') {
            exportMasterSliceZip();
          }
          setTimeout(() => {
            if (fileToImport) executeZipImport(fileToImport, cb);
          }, 600);
        });
      }
    }

    window.promptImportWithBackupOption = promptImportWithBackupOption;
    window.executeZipImport = executeZipImport;

    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith('.zip')) {
          promptImportWithBackupOption(file);
          fileInput.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          const pasteArea = document.getElementById('import-paste-area');
          if (pasteArea) pasteArea.value = evt.target.result;
        };
        reader.readAsText(file);
      });
    }

    const dropZone = document.getElementById('file-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith('.zip')) {
          promptImportWithBackupOption(file);
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          const pasteArea = document.getElementById('import-paste-area');
          if (pasteArea) pasteArea.value = evt.target.result;
        };
        reader.readAsText(file);
      });
    }
  }


  function importContent(rawText) {
    const text = rawText.trim();
    if (!text) return null;

    // JSON
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const json = JSON.parse(text);
        if (json.markdown !== undefined || json.title !== undefined) {
          const draft = createNewDraftModel(json.title || 'Imported Post');
          Object.assign(draft, json);
          draft.id = 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          draft.updatedAt = Date.now();
          return draft;
        }
      } catch (e) {}
    }

    // HTML
    if (text.includes('<html') || text.includes('article-title') || text.includes('article-prose') || text.includes('<p>')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');

      const titleEl = doc.querySelector('.article-title') || doc.querySelector('h1') || doc.querySelector('title');
      let title = titleEl ? titleEl.textContent.trim() : 'Imported Article';
      title = title.replace(/\s*—\s*(?:sheesh\.gg|cedar).*$/i, '').trim();

      const subEl = doc.querySelector('.article-subtitle') || doc.querySelector('meta[name="description"]');
      let subtitle = subEl ? (subEl.getAttribute('content') || subEl.textContent.trim()) : '';

      const dateEl = doc.querySelector('time');
      let date = dateEl ? (dateEl.getAttribute('datetime') || (typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA'))) : (typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toLocaleDateString('en-CA'));

      const authorEl = doc.querySelector('.author-pill span');
      const authorName = authorEl ? authorEl.textContent.trim() : ((typeof projectConfig !== 'undefined' && projectConfig.defaultAuthor) ? projectConfig.defaultAuthor : 'Cedar Staff');

      const tagEl = doc.querySelector('.tool-tag');
      const tag = tagEl ? tagEl.textContent.trim() : '';

      let coverImage = '';
      const firstImg = doc.querySelector('.post-card-img') || doc.querySelector('.featured-post-img') || doc.querySelector('.article-prose img');
      if (firstImg && firstImg.src) {
        coverImage = firstImg.src;
      }

      const proseEl = doc.querySelector('.article-prose') || doc.querySelector('article') || doc.body;
      const markdown = domToMarkdown(proseEl);

      const draft = createNewDraftModel(title);
      draft.subtitle = subtitle;
      draft.slug = generateSlug(title);
      draft.date = date;
      draft.tag = tag;
      draft.authorName = authorName;
      draft.authorInitial = authorName.charAt(0).toUpperCase() || 'S';
      draft.coverImage = coverImage;
      draft.markdown = markdown;
      return draft;
    }

    // Markdown + Frontmatter
    let frontmatter = {};
    let mdBody = text;
    if (text.startsWith('---')) {
      const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (match) {
        const fmText = match[1];
        mdBody = match[2].trim();
        fmText.split('\n').forEach(line => {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
            frontmatter[key] = val;
          }
        });
      }
    }

    const draft = createNewDraftModel(frontmatter.title || 'Imported Draft');
    draft.subtitle = frontmatter.subtitle || '';
    draft.slug = frontmatter.slug || generateSlug(draft.title);
    draft.date = frontmatter.date || draft.date;
    draft.tag = frontmatter.tag || draft.tag;
    draft.authorName = frontmatter.author || draft.authorName;
    draft.coverImage = frontmatter.cover_image || '';
    draft.markdown = mdBody;
    return draft;
  }


  function openPublishDrawer() {
    const el = document.getElementById('modal-export');
    if (!el) return;
    el.style.display = 'flex';
    if (typeof prepareExportModal === 'function') {
      try {
        prepareExportModal();
      } catch (err) {
        console.error('[Cedar] Error preparing export/settings modal:', err);
      }
    }
    void el.offsetWidth; // Force CSS transition reflow
    el.classList.add('open');
    document.body.classList.add('publish-drawer-open');

    // Recalculate textareas once rendered visible and reset initial scroll
    requestAnimationFrame(() => {
      const titleInput = document.getElementById('setup-post-title');
      const subtitleInput = document.getElementById('setup-post-subtitle');
      if (titleInput) {
        autoResizeSetupTextarea(titleInput);
        titleInput.scrollTop = 0;
      }
      if (subtitleInput) {
        autoResizeSetupTextarea(subtitleInput);
        subtitleInput.scrollTop = 0;
      }
      const body = el.querySelector('.modal-body');
      if (body) body.scrollTop = 0;
    });
  }

  function closePublishDrawer() {
    const el = document.getElementById('modal-export');
    if (!el) return;
    el.classList.remove('open');
    document.body.classList.remove('publish-drawer-open');
    setTimeout(() => {
      if (!el.classList.contains('open')) {
        el.style.display = 'none';
      }
    }, 320);
  }

  function openModal(modalId) {
    if (modalId === 'modal-settings') {
      if (typeof navigateTo === 'function') navigateTo('settings');
      return;
    }

    if (modalId === 'modal-export') {
      openPublishDrawer();
      return;
    }

    const modalToRoute = window.MODAL_TO_ROUTE || {};
    const routeName = modalToRoute[modalId];
    if (routeName) {
      const currentRoute = parseRoute(window.location.hash);
      currentRoute.modal = routeName;
      const targetHash = buildCanonicalUrl(currentRoute, currentDraft);
      navigateTo(targetHash);
      return;
    }

    const el = document.getElementById(modalId);
    if (el) {
      el.style.display = 'flex';
      if (modalId === 'modal-insert-image' && typeof window.renderEditorMediaPopup === 'function') {
        window.renderEditorMediaPopup();
      }
    }
  }

  function closeModal(modalElOrId) {
    const el = typeof modalElOrId === 'string' ? document.getElementById(modalElOrId) : modalElOrId;
    if (!el) return;

    if (el.id === 'modal-export') {
      closePublishDrawer();
      return;
    }

    const modalId = el.id;
    const modalToRoute = window.MODAL_TO_ROUTE || {};
    const routeToModal = window.ROUTE_TO_MODAL || {};
    const routeName = modalToRoute[modalId];
    const currentRoute = parseRoute(window.location.hash);

    if (routeName && currentRoute.modal && routeToModal[currentRoute.modal] === modalId) {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        currentRoute.modal = null;
        const targetHash = buildCanonicalUrl(currentRoute, currentDraft);
        navigateTo(targetHash, true);
      }
      return;
    }

    el.style.display = 'none';
  }



  window.openLinkModal = openLinkModal;
  window.renderImageManagerList = renderImageManagerList;
  window.prepareExportModal = prepareExportModal;
  window.setupExportHub = setupExportHub;
  window.renderDraftsList = renderDraftsList;
  window.selectDraft = selectDraft;
  window.duplicateDraft = duplicateDraft;
  window.deleteDraft = deleteDraft;
  window.setupImportControls = setupImportControls;
  window.importContent = importContent;
  window.cycleDraftFeaturedImage = cycleDraftFeaturedImage;
  window.resetDraftFeaturedImage = resetDraftFeaturedImage;
  window.renderSetupFeaturedImage = renderSetupFeaturedImage;
  window.openPublishDrawer = openPublishDrawer;
  window.closePublishDrawer = closePublishDrawer;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.openCropModalWithImage = openCropModalWithImage;
  window.openFeaturedImgLightbox = openFeaturedImgLightbox;
  window.cycleLightbox = cycleLightbox;
  window.confirmLightboxImage = confirmLightboxImage;
  window.cancelLightboxImage = cancelLightboxImage;
  window.getImageBaseFilename = getImageBaseFilename;
  window.resolveImageDisplayUrl = resolveImageDisplayUrl;
  window.getDraftAvailableImages = getDraftAvailableImages;
  window.lightboxState = lightboxState;

  /**
   * Software In-App Confirmation Dialog
   * Replaces browser native window.confirm() with a sleek in-app modal
   */
  function showConfirmDialog({ title = 'Are you sure?', message = '', confirmText = 'OK', cancelText = 'Cancel', isDanger = true } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-app-confirm');
      if (!modal) {
        resolve(window.confirm(message));
        return;
      }
      const titleEl = document.getElementById('app-confirm-title');
      const msgEl = document.getElementById('app-confirm-message');
      const okBtn = document.getElementById('btn-app-confirm-ok');
      const cancelBtn = document.getElementById('btn-app-confirm-cancel');
      const closeBtn = document.getElementById('btn-app-confirm-close');

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
      }
      if (cancelBtn) cancelBtn.textContent = cancelText;

      const cleanup = (result) => {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('mousedown', onBackdropDown);
        modal.removeEventListener('click', onBackdrop);
        window.removeEventListener('keydown', onKeyDown);
        resolve(result);
      };

      const onOk = (e) => {
        if (e) e.stopPropagation();
        cleanup(true);
      };
      const onCancel = (e) => {
        if (e) e.stopPropagation();
        cleanup(false);
      };
      let mouseDownOnConfirmBackdrop = false;
      const onBackdropDown = (e) => {
        mouseDownOnConfirmBackdrop = (e.target === modal);
      };
      const onBackdrop = (e) => {
        if (e.target === modal && mouseDownOnConfirmBackdrop) cleanup(false);
        mouseDownOnConfirmBackdrop = false;
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      modal.addEventListener('mousedown', onBackdropDown);
      modal.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKeyDown);

      modal.style.display = 'flex';
    });
  }
  window.showConfirmDialog = showConfirmDialog;

  const modalsExports = {
    getImageBaseFilename,
    resolveImageDisplayUrl,
    getDraftAvailableImages,
    cycleDraftFeaturedImage,
    resetDraftFeaturedImage,
    renderSetupFeaturedImage,
    openPublishDrawer,
    closePublishDrawer,
    openModal,
    closeModal,
    openLinkModal,
    openCropModalWithImage,
    showPublishMenu,
    prepareExportModal,
    setupExportHub,
    renderImageManagerList,
    renderDraftsList,
    selectDraft,
    duplicateDraft,
    deleteDraft,
    setupImportControls,
    importContent
  };
  window.Cedar.modals = modalsExports;
  window.Outpost.modals = modalsExports;
})();
