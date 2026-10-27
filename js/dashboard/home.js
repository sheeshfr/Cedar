/**
 * Cedar - Home Activity Log Stream
 * Generates and maintains a live vertical scrolling activity stream of all
 * notes, posts, pages, categories, media uploads, and designer updates.
 * Features 5-minute media upload batching with thumbnail previews, in-place
 * lightbox overlay, post cards with clean 80-char plain excerpts, and
 * note permalink routing.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  // Maximum stored activity log items
  const MAX_LOG_ITEMS = 500;
  // 5 minutes in milliseconds for media batching
  const MEDIA_BATCH_WINDOW_MS = 5 * 60 * 1000;

  let activeLightboxImage = null;
  let activeFilter = 'all';
  let activeSearchQuery = '';

  function getProjectConfig() {
    try {
      if (typeof window !== 'undefined' && window.projectConfig) return window.projectConfig;
      if (typeof projectConfig !== 'undefined') return projectConfig;
    } catch (e) {}
    return {};
  }

  /**
   * Plain text excerpt extractor for posts.
   * Strips HTML, Markdown images, Markdown links (keeps text), headings, code, and symbols.
   * Strictly outputs up to 80 characters of pure body text.
   */
  function extractPlainBodyExcerpt(content, maxChars = 80) {
    if (!content || typeof content !== 'string') return '';
    let text = content;

    // 1. Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');

    // 2. Remove markdown images: ![alt](url)
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');

    // 3. Remove markdown links: [link text](url) -> link text
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

    // 4. Remove headings, blockquotes, code fences, inline code, bold/italics
    text = text.replace(/^#{1,6}\s+/gm, '');
    text = text.replace(/`{1,3}[^`]*`{1,3}/g, ' ');
    text = text.replace(/[*_~`]/g, '');
    text = text.replace(/^>\s+/gm, '');

    // 5. Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    if (text.length > maxChars) {
      return text.slice(0, maxChars).trim() + '...';
    }
    return text;
  }
  window.extractPlainBodyExcerpt = extractPlainBodyExcerpt;

  /**
   * Relative or formatted time helper
   */
  function formatActivityTimestamp(ts) {
    if (!ts) return 'Recently';
    const now = Date.now();
    const diff = Math.max(0, now - ts);

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    if (diff < 1 * MINUTE) return 'Just now';
    if (diff < 60 * MINUTE) {
      const mins = Math.floor(diff / MINUTE);
      return `${mins}m ago`;
    }
    if (diff < 24 * HOUR) {
      const hrs = Math.floor(diff / HOUR);
      return `${hrs}h ago`;
    }
    if (diff < 7 * DAY) {
      const days = Math.floor(diff / DAY);
      return `${days}d ago`;
    }

    const d = new Date(ts);
    const tz = (typeof getAppTimezone === 'function') ? getAppTimezone() : ((window.projectConfig && window.projectConfig.timezone) || undefined);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      timeZone: tz
    });
  }

  /**
   * Escape HTML utility
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Returns project activity log array
   */
  function getActivityLog() {
    const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
    if (proj) {
      if (!Array.isArray(proj.activityLog)) {
        proj.activityLog = [];
      }
      return proj.activityLog;
    }
    return [];
  }

  /**
   * Checks if two timestamps fall on the same local calendar day.
   */
  function isSameDay(tsA, tsB) {
    if (!tsA || !tsB) return false;
    const dA = new Date(tsA);
    const dB = new Date(tsB);
    return dA.getFullYear() === dB.getFullYear() &&
           dA.getMonth() === dB.getMonth() &&
           dA.getDate() === dB.getDate();
  }

  /**
   * Checks if two activity entries represent the same action/item.
   */
  function isSameActivity(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;

    const dataA = a.data || {};
    const dataB = b.data || {};

    if (a.type === 'designer') {
      const pageA = (dataA.pageName || 'Site Layout').trim().toLowerCase().replace(/\s*page$/i, '');
      const pageB = (dataB.pageName || 'Site Layout').trim().toLowerCase().replace(/\s*page$/i, '');
      return pageA === pageB;
    }

    if (a.type === 'post' || a.type === 'page') {
      if (dataA.id && dataB.id && dataA.id === dataB.id) return true;
      const titleA = (dataA.title || '').trim().toLowerCase();
      const titleB = (dataB.title || '').trim().toLowerCase();
      const actA = (dataA.action || dataA.status || '').trim().toLowerCase();
      const actB = (dataB.action || dataB.status || '').trim().toLowerCase();
      return titleA && titleA === titleB && actA === actB;
    }

    if (a.type === 'note') {
      if (dataA.id && dataB.id && dataA.id === dataB.id) return true;
      const textA = (dataA.markdown || dataA.text || '').trim();
      const textB = (dataB.markdown || dataB.text || '').trim();
      return Boolean(textA) && textA === textB;
    }

    if (a.type === 'category') {
      const catA = (dataA.categoryName || dataA.newName || '').trim().toLowerCase();
      const catB = (dataB.categoryName || dataB.newName || '').trim().toLowerCase();
      const oldA = (dataA.oldName || '').trim().toLowerCase();
      const oldB = (dataB.oldName || '').trim().toLowerCase();
      const actA = (dataA.action || '').trim().toLowerCase();
      const actB = (dataB.action || '').trim().toLowerCase();
      return catA === catB && oldA === oldB && actA === actB;
    }

    if (a.type === 'author') {
      const authA = (dataA.authorName || dataA.name || dataA.newName || '').trim().toLowerCase();
      const authB = (dataB.authorName || dataB.name || dataB.newName || '').trim().toLowerCase();
      const oldA = (dataA.oldName || '').trim().toLowerCase();
      const oldB = (dataB.oldName || '').trim().toLowerCase();
      const actA = (dataA.action || '').trim().toLowerCase();
      const actB = (dataB.action || '').trim().toLowerCase();
      return authA === authB && oldA === oldB && actA === actB;
    }

    if (a.type === 'media_upload' || a.type === 'media_batch') {
      return true;
    }

    if (a.type === 'milestone') {
      if (dataA.id && dataB.id && dataA.id === dataB.id) return true;
      return (dataA.text || '').trim() === (dataB.text || '').trim();
    }

    try {
      return JSON.stringify(dataA) === JSON.stringify(dataB);
    } catch (e) {
      return false;
    }
  }

  /**
   * Remove consecutive duplicate activities on the same day from log array in-place.
   */
  function cleanConsecutiveDuplicateActivities(log) {
    if (!Array.isArray(log) || log.length <= 1) return log;
    for (let i = log.length - 1; i >= 1; i--) {
      const current = log[i];
      const prev = log[i - 1];
      if (current && prev && isSameDay(current.timestamp, prev.timestamp) && isSameActivity(current, prev)) {
        log.splice(i, 1);
      }
    }
    return log;
  }

  /**
   * Record a new user activity into the log.
   */
  function logActivity(type, data = {}, customTimestamp = null) {
    if (type === 'designer') return null;
    if (type === 'category' && data && (data.action === 'reordered' || data.action === 'reorder')) return null;
    if (type === 'page' && data && (data.id === 'page_about_cedar' || data.slug === 'about-cedar' || String(data.title || '').trim().toLowerCase() === 'about cedar')) return null;
    const log = getActivityLog();
    let timestamp = customTimestamp;
    if (!timestamp && type === 'post' && data && (data.action === 'published' || data.status === 'published') && data.publishedDate) {
      const parts = String(data.publishedDate).split('-').map(Number);
      if (parts.length === 3) {
        timestamp = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime();
      }
    }
    if (!timestamp) timestamp = Date.now();

    // Prevent duplicate entries for the same post or page
    if ((type === 'post' || type === 'page') && data && data.id) {
      const existingIdx = log.findIndex(e => e.type === type && ((e.data && e.data.id === data.id) || e.id === `synth-${type}-${data.id}`));
      if (existingIdx !== -1) {
        const existing = log[existingIdx];
        if (type === 'post' && (data.action === 'published' || data.status === 'published' || existing.data?.status === 'published')) {
          const pDate = data.publishedDate || existing.data?.publishedDate;
          if (pDate) {
            const parts = String(pDate).split('-').map(Number);
            if (parts.length === 3) {
              existing.timestamp = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime();
            } else {
              existing.timestamp = timestamp;
            }
          } else {
            existing.timestamp = timestamp;
          }
        } else {
          existing.timestamp = timestamp;
        }
        existing.data = Object.assign({}, existing.data, data);
        if (data.title && data.title !== 'Untitled Post') {
          existing.data.title = data.title;
        }
        log.splice(existingIdx, 1);
        log.unshift(existing);
        log.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (typeof saveProjectToStorage === 'function') {
          saveProjectToStorage();
        }
        if (window.currentDashboardTab === 'home') {
          renderHomeActivityStream();
        }
        return existing;
      }
    }

    // If the same thing is about to get posted in a row on the same day, only show it once!
    if (log.length > 0) {
      const latest = log[0];
      if (isSameDay(latest.timestamp, timestamp) && isSameActivity(latest, { type, data })) {
        latest.timestamp = timestamp;
        latest.data = Object.assign({}, latest.data || {}, data);
        if (typeof saveProjectToStorage === 'function') {
          saveProjectToStorage();
        }
        if (window.currentDashboardTab === 'home') {
          renderHomeActivityStream();
        }
        return latest;
      }
    }

    const entry = {
      id: 'act-' + timestamp + '-' + Math.floor(Math.random() * 10000),
      type: type,
      timestamp: timestamp,
      data: data
    };

    log.unshift(entry);

    // Keep log within bounds
    if (log.length > MAX_LOG_ITEMS) {
      log.length = MAX_LOG_ITEMS;
    }

    if (typeof saveProjectToStorage === 'function') {
      saveProjectToStorage();
    }

    // If currently viewing Home, re-render
    if (window.currentDashboardTab === 'home') {
      renderHomeActivityStream();
    }

    return entry;
  }
  window.logActivity = logActivity;
  window.getActivityLog = getActivityLog;

  /**
   * Initial synthesis of activity log from existing project data
   * (Ensures pre-existing notes, posts, pages, categories, authors, and media appear immediately).
   */
  function synthesizeInitialActivity() {
    if (typeof projectConfig !== 'undefined' && projectConfig) {
      let cleaned = false;
      if (Array.isArray(projectConfig.activityLog)) {
        const prevLen = projectConfig.activityLog.length;
        const currentDrafts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts))
          ? window.drafts
          : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);
        projectConfig.activityLog = projectConfig.activityLog.filter(item => {
          if (!item) return false;
          if (item.type === 'designer') return false;
          if (item.type === 'category' && (item.data?.action === 'reordered' || item.action === 'reordered')) return false;
          if (item.type === 'post') {
            const postData = item.data || {};
            const postId = postData.id || item.id;
            const postSlug = postData.slug;
            const liveDraft = currentDrafts.find(d => d && (d.id === postId || (postSlug && d.slug === postSlug)));
            if (!liveDraft || liveDraft.type === 'page' || liveDraft.type === 'note') return false;
          }
          if (item.type === 'page') {
            const pageData = item.data || {};
            const pageId = pageData.id || item.id;
            const pageSlug = pageData.slug;
            const pageTitle = (pageData.title || '').trim().toLowerCase();
            if (
              pageId === 'page_about_cedar' || pageId === 'synth-page-page_about_cedar' || pageId === 'act-page-page_about_cedar' ||
              pageSlug === 'about-cedar' || pageTitle === 'about cedar'
            ) return false;
            const liveDraft = currentDrafts.find(d => d && (d.id === pageId || (pageSlug && d.slug === pageSlug)));
            if (!liveDraft) return false;
            if (typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(liveDraft)) return false;
          }
          return true;
        });
        if (projectConfig.activityLog.length !== prevLen) cleaned = true;
      }
      if (cleaned && typeof saveProjectToStorage === 'function') {
        saveProjectToStorage();
        if (typeof syncLiveWorkspaceData === 'function') syncLiveWorkspaceData();
      }
    }

    const log = getActivityLog();

    const currentLiveDrafts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts))
      ? window.drafts
      : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);

    // In-place purge of designer, orphaned posts/pages, reordered categories, and phantom entries from active log
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i];
      if (!entry) continue;
      if (entry.type === 'designer') {
        log.splice(i, 1);
        continue;
      }
      if (entry.type === 'category' && (entry.data?.action === 'reordered' || entry.action === 'reordered')) {
        log.splice(i, 1);
        continue;
      }
      if (entry.type === 'post') {
        const postId = entry.data?.id || entry.id;
        const postSlug = entry.data?.slug;
        const exists = currentLiveDrafts.some(d => d && (d.id === postId || (postSlug && d.slug === postSlug)) && d.type !== 'page');
        if (!exists) {
          log.splice(i, 1);
          continue;
        }
      }
      if (entry.type === 'page') {
        const pageId = entry.data?.id || entry.id;
        const pageSlug = entry.data?.slug;
        const pageTitle = String(entry.data?.title || '').trim().toLowerCase();
        if (pageId === 'page_about_cedar' || pageId === 'synth-page-page_about_cedar' || pageSlug === 'about-cedar' || pageTitle === 'about cedar') {
          log.splice(i, 1);
          continue;
        }
        const exists = currentLiveDrafts.some(d => d && (d.id === pageId || (pageSlug && d.slug === pageSlug)));
        if (!exists) {
          log.splice(i, 1);
          continue;
        }
      }
    }

    // Collect all existing entities
    const syntheticItems = [];
    const draftsList = (typeof drafts !== 'undefined' && Array.isArray(drafts))
      ? drafts
      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);

    const isLinks = (typeof window.isLinksDraft === 'function')
      ? window.isLinksDraft
      : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));

    if (draftsList.length > 0) {
      // Existing Posts (exclude pages, notes, and links)
      draftsList.filter(d => d.type !== 'page' && d.type !== 'note' && !isLinks(d)).forEach(post => {
        // Skip entirely blank posts without title or content
        if ((!post.title || post.title === 'Untitled Post') && (!post.markdown || !post.markdown.trim()) && (!post.images || post.images.length === 0)) {
          return;
        }
        let postTimestamp = post.publishedAt || post.createdAt || post.updatedAt || Date.now();
        if (post.status === 'published' && post.publishedDate) {
          const parts = String(post.publishedDate).split('-').map(Number);
          if (parts.length === 3) {
            postTimestamp = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime();
          }
        }
        syntheticItems.push({
          id: 'synth-post-' + post.id,
          type: 'post',
          timestamp: postTimestamp,
          data: {
            id: post.id,
            slug: post.slug || '',
            title: post.title || 'Untitled Post',
            subtitle: post.subtitle || '',
            authorName: post.authorName || (typeof post.author === 'string' ? post.author : post.author?.name) || '',
            authorAvatar: post.authorAvatar || '',
            featuredImage: post.featuredImage || post.coverImage || '',
            bodyExcerpt: extractPlainBodyExcerpt(post.markdown || post.html || ''),
            status: post.status || 'draft',
            action: post.status === 'published' ? 'published' : 'created',
            images: Array.isArray(post.images) ? post.images : []
          }
        });
      });

      // 3. Existing Pages (User rule: on feed, only show 'created the category' not the page for the category)
      const feedProjCats = new Set((getProjectConfig().categories || []).map(c => String(c).trim().toLowerCase()));
      draftsList.filter(d => {
        if (!d) return false;
        if (d.type !== 'page' && !isLinks(d)) return false;
        if (d.id === 'page_about_cedar' || d.slug === 'about-cedar') return false;
        const titleLower = (d.title || '').trim().toLowerCase();
        if (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) return false;
        const catLower = (d.categoryAggregate || '').trim().toLowerCase();
        if (feedProjCats.has(titleLower) || feedProjCats.has(catLower)) return false;
        if (typeof window.isPageActuallyBlank === 'function' && window.isPageActuallyBlank(d)) return false;
        return true;
      }).forEach(page => {
        const idTimeMatch = String(page.id || '').match(/^page_(\d+)_/);
        const pageTs = page.createdAt || page.updatedAt || (idTimeMatch ? Number(idTimeMatch[1]) : Date.now());
        syntheticItems.push({
          id: 'synth-page-' + page.id,
          type: 'page',
          timestamp: pageTs,
          data: {
            id: page.id,
            slug: page.slug || '',
            title: page.title || 'Untitled Page',
            action: (page.updatedAt && page.createdAt && page.updatedAt > (page.createdAt + 60000)) ? 'edited' : 'created'
          }
        });
      });
    }

    // 4. Existing Media Assets (ONLY standalone raw uploads directly in the media library)
    if (typeof getAllUniqueImages === 'function') {
      try {
        const allImages = getAllUniqueImages();
        const standaloneImages = allImages.filter(img => img.isStandalone && (!img.postId || img.postTitle === 'Media Library'));
        if (standaloneImages.length > 0) {
          syntheticItems.push({
            id: 'synth-media-batch-init',
            type: 'media_batch',
            timestamp: standaloneImages[0].createdAt || (Date.now() - 3600000),
            data: {
              images: standaloneImages.map(img => ({
                filename: img.filename,
                src: img.objectUrl || img.dataUrl || (img.filename ? `blog/images/${img.filename}` : ''),
                timestamp: img.createdAt || Date.now()
              }))
            }
          });
        }
      } catch (e) {}
    }


    // 6. Existing Categories
    if (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.categories)) {
      projectConfig.categories.forEach(cat => {
        const name = typeof cat === 'object' ? cat.name : cat;
        if (name && name !== 'Uncategorized') {
          syntheticItems.push({
            id: 'synth-cat-' + name,
            type: 'category',
            timestamp: projectConfig.createdAt || Date.now(),
            data: {
              action: 'added',
              categoryName: name
            }
          });
        }
      });
    }

    // 7. Existing Milestones (reconciled with cedar_milestones_v1 storage & activityLog)
    const activeCfg = getProjectConfig();
    if (activeCfg) {
      if (!Array.isArray(activeCfg.milestones)) activeCfg.milestones = [];
      try {
        const storedMs = JSON.parse(localStorage.getItem('cedar_milestones_v1') || '[]');
        if (Array.isArray(storedMs)) {
          storedMs.forEach(sm => {
            if (sm && sm.id && sm.text && !activeCfg.milestones.some(m => m && m.id === sm.id)) {
              activeCfg.milestones.push(sm);
            }
          });
        }
      } catch (e) {}
      if (Array.isArray(activeCfg.activityLog)) {
        activeCfg.activityLog.forEach(act => {
          if (act && act.type === 'milestone') {
            const mId = (act.data && act.data.id) || act.id;
            const mText = (act.data && act.data.text) || '';
            if (mId && mText && !activeCfg.milestones.some(m => m && m.id === mId)) {
              activeCfg.milestones.push({
                id: mId,
                text: mText,
                date: (act.data && act.data.date) || new Date(act.timestamp || Date.now()).toISOString().split('T')[0],
                timestamp: act.timestamp || Date.now(),
                authorName: (act.data && act.data.authorName) || 'Author'
              });
            }
          }
        });
      }
      activeCfg.milestones.forEach(m => {
        if (m && m.text) {
          syntheticItems.push({
            id: m.id,
            type: 'milestone',
            timestamp: m.timestamp || (m.date ? new Date(m.date + 'T12:00:00').getTime() : Date.now()),
            data: {
              id: m.id,
              text: m.text || '',
              date: m.date || new Date().toISOString().split('T')[0],
              authorName: m.authorName || 'Author'
            }
          });
        }
      });
    }

    // Filter out stale media entries from log that are post-derived or no longer exist in media library
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i];
      if (entry && (entry.type === 'media_batch' || entry.type === 'media_upload')) {
        if (entry.id && entry.id.startsWith('synth-media-batch-init')) {
          log.splice(i, 1);
          continue;
        }
        const imgs = entry.images || entry.data?.images || [];
        const isRawUpload = Array.isArray(imgs) && imgs.some(img => {
          const fname = img?.filename || img?.name || '';
          return typeof projectConfig !== 'undefined' && Array.isArray(projectConfig?.mediaLibrary) && projectConfig.mediaLibrary.some(m => m && m.filename === fname);
        });
        if (!isRawUpload) {
          log.splice(i, 1);
        }
      }
    }

    // Merge missing synthetic items into log without duplicates
    const existingIds = new Set();
    const existingEntityIds = new Set();
    log.forEach(item => {
      if (!item) return;
      if (item.id) existingIds.add(item.id);
      if (item.data && item.data.id) {
        existingEntityIds.add(item.data.id);
      }
    });

    let addedCount = 0;

    const loggedCategoryNames = new Set();
    log.forEach(item => {
      if (item && item.type === 'category' && item.data && item.data.categoryName) {
        loggedCategoryNames.add(String(item.data.categoryName).trim().toLowerCase());
      }
    });

    syntheticItems.forEach(item => {
      const entityId = item.data?.id;
      if (existingIds.has(item.id) || (entityId && existingEntityIds.has(entityId))) {
        return;
      }
      if (item.type === 'category' && loggedCategoryNames.has(String(item.data?.categoryName || '').trim().toLowerCase())) {
        return;
      }
      log.push(item);
      existingIds.add(item.id);
      if (entityId) existingEntityIds.add(entityId);
      addedCount++;
    });

    const isSynthCat = (o) => o && o.type === 'category' && typeof o.id === 'string' && o.id.startsWith('synth-cat-');
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (!isSynthCat(e)) continue;
      const nm = String(e.data?.categoryName || '').trim().toLowerCase();
      const hasReal = log.some(o => o && o !== e && o.type === 'category' && !isSynthCat(o) && String(o.data?.categoryName || '').trim().toLowerCase() === nm);
      if (hasReal) log.splice(i, 1);
    }

    // Notes no longer exist: strip any lingering note entries from the feed
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i] && log[i].type === 'note') log.splice(i, 1);
    }

    const allDraftsList = (typeof drafts !== 'undefined' && Array.isArray(drafts))
      ? drafts
      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);

    // Deduplicate and heal existing post entries in log
    const seenPostEntities = new Map();
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      if (entry && entry.type === 'post') {
        const postId = entry.data?.id || (entry.id && entry.id.startsWith('synth-post-') ? entry.id.replace('synth-post-', '') : null);
        if (postId) {
          const matchDraft = allDraftsList.find(d => 
            (postId && (d.id === postId || String(d.id) === String(postId))) ||
            (entry.data?.slug && d.slug === entry.data.slug) ||
            (entry.data?.title && d.title && d.title.trim().toLowerCase() === entry.data.title.trim().toLowerCase())
          );

          if (!seenPostEntities.has(postId)) {
            seenPostEntities.set(postId, i);
            // Heal title, slug, excerpt, images from draft
            if (matchDraft) {
              entry.data = entry.data || {};
              if (matchDraft.title && matchDraft.title.trim()) {
                entry.data.title = matchDraft.title;
              }
              if (matchDraft.slug) entry.data.slug = matchDraft.slug;
              if (matchDraft.subtitle) entry.data.subtitle = matchDraft.subtitle;
              if (matchDraft.authorName) entry.data.authorName = matchDraft.authorName;
              if (matchDraft.authorAvatar) entry.data.authorAvatar = matchDraft.authorAvatar;
              if (matchDraft.featuredImage || matchDraft.coverImage) {
                entry.data.featuredImage = matchDraft.featuredImage || matchDraft.coverImage;
              }
              if (Array.isArray(matchDraft.images) && matchDraft.images.length > 0) {
                entry.data.images = matchDraft.images;
              }
              const excerpt = extractPlainBodyExcerpt(matchDraft.markdown || matchDraft.html || '', 80);
              if (excerpt) entry.data.bodyExcerpt = excerpt;
              if (matchDraft.status === 'published') {
                entry.data.status = 'published';
                entry.data.action = 'published';
                if (matchDraft.publishedDate) {
                  const parts = String(matchDraft.publishedDate).split('-').map(Number);
                  if (parts.length === 3) {
                    entry.timestamp = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime();
                    matchDraft.publishedAt = entry.timestamp;
                  }
                } else if (matchDraft.publishedAt) {
                  entry.timestamp = matchDraft.publishedAt;
                }
              }
            }
          } else {
            // Duplicate post entry found in log!
            const prevIdx = seenPostEntities.get(postId);
            const prevEntry = log[prevIdx];
            if (entry.data?.title && entry.data.title !== 'Untitled Post' && (!prevEntry.data?.title || prevEntry.data.title === 'Untitled Post')) {
              prevEntry.data.title = entry.data.title;
            }
            log.splice(i, 1);
            i--;
            addedCount++;
          }
        }
      }
    }

    // Deduplicate and heal existing page entries in log
    const seenPageEntities = new Map();
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      if (entry && entry.type === 'page') {
        const pageId = entry.data?.id || (entry.id && entry.id.startsWith('synth-page-') ? entry.id.replace('synth-page-', '') : null);
        const entrySlug = entry.data?.slug;
        const entryTitle = (entry.data?.title || '').trim().toLowerCase();

        const matchDraft = allDraftsList.find(d => {
          if (!d || d.type !== 'page') return false;
          if (pageId && (d.id === pageId || String(d.id) === String(pageId))) return true;
          if (entrySlug && d.slug === entrySlug) return true;
          if (entryTitle && d.title && d.title.trim().toLowerCase() === entryTitle) return true;
          if (d.isCategoryAggregate && d.categoryAggregate && entryTitle && d.categoryAggregate.trim().toLowerCase() === entryTitle) return true;
          return false;
        });

        // User rule: on feed, only show 'created the category' not the page for the category.
        const isCatDraft = Boolean(matchDraft && (matchDraft.isCategoryAggregate || String(matchDraft.id || '').startsWith('page_cat_')));
        const isCatPageId = Boolean((pageId && String(pageId).startsWith('page_cat_')) || (entry.id && String(entry.id).includes('page_cat_')));
        const projCatsList = (getProjectConfig() && Array.isArray(getProjectConfig().categories)) ? getProjectConfig().categories : [];
        const isCatByName = projCatsList.some(c => String(c).trim().toLowerCase() === entryTitle) ||
                            (matchDraft && matchDraft.categoryAggregate && projCatsList.some(c => String(c).trim().toLowerCase() === matchDraft.categoryAggregate.trim().toLowerCase()));

        if (isCatDraft || isCatPageId || isCatByName || pageId === 'page_about_cedar' || entrySlug === 'about-cedar' || entryTitle === 'about cedar') {
          log.splice(i, 1);
          i--;
          addedCount++;
          continue;
        }

        const canonicalKey = matchDraft ? matchDraft.id : (pageId || entrySlug || entryTitle);

        if (canonicalKey && !seenPageEntities.has(canonicalKey)) {
          seenPageEntities.set(canonicalKey, i);
          if (matchDraft) {
            entry.data = entry.data || {};
            if (matchDraft.title && matchDraft.title.trim() && entry.data.title !== matchDraft.title.trim()) {
              entry.data.title = matchDraft.title.trim();
              addedCount++;
            }
            if (matchDraft.slug && entry.data.slug !== matchDraft.slug) {
              entry.data.slug = matchDraft.slug;
              addedCount++;
            }
            if (matchDraft.id && entry.data.id !== matchDraft.id) {
              entry.data.id = matchDraft.id;
              addedCount++;
            }
          }
        } else if (canonicalKey) {
          // Duplicate page entry found in log!
          const prevIdx = seenPageEntities.get(canonicalKey);
          const prevEntry = log[prevIdx];
          if (matchDraft && matchDraft.title && prevEntry.data) {
            prevEntry.data.title = matchDraft.title.trim();
            prevEntry.data.slug = matchDraft.slug;
          }
          log.splice(i, 1);
          i--;
          addedCount++;
        }
      }
    }

    // Deduplicate and heal existing category entries in log against projectConfig.categories & drafts
    const projCats = (getProjectConfig() && Array.isArray(getProjectConfig().categories)) ? getProjectConfig().categories : [];
    const seenCatEntities = new Map();
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      if (entry && entry.type === 'category') {
        const catName = String(entry.data?.categoryName || entry.data?.newName || entry.data?.category || '').trim();
        const catLower = catName.toLowerCase();

        // 1. Match against projectConfig.categories (exact, case-insensitive, or slug)
        const matchCat = projCats.find(c => {
          if (!c) return false;
          const cStr = String(c).trim();
          return cStr.toLowerCase() === catLower ||
                 (typeof window.generateSlug === 'function' && window.generateSlug(cStr) === window.generateSlug(catName));
        });

        // 2. Also match against category aggregate pages in drafts
        const matchCatDraft = !matchCat ? allDraftsList.find(d => {
          if (!d || d.type !== 'page') return false;
          return (d.isCategoryAggregate && d.categoryAggregate && d.categoryAggregate.trim().toLowerCase() === catLower) ||
                 (d.id && d.id.startsWith('page_cat_') && (d.title || '').trim().toLowerCase() === catLower);
        }) : null;

        const canonicalName = matchCat ? String(matchCat).trim() : (matchCatDraft ? (matchCatDraft.title || matchCatDraft.categoryAggregate).trim() : catName);
        const canonicalKey = (canonicalName || catName).toLowerCase();

        if (canonicalName && entry.data) {
          if (entry.data.categoryName !== canonicalName) {
            entry.data.categoryName = canonicalName;
            addedCount++;
          }
          if (entry.id && entry.id.startsWith('synth-cat-') && entry.id !== 'synth-cat-' + canonicalName) {
            entry.id = 'synth-cat-' + canonicalName;
            addedCount++;
          }
        }

        if (canonicalKey && !seenCatEntities.has(canonicalKey)) {
          seenCatEntities.set(canonicalKey, i);
        } else if (canonicalKey) {
          // Duplicate category entry found in log!
          const prevIdx = seenCatEntities.get(canonicalKey);
          const prevEntry = log[prevIdx];
          if (canonicalName && prevEntry.data) {
            prevEntry.data.categoryName = canonicalName;
          }
          log.splice(i, 1);
          i--;
          addedCount++;
        }
      }
    }

    // Purge any category entries in log whose category no longer exists
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e && e.type === 'category') {
        const cName = String(e.data?.categoryName || e.data?.category || '').trim().toLowerCase();
        const stillExists = projCats.some(c => String(c).trim().toLowerCase() === cName) ||
                            allDraftsList.some(d => d && (
                              (d.type === 'page' && (d.title || '').trim().toLowerCase() === cName) ||
                              (d.tag && d.tag.trim().toLowerCase() === cName) ||
                              (Array.isArray(d.categories) && d.categories.some(cat => String(cat).trim().toLowerCase() === cName))
                            ));
        if (!stillExists) {
          log.splice(i, 1);
          addedCount++;
        }
      }
    }

    // Backfill any missing authorAvatar on existing log notes from drafts
    log.forEach(item => {
      if (item && item.type === 'note' && item.data) {
        if (!item.data.authorAvatar) {
          const matchDraft = allDraftsList.find(d => (item.data.id && d.id === item.data.id) || (d.noteNumber && d.noteNumber === item.data.noteNumber));
          if (matchDraft && matchDraft.authorAvatar) {
            item.data.authorAvatar = matchDraft.authorAvatar;
            addedCount++;
          }
        }
      }
    });

    // Always keep log strictly chronologically sorted by timestamp descending
    log.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (log.length > MAX_LOG_ITEMS) log.length = MAX_LOG_ITEMS;

    if (addedCount > 0 && typeof saveProjectToStorage === 'function') {
      saveProjectToStorage();
    }
  }

  /**
   * Process raw activities to group consecutive media uploads within 5 minutes into single batches.
   */
  function groupActivityFeed(rawItems) {
    const grouped = [];
    let currentMediaBatch = null;

    rawItems.filter(item => item && item.type !== 'designer').forEach(item => {
      if (item.type === 'media_upload' || item.type === 'media_batch') {
        const images = (Array.isArray(item.images) && item.images.length > 0)
          ? item.images
          : (Array.isArray(item.data?.images) ? item.data.images : [item.data]);
        const validImages = images.filter(Boolean);

        if (currentMediaBatch && Math.abs((currentMediaBatch.timestamp || 0) - (item.timestamp || 0)) <= MEDIA_BATCH_WINDOW_MS) {
          // Merge into existing batch
          currentMediaBatch.images.push(...validImages);
          // Keep newest timestamp
          if (item.timestamp > currentMediaBatch.timestamp) {
            currentMediaBatch.timestamp = item.timestamp;
          }
        } else {
          currentMediaBatch = {
            id: item.id || 'media-batch-' + item.timestamp,
            type: 'media_batch',
            timestamp: item.timestamp,
            images: [...validImages]
          };
          grouped.push(currentMediaBatch);
        }
      } else {
        currentMediaBatch = null;

        // If the same thing is in a row on the same day, only show it once!
        if (grouped.length > 0) {
          const prev = grouped[grouped.length - 1];
          if (isSameDay(prev.timestamp, item.timestamp) && isSameActivity(prev, item)) {
            if ((item.timestamp || 0) > (prev.timestamp || 0)) {
              prev.timestamp = item.timestamp;
            }
            prev.data = Object.assign({}, item.data, prev.data);
            return;
          }
        }

        grouped.push(item);
      }
    });

    return grouped;
  }

  /**
   * Check if an activity entry matches the search query
   */
  function matchesSearchQuery(entry, query) {
    if (!query) return true;
    const q = query.toLowerCase();

    if (entry.type && entry.type.toLowerCase().includes(q)) return true;

    const data = entry.data || {};

    if (entry.type === 'milestone') {
      if ((data.text || '').toLowerCase().includes(q)) return true;
      if ((data.authorName || '').toLowerCase().includes(q)) return true;
      if ((data.date || '').toLowerCase().includes(q)) return true;
      return false;
    }

    if (entry.type === 'note') {
      if ((data.markdown || '').toLowerCase().includes(q)) return true;
      if ((data.text || '').toLowerCase().includes(q)) return true;
      if ((data.authorName || '').toLowerCase().includes(q)) return true;
      if (data.noteNumber && String(data.noteNumber).includes(q)) return true;
      return false;
    }

    if (entry.type === 'post') {
      if ((data.title || '').toLowerCase().includes(q)) return true;
      if ((data.bodyExcerpt || '').toLowerCase().includes(q)) return true;
      if ((data.slug || '').toLowerCase().includes(q)) return true;
      return false;
    }

    if (entry.type === 'page') {
      if ((data.title || '').toLowerCase().includes(q)) return true;
      if ((data.slug || '').toLowerCase().includes(q)) return true;
      return false;
    }

    if (entry.type === 'media_batch' || entry.type === 'media_upload') {
      const images = Array.isArray(entry.images) ? entry.images : (Array.isArray(data.images) ? data.images : []);
      if (images.some(img => (img?.filename || '').toLowerCase().includes(q))) return true;
      if ('uploaded pictures'.includes(q) || 'media'.includes(q) || 'images'.includes(q)) return true;
      return false;
    }

    if (entry.type === 'author') {
      if ((data.name || data.authorName || '').toLowerCase().includes(q)) return true;
      if ((data.oldName || '').toLowerCase().includes(q)) return true;
      if ((data.newName || '').toLowerCase().includes(q)) return true;
      return false;
    }

    if (entry.type === 'category') {
      if ((data.categoryName || '').toLowerCase().includes(q)) return true;
      if ((data.oldName || '').toLowerCase().includes(q)) return true;
      if ((data.newName || '').toLowerCase().includes(q)) return true;
      return false;
    }

    if (entry.type === 'designer') {
      if ((data.pageName || '').toLowerCase().includes(q)) return true;
      return false;
    }

    return false;
  }

  /**
   * Helper to retrieve list of authors
   */
  function getAuthorsList() {
    const authors = [];
    if (typeof projectConfig !== 'undefined' && projectConfig) {
      if (Array.isArray(projectConfig.authors)) {
        projectConfig.authors.forEach(a => {
          const name = typeof a === 'object' ? a.name : a;
          if (name && !authors.includes(name)) authors.push(name);
        });
      }
      if (projectConfig.author && !authors.includes(projectConfig.author)) {
        authors.unshift(projectConfig.author);
      }
    }
    if (authors.length === 0) authors.push('Author');
    return authors;
  }

  /**
   * Updates milestone modal character counter (max 40 chars)
   */
  function updateMilestoneCharCounter() {
    const textInput = document.getElementById('textarea-milestone-text');
    const counter = document.getElementById('milestone-char-counter');
    if (!textInput || !counter) return;
    const chars = Array.from(textInput.value);
    if (chars.length > 40) {
      textInput.value = chars.slice(0, 40).join('');
    }
    const len = Array.from(textInput.value).length;
    counter.textContent = `${len} / 40`;
    if (len >= 40) {
      counter.style.color = 'var(--accent-primary, #ef4444)';
      counter.style.fontWeight = '700';
    } else {
      counter.style.color = 'var(--text-muted, #71717a)';
      counter.style.fontWeight = 'normal';
    }
  }

  /**
   * Initializes the emoji keyboard popover for Milestone Note
   */
  function initMilestoneEmojiKeyboard() {
    const triggerBtn = document.getElementById('btn-milestone-emoji');
    const keyboardEl = document.getElementById('milestone-emoji-keyboard');
    if (!triggerBtn || !keyboardEl || triggerBtn._controllerInitialized) return;

    if (typeof window.setupEmojiKeyboardController === 'function') {
      triggerBtn._controllerInitialized = true;
      window.setupEmojiKeyboardController({
        triggerBtn: triggerBtn,
        keyboardEl: keyboardEl,
        searchInput: document.getElementById('milestone-emoji-search'),
        clearBtn: document.getElementById('btn-milestone-emoji-clear'),
        navEl: document.getElementById('milestone-emoji-nav'),
        bodyEl: document.getElementById('milestone-emoji-body'),
        getTargetTextarea: () => document.getElementById('textarea-milestone-text'),
        onSelectEmoji: () => {
          updateMilestoneCharCounter();
        }
      });

      document.addEventListener('click', (e) => {
        if (!keyboardEl.contains(e.target) && !triggerBtn.contains(e.target)) {
          keyboardEl.style.display = 'none';
        }
      });
    }
  }

  /**
   * Open the Milestone modal for Add or Edit
   */
  function openMilestoneModal(milestoneId = null) {
    const modal = document.getElementById('modal-milestone');
    if (!modal) return;

    const noteEl = modal.querySelector('#milestone-privacy-note');
    if (noteEl) {
      noteEl.textContent = "Note: The public won't see milestones";
    }

    initMilestoneEmojiKeyboard();

    const titleEl = document.getElementById('modal-milestone-title');
    const idInput = document.getElementById('input-milestone-id');
    const textInput = document.getElementById('textarea-milestone-text');
    const dateInput = document.getElementById('input-milestone-date');
    const authorSelect = document.getElementById('select-milestone-author');
    const deleteBtn = document.getElementById('btn-delete-milestone-modal');

    if (authorSelect) {
      authorSelect.innerHTML = '';
      const authors = getAuthorsList();
      authors.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        authorSelect.appendChild(opt);
      });
    }

    if (milestoneId) {
      if (titleEl) titleEl.textContent = 'Edit Milestone';
      if (idInput) idInput.value = milestoneId;
      if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
        deleteBtn.dataset.milestoneId = milestoneId;
      }

      let milestoneData = null;
      if (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.milestones)) {
        milestoneData = projectConfig.milestones.find(m => m.id === milestoneId);
      }
      if (!milestoneData) {
        const act = getActivityLog().find(a => a.id === milestoneId || a.data?.id === milestoneId);
        if (act) milestoneData = act.data;
      }

      if (textInput) textInput.value = milestoneData?.text || '';
      if (dateInput) dateInput.value = milestoneData?.date || new Date().toISOString().split('T')[0];
      if (authorSelect && milestoneData?.authorName) {
        authorSelect.value = milestoneData.authorName;
      }
    } else {
      if (titleEl) titleEl.textContent = 'Add Milestone';
      if (idInput) idInput.value = '';
      if (deleteBtn) {
        deleteBtn.style.display = 'none';
        deleteBtn.dataset.milestoneId = '';
      }
      if (textInput) textInput.value = '';
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
      if (authorSelect) {
        const defaultAuthor = window.activeNotesAuthor || (typeof projectConfig !== 'undefined' ? projectConfig.author : '') || '';
        if (defaultAuthor && Array.from(authorSelect.options).some(o => o.value === defaultAuthor)) {
          authorSelect.value = defaultAuthor;
        }
      }
    }

    updateMilestoneCharCounter();

    const keyboardEl = document.getElementById('milestone-emoji-keyboard');
    if (keyboardEl) keyboardEl.style.display = 'none';

    modal.style.display = 'flex';
    setTimeout(() => {
      if (textInput) textInput.focus();
    }, 50);
  }
  window.openMilestoneModal = openMilestoneModal;

  function closeMilestoneModal() {
    const modal = document.getElementById('modal-milestone');
    if (modal) modal.style.display = 'none';
  }
  window.closeMilestoneModal = closeMilestoneModal;

  /**
   * Save Milestone form (Add or Edit)
   */
  function saveMilestoneForm(e) {
    if (e) e.preventDefault();

    const idInput = document.getElementById('input-milestone-id');
    const textInput = document.getElementById('textarea-milestone-text');
    const dateInput = document.getElementById('input-milestone-date');
    const authorSelect = document.getElementById('select-milestone-author');

    let text = textInput ? textInput.value.trim() : '';
    if (!text) {
      if (textInput) textInput.focus();
      return;
    }
    // Restrict milestone character limit to 40 characters
    if (Array.from(text).length > 40) {
      text = Array.from(text).slice(0, 40).join('');
    }

    const dateVal = dateInput?.value || new Date().toISOString().split('T')[0];
    const authorName = (authorSelect && authorSelect.value)
      ? authorSelect.value
      : (window.activeNotesAuthor || (typeof projectConfig !== 'undefined' ? (projectConfig.defaultAuthor || projectConfig.author) : '') || 'Author');
    const milestoneId = idInput?.value || '';

    const todayStr = new Date().toISOString().split('T')[0];
    let timestamp = Date.now();
    if (dateVal && dateVal !== todayStr) {
      timestamp = new Date(dateVal + 'T12:00:00').getTime();
    }

    const activeCfg = getProjectConfig();
    if (activeCfg) {
      activeCfg.milestones = Array.isArray(activeCfg.milestones) ? activeCfg.milestones : [];
      activeCfg.activityLog = Array.isArray(activeCfg.activityLog) ? activeCfg.activityLog : [];

      if (milestoneId) {
        // Edit existing
        const m = activeCfg.milestones.find(item => item.id === milestoneId);
        if (m) {
          m.text = text;
          m.date = dateVal;
          m.authorName = authorName;
          m.timestamp = timestamp;
        }

        const logEntry = activeCfg.activityLog.find(item => item.type === 'milestone' && (item.id === milestoneId || item.data?.id === milestoneId));
        if (logEntry) {
          logEntry.timestamp = timestamp;
          logEntry.data = logEntry.data || {};
          logEntry.data.text = text;
          logEntry.data.date = dateVal;
          logEntry.data.authorName = authorName;
        }
      } else {
        // Create new milestone
        const newId = 'milestone-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const newMilestone = {
          id: newId,
          text: text,
          date: dateVal,
          timestamp: timestamp,
          authorName: authorName
        };
        activeCfg.milestones.push(newMilestone);

        const newLogEntry = {
          id: newId,
          type: 'milestone',
          timestamp: timestamp,
          data: {
            id: newId,
            text: text,
            date: dateVal,
            authorName: authorName
          }
        };
        activeCfg.activityLog.unshift(newLogEntry);
      }

      if (typeof window !== 'undefined' && window.projectConfig && window.projectConfig !== activeCfg) {
        window.projectConfig.milestones = activeCfg.milestones;
        window.projectConfig.activityLog = activeCfg.activityLog;
      }
      try {
        localStorage.setItem('cedar_milestones_v1', JSON.stringify(activeCfg.milestones));
        localStorage.setItem('cedar_activity_log', JSON.stringify(activeCfg.activityLog));
      } catch (e) {}
    }

    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage();
    } else if (typeof saveProjectToStorage === 'function') {
      saveProjectToStorage();
    }

    closeMilestoneModal();
    renderHomeActivityStream();
  }

  /**
   * Delete a milestone
   */
  function deleteMilestone(milestoneId) {
    if (!milestoneId) return;
    if (!window.confirm('Are you sure you want to delete this milestone?')) return;

    const activeCfg = getProjectConfig();
    if (activeCfg) {
      if (Array.isArray(activeCfg.milestones)) {
        activeCfg.milestones = activeCfg.milestones.filter(m => m.id !== milestoneId);
      }
      if (Array.isArray(activeCfg.activityLog)) {
        activeCfg.activityLog = activeCfg.activityLog.filter(item => !(item.type === 'milestone' && (item.id === milestoneId || item.data?.id === milestoneId)));
      }
      if (typeof window !== 'undefined' && window.projectConfig && window.projectConfig !== activeCfg) {
        window.projectConfig.milestones = activeCfg.milestones;
        window.projectConfig.activityLog = activeCfg.activityLog;
      }
      try {
        localStorage.setItem('cedar_milestones_v1', JSON.stringify(activeCfg.milestones || []));
        localStorage.setItem('cedar_activity_log', JSON.stringify(activeCfg.activityLog || []));
      } catch (e) {}
    }

    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage();
    } else if (typeof saveProjectToStorage === 'function') {
      saveProjectToStorage();
    }

    renderHomeActivityStream();
  }
  window.deleteMilestone = deleteMilestone;

  /**
   * Initialize controls for search, filters, and milestone modals
   */
  function initHomeControls() {
    const pane = document.getElementById('pane-home');
    if (!pane || pane._controlsBound) return;
    pane._controlsBound = true;

    // Search input
    const searchInput = document.getElementById('home-activity-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        activeSearchQuery = e.target.value.trim().toLowerCase();
        renderHomeActivityStream();
      });
      searchInput.addEventListener('search', (e) => {
        activeSearchQuery = e.target.value.trim().toLowerCase();
        renderHomeActivityStream();
      });
    }

    // Filter pills
    const filterPills = pane.querySelectorAll('.home-filter-btn');
    filterPills.forEach(btn => {
      btn.addEventListener('click', () => {
        filterPills.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeFilter = btn.dataset.filter || 'all';
        renderHomeActivityStream();
      });
    });

    // Add Milestone Button
    const addMilestoneBtn = document.getElementById('btn-home-add-milestone');
    if (addMilestoneBtn) {
      addMilestoneBtn.addEventListener('click', () => {
        openMilestoneModal();
      });
    }

    // Milestone modal events
    const modal = document.getElementById('modal-milestone');
    const closeBtn = document.getElementById('btn-close-milestone-modal');
    const cancelBtn = document.getElementById('btn-cancel-milestone');
    const form = document.getElementById('form-milestone');

    if (closeBtn) closeBtn.addEventListener('click', closeMilestoneModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeMilestoneModal);
    if (form) form.addEventListener('submit', saveMilestoneForm);

    const milestoneTextarea = document.getElementById('textarea-milestone-text');
    if (milestoneTextarea) {
      milestoneTextarea.addEventListener('input', updateMilestoneCharCounter);
    }

    const modalDeleteBtn = document.getElementById('btn-delete-milestone-modal');
    if (modalDeleteBtn) {
      modalDeleteBtn.addEventListener('click', () => {
        const id = document.getElementById('input-milestone-id')?.value;
        if (id) {
          deleteMilestone(id);
          closeMilestoneModal();
        }
      });
    }

    initMilestoneEmojiKeyboard();

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeMilestoneModal();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        closeMilestoneModal();
      }
    });

    initLightboxEvents();
  }

  /**
   * Renders the 'Future' section on the Home Feed for scheduled releases
   * Only appears in this moment when there are scheduled posts!
   */
  function renderHomeFutureSection() {
    const section = document.getElementById('home-future-section');
    const list = document.getElementById('home-future-list');
    const countBadge = document.getElementById('home-future-count');
    if (!section || !list) return;

    // Check if any scheduled posts have hit their time and should auto-publish
    if (((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)) && typeof ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).checkScheduledPosts === 'function') {
      ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).checkScheduledPosts();
    }

    const allDrafts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : [];
    const scheduledPosts = allDrafts.filter(d => (d.type === 'post' || !d.type) && (d.status === 'scheduled' || d.scheduled === true));

    if (scheduledPosts.length === 0) {
      section.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    // Sort by earliest scheduledAt
    scheduledPosts.sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0));

    if (countBadge) {
      countBadge.textContent = String(scheduledPosts.length);
    }

    let html = '';
    scheduledPosts.forEach(post => {
      const title = escapeHtml(post.title || 'Untitled Post');
      const dateDisplay = (typeof window.formatDateDisplay === 'function' && post.scheduledDate)
        ? window.formatDateDisplay(post.scheduledDate)
        : (post.scheduledDate || post.date || 'Upcoming');
      const timeDisplay = (((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)))
        ? ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).formatTimeDisplay(post.scheduledTime)
        : (post.scheduledTime || '9:00 AM');
      const relativeTime = (((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)))
        ? ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).formatTimeUntil(post.scheduledAt)
        : '';
      const author = escapeHtml(post.authorName || 'Author');
      const tag = post.tag ? `<span class="activity-tag-badge">${escapeHtml(post.tag)}</span>` : '';

      html += `
        <div class="future-card-item" data-id="${post.id}">
          <div class="future-card-info">
            <div class="future-card-title-row">
              <a href="#write/${encodeURIComponent((post.slug && post.slug !== 'untitled-post') ? post.slug : post.id)}" class="future-card-title btn-future-open-post" data-id="${post.id}">${title}</a>
              ${tag}
            </div>
            <div class="future-card-meta">
              <span class="future-schedule-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${dateDisplay} at ${timeDisplay}
              </span>
              ${relativeTime ? `<span class="future-relative-time">(${relativeTime})</span>` : ''}
              <span>&bull;</span>
              <span>By ${author}</span>
            </div>
          </div>
          <div class="future-card-actions">
            <button type="button" class="btn btn-sm btn-secondary btn-future-edit" data-id="${post.id}" title="Edit in Studio">Edit</button>
            <button type="button" class="btn btn-sm btn-primary btn-future-publish-now" data-id="${post.id}" title="Publish immediately without waiting">Publish Now</button>
            <button type="button" class="btn btn-sm btn-ghost btn-future-cancel" data-id="${post.id}" title="Cancel schedule and keep as draft">&times;</button>
          </div>
        </div>
      `;
    });

    list.innerHTML = html;
    section.style.display = 'block';

    // Bind action buttons
    list.querySelectorAll('.btn-future-edit, .btn-future-open-post').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        if (id && typeof window.selectDraft === 'function') {
          window.selectDraft(id);
        }
      });
    });

    list.querySelectorAll('.btn-future-publish-now').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        if (id && ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler))) {
          ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).publishScheduledPostImmediately(id);
        }
      });
    });

    list.querySelectorAll('.btn-future-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        if (id && ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler))) {
          ((window.Cedar && window.Cedar.scheduler) || (window.Outpost && window.Outpost.scheduler)).cancelScheduledPost(id);
        }
      });
    });
  }

  /**
   * Checks whether a given activity log entry represents a post that is currently scheduled for future release.
   */
  function isPostScheduledForFuture(entry) {
    if (!entry || entry.type !== 'post') return false;
    const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : (window.drafts || []);
    const refId = entry.data?.id || (entry.id && entry.id.startsWith('synth-post-') ? entry.id.replace('synth-post-', '') : null);
    const post = allDrafts.find(d => (refId && d.id === refId) || (entry.data?.slug && d.slug === entry.data.slug));

    if (!post) {
      return entry.data?.status === 'scheduled' || entry.data?.scheduled === true;
    }

    const isScheduled = post.status === 'scheduled' || post.scheduled === true;
    if (!isScheduled) return false;

    const now = Date.now();
    if (post.scheduledAt) {
      return post.scheduledAt > now;
    }
    const localToday = typeof window.getLocalIsoDate === 'function' ? window.getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
    if (post.scheduledDate && post.scheduledDate > localToday) {
      return true;
    }
    if (post.date && post.date > localToday) {
      return true;
    }
    return true;
  }

  /**
   * Renders the complete Home activity stream
   */
  function renderHomeActivityStream() {
    initHomeControls();
    renderHomeFutureSection();

    const timeline = document.getElementById('home-activity-timeline');
    const emptyState = document.getElementById('home-activity-empty');
    if (!timeline) return;

    // Failsafe: if the image lightbox was left open displaying a post, close it immediately
    const activeLightbox = document.getElementById('home-image-lightbox');
    if (activeLightbox && activeLightbox.style.display !== 'none') {
      const capEl = document.getElementById('home-lightbox-caption');
      const capText = (capEl?.textContent || '').trim().toLowerCase();
      const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
        ? drafts
        : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);
      if (allDrafts.some(d => d && d.type !== 'page' && d.type !== 'note' && d.title && d.title.trim().toLowerCase() === capText)) {
        closeHomeImageLightbox();
      }
    }

    // Run synthesis if log is empty or new items arrived
    synthesizeInitialActivity();

    const rawLog = getActivityLog();

    if (!rawLog || rawLog.length === 0) {
      timeline.innerHTML = '';
      if (emptyState) {
        emptyState.style.display = 'flex';
        const titleEl = emptyState.querySelector('.home-empty-title');
        const descEl = emptyState.querySelector('.home-empty-desc');
        if (titleEl) titleEl.textContent = 'No feed activity yet';
        if (descEl) descEl.textContent = 'Everything you create, edit, or upload will automatically appear in this live feed.';
      }
      return;
    }

    // Clean consecutive duplicates in a row on the same day from rawLog
    const initLen = rawLog.length;
    cleanConsecutiveDuplicateActivities(rawLog);
    if (rawLog.length !== initLen && typeof saveProjectToStorage === 'function') {
      saveProjectToStorage();
    }

    // Sort newest first
    const sorted = rawLog.filter(e => e && e.type !== 'note' && e.type !== 'media_batch' && e.type !== 'media_upload').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const stream = groupActivityFeed(sorted);

    // 1. Filter by activeFilter, while strictly keeping scheduled future posts out of the timeline
    let filtered = stream.filter(entry => {
      // Exclude designer elements from the home feed
      if (entry.type === 'designer') {
        return false;
      }

      // If this post is booked for future release, it stays strictly in the Future section!
      if (isPostScheduledForFuture(entry)) {
        return false;
      }

      if (activeFilter === 'all') return true;
      if (activeFilter === 'milestone') return entry.type === 'milestone';
      if (activeFilter === 'post') return entry.type === 'post';
      if (activeFilter === 'page') return entry.type === 'page';
      if (activeFilter === 'category') return entry.type === 'category';
      if (activeFilter === 'author') return entry.type === 'author';
      if (activeFilter === 'media') return entry.type === 'media_batch' || entry.type === 'media_upload';
      return true;
    });

    // 2. Filter by activeSearchQuery
    if (activeSearchQuery) {
      filtered = filtered.filter(entry => matchesSearchQuery(entry, activeSearchQuery));
    }

    if (filtered.length === 0) {
      timeline.innerHTML = '';
      if (emptyState) {
        emptyState.style.display = 'flex';
        const titleEl = emptyState.querySelector('.home-empty-title');
        const descEl = emptyState.querySelector('.home-empty-desc');
        if (activeSearchQuery || activeFilter !== 'all') {
          if (titleEl) titleEl.textContent = 'No matching feed items';
          if (descEl) descEl.textContent = 'Try adjusting your filter or search query.';
        } else {
          if (titleEl) titleEl.textContent = 'No feed activity yet';
          if (descEl) descEl.textContent = 'Everything you create, edit, or upload will automatically appear in this live feed.';
        }
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    timeline.innerHTML = '';

    filtered.forEach(entry => {
      const card = createActivityCardDOM(entry);
      if (card) {
        timeline.appendChild(card);
      }
    });

    initLightboxEvents();
  }
  window.renderHomeActivityStream = renderHomeActivityStream;

  /**
   * Resolve an author's avatar URL or Data URL.
   * Looks up the author in projectConfig.authors (case-insensitive) so that
   * any photo updates saved in the Authors tab or Settings immediately reflect on the home feed.
   */
  function resolveAvatarViaRegistry(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    if (typeof window !== 'undefined' && window.imageRegistry && typeof window.imageRegistry.get === 'function') {
      const base = trimmed.split('/').pop().split('\\').pop();
      const reg = window.imageRegistry.get(trimmed) || window.imageRegistry.get(base) || window.imageRegistry.get(`images/${base}`);
      if (reg && typeof reg === 'object' && (reg.dataUrl || reg.objectUrl)) {
        return reg.dataUrl || reg.objectUrl;
      }
    }
    return trimmed;
  }

  function resolveAuthorAvatar(authorName, fallbackAvatar = '') {
    // 1. Explicit fallback passed in
    if (fallbackAvatar && typeof fallbackAvatar === 'string' && fallbackAvatar.trim()) {
      return resolveAvatarViaRegistry(fallbackAvatar.trim());
    }

    const cleanName = (authorName || '').trim().toLowerCase();
    if (!cleanName) return '';

    // 2. Check projectConfig.authors array
    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.authors)) {
      const match = projectConfig.authors.find(a => {
        const aName = (typeof a === 'object' && a !== null) ? (a.name || '') : String(a || '');
        return aName.trim().toLowerCase() === cleanName;
      });
      if (match && typeof match === 'object' && match.avatar && typeof match.avatar === 'string' && match.avatar.trim()) {
        return resolveAvatarViaRegistry(match.avatar.trim());
      }
    }

    // 3. Check drafts (and window.drafts) for any note or draft by this author with an avatar
    const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
      ? drafts
      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);

    if (allDrafts.length > 0) {
      const draftMatch = allDrafts.find(d => {
        const dAuthor = (d.authorName || (typeof d.author === 'string' ? d.author : d.author?.name) || '').trim().toLowerCase();
        return dAuthor === cleanName && d.authorAvatar && typeof d.authorAvatar === 'string' && d.authorAvatar.trim();
      });
      if (draftMatch && draftMatch.authorAvatar) {
        return draftMatch.authorAvatar.trim();
      }
    }

    // 4. Check active notes author persona via function
    if (typeof window !== 'undefined' && typeof window.getActiveNotesAuthorObj === 'function') {
      try {
        const activeObj = window.getActiveNotesAuthorObj();
        if (activeObj && activeObj.name && activeObj.name.trim().toLowerCase() === cleanName && activeObj.avatar) {
          return activeObj.avatar.trim();
        }
      } catch (e) {}
    }

    // 5. Check projectConfig default author & avatar
    if (typeof projectConfig !== 'undefined' && projectConfig) {
      const defName = (projectConfig.defaultAuthor || projectConfig.author || '').trim().toLowerCase();
      if (defName && cleanName === defName && projectConfig.authorAvatar) {
        return projectConfig.authorAvatar.trim();
      }
    }

    // 6. No hardcoded demo fallback - return empty so clean initial badge is rendered
    return '';
  }
  window.resolveAuthorAvatar = resolveAuthorAvatar;

  /**
   * Render author avatar DOM HTML
   */
  function renderAuthorAvatarHtml(authorName, explicitAvatar = '') {
    const avatarSrc = resolveAuthorAvatar(authorName, explicitAvatar);
    const initial = (authorName ? authorName.trim().charAt(0) : 'A').toUpperCase();

    if (avatarSrc) {
      return `
        <div class="activity-author-avatar has-image" title="${escapeHtml(authorName || 'Author')}">
          <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(authorName || 'Author')}" class="activity-author-avatar-img" onerror="this.style.display='none'; this.parentElement.classList.remove('has-image'); this.parentElement.innerHTML='<span class=\\'activity-author-avatar-fallback\\'>${escapeHtml(initial)}</span>';">
        </div>
      `;
    }

    return `
      <div class="activity-author-avatar" title="${escapeHtml(authorName || 'Author')}">
        <span class="activity-author-avatar-fallback">${escapeHtml(initial)}</span>
      </div>
    `;
  }
  window.renderAuthorAvatarHtml = renderAuthorAvatarHtml;

  /**
   * DOM factory for activity cards
   */
  function createActivityCardDOM(entry) {
    const timeFormatted = formatActivityTimestamp(entry.timestamp);

    // =========================================================================
    // 0. MILESTONE ACTIVITY ITEM (Celebratory Marker Bar)
    // =========================================================================
    if (entry.type === 'milestone') {
      const milestone = entry.data || {};
      const milestoneId = milestone.id || entry.id;
      let text = milestone.text || '';
      if (Array.from(text).length > 40) {
        text = Array.from(text).slice(0, 40).join('');
      }

      const card = document.createElement('article');
      card.className = 'activity-card activity-milestone-card';
      card.dataset.activityId = entry.id;
      card.dataset.milestoneId = milestoneId;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('title', 'Milestone: Click to edit or manage');

      card.innerHTML = `
        <div class="milestone-marker-left">
          <span class="milestone-marker-tag">Milestone</span>
        </div>
        <div class="milestone-marker-center">
          <span class="milestone-marker-desc">${renderFormattedNoteText(text)}</span>
        </div>
        <div class="milestone-marker-right">
          <span class="milestone-marker-trophy" aria-hidden="true">🏆</span>
        </div>
      `;

      card.addEventListener('click', () => {
        openMilestoneModal(milestoneId);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMilestoneModal(milestoneId);
        }
      });

      return card;
    }

    // =========================================================================
    // 1. NOTES ACTIVITY CARD
    // =========================================================================
    if (entry.type === 'note') {
      const note = entry.data || {};
      const noteNum = note.noteNumber || 1;
      const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
        ? drafts
        : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);
      const targetDraft = allDrafts.find(d => (note.id && d.id === note.id) || (d.noteNumber && d.noteNumber === noteNum));
      const authorName = note.authorName || targetDraft?.authorName || 'Author';
      const text = note.markdown || note.text || targetDraft?.markdown || '';
      const images = (Array.isArray(note.images) && note.images.length > 0) ? note.images : (targetDraft?.images || []);
      const authorAvatar = note.authorAvatar || targetDraft?.authorAvatar || entry.data?.authorAvatar || '';
      if (!entry.data.authorAvatar && authorAvatar) {
        entry.data.authorAvatar = authorAvatar;
      }
      const authorAvatarHtml = renderAuthorAvatarHtml(authorName, authorAvatar);

      const card = document.createElement('article');
      card.className = 'activity-card activity-note-card';
      card.dataset.activityId = entry.id;

      let mediaGridHtml = '';
      if (images.length > 0) {
        mediaGridHtml = `
          <div class="activity-note-media-grid" data-count="${Math.min(images.length, 4)}">
            ${images.slice(0, 4).map((img, i) => {
              const src = img.dataUrl || img.url || (img.filename ? `blog/images/${img.filename}` : '');
              return `
                <div class="activity-note-media-box" data-action="view-image" data-src="${src}" data-filename="${escapeHtml(img.filename || 'Note Image')}">
                  <img src="${src}" alt="Attached media" loading="lazy">
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="activity-type-col">
          <span class="activity-type-label type-note">Note</span>
        </div>
        <div class="activity-main-col">
          <div class="activity-author-meta">
            ${authorAvatarHtml}
            <span class="activity-author-name">${escapeHtml(authorName)}</span>
          </div>
          <div class="activity-note-content">${renderFormattedNoteText(text)}</div>
          ${mediaGridHtml}
        </div>
        <div class="activity-meta-col">
          <time class="activity-time" datetime="${new Date(entry.timestamp).toISOString()}">${timeFormatted}</time>
          <button type="button" class="activity-post-delete-btn" data-action="delete-post" title="Remove from feed" aria-label="Remove from feed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete-post"]');
        if (delBtn) {
          e.stopPropagation();
          e.preventDefault();
          const proj = typeof projectConfig !== 'undefined' ? projectConfig : (window.projectConfig || {});
          if (proj && Array.isArray(proj.activityLog)) {
            proj.activityLog = proj.activityLog.filter(a => !(a && a.id === entry.id));
            if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
            renderHomeActivityStream();
            if (typeof showToast === 'function') showToast('Removed from feed');
          }
          return;
        }
        if (e.target.closest('[data-action="view-image"]')) {
          e.stopPropagation();
          const box = e.target.closest('[data-action="view-image"]');
          openHomeImageLightbox(box.dataset.src, box.dataset.filename);
          return;
        }
        if (typeof navigateTo === 'function') {
          navigateTo(`note=${noteNum}`);
        }
      });

      return card;
    }

    // =========================================================================
    // 2. POSTS ACTIVITY CARD
    // =========================================================================
    if (entry.type === 'post') {
      const post = entry.data || {};
      const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
        ? drafts
        : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);
      
      const refId = post.id || (entry.id && entry.id.startsWith('synth-post-') ? entry.id.replace('synth-post-', '') : null) || entry.id;
      const targetDraft = allDrafts.find(d => 
        (refId && (d.id === refId || String(d.id) === String(refId))) || 
        (post.slug && d.slug === post.slug) ||
        (post.title && d.title && d.title.trim().toLowerCase() === post.title.trim().toLowerCase())
      );
      
      const title = (targetDraft && targetDraft.title && targetDraft.title.trim())
        ? targetDraft.title
        : (post.title || 'Untitled Post');

      let subtitleText = targetDraft?.subtitle || post.subtitle || '';
      if (!subtitleText) {
        if (targetDraft?.markdown) {
          subtitleText = extractPlainBodyExcerpt(targetDraft.markdown, 160);
        } else if (post.bodyExcerpt) {
          subtitleText = post.bodyExcerpt;
        } else if (post.markdown || post.html) {
          subtitleText = extractPlainBodyExcerpt(post.markdown || post.html, 160);
        }
      }

      function resolveAnyImage(candidate, draft) {
        if (!candidate) return '';
        
        // 1. Direct object inspection
        if (typeof candidate === 'object') {
          if (candidate.dataUrl && typeof candidate.dataUrl === 'string' && candidate.dataUrl.startsWith('data:')) {
            return candidate.dataUrl;
          }
          if (candidate.objectUrl && typeof candidate.objectUrl === 'string' && candidate.objectUrl.startsWith('blob:')) {
            return candidate.objectUrl;
          }
          if (candidate.blob && typeof Blob !== 'undefined' && candidate.blob instanceof Blob) {
            try { return URL.createObjectURL(candidate.blob); } catch (e) {}
          }
          if (candidate.src && typeof candidate.src === 'string' && (candidate.src.startsWith('data:') || candidate.src.startsWith('blob:') || /^https?:\/\//i.test(candidate.src))) {
            return candidate.src;
          }
          if (candidate.url && typeof candidate.url === 'string' && (candidate.url.startsWith('data:') || candidate.url.startsWith('blob:') || /^https?:\/\//i.test(candidate.url))) {
            return candidate.url;
          }
          const strCand = candidate.relativePath || candidate.filename || candidate.name || candidate.src || candidate.url || '';
          if (strCand) {
            const res = resolveAnyImage(strCand, draft);
            if (res) return res;
          }
          return '';
        }

        if (typeof candidate !== 'string') return '';
        const trimmed = candidate.trim();
        if (!trimmed) return '';

        // 2. Direct data:, blob:, or http(s) URL
        if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) {
          return trimmed;
        }

        const getBaseName = (s) => {
          if (!s || typeof s !== 'string') return '';
          const c = s.split('?')[0].split('#')[0].trim();
          if (c.startsWith('data:') || c.startsWith('blob:')) return '';
          return c.split('/').pop().trim();
        };

        const baseFilename = getBaseName(trimmed);
        const cleanNoPrefix = trimmed.replace(/^\/?(blog\/)?images\//, '').trim();

        // 3. Check window.imageRegistry
        if (typeof window !== 'undefined' && window.imageRegistry) {
          const regKeys = [
            trimmed,
            cleanNoPrefix,
            baseFilename,
            `/blog/images/${baseFilename}`,
            `blog/images/${baseFilename}`,
            `/images/${baseFilename}`,
            `images/${baseFilename}`
          ].filter(Boolean);

          for (const k of regKeys) {
            if (window.imageRegistry.has(k)) {
              const reg = window.imageRegistry.get(k);
              if (reg) {
                const regRes = reg.dataUrl || reg.objectUrl || (reg.blob ? URL.createObjectURL(reg.blob) : '') || reg.src || reg.url || '';
                if (regRes && (regRes.startsWith('data:') || regRes.startsWith('blob:') || /^https?:\/\//i.test(regRes))) {
                  return regRes;
                }
              }
            }
          }
        }

        // 4. Search images arrays
        const searchImagesArray = (arr) => {
          if (!Array.isArray(arr)) return '';
          for (const im of arr) {
            if (!im) continue;
            if (typeof im === 'string') {
              if (im.startsWith('data:image/') || im.startsWith('blob:') || /^https?:\/\//i.test(im)) {
                if (im === trimmed || (baseFilename && getBaseName(im) === baseFilename)) return im;
              }
              continue;
            }
            const imBase = getBaseName(im.filename || im.relativePath || im.name || '');
            const isMatch = (
              im.filename === trimmed ||
              im.filename === cleanNoPrefix ||
              im.relativePath === trimmed ||
              im.src === trimmed ||
              im.url === trimmed ||
              im.dataUrl === trimmed ||
              (baseFilename && imBase === baseFilename) ||
              (cleanNoPrefix && imBase === cleanNoPrefix)
            );
            if (isMatch) {
              const res = im.dataUrl || im.objectUrl || (im.blob ? URL.createObjectURL(im.blob) : '') || im.src || im.url || im.relativePath || '';
              if (res) {
                if (res.startsWith('data:') || res.startsWith('blob:') || /^https?:\/\//i.test(res)) {
                  return res;
                }
                if (res.startsWith('/blog/images/') || res.startsWith('blog/images/') || res.startsWith('/images/') || res.startsWith('images/')) {
                  return res;
                }
              }
            }
          }
          return '';
        };

        if (draft && Array.isArray(draft.images)) {
          const dRes = searchImagesArray(draft.images);
          if (dRes) return dRes;
        }

        if (Array.isArray(post.images)) {
          const pRes = searchImagesArray(post.images);
          if (pRes) return pRes;
        }

        if (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.mediaLibrary)) {
          const libRes = searchImagesArray(projectConfig.mediaLibrary);
          if (libRes) return libRes;
        }

        // 5. Try window.resolveImageDisplayUrl
        if (typeof window !== 'undefined' && typeof window.resolveImageDisplayUrl === 'function') {
          try {
            const builtIn = window.resolveImageDisplayUrl(trimmed, draft);
            if (builtIn && (builtIn.startsWith('data:image/') || builtIn.startsWith('blob:') || /^https?:\/\//i.test(builtIn))) {
              return builtIn;
            }
          } catch (e) {}
        }

        // 6. Static local asset check
        if (
          trimmed === 'images/Lamp.png' ||
          trimmed.startsWith('images/branding/') ||
          trimmed.startsWith('/blog/images/') ||
          trimmed.startsWith('blog/images/') ||
          trimmed.startsWith('/images/') ||
          trimmed.startsWith('images/')
        ) {
          return trimmed;
        }

        return '';
      }

      // Determine displayThumb
      let displayThumb = '';

      // If targetDraft explicitly removed cover image or has empty coverImage, do not show cover
      const hasExplicitEmptyCover = Boolean(targetDraft && (targetDraft.coverImageRemoved || targetDraft.coverImage === ''));

      if (!hasExplicitEmptyCover) {
        // Priority 1: Explicit featured or cover image
        const explicitCandidates = [
          targetDraft?.coverImage,
          targetDraft?.featuredImage,
          targetDraft?.coverImageOriginal,
          (!targetDraft ? post.coverImage : null),
          (!targetDraft ? post.featuredImage : null)
        ].filter(Boolean);

        for (const cand of explicitCandidates) {
          const r = resolveAnyImage(cand, targetDraft || post);
          if (r) {
            displayThumb = r;
            break;
          }
        }

        // Priority 2: Attached images on draft or post
        if (!displayThumb) {
          const attached = [
            ...(Array.isArray(targetDraft?.images) ? targetDraft.images : []),
            ...(!targetDraft && Array.isArray(post.images) ? post.images : [])
          ];
          for (const it of attached) {
            const r = resolveAnyImage(it, targetDraft || post);
            if (r) {
              displayThumb = r;
              break;
            }
          }
        }

        // Priority 3: Check available images via getDraftAvailableImages
        if (!displayThumb && targetDraft && typeof window !== 'undefined' && typeof window.getDraftAvailableImages === 'function') {
          try {
            const avail = window.getDraftAvailableImages(targetDraft);
            if (Array.isArray(avail)) {
              for (const av of avail) {
                const r = resolveAnyImage(av, targetDraft);
                if (r) {
                  displayThumb = r;
                  break;
                }
              }
            }
          } catch (e) {}
        }

        // Priority 4: Scan markdown body for inline or markdown images
        if (!displayThumb) {
          const md = targetDraft?.markdown || (!targetDraft ? (post.markdown || post.html) : '') || '';
          if (md) {
            const inlineMatch = md.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
            if (inlineMatch && inlineMatch[1]) {
              displayThumb = inlineMatch[1].trim();
            } else {
              const mdMatch = md.match(/!\[.*?\]\(\s*<?([^\s\)>]+)>?/);
              if (mdMatch && mdMatch[1]) {
                const r = resolveAnyImage(mdMatch[1], targetDraft || post);
                if (r) displayThumb = r;
              }
            }
          }
        }

        // Priority 5: Media library entry for this post
        if (!displayThumb && typeof projectConfig !== 'undefined' && Array.isArray(projectConfig.mediaLibrary)) {
          const match = projectConfig.mediaLibrary.find(m => m && (m.postId === post.id || (targetDraft && m.postId === targetDraft.id) || m.postTitle === title));
          if (match) {
            displayThumb = resolveAnyImage(match, targetDraft || post);
          }
        }
      }

      const authorName = targetDraft?.authorName || targetDraft?.author || post.authorName || (typeof projectConfig !== 'undefined' ? (projectConfig.defaultAuthor || projectConfig.author) : '') || 'Author';
      const authorAvatar = targetDraft?.authorAvatar || post.authorAvatar || '';
      const authorAvatarHtml = renderAuthorAvatarHtml(authorName, authorAvatar);

      const card = document.createElement('article');
      card.className = 'activity-card activity-post-card';
      card.dataset.activityId = entry.id;
      const resolvedPostId = targetDraft?.id || post.id || '';
      const resolvedPostSlug = targetDraft?.slug || post.slug || '';
      if (resolvedPostId) card.dataset.postId = resolvedPostId;
      if (resolvedPostSlug) card.dataset.postSlug = resolvedPostSlug;

      let thumbHtml = '';
      if (displayThumb) {
        const safeThumb = escapeHtml(displayThumb);
        thumbHtml = `
          <div class="activity-post-featured-thumb" title="Open post: ${escapeHtml(title)}" data-post-id="${escapeHtml(resolvedPostId)}" data-post-slug="${escapeHtml(resolvedPostSlug)}">
            <img src="${safeThumb}" alt="${escapeHtml(title)}" loading="lazy">
          </div>
        `;
      } else {
        thumbHtml = `
          <div class="activity-post-featured-thumb activity-post-thumb-fallback" title="Open post: ${escapeHtml(title)}" data-post-id="${escapeHtml(resolvedPostId)}" data-post-slug="${escapeHtml(resolvedPostSlug)}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="activity-post-thumb-col">
          ${thumbHtml}
        </div>
        <div class="activity-main-col activity-post-main-col">
          <h4 class="activity-post-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
          ${subtitleText ? `<p class="activity-post-subtitle">${escapeHtml(subtitleText)}</p>` : ''}
          <div class="activity-post-author-row">
            ${authorAvatarHtml}
            <span class="activity-post-author-name">By ${escapeHtml(authorName)}</span>
          </div>
        </div>
        <div class="activity-meta-col">
          <time class="activity-time" datetime="${new Date(entry.timestamp).toISOString()}">${timeFormatted}</time>
          <button type="button" class="activity-post-delete-btn" data-action="delete-post" title="Delete Post" aria-label="Delete Post">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      // Async fallback from CedarVirtualStorage in case image was only stored as a blob in OPFS
      if (!displayThumb) {
        const possibleFilename = (targetDraft?.featuredImage || post.featuredImage || targetDraft?.coverImage || (targetDraft?.images?.[0]?.filename) || (post.images?.[0]?.filename) || '')
          .replace(/^\/?(blog\/)?images\//, '').trim();
        if (possibleFilename && typeof window !== 'undefined' && (window.CedarVirtualStorage || window.OutpostVirtualStorage) && typeof (window.CedarVirtualStorage || window.OutpostVirtualStorage).readBlob === 'function') {
          (async () => {
            try {
              const b = await (window.CedarVirtualStorage || window.OutpostVirtualStorage).readBlob(`blog/images/${possibleFilename}`) ||
                        await (window.CedarVirtualStorage || window.OutpostVirtualStorage).readBlob(possibleFilename);
              if (b) {
                const blobUrl = URL.createObjectURL(b);
                const thumbBox = card.querySelector('.activity-post-featured-thumb');
                if (thumbBox) {
                  thumbBox.classList.remove('activity-post-thumb-fallback');
                  thumbBox.removeAttribute('data-action');
                  thumbBox.removeAttribute('data-src');
                  thumbBox.innerHTML = `<img src="${blobUrl}" alt="${escapeHtml(title)}" loading="lazy">`;
                }
              }
            } catch (err) {}
          })();
        }
      }

      const openThisPost = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (typeof closeHomeImageLightbox === 'function') {
          closeHomeImageLightbox();
        }
        const targetId = (targetDraft && (targetDraft.id || targetDraft.slug)) || post.id || post.slug || refId;
        if (typeof openPostInEditor === 'function' && (targetDraft || targetId)) {
          openPostInEditor(targetDraft || targetId);
        } else if (typeof navigateTo === 'function') {
          if (targetDraft?.slug && targetDraft.slug !== 'untitled-post') {
            navigateTo(`write/${encodeURIComponent(targetDraft.slug)}`);
          } else if (targetDraft?.id) {
            navigateTo(`write/${encodeURIComponent(targetDraft.id)}`);
          } else if (post.slug && post.slug !== 'untitled-post') {
            navigateTo(`write/${encodeURIComponent(post.slug)}`);
          } else if (post.id) {
            navigateTo(`write/${encodeURIComponent(post.id)}`);
          } else {
            navigateTo('posts');
          }
        }
      };

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete-post"]');
        if (delBtn) {
          e.stopPropagation();
          e.preventDefault();
          const targetId = (targetDraft && (targetDraft.id || targetDraft.slug)) || post.id || post.slug || refId;
          if (typeof window.deleteItem === 'function' && targetId) {
            window.deleteItem(targetId);
          } else {
            const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
            if (proj && Array.isArray(proj.activityLog)) {
              proj.activityLog = proj.activityLog.filter(a => !(a && (a.id === entry.id || a.data?.id === targetId || a.data?.slug === post.slug)));
              if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
              renderHomeActivityStream();
              if (typeof showToast === 'function') showToast('Removed from feed');
            }
          }
          return;
        }
        openThisPost(e);
      });
      const thumbBox = card.querySelector('.activity-post-featured-thumb');
      if (thumbBox) {
        thumbBox.addEventListener('click', openThisPost);
      }

      return card;
    }

    // =========================================================================
    // 3. MEDIA UPLOAD BATCH CARD
    // =========================================================================
    if (entry.type === 'media_batch') {
      const images = (Array.isArray(entry.images) && entry.images.length > 0)
        ? entry.images
        : (Array.isArray(entry.data?.images) ? entry.data.images : []);
      if (images.length === 0) return null;

      const card = document.createElement('article');
      card.className = 'activity-card activity-media-card';
      card.dataset.activityId = entry.id;

      const totalCount = images.length;
      const isEdited = entry.data?.action === 'edited' || entry.action === 'edited';
      let countLabel = '';
      if (isEdited) {
        const mediaName = images[0]?.filename || images[0]?.name || 'media';
        countLabel = `Edited <strong>${escapeHtml(mediaName)}</strong> media`;
      } else if (totalCount === 1) {
        const mediaName = images[0]?.filename || images[0]?.name || 'picture';
        countLabel = `Added <strong>${escapeHtml(mediaName)}</strong> to media`;
      } else {
        countLabel = `Added <strong>${totalCount} pictures</strong> to media`;
      }

      const previewImages = images.slice(0, 3);
      const remainingCount = totalCount - 3;

      let thumbsHtml = '';
      previewImages.forEach((img, idx) => {
        const src = img.src || img.objectUrl || img.dataUrl || (img.filename ? `blog/images/${img.filename}` : '');
        thumbsHtml += `
          <div class="activity-media-box" data-action="view-image" data-src="${src}" data-filename="${escapeHtml(img.filename || 'Image')}">
            <img src="${src}" alt="${escapeHtml(img.filename || 'Uploaded media')}" loading="lazy">
          </div>
        `;
      });

      let fourthBoxHtml = '';
      if (remainingCount > 0) {
        fourthBoxHtml = `
          <div class="activity-more-box" data-action="go-to-media" role="button" tabindex="0" title="View all ${totalCount} in Media Library">
            <span class="activity-more-plus">+${remainingCount} more</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="activity-type-col">
          <span class="activity-type-label type-media">Media</span>
        </div>
        <div class="activity-main-col">
          <div class="activity-media-desc">${countLabel}</div>
          <div class="activity-media-grid" data-boxes="${Math.min(totalCount, 4)}">
            ${thumbsHtml}
            ${fourthBoxHtml}
          </div>
        </div>
        <div class="activity-meta-col">
          <time class="activity-time" datetime="${new Date(entry.timestamp).toISOString()}">${timeFormatted}</time>
          <button type="button" class="activity-post-delete-btn" data-action="delete-post" title="Remove from feed" aria-label="Remove from feed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete-post"]');
        if (delBtn) {
          e.stopPropagation();
          e.preventDefault();
          const proj = typeof projectConfig !== 'undefined' ? projectConfig : (window.projectConfig || {});
          if (proj && Array.isArray(proj.activityLog)) {
            proj.activityLog = proj.activityLog.filter(a => !(a && a.id === entry.id));
            if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
            renderHomeActivityStream();
            if (typeof showToast === 'function') showToast('Removed from feed');
          }
          return;
        }

        const moreBox = e.target.closest('[data-action="go-to-media"]');
        if (moreBox) {
          e.stopPropagation();
          if (typeof navigateTo === 'function') {
            navigateTo('media');
          }
          return;
        }

        const imgBox = e.target.closest('[data-action="view-image"]');
        if (imgBox) {
          e.stopPropagation();
          openHomeImageLightbox(imgBox.dataset.src, imgBox.dataset.filename);
        }
      });

      return card;
    }

    // =========================================================================
    // 4. PAGES ACTIVITY CARD
    // =========================================================================
    if (entry.type === 'page') {
      const page = entry.data || {};
      let title = page.title || 'Untitled Page';
      const allDrafts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts))
        ? window.drafts
        : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);
      const liveDraft = allDrafts.find(d => {
        if (!d || d.type !== 'page') return false;
        if (page.id && (d.id === page.id || String(d.id) === String(page.id))) return true;
        if (entry.id && (entry.id === `synth-page-${d.id}` || entry.id === `act-page-${d.id}`)) return true;
        if (page.slug && d.slug === page.slug) return true;
        if (d.title && title && d.title.trim().toLowerCase() === title.trim().toLowerCase()) return true;
        if (d.isCategoryAggregate && d.categoryAggregate && title && d.categoryAggregate.trim().toLowerCase() === title.trim().toLowerCase()) return true;
        return false;
      });
      if (liveDraft && liveDraft.title && liveDraft.title.trim()) {
        title = liveDraft.title.trim();
        page.title = title;
        if (liveDraft.slug) page.slug = liveDraft.slug;
        if (liveDraft.id) page.id = liveDraft.id;
      }

      // User rule: on feed, only show 'created the category' not the page for the category.
      const isCatDraft = Boolean(liveDraft && (liveDraft.isCategoryAggregate || String(liveDraft.id || '').startsWith('page_cat_')));
      const isCatPageId = Boolean((page.id && String(page.id).startsWith('page_cat_')) || (entry.id && String(entry.id).includes('page_cat_')));
      const currentProjCats = new Set((getProjectConfig().categories || []).map(c => String(c).trim().toLowerCase()));
      const isCatByName = currentProjCats.has(String(title).trim().toLowerCase()) || (liveDraft && liveDraft.categoryAggregate && currentProjCats.has(liveDraft.categoryAggregate.trim().toLowerCase()));

      const titleLowerCheck = String(title).trim().toLowerCase();
      if (
        isCatDraft || isCatPageId || isCatByName ||
        page.id === 'page_about_cedar' || page.slug === 'about-cedar' || titleLowerCheck === 'about cedar' ||
        (entry.id && (entry.id === 'synth-page-page_about_cedar' || String(entry.id).includes('about_cedar') || String(entry.id).includes('about-cedar')))
      ) {
        return null;
      }

      const isEdited = page.action === 'edited';
      const isRenamed = page.action === 'renamed';
      let pageText = '';
      if (isRenamed && page.oldTitle) {
        pageText = `Renamed the <strong>${escapeHtml(page.oldTitle)}</strong> page to <strong class="activity-link-target">${escapeHtml(title)}</strong>`;
      } else if (isRenamed) {
        pageText = `Renamed the <strong class="activity-link-target">${escapeHtml(title)}</strong> page`;
      } else {
        pageText = `<strong class="activity-link-target">${escapeHtml(title)}</strong> page ${isEdited ? 'edited' : 'created'}`;
      }

      const card = document.createElement('article');
      card.className = 'activity-card activity-page-card';
      card.dataset.activityId = entry.id;

      card.innerHTML = `
        <div class="activity-type-col">
          <span class="activity-type-label type-page">Page</span>
        </div>
        <div class="activity-main-col">
          <div class="activity-log-body">
            <span class="activity-log-text">${pageText}</span>
          </div>
        </div>
        <div class="activity-meta-col">
          <time class="activity-time" datetime="${new Date(entry.timestamp).toISOString()}">${timeFormatted}</time>
          <button type="button" class="activity-post-delete-btn" data-action="delete-post" title="Delete Page" aria-label="Delete Page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete-post"]');
        if (delBtn) {
          e.stopPropagation();
          e.preventDefault();
          const targetId = page.id || entry.data?.id || (liveDraft && liveDraft.id);
          if (typeof window.deleteItem === 'function' && targetId) {
            window.deleteItem(targetId);
          } else {
            const proj = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
            if (proj && Array.isArray(proj.activityLog)) {
              proj.activityLog = proj.activityLog.filter(a => !(a && (a.id === entry.id || a.data?.id === targetId)));
              if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
              renderHomeActivityStream();
              if (typeof showToast === 'function') showToast('Removed from feed');
            }
          }
          return;
        }
        if (typeof openPostInEditor === 'function' && (page.id || page.slug)) {
          openPostInEditor(page.id || page.slug);
        } else if (typeof navigateTo === 'function') {
          if (page.slug && page.slug !== 'untitled-page') {
            navigateTo(`write/page/${encodeURIComponent(page.slug)}`);
          } else if (page.id) {
            navigateTo(`write/page/${encodeURIComponent(page.id)}`);
          } else {
            navigateTo('pages');
          }
        }
      });

      return card;
    }

    // =========================================================================
    // 5. CATEGORIES ACTIVITY CARD
    // =========================================================================
    if (entry.type === 'category') {
      const cat = entry.data || {};
      let catName = String(cat.categoryName || cat.newName || cat.category || '').trim();
      const projCategories = (getProjectConfig().categories || []);
      const allDrafts = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts))
        ? window.drafts
        : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);

      const matchCat = projCategories.find(c => {
        if (!c) return false;
        const cStr = String(c).trim();
        return cStr.toLowerCase() === catName.toLowerCase() ||
               (typeof window.generateSlug === 'function' && window.generateSlug(cStr) === window.generateSlug(catName));
      });

      const matchCatDraft = !matchCat ? allDrafts.find(d => {
        if (!d || d.type !== 'page') return false;
        return (d.isCategoryAggregate && d.categoryAggregate && d.categoryAggregate.trim().toLowerCase() === catName.toLowerCase()) ||
               (d.id && d.id.startsWith('page_cat_') && (d.title || '').trim().toLowerCase() === catName.toLowerCase());
      }) : null;

      if (matchCat) {
        catName = String(matchCat).trim();
        cat.categoryName = catName;
      } else if (matchCatDraft && (matchCatDraft.title || matchCatDraft.categoryAggregate)) {
        catName = (matchCatDraft.title || matchCatDraft.categoryAggregate).trim();
        cat.categoryName = catName;
      }

      // Validate that category still exists in config or drafts
      const catLower = catName.toLowerCase();
      const stillExists = projCategories.some(c => String(c).trim().toLowerCase() === catLower) ||
                          allDrafts.some(d => d && (
                            (d.type === 'page' && (d.title || '').trim().toLowerCase() === catLower) ||
                            (d.tag && d.tag.trim().toLowerCase() === catLower) ||
                            (Array.isArray(d.categories) && d.categories.some(c => String(c).trim().toLowerCase() === catLower))
                          ));
      if (!stillExists) {
        return null;
      }

      if (cat.action === 'reordered' || cat.action === 'reorder') {
        return null;
      }

      let text = '';
      if (cat.action === 'added') {
        text = `Created the <strong>${escapeHtml(catName || 'New')}</strong> category`;
      } else if (cat.action === 'renamed') {
        const oldDisplayName = String(cat.oldName || '').trim();
        if (oldDisplayName) {
          text = `Renamed the <strong>${escapeHtml(oldDisplayName)}</strong> category to <strong>${escapeHtml(catName)}</strong>`;
        } else {
          text = `Renamed the <strong>${escapeHtml(catName)}</strong> category`;
        }
      } else {
        text = `Edited the <strong>${escapeHtml(catName || '')}</strong> category`;
      }

      const card = document.createElement('article');
      card.className = 'activity-card activity-cat-card';
      card.dataset.activityId = entry.id;

      card.innerHTML = `
        <div class="activity-type-col">
          <span class="activity-type-label type-category">Category</span>
        </div>
        <div class="activity-main-col">
          <div class="activity-log-body">
            <span class="activity-log-text">${text}</span>
          </div>
        </div>
        <div class="activity-meta-col">
          <time class="activity-time" datetime="${new Date(entry.timestamp).toISOString()}">${timeFormatted}</time>
          <button type="button" class="activity-post-delete-btn" data-action="delete-post" title="Remove from feed" aria-label="Remove from feed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete-post"]');
        if (delBtn) {
          e.stopPropagation();
          e.preventDefault();
          const proj = typeof projectConfig !== 'undefined' ? projectConfig : (window.projectConfig || {});
          if (proj && Array.isArray(proj.activityLog)) {
            proj.activityLog = proj.activityLog.filter(a => !(a && a.id === entry.id));
            if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
            renderHomeActivityStream();
            if (typeof showToast === 'function') showToast('Removed from feed');
          }
          return;
        }

        if (typeof navigateTo === 'function') {
          navigateTo('pages/categories');
        }
      });

      return card;
    }

    // =========================================================================
    // 6. AUTHOR ACTIVITY CARD
    // =========================================================================
    if (entry.type === 'author') {
      const data = entry.data || {};
      const authorName = String(data.name || data.authorName || data.newName || '').trim();
      const oldName = String(data.oldName || '').trim();
      let text = '';
      if (data.action === 'renamed' && oldName && authorName) {
        text = `Renamed author <strong>${escapeHtml(oldName)}</strong> to <strong>${escapeHtml(authorName)}</strong>`;
      } else if (data.action === 'renamed') {
        text = `Renamed author page to <strong>${escapeHtml(authorName || 'Author')}</strong>`;
      } else if (data.action === 'added' || data.action === 'created') {
        text = `Added author <strong>${escapeHtml(authorName || 'Author')}</strong>`;
      } else {
        text = `Updated author profile for <strong>${escapeHtml(authorName || 'Author')}</strong>`;
      }

      const card = document.createElement('article');
      card.className = 'activity-card activity-author-card';
      card.dataset.activityId = entry.id;

      card.innerHTML = `
        <div class="activity-type-col">
          <span class="activity-type-label type-author">Author</span>
        </div>
        <div class="activity-main-col">
          <div class="activity-log-body">
            <span class="activity-log-text">${text}</span>
          </div>
        </div>
        <div class="activity-meta-col">
          <time class="activity-time" datetime="${new Date(entry.timestamp).toISOString()}">${timeFormatted}</time>
          <button type="button" class="activity-post-delete-btn" data-action="delete-post" title="Remove from feed" aria-label="Remove from feed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-action="delete-post"]');
        if (delBtn) {
          e.stopPropagation();
          e.preventDefault();
          const proj = typeof projectConfig !== 'undefined' ? projectConfig : (window.projectConfig || {});
          if (proj && Array.isArray(proj.activityLog)) {
            proj.activityLog = proj.activityLog.filter(a => !(a && a.id === entry.id));
            if (typeof saveProjectToStorage === 'function') saveProjectToStorage();
            renderHomeActivityStream();
            if (typeof showToast === 'function') showToast('Removed from feed');
          }
          return;
        }

        if (typeof navigateTo === 'function') {
          navigateTo('settings');
        } else {
          window.location.hash = '#settings';
        }
        setTimeout(() => {
          const authorInput = document.getElementById('setting-author-name');
          if (authorInput) {
            authorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            authorInput.focus();
          }
        }, 150);
      });

      return card;
    }

    // Designer elements are excluded from the home feed
    if (entry.type === 'designer') {
      return null;
    }

    return null;
  }

  /**
   * Helper to format note text with linebreaks and hashtags
   */
  function renderFormattedNoteText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    // Replace hashtags with styled pills
    escaped = escaped.replace(/(^|\s)#([a-zA-Z0-9_\-]+)/g, '$1<span class="activity-hashtag">#$2</span>');
    // Convert newlines to <br>
    return escaped.replace(/\n/g, '<br>');
  }

  // =========================================================================
  // IMAGE LIGHTBOX PREVIEW OVERLAY (In-place on Home)
  // =========================================================================
  function openHomeImageLightbox(src, caption = '') {
    if (!src) return;

    // Post thumbnail images must NEVER open in the media lightbox; simply open the post in the editor!
    const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
      ? drafts
      : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);

    const trimmedCap = (caption || '').trim().toLowerCase();

    // Check if caption or src matches ANY post
    const postMatch = allDrafts.find(d => {
      if (!d || d.type === 'page' || d.type === 'note') return false;
      if (trimmedCap && (
        (d.title && d.title.trim().toLowerCase() === trimmedCap) ||
        (d.id && String(d.id).toLowerCase() === trimmedCap) ||
        (d.slug && d.slug.toLowerCase() === trimmedCap) ||
        (trimmedCap.includes((d.title || '').trim().toLowerCase()))
      )) return true;
      if (src && (
        (d.featuredImage && (d.featuredImage === src || src.endsWith(d.featuredImage))) ||
        (d.coverImage && (d.coverImage === src || src.endsWith(d.coverImage)))
      )) return true;
      return false;
    });

    if (postMatch) {
      closeHomeImageLightbox();
      if (typeof openPostInEditor === 'function') {
        openPostInEditor(postMatch);
      } else if (typeof navigateTo === 'function') {
        navigateTo(`write/${encodeURIComponent(postMatch.slug || postMatch.id)}`);
      }
      return;
    }

    if (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.activityLog)) {
      const actMatch = projectConfig.activityLog.find(a => {
        if (!a || a.type !== 'post') return false;
        const t = (a.data?.title || '').trim().toLowerCase();
        return t && (t === trimmedCap || trimmedCap.includes(t));
      });
      if (actMatch) {
        closeHomeImageLightbox();
        const pid = actMatch.data?.id || actMatch.data?.slug || actMatch.id;
        if (typeof openPostInEditor === 'function' && pid) {
          openPostInEditor(pid);
        } else if (typeof navigateTo === 'function' && pid) {
          navigateTo(`write/${encodeURIComponent(pid)}`);
        }
        return;
      }
    }

    const modal = document.getElementById('home-image-lightbox');
    const img = document.getElementById('home-lightbox-img');
    const cap = document.getElementById('home-lightbox-caption');
    if (!modal || !img) return;

    img.src = src;
    if (cap) {
      cap.textContent = caption || '';
      cap.style.display = caption ? 'block' : 'none';
    }

    modal.style.display = 'flex';
    document.body.classList.add('home-lightbox-active');
  }
  window.openHomeImageLightbox = openHomeImageLightbox;

  function closeHomeImageLightbox() {
    const modal = document.getElementById('home-image-lightbox');
    const img = document.getElementById('home-lightbox-img');
    if (modal) modal.style.display = 'none';
    if (img) img.src = '';
    document.body.classList.remove('home-lightbox-active');
  }
  window.closeHomeImageLightbox = closeHomeImageLightbox;

  function initLightboxEvents() {
    const modal = document.getElementById('home-image-lightbox');
    const closeBtn = document.getElementById('btn-home-lightbox-close');
    const backdrop = document.getElementById('home-lightbox-backdrop');
    const img = document.getElementById('home-lightbox-img');
    const cap = document.getElementById('home-lightbox-caption');

    if (modal && !modal._eventsBound) {
      modal._eventsBound = true;
      if (closeBtn) closeBtn.addEventListener('click', closeHomeImageLightbox);
      if (backdrop) backdrop.addEventListener('click', closeHomeImageLightbox);

      // If user clicks the image in the lightbox and it matches a post, open the post!
      if (img) {
        img.addEventListener('click', (e) => {
          const capText = (cap?.textContent || '').trim().toLowerCase();
          const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
            ? drafts
            : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);
          const match = allDrafts.find(d => {
            if (!d || d.type === 'page' || d.type === 'note') return false;
            return (d.title && d.title.trim().toLowerCase() === capText) ||
                   (d.slug && d.slug.toLowerCase() === capText) ||
                   (d.id && String(d.id).toLowerCase() === capText);
          });
          if (match) {
            e.stopPropagation();
            closeHomeImageLightbox();
            if (typeof openPostInEditor === 'function') {
              openPostInEditor(match);
            } else if (typeof navigateTo === 'function') {
              navigateTo(`write/${encodeURIComponent(match.slug || match.id)}`);
            }
          }
        });
      }

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          closeHomeImageLightbox();
        }
      });
    }
  }

  // Global capture-phase listener: Clicking ANY post thumbnail or picture ALWAYS simply opens the post in editor
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const postCard = e.target && e.target.closest && e.target.closest('.activity-post-card');
      if (!postCard) return;

      const thumb = e.target.closest('.activity-post-featured-thumb, .activity-post-thumb-col, img');
      if (thumb && postCard.contains(thumb)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (typeof closeHomeImageLightbox === 'function') {
          closeHomeImageLightbox();
        }

        const postId = postCard.dataset.postId || (thumb.dataset && thumb.dataset.postId);
        const postSlug = postCard.dataset.postSlug || (thumb.dataset && thumb.dataset.postSlug);
        const postTitle = (postCard.querySelector('.activity-post-title')?.textContent?.trim()) || '';

        const allDrafts = (typeof drafts !== 'undefined' && Array.isArray(drafts))
          ? drafts
          : ((typeof window !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : []);

        const draft = allDrafts.find(d =>
          (postId && (d.id === postId || String(d.id) === String(postId))) ||
          (postSlug && d.slug === postSlug) ||
          (postTitle && d.title && d.title.trim().toLowerCase() === postTitle.toLowerCase())
        );

        const target = draft || postId || postSlug || postTitle;
        if (typeof openPostInEditor === 'function' && target) {
          openPostInEditor(target);
        } else if (typeof navigateTo === 'function') {
          const slugOrId = (draft && (draft.slug || draft.id)) || postSlug || postId;
          if (slugOrId) {
            navigateTo(`write/${encodeURIComponent(slugOrId)}`);
          } else {
            navigateTo('posts');
          }
        }
      }
    }, true);
  }

  // Export module
  window.Cedar.dashboard.home = window.Outpost.dashboard.home = {
    logActivity: logActivity,
    synthesizeInitialActivity: synthesizeInitialActivity,
    renderHomeActivityStream: renderHomeActivityStream,
    openHomeImageLightbox: openHomeImageLightbox,
    closeHomeImageLightbox: closeHomeImageLightbox,
    openMilestoneModal: openMilestoneModal,
    closeMilestoneModal: closeMilestoneModal,
    deleteMilestone: deleteMilestone
  };

})();
