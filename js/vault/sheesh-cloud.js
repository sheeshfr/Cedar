/**
 * sheesh.gg — Unified Cloud Account, Invite System & Atomic Sync Engine
 * Supports:
 * - Invite-Only Account Creation & First-Run Admin Bootstrap
 * - Strictly 3-Word Memorable Passphrase Roller (Zero Password Reuse / Zero Emails)
 * - Public / Deep Freeze Library PC Session-Only Mode (sessionStorage) vs Persistent Device Mode
 * - Admin Cockpit: Invite Link Generator, Circle Member Roster, Role Badges, Passphrase Reset & Bug Inbox
 * - Granular Atomic State Sync (2KB post/config deltas in milliseconds)
 */
(function () {
  'use strict';

  const DEFAULT_API_BASE = 'https://api.sheesh.gg';
  const STORAGE_KEY_API = 'sheesh_api_base_url';
  const STORAGE_KEY_TOKEN_PERSIST = 'sheesh_auth_token';
  const STORAGE_KEY_TOKEN_SESSION = 'sheesh_auth_token_session';
  const STORAGE_KEY_AUTOSYNC = 'sheesh_cloud_autosync';
  const STORAGE_KEY_LAST_SYNC = 'sheesh_cloud_last_sync';

  // Curated vivid, easy-to-spell, memorable words for the 3-Word Passphrase Roller
  const WORD_LIST_A = [
    'velvet', 'cosmic', 'lunar', 'golden', 'crimson', 'amber', 'cobalt', 'silver',
    'emerald', 'rustic', 'neon', 'silent', 'vivid', 'frosty', 'sunny', 'misty',
    'breezy', 'clever', 'gentle', 'mighty', 'rapid', 'steady', 'copper', 'marble',
    'scarlet', 'violet', 'indigo', 'coral', 'jade', 'obsidian', 'crystal', 'autumn'
  ];

  const WORD_LIST_B = [
    'waffle', 'falcon', 'cactus', 'pretzel', 'badger', 'comet', 'lantern', 'harbor',
    'meadow', 'compass', 'glacier', 'canyon', 'pebble', 'acorn', 'bison', 'otter',
    'panda', 'kettle', 'anchor', 'beacon', 'fiddle', 'goblin', 'hammock', 'iguana',
    'jacket', 'koala', 'lemon', 'muffin', 'nutmeg', 'orchard', 'penguin', 'quartz'
  ];

  let currentUser = null;
  let isPersistentSession = true;
  let needsBootstrap = false;
  let pendingInviteCode = '';
  let syncDebounceTimer = null;
  let isPullingFromCloud = false;
  let lastSyncedFingerprints = new Map();

  function getApiBase() {
    try {
      const custom = localStorage.getItem(STORAGE_KEY_API);
      if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '');
    } catch (_) {}
    return DEFAULT_API_BASE;
  }

  function getStoredToken() {
    try {
      const sessionTok = sessionStorage.getItem(STORAGE_KEY_TOKEN_SESSION);
      if (sessionTok) {
        isPersistentSession = false;
        return sessionTok;
      }
      const persistTok = localStorage.getItem(STORAGE_KEY_TOKEN_PERSIST);
      if (persistTok) {
        isPersistentSession = true;
        return persistTok;
      }
    } catch (_) {}
    return null;
  }

  function storeToken(token, persistent) {
    isPersistentSession = Boolean(persistent);
    try {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN_SESSION);
      localStorage.removeItem(STORAGE_KEY_TOKEN_PERSIST);
      if (!token) return;
      if (persistent) {
        localStorage.setItem(STORAGE_KEY_TOKEN_PERSIST, token);
      } else {
        sessionStorage.setItem(STORAGE_KEY_TOKEN_SESSION, token);
      }
    } catch (_) {}
  }

  function isAutoSyncEnabled() {
    try {
      const val = localStorage.getItem(STORAGE_KEY_AUTOSYNC);
      return val === null ? true : val === 'true';
    } catch (_) {
      return true;
    }
  }

  function rollPassphrase() {
    const arr = new Uint32Array(3);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      arr[0] = Math.floor(Math.random() * 10000);
      arr[1] = Math.floor(Math.random() * 10000);
      arr[2] = Math.floor(Math.random() * 10000);
    }
    const w1 = WORD_LIST_A[arr[0] % WORD_LIST_A.length];
    const w2 = WORD_LIST_B[arr[1] % WORD_LIST_B.length];
    const num = (arr[2] % 90) + 10; // 10..99
    return `${w1}-${w2}-${num}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'Never';
    const diffSec = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(Number(ts)).toLocaleDateString();
  }

  async function apiRequest(path, options = {}) {
    const base = getApiBase();
    const token = getStoredToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const resp = await fetch(`${base}${path}`, {
      method: options.method || 'GET',
      headers,
      credentials: 'include',
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    return data;
  }

  function showAlert(msg, isSuccess = false) {
    const el = document.getElementById('sheesh-modal-alert');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.className = 'sheesh-alert-banner' + (isSuccess ? ' is-success' : '');
    el.style.display = 'block';
  }

  function updateGlobalIndicators(syncStateText) {
    const dot = document.getElementById('sheesh-sidebar-dot');
    const dotInline = document.getElementById('sheesh-sidebar-dot-inline');
    const statusText = document.getElementById('sheesh-sidebar-status-text');
    const actionHint = document.getElementById('sheesh-sidebar-action-hint');
    const connBadge = document.getElementById('sheesh-modal-conn-badge');

    // Export pane elements
    const expDot = document.getElementById('export-sheesh-status-dot');
    const expLabel = document.getElementById('export-sheesh-status-label');
    const expOpenLabel = document.getElementById('btn-export-sheesh-open-label');
    const expSyncBtn = document.getElementById('btn-export-sheesh-sync-now');
    const expPullBtn = document.getElementById('btn-export-sheesh-pull');

    if (currentUser) {
      if (dot) dot.classList.add('is-online');
      if (dotInline) dotInline.classList.add('is-online');
      if (statusText) statusText.textContent = `@${currentUser.username}`;
      if (actionHint) actionHint.textContent = syncStateText || 'Synced';
      if (connBadge) {
        connBadge.textContent = `Connected • @${currentUser.username}`;
        connBadge.classList.add('is-online');
      }
      if (expDot) expDot.style.background = '#22c55e';
      if (expLabel) expLabel.textContent = `Connected as @${currentUser.username}`;
      if (expOpenLabel) expOpenLabel.textContent = currentUser.isAdmin ? 'Account & Admin Roster' : 'Manage Cloud Account';
      if (expSyncBtn) expSyncBtn.style.display = 'inline-flex';
      if (expPullBtn) expPullBtn.style.display = 'inline-flex';
    } else {
      if (dot) dot.classList.remove('is-online');
      if (dotInline) dotInline.classList.remove('is-online');
      if (statusText) statusText.textContent = 'Local Mode';
      if (actionHint) actionHint.textContent = 'Sign In';
      if (connBadge) {
        connBadge.textContent = 'Local Mode';
        connBadge.classList.remove('is-online');
      }
      if (expDot) expDot.style.background = '';
      if (expLabel) expLabel.textContent = 'Local Mode (Not Signed In)';
      if (expOpenLabel) expOpenLabel.textContent = 'Sign In / Claim Invite';
      if (expSyncBtn) expSyncBtn.style.display = 'none';
      if (expPullBtn) expPullBtn.style.display = 'none';
    }
  }

  function renderModalState() {
    const viewAuth = document.getElementById('sheesh-view-auth');
    const viewDash = document.getElementById('sheesh-view-dashboard');
    const endpointLabel = document.getElementById('sheesh-api-endpoint-label');
    const endpointInput = document.getElementById('sheesh-api-url-input');
    if (endpointLabel) endpointLabel.textContent = getApiBase();
    if (endpointInput) endpointInput.value = getApiBase();

    if (!currentUser) {
      if (viewAuth) viewAuth.style.display = 'block';
      if (viewDash) viewDash.style.display = 'none';

      // Configure First-Time Bootstrap vs Invite Claim UI
      const calloutTitle = document.getElementById('sheesh-register-callout-title');
      const calloutDesc = document.getElementById('sheesh-register-callout-desc');
      const inviteGroup = document.getElementById('sheesh-invite-code-group');
      const registerTabBtn = document.getElementById('sheesh-auth-tab-register');
      const submitRegLabel = document.getElementById('btn-sheesh-submit-register-label');

      if (needsBootstrap) {
        if (registerTabBtn) registerTabBtn.textContent = '👑 Setup Owner Account';
        if (calloutTitle) calloutTitle.textContent = 'First-Time Server Setup: Claim Admin Account';
        if (calloutDesc) calloutDesc.textContent = 'Your sheesh.gg database has 0 users. Create the first account now to become the permanent Owner/Admin and lock the server to invite-only.';
        if (inviteGroup) inviteGroup.style.display = 'none';
        if (submitRegLabel) submitRegLabel.textContent = 'Create Admin Account & Lock Server';
      } else {
        if (registerTabBtn) registerTabBtn.textContent = 'Have an Invite?';
        if (calloutTitle) calloutTitle.textContent = 'Claim Your sheesh.gg Invite';
        if (calloutDesc) calloutDesc.textContent = 'Pick a handle and roll a memorable 3-word passphrase. To protect your privacy, human-chosen passwords and email addresses are never used.';
        if (inviteGroup) inviteGroup.style.display = 'flex';
        if (submitRegLabel) submitRegLabel.textContent = 'Claim Invite & Sign In';
      }
      return;
    }

    // Logged-In View
    if (viewAuth) viewAuth.style.display = 'none';
    if (viewDash) viewDash.style.display = 'block';

    const avatar = document.getElementById('sheesh-user-avatar');
    const handle = document.getElementById('sheesh-user-handle');
    const sessionPill = document.getElementById('sheesh-user-session-pill');
    const rolesWrap = document.getElementById('sheesh-user-roles');
    const adminTabBtn = document.getElementById('sheesh-tab-btn-admin');
    const syncMeta = document.getElementById('sheesh-sync-meta');
    const autoSyncCheck = document.getElementById('sheesh-autosync-checkbox');

    if (avatar) avatar.textContent = (currentUser.username || 'S').charAt(0).toUpperCase();
    if (handle) handle.textContent = `@${currentUser.username}`;
    if (sessionPill) {
      sessionPill.textContent = isPersistentSession ? 'Home / Persistent Device' : 'Public PC (Tab Session Only)';
    }
    if (rolesWrap) {
      const roles = Array.isArray(currentUser.roles) ? currentUser.roles : [];
      rolesWrap.innerHTML = roles.map(r =>
        `<span class="sheesh-role-pill ${r === 'admin' ? 'is-admin' : ''}">${escapeHtml(r)}</span>`
      ).join('');
    }
    if (adminTabBtn) {
      adminTabBtn.style.display = currentUser.isAdmin ? 'inline-block' : 'none';
    }
    if (autoSyncCheck) {
      autoSyncCheck.checked = isAutoSyncEnabled();
    }
    if (syncMeta) {
      const lastSyncTs = localStorage.getItem(STORAGE_KEY_LAST_SYNC);
      syncMeta.textContent = `Last synced: ${formatRelativeTime(lastSyncTs)} · Cloud footprint: ${formatBytes(currentUser.storageBytes || 0)}`;
    }
  }

  function switchAuthMode(mode) {
    showAlert('');
    const loginTab = document.getElementById('sheesh-auth-tab-login');
    const regTab = document.getElementById('sheesh-auth-tab-register');
    const loginForm = document.getElementById('sheesh-form-login');
    const regForm = document.getElementById('sheesh-form-register');

    if (mode === 'register') {
      if (loginTab) loginTab.classList.remove('active');
      if (regTab) regTab.classList.add('active');
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'flex';
    } else {
      if (loginTab) loginTab.classList.add('active');
      if (regTab) regTab.classList.remove('active');
      if (loginForm) loginForm.style.display = 'flex';
      if (regForm) regForm.style.display = 'none';
    }
  }

  function switchDashTab(tabName) {
    showAlert('');
    document.querySelectorAll('.sheesh-dash-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-sheesh-tab') === tabName);
    });
    const syncPane = document.getElementById('sheesh-pane-sync');
    const fbPane = document.getElementById('sheesh-pane-feedback');
    const adminPane = document.getElementById('sheesh-pane-admin');
    if (syncPane) syncPane.style.display = tabName === 'sync' ? 'block' : 'none';
    if (fbPane) fbPane.style.display = tabName === 'feedback' ? 'block' : 'none';
    if (adminPane) adminPane.style.display = tabName === 'admin' ? 'block' : 'none';

    if (tabName === 'admin' && currentUser && currentUser.isAdmin) {
      loadAdminOverview();
    }
  }

  // =========================================================================
  // GRANULAR ATOMIC SYNC FOR CEDAR
  // =========================================================================

  async function pushCedarToCloud(options = {}) {
    if (!currentUser || isPullingFromCloud) return;
    const isDeltaOnly = Boolean(options.deltaOnly);
    const items = {};
    let changedCount = 0;

    // 1. Project Config
    const cfgJson = JSON.stringify(window.projectConfig || {});
    if (!isDeltaOnly || lastSyncedFingerprints.get('config:main') !== cfgJson) {
      items['config:main'] = cfgJson;
      lastSyncedFingerprints.set('config:main', cfgJson);
      changedCount++;
    }

    // 2. Individual Posts / Pages / Drafts (Atomic per-post keys)
    const draftsArr = Array.isArray(window.drafts) ? window.drafts : [];
    const currentPostKeys = new Set();
    for (const post of draftsArr) {
      if (!post || !post.id) continue;
      const key = `post:${post.id}`;
      currentPostKeys.add(key);
      const postJson = JSON.stringify(post);
      if (!isDeltaOnly || lastSyncedFingerprints.get(key) !== postJson) {
        items[key] = postJson;
        lastSyncedFingerprints.set(key, postJson);
        changedCount++;
      }
    }

    // 3. Post Index Manifest (tracks active post IDs & ordering so deleted posts are pruned)
    const indexIds = JSON.stringify(draftsArr.filter(d => d && d.id).map(d => d.id));
    if (!isDeltaOnly || lastSyncedFingerprints.get('index:posts') !== indexIds) {
      items['index:posts'] = indexIds;
      lastSyncedFingerprints.set('index:posts', indexIds);
      changedCount++;
    }

    if (changedCount === 0) return;

    try {
      updateGlobalIndicators('Saving...');
      const headline = document.getElementById('sheesh-sync-headline');
      if (headline) headline.textContent = 'Saving changes to sheesh.gg...';

      const res = await apiRequest('/sync/cedar', {
        method: 'PUT',
        body: { items }
      });

      const now = Date.now();
      localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(now));
      if (res && typeof res.storageBytes === 'number') {
        currentUser.storageBytes = res.storageBytes;
      }
      updateGlobalIndicators('Synced');
      if (headline) headline.textContent = 'All changes saved to sheesh.gg';
      const syncMeta = document.getElementById('sheesh-sync-meta');
      if (syncMeta) {
        syncMeta.textContent = `Last synced: Just now · Cloud footprint: ${formatBytes(currentUser.storageBytes || 0)}`;
      }
      if (options.showToast && typeof window.showToast === 'function') {
        window.showToast(`Synced ${changedCount} item(s) to sheesh.gg Cloud`, 'success');
      }
    } catch (err) {
      console.warn('[SheeshCloud] Push error:', err);
      updateGlobalIndicators('Sync Error');
      if (options.showToast) {
        showAlert(`Sync failed: ${err.message}`);
      }
    }
  }

  async function pullCedarFromCloud(options = {}) {
    if (!currentUser) return;
    try {
      isPullingFromCloud = true;
      updateGlobalIndicators('Loading...');
      const res = await apiRequest('/sync/cedar');
      const items = (res && res.items) ? res.items : {};
      const keys = Object.keys(items);

      if (keys.length === 0) {
        // Cloud vault is empty for this new user — push their current local blog up!
        isPullingFromCloud = false;
        await pushCedarToCloud({ deltaOnly: false });
        return;
      }

      // 1. Restore projectConfig if present
      if (items['config:main']) {
        try {
          const parsedCfg = JSON.parse(items['config:main']);
          if (parsedCfg && typeof parsedCfg === 'object') {
            window.projectConfig = Object.assign(window.projectConfig || {}, parsedCfg);
            lastSyncedFingerprints.set('config:main', items['config:main']);
          }
        } catch (_) {}
      }

      // 2. Reconstruct window.drafts from atomic post:<id> entries
      const postMap = new Map();
      for (const k of keys) {
        if (k.startsWith('post:')) {
          try {
            const p = JSON.parse(items[k]);
            if (p && p.id) {
              postMap.set(String(p.id), p);
              lastSyncedFingerprints.set(k, items[k]);
            }
          } catch (_) {}
        }
      }

      if (postMap.size > 0) {
        let orderedPosts = [];
        if (items['index:posts']) {
          try {
            const orderIds = JSON.parse(items['index:posts']);
            lastSyncedFingerprints.set('index:posts', items['index:posts']);
            if (Array.isArray(orderIds)) {
              for (const id of orderIds) {
                if (postMap.has(String(id))) {
                  orderedPosts.push(postMap.get(String(id)));
                  postMap.delete(String(id));
                }
              }
            }
          } catch (_) {}
        }
        for (const remaining of postMap.values()) {
          orderedPosts.push(remaining);
        }
        window.drafts = orderedPosts;
      }

      // Persist into local browser storage & refresh UI
      if (typeof window.saveProjectToStorage === 'function') {
        window.saveProjectToStorage({ silent: true });
      }
      if (typeof window.saveDraftsToStorage === 'function') {
        await window.saveDraftsToStorage();
      }
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
      if (typeof window.renderHomeDashboard === 'function') {
        window.renderHomeDashboard();
      }

      const now = Date.now();
      localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(now));
      updateGlobalIndicators('Synced');
      renderModalState();

      if (options.showToast && typeof window.showToast === 'function') {
        window.showToast('Pulled latest blog state from sheesh.gg Cloud', 'success');
      }
    } catch (err) {
      console.warn('[SheeshCloud] Pull error:', err);
      if (options.showToast) {
        showAlert(`Could not pull from cloud: ${err.message}`);
      }
    } finally {
      isPullingFromCloud = false;
    }
  }

  function scheduleAutoSync() {
    if (!currentUser || !isAutoSyncEnabled() || isPullingFromCloud) return;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      pushCedarToCloud({ deltaOnly: true });
    }, 900);
  }

  function hookCedarSaveFunctions() {
    if (typeof window.saveDraftsToStorage === 'function' && !window.saveDraftsToStorage._sheeshHooked) {
      const origSaveDrafts = window.saveDraftsToStorage;
      const wrappedSaveDrafts = async function (...args) {
        const res = await origSaveDrafts.apply(this, args);
        scheduleAutoSync();
        return res;
      };
      wrappedSaveDrafts._sheeshHooked = true;
      window.saveDraftsToStorage = wrappedSaveDrafts;
    }

    if (typeof window.saveProjectToStorage === 'function' && !window.saveProjectToStorage._sheeshHooked) {
      const origSaveProj = window.saveProjectToStorage;
      const wrappedSaveProj = function (...args) {
        const res = origSaveProj.apply(this, args);
        scheduleAutoSync();
        return res;
      };
      wrappedSaveProj._sheeshHooked = true;
      window.saveProjectToStorage = wrappedSaveProj;
    }
  }

  // =========================================================================
  // ADMIN COCKPIT: INVITES, ROSTER & FEEDBACK
  // =========================================================================

  async function loadAdminOverview() {
    const invitesList = document.getElementById('sheesh-admin-invites-list');
    const usersList = document.getElementById('sheesh-admin-users-list');
    const fbList = document.getElementById('sheesh-admin-feedback-list');

    try {
      const data = await apiRequest('/admin/overview');
      const invites = Array.isArray(data.invites) ? data.invites.filter(i => !i.used_by && !i.revoked) : [];
      const users = Array.isArray(data.users) ? data.users : [];
      const feedback = Array.isArray(data.feedback) ? data.feedback : [];

      const inviteBaseUrl = `${window.location.origin}/?invite=`;

      // 1. Render Pending Invites
      if (invitesList) {
        if (invites.length === 0) {
          invitesList.innerHTML = `<div class="sheesh-empty-row">No pending unclaimed invite links.</div>`;
        } else {
          invitesList.innerHTML = invites.map(inv => {
            const fullUrl = `${inviteBaseUrl}${encodeURIComponent(inv.code)}`;
            const roles = Array.isArray(inv.roles) ? inv.roles.join(', ') : '';
            return `
              <div class="sheesh-admin-row">
                <div>
                  <strong style="font-size: 0.83rem;">${escapeHtml(inv.label || 'Unnamed Invite')}</strong>
                  <div style="font-size: 0.73rem; color: var(--text-muted);">
                    <code>${escapeHtml(inv.code)}</code> &middot; Access: ${escapeHtml(roles)}
                  </div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="btn btn-sm btn-secondary" data-copy-invite="${escapeHtml(fullUrl)}" style="font-size: 0.73rem; padding: 3px 8px;">Copy URL</button>
                  <button type="button" class="btn btn-sm btn-secondary" data-revoke-invite="${escapeHtml(inv.code)}" style="font-size: 0.73rem; padding: 3px 8px; color: #f87171;">Revoke</button>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 2. Render Circle Member Roster
      if (usersList) {
        if (users.length === 0) {
          usersList.innerHTML = `<div class="sheesh-empty-row">No users yet.</div>`;
        } else {
          const allTools = ['cedar', 'loudmouth', 'zentube', 'headroom'];
          usersList.innerHTML = users.map(u => {
            const uRoles = Array.isArray(u.roles) ? u.roles : [];
            const isSelf = currentUser && u.username === currentUser.username;
            const isPaused = u.status === 'paused';
            const toolPills = allTools.map(tool => {
              const hasRole = uRoles.includes(tool);
              return `
                <button type="button" class="sheesh-role-pill" data-toggle-user-role="${escapeHtml(u.username)}" data-role="${tool}"
                  title="Click to toggle ${tool} access for @${escapeHtml(u.username)}"
                  style="cursor: pointer; opacity: ${hasRole ? '1' : '0.38'}; border-color: ${hasRole ? '#22c55e' : 'rgba(255,255,255,0.12)'}; color: ${hasRole ? '#4ade80' : 'var(--text-muted)'};">
                  ${hasRole ? '✓ ' : '+ '}${tool}
                </button>
              `;
            }).join('');

            return `
              <div class="sheesh-admin-row" style="flex-direction: column; align-items: stretch; gap: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                  <div>
                    <strong style="font-size: 0.86rem;">@${escapeHtml(u.username)}</strong>
                    ${u.label ? `<span style="font-size: 0.76rem; color: var(--text-muted);">(${escapeHtml(u.label)})</span>` : ''}
                    ${uRoles.includes('admin') ? `<span class="sheesh-role-pill is-admin" style="margin-left: 4px;">Admin</span>` : ''}
                    ${isPaused ? `<span class="sheesh-role-pill" style="color: #f87171; border-color: #f87171;">Paused</span>` : ''}
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                      Last active: ${formatRelativeTime(u.last_active_at)} &middot; Storage: ${formatBytes(u.storage_bytes || 0)}
                    </div>
                  </div>
                  <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" data-reset-user-pass="${escapeHtml(u.username)}" style="font-size: 0.72rem; padding: 3px 8px;" title="Roll a new 3-word passphrase for this user">
                      🎲 New 3-Word Passphrase
                    </button>
                    ${!isSelf ? `
                      <button type="button" class="btn btn-sm btn-secondary" data-toggle-user-status="${escapeHtml(u.username)}" data-current-status="${escapeHtml(u.status || 'active')}" style="font-size: 0.72rem; padding: 3px 8px;">
                        ${isPaused ? 'Resume' : 'Pause'}
                      </button>
                    ` : ''}
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                  <span style="font-size: 0.71rem; color: var(--text-muted); margin-right: 2px;">Tools:</span>
                  ${toolPills}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 3. Render Feedback Inbox
      if (fbList) {
        if (feedback.length === 0) {
          fbList.innerHTML = `<div class="sheesh-empty-row">No bug reports or feature requests in your inbox.</div>`;
        } else {
          fbList.innerHTML = feedback.map(f => `
            <div class="sheesh-admin-row">
              <div style="flex: 1;">
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 2px;">
                  <strong>@${escapeHtml(f.username)}</strong> on <code>${escapeHtml(f.tool)}</code> &middot; ${formatRelativeTime(f.created_at)}
                </div>
                <div style="font-size: 0.83rem; color: var(--text-primary); white-space: pre-wrap;">${escapeHtml(f.message)}</div>
              </div>
              <button type="button" class="btn btn-sm btn-secondary" data-dismiss-feedback="${escapeHtml(f.id)}" style="font-size: 0.72rem; padding: 3px 8px;">Dismiss</button>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      if (usersList) {
        usersList.innerHTML = `<div class="sheesh-empty-row" style="color: #f87171;">Could not load admin overview: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  // =========================================================================
  // MODAL OPEN / CLOSE & EVENT WIRING
  // =========================================================================

  async function openSheeshModal(initialMode) {
    const modal = document.getElementById('modal-sheesh-cloud');
    if (!modal) return;
    showAlert('');
    modal.style.display = 'flex';

    // Always roll a fresh passphrase into the register box if not already present
    const phraseCode = document.getElementById('sheesh-rolled-passphrase');
    if (phraseCode && !phraseCode.dataset.initialized) {
      phraseCode.textContent = rollPassphrase();
      phraseCode.dataset.initialized = 'true';
    }

    // Check server status if not signed in
    if (!currentUser) {
      try {
        const st = await apiRequest(`/status${pendingInviteCode ? `?invite=${encodeURIComponent(pendingInviteCode)}` : ''}`);
        needsBootstrap = Boolean(st && st.needsBootstrap);
        if (needsBootstrap || initialMode === 'register' || pendingInviteCode) {
          switchAuthMode('register');
        } else {
          switchAuthMode('login');
        }
      } catch (_) {
        if (initialMode === 'register' || pendingInviteCode) {
          switchAuthMode('register');
        }
      }
    }

    renderModalState();
  }

  function closeSheeshModal() {
    const modal = document.getElementById('modal-sheesh-cloud');
    if (modal) modal.style.display = 'none';
  }

  function bindEvents() {
    const sidebarBtn = document.getElementById('sheesh-sidebar-btn');
    if (sidebarBtn && !sidebarBtn.dataset.bound) {
      sidebarBtn.dataset.bound = 'true';
      sidebarBtn.addEventListener('click', () => openSheeshModal());
    }

    const expOpenBtn = document.getElementById('btn-export-sheesh-open');
    if (expOpenBtn && !expOpenBtn.dataset.bound) {
      expOpenBtn.dataset.bound = 'true';
      expOpenBtn.addEventListener('click', () => openSheeshModal());
    }

    const expSyncNowBtn = document.getElementById('btn-export-sheesh-sync-now');
    if (expSyncNowBtn && !expSyncNowBtn.dataset.bound) {
      expSyncNowBtn.dataset.bound = 'true';
      expSyncNowBtn.addEventListener('click', () => pushCedarToCloud({ deltaOnly: false, showToast: true }));
    }

    const expPullBtn = document.getElementById('btn-export-sheesh-pull');
    if (expPullBtn && !expPullBtn.dataset.bound) {
      expPullBtn.dataset.bound = 'true';
      expPullBtn.addEventListener('click', () => pullCedarFromCloud({ showToast: true }));
    }

    const modal = document.getElementById('modal-sheesh-cloud');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = 'true';

    // Close modal handlers
    const closeBtn = document.getElementById('btn-sheesh-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSheeshModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSheeshModal();
    });

    // Auth Mode Tabs
    document.querySelectorAll('.sheesh-auth-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        switchAuthMode(btn.getAttribute('data-auth-mode'));
      });
    });

    // Dashboard Sub-Tabs
    document.querySelectorAll('.sheesh-dash-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        switchDashTab(btn.getAttribute('data-sheesh-tab'));
      });
    });

    // Toggle passphrase visibility on login
    const toggleLoginPass = document.getElementById('btn-sheesh-toggle-login-pass');
    if (toggleLoginPass) {
      toggleLoginPass.addEventListener('click', () => {
        const inp = document.getElementById('sheesh-login-passphrase');
        if (!inp) return;
        const isPass = inp.type === 'password';
        inp.type = isPass ? 'text' : 'password';
        toggleLoginPass.textContent = isPass ? 'Hide' : 'Show';
      });
    }

    // Block '@' symbol in username inputs so nobody ever types an email
    ['sheesh-login-username', 'sheesh-register-username'].forEach(id => {
      const inp = document.getElementById(id);
      if (inp) {
        inp.addEventListener('input', () => {
          if (inp.value.includes('@')) {
            inp.value = inp.value.replace(/@/g, '');
            showAlert('Usernames only — for your privacy, email addresses (@) are never used on sheesh.gg.');
          }
        });
      }
    });

    // Roll 3-Word Passphrase button
    const rollBtn = document.getElementById('btn-sheesh-roll-passphrase');
    if (rollBtn) {
      rollBtn.addEventListener('click', () => {
        const phraseCode = document.getElementById('sheesh-rolled-passphrase');
        if (phraseCode) phraseCode.textContent = rollPassphrase();
      });
    }

    // Copy 3-Word Passphrase button
    const copyBtn = document.getElementById('btn-sheesh-copy-passphrase');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const phraseCode = document.getElementById('sheesh-rolled-passphrase');
        const label = document.getElementById('btn-sheesh-copy-passphrase-label');
        if (!phraseCode) return;
        try {
          await navigator.clipboard.writeText(phraseCode.textContent.trim());
          if (label) {
            label.textContent = 'Copied!';
            setTimeout(() => { label.textContent = 'Copy'; }, 1600);
          }
        } catch (_) {}
      });
    }

    // Submit Login Form
    const loginForm = document.getElementById('sheesh-form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showAlert('');
        const username = (document.getElementById('sheesh-login-username')?.value || '').trim().toLowerCase();
        const passphrase = (document.getElementById('sheesh-login-passphrase')?.value || '').trim().toLowerCase();
        const remember = Boolean(document.getElementById('sheesh-login-remember')?.checked);

        if (!username || !passphrase) {
          showAlert('Please enter both your username and your 3-word passphrase.');
          return;
        }

        const btn = document.getElementById('btn-sheesh-submit-login');
        if (btn) btn.disabled = true;
        try {
          const res = await apiRequest('/auth/login', {
            method: 'POST',
            body: { username, passphrase, persistent: remember }
          });
          storeToken(res.token, remember);
          currentUser = res.user;
          updateGlobalIndicators('Synced');
          renderModalState();
          await pullCedarFromCloud({ showToast: true });
        } catch (err) {
          showAlert(err.message);
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    // Submit Register / Claim Invite / Admin Bootstrap Form
    const regForm = document.getElementById('sheesh-form-register');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showAlert('');
        const inviteCode = (document.getElementById('sheesh-register-invite')?.value || '').trim();
        const username = (document.getElementById('sheesh-register-username')?.value || '').trim().toLowerCase();
        const passphrase = (document.getElementById('sheesh-rolled-passphrase')?.textContent || '').trim().toLowerCase();
        const confirmedSaved = Boolean(document.getElementById('sheesh-register-confirm-saved')?.checked);
        const remember = Boolean(document.getElementById('sheesh-register-remember')?.checked);

        if (!needsBootstrap && !inviteCode) {
          showAlert('Please enter a valid single-use invite code.');
          return;
        }
        if (!/^[a-z0-9_-]{2,24}$/.test(username)) {
          showAlert('Username must be 2–24 characters using only letters, numbers, underscores, or hyphens.');
          return;
        }
        if (!confirmedSaved) {
          showAlert('Please check the box confirming you have memorized or saved your 3-word passphrase.');
          return;
        }

        const btn = document.getElementById('btn-sheesh-submit-register');
        if (btn) btn.disabled = true;
        try {
          const endpoint = needsBootstrap ? '/auth/bootstrap' : '/auth/claim-invite';
          const res = await apiRequest(endpoint, {
            method: 'POST',
            body: { inviteCode, username, passphrase, persistent: remember }
          });
          needsBootstrap = false;
          pendingInviteCode = '';
          // Strip ?invite= from URL bar cleanly
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('invite')) {
              url.searchParams.delete('invite');
              window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
            }
          } catch (_) {}

          storeToken(res.token, remember);
          currentUser = res.user;
          updateGlobalIndicators('Synced');
          renderModalState();
          await pushCedarToCloud({ deltaOnly: false, showToast: true });
          showAlert(`Welcome to sheesh.gg, @${currentUser.username}! Your passphrase is ${passphrase}`, true);
        } catch (err) {
          showAlert(err.message);
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    // Sign Out
    const logoutBtn = document.getElementById('btn-sheesh-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await apiRequest('/auth/logout', { method: 'POST' });
        } catch (_) {}
        storeToken(null, false);
        currentUser = null;
        updateGlobalIndicators();
        renderModalState();
      });
    }

    // Auto-sync toggle
    const autoSyncCheck = document.getElementById('sheesh-autosync-checkbox');
    if (autoSyncCheck) {
      autoSyncCheck.addEventListener('change', () => {
        localStorage.setItem(STORAGE_KEY_AUTOSYNC, String(autoSyncCheck.checked));
        if (autoSyncCheck.checked) scheduleAutoSync();
      });
    }

    // Manual Push / Pull in Modal
    const modalPushBtn = document.getElementById('btn-sheesh-modal-push');
    if (modalPushBtn) {
      modalPushBtn.addEventListener('click', () => pushCedarToCloud({ deltaOnly: false, showToast: true }));
    }
    const modalPullBtn = document.getElementById('btn-sheesh-modal-pull');
    if (modalPullBtn) {
      modalPullBtn.addEventListener('click', () => pullCedarFromCloud({ showToast: true }));
    }

    // Submit Feedback / Bug Note
    const sendFbBtn = document.getElementById('btn-sheesh-submit-feedback');
    if (sendFbBtn) {
      sendFbBtn.addEventListener('click', async () => {
        const ta = document.getElementById('sheesh-feedback-textarea');
        const message = (ta?.value || '').trim();
        if (!message) {
          showAlert('Please write a short note before sending.');
          return;
        }
        sendFbBtn.disabled = true;
        try {
          await apiRequest('/feedback', {
            method: 'POST',
            body: { tool: 'cedar', message }
          });
          if (ta) ta.value = '';
          showAlert('Sent! Your note is now in the Admin Inbox.', true);
        } catch (err) {
          showAlert(err.message);
        } finally {
          sendFbBtn.disabled = false;
        }
      });
    }

    // Admin: Create Invite Link
    const createInviteBtn = document.getElementById('btn-sheesh-create-invite');
    if (createInviteBtn) {
      createInviteBtn.addEventListener('click', async () => {
        const labelInp = document.getElementById('sheesh-admin-invite-label');
        const label = (labelInp?.value || '').trim();
        const roleChecks = document.querySelectorAll('#sheesh-pane-admin .sheesh-role-check input[type="checkbox"]:checked');
        const roles = Array.from(roleChecks).map(c => c.value);

        createInviteBtn.disabled = true;
        try {
          const res = await apiRequest('/admin/invites', {
            method: 'POST',
            body: { label, roles }
          });
          const fullUrl = `${window.location.origin}/?invite=${encodeURIComponent(res.invite.code)}`;
          const box = document.getElementById('sheesh-generated-invite-box');
          const urlInp = document.getElementById('sheesh-generated-invite-url');
          if (urlInp) urlInp.value = fullUrl;
          if (box) box.style.display = 'block';
          if (labelInp) labelInp.value = '';
          try {
            await navigator.clipboard.writeText(fullUrl);
          } catch (_) {}
          await loadAdminOverview();
        } catch (err) {
          showAlert(err.message);
        } finally {
          createInviteBtn.disabled = false;
        }
      });
    }

    // Copy newly generated invite URL
    const copyInviteUrlBtn = document.getElementById('btn-sheesh-copy-invite-url');
    if (copyInviteUrlBtn) {
      copyInviteUrlBtn.addEventListener('click', async () => {
        const urlInp = document.getElementById('sheesh-generated-invite-url');
        if (!urlInp) return;
        try {
          await navigator.clipboard.writeText(urlInp.value);
          copyInviteUrlBtn.textContent = 'Copied!';
          setTimeout(() => { copyInviteUrlBtn.textContent = 'Copy'; }, 1500);
        } catch (_) {}
      });
    }

    // Admin Refresh button
    const adminRefreshBtn = document.getElementById('btn-sheesh-admin-refresh');
    if (adminRefreshBtn) {
      adminRefreshBtn.addEventListener('click', () => loadAdminOverview());
    }

    // Delegated clicks inside Admin Pane (Revoke invite, Toggle user role, Reset passphrase, Pause user, Dismiss feedback)
    const adminPane = document.getElementById('sheesh-pane-admin');
    if (adminPane) {
      adminPane.addEventListener('click', async (e) => {
        const copyInvBtn = e.target.closest('[data-copy-invite]');
        if (copyInvBtn) {
          const url = copyInvBtn.getAttribute('data-copy-invite');
          try {
            await navigator.clipboard.writeText(url);
            copyInvBtn.textContent = 'Copied!';
            setTimeout(() => { copyInvBtn.textContent = 'Copy URL'; }, 1400);
          } catch (_) {}
          return;
        }

        const revokeBtn = e.target.closest('[data-revoke-invite]');
        if (revokeBtn) {
          const code = revokeBtn.getAttribute('data-revoke-invite');
          try {
            await apiRequest('/admin/invites/revoke', { method: 'POST', body: { code } });
            await loadAdminOverview();
          } catch (err) {
            showAlert(err.message);
          }
          return;
        }

        const roleToggleBtn = e.target.closest('[data-toggle-user-role]');
        if (roleToggleBtn) {
          const username = roleToggleBtn.getAttribute('data-toggle-user-role');
          const role = roleToggleBtn.getAttribute('data-role');
          try {
            await apiRequest('/admin/users/toggle-role', { method: 'POST', body: { username, role } });
            await loadAdminOverview();
          } catch (err) {
            showAlert(err.message);
          }
          return;
        }

        const resetPassBtn = e.target.closest('[data-reset-user-pass]');
        if (resetPassBtn) {
          const username = resetPassBtn.getAttribute('data-reset-user-pass');
          const newPassphrase = rollPassphrase();
          try {
            await apiRequest('/admin/users/reset-passphrase', {
              method: 'POST',
              body: { username, newPassphrase }
            });
            const resBox = document.getElementById('sheesh-reset-pass-result');
            if (resBox) {
              resBox.style.display = 'block';
              resBox.innerHTML = `New 3-word passphrase for <strong>@${escapeHtml(username)}</strong>: <code style="font-weight:700; font-size:0.95rem;">${escapeHtml(newPassphrase)}</code> (Copied to clipboard!)`;
            }
            try { await navigator.clipboard.writeText(newPassphrase); } catch (_) {}
          } catch (err) {
            showAlert(err.message);
          }
          return;
        }

        const statusBtn = e.target.closest('[data-toggle-user-status]');
        if (statusBtn) {
          const username = statusBtn.getAttribute('data-toggle-user-status');
          const curr = statusBtn.getAttribute('data-current-status');
          const nextStatus = curr === 'paused' ? 'active' : 'paused';
          try {
            await apiRequest('/admin/users/status', {
              method: 'POST',
              body: { username, status: nextStatus }
            });
            await loadAdminOverview();
          } catch (err) {
            showAlert(err.message);
          }
          return;
        }

        const dismissFbBtn = e.target.closest('[data-dismiss-feedback]');
        if (dismissFbBtn) {
          const id = dismissFbBtn.getAttribute('data-dismiss-feedback');
          try {
            await apiRequest('/admin/feedback/dismiss', { method: 'POST', body: { id } });
            await loadAdminOverview();
          } catch (err) {
            showAlert(err.message);
          }
        }
      });
    }

    // Footer API URL config toggle
    const toggleApiBtn = document.getElementById('btn-sheesh-toggle-api-config');
    const apiConfigRow = document.getElementById('sheesh-api-config-row');
    if (toggleApiBtn && apiConfigRow) {
      toggleApiBtn.addEventListener('click', () => {
        const isHidden = apiConfigRow.style.display === 'none';
        apiConfigRow.style.display = isHidden ? 'flex' : 'none';
      });
    }

    const saveApiBtn = document.getElementById('btn-sheesh-save-api-url');
    if (saveApiBtn) {
      saveApiBtn.addEventListener('click', () => {
        const inp = document.getElementById('sheesh-api-url-input');
        const val = (inp?.value || '').trim().replace(/\/+$/, '');
        if (val) {
          localStorage.setItem(STORAGE_KEY_API, val);
        } else {
          localStorage.removeItem(STORAGE_KEY_API);
        }
        renderModalState();
        showAlert(`API endpoint updated to ${getApiBase()}`, true);
      });
    }
  }

  async function initSheeshCloud() {
    bindEvents();
    hookCedarSaveFunctions();

    // 1. Check if URL has ?invite=sh_...
    try {
      const params = new URLSearchParams(window.location.search);
      const inv = params.get('invite');
      if (inv && inv.trim()) {
        pendingInviteCode = inv.trim();
        const invInput = document.getElementById('sheesh-register-invite');
        if (invInput) invInput.value = pendingInviteCode;
      }
    } catch (_) {}

    // 2. Check existing session token or cookie with api.sheesh.gg
    try {
      const meRes = await apiRequest('/auth/me');
      if (meRes && meRes.user) {
        currentUser = meRes.user;
        updateGlobalIndicators('Synced');
        renderModalState();
        await pullCedarFromCloud({ showToast: false });
        return;
      }
    } catch (_) {
      currentUser = null;
      updateGlobalIndicators();
    }

    // 3. If an invite link was clicked while signed out, automatically open the Claim Invite modal!
    if (pendingInviteCode) {
      openSheeshModal('register');
    }
  }

  // Expose global API for Cedar & sibling sheesh.gg tools
  window.SheeshCloud = {
    init: initSheeshCloud,
    openModal: openSheeshModal,
    closeModal: closeSheeshModal,
    pushNow: () => pushCedarToCloud({ deltaOnly: false, showToast: true }),
    pullNow: () => pullCedarFromCloud({ showToast: true }),
    rollPassphrase,
    getUser: () => currentUser
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initSheeshCloud, 120));
  } else {
    setTimeout(initSheeshCloud, 120);
  }
})();
