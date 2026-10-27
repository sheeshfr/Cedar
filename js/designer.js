/**
 * Cedar - Site Designer
 * Modular customization controls for Header Alignment, Branding, Featured Stories,
 * Post Feed Layout, Category Bar, Author Bar, and Editor Themes.
 */
(function () {
  'use strict';

  const LAYOUT_THEMES = {
    'no_featured': {
      id: 'no_featured',
      name: 'No Featured',
      blocks: [
        { id: 'b_masthead', type: 'masthead', x: 0, relX: 0, y: 0, w: 1920, h: 64, config: {} },
        { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 64, w: 1280, h: 384, config: { title: 'Latest Publications', limit: 4, cols: 2, layoutStyle: 'vertical' } },
        { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 448, w: 1280, h: 64, stretchWidth: false, config: {} }
      ]
    },
    'with_featured': {
      id: 'with_featured',
      name: 'With Featured',
      blocks: [
        { id: 'b_masthead', type: 'masthead', x: 0, relX: 0, y: 0, w: 1920, h: 64, config: {} },
        { id: 'b_spotlight', type: 'spotlight', x: 0, relX: 0, y: 64, w: 1920, h: 500, config: { layout: 'immersive' } },
        { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 628, w: 1280, h: 384, config: { title: 'Recent Stories', limit: 3, cols: 3, layoutStyle: 'vertical' } },
        { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 1012, w: 1280, h: 64, stretchWidth: false, config: {} }
      ]
    },
    'long_articles': {
      id: 'long_articles',
      name: 'Long Articles w/ Featured',
      blocks: [
        { id: 'b_masthead', type: 'masthead', x: 320, relX: 0, y: 0, w: 1280, h: 64, config: {} },
        { id: 'b_spotlight', type: 'spotlight', x: 320, relX: 0, y: 64, w: 1280, h: 256, config: {} },
        { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 320, w: 1280, h: 384, config: { title: 'Feed', limit: 3, cols: 1, layoutStyle: 'horizontal' } },
        { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 704, w: 1280, h: 64, stretchWidth: false, config: {} }
      ]
    },
    'no_featured_author': {
      id: 'no_featured_author',
      name: 'No Featured w/ Author Bar',
      blocks: [
        { id: 'b_masthead', type: 'masthead', x: 0, relX: 0, y: 0, w: 1920, h: 64, config: {} },
        { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 164, w: 1280, h: 300, config: { title: 'News', limit: 3, cols: 3, layoutStyle: 'vertical' } },
        { id: 'b_authors', type: 'authors', x: 320, relX: 0, y: 464, w: 1280, h: 200, config: {} },
        { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 664, w: 1280, h: 64, stretchWidth: false, config: {} }
      ]
    },
    'featured_category': {
      id: 'featured_category',
      name: 'Featured w/ Category Bar',
      blocks: [
        { id: 'b_masthead', type: 'masthead', x: 320, relX: 0, y: 0, w: 1280, h: 64, config: {} },
        { id: 'b_categories', type: 'categories_shelf', x: 320, relX: 0, y: 64, w: 1280, h: 100, config: {} },
        { id: 'b_spotlight', type: 'spotlight', x: 320, relX: 0, y: 164, w: 1280, h: 300, config: {} },
        { id: 'b_feed', type: 'post_feed', x: 320, relX: 0, y: 464, w: 1280, h: 384, config: { title: 'More Articles', limit: 4, cols: 2, layoutStyle: 'vertical' } },
        { id: 'b_footer', type: 'footer', x: 320, relX: 0, y: 848, w: 1280, h: 64, stretchWidth: false, config: {} }
      ]
    }
  };

  // Compatibility aliases
  LAYOUT_THEMES['25XX'] = LAYOUT_THEMES['featured_category'];
  LAYOUT_THEMES['24XX'] = LAYOUT_THEMES['no_featured_author'];
  LAYOUT_THEMES['22XX'] = LAYOUT_THEMES['long_articles'];
  LAYOUT_THEMES['18XX'] = LAYOUT_THEMES['no_featured'];
  LAYOUT_THEMES['17XX'] = LAYOUT_THEMES['with_featured'];
  LAYOUT_THEMES['19XX'] = LAYOUT_THEMES['no_featured'];
  LAYOUT_THEMES['20XX'] = LAYOUT_THEMES['no_featured'];
  LAYOUT_THEMES['21XX'] = LAYOUT_THEMES['no_featured'];
  LAYOUT_THEMES['23XX'] = LAYOUT_THEMES['no_featured'];
  LAYOUT_THEMES['26XX'] = LAYOUT_THEMES['no_featured'];

  let designerEventsBound = false;
  let designerPreviewDevice = (function() {
    try {
      return localStorage.getItem('cedar_designer_preview_device') || 'tablet';
    } catch (_) {
      return 'tablet';
    }
  })();

  function setDesignerPreviewDevice(device) {
    if (device !== 'tablet' && device !== 'mobile') {
      device = 'tablet';
    }
    designerPreviewDevice = device;
    try {
      localStorage.setItem('cedar_designer_preview_device', device);
    } catch (_) {}

    const switcher = document.getElementById('designer-preview-device-switcher');
    if (switcher) {
      const btns = switcher.querySelectorAll('[data-designer-device]');
      btns.forEach(btn => {
        const isMatch = btn.getAttribute('data-designer-device') === device;
        btn.classList.toggle('active', isMatch);
      });
    }

    const viewport = document.getElementById('designer-preview-viewport');
    if (viewport) {
      const isMobile = (device === 'mobile');
      viewport.className = `designer-device-viewport ${isMobile ? 'device-mobile' : 'device-tablet'}`;
      viewport.style.maxWidth = isMobile ? '420px' : '100%';
      viewport.style.width = isMobile ? '420px' : '100%';
    }

    const addrText = document.getElementById('designer-preview-address-text');
    if (addrText) {
      addrText.textContent = device === 'mobile' ? 'preview.html#/ (Mobile 420px)' : 'preview.html#/';
    }

    renderLivePreview();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getDesignerState() {
    const design = window.projectConfig?.design || {};
    const masthead = design.masthead || {};
    const blocks = Array.isArray(design.homeBlocks) ? design.homeBlocks : [];
    const mhBlock = blocks.find(b => b.id === 'b_masthead');

    // 1. Header Alignment: 'left' vs 'center' (default 'center')
    const rawAlign = design.headerAlign || (mhBlock && (mhBlock.align || (mhBlock.config && mhBlock.config.align))) || masthead.align || 'center';
    const headerAlign = rawAlign === 'left' ? 'left' : 'center';

    // 2. Branding Display: 'logo', 'both', 'title'
    let branding = design.brandingMode || design.branding;
    if (!branding || typeof branding !== 'string' || !['logo', 'both', 'title'].includes(branding)) {
      const els = masthead.elements || {};
      const hasLogo = els.logo?.enabled !== false;
      const hasTitle = els.title?.enabled !== false;
      if (hasLogo && !hasTitle) branding = 'logo';
      else if (!hasLogo && hasTitle) branding = 'title';
      else branding = 'both';
    }

    // 3. Featured Spotlight: true vs false + Featured Logic ('manual' | 'latest' | 'category')
    const hasFeatured = design.featured !== undefined
      ? Boolean(design.featured)
      : (blocks.length > 0 ? blocks.some(b => b.type === 'spotlight' && b.enabled !== false) : true);
    const spotlightBlock = blocks.find(b => b.type === 'spotlight');
    const sCfg = spotlightBlock?.config || {};
    const rawFeaturedMode = design.featuredMode || sCfg.featuredMode || 'latest';
    const featuredMode = (rawFeaturedMode === 'category') ? 'category' : 'latest';

    const validCats = (window.projectConfig?.categories || [])
      .map(c => typeof c === 'object' ? (c.name || c.title || '') : String(c))
      .map(s => s.trim())
      .filter(s => s && s.toLowerCase() !== 'uncategorized' && s.toLowerCase() !== 'posts');
    let featuredCategory = (design.featuredCategory || sCfg.featuredCategory || '').trim();
    if ((!featuredCategory || !validCats.includes(featuredCategory)) && validCats.length > 0) {
      featuredCategory = validCats[0];
    }

    // 4. Post Feed Layout: 'grid' vs 'row' (default 'grid')
    const feedBlock = blocks.find(b => b.type === 'post_feed');
    const fCfg = feedBlock?.config || {};
    const postLayout = design.postLayout || ((fCfg.layoutStyle === 'horizontal' || fCfg.cols === 1) ? 'row' : 'grid');

    // 5. Category Bar: true vs false (default true)
    const hasCategoryBar = design.categoryBar !== undefined
      ? Boolean(design.categoryBar)
      : (blocks.length > 0 ? blocks.some(b => b.type === 'categories_shelf' && b.enabled !== false) : true);

    // 6. Logo & Title Scale (0.5x to 3.0x, default 1.0, snapped to 0.5 increments)
    const els = masthead.elements || {};
    const rawLogoScale = els.logo?.scale ?? design.logoScale ?? (design.branding && design.branding.logoScale) ?? 1.0;
    const rawTitleScale = els.title?.scale ?? design.titleScale ?? (design.branding && design.branding.titleScale) ?? 1.0;
    const roundSnap = (val) => Math.min(3.0, Math.max(0.5, Math.round(Number(val) * 2) / 2 || 1.0));
    const logoScale = roundSnap(rawLogoScale);
    const titleScale = roundSnap(rawTitleScale);
    const showcaseSwoosh = design.showcaseSwoosh || design.backgroundSwoosh || 'jazz_cup';
    const showcaseSwooshSeed = Number(design.showcaseSwooshSeed) || 133742;
    const showcaseSwooshMap = (design.showcaseSwooshMap && typeof design.showcaseSwooshMap === 'object') ? design.showcaseSwooshMap : {};
    const siteFont = design.siteFont || 'inter';
    const titleFont = design.titleFont || siteFont || 'inter';

    return {
      headerAlign,
      branding,
      logoScale,
      titleScale,
      featured: hasFeatured,
      featuredMode,
      featuredCategory,
      postLayout,
      categoryBar: hasCategoryBar,
      showcaseSwoosh,
      showcaseSwooshSeed,
      showcaseSwooshMap,
      siteFont,
      titleFont
    };
  }

  const SWOOSH_CONCRETE_STYLES = ['jazz_cup', 'highlighter', 'comic_pop', 'aura_wash', 'arcade_neon', 'paper_cut'];

  function hashSwooshSeed(seedNum, keyStr, idx) {
    let h = ((Number(seedNum) || 133742) ^ 0x9e3779b9) >>> 0;
    const s = `${seedNum}::${keyStr}::${idx}`;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b) >>> 0;
      h = (h ^ (h >>> 13)) >>> 0;
    }
    h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function computeRandomSwooshMap(seedNum, postsList, existingMap) {
    const rawList = Array.isArray(postsList) ? postsList : (Array.isArray(window.drafts) ? window.drafts : []);
    const validPosts = rawList.filter(p => p && p.type !== 'page' && !p.isCategoryAggregate && !String(p.id || '').startsWith('page_'));
    const getPostKey = (item) => String(item?.id || item?.slug || item?.title || 'post');
    const getPostTime = (item) => {
      const t = new Date(item.publishedDate || item.date || item.publishedAt || item.createdAt || 0).getTime();
      if (!isNaN(t) && t > 0) return t;
      return Number(item.publishedAt || item.createdAt || 0) || 0;
    };

    const sorted = [...validPosts].sort((a, b) => {
      const tA = getPostTime(a);
      const tB = getPostTime(b);
      if (tA !== tB) return tA - tB;
      const cA = Number(a.createdAt || 0);
      const cB = Number(b.createdAt || 0);
      if (cA !== cB) return cA - cB;
      return getPostKey(a).localeCompare(getPostKey(b));
    });

    const outMap = {};
    const recentAll = [];
    const recentNoCover = [];

    sorted.forEach((p, idx) => {
      const key = getPostKey(p);
      const hasCover = Boolean((p.coverImage || p.featuredImage || p.heroImage || p.banner || p.image || '').trim());
      const hasNoCover = !hasCover;
      const preserved = existingMap && existingMap[key] && SWOOSH_CONCRETE_STYLES.includes(existingMap[key].style)
        ? existingMap[key]
        : null;

      let chosenStyle = '';
      let varSeed = '';

      if (preserved) {
        chosenStyle = preserved.style;
        varSeed = preserved.varSeed || `${seedNum}:${key}:${idx}`;
      } else {
        let eligible = SWOOSH_CONCRETE_STYLES.filter(st => {
          if (recentAll.includes(st)) return false;
          if (hasNoCover && recentNoCover.includes(st)) return false;
          return true;
        });
        if (eligible.length === 0) {
          eligible = SWOOSH_CONCRETE_STYLES.filter(st => !recentAll.includes(st));
        }
        if (eligible.length === 0) {
          eligible = SWOOSH_CONCRETE_STYLES.slice();
        }
        const h = hashSwooshSeed(seedNum, key, idx);
        chosenStyle = eligible[h % eligible.length];
        varSeed = `${seedNum}:${key}:${h}`;
      }

      recentAll.push(chosenStyle);
      if (recentAll.length > 2) recentAll.shift();
      if (hasNoCover) {
        recentNoCover.push(chosenStyle);
        if (recentNoCover.length > 2) recentNoCover.shift();
      }

      outMap[key] = { style: chosenStyle, varSeed };
      if (p.id) outMap[String(p.id)] = { style: chosenStyle, varSeed };
      if (p.slug) outMap[String(p.slug)] = { style: chosenStyle, varSeed };
    });

    return outMap;
  }
  window.computeRandomSwooshMap = computeRandomSwooshMap;

  function resolvePostSwooshAssignment(postOrKey, allPostsOpt, designCfgOpt) {
    const cfgDesign = designCfgOpt || (window.projectConfig && window.projectConfig.design) || {};
    const rawMode = cfgDesign.showcaseSwoosh || cfgDesign.backgroundSwoosh || 'jazz_cup';
    const postObj = (postOrKey && typeof postOrKey === 'object') ? postOrKey : null;
    const postKey = postObj
      ? String(postObj.id || postObj.slug || postObj.title || 'post')
      : String(postOrKey || 'post');

    if (rawMode !== 'random') {
      return { style: rawMode, varSeed: postKey };
    }

    const seedNum = Number(cfgDesign.showcaseSwooshSeed) || 133742;
    const savedMap = (cfgDesign.showcaseSwooshMap && typeof cfgDesign.showcaseSwooshMap === 'object')
      ? cfgDesign.showcaseSwooshMap
      : null;

    if (savedMap) {
      const hit = savedMap[postKey] || (postObj && postObj.id && savedMap[String(postObj.id)]) || (postObj && postObj.slug && savedMap[String(postObj.slug)]);
      if (hit && SWOOSH_CONCRETE_STYLES.includes(hit.style)) {
        return { style: hit.style, varSeed: hit.varSeed || `${seedNum}:${postKey}` };
      }
    }

    const fullMap = computeRandomSwooshMap(seedNum, allPostsOpt || window.drafts || [], savedMap);
    const computedHit = fullMap[postKey] || (postObj && postObj.id && fullMap[String(postObj.id)]) || (postObj && postObj.slug && fullMap[String(postObj.slug)]);
    if (computedHit) return computedHit;

    const fallbackH = hashSwooshSeed(seedNum, postKey, 0);
    return {
      style: SWOOSH_CONCRETE_STYLES[fallbackH % SWOOSH_CONCRETE_STYLES.length],
      varSeed: `${seedNum}:${postKey}:${fallbackH}`
    };
  }
  window.resolvePostSwooshAssignment = resolvePostSwooshAssignment;

  if (typeof window.buildShowcaseSwooshSvg !== 'function') {
    window.buildShowcaseSwooshSvg = function buildShowcaseSwooshSvg(swooshType, seed, postObj) {
      let type = swooshType || 'jazz_cup';
      if (type === 'none') return '';
      let effSeed = seed;
      if (type === 'random') {
        const resolved = resolvePostSwooshAssignment(postObj || seed);
        type = resolved.style || 'jazz_cup';
        effSeed = resolved.varSeed || seed;
      }
      if (type === 'none') return '';
      let hash = 0;
      const s = String(effSeed || 'cedar');
      for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
      }
      const v = Math.abs(hash) % 4;
      if (type === 'paper_cut') {
        const vars = [
          `<g class="splash-brush-base"><polygon points="6,52 72,38 58,92 80,142 12,154 28,102" /><polygon points="348,34 414,48 394,98 410,148 340,136 362,86" /><polygon points="48,24 368,18 354,158 36,164" /><polygon points="20,24 26,14 32,24 26,34" /><polygon points="396,22 402,12 408,22 402,32" /></g><g class="splash-brush-accent"><polygon points="60,36 356,30 342,146 48,152" fill="none" stroke-width="5" stroke-dasharray="14 8" /><path d="M48,94 L142,58 L278,124 L362,82" fill="none" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter" /></g>`,
          `<g class="splash-brush-base"><polygon points="14,38 228,16 212,158 6,144" /><polygon points="196,28 410,20 396,162 182,150" /><polygon points="398,142 406,130 414,142 406,154" /><polygon points="12,156 20,144 28,156 20,168" /></g><g class="splash-brush-accent"><polyline points="26,52 216,32 202,144 384,148 396,36" fill="none" stroke-width="7" stroke-dasharray="16 8" /><path d="M22,98 L208,68 L214,116 L398,84" fill="none" stroke-width="13" stroke-linecap="square" stroke-linejoin="miter" /></g>`,
          `<g class="splash-brush-base"><polygon points="10,26 408,18 390,62 412,92 394,158 14,164 32,96 8,60" /><polygon points="24,14 30,4 36,14 30,24" /><polygon points="388,164 394,154 400,164 394,174" /></g><g class="splash-brush-accent"><path d="M28,42 L392,34 M36,144 L380,138" fill="none" stroke-width="6" stroke-dasharray="12 8" /><polyline points="24,88 118,54 210,122 304,52 396,92" fill="none" stroke-width="13" stroke-linecap="square" stroke-linejoin="miter" /></g>`,
          `<g class="splash-brush-base"><polygon points="8,64 376,16 392,118 24,164" /><polygon points="36,22 412,48 396,154 20,126" /><polygon points="16,32 22,20 28,32 22,44" /><polygon points="402,26 408,14 414,26 408,38" /></g><g class="splash-brush-accent"><polygon points="48,36 398,60 384,140 34,114" fill="none" stroke-width="6" stroke-dasharray="14 8" /><path d="M20,112 L398,68" fill="none" stroke-width="14" stroke-linecap="square" /></g>`
        ];
        return `<svg class="post-card-showcase-splash" data-swoosh="paper_cut" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
      }
      if (type === 'highlighter') {
        const vars = [
          `<g class="splash-brush-base"><polygon points="18,46 392,24 408,76 4,98" /><polygon points="10,92 414,68 398,136 28,154" /></g><g class="splash-brush-accent"><path d="M22,88 L396,62" fill="none" stroke-width="18" stroke-linecap="square" /><path d="M44,126 L372,104" fill="none" stroke-width="8" stroke-linecap="square" opacity="0.65" /></g>`,
          `<g class="splash-brush-base"><polygon points="26,32 378,20 390,62 14,74" /><polygon points="6,72 412,56 402,106 18,120" /><polygon points="36,114 388,98 376,148 24,160" /></g><g class="splash-brush-accent"><path d="M18,74 L402,54" fill="none" stroke-width="14" stroke-linecap="square" /><path d="M38,132 L380,114" fill="none" stroke-width="10" stroke-linecap="square" opacity="0.7" /></g>`,
          `<g class="splash-brush-base"><polygon points="8,42 406,18 394,88 414,96 396,152 16,164 28,104 4,94" /></g><g class="splash-brush-accent"><path d="M14,66 L398,42" fill="none" stroke-width="15" stroke-linecap="square" /><path d="M24,118 L386,96" fill="none" stroke-width="12" stroke-linecap="square" opacity="0.6" /></g>`,
          `<g class="splash-brush-base"><polygon points="12,36 398,22 410,66 24,82" /><polygon points="390,54 38,118 20,156 404,96" /><polygon points="18,114 412,96 398,154 8,166" /></g><g class="splash-brush-accent"><path d="M26,58 L392,42 L34,132 L396,118" fill="none" stroke-width="12" stroke-linecap="butt" stroke-linejoin="bevel" /></g>`
        ];
        return `<svg class="post-card-showcase-splash" data-swoosh="highlighter" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
      }
      if (type === 'comic_pop') {
        const vars = [
          `<g class="splash-brush-base"><polygon points="24,34 398,18 412,138 8,158" /><circle cx="18" cy="24" r="6" /><circle cx="404" cy="154" r="7" /><circle cx="386" cy="164" r="4.5" /></g><g class="splash-brush-accent"><polygon points="36,46 408,30 394,150 20,166" fill="none" stroke-width="6" stroke-linejoin="miter" /><path d="M28,96 L74,64 L112,110 L164,58 L208,108 L262,54 L308,106 L362,52 L398,88" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" /></g>`,
          `<g class="splash-brush-base"><polygon points="8,88 38,54 22,26 114,40 168,14 236,36 312,14 348,42 408,24 388,78 416,124 354,138 372,166 278,148 212,170 148,146 62,168 78,132 10,140" /></g><g class="splash-brush-accent"><path d="M34,76 L386,52 M28,112 L392,88 M56,138 L364,120" fill="none" stroke-width="9" stroke-linecap="round" /></g>`,
          `<g class="splash-brush-base"><polygon points="10,52 384,22 406,96 28,128" /><polygon points="32,88 412,64 392,152 14,166" /><polygon points="396,18 414,32 390,38" /><polygon points="8,142 26,158 6,164" /></g><g class="splash-brush-accent"><path d="M20,104 Q56,52 92,102 T164,98 T236,94 T308,90 T380,86" fill="none" stroke-width="13" stroke-linecap="round" /></g>`,
          `<g class="splash-brush-base"><polygon points="16,28 408,22 384,84 414,96 392,158 10,162 36,98 6,86" /></g><g class="splash-brush-accent"><polyline points="28,44 394,38 372,88 398,98 380,146 24,150" fill="none" stroke-width="8" /><path d="M42,88 L378,72" fill="none" stroke-width="14" stroke-linecap="round" opacity="0.7" /></g>`
        ];
        return `<svg class="post-card-showcase-splash" data-swoosh="comic_pop" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
      }
      if (type === 'aura_wash') {
        const vars = [
          `<g class="splash-brush-base"><path d="M16,96 C10,50 68,20 142,32 C196,12 278,14 328,36 C384,26 418,62 408,104 C416,144 362,168 298,154 C238,172 152,170 98,150 C38,164 4,132 16,96 Z" /><circle cx="24" cy="34" r="6" /><circle cx="396" cy="28" r="5" /><circle cx="404" cy="152" r="6.5" /></g><g class="splash-brush-accent"><path d="M18,102 C82,42 154,142 224,82 C288,28 346,128 404,72" fill="none" stroke-width="14" stroke-linecap="round" /><path d="M32,122 C96,68 166,156 236,102 C298,52 354,140 396,94" fill="none" stroke-width="6" stroke-linecap="round" opacity="0.6" /></g>`,
          `<g class="splash-brush-base"><path d="M8,84 C14,34 88,16 164,34 C224,10 318,16 378,44 C420,64 416,126 372,148 C312,174 218,166 154,148 C82,168 12,142 8,84 Z" /><circle cx="392" cy="30" r="7" /><circle cx="18" cy="148" r="5.5" /></g><g class="splash-brush-accent"><path d="M22,78 C94,134 172,26 248,88 C312,140 364,48 402,84" fill="none" stroke-width="15" stroke-linecap="round" /></g>`,
          `<g class="splash-brush-base"><path d="M12,112 C28,54 112,18 208,26 C298,14 392,32 412,82 C422,128 352,166 258,158 C162,172 48,164 12,112 Z" /><circle cx="44" cy="32" r="5" /><circle cx="378" cy="158" r="6" /></g><g class="splash-brush-accent"><path d="M16,86 Q114,32 210,86 T404,86" fill="none" stroke-width="13" stroke-linecap="round" /><path d="M24,116 Q118,64 214,116 T396,116" fill="none" stroke-width="7" stroke-linecap="round" opacity="0.65" /></g>`,
          `<g class="splash-brush-base"><path d="M20,68 C36,22 132,14 218,32 C304,12 404,34 410,92 C414,146 326,170 232,154 C138,172 28,152 10,104 C4,86 12,78 20,68 Z" /></g><g class="splash-brush-accent"><path d="M20,118 C112,28 298,154 398,56" fill="none" stroke-width="16" stroke-linecap="round" /><path d="M42,64 C138,148 286,28 384,116" fill="none" stroke-width="6" stroke-linecap="round" opacity="0.55" /></g>`
        ];
        return `<svg class="post-card-showcase-splash" data-swoosh="aura_wash" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
      }
      if (type === 'arcade_neon') {
        const vars = [
          `<g class="splash-brush-base"><polygon points="28,28 408,16 386,62 6,74" /><polygon points="18,78 398,66 376,112 4,124" /><polygon points="34,128 412,116 392,158 14,168" /></g><g class="splash-brush-accent"><polyline points="12,114 96,52 134,108 238,34 276,98 378,28 408,64" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" /><polyline points="26,134 108,74 146,126 250,56 286,116 392,48" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7" /></g>`,
          `<g class="splash-brush-base"><polygon points="12,36 396,18 412,56 28,74" /><polygon points="6,82 406,64 392,108 18,126" /><polygon points="24,132 414,114 398,156 10,168" /></g><g class="splash-brush-accent"><polyline points="16,96 210,32 404,96" fill="none" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" /><polyline points="36,128 210,68 384,128" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.65" /></g>`,
          `<g class="splash-brush-base"><polygon points="8,44 412,22 392,92 18,114" /><polygon points="22,98 406,76 384,154 6,168" /></g><g class="splash-brush-accent"><polyline points="10,94 78,94 106,36 142,146 178,44 214,134 248,54 282,124 316,78 410,78" fill="none" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" /></g>`,
          `<g class="splash-brush-base"><polygon points="36,24 414,24 382,72 4,72" /><polygon points="20,78 398,78 366,126 6,126" /><polygon points="44,132 410,132 384,164 18,164" /></g><g class="splash-brush-accent"><path d="M10,136 L406,36" fill="none" stroke-width="15" stroke-linecap="round" /><path d="M24,158 L414,62" fill="none" stroke-width="7" stroke-linecap="round" opacity="0.7" /></g>`
        ];
        return `<svg class="post-card-showcase-splash" data-swoosh="arcade_neon" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${vars[v]}</svg>`;
      }
      const jazzVars = [
        `<g class="splash-brush-base"><path d="M8,136 C48,88 106,42 162,18 C178,11 190,19 178,32 C142,68 92,116 44,158 C24,174 2,154 8,136 Z" /><path d="M52,164 C118,108 198,52 284,16 C304,8 318,20 300,36 C234,88 158,138 88,178 C64,190 36,178 52,164 Z" /><path d="M138,168 C210,122 292,72 378,34 C398,25 412,39 392,54 C324,102 246,144 174,180 C150,190 122,180 138,168 Z" /><path d="M236,162 C292,128 352,94 404,68 C418,61 422,75 408,86 C362,118 308,148 262,172 C244,180 222,170 236,162 Z" /><circle cx="188" cy="18" r="5" /><circle cx="312" cy="22" r="6" /><circle cx="398" cy="36" r="4.5" /><circle cx="28" cy="158" r="5.5" /><circle cx="118" cy="176" r="4.5" /></g><g class="splash-brush-accent"><path d="M16,120 C54,82 88,48 108,44 C120,42 96,102 110,108 C126,114 196,42 228,36 C242,33 214,94 230,100 C248,106 318,40 350,36 C364,34 336,86 352,92 C368,98 394,68 412,56" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" /><path d="M36,132 C72,98 100,68 116,64 C126,62 108,112 122,116 C138,120 206,58 234,52 C246,50 224,104 238,108 C254,112 322,56 352,52" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.65" /></g>`,
        `<g class="splash-brush-base"><path d="M6,124 C64,74 138,32 212,14 C232,9 244,22 224,36 C162,78 96,122 36,156 C14,168 -4,142 6,124 Z" /><path d="M64,162 C144,104 236,48 334,18 C356,11 368,26 346,42 C264,96 178,144 98,178 C72,188 46,176 64,162 Z" /><path d="M168,170 C244,126 326,80 402,44 C418,36 424,52 406,66 C342,110 268,148 198,180 C176,188 152,180 168,170 Z" /><circle cx="242" cy="18" r="5.5" /><circle cx="364" cy="24" r="5" /><circle cx="48" cy="166" r="6" /></g><g class="splash-brush-accent"><path d="M12,108 C68,52 124,32 146,38 C164,44 132,112 154,116 C178,120 262,34 298,32 C316,30 288,102 310,106 C332,110 382,64 410,48" fill="none" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" /><path d="M28,126 C82,74 132,54 152,58 C168,62 144,122 164,126 C186,130 268,52 302,50" fill="none" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" /></g>`,
        `<g class="splash-brush-base"><path d="M12,148 C58,96 118,46 178,18 C194,10 206,20 192,34 C148,74 96,124 46,166 C26,180 4,164 12,148 Z" /><path d="M78,154 C138,100 212,48 292,16 C310,9 322,22 304,36 C242,84 174,132 110,170 C88,182 62,168 78,154 Z" /><path d="M154,168 C222,118 302,66 384,28 C402,20 414,34 396,48 C332,96 258,142 188,178 C166,188 138,180 154,168 Z" /><path d="M252,166 C306,130 362,92 408,62 C420,54 424,68 410,80 C370,114 318,146 276,174 C258,184 238,176 252,166 Z" /><circle cx="204" cy="16" r="5" /><circle cx="322" cy="18" r="5.5" /><circle cx="96" cy="176" r="5" /></g><g class="splash-brush-accent"><path d="M14,126 C46,84 76,48 92,46 C104,44 84,98 96,102 C110,106 162,42 184,38 C196,36 176,94 190,98 C204,102 262,38 286,34 C298,32 278,88 292,92 C308,96 368,42 408,36" fill="none" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" /></g>`,
        `<g class="splash-brush-base"><path d="M4,132 C56,82 124,36 196,16 C216,10 228,24 208,38 C152,78 92,122 38,160 C18,174 -6,150 4,132 Z" /><path d="M68,166 C148,112 242,56 344,20 C366,12 380,26 358,42 C274,98 184,146 104,180 C78,190 50,178 68,166 Z" /><path d="M184,164 C256,122 336,78 406,46 C420,39 424,54 408,66 C348,106 278,144 212,176 C192,184 168,174 184,164 Z" /><circle cx="226" cy="18" r="6" /><circle cx="376" cy="26" r="5" /><circle cx="144" cy="178" r="5" /></g><g class="splash-brush-accent"><path d="M16,76 C88,148 164,18 242,96 C306,160 356,34 408,88" fill="none" stroke-width="16" stroke-linecap="round" /><path d="M28,96 C100,164 176,38 252,112 C314,172 362,54 404,106" fill="none" stroke-width="6.5" stroke-linecap="round" opacity="0.6" /></g>`
      ];
      return `<svg class="post-card-showcase-splash" data-swoosh="jazz_cup" viewBox="-36 -24 492 228" preserveAspectRatio="none" aria-hidden="true">${jazzVars[v]}</svg>`;
    };
  }

  function updateAllPreviewFrames() {
    const frames = [
      document.getElementById('designer-preview-site-frame'),
      document.getElementById('preview-site-frame'),
      document.getElementById('live-preview-iframe')
    ].filter(Boolean);

    const themeId = window.projectConfig?.design?.blogTheme || window.projectConfig?.design?.activeTheme || 'basalt';
    const activeDrafts = (window.CedarStore && typeof window.CedarStore.getAllDrafts === 'function')
      ? window.CedarStore.getAllDrafts()
      : window.drafts;

    frames.forEach(frame => {
      if (!frame) return;

      // Attach one-time load listener so that frames in loading state sync immediately upon completion
      if (!frame._hasUniversalSyncListener) {
        frame._hasUniversalSyncListener = true;
        frame.addEventListener('load', () => {
          updateAllPreviewFrames();
        });
      }

      let syncedDirectly = false;

      // 1. Direct cross-window synchronization (same origin)
      try {
        const cw = frame.contentWindow;
        if (cw && cw.document && cw.document.readyState !== 'loading') {
          // Capture current scroll position so live preview doesn't jump to the top
          const currentScrollY = (cw.pageYOffset !== undefined)
            ? cw.pageYOffset
            : (cw.scrollY !== undefined
                ? cw.scrollY
                : ((cw.document.documentElement ? cw.document.documentElement.scrollTop : 0) || (cw.document.body ? cw.document.body.scrollTop : 0)));

          if (window.projectConfig) {
            cw.projectConfig = JSON.parse(JSON.stringify(window.projectConfig));
            if (typeof cw.setProjectConfig === 'function') {
              cw.setProjectConfig(window.projectConfig);
            }
          }
          if (Array.isArray(activeDrafts)) {
            cw.drafts = JSON.parse(JSON.stringify(activeDrafts));
            if (typeof cw.setDrafts === 'function') {
              cw.setDrafts(activeDrafts);
            }
          }
          if (cw.CedarPreview) {
            if (typeof cw.CedarPreview.setProjectConfig === 'function') {
              cw.CedarPreview.setProjectConfig(window.projectConfig);
            }
            if (typeof cw.CedarPreview.setDrafts === 'function' && Array.isArray(activeDrafts)) {
              cw.CedarPreview.setDrafts(activeDrafts);
            }
          }
          if (typeof cw.applyThemeToPreview === 'function') {
            cw.applyThemeToPreview(themeId);
          }
          if (typeof cw.updateBranding === 'function') {
            cw.updateBranding();
          }
          if (typeof cw.renderApp === 'function') {
            cw.renderApp({ preserveScroll: true, scrollY: currentScrollY });
            syncedDirectly = true;
          } else if (typeof cw.renderHome === 'function') {
            cw.renderHome({ preserveScroll: true, scrollY: currentScrollY });
            syncedDirectly = true;
          }

          // Restore scroll position immediately and on animation frame
          if (typeof currentScrollY === 'number' && currentScrollY > 0) {
            cw.scrollTo({ top: currentScrollY, behavior: 'instant' });
            if (typeof cw.requestAnimationFrame === 'function') {
              cw.requestAnimationFrame(() => {
                cw.scrollTo({ top: currentScrollY, behavior: 'instant' });
              });
            }
          }
        }
      } catch (err) {
        // Suppressed cross-origin or accessing errors
      }

      // 2. PostMessage synchronization fallback (if direct sync was not possible)
      if (!syncedDirectly) {
        try {
          if (frame.contentWindow) {
            const currentScrollY = (frame.contentWindow.pageYOffset !== undefined)
              ? frame.contentWindow.pageYOffset
              : (frame.contentWindow.scrollY !== undefined
                  ? frame.contentWindow.scrollY
                  : ((frame.contentWindow.document && frame.contentWindow.document.documentElement ? frame.contentWindow.document.documentElement.scrollTop : 0) || 0));

            const payload = {
              projectConfig: window.projectConfig ? JSON.parse(JSON.stringify(window.projectConfig)) : null,
              drafts: Array.isArray(activeDrafts) ? JSON.parse(JSON.stringify(activeDrafts)) : [],
              themeId: themeId,
              preserveScroll: true,
              scrollY: currentScrollY
            };
            frame.contentWindow.postMessage(Object.assign({ type: 'CEDAR_WORKSPACE_UPDATED' }, payload), '*');
          }
        } catch (_) {}
      }
    });
  }

  function applyModularDesign(patch, toastMessage) {
    if (!window.projectConfig) window.projectConfig = {};
    if (!window.projectConfig.design) window.projectConfig.design = {};

    const currentState = getDesignerState();
    const newState = Object.assign({}, currentState, patch);

    // Persist ALL explicit flags on projectConfig.design
    window.projectConfig.design.headerAlign = newState.headerAlign;
    window.projectConfig.design.brandingMode = newState.branding;
    window.projectConfig.design.featured = Boolean(newState.featured);
    window.projectConfig.design.featuredMode = newState.featuredMode || 'latest';
    window.projectConfig.design.featuredCategory = newState.featuredCategory || '';
    window.projectConfig.design.postLayout = newState.postLayout || 'grid';
    window.projectConfig.design.categoryBar = Boolean(newState.categoryBar);
    window.projectConfig.design.showcaseSwoosh = newState.showcaseSwoosh || 'jazz_cup';
    window.projectConfig.design.showcaseSwooshSeed = Number(newState.showcaseSwooshSeed) || 133742;
    window.projectConfig.design.showcaseSwooshMap = (newState.showcaseSwoosh === 'random' && newState.showcaseSwooshMap && typeof newState.showcaseSwooshMap === 'object')
      ? newState.showcaseSwooshMap
      : {};
    window.projectConfig.design.siteFont = newState.siteFont || 'inter';
    window.projectConfig.design.titleFont = newState.titleFont || newState.siteFont || 'inter';
    window.projectConfig.design.authorBar = false;

    // 1. Update Masthead Config
    if (!window.projectConfig.design.masthead) {
      window.projectConfig.design.masthead = {};
    }
    const mhH = newState.headerAlign === 'center' ? 96 : 64;
    window.projectConfig.design.masthead.align = newState.headerAlign;
    window.projectConfig.design.masthead.height = mhH;

    const effLogoScale = newState.logoScale ?? 1.0;
    const effTitleScale = newState.titleScale ?? 1.0;
    window.projectConfig.design.logoScale = effLogoScale;
    window.projectConfig.design.titleScale = effTitleScale;
    if (!window.projectConfig.design.branding || typeof window.projectConfig.design.branding !== 'object') {
      window.projectConfig.design.branding = {};
    }
    window.projectConfig.design.branding.logoScale = effLogoScale;
    window.projectConfig.design.branding.titleScale = effTitleScale;

    window.projectConfig.design.masthead.elements = {
      logo: { enabled: newState.branding !== 'title', scale: effLogoScale },
      title: { enabled: newState.branding !== 'logo', scale: effTitleScale },
      nav: { enabled: true }
    };

    // 2. Reconstruct homeBlocks in logical visual order
    const blocks = [];

    // Block 1: Masthead
    blocks.push({
      id: 'b_masthead',
      type: 'masthead',
      x: 0,
      relX: 0,
      y: 0,
      w: 1920,
      h: mhH,
      align: newState.headerAlign,
      stretchWidth: true,
      config: { align: newState.headerAlign }
    });

    let currentY = mhH;

    // Block 2: Spotlight / Featured Story (if enabled)
    if (newState.featured) {
      blocks.push({
        id: 'b_spotlight',
        type: 'spotlight',
        x: 0,
        relX: 0,
        y: currentY,
        w: 1920,
        h: 400,
        config: {
          layout: 'standard',
          featuredMode: newState.featuredMode || 'latest',
          featuredCategory: newState.featuredCategory || ''
        }
      });
      currentY += 400;
    }

    // Block 3: Category Shelf Bar (if enabled, placed right above the post feed)
    if (newState.categoryBar) {
      blocks.push({
        id: 'b_categories',
        type: 'categories_shelf',
        x: 320,
        relX: 0,
        y: currentY,
        w: 1280,
        h: 80,
        config: { title: 'Category' }
      });
      currentY += 80;
    }

    // Block 4: Post Feed (always present)
    const isRow = newState.postLayout === 'row';
    blocks.push({
      id: 'b_feed',
      type: 'post_feed',
      x: 320,
      relX: 0,
      y: currentY,
      w: 1280,
      h: 384,
      stretchWidth: false,
      config: {
        title: isRow ? 'Recent Stories' : 'Latest Publications',
        limit: 4,
        cols: isRow ? 1 : 2,
        layoutStyle: isRow ? 'horizontal' : 'vertical'
      }
    });
    currentY += 384;

    // Block 5: Footer (always present)
    blocks.push({
      id: 'b_footer',
      type: 'footer',
      x: 320,
      relX: 0,
      y: currentY,
      w: 1280,
      h: 64,
      stretchWidth: false,
      config: {}
    });

    window.projectConfig.design.homeBlocks = blocks;
    window.projectConfig.design._layoutThemeName = 'custom';

    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage({ isDesignerSave: true });
    }
    if (typeof window.syncLiveWorkspaceData === 'function') {
      window.syncLiveWorkspaceData();
    }
    if (window.currentDashboardTab === 'posts') {
      if (typeof window.renderAllPostsGrid === 'function') {
        window.renderAllPostsGrid();
      }
      if (typeof window.renderPostsPipeline === 'function') {
        window.renderPostsPipeline();
      }
    }

    // Live update preview frames if active
    updateAllPreviewFrames();

    renderDesigner();

    if (toastMessage && typeof showToast === 'function') {
      showToast(toastMessage);
    }
  }

  function setCornerPreference(isRounded) {
    const roundedBool = Boolean(isRounded);
    const cardCornerStraight = document.getElementById('pref-corner-straight');
    const cardCornerRounded = document.getElementById('pref-corner-rounded');

    if (cardCornerStraight) cardCornerStraight.classList.toggle('active', !roundedBool);
    if (cardCornerRounded) cardCornerRounded.classList.toggle('active', roundedBool);

    if (!window.projectConfig) window.projectConfig = {};
    if (!window.projectConfig.mediaPreferences) window.projectConfig.mediaPreferences = {};
    window.projectConfig.mediaPreferences.roundedImages = roundedBool;
    if (!window.projectConfig.design) window.projectConfig.design = {};
    window.projectConfig.design.roundedImages = roundedBool;

    if (typeof window.applyMediaPreferences === 'function') {
      window.applyMediaPreferences(roundedBool);
    }

    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage({ isDesignerSave: true });
    }

    if (typeof window.syncLiveWorkspaceData === 'function') {
      window.syncLiveWorkspaceData();
    }

    updateAllPreviewFrames();
    renderLivePreview();
  }

  function initDesigner() {
    if (designerEventsBound) return;
    const toggleBtns = document.querySelectorAll('.designer-toggle-btn');
    if (!toggleBtns.length) return;

    designerEventsBound = true;

    // Attach click events for all modular toggle buttons
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // If it's already active (on the right thing), ignore repeat clicks
        if (btn.classList.contains('active')) {
          return;
        }

        const type = btn.getAttribute('data-toggle');
        const val = btn.getAttribute('data-value');
        if (!type) return;

        switch (type) {
          case 'header-align':
            applyModularDesign(
              { headerAlign: val },
              `Header Alignment: ${val === 'center' ? 'Centered' : 'Left'}`
            );
            break;

          case 'branding':
            const brandLabel = val === 'logo' ? 'Just Logo' : (val === 'title' ? 'Just Title' : 'Logo & Title');
            applyModularDesign(
              { branding: val },
              `Header Branding: ${brandLabel}`
            );
            break;

          case 'featured':
            applyModularDesign(
              { featured: val === 'true' },
              val === 'true' ? 'Featured Section Enabled' : 'Featured Section Removed'
            );
            break;

          case 'featured-mode': {
            const modeLabels = {
              latest: 'All - Recent',
              category: 'Category - Recent'
            };
            const curCats = (window.projectConfig?.categories || [])
              .map(c => typeof c === 'object' ? (c.name || c.title || '') : String(c))
              .map(s => s.trim())
              .filter(s => s && s.toLowerCase() !== 'uncategorized' && s.toLowerCase() !== 'posts');
            const curSt = getDesignerState();
            const nextCat = (curSt.featuredCategory && curCats.includes(curSt.featuredCategory))
              ? curSt.featuredCategory
              : (curCats[0] || '');
            applyModularDesign(
              { featuredMode: val, featuredCategory: nextCat },
              `Featured Logic: ${modeLabels[val] || val}`
            );
            break;
          }

          case 'post-layout':
            applyModularDesign(
              { postLayout: val },
              `Post Feed: ${val === 'row' ? 'Row Layout' : 'Grid Layout'}`
            );
            break;

          case 'cat-bar':
            applyModularDesign(
              { categoryBar: val === 'true' },
              val === 'true' ? 'Category Bar Enabled' : 'Category Bar Removed'
            );
            break;
        }
      });
    });

    const swooshBtns = document.querySelectorAll('.designer-swoosh-btn[data-toggle="showcase-swoosh"]');
    const swooshLabels = {
      none: 'None',
      random: '¿Random?',
      jazz_cup: '90s Cup',
      highlighter: 'Highlighter',
      comic_pop: 'Comic Pop',
      aura_wash: 'Aura Wash',
      arcade_neon: 'Arcade Neon',
      paper_cut: 'Paper Cut'
    };
    swooshBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        const val = btn.getAttribute('data-value') || 'jazz_cup';
        if (val === 'random') {
          const prevSeed = Number(window.projectConfig?.design?.showcaseSwooshSeed) || 133742;
          const prevLastMap = window.projectConfig?.design?._lastRandomSwooshMap || null;
          let nextSeed = Math.floor(Math.random() * 8999999) + 1000000;
          if (nextSeed === prevSeed) nextSeed += 7919;
          let nextMap = computeRandomSwooshMap(nextSeed, window.drafts || [], null);
          if (prevLastMap && typeof prevLastMap === 'object') {
            for (let attempt = 0; attempt < 12; attempt++) {
              const keys = Object.keys(nextMap);
              const isDifferent = keys.length === 0 || keys.some(k => !prevLastMap[k] || prevLastMap[k].style !== nextMap[k].style);
              if (isDifferent) break;
              nextSeed = Math.floor(Math.random() * 8999999) + 1000000 + (attempt + 1) * 104729;
              nextMap = computeRandomSwooshMap(nextSeed, window.drafts || [], null);
            }
          }
          if (window.projectConfig && window.projectConfig.design) {
            window.projectConfig.design._lastRandomSwooshMap = nextMap;
          }
          applyModularDesign(
            { showcaseSwoosh: 'random', showcaseSwooshSeed: nextSeed, showcaseSwooshMap: nextMap },
            `Background Swoosh: ${swooshLabels[val] || val}`
          );
        } else {
          applyModularDesign(
            { showcaseSwoosh: val, showcaseSwooshMap: {} },
            `Background Swoosh: ${swooshLabels[val] || val}`
          );
        }
      });
    });

    const fontLabels = {
      inter: 'Inter',
      plus_jakarta: 'Plus Jakarta Sans',
      lora: 'Lora',
      space_grotesk: 'Space Grotesk',
      fraunces: 'Fraunces',
      syne: 'Syne',
      jetbrains_mono: 'JetBrains Mono',
      shantell_sans: 'Shantell Sans'
    };

    const titleFontSelect = document.getElementById('designer-title-font-select');
    if (titleFontSelect && !titleFontSelect._hasFontListener) {
      titleFontSelect._hasFontListener = true;
      titleFontSelect.addEventListener('change', () => {
        const val = titleFontSelect.value || 'inter';
        applyModularDesign(
          { titleFont: val },
          `Title Font: ${fontLabels[val] || val}`
        );
      });
    }

    const siteFontSelect = document.getElementById('designer-site-font-select');
    if (siteFontSelect && !siteFontSelect._hasFontListener) {
      siteFontSelect._hasFontListener = true;
      siteFontSelect.addEventListener('change', () => {
        const val = siteFontSelect.value || 'inter';
        applyModularDesign(
          { siteFont: val },
          `Website Font: ${fontLabels[val] || val}`
        );
      });
    }

    const featCatSelect = document.getElementById('designer-featured-category-select');
    if (featCatSelect && !featCatSelect._hasCatListener) {
      featCatSelect._hasCatListener = true;
      featCatSelect.addEventListener('change', () => {
        const selectedCat = featCatSelect.value;
        applyModularDesign(
          { featuredCategory: selectedCat },
          selectedCat ? `Featured Category: ${selectedCat}` : 'Featured Category Updated'
        );
      });
    }

    // Logo & Title Size Sliders
    const logoScaleSlider = document.getElementById('designer-logo-scale-slider');
    const logoScaleVal = document.getElementById('designer-logo-scale-val');
    const titleScaleSlider = document.getElementById('designer-title-scale-slider');
    const titleScaleVal = document.getElementById('designer-title-scale-val');

    function snapToHalf(v) {
      const parsed = parseFloat(v);
      if (isNaN(parsed)) return 1.0;
      const clamped = Math.min(3.0, Math.max(0.5, parsed));
      return Math.round(clamped * 2) / 2;
    }

    function syncLiveBrandingToFrames() {
      const frames = [
        document.getElementById('designer-preview-site-frame'),
        document.getElementById('preview-site-frame')
      ].filter(Boolean);

      frames.forEach(frame => {
        try {
          const cw = frame.contentWindow;
          if (cw) {
            if (cw.projectConfig) {
              if (!cw.projectConfig.design) cw.projectConfig.design = {};
              Object.assign(cw.projectConfig.design, JSON.parse(JSON.stringify(window.projectConfig.design)));
              if (typeof cw.setProjectConfig === 'function') {
                cw.setProjectConfig(cw.projectConfig);
              }
            }
            if (typeof cw.updateBranding === 'function') {
              cw.updateBranding();
            }
            cw.postMessage({
              type: 'CEDAR_BRANDING_UPDATED',
              projectConfig: window.projectConfig
            }, '*');
          }
        } catch (_) {}
      });
    }

    function updateLogoScale(val, persist = false) {
      const num = snapToHalf(val);
      if (logoScaleVal) logoScaleVal.textContent = `${num.toFixed(1)}x`;
      if (logoScaleSlider && Math.abs(parseFloat(logoScaleSlider.value) - num) > 0.001) {
        logoScaleSlider.value = num;
      }

      if (!window.projectConfig) window.projectConfig = {};
      if (!window.projectConfig.design) window.projectConfig.design = {};
      if (!window.projectConfig.design.masthead) window.projectConfig.design.masthead = {};
      if (!window.projectConfig.design.masthead.elements) window.projectConfig.design.masthead.elements = {};
      if (!window.projectConfig.design.masthead.elements.logo) window.projectConfig.design.masthead.elements.logo = {};

      window.projectConfig.design.masthead.elements.logo.scale = num;
      window.projectConfig.design.logoScale = num;
      if (!window.projectConfig.design.branding || typeof window.projectConfig.design.branding !== 'object') {
        window.projectConfig.design.branding = {};
      }
      window.projectConfig.design.branding.logoScale = num;

      // Always perform instantaneous live branding update across all preview frames
      syncLiveBrandingToFrames();

      if (persist) {
        renderLivePreview();
        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage({ isDesignerSave: true });
        }
        if (typeof window.syncLiveWorkspaceData === 'function') {
          window.syncLiveWorkspaceData();
        }
      }
    }

    function updateTitleScale(val, persist = false) {
      const num = snapToHalf(val);
      if (titleScaleVal) titleScaleVal.textContent = `${num.toFixed(1)}x`;
      if (titleScaleSlider && Math.abs(parseFloat(titleScaleSlider.value) - num) > 0.001) {
        titleScaleSlider.value = num;
      }

      if (!window.projectConfig) window.projectConfig = {};
      if (!window.projectConfig.design) window.projectConfig.design = {};
      if (!window.projectConfig.design.masthead) window.projectConfig.design.masthead = {};
      if (!window.projectConfig.design.masthead.elements) window.projectConfig.design.masthead.elements = {};
      if (!window.projectConfig.design.masthead.elements.title) window.projectConfig.design.masthead.elements.title = {};

      window.projectConfig.design.masthead.elements.title.scale = num;
      window.projectConfig.design.titleScale = num;
      if (!window.projectConfig.design.branding || typeof window.projectConfig.design.branding !== 'object') {
        window.projectConfig.design.branding = {};
      }
      window.projectConfig.design.branding.titleScale = num;

      // Always perform instantaneous live branding update across all preview frames
      syncLiveBrandingToFrames();

      if (persist) {
        renderLivePreview();
        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage({ isDesignerSave: true });
        }
        if (typeof window.syncLiveWorkspaceData === 'function') {
          window.syncLiveWorkspaceData();
        }
      }
    }

    if (logoScaleSlider && !logoScaleSlider._hasScaleListener) {
      logoScaleSlider._hasScaleListener = true;
      logoScaleSlider.addEventListener('input', (e) => {
        updateLogoScale(e.target.value, false);
      });
      logoScaleSlider.addEventListener('change', (e) => {
        updateLogoScale(e.target.value, true);
      });
      logoScaleSlider.addEventListener('pointerup', (e) => {
        updateLogoScale(e.target.value, true);
      });
      logoScaleSlider.addEventListener('mouseup', (e) => {
        updateLogoScale(e.target.value, true);
      });
    }

    if (titleScaleSlider && !titleScaleSlider._hasScaleListener) {
      titleScaleSlider._hasScaleListener = true;
      titleScaleSlider.addEventListener('input', (e) => {
        updateTitleScale(e.target.value, false);
      });
      titleScaleSlider.addEventListener('change', (e) => {
        updateTitleScale(e.target.value, true);
      });
      titleScaleSlider.addEventListener('pointerup', (e) => {
        updateTitleScale(e.target.value, true);
      });
      titleScaleSlider.addEventListener('mouseup', (e) => {
        updateTitleScale(e.target.value, true);
      });
    }

    // Theme color swatches (delegated on container to prevent duplicate listeners across renders)
    const designerPaletteContainer = document.getElementById('designer-color-palettes');
    if (designerPaletteContainer && !designerPaletteContainer._hasThemeClickListener) {
      designerPaletteContainer._hasThemeClickListener = true;
      designerPaletteContainer.addEventListener('click', (e) => {
        const target = e.target.closest('.ftue-theme-swatch');
        if (!target) return;
        e.stopPropagation();
        const palette = target.getAttribute('data-theme-id');
        if (palette) {
          applyColorPalette(palette);
        }
      });
    }

    // Save button
    const btnSave = document.getElementById('btn-designer-save');
    if (btnSave && !btnSave._hasSaveListener) {
      btnSave._hasSaveListener = true;
      btnSave.addEventListener('click', () => {
        const titleInput = document.getElementById('designer-blog-title');
        if (titleInput) {
          const val = titleInput.value.trim();
          if (val) {
            if (!window.projectConfig) window.projectConfig = {};
            window.projectConfig.name = val;
            if (!window.projectConfig.design) window.projectConfig.design = {};
            if (!window.projectConfig.design.branding) window.projectConfig.design.branding = {};
            window.projectConfig.design.branding.siteTitle = val;
          }
        }
        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage({ isDesignerSave: true });
          if (typeof showToast === 'function') showToast('Design settings saved!');
        }
        if (typeof window.syncLiveWorkspaceData === 'function') {
          window.syncLiveWorkspaceData();
        }
      });
    }

    // Media corner preferences
    const cornerGrid = document.getElementById('media-corner-showcase-grid');
    if (cornerGrid && !cornerGrid._hasCornerClickListener) {
      cornerGrid._hasCornerClickListener = true;
      cornerGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.media-corner-choice-card[data-corner-pref]');
        if (!card) return;
        const pref = card.getAttribute('data-corner-pref');
        setCornerPreference(pref === 'rounded');
      });
      cornerGrid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.media-corner-choice-card[data-corner-pref]');
        if (!card) return;
        e.preventDefault();
        const pref = card.getAttribute('data-corner-pref');
        setCornerPreference(pref === 'rounded');
      });
    }

    // Live Preview Device Switcher (Tablet vs Mobile)
    const previewSwitcher = document.getElementById('designer-preview-device-switcher');
    if (previewSwitcher && !previewSwitcher._hasDevListener) {
      previewSwitcher._hasDevListener = true;
      previewSwitcher.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-designer-device]');
        if (!btn) return;
        const dev = btn.getAttribute('data-designer-device');
        if (dev) {
          setDesignerPreviewDevice(dev);
        }
      });
    }

    // Advanced Theme Options: Toggle collapsible panel
    const btnToggleAdv = document.getElementById('btn-toggle-advanced-theme');
    const advPanel = document.getElementById('designer-advanced-theme-panel');
    const chevronAdv = document.getElementById('chevron-advanced-theme');
    if (btnToggleAdv && advPanel && !btnToggleAdv._hasListener) {
      btnToggleAdv._hasListener = true;
      btnToggleAdv.addEventListener('click', () => {
        const isHidden = advPanel.style.display === 'none' || !advPanel.style.display;
        advPanel.style.display = isHidden ? 'block' : 'none';
        if (chevronAdv) {
          chevronAdv.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        if (isHidden) {
          syncAdvancedThemeUI();
        }
      });
    }

    // Advanced Theme Options: Custom Palette Slots (Slot 1, 2, 3)
    const slotButtons = document.querySelectorAll('.custom-palette-slot-btn');
    slotButtons.forEach(btn => {
      if (btn._hasSlotListener) return;
      btn._hasSlotListener = true;
      btn.addEventListener('click', () => {
        const slotIdx = parseInt(btn.getAttribute('data-custom-slot'), 10);
        if (isNaN(slotIdx)) return;
        if (!window.projectConfig) window.projectConfig = {};
        if (!window.projectConfig.design) window.projectConfig.design = {};
        window.projectConfig.design.activeCustomSlotIndex = slotIdx;

        const pals = getCustomPalettes();
        const slot = pals[slotIdx];
        if (slot && slot.isSaved) {
          window.projectConfig.design.customColors = { ...slot };
          window.projectConfig.design.blogTheme = slot.id;
          window.projectConfig.design.activeTheme = slot.id;
          window.projectConfig.editorTheme = slot.id;
          syncDesignerThemeSwatches(slot.id);
          renderLivePreview();
          sendThemeToPreviewFrame(window.projectConfig.design.customColors);
          if ((window.CedarFTUE || window.OutpostFTUE)?.applyLiveTheme) {
            (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(window.projectConfig.design.customColors, true);
          }
          if (typeof window.saveProjectToStorage === 'function') window.saveProjectToStorage();
        }
        syncAdvancedThemeUI();
        if (typeof window.updateSettingsLogoBackground === 'function') {
          window.updateSettingsLogoBackground();
        }
      });
    });

    // Advanced Theme Options: Save Button underneath swatches
    const btnSaveCustom = document.getElementById('btn-save-custom-palette');
    if (btnSaveCustom && !btnSaveCustom._hasSaveListener) {
      btnSaveCustom._hasSaveListener = true;
      btnSaveCustom.addEventListener('click', () => {
        saveCustomPaletteSlot();
      });
    }

    // Advanced Theme Options: Paired Color Pickers & Hex Inputs
    const colorProps = [
      { pickerId: 'picker-color-bg', hexId: 'hex-color-bg', prop: 'c60' },
      { pickerId: 'picker-color-card', hexId: 'hex-color-card', prop: 'c30' },
      { pickerId: 'picker-color-text', hexId: 'hex-color-text', prop: 'textPrimary' },
      { pickerId: 'picker-color-muted', hexId: 'hex-color-muted', prop: 'textMuted' },
      { pickerId: 'picker-color-accent', hexId: 'hex-color-accent', prop: 'c10' },
      { pickerId: 'picker-color-border', hexId: 'hex-color-border', prop: 'border' }
    ];

    colorProps.forEach(({ pickerId, hexId, prop }) => {
      const picker = document.getElementById(pickerId);
      const hexInput = document.getElementById(hexId);

      if (picker && !picker._hasColorListener) {
        picker._hasColorListener = true;
        picker.addEventListener('input', (e) => {
          const val = e.target.value;
          if (hexInput) hexInput.value = val.toUpperCase();
          applyCustomColorUpdate(prop, val);
        });
      }

      if (hexInput && !hexInput._hasHexListener) {
        hexInput._hasHexListener = true;
        hexInput.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          if (/^#?[0-9a-f]{6}$/i.test(val) || /^#?[0-9a-f]{3}$/i.test(val)) {
            const formatted = toValidHex(val);
            if (picker) picker.value = formatted;
            applyCustomColorUpdate(prop, formatted);
          }
        });
        hexInput.addEventListener('change', (e) => {
          const val = e.target.value.trim();
          const formatted = toValidHex(val);
          hexInput.value = formatted.toUpperCase();
          if (picker) picker.value = formatted;
          applyCustomColorUpdate(prop, formatted);
        });
      }
    });

    // Initialize Blog Details (Title & Logo) in Design
    initDesignerBlogDetailsEvents();

    // Initialize Left Zones Menu (TOC)
    initDesignerZones();
  }

  function initDesignerZones() {
    const paneDesigner = document.getElementById('pane-designer');
    const tocList = document.getElementById('designer-toc-list');
    if (!tocList || tocList._hasZoneListener) return;
    tocList._hasZoneListener = true;

    const container = document.querySelector('.dash-main-content');
    const tocLinks = tocList.querySelectorAll('.settings-toc-link');

    function setActiveToc(targetId) {
      tocLinks.forEach(link => {
        const id = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');
        link.classList.toggle('active', id === targetId);
      });
    }

    let isProgrammaticScroll = false;
    let programmaticScrollTimer = null;

    tocLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = link.getAttribute('data-target') || (link.getAttribute('href') || '').replace('#', '');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          setActiveToc(targetId);
          if (container) {
            isProgrammaticScroll = true;
            if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
            programmaticScrollTimer = setTimeout(() => {
              isProgrammaticScroll = false;
            }, 500);
            const frozenTop = document.getElementById('designer-frozen-top-wrap');
            const frozenH = (frozenTop && getComputedStyle(frozenTop).position === 'sticky') ? frozenTop.offsetHeight : 0;
            const cRect = container.getBoundingClientRect();
            const tRect = targetEl.getBoundingClientRect();
            const topPos = tRect.top - cRect.top + container.scrollTop - frozenH - 20;
            container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
          } else {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    function updateActiveSection() {
      if (isProgrammaticScroll) return;
      if (!paneDesigner || paneDesigner.style.display === 'none') return;
      const sections = Array.from(paneDesigner.querySelectorAll('.settings-section-group'));
      if (sections.length === 0 || !container) return;

      const frozenTop = document.getElementById('designer-frozen-top-wrap');
      const frozenH = (frozenTop && getComputedStyle(frozenTop).position === 'sticky') ? frozenTop.offsetHeight : 0;
      const containerRect = container.getBoundingClientRect();
      const targetTop = containerRect.top + frozenH + 60;

      let closestSec = sections[0];
      let minDiff = Infinity;
      for (const sec of sections) {
        const rect = sec.getBoundingClientRect();
        const diff = Math.abs(rect.top - targetTop);
        if (diff < minDiff) {
          minDiff = diff;
          closestSec = sec;
        }
      }
      if (closestSec) {
        setActiveToc(closestSec.id);
      }
    }

    if (container && !container._hasDesignerScrollSpy) {
      container._hasDesignerScrollSpy = true;
      let isTicking = false;
      container.addEventListener('scroll', () => {
        if (!isTicking) {
          window.requestAnimationFrame(() => {
            updateActiveSection();
            isTicking = false;
          });
          isTicking = true;
        }
      }, { passive: true });
    }
  }

  // =========================================================================
  // BLOG DETAILS (TITLE & LOGO) MANAGEMENT IN DESIGN
  // =========================================================================

  let designerDragCounter = 0;
  let designerErrorResetTimeout = null;

  function isDesignerImageDrag(e) {
    if (!e.dataTransfer) return false;
    const dt = e.dataTransfer;
    const types = Array.from(dt.types || []);
    if (!types.includes('Files')) return false;
    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind && item.kind !== 'file') return false;
        if (item.type) {
          return item.type.startsWith('image/');
        }
      }
    }
    return true;
  }

  function showDesignerDragFeedback(isValid) {
    if (designerErrorResetTimeout) {
      clearTimeout(designerErrorResetTimeout);
      designerErrorResetTimeout = null;
    }

    const dropzone = document.getElementById('designer-logo-dropzone');
    const overlay = document.getElementById('designer-logo-drag-overlay');
    const iconEl = document.getElementById('designer-drag-feedback-icon');
    const titleEl = document.getElementById('designer-drag-feedback-title');
    const subEl = document.getElementById('designer-drag-feedback-sub');
    const previewState = document.getElementById('designer-logo-preview-state');
    if (!overlay || !iconEl || !titleEl || !subEl || !dropzone) return;

    overlay.style.display = 'flex';
    overlay.className = 'ftue-logo-drag-overlay ' + (isValid ? 'drag-valid' : 'drag-invalid');
    dropzone.classList.toggle('drag-valid', isValid);
    dropzone.classList.toggle('drag-invalid', !isValid);

    const activeThemeId = (window.projectConfig?.design && (window.projectConfig.design.blogTheme || window.projectConfig.design.activeTheme)) || 'basalt';
    const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
    const palette = palettes[activeThemeId] || palettes.basalt || { c30: '#18181b', isLight: false };

    if (isValid) {
      dropzone.style.setProperty('border-color', palette.isLight ? '#059669' : '#10b981', 'important');
      dropzone.style.setProperty('background-color', palette.isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.12)', 'important');
      iconEl.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      titleEl.textContent = 'Okay to release';
      subEl.textContent = (previewState && previewState.style.display !== 'none')
        ? 'Drop to replace current logo'
        : 'Drop to set brand logo';
    } else {
      dropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
      dropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');
      iconEl.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      `;
      titleEl.textContent = "Won't work";
      subEl.textContent = 'Only image files (PNG, JPG, SVG, WebP) are supported';
    }
  }

  function hideDesignerDragFeedback() {
    const overlay = document.getElementById('designer-logo-drag-overlay');
    if (overlay) overlay.style.display = 'none';
    const dropzone = document.getElementById('designer-logo-dropzone');
    if (dropzone) {
      dropzone.classList.remove('drag-valid', 'drag-invalid', 'dragover', 'ftue-shake');
      updateDesignerLogoBackground();
    }
  }

  function showDesignerDropzoneError(message) {
    if (designerErrorResetTimeout) clearTimeout(designerErrorResetTimeout);

    const dropzone = document.getElementById('designer-logo-dropzone');
    const overlay = document.getElementById('designer-logo-drag-overlay');
    const iconEl = document.getElementById('designer-drag-feedback-icon');
    const titleEl = document.getElementById('designer-drag-feedback-title');
    const subEl = document.getElementById('designer-drag-feedback-sub');
    if (!overlay || !iconEl || !titleEl || !subEl || !dropzone) return;

    overlay.style.display = 'flex';
    overlay.className = 'ftue-logo-drag-overlay drag-invalid';
    dropzone.classList.remove('drag-valid');
    dropzone.classList.add('drag-invalid');

    const activeThemeId = (window.projectConfig?.design && (window.projectConfig.design.blogTheme || window.projectConfig.design.activeTheme)) || 'basalt';
    const palettes = ((window.CedarFTUE || window.OutpostFTUE) && (window.CedarFTUE || window.OutpostFTUE).THEME_PALETTES) || {};
    const palette = palettes[activeThemeId] || palettes.basalt || { c30: '#18181b', isLight: false };

    dropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
    dropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');

    dropzone.classList.remove('ftue-shake');
    void dropzone.offsetWidth;
    dropzone.classList.add('ftue-shake');

    iconEl.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
      </svg>
    `;
    titleEl.textContent = "Won't work";
    subEl.textContent = message || 'Only image files (PNG, JPG, SVG, WebP) are supported';

    if (typeof window.showToast === 'function') {
      window.showToast("Won't work: Please select a valid image file (PNG, JPG, SVG, WebP)");
    }

    designerErrorResetTimeout = setTimeout(() => {
      hideDesignerDragFeedback();
      designerErrorResetTimeout = null;
    }, 2500);
  }

  function handleDesignerLogoFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showDesignerDropzoneError("Won't work — Only image files (PNG, JPG, SVG, WebP) are supported");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target.result;
      const img = new Image();
      img.onload = () => {
        const naturalW = img.naturalWidth || 1;
        const naturalH = img.naturalHeight || 1;
        const scalePct = Math.min(100, Math.max(10, Math.round((naturalW / 1200) * 100)));

        const previewImg = document.getElementById('designer-logo-preview-img');
        const fileNameEl = document.getElementById('designer-logo-file-name');
        const dimsBadge = document.getElementById('designer-logo-dims-badge');
        const emptyState = document.getElementById('designer-logo-empty-state');
        const previewState = document.getElementById('designer-logo-preview-state');

        if (previewImg) {
          previewImg.src = rawDataUrl;
          previewImg.style.width = 'auto';
          previewImg.style.maxWidth = `${scalePct}%`;
        }
        if (fileNameEl) fileNameEl.textContent = file.name;
        if (dimsBadge) dimsBadge.textContent = `${naturalW} × ${naturalH}px (${scalePct}% width)`;
        if (emptyState) emptyState.style.display = 'none';
        if (previewState) previewState.style.display = 'flex';

        let mastheadDataUrl = rawDataUrl;
        let iconDataUrl = rawDataUrl;
        let originalDataUrl = rawDataUrl;

        if ((window.Cedar && typeof window.Cedar.generateResizedCanvasImage === 'function') || (window.Outpost && typeof (window.Cedar.generateResizedCanvasImage || window.Outpost.generateResizedCanvasImage) === 'function')) {
          const resizer = window.Cedar?.generateResizedCanvasImage || window.Outpost?.generateResizedCanvasImage;
          mastheadDataUrl = resizer(img, 1200, 1200, false);
          iconDataUrl = resizer(img, 64, 64, true);
          originalDataUrl = resizer(img, 1200, 1200, false);
        }

        const brandingAssets = {
          'images/branding/logo.png': mastheadDataUrl,
          'images/branding/icon.png': iconDataUrl,
          'images/branding/logo-original.png': originalDataUrl,
          'blog/images/branding/logo.png': mastheadDataUrl,
          'blog/images/branding/icon.png': iconDataUrl,
          'blog/images/branding/logo-original.png': originalDataUrl
        };

        if (!window.projectConfig) window.projectConfig = {};
        if (!window.projectConfig.design) window.projectConfig.design = {};
        if (!window.projectConfig.design.branding) window.projectConfig.design.branding = {};

        window.projectConfig.logo = mastheadDataUrl;
        window.projectConfig.design.branding.generalLogo = mastheadDataUrl;
        window.projectConfig.design.branding.tabLogo = iconDataUrl;
        window.projectConfig.design.branding.originalLogo = originalDataUrl;
        window.projectConfig.design.branding.folder = 'images/branding';
        window.projectConfig.design.branding.files = brandingAssets;
        window.brandingFiles = brandingAssets;

        try {
          localStorage.setItem('cedar_branding_files_v1', JSON.stringify(brandingAssets));
        } catch (e) {}

        if (window.SheeshVault && window.SheeshVault.isConnected() && typeof (window.Cedar?.writeBrandingAssetsToVault || window.Outpost?.writeBrandingAssetsToVault) === 'function') {
          (window.Cedar.writeBrandingAssetsToVault || window.Outpost.writeBrandingAssetsToVault)(brandingAssets);
        }

        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage({ isDesignerSave: true });
        }
        if (typeof window.syncLiveWorkspaceData === 'function') {
          window.syncLiveWorkspaceData();
        }

        updateDesignerLogoBackground();
        renderLivePreview();
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function initDesignerBlogDetailsEvents() {
    const titleInput = document.getElementById('designer-blog-title');
    if (titleInput && !titleInput._hasListener) {
      titleInput._hasListener = true;
      titleInput.addEventListener('input', () => {
        const val = titleInput.value.trim();
        if (!window.projectConfig) window.projectConfig = {};
        window.projectConfig.name = val;
        if (!window.projectConfig.design) window.projectConfig.design = {};
        if (!window.projectConfig.design.branding) window.projectConfig.design.branding = {};
        window.projectConfig.design.branding.siteTitle = val;

        const projLabel = document.getElementById('label-current-project');
        if (projLabel) projLabel.textContent = val || 'Cedar';

        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage({ isDesignerSave: true });
        }
        if (typeof window.syncLiveWorkspaceData === 'function') {
          window.syncLiveWorkspaceData();
        }

        renderLivePreview();
      });
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const btnSave = document.getElementById('btn-designer-save');
          if (btnSave) btnSave.click();
        }
      });
    }

    const logoDropzone = document.getElementById('designer-logo-dropzone');
    const logoFileInput = document.getElementById('designer-logo-file-input');
    const btnChangeLogo = document.getElementById('designer-btn-change-logo');
    const btnRemoveLogo = document.getElementById('designer-btn-remove-logo');
    const previewState = document.getElementById('designer-logo-preview-state');

    if (logoDropzone && logoFileInput && !logoDropzone._hasDropzoneListener) {
      logoDropzone._hasDropzoneListener = true;

      logoDropzone.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.ftue-logo-preview-meta')) return;
        if (previewState && previewState.style.display !== 'none' && !e.target.closest('.ftue-logo-stage')) {
          return;
        }
        if (designerErrorResetTimeout) {
          clearTimeout(designerErrorResetTimeout);
          designerErrorResetTimeout = null;
          hideDesignerDragFeedback();
        }
        logoFileInput.click();
      });

      logoDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        designerDragCounter++;
        const isValid = isDesignerImageDrag(e);
        showDesignerDragFeedback(isValid);
      });

      logoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        const isValid = isDesignerImageDrag(e);
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = isValid ? 'copy' : 'none';
        }
        showDesignerDragFeedback(isValid);
      });

      logoDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        designerDragCounter--;
        if (designerDragCounter <= 0) {
          designerDragCounter = 0;
          hideDesignerDragFeedback();
        }
      });

      logoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        designerDragCounter = 0;
        hideDesignerDragFeedback();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleDesignerLogoFile(e.dataTransfer.files[0]);
        } else {
          showDesignerDropzoneError("Won't work — Please drop an image file (PNG, JPG, SVG, WebP)");
        }
      });

      logoFileInput.addEventListener('change', () => {
        if (logoFileInput.files && logoFileInput.files[0]) {
          handleDesignerLogoFile(logoFileInput.files[0]);
        }
      });
    }

    if (btnChangeLogo && logoFileInput && !btnChangeLogo._hasChangeListener) {
      btnChangeLogo._hasChangeListener = true;
      btnChangeLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (designerErrorResetTimeout) {
          clearTimeout(designerErrorResetTimeout);
          designerErrorResetTimeout = null;
          hideDesignerDragFeedback();
        }
        logoFileInput.click();
      });
    }

    if (btnRemoveLogo && !btnRemoveLogo._hasRemoveListener) {
      btnRemoveLogo._hasRemoveListener = true;
      btnRemoveLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        hideDesignerDragFeedback();

        if (logoFileInput) logoFileInput.value = '';
        const previewImg = document.getElementById('designer-logo-preview-img');
        const dimsBadge = document.getElementById('designer-logo-dims-badge');
        const emptyState = document.getElementById('designer-logo-empty-state');

        if (previewImg) {
          previewImg.src = '';
          previewImg.style.width = '';
          previewImg.style.maxWidth = '';
        }
        if (dimsBadge) dimsBadge.textContent = '--';
        if (previewState) previewState.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';

        if (window.projectConfig) {
          window.projectConfig.logo = '';
          if (window.projectConfig.design && window.projectConfig.design.branding) {
            window.projectConfig.design.branding.generalLogo = '';
            window.projectConfig.design.branding.tabLogo = '';
            window.projectConfig.design.branding.originalLogo = '';
            window.projectConfig.design.branding.files = {};
          }
        }
        window.brandingFiles = null;
        try {
          localStorage.removeItem('cedar_branding_files_v1');
          localStorage.removeItem('outpost_branding_files_v1');
        } catch (e) {}

        if (typeof window.saveProjectToStorage === 'function') {
          window.saveProjectToStorage({ isDesignerSave: true });
        }
        if (typeof window.syncLiveWorkspaceData === 'function') {
          window.syncLiveWorkspaceData();
        }

        updateDesignerLogoBackground();
        renderLivePreview();
      });
    }
  }

  function syncDesignerBlogDetailsUI() {
    const titleInput = document.getElementById('designer-blog-title');
    if (titleInput && document.activeElement !== titleInput) {
      const currTitle = (window.projectConfig && (window.projectConfig.name || (window.projectConfig.design && window.projectConfig.design.branding && window.projectConfig.design.branding.siteTitle))) || '';
      titleInput.value = currTitle;
    }

    const currentLogo = (window.projectConfig && window.projectConfig.design && window.projectConfig.design.branding && (window.projectConfig.design.branding.originalLogo || window.projectConfig.design.branding.generalLogo)) || (window.projectConfig && window.projectConfig.logo) || '';
    const emptyState = document.getElementById('designer-logo-empty-state');
    const previewState = document.getElementById('designer-logo-preview-state');
    const previewImg = document.getElementById('designer-logo-preview-img');
    const dimsBadge = document.getElementById('designer-logo-dims-badge');

    if (previewState && emptyState) {
      if (currentLogo) {
        emptyState.style.display = 'none';
        previewState.style.display = 'flex';
        if (previewImg) {
          previewImg.src = currentLogo;
          const imgObj = new Image();
          imgObj.onload = () => {
            const naturalW = imgObj.naturalWidth || 1;
            const naturalH = imgObj.naturalHeight || 1;
            const scalePct = Math.min(100, Math.max(10, Math.round((naturalW / 1200) * 100)));
            if (previewImg) {
              previewImg.style.width = 'auto';
              previewImg.style.maxWidth = `${scalePct}%`;
            }
            if (dimsBadge) dimsBadge.textContent = `${naturalW} × ${naturalH}px (${scalePct}% width)`;
          };
          imgObj.src = currentLogo;
        }
      } else {
        previewState.style.display = 'none';
        emptyState.style.display = 'flex';
        if (previewImg) previewImg.src = '';
        if (dimsBadge) dimsBadge.textContent = '--';
      }
    }

    updateDesignerLogoBackground();
  }

  function updateDesignerLogoBackground() {
    const dropzone = document.getElementById('designer-logo-dropzone') || document.getElementById('settings-logo-dropzone');
    if (!dropzone) return;
    const stage = document.getElementById('designer-logo-stage') || document.getElementById('settings-logo-stage');

    let designBg = '#09090b';
    let isLight = false;

    if (typeof getActiveWebsiteThemeColors === 'function') {
      const colors = getActiveWebsiteThemeColors();
      if (colors && colors.c60) {
        designBg = colors.c60;
        isLight = Boolean(colors.isLight);
      }
    } else {
      const cfg = window.projectConfig || {};
      const design = cfg.design || {};
      const customColors = design.customColors;
      const effThemeId = design.blogTheme || design.activeTheme || 'basalt';

      if (customColors && customColors.c60) {
        designBg = customColors.c60;
        isLight = Boolean(customColors.isLight);
      } else {
        const ftue = window.CedarFTUE || window.OutpostFTUE;
        const palettes = ftue?.THEME_PALETTES || {};
        const pal = palettes[effThemeId] || palettes.basalt || { c60: '#09090b', isLight: false };
        designBg = pal.c60 || (pal.isLight ? '#ffffff' : '#09090b');
        isLight = Boolean(pal.isLight);
      }
    }

    const borderColor = isLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.12)';
    dropzone.style.setProperty('background-color', designBg, 'important');
    dropzone.style.setProperty('border-color', borderColor, 'important');

    if (stage) {
      stage.style.setProperty('background-color', 'transparent', 'important');
      stage.style.setProperty('border-color', 'transparent', 'important');
    }

    const emptyState = document.getElementById('designer-logo-empty-state') || document.getElementById('settings-logo-empty-state');
    if (emptyState) {
      const textPrimary = isLight ? '#18181b' : '#fafafa';
      const textMuted = isLight ? '#52525b' : '#a1a1aa';
      emptyState.querySelectorAll('.ftue-upload-text, .ftue-upload-text span, .ftue-upload-text strong').forEach(el => {
        el.style.color = textPrimary;
      });
      emptyState.querySelectorAll('.ftue-upload-sub').forEach(el => {
        el.style.color = textMuted;
      });
      emptyState.querySelectorAll('.ftue-upload-icon svg').forEach(el => {
        el.style.stroke = textMuted;
      });
    }
  }

  window.updateDesignerLogoBackground = updateDesignerLogoBackground;
  window.updateSettingsLogoBackground = updateDesignerLogoBackground;

  // =========================================================================
  // ADVANCED THEME OPTIONS & CUSTOM PALETTES MANAGEMENT
  // =========================================================================

  function toValidHex(colorStr, fallback = '#09090b') {
    if (!colorStr) return fallback;
    const s = String(colorStr).trim();
    if (s.startsWith('rgb')) {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (m) {
        const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
        const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
        const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
      }
    }
    let hex = s.startsWith('#') ? s : '#' + s;
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return hex.toLowerCase();
    }
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
    }
    return fallback;
  }

  function isColorLight(hexColor) {
    const hex = toValidHex(hexColor, '#09090b').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128;
  }

  function getCustomPalettes() {
    if (!window.projectConfig) window.projectConfig = {};
    if (!window.projectConfig.design) window.projectConfig.design = {};
    if (!Array.isArray(window.projectConfig.design.customPalettes) || window.projectConfig.design.customPalettes.length !== 3) {
      window.projectConfig.design.customPalettes = [
        { id: 'custom_1', name: 'Custom 1', isSaved: false, c60: '#09090b', c30: '#18181b', c10: '#71717a', textPrimary: '#fafafa', textMuted: '#a1a1aa', border: '#27272a', isLight: false },
        { id: 'custom_2', name: 'Custom 2', isSaved: false, c60: '#ffffff', c30: '#f4f4f5', c10: '#18181b', textPrimary: '#0f172a', textMuted: '#64748b', border: '#e4e4e7', isLight: true },
        { id: 'custom_3', name: 'Custom 3', isSaved: false, c60: '#0b1120', c30: '#1e293b', c10: '#38bdf8', textPrimary: '#fafafa', textMuted: '#94a3b8', border: '#334155', isLight: false }
      ];
    }
    return window.projectConfig.design.customPalettes;
  }

  function getActiveWebsiteThemeColors() {
    const design = window.projectConfig?.design || {};
    if (design.customColors && design.customColors.c60) {
      return { ...design.customColors };
    }
    const effThemeId = design.blogTheme || design.activeTheme || 'basalt';
    if (String(effThemeId).startsWith('custom_')) {
      const slotIdx = parseInt(effThemeId.replace('custom_', ''), 10) - 1;
      const pals = getCustomPalettes();
      if (pals[slotIdx] && pals[slotIdx].c60) {
        return { ...pals[slotIdx] };
      }
    }
    const ftue = window.CedarFTUE || window.OutpostFTUE;
    const palettes = ftue?.THEME_PALETTES || {};
    const pal = palettes[effThemeId] || palettes.basalt || { c60: '#09090b', c30: '#18181b', c10: '#71717a', isLight: false };
    const isLight = Boolean(pal.isLight);
    return {
      c60: toValidHex(pal.c60, isLight ? '#ffffff' : '#09090b'),
      c30: toValidHex(pal.c30, isLight ? '#f4f4f5' : '#18181b'),
      c10: toValidHex(pal.c10, '#71717a'),
      textPrimary: toValidHex(pal.textPrimary, isLight ? '#0f172a' : '#fafafa'),
      textMuted: toValidHex(pal.textMuted, isLight ? '#64748b' : '#a1a1aa'),
      border: toValidHex(pal.border, isLight ? '#e4e4e7' : '#27272a'),
      isLight: isLight
    };
  }

  function sendThemeToPreviewFrame(themeOrColors) {
    const frames = [
      document.getElementById('designer-preview-site-frame'),
      document.getElementById('preview-site-frame')
    ].filter(Boolean);

    frames.forEach(frame => {
      if (frame && frame.contentWindow) {
        try {
          const cw = frame.contentWindow;
          const currentScrollY = (cw.pageYOffset !== undefined)
            ? cw.pageYOffset
            : (cw.scrollY !== undefined
                ? cw.scrollY
                : ((cw.document && cw.document.documentElement ? cw.document.documentElement.scrollTop : 0) || (cw.document && cw.document.body ? cw.document.body.scrollTop : 0) || 0));

          if (typeof cw.applyThemeToPreview === 'function') {
            cw.applyThemeToPreview(themeOrColors);
          }
          if (typeof cw.renderHome === 'function') {
            cw.renderHome({ preserveScroll: true, scrollY: currentScrollY });
          }
          if (typeof currentScrollY === 'number' && currentScrollY > 0) {
            cw.scrollTo({ top: currentScrollY, behavior: 'instant' });
            if (typeof cw.requestAnimationFrame === 'function') {
              cw.requestAnimationFrame(() => {
                cw.scrollTo({ top: currentScrollY, behavior: 'instant' });
              });
            }
          }
        } catch (e) {
          try {
            frame.contentWindow.postMessage({ type: 'CEDAR_THEME_CHANGED', themeId: themeOrColors }, '*');
          } catch (err) {}
        }
      }
    });
  }

  function syncAdvancedThemeUI() {
    const design = window.projectConfig?.design || {};
    const customPalettes = getCustomPalettes();
    const activeSlotIdx = typeof design.activeCustomSlotIndex === 'number' ? design.activeCustomSlotIndex : 0;

    // 1. Update each slot's triple-stack swatch and status label
    customPalettes.forEach((p, idx) => {
      const stackEl = document.getElementById(`custom-swatch-stack-${idx}`);
      if (stackEl) {
        const layers = stackEl.querySelectorAll('.ftue-swatch-layer');
        if (layers.length >= 3) {
          layers[0].style.backgroundColor = p.c60 || '#09090b';
          layers[1].style.backgroundColor = p.c30 || '#18181b';
          layers[2].style.backgroundColor = p.c10 || '#71717a';
        }
      }
      const statusEl = document.getElementById(`custom-slot-status-${idx}`);
      if (statusEl) {
        if (p.isSaved) {
          statusEl.textContent = 'Saved';
          statusEl.style.color = 'var(--accent-color, #10b981)';
          statusEl.style.fontWeight = '700';
          statusEl.style.opacity = '1';
        } else {
          statusEl.textContent = 'Blank';
          statusEl.style.color = 'var(--text-muted)';
          statusEl.style.fontWeight = '500';
          statusEl.style.opacity = '0.7';
        }
      }
    });

    // 2. Highlight active custom slot button
    const slotButtons = document.querySelectorAll('.custom-palette-slot-btn');
    slotButtons.forEach(btn => {
      const sIdx = parseInt(btn.getAttribute('data-custom-slot'), 10);
      const isAct = sIdx === activeSlotIdx;
      btn.classList.toggle('active', isAct);
      if (isAct) {
        btn.style.setProperty('border-color', 'var(--accent-color, #2563eb)', 'important');
        btn.style.setProperty('box-shadow', '0 0 0 2px rgba(37,99,235,0.3)', 'important');
      } else {
        btn.style.removeProperty('border-color');
        btn.style.removeProperty('box-shadow');
      }
      btn.style.removeProperty('background-color');
    });

    // 3. Update Save button text
    const saveBtnText = document.getElementById('btn-save-custom-palette-text');
    if (saveBtnText) {
      saveBtnText.textContent = `Save to Custom ${activeSlotIdx + 1}`;
    }

    // 4. Determine current colors to show in inputs (read-only; do NOT mutate design.customColors here)
    let curColors = design.customColors;
    if (!curColors) {
      if (customPalettes[activeSlotIdx] && customPalettes[activeSlotIdx].isSaved) {
        curColors = { ...customPalettes[activeSlotIdx] };
      } else {
        curColors = getActiveWebsiteThemeColors();
      }
    }

    // Also update active slot's swatch stack in real-time to match current working colors
    const activeStack = document.getElementById(`custom-swatch-stack-${activeSlotIdx}`);
    if (activeStack) {
      const layers = activeStack.querySelectorAll('.ftue-swatch-layer');
      if (layers.length >= 3) {
        layers[0].style.backgroundColor = curColors.c60 || '#09090b';
        layers[1].style.backgroundColor = curColors.c30 || '#18181b';
        layers[2].style.backgroundColor = curColors.c10 || '#71717a';
      }
    }

    // 5. Populate inputs
    const inputsMap = [
      { pickerId: 'picker-color-bg', hexId: 'hex-color-bg', val: curColors.c60, def: '#09090b' },
      { pickerId: 'picker-color-card', hexId: 'hex-color-card', val: curColors.c30, def: '#18181b' },
      { pickerId: 'picker-color-text', hexId: 'hex-color-text', val: curColors.textPrimary, def: '#fafafa' },
      { pickerId: 'picker-color-muted', hexId: 'hex-color-muted', val: curColors.textMuted, def: '#a1a1aa' },
      { pickerId: 'picker-color-accent', hexId: 'hex-color-accent', val: curColors.c10, def: '#71717a' },
      { pickerId: 'picker-color-border', hexId: 'hex-color-border', val: curColors.border, def: '#27272a' }
    ];

    inputsMap.forEach(({ pickerId, hexId, val, def }) => {
      const hex = toValidHex(val, def);
      const picker = document.getElementById(pickerId);
      const text = document.getElementById(hexId);
      if (picker) picker.value = hex;
      if (text) text.value = hex.toUpperCase();
    });
  }

  function applyCustomColorUpdate(prop, hexValue) {
    if (!window.projectConfig) window.projectConfig = {};
    if (!window.projectConfig.design) window.projectConfig.design = {};
    if (!window.projectConfig.design.customColors) {
      window.projectConfig.design.customColors = getActiveWebsiteThemeColors();
    }

    const validHex = toValidHex(hexValue);
    window.projectConfig.design.customColors[prop] = validHex;
    if (prop === 'c60') {
      window.projectConfig.design.customColors.isLight = isColorLight(validHex);
    }

    const slotIdx = window.projectConfig.design.activeCustomSlotIndex || 0;
    window.projectConfig.design.blogTheme = 'custom';
    window.projectConfig.design.activeTheme = 'custom';
    window.projectConfig.editorTheme = 'custom';

    // Deselect preset theme swatches in designer
    syncDesignerThemeSwatches('custom');

    // Update active slot triple-stack swatch in real-time
    const activeStack = document.getElementById(`custom-swatch-stack-${slotIdx}`);
    if (activeStack) {
      const layers = activeStack.querySelectorAll('.ftue-swatch-layer');
      if (layers.length >= 3) {
        layers[0].style.backgroundColor = window.projectConfig.design.customColors.c60 || '#09090b';
        layers[1].style.backgroundColor = window.projectConfig.design.customColors.c30 || '#18181b';
        layers[2].style.backgroundColor = window.projectConfig.design.customColors.c10 || '#71717a';
      }
    }

    // Update live preview in designer
    renderLivePreview();

    // Notify preview iframe
    sendThemeToPreviewFrame(window.projectConfig.design.customColors);

    // Update Cedar Editor live on the fly!
    if ((window.CedarFTUE || window.OutpostFTUE)?.applyLiveTheme) {
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(window.projectConfig.design.customColors, true);
    }

    // Persist to storage immediately so leaving the editor keeps these colors
    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage();
    }
    if (typeof window.syncLiveWorkspaceData === 'function') {
      window.syncLiveWorkspaceData();
    }
    if (prop === 'c60' && typeof window.updateSettingsLogoBackground === 'function') {
      window.updateSettingsLogoBackground();
    }
  }

  function saveCustomPaletteSlot() {
    if (!window.projectConfig) window.projectConfig = {};
    if (!window.projectConfig.design) window.projectConfig.design = {};
    const customPalettes = getCustomPalettes();
    const slotIdx = typeof window.projectConfig.design.activeCustomSlotIndex === 'number' ? window.projectConfig.design.activeCustomSlotIndex : 0;

    if (!window.projectConfig.design.customColors) {
      window.projectConfig.design.customColors = getActiveWebsiteThemeColors();
    }

    const cur = window.projectConfig.design.customColors;
    const slotThemeId = `custom_${slotIdx + 1}`;
    customPalettes[slotIdx] = {
      id: slotThemeId,
      name: `Custom ${slotIdx + 1}`,
      isSaved: true,
      c60: cur.c60,
      c30: cur.c30,
      c10: cur.c10,
      textPrimary: cur.textPrimary,
      textMuted: cur.textMuted,
      border: cur.border,
      isLight: Boolean(cur.isLight)
    };

    window.projectConfig.design.customPalettes = customPalettes;
    window.projectConfig.design.blogTheme = slotThemeId;
    window.projectConfig.design.activeTheme = slotThemeId;
    window.projectConfig.editorTheme = slotThemeId;
    if ((window.CedarFTUE || window.OutpostFTUE)?.applyLiveTheme) {
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(cur, true);
    }

    // Update UI indicators
    syncAdvancedThemeUI();

    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage();
    }
    if (typeof window.syncLiveWorkspaceData === 'function') {
      window.syncLiveWorkspaceData();
    }

    if (typeof showToast === 'function') {
      showToast(`Saved to Custom Palette ${slotIdx + 1}!`);
    }
    if (typeof window.updateSettingsLogoBackground === 'function') {
      window.updateSettingsLogoBackground();
    }
  }

  function syncDesignerThemeSwatches(activeThemeId) {
    const isCustom = activeThemeId === 'custom' || String(activeThemeId).startsWith('custom_') || (window.projectConfig?.design?.customColors && !activeThemeId);
    const ftue = window.CedarFTUE || window.OutpostFTUE;
    const palettes = ftue?.THEME_PALETTES || {};
    const pal = isCustom ? (window.projectConfig?.design?.customColors || { c10: '#71717a', isLight: false }) : (palettes[activeThemeId] || palettes.basalt);
    const accentColor = pal ? (pal.c10 || '#71717a') : '#71717a';

    const themeButtons = document.querySelectorAll('#designer-color-palettes .ftue-theme-swatch');
    themeButtons.forEach(btn => {
      const swId = btn.getAttribute('data-theme-id');
      const isCurrent = !isCustom && ((swId === activeThemeId) || (palettes[swId] && palettes[swId].id === activeThemeId));
      btn.classList.toggle('active', isCurrent);
      if (isCurrent) {
        btn.style.setProperty('border-color', accentColor, 'important');
        btn.style.setProperty('box-shadow', `0 0 0 2px ${accentColor}44, 0 4px 12px ${accentColor}33`, 'important');
      } else {
        btn.style.removeProperty('border-color');
        btn.style.removeProperty('box-shadow');
      }
      // Never override swatch button background based on website theme;
      // it should always remain whatever the editor theme is.
      btn.style.removeProperty('background-color');
    });

    const swooshGrid = document.getElementById('designer-swoosh-grid');
    if (swooshGrid && pal) {
      const isLightPal = Boolean(pal.isLight);
      swooshGrid.style.setProperty('--swoosh-preview-bg', pal.c60 || (isLightPal ? '#ffffff' : '#09090b'));
      swooshGrid.style.setProperty('--swoosh-preview-surface', pal.c30 || (isLightPal ? '#f4f4f5' : '#18181b'));
      swooshGrid.style.setProperty('--swoosh-preview-accent', accentColor);
      swooshGrid.style.setProperty('--swoosh-preview-ring', `${accentColor}44`);
      swooshGrid.style.setProperty('--swoosh-preview-text', pal.textPrimary || (isLightPal ? '#0f172a' : '#fafafa'));
    }
  }

  const DESIGNER_FONT_STACKS = {
    inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    plus_jakarta: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    lora: "'Lora', Georgia, serif",
    space_grotesk: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
    fraunces: "'Fraunces', Georgia, serif",
    syne: "'Syne', -apple-system, BlinkMacSystemFont, sans-serif",
    jetbrains_mono: "'JetBrains Mono', monospace",
    shantell_sans: "'Shantell Sans', cursive, sans-serif"
  };

  function renderDesigner() {
    initDesigner();

    const state = getDesignerState();

    // Synchronize active states across all toggle buttons
    const toggleBtns = document.querySelectorAll('.designer-toggle-btn');
    toggleBtns.forEach(btn => {
      const type = btn.getAttribute('data-toggle');
      const val = btn.getAttribute('data-value');
      let isActive = false;

      if (type === 'header-align') {
        isActive = (state.headerAlign === val);
      } else if (type === 'branding') {
        isActive = (state.branding === val);
      } else if (type === 'featured') {
        isActive = (String(state.featured) === val);
      } else if (type === 'featured-mode') {
        isActive = (state.featuredMode === val);
      } else if (type === 'post-layout') {
        isActive = (state.postLayout === val);
      } else if (type === 'cat-bar') {
        isActive = (String(state.categoryBar) === val);
      }

      btn.classList.toggle('active', isActive);
    });

    // Synchronize Background Swooshes active button
    const swooshBtns = document.querySelectorAll('.designer-swoosh-btn[data-toggle="showcase-swoosh"]');
    swooshBtns.forEach(btn => {
      const val = btn.getAttribute('data-value') || 'jazz_cup';
      btn.classList.toggle('active', (state.showcaseSwoosh || 'jazz_cup') === val);
    });

    // Synchronize Title Font & Website Font selectors
    const titleFontSelect = document.getElementById('designer-title-font-select');
    if (titleFontSelect) {
      titleFontSelect.value = state.titleFont || state.siteFont || 'inter';
    }
    const siteFontSelect = document.getElementById('designer-site-font-select');
    if (siteFontSelect) {
      siteFontSelect.value = state.siteFont || 'inter';
    }
    const swooshGrid = document.getElementById('designer-swoosh-grid');
    if (swooshGrid) {
      const fontStack = DESIGNER_FONT_STACKS[state.siteFont] || DESIGNER_FONT_STACKS.inter;
      swooshGrid.style.setProperty('--swoosh-preview-font', fontStack);
    }

    // Show/hide Featured Logic sub-panel and Category selector
    const featLogicWrap = document.getElementById('designer-featured-logic-wrap');
    if (featLogicWrap) {
      featLogicWrap.style.display = state.featured ? 'flex' : 'none';
    }
    const featCatWrap = document.getElementById('designer-featured-category-wrap');
    const featCatSelect = document.getElementById('designer-featured-category-select');
    if (featCatWrap) {
      featCatWrap.style.display = (state.featured && state.featuredMode === 'category') ? 'block' : 'none';
    }
    if (featCatSelect) {
      const validCats = (window.projectConfig?.categories || [])
        .map(c => typeof c === 'object' ? (c.name || c.title || '') : String(c))
        .map(s => s.trim())
        .filter(s => s && s.toLowerCase() !== 'uncategorized' && s.toLowerCase() !== 'posts');
      if (validCats.length === 0) {
        featCatSelect.innerHTML = `<option value="">No categories created yet</option>`;
        featCatSelect.disabled = true;
      } else {
        featCatSelect.disabled = false;
        const selected = validCats.includes(state.featuredCategory) ? state.featuredCategory : validCats[0];
        featCatSelect.innerHTML = validCats.map(c =>
          `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
        ).join('');
      }
    }

    // Color theme active button - strictly synchronized to current active website theme
    const activePalette = (window.projectConfig && window.projectConfig.design && (window.projectConfig.design.blogTheme || window.projectConfig.design.activeTheme)) || 'basalt';
    syncDesignerThemeSwatches(activePalette);
    syncAdvancedThemeUI();
    const liveThemeTarget = ((activePalette === 'custom' || String(activePalette).startsWith('custom_')) && window.projectConfig?.design?.customColors)
      ? window.projectConfig.design.customColors
      : activePalette;
    if ((window.CedarFTUE || window.OutpostFTUE)?.applyLiveTheme) {
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(liveThemeTarget, false);
    }

    // Media corner preferences
    const isRoundedPref = Boolean(window.projectConfig?.mediaPreferences?.roundedImages);
    const cardCornerStraight = document.getElementById('pref-corner-straight');
    const cardCornerRounded = document.getElementById('pref-corner-rounded');
    if (cardCornerStraight) cardCornerStraight.classList.toggle('active', !isRoundedPref);
    if (cardCornerRounded) cardCornerRounded.classList.toggle('active', isRoundedPref);

    // Blog Details (Title & Logo)
    syncDesignerBlogDetailsUI();

    // Synchronize Branding Size (Logo & Title Scale) sliders
    const logoScaleSlider = document.getElementById('designer-logo-scale-slider');
    const logoScaleVal = document.getElementById('designer-logo-scale-val');
    const titleScaleSlider = document.getElementById('designer-title-scale-slider');
    const titleScaleVal = document.getElementById('designer-title-scale-val');
    if (logoScaleSlider) logoScaleSlider.value = state.logoScale;
    if (logoScaleVal) logoScaleVal.textContent = `${state.logoScale.toFixed(1)}x`;
    if (titleScaleSlider) titleScaleSlider.value = state.titleScale;
    if (titleScaleVal) titleScaleVal.textContent = `${state.titleScale.toFixed(1)}x`;

    // Synchronize preview device switcher UI
    const devSwitcher = document.getElementById('designer-preview-device-switcher');
    if (devSwitcher) {
      const btns = devSwitcher.querySelectorAll('[data-designer-device]');
      btns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-designer-device') === designerPreviewDevice);
      });
    }
    const addrText = document.getElementById('designer-preview-address-text');
    if (addrText) {
      addrText.textContent = designerPreviewDevice === 'mobile' ? 'Live Preview (Mobile 420px)' : 'Live Preview';
    }

    renderLivePreview();
  }

  function applyColorPalette(paletteId) {
    if (!paletteId) return;
    if (!window.projectConfig) window.projectConfig = {};
    if (!window.projectConfig.design) window.projectConfig.design = {};

    window.projectConfig.design.activeTheme = paletteId;
    window.projectConfig.design.blogTheme = paletteId;
    window.projectConfig.editorTheme = paletteId;
    // Clear temporary custom colors when selecting a preset
    window.projectConfig.design.customColors = null;

    syncDesignerThemeSwatches(paletteId);
    syncAdvancedThemeUI();
    if (typeof window.updateSettingsLogoBackground === 'function') {
      window.updateSettingsLogoBackground();
    }

    // Apply directly to Cedar Editor live!
    if ((window.CedarFTUE || window.OutpostFTUE)?.applyLiveTheme) {
      (window.CedarFTUE || window.OutpostFTUE).applyLiveTheme(paletteId, true);
    }

    if (typeof window.saveProjectToStorage === 'function') {
      window.saveProjectToStorage({ isDesignerSave: true });
    }
    if (typeof window.syncLiveWorkspaceData === 'function') {
      window.syncLiveWorkspaceData();
    }

    renderLivePreview();
    sendThemeToPreviewFrame(paletteId);

    const ftue = window.CedarFTUE || window.OutpostFTUE;
    if (typeof showToast === 'function') {
      const palName = (ftue?.THEME_PALETTES?.[paletteId]?.name) || paletteId;
      showToast(`Applied Theme: ${palName}`);
    }
  }

  function formatDatePreview(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return String(dateStr);
    }
  }

  function resolveFeaturedPost(posts, featuredMode, featuredCategory) {
    if (!Array.isArray(posts) || posts.length === 0) return null;
    const validCandidates = posts.filter(p => p && p.type !== 'page' && !p.isCategoryAggregate && !String(p.id).startsWith('page_'));
    if (validCandidates.length === 0) return null;

    const sorted = [...validCandidates].sort((a, b) => {
      const tB = new Date(b.publishedDate || b.date || b.createdAt || 0).getTime() || 0;
      const tA = new Date(a.publishedDate || a.date || a.createdAt || 0).getTime() || 0;
      if (tB !== tA) return tB - tA;
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

    if (featuredMode === 'category' && featuredCategory) {
      const targetCat = String(featuredCategory).toLowerCase().trim();
      const match = sorted.find(p => {
        const pCat = (p.tag || (p.categories && p.categories[0]) || '').toLowerCase().trim();
        return pCat === targetCat;
      });
      return match || null;
    }

    // Default: 'latest' (All - Recent: newest published post from all posts)
    return sorted[0] || null;
  }

  function resolveDraftImage(draft) {
    if (!draft) return '';
    const raw = (typeof draft === 'string'
      ? draft
      : (draft.coverImage || draft.featuredImage || draft.heroImage || draft.banner || draft.image || '')
    ).trim();

    // 1. If already a valid data URL, blob URL, or external http(s) URL
    if (raw && /^(data:image\/|blob:|https?:\/\/)/i.test(raw)) {
      return raw;
    }

    // 2. Check window.resolvePostImage if available
    if (typeof window.resolvePostImage === 'function' && draft && typeof draft === 'object') {
      const res = window.resolvePostImage(raw || draft.title, draft);
      if (res && /^(data:image\/|blob:|https?:\/\/)/i.test(res)) {
        return res;
      }
    }

    // Helper to match an image object from draft.images or draft.tempImages
    function matchImage(img, target) {
      if (!img) return '';
      if (typeof img === 'string') {
        if (/^(data:image\/|blob:|https?:\/\/)/i.test(img)) return img;
        return '';
      }
      const data = img.dataUrl || img.data || (img.blob ? (typeof URL !== 'undefined' ? URL.createObjectURL(img.blob) : '') : '') || img.url || img.src || '';
      if (!target && data) return data;
      if (!target) return '';
      const t = target.toLowerCase();
      const fn = (img.filename || img.name || '').trim().toLowerCase();
      const rel = (img.relativePath || '').trim().toLowerCase();
      const orig = (img.originalSrc || '').trim().toLowerCase();
      const tEnd = t.split('/').pop().split('\\').pop();

      if (fn && (fn === t || fn === tEnd)) return data;
      if (rel && (rel === t || rel.endsWith(tEnd) || t.endsWith(rel))) return data;
      if (orig && (orig === t || orig.endsWith(tEnd))) return data;
      if (data === target) return data;
      return '';
    }

    // 3. Check draft.images if draft is an object
    if (draft && typeof draft === 'object') {
      if (Array.isArray(draft.images) && draft.images.length > 0) {
        if (raw) {
          for (const img of draft.images) {
            const matched = matchImage(img, raw);
            if (matched && /^(data:image\/|blob:|https?:\/\/)/i.test(matched)) return matched;
          }
        }
        // Fallback: If draft has images, return first valid dataUrl
        for (const img of draft.images) {
          const d = img.dataUrl || img.data || (img.blob ? URL.createObjectURL(img.blob) : '') || img.url || img.src || '';
          if (d && /^(data:image\/|blob:|https?:\/\/)/i.test(d)) return d;
        }
      }

      if (Array.isArray(draft.tempImages) && draft.tempImages.length > 0) {
        for (const img of draft.tempImages) {
          const matched = matchImage(img, raw);
          if (matched && /^(data:image\/|blob:|https?:\/\/)/i.test(matched)) return matched;
        }
      }
    }

    // 4. Check window.imageRegistry
    if (typeof window !== 'undefined' && window.imageRegistry) {
      const keysToTest = [raw];
      if (raw) {
        const cleanName = raw.split('/').pop().split('\\').pop();
        keysToTest.push(cleanName, `/blog/images/${cleanName}`, `/images/${cleanName}`);
      }
      for (const k of keysToTest) {
        if (!k) continue;
        if (typeof window.imageRegistry.has === 'function' && window.imageRegistry.has(k)) {
          const reg = window.imageRegistry.get(k);
          if (reg && reg.dataUrl) return reg.dataUrl;
        }
      }
    }

    // 5. Check across all window.drafts in case draft is a shallow copy
    if (raw && window.drafts && Array.isArray(window.drafts)) {
      const cleanName = raw.split('/').pop().split('\\').pop();
      for (const otherDraft of window.drafts) {
        if (Array.isArray(otherDraft.images)) {
          for (const img of otherDraft.images) {
            const matched = matchImage(img, cleanName);
            if (matched && /^(data:image\/|blob:|https?:\/\/)/i.test(matched)) return matched;
          }
        }
      }
    }

    // 6. Return raw URL if starting with '/' or http
    if (raw && (/^\//.test(raw) || /^https?:\/\//i.test(raw))) {
      return raw;
    }

    return raw || '';
  }

  function resolveAuthorAvatar(authorRef) {
    if (!authorRef) return '';
    let authorName = '';
    let avatarVal = '';

    if (typeof authorRef === 'string') {
      authorName = authorRef.trim();
    } else if (typeof authorRef === 'object' && authorRef !== null) {
      if (Array.isArray(authorRef) && authorRef.length > 0) {
        return resolveAuthorAvatar(authorRef[0]);
      }
      authorName = (authorRef.name || authorRef.authorName || '').trim();
      avatarVal = (authorRef.avatar || authorRef.avatarDataUrl || authorRef.photo || authorRef.image || authorRef.authorAvatar || '').trim();
    }

    // If no avatarVal yet, look in window.projectConfig.authors
    const authorsList = (window.projectConfig && Array.isArray(window.projectConfig.authors)) ? window.projectConfig.authors : [];
    if (!avatarVal && authorName && authorsList.length > 0) {
      const match = authorsList.find(a => {
        if (!a) return false;
        const aName = (typeof a === 'object' ? a.name : String(a)).trim().toLowerCase();
        return aName === authorName.toLowerCase();
      });
      if (match && typeof match === 'object') {
        avatarVal = (match.avatar || match.avatarDataUrl || match.photo || match.image || '').trim();
      }
    }

    // If still no avatar, and single author configured
    if (!avatarVal && authorsList.length === 1 && authorsList[0]) {
      const first = authorsList[0];
      if (typeof first === 'object') {
        avatarVal = (first.avatar || first.avatarDataUrl || first.photo || first.image || '').trim();
      }
    }

    if (!avatarVal) return '';

    // If avatarVal is in imageRegistry
    if (typeof window !== 'undefined' && window.imageRegistry && typeof window.imageRegistry.has === 'function' && window.imageRegistry.has(avatarVal)) {
      const reg = window.imageRegistry.get(avatarVal);
      if (reg && reg.dataUrl) return reg.dataUrl;
    }

    // If avatarVal is a data URL, blob URL, or external http(s) URL
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(avatarVal)) {
      return avatarVal;
    }

    // Ensure leading slash for local paths
    if (!avatarVal.startsWith('/')) {
      avatarVal = '/' + avatarVal;
    }

    return avatarVal;
  }

  function renderLivePreview() {
    const container = document.getElementById('designer-live-preview');
    if (!container) return;

    let viewport = document.getElementById('designer-preview-viewport');
    let frame = document.getElementById('designer-preview-site-frame');

    if (!viewport) {
      container.innerHTML = `
        <div class="designer-device-viewport ${designerPreviewDevice === 'mobile' ? 'device-mobile' : 'device-tablet'}" id="designer-preview-viewport">
          <iframe id="designer-preview-site-frame" class="designer-preview-site-frame" src="preview.html?v=4.5.0#/" title="Cedar Live Site Preview"></iframe>
        </div>`;
      viewport = document.getElementById('designer-preview-viewport');
      frame = document.getElementById('designer-preview-site-frame');
    } else if (!frame) {
      viewport.innerHTML = `<iframe id="designer-preview-site-frame" class="designer-preview-site-frame" src="preview.html?v=4.5.0#/" title="Cedar Live Site Preview"></iframe>`;
      frame = document.getElementById('designer-preview-site-frame');
    }

    const isMobile = (designerPreviewDevice === 'mobile');
    if (viewport) {
      viewport.className = `designer-device-viewport ${isMobile ? 'device-mobile' : 'device-tablet'}`;
      viewport.style.maxWidth = isMobile ? '420px' : '100%';
      viewport.style.width = isMobile ? '420px' : '100%';
    }

    // Set container background color to c60 matching the blog theme
    const design = window.projectConfig?.design || {};
    const effPalette = design.blogTheme || design.activeTheme || 'basalt';
    const customColors = design.customColors;
    const palettes = (window.CedarFTUE && window.CedarFTUE.THEME_PALETTES) || (window.OutpostFTUE && window.OutpostFTUE.THEME_PALETTES) || {};
    let c60 = '#09090b';
    if (customColors && (effPalette === 'custom' || String(effPalette).startsWith('custom_') || !palettes[effPalette])) {
      c60 = customColors.c60 || '#09090b';
    } else if (palettes[effPalette]) {
      c60 = palettes[effPalette].c60 || '#09090b';
    }
    container.style.backgroundColor = c60;

    if (frame && !frame._syncAttached) {
      frame._syncAttached = true;
      frame.addEventListener('load', () => {
        updateAllPreviewFrames();
      });
    }

    updateAllPreviewFrames();
  }
  window.initDesigner = initDesigner;
  window.renderDesigner = renderDesigner;
  window.getDesignerState = getDesignerState;
  window.applyModularDesign = applyModularDesign;
  window.applyColorPalette = applyColorPalette;
  window.syncDesignerThemeSwatches = syncDesignerThemeSwatches;
  window.Cedar = window.Cedar || window.Outpost || {};
  window.Cedar.designer = window.Cedar.designer || {};
  window.Cedar.designer.initDesigner = window.initDesigner;
  window.Cedar.designer.renderDesigner = window.renderDesigner;
  window.Cedar.designer.getDesignerState = window.getDesignerState;
  window.Cedar.designer.applyModularDesign = window.applyModularDesign;
  window.Cedar.designer.applyColorPalette = applyColorPalette;
  window.Cedar.designer.syncDesignerThemeSwatches = syncDesignerThemeSwatches;
  window.Cedar.designer.syncAdvancedThemeUI = syncAdvancedThemeUI;
  window.Cedar.designer.saveCustomPaletteSlot = saveCustomPaletteSlot;
  window.Cedar.designer.getCustomPalettes = getCustomPalettes;
  window.Cedar.designer.getActiveWebsiteThemeColors = getActiveWebsiteThemeColors;
  window.Cedar.designer.updateDesignerLogoBackground = updateDesignerLogoBackground;
  window.Cedar.designer.syncDesignerBlogDetailsUI = syncDesignerBlogDetailsUI;
  window.renderLivePreview = renderLivePreview;
  window.Cedar.designer.renderLivePreview = renderLivePreview;
  window.setDesignerPreviewDevice = setDesignerPreviewDevice;
  window.Cedar.designer.setDesignerPreviewDevice = setDesignerPreviewDevice;
  window.getActiveWebsiteThemeColors = getActiveWebsiteThemeColors;
  window.updateDesignerLogoBackground = updateDesignerLogoBackground;
  window.updateSettingsLogoBackground = updateDesignerLogoBackground;
  window.updateAllPreviewFrames = updateAllPreviewFrames;
  window.Cedar.updateAllPreviewFrames = updateAllPreviewFrames;
  window.Cedar.designer.updateAllPreviewFrames = updateAllPreviewFrames;

})();
