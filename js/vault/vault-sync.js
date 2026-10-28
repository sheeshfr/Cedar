/**

 * Cedar - Vault Hard Drive Sync & Local Instance Manager

 * Full client-side directory management, dual-prompt onboarding,

 * carry-over transitions, existing Cedar folder detection,

 * visible path tracking, and .ZIP backup / import.

 */

(function () {

  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};

  window.Outpost = window.Cedar;
  if (typeof window.Cedar.isLocalServer !== 'boolean') {
    const _host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';
    window.Cedar.isLocalServer = (_host === 'localhost' || _host === '127.0.0.1' || _host.endsWith('.local'));
  }
  const isLocalServer = () => Boolean(window.Cedar && window.Cedar.isLocalServer);

  function dataUrlToBlob(dataUrl) {

    if (!dataUrl || !dataUrl.startsWith('data:')) return null;

    try {

      const parts = dataUrl.split(',');

      const mimeMatch = parts[0].match(/:(.*?);/);

      const mime = mimeMatch ? mimeMatch[1] : 'image/png';

      const bstr = atob(parts[1]);

      let n = bstr.length;

      const u8arr = new Uint8Array(n);

      while (n--) {

        u8arr[n] = bstr.charCodeAt(n);

      }

      return new Blob([u8arr], { type: mime });

    } catch (e) {

      console.warn('[VaultSync] Failed to convert dataUrl to blob', e);

      return null;

    }

  }

  function escapeHtml(str) {

    if (!str) return '';

    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  }

  // Pending directory handle during modal interaction flows

  let pendingDirHandle = null;

  let pendingMode = null; // 'initial' | 'change'

  let selectedBrowserDataChoice = 'backup'; // 'backup' | 'remove'

  let selectedCarryChoice = 'move'; // 'move' | 'copy' | 'no'

  // =========================================================================

  // BROWSER DATA BACKUP SNAPSHOTS

  // =========================================================================

  function saveBrowserBackupSnapshot() {

    try {

      const draftsJson = JSON.stringify(window.drafts || []);

      const projectJson = JSON.stringify(window.projectConfig || {});

      const now = Date.now().toString();

      localStorage.setItem('cedar_browser_backup_drafts', draftsJson);

      localStorage.setItem('cedar_browser_backup_project', projectJson);

      localStorage.setItem('cedar_browser_backup_timestamp', now);

      localStorage.setItem('cedar_browser_backup_mode', 'backup');

    } catch (e) {

      console.warn('[VaultSync] Error saving browser backup snapshot:', e);

    }

  }

  function restoreBrowserBackupSnapshot() {

    try {

      const snapDrafts = localStorage.getItem('cedar_browser_backup_drafts');

      const snapProj = localStorage.getItem('cedar_browser_backup_project');

      const snapTime = localStorage.getItem('cedar_browser_backup_timestamp');

      if (snapDrafts) {

        window.drafts = JSON.parse(snapDrafts);

        window.currentDraft = window.drafts[0] || null;

        if (typeof window.saveDraftsToStorage === 'function') {

          window.saveDraftsToStorage();

        }

      }

      if (snapProj) {

        Object.assign(window.projectConfig, JSON.parse(snapProj));

        if (typeof window.saveProjectToStorage === 'function') {

          window.saveProjectToStorage();

        }

      }

      if (typeof window.updateCedarTitle === 'function') window.updateCedarTitle(); else if (typeof window.updateOutpostTitle === 'function') window.updateOutpostTitle();

      if (typeof window.renderDashboard === 'function') window.renderDashboard();

      if (typeof window.renderProjectSettings === 'function') window.renderProjectSettings();

      if (typeof window.renderTaxonomy === 'function') window.renderTaxonomy();

      if (typeof window.renderSettingsAuthorProfile === 'function') window.renderSettingsAuthorProfile();

      const timeStr = snapTime ? new Date(parseInt(snapTime, 10)).toLocaleString() : 'earlier';

      if (typeof window.showToast === 'function') {

        window.showToast(`Returned to your blog snapshot from ${timeStr}!`);

      }

      return true;

    } catch (e) {

      console.error('[VaultSync] Error restoring backup snapshot:', e);

      return false;

    }

  }

  function removeBrowserDataForGood() {

    try {

      localStorage.removeItem('cedar_browser_backup_drafts');

      localStorage.removeItem('cedar_browser_backup_project');

      localStorage.removeItem('cedar_browser_backup_timestamp');

      localStorage.setItem('cedar_browser_backup_mode', 'removed');

      // Purge drafts from browser storage so it is gone for good from the browser

      const storageDraftsKey = window.STORAGE_KEY_DRAFTS || 'sheesh_static_writer_drafts_v2';

      const legacyDraftsKey = window.LEGACY_STORAGE_DRAFTS || 'sheesh_static_writer_drafts';

      localStorage.removeItem(storageDraftsKey);

      localStorage.removeItem(legacyDraftsKey);

    } catch (e) {

      console.warn('[VaultSync] Error removing browser data:', e);

    }

  }

  function resetWorkspaceToDefault() {

    if (typeof window.getDefaultProjectConfig === 'function') {

      window.projectConfig = window.getDefaultProjectConfig();

    }

    window.drafts = [];

    window.currentDraft = null;

    if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();

    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();

    if (typeof window.renderDashboard === 'function') window.renderDashboard();

    if (typeof window.renderProjectSettings === 'function') window.renderProjectSettings();

    if (typeof window.renderTaxonomy === 'function') window.renderTaxonomy();

    if (typeof window.updateCedarTitle === 'function') window.updateCedarTitle(); else if (typeof window.updateOutpostTitle === 'function') window.updateOutpostTitle();

  }

  // =========================================================================

  // POINT TO LOCAL INSTANCE (ENTRY POINT FOR POINT & CHANGE)

  // =========================================================================

  async function openServerBridgeModal(mode = 'initial') {

    pendingMode = mode;

    const modal = document.getElementById('modal-sync-bridge-picker');

    const inputPath = document.getElementById('input-sync-bridge-path');

    const feedback = document.getElementById('sync-bridge-feedback');

    const quickPickSpan = document.getElementById('label-sync-bridge-current-path');

    if (feedback) feedback.style.display = 'none';

    // Show modal immediately

    if (modal) {

      modal.style.display = 'flex';

      setTimeout(() => {

        if (inputPath) inputPath.focus();

      }, 50);

    }

    // Prefill with existing external vault path if saved

    let initialPath = (localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || '';

    if (initialPath && /[\\/]website[\\/]cedar[\\/]?$/i.test(initialPath)) {

      initialPath = '';

    }

    if (inputPath && initialPath) {

      inputPath.value = initialPath;

    }

    return true;

  }

  async function pointToLocalInstance(mode = 'initial') {

    if (!window.SheeshVault || !window.SheeshVault.isSupported()) {

      alert('Local directory access is not supported in this environment.');

      return;

    }

    // If browser lacks native FSA (e.g., Mozilla Firefox or Safari), seamlessly open Server Bridge modal!

    if (!window.SheeshVault.isNativeFsaSupported()) {

      return await openServerBridgeModal(mode);

    }

    try {

      let handle;
      try {
        handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      } catch (pickerErr) {
        if (pickerErr && pickerErr.name === 'AbortError') throw pickerErr;
        handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      }

      if (!handle) return;

      const hasPerm = await window.SheeshVault.verifyPermission(handle, true);

      if (!hasPerm) {

        alert('Permission to access this directory was denied.');

        return;

      }

      pendingDirHandle = handle;

      pendingMode = mode;

      // 1. IMPORTANT: Check if Outpost detects an EXISTING Outpost folder

      const isExisting = await (window.SheeshVault.isExistingCedarFolder || window.SheeshVault.isExistingOutpostFolder)(handle);

      if (isExisting) {

        showExistingCedarModal(handle);

        return;

      }

      // 2. If changing from an existing folder (and target is NOT an outpost folder)

      if (mode === 'change' || (window.SheeshVault.isConnected() && window.SheeshVault.getRootHandle())) {

        showCarryOverModal(handle);

        return;

      }

      // 3. Initial connection: Prompt 1 - "Turn what you have now into your blog?"

      showTurnIntoBlogModal(handle);

    } catch (err) {

      if (err.name === 'AbortError') return; // User cancelled picker

      console.error('[VaultSync] Folder pick error:', err);

      if (typeof window.showToast === 'function') {

        window.showToast('Could not open folder: ' + err.message, 3500);

      } else {

        alert('Could not open folder: ' + err.message);

      }

    }

  }

  // =========================================================================

  // MODAL 1: TURN INTO BLOG (Step 1 of Initial)

  // =========================================================================

  function showTurnIntoBlogModal(handle) {

    const modal = document.getElementById('modal-sync-turn-into-blog');

    const folderNameEl = document.getElementById('sync-turn-into-folder-name');

    if (folderNameEl) folderNameEl.textContent = `📁 ${handle.name}`;

    if (modal) {

      modal.style.display = 'flex';

    }

  }

  async function handleTurnIntoBlogYes() {

    const modalTurn = document.getElementById('modal-sync-turn-into-blog');

    if (modalTurn) modalTurn.style.display = 'none';

    // Step 2: Prompt for browser data handling (Remove or leave as backup)

    showBrowserDataModal(pendingDirHandle);

  }

  async function handleTurnIntoBlogNo() {

    const modalTurn = document.getElementById('modal-sync-turn-into-blog');

    if (modalTurn) modalTurn.style.display = 'none';

    // User chose NOT to turn current workspace into blog; simply point at folder

    if (pendingDirHandle) {

      await finishConnectNewFolder(pendingDirHandle);

      if (typeof window.showToast === 'function') {

        window.showToast(`Pointed blog to "${pendingDirHandle.name}"!`);

      }

    }

    pendingDirHandle = null;

    pendingMode = null;

  }

  // =========================================================================

  // MODAL 2: BROWSER DATA STORAGE (Step 2 of Initial)

  // =========================================================================

  function showBrowserDataModal(handle) {

    const modal = document.getElementById('modal-sync-browser-data');

    const folderNameEl = document.getElementById('sync-browser-folder-name');

    if (folderNameEl) folderNameEl.textContent = `📁 ${handle.name}`;

    // Reset selection to 'backup' default

    selectedBrowserDataChoice = 'backup';

    const cardBackup = document.getElementById('choice-browser-backup');

    const cardRemove = document.getElementById('choice-browser-remove');

    if (cardBackup) cardBackup.classList.add('active');

    if (cardRemove) cardRemove.classList.remove('active');

    if (modal) {

      modal.style.display = 'flex';

    }

  }

  async function handleBrowserDataConfirm() {

    const modal = document.getElementById('modal-sync-browser-data');

    if (modal) modal.style.display = 'none';

    const handle = pendingDirHandle;

    if (!handle) return;

    if (typeof window.showToast === 'function') {

      window.showToast('Copying your blog to local folder...');

    }

    try {

      // 1. Copy everything to the local folder

      await window.SheeshVault.copyBlogToFolder(handle);

      // 2. Handle browser data based on user choice

      if (selectedBrowserDataChoice === 'backup') {

        saveBrowserBackupSnapshot();

      } else {

        removeBrowserDataForGood();

      }

      // 3. Connect to the folder as the active root handle

      await finishConnectNewFolder(handle);

      if (typeof window.showToast === 'function') {

        window.showToast(

          selectedBrowserDataChoice === 'backup'

            ? `Your blog is now active on your hard drive! Browser data saved as backup.`

            : `Your blog is now active on your hard drive! Browser cache cleared.`

        );

      }

    } catch (err) {

      console.error('[VaultSync] Error turning workspace into blog:', err);

      alert('Failed to copy blog to folder: ' + err.message);

    } finally {

      pendingDirHandle = null;

      pendingMode = null;

    }

  }

  // =========================================================================

  // MODAL 3: CARRY OVER WORK (When Changing Local Folder)

  // =========================================================================

  function showCarryOverModal(handle) {

    const modal = document.getElementById('modal-sync-change-carry');

    const newFolderEl = document.getElementById('sync-change-new-folder');

    if (newFolderEl) newFolderEl.textContent = `📁 ${handle.name}`;

    // Default choice is 'move'

    selectedCarryChoice = 'move';

    const choiceMove = document.getElementById('choice-carry-move');

    const choiceCopy = document.getElementById('choice-carry-copy');

    const choiceNo = document.getElementById('choice-carry-no');

    if (choiceMove) choiceMove.classList.add('active');

    if (choiceCopy) choiceCopy.classList.remove('active');

    if (choiceNo) choiceNo.classList.remove('active');

    if (modal) {

      modal.style.display = 'flex';

    }

  }

  async function handleCarryOverConfirm() {

    const modal = document.getElementById('modal-sync-change-carry');

    if (modal) modal.style.display = 'none';

    const newHandle = pendingDirHandle;

    if (!newHandle) return;

    const oldHandle = window.SheeshVault.getRootHandle();

    try {

      if (selectedCarryChoice === 'move') {

        if (typeof window.showToast === 'function') window.showToast('Moving blog files to new folder...');

        await window.SheeshVault.copyBlogToFolder(newHandle, { deleteFromOldHandle: oldHandle });

      } else if (selectedCarryChoice === 'copy') {

        if (typeof window.showToast === 'function') window.showToast('Copying blog files to new folder...');

        await window.SheeshVault.copyBlogToFolder(newHandle);

      } else {

        // 'no' — simply point at new spot

      }

      await finishConnectNewFolder(newHandle);

      if (typeof window.showToast === 'function') {

        window.showToast(`Switched active blog to "${newHandle.name}"!`);

      }

    } catch (err) {

      console.error('[VaultSync] Carry over error:', err);

      alert('Failed to change local folder: ' + err.message);

    } finally {

      pendingDirHandle = null;

      pendingMode = null;

    }

  }

  // =========================================================================

  // MODAL 4: EXISTING OUTPOST FOLDER DETECTED

  // =========================================================================

  function showExistingCedarModal(handle) {

    const modal = document.getElementById('modal-sync-existing-cedar') || document.getElementById('modal-sync-existing-outpost');

    const folderNameEl = document.getElementById('sync-existing-folder-name');

    if (folderNameEl) folderNameEl.textContent = `📁 ${handle.name}`;

    if (modal) {

      modal.style.display = 'flex';

    }

  }

  async function handleExistingSaveAndExport() {

    const modal = document.getElementById('modal-sync-existing-cedar') || document.getElementById('modal-sync-existing-outpost');

    if (modal) modal.style.display = 'none';

    const handle = pendingDirHandle;

    if (!handle) return;

    // 1. Export what they currently have as .ZIP

    if (typeof window.exportBlogAsZip === 'function') {

      await window.exportBlogAsZip();

    } else if (typeof window.exportMasterSliceZip === 'function') {

      await window.exportMasterSliceZip();

    }

    // 2. Short pause for download trigger, then switch and load

    setTimeout(async () => {

      try {

        await finishConnectExistingFolder(handle);

        if (typeof window.showToast === 'function') {

          window.showToast(`Exported backup (.ZIP) and switched to "${handle.name}"!`);

        }

      } catch (err) {

        console.error('[VaultSync] Error loading existing cedar folder:', err);

        alert('Could not load Cedar instance: ' + err.message);

      } finally {

        pendingDirHandle = null;

        pendingMode = null;

      }

    }, 600);

  }

  async function handleExistingChangeWithoutSaving() {

    const modal = document.getElementById('modal-sync-existing-cedar') || document.getElementById('modal-sync-existing-outpost');

    if (modal) modal.style.display = 'none';

    const handle = pendingDirHandle;

    if (!handle) return;

    try {

      await finishConnectExistingFolder(handle);

      if (typeof window.showToast === 'function') {

        window.showToast(`Switched to Cedar folder "${handle.name}"!`);

      }

    } catch (err) {

      console.error('[VaultSync] Error loading existing cedar folder:', err);

      alert('Could not load Cedar instance: ' + err.message);

    } finally {

      pendingDirHandle = null;

      pendingMode = null;

    }

  }

  function handleExistingDontChange() {

    const modal = document.getElementById('modal-sync-existing-cedar') || document.getElementById('modal-sync-existing-outpost');

    if (modal) modal.style.display = 'none';

    pendingDirHandle = null;

    pendingMode = null;

  }

  // =========================================================================

  // FINISH CONNECTION HELPERS

  // =========================================================================

  async function finishConnectNewFolder(handle) {

    localStorage.removeItem('cedar_vault_disconnected');

    await window.SheeshVault.setRootHandle(handle);

    await resolveAndSaveVaultPath(handle.name);

    localStorage.setItem('cedar_vault_connected', '1');

    localStorage.setItem('cedar_vault_name', handle.name);

    updateSyncStatusUI();

  }

  async function finishConnectExistingFolder(handle) {

    localStorage.removeItem('cedar_vault_disconnected');

    await window.SheeshVault.setRootHandle(handle);

    await window.SheeshVault.loadBlogFromFolder(handle);

    await resolveAndSaveVaultPath(handle.name);

    localStorage.setItem('cedar_vault_connected', '1');

    localStorage.setItem('cedar_vault_name', handle.name);

    updateSyncStatusUI();

  }

  async function resolveAndSaveVaultPath(folderName) {

    let resolved = folderName;

    try {

      const res = isLocalServer() ? await fetch(`/api/vault-path?folder=${encodeURIComponent(folderName)}`) : { ok: false };

      if (res.ok) {

        const data = await res.json();

        if (data && data.defaultPath) {

          resolved = data.defaultPath;

        }

      }

    } catch (e) {}

    localStorage.setItem('cedar_vault_path', resolved);

    localStorage.setItem('cedar_vault_name', folderName);

    localStorage.setItem('cedar_vault_connected', '1');

    localStorage.removeItem('cedar_vault_disconnected');

    if (window.projectConfig) {

      window.projectConfig.vaultPath = resolved;

    }

    return resolved;

  }

  // =========================================================================

  // REMOVE LOCAL STORAGE (DISCONNECT FLOW)

  // =========================================================================

  function removeLocalStorage() {

    const modal = document.getElementById('modal-sync-remove-confirm');

    const folderNameEl = document.getElementById('sync-remove-folder-name');

    const explanationEl = document.getElementById('sync-remove-explanation');

    const folderName = (window.SheeshVault && window.SheeshVault.getFolderName()) || 'Local Folder';

    if (folderNameEl) folderNameEl.textContent = `📁 ${folderName}`;

    const backupMode = localStorage.getItem('cedar_browser_backup_mode');

    const backupTime = localStorage.getItem('cedar_browser_backup_timestamp');

    if (explanationEl) {

      if (backupMode === 'backup' && backupTime) {

        const dateStr = new Date(parseInt(backupTime, 10)).toLocaleString();

        explanationEl.innerHTML = `🛡️ You chose to leave your browser data as a backup. When you disconnect, Cedar will return to that exact moment in your blog's history (<strong>${escapeHtml(dateStr)}</strong>). Your files on disk will remain untouched.`;

      } else if (backupMode === 'removed') {

        explanationEl.innerHTML = `⚠️ Your browser data was previously removed when connecting this folder. Disconnecting will reset your in-browser workspace to a fresh default state. Your files on disk will remain untouched.`;

      } else {

        explanationEl.textContent = 'Disconnecting unassigns this local folder. Your files on disk will remain untouched.';

      }

    }

    if (modal) {

      modal.style.display = 'flex';

    }

  }

  async function handleConfirmRemoveLocalStorage() {

    const modal = document.getElementById('modal-sync-remove-confirm');

    if (modal) modal.style.display = 'none';

    const backupMode = localStorage.getItem('cedar_browser_backup_mode');

    if (backupMode === 'backup') {

      restoreBrowserBackupSnapshot();

    } else if (backupMode === 'removed') {

      resetWorkspaceToDefault();

    }

    if (window.SheeshVault) {

      await window.SheeshVault.disconnect();

    }

    localStorage.removeItem('cedar_vault_path');

    localStorage.removeItem('cedar_vault_name');

    localStorage.removeItem('cedar_vault_connected');

    localStorage.removeItem('cedar_vault_mode');

    localStorage.removeItem('outpost_vault_path');

    localStorage.removeItem('outpost_vault_name');

    localStorage.removeItem('outpost_vault_connected');

    localStorage.removeItem('outpost_vault_mode');

    localStorage.setItem('cedar_vault_disconnected', '1');

    if (window.projectConfig) {

      delete window.projectConfig.vaultPath;

    }

    updateSyncStatusUI();

    if (typeof window.showToast === 'function') {

      window.showToast('Local storage disconnected.');

    }

  }

  // =========================================================================

  // UNIVERSAL EXPORT & IMPORT (.ZIP)

  // =========================================================================

  async function exportBlogAsZip() {

    if (typeof window.exportMasterSliceZip === 'function') {

      return await window.exportMasterSliceZip();

    }

    if (window.SheeshVault && typeof window.SheeshVault.exportZip === 'function') {

      try {

        if (typeof window.showToast === 'function') window.showToast('Exporting Blog (.ZIP)...');

        const zipBlob = await window.SheeshVault.exportZip();

        const url = URL.createObjectURL(zipBlob);

        const a = document.createElement('a');

        a.href = url;

        const slug = (window.projectConfig && window.projectConfig.name) ? window.projectConfig.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'cedar-blog';

        a.download = `${slug}-backup-${new Date().toISOString().split('T')[0]}.zip`;

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

        URL.revokeObjectURL(url);

      } catch (err) {

        alert('Failed to export ZIP: ' + err.message);

      }

    }

  }

  function importBlogFromZip(file) {

    if (!file) return;

    if (typeof window.promptImportWithBackupOption === 'function') {

      window.promptImportWithBackupOption(file, (success) => {

        if (success) {

          updateSyncStatusUI();

        }

      });

    } else if (window.SheeshVault && typeof window.SheeshVault.importZip === 'function') {

      window.SheeshVault.importZip(file).then(count => {

        updateSyncStatusUI();

        if (typeof window.showToast === 'function') window.showToast(`Imported ${count} items from ${file.name}!`);

      }).catch(err => {

        alert('Import error: ' + err.message);

      });

    }

  }

  // =========================================================================

  // UPDATE REAL-TIME SYNC STATUS & PATH VISIBILITY

  // =========================================================================

  async function updateSyncStatusUI() {

    const isExplicitlyDisconnected = localStorage.getItem('cedar_vault_disconnected') === '1';

    let storedPath = ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || (window.projectConfig && window.projectConfig.vaultPath) || '').trim();

    let storedName = (localStorage.getItem('cedar_vault_name') || localStorage.getItem('outpost_vault_name') || '').trim();

    const isConnFlag = (localStorage.getItem('cedar_vault_connected') || localStorage.getItem('outpost_vault_connected')) === '1';

    let isVaultActive = Boolean(window.SheeshVault && window.SheeshVault.isConnected());

    // If no path stored but not explicitly disconnected, check /api/vault-path

    if (!storedPath && !isExplicitlyDisconnected && isLocalServer()) {

      try {

        const res = await fetch('/api/vault-path');

        if (res.ok) {

          const data = await res.json();

          if (data && data.defaultPath && data.exists) {

            storedPath = data.defaultPath;

            storedName = data.folderName || storedPath.split(/[\\/]/).filter(Boolean).pop() || 'cedar';

            localStorage.setItem('cedar_vault_path', storedPath);

            localStorage.setItem('cedar_vault_name', storedName);

            localStorage.setItem('cedar_vault_connected', '1');

            if (window.projectConfig) window.projectConfig.vaultPath = storedPath;

          }

        }

      } catch (e) {}

    }

    // Auto-attach bridge if vault engine is not connected in memory but storedPath exists

    if (!isVaultActive && storedPath && !isExplicitlyDisconnected && isLocalServer() && window.SheeshVault && typeof window.SheeshVault.createServerBridgeHandle === 'function') {

      try {

        const folderName = storedName || storedPath.split(/[\\/]/).filter(Boolean).pop() || 'cedar';

        const bridgeHandle = window.SheeshVault.createServerBridgeHandle(storedPath, folderName);

        await window.SheeshVault.setRootHandle(bridgeHandle);

        isVaultActive = Boolean(window.SheeshVault.isConnected());

      } catch (e) {

        console.warn('[VaultSync] Auto-bridge reattach warning:', e);

      }

    }

    const isConnected = !isExplicitlyDisconnected && Boolean(isVaultActive || (isConnFlag && (storedPath || storedName)) || storedPath);

    const folderName = (window.SheeshVault && window.SheeshVault.isConnected() ? window.SheeshVault.getFolderName() : null) || storedName || (storedPath ? storedPath.split(/[\\/]/).filter(Boolean).pop() : null) || 'Local Folder';

    let pathDisplay = 'In-Browser Storage (No Local Folder Linked)';

    if (isConnected || storedPath) {

      if (window.SheeshVault && typeof window.SheeshVault.resolveVisiblePath === 'function' && window.SheeshVault.isConnected()) {

        pathDisplay = await window.SheeshVault.resolveVisiblePath();

      } else {

        pathDisplay = storedPath || folderName || 'Connected Local Folder';

      }

    }

    // 1. Export Pane Controls

    const exportPathInput = document.getElementById('export-vault-path-input');

    const exportPill = document.getElementById('export-vault-pill');

    const exportPillStatus = document.getElementById('export-vault-pill-status');

    const btnExportBrowse = document.getElementById('btn-export-browse-folder');

    const btnExportPoint = document.getElementById('btn-export-point-folder');

    const btnExportChange = document.getElementById('btn-export-change-folder');

    const btnExportRemove = document.getElementById('btn-export-remove-folder');

    if (exportPathInput) {

      exportPathInput.value = isConnected ? pathDisplay : 'In-Browser Storage (No Local Folder Linked)';

    }

    const storageUnlinkedBanner = document.getElementById('storage-unlinked-banner');
    if (storageUnlinkedBanner) {
      storageUnlinkedBanner.style.display = isConnected ? 'none' : 'flex';
    }

    const btnBrowseLabel = document.getElementById('btn-export-browse-label');
    if (btnBrowseLabel) {
      btnBrowseLabel.textContent = isConnected ? 'Change Folder' : 'Connect Local Folder';
    }

    if (exportPill) {
      if (isConnected) {
        exportPill.classList.add('connected');
        if (exportPillStatus) exportPillStatus.textContent = 'Connected · Auto-saving';
      } else {
        exportPill.classList.remove('connected');
        if (exportPillStatus) exportPillStatus.textContent = 'In-Browser Memory';
      }
    }

    if (btnExportPoint) {

      btnExportPoint.style.display = isConnected ? 'none' : 'inline-flex';

    }

    if (btnExportChange) {

      btnExportChange.style.display = isConnected ? 'inline-flex' : 'none';

    }

    if (btnExportRemove) {

      btnExportRemove.disabled = !isConnected;

      btnExportRemove.style.display = 'inline-flex';

    }

    const dangerRowDisconnect = document.getElementById('danger-row-disconnect-vault');

    const dangerDescDisconnect = document.getElementById('danger-desc-disconnect-vault');

    const dangerDividerDisconnect = document.getElementById('danger-divider-disconnect');

    if (dangerRowDisconnect) {

      dangerRowDisconnect.style.display = isConnected ? 'flex' : 'none';

      if (dangerDividerDisconnect) {

        dangerDividerDisconnect.style.display = isConnected ? 'block' : 'none';

      }

      if (dangerDescDisconnect && isConnected) {

        dangerDescDisconnect.innerHTML = `Unlinks <strong>${escapeHtml(folderName || "storage folder")}</strong> from Cedar. All articles, media, and site configurations remain safely stored on your hard drive.`;

      }

    }

    // 2. Settings Pane Controls

    const settingsPathInput = document.getElementById('setting-vault-folder-path');

    const settingsPill = document.getElementById('settings-vault-pill');

    const settingsPillStatus = document.getElementById('label-settings-vault-status');

    const btnSettingsConnect = document.getElementById('label-settings-connect-btn');

    const btnSettingsRemove = document.getElementById('btn-settings-remove-vault');

    if (settingsPathInput && document.activeElement !== settingsPathInput) {

      settingsPathInput.value = isConnected ? pathDisplay : '';

    }

    if (settingsPill) {

      if (isConnected) settingsPill.classList.add('connected');

      else settingsPill.classList.remove('connected');

    }

    if (settingsPillStatus) {

      settingsPillStatus.textContent = isConnected ? 'Connected' : 'Disconnected';

    }

    if (btnSettingsConnect) {

      btnSettingsConnect.textContent = isConnected ? 'Change Folder' : 'Connect Folder';

    }

    if (btnSettingsRemove) {

      btnSettingsRemove.style.display = isConnected ? 'inline-flex' : 'none';

    }

    initExportWebLinks();

  }

  // =========================================================================

  // EXPORT PANE: WEB LINKS MANAGER (GitHub, Cloudflare, Domain)

  // =========================================================================

  function initExportWebLinks() {

    const webConfigs = [

      {

        id: 'export-web-github-url',

        btnId: 'btn-web-github-open',

        saveBtnId: 'btn-web-github-save',

        badgeId: 'badge-web-github',

        key: 'cedar_export_github_url',

        configKey: 'githubRepoUrl',

        defaultOpen: 'https://github.com',

        type: 'github',

        label: 'hosting'

      },

      {

        id: 'export-web-cloudflare-url',

        btnId: 'btn-web-cloudflare-open',

        saveBtnId: 'btn-web-cloudflare-save',

        badgeId: 'badge-web-cloudflare',

        key: 'cedar_export_cloudflare_url',

        configKey: 'cloudflareUrl',

        defaultOpen: 'https://dash.cloudflare.com',

        type: 'cloudflare',

        label: 'delivery'

      },

      {

        id: 'export-web-domain-url',

        btnId: 'btn-web-domain-open',

        saveBtnId: 'btn-web-domain-save',

        badgeId: 'badge-web-domain',

        key: 'cedar_export_domain_url',

        configKey: 'domainProviderUrl',

        defaultOpen: '',

        type: 'domain',

        label: 'registrar'

      }

    ];

    function validateWebUrl(type, rawVal) {

      if (!rawVal || !rawVal.trim()) return { status: 'empty', normalized: '' };

      let val = rawVal.trim();

      if (type === 'github') {

        const ghRegex = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/|git@github\.com:)?([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+?)(?:\.git|\/|\?|#|$)/i;

        const match = val.match(ghRegex);

        if (match) {

          const owner = match[1];

          const repo = match[2];

          if (owner.toLowerCase() !== 'github.com' && owner.length > 0 && repo.length > 0) {

            const normalized = 'https://github.com/' + owner + '/' + repo;

            return { status: 'valid', normalized, owner, repo };

          }

        }

        return { status: 'invalid', normalized: val };

      }

      if (type === 'cloudflare') {

        let normalized = val;

        if (!/^https?:\/\//i.test(normalized)) {

          normalized = 'https://' + normalized;

        }

        try {

          const u = new URL(normalized);

          if (u.hostname.includes('.') && u.hostname.length > 3) {

            return { status: 'valid', normalized };

          }

        } catch (_) {}

        return { status: 'invalid', normalized: val };

      }

      if (type === 'domain') {

        let normalized = val;

        if (!/^https?:\/\//i.test(normalized)) {

          normalized = 'https://' + normalized;

        }

        try {

          const u = new URL(normalized);

          if (u.hostname.includes('.') && u.hostname.length > 3 && !u.hostname.endsWith('.')) {

            return { status: 'valid', normalized };

          }

        } catch (_) {}

        return { status: 'invalid', normalized: val };

      }

      return { status: 'valid', normalized: val };

    }

    function setBadgeState(badge, state) {

      if (!badge) return;

      badge.classList.remove('active', 'checking', 'invalid');

      if (state === 'checking') {

        badge.textContent = 'Checking...';

        badge.classList.add('checking');

      } else if (state === 'valid') {
        let displayHost = 'Linked';
        try {
          const raw = (input && input.value ? input.value : '').trim();
          if (raw) {
            const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
            displayHost = u.hostname.replace(/^www\./, '');
          }
        } catch (_) {}
        badge.textContent = displayHost;
        badge.classList.add('active');

      } else if (state === 'invalid') {

        badge.textContent = 'Invalid URL';

        badge.classList.add('invalid');

      } else {

        badge.textContent = 'Not Linked';

      }

    }

    webConfigs.forEach(item => {

      const input = document.getElementById(item.id);

      const btn = document.getElementById(item.btnId);

      const saveBtn = document.getElementById(item.saveBtnId);

      const badge = document.getElementById(item.badgeId);

      if (!input) return;

      // Restore saved value if input is empty

      const savedVal = localStorage.getItem(item.key) || (window.projectConfig && window.projectConfig[item.configKey]) || '';

      if (!input.value && savedVal) {

        input.value = savedVal;

      }

      // Initial validation on load (validates whatever is in input.value)

      const initCheck = validateWebUrl(item.type, input.value);

      setBadgeState(badge, initCheck.status);

      // Perform check handler with visual feedback

      let checkTimer = null;

      const runCheck = (newVal, autoNormalize = false) => {

        const currentVal = (newVal !== undefined ? newVal : input.value).trim();

        if (!currentVal) {

          setBadgeState(badge, 'empty');

          localStorage.removeItem(item.key);

          if (window.projectConfig) {

            window.projectConfig[item.configKey] = '';

            if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();

          }

          return;

        }

        // Show immediate Checking... indicator

        setBadgeState(badge, 'checking');

        if (checkTimer) clearTimeout(checkTimer);

        checkTimer = setTimeout(() => {

          const result = validateWebUrl(item.type, currentVal);

          setBadgeState(badge, result.status);

          if (result.status === 'valid') {

            const finalVal = autoNormalize ? result.normalized : currentVal;

            if (autoNormalize && input.value !== finalVal) {

              input.value = finalVal;

            }

            localStorage.setItem(item.key, finalVal);

            if (window.projectConfig) {

              window.projectConfig[item.configKey] = finalVal;

              if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();

            }

            // For GitHub, auto-populate Cloud Sync repo if empty

            if (item.type === 'github' && result.owner && result.repo) {

              const cloudRepoInput = document.getElementById('setting-github-repo');

              const repoIdentifier = result.owner + '/' + result.repo;

              if (cloudRepoInput && (!cloudRepoInput.value || cloudRepoInput.value.trim() === '')) {

                cloudRepoInput.value = repoIdentifier;

                localStorage.setItem('cedar_github_repo', repoIdentifier);

              }

            }

          }

        }, 180);

      };

      // Events: paste, input, change, blur

      if (!input._hasWebListener) {

        input._hasWebListener = true;

        input.addEventListener('paste', (e) => {

          const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';

          setBadgeState(badge, 'checking');

          setTimeout(() => {

            runCheck(input.value || pasted, true);

          }, 30);

        });

        input.addEventListener('input', () => {

          runCheck(input.value, false);

        });

        input.addEventListener('change', () => {

          runCheck(input.value, true);

        });

        input.addEventListener('blur', () => {

          runCheck(input.value, true);

        });

      }

      // Save button
      if (saveBtn && !saveBtn._hasWebListener) {
        saveBtn._hasWebListener = true;
        saveBtn.addEventListener('click', () => {
          saveWebConfigItem(item, true);
        });
      }

      // Open button
      if (btn && !btn._hasWebListener) {
        btn._hasWebListener = true;
        btn.addEventListener('click', () => {
          let url = input.value.trim();
          if (!url) {
            url = item.defaultOpen;
          }
          if (!url) {
            if (typeof window.showToast === 'function') {
              window.showToast('Please enter your ' + item.label + ' URL first');
            }
            input.focus();
            return;
          }
          if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
          }
          window.open(url, '_blank', 'noopener,noreferrer');
        });
      }

    }); // end webConfigs.forEach

    function saveWebConfigItem(item, showSuccessToast) {
      const input = document.getElementById(item.id);
      const badge = document.getElementById(item.badgeId);
      const saveBtn = document.getElementById(item.saveBtnId);
      if (!input) return false;
      const rawVal = input.value.trim();
      if (!rawVal) {
        setBadgeState(badge, 'empty');
        localStorage.removeItem(item.key);
        if (window.projectConfig) {
          window.projectConfig[item.configKey] = '';
          if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
        }
        if (showSuccessToast && typeof window.showToast === 'function') {
          window.showToast('Cleared ' + item.label + ' link');
        }
        return true;
      }
      const result = validateWebUrl(item.type, rawVal);
      setBadgeState(badge, result.status);
      if (result.status === 'valid') {
        const finalVal = result.normalized;
        input.value = finalVal;
        localStorage.setItem(item.key, finalVal);
        if (window.projectConfig) {
          window.projectConfig[item.configKey] = finalVal;
          if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
        }
        if (item.type === 'github' && result.owner && result.repo) {
          const cloudRepoInput = document.getElementById('setting-github-repo');
          const repoIdentifier = result.owner + '/' + result.repo;
          if (cloudRepoInput && (!cloudRepoInput.value || cloudRepoInput.value.trim() === '')) {
            cloudRepoInput.value = repoIdentifier;
            localStorage.setItem('cedar_github_repo', repoIdentifier);
          }
        }
        if (saveBtn) {
          saveBtn.classList.add('saved');
          const origHtml = saveBtn.innerHTML;
          saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Saved</span>';
          setTimeout(() => {
            saveBtn.classList.remove('saved');
            saveBtn.innerHTML = origHtml;
          }, 1400);
        }
        if (showSuccessToast && typeof window.showToast === 'function') {
          window.showToast('Saved ' + item.label + ' link!');
        }
        return true;
      } else {
        if (typeof window.showToast === 'function') {
          window.showToast('Please enter a valid ' + item.label + ' URL');
        }
        input.focus();
        return false;
      }
    }

    // Quick Links Edit Mode & Cancel/Save Button Combo
    let origQuickLinkValues = {};

    function enterQuickLinksEditMode() {
      const quickLinksBar = document.getElementById('quick-links-compact-bar');
      const quickLinksEditView = document.getElementById('quick-links-edit-view');
      const btnToggle = document.getElementById('btn-toggle-quick-links-edit');
      const editActions = document.getElementById('quick-links-edit-actions');

      origQuickLinkValues = {};
      webConfigs.forEach(item => {
        const inp = document.getElementById(item.id);
        if (inp) origQuickLinkValues[item.id] = inp.value;
      });

      if (quickLinksBar) quickLinksBar.style.display = 'none';
      if (quickLinksEditView) quickLinksEditView.style.display = 'block';
      if (btnToggle) btnToggle.style.display = 'none';
      if (editActions) editActions.style.display = 'inline-flex';
    }

    function cancelQuickLinksEditMode() {
      const quickLinksBar = document.getElementById('quick-links-compact-bar');
      const quickLinksEditView = document.getElementById('quick-links-edit-view');
      const btnToggle = document.getElementById('btn-toggle-quick-links-edit');
      const editActions = document.getElementById('quick-links-edit-actions');

      webConfigs.forEach(item => {
        const inp = document.getElementById(item.id);
        if (inp && origQuickLinkValues[item.id] !== undefined) {
          inp.value = origQuickLinkValues[item.id];
          const rawVal = inp.value.trim();
          const badge = document.getElementById(item.badgeId);
          if (!rawVal) setBadgeState(badge, 'empty');
          else {
            const res = validateWebUrl(item.type, rawVal);
            setBadgeState(badge, res.status);
          }
        }
      });

      if (quickLinksEditView) quickLinksEditView.style.display = 'none';
      if (quickLinksBar) quickLinksBar.style.display = '';
      if (editActions) editActions.style.display = 'none';
      if (btnToggle) btnToggle.style.display = '';
    }

    function saveQuickLinksEditMode() {
      const quickLinksBar = document.getElementById('quick-links-compact-bar');
      const quickLinksEditView = document.getElementById('quick-links-edit-view');
      const btnToggle = document.getElementById('btn-toggle-quick-links-edit');
      const editActions = document.getElementById('quick-links-edit-actions');

      let allValid = true;
      webConfigs.forEach(item => {
        const ok = saveWebConfigItem(item, false);
        if (!ok) allValid = false;
      });

      if (allValid) {
        if (quickLinksEditView) quickLinksEditView.style.display = 'none';
        if (quickLinksBar) quickLinksBar.style.display = '';
        if (editActions) editActions.style.display = 'none';
        if (btnToggle) btnToggle.style.display = '';
        if (typeof window.showToast === 'function') {
          window.showToast('Quick links saved!');
        }
      }
    }

    window.enterQuickLinksEditMode = enterQuickLinksEditMode;
    window.cancelQuickLinksEditMode = cancelQuickLinksEditMode;
    window.saveQuickLinksEditMode = saveQuickLinksEditMode;

    const btnToggleQuickLinks = document.getElementById('btn-toggle-quick-links-edit');
    const btnQuickLinksCancel = document.getElementById('btn-quick-links-cancel');
    const btnQuickLinksSave = document.getElementById('btn-quick-links-save');

    if (btnToggleQuickLinks && !btnToggleQuickLinks._hasToggleListener) {
      btnToggleQuickLinks._hasToggleListener = true;
      btnToggleQuickLinks.addEventListener('click', (e) => {
        e.preventDefault();
        enterQuickLinksEditMode();
      });
    }

    if (btnQuickLinksCancel && !btnQuickLinksCancel._hasCancelListener) {
      btnQuickLinksCancel._hasCancelListener = true;
      btnQuickLinksCancel.addEventListener('click', (e) => {
        e.preventDefault();
        cancelQuickLinksEditMode();
      });
    }

    if (btnQuickLinksSave && !btnQuickLinksSave._hasSaveListener) {
      btnQuickLinksSave._hasSaveListener = true;
      btnQuickLinksSave.addEventListener('click', (e) => {
        e.preventDefault();
        saveQuickLinksEditMode();
      });
    }
  }

  // Delegated document listeners for quick links buttons
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const btnEdit = e.target.closest('#btn-toggle-quick-links-edit');
      if (btnEdit && !btnEdit._hasToggleListener) {
        e.preventDefault();
        if (typeof window.enterQuickLinksEditMode === 'function') window.enterQuickLinksEditMode();
        return;
      }
      const btnCancel = e.target.closest('#btn-quick-links-cancel');
      if (btnCancel && !btnCancel._hasCancelListener) {
        e.preventDefault();
        if (typeof window.cancelQuickLinksEditMode === 'function') window.cancelQuickLinksEditMode();
        return;
      }
      const btnSave = e.target.closest('#btn-quick-links-save');
      if (btnSave && !btnSave._hasSaveListener) {
        e.preventDefault();
        if (typeof window.saveQuickLinksEditMode === 'function') window.saveQuickLinksEditMode();
        return;
      }
    });
  }

  window.initExportWebLinks = initExportWebLinks;

  // =========================================================================

  // VAULT & HARD DRIVE SYNC INTEGRATION (Existing Post Loaders)

  // =========================================================================

  async function populateVaultImportItems() {

    const sec = document.getElementById('vault-import-section');

    const list = document.getElementById('vault-import-items-list');

    const countEl = document.getElementById('vault-import-count');

    if (!sec || !list) return;

    if (!window.SheeshVault || !window.SheeshVault.isConnected()) {

      sec.style.display = 'none';

      return;

    }

    sec.style.display = 'block';

    list.innerHTML = '<div style="color: #a1a1aa; font-size: 0.8rem; padding: 0.25rem;">Scanning Hard Drive Storage...</div>';

    try {

      const collectedItems = [];

      for (const baseRoot of ['blog', 'pages']) {

        const statuses = baseRoot === 'pages' ? ['published', 'hidden'] : ['published', 'drafts', 'hidden'];

        for (const statusSub of statuses) {

          const tierPath = `${baseRoot}/${statusSub}`;

          const entries = await window.SheeshVault.listFiles(tierPath, false);

          if (Array.isArray(entries)) {

            entries.forEach(e => {

              if (e.kind === 'directory') {

                collectedItems.push({

                  name: e.name,

                  baseDir: tierPath,

                  label: `${e.name} (${baseRoot}/${statusSub})`

                });

              }

            });

          }

        }

      }

      if (collectedItems.length === 0) {

        let postEntries = await window.SheeshVault.listFiles('blog', false);

        let postFolders = (postEntries || []).filter(e => e.kind === 'directory' && !['drafts', 'published', 'hidden', 'images', 'media'].includes(e.name));

        postFolders.forEach(f => collectedItems.push({ name: f.name, baseDir: 'blog', label: f.name }));

      }

      if (collectedItems.length === 0) {

        list.innerHTML = '<div style="color: #71717a; font-size: 0.8rem; padding: 0.25rem;">No items found in blog/ or pages/ on your drive yet.</div>';

        if (countEl) countEl.textContent = '0 items';

        return;

      }

      if (countEl) countEl.textContent = `${collectedItems.length} item(s)`;

      list.innerHTML = '';

      for (const folder of collectedItems) {

        const itemBtn = document.createElement('button');

        itemBtn.type = 'button';

        itemBtn.className = 'vault-import-item-btn';

        itemBtn.innerHTML = `

          <span>📄 <strong>${escapeHtml(folder.label || folder.name)}</strong></span>

          <span style="color: #34d399; font-size: 0.75rem;">Load &rarr;</span>

        `;

        itemBtn.addEventListener('click', async () => {

          try {

            let draftData = await window.SheeshVault.readFile(`${folder.baseDir}/${folder.name}/draft.json`, 'json');

            if (!draftData) {

              const htmlContent = await window.SheeshVault.readFile(`${folder.baseDir}/${folder.name}/index.html`, 'text');

              if (htmlContent && typeof window.importContent === 'function') {

                draftData = window.importContent(htmlContent);

              }

            }

            if (draftData) {

              if (!draftData.id) draftData.id = 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

              if (draftData.type === 'page') draftData.status = 'published';

              window.drafts.unshift(draftData);

              window.currentDraft = draftData;

              if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();

              if (typeof window.openPostInEditor === 'function') window.openPostInEditor(draftData);

              if (typeof window.showToast === 'function') {

                window.showToast(`Loaded "${draftData.title || folder.name}" from your Hard Drive Storage!`);

              }

            } else {

              alert('Could not read post data from folder: ' + folder.name);

            }

          } catch (err) {

            alert('Failed to load post from storage: ' + err.message);

          }

        });

        list.appendChild(itemBtn);

      }

    } catch (err) {

      list.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem;">Could not list storage posts: ${escapeHtml(err.message)}</div>`;

    }

  }

  async function saveCurrentPostToVault() {

    if (!window.currentDraft) {

      if (typeof window.showToast === 'function') window.showToast('No active post to save.');

      return;

    }

    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();

    if (!window.SheeshVault) {

      alert('Storage engine is not initialized.');

      return;

    }

    if (!window.SheeshVault.isConnected()) {

      try {

        await pointToLocalInstance('initial');

      } catch (e) {

        return;

      }

    }

    if (!window.SheeshVault.isConnected()) return;

    const btn = document.getElementById('btn-save-to-vault');

    if (btn) {

      btn.disabled = true;

      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg><span>Writing to Drive...</span>`;

    }

    try {

      const isPage = window.currentDraft.type === 'page';

      if (isPage) window.currentDraft.status = 'published';

      const baseRoot = isPage ? 'pages' : 'blog';

      const isHidden = Boolean(window.currentDraft.hidden || window.currentDraft.retired);

      const isPublished = isPage ? !isHidden : (!isHidden && (window.currentDraft.status === 'published'));

      const statusSubfolder = isHidden ? 'hidden' : (isPublished ? 'published' : 'drafts');

      const slug = window.currentDraft.slug || (typeof window.generateSlug === 'function' ? window.generateSlug(window.currentDraft.title) : 'item') || (isPage ? 'untitled-page' : 'untitled-post');

      const folder = `${baseRoot}/${statusSubfolder}/${slug}`;

      const isOverrideProtected = Boolean(window.projectConfig?.layoutOverride || window.currentDraft.layoutOverride);

      const html = (typeof window.generateFullHtml === 'function') ? window.generateFullHtml(window.currentDraft) : (window.currentDraft.proseHtml || '');

      const jsonDraft = JSON.stringify(window.currentDraft, null, 2);

      // Remove stale status folders for this slug

      const validStatuses = isPage ? ['published', 'hidden'] : ['drafts', 'published', 'hidden'];

      for (const st of validStatuses) {

        if (st !== statusSubfolder) {

          await window.SheeshVault.deleteFile(`${baseRoot}/${st}/${slug}`);

        }

      }

      const mdWithFrontmatter = isPage ? `---

title: "${(window.currentDraft.title || '').replace(/"/g, '\\"')}"

