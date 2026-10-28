/**
 * Cedar - Taxonomy Management
 * Handles category management, tag datalists, category search/filters,
 * and inline auto-save for the default category.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  function renameCategory(oldName, newName) {
    if (!oldName || !newName) return false;
    const oldTrimmed = oldName.trim();
    const newTrimmed = newName.trim();
    if (!newTrimmed || oldTrimmed === newTrimmed) return false;

    const reservedNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
    if (reservedNames.has(newTrimmed.toLowerCase())) {
      if (typeof window.showToast === 'function') window.showToast("Woah! That's a reserved name - pick something else.");
      renderTaxonomy();
      return false;
    }

    if (!Array.isArray(projectConfig.categories)) projectConfig.categories = [];
    const existsOther = projectConfig.categories.some(c => c.toLowerCase() === newTrimmed.toLowerCase() && c.toLowerCase() !== oldTrimmed.toLowerCase());
    if (existsOther) {
      if (typeof window.showToast === 'function') window.showToast(`Category "${newTrimmed}" already exists.`);
      renderTaxonomy();
      return false;
    }

    // 1. Update projectConfig.categories
    if (Array.isArray(projectConfig.deletedCategories)) {
      projectConfig.deletedCategories = projectConfig.deletedCategories.filter(dc => String(dc || '').trim().toLowerCase() !== newTrimmed.toLowerCase());
    }
    const catIndex = projectConfig.categories.findIndex(c => c.toLowerCase() === oldTrimmed.toLowerCase());
    if (catIndex >= 0) {
      projectConfig.categories[catIndex] = newTrimmed;
    } else {
      projectConfig.categories.push(newTrimmed);
    }
    if (projectConfig.defaultCategory && projectConfig.defaultCategory.toLowerCase() === oldTrimmed.toLowerCase()) {
      projectConfig.defaultCategory = newTrimmed;
    }
    saveProjectToStorage();

    // 2. Update post tags/categories across ALL post drafts
    let draftsChanged = false;
    let pageToUpdate = null;
    if (Array.isArray(window.drafts)) {
      window.drafts.forEach(d => {
        if (!d) return;
        // Skip page items (handled below)
        if (d.type === 'page' || d.isCategoryAggregate || (d.id && String(d.id).startsWith('page_cat_'))) return;

        let itemChanged = false;

        // Check and update d.tag
        if (d.tag && typeof d.tag === 'string' && d.tag.trim().toLowerCase() === oldTrimmed.toLowerCase()) {
          d.tag = newTrimmed;
          itemChanged = true;
        }

        // Check and update d.permalinkCat
        if (d.permalinkCat && typeof d.permalinkCat === 'string' && d.permalinkCat.trim().toLowerCase() === oldTrimmed.toLowerCase()) {
          d.permalinkCat = newTrimmed;
          itemChanged = true;
        }

        // Check and update d.category (singular)
        if (d.category && typeof d.category === 'string' && d.category.trim().toLowerCase() === oldTrimmed.toLowerCase()) {
          d.category = newTrimmed;
          itemChanged = true;
        }

        // Check and update d.categories (array)
        if (Array.isArray(d.categories)) {
          let arrChanged = false;
          d.categories = d.categories.map(c => {
            if (c && typeof c === 'string' && c.trim().toLowerCase() === oldTrimmed.toLowerCase()) {
              arrChanged = true;
              return newTrimmed;
            }
            return c;
          });
          if (arrChanged) itemChanged = true;
        }

        // Check and update d.tags (array)
        if (Array.isArray(d.tags)) {
          let arrChanged = false;
          d.tags = d.tags.map(t => {
            if (t && typeof t === 'string' && t.trim().toLowerCase() === oldTrimmed.toLowerCase()) {
              arrChanged = true;
              return newTrimmed;
            }
            return t;
          });
          if (arrChanged) itemChanged = true;
        }

        if (itemChanged) {
          d.updatedAt = Date.now();
          draftsChanged = true;
        }
      });

      // 3. Update category aggregate page(s) in window.drafts
      const oldSlug = typeof window.generateSlug === 'function' ? window.generateSlug(oldTrimmed) : oldTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const newSlug = typeof window.generateSlug === 'function' ? window.generateSlug(newTrimmed) : newTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      window.drafts.forEach(d => {
        if (!d) return;
        const isCatPage = (d.type === 'page' || d.isCategoryAggregate || (d.id && String(d.id).startsWith('page_cat_')));
        if (!isCatPage) return;

        const matchTitle = (d.title || '').trim().toLowerCase() === oldTrimmed.toLowerCase();
        const matchAggregate = (d.categoryAggregate && d.categoryAggregate.trim().toLowerCase() === oldTrimmed.toLowerCase());
        const matchId = (d.id && d.id === `page_cat_${oldSlug}`);

        if (matchTitle || matchAggregate || matchId) {
          const prevId = d.id;
          d.title = newTrimmed;
          d.slug = newSlug;
          d.categoryAggregate = newTrimmed;
          d.id = `page_cat_${newSlug}`;
          d.updatedAt = Date.now();
          if (window.CedarStore) {
            if (prevId && prevId !== d.id && typeof window.CedarStore.removePage === 'function') {
              window.CedarStore.removePage(prevId);
            }
            if (typeof window.CedarStore.upsertPage === 'function') {
              window.CedarStore.upsertPage(d);
            }
          }
          pageToUpdate = d;
          draftsChanged = true;
        }
      });

      if (Array.isArray(projectConfig.pagesCustomOrder)) {
        projectConfig.pagesCustomOrder = projectConfig.pagesCustomOrder.map(id => {
          const low = String(id || '').trim().toLowerCase();
          if (low === `page_cat_${oldSlug}` || low === oldSlug || low === oldTrimmed.toLowerCase()) {
            return `page_cat_${newSlug}`;
          }
          return id;
        });
        saveProjectToStorage();
      }

      // Also sync current active draft if loaded in editor
      if (window.currentDraft && !window.currentDraft.type) {
        if (window.currentDraft.tag && window.currentDraft.tag.trim().toLowerCase() === oldTrimmed.toLowerCase()) {
          window.currentDraft.tag = newTrimmed;
        }
        if (Array.isArray(window.currentDraft.categories)) {
          window.currentDraft.categories = window.currentDraft.categories.map(c => (c && c.trim().toLowerCase() === oldTrimmed.toLowerCase()) ? newTrimmed : c);
        }
      }

      if (draftsChanged && typeof window.saveDraftsToStorage === 'function') {
        window.saveDraftsToStorage();
      }
    }

    // 4. Update activityLog in projectConfig:
    // Update all category entries and category page entries so the Feed reflects the renamed category immediately!
    const effectiveLog = (typeof window.getActivityLog === 'function') ? window.getActivityLog() : (projectConfig.activityLog || []);
    if (Array.isArray(effectiveLog)) {
      effectiveLog.forEach(item => {
        if (!item || !item.data) return;
        if (item.type === 'category') {
          const cName = String(item.data.categoryName || '').trim();
          if (cName.toLowerCase() === oldTrimmed.toLowerCase()) {
            item.data.categoryName = newTrimmed;
          }
          const cOld = String(item.data.oldName || '').trim();
          if (cOld.toLowerCase() === oldTrimmed.toLowerCase()) {
            item.data.oldName = newTrimmed;
          }
          if (item.id === `synth-cat-${oldTrimmed}`) {
            item.id = `synth-cat-${newTrimmed}`;
          }
        }
        if (item.type === 'page') {
          const pTitle = String(item.data.title || '').trim();
          if (pTitle.toLowerCase() === oldTrimmed.toLowerCase() || (pageToUpdate && item.data.id === pageToUpdate.id)) {
            item.data.title = newTrimmed;
            if (pageToUpdate && pageToUpdate.slug) {
              item.data.slug = pageToUpdate.slug;
            }
          }
        }
      });
      saveProjectToStorage();
    }

    if (typeof window.logActivity === 'function') {
      window.logActivity('category', {
        action: 'renamed',
        oldName: oldTrimmed,
        newName: newTrimmed,
        categoryName: newTrimmed
      });
    }

    renderTaxonomy();
    if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
    if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
    if (typeof window.updatePostsCategoryFilterOptions === 'function') window.updatePostsCategoryFilterOptions();
    if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
    if (typeof window.renderPipelineGrid === 'function') window.renderPipelineGrid();
    if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
    if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
    if (typeof window.showToast === 'function') window.showToast(`Saved category "${newTrimmed}"`);
    return true;
  }

  let activeDraggedCat = null;
  let activeDraggedEl = null;

  function createCategoryChipDOM(cat) {
    const chip = document.createElement('div');
    chip.className = 'category-chip category-row';
    chip.setAttribute('draggable', 'true');
    chip.setAttribute('data-cat', cat);
    chip.innerHTML = `
      <div class="category-chip-left">
        <span class="category-drag-handle" title="Drag to rearrange" aria-label="Drag to rearrange">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="5" r="1.5"></circle>
            <circle cx="11" cy="5" r="1.5"></circle>
            <circle cx="5" cy="11" r="1.5"></circle>
            <circle cx="11" cy="11" r="1.5"></circle>
          </svg>
        </span>
        <span class="chip-label" title="Double-click to rename category">${escapeHtml(cat)}</span>
      </div>
      <div class="category-chip-actions">
        <button type="button" class="btn-chip-edit" title="Rename category" style="background: none; border: none; padding: 4px; cursor: pointer; color: inherit; opacity: 0.6; display: inline-flex; align-items: center; border-radius: 4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button type="button" class="btn-chip-delete" title="Remove category">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    function triggerRename() {
      const originalHtml = chip.innerHTML;
      chip.setAttribute('draggable', 'false');
      chip.classList.add('is-editing');
      chip.style.setProperty('background', 'transparent', 'important');
      chip.style.setProperty('border', 'none', 'important');
      chip.style.setProperty('box-shadow', 'none', 'important');
      chip.style.setProperty('padding', '0', 'important');
      chip.style.setProperty('gap', '0.5rem', 'important');

      chip.innerHTML = `
        <div class="category-edit-bar" style="flex: 1; min-width: 0; display: flex; align-items: center; min-height: 40px; padding: 0 0.85rem; border-radius: 8px; background: var(--category-chip-bg, rgba(113, 113, 122, 0.12)); border: 1px solid var(--accent-primary, var(--category-chip-border, rgba(113, 113, 122, 0.45))); box-sizing: border-box;">
          <input type="text" class="chip-rename-input" value="${escapeHtml(cat)}" style="width: 100%; height: 100%; border: none !important; outline: none !important; box-shadow: none !important; background: transparent !important; color: var(--category-chip-color, var(--text-primary, #fff)); font-size: 0.88rem; font-weight: 500; font-family: inherit; padding: 0; margin: 0;">
        </div>
        <button type="button" class="btn btn-primary btn-sm btn-chip-save" style="min-height: 40px; padding: 0 1rem; border-radius: 8px; flex-shrink: 0;">Save</button>
      `;
      const input = chip.querySelector('.chip-rename-input');
      const saveBtn = chip.querySelector('.btn-chip-save');
      input?.focus();
      input?.select();

      let finished = false;
      const finish = async (save, fromButton = false) => {
        if (finished) return;
        finished = true;

        if (save && input) {
          const newName = input.value.trim();
          if (newName && newName !== cat) {
            const oldSlug = cat.toLowerCase().replace(/\s+/g, '-');
            const newSlug = newName.toLowerCase().replace(/\s+/g, '-');
            const pubCount = Array.isArray(window.drafts)
              ? window.drafts.filter(d => {
                  if (!d || d.type === 'page') return false;
                  const isPub = Boolean(d.status === 'published' || d.everPublished || d.publishedAt || d.publishedSlug);
                  if (!isPub) return false;
                  const pCat = String(d.permalinkCat || d.tag || (Array.isArray(d.categories) && d.categories[0]) || '').trim().toLowerCase();
                  return pCat === cat.toLowerCase();
                }).length
              : 0;
            if (pubCount > 0 && oldSlug !== newSlug && typeof window.showConfirmDialog === 'function') {
              const confirmed = await window.showConfirmDialog({
                title: 'URL Link Warning',
                message: `Renaming "${cat}" to "${newName}" will change the URL of ${pubCount} published post${pubCount === 1 ? '' : 's'} (/${oldSlug}/... → /${newSlug}/...) and break existing links. Are you sure you want to rename it?`,
                confirmText: 'Yes, Rename',
                cancelText: 'Cancel',
                isDanger: true
              });
              if (!confirmed) {
                chip.classList.remove('is-editing');
                chip.removeAttribute('style');
                chip.setAttribute('draggable', 'true');
                chip.innerHTML = originalHtml;
                bindEvents();
                return;
              }
            }
            const didRename = renameCategory(cat, newName);
            if (didRename) return;
          } else if (fromButton && typeof window.showToast === 'function') {
            window.showToast(`Saved category "${cat}"`);
          }
        }

        chip.classList.remove('is-editing');
        chip.removeAttribute('style');
        chip.setAttribute('draggable', 'true');
        chip.innerHTML = originalHtml;
        bindEvents();
      };

      saveBtn?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        finish(true, true);
      });
      saveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        finish(true, true);
      });

      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false, false);
        }
      });
      input?.addEventListener('blur', () => {
        finish(true, false);
      });
    }

    function bindEvents() {
      chip.querySelector('.btn-chip-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerRename();
      });

      chip.querySelector('.chip-label')?.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        triggerRename();
      });

      chip.querySelector('.btn-chip-delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pubCount = Array.isArray(window.drafts)
          ? window.drafts.filter(d => {
              if (!d || d.type === 'page') return false;
              const isPub = Boolean(d.status === 'published' || d.everPublished || d.publishedAt || d.publishedSlug);
              if (!isPub) return false;
              const pCat = String(d.permalinkCat || d.tag || (Array.isArray(d.categories) && d.categories[0]) || '').trim().toLowerCase();
              return pCat === cat.toLowerCase();
            }).length
          : 0;
        if (typeof window.showConfirmDialog === 'function') {
          const warnMsg = pubCount > 0
            ? `Deleting category "${cat}" will change the URL of ${pubCount} published post${pubCount === 1 ? '' : 's'} and break existing links. Are you sure you want to delete it?`
            : `Are you sure you want to delete category "${cat}"?`;
          const confirmed = await window.showConfirmDialog({
            title: pubCount > 0 ? 'URL Link Warning' : 'Delete Category?',
            message: warnMsg,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true
          });
          if (!confirmed) return;
        }
        projectConfig.categories = projectConfig.categories.filter(c => c && c.toLowerCase() !== cat.toLowerCase());
        const catLower = cat.trim().toLowerCase();
        const catSlug = (typeof window.generateSlug === 'function')
          ? window.generateSlug(cat)
          : catLower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        if (!Array.isArray(projectConfig.deletedCategories)) {
          projectConfig.deletedCategories = [];
        }
        if (!projectConfig.deletedCategories.some(dc => String(dc || '').trim().toLowerCase() === catLower)) {
          projectConfig.deletedCategories.push(catLower);
        }
        try {
          localStorage.setItem('cedar_deleted_categories', JSON.stringify(projectConfig.deletedCategories));
        } catch (e) {}

        let draftsChanged = false;
        const targetDrafts = Array.isArray(window.drafts) ? window.drafts : (typeof drafts !== 'undefined' && Array.isArray(drafts) ? drafts : []);
        const removedPageIds = [];
        const removedPageSlugs = new Set([catSlug]);

        for (let i = targetDrafts.length - 1; i >= 0; i--) {
          const d = targetDrafts[i];
          if (!d) continue;
          const isCatPage = Boolean(
            d.isCategoryAggregate ||
            String(d.id || '').startsWith('page_cat_') ||
            (d.type === 'page' && ((d.title || '').trim().toLowerCase() === catLower || (d.slug || '').trim().toLowerCase() === catSlug))
          );
          if (isCatPage) {
            const matchCat = (d.categoryAggregate && d.categoryAggregate.trim().toLowerCase() === catLower) ||
              (d.title && d.title.trim().toLowerCase() === catLower) ||
              (d.slug && d.slug.trim().toLowerCase() === catSlug) ||
              d.id === `page_cat_${catSlug}`;
            if (matchCat) {
              if (d.id) removedPageIds.push(d.id);
              if (d.slug) removedPageSlugs.add(d.slug);
              if (window.CedarStore) {
                if (typeof window.CedarStore.markIdDeleted === 'function' && d.id) window.CedarStore.markIdDeleted(d.id);
                if (typeof window.CedarStore.remove === 'function' && d.id) window.CedarStore.remove(d.id);
              }
              targetDrafts.splice(i, 1);
              draftsChanged = true;
              continue;
            }
          }

          let thisDraftChanged = false;
          if (d.tag && d.tag.toLowerCase() === catLower) {
            d.tag = '';
            thisDraftChanged = true;
          }
          if (Array.isArray(d.categories)) {
            const origLen = d.categories.length;
            d.categories = d.categories.filter(c => c && c.toLowerCase() !== catLower);
            if (d.categories.length !== origLen) {
              thisDraftChanged = true;
            }
          }
          if (!d.tag && Array.isArray(d.categories) && d.categories.length > 0) {
            d.tag = d.categories[0];
            thisDraftChanged = true;
          }
          if (d.permalinkCat && d.permalinkCat.toLowerCase() === catLower) {
            d.permalinkCat = d.tag || 'uncategorized';
            thisDraftChanged = true;
          }
          if (thisDraftChanged) {
            d.updatedAt = Date.now();
            draftsChanged = true;
          }
        }

        // Remove category page folders from physical Vault & Virtual Storage
        const candidatePaths = [];
        removedPageSlugs.forEach(s => {
          if (!s) return;
          candidatePaths.push(`pages/published/${s}`, `pages/hidden/${s}`, `pages/${s}`);
        });
        if (window.SheeshVault && typeof window.SheeshVault.deleteFile === 'function') {
          candidatePaths.forEach(cp => {
            try { window.SheeshVault.deleteFile(cp); } catch (e) {}
          });
        }
        const bridgeVaultPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path') || (window.projectConfig && window.projectConfig.vaultPath)) || '').trim();
        if (bridgeVaultPath && candidatePaths.length > 0 && (window.Cedar && window.Cedar.isLocalServer)) {
          candidatePaths.forEach(cp => {
            fetch('/api/vault-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: bridgeVaultPath, filePath: cp, targetPath: cp })
            }).catch(() => {});
          });
        }
        const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
        if (vStorage && typeof vStorage.deleteFile === 'function') {
          candidatePaths.forEach(cp => {
            try {
              vStorage.deleteFile(`${cp}/draft.json`);
              vStorage.deleteFile(`${cp}/index.md`);
              vStorage.deleteFile(`${cp}/index.html`);
            } catch (e) {}
          });
        }

        if (draftsChanged) {
          saveDraftsToStorage();
          if (typeof renderPipelineGrid === 'function') renderPipelineGrid();
        }

        const filterCatActivity = (item) => {
          if (!item) return false;
          if (item.type === 'category') {
            const cName = String(item.data?.categoryName || item.data?.newName || item.data?.oldName || '').trim().toLowerCase();
            if (cName === catLower || item.id === `synth-cat-${cat}` || String(item.id || '').toLowerCase() === `synth-cat-${catLower}`) {
              return false;
            }
          }
          if (item.type === 'page') {
            const pId = String(item.data?.id || item.id || '').trim();
            const pTitle = String(item.data?.title || '').trim().toLowerCase();
            const pSlug = String(item.data?.slug || '').trim().toLowerCase();
            if (pId === `page_cat_${catSlug}` || removedPageIds.includes(pId) || pTitle === catLower || pSlug === catSlug) {
              return false;
            }
          }
          return true;
        };

        if (projectConfig && Array.isArray(projectConfig.activityLog)) {
          projectConfig.activityLog = projectConfig.activityLog.filter(filterCatActivity);
          try {
            localStorage.setItem('cedar_activity_log', JSON.stringify(projectConfig.activityLog));
          } catch (e) {}
        }
        if (typeof window !== 'undefined' && Array.isArray(window.activityLog)) {
          window.activityLog = window.activityLog.filter(filterCatActivity);
        }

        saveProjectToStorage();
        renderTaxonomy();
        if (typeof window.updateCategorySelectUI === 'function') {
          window.updateCategorySelectUI();
        }
        if (typeof window.renderStaticPages === 'function') {
          window.renderStaticPages();
        }
        if (typeof window.updateDashboardCounts === 'function') {
          window.updateDashboardCounts();
        }
        if (typeof window.renderHomeActivityStream === 'function') {
          window.renderHomeActivityStream();
        }
        showToast(`Removed category "${cat}"`);
      });

      // Drag and Drop reordering events
      chip.addEventListener('dragstart', (e) => {
        if (chip.querySelector('.chip-rename-input') || e.target.closest('button')) {
          e.preventDefault();
          return;
        }
        activeDraggedCat = cat;
        activeDraggedEl = chip;
        chip.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cat);
      });

      chip.addEventListener('dragend', () => {
        chip.classList.remove('is-dragging');
        const list = document.getElementById('list-categories');
        if (list) {
          list.querySelectorAll('.category-chip').forEach(c => {
            c.classList.remove('drag-over-top', 'drag-over-bottom');
          });
        }
        activeDraggedCat = null;
        activeDraggedEl = null;
      });

      chip.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!activeDraggedCat || activeDraggedCat === cat) return;

        const rect = chip.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAfter = e.clientY > midY;

        chip.classList.toggle('drag-over-top', !isAfter);
        chip.classList.toggle('drag-over-bottom', isAfter);
      });

      chip.addEventListener('dragleave', (e) => {
        if (!chip.contains(e.relatedTarget)) {
          chip.classList.remove('drag-over-top', 'drag-over-bottom');
        }
      });

      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        chip.classList.remove('drag-over-top', 'drag-over-bottom');

        const draggedCat = activeDraggedCat;
        if (!draggedCat || draggedCat === cat) return;

        if (!Array.isArray(projectConfig.categories)) projectConfig.categories = [];
        const fromIndex = projectConfig.categories.findIndex(c => c.toLowerCase() === draggedCat.toLowerCase());
        if (fromIndex === -1) return;

        const [removed] = projectConfig.categories.splice(fromIndex, 1);
        const toIndex = projectConfig.categories.findIndex(c => c.toLowerCase() === cat.toLowerCase());
        if (toIndex === -1) {
          projectConfig.categories.push(removed);
        } else {
          const rect = chip.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const insertAfter = e.clientY > midY;
          const insertIndex = insertAfter ? toIndex + 1 : toIndex;
          projectConfig.categories.splice(insertIndex, 0, removed);
        }

        saveProjectToStorage();
        renderTaxonomy();
        if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
        if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
        if (typeof window.renderPipelineGrid === 'function') window.renderPipelineGrid();
        if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
        if (typeof window.showToast === 'function') window.showToast(`Reordered category "${draggedCat}"`);
      });
    }

    bindEvents();
    return chip;
  }

  function renderTaxonomy() {
    const list = document.getElementById('list-categories');
    const filterSelect = document.getElementById('dash-filter-category');
    if (typeof window.syncAutoCategoryToggles === 'function') {
      window.syncAutoCategoryToggles();
    }
    if (!list) return;

    if (!Array.isArray(projectConfig.categories)) projectConfig.categories = [];
    // Ensure "Uncategorized" and "Posts" are never present in projectConfig.categories
    projectConfig.categories = projectConfig.categories.filter(c => c && c.trim().toLowerCase() !== 'uncategorized' && c.trim().toLowerCase() !== 'posts');

    const searchInput = document.getElementById('categories-search-input');
    const searchQuery = (searchInput?.value || '').trim().toLowerCase();

    list.innerHTML = '';
    if (window._categoriesFeedObserver) {
      window._categoriesFeedObserver.disconnect();
      window._categoriesFeedObserver = null;
    }

    const filteredCategories = projectConfig.categories.filter(cat => {
      if (!searchQuery) return true;
      return cat.toLowerCase().includes(searchQuery);
    });

    if (projectConfig.categories.length === 0) {
      list.innerHTML = '<div class="categories-empty" style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 1.5rem 0.5rem; text-align: center; width: 100%;">No categories created yet. Use the form above to add your first category!</div>';
    } else if (filteredCategories.length === 0 && searchQuery) {
      list.innerHTML = `<div class="categories-empty" style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 1.5rem 0.5rem; text-align: center; width: 100%;">No categories match "${escapeHtml(searchQuery)}".</div>`;
    } else {
      // Render initial batch (or all categories)
      const CAT_BATCH_SIZE = 100;
      let renderedCount = 0;

      const initialBatch = filteredCategories.slice(0, CAT_BATCH_SIZE);
      initialBatch.forEach(cat => {
        list.appendChild(createCategoryChipDOM(cat));
      });
      renderedCount = initialBatch.length;

      if (filteredCategories.length > renderedCount) {
        const sentinel = document.createElement('div');
        sentinel.className = 'categories-infinite-sentinel';
        sentinel.style.width = '100%';
        sentinel.style.height = '10px';
        sentinel.style.flexBasis = '100%';
        list.appendChild(sentinel);

        window._categoriesFeedObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && renderedCount < filteredCategories.length) {
              const nextBatch = filteredCategories.slice(renderedCount, renderedCount + CAT_BATCH_SIZE);
              nextBatch.forEach(cat => {
                list.insertBefore(createCategoryChipDOM(cat), sentinel);
              });
              renderedCount += nextBatch.length;
              if (renderedCount >= filteredCategories.length) {
                if (window._categoriesFeedObserver) {
                  window._categoriesFeedObserver.disconnect();
                  window._categoriesFeedObserver = null;
                }
                sentinel.remove();
              }
            }
          });
        }, { rootMargin: '300px' });

        window._categoriesFeedObserver.observe(sentinel);
      }
    }

    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Categories</option>';
      projectConfig.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentVal) opt.selected = true;
        filterSelect.appendChild(opt);
      });
    }

    if (typeof window.updateCategorySelectUI === 'function') {
      window.updateCategorySelectUI();
    }
    if (typeof window.updatePostsCategoryFilterOptions === 'function') {
      window.updatePostsCategoryFilterOptions();
    }
  }


  function initTaxonomyEvents() {
    // 5. Taxonomy Add & Search
    const btnAddCat = document.getElementById('btn-add-category');
    const inputCat = document.getElementById('input-new-category');
    if (btnAddCat && inputCat) {
      btnAddCat.addEventListener('click', () => {
        const val = inputCat.value.trim();
        if (!val) return;
        const reservedNames = new Set(['uncategorized', 'posts', 'rss', 'about', 'about-cedar', 'about cedar', 'feed', 'links', 'all', 'all posts', 'all-posts']);
        if (reservedNames.has(val.toLowerCase())) {
          showToast("Woah! That's a reserved name - pick something else.");
          return;
        }
        if (!projectConfig.categories.some(c => c && c.toLowerCase() === val.toLowerCase())) {
          if (Array.isArray(projectConfig.deletedCategories)) {
            projectConfig.deletedCategories = projectConfig.deletedCategories.filter(dc => String(dc || '').trim().toLowerCase() !== val.toLowerCase());
            try {
              localStorage.setItem('cedar_deleted_categories', JSON.stringify(projectConfig.deletedCategories));
            } catch (e) {}
          }
          projectConfig.categories.push(val);
          saveProjectToStorage();
          if (typeof window.logActivity === 'function') {
            window.logActivity('category', { action: 'added', categoryName: val });
          }
          renderTaxonomy();
          if (typeof window.updateCategorySelectUI === 'function') {
            window.updateCategorySelectUI();
          }
          if (typeof window.syncCategoryPages === 'function') {
            window.syncCategoryPages();
          }
          if (typeof window.renderStaticPages === 'function') {
            window.renderStaticPages();
          }
          if (typeof window.updateDashboardCounts === 'function') {
            window.updateDashboardCounts();
          }
          inputCat.value = '';
          showToast(`Added category "${val}"`);
        } else {
          showToast(`Category "${val}" already exists.`);
        }
      });
      inputCat.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnAddCat.click();
        }
      });
    }

    const categoriesSearch = document.getElementById('categories-search-input');
    const categoriesSearchClear = document.getElementById('btn-categories-search-clear');
    if (categoriesSearch) {
      categoriesSearch.addEventListener('input', () => {
        if (categoriesSearchClear) {
          categoriesSearchClear.style.display = categoriesSearch.value.trim() ? 'flex' : 'none';
        }
        renderTaxonomy();
      });
    }
    if (categoriesSearchClear) {
      categoriesSearchClear.addEventListener('click', () => {
        if (categoriesSearch) {
          categoriesSearch.value = '';
          categoriesSearch.focus();
        }
        categoriesSearchClear.style.display = 'none';
        renderTaxonomy();
      });
    }

    const btnHeaderNewCat = document.getElementById('btn-header-new-category');
    if (btnHeaderNewCat) {
      btnHeaderNewCat.addEventListener('click', () => {
        if (inputCat) {
          inputCat.focus();
          inputCat.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    const list = document.getElementById('list-categories');
    if (list) {
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      list.addEventListener('drop', (e) => {
        if (e.target === list && activeDraggedCat) {
          e.preventDefault();
          const fromIndex = projectConfig.categories.findIndex(c => c.toLowerCase() === activeDraggedCat.toLowerCase());
          if (fromIndex !== -1) {
            const [removed] = projectConfig.categories.splice(fromIndex, 1);
            projectConfig.categories.push(removed);
            saveProjectToStorage();
            renderTaxonomy();
            if (typeof window.updateCategorySelectUI === 'function') window.updateCategorySelectUI();
            if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
            if (typeof window.renderPipelineGrid === 'function') window.renderPipelineGrid();
            if (typeof window.updateDashboardCounts === 'function') window.updateDashboardCounts();
            if (typeof window.showToast === 'function') window.showToast(`Reordered category "${activeDraggedCat}"`);
          }
        }
      });
    }


  }

  window.renderTaxonomy = renderTaxonomy;
  window.initTaxonomyEvents = initTaxonomyEvents;
  window.renameCategory = renameCategory;

  Object.assign(window.Cedar.dashboard, {
    renderTaxonomy,
    initTaxonomyEvents,
    renameCategory
  });
})();
