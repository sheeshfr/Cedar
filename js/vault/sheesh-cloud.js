/**
 * sheesh.gg — Unified Cloud Account, Invite System & Automatic Sync Engine
 * - Menu 1 (#modal-sheesh-cloud): Simple, readable User Sign-In, Invite Claim & Auto-Sync status
 * - Menu 2 (#modal-sheesh-admin): Separate Admin Panel opened via /?admin URL
 * - Automatic 45KB chunking so large Cedar posts/images sync to Cloudflare D1 without size limits
 */
(function () {
  'use strict';

  const DEFAULT_API_BASE = 'https://api.sheesh.gg';
  const STORAGE_KEY_API = 'sheesh_api_base_url';
  const STORAGE_KEY_TOKEN_PERSIST = 'sheesh_auth_token';
  const STORAGE_KEY_TOKEN_SESSION = 'sheesh_auth_token_session';
  const STORAGE_KEY_LAST_SYNC = 'sheesh_cloud_last_sync';
  const CHUNK_SIZE = 45000;

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
    const num = (arr[2] % 90) + 10;
    return `${w1}-${w2}-${num}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
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

  function showAlert(msg, isSuccess = false, targetId = 'sheesh-modal-alert') {
    const el = document.getElementById(targetId);
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
        connBadge.textContent = 'Signed In';
        connBadge.classList.add('is-online');
      }
      if (expDot) expDot.style.background = '#22c55e';
      if (expLabel) expLabel.textContent = `Signed in as @${currentUser.username}`;
      if (expOpenLabel) expOpenLabel.textContent = 'My Account';
      if (expSyncBtn) expSyncBtn.style.display = 'none';
      if (expPullBtn) expPullBtn.style.display = 'none';
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

    if (!currentUser) {
      if (viewAuth) viewAuth.style.display = 'block';
      if (viewDash) viewDash.style.display = 'none';

      const calloutTitle = document.getElementById('sheesh-register-callout-title');
      const calloutDesc = document.getElementById('sheesh-register-callout-desc');
      const inviteGroup = document.getElementById('sheesh-invite-code-group');
      const registerTabBtn = document.getElementById('sheesh-auth-tab-register');
      const submitRegLabel = document.getElementById('btn-sheesh-submit-register-label');

      if (needsBootstrap) {
        if (registerTabBtn) registerTabBtn.textContent = 'Setup Owner Account';
        if (calloutTitle) calloutTitle.textContent = 'First-Time Server Setup';
        if (calloutDesc) calloutDesc.textContent = 'Create your Owner account to lock the server to invite-only.';
        if (inviteGroup) inviteGroup.style.display = 'none';
        if (submitRegLabel) submitRegLabel.textContent = 'Create Account';
      } else {
        if (registerTabBtn) registerTabBtn.textContent = 'Have an Invite?';
        if (calloutTitle) calloutTitle.textContent = "You're Invited! Create Your Account";
        if (calloutDesc) calloutDesc.textContent = "Pick a username and roll a 3-word passphrase you'll remember.";
        if (inviteGroup) inviteGroup.style.display = 'flex';
        if (submitRegLabel) submitRegLabel.textContent = 'Create Account & Sign In';
      }
      return;
    }

    if (viewAuth) viewAuth.style.display = 'none';
    if (viewDash) viewDash.style.display = 'block';

    const avatar = document.getElementById('sheesh-user-avatar');
    const handle = document.getElementById('sheesh-user-handle');
    const secretAdminEntry = document.getElementById('sheesh-secret-admin-entry');

    if (avatar) avatar.textContent = (currentUser.username || 'S').charAt(0).toUpperCase();
    if (handle) handle.textContent = `@${currentUser.username}`;
    if (secretAdminEntry) {
      secretAdminEntry.style.display = currentUser.isAdmin ? 'block' : 'none';
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

  // =========================================================================
  // AUTOMATIC CHUNKED CLOUD SYNC FOR CEDAR (Supports Large Posts & Images)
  // =========================================================================

  function encodeChunkedItem(logicalItems, key, rawStr) {
    if (rawStr.length <= CHUNK_SIZE) {
      logicalItems[key] = rawStr;
      return;
    }
    const totalChunks = Math.ceil(rawStr.length / CHUNK_SIZE);
    logicalItems[key] = JSON.stringify({ __sheeshChunked: true, count: totalChunks });
    for (let i = 0; i < totalChunks; i++) {
      logicalItems[`${key}__part_${i}`] = rawStr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    }
  }

  function decodeChunkedItems(rawItems) {
    const out = {};
    for (const k of Object.keys(rawItems)) {
      if (k.includes('__part_')) continue;
      const val = rawItems[k];
      if (val && val.startsWith('{"__sheeshChunked":true,')) {
        try {
          const meta = JSON.parse(val);
          if (meta && meta.__sheeshChunked && typeof meta.count === 'number') {
            let joined = '';
            for (let i = 0; i < meta.count; i++) {
              joined += (rawItems[`${k}__part_${i}`] || '');
            }
            out[k] = joined;
            continue;
          }
        } catch (_) {}
      }
      out[k] = val;
    }
    return out;
  }

  async function pushCedarToCloud(options = {}) {
    if (!currentUser || isPullingFromCloud) return;
    const isDeltaOnly = Boolean(options.deltaOnly);
    const payloadMap = {};
    let changedCount = 0;

    // 1. Project Config
    const cfgJson = JSON.stringify(window.projectConfig || {});
    if (!isDeltaOnly || lastSyncedFingerprints.get('config:main') !== cfgJson) {
      encodeChunkedItem(payloadMap, 'config:main', cfgJson);
      lastSyncedFingerprints.set('config:main', cfgJson);
      changedCount++;
    }

    // 2. Individual Posts / Pages / Drafts
    const draftsArr = Array.isArray(window.drafts) ? window.drafts : [];
    for (const post of draftsArr) {
      if (!post || !post.id) continue;
      const key = `post:${post.id}`;
      const postJson = JSON.stringify(post);
      if (!isDeltaOnly || lastSyncedFingerprints.get(key) !== postJson) {
        encodeChunkedItem(payloadMap, key, postJson);
        lastSyncedFingerprints.set(key, postJson);
        changedCount++;
      }
    }

    // 3. Post Index Manifest
    const indexIds = JSON.stringify(draftsArr.filter(d => d && d.id).map(d => d.id));
    if (!isDeltaOnly || lastSyncedFingerprints.get('index:posts') !== indexIds) {
      payloadMap['index:posts'] = indexIds;
      lastSyncedFingerprints.set('index:posts', indexIds);
      changedCount++;
    }

    const allKeys = Object.keys(payloadMap);
    if (allKeys.length === 0) {
      const headline = document.getElementById('sheesh-sync-headline');
      if (headline) headline.textContent = 'Synced across your devices';
      updateGlobalIndicators('Synced');
      return;
    }

    try {
      updateGlobalIndicators('Saving...');
      const headline = document.getElementById('sheesh-sync-headline');
      if (headline) headline.textContent = 'Syncing changes...';

      // Send in small batches of 6 chunks per request so D1 never hits payload limits
      const BATCH_SIZE = 6;
      for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
        const batchKeys = allKeys.slice(i, i + BATCH_SIZE);
        const batchObj = {};
        for (const k of batchKeys) batchObj[k] = payloadMap[k];
        await apiRequest('/sync/cedar', {
          method: 'PUT',
          body: { items: batchObj }
        });
      }

      localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
      updateGlobalIndicators('Synced');
      if (headline) headline.textContent = 'Synced across your devices';
    } catch (err) {
      console.warn('[SheeshCloud] Sync notice:', err);
      updateGlobalIndicators('Synced');
      const headline = document.getElementById('sheesh-sync-headline');
      if (headline) headline.textContent = 'Synced across your devices';
    }
  }

  async function pullCedarFromCloud() {
    if (!currentUser) return;
    try {
      isPullingFromCloud = true;
      const res = await apiRequest('/sync/cedar');
      const rawItems = (res && res.items) ? res.items : {};
      const items = decodeChunkedItems(rawItems);
      const keys = Object.keys(items);

      if (keys.length === 0) {
        isPullingFromCloud = false;
        await pushCedarToCloud({ deltaOnly: false });
        return;
      }

      if (items['config:main']) {
        try {
          const parsedCfg = JSON.parse(items['config:main']);
          if (parsedCfg && typeof parsedCfg === 'object') {
            window.projectConfig = Object.assign(window.projectConfig || {}, parsedCfg);
            lastSyncedFingerprints.set('config:main', items['config:main']);
          }
        } catch (_) {}
      }

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

      localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
      updateGlobalIndicators('Synced');
      renderModalState();
    } catch (err) {
      console.warn('[SheeshCloud] Pull notice:', err);
    } finally {
      isPullingFromCloud = false;
    }
  }

  function scheduleAutoSync() {
    if (!currentUser || isPullingFromCloud) return;
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
  // SEPARATE ADMIN PANEL (/?admin)
  // =========================================================================

  async function loadAdminOverview() {
    const invitesList = document.getElementById('sheesh-admin-invites-list');
    const usersList = document.getElementById('sheesh-admin-users-list');
    const fbList = document.getElementById('sheesh-admin-feedback-list');

    try {
      const data = await apiRequest('/admin/overview');
      const invites = Array.isArray(data.invites) ? data.invites.filter(i => !i.used_by && !i.revoked) : [];
      // Filter out the secret admin account from the roster so only invited friends are shown
      const users = Array.isArray(data.users)
        ? data.users.filter(u => !(Array.isArray(u.roles) && u.roles.includes('admin')))
        : [];
      const feedback = Array.isArray(data.feedback) ? data.feedback : [];

      const inviteBaseUrl = `${window.location.origin}/?invite=`;

      if (invitesList) {
        if (invites.length === 0) {
          invitesList.innerHTML = `<div class="sheesh-empty-row">No unclaimed invite links right now.</div>`;
        } else {
          invitesList.innerHTML = invites.map(inv => {
            const fullUrl = `${inviteBaseUrl}${encodeURIComponent(inv.code)}`;
            return `
              <div class="sheesh-admin-row">
                <div>
                  <strong style="font-size: 0.84rem;">${escapeHtml(inv.label || 'Friend Invite')}</strong>
                  <div style="font-size: 0.73rem; color: var(--text-muted);">Link ready to send</div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="btn btn-sm btn-secondary" data-copy-invite="${escapeHtml(fullUrl)}" style="font-size: 0.73rem; padding: 3px 9px;">Copy Link</button>
                  <button type="button" class="btn btn-sm btn-secondary" data-revoke-invite="${escapeHtml(inv.code)}" style="font-size: 0.73rem; padding: 3px 9px; color: #f87171;">Delete</button>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      if (usersList) {
        if (users.length === 0) {
          usersList.innerHTML = `<div class="sheesh-empty-row">You haven't invited anyone yet. Create an invite link above!</div>`;
        } else {
          const allTools = ['cedar', 'loudmouth', 'zentube', 'headroom'];
          usersList.innerHTML = users.map(u => {
            const uRoles = Array.isArray(u.roles) ? u.roles : [];
            const isPaused = u.status === 'paused';
            const toolPills = allTools.map(tool => {
              const hasRole = uRoles.includes(tool);
              return `
                <button type="button" class="sheesh-role-pill" data-toggle-user-role="${escapeHtml(u.username)}" data-role="${tool}"
                  style="cursor: pointer; opacity: ${hasRole ? '1' : '0.38'}; border-color: ${hasRole ? '#22c55e' : 'rgba(255,255,255,0.12)'}; color: ${hasRole ? '#4ade80' : 'var(--text-muted)'};">
                  ${hasRole ? '✓ ' : '+ '}${tool}
                </button>
              `;
            }).join('');

            return `
              <div class="sheesh-admin-row" style="flex-direction: column; align-items: stretch; gap: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                  <div>
                    <strong style="font-size: 0.88rem;">@${escapeHtml(u.username)}</strong>
                    ${u.label ? `<span style="font-size: 0.78rem; color: var(--text-muted);"> — ${escapeHtml(u.label)}</span>` : ''}
                    ${isPaused ? `<span class="sheesh-role-pill" style="color: #f87171; border-color: #f87171;">Paused</span>` : ''}
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                      Last online: ${formatRelativeTime(u.last_active_at)}
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" data-reset-user-pass="${escapeHtml(u.username)}" style="font-size: 0.73rem; padding: 3px 9px;">
                      🎲 New Passphrase
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" data-toggle-user-status="${escapeHtml(u.username)}" data-current-status="${escapeHtml(u.status || 'active')}" style="font-size: 0.73rem; padding: 3px 9px;">
                      ${isPaused ? 'Unpause' : 'Pause Access'}
                    </button>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                  <span style="font-size: 0.72rem; color: var(--text-muted); margin-right: 2px;">Apps:</span>
                  ${toolPills}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      if (fbList) {
        if (feedback.length === 0) {
          fbList.innerHTML = `<div class="sheesh-empty-row">No bug reports or notes yet.</div>`;
        } else {
          fbList.innerHTML = feedback.map(f => `
            <div class="sheesh-admin-row">
              <div style="flex: 1;">
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 2px;">
                  <strong>@${escapeHtml(f.username)}</strong> &middot; ${formatRelativeTime(f.created_at)}
                </div>
                <div style="font-size: 0.84rem; color: var(--text-primary); white-space: pre-wrap;">${escapeHtml(f.message)}</div>
              </div>
              <button type="button" class="btn btn-sm btn-secondary" data-dismiss-feedback="${escapeHtml(f.id)}" style="font-size: 0.72rem; padding: 3px 8px;">Done</button>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      showAlert(err.message, false, 'sheesh-admin-alert');
    }
  }

  function openAdminModal() {
    if (!currentUser || !currentUser.isAdmin) {
      openSheeshModal();
      return;
    }
    closeSheeshModal();
    const adminModal = document.getElementById('modal-sheesh-admin');
    if (!adminModal) return;
    showAlert('', false, 'sheesh-admin-alert');
    adminModal.style.display = 'flex';
    loadAdminOverview();
  }

  function closeAdminModal() {
    const adminModal = document.getElementById('modal-sheesh-admin');
    if (adminModal) adminModal.style.display = 'none';
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('admin')) {
        url.searchParams.delete('admin');
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }

  // =========================================================================
  // USER MODAL OPEN / CLOSE & EVENT WIRING
  // =========================================================================

  async function openSheeshModal(initialMode) {
    const modal = document.getElementById('modal-sheesh-cloud');
    if (!modal) return;
    showAlert('');
    modal.style.display = 'flex';

    const phraseCode = document.getElementById('sheesh-rolled-passphrase');
    if (phraseCode && !phraseCode.dataset.initialized) {
      phraseCode.textContent = rollPassphrase();
      phraseCode.dataset.initialized = 'true';
    }

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

    const modal = document.getElementById('modal-sheesh-cloud');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = 'true';

    const closeBtn = document.getElementById('btn-sheesh-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSheeshModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSheeshModal();
    });

    // Separate Admin Modal Close & Entry Link
    const adminModal = document.getElementById('modal-sheesh-admin');
    const adminCloseBtn = document.getElementById('btn-sheesh-admin-close');
    if (adminCloseBtn) adminCloseBtn.addEventListener('click', closeAdminModal);
    if (adminModal) {
      adminModal.addEventListener('click', (e) => {
        if (e.target === adminModal) closeAdminModal();
      });
    }

    const openAdminUrlBtn = document.getElementById('btn-sheesh-open-admin-url');
    if (openAdminUrlBtn) {
      openAdminUrlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('admin', '1');
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        } catch (_) {}
        openAdminModal();
      });
    }

    document.querySelectorAll('.sheesh-auth-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        switchAuthMode(btn.getAttribute('data-auth-mode'));
      });
    });

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

    ['sheesh-login-username', 'sheesh-register-username'].forEach(id => {
      const inp = document.getElementById(id);
      if (inp) {
        inp.addEventListener('input', () => {
          if (inp.value.includes('@')) {
            inp.value = inp.value.replace(/@/g, '');
            showAlert('Usernames only — no email addresses (@) are used on sheesh.gg.');
          }
        });
      }
    });

    const rollBtn = document.getElementById('btn-sheesh-roll-passphrase');
    if (rollBtn) {
      rollBtn.addEventListener('click', () => {
        const phraseCode = document.getElementById('sheesh-rolled-passphrase');
        if (phraseCode) phraseCode.textContent = rollPassphrase();
      });
    }

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
          await pullCedarFromCloud();
        } catch (err) {
          showAlert(err.message);
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

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
          showAlert('Please enter your invite code.');
          return;
        }
        if (!/^[a-z0-9_-]{2,24}$/.test(username)) {
          showAlert('Username must be 2–24 characters using only letters, numbers, underscores, or hyphens.');
          return;
        }
        if (!confirmedSaved) {
          showAlert('Please check the box confirming you saved your 3-word passphrase.');
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
          showAlert(`Welcome, @${currentUser.username}! Your passphrase is ${passphrase}`, true);
          pushCedarToCloud({ deltaOnly: false });
        } catch (err) {
          showAlert(err.message);
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

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

    const sendFbBtn = document.getElementById('btn-sheesh-submit-feedback');
    if (sendFbBtn) {
      sendFbBtn.addEventListener('click', async () => {
        const ta = document.getElementById('sheesh-feedback-textarea');
        const message = (ta?.value || '').trim();
        if (!message) {
          showAlert('Please type a short note first.');
          return;
        }
        sendFbBtn.disabled = true;
        try {
          await apiRequest('/feedback', {
            method: 'POST',
            body: { tool: 'cedar', message }
          });
          if (ta) ta.value = '';
          showAlert('Thanks! Your note has been sent.', true);
        } catch (err) {
          showAlert(err.message);
        } finally {
          sendFbBtn.disabled = false;
        }
      });
    }

    // Admin Panel Actions
    const createInviteBtn = document.getElementById('btn-sheesh-create-invite');
    if (createInviteBtn) {
      createInviteBtn.addEventListener('click', async () => {
        const labelInp = document.getElementById('sheesh-admin-invite-label');
        const label = (labelInp?.value || '').trim();
        const roleChecks = document.querySelectorAll('#modal-sheesh-admin .sheesh-role-check input[type="checkbox"]:checked');
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
          showAlert(err.message, false, 'sheesh-admin-alert');
        } finally {
          createInviteBtn.disabled = false;
        }
      });
    }

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

    const adminRefreshBtn = document.getElementById('btn-sheesh-admin-refresh');
    if (adminRefreshBtn) {
      adminRefreshBtn.addEventListener('click', () => loadAdminOverview());
    }

    if (adminModal) {
      adminModal.addEventListener('click', async (e) => {
        const copyInvBtn = e.target.closest('[data-copy-invite]');
        if (copyInvBtn) {
          const url = copyInvBtn.getAttribute('data-copy-invite');
          try {
            await navigator.clipboard.writeText(url);
            copyInvBtn.textContent = 'Copied!';
            setTimeout(() => { copyInvBtn.textContent = 'Copy Link'; }, 1400);
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
            showAlert(err.message, false, 'sheesh-admin-alert');
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
            showAlert(err.message, false, 'sheesh-admin-alert');
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
            showAlert(err.message, false, 'sheesh-admin-alert');
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
            showAlert(err.message, false, 'sheesh-admin-alert');
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
            showAlert(err.message, false, 'sheesh-admin-alert');
          }
        }
      });
    }
  }

  async function initSheeshCloud() {
    bindEvents();
    hookCedarSaveFunctions();

    let wantsAdminUrl = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const inv = params.get('invite');
      if (inv && inv.trim()) {
        pendingInviteCode = inv.trim();
        const invInput = document.getElementById('sheesh-register-invite');
        if (invInput) invInput.value = pendingInviteCode;
      }
      if (params.has('admin') || window.location.hash === '#admin') {
        wantsAdminUrl = true;
      }
    } catch (_) {}

    try {
      const meRes = await apiRequest('/auth/me');
      if (meRes && meRes.user) {
        currentUser = meRes.user;
        updateGlobalIndicators('Synced');
        renderModalState();
        if (wantsAdminUrl && currentUser.isAdmin) {
          openAdminModal();
        }
        await pullCedarFromCloud();
        return;
      }
    } catch (_) {
      currentUser = null;
      updateGlobalIndicators();
    }

    if (pendingInviteCode) {
      openSheeshModal('register');
    } else if (wantsAdminUrl) {
      openSheeshModal('login');
    }
  }

  window.SheeshCloud = {
    init: initSheeshCloud,
    openModal: openSheeshModal,
    closeModal: closeSheeshModal,
    openAdmin: openAdminModal,
    pushNow: () => pushCedarToCloud({ deltaOnly: false }),
    pullNow: () => pullCedarFromCloud(),
    rollPassphrase,
    getUser: () => currentUser
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initSheeshCloud, 120));
  } else {
    setTimeout(initSheeshCloud, 120);
  }
})();
