/**
 * Cedar — Zero-Server BYO-GitHub Storage & Cloud Sync Engine
 * Direct browser-to-api.github.com REST client with fine-grained PAT.
 * Features:
 *  - 100% Client-Side: Zero tokens or data stored on central servers
 *  - Atomic Batch Commits: Uses Git Trees API (1 commit = 1 Cloudflare build)
 *  - 3-Folder Quarantine: blog/ (published only), drafts/ (unreleased), hidden/ (archived)
 *  - Collision & Iteration Guard: Prevents accidental overwrites across devices
 *  - Passive Freshness Checking: Background checks on tab focus / periodic interval
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.vault = window.Cedar.vault || {};

  const STORAGE_KEYS = {
    REPO: 'cedar_github_repo',
    TOKEN: 'cedar_github_token',
    BRANCH: 'cedar_github_branch',
    LAST_SHA: 'cedar_github_last_synced_sha',
    LAST_REV: 'cedar_github_last_synced_rev',
    LAST_TIME: 'cedar_github_last_synced_time',
    DEVICE: 'cedar_device_name'
  };

  function getDeviceName() {
    let dev = localStorage.getItem(STORAGE_KEYS.DEVICE);
    if (!dev) {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isWin = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
      const os = isMac ? 'Mac' : isWin ? 'Windows' : 'Device';
      dev = `${os} (${Math.random().toString(36).substring(2, 6)})`;
      localStorage.setItem(STORAGE_KEYS.DEVICE, dev);
    }
    return dev;
  }

  function parseGitHubRepoInput(raw) {
    let s = String(raw || '').trim();
    if (!s) return { repo: '', branch: '' };
    s = s.replace(/^git@github\.com:/i, 'https://github.com/');
    if (/^(?:www\.)?github\.com\//i.test(s)) {
      s = 'https://' + s;
    }
    let extractedBranch = '';
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        if (u.hostname.toLowerCase().endsWith('github.com')) {
          const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
          if (parts.length >= 2) {
            const owner = parts[0];
            const repoName = parts[1].replace(/\.git$/i, '');
            if (parts[2] === 'tree' && parts[3]) {
              extractedBranch = decodeURIComponent(parts.slice(3).join('/'));
            }
            return { repo: `${owner}/${repoName}`, branch: extractedBranch };
          }
        }
      } catch (e) {}
    }
    s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    const parts = s.split('/').filter(Boolean);
    if (parts.length >= 2) {
      if (parts[2] === 'tree' && parts[3]) {
        extractedBranch = parts.slice(3).join('/');
      }
      return { repo: `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`, branch: extractedBranch };
    }
    return { repo: s, branch: '' };
  }

  function getCredentials() {
    const rawRepo = (localStorage.getItem(STORAGE_KEYS.REPO) || '').trim();
    const token = (localStorage.getItem(STORAGE_KEYS.TOKEN) || '').trim();
    const storedBranch = (localStorage.getItem(STORAGE_KEYS.BRANCH) || '').trim();
    const parsed = parseGitHubRepoInput(rawRepo);
    const repo = parsed.repo;
    const branch = parsed.branch || storedBranch || 'main';
    return { repo, token, branch };
  }

  function isConfigured() {
    const { repo, token } = getCredentials();
    return Boolean(repo && token && repo.includes('/'));
  }

  let githubAutoSaveTimer = null;

  function saveCredentials(repo, token, branch = 'main') {
    const parsed = parseGitHubRepoInput(repo);
    const cleanRepo = parsed.repo;
    const effBranch = parsed.branch || (branch || 'main').trim();
    const prevRepo = localStorage.getItem(STORAGE_KEYS.REPO) || '';
    const prevBranch = localStorage.getItem(STORAGE_KEYS.BRANCH) || 'main';
    if (prevRepo && (prevRepo !== cleanRepo || prevBranch !== effBranch)) {
      localStorage.removeItem(STORAGE_KEYS.LAST_SHA);
      localStorage.removeItem(STORAGE_KEYS.LAST_REV);
      localStorage.removeItem(STORAGE_KEYS.LAST_TIME);
    }
    localStorage.setItem(STORAGE_KEYS.REPO, cleanRepo);
    localStorage.setItem(STORAGE_KEYS.TOKEN, (token || '').trim());
    localStorage.setItem(STORAGE_KEYS.BRANCH, effBranch);
    if (window.projectConfig) {
      window.projectConfig.githubRepo = cleanRepo;
      window.projectConfig.githubBranch = effBranch;
      if (typeof window.saveProjectToStorage === 'function') {
        clearTimeout(githubAutoSaveTimer);
        githubAutoSaveTimer = setTimeout(() => {
          window.saveProjectToStorage();
        }, 250);
      }
    }
    updateSyncBadges();
  }

  function clearCredentials() {
    localStorage.removeItem(STORAGE_KEYS.REPO);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.BRANCH);
    localStorage.removeItem(STORAGE_KEYS.LAST_SHA);
    localStorage.removeItem(STORAGE_KEYS.LAST_REV);
    localStorage.removeItem(STORAGE_KEYS.LAST_TIME);
    updateSyncBadges();
  }

  /**
   * Helper: Standard GitHub API fetch with authorization and error handling
   */
  async function apiRequest(endpoint, options = {}) {
    const { token } = getCredentials();
    if (!token) throw new Error('GitHub Personal Access Token is missing.');

    const url = endpoint.startsWith('https://') ? endpoint : `https://api.github.com${endpoint}`;
    const headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, Object.assign({ cache: 'no-store' }, options, { headers }));
    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.message || res.statusText;
      } catch (e) {
        errText = await res.text() || res.statusText;
      }
      const err = new Error(`GitHub API Error (${res.status}): ${errText}`);
      err.status = res.status;
      throw err;
    }

    if (res.status === 204) return null;
    return await res.json();
  }

  /**
   * Test user's token and repository access
   */
  async function testConnection(repoInput, tokenInput) {
    const parsed = parseGitHubRepoInput(repoInput);
    const repo = parsed.repo;
    const token = (tokenInput || '').trim();

    if (!repo || !repo.includes('/')) {
      return { ok: false, error: 'Please enter a valid GitHub repository URL or "username/repository-name".' };
    }
    if (!token) {
      return { ok: false, error: 'Personal Access Token is required.' };
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = await res.json();
          msg = j.message || msg;
        } catch (e) {}
        if (res.status === 401) return { ok: false, error: 'Authentication failed: Invalid Personal Access Token.' };
        if (res.status === 404) return { ok: false, error: 'Repository not found or token lacks access. For private repos, ensure your Fine-Grained token has your repo selected + "Contents: Read and write" saved together (or use a Classic token with "repo" checked).' };
        return { ok: false, error: `GitHub error (${res.status}): ${msg}` };
      }

      const data = await res.json();
      if (data.permissions && data.permissions.push === false) {
        return {
          ok: false,
          error: 'Connected to repo, but token is Read-Only! Enable "Contents: Read and write" (Fine-Grained token) or check "repo" (Classic token) so Cedar can publish.'
        };
      }
      return {
        ok: true,
        repoName: data.full_name,
        isPrivate: data.private,
        defaultBranch: data.default_branch || 'main',
        permissions: data.permissions || {}
      };
    } catch (e) {
      return { ok: false, error: `Network error: ${e.message}` };
    }
  }

  /**
   * Fetch the latest commit SHA and sync.json revision from GitHub
   */
  async function getRemoteStatus() {
    if (!isConfigured()) return null;
    const { repo, branch } = getCredentials();

    try {
      // 1. Get branch head commit
      const refData = await apiRequest(`/repos/${repo}/commits/${branch}`);
      const headSha = refData.sha;
      const lastCommitDate = refData.commit?.committer?.date || refData.commit?.author?.date;

      // 2. Fetch sync.json if available
      let syncMeta = null;
      try {
        const fileData = await apiRequest(`/repos/${repo}/contents/sync.json?ref=${branch}`);
        if (fileData && fileData.content) {
          const decoded = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
          syncMeta = JSON.parse(decoded);
        }
      } catch (e) {
        // sync.json might not exist yet on a fresh repo
      }

      return {
        headSha,
        lastCommitDate,
        revision: syncMeta?.revision || 0,
        lastSavedAt: syncMeta?.lastSavedAt || lastCommitDate,
        device: syncMeta?.deviceName || 'GitHub'
      };
    } catch (e) {
      console.warn('[GitHubSync] getRemoteStatus error:', e);
      return null;
    }
  }

  /**
   * PULL WORKSPACE: Reads config.json, writer/drafts.json, and sync.json
   */
  async function pullFromGitHub(options = {}) {
    if (!isConfigured()) {
      throw new Error('GitHub sync is not configured. Please enter your repository and token in Settings.');
    }
    const { repo, branch } = getCredentials();
    if (typeof window.showToast === 'function') window.showToast('Pulling workspace from GitHub...');

    try {
      // 1. Fetch remote status
      const remote = await getRemoteStatus();
      if (!remote) throw new Error('Could not connect to GitHub repository.');

      // 2. Read config.json
      let cfgData = null;
      try {
        const res = await apiRequest(`/repos/${repo}/contents/config.json?ref=${branch}`);
        if (res && res.content) {
          const decoded = decodeURIComponent(escape(atob(res.content.replace(/\s/g, ''))));
          cfgData = JSON.parse(decoded);
        }
      } catch (e) {
        console.warn('[GitHubSync] config.json not found on remote:', e);
      }

      // 3. Read editor/drafts.json (fallback to writer/drafts.json and legacy static-writer/drafts.json)
      let draftsData = null;
      try {
        const res = await apiRequest(`/repos/${repo}/contents/editor/drafts.json?ref=${branch}`);
        if (res && res.content) {
          const decoded = decodeURIComponent(escape(atob(res.content.replace(/\s/g, ''))));
          draftsData = JSON.parse(decoded);
        }
      } catch (e) {
        try {
          const resWriter = await apiRequest(`/repos/${repo}/contents/writer/drafts.json?ref=${branch}`);
          if (resWriter && resWriter.content) {
            const decoded = decodeURIComponent(escape(atob(resWriter.content.replace(/\s/g, ''))));
            draftsData = JSON.parse(decoded);
          }
        } catch (eWriter) {
          try {
            const resLegacy = await apiRequest(`/repos/${repo}/contents/static-writer/drafts.json?ref=${branch}`);
            if (resLegacy && resLegacy.content) {
              const decoded = decodeURIComponent(escape(atob(resLegacy.content.replace(/\s/g, ''))));
              draftsData = JSON.parse(decoded);
            }
          } catch (e2) {
            console.warn('[GitHubSync] editor/drafts.json not found on remote:', e2);
          }
        }
      }

      // 3b. Fallback to site-data.js if remote is a Web Publish repository
      if (!cfgData || !draftsData) {
        try {
          const resSite = await apiRequest(`/repos/${repo}/contents/site-data.js?ref=${branch}`);
          if (resSite && resSite.content) {
            const decoded = decodeURIComponent(escape(atob(resSite.content.replace(/\s/g, ''))));
            const match = decoded.match(/window\.__CEDAR_STATIC_DATA__\s*=\s*(\{[\s\S]*\});?/);
            if (match && match[1]) {
              const parsedSite = JSON.parse(match[1].replace(/;\s*$/, ''));
              if (!cfgData && parsedSite.project) cfgData = parsedSite.project;
              if (!draftsData && Array.isArray(parsedSite.drafts)) draftsData = parsedSite.drafts;
            }
          }
        } catch (eSite) {}
      }

      // Apply pulled data to workspace
      if (cfgData && typeof cfgData === 'object') {
        Object.assign(window.projectConfig, cfgData);
        if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
      }

      if (Array.isArray(draftsData)) {
        window.drafts = draftsData;
        window.currentDraft = draftsData[0] || null;
        if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
      }

      // Record sync state
      localStorage.setItem(STORAGE_KEYS.LAST_SHA, remote.headSha);
      localStorage.setItem(STORAGE_KEYS.LAST_REV, (remote.revision || 1).toString());
      localStorage.setItem(STORAGE_KEYS.LAST_TIME, new Date().toISOString());

      // Refresh UI views
      if (typeof window.renderDashboard === 'function') window.renderDashboard();
      if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
      if (typeof window.updateCedarTitle === 'function') window.updateCedarTitle();
      if (typeof window.renderProjectSettings === 'function') window.renderProjectSettings();
      updateSyncBadges();

      if (typeof window.showToast === 'function') {
        window.showToast(`Pulled revision #${remote.revision || 1} from GitHub!`);
      }
      return true;
    } catch (err) {
      console.error('[GitHubSync] Pull error:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(`Pull failed: ${err.message}`, 'error');
      }
      throw err;
    }
  }

  /**
   * PUSH & PUBLISH: Atomic Commit using Git Trees API
   */
  let isPublishingToGitHub = false;
  async function pushToGitHub(options = {}) {
    if (isPublishingToGitHub) {
      console.warn('[GitHubSync] Publish already in progress, ignoring duplicate trigger.');
      return false;
    }
    if (!isConfigured()) {
      throw new Error('GitHub sync is not configured. Please enter your repository and token in Settings.');
    }
    isPublishingToGitHub = true;
    const creds = getCredentials();
    const repo = creds.repo;
    let branch = creds.branch || 'main';
    const isForce = Boolean(options.force);

    if (typeof window.showToast === 'function') window.showToast('Checking repository state...');

    try {
      // 1. Get branch head (auto-detect default branch or auto-initialize if empty 0-commit repo)
      let branchRef = null;
      try {
        branchRef = await apiRequest(`/repos/${repo}/git/ref/heads/${branch}`);
      } catch (refErr) {
        if (refErr.status === 404 || refErr.status === 409) {
          let repoMeta = null;
          try {
            repoMeta = await apiRequest(`/repos/${repo}`);
          } catch (metaErr) {
            if (metaErr.status === 404) {
              throw new Error('Repository not found or token lacks access. For private repos, select your repo AND set "Contents: Read and write" before saving your Fine-Grained token (or check "repo" on a Classic token).');
            }
            throw metaErr;
          }
          if (repoMeta && repoMeta.permissions && repoMeta.permissions.push === false) {
            throw new Error('Your token is Read-Only. Edit your GitHub token to enable "Contents: Read and write" (Fine-Grained) or check "repo" (Classic).');
          }
          if (repoMeta && repoMeta.default_branch && repoMeta.default_branch !== branch) {
            branch = repoMeta.default_branch;
            localStorage.setItem(STORAGE_KEYS.BRANCH, branch);
            try {
              branchRef = await apiRequest(`/repos/${repo}/git/ref/heads/${branch}`);
            } catch (e2) {}
          }
          // If branchRef is still null, the repository has 0 commits (empty repo without a README). Auto-bootstrap it!
          if (!branchRef) {
            if (typeof window.showToast === 'function') window.showToast('Initializing empty GitHub repository...');
            const siteTitle = window.projectConfig?.name || 'Cedar Blog';
            const readmeB64 = btoa(unescape(encodeURIComponent(`# ${siteTitle}\n\nPublished with [Cedar](https://cedar.pub).\n`)));
            await apiRequest(`/repos/${repo}/contents/README.md`, {
              method: 'PUT',
              body: {
                message: 'Initial commit (Cedar Studio)',
                content: readmeB64,
                branch: branch
              }
            });
            branchRef = await apiRequest(`/repos/${repo}/git/ref/heads/${branch}`);
          }
        } else {
          throw refErr;
        }
      }
      const headSha = branchRef.object.sha;
      const lastSyncedSha = localStorage.getItem(STORAGE_KEYS.LAST_SHA);
      let baseRev = parseInt(localStorage.getItem(STORAGE_KEYS.LAST_REV) || '0', 10);

      // Collision Check: Only warn if a DIFFERENT Cedar device pushed a newer revision since our last sync
      if (!isForce && lastSyncedSha && headSha !== lastSyncedSha) {
        const remoteStatus = await getRemoteStatus();
        if (remoteStatus && remoteStatus.revision > baseRev) {
          baseRev = remoteStatus.revision;
        }
        const isDifferentDevice = Boolean(
          remoteStatus &&
          remoteStatus.revision > 0 &&
          remoteStatus.device &&
          remoteStatus.device !== 'GitHub' &&
          remoteStatus.device !== getDeviceName()
        );
        const localRev = parseInt(localStorage.getItem(STORAGE_KEYS.LAST_REV) || '0', 10);
        if (isDifferentDevice && remoteStatus.revision > localRev) {
          const proceed = await showConflictModal(remoteStatus);
          if (!proceed) {
            if (typeof window.showToast === 'function') window.showToast('Push cancelled.');
            return false;
          }
        } else {
          // Self-heal stale local SHA/revision (e.g. from same device or previous recovered push)
          localStorage.setItem(STORAGE_KEYS.LAST_SHA, headSha);
          if (baseRev > localRev) {
            localStorage.setItem(STORAGE_KEYS.LAST_REV, String(baseRev));
          }
        }
      }

      if (typeof window.showToast === 'function') window.showToast('Packaging atomic commit for Cloudflare...');

      // Get base commit tree & existing recursive remote tree for SHA-1 delta diffing
      const baseCommit = await apiRequest(`/repos/${repo}/git/commits/${headSha}`);
      const baseTreeSha = baseCommit.tree.sha;

      let remoteTreeItems = [];
      const remotePathToSha = new Map();
      const knownRemoteBlobShas = new Set();
      try {
        const remoteTreeRes = await apiRequest(`/repos/${repo}/git/trees/${headSha}?recursive=1`);
        if (remoteTreeRes && Array.isArray(remoteTreeRes.tree)) {
          remoteTreeItems = remoteTreeRes.tree;
          for (const item of remoteTreeItems) {
            if (item && item.type === 'blob' && item.path && item.sha) {
              remotePathToSha.set(item.path, item.sha);
              knownRemoteBlobShas.add(item.sha);
            }
          }
        }
      } catch (e) {
        console.warn('[GitHubSync] Could not fetch remote tree for delta diffing / orphan pruning:', e);
      }

      // Compute Git's exact blob SHA-1: SHA1("blob " + byteLength + "\0" + rawBytes)
      const textEncoder = new TextEncoder();
      const computeGitBlobSha = async (data) => {
        try {
          if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
            return null;
          }
          let contentBytes;
          if (typeof data === 'string') {
            contentBytes = textEncoder.encode(data);
          } else if (data instanceof Blob) {
            contentBytes = new Uint8Array(await data.arrayBuffer());
          } else if (data instanceof ArrayBuffer) {
            contentBytes = new Uint8Array(data);
          } else if (ArrayBuffer.isView(data)) {
            contentBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          } else {
            return null;
          }
          const headerBytes = textEncoder.encode(`blob ${contentBytes.byteLength}\0`);
          const combined = new Uint8Array(headerBytes.byteLength + contentBytes.byteLength);
          combined.set(headerBytes, 0);
          combined.set(contentBytes, headerBytes.byteLength);
          const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
          const hashArray = new Uint8Array(hashBuffer);
          let hex = '';
          for (let i = 0; i < hashArray.length; i++) {
            hex += hashArray[i].toString(16).padStart(2, '0');
          }
          return hex;
        } catch (err) {
          return null;
        }
      };

      // 2. Prepare file manifest (Incremental Delta against base_tree)
      const treeEntries = [];
      const activePaths = new Set(['sync.json']);
      const currentRev = baseRev + 1;
      const syncMeta = {
        revision: currentRev,
        lastSavedAt: new Date().toISOString(),
        deviceName: getDeviceName(),
        siteName: window.projectConfig?.name || 'Cedar'
      };
      treeEntries.push({
        path: 'sync.json',
        mode: '100644',
        type: 'blob',
        content: JSON.stringify(syncMeta, null, 2)
      });

      const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = String(reader.result || '');
          const idx = res.indexOf(',');
          resolve(idx !== -1 ? res.slice(idx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      let uploadedCount = 0;
      let skippedCount = 0;

      if (typeof window.buildProductionSiteFiles === 'function') {
        const prodFiles = await window.buildProductionSiteFiles({ includeEngineAssets: true });
        for (const f of prodFiles) {
          if (!f || !f.name || f.data === undefined || f.data === null) continue;
          const cleanPath = String(f.name).replace(/^\/+/, '');
          activePaths.add(cleanPath);

          const localSha = await computeGitBlobSha(f.data);

          // Skip completely if file at this path is already byte-for-byte identical in base_tree
          if (localSha && remotePathToSha.get(cleanPath) === localSha) {
            skippedCount++;
            continue;
          }

          // Reuse existing blob SHA if an identical blob already exists in the repo or was uploaded earlier in this push
          if (localSha && knownRemoteBlobShas.has(localSha)) {
            treeEntries.push({
              path: cleanPath,
              mode: '100644',
              type: 'blob',
              sha: localSha
            });
            continue;
          }

          if (typeof f.data === 'string' && f.data.length < 250000) {
            treeEntries.push({
              path: cleanPath,
              mode: '100644',
              type: 'blob',
              content: f.data
            });
            uploadedCount++;
          } else {
            const blobObj = (f.data instanceof Blob) ? f.data : new Blob([f.data]);
            const b64 = await blobToBase64(blobObj);
            const blobRes = await apiRequest(`/repos/${repo}/git/blobs`, {
              method: 'POST',
              body: {
                content: b64,
                encoding: 'base64'
              }
            });
            if (blobRes && blobRes.sha) {
              knownRemoteBlobShas.add(blobRes.sha);
              if (localSha) knownRemoteBlobShas.add(localSha);
              treeEntries.push({
                path: cleanPath,
                mode: '100644',
                type: 'blob',
                sha: blobRes.sha
              });
              uploadedCount++;
            }
          }
        }
      }

      // 2.5 Orphan Pruning: Delete any remote files on GitHub that are not in active manifest
      for (const remoteItem of remoteTreeItems) {
        if (remoteItem.type === 'blob' && !activePaths.has(remoteItem.path)) {
          treeEntries.push({
            path: remoteItem.path,
            mode: '100644',
            type: 'blob',
            sha: null // Delete orphaned file from GitHub
          });
        }
      }

      console.info(`[GitHubSync] Delta publish: ${uploadedCount} changed/new files uploaded, ${skippedCount} unchanged files skipped.`);

      // 3. Post Git Tree
      const treeRes = await apiRequest(`/repos/${repo}/git/trees`, {
        method: 'POST',
        body: {
          base_tree: baseTreeSha,
          tree: treeEntries
        }
      });
      const newTreeSha = treeRes.sha;

      // 4. Create Git Commit
      const commitMsg = `Cedar Studio: Rev #${currentRev} (${getDeviceName()}) [Web Publish]`;
      const commitRes = await apiRequest(`/repos/${repo}/git/commits`, {
        method: 'POST',
        body: {
          message: commitMsg,
          tree: newTreeSha,
          parents: [headSha]
        }
      });
      let newCommitSha = commitRes.sha;

      // 5. Update Branch Ref (use force: true since collision check already ran, and auto-recover on 422)
      try {
        await apiRequest(`/repos/${repo}/git/refs/heads/${branch}`, {
          method: 'PATCH',
          body: {
            sha: newCommitSha,
            force: true
          }
        });
      } catch (patchErr) {
        if (patchErr && patchErr.status === 422) {
          const latestRef = await apiRequest(`/repos/${repo}/git/ref/heads/${branch}?t=${Date.now()}`);
          const latestSha = latestRef?.object?.sha;
          if (latestSha && latestSha !== newCommitSha) {
            const latestCommit = await apiRequest(`/repos/${repo}/git/commits/${latestSha}?t=${Date.now()}`);
            if (latestCommit?.tree?.sha === newTreeSha) {
              newCommitSha = latestSha;
            } else {
              const retryCommit = await apiRequest(`/repos/${repo}/git/commits`, {
                method: 'POST',
                body: {
                  message: commitMsg,
                  tree: newTreeSha,
                  parents: [latestSha]
                }
              });
              newCommitSha = retryCommit.sha;
              await apiRequest(`/repos/${repo}/git/refs/heads/${branch}`, {
                method: 'PATCH',
                body: {
                  sha: newCommitSha,
                  force: true
                }
              });
            }
          }
        } else {
          throw patchErr;
        }
      }

      // Update sync state
      localStorage.setItem(STORAGE_KEYS.LAST_SHA, newCommitSha);
      localStorage.setItem(STORAGE_KEYS.LAST_REV, currentRev.toString());
      localStorage.setItem(STORAGE_KEYS.LAST_TIME, new Date().toISOString());
      updateSyncBadges();

      if (typeof window.showToast === 'function') {
        window.showToast(`Published rev #${currentRev} to GitHub! Live site updating.`);
      }
      return true;
    } catch (err) {
      console.error('[GitHubSync] Push error:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(`Publish failed: ${err.message}`, 'error');
      }
      throw err;
    } finally {
      isPublishingToGitHub = false;
    }
  }

  /**
   * Conflict Modal: Renders the 3 safety options
   */
  function showConflictModal(remoteStatus) {
    return new Promise((resolve) => {
      let modal = document.getElementById('modal-github-conflict');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-github-conflict';
        modal.className = 'cedar-modal-overlay';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: none; align-items: center; justify-content: center; z-index: 99999; backdrop-filter: blur(4px);';
        modal.innerHTML = `
          <div class="cedar-modal-card" style="background: var(--bg-primary, #18181b); color: var(--text-primary, #fafafa); border: 1px solid var(--border-subtle, #27272a); border-radius: 12px; max-width: 480px; width: 90%; padding: 1.5rem; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem;">
              <span style="font-size: 1.5rem;">⚠️</span>
              <h3 style="margin: 0; font-size: 1.15rem; font-weight: 600;">GitHub Conflict Detected</h3>
            </div>
            <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-muted, #a1a1aa); margin-bottom: 1.25rem;" id="conflict-modal-desc">
              The GitHub repository has been updated from another device since you loaded this page. If you push now, you risk overwriting those changes.
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
              <button type="button" class="btn btn-secondary" id="btn-conflict-backup" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0.6rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Export Backup (.ZIP) First</span>
              </button>
              <div style="display: flex; gap: 0.6rem; margin-top: 0.25rem;">
                <button type="button" class="btn btn-secondary" id="btn-conflict-cancel" style="flex: 1;">Cancel</button>
                <button type="button" class="btn btn-danger" id="btn-conflict-overwrite" style="flex: 1; background: #dc2626; color: #fff;">Overwrite Anyway</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      const desc = modal.querySelector('#conflict-modal-desc');
      if (desc && remoteStatus) {
        const timeAgo = remoteStatus.lastSavedAt ? new Date(remoteStatus.lastSavedAt).toLocaleTimeString() : 'recently';
        desc.textContent = `The GitHub repository has newer changes (Revision #${remoteStatus.revision || '?'}, updated around ${timeAgo} from ${remoteStatus.device || 'another workstation'}). Pushing now will replace those edits.`;
      }

      modal.style.display = 'flex';

      const cleanup = () => {
        modal.style.display = 'none';
      };

      modal.querySelector('#btn-conflict-cancel').onclick = () => {
        cleanup();
        resolve(false);
      };

      modal.querySelector('#btn-conflict-backup').onclick = () => {
        if (typeof window.exportVaultZip === 'function') {
          window.exportVaultZip();
        }
      };

      modal.querySelector('#btn-conflict-overwrite').onclick = () => {
        cleanup();
        resolve(true);
      };
    });
  }

  /**
   * Passive Freshness Checking (Runs periodically and on tab focus)
   */
  async function checkFreshness() {
    if (!isConfigured()) return;
    try {
      const remote = await getRemoteStatus();
      if (!remote) return;

      const localSha = localStorage.getItem(STORAGE_KEYS.LAST_SHA);
      const localRev = parseInt(localStorage.getItem(STORAGE_KEYS.LAST_REV) || '0', 10);
      const isDifferentDevice = Boolean(
        remote.revision > 0 &&
        remote.device &&
        remote.device !== 'GitHub' &&
        remote.device !== getDeviceName()
      );
      const isOutdated = Boolean(
        localSha &&
        remote.headSha &&
        localSha !== remote.headSha &&
        isDifferentDevice &&
        remote.revision > localRev
      );

      if (localSha && remote.headSha && localSha !== remote.headSha && !isOutdated) {
        // Self-heal stale local SHA if remote commit came from this same device
        localStorage.setItem(STORAGE_KEYS.LAST_SHA, remote.headSha);
        if (remote.revision > localRev) {
          localStorage.setItem(STORAGE_KEYS.LAST_REV, String(remote.revision));
        }
      }

      const pill = document.getElementById('github-freshness-pill');
      if (pill) {
        pill.style.display = isOutdated ? 'inline-flex' : 'none';
      }
      updateSyncBadges(isOutdated);
    } catch (e) {
      // Quiet background failure
    }
  }

  function formatLastPublished(isoStr) {
    if (!isoStr) return 'Last published: Never';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Last published: Never';
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 1) return 'Last published: Just now';
      if (diffMins < 60) return `Last published: ${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      const isToday = d.toDateString() === now.toDateString();
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (isToday) return `Last published: Today at ${timeStr}`;
      return `Last published: ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
    } catch (e) {
      return 'Last published: Recently';
    }
  }
  function updateCredsPanelToggle(isExpanded) {
    const credsPanel = document.getElementById('github-credentials-panel');
    const toggleConfigBtn = document.getElementById('btn-toggle-github-config');
    const toggleSpan = document.getElementById('btn-toggle-github-config-text');
    const chevron = document.getElementById('icon-toggle-github-chevron');
    const plusIcon = document.getElementById('icon-toggle-github-plus');

    if (credsPanel) {
      credsPanel.style.display = isExpanded ? 'block' : 'none';
    }
    if (toggleConfigBtn) {
      toggleConfigBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }
    if (toggleSpan) {
      if (isExpanded) {
        toggleSpan.textContent = 'Hide Settings';
      } else {
        toggleSpan.textContent = isConfigured() ? 'Configure Repository' : 'Add Repository';
      }
    }
    if (plusIcon) {
      plusIcon.style.display = isExpanded ? 'none' : 'inline-block';
    }
    if (chevron) {
      chevron.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    if (isExpanded) {
      setTimeout(() => {
        const repoInput = document.getElementById('setting-github-repo');
        if (repoInput) repoInput.focus();
      }, 50);
    }
  }

  /**
   * Set inline dynamic readout explaining publish status or errors
   */
  function setPublishReadout(type, message) {
    const readout = document.getElementById('github-publish-readout');
    if (!readout) return;
    if (!message) {
      readout.style.display = 'none';
      readout.className = 'publish-status-readout';
      readout.innerHTML = '';
      return;
    }
    readout.className = `publish-status-readout readout-${type}`;
    readout.style.display = 'flex';
    const icon = type === 'error'
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"></path></svg>`;
    readout.innerHTML = `${icon}<span>${message}</span>`;
  }

  /**
   * Update UI badges in Settings and Dashboard
   */
  function updateSyncBadges(isOutdated = false) {
    const configured = isConfigured();
    const { repo, branch } = getCredentials();
    const lastTime = localStorage.getItem(STORAGE_KEYS.LAST_TIME);

    // Settings / Export pane badge
    const badge = document.getElementById('settings-github-sync-pill');
    const label = document.getElementById('label-settings-github-status');
    if (badge && label) {
      if (!configured) {
        badge.className = 'settings-vault-pill pill-disconnected';
        label.textContent = 'Not Connected';
      } else if (isOutdated) {
        badge.className = 'settings-vault-pill pill-warning';
        label.textContent = 'Updates on GitHub';
      } else {
        badge.className = 'settings-vault-pill pill-connected';
        label.textContent = `Connected (${repo})`;
      }
    }

    // Cockpit UI Elements
    const repoLabel = document.getElementById('label-github-repo-connected');
    if (repoLabel) {
      repoLabel.textContent = configured ? `${repo} (${branch || 'main'})` : 'Repository Not Linked';
    }

    const timeLabel = document.getElementById('label-github-last-published');
    if (timeLabel) {
      timeLabel.textContent = formatLastPublished(lastTime);
    }

    const btnDisconnect = document.getElementById('btn-github-disconnect');
    if (btnDisconnect) {
      btnDisconnect.style.display = configured ? 'inline-flex' : 'none';
    }

    const pushBtnText = document.getElementById('btn-github-push-text');
    if (pushBtnText) {
      pushBtnText.textContent = 'Publish';
    }

    const credsPanel = document.getElementById('github-credentials-panel');
    if (credsPanel && !credsPanel._userToggled) {
      updateCredsPanelToggle(false);
    }

    // Floating bar button in Dashboard if present
    const dashPill = document.getElementById('dash-github-status-pill');
    if (dashPill) {
      dashPill.style.display = configured ? 'inline-flex' : 'none';
      dashPill.textContent = isOutdated ? 'GitHub: Update Available' : 'GitHub: Synced';
    }

    syncTestButtonState();
  }

  /**
   * Keep "Test Connection" enabled whenever valid repository and token are entered
   */
  function syncTestButtonState() {
    const btnTest = document.getElementById('btn-github-test');
    if (!btnTest) return;
    const saved = getCredentials();
    const inRepo = document.getElementById('setting-github-repo');
    const inToken = document.getElementById('setting-github-token');
    const typedRepo = parseGitHubRepoInput(inRepo?.value || saved.repo || '').repo;
    const typedToken = (inToken ? inToken.value : (saved.token || '')).trim();
    const canTest = Boolean(
      typedRepo &&
      typedToken &&
      typedRepo.includes('/')
    );
    btnTest.disabled = !canTest;
    btnTest.style.opacity = canTest ? '' : '0.45';
    btnTest.style.cursor = canTest ? '' : 'not-allowed';
    btnTest.title = canTest
      ? 'Verify repository access'
      : 'Enter repository URL and Personal Access Token to test connection';
  }

  /**
   * Validate GitHub credentials and apply red warning states like TFU
   */
  function validateGitHubCredentials(showUiFeedback = true) {
    const inRepo = document.getElementById('setting-github-repo');
    const inToken = document.getElementById('setting-github-token');
    const repoVal = inRepo?.value.trim() || '';
    const tokenVal = inToken?.value.trim() || '';
    const repoErr = document.getElementById('github-repo-error');
    const tokenErr = document.getElementById('github-token-error');

    let hasError = false;

    const parsedRepo = parseGitHubRepoInput(repoVal);
    if (!parsedRepo.repo || !parsedRepo.repo.includes('/')) {
      if (showUiFeedback) {
        if (inRepo) inRepo.classList.add('ftue-input-error');
        if (repoErr) repoErr.style.display = 'block';
      }
      hasError = true;
    } else {
      if (inRepo) inRepo.classList.remove('ftue-input-error');
      if (repoErr) repoErr.style.display = 'none';
    }

    if (!tokenVal) {
      if (showUiFeedback) {
        if (inToken) inToken.classList.add('ftue-input-error');
        if (tokenErr) tokenErr.style.display = 'block';
      }
      hasError = true;
    } else {
      if (inToken) inToken.classList.remove('ftue-input-error');
      if (tokenErr) tokenErr.style.display = 'none';
    }

    return !hasError;
  }

  function initSyncUI() {
    const creds = getCredentials();
    const inputRepo = document.getElementById('setting-github-repo');
    const inputToken = document.getElementById('setting-github-token');

    if (inputRepo && document.activeElement !== inputRepo) inputRepo.value = creds.repo || '';
    if (inputToken && document.activeElement !== inputToken) inputToken.value = creds.token || '';

    updateSyncBadges();

    // Toggle credentials panel (Show more / Show less)
    const btnToggleConfig = document.getElementById('btn-toggle-github-config');
    const credsPanel = document.getElementById('github-credentials-panel');
    if (btnToggleConfig && !btnToggleConfig._hasConfigToggleListener) {
      btnToggleConfig._hasConfigToggleListener = true;
      btnToggleConfig.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!credsPanel) return;
        credsPanel._userToggled = true;
        const isCurrentlyHidden = credsPanel.style.display === 'none' || !credsPanel.style.display;
        updateCredsPanelToggle(isCurrentlyHidden);
      });
    }

    // Open repository in new tab button
    const btnOpenRepo = document.getElementById('btn-github-open-repo');
    if (btnOpenRepo && !btnOpenRepo._hasGhOpenRepoListener) {
      btnOpenRepo._hasGhOpenRepoListener = true;
      btnOpenRepo.addEventListener('click', (e) => {
        e.preventDefault();
        const inRepo = document.getElementById('setting-github-repo');
        const rawVal = (inRepo?.value || getCredentials().repo || '').trim();
        if (!rawVal) {
          if (inRepo) inRepo.focus();
          if (typeof window.showToast === 'function') window.showToast('Please enter a GitHub repository URL first.', 'error');
          return;
        }
        let targetUrl = rawVal;
        if (!/^https?:\/\//i.test(targetUrl)) {
          const parsed = parseGitHubRepoInput(targetUrl);
          if (parsed.repo && parsed.repo.includes('/')) {
            targetUrl = `https://github.com/${parsed.repo}`;
          } else if (/^(?:www\.)?github\.com\//i.test(targetUrl)) {
            targetUrl = `https://${targetUrl}`;
          } else {
            targetUrl = `https://github.com/${targetUrl.replace(/^\/+/, '')}`;
          }
        }
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      });
    }

    // Eye toggle for token visibility
    const btnToggle = document.getElementById('btn-toggle-github-token');
    if (btnToggle && !btnToggle._hasGhEyeListener) {
      btnToggle._hasGhEyeListener = true;
      btnToggle.addEventListener('click', (e) => {
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

    // Test button
    const btnTest = document.getElementById('btn-github-test');
    if (btnTest && !btnTest._hasGhTestListener) {
      btnTest._hasGhTestListener = true;
      btnTest.addEventListener('click', async () => {
        const inRepo = document.getElementById('setting-github-repo');
        const inToken = document.getElementById('setting-github-token');
        const repo = inRepo?.value.trim();
        const token = inToken?.value.trim();
        if (!validateGitHubCredentials(true)) {
          if (!repo && inRepo) inRepo.focus();
          else if (!token && inToken) inToken.focus();
          if (typeof window.showToast === 'function') window.showToast('Please enter both your repository and access token first.', 'error');
          return;
        }
        if (typeof window.showToast === 'function') window.showToast('Testing connection to GitHub...');
        const res = await testConnection(repo, token);
        if (res.ok) {
          const privText = res.isPrivate ? 'Private' : 'Public';
          if (typeof window.showToast === 'function') {
            window.showToast(`Connected successfully! Repo: ${res.repoName} (${privText})`);
          }
        } else {
          if (typeof window.showToast === 'function') {
            window.showToast(res.error || 'Connection failed', 'error');
          }
        }
      });
    }

    // Save button
    const btnSave = document.getElementById('btn-github-save');
    if (btnSave && !btnSave._hasGhSaveListener) {
      btnSave._hasGhSaveListener = true;
      btnSave.addEventListener('click', () => {
        const inRepo = document.getElementById('setting-github-repo');
        const inToken = document.getElementById('setting-github-token');
        const repo = inRepo?.value.trim();
        const token = inToken?.value.trim();
        if (!validateGitHubCredentials(true)) {
          if (!repo && inRepo) inRepo.focus();
          else if (!token && inToken) inToken.focus();
          if (typeof window.showToast === 'function') window.showToast('Please enter repository and personal access token.', 'error');
          return;
        }
        saveCredentials(repo, token, 'main');
        if (typeof window.showToast === 'function') window.showToast('Saved GitHub credentials!');
      });
    }

    // Push button
    const CANONICAL_PUBLISH_BTN_HTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 9V4s3.03.55 4 2c1.08 1.62 0 5 0 5"></path></svg>
      <span id="btn-github-push-text">Publish</span>
    `;
    const btnPush = document.getElementById('btn-github-push');
    if (btnPush && !btnPush._hasGhPushListener) {
      btnPush._hasGhPushListener = true;
      btnPush.addEventListener('click', async () => {
        if (isPublishingToGitHub) return;
        const inRepo = document.getElementById('setting-github-repo');
        const inToken = document.getElementById('setting-github-token');
        const repoVal = inRepo?.value.trim() || '';
        const tokenVal = inToken?.value.trim() || '';
        const configured = isConfigured();

        // If not configured, require credentials and show red warning like TFU
        if (!configured && (!repoVal || !tokenVal)) {
          const credsPanel = document.getElementById('github-credentials-panel');
          if (credsPanel) credsPanel._userToggled = true;
          updateCredsPanelToggle(true);

          // Apply red error styling & messages
          validateGitHubCredentials(true);

          let reason = 'Cannot publish: GitHub repository and Personal Access Token are required. Click "Add Repository" below.';
          if (!repoVal && tokenVal) {
            reason = 'Cannot publish: GitHub repository identifier is missing (e.g. username/my-blog).';
          } else if (repoVal && !tokenVal) {
            reason = 'Cannot publish: GitHub Personal Access Token is missing.';
          }
          setPublishReadout('error', reason);

          // Focus the first empty field
          if (!repoVal && inRepo) {
            inRepo.focus();
          } else if (!tokenVal && inToken) {
            inToken.focus();
          }

          if (typeof window.showToast === 'function') {
            window.showToast(reason, 'error');
          }
          return;
        }

        // Frictionless auto-save if credentials are typed in the form
        if (!configured && repoVal && tokenVal) {
          saveCredentials(repoVal, tokenVal, 'main');
        }

        setPublishReadout(null);

        const pushBtn = document.getElementById('btn-github-push');
        if (pushBtn) {
          pushBtn.disabled = true;
          pushBtn.innerHTML = `
            <svg class="vault-sync-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span id="btn-github-push-text">Publishing...</span>
          `;
        }

        try {
          await pushToGitHub();
          updateSyncBadges();
          setPublishReadout('success', 'Successfully published to GitHub! Live site is updating.');
        } catch (e) {
          setPublishReadout('error', `Cannot publish: ${e.message}`);
        } finally {
          if (pushBtn) {
            pushBtn.disabled = false;
            pushBtn.innerHTML = CANONICAL_PUBLISH_BTN_HTML;
          }
        }
      });
    }

    // Delegated sidebar publish trigger
    const sidebarPublishBtn = document.getElementById('btn-export-sidebar-action');
    if (sidebarPublishBtn && !sidebarPublishBtn._hasPublishAction) {
      sidebarPublishBtn._hasPublishAction = true;
      sidebarPublishBtn.addEventListener('click', () => {
        const primaryPush = document.getElementById('btn-github-push');
        if (primaryPush) primaryPush.click();
      });
    }

    // Disconnect button
    const btnDisconnect = document.getElementById('btn-github-disconnect');
    if (btnDisconnect && !btnDisconnect._hasGhDiscListener) {
      btnDisconnect._hasGhDiscListener = true;
      btnDisconnect.addEventListener('click', () => {
        if (!confirm('Disconnect GitHub cloud sync?\n\nYour repository and local files will remain intact. Cedar will just forget the saved token.')) return;
        clearCredentials();
        const inRepo = document.getElementById('setting-github-repo');
        const inToken = document.getElementById('setting-github-token');
        if (inRepo) {
          inRepo.value = '';
          inRepo.classList.remove('ftue-input-error');
        }
        if (inToken) {
          inToken.value = '';
          inToken.classList.remove('ftue-input-error');
        }
        const repoErr = document.getElementById('github-repo-error');
        const tokenErr = document.getElementById('github-token-error');
        if (repoErr) repoErr.style.display = 'none';
        if (tokenErr) tokenErr.style.display = 'none';
        setPublishReadout(null);
        updateSyncBadges();
        if (typeof window.showToast === 'function') window.showToast('Disconnected from GitHub.');
      });
    }
  }

  // Delegated document listeners to guarantee clicks & inputs always work regardless of injection timing
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      // 1. Toggle button (Show more / Show less)
      const toggleBtn = e.target.closest('#btn-toggle-github-config');
      if (toggleBtn) {
        e.preventDefault();
        if (toggleBtn._hasConfigToggleListener) return;
        const credsPanel = document.getElementById('github-credentials-panel');
        if (!credsPanel) return;
        credsPanel._userToggled = true;
        const isCurrentlyHidden = credsPanel.style.display === 'none' || !credsPanel.style.display;
        updateCredsPanelToggle(isCurrentlyHidden);
        return;
      }

      // 2. Web zip manual export button
      const btnWebZip = e.target.closest('#btn-export-web-zip');
      if (btnWebZip) {
        e.preventDefault();
        if (typeof window.exportWebProductionZip === 'function') {
          window.exportWebProductionZip();
        } else if (typeof window.showToast === 'function') {
          window.showToast('Web export engine initializing...');
        }
        return;
      }
    });

    // Auto-save credentials as user types & update Test Connection state
    document.addEventListener('input', (e) => {
      if (e.target && (e.target.id === 'setting-github-repo' || e.target.id === 'setting-github-token')) {
        const inRepoEl = document.getElementById('setting-github-repo');
        const inTokenEl = document.getElementById('setting-github-token');
        const rawRepo = inRepoEl ? inRepoEl.value.trim() : (localStorage.getItem(STORAGE_KEYS.REPO) || '');
        const rawToken = inTokenEl ? inTokenEl.value.trim() : (localStorage.getItem(STORAGE_KEYS.TOKEN) || '');
        const parsed = parseGitHubRepoInput(rawRepo);
        const cleanRepo = parsed.repo || rawRepo;
        const effBranch = parsed.branch || localStorage.getItem(STORAGE_KEYS.BRANCH) || 'main';
        const prevRepo = localStorage.getItem(STORAGE_KEYS.REPO) || '';
        const prevBranch = localStorage.getItem(STORAGE_KEYS.BRANCH) || 'main';
        if (prevRepo && (prevRepo !== cleanRepo || prevBranch !== effBranch)) {
          localStorage.removeItem(STORAGE_KEYS.LAST_SHA);
          localStorage.removeItem(STORAGE_KEYS.LAST_REV);
          localStorage.removeItem(STORAGE_KEYS.LAST_TIME);
        }

        localStorage.setItem(STORAGE_KEYS.REPO, cleanRepo);
        localStorage.setItem(STORAGE_KEYS.TOKEN, rawToken);
        localStorage.setItem(STORAGE_KEYS.BRANCH, effBranch);

        if (window.projectConfig) {
          window.projectConfig.githubRepo = cleanRepo;
          window.projectConfig.githubBranch = effBranch;
          if (typeof window.saveProjectToStorage === 'function') {
            clearTimeout(githubAutoSaveTimer);
            githubAutoSaveTimer = setTimeout(() => {
              window.saveProjectToStorage();
            }, 250);
          }
        }

        updateSyncBadges();
        syncTestButtonState();
        if (e.target.value.trim()) {
          e.target.classList.remove('ftue-input-error');
          const errEl = document.getElementById(e.target.id === 'setting-github-repo' ? 'github-repo-error' : 'github-token-error');
          if (errEl) errEl.style.display = 'none';

          if (rawRepo && rawToken) {
            setPublishReadout(null);
          }
        }
      }
    });
  }

  // Periodic passive check every 30 minutes
  setInterval(checkFreshness, 30 * 60 * 1000);

  // Tab focus passive check
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkFreshness();
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSyncUI);
    } else {
      setTimeout(initSyncUI, 100);
    }
  }

  // Expose Public API
  window.Cedar.githubSync = {
    isConfigured,
    getCredentials,
    saveCredentials,
    clearCredentials,
    testConnection,
    getRemoteStatus,
    pullFromGitHub,
    pushToGitHub,
    checkFreshness,
    updateSyncBadges,
    initSyncUI
  };
  window.initGitHubSyncUI = initSyncUI;

  // Initial freshness check on load
  setTimeout(checkFreshness, 2000);
})();
