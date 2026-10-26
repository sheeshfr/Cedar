/**
 * Cedar First Time User Experience (FTUE) Controller
 * Zero Dependencies, Clean State Machine, System Timezone Detection & Migration Linkage
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  let uploadedLogoDataUrl = '';
  let uploadedBrandingAssets = null;
  let detectedTimezone = 'UTC';
  let currentExtractedFiles = null;
  let currentInspection = null;
  let currentImportSourceType = 'folder'; // 'folder' (default) or 'zip'
  let currentFolderHandle = null;
  let currentFolderName = '';

  // =========================================================================
  // TIMEZONE DETECTION & SELECTION ENGINE
  // =========================================================================
  // Per user instruction: "act like my instance you can't see the timezone on my pc"
  let simulateDetectionFailure = false;

  const baseTimezoneList = [
    // UTC-11 to UTC-10
    { zone: 'Pacific/Pago_Pago', city: 'Pacific / Pago Pago (Midway, Samoa, Niue)' },
    { zone: 'Pacific/Honolulu', city: 'Pacific / Honolulu (Hawaii Standard Time)' },

    // UTC-9 to UTC-8
    { zone: 'America/Anchorage', city: 'America / Anchorage (Alaska Time)' },
    { zone: 'America/Los_Angeles', city: 'America / Los Angeles (Pacific Time - US & Canada)' },
    { zone: 'America/Tijuana', city: 'America / Tijuana (Pacific Time - Mexico)' },

    // UTC-7
    { zone: 'America/Denver', city: 'America / Denver (Mountain Time - US & Canada)' },
    { zone: 'America/Phoenix', city: 'America / Phoenix (Arizona MST)' },

    // UTC-6
    { zone: 'America/Chicago', city: 'America / Chicago (Central Time - US & Canada)' },
    { zone: 'America/Mexico_City', city: 'America / Mexico City (Central Time - Mexico)' },
    { zone: 'America/Guatemala', city: 'America / Guatemala (Central America)' },

    // UTC-5 (North & South America)
    { zone: 'America/New_York', city: 'America / New York (Eastern Time - US & Canada)' },
    { zone: 'America/Bogota', city: 'America / Bogota (Bogotá, Colombia, Ecuador)' },
    { zone: 'America/Lima', city: 'America / Lima (Lima, Peru Time)' },

    // UTC-4 (South America, Caribbean, Atlantic)
    { zone: 'America/Caracas', city: 'America / Caracas (Caracas, Venezuela Time)' },
    { zone: 'America/Santiago', city: 'America / Santiago (Santiago, Chile Time)' },
    { zone: 'America/La_Paz', city: 'America / La Paz (La Paz, Bolivia Time)' },
    { zone: 'America/Halifax', city: 'America / Halifax (Atlantic Time - Canada)' },

    // UTC-3 (South America)
    { zone: 'America/Sao_Paulo', city: 'America / Sao Paulo (Brasília, São Paulo, Rio)' },
    { zone: 'America/Argentina/Buenos_Aires', city: 'America / Buenos Aires (Argentina Time)' },
    { zone: 'America/Montevideo', city: 'America / Montevideo (Montevideo, Uruguay Time)' },

    // UTC-3:30 to UTC-1
    { zone: 'America/St_Johns', city: 'America / St. John\'s (Newfoundland Time)' },
    { zone: 'Atlantic/South_Georgia', city: 'Atlantic / South Georgia (Mid-Atlantic)' },
    { zone: 'Atlantic/Azores', city: 'Atlantic / Azores (Azores, Cape Verde)' },

    // UTC 0
    { zone: 'UTC', city: 'UTC (Coordinated Universal Time)' },
    { zone: 'Europe/London', city: 'Europe / London (London, Dublin, Lisbon - GMT / BST)' },
    { zone: 'Africa/Casablanca', city: 'Africa / Casablanca (Morocco Time)' },

    // UTC+1 (Europe, West Africa)
    { zone: 'Europe/Paris', city: 'Europe / Paris (Paris, Berlin, Rome, Madrid - CET)' },
    { zone: 'Europe/Berlin', city: 'Europe / Berlin (Central European Time)' },
    { zone: 'Africa/Lagos', city: 'Africa / Lagos (West Africa Time - Nigeria)' },

    // UTC+2 (Eastern Europe, Africa, Middle East)
    { zone: 'Europe/Athens', city: 'Europe / Athens (Athens, Helsinki, Bucharest - EET)' },
    { zone: 'Africa/Cairo', city: 'Africa / Cairo (Cairo, Egypt Time)' },
    { zone: 'Africa/Johannesburg', city: 'Africa / Johannesburg (South Africa Standard Time)' },
    { zone: 'Asia/Jerusalem', city: 'Asia / Jerusalem (Israel Time)' },

    // UTC+3
    { zone: 'Europe/Moscow', city: 'Europe / Moscow (Moscow, St. Petersburg)' },
    { zone: 'Asia/Riyadh', city: 'Asia / Riyadh (Riyadh, Baghdad, Kuwait, Nairobi)' },
    { zone: 'Europe/Istanbul', city: 'Europe / Istanbul (Turkey Time)' },

    // UTC+3:30 to UTC+4:30
    { zone: 'Asia/Tehran', city: 'Asia / Tehran (Iran Standard Time)' },
    { zone: 'Asia/Dubai', city: 'Asia / Dubai (Gulf Standard Time - Dubai, Abu Dhabi)' },
    { zone: 'Asia/Baku', city: 'Asia / Baku (Azerbaijan Time)' },
    { zone: 'Asia/Kabul', city: 'Asia / Kabul (Afghanistan Time)' },

    // UTC+5 to UTC+5:45
    { zone: 'Asia/Karachi', city: 'Asia / Karachi (Pakistan Standard Time, Tashkent)' },
    { zone: 'Asia/Kolkata', city: 'Asia / Kolkata (India Standard Time - Mumbai, New Delhi)' },
    { zone: 'Asia/Kathmandu', city: 'Asia / Kathmandu (Nepal Time)' },

    // UTC+6 to UTC+6:30
    { zone: 'Asia/Dhaka', city: 'Asia / Dhaka (Bangladesh Standard Time, Almaty)' },
    { zone: 'Asia/Yangon', city: 'Asia / Yangon (Myanmar Time)' },

    // UTC+7
    { zone: 'Asia/Bangkok', city: 'Asia / Bangkok (Indochina Time - Bangkok, Jakarta, Hanoi)' },

    // UTC+8
    { zone: 'Asia/Singapore', city: 'Asia / Singapore (Singapore, Kuala Lumpur)' },
    { zone: 'Asia/Hong_Kong', city: 'Asia / Hong Kong (Hong Kong, Beijing, Shanghai, Perth)' },

    // UTC+9 to UTC+9:30
    { zone: 'Asia/Tokyo', city: 'Asia / Tokyo (Japan Standard Time, Seoul)' },
    { zone: 'Australia/Adelaide', city: 'Australia / Adelaide (Adelaide, Darwin)' },

    // UTC+10
    { zone: 'Australia/Sydney', city: 'Australia / Sydney (AEST / AEDT - Sydney, Melbourne, Brisbane)' },

    // UTC+11 to UTC+14
    { zone: 'Pacific/Noumea', city: 'Pacific / Noumea (Solomon Is., New Caledonia)' },
    { zone: 'Pacific/Auckland', city: 'Pacific / Auckland (NZST / NZDT - Auckland, Wellington, Fiji)' },
    { zone: 'Pacific/Tongatapu', city: 'Pacific / Tongatapu (Tonga, Samoa)' },
    { zone: 'Pacific/Kiritimati', city: 'Pacific / Kiritimati (Line Islands)' }
  ];

  /**
   * Dynamically computes the active UTC offset (+/- hours:mins) for any IANA timezone
   */
  function getTimezoneOffsetInfo(timeZone) {
    try {
      const now = new Date();
      // Method A: Intl longOffset if supported by browser
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone,
          timeZoneName: 'longOffset',
          hour: 'numeric'
        }).formatToParts(now);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        if (tzPart && tzPart.value) {
          let val = tzPart.value.replace('GMT', 'UTC');
          if (val === 'UTC') val = 'UTC+00:00';
          const match = val.match(/UTC([+-])(\d{1,2}):?(\d{2})?/);
          if (match) {
            const sign = match[1] === '-' ? -1 : 1;
            const hours = parseInt(match[2], 10);
            const mins = parseInt(match[3] || '0', 10);
            const totalMins = sign * (hours * 60 + mins);
            const paddedHours = String(hours).padStart(2, '0');
            const paddedMins = String(mins).padStart(2, '0');
            return {
              offsetMinutes: totalMins,
              formattedOffset: `(UTC${match[1]}${paddedHours}:${paddedMins})`
            };
          }
        }
      } catch (e) {}

      // Method B: Pure Date calculation fallback
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
      const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
      const sign = diffMinutes >= 0 ? '+' : '-';
      const absMinutes = Math.abs(diffMinutes);
      const hours = Math.floor(absMinutes / 60);
      const minutes = absMinutes % 60;
      const formatted = `(UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')})`;
      return {
        offsetMinutes: diffMinutes,
        formattedOffset: formatted
      };
    } catch (err) {
      return { offsetMinutes: 0, formattedOffset: '(UTC+00:00)' };
    }
  }

  /**
   * Sorts all available timezones from most minus (-11:00) to most plus (+14:00)
   */
  function getSortedTimezoneList() {
    const listWithOffsets = baseTimezoneList.map(item => {
      const offsetInfo = getTimezoneOffsetInfo(item.zone);
      return {
        zone: item.zone,
        cityName: item.city,
        offsetMinutes: offsetInfo.offsetMinutes,
        formattedOffset: offsetInfo.formattedOffset,
        displayLabel: `${offsetInfo.formattedOffset} ${item.city}`
      };
    });

    listWithOffsets.sort((a, b) => {
      if (a.offsetMinutes !== b.offsetMinutes) {
        return a.offsetMinutes - b.offsetMinutes; // ascending: most minus (-660) to most plus (+840)
      }
      return a.cityName.localeCompare(b.cityName);
    });

    return listWithOffsets;
  }

  let clockInterval = null;

  function startClockTicker() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(() => {
      updateLocalClock();
      updateManualClock();
    }, 1000);
  }

  function stopClockTicker() {
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  function detectSystemTimezone() {
    let rawDetected = null;

    if (!simulateDetectionFailure) {
      try {
        const resolved = Intl.DateTimeFormat().resolvedOptions();
        if (resolved && resolved.timeZone) {
          rawDetected = resolved.timeZone;
        }
      } catch (e) {
        console.warn('[FTUE] Could not detect system timezone:', e);
      }
    }

    const detectedBox = document.getElementById('ftue-tz-banner');
    const manualBox = document.getElementById('ftue-tz-manual-box');
    const btnToggle = document.getElementById('ftue-btn-toggle-manual-tz');

    if (rawDetected && !simulateDetectionFailure) {
      // Browser passed system time off to the website
      detectedTimezone = rawDetected;
      if (detectedBox) detectedBox.style.display = 'flex';
      if (manualBox) manualBox.style.display = 'none';

      const tzNameEl = document.getElementById('ftue-tz-name');
      if (tzNameEl) {
        const info = getTimezoneOffsetInfo(detectedTimezone);
        tzNameEl.textContent = `${info.formattedOffset} ${detectedTimezone}`;
      }
      updateLocalClock();
    } else {
      // System timezone cannot be detected (or simulated failure for testing)
      // ALWAYS default to America/Chicago (Central Time)
      detectedTimezone = 'America/Chicago';

      if (detectedBox) detectedBox.style.display = 'none';
      if (manualBox) manualBox.style.display = 'block';

      populateMainTimezoneSelect();
      updateManualClock();
    }

    if (btnToggle) {
      btnToggle.onclick = () => {
        if (detectedBox) detectedBox.style.display = 'none';
        if (manualBox) manualBox.style.display = 'block';
        populateMainTimezoneSelect();
        updateManualClock();
      };
    }

    startClockTicker();
  }

  function updateLocalClock() {
    const clockEl = document.getElementById('ftue-tz-clock');
    if (!clockEl) return;
    try {
      const activeZone = detectedTimezone || 'America/Chicago';
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: activeZone
      });
      clockEl.textContent = timeStr;
    } catch (e) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }

  function updateManualClock() {
    const clockEl = document.getElementById('ftue-tz-manual-clock');
    if (!clockEl) return;
    try {
      const activeZone = detectedTimezone || 'America/Chicago';
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: activeZone
      });
      clockEl.textContent = timeStr;
    } catch (e) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }

  // =========================================================================
  // COLOR PALETTES & REAL-TIME APPLICATION
  // Row 1: Dark Themes (1-3) & Flavor of Color Themes (4-5)
  // Row 2: Light Mode Themes (6-8) & Flavor of Color Themes (9-10)
  // =========================================================================
  // =========================================================================
  // COLOR PALETTES & REAL-TIME APPLICATION
  // 14 Multi-Tone Palettes (60% background, 30% surface, 10% accent)
  // Ordered Left-to-Right: Plain Neutrals -> Harmonious In-line -> Wild Contrast
  // All names <= 6 characters
  // =========================================================================
  const THEME_PALETTES = {
    // 1. Basalt (Dark Plain Monochrome)
    basalt: {
      id: 'basalt',
      name: 'Basalt',
      c60: '#09090b',
      c30: '#18181b',
      c10: '#71717a',
      border: 'rgba(113, 113, 122, 0.25)',
      glow: 'white',
      isLight: false,
      btnTextColor: '#ffffff',
      popout3dBg: '#18181b',
      popout3dBgHover: '#27272a',
      popout3dShelf: '#71717a',
      popout3dBorder: 'rgba(255, 255, 255, 0.14)',
      popout3dBorderHover: '#71717a',
      popout3dColor: '#fafafa'
    },

    // 2. Canvas (Light Plain Monochrome)
    canvas: {
      id: 'canvas',
      name: 'Canvas',
      c60: '#ffffff',
      c30: '#f4f4f5',
      c10: '#18181b',
      border: 'rgba(24, 24, 27, 0.2)',
      glow: 'white',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#e4e4e7',
      popout3dBgHover: '#d4d4d8',
      popout3dShelf: '#18181b',
      popout3dBorder: 'rgba(24, 24, 27, 0.18)',
      popout3dBorderHover: '#18181b',
      popout3dColor: '#18181b'
    },

    // 3. Slate (Dark Cool Subtle In-Line)
    slate: {
      id: 'slate',
      name: 'Slate',
      c60: '#0b1120',
      c30: '#1e293b',
      c10: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.25)',
      glow: 'cyan',
      isLight: false,
      btnTextColor: '#000000',
      popout3dBg: '#1e293b',
      popout3dBgHover: '#334155',
      popout3dShelf: '#94a3b8',
      popout3dBorder: 'rgba(255, 255, 255, 0.14)',
      popout3dBorderHover: '#94a3b8',
      popout3dColor: '#f8fafc'
    },

    // 4. Linen (Light Warm Subtle In-Line)
    linen: {
      id: 'linen',
      name: 'Linen',
      c60: '#faf8f5',
      c30: '#ede7df',
      c10: '#52483e',
      border: 'rgba(82, 72, 62, 0.22)',
      glow: 'amber',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#e2dcce',
      popout3dBgHover: '#d4cebf',
      popout3dShelf: '#52483e',
      popout3dBorder: 'rgba(82, 72, 62, 0.22)',
      popout3dBorderHover: '#52483e',
      popout3dColor: '#292524'
    },

    // 5. Matcha (Dark Organic Green In-Line)
    matcha_moss: {
      id: 'matcha_moss',
      name: 'Matcha',
      c60: '#0f241a',
      c30: '#3f6239',
      c10: '#bef264',
      border: 'rgba(190, 242, 100, 0.35)',
      glow: 'emerald',
      isLight: false,
      btnTextColor: '#000000',
      popout3dBg: '#3f6239',
      popout3dBgHover: '#4c7645',
      popout3dShelf: '#bef264',
      popout3dBorder: 'rgba(190, 242, 100, 0.25)',
      popout3dBorderHover: '#bef264',
      popout3dColor: '#ffffff'
    },

    // 6. Oasis (Light Organic Emerald In-Line)
    oasis_moss: {
      id: 'oasis_moss',
      name: 'Oasis',
      c60: '#f4f8f5',
      c30: '#e2ece5',
      c10: '#059669',
      border: 'rgba(5, 150, 105, 0.25)',
      glow: 'emerald',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#d0dfd4',
      popout3dBgHover: '#c1d2c6',
      popout3dShelf: '#059669',
      popout3dBorder: 'rgba(5, 150, 105, 0.22)',
      popout3dBorderHover: '#059669',
      popout3dColor: '#132a1e'
    },

    // 7. Coast (Light Breezy Cobalt In-Line)
    riviera_azure: {
      id: 'riviera_azure',
      name: 'Coast',
      c60: '#f5f8fc',
      c30: '#e5edf7',
      c10: '#2563eb',
      border: 'rgba(37, 99, 235, 0.25)',
      glow: 'cyan',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#d2e2f3',
      popout3dBgHover: '#c1d4e7',
      popout3dShelf: '#2563eb',
      popout3dBorder: 'rgba(37, 99, 235, 0.22)',
      popout3dBorderHover: '#2563eb',
      popout3dColor: '#0f172a'
    },

    // 8. Plum (Dark Deep Berry & Rose In-Line)
    mulberry_plum: {
      id: 'mulberry_plum',
      name: 'Plum',
      c60: '#180e29',
      c30: '#702459',
      c10: '#fb7185',
      border: 'rgba(251, 113, 133, 0.35)',
      glow: 'ruby',
      isLight: false,
      btnTextColor: '#000000',
      popout3dBg: '#702459',
      popout3dBgHover: '#852b6a',
      popout3dShelf: '#fb7185',
      popout3dBorder: 'rgba(251, 113, 133, 0.25)',
      popout3dBorderHover: '#fb7185',
      popout3dColor: '#ffffff'
    },

    // 9. Peony (Light Airy Blush & Rose In-Line)
    peony_blush: {
      id: 'peony_blush',
      name: 'Peony',
      c60: '#fdf6f7',
      c30: '#fae3e8',
      c10: '#e11d48',
      border: 'rgba(225, 29, 72, 0.25)',
      glow: 'ruby',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#f0d2d9',
      popout3dBgHover: '#e2c0c8',
      popout3dShelf: '#e11d48',
      popout3dBorder: 'rgba(225, 29, 72, 0.22)',
      popout3dBorderHover: '#e11d48',
      popout3dColor: '#18181b'
    },

    // 10. Solar (Light Warm Tangerine & Gold In-Line)
    solstice_warm: {
      id: 'solstice_warm',
      name: 'Solar',
      c60: '#fdfaf6',
      c30: '#f6e8dc',
      c10: '#ea580c',
      border: 'rgba(234, 88, 12, 0.25)',
      glow: 'amber',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#eed4c1',
      popout3dBgHover: '#dfc3ae',
      popout3dShelf: '#ea580c',
      popout3dBorder: 'rgba(234, 88, 12, 0.22)',
      popout3dBorderHover: '#ea580c',
      popout3dColor: '#18181b'
    },

    // 11. Tropic (Light Mint Teal & Sharp Flamingo Rose Contrast)
    tropic: {
      id: 'tropic',
      name: 'Tropic',
      c60: '#f0fdfa',
      c30: '#ccfbf1',
      c10: '#f43f5e',
      border: 'rgba(244, 63, 94, 0.25)',
      glow: 'ruby',
      isLight: true,
      btnTextColor: '#ffffff',
      popout3dBg: '#bceee3',
      popout3dBgHover: '#a9e1d5',
      popout3dShelf: '#f43f5e',
      popout3dBorder: 'rgba(244, 63, 94, 0.22)',
      popout3dBorderHover: '#f43f5e',
      popout3dColor: '#0f172a'
    },

    // 14. Cyber (Dark Midnight Void & Synthwave Violet & Electric Aqua Contrast)
    cyber: {
      id: 'cyber',
      name: 'Cyber',
      c60: '#070b19',
      c30: '#22123b',
      c10: '#00f5d4',
      border: 'rgba(0, 245, 212, 0.35)',
      glow: 'cyan',
      isLight: false,
      btnTextColor: '#000000',
      popout3dBg: '#22123b',
      popout3dBgHover: '#2e1850',
      popout3dShelf: '#00f5d4',
      popout3dBorder: 'rgba(0, 245, 212, 0.25)',
      popout3dBorderHover: '#00f5d4',
      popout3dColor: '#ffffff'
    },

    // 15. Indigo (Dark Midnight Violet-Indigo — 6 chars)
    indigo: {
      id: 'indigo',
      name: 'Indigo',
      c60: '#0b0f19',
      c30: '#172033',
      c10: '#6366f1',
      border: 'rgba(99, 102, 241, 0.25)',
      glow: 'indigo',
      isLight: false,
      btnTextColor: '#ffffff',
      popout3dBg: '#172033',
      popout3dBgHover: '#222f4b',
      popout3dShelf: '#6366f1',
      popout3dBorder: 'rgba(99, 102, 241, 0.25)',
      popout3dBorderHover: '#6366f1',
      popout3dColor: '#f8fafc'
    },

    // 16. Cinder (Dark Roasted Espresso & Ember Glow — 6 chars)
    cinder: {
      id: 'cinder',
      name: 'Cinder',
      c60: '#14100e',
      c30: '#241c18',
      c10: '#ea580c',
      border: 'rgba(234, 88, 12, 0.25)',
      glow: 'amber',
      isLight: false,
      btnTextColor: '#ffffff',
      popout3dBg: '#241c18',
      popout3dBgHover: '#322722',
      popout3dShelf: '#ea580c',
      popout3dBorder: 'rgba(234, 88, 12, 0.25)',
      popout3dBorderHover: '#ea580c',
      popout3dColor: '#fef3c7'
    }
  };

  // Backwards compatibility & name aliases
  THEME_PALETTES.basalt_dark = THEME_PALETTES.basalt;
  THEME_PALETTES.noir_mono = THEME_PALETTES.basalt;
  THEME_PALETTES.noir = THEME_PALETTES.basalt;
  THEME_PALETTES.monochrome = THEME_PALETTES.basalt;

  THEME_PALETTES.canvas_mono = THEME_PALETTES.canvas;
  THEME_PALETTES.monochrome_light = THEME_PALETTES.canvas;

  THEME_PALETTES.slate_azure = THEME_PALETTES.slate;
  THEME_PALETTES.slate_ice = THEME_PALETTES.slate;
  THEME_PALETTES.carbon_slate = THEME_PALETTES.slate;
  THEME_PALETTES.carbon = THEME_PALETTES.slate;
  THEME_PALETTES.chalk_frost = THEME_PALETTES.slate;
  THEME_PALETTES.frost = THEME_PALETTES.slate;

  THEME_PALETTES.stone = THEME_PALETTES.linen;
  THEME_PALETTES.stone_linen = THEME_PALETTES.linen;
  THEME_PALETTES.stone_noir = THEME_PALETTES.linen;
  THEME_PALETTES.parchment_warm = THEME_PALETTES.linen;
  THEME_PALETTES.ivory = THEME_PALETTES.linen;

  THEME_PALETTES.matcha = THEME_PALETTES.matcha_moss;
  THEME_PALETTES.sage_bronze = THEME_PALETTES.matcha_moss;
  THEME_PALETTES.obsidian_emerald = THEME_PALETTES.matcha_moss;
  THEME_PALETTES.emerald = THEME_PALETTES.matcha_moss;

  THEME_PALETTES.oasis = THEME_PALETTES.oasis_moss;
  THEME_PALETTES.alabaster_sage = THEME_PALETTES.oasis_moss;
  THEME_PALETTES.sage = THEME_PALETTES.oasis_moss;

  THEME_PALETTES.coast = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.coast_azure = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.riviera = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.azure = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.porcelain_slate = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.cobalt = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.abyss_ocean = THEME_PALETTES.riviera_azure;
  THEME_PALETTES.abyss = THEME_PALETTES.riviera_azure;

  THEME_PALETTES.plum = THEME_PALETTES.mulberry_plum;
  THEME_PALETTES.crimson_ruby = THEME_PALETTES.mulberry_plum;
  THEME_PALETTES.carbon_crimson = THEME_PALETTES.mulberry_plum;

  THEME_PALETTES.peony = THEME_PALETTES.peony_blush;
  THEME_PALETTES.rose_crimson = THEME_PALETTES.peony_blush;
  THEME_PALETTES.sakura_noir = THEME_PALETTES.peony_blush;
  THEME_PALETTES.sakura = THEME_PALETTES.peony_blush;

  THEME_PALETTES.solar = THEME_PALETTES.solstice_warm;
  THEME_PALETTES.solar_warm = THEME_PALETTES.solstice_warm;
  THEME_PALETTES.solstice = THEME_PALETTES.solstice_warm;
  THEME_PALETTES.charcoal_amber = THEME_PALETTES.solstice_warm;
  THEME_PALETTES.amber = THEME_PALETTES.solstice_warm;

  THEME_PALETTES.tropic_flamingo = THEME_PALETTES.tropic;
  THEME_PALETTES.mirage = THEME_PALETTES.tropic;
  THEME_PALETTES.desert_mirage = THEME_PALETTES.tropic;
  THEME_PALETTES.desert_dune = THEME_PALETTES.tropic;
  THEME_PALETTES.dunes = THEME_PALETTES.tropic;
  THEME_PALETTES.lavender_mist = THEME_PALETTES.tropic;
  THEME_PALETTES.lilac = THEME_PALETTES.tropic;

  THEME_PALETTES.nebula = THEME_PALETTES.cyber;
  THEME_PALETTES.cosmic_nebula = THEME_PALETTES.cyber;
  THEME_PALETTES.amethyst_violet = THEME_PALETTES.cyber;
  THEME_PALETTES.deep_amethyst = THEME_PALETTES.cyber;
  THEME_PALETTES.violet = THEME_PALETTES.cyber;
  THEME_PALETTES.cyber_neon = THEME_PALETTES.cyber;

  const THEME_PALETTES_ORDERED = [
    'canvas',
    'linen',
    'oasis_moss',
    'riviera_azure',
    'peony_blush',
    'solstice_warm',
    'tropic',
    'basalt',
    'slate',
    'matcha_moss',
    'indigo',
    'mulberry_plum',
    'cinder',
    'cyber'
  ];

  const THEME_SUPER_DARK = [
    'basalt',
    'slate',
    'matcha_moss',
    'indigo',
    'mulberry_plum',
    'cinder',
    'cyber'
  ];

  const THEME_SUPER_LIGHT = [
    'canvas',
    'linen',
    'oasis_moss',
    'riviera_azure',
    'peony_blush',
    'solstice_warm',
    'tropic'
  ];

  const THEME_SUPER_PALETTES = [...THEME_PALETTES_ORDERED];
  const THEME_ACCENTS_DARK = [...THEME_SUPER_DARK];
  const THEME_ACCENTS_LIGHT = [...THEME_SUPER_LIGHT];

  const THEME_MODE_MAP = {
    basalt: 'canvas',
    canvas: 'basalt',
    slate: 'linen',
    linen: 'slate',
    matcha_moss: 'oasis_moss',
    oasis_moss: 'matcha_moss',
    riviera_azure: 'indigo',
    indigo: 'riviera_azure',
    mulberry_plum: 'peony_blush',
    peony_blush: 'mulberry_plum',
    solstice_warm: 'cinder',
    cinder: 'solstice_warm',
    tropic: 'cyber',
    cyber: 'tropic',
    stone: 'slate',
    desert_mirage: 'cyber',
    cosmic_nebula: 'tropic'
  };

  // =========================================================================
  // THEME PUNNETT SQUARE MATRIX & "IF THIS COLOR, DO THIS COLOR" RESOLVER
  // Ensures crystal-clear legibility, accessible contrast (WCAG AA >= 4.5:1),
  // and harmonious color pairing across every single theme and surface.
  // =========================================================================
  const THEME_PUNNETT_MATRIX = {
    // 1. Basalt (Dark Neutral — Card #18181b)
    basalt: {
      textPrimary: '#fafafa',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
      textEmpty: '#a1a1aa',
      panelRowBg: 'rgba(255, 255, 255, 0.04)',
      inputPlaceholder: '#71717a'
    },
    // 2. Canvas (Light Neutral — Card #f4f4f5)
    canvas: {
      textPrimary: '#18181b',
      textSecondary: '#3f3f46',
      textMuted: '#52525b',
      textEmpty: '#52525b',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#71717a'
    },
    // 3. Slate (Dark Cool Slate — Card #1e293b)
    slate: {
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      textEmpty: '#94a3b8',
      panelRowBg: 'rgba(255, 255, 255, 0.04)',
      inputPlaceholder: '#64748b'
    },
    // 4. Linen (Light Warm Subtle — Card #ede7df)
    linen: {
      textPrimary: '#292524',
      textSecondary: '#57534e',
      textMuted: '#52483e',
      textEmpty: '#52483e',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#78716c'
    },
    // 5. Matcha (Dark Organic Green — Card #3f6239)
    matcha_moss: {
      textPrimary: '#ffffff',
      textSecondary: '#ecfccb',
      textMuted: '#d9f99d',
      textEmpty: '#d9f99d',
      panelRowBg: 'rgba(0, 0, 0, 0.22)',
      inputPlaceholder: '#a3e635'
    },
    // 6. Oasis (Light Organic Emerald — Card #e2ece5)
    oasis_moss: {
      textPrimary: '#132a1e',
      textSecondary: '#334155',
      textMuted: '#475569',
      textEmpty: '#475569',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#64748b'
    },
    // 7. Coast / Riviera (Light Breezy Cobalt — Card #e5edf7)
    riviera_azure: {
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#475569',
      textEmpty: '#475569',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#64748b'
    },
    // 8. Plum / Mulberry (Dark Deep Berry — Card #702459)
    mulberry_plum: {
      textPrimary: '#ffffff',
      textSecondary: '#ffe4e6',
      textMuted: '#fbcfe8',
      textEmpty: '#fbcfe8',
      panelRowBg: 'rgba(0, 0, 0, 0.22)',
      inputPlaceholder: '#f472b6'
    },
    // 9. Peony (Light Blush — Card #fae3e8)
    peony_blush: {
      textPrimary: '#18181b',
      textSecondary: '#3f3f46',
      textMuted: '#52525b',
      textEmpty: '#52525b',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#71717a'
    },
    // 10. Solar / Solstice (Light Tangerine & Gold — Card #f6e8dc)
    solstice_warm: {
      textPrimary: '#18181b',
      textSecondary: '#3f3f46',
      textMuted: '#52525b',
      textEmpty: '#52525b',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#71717a'
    },
    // 11. Tropic (Light Mint Teal — Card #ccfbf1)
    tropic: {
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#475569',
      textEmpty: '#475569',
      panelRowBg: '#ffffff',
      inputPlaceholder: '#64748b'
    },
    // 12. Cyber (Dark Synthwave Violet — Card #22123b)
    cyber: {
      textPrimary: '#ffffff',
      textSecondary: '#e2e8f0',
      textMuted: '#a5b4fc',
      textEmpty: '#a5b4fc',
      panelRowBg: 'rgba(255, 255, 255, 0.05)',
      inputPlaceholder: '#818cf8'
    },
    // 13. Indigo (Dark Midnight Violet-Indigo — Card #172033)
    indigo: {
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      textEmpty: '#94a3b8',
      panelRowBg: 'rgba(255, 255, 255, 0.05)',
      inputPlaceholder: '#64748b'
    },
    // 14. Cinder (Dark Roasted Espresso — Card #241c18)
    cinder: {
      textPrimary: '#fef3c7',
      textSecondary: '#fed7aa',
      textMuted: '#fdba74',
      textEmpty: '#fdba74',
      panelRowBg: 'rgba(255, 255, 255, 0.05)',
      inputPlaceholder: '#ea580c'
    }
  };

  // Aliases for backwards compatibility
  THEME_PUNNETT_MATRIX.basalt_dark = THEME_PUNNETT_MATRIX.basalt;
  THEME_PUNNETT_MATRIX.noir_mono = THEME_PUNNETT_MATRIX.basalt;
  THEME_PUNNETT_MATRIX.noir = THEME_PUNNETT_MATRIX.basalt;
  THEME_PUNNETT_MATRIX.monochrome = THEME_PUNNETT_MATRIX.basalt;
  THEME_PUNNETT_MATRIX.canvas_mono = THEME_PUNNETT_MATRIX.canvas;
  THEME_PUNNETT_MATRIX.monochrome_light = THEME_PUNNETT_MATRIX.canvas;
  THEME_PUNNETT_MATRIX.slate_azure = THEME_PUNNETT_MATRIX.slate;
  THEME_PUNNETT_MATRIX.slate_ice = THEME_PUNNETT_MATRIX.slate;
  THEME_PUNNETT_MATRIX.carbon_slate = THEME_PUNNETT_MATRIX.slate;
  THEME_PUNNETT_MATRIX.carbon = THEME_PUNNETT_MATRIX.slate;
  THEME_PUNNETT_MATRIX.chalk_frost = THEME_PUNNETT_MATRIX.slate;
  THEME_PUNNETT_MATRIX.frost = THEME_PUNNETT_MATRIX.slate;
  THEME_PUNNETT_MATRIX.stone = THEME_PUNNETT_MATRIX.linen;
  THEME_PUNNETT_MATRIX.stone_linen = THEME_PUNNETT_MATRIX.linen;
  THEME_PUNNETT_MATRIX.stone_noir = THEME_PUNNETT_MATRIX.linen;
  THEME_PUNNETT_MATRIX.parchment_warm = THEME_PUNNETT_MATRIX.linen;
  THEME_PUNNETT_MATRIX.ivory = THEME_PUNNETT_MATRIX.linen;
  THEME_PUNNETT_MATRIX.matcha = THEME_PUNNETT_MATRIX.matcha_moss;
  THEME_PUNNETT_MATRIX.sage_bronze = THEME_PUNNETT_MATRIX.matcha_moss;
  THEME_PUNNETT_MATRIX.obsidian_emerald = THEME_PUNNETT_MATRIX.matcha_moss;
  THEME_PUNNETT_MATRIX.emerald = THEME_PUNNETT_MATRIX.matcha_moss;
  THEME_PUNNETT_MATRIX.oasis = THEME_PUNNETT_MATRIX.oasis_moss;
  THEME_PUNNETT_MATRIX.alabaster_sage = THEME_PUNNETT_MATRIX.oasis_moss;
  THEME_PUNNETT_MATRIX.sage = THEME_PUNNETT_MATRIX.oasis_moss;
  THEME_PUNNETT_MATRIX.coast = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.coast_azure = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.riviera = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.azure = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.porcelain_slate = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.cobalt = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.abyss_ocean = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.abyss = THEME_PUNNETT_MATRIX.riviera_azure;
  THEME_PUNNETT_MATRIX.plum = THEME_PUNNETT_MATRIX.mulberry_plum;
  THEME_PUNNETT_MATRIX.crimson_ruby = THEME_PUNNETT_MATRIX.mulberry_plum;
  THEME_PUNNETT_MATRIX.carbon_crimson = THEME_PUNNETT_MATRIX.mulberry_plum;
  THEME_PUNNETT_MATRIX.peony = THEME_PUNNETT_MATRIX.peony_blush;
  THEME_PUNNETT_MATRIX.rose_crimson = THEME_PUNNETT_MATRIX.peony_blush;
  THEME_PUNNETT_MATRIX.sakura_noir = THEME_PUNNETT_MATRIX.peony_blush;
  THEME_PUNNETT_MATRIX.sakura = THEME_PUNNETT_MATRIX.peony_blush;
  THEME_PUNNETT_MATRIX.solar = THEME_PUNNETT_MATRIX.solstice_warm;
  THEME_PUNNETT_MATRIX.solar_warm = THEME_PUNNETT_MATRIX.solstice_warm;
  THEME_PUNNETT_MATRIX.solstice = THEME_PUNNETT_MATRIX.solstice_warm;
  THEME_PUNNETT_MATRIX.charcoal_amber = THEME_PUNNETT_MATRIX.solstice_warm;
  THEME_PUNNETT_MATRIX.amber = THEME_PUNNETT_MATRIX.solstice_warm;
  THEME_PUNNETT_MATRIX.tropic_flamingo = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.mirage = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.desert_mirage = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.desert_dune = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.dunes = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.lavender_mist = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.lilac = THEME_PUNNETT_MATRIX.tropic;
  THEME_PUNNETT_MATRIX.nebula = THEME_PUNNETT_MATRIX.cyber;
  THEME_PUNNETT_MATRIX.cosmic_nebula = THEME_PUNNETT_MATRIX.cyber;
  THEME_PUNNETT_MATRIX.amethyst_violet = THEME_PUNNETT_MATRIX.cyber;
  THEME_PUNNETT_MATRIX.deep_amethyst = THEME_PUNNETT_MATRIX.cyber;
  THEME_PUNNETT_MATRIX.violet = THEME_PUNNETT_MATRIX.cyber;
  THEME_PUNNETT_MATRIX.cyber_neon = THEME_PUNNETT_MATRIX.cyber;

  // Dynamic "If this color, do this color" Fallback Contrast Resolver
  function parseRgbArray(hex) {
    if (!hex) return [18, 18, 20];
    if (typeof hex === 'object') {
      hex = hex.c30 || hex.c60 || hex.color || '';
    }
    if (typeof hex !== 'string') return [18, 18, 20];
    let c = hex.trim().replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return [18, 18, 20];
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function calculateLuminance(rgb) {
    function ch(val) {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
  }

  function resolvePunnettSquareTokens(c30Hex, isLight, c10Hex) {
    if (c30Hex && typeof c30Hex === 'object') {
      const pal = c30Hex;
      isLight = (pal.isLight !== undefined) ? Boolean(pal.isLight) : (isLight || false);
      c10Hex = pal.c10 || c10Hex;
      c30Hex = pal.c30 || pal.c60 || '';
    }
    if (!c30Hex) {
      return isLight ? THEME_PUNNETT_MATRIX.canvas : THEME_PUNNETT_MATRIX.basalt;
    }
    const rgb = parseRgbArray(c30Hex);
    const lum = calculateLuminance(rgb);

    if (isLight || lum >= 0.25) {
      // Light background: ensure dark text with high contrast
      return {
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#52525b',
        textEmpty: '#52525b',
        panelRowBg: '#ffffff',
        inputPlaceholder: '#71717a'
      };
    }

    // Dark background: calculate if it is colored (saturated) or neutral
    const isSaturated = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) > 25;
    if (isSaturated) {
      // Saturated colored dark background: pair with luminous tint
      return {
        textPrimary: '#ffffff',
        textSecondary: '#f1f5f9',
        textMuted: '#e2e8f0',
        textEmpty: '#e2e8f0',
        panelRowBg: 'rgba(0, 0, 0, 0.22)',
        inputPlaceholder: '#cbd5e1'
      };
    }

    // Deep dark neutral background
    return {
      textPrimary: '#fafafa',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
      textEmpty: '#a1a1aa',
      panelRowBg: 'rgba(255, 255, 255, 0.04)',
      inputPlaceholder: '#71717a'
    };
  }

  let urlTheme = null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    urlTheme = urlParams.get('theme');
  } catch (e) {}
  const _ftueDesignName = window.projectConfig && window.projectConfig.design && (window.projectConfig.design.blogTheme || window.projectConfig.design.activeTheme);
  let activeSelectedTheme = urlTheme || (((_ftueDesignName === 'custom' || String(_ftueDesignName).startsWith('custom_')) && window.projectConfig?.design?.customColors) ? window.projectConfig.design.customColors : _ftueDesignName) || (window.projectConfig && window.projectConfig.editorTheme) || (typeof localStorage !== 'undefined' && (localStorage.getItem('cedar_theme') || localStorage.getItem('cedar_editor_theme') || localStorage.getItem('outpost_theme'))) || 'mulberry_plum';

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

  function resolveLiveThemePalette(themeIdOrObj) {
    if (themeIdOrObj && typeof themeIdOrObj === 'object' && (themeIdOrObj.c60 || themeIdOrObj.c30)) {
      return themeIdOrObj;
    }
    const design = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.design) || (window.projectConfig && window.projectConfig.design) || {};
    const effId = (typeof themeIdOrObj === 'string' && themeIdOrObj) ? themeIdOrObj : (design.blogTheme || design.activeTheme);

    if (effId === 'custom' && design.customColors) {
      return design.customColors;
    }

    if (effId && String(effId).startsWith('custom_')) {
      const sIdx = parseInt(String(effId).replace('custom_', ''), 10) - 1;
      if (Array.isArray(design.customPalettes) && design.customPalettes[sIdx] && (design.customPalettes[sIdx].c60 || design.customPalettes[sIdx].c30)) {
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

  function applyLiveTheme(themeId, persist = true) {
    const rawPalette = resolveLiveThemePalette(themeId);
    const isLight = (rawPalette.isLight !== undefined) ? Boolean(rawPalette.isLight) : isColorLight(rawPalette.c60);
    const c60 = rawPalette.c60 || (isLight ? '#ffffff' : '#09090b');
    const c30 = rawPalette.c30 || (isLight ? '#f4f4f5' : '#18181b');
    const c10 = rawPalette.c10 || '#71717a';
    const border = rawPalette.border || (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)');
    const btnTextColor = rawPalette.btnTextColor || (isColorLight(c10) ? '#000000' : '#ffffff');
    const paletteId = (rawPalette.id && typeof rawPalette.id === 'string') ? rawPalette.id : ((typeof themeId === 'string' && themeId) ? themeId : 'custom');

    const palette = {
      id: paletteId,
      name: rawPalette.name || 'Theme',
      c60,
      c30,
      c10,
      border,
      isLight,
      btnTextColor,
      textPrimary: rawPalette.textPrimary,
      textSecondary: rawPalette.textSecondary,
      textMuted: rawPalette.textMuted,
      popout3dBg: rawPalette.popout3dBg,
      popout3dBgHover: rawPalette.popout3dBgHover,
      popout3dShelf: rawPalette.popout3dShelf,
      popout3dBorder: rawPalette.popout3dBorder,
      popout3dBorderHover: rawPalette.popout3dBorderHover,
      popout3dColor: rawPalette.popout3dColor
    };

    activeSelectedTheme = palette.id;

    // Persist unified theme immediately across reloads and into projectConfig
    if (persist) {
      try {
        localStorage.setItem('cedar_editor_theme', palette.id);
        localStorage.setItem('cedar_theme', palette.id);
      } catch (e) {}
      if (window.projectConfig) {
        window.projectConfig.editorTheme = palette.id;
        if (!window.projectConfig.design) window.projectConfig.design = {};
        window.projectConfig.design.activeTheme = palette.id;
        window.projectConfig.design.blogTheme = palette.id;
      }
    }

    function hexToRgb(hex) {
      if (!hex) return '113, 113, 122';
      let c = hex.replace('#', '');
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      const num = parseInt(c, 16);
      if (isNaN(num)) return '113, 113, 122';
      return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
    }

    // Apply tokens to document root so surrounding page/sidebar updates live
    const root = document.documentElement;
    const accentRgb = hexToRgb(palette.c10);
    const logoBg = palette.isLight ? '#ffffff' : '#121214';
    root.style.setProperty('--bg-primary', palette.c60);
    root.style.setProperty('--sidebar-bg', palette.c60);
    root.style.setProperty('--topbar-bg', palette.c60);
    root.style.setProperty('--topbar-border', palette.isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--bg-secondary', palette.c30);
    root.style.setProperty('--bg-card', palette.c30);
    root.style.setProperty('--accent-amber', palette.c10);
    root.style.setProperty('--accent-primary', palette.c10);
    root.style.setProperty('--accent-rgb', accentRgb);
    root.style.setProperty('--accent-glow', `rgba(${accentRgb}, 0.25)`);
    root.style.setProperty('--accent-canvas-glow', palette.isLight ? `rgba(${accentRgb}, 0.03)` : `rgba(${accentRgb}, 0.05)`);
    root.style.setProperty('--btn-primary-bg', palette.c10);
    root.style.setProperty('--btn-primary-color', btnTextColor);
    root.style.setProperty('--btn-primary-glow', `rgba(${accentRgb}, 0.35)`);
    root.style.setProperty('--sidebar-active-indicator', palette.c10);
    root.style.setProperty('--sidebar-active-color', palette.isLight ? '#18181b' : '#ffffff');
    root.style.setProperty('--sidebar-active-bg', palette.isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.06)');

    // Author Avatar tokens (clean transparent container so avatars are strictly circular images without theme borders or backgrounds)
    root.style.setProperty('--author-avatar-bg', 'transparent');
    root.style.setProperty('--author-avatar-color', btnTextColor);
    root.style.setProperty('--author-avatar-border', 'transparent');
    root.style.setProperty('--author-avatar-shadow', 'none');

    // Category chips theme tokens (dynamically adapts chips and badges to current theme)
    const chipBg = palette.isLight ? (palette.c30 || '#f4f4f5') : `rgba(${accentRgb}, 0.12)`;
    const chipColor = palette.isLight ? '#18181b' : '#fafafa';
    const chipBorder = palette.border || (palette.isLight ? 'rgba(0, 0, 0, 0.12)' : `rgba(${accentRgb}, 0.28)`);
    const chipCountBg = palette.c10;
    const chipCountColor = btnTextColor;
    const chipDeleteColor = palette.isLight ? '#71717a' : '#a1a1aa';

    root.style.setProperty('--category-chip-bg', chipBg);
    root.style.setProperty('--category-chip-color', chipColor);
    root.style.setProperty('--category-chip-border', chipBorder);
    root.style.setProperty('--category-chip-count-bg', chipCountBg);
    root.style.setProperty('--category-chip-count-color', chipCountColor);
    root.style.setProperty('--category-chip-delete-color', chipDeleteColor);

    // Popout 3D button tokens (guaranteed complementary contrast across all themes)
    const popoutTokens = resolvePopout3dTokens(palette, palette.isLight);
    root.style.setProperty('--popout-3d-bg', popoutTokens.bg);
    root.style.setProperty('--popout-3d-bg-hover', popoutTokens.bgHover);
    root.style.setProperty('--popout-3d-shelf', popoutTokens.shelf);
    root.style.setProperty('--popout-3d-border', popoutTokens.border);
    root.style.setProperty('--popout-3d-border-hover', popoutTokens.borderHover);
    root.style.setProperty('--popout-3d-color', popoutTokens.color);

    // FTUE specific theme variables
    root.style.setProperty('--ftue-accent', palette.c10);
    root.style.setProperty('--ftue-modal-bg', palette.c60);
    root.style.setProperty('--ftue-modal-border', palette.border);
    root.style.setProperty('--ftue-group-bg', palette.c30);
    root.style.setProperty('--ftue-card-bg', palette.c30);
    // Lookup or dynamically resolve Punnett Square contrast tokens
    let pTokens = THEME_PUNNETT_MATRIX[palette.id] || resolvePunnettSquareTokens(palette.c30, palette.isLight, palette.c10);
    if (palette.textPrimary || palette.textMuted || palette.textSecondary) {
      pTokens = {
        ...pTokens,
        textPrimary: palette.textPrimary || pTokens.textPrimary,
        textSecondary: palette.textSecondary || palette.textMuted || pTokens.textSecondary,
        textMuted: palette.textMuted || pTokens.textMuted,
        textEmpty: palette.textMuted || pTokens.textEmpty,
        textDim: palette.textMuted || pTokens.textMuted
      };
    }

    // Apply guaranteed contrast text & surface variables to :root
    root.style.setProperty('--text-primary', pTokens.textPrimary);
    root.style.setProperty('--text-secondary', pTokens.textSecondary);
    root.style.setProperty('--text-muted', pTokens.textMuted);
    root.style.setProperty('--text-empty', pTokens.textEmpty);
    root.style.setProperty('--text-dim', pTokens.textMuted);
    root.style.setProperty('--input-placeholder', pTokens.inputPlaceholder);
    root.style.setProperty('--panel-row-bg', pTokens.panelRowBg);
    root.style.setProperty('--panel-inner-bg', pTokens.panelRowBg);
    root.style.setProperty('--sidebar-text-primary', pTokens.textPrimary);
    root.style.setProperty('--sidebar-text-secondary', pTokens.textPrimary);
    root.style.setProperty('--sidebar-text-muted', pTokens.textMuted);
    root.style.setProperty('--sidebar-active-color', pTokens.textPrimary);

    root.style.setProperty('--ftue-card-hover-bg', palette.c30);
    root.style.setProperty('--ftue-card-border', palette.isLight ? 'rgba(0, 0, 0, 0.12)' : (palette.border || 'rgba(255, 255, 255, 0.1)'));
    root.style.setProperty('--ftue-card-text', pTokens.textPrimary);
    root.style.setProperty('--ftue-card-desc', pTokens.textSecondary);
    root.style.setProperty('--ftue-btn-primary-bg', palette.c10);
    root.style.setProperty('--ftue-btn-primary-border', palette.c10);
    root.style.setProperty('--ftue-btn-primary-glow', `${palette.c10}55`);
    root.style.setProperty('--ftue-btn-primary-color', btnTextColor);
    root.style.setProperty('--ftue-text-primary', pTokens.textPrimary);
    root.style.setProperty('--ftue-text-secondary', pTokens.textSecondary);
    root.style.setProperty('--ftue-manual-tz-bg', palette.isLight ? '#ffffff' : `${palette.c10}10`);
    root.style.setProperty('--ftue-manual-tz-border', palette.isLight ? 'rgba(0, 0, 0, 0.15)' : `${palette.c10}44`);

    // Topbars adaptation (matches dashboard background)
    const topbars = document.querySelectorAll('.dash-topbar');
    topbars.forEach(tb => {
      tb.style.setProperty('background-color', palette.c60, 'important');
      tb.style.setProperty('border-bottom-color', palette.isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)', 'important');
    });

    // Backdrop & Global Body adaptation
    const backdrop = document.querySelector('.modal-ftue-backdrop') || document.getElementById('modal-ftue');
    if (palette.isLight) {
      root.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.12)');
      root.style.setProperty('--border-subtle', 'rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--input-bg', '#ffffff');
      root.style.setProperty('--input-border', 'rgba(0, 0, 0, 0.16)');
      root.style.setProperty('--input-color', pTokens.textPrimary);
      root.style.setProperty('--input-prefix-color', pTokens.textMuted);
      root.style.setProperty('--btn-secondary-bg', '#f4f4f5');
      root.style.setProperty('--btn-secondary-color', pTokens.textPrimary);
      root.style.setProperty('--btn-secondary-border', 'rgba(0, 0, 0, 0.14)');
      root.style.setProperty('--btn-secondary-hover-bg', '#e4e4e7');
      root.style.setProperty('--panel-inner-bg', '#f8fafc');
      root.style.setProperty('--panel-inner-border', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--panel-row-border', 'rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--sidebar-border', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--ftue-modal-text', pTokens.textPrimary);
      root.style.setProperty('--ftue-backdrop-bg', 'rgba(235, 240, 245, 0.85)');

      // Modal theme tokens for light mode
      root.style.setProperty('--modal-card-bg', palette.c30);
      root.style.setProperty('--modal-card-border', palette.border || 'rgba(0, 0, 0, 0.12)');
      root.style.setProperty('--modal-header-bg', palette.c30);
      root.style.setProperty('--modal-footer-bg', palette.c30);
      root.style.setProperty('--modal-title-color', pTokens.textPrimary);
      root.style.setProperty('--modal-desc-color', pTokens.textSecondary);
      root.style.setProperty('--modal-overlay-bg', 'rgba(15, 23, 42, 0.6)');
      root.style.setProperty('--modal-input-bg', '#ffffff');
      root.style.setProperty('--modal-input-border', 'rgba(0, 0, 0, 0.16)');
      root.style.setProperty('--modal-input-color', pTokens.textPrimary);
      root.style.setProperty('--modal-color-scheme', 'light');

      root.classList.add('app-theme-light');
      if (document.body) {
        document.body.classList.add('app-theme-light');
        document.body.style.backgroundColor = palette.c60;
      }
      if (backdrop) {
        backdrop.classList.add('ftue-theme-light');
        backdrop.style.setProperty('background', 'rgba(235, 240, 245, 0.85)', 'important');
      }
    } else {
      root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--input-bg', '#18181b');
      root.style.setProperty('--input-border', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--input-color', pTokens.textPrimary);
      root.style.setProperty('--input-prefix-color', pTokens.textMuted);
      root.style.setProperty('--btn-secondary-bg', '#27272a');
      root.style.setProperty('--btn-secondary-color', pTokens.textPrimary);
      root.style.setProperty('--btn-secondary-border', 'rgba(255, 255, 255, 0.14)');
      root.style.setProperty('--btn-secondary-hover-bg', '#3f3f46');
      root.style.setProperty('--panel-inner-bg', 'rgba(0, 0, 0, 0.28)');
      root.style.setProperty('--panel-inner-border', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--panel-row-border', 'rgba(255, 255, 255, 0.05)');
      root.style.setProperty('--sidebar-border', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--ftue-modal-text', pTokens.textPrimary);
      root.style.setProperty('--ftue-backdrop-bg', 'rgba(8, 8, 10, 0.88)');

      // Modal theme tokens for dark mode
      root.style.setProperty('--modal-card-bg', '#1c1c20');
      root.style.setProperty('--modal-card-border', 'rgba(255, 255, 255, 0.15)');
      root.style.setProperty('--modal-header-bg', 'rgba(24, 24, 27, 0.7)');
      root.style.setProperty('--modal-footer-bg', 'rgba(24, 24, 27, 0.65)');
      root.style.setProperty('--modal-title-color', pTokens.textPrimary);
      root.style.setProperty('--modal-desc-color', pTokens.textSecondary);
      root.style.setProperty('--modal-overlay-bg', 'rgba(3, 7, 18, 0.88)');
      root.style.setProperty('--modal-input-bg', 'rgba(7, 11, 20, 0.85)');
      root.style.setProperty('--modal-input-border', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--modal-input-color', pTokens.textPrimary);
      root.style.setProperty('--modal-color-scheme', 'dark');

      root.classList.remove('app-theme-light');
      if (document.body) {
        document.body.classList.remove('app-theme-light');
        document.body.style.backgroundColor = palette.c60;
      }
      if (backdrop) {
        backdrop.classList.remove('ftue-theme-light');
        backdrop.style.setProperty('background', 'rgba(8, 8, 10, 0.88)', 'important');
      }
    }

    // Modal Content
    const modalContent = document.querySelector('.ftue-modal-content');
    if (modalContent) {
      modalContent.style.setProperty('background-color', palette.c60, 'important');
      modalContent.style.setProperty('border-color', palette.border, 'important');
      modalContent.classList.toggle('ftue-theme-light', !!palette.isLight);
    }

    // Choice Cards (Screen 1)
    const choiceCards = document.querySelectorAll('.ftue-choice-card');
    choiceCards.forEach(c => {
      if (palette.isLight) {
        c.style.setProperty('background-color', palette.c30, 'important');
        c.style.setProperty('border-color', palette.border || 'rgba(0, 0, 0, 0.12)', 'important');
        c.style.setProperty('box-shadow', '0 4px 20px rgba(0, 0, 0, 0.06)', 'important');
      } else {
        c.style.setProperty('background-color', palette.c30, 'important');
        c.style.setProperty('border-color', palette.border || 'rgba(255, 255, 255, 0.1)', 'important');
        c.style.setProperty('box-shadow', 'none', 'important');
      }
    });

    const choiceTitles = document.querySelectorAll('.ftue-choice-card-title');
    choiceTitles.forEach(t => {
      t.style.setProperty('color', palette.isLight ? '#0f172a' : '#ffffff', 'important');
    });

    const choiceDescs = document.querySelectorAll('.ftue-choice-card-desc');
    choiceDescs.forEach(d => {
      d.style.setProperty('color', palette.isLight ? '#475569' : '#a1a1aa', 'important');
    });

    const choiceActions = document.querySelectorAll('.ftue-choice-card-action');
    choiceActions.forEach(a => {
      a.style.setProperty('color', palette.c10, 'important');
    });

    const choiceIcons = document.querySelectorAll('.ftue-choice-card-icon svg');
    choiceIcons.forEach(ic => {
      ic.style.setProperty('stroke', palette.c10, 'important');
    });

    // Titles & Typography Across All Screens
    const titles = document.querySelectorAll('.ftue-modal-content .ftue-title, .ftue-modal-content .ftue-step-title, .ftue-modal-content h1, .ftue-modal-content h2');
    titles.forEach(t => {
      t.style.setProperty('color', palette.isLight ? '#0f172a' : '#fafafa', 'important');
    });

    const leads = document.querySelectorAll('.ftue-modal-content .ftue-lead, .ftue-modal-content .ftue-step-sub, .ftue-modal-content .ftue-desc');
    leads.forEach(l => {
      l.style.setProperty('color', palette.isLight ? '#475569' : '#a1a1aa', 'important');
    });

    const labels = document.querySelectorAll('.ftue-modal-content .ftue-label');
    labels.forEach(lbl => {
      lbl.style.setProperty('color', palette.isLight ? '#1e293b' : '#e4e4e7', 'important');
    });

    // Inputs & Textareas
    const inputs = document.querySelectorAll('.ftue-modal-content .ftue-input, .ftue-modal-content .ftue-textarea-2lines');
    inputs.forEach(inp => {
      if (palette.isLight) {
        inp.style.setProperty('background-color', '#ffffff', 'important');
        inp.style.setProperty('color', '#0f172a', 'important');
        inp.style.setProperty('border-color', 'rgba(0, 0, 0, 0.18)', 'important');
      } else {
        inp.style.setProperty('background-color', '#0e0e10', 'important');
        inp.style.setProperty('color', '#ffffff', 'important');
        inp.style.setProperty('border-color', 'rgba(255, 255, 255, 0.12)', 'important');
      }
    });

    // Logo Dropzones (Screen 2 & Settings - matches editor background)
    const allLogoDropzones = document.querySelectorAll('.ftue-logo-dropzone');
    allLogoDropzones.forEach(logoDropzone => {
      if (!logoDropzone.classList.contains('drag-valid') && !logoDropzone.classList.contains('drag-invalid')) {
        logoDropzone.style.setProperty('background-color', logoBg, 'important');
        logoDropzone.style.setProperty('border-color', palette.isLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.12)', 'important');
      }
    });

    const allLogoStages = document.querySelectorAll('.ftue-logo-stage');
    allLogoStages.forEach(logoStage => {
      logoStage.style.setProperty('background-color', logoBg, 'important');
      logoStage.style.setProperty('border-color', palette.isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)', 'important');
    });

    const allLogoDimsBadges = document.querySelectorAll('.ftue-logo-dims-badge');
    allLogoDimsBadges.forEach(logoDimsBadge => {
      if (palette.isLight) {
        logoDimsBadge.style.setProperty('background-color', 'rgba(0, 0, 0, 0.06)', 'important');
        logoDimsBadge.style.setProperty('color', '#52525b', 'important');
      } else {
        logoDimsBadge.style.setProperty('background-color', 'rgba(255, 255, 255, 0.08)', 'important');
        logoDimsBadge.style.setProperty('color', '#a1a1aa', 'important');
      }
    });

    const uploadStrong = document.querySelectorAll('.ftue-upload-text strong');
    uploadStrong.forEach(s => {
      s.style.setProperty('color', palette.c10, 'important');
    });

    // Timezone Sections
    const tzManualBox = document.getElementById('ftue-tz-manual-box');
    if (tzManualBox) {
      if (palette.isLight) {
        tzManualBox.style.setProperty('background-color', '#ffffff', 'important');
        tzManualBox.style.setProperty('border-color', 'rgba(0, 0, 0, 0.15)', 'important');
      } else {
        tzManualBox.style.setProperty('background-color', `${palette.c10}10`, 'important');
        tzManualBox.style.setProperty('border-color', `${palette.c10}44`, 'important');
      }
    }

    const tzManualTitle = document.querySelector('.ftue-tz-manual-title');
    if (tzManualTitle) {
      tzManualTitle.style.setProperty('color', palette.c10, 'important');
    }

    const tzManualIcon = document.querySelector('.ftue-tz-manual-icon svg');
    if (tzManualIcon) {
      tzManualIcon.style.setProperty('stroke', palette.c10, 'important');
    }

    const tzSelect = document.getElementById('ftue-tz-select-main');
    if (tzSelect) {
      if (palette.isLight) {
        tzSelect.style.setProperty('background-color', '#ffffff', 'important');
        tzSelect.style.setProperty('color', '#0f172a', 'important');
        tzSelect.style.setProperty('border-color', 'rgba(0, 0, 0, 0.18)', 'important');
      } else {
        tzSelect.style.setProperty('background-color', '#0e0e10', 'important');
        tzSelect.style.setProperty('color', '#ffffff', 'important');
        tzSelect.style.setProperty('border-color', `${palette.c10}55`, 'important');
      }
    }

    // Settings Groups (Screen 3)
    const groups = document.querySelectorAll('.ftue-settings-group');
    groups.forEach(g => {
      g.style.setProperty('background-color', palette.c30, 'important');
      g.style.setProperty('border-color', palette.isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)', 'important');
    });

    // Group Titles
    const groupTitles = document.querySelectorAll('.ftue-settings-group-title');
    groupTitles.forEach(t => {
      t.style.setProperty('color', palette.c10, 'important');
    });

    // Primary Action Buttons
    const jumpBtn = document.getElementById('ftue-btn-jump-in');
    if (jumpBtn) {
      jumpBtn.style.setProperty('background', palette.c10, 'important');
      jumpBtn.style.setProperty('border-color', palette.c10, 'important');
      jumpBtn.style.setProperty('color', btnTextColor, 'important');
      jumpBtn.style.setProperty('box-shadow', `0 4px 16px ${palette.c10}55`, 'important');
    }

    // Import Screen Elements (Screen 4)
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    if (zipDropzone) {
      if (palette.isLight) {
        zipDropzone.style.setProperty('background-color', '#ffffff', 'important');
        zipDropzone.style.setProperty('border-color', 'rgba(0, 0, 0, 0.16)', 'important');
      } else {
        zipDropzone.style.setProperty('background-color', 'rgba(59, 130, 246, 0.04)', 'important');
        zipDropzone.style.setProperty('border-color', 'rgba(59, 130, 246, 0.35)', 'important');
      }
    }

    const inspectCard = document.querySelector('.ftue-inspection-meta-card');
    if (inspectCard) {
      if (palette.isLight) {
        inspectCard.style.setProperty('background-color', '#ffffff', 'important');
        inspectCard.style.setProperty('border-color', 'rgba(0, 0, 0, 0.12)', 'important');
      } else {
        inspectCard.style.setProperty('background-color', palette.c30, 'important');
        inspectCard.style.setProperty('border-color', 'rgba(255, 255, 255, 0.1)', 'important');
      }
    }

    const directImportBtn = document.getElementById('ftue-btn-direct-import');
    if (directImportBtn) {
      directImportBtn.style.setProperty('background', palette.c10, 'important');
      directImportBtn.style.setProperty('border-color', palette.c10, 'important');
      directImportBtn.style.setProperty('color', btnTextColor, 'important');
    }

    const translateImportBtn = document.getElementById('ftue-btn-translate-import');
    if (translateImportBtn) {
      translateImportBtn.style.setProperty('background', palette.c10, 'important');
      translateImportBtn.style.setProperty('border-color', palette.c10, 'important');
      translateImportBtn.style.setProperty('color', btnTextColor, 'important');
    }

    // Secondary Buttons (Back, Choose Another Archive)
    const secondaryBtns = document.querySelectorAll('.ftue-actions-bar .btn-secondary, .btn-ftue-back, #ftue-btn-choose-diff-zip');
    secondaryBtns.forEach(btn => {
      if (palette.isLight) {
        btn.style.setProperty('background', '#ffffff', 'important');
        btn.style.setProperty('color', '#1e293b', 'important');
        btn.style.setProperty('border', '1px solid rgba(0, 0, 0, 0.18)', 'important');
      } else {
        btn.style.setProperty('background', 'rgba(255, 255, 255, 0.08)', 'important');
        btn.style.setProperty('color', '#ffffff', 'important');
        btn.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.14)', 'important');
      }
    });

    // Action Bars
    const actionBars = document.querySelectorAll('.ftue-actions-bar');
    actionBars.forEach(bar => {
      bar.style.borderTopColor = palette.isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)';
    });

    // Swatches active indicators and background
    const swatches = document.querySelectorAll('.ftue-theme-swatch');
    swatches.forEach(s => {
      const swId = s.getAttribute('data-theme-id');
      const isCurrent = (swId === palette.id) || (THEME_PALETTES[swId] && THEME_PALETTES[swId].id === palette.id);
      s.classList.toggle('active', isCurrent);
      if (isCurrent) {
        s.style.setProperty('border-color', palette.c10, 'important');
        s.style.setProperty('box-shadow', `0 0 0 2px ${palette.c10}44, 0 4px 12px ${palette.c10}33`, 'important');
      } else {
        s.style.setProperty('border-color', palette.isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.1)', 'important');
        s.style.setProperty('box-shadow', 'none', 'important');
      }
      if (palette.isLight) {
        s.style.setProperty('background-color', '#ffffff', 'important');
      } else {
        s.style.setProperty('background-color', '#141416', 'important');
      }
    });

    if (typeof window.syncDesignerThemeSwatches === 'function') {
      window.syncDesignerThemeSwatches(palette.id);
    }

    // Theme Mode buttons (Dark / Light) active state
    const modeBtns = document.querySelectorAll('.theme-mode-btn');
    modeBtns.forEach(btn => {
      const mode = btn.getAttribute('data-mode');
      const isModeActive = (mode === 'light' && palette.isLight) || (mode === 'dark' && !palette.isLight);
      btn.classList.toggle('active', isModeActive);
      if (isModeActive) {
        btn.style.setProperty('background', palette.c10, 'important');
        btn.style.setProperty('color', palette.btnTextColor || '#000000', 'important');
      } else {
        btn.style.removeProperty('background');
        btn.style.removeProperty('color');
      }
    });

    // Single-row accent grids visibility (Dark vs Light)
    const darkAccents = document.querySelectorAll('.ftue-swatches-dark');
    const lightAccents = document.querySelectorAll('.ftue-swatches-light');
    darkAccents.forEach(el => {
      el.style.display = palette.isLight ? 'none' : 'grid';
    });
    lightAccents.forEach(el => {
      el.style.display = palette.isLight ? 'grid' : 'none';
    });

    // Live Dashboard Chunk and Pipeline Column adaptation
    const dashChunks = document.querySelectorAll('.quick-notes-chunk, .pipeline-column');
    dashChunks.forEach(el => {
      el.style.setProperty('background', palette.c30, 'important');
      el.style.setProperty('border-color', palette.isLight ? 'rgba(0, 0, 0, 0.08)' : (palette.border || 'rgba(255, 255, 255, 0.06)'), 'important');
    });

    const dashChunkHeaders = document.querySelectorAll('.quick-notes-chunk-header, .pipeline-col-header');
    dashChunkHeaders.forEach(el => {
      el.style.setProperty('background', palette.isLight ? 'rgba(0, 0, 0, 0.035)' : 'rgba(0, 0, 0, 0.15)', 'important');
      el.style.setProperty('border-bottom-color', palette.isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.06)', 'important');
    });

    // Live Notes Chronological Archive granularity pill adaptation
    const activeGranBtns = document.querySelectorAll('.notes-archive-granularity-btn.is-active');
    activeGranBtns.forEach(btn => {
      btn.style.setProperty('background', palette.c10, 'important');
      btn.style.setProperty('color', btnTextColor, 'important');
    });

    // Live broadcast to preview frame if open
    try {
      const previewIframe = document.getElementById('preview-site-frame');
      if (previewIframe && previewIframe.contentWindow) {
        previewIframe.contentWindow.postMessage({
          type: 'CEDAR_THEME_CHANGED',
          themeId: palette.id
        }, '*');
      }
    } catch (e) {}
  }

  // Apply theme immediately on script evaluation
  try {
    applyLiveTheme(activeSelectedTheme);
  } catch (e) {}

  function syncBioPlaceholder() {
    const bioInput = document.getElementById("ftue-site-bio");
    if (bioInput) bioInput.placeholder = "";
  }

  function populateMainTimezoneSelect() {
    const selectEl = document.getElementById('ftue-tz-select-main');
    if (!selectEl) return;

    const sortedList = getSortedTimezoneList();
    const activeZone = detectedTimezone || 'America/Chicago';

    // If activeZone is not in the curated list, insert it at its properly sorted offset
    const exists = sortedList.some(item => item.zone === activeZone);
    if (!exists && activeZone) {
      const customInfo = getTimezoneOffsetInfo(activeZone);
      sortedList.push({
        zone: activeZone,
        cityName: activeZone,
        offsetMinutes: customInfo.offsetMinutes,
        formattedOffset: customInfo.formattedOffset,
        displayLabel: `${customInfo.formattedOffset} ${activeZone}`
      });
      sortedList.sort((a, b) => {
        if (a.offsetMinutes !== b.offsetMinutes) return a.offsetMinutes - b.offsetMinutes;
        return a.cityName.localeCompare(b.cityName);
      });
    }

    selectEl.innerHTML = sortedList.map(item =>
      `<option value="${item.zone}" ${item.zone === activeZone ? 'selected' : ''}>${item.displayLabel}</option>`
    ).join('');

    selectEl.value = activeZone;

    selectEl.onchange = () => {
      detectedTimezone = selectEl.value;
      updateManualClock();
    };
  }

  // =========================================================================
  // BROWSER CAPABILITY & DIRECTORY FILE WRITER HELPERS
  // =========================================================================
  let selectedParentDirectoryHandle = null;

  function isFsaSupported() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  }

  async function pickDirectorySafe() {
    try {
      return await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      return await window.showDirectoryPicker({
        mode: 'readwrite'
      });
    }
  }

  function updateFolderPreview() {
    const titleInput = document.getElementById('ftue-site-title');
    const previewEl = document.getElementById('ftue-preview-folder-name');
    const locationInput = document.getElementById('ftue-folder-location-input');
    const badgeEl = document.getElementById('ftue-folder-target-badge');

    const val = titleInput ? titleInput.value.trim() : '';
    const safe = val.replace(/[/\\?%*:|"<>]/g, '').trim() || '[Title]';
    const folderName = `${safe} - a Cedar blog`;

    if (selectedParentDirectoryHandle) {
      if (locationInput) {
        locationInput.value = `${selectedParentDirectoryHandle.name}/${folderName}`;
        locationInput.title = `Blog workspace destination: ${selectedParentDirectoryHandle.name}/${folderName}`;
        locationInput.classList.remove('ftue-input-error');
      }
      if (badgeEl) {
        badgeEl.classList.add('is-selected');
        badgeEl.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Cedar will create: <strong id="ftue-preview-folder-name" style="color: inherit;">${folderName}</strong> inside <strong>${selectedParentDirectoryHandle.name}</strong></span>
        `;
      }
    } else {
      if (locationInput) {
        locationInput.value = '';
        locationInput.placeholder = 'Select a folder on your computer...';
        locationInput.title = 'Blog workspace destination';
      }
      if (badgeEl) {
        badgeEl.classList.remove('is-selected');
        badgeEl.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span>Cedar will create: <strong id="ftue-preview-folder-name" style="color: #ffffff;">${folderName}</strong> in chosen folder</span>
        `;
      }
    }
  }

  async function promptSelectParentDirectory() {
    if (!isFsaSupported()) {
      showScreen('unsupported', true);
      return null;
    }
    const folderErr = document.getElementById('ftue-folder-error');
    const locationInput = document.getElementById('ftue-folder-location-input');
    try {
      const handle = await pickDirectorySafe();
      if (handle) {
        selectedParentDirectoryHandle = handle;
        if (folderErr) folderErr.style.display = 'none';
        if (locationInput) locationInput.classList.remove('ftue-input-error');
        updateFolderPreview();
        return handle;
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn('[FTUE] Folder browse warning:', err);
      if (folderErr) {
        folderErr.textContent = `Could not access folder: ${err.message}`;
        folderErr.style.display = 'block';
      }
    }
    return null;
  }

  async function writeFilesToDirectoryHandle(rootHandle, files) {
    for (const file of files) {
      if (!file || !file.name) continue;
      const cleanPath = file.name.replace(/\\/g, '/');
      const parts = cleanPath.split('/').filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) continue;

      let currentDir = rootHandle;
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: true });
      }

      const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      if (typeof file.data === 'string') {
        if (file.data.startsWith('data:')) {
          const blob = dataUrlToBlob(file.data);
          if (blob) {
            await writable.write(blob);
          } else {
            await writable.write(file.data);
          }
        } else {
          await writable.write(file.data);
        }
      } else if (file.data instanceof Uint8Array || file.data instanceof ArrayBuffer) {
        await writable.write(file.data);
      } else if (file.data instanceof Blob) {
        await writable.write(file.data);
      } else {
        await writable.write(JSON.stringify(file.data, null, 2));
      }
      await writable.close();
    }
  }

  // =========================================================================
  // SCREEN TRANSITIONS & URL HASH ROUTING
  // =========================================================================
  const SCREEN_HASH_MAP = {
    choice: 'welcome',
    new: 'configs',
    import: 'import',
    unsupported: 'unsupported'
  };

  const HASH_SCREEN_MAP = {
    welcome: 'choice',
    configs: 'new',
    moreconfigs: 'new',
    import: 'import',
    new: 'new',
    moresettings: 'new',
    unsupported: 'unsupported'
  };

  function showScreen(screenId, updateHistory = true) {
    if (!isFsaSupported() && screenId !== 'unsupported') {
      screenId = 'unsupported';
    }

    const screens = ['choice', 'new', 'import', 'unsupported'];
    screens.forEach(s => {
      const el = document.getElementById(`ftue-screen-${s}`);
      if (el) el.style.display = (s === screenId) ? 'block' : 'none';
    });

    const btnClose = document.getElementById('ftue-btn-close');
    if (screenId === 'unsupported' && btnClose) {
      btnClose.style.display = 'none';
    }

    if (screenId === 'new') {
      detectSystemTimezone();
      syncBioPlaceholder();
      updateFolderPreview();
      const uploadSub = document.querySelector('#ftue-logo-dropzone .ftue-upload-sub');
      if (uploadSub) uploadSub.textContent = 'Supports images up to 1200x1200';
      const tzSub = document.querySelector('#ftue-tz-manual-box .ftue-tz-manual-sub');
      if (tzSub) tzSub.remove();
      ['ftue-site-title', 'ftue-site-author', 'ftue-site-bio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.placeholder = '';
      });
      const badge = document.getElementById('ftue-folder-target-badge');
      if (badge) badge.style.display = 'flex';
      const folderErr = document.getElementById('ftue-folder-error');
      if (folderErr) folderErr.style.display = 'none';
      const locationInput = document.getElementById('ftue-folder-location-input');
      if (locationInput) locationInput.classList.remove('ftue-input-error');
    }

    // Unconditionally re-apply live theme to refresh all newly visible screen elements
    applyLiveTheme(activeSelectedTheme);

    if (updateHistory) {
      const targetHash = '#' + (SCREEN_HASH_MAP[screenId] || 'welcome');
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }

    const modalEl = document.getElementById('modal-ftue');
    if (modalEl) modalEl.scrollTop = 0;
    const scrollContainer = modalEl ? modalEl.querySelector('.ftue-modal-content') : null;
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }

  function handleHashRoute(cleanHash) {
    const modalEl = document.getElementById('modal-ftue');
    const targetScreen = HASH_SCREEN_MAP[cleanHash] || (cleanHash === '' ? 'choice' : null);
    if (targetScreen) {
      if (!modalEl || modalEl.style.display === 'none') {
        openFTUE();
      } else {
        showScreen(targetScreen, false);
      }
    }
  }

  // =========================================================================
  // ZIP EXTRACTION HELPER
  // =========================================================================
  async function parseZip(arrayBuffer) {
    if (window.SheeshVault && typeof window.SheeshVault.parseZipArchive === 'function') {
      return await window.SheeshVault.parseZipArchive(arrayBuffer);
    }

    // Fallback ZIP extractor for uncompressed / deflate-raw
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('utf-8');
    const files = [];

    let eocdOffset = -1;
    for (let i = arrayBuffer.byteLength - 22; i >= Math.max(0, arrayBuffer.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Not a valid ZIP file: End of Central Directory signature not found.');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    let offset = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;

      const method = view.getUint16(offset + 10, true);
      const compSize = view.getUint32(offset + 20, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const nameBytes = uint8.subarray(offset + 46, offset + 46 + nameLen);
      const fileName = textDecoder.decode(nameBytes);

      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      const rawData = uint8.subarray(dataOffset, dataOffset + compSize);
      let decompressedData;

      if (method === 0) {
        decompressedData = rawData;
      } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(rawData);
        writer.close();
        const response = new Response(ds.readable);
        const ab = await response.arrayBuffer();
        decompressedData = new Uint8Array(ab);
      } else {
        decompressedData = rawData;
      }

      if (!fileName.endsWith('/')) {
        files.push({
          name: fileName,
          data: decompressedData,
          size: decompressedData.byteLength
        });
      }

      offset += 46 + nameLen + extraLen + commentLen;
    }

    return files;
  }

  // =========================================================================
  // FOLDER FILE EXTRACTION HELPERS
  // =========================================================================
  async function extractFilesFromDirectoryHandle(dirHandle, pathPrefix = '') {
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.') && name !== '.cfignore') continue;
      if (name === 'node_modules') continue;
      const currentPath = pathPrefix ? `${pathPrefix}/${name}` : name;
      if (handle.kind === 'file') {
        try {
          const file = await handle.getFile();
          const arrayBuf = await file.arrayBuffer();
          files.push({
            name: currentPath,
            data: new Uint8Array(arrayBuf),
            size: file.size
          });
        } catch (e) {
          console.warn(`[FTUE] Could not read file ${currentPath}:`, e);
        }
      } else if (handle.kind === 'directory') {
        const subFiles = await extractFilesFromDirectoryHandle(handle, currentPath);
        files.push(...subFiles);
      }
    }
    return files;
  }

  async function readFilesFromDirectoryEntry(entry, pathPrefix = '') {
    const files = [];
    if (entry.isFile) {
      try {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        const arrayBuf = await file.arrayBuffer();
        const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        files.push({
          name: currentPath,
          data: new Uint8Array(arrayBuf),
          size: file.size
        });
      } catch (e) {
        console.warn(`[FTUE] Could not read file entry ${entry.name}:`, e);
      }
    } else if (entry.isDirectory) {
      if (entry.name.startsWith('.') && entry.name !== '.cfignore') return files;
      if (entry.name === 'node_modules') return files;
      const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : (pathPrefix || '');
      const dirReader = entry.createReader();
      const readEntriesBatch = () => new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
      let batch;
      do {
        batch = await readEntriesBatch();
        for (const childEntry of batch) {
          const subFiles = await readFilesFromDirectoryEntry(childEntry, currentPath ? `${currentPath}/${childEntry.name}` : childEntry.name);
          files.push(...subFiles);
        }
      } while (batch && batch.length > 0);
    }
    return files;
  }

  // =========================================================================
  // BRANDING IMAGE RESIZING & ASSET MANAGEMENT
  // =========================================================================
  function generateResizedCanvasImage(img, maxW, maxH, forceSquarePadding = false) {
    const canvas = document.createElement('canvas');
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;

    if (forceSquarePadding) {
      canvas.width = maxW;
      canvas.height = maxH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, maxW, maxH);

      const scale = Math.min(maxW / nw, maxH / nh);
      const dw = Math.round(nw * scale);
      const dh = Math.round(nh * scale);
      const dx = Math.round((maxW - dw) / 2);
      const dy = Math.round((maxH - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      let dw = nw;
      let dh = nh;
      if (dw > maxW || dh > maxH) {
        const scale = Math.min(maxW / dw, maxH / dh);
        dw = Math.round(dw * scale);
        dh = Math.round(dh * scale);
      }
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, dw, dh);
      ctx.drawImage(img, 0, 0, dw, dh);
    }

    return canvas.toDataURL('image/png');
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    try {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.warn('[FTUE] Failed to convert dataUrl to blob', e);
      return null;
    }
  }

  async function writeBrandingAssetsToVault(assets) {
    if (!window.SheeshVault || !window.SheeshVault.isConnected() || !assets) return;
    for (const [path, dataUrl] of Object.entries(assets)) {
      try {
        const blob = dataUrlToBlob(dataUrl);
        if (blob) {
          await window.SheeshVault.writeFile(path, blob);
        }
      } catch (err) {
        console.warn(`[Vault] Could not write branding file ${path}:`, err);
      }
    }
  }

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.generateResizedCanvasImage = generateResizedCanvasImage;
  window.Outpost.generateResizedCanvasImage = generateResizedCanvasImage;
  window.Cedar.dataUrlToBlob = dataUrlToBlob;
  window.Outpost.dataUrlToBlob = dataUrlToBlob;
  window.Cedar.writeBrandingAssetsToVault = writeBrandingAssetsToVault;
  window.Outpost.writeBrandingAssetsToVault = writeBrandingAssetsToVault;

  // =========================================================================
  // CONTROLLER BINDINGS
  // =========================================================================
  let ftueInitialized = false;

  function initFTUE() {
    try {
      applyLiveTheme(activeSelectedTheme);
    } catch (e) {}
    const modalEl = document.getElementById('modal-ftue');
    if (!modalEl) return false;
    if (ftueInitialized) {
      const uploadSub = document.querySelector('#ftue-logo-dropzone .ftue-upload-sub');
      if (uploadSub) uploadSub.textContent = 'Supports images up to 1200x1200';
      const tzSub = document.querySelector('#ftue-tz-manual-box .ftue-tz-manual-sub');
      if (tzSub) tzSub.remove();
      return true;
    }
    ftueInitialized = true;
    const uploadSub = document.querySelector('#ftue-logo-dropzone .ftue-upload-sub');
    if (uploadSub) uploadSub.textContent = 'Supports images up to 1200x1200';
    const tzSub = document.querySelector('#ftue-tz-manual-box .ftue-tz-manual-sub');
    if (tzSub) tzSub.remove();
    ['ftue-site-title', 'ftue-site-author', 'ftue-site-bio'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.placeholder = '';
    });

    // Block deadzone clicks from dismissing the FTUE modal without shaking on text highlight
    let deadzoneMouseDown = false;
    modalEl.addEventListener('mousedown', (e) => {
      deadzoneMouseDown = (e.target === modalEl);
    });

    modalEl.addEventListener('click', (e) => {
      const isDeadzone = (e.target === modalEl) && deadzoneMouseDown;
      deadzoneMouseDown = false;

      // Never shake or block selection if user was highlighting text
      const hasSelection = Boolean(window.getSelection && window.getSelection().toString().trim().length > 0);
      if (hasSelection || !isDeadzone) {
        return;
      }

      e.stopPropagation();
      e.preventDefault();
    });

    // 1. Initial screen choice cards
    const cardNew = document.getElementById('ftue-card-new');
    if (cardNew) {
      cardNew.addEventListener('click', (e) => {
        e.stopPropagation();
        showScreen('new', true);
        detectSystemTimezone();
        const titleInput = document.getElementById('ftue-site-title');
        if (titleInput) setTimeout(() => titleInput.focus(), 100);
      });
      cardNew.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cardNew.click();
        }
      });
    }

    const cardImport = document.getElementById('ftue-card-import');
    if (cardImport) {
      cardImport.addEventListener('click', (e) => {
        e.stopPropagation();
        resetImportUI('folder');
        showScreen('import', true);
      });
      cardImport.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          resetImportUI('folder');
          showScreen('import', true);
        }
      });
    }

    // 2. Back buttons
    const backFromNew = document.getElementById('ftue-back-from-new');
    if (backFromNew) {
      backFromNew.addEventListener('click', (e) => {
        e.stopPropagation();
        showScreen('choice', true);
      });
    }

    const backFromImport = document.getElementById('ftue-back-from-import');
    if (backFromImport) {
      backFromImport.addEventListener('click', (e) => {
        e.stopPropagation();
        showScreen('choice', true);
        resetImportUI();
      });
    }

    // 3. Close button (if user already configured site)
    const btnClose = document.getElementById('ftue-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFTUE();
      });
    }

    // 4. Logo Dropzone in New Site Screen
    const logoDropzone = document.getElementById('ftue-logo-dropzone');
    const logoFileInput = document.getElementById('ftue-logo-file-input');
    const logoEmptyState = document.getElementById('ftue-logo-empty-state');
    const logoPreviewState = document.getElementById('ftue-logo-preview-state');
    const logoPreviewImg = document.getElementById('ftue-logo-preview-img');
    const logoFileName = document.getElementById('ftue-logo-file-name');
    const logoDimsBadge = document.getElementById('ftue-logo-dims-badge');
    const btnChangeLogo = document.getElementById('ftue-btn-change-logo');
    const btnRemoveLogo = document.getElementById('ftue-btn-remove-logo');

    let dragCounter = 0;
    let errorResetTimeout = null;

    function isImageDrag(e) {
      if (!e.dataTransfer) return false;
      const dt = e.dataTransfer;
      const types = Array.from(dt.types || []);

      // If types doesn't contain 'Files', it's text, HTML, or URL
      if (!types.includes('Files')) {
        return false;
      }

      // Check dt.items if available
      if (dt.items && dt.items.length > 0) {
        for (let i = 0; i < dt.items.length; i++) {
          const item = dt.items[i];
          if (item.kind && item.kind !== 'file') {
            return false;
          }
          if (item.type) {
            if (item.type.startsWith('image/')) {
              return true;
            } else {
              return false;
            }
          }
        }
      }

      // If 'Files' is present and no conflicting non-image items were found
      return true;
    }

    function showDragFeedback(isValid) {
      if (errorResetTimeout) {
        clearTimeout(errorResetTimeout);
        errorResetTimeout = null;
      }

      const overlay = document.getElementById('ftue-logo-drag-overlay');
      const iconEl = document.getElementById('ftue-drag-feedback-icon');
      const titleEl = document.getElementById('ftue-drag-feedback-title');
      const subEl = document.getElementById('ftue-drag-feedback-sub');
      if (!overlay || !iconEl || !titleEl || !subEl || !logoDropzone) return;

      overlay.style.display = 'flex';
      overlay.className = 'ftue-logo-drag-overlay ' + (isValid ? 'drag-valid' : 'drag-invalid');
      logoDropzone.classList.toggle('drag-valid', isValid);
      logoDropzone.classList.toggle('drag-invalid', !isValid);

      const palette = THEME_PALETTES[activeSelectedTheme] || THEME_PALETTES.basalt;

      if (isValid) {
        logoDropzone.style.setProperty('border-color', palette.isLight ? '#059669' : '#10b981', 'important');
        logoDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.12)', 'important');
        iconEl.innerHTML = `
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        titleEl.textContent = 'Okay to release';
        subEl.textContent = (logoPreviewState && logoPreviewState.style.display !== 'none')
          ? 'Drop to replace current logo'
          : 'Drop to set brand logo';
      } else {
        logoDropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
        logoDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');
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

    function hideDragFeedback() {
      const overlay = document.getElementById('ftue-logo-drag-overlay');
      if (overlay) overlay.style.display = 'none';
      if (logoDropzone) {
        logoDropzone.classList.remove('drag-valid', 'drag-invalid', 'dragover', 'ftue-shake');
        const palette = THEME_PALETTES[activeSelectedTheme] || THEME_PALETTES.basalt;
        if (palette.isLight) {
          logoDropzone.style.setProperty('background-color', '#ffffff', 'important');
          logoDropzone.style.setProperty('border-color', 'rgba(0, 0, 0, 0.16)', 'important');
        } else {
          logoDropzone.style.setProperty('background-color', palette.c30, 'important');
          logoDropzone.style.setProperty('border-color', 'rgba(255, 255, 255, 0.12)', 'important');
        }
      }
    }

    function showDropzoneError(message) {
      if (errorResetTimeout) clearTimeout(errorResetTimeout);

      const overlay = document.getElementById('ftue-logo-drag-overlay');
      const iconEl = document.getElementById('ftue-drag-feedback-icon');
      const titleEl = document.getElementById('ftue-drag-feedback-title');
      const subEl = document.getElementById('ftue-drag-feedback-sub');
      if (!overlay || !iconEl || !titleEl || !subEl || !logoDropzone) return;

      overlay.style.display = 'flex';
      overlay.className = 'ftue-logo-drag-overlay drag-invalid';
      logoDropzone.classList.remove('drag-valid');
      logoDropzone.classList.add('drag-invalid');

      const palette = THEME_PALETTES[activeSelectedTheme] || THEME_PALETTES.basalt;
      logoDropzone.style.setProperty('border-color', palette.isLight ? '#dc2626' : '#ef4444', 'important');
      logoDropzone.style.setProperty('background-color', palette.isLight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)', 'important');

      logoDropzone.classList.remove('ftue-shake');
      void logoDropzone.offsetWidth; // force reflow
      logoDropzone.classList.add('ftue-shake');

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

      errorResetTimeout = setTimeout(() => {
        hideDragFeedback();
        errorResetTimeout = null;
      }, 2500);
    }

    if (logoDropzone && logoFileInput) {
      logoDropzone.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.ftue-logo-preview-meta')) return;
        if (logoPreviewState && logoPreviewState.style.display !== 'none' && !e.target.closest('.ftue-logo-stage')) {
          return;
        }
        if (errorResetTimeout) {
          clearTimeout(errorResetTimeout);
          errorResetTimeout = null;
          hideDragFeedback();
        }
        logoFileInput.click();
      });

      logoDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        const isValid = isImageDrag(e);
        showDragFeedback(isValid);
      });

      logoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        const isValid = isImageDrag(e);
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = isValid ? 'copy' : 'none';
        }
        showDragFeedback(isValid);
      });

      logoDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          hideDragFeedback();
        }
      });

      logoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        hideDragFeedback();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleLogoFile(e.dataTransfer.files[0]);
        } else {
          showDropzoneError("Won't work — Please drop an image file (PNG, JPG, SVG, WebP)");
        }
      });

      logoFileInput.addEventListener('change', () => {
        if (logoFileInput.files && logoFileInput.files[0]) {
          handleLogoFile(logoFileInput.files[0]);
        }
      });
    }

    if (btnChangeLogo && logoFileInput) {
      btnChangeLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (errorResetTimeout) {
          clearTimeout(errorResetTimeout);
          errorResetTimeout = null;
          hideDragFeedback();
        }
        logoFileInput.click();
      });
    }

    function handleLogoFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        showDropzoneError("Won't work — Only image files (PNG, JPG, SVG, WebP) are supported");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawDataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          const naturalW = img.naturalWidth || 1;
          const naturalH = img.naturalHeight || 1;

          // Proportional preview scaling relative to 1200x1200 max allowance:
          // 900px wide occupies 75% of container width; 1200x1200 fills 100% and becomes true square
          const scalePct = Math.min(100, Math.max(10, Math.round((naturalW / 1200) * 100)));

          if (logoPreviewImg) {
            logoPreviewImg.src = rawDataUrl;
            logoPreviewImg.style.width = 'auto';
            logoPreviewImg.style.maxWidth = `${scalePct}%`;
          }
          if (logoFileName) {
            logoFileName.textContent = file.name;
          }
          if (logoDimsBadge) {
            logoDimsBadge.textContent = `${naturalW} × ${naturalH}px (${scalePct}% width)`;
          }
          if (logoEmptyState) logoEmptyState.style.display = 'none';
          if (logoPreviewState) logoPreviewState.style.display = 'flex';

          // Generate smaller versions in dedicated branding structure:
          // 1. Masthead logo: max 256px, aspect ratio preserved
          const mastheadDataUrl = generateResizedCanvasImage(img, 256, 256, false);
          // 2. Browser tab / Favicon icon: 64x64 square (centered with padding if non-square)
          const iconDataUrl = generateResizedCanvasImage(img, 64, 64, true);
          // 3. Master original (up to 1200px max allowance, always re-encoded via canvas to strip EXIF)
          const originalDataUrl = generateResizedCanvasImage(img, 1200, 1200, false);

          uploadedBrandingAssets = {
            'media/branding/logo.png': mastheadDataUrl,
            'media/branding/icon.png': iconDataUrl,
            'media/branding/logo-original.png': originalDataUrl
          };

          uploadedLogoDataUrl = mastheadDataUrl;
          window.brandingFiles = uploadedBrandingAssets;

          try {
            localStorage.setItem('cedar_branding_files_v1', JSON.stringify(uploadedBrandingAssets));
          } catch (e) {
            console.warn('[FTUE] Could not store branding files:', e);
          }

          if (window.SheeshVault && window.SheeshVault.isConnected()) {
            writeBrandingAssetsToVault(uploadedBrandingAssets);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }

    if (btnRemoveLogo) {
      btnRemoveLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        hideDragFeedback();
        uploadedLogoDataUrl = '';
        uploadedBrandingAssets = null;
        window.brandingFiles = null;
        if (logoFileInput) logoFileInput.value = '';
        if (logoPreviewImg) {
          logoPreviewImg.src = '';
          logoPreviewImg.style.width = '';
          logoPreviewImg.style.maxWidth = '';
        }
        if (logoDimsBadge) logoDimsBadge.textContent = '--';
        if (logoPreviewState) logoPreviewState.style.display = 'none';
        if (logoEmptyState) logoEmptyState.style.display = 'flex';
        try {
          localStorage.removeItem('cedar_branding_files_v1');
    try { localStorage.removeItem('outpost_branding_files_v1'); } catch (e) {}
        } catch (e) {}
      });
    }

    // 5. Title input validation error auto-clearing & dynamic bio placeholder
    const titleInput = document.getElementById('ftue-site-title');
    const titleError = document.getElementById('ftue-title-error');
    const authorInput = document.getElementById('ftue-site-author');

    if (titleInput) {
      titleInput.addEventListener('input', () => {
        if (titleInput.value.trim().length > 0) {
          if (titleError) titleError.style.display = 'none';
          titleInput.classList.remove('ftue-input-error');
        }
        const folderErr = document.getElementById('ftue-folder-error');
        if (folderErr) folderErr.style.display = 'none';
        updateFolderPreview();
        syncBioPlaceholder();
      });
    }

    const authorError = document.getElementById('ftue-author-error');
    if (authorInput) {
      authorInput.addEventListener('input', () => {
        if (authorInput.value.trim().length > 0) {
          if (authorError) authorError.style.display = 'none';
          authorInput.classList.remove('ftue-input-error');
        }
        const folderErr = document.getElementById('ftue-folder-error');
        if (folderErr) folderErr.style.display = 'none';
        syncBioPlaceholder();
      });
    }

    // 5b. Blog Folder Location Browse & Input Click Handlers
    const btnBrowseFolder = document.getElementById('ftue-btn-browse-folder');
    if (btnBrowseFolder) {
      btnBrowseFolder.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await promptSelectParentDirectory();
      });
    }

    const folderLocationInput = document.getElementById('ftue-folder-location-input');
    if (folderLocationInput) {
      folderLocationInput.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await promptSelectParentDirectory();
      });
    }

    // Copy link on unsupported browser screen
    const btnCopyLink = document.getElementById('ftue-btn-copy-link');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', async () => {
        try {
          const targetUrl = window.location.origin + window.location.pathname;
          await navigator.clipboard.writeText(targetUrl);
          const span = btnCopyLink.querySelector('span');
          if (span) {
            const prev = span.textContent;
            span.textContent = 'Link Copied!';
            setTimeout(() => { span.textContent = prev; }, 2000);
          }
        } catch (err) {
          console.warn('[FTUE] Copy link notice:', err);
        }
      });
    }

    // 6. Save & Launch Action ("Ready, Set, GO!")
    const btnJumpIn = document.getElementById('ftue-btn-jump-in');
    if (btnJumpIn) {
      btnJumpIn.addEventListener('click', async () => {
        await createAndLaunchSite(false);
      });
    }

    // 8. Theme Swatches Selection & Mode Toggle
    const ftueModeBtns = document.querySelectorAll('#ftue-theme-mode-control .theme-mode-btn');
    ftueModeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetMode = btn.getAttribute('data-mode');
        const currentPalette = THEME_PALETTES[activeSelectedTheme] || THEME_PALETTES.basalt;
        if (targetMode === 'light' && !currentPalette.isLight) {
          const nextTheme = THEME_MODE_MAP[currentPalette.id] || 'canvas';
          applyLiveTheme(nextTheme);
        } else if (targetMode === 'dark' && currentPalette.isLight) {
          const nextTheme = THEME_MODE_MAP[currentPalette.id] || 'basalt';
          applyLiveTheme(nextTheme);
        }
      });
    });

    modalEl.addEventListener('click', (e) => {
      const swatch = e.target.closest('.ftue-theme-swatch');
      if (swatch) {
        e.stopPropagation();
        const themeId = swatch.getAttribute('data-theme-id');
        if (themeId) {
          applyLiveTheme(themeId);
        }
      }
    });

    // 9. Hash listener inside initFTUE for browser Back / Forward history
    window.addEventListener('hashchange', () => {
      const modal = document.getElementById('modal-ftue');
      if (modal && modal.style.display !== 'none') {
        const raw = window.location.hash || '';
        let clean = raw.trim();
        if (clean.startsWith('#/')) clean = clean.slice(2);
        else if (clean.startsWith('#')) clean = clean.slice(1);
        clean = clean.split('?')[0];
        handleHashRoute(clean);
      }
    });

    // 8. Import Mode Segmented Tabs & Dropzones
    const tabImportZip = document.getElementById('ftue-tab-import-zip');
    const tabImportFolder = document.getElementById('ftue-tab-import-folder');
    if (tabImportZip) {
      tabImportZip.addEventListener('click', (e) => {
        e.stopPropagation();
        switchImportTab('zip');
      });
    }
    if (tabImportFolder) {
      tabImportFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        switchImportTab('folder');
      });
    }

    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const zipFileInput = document.getElementById('ftue-zip-file-input');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');
    const folderFileInput = document.getElementById('ftue-folder-file-input');

    if (zipDropzone && zipFileInput) {
      zipDropzone.addEventListener('click', () => {
        zipFileInput.click();
      });
      zipFileInput.addEventListener('change', () => {
        if (zipFileInput.files && zipFileInput.files[0]) {
          processArchiveFile(zipFileInput.files[0]);
        }
      });
    }

    if (folderDropzone) {
      folderDropzone.addEventListener('click', async () => {
        if (!isFsaSupported()) {
          showScreen('unsupported', true);
          return;
        }
        try {
          const handle = await pickDirectorySafe();
          if (handle) {
            await processDirectoryHandle(handle);
          }
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('[FTUE] showDirectoryPicker cancelled or failed:', err);
        }
      });
    }

    if (folderFileInput) {
      folderFileInput.addEventListener('change', () => {
        if (folderFileInput.files && folderFileInput.files.length > 0) {
          processFolderFiles(Array.from(folderFileInput.files));
        }
      });
    }

    // Attach drag & drop handling to both dropzones
    [zipDropzone, folderDropzone].forEach(dz => {
      if (!dz) return;
      dz.addEventListener('dragover', (e) => {
        e.preventDefault();
        dz.classList.add('dragover');
      });
      dz.addEventListener('dragleave', () => {
        dz.classList.remove('dragover');
      });
      dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('dragover');

        // Check directory handle (Chromium)
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
          const item = e.dataTransfer.items[0];
          if (typeof item.getAsFileSystemHandle === 'function') {
            try {
              const handle = await item.getAsFileSystemHandle();
              if (handle) {
                if (handle.kind === 'directory') {
                  switchImportTab('folder');
                  await processDirectoryHandle(handle);
                  return;
                } else if (handle.kind === 'file') {
                  const file = await handle.getFile();
                  if (file.name.toLowerCase().endsWith('.zip')) {
                    switchImportTab('zip');
                    await processArchiveFile(file);
                    return;
                  }
                }
              }
            } catch (err) {
              console.warn('[FTUE] Drop getAsFileSystemHandle notice:', err);
            }
          }

          if (typeof item.webkitGetAsEntry === 'function') {
            try {
              const entry = item.webkitGetAsEntry();
              if (entry && entry.isDirectory) {
                switchImportTab('folder');
                const files = await readFilesFromDirectoryEntry(entry);
                await processExtractedFolderFiles(entry.name, files);
                return;
              }
            } catch (err) {
              console.warn('[FTUE] Drop webkitGetAsEntry notice:', err);
            }
          }
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const first = e.dataTransfer.files[0];
          if (first.name.toLowerCase().endsWith('.zip')) {
            switchImportTab('zip');
            await processArchiveFile(first);
          } else {
            switchImportTab('folder');
            await processFolderFiles(Array.from(e.dataTransfer.files));
          }
        }
      });
    });

    // 9. Import Screen Action Buttons
    const btnChooseDiffZip = document.getElementById('ftue-btn-choose-diff-zip');
    if (btnChooseDiffZip) {
      btnChooseDiffZip.addEventListener('click', () => {
        resetImportUI();
      });
    }

    const btnDirectImport = document.getElementById('ftue-btn-direct-import');
    if (btnDirectImport) {
      btnDirectImport.addEventListener('click', async () => {
        await executeImport(false);
      });
    }

    const btnTranslateImport = document.getElementById('ftue-btn-translate-import');
    if (btnTranslateImport) {
      btnTranslateImport.addEventListener('click', async () => {
        await executeImport(true);
      });
    }
  }

  // =========================================================================
  // NEW SITE CREATION & SAVING
  // =========================================================================
  async function createAndLaunchSite(isAdvanced) {
    const titleInput = document.getElementById('ftue-site-title');
    const titleError = document.getElementById('ftue-title-error');
    const siteTitle = titleInput ? titleInput.value.trim() : '';

    const authorInput = document.getElementById('ftue-site-author') || document.getElementById('ftue-input-author');
    const authorError = document.getElementById('ftue-author-error');
    const authorVal = authorInput ? authorInput.value.trim() : '';

    let hasValidationError = false;

    // Validate Title
    if (!siteTitle) {
      if (titleError) titleError.style.display = 'block';
      if (titleInput) titleInput.classList.add('ftue-input-error');
      hasValidationError = true;
    } else {
      if (titleError) titleError.style.display = 'none';
      if (titleInput) titleInput.classList.remove('ftue-input-error');
    }

    // Validate Author Name
    if (!authorVal) {
      if (authorError) authorError.style.display = 'block';
      if (authorInput) authorInput.classList.add('ftue-input-error');
      hasValidationError = true;
    } else {
      if (authorError) authorError.style.display = 'none';
      if (authorInput) authorInput.classList.remove('ftue-input-error');
    }

    // If either or both required fields are blank, display notices for all that are blank and focus first
    if (hasValidationError) {
      if (!siteTitle && titleInput) {
        titleInput.focus();
      } else if (!authorVal && authorInput) {
        authorInput.focus();
      }
      return;
    }

    // Ensure browser supports File System Access API
    if (!isFsaSupported()) {
      showScreen('unsupported', true);
      return;
    }

    const folderErr = document.getElementById('ftue-folder-error');
    const locationInput = document.getElementById('ftue-folder-location-input');
    if (folderErr) folderErr.style.display = 'none';
    if (locationInput) locationInput.classList.remove('ftue-input-error');

    const btnJumpIn = document.getElementById('ftue-btn-jump-in');
    const originalBtnHtml = btnJumpIn ? btnJumpIn.innerHTML : '';

    let parentHandle = selectedParentDirectoryHandle;

    if (!parentHandle) {
      if (btnJumpIn) {
        btnJumpIn.disabled = true;
        btnJumpIn.innerHTML = '<span>Selecting Folder...</span>';
      }

      try {
        parentHandle = await pickDirectorySafe();
        if (parentHandle) {
          selectedParentDirectoryHandle = parentHandle;
          updateFolderPreview();
        }
      } catch (err) {
        if (btnJumpIn) {
          btnJumpIn.disabled = false;
          btnJumpIn.innerHTML = originalBtnHtml;
        }
        if (err.name === 'AbortError') {
          if (folderErr) {
            folderErr.textContent = 'A folder location on your computer is required to save your blog workspace.';
            folderErr.style.display = 'block';
          }
          if (locationInput) locationInput.classList.add('ftue-input-error');
          return;
        }
        console.error('[FTUE] Directory selection error:', err);
        if (folderErr) {
          folderErr.textContent = `Could not access selected directory: ${err.message}`;
          folderErr.style.display = 'block';
        }
        if (locationInput) locationInput.classList.add('ftue-input-error');
        return;
      }
    }

    if (btnJumpIn) {
      btnJumpIn.disabled = true;
      btnJumpIn.innerHTML = '<span>Creating Blog Folder...</span>';
    }

    // Verify permission on chosen parent directory if supported
    if (parentHandle && typeof parentHandle.queryPermission === 'function') {
      try {
        const status = await parentHandle.queryPermission({ mode: 'readwrite' });
        if (status !== 'granted' && typeof parentHandle.requestPermission === 'function') {
          const reqStatus = await parentHandle.requestPermission({ mode: 'readwrite' });
          if (reqStatus !== 'granted') {
            if (btnJumpIn) {
              btnJumpIn.disabled = false;
              btnJumpIn.innerHTML = originalBtnHtml;
            }
            if (folderErr) {
              folderErr.textContent = 'Write permission to the selected folder was denied.';
              folderErr.style.display = 'block';
            }
            return;
          }
        }
      } catch (permErr) {
        console.warn('[FTUE] Permission verification warning:', permErr);
      }
    }

    // Subfolder naming: safe title + ' - a Cedar blog'
    const safeTitle = siteTitle.replace(/[/\\?%*:|"<>]/g, '').trim() || 'My Blog';
    const folderName = `${safeTitle} - a Cedar blog`;

    let blogDirHandle;
    try {
      blogDirHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
    } catch (createErr) {
      if (btnJumpIn) {
        btnJumpIn.disabled = false;
        btnJumpIn.innerHTML = originalBtnHtml;
      }
      if (folderErr) {
        folderErr.textContent = `Could not create folder "${folderName}": ${createErr.message}`;
        folderErr.style.display = 'block';
      }
      if (locationInput) locationInput.classList.add('ftue-input-error');
      return;
    }

    if (locationInput) {
      locationInput.value = `${parentHandle.name}/${folderName}`;
      locationInput.title = `Blog workspace destination: ${parentHandle.name}/${folderName}`;
      locationInput.classList.remove('ftue-input-error');
    }

    // Subtitle removed from FTUE and site settings
    const siteSubtitle = '';

    const prefixInput = document.getElementById('ftue-input-prefix');
    const baseUrl = (isAdvanced && prefixInput) ? prefixInput.value.trim() || '/blog/' : '/blog/';
    const authorName = authorVal;

    const bioInput = document.getElementById('ftue-site-bio');
    const authorBio = (bioInput && bioInput.value.trim()) ? bioInput.value.trim() : '';

    const mainSelect = document.getElementById('ftue-tz-select-main');
    const selectedTz = (mainSelect && mainSelect.value) ? mainSelect.value : (detectedTimezone || 'America/Chicago');

    const palette = THEME_PALETTES[activeSelectedTheme] || THEME_PALETTES.basalt;

    // Construct fresh project config
    const newConfig = {
      schemaVersion: 150,
      buildToken: 'v150',
      name: siteTitle,
      subtitle: '',
      description: siteTitle,
      domain: '',
      baseUrl: baseUrl,
      rssEnabled: false,
      timezone: selectedTz,
      createdAt: Date.now(),
      createdYear: new Date().getFullYear(),
      defaultAuthor: authorName,
      defaultCategory: 'Uncategorized',
      authors: [
        {
          name: authorName,
          avatar: '',
          bio: authorBio,
          joinDate: 'Joined ' + new Date().getFullYear(),
          retired: false
        }
      ],
      categories: [],
      activityLog: [],
      design: {
        snapEnabled: true,
        gridSize: 160,
        canvasWidth: 1920,
        containerWidth: 1280,
        columns: 8,
        containerLocked: true,
        scaleMode: 'auto',
        deviceMode: 'desktop',
        activeTheme: palette.id,
        blogTheme: palette.id,
        stickyHeader: false,
        branding: {
          generalLogo: uploadedLogoDataUrl || '',
          tabLogo: (uploadedBrandingAssets && uploadedBrandingAssets['media/branding/icon.png']) || uploadedLogoDataUrl || '',
          originalLogo: (uploadedBrandingAssets && uploadedBrandingAssets['media/branding/logo-original.png']) || uploadedLogoDataUrl || '',
          folder: 'media/branding',
          files: uploadedBrandingAssets || {},
          siteTitle: siteTitle,
          tagline: '',
          signage: '',
          footerNotice: '',
          accentGlow: palette.glow
        },
        mastheadPresets: {},
        masthead: {
          height: 64,
          snapGrid: 16,
          snapEnabled: true,
          uiVisible: true,
          gridVisible: true,
          image2SpacingDefault: true,
          elements: {
            logo: { enabled: !!uploadedLogoDataUrl, x: 96, y: 144, size: 48, scale: 1.0 },
            title: { enabled: true, x: 144, y: 160, scale: 1.0 }
          }
        },
        homeBlocks: [
          {
            id: 'b_masthead',
            type: 'masthead',
            x: 320,
            y: 0,
            w: 1280,
            h: 64,
            stretchWidth: false,
            config: {}
          },
          {
            id: 'b_spotlight',
            type: 'spotlight',
            x: 320,
            y: 64,
            w: 1280,
            h: 256,
            stretchWidth: false,
            config: {}
          },
          {
            id: 'b_categories',
            type: 'categories_shelf',
            x: 320,
            y: 320,
            w: 1280,
            h: 80,
            stretchWidth: false,
            config: { title: 'Category' }
          },
          {
            id: 'b_feed',
            type: 'post_feed',
            x: 320,
            y: 400,
            w: 1280,
            h: 384,
            stretchWidth: false,
            config: { title: 'Recent Posts', limit: 6, cols: 2, layoutStyle: 'vertical' }
          },
          {
            id: 'b_footer',
            type: 'footer',
            x: 320,
            y: 784,
            w: 1280,
            h: 64,
            stretchWidth: false,
            config: {}
          }
        ]
      }
    };

    // Disconnect any previously active vault link so old projects don't persist into the new blog
    if (window.SheeshVault && typeof window.SheeshVault.disconnect === 'function') {
      try {
        await window.SheeshVault.disconnect();
      } catch (e) {
        console.warn('[FTUE] Vault disconnect warning:', e);
      }
    }

    // Connect Vault to the newly created blog folder handle
    if (window.SheeshVault && typeof window.SheeshVault.setRootHandle === 'function') {
      try {
        localStorage.removeItem('cedar_vault_disconnected');
        try { localStorage.removeItem('outpost_vault_disconnected'); } catch (e) {}
        await window.SheeshVault.setRootHandle(blogDirHandle);
        await window.SheeshVault.ensureVaultStructure();
      } catch (vhErr) {
        console.warn('[FTUE] setRootHandle error:', vhErr);
      }
    }

    // Write fresh manifests & files directly into the blog directory
    const initialFiles = [
      { name: 'config.json', data: JSON.stringify(newConfig, null, 2) },
      { name: 'editor/drafts.json', data: '[]' },
      {
        name: 'vault.json',
        data: JSON.stringify({
          name: folderName,
          createdAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          version: '1.0',
          site: 'Cedar'
        }, null, 2)
      },
      {
        name: '.cfignore',
        data: [
          '# Cedar Cloudflare Guardrails - Do NOT deploy internal, draft, or hidden assets',
          'editor/',
          'writer/',
          'static-writer/',
          'blog/drafts/',
          'blog/hidden/',
          'pages/hidden/',
          'drafts/',
          'hidden/',
          'backups/',
          'notes/',
          '*.draft.*',
          '**/draft.json',
          'drafts.json',
          'vault.json',
          'notes.json',
          'sync.json',
          '_authors_archive/',
          '_designer_archive/',
          '_legacy_archive/',
          '_notes_archive/',
          '__pycache__/'
        ].join('\n') + '\n'
      }
    ];

    if (uploadedBrandingAssets) {
      for (const [assetPath, dataUrl] of Object.entries(uploadedBrandingAssets)) {
        initialFiles.push({ name: assetPath, data: dataUrl });
      }
    }

    try {
      await writeFilesToDirectoryHandle(blogDirHandle, initialFiles);
    } catch (writeErr) {
      console.warn('[FTUE] Writing initial files to directory notice:', writeErr);
    }

    // Save to localStorage
    try {
      localStorage.setItem('sheesh_static_writer_project_v1', JSON.stringify(newConfig));
      localStorage.setItem('sheesh_static_writer_drafts_v2', '[]');
      localStorage.setItem('sheesh_static_writer_active_id_v2', '');
      localStorage.setItem('cedar_active_author', authorName);
      try { localStorage.setItem('outpost_active_author', authorName); } catch (e) {}
      localStorage.setItem('cedar_ftue_completed', '1');
      try { localStorage.setItem('outpost_ftue_completed', '1'); } catch (e) {}
      localStorage.removeItem('cedar_trigger_ftue');
      try { localStorage.removeItem('outpost_trigger_ftue'); } catch (e) {}
      localStorage.removeItem('cedar_vault_disconnected');
      try { localStorage.removeItem('outpost_vault_disconnected'); } catch (e) {}
      localStorage.setItem('cedar_vault_connected', '1');
      localStorage.setItem('cedar_vault_name', folderName);
      try { localStorage.setItem('outpost_vault_connected', '1'); } catch (e) {}
      try { localStorage.setItem('outpost_vault_name', folderName); } catch (e) {}
      localStorage.removeItem('cedar_browser_backup_drafts');
      localStorage.removeItem('cedar_browser_backup_project');
      localStorage.removeItem('cedar_browser_backup_timestamp');
      localStorage.removeItem('cedar_browser_backup_mode');
      if (uploadedBrandingAssets) {
        localStorage.setItem('cedar_branding_files_v1', JSON.stringify(uploadedBrandingAssets));
      }
    } catch (e) {
      console.warn('[FTUE] Error saving initial configuration:', e);
    }

    // Clear OPFS / Virtual Vault drafts
    const vStorage = window.CedarVirtualStorage || window.OutpostVirtualStorage;
    if (vStorage && typeof vStorage.writeFile === 'function') {
      try {
        await vStorage.writeFile('editor/drafts.json', []);
        await vStorage.writeFile('writer/drafts.json', []);
      } catch (e) {}
    }

    // Sync global runtime state
    window.projectConfig = newConfig;
    window.projectConfig.activityLog = [];
    if (typeof window.activityLog !== 'undefined') window.activityLog = [];
    window.drafts = [];
    if (typeof drafts !== 'undefined') {
      try { drafts = []; } catch (e) {}
    }
    window.currentDraft = null;
    window.activeNotesAuthor = authorName;

    // Reset server-side sync cache so it never contaminates the new blog
    try {
      fetch('/api/live-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: newConfig, drafts: [], blogPath: baseUrl.replace(/^\/+|\/+$/g, '') || 'blog' })
      }).catch(() => {});
    } catch (e) {}

    // Sync UI elements
    updatePageIdentity(siteTitle, uploadedLogoDataUrl);

    if (btnJumpIn) {
      btnJumpIn.disabled = false;
      btnJumpIn.innerHTML = originalBtnHtml;
    }

    closeFTUE();

    // Re-render pipeline & pages immediately
    if (typeof window.renderPostsPipeline === 'function') window.renderPostsPipeline();
    if (typeof window.renderAllPostsGrid === 'function') window.renderAllPostsGrid();
    if (typeof window.renderStaticPages === 'function') window.renderStaticPages();
    if (typeof window.renderProjectSettings === 'function') window.renderProjectSettings();

    // Route to home
    if (typeof window.navigateTo === 'function') {
      window.navigateTo('home', true);
    }
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }
    if (typeof window.showToast === 'function') {
      window.showToast(`Welcome to ${siteTitle}! Your station is ready.`);
    }
  }

  async function createAndLaunchFromMoreSettings() {
    await createAndLaunchSite(false);
  }

  function updatePageIdentity(siteTitle, logoUrl) {
    document.title = siteTitle ? `${siteTitle} — Cedar` : 'Cedar';
    const tabLogoEl = document.querySelector("link[rel*='icon']");
    if (tabLogoEl && logoUrl) {
      tabLogoEl.href = logoUrl;
    }
    const brandNameEls = document.querySelectorAll('.brand-text-name, .nav-brand-title');
    brandNameEls.forEach(el => { el.textContent = siteTitle; });
  }

  // =========================================================================
  // ARCHIVE INSPECTION & IMPORT PROCESSOR
  // =========================================================================
  function switchImportTab(type) {
    currentImportSourceType = type;
    const tabZip = document.getElementById('ftue-tab-import-zip');
    const tabFolder = document.getElementById('ftue-tab-import-folder');
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');

    if (type === 'folder') {
      if (tabZip) {
        tabZip.classList.remove('is-active');
        tabZip.setAttribute('aria-selected', 'false');
      }
      if (tabFolder) {
        tabFolder.classList.add('is-active');
        tabFolder.setAttribute('aria-selected', 'true');
      }
      if (zipDropzone) zipDropzone.style.display = 'none';
      if (folderDropzone) folderDropzone.style.display = 'flex';
    } else {
      if (tabFolder) {
        tabFolder.classList.remove('is-active');
        tabFolder.setAttribute('aria-selected', 'false');
      }
      if (tabZip) {
        tabZip.classList.add('is-active');
        tabZip.setAttribute('aria-selected', 'true');
      }
      if (folderDropzone) folderDropzone.style.display = 'none';
      if (zipDropzone) zipDropzone.style.display = 'flex';
    }
  }

  // =========================================================================
  // ARCHIVE & FOLDER INSPECTION & IMPORT PROCESSOR
  // =========================================================================
  async function processArchiveFile(file) {
    const progressWrap = document.getElementById('ftue-progress-bar-wrap');
    const progressLabel = document.getElementById('ftue-progress-label');
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');
    const typeBar = document.getElementById('ftue-import-mode-bar');

    if (progressWrap) progressWrap.style.display = 'flex';
    if (progressLabel) progressLabel.textContent = `Extracting ${file.name}...`;
    if (zipDropzone) zipDropzone.style.display = 'none';
    if (folderDropzone) folderDropzone.style.display = 'none';
    if (typeBar) typeBar.style.display = 'none';
    if (inspectionContainer) inspectionContainer.style.display = 'none';

    try {
      const arrayBuf = await file.arrayBuffer();
      currentExtractedFiles = await parseZip(arrayBuf);
      currentFolderHandle = null;
      currentFolderName = '';
      currentImportSourceType = 'zip';

      if (progressLabel) progressLabel.textContent = 'Inspecting archive manifests & token version...';

      if ((!window.CedarMigration && !window.OutpostMigration)) {
        throw new Error('Migration engine not loaded.');
      }

      currentInspection = (window.CedarMigration || window.OutpostMigration).inspectArchive(currentExtractedFiles);

      renderInspectionResult(file, currentInspection);
    } catch (err) {
      console.error('[FTUE] Archive inspection failed:', err);
      renderInspectionError(file.name, err.message, false);
    } finally {
      if (progressWrap) progressWrap.style.display = 'none';
    }
  }

  async function processDirectoryHandle(dirHandle) {
    if (!dirHandle) return;
    const progressWrap = document.getElementById('ftue-progress-bar-wrap');
    const progressLabel = document.getElementById('ftue-progress-label');
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');
    const typeBar = document.getElementById('ftue-import-mode-bar');

    if (progressWrap) progressWrap.style.display = 'flex';
    if (progressLabel) progressLabel.textContent = `Scanning folder "${dirHandle.name}"...`;
    if (zipDropzone) zipDropzone.style.display = 'none';
    if (folderDropzone) folderDropzone.style.display = 'none';
    if (typeBar) typeBar.style.display = 'none';
    if (inspectionContainer) inspectionContainer.style.display = 'none';

    try {
      const files = await extractFilesFromDirectoryHandle(dirHandle);
      let totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

      currentExtractedFiles = files;
      currentFolderHandle = dirHandle;
      currentFolderName = dirHandle.name;
      currentImportSourceType = 'folder';

      if (progressLabel) progressLabel.textContent = 'Inspecting folder manifests & token version...';

      if ((!window.CedarMigration && !window.OutpostMigration)) {
        throw new Error('Migration engine not loaded.');
      }

      currentInspection = (window.CedarMigration || window.OutpostMigration).inspectArchive(files);
      renderInspectionResult({ name: dirHandle.name, size: totalSize, isFolder: true }, currentInspection);
    } catch (err) {
      console.error('[FTUE] Directory inspection failed:', err);
      renderInspectionError(dirHandle.name, err.message, true);
    } finally {
      if (progressWrap) progressWrap.style.display = 'none';
    }
  }

  async function processFolderFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const progressWrap = document.getElementById('ftue-progress-bar-wrap');
    const progressLabel = document.getElementById('ftue-progress-label');
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');
    const typeBar = document.getElementById('ftue-import-mode-bar');

    if (progressWrap) progressWrap.style.display = 'flex';
    if (progressLabel) progressLabel.textContent = 'Reading folder contents...';
    if (zipDropzone) zipDropzone.style.display = 'none';
    if (folderDropzone) folderDropzone.style.display = 'none';
    if (typeBar) typeBar.style.display = 'none';
    if (inspectionContainer) inspectionContainer.style.display = 'none';

    let folderName = 'Selected Folder';
    try {
      const files = [];
      let totalSize = 0;
      if (fileList[0].webkitRelativePath && fileList[0].webkitRelativePath.includes('/')) {
        folderName = fileList[0].webkitRelativePath.split('/')[0];
      }

      for (const file of fileList) {
        let relativePath = file.webkitRelativePath || file.name;
        if (file.webkitRelativePath && file.webkitRelativePath.includes('/')) {
          relativePath = file.webkitRelativePath.replace(/^[^/]+\//, '');
        }
        if (relativePath.startsWith('.') && relativePath !== '.cfignore') continue;
        if (relativePath.startsWith('node_modules/')) continue;

        const arrayBuf = await file.arrayBuffer();
        files.push({
          name: relativePath,
          data: new Uint8Array(arrayBuf),
          size: file.size
        });
        totalSize += file.size;
      }

      currentExtractedFiles = files;
      currentFolderHandle = null;
      currentFolderName = folderName;
      currentImportSourceType = 'folder';

      if (progressLabel) progressLabel.textContent = 'Inspecting folder manifests & token version...';

      if ((!window.CedarMigration && !window.OutpostMigration)) {
        throw new Error('Migration engine not loaded.');
      }

      currentInspection = (window.CedarMigration || window.OutpostMigration).inspectArchive(files);
      renderInspectionResult({ name: folderName, size: totalSize, isFolder: true }, currentInspection);
    } catch (err) {
      console.error('[FTUE] Folder files inspection failed:', err);
      renderInspectionError(folderName, err.message, true);
    } finally {
      if (progressWrap) progressWrap.style.display = 'none';
    }
  }

  async function processExtractedFolderFiles(folderName, files) {
    const progressWrap = document.getElementById('ftue-progress-bar-wrap');
    const progressLabel = document.getElementById('ftue-progress-label');
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');
    const typeBar = document.getElementById('ftue-import-mode-bar');

    if (progressWrap) progressWrap.style.display = 'flex';
    if (progressLabel) progressLabel.textContent = `Inspecting folder "${folderName}"...`;
    if (zipDropzone) zipDropzone.style.display = 'none';
    if (folderDropzone) folderDropzone.style.display = 'none';
    if (typeBar) typeBar.style.display = 'none';
    if (inspectionContainer) inspectionContainer.style.display = 'none';

    try {
      let totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
      currentExtractedFiles = files;
      currentFolderHandle = null;
      currentFolderName = folderName;
      currentImportSourceType = 'folder';

      if ((!window.CedarMigration && !window.OutpostMigration)) {
        throw new Error('Migration engine not loaded.');
      }

      currentInspection = (window.CedarMigration || window.OutpostMigration).inspectArchive(files);
      renderInspectionResult({ name: folderName, size: totalSize, isFolder: true }, currentInspection);
    } catch (err) {
      console.error('[FTUE] Folder inspection failed:', err);
      renderInspectionError(folderName, err.message, true);
    } finally {
      if (progressWrap) progressWrap.style.display = 'none';
    }
  }

  function renderInspectionResult(source, inspection) {
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const filenameEl = document.getElementById('ftue-inspect-filename');
    const statsEl = document.getElementById('ftue-inspect-stats');
    const badgeEl = document.getElementById('ftue-inspect-token-badge');
    const calloutEl = document.getElementById('ftue-inspect-callout');
    const calloutIconEl = document.getElementById('ftue-callout-icon');
    const calloutTextEl = document.getElementById('ftue-callout-text');
    const btnDirect = document.getElementById('ftue-btn-direct-import');
    const btnTranslate = document.getElementById('ftue-btn-translate-import');
    const btnChooseDiff = document.getElementById('ftue-btn-choose-diff-zip');

    if (!inspectionContainer) return;
    inspectionContainer.style.display = 'block';

    const isFolder = Boolean(source.isFolder || currentImportSourceType === 'folder');
    if (filenameEl) {
      filenameEl.textContent = isFolder ? `📁 ${source.name}` : `📦 ${source.name}`;
    }

    // Don't show local folder and don't show X posts detected
    if (statsEl) {
      statsEl.textContent = '';
      statsEl.style.display = 'none';
    }

    if (btnChooseDiff) {
      btnChooseDiff.textContent = isFolder ? 'Choose Another Folder' : 'Choose Another Archive';
    }
    if (btnDirect) {
      const labelSpan = btnDirect.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = isFolder ? 'Import Blog Folder' : 'Choose Location & Unzip Blog';
      }
    }
    if (btnTranslate) {
      const labelSpan = btnTranslate.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = isFolder ? 'Translate & Import Folder' : 'Choose Location & Modernize Unzip';
      }
    }

    // Reset classes and hide token badge
    if (badgeEl) {
      badgeEl.className = 'ftue-token-badge';
      badgeEl.style.display = 'none';
    }
    if (calloutEl) calloutEl.className = 'ftue-callout';
    if (btnDirect) btnDirect.style.display = 'none';
    if (btnTranslate) btnTranslate.style.display = 'none';

    if (!inspection.isValid) {
      // Invalid archive or folder
      if (badgeEl) {
        badgeEl.textContent = isFolder ? 'Invalid Folder' : 'Invalid Archive';
        badgeEl.classList.add('token-invalid');
      }
      if (calloutEl) calloutEl.classList.add('callout-error');
      if (calloutIconEl) {
        calloutIconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      }
      if (calloutTextEl) {
        let msg = inspection.error || (isFolder ? 'This folder is not a valid Cedar blog folder.' : 'This archive is not a valid Cedar blog archive.');
        if (isFolder) {
          msg = msg.replace(/archive/gi, 'folder');
        }
        calloutTextEl.textContent = msg;
      }
      return;
    }

    let displayMessage = inspection.message;
    if (isFolder && displayMessage) {
      displayMessage = displayMessage.replace(/archive token/gi, 'Folder token').replace(/archive/gi, 'folder');
    }

    if (inspection.isLegacy) {
      // Legacy archive (< v125) needing translation
      if (badgeEl) {
        badgeEl.textContent = `Token: ${inspection.buildToken}`;
        badgeEl.classList.add('token-legacy');
        badgeEl.style.display = 'none';
      }
      if (calloutEl) calloutEl.classList.add('callout-legacy');
      if (calloutIconEl) {
        calloutIconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      }
      if (calloutTextEl) {
        calloutTextEl.textContent = displayMessage;
      }
      if (btnTranslate) btnTranslate.style.display = 'inline-flex';
    } else {
      // Compatible archive (>= v125)
      if (badgeEl) {
        badgeEl.textContent = '';
        badgeEl.style.display = 'none';
      }
      if (calloutEl) calloutEl.classList.add('callout-compatible');
      if (calloutIconEl) {
        calloutIconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      }
      if (calloutTextEl) {
        calloutTextEl.textContent = 'Fully compatible';
      }
      if (btnDirect) btnDirect.style.display = 'inline-flex';
    }
  }

  function renderInspectionError(filename, errorMsg, isFolder = false) {
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const filenameEl = document.getElementById('ftue-inspect-filename');
    const statsEl = document.getElementById('ftue-inspect-stats');
    const badgeEl = document.getElementById('ftue-inspect-token-badge');
    const calloutEl = document.getElementById('ftue-inspect-callout');
    const calloutIconEl = document.getElementById('ftue-callout-icon');
    const calloutTextEl = document.getElementById('ftue-callout-text');
    const btnDirect = document.getElementById('ftue-btn-direct-import');
    const btnTranslate = document.getElementById('ftue-btn-translate-import');
    const btnChooseDiff = document.getElementById('ftue-btn-choose-diff-zip');

    if (!inspectionContainer) return;
    inspectionContainer.style.display = 'block';

    if (btnDirect) btnDirect.style.display = 'none';
    if (btnTranslate) btnTranslate.style.display = 'none';

    const folderMode = Boolean(isFolder || currentImportSourceType === 'folder');
    if (filenameEl) filenameEl.textContent = folderMode ? `📁 ${filename}` : `📦 ${filename}`;
    if (statsEl) {
      statsEl.textContent = '';
      statsEl.style.display = 'none';
    }

    if (btnChooseDiff) {
      btnChooseDiff.textContent = folderMode ? 'Choose Another Folder' : 'Choose Another Archive';
    }

    if (badgeEl) {
      badgeEl.textContent = '';
      badgeEl.style.display = 'none';
    }
    if (calloutEl) calloutEl.className = 'ftue-callout callout-error';
    if (calloutIconEl) {
      calloutIconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }
    if (calloutTextEl) {
      calloutTextEl.textContent = `Could not inspect ${folderMode ? 'folder' : 'archive'}: ${errorMsg}`;
    }
  }

  function resetImportUI(defaultType = 'folder') {
    const zipDropzone = document.getElementById('ftue-zip-dropzone');
    const folderDropzone = document.getElementById('ftue-folder-dropzone');
    const zipFileInput = document.getElementById('ftue-zip-file-input');
    const folderFileInput = document.getElementById('ftue-folder-file-input');
    const inspectionContainer = document.getElementById('ftue-inspection-container');
    const progressWrap = document.getElementById('ftue-progress-bar-wrap');
    const typeBar = document.getElementById('ftue-import-mode-bar');
    const tabZip = document.getElementById('ftue-tab-import-zip');
    const tabFolder = document.getElementById('ftue-tab-import-folder');

    if (zipFileInput) zipFileInput.value = '';
    if (folderFileInput) folderFileInput.value = '';

    if (typeBar) typeBar.style.display = 'flex';

    currentImportSourceType = defaultType || 'folder';

    if (currentImportSourceType === 'folder') {
      if (folderDropzone) folderDropzone.style.display = 'flex';
      if (zipDropzone) zipDropzone.style.display = 'none';
      if (tabZip) {
        tabZip.classList.remove('is-active');
        tabZip.setAttribute('aria-selected', 'false');
      }
      if (tabFolder) {
        tabFolder.classList.add('is-active');
        tabFolder.setAttribute('aria-selected', 'true');
      }
    } else {
      if (zipDropzone) zipDropzone.style.display = 'flex';
      if (folderDropzone) folderDropzone.style.display = 'none';
      if (tabFolder) {
        tabFolder.classList.remove('is-active');
        tabFolder.setAttribute('aria-selected', 'false');
      }
      if (tabZip) {
        tabZip.classList.add('is-active');
        tabZip.setAttribute('aria-selected', 'true');
      }
    }

    if (inspectionContainer) inspectionContainer.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'none';

    currentExtractedFiles = null;
    currentInspection = null;
    currentFolderHandle = null;
    currentFolderName = '';
  }

  async function executeImport(translate) {
    if (!currentExtractedFiles || (!window.CedarMigration && !window.OutpostMigration)) return;

    if (!isFsaSupported()) {
      showScreen('unsupported', true);
      return;
    }

    const progressWrap = document.getElementById('ftue-progress-bar-wrap');
    const progressLabel = document.getElementById('ftue-progress-label');
    const inspectionActions = document.querySelector('.ftue-inspection-actions');

    let targetFolderHandle = currentFolderHandle;
    let targetFolderName = currentFolderName;

    // If imported from a ZIP archive (or any source without an existing directory handle),
    // ask the user where they want to unzip this blog folder.
    if (!targetFolderHandle) {
      let parentHandle;
      try {
        parentHandle = await pickDirectorySafe();
      } catch (err) {
        if (err.name === 'AbortError') {
          // User dismissed the folder destination picker dialog; stay on inspection screen
          return;
        }
        console.error('[FTUE] Destination directory picker error:', err);
        alert(`Could not select destination folder: ${err.message}`);
        return;
      }

      // Determine blog title from inspection metadata or config
      let rawTitle = currentInspection?.config?.name || currentInspection?.blogTitle || currentInspection?.detectedTitle;
      if (!rawTitle && currentExtractedFiles) {
        const cfgFile = currentExtractedFiles.find(f => f.name === 'config.json' || f.name.endsWith('/config.json'));
        if (cfgFile) {
          try {
            const parsed = typeof cfgFile.data === 'string' ? JSON.parse(cfgFile.data) : JSON.parse(new TextDecoder().decode(cfgFile.data));
            if (parsed && parsed.name) rawTitle = parsed.name;
          } catch (e) {}
        }
      }
      if (!rawTitle && currentFolderName) {
        rawTitle = currentFolderName.replace(/\.zip$/i, '');
      }
      if (!rawTitle) rawTitle = 'Imported Blog';

      const safeTitle = rawTitle.replace(/[/\\?%*:|"<>]/g, '').trim() || 'Imported Blog';
      targetFolderName = `${safeTitle} - a Cedar blog`;

      if (progressLabel) progressLabel.textContent = `Creating "${targetFolderName}"...`;
      if (inspectionActions) inspectionActions.style.display = 'none';
      if (progressWrap) progressWrap.style.display = 'flex';

      try {
        targetFolderHandle = await parentHandle.getDirectoryHandle(targetFolderName, { create: true });
      } catch (createErr) {
        if (progressWrap) progressWrap.style.display = 'none';
        if (inspectionActions) inspectionActions.style.display = 'flex';
        alert(`Could not create folder "${targetFolderName}": ${createErr.message}`);
        return;
      }
    } else {
      if (inspectionActions) inspectionActions.style.display = 'none';
      if (progressWrap) progressWrap.style.display = 'flex';
    }

    try {
      let filesToApply = currentExtractedFiles;
      if (translate) {
        if (progressLabel) progressLabel.textContent = 'Translating layout blocks and schemas to v150...';
        const translationResult = (window.CedarMigration || window.OutpostMigration).translateLegacyArchive(currentExtractedFiles, currentInspection);
        filesToApply = translationResult.translatedFiles;
      }

      // If this was an archive unzip, write all files into the newly created folder
      if (!currentFolderHandle && targetFolderHandle) {
        if (progressLabel) progressLabel.textContent = `Unzipping blog files into "${targetFolderName}"...`;
        await writeFilesToDirectoryHandle(targetFolderHandle, filesToApply);
      }

      // Link and bind the Vault to the target directory handle
      if (targetFolderHandle && window.SheeshVault) {
        if (progressLabel) progressLabel.textContent = 'Connecting Vault to blog folder...';
        try {
          localStorage.removeItem('cedar_vault_disconnected');
          try { localStorage.removeItem('outpost_vault_disconnected'); } catch(e){}
          await window.SheeshVault.setRootHandle(targetFolderHandle);
          await window.SheeshVault.ensureVaultStructure();

          // If legacy translation modified files on an existing folder, write the updated manifests to disk
          if (currentFolderHandle && translate && Array.isArray(filesToApply)) {
            for (const file of filesToApply) {
              if (file.name.endsWith('.json') || file.name.endsWith('.md')) {
                try {
                  await window.SheeshVault.writeVaultFile(file.name, file.data);
                } catch (writeErr) {
                  console.warn('[FTUE] Vault write error during migration:', writeErr);
                }
              }
            }
          }

          localStorage.setItem('cedar_vault_connected', '1');
          localStorage.setItem('cedar_vault_name', targetFolderHandle.name);
          try { localStorage.setItem('outpost_vault_connected', '1'); } catch(e){}
          try { localStorage.setItem('outpost_vault_name', targetFolderHandle.name); } catch(e){}

          // Try resolving backend path if available
          try {
            const res = await fetch(`/api/vault-path?folder=${encodeURIComponent(targetFolderHandle.name)}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.defaultPath) {
                localStorage.setItem('cedar_vault_path', data.defaultPath);
                try { localStorage.setItem('outpost_vault_path', data.defaultPath); } catch(e){}
              }
            }
          } catch(e) {}

        } catch (vaultErr) {
          console.warn('[FTUE] Connecting folder to vault notice:', vaultErr);
        }
      }

      if (progressLabel) progressLabel.textContent = 'Writing restored blog data to storage...';
      const result = await (window.CedarMigration || window.OutpostMigration).applyImport(filesToApply);

      closeFTUE();

      if (typeof window.showToast === 'function') {
        const finalName = targetFolderHandle ? targetFolderHandle.name : targetFolderName;
        window.showToast(`Imported ${result.draftsCount} posts into "${finalName}" successfully.`);
      }

      // Reload so all state, designer, and dashboard components refresh cleanly
      setTimeout(() => {
        location.reload();
      }, 350);

    } catch (err) {
      console.error('[FTUE] Import execution error:', err);
      if (progressWrap) progressWrap.style.display = 'none';
      if (inspectionActions) inspectionActions.style.display = 'flex';
      alert(`Import failed: ${err.message}`);
    }
  }

  // =========================================================================
  // MODAL OPEN / CLOSE LIFECYCLE
  // =========================================================================
  function openFTUE() {
    initFTUE();
    const modalEl = document.getElementById('modal-ftue');
    if (!modalEl) return;

    modalEl.style.display = 'flex';

    if (!isFsaSupported()) {
      showScreen('unsupported', true);
      const btnClose = document.getElementById('ftue-btn-close');
      if (btnClose) btnClose.style.display = 'none';
      return;
    }

    const rawHash = window.location.hash || '';
    let cleanHash = rawHash.trim();
    if (cleanHash.startsWith('#/')) cleanHash = cleanHash.slice(2);
    else if (cleanHash.startsWith('#')) cleanHash = cleanHash.slice(1);
    cleanHash = cleanHash.split('?')[0];

    const initialScreen = HASH_SCREEN_MAP[cleanHash] || 'choice';
    showScreen(initialScreen, true);

    resetImportUI();
    detectSystemTimezone();
    applyLiveTheme(activeSelectedTheme);

    const isAlreadyCompleted = (localStorage.getItem('cedar_ftue_completed') || localStorage.getItem('outpost_ftue_completed')) === '1';
    const btnClose = document.getElementById('ftue-btn-close');
    if (btnClose) {
      // Allow closing only if site is already set up and user opened wizard manually
      btnClose.style.display = isAlreadyCompleted ? 'flex' : 'none';
    }
  }

  function closeFTUE() {
    stopClockTicker();
    const modalEl = document.getElementById('modal-ftue');
    if (modalEl) {
      modalEl.style.display = 'none';
    }

    const rawHash = window.location.hash || '';
    let cleanHash = rawHash.trim();
    if (cleanHash.startsWith('#/')) cleanHash = cleanHash.slice(2);
    else if (cleanHash.startsWith('#')) cleanHash = cleanHash.slice(1);
    cleanHash = cleanHash.split('?')[0];

    if (['welcome', 'configs', 'moreconfigs', 'import', 'new', 'moresettings', 'unsupported'].includes(cleanHash)) {
      try {
        history.replaceState(null, '', '#home');
      } catch (e) {
        window.location.hash = 'home';
      }
    }
  }

  /**
   * Checks whether Cedar is on a blank slate or nuclear trigger
   */
  function checkAndLaunchFTUE() {
    initFTUE();
    // 1. Explicit Nuclear Trigger
    const isNuclearTriggered = (localStorage.getItem('cedar_trigger_ftue') || localStorage.getItem('outpost_trigger_ftue')) === '1';
    if (isNuclearTriggered) {
      console.log('[FTUE] Nuclear trigger detected. Launching FTUE onboarding wizard...');
      openFTUE();
      return;
    }

    // 2. Fresh launch detection: no FTUE completed flag and no posts
    const isCompleted = (localStorage.getItem('cedar_ftue_completed') || localStorage.getItem('outpost_ftue_completed')) === '1';
    if (!isCompleted) {
      const storedDraftsRaw = localStorage.getItem('sheesh_static_writer_drafts_v2');
      let draftsCount = 0;
      if (storedDraftsRaw) {
        try {
          const parsed = JSON.parse(storedDraftsRaw);
          if (Array.isArray(parsed)) {
            const builtInPageIds = new Set(['page_rss', 'page_about', 'page_about_cedar', 'page_links', 'page_all']);
            draftsCount = parsed.filter(d => d && !builtInPageIds.has(String(d.id || ''))).length;
          }
        } catch (e) {}
      }

      // If there are zero drafts in localStorage, treat as fresh blank slate
      if (draftsCount === 0) {
        console.log('[FTUE] Blank slate detected (0 drafts). Launching FTUE onboarding wizard...');
        openFTUE();
      }
    }
  }

  // Export to global scope
  window.CedarFTUE = {
    init: initFTUE,
    open: openFTUE,
    close: closeFTUE,
    showScreen: showScreen,
    handleHashRoute: handleHashRoute,
    applyLiveTheme: applyLiveTheme,
    resolvePopout3dTokens: resolvePopout3dTokens,
    checkAndLaunch: checkAndLaunchFTUE,
    getSortedTimezoneList: getSortedTimezoneList,
    getTimezoneOffsetInfo: getTimezoneOffsetInfo,
    THEME_PALETTES: THEME_PALETTES,
    THEME_PALETTES_ORDERED: THEME_PALETTES_ORDERED,
    THEME_ACCENTS_DARK: THEME_ACCENTS_DARK,
    THEME_ACCENTS_LIGHT: THEME_ACCENTS_LIGHT,
    THEME_SUPER_DARK: THEME_SUPER_DARK,
    THEME_SUPER_LIGHT: THEME_SUPER_LIGHT,
    THEME_SUPER_PALETTES: THEME_SUPER_PALETTES,
    THEME_MODE_MAP: THEME_MODE_MAP,
    THEME_PUNNETT_MATRIX: THEME_PUNNETT_MATRIX,
    resolvePunnettSquareTokens: resolvePunnettSquareTokens,
    setSimulateTimezoneFailure: function (val) {
      simulateDetectionFailure = !!val;
      detectSystemTimezone();
    }
  };
  window.OutpostFTUE = window.CedarFTUE;

  // Run DOM bindings and apply theme on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initFTUE();
      applyLiveTheme(activeSelectedTheme, false);
    });
  } else {
    initFTUE();
    applyLiveTheme(activeSelectedTheme, false);
  }

  // Also apply immediately synchronously
  try {
    applyLiveTheme(activeSelectedTheme, false);
  } catch (e) {}

})();
