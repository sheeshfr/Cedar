/**
 * Cedar - Navigation & Shell Management
 * Handles dashboard counts, sidebar toggles, pane navigation, device switcher,
 * live workspace sync, + New dropdown, and shell bindings.
 */
(function () {
  'use strict';
  let switchPane;
  let openLocalPreviewTab;
  let openLiveSiteTab;
  let syncLiveWorkspaceData;
  let setPreviewDevice;
  let closeNewDropdown;


  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  function updateDashboardCounts() {
    let allPosts = [];
    let totalPages = 0;
    let totalMedia = (typeof window.getAllUniqueImages === 'function') ? window.getAllUniqueImages().length : 0;

    const isLinks = (typeof window.isLinksDraft === 'function')
      ? window.isLinksDraft
      : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));

    if (window.CedarStore && typeof window.CedarStore.getPosts === 'function') {
      allPosts = window.CedarStore.getPosts().filter(p => !p.hidden && !p.retired && p.status !== 'idea' && p.type !== 'note');
      const allPages = window.CedarStore.getPages().filter(p => p.id !== 'page_about_cedar' && p.slug !== 'about-cedar');
      totalPages = allPages.length;
    } else {
      const draftsList = Array.isArray(window.drafts) ? window.drafts : (typeof drafts !== 'undefined' && Array.isArray(drafts) ? drafts : []);

      allPosts = draftsList.filter(d => (!d.type || d.type === 'post') && d.type !== 'page' && d.status !== 'idea' && !isLinks(d));
      totalPages = draftsList.filter(d => (d.type === 'page' || isLinks(d)) && d.id !== 'page_about_cedar' && d.slug !== 'about-cedar').length;
    }

    const totalPosts = allPosts.length;
    const hiddenCount = allPosts.filter(p => Boolean(p.hidden || p.retired)).length;
    const draftsCount = allPosts.filter(p => !p.hidden && !p.retired && (p.status === 'draft' || p.status === 'scheduled' || !p.status)).length;
    const publishedCount = allPosts.filter(p => !p.hidden && !p.retired && p.status === 'published').length;

    const isPageHidden = (p) => {
      if (typeof window.isPageHidden === 'function') return window.isPageHidden(p);
      const isAll = (p.id === 'page_all' || p.slug === 'all' || (p.title || '').trim().toLowerCase() === 'all');
      if (isAll) return Boolean(p.hidden === true || p.retired === true);
      if (isBuiltIn(p) && p.hidden === undefined && p.retired === undefined) return true;
      return Boolean(p.hidden === true || p.retired === true);
    };

    const isBuiltIn = (p) => {
      if (!p) return false;
      if (isLinks(p)) return true;
      const id = (p.id || '').trim().toLowerCase();
      const slug = (p.slug || '').trim().toLowerCase();
      const title = (p.title || '').trim().toLowerCase();
      return id === 'page_rss' || id === 'page_about' || id === 'page_links' ||
             slug === 'rss' || slug === 'about' || slug === 'links' ||
             title === 'rss' || title === 'about' || title === 'links';
    };

    const allPagesList = (window.CedarStore && typeof window.CedarStore.getPages === 'function')
      ? window.CedarStore.getPages().filter(d => d && d.id !== 'page_about_cedar' && d.slug !== 'about-cedar')
      : (Array.isArray(window.drafts) ? window.drafts : []).filter(d => d && (d.type === 'page' || isLinks(d)) && d.id !== 'page_about_cedar' && d.slug !== 'about-cedar');
    const dedupedPages = [];
    let hasRssP = false;
    let hasAboutP = false;
    let hasLinksP = false;
    let hasAllP = false;
    for (const p of allPagesList) {
      const isRss = (p.id === 'page_rss' || p.slug === 'rss' || (p.title || '').trim().toLowerCase() === 'rss');
      const isAbout = (p.id === 'page_about' || p.slug === 'about' || (p.title || '').trim().toLowerCase() === 'about');
      const isLinksPage = isLinks(p);
      const isAll = (p.id === 'page_all' || p.slug === 'all' || (p.title || '').trim().toLowerCase() === 'all');
      if (isRss) { if (hasRssP) continue; hasRssP = true; }
      else if (isAbout) { if (hasAboutP) continue; hasAboutP = true; }
      else if (isLinksPage) { if (hasLinksP) continue; hasLinksP = true; }
      else if (isAll) { if (hasAllP) continue; hasAllP = true; }
      dedupedPages.push(p);
    }
    const builtinPagesCount = dedupedPages.filter(p => isBuiltIn(p)).length;
    const myPagesCount = dedupedPages.filter(p => !isBuiltIn(p)).length;
    const hiddenPagesCount = dedupedPages.filter(p => Boolean(p && (p.hidden || p.retired))).length;

    document.querySelectorAll('#tab-count-posts, .tab-count-posts').forEach(el => el.textContent = totalPosts);
    document.querySelectorAll('#tab-count-pages, .tab-count-pages').forEach(el => el.textContent = totalPages);
    document.querySelectorAll('#tab-count-media, .tab-count-media').forEach(el => el.textContent = totalMedia);

    const sideAll = document.getElementById('sidebar-count-posts-all');
    const sideDrafts = document.getElementById('sidebar-count-posts-drafts');
    const sidePub = document.getElementById('sidebar-count-posts-published');
    const sideHidden = document.getElementById('sidebar-count-posts-hidden');
    if (sideAll) sideAll.textContent = totalPosts;
    if (sideDrafts) sideDrafts.textContent = draftsCount;
    if (sidePub) sidePub.textContent = publishedCount;
    if (sideHidden) sideHidden.textContent = hiddenCount;

    const sidePagesMy = document.getElementById('sidebar-count-pages-my-pages');
    const sidePagesBuiltin = document.getElementById('sidebar-count-pages-builtin');
    const sidePagesHidden = document.getElementById('sidebar-count-pages-hidden');
    if (sidePagesMy) sidePagesMy.textContent = myPagesCount;
    if (sidePagesBuiltin) sidePagesBuiltin.textContent = builtinPagesCount;
    if (sidePagesHidden) sidePagesHidden.textContent = hiddenPagesCount;
  }



    function updateSidebarToggleState(isCollapsed) {
      const dashSidebar = document.getElementById('dash-sidebar');
      const btnSidebarToggle = document.getElementById('sidebar-toggle-btn') || document.getElementById('btn-dash-sidebar-toggle');
      const sidebarToggleText = btnSidebarToggle?.querySelector('.sidebar-toggle-text') || btnSidebarToggle?.querySelector('.dash-sidebar-toggle-text');
      
      const width = window.innerWidth;
      const effectiveWidth = width <= 768 ? '0px' : ((isCollapsed || (width <= 870 && !dashSidebar?.classList.contains('manually-expanded'))) ? '64px' : '155px');
      document.documentElement.style.setProperty('--active-sidebar-width', effectiveWidth);

      if (!dashSidebar) return;
      if (isCollapsed) {
        dashSidebar.classList.add('collapsed');
        if (btnSidebarToggle) btnSidebarToggle.title = 'Expand sidebar';
        if (sidebarToggleText) sidebarToggleText.textContent = 'Expand';
      } else {
        dashSidebar.classList.remove('collapsed');
        if (btnSidebarToggle) btnSidebarToggle.title = 'Collapse sidebar';
        if (sidebarToggleText) sidebarToggleText.textContent = 'Collapse';
      }
      if (typeof window.alignNotesTypingColumn === 'function') {
        window.alignNotesTypingColumn();
      }
    }
    window.updateSidebarToggleState = updateSidebarToggleState;

    function closeMobileSidebar() {
      const dashSidebar = document.getElementById('dash-sidebar');
      if (dashSidebar) dashSidebar.classList.remove('mobile-open');
      document.body.classList.remove('mobile-sidebar-open');
    }
    window.closeMobileSidebar = closeMobileSidebar;

    function openMobileSidebar() {
      const dashSidebar = document.getElementById('dash-sidebar');
      if (dashSidebar) dashSidebar.classList.add('mobile-open');
      document.body.classList.add('mobile-sidebar-open');
    }
    window.openMobileSidebar = openMobileSidebar;

    function toggleMobileSidebar() {
      const dashSidebar = document.getElementById('dash-sidebar');
      if (dashSidebar && dashSidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    }
    window.toggleMobileSidebar = toggleMobileSidebar;


  function initNavigationEvents() {
    // Apply active theme immediately to ensure dashboard & kanban columns use current theme
    const _navDesignName = (typeof projectConfig !== 'undefined' && projectConfig.design && (projectConfig.design.blogTheme || projectConfig.design.activeTheme));
    const activeTheme = (((_navDesignName === 'custom' || String(_navDesignName).startsWith('custom_')) && projectConfig?.design?.customColors) ? projectConfig.design.customColors : _navDesignName) ||
                        (typeof localStorage !== 'undefined' && (localStorage.getItem('cedar_theme') || localStorage.getItem('cedar_editor_theme') || localStorage.getItem('outpost_theme'))) ||
                        'mulberry_plum';
    if ((window.CedarFTUE || window.OutpostFTUE) && typeof (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme === 'function') {
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(activeTheme);
    }

    // 0. Sidebar Expand / Collapse Toggle (ZenTube style)
    const dashSidebar = document.getElementById('dash-sidebar');
    const btnSidebarToggle = document.getElementById('sidebar-toggle-btn') || document.getElementById('btn-dash-sidebar-toggle');
    const sidebarToggleText = btnSidebarToggle?.querySelector('.sidebar-toggle-text') || btnSidebarToggle?.querySelector('.dash-sidebar-toggle-text');


    // Restore saved sidebar preference
    const savedCollapsed = (localStorage.getItem('cedar_dash_sidebar_collapsed') || localStorage.getItem('outpost_dash_sidebar_collapsed')) === '1';
    updateSidebarToggleState(savedCollapsed);

    if (btnSidebarToggle) {
      btnSidebarToggle.addEventListener('click', () => {
        if (window.innerWidth <= 870 && window.innerWidth > 768) {
          const isManuallyExpanded = dashSidebar.classList.toggle('manually-expanded');
          updateSidebarToggleState(!isManuallyExpanded);
        } else {
          const willCollapse = !dashSidebar.classList.contains('collapsed');
          dashSidebar.classList.remove('manually-expanded');
          updateSidebarToggleState(willCollapse);
          localStorage.setItem('cedar_dash_sidebar_collapsed', willCollapse ? '1' : '0');
        }
        if (typeof window.alignNotesTypingColumn === 'function') {
          setTimeout(window.alignNotesTypingColumn, 100);
          setTimeout(window.alignNotesTypingColumn, 300);
        }
      });
    }

    // 0b. Triple-bar (Hamburger) Slide-Out Mobile Navigation Drawer
    const btnMobileMenu = document.getElementById('dash-mobile-menu-btn');
    const mobileBackdrop = document.getElementById('sidebar-mobile-backdrop');
    const btnMobileClose = document.getElementById('sidebar-mobile-close-btn');

    if (btnMobileMenu) {
      btnMobileMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileSidebar();
      });
    }
    if (mobileBackdrop) {
      mobileBackdrop.addEventListener('click', closeMobileSidebar);
    }
    if (btnMobileClose) {
      btnMobileClose.addEventListener('click', closeMobileSidebar);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dashSidebar && dashSidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
      }
    });

    // Window resize handler to keep sidebar width CSS variable and drawer state synced
    window.addEventListener('resize', () => {
      const isCollapsed = dashSidebar ? dashSidebar.classList.contains('collapsed') : false;
      const width = window.innerWidth;
      const effectiveWidth = width <= 768 ? '0px' : ((isCollapsed || (width <= 870 && !dashSidebar?.classList.contains('manually-expanded'))) ? '64px' : '155px');
      document.documentElement.style.setProperty('--active-sidebar-width', effectiveWidth);
      if (width > 768 && dashSidebar && dashSidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
      }
      updateTopbarSaveButtonVisibility();
    });

    // 0c. Save Action Handlers (Sitting underneath the last option in pane lists)
    function updateTopbarSaveButtonVisibility() {
      const btnTopbarSave = document.getElementById('btn-topbar-save-action');
      if (btnTopbarSave) btnTopbarSave.style.display = 'none';
    }
    window.updateTopbarSaveButtonVisibility = updateTopbarSaveButtonVisibility;

    // Delegated click handler for bottom save buttons across all menus/panes
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#btn-designer-save-bottom, #btn-settings-save-bottom, #btn-export-save-bottom, #btn-topbar-save-action');
      if (!btn) return;

      if (btn.id === 'btn-designer-save-bottom') {
        const orig = document.getElementById('btn-designer-save');
        if (orig) orig.click();
      } else if (btn.id === 'btn-settings-save-bottom') {
        const orig = document.getElementById('btn-modal-save-settings');
        if (orig) orig.click();
      } else if (btn.id === 'btn-export-save-bottom') {
        const orig = document.getElementById('btn-export-sidebar-action');
        if (orig) orig.click();
      } else if (btn.id === 'btn-topbar-save-action') {
        const designerPane = document.getElementById('pane-designer');
        const settingsPane = document.getElementById('pane-settings');
        const exportPane = document.getElementById('pane-export');
        if (designerPane && (designerPane.classList.contains('active') || designerPane.style.display !== 'none')) {
          const orig = document.getElementById('btn-designer-save');
          if (orig) orig.click();
        } else if (settingsPane && (settingsPane.classList.contains('active') || settingsPane.style.display !== 'none')) {
          const orig = document.getElementById('btn-modal-save-settings');
          if (orig) orig.click();
        } else if (exportPane && (exportPane.classList.contains('active') || exportPane.style.display !== 'none')) {
          const orig = document.getElementById('btn-export-sidebar-action');
          if (orig) orig.click();
        }
      }
    });

    // Mobile headroom scroll handler for Cedar Dashboard topbar
    const dashMainContent = document.querySelector('.dash-main-content');
    if (dashMainContent && !dashMainContent._hasCedarHeadroomListener) {
      dashMainContent._hasCedarHeadroomListener = true;
      let lastScrollTop = dashMainContent.scrollTop || 0;
      let ticking = false;
      const topbar = document.querySelector('.dash-topbar');

      dashMainContent.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const currentScrollTop = Math.max(0, dashMainContent.scrollTop || 0);
            const scrollDelta = currentScrollTop - lastScrollTop;

            if (window.innerWidth <= 768 && topbar) {
              if (currentScrollTop <= 15) {
                topbar.classList.remove('topbar-hidden');
              } else if (scrollDelta > 6 && currentScrollTop > 50) {
                topbar.classList.add('topbar-hidden');
              } else if (scrollDelta < -6) {
                topbar.classList.remove('topbar-hidden');
              }
            } else if (topbar) {
              topbar.classList.remove('topbar-hidden');
            }

            lastScrollTop = currentScrollTop;
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    }

    // Brand logo click navigates to home
    const brandLogoBtn = document.getElementById('brand-logo-btn');
    if (brandLogoBtn) {
      brandLogoBtn.addEventListener('click', () => {
        navigateTo('home');
        if (window.innerWidth <= 768) closeMobileSidebar();
      });
    }


    // 1. Tab buttons (both expanded and mini items)
    document.querySelectorAll('[data-dash-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.dashTab === 'settings' && window._suppressSettingsReopen) return;
        navigateTo(btn.dataset.dashTab);
        if (window.innerWidth <= 768) closeMobileSidebar();
      });
    });

    // 1b. Posts sub-navigation sidebar items
    document.querySelectorAll('[data-posts-sub]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sub = btn.dataset.postsSub;
        if (sub === 'all') {
          navigateTo('posts');
        } else {
          navigateTo(sub);
        }
        if (window.innerWidth <= 768) closeMobileSidebar();
      });
    });

    // 1c. Posts sub-links (Show More buttons and Back to All Posts)
    document.querySelectorAll('[data-posts-sub-link]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sub = btn.dataset.postsSubLink;
        if (sub === 'all') {
          navigateTo('posts');
        } else {
          navigateTo(sub);
        }
        if (window.innerWidth <= 768) closeMobileSidebar();
      });
    });

    // 1d. Pages sub-navigation sidebar items
    document.querySelectorAll('[data-pages-sub]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sub = btn.dataset.pagesSub;
        if (sub === 'all') {
          navigateTo('pages');
        } else {
          navigateTo(sub.startsWith('pages/') ? sub : ('pages/' + sub));
        }
        if (window.innerWidth <= 768) closeMobileSidebar();
      });
    });

    // 1e. Pages sub-links (Show More buttons and Back to All Pages)
    document.querySelectorAll('[data-pages-sub-link]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sub = btn.dataset.pagesSubLink;
        if (sub === 'all') {
          navigateTo('pages');
        } else {
          navigateTo(sub.startsWith('pages/') ? sub : ('pages/' + sub));
        }
        if (window.innerWidth <= 768) closeMobileSidebar();
      });
    });

    // Live preview iframe updater
    function updateAllPreviewFrames() {
      try {
        const frames = document.querySelectorAll('#preview-site-frame, iframe[title*="Preview"], iframe[title*="preview"]');
        const proj = (typeof window.projectConfig !== 'undefined') ? window.projectConfig : ((typeof projectConfig !== 'undefined') ? projectConfig : null);
        const drfts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : ((typeof drafts !== 'undefined') ? drafts : []);
        frames.forEach(frame => {
          if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({
              type: 'CEDAR_WORKSPACE_UPDATED',
              projectConfig: proj,
              drafts: drfts
            }, '*');
          }
        });
      } catch (_) {}
    }
    window.updateAllPreviewFrames = updateAllPreviewFrames;
    window.updateLivePreview = updateAllPreviewFrames;

    // Live workspace synchronization with local server
    syncLiveWorkspaceData = window.syncLiveWorkspaceData = () => {
      try {
        const proj = (typeof window.projectConfig !== 'undefined') ? window.projectConfig : ((typeof projectConfig !== 'undefined') ? projectConfig : null);
        const drfts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : ((typeof drafts !== 'undefined') ? drafts : []);
        const payload = {
          project: proj,
          drafts: drfts,
          domain: (typeof window.resolveProjectDomain === 'function') ? window.resolveProjectDomain() : ((proj && proj.domain) || (localStorage.getItem('cedar_user_domain') || localStorage.getItem('outpost_user_domain')) || ''),
          blogPath: (typeof window.resolveProjectBlogPath === 'function') ? window.resolveProjectBlogPath() : ((proj && proj.blogPath) || 'blog')
        };
        fetch('/api/live-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (err) {}
    };
    window.syncLiveWorkspaceData = syncLiveWorkspaceData;

    // Fetch live workspace sync on startup to recover any server-persisted avatars or state
    async function pullLiveWorkspaceData() {
      try {
        const res = await fetch('/api/live-sync');
        if (res.ok) {
          const data = await res.json();
          let changed = false;
          const activeProj = window.projectConfig || ((typeof projectConfig !== 'undefined') ? projectConfig : null);
          if (data && data.project && activeProj) {
            if (Array.isArray(data.project.categories) && data.project.categories.length > 0) {
              if (!Array.isArray(activeProj.categories) || activeProj.categories.length === 0) {
                activeProj.categories = [...data.project.categories];
                changed = true;
              }
            }
            if (Array.isArray(data.project.authors)) {
              if (!Array.isArray(activeProj.authors)) activeProj.authors = [];
              data.project.authors.forEach(srvAuth => {
                if (!srvAuth || !srvAuth.name) return;
                const sName = srvAuth.name.trim().toLowerCase();
                if (sName === 'astrid vance' || sName === 'astrid') return;
                const localAuth = activeProj.authors.find(a => (a?.name || a || '').trim().toLowerCase() === sName);
                if (localAuth && typeof localAuth === 'object') {
                  if (!localAuth.avatar && srvAuth.avatar) {
                    localAuth.avatar = srvAuth.avatar;
                    changed = true;
                  }
                } else if (!localAuth) {
                  activeProj.authors.push(srvAuth);
                  changed = true;
                }
              });
            }
          }
          const isFreshOrDisconnected = (localStorage.getItem('cedar_vault_disconnected') === '1') || (localStorage.getItem('cedar_trigger_ftue') === '1');
          if (data && Array.isArray(data.drafts) && data.drafts.length > 0 && !isFreshOrDisconnected) {
            let draftsUpdated = false;
            if (window.CedarStore && typeof window.CedarStore.reconcileDiskDrafts === 'function') {
              const res = window.CedarStore.reconcileDiskDrafts(data.drafts);
              draftsUpdated = res.updated;
            } else {
              if (!Array.isArray(window.drafts)) window.drafts = [];
              data.drafts.forEach(srvDraft => {
                if (!srvDraft || !srvDraft.id) return;
                const idx = window.drafts.findIndex(d => d && (d.id === srvDraft.id || (d.slug && srvDraft.slug && d.slug === srvDraft.slug)));
                if (idx === -1) {
                  window.drafts.push(srvDraft);
                  draftsUpdated = true;
                }
              });
            }

            if (draftsUpdated) {
              const draftsKey = window.STORAGE_KEY_DRAFTS || 'sheesh_static_writer_drafts_v2';
              try {
                localStorage.setItem(draftsKey, JSON.stringify(window.drafts));
              } catch (e) {}

              if (typeof window.renderDashboard === 'function') {
                window.renderDashboard();
              } else if (typeof window.renderPostsPipeline === 'function') {
                window.renderPostsPipeline();
              }
              if (typeof window.renderAllPostsGrid === 'function') {
                window.renderAllPostsGrid();
              }
              if (typeof updateDashboardCounts === 'function') {
                updateDashboardCounts();
              }
            }
          }
          if (changed) {
            if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
            if (typeof renderSettingsAuthorProfile === 'function' && window.currentDashboardTab === 'settings') {
              renderSettingsAuthorProfile();
            }
          }
        }
      } catch (e) {}
      syncLiveWorkspaceData();
    }
    window.pullLiveWorkspaceData = pullLiveWorkspaceData;

    // Run initial live sync
    setTimeout(pullLiveWorkspaceData, 100);

    // Preview action: Opens the local site in a new browser tab with contextual route (post slug or preview state)
    openLocalPreviewTab = window.openLocalPreviewTab = (e, customHash) => {
      if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (typeof window.syncFormToDraft === 'function') {
        window.syncFormToDraft();
      }
      if (typeof window.saveDraftsToStorage === 'function') {
        window.saveDraftsToStorage();
      }
      if (typeof window.saveProjectToStorage === 'function') {
        window.saveProjectToStorage();
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        window.updateAllPreviewFrames();
      }
      syncLiveWorkspaceData();

      let targetHash = customHash;
      if (!targetHash) {
        const inEditor = window.currentView === 'editor' || 
                         (document.getElementById('view-editor') && document.getElementById('view-editor').style.display !== 'none') ||
                         (window.location.hash && (window.location.hash.startsWith('#write') || window.location.hash.startsWith('#editor')));
        if (inEditor && window.currentDraft) {
          const d = window.currentDraft;
          if (d.type === 'page') {
            targetHash = '#/' + encodeURIComponent(d.slug || d.id);
          } else {
            const cat = d.permalinkCat !== undefined ? d.permalinkCat : (d.tag || (d.categories && d.categories[0]) || '');
            const catStr = (cat && cat.toLowerCase() !== 'uncategorized')
              ? encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-')) + '/'
              : '';
            targetHash = '#/' + catStr + encodeURIComponent(d.slug || d.id);
          }
        } else if (window._currentPreviewIframeHash && window.currentDashboardTab === 'preview') {
          targetHash = window._currentPreviewIframeHash;
        } else {
          targetHash = '#/';
        }
      }

      const localUrl = (typeof resolveProjectLocalUrl === 'function')
        ? resolveProjectLocalUrl(targetHash)
        : new URL(`preview.html${targetHash.startsWith('#') ? targetHash : '#' + targetHash}`, window.location.href).href;
      window.open(localUrl, '_blank');
    };
    window.openLocalPreviewTab = openLocalPreviewTab;

    // Visit live site action: Opens live public site in a new browser tab
    openLiveSiteTab = window.openLiveSiteTab = (e) => {
      if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
      const liveUrl = (typeof resolveProjectLiveUrl === 'function') ? resolveProjectLiveUrl() : '';
      if (liveUrl) {
        window.open(liveUrl, '_blank');
      } else {
        showToast('Please configure your Primary Domain in Settings first.');
      }
    };
    window.openLiveSiteTab = openLiveSiteTab;

    const sidebarTabPreview = document.getElementById('sidebar-tab-preview');
    if (sidebarTabPreview) {
      sidebarTabPreview.addEventListener('click', openLocalPreviewTab);
      sidebarTabPreview.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          openLocalPreviewTab(e);
        }
      });
    }

    const miniSidebarTabPreview = document.getElementById('mini-sidebar-tab-preview');
    if (miniSidebarTabPreview) {
      miniSidebarTabPreview.addEventListener('click', openLocalPreviewTab);
      miniSidebarTabPreview.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          openLocalPreviewTab(e);
        }
      });
    }

    const sidebarTabVisitOnline = document.getElementById('sidebar-tab-visit-online');
    if (sidebarTabVisitOnline) {
      sidebarTabVisitOnline.addEventListener('click', openLiveSiteTab);
      sidebarTabVisitOnline.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          openLiveSiteTab(e);
        }
      });
    }

    const miniSidebarTabVisitOnline = document.getElementById('mini-sidebar-tab-visit-online');
    if (miniSidebarTabVisitOnline) {
      miniSidebarTabVisitOnline.addEventListener('click', openLiveSiteTab);
      miniSidebarTabVisitOnline.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          openLiveSiteTab(e);
        }
      });
    }

    const btnSettingsOpenLocalUrl = document.getElementById('btn-settings-open-local-url');
    if (btnSettingsOpenLocalUrl) {
      btnSettingsOpenLocalUrl.addEventListener('click', openLocalPreviewTab);
    }

    const btnSettingsOpenLiveUrl = document.getElementById('btn-settings-open-live-url');
    if (btnSettingsOpenLiveUrl) {
      btnSettingsOpenLiveUrl.addEventListener('click', openLiveSiteTab);
    }

    const btnOpenPreviewTab = document.getElementById('btn-open-preview-tab');
    if (btnOpenPreviewTab) {
      btnOpenPreviewTab.addEventListener('click', openLocalPreviewTab);
    }

    const btnRefreshPreview = document.getElementById('btn-refresh-preview');
    if (btnRefreshPreview) {
      btnRefreshPreview.addEventListener('click', () => {
        const frame = document.getElementById('preview-site-frame');
        if (frame) {
          const currentHash = window._currentPreviewIframeHash || '#/';
          frame.src = 'preview.html?t=' + Date.now() + currentHash;
        }
        showToast('Refreshed site preview');
      });
    }

    const btnCopyPreviewUrl = document.getElementById('btn-copy-preview-url');
    if (btnCopyPreviewUrl) {
      btnCopyPreviewUrl.addEventListener('click', () => {
        const hash = window._currentPreviewIframeHash || '#/';
        const fullUrl = (typeof resolveProjectLocalUrl === 'function')
          ? resolveProjectLocalUrl(hash)
          : `${window.location.origin}/preview.html${hash}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(fullUrl).then(() => {
            showToast('Copied preview URL: ' + fullUrl);
          }).catch(() => {
            showToast('URL: ' + fullUrl);
          });
        } else {
          showToast('URL: ' + fullUrl);
        }
      });
    }

    // Two-way synchronization with embedded preview iframe
    window.addEventListener('message', (e) => {
      if (!e.data) return;
      if (e.data.type === 'CEDAR_PREVIEW_FRAME_READY') {
        if (typeof window.updateAllPreviewFrames === 'function') {
          window.updateAllPreviewFrames();
        }
        return;
      }
      if (e.data.type === 'CEDAR_PREVIEW_NAVIGATED') {
        const rawHash = e.data.hash || '#/';
        window._currentPreviewIframeHash = rawHash;

        let cleanPath = String(rawHash).trim().replace(/^#\/?/, '/');
        if (cleanPath.startsWith('/preview.html/')) {
          cleanPath = '/' + cleanPath.slice('/preview.html/'.length);
        } else if (cleanPath === '/preview.html' || cleanPath === '/preview.html/') {
          cleanPath = '/';
        }
        if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
        if (cleanPath === '//') cleanPath = '/';

        const displayEl = document.getElementById('preview-pane-url-display');
        if (displayEl) {
          if (cleanPath === '/') {
            displayEl.textContent = 'preview.html';
            displayEl.title = 'Current Route: preview.html' + (e.data.title ? ' (' + e.data.title + ')' : '');
          } else {
            displayEl.textContent = 'preview.html' + cleanPath;
            displayEl.title = 'Current Route: preview.html' + cleanPath + (e.data.title ? ' (' + e.data.title + ')' : '');
          }
        }

        const designerAddressEl = document.getElementById('designer-preview-address-text');
        if (designerAddressEl) {
          designerAddressEl.textContent = cleanPath === '/' ? 'preview.html#/' : ('preview.html' + cleanPath);
        }

        // Keep parent editor URL address bar in sync with preview route
        if (window.currentDashboardTab === 'preview') {
          const targetHash = (cleanPath === '/') ? '#preview' : ('#preview?route=' + encodeURIComponent(cleanPath));
          if (window.location.hash !== targetHash) {
            try {
              window.history.replaceState(null, '', targetHash);
            } catch (err) {}
          }
        }
      }
    });

    // 1b. Preview Device Viewport Switcher (Desktop, Tablet 640px, Mobile Pixel 10)
    setPreviewDevice = function(mode) {
      const frame = document.getElementById('preview-site-frame');
      if (!frame) return;

      document.querySelectorAll('#preview-device-switcher .device-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.device === mode);
      });

      if (mode === 'mobile') {
        frame.style.width = '412px';
        frame.style.height = '915px';
        frame.style.maxHeight = 'calc(100% - 40px)';
        frame.style.borderRadius = '28px';
        frame.style.margin = '20px auto';
        frame.style.boxShadow = '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 10px #27272a, 0 0 0 12px rgba(255, 255, 255, 0.1)';
        frame.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        if (typeof showToast === 'function') showToast('Preview: Google Pixel 10 (412×915 • ~2.75x DPI)');
      } else if (mode === 'tablet') {
        frame.style.width = '640px';
        frame.style.height = '960px';
        frame.style.maxHeight = 'calc(100% - 40px)';
        frame.style.borderRadius = '18px';
        frame.style.margin = '20px auto';
        frame.style.boxShadow = '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 10px #27272a, 0 0 0 12px rgba(255, 255, 255, 0.1)';
        frame.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        if (typeof showToast === 'function') showToast('Preview: Tablet (640px)');
      } else {
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.maxHeight = '100%';
        frame.style.borderRadius = '0';
        frame.style.margin = '0';
        frame.style.boxShadow = 'none';
        frame.style.border = 'none';
        if (typeof showToast === 'function') showToast('Preview: Desktop (Full Viewport)');
      }
    }

    const btnPrevDevDesktop = document.getElementById('btn-preview-device-desktop');
    if (btnPrevDevDesktop) {
      btnPrevDevDesktop.addEventListener('click', () => setPreviewDevice('desktop'));
    }
    const btnPrevDevTablet = document.getElementById('btn-preview-device-tablet');
    if (btnPrevDevTablet) {
      btnPrevDevTablet.addEventListener('click', () => setPreviewDevice('tablet'));
    }
    const btnPrevDevMobile = document.getElementById('btn-preview-device-mobile');
    if (btnPrevDevMobile) {
      btnPrevDevMobile.addEventListener('click', () => setPreviewDevice('mobile'));
    }


    // 2. Topbar Action Controls: Preview & Settings
    const btnTopbarPreview = document.getElementById('btn-topbar-preview');
    if (btnTopbarPreview) {
      btnTopbarPreview.addEventListener('click', (e) => {
        openLocalPreviewTab(e);
      });
    }

    const btnTopbarSettings = document.getElementById('btn-topbar-settings');
    if (btnTopbarSettings) {
      btnTopbarSettings.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (window._suppressSettingsReopen) return;
        navigateTo('settings');
      });
    }

    // Consolidated + New Dropdown & Options (if present)
    const newDropdownWrap = document.getElementById('dash-new-dropdown-wrap');
    const btnDashNew = document.getElementById('btn-dash-new');
    const btnNewPost = document.getElementById('btn-dash-new-post');
    const btnNewPage = document.getElementById('btn-dash-new-page');
    const btnNewIdea = document.getElementById('btn-dash-new-idea');
    const btnCreateStaticPage = document.getElementById('btn-create-static-page');

    closeNewDropdown = function() {
      if (newDropdownWrap) {
        newDropdownWrap.classList.remove('open');
        if (btnDashNew) btnDashNew.setAttribute('aria-expanded', 'false');
      }
    }

    if (btnDashNew && newDropdownWrap) {
      btnDashNew.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = newDropdownWrap.classList.contains('open');
        if (isOpen) {
          closeNewDropdown();
        } else {
          newDropdownWrap.classList.add('open');
          btnDashNew.setAttribute('aria-expanded', 'true');
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (newDropdownWrap && !newDropdownWrap.contains(e.target)) {
        closeNewDropdown();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeNewDropdown();
      }
    });


    switchPane = window.switchPane = function(paneId) {
      if (typeof window.closeMediaLightbox === 'function') {
        window.closeMediaLightbox(false);
      }
      const tab = (paneId || '').replace(/^pane-/, '');
      if (typeof renderViewDOM === 'function') {
        renderViewDOM('dashboard');
      }
      if (typeof renderDashboardTabDOM === 'function') {
        renderDashboardTabDOM(tab);
      }
      if (typeof navigateTo === 'function') {
        navigateTo(tab);
      } else if (typeof switchDashboardTab === 'function') {
        switchDashboardTab(tab);
      }
      updateTopbarSaveButtonVisibility();
    };

    if (btnNewPost) {
      btnNewPost.addEventListener('click', (e) => {
        e.stopPropagation();
        closeNewDropdown();
        if (typeof window.handleNewPost === 'function') window.handleNewPost();
      });
    }
    const btnCreatePostFromTab = document.getElementById('btn-create-post-from-tab');
    if (btnCreatePostFromTab) btnCreatePostFromTab.addEventListener('click', () => {
      if (typeof window.handleNewPost === 'function') window.handleNewPost();
    });
    const btnPostsNewDraft = document.getElementById('btn-posts-new-draft');
    if (btnPostsNewDraft) btnPostsNewDraft.addEventListener('click', () => {
      if (typeof window.handleNewPost === 'function') window.handleNewPost();
    });

    if (btnNewPage) {
      btnNewPage.addEventListener('click', (e) => {
        e.stopPropagation();
        closeNewDropdown();
        if (typeof window.handleNewPage === 'function') window.handleNewPage();
      });
    }
    if (btnCreateStaticPage) btnCreateStaticPage.addEventListener('click', () => {
      if (typeof window.handleNewPage === 'function') window.handleNewPage();
    });
    const btnPagesNewPage = document.getElementById('btn-pages-new-page');
    if (btnPagesNewPage) btnPagesNewPage.addEventListener('click', () => {
      if (typeof window.handleNewPage === 'function') window.handleNewPage();
    });



    // 6. Master Slice Download ZIP is handled by vault-sync.js (Export Pane)

    // 7. Vault Connect
    const btnDashVault = document.getElementById('btn-dash-vault');
    const btnConnectMaster = document.getElementById('btn-connect-master-folder');
    const handleVaultConnect = () => {
      if (window.openSheeshVault) window.openSheeshVault();
      else if (window.SheeshVault) window.SheeshVault.connect();
    };
    if (btnDashVault) btnDashVault.addEventListener('click', handleVaultConnect);
    if (btnConnectMaster) btnConnectMaster.addEventListener('click', handleVaultConnect);


    // 9. Project Selector Dropdown
    const btnProjDropdown = document.getElementById('btn-project-dropdown');
    if (btnProjDropdown) {
      btnProjDropdown.addEventListener('click', () => {
        const newName = prompt('Enter project name:', projectConfig.name);
        if (newName && newName.trim()) {
          projectConfig.name = newName.trim();
          saveProjectToStorage();
          renderProjectSettings();
          showToast(`Project renamed to "${projectConfig.name}"`);
        }
      });
    }

    // 10. Editor Header Bindings
    const btnBack = document.getElementById('btn-back-to-dashboard');
    if (btnBack) {
      btnBack.addEventListener('click', (e) => {
        if (e.preventDefault) e.preventDefault();
        const cur = window.currentDraft || currentDraft;
        if (typeof syncFormToDraft === 'function') syncFormToDraft();
        if (cur && typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(cur)) {
          if (typeof window.discardBlankDraft === 'function') {
            window.discardBlankDraft(cur);
          }
        } else {
          if (typeof saveDraftsToStorage === 'function') saveDraftsToStorage();
        }
        const target = btnBack.getAttribute('href') || (window.cedarPreviousDashboardPage && window.cedarPreviousDashboardPage.targetHash) || (currentDashboardTab || 'posts');
        navigateTo(target);
      });
    }

    const statusSelect = document.getElementById('editor-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        if (currentDraft) {
          const newStatus = statusSelect.value;
          currentDraft.status = newStatus;
          currentDraft.updatedAt = Date.now();
          const todayIso = typeof window.getLocalIsoDate === 'function' ? window.getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
          if (newStatus === 'published') {
            const pubDate = currentDraft.publishedDate || currentDraft.date || todayIso;
            currentDraft.publishedDate = pubDate;
            const parts = String(pubDate).split('-').map(Number);
            if (pubDate < todayIso) {
              currentDraft.publishedAt = (parts.length === 3) ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime() : Date.now();
              currentDraft.editedDate = todayIso;
              currentDraft.editedAt = Date.now();
            } else if (!currentDraft.publishedAt) {
              currentDraft.publishedAt = Date.now();
            }
            currentDraft.scheduled = false;
            delete currentDraft.scheduledAt;
            delete currentDraft.scheduledTime;
            delete currentDraft.scheduledDate;
          } else if (newStatus === 'draft') {
            currentDraft.scheduled = false;
            delete currentDraft.scheduledAt;
            delete currentDraft.scheduledTime;
            delete currentDraft.scheduledDate;
          }
          saveDraftsToStorage();
          showToast(`Status changed to ${currentDraft.status.toUpperCase()}`);
        }
      });
    }

    updateTopbarSaveButtonVisibility();
  }

  window.updateDashboardCounts = updateDashboardCounts;
  window.updateSidebarToggleState = updateSidebarToggleState;
  window.switchPane = function(paneId) { return switchPane ? switchPane(paneId) : undefined; };
  window.setPreviewDevice = function(mode) { return setPreviewDevice ? setPreviewDevice(mode) : undefined; };
  window.syncLiveWorkspaceData = function() { return syncLiveWorkspaceData ? syncLiveWorkspaceData() : undefined; };
  window.updateAllPreviewFrames = function() { return updateAllPreviewFrames ? updateAllPreviewFrames() : undefined; };
  window.updateLivePreview = function() { return updateAllPreviewFrames ? updateAllPreviewFrames() : undefined; };
  window.openLocalPreviewTab = function(e) { return openLocalPreviewTab ? openLocalPreviewTab(e) : undefined; };
  window.openLiveSiteTab = function(e) { return openLiveSiteTab ? openLiveSiteTab(e) : undefined; };
  window.closeNewDropdown = function() { return closeNewDropdown ? closeNewDropdown() : undefined; };
  window.initNavigationEvents = initNavigationEvents;

  Object.assign(window.Cedar.dashboard, {
    updateDashboardCounts,
    updateSidebarToggleState,
    switchPane: window.switchPane,
    setPreviewDevice: window.setPreviewDevice,
    syncLiveWorkspaceData: window.syncLiveWorkspaceData,
    updateAllPreviewFrames: window.updateAllPreviewFrames,
    updateLivePreview: window.updateLivePreview,
    openLocalPreviewTab: window.openLocalPreviewTab,
    openLiveSiteTab: window.openLiveSiteTab,
    closeNewDropdown: window.closeNewDropdown,
    initNavigationEvents
  });
})();
