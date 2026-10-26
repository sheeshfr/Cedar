/**
 * Cedar Preview — Theme & Palettes
 */
(function () {
  'use strict';
  window.CedarPreview = window.CedarPreview || window.OutpostPreview || {};
  window.OutpostPreview = window.CedarPreview;

      const MUTED_COVER_PALETTE = [
        '#27272a', // Zinc dark
        '#202024', // Neutral graphite
        '#242428', // Deep iron
        '#2a2a2e', // Carbon
        '#1f1f23', // Charcoal
        '#2d2d32', // Stone grey
        '#222226', // Obsidian
        '#28282c', // Slate grey
        '#1e1e22', // Slate dark
        '#26262a', // Basalt
        '#232327', // Granite
        '#2b2b30'  // Ash grey
      ];

      function getMutedCoverColor(seed) {
        if (!seed) return MUTED_COVER_PALETTE[0];
        let hash = 0;
        const s = String(seed);
        for (let i = 0; i < s.length; i++) {
          hash = ((hash << 5) - hash) + s.charCodeAt(i);
          hash |= 0;
        }
        const idx = Math.abs(hash) % MUTED_COVER_PALETTE.length;
        return MUTED_COVER_PALETTE[idx];
      }

      // =========================================================================
      // CEDAR SITE THEMES ENGINE (1:1 with Cedar Editor Color Palettes)
      // =========================================================================
      const THEME_PALETTES = {
        basalt: { id: 'basalt', name: 'Basalt', c60: '#09090b', c30: '#18181b', c10: '#71717a', textPrimary: '#fafafa', textSecondary: '#d4d4d8', textMuted: '#a1a1aa', border: 'rgba(113, 113, 122, 0.25)', isLight: false, btnTextColor: '#ffffff', popout3dBg: '#18181b', popout3dBgHover: '#27272a', popout3dShelf: '#71717a', popout3dBorder: 'rgba(255, 255, 255, 0.14)', popout3dBorderHover: '#71717a', popout3dColor: '#fafafa' },
        canvas: { id: 'canvas', name: 'Canvas', c60: '#ffffff', c30: '#f4f4f5', c10: '#18181b', textPrimary: '#18181b', textSecondary: '#3f3f46', textMuted: '#52525b', border: 'rgba(24, 24, 27, 0.2)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#e4e4e7', popout3dBgHover: '#d4d4d8', popout3dShelf: '#18181b', popout3dBorder: 'rgba(24, 24, 27, 0.18)', popout3dBorderHover: '#18181b', popout3dColor: '#18181b' },
        slate: { id: 'slate', name: 'Slate', c60: '#0b1120', c30: '#1e293b', c10: '#94a3b8', textPrimary: '#f8fafc', textSecondary: '#cbd5e1', textMuted: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)', isLight: false, btnTextColor: '#000000', popout3dBg: '#1e293b', popout3dBgHover: '#334155', popout3dShelf: '#94a3b8', popout3dBorder: 'rgba(255, 255, 255, 0.14)', popout3dBorderHover: '#94a3b8', popout3dColor: '#f8fafc' },
        linen: { id: 'linen', name: 'Linen', c60: '#faf8f5', c30: '#ede7df', c10: '#52483e', textPrimary: '#292524', textSecondary: '#57534e', textMuted: '#52483e', border: 'rgba(82, 72, 62, 0.22)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#e2dcce', popout3dBgHover: '#d4cebf', popout3dShelf: '#52483e', popout3dBorder: 'rgba(82, 72, 62, 0.22)', popout3dBorderHover: '#52483e', popout3dColor: '#292524' },
        matcha_moss: { id: 'matcha_moss', name: 'Matcha', c60: '#0f241a', c30: '#3f6239', c10: '#bef264', textPrimary: '#ffffff', textSecondary: '#ecfccb', textMuted: '#d9f99d', border: 'rgba(190, 242, 100, 0.35)', isLight: false, btnTextColor: '#000000', popout3dBg: '#3f6239', popout3dBgHover: '#4c7645', popout3dShelf: '#bef264', popout3dBorder: 'rgba(190, 242, 100, 0.25)', popout3dBorderHover: '#bef264', popout3dColor: '#ffffff' },
        oasis_moss: { id: 'oasis_moss', name: 'Oasis', c60: '#f4f8f5', c30: '#e2ece5', c10: '#059669', textPrimary: '#132a1e', textSecondary: '#334155', textMuted: '#475569', border: 'rgba(5, 150, 105, 0.25)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#d0dfd4', popout3dBgHover: '#c1d2c6', popout3dShelf: '#059669', popout3dBorder: 'rgba(5, 150, 105, 0.22)', popout3dBorderHover: '#059669', popout3dColor: '#132a1e' },
        riviera_azure: { id: 'riviera_azure', name: 'Coast', c60: '#f5f8fc', c30: '#e5edf7', c10: '#2563eb', textPrimary: '#0f172a', textSecondary: '#334155', textMuted: '#475569', border: 'rgba(37, 99, 235, 0.25)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#d2e2f3', popout3dBgHover: '#c1d4e7', popout3dShelf: '#2563eb', popout3dBorder: 'rgba(37, 99, 235, 0.22)', popout3dBorderHover: '#2563eb', popout3dColor: '#0f172a' },
        mulberry_plum: { id: 'mulberry_plum', name: 'Plum', c60: '#180e29', c30: '#702459', c10: '#fb7185', textPrimary: '#ffffff', textSecondary: '#ffe4e6', textMuted: '#fbcfe8', border: 'rgba(251, 113, 133, 0.35)', isLight: false, btnTextColor: '#000000', popout3dBg: '#702459', popout3dBgHover: '#852b6a', popout3dShelf: '#fb7185', popout3dBorder: 'rgba(251, 113, 133, 0.25)', popout3dBorderHover: '#fb7185', popout3dColor: '#ffffff' },
        peony_blush: { id: 'peony_blush', name: 'Peony', c60: '#fdf6f7', c30: '#fae3e8', c10: '#e11d48', textPrimary: '#18181b', textSecondary: '#3f3f46', textMuted: '#52525b', border: 'rgba(225, 29, 72, 0.25)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#f0d2d9', popout3dBgHover: '#e2c0c8', popout3dShelf: '#e11d48', popout3dBorder: 'rgba(225, 29, 72, 0.22)', popout3dBorderHover: '#e11d48', popout3dColor: '#18181b' },
        solstice_warm: { id: 'solstice_warm', name: 'Solar', c60: '#fdfaf6', c30: '#f6e8dc', c10: '#ea580c', textPrimary: '#18181b', textSecondary: '#3f3f46', textMuted: '#52525b', border: 'rgba(234, 88, 12, 0.25)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#eed4c1', popout3dBgHover: '#dfc3ae', popout3dShelf: '#ea580c', popout3dBorder: 'rgba(234, 88, 12, 0.22)', popout3dBorderHover: '#ea580c', popout3dColor: '#18181b' },
        tropic: { id: 'tropic', name: 'Tropic', c60: '#f0fdfa', c30: '#ccfbf1', c10: '#f43f5e', textPrimary: '#0f172a', textSecondary: '#334155', textMuted: '#475569', border: 'rgba(244, 63, 94, 0.25)', isLight: true, btnTextColor: '#ffffff', popout3dBg: '#bceee3', popout3dBgHover: '#a9e1d5', popout3dShelf: '#f43f5e', popout3dBorder: 'rgba(244, 63, 94, 0.22)', popout3dBorderHover: '#f43f5e', popout3dColor: '#0f172a' },
        cyber: { id: 'cyber', name: 'Cyber', c60: '#070b19', c30: '#22123b', c10: '#00f5d4', textPrimary: '#ffffff', textSecondary: '#e2e8f0', textMuted: '#a5b4fc', border: 'rgba(0, 245, 212, 0.35)', isLight: false, btnTextColor: '#000000', popout3dBg: '#22123b', popout3dBgHover: '#2e1850', popout3dShelf: '#00f5d4', popout3dBorder: 'rgba(0, 245, 212, 0.25)', popout3dBorderHover: '#00f5d4', popout3dColor: '#ffffff' },
        indigo: { id: 'indigo', name: 'Indigo', c60: '#0b0f19', c30: '#172033', c10: '#6366f1', textPrimary: '#f8fafc', textSecondary: '#cbd5e1', textMuted: '#94a3b8', border: 'rgba(99, 102, 241, 0.25)', isLight: false, btnTextColor: '#ffffff', popout3dBg: '#172033', popout3dBgHover: '#222f4b', popout3dShelf: '#6366f1', popout3dBorder: 'rgba(99, 102, 241, 0.25)', popout3dBorderHover: '#6366f1', popout3dColor: '#f8fafc' },
        cinder: { id: 'cinder', name: 'Cinder', c60: '#14100e', c30: '#241c18', c10: '#ea580c', textPrimary: '#fef3c7', textSecondary: '#fed7aa', textMuted: '#fdba74', border: 'rgba(234, 88, 12, 0.25)', isLight: false, btnTextColor: '#ffffff', popout3dBg: '#241c18', popout3dBgHover: '#322722', popout3dShelf: '#ea580c', popout3dBorder: 'rgba(234, 88, 12, 0.25)', popout3dBorderHover: '#ea580c', popout3dColor: '#fef3c7' }
      };

      // Aliases (synced 1:1 with FTUE & Designer palettes)
      THEME_PALETTES.basalt_dark = THEME_PALETTES.basalt;
      THEME_PALETTES.noir_mono = THEME_PALETTES.basalt;
      THEME_PALETTES.noir = THEME_PALETTES.basalt;
      THEME_PALETTES.obsidian = THEME_PALETTES.basalt;
      THEME_PALETTES.monochrome = THEME_PALETTES.basalt;

      THEME_PALETTES.canvas_mono = THEME_PALETTES.canvas;
      THEME_PALETTES.monochrome_light = THEME_PALETTES.canvas;

      THEME_PALETTES.slate_azure = THEME_PALETTES.slate;
      THEME_PALETTES.slate_ice = THEME_PALETTES.slate;
      THEME_PALETTES.carbon_slate = THEME_PALETTES.slate;
      THEME_PALETTES.carbon = THEME_PALETTES.slate;
      THEME_PALETTES.chalk_frost = THEME_PALETTES.slate;
      THEME_PALETTES.frost = THEME_PALETTES.slate;
      THEME_PALETTES.nordic = THEME_PALETTES.slate;

      THEME_PALETTES.stone = THEME_PALETTES.linen;
      THEME_PALETTES.stone_linen = THEME_PALETTES.linen;
      THEME_PALETTES.stone_noir = THEME_PALETTES.linen;
      THEME_PALETTES.parchment_warm = THEME_PALETTES.linen;
      THEME_PALETTES.ivory = THEME_PALETTES.linen;
      THEME_PALETTES.paper = THEME_PALETTES.linen;

      THEME_PALETTES.matcha = THEME_PALETTES.matcha_moss;
      THEME_PALETTES.forest = THEME_PALETTES.matcha_moss;
      THEME_PALETTES.sage_bronze = THEME_PALETTES.matcha_moss;
      THEME_PALETTES.obsidian_emerald = THEME_PALETTES.matcha_moss;
      THEME_PALETTES.emerald = THEME_PALETTES.matcha_moss;

      THEME_PALETTES.oasis = THEME_PALETTES.oasis_moss;
      THEME_PALETTES.aloe = THEME_PALETTES.oasis_moss;
      THEME_PALETTES.alabaster_sage = THEME_PALETTES.oasis_moss;
      THEME_PALETTES.sage = THEME_PALETTES.oasis_moss;

      THEME_PALETTES.coast = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.coast_azure = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.coastal = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.riviera = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.azure = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.porcelain_slate = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.cobalt = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.abyss_ocean = THEME_PALETTES.riviera_azure;
      THEME_PALETTES.abyss = THEME_PALETTES.riviera_azure;

      THEME_PALETTES.plum = THEME_PALETTES.mulberry_plum;
      THEME_PALETTES.crimson = THEME_PALETTES.mulberry_plum;
      THEME_PALETTES.crimson_ruby = THEME_PALETTES.mulberry_plum;
      THEME_PALETTES.carbon_crimson = THEME_PALETTES.mulberry_plum;

      THEME_PALETTES.peony = THEME_PALETTES.peony_blush;
      THEME_PALETTES.sakura = THEME_PALETTES.peony_blush;
      THEME_PALETTES.rose_crimson = THEME_PALETTES.peony_blush;
      THEME_PALETTES.sakura_noir = THEME_PALETTES.peony_blush;

      THEME_PALETTES.solar = THEME_PALETTES.solstice_warm;
      THEME_PALETTES.solar_warm = THEME_PALETTES.solstice_warm;
      THEME_PALETTES.solstice = THEME_PALETTES.solstice_warm;
      THEME_PALETTES.sandstone = THEME_PALETTES.solstice_warm;
      THEME_PALETTES.charcoal_amber = THEME_PALETTES.solstice_warm;
      THEME_PALETTES.amber = THEME_PALETTES.solstice_warm;

      THEME_PALETTES.tropic_flamingo = THEME_PALETTES.tropic;
      THEME_PALETTES.mirage = THEME_PALETTES.tropic;
      THEME_PALETTES.desert_mirage = THEME_PALETTES.tropic;
      THEME_PALETTES.desert_dune = THEME_PALETTES.tropic;
      THEME_PALETTES.dunes = THEME_PALETTES.tropic;
      THEME_PALETTES.lavender = THEME_PALETTES.tropic;
      THEME_PALETTES.lavender_mist = THEME_PALETTES.tropic;
      THEME_PALETTES.lilac = THEME_PALETTES.tropic;

      THEME_PALETTES.cyberpunk = THEME_PALETTES.cyber;
      THEME_PALETTES.synthwave = THEME_PALETTES.cyber;
      THEME_PALETTES.nebula = THEME_PALETTES.cyber;
      THEME_PALETTES.cosmic_nebula = THEME_PALETTES.cyber;
      THEME_PALETTES.amethyst_violet = THEME_PALETTES.cyber;

      THEME_PALETTES.midnight = THEME_PALETTES.indigo;
      THEME_PALETTES.terracotta = THEME_PALETTES.cinder;

      function hexToRgb(hex) {
        if (!hex) return '113, 113, 122';
        let c = String(hex).replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        if (isNaN(num)) return '113, 113, 122';
        return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
      }

      function rgbToHex(r, g, b) {
        const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
        return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
      }

      function getLuminance(hex) {
        if (!hex) return 0;
        let c = String(hex).replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        if (isNaN(num)) return 0;
        const r = ((num >> 16) & 255) / 255;
        const g = ((num >> 8) & 255) / 255;
        const b = (num & 255) / 255;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function isColorLight(hex) {
        if (!hex) return false;
        return getLuminance(hex) >= 0.45;
      }

      function darkenColor(hex, percent) {
        if (!hex) return '#e4e4e7';
        let c = String(hex).replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        if (isNaN(num)) return '#e4e4e7';
        const factor = Math.max(0, 1 - (percent / 100));
        const r = ((num >> 16) & 255) * factor;
        const g = ((num >> 8) & 255) * factor;
        const b = (num & 255) * factor;
        return rgbToHex(r, g, b);
      }

      function lightenColor(hex, percent) {
        if (!hex) return '#27272a';
        let c = String(hex).replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        if (isNaN(num)) return '#27272a';
        const factor = percent / 100;
        const r = ((num >> 16) & 255);
        const g = ((num >> 8) & 255);
        const b = (num & 255);
        return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
      }

      function resolvePreviewTheme(themeId) {
        if (themeId && typeof themeId === 'object' && themeId.c60) {
          return themeId;
        }

        const design = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) || {};
        const effId = themeId || design.blogTheme || design.activeTheme;

        if (effId === 'custom' && design.customColors) {
          return design.customColors;
        }

        if (effId && String(effId).startsWith('custom_')) {
          const sIdx = parseInt(String(effId).replace('custom_', ''), 10) - 1;
          if (Array.isArray(design.customPalettes) && design.customPalettes[sIdx] && design.customPalettes[sIdx].c60) {
            return design.customPalettes[sIdx];
          }
          if (design.customColors) {
            return design.customColors;
          }
        }

        if (design.customColors && (effId === 'custom' || !THEME_PALETTES[effId])) {
          return design.customColors;
        }

        if (effId && THEME_PALETTES[effId]) {
          return THEME_PALETTES[effId];
        }

        return THEME_PALETTES.basalt;
      }

      function resolvePopout3dTokens(palette, isLight) {
        palette = palette || {};
        const effIsLight = (isLight !== undefined)
          ? Boolean(isLight)
          : ((palette.isLight !== undefined) ? Boolean(palette.isLight) : isColorLight(palette.c60));

        const c60 = palette.c60 || (effIsLight ? '#ffffff' : '#09090b');
        const c30 = palette.c30 || (effIsLight ? '#f4f4f5' : '#18181b');
        const c10 = palette.c10 || (effIsLight ? '#18181b' : '#71717a');
        const textPrimary = palette.textPrimary || (effIsLight ? '#0f172a' : '#fafafa');

        const shelf = palette.popout3dShelf || c10;
        const color = palette.popout3dColor || textPrimary;

        let bg = palette.popout3dBg;
        let bgHover = palette.popout3dBgHover;
        let border = palette.popout3dBorder;
        let borderHover = palette.popout3dBorderHover;

        if (effIsLight) {
          // Guaranteed Complementary Surface Contrast — NEVER pure white-on-white
          const c60Lum = getLuminance(c60);
          const c30Lum = getLuminance(c30);

          if (!bg) {
            if (c30Lum >= 0.85 || c60Lum >= 0.85) {
              const isNeutralWhite = (c30.toLowerCase() === '#ffffff' || c30.toLowerCase() === '#fff' || c30.toLowerCase() === '#f4f4f5');
              bg = isNeutralWhite ? '#e4e4e7' : darkenColor(c30, 9);
            } else {
              bg = c30;
            }
          } else {
            // Safety guard: ensure explicit bg is not white-on-white against c60
            const bgLum = getLuminance(bg);
            if (bgLum >= 0.94 && c60Lum >= 0.90) {
              bg = '#e4e4e7';
            }
          }

          if (!bgHover) {
            // In light mode, hover deepens/darkens with 3D shelf, NEVER brightens to white
            if (bg === '#e4e4e7') {
              bgHover = '#d4d4d8';
            } else {
              bgHover = darkenColor(bg, 7);
            }
          } else {
            // Safety guard for hover: if hover is near-white or white, deepen it
            const hoverLum = getLuminance(bgHover);
            if (hoverLum >= 0.94 && c60Lum >= 0.90) {
              bgHover = '#d4d4d8';
            }
          }

          if (!border) {
            border = palette.border || 'rgba(0, 0, 0, 0.14)';
          }
          if (!borderHover) {
            borderHover = shelf || 'rgba(0, 0, 0, 0.28)';
          }
        } else {
          // Dark mode
          if (!bg) {
            bg = c30;
          }
          if (!bgHover) {
            bgHover = lightenColor(bg, 12);
          }
          if (!border) {
            border = palette.border || 'rgba(255, 255, 255, 0.14)';
          }
          if (!borderHover) {
            borderHover = shelf || 'rgba(255, 255, 255, 0.28)';
          }
        }

        return { bg, bgHover, shelf, border, borderHover, color };
      }

      function applyThemeToPreview(themeId) {
        const palette = resolvePreviewTheme(themeId);
        const root = document.documentElement;
        const isLight = (palette.isLight !== undefined) ? Boolean(palette.isLight) : isColorLight(palette.c60);
        const c60 = palette.c60 || (isLight ? '#ffffff' : '#09090b');
        const c30 = palette.c30 || (isLight ? '#f4f4f5' : '#18181b');
        const c10 = palette.c10 || '#71717a';
        const textPrimary = palette.textPrimary || (isLight ? '#0f172a' : '#fafafa');
        const textSecondary = palette.textSecondary || (isLight ? '#334155' : '#d4d4d8');
        const textMuted = palette.textMuted || (isLight ? '#475569' : '#a1a1aa');
        const borderVal = palette.border || (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.1)');
        const btnTextColor = palette.btnTextColor || (isColorLight(c10) ? '#000000' : '#ffffff');
        const accentRgb = hexToRgb(c10);
        const bgPrimaryRgb = hexToRgb(c60);
        const bgCardRgb = hexToRgb(c30);

        root.style.setProperty('--bg-primary', c60);
        root.style.setProperty('--bg-secondary', c30);
        root.style.setProperty('--bg-surface', c30);
        root.style.setProperty('--accent-primary', c10);
        root.style.setProperty('--accent-amber', c10);
        root.style.setProperty('--accent-purple', c10);
        root.style.setProperty('--accent-lavender', textMuted);
        root.style.setProperty('--accent-rose', c10);
        root.style.setProperty('--accent-rgb', accentRgb);
        root.style.setProperty('--accent-glow', `rgba(${accentRgb}, 0.25)`);
        root.style.setProperty('--accent-canvas-glow', isLight ? `rgba(${accentRgb}, 0.06)` : `rgba(${accentRgb}, 0.12)`);
        root.style.setProperty('--btn-primary-bg', c10);
        root.style.setProperty('--btn-primary-color', btnTextColor);
        root.style.setProperty('--btn-primary-glow', `rgba(${accentRgb}, 0.35)`);
        root.style.setProperty('--category-chip-bg', isLight ? 'rgba(0, 0, 0, 0.07)' : `rgba(${accentRgb}, 0.22)`);
        root.style.setProperty('--category-chip-color', textPrimary);
        root.style.setProperty('--header-bg', isLight ? 'rgba(255, 255, 255, 0.92)' : `rgba(${bgPrimaryRgb}, 0.88)`);
        root.style.setProperty('--footer-bg', isLight ? 'rgba(255, 255, 255, 0.96)' : `rgba(${bgPrimaryRgb}, 0.95)`);
        root.style.setProperty('--author-avatar-bg', 'transparent');
        root.style.setProperty('--author-avatar-color', '#ffffff');
        root.style.setProperty('--author-avatar-border', 'transparent');
        root.style.setProperty('--author-avatar-shadow', 'none');

        root.style.setProperty('--bg-card', c30);
        root.style.setProperty('--bg-card-hover', `rgba(${bgCardRgb}, 0.85)`);
        root.style.setProperty('--text-primary', textPrimary);
        root.style.setProperty('--text-secondary', textSecondary);
        root.style.setProperty('--text-prose', textPrimary);
        root.style.setProperty('--text-muted', textMuted);
        root.style.setProperty('--text-dim', textMuted);
        root.style.setProperty('--border-subtle', borderVal);
        root.style.setProperty('--border-card', borderVal);
        root.style.setProperty('--border-hover', c10);

        // Popout 3D button tokens (guaranteed complementary contrast across all themes)
        const popoutTokens = resolvePopout3dTokens(palette, isLight);
        root.style.setProperty('--popout-3d-bg', popoutTokens.bg);
        root.style.setProperty('--popout-3d-bg-hover', popoutTokens.bgHover);
        root.style.setProperty('--popout-3d-shelf', popoutTokens.shelf);
        root.style.setProperty('--popout-3d-border', popoutTokens.border);
        root.style.setProperty('--popout-3d-border-hover', popoutTokens.borderHover);
        root.style.setProperty('--popout-3d-color', popoutTokens.color);

        if (isLight) {
          root.classList.add('app-theme-light');
          if (document.body) {
            document.body.classList.add('app-theme-light');
            document.body.style.backgroundColor = c60;
          }
        } else {
          root.classList.remove('app-theme-light');
          if (document.body) {
            document.body.classList.remove('app-theme-light');
            document.body.style.backgroundColor = c60;
          }
        }

        applyTypographyToPreview();
      }

      const CEDAR_FONT_STACKS = {
        inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        plus_jakarta: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        lora: "'Lora', Georgia, 'Times New Roman', serif",
        space_grotesk: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
        fraunces: "'Fraunces', Georgia, 'Times New Roman', serif",
        syne: "'Syne', -apple-system, BlinkMacSystemFont, sans-serif",
        jetbrains_mono: "'JetBrains Mono', Consolas, Monaco, monospace",
        shantell_sans: "'Shantell Sans', cursive, sans-serif"
      };

      function applyTypographyToPreview(designOverride) {
        const design = designOverride || (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) || (window.projectConfig && window.projectConfig.design) || {};
        const siteFontKey = design.siteFont || 'inter';
        const titleFontKey = design.titleFont || siteFontKey || 'inter';
        const siteFontStack = CEDAR_FONT_STACKS[siteFontKey] || CEDAR_FONT_STACKS.inter;
        const titleFontStack = CEDAR_FONT_STACKS[titleFontKey] || siteFontStack;

        const root = document.documentElement;
        if (root) {
          root.style.setProperty('--font-sans', siteFontStack);
          root.style.setProperty('--font-title', titleFontStack);
        }
        if (document.body) {
          document.body.style.fontFamily = siteFontStack;
        }
        const headerTitleEl = document.getElementById('header-title');
        if (headerTitleEl) {
          headerTitleEl.style.fontFamily = titleFontStack;
        }
      }
      window.CEDAR_FONT_STACKS = CEDAR_FONT_STACKS;
      window.applyTypographyToPreview = applyTypographyToPreview;
      window.applyThemeToPreview = applyThemeToPreview;

      // De-flicker: fingerprint comparator to only re-render DOM when data actually changes
      let lastRenderedFingerprint = '';



  window.CedarPreview.MUTED_COVER_PALETTE = MUTED_COVER_PALETTE;
  window.OutpostPreview.MUTED_COVER_PALETTE = MUTED_COVER_PALETTE;
  window.CedarPreview.getMutedCoverColor = getMutedCoverColor;
  window.OutpostPreview.getMutedCoverColor = getMutedCoverColor;
  window.CedarPreview.THEME_PALETTES = THEME_PALETTES;
  window.OutpostPreview.THEME_PALETTES = THEME_PALETTES;
  window.CedarPreview.hexToRgb = hexToRgb;
  window.OutpostPreview.hexToRgb = hexToRgb;
  window.CedarPreview.resolvePopout3dTokens = resolvePopout3dTokens;
  window.OutpostPreview.resolvePopout3dTokens = resolvePopout3dTokens;
  window.CedarPreview.applyThemeToPreview = applyThemeToPreview;
  window.OutpostPreview.applyThemeToPreview = applyThemeToPreview;

  window.getMutedCoverColor = getMutedCoverColor;
  window.applyThemeToPreview = applyThemeToPreview;
  window.resolvePopout3dTokens = resolvePopout3dTokens;
  window.hexToRgb = hexToRgb;
  window.THEME_PALETTES = THEME_PALETTES;
})();
