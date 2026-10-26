/**
 * Cedar — Prose Link Popup & Social Media Cards
 * Provides a floating quick-action popup when clicking words with links in the prose editor,
 * with rich social media card flyouts on hover (YouTube & Bluesky).
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  // In-memory cache for fetched social metadata to ensure 0ms repeat renders
  const socialCache = new Map();

  let popupEl = null;
  let activeLink = null;
  let cardFlyoutEl = null;
  let hoverTimeout = null;
  let currentSocialMeta = null;

  /**
   * Helper: Detects if a URL is YouTube or Bluesky, and extracts identifiers
   */
  function detectSocialLink(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();

    // 1. YouTube
    // Matches watch?v=..., youtu.be/..., embed/..., shorts/...
    const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (ytMatch) {
      return {
        service: 'youtube',
        id: ytMatch[1],
        url: cleanUrl
      };
    }

    // 2. Bluesky
    // Matches bsky.app/profile/{handle}/post/{rkey} or bsky.app/profile/{handle}
    const bskyPostMatch = cleanUrl.match(/bsky\.app\/profile\/([^/?#]+)\/post\/([^/?#]+)/i);
    if (bskyPostMatch) {
      return {
        service: 'bluesky',
        type: 'post',
        handle: bskyPostMatch[1],
        rkey: bskyPostMatch[2],
        url: cleanUrl
      };
    }

    const bskyProfMatch = cleanUrl.match(/bsky\.app\/profile\/([^/?#]+)/i);
    if (bskyProfMatch) {
      return {
        service: 'bluesky',
        type: 'profile',
        handle: bskyProfMatch[1],
        url: cleanUrl
      };
    }

    return null;
  }

  /**
   * Helper: Escapes HTML strings to prevent XSS
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Helper: Formats follower counts / likes into clean string (e.g. 1.2K)
   */
  function formatCount(num) {
    if (!num || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(num);
  }

  /**
   * Fetches metadata for YouTube or Bluesky link
   */
  async function fetchSocialCardData(social) {
    const cacheKey = social.url;
    if (socialCache.has(cacheKey)) {
      return socialCache.get(cacheKey);
    }

    if (social.service === 'youtube') {
      const thumbUrl = `https://img.youtube.com/vi/${social.id}/hqdefault.jpg`;
      const fallbackData = {
        service: 'youtube',
        id: social.id,
        url: social.url,
        title: 'YouTube Video',
        authorName: 'YouTube',
        thumbUrl: thumbUrl
      };

      try {
        const canonical = `https://www.youtube.com/watch?v=${social.id}`;
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`);
        if (res.ok) {
          const data = await res.json();
          const result = {
            service: 'youtube',
            id: social.id,
            url: social.url,
            title: data.title || fallbackData.title,
            authorName: data.author_name || fallbackData.authorName,
            thumbUrl: data.thumbnail_url || thumbUrl
          };
          socialCache.set(cacheKey, result);
          return result;
        }
      } catch (e) {
        // Use fallback if offline or request blocked
      }
      socialCache.set(cacheKey, fallbackData);
      return fallbackData;
    }

    if (social.service === 'bluesky') {
      try {
        if (social.type === 'profile') {
          const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(social.handle)}`);
          if (res.ok) {
            const data = await res.json();
            const result = {
              service: 'bluesky',
              type: 'profile',
              url: social.url,
              handle: data.handle || social.handle,
              displayName: data.displayName || data.handle || social.handle,
              avatar: data.avatar || '',
              description: data.description || '',
              followersCount: data.followersCount || 0
            };
            socialCache.set(cacheKey, result);
            return result;
          }
        } else if (social.type === 'post') {
          // 1. Resolve profile to get DID
          const profRes = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(social.handle)}`);
          if (profRes.ok) {
            const prof = await profRes.json();
            const did = prof.did;
            // 2. Fetch post thread
            const postUri = `at://${did}/app.bsky.feed.post/${social.rkey}`;
            const postRes = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=0`);
            if (postRes.ok) {
              const thread = await postRes.json();
              const post = thread.thread?.post;
              if (post) {
                const result = {
                  service: 'bluesky',
                  type: 'post',
                  url: social.url,
                  handle: post.author?.handle || prof.handle || social.handle,
                  displayName: post.author?.displayName || prof.displayName || social.handle,
                  avatar: post.author?.avatar || prof.avatar || '',
                  text: post.record?.text || '',
                  likeCount: post.likeCount || 0,
                  repostCount: post.repostCount || 0,
                  replyCount: post.replyCount || 0
                };
                socialCache.set(cacheKey, result);
                return result;
              }
            }
          }
        }
      } catch (e) {
        // Fallback on error
      }

      const fallbackData = {
        service: 'bluesky',
        type: social.type,
        url: social.url,
        handle: social.handle,
        displayName: social.handle,
        avatar: '',
        description: social.type === 'profile' ? 'Bluesky Profile' : '',
        text: social.type === 'post' ? 'Bluesky Post' : '',
        followersCount: 0,
        likeCount: 0,
        repostCount: 0,
        replyCount: 0
      };
      socialCache.set(cacheKey, fallbackData);
      return fallbackData;
    }

    return null;
  }

  /**
   * Initializes or returns the singleton popup DOM element
   */
  function getPopupElement() {
    if (popupEl && document.body.contains(popupEl)) {
      return popupEl;
    }

    popupEl = document.createElement('div');
    popupEl.id = 'prose-link-popup';
    popupEl.className = 'prose-link-popup';
    popupEl.style.display = 'none';

    popupEl.innerHTML = `
      <div class="prose-link-bar">
        <div class="prose-link-input-wrap">
          <span class="prose-link-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </span>
          <input type="text" class="prose-link-input" id="prose-link-input" placeholder="Paste or type URL..." spellcheck="false" autocomplete="off">
        </div>
        <div class="prose-link-actions">
          <button type="button" class="btn btn-sm btn-primary btn-save-link" id="prose-link-btn-save">Save</button>
          <button type="button" class="btn btn-sm btn-secondary btn-cancel-link" id="prose-link-btn-cancel">Cancel</button>
          <button type="button" class="prose-link-btn btn-unlink-link" id="prose-link-btn-unlink" title="Remove link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"></path>
              <line x1="2" y1="2" x2="22" y2="22"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="prose-link-card-flyout" id="prose-link-card-flyout" style="display: none;"></div>
    `;

    document.body.appendChild(popupEl);
    cardFlyoutEl = document.getElementById('prose-link-card-flyout');

    const input = document.getElementById('prose-link-input');
    const btnSave = document.getElementById('prose-link-btn-save');
    const btnCancel = document.getElementById('prose-link-btn-cancel');
    const btnUnlink = document.getElementById('prose-link-btn-unlink');

    function applySave() {
      if (!activeLink) {
        hidePopup();
        return;
      }
      const rawVal = input ? input.value.trim() : '';
      if (!rawVal) {
        // Empty URL removes link
        if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
        const parent = activeLink.parentNode;
        if (parent) {
          while (activeLink.firstChild) {
            parent.insertBefore(activeLink.firstChild, activeLink);
          }
          parent.removeChild(activeLink);
        }
        hidePopup();
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        if (typeof window.showToast === 'function') window.showToast('Link removed');
        return;
      }

      let formattedUrl = rawVal;
      if (!/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/') && !formattedUrl.startsWith('#') && !formattedUrl.startsWith('mailto:') && !formattedUrl.startsWith('tel:')) {
        formattedUrl = 'https://' + formattedUrl;
      }

      if (typeof window.commitCheckpoint === 'function') window.commitCheckpoint();
      activeLink.setAttribute('href', formattedUrl);
      activeLink.setAttribute('target', '_blank');
      activeLink.setAttribute('rel', 'noopener noreferrer');

      hidePopup();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      if (typeof window.showToast === 'function') window.showToast('Link updated');
    }

    if (btnSave) {
      btnSave.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applySave();
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidePopup();
      });
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          applySave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hidePopup();
        }
      });
    }

    // Remove link (unlink)
    if (btnUnlink) {
      btnUnlink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!activeLink) return;

        if (typeof window.commitCheckpoint === 'function') {
          window.commitCheckpoint();
        }

        const parent = activeLink.parentNode;
        if (parent) {
          while (activeLink.firstChild) {
            parent.insertBefore(activeLink.firstChild, activeLink);
          }
          parent.removeChild(activeLink);
        }

        hidePopup();

        if (typeof window.scheduleAutosave === 'function') {
          window.scheduleAutosave();
        }
        if (typeof window.showToast === 'function') {
          window.showToast('Link removed');
        }
      });
    }

    return popupEl;
  }

  /**
   * Renders the social media card HTML inside the flyout
   */
  function renderSocialCard(data) {
    if (!cardFlyoutEl) return;
    if (!data) {
      cardFlyoutEl.innerHTML = '';
      return;
    }

    if (data.service === 'youtube') {
      cardFlyoutEl.innerHTML = `
        <div class="prose-social-card prose-social-youtube">
          <div class="prose-card-header">
            <span class="prose-card-brand-badge brand-yt">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>YouTube</span>
            </span>
            <span class="prose-card-author-name" title="${escapeHtml(data.authorName)}">${escapeHtml(data.authorName)}</span>
          </div>
          <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer" class="prose-card-thumb-wrap" title="Watch on YouTube">
            <img src="${escapeHtml(data.thumbUrl)}" class="prose-card-thumb" alt="${escapeHtml(data.title)}" loading="lazy" />
            <div class="prose-card-play-overlay">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <polygon points="6 4 20 12 6 20 6 4"></polygon>
              </svg>
            </div>
          </a>
          <div class="prose-card-content">
            <div class="prose-card-title" title="${escapeHtml(data.title)}">${escapeHtml(data.title)}</div>
          </div>
        </div>
      `;
    } else if (data.service === 'bluesky') {
      const avatarHtml = data.avatar
        ? `<img src="${escapeHtml(data.avatar)}" class="prose-card-avatar" alt="${escapeHtml(data.displayName)}" />`
        : `<div class="prose-card-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;background:#0285ff;">${(data.displayName || 'B').charAt(0).toUpperCase()}</div>`;

      if (data.type === 'profile') {
        cardFlyoutEl.innerHTML = `
          <div class="prose-social-card prose-social-bluesky">
            <div class="prose-card-header">
              <span class="prose-card-brand-badge brand-bsky">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566 1.01 0 1.95 0 5.241c0 3.29 1.956 12.38 3.523 14.81 1.567 2.43 4.198 1.547 5.92-.095 1.526-1.455 2.557-3.86 2.557-3.86s1.031 2.405 2.557 3.86c1.722 1.642 4.353 2.525 5.92.095 1.567-2.43 3.523-11.52 3.523-14.81 0-3.29-2.566-4.23-5.202-2.436C16.046 4.747 13.087 8.686 12 10.8z"/>
                </svg>
                <span>Bluesky</span>
              </span>
              <span class="prose-card-author-name">${formatCount(data.followersCount)} followers</span>
            </div>
            <div class="prose-card-author-row">
              ${avatarHtml}
              <div class="prose-card-author-meta">
                <span class="prose-card-author-display">${escapeHtml(data.displayName)}</span>
                <span class="prose-card-author-handle">@${escapeHtml(data.handle)}</span>
              </div>
            </div>
            ${data.description ? `<div class="prose-card-body-text">${escapeHtml(data.description)}</div>` : ''}
          </div>
        `;
      } else {
        // Post
        cardFlyoutEl.innerHTML = `
          <div class="prose-social-card prose-social-bluesky">
            <div class="prose-card-header">
              <span class="prose-card-brand-badge brand-bsky">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566 1.01 0 1.95 0 5.241c0 3.29 1.956 12.38 3.523 14.81 1.567 2.43 4.198 1.547 5.92-.095 1.526-1.455 2.557-3.86 2.557-3.86s1.031 2.405 2.557 3.86c1.722 1.642 4.353 2.525 5.92.095 1.567-2.43 3.523-11.52 3.523-14.81 0-3.29-2.566-4.23-5.202-2.436C16.046 4.747 13.087 8.686 12 10.8z"/>
                </svg>
                <span>Bluesky</span>
              </span>
            </div>
            <div class="prose-card-author-row">
              ${avatarHtml}
              <div class="prose-card-author-meta">
                <span class="prose-card-author-display">${escapeHtml(data.displayName)}</span>
                <span class="prose-card-author-handle">@${escapeHtml(data.handle)}</span>
              </div>
            </div>
            ${data.text ? `<div class="prose-card-body-text">${escapeHtml(data.text)}</div>` : ''}
            <div class="prose-card-stats-row">
              <span class="prose-card-stat" title="Replies">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                ${formatCount(data.replyCount)}
              </span>
              <span class="prose-card-stat" title="Reposts">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                ${formatCount(data.repostCount)}
              </span>
              <span class="prose-card-stat" title="Likes">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                ${formatCount(data.likeCount)}
              </span>
            </div>
          </div>
        `;
      }
    }
  }

  function showCardFlyout() {
    if (!popupEl || !currentSocialMeta) return;
    popupEl.classList.add('show-card');
  }

  function hideCardFlyout() {
    if (!popupEl) return;
    popupEl.classList.remove('show-card');
  }

  /**
   * Positions popup directly adjacent to the active link element
   */
  function positionPopup(linkEl) {
    if (!popupEl || !linkEl) return;

    const rect = linkEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hidePopup();
      return;
    }

    const popupWidth = popupEl.offsetWidth || 340;
    const popupHeight = popupEl.offsetHeight || 42;

    // Center horizontally on the link text
    let left = rect.left + (rect.width / 2) - (popupWidth / 2);
    // Boundary clamp inside viewport
    left = Math.max(12, Math.min(window.innerWidth - popupWidth - 12, left));

    // Place ABOVE the link by default, centered relative to the text position
    let top = rect.top - popupHeight - 8;
    if (top < 10) {
      // If right against the top of the viewport, position below
      top = rect.bottom + 8;
    }

    popupEl.style.position = 'fixed';
    popupEl.style.left = `${Math.round(left)}px`;
    popupEl.style.top = `${Math.round(top)}px`;
  }

  /**
   * Displays the popup for a given clicked anchor element
   */
  async function showPopup(linkEl) {
    if (!linkEl) return;
    activeLink = linkEl;
    const el = getPopupElement();

    const rawHref = linkEl.getAttribute('href') || linkEl.href || '';
    const input = document.getElementById('prose-link-input');
    if (input) {
      input.value = rawHref;
    }

    el.style.display = 'block';
    positionPopup(linkEl);

    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 30);
    }
  }

  /**
   * Hides the link popup
   */
  function hidePopup() {
    if (popupEl) {
      popupEl.style.display = 'none';
      hideCardFlyout();
    }
    if (activeLink) {
      if (activeLink._onProseLinkEnter) {
        activeLink.removeEventListener('mouseenter', activeLink._onProseLinkEnter);
      }
      if (activeLink._onProseLinkLeave) {
        activeLink.removeEventListener('mouseleave', activeLink._onProseLinkLeave);
      }
    }
    activeLink = null;
    currentSocialMeta = null;
  }

  /**
   * Global event listeners for closing popup or tracking scroll
   */
  function bindGlobalListeners() {
    // Click outside to dismiss
    document.addEventListener('click', (e) => {
      if (!popupEl || popupEl.style.display === 'none') return;
      if (e.target.closest('#prose-link-popup') || (activeLink && e.target.closest('a') === activeLink)) {
        return;
      }
      hidePopup();
    });

    // Escape key to dismiss
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popupEl && popupEl.style.display !== 'none') {
        hidePopup();
      }
    });

    // Update position on window resize or scroll
    window.addEventListener('resize', () => {
      if (activeLink && popupEl && popupEl.style.display !== 'none') {
        positionPopup(activeLink);
      }
    });

    window.addEventListener('scroll', () => {
      if (activeLink && popupEl && popupEl.style.display !== 'none') {
        positionPopup(activeLink);
      }
    }, true);
  }

  // Self-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGlobalListeners);
  } else {
    bindGlobalListeners();
  }

  const linkPopupExports = {
    show: showPopup,
    hide: hidePopup,
    detectSocialLink,
    fetchSocialCardData,
    position: positionPopup
  };
  window.Cedar.linkPopup = linkPopupExports;
  window.Outpost.linkPopup = linkPopupExports;

  window.showProseLinkPopup = showPopup;
  window.hideProseLinkPopup = hidePopup;
})();
