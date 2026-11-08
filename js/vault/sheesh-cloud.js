/**
 * sheesh.gg — Unified Cloud Account, Invite System, Hardened Sandbox & Automatic Sync Engine
 * - Menu 1 (#modal-sheesh-cloud): Simple, readable User Sign-In, Invite Claim & Auto-Sync status
 * - Menu 2 (#modal-sheesh-admin): Separate Admin Panel opened via /?admin URL
 * - Automatic 45KB chunking so large Cedar posts/images/branding sync to Cloudflare D1 without size limits
 * - Zero-Trust Sandbox Hardening (window.SheeshSecurity) + Strict Multi-User Silo Isolation
 */
(function () {
  'use strict';

  const DEFAULT_API_BASE = 'https://api.sheesh.gg';
  const STORAGE_KEY_API = 'sheesh_api_base_url';
  const STORAGE_KEY_TOKEN_PERSIST = 'sheesh_auth_token';
  const STORAGE_KEY_TOKEN_SESSION = 'sheesh_auth_token_session';
  const STORAGE_KEY_ACTIVE_USER = 'sheesh_active_user_id';
  const STORAGE_KEY_LAST_SYNC = 'sheesh_cloud_last_sync';
  const STORAGE_KEY_INVITE_PASSWORDS = 'sheesh_invite_passwords_map';
  const STORAGE_KEY_USERNAME_CASING = 'sheesh_username_casing_map';
  const STORAGE_KEY_FLASH_POPUP = 'sheesh_flash_top_popup';
  const CHUNK_SIZE = 45000;
  const MAX_MEDIA_CHARS = 1500000; // ~1.5MB per synced image

  // =========================================================================
  // ZERO-TRUST SANDBOX & PROTOTYPE-POLLUTION HARDENING (window.SheeshSecurity)
  // =========================================================================

  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const FORBIDDEN_TAGS = ['script', 'object', 'embed', 'applet', 'base', 'meta'];

  function safeJsonParse(rawStr, fallback = null) {
    if (typeof rawStr !== 'string' || !rawStr) return fallback;
    try {
      return JSON.parse(rawStr, (key, value) => {
        if (DANGEROUS_KEYS.has(key)) return undefined;
        return value;
      });
    } catch (_) {
      return fallback;
    }
  }

  function isDangerousUri(val) {
    if (typeof val !== 'string') return false;
    const cleaned = val.replace(/[\u0000-\u001F\u007F-\u009F\s]+/g, '').toLowerCase();
    return (
      cleaned.startsWith('javascript:') ||
      cleaned.startsWith('vbscript:') ||
      cleaned.startsWith('data:text/html') ||
      cleaned.startsWith('data:application/javascript') ||
      cleaned.startsWith('data:text/javascript')
    );
  }

  function sanitizeDomTree(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
    FORBIDDEN_TAGS.forEach(tag => {
      rootEl.querySelectorAll(tag).forEach(node => node.remove());
    });

    const allEls = rootEl.querySelectorAll('*');
    allEls.forEach(el => {
      const attrs = Array.from(el.attributes || []);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const val = attr.value || '';
        if (name.startsWith('on') || name === 'srcdoc') {
          el.removeAttribute(attr.name);
          continue;
        }
        if (['href', 'src', 'xlink:href', 'action', 'formaction', 'data'].includes(name)) {
          if (isDangerousUri(val)) {
            el.removeAttribute(attr.name);
          }
        }
      }
      if (el.tagName && el.tagName.toLowerCase() === 'iframe') {
        const src = el.getAttribute('src') || '';
        if (!src || isDangerousUri(src) || src.trim().toLowerCase().startsWith('data:')) {
          el.remove();
        } else {
          el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
          el.setAttribute('referrerpolicy', 'no-referrer');
        }
      }
    });
  }

  function sanitizeHtml(dirtyHtml) {
    if (typeof dirtyHtml !== 'string' || !dirtyHtml) return '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(dirtyHtml, 'text/html');
      if (!doc || !doc.body) return '';
      sanitizeDomTree(doc.body);
      return doc.body.innerHTML;
    } catch (_) {
      return '';
    }
  }

  function sanitizePostObject(post) {
    if (!post || typeof post !== 'object') return null;
    const clean = Object.assign({}, post);
    if (typeof clean.content === 'string' && clean.content) {
      clean.content = sanitizeHtml(clean.content);
    }
    if (typeof clean.proseHtml === 'string' && clean.proseHtml) {
      clean.proseHtml = sanitizeHtml(clean.proseHtml);
    }
    if (typeof clean.customHtml === 'string' && clean.customHtml) {
      clean.customHtml = sanitizeHtml(clean.customHtml);
    }
    if (Array.isArray(clean.blocks)) {
      clean.blocks = clean.blocks.map(b => {
        if (!b || typeof b !== 'object') return b;
        const cb = Object.assign({}, b);
        if (typeof cb.html === 'string' && cb.html) cb.html = sanitizeHtml(cb.html);
        if (typeof cb.content === 'string' && cb.content && (cb.type === 'html' || cb.type === 'embed' || cb.content.includes('<'))) {
          cb.content = sanitizeHtml(cb.content);
        }
        return cb;
      });
    }
    return clean;
  }

  function stripSecretsFromConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return {};
    const copy = safeJsonParse(JSON.stringify(cfg), {}) || {};
    // Never upload personal GitHub PATs to cloud storage
    delete copy.githubToken;
    // Persist active theme preference inside config:main so theme travels across devices
    try {
      const activeTheme = localStorage.getItem('cedar_theme_preference') ||
        document.documentElement.getAttribute('data-theme') ||
        copy.cedarTheme ||
        'forest-dark';
      copy.cedarTheme = activeTheme;
      copy.cedarThemePreference = activeTheme;
    } catch (_) {}
    // Strip inline dataUrl from mediaLibrary inside config:main (synced separately via media:<path>)
    if (Array.isArray(copy.mediaLibrary)) {
      copy.mediaLibrary = copy.mediaLibrary.map(item => {
        if (!item || typeof item !== 'object') return item;
        const { dataUrl, ...rest } = item;
        return rest;
      });
    }
    return copy;
  }

  window.SheeshSecurity = {
    safeJsonParse,
    sanitizeHtml,
    sanitizeDomTree,
    sanitizePostObject,
    stripSecretsFromConfig,
    isDangerousUri
  };

  // =========================================================================
  // PASSWORDS & AUTH STATE
  // =========================================================================

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
  let pendingInviteLabel = '';
  let pendingInvitePassword = '';
  let topPopupHideTimer = null;
  let syncDebounceTimer = null;
  let isPullingFromCloud = false;
  let isPushingToCloud = false;
  let lastServerUpdatedAt = 0;
  let initPromise = null;
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

  async function wipeCedarLocalWorkspace() {
    lastSyncedFingerprints.clear();
    lastServerUpdatedAt = 0;
    try {
      const keysToRemove = [
        'sheesh_static_writer_drafts_v2',
        'sheesh_static_writer_active_id_v2',
        'sheesh_static_writer_project_v1',
        'sheesh_static_writer_drafts',
        'sheesh_static_writer_active_id',
        'cedar_user_domain',
        'cedar_user_blog_path',
        'cedar_rss_enabled',
        'cedar_layout_override',
        'cedar_project_config',
        'cedar_drafts',
        'cedar_branding_files_v1',
        'cedar_theme_preference',
        'cedar_ftue_completed',
        'outpost_ftue_completed',
        STORAGE_KEY_LAST_SYNC
      ];
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    try {
      window.imageRegistry = {};
      if (window.CedarVirtualStorage && typeof window.CedarVirtualStorage.clear === 'function') {
        await window.CedarVirtualStorage.clear();
      }
    } catch (_) {}
  }

  async function ensureLocalUserIsolation(incomingUser) {
    if (!incomingUser || !incomingUser.id) return;
    try {
      const prevUserId = localStorage.getItem(STORAGE_KEY_ACTIVE_USER);
      if (prevUserId && prevUserId !== incomingUser.id) {
        await wipeCedarLocalWorkspace();
      }
      localStorage.setItem(STORAGE_KEY_ACTIVE_USER, incomingUser.id);
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
      keepalive: Boolean(options.keepalive),
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const rawText = await resp.text().catch(() => '');
    const data = safeJsonParse(rawText, {}) || {};
    if (!resp.ok) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    return data;
  }

  function computeInviteDoubleSuffix(baseCode) {
    const str = `sheesh-invite-double-v1:${String(baseCode || '').trim().toLowerCase()}`;
    let h1 = 0x811c9dc5;
    let h2 = 0xcbf29ce4;
    let h3 = 0x1b873593;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (c * 31), 0xc2b2ae35) >>> 0;
    }
    return (
      h1.toString(16).padStart(8, '0') +
      h2.toString(16).padStart(8, '0') +
      h3.toString(16).padStart(8, '0')
    ).slice(0, 12);
  }

  function expandInviteCode(code) {
    const clean = String(code || '').trim();
    if (/^sh_[0-9a-f]{12}$/i.test(clean)) {
      return `${clean}${computeInviteDoubleSuffix(clean)}`;
    }
    return clean;
  }

  function extractBaseInviteCodeIfValid(code) {
    const clean = String(code || '').trim();
    if (/^sh_[0-9a-f]{24}$/i.test(clean)) {
      const base = clean.slice(0, 15);
      const suffix = clean.slice(15).toLowerCase();
      if (computeInviteDoubleSuffix(base) === suffix) {
        return base;
      }
    }
    return null;
  }

  function normalizeInviteCode(code) {
    const clean = String(code || '').trim();
    return extractBaseInviteCodeIfValid(clean) || clean;
  }

  function getInvitePasswordMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_INVITE_PASSWORDS);
      return raw ? (safeJsonParse(raw, {}) || {}) : {};
    } catch (_) {
      return {};
    }
  }

  function setInvitePasswordInMap(code, password) {
    if (!code) return;
    try {
      const base = normalizeInviteCode(code);
      const map = getInvitePasswordMap();
      if (password && String(password).trim()) {
        map[base] = String(password).trim();
      } else {
        delete map[base];
      }
      localStorage.setItem(STORAGE_KEY_INVITE_PASSWORDS, JSON.stringify(map));
    } catch (_) {}
  }

  function getUsernameCasingMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USERNAME_CASING);
      return raw ? (safeJsonParse(raw, {}) || {}) : {};
    } catch (_) {
      return {};
    }
  }

  function setUsernameCasingInMap(username, inviteCode) {
    const clean = String(username || '').trim();
    if (!clean) return;
    try {
      const map = getUsernameCasingMap();
      map[clean.toLowerCase()] = clean;
      if (inviteCode) {
        map[`inv:${normalizeInviteCode(inviteCode)}`] = clean;
      }
      localStorage.setItem(STORAGE_KEY_USERNAME_CASING, JSON.stringify(map));
    } catch (_) {}
  }

  function resolveDisplayUsername(username, inviteCode) {
    const raw = String(username || '').trim();
    const map = getUsernameCasingMap();
    if (inviteCode) {
      const byInv = map[`inv:${normalizeInviteCode(inviteCode)}`];
      if (byInv) return byInv;
    }
    if (!raw) return '';
    if (raw !== raw.toLowerCase()) return raw;
    return map[raw.toLowerCase()] || raw;
  }

  function formatInviteLabelWithPassword(name, password) {
    const cleanName = String(name || '').split('||')[0].trim();
    const cleanPass = String(password || '').trim();
    return cleanPass ? `${cleanName} || ${cleanPass}` : cleanName;
  }

  function parseInviteLabelAndPassword(rawLabel, inviteCode, explicitPassword) {
    const raw = String(rawLabel || '').trim();
    let name = raw;
    let password = String(explicitPassword || '').trim();
    if (raw.includes('||')) {
      const parts = raw.split('||');
      name = (parts[0] || '').trim();
      if (!password) {
        password = parts.slice(1).join('||').trim();
      }
    }
    if (!password && inviteCode) {
      const base = normalizeInviteCode(inviteCode);
      const map = getInvitePasswordMap();
      if (map[base]) {
        password = String(map[base]).trim();
      }
    }
    return { name, password };
  }

  function getAccountHubUrl() {
    const host = (window.location.hostname || '').toLowerCase();
    if (host === 'sheesh.gg' || host === 'www.sheesh.gg' || host === 'localhost' || host === '127.0.0.1') {
      return '/account/';
    }
    return 'https://sheesh.gg/account/';
  }

  function ensureInvitePasswordFieldsInDom() {
    const regForm = document.getElementById('sheesh-form-register');
    if (regForm && !document.getElementById('sheesh-register-invite-password')) {
      const userInp = document.getElementById('sheesh-register-username');
      const userGroup = userInp ? userInp.closest('.sheesh-field-group') : null;
      const passGroup = document.createElement('div');
      passGroup.className = 'sheesh-field-group';
      passGroup.id = 'sheesh-invite-password-group';
      passGroup.innerHTML = `
        <label class="form-label" for="sheesh-register-invite-password">Invite Password</label>
        <input type="text" id="sheesh-register-invite-password" class="form-input" spellcheck="false" autocomplete="off" style="font-family: var(--font-mono, monospace);">
      `;
      if (userGroup && userGroup.parentNode) {
        userGroup.parentNode.insertBefore(passGroup, userGroup);
      } else {
        regForm.insertBefore(passGroup, regForm.firstChild);
      }
    }

    const adminLabelInp = document.getElementById('sheesh-admin-invite-label');
    if (adminLabelInp && !document.getElementById('sheesh-admin-invite-password')) {
      const adminPassInp = document.createElement('input');
      adminPassInp.type = 'text';
      adminPassInp.id = 'sheesh-admin-invite-password';
      adminPassInp.className = 'form-input';
      adminPassInp.placeholder = 'Short invite password';
      adminPassInp.required = true;
      adminPassInp.style.cssText = 'flex: 1; min-width: 150px; font-family: var(--font-mono, monospace);';
      adminLabelInp.insertAdjacentElement('afterend', adminPassInp);
    }
  }

  function showTopBrowserPopup(msg, isSuccess = false) {
    let popup = document.getElementById('sheesh-top-toast-popup');
    if (!msg) {
      if (popup) popup.classList.remove('is-visible');
      return;
    }
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'sheesh-top-toast-popup';
      popup.className = 'sheesh-top-browser-popup';
      popup.setAttribute('role', 'status');
      popup.setAttribute('aria-live', 'polite');
      popup.innerHTML = `
        <span class="sheesh-top-popup-icon" id="sheesh-top-popup-icon"></span>
        <span class="sheesh-top-popup-text" id="sheesh-top-popup-text"></span>
        <button type="button" class="sheesh-top-popup-close" id="sheesh-top-popup-close" title="Dismiss">&times;</button>
      `;
      document.body.appendChild(popup);
      const closeBtn = popup.querySelector('#sheesh-top-popup-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          popup.classList.remove('is-visible');
        });
      }
    }

    const iconEl = popup.querySelector('#sheesh-top-popup-icon');
    const textEl = popup.querySelector('#sheesh-top-popup-text');
    if (iconEl) {
      iconEl.innerHTML = isSuccess
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }
    if (textEl) {
      textEl.textContent = msg;
    }
    popup.classList.toggle('is-success', Boolean(isSuccess));
    popup.classList.add('is-visible');

    if (topPopupHideTimer) clearTimeout(topPopupHideTimer);
    topPopupHideTimer = setTimeout(() => {
      if (popup) popup.classList.remove('is-visible');
    }, 5200);
  }

  function showAlert(msg, isSuccess = false, targetId = 'sheesh-modal-alert') {
    const el = document.getElementById(targetId);
    if (!msg) {
      if (el) {
        el.style.display = 'none';
        el.textContent = '';
      }
      return;
    }
    if (el) {
      el.textContent = msg;
      el.className = 'sheesh-alert-banner' + (isSuccess ? ' is-success' : '');
      el.style.display = 'block';
    }
    showTopBrowserPopup(msg, isSuccess);
  }

  function getSafeDisplayName(user) {
    if (!user) return '';
    if (user.isAdmin) return 'Admin';
    return `@${resolveDisplayUsername(user.username)}`;
  }

  function updateGlobalIndicators() {
    const sidebarBtn = document.getElementById('sheesh-sidebar-btn');
    const dotInline = document.getElementById('sheesh-sidebar-dot-inline');
    const statusText = document.getElementById('sheesh-sidebar-status-text');
    const connBadge = document.getElementById('sheesh-modal-conn-badge');

    const expDot = document.getElementById('export-sheesh-status-dot');
    const expLabel = document.getElementById('export-sheesh-status-label');
    const expOpenLabel = document.getElementById('btn-export-sheesh-open-label');
    const expSyncBtn = document.getElementById('btn-export-sheesh-sync-now');
    const expPullBtn = document.getElementById('btn-export-sheesh-pull');

    if (currentUser) {
      if (sidebarBtn) {
        sidebarBtn.classList.add('is-online');
        sidebarBtn.classList.remove('is-local');
      }
      if (dotInline) dotInline.classList.add('is-online');
      if (statusText) statusText.textContent = 'Logged In';
      if (connBadge) {
        connBadge.textContent = 'Logged In';
        connBadge.classList.add('is-online');
      }
      if (expDot) expDot.style.background = '#22c55e';
      if (expLabel) expLabel.textContent = `Logged In (${getSafeDisplayName(currentUser)})`;
      if (expOpenLabel) expOpenLabel.textContent = 'My Account';
      if (expSyncBtn) expSyncBtn.style.display = 'none';
      if (expPullBtn) expPullBtn.style.display = 'none';
    } else {
      if (sidebarBtn) {
        sidebarBtn.classList.remove('is-online');
        sidebarBtn.classList.add('is-local');
      }
      if (dotInline) dotInline.classList.remove('is-online');
      if (statusText) statusText.textContent = 'Local';
      if (connBadge) {
        connBadge.textContent = 'Local';
        connBadge.classList.remove('is-online');
      }
      if (expDot) expDot.style.background = '';
      if (expLabel) expLabel.textContent = 'Local (Not Signed In)';
      if (expOpenLabel) expOpenLabel.textContent = 'Sign In';
      if (expSyncBtn) expSyncBtn.style.display = 'none';
      if (expPullBtn) expPullBtn.style.display = 'none';
    }
  }

  function renderModalState() {
    const viewAuth = document.getElementById('sheesh-view-auth');
    const viewDash = document.getElementById('sheesh-view-dashboard');
    const authTabs = document.getElementById('sheesh-auth-tabs');
    if (authTabs) authTabs.style.display = 'none';
    const secretAdminEntry = document.getElementById('sheesh-secret-admin-entry');
    const openAdminUrlBtn = document.getElementById('btn-sheesh-open-admin-url');
    const cloudHeader = document.querySelector('#modal-sheesh-cloud .sheesh-modal-header');
    if (cloudHeader) cloudHeader.remove();
    const legacySyncMeta = document.getElementById('sheesh-sync-meta');
    if (legacySyncMeta) {
      const visitBtn = document.createElement('a');
      visitBtn.id = 'btn-sheesh-visit-account';
      visitBtn.className = 'sheesh-visit-account-btn';
      visitBtn.href = 'https://sheesh.gg/account/';
      visitBtn.textContent = 'Visit Account Page';
      legacySyncMeta.replaceWith(visitBtn);
    }
    const visitAccountBtn = document.getElementById('btn-sheesh-visit-account');
    if (visitAccountBtn) {
      visitAccountBtn.setAttribute('href', 'https://sheesh.gg/account/');
    }
    if (secretAdminEntry) {
      secretAdminEntry.style.display = 'block';
      secretAdminEntry.style.borderTop = 'none';
      secretAdminEntry.style.paddingTop = '0.2rem';
    }
    if (openAdminUrlBtn) {
      openAdminUrlBtn.textContent = 'See More...';
      openAdminUrlBtn.setAttribute('href', 'https://sheesh.gg/account/');
      openAdminUrlBtn.style.fontSize = '0.96rem';
      openAdminUrlBtn.style.fontWeight = '600';
    }

    if (!currentUser) {
      if (viewAuth) viewAuth.style.display = 'block';
      if (viewDash) viewDash.style.display = 'none';

      ensureInvitePasswordFieldsInDom();
      const calloutTitle = document.getElementById('sheesh-register-callout-title');
      const calloutDesc = document.getElementById('sheesh-register-callout-desc');
      const inviteGroup = document.getElementById('sheesh-invite-code-group');
      const invitePassGroup = document.getElementById('sheesh-invite-password-group');
      const invitePassInp = document.getElementById('sheesh-register-invite-password');
      const submitRegLabel = document.getElementById('btn-sheesh-submit-register-label');

      if (inviteGroup) inviteGroup.style.display = 'none';
      if (invitePassGroup) invitePassGroup.style.display = needsBootstrap ? 'none' : 'block';
      if (invitePassInp) invitePassInp.required = !needsBootstrap;

      if (needsBootstrap) {
        if (calloutTitle) calloutTitle.textContent = 'First-Time Server Setup';
        if (calloutDesc) calloutDesc.remove();
        if (submitRegLabel) submitRegLabel.textContent = 'Create Account';
      } else {
        if (calloutTitle) {
          calloutTitle.textContent = pendingInviteLabel
            ? `Welcome, ${pendingInviteLabel}! You're Invited — Create Your Account`
            : "You're Invited! Create Your Account";
        }
        if (calloutDesc) calloutDesc.remove();
        if (submitRegLabel) submitRegLabel.textContent = 'Create Account & Sign In';
      }
      return;
    }

    if (viewAuth) viewAuth.style.display = 'none';
    if (viewDash) viewDash.style.display = 'block';

    const avatar = document.getElementById('sheesh-user-avatar');
    const handle = document.getElementById('sheesh-user-handle');

    const safeName = getSafeDisplayName(currentUser);
    if (avatar) avatar.textContent = currentUser.isAdmin ? 'A' : (currentUser.username || 'U').charAt(0).toUpperCase();
    if (handle) handle.textContent = safeName;
  }

  function switchAuthMode(mode) {
    showAlert('');
    const authTabs = document.getElementById('sheesh-auth-tabs');
    if (authTabs) authTabs.style.display = 'none';
    const loginForm = document.getElementById('sheesh-form-login');
    const regForm = document.getElementById('sheesh-form-register');

    // Invite Claim menu is 100% restricted to users following a valid ?invite=sh_... link (or initial server bootstrap)
    const canRegister = Boolean(needsBootstrap || pendingInviteCode);
    if (mode === 'register' && canRegister) {
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'flex';
    } else {
      if (loginForm) loginForm.style.display = 'flex';
      if (regForm) regForm.style.display = 'none';
    }
  }

  // =========================================================================
  // AUTOMATIC CHUNKED CLOUD SYNC FOR CEDAR (Posts, Theme, Branding & Media)
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
        const meta = safeJsonParse(val, null);
        if (meta && meta.__sheeshChunked && typeof meta.count === 'number') {
          let joined = '';
          for (let i = 0; i < meta.count; i++) {
            joined += (rawItems[`${k}__part_${i}`] || '');
          }
          out[k] = joined;
          continue;
        }
      }
      out[k] = val;
    }
    return out;
  }

  function normalizeMediaSyncKey(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const cleaned = rawPath.trim().replace(/[^a-zA-Z0-9:_./-]/g, '_');
    if (!cleaned || cleaned.includes('..')) return '';
    return `media:${cleaned}`;
  }

  async function pushCedarToCloud(options = {}) {
    if (!currentUser || isPullingFromCloud || isPushingToCloud) return;
    isPushingToCloud = true;
    const isDeltaOnly = Boolean(options.deltaOnly);
    const payloadMap = {};
    const activeLogicalKeys = new Set(['config:main', 'index:posts']);

    try {
      // 1. Project Config (stripped of githubToken and inline mediaLibrary dataUrls)
      const safeCfg = stripSecretsFromConfig(window.projectConfig || {});
      const cfgJson = JSON.stringify(safeCfg);
      if (!isDeltaOnly || lastSyncedFingerprints.get('config:main') !== cfgJson) {
        encodeChunkedItem(payloadMap, 'config:main', cfgJson);
        lastSyncedFingerprints.set('config:main', cfgJson);
      }

      // 2. Branding Files (favicon, avatar, site logo data URLs)
      try {
        const brandingRaw = localStorage.getItem('cedar_branding_files_v1');
        if (brandingRaw && brandingRaw.length < MAX_MEDIA_CHARS) {
          activeLogicalKeys.add('branding:files');
          if (!isDeltaOnly || lastSyncedFingerprints.get('branding:files') !== brandingRaw) {
            encodeChunkedItem(payloadMap, 'branding:files', brandingRaw);
            lastSyncedFingerprints.set('branding:files', brandingRaw);
          }
        }
      } catch (_) {}

      // 3. Individual Posts / Pages / Drafts
      const draftsArr = Array.isArray(window.drafts) ? window.drafts : [];
      for (const post of draftsArr) {
        if (!post || !post.id) continue;
        const key = `post:${String(post.id).replace(/[^a-zA-Z0-9:_./-]/g, '_')}`;
        activeLogicalKeys.add(key);
        const postJson = JSON.stringify(post);
        if (!isDeltaOnly || lastSyncedFingerprints.get(key) !== postJson) {
          encodeChunkedItem(payloadMap, key, postJson);
          lastSyncedFingerprints.set(key, postJson);
        }
      }

      // 4. Post Index Manifest
      const indexIds = JSON.stringify(draftsArr.filter(d => d && d.id).map(d => d.id));
      if (!isDeltaOnly || lastSyncedFingerprints.get('index:posts') !== indexIds) {
        payloadMap['index:posts'] = indexIds;
        lastSyncedFingerprints.set('index:posts', indexIds);
      }

      // 5. Uploaded Media Registry (window.imageRegistry)
      const registry = (window.imageRegistry && typeof window.imageRegistry === 'object') ? window.imageRegistry : {};
      for (const [mediaPath, dataUrl] of Object.entries(registry)) {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:') || dataUrl.length > MAX_MEDIA_CHARS) continue;
        const mediaKey = normalizeMediaSyncKey(mediaPath);
        if (!mediaKey) continue;
        activeLogicalKeys.add(mediaKey);
        if (!isDeltaOnly || lastSyncedFingerprints.get(mediaKey) !== dataUrl) {
          encodeChunkedItem(payloadMap, mediaKey, dataUrl);
          lastSyncedFingerprints.set(mediaKey, dataUrl);
        }
      }

      // 6. Compute Deleted Keys (removed posts or removed media)
      const deleteKeys = [];
      for (const prevKey of Array.from(lastSyncedFingerprints.keys())) {
        if ((prevKey.startsWith('post:') || prevKey.startsWith('media:')) && !activeLogicalKeys.has(prevKey)) {
          deleteKeys.push(prevKey);
          lastSyncedFingerprints.delete(prevKey);
        }
      }
      const deletedDraftIds = (window.projectConfig && Array.isArray(window.projectConfig.deletedDraftIds))
        ? window.projectConfig.deletedDraftIds
        : [];
      for (const delId of deletedDraftIds) {
        const delKey = `post:${String(delId).replace(/[^a-zA-Z0-9:_./-]/g, '_')}`;
        if (!activeLogicalKeys.has(delKey) && !deleteKeys.includes(delKey)) {
          deleteKeys.push(delKey);
        }
      }

      const allKeys = Object.keys(payloadMap);
      if (allKeys.length === 0 && deleteKeys.length === 0) {
        const headline = document.getElementById('sheesh-sync-headline');
        if (headline) headline.textContent = 'Synced across your devices';
        updateGlobalIndicators('Synced');
        return;
      }

      updateGlobalIndicators('Saving...');
      const headline = document.getElementById('sheesh-sync-headline');
      if (headline) headline.textContent = 'Syncing changes...';

      // Send in small batches of 6 chunks per request so D1 never hits payload limits
      const BATCH_SIZE = 6;
      const totalBatches = Math.max(1, Math.ceil(allKeys.length / BATCH_SIZE));
      for (let b = 0; b < totalBatches; b++) {
        const batchKeys = allKeys.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        const batchObj = {};
        for (const k of batchKeys) batchObj[k] = payloadMap[k];
        const reqBody = { items: batchObj };
        if (b === 0 && deleteKeys.length > 0) {
          reqBody.deleteKeys = deleteKeys.slice(0, 64);
        }
        const putRes = await apiRequest('/sync/cedar', {
          method: 'PUT',
          keepalive: Boolean(options.keepalive),
          body: reqBody
        });
        if (putRes && putRes.updatedAt) {
          lastServerUpdatedAt = Math.max(lastServerUpdatedAt, Number(putRes.updatedAt));
        }
      }

      localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
      updateGlobalIndicators('Synced');
      if (headline) headline.textContent = 'Synced across your devices';
    } catch (err) {
      console.warn('[SheeshCloud] Sync notice:', err);
      updateGlobalIndicators('Synced');
      const headline = document.getElementById('sheesh-sync-headline');
      if (headline) headline.textContent = 'Synced across your devices';
    } finally {
      isPushingToCloud = false;
    }
  }

  async function pullCedarFromCloud() {
    if (!currentUser || isPullingFromCloud) return;
    try {
      isPullingFromCloud = true;
      const res = await apiRequest('/sync/cedar');
      if (res && res.updatedAt) {
        lastServerUpdatedAt = Math.max(lastServerUpdatedAt, Number(res.updatedAt));
      }
      const rawItems = (res && res.items) ? res.items : {};
      const items = decodeChunkedItems(rawItems);
      const keys = Object.keys(items);

      // Suppress FTUE wizard for authenticated cloud users
      try {
        localStorage.setItem('cedar_ftue_completed', '1');
        if (window.CedarFTUE && typeof window.CedarFTUE.close === 'function') {
          window.CedarFTUE.close();
        }
      } catch (_) {}

      if (keys.length === 0) {
        isPullingFromCloud = false;
        await pushCedarToCloud({ deltaOnly: false });
        return;
      }

      // 1. Restore Media Blobs into window.imageRegistry & CedarVirtualStorage first
      window.imageRegistry = window.imageRegistry || {};
      for (const k of keys) {
        if (k.startsWith('media:')) {
          const mediaPath = k.slice('media:'.length);
          const dataUrl = items[k];
          if (mediaPath && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            window.imageRegistry[mediaPath] = dataUrl;
            lastSyncedFingerprints.set(k, dataUrl);
            try {
              if (window.CedarVirtualStorage && typeof window.CedarVirtualStorage.writeFile === 'function') {
                await window.CedarVirtualStorage.writeFile(mediaPath, dataUrl);
              }
            } catch (_) {}
          }
        }
      }

      // 2. Restore Branding Files (favicon, avatar, logo)
      if (items['branding:files']) {
        try {
          const parsedBrand = safeJsonParse(items['branding:files'], null);
          if (parsedBrand && typeof parsedBrand === 'object') {
            localStorage.setItem('cedar_branding_files_v1', JSON.stringify(parsedBrand));
            lastSyncedFingerprints.set('branding:files', items['branding:files']);
          }
        } catch (_) {}
      }

      // 3. Restore Project Config & Theme
      if (items['config:main']) {
        const parsedCfg = safeJsonParse(items['config:main'], null);
        if (parsedCfg && typeof parsedCfg === 'object') {
          const localCfg = window.projectConfig || {};
          const preservedGithubToken = localCfg.githubToken || '';
          const localTime = localCfg.lastUpdated ? new Date(localCfg.lastUpdated).getTime() : 0;
          const cloudTime = parsedCfg.lastUpdated ? new Date(parsedCfg.lastUpdated).getTime() : 0;
          const mergedDelIds = Array.from(new Set([
            ...(Array.isArray(localCfg.deletedDraftIds) ? localCfg.deletedDraftIds : []),
            ...(Array.isArray(parsedCfg.deletedDraftIds) ? parsedCfg.deletedDraftIds : [])
          ]));
          const mergedDelCats = Array.from(new Set([
            ...(Array.isArray(localCfg.deletedCategories) ? localCfg.deletedCategories : []),
            ...(Array.isArray(parsedCfg.deletedCategories) ? parsedCfg.deletedCategories : [])
          ]));
          const mergedRenamedCats = Object.assign({}, parsedCfg.renamedCategories || {}, localCfg.renamedCategories || {});
          const preservedCats = (localTime > cloudTime && Array.isArray(localCfg.categories))
            ? localCfg.categories
            : (Array.isArray(parsedCfg.categories) ? parsedCfg.categories : (localCfg.categories || []));
          const activeCatsLowerSet = new Set(preservedCats.map(c => String(c || '').trim().toLowerCase()).filter(Boolean));
          const cleanDelCats = mergedDelCats.filter(dc => !activeCatsLowerSet.has(String(dc || '').trim().toLowerCase()));

          window.projectConfig = Object.assign(localCfg, parsedCfg, {
            categories: preservedCats,
            deletedDraftIds: mergedDelIds,
            deletedCategories: cleanDelCats,
            renamedCategories: mergedRenamedCats
          });
          if (preservedGithubToken) {
            window.projectConfig.githubToken = preservedGithubToken;
          }

          // Re-link mediaLibrary entries with restored imageRegistry dataUrls
          if (Array.isArray(window.projectConfig.mediaLibrary)) {
            window.projectConfig.mediaLibrary.forEach(item => {
              if (!item || typeof item !== 'object') return;
              const lookupKey = item.path || item.name || item.id;
              if (lookupKey && window.imageRegistry[lookupKey]) {
                item.dataUrl = window.imageRegistry[lookupKey];
              }
            });
          }

          // Apply synced theme across devices
          const resolvedTheme = parsedCfg.cedarThemePreference || parsedCfg.cedarTheme || parsedCfg.theme;
          if (resolvedTheme && typeof resolvedTheme === 'string') {
            try {
              localStorage.setItem('cedar_theme_preference', resolvedTheme);
              if (window.CedarFTUE && typeof window.CedarFTUE.applyLiveTheme === 'function') {
                window.CedarFTUE.applyLiveTheme(resolvedTheme, false);
              } else {
                document.documentElement.setAttribute('data-theme', resolvedTheme);
              }
            } catch (_) {}
          }

          lastSyncedFingerprints.set('config:main', items['config:main']);
        }
      }

      // 4. Restore & Sanitize Posts / Pages / Drafts
      const postMap = new Map();
      for (const k of keys) {
        if (k.startsWith('post:')) {
          const rawPost = safeJsonParse(items[k], null);
          const p = sanitizePostObject(rawPost);
          if (p && p.id) {
            postMap.set(String(p.id), p);
            lastSyncedFingerprints.set(k, items[k]);
          }
        }
      }

      if (postMap.size > 0 || items['index:posts']) {
        let orderedPosts = [];
        let hasValidIndex = false;
        if (items['index:posts']) {
          const orderIds = safeJsonParse(items['index:posts'], null);
          lastSyncedFingerprints.set('index:posts', items['index:posts']);
          if (Array.isArray(orderIds)) {
            hasValidIndex = true;
            for (const id of orderIds) {
              if (postMap.has(String(id))) {
                orderedPosts.push(postMap.get(String(id)));
                postMap.delete(String(id));
              }
            }
            for (const remaining of postMap.values()) {
              orderedPosts.push(remaining);
            }
          }
        }
        if (!hasValidIndex) {
          for (const remaining of postMap.values()) {
            orderedPosts.push(remaining);
          }
        }
        const delIds = (window.CedarStore && typeof window.CedarStore.getDeletedIdsSet === 'function')
          ? window.CedarStore.getDeletedIdsSet()
          : new Set((window.projectConfig && window.projectConfig.deletedDraftIds) || []);
        const delCatsLower = new Set(
          ((window.projectConfig && window.projectConfig.deletedCategories) || [])
            .map(c => String(c || '').trim().toLowerCase())
            .filter(Boolean)
        );
        orderedPosts = orderedPosts.filter(p => {
          if (!p || !p.id || delIds.has(String(p.id))) return false;
          if (p.isCategoryAggregate || String(p.id).startsWith('page_cat_')) {
            const cName = String(p.categoryAggregate || p.title || '').trim().toLowerCase();
            if (delCatsLower.has(cName)) return false;
          }
          return true;
        });
        if (window.CedarStore && typeof window.CedarStore.hydrateFromList === 'function') {
          window.CedarStore.hydrateFromList(orderedPosts);
        } else {
          window.drafts = orderedPosts;
        }
        if (typeof window.syncCategoryPages === 'function') {
          window.syncCategoryPages();
        }
      }

      // 5. Persist & Re-hydrate All Cedar UI Views
      if (typeof window.saveProjectToStorage === 'function') {
        window.saveProjectToStorage({ silent: true });
      }
      if (typeof window.saveDraftsToStorage === 'function') {
        await window.saveDraftsToStorage();
      }
      if (typeof window.updateCedarTitle === 'function') {
        window.updateCedarTitle();
      }
      if (typeof window.renderProjectSettings === 'function') {
        window.renderProjectSettings();
      }
      if (typeof window.renderSettingsAuthorProfile === 'function') {
        window.renderSettingsAuthorProfile();
      }
      if (typeof window.renderTaxonomy === 'function') {
        window.renderTaxonomy();
      }
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
      if (typeof window.renderStaticPages === 'function') {
        window.renderStaticPages();
      }
      if (typeof window.renderHomeDashboard === 'function') {
        window.renderHomeDashboard();
      }
      if (typeof window.updateAllPreviewFrames === 'function') {
        window.updateAllPreviewFrames();
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

  async function checkRemoteMetaAndPullIfNewer() {
    if (!currentUser || isPullingFromCloud || isPushingToCloud || syncDebounceTimer) return;
    try {
      const meta = await apiRequest('/sync/cedar?meta=1');
      const remoteTs = Number(meta && meta.updatedAt) || 0;
      if (remoteTs > 0 && remoteTs > lastServerUpdatedAt) {
        await pullCedarFromCloud();
      }
    } catch (_) {}
  }

  function scheduleAutoSync() {
    if (!currentUser || isPullingFromCloud) return;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncDebounceTimer = null;
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

    if (!window.__sheeshLifecycleBound) {
      window.__sheeshLifecycleBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          if (syncDebounceTimer) {
            clearTimeout(syncDebounceTimer);
            syncDebounceTimer = null;
            pushCedarToCloud({ deltaOnly: true, keepalive: true });
          }
        } else if (document.visibilityState === 'visible') {
          checkRemoteMetaAndPullIfNewer();
        }
      });
      window.addEventListener('focus', () => {
        checkRemoteMetaAndPullIfNewer();
      });
    }
  }

  // =========================================================================
  // SEPARATE ADMIN PANEL (/?admin)
  // =========================================================================

  async function loadAdminOverview() {
    const invitesList = document.getElementById('sheesh-admin-invites-list');
    const usersList = document.getElementById('sheesh-admin-users-list');
    const fbList = document.getElementById('sheesh-admin-feedback-list');
    const delList = document.getElementById('sheesh-admin-deleted-list');

    try {
      const data = await apiRequest('/admin/overview');
      const invites = Array.isArray(data.invites) ? data.invites.filter(i => !i.used_by && !i.revoked) : [];
      // Filter out the secret admin account from the roster so only invited friends are shown
      const users = Array.isArray(data.users)
        ? data.users.filter(u => !(Array.isArray(u.roles) && u.roles.includes('admin')))
        : [];
      const feedback = Array.isArray(data.feedback) ? data.feedback : [];
      const deletedAccounts = Array.isArray(data.deletedAccounts) ? data.deletedAccounts : [];

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
                  <strong style="font-size: 0.84rem;">Invite for: ${escapeHtml(inv.label || 'Unnamed')}</strong>
                  <div style="font-size: 0.73rem; color: var(--text-muted);">Link ready to send &middot; Created ${formatRelativeTime(inv.created_at)}</div>
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
                    ${u.label ? `<span style="font-size: 0.78rem; color: var(--text-muted);"> — Invited: <strong>${escapeHtml(u.label)}</strong></span>` : ''}
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

      if (delList) {
        if (deletedAccounts.length === 0) {
          delList.innerHTML = `<div class="sheesh-empty-row">No deleted accounts.</div>`;
        } else {
          delList.innerHTML = deletedAccounts.map(d => `
            <div class="sheesh-admin-row">
              <div>
                <strong style="font-size: 0.84rem; color: #fca5a5;">@${escapeHtml(d.username)}</strong>
                ${d.label ? `<span style="font-size: 0.76rem; color: var(--text-muted);"> — Invite given to: <strong>${escapeHtml(d.label)}</strong></span>` : ''}
                <div style="font-size: 0.72rem; color: var(--text-muted);">Deleted ${formatRelativeTime(d.deleted_at)}</div>
              </div>
              <span class="sheesh-role-pill" style="color: #f87171; border-color: rgba(239,68,68,0.35);">Deleted</span>
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
    closeSheeshModal({ keepHistory: true });
    const adminModal = document.getElementById('modal-sheesh-admin');
    if (!adminModal) return;
    showAlert('', false, 'sheesh-admin-alert');
    pushModalHistoryState();
    adminModal.style.display = 'flex';
    loadAdminOverview();
  }

  function closeAdminModal(options) {
    const adminModal = document.getElementById('modal-sheesh-admin');
    if (adminModal) adminModal.style.display = 'none';
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('admin')) {
        url.searchParams.delete('admin');
        window.history.replaceState(window.history.state, document.title, url.pathname + url.search + url.hash);
      }
    } catch (_) {}
    popModalHistoryStateIfNeeded(options);
  }

  // =========================================================================
  // MODAL HISTORY & BACK-BUTTON INTERCEPTION
  // =========================================================================

  let modalHistoryPushed = false;
  let isClosingViaHistoryBack = false;
  let modalHistoryListenerBound = false;

  function isModalVisible(el) {
    return Boolean(el && el.style.display && el.style.display !== 'none');
  }

  function isAnySheeshModalOpen() {
    return isModalVisible(document.getElementById('modal-sheesh-cloud')) ||
           isModalVisible(document.getElementById('modal-sheesh-admin'));
  }

  function pushModalHistoryState() {
    ensureModalHistoryListener();
    if (modalHistoryPushed) return;
    try {
      const baseState = (window.history && window.history.state && typeof window.history.state === 'object')
        ? Object.assign({}, window.history.state)
        : {};
      baseState.__sheeshModalOpen = true;
      window.history.pushState(baseState, document.title, window.location.href);
      modalHistoryPushed = true;
    } catch (_) {}
  }

  function popModalHistoryStateIfNeeded(options) {
    const fromPopState = Boolean(options && options.fromPopState);
    const keepHistory = Boolean(options && options.keepHistory);
    if (fromPopState) {
      modalHistoryPushed = false;
      return;
    }
    if (keepHistory) {
      return;
    }
    if (modalHistoryPushed && !isAnySheeshModalOpen()) {
      modalHistoryPushed = false;
      isClosingViaHistoryBack = true;
      try {
        window.history.back();
      } catch (_) {
        isClosingViaHistoryBack = false;
      }
    }
  }

  function ensureModalHistoryListener() {
    if (modalHistoryListenerBound) return;
    modalHistoryListenerBound = true;

    window.addEventListener('popstate', (e) => {
      if (isClosingViaHistoryBack) {
        isClosingViaHistoryBack = false;
        e.stopImmediatePropagation();
        return;
      }
      if (isAnySheeshModalOpen()) {
        modalHistoryPushed = false;
        closeSheeshModal({ fromPopState: true });
        closeAdminModal({ fromPopState: true });
        e.stopImmediatePropagation();
      }
    }, true);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isAnySheeshModalOpen()) {
        if (isModalVisible(document.getElementById('modal-sheesh-admin'))) {
          closeAdminModal();
        } else {
          closeSheeshModal();
        }
      }
    });
  }

  // =========================================================================
  // USER MODAL OPEN / CLOSE & EVENT WIRING
  // =========================================================================

  async function openSheeshModal(initialMode) {
    const modal = document.getElementById('modal-sheesh-cloud');
    if (!modal) return;
    showAlert('');
    pushModalHistoryState();
    modal.style.display = 'flex';

    const phraseCode = document.getElementById('sheesh-rolled-passphrase');
    if (phraseCode && !phraseCode.dataset.initialized) {
      phraseCode.textContent = rollPassphrase();
      phraseCode.dataset.initialized = 'true';
    }

    if (!currentUser || pendingInviteCode) {
      try {
        const normalizedCode = pendingInviteCode ? normalizeInviteCode(pendingInviteCode) : '';
        if (normalizedCode) pendingInviteCode = normalizedCode;
        const st = await apiRequest(`/status${pendingInviteCode ? `?invite=${encodeURIComponent(pendingInviteCode)}` : ''}`);
        needsBootstrap = Boolean(st && st.needsBootstrap);
        if (pendingInviteCode && st && st.inviteValid === false) {
          pendingInviteCode = '';
          pendingInviteLabel = '';
          pendingInvitePassword = '';
          switchAuthMode('login');
          showAlert('This invite link is invalid or has already been claimed.');
        } else if (needsBootstrap || pendingInviteCode) {
          if (pendingInviteCode && st) {
            const parsed = parseInviteLabelAndPassword(st.inviteLabel, pendingInviteCode, st.invitePassword);
            pendingInviteLabel = parsed.name;
            pendingInvitePassword = parsed.password;
          }
          currentUser = null;
          switchAuthMode('register');
        } else {
          switchAuthMode('login');
        }
      } catch (_) {
        if (pendingInviteCode) {
          switchAuthMode('register');
        } else {
          switchAuthMode('login');
        }
      }
    }

    renderModalState();
  }

  function closeSheeshModal(options) {
    const modal = document.getElementById('modal-sheesh-cloud');
    if (modal) modal.style.display = 'none';
    popModalHistoryStateIfNeeded(options);
  }

  function bindEvents() {
    ensureModalHistoryListener();
    if (!window.__sheeshFtueSigninBound) {
      window.__sheeshFtueSigninBound = true;
      document.addEventListener('click', (e) => {
        const ftueSignInBtn = e.target && e.target.closest
          ? e.target.closest('#ftue-btn-sheesh-signin, [data-action="ftue-sheesh-signin"]')
          : null;
        if (ftueSignInBtn) {
          e.preventDefault();
          e.stopPropagation();
          openSheeshModal('login');
        }
      });
    }

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
      openAdminUrlBtn.setAttribute('href', 'https://sheesh.gg/account/');
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
          const ftueModal = document.getElementById('modal-ftue');
          const wasFtueOpen = Boolean(ftueModal && ftueModal.style.display && ftueModal.style.display !== 'none');
          const res = await apiRequest('/auth/login', {
            method: 'POST',
            body: { username, passphrase, persistent: remember }
          });
          await ensureLocalUserIsolation(res.user);
          storeToken(res.token, remember);
          currentUser = res.user;
          updateGlobalIndicators('Synced');
          renderModalState();
          await pullCedarFromCloud();
          if (wasFtueOpen) {
            closeSheeshModal();
          }
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
        const rawInviteCode = (document.getElementById('sheesh-register-invite')?.value || pendingInviteCode || '').trim();
        const inviteCode = normalizeInviteCode(rawInviteCode);
        const rawUsername = (document.getElementById('sheesh-register-username')?.value || '').trim();
        const invitePassword = (document.getElementById('sheesh-register-invite-password')?.value || '').trim();
        const passphrase = (document.getElementById('sheesh-rolled-passphrase')?.textContent || '').trim().toLowerCase();
        const confirmedSaved = Boolean(document.getElementById('sheesh-register-confirm-saved')?.checked);
        const remember = Boolean(document.getElementById('sheesh-register-remember')?.checked);

        if (!needsBootstrap && !inviteCode) {
          showAlert('Please enter your invite code.');
          return;
        }
        if (!needsBootstrap) {
          if (!invitePassword) {
            showAlert('Please enter the short invite password for this invite link.');
            return;
          }
          const expectedPass = pendingInvitePassword || getInvitePasswordMap()[inviteCode] || '';
          if (expectedPass && invitePassword !== expectedPass && invitePassword.toLowerCase() !== expectedPass.toLowerCase()) {
            showAlert('Incorrect invite password. Please check the short password given to you with this invite link.');
            return;
          }
        }
        if (!/^[a-zA-Z0-9_-]{2,24}$/.test(rawUsername)) {
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
            body: { inviteCode, username: rawUsername, invitePassword, passphrase, persistent: remember }
          });
          setUsernameCasingInMap(rawUsername, inviteCode);
          const parsedResLabel = parseInviteLabelAndPassword(res.user && res.user.label, inviteCode).name;
          const greetedLabel = pendingInviteLabel || parsedResLabel || '';
          needsBootstrap = false;
          pendingInviteCode = '';
          pendingInviteLabel = '';
          pendingInvitePassword = '';
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('invite')) {
              url.searchParams.delete('invite');
              window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
            }
          } catch (_) {}

          if (res.user) {
            res.user.username = rawUsername;
            res.user.label = parsedResLabel;
          }
          await ensureLocalUserIsolation(res.user);
          storeToken(res.token, remember);
          currentUser = res.user;
          try {
            localStorage.setItem('cedar_ftue_completed', '1');
            if (window.CedarFTUE && typeof window.CedarFTUE.close === 'function') {
              window.CedarFTUE.close();
            }
          } catch (_) {}
          updateGlobalIndicators('Synced');
          renderModalState();
          const welcomeName = greetedLabel && !currentUser.isAdmin
            ? `${greetedLabel} (${getSafeDisplayName(currentUser)})`
            : getSafeDisplayName(currentUser);
          const successMsg = `Account created! Welcome to sheesh.gg, ${welcomeName}! Your passphrase is ${passphrase}`;
          showAlert(successMsg, true);
          try {
            sessionStorage.setItem(STORAGE_KEY_FLASH_POPUP, JSON.stringify({ msg: successMsg, isSuccess: true }));
          } catch (_) {}
          await pushCedarToCloud({ deltaOnly: false }).catch(() => {});
          if (!(window.location.pathname || '').toLowerCase().startsWith('/account')) {
            window.location.href = getAccountHubUrl();
          }
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
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer);
          syncDebounceTimer = null;
        }
        try {
          await apiRequest('/auth/logout', { method: 'POST' });
        } catch (_) {}
        storeToken(null, false);
        try {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_USER);
        } catch (_) {}
        currentUser = null;
        await wipeCedarLocalWorkspace();
        updateGlobalIndicators();
        renderModalState();
        closeSheeshModal();
        window.location.reload();
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
        if (!label) {
          showAlert('Please enter a name to associate with this invite link so it greets them and records who you gave it to.', false, 'sheesh-admin-alert');
          if (labelInp) labelInp.focus();
          return;
        }
        const roleChecks = document.querySelectorAll('#modal-sheesh-admin .sheesh-role-check input[type="checkbox"]:checked');
        const roles = Array.from(roleChecks).map(c => c.value);

        createInviteBtn.disabled = true;
        try {
          showAlert('', false, 'sheesh-admin-alert');
          const res = await apiRequest('/admin/invites', {
            method: 'POST',
            body: { label, roles }
          });
          const fullUrl = `${window.location.origin}/?invite=${encodeURIComponent(res.invite.code)}`;
          const box = document.getElementById('sheesh-generated-invite-box');
          const boxTitle = document.getElementById('sheesh-generated-invite-title');
          const urlInp = document.getElementById('sheesh-generated-invite-url');
          if (boxTitle) {
            boxTitle.innerHTML = `✓ Invite link for <strong>${escapeHtml(res.invite.label || label)}</strong> copied! Send this URL to them:`;
          }
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

    if (initPromise) return initPromise;

    initPromise = (async () => {
      ensureInvitePasswordFieldsInDom();
      const isAccountPage = (window.location.pathname || '').toLowerCase().startsWith('/account');
      let wantsAdminUrl = false;
      try {
        const params = new URLSearchParams(window.location.search);
        const inv = params.get('invite');
        if (inv && inv.trim()) {
          pendingInviteCode = normalizeInviteCode(inv.trim());
          const invInput = document.getElementById('sheesh-register-invite');
          if (invInput) invInput.value = pendingInviteCode;
        }
        if (params.has('admin') || window.location.hash === '#admin') {
          wantsAdminUrl = true;
        }
      } catch (_) {}

      if (pendingInviteCode && !isAccountPage) {
        openSheeshModal('register');
        return null;
      }

      try {
        const meRes = await apiRequest('/auth/me');
        if (meRes && meRes.user) {
          await ensureLocalUserIsolation(meRes.user);
          currentUser = meRes.user;
          updateGlobalIndicators('Synced');
          renderModalState();
          if (wantsAdminUrl && currentUser.isAdmin && !isAccountPage) {
            openAdminModal();
          }
          await pullCedarFromCloud();
          return currentUser;
        }
      } catch (_) {
        currentUser = null;
        updateGlobalIndicators();
      }

      if (!isAccountPage) {
        if (pendingInviteCode) {
          openSheeshModal('register');
        } else if (wantsAdminUrl) {
          openSheeshModal('login');
        }
      }
      return null;
    })();

    return initPromise;
  }

  function hasPendingCloudIntent() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('invite') || params.has('admin') || window.location.hash === '#admin') {
        return true;
      }
      if (getStoredToken()) return true;
    } catch (_) {}
    return Boolean(currentUser);
  }

  window.SheeshCloud = {
    init: initSheeshCloud,
    openModal: openSheeshModal,
    closeModal: closeSheeshModal,
    openAdmin: openAdminModal,
    pushNow: () => pushCedarToCloud({ deltaOnly: false }),
    pullNow: () => pullCedarFromCloud(),
    rollPassphrase,
    getUser: () => currentUser,
    hasPendingCloudIntent
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initSheeshCloud, 120));
  } else {
    setTimeout(initSheeshCloud, 120);
  }
})();
