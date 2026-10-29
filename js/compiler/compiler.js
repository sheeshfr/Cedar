/**
 * Cedar - Markdown & HTML Compiler, Exporters & Bundler
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  // =========================================================================
  // MARKDOWN TO HTML COMPILER (AND REVERSE PARSER)
  // =========================================================================

  function parseMarkdownToHtml(mdText) {
    if (!mdText) return '';
    let html = mdText;

    // 1. YouTube Custom Embeds: :::youtube VIDEO_ID_OR_URL:::
    html = html.replace(/:::youtube\s+([^\n:]+):::/gi, function (_, urlOrId) {
      const ytId = extractYouTubeId(urlOrId.trim());
      if (!ytId) return '';
      return `<div class="video-wrapper" contenteditable="false"><iframe src="https://www.youtube-nocookie.com/embed/${ytId}?rel=0&amp;autoplay=0&amp;showinfo=0&amp;enablejsapi=0" width="728" height="409" frameborder="0" allow="autoplay; fullscreen" allowfullscreen="true" loading="lazy"></iframe></div>`;
    });

    // 2. Custom Image Gallery: :::gallery \n img1 \n img2 \n :::caption Caption Text::: \n :::
    html = html.replace(/:::gallery([\s\S]*?):::/gi, function (_, inner) {
      let caption = '';
      let cleanInner = inner.replace(/:::caption\s*([\s\S]*?):::/i, function (_, cap) {
        caption = cap.trim();
        return '';
      });

      const lines = cleanInner.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const images = [];
      lines.forEach(imgUrl => {
        let src = imgUrl;
        let alt = '';
        const match = imgUrl.match(/!\[(.*?)\]\((.*?)\)/);
        if (match) {
          alt = match[1];
          src = match[2];
        }
        
        // Resolve dataUrl if registered
        let displaySrc = src;
        if (typeof imageRegistry !== 'undefined' && imageRegistry && imageRegistry.has(src)) {
          displaySrc = imageRegistry.get(src).dataUrl;
        } else if (typeof window !== 'undefined' && typeof window.resolvePostImage === 'function') {
          const resolved = window.resolvePostImage(src, window.currentDraft);
          if (resolved) displaySrc = resolved;
        }

        images.push({
          src: displaySrc,
          originalSrc: src,
          alt: alt
        });
      });

      const count = images.length;
      if (count === 0) return '';
      const countAttr = count >= 5 ? 'more' : count.toString();
      let itemsHtml = '';

      if (count <= 4) {
        images.forEach((img, idx) => {
          itemsHtml += `<div class="custom-gallery-item" data-index="${idx}"><img src="${escapeHtml(img.src)}" data-original-src="${escapeHtml(img.originalSrc)}" alt="${escapeHtml(img.alt)}" loading="lazy" draggable="false"></div>`;
        });
      } else {
        for (let idx = 0; idx < 3; idx++) {
          const img = images[idx];
          itemsHtml += `<div class="custom-gallery-item" data-index="${idx}"><img src="${escapeHtml(img.src)}" data-original-src="${escapeHtml(img.originalSrc)}" alt="${escapeHtml(img.alt)}" loading="lazy" draggable="false"></div>`;
        }
        const img4 = images[3];
        const moreCount = count - 4;
        itemsHtml += `<div class="custom-gallery-item gallery-item-split" data-index="3">
          <div class="gallery-split-half gallery-split-img-box">
            <img src="${escapeHtml(img4.src)}" data-original-src="${escapeHtml(img4.originalSrc)}" alt="${escapeHtml(img4.alt)}" loading="lazy" draggable="false">
          </div>
          <div class="gallery-split-half gallery-split-badge" data-action="view-more" title="${moreCount} more ${moreCount === 1 ? 'image' : 'images'} in collection">
            <span class="gallery-badge-number">+${moreCount}</span>
          </div>
        </div>`;
        for (let idx = 4; idx < count; idx++) {
          const img = images[idx];
          itemsHtml += `<div class="custom-gallery-item gallery-item-hidden" data-index="${idx}" style="display: none;"><img src="${escapeHtml(img.src)}" data-original-src="${escapeHtml(img.originalSrc)}" alt="${escapeHtml(img.alt)}" loading="lazy" draggable="false"></div>`;
        }
      }

      let out = `<div class="custom-gallery-grid" data-count="${countAttr}" contenteditable="false">${itemsHtml}</div>`;
      if (caption) {
        out += `<p class="gallery-caption">${escapeHtml(caption)}</p>`;
      }
      return out;
    });

    // 2.5. Custom Share Button: :::share:::
    html = html.replace(/:::share:::/gi, function () {
      return `<div class="article-share-block" data-block-type="share" contenteditable="false" draggable="true"><button type="button" class="btn-share-article btn-copy-share-url" title="Copy article link to clipboard"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg><span>Share this article</span></button></div>`;
    });

    // 2.55. Custom Subscribe Button: :::rss::: or :::subscribe:::
    html = html.replace(/:::(?:rss|subscribe):::/gi, function () {
      return `<div class="article-rss-block" data-block-type="rss" contenteditable="false" draggable="true"><button type="button" class="btn-rss-subscribe" title="Subscribe"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor"></circle></svg><span>Subscribe</span></button></div>`;
    });

    // 2.56. RSS Feed Showcase Bar: :::rss-box::: or :::rss-box URL:::
    html = html.replace(/:::rss-box(?:\s+([^\n]+?))?\s*:::/gi, function (_, urlArg) {
      const siteBase = (typeof resolveAutoDetectedSiteBaseUrl === 'function') ? resolveAutoDetectedSiteBaseUrl() : '';
      const feedUrl = (urlArg && urlArg.trim()) ? urlArg.trim() : (siteBase ? `${siteBase}/feed.xml` : '/feed.xml');
      return `<div class="rss-feed-showcase-card" data-block-type="rss-box" contenteditable="false"><div class="rss-feed-url-display"><span class="rss-feed-icon-badge" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor"></circle></svg></span><code class="rss-live-feed-url">${escapeHtml(feedUrl)}</code></div><button type="button" class="popout-3d btn-rss-subscribe rss-copy-btn" title="Copy RSS feed link to clipboard"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy Link</span></button></div>`;
    });

    // 2.6. Page-Exclusive Recent Posts Block: :::recent-posts layout="grid":::
    html = html.replace(/:::recent-posts(?:\s+([^\n:]*))?:::/gi, function (_, attrsStr) {
      const attrs = attrsStr || '';
      const layoutMatch = attrs.match(/layout=["']?(grid|list)["']?/i);
      const layout = layoutMatch ? layoutMatch[1].toLowerCase() : 'grid';
      return `<div class="page-recent-posts-block" data-block-type="recent-posts" data-layout="${layout}" contenteditable="false"></div>`;
    });

    // 2.7. Page-Exclusive Individual Post Block: :::individual-post id="..." slug="..." layout="grid":::
    html = html.replace(/:::individual-post(?:\s+([\s\S]*?))?:::/gi, function (_, attrsStr) {
      const attrs = attrsStr || '';
      const getAttr = (name) => {
        const m = attrs.match(new RegExp(name + '="([^"]*)"', 'i')) || attrs.match(new RegExp(name + "='([^']*)'", 'i'));
        return m ? m[1] : '';
      };

      const postId = getAttr('id');
      const postSlug = getAttr('slug');
      const layout = (getAttr('layout') || 'grid').toLowerCase() === 'list' ? 'list' : 'grid';
      const itemType = getAttr('item-type');
      const pageId = getAttr('page-id');
      const pageSlug = getAttr('page-slug');
      const url = getAttr('url');
      const title = getAttr('title');
      const subtitle = getAttr('subtitle');
      const image = getAttr('image');
      const domain = getAttr('domain');
      const icon = getAttr('icon');

      let extraAttrs = '';
      if (itemType) extraAttrs += ` data-item-type="${escapeHtml(itemType)}"`;
      if (pageId) extraAttrs += ` data-page-id="${escapeHtml(pageId)}"`;
      if (pageSlug) extraAttrs += ` data-page-slug="${escapeHtml(pageSlug)}"`;
      if (url) extraAttrs += ` data-url="${escapeHtml(url)}"`;
      if (title) extraAttrs += ` data-title="${escapeHtml(title)}"`;
      if (subtitle) extraAttrs += ` data-subtitle="${escapeHtml(subtitle)}"`;
      if (image) extraAttrs += ` data-image="${escapeHtml(image)}"`;
      if (domain) extraAttrs += ` data-domain="${escapeHtml(domain)}"`;
      if (icon) extraAttrs += ` data-icon="${escapeHtml(icon)}"`;

      return `<div class="page-individual-post-block" data-block-type="individual-post" data-post-id="${escapeHtml(postId)}" data-post-slug="${escapeHtml(postSlug)}" data-layout="${layout}"${extraAttrs} contenteditable="false" draggable="true"></div>`;
    });

    // 3. Captioned Image in Markdown format: ![Alt](url "Caption")
    html = html.replace(/!\[(.*?)\]\(([^\s\)\"]+)(?:\s+"(.*?)")?\)/g, function (_, alt, src, caption) {
      caption = (caption || '').trim();
      alt = alt || '';
      let displaySrc = src;
      let imgName = '';
      if (typeof imageRegistry !== 'undefined' && imageRegistry && imageRegistry.has(src)) {
        displaySrc = imageRegistry.get(src).dataUrl;
        imgName = imageRegistry.get(src).filename;
      } else {
        const parts = src.split('/');
        imgName = parts[parts.length - 1];
        if (typeof window !== 'undefined' && typeof window.resolvePostImage === 'function') {
          const resolved = window.resolvePostImage(src, window.currentDraft);
          if (resolved) displaySrc = resolved;
        }
      }

      const hasCaption = caption.length > 0 && caption !== 'Add caption here...' && caption !== 'Add image caption here...';
      return `\n<div class="captioned-image-container${hasCaption ? ' has-caption' : ''}" contenteditable="false" draggable="true" tabindex="0"><figure><div class="image-media-wrapper"><img src="${escapeHtml(displaySrc)}" data-original-src="${escapeHtml(src)}" data-img-name="${escapeHtml(imgName)}" alt="${escapeHtml(alt)}" loading="lazy" draggable="false"><button type="button" class="image-add-caption-btn" title="Add Caption"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Add Caption</span></button></div>${hasCaption ? `<figcaption contenteditable="true" placeholder="Add caption here...">${escapeHtml(caption)}</figcaption>` : ''}</figure></div>\n`;
    });

    // 4. Code Blocks: ```lang ... ```
    html = html.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, function (_, lang, code) {
      return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // 5. Split into blocks/paragraphs
    const lines = html.split('\n');
    let inList = false;
    let listType = '';
    let inQuote = false;
    let quoteLines = [];
    let inParagraph = false;
    let pLines = [];
    let parsedBlocks = [];

    function flushList() {
      if (inList) {
        parsedBlocks.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = '';
      }
    }

    function flushQuote() {
      if (inQuote) {
        const quoteContent = quoteLines.map(l => parseInlines(l)).join('<br/>');
        parsedBlocks.push(`<blockquote><p>${quoteContent}</p></blockquote>`);
        inQuote = false;
        quoteLines = [];
      }
    }

    function flushParagraph() {
      if (inParagraph) {
        const content = pLines.map(l => parseInlines(l)).join('<br>');
        parsedBlocks.push(`<p>${content}</p>`);
        inParagraph = false;
        pLines = [];
      }
    }

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Blockquotes
      if (line.startsWith('>')) {
        flushParagraph();
        flushList();
        inQuote = true;
        let qText = line.replace(/^>\s?/, '');
        if (qText.startsWith('[!')) {
          qText = `<strong>${qText}</strong>`;
        }
        quoteLines.push(qText);
        continue;
      } else if (inQuote) {
        flushQuote();
      }

      // Pre-rendered custom blocks & aligned HTML blocks
      const trimmedBlockLine = line.trim();
      if (trimmedBlockLine.startsWith('<div class="video-wrapper"') || 
          trimmedBlockLine.startsWith('<div class="captioned-image-container"') || 
          trimmedBlockLine.startsWith('<div class="custom-gallery-grid"') ||
          trimmedBlockLine.startsWith('<div class="article-share-block"') ||
          trimmedBlockLine.startsWith('<div class="article-rss-block"') ||
          trimmedBlockLine.startsWith('<div class="rss-feed-showcase-card"') ||
          trimmedBlockLine.startsWith('<div class="page-recent-posts-block"') ||
          trimmedBlockLine.startsWith('<div class="page-individual-post-block"') ||
          trimmedBlockLine.startsWith('<p class="gallery-caption"') ||
          trimmedBlockLine.startsWith('<pre>')) {
        flushParagraph();
        flushList();
        parsedBlocks.push(trimmedBlockLine);
        continue;
      }
      if (/^<(p|div|h[1-6]|blockquote)\b[^>]*(align|style|data-indent)=/i.test(trimmedBlockLine)) {
        flushParagraph();
        flushList();
        parsedBlocks.push(parseInlines(trimmedBlockLine));
        continue;
      }

      // Horizontal Rule
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
        flushParagraph();
        flushList();
        parsedBlocks.push('<hr class="canvas-divider" style="border:0; border-top: 1px solid var(--border-subtle, var(--border-color, rgba(255,255,255,0.12))); margin: 2.25rem 0;" />');
        continue;
      }

      // Headings
      if (/^####\s+(.*)/.test(line)) {
        flushParagraph();
        flushList();
        parsedBlocks.push(`<h4>${parseInlines(line.replace(/^####\s+/, ''))}</h4>`);
        continue;
      }
      if (/^###\s+(.*)/.test(line)) {
        flushParagraph();
        flushList();
        parsedBlocks.push(`<h3>${parseInlines(line.replace(/^###\s+/, ''))}</h3>`);
        continue;
      }
      if (/^##\s+(.*)/.test(line)) {
        flushParagraph();
        flushList();
        parsedBlocks.push(`<h2>${parseInlines(line.replace(/^##\s+/, ''))}</h2>`);
        continue;
      }
      if (/^#\s+(.*)/.test(line)) {
        flushParagraph();
        flushList();
        parsedBlocks.push(`<h2>${parseInlines(line.replace(/^#\s+/, ''))}</h2>`);
        continue;
      }

      // Unordered Lists
      if (/^[\*\-\+\u2022]\s+(.*)/.test(line)) {
        flushParagraph();
        if (!inList || listType !== 'ul') {
          flushList();
          parsedBlocks.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        parsedBlocks.push(`<li>${parseInlines(line.replace(/^[\*\-\+\u2022]\s+/, ''))}</li>`);
        continue;
      }

      // Ordered Lists
      if (/^\d+[\.\)]\s+(.*)/.test(line)) {
        flushParagraph();
        if (!inList || listType !== 'ol') {
          flushList();
          parsedBlocks.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        parsedBlocks.push(`<li>${parseInlines(line.replace(/^\d+[\.\)]\s+/, ''))}</li>`);
        continue;
      }

      // Empty line handling: flush paragraphs and lists so separate blocks stay separate
      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }

      // Standard Paragraph
      flushList();
      flushQuote();
      inParagraph = true;
      pLines.push(line);
    }

    flushParagraph();
    flushList();
    flushQuote();

    return parsedBlocks.join('\n');
  }

  function parseInlines(text) {
    if (!text) return '';
    let res = text;
    res = res.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__(.*?)__/g, '<strong>$1</strong>');
    res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
    res = res.replace(/_([^_]+)_/g, '<em>$1</em>');
    res = res.replace(/`([^`]+)`/g, '<code>$1</code>');
    res = res.replace(/~~(.*?)~~/g, '<del>$1</del>');
    res = res.replace(/\[(.*?)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>');
    return res;
  }


  function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    const clean = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = clean.match(regExp);
    return (match && match[2].length === 11) ? match[2] : '';
  }

  /**
   * Converts living HTML Prose DOM nodes back to Clean Markdown
   */
  function domToMarkdown(element) {
    if (!element) return '';
    if (window.mergeAdjacentLists && element.nodeType === Node.ELEMENT_NODE) {
      window.mergeAdjacentLists(element);
    }
    let output = '';

    element.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent;
        if (txt.trim()) output += txt + ' ';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();

        // Skip placeholders and drop indicators
        if (node.id === 'canvas-drop-indicator' || (node.classList && (node.classList.contains('image-sanitizing-placeholder') || node.classList.contains('canvas-drop-indicator')))) {
          return;
        }

        // YouTube video wrapper
        if (node.classList && node.classList.contains('video-wrapper')) {
          const iframe = node.querySelector('iframe');
          if (iframe && iframe.src) {
            const ytId = extractYouTubeId(iframe.src);
            output += `\n\n:::youtube ${ytId}:::\n\n`;
          }
          return;
        }

        // Image figure
        if (node.classList && (node.classList.contains('captioned-image-container') || tag === 'figure')) {
          const img = node.querySelector('img');
          const figcaption = node.querySelector('figcaption');
          if (img) {
            let cap = figcaption ? figcaption.textContent.trim() : '';
            if (cap === 'Add caption here...' || cap === 'Add image caption here...') cap = '';
            const alt = img.alt || 'Image';
            
            // Prefer original relative path /blog/images/filename or registered path
            const activeBlogSlug = (typeof resolveProjectBlogPath === 'function') ? resolveProjectBlogPath() : ((window.projectConfig && window.projectConfig.blogPath) || 'blog');
            const blogImgPrefix = activeBlogSlug ? `/${activeBlogSlug}/images/` : '/images/';
            let src = img.dataset.originalSrc || img.getAttribute('src');
            if (img.dataset.imgName && img.dataset.imgName !== 'img') {
              src = `${blogImgPrefix}${img.dataset.imgName}`;
            } else if (src && src.startsWith('data:')) {
              // find in registry
              const reg = (typeof imageRegistry !== 'undefined' && imageRegistry) || (typeof window !== 'undefined' && window.imageRegistry);
              if (reg && typeof reg.entries === 'function') {
                for (const [key, val] of reg.entries()) {
                  if (val && val.dataUrl === src) {
                    src = val.relativePath;
                    break;
                  }
                }
              }
            }

            output += `\n\n![${alt}](${src}${cap ? ` "${cap}"` : ''})\n\n`;
          }
          return;
        }

        // Gallery grid
        if (node.classList && node.classList.contains('custom-gallery-grid')) {
          const activeBlogSlug = (typeof resolveProjectBlogPath === 'function') ? resolveProjectBlogPath() : ((window.projectConfig && window.projectConfig.blogPath) || 'blog');
          const blogImgPrefix = activeBlogSlug ? `/${activeBlogSlug}/images/` : '/images/';
          const imgs = node.querySelectorAll('img');
          let urls = [];
          imgs.forEach(i => {
            let src = i.dataset.originalSrc || i.getAttribute('src');
            if (i.dataset.imgName && i.dataset.imgName !== 'img') src = `${blogImgPrefix}${i.dataset.imgName}`;
            urls.push(src);
          });
          output += `\n\n:::gallery\n${urls.join('\n')}\n:::\n\n`;
          return;
        }

        if (node.classList && node.classList.contains('gallery-caption')) {
          output += `:::caption ${node.textContent.trim()}:::\n\n`;
          return;
        }

        // Share button block
        if (
          (node.classList && (node.classList.contains('article-share-block') || node.classList.contains('btn-share-article'))) ||
          node.dataset?.blockType === 'share' ||
          (node.querySelector && node.querySelector('.article-share-block, [data-block-type="share"], .btn-share-article'))
        ) {
          output += `\n\n:::share:::\n\n`;
          return;
        }

        // RSS feed showcase box
        if (
          (node.classList && node.classList.contains('rss-feed-showcase-card')) ||
          node.dataset?.blockType === 'rss-box' ||
          (node.querySelector && node.querySelector('.rss-feed-showcase-card, [data-block-type="rss-box"]'))
        ) {
          const codeEl = node.querySelector ? node.querySelector('code.rss-live-feed-url') : null;
          const urlTxt = codeEl ? (codeEl.textContent || '').trim() : '';
          output += urlTxt ? `\n\n:::rss-box ${urlTxt}:::\n\n` : `\n\n:::rss-box:::\n\n`;
          return;
        }

        // RSS button block
        if (
          (node.classList && (node.classList.contains('article-rss-block') || node.classList.contains('btn-rss-subscribe'))) ||
          node.dataset?.blockType === 'rss' ||
          (node.querySelector && node.querySelector('.article-rss-block, [data-block-type="rss"], .btn-rss-subscribe'))
        ) {
          output += `\n\n:::rss:::\n\n`;
          return;
        }

        // Page-Exclusive Recent Posts block
        if (node.classList && node.classList.contains('page-recent-posts-block')) {
          const layout = (node.getAttribute('data-layout') || 'grid').toLowerCase() === 'list' ? 'list' : 'grid';
          output += `\n\n:::recent-posts layout="${layout}":::\n\n`;
          return;
        }

        // Individual Post block / Card Embed
        if (node.classList && node.classList.contains('page-individual-post-block')) {
          const itemType = node.getAttribute('data-item-type') || '';
          const postId = node.getAttribute('data-post-id') || '';
          const postSlug = node.getAttribute('data-post-slug') || '';
          const pageId = node.getAttribute('data-page-id') || '';
          const pageSlug = node.getAttribute('data-page-slug') || '';
          const url = node.getAttribute('data-url') || '';
          const title = node.getAttribute('data-title') || '';
          const subtitle = node.getAttribute('data-subtitle') || '';
          const image = node.getAttribute('data-image') || '';
          const domain = node.getAttribute('data-domain') || '';
          const icon = node.getAttribute('data-icon') || '';
          const layout = (node.getAttribute('data-layout') || 'grid').toLowerCase() === 'list' ? 'list' : 'grid';

          let attrParts = [];
          if (itemType) attrParts.push(`item-type="${itemType.replace(/"/g, '&quot;')}"`);
          if (postId) attrParts.push(`id="${postId.replace(/"/g, '&quot;')}"`);
          if (postSlug) attrParts.push(`slug="${postSlug.replace(/"/g, '&quot;')}"`);
          if (pageId) attrParts.push(`page-id="${pageId.replace(/"/g, '&quot;')}"`);
          if (pageSlug) attrParts.push(`page-slug="${pageSlug.replace(/"/g, '&quot;')}"`);
          if (url) attrParts.push(`url="${url.replace(/"/g, '&quot;')}"`);
          if (title) attrParts.push(`title="${title.replace(/"/g, '&quot;')}"`);
          if (subtitle) attrParts.push(`subtitle="${subtitle.replace(/"/g, '&quot;')}"`);
          if (image) attrParts.push(`image="${image.replace(/"/g, '&quot;')}"`);
          if (domain) attrParts.push(`domain="${domain.replace(/"/g, '&quot;')}"`);
          if (icon) attrParts.push(`icon="${icon.replace(/"/g, '&quot;')}"`);
          attrParts.push(`layout="${layout}"`);

          output += `\n\n:::individual-post ${attrParts.join(' ')}:::\n\n`;
          return;
        }

        const getAlignment = (el) => {
          if (!el) return '';
          return el.style?.textAlign || el.getAttribute('align') || (el.classList?.contains('align-center') ? 'center' : (el.classList?.contains('align-right') ? 'right' : ''));
        };

        const getIndent = (el) => {
          if (!el) return 0;
          return parseInt(el.getAttribute('data-indent') || '0', 10) || 0;
        };

        const buildBlockAttrs = (align, indent) => {
          let attrs = '';
          if (align && (align === 'center' || align === 'right')) attrs += ` align="${align}"`;
          if (indent > 0) attrs += ` data-indent="${indent}"`;
          return attrs;
        };

        switch (tag) {
          case 'h1':
          case 'h2': {
            const hAlign = getAlignment(node);
            const hIndent = getIndent(node);
            const hText = inlineDomToMarkdown(node).trim();
            const attrs = buildBlockAttrs(hAlign, hIndent);
            if (attrs) {
              output += `\n\n<h2${attrs}>${hText}</h2>\n\n`;
            } else {
              output += `\n\n## ${hText}\n\n`;
            }
            break;
          }
          case 'h3': {
            const hAlign = getAlignment(node);
            const hIndent = getIndent(node);
            const hText = inlineDomToMarkdown(node).trim();
            const attrs = buildBlockAttrs(hAlign, hIndent);
            if (attrs) {
              output += `\n\n<h3${attrs}>${hText}</h3>\n\n`;
            } else {
              output += `\n\n### ${hText}\n\n`;
            }
            break;
          }
          case 'h4': {
            const hAlign = getAlignment(node);
            const hIndent = getIndent(node);
            const hText = inlineDomToMarkdown(node).trim();
            const attrs = buildBlockAttrs(hAlign, hIndent);
            if (attrs) {
              output += `\n\n<h4${attrs}>${hText}</h4>\n\n`;
            } else {
              output += `\n\n#### ${hText}\n\n`;
            }
            break;
          }
          case 'p':
          case 'div': {
            const pContent = inlineDomToMarkdown(node).trim();
            if (!pContent && node.getAttribute && node.getAttribute('data-auto-trailing') === 'true') {
              break;
            }
            const align = getAlignment(node);
            const indent = getIndent(node);
            const attrs = buildBlockAttrs(align, indent);
            if (attrs) {
              output += `\n\n<p${attrs}>${pContent || '&nbsp;'}</p>\n\n`;
            } else if (pContent) {
              output += `\n\n${pContent}\n\n`;
            } else {
              output += `\n\n&nbsp;\n\n`;
            }
            break;
          }
          case 'blockquote': {
            const qIndent = getIndent(node);
            const qText = inlineDomToMarkdown(node).trim();
            if (qIndent > 0) {
              output += `\n\n<blockquote data-indent="${qIndent}"><p>${qText}</p></blockquote>\n\n`;
            } else {
              output += `\n\n> ${qText}\n\n`;
            }
            break;
          }
          case 'ul':
            node.querySelectorAll('li').forEach(li => {
              output += `\n- ${inlineDomToMarkdown(li).trim()}`;
            });
            output += '\n\n';
            break;
          case 'ol':
            node.querySelectorAll('li').forEach((li, idx) => {
              output += `\n${idx + 1}. ${inlineDomToMarkdown(li).trim()}`;
            });
            output += '\n\n';
            break;
          case 'pre':
            output += `\n\n\`\`\`\n${node.textContent.replace(/\u200B/g, '').trim()}\n\`\`\`\n\n`;
            break;
          case 'hr':
            output += `\n\n---\n\n`;
            break;
          case 'img':
            const rawAlt = node.getAttribute('alt') || 'Image';
            const rawSrc = node.dataset.originalSrc || node.getAttribute('src') || '';
            output += `\n\n![${rawAlt}](${rawSrc})\n\n`;
            break;
          default:
            output += domToMarkdown(node);
        }
      }
    });

    return output.replace(/\n{3,}/g, '\n\n').replace(/(?:\n\s*&nbsp;\s*)+$/i, '').trim();
  }

  function inlineDomToMarkdown(node) {
    if (!node) return '';
    let out = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.textContent || '').replace(/\u200B/g, '');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.classList && (child.classList.contains('article-share-block') || child.classList.contains('btn-share-article') || child.dataset?.blockType === 'share')) {
          out += '\n\n:::share:::\n\n';
          return;
        }
        if (child.classList && (child.classList.contains('article-rss-block') || child.classList.contains('btn-rss-subscribe') || child.dataset?.blockType === 'rss')) {
          out += '\n\n:::rss:::\n\n';
          return;
        }
        const tag = child.tagName.toLowerCase();
        const inner = inlineDomToMarkdown(child);
        switch (tag) {
          case 'strong':
          case 'b':
            out += inner ? `**${inner}**` : '';
            break;
          case 'em':
          case 'i':
            out += inner ? `*${inner}*` : '';
            break;
          case 'a':
            out += `[${inner}](${child.getAttribute('href') || '#'})`;
            break;
          case 'code':
            out += inner ? `\`${inner}\`` : '';
            break;
          case 'del':
          case 's':
          case 'strike':
            out += inner ? `~~${inner}~~` : '';
            break;
          case 'u':
            out += inner ? `<u>${inner}</u>` : '';
            break;
          case 'mark':
            out += inner ? `<mark class="cedar-highlight">${inner}</mark>` : '';
            break;
          case 'span': {
            const fw = (child.style && child.style.fontWeight) ? String(child.style.fontWeight).toLowerCase() : '';
            const isBoldSpan = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600;
            const formattedInner = (isBoldSpan && inner) ? `**${inner}**` : inner;
            if (child.classList && child.classList.contains('cedar-custom-color')) {
              const customColor = (child.getAttribute('data-custom-color') || child.style?.color || '').trim();
              if (customColor && formattedInner) {
                out += `<span class="cedar-custom-color" data-custom-color="${customColor}" style="color: ${customColor};">${formattedInner}</span>`;
              } else {
                out += formattedInner;
              }
            } else {
              out += formattedInner;
            }
            break;
          }
          case 'img':
            const rawInAlt = child.getAttribute('alt') || 'Image';
            const rawInSrc = child.dataset.originalSrc || child.getAttribute('src') || '';
            out += `\n\n![${rawInAlt}](${rawInSrc})\n\n`;
            break;
          case 'hr':
            out += '\n\n---\n\n';
            break;
          case 'br':
            out += '\n';
            break;
          default:
            out += inner;
        }
      }
    });
    return out;
  }


  // =========================================================================
  // STATIC POST COMPILERS & EXPORT SNIPPETS
  // =========================================================================

  function prepareProseForPublish(html, draft, options = {}) {
    if (!html) return '';
    const preferStaticPaths = Boolean(options && options.preferStaticPaths);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
      const body = doc.body;

      // 0. Hydrate page-exclusive blocks (.page-recent-posts-block, .page-individual-post-block) for published output
      if (body.querySelector('.page-recent-posts-block, .page-individual-post-block')) {
        const hydrator = (typeof window !== 'undefined' && (window.hydratePageBlocks || window.Cedar?.editor?.hydratePageBlocks));
        if (typeof hydrator === 'function') {
          hydrator(body, draft || (typeof window !== 'undefined' ? window.currentDraft : null), { isEditor: false, initialPage: 1 });
        }
      }

      // 0.5. Normalize custom color and underline/strikethrough tags so underline color always matches text color
      if (typeof window !== 'undefined' && typeof window.normalizeCustomColorNodes === 'function') {
        try {
          window.normalizeCustomColorNodes(body);
        } catch (e) {}
      }

      // 1. Remove unwanted editor-only controls and elements cleanly via DOM
      const selectorsToRemove = [
        '.figure-hover-actions',
        '.block-hover-actions',
        '.gallery-item-controls',
        '.image-hover-pill-bar',
        '.image-add-caption-btn',
        '.figure-action-btn',
        '.gallery-item-btn',
        '.gallery-item-delete-btn',
        '.gallery-item-btn-sep',
        '.figure-action-sep',
        '.image-side-add-btn',
        '.btn-add-multi-image',
        '.btn-combine-adjacent-images',
        '.btn-cancel-placeholder',
        '.gallery-slot-placeholder',
        '.btn-slot-choose-media',
        '.gallery-placeholder-inner',
        '.page-block-editor-bar',
        '.individual-post-url-bar',
        '#canvas-drop-indicator',
        '.canvas-drop-indicator'
      ];
      selectorsToRemove.forEach(sel => {
        body.querySelectorAll(sel).forEach(el => el.remove());
      });

      // 1.5. Remove editor selection/dragover states
      body.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      body.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));

      // 2. Remove empty or placeholder figcaptions and gallery captions
      body.querySelectorAll('figcaption, .gallery-caption').forEach(fc => {
        const text = (fc.textContent || '').trim();
        if (!text || text === 'Add caption here...' || text === 'Add image caption here...') {
          fc.remove();
        }
      });

      // 3. Remove contenteditable, placeholder, and draggable attributes
      body.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
      body.querySelectorAll('[placeholder]').forEach(el => el.removeAttribute('placeholder'));
      body.querySelectorAll('[draggable]').forEach(el => el.removeAttribute('draggable'));
      body.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));

      // 3.5. Ensure media and containers stay bounded within article width
      body.querySelectorAll('img, figure, .captioned-image-container, .image-media-wrapper, .custom-gallery-grid, .custom-gallery-item').forEach(el => {
        if (el.style) {
          if (el.style.width && (el.style.width.includes('vw') || parseInt(el.style.width, 10) > 820)) {
            el.style.width = '100%';
          }
          el.style.maxWidth = '100%';
        }
      });

      // 4. Resolve image URLs against static paths (for production site build) or imageRegistry / resolvePostImage
      body.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        const orig = img.dataset.originalSrc || '';
        const imgName = (img.dataset.imgName && img.dataset.imgName !== 'img') ? img.dataset.imgName : '';

        if (preferStaticPaths) {
          if (orig && (orig.startsWith('data:') || orig.startsWith('blob:'))) {
            img.removeAttribute('data-original-src');
          }
          const draftImgs = Array.isArray(draft && draft.images) ? draft.images : [];
          const candidateRef = imgName || ((!orig.startsWith('data:') && !orig.startsWith('blob:')) ? orig : '') || ((!src.startsWith('data:') && !src.startsWith('blob:')) ? src : '');
          const cleanCandidate = candidateRef ? candidateRef.split('?')[0].split('#')[0].split('/').pop().split('\\').pop() : '';
          if (cleanCandidate && draftImgs.length > 0) {
            const matched = draftImgs.find(im => {
              if (!im) return false;
              const fn = (im.filename || im.name || '').trim();
              const rel = (im.relativePath || '').trim();
              return (fn && fn === cleanCandidate) || (rel && (rel === candidateRef || rel.endsWith('/' + cleanCandidate)));
            });
            if (matched && matched.relativePath) {
              img.setAttribute('src', matched.relativePath);
              return;
            }
          }
          if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
            return;
          }
        }

        if (typeof imageRegistry !== 'undefined' && imageRegistry) {
          if (src && imageRegistry.has(src)) {
            img.src = imageRegistry.get(src).dataUrl;
            return;
          } else if (orig && imageRegistry.has(orig)) {
            img.src = imageRegistry.get(orig).dataUrl;
            return;
          } else if (imgName && imageRegistry.has(imgName)) {
            img.src = imageRegistry.get(imgName).dataUrl;
            return;
          }
        }
        if (typeof window !== 'undefined' && typeof window.resolvePostImage === 'function') {
          const ref = (orig && !orig.startsWith('blob:')) ? orig : (imgName || src);
          if (ref) {
            const resolved = window.resolvePostImage(ref, draft);
            if (resolved && (resolved.startsWith('data:') || resolved.startsWith('blob:') || /^https?:\/\//i.test(resolved) || (preferStaticPaths && resolved.startsWith('/')))) {
              img.src = resolved;
            }
          }
        }
      });

      // 5. Ensure gallery items and grids are intact with correct data-count
      body.querySelectorAll('.custom-gallery-grid').forEach(grid => {
        const items = grid.querySelectorAll('.custom-gallery-item:not(.gallery-slot-placeholder)');
        if (items.length > 0) {
          grid.setAttribute('data-count', items.length >= 5 ? 'more' : items.length.toString());
        }
      });

      // 6. Clean empty paragraphs at end
      while (body.lastElementChild && body.lastElementChild.tagName.toLowerCase() === 'p') {
        const pText = (body.lastElementChild.textContent || '').trim();
        const hasMedia = body.lastElementChild.querySelector('img, iframe, svg, video');
        if (!pText && !hasMedia) {
          body.lastElementChild.remove();
        } else {
          break;
        }
      }

      let clean = body.innerHTML;

      // 6.5. Auto-convert any unparsed :::rss-box::: shortcodes in prose HTML
      clean = clean.replace(/(?:<p[^>]*>\s*)?:::rss-box(?:\s+([^\n<]+?))?\s*:::(?:\s*<\/p>)?/gi, function(_, urlArg) {
        const siteBase = (typeof resolveAutoDetectedSiteBaseUrl === 'function') ? resolveAutoDetectedSiteBaseUrl() : '';
        const feedUrl = (urlArg && urlArg.trim()) ? urlArg.trim() : (siteBase ? `${siteBase}/feed.xml` : '/feed.xml');
        return `<div class="rss-feed-showcase-card" data-block-type="rss-box" contenteditable="false"><div class="rss-feed-url-display"><span class="rss-feed-icon-badge" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor"></circle></svg></span><code class="rss-live-feed-url">${escapeHtml(feedUrl)}</code></div><button type="button" class="popout-3d btn-rss-subscribe rss-copy-btn" title="Copy RSS feed link to clipboard"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy Link</span></button></div>`;
      });

      // 7. Wire up share button in published output so it copies URL on click and shows bottom popup
      clean = clean.replace(/<button\b[^>]*class="[^"]*(?:btn-copy-share-url|btn-share-article)[^"]*"[^>]*>([\s\S]*?)<\/button>/gi, function(_, inner) {
        return `<button type="button" class="popout-3d btn-share-article btn-copy-share-url" onclick="if(window.CedarPreview&&window.CedarPreview.handleShareButtonClick){return;} (function(btn){const u=window.location.href; if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u);}else{const t=document.createElement('textarea');t.value=u;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();} const sp=btn.querySelector('span'); if(sp){if(!btn.dataset.origLabel)btn.dataset.origLabel=sp.textContent; sp.textContent='✓ Link Copied!'; setTimeout(()=>{sp.textContent=btn.dataset.origLabel||'Share this article';},2000);} if(typeof window.showPreviewToast==='function'){window.showPreviewToast('Copied URL to clipboard');}else{let c=document.getElementById('preview-toast-container');if(!c){c=document.createElement('div');c.id='preview-toast-container';c.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:100050;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';document.body.appendChild(c);}c.innerHTML='';const el=document.createElement('div');el.style.cssText='background:var(--bg-card,#18181b);color:var(--text-primary,#fafafa);border:1px solid var(--accent-primary,#71717a);padding:10px 18px;border-radius:999px;font-size:0.88rem;font-weight:600;box-shadow:0 10px 28px rgba(0,0,0,0.35);transition:all 0.25s ease;';el.textContent='✓ Copied URL to clipboard';c.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(8px)';setTimeout(()=>el.remove(),250);},2600);}})(this);">${inner}</button>`;
      });

      // 7.5. Wire up RSS Subscribe / Copy Link button in published output so it copies the permanent feed.xml URL and shows bottom popup
      clean = clean.replace(/<(?:button|a)\b([^>]*class="[^"]*btn-rss-subscribe[^"]*"[^>]*)>([\s\S]*?)<\/(?:button|a)>/gi, function(_, attrs, inner) {
        const isCopyBtn = /\brss-copy-btn\b/i.test(attrs);
        const btnClasses = isCopyBtn ? 'popout-3d btn-rss-subscribe rss-copy-btn' : 'popout-3d btn-rss-subscribe';
        const btnTitle = isCopyBtn ? 'Copy RSS feed link to clipboard' : 'Subscribe';
        return `<button type="button" class="${btnClasses}" title="${btnTitle}" data-feed-url="/feed.xml" onclick="if(window.CedarPreview&&window.CedarPreview.handleRssButtonClick){return;} (function(btn,e){if(e){e.preventDefault();e.stopPropagation();} const cardCode=btn.closest('.rss-feed-showcase-card')&&btn.closest('.rss-feed-showcase-card').querySelector('code.rss-live-feed-url'); const u=(cardCode&&cardCode.textContent&&cardCode.textContent.trim())?cardCode.textContent.trim():(window.location.origin+'/feed.xml'); if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u);}else{const t=document.createElement('textarea');t.value=u;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();} const sp=btn.querySelector('span'); if(sp){if(!btn.dataset.origLabel)btn.dataset.origLabel=sp.textContent; sp.textContent=btn.classList.contains('rss-copy-btn')?'✓ Copied!':'✓ RSS Link Copied!'; setTimeout(()=>{sp.textContent=btn.dataset.origLabel||(btn.classList.contains('rss-copy-btn')?'Copy Link':'Subscribe');},2000);} if(typeof window.showPreviewToast==='function'){window.showPreviewToast('Copied RSS feed URL to clipboard');}else{let c=document.getElementById('preview-toast-container');if(!c){c=document.createElement('div');c.id='preview-toast-container';c.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:100050;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';document.body.appendChild(c);}c.innerHTML='';const el=document.createElement('div');el.style.cssText='background:var(--bg-card,#18181b);color:var(--text-primary,#fafafa);border:1px solid var(--accent-primary,#71717a);padding:10px 18px;border-radius:999px;font-size:0.88rem;font-weight:600;box-shadow:0 10px 28px rgba(0,0,0,0.35);transition:all 0.25s ease;';el.textContent='✓ Copied RSS feed URL to clipboard';c.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(8px)';setTimeout(()=>el.remove(),250);},2600);}})(this,event);">${inner}</button>`;
      });

      return clean;
    } catch (e) {
      console.warn('prepareProseForPublish error:', e);
      return html;
    }
  }

  // 0.9. Dedicated Linktree / Links Page Standalone HTML Renderer
  function generateLinktreeHtmlForCompile(draft, config, options = {}) {
    const preferStaticPaths = Boolean(options && options.preferStaticPaths);
    const pCfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : (window.projectConfig || {})) || {};
    let data = draft.linksData || pCfg.linksData;
    if (!data && typeof createDefaultLinksPage === 'function') {
      try {
        data = createDefaultLinksPage().linksData;
      } catch (e) {}
    }
    data = data || {};
    const profile = data.profile || {};
    let rawItems = Array.isArray(data.items) ? data.items.filter(i => i && i.enabled !== false) : [];

    // Purge legacy dummy links
    rawItems = rawItems.filter(i => {
      if (i.id === 'link_fb' || i.id === 'link_ig' || i.id === 'link_tw') return false;
      return true;
    });

    const siteTitle = (pCfg.design?.branding?.siteTitle) || pCfg.name || 'Cedar';
    const siteLogo = (pCfg.design?.branding?.generalLogo) || 'images/Lamp.png';

    if (rawItems.length === 0) {
      rawItems = [{
        id: 'link_blog',
        title: `${siteTitle} Blog`,
        subtitle: 'Latest essays and stories',
        url: '/blog/',
        icon: siteLogo,
        enabled: true
      }];
    } else {
      rawItems.forEach(it => {
        if (it && (it.id === 'link_blog' || it.url === '/blog/' || it.url === 'blog')) {
          if (it.subtitle === 'Read articles and essays') it.subtitle = 'Latest essays and stories';
          if (it.title === 'Blog') it.title = `${siteTitle} Blog`;
          if (it.icon === 'blog' && !it.customIcon) it.icon = siteLogo;
        }
      });
    }

    const items = rawItems;

    const defAuth = (typeof resolveProjectDefaultAuthor === 'function')
      ? resolveProjectDefaultAuthor()
      : (draft.authorName || pCfg.defaultAuthor || '');
    const headline = profile.headline || `Welcome to ${defAuth}'s link site!`;
    const bio = profile.bio || '';

    let avatarUrl = profile.avatar;
    if (!avatarUrl) {
      const authors = Array.isArray(pCfg.authors) ? pCfg.authors : [];
      const authorObj = authors.find(a => ((typeof a === 'object' ? a.name : a) || '').toLowerCase() === defAuth.toLowerCase());
      if (authorObj && typeof authorObj === 'object' && authorObj.avatar) {
        avatarUrl = authorObj.avatar;
      }
    }

    if (!preferStaticPaths && avatarUrl && typeof imageRegistry !== 'undefined' && imageRegistry.has(avatarUrl)) {
      avatarUrl = imageRegistry.get(avatarUrl).dataUrl;
    } else if (avatarUrl && !avatarUrl.startsWith('data:') && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('/')) {
      avatarUrl = '/' + avatarUrl;
    }

    const brandSvgs = (window.Cedar?.links?.BRAND_ICONS) || {
      blog: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
      facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
      instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`,
      twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
      github: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
      youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
      discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
      reddit: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.197-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`,
      tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
      twitch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`,
      spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
      patreon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.82 2.41a8.59 8.59 0 1 0 0 17.18 8.59 8.59 0 0 0 0-17.18zM2.41 21.59h3.76V2.41H2.41z"/></svg>`,
      substack: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg>`,
      bluesky: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566 1.01 1.2 1.764 1.2 3.99c0 1.116.51 7.214.848 8.414.773 2.744 3.528 3.518 5.752 3.12-3.864 1.066-5.88 3.238-3.08 7.396 3.328 4.938 6.564-1.042 7.28-2.614.716 1.572 3.952 7.552 7.28 2.614 2.8-4.158.784-6.33-3.08-7.396 2.224.398 4.98-.376 5.752-3.12.338-1.2.848-7.298.848-8.414 0-2.226-1.366-2.98-4.002-1.185C16.046 4.747 13.087 8.686 12 10.8z"/></svg>`,
      threads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.213-8.184-3.535C2.274 18.257 1.5 15.426 1.5 12.062c0-3.411.83-6.264 2.468-8.48C5.642 1.296 8.448.024 11.996 0c3.674 0 6.54 1.306 8.517 3.882 1.838 2.395 2.71 5.717 2.592 9.873-.03.94-.108 1.826-.234 2.656h-2.317c.106-.71.168-1.464.186-2.247.103-3.626-.63-6.425-2.18-8.318C16.974 3.93 14.707 2.8 11.996 2.8c-2.88 0-5.116 1.01-6.646 3.003C3.904 7.697 3.25 10.024 3.25 12.062c0 3.125.688 5.485 2.046 7.016 1.417 1.597 3.488 2.428 6.157 2.447h.007c2.408 0 4.34-.694 5.742-2.063 1.258-1.229 1.99-2.91 2.184-5.008-.756.408-1.636.685-2.628.825-.38 2.684-1.848 4.208-4.22 4.208-2.457 0-4.02-1.745-4.02-4.475 0-3.056 1.942-4.995 4.887-4.995 1.54 0 2.822.484 3.81 1.44.02-.34.03-.68.03-1.02 0-2.38-.636-4.148-1.89-5.257-1.127-.996-2.73-1.5-4.767-1.5-2.58 0-4.423.868-5.632 2.653-.55.813-.902 1.815-1.047 2.977h-1.9c.162-1.55.674-2.898 1.52-4.01C8.28 2.683 10.74 1.5 13.902 1.5c2.535 0 4.58.67 6.08 1.99 1.63 1.437 2.457 3.655 2.457 6.592 0 .43-.016.86-.046 1.29-.028.38-.066.75-.113 1.11.83 1.22 1.272 2.76 1.272 4.54 0 3.01-.986 5.437-2.932 7.213C18.665 24.084 15.82 24 12.186 24z"/></svg>`,
      steam: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 14.819C1.903 20.099 6.492 24 12 24c6.627 0 12-5.373 12-12S18.627 0 11.979 0z"/></svg>`,
      itch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.27 3.535A2.39 2.39 0 0 0 .546 5.79v1.758a5.1 5.1 0 0 0 1.5 3.693 4.67 4.67 0 0 0 3.344 1.348 4.7 4.7 0 0 0 3.692-1.782A4.7 4.7 0 0 0 12.774 12.6a4.7 4.7 0 0 0 3.692-1.782A4.7 4.7 0 0 0 20.158 12.6a4.67 4.67 0 0 0 3.344-1.348 5.1 5.1 0 0 0 1.5-3.693V5.79a2.39 2.39 0 0 0-1.724-2.255L19.46.993A6.8 6.8 0 0 0 15.65 0H8.35a6.8 6.8 0 0 0-3.81.993zM8.5 7.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM1.5 14.25v6a3.75 3.75 0 0 0 3.75 3.75h13.5A3.75 3.75 0 0 0 22.5 20.25v-6a5.96 5.96 0 0 1-2.342.844v3.406a1.5 1.5 0 0 1-1.5 1.5h-1.5a1.5 1.5 0 0 1-1.5-1.5V15h-7.316v3a1.5 1.5 0 0 1-1.5 1.5h-1.5a1.5 1.5 0 0 1-1.5-1.5v-3.406A5.96 5.96 0 0 1 1.5 14.25z"/></svg>`,
      linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`
    };

    const design = data.design || {};
    const cardStyle = design.cardStyle || 'rounded';
    const cardStyleClass = `card-style-${cardStyle}`;

    let cardsHtml = '';
    items.forEach(it => {
      let iconMarkup = '';
      if (it.icon && (it.icon.startsWith('data:') || it.icon.startsWith('http') || it.icon.includes('.') || it.icon.includes('/'))) {
        let iconSrc = it.icon;
        if (!preferStaticPaths && typeof imageRegistry !== 'undefined' && imageRegistry.has(iconSrc)) {
          iconSrc = imageRegistry.get(iconSrc).dataUrl;
        }
        iconMarkup = `<img src="${escapeHtml(iconSrc)}" alt="" onerror="this.style.display='none';">`;
      } else if (brandSvgs[it.icon]) {
        iconMarkup = brandSvgs[it.icon];
      } else {
        iconMarkup = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
      }

      cardsHtml += `
        <a href="${escapeHtml(it.url || '#')}" target="_blank" rel="noopener noreferrer" class="linktree-card-btn popout-3d ${escapeHtml(cardStyleClass)}">
          <div class="linktree-card-icon">${iconMarkup}</div>
          <div class="linktree-card-text">
            <span class="linktree-card-title">${escapeHtml(it.title || 'Link')}</span>
            ${it.subtitle ? `<span class="linktree-card-sub">${escapeHtml(it.subtitle)}</span>` : ''}
          </div>
        </a>
      `;
    });

    return `
      <div class="linktree-page-wrap">
        ${avatarUrl ? `<div class="linktree-avatar-wrap">
          <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(headline)}" class="linktree-avatar-img" onerror="this.style.display='none';">
        </div>` : ''}
        <h1 class="linktree-headline">${escapeHtml(headline)}</h1>
        ${(bio && bio.trim()) ? `<p class="linktree-bio">${escapeHtml(bio.trim())}</p>` : ''}

        <div class="linktree-cards-container">
          ${cardsHtml || '<p class="linktree-empty-notice">No active links yet.</p>'}
        </div>
      </div>
    `;
  }

  // 1. Full Standalone HTML File for blog/<slug>/index.html
  function generateFullHtml(draft, options = {}) {
    const preferStaticPaths = Boolean(options && options.preferStaticPaths);
    const isLayoutOverrideActive = Boolean(
      draft.layoutOverride ||
      (typeof window !== 'undefined' && typeof window.resolveProjectLayoutOverride === 'function'
        ? window.resolveProjectLayoutOverride()
        : (typeof window !== 'undefined' && window.projectConfig && window.projectConfig.layoutOverride))
    );
    if (isLayoutOverrideActive && draft.customHtml && typeof draft.customHtml === 'string') {
      const trimmedCustom = draft.customHtml.trim();
      if (/^<!doctype\s+html/i.test(trimmedCustom) || /^<html[\s>]/i.test(trimmedCustom)) {
        return draft.customHtml;
      }
    }
    const isPage = draft.type === 'page';
    const isAboutCedar = isPage && (draft.id === 'page_about_cedar' || draft.slug === 'about-cedar');
    if (isAboutCedar) {
      draft.subtitle = '';
      draft.showSubtitle = false;
      if (typeof window !== 'undefined' && typeof window.createDefaultAboutCedarPage === 'function') {
        const canonicalCedar = window.createDefaultAboutCedarPage();
        draft.markdown = canonicalCedar.markdown;
        draft.proseHtml = canonicalCedar.proseHtml;
      } else {
        draft.markdown = `> After a decade-plus of experimenting with blogging tools, I never found one I really liked. Cedar is my attempt at pulling the best parts of classic writers into a single, focused experience.\n\n**Cedar** is an open-source, web-based static blog generator built to keep writing simple. Out of the box, it:\n\n- **Gives you a focused writing studio** for drafting and formatting posts.\n- **Manages your posts, pages, and media** in one place.\n- **Organizes your static site files** automatically so they are always ready to publish.\n- **Makes deploying effortless**—whether pushing straight to GitHub or exporting a \`.zip\`.\n\n### 100% Local-First\n\nEven though Cedar runs in your browser, everything you create stays 100% on your machine until you choose to move it elsewhere. You can work directly in your browser's local storage, save your project to a folder on your computer or a portable SSD, or publish straight to GitHub.\n\nWhatever your workflow, Cedar handles the file structure behind the scenes—so you get all the speed and ownership of a static site without ever having to wrestle with files and folders.\n\n[Try Cedar at cedar.pub](https://cedar.pub) • [View Source on GitHub](https://github.com/sheeshfr/Cedar)`;
        draft.proseHtml = `<blockquote>After a decade-plus of experimenting with blogging tools, I never found one I really liked. Cedar is my attempt at pulling the best parts of classic writers into a single, focused experience.</blockquote><p><strong>Cedar</strong> is an open-source, web-based static blog generator built to keep writing simple. Out of the box, it:</p><ul><li><strong>Gives you a focused writing studio</strong> for drafting and formatting posts.</li><li><strong>Manages your posts, pages, and media</strong> in one place.</li><li><strong>Organizes your static site files</strong> automatically so they are always ready to publish.</li><li><strong>Makes deploying effortless</strong>—whether pushing straight to GitHub or exporting a <code>.zip</code>.</li></ul><h3>100% Local-First</h3><p>Even though Cedar runs in your browser, everything you create stays 100% on your machine until you choose to move it elsewhere. You can work directly in your browser's local storage, save your project to a folder on your computer or a portable SSD, or publish straight to GitHub.</p><p>Whatever your workflow, Cedar handles the file structure behind the scenes—so you get all the speed and ownership of a static site without ever having to wrestle with files and folders.</p><p><a href="https://cedar.pub" target="_blank" rel="noopener noreferrer">Try Cedar at cedar.pub</a> &nbsp;&bull;&nbsp; <a href="https://github.com/sheeshfr/Cedar" target="_blank" rel="noopener noreferrer">View Source on GitHub</a></p>`;
      }
    }
    const title = draft.title || 'Untitled Article';
    const subtitle = isAboutCedar ? '' : (draft.subtitle || '');
    const isRss = isPage && (draft.id === 'page_rss' || draft.slug === 'rss');
    const isLinks = isPage && (draft.id === 'page_links' || draft.slug === 'links');
    if (isRss && typeof window.generateRssPageData === 'function') {
      const cfg = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : {});
      const rssData = window.generateRssPageData(cfg);
      draft.subtitle = rssData.subtitle;
      draft.markdown = rssData.markdown;
      draft.proseHtml = rssData.proseHtml;
    } else if (isLinks && typeof window.generateLinksPageData === 'function') {
      const cfg = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : {});
      const linksPageData = window.generateLinksPageData(draft.linksData, cfg);
      draft.subtitle = linksPageData.subtitle;
      draft.markdown = linksPageData.markdown;
      draft.proseHtml = linksPageData.proseHtml;
    }

    let linksInlineBgStyle = '';
    let linksPatternClass = '';
    if (isLinks && draft.linksData && draft.linksData.design) {
      const d = draft.linksData.design;
      const gradMap = {
        sunset: 'linear-gradient(135deg, #1e1b4b 0%, #431407 50%, #18181b 100%)',
        aurora: 'linear-gradient(135deg, #022c22 0%, #064e3b 40%, #0f172a 100%)',
        cyber: 'linear-gradient(135deg, #2e0854 0%, #09090b 60%, #083344 100%)',
        midnight: 'radial-gradient(ellipse at top, #1e293b 0%, #09090b 100%)',
        candy: 'linear-gradient(135deg, #4a044e 0%, #1e1b4b 50%, #0369a1 100%)',
        amber: 'linear-gradient(135deg, #451a03 0%, #1c1917 100%)'
      };
      if (d.bgType === 'color' && d.bgColor) {
        linksInlineBgStyle = `background-color: ${escapeHtml(d.bgColor)}; --links-page-bg: ${escapeHtml(d.bgColor)};`;
      } else if (d.bgType === 'gradient' && d.bgGradient) {
        const grad = gradMap[d.bgGradient] || d.bgGradient;
        linksInlineBgStyle = `background: ${grad}; --links-page-bg: #0f172a;`;
      } else if (d.bgType === 'pattern' && d.bgPattern) {
        if (d.bgColor) linksInlineBgStyle = `background-color: ${escapeHtml(d.bgColor)}; --links-page-bg: ${escapeHtml(d.bgColor)};`;
        linksPatternClass = `linktree-pattern-${d.bgPattern}`;
      } else if (d.bgType === 'image' && d.bgImageUrl) {
        let resolved = d.bgImageUrl;
        if (typeof imageRegistry !== 'undefined' && imageRegistry.has(resolved)) {
          resolved = imageRegistry.get(resolved).dataUrl;
        }
        linksInlineBgStyle = `background-image: url('${escapeHtml(resolved)}'); background-size: cover; background-position: center; background-attachment: fixed; --links-page-bg: #0f172a;`;
      }
    }
    const showTitle = !isPage || draft.showTitle !== false;
    const showSubtitle = !isAboutCedar && (!isPage || draft.showSubtitle !== false);
    const slug = draft.slug || generateSlug(title);
    const metaDesc = draft.customDesc || (isAboutCedar ? 'A focused, offline-first Wizzy Wig authoring and static blog publishing tool.' : (subtitle || title));
    const safeFormatDateDisplay = (d) => (typeof formatDateDisplay === 'function' ? formatDateDisplay(d) : (typeof formatDate === 'function' ? formatDate(d) : (d || '')));
    const pubDate = draft.date || draft.publishedDate;
    const pubDateDisplay = safeFormatDateDisplay(pubDate);
    const editDateDisplay = draft.editedDate ? safeFormatDateDisplay(draft.editedDate) : null;
    let metaDateHtml = `<time datetime="${pubDate}">${pubDateDisplay}</time>`;
    if (editDateDisplay && editDateDisplay !== pubDateDisplay) {
      metaDateHtml = `<time datetime="${pubDate}">${pubDateDisplay}</time><span class="meta-dot">&bull;</span><span>Edited ${editDateDisplay}</span>`;
    }
    const readTime = (typeof calculateReadTime === 'function' ? calculateReadTime(draft.markdown, draft.overrideReadTime) : (typeof calcReadTime === 'function' ? calcReadTime(draft.markdown) : '1 min read'));
    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')
      ? resolveProjectDefaultAuthor()
      : (((typeof window !== 'undefined' && window.projectConfig && window.projectConfig.defaultAuthor) || (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.defaultAuthor)) || '');
    const rawAuthors = [defaultAuth || draft.authorName || (Array.isArray(draft.authors) && draft.authors[0]) || 'Staff'];
    const authorName = (typeof window.formatAuthorsString === 'function')
      ? window.formatAuthorsString(rawAuthors)
      : (draft.authorName || defaultAuth);
    const bylineText = (typeof window.formatAuthorsByline === 'function')
      ? window.formatAuthorsByline(rawAuthors)
      : `By ${authorName}`;
    const authorInitial = draft.authorInitial || (authorName.charAt(0) || 'O').toUpperCase();

    const pConfig = (typeof window !== 'undefined' && window.projectConfig) || (typeof projectConfig !== 'undefined' ? projectConfig : null);
    let authorsPool = (pConfig && Array.isArray(pConfig.authors)) ? pConfig.authors : [];
    if (authorsPool.length === 0 && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('sheesh_static_writer_project_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.authors)) authorsPool = parsed.authors;
        }
      } catch (e) {}
    }

    const baseHref = '';

    function findAuthorAvatar(nameOrObj) {
      if (!nameOrObj) return '';
      if (typeof nameOrObj === 'object' && nameOrObj.avatar) return nameOrObj.avatar;
      const aName = (typeof window.getAuthorName === 'function')
        ? window.getAuthorName(nameOrObj)
        : (typeof nameOrObj === 'object' && nameOrObj ? nameOrObj.name : String(nameOrObj || ''));
      const lower = (aName || '').toLowerCase().trim();
      const match = authorsPool.find(a => {
        const candidate = (typeof window.getAuthorName === 'function') ? window.getAuthorName(a) : (typeof a === 'object' && a ? a.name : String(a || ''));
        return (candidate || '').toLowerCase().trim() === lower;
      });
      let av = (match && typeof match === 'object' && match.avatar) ? match.avatar : '';
      if (!av && typeof nameOrObj === 'object' && nameOrObj.avatar) {
        av = nameOrObj.avatar;
      }
      if (!av && lower === (draft.authorName || '').toLowerCase().trim() && draft.authorAvatar) {
        av = draft.authorAvatar;
      }
      if (!preferStaticPaths && av && typeof imageRegistry !== 'undefined' && imageRegistry.has(av)) {
        av = imageRegistry.get(av).dataUrl;
      }
      if (av && !av.startsWith('data:') && !av.startsWith('http') && !av.startsWith('/')) {
        av = '/' + av;
      }
      return av;
    }

    let authorAvatarHtml = '';
    if (rawAuthors.length > 1) {
      const avatarsHtml = rawAuthors.slice(0, 3).map((authItem, i) => {
        const aName = (typeof window.getAuthorName === 'function') ? window.getAuthorName(authItem) : (typeof authItem === 'object' && authItem ? authItem.name : String(authItem || ''));
        const av = findAuthorAvatar(authItem);
        const margin = i > 0 ? 'margin-left:-8px;' : '';
        if (av) {
          return `<img class="author-avatar" src="${escapeHtml(av)}" alt="${escapeHtml(aName)}" onerror="this.style.display='none';" style="width:24px;height:24px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;${margin}border:none;background:transparent;">`;
        }
        return '';
      }).filter(Boolean).join('');
      if (avatarsHtml) {
        authorAvatarHtml = `<div class="authors-avatar-cluster" style="display:inline-flex;align-items:center;">${avatarsHtml}</div>`;
      }
    } else {
      const singleAuth = rawAuthors[0] || authorName;
      const singleAvatar = findAuthorAvatar(singleAuth);
      authorAvatarHtml = singleAvatar
        ? `<img class="author-avatar" src="${escapeHtml(singleAvatar)}" alt="${escapeHtml(authorName)}" onerror="this.style.display='none';" style="width:24px;height:24px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;border:none;background:transparent;">`
        : '';
    }
    const tag = draft.tag || '';
    const hasCustomFragment = isLayoutOverrideActive && draft.customHtml && typeof draft.customHtml === 'string' && draft.customHtml.trim();
    let rawProse;
    if (isLinks) {
      rawProse = generateLinktreeHtmlForCompile(draft, pConfig, options);
    } else if (hasCustomFragment) {
      rawProse = draft.customHtml;
    } else {
      rawProse = (draft.proseHtml || parseMarkdownToHtml(draft.markdown));
    }
    const proseHtml = (isLinks || hasCustomFragment) ? rawProse : prepareProseForPublish(rawProse, draft, options);
    const canonicalPath = isPage ? `pages/published/${slug}/` : `blog/published/${slug}/`;
    const resolvedDomain = (window.resolveProjectDomain ? window.resolveProjectDomain() : ((window.projectConfig && window.projectConfig.domain) || (typeof localStorage !== 'undefined' ? localStorage.getItem('cedar_user_domain') : '') || '')).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const siteBase = resolvedDomain ? `https://${resolvedDomain}` : '';
    const canonicalUrl = siteBase ? `${siteBase}/${canonicalPath}` : `/${canonicalPath}`;
    
    // Resolve Cover Image
    let resolvedCover = (draft.coverImage || '').trim();
    if (resolvedCover) {
      if (preferStaticPaths) {
        const cleanCoverFn = resolvedCover.split('?')[0].split('#')[0].split('/').pop().split('\\').pop();
        if (Array.isArray(draft.images) && cleanCoverFn) {
          const found = draft.images.find(im => im && ((im.filename && im.filename === cleanCoverFn) || (im.relativePath && im.relativePath === resolvedCover)));
          if (found && found.relativePath) {
            resolvedCover = found.relativePath;
          }
        }
        if (resolvedCover && !resolvedCover.startsWith('data:') && !resolvedCover.startsWith('blob:') && !resolvedCover.startsWith('http') && !resolvedCover.startsWith('/')) {
          resolvedCover = `/${canonicalPath}${resolvedCover}`;
        }
      } else if (typeof imageRegistry !== 'undefined' && imageRegistry.has(resolvedCover)) {
        resolvedCover = imageRegistry.get(resolvedCover).dataUrl;
      } else if (typeof window !== 'undefined' && typeof window.resolvePostImage === 'function') {
        const resolved = window.resolvePostImage(resolvedCover, draft);
        if (resolved) resolvedCover = resolved;
      } else if (Array.isArray(draft.images)) {
        const found = draft.images.find(im => (im.src === resolvedCover || im.originalSrc === resolvedCover));
        if (found && found.src) resolvedCover = found.src;
      }
    }
    const coverImage = resolvedCover;

    function isSameAsset(srcA, srcB) {
      if (!srcA || !srcB) return false;
      if (srcA === srcB) return true;
      const cleanA = srcA.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
      const cleanB = srcB.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
      if (cleanA === cleanB) return true;
      const fileA = cleanA.split('/').pop();
      const fileB = cleanB.split('/').pop();
      if (fileA && fileB && fileA === fileB && !fileA.startsWith('data:') && !fileA.startsWith('blob:')) return true;
      return false;
    }

    let isCoverInProse = false;
    if (coverImage || draft.coverImage || draft.featuredImage) {
      try {
        const pDoc = new DOMParser().parseFromString(`<body>${proseHtml}</body>`, 'text/html');
        const pImgs = Array.from(pDoc.body.querySelectorAll('img')).filter(img => {
          return !img.closest('.page-recent-posts-block, .page-individual-post-block, [data-block-type="recent-posts"], [data-block-type="individual-post"], .post-card');
        });
        isCoverInProse = pImgs.some(img => {
          const s = img.getAttribute('src') || img.src || '';
          const orig = img.dataset.originalSrc || '';
          return isSameAsset(s, coverImage) ||
                 isSameAsset(s, draft.coverImage) ||
                 isSameAsset(s, draft.featuredImage) ||
                 (orig && (isSameAsset(orig, coverImage) || isSameAsset(orig, draft.coverImage)));
        });
      } catch (e) {
        const targetFilename = (draft.coverImage || draft.featuredImage || '').split('/').pop();
        if (targetFilename && proseHtml.includes(targetFilename)) isCoverInProse = true;
      }
    }

    let prevNextHtml = '';
    // Next/Prev navigation disabled per user design requirement

    const isStickyHeader = !!(window.projectConfig && window.projectConfig.design && window.projectConfig.design.stickyHeader);
    const blogCreatedYear = (window.projectConfig && window.projectConfig.createdYear) ||
      (window.projectConfig && window.projectConfig.createdAt ? new Date(window.projectConfig.createdAt).getFullYear() : null) ||
      new Date().getFullYear();
    const brand = (window.projectConfig && window.projectConfig.design && window.projectConfig.design.branding) || {};
    const blogSiteName = (window.projectConfig && window.projectConfig.name) ||
      brand.siteTitle ||
      'Cedar';
    const blogTagline = (window.projectConfig && window.projectConfig.subtitle) || brand.tagline || '';
    const rawBlogLogo = (brand.originalLogo || brand.generalLogo || '').trim();
    let blogLogo = (rawBlogLogo && rawBlogLogo !== 'logo.png' && rawBlogLogo !== '/logo.png') ? rawBlogLogo : '';
    if (preferStaticPaths) {
      if (blogLogo && blogLogo.startsWith('data:')) {
        blogLogo = '/media/branding/logo.png';
      } else if (blogLogo && !blogLogo.startsWith('http') && !blogLogo.startsWith('/')) {
        blogLogo = '/' + blogLogo;
      }
    } else if (typeof imageRegistry !== 'undefined' && imageRegistry.has(blogLogo)) {
      blogLogo = imageRegistry.get(blogLogo).dataUrl;
    } else if (blogLogo && !blogLogo.startsWith('data:') && !blogLogo.startsWith('http') && !blogLogo.startsWith('/')) {
      blogLogo = '/' + blogLogo;
    }
    const blogHomeHref = '/';
    const mh = (window.projectConfig && window.projectConfig.design && window.projectConfig.design.masthead) || {};
    const homeBlocks = (window.projectConfig && window.projectConfig.design && window.projectConfig.design.homeBlocks) || [];
    const mhBlock = homeBlocks.find(b => b.id === 'b_masthead');
    const mhAlign = (window.projectConfig && window.projectConfig.design && window.projectConfig.design.headerAlign) || (mhBlock && (mhBlock.align || (mhBlock.config && mhBlock.config.align))) || mh.align || 'center';
    const mhH = (mhBlock && mhBlock.h) || mh.height || (mhAlign === 'center' ? 96 : 64);
    const els = mh.elements || {};
    const logoCfg = els.logo || { enabled: true };
    const titleCfg = els.title || { enabled: true };
    const navCfg = els.nav || { enabled: true };

    const spacingMode = (mhBlock && mhBlock.config && mhBlock.config.spacing) || mh.spacing || 'auto';
    let userSpacingScale = (mhBlock && mhBlock.config && typeof mhBlock.config.spacingScale === 'number')
      ? mhBlock.config.spacingScale
      : (typeof mh.spacingScale === 'number' ? mh.spacingScale : 1.0);

    if (spacingMode === 'compact') userSpacingScale *= 0.65;
    else if (spacingMode === 'relaxed') userSpacingScale *= 1.45;

    const factor = Math.max(0.4, userSpacingScale);

    const lockupGap = Math.round(6 * Math.min(2.4, factor));
    const navGap = Math.round(8 * Math.min(2.4, factor));
    const logoGrowth = Math.min(1.65, 1.0 + Math.max(0, mhH - 64) / 360);
    const titleGrowth = Math.min(1.35, 1.0 + Math.max(0, mhH - 64) / 500);
    const design = (window.projectConfig && window.projectConfig.design) || {};
    const logoScale = typeof logoCfg.scale === 'number' ? logoCfg.scale : (typeof design.logoScale === 'number' ? design.logoScale : ((design.branding && typeof design.branding.logoScale === 'number') ? design.branding.logoScale : 1.0));
    const titleScale = typeof titleCfg.scale === 'number' ? titleCfg.scale : (typeof design.titleScale === 'number' ? design.titleScale : ((design.branding && typeof design.branding.titleScale === 'number') ? design.branding.titleScale : 1.0));
    const brandingMode = design.brandingMode || (typeof design.branding === 'string' ? design.branding : '');
    const isLogoEnabled = brandingMode === 'title' ? false : (brandingMode === 'logo' || brandingMode === 'both' ? true : logoCfg.enabled !== false);
    const hasValidLogo = Boolean(blogLogo && isLogoEnabled);
    const isTitleEnabled = brandingMode === 'logo' ? false : (brandingMode === 'title' || brandingMode === 'both' ? true : titleCfg.enabled !== false);
    const logoSize = Math.round(44 * logoScale * logoGrowth);
    const effectiveLogoSize = hasValidLogo ? logoSize : 0;
    const effectiveTitleSize = isTitleEnabled ? Math.round(1.25 * titleScale * titleGrowth * 24) : 0;
    const refContentHeight = Math.max(effectiveLogoSize, effectiveTitleSize, 28);
    const padV = Math.max(8, Math.min(18, Math.round(refContentHeight * 0.12 * Math.max(0.5, factor))));
    const titleFs = (1.25 * titleScale * titleGrowth).toFixed(2);
    const headerMinH = 0;
    const containerW = (window.projectConfig && window.projectConfig.design && window.projectConfig.design.containerWidth) || 1280;
    const effThemeId = design.blogTheme || design.activeTheme || 'basalt';
    const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
    let palette;

    if (effThemeId === 'custom' && design.customColors) {
      palette = design.customColors;
    } else if (String(effThemeId).startsWith('custom_')) {
      const sIdx = parseInt(String(effThemeId).replace('custom_', ''), 10) - 1;
      palette = (Array.isArray(design.customPalettes) && design.customPalettes[sIdx] && design.customPalettes[sIdx].c60)
        ? design.customPalettes[sIdx]
        : (design.customColors || palettes.basalt);
    } else if (design.customColors && !palettes[effThemeId]) {
      palette = design.customColors;
    } else {
      palette = palettes[effThemeId] || palettes.basalt || { c60: '#121214', c30: '#18181b', c10: '#71717a', border: 'rgba(255, 255, 255, 0.08)', isLight: false, btnTextColor: '#ffffff' };
    }

    const isLight = (palette.isLight !== undefined) ? Boolean(palette.isLight) : false;
    const ftueMod = window.CedarFTUE || window.OutpostFTUE;
    const pTokens = (ftueMod && typeof ftueMod.resolvePunnettSquareTokens === 'function')
      ? ftueMod.resolvePunnettSquareTokens(palette.c30, isLight, palette.c10)
      : {
          textPrimary: palette.textPrimary || (isLight ? '#0f172a' : '#fafafa'),
          textSecondary: palette.textSecondary || (isLight ? '#334155' : '#d4d4d8'),
          textMuted: palette.textMuted || (isLight ? '#475569' : '#a1a1aa'),
          panelRowBg: isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.04)'
        };
    const popoutTokens = (ftueMod && typeof ftueMod.resolvePopout3dTokens === 'function')
      ? ftueMod.resolvePopout3dTokens(palette, isLight)
      : {
          bg: palette.popout3dBg || (isLight ? '#e4e4e7' : (palette.c30 || '#18181b')),
          bgHover: palette.popout3dBgHover || (isLight ? '#d4d4d8' : (palette.c30 || '#27272a')),
          shelf: palette.popout3dShelf || palette.c10 || '#71717a',
          border: palette.popout3dBorder || (isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)'),
          borderHover: palette.popout3dBorderHover || palette.c10 || '#71717a',
          color: palette.popout3dColor || (isLight ? '#18181b' : '#fafafa')
        };
    const btnTextColor = palette.btnTextColor || (isLight ? '#ffffff' : '#000000');

    const isRoundedMedia = Boolean(window.projectConfig && window.projectConfig.mediaPreferences && window.projectConfig.mediaPreferences.roundedImages);
    const mediaImgRadius = isRoundedMedia ? '8px' : '0px';
    const mediaInnerRadius = isRoundedMedia ? '7px' : '0px';

    const allDraftsForNav = (typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : ((window.drafts && Array.isArray(window.drafts)) ? window.drafts : []);
    const validCats = (window.projectConfig && Array.isArray(window.projectConfig.categories))
      ? window.projectConfig.categories.filter(c => {
          const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
          if (!val || val.toLowerCase() === 'uncategorized' || val.toLowerCase() === 'general') return false;
          const lower = val.toLowerCase();
          const slug = lower.replace(/\s+/g, '-');
          const catPage = allDraftsForNav.find(d =>
            d.type === 'page' && (
              (d.isCategoryAggregate && (d.categoryAggregate || '').trim().toLowerCase() === lower) ||
              (d.title || '').trim().toLowerCase() === lower ||
              (d.slug || '').trim().toLowerCase() === slug
            )
          );
          if (catPage && (catPage.hidden || catPage.retired)) return false;
          return true;
        })
      : [];

    let compiledNavItemsHtml = '';
    const allPage = allDraftsForNav.find(d => d && (d.id === 'page_all' || d.slug === 'all' || (d.title || '').trim().toLowerCase() === 'all'));
    const isAllHidden = (window.projectConfig && (window.projectConfig.allDisabled === true || window.projectConfig.allEnabled === false)) ||
      (typeof projectConfig !== 'undefined' && projectConfig && (projectConfig.allDisabled === true || projectConfig.allEnabled === false)) ||
      (allPage ? Boolean(allPage.hidden || allPage.retired) : false);

    const allCategoryIdx = (typeof window.projectConfig?.allCategoryIndex === 'number')
      ? window.projectConfig.allCategoryIndex
      : (typeof projectConfig?.allCategoryIndex === 'number' ? projectConfig.allCategoryIndex : 0);

    const navItems = [];

    const navCatItems = validCats.map(c => {
      const catName = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
      const catSlug = encodeURIComponent(catName.toLowerCase().replace(/\s+/g, '-'));
      const matchedDraft = allDraftsForNav.find(d => d && (d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')) && String(d.categoryAggregate || d.title || '').trim().toLowerCase() === catName.toLowerCase());
      return {
        id: matchedDraft ? matchedDraft.id : `page_cat_${catSlug}`,
        slug: catSlug,
        title: catName,
        type: 'category',
        name: catName,
        href: `/${catSlug}/`,
        html: `<a href="/${catSlug}/" class="nav-item">${escapeHtml(catName)}</a>\n        `
      };
    });

    if (!isAllHidden) {
      const clampedIdx = Math.max(0, Math.min(allCategoryIdx, navCatItems.length));
      navCatItems.splice(clampedIdx, 0, {
        id: 'page_all',
        slug: 'all',
        title: 'All',
        type: 'all',
        name: 'All',
        href: '/blog/',
        html: `<a href="/blog/" class="nav-item">All</a>\n        `
      });
    }

    navCatItems.forEach(item => navItems.push(item));

    // Helper for built-in checks
    const isBuiltInDraft = (d) => {
      if (!d) return false;
      const s = (d.slug || '').trim().toLowerCase();
      const t = (d.title || '').trim().toLowerCase();
      const id = (d.id || '').trim().toLowerCase();
      return s === 'about' || t === 'about' || id === 'page_about' ||
             s === 'links' || t === 'links' || id === 'page_links' ||
             s === 'rss' || t === 'rss' || id === 'page_rss' ||
             s === 'all' || t === 'all' || id === 'page_all' ||
             s === 'about-cedar' || id === 'page_about_cedar';
    };

    // 3. Static Pages (User custom static pages & redirects)
    const publishedCustomPages = allDraftsForNav
      .filter(d => d.type === 'page' && !d.hidden && !d.retired && !d.isCategoryAggregate && !isBuiltInDraft(d));
    publishedCustomPages.forEach(p => {
      const pageTitle = (p.title || '').trim();
      const pageSlug = p.slug || '';
      if (pageTitle) {
        let itemHtml = '';
        if (p.isRedirect && (p.redirectUrl || p.url)) {
          const targetUrl = p.redirectUrl || p.url;
          const isExt = /^https?:\/\//i.test(targetUrl);
          const targetAttr = isExt ? 'target="_blank" rel="noopener noreferrer"' : '';
          itemHtml = `<a href="${escapeHtml(targetUrl)}" class="nav-item redirect-nav-link" ${targetAttr}>${escapeHtml(pageTitle)}</a>\n        `;
        } else if (pageSlug) {
          itemHtml = `<a href="/${encodeURIComponent(pageSlug)}/" class="nav-item">${escapeHtml(pageTitle)}</a>\n        `;
        }
        navItems.push({
          id: p.id,
          slug: pageSlug,
          title: pageTitle,
          type: p.isRedirect ? 'redirect' : 'static',
          html: itemHtml
        });
      }
    });

    // 4. About
    const aboutPage = allDraftsForNav.find(d => d && d.type === 'page' && !d.hidden && !d.retired && (d.id === 'page_about' || d.slug === 'about' || (d.title || '').trim().toLowerCase() === 'about'));
    if (aboutPage) {
      const pageTitle = (aboutPage.title || 'About').trim();
      const pageSlug = aboutPage.slug || 'about';
      navItems.push({
        id: aboutPage.id || 'page_about',
        slug: pageSlug,
        title: pageTitle,
        type: 'builtin',
        html: `<a href="/${encodeURIComponent(pageSlug)}/" class="nav-item">${escapeHtml(pageTitle)}</a>\n        `
      });
    }

    // 5. Links
    const linksPage = allDraftsForNav.find(d => d && (d.type === 'page' || d.id === 'page_links') && !d.hidden && !d.retired && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links'));
    if (linksPage) {
      const pageTitle = (linksPage.title || 'Links').trim();
      const pageSlug = linksPage.slug || 'links';
      navItems.push({
        id: linksPage.id || 'page_links',
        slug: pageSlug,
        title: pageTitle,
        type: 'builtin',
        html: `<a href="/${encodeURIComponent(pageSlug)}/" class="nav-item">${escapeHtml(pageTitle)}</a>\n        `
      });
    }

    // 6. RSS
    const isRssEnabled = (typeof resolveProjectRssEnabled === 'function')
      ? resolveProjectRssEnabled()
      : Boolean(window.projectConfig && window.projectConfig.rssEnabled);
    const rssDraft = allDraftsForNav.find(d => d && d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
    const isRssHidden = !isRssEnabled || Boolean(rssDraft && (rssDraft.hidden || rssDraft.retired));
    if (!isRssHidden) {
      navItems.push({
        id: 'page_rss',
        slug: 'rss',
        title: 'RSS',
        type: 'builtin',
        html: `<a href="/rss/" class="nav-item">RSS</a>\n        `
      });
    }

    // Sort navigation items based on pagesSortMode:
    const compilerSortMode = (window.projectConfig && window.projectConfig.pagesSortMode) || (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.pagesSortMode) || 'type';
    if (compilerSortMode === 'alphabetical') {
      navItems.sort((a, b) => (a.title || '').trim().toLowerCase().localeCompare((b.title || '').trim().toLowerCase()));
    } else if (compilerSortMode === 'custom') {
      const customOrder = (window.projectConfig && Array.isArray(window.projectConfig.pagesCustomOrder)) ? window.projectConfig.pagesCustomOrder : (typeof projectConfig !== 'undefined' && Array.isArray(projectConfig?.pagesCustomOrder) ? projectConfig.pagesCustomOrder : []);
      const orderMap = new Map();
      customOrder.forEach((id, idx) => orderMap.set(String(id).toLowerCase(), idx));
      navItems.sort((a, b) => {
        const aKey = (a.id || a.slug || a.title || '').toLowerCase();
        const bKey = (b.id || b.slug || b.title || '').toLowerCase();
        const aIdx = orderMap.has(aKey) ? orderMap.get(aKey) : (a.slug && orderMap.has(a.slug.toLowerCase()) ? orderMap.get(a.slug.toLowerCase()) : 99999);
        const bIdx = orderMap.has(bKey) ? orderMap.get(bKey) : (b.slug && orderMap.has(b.slug.toLowerCase()) ? orderMap.get(b.slug.toLowerCase()) : 99999);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return (a.title || '').localeCompare(b.title || '');
      });
    }

    compiledNavItemsHtml = navItems.map(item => item.html).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${baseHref ? `<base href="${escapeHtml(baseHref)}">\n  ` : ''}<meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(blogSiteName)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta property="og:title" content="${escapeHtml(title)} — ${escapeHtml(blogSiteName)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta name="twitter:title" content="${escapeHtml(title)} — ${escapeHtml(blogSiteName)}">
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  ${isRssEnabled ? `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(blogSiteName)} RSS Feed" href="${siteBase ? `${siteBase}/blog/feed.xml` : '/blog/feed.xml'}">\n  ` : ''}<link rel="icon" type="image/png" href="/icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* ==========================================================================
       Cedar — Base Article Stylesheet (1:1 with Writer View)
       ========================================================================== */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg-primary: ${palette.c60};
      --bg-secondary: ${palette.c30};
      --bg-card: ${palette.c30 || (isLight ? '#f4f4f5' : '#18181b')};
      --bg-surface: ${palette.c30 || (isLight ? '#f4f4f5' : '#18181b')};
      --panel-row-bg: ${pTokens.panelRowBg};
      --text-primary: ${pTokens.textPrimary};
      --text-secondary: ${pTokens.textSecondary};
      --text-prose: ${pTokens.textPrimary};
      --text-muted: ${pTokens.textMuted};
      --text-dim: ${pTokens.textMuted};
      --accent-primary: ${palette.c10};
      --accent-purple: ${palette.c10};
      --accent-pink: ${palette.c10};
      --accent-lavender: ${pTokens.textMuted};
      --accent-rose: ${palette.c10};
      --btn-primary-bg: ${palette.c10};
      --btn-primary-color: ${btnTextColor};
      --category-chip-bg: ${isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.1)'};
      --category-chip-color: ${pTokens.textPrimary};
      --border-subtle: ${palette.border || (isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)')};
      --border-card: ${palette.border || (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.1)')};
      --author-avatar-bg: transparent;
      --author-avatar-color: ${btnTextColor};
      --author-avatar-border: transparent;
      --popout-3d-bg: ${popoutTokens.bg};
      --popout-3d-bg-hover: ${popoutTokens.bgHover};
      --popout-3d-shelf: ${popoutTokens.shelf};
      --popout-3d-border: ${popoutTokens.border};
      --popout-3d-border-hover: ${popoutTokens.borderHover};
      --popout-3d-color: ${popoutTokens.color};
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --font-mono: 'JetBrains Mono', Consolas, Monaco, monospace;
      --container-width: ${containerW}px;
      --article-max-width: 820px;
    }

    html {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-prose);
      font-size: 16px;
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-prose);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
    }

    /* Site Header */
    .site-header {
      border-bottom: none;
      background: ${isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(18, 18, 20, 0.8)'};
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      will-change: transform;
    }

    .site-header.header-hidden {
      transform: translateY(-100%) !important;
    }

    .container {
      width: 100%;
      max-width: var(--container-width);
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    @media (min-width: 1920px) {
      :root {
        font-size: calc(16px * (100vw / 1920));
        --container-width: calc(100vw * (${containerW} / 1920));
        --article-max-width: 820px;
      }
    }

    .site-header {
      min-height: 0;
      height: auto;
      --header-pad-v: ${Math.max(0, padV)}px;
      --header-nav-gap: ${navGap}px;
    }

    .site-header .nav-wrap {
      min-height: 0;
      height: auto;
      border-bottom: 1px solid var(--border-subtle);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: ${mhAlign === 'center' ? 'center' : 'space-between'};
      flex-direction: ${mhAlign === 'right' ? 'row-reverse' : (mhAlign === 'center' ? 'column' : 'row')};
      padding-top: ${Math.max(0, padV)}px;
      padding-bottom: ${Math.max(0, padV)}px;
      box-sizing: border-box;
      ${mhAlign === 'center' ? `gap: ${navGap}px;` : ''}
    }

    .brand-link {
      display: inline-flex;
      align-items: center;
      justify-content: ${mhAlign === 'center' ? 'center' : 'flex-start'};
      gap: ${mhAlign === 'center' ? `${lockupGap}px` : `${Math.round(12 * Math.min(1.8, factor))}px`};
      text-decoration: none;
      color: var(--text-primary);
      flex-direction: ${mhAlign === 'right' ? 'row-reverse' : (mhAlign === 'center' ? 'column' : 'row')};
      text-align: ${mhAlign};
      margin: ${mhAlign === 'center' ? '0 auto' : '0'};
      max-width: 100%;
      user-select: none;
    }

    .header-logo-img {
      width: auto;
      height: ${logoSize}px;
      max-height: ${logoSize}px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 6px;
      flex-shrink: 0;
      margin: ${mhAlign === 'center' ? '0 auto' : '0'};
      display: ${hasValidLogo ? 'block' : 'none'};
    }

    .header-title-text {
      font-size: ${titleFs}rem;
      font-weight: 800;
      color: var(--text-primary);
      text-decoration: none;
      display: ${isTitleEnabled ? 'block' : 'none'};
      line-height: 1.2;
      white-space: nowrap;
      text-align: ${mhAlign};
      margin: ${mhAlign === 'center' ? '0 auto' : '0'};
    }

    .header-tagline-text {
      display: none !important;
    }

    .header-nav-wrap {
      display: ${navCfg.enabled !== false ? 'flex' : 'none'};
      align-items: center;
      justify-content: ${mhAlign === 'center' ? 'center' : 'flex-end'};
      gap: ${Math.round(20 * Math.min(1.6, factor))}px;
      margin: ${mhAlign === 'center' ? '0 auto' : '0'};
      padding: 0;
    }

    @media (max-width: 899px) {
      .container {
        padding-left: 10px !important;
        padding-right: 10px !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      .site-header:not(.header-align-left) .nav-wrap {
        height: auto !important;
        min-height: 0 !important;
        position: static !important;
        padding: var(--header-pad-v, 0.65rem) 10px !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: var(--header-nav-gap, 0.5rem) !important;
      }
      .site-header:not(.header-align-left) .custom-masthead-link {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        max-width: 100% !important;
      }
      .site-header:not(.header-align-left) .header-title-text {
        white-space: normal !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
        text-align: center !important;
        max-width: 100% !important;
      }
      .site-header.header-align-left .nav-wrap {
        height: auto !important;
        min-height: auto !important;
        position: relative !important;
        padding: 0.75rem 10px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.55rem !important;
      }
      .site-header.header-align-left .custom-masthead-link {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        text-align: left !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin: 0 !important;
      }
      .site-header.header-align-left .header-logo-img {
        margin: 0 !important;
        flex-shrink: 0 !important;
      }
      .site-header.header-align-left .header-title-text {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        text-align: left !important;
        margin: 0 !important;
        max-width: 100% !important;
        line-height: 1.2 !important;
      }
      .site-header.header-align-left .header-nav-wrap {
        width: 100% !important;
        justify-content: center !important;
        flex-wrap: wrap !important;
        margin: 0 auto !important;
      }
      .header-logo-img, .header-title-text, .header-tagline-text, .header-nav-wrap {
        position: static !important;
        left: auto !important;
        top: auto !important;
      }

      /* Mobile Post Cards: ALWAYS Image on top, Title underneath, Author & Post Date, NO subtitle or preview text */
      .post-card,
      .post-card.layout-horizontal,
      .posts-list-view .post-card,
      .posts-grid .post-card,
      #all-posts-grid .post-card,
      .article-prose .post-card,
      .article-prose .post-card.layout-horizontal {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.65rem !important;
        padding: 0 !important;
        margin: 0 0 1.5rem 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* 1) Image on top */
      .post-card-img-wrap,
      .post-card.layout-horizontal .post-card-img-wrap,
      .posts-list-view .post-card-img-wrap,
      .article-prose .post-card-img-wrap,
      .article-prose .post-card.layout-horizontal .post-card-img-wrap {
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        aspect-ratio: 16 / 9 !important;
        height: auto !important;
        flex-shrink: 0 !important;
        border-radius: var(--post-image-radius, 0px) !important;
        overflow: hidden !important;
        margin: 0 !important;
      }

      .post-card-img,
      .posts-list-view .post-card-img,
      .article-prose .post-card-img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
      }

      .post-card-body,
      .post-card.layout-horizontal .post-card-body,
      .posts-list-view .post-card-body {
        padding: 0.15rem 0 0 !important;
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        min-width: 0 !important;
        gap: 0.35rem !important;
        justify-content: flex-start !important;
      }
      .article-prose .post-card-body {
        padding: 0.5rem 1rem 0.75rem !important;
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        min-width: 0 !important;
        gap: 0.22rem !important;
        justify-content: flex-start !important;
        align-items: flex-start !important;
      }

      /* 2) Title underneath */
      .post-card-title,
      .post-card.layout-horizontal .post-card-title,
      .posts-list-view .post-card-title {
        order: 1 !important;
        font-size: 1.15rem !important;
        font-weight: 700 !important;
        line-height: 1.35 !important;
        color: var(--text-primary) !important;
        margin: 0 !important;
      }

      /* 3) Author and post date */
      .post-card-meta,
      .post-card.layout-horizontal .post-card-meta,
      .posts-list-view .post-card-meta {
        order: 2 !important;
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 0.45rem !important;
        font-size: 0.8rem !important;
        color: var(--text-dim, #71717a) !important;
        margin: 0 !important;
      }

      .post-card-meta .post-card-author,
      .post-card-meta time,
      .post-card-meta span {
        white-space: nowrap !important;
      }

      /* 4) No subtitle or preview text on feed cards */
      .post-card-desc:not(.article-prose .post-card-desc),
      .post-card-excerpt,
      .post-card-subtitle,
      .posts-list-view .post-card-desc,
      .spotlight-sub {
        display: none !important;
      }

      /* Site Footer on Mobile: Reduced padding, single-line layout with Powered by Cedar on left, copyright on right */
      .site-footer {
        padding: 0.75rem 0 1.5rem !important;
        font-size: 0.8rem !important;
      }
      .footer-wrap {
        padding-top: 1rem !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: space-between !important;
        text-align: left !important;
        gap: 0.5rem !important;
        flex-wrap: nowrap !important;
      }
      .footer-wrap > div {
        flex: none !important;
        text-align: initial !important;
        width: auto !important;
      }
      .footer-left {
        text-align: left !important;
        white-space: nowrap !important;
      }
      .footer-copyright-wrap {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 0.35rem !important;
        text-align: right !important;
        white-space: nowrap !important;
      }
      .footer-copyright-date {
        margin-bottom: 0 !important;
      }
      .footer-copyright-rights {
        white-space: nowrap !important;
      }
    }

    @media (max-width: 440px) {
      .site-footer {
        font-size: 0.72rem !important;
      }
      .footer-wrap {
        gap: 0.25rem !important;
      }
    }

    .brand-logo {
      display: block;
      flex-shrink: 0;
    }

    .brand-gradient {
      background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .nav-links {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.5rem ${Math.round(20 * Math.min(1.6, factor))}px;
      margin: 0;
      padding: 0;
    }

    .nav-item {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 500;
      transition: color 0.15s ease;
      white-space: nowrap !important;
    }

    .nav-item:hover,
    .nav-item.active {
      color: var(--text-primary);
    }

    /* Main Article Wrapper */
    .article-wrapper {
      flex: 1;
      width: 100%;
      padding: 3rem 1.5rem 6rem;
      box-sizing: border-box;
      background-image: 
        radial-gradient(circle at 90% 90%, var(--accent-canvas-glow, rgba(var(--accent-rgb, 139, 92, 246), 0.04)) 0%, transparent 45%);
    }

    .article-container {
      width: 100%;
      max-width: var(--article-max-width);
      margin: 0 auto;
      box-sizing: border-box;
    }

    /* Top Breadcrumb Nav */
    .article-top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      max-width: 100%;
    }

    .back-link {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: color 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .back-link:hover {
      color: var(--accent-lavender);
    }

    .tool-tag {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(139, 92, 246, 0.15);
      color: var(--accent-lavender);
    }

    /* Article Header */
    .article-header {
      margin-bottom: 2rem;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    .article-title {
      font-size: 2.35rem;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.025em;
      color: var(--text-primary, #fff);
      margin-bottom: 0.75rem;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .article-subtitle {
      font-size: 1.15rem;
      line-height: 1.6;
      color: var(--text-muted);
      margin-bottom: 1.5rem;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .article-meta-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-dim);
      flex-wrap: wrap;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .author-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-primary);
      font-weight: 600;
    }

    .author-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: transparent;
      border: none;
      box-shadow: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      object-fit: cover;
      flex-shrink: 0;
      line-height: 1;
    }

    .meta-dot {
      color: rgba(255, 255, 255, 0.2);
    }

    /* Cover Image */
    .article-cover-wrap {
      width: 100%;
      border-radius: 12px;
      overflow: hidden;
      margin: 2rem 0;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }

    .article-cover-img {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Article Body Prose (1:1 with Canvas View) */
    .article-prose {
      font-size: 1.075rem;
      line-height: 1.8;
      color: var(--text-prose);
      width: 100%;
      max-width: 100%;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .article-prose h1, .article-prose h2, .article-prose h3,
    .article-prose h4, .article-prose h5, .article-prose h6 {
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
      max-width: 100%;
    }

    .article-prose h1, .article-prose h2 {
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-top: 2.5rem;
      margin-bottom: 1rem;
      letter-spacing: -0.015em;
      line-height: 1.3;
    }

    .article-prose h3 {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-top: 2rem;
      margin-bottom: 0.85rem;
      letter-spacing: -0.01em;
      line-height: 1.35;
    }

    .article-prose h4 {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--text-secondary, inherit);
      margin-top: 1.5rem;
      margin-bottom: 0.65rem;
    }

    .article-prose p {
      margin-top: 0;
      margin-bottom: 1.25rem;
      line-height: 1.8;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .article-prose strong, .article-prose b {
      font-weight: 700 !important;
      font-synthesis: weight style;
      color: inherit;
    }

    .article-prose em, .article-prose i {
      font-style: italic;
      color: inherit;
    }

    .article-prose u {
      color: inherit;
      text-decoration: underline;
      text-decoration-color: currentColor !important;
      text-underline-offset: 3px;
      text-decoration-thickness: 1.5px;
    }

    .article-prose .cedar-custom-color u,
    .article-prose .cedar-custom-color a:not(.post-card):not(.post-card-link):not(.btn) {
      color: inherit !important;
      text-decoration: underline;
      text-decoration-color: currentColor !important;
      text-underline-offset: 3px;
      text-decoration-thickness: 1.5px;
    }

    .article-prose u .cedar-custom-color,
    .article-prose u span[style*="color"],
    .article-prose a:not(.post-card):not(.post-card-link):not(.btn) .cedar-custom-color,
    .article-prose a:not(.post-card):not(.post-card-link):not(.btn) span[style*="color"] {
      text-decoration: underline !important;
      text-decoration-color: currentColor !important;
      text-underline-offset: 3px;
      text-decoration-thickness: 1.5px;
    }

    .article-prose u:has(> .cedar-custom-color:only-child),
    .article-prose a:not(.post-card):not(.post-card-link):not(.btn):has(> .cedar-custom-color:only-child),
    .article-prose u:has(> a:not(.post-card):not(.post-card-link):not(.btn):only-child) {
      text-decoration: none !important;
    }

    .article-prose s,
    .article-prose del,
    .article-prose strike {
      text-decoration: none;
      background-image: linear-gradient(currentColor, currentColor);
      background-position: 0 60%;
      background-size: 100% 1.5px;
      background-repeat: no-repeat;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
      opacity: 0.88;
    }

    .article-prose mark,
    .article-prose .cedar-highlight {
      background: rgba(250, 204, 21, 0.32);
      color: inherit;
      padding: 0.08em 0.2em;
      margin: 0 -0.05em;
      border-radius: 3px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    .app-theme-light .article-prose mark,
    .app-theme-light .article-prose .cedar-highlight {
      background: rgba(250, 204, 21, 0.48);
      color: inherit;
    }

    .article-prose [data-indent="1"] { padding-left: 2rem; }
    .article-prose [data-indent="2"] { padding-left: 4rem; }
    .article-prose [data-indent="3"] { padding-left: 6rem; }
    .article-prose [data-indent="4"] { padding-left: 8rem; }

    .article-prose a:not(.post-card):not(.post-card-link) {
      color: var(--accent-lavender);
      text-decoration: underline;
      text-decoration-color: currentColor !important;
      text-underline-offset: 3px;
      text-decoration-thickness: 1.5px;
      transition: color 0.2s, opacity 0.2s;
    }

    .article-prose a:not(.post-card):not(.post-card-link):hover {
      color: var(--accent-rose);
      text-decoration-color: currentColor !important;
    }

    .article-prose .cedar-custom-color a:not(.post-card):not(.post-card-link):hover,
    .article-prose a:not(.post-card):not(.post-card-link):has(.cedar-custom-color):hover {
      color: inherit !important;
      opacity: 0.85;
    }

    .article-prose code:not(pre code) {
      font-family: var(--font-mono);
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "calt" 0;
      font-size: 0.88em;
      background: var(--category-chip-bg, rgba(128, 128, 128, 0.16));
      padding: 0.12rem 0.36rem;
      border-radius: 4px;
      border: none;
      color: inherit;
      overflow-wrap: break-word;
      word-break: normal;
      white-space: pre-wrap;
    }

    .article-prose pre {
      background: var(--bg-secondary);
      border: 1px solid var(--border-card);
      border-radius: 8px;
      padding: 1.25rem;
      overflow-x: auto;
      max-width: 100%;
      box-sizing: border-box;
      margin-bottom: 1.5rem;
    }

    .article-prose pre code {
      background: transparent;
      padding: 0;
      color: var(--text-secondary, inherit);
      font-size: 0.9rem;
      font-family: var(--font-mono);
      line-height: 1.6;
    }

    .article-prose blockquote {
      border-left: 3px solid var(--accent-purple);
      background: var(--panel-row-bg);
      padding: 0.85rem 1.25rem;
      margin: 1.5rem 0;
      border-radius: 0 8px 8px 0;
      color: var(--text-secondary, inherit);
      font-style: italic;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .article-prose blockquote p:last-child {
      margin-bottom: 0;
    }

    /* Lists & Tight Rolling Spacing */
    .article-prose ul, .article-prose ol {
      margin-top: 0.5rem;
      margin-bottom: 1.25rem;
      padding-left: 1.5rem;
      box-sizing: border-box;
    }

    .article-prose ul + ul, .article-prose ul + ol,
    .article-prose ol + ol, .article-prose ol + ul {
      margin-top: -1.25rem;
    }

    .article-prose p:has(+ ul), .article-prose p:has(+ ol),
    .article-prose div:has(+ ul), .article-prose div:has(+ ol),
    .article-prose blockquote:has(+ ul), .article-prose blockquote:has(+ ol) {
      margin-bottom: 0.25rem !important;
    }

    .article-prose p + ul, .article-prose p + ol,
    .article-prose div + ul, .article-prose div + ol,
    .article-prose blockquote + ul, .article-prose blockquote + ol {
      margin-top: 0.25rem !important;
    }

    .article-prose li {
      margin-top: 0;
      margin-bottom: 0;
      line-height: 1.8;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .article-prose li:last-child {
      margin-bottom: 0;
    }

    .article-prose hr,
    .article-prose hr.canvas-divider,
    hr.canvas-divider {
      border: 0;
      border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
      margin: 2.25rem 0;
      height: 0;
      box-sizing: border-box;
    }

    .app-theme-light .article-prose hr,
    .app-theme-light .article-prose hr.canvas-divider,
    .app-theme-light hr.canvas-divider {
      border-top-color: var(--border-subtle, rgba(0, 0, 0, 0.12));
    }

    /* Captions & Image Containers */
    .article-container,
    .article-prose {
      width: 100%;
      max-width: var(--article-max-width, 820px);
      margin-left: auto !important;
      margin-right: auto !important;
      box-sizing: border-box;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .article-prose img,
    .article-prose figure,
    .article-prose .captioned-image-container,
    .article-prose .custom-gallery-grid,
    .article-prose .video-wrapper {
      max-width: 100% !important;
      box-sizing: border-box;
    }

    .captioned-image-container {
      margin: 2.25rem 0;
      text-align: center;
      position: relative;
      width: 100%;
      max-width: 100% !important;
      box-sizing: border-box;
    }

    .captioned-image-container figure {
      margin: 0 auto;
      display: inline-block;
      min-width: min(246px, 100%);
      max-width: 100% !important;
      box-sizing: border-box;
    }

    .image-media-wrapper {
      display: inline-block;
      width: 100%;
      max-width: 100% !important;
      box-sizing: border-box;
      border-radius: ${mediaImgRadius};
      overflow: hidden;
      border: 1px solid var(--border-card);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      background: var(--bg-secondary);
    }

    .captioned-image-container img,
    .article-prose img {
      display: block;
      width: 100%;
      max-width: 100% !important;
      height: auto;
      box-sizing: border-box;
      border-radius: ${mediaInnerRadius};
    }

    .captioned-image-container[data-pixelated="true"] img,
    .article-prose img[data-pixelated="true"] {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .captioned-image-container figcaption {
      margin-top: 0.65rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      font-style: italic;
      text-align: center;
    }

    .article-prose button:not(.btn-copy-share-url):not(.btn-share-article):not(.btn-rss-subscribe):not(.popout-3d):not(.pagination-btn):not(.pagination-page-num),
    .figure-hover-actions,
    .block-hover-actions,
    .gallery-item-controls,
    .image-hover-pill-bar,
    .image-add-caption-btn,
    .image-side-add-btn,
    .gallery-slot-placeholder,
    .btn-slot-choose-media,
    .page-block-editor-bar,
    .individual-post-url-bar,
    #canvas-drop-indicator,
    .canvas-drop-indicator {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
    }

    /* Page-Exclusive Blocks (Recent Posts & Individual Post) */
    .page-recent-posts-block,
    .page-individual-post-block {
      margin: 2rem 0;
      width: 100%;
    }
    .individual-post-grid-center {
      max-width: 380px;
      margin: 0 auto;
      width: 100%;
    }
    .recent-posts-grid,
    .page-recent-posts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.25rem;
      width: 100%;
    }
    .recent-posts-list,
    .page-recent-posts-list,
    .posts-list-view {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      width: 100%;
    }
    .article-prose .post-card,
    .article-prose a.post-card {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 100%), var(--popout-3d-bg, var(--bg-card, #18181b)) !important;
      border: 1px solid var(--popout-3d-border, var(--border-card, var(--border-color, rgba(255, 255, 255, 0.12)))) !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column;
      padding: 0 !important;
      margin: 0 !important;
      gap: 0 !important;
      color: var(--popout-3d-color, var(--text-primary)) !important;
      text-decoration: none !important;
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #71717a));
      transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1), background 0.22s ease;
    }
    .app-theme-light .article-prose .post-card,
    .app-theme-light .article-prose a.post-card {
      background: var(--popout-3d-bg, var(--bg-card, #f4f4f5)) !important;
      border-color: var(--popout-3d-border, var(--border-card, rgba(0, 0, 0, 0.12))) !important;
    }
    .article-prose .post-card:hover,
    .article-prose a.post-card:hover {
      border-color: var(--popout-3d-border-hover, var(--popout-3d-shelf, rgba(255, 255, 255, 0.24))) !important;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 100%), var(--popout-3d-bg-hover, var(--popout-3d-bg, var(--bg-card, #18181b))) !important;
      transform: translate(-4px, -4px);
      box-shadow: 5px 5px 0px 0px var(--popout-3d-shelf, var(--accent-primary, #71717a)), 8px 14px 28px rgba(0, 0, 0, 0.32);
      text-decoration: none !important;
    }
    .app-theme-light .article-prose .post-card:hover,
    .app-theme-light .article-prose a.post-card:hover {
      background: var(--popout-3d-bg-hover, var(--popout-3d-bg, var(--bg-card, #f4f4f5))) !important;
    }
    .article-prose .post-card:active,
    .article-prose a.post-card:active {
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #71717a));
    }
    .article-prose .post-card.layout-horizontal {
      flex-direction: row !important;
      align-items: stretch !important;
      padding: 0 !important;
      gap: 0 !important;
    }
    .article-prose .post-card-link {
      text-decoration: none !important;
      color: inherit !important;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .article-prose .post-card.layout-horizontal .post-card-link {
      flex-direction: row;
      align-items: stretch;
    }
    .article-prose .post-card:not(.post-card-no-cover) .post-card-showcase-cluster {
      position: absolute !important;
      inset: 0 !important;
      z-index: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
    }
    .article-prose .post-card:not(.post-card-no-cover) .post-card-showcase-text {
      display: none !important;
    }
    .article-prose .post-card-img-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      flex-shrink: 0;
      background: var(--bg-secondary);
      border-radius: 0 !important;
      border: none !important;
      box-shadow: none !important;
      margin: 0 !important;
    }
    .article-prose .post-card.layout-horizontal .post-card-img-wrap {
      width: 210px !important;
      min-width: 210px !important;
      max-width: 210px !important;
      aspect-ratio: 16 / 10 !important;
      height: auto !important;
      flex-shrink: 0 !important;
    }
    .article-prose .post-card-img-ambient {
      position: absolute;
      inset: 0 !important;
      background-size: cover;
      background-position: center;
      filter: blur(18px) !important;
      opacity: 0.35 !important;
      transform: none !important;
      pointer-events: none;
      z-index: 1 !important;
    }
    .article-prose .post-card-img {
      position: relative;
      z-index: 3 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: cover !important;
      filter: none !important;
      border-radius: 0 !important;
      margin: 0 !important;
      display: block !important;
    }
    .article-prose .post-card-body {
      padding: 0.5rem 1rem 0.75rem !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      align-items: flex-start !important;
      gap: 0.22rem !important;
      flex: 1;
      min-width: 0;
    }
    .article-prose .post-card-title {
      margin: 0 !important;
      padding: 0 !important;
      font-size: 1.02rem !important;
      font-weight: 700 !important;
      line-height: 1.28 !important;
      color: var(--text-primary) !important;
      text-decoration: none !important;
    }
    .article-prose .post-card-desc {
      margin: 0 !important;
      padding: 0 !important;
      flex: 0 0 auto !important;
      font-size: 0.85rem !important;
      color: var(--text-secondary) !important;
      line-height: 1.4 !important;
      text-decoration: none !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .article-prose .post-card-meta,
    .article-prose .post-card-footer {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      flex-wrap: wrap;
      gap: 0.4rem !important;
      font-size: 0.74rem !important;
      line-height: 1.2 !important;
      color: var(--text-muted) !important;
      text-decoration: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .article-prose .post-card-title.external-card-title,
    .external-card-title {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 8px !important;
      -webkit-line-clamp: unset !important;
    }
    .external-card-favicon,
    .external-card-title img,
    .external-card-domain-bar img {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      max-width: 18px !important;
      border-radius: 4px !important;
      margin: 0 !important;
      object-fit: contain !important;
      flex-shrink: 0 !important;
      display: inline-block !important;
      box-shadow: none !important;
      border: none !important;
    }
    .external-card-domain-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.74rem;
      line-height: 1.2;
      color: var(--text-muted, #a1a1aa);
      font-weight: 500;
      letter-spacing: 0.01em;
      margin: 0 !important;
      padding: 0 !important;
    }
    .article-prose .post-card-author {
      color: var(--text-primary) !important;
      font-weight: 500;
    }
    .article-prose .post-card-tag,
    .article-prose .post-card-tag-inline {
      font-size: 0.72rem;
      font-weight: 600;
      background: var(--category-chip-bg) !important;
      color: var(--category-chip-color) !important;
      text-decoration: none !important;
    }
    .article-prose .pagination-bar,
    .article-prose .page-recent-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.75rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border-subtle);
    }
    .article-prose .pagination-pages {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .article-prose .pagination-btn,
    .article-prose .pagination-page-num {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 0.4rem 0.75rem;
      font-size: 0.82rem;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid var(--border-card);
      background: var(--bg-card);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .article-prose .pagination-page-num.is-active {
      background: var(--btn-primary-bg);
      border-color: var(--btn-primary-bg);
      color: var(--btn-primary-color);
    }
    .article-prose .pagination-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Share & RSS Button Blocks */
    .article-share-block,
    .article-rss-block {
      margin: 2rem auto;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      user-select: none;
      box-sizing: border-box;
      outline: none !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }
    .article-share-block[align="left"],
    .article-share-block.align-left,
    .article-rss-block[align="left"],
    .article-rss-block.align-left {
      justify-content: flex-start;
      margin-left: 0;
      margin-right: auto;
    }
    .article-share-block[align="center"],
    .article-share-block.align-center,
    .article-rss-block[align="center"],
    .article-rss-block.align-center {
      justify-content: center;
      margin-left: auto;
      margin-right: auto;
    }
    .article-share-block[align="right"],
    .article-share-block.align-right,
    .article-rss-block[align="right"],
    .article-rss-block.align-right {
      justify-content: flex-end;
      margin-left: auto;
      margin-right: 0;
    }
    /* 3D Pop-Out Utility: .popout-3d */
    .popout-3d,
    .article-prose .popout-3d,
    .article-prose .btn-share-article,
    .article-prose .btn-copy-share-url,
    .article-prose .btn-rss-subscribe {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding: 0.65rem 1.45rem;
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.25;
      border-radius: 10px;
      background: var(--popout-3d-bg, var(--bg-card, #1e293b));
      color: var(--popout-3d-color, var(--text-primary)) !important;
      border: 1px solid var(--popout-3d-border, var(--border-card, rgba(255, 255, 255, 0.14)));
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #71717a));
      cursor: pointer;
      user-select: none;
      text-decoration: none !important;
      transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.22s ease, border-color 0.22s ease;
      outline: none !important;
    }
    .popout-3d svg,
    .article-prose .popout-3d svg,
    .article-prose .btn-share-article svg,
    .article-prose .btn-copy-share-url svg {
      flex-shrink: 0;
      color: currentColor;
    }
    .article-prose .btn-rss-subscribe svg {
      flex-shrink: 0;
      color: #f97316;
    }
    .popout-3d:hover,
    .article-prose .popout-3d:hover,
    .article-prose .btn-share-article:hover,
    .article-prose .btn-copy-share-url:hover,
    .article-prose .btn-rss-subscribe:hover {
      background: var(--popout-3d-bg-hover, var(--popout-3d-bg, var(--bg-card, #1e293b)));
      border-color: var(--popout-3d-border-hover, var(--popout-3d-shelf, rgba(255, 255, 255, 0.24)));
      color: var(--popout-3d-color, var(--text-primary)) !important;
      transform: translate(-4px, -4px);
      box-shadow: 5px 5px 0px 0px var(--popout-3d-shelf, var(--accent-primary, #71717a)), 8px 14px 28px rgba(0, 0, 0, 0.32);
    }
    .popout-3d:active,
    .article-prose .popout-3d:active,
    .article-prose .btn-share-article:active,
    .article-prose .btn-copy-share-url:active,
    .article-prose .btn-rss-subscribe:active {
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #71717a));
    }

    .app-theme-light .popout-3d,
    .app-theme-light .article-prose .popout-3d,
    .app-theme-light .article-prose .btn-share-article,
    .app-theme-light .article-prose .btn-copy-share-url,
    .app-theme-light .article-prose .btn-rss-subscribe {
      background: var(--popout-3d-bg, var(--bg-card, #f4f4f5));
      border-color: var(--popout-3d-border, rgba(0, 0, 0, 0.14));
      color: var(--popout-3d-color, var(--text-primary, #18181b)) !important;
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #18181b));
    }
    .app-theme-light .article-prose .post-card,
    .app-theme-light .article-prose a.post-card {
      background: transparent !important;
      border: 1px solid transparent !important;
      color: var(--popout-3d-color, var(--text-primary, #18181b)) !important;
      transform: translate(0, 0) !important;
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #18181b)) !important;
    }
    .app-theme-light .popout-3d:hover,
    .app-theme-light .article-prose .popout-3d:hover,
    .app-theme-light .article-prose .btn-share-article:hover,
    .app-theme-light .article-prose .btn-copy-share-url:hover,
    .app-theme-light .article-prose .btn-rss-subscribe:hover {
      transform: translate(-4px, -4px);
      box-shadow: 5px 5px 0px 0px var(--popout-3d-shelf, var(--accent-primary, #18181b)), 8px 14px 28px rgba(0, 0, 0, 0.14);
      background: var(--popout-3d-bg-hover, var(--popout-3d-bg, #f4f4f5));
      border-color: var(--popout-3d-border-hover, var(--popout-3d-shelf, rgba(0, 0, 0, 0.24)));
    }
    .app-theme-light .article-prose .post-card:hover,
    .app-theme-light .article-prose a.post-card:hover {
      transform: translate(-4px, -4px);
      box-shadow: 5px 5px 0px 0px var(--popout-3d-shelf, var(--accent-primary, #18181b)), 8px 14px 28px rgba(0, 0, 0, 0.14);
      background: var(--bg-primary) !important;
      border-color: var(--popout-3d-border-hover, var(--popout-3d-shelf, rgba(0, 0, 0, 0.24)));
    }
    .app-theme-light .popout-3d:active,
    .app-theme-light .article-prose .popout-3d:active,
    .app-theme-light .article-prose .btn-share-article:active,
    .app-theme-light .article-prose .btn-copy-share-url:active,
    .app-theme-light .article-prose .btn-rss-subscribe:active,
    .app-theme-light .article-prose .post-card:active,
    .app-theme-light .article-prose a.post-card:active {
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #18181b));
    }

    /* RSS Feed Showcase Bar (.rss-feed-showcase-card) */
    .rss-feed-showcase-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.85rem;
      width: 100%;
      margin: 1.25rem 0 2.25rem;
      padding: 0.75rem 0.85rem 0.75rem 1rem;
      background: var(--bg-secondary, var(--bg-card, #18181b));
      border: 1px solid var(--border-card, var(--border-subtle, rgba(255, 255, 255, 0.14)));
      border-radius: 12px;
      box-sizing: border-box;
    }
    .app-theme-light .rss-feed-showcase-card {
      background: var(--bg-secondary, #f4f4f5);
      border-color: var(--border-card, rgba(0, 0, 0, 0.12));
    }
    .rss-feed-url-display {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
      flex: 1;
    }
    .rss-feed-icon-badge {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: rgba(249, 115, 22, 0.14);
      color: #f97316;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .rss-feed-showcase-card code.rss-live-feed-url {
      font-family: var(--font-mono, monospace);
      font-size: 0.92rem !important;
      font-weight: 500;
      color: var(--text-primary) !important;
      background: transparent !important;
      padding: 0 !important;
      border: none !important;
      white-space: nowrap !important;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: all;
      cursor: text;
    }
    .rss-feed-showcase-card .rss-copy-btn {
      flex-shrink: 0;
      padding: 0.55rem 1.15rem !important;
      font-size: 0.88rem !important;
      border-radius: 9px !important;
    }
    @media (max-width: 600px) {
      .rss-feed-showcase-card {
        flex-direction: column;
        align-items: stretch;
        padding: 0.85rem;
        gap: 0.75rem;
      }
      .rss-feed-showcase-card .rss-copy-btn {
        width: 100%;
        justify-content: center;
      }
    }

    /* Embedded Videos */
    .video-wrapper {
      position: relative;
      padding-bottom: 56.25%;
      height: 0;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid var(--border-card);
      margin: 2.25rem 0;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    .video-wrapper iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }

    /* Gallery Grid - Social Media Standards */
    .custom-gallery-grid {
      position: relative;
      display: grid !important;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin: 2.2rem 0 0.5rem;
      width: 100%;
      max-width: 100% !important;
      border-radius: 12px;
      box-sizing: border-box;
    }

    .custom-gallery-item {
      position: relative;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid var(--border-card);
      background: var(--bg-surface, #121214);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      min-height: 0;
      min-width: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .custom-gallery-item img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      display: block;
      border-radius: inherit;
      box-sizing: border-box;
    }

    .custom-gallery-grid[data-count="1"] {
      grid-template-columns: 1fr !important;
      height: auto;
    }
    .custom-gallery-grid[data-count="1"] .custom-gallery-item {
      aspect-ratio: 16 / 9;
      max-height: 480px;
    }

    .custom-gallery-grid[data-count="2"],
    .custom-gallery-grid:has(> .custom-gallery-item:nth-child(2):last-child),
    .custom-gallery-grid:has(> .custom-gallery-item:nth-child(2)) {
      grid-template-columns: 1fr 1fr !important;
      aspect-ratio: 16 / 9;
      max-height: 420px;
      min-height: 240px;
    }
    .custom-gallery-grid[data-count="2"] .custom-gallery-item,
    .custom-gallery-grid:has(> .custom-gallery-item:nth-child(2)) .custom-gallery-item {
      height: 100%;
    }

    .custom-gallery-grid[data-count="3"] {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      aspect-ratio: 16 / 10;
      max-height: 460px;
      min-height: 280px;
    }
    .custom-gallery-grid[data-count="3"] .custom-gallery-item:nth-child(1) {
      grid-column: 1;
      grid-row: 1 / span 2;
      height: 100%;
    }
    .custom-gallery-grid[data-count="3"] .custom-gallery-item:nth-child(2) {
      grid-column: 2;
      grid-row: 1;
      height: 100%;
    }
    .custom-gallery-grid[data-count="3"] .custom-gallery-item:nth-child(3) {
      grid-column: 2;
      grid-row: 2;
      height: 100%;
    }

    .custom-gallery-grid[data-count="4"] {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      aspect-ratio: 16 / 10;
      max-height: 480px;
      min-height: 300px;
    }
    .custom-gallery-grid[data-count="4"] .custom-gallery-item {
      height: 100%;
    }

    .custom-gallery-grid[data-count="5"],
    .custom-gallery-grid[data-count="more"],
    .custom-gallery-grid:has(.gallery-item-split) {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      aspect-ratio: 16 / 10;
      max-height: 480px;
      min-height: 300px;
    }

    .custom-gallery-item.gallery-item-split {
      grid-column: 2;
      grid-row: 2;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: transparent;
      border: none;
      box-shadow: none;
    }

    .gallery-split-half {
      position: relative;
      flex: 1;
      min-height: 0;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border-card);
      background: var(--bg-surface, #121214);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    .gallery-split-half img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .gallery-split-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(22, 22, 26, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.18);
      user-select: none;
    }

    .gallery-badge-number {
      font-size: 1.35rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }

    .custom-gallery-item.gallery-item-hidden {
      display: none !important;
    }

    .gallery-caption {
      font-size: 0.85rem;
      color: var(--text-dim);
      font-style: italic;
      text-align: center;
      margin-bottom: 2rem;
    }

    /* Navigation Footer */
    .article-nav-footer {
      width: 100%;
      max-width: var(--article-max-width, 820px);
      margin: 3.5rem auto 0;
      padding-top: 2rem;
      border-top: 1px solid var(--border-subtle);
      box-sizing: border-box;
      text-align: center;
    }

    .post-nav-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .post-nav-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      transition: all 0.2s ease;
    }

    .post-nav-card:hover {
      border-color: var(--accent-primary);
      background: var(--bg-secondary);
      transform: translateY(-2px);
    }

    .post-nav-card.next {
      text-align: right;
    }

    .post-nav-dir {
      font-size: 0.75rem;
      color: var(--accent-lavender);
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }

    .post-nav-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
      overflow-wrap: break-word;
      word-break: normal;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.55rem 1.25rem;
      font-size: 0.88rem;
      font-weight: 600;
      font-family: inherit;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .btn-secondary {
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border-card);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .btn-secondary:hover {
      background: var(--bg-secondary);
      border-color: var(--accent-primary);
      color: var(--text-primary);
      transform: translateY(-1px);
    }

    /* Site Footer (Narrow contained layout matching sections) */
    .site-footer {
      background: transparent;
      border-top: none;
      padding: 0.75rem 0 1.5rem;
      margin-top: auto;
      color: var(--text-dim);
      font-size: 0.85rem;
      width: 100%;
    }

    .footer-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      flex-wrap: nowrap;
      gap: 1rem;
      border-top: 1px solid var(--border-subtle);
      padding-top: 1rem;
      max-width: var(--container-width);
      margin: 0 auto;
    }

    .footer-left {
      display: flex;
      align-items: center;
      text-align: left;
      white-space: nowrap;
    }

    .footer-copyright-wrap {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      line-height: 1.4;
      text-align: right;
      white-space: nowrap;
    }

    .footer-copyright-date {
      display: inline-block;
      margin-bottom: 0;
    }

    .footer-copyright-rights {
      display: inline-block;
      white-space: nowrap;
    }

    @media (max-width: 640px) {
      .article-wrapper {
        padding: 1.75rem 1rem 3.5rem;
      }
      .article-title {
        font-size: 1.85rem;
      }
      .post-nav-grid {
        grid-template-columns: 1fr;
      }
      .post-nav-card.next {
        text-align: left;
      }
    }
    /* Dedicated Links (Linktree Alternative) Page Styles */
    body.is-links-page,
    html.is-links-page {
      min-height: 100vh;
      margin: 0;
      padding: 0;
    }

    .links-standalone-main {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      box-sizing: border-box;
      padding: 0;
      margin: 0;
    }

    .linktree-page-wrap {
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      padding: 2.25rem 1.25rem 3.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      z-index: 1;
    }

    .linktree-avatar-wrap {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      overflow: hidden;
      margin-bottom: 1.15rem;
      border: 3px solid var(--border-card, var(--border-color, rgba(255, 255, 255, 0.2)));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      background: var(--bg-card, #1e293b);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .linktree-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .linktree-headline {
      font-size: 1.25rem;
      font-weight: 800;
      text-align: center;
      color: var(--text-primary, #ffffff);
      margin: 0 0 0.35rem;
      line-height: 1.25;
      letter-spacing: -0.015em;
    }

    .linktree-bio {
      font-size: 0.88rem;
      text-align: center;
      color: var(--text-secondary, #a1a1aa);
      max-width: 400px;
      margin: 0 0 2rem;
      line-height: 1.45;
    }

    .linktree-cards-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      margin: 0;
    }

    .linktree-card-btn {
      width: 100%;
      background: var(--popout-3d-bg, var(--bg-card, #1e293b));
      border: 1px solid var(--popout-3d-border, var(--border-card, var(--border-color, rgba(255, 255, 255, 0.14))));
      border-radius: 12px;
      position: relative;
      min-height: 58px;
      padding: 0.85rem 3.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      text-decoration: none;
      color: var(--popout-3d-color, var(--text-primary, #ffffff)) !important;
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--popout-3d-shelf, var(--accent-primary, #71717a));
      transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1), background 0.22s ease, border-color 0.22s ease;
      user-select: none;
      box-sizing: border-box;
    }

    .linktree-card-btn:hover {
      transform: translate(-4px, -4px);
      box-shadow: 5px 5px 0px 0px var(--popout-3d-shelf, var(--accent-primary, #71717a)), 8px 14px 28px rgba(0, 0, 0, 0.32);
      border-color: var(--popout-3d-border-hover, var(--popout-3d-shelf, rgba(255, 255, 255, 0.24)));
      background: var(--popout-3d-bg-hover, var(--popout-3d-bg, var(--bg-card, #1e293b)));
      text-decoration: none !important;
    }

    .linktree-card-btn:active {
      transform: translate(0, 0);
      box-shadow: 0 0 0 0 var(--accent-primary, #71717a);
    }

    .linktree-card-icon {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--panel-inner-bg, rgba(255, 255, 255, 0.05));
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--text-primary);
    }

    .linktree-card-icon svg {
      width: 20px;
      height: 20px;
      display: block;
    }

    .linktree-card-icon img {
      width: 20px;
      height: 20px;
      object-fit: contain;
    }

    .linktree-card-text {
      width: 100%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .linktree-card-title {
      font-weight: 700;
      font-size: 0.95rem;
      line-height: 1.25;
      color: var(--text-primary, #ffffff);
      text-align: center;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .linktree-card-sub {
      font-size: 0.78rem;
      color: var(--text-muted, #a1a1aa);
      line-height: 1.25;
      text-align: center;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .linktree-card-chevron {
      display: none !important;
    }

    .linktree-empty-notice {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.9rem;
      padding: 2rem 0;
    }

    /* Light Theme Support */
    .app-theme-light .linktree-avatar-wrap {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.12);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }
    .app-theme-light .linktree-headline {
      color: var(--text-primary, #18181b);
    }
    .app-theme-light .linktree-bio {
      color: var(--text-secondary, #52525b);
    }
    .app-theme-light .linktree-card-btn {
      background: var(--popout-3d-bg, #e4e4e7);
      color: var(--popout-3d-color, #18181b) !important;
      border-color: var(--popout-3d-border, rgba(0, 0, 0, 0.12));
    }
    .app-theme-light .linktree-card-btn:hover {
      background: var(--popout-3d-bg-hover, #d4d4d8);
      box-shadow: 5px 5px 0px 0px var(--popout-3d-shelf, var(--accent-primary, #18181b)), 8px 14px 28px rgba(0, 0, 0, 0.15);
      border-color: var(--popout-3d-border-hover, var(--popout-3d-shelf, rgba(0, 0, 0, 0.3)));
    }
    .app-theme-light .linktree-card-icon {
      background: rgba(0, 0, 0, 0.05);
    }
    .app-theme-light .linktree-card-title {
      color: #18181b;
    }
    .app-theme-light .linktree-card-sub {
      color: #71717a;
    }

    /* Funky Card Styles */
    .linktree-card-btn.card-style-brutalist {
      border-radius: 4px;
      border: 2.5px solid var(--text-primary, #ffffff);
      box-shadow: 4px 4px 0px 0px var(--accent-primary, #71717a);
      background: var(--bg-card, #1e293b);
    }
    .linktree-card-btn.card-style-brutalist:hover {
      transform: translate(-4px, -4px);
      box-shadow: 8px 8px 0px 0px var(--accent-primary, #71717a), 0 10px 20px rgba(0, 0, 0, 0.35);
      border-color: var(--text-primary, #ffffff);
    }
    .linktree-card-btn.card-style-brutalist:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0px 0px var(--accent-primary, #71717a);
    }

    .linktree-card-btn.card-style-cyber {
      border-radius: 0;
      clip-path: polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px);
      border: 1px solid var(--accent-primary, #38bdf8);
      filter: drop-shadow(0 0 0 transparent);
      box-shadow: none !important;
    }
    .linktree-card-btn.card-style-cyber:hover {
      transform: translate(-4px, -4px);
      filter: drop-shadow(5px 5px 0px var(--accent-primary, #38bdf8)) drop-shadow(0 8px 16px rgba(0, 0, 0, 0.45));
      border-color: var(--accent-primary, #38bdf8);
      box-shadow: none !important;
    }
    .linktree-card-btn.card-style-cyber:active {
      transform: translate(0, 0);
      filter: drop-shadow(0 0 0 transparent);
    }

    .linktree-card-btn.card-style-squiggle {
      border-radius: 255px 25px 225px 25px/25px 225px 25px 255px;
      border: 2px solid var(--border-card, var(--border-color, rgba(255, 255, 255, 0.28)));
    }
    .linktree-card-btn.card-style-squiggle:hover {
      transform: translate(-4px, -4px) rotate(-0.5deg);
      box-shadow: 5px 5px 0px 0px var(--accent-primary, #71717a), 8px 14px 28px rgba(0, 0, 0, 0.32);
    }
    .linktree-card-btn.card-style-squiggle:active {
      transform: translate(0, 0) rotate(0deg);
      box-shadow: 0 0 0 0 var(--accent-primary, #71717a);
    }

    .linktree-card-btn.card-style-ticket {
      border-radius: 8px;
      border: 1.5px dashed var(--border-card, rgba(255, 255, 255, 0.32));
      overflow: visible;
    }
    .linktree-card-btn.card-style-ticket::before,
    .linktree-card-btn.card-style-ticket::after {
      content: '';
      position: absolute;
      top: 50%;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--links-page-bg, var(--bg-primary, #0f172a));
      transform: translateY(-50%);
      border: 1.5px solid var(--border-card, rgba(255, 255, 255, 0.32));
      pointer-events: none;
      z-index: 3;
    }
    .linktree-card-btn.card-style-ticket::before {
      left: -8px;
    }
    .linktree-card-btn.card-style-ticket::after {
      right: -8px;
    }
    .linktree-card-btn.card-style-ticket:hover {
      transform: translate(-4px, -4px);
      box-shadow: 5px 5px 0px 0px var(--accent-primary, #71717a), 8px 14px 28px rgba(0, 0, 0, 0.32);
    }
    .linktree-card-btn.card-style-ticket:active {
      transform: translate(0, 0);
      box-shadow: 0 0 0 0;
    }

    .linktree-card-btn.card-style-glass {
      background: rgba(255, 255, 255, 0.08) !important;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 14px;
    }
    .linktree-card-btn.card-style-glass:hover {
      transform: translate(-4px, -4px);
      background: rgba(255, 255, 255, 0.14) !important;
      border-color: rgba(255, 255, 255, 0.45);
      box-shadow: 5px 5px 0px 0px rgba(255, 255, 255, 0.25), 0 16px 36px rgba(0, 0, 0, 0.35);
    }

    .linktree-pattern-grid {
      background-image: linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px) !important;
      background-size: 26px 26px !important;
    }
    .linktree-pattern-dots {
      background-image: radial-gradient(circle, rgba(255, 255, 255, 0.14) 1.5px, transparent 1.5px) !important;
      background-size: 20px 20px !important;
    }
    .linktree-pattern-stripes {
      background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.035) 10px, transparent 10px, transparent 20px) !important;
    }

    .app-theme-light .linktree-card-btn.card-style-brutalist {
      border-color: #18181b;
      box-shadow: 4px 4px 0px 0px #18181b;
      background: var(--popout-3d-bg, #e4e4e7);
    }
    .app-theme-light .linktree-card-btn.card-style-brutalist:hover {
      background: var(--popout-3d-bg-hover, #d4d4d8);
      box-shadow: 8px 8px 0px 0px #18181b, 0 10px 20px rgba(0, 0, 0, 0.15);
    }
    .app-theme-light .linktree-card-btn.card-style-cyber {
      border-color: #0284c7;
    }
    .app-theme-light .linktree-card-btn.card-style-cyber:hover {
      filter: drop-shadow(5px 5px 0px #0284c7) drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15));
    }
    .app-theme-light .linktree-card-btn.card-style-squiggle {
      border-color: rgba(0, 0, 0, 0.2);
      background: var(--popout-3d-bg, #e4e4e7);
    }
    .app-theme-light .linktree-card-btn.card-style-squiggle:hover {
      background: var(--popout-3d-bg-hover, #d4d4d8);
      box-shadow: 5px 5px 0px 0px #18181b, 8px 14px 28px rgba(0, 0, 0, 0.12);
    }
    .app-theme-light .linktree-card-btn.card-style-ticket {
      border-color: rgba(0, 0, 0, 0.2);
      background: var(--popout-3d-bg, #e4e4e7);
    }
    .app-theme-light .linktree-card-btn.card-style-ticket:hover {
      background: var(--popout-3d-bg-hover, #d4d4d8);
    }
    .app-theme-light .linktree-card-btn.card-style-ticket::before,
    .app-theme-light .linktree-card-btn.card-style-ticket::after {
      background: var(--links-page-bg, #ffffff);
      border-color: rgba(0, 0, 0, 0.2);
    }
    .app-theme-light .linktree-card-btn.card-style-glass {
      background: rgba(255, 255, 255, 0.75) !important;
      border-color: rgba(0, 0, 0, 0.12);
    }
    .app-theme-light .linktree-card-btn.card-style-glass:hover {
      box-shadow: 5px 5px 0px 0px rgba(0, 0, 0, 0.2), 0 16px 36px rgba(0, 0, 0, 0.12);
      border-color: rgba(0, 0, 0, 0.25);
    }

    .app-theme-light .linktree-pattern-grid {
      background-image: linear-gradient(rgba(0, 0, 0, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.06) 1px, transparent 1px) !important;
    }
    .app-theme-light .linktree-pattern-dots {
      background-image: radial-gradient(circle, rgba(0, 0, 0, 0.1) 1.5px, transparent 1.5px) !important;
    }
    .app-theme-light .linktree-pattern-stripes {
      background-image: repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.03) 10px, transparent 10px, transparent 20px) !important;
    }

  </style>${(draft.customCss && typeof draft.customCss === 'string' && draft.customCss.trim()) ? `\n  <style id="cedar-custom-css">\n${draft.customCss}\n  </style>` : ''}
</head>
<body${isLinks ? ' class="is-links-page links-standalone-page"' : ''}>

  <!-- Site Header -->
  ${isLinks ? '' : `<header class="site-header header-align-${mhAlign}">
    <div class="container nav-wrap">
      <a href="${blogHomeHref}" class="brand-link custom-masthead-link">
        ${blogLogo ? `<img class="header-logo-img" src="${escapeHtml(blogLogo)}" alt="" onerror="this.style.display='none';">` : ''}
        <span class="header-title-text">${escapeHtml(blogSiteName)}</span>
        <span class="header-tagline-text">${escapeHtml(blogTagline)}</span>
      </a>
      <nav class="nav-links header-nav-wrap">
        ${compiledNavItemsHtml}
      </nav>
    </div>
  </header>`}

  <!-- Article Main -->
  ${isLinks ? `
  <main class="links-standalone-main ${escapeHtml(linksPatternClass)}" style="${linksInlineBgStyle}">
${proseHtml}
  </main>
  ` : `
  <div class="article-wrapper">
    <main class="article-container">
      
      <!-- Top Navigation Breadcrumb -->
      <div class="article-top-nav">
        <a href="${blogHomeHref}" class="back-link">&larr; Back to all articles</a>
      </div>

      <!-- Article Header -->
      ${(!showTitle && !showSubtitle && isPage) ? '' : `<header class="article-header">
        ${showTitle ? `<h1 class="article-title">${escapeHtml(title)}</h1>` : ''}
        ${(showSubtitle && subtitle) ? `<p class="article-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        
        ${isPage ? '' : `<div class="article-meta-bar">
          <div class="author-pill">
            ${authorAvatarHtml}
            <span>${escapeHtml(bylineText)}</span>
          </div>
          <span class="meta-dot">&bull;</span>
          ${metaDateHtml}
          <span class="meta-dot">&bull;</span>
          <span>${readTime}</span>
        </div>`}
      </header>`}

      <!-- Article Body Prose -->
      <article class="article-prose">
${proseHtml}
      </article>

      <!-- Article Navigation Footer -->
      <footer class="article-nav-footer">
${prevNextHtml}        <div style="text-align: center; display: flex; justify-content: center; width: 100%;">
          <a href="${blogHomeHref}" class="btn btn-secondary">&larr; See More Posts</a>
        </div>
      </footer>

    </main>
  </div>
  `}

  <!-- Site Footer -->
  ${isLinks ? '' : `<footer class="site-footer">
    <div class="container footer-wrap">
      <div class="footer-left">
        <a href="/about-cedar/" style="color: var(--text-muted); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"><span>Powered by <strong style="color: var(--text-primary);">Cedar</strong></span><img src="/logo.png" alt="" style="width: 1.15em; height: 1.15em; object-fit: contain; display: block; flex-shrink: 0;"></a>
      </div>
      <div class="footer-copyright-wrap">
        <span class="footer-copyright-date">&copy; <span id="current-year">${blogCreatedYear}</span></span>
        <span class="footer-copyright-rights">All rights reserved.</span>
      </div>
    </div>
  </footer>`}

  <script>
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = '${blogCreatedYear}';

    // Mobile headroom scroll handler (hides header when scrolling down, reveals on scroll up)
    (function() {
      var lastScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      var ticking = false;
      var header = document.querySelector('.site-header');
      if (!header) return;

      window.addEventListener('scroll', function() {
        if (!ticking) {
          window.requestAnimationFrame(function() {
            var currentScrollY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
            var scrollDelta = currentScrollY - lastScrollY;

            if (window.innerWidth <= 899) {
              if (currentScrollY <= 15) {
                header.classList.remove('header-hidden');
              } else if (scrollDelta > 6 && currentScrollY > 60) {
                header.classList.add('header-hidden');
              } else if (scrollDelta < -6) {
                header.classList.remove('header-hidden');
              }
            } else {
              header.classList.remove('header-hidden');
            }

            lastScrollY = currentScrollY;
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    })();
  </script>
</body>
</html>
`;
  }

  // 2. Blog Card HTML for blog/index.html grid
  function generateBlogCardHtml(draft) {
    const slug = draft.slug || 'untitled';
    const title = draft.title || 'Untitled';
    const subtitle = draft.subtitle || '';
    const safeFormatDateDisplay = (d) => (typeof formatDateDisplay === 'function' ? formatDateDisplay(d) : (typeof formatDate === 'function' ? formatDate(d) : (d || '')));
    const dateDisplay = safeFormatDateDisplay(draft.date);
    const readTime = calculateReadTime(draft.markdown, draft.overrideReadTime);
    const mutedColor = (typeof getMutedCoverColor === 'function')
      ? getMutedCoverColor(draft.id || slug || title)
      : '#27272a';
    const coverImage = (typeof getPostFeaturedImage === 'function' ? getPostFeaturedImage(draft) : '') || draft.coverImage || draft.featuredImage || '';

    const rawAuths = (Array.isArray(draft.authors) && draft.authors.length > 0) ? draft.authors : [draft.authorName || 'Staff'];
    const authName = rawAuths.map(a => a?.name || a).join(', ');

    const categoryEyebrowHtml = '';
    const cfgDesign = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) || (typeof window !== 'undefined' && window.projectConfig && window.projectConfig.design) || {};
    const swooshType = cfgDesign.showcaseSwoosh || cfgDesign.backgroundSwoosh || 'jazz_cup';
    const swooshSvgHtml = swooshType === 'none'
      ? ''
      : ((typeof window !== 'undefined' && typeof window.buildShowcaseSwooshSvg === 'function')
          ? window.buildShowcaseSwooshSvg(swooshType, draft.id || slug || title, draft)
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

    const noCoverClass = !coverImage ? ' post-card-no-cover' : '';
    const coverLayerHtml = coverImage
      ? `      <div class="post-card-img-ambient" style="background-image: url('${escapeHtml(coverImage)}');"></div>
      <img src="${escapeHtml(coverImage)}" alt="" class="post-card-img" loading="lazy" onerror="const c=this.closest('.post-card');if(c)c.classList.add('post-card-no-cover');this.remove();">`
      : '';

    return `  <a href="/blog/published/${slug}/" class="post-card${noCoverClass}">
    <div class="post-card-img-wrap post-card-showcase-wrap" style="background-color: ${mutedColor}; aspect-ratio: 16 / 9;">
      <div class="post-card-showcase-cluster">
        ${swooshSvgHtml}
        <div class="post-card-showcase-text">
          <h3 class="post-card-title post-card-showcase-title">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="post-card-desc">${escapeHtml(subtitle)}</p>` : ''}
        </div>
      </div>
${coverLayerHtml ? coverLayerHtml + '\n' : ''}    </div>
    <div class="post-card-body post-card-showcase-body">
${categoryEyebrowHtml}      <h3 class="post-card-title post-card-standard-title">${escapeHtml(title)}</h3>
      <div class="post-card-meta">
        <span class="post-card-author">By ${escapeHtml(authName)}</span>
        <span>&bull;</span>
        <time datetime="${draft.date}">${dateDisplay}</time>
        <span>&bull;</span>
        <span>${readTime}</span>
      </div>
      ${subtitle ? `<p class="post-card-desc">${escapeHtml(subtitle)}</p>` : ''}
    </div>
  </a>`;
  }

  // 3. Featured Post Card for blog/index.html banner
  function generateFeaturedCardHtml(draft) {
    const slug = draft.slug || 'untitled';
    const title = draft.title || 'Untitled';
    const subtitle = draft.subtitle || '';
    const coverImage = draft.coverImage || '';
    const dateDisplay = (typeof formatDateDisplay === 'function' ? formatDateDisplay(draft.date) : (typeof formatDate === 'function' ? formatDate(draft.date) : (draft.date || '')));
    const readTime = calculateReadTime(draft.markdown, draft.overrideReadTime);
    const mutedColor = (typeof getMutedCoverColor === 'function')
      ? getMutedCoverColor(draft.id || slug || title)
      : '#27272a';

    let imgBlock = '';
    if (coverImage) {
      imgBlock = `    <div class="featured-post-img-wrap" style="background-color: ${mutedColor}; aspect-ratio: 16 / 9;">
      <img src="${escapeHtml(coverImage)}" alt="" class="featured-post-img" loading="eager" onerror="if(this.parentElement) this.parentElement.style.display='none';">
    </div>`;
    }

    return `  <a href="/blog/published/${slug}/" class="featured-post-card">
${imgBlock ? imgBlock + '\n' : ''}    <div class="featured-post-content">
      <span class="featured-badge" style="color: #ec4899;">★ Featured Post</span>
      <h2 class="featured-post-title">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="featured-post-desc">${escapeHtml(subtitle)}</p>` : ''}
      <div class="post-card-meta">
        <span>${dateDisplay}</span>
        <span>&bull;</span>
        <span>${readTime}</span>
      </div>
    </div>
  </a>`;
  }

  // 4. Markdown + Frontmatter export
  function generateMarkdownWithFrontmatter(draft) {
    const cats = Array.isArray(draft.categories) && draft.categories.length > 0 ? draft.categories : (draft.tag ? [draft.tag] : ['Uncategorized']);
    const pubDate = draft.date || draft.publishedDate || '';
    const editDateLine = draft.editedDate ? `\nedited_date: "${draft.editedDate}"` : '';
    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')
      ? resolveProjectDefaultAuthor()
      : ((typeof projectConfig !== 'undefined' && projectConfig && projectConfig.defaultAuthor) || '');
    const authorsList = [defaultAuth || draft.authorName || (Array.isArray(draft.authors) && draft.authors[0]) || 'Staff'];
    const authorName = (typeof window.formatAuthorsString === 'function')
      ? window.formatAuthorsString(authorsList)
      : (draft.authorName || authorsList.join(', ') || defaultAuth);
    const byline = (typeof window.formatAuthorsByline === 'function')
      ? window.formatAuthorsByline(authorsList)
      : `By ${authorName}`;
    const resolvedDomain = (window.resolveProjectDomain ? window.resolveProjectDomain() : ((window.projectConfig && window.projectConfig.domain) || (typeof localStorage !== 'undefined' ? localStorage.getItem('cedar_user_domain') : '') || '')).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const siteBase = resolvedDomain ? `https://${resolvedDomain}` : '';
    const isPage = draft.type === 'page';
    const relPath = isPage ? `/pages/published/${draft.slug}/` : `/blog/published/${draft.slug}/`;
    const canonicalFrontmatter = siteBase ? `${siteBase}${relPath}` : relPath;
    return `---
title: "${draft.title.replace(/"/g, '\\"')}"
subtitle: "${(draft.subtitle || '').replace(/"/g, '\\"')}"
slug: "${draft.slug}"
canonical: "${canonicalFrontmatter}"
date: "${draft.date}"
published_date: "${pubDate}"${editDateLine}
tag: "${draft.tag || cats[0] || 'Uncategorized'}"
categories: ${JSON.stringify(cats)}
keywords: "${(draft.keywords || '').replace(/"/g, '\\"')}"
author: "${authorName}"
authors: ${JSON.stringify(authorsList)}
byline: "${byline}"
cover_image: "${draft.coverImage || ''}"
---

${draft.markdown || ''}`;
  }

  // 4.5 RSS 2.0 Syndication Feed Generator
  function generateRssFeedXml(publishedPosts, config) {
    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : (window.projectConfig || {}));
    const siteTitle = cfg.name || (cfg.design && cfg.design.branding && cfg.design.branding.siteTitle) || 'Cedar';
    const siteDesc = cfg.description || cfg.subtitle || (cfg.design && cfg.design.branding && cfg.design.branding.tagline) || siteTitle;
    const rawDomain = (cfg.domain || cfg.detectedDomain || (typeof resolveProjectDomain === 'function' ? resolveProjectDomain() : (typeof localStorage !== 'undefined' ? localStorage.getItem('cedar_user_domain') : '')) || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const domain = (rawDomain && rawDomain !== '[your domain]' && !rawDomain.includes('[') && !/^localhost(?::\d+)?$/i.test(rawDomain)) ? rawDomain : '';
    const autoBase = (typeof window !== 'undefined' && typeof window.resolveAutoDetectedSiteBaseUrl === 'function')
      ? window.resolveAutoDetectedSiteBaseUrl(cfg)
      : '';
    const siteUrl = domain ? `https://${domain}` : (autoBase || 'http://localhost:8080');
    const feedUrl = `${siteUrl}/feed.xml`;
    const fallbackDateIso = cfg.lastUpdated || cfg.createdAt || '2026-01-01T00:00:00.000Z';

    const escapeCdata = (str) => String(str || '').replace(/\]\]>/g, ']]]]><![CDATA[>');

    const toAbsoluteAssetUrl = (rawSrc, slug, postImgs) => {
      if (!rawSrc || typeof rawSrc !== 'string') return '';
      const trimmed = rawSrc.trim();
      if (!trimmed || trimmed.startsWith('blob:')) return '';
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      if (trimmed.startsWith('data:')) {
        if (Array.isArray(postImgs)) {
          const foundData = postImgs.find(im => im && (im.dataUrl === trimmed || im.src === trimmed) && (im.relativePath || im.filename));
          if (foundData) {
            const rel = foundData.relativePath || `/blog/published/${slug}/${foundData.filename}`;
            return `${siteUrl}${rel.startsWith('/') ? '' : '/'}${rel}`;
          }
        }
        return `${siteUrl}/blog/published/${slug}/${slug}-cover.webp`;
      }
      const cleanName = trimmed.split('?')[0].split('#')[0].split('/').pop().split('\\').pop();
      if (cleanName && Array.isArray(postImgs)) {
        const matched = postImgs.find(im => im && ((im.filename && im.filename === cleanName) || (im.relativePath && (im.relativePath === trimmed || im.relativePath.endsWith('/' + cleanName)))));
        if (matched && matched.relativePath) {
          return `${siteUrl}${matched.relativePath.startsWith('/') ? '' : '/'}${matched.relativePath}`;
        }
        if (matched && matched.filename) {
          return `${siteUrl}/blog/published/${slug}/${matched.filename}`;
        }
      }
      if (trimmed.startsWith('/')) {
        return `${siteUrl}${trimmed}`;
      }
      return `${siteUrl}/blog/published/${slug}/${trimmed.replace(/^\.?\//, '')}`;
    };

    const guessImageMime = (url) => {
      const ext = String(url || '').split('?')[0].split('#')[0].split('.').pop().toLowerCase();
      if (ext === 'png') return 'image/png';
      if (ext === 'gif') return 'image/gif';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'svg') return 'image/svg+xml';
      if (ext === 'avif') return 'image/avif';
      return 'image/jpeg';
    };

    const isSameImageAsset = (srcA, srcB) => {
      if (!srcA || !srcB) return false;
      if (srcA === srcB) return true;
      const cleanA = String(srcA).split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
      const cleanB = String(srcB).split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
      if (cleanA === cleanB) return true;
      const fileA = cleanA.split('/').pop();
      const fileB = cleanB.split('/').pop();
      return Boolean(fileA && fileB && fileA === fileB && !fileA.startsWith('data:') && !fileA.startsWith('blob:'));
    };

    const allItems = [];
    (publishedPosts || []).forEach(p => {
      const slug = p.slug || generateSlug(p.title || 'untitled');
      const postUrl = `${siteUrl}/blog/published/${slug}/`;
      if (!p.rssGuid || (domain && p.rssGuid.startsWith('http://localhost'))) {
        p.rssGuid = postUrl;
      }
      const postDateRaw = p.publishedAt || p.publishedDate || p.createdAt || p.date || fallbackDateIso;
      if (!p.rssPubDate) {
        p.rssPubDate = new Date(postDateRaw).toUTCString();
      }
      const pubDate = p.rssPubDate;
      const guid = p.rssGuid;
      const timestamp = new Date(postDateRaw).getTime() || 0;
      const author = cfg.defaultAuthor || p.authorName || (Array.isArray(p.authors) && p.authors[0]) || 'Staff';
      const desc = p.subtitle || p.customDesc || (p.markdown ? p.markdown.replace(/[#*>`~\[\]]/g, '').substring(0, 280).trim() : '');
      const cat = p.tag || (p.categories && p.categories[0]) || 'Uncategorized';
      const postImgs = Array.isArray(p.images) ? p.images : [];

      // Resolve Featured / Cover Image to absolute URL
      const rawCover = (p.coverImage || p.featuredImage || p.thumbnail || '').trim();
      const coverUrl = rawCover ? toAbsoluteAssetUrl(rawCover, slug, postImgs) : '';

      // Compile full article HTML and convert relative URLs & interactive blocks for RSS readers
      const rawProse = (p.proseHtml && p.proseHtml.trim()) ? p.proseHtml : parseMarkdownToHtml(p.markdown || '');
      let fullHtml = prepareProseForPublish(rawProse, p, { preferStaticPaths: true });
      let coverAlreadyInBody = false;

      if (typeof DOMParser !== 'undefined' && fullHtml) {
        try {
          const doc = new DOMParser().parseFromString(`<body>${fullHtml}</body>`, 'text/html');
          const body = doc.body;

          // Remove interactive web-only widgets (Share / Subscribe / RSS copy bars) from syndication feed body
          body.querySelectorAll('.article-share-block, .article-rss-block, .rss-feed-showcase-card, [data-block-type="share"], [data-block-type="rss"], [data-block-type="rss-box"], .gallery-split-badge').forEach(el => el.remove());

          // Unhide any +N gallery images so RSS readers display all images in a gallery
          body.querySelectorAll('.gallery-item-hidden').forEach(el => {
            el.classList.remove('gallery-item-hidden');
            el.style.removeProperty('display');
          });

          // Rewrite all image sources to absolute URLs and clean up editor attributes
          body.querySelectorAll('img').forEach(img => {
            const origSrc = img.getAttribute('data-original-src') || '';
            const imgName = img.getAttribute('data-img-name') || '';
            const curSrc = img.getAttribute('src') || '';
            const candidate = (imgName && imgName !== 'img') ? imgName : ((!origSrc.startsWith('data:') && !origSrc.startsWith('blob:') && origSrc) ? origSrc : curSrc);
            const absSrc = toAbsoluteAssetUrl(candidate || curSrc, slug, postImgs);
            if (absSrc) {
              img.setAttribute('src', absSrc);
            }
            if (coverUrl && (isSameImageAsset(absSrc, coverUrl) || isSameImageAsset(curSrc, rawCover) || isSameImageAsset(origSrc, rawCover))) {
              coverAlreadyInBody = true;
            }
            img.removeAttribute('data-original-src');
            img.removeAttribute('data-img-name');
            img.removeAttribute('draggable');
          });

          // Convert YouTube embeds into clickable fallback links + iframe for RSS reader compatibility
          body.querySelectorAll('.video-wrapper').forEach(wrapper => {
            const iframe = wrapper.querySelector('iframe');
            if (iframe && iframe.src) {
              const ytId = extractYouTubeId(iframe.src);
              if (ytId) {
                const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
                const thumbUrl = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
                const pEl = doc.createElement('p');
                pEl.innerHTML = `<a href="${watchUrl}" target="_blank" rel="noopener noreferrer"><img src="${thumbUrl}" alt="Watch on YouTube" style="max-width:100%;height:auto;border-radius:8px;" /><br/>▶ Watch video on YouTube</a>`;
                wrapper.replaceWith(pEl);
              }
            }
          });

          // Rewrite relative anchor links to absolute site URLs
          body.querySelectorAll('a[href]').forEach(a => {
            const href = (a.getAttribute('href') || '').trim();
            if (href && href.startsWith('/') && !href.startsWith('//')) {
              a.setAttribute('href', `${siteUrl}${href}`);
            }
          });

          fullHtml = body.innerHTML.trim();
        } catch (e) {}
      }

      // Prepend subtitle lead and featured cover image if not already in the article body
      let compositeHtml = '';
      if (p.subtitle && p.showSubtitle !== false) {
        compositeHtml += `<p><em>${escapeHtml(p.subtitle)}</em></p>\n`;
      }
      if (coverUrl && !coverAlreadyInBody) {
        compositeHtml += `<figure><img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(p.title || 'Featured Image')}" style="max-width:100%;height:auto;" /></figure>\n`;
      }
      compositeHtml += fullHtml || (desc ? `<p>${escapeHtml(desc)}</p>` : '');

      const mediaTags = coverUrl
        ? `\n      <enclosure url="${escapeHtml(coverUrl)}" length="0" type="${guessImageMime(coverUrl)}"/>\n      <media:content url="${escapeHtml(coverUrl)}" medium="image" type="${guessImageMime(coverUrl)}"/>\n      <media:thumbnail url="${escapeHtml(coverUrl)}"/>`
        : '';

      allItems.push({
        timestamp,
        xml: `    <item>
      <title><![CDATA[${escapeCdata(p.title || 'Untitled')}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <author><![CDATA[${escapeCdata(author)}]]></author>
      <dc:creator><![CDATA[${escapeCdata(author)}]]></dc:creator>
      <category><![CDATA[${escapeCdata(cat)}]]></category>${mediaTags}
      <description><![CDATA[${escapeCdata(desc || compositeHtml)}]]></description>
      <content:encoded><![CDATA[${escapeCdata(compositeHtml)}]]></content:encoded>
    </item>`
      });
    });

    allItems.sort((a, b) => b.timestamp - a.timestamp);
    const lastBuildDate = (allItems.length > 0 && allItems[0].timestamp > 0)
      ? new Date(allItems[0].timestamp).toUTCString()
      : new Date(fallbackDateIso).toUTCString();
    const itemsXml = allItems.map(item => item.xml).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title><![CDATA[${escapeCdata(siteTitle)}]]></title>
    <link>${siteUrl}/blog/</link>
    <description><![CDATA[${escapeCdata(siteDesc)}]]></description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>Cedar Static Engine</generator>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;
  }

  // 3.5 Generate 1:1 Site Shell HTML (Identical to preview.html minus preview subpath)
  function generateBlogHomeHtml(publishedPosts, config, options = {}) {
    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || (typeof window !== 'undefined' ? window.projectConfig : {}) || {};
    const brand = (cfg.design && cfg.design.branding) || {};
    const siteTitle = brand.siteTitle || cfg.name || cfg.domain || 'Cedar';
    const tagline = (brand.tagline !== undefined && brand.tagline !== null) ? brand.tagline : (cfg.subtitle || '');
    const defaultTitle = `Home — ${siteTitle}`;
    const pageTitle = options.pageTitle || defaultTitle;
    const siteDesc = options.metaDesc || cfg.description || tagline || `Published on ${siteTitle}`;
    const isRssEnabled = Boolean(cfg.rssEnabled);
    const resolvedDomain = (typeof window !== 'undefined' && window.resolveProjectDomain ? window.resolveProjectDomain() : (cfg.domain || '')).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const siteBase = resolvedDomain ? `https://${resolvedDomain}` : '';
    const canonicalPath = (options.canonicalPath || '/').replace(/^\/+/, '');
    const canonicalUrl = siteBase ? `${siteBase}/${canonicalPath}` : `/${canonicalPath}`;
    const createdYear = cfg.createdYear || (cfg.createdAt ? new Date(cfg.createdAt).getFullYear() : new Date().getFullYear());
    const buildStamp = options.buildStamp || '4.6.30';
    const is404 = Boolean(options.is404);
    const cleanCanonForDepth = (options.canonicalPath || '').replace(/^\/+|\/+$/g, '');
    const pathDepth = (!is404 && cleanCanonForDepth) ? cleanCanonForDepth.split('/').filter(Boolean).length : 0;
    const relRoot = pathDepth > 0 ? '../'.repeat(pathDepth) : './';
    const rawTabLogo = (brand.tabLogo && brand.tabLogo !== 'icon.png' && brand.tabLogo !== '/icon.png') ? String(brand.tabLogo).trim() : '';
    const initialFaviconHref = rawTabLogo
      ? (/^(data:|blob:|https?:\/\/)/i.test(rawTabLogo) ? rawTabLogo : `${relRoot}${rawTabLogo.replace(/^\/+/, '')}?v=${buildStamp}`)
      : 'data:,';
    const rssFeedHref = siteBase ? `${siteBase}/blog/feed.xml` : `${relRoot}blog/feed.xml`;
    const baseTagScript = is404
      ? `  <script>(function(){try{var b=document.createElement('base'),h=location.hostname||'',p=location.pathname||'/';if(/\\.github\\.io$/i.test(h)){var segs=p.split('/').filter(Boolean),s0=segs[0]||'',known=${JSON.stringify(options.knownRootRoutes || ['blog','posts','post','pages','page','author','authors','category','categories','about-cedar','about','links','rss','notes','note'])};b.href=(s0&&known.indexOf(s0.toLowerCase())===-1)?('/'+s0+'/'):'/';}else{b.href='/';}document.head.appendChild(b);}catch(e){}})();</script>\n`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
${baseTagScript}  <title id="page-title">${escapeHtml(pageTitle)}</title>
  <meta name="description" id="meta-description" content="${escapeHtml(siteDesc)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(siteDesc)}">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(siteDesc)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" type="image/png" id="site-favicon" href="${escapeHtml(initialFaviconHref)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet">
  ${isRssEnabled ? `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteTitle)} RSS Feed" href="${escapeHtml(rssFeedHref)}" id="rss-link-posts">` : `<link rel="alternate" type="application/rss+xml" title="Recent Posts RSS Feed" href="${escapeHtml(rssFeedHref)}" id="rss-link-posts" style="display:none;">`}
  <!-- Modular Site Stylesheets (1:1 with Cedar Preview) -->
  <link rel="stylesheet" href="${relRoot}css/fonts.css?v=${buildStamp}">
  <link rel="stylesheet" href="${relRoot}css/preview/theme.css?v=${buildStamp}">
  <link rel="stylesheet" href="${relRoot}css/preview/blocks.css?v=${buildStamp}">
  <link rel="stylesheet" href="${relRoot}css/preview/reader.css?v=${buildStamp}">
  <link rel="stylesheet" href="${relRoot}css/preview/gallery.css?v=${buildStamp}">
</head>
<body>

  <!-- Site Header -->
  <header class="site-header">
    <div class="container nav-wrap">
      <a href="${relRoot}" class="brand-link" id="header-brand-link">
        <img src="" alt="Logo" class="brand-logo-img" id="header-logo" style="display: none;">
        <div class="brand-text">
          <span class="brand-name" id="header-title">${escapeHtml(siteTitle)}</span>
          <span class="brand-tagline" id="header-tagline" style="display: none !important;">${escapeHtml(tagline)}</span>
        </div>
      </a>
      <button type="button" id="header-mobile-search-btn" class="header-mobile-search-btn" title="Search" aria-label="Search">
        <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="1.75 1.75 20.5 20.5" style="display: block;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
      </button>
      <nav style="display: flex; align-items: center; justify-content: center; margin: 0; padding: 0;">
        <ul class="nav-links" id="header-nav-links">
          <li class="nav-search-item" style="display: inline-flex; align-items: center; margin: 0; padding: 0;">
            <button id="nav-search-btn" title="Search" style="background: transparent; border: none; cursor: pointer; color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; padding: 0; margin: 0; transition: color 0.15s ease;">
              <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="1.75 1.75 20.5 20.5" style="display: block;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <!-- Dynamic Main Content Wrapper -->
  <main id="main-content">
    <!-- Home View Container (Landing / Index Page) -->
    <div id="view-home">
      <!-- Designer Hero Beacon / Announcements Banner -->
      <section class="hero-beacon-section" id="section-hero-beacon" style="display: none;">
        <div class="container" id="hero-beacon-container">
          <div class="hero-beacon-card" id="hero-beacon-card">
            <div class="hero-beacon-content">
              <h1 class="hero-beacon-title" id="hero-beacon-title"></h1>
              <p class="hero-beacon-sub" id="hero-beacon-sub"></p>
            </div>
            <div id="hero-beacon-btn-wrap">
              <a href="/blog" class="hero-beacon-btn" id="hero-beacon-btn">Explore Articles &rarr;</a>
            </div>
          </div>
        </div>
      </section>

      <!-- Featured Post Hero Section (Single or Carousel) -->
      <section class="hero-section" id="section-spotlight" style="display: none;">
        <div class="container" id="spotlight-container">
          <div class="spotlight-carousel-viewport" id="spotlight-carousel-viewport">
            <div class="spotlight-carousel-track" id="spotlight-carousel-track">
              <!-- Slides rendered by JS -->
            </div>
            <!-- Top Right Navigation Arrows for Carousel -->
            <div class="spotlight-carousel-nav" id="spotlight-carousel-nav" style="display: none;">
              <button type="button" class="spotlight-carousel-arrow btn-prev" id="spotlight-arrow-prev" aria-label="Previous Featured Post">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button type="button" class="spotlight-carousel-arrow btn-next" id="spotlight-arrow-next" aria-label="Next Featured Post">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
          <!-- Single Card Fallback Container -->
          <a href="#" class="spotlight-card" id="spotlight-link" style="display: none;">
            <div class="spotlight-img-wrap">
              <div class="spotlight-img-ambient" id="spotlight-img-ambient"></div>
              <img src="" alt="" class="spotlight-img" id="spotlight-img">
            </div>
            <div class="spotlight-content">
              <h2 class="spotlight-title" id="spotlight-title">Featured Article</h2>
              <div class="post-meta-row" id="spotlight-meta"></div>
            </div>
          </a>
        </div>
      </section>

      <!-- Posts Feed Section -->
      <section class="posts-section" id="section-feed" style="display: none;">
        <div class="container" id="feed-container">
          <div class="feed-header-wrap" id="feed-header-wrap" style="display: none;">
            <!-- Category Filter Pills Bar -->
            <div class="feed-header-categories" id="feed-header-categories" style="display: none;">
              <div class="filter-bar" id="category-filter-bar">
                <!-- Filter pills populated by JS -->
              </div>
            </div>
          </div>
          <div class="posts-grid" id="posts-grid">
            <!-- Cards populated by JS -->
          </div>
        </div>
      </section>

      <!-- Newsletter Wire Section -->
      <section class="wire-section" id="section-wire" style="display: none;">
        <div class="container" id="wire-container">
          <div class="wire-card" id="wire-card">
            <h3 class="wire-title" id="wire-title"></h3>
            <p class="wire-sub" id="wire-sub"></p>
            <form class="wire-form-row" onsubmit="event.preventDefault(); alert('Subscribed!');">
              <input type="email" class="wire-input" placeholder="Enter your email address..." required>
              <button type="submit" class="hero-beacon-btn" style="cursor: pointer; border: none;">Subscribe</button>
            </form>
          </div>
        </div>
      </section>

      <!-- Static Pages Shelf (if any) -->
      <section class="shelf-section" id="section-pages" style="display: none; border-radius: 16px; margin-bottom: 4rem;">
        <div class="container" id="pages-container">
          <div class="section-heading-wrap">
            <h3 class="section-heading">Pages</h3>
          </div>
          <div class="shelf-grid" id="pages-grid">
            <!-- Static pages cards -->
          </div>
        </div>
      </section>

      <!-- Station Authors Showcase -->
      <section class="authors-section" id="section-authors" style="display: none;">
        <div class="container" id="authors-container">
          <div class="section-heading-wrap">
            <h3 class="section-heading">Authors</h3>
          </div>
          <div class="authors-grid" id="authors-grid">
            <!-- Author cards -->
          </div>
        </div>
      </section>
    </div>

    <!-- All Posts View Container -->
    <div id="view-posts" style="display: none;">
      <div class="container" style="padding-top: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <a href="/" class="reader-back-btn" id="btn-posts-back-home" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 500; font-size: 0.88rem; color: var(--text-muted);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Back to Home</span>
          </a>
        </div>
        <div class="section-heading-wrap" style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
          <h2 class="section-heading" id="all-posts-heading" style="font-size: 1.85rem; margin: 0;">All Posts</h2>
          <span style="font-size: 0.85rem; color: var(--text-dim); display: none;" id="all-posts-count"></span>
        </div>
        <div class="filter-section" id="section-all-filters" style="display: none;">
          <div class="filter-bar" id="all-category-filter-bar"></div>
        </div>
        <section class="posts-section">
          <div class="posts-grid" id="all-posts-grid"></div>
          <nav class="pagination-bar" id="all-posts-pagination" style="display: none;"></nav>
        </section>
      </div>
    </div>

    <!-- Reader / Article View Container -->
    <div id="view-reader" class="reader-wrapper" style="display: none;">
      <div class="reader-container">
        <div class="reader-top-bar">
          <button type="button" class="reader-back-btn" id="btn-reader-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Back to Posts</span>
          </button>
          <span class="reader-tag" id="reader-tag">Post</span>
        </div>

        <header class="reader-header" id="reader-header">
          <h1 class="reader-title" id="reader-title"></h1>
          <p class="reader-subtitle" id="reader-subtitle"></p>
          <div class="reader-meta-bar" id="reader-meta-bar"></div>
        </header>

        <div class="reader-cover-wrap" id="reader-cover-wrap" style="display: none;">
          <img src="" alt="" class="reader-cover-img" id="reader-cover-img">
        </div>

        <article class="article-prose" id="reader-prose">
          <!-- Prose content populated by JS -->
        </article>

        <!-- Prev / Next Navigation (disabled per design) -->
        <div class="post-nav-grid" id="reader-post-nav" style="display: none;"></div>

        <div style="text-align: center; margin: 3rem 0 1rem;">
          <button type="button" class="reader-back-btn" style="font-weight: 600; font-size: 0.95rem;" id="btn-reader-bottom-back">
            &larr; See More Posts
          </button>
        </div>
      </div>
    </div>

    <!-- Dedicated Author Profile View Container -->
    <div id="view-author" class="author-profile-wrapper" style="display: none;">
      <div class="author-profile-container">
        <!-- Back Button -->
        <div class="author-profile-back-wrap" style="margin-bottom: 2rem;">
          <button type="button" class="reader-back-btn" id="btn-author-back" title="Back" style="background: none; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.88rem; font-weight: 500; color: var(--text-muted); padding: 0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Back</span>
          </button>
        </div>

        <!-- Centered Profile Header -->
        <div class="author-profile-header-centered">
          <div class="author-profile-avatar-wrap" id="author-profile-avatar-wrap"></div>
          <h1 class="author-profile-display-name" id="author-profile-display-name">Author Name</h1>
          <div class="author-profile-stats-row">
            <span class="author-stat-item"><strong id="author-stat-posts">0</strong> <span id="author-stat-posts-label">articles</span></span>
            <span class="author-stat-item author-stat-date" id="author-stat-join">Joined ${createdYear}</span>
          </div>
          <div class="author-profile-bio" id="author-profile-bio" style="display: none;"></div>
        </div>

        <!-- Author Articles Stream -->
        <div class="author-tab-content-stream" id="author-tab-content-stream"></div>
      </div>
    </div>
  </main>

  <!-- Site Footer -->
  <footer class="site-footer">
    <div class="container footer-wrap">
      <div class="footer-left">
        <a href="${relRoot}about-cedar/" id="footer-powered-by" style="color: var(--text-muted); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"><span>Powered by <strong style="color: var(--text-primary);">Cedar</strong></span><img src="${relRoot}logo.png" alt="" style="width: 1.15em; height: 1.15em; object-fit: contain; display: block; flex-shrink: 0;"></a>
      </div>
      <div class="footer-copyright-wrap" style="color: var(--text-dim);">
        <span class="footer-copyright-date">&copy; <span id="footer-year">${createdYear}</span></span>
        <span class="footer-copyright-rights">All rights reserved.</span>
      </div>
      <span style="display: none;" id="footer-site-name"></span>
      <span style="display: none;" id="footer-domain-label"></span>
    </div>
  </footer>

  <!-- Production Site Data & Modular Preview Scripts -->
  <script src="${relRoot}site-data.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/core/sanitizer.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/compiler/compiler.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/preview/theme.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/preview/state.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/preview/home.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/editor/blocks.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/preview/reader.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/preview/app.js?v=${buildStamp}"></script>
  <script src="${relRoot}js/preview/search.js?v=${buildStamp}"></script>

  <!-- Search Modal -->
  <div id="search-modal" class="search-modal-wrap" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; justify-content: center; align-items: flex-start; padding-top: 8vh; backdrop-filter: blur(4px);">
    <div class="search-modal-content" style="background: var(--bg-primary); width: 100%; max-width: 600px; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-subtle);">
      <div style="display: flex; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-subtle);">
        <svg width="20" height="20" fill="none" stroke="var(--text-dim)" stroke-width="2.5" viewBox="0 0 24 24" style="margin-right: 12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
        <input type="text" id="search-modal-input" placeholder="Search people and posts" style="flex: 1; background: transparent; border: none; outline: none; font-size: 1.1rem; color: var(--text-primary);">
      </div>
      <div id="search-modal-results" style="max-height: 60vh; overflow-y: auto; padding: 1rem 0;"></div>
    </div>
  </div>
</body>
</html>`;
  }

  // 3.5b Build Complete 1:1 Production Static Site File List (Used by Web ZIP Export & GitHub Sync)
  const PRODUCTION_ENGINE_TEXT_ASSETS = [
    'css/fonts.css',
    'css/preview/theme.css',
    'css/preview/blocks.css',
    'css/preview/reader.css',
    'css/preview/gallery.css',
    'js/core/sanitizer.js',
    'js/compiler/compiler.js',
    'js/preview/theme.js',
    'js/preview/state.js',
    'js/preview/home.js',
    'js/editor/blocks.js',
    'js/preview/reader.js',
    'js/preview/app.js',
    'js/preview/search.js',
    'logo.svg'
  ];

  const PRODUCTION_ENGINE_BINARY_ASSETS = [
    'fonts/inter.woff2',
    'fonts/plus-jakarta-sans.woff2',
    'fonts/lora.woff2',
    'fonts/space-grotesk.woff2',
    'fonts/fraunces.woff2',
    'fonts/syne.woff2',
    'fonts/jetbrains-mono.woff2',
    'fonts/shantell-sans.woff2'
  ];

  async function buildProductionSiteFiles(options = {}) {
    const files = [];
    const addFile = (name, data) => {
      const cleanName = String(name || '').replace(/^\/+/, '');
      if (!cleanName || data === undefined || data === null) return;
      const existingIdx = files.findIndex(f => f.name === cleanName);
      if (existingIdx !== -1) {
        files[existingIdx].data = data;
      } else {
        files.push({ name: cleanName, data });
      }
    };

    const rawConfig = (typeof window !== 'undefined' && window.projectConfig) ? window.projectConfig : (typeof projectConfig !== 'undefined' ? projectConfig : {});
    const allDrafts = Array.isArray(window.drafts) ? window.drafts : (typeof drafts !== 'undefined' && Array.isArray(drafts) ? drafts : []);

    // Clone config & drafts for safe public sanitization
    const publicProject = JSON.parse(JSON.stringify(rawConfig || {}));
    delete publicProject.vaultPath;
    delete publicProject.mediaLibrary;
    delete publicProject.deletedMedia;
    delete publicProject.mediaTags;
    delete publicProject.activityLog;
    delete publicProject.milestones;
    delete publicProject.customThemes;
    delete publicProject.editorTheme;
    delete publicProject.pages;
    delete publicProject.quickLinks;
    delete publicProject.webUrls;
    delete publicProject.githubToken;
    if (!publicProject.domain && typeof window.resolveProjectDomain === 'function') {
      publicProject.domain = window.resolveProjectDomain() || '';
    }
    if (!publicProject.domain && options.detectedSiteUrl) {
      publicProject.detectedDomain = String(options.detectedSiteUrl).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }
    const isRssEnabled = (typeof window.resolveProjectRssEnabled === 'function')
      ? window.resolveProjectRssEnabled()
      : Boolean(publicProject.rssEnabled);
    publicProject.rssEnabled = isRssEnabled;

    // 1. Fetch static engine text & binary assets so the exported site renders 1:1 with preview.html
    if (options.includeEngineAssets !== false && typeof fetch === 'function') {
      await Promise.all([
        ...PRODUCTION_ENGINE_TEXT_ASSETS.map(async (relPath) => {
          try {
            let res = await fetch(relPath, { cache: 'no-store' }).catch(() => null); if (!res || !res.ok) res = await fetch('/' + relPath, { cache: 'no-store' });
            if (res.ok) {
              const txt = await res.text();
              addFile(relPath, txt);
            }
          } catch (e) {}
        }),
        ...PRODUCTION_ENGINE_BINARY_ASSETS.map(async (relPath) => {
          try {
            let res = await fetch(relPath, { cache: 'no-store' }).catch(() => null); if (!res || !res.ok) res = await fetch('/' + relPath, { cache: 'no-store' });
            if (res.ok) {
              const blob = await res.blob();
              addFile(relPath, blob);
            }
          } catch (e) {}
        })
      ]);
    }

    // 2. Branding & Author Media
    const brand = (publicProject.design && publicProject.design.branding) || {};
    const rawFavFromFiles = (brand.files && brand.files['media/branding/icon.png'])
      || (typeof window !== 'undefined' && window.brandingFiles && window.brandingFiles['media/branding/icon.png'])
      || '';
    if (brand.files) delete brand.files;
    const bestLogoData = (brand.originalLogo && brand.originalLogo.startsWith('data:')) ? brand.originalLogo : brand.generalLogo;
    const mastheadLogoData = (brand.generalLogo && brand.generalLogo.startsWith('data:')) ? brand.generalLogo : bestLogoData;
    if (mastheadLogoData && mastheadLogoData.startsWith('data:')) {
      const logoBlob = dataUrlToBlob(mastheadLogoData);
      if (logoBlob) {
        addFile('media/branding/logo.png', logoBlob);
        brand.generalLogo = '/media/branding/logo.png';
      }
    }
    if (bestLogoData && bestLogoData.startsWith('data:')) {
      const origBlob = dataUrlToBlob(bestLogoData);
      if (origBlob) {
        addFile('media/branding/logo-original.png', origBlob);
      }
    }
    const resolvedFavData = (brand.tabLogo && brand.tabLogo.startsWith('data:'))
      ? brand.tabLogo
      : (rawFavFromFiles && rawFavFromFiles.startsWith('data:')
          ? rawFavFromFiles
          : (!brand.faviconExplicitlyRemoved && bestLogoData && bestLogoData.startsWith('data:') ? bestLogoData : ''));
    if (resolvedFavData && resolvedFavData.startsWith('data:')) {
      const iconBlob = dataUrlToBlob(resolvedFavData);
      if (iconBlob) {
        addFile('media/branding/icon.png', iconBlob);
        addFile('icon.png', iconBlob);
        addFile('icon.ico', iconBlob);
        brand.tabLogo = resolvedFavData;
      }
    } else if (brand.tabLogo === 'icon.png' || brand.tabLogo === '/icon.png') {
      brand.tabLogo = '';
    }
    if (brand.originalLogo && brand.originalLogo.startsWith('data:')) {
      delete brand.originalLogo;
    }

    if (Array.isArray(publicProject.authors)) {
      for (const auth of publicProject.authors) {
        if (!auth || typeof auth !== 'object' || !auth.avatar) continue;
        if (auth.avatar.startsWith('data:')) {
          const authSlug = String(auth.name || 'author').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const avPath = `media/authors/${authSlug}_avatar.jpg`;
          const avBlob = dataUrlToBlob(auth.avatar);
          if (avBlob) {
            addFile(avPath, avBlob);
            auth.avatar = '/' + avPath;
          }
        } else if (!/^https?:\/\//i.test(auth.avatar) && typeof fetch === 'function') {
          const cleanAvPath = auth.avatar.replace(/^\/+/, '');
          try {
            const r = await fetch('/' + cleanAvPath, { cache: 'no-store' });
            if (r.ok) {
              const avBlob = await r.blob();
              addFile(cleanAvPath, avBlob);
              auth.avatar = '/' + cleanAvPath;
            }
          } catch (e) {}
        }
      }
    }

    // 3. Filter and sanitize published posts & pages
    const publishedPosts = allDrafts.filter(d => d && (d.type === 'post' || !d.type) && d.type !== 'note' && d.status === 'published' && !d.hidden && !d.retired);
    const rawPages = allDrafts.filter(d => d && d.type === 'page' && (!d.hidden && !d.retired || d.slug === 'about-cedar' || d.id === 'page_about_cedar' || d.isCategoryAggregate || String(d.id || '').startsWith('page_cat_')));
    const seenPageSlugs = new Set();
    const publishedPages = [];
    for (const p of rawPages) {
      const s = (p.slug || (typeof generateSlug === 'function' ? generateSlug(p.title) : p.title || '')).trim().toLowerCase();
      if (!s || seenPageSlugs.has(s)) continue;
      seenPageSlugs.add(s);
      publishedPages.push(p);
    }

    const publicDrafts = [];

    // Helper: Strip inline base64 images from proseHtml/featuredImage into static files & rewrite img[src] to static paths
    const sanitizeDraftMediaForStaticExport = (draftClone, slug, folder, cleanImgs) => {
      if (draftClone.coverImage && draftClone.coverImage.startsWith('data:')) {
        const covBlob = dataUrlToBlob(draftClone.coverImage);
        if (covBlob) {
          const covName = `${slug}-cover.webp`;
          addFile(`${folder}/${covName}`, covBlob);
          draftClone.coverImage = `/${folder}/${covName}`;
        }
      } else if (draftClone.coverImage && !draftClone.coverImage.startsWith('http') && !draftClone.coverImage.startsWith('data:') && !draftClone.coverImage.startsWith('blob:')) {
        const cleanCovName = draftClone.coverImage.split('?')[0].split('#')[0].split('/').pop().split('\\').pop();
        const matchedCov = cleanImgs.find(im => im && im.filename === cleanCovName);
        if (matchedCov && matchedCov.relativePath) {
          draftClone.coverImage = matchedCov.relativePath;
        }
      }
      if (draftClone.featuredImage && draftClone.featuredImage.startsWith('data:')) {
        draftClone.featuredImage = draftClone.coverImage || '';
      }

      if (draftClone.proseHtml && typeof draftClone.proseHtml === 'string' && typeof DOMParser !== 'undefined') {
        try {
          const pDoc = new DOMParser().parseFromString(`<body>${draftClone.proseHtml}</body>`, 'text/html');
          let inlineIdx = 0;
          pDoc.body.querySelectorAll('img').forEach(imgEl => {
            const src = imgEl.getAttribute('src') || '';
            const orig = imgEl.dataset.originalSrc || '';
            const imgName = (imgEl.dataset.imgName && imgEl.dataset.imgName !== 'img') ? imgEl.dataset.imgName : '';
            if (orig && (orig.startsWith('data:') || orig.startsWith('blob:'))) {
              imgEl.removeAttribute('data-original-src');
            }
            const candidateRef = imgName || ((!orig.startsWith('data:') && !orig.startsWith('blob:')) ? orig : '') || ((!src.startsWith('data:') && !src.startsWith('blob:')) ? src : '');
            const cleanCandidate = candidateRef ? candidateRef.split('?')[0].split('#')[0].split('/').pop().split('\\').pop() : '';
            if (cleanCandidate) {
              const matched = cleanImgs.find(im => im && ((im.filename && im.filename === cleanCandidate) || (im.relativePath && (im.relativePath === candidateRef || im.relativePath.endsWith('/' + cleanCandidate)))));
              if (matched && matched.relativePath) {
                imgEl.setAttribute('src', matched.relativePath);
                return;
              }
            }
            if (src.startsWith('data:image/')) {
              const inlineBlob = dataUrlToBlob(src);
              if (inlineBlob) {
                inlineIdx++;
                const mimeMatch = src.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
                let ext = mimeMatch ? mimeMatch[1].toLowerCase() : 'webp';
                if (ext === 'jpeg') ext = 'jpg';
                if (ext === 'svg+xml') ext = 'svg';
                const safeImgName = imgName ? imgName.replace(/[^a-zA-Z0-9._-]/g, '_') : '';
                const inlineFname = (safeImgName && safeImgName.includes('.')) ? safeImgName : `${slug}-img-${inlineIdx}.${ext}`;
                addFile(`${folder}/${inlineFname}`, inlineBlob);
                addFile(`blog/images/${inlineFname}`, inlineBlob);
                const relPath = `/${folder}/${inlineFname}`;
                cleanImgs.push({
                  filename: inlineFname,
                  relativePath: relPath,
                  alt: imgEl.getAttribute('alt') || ''
                });
                imgEl.setAttribute('src', relPath);
              }
            }
          });
          draftClone.proseHtml = prepareProseForPublish(pDoc.body.innerHTML, draftClone, { preferStaticPaths: true });
        } catch (e) {}
      }
    };

    // 4. Process Published Posts
    for (const post of publishedPosts) {
      const slug = post.slug || (typeof generateSlug === 'function' ? generateSlug(post.title) : 'post');
      const folder = `blog/published/${slug}`;
      let cat = post.permalinkCat !== undefined ? post.permalinkCat : (post.tag || (post.categories && post.categories[0]) || 'uncategorized');
      if (!cat) cat = 'uncategorized';
      const catSlug = encodeURIComponent(String(cat).toLowerCase().trim().replace(/\s+/g, '-'));
      const cleanRouteFolder = `${catSlug}/${slug}`;

      // Export post images (skip uncropped original source buffers)
      const cleanImages = [];
      if (Array.isArray(post.images)) {
        for (const img of post.images) {
          if (!img || img.isOriginal) continue;
          const fname = img.filename || img.name;
          if (fname) {
            let blob = img.blob;
            if (!blob && img.dataUrl && img.dataUrl.startsWith('data:')) {
              blob = dataUrlToBlob(img.dataUrl);
            } else if (!blob && typeof imageRegistry !== 'undefined' && imageRegistry.has(fname)) {
              const reg = imageRegistry.get(fname);
              if (reg && reg.dataUrl && reg.dataUrl.startsWith('data:')) blob = dataUrlToBlob(reg.dataUrl);
            }
            if (!blob && typeof fetch === 'function') {
              const fetchTarget = img.relativePath || `/${folder}/${fname}`;
              try {
                const r = await fetch(fetchTarget.startsWith('/') ? fetchTarget : '/' + fetchTarget);
                if (r.ok) blob = await r.blob();
              } catch (e) {}
            }
            if (blob) {
              addFile(`${folder}/${fname}`, blob);
              addFile(`blog/images/${fname}`, blob);
            }
            cleanImages.push({
              filename: fname,
              relativePath: `/${folder}/${fname}`,
              width: img.width,
              height: img.height,
              alt: img.alt || ''
            });
          }
        }
      }

      const postClone = JSON.parse(JSON.stringify(post));
      delete postClone.tempImages;
      delete postClone.coverImageOriginal;
      delete postClone.revisions;
      delete postClone.history;
      delete postClone.autosave;
      if (publicProject && publicProject.defaultAuthor) {
        postClone.authorName = publicProject.defaultAuthor;
        postClone.author = publicProject.defaultAuthor;
        postClone.authors = [publicProject.defaultAuthor];
      }
      postClone.images = cleanImages;
      sanitizeDraftMediaForStaticExport(postClone, slug, folder, cleanImages);
      publicDrafts.push(postClone);

      // Markdown & archival HTML in blog/published/<slug>/
      addFile(
        `${folder}/index.md`,
        (typeof generateMarkdownWithFrontmatter === 'function') ? generateMarkdownWithFrontmatter(postClone) : (postClone.markdown || '')
      );
      addFile(`${folder}/index.html`, generateFullHtml(postClone, { preferStaticPaths: true }));

      // 1:1 Preview shell at clean route /<category>/<slug>/index.html
      const siteTitle = brand.siteTitle || publicProject.name || 'Cedar';
      addFile(
        `${cleanRouteFolder}/index.html`,
        generateBlogHomeHtml(publishedPosts, publicProject, {
          pageTitle: `${post.title || 'Article'} — ${siteTitle}`,
          metaDesc: post.subtitle || post.excerpt || '',
          canonicalPath: `${cleanRouteFolder}/`
        })
      );
    }

    // 5. Process Published Pages
    for (const page of publishedPages) {
      const slug = page.slug || (typeof generateSlug === 'function' ? generateSlug(page.title) : 'page');
      const isAboutCedar = (page.id === 'page_about_cedar' || slug === 'about-cedar');
      const isHidden = !isAboutCedar && Boolean(page.hidden || page.retired);
      const folder = `pages/published/${slug}`;

      const pageClone = JSON.parse(JSON.stringify(page));
      delete pageClone.tempImages;
      delete pageClone.coverImageOriginal;
      delete pageClone.revisions;
      delete pageClone.history;
      delete pageClone.autosave;

      // Sync RSS or Links page content
      if (pageClone.id === 'page_rss' || slug === 'rss') {
        if (typeof window.generateRssPageData === 'function') {
          const rssData = window.generateRssPageData(publicProject);
          const curRssMd = String(pageClone.markdown || '').trim();
          if ((!curRssMd && !pageClone.proseHtml) || curRssMd.includes('### Available Feeds') || curRssMd.includes('## RSS Syndication') || curRssMd.includes(':::rss-box')) {
            pageClone.subtitle = rssData.subtitle;
            pageClone.markdown = rssData.markdown;
            pageClone.proseHtml = rssData.proseHtml;
          }
        }
      }
      if (pageClone.id === 'page_links' || slug === 'links') {
        if (pageClone.linksData) {
          if (pageClone.linksData.profile && pageClone.linksData.profile.avatar && pageClone.linksData.profile.avatar.startsWith('data:')) {
            const avBlob = dataUrlToBlob(pageClone.linksData.profile.avatar);
            if (avBlob) {
              addFile('media/links/profile_avatar.png', avBlob);
              pageClone.linksData.profile.avatar = '/media/links/profile_avatar.png';
            }
          }
          if (Array.isArray(pageClone.linksData.items)) {
            pageClone.linksData.items.forEach((it, idx) => {
              if (it && it.icon && it.icon.startsWith('data:')) {
                const icBlob = dataUrlToBlob(it.icon);
                if (icBlob) {
                  const icPath = `media/links/link_icon_${idx}.png`;
                  addFile(icPath, icBlob);
                  it.icon = '/' + icPath;
                }
              }
            });
          }
        }
      }

      const cleanPageImages = [];
      if (Array.isArray(page.images)) {
        for (const img of page.images) {
          if (!img || img.isOriginal) continue;
          const fname = img.filename || img.name;
          if (fname) {
            let blob = img.blob;
            if (!blob && img.dataUrl && img.dataUrl.startsWith('data:')) {
              blob = dataUrlToBlob(img.dataUrl);
            } else if (!blob && typeof imageRegistry !== 'undefined' && imageRegistry.has(fname)) {
              const reg = imageRegistry.get(fname);
              if (reg && reg.dataUrl && reg.dataUrl.startsWith('data:')) blob = dataUrlToBlob(reg.dataUrl);
            }
            if (blob) {
              addFile(`${folder}/${fname}`, blob);
              addFile(`blog/images/${fname}`, blob);
            }
            cleanPageImages.push({
              filename: fname,
              relativePath: `/${folder}/${fname}`,
              width: img.width,
              height: img.height,
              alt: img.alt || ''
            });
          }
        }
      }
      pageClone.images = cleanPageImages;
      sanitizeDraftMediaForStaticExport(pageClone, slug, folder, cleanPageImages);
      publicDrafts.push(pageClone);

      if (!isHidden) {
        const pageUpdatedAt = page.updatedAt || page.editedDate || page.publishedAt || page.publishedDate || page.createdAt || publicProject.createdAt || '2026-01-01T00:00:00.000Z';
        addFile(
          `${folder}/index.md`,
          `---\ntitle: "${(page.title || '').replace(/"/g, '\\"')}"\nslug: "${slug}"\ntype: "page"\nupdatedAt: "${new Date(pageUpdatedAt).toISOString()}"\n---\n\n${page.markdown || ''}`
        );
        addFile(`${folder}/index.html`, generateFullHtml(pageClone, { preferStaticPaths: true }));

        if (!pageClone.isCategoryAggregate && !String(pageClone.id || '').startsWith('page_cat_') && slug !== 'all') {
          const siteTitle = brand.siteTitle || publicProject.name || 'Cedar';
          addFile(
            `${slug}/index.html`,
            generateBlogHomeHtml(publishedPosts, publicProject, {
              pageTitle: `${pageClone.title || 'Page'} — ${siteTitle}`,
              metaDesc: pageClone.subtitle || '',
              canonicalPath: `${slug}/`
            })
          );
        }
      }
    }

    // Ensure about-cedar exists in publicDrafts and has /about-cedar/index.html
    if (!publicDrafts.some(d => d && (d.slug === 'about-cedar' || d.id === 'page_about_cedar'))) {
      if (typeof window.createDefaultAboutCedarPage === 'function') {
        publicDrafts.push(window.createDefaultAboutCedarPage());
      }
    }
    const siteTitle = brand.siteTitle || publicProject.name || 'Cedar';
    addFile(
      'about-cedar/index.html',
      generateBlogHomeHtml(publishedPosts, publicProject, {
        pageTitle: `About Cedar — ${siteTitle}`,
        metaDesc: 'A focused, offline-first Wizzy Wig authoring and static blog publishing tool.',
        canonicalPath: 'about-cedar/'
      })
    );

    // 6. Category Archive Clean Routes (/<catSlug>/index.html) & All Posts (/blog/index.html)
    addFile(
      'blog/index.html',
      generateBlogHomeHtml(publishedPosts, publicProject, {
        pageTitle: `All Posts — ${siteTitle}`,
        metaDesc: `All articles published on ${siteTitle}.`,
        canonicalPath: 'blog/'
      })
    );

    const allCategories = new Set();
    if (Array.isArray(publicProject.categories)) {
      publicProject.categories.forEach(c => {
        const val = (typeof c === 'object' ? (c.name || c.title || '') : String(c)).trim();
        if (val) allCategories.add(val);
      });
    }
    publishedPosts.forEach(p => {
      if (p.tag) allCategories.add(String(p.tag).trim());
      if (Array.isArray(p.categories)) p.categories.forEach(c => c && allCategories.add(String(c).trim()));
    });
    for (const catName of allCategories) {
      const catSlug = encodeURIComponent(catName.toLowerCase().replace(/\s+/g, '-'));
      if (!catSlug) continue;
      addFile(
        `${catSlug}/index.html`,
        generateBlogHomeHtml(publishedPosts, publicProject, {
          pageTitle: `${catName} Articles — ${siteTitle}`,
          metaDesc: `${catName} articles on ${siteTitle}.`,
          canonicalPath: `${catSlug}/`
        })
      );
    }

    // 7. Root index.html, 404.html (SPA fallback for GitHub/Cloudflare Pages), and site-data.js
    const knownRootRoutes = new Set(['blog', 'posts', 'post', 'pages', 'page', 'author', 'authors', 'category', 'categories', 'about-cedar', 'about', 'links', 'rss', 'notes', 'note']);
    publicDrafts.forEach(d => {
      if (d && d.slug) knownRootRoutes.add(String(d.slug).toLowerCase());
    });
    allCategories.forEach(c => {
      if (c) knownRootRoutes.add(encodeURIComponent(String(c).toLowerCase().replace(/\s+/g, '-')));
    });
    const rootHtml = generateBlogHomeHtml(publishedPosts, publicProject, { canonicalPath: '' });
    const fallback404Html = generateBlogHomeHtml(publishedPosts, publicProject, {
      canonicalPath: '',
      is404: true,
      knownRootRoutes: Array.from(knownRootRoutes)
    });
    addFile('index.html', rootHtml);
    addFile('404.html', fallback404Html);
    addFile('.nojekyll', '');

    const siteDataPayload = {
      project: publicProject,
      drafts: publicDrafts,
      generatedAt: new Date().toISOString()
    };
    addFile(
      'site-data.js',
      `window.__CEDAR_PRODUCTION__ = true;\nwindow.__CEDAR_STATIC_DATA__ = ${JSON.stringify(siteDataPayload)};\n`
    );

      // 8. Custom Domain CNAME & Cloudflare Workers/Pages Static Asset Config
      if (publicProject.domain && typeof publicProject.domain === 'string') {
        const cleanDom = publicProject.domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        if (cleanDom && cleanDom.includes('.')) {
          addFile('CNAME', cleanDom + '\n');
        }
      }
      let linkedGhRepoName = '';
      try {
        const rawGhRepo = (typeof localStorage !== 'undefined' && localStorage.getItem('cedar_github_repo')) || '';
        if (rawGhRepo && rawGhRepo.includes('/')) {
          linkedGhRepoName = rawGhRepo.split('/').filter(Boolean).pop().replace(/\.git$/i, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
        }
      } catch (e) {}
      const workerSiteName = linkedGhRepoName || (typeof generateSlug === 'function' ? generateSlug(publicProject.name || 'cedar-blog') : 'cedar-blog').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'cedar-blog';
      addFile('wrangler.jsonc', JSON.stringify({
        "$schema": "node_modules/wrangler/config-schema.json",
        "name": workerSiteName,
        "compatibility_date": "2024-09-23",
        "assets": {
          "directory": "."
        }
      }, null, 2) + '\n');
      addFile('.assetsignore', [
        '# Cloudflare Workers Static Assets ignore rules',
        '.git',
        '.git/**',
        'writer/',
        'static-writer/',
        'editor/',
        'drafts/',
        'milestones/',
        'hidden/',
        'backups/',
        'notes/',
        '*.draft.*',
        '**/draft.json',
        'drafts.json',
        'milestones.json',
        '**/milestones.json',
        'vault.json',
        'notes.json',
        'sync.json',
        '.DS_Store',
        'Thumbs.db'
      ].join('\n') + '\n');
      addFile('.gitignore', [
        '# Cedar Studio - Exclude private drafts, milestones, and editor state',
        'editor/',
        'writer/',
        'static-writer/',
        'blog/drafts/',
        'blog/hidden/',
        'pages/hidden/',
        'drafts/',
        'milestones/',
        'hidden/',
        'backups/',
        'notes/',
        '*.draft.*',
        '**/draft.json',
        'drafts.json',
        'milestones.json',
        '**/milestones.json',
        'vault.json',
        'notes.json',
        '.DS_Store',
        'Thumbs.db'
      ].join('\n') + '\n');

      // 9. RSS 2.0 Feed (Always generated at both /feed.xml and /blog/feed.xml so once generated, the site's RSS feed never disappears or changes URL)
      {
        const sanitizedPublishedPosts = publicDrafts.filter(d => d && (d.type === 'post' || !d.type));
        const rssFeed = generateRssFeedXml(sanitizedPublishedPosts.length > 0 ? sanitizedPublishedPosts : publishedPosts, publicProject);
        addFile('feed.xml', rssFeed);
        addFile('blog/feed.xml', rssFeed);
      }

    return files;
  }
  window.buildProductionSiteFiles = buildProductionSiteFiles;

  // 3.6 Standalone Web Production Export (Zero drafts, zero internal files, 1:1 with Preview)
  let isExportingWebZip = false;
  async function exportWebProductionZip() {
    if (isExportingWebZip) {
      console.warn('[Export] Web production zip export already in progress.');
      return;
    }
    isExportingWebZip = true;
    if (typeof window.showToast === 'function') window.showToast('Packaging Web Site (.ZIP)...');

    try {
      const files = await buildProductionSiteFiles({ includeEngineAssets: true });

      const zipUint8 = await createMultiFileZip(files);
      const zipBlob = (zipUint8 instanceof Blob) ? zipUint8 : new Blob([zipUint8], { type: 'application/zip' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      const safeProject = (typeof generateSlug === 'function' ? generateSlug(window.projectConfig?.name) : 'cedar') || 'cedar-web';
      a.download = `${safeProject}-web-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);

      if (typeof window.showToast === 'function') {
        window.showToast('Exported Web Site (.ZIP)! Ready for hosting.');
      }
    } catch (err) {
      console.error('Failed to export web zip:', err);
      if (typeof window.showToast === 'function') window.showToast('Error exporting web zip: ' + err.message);
    } finally {
      setTimeout(() => {
        isExportingWebZip = false;
      }, 1500);
    }
  }

  let isExportingMasterZip = false;
  async function exportMasterSliceZip() {
    if (isExportingMasterZip) {
      console.warn('[Export] Master slice zip export already in progress, ignoring duplicate call.');
      return;
    }
    isExportingMasterZip = true;
    if (typeof window.showToast === 'function') window.showToast('Packaging Local Storage (.ZIP)...');
    try {
      const files = [];

      // 0. Cloudflare Pages & Git guardrails (.cfignore & .gitignore)
      const ignoreEntries = [
        '# Cedar Guardrails - Do NOT deploy internal, draft, milestone, or hidden assets',
        'editor/',
        'writer/',
        'static-writer/',
        'blog/drafts/',
        'blog/hidden/',
        'pages/hidden/',
        'drafts/',
        'milestones/',
        'hidden/',
        'backups/',
        'notes/',
        '*.draft.*',
        '**/draft.json',
        'drafts.json',
        'milestones.json',
        '**/milestones.json',
        'vault.json',
        'notes.json',
        'sync.json',
        '_authors_archive/',
        '_designer_archive/',
        '_legacy_archive/',
        '_notes_archive/',
        '__pycache__/'
      ].join('\n') + '\n';
      files.push({
        name: '.cfignore',
        data: ignoreEntries
      });
      files.push({
        name: '.gitignore',
        data: ignoreEntries
      });

      // 0a. editor/drafts.json & editor/milestones.json
      files.push({
        name: 'editor/drafts.json',
        data: JSON.stringify(drafts, null, 2)
      });
      files.push({
        name: 'editor/milestones.json',
        data: JSON.stringify(Array.isArray(projectConfig.milestones) ? projectConfig.milestones : [], null, 2)
      });

      // 0b. writer/drafts.json & writer/milestones.json for direct re-import
      files.push({
        name: 'writer/drafts.json',
        data: JSON.stringify(drafts, null, 2)
      });
      files.push({
        name: 'writer/milestones.json',
        data: JSON.stringify(Array.isArray(projectConfig.milestones) ? projectConfig.milestones : [], null, 2)
      });

      // 1. config.json
      const configData = {
        schemaVersion: 150,
        buildToken: 'v150',
        name: projectConfig.name,
        domain: projectConfig.domain || (typeof resolveProjectDomain === 'function' ? resolveProjectDomain() : '') || '',
        subtitle: projectConfig.subtitle || '',
        description: projectConfig.description || 'Drop-in Blog Engine',
        baseUrl: projectConfig.baseUrl,
        defaultAuthor: projectConfig.defaultAuthor,
        authors: projectConfig.authors,
        categories: projectConfig.categories,
        autoCategoryPages: projectConfig.autoCategoryPages !== false,
        rssEnabled: Boolean(projectConfig.rssEnabled),
        layoutOverride: Boolean(projectConfig.layoutOverride),
        design: projectConfig.design || null,
        exportedAt: new Date().toISOString(),
        totalPosts: drafts.filter(d => (d.type === 'post' || !d.type) && d.status !== 'idea' && !((typeof window.isLinksDraft === 'function' ? window.isLinksDraft(d) : (d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData))))).length,
        totalPages: drafts.filter(d => d.type === 'page' || ((typeof window.isLinksDraft === 'function' ? window.isLinksDraft(d) : (d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData))))).length,
        totalIdeas: drafts.filter(d => d.status === 'idea').length
      };
      files.push({
        name: 'config.json',
        data: JSON.stringify(configData, null, 2)
      });
      files.push({
        name: 'editor/config.json',
        data: JSON.stringify(configData, null, 2)
      });
      files.push({
        name: 'writer/config.json',
        data: JSON.stringify(configData, null, 2)
      });

      // 2. Posts (/blog/{drafts,published,hidden}/<slug>/)
      const allPosts = drafts.filter(d => (d.type === 'post' || !d.type) && d.type !== 'note' && !((typeof window.isLinksDraft === 'function' ? window.isLinksDraft(d) : (d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)))));
      for (const post of allPosts) {
        const slug = post.slug || generateSlug(post.title);
        const isHidden = Boolean(post.hidden || post.retired);
        const isPublished = !isHidden && (post.status === 'published');
        const statusSubfolder = isHidden ? 'hidden' : (isPublished ? 'published' : 'drafts');
        const folder = `blog/${statusSubfolder}/${slug}`;

        // index.md with YAML frontmatter
        const mdContent = generateMarkdownWithFrontmatter(post);
        files.push({
          name: `${folder}/index.md`,
          data: mdContent
        });

        // draft.json for reimport
        files.push({
          name: `${folder}/draft.json`,
          data: JSON.stringify(post, null, 2)
        });

        // Standalone index.html ONLY for published posts
        if (isPublished) {
          try {
            files.push({
              name: `${folder}/index.html`,
              data: generateFullHtml(post)
            });
          } catch (e) {}
        }

        // Related media (images within this post) directly inside the post's folder
        if (post.images && Array.isArray(post.images)) {
          for (const img of post.images) {
            const fname = img.filename;
            if (fname) {
              let blob = img.blob;
              if (!blob && img.dataUrl) {
                blob = dataUrlToBlob(img.dataUrl);
              }
              if (blob && !files.some(f => f.name === `${folder}/${fname}`)) {
                files.push({
                  name: `${folder}/${fname}`,
                  data: blob
                });
              }
            }
          }
        }
      }

      // 3. Static Pages (/pages/{published,hidden}/<slug>/)
      const isRssEnabled = (typeof resolveProjectRssEnabled === 'function')
        ? resolveProjectRssEnabled()
        : (projectConfig?.rssEnabled !== undefined ? Boolean(projectConfig.rssEnabled) : false);
      const rawPages = drafts.filter(d => d && d.type === 'page');
      const seenCompiledSlugs = new Set();
      const pages = [];
      for (const p of rawPages) {
        const s = (p.slug || (typeof generateSlug === 'function' ? generateSlug(p.title) : p.title || '')).trim().toLowerCase();
        if (!s || seenCompiledSlugs.has(s)) continue;
        seenCompiledSlugs.add(s);
        pages.push(p);
      }
      for (const page of pages) {
        page.status = 'published';
        const slug = page.slug || generateSlug(page.title);
        const isAboutCedar = (page.id === 'page_about_cedar' || slug === 'about-cedar');
        if (isAboutCedar) {
          page.subtitle = '';
          page.showSubtitle = false;
        }
        const isHidden = !isAboutCedar && Boolean(page.hidden || page.retired);
        const isPublished = isAboutCedar || !isHidden;
        const statusSubfolder = isHidden ? 'hidden' : 'published';
        const folder = `pages/${statusSubfolder}/${slug}`;
        const isRss = (page.id === 'page_rss' || slug === 'rss');
        if (isRss && typeof window.generateRssPageData === 'function') {
          const rssData = window.generateRssPageData(projectConfig);
          page.subtitle = rssData.subtitle;
          page.markdown = rssData.markdown;
          page.proseHtml = rssData.proseHtml;
        }

        const isLinks = (page.id === 'page_links' || slug === 'links');
        if (isLinks && typeof window.generateLinksPageData === 'function') {
          const linksData = window.generateLinksPageData(page.linksData, projectConfig);
          page.subtitle = linksData.subtitle;
          page.markdown = linksData.markdown;
          page.proseHtml = linksData.proseHtml;
        }

        const isCat = Boolean(page.isCategoryAggregate);
        const mdContent = `---
title: "${(page.title || '').replace(/"/g, '\\"')}"
slug: "${slug}"
type: "page"${isCat ? `\nisCategoryAggregate: true\ncategory: "${(page.categoryAggregate || page.title || '').replace(/"/g, '\\"')}"` : ''}
showTitle: ${page.showTitle !== false}
showSubtitle: ${page.showSubtitle !== false}
updatedAt: "${new Date(page.updatedAt || Date.now()).toISOString()}"
---

${page.markdown || ''}`;

        files.push({
          name: `${folder}/index.md`,
          data: mdContent
        });

        files.push({
          name: `${folder}/draft.json`,
          data: JSON.stringify(page, null, 2)
        });

        // Standalone index.html for published pages
        if (isPublished) {
          try {
            files.push({
              name: `${folder}/index.html`,
              data: generateFullHtml(page)
            });
          } catch (e) {}
        }

        // Related media within this page
        if (page.images && Array.isArray(page.images)) {
          for (const img of page.images) {
            const fname = img.filename;
            if (fname) {
              let blob = img.blob;
              if (!blob && img.dataUrl) {
                blob = dataUrlToBlob(img.dataUrl);
              }
              if (blob && !files.some(f => f.name === `${folder}/${fname}`)) {
                files.push({
                  name: `${folder}/${fname}`,
                  data: blob
                });
              }
            }
          }
        }
      }

      // 4. Site-Wide Media in /media/ (branding logos, author avatars, etc.)
      const brandingSources = {};
      if (projectConfig?.design?.branding?.files) {
        Object.assign(brandingSources, projectConfig.design.branding.files);
      }
      if (window.brandingFiles) {
        Object.assign(brandingSources, window.brandingFiles);
      }
      try {
        const storedBranding = JSON.parse((localStorage.getItem('cedar_branding_files_v1') || localStorage.getItem('outpost_branding_files_v1')) || '{}');
        Object.assign(brandingSources, storedBranding);
      } catch (e) {}

      const brand = (projectConfig && projectConfig.design && projectConfig.design.branding) || {};
      delete brandingSources['images/branding/icon.png'];
      delete brandingSources['blog/images/branding/icon.png'];
      delete brandingSources['images/branding/logo.png'];
      delete brandingSources['blog/images/branding/logo.png'];
      delete brandingSources['images/branding/logo-original.png'];
      delete brandingSources['blog/images/branding/logo-original.png'];
      if (brand.generalLogo && brand.generalLogo.startsWith('data:')) {
        brandingSources['media/branding/logo.png'] = brand.generalLogo;
        brandingSources['media/branding/logo-original.png'] = (brand.originalLogo && brand.originalLogo.startsWith('data:')) ? brand.originalLogo : brand.generalLogo;
      }
      if (brand.tabLogo && brand.tabLogo.startsWith('data:')) {
        brandingSources['media/branding/icon.png'] = brand.tabLogo;
      } else if (!brand.faviconExplicitlyRemoved && !brandingSources['media/branding/icon.png'] && brand.generalLogo && brand.generalLogo.startsWith('data:')) {
        brandingSources['media/branding/icon.png'] = brand.generalLogo;
      }

      for (const [rawPath, fileData] of Object.entries(brandingSources)) {
        const baseName = rawPath.split('/').pop() || 'logo.png';
        const targetPath = `media/branding/${baseName}`;
        if (!files.some(f => f.name === targetPath)) {
          let blob = null;
          if (fileData instanceof Blob) {
            blob = fileData;
          } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
            blob = dataUrlToBlob(fileData);
          }
          if (blob) {
            files.push({
              name: targetPath,
              data: blob
            });
          }
        }
      }

      if (Array.isArray(projectConfig?.authors)) {
        for (const auth of projectConfig.authors) {
          if (auth && typeof auth === 'object' && auth.avatar && auth.avatar.startsWith('data:')) {
            const authSlug = String(auth.name || 'author').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const avPath = `media/authors/${authSlug}_avatar.jpg`;
            if (!files.some(f => f.name === avPath)) {
              const avBlob = dataUrlToBlob(auth.avatar);
              if (avBlob) {
                files.push({ name: avPath, data: avBlob });
              }
            }
          }
        }
      }

      // 4.1 Dedicated Links Media in media/links/
      const linkMediaMap = new Map();

      // A. From projectConfig.mediaLibrary
      if (Array.isArray(projectConfig?.mediaLibrary)) {
        projectConfig.mediaLibrary.forEach(item => {
          if (item && item.filename) {
            const isLink = item.folder === 'media/links' || item.folder === 'links' || item.mediaCategory === 'links' || (Array.isArray(item.tags) && item.tags.includes('links'));
            if (isLink && !linkMediaMap.has(item.filename)) {
              linkMediaMap.set(item.filename, item);
            }
          }
        });
      }

      // B. From page_links.images if present
      const linksPageDraft = drafts.find(d => d && d.type === 'page' && (d.id === 'page_links' || d.slug === 'links'));
      if (linksPageDraft && Array.isArray(linksPageDraft.images)) {
        linksPageDraft.images.forEach(img => {
          if (img && img.filename && !linkMediaMap.has(img.filename)) {
            linkMediaMap.set(img.filename, img);
          }
        });
      }

      // C. From linksData profile avatar and card icons
      if (linksPageDraft && linksPageDraft.linksData) {
        const lData = linksPageDraft.linksData;
        if (lData.profile && lData.profile.avatar) {
          const av = lData.profile.avatar;
          const avFn = av.split('/').pop().split('\\').pop();
          if (avFn && !linkMediaMap.has(avFn)) {
            linkMediaMap.set(avFn, { filename: avFn, src: av, dataUrl: av.startsWith('data:') ? av : undefined });
          }
        }
        if (Array.isArray(lData.items)) {
          lData.items.forEach(it => {
            if (it && it.icon && (it.icon.startsWith('data:') || it.icon.includes('/') || it.icon.includes('.'))) {
              const itFn = it.icon.split('/').pop().split('\\').pop();
              if (itFn && !linkMediaMap.has(itFn)) {
                linkMediaMap.set(itFn, { filename: itFn, src: it.icon, dataUrl: it.icon.startsWith('data:') ? it.icon : undefined });
              }
            }
          });
        }
      }

      for (const [fname, m] of linkMediaMap.entries()) {
        const targetPath = `media/links/${fname}`;
        if (!files.some(f => f.name === targetPath)) {
          let blob = m.blob;
          if (!blob && m.dataUrl && m.dataUrl.startsWith('data:')) {
            blob = dataUrlToBlob(m.dataUrl);
          } else if (!blob && m.src && m.src.startsWith('data:')) {
            blob = dataUrlToBlob(m.src);
          } else if (!blob && typeof imageRegistry !== 'undefined' && imageRegistry.has(fname)) {
            const regItem = imageRegistry.get(fname);
            if (regItem && regItem.dataUrl && regItem.dataUrl.startsWith('data:')) {
              blob = dataUrlToBlob(regItem.dataUrl);
            }
          }
          if (blob) {
            files.push({
              name: targetPath,
              data: blob
            });
          }
        }
      }

      // 4.5 Root Blog Home (index.html) & 1:1 Production Static Assets
      try {
        const prodFiles = await buildProductionSiteFiles({ includeEngineAssets: true });
        for (const pf of prodFiles) {
          if (!files.some(f => f.name === pf.name)) {
            files.push(pf);
          }
        }
      } catch (e) {
        const pubPostsForHome = drafts.filter(d => (d.type === 'post' || !d.type) && (!d.status || d.status === 'published') && !d.hidden && !d.retired);
        files.push({
          name: 'index.html',
          data: generateBlogHomeHtml(pubPostsForHome, projectConfig)
        });
      }

      // 5. RSS 2.0 Syndication Feed (feed.xml and blog/feed.xml — always generated so the site's RSS feed is permanent)
      {
        const publishedPosts = drafts.filter(d => (d.type === 'post' || !d.type) && (!d.status || d.status === 'published') && !d.hidden && !d.retired && !((typeof window.isLinksDraft === 'function' ? window.isLinksDraft(d) : (d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)))));
        const rssXml = generateRssFeedXml(publishedPosts, projectConfig);
        files.push({
          name: 'feed.xml',
          data: rssXml
        });
        files.push({
          name: 'blog/feed.xml',
          data: rssXml
        });
      }

      // 6. vault.json metadata
      files.push({
        name: 'vault.json',
        data: JSON.stringify({
          name: projectConfig.name || 'Cedar Vault',
          createdAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          version: '1.0',
          site: 'Cedar'
        }, null, 2)
      });

      const zipUint8 = await createMultiFileZip(files);
      const zipBlob = (zipUint8 instanceof Blob) ? zipUint8 : new Blob([zipUint8], { type: 'application/zip' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      const safeProject = generateSlug(projectConfig.name) || 'cedar-vault';
      a.download = `${safeProject}-local-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);
    } catch (err) {
      console.error('Failed to export vault zip:', err);
      if (typeof window.showToast === 'function') window.showToast('Error exporting storage: ' + err.message);
    } finally {
      setTimeout(() => {
        isExportingMasterZip = false;
      }, 1500);
    }
  }

  window.exportVaultZip = exportMasterSliceZip;
  window.exportBlogAsZip = exportMasterSliceZip;
  window.exportMasterSliceZip = exportMasterSliceZip;
  window.exportWebProductionZip = exportWebProductionZip;
  window.generateBlogHomeHtml = generateBlogHomeHtml;



  window.parseMarkdownToHtml = parseMarkdownToHtml;
  window.extractYouTubeId = extractYouTubeId;
  window.domToMarkdown = domToMarkdown;
  window.inlineDomToMarkdown = inlineDomToMarkdown;
  window.generateFullHtml = generateFullHtml;
  window.generateBlogCardHtml = generateBlogCardHtml;
  window.generateFeaturedCardHtml = generateFeaturedCardHtml;
  function resolveAutoDetectedSiteBaseUrl(config) {
    if (typeof window !== 'undefined' && typeof window.resolveAutoDetectedSiteBaseUrl === 'function' && window.resolveAutoDetectedSiteBaseUrl !== resolveAutoDetectedSiteBaseUrl) {
      return window.resolveAutoDetectedSiteBaseUrl(config);
    }
    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : (typeof window !== 'undefined' && window.projectConfig ? window.projectConfig : {})) || {};
    const rawDomain = String(cfg.domain || cfg.detectedDomain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const validDomain = (rawDomain && rawDomain !== '[your domain]' && !rawDomain.includes('[') && !/^localhost(?::\d+)?$/i.test(rawDomain) && !/^127\.0\.0\.1(?::\d+)?$/.test(rawDomain))
      ? rawDomain
      : '';

    if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
      const host = String(window.location.hostname || '').toLowerCase();
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      const pathname = String(window.location.pathname || '');
      const isEditorOrPreviewShell = !window.__CEDAR_PRODUCTION__ && (
        pathname === '/preview.html' ||
        pathname.endsWith('/preview.html') ||
        pathname.includes('/preview.html/') ||
        Boolean(typeof document !== 'undefined' && document.getElementById('view-dashboard'))
      );

      let subpath = pathname
        .replace(/\/index\.html$/i, '')
        .replace(/\/preview\.html(?:\/.*)?$/i, '')
        .replace(/\/(?:pages|blog)\/(?:published|drafts|hidden)\/[^/]+\/?$/i, '')
        .replace(/\/(?:rss|feed|links|about-cedar|about|all|all-posts|posts|blog|help)\/?$/i, '');

      if (typeof document !== 'undefined') {
        const markerScript = document.querySelector('script[src*="site-data.js"], script[src*="js/preview/reader.js"]');
        if (markerScript) {
          if (markerScript.src) {
            try {
              const u = new URL(markerScript.src, window.location.origin);
              const m = u.pathname.match(/^(.*)\/(?:site-data\.js|js\/preview\/reader\.js)/i);
              if (m) subpath = m[1] || '';
            } catch (_) {}
          } else {
            const srcAttr = markerScript.getAttribute('src') || '';
            if (srcAttr.startsWith('/') && !srcAttr.startsWith('//')) {
              const m = srcAttr.match(/^(.*)\/(?:site-data\.js|js\/preview\/reader\.js)/i);
              if (m) subpath = m[1] || '';
            }
          }
        }
      }
      subpath = subpath.replace(/\/+$/, '');
      if (subpath && !subpath.startsWith('/')) subpath = '/' + subpath;

      if (!isLocal && !isEditorOrPreviewShell) {
        return `${window.location.origin}${subpath}`;
      }
      if (validDomain) {
        return `https://${validDomain}`;
      }
      if (host === 'cedar.pub' || host === 'www.cedar.pub') {
        return '';
      }
      return `${window.location.origin}${subpath}`;
    }

    if (validDomain) {
      return `https://${validDomain}`;
    }
    return '';
  }
  window.resolveAutoDetectedSiteBaseUrl = resolveAutoDetectedSiteBaseUrl;

  function generateRssPageData(config) {
    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};
    const siteBase = resolveAutoDetectedSiteBaseUrl(cfg);
    const siteName = cfg.name || 'Cedar';

    const postsUrl = siteBase ? `${siteBase}/feed.xml` : '/feed.xml';

    let title = 'RSS';
    let subtitle = 'Follow new posts in your favorite feed reader—no algorithms, no inbox clutter.';
    let markdown = `### How It Works

1. **Copy the feed link** below.
2. **Paste it into any RSS reader**—like [NetNewsWire](https://netnewswire.com), [Feedly](https://feedly.com), [Reeder](https://reederapp.com), or [Inoreader](https://www.inoreader.com).
3. **Done.** Every time a new post goes live on **${siteName}**, it'll show up automatically in your feed.

:::rss-box ${postsUrl}:::`.trim();

    const defaultAuth = (typeof resolveProjectDefaultAuthor === 'function')
      ? resolveProjectDefaultAuthor()
      : ((cfg && cfg.defaultAuthor) || '');

    let proseHtml = '';
    try {
      proseHtml = parseMarkdownToHtml(markdown);
    } catch (e) {}

    return {
      title,
      subtitle,
      markdown,
      proseHtml,
      authorName: defaultAuth
    };
  }

  function syncRssPageDraft(config) {
    if (typeof window !== 'undefined' && typeof window.syncRssPageDraft === 'function' && window.syncRssPageDraft !== syncRssPageDraft) {
      return window.syncRssPageDraft(config);
    }
    const cfg = config || (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};
    const rssData = generateRssPageData(cfg);
    const targetDrafts = (typeof window !== 'undefined' && Array.isArray(window.drafts))
      ? window.drafts
      : ((typeof drafts !== 'undefined' && Array.isArray(drafts)) ? drafts : []);
    if (typeof window !== 'undefined' && typeof window.deduplicateDrafts === 'function') {
      window.deduplicateDrafts(targetDrafts);
    }
    let rssDraft = targetDrafts.find(d => d && d.type === 'page' && (d.id === 'page_rss' || d.slug === 'rss' || (d.title || '').trim().toLowerCase() === 'rss'));
    if (rssDraft) {
      const isRssOn = !rssDraft.hidden && !rssDraft.retired;
      if (window.projectConfig) window.projectConfig.rssEnabled = isRssOn;
      if (cfg) cfg.rssEnabled = isRssOn;
      try {
        const rssStr = isRssOn ? 'true' : 'false';
        if (localStorage.getItem('cedar_rss_enabled') !== rssStr) {
          localStorage.setItem('cedar_rss_enabled', rssStr);
        }
      } catch (e) {}

      // Refresh default RSS page template while preserving custom user edits
      const curRssMd = String(rssDraft.markdown || '').trim();
      if (!curRssMd || curRssMd.includes('### Available Feeds') || curRssMd.includes('## RSS Syndication') || curRssMd.includes(':::rss-box')) {
        if (rssDraft.subtitle !== rssData.subtitle || rssDraft.markdown !== rssData.markdown) {
          rssDraft.updatedAt = Date.now();
        }
        rssDraft.subtitle = rssData.subtitle;
        rssDraft.markdown = rssData.markdown;
        rssDraft.proseHtml = rssData.proseHtml;
      }
    } else {
      const isRssOn = (typeof resolveProjectRssEnabled === 'function') ? resolveProjectRssEnabled() : (cfg.rssEnabled !== undefined ? Boolean(cfg.rssEnabled) : false);
      rssDraft = {
        id: 'page_rss',
        type: 'page',
        status: 'published',
        title: 'RSS',
        slug: 'rss',
        subtitle: rssData.subtitle,
        authorName: rssData.authorName,
        authors: [rssData.authorName],
        authorInitial: (rssData.authorName || 'A').charAt(0).toUpperCase(),
        markdown: rssData.markdown,
        proseHtml: rssData.proseHtml,
        hidden: !isRssOn,
        retired: !isRssOn,
        images: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        publishedAt: Date.now(),
        date: new Date().toISOString().split('T')[0],
        publishedDate: new Date().toISOString().split('T')[0]
      };
      targetDrafts.push(rssDraft);
    }
    return rssDraft;
  }

  window.generateRssPageData = generateRssPageData;
  window.syncRssPageDraft = syncRssPageDraft;

  window.generateMarkdownWithFrontmatter = generateMarkdownWithFrontmatter;
  window.generateRssFeedXml = generateRssFeedXml;
  window.exportMasterSliceZip = exportMasterSliceZip;

  window.Cedar.compiler = {
    parseMarkdownToHtml,
    extractYouTubeId,
    domToMarkdown,
    inlineDomToMarkdown,
    prepareProseForPublish,
    generateFullHtml,
    generateLinktreeHtmlForCompile,
    generateBlogCardHtml,
    generateFeaturedCardHtml,
    generateMarkdownWithFrontmatter,
    generateRssFeedXml,
    exportMasterSliceZip
  };
  window.Outpost.compiler = window.Cedar.compiler;
})();
