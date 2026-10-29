/**
 * Cedar Editor ‚Äî 5-Block Engine
 * Enforces the 5 allowed block types: Text, Images, Embedded Media, Quote, Share Button.
 * Handles single-responsibility blocks, locked non-text blocks, universal Enter handlers,
 * and guaranteed trailing text block.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.editor = window.Cedar.editor || window.Outpost.editor || {};
  window.Outpost.editor = window.Cedar.editor;

  /**
   * HTML generator for Share Button block (compact standalone button)
   */
  function createShareBlockHtml() {
    const isPage = window.currentDraft?.type === 'page';
    const btnText = isPage ? 'Share this page' : 'Share this article';
    return `<div class="article-share-block" data-block-type="share" contenteditable="false" draggable="true">` +
      `<button type="button" class="popout-3d btn-share-article btn-copy-share-url" title="Copy article link to clipboard">` +
        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">` +
          `<circle cx="18" cy="5" r="3"></circle>` +
          `<circle cx="6" cy="12" r="3"></circle>` +
          `<circle cx="18" cy="19" r="3"></circle>` +
          `<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>` +
          `<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>` +
        `</svg>` +
        `<span>${btnText}</span>` +
      `</button>` +
    `</div>`;
  }

  /**
   * HTML generator for Subscribe block (compact standalone button)
   */
  function createRssBlockHtml() {
    return `<div class="article-rss-block" data-block-type="rss" contenteditable="false" draggable="true">` +
      `<button type="button" class="popout-3d btn-rss-subscribe" title="Subscribe">` +
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M4 11a9 9 0 0 1 9 9"></path>` +
        `<path d="M4 4a16 16 0 0 1 16 16"></path>` +
        `<circle cx="5" cy="19" r="1.5" fill="currentColor"></circle>` +
      `</svg>` +
      `<span>Subscribe</span>` +
      `</button>` +
    `</div>`;
  }

  function escapeBlockHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPublishedPostsForBlocks(isEditor = false) {
    const all = Array.isArray(window.drafts) ? window.drafts : (typeof getDrafts === 'function' ? getDrafts() : (window.CedarPreview?.drafts || []));
    const isLinks = (typeof window.isLinksDraft === 'function')
      ? window.isLinksDraft
      : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));
    return all
      .filter(d => {
        if (!d) return false;
        if (d.type === 'page' || d.type === 'note' || isLinks(d)) return false;
        if (d.type && d.type !== 'post') return false;
        if (d.hidden || d.retired) return false;
        if (isEditor) {
          return d.status !== 'idea';
        }
        return d.status === 'published';
      })
      .sort((a, b) => {
        const tB = new Date(b.publishedDate || b.date || b.createdAt || 0).getTime() || 0;
        const tA = new Date(a.publishedDate || a.date || a.createdAt || 0).getTime() || 0;
        if (tB !== tA) return tB - tA;
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      });
  }

  function getPageTargetCategory(pageDraft) {
    const d = pageDraft || window.currentDraft;
    if (!d) return '';
    if (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) {
      const explicitCat = (d.categoryAggregate || d.title || '').trim();
      if (explicitCat) return explicitCat;
    }
    const explicit = (d.categoryAggregate || d.tag || (Array.isArray(d.categories) && d.categories[0]) || '').trim();
    if (explicit && explicit.toLowerCase() !== 'uncategorized' && explicit.toLowerCase() !== 'general' && explicit.toLowerCase() !== 'posts' && explicit.toLowerCase() !== 'all') {
      return explicit;
    }
    const cats = (window.projectConfig && Array.isArray(window.projectConfig.categories)) ? window.projectConfig.categories : [];
    const pageTitleLower = (d.title || '').trim().toLowerCase();
    const pageSlugLower = (d.slug || '').trim().toLowerCase();
    for (const c of cats) {
      const catName = (typeof c === 'object' ? (c.name || c.title || '') : String(c || '')).trim();
      if (!catName) continue;
      const cLower = catName.toLowerCase();
      const cSlug = cLower.replace(/\s+/g, '-');
      if (cLower === pageTitleLower || cSlug === pageSlugLower || cLower === pageSlugLower.replace(/-/g, ' ')) {
        return catName;
      }
    }
    return '';
  }

  function buildCanonicalPostHref(post) {
    if (!post) return '#';
    if (typeof window.buildPostUrl === 'function') {
      return window.buildPostUrl(post);
    }
    const slug = post.slug || post.id || 'post';
    let cat = post.permalinkCat !== undefined ? post.permalinkCat : (post.tag || (Array.isArray(post.categories) && post.categories[0]) || 'uncategorized');
    if (!cat) cat = 'uncategorized';
    const catSlug = encodeURIComponent(String(cat).trim().toLowerCase().replace(/\s+/g, '-'));
    const prefix = (typeof window !== 'undefined' && typeof window.getSiteBasePrefix === 'function')
      ? window.getSiteBasePrefix()
      : ((typeof window !== 'undefined' && !window.__CEDAR_PRODUCTION__ && window.location && (window.location.pathname === '/preview.html' || window.location.pathname.startsWith('/preview.html/'))) ? '/preview.html' : '');
    return `${prefix}/${catSlug}/${encodeURIComponent(slug)}/`;
  }

  function buildDisplayPostPath(post) {
    if (!post) return '';
    const slug = post.slug || post.id || 'post';
    let cat = post.permalinkCat !== undefined ? post.permalinkCat : (post.tag || (Array.isArray(post.categories) && post.categories[0]) || 'uncategorized');
    if (!cat) cat = 'uncategorized';
    const catSlug = encodeURIComponent(String(cat).trim().toLowerCase().replace(/\s+/g, '-'));
    return `/${catSlug}/${encodeURIComponent(slug)}/`;
  }

  function computeSmartLinkFallbackImage(targetUrl, domainName) {
    if (!targetUrl) return '';
    const lowD = (domainName || '').toLowerCase();
    let parsed = null;
    try {
      parsed = new URL(targetUrl.includes('://') ? targetUrl : `https://${targetUrl}`);
    } catch (e) {}

    if (lowD.includes('github.com')) {
      const parts = parsed ? parsed.pathname.split('/').filter(Boolean) : [];
      if (parts.length >= 2) {
        return `https://opengraph.githubassets.com/1/${parts[0]}/${parts[1]}`;
      } else if (parts.length === 1) {
        return `https://github.com/${parts[0]}.png?size=400`;
      }
      return 'https://images.ctfassets.net/8aevphvgewt8/4pe4eOtUJ0ARpZRE4fNekf/f52b1f9c52f059a33170229883731ed0/GH-Homepage-Universe-img.png';
    }

    if (lowD.includes('youtube.com') || lowD.includes('youtu.be')) {
      let vid = '';
      if (parsed && parsed.searchParams && parsed.searchParams.get('v')) {
        vid = parsed.searchParams.get('v');
      } else {
        const m = targetUrl.match(/(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
        if (m) vid = m[1];
      }
      if (vid) return `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    }

    return `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
  }

  async function fetchLinkMetadata(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { success: false, url: '', domain: '', title: '', subtitle: '', image: '', icon: '' };
    }
    let target = rawUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    let parsedUrl = null;
    let domain = '';
    try {
      parsedUrl = new URL(target);
      domain = parsedUrl.hostname.replace(/^www\./i, '');
    } catch (e) {
      domain = target;
    }
    const cleanDomainTitle = domain.includes('.') ? (domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1)) : domain;
    const isRootPath = !parsedUrl || !parsedUrl.pathname || parsedUrl.pathname === '/';

    const cleanPageTitle = (rawT) => {
      if (!rawT || typeof rawT !== 'string') return '';
      let t = rawT.trim();
      if (isRootPath) {
        const stripped = t.replace(/^Home\s*[‚Äî‚Äì\-|:]\s*/i, '').trim();
        if (stripped) t = stripped;
      }
      return t;
    };

    if (window.Cedar && window.Cedar.isLocalServer) {
      try {
        const resp = await fetch('/api/fetch-link-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.success) {
            const finalImg = (data.image && !data.image.includes('s0.wp.com/mshots'))
              ? data.image
              : computeSmartLinkFallbackImage(target, data.domain || domain);
            return {
              success: true,
              url: data.url || target,
              domain: data.domain || domain,
              title: cleanPageTitle(data.title) || cleanDomainTitle,
              subtitle: (data.subtitle && data.subtitle !== domain) ? data.subtitle : '',
              image: finalImg,
              icon: data.icon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
            };
          }
        }
      } catch (e) {
        console.warn('Backend link meta fetch failed, using client-side fetch:', e);
      }
    }

    // Client-side metadata & screenshot via Microlink API (100% browser compatible)
    try {
      const mlUrl = `https://api.microlink.io/?url=${encodeURIComponent(target)}&screenshot=true`;
      const mlResp = await fetch(mlUrl);
      if (mlResp.ok) {
        const mlJson = await mlResp.json();
        if (mlJson && mlJson.status === 'success' && mlJson.data) {
          const d = mlJson.data;
          const resolvedTitle = cleanPageTitle(d.title) || cleanDomainTitle;
          const resolvedDesc = (d.description || '').trim();
          const logoUrl = (d.logo && d.logo.url) ? d.logo.url : '';
          const ogImgUrl = (d.image && d.image.url) ? d.image.url : '';
          const shotUrl = (d.screenshot && d.screenshot.url) ? d.screenshot.url : '';

          const isOgJustLogo = Boolean(
            ogImgUrl && (
              ogImgUrl === logoUrl ||
              /\/(icon|favicon|apple-touch-icon|logo)\.(png|ico|svg|webp)$/i.test(ogImgUrl) ||
              (d.image && d.image.width && d.image.height && d.image.width === d.image.height && d.image.width <= 512)
            )
          );
          const bestImage = (!isOgJustLogo && ogImgUrl) ? ogImgUrl : (shotUrl || ogImgUrl || computeSmartLinkFallbackImage(target, domain));
          const bestIcon = logoUrl || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

          return {
            success: true,
            url: d.url || target,
            domain: domain,
            title: resolvedTitle,
            subtitle: resolvedDesc,
            image: bestImage,
            icon: bestIcon
          };
        }
      }
    } catch (e) {
      console.warn('Microlink metadata fetch failed, trying HTML fallback:', e);
    }

    // Direct / CORS HTML parse fallback
    try {
      let htmlText = '';
      try {
        const directResp = await fetch(target, { mode: 'cors' });
        if (directResp.ok) htmlText = await directResp.text();
      } catch (_) {}
      if (!htmlText) {
        const proxyResp = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
        if (proxyResp.ok) htmlText = await proxyResp.text();
      }
      if (htmlText) {
        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        const getMeta = (sel) => {
          const el = doc.querySelector(sel);
          return el ? (el.getAttribute('content') || '').trim() : '';
        };
        const rawT = getMeta('meta[property="og:title"]') || getMeta('meta[name="twitter:title"]') || (doc.querySelector('title')?.textContent || '').trim();
        const rawDesc = getMeta('meta[property="og:description"]') || getMeta('meta[name="twitter:description"]') || getMeta('meta[name="description"]');
        let rawImg = getMeta('meta[property="og:image"]') || getMeta('meta[name="twitter:image"]');
        if (rawImg && !rawImg.startsWith('http')) {
          try { rawImg = new URL(rawImg, target).href; } catch (_) {}
        }
        let rawIcon = '';
        const iconEl = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
        if (iconEl && iconEl.getAttribute('href')) {
          try { rawIcon = new URL(iconEl.getAttribute('href'), target).href; } catch (_) {}
        }
        return {
          success: true,
          url: target,
          domain: domain,
          title: cleanPageTitle(rawT) || cleanDomainTitle,
          subtitle: rawDesc || '',
          image: rawImg || computeSmartLinkFallbackImage(target, domain),
          icon: rawIcon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
        };
      }
    } catch (e) {}

    const fallbackImg = computeSmartLinkFallbackImage(target, domain);
    return {
      success: true,
      url: target,
      domain: domain,
      title: cleanDomainTitle,
      subtitle: '',
      image: fallbackImg,
      icon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
    };
  }

  function resolveBlogItemFromUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let cleaned = rawUrl.trim();
    if (!cleaned) return null;

    // Check if it's an external domain
    const isFullUrl = /^https?:\/\//i.test(cleaned);
    let isLocalDomain = false;
    if (isFullUrl) {
      try {
        const u = new URL(cleaned);
        const host = u.hostname.toLowerCase();
        const currentHost = (typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost').toLowerCase();
        const siteUrlHost = (window.projectConfig && window.projectConfig.siteUrl) ? new URL(window.projectConfig.siteUrl.startsWith('http') ? window.projectConfig.siteUrl : 'https://' + window.projectConfig.siteUrl).hostname.toLowerCase() : '';
        if (host === 'localhost' || host === '127.0.0.1' || host === currentHost || (siteUrlHost && host === siteUrlHost)) {
          isLocalDomain = true;
        }
      } catch (e) {}
    } else {
      isLocalDomain = true;
    }

    if (isFullUrl && !isLocalDomain) {
      return null;
    }

    // Clean the path
    let pathOnly = cleaned;
    if (isFullUrl) {
      try {
        const u = new URL(cleaned);
        pathOnly = (u.pathname || '') + (u.hash || '');
      } catch (e) {
        pathOnly = cleaned.replace(/^https?:\/\/[^\/]+/i, '');
      }
    }

    pathOnly = pathOnly.split('?')[0];
    pathOnly = pathOnly.replace(/^\/?preview\.html\/?/i, '/').replace(/\/index\.html$/i, '');
    pathOnly = pathOnly.replace(/^#\/?/, '/');
    pathOnly = pathOnly.replace(/^\/+|\/+$/g, '');

    const segments = pathOnly.split('/').map(s => {
      try { return decodeURIComponent(s).trim(); } catch (e) { return s.trim(); }
    }).filter(Boolean);
    const lastSegment = (segments[segments.length - 1] || '').toLowerCase();
    const firstSegment = (segments[0] || '').toLowerCase();

    const publishedPosts = getPublishedPostsForBlocks();
    const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
    const isLinks = (typeof window.isLinksDraft === 'function')
      ? window.isLinksDraft
      : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));
    const allPages = draftsList.filter(d => d && (d.type === 'page' || isLinks(d) || (!String(d.id || '').startsWith('post_') && (String(d.id || '').startsWith('page_') || d.isCategoryAggregate))));

    // 1. Try matching published posts
    for (const p of publishedPosts) {
      const disp = buildDisplayPostPath(p).replace(/^\/+|\/+$/g, '').toLowerCase();
      if (disp && pathOnly.toLowerCase() === disp) {
        return { type: 'post', item: p };
      }
      const pSlug = String(p.slug || '').trim().toLowerCase();
      if (pSlug && (pathOnly.toLowerCase() === `blog/published/${pSlug}` || pathOnly.toLowerCase() === pSlug)) {
        return { type: 'post', item: p };
      }
    }

    if (lastSegment) {
      const bySlugOrId = publishedPosts.find(p =>
        String(p.slug || '').trim().toLowerCase() === lastSegment ||
        String(p.id || '').trim().toLowerCase() === lastSegment ||
        String(p.title || '').trim().toLowerCase() === lastSegment
      );
      if (bySlugOrId) return { type: 'post', item: bySlugOrId };
    }

    // 2. Try matching pages
    for (const page of allPages) {
      const pageSlug = String(page.slug || '').trim().toLowerCase();
      const pageId = String(page.id || '').trim().toLowerCase();
      const pageTitle = String(page.title || '').trim().toLowerCase();
      const pageCat = String(page.categoryAggregate || '').trim().toLowerCase();

      if (pathOnly.toLowerCase() === pageSlug ||
          pathOnly.toLowerCase() === `pages/published/${pageSlug}` ||
          pathOnly.toLowerCase() === pageId ||
          pathOnly.toLowerCase() === pageTitle ||
          (pageCat && pathOnly.toLowerCase() === pageCat) ||
          (lastSegment && (lastSegment === pageSlug || lastSegment === pageId || lastSegment === pageTitle || lastSegment === pageCat)) ||
          (firstSegment && (firstSegment === pageSlug || firstSegment === pageId || firstSegment === pageTitle || firstSegment === pageCat))) {
        return { type: 'page', item: page };
      }
    }

    // Built-in pages fallback (About, RSS, Links)
    if (lastSegment === 'about' || lastSegment === 'links' || lastSegment === 'rss') {
      const builtIn = allPages.find(p => (p.slug || '').toLowerCase() === lastSegment || (p.id || '').toLowerCase() === `page_${lastSegment}`);
      if (builtIn) return { type: 'page', item: builtIn };
      return {
        type: 'page',
        item: {
          id: `page_${lastSegment}`,
          slug: lastSegment,
          title: lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1),
          type: 'page'
        }
      };
    }

    return null;
  }

  function resolveBlogPageByIdOrSlug(pageId, pageSlug) {
    const draftsList = Array.isArray(window.drafts) ? window.drafts : [];
    const isLinks = (typeof window.isLinksDraft === 'function')
      ? window.isLinksDraft
      : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));
    const allPages = draftsList.filter(d => d && (d.type === 'page' || isLinks(d) || (!String(d.id || '').startsWith('post_') && (String(d.id || '').startsWith('page_') || d.isCategoryAggregate))));

    if (pageId) {
      const byId = allPages.find(p => String(p.id).toLowerCase() === String(pageId).toLowerCase());
      if (byId) return byId;
    }
    const targetSlug = String(pageSlug || pageId || '').trim().toLowerCase();
    if (targetSlug) {
      const bySlug = allPages.find(p =>
        String(p.slug || '').trim().toLowerCase() === targetSlug ||
        String(p.title || '').trim().toLowerCase() === targetSlug ||
        String(p.categoryAggregate || '').trim().toLowerCase() === targetSlug
      );
      if (bySlug) return bySlug;
    }
    if (targetSlug === 'about' || targetSlug === 'links' || targetSlug === 'rss') {
      return {
        id: `page_${targetSlug}`,
        slug: targetSlug,
        title: targetSlug.charAt(0).toUpperCase() + targetSlug.slice(1),
        type: 'page'
      };
    }
    return null;
  }

  function resolvePublishedPostFromUrl(rawUrl) {
    const resolved = resolveBlogItemFromUrl(rawUrl);
    if (resolved && resolved.type === 'post') {
      return resolved.item;
    }
    return null;
  }

  function resolvePublishedPostByIdOrSlug(postId, postSlug) {
    const publishedPosts = getPublishedPostsForBlocks();
    if (postId) {
      const byId = publishedPosts.find(p => String(p.id) === String(postId));
      if (byId) return byId;
    }
    const targetSlug = String(postSlug || postId || '').trim().toLowerCase();
    if (targetSlug) {
      const bySlug = publishedPosts.find(p =>
        String(p.slug || '').trim().toLowerCase() === targetSlug ||
        String(p.id || '').trim().toLowerCase() === targetSlug
      );
      if (bySlug) return bySlug;
    }
    return null;
  }

  function resolveCardCoverImage(post) {
    if (!post) return '';
    if (typeof window.getPostFeaturedImage === 'function') {
      return window.getPostFeaturedImage(post);
    }
    if (typeof window.resolvePostImage === 'function') {
      return window.resolvePostImage(post.coverImage || post.featuredImage, post);
    }
    const raw = (post.coverImage || post.featuredImage || '').trim();
    if (!raw) return '';
    if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
    if (window.imageRegistry && typeof window.imageRegistry.get === 'function') {
      const cleanFn = raw.split('/').pop().split('\\').pop();
      const hit = window.imageRegistry.get(raw) || window.imageRegistry.get(cleanFn);
      if (hit) return typeof hit === 'object' ? (hit.dataUrl || hit.src || hit.url || raw) : hit;
    }
    if (Array.isArray(post.images)) {
      const cleanFn = raw.split('/').pop().split('\\').pop();
      const found = post.images.find(im => im && (im.filename === cleanFn || im.name === cleanFn || im.src === raw));
      if (found && (found.dataUrl || found.src)) return found.dataUrl || found.src;
    }
    return raw;
  }

  function renderPostCardForBlock(post, layoutStyle = 'vertical', idx = 0) {
    if (!post) return '';
    if (typeof window.createPostCardHtml === 'function') {
      return window.createPostCardHtml(post, {
        deferredImages: false,
        index: idx,
        showThumbnails: true,
        showCategoryBadge: true,
        showExcerpt: true,
        showMeta: true,
        layoutStyle: layoutStyle === 'horizontal' ? 'horizontal' : 'vertical'
      });
    }

    const esc = escapeBlockHtml;
    const href = buildCanonicalPostHref(post);
    const cat = post.tag || (Array.isArray(post.categories) && post.categories[0]) || '';
    const hasValidCategory = cat && cat.toLowerCase() !== 'uncategorized' && cat.toLowerCase() !== 'general';
    const rawMd = post.markdown || '';
    const words = rawMd.trim() ? rawMd.trim().split(/\s+/).length : 0;
    const readTime = post.overrideReadTime || `${Math.max(1, Math.ceil(words / 200))} min read`;
    const rawDate = post.publishedDate || post.date || '';
    const dateDisplay = (typeof window.formatDateDisplay === 'function')
      ? window.formatDateDisplay(rawDate)
      : ((typeof window.formatDate === 'function') ? window.formatDate(rawDate) : (rawDate || 'Recent'));
    const defAuth = (window.projectConfig && window.projectConfig.defaultAuthor) || (typeof resolveProjectDefaultAuthor === 'function' ? resolveProjectDefaultAuthor() : '');
    const rawAuths = (Array.isArray(post.authors) && post.authors.length > 0) ? post.authors : [post.authorName || defAuth];
    const authName = (typeof window.formatAuthorsString === 'function')
      ? window.formatAuthorsString(rawAuths)
      : rawAuths.map(a => (typeof a === 'object' && a ? a.name : a)).filter(Boolean).join(', ');

    const resolvedCover = resolveCardCoverImage(post);
    const categoryEyebrowHtml = '';

    const starBadge = (post.starred || post.featured || post.isFeatured)
      ? `<span class="post-card-star-badge" title="Featured Story" style="display: inline-flex; align-items: center; color: #f59e0b; margin-right: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>`
      : '';

    const descText = (post.subtitle || post.customDesc || '').trim() ||
      (typeof window.extractPlainExcerpt === 'function' ? window.extractPlainExcerpt(post.markdown || post.content || '', 115) : (typeof extractPlainBodyExcerpt === 'function' ? extractPlainBodyExcerpt(post.markdown || post.content || '', 115) : ''));
    const descHtml = descText ? `<p class="post-card-desc">${esc(descText)}</p>` : '';
    const cardLayoutClass = layoutStyle === 'horizontal' ? 'layout-horizontal' : '';

    const cfgDesign = (window.projectConfig && window.projectConfig.design) || {};
    const swooshType = cfgDesign.showcaseSwoosh || cfgDesign.backgroundSwoosh || 'jazz_cup';
    const swooshSvgHtml = swooshType === 'none'
      ? ''
      : ((typeof window.buildShowcaseSwooshSvg === 'function')
          ? window.buildShowcaseSwooshSvg(swooshType, post.id || post.slug || post.title, post)
          : `<svg class="post-card-showcase-splash" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">
          <g class="splash-brush-base">
            <path d="M8,136 C48,88 106,42 162,18 C178,11 190,19 178,32 C142,68 92,116 44,158 C24,174 2,154 8,136 Z" />
            <path d="M52,164 C118,108 198,52 284,16 C304,8 318,20 300,36 C234,88 158,138 88,178 C64,190 36,178 52,164 Z" />
            <path d="M138,168 C210,122 292,72 378,34 C398,25 412,39 392,54 C324,102 246,144 174,180 C150,190 122,180 138,168 Z" />
            <path d="M236,162 C292,128 352,94 404,68 C418,61 422,75 408,86 C362,118 308,148 262,172 C244,180 222,170 236,162 Z" />
            <circle cx="188" cy="18" r="5" /><circle cx="312" cy="22" r="6" /><circle cx="398" cy="36" r="4.5" /><circle cx="28" cy="158" r="5.5" /><circle cx="118" cy="176" r="4.5" />
          </g>
          <g class="splash-brush-accent">
            <path d="M16,120 C54,82 88,48 108,44 C120,42 96,102 110,108 C126,114 196,42 228,36 C242,33 214,94 230,100 C248,106 318,40 350,36 C364,34 336,86 352,92 C368,98 394,68 412,56" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M36,132 C72,98 100,68 116,64 C126,62 108,112 122,116 C138,120 206,58 234,52 C246,50 224,104 238,108 C254,112 322,56 352,52" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.65" />
          </g>
        </svg>`);

    const noCoverClass = !resolvedCover ? 'post-card-no-cover ' : '';
    const coverLayerHtml = resolvedCover
      ? `
        <div class="post-card-img-ambient" style="background-image: url('${esc(resolvedCover)}');"></div>
        <img src="${esc(resolvedCover)}" alt="" class="post-card-img" loading="lazy" onerror="const c=this.closest('.post-card');if(c)c.classList.add('post-card-no-cover');this.remove();">
      `
      : '';

    return `
      <a href="${esc(href)}" class="post-card ${noCoverClass}${cardLayoutClass}" data-post-id="${esc(post.id || '')}">
        <div class="post-card-img-wrap post-card-showcase-wrap" style="background-color: var(--bg-secondary, #18181b); aspect-ratio: 16 / 9;">
          <div class="post-card-showcase-cluster">
            ${swooshSvgHtml}
            <div class="post-card-showcase-text">
              ${categoryEyebrowHtml}
              <h4 class="post-card-title post-card-showcase-title">${esc(post.title || 'Untitled Post')}</h4>
              ${descHtml}
            </div>
          </div>
          ${coverLayerHtml}
        </div>
        <div class="post-card-body post-card-showcase-body">
          ${categoryEyebrowHtml}
          <h4 class="post-card-title post-card-standard-title">${esc(post.title || 'Untitled Post')}</h4>
          <div class="post-card-meta post-card-showcase-meta">
            ${starBadge}
            <span class="post-card-author">By <span style="text-decoration: underline; text-underline-offset: 2px;">${esc(authName)}</span></span>
            <span>&bull;</span>
            <time>${esc(dateDisplay)}</time>
            ${readTime ? `<span>&bull;</span><span>${esc(readTime)}</span>` : ''}
          </div>
          ${descHtml}
        </div>
      </a>
    `;
  }

  function renderPageCardForBlock(page, layoutStyle = 'vertical') {
    if (!page) return '';
    const esc = escapeBlockHtml;
    const isBuiltIn = (page.id === 'page_about' || page.slug === 'about' || page.id === 'page_links' || page.slug === 'links' || page.id === 'page_rss' || page.slug === 'rss' || page.id === 'page_all' || page.slug === 'all');
    const pageSlug = page.slug || (typeof window.generateSlug === 'function' ? window.generateSlug(page.title || '') : 'page');
    const href = isBuiltIn ? `#${pageSlug}` : `/${pageSlug}/`;
    const resolvedCover = resolveCardCoverImage(page);

    let thumbWrapHtml = '';
    if (resolvedCover) {
      thumbWrapHtml = `
        <div class="post-card-img-wrap" style="background-color: var(--bg-secondary, #18181b); aspect-ratio: 16 / 9;">
          <div class="post-card-img-ambient" style="background-image: url('${esc(resolvedCover)}');"></div>
          <img src="${esc(resolvedCover)}" alt="" class="post-card-img" loading="lazy" onerror="if(this.parentElement) this.parentElement.style.display='none';">
        </div>
      `;
    } else {
      thumbWrapHtml = `
        <div class="post-card-img-wrap post-card-fallback-wrap" style="aspect-ratio: 16 / 9;">
          <div class="post-card-fallback-glow"></div>
          <div class="post-card-fallback-glyph">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              <line x1="9" y1="7" x2="15" y2="7"/>
              <line x1="9" y1="11" x2="13" y2="11"/>
            </svg>
          </div>
        </div>
      `;
    }

    const isAllPage = (page.id === 'page_all' || page.slug === 'all' || (page.title || '').trim().toLowerCase() === 'all');
    const badgeText = (page.isCategoryAggregate && !isAllPage) ? 'Category' : ((isBuiltIn || isAllPage) ? 'Built-In' : 'Page');
    const badgeHtml = `
      <span class="post-card-tag-inline" style="background: rgba(56, 189, 248, 0.14); color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-right: 6px;">
        ${esc(badgeText)}
      </span>
    `;

    const descText = page.subtitle || (page.isCategoryAggregate ? `Category archive for ${page.title}` : '');
    const descHtml = descText ? `<p class="post-card-desc">${esc(descText)}</p>` : '';
    const cardLayoutClass = layoutStyle === 'horizontal' ? 'layout-horizontal' : '';

    return `
      <a href="${esc(href)}" class="post-card page-embed-card ${cardLayoutClass}" data-page-slug="${esc(pageSlug)}">
        ${thumbWrapHtml}
        <div class="post-card-body">
          <div class="post-card-meta">
            ${badgeHtml}
            <span style="font-family: var(--font-mono, monospace); font-size: 0.74rem; color: var(--text-muted, #71717a);">${esc(href)}</span>
          </div>
          <h4 class="post-card-title">${esc(page.title || 'Untitled Page')}</h4>
          ${descHtml}
        </div>
      </a>
    `;
  }

  function renderExternalCardForBlock(meta, layoutStyle = 'vertical') {
    if (!meta) return '';
    const esc = escapeBlockHtml;
    const href = meta.url || '#';
    const domain = meta.domain || (href.replace(/^https?:\/\//i, '').split('/')[0]);
    const title = meta.title || domain || 'Web Link';
    const subtitle = meta.subtitle || '';
    let image = meta.image || '';
    if (image && image.includes('s0.wp.com/mshots')) {
      image = '';
    }
    if (!image && href && href !== '#' && (href.startsWith('http://') || href.startsWith('https://'))) {
      image = computeSmartLinkFallbackImage(href, domain);
    }
    const fallbackFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    const icon = meta.icon || fallbackFavicon;

    let thumbWrapHtml = '';
    if (image) {
      thumbWrapHtml = `
        <div class="post-card-img-wrap" style="background-color: var(--bg-secondary, #18181b); aspect-ratio: 16 / 9;">
          <div class="post-card-img-ambient" style="background-image: url('${esc(image)}');"></div>
          <img src="${esc(image)}" alt="" class="post-card-img" loading="lazy" onerror="if(this.parentElement) { this.parentElement.style.display='none'; }">
        </div>
      `;
    }

    const iconHtml = icon
      ? `<img src="${esc(icon)}" alt="" class="external-card-favicon" style="width: 18px !important; height: 18px !important; min-width: 18px !important; max-width: 18px !important; border-radius: 4px !important; object-fit: contain !important; flex-shrink: 0 !important; margin: 0 !important; display: inline-block !important;" onerror="if(!this.dataset.triedGoogleFav && '${esc(fallbackFavicon)}') { this.dataset.triedGoogleFav='true'; this.src='${esc(fallbackFavicon)}'; } else { this.style.display='none'; }">`
      : '';

    const cleanSub = (subtitle || '').trim();
    const isSubSameAsDomain = cleanSub.toLowerCase() === (domain || '').trim().toLowerCase();
    const descText = (!cleanSub || isSubSameAsDomain) ? '' : cleanSub;
    const descHtml = descText ? `<p class="post-card-desc">${esc(descText)}</p>` : '';

    const domainBar = `
      <div class="external-card-domain-bar" style="display: flex; align-items: center; gap: 6px; font-size: 0.74rem; color: var(--text-muted, #a1a1aa); font-weight: 500; letter-spacing: 0.01em;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(domain)}</span>
      </div>
    `;

    const cardLayoutClass = layoutStyle === 'horizontal' ? 'layout-horizontal' : '';

    return `
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="post-card external-link-card ${cardLayoutClass}">
        ${thumbWrapHtml}
        <div class="post-card-body">
          <h4 class="post-card-title external-card-title" style="display: flex !important; flex-direction: row !important; align-items: center !important; gap: 8px !important;">
            ${iconHtml}
            <span class="external-card-title-text" style="overflow: hidden; text-overflow: ellipsis;">${esc(title)}</span>
          </h4>
          ${descHtml}
          <div class="post-card-meta">
            ${domainBar}
          </div>
        </div>
      </a>
    `;
  }

  function createRecentPostsBlockHtml(layout = 'grid') {
    const cleanLayout = layout === 'list' ? 'list' : 'grid';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="${cleanLayout}" data-current-page="1" contenteditable="false" draggable="false"></div>`;
    const blockEl = wrapper.firstElementChild;
    hydrateSingleRecentPostsBlock(blockEl, window.currentDraft, { isEditor: true });
    return blockEl.outerHTML;
  }

  function createIndividualPostBlockHtml(postId = '', layout = 'grid', postSlug = '', extraAttrs = {}) {
    const cleanLayout = layout === 'list' ? 'list' : 'grid';
    const esc = escapeBlockHtml;
    const wrapper = document.createElement('div');
    let extraAttrsStr = '';
    if (extraAttrs && typeof extraAttrs === 'object') {
      for (const [k, v] of Object.entries(extraAttrs)) {
        if (v !== undefined && v !== null && v !== '') {
          extraAttrsStr += ` ${k}="${esc(String(v))}"`;
        }
      }
    }
    wrapper.innerHTML = `<div class="page-individual-post-block" data-block-type="individual-post" data-post-id="${esc(postId)}" data-post-slug="${esc(postSlug)}" data-layout="${cleanLayout}"${extraAttrsStr} contenteditable="false" draggable="true"></div>`;
    const blockEl = wrapper.firstElementChild;
    hydrateSingleIndividualPostBlock(blockEl, window.currentDraft, { isEditor: true });
    return blockEl.outerHTML;
  }

  function hydrateSingleIndividualPostBlock(blockEl, pageDraft, options = {}) {
    if (!blockEl) return;
    const isEditor = Boolean(options.isEditor);
    const esc = escapeBlockHtml;
    const layout = (blockEl.getAttribute('data-layout') || 'grid') === 'list' ? 'list' : 'grid';
    blockEl.setAttribute('data-layout', layout);
    blockEl.setAttribute('data-block-type', 'individual-post');
    if (isEditor) {
      blockEl.setAttribute('contenteditable', 'false');
      blockEl.setAttribute('draggable', 'true');
    }

    let itemType = blockEl.getAttribute('data-item-type') || '';
    const postId = blockEl.getAttribute('data-post-id') || '';
    const postSlug = blockEl.getAttribute('data-post-slug') || '';
    const pageId = blockEl.getAttribute('data-page-id') || '';
    const pageSlug = blockEl.getAttribute('data-page-slug') || '';
    const externalUrl = blockEl.getAttribute('data-url') || '';

    let linkedPost = null;
    let linkedPage = null;
    let externalMeta = null;

    if (itemType === 'page' || pageId || pageSlug) {
      linkedPage = resolveBlogPageByIdOrSlug(pageId, pageSlug);
      if (linkedPage) itemType = 'page';
    }

    if (!linkedPage && (itemType === 'post' || postId || postSlug || (!itemType && !externalUrl))) {
      linkedPost = resolvePublishedPostByIdOrSlug(postId, postSlug);
      if (linkedPost) itemType = 'post';
    }

    if (!linkedPost && !linkedPage && externalUrl) {
      itemType = 'external';
      let savedImg = blockEl.getAttribute('data-image') || '';
      const savedSub = blockEl.getAttribute('data-subtitle') || '';
      const savedDomain = blockEl.getAttribute('data-domain') || '';
      const savedIcon = blockEl.getAttribute('data-icon') || '';
      const hadMshot = savedImg.includes('s0.wp.com/mshots');
      if (hadMshot) {
        savedImg = computeSmartLinkFallbackImage(externalUrl, savedDomain);
        blockEl.setAttribute('data-image', savedImg);
      }
      externalMeta = {
        url: externalUrl,
        title: blockEl.getAttribute('data-title') || '',
        subtitle: savedSub,
        image: savedImg,
        domain: savedDomain,
        icon: savedIcon
      };

      const needsAutoHeal = hadMshot ||
        !savedSub ||
        (savedDomain && savedSub.trim().toLowerCase() === savedDomain.trim().toLowerCase()) ||
        savedIcon.includes('google.com/s2/favicons');

      if (needsAutoHeal && !blockEl.dataset.metaAutoHealed) {
        blockEl.dataset.metaAutoHealed = 'true';
        fetchLinkMetadata(externalUrl).then(fresh => {
          if (!fresh || !fresh.success || !blockEl.isConnected) return;
          let changed = false;
          if (fresh.title && fresh.title !== blockEl.getAttribute('data-title')) {
            blockEl.setAttribute('data-title', fresh.title);
            changed = true;
          }
          if (fresh.subtitle && fresh.subtitle !== blockEl.getAttribute('data-subtitle')) {
            blockEl.setAttribute('data-subtitle', fresh.subtitle);
            changed = true;
          }
          if (fresh.image && fresh.image !== blockEl.getAttribute('data-image')) {
            blockEl.setAttribute('data-image', fresh.image);
            changed = true;
          }
          if (fresh.domain && fresh.domain !== blockEl.getAttribute('data-domain')) {
            blockEl.setAttribute('data-domain', fresh.domain);
            changed = true;
          }
          if (fresh.icon && fresh.icon !== blockEl.getAttribute('data-icon')) {
            blockEl.setAttribute('data-icon', fresh.icon);
            changed = true;
          }
          if (changed) {
            hydrateSingleIndividualPostBlock(blockEl, pageDraft, options);
            if (isEditor && typeof window.scheduleAutosave === 'function') {
              window.scheduleAutosave();
            }
          }
        }).catch(() => {});
      }
    }

    const hasLinkedItem = Boolean(linkedPost || linkedPage || (externalMeta && externalMeta.url));
    blockEl.classList.toggle('has-card', hasLinkedItem);
    blockEl.classList.toggle('is-unlinked', !hasLinkedItem);

    const isEditingUrl = isEditor && (!hasLinkedItem || blockEl.dataset.editingUrl === 'true');

    let currentUrlValue = '';
    let displayTitle = '';
    let typeLabel = 'Post';
    let typeIconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';

    if (itemType === 'page' && linkedPage) {
      typeLabel = 'Page';
      displayTitle = linkedPage.title || linkedPage.slug || 'Page';
      currentUrlValue = linkedPage.slug ? `/${linkedPage.slug}` : '';
      typeIconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>';
    } else if (itemType === 'external' && externalMeta) {
      typeLabel = 'Link';
      displayTitle = externalMeta.title || externalMeta.domain || externalMeta.url;
      currentUrlValue = externalMeta.url || '';
      typeIconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    } else if (linkedPost) {
      typeLabel = 'Post';
      displayTitle = linkedPost.title || linkedPost.slug || 'Post';
      currentUrlValue = buildDisplayPostPath(linkedPost);
    }

    let html = '';

    if (isEditor) {
      if (isEditingUrl) {
        // Simple input bar as requested: URL input on left, Add button on right
        html += `
          <div class="individual-post-url-bar" contenteditable="false" style="margin-bottom: ${hasLinkedItem ? '1rem' : '0'};">
            <div class="individual-post-url-input-wrap">
              <svg class="individual-post-url-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              <input type="text" class="individual-post-url-input" placeholder="Paste URL (blog post, page, or web link)..." value="${esc(currentUrlValue)}" spellcheck="false" autocomplete="off">
            </div>
            <button type="button" class="btn btn-sm btn-primary btn-link-individual-post">Add</button>
            ${hasLinkedItem ? `
              <button type="button" class="btn btn-sm btn-secondary btn-cancel-edit-url" title="Cancel">Cancel</button>
            ` : `
              <button type="button" class="figure-action-btn btn-delete-fig" title="Delete Block">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            `}
          </div>
        `;
      } else {
        // When card is shown: Editor toolbar directly on top of card with Grid/List toggle
        html += `
          <div class="page-block-editor-bar individual-post-editor-bar" contenteditable="false">
            <div class="individual-post-bar-center">
              <button type="button" class="page-block-small-btn page-block-action-btn btn-edit-individual-post-url" title="Change URL">
                Change URL
              </button>
            </div>
            <div class="page-block-bar-right page-block-editor-bar-right individual-post-bar-right">
              <div class="page-block-view-toggle" role="group" aria-label="View Mode">
                <button type="button" class="page-block-view-btn ${layout === 'grid' ? 'active is-active' : ''}" data-action="set-page-block-layout" data-layout="grid" title="Grid View">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  <span>Grid</span>
                </button>
                <button type="button" class="page-block-view-btn ${layout === 'list' ? 'active is-active' : ''}" data-action="set-page-block-layout" data-layout="list" title="List View">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                  <span>List</span>
                </button>
              </div>
              <button type="button" class="figure-action-btn btn-delete-fig" title="Delete Block">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `;
      }
    }

    // Render the Card itself if item is linked
    if (hasLinkedItem) {
      let cardHtml = '';
      const cardLayoutMode = layout === 'list' ? 'horizontal' : 'vertical';

      if (itemType === 'page' && linkedPage) {
        cardHtml = renderPageCardForBlock(linkedPage, cardLayoutMode);
      } else if (itemType === 'external' && externalMeta) {
        cardHtml = renderExternalCardForBlock(externalMeta, cardLayoutMode);
      } else if (linkedPost) {
        cardHtml = renderPostCardForBlock(linkedPost, cardLayoutMode, 0);
      }

      if (cardHtml) {
        if (layout === 'grid') {
          html += `
            <div class="page-block-render-area individual-post-render-grid">
              <div class="individual-post-grid-center">
                ${cardHtml}
              </div>
            </div>
          `;
        } else {
          html += `
            <div class="page-block-render-area individual-post-render-list">
              <div class="posts-grid posts-list-view cols-1" style="margin-bottom: 0;">
                ${cardHtml}
              </div>
            </div>
          `;
        }
      }
    }

    blockEl.innerHTML = html;
  }

  function hydrateSingleRecentPostsBlock(blockEl, pageDraft, options = {}) {
    if (!blockEl) return;
    const isEditor = Boolean(options.isEditor);
    const esc = escapeBlockHtml;
    const layout = (blockEl.getAttribute('data-layout') || 'grid') === 'list' ? 'list' : 'grid';
    blockEl.setAttribute('data-layout', layout);
    blockEl.setAttribute('data-block-type', 'recent-posts');
    if (isEditor) {
      blockEl.setAttribute('contenteditable', 'false');
      blockEl.setAttribute('draggable', 'false');
    }

    const targetCategory = getPageTargetCategory(pageDraft || window.currentDraft);
    const allPublished = getPublishedPostsForBlocks(isEditor);

    const matcher = (typeof window.postMatchesCategory === 'function')
      ? window.postMatchesCategory
      : (p, cat) => {
          if (!p || !cat) return false;
          const norm = String(cat).trim().toLowerCase();
          if (norm === 'all' || norm === 'all posts' || norm === 'all-posts' || norm === 'page_all') return true;
          const target = norm.replace(/-/g, ' ');
          const targetSlug = norm.replace(/\s+/g, '-');
          const check = v => {
            if (!v) return false;
            const s = String(v).trim().toLowerCase();
            return s === target || s.replace(/\s+/g, '-') === targetSlug || s.replace(/-/g, ' ') === target;
          };
          return check(p.tag) || (Array.isArray(p.categories) && p.categories.some(check));
        };

    const matchingPosts = targetCategory
      ? allPublished.filter(p => matcher(p, targetCategory))
      : allPublished;

    const PAGE_SIZE = 12;
    const totalPosts = matchingPosts.length;
    const totalPages = Math.max(1, Math.ceil(totalPosts / PAGE_SIZE));
    let curPage = parseInt(options.initialPage || blockEl.getAttribute('data-current-page') || '1', 10) || 1;
    if (curPage > totalPages) curPage = totalPages;
    if (curPage < 1) curPage = 1;
    blockEl.setAttribute('data-current-page', String(curPage));

    const startIndex = (curPage - 1) * PAGE_SIZE;
    const pagePosts = matchingPosts.slice(startIndex, startIndex + PAGE_SIZE);

    let html = '';
    if (isEditor) {
      html += `
        <div class="page-block-editor-bar" contenteditable="false">
          <div class="page-block-bar-left page-block-editor-bar-left">
            <span class="page-block-type-pill page-block-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <span>Recent Posts</span>
            </span>
            <span class="page-block-meta-pill">
              ${targetCategory ? `Category: <strong>${esc(targetCategory)}</strong>` : 'All Published Posts'} (${totalPosts} post${totalPosts === 1 ? '' : 's'})
            </span>
            <span class="page-block-meta-pill is-terminal-rule" title="Hard Rule: Nothing can be written below the Recent Posts block because it finishes the page.">
              üîí Finishes Page
            </span>
          </div>
          <div class="page-block-bar-right page-block-editor-bar-right">
            <div class="page-block-view-toggle" role="group" aria-label="View Mode">
              <button type="button" class="page-block-view-btn ${layout === 'grid' ? 'active is-active' : ''}" data-action="set-page-block-layout" data-layout="grid" title="Grid View (Up to 12 posts)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span>Grid</span>
              </button>
              <button type="button" class="page-block-view-btn ${layout === 'list' ? 'active is-active' : ''}" data-action="set-page-block-layout" data-layout="list" title="List View (Up to 12 posts)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <span>List</span>
              </button>
            </div>
            <button type="button" class="figure-action-btn btn-delete-fig" title="Delete Block">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }

    if (pagePosts.length === 0) {
      html += `
        <div class="page-block-render-area page-block-empty-state">
          <p style="margin: 0; font-size: 0.95rem; color: var(--text-dim, #71717a);">
            ${targetCategory ? `No published posts in <strong>${esc(targetCategory)}</strong> yet.` : 'No published posts yet.'}
          </p>
        </div>
      `;
    } else {
      const gridClass = layout === 'list'
        ? 'posts-grid posts-list-view cols-1 recent-posts-list page-recent-posts-list'
        : 'posts-grid cols-3 recent-posts-grid page-recent-posts-grid';
      const cardStyle = layout === 'list' ? 'horizontal' : 'vertical';

      let paginationHtml = '';
      if (totalPages > 1) {
        let pagesNumsHtml = '';
        for (let p = 1; p <= totalPages; p++) {
          if (p === 1 || p === totalPages || (p >= curPage - 2 && p <= curPage + 2)) {
            pagesNumsHtml += `<button type="button" class="pagination-page-num ${p === curPage ? 'is-active' : ''}" data-recent-page="${p}">${p}</button>`;
          } else if (p === curPage - 3 || p === curPage + 3) {
            pagesNumsHtml += `<span class="pagination-ellipsis">&hellip;</span>`;
          }
        }
        paginationHtml = `
          <nav class="pagination-bar page-recent-pagination" aria-label="Recent Posts Pagination">
            <button type="button" class="pagination-btn pagination-prev" ${curPage <= 1 ? 'disabled' : ''} data-recent-page="${curPage - 1}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
              <span>Previous</span>
            </button>
            <div class="pagination-pages">${pagesNumsHtml}</div>
            <button type="button" class="pagination-btn pagination-next" ${curPage >= totalPages ? 'disabled' : ''} data-recent-page="${curPage + 1}">
              <span>Next</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </nav>
        `;
      }

      html += `
        <div class="page-block-render-area">
          <div class="${gridClass}" style="margin-bottom: ${totalPages > 1 ? '1.5rem' : '0'};">
            ${pagePosts.map((p, idx) => renderPostCardForBlock(p, cardStyle, idx)).join('')}
          </div>
          ${paginationHtml}
        </div>
      `;
    }

    blockEl.innerHTML = html;

    // Bind pagination buttons inside the block
    blockEl.querySelectorAll('button[data-recent-page]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const nextP = parseInt(btn.getAttribute('data-recent-page'), 10);
        if (!isNaN(nextP) && nextP >= 1 && nextP <= totalPages && nextP !== curPage) {
          blockEl.setAttribute('data-current-page', String(nextP));
          hydrateSingleRecentPostsBlock(blockEl, pageDraft, { ...options, initialPage: nextP });
        }
      });
    });
  }

  function hydratePageBlocks(container, pageDraft, options = {}) {
    if (!container || !container.querySelectorAll) return;
    const d = pageDraft || window.currentDraft;

    // 1. Wrap any bare Share or RSS buttons into proper block containers and ensure popout-3d class
    container.querySelectorAll('.btn-share-article, .btn-copy-share-url').forEach(btn => {
      btn.classList.add('popout-3d');
      const parent = btn.closest('.article-share-block, [data-block-type="share"]');
      if (!parent && btn.parentNode) {
        const wrap = document.createElement('div');
        wrap.className = 'article-share-block';
        wrap.setAttribute('data-block-type', 'share');
        wrap.setAttribute('contenteditable', 'false');
        wrap.setAttribute('draggable', 'true');
        btn.parentNode.replaceChild(wrap, btn);
        wrap.appendChild(btn);
      }
    });

    container.querySelectorAll('.btn-rss-subscribe').forEach(btn => {
      btn.classList.add('popout-3d');
      const parent = btn.closest('.article-rss-block, .rss-feed-showcase-card, [data-block-type="rss"], [data-block-type="rss-box"]');
      if (!parent && btn.parentNode) {
        const wrap = document.createElement('div');
        wrap.className = 'article-rss-block';
        wrap.setAttribute('data-block-type', 'rss');
        wrap.setAttribute('contenteditable', 'false');
        wrap.setAttribute('draggable', 'true');
        btn.parentNode.replaceChild(wrap, btn);
        wrap.appendChild(btn);
      }
    });

    // 2. Auto-heal empty or stripped Share Button blocks
    container.querySelectorAll('.article-share-block, [data-block-type="share"]').forEach(blockEl => {
      if (!blockEl.querySelector('.btn-share-article, .btn-copy-share-url')) {
        const temp = document.createElement('div');
        temp.innerHTML = createShareBlockHtml();
        if (temp.firstElementChild) {
          blockEl.innerHTML = temp.firstElementChild.innerHTML;
          blockEl.setAttribute('contenteditable', 'false');
          blockEl.setAttribute('data-block-type', 'share');
          blockEl.classList.add('article-share-block');
        }
      }
    });

    // 3. Auto-heal empty or stripped RSS Button blocks
    container.querySelectorAll('.article-rss-block, [data-block-type="rss"]').forEach(blockEl => {
      if (!blockEl.querySelector('.btn-rss-subscribe')) {
        const temp = document.createElement('div');
        temp.innerHTML = createRssBlockHtml();
        if (temp.firstElementChild) {
          blockEl.innerHTML = temp.firstElementChild.innerHTML;
          blockEl.setAttribute('contenteditable', 'false');
          blockEl.setAttribute('data-block-type', 'rss');
          blockEl.classList.add('article-rss-block');
        }
      }
    });

    // 4. Auto-convert paragraphs containing only :::share:::, :::rss:::, or :::rss-box ...:::
    container.querySelectorAll('p').forEach(p => {
      const text = (p.textContent || '').trim();
      if (text === ':::share:::') {
        const temp = document.createElement('div');
        temp.innerHTML = createShareBlockHtml();
        if (temp.firstElementChild && p.parentNode) {
          p.parentNode.replaceChild(temp.firstElementChild, p);
        }
      } else if (text === ':::rss:::' || text === ':::subscribe:::') {
        const temp = document.createElement('div');
        temp.innerHTML = createRssBlockHtml();
        if (temp.firstElementChild && p.parentNode) {
          p.parentNode.replaceChild(temp.firstElementChild, p);
        }
      } else if (/^:::rss-box(?:\s+([\s\S]+?))?\s*:::$/i.test(text)) {
        const m = text.match(/^:::rss-box(?:\s+([\s\S]+?))?\s*:::$/i);
        const siteBase = (typeof window.resolveAutoDetectedSiteBaseUrl === 'function') ? window.resolveAutoDetectedSiteBaseUrl() : '';
        const feedUrl = (m && m[1] && m[1].trim()) ? m[1].trim() : (siteBase ? `${siteBase}/feed.xml` : '/feed.xml');
        const safeUrl = String(feedUrl).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const temp = document.createElement('div');
        temp.innerHTML = `<div class="rss-feed-showcase-card" data-block-type="rss-box" contenteditable="false"><div class="rss-feed-url-display"><span class="rss-feed-icon-badge" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor"></circle></svg></span><code class="rss-live-feed-url">${safeUrl}</code></div><button type="button" class="popout-3d btn-rss-subscribe rss-copy-btn" title="Copy RSS feed link to clipboard"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy Link</span></button></div>`;
        if (temp.firstElementChild && p.parentNode) {
          p.parentNode.replaceChild(temp.firstElementChild, p);
        }
      }
    });

    container.querySelectorAll('.page-individual-post-block, [data-block-type="individual-post"]').forEach(blockEl => {
      hydrateSingleIndividualPostBlock(blockEl, d, options);
    });
    container.querySelectorAll('.page-recent-posts-block, [data-block-type="recent-posts"]').forEach(blockEl => {
      hydrateSingleRecentPostsBlock(blockEl, d, options);
    });
  }

  /**
   * Resets active inline formatting states so that newly created text blocks
   * do not inherit styles (bold, italic, underline, strikethrough) from the previous block.
   */
  function resetActiveInlineFormatting() {
    const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
    commands.forEach(cmd => {
      try {
        if (document.queryCommandState(cmd)) {
          document.execCommand(cmd, false, null);
        }
      } catch (e) {}
    });
  }

  function focusNodeCaretLocal(el, atStart = false) {
    if (typeof window.focusNodeCaret === 'function') {
      return window.focusNodeCaret(el, atStart);
    }
    if (!el) return;
    const target = el.querySelector('p') || el.querySelector('code') || el;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(atStart ? true : false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const canvas = el.closest ? (el.closest('[contenteditable="true"]') || document.getElementById('rich-canvas-prose')) : document.getElementById('rich-canvas-prose');
    if (canvas && typeof canvas.focus === 'function') {
      canvas.focus();
    } else if (typeof el.focus === 'function') {
      el.focus();
    }
    window._savedSelectionRange = range.cloneRange();
    window._lastActiveBlock = el;
  }

  function maintainCaretScrollBufferLocal(smooth = false) {
    if (typeof window.maintainCaretScrollBuffer === 'function') {
      return window.maintainCaretScrollBuffer(smooth);
    }
    const container = document.querySelector('.canvas-scroll-container');
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const cHeight = container.clientHeight;
    if (!cHeight) return;
    const bottomThreshold = cRect.bottom - (cHeight / 3);
    let targetBottom = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      if (rects && rects.length > 0) {
        targetBottom = rects[0].bottom;
      } else {
        let node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        if (node && node.nodeType === Node.ELEMENT_NODE) {
          targetBottom = node.getBoundingClientRect().bottom;
        }
      }
    }
    if (targetBottom !== null) {
      const delta = targetBottom - bottomThreshold;
      if (delta > 0) {
        container.scrollTop += delta;
      }
    }
  }

  /**
   * Cleans redundant adjacent empty paragraphs from container
   */
  function cleanConsecutiveEmptyParagraphs(parent, preserveNode = null) {
    if (!parent) return;
    const children = Array.from(parent.children);
    let lastWasEmptyP = false;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isEmptyP = (child.tagName === 'P' && (!child.textContent.trim() || child.innerHTML === '<br>'));
      if (isEmptyP && lastWasEmptyP) {
        if (child !== preserveNode && child !== document.activeElement && child.getAttribute('data-intentional-space') !== 'true') {
          child.remove();
        } else {
          lastWasEmptyP = isEmptyP;
        }
      } else {
        lastWasEmptyP = isEmptyP;
      }
    }
  }

  /**
   * Helper: Determines if a block is a text block (e.g. p, h1-h6, blockquote, ul, ol, pre)
   * vs a non-text block (image figure, gallery, video, hr, embed, page blocks, etc.)
   */
  function isTextBlock(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (
      el.classList.contains('captioned-image-container') ||
      el.classList.contains('custom-gallery-grid') ||
      el.classList.contains('image-gallery-grid') ||
      el.classList.contains('video-wrapper') ||
      el.classList.contains('video-embed-container') ||
      el.classList.contains('article-share-block') ||
      el.classList.contains('article-rss-block') ||
      el.classList.contains('page-recent-posts-block') ||
      el.classList.contains('page-individual-post-block') ||
      el.dataset?.blockType === 'share' ||
      el.dataset?.blockType === 'rss' ||
      el.dataset?.blockType === 'recent-posts' ||
      el.dataset?.blockType === 'individual-post' ||
      el.tagName === 'FIGURE' ||
      el.tagName === 'HR' ||
      el.tagName === 'BLOCKQUOTE'
    ) {
      return false;
    }
    const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE'];
    if (textTags.includes(el.tagName)) {
      if (el.querySelector('img, iframe, video, .article-share-block, .article-rss-block, [data-block-type="share"], [data-block-type="rss"]')) return false;
      return true;
    }
    if (el.querySelector('img, iframe, video, figure, hr, blockquote, .article-share-block, .article-rss-block, [data-block-type="share"], [data-block-type="rss"]')) return false;
    return true;
  }

  /**
   * Enforces the 'one more text block' rule AND the 'Recent Posts finishes the page' hard rule:
   * - If a `.page-recent-posts-block` exists on the page, NOTHING can exist or be written below it.
   *   It is locked as `canvasProse.lastElementChild`, and no trailing text block is ever added after it.
   * - Otherwise, if the lowest block is a non-text block, ensures an empty `<p><br></p>` below it.
   */
  function ensureTrailingTextBlock() {
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return null;

    // Clean up any auto-generated trailing paragraphs that are no longer needed
    // (e.g. when a bottom image block was dragged above a text block)
    Array.from(canvasProse.querySelectorAll('p[data-auto-trailing="true"]')).forEach(autoP => {
      if (!isTrulyEmptyBlock(autoP)) {
        autoP.removeAttribute('data-auto-trailing');
      } else {
        const prev = autoP.previousElementSibling;
        if (autoP !== canvasProse.lastElementChild || (prev && isTextBlock(prev))) {
          autoP.remove();
        }
      }
    });

    // Hard Rule: If a Recent Posts block exists, it MUST finish the page out. Nothing can be below it.
    const recentBlocks = Array.from(canvasProse.querySelectorAll('.page-recent-posts-block, [data-block-type="recent-posts"]'));
    if (recentBlocks.length > 0) {
      const primaryRecent = recentBlocks[0];
      // Remove any duplicate recent-posts blocks
      for (let i = 1; i < recentBlocks.length; i++) {
        recentBlocks[i].remove();
      }
      // Remove any empty paragraphs that appeared after primaryRecent
      let sib = primaryRecent.nextElementSibling;
      while (sib) {
        const next = sib.nextElementSibling;
        if (sib.tagName === 'P' && (!sib.textContent.trim() || sib.innerHTML === '<br>')) {
          sib.remove();
        }
        sib = next;
      }
      // If any other element is still after primaryRecent, move primaryRecent to the very end of canvasProse
      if (canvasProse.lastElementChild !== primaryRecent) {
        canvasProse.appendChild(primaryRecent);
      }
      // Return the block before primaryRecent (if any), never creating a block below primaryRecent
      return primaryRecent.previousElementSibling || null;
    }

    const lastChild = canvasProse.lastElementChild;
    // If the canvas is completely empty, provide one initial text block
    if (!lastChild) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      canvasProse.appendChild(p);
      return p;
    }

    // If the lowest block already is a text block, the 'one more text block' rule shouldn't apply!
    if (isTextBlock(lastChild)) {
      return lastChild;
    }

    // Otherwise, the lowest block is an item that ISN'T a text block (image, gallery, video, individual-post, etc.)
    // Ensure there is one text block directly underneath it:
    const p = document.createElement('p');
    p.setAttribute('data-auto-trailing', 'true');
    p.innerHTML = '<br>';
    canvasProse.appendChild(p);
    return p;
  }

  /**
   * Universal Block Enter Handler:
   * By default, blocks are text blocks, so if the user presses enter to start
   * a new block from ANY of the other blocks, text is ALWAYS the pick.
   * Ensures new text blocks are clean and never inherit formatting/qualities from the previous block.
   */
  function splitBlockToNewParagraph(topBlock, canvasProse) {
    if (!canvasProse) canvasProse = document.getElementById('rich-canvas-prose');

    // Hard Rule: Nothing can be written under the 'Recent Posts' block
    if (topBlock && (topBlock.classList.contains('page-recent-posts-block') || topBlock.dataset?.blockType === 'recent-posts')) {
      if (typeof window.showToast === 'function') {
        window.showToast('Nothing can be written under the Recent Posts block.', 'info');
      }
      if (topBlock.previousElementSibling && isTextBlock(topBlock.previousElementSibling)) {
        focusNodeCaretLocal(topBlock.previousElementSibling, false);
      }
      return;
    }

    const newP = document.createElement('p');
    newP.innerHTML = '<br>';

    if (!topBlock || topBlock === canvasProse) {
      const recentBlock = canvasProse.querySelector('.page-recent-posts-block, [data-block-type="recent-posts"]');
      if (recentBlock) {
        canvasProse.insertBefore(newP, recentBlock);
      } else {
        canvasProse.appendChild(newP);
      }
      ensureTrailingTextBlock();
      focusNodeCaretLocal(newP, true);
      resetActiveInlineFormatting();
      if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
      maintainCaretScrollBufferLocal();
      return;
    }

    // Void or non-editable container blocks: Images, Galleries, Videos, Share blocks, RSS blocks, Individual Post, Quote, HR
    const isSpecialBlock = (
      topBlock.classList.contains('captioned-image-container') ||
      topBlock.classList.contains('custom-gallery-grid') ||
      topBlock.classList.contains('video-wrapper') ||
      topBlock.classList.contains('article-share-block') ||
      topBlock.classList.contains('article-rss-block') ||
      topBlock.classList.contains('page-individual-post-block') ||
      topBlock.dataset?.blockType === 'share' ||
      topBlock.dataset?.blockType === 'rss' ||
      topBlock.dataset?.blockType === 'individual-post' ||
      topBlock.tagName === 'BLOCKQUOTE' ||
      topBlock.tagName === 'PRE' ||
      topBlock.tagName === 'HR'
    );

    if (isSpecialBlock) {
      canvasProse.querySelectorAll('.selected, .selected-item').forEach(el => el.classList.remove('selected', 'selected-item'));
      window._selectedImageBlock = null;
      topBlock.parentNode.insertBefore(newP, topBlock.nextSibling);
      cleanConsecutiveEmptyParagraphs(canvasProse, newP);
      ensureTrailingTextBlock();
      focusNodeCaretLocal(newP, true);
      resetActiveInlineFormatting();
      if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
      if (typeof recordAction === 'function') recordAction('enter-new-block', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      maintainCaretScrollBufferLocal();
      const emitter = (window.Cedar && window.Cedar.emit) ? window.Cedar : window.Outpost;
      if (emitter && emitter.emit) emitter.emit('block:enter', { prevBlock: topBlock, newBlock: newP });
      return;
    }

    // Caret-based text paragraph splitting
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      topBlock.parentNode.insertBefore(newP, topBlock.nextSibling);
      cleanConsecutiveEmptyParagraphs(canvasProse, newP);
      ensureTrailingTextBlock();
      focusNodeCaretLocal(newP, true);
      resetActiveInlineFormatting();
      if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
      maintainCaretScrollBufferLocal();
      return;
    }

    const range = sel.getRangeAt(0);

    // If there is an active selection range, delete the selected contents first
    if (!range.collapsed) {
      range.deleteContents();
    }

    // Accurate check if caret is at the very beginning of the block:
    const preRange = document.createRange();
    preRange.selectNodeContents(topBlock);
    preRange.setEnd(range.startContainer, range.startOffset);
    const preFragment = preRange.cloneContents();
    const isAtStart = (preFragment.textContent || '').length === 0 && !preFragment.querySelector('img, iframe, hr, audio, video');
    const isEmptyBlock = (topBlock.textContent || '').trim().length === 0 && !topBlock.querySelector('img, iframe, hr, audio, video');

    if (isAtStart && !isEmptyBlock) {
      topBlock.parentNode.insertBefore(newP, topBlock);
      cleanConsecutiveEmptyParagraphs(canvasProse, newP);
      ensureTrailingTextBlock();
      if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
      if (typeof recordAction === 'function') recordAction('enter-new-block', true);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(topBlock);
    endRange.setStart(range.endContainer, range.endOffset);
    const extracted = endRange.extractContents();

    const hasText = extracted.textContent && extracted.textContent.trim().length > 0;
    const hasMedia = !!(extracted.querySelector && extracted.querySelector('img, iframe, video, audio, hr'));

    if (hasText || hasMedia) {
      newP.innerHTML = '';
      if (extracted.children && extracted.children.length === 1 && extracted.firstElementChild.tagName === 'P') {
        while (extracted.firstElementChild.firstChild) {
          newP.appendChild(extracted.firstElementChild.firstChild);
        }
      } else {
        newP.appendChild(extracted);
      }
    } else {
      newP.innerHTML = '<br>';
    }

    // Clean up topBlock if it was emptied or has empty trailing inline tags
    if (topBlock.hasAttribute && topBlock.hasAttribute('data-auto-trailing')) {
      topBlock.removeAttribute('data-auto-trailing');
    }
    if (isEmptyBlock) {
      topBlock.setAttribute('data-intentional-space', 'true');
      newP.setAttribute('data-intentional-space', 'true');
    }
    if (topBlock.textContent.trim().length === 0 && !topBlock.querySelector('img, iframe, hr, video, audio')) {
      topBlock.innerHTML = '<br>';
    } else {
      try {
        topBlock.querySelectorAll('strong, em, b, i, u, s, strike, del, a, code, span').forEach(el => {
          if (!el.textContent && !el.children.length) el.remove();
        });
      } catch (e) {}
    }

    topBlock.parentNode.insertBefore(newP, topBlock.nextSibling);
    cleanConsecutiveEmptyParagraphs(canvasProse, newP);
    ensureTrailingTextBlock();
    focusNodeCaretLocal(newP, true);
    resetActiveInlineFormatting();
    if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
    if (typeof recordAction === 'function') recordAction('enter-new-block', true);
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    maintainCaretScrollBufferLocal();
    const emitter = (window.Cedar && window.Cedar.emit) ? window.Cedar : window.Outpost;
    if (emitter && emitter.emit) emitter.emit('block:enter', { prevBlock: topBlock, newBlock: newP });
  }

  /**
   * Returns true ONLY if el is a truly blank paragraph/div block (no words, no elements, not a non-text bar).
   */
  function isTrulyEmptyBlock(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.tagName !== 'P' && el.tagName !== 'DIV') return false;
    if (el.classList && (
      el.classList.contains('gallery-caption') ||
      el.classList.contains('captioned-image-container') ||
      el.classList.contains('custom-gallery-grid') ||
      el.classList.contains('video-wrapper') ||
      el.classList.contains('article-share-block') ||
      el.classList.contains('article-rss-block') ||
      el.classList.contains('page-recent-posts-block') ||
      el.classList.contains('page-individual-post-block') ||
      el.classList.contains('canvas-divider') ||
      el.classList.contains('post-nav-grid')
    )) {
      return false;
    }
    if (el.getAttribute('contenteditable') === 'false') return false;
    if (el.querySelector('img, iframe, video, audio, hr, svg, input, button, textarea, select, canvas, .custom-gallery-grid, .captioned-image-container')) {
      return false;
    }
    const cleanText = (el.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '');
    return cleanText.length === 0;
  }

  /**
   * Inserts newEl into canvas relative to targetBlock:
   * - Replaces targetBlock ONLY if targetBlock is a truly blank text block (isTrulyEmptyBlock(targetBlock)).
   * - Otherwise, ALWAYS inserts newEl into a freshly created space immediately below targetBlock.
   */
  function insertOrReplaceBlockInCanvas(targetBlock, newEl, canvas) {
    if (!canvas) canvas = document.getElementById('rich-canvas-prose');
    if (!canvas || !newEl) return newEl;

    if (!targetBlock || targetBlock.parentNode !== canvas) {
      const recent = canvas.querySelector('.page-recent-posts-block');
      if (recent && recent.parentNode === canvas) {
        canvas.insertBefore(newEl, recent);
      } else {
        canvas.appendChild(newEl);
      }
      return newEl;
    }

    if (isTrulyEmptyBlock(targetBlock)) {
      targetBlock.parentNode.replaceChild(newEl, targetBlock);
      return newEl;
    }

    let anchor = targetBlock;
    if (anchor.classList && anchor.classList.contains('custom-gallery-grid') &&
        anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('gallery-caption')) {
      anchor = anchor.nextElementSibling;
    }

    if (anchor.classList && anchor.classList.contains('page-recent-posts-block')) {
      canvas.insertBefore(newEl, anchor);
    } else {
      canvas.insertBefore(newEl, anchor.nextSibling);
    }
    return newEl;
  }

  function isExistingNonTextBar(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.tagName === 'HR') return true;
    if (el.getAttribute('contenteditable') === 'false') return true;
    if (el.classList && (
      el.classList.contains('captioned-image-container') ||
      el.classList.contains('custom-gallery-grid') ||
      el.classList.contains('video-wrapper') ||
      el.classList.contains('article-share-block') ||
      el.classList.contains('article-rss-block') ||
      el.classList.contains('page-recent-posts-block') ||
      el.classList.contains('page-individual-post-block') ||
      el.classList.contains('canvas-divider') ||
      el.classList.contains('post-nav-grid')
    )) {
      return true;
    }
    return false;
  }

  /**
   * Swap or insert the target block type relative to the currently active/clicked block.
   */
  function swapCurrentBlock(targetType) {
    const canvas = document.getElementById('rich-canvas-prose');
    if (!canvas) return;

    const activeEl = document.activeElement;
    const activeBlockFromFocus = (activeEl && canvas.contains(activeEl) && activeEl !== canvas)
      ? (() => {
          let curr = activeEl;
          while (curr && curr.parentNode !== canvas && curr !== canvas) curr = curr.parentNode;
          return (curr && curr.parentNode === canvas) ? curr : null;
        })()
      : null;

    const selectedNonText = canvas.querySelector('.captioned-image-container.selected, .custom-gallery-grid.selected, .video-wrapper.selected, .article-share-block.selected, .article-rss-block.selected, .page-recent-posts-block.selected, .page-individual-post-block.selected, hr.selected, .canvas-divider.selected, blockquote.selected');

    if (!selectedNonText && !activeBlockFromFocus && typeof window.restoreEditorSelection === 'function') {
      window.restoreEditorSelection();
    }
    if (typeof commitCheckpoint === 'function') commitCheckpoint();

    // 1. Markdown Mode
    if (window.activeMode === 'markdown') {
      const mdInput = document.getElementById('markdown-input');
      if (!mdInput) return;
      const start = mdInput.selectionStart;
      const end = mdInput.selectionEnd;
      const val = mdInput.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      let lineEnd = val.indexOf('\n', end);
      if (lineEnd === -1) lineEnd = val.length;
      const curLine = val.substring(lineStart, lineEnd);
      let cleanLine = curLine.replace(/^(#{1,6}\s*|>(\s*\[!(NOTE|WARNING|TIP)\])?\s*|---\s*|```[a-z]*\s*)/i, '').trim();

      const isInsertAction = ['share', 'share-button', 'rss', 'rss-button', 'subscribe-rss', 'recent-posts', 'individual-post', 'divider', 'hr'].includes(targetType);
      let rep = cleanLine;
      switch (targetType) {
        case 'text':
        case 'p':
          rep = cleanLine;
          break;
        case 'quote':
        case 'blockquote':
          if (/^>\s?/.test(curLine.trim())) {
            rep = cleanLine;
          } else {
            rep = `> ${cleanLine || 'Quote text here...'}`;
          }
          break;
        case 'images':
        case 'image':
          if (typeof openModal === 'function') openModal('modal-insert-image');
          return;
        case 'media':
        case 'embedded-media':
          if (typeof openModal === 'function') openModal('modal-insert-youtube');
          return;
        case 'share':
        case 'share-button':
          rep = `\n:::share:::\n`;
          break;
        case 'rss':
        case 'rss-button':
        case 'subscribe-rss':
          rep = `\n:::rss:::\n`;
          break;
        case 'recent-posts':
          rep = `\n:::recent-posts layout="grid":::\n`;
          break;
        case 'individual-post':
          rep = `\n:::individual-post id="" layout="grid":::\n`;
          break;
        case 'divider':
        case 'hr':
          rep = `\n---\n`;
          break;
      }

      if (isInsertAction && curLine.trim().length > 0) {
        const appended = curLine + '\n' + rep;
        mdInput.value = val.substring(0, lineStart) + appended + val.substring(lineEnd);
        mdInput.selectionStart = lineStart + appended.length;
        mdInput.selectionEnd = lineStart + appended.length;
      } else {
        mdInput.value = val.substring(0, lineStart) + rep + val.substring(lineEnd);
        mdInput.selectionStart = lineStart + rep.length;
        mdInput.selectionEnd = lineStart + rep.length;
      }
      mdInput.focus();
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      return;
    }

    // 2. Canvas Mode
    const sel = window.getSelection();

    // Check for highlighted text selection splitting when converting to quote
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;
    if ((targetType === 'quote' || targetType === 'blockquote') && hasSelection) {
      const range = sel.getRangeAt(0);

      let startNode = range.startContainer;
      if (startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentNode;
      let startBlock = startNode;
      while (startBlock && startBlock.parentNode !== canvas && startBlock !== canvas && startBlock !== document.body) {
        startBlock = startBlock.parentNode;
      }

      let endNode = range.endContainer;
      if (endNode.nodeType === Node.TEXT_NODE) endNode = endNode.parentNode;
      let endBlock = endNode;
      while (endBlock && endBlock.parentNode !== canvas && endBlock !== canvas && endBlock !== document.body) {
        endBlock = endBlock.parentNode;
      }

      // If selection is already inside a blockquote, toggle OFF (unquote back to <p>)
      if (startBlock && startBlock.tagName === 'BLOCKQUOTE') {
        const childPs = Array.from(startBlock.querySelectorAll('p'));
        const frag = document.createDocumentFragment();
        let firstP = null;
        if (childPs.length > 0) {
          childPs.forEach(p => {
            const newP = document.createElement('p');
            let html = p.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
            newP.innerHTML = html.trim() ? html : '<br>';
            frag.appendChild(newP);
            if (!firstP) firstP = newP;
          });
        } else {
          const newP = document.createElement('p');
          let html = startBlock.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
          newP.innerHTML = html.trim() ? html : '<br>';
          frag.appendChild(newP);
          firstP = newP;
        }
        startBlock.parentNode.replaceChild(frag, startBlock);
        if (firstP) focusNodeCaretLocal(firstP, true);
        cleanConsecutiveEmptyParagraphs(canvas, firstP);
        ensureTrailingTextBlock();
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        if (typeof recordAction === 'function') recordAction('unformat-quote', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }

      if (startBlock && startBlock.parentNode === canvas && endBlock && endBlock.parentNode === canvas) {
        const preRange = document.createRange();
        preRange.setStart(startBlock, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preFragment = preRange.cloneContents();
        const preHasText = (preFragment.textContent && preFragment.textContent.trim().length > 0) ||
                           (preFragment.querySelector && preFragment.querySelector('img, a, code, strong, em'));

        const postRange = document.createRange();
        postRange.setStart(range.endContainer, range.endOffset);
        postRange.setEnd(endBlock, endBlock.childNodes.length);
        const postFragment = postRange.cloneContents();
        const postHasText = (postFragment.textContent && postFragment.textContent.trim().length > 0) ||
                            (postFragment.querySelector && postFragment.querySelector('img, a, code, strong, em'));

        const quoteFragment = range.cloneContents();

        const newQuote = document.createElement('blockquote');
        newQuote.setAttribute('data-block-type', 'quote');

        const hasBlockChildren = Array.from(quoteFragment.childNodes).some(n =>
          n.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE'].includes(n.tagName)
        );

        if (hasBlockChildren) {
          Array.from(quoteFragment.childNodes).forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV'].includes(child.tagName)) {
              const p = document.createElement('p');
              p.innerHTML = child.innerHTML;
              newQuote.appendChild(p);
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
              const p = document.createElement('p');
              p.textContent = child.textContent;
              newQuote.appendChild(p);
            } else {
              newQuote.appendChild(child);
            }
          });
        } else {
          const quoteP = document.createElement('p');
          if (quoteFragment.childNodes.length > 0) {
            quoteP.appendChild(quoteFragment);
          } else {
            quoteP.innerHTML = 'Quote text here...';
          }
          newQuote.appendChild(quoteP);
        }

        const insertAnchor = startBlock;

        if (preHasText) {
          const preP = document.createElement('p');
          preP.appendChild(preFragment);
          canvas.insertBefore(preP, insertAnchor);
        }

        canvas.insertBefore(newQuote, insertAnchor);

        if (postHasText) {
          const postP = document.createElement('p');
          postP.appendChild(postFragment);
          canvas.insertBefore(postP, insertAnchor);
        }

        let cur = startBlock;
        while (cur) {
          const next = cur.nextElementSibling;
          const isEnd = (cur === endBlock);
          cur.remove();
          if (isEnd) break;
          cur = next;
        }

        cleanConsecutiveEmptyParagraphs(canvas);
        ensureTrailingTextBlock();
        if (typeof focusNodeCaretLocal === 'function') {
          focusNodeCaretLocal(newQuote, false);
        }
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        if (typeof recordAction === 'function') recordAction('format-quote', true);
        if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        return;
      }
    }

    let block = null;

    // 1. Prioritize an actively selected non-text block or focused element inside canvas
    if (selectedNonText && selectedNonText.parentNode === canvas) {
      block = selectedNonText;
    } else if (activeBlockFromFocus && activeBlockFromFocus.parentNode === canvas) {
      block = activeBlockFromFocus;
    }

    // 2. Otherwise check the active DOM selection range inside canvas
    if (!block && sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      let curr = node;
      while (curr && curr.parentNode !== canvas && curr !== canvas && curr !== document.body) {
        curr = curr.parentNode;
      }
      if (curr && curr.parentNode === canvas) {
        block = curr;
      }
    }

    // 3. Fall back to last active block tracked during canvas focus/typing
    if (!block && window._lastActiveBlock && window._lastActiveBlock.parentNode === canvas) {
      block = window._lastActiveBlock;
    }

    if (!block || block.parentNode !== canvas) {
      const recentBlock = canvas.querySelector('.page-recent-posts-block');
      if (recentBlock && recentBlock.parentNode === canvas) {
        const prev = recentBlock.previousElementSibling;
        if (prev && prev.tagName === 'P') {
          block = prev;
        } else {
          block = document.createElement('p');
          block.innerHTML = '<br>';
          canvas.insertBefore(block, recentBlock);
        }
      } else {
        block = canvas.lastElementChild;
        if (!block || block.tagName !== 'P') {
          block = document.createElement('p');
          block.innerHTML = '<br>';
          canvas.appendChild(block);
        }
      }
    }

    // Track active target block
    window._lastActiveBlock = block;

    const rawText = (block.innerText || block.textContent || '').trim();

    switch (targetType) {
      case 'text':
      case 'p': {
        // If current block is already a BLOCKQUOTE, unquote back to standard paragraph(s)
        if (block.tagName === 'BLOCKQUOTE') {
          const childPs = Array.from(block.querySelectorAll('p'));
          const frag = document.createDocumentFragment();
          let firstP = null;
          if (childPs.length > 0) {
            childPs.forEach(p => {
              const newP = document.createElement('p');
              let html = p.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
              newP.innerHTML = html.trim() ? html : '<br>';
              frag.appendChild(newP);
              if (!firstP) firstP = newP;
            });
          } else {
            const newP = document.createElement('p');
            let html = block.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
            newP.innerHTML = html.trim() ? html : '<br>';
            frag.appendChild(newP);
            firstP = newP;
          }
          block.parentNode.replaceChild(frag, block);
          if (firstP && typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(firstP, true);
          break;
        }

        // If current block is an existing non-text bar (image, gallery, video, share, rss, divider, url/page block),
        // NEVER replace it‚Äîinsert a fresh paragraph below it!
        if (isExistingNonTextBar(block)) {
          const newP = document.createElement('p');
          newP.innerHTML = '<br>';
          insertOrReplaceBlockInCanvas(block, newP, canvas);
          canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
          window._lastActiveBlock = newP;
          if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(newP, true);
          break;
        }

        // If it's a UL or OL list, convert each LI item to a paragraph preserving inline HTML
        if (block.tagName === 'UL' || block.tagName === 'OL') {
          const lis = Array.from(block.querySelectorAll('li'));
          const frag = document.createDocumentFragment();
          let firstP = null;
          if (lis.length > 0) {
            lis.forEach(li => {
              const newP = document.createElement('p');
              if (li.style && li.style.textAlign) newP.style.textAlign = li.style.textAlign;
              else if (block.style && block.style.textAlign) newP.style.textAlign = block.style.textAlign;
              newP.innerHTML = li.innerHTML.trim() ? li.innerHTML : '<br>';
              frag.appendChild(newP);
              if (!firstP) firstP = newP;
            });
          } else {
            const newP = document.createElement('p');
            newP.innerHTML = '<br>';
            frag.appendChild(newP);
            firstP = newP;
          }
          block.parentNode.replaceChild(frag, block);
          if (firstP && typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(firstP, false);
          break;
        }

        // Otherwise (h1, h2, h3, h4, pre, etc.), convert to standard P preserving inline HTML for headings
        if (block.tagName !== 'P') {
          const newP = document.createElement('p');
          if (block.style && block.style.textAlign) newP.style.textAlign = block.style.textAlign;
          if (block.getAttribute('align')) newP.setAttribute('align', block.getAttribute('align'));
          if (/^H[1-6]$/.test(block.tagName)) {
            newP.innerHTML = block.innerHTML.trim() ? block.innerHTML : '<br>';
          } else {
            newP.innerHTML = rawText ? (typeof escapeHtml === 'function' ? escapeHtml(rawText) : rawText) : '<br>';
          }
          block.parentNode.replaceChild(newP, block);
          if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(newP);
        }
        break;
      }

      case 'h2':
      case 'h3':
      case 'h4': {
        const targetTag = targetType.toUpperCase();
        if (isExistingNonTextBar(block)) {
          const headingEl = document.createElement(targetType);
          headingEl.innerHTML = '<br>';
          insertOrReplaceBlockInCanvas(block, headingEl, canvas);
          canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
          window._lastActiveBlock = headingEl;
          if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(headingEl, true);
          break;
        }
        if (block.tagName === targetTag) {
          const newP = document.createElement('p');
          if (block.style && block.style.textAlign) newP.style.textAlign = block.style.textAlign;
          if (block.getAttribute('align')) newP.setAttribute('align', block.getAttribute('align'));
          newP.innerHTML = block.innerHTML.trim() ? block.innerHTML : '<br>';
          block.parentNode.replaceChild(newP, block);
          if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(newP);
          break;
        }
        const headingEl = document.createElement(targetType);
        if (block.style && block.style.textAlign) headingEl.style.textAlign = block.style.textAlign;
        if (block.getAttribute('align')) headingEl.setAttribute('align', block.getAttribute('align'));
        if (block.tagName === 'P' || /^H[1-6]$/.test(block.tagName)) {
          headingEl.innerHTML = block.innerHTML.trim() ? block.innerHTML : '<br>';
        } else {
          headingEl.innerHTML = rawText ? (typeof escapeHtml === 'function' ? escapeHtml(rawText) : rawText) : '<br>';
        }
        block.parentNode.replaceChild(headingEl, block);
        if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(headingEl);
        break;
      }

      case 'codeblock':
      case 'pre': {
        if (isExistingNonTextBar(block)) {
          const newPre = document.createElement('pre');
          const newCode = document.createElement('code');
          newCode.innerHTML = '<br>';
          newPre.appendChild(newCode);
          insertOrReplaceBlockInCanvas(block, newPre, canvas);
          canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
          window._lastActiveBlock = newPre;
          if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(newCode, true);
          break;
        }
        if (block.tagName === 'PRE') {
          const newP = document.createElement('p');
          newP.innerHTML = rawText ? (typeof escapeHtml === 'function' ? escapeHtml(rawText) : rawText) : '<br>';
          block.parentNode.replaceChild(newP, block);
          if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(newP);
          break;
        }
        const newPre = document.createElement('pre');
        const newCode = document.createElement('code');
        if (rawText) {
          newCode.textContent = rawText;
        } else {
          newCode.innerHTML = '<br>';
        }
        newPre.appendChild(newCode);
        block.parentNode.replaceChild(newPre, block);
        if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(newCode);
        break;
      }

      case 'images':
      case 'image':
        window._activeInsertTargetBlock = block;
        if (typeof window.setupEditorMediaModalControls === 'function') {
          window.setupEditorMediaModalControls();
        }
        if (typeof openModal === 'function') {
          openModal('modal-insert-image');
          if (typeof window.renderEditorMediaPopup === 'function') {
            window.renderEditorMediaPopup();
          }
        }
        return;

      case 'media':
      case 'embedded-media':
        window._activeInsertTargetBlock = block;
        if (typeof window.setupEditorMediaModalControls === 'function') {
          window.setupEditorMediaModalControls();
        }
        if (typeof openModal === 'function') {
          const ytInput = document.getElementById('yt-dialog-url');
          if (ytInput) ytInput.value = '';
          openModal('modal-insert-youtube');
        }
        return;

      case 'quote':
      case 'blockquote': {
        // If current block is already a BLOCKQUOTE, toggle back to standard paragraph(s)
        if (block.tagName === 'BLOCKQUOTE') {
          const childPs = Array.from(block.querySelectorAll('p'));
          const frag = document.createDocumentFragment();
          let firstP = null;
          if (childPs.length > 0) {
            childPs.forEach(p => {
              const newP = document.createElement('p');
              let html = p.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
              newP.innerHTML = html.trim() ? html : '<br>';
              frag.appendChild(newP);
              if (!firstP) firstP = newP;
            });
          } else {
            const newP = document.createElement('p');
            let html = block.innerHTML.replace(/^<strong>\[!(NOTE|WARNING|TIP)\]<\/strong><br\/?>(<br\/?>)?/i, '');
            newP.innerHTML = html.trim() ? html : '<br>';
            frag.appendChild(newP);
            firstP = newP;
          }
          block.parentNode.replaceChild(frag, block);
          if (firstP) focusNodeCaretLocal(firstP, true);
          break;
        }

        const newQuote = document.createElement('blockquote');
        newQuote.setAttribute('data-block-type', 'quote');
        const quoteP = document.createElement('p');
        if (isExistingNonTextBar(block)) {
          quoteP.innerHTML = '<br>';
          quoteP.setAttribute('data-placeholder', 'Empty quote...');
          newQuote.appendChild(quoteP);
          insertOrReplaceBlockInCanvas(block, newQuote, canvas);
          canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        } else {
          const htmlContent = (block.tagName === 'P' || /^H[1-6]$/.test(block.tagName)) ? block.innerHTML.trim() : '';
          if (htmlContent && htmlContent !== '<br>') {
            quoteP.innerHTML = block.innerHTML;
          } else {
            quoteP.innerHTML = '<br>';
            quoteP.setAttribute('data-placeholder', 'Empty quote...');
          }
          newQuote.appendChild(quoteP);
          block.parentNode.replaceChild(newQuote, block);
        }
        window._lastActiveBlock = newQuote;
        if (typeof focusNodeCaretLocal === 'function') focusNodeCaretLocal(quoteP, false);
        break;
      }

      case 'share':
      case 'share-button': {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createShareBlockHtml();
        const shareEl = tempDiv.firstElementChild;
        insertOrReplaceBlockInCanvas(block, shareEl, canvas);
        canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        cleanConsecutiveEmptyParagraphs(canvas);
        const trailingP = ensureTrailingTextBlock();
        const nextTarget = (shareEl.nextElementSibling && isTextBlock(shareEl.nextElementSibling))
          ? shareEl.nextElementSibling
          : (trailingP || canvas.lastElementChild);
        if (nextTarget && isTextBlock(nextTarget)) {
          window._lastActiveBlock = nextTarget;
          focusNodeCaretLocal(nextTarget, false);
        } else {
          window._lastActiveBlock = shareEl;
        }
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        break;
      }

      case 'rss':
      case 'rss-button':
      case 'subscribe-rss': {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createRssBlockHtml();
        const rssEl = tempDiv.firstElementChild;
        insertOrReplaceBlockInCanvas(block, rssEl, canvas);
        canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        cleanConsecutiveEmptyParagraphs(canvas);
        const trailingP = ensureTrailingTextBlock();
        const nextTarget = (rssEl.nextElementSibling && isTextBlock(rssEl.nextElementSibling))
          ? rssEl.nextElementSibling
          : (trailingP || canvas.lastElementChild);
        if (nextTarget && isTextBlock(nextTarget)) {
          window._lastActiveBlock = nextTarget;
          focusNodeCaretLocal(nextTarget, false);
        } else {
          window._lastActiveBlock = rssEl;
        }
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        break;
      }

      case 'recent-posts': {
        const existingRecent = canvas.querySelector('.page-recent-posts-block');
        if (existingRecent) {
          if (typeof showToast === 'function') showToast('A Recent Posts block is already at the bottom.', 'info');
          existingRecent.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const tempRecent = document.createElement('div');
        tempRecent.innerHTML = createRecentPostsBlockHtml('grid');
        const recentEl = tempRecent.firstElementChild;
        if (isTrulyEmptyBlock(block) && canvas.children.length > 1) {
          block.remove();
        }
        canvas.appendChild(recentEl);
        hydrateSingleRecentPostsBlock(recentEl, window.currentDraft, { isEditor: true, initialPage: 1 });
        break;
      }

      case 'individual-post': {
        const tempInd = document.createElement('div');
        tempInd.innerHTML = createIndividualPostBlockHtml('', 'grid', '');
        const indEl = tempInd.firstElementChild;
        insertOrReplaceBlockInCanvas(block, indEl, canvas);
        canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        indEl.classList.add('selected');
        window._lastActiveBlock = indEl;
        window._savedSelectionRange = null;
        hydrateSingleIndividualPostBlock(indEl, window.currentDraft, { isEditor: true });
        setTimeout(() => {
          const urlInput = indEl.querySelector('.individual-post-url-input');
          if (urlInput) urlInput.focus();
        }, 30);
        break;
      }

      case 'divider':
      case 'hr': {
        const hr = document.createElement('hr');
        hr.className = 'canvas-divider';
        hr.setAttribute('contenteditable', 'false');
        hr.setAttribute('draggable', 'true');
        insertOrReplaceBlockInCanvas(block, hr, canvas);
        canvas.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
        let nextP = hr.nextElementSibling;
        if (!nextP || !isTextBlock(nextP)) {
          nextP = document.createElement('p');
          nextP.innerHTML = '<br>';
          if (hr.nextSibling) {
            hr.parentNode.insertBefore(nextP, hr.nextSibling);
          } else {
            hr.parentNode.appendChild(nextP);
          }
        }
        cleanConsecutiveEmptyParagraphs(canvas, nextP);
        const trailingP = ensureTrailingTextBlock();
        const nextTarget = (hr.nextElementSibling && isTextBlock(hr.nextElementSibling))
          ? hr.nextElementSibling
          : (trailingP || canvas.lastElementChild);
        if (nextTarget && isTextBlock(nextTarget)) {
          window._lastActiveBlock = nextTarget;
          focusNodeCaretLocal(nextTarget, false);
        } else {
          window._lastActiveBlock = hr;
        }
        if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
        break;
      }
    }

    cleanConsecutiveEmptyParagraphs(canvas);
    ensureTrailingTextBlock();
    if (typeof updateToolbarActiveStates === 'function') updateToolbarActiveStates();
    if (typeof recordAction === 'function') recordAction('swap-block', true);
    if (typeof window.syncFormToDraft === 'function') window.syncFormToDraft();
    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
  }

  /**
   * Delete a block cleanly without leaving ghost blank lines or losing focus
   */
  function deleteBlock(container) {
    if (!container || !container.parentNode) return;
    const canvasProse = document.getElementById('rich-canvas-prose');
    if (!canvasProse) return;

    if (typeof commitCheckpoint === 'function') commitCheckpoint();
    const prevSib = container.previousElementSibling;
    const nextSib = container.nextElementSibling;

    const nextIsEmptyP = nextSib && nextSib.tagName === 'P' && (!nextSib.textContent.trim() || nextSib.innerHTML === '<br>');

    // Extract any images in the block being deleted to purge from post images & media archive
    const imgs = container.querySelectorAll('img');
    const removedFilenames = [];
    imgs.forEach(img => {
      const fn = img.getAttribute('data-img-name') || img.dataset?.imgName || img.dataset?.filename || (img.src && img.src.split('/').pop().split('?')[0]);
      if (fn && !removedFilenames.includes(fn)) removedFilenames.push(fn);
    });

    container.remove();
    canvasProse.querySelectorAll('.selected, .selected-item').forEach(el => el.classList.remove('selected', 'selected-item'));
    window._selectedImageBlock = null;
    window._lastActiveImageBlock = null;
    window._lastActiveBlock = null;

    // If nextSib was an auto-trailing paragraph or an empty paragraph after a text block, remove nextSib to avoid leaving a stray blank line
    if (nextIsEmptyP && ((prevSib && isTextBlock(prevSib) && nextSib.getAttribute('data-intentional-space') !== 'true') || nextSib.getAttribute('data-auto-trailing') === 'true')) {
      nextSib.remove();
    }

    if (removedFilenames.length > 0 && typeof currentDraft !== 'undefined' && currentDraft) {
      if (Array.isArray(currentDraft.images)) {
        currentDraft.images = currentDraft.images.filter(im => !removedFilenames.includes(im.filename));
      }
      if (Array.isArray(currentDraft.tempImages)) {
        currentDraft.tempImages = currentDraft.tempImages.filter(im => !removedFilenames.includes(im.filename));
      }
      if (currentDraft.coverImage && removedFilenames.some(fn => currentDraft.coverImage.includes(fn))) {
        currentDraft.coverImage = '';
        currentDraft.coverImageRemoved = false;
      }
      removedFilenames.forEach(fn => {
        if (typeof window.cleanupOrphanedImageStorage === 'function') {
          window.cleanupOrphanedImageStorage(fn, currentDraft.id);
        }
      });
      if (typeof updateImagesCount === 'function') updateImagesCount();
    }

    // Guarantee at least one paragraph exists
    if (!canvasProse.firstElementChild) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      canvasProse.appendChild(p);
    }

    // Enforce the rule: non-text blocks at bottom get a text block, text blocks do n    )  )                             üQüO†ÄÄÄÄ ø"  M0coupleçnÜoZ/verç\$Ç|Z2Å]VÉpÑ
alerté 
Ñ$ttacké 
Ñ6	guardidleé 
ÑHidleé 
Én	nterestedé 
Ñ 
threatenedé 
Ñwé/Ö0ÉÅrÅjplayeré \*_epçràWÇ	ÅNj*N$%eà Ç
uppeté Ö@%rashingçjÉ_céeäAeateçÅÉFaé5#Ràactivitycardelementé/ádchunkobjectçÅÖ>ÑdçjÖ	Ç!éZÉ
YK!atéèefaultaboutpageéé#llpageéé	linkspageéé0rsspageéé=
figurehtmlé]ÉtextnodeçÅÜaingç\)É@âJÇonéìéfÅÑULá{oré(	
ispécÖlyé]Ñ0opç\)ã/pedç\)Ç!Å#ingç\)Çgssç{w
ãgLÅÑesçjGyç<.$Åe=ÇHÅ
3Ç
X
É+ÑgÇ|3dengineçj"2Å	Å?Ñ<Ç6Ås4ÇCaisystemçj43ÖgÅÅ(
Å5Ji3D4ÅOÇFÖ_Ç	nimationçj5á
commonçj ÅWÖWÅmÖoengineçjÉng
áUtityçj
systemçj1á(Çgameçj0"*Å/ÅÑEÅL%Ç+C'ÑBL*N1%physicsçj4á?Åwscriptsystemçr
á~
oundsystemçj6áWystemçjÅÅ?Ö!ÅTgä4tekçv
â@
viewmatrixé 7yssçW)LÖ#			I	eÇ			Ç_			í/Åu
Ñv

ë(		"Å1	
Ö

(É|		Å$		trlé/àaÖ_ullingçjÅriousçv_rentçÅÉ3:ÖJchunkçÅÖp	olorç\)â=draftç\)É=lyçjÇ'é+"
ÅksettingsauthoravataréèBstomç\É8â^ÜoZÅPêZÅ,iBÑ^
@ÅCtsceneéZ
(;($
Ås5XÅ4ÅÑHtingé/ÜavarçjÅÇvdçjAÑ5ÇjÇ]]"
Çi3d9çjÉâ|520625éçaangeré
êhrkçÅÇ!shé%Çboardé"è(Åb53&.$Cén.Ç	Ñ{		É;ÉVptaçW)ÑVÜ("âÅ0ÅQÑgÅ0
	.ÉlÅèuÇ Ål!urlç\)ÑqeéàZUH*ÑVÜ7ÑuséÅà-ÑnÅayçjséÇ,Å7bef0ebç\)ÜRe7fa0655356çjÜ	Ç5buggingç[)
	clarationé
