/**
 * Cedar - Media Library & Asset Management
 * Handles unique image scanning, preemptive media upload with sanitization toggle support,
 * media grid rendering, and asset actions (copy MD link, relative path, download, delete).
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  const MEDIA_TAGS_STORAGE_KEY = 'cedar_media_tags';

  function getStoredTagsMap() {
    try {
      const raw = localStorage.getItem(MEDIA_TAGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveStoredTagsMap(map) {
    try {
      localStorage.setItem(MEDIA_TAGS_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function getImageTags(filename, defaultTags = []) {
    if (!filename) return [];
    const map = getStoredTagsMap();
    if (Array.isArray(map[filename]) && map[filename].length > 0) {
      return [...map[filename]];
    }
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.mediaLibrary)) {
      const found = projectConfig.mediaLibrary.find(m => m && m.filename === filename);
      if (found && Array.isArray(found.tags) && found.tags.length > 0) return [...found.tags];
    }
    if (Array.isArray(defaultTags) && defaultTags.length > 0) {
      return [...defaultTags];
    }
    return [];
  }

  function setImageTags(filename, tags) {
    if (!filename) return [];
    const cleanTags = Array.from(new Set(
      (tags || [])
        .map(t => String(t).trim().replace(/^#+/, '').toLowerCase())
        .filter(Boolean)
    ));
    const map = getStoredTagsMap();
    map[filename] = cleanTags;
    saveStoredTagsMap(map);

    // Sync into projectConfig.mediaLibrary
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.mediaLibrary)) {
      const found = projectConfig.mediaLibrary.find(m => m && m.filename === filename);
      if (found) {
        found.tags = cleanTags;
        if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
      }
    }

    // Sync into drafts images
    const currentDraftsList = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
      ? window.CedarStore.getAllDrafts()
      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);
    if (Array.isArray(currentDraftsList) && currentDraftsList.length > 0) {
      let touched = false;
      currentDraftsList.forEach(d => {
        if (d.images && Array.isArray(d.images)) {
          d.images.forEach(img => {
            if (img && img.filename === filename) {
              img.tags = cleanTags;
              touched = true;
            }
          });
        }
      });
      if (touched && typeof saveDraftsToStorage === 'function') {
        saveDraftsToStorage();
      }
    }

    return cleanTags;
  }

  function getAllExistingTagsWithCounts() {
    const map = getStoredTagsMap();
    const counts = new Map();

    Object.values(map).forEach(tagList => {
      if (Array.isArray(tagList)) {
        tagList.forEach(t => {
          if (t) {
            const norm = String(t).trim().replace(/^#+/, '').toLowerCase();
            if (norm && norm !== 'links') counts.set(norm, (counts.get(norm) || 0) + 1);
          }
        });
      }
    });

    // Also include tags from site media or unique assets not explicitly recorded in map
    try {
      const images = getAllUniqueImages();
      images.forEach(img => {
        if (img && Array.isArray(img.tags) && (!map[img.filename] || map[img.filename].length === 0)) {
          img.tags.forEach(t => {
            const norm = String(t).trim().replace(/^#+/, '').toLowerCase();
            if (norm && norm !== 'links') counts.set(norm, (counts.get(norm) || 0) + 1);
          });
        }
      });
    } catch (e) {}

    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  function getAllUniqueImages() {
    const map = new Map();
    const cfg = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
    const deletedImages = new Set(Array.isArray(cfg?.deletedImages) ? cfg.deletedImages : []);
    const isDeleted = (fn) => {
      if (!fn) return false;
      const str = typeof fn === 'string' ? fn : (fn?.filename || fn?.relativePath || fn?.src || fn?.url || '');
      if (!str) return false;
      const clean = str.split('/').pop().split('\\').pop();
      return deletedImages.has(str) || deletedImages.has(clean);
    };

    // 1. Preemptively uploaded standalone assets from projectConfig.mediaLibrary
    if (cfg && Array.isArray(cfg.mediaLibrary)) {
      cfg.mediaLibrary.forEach(img => {
        if (img && img.filename && !map.has(img.filename)) {
          if (isDeleted(img.filename) || isDeleted(img.relativePath) || isDeleted(img.src)) return;
          const isLinkAsset = img.mediaCategory === 'links' || img.folder === 'links' || img.folder === 'media/links' || (Array.isArray(img.tags) && img.tags.includes('links')) || (typeof img.relativePath === 'string' && img.relativePath.startsWith('media/links')) || (img.postId === 'page_links');
          if (isLinkAsset) return;
          const inferredCat = img.postId
            ? (String(img.postId).startsWith('page_') ? 'page' : 'post')
            : (img.postTitle && img.postTitle !== 'Media Library' ? 'post' : 'upload');
          const itemCategory = img.mediaCategory || inferredCat;
          const pTitle = img.postTitle || 'Media Library';
          map.set(img.filename, {
            ...img,
            postTitle: pTitle,
            isStandalone: true,
            mediaCategory: itemCategory,
            folder: img.folder,
            tags: getImageTags(img.filename)
          });
        }
      });
    }

    // 2. Images attached to drafts / posts / notes / pages
    const allDrafts = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
      ? window.CedarStore.getAllDrafts()
      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);
    allDrafts.forEach(d => {
      const isLinksDraft = (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links');
      const isAboutCedarDraft = (d.id === 'page_about_cedar' || d.slug === 'about-cedar' || (d.title || '').trim().toLowerCase() === 'about cedar');
      if (isLinksDraft || isAboutCedarDraft) {
        // Links page icons and internal About Cedar page are never shown in the media pool
        return;
      }
      let itemCat = 'post';
      let itemTitle = d.title || 'Untitled Post';
      if (d.type === 'note') {
        itemCat = 'note';
        itemTitle = d.title || ('Note #' + (d.noteNumber || ''));
      } else if (d.type === 'page') {
        itemCat = 'page';
        itemTitle = d.title || 'Untitled Page';
      }

      if (d.images && Array.isArray(d.images) && typeof reconcileDraftImages === 'function') {
        reconcileDraftImages(d);
      }

      // Collect all image references from this draft
      const rawDraftImages = Array.isArray(d.images) ? d.images.filter(im => {
        const fn = typeof im === 'string' ? im : (im?.filename || im?.relativePath || im?.src || '');
        return !isDeleted(fn);
      }) : [];
      const draftImages = [...rawDraftImages];
      if (d.coverImage) {
        const cFn = typeof d.coverImage === 'string' ? d.coverImage : (d.coverImage?.filename || d.coverImage?.url);
        if (cFn && !isDeleted(cFn) && !draftImages.some(im => (im?.filename || im) === cFn)) {
          draftImages.push({ filename: cFn, src: cFn });
        }
      }
      if (d.featuredImage) {
        const fFn = typeof d.featuredImage === 'string' ? d.featuredImage : (d.featuredImage?.filename || d.featuredImage?.url);
        if (fFn && !isDeleted(fFn) && !draftImages.some(im => (im?.filename || im) === fFn)) {
          draftImages.push({ filename: fFn, src: fFn });
        }
      }

      draftImages.forEach(img => {
        let fn = img && (img.filename || (typeof img === 'string' ? img : ''));
        if (fn) {
          if (fn.includes('/')) fn = fn.split('/').pop();
          if (fn.includes('\\')) fn = fn.split('\\').pop();
          if (isDeleted(fn)) return;
          if (map.has(fn)) {
            const existing = map.get(fn);
            if (existing.isStandalone && (existing.postTitle === 'Media Library' || existing.mediaCategory === 'upload')) {
              existing.postTitle = itemTitle;
              existing.postId = d.id;
              existing.postSlug = d.slug || (typeof generateSlug === 'function' ? generateSlug(d.title) : itemCat);
              existing.mediaCategory = itemCat;
            }
            if (!existing.tags || existing.tags.length === 0) {
              existing.tags = getImageTags(fn);
            }
          } else {
            map.set(fn, {
              ...(typeof img === 'object' ? img : {}),
              filename: fn,
              postTitle: itemTitle,
              postId: d.id,
              postSlug: d.slug || (typeof generateSlug === 'function' ? generateSlug(d.title) : itemCat),
              mediaCategory: itemCat,
              tags: getImageTags(fn)
            });
          }
        }
      });
    });

    // 2b. Static pages from projectConfig.pages
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.pages)) {
      projectConfig.pages.forEach(p => {
        if (!p || p.id === 'page_about_cedar' || p.slug === 'about-cedar' || (p.title || '').trim().toLowerCase() === 'about cedar') return;
        const pageTitle = p.title || p.name || 'Static Page';
        const pageImages = Array.isArray(p.images) ? p.images.filter(im => !isDeleted(typeof im === 'string' ? im : im?.filename)) : [];
        if (p.coverImage && !isDeleted(p.coverImage)) pageImages.push({ filename: p.coverImage });
        pageImages.forEach(img => {
          let fn = img && (img.filename || (typeof img === 'string' ? img : ''));
          if (fn) {
            if (fn.includes('/')) fn = fn.split('/').pop();
            if (fn.includes('\\')) fn = fn.split('\\').pop();
            if (isDeleted(fn)) return;
            if (map.has(fn)) {
              const existing = map.get(fn);
              if (existing.isStandalone && existing.postTitle === 'Media Library') {
                existing.postTitle = pageTitle;
                existing.postId = p.id;
                existing.mediaCategory = 'page';
              }
            } else {
              map.set(fn, {
                ...(typeof img === 'object' ? img : {}),
                filename: fn,
                postTitle: pageTitle,
                postId: p.id,
                mediaCategory: 'page',
                tags: getImageTags(fn)
              });
            }
          }
        });
      });
    }

    // 3. Site Media: Author Avatars & Site Branding Assets
    if (typeof projectConfig !== 'undefined' && projectConfig) {
      // 3a. Author avatars
      if (Array.isArray(projectConfig.authors)) {
        projectConfig.authors.forEach(auth => {
          if (!auth) return;
          const authorName = (typeof auth === 'object' ? auth.name : auth) || 'Author';
          const avatarUrl = (typeof auth === 'object' ? auth.avatar : '') || '';
          if (!avatarUrl) return;

          let baseFilename = avatarUrl;
          if (baseFilename.startsWith('data:')) {
            baseFilename = `${authorName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_avatar.png`;
          } else if (baseFilename.includes('/')) {
            baseFilename = baseFilename.split('/').pop();
          } else if (baseFilename.includes('\\')) {
            baseFilename = baseFilename.split('\\').pop();
          }

          if (isDeleted(avatarUrl) || isDeleted(baseFilename)) return;

          const cleanAuthorTag = authorName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
          const defaultAvatarTags = ['site', 'author', 'avatar', cleanAuthorTag].filter(Boolean);

          const matchedKey = map.has(avatarUrl) ? avatarUrl : (map.has(baseFilename) ? baseFilename : null);
          if (matchedKey) {
            const existing = map.get(matchedKey);
            existing.isSiteMedia = true;
            existing.mediaCategory = 'site';
            existing.siteMediaType = 'avatar';
            existing.authorName = authorName;
            existing.title = existing.title || `${authorName} (Author Avatar)`;
            existing.postTitle = `Author: ${authorName}`;
            if (!existing.src) existing.src = avatarUrl;
            if (!existing.tags || existing.tags.length === 0) {
              existing.tags = getImageTags(matchedKey, defaultAvatarTags);
            }
          } else {
            const key = baseFilename || avatarUrl;
            map.set(key, {
              filename: key,
              src: avatarUrl,
              title: `${authorName} (Author Avatar)`,
              postTitle: `Author: ${authorName}`,
              isSiteMedia: true,
              mediaCategory: 'site',
              siteMediaType: 'avatar',
              authorName: authorName,
              tags: getImageTags(key, defaultAvatarTags)
            });
          }
        });
      }

      // 3b. Branding Logos & Favicons
      const branding = projectConfig.design?.branding;
      if (branding) {
        if (branding.generalLogo) {
          const logoUrl = branding.generalLogo;
          let baseFilename = logoUrl;
          if (baseFilename.startsWith('data:')) {
            baseFilename = 'site_logo.png';
          } else if (baseFilename.includes('/')) {
            baseFilename = baseFilename.split('/').pop();
          } else if (baseFilename.includes('\\')) {
            baseFilename = baseFilename.split('\\').pop();
          }

          if (!isDeleted(logoUrl) && !isDeleted(baseFilename)) {
            const defaultLogoTags = ['site', 'logo', 'branding'];
            const matchedKey = map.has(logoUrl) ? logoUrl : (map.has(baseFilename) ? baseFilename : null);
            if (matchedKey) {
              const existing = map.get(matchedKey);
              existing.isSiteMedia = true;
              existing.mediaCategory = 'site';
              existing.siteMediaType = 'logo';
              existing.title = existing.title || 'Site Logo';
              existing.postTitle = 'Branding: Site Logo';
              if (!existing.src) existing.src = logoUrl;
              if (!existing.tags || existing.tags.length === 0) {
                existing.tags = getImageTags(matchedKey, defaultLogoTags);
              }
            } else {
              const key = baseFilename || logoUrl;
              map.set(key, {
                filename: key,
                src: logoUrl,
                title: 'Site Logo',
                postTitle: 'Branding: Site Logo',
                isSiteMedia: true,
                mediaCategory: 'site',
                siteMediaType: 'logo',
                tags: getImageTags(key, defaultLogoTags)
              });
            }
          }
        }
      }

      // 3c. Masthead Logo if custom
      const mhLogo = projectConfig.design?.masthead?.elements?.logo?.customImage;
      if (mhLogo) {
        let baseFilename = mhLogo;
        if (baseFilename.includes('/')) baseFilename = baseFilename.split('/').pop();
        else if (baseFilename.includes('\\')) baseFilename = baseFilename.split('\\').pop();

        if (!isDeleted(mhLogo) && !isDeleted(baseFilename)) {
          const defaultMhTags = ['site', 'masthead', 'logo'];
          const matchedKey = map.has(mhLogo) ? mhLogo : (map.has(baseFilename) ? baseFilename : null);
          if (matchedKey) {
            const existing = map.get(matchedKey);
            existing.isSiteMedia = true;
            existing.mediaCategory = 'site';
            existing.siteMediaType = 'masthead';
            existing.title = existing.title || 'Masthead Logo';
            existing.postTitle = 'Design: Masthead Logo';
            if (!existing.src) existing.src = mhLogo;
            if (!existing.tags || existing.tags.length === 0) {
              existing.tags = getImageTags(matchedKey, defaultMhTags);
            }
          } else {
            const key = baseFilename || mhLogo;
            map.set(key, {
              filename: key,
              src: mhLogo,
              title: 'Masthead Logo',
              postTitle: 'Design: Masthead Logo',
              isSiteMedia: true,
              mediaCategory: 'site',
              siteMediaType: 'masthead',
              tags: getImageTags(key, defaultMhTags)
            });
          }
        }
      }
    }

    // Final defensive filter: ensure NO links page icons or deleted assets ever enter the media pool
    return Array.from(map.values()).filter(img => {
      if (!img) return false;
      if (isDeleted(img.filename) || isDeleted(img.relativePath) || isDeleted(img.src)) return false;
      if (img.mediaCategory === 'links' || img.postId === 'page_links') return false;
      if (img.folder === 'links' || img.folder === 'media/links') return false;
      if (typeof img.relativePath === 'string' && img.relativePath.startsWith('media/links')) return false;
      if (typeof img.filename === 'string' && (img.filename.startsWith('link_icon_') || img.filename.startsWith('links_avatar_') || img.filename.startsWith('links_wallpaper_'))) return false;
      if (Array.isArray(img.tags) && img.tags.includes('links')) return false;
      return true;
    });
  }

  async function resolveMediaBlob(filename, imgObj) {
    if (!filename) return null;
    const cleanName = String(filename).split('/').pop().split('\\').pop();

    // 1. Check in-memory window.imageRegistry first
    if (typeof window !== 'undefined' && window.imageRegistry && typeof window.imageRegistry.get === 'function') {
      const regCandidates = [
        filename,
        cleanName,
        `blog/images/${cleanName}`,
        `/blog/images/${cleanName}`,
        `images/${cleanName}`,
        `/images/${cleanName}`,
        `media/${cleanName}`,
        `media/authors/${cleanName}`
      ];
      for (const k of regCandidates) {
        if (!k) continue;
        const reg = window.imageRegistry.get(k);
        if (reg && typeof reg === 'object') {
          if (reg.blob instanceof Blob) return reg.blob;
          if (reg.dataUrl && reg.dataUrl.startsWith('data:') && typeof dataUrlToBlob === 'function') {
            const b = dataUrlToBlob(reg.dataUrl);
            if (b) return b;
          }
        }
      }
    }

    // 2. Check High-Capacity Virtual Vault (OPFS / IndexedDB)
    const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
    if (vStorage && typeof vStorage.readBlob === 'function') {
      const vPaths = [
        `blog/images/${cleanName}`,
        `images/${cleanName}`,
        `media/${cleanName}`,
        `media/authors/${cleanName}`,
        `media/branding/${cleanName}`,
        cleanName
      ];
      if (imgObj && imgObj.src && typeof imgObj.src === 'string' && !imgObj.src.startsWith('data:') && !imgObj.src.startsWith('blob:')) {
        vPaths.unshift(imgObj.src.replace(/^\/+/, ''));
      }
      for (const vp of vPaths) {
        if (!vp) continue;
        try {
          const b = await vStorage.readBlob(vp);
          if (b && b.size > 0) return b;
        } catch (e) {}
      }
    }

    // 3. Check connected local folder (SheeshVault) across all standard media directories
    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {
      const vaultPaths = [
        `blog/images/${cleanName}`,
        `images/${cleanName}`,
        `media/authors/${cleanName}`,
        `media/${cleanName}`,
        `media/branding/${cleanName}`,
        cleanName
      ];
      if (imgObj && imgObj.src && typeof imgObj.src === 'string' && !imgObj.src.startsWith('data:') && !imgObj.src.startsWith('blob:')) {
        vaultPaths.unshift(imgObj.src.replace(/^\/+/, ''));
      }
      if (imgObj && imgObj.postSlug) {
        const ps = imgObj.postSlug;
        vaultPaths.push(
          `blog/published/${ps}/${cleanName}`,
          `blog/drafts/${ps}/${cleanName}`,
          `blog/hidden/${ps}/${cleanName}`,
          `pages/published/${ps}/${cleanName}`,
          `pages/hidden/${ps}/${cleanName}`
        );
      }
      for (const vp of vaultPaths) {
        if (!vp) continue;
        try {
          const b = await window.SheeshVault.readFile(vp, 'blob');
          if (b && b.size > 0) return b;
        } catch (e) {}
      }
    }
    return null;
  }

  async function handleMediaUpload(files) {
    if (!files || files.length === 0) return;
    const isSanitize = projectConfig.sanitizeImages !== false;
    if (!projectConfig.mediaLibrary || !Array.isArray(projectConfig.mediaLibrary)) {
      projectConfig.mediaLibrary = [];
    }

    let successCount = 0;
    const uploadedImages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dotIdx = file.name.lastIndexOf('.');
      const baseSlug = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
      const ext = dotIdx > 0 ? file.name.substring(dotIdx + 1).toLowerCase() : 'png';

      let imgObj = null;

      if (isSanitize && file.type.startsWith('image/')) {
        try {
          if (typeof sanitizeImage === 'function') {
            imgObj = await sanitizeImage(file, baseSlug);
          }
        } catch (err) {
          console.warn('Sanitization failed, falling back to raw upload:', err);
        }
      }

      if (!imgObj) {
        const cleanSlug = (typeof generateSlug === 'function') ? generateSlug(baseSlug) : baseSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const randSuffix = Math.random().toString(36).substr(2, 5);
        const filename = `${cleanSlug}-${Date.now().toString(36)}-${randSuffix}.${ext}`;
        const relativePath = `/blog/images/${filename}`;

        let width = 0;
        let height = 0;
        if (file.type.startsWith('image/')) {
          try {
            const dims = await new Promise((resolve) => {
              const testImg = new Image();
              const tempUrl = URL.createObjectURL(file);
              testImg.onload = () => {
                const w = testImg.naturalWidth;
                const h = testImg.naturalHeight;
                URL.revokeObjectURL(tempUrl);
                resolve({ w, h });
              };
              testImg.onerror = () => {
                URL.revokeObjectURL(tempUrl);
                resolve({ w: 0, h: 0 });
              };
              testImg.src = tempUrl;
            });
            width = dims.w;
            height = dims.h;
          } catch (e) {}
        }

        imgObj = {
          filename: filename,
          relativePath: relativePath,
          blob: file,
          width: width,
          height: height,
          size: file.size,
          mimeType: file.type || `image/${ext}`,
          sanitized: false,
          createdAt: Date.now(),
          tags: []
        };
      }

      if (imgObj.blob) {
        imgObj.objectUrl = URL.createObjectURL(imgObj.blob);
        imgObj.dataUrl = imgObj.objectUrl;
      }

      if (window.imageRegistry) {
        imageRegistry.set(imgObj.filename, imgObj);
        imageRegistry.set(imgObj.relativePath, imgObj);
      }

      imgObj.postTitle = 'Media Library';
      imgObj.isStandalone = true;
      imgObj.tags = imgObj.tags || [];

      if ((window.CedarVirtualStorage || window.OutpostVirtualStorage) && imgObj.blob) {
        try {
          await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeBlob(`blog/images/${imgObj.filename}`, imgObj.blob);
          await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeBlob(`media/${imgObj.filename}`, imgObj.blob);
        } catch (err) {
          console.warn('[Media] Could not write asset to Virtual Vault:', err);
        }
      }

      if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {
        try {
          let writeBlob = imgObj.blob;
          if (!writeBlob && imgObj.dataUrl && (typeof dataUrlToBlob === 'function')) {
            writeBlob = dataUrlToBlob(imgObj.dataUrl);
          }
          if (writeBlob) {
            await window.SheeshVault.writeFile(`blog/images/${imgObj.filename}`, writeBlob);
            await window.SheeshVault.writeFile(`media/${imgObj.filename}`, writeBlob);
          }
        } catch (err) {
          console.warn('Could not write uploaded asset to SheeshVault:', err);
        }
      }

      if (projectConfig && Array.isArray(projectConfig.deletedImages)) {
        projectConfig.deletedImages = projectConfig.deletedImages.filter(f => f !== imgObj.filename && f !== baseSlug && !imgObj.filename.startsWith(f));
      }

      projectConfig.mediaLibrary.unshift(imgObj);
      uploadedImages.push({
        filename: imgObj.filename,
        src: imgObj.objectUrl || imgObj.dataUrl || (imgObj.filename ? `blog/images/${imgObj.filename}` : ''),
        timestamp: imgObj.createdAt || Date.now()
      });
      successCount++;
    }

    saveProjectToStorage();
    if (uploadedImages.length > 0 && typeof window.logActivity === 'function') {
      window.logActivity('media_upload', { images: uploadedImages });
    }
    renderDerivedMediaLibrary();
    if (typeof showToast === 'function') {
      showToast(`Uploaded ${successCount} asset(s) to High-Capacity storage`);
    }
  }

  // Pixabay / Collage-style 4-Column Masonry Item
  function createMediaMasonryDOM(img) {
    const item = document.createElement('div');
    item.className = 'media-masonry-item' + (img.isSiteMedia ? ' is-site-media' : '');
    item.dataset.filename = img.filename;

    let src = img.objectUrl || img.dataUrl || (img.blob ? URL.createObjectURL(img.blob) : '');
    if (!src && typeof window !== 'undefined' && window.imageRegistry && typeof window.imageRegistry.get === 'function') {
      const cleanFn = String(img.filename || '').split('/').pop().split('\\').pop();
      const reg = window.imageRegistry.get(img.filename)
        || window.imageRegistry.get(cleanFn)
        || (img.src && window.imageRegistry.get(img.src))
        || (img.relativePath && window.imageRegistry.get(img.relativePath))
        || window.imageRegistry.get(`images/${cleanFn}`)
        || window.imageRegistry.get(`blog/images/${cleanFn}`);
      if (reg && typeof reg === 'object') {
        src = reg.objectUrl || reg.dataUrl || (reg.blob instanceof Blob ? URL.createObjectURL(reg.blob) : '');
        if (src) {
          img.objectUrl = reg.objectUrl || src;
          img.dataUrl = reg.dataUrl || src;
          if (reg.blob instanceof Blob) img.blob = reg.blob;
        }
      }
    }
    if (!src) src = img.src || img.url || '';
    if (!src && img.relativePath) src = img.relativePath;
    if (!src && img.filename) {
      if (img.filename.startsWith('images/') || img.filename.startsWith('icon') || img.filename.startsWith('/') || img.filename.startsWith('http')) {
        src = img.filename;
      }
    }
    const relPath = img.relativePath || (img.isSiteMedia ? (img.src || img.filename) : `/blog/images/${img.filename}`);
    const displayTitle = img.title || (img.postTitle && img.postTitle !== 'Media Library' ? img.postTitle : img.filename);
    const tagsText = (img.tags && img.tags.length > 0) ? img.tags.map(t => '#' + t).join(' ') : '';

    item.innerHTML = `
      <img src="${src || ''}" alt="${escapeHtml(img.filename)}" class="media-masonry-img" data-filename="${escapeHtml(img.filename)}" loading="lazy">
      <div class="media-masonry-info">
        <span class="media-masonry-title">${escapeHtml(displayTitle)}</span>
        ${tagsText ? `<span class="media-masonry-tags">${escapeHtml(tagsText)}</span>` : ''}
      </div>
    `;

    const isBuiltInStaticAsset = /^(?:\/)?(?:logo\.(?:png|svg)|icon\.(?:png|ico)|images\/(?:Lamp\.png|sunflower-showcase\.jpg))$/i.test(String(src || '').trim());
    const hydrateThumbFromVault = () => {
      resolveMediaBlob(img.filename, img).then(blob => {
        if (blob) {
          img.blob = blob;
          img.objectUrl = URL.createObjectURL(blob);
          if (!img.dataUrl || !img.dataUrl.startsWith('data:')) {
            img.dataUrl = img.objectUrl;
          }
          if (window.imageRegistry) {
            imageRegistry.set(img.filename, img);
            imageRegistry.set(relPath, img);
          }
          const thumbImg = item.querySelector('.media-masonry-img');
          if (thumbImg) thumbImg.src = img.objectUrl;
        }
      });
    };

    // Asynchronously resolve blob from Virtual Vault / SheeshVault if not already a data: or blob: URL
    if (!src || (!src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('http') && !isBuiltInStaticAsset)) {
      hydrateThumbFromVault();
    } else {
      const thumbImg = item.querySelector('.media-masonry-img');
      if (thumbImg) {
        thumbImg.addEventListener('error', () => hydrateThumbFromVault(), { once: true });
      }
    }

    // Click: Highlights the image and opens centered image lightbox right away
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const allItems = document.querySelectorAll('#grid-media-library .media-masonry-item');
      allItems.forEach(el => el.classList.remove('is-highlighted'));
      item.classList.add('is-highlighted');
      window._selectedMediaFilename = img.filename;
      openMediaLightbox(img);
    });

    return item;
  }

  // =========================================================================
  // LIGHTBOX & SLIDE-OUT TAG DRAWER CONTROLLER
  // =========================================================================

  function updateLightboxHashtagsPreview(img) {
    const preview = document.getElementById('media-lightbox-tags-preview');
    if (!preview) return;
    const tags = img.tags || [];
    if (tags.length === 0) {
      preview.innerHTML = '<span class="lightbox-empty-tags-hint">No tags yet &bull; Click &lsquo;Add Tags&rsquo; to organize</span>';
      return;
    }
    preview.innerHTML = tags.map(t => `<span class="lightbox-hashtag">#${escapeHtml(t)}</span>`).join('');
  }

  function openMediaLightbox(img) {
    if (!img) return;
    window._currentLightboxImage = img;
    const overlay = document.getElementById('media-lightbox-overlay');
    const lightboxImg = document.getElementById('media-lightbox-img');
    const captionEl = document.getElementById('media-lightbox-caption');
    if (!overlay || !lightboxImg) return;

    let src = img.objectUrl || img.dataUrl || img.src || img.url || (img.blob ? URL.createObjectURL(img.blob) : '');
    if (!src && img.relativePath) src = img.relativePath;
    if (!src && img.filename) {
      if (img.filename.startsWith('images/') || img.filename.startsWith('icon') || img.filename.startsWith('/') || img.filename.startsWith('http')) {
        src = img.filename;
      } else {
        src = `blog/images/${img.filename}`;
      }
    }
    lightboxImg.src = src || '';
    lightboxImg.alt = img.filename || 'Media Asset';

    // Asynchronously resolve if not yet a data: or blob: URL in memory
    if (!src || (!src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('http'))) {
      resolveMediaBlob(img.filename, img).then(blob => {
        if (blob) {
          img.blob = blob;
          img.objectUrl = URL.createObjectURL(blob);
          if (!img.dataUrl || !img.dataUrl.startsWith('data:')) {
            img.dataUrl = img.objectUrl;
          }
          lightboxImg.src = img.objectUrl;
        }
      });
    }

    // Hashtags Preview (Top-Left above image, taking up to 2/3rds space)
    img.tags = getImageTags(img.filename, img.tags || []);
    updateLightboxHashtagsPreview(img);

    // Caption: Bold title directly below image (omit raw filename)
    const title = img.title || (img.postTitle && img.postTitle !== 'Media Library' ? img.postTitle : (img.isSiteMedia ? 'Site Media' : 'Media Asset'));
    if (captionEl) {
      captionEl.innerHTML = `
        <strong class="media-lightbox-title">${escapeHtml(title)}</strong>
      `;
    }

    const downloadBtn = document.getElementById('btn-lightbox-download-img');
    if (downloadBtn) {
      const dlFilename = getMediaDownloadFilename(img);
      downloadBtn.title = `Download ${dlFilename}`;
    }

    // Push history state so browser Back button cleanly dismisses lightbox
    if (!window._lightboxHistoryActive) {
      try {
        window.history.pushState({ cedarMediaLightbox: true, outpostMediaLightbox: true }, '', window.location.hash || '#media');
        window._lightboxHistoryActive = true;
      } catch (e) {}
    }

    // Ensure tag drawer is closed initially
    overlay.classList.remove('tag-drawer-open');
    overlay.style.display = 'flex';
  }

  function closeMediaLightbox(popHistory = true) {
    const overlay = document.getElementById('media-lightbox-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.classList.remove('tag-drawer-open');
    }
    window._currentLightboxImage = null;
    if (popHistory && window._lightboxHistoryActive) {
      window._lightboxHistoryActive = false;
      try {
        window.history.back();
      } catch (e) {}
    } else {
      window._lightboxHistoryActive = false;
    }
  }

  function openTagDrawer() {
    const overlay = document.getElementById('media-lightbox-overlay');
    if (!overlay || !window._currentLightboxImage) return;
    overlay.classList.add('tag-drawer-open');
    renderTagDrawer(window._currentLightboxImage);

    setTimeout(() => {
      const input = document.getElementById('input-new-tag');
      if (input) {
        input.value = '';
        input.focus();
      }
    }, 150);
  }

  function closeTagDrawer() {
    const overlay = document.getElementById('media-lightbox-overlay');
    if (overlay) {
      overlay.classList.remove('tag-drawer-open');
    }
  }

  function getMediaDownloadFilename(img) {
    if (!img) return 'download.png';
    let fn = img.filename || '';
    if (fn.startsWith('data:') || fn.length > 50 || !fn.includes('.')) {
      if (img.authorName) {
        fn = `${img.authorName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_avatar.png`;
      } else if (img.title && img.title !== 'Media Asset' && img.title !== 'Media Library') {
        fn = `${img.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.png`;
      } else if (img.postTitle && img.postTitle !== 'Media Library') {
        fn = `${img.postTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.png`;
      } else {
        fn = 'image.png';
      }
    } else {
      fn = fn.split('/').pop().split('\\').pop();
    }
    if (!fn.includes('.')) {
      fn += '.png';
    }
    return fn;
  }

  async function downloadCurrentLightboxImage() {
    const img = window._currentLightboxImage;
    if (!img) return;
    const filename = getMediaDownloadFilename(img);

    // 1. Direct Blob
    if (img.blob instanceof Blob) {
      if (typeof triggerDownload === 'function') {
        triggerDownload(filename, img.blob, img.blob.type || 'image/png');
      } else {
        triggerDownloadDirect(filename, img.blob, img.blob.type || 'image/png');
      }
      return;
    }

    // 2. Data URL
    const dataUrl = img.dataUrl || (typeof img.src === 'string' && img.src.startsWith('data:') ? img.src : null);
    if (dataUrl && typeof dataUrlToBlob === 'function') {
      try {
        const blob = dataUrlToBlob(dataUrl);
        if (blob) {
          if (typeof triggerDownload === 'function') {
            triggerDownload(filename, blob, blob.type || 'image/png');
          } else {
            triggerDownloadDirect(filename, blob, blob.type || 'image/png');
          }
          return;
        }
      } catch (err) {
        console.warn('[Media] Could not convert dataUrl to blob:', err);
      }
    }

    // 3. Resolve from Storage
    if (typeof resolveMediaBlob === 'function' && img.filename) {
      try {
        const blob = await resolveMediaBlob(img.filename);
        if (blob) {
          img.blob = blob;
          if (typeof triggerDownload === 'function') {
            triggerDownload(filename, blob, blob.type || 'image/png');
          } else {
            triggerDownloadDirect(filename, blob, blob.type || 'image/png');
          }
          return;
        }
      } catch (e) {
        console.warn('[Media] Could not resolve blob from storage:', e);
      }
    }

    // 4. Fallback to src / objectUrl / blog/images
    const src = img.objectUrl || img.src || img.url || (img.filename ? `blog/images/${img.filename}` : '');
    if (src) {
      try {
        const resp = await fetch(src);
        if (resp.ok) {
          const blob = await resp.blob();
          if (typeof triggerDownload === 'function') {
            triggerDownload(filename, blob, blob.type || 'image/png');
          } else {
            triggerDownloadDirect(filename, blob, blob.type || 'image/png');
          }
          return;
        }
      } catch (e) {}

      const a = document.createElement('a');
      a.href = src;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function triggerDownloadDirect(filename, content, mimeType = 'image/png') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderTagDrawer(img) {
    if (!img) return;
    const associatedContainer = document.getElementById('drawer-associated-tags');
    const associatedCountBadge = document.getElementById('drawer-associated-count');
    const existingContainer = document.getElementById('drawer-existing-tags');
    if (!associatedContainer || !existingContainer) return;

    img.tags = getImageTags(img.filename, img.tags || []);
    const tags = img.tags || [];

    if (associatedCountBadge) {
      associatedCountBadge.textContent = tags.length;
    }

    // 1) List of tags currently associated with the image
    if (tags.length === 0) {
      associatedContainer.innerHTML = '<p style="font-size: 0.8rem; color: #71717a; margin: 0.25rem 0;">No tags associated yet.</p>';
    } else {
      associatedContainer.innerHTML = '';
      tags.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip-associated';
        chip.innerHTML = `#${escapeHtml(t)} <button type="button" class="tag-chip-remove" title="Remove #${escapeHtml(t)}">&times;</button>`;
        chip.querySelector('.tag-chip-remove')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const nextTags = tags.filter(existing => existing !== t);
          img.tags = setImageTags(img.filename, nextTags);
          updateLightboxHashtagsPreview(img);
          renderTagDrawer(img);
          updateGridItemTagsUI(img);
        });
        associatedContainer.appendChild(chip);
      });
    }

    // 3) List of tags already in the system, sorted by how often they are used
    const allSystemTags = getAllExistingTagsWithCounts();
    // Exclude tags that are already associated with this image
    const availableTags = allSystemTags.filter(item => !tags.includes(item.tag));

    if (availableTags.length === 0) {
      existingContainer.innerHTML = '<p style="font-size: 0.8rem; color: #71717a; margin: 0.25rem 0;">No other tags found in system.</p>';
    } else {
      existingContainer.innerHTML = '';
      availableTags.forEach(({ tag, count }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-chip-existing';
        btn.innerHTML = `+ #${escapeHtml(tag)} <span class="tag-count">(${count})</span>`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Shifts it from the 'existing' list to the 'associated' list
          const nextTags = [...tags, tag];
          img.tags = setImageTags(img.filename, nextTags);
          updateLightboxHashtagsPreview(img);
          renderTagDrawer(img);
          updateGridItemTagsUI(img);
        });
        existingContainer.appendChild(btn);
      });
    }
  }

  function updateGridItemTagsUI(img) {
    if (!img) return;
    const item = document.querySelector(`#grid-media-library .media-masonry-item[data-filename="${img.filename}"]`);
    if (item) {
      let tagsEl = item.querySelector('.media-masonry-tags');
      const tagsText = (img.tags && img.tags.length > 0) ? img.tags.map(t => '#' + t).join(' ') : '';
      if (tagsText) {
        if (!tagsEl) {
          const info = item.querySelector('.media-masonry-info');
          if (info) {
            tagsEl = document.createElement('span');
            tagsEl.className = 'media-masonry-tags';
            info.appendChild(tagsEl);
          }
        }
        if (tagsEl) tagsEl.textContent = tagsText;
      } else if (tagsEl) {
        tagsEl.remove();
      }
    }
  }

  const MEDIA_PAGE_SIZE = 32;

  function renderDerivedMediaLibrary() {
    const grid = document.getElementById('grid-media-library');
    const searchVal = (document.getElementById('media-search-input')?.value || '').toLowerCase().trim();
    if (!grid) return;

    let images = getAllUniqueImages();

    // Apply category filter
    let activeFilter = window._mediaActiveFilter || 'all';
    if (activeFilter === 'links') {
      activeFilter = 'all';
      window._mediaActiveFilter = 'all';
    }
    if (activeFilter === 'site') {
      images = images.filter(img => img.isSiteMedia || img.mediaCategory === 'site');
    } else if (activeFilter === 'post') {
      images = images.filter(img => !img.isSiteMedia && (img.mediaCategory === 'post' || (!img.mediaCategory && img.postId && img.postId !== 'page_links')));
    } else if (activeFilter === 'page') {
      images = images.filter(img => !img.isSiteMedia && img.mediaCategory === 'page');
    } else if (activeFilter === 'upload') {
      images = images.filter(img => !img.isSiteMedia && (img.isStandalone || img.mediaCategory === 'upload') && !img.postId && img.mediaCategory !== 'post' && img.mediaCategory !== 'note' && img.mediaCategory !== 'page' && img.mediaCategory !== 'links');
    }

    if (searchVal) {
      const cleanSearch = searchVal.replace(/^#+/, '').trim();
      images = images.filter(img =>
        (img.filename && img.filename.toLowerCase().includes(searchVal)) ||
        (img.title && img.title.toLowerCase().includes(searchVal)) ||
        (img.postTitle && img.postTitle.toLowerCase().includes(searchVal)) ||
        (img.tags && img.tags.some(t => t.toLowerCase().includes(cleanSearch)))
      );
    }

    if (images.length === 0) {
      if (searchVal) {
        grid.innerHTML = '<p class="empty-hint" style="column-span: all; text-align: center; padding: 3rem 1.5rem; color: var(--text-muted, #71717a); margin: 0;">No images match your search.</p>';
      } else if (activeFilter === 'site') {
        grid.innerHTML = `
          <div class="empty-hint" style="column-span: all; text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted, #71717a); margin: 0;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.5; margin-bottom: 0.5rem;"><circle cx="12" cy="7" r="4"></circle><path d="M5.5 21a8.5 8.5 0 0 1 13 0"></path></svg>
            <p style="margin: 0; font-weight: 500; font-size: 0.95rem; color: var(--text-primary);">No site media assets</p>
          </div>
        `;
      } else if (activeFilter === 'post') {
        grid.innerHTML = `
          <div class="empty-hint" style="column-span: all; text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted, #71717a); margin: 0;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.5; margin-bottom: 0.5rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            <p style="margin: 0; font-weight: 500; font-size: 0.95rem; color: var(--text-primary);">No post media assets</p>
          </div>
        `;
      } else if (activeFilter === 'page') {
        grid.innerHTML = `
          <div class="empty-hint" style="column-span: all; text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted, #71717a); margin: 0;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.5; margin-bottom: 0.5rem;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            <p style="margin: 0; font-weight: 500; font-size: 0.95rem; color: var(--text-primary);">No page media assets</p>
          </div>
        `;
      } else if (activeFilter === 'upload') {
        grid.innerHTML = `
          <div class="empty-hint" style="column-span: all; text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted, #71717a); margin: 0;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.5; margin-bottom: 0.5rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <p style="margin: 0; font-weight: 500; font-size: 0.95rem; color: var(--text-primary);">No uploaded media assets</p>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div class="empty-hint" style="column-span: all; text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted, #71717a); margin: 0;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.5; margin-bottom: 0.5rem;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <p style="margin: 0; font-weight: 500; font-size: 0.95rem; color: var(--text-primary);">No media assets</p>
          </div>
        `;
      }
      return;
    }

    window._mediaCurrentPage = window._mediaCurrentPage || 1;
    const totalPages = Math.max(1, Math.ceil(images.length / MEDIA_PAGE_SIZE));
    if (window._mediaCurrentPage > totalPages) window._mediaCurrentPage = totalPages;
    if (window._mediaCurrentPage < 1) window._mediaCurrentPage = 1;
    const currentPage = window._mediaCurrentPage;

    const pagedImages = images.slice((currentPage - 1) * MEDIA_PAGE_SIZE, currentPage * MEDIA_PAGE_SIZE);

    grid.innerHTML = '';
    pagedImages.forEach(img => {
      grid.appendChild(createMediaMasonryDOM(img));
    });

    if (totalPages > 1) {
      const pagination = document.createElement('div');
      pagination.className = 'media-pagination-bar';
      pagination.style.cssText = 'width: 100%; margin-top: 1.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem;';
      pagination.innerHTML = `
        <button type="button" class="btn-pagination-prev" ${currentPage <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>&larr; Prev</button>
        <span class="pagination-page-label">Page ${currentPage} of ${totalPages}</span>
        <button type="button" class="btn-pagination-next" ${currentPage >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>Next Page &rarr;</button>
      `;

      pagination.querySelector('.btn-pagination-prev')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPage > 1) {
          window._mediaCurrentPage = currentPage - 1;
          renderDerivedMediaLibrary();
          grid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      pagination.querySelector('.btn-pagination-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPage < totalPages) {
          window._mediaCurrentPage = currentPage + 1;
          renderDerivedMediaLibrary();
          grid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      grid.appendChild(pagination);
    }
  }

  // Automatic Migration from legacy Base64 to High-Capacity Virtual Vault Blobs
  async function migrateExistingMediaLibraryBase64() {
    if (!projectConfig || !Array.isArray(projectConfig.mediaLibrary) || projectConfig.mediaLibrary.length === 0) return;
    let migratedCount = 0;
    for (const img of projectConfig.mediaLibrary) {
      if (img && img.dataUrl && img.dataUrl.startsWith('data:')) {
        try {
          const blob = typeof dataUrlToBlob === 'function' ? dataUrlToBlob(img.dataUrl) : null;
          if (blob && (window.CedarVirtualStorage || window.OutpostVirtualStorage)) {
            await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeBlob(`blog/images/${img.filename}`, blob);
            await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeBlob(`media/${img.filename}`, blob);
            img.blob = blob;
            img.objectUrl = URL.createObjectURL(blob);
            img.dataUrl = img.objectUrl;
            migratedCount++;
          }
        } catch (err) {
          console.warn('[Media] Failed to migrate Base64 item:', img.filename, err);
        }
      }
    }
    if (migratedCount > 0) {
      console.log(`[Media] Migrated ${migratedCount} legacy Base64 asset(s) to High-Capacity Virtual Vault.`);
      saveProjectToStorage();
      renderDerivedMediaLibrary();
    }
  }

  function checkImageUsage(filename) {
    if (!filename) return [];
    const cleanName = filename.split('/').pop().split('\\').pop();
    const locations = [];
    const seen = new Set();

    function addLocation(category, title, url, badgeClass) {
      const key = `${category}|${title}|${url}`;
      if (!seen.has(key)) {
        seen.add(key);
        locations.push({ category, title, url, badgeClass });
      }
    }

    // 1. Check drafts (posts, notes, pages, ideas)
    const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : [];
    allDrafts.forEach(d => {
      let isUsed = false;

      // Check d.images
      if (Array.isArray(d.images)) {
        if (d.images.some(im => {
          const fn = typeof im === 'string' ? im : (im?.filename || '');
          return fn === filename || fn === cleanName || fn.endsWith('/' + cleanName);
        })) {
          isUsed = true;
        }
      }

      // Check coverImage and featuredImage
      if (!isUsed) {
        const cover = typeof d.coverImage === 'string' ? d.coverImage : (d.coverImage?.url || d.coverImage?.filename || '');
        const feat = typeof d.featuredImage === 'string' ? d.featuredImage : (d.featuredImage?.url || d.featuredImage?.filename || '');
        if ((cover && (cover === filename || cover.includes(cleanName))) ||
            (feat && (feat === filename || feat.includes(cleanName)))) {
          isUsed = true;
        }
      }

      // Check markdown / content / html / proseHtml
      if (!isUsed) {
        const prose = (d.markdown || '') + ' ' + (d.content || '') + ' ' + (d.html || '') + ' ' + (d.proseHtml || '');
        if (prose.includes(cleanName) || prose.includes(filename)) {
          isUsed = true;
        }
      }

      if (isUsed) {
        if (d.type === 'note') {
          const title = d.title || ('Note #' + (d.noteNumber || d.id || ''));
          const url = (d.noteNumber !== undefined && d.noteNumber !== null) ? `index.html#note=${d.noteNumber}` : `index.html#notes`;
          addLocation('Note', title, url, 'badge-note');
        } else if (d.type === 'page') {
          const title = d.title || 'Untitled Page';
          const slugOrId = (d.slug && d.slug !== 'untitled-page') ? d.slug : d.id;
          const url = `index.html#write/${encodeURIComponent(slugOrId)}`;
          addLocation('Page', title, url, 'badge-page');
        } else {
          const isPub = d.status === 'published';
          const title = d.title || 'Untitled Post';
          const slugOrId = (d.slug && d.slug !== 'untitled-post') ? d.slug : d.id;
          const url = `index.html#write/${encodeURIComponent(slugOrId)}`;
          addLocation(isPub ? 'Published Post' : 'Draft Post', title, url, isPub ? 'badge-published' : 'badge-draft');
        }
      }
    });

    // 2. Check projectConfig.pages (if defined and separate from drafts)
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.pages)) {
      projectConfig.pages.forEach(p => {
        let isUsed = false;
        if (Array.isArray(p.images) && p.images.some(im => (im?.filename || im) === filename || (im?.filename || im) === cleanName)) isUsed = true;
        if (p.coverImage && (p.coverImage === filename || p.coverImage.includes(cleanName))) isUsed = true;
        if (p.markdown && (p.markdown.includes(cleanName) || p.markdown.includes(filename))) isUsed = true;
        if (isUsed) {
          const title = p.title || p.name || 'Static Page';
          const slugOrId = (p.slug && p.slug !== 'untitled-page') ? p.slug : (p.id || '');
          const url = `index.html#write/${encodeURIComponent(slugOrId)}`;
          addLocation('Page', title, url, 'badge-page');
        }
      });
    }

    // 3. Check projectConfig.authors (Author avatars)
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.authors)) {
      projectConfig.authors.forEach(auth => {
        if (!auth) return;
        const authorName = (typeof auth === 'object' ? auth.name : auth) || 'Author';
        const avatarUrl = (typeof auth === 'object' ? auth.avatar : '') || '';
        if (avatarUrl && (avatarUrl === filename || avatarUrl.includes(cleanName))) {
          addLocation('Author Avatar', `Author: ${authorName}`, 'index.html#pane=authors', 'badge-author');
        }
      });
    }

    // 4. Check projectConfig.design (Branding logos & masthead)
    if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) {
      const b = projectConfig.design.branding;
      if (b) {
        if (b.generalLogo && (b.generalLogo === filename || b.generalLogo.includes(cleanName))) {
          addLocation('Site Branding', 'Site Logo', 'index.html#pane=designer', 'badge-site');
        }
        if (b.tabLogo && (b.tabLogo === filename || b.tabLogo.includes(cleanName))) {
          addLocation('Site Branding', 'Tab Icon (Favicon)', 'index.html#pane=designer', 'badge-site');
        }
        if (b.originalLogo && (b.originalLogo === filename || b.originalLogo.includes(cleanName))) {
          addLocation('Site Branding', 'Original Logo', 'index.html#pane=designer', 'badge-site');
        }
      }
      const mh = projectConfig.design.masthead;
      if (mh?.elements?.logo?.customImage && (mh.elements.logo.customImage === filename || mh.elements.logo.customImage.includes(cleanName))) {
        addLocation('Site Branding', 'Masthead Logo', 'index.html#pane=designer', 'badge-site');
      }
    }

    return locations;
  }

  async function executeDeleteImage(filename) {
    if (!filename) return;
    const cleanName = filename.split('/').pop().split('\\').pop();

    const matchesImg = (val) => {
      if (!val) return false;
      const str = typeof val === 'string' ? val : (val.filename || val.relativePath || val.src || val.url || '');
      if (!str) return false;
      const base = str.split('/').pop().split('\\').pop();
      return str === filename || str === cleanName || base === cleanName || base === filename || str.endsWith('/' + cleanName) || str.endsWith('\\' + cleanName);
    };

    function cleanDraftObj(d) {
      if (!d) return false;
      let changed = false;

      // 1. d.images
      if (Array.isArray(d.images)) {
        const prevLen = d.images.length;
        d.images = d.images.filter(im => !matchesImg(im));
        if (d.images.length !== prevLen) changed = true;
      }

      // 2. d.tempImages
      if (Array.isArray(d.tempImages)) {
        const prevLen = d.tempImages.length;
        d.tempImages = d.tempImages.filter(im => !matchesImg(im));
        if (d.tempImages.length !== prevLen) changed = true;
      }

      // 3. d.coverImage
      if (matchesImg(d.coverImage)) {
        d.coverImage = '';
        changed = true;
      }

      // 4. d.coverImageOriginal
      if (matchesImg(d.coverImageOriginal)) {
        d.coverImageOriginal = '';
        changed = true;
      }

      // 5. d.featuredImage
      if (matchesImg(d.featuredImage)) {
        d.featuredImage = '';
        changed = true;
      }

      // 6. d.markdown
      if (typeof d.markdown === 'string' && (d.markdown.includes(cleanName) || d.markdown.includes(filename))) {
        const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mdImgRegex = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${escapedClean}[^)]*\\)\\n?`, 'gi');
        const mdHtmlImgRegex = new RegExp(`<img\\b[^>]*${escapedClean}[^>]*>\\n?`, 'gi');
        const newMd = d.markdown.replace(mdImgRegex, '').replace(mdHtmlImgRegex, '');
        if (newMd !== d.markdown) {
          d.markdown = newMd;
          changed = true;
        }
      }

      // 7. d.proseHtml
      if (typeof d.proseHtml === 'string' && (d.proseHtml.includes(cleanName) || d.proseHtml.includes(filename))) {
        const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const figRegex = new RegExp(`<figure\\b[^>]*>[\\s\\S]*?${escapedClean}[\\s\\S]*?<\\/figure>`, 'gi');
        const divImgRegex = new RegExp(`<div\\b[^>]*class=["'][^"']*captioned-image-container[^"']*["'][^>]*>[\\s\\S]*?${escapedClean}[\\s\\S]*?<\\/div>`, 'gi');
        const standaloneImgRegex = new RegExp(`<img\\b[^>]*${escapedClean}[^>]*>`, 'gi');
        const newHtml = d.proseHtml.replace(figRegex, '').replace(divImgRegex, '').replace(standaloneImgRegex, '');
        if (newHtml !== d.proseHtml) {
          d.proseHtml = newHtml;
          changed = true;
        }
      }

      // 8. d.content / d.html
      if (typeof d.content === 'string' && (d.content.includes(cleanName) || d.content.includes(filename))) {
        const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const figRegex = new RegExp(`<figure\\b[^>]*>[\\s\\S]*?${escapedClean}[\\s\\S]*?<\\/figure>`, 'gi');
        const divImgRegex = new RegExp(`<div\\b[^>]*class=["'][^"']*captioned-image-container[^"']*["'][^>]*>[\\s\\S]*?${escapedClean}[\\s\\S]*?<\\/div>`, 'gi');
        const standaloneImgRegex = new RegExp(`<img\\b[^>]*${escapedClean}[^>]*>`, 'gi');
        const newContent = d.content.replace(figRegex, '').replace(divImgRegex, '').replace(standaloneImgRegex, '');
        if (newContent !== d.content) {
          d.content = newContent;
          changed = true;
        }
      }

      if (typeof d.html === 'string' && (d.html.includes(cleanName) || d.html.includes(filename))) {
        const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const figRegex = new RegExp(`<figure\\b[^>]*>[\\s\\S]*?${escapedClean}[\\s\\S]*?<\\/figure>`, 'gi');
        const divImgRegex = new RegExp(`<div\\b[^>]*class=["'][^"']*captioned-image-container[^"']*["'][^>]*>[\\s\\S]*?${escapedClean}[\\s\\S]*?<\\/div>`, 'gi');
        const standaloneImgRegex = new RegExp(`<img\\b[^>]*${escapedClean}[^>]*>`, 'gi');
        const newH = d.html.replace(figRegex, '').replace(divImgRegex, '').replace(standaloneImgRegex, '');
        if (newH !== d.html) {
          d.html = newH;
          changed = true;
        }
      }

      return changed;
    }

    // 1. Remove from projectConfig.mediaLibrary
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.mediaLibrary)) {
      projectConfig.mediaLibrary = projectConfig.mediaLibrary.filter(m => !matchesImg(m));
    }

    // 2. Clean all drafts (drafts, window.drafts, currentDraft, window.currentDraft)
    let draftsTouched = false;
    const allDraftList = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []);
    allDraftList.forEach(d => {
      if (cleanDraftObj(d)) draftsTouched = true;
    });
    if (typeof drafts !== 'undefined' && Array.isArray(drafts) && window.drafts && window.drafts !== drafts) {
      window.drafts.forEach(d => {
        if (cleanDraftObj(d)) draftsTouched = true;
      });
    }
    if (typeof currentDraft !== 'undefined' && currentDraft) {
      if (cleanDraftObj(currentDraft)) draftsTouched = true;
    }
    if (typeof window.currentDraft !== 'undefined' && window.currentDraft && window.currentDraft !== currentDraft) {
      if (cleanDraftObj(window.currentDraft)) draftsTouched = true;
    }

    // 3. Clean projectConfig.pages
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.pages)) {
      projectConfig.pages.forEach(p => {
        if (!p) return;
        cleanDraftObj(p);
      });
    }

    // 4. Clean projectConfig.authors
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.authors)) {
      projectConfig.authors.forEach(auth => {
        if (!auth) return;
        const av = typeof auth === 'object' ? auth.avatar : '';
        if (matchesImg(av)) {
          if (typeof auth === 'object') auth.avatar = '';
        }
      });
    }

    // 5. Clean projectConfig.design.branding & masthead
    if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) {
      const b = projectConfig.design.branding;
      if (b) {
        ['generalLogo', 'originalLogo', 'tabLogo'].forEach(prop => {
          if (matchesImg(b[prop])) b[prop] = '';
        });
      }
      const mh = projectConfig.design.masthead;
      if (mh?.elements?.logo?.customImage && matchesImg(mh.elements.logo.customImage)) {
        mh.elements.logo.customImage = '';
      }
    }

    // 6. Record tombstone in projectConfig.deletedImages
    const pCfg = (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : window.projectConfig;
    if (pCfg) {
      if (!Array.isArray(pCfg.deletedImages)) {
        pCfg.deletedImages = [];
      }
      if (!pCfg.deletedImages.includes(cleanName)) {
        pCfg.deletedImages.push(cleanName);
      }
      if (filename && !pCfg.deletedImages.includes(filename)) {
        pCfg.deletedImages.push(filename);
      }
      if (window.projectConfig && window.projectConfig !== pCfg) {
        window.projectConfig.deletedImages = pCfg.deletedImages;
      }
    }

    // 7. Clean live DOM canvasProse if present
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (canvasProse) {
      const domImgs = canvasProse.querySelectorAll('img');
      domImgs.forEach(img => {
        const src = img.getAttribute('src') || '';
        const origSrc = img.getAttribute('data-original-src') || '';
        const imgName = img.getAttribute('data-img-name') || '';
        if (src.includes(cleanName) || origSrc.includes(cleanName) || imgName === cleanName || imgName === filename) {
          const fig = img.closest('figure, .captioned-image-container');
          if (fig) fig.remove();
          else img.remove();
        }
      });
    }

    // 8. Remove from in-memory imageRegistry
    if (typeof window.imageRegistry !== 'undefined' && window.imageRegistry) {
      const keysToDelete = [
        filename, cleanName,
        `/blog/images/${filename}`, `blog/images/${filename}`,
        `/blog/images/${cleanName}`, `blog/images/${cleanName}`,
        `images/${cleanName}`, `/images/${cleanName}`,
        `images/${filename}`, `/images/${filename}`,
        `media/${cleanName}`, `/media/${cleanName}`,
        `media/${filename}`, `/media/${filename}`
      ];
      keysToDelete.forEach(k => {
        if (k) window.imageRegistry.delete(k);
      });
    }

    // 9. Remove from tags storage
    const tagsMap = getStoredTagsMap();
    if (tagsMap[filename]) delete tagsMap[filename];
    if (tagsMap[cleanName]) delete tagsMap[cleanName];
    saveStoredTagsMap(tagsMap);

    // 10. Save both drafts and project configuration to storage immediately
    if (typeof saveDraftsToStorage === 'function') {
      await saveDraftsToStorage();
    }
    if (typeof saveProjectToStorage === 'function') {
      saveProjectToStorage();
    }

    // 11. Close delete confirmation modal if open
    const modalConfirm = document.getElementById('modal-image-delete-confirm');
    if (modalConfirm) modalConfirm.style.display = 'none';
    window._pendingDeleteFilename = null;

    // 12. Close lightbox
    closeMediaLightbox(true);

    // 13. Re-render media grid and counts
    renderDerivedMediaLibrary();
    if (typeof updateDashboardCounts === 'function') {
      updateDashboardCounts();
    }

    // 14. Toast feedback
    if (typeof showToast === 'function') {
      showToast('Image deleted successfully');
    }

    // 15. Remove from CedarVirtualStorage
    if (typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage) !== 'undefined' && (window.CedarVirtualStorage || window.OutpostVirtualStorage)) {
      const vStorage = (window.CedarVirtualStorage || window.OutpostVirtualStorage);
      const paths = [
        `blog/images/${cleanName}`, `media/${cleanName}`, `images/${cleanName}`, cleanName,
        `blog/images/${filename}`, `media/${filename}`, `images/${filename}`, filename
      ];
      for (const p of paths) {
        if (p) { try { await vStorage.deleteFile(p); } catch (e) {} }
      }
    }

    // 16. Remove from SheeshVault
    if (typeof window.SheeshVault !== 'undefined' && window.SheeshVault && typeof window.SheeshVault.deleteFile === 'function') {
      const paths = [
        `blog/images/${cleanName}`, `media/${cleanName}`, `images/${cleanName}`, cleanName,
        `blog/images/${filename}`, `media/${filename}`, `images/${filename}`, filename
      ];
      for (const p of paths) {
        if (p) { try { await window.SheeshVault.deleteFile(p); } catch (e) {} }
      }
    }
  }

  function initMediaEvents() {
    // Run background migration for any legacy Base64 items
    if ((window.CedarVirtualStorage || window.OutpostVirtualStorage)) {
      setTimeout(() => migrateExistingMediaLibraryBase64(), 100);
    }

    // Delegated click handler for media filter pills, lightbox actions, and delete modal
    document.addEventListener('click', (e) => {
      // 1. Media Filter Pills
      const filterBtn = e.target.closest('.media-filter-btn');
      if (filterBtn) {
        e.stopPropagation();
        const filterVal = filterBtn.dataset.filter || 'all';
        window._mediaActiveFilter = filterVal;
        document.querySelectorAll('.media-filter-btn').forEach(b => b.classList.toggle('is-active', b === filterBtn));
        window._mediaCurrentPage = 1;
        renderDerivedMediaLibrary();
        return;
      }

      // 2. Add Tags Button
      const btnAddTags = e.target.closest('#btn-lightbox-add-tags');
      if (btnAddTags) {
        e.stopPropagation();
        const ov = document.getElementById('media-lightbox-overlay');
        if (ov && ov.classList.contains('tag-drawer-open')) {
          closeTagDrawer();
        } else {
          openTagDrawer();
        }
        return;
      }

      // 2b. Download Image Button in Lightbox
      const btnDownloadImg = e.target.closest('#btn-lightbox-download-img');
      if (btnDownloadImg) {
        e.stopPropagation();
        downloadCurrentLightboxImage();
        return;
      }

      // 3. Delete Image Button in Lightbox
      const btnDeleteImg = e.target.closest('#btn-lightbox-delete-img');
      if (btnDeleteImg) {
        e.stopPropagation();
        const img = window._currentLightboxImage;
        if (!img || !img.filename) return;

        const locations = checkImageUsage(img.filename);
        if (locations.length === 0) {
          // If NOT used anywhere: delete immediately without a warning!
          executeDeleteImage(img.filename).catch(err => console.error('[Media] Delete image error:', err));
        } else {
          // If IS used somewhere: ask 'Are you sure you want to delete?' and link locations
          const listEl = document.getElementById('media-delete-usage-list');
          if (listEl) {
            listEl.innerHTML = locations.map(loc => `
              <div class="media-usage-item">
                <span class="media-usage-badge ${escapeHtml(loc.badgeClass)}">${escapeHtml(loc.category)}</span>
                <a href="${escapeHtml(loc.url)}" target="_blank" rel="noopener noreferrer" class="media-usage-link" title="Open in new window">
                  <span>${escapeHtml(loc.title)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
              </div>
            `).join('');
          }
          window._pendingDeleteFilename = img.filename;
          const modalConfirm = document.getElementById('modal-image-delete-confirm');
          if (modalConfirm) modalConfirm.style.display = 'flex';
        }
        return;
      }

      // 4. Cancel Delete Image Modal
      const btnCancelDel = e.target.closest('#btn-cancel-delete-img') || e.target.closest('#btn-close-delete-img-modal');
      if (btnCancelDel) {
        e.stopPropagation();
        const modalConfirm = document.getElementById('modal-image-delete-confirm');
        if (modalConfirm) modalConfirm.style.display = 'none';
        window._pendingDeleteFilename = null;
        return;
      }

      // 5. Confirm Delete Image Modal ("Delete Anyway")
      const btnConfirmDel = e.target.closest('#btn-confirm-delete-img');
      if (btnConfirmDel) {
        e.stopPropagation();
        const toDelete = window._pendingDeleteFilename;
        const modalConfirm = document.getElementById('modal-image-delete-confirm');
        if (modalConfirm) modalConfirm.style.display = 'none';
        window._pendingDeleteFilename = null;
        if (toDelete) {
          executeDeleteImage(toDelete).catch(err => console.error('[Media] Delete image error:', err));
        }
        return;
      }

      // 6. Lightbox Close Button
      const btnClose = e.target.closest('#btn-lightbox-close');
      if (btnClose) {
        e.stopPropagation();
        closeMediaLightbox(true);
        return;
      }

      // 7. Drawer Finish / Close Buttons
      const btnFin = e.target.closest('#btn-drawer-finish') || e.target.closest('#btn-drawer-close');
      if (btnFin) {
        e.stopPropagation();
        closeTagDrawer();
        return;
      }
    });

    // Direct listener on close button for redundancy
    const btnDirectClose = document.getElementById('btn-lightbox-close');
    if (btnDirectClose) {
      btnDirectClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMediaLightbox(true);
      });
    }

    const mediaSearch = document.getElementById('media-search-input');
    const mediaSearchClear = document.getElementById('btn-media-search-clear');
    if (mediaSearch) {
      mediaSearch.addEventListener('input', () => {
        window._mediaCurrentPage = 1;
        if (mediaSearchClear) {
          mediaSearchClear.style.display = mediaSearch.value.trim() ? 'flex' : 'none';
        }
        renderDerivedMediaLibrary();
      });
    }
    if (mediaSearchClear) {
      mediaSearchClear.addEventListener('click', () => {
        window._mediaCurrentPage = 1;
        if (mediaSearch) {
          mediaSearch.value = '';
          mediaSearch.focus();
        }
        mediaSearchClear.style.display = 'none';
        renderDerivedMediaLibrary();
      });
    }

    const btnMediaUpload = document.getElementById('btn-media-upload');
    const inputMediaUpload = document.getElementById('input-media-upload');
    if (btnMediaUpload && inputMediaUpload) {
      btnMediaUpload.addEventListener('click', () => {
        inputMediaUpload.click();
      });
      inputMediaUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
          await handleMediaUpload(files);
          inputMediaUpload.value = '';
        }
      });
    }

    const paneMedia = document.getElementById('pane-media');
    if (paneMedia) {
      paneMedia.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      paneMedia.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) {
          await handleMediaUpload(files);
        }
      });
    }

    // Lightbox Overlay container
    const overlay = document.getElementById('media-lightbox-overlay');
    const formAddTag = document.getElementById('form-add-tag');

    // Dead space click logic:
    // If tag drawer is open, clicking empty space closes the drawer (returning centered image to exact center)
    // If tag drawer is already closed, clicking empty space closes the lightbox entirely
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target.closest('#media-lightbox-content') || e.target.closest('#media-tag-drawer')) {
          return;
        }
        if (overlay.classList.contains('tag-drawer-open')) {
          closeTagDrawer();
        } else {
          closeMediaLightbox(true);
        }
      });
    }

    // Form: Add new tag
    if (formAddTag) {
      formAddTag.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-tag');
        if (!input || !window._currentLightboxImage) return;
        const val = input.value.trim().replace(/^#+/, '').toLowerCase();
        if (val) {
          const currentTags = window._currentLightboxImage.tags || [];
          if (!currentTags.includes(val)) {
            const nextTags = [...currentTags, val];
            window._currentLightboxImage.tags = setImageTags(window._currentLightboxImage.filename, nextTags);
            updateLightboxHashtagsPreview(window._currentLightboxImage);
            renderTagDrawer(window._currentLightboxImage);
            updateGridItemTagsUI(window._currentLightboxImage);
          }
          input.value = '';
          input.focus();
        }
      });
    }

    // Keyboard ESC to close drawer, delete modal, or lightbox
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modalConfirm = document.getElementById('modal-image-delete-confirm');
        if (modalConfirm && modalConfirm.style.display !== 'none') {
          modalConfirm.style.display = 'none';
          window._pendingDeleteFilename = null;
          return;
        }
        if (overlay && overlay.style.display !== 'none') {
          if (overlay.classList.contains('tag-drawer-open')) {
            closeTagDrawer();
          } else {
            closeMediaLightbox(true);
          }
        }
      }
    });

    // Browser Back/Forward buttons and hash route changes: automatically close lightbox
    window.addEventListener('popstate', () => {
      const overlay = document.getElementById('media-lightbox-overlay');
      if (overlay && overlay.style.display !== 'none') {
        closeMediaLightbox(false);
      }
      const modalConfirm = document.getElementById('modal-image-delete-confirm');
      if (modalConfirm && modalConfirm.style.display !== 'none') {
        modalConfirm.style.display = 'none';
        window._pendingDeleteFilename = null;
      }
    });

    window.addEventListener('hashchange', () => {
      const overlay = document.getElementById('media-lightbox-overlay');
      if (overlay && overlay.style.display !== 'none') {
        closeMediaLightbox(false);
      }
      const modalConfirm = document.getElementById('modal-image-delete-confirm');
      if (modalConfirm && modalConfirm.style.display !== 'none') {
        modalConfirm.style.display = 'none';
        window._pendingDeleteFilename = null;
      }
    });
  }

  async function saveLinkMediaAsset(filename, blobOrDataUrl, title) {
    if (!filename || !blobOrDataUrl) return null;
    let cleanFn = filename.split('/').pop().split('\\').pop();
    let blob = null;
    let dataUrl = null;
    let objectUrl = null;

    if (blobOrDataUrl instanceof Blob) {
      blob = blobOrDataUrl;
      if ((window.projectConfig?.sanitizeImages !== false) && blob.type && blob.type.startsWith('image/') && typeof window.sanitizeImage === 'function') {
        try {
          const basePrefix = cleanFn.replace(/\.[^.]+$/, '') || 'links-asset';
          const sanitized = await window.sanitizeImage(blob, basePrefix);
          if (sanitized && sanitized.blob) {
            blob = sanitized.blob;
            dataUrl = sanitized.dataUrl;
            cleanFn = cleanFn.replace(/\.[^.]+$/, '') + '.webp';
          }
        } catch (e) {}
      }
      objectUrl = URL.createObjectURL(blob);
    } else if (typeof blobOrDataUrl === 'string' && blobOrDataUrl.startsWith('data:')) {
      dataUrl = blobOrDataUrl;
      blob = typeof dataUrlToBlob === 'function' ? dataUrlToBlob(dataUrl) : null;
      if (blob) objectUrl = URL.createObjectURL(blob);
    }

    const relPath = `media/links/${cleanFn}`;

    if (blob && (window.CedarVirtualStorage || window.OutpostVirtualStorage)) {
      try {
        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeBlob(relPath, blob);
        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).writeBlob(`blog/images/${cleanFn}`, blob);
      } catch (e) {}
    }
    if (blob && window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {
      try {
        await window.SheeshVault.writeFile(relPath, blob);
      } catch (e) {}
    }

    if (!projectConfig || typeof projectConfig !== 'object') {
      window.projectConfig = window.projectConfig || {};
    }
    if (!Array.isArray(projectConfig.mediaLibrary)) {
      projectConfig.mediaLibrary = [];
    }

    const existingIdx = projectConfig.mediaLibrary.findIndex(m => m && m.filename === cleanFn);
    const mediaItem = {
      filename: cleanFn,
      relativePath: relPath,
      folder: 'media/links',
      mediaCategory: 'links',
      postTitle: 'Links Page',
      postId: 'page_links',
      title: title || cleanFn,
      tags: ['links'],
      dataUrl: dataUrl || objectUrl,
      objectUrl: objectUrl,
      blob: blob,
      createdAt: Date.now()
    };

    if (projectConfig && Array.isArray(projectConfig.deletedImages)) {
      projectConfig.deletedImages = projectConfig.deletedImages.filter(f => f !== cleanFn && f !== filename);
    }

    if (existingIdx >= 0) {
      projectConfig.mediaLibrary[existingIdx] = mediaItem;
    } else {
      projectConfig.mediaLibrary.unshift(mediaItem);
    }

    if (window.imageRegistry) {
      imageRegistry.set(cleanFn, mediaItem);
      imageRegistry.set(relPath, mediaItem);
    }

    if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
    if (typeof renderDerivedMediaLibrary === 'function') renderDerivedMediaLibrary();

    return mediaItem;
  }

  window.getAllUniqueImages = getAllUniqueImages;
  window.saveLinkMediaAsset = saveLinkMediaAsset;
  window.handleMediaUpload = handleMediaUpload;
  window.renderDerivedMediaLibrary = renderDerivedMediaLibrary;
  window.initMediaEvents = initMediaEvents;
  window.getImageTags = getImageTags;
  window.setImageTags = setImageTags;
  window.getAllExistingTagsWithCounts = getAllExistingTagsWithCounts;
  window.openMediaLightbox = openMediaLightbox;
  window.closeMediaLightbox = closeMediaLightbox;
  window.openTagDrawer = openTagDrawer;
  window.closeTagDrawer = closeTagDrawer;
  window.checkImageUsage = checkImageUsage;
  window.executeDeleteImage = executeDeleteImage;

  Object.assign(window.Cedar.dashboard, {
    getAllUniqueImages,
    handleMediaUpload,
    renderDerivedMediaLibrary,
    initMediaEvents,
    getImageTags,
    setImageTags,
    getAllExistingTagsWithCounts,
    openMediaLightbox,
    closeMediaLightbox,
    openTagDrawer,
    closeTagDrawer,
    checkImageUsage,
    executeDeleteImage
  });
})();
