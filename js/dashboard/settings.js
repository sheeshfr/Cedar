/**
 * Cedar - Project Settings & Brand Management
 * Handles settings form population, brand logo dropzone, image sanitization toggle
 * and privacy warning modal, danger zone reset actions, settings scrollspy, and URL visualizer.
 */
(function () {
  'use strict';
  let updateSanitizeBadge;
  let handleSettingsLogoFile;
  let updateSettingsBioPlaceholder;
  let initSettingsScrollSpy;
  let stagedBrandLogo = null;


  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  let currentSettingsAuthorAvatar = '';
  let siteInfoAutoSaveTimer = null;

  function flushAutoSaveSiteInfo() {
    if (!window.projectConfig) window.projectConfig = {};
    const nameInputEl = document.getElementById('setting-site-title');
    if (nameInputEl) {
      const nameVal = nameInputEl.value.trim();
      if (nameVal) {
        projectConfig.name = nameVal;
        if (!projectConfig.design) projectConfig.design = {};
        if (!projectConfig.design.branding) projectConfig.design.branding = {};
        projectConfig.design.branding.siteTitle = nameVal;
      }
    }

    const domainInputEl = document.getElementById('setting-modal-domain');
    if (domainInputEl) {
      const domainVal = domainInputEl.value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      projectConfig.domain = domainVal;
      try { localStorage.setItem(STORAGE_KEY_DOMAIN, domainVal); } catch (e) {}
    }

    const tzInputEl = document.getElementById('setting-modal-timezone');
    if (tzInputEl && tzInputEl.value) {
      projectConfig.timezone = tzInputEl.value.trim();
    }

    const authorNameInputEl = document.getElementById('setting-author-name');
    const authorBioInputEl = document.getElementById('setting-author-bio');
    const prevAuthorName = (projectConfig.defaultAuthor || (projectConfig.authors && projectConfig.authors[0] && projectConfig.authors[0].name) || '').trim();
    const authorNameVal = (authorNameInputEl ? authorNameInputEl.value.trim() : '') || prevAuthorName || 'Cedar Staff';
    const authorBioVal = authorBioInputEl ? authorBioInputEl.value.trim() : ((projectConfig.authors && projectConfig.authors[0] && projectConfig.authors[0].bio) || '');
    const authorAvatarVal = currentSettingsAuthorAvatar || '';

    projectConfig.defaultAuthor = authorNameVal;
    projectConfig.authors = [{
      name: authorNameVal,
      bio: authorBioVal,
      avatar: authorAvatarVal
    }];
    try {
      localStorage.setItem('cedar_active_author', authorNameVal);
      try { localStorage.setItem('outpost_active_author', authorNameVal); } catch (e) {}
    } catch (e) {}

    if (authorNameVal && Array.isArray(window.drafts)) {
      let updatedAny = false;
      window.drafts.forEach(d => {
        if (d && d.type !== 'page') {
          if (d.authorName !== authorNameVal || d.author !== authorNameVal || !Array.isArray(d.authors) || d.authors.length !== 1 || d.authors[0] !== authorNameVal) {
            d.authorName = authorNameVal;
            d.author = authorNameVal;
            d.authors = [authorNameVal];
            updatedAny = true;
          }
        }
      });
      if (updatedAny) {
        if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function') {
          window.CedarStore.hydrateFromList(window.drafts);
        }
        if (typeof window.saveDraftsToStorage === 'function') {
          window.saveDraftsToStorage();
        }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
      }
    }

    if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
    if (typeof syncLiveWorkspaceData === 'function') syncLiveWorkspaceData();
    if (typeof updateCedarTitle === 'function') updateCedarTitle();
    else if (typeof updateOutpostTitle === 'function') updateOutpostTitle();
    if (typeof window.updateAllPreviewFrames === 'function') window.updateAllPreviewFrames();
  }

  function scheduleAutoSaveSiteInfo(immediate = false) {
    if (siteInfoAutoSaveTimer) {
      clearTimeout(siteInfoAutoSaveTimer);
      siteInfoAutoSaveTimer = null;
    }
    if (immediate) {
      flushAutoSaveSiteInfo();
    } else {
      siteInfoAutoSaveTimer = setTimeout(flushAutoSaveSiteInfo, 250);
    }
  }

  function optimizeAuthorAvatarImage(fileOrUrl, callback) {
    if (!fileOrUrl) return callback('');
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 320;
        let w = img.width || maxDim;
        let h = img.height || maxDim;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
        callback(dataUrl);
      } catch (e) {
        callback(typeof fileOrUrl === 'string' ? fileOrUrl : '');
      }
    };
    img.onerror = () => {
      callback(typeof fileOrUrl === 'string' ? fileOrUrl : '');
    };
    if (typeof fileOrUrl === 'string') {
      img.src = fileOrUrl;
    } else if (fileOrUrl instanceof Blob || fileOrUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(fileOrUrl);
    }
  }

  function resolveSettingsPrimaryAuthor() {
    // 1. Check projectConfig.authors for an author with a valid non-empty name
    if (Array.isArray(projectConfig.authors)) {
      const found = projectConfig.authors.find(a => {
        if (!a) return false;
        const n = (typeof a === 'object' && a !== null ? (a.name || '') : String(a || '')).trim();
        return n.length > 0 && n !== 'My Blog Slice' && n !== 'sheesh';
      });
      if (found) {
        return typeof found === 'object' ? found : { name: found, bio: '', avatar: '' };
      }
    }

    // 2. Check projectConfig.defaultAuthor
    const def = (projectConfig.defaultAuthor || '').trim();
    if (def && def !== 'My Blog Slice' && def !== 'sheesh') {
      return { name: def, bio: '', avatar: '' };
    }

    // 3. Check active author in localStorage (e.g. from FTUE setup or previous session)
    try {
      const activeStored = ((localStorage.getItem('cedar_active_author') || localStorage.getItem('outpost_active_author')) || '').trim();
      if (activeStored && activeStored !== 'My Blog Slice' && activeStored !== 'sheesh') {
        return { name: activeStored, bio: '', avatar: '' };
      }
    } catch (e) {}

    // 4. Check resolveProjectDefaultAuthor if available
    if (typeof window.resolveProjectDefaultAuthor === 'function') {
      const resolved = (window.resolveProjectDefaultAuthor() || '').trim();
      if (resolved && resolved !== 'My Blog Slice' && resolved !== 'sheesh') {
        return { name: resolved, bio: '', avatar: '' };
      }
    }

    // 5. Check any authors in existing drafts
    if (Array.isArray(window.drafts)) {
      const dAuthor = window.drafts.find(d => d && (d.authorName || d.author));
      if (dAuthor) {
        const dName = (dAuthor.authorName || dAuthor.author || '').trim();
        if (dName && dName !== 'My Blog Slice' && dName !== 'sheesh') {
          return { name: dName, bio: '', avatar: dAuthor.authorAvatar || '' };
        }
      }
    }

    return { name: '', bio: '', avatar: '' };
  }

  function updateSettingsAuthorAvatarUI() {
    const avatarImg = document.getElementById('setting-author-avatar-img');
    const placeholder = document.getElementById('setting-author-avatar-placeholder');
    const removeBtn = document.getElementById('btn-settings-remove-author-photo');
    const nameInput = document.getElementById('setting-author-name');
    const wrap = document.getElementById('setting-author-avatar-wrap');

    const effectiveName = (nameInput ? nameInput.value.trim() : '')
      || (projectConfig && projectConfig.defaultAuthor ? projectConfig.defaultAuthor.trim() : '')
      || (typeof resolveSettingsPrimaryAuthor === 'function' ? resolveSettingsPrimaryAuthor().name : '')
      || '';
    const char = effectiveName ? effectiveName.charAt(0).toUpperCase() : '';
    if (wrap) wrap.classList.toggle('has-image', Boolean(currentSettingsAuthorAvatar));

    if (currentSettingsAuthorAvatar) {
      if (avatarImg) {
        avatarImg.src = currentSettingsAuthorAvatar;
        avatarImg.style.display = 'block';
      }
      if (placeholder) {
        placeholder.style.display = 'none';
      }
      if (removeBtn) {
        removeBtn.style.display = 'inline-flex';
      }
    } else {
      if (avatarImg) {
        avatarImg.src = '';
        avatarImg.style.display = 'none';
      }
      if (placeholder) {
        placeholder.textContent = char;
        placeholder.style.display = char ? 'inline-flex' : 'none';
      }
      if (removeBtn) {
        removeBtn.style.display = 'none';
      }
    }
  }

  function renderSettingsAuthorProfile() {
    const primaryAuthor = resolveSettingsPrimaryAuthor();

    if (primaryAuthor.name) {
      if (!projectConfig.defaultAuthor) {
        projectConfig.defaultAuthor = primaryAuthor.name;
      }
      if (!Array.isArray(projectConfig.authors) || projectConfig.authors.length === 0) {
        projectConfig.authors = [primaryAuthor];
      } else {
        const hasMatch = projectConfig.authors.some(a => {
          const aName = (typeof a === 'object' ? a?.name : a) || '';
          return aName.trim().toLowerCase() === primaryAuthor.name.toLowerCase();
        });
        if (!hasMatch) {
          projectConfig.authors.unshift(primaryAuthor);
        }
      }
    }

    const nameInput = document.getElementById('setting-author-name');
    const wrap = document.getElementById('setting-author-avatar-wrap');
    const bioInput = document.getElementById('setting-author-bio');
    if (nameInput) {
      nameInput.value = primaryAuthor.name || '';
      const nameErr = document.getElementById('setting-author-name-error');
      if (nameErr && primaryAuthor.name) {
        nameErr.style.display = 'none';
        nameInput.classList.remove('ftue-input-error');
      }
    }
    if (bioInput) {
      bioInput.value = (typeof primaryAuthor === 'object' ? primaryAuthor.bio : '') || '';
    }
    const rawAvatar = (typeof primaryAuthor === 'object' ? (primaryAuthor.avatar || primaryAuthor.image || '') : '') || '';
    currentSettingsAuthorAvatar = (typeof window.resolveAuthorAvatar === 'function' && primaryAuthor?.name)
      ? (window.resolveAuthorAvatar(primaryAuthor.name, rawAvatar) || rawAvatar)
      : rawAvatar;
    updateSettingsAuthorAvatarUI();
  }

  let authorEventsInitialized = false;
  function initSettingsAuthorEvents() {
    if (authorEventsInitialized) return;
    authorEventsInitialized = true;

    const btnUploadPhoto = document.getElementById('btn-settings-upload-author-photo');
    const inputPhotoFile = document.getElementById('setting-author-file-input');
    const btnPickMedia = document.getElementById('btn-settings-pick-author-media');
    const btnRemovePhoto = document.getElementById('btn-settings-remove-author-photo');
    const nameInput = document.getElementById('setting-author-name');
    const wrap = document.getElementById('setting-author-avatar-wrap');

    if (btnUploadPhoto && inputPhotoFile) {
      btnUploadPhoto.addEventListener('click', () => inputPhotoFile.click());
      inputPhotoFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        optimizeAuthorAvatarImage(file, (optimized) => {
          currentSettingsAuthorAvatar = optimized;
          updateSettingsAuthorAvatarUI();
          scheduleAutoSaveSiteInfo(true);
        });
        inputPhotoFile.value = '';
      });
    }

    if (btnPickMedia) {
      btnPickMedia.addEventListener('click', () => {
        const images = (typeof window.getAllUniqueImages === 'function') ? window.getAllUniqueImages() : [];
        if (!images || images.length === 0) {
          if (typeof showToast === 'function') showToast('No images in Media Library yet. Upload a photo directly!');
          return;
        }
        if (images.length === 1) {
          const first = images[0];
          const src = first.dataUrl || first.url || (first.blob ? URL.createObjectURL(first.blob) : '');
          if (src) {
            optimizeAuthorAvatarImage(src, (optimized) => {
              currentSettingsAuthorAvatar = optimized;
              updateSettingsAuthorAvatarUI();
              scheduleAutoSaveSiteInfo(true);
              if (typeof showToast === 'function') showToast('Selected author photo from Media Library');
            });
          }
        } else {
          const names = images.map((im, i) => `${i + 1}: ${im.filename || im.url || 'Image ' + (i + 1)}`).join('\n');
          const choice = prompt(`Choose an author photo from Media Library (1-${images.length}):\n${names}`, '1');
          const idx = parseInt(choice, 10) - 1;
          if (!isNaN(idx) && images[idx]) {
            const sel = images[idx];
            const src = sel.dataUrl || sel.url || (sel.blob ? URL.createObjectURL(sel.blob) : '');
            if (src) {
              optimizeAuthorAvatarImage(src, (optimized) => {
                currentSettingsAuthorAvatar = optimized;
                updateSettingsAuthorAvatarUI();
                scheduleAutoSaveSiteInfo(true);
                if (typeof showToast === 'function') showToast('Selected author photo from Media Library');
              });
            }
          }
        }
      });
    }

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', () => {
        currentSettingsAuthorAvatar = '';
        updateSettingsAuthorAvatarUI();
        scheduleAutoSaveSiteInfo(true);
      });
    }

    if (nameInput) {
      nameInput.addEventListener('input', () => {
        const errorEl = document.getElementById('setting-author-name-error');
        if (errorEl && nameInput.value.trim().length > 0) {
          errorEl.style.display = 'none';
          nameInput.classList.remove('ftue-input-error');
        }
        if (!currentSettingsAuthorAvatar) {
          updateSettingsAuthorAvatarUI();
        }
        scheduleAutoSaveSiteInfo(false);
      });
      nameInput.addEventListener('change', () => scheduleAutoSaveSiteInfo(true));
    }

    const bioInput = document.getElementById('setting-author-bio');
    if (bioInput) {
      bioInput.addEventListener('input', () => scheduleAutoSaveSiteInfo(false));
      bioInput.addEventListener('change', () => scheduleAutoSaveSiteInfo(true));
    }
  }

  function updateSettingsLogoBackground() {
    const dropzone = document.getElementById('designer-logo-dropzone') || document.getElementById('settings-logo-dropzone');
    const favDropzone = document.getElementById('settings-favicon-dropzone');
    if (!dropzone && !favDropzone) return;
    const stage = document.getElementById('designer-logo-stage') || document.getElementById('settings-logo-stage');
    const favStage = document.getElementById('settings-favicon-stage');

    let designBg = '#09090b';
    let isLight = false;

    if (typeof window.getActiveWebsiteThemeColors === 'function') {
      const colors = window.getActiveWebsiteThemeColors();
      if (colors && colors.c60) {
        designBg = colors.c60;
        isLight = Boolean(colors.isLight);
      }
    } else {
      const cfg = window.projectConfig || {};
      const design = cfg.design || {};
      const customColors = design.customColors;
      const effThemeId = design.blogTheme || design.activeTheme || 'basalt';

      if (customColors && customColors.c60) {
        designBg = customColors.c60;
        isLight = Boolean(customColors.isLight);
      } else if (String(effThemeId).startsWith('custom_')) {
        const slotIdx = parseInt(effThemeId.replace('custom_', ''), 10) - 1;
        const pals = Array.isArray(design.customPalettes) ? design.customPalettes : [];
        if (pals[slotIdx] && pals[slotIdx].c60) {
          designBg = pals[slotIdx].c60;
          isLight = Boolean(pals[slotIdx].isLight);
        }
      } else {
        const ftue = window.CedarFTUE || window.OutpostFTUE;
        const palettes = ftue?.THEME_PALETTES || {};
        const pal = palettes[effThemeId] || palettes.basalt || { c60: '#09090b', isLight: false };
        designBg = pal.c60 || (pal.isLight ? '#ffffff' : '#09090b');
        isLight = Boolean(pal.isLight);
      }
    }

    const borderColor = isLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.12)';
    const textPrimary = isLight ? '#18181b' : '#fafafa';
    const textMuted = isLight ? '#52525b' : '#a1a1aa';

    [dropzone, favDropzone].forEach(dz => {
      if (!dz) return;
      dz.style.setProperty('background-color', designBg, 'important');
      dz.style.setProperty('border-color', borderColor, 'important');
    });

    [stage, favStage].forEach(st => {
      if (!st) return;
      st.style.setProperty('background-color', 'transparent', 'important');
      st.style.setProperty('border-color', 'transparent', 'important');
    });

    // Ensure empty state and preview subtext have proper contrast against the design background
    const emptyState = document.getElementById('designer-logo-empty-state') || document.getElementById('settings-logo-empty-state');
    const favEmptyState = document.getElementById('settings-favicon-empty-state');
    [emptyState, favEmptyState].forEach(es => {
      if (!es) return;
      es.querySelectorAll('.ftue-upload-text, .ftue-upload-text span, .ftue-upload-text strong').forEach(el => {
        el.style.color = textPrimary;
      });
      es.querySelectorAll('.ftue-upload-sub').forEach(el => {
        el.style.color = textMuted;
      });
      es.querySelectorAll('.ftue-upload-icon svg').forEach(el => {
        el.style.stroke = textMuted;
      });
    });
    [dropzone, favDropzone].forEach(dz => {
      if (!dz) return;
      dz.querySelectorAll('.ftue-upload-sub').forEach(el => {
        el.style.color = textMuted;
      });
    });
  }

  window.updateDesignerLogoBackground = updateSettingsLogoBackground;

  function renderProjectSettings() {
    stagedBrandLogo = null;
    const nameInput = document.getElementById('setting-project-name');
    const baseInput = document.getElementById('setting-base-url');
    const projLabel = document.getElementById('label-current-project');
    const vaultLabel = document.getElementById('label-master-folder-status');
    const dashVaultLabel = document.getElementById('label-dash-vault-status');

    // Modal Settings elements
    const modalNameInput = document.getElementById('setting-modal-project-name');
    const modalBaseInput = document.getElementById('setting-modal-base-url');
    const modalCategoryInput = document.getElementById('setting-modal-default-category');
    const modalVaultLabel = document.getElementById('label-settings-vault-status');
    const modalVaultPill = document.getElementById('settings-vault-pill');
    const modalConnectBtnLabel = document.getElementById('label-settings-connect-btn');

    const currentSiteName = projectConfig.name || '';
    const defaultCat = projectConfig.defaultCategory || 'Uncategorized';

    const siteTitleInput = document.getElementById('setting-site-title');
    if (siteTitleInput && document.activeElement !== siteTitleInput) {
      siteTitleInput.value = currentSiteName;
    }

    if (nameInput) nameInput.value = currentSiteName;
    if (baseInput) baseInput.value = (projectConfig.baseUrl && projectConfig.baseUrl !== '/posts/' && projectConfig.baseUrl !== '/pages/') ? projectConfig.baseUrl : '/blog/';
    if (projLabel) projLabel.textContent = currentSiteName || 'Cedar';

    if (modalNameInput) {
      modalNameInput.value = currentSiteName;
      modalNameInput.placeholder = '';
    }
    if (modalBaseInput) modalBaseInput.value = (projectConfig.baseUrl && projectConfig.baseUrl !== '/posts/' && projectConfig.baseUrl !== '/pages/') ? projectConfig.baseUrl : '/blog/';
    if (modalCategoryInput) {
      modalCategoryInput.value = defaultCat;
    }

    // Sanitization toggle in Settings
    const sanitizeToggle = document.getElementById('setting-sanitize-images');
    const sanitizeBadge = document.getElementById('badge-sanitization-status');
    const isSanitize = projectConfig.sanitizeImages !== false;
    if (sanitizeToggle) {
      sanitizeToggle.checked = isSanitize;
    }

    // Author Profile in Settings
    renderSettingsAuthorProfile();

    if (sanitizeBadge) {
      sanitizeBadge.textContent = isSanitize ? 'On (Metadata Stripped)' : 'Off (Metadata Preserved)';
      sanitizeBadge.style.color = isSanitize ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #71717a)';
      sanitizeBadge.style.background = isSanitize ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.08)';
    }

    // Media Preferences: Rounded Images
    const isRoundedPref = Boolean(projectConfig.mediaPreferences && projectConfig.mediaPreferences.roundedImages);
    const cardStraight = document.getElementById('pref-corner-straight');
    const cardRounded = document.getElementById('pref-corner-rounded');
    if (cardStraight && cardRounded) {
      cardStraight.classList.toggle('active', !isRoundedPref);
      cardRounded.classList.toggle('active', isRoundedPref);
    }

    // Active color palette swatch in Settings
    const currentTheme = (projectConfig && projectConfig.design && (projectConfig.design.blogTheme || projectConfig.design.activeTheme))
      || (projectConfig && projectConfig.editorTheme)
      || (typeof localStorage !== 'undefined' && (localStorage.getItem('cedar_theme') || localStorage.getItem('cedar_editor_theme') || localStorage.getItem('outpost_theme')))
      || 'basalt';
    if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(currentTheme, false);
    }
    const settingsSwatches = document.querySelectorAll('#settings-sec-theme .ftue-theme-swatch');
    settingsSwatches.forEach(swatch => {
      if (swatch.getAttribute('data-theme-id') === currentTheme) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });

    // Timezone dropdown in Settings
    const modalTzSelect = document.getElementById('setting-modal-timezone');
    if (modalTzSelect) {
      if (modalTzSelect.options.length === 0 && (window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).getSortedTimezoneList === 'function') {
        const sortedList = (window.CedarFTUE || window.OutpostFTUE).getSortedTimezoneList();
        modalTzSelect.innerHTML = '';
        sortedList.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.zone;
          opt.textContent = item.displayLabel;
          modalTzSelect.appendChild(opt);
        });
      }
      const activeTz = projectConfig.timezone || 'America/Chicago';
      if (modalTzSelect.value !== activeTz) {
        modalTzSelect.value = activeTz;
      }
    }

    // Brand Logo in Settings (Full 1:1 dropzone matching FTUE config)
    const settingsLogoDropzone = document.getElementById('settings-logo-dropzone');
    const settingsLogoEmpty = document.getElementById('settings-logo-empty-state');
    const settingsLogoPreview = document.getElementById('settings-logo-preview-state');
    const settingsLogoImg = document.getElementById('settings-logo-preview-img');
    const settingsLogoFileName = document.getElementById('settings-logo-file-name');
    const settingsLogoDims = document.getElementById('settings-logo-dims-badge');

    const currentLogo = (projectConfig.design && projectConfig.design.branding && (projectConfig.design.branding.originalLogo || projectConfig.design.branding.generalLogo)) || '';

    if (settingsLogoPreview && settingsLogoEmpty) {
      if (currentLogo) {
        settingsLogoEmpty.style.display = 'none';
        settingsLogoPreview.style.display = 'flex';
        if (settingsLogoImg) {
          settingsLogoImg.src = currentLogo;
          const imgObj = new Image();
          imgObj.onload = () => {
            const naturalW = imgObj.naturalWidth || 1;
            const naturalH = imgObj.naturalHeight || 1;
            const scalePct = Math.min(100, Math.max(10, Math.round((naturalW / 1200) * 100)));
            if (settingsLogoImg) {
              settingsLogoImg.style.width = 'auto';
              settingsLogoImg.style.maxWidth = `${scalePct}%`;
            }
            if (settingsLogoDims) settingsLogoDims.textContent = `${naturalW} × ${naturalH}px (${scalePct}% width)`;
          };
          imgObj.src = currentLogo;
        }
        if (settingsLogoFileName) {
          settingsLogoFileName.textContent = 'logo.png';
        }
      } else {
        settingsLogoPreview.style.display = 'none';
        settingsLogoEmpty.style.display = 'flex';
        if (settingsLogoImg) {
          settingsLogoImg.src = '';
          settingsLogoImg.style.width = '';
          settingsLogoImg.style.maxWidth = '';
        }
        if (settingsLogoDims) settingsLogoDims.textContent = '--';
      }
    }

    // Favicon in Settings
    const settingsFaviconEmpty = document.getElementById('settings-favicon-empty-state');
    const settingsFaviconPreview = document.getElementById('settings-favicon-preview-state');
    const settingsFaviconImg = document.getElementById('settings-favicon-preview-img');
    const settingsFaviconFileName = document.getElementById('settings-favicon-file-name');
    const settingsFaviconDims = document.getElementById('settings-favicon-dims-badge');

    const rawFavicon = (projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.tabLogo) || '';
    const storedFavFile = (projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.files && projectConfig.design.branding.files['media/branding/icon.png'])
      || (window.brandingFiles && window.brandingFiles['media/branding/icon.png'])
      || '';
    const faviconExplicitlyRemoved = Boolean(projectConfig.design && projectConfig.design.branding && projectConfig.design.branding.faviconExplicitlyRemoved);
    let currentFavicon = (rawFavicon === 'icon.png' || rawFavicon === '/icon.png')
      ? storedFavFile
      : (rawFavicon || storedFavFile);

    // If favicon is empty and not explicitly removed, fill it in with the brand logo
    const needsFallbackFromLogo = !currentFavicon && Boolean(currentLogo) && !faviconExplicitlyRemoved;
    if (needsFallbackFromLogo) {
      currentFavicon = currentLogo;
    }

    if (settingsFaviconPreview && settingsFaviconEmpty) {
      if (currentFavicon) {
        settingsFaviconEmpty.style.display = 'none';
        settingsFaviconPreview.style.display = 'flex';
        if (settingsFaviconImg) {
          settingsFaviconImg.src = currentFavicon;
          const favImgObj = new Image();
          favImgObj.onload = () => {
            if (needsFallbackFromLogo) {
              const resizer = (window.Cedar && window.Cedar.generateResizedCanvasImage) || (window.Outpost && window.Outpost.generateResizedCanvasImage);
              const iconDataUrl = (typeof resizer === 'function') ? resizer(favImgObj, 64, 64, false) : currentLogo;
              if (settingsFaviconImg) settingsFaviconImg.src = iconDataUrl;
              if (!projectConfig.design) projectConfig.design = {};
              if (!projectConfig.design.branding) projectConfig.design.branding = {};
              projectConfig.design.branding.tabLogo = iconDataUrl;
              const brandingAssets = Object.assign(
                {},
                projectConfig.design.branding.files || {},
                window.brandingFiles || {},
                { 'media/branding/icon.png': iconDataUrl }
              );
              projectConfig.design.branding.files = brandingAssets;
              window.brandingFiles = brandingAssets;
              try { localStorage.setItem('cedar_branding_files_v1', JSON.stringify(brandingAssets)); } catch (e) {}
            }
            const naturalW = Math.min(64, favImgObj.naturalWidth || 64);
            const naturalH = Math.min(64, favImgObj.naturalHeight || 64);
            if (settingsFaviconDims) settingsFaviconDims.textContent = `${naturalW} × ${naturalH}px`;
          };
          favImgObj.src = currentFavicon;
        }
        if (settingsFaviconFileName) {
          settingsFaviconFileName.textContent = 'icon.png';
        }
      } else {
        settingsFaviconPreview.style.display = 'none';
        settingsFaviconEmpty.style.display = 'flex';
        if (settingsFaviconImg) {
          settingsFaviconImg.src = '';
        }
        if (settingsFaviconDims) settingsFaviconDims.textContent = '--';
      }
    }

    // Ensure settings brand logo & favicon dropzones strictly reflect the background selected in Design
    updateSettingsLogoBackground();


    const isExplicitlyDisconnected = localStorage.getItem('cedar_vault_disconnected') === '1';
    const savedVaultPath = !isExplicitlyDisconnected ? ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || projectConfig.vaultPath || '').trim() : '';
    const savedVaultName = !isExplicitlyDisconnected ? (localStorage.getItem('cedar_vault_name') || localStorage.getItem('outpost_vault_name') || '').trim() : '';
    const isConnFlag = !isExplicitlyDisconnected && (localStorage.getItem('cedar_vault_connected') === '1' || localStorage.getItem('outpost_vault_connected') === '1');
    const isSheeshConnected = Boolean(window.SheeshVault && window.SheeshVault.isConnected());
    const isConnected = !isExplicitlyDisconnected && (isSheeshConnected || Boolean(savedVaultPath) || (isConnFlag && Boolean(savedVaultName)));
    let folderName = null;
    if (isSheeshConnected) {
      folderName = window.SheeshVault.getFolderName();
    } else if (savedVaultPath) {
      folderName = savedVaultPath.split(/[\\/]/).filter(Boolean).pop() || savedVaultPath;
    } else if (savedVaultName) {
      folderName = savedVaultName;
    }

    const modalVaultPathInput = document.getElementById('setting-vault-folder-path');
    if (modalVaultPathInput && document.activeElement !== modalVaultPathInput) {
      modalVaultPathInput.value = isConnected ? (savedVaultPath || (isSheeshConnected && folderName ? folderName : '')) : '';
    }

    const statusText = isConnected ? 'Connected' : 'Disconnected';

    if (vaultLabel) vaultLabel.textContent = isConnected ? `Connected: ${folderName}` : 'Connect Vault';
    if (dashVaultLabel) dashVaultLabel.textContent = isConnected ? `Connected: ${folderName}` : 'Connect Vault';

    if (modalVaultLabel) {
      modalVaultLabel.textContent = statusText;
    }
    if (modalVaultPill) {
      if (isConnected) modalVaultPill.classList.add('connected');
      else modalVaultPill.classList.remove('connected');
    }
    if (modalConnectBtnLabel) {
      modalConnectBtnLabel.textContent = isConnected ? 'Change Vault' : 'Connect Vault';
    }
    const btnSettingsRemove = document.getElementById('btn-settings-remove-vault');
    if (btnSettingsRemove) {
      btnSettingsRemove.style.display = isConnected ? 'inline-flex' : 'none';
    }

    // GitHub Cloud Sync in Settings
    const inputGhRepo = document.getElementById('setting-github-repo');
    const inputGhToken = document.getElementById('setting-github-token');
    const inputGhBranch = document.getElementById('setting-github-branch');
    if (window.Cedar?.githubSync) {
      const creds = window.Cedar.githubSync.getCredentials();
      if (inputGhRepo && document.activeElement !== inputGhRepo) inputGhRepo.value = creds.repo || '';
      if (inputGhToken && document.activeElement !== inputGhToken) inputGhToken.value = creds.token || '';
      if (inputGhBranch && document.activeElement !== inputGhBranch) inputGhBranch.value = creds.branch || 'main';
      window.Cedar.githubSync.updateSyncBadges();
    }

    // Domain and Blog Path in Settings
    const modalDomainInput = document.getElementById('setting-modal-domain');
    const modalBlogPathInput = document.getElementById('setting-modal-blog-path');
    const previewLocalUrlEl = document.getElementById('settings-url-preview-local');
    const previewLiveUrlEl = document.getElementById('settings-url-preview-live');
    const btnOpenLiveUrl = document.getElementById('btn-settings-open-live-url');

    const currentDomain = (typeof resolveProjectDomain === 'function')
      ? resolveProjectDomain()
      : ((projectConfig.domain || localStorage.getItem(STORAGE_KEY_DOMAIN) || '').trim());
    const currentBlogPath = (typeof resolveProjectBlogPath === 'function')
      ? resolveProjectBlogPath()
      : (projectConfig.blogPath !== undefined ? projectConfig.blogPath : (localStorage.getItem(STORAGE_KEY_BLOG_PATH) || 'blog'));

    if (modalDomainInput && document.activeElement !== modalDomainInput) {
      modalDomainInput.value = currentDomain;
    }
    if (modalBlogPathInput && document.activeElement !== modalBlogPathInput) {
      modalBlogPathInput.value = currentBlogPath;
    }

    const modalRssToggle = document.getElementById('setting-rss-enabled') || document.getElementById('setting-modal-rss-enabled');
    const badgeRssStatus = document.getElementById('badge-rss-main-status') || document.getElementById('badge-rss-status');
    const rssDomainWarningBox = document.getElementById('rss-domain-warning-box');
    const rssActiveDetailsWrap = document.getElementById('rss-active-details-wrap');

    const isRssEnabled = (typeof resolveProjectRssEnabled === 'function')
      ? resolveProjectRssEnabled()
      : (projectConfig.rssEnabled !== undefined ? Boolean(projectConfig.rssEnabled) : false);

    if (modalRssToggle) {
      modalRssToggle.checked = isRssEnabled;
    }

    const updateSettingsUrlVisualizer = () => {
      const rawDomain = (modalDomainInput ? modalDomainInput.value.trim() : (projectConfig.domain || '')).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const siteBase = rawDomain ? `https://${rawDomain}` : 'http://localhost:8080';
      const isRssOn = modalRssToggle ? modalRssToggle.checked : isRssEnabled;

      if (badgeRssStatus) {
        badgeRssStatus.textContent = isRssOn ? 'Active (Broadcasting)' : 'Disabled (Off)';
        badgeRssStatus.style.color = isRssOn ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #71717a)';
        badgeRssStatus.style.background = isRssOn ? 'rgba(16, 185, 129, 0.12)' : 'rgba(113, 113, 122, 0.14)';
      }

      if (rssActiveDetailsWrap) {
        rssActiveDetailsWrap.style.display = isRssOn ? 'block' : 'none';
      }

      if (rssDomainWarningBox) {
        rssDomainWarningBox.style.display = (isRssOn && !rawDomain) ? 'flex' : 'none';
      }

      const rssPostsEl = document.getElementById('settings-url-preview-rss-posts');
      const badgeRssPosts = document.getElementById('badge-url-rss-posts');

      if (rssPostsEl) {
        rssPostsEl.textContent = `${siteBase}/feed.xml`;
      }
      if (badgeRssPosts) {
        badgeRssPosts.textContent = 'RSS Feed';
      }

      // Sidebar Live navigation buttons
      const sidebarVisitOnline = document.getElementById('sidebar-tab-visit-online');
      const miniSidebarVisitOnline = document.getElementById('mini-sidebar-tab-visit-online');
      const sidebarLiveNavList = document.getElementById('sidebar-live-nav-list');
      const sidebarLiveDivider = document.getElementById('sidebar-live-divider');
      const miniSidebarLiveDivider = document.getElementById('mini-sidebar-live-divider');
      const liveUrl = rawDomain ? siteBase : '';
      if (sidebarVisitOnline) {
        sidebarVisitOnline.style.display = liveUrl ? 'flex' : 'none';
      }
      if (miniSidebarVisitOnline) {
        miniSidebarVisitOnline.style.display = liveUrl ? 'flex' : 'none';
      }
      if (sidebarLiveNavList) {
        sidebarLiveNavList.style.display = liveUrl ? 'block' : 'none';
      }
      if (sidebarLiveDivider) {
        sidebarLiveDivider.style.display = liveUrl ? 'block' : 'none';
      }
      if (miniSidebarLiveDivider) {
        miniSidebarLiveDivider.style.display = liveUrl ? 'block' : 'none';
      }
    };
    updateSettingsUrlVisualizer();

    // Layout Override toggle & badge
    const layoutOverrideToggle = document.getElementById('setting-layout-override');
    const badgeLayoutOverride = document.getElementById('badge-layout-override-status');
    const isLayoutOverride = (projectConfig.layoutOverride !== undefined)
      ? Boolean(projectConfig.layoutOverride)
      : (localStorage.getItem('cedar_layout_override') === 'true');
    if (layoutOverrideToggle) {
      layoutOverrideToggle.checked = isLayoutOverride;
    }
    if (badgeLayoutOverride) {
      badgeLayoutOverride.textContent = isLayoutOverride ? 'Active (Manual Layouts Protected)' : 'Off (System Managed)';
      badgeLayoutOverride.style.color = isLayoutOverride ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #71717a)';
      badgeLayoutOverride.style.background = isLayoutOverride ? 'rgba(16, 185, 129, 0.12)' : 'rgba(113, 113, 122, 0.14)';
    }

    if (typeof updateCedarTitle === 'function') updateCedarTitle(); else if (typeof updateOutpostTitle === 'function') updateOutpostTitle();
    const restoreSelectEl = document.getElementById('setting-restore-builtin-select');
    const restoreErrorEl = document.getElementById('setting-restore-builtin-error');
    if (restoreSelectEl) {
      restoreSelectEl.classList.remove('ftue-input-error');
    }
    if (restoreErrorEl) {
      restoreErrorEl.style.display = 'none';
    }
    if (typeof window.updateSettingsBackButton === 'function') {
      window.updateSettingsBackButton();
    }
    if (typeof window.updateSettingsActiveSection === 'function') {
      window.updateSettingsActiveSection();
    }
  }



  function initSettingsEvents() {
    // Show saved confirmation toast if page just reloaded from Settings save
    try {
      if ((sessionStorage.getItem('cedar_settings_saved_toast') || sessionStorage.getItem('outpost_settings_saved_toast'))) {
        sessionStorage.removeItem('cedar_settings_saved_toast'); sessionStorage.removeItem('outpost_settings_saved_toast');
        setTimeout(() => {
          if (typeof showToast === 'function') {
            showToast('Saved Site Info!');
          }
        }, 150);
      }
    } catch (e) {}

    // Settings Table of Contents: Back to Previous Page Button
    const btnSettingsBack = document.getElementById('btn-settings-back');
    if (btnSettingsBack && typeof window.updateSettingsBackButton === 'function') {
      window.updateSettingsBackButton();
    }

    if (typeof initSettingsScrollSpy === 'function') {
      initSettingsScrollSpy();

    // Help & Documentation TOC ScrollSpy & Navigation
    window.initHelpScrollSpy = function() {
      const container = document.querySelector('.dash-main-content');
      const paneHelp = document.getElementById('pane-help');
      if (!container || !paneHelp) return;

      const tocLinks = paneHelp.querySelectorAll('.settings-toc-link');
      if (tocLinks.length === 0) return;

      function setActiveHelpToc(targetId) {
        tocLinks.forEach(link => {
          const id = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');
          link.classList.toggle('active', id === targetId);
        });
      }

      let isProgrammatic = false;
      let progTimer = null;

      tocLinks.forEach(link => {
        if (link._hasHelpTocListener) return;
        link._hasHelpTocListener = true;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetId = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            setActiveHelpToc(targetId);
            isProgrammatic = true;
            if (progTimer) clearTimeout(progTimer);
            progTimer = setTimeout(() => { isProgrammatic = false; }, 500);
            const cRect = container.getBoundingClientRect();
            const tRect = targetEl.getBoundingClientRect();
            const topPos = tRect.top - cRect.top + container.scrollTop - 20;
            container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
          }
        });
      });

      function updateActiveHelpSection() {
        if (isProgrammatic) return;
        if (paneHelp.style.display === 'none' && !paneHelp.classList.contains('active')) return;
        const sections = Array.from(paneHelp.querySelectorAll('.settings-section-group')).filter(Boolean);
        if (sections.length === 0) return;
        const containerRect = container.getBoundingClientRect();
        const targetTop = containerRect.top + 30;
        let closestSec = sections[0];
        let minDiff = Infinity;
        for (const sec of sections) {
          const rect = sec.getBoundingClientRect();
          const diff = Math.abs(rect.top - targetTop);
          if (diff < minDiff) {
            minDiff = diff;
            closestSec = sec;
          }
        }
        if (closestSec) setActiveHelpToc(closestSec.id);
      }

      if (!container._hasHelpScrollSpy) {
        container._hasHelpScrollSpy = true;
        container.addEventListener('scroll', () => {
          window.requestAnimationFrame(updateActiveHelpSection);
        }, { passive: true });
      }
      updateActiveHelpSection();
    };
    window.initHelpScrollSpy();
    }

    // Author Profile Events in Settings
    initSettingsAuthorEvents();

    // Settings Gear Icon & Modal Controls
    const btnDashSettings = document.getElementById('btn-dash-settings');
    if (btnDashSettings) {
      btnDashSettings.addEventListener('click', async () => {
        const pathInput = document.getElementById('setting-vault-folder-path');
        if (pathInput && !pathInput.value && !(localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) && (window.Cedar && window.Cedar.isLocalServer)) {
          try {
            const res = await fetch('/api/vault-path');
            if (res.ok) {
              const data = await res.json();
              if (data && data.defaultPath) {
                pathInput.placeholder = data.defaultPath;
              }
            }
          } catch (e) {}
        }
        renderProjectSettings();
        openModal('modal-settings');
      });
    }

    const inputSettingsVaultPath = document.getElementById('setting-vault-folder-path');

    const btnSettingsConnectVault = document.getElementById('btn-settings-connect-vault');
    if (btnSettingsConnectVault) {
      btnSettingsConnectVault.addEventListener('click', async () => {
        const isConnected = Boolean(window.SheeshVault && window.SheeshVault.isConnected());
        if (((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)) && typeof ((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)).pointToLocalInstance === 'function') {
          ((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)).pointToLocalInstance(isConnected ? 'change' : 'initial');
        } else if (window.SheeshVault) {
          window.SheeshVault.connect();
        }
      });
    }

    const btnSettingsRemoveVault = document.getElementById('btn-settings-remove-vault');
    if (btnSettingsRemoveVault) {
      btnSettingsRemoveVault.addEventListener('click', () => {
        if (((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)) && typeof ((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)).removeLocalStorage === 'function') {
          ((window.Cedar && window.Cedar.vaultSync) || (window.Outpost && window.Outpost.vaultSync)).removeLocalStorage();
        } else if (window.SheeshVault) {
          window.SheeshVault.disconnect();
        }
      });
    }

    const btnSettingsOpenVault = document.getElementById('btn-settings-open-vault-explorer');
    if (btnSettingsOpenVault) {
      btnSettingsOpenVault.addEventListener('click', async () => {
        const inputPath = document.getElementById('setting-vault-folder-path')?.value.trim().replace(/^["']|["']$/g, '');
        const savedPath = inputPath || (localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || projectConfig.vaultPath || '';
        const isConnected = (window.SheeshVault && window.SheeshVault.isConnected()) || Boolean(savedPath);

        if (!isConnected && !savedPath) {
          alert('no vault connected');
          return;
        }

        const folderName = (window.SheeshVault && window.SheeshVault.isConnected())
          ? window.SheeshVault.getFolderName()
          : (savedPath ? (savedPath.split(/[\\/]/).filter(Boolean).pop() || '') : '');

        if (window.Cedar && window.Cedar.isLocalServer) {
          try {
            const res = await fetch('/api/open-vault-explorer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderName, savedPath })
            });

            if (res.ok) {
              const data = await res.json();
              if (data && data.path) {
                localStorage.setItem('cedar_vault_path', data.path);
                projectConfig.vaultPath = data.path;
                const pathInput = document.getElementById('setting-vault-folder-path');
                if (pathInput) pathInput.value = data.path;
                renderProjectSettings();
                showToast(`Opened "${data.path}" in Explorer`);
                return;
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              alert(errData.error || 'Could not open vault folder in Explorer');
              return;
            }
          } catch (e) {
            console.warn('[Cedar] Open vault explorer request error:', e);
          }
        }

        const userPath = prompt(
          `Could not automatically locate the folder "${savedPath || folderName}" on disk.\n` +
          `Please enter the full folder path to open in Windows Explorer:`,
          savedPath || ''
        );

        if (userPath && userPath.trim()) {
          const cleanPath = userPath.trim().replace(/^["']|["']$/g, '');
          localStorage.setItem('cedar_vault_path', cleanPath);
          projectConfig.vaultPath = cleanPath;
          const pathInput = document.getElementById('setting-vault-folder-path');
          if (pathInput) pathInput.value = cleanPath;
          renderProjectSettings();
          if (window.Cedar && window.Cedar.isLocalServer) {
            try {
              const retryRes = await fetch('/api/open-vault-explorer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderName, savedPath: cleanPath })
              });
              if (retryRes.ok) {
                showToast(`Opened "${cleanPath}" in Explorer`);
                return;
              }
            } catch (e) {}
          }
          alert(`Vault folder: ${cleanPath}`);
        }
      });
    }

    const inputSettingsImportZip = document.getElementById('input-settings-import-zip');
    if (inputSettingsImportZip) {
      inputSettingsImportZip.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (typeof promptImportWithBackupOption === 'function') {
          promptImportWithBackupOption(file, () => {
            renderProjectSettings();
          });
        }
      });
    }

    // Danger Zone Action 1: Erase All Posts & Pages
    const btnDangerErasePosts = document.getElementById('btn-danger-erase-posts');
    if (btnDangerErasePosts && !btnDangerErasePosts._hasDangerListener) {
      btnDangerErasePosts._hasDangerListener = true;
      btnDangerErasePosts.addEventListener('click', async () => {
        const count = Array.isArray(window.drafts) ? window.drafts.length : (Array.isArray(drafts) ? drafts.length : 0);
        const msg = count > 0
          ? '⚠️ ERASE ALL POSTS?\n\nThis will permanently delete all drafts, published articles, and static pages.\n\nYour site title, theme, authors, and branding settings will be preserved.\n\nAre you sure you want to proceed?'
          : '⚠️ ERASE ALL POSTS?\n\nAre you sure you want to clear your working slate? This cannot be undone.';

        if (!confirm(msg)) return;

        try {
          localStorage.removeItem(window.STORAGE_KEY_DRAFTS || 'sheesh_static_writer_drafts_v2');
          localStorage.removeItem('sheesh_static_writer_drafts');
          localStorage.removeItem(window.STORAGE_KEY_ACTIVE || 'sheesh_static_writer_active_id_v2');
          localStorage.removeItem('sheesh_static_writer_active_id');
        } catch (e) {
          console.warn('[Cedar] Error removing drafts from localStorage:', e);
        }

        window.drafts = [];
        if (typeof drafts !== 'undefined') {
          try { drafts = []; } catch (e) {}
        }
        window.currentDraft = null;

        // Clear in Virtual Storage / OPFS
        const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
        if (vStorage && typeof vStorage.writeFile === 'function') {
          try {
            await vStorage.writeFile('editor/drafts.json', []);
            await vStorage.writeFile('writer/drafts.json', []);
          } catch (e) {}
        }

        // Purge posts and pages from activity logs
        const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
        if (proj && Array.isArray(proj.activityLog)) {
          proj.activityLog = proj.activityLog.filter(a => a && a.type !== 'post' && a.type !== 'page');
          try {
            localStorage.setItem('cedar_activity_log', JSON.stringify(proj.activityLog));
          } catch (e) {}
        }
        if (typeof window !== 'undefined' && Array.isArray(window.activityLog)) {
          window.activityLog = window.activityLog.filter(a => a && a.type !== 'post' && a.type !== 'page');
        }
        if (typeof saveProjectToStorage === 'function') saveProjectToStorage();

        // Also sync drafts: [] to server live-sync
        if (window.Cedar && window.Cedar.isLocalServer) {
          try {
            fetch('/api/live-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project: window.projectConfig, drafts: [] })
            }).catch(() => {});
          } catch (e) {}
        }

        // Also sync to physical vault if connected
        if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected()) {
          try {
            await window.SheeshVault.writeFile('editor/drafts.json', []);
            await window.SheeshVault.writeFile('writer/drafts.json', []);
          } catch (e) {}
        }

        if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
        if (typeof renderAllPostsGrid === 'function') renderAllPostsGrid();
        if (typeof renderPipelineBoard === 'function') renderPipelineBoard();
        if (typeof renderStaticPages === 'function') renderStaticPages();
        if (typeof renderDashboardHome === 'function') renderDashboardHome();
        if (typeof renderProjectSettings === 'function') renderProjectSettings();

        showToast('All posts and pages have been cleared.');
      });
    }

    // Danger Zone Action 2: Clear Browser Cache Data (formerly Nuclear Reset)
    const btnDangerNuclearReset = document.getElementById('btn-danger-nuclear-reset');
    if (btnDangerNuclearReset && !btnDangerNuclearReset._hasDangerListener) {
      btnDangerNuclearReset._hasDangerListener = true;
      btnDangerNuclearReset.addEventListener('click', async () => {
        const confirmed = confirm(
          '⚠️ CLEAR BROWSER CACHE DATA ⚠️\n\n' +
          'This will wipe all locally cached data in this browser:\n' +
          '• In-browser drafts, temporary edits, and cached settings\n' +
          '• Local browser themes and cached preferences\n\n' +
          'IMPORTANT: Your connected vault files on your hard drive are untouched.\n\n' +
          'Cedar will reload in a clean browser state.\n\n' +
          'Click OK to proceed.'
        );

        if (!confirmed) return;

        const typed = prompt('⚠️ FINAL CONFIRMATION:\n\nType CLEAR in capital letters to confirm:');
        if (!typed || typed.trim().toUpperCase() !== 'CLEAR') {
          showToast('Clear browser cache canceled.');
          return;
        }

        btnDangerNuclearReset.disabled = true;
        btnDangerNuclearReset.textContent = 'Clearing browser cache...';

        try {
          // 1. Disconnect and unbind Vault
          if (window.SheeshVault && typeof window.SheeshVault.disconnect === 'function') {
            try {
              await window.SheeshVault.disconnect();
            } catch (e) {
              console.warn('[NuclearReset] Vault disconnect warning:', e);
            }
          }

          // 2. Wipe Virtual Storage (OPFS & IndexedDB virtual vault)
          const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
          if (vStorage && typeof vStorage.clear === 'function') {
            try {
              await vStorage.clear();
            } catch (e) {
              console.warn('[NuclearReset] Virtual storage clear warning:', e);
            }
          }

          // 3. Direct OPFS root wipe
          try {
            if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
              const opfsRoot = await navigator.storage.getDirectory();
              if (opfsRoot && typeof opfsRoot.entries === 'function') {
                for await (const [name] of opfsRoot.entries()) {
                  try {
                    await opfsRoot.removeEntry(name, { recursive: true });
                  } catch (e) {}
                }
              }
            }
          } catch (e) {
            console.warn('[NuclearReset] Direct OPFS wipe warning:', e);
          }

          // 4. Delete all IndexedDB databases
          const dbsToDelete = [
            'sheesh_vault_db',
            'cedar_virtual_vault_db',
            'outpost_virtual_vault_db',
            'cedar_native_vault_db',
            'outpost_vault_db'
          ];

          if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
            try {
              const existingDbs = await indexedDB.databases();
              if (Array.isArray(existingDbs)) {
                existingDbs.forEach(db => {
                  if (db && db.name && !dbsToDelete.includes(db.name)) {
                    dbsToDelete.push(db.name);
                  }
                });
              }
            } catch (e) {}
          }

          await Promise.all(dbsToDelete.map(dbName => {
            return new Promise((resolve) => {
              try {
                const req = indexedDB.deleteDatabase(dbName);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              } catch (e) {
                resolve();
              }
            });
          }));

          // 5. In-memory data purge
          window.drafts = [];
          if (typeof drafts !== 'undefined') {
            try { drafts = []; } catch (e) {}
          }
          window.currentDraft = null;
          if (window.projectConfig) {
            window.projectConfig.activityLog = [];
          }
          if (typeof window.activityLog !== 'undefined') {
            window.activityLog = [];
          }

          // 5b. Reset server live workspace cache and active vault
          if (window.Cedar && window.Cedar.isLocalServer) {
            try {
              await fetch('/api/nuclear-reset', { method: 'POST' }).catch(() => {});
              await fetch('/api/live-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: null, drafts: [] })
              }).catch(() => {});
            } catch (e) {}
          }

          // 6. Clear localStorage & sessionStorage
          localStorage.clear();
          try { sessionStorage.clear(); } catch (e) {}

          // 7. Seed fresh minimal factory state with explicit disconnect
          localStorage.setItem('cedar_vault_disconnected', '1');
          try { localStorage.setItem('outpost_vault_disconnected', '1'); } catch (e) {}
          localStorage.setItem('sheesh_static_writer_drafts_v2', '[]');
          localStorage.setItem('sheesh_static_writer_active_id_v2', '');
          localStorage.setItem('cedar_trigger_ftue', '1');
          try { localStorage.setItem('outpost_trigger_ftue', '1'); } catch(e){}
          localStorage.removeItem('cedar_ftue_completed');
          try { localStorage.removeItem('outpost_ftue_completed'); } catch(e){}

          const cleanDefaults = (typeof window.getDefaultProjectConfig === 'function')
            ? window.getDefaultProjectConfig()
            : null;
          if (cleanDefaults) {
            cleanDefaults.activityLog = [];
            cleanDefaults.categories = [];
            localStorage.setItem(window.STORAGE_KEY_PROJECT || 'sheesh_static_writer_project_v1', JSON.stringify(cleanDefaults));
          }
        } catch (e) {
          console.warn('[NuclearReset] Error executing nuclear reset:', e);
        }

        window.location.href = window.location.pathname + '#welcome';
        window.location.reload();
      });
    }

        const btnModalSaveSettings = document.getElementById('btn-modal-save-settings');
    if (btnModalSaveSettings) {
      btnModalSaveSettings.addEventListener('click', () => {
        const nameInputEl = document.getElementById('setting-site-title') || document.getElementById('designer-blog-title') || document.getElementById('setting-modal-project-name');
        let nameVal = nameInputEl ? nameInputEl.value.trim() : (projectConfig.name || '');
        const siteTitleError = document.getElementById('setting-site-title-error');

        const authorNameInputEl = document.getElementById('setting-author-name');
        const authorNameVal = authorNameInputEl ? authorNameInputEl.value.trim() : (projectConfig.defaultAuthor || '').trim();
        const authorNameError = document.getElementById('setting-author-name-error');

        let hasValidationError = false;
        if (!nameVal) {
          if (siteTitleError) siteTitleError.style.display = 'block';
          if (nameInputEl) nameInputEl.classList.add('ftue-input-error');
          hasValidationError = true;
        } else {
          if (siteTitleError) siteTitleError.style.display = 'none';
          if (nameInputEl) nameInputEl.classList.remove('ftue-input-error');
        }

        if (!authorNameVal) {
          if (authorNameError) authorNameError.style.display = 'block';
          if (authorNameInputEl) authorNameInputEl.classList.add('ftue-input-error');
          hasValidationError = true;
        } else {
          if (authorNameError) authorNameError.style.display = 'none';
          if (authorNameInputEl) authorNameInputEl.classList.remove('ftue-input-error');
        }

        if (hasValidationError) {
          if (!nameVal && nameInputEl) nameInputEl.focus();
          else if (!authorNameVal && authorNameInputEl) authorNameInputEl.focus();
          if (typeof showToast === 'function') showToast('Please enter all required fields.');
          return;
        }

        const baseVal = document.getElementById('setting-modal-base-url')?.value?.trim();
        const catInputEl = document.getElementById('setting-modal-default-category');
        const catVal = catInputEl ? catInputEl.value.trim() : (projectConfig.defaultCategory || 'Uncategorized');
        const tzInputEl = document.getElementById('setting-modal-timezone');
        const tzVal = tzInputEl ? tzInputEl.value.trim() : '';

        if (baseVal) projectConfig.baseUrl = baseVal;
        if (tzVal) projectConfig.timezone = tzVal;

        // Workspace & Site Theme (persisted in projectConfig and localStorage)
        const activeSwatch = document.querySelector('#settings-sec-theme .ftue-theme-swatch.active');
        if (activeSwatch) {
          const themeId = activeSwatch.getAttribute('data-theme-id');
          if (themeId) {
            projectConfig.editorTheme = themeId;
            if (!projectConfig.design) projectConfig.design = {};
            projectConfig.design.activeTheme = themeId;
            projectConfig.design.blogTheme = themeId;
            projectConfig.design.customColors = null;
            try {
              localStorage.setItem('cedar_editor_theme', themeId);
              localStorage.setItem('cedar_theme', themeId);
            } catch (e) {}
            if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {
              (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(themeId, true);
            }
            if (typeof window.syncDesignerThemeSwatches === 'function') {
              window.syncDesignerThemeSwatches(themeId);
            }
          }
        }

        // Title
        if (nameVal) {
          projectConfig.name = nameVal;
          if (!projectConfig.design) projectConfig.design = {};
          if (!projectConfig.design.branding) projectConfig.design.branding = {};
          projectConfig.design.branding.siteTitle = projectConfig.name;
        }

        // Staged Brand Logo
        if (stagedBrandLogo) {
          if (stagedBrandLogo.action === 'remove') {
            if (!projectConfig.design) projectConfig.design = {};
            if (!projectConfig.design.branding) projectConfig.design.branding = {};
            projectConfig.design.branding.generalLogo = '';
            projectConfig.design.branding.tabLogo = '';
            projectConfig.design.branding.originalLogo = '';
            projectConfig.design.branding.files = {};
            window.brandingFiles = null;
            try { localStorage.removeItem('cedar_branding_files_v1'); try { localStorage.removeItem('outpost_branding_files_v1'); } catch(e){} } catch (e) {}
          } else if (stagedBrandLogo.action === 'update') {
            if (!projectConfig.design) projectConfig.design = {};
            if (!projectConfig.design.branding) projectConfig.design.branding = {};
            projectConfig.design.branding.generalLogo = stagedBrandLogo.generalLogo;
            projectConfig.design.branding.tabLogo = stagedBrandLogo.tabLogo;
            projectConfig.design.branding.originalLogo = stagedBrandLogo.originalLogo;
            projectConfig.design.branding.folder = 'media/branding';
            projectConfig.design.branding.files = stagedBrandLogo.brandingAssets;
            window.brandingFiles = stagedBrandLogo.brandingAssets;
            try {
              localStorage.setItem('cedar_branding_files_v1', JSON.stringify(stagedBrandLogo.brandingAssets));
            } catch (e) {}
            if (window.SheeshVault && window.SheeshVault.isConnected() && typeof (window.Cedar?.writeBrandingAssetsToVault || window.Outpost?.writeBrandingAssetsToVault) === 'function') {
              (window.Cedar.writeBrandingAssetsToVault || window.Outpost.writeBrandingAssetsToVault)(stagedBrandLogo.brandingAssets);
            }
          }
        }


        // Default category defaults to Uncategorized
        const oldDefaultCat = projectConfig.defaultCategory || 'Uncategorized';
        const newDefaultCat = catVal || 'Uncategorized';
        projectConfig.defaultCategory = newDefaultCat;
        if (!Array.isArray(projectConfig.categories)) projectConfig.categories = [];
        const oldIdx = projectConfig.categories.indexOf(oldDefaultCat);
        if (oldIdx !== -1) {
          projectConfig.categories[oldIdx] = newDefaultCat;
        } else if (!projectConfig.categories.includes(newDefaultCat)) {
          projectConfig.categories.unshift(newDefaultCat);
        }

        // Vault Path (only update if explicitly present; never disconnect an active native FSA folder handle)
        const vaultInput = document.getElementById('setting-vault-folder-path');
        if (vaultInput) {
          const vaultPathVal = vaultInput.value.trim().replace(/^["']|["']$/g, '');
          if (vaultPathVal) {
            projectConfig.vaultPath = vaultPathVal;
            localStorage.setItem('cedar_vault_path', vaultPathVal);
            localStorage.setItem('cedar_vault_connected', '1');
            localStorage.removeItem('cedar_vault_disconnected');
          } else if (!(window.SheeshVault && window.SheeshVault.isConnected()) && !localStorage.getItem('cedar_vault_name')) {
            delete projectConfig.vaultPath;
            localStorage.removeItem('cedar_vault_path'); try { localStorage.removeItem('outpost_vault_path'); } catch(e){}
          }
        }

        // Domain & Blog Path
        const domainInputEl = document.getElementById('setting-modal-domain');
        let domainVal = domainInputEl ? domainInputEl.value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') : (projectConfig.domain || '');
        const blogPathInputEl = document.getElementById('setting-modal-blog-path');
        let blogPathVal = blogPathInputEl ? blogPathInputEl.value.trim().replace(/^\/+|\/+$/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '') : (projectConfig.blogPath || 'blog');

        projectConfig.domain = domainVal;
        localStorage.setItem(STORAGE_KEY_DOMAIN, domainVal);
        projectConfig.blogPath = blogPathVal;
        localStorage.setItem(STORAGE_KEY_BLOG_PATH, blogPathVal);

        // RSS Syndication Options
        const rssToggleEl = document.getElementById('setting-rss-enabled') || document.getElementById('setting-modal-rss-enabled');
        if (rssToggleEl) {
          const isRss = Boolean(rssToggleEl.checked);
          projectConfig.rssEnabled = isRss;
          try {
            if (isRss) {
              localStorage.removeItem('cedar_rss_user_explicitly_disabled');
            } else {
              localStorage.setItem('cedar_rss_user_explicitly_disabled', 'true');
            }
            localStorage.setItem(STORAGE_KEY_RSS_ENABLED, isRss ? 'true' : 'false');
          } catch (e) {}

          const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []);
          const rssDraft = allDrafts.find(d => d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
          if (rssDraft) {
            rssDraft.hidden = !isRss;
            rssDraft.retired = !isRss;
            if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
          }
        }

        // Sync RSS page content matching updated RSS settings
        if (typeof window.syncRssPageDraft === 'function') {
          window.syncRssPageDraft(projectConfig);
        }

        // Layout Override Option
        const layoutOverrideToggleEl = document.getElementById('setting-layout-override');
        if (layoutOverrideToggleEl) {
          const isOverride = Boolean(layoutOverrideToggleEl.checked);
          projectConfig.layoutOverride = isOverride;
          try {
            localStorage.setItem('cedar_layout_override', isOverride ? 'true' : 'false');
          } catch (e) {}
        }

        // Image Sanitization
        const sanitizeToggleEl = document.getElementById('setting-sanitize-images');
        const isSanitizeOn = sanitizeToggleEl ? Boolean(sanitizeToggleEl.checked) : (projectConfig.sanitizeImages !== false);
        projectConfig.sanitizeImages = isSanitizeOn;
        try {
          localStorage.setItem('cedar_sanitization_user_choice', isSanitizeOn ? 'on' : 'off');
        } catch (e) {}

        // Categories automatically get pages
        projectConfig.autoCategoryPages = true;

        // Author Profile Save
        const authorBioInputEl = document.getElementById('setting-author-bio');
        const authorBioVal = authorBioInputEl ? authorBioInputEl.value.trim() : '';
        const authorAvatarVal = currentSettingsAuthorAvatar || '';

        const prevAuthorName = (projectConfig.defaultAuthor || (projectConfig.authors && projectConfig.authors[0] && projectConfig.authors[0].name) || '').trim();

        projectConfig.defaultAuthor = authorNameVal;
        projectConfig.authors = [{
          name: authorNameVal,
          bio: authorBioVal,
          avatar: authorAvatarVal
        }];
        try {
          localStorage.setItem('cedar_active_author', authorNameVal);
          try { localStorage.setItem('outpost_active_author', authorNameVal); } catch (e) {}
        } catch (e) {}

        if (prevAuthorName && authorNameVal && prevAuthorName.toLowerCase() !== authorNameVal.toLowerCase()) {
          if (typeof window.logActivity === 'function') {
            window.logActivity('author', {
              action: 'renamed',
              oldName: prevAuthorName,
              name: authorNameVal,
              authorName: authorNameVal
            });
          }
        }

        if (Array.isArray(window.drafts)) {
          window.drafts.forEach(d => {
            if (d && d.type !== 'page') {
              d.authorName = authorNameVal;
              d.author = authorNameVal;
              d.authors = [authorNameVal];
            }
          });
          if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function') {
            window.CedarStore.hydrateFromList(window.drafts);
          }
          if (typeof window.saveDraftsToStorage === 'function') {
            window.saveDraftsToStorage();
          }
        }

        const cardRoundedEl = document.getElementById('pref-corner-rounded');
        const isRoundedVal = cardRoundedEl
          ? cardRoundedEl.classList.contains('active')
          : Boolean(projectConfig.mediaPreferences && projectConfig.mediaPreferences.roundedImages);
        if (!projectConfig.mediaPreferences) projectConfig.mediaPreferences = {};
        projectConfig.mediaPreferences.roundedImages = isRoundedVal;
        if (typeof window.applyMediaPreferences === 'function') {
          window.applyMediaPreferences(isRoundedVal);
        }

        saveProjectToStorage();
        syncLiveWorkspaceData();
        if (typeof window.renderHomeActivityStream === 'function') {
          window.renderHomeActivityStream();
        }

        if (typeof showToast === 'function') {
          showToast('Site info saved successfully!');
        }
      });
    }

    // Image Sanitization Toggle & Warning Dialog
    const settingSanitizeImages = document.getElementById('setting-sanitize-images');
    const modalSanitizationWarning = document.getElementById('modal-sanitization-warning');
    const btnCancelSanitize = document.getElementById('btn-cancel-disable-sanitization');
    const btnConfirmSanitize = document.getElementById('btn-confirm-disable-sanitization');
    const btnCloseSanitize = document.getElementById('btn-close-sanitization-warning');
    const badgeSanitize = document.getElementById('badge-sanitization-status');

    updateSanitizeBadge = function(isOn) {
      if (!badgeSanitize) return;
      badgeSanitize.textContent = isOn ? 'On (Metadata Stripped)' : 'Off (Metadata Preserved)';
      badgeSanitize.style.color = isOn ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #71717a)';
      badgeSanitize.style.background = isOn ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.08)';
    }

    if (settingSanitizeImages) {
      settingSanitizeImages.addEventListener('click', (e) => {
        // If user is trying to uncheck it (turn off sanitization)
        if (!settingSanitizeImages.checked) {
          // Keep it visually checked until confirmed
          e.preventDefault();
          settingSanitizeImages.checked = true;
          if (modalSanitizationWarning) {
            modalSanitizationWarning.style.display = 'flex';
          }
        } else {
          // Turning on - update the badge in Settings UI
          updateSanitizeBadge(true);
        }
      });
    }

    if (btnConfirmSanitize) {
      btnConfirmSanitize.addEventListener('click', () => {
        if (settingSanitizeImages) settingSanitizeImages.checked = false;
        updateSanitizeBadge(false);
        if (modalSanitizationWarning) modalSanitizationWarning.style.display = 'none';
      });
    }

    const closeSanitizeWarning = () => {
      if (settingSanitizeImages) settingSanitizeImages.checked = true;
      if (modalSanitizationWarning) modalSanitizationWarning.style.display = 'none';
    };

    if (btnCancelSanitize) btnCancelSanitize.addEventListener('click', closeSanitizeWarning);
    if (btnCloseSanitize) btnCloseSanitize.addEventListener('click', closeSanitizeWarning);
    if (modalSanitizationWarning) {
      modalSanitizationWarning.addEventListener('click', (e) => {
        if (e.target === modalSanitizationWarning) closeSanitizeWarning();
      });
    }




    // Real-time URL visualizer helper for live typing
    const updateUrlCardRealtime = () => {
      const inputDomainEl = document.getElementById('setting-modal-domain');
      const inputBlogPathEl = document.getElementById('setting-modal-blog-path');
      const rawDomain = (inputDomainEl ? inputDomainEl.value.trim() : (projectConfig.domain || '')).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const rawBlogPath = inputBlogPathEl ? inputBlogPathEl.value.trim().replace(/^\/+|\/+$/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '') : (projectConfig.blogPath || '');
      const origin = (window.location && window.location.origin) ? window.location.origin : 'http://localhost:8080';
      const siteBase = rawDomain ? `https://${rawDomain}` : origin;
      const liveUrl = rawDomain ? siteBase : '';

      // Sidebar Live navigation buttons
      const sidebarVisitOnline = document.getElementById('sidebar-tab-visit-online');
      const miniSidebarVisitOnline = document.getElementById('mini-sidebar-tab-visit-online');
      const sidebarLiveNavList = document.getElementById('sidebar-live-nav-list');
      const sidebarLiveDivider = document.getElementById('sidebar-live-divider');
      const miniSidebarLiveDivider = document.getElementById('mini-sidebar-live-divider');
      if (sidebarVisitOnline) {
        sidebarVisitOnline.style.display = liveUrl ? 'flex' : 'none';
      }
      if (miniSidebarVisitOnline) {
        miniSidebarVisitOnline.style.display = liveUrl ? 'flex' : 'none';
      }
      if (sidebarLiveNavList) {
        sidebarLiveNavList.style.display = liveUrl ? 'block' : 'none';
      }
      if (sidebarLiveDivider) {
        sidebarLiveDivider.style.display = liveUrl ? 'block' : 'none';
      }
      if (miniSidebarLiveDivider) {
        miniSidebarLiveDivider.style.display = liveUrl ? 'block' : 'none';
      }

      const rssToggleEl = document.getElementById('setting-rss-enabled') || document.getElementById('setting-modal-rss-enabled');
      const badgeRssStatus = document.getElementById('badge-rss-main-status') || document.getElementById('badge-rss-status');
      const rssDomainWarningBox = document.getElementById('rss-domain-warning-box');
      const rssActiveDetailsWrap = document.getElementById('rss-active-details-wrap');

      const isRssOn = rssToggleEl ? rssToggleEl.checked : ((typeof resolveProjectRssEnabled === 'function') ? resolveProjectRssEnabled() : Boolean(projectConfig.rssEnabled));

      if (badgeRssStatus) {
        badgeRssStatus.textContent = isRssOn ? 'Active (Broadcasting)' : 'Disabled (Off)';
        badgeRssStatus.style.color = isRssOn ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #71717a)';
        badgeRssStatus.style.background = isRssOn ? 'rgba(16, 185, 129, 0.12)' : 'rgba(113, 113, 122, 0.14)';
      }

      if (rssActiveDetailsWrap) {
        rssActiveDetailsWrap.style.display = isRssOn ? 'block' : 'none';
      }

      if (rssDomainWarningBox) {
        rssDomainWarningBox.style.display = (isRssOn && !rawDomain) ? 'flex' : 'none';
      }

      const rssPostsEl = document.getElementById('settings-url-preview-rss-posts');
      const badgeRssPosts = document.getElementById('badge-url-rss-posts');

      if (rssPostsEl) {
        rssPostsEl.textContent = `${siteBase}/feed.xml`;
      }
      if (badgeRssPosts) {
        badgeRssPosts.textContent = 'RSS Feed';
      }
    };

    // RSS Syndication feature toggle listener
    const rssToggleInput = document.getElementById('setting-rss-enabled') || document.getElementById('setting-modal-rss-enabled');

    if (rssToggleInput) {
      const handleRssToggle = (e) => {
        if (rssToggleInput.checked) {
          // Enable RSS
          try { localStorage.removeItem('cedar_rss_user_explicitly_disabled'); } catch (err) {}
          projectConfig.rssEnabled = true;
          try { localStorage.setItem(STORAGE_KEY_RSS_ENABLED, 'true'); } catch (err) {}
          const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []);
          const rssDraft = allDrafts.find(d => d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
          if (rssDraft) {
            rssDraft.hidden = false;
            rssDraft.retired = false;
            if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
          }
          if (typeof window.syncRssPageDraft === 'function') {
            window.syncRssPageDraft(projectConfig);
          }
          updateUrlCardRealtime();
          if (typeof showToast === 'function') {
            showToast('RSS syndication enabled');
          }
        } else {
          // Disabled RSS
          try { localStorage.setItem('cedar_rss_user_explicitly_disabled', 'true'); } catch (err) {}
          const wasEnabled = Boolean(projectConfig.rssEnabled);
          projectConfig.rssEnabled = false;
          try { localStorage.setItem(STORAGE_KEY_RSS_ENABLED, 'false'); } catch (err) {}
          const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []);
          const rssDraft = allDrafts.find(d => d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
          if (rssDraft) {
            rssDraft.hidden = true;
            rssDraft.retired = true;
            if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
          }
          updateUrlCardRealtime();
          if (wasEnabled && typeof showToast === 'function') {
            showToast('RSS syndication disabled');
          }
        }
      };

      rssToggleInput.addEventListener('change', (e) => {
        handleRssToggle(e);
      });
    }

    // Layout Override feature toggle listener
    const layoutOverrideInput = document.getElementById('setting-layout-override');
    if (layoutOverrideInput) {
      layoutOverrideInput.addEventListener('change', () => {
        const isOverride = Boolean(layoutOverrideInput.checked);
        projectConfig.layoutOverride = isOverride;
        try {
          localStorage.setItem('cedar_layout_override', isOverride ? 'true' : 'false');
        } catch (err) {}
        const badgeEl = document.getElementById('badge-layout-override-status');
        if (badgeEl) {
          badgeEl.textContent = isOverride ? 'Active (Manual Layouts Protected)' : 'Off (System Managed)';
          badgeEl.style.color = isOverride ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #71717a)';
          badgeEl.style.background = isOverride ? 'rgba(16, 185, 129, 0.12)' : 'rgba(113, 113, 122, 0.14)';
        }
        if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
        if (typeof showToast === 'function') {
          showToast(isOverride ? 'Layout Override enabled — manual page & post designs are protected' : 'Layout Override disabled — system templates active');
        }
      });
    }

    // Copy Feed URL buttons
    document.querySelectorAll('.btn-copy-feed-url').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-copy-target');
        const targetEl = document.getElementById(targetId);
        const textToCopy = targetEl ? targetEl.textContent.trim() : '';
        if (!textToCopy) return;

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
          } else {
            const temp = document.createElement('textarea');
            temp.value = textToCopy;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
          }
          const origText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = origText;
          }, 1500);
          if (typeof showToast === 'function') {
            showToast('Feed URL copied to clipboard');
          }
        } catch (err) {
          console.warn('Failed to copy feed URL:', err);
        }
      });
    });

    // Input listeners to update placeholders, URL visualizer, and persist to storage in real time
    const inputSiteName = document.getElementById('setting-modal-project-name');
    const inputDomain = document.getElementById('setting-modal-domain');
    const inputSiteTitle = document.getElementById('setting-site-title');
    if (inputSiteTitle) {
      inputSiteTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          scheduleAutoSaveSiteInfo(true);
        }
      });
      inputSiteTitle.addEventListener('input', () => {
        const val = inputSiteTitle.value.trim();
        const errEl = document.getElementById('setting-site-title-error');
        if (errEl && val.length > 0) {
          errEl.style.display = 'none';
          inputSiteTitle.classList.remove('ftue-input-error');
        }
        projectConfig.name = val;
        if (!projectConfig.design) projectConfig.design = {};
        if (!projectConfig.design.branding) projectConfig.design.branding = {};
        projectConfig.design.branding.siteTitle = val;
        if (typeof updateCedarTitle === 'function') updateCedarTitle();
        else if (typeof updateOutpostTitle === 'function') updateOutpostTitle();
        scheduleAutoSaveSiteInfo(false);
      });
      inputSiteTitle.addEventListener('change', () => scheduleAutoSaveSiteInfo(true));
    }
    const inputBlogPath = document.getElementById('setting-modal-blog-path');
    const inputTimezone = document.getElementById('setting-modal-timezone');
    if (inputTimezone) {
      inputTimezone.addEventListener('change', () => {
        scheduleAutoSaveSiteInfo(true);
      });
    }

    if (inputDomain) {
      inputDomain.addEventListener('blur', () => {
        const cleaned = inputDomain.value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (inputDomain.value !== cleaned) {
          inputDomain.value = cleaned;
          updateUrlCardRealtime();
        }
        scheduleAutoSaveSiteInfo(true);
      });
      inputDomain.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          scheduleAutoSaveSiteInfo(true);
        }
      });
      inputDomain.addEventListener('input', () => {
        const dVal = inputDomain.value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (inputSiteName && !inputSiteName.value.trim()) {
          inputSiteName.placeholder = dVal || '';
        }
        updateUrlCardRealtime();
        scheduleAutoSaveSiteInfo(false);
      });
    }

    if (inputBlogPath) {
      inputBlogPath.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const btnSave = document.getElementById('btn-modal-save-settings');
          if (btnSave) btnSave.click();
        }
      });
      inputBlogPath.addEventListener('input', () => {
        updateUrlCardRealtime();
      });
    }

    if (inputSiteName) {
      inputSiteName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const btnSave = document.getElementById('btn-modal-save-settings');
          if (btnSave) btnSave.click();
        }
      });
    }

    // Brand Logo Dropzone in Settings (1:1 with FTUE config menu)
    const settingsLogoDropzone = document.getElementById('settings-logo-dropzone');
    const settingsLogoFileInput = document.getElementById('settings-logo-file-input');
    const settingsLogoEmptyState = document.getElementById('settings-logo-empty-state');
    const settingsLogoPreviewState = document.getElementById('settings-logo-preview-state');
    const settingsLogoPreviewImg = document.getElementById('settings-logo-preview-img');
    const settingsLogoFileName = document.getElementById('settings-logo-file-name');
    const settingsLogoDimsBadge = document.getElementById('settings-logo-dims-badge');
    const btnSettingsChangeLogo = document.getElementById('settings-btn-change-logo');
    const btnSettingsRemoveLogo = document.getElementById('settings-btn-remove-logo');

    let settingsDragCounter = 0;
    let settingsErrorResetTimeout = null;

    function isSettingsImageDrag(e) {
      if (!e.dataTransfer) return false;
      const dt = e.dataTransfer;
      const types = Array.from(dt.types || []);
      if (!types.includes('Files')) return false;
      if (dt.items && dt.items.length > 0) {
        for (let i = 0; i < dt.items.length; i++) {
          const item = dt.items[i];
          if (item.kind && item.kind !== 'file') return false;
          if (item.type) {
            return item.type.startsWith('image/');
          }
        }
      }
      return true;
    }

    function showSettingsDragFeedback(isValid) {
      if (settingsErrorResetTimeout) {
        clearTimeout(settingsErrorResetTimeout);
        settingsErrorResetTimeout = null;
      }

      const overlay = document.getElementById('settings-logo-drag-overlay');
      const iconEl = document.getElementById('settings-drag-feedback-icon');
      const titleEl = document.getElementById('settings-drag-feedback-title');
      const subEl = document.getElementById('settings-drag-feedback-sub');
      if (!overlay || !iconEl || !titleEl || !subEl || !settingsLogoDropzone) return;

      overlay.style.display = 'flex';
      overlay.className = 'ftue-logo-drag-overlay ' + (isValid ? 'drag-valid' : 'drag-invalid');
      settingsLogoDropzone.classList.toggle('drag-valid', isValid);
      settingsLogoDropzone.classList.toggle('drag-invalid', !isValid);

      const activeThemeId = (projectConfig.design && projectConfig.design.activeTheme) || 'basalt';
      const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
      const palette = palettes[activeThemeId] || palettes.basalt || { c30: '#18181b', isLight: false };

      if (isValid) {
        settingsLogoDropzone.style.setProperty('border-color', palette.isLight ? '#059669' : '#10b981', 'important');
        settingsLogoDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.12)', 'important');
        iconEl.innerHTML = `
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        titleEl.textContent = 'Okay to release';
        subEl.textContent = (settingsLogoPreviewState && settingsLogoPreviewState.style.display !== 'none')
          ? 'Drop to replace current logo'
          : 'Drop to set brand logo';
      } else {
        settingsLogoDropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
        settingsLogoDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');
        iconEl.innerHTML = `
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        `;
        titleEl.textContent = "Won't work";
        subEl.textContent = 'Only image files (PNG, JPG, SVG, WebP) are supported';
      }
    }

    function hideSettingsDragFeedback() {
      const overlay = document.getElementById('settings-logo-drag-overlay');
      if (overlay) overlay.style.display = 'none';
      if (settingsLogoDropzone) {
        settingsLogoDropzone.classList.remove('drag-valid', 'drag-invalid', 'dragover', 'ftue-shake');
        updateSettingsLogoBackground();
      }
    }

    function showSettingsDropzoneError(message) {
      if (settingsErrorResetTimeout) clearTimeout(settingsErrorResetTimeout);

      const overlay = document.getElementById('settings-logo-drag-overlay');
      const iconEl = document.getElementById('settings-drag-feedback-icon');
      const titleEl = document.getElementById('settings-drag-feedback-title');
      const subEl = document.getElementById('settings-drag-feedback-sub');
      if (!overlay || !iconEl || !titleEl || !subEl || !settingsLogoDropzone) return;

      overlay.style.display = 'flex';
      overlay.className = 'ftue-logo-drag-overlay drag-invalid';
      settingsLogoDropzone.classList.remove('drag-valid');
      settingsLogoDropzone.classList.add('drag-invalid');

      const activeThemeId = (projectConfig.design && projectConfig.design.activeTheme) || 'basalt';
      const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
      const palette = palettes[activeThemeId] || palettes.basalt || { c30: '#18181b', isLight: false };

      settingsLogoDropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
      settingsLogoDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');

      settingsLogoDropzone.classList.remove('ftue-shake');
      void settingsLogoDropzone.offsetWidth; // force reflow
      settingsLogoDropzone.classList.add('ftue-shake');

      iconEl.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      `;
      titleEl.textContent = "Won't work";
      subEl.textContent = message || 'Only image files (PNG, JPG, SVG, WebP) are supported';

      if (typeof window.showToast === 'function') {
        window.showToast("Won't work: Please select a valid image file (PNG, JPG, SVG, WebP)");
      }

      settingsErrorResetTimeout = setTimeout(() => {
        hideSettingsDragFeedback();
        settingsErrorResetTimeout = null;
      }, 2500);
    }

    if (settingsLogoDropzone && settingsLogoFileInput) {
      settingsLogoDropzone.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.ftue-logo-preview-meta')) return;
        if (settingsLogoPreviewState && settingsLogoPreviewState.style.display !== 'none' && !e.target.closest('.ftue-logo-stage')) {
          return;
        }
        if (settingsErrorResetTimeout) {
          clearTimeout(settingsErrorResetTimeout);
          settingsErrorResetTimeout = null;
          hideSettingsDragFeedback();
        }
        settingsLogoFileInput.click();
      });

      settingsLogoDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        settingsDragCounter++;
        const isValid = isSettingsImageDrag(e);
        showSettingsDragFeedback(isValid);
      });

      settingsLogoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        const isValid = isSettingsImageDrag(e);
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = isValid ? 'copy' : 'none';
        }
        showSettingsDragFeedback(isValid);
      });

      settingsLogoDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        settingsDragCounter--;
        if (settingsDragCounter <= 0) {
          settingsDragCounter = 0;
          hideSettingsDragFeedback();
        }
      });

      settingsLogoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        settingsDragCounter = 0;
        hideSettingsDragFeedback();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleSettingsLogoFile(e.dataTransfer.files[0]);
        } else {
          showSettingsDropzoneError("Won't work — Please drop an image file (PNG, JPG, SVG, WebP)");
        }
      });

      settingsLogoFileInput.addEventListener('change', () => {
        if (settingsLogoFileInput.files && settingsLogoFileInput.files[0]) {
          handleSettingsLogoFile(settingsLogoFileInput.files[0]);
        }
      });
    }

    if (btnSettingsChangeLogo && settingsLogoFileInput) {
      btnSettingsChangeLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (settingsErrorResetTimeout) {
          clearTimeout(settingsErrorResetTimeout);
          settingsErrorResetTimeout = null;
          hideSettingsDragFeedback();
        }
        settingsLogoFileInput.click();
      });
    }

    handleSettingsLogoFile = function(file) {
      if (!file || !file.type.startsWith('image/')) {
        showSettingsDropzoneError("Won't work — Only image files (PNG, JPG, SVG, WebP) are supported");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawDataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          const naturalW = img.naturalWidth || 1;
          const naturalH = img.naturalHeight || 1;

          const scalePct = Math.min(100, Math.max(10, Math.round((naturalW / 1200) * 100)));

          if (settingsLogoPreviewImg) {
            settingsLogoPreviewImg.src = rawDataUrl;
            settingsLogoPreviewImg.style.width = 'auto';
            settingsLogoPreviewImg.style.maxWidth = `${scalePct}%`;
          }
          if (settingsLogoFileName) {
            settingsLogoFileName.textContent = file.name;
          }
          if (settingsLogoDimsBadge) {
            settingsLogoDimsBadge.textContent = `${naturalW} × ${naturalH}px (${scalePct}% width)`;
          }
          if (settingsLogoEmptyState) settingsLogoEmptyState.style.display = 'none';
          if (settingsLogoPreviewState) settingsLogoPreviewState.style.display = 'flex';

          let mastheadDataUrl = rawDataUrl;
          let originalDataUrl = rawDataUrl;
          let iconDataUrl = rawDataUrl;

          if (((window.Cedar && typeof window.Cedar.generateResizedCanvasImage === 'function') || (window.Outpost && typeof (window.Cedar.generateResizedCanvasImage || window.Outpost.generateResizedCanvasImage) === 'function'))) {
            mastheadDataUrl = (window.Cedar.generateResizedCanvasImage || window.Outpost.generateResizedCanvasImage)(img, 1200, 1200, false);
            originalDataUrl = (window.Cedar.generateResizedCanvasImage || window.Outpost.generateResizedCanvasImage)(img, 1200, 1200, false);
            iconDataUrl = (window.Cedar.generateResizedCanvasImage || window.Outpost.generateResizedCanvasImage)(img, 64, 64, false);
          }

          if (!projectConfig.design) projectConfig.design = {};
          if (!projectConfig.design.branding) projectConfig.design.branding = {};

          const rawFav = projectConfig.design.branding.tabLogo || '';
          const existingFavFile = (projectConfig.design.branding.files && projectConfig.design.branding.files['media/branding/icon.png'])
            || (window.brandingFiles && window.brandingFiles['media/branding/icon.png'])
            || '';
          const isFaviconEmpty = !(rawFav && rawFav !== 'icon.png' && rawFav !== '/icon.png') && !existingFavFile;

          const newFiles = {
            'media/branding/logo.png': mastheadDataUrl,
            'media/branding/logo-original.png': originalDataUrl
          };

          if (isFaviconEmpty) {
            newFiles['media/branding/icon.png'] = iconDataUrl;
            projectConfig.design.branding.tabLogo = iconDataUrl;
            delete projectConfig.design.branding.faviconExplicitlyRemoved;

            const favPreviewImg = document.getElementById('settings-favicon-preview-img');
            const favFileName = document.getElementById('settings-favicon-file-name');
            const favDimsBadge = document.getElementById('settings-favicon-dims-badge');
            const favEmptyState = document.getElementById('settings-favicon-empty-state');
            const favPreviewState = document.getElementById('settings-favicon-preview-state');
            if (favPreviewImg) favPreviewImg.src = iconDataUrl;
            if (favFileName) favFileName.textContent = file.name;
            if (favDimsBadge) favDimsBadge.textContent = `${Math.min(64, naturalW)} × ${Math.min(64, naturalH)}px`;
            if (favEmptyState) favEmptyState.style.display = 'none';
            if (favPreviewState) favPreviewState.style.display = 'flex';

            const tabLogoEl = document.querySelector("link[rel*='icon']");
            if (tabLogoEl) tabLogoEl.href = iconDataUrl;
          }

          const brandingAssets = Object.assign(
            {},
            projectConfig.design.branding.files || {},
            window.brandingFiles || {},
            newFiles
          );

          stagedBrandLogo = null;
          projectConfig.logo = mastheadDataUrl;
          projectConfig.design.branding.generalLogo = mastheadDataUrl;
          projectConfig.design.branding.originalLogo = originalDataUrl;
          projectConfig.design.branding.folder = 'media/branding';
          projectConfig.design.branding.files = brandingAssets;
          window.brandingFiles = brandingAssets;
          try {
            localStorage.setItem('cedar_branding_files_v1', JSON.stringify(brandingAssets));
          } catch (e) {}
          if (window.SheeshVault && window.SheeshVault.isConnected() && typeof (window.Cedar?.writeBrandingAssetsToVault || window.Outpost?.writeBrandingAssetsToVault) === 'function') {
            (window.Cedar.writeBrandingAssetsToVault || window.Outpost.writeBrandingAssetsToVault)(brandingAssets);
          }
          if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
          if (typeof syncLiveWorkspaceData === 'function') syncLiveWorkspaceData();
          if (typeof window.updateAllPreviewFrames === 'function') window.updateAllPreviewFrames();
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    };

    if (btnSettingsRemoveLogo) {
      btnSettingsRemoveLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSettingsDragFeedback();

        if (settingsLogoFileInput) settingsLogoFileInput.value = '';
        if (settingsLogoPreviewImg) {
          settingsLogoPreviewImg.src = '';
          settingsLogoPreviewImg.style.width = '';
          settingsLogoPreviewImg.style.maxWidth = '';
        }
        if (settingsLogoDimsBadge) settingsLogoDimsBadge.textContent = '--';
        if (settingsLogoPreviewState) settingsLogoPreviewState.style.display = 'none';
        if (settingsLogoEmptyState) settingsLogoEmptyState.style.display = 'flex';

        stagedBrandLogo = null;
        projectConfig.logo = '';
        if (!projectConfig.design) projectConfig.design = {};
        if (!projectConfig.design.branding) projectConfig.design.branding = {};
        projectConfig.design.branding.generalLogo = '';
        projectConfig.design.branding.originalLogo = '';
        const remainingFiles = Object.assign({}, projectConfig.design.branding.files || {}, window.brandingFiles || {});
        delete remainingFiles['media/branding/logo.png'];
        delete remainingFiles['media/branding/logo-original.png'];
        projectConfig.design.branding.files = remainingFiles;
        window.brandingFiles = Object.keys(remainingFiles).length > 0 ? remainingFiles : null;
        try {
          if (window.brandingFiles) {
            localStorage.setItem('cedar_branding_files_v1', JSON.stringify(remainingFiles));
          } else {
            localStorage.removeItem('cedar_branding_files_v1');
            try { localStorage.removeItem('outpost_branding_files_v1'); } catch (e) {}
          }
        } catch (e) {}
        if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
        if (typeof syncLiveWorkspaceData === 'function') syncLiveWorkspaceData();
        if (typeof window.updateAllPreviewFrames === 'function') window.updateAllPreviewFrames();
      });
    }

    // Favicon Dropzone in Settings
    const settingsFaviconDropzone = document.getElementById('settings-favicon-dropzone');
    const settingsFaviconFileInput = document.getElementById('settings-favicon-file-input');
    const settingsFaviconEmptyState = document.getElementById('settings-favicon-empty-state');
    const settingsFaviconPreviewState = document.getElementById('settings-favicon-preview-state');
    const settingsFaviconPreviewImg = document.getElementById('settings-favicon-preview-img');
    const settingsFaviconFileName = document.getElementById('settings-favicon-file-name');
    const settingsFaviconDimsBadge = document.getElementById('settings-favicon-dims-badge');
    const btnSettingsChangeFavicon = document.getElementById('settings-btn-change-favicon');
    const btnSettingsRemoveFavicon = document.getElementById('settings-btn-remove-favicon');

    let settingsFaviconDragCounter = 0;
    let settingsFaviconErrorTimeout = null;

    function showSettingsFaviconDragFeedback(isValid) {
      if (settingsFaviconErrorTimeout) {
        clearTimeout(settingsFaviconErrorTimeout);
        settingsFaviconErrorTimeout = null;
      }

      const overlay = document.getElementById('settings-favicon-drag-overlay');
      const iconEl = document.getElementById('settings-favicon-drag-feedback-icon');
      const titleEl = document.getElementById('settings-favicon-drag-feedback-title');
      const subEl = document.getElementById('settings-favicon-drag-feedback-sub');
      if (!overlay || !iconEl || !titleEl || !subEl || !settingsFaviconDropzone) return;

      overlay.style.display = 'flex';
      overlay.className = 'ftue-logo-drag-overlay ' + (isValid ? 'drag-valid' : 'drag-invalid');
      settingsFaviconDropzone.classList.toggle('drag-valid', isValid);
      settingsFaviconDropzone.classList.toggle('drag-invalid', !isValid);

      const activeThemeId = (projectConfig.design && projectConfig.design.activeTheme) || 'basalt';
      const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
      const palette = palettes[activeThemeId] || palettes.basalt || { c30: '#18181b', isLight: false };

      if (isValid) {
        settingsFaviconDropzone.style.setProperty('border-color', palette.isLight ? '#059669' : '#10b981', 'important');
        settingsFaviconDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.12)', 'important');
        iconEl.innerHTML = `
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        titleEl.textContent = 'Okay to release';
        subEl.textContent = (settingsFaviconPreviewState && settingsFaviconPreviewState.style.display !== 'none')
          ? 'Drop to replace current favicon'
          : 'Drop to set favicon';
      } else {
        settingsFaviconDropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
        settingsFaviconDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');
        iconEl.innerHTML = `
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        `;
        titleEl.textContent = "Won't work";
        subEl.textContent = 'Only image files (PNG, JPG, SVG, WebP, ICO) are supported';
      }
    }

    function hideSettingsFaviconDragFeedback() {
      const overlay = document.getElementById('settings-favicon-drag-overlay');
      if (overlay) overlay.style.display = 'none';
      if (settingsFaviconDropzone) {
        settingsFaviconDropzone.classList.remove('drag-valid', 'drag-invalid', 'dragover', 'ftue-shake');
        updateSettingsLogoBackground();
      }
    }

    function showSettingsFaviconDropzoneError(message) {
      if (settingsFaviconErrorTimeout) clearTimeout(settingsFaviconErrorTimeout);

      const overlay = document.getElementById('settings-favicon-drag-overlay');
      const iconEl = document.getElementById('settings-favicon-drag-feedback-icon');
      const titleEl = document.getElementById('settings-favicon-drag-feedback-title');
      const subEl = document.getElementById('settings-favicon-drag-feedback-sub');
      if (!overlay || !iconEl || !titleEl || !subEl || !settingsFaviconDropzone) return;

      overlay.style.display = 'flex';
      overlay.className = 'ftue-logo-drag-overlay drag-invalid';
      settingsFaviconDropzone.classList.remove('drag-valid');
      settingsFaviconDropzone.classList.add('drag-invalid');

      const activeThemeId = (projectConfig.design && projectConfig.design.activeTheme) || 'basalt';
      const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
      const palette = palettes[activeThemeId] || palettes.basalt || { c30: '#18181b', isLight: false };

      settingsFaviconDropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
      settingsFaviconDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');

      settingsFaviconDropzone.classList.remove('ftue-shake');
      void settingsFaviconDropzone.offsetWidth;
      settingsFaviconDropzone.classList.add('ftue-shake');

      iconEl.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      `;
      titleEl.textContent = "Won't work";
      subEl.textContent = message || 'Only image files (PNG, JPG, SVG, WebP, ICO) are supported';

      if (typeof window.showToast === 'function') {
        window.showToast("Won't work: Please select a valid image file (PNG, JPG, SVG, WebP, ICO)");
      }

      settingsFaviconErrorTimeout = setTimeout(() => {
        hideSettingsFaviconDragFeedback();
        settingsFaviconErrorTimeout = null;
      }, 2500);
    }

    function handleSettingsFaviconFile(file) {
      if (!file || (!file.type.startsWith('image/') && !/\.ico$/i.test(file.name || ''))) {
        showSettingsFaviconDropzoneError("Won't work — Only image files (PNG, JPG, SVG, WebP, ICO) are supported");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawDataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          let iconDataUrl = rawDataUrl;
          const resizer = (window.Cedar && window.Cedar.generateResizedCanvasImage) || (window.Outpost && window.Outpost.generateResizedCanvasImage);
          if (typeof resizer === 'function') {
            iconDataUrl = resizer(img, 64, 64, false);
          }

          const finalW = Math.min(64, img.naturalWidth || 64);
          const finalH = Math.min(64, img.naturalHeight || 64);

          if (settingsFaviconPreviewImg) {
            settingsFaviconPreviewImg.src = iconDataUrl;
          }
          if (settingsFaviconFileName) {
            settingsFaviconFileName.textContent = file.name;
          }
          if (settingsFaviconDimsBadge) {
            settingsFaviconDimsBadge.textContent = `${finalW} × ${finalH}px`;
          }
          if (settingsFaviconEmptyState) settingsFaviconEmptyState.style.display = 'none';
          if (settingsFaviconPreviewState) settingsFaviconPreviewState.style.display = 'flex';

          if (!projectConfig.design) projectConfig.design = {};
          if (!projectConfig.design.branding) projectConfig.design.branding = {};

          const brandingAssets = Object.assign(
            {},
            projectConfig.design.branding.files || {},
            window.brandingFiles || {},
            {
              'media/branding/icon.png': iconDataUrl
            }
          );

          projectConfig.design.branding.tabLogo = iconDataUrl;
          delete projectConfig.design.branding.faviconExplicitlyRemoved;
          projectConfig.design.branding.folder = 'media/branding';
          projectConfig.design.branding.files = brandingAssets;
          window.brandingFiles = brandingAssets;
          try {
            localStorage.setItem('cedar_branding_files_v1', JSON.stringify(brandingAssets));
          } catch (e) {}

          const tabLogoEl = document.querySelector("link[rel*='icon']");
          if (tabLogoEl) {
            tabLogoEl.href = iconDataUrl;
          }

          if (window.SheeshVault && window.SheeshVault.isConnected() && typeof (window.Cedar?.writeBrandingAssetsToVault || window.Outpost?.writeBrandingAssetsToVault) === 'function') {
            (window.Cedar.writeBrandingAssetsToVault || window.Outpost.writeBrandingAssetsToVault)({ 'media/branding/icon.png': iconDataUrl });
          }
          if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
          if (typeof syncLiveWorkspaceData === 'function') syncLiveWorkspaceData();
          if (typeof window.updateAllPreviewFrames === 'function') window.updateAllPreviewFrames();
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }

    if (settingsFaviconDropzone && settingsFaviconFileInput) {
      settingsFaviconDropzone.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.ftue-logo-preview-meta')) return;
        if (settingsFaviconPreviewState && settingsFaviconPreviewState.style.display !== 'none' && !e.target.closest('.ftue-logo-stage')) {
          return;
        }
        if (settingsFaviconErrorTimeout) {
          clearTimeout(settingsFaviconErrorTimeout);
          settingsFaviconErrorTimeout = null;
          hideSettingsFaviconDragFeedback();
        }
        settingsFaviconFileInput.click();
      });

      settingsFaviconDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        settingsFaviconDragCounter++;
        const isValid = isSettingsImageDrag(e);
        showSettingsFaviconDragFeedback(isValid);
      });

      settingsFaviconDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        const isValid = isSettingsImageDrag(e);
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = isValid ? 'copy' : 'none';
        }
        showSettingsFaviconDragFeedback(isValid);
      });

      settingsFaviconDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        settingsFaviconDragCounter--;
        if (settingsFaviconDragCounter <= 0) {
          settingsFaviconDragCounter = 0;
          hideSettingsFaviconDragFeedback();
        }
      });

      settingsFaviconDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        settingsFaviconDragCounter = 0;
        hideSettingsFaviconDragFeedback();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleSettingsFaviconFile(e.dataTransfer.files[0]);
        } else {
          showSettingsFaviconDropzoneError("Won't work — Please drop an image file (PNG, JPG, SVG, WebP, ICO)");
        }
      });

      settingsFaviconFileInput.addEventListener('change', () => {
        if (settingsFaviconFileInput.files && settingsFaviconFileInput.files[0]) {
          handleSettingsFaviconFile(settingsFaviconFileInput.files[0]);
        }
      });
    }

    if (btnSettingsChangeFavicon && settingsFaviconFileInput) {
      btnSettingsChangeFavicon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (settingsFaviconErrorTimeout) {
          clearTimeout(settingsFaviconErrorTimeout);
          settingsFaviconErrorTimeout = null;
          hideSettingsFaviconDragFeedback();
        }
        settingsFaviconFileInput.click();
      });
    }

    if (btnSettingsRemoveFavicon) {
      btnSettingsRemoveFavicon.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSettingsFaviconDragFeedback();

        if (settingsFaviconFileInput) settingsFaviconFileInput.value = '';
        if (settingsFaviconPreviewImg) {
          settingsFaviconPreviewImg.src = '';
        }
        if (settingsFaviconDimsBadge) settingsFaviconDimsBadge.textContent = '--';
        if (settingsFaviconPreviewState) settingsFaviconPreviewState.style.display = 'none';
        if (settingsFaviconEmptyState) settingsFaviconEmptyState.style.display = 'flex';

        if (!projectConfig.design) projectConfig.design = {};
        if (!projectConfig.design.branding) projectConfig.design.branding = {};
        projectConfig.design.branding.tabLogo = '';
        projectConfig.design.branding.faviconExplicitlyRemoved = true;
        const remainingFiles = Object.assign({}, projectConfig.design.branding.files || {}, window.brandingFiles || {});
        delete remainingFiles['media/branding/icon.png'];
        projectConfig.design.branding.files = remainingFiles;
        window.brandingFiles = Object.keys(remainingFiles).length > 0 ? remainingFiles : null;
        try {
          if (window.brandingFiles) {
            localStorage.setItem('cedar_branding_files_v1', JSON.stringify(remainingFiles));
          } else {
            localStorage.removeItem('cedar_branding_files_v1');
            try { localStorage.removeItem('outpost_branding_files_v1'); } catch (e) {}
          }
        } catch (e) {}

        const tabLogoEl = document.querySelector("link[rel*='icon']");
        if (tabLogoEl) {
          tabLogoEl.href = 'icon.png';
        }

        if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
        if (typeof syncLiveWorkspaceData === 'function') syncLiveWorkspaceData();
        if (typeof window.updateAllPreviewFrames === 'function') window.updateAllPreviewFrames();
      });
    }

    const linkGotoBranding = document.getElementById('link-goto-branding');
    if (linkGotoBranding) {
      linkGotoBranding.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.navigateTo === 'function') {
          window.navigateTo('designer');
        } else {
          window.location.hash = '#designer';
        }
        setTimeout(() => {
          if (((window.Cedar && window.Cedar.designer) || (window.Outpost && window.Outpost.designer)) && typeof window.Outpost.designer.switchSubtab === 'function') {
            ((window.Cedar.designer) || (window.Outpost.designer)).switchSubtab('branding');
          } else {
            const tabBtn = document.querySelector('[data-designer-tab="branding"]');
            if (tabBtn) tabBtn.click();
          }
        }, 50);
      });
    }

    const btnSettingsZip = document.getElementById('btn-settings-download-zip');
    if (btnSettingsZip) {
      btnSettingsZip.addEventListener('click', exportMasterSliceZip);
    }

    // GitHub Cloud Sync Event Listeners
    const btnToggleGhToken = document.getElementById('btn-toggle-github-token');
    if (btnToggleGhToken) {
      btnToggleGhToken.addEventListener('click', (e) => {
        e.preventDefault();
        const tokenInput = document.getElementById('setting-github-token');
        if (tokenInput) {
          const isPass = tokenInput.type === 'password';
          tokenInput.type = isPass ? 'text' : 'password';
          const icon = document.getElementById('icon-token-show');
          if (icon) {
            icon.innerHTML = isPass
              ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
              : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
          }
        }
      });
    }

    // Note: btn-github-test, btn-github-save, btn-github-push, and btn-github-disconnect
    // are managed directly by js/vault/github-sync.js (initSyncUI) to prevent duplicate listeners.
    const btnGhPull = document.getElementById('btn-github-pull');
    if (btnGhPull && !btnGhPull._hasGhPullListener) {
      btnGhPull._hasGhPullListener = true;
      btnGhPull.addEventListener('click', async () => {
        if (!window.Cedar?.githubSync) return;
        if (!window.Cedar.githubSync.isConfigured()) {
          if (typeof showToast === 'function') showToast('Please enter and save your GitHub credentials first.');
          return;
        }
        const confirmPull = confirm('Pull from GitHub?\n\nThis will load your drafts, pages, and blog settings from GitHub into this browser. Any unsaved local edits will be replaced.');
        if (!confirmPull) return;
        try {
          await window.Cedar.githubSync.pullFromGitHub();
        } catch (e) {
          // Handled inside pullFromGitHub with toast
        }
      });
    }



    // Editor Theme Swatch Selection in Settings
    const settingsSecTheme = document.getElementById('settings-sec-theme');
    if (settingsSecTheme) {
      settingsSecTheme.addEventListener('click', (e) => {
        const swatch = e.target.closest('.ftue-theme-swatch');
        if (!swatch) return;
        e.stopPropagation();
        const themeId = swatch.getAttribute('data-theme-id');
        if (!themeId) return;

        const allSwatches = settingsSecTheme.querySelectorAll('.ftue-theme-swatch');
        allSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        // Apply and persist unified theme live across editor and site
        projectConfig.editorTheme = themeId;
        if (!projectConfig.design) projectConfig.design = {};
        projectConfig.design.activeTheme = themeId;
        projectConfig.design.blogTheme = themeId;
        projectConfig.design.customColors = null;
        if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {
          (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(themeId, true);
        }
        if (typeof window.syncDesignerThemeSwatches === 'function') {
          window.syncDesignerThemeSwatches(themeId);
        }
        if (typeof window.updateSettingsLogoBackground === 'function') {
          window.updateSettingsLogoBackground();
        }
        saveProjectToStorage();
        syncLiveWorkspaceData();
      });
    }

    // Dynamic Author Bio placeholder updater (author now managed solely in authors tab)
    updateSettingsBioPlaceholder = function() {};



    // Real-time Vault synchronization
    window.addEventListener('sheesh-vault-status-changed', renderProjectSettings);

    // Settings TOC ScrollSpy & Navigation
    initSettingsScrollSpy = function() {
      const container = document.querySelector('.dash-main-content');
      const paneSettings = document.getElementById('pane-settings');
      if (!container || !paneSettings) return;

      const tocLinks = paneSettings.querySelectorAll('.settings-toc-link');
      if (tocLinks.length === 0) return;

      function setActiveToc(targetId) {
        tocLinks.forEach(link => {
          const id = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');
          if (id === targetId) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }

      let isProgrammaticScroll = false;
      let programmaticScrollTimer = null;

      tocLinks.forEach(link => {
        if (link._hasTocListener) return;
        link._hasTocListener = true;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetId = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            setActiveToc(targetId);
            if (container) {
              isProgrammaticScroll = true;
              if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
              programmaticScrollTimer = setTimeout(() => {
                isProgrammaticScroll = false;
              }, 500);
              const cRect = container.getBoundingClientRect();
              const tRect = targetEl.getBoundingClientRect();
              const topPos = tRect.top - cRect.top + container.scrollTop - 20;
              container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
            } else {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        });
      });

      function updateActiveSection() {
        if (isProgrammaticScroll) return;
        if (paneSettings.style.display === 'none' && !paneSettings.classList.contains('active')) {
          return;
        }

        const sections = Array.from(paneSettings.querySelectorAll('.settings-section-group')).filter(Boolean);

        if (sections.length === 0) return;

        const containerRect = container.getBoundingClientRect();
        const targetTop = containerRect.top + 30;

        let closestSec = sections[0];
        let minDiff = Infinity;

        for (const sec of sections) {
          const rect = sec.getBoundingClientRect();
          const diff = Math.abs(rect.top - targetTop);
          if (diff < minDiff) {
            minDiff = diff;
            closestSec = sec;
          }
        }

        if (closestSec) {
          setActiveToc(closestSec.id);
        }
      }

      let isTicking = false;
      function onScroll() {
        if (!isTicking) {
          window.requestAnimationFrame(() => {
            updateActiveSection();
            isTicking = false;
          });
          isTicking = true;
        }
      }

      if (!container._hasSettingsScrollSpy) {
        container._hasSettingsScrollSpy = true;
        container.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
      }

      window.updateSettingsActiveSection = updateActiveSection;
      updateActiveSection();
    }

    initSettingsScrollSpy();


    // 8. Save Project Settings & Technical Settings
    const handleSaveExportSettings = () => {
      const nameVal = document.getElementById('setting-project-name')?.value.trim();
      const baseVal = document.getElementById('setting-base-url')?.value.trim();
      if (nameVal) projectConfig.name = nameVal;
      if (baseVal) projectConfig.baseUrl = baseVal;
      saveProjectToStorage();
      renderProjectSettings();
      showToast('Saved Settings!');
    };

    const btnSaveProj = document.getElementById('btn-save-project-settings');
    if (btnSaveProj) btnSaveProj.addEventListener('click', handleSaveExportSettings);

    const btnSaveTech = document.getElementById('btn-save-technical-settings');
    if (btnSaveTech) btnSaveTech.addEventListener('click', handleSaveExportSettings);

    // 9. Built-In Page Restoration
    const restoreSelect = document.getElementById('setting-restore-builtin-select');
    const restoreError = document.getElementById('setting-restore-builtin-error');
    const btnRestorePage = document.getElementById('btn-restore-builtin-page');

    if (restoreSelect && !restoreSelect._hasRestoreChangeListener) {
      restoreSelect._hasRestoreChangeListener = true;
      restoreSelect.addEventListener('change', () => {
        if (restoreSelect.value) {
          restoreSelect.classList.remove('ftue-input-error');
          if (restoreError) restoreError.style.display = 'none';
        }
      });
    }

    async function restoreBuiltInPageToDefaults(pageId) {
      const targetDrafts = Array.isArray(window.drafts) ? window.drafts : [];
      let defaultPage = null;

      if (pageId === 'page_about') {
        defaultPage = (typeof window.createDefaultAboutPage === 'function')
          ? window.createDefaultAboutPage()
          : {
              id: 'page_about',
              type: 'page',
              status: 'published',
              title: 'About',
              slug: 'about',
              subtitle: '',
              markdown: '',
              proseHtml: '',
              hidden: true,
              retired: true,
              images: []
            };
      } else if (pageId === 'page_links') {
        defaultPage = (typeof window.createDefaultLinksPage === 'function')
          ? window.createDefaultLinksPage()
          : {
              id: 'page_links',
              type: 'page',
              status: 'published',
              title: 'Links',
              slug: 'links',
              subtitle: 'See what I am up to.',
              markdown: '',
              proseHtml: '',
              linksData: { profile: { headline: 'Welcome!', bio: 'See what I am up to.', avatar: '' }, items: [] },
              hidden: true,
              retired: true,
              images: []
            };
        if (typeof window.generateLinksPageData === 'function' && defaultPage.linksData) {
          const generated = window.generateLinksPageData(defaultPage.linksData, window.projectConfig);
          if (generated) {
            defaultPage.subtitle = generated.subtitle || defaultPage.subtitle;
            defaultPage.markdown = generated.markdown || '';
            defaultPage.proseHtml = generated.proseHtml || '';
          }
        }
      } else if (pageId === 'page_rss') {
        defaultPage = (typeof window.createDefaultRssPage === 'function')
          ? window.createDefaultRssPage(window.projectConfig)
          : {
              id: 'page_rss',
              type: 'page',
              status: 'published',
              title: 'RSS',
              slug: 'rss',
              subtitle: '',
              markdown: '',
              proseHtml: '',
              hidden: true,
              retired: true,
              images: []
            };
      }

      if (!defaultPage) return false;

      const existing = targetDrafts.find(d =>
        d && (
          d.id === pageId ||
          (d.type === 'page' && (d.slug || '').trim().toLowerCase() === defaultPage.slug)
        )
      );

      if (existing) {
        const preserveHidden = existing.hidden !== undefined ? Boolean(existing.hidden) : Boolean(defaultPage.hidden);
        const preserveRetired = existing.retired !== undefined ? Boolean(existing.retired) : Boolean(defaultPage.retired);
        defaultPage.hidden = preserveHidden;
        defaultPage.retired = preserveRetired;
        defaultPage.createdAt = existing.createdAt || defaultPage.createdAt || Date.now();
        defaultPage.updatedAt = Date.now();

        Object.keys(existing).forEach(k => delete existing[k]);
        Object.assign(existing, defaultPage);
      } else {
        defaultPage.updatedAt = Date.now();
        targetDrafts.push(defaultPage);
      }

      const finalPage = existing || defaultPage;

      if (window.CedarStore) {
        if (typeof window.CedarStore.upsertPage === 'function') {
          window.CedarStore.upsertPage(finalPage);
        }
        if (typeof window.CedarStore._syncWindowDrafts === 'function') {
          window.CedarStore._syncWindowDrafts();
        }
      }

      if (window.currentDraft && (window.currentDraft.id === pageId || (window.currentDraft.type === 'page' && (window.currentDraft.slug || '').trim().toLowerCase() === finalPage.slug))) {
        window.currentDraft = finalPage;
        if (typeof window.loadDraftIntoEditor === 'function') {
          try { window.loadDraftIntoEditor(finalPage); } catch (e) {}
        }
      }

      if (pageId === 'page_links' && typeof window.renderLinksStudio === 'function') {
        try { window.renderLinksStudio(); } catch (e) {}
      }

      if (typeof window.saveDraftsToStorage === 'function') {
        await window.saveDraftsToStorage();
      }
      if (typeof window.saveProjectToStorage === 'function') {
        window.saveProjectToStorage();
      }
      if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
        window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
      }
      if (typeof window.renderStaticPages === 'function') {
        window.renderStaticPages();
      }
      if (typeof window.renderHomeActivityStream === 'function') {
        window.renderHomeActivityStream();
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        window.updateAllPreviewFrames();
      }
      return true;
    }

    if (btnRestorePage && !btnRestorePage._hasRestoreClickListener) {
      btnRestorePage._hasRestoreClickListener = true;
      btnRestorePage.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!restoreSelect) return;

        const selectedVal = (restoreSelect.value || '').trim();
        if (!selectedVal) {
          restoreSelect.classList.add('ftue-input-error');
          if (restoreError) {
            restoreError.textContent = 'Please choose a built-in page from the dropdown instead.';
            restoreError.style.display = 'block';
          }
          restoreSelect.focus();
          if (typeof window.showToast === 'function') {
            window.showToast('Please choose a built-in page from the dropdown instead.');
          }
          return;
        }

        restoreSelect.classList.remove('ftue-input-error');
        if (restoreError) restoreError.style.display = 'none';

        const pageLabels = {
          page_about: 'About',
          page_links: 'Links',
          page_rss: 'RSS'
        };
        const pageLabel = pageLabels[selectedVal] || 'selected';

        const confirmed = (typeof window.showConfirmDialog === 'function')
          ? await window.showConfirmDialog({
              title: 'Are you sure?',
              message: `Are you sure you want to restore the "${pageLabel}" page back to its default options? Any custom changes you made to this page will be replaced.`,
              confirmText: 'Restore Page',
              cancelText: 'Cancel',
              isDanger: true
            })
          : confirm(`Are you sure you want to restore the "${pageLabel}" page back to its default options?`);

        if (!confirmed) return;

        const restored = await restoreBuiltInPageToDefaults(selectedVal);
        if (restored) {
          restoreSelect.value = '';
          if (typeof window.showToast === 'function') {
            window.showToast(`Restored "${pageLabel}" page back to default options.`);
          }
        }
      });
    }

  }

  window.renameAuthor = function(oldName, newName) {
    if (!newName) return false;
    const oldTrimmed = (oldName || (window.projectConfig && window.projectConfig.defaultAuthor) || '').trim();
    const newTrimmed = newName.trim();
    if (!newTrimmed || oldTrimmed.toLowerCase() === newTrimmed.toLowerCase()) return false;

    if (!window.projectConfig) window.projectConfig = {};
    window.projectConfig.defaultAuthor = newTrimmed;
    if (!Array.isArray(window.projectConfig.authors)) window.projectConfig.authors = [];
    if (window.projectConfig.authors.length > 0 && typeof window.projectConfig.authors[0] === 'object') {
      window.projectConfig.authors[0].name = newTrimmed;
    } else {
      window.projectConfig.authors = [{ name: newTrimmed, bio: '', avatar: '' }];
    }
    try {
      localStorage.setItem('cedar_active_author', newTrimmed);
      try { localStorage.setItem('outpost_active_author', newTrimmed); } catch (e) {}
    } catch (e) {}

    if (Array.isArray(window.drafts)) {
      window.drafts.forEach(d => {
        if (d && d.type !== 'page') {
          d.authorName = newTrimmed;
          d.author = newTrimmed;
          d.authors = [newTrimmed];
        }
      });
      if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function') {
        window.CedarStore.hydrateFromList(window.drafts);
      }
      if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    }
    if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
    if (typeof window.logActivity === 'function') {
      window.logActivity('author', {
        action: 'renamed',
        oldName: oldTrimmed,
        name: newTrimmed,
        authorName: newTrimmed
      });
    }
    if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
    if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
    return true;
  };

  window.renderProjectSettings = renderProjectSettings;
  window.updateSanitizeBadge = function(isOn) { return updateSanitizeBadge ? updateSanitizeBadge(isOn) : undefined; };
  window.handleSettingsLogoFile = function(file) { return handleSettingsLogoFile ? handleSettingsLogoFile(file) : undefined; };
  window.updateSettingsBioPlaceholder = function() { return updateSettingsBioPlaceholder ? updateSettingsBioPlaceholder() : undefined; };
  window.initSettingsScrollSpy = function() { return initSettingsScrollSpy ? initSettingsScrollSpy() : undefined; };
  window.initSettingsEvents = initSettingsEvents;
  window.updateSettingsLogoBackground = updateSettingsLogoBackground;

  Object.assign(window.Cedar.dashboard, {
    renderProjectSettings,
    updateSanitizeBadge: window.updateSanitizeBadge,
    handleSettingsLogoFile: window.handleSettingsLogoFile,
    updateSettingsBioPlaceholder: window.updateSettingsBioPlaceholder,
    initSettingsScrollSpy: window.initSettingsScrollSpy,
    updateSettingsLogoBackground,
    initSettingsEvents
  });
})();