ÅA7oderéK.ÇTÉiÅ@!ÅCa	dmposedé Å$ratearticledomwithsentencesçÅÇ?á
ingç\)á	onçW)ÜCÅ:Eá#upleçg
reaseé]ÉdicatedçjÇO	uplicatedéÜvraftsç\)
]âionç\)Zeperç~ëfaultçW$Ç>É<(<áÅAÖ8à/ÅjÅCÜ4É6N{Å34p39>R7$Ç7/Ç5/ingé ÖsçÅá8
Ñineé5
Ç(itelyé
?Å	ioné)
[Å8sçjÅlayçÅÜtrigger7é_]ÇÅ,Ç$eteç\)ÉWã9ÉlÖá9.
T-blocké]Ç
déÅN*åb6cÅÇSÇ=ÜUÑÉpKÇ
categoriesé
íqEäidraftidséé>ägraftéç\Åslugséé@ähitemééh	milestoneé	Ç#sé]ÇHingç\)ã2Ü6ÉNëÇonç\)Çaèm	séÑqÖwpendingéêMDÉ]loyç\)Å.edç\)ÜLséìÅthé	Dscendantç\)áribeéX[ptionç\)ÖjRêkÅ
veéUáy"'"1
!.V>:3!C(?! 8'Å 2f,;nN<-*"?$-Å!6^6F4/ualPostBlockHtml = createIndividualPostBlockHtml;
  window.hydratePageBlocks = hydratePageBlocks;
  window.hydrateSingleIndividualPostBlock = hydrateSingleIndividualPostBlock;
  window.hydrateSingleRecentPostsBlock = hydrateSingleRecentPostsBlock;
  window.resolvePublishedPostFromUrl = resolvePublishedPostFromUrl;
  window.resolvePublishedPostByIdOrSlug = resolvePublishedPostByIdOrSlug;
  window.resolveBlogItemFromUrl = resolveBlogItemFromUrl;
  window.resolveBlogPageByIdOrSlug = resolveBlogPageByIdOrSlug;
  window.fetchLinkMetadata = fetchLinkMetadata;
  window.renderPageCardForBlock = renderPageCardForBlock;
  window.renderExternalCardForBlock = renderExternalCardForBlock;
  window.getPageTargetCategory = getPageTargetCategory;
  window.deleteBlock = deleteBlock;
  window.isTextBlock = isTextBlock;
  window.isTrulyEmptyBlock = isTrulyEmptyBlock;
  window.insertOrReplaceBlockInCanvas = insertOrReplaceBlockInCanvas;
})();