slug: "${slug}"

type: "page"

updatedAt: "${new Date(window.currentDraft.updatedAt || Date.now()).toISOString()}"

---

${window.currentDraft.markdown || ''}` : ((typeof window.generateMarkdownWithFrontmatter === 'function') ? window.generateMarkdownWithFrontmatter(window.currentDraft) : (window.currentDraft.markdown || ''));

      // 1. Write index.md, index.html (for published items, unless protected by Layout Override), and draft.json inside the bundle

      await window.SheeshVault.writeFile(`${folder}/index.md`, mdWithFrontmatter);

      if (isPublished) {

        let skipHtml = false;

        if (isOverrideProtected && !window.currentDraft.customHtml) {

          try {

            const existingHtml = await window.SheeshVault.readFile(`${folder}/index.html`, 'text');

            if (existingHtml && existingHtml.trim()) skipHtml = true;

          } catch (e) {}

        }

        if (!skipHtml) {

          await window.SheeshVault.writeFile(`${folder}/index.html`, html);

        }

      }

      await window.SheeshVault.writeFile(`${folder}/draft.json`, jsonDraft);

      // 2. Write post/page images directly inside this item's folder

      const images = (window.currentDraft && window.currentDraft.images) ? window.currentDraft.images : [];

      for (const img of images) {

        if (img.blob && img.filename) {

          await window.SheeshVault.writeFile(`${folder}/${img.filename}`, img.blob);

        }

      }

      // 3. Write config.json

      const configData = {

        name: window.projectConfig.name,

        description: window.projectConfig.description || 'Drop-in Blog Engine',

        baseUrl: window.projectConfig.baseUrl,

        defaultAuthor: window.projectConfig.defaultAuthor,

        categories: window.projectConfig.categories,

        layoutOverride: Boolean(window.projectConfig.layoutOverride),

        design: window.projectConfig.design || null,

        lastUpdated: new Date().toISOString()

      };

      if (typeof window.saveProjectToStorage === 'function') {
        window.saveProjectToStorage();
      } else {
        await window.SheeshVault.writeFile('config.json', JSON.stringify(configData, null, 2));
      }

      // 4. Write active drafts working state to editor/drafts.json (and mirror to writer/drafts.json)

      await window.SheeshVault.writeFile('editor/drafts.json', window.drafts);

      try { await window.SheeshVault.writeFile('writer/drafts.json', window.drafts); } catch (e) {}

      if (typeof window.showToast === 'function') {

        window.showToast(`Saved complete ${isPage ? 'page' : 'post'} package to ${folder}/!`);

      }

      if (typeof window.updateSaveStatus === 'function') {

        window.updateSaveStatus(true, `Saved to ${window.SheeshVault.getFolderName()}`);

      }

    } catch (err) {

      console.error('[Cedar] Save to vault failed:', err);

      alert('Failed to save to Hard Drive Storage: ' + err.message);

    } finally {

      if (btn) {

        btn.disabled = false;

        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Save to Storage</span>`;

      }

    }

  }

  // =========================================================================

  // INITIALIZATION & EVENT BINDINGS

  // =========================================================================

  function setupVaultIntegration() {

    // Save button in editor

    const btnSaveVault = document.getElementById('btn-save-to-vault');

    if (btnSaveVault) {

      btnSaveVault.addEventListener('click', saveCurrentPostToVault);

    }

    // Export Pane: Browse Local Folder

    const btnExportBrowse = document.getElementById('btn-export-browse-folder');

    if (btnExportBrowse) {

      btnExportBrowse.addEventListener('click', async () => {

        localStorage.removeItem('cedar_vault_disconnected');

        const isConnected = Boolean((window.SheeshVault && window.SheeshVault.isConnected()) || (localStorage.getItem('cedar_vault_connected') || localStorage.getItem('outpost_vault_connected')) === '1' || (localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')));

        await pointToLocalInstance(isConnected ? 'change' : 'initial');

      });

    }

    // Export Pane: Point to Local Blog

    const btnExportPoint = document.getElementById('btn-export-point-folder');

    if (btnExportPoint) {

      btnExportPoint.addEventListener('click', () => pointToLocalInstance('initial'));

    }

    // Export Pane: Change Local Folder

    const btnExportChange = document.getElementById('btn-export-change-folder');

    if (btnExportChange) {

      btnExportChange.addEventListener('click', () => pointToLocalInstance('change'));

    }

    // Export Pane: Remove Local Storage

    const btnExportRemove = document.getElementById('btn-export-remove-folder');

    if (btnExportRemove) {

      btnExportRemove.addEventListener('click', removeLocalStorage);

    }

    // Export Pane: Copy Path

    const btnCopyPath = document.getElementById('btn-copy-export-path');

    if (btnCopyPath) {

      btnCopyPath.addEventListener('click', async () => {

        const pathInput = document.getElementById('export-vault-path-input');

        const textToCopy = pathInput ? pathInput.value : '';

        if (textToCopy && !textToCopy.startsWith('In-Browser')) {

          try {

            await navigator.clipboard.writeText(textToCopy);

            if (typeof window.showToast === 'function') window.showToast('Path copied to clipboard!');

          } catch (e) {

            alert(textToCopy);

          }

        } else {

          if (typeof window.showToast === 'function') window.showToast('No active local folder linked.');

        }

      });

    }

    // Export Pane: Explorer

    const btnExportExplorer = document.getElementById('btn-export-open-explorer');

    if (btnExportExplorer) {

      btnExportExplorer.addEventListener('click', async () => {

        const pathInput = document.getElementById('export-vault-path-input');

        const textVal = pathInput ? pathInput.value : '';

        const folderName = (window.SheeshVault && window.SheeshVault.getFolderName()) || '';

        const savedPath = textVal && !textVal.startsWith('In-Browser') ? textVal : ((localStorage.getItem('cedar_vault_path') || localStorage.getItem('outpost_vault_path')) || (window.projectConfig && window.projectConfig.vaultPath) || '');

        try {

          const res = isLocalServer() ? await fetch('/api/open-vault-explorer', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ folderName, savedPath })

          }) : { ok: false };

          if (res.ok) {

            if (typeof window.showToast === 'function') window.showToast('Opened folder in Windows Explorer');

            return;

          }

        } catch (e) {}

        alert(savedPath ? `Storage folder: ${savedPath}` : 'No active local folder connected.');

      });

    }

    // Export Pane: Universal Export & Import

        const btnWebZip = document.getElementById('btn-export-web-zip');
    if (btnWebZip && !btnWebZip._hasWebZipListener) {
      btnWebZip._hasWebZipListener = true;
      btnWebZip.addEventListener('click', () => {
        if (typeof window.exportWebProductionZip === 'function') {
          window.exportWebProductionZip();
        } else if (typeof window.showToast === 'function') {
          window.showToast('Web export engine initializing...');
        }
      });
    }

    const btnExportZip = document.getElementById('btn-download-master-zip');

    if (btnExportZip && !btnExportZip._hasExportListener) {

      btnExportZip._hasExportListener = true;

      btnExportZip.addEventListener('click', exportBlogAsZip);

    }

    const btnExportSidebarAction = document.getElementById('btn-export-sidebar-action');

    if (btnExportSidebarAction && !btnExportSidebarAction._hasExportListener) {

      btnExportSidebarAction._hasExportListener = true;

      // Handled by github-sync.js (delegates to #btn-github-push)

    }

    if (typeof window.updateExportBackButton === 'function') {

      window.updateExportBackButton();

    }

    if (typeof window.initGitHubSyncUI === 'function') {
      window.initGitHubSyncUI();
    } else if (window.Cedar && window.Cedar.githubSync && typeof window.Cedar.githubSync.initSyncUI === 'function') {
      window.Cedar.githubSync.initSyncUI();
    }

    // Export Pane: TOC Sidebar Navigation

    const paneExport = document.getElementById('pane-export');

    if (paneExport) {

      const exportTocLinks = paneExport.querySelectorAll('.settings-toc-link');

      const container = document.querySelector('.dash-main-content');

      let isProgrammaticScroll = false;

      let programmaticScrollTimer = null;

      exportTocLinks.forEach(link => {

        if (link._hasExportTocListener) return;

        link._hasExportTocListener = true;

        link.addEventListener('click', (e) => {

          e.preventDefault();

          e.stopPropagation();

          const targetId = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');

          const targetEl = document.getElementById(targetId);

          if (targetEl) {

            exportTocLinks.forEach(l => l.classList.toggle('active', l === link));

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

      // ScrollSpy for Export TOC

      if (container && !container._hasExportScrollSpy) {

        container._hasExportScrollSpy = true;

        container.addEventListener('scroll', () => {

          if (isProgrammaticScroll) return;

          if (paneExport.style.display === 'none' || !paneExport.classList.contains('active')) return;

          const sections = [
            { id: 'export-sec-local', el: document.getElementById('export-sec-local') },
            { id: 'export-sec-github-sync', el: document.getElementById('export-sec-github-sync') },
            { id: 'export-sec-web', el: document.getElementById('export-sec-web') },
            { id: 'export-sec-links', el: document.getElementById('export-sec-links') },
            { id: 'export-sec-danger', el: document.getElementById('export-sec-danger') }
          ].filter(s => s.el);

          const cRect = container.getBoundingClientRect();

          let activeId = 'export-sec-local';

          for (let i = 0; i < sections.length; i++) {

            const s = sections[i];

            const tRect = s.el.getBoundingClientRect();

            if (tRect.top - cRect.top <= 140) {

              activeId = s.id;

            }

          }

          exportTocLinks.forEach(link => {

            const tid = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');

            link.classList.toggle('active', tid === activeId);

          });

        }, { passive: true });

      }

    }

    initExportWebLinks();

    const inputPaneImportZip = document.getElementById('input-pane-import-zip');

    if (inputPaneImportZip) {

      inputPaneImportZip.addEventListener('change', (e) => {

        const file = e.target.files[0];

        if (file) {

          importBlogFromZip(file);

          inputPaneImportZip.value = '';

        }

      });

    }

    // Settings Pane: Connect / Change Vault

    const btnSettingsConnect = document.getElementById('btn-settings-connect-vault');

    if (btnSettingsConnect) {

      btnSettingsConnect.addEventListener('click', () => {

        const isConnected = Boolean(window.SheeshVault && window.SheeshVault.isConnected());

        pointToLocalInstance(isConnected ? 'change' : 'initial');

      });

    }

    // Settings Pane: Remove Vault

    const btnSettingsRemove = document.getElementById('btn-settings-remove-vault');

    if (btnSettingsRemove) {

      btnSettingsRemove.addEventListener('click', removeLocalStorage);

    }

    // Modal 1 Bindings: Turn Into Blog

    const btnTurnYes = document.getElementById('btn-sync-turn-yes');

    if (btnTurnYes) btnTurnYes.addEventListener('click', handleTurnIntoBlogYes);

    const btnTurnNo = document.getElementById('btn-sync-turn-no');

    if (btnTurnNo) btnTurnNo.addEventListener('click', handleTurnIntoBlogNo);

    // Modal 2 Bindings: Browser Data

    const cardBackup = document.getElementById('choice-browser-backup');

    const cardRemove = document.getElementById('choice-browser-remove');

    if (cardBackup) {

      cardBackup.addEventListener('click', () => {

        selectedBrowserDataChoice = 'backup';

        cardBackup.classList.add('active');

        if (cardRemove) cardRemove.classList.remove('active');

      });

    }

    if (cardRemove) {

      cardRemove.addEventListener('click', () => {

        selectedBrowserDataChoice = 'remove';

        cardRemove.classList.add('active');

        if (cardBackup) cardBackup.classList.remove('active');

      });

    }

    const btnBrowserConfirm = document.getElementById('btn-sync-browser-confirm');

    if (btnBrowserConfirm) btnBrowserConfirm.addEventListener('click', handleBrowserDataConfirm);

    // Modal 3 Bindings: Carry Over

    const choiceMove = document.getElementById('choice-carry-move');

    const choiceCopy = document.getElementById('choice-carry-copy');

    const choiceNo = document.getElementById('choice-carry-no');

    if (choiceMove) {

      choiceMove.addEventListener('click', () => {

        selectedCarryChoice = 'move';

        choiceMove.classList.add('active');

        if (choiceCopy) choiceCopy.classList.remove('active');

        if (choiceNo) choiceNo.classList.remove('active');

      });

    }

    if (choiceCopy) {

      choiceCopy.addEventListener('click', () => {

        selectedCarryChoice = 'copy';

        choiceCopy.classList.add('active');

        if (choiceMove) choiceMove.classList.remove('active');

        if (choiceNo) choiceNo.classList.remove('active');

      });

    }

    if (choiceNo) {

      choiceNo.addEventListener('click', () => {

        selectedCarryChoice = 'no';

        choiceNo.classList.add('active');

        if (choiceMove) choiceMove.classList.remove('active');

        if (choiceCopy) choiceCopy.classList.remove('active');

      });

    }

    const btnCarryConfirm = document.getElementById('btn-sync-carry-confirm');

    if (btnCarryConfirm) btnCarryConfirm.addEventListener('click', handleCarryOverConfirm);

    // Modal 4 Bindings: Existing Cedar Folder Detected

    const btnExistingExport = document.getElementById('btn-sync-existing-save-export');

    if (btnExistingExport) btnExistingExport.addEventListener('click', handleExistingSaveAndExport);

    const btnExistingNoSave = document.getElementById('btn-sync-existing-no-save');

    if (btnExistingNoSave) btnExistingNoSave.addEventListener('click', handleExistingChangeWithoutSaving);

    const btnExistingDontChange = document.getElementById('btn-sync-existing-dont-change');

    if (btnExistingDontChange) btnExistingDontChange.addEventListener('click', handleExistingDontChange);

    // Modal 5 Bindings: Remove Confirmation

    const btnRemoveConfirm = document.getElementById('btn-sync-remove-do-disconnect');

    if (btnRemoveConfirm) btnRemoveConfirm.addEventListener('click', handleConfirmRemoveLocalStorage);

    // Modal 6 Bindings: Firefox & Server Bridge Folder Picker

    const btnBridgeBrowse = document.getElementById('btn-sync-bridge-browse');

    if (btnBridgeBrowse) {

      btnBridgeBrowse.addEventListener('click', async () => {

        const inputPath = document.getElementById('input-sync-bridge-path');

        const feedback = document.getElementById('sync-bridge-feedback');

        btnBridgeBrowse.disabled = true;

        const prevText = btnBridgeBrowse.innerHTML;

        btnBridgeBrowse.innerHTML = '<span>Selecting...</span>';

        try {

          const res = isLocalServer() ? await fetch('/api/browse-folder') : { ok: false };

          if (res.ok) {

            const data = await res.json();

            if (data.success && data.path) {

              if (inputPath) inputPath.value = data.path;

              if (feedback) feedback.style.display = 'none';

            }

          }

        } catch (e) {

          console.warn('[VaultSync] Browse error:', e);

        } finally {

          btnBridgeBrowse.disabled = false;

          btnBridgeBrowse.innerHTML = prevText;

        }

      });

    }

    const btnBridgeUseCurrent = document.getElementById('btn-sync-bridge-use-current');

    if (btnBridgeUseCurrent) {

      btnBridgeUseCurrent.addEventListener('click', () => {

        const inputPath = document.getElementById('input-sync-bridge-path');

        const quickPickSpan = document.getElementById('label-sync-bridge-current-path');

        const targetPath = (quickPickSpan && quickPickSpan.dataset.path) || (quickPickSpan ? quickPickSpan.textContent.replace(/.*?\((.*)\)/, '$1') : '');

        if (inputPath && targetPath) {

          inputPath.value = targetPath;

        }

      });

    }

    const btnBridgeContinue = document.getElementById('btn-sync-bridge-continue');

    if (btnBridgeContinue) {

      btnBridgeContinue.addEventListener('click', async () => {

        const inputPath = document.getElementById('input-sync-bridge-path');

        const feedback = document.getElementById('sync-bridge-feedback');

        const rawPath = inputPath ? inputPath.value.trim() : '';

        if (!rawPath) {

          if (feedback) {

            feedback.textContent = 'Please enter or select a folder path on your computer.';

            feedback.style.display = 'block';

          }

          return;

        }

        btnBridgeContinue.disabled = true;

        try {

          const res = isLocalServer() ? await fetch(`/api/check-folder?path=${encodeURIComponent(rawPath)}`) : { ok: false };

          if (!res.ok) {

            throw new Error('Server returned an error checking folder.');

          }

          const checkData = await res.json();

          if (!checkData.exists) {

            if (feedback) {

              feedback.textContent = `Folder does not exist: "${rawPath}". Please check the path or create the folder first.`;

              feedback.style.display = 'block';

            }

            btnBridgeContinue.disabled = false;

            return;

          }

          // Close bridge picker modal

          const modal = document.getElementById('modal-sync-bridge-picker');

          if (modal) modal.style.display = 'none';

          // Create server bridge handle

          const bridgeHandle = window.SheeshVault.createServerBridgeHandle(checkData.path, checkData.name);

          pendingDirHandle = bridgeHandle;

          // 1. Existing Cedar folder check

          if (checkData.isOutpost) {

            showExistingCedarModal(bridgeHandle);

            return;

          }

          // 2. Change folder check

          if (pendingMode === 'change' || (window.SheeshVault.isConnected() && window.SheeshVault.getRootHandle())) {

            showCarryOverModal(bridgeHandle);

            return;

          }

          // 3. Initial connection prompt

          showTurnIntoBlogModal(bridgeHandle);

        } catch (err) {

          if (feedback) {

            feedback.textContent = `Error verifying folder: ${err.message}`;

            feedback.style.display = 'block';

          }

        } finally {

          btnBridgeContinue.disabled = false;

        }

      });

    }

    // Event bus listeners

    if (window.SheeshVault) {

      window.SheeshVault.on('connected', (data) => {

        if (typeof window.updateSaveStatus === 'function') {

          window.updateSaveStatus(true, `Saved to ${data.name || 'Vault'}`);

        }

        populateVaultImportItems();

        updateSyncStatusUI();

      });

      window.SheeshVault.on('disconnected', () => {

        if (typeof window.updateSaveStatus === 'function') {

          window.updateSaveStatus(true, 'Saved');

        }

        const sec = document.getElementById('vault-import-section');

        if (sec) sec.style.display = 'none';

        updateSyncStatusUI();

      });

    }

    window.addEventListener('sheesh-vault-status-changed', updateSyncStatusUI);

    // Run initial UI sync

    updateSyncStatusUI();

  }

  // Auto-init on DOMContentLoaded or immediate

  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', setupVaultIntegration);

  } else {

    setupVaultIntegration();

  }

  // Export to global scope

  window.populateVaultImportItems = populateVaultImportItems;

  window.saveCurrentPostToVault = saveCurrentPostToVault;

  window.setupVaultIntegration = setupVaultIntegration;

  window.exportBlogAsZip = exportBlogAsZip;

  window.importBlogFromZip = importBlogFromZip;

  window.openServerBridgeModal = openServerBridgeModal;

  window.initExportWebLinks = initExportWebLinks;

  const cedarVaultSyncExports = {

    pointToLocalInstance,

    openServerBridgeModal,

    removeLocalStorage,

    saveBrowserBackupSnapshot,

    restoreBrowserBackupSnapshot,

    removeBrowserDataForGood,

    exportBlogAsZip,

    importBlogFromZip,

    updateSyncStatusUI,

    initExportWebLinks,

    populateVaultImportItems,

    saveCurrentPostToVault,

    setupVaultIntegration,

    showExistingCedarModal,

    showExistingOutpostModal: showExistingCedarModal

  };

  window.Cedar.vaultSync = cedarVaultSyncExports;

  window.Outpost.vaultSync = cedarVaultSyncExports;

})();

