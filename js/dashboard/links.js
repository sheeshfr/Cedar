/**
 * Cedar - Dedicated Links (Linktree Alternative Engine)
 * Handles link cards management, AZ-5 style drag & drop URL auto-detection,
 * icon extraction/presets, media/links asset storage, and real-time live preview.
 */
(function() {
  'use strict';

  // Built-in Brand Icons (SVGs)
  const BRAND_ICONS = {
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
    linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  };
  window.Cedar = window.Cedar || {};
  window.Cedar.links = window.Cedar.links || {};
  window.Cedar.links.BRAND_ICONS = BRAND_ICONS;

  // Known brand rules for instant AZ-5 auto-detection
  const DOMAIN_RULES = [
    { match: /facebook\.com/i, title: 'Facebook', subtitle: 'facebook.com', icon: 'facebook' },
    { match: /instagram\.com/i, title: 'Instagram', subtitle: 'instagram.com', icon: 'instagram' },
    { match: /(twitter\.com|x\.com)/i, title: 'Twitter / X', subtitle: 'x.com', icon: 'twitter' },
    { match: /github\.com/i, title: 'GitHub', subtitle: 'github.com', icon: 'github' },
    { match: /(youtube\.com|youtu\.be)/i, title: 'YouTube', subtitle: 'youtube.com', icon: 'youtube' },
    { match: /(discord\.gg|discord\.com)/i, title: 'Discord', subtitle: 'discord.gg', icon: 'discord' },
    { match: /reddit\.com/i, title: 'Reddit', subtitle: 'reddit.com', icon: 'reddit' },
    { match: /tiktok\.com/i, title: 'TikTok', subtitle: 'tiktok.com', icon: 'tiktok' },
    { match: /twitch\.tv/i, title: 'Twitch', subtitle: 'twitch.tv', icon: 'twitch' },
    { match: /spotify\.com/i, title: 'Spotify', subtitle: 'spotify.com', icon: 'spotify' },
    { match: /patreon\.com/i, title: 'Patreon', subtitle: 'patreon.com', icon: 'patreon' },
    { match: /substack\.com/i, title: 'Substack', subtitle: 'substack.com', icon: 'substack' },
    { match: /bsky\.app/i, title: 'Bluesky', subtitle: 'bsky.app', icon: 'bluesky' },
    { match: /threads\.net/i, title: 'Threads', subtitle: 'threads.net', icon: 'threads' },
    { match: /(steampowered\.com|steamcommunity\.com)/i, title: 'Steam', subtitle: 'store.steampowered.com', icon: 'steam' },
    { match: /itch\.io/i, title: 'itch.io', subtitle: 'itch.io', icon: 'itch' },
    { match: /linkedin\.com/i, title: 'LinkedIn', subtitle: 'linkedin.com', icon: 'linkedin' },
    { match: /^(\/blog\/|blog|\/blog)$/i, title: 'Blog', subtitle: 'Latest essays and stories', icon: 'blog' }
  ];

  let currentEditingCardId = null;
  let isSavingLinks = false;
  let saveDebounceTimer = null;
  let dragSrcIndex = -1;

  function extractHandleFromUrl(rawUrl) {
    if (!rawUrl) return null;
    let url = String(rawUrl).trim();
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      url = 'https://' + url;
    }
    try {
      const u = new URL(url);
      let host = (u.hostname || '').toLowerCase();
      if (host.startsWith('www.')) host = host.slice(4);
      const pathParts = u.pathname.split('/').filter(Boolean);

      // 1. Any path part starting with @
      for (const p of pathParts) {
        if (p.startsWith('@') && p.length > 1) {
          return p;
        }
      }

      // 2. YouTube
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        if (pathParts.length > 0) {
          if ((pathParts[0] === 'c' || pathParts[0] === 'user') && pathParts[1]) {
            return `@${pathParts[1]}`;
          }
          if (!['watch', 'playlist', 'feed', 'channel', 'embed', 'live'].includes(pathParts[0].toLowerCase())) {
            return pathParts[0].startsWith('@') ? pathParts[0] : `@${pathParts[0]}`;
          }
        }
      }

      // 3. Twitter / X
      if (host.includes('twitter.com') || host === 'x.com') {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['home', 'explore', 'notifications', 'messages', 'search', 'intent', 'i', 'settings', 'tos', 'privacy'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      // 4. Instagram
      if (host.includes('instagram.com')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'legal'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      // 5. GitHub
      if (host.includes('github.com')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['features', 'enterprise', 'pricing', 'readme', 'topics', 'collections', 'trending', 'events', 'marketplace', 'settings', 'orgs', 'organizations', 'explore'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      // 6. TikTok
      if (host.includes('tiktok.com')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          if (first.startsWith('@')) return first;
          if (!['foryou', 'live', 'trending', 'tag', 'music', 'upload'].includes(first.toLowerCase())) {
            return `@${first}`;
          }
        }
      }

      // 7. Threads
      if (host.includes('threads.net')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          return first.startsWith('@') ? first : `@${first}`;
        }
      }

      // 8. Bluesky
      if (host.includes('bsky.app')) {
        if (pathParts[0] === 'profile' && pathParts[1]) {
          const h = pathParts[1];
          return h.startsWith('@') ? h : `@${h}`;
        }
      }

      // 9. Twitch
      if (host.includes('twitch.tv')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['directory', 'videos', 'downloads', 'jobs', 'turbo', 'settings'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      // 10. Reddit
      if (host.includes('reddit.com')) {
        if ((pathParts[0] === 'user' || pathParts[0] === 'u') && pathParts[1]) {
          return `u/${pathParts[1]}`;
        }
        if (pathParts[0] === 'r' && pathParts[1]) {
          return `r/${pathParts[1]}`;
        }
      }

      // 11. Patreon
      if (host.includes('patreon.com')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['home', 'explore', 'create', 'login', 'signup', 'policy'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      // 12. Substack
      if (host.endsWith('.substack.com') && host !== 'substack.com') {
        const sub = host.replace('.substack.com', '');
        return `@${sub}`;
      }

      // 13. Telegram
      if (host === 't.me' || host === 'telegram.me') {
        if (pathParts.length > 0) {
          return `@${pathParts[0].replace(/^@/, '')}`;
        }
      }

      // 14. LinkedIn
      if (host.includes('linkedin.com')) {
        if (pathParts[0] === 'in' && pathParts[1]) {
          return `@${pathParts[1].replace(/^@/, '')}`;
        }
        if (pathParts[0] === 'company' && pathParts[1]) {
          return pathParts[1];
        }
      }

      // 15. Facebook
      if (host.includes('facebook.com') || host.includes('fb.com')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['watch', 'groups', 'marketplace', 'events', 'gaming', 'pages', 'share', 'login'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      // 16. Medium
      if (host.includes('medium.com')) {
        if (pathParts.length > 0 && pathParts[0].startsWith('@')) {
          return pathParts[0];
        }
      }

      // 17. SoundCloud
      if (host.includes('soundcloud.com')) {
        if (pathParts.length > 0) {
          const first = pathParts[0];
          const excluded = ['discover', 'stream', 'upload', 'you', 'charts', 'search'];
          if (!excluded.includes(first.toLowerCase())) {
            return `@${first.replace(/^@/, '')}`;
          }
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  function sanitizeLinksDraft(draft) {
    if (!draft) return null;
    draft.type = 'page';
    draft.id = 'page_links';
    draft.slug = 'links';
    draft.title = 'Links';
    delete draft.coverImage;
    delete draft.featuredImage;

    const cfg = window.projectConfig || {};
    const siteTitle = (cfg.design?.branding?.siteTitle) || cfg.name || 'Cedar';
    const siteLogo = (cfg.design?.branding?.generalLogo) || 'images/Lamp.png';

    if (!draft.linksData) {
      draft.linksData = {
        profile: {
          headline: '',
          bio: '',
          avatar: ''
        },
        items: [resolveDefaultBlogCard()]
      };
      return draft;
    }

    if (!draft.linksData.profile) {
      draft.linksData.profile = { headline: '', bio: '', avatar: '' };
    } else {
      const h = (draft.linksData.profile.headline || '').trim();
      if (h === 'Welcome to my link site!' ||
          h === "Welcome to Cedar's link site!" ||
          (h.startsWith('Welcome to ') && h.endsWith("'s link site!")) ||
          (h.startsWith('Welcome to ') && h.endsWith("link site!"))) {
        draft.linksData.profile.headline = '';
      }
      if ((draft.linksData.profile.bio || '').trim() === 'See what I am up to.') {
        draft.linksData.profile.bio = '';
      }
      if (draft.subtitle === 'See what I am up to.') {
        draft.subtitle = '';
      }
    }

    if (!Array.isArray(draft.linksData.items)) {
      draft.linksData.items = [resolveDefaultBlogCard()];
      return draft;
    }

    draft.linksData.items = draft.linksData.items.filter(i => i && i.id !== 'link_fb' && i.id !== 'link_ig' && i.id !== 'link_tw');

    if (draft.linksData.items.length === 0) {
      draft.linksData.items = [resolveDefaultBlogCard()];
    } else {
      draft.linksData.items.forEach(it => {
        if (it && (it.id === 'link_blog' || it.url === '/blog/' || it.url === 'blog')) {
          if (it.subtitle === 'Read articles and essays') it.subtitle = 'Latest essays and stories';
          if (it.title === 'Blog') it.title = `${siteTitle} Blog`;
          if (it.icon === 'blog' && !it.customIcon) it.icon = siteLogo;
        } else if (it && it.url) {
          // Clean up accidental duplicate protocols like https://https://
          it.url = it.url.trim().replace(/^(https?:\/\/)+/i, 'https://');
          const brand = DOMAIN_RULES.find(r => r.match.test(it.url));
          if (brand && (!it.customIcon || !it.icon || it.icon === 'link' || it.icon.includes('favicons?domain=https:'))) {
            it.icon = brand.icon;
          }
          const handle = extractHandleFromUrl(it.url);
          if (handle) {
            let dom = '';
            try {
              dom = new URL(it.url.startsWith('http') ? it.url : 'https://' + it.url).hostname.replace(/^www\./i, '');
            } catch (e) {}
            if (!it.subtitle || it.subtitle === dom || (brand && it.subtitle === brand.subtitle)) {
              it.subtitle = handle;
            }
          }
        }
      });
    }

    if (!draft.linksData.design) {
      draft.linksData.design = {
        bgType: 'color',
        bgColor: '',
        bgGradient: 'sunset',
        bgPattern: 'grid',
        bgImageUrl: '',
        cardStyle: 'rounded'
      };
    } else {
      if (!draft.linksData.design.cardStyle || draft.linksData.design.cardStyle === 'ticket') draft.linksData.design.cardStyle = 'rounded';
      if (!draft.linksData.design.bgType) draft.linksData.design.bgType = 'color';
      if (!draft.linksData.design.bgGradient) draft.linksData.design.bgGradient = 'sunset';
      if (!draft.linksData.design.bgPattern) draft.linksData.design.bgPattern = 'grid';
    }

    return draft;
  }

  function getLinksDraft() {
    let draft = null;
    const isLinks = (typeof window.isLinksDraft === 'function')
      ? window.isLinksDraft
      : (d => Boolean(d && (d.id === 'page_links' || d.slug === 'links' || (d.title || '').trim().toLowerCase() === 'links' || d.linksData)));

    if (typeof window.syncLinksPageDraft === 'function') {
      draft = window.syncLinksPageDraft(window.projectConfig);
    } else {
      const all = Array.isArray(window.drafts) ? window.drafts : [];
      draft = all.find(d => isLinks(d));
      if (!draft && typeof window.createDefaultLinksPage === 'function') {
        draft = window.createDefaultLinksPage();
        all.push(draft);
      }
    }
    if (draft) {
      draft.type = 'page';
      draft.id = 'page_links';
      draft.slug = 'links';
      draft.title = 'Links';
      delete draft.coverImage;
      delete draft.featuredImage;
      sanitizeLinksDraft(draft);
      if (window.currentView === 'links') {
        window.currentDraft = draft;
      }
    }
    return draft;
  }

  function resolveProfileAvatar(avatarUrl) {
    if (avatarUrl) {
      if (avatarUrl.startsWith('data:') || avatarUrl.startsWith('http')) return avatarUrl;
      if (window.imageRegistry && window.imageRegistry.has(avatarUrl)) {
        return window.imageRegistry.get(avatarUrl).dataUrl || avatarUrl;
      }
      return avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
    }
    // Fallback to author avatar
    const cfg = window.projectConfig || {};
    const authors = Array.isArray(cfg.authors) ? cfg.authors : [];
    const defAuth = (typeof resolveProjectDefaultAuthor === 'function') ? resolveProjectDefaultAuthor() : (cfg.defaultAuthor || '');
    let authorObj = authors.find(a => ((typeof a === 'object' ? a.name : a) || '').toLowerCase() === defAuth.toLowerCase());
    if (!authorObj || !authorObj.avatar) {
      authorObj = authors.find(a => typeof a === 'object' && a.avatar && String(a.avatar).trim());
    }
    let rawAv = (authorObj && typeof authorObj === 'object') ? (authorObj.avatar || '') : (cfg.authorAvatar || '');
    if (!rawAv && window.imageRegistry) {
      for (const [key, val] of window.imageRegistry.entries()) {
        if (key.includes('author') && val && val.dataUrl) {
          rawAv = val.dataUrl;
          break;
        }
      }
    }
    if (rawAv) {
      if (rawAv.startsWith('data:') || rawAv.startsWith('http')) return rawAv;
      if (window.imageRegistry && window.imageRegistry.has(rawAv)) {
        return window.imageRegistry.get(rawAv).dataUrl || rawAv;
      }
      return rawAv.startsWith('/') ? rawAv : `/${rawAv}`;
    }
    return '';
  }

  function resolveIconSrc(icon) {
    if (!icon) return '';
    if (window.imageRegistry && window.imageRegistry.has(icon)) {
      return window.imageRegistry.get(icon).dataUrl || icon;
    }
    return icon;
  }

  function renderCardIconHtml(icon) {
    if (!icon) return BRAND_ICONS.link;
    if (BRAND_ICONS[icon]) return BRAND_ICONS[icon];
    if (icon.startsWith('data:') || icon.startsWith('http') || icon.includes('/') || icon.includes('.')) {
      const src = resolveIconSrc(icon);
      return `<img src="${escapeHtml(src)}" alt="" class="links-card-icon-img" onerror="this.onerror=null;this.parentElement.innerHTML='${BRAND_ICONS.link.replace(/"/g, '&quot;')}';">`;
    }
    return BRAND_ICONS.link;
  }

  function resolveDefaultBlogCard() {
    const cfg = window.projectConfig || {};
    const siteTitle = (cfg.design?.branding?.siteTitle) || cfg.name || 'Cedar';
    const logo = (cfg.design?.branding?.generalLogo) || 'images/Lamp.png';
    return {
      id: 'link_blog',
      title: `${siteTitle} Blog`,
      subtitle: 'Latest essays and stories',
      url: '/blog/',
      icon: logo,
      enabled: true
    };
  }

  function updateCardIconInDom(cardEl, icon) {
    if (!cardEl) return;
    const iconBtn = cardEl.querySelector('.links-card-icon-btn');
    if (iconBtn) {
      iconBtn.innerHTML = `
        ${renderCardIconHtml(icon)}
        <span class="links-card-icon-hint">Change</span>
      `;
    }
  }

  function updateLinksVisibilityBadge(draft) {
    const badge = document.getElementById('links-status-badge');
    const btn = document.getElementById('btn-links-toggle-visibility');
    const isHidden = Boolean(draft.hidden || draft.retired);
    if (badge) {
      badge.textContent = isHidden ? 'Hidden' : 'Published';
      badge.className = `editor-post-status-badge ${isHidden ? 'status-hidden' : 'status-published'}`;
      badge.removeAttribute('style');
    }
    if (btn) {
      btn.textContent = isHidden ? 'Unhide' : 'Hide';
      btn.title = isHidden ? 'Make Links page visible on public site' : 'Hide Links page from public site';
    }
  }

  let studioEventsAttached = false;
  function ensureLinksStudioEvents() {
    if (studioEventsAttached) return;
    const view = document.getElementById('view-links');
    if (!view) return;
    studioEventsAttached = true;
    initLinksStudioEvents();
  }

  function renderLinksStudio() {
    ensureLinksStudioEvents();
    const draft = getLinksDraft();
    if (!draft) return;

    window.currentDraft = draft;
    sanitizeLinksDraft(draft);

    // Update visibility badge & button
    updateLinksVisibilityBadge(draft);

    const data = draft.linksData;
    const profile = data.profile || {};
    const items = draft.linksData.items;

    // 1. Profile Panel
    const headlineInput = document.getElementById('input-links-headline');
    const bioInput = document.getElementById('input-links-bio');
    const avatarImg = document.getElementById('links-avatar-img');

    if (headlineInput && document.activeElement !== headlineInput) {
      headlineInput.value = profile.headline || '';
    }
    if (bioInput && document.activeElement !== bioInput) {
      bioInput.value = profile.bio || '';
    }
    if (avatarImg) {
      const avatarSrc = resolveProfileAvatar(profile.avatar);
      if (avatarSrc) {
        avatarImg.src = avatarSrc;
        avatarImg.style.display = 'block';
      } else {
        avatarImg.removeAttribute('src');
        avatarImg.style.display = 'none';
      }
    }

    // 2. Design & Funky Cards Panel
    const design = data.design || {};
    let cardStyle = design.cardStyle || 'rounded';
    if (cardStyle === 'ticket') cardStyle = 'holo';
    document.querySelectorAll('.links-card-style-chip').forEach(chip => {
      chip.classList.toggle('is-active', chip.dataset.cardStyle === cardStyle);
    });

    const bgType = design.bgType || 'color';
    document.querySelectorAll('.links-bg-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.bgType === bgType);
    });
    ['color', 'gradient', 'pattern', 'image'].forEach(t => {
      const pane = document.getElementById(`links-bg-pane-${t}`);
      if (pane) pane.style.display = (t === bgType) ? 'block' : 'none';
    });

    // Solid color swatches
    const activeColor = (design.bgColor || '').toLowerCase();
    let matchedPreset = false;
    document.querySelectorAll('.links-color-chip:not(.links-color-chip-custom)').forEach(chip => {
      const match = (chip.dataset.color || '').toLowerCase() === activeColor;
      chip.classList.toggle('is-active', match);
      if (match) matchedPreset = true;
    });

    const customChip = document.getElementById('btn-links-custom-color-trigger');
    if (customChip) {
      const isCustomActive = Boolean(activeColor && !matchedPreset);
      customChip.classList.toggle('is-active', isCustomActive);
      if (isCustomActive) {
        customChip.style.background = activeColor;
      } else {
        customChip.style.background = '';
      }
    }

    const customColorInput = document.getElementById('input-links-bg-color');
    const colorPicker = document.getElementById('input-links-bg-color-picker');
    if (customColorInput && document.activeElement !== customColorInput) {
      customColorInput.value = design.bgColor || '';
    }
    if (colorPicker && design.bgColor && /^#[0-9a-f]{6}$/i.test(design.bgColor)) {
      colorPicker.value = design.bgColor;
    }

    // Gradients
    const activeGrad = design.bgGradient || 'sunset';
    document.querySelectorAll('.links-gradient-chip').forEach(chip => {
      chip.classList.toggle('is-active', chip.dataset.gradient === activeGrad);
    });

    // Patterns
    const activePat = design.bgPattern || 'grid';
    document.querySelectorAll('.links-pattern-chip').forEach(chip => {
      chip.classList.toggle('is-active', chip.dataset.pattern === activePat);
    });

    // Wallpaper
    const bgImgInput = document.getElementById('input-links-bg-image-url');
    const bgImgThumb = document.getElementById('links-bg-image-preview-thumb');
    const bgImgPreviewWrap = document.getElementById('links-wallpaper-preview-wrap');
    const bgImgEmptyDropzone = document.getElementById('links-wallpaper-empty-dropzone');
    const bgImgRemoveBtn = document.getElementById('btn-links-clear-bg-image');
    const bgImgClearUrlBtn = document.getElementById('btn-links-clear-bg-url');

    if (bgImgInput && document.activeElement !== bgImgInput) {
      bgImgInput.value = design.bgImageUrl || '';
    }
    if (bgImgClearUrlBtn && bgImgInput) {
      bgImgClearUrlBtn.style.display = bgImgInput.value.trim() ? 'flex' : 'none';
    }
    if (bgImgThumb) {
      if (design.bgImageUrl) {
        let thumbUrl = design.bgImageUrl;
        if (window.imageRegistry && window.imageRegistry.has(thumbUrl)) {
          thumbUrl = window.imageRegistry.get(thumbUrl).dataUrl || thumbUrl;
        }
        bgImgThumb.style.backgroundImage = `url('${thumbUrl}')`;
        if (bgImgPreviewWrap) bgImgPreviewWrap.style.display = 'block';
        if (bgImgEmptyDropzone) bgImgEmptyDropzone.style.display = 'none';
        if (bgImgRemoveBtn) bgImgRemoveBtn.style.display = 'inline-flex';
      } else {
        bgImgThumb.style.backgroundImage = 'none';
        if (bgImgPreviewWrap) bgImgPreviewWrap.style.display = 'none';
        if (bgImgEmptyDropzone) bgImgEmptyDropzone.style.display = 'flex';
        if (bgImgRemoveBtn) bgImgRemoveBtn.style.display = 'none';
      }
    }

    // 3. Count
    const countEl = document.getElementById('links-count-num');
    if (countEl) countEl.textContent = items.length;

    // 4. Card Slots
    const listEl = document.getElementById('links-cards-list');
    if (listEl) {
      if (items.length === 0) {
        listEl.innerHTML = `
          <div class="links-empty-slot">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            <p>No link cards yet. Click "New Card" below to add one.</p>
          </div>
        `;
      } else {
        listEl.innerHTML = '';
        items.forEach((item, index) => {
          const cardEl = createCardElement(item, index, items.length);
          listEl.appendChild(cardEl);
        });
      }
    }

    // 4. Update Live Mockup Phone Preview
    updateLiveDevicePreview(draft);
  }

  function createCardElement(item, index, total) {
    const card = document.createElement('div');
    card.className = `links-card-slot popout-3d ${item.enabled === false ? 'is-disabled' : ''}`;
    card.dataset.id = item.id;
    card.dataset.index = String(index);
    card.draggable = false;

    const iconHtml = renderCardIconHtml(item.icon);

    card.innerHTML = `
      <div class="links-card-handle" title="Drag to reorder" draggable="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="9" cy="19" r="2"></circle><circle cx="15" cy="5" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="15" cy="19" r="2"></circle></svg>
      </div>

      <button type="button" class="links-card-icon-btn" data-action="pick-icon" title="Change Logo / Icon">
        ${iconHtml}
        <span class="links-card-icon-hint">Change</span>
      </button>

      <div class="links-card-inputs">
        <div class="links-card-row-top">
          <input type="text" class="dash-input links-card-title-input" data-field="title" placeholder="Title (e.g. YouTube)" value="${escapeHtml(item.title || '')}" autocomplete="off">
          <input type="text" class="dash-input links-card-subtitle-input" data-field="subtitle" placeholder="Subtitle (e.g. @besmart)" value="${escapeHtml(item.subtitle || '')}" autocomplete="off">
        </div>
        <div class="links-card-row-bottom">
          <input type="text" class="dash-input links-card-url-input" data-field="url" placeholder="https://..." value="${escapeHtml(item.url || '')}" autocomplete="off">
          <button type="button" class="links-btn-glyph links-btn-danger links-card-delete-btn" data-action="delete-card" title="Delete this link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;

    // Drag-and-drop reordering: explicitly triggered by the drag handle
    let isHandleGrabbed = false;
    const handle = card.querySelector('.links-card-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => {
        isHandleGrabbed = true;
        card.draggable = true;
      });
      handle.addEventListener('touchstart', () => {
        isHandleGrabbed = true;
        card.draggable = true;
      }, { passive: true });
    }

    // Input listeners for title and subtitle, with drag isolation so user can highlight text
    const titleInput = card.querySelector('.links-card-title-input');
    const subInput = card.querySelector('.links-card-subtitle-input');
    const urlInput = card.querySelector('.links-card-url-input');

    card.querySelectorAll('input, button').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        isHandleGrabbed = false;
        card.draggable = false;
        e.stopPropagation();
      });
    });

    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        item.title = e.target.value;
        scheduleSaveLinks(true);
        updateLiveDevicePreview(getLinksDraft());
      });
    }

    if (subInput) {
      subInput.addEventListener('input', (e) => {
        item.subtitle = e.target.value;
        scheduleSaveLinks(true);
        updateLiveDevicePreview(getLinksDraft());
      });
    }

    // Dynamic URL detection & logo extraction on input, change, and paste
    if (urlInput) {
      let urlDebounceTimer = null;
      const onUrlChanged = (val) => {
        item.url = val;
        enhanceCardFromUrl(item, card, val);
      };

      urlInput.addEventListener('input', (e) => {
        item.url = e.target.value;
        clearTimeout(urlDebounceTimer);
        urlDebounceTimer = setTimeout(() => {
          onUrlChanged(e.target.value);
        }, 350);
      });

      urlInput.addEventListener('change', (e) => {
        clearTimeout(urlDebounceTimer);
        onUrlChanged(e.target.value);
      });

      urlInput.addEventListener('paste', () => {
        setTimeout(() => {
          clearTimeout(urlDebounceTimer);
          onUrlChanged(urlInput.value);
        }, 20);
      });
    }

    // Button actions
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.dataset.action;

      if (act === 'pick-icon') {
        openIconPickerModal(item.id);
      } else if (act === 'delete-card') {
        deleteCard(item.id);
      }
    });

    // Drag and drop reordering
    card.addEventListener('dragstart', (e) => {
      if (!isHandleGrabbed) {
        e.preventDefault();
        card.draggable = false;
        return;
      }
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      card.classList.add('is-dragging');
    });

    card.addEventListener('dragend', () => {
      isHandleGrabbed = false;
      card.draggable = false;
      card.classList.remove('is-dragging');
      document.querySelectorAll('.links-card-slot').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
    });

    card.addEventListener('mouseup', () => {
      isHandleGrabbed = false;
      if (card.draggable) card.draggable = false;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      card.classList.toggle('drag-over-top', e.clientY < mid);
      card.classList.toggle('drag-over-bottom', e.clientY >= mid);
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      const srcIdx = dragSrcIndex;
      if (srcIdx >= 0 && srcIdx !== index) {
        moveCard(srcIdx, index);
      }
    });

    return card;
  }

  function moveCard(fromIdx, toIdx) {
    const draft = getLinksDraft();
    const items = draft.linksData.items;
    if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    scheduleSaveLinks();
    renderLinksStudio();
  }

  function deleteCard(cardId) {
    const draft = getLinksDraft();
    const item = (draft.linksData.items || []).find(i => i.id === cardId);
    const itemTitle = (item && (item.title || item.url)) ? ` "${item.title || item.url}"` : '';
    if (!window.confirm(`Are you sure you want to delete${itemTitle}?`)) {
      return;
    }
    draft.linksData.items = (draft.linksData.items || []).filter(i => i.id !== cardId);
    scheduleSaveLinks();
    renderLinksStudio();
    updateLiveDevicePreview(draft);
  }

  function addEmptyCard() {
    const draft = getLinksDraft();
    draft.linksData.items = draft.linksData.items || [];
    const newId = 'link_' + Date.now().toString(36);
    draft.linksData.items.push({
      id: newId,
      title: 'New Link',
      subtitle: '',
      url: 'https://',
      icon: 'link',
      enabled: true
    });
    scheduleSaveLinks();
    renderLinksStudio();

    setTimeout(() => {
      const newCard = document.querySelector(`.links-card-slot[data-id="${newId}"]`);
      if (newCard) {
        newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const urlInp = newCard.querySelector('.links-card-url-input');
        if (urlInp) {
          urlInp.focus();
          urlInp.select();
        }
      }
    }, 50);
  }

  // Automatic Logo & Metadata Extraction from URL
  async function enhanceCardFromUrl(item, cardEl, rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url || url === 'https://' || url === 'http://') {
      if (!item.customIcon) {
        item.icon = 'link';
        updateCardIconInDom(cardEl, item.icon);
        updateLiveDevicePreview(getLinksDraft());
      }
      return;
    }

    const cfg = window.projectConfig || {};
    const siteTitle = (cfg.design?.branding?.siteTitle) || cfg.name || 'Cedar';
    const siteLogo = (cfg.design?.branding?.generalLogo) || 'images/Lamp.png';

    // 1. Check if local/internal blog link
    const isInternalBlog = url === '/blog/' || url === '/blog' || url === 'blog' || url === '/' ||
      (cfg.domain && url.includes(cfg.domain) && url.includes('blog'));

    if (isInternalBlog) {
      if (!item.customIcon) {
        item.icon = siteLogo;
      }
      if (!item.title || item.title === 'New Link' || item.title === 'Website') {
        item.title = `${siteTitle} Blog`;
        const titleInp = cardEl.querySelector('.links-card-title-input');
        if (titleInp && !titleInp.matches(':focus')) titleInp.value = item.title;
      }
      if (!item.subtitle || item.subtitle === 'blog' || item.subtitle === '/blog/') {
        item.subtitle = 'Latest essays and stories';
        const subInp = cardEl.querySelector('.links-card-subtitle-input');
        if (subInp && !subInp.matches(':focus')) subInp.value = item.subtitle;
      }
      updateCardIconInDom(cardEl, item.icon);
      updateLiveDevicePreview(getLinksDraft());
      scheduleSaveLinks();
      return;
    }

    // 2. Normalize external URL and clean duplicate protocols
    url = url.trim().replace(/^(https?:\/\/)+/i, 'https://');
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      url = 'https://' + url;
    }

    let domain = '';
    try {
      const u = new URL(url);
      domain = u.hostname.replace(/^www\./i, '');
    } catch (e) {
      domain = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }

    if (!domain) return;

    // Check built-in brand rules
    const brandRule = DOMAIN_RULES.find(r => r.match.test(url) || (domain && r.match.test(domain)));
    const defaultName = domain.split('.')[0];
    const capitalizedDomain = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
    const autoTitle = brandRule ? brandRule.title : capitalizedDomain;

    const detectedHandle = extractHandleFromUrl(url);

    if (!item.title || item.title === 'New Link' || item.title === 'Website') {
      item.title = autoTitle;
      const titleInp = cardEl.querySelector('.links-card-title-input');
      if (titleInp && !titleInp.matches(':focus')) titleInp.value = item.title;
    }

    const defaultSubtitle = detectedHandle || (brandRule ? brandRule.subtitle : domain);

    const isGenericSubtitle = !item.subtitle ||
      item.subtitle === domain ||
      item.subtitle === 'https://' ||
      (brandRule && item.subtitle === brandRule.subtitle) ||
      (item.subtitle.startsWith('@') && detectedHandle && item.subtitle !== detectedHandle);

    if (isGenericSubtitle && defaultSubtitle) {
      item.subtitle = defaultSubtitle;
      const subInp = cardEl.querySelector('.links-card-subtitle-input');
      if (subInp && !subInp.matches(':focus')) subInp.value = item.subtitle;
    }

    // Pull logo from whatever the link gives! Prioritize built-in crisp SVG brand logos (YouTube, GitHub, etc.)
    if (!item.customIcon) {
      if (brandRule && brandRule.icon && BRAND_ICONS[brandRule.icon]) {
        item.icon = brandRule.icon;
      } else {
        // Step A: Immediately apply crisp 128px favicon/logo from domain (instant, zero delay)
        const instantFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
        item.icon = instantFavicon;
      }
      updateCardIconInDom(cardEl, item.icon);
      updateLiveDevicePreview(getLinksDraft());
      scheduleSaveLinks(true);

      // Step B: Query backend for high-res apple-touch-icon / html favicon / rich metadata for non-brands
      if ((!brandRule || !brandRule.icon) && (window.Cedar && window.Cedar.isLocalServer)) {
        try {
          const resp = await fetch(`/api/fetch-link-meta?url=${encodeURIComponent(url)}`, { method: 'GET' });
          if (resp.ok) {
            const meta = await resp.json();
            if (meta && meta.success && !item.customIcon) {
              let changed = false;
              if (meta.icon && meta.icon.startsWith('http')) {
                item.icon = meta.icon;
                changed = true;
              }
              if (meta.title && (!item.title || item.title === 'New Link' || item.title === capitalizedDomain)) {
                item.title = meta.title;
                const titleInp = cardEl.querySelector('.links-card-title-input');
                if (titleInp && !titleInp.matches(':focus')) titleInp.value = item.title;
                changed = true;
              }
              if (meta.subtitle && (!item.subtitle || item.subtitle === domain)) {
                if (!detectedHandle) {
                  item.subtitle = meta.subtitle;
                  const subInp = cardEl.querySelector('.links-card-subtitle-input');
                  if (subInp && !subInp.matches(':focus')) subInp.value = item.subtitle;
                  changed = true;
                }
              }
              if (changed) {
                updateCardIconInDom(cardEl, item.icon);
                updateLiveDevicePreview(getLinksDraft());
                scheduleSaveLinks();
              }
            }
          }
        } catch (err) {
          // Fallback instantFavicon is already working
        }
      }
    }

    scheduleSaveLinks();
    updateLiveDevicePreview(getLinksDraft());
  }

  // Automatic Link insertion (e.g. from clipboard paste)
  async function processAndAddUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) return;

    const draft = getLinksDraft();
    draft.linksData.items = draft.linksData.items || [];

    const newId = 'link_' + Date.now().toString(36);
    const newCard = {
      id: newId,
      title: 'New Link',
      subtitle: '',
      url: url,
      icon: 'link',
      enabled: true
    };

    draft.linksData.items.push(newCard);
    renderLinksStudio();

    const cardEl = document.querySelector(`.links-card-slot[data-id="${newId}"]`);
    if (cardEl) {
      await enhanceCardFromUrl(newCard, cardEl, url);
    }
    scheduleSaveLinks();

    if (typeof window.showToast === 'function') {
      window.showToast(`Added link: ${newCard.title}`);
    }
  }

  const LINKTREE_GRADIENTS = {
    sunset: 'linear-gradient(135deg, #1e1b4b 0%, #431407 50%, #18181b 100%)',
    aurora: 'linear-gradient(135deg, #022c22 0%, #064e3b 40%, #0f172a 100%)',
    cyber: 'linear-gradient(135deg, #2e0854 0%, #09090b 60%, #083344 100%)',
    midnight: 'radial-gradient(ellipse at top, #1e293b 0%, #09090b 100%)',
    candy: 'linear-gradient(135deg, #4a044e 0%, #1e1b4b 50%, #0369a1 100%)',
    amber: 'linear-gradient(135deg, #451a03 0%, #1c1917 100%)'
  };

  function applyMockupBackground(screen, design) {
    if (!screen) return;
    screen.classList.remove('linktree-pattern-grid', 'linktree-pattern-dots', 'linktree-pattern-stripes');
    screen.style.background = '';
    screen.style.backgroundColor = '';
    screen.style.backgroundImage = '';
    screen.style.backgroundSize = '';
    screen.style.backgroundPosition = '';
    if (!design) return;

    const { bgType, bgColor, bgGradient, bgPattern, bgImageUrl } = design;
    if (bgType === 'color' && bgColor) {
      screen.style.backgroundColor = bgColor;
      screen.style.setProperty('--phone-screen-bg', bgColor);
    } else if (bgType === 'gradient' && bgGradient) {
      const grad = LINKTREE_GRADIENTS[bgGradient] || bgGradient;
      screen.style.background = grad;
      screen.style.setProperty('--phone-screen-bg', '#0f172a');
    } else if (bgType === 'pattern' && bgPattern) {
      if (bgColor) screen.style.backgroundColor = bgColor;
      screen.classList.add(`linktree-pattern-${bgPattern}`);
      screen.style.setProperty('--phone-screen-bg', bgColor || '#0f172a');
    } else if (bgType === 'image' && bgImageUrl) {
      let resolved = bgImageUrl;
      if (window.imageRegistry && window.imageRegistry.has(resolved)) {
        resolved = window.imageRegistry.get(resolved).dataUrl || resolved;
      }
      screen.style.backgroundImage = `url('${resolved}')`;
      screen.style.backgroundSize = 'cover';
      screen.style.backgroundPosition = 'center';
      screen.style.setProperty('--phone-screen-bg', '#0f172a');
    }
  }

  // Real-time Live Phone Mockup Preview Renderer
  function updateLiveDevicePreview(draft) {
    const stage = document.getElementById('links-preview-stage');
    if (!stage) return;

    if (!draft) {
      draft = getLinksDraft();
    }
    if (!draft) return;

    sanitizeLinksDraft(draft);

    const data = draft.linksData || {};
    const profile = data.profile || {};
    const design = data.design || {};
    let cardStyle = design.cardStyle || 'rounded';
    if (cardStyle === 'ticket') cardStyle = 'holo';
    const cardStyleClass = `card-style-${cardStyle}`;
    const items = (data.items || []).filter(i => i && i.enabled !== false);
    const avatarSrc = resolveProfileAvatar(profile.avatar);
    const isHeadlineBlank = !profile.headline || !profile.headline.trim();
    const isBioBlank = !profile.bio || !profile.bio.trim();
    const headline = isHeadlineBlank ? 'Header' : profile.headline;
    const bio = isBioBlank ? 'Subtitle' : profile.bio;

    const screen = document.getElementById('links-device-screen');
    if (screen) {
      applyMockupBackground(screen, design);
    }

    let linksHtml = '';
    items.forEach(it => {
      const iconMarkup = renderCardIconHtml(it.icon);
      linksHtml += `
        <a href="${escapeHtml(it.url || '#')}" target="_blank" rel="noopener noreferrer" class="linktree-preview-btn popout-3d ${escapeHtml(cardStyleClass)}">
          <div class="linktree-btn-icon">${iconMarkup}</div>
          <div class="linktree-btn-content">
            <span class="linktree-btn-title">${escapeHtml(it.title || 'Link')}</span>
            ${it.subtitle ? `<span class="linktree-btn-sub">${escapeHtml(it.subtitle)}</span>` : ''}
          </div>
        </a>
      `;
    });

    stage.innerHTML = `
      <div class="linktree-phone-body">
        <div class="linktree-profile-head">
          ${avatarSrc ? `<img src="${escapeHtml(avatarSrc)}" alt="" class="linktree-profile-avatar" onerror="this.style.display='none';">` : ''}
          <h2 class="linktree-profile-headline ${isHeadlineBlank ? 'is-preview-placeholder' : ''}">${escapeHtml(headline)}</h2>
          <p class="linktree-profile-bio ${isBioBlank ? 'is-preview-placeholder' : ''}">${escapeHtml(bio)}</p>
        </div>

        <div class="linktree-buttons-stack">
          ${linksHtml || '<div class="linktree-no-links-msg">No active links</div>'}
        </div>
      </div>
    `;
  }

  // Autosave and Syncing
  function scheduleSaveLinks(quick = false) {
    const badge = document.getElementById('links-save-status');
    const dot = document.getElementById('links-save-status-dot');
    const bar = document.getElementById('links-draft-status-bar');
    if (badge) {
      badge.textContent = 'Saving...';
    }
    if (dot) {
      dot.classList.add('saving');
    }
    if (bar) {
      bar.classList.remove('is-saved');
      bar.classList.add('is-unsaved');
    }

    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveLinksData();
    }, quick ? 300 : 800);
  }

  function saveLinksData() {
    const draft = getLinksDraft();
    if (!draft) return;

    draft.type = 'page';
    draft.id = 'page_links';
    draft.slug = 'links';
    draft.title = 'Links';
    delete draft.coverImage;
    delete draft.featuredImage;

    sanitizeLinksDraft(draft);
    window.currentDraft = draft;

    draft.updatedAt = Date.now();
    if (typeof window.generateLinksPageData === 'function') {
      const generated = window.generateLinksPageData(draft.linksData, window.projectConfig);
      draft.markdown = generated.markdown;
      draft.proseHtml = generated.proseHtml;
    }

    // Save into localStorage
    if (typeof window.saveDraftsToStorage === 'function') {
      window.saveDraftsToStorage();
    }

    // Sync to vault if connected
    if (window.SheeshVault && typeof window.SheeshVault.isConnected === 'function' && window.SheeshVault.isConnected() && typeof window.SheeshVault.copyBlogToFolder === 'function') {
      window.SheeshVault.copyBlogToFolder(window.SheeshVault.getRootHandle()).catch(() => {});
    }

    const badge = document.getElementById('links-save-status');
    const dot = document.getElementById('links-save-status-dot');
    const bar = document.getElementById('links-draft-status-bar');
    if (badge) {
      badge.textContent = 'Saved';
    }
    if (dot) {
      dot.classList.remove('saving');
    }
    if (bar) {
      bar.classList.remove('is-unsaved');
      bar.classList.add('is-saved');
    }

    // Update real-time preview frame
    updateLiveDevicePreview(draft);
  }

  // Icon Picker Modal Logic
  function openIconPickerModal(cardId) {
    currentEditingCardId = cardId;
    const modal = document.getElementById('modal-links-icon-picker');
    if (!modal) return;

    // Explicitly bind close button
    const closeBtn = document.getElementById('btn-close-icon-picker');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeIconPickerModal();
      };
    }

    // Explicitly bind overlay backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeIconPickerModal();
      }
    };

    // Explicitly bind modal tabs
    modal.querySelectorAll('.links-icon-tab').forEach(tabBtn => {
      tabBtn.onclick = (e) => {
        e.preventDefault();
        modal.querySelectorAll('.links-icon-tab').forEach(t => t.classList.remove('is-active'));
        tabBtn.classList.add('is-active');
        const tabName = tabBtn.dataset.tab;
        const presetsTab = document.getElementById('icon-tab-presets');
        const uploadTab = document.getElementById('icon-tab-upload');
        const customUrlTab = document.getElementById('icon-tab-custom-url');
        const autoTab = document.getElementById('icon-tab-auto');

        if (presetsTab) presetsTab.style.display = tabName === 'presets' ? 'block' : 'none';
        if (uploadTab) uploadTab.style.display = tabName === 'upload' ? 'block' : 'none';
        if (customUrlTab) customUrlTab.style.display = tabName === 'custom-url' ? 'block' : 'none';
        if (autoTab) autoTab.style.display = tabName === 'auto' ? 'block' : 'none';
      };
    });

    // Auto-detect Icon from URL action
    const applyAutoBtn = document.getElementById('btn-apply-auto-icon');
    if (applyAutoBtn) {
      applyAutoBtn.onclick = (e) => {
        e.preventDefault();
        if (!currentEditingCardId) return;
        const draft = getLinksDraft();
        const item = (draft.linksData.items || []).find(i => i.id === currentEditingCardId);
        if (item) {
          delete item.customIcon;
          const cardEl = document.querySelector(`.links-card-slot[data-id="${item.id}"]`);
          if (cardEl) {
            enhanceCardFromUrl(item, cardEl, item.url || '');
          }
          closeIconPickerModal();
          renderLinksStudio();
          scheduleSaveLinks();
          if (typeof window.showToast === 'function') {
            window.showToast('Pulling logo automatically from card URL');
          }
        }
      };
    }

    // Custom Icon Upload
    const pickCustomIconBtn = document.getElementById('btn-pick-custom-icon-file');
    const customIconFileInput = document.getElementById('input-custom-icon-file');
    if (pickCustomIconBtn && customIconFileInput) {
      pickCustomIconBtn.onclick = (e) => {
        e.preventDefault();
        customIconFileInput.click();
      };
      customIconFileInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fn = `link_icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.webp`;
        if (typeof window.saveLinkMediaAsset === 'function') {
          const media = await window.saveLinkMediaAsset(fn, file, 'Link Icon');
          applyIconToCurrentCard(media.relativePath || media.filename);
          closeIconPickerModal();
          if (typeof window.showToast === 'function') {
            window.showToast('Saved custom link icon to media/links/');
          }
        }
        customIconFileInput.value = '';
      };
    }

    // Custom Icon URL
    const applyIconUrlBtn = document.getElementById('btn-apply-custom-icon-url');
    const customIconUrlInput = document.getElementById('input-icon-custom-url');
    if (applyIconUrlBtn && customIconUrlInput) {
      applyIconUrlBtn.onclick = (e) => {
        e.preventDefault();
        const urlVal = customIconUrlInput.value.trim();
        if (urlVal) {
          applyIconToCurrentCard(urlVal);
          customIconUrlInput.value = '';
          closeIconPickerModal();
        }
      };
    }

    // Render presets grid
    const grid = document.getElementById('links-preset-icons-grid');
    if (grid) {
      grid.innerHTML = '';
      Object.keys(BRAND_ICONS).forEach(key => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'links-preset-icon-chip';
        item.dataset.key = key;
        item.innerHTML = `
          <div class="links-chip-icon">${BRAND_ICONS[key]}</div>
          <span class="links-chip-label">${key.toUpperCase()}</span>
        `;
        item.onclick = (e) => {
          e.preventDefault();
          applyIconToCurrentCard(key);
          closeIconPickerModal();
        };
        grid.appendChild(item);
      });
    }

    modal.style.display = 'flex';
  }

  function closeIconPickerModal() {
    const modal = document.getElementById('modal-links-icon-picker');
    if (modal) modal.style.display = 'none';
    currentEditingCardId = null;
  }

  // Global listeners for closing modal (Escape key & backdrop/button delegation)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modal-links-icon-picker');
      if (modal && modal.style.display !== 'none') {
        closeIconPickerModal();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-close-icon-picker') || e.target.closest('[data-action="close-modal"]')) {
      e.preventDefault();
      closeIconPickerModal();
      return;
    }
    const modal = document.getElementById('modal-links-icon-picker');
    if (modal && modal.style.display !== 'none' && e.target === modal) {
      closeIconPickerModal();
    }
  });

  function applyIconToCurrentCard(iconValue) {
    if (!currentEditingCardId) return;
    const draft = getLinksDraft();
    const item = (draft.linksData.items || []).find(i => i.id === currentEditingCardId);
    if (item) {
      item.icon = iconValue;
      item.customIcon = true;
      renderLinksStudio();
      scheduleSaveLinks();
    }
  }

  function initLinksStudioEvents() {
    // 1. Profile Inputs
    const headlineInput = document.getElementById('input-links-headline');
    const bioInput = document.getElementById('input-links-bio');

    if (headlineInput) {
      headlineInput.addEventListener('input', (e) => {
        const draft = getLinksDraft();
        draft.linksData.profile.headline = e.target.value;
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    }

    if (bioInput) {
      bioInput.addEventListener('input', (e) => {
        const draft = getLinksDraft();
        draft.linksData.profile.bio = e.target.value;
        draft.subtitle = e.target.value;
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    }

    // 2. Avatar actions (media/links/ folder storage)
    const avatarBtn = document.getElementById('links-avatar-preview-btn');
    const uploadAvatarBtn = document.getElementById('btn-links-upload-avatar');
    const resetAvatarBtn = document.getElementById('btn-links-reset-avatar');
    const fileInput = document.getElementById('links-avatar-file-input');

    if (avatarBtn && fileInput) {
      avatarBtn.addEventListener('click', () => fileInput.click());
    }
    if (uploadAvatarBtn && fileInput) {
      uploadAvatarBtn.addEventListener('click', () => fileInput.click());
    }
    if (resetAvatarBtn) {
      resetAvatarBtn.addEventListener('click', () => {
        const draft = getLinksDraft();
        draft.linksData.profile.avatar = '';
        renderLinksStudio();
        updateLiveDevicePreview(draft);
        scheduleSaveLinks();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fn = `links_avatar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.webp`;
        if (typeof window.saveLinkMediaAsset === 'function') {
          const media = await window.saveLinkMediaAsset(fn, file, 'Links Profile Photo');
          const draft = getLinksDraft();
          draft.linksData.profile.avatar = media.relativePath || media.filename;
          renderLinksStudio();
          updateLiveDevicePreview(draft);
          scheduleSaveLinks();
          if (typeof window.showToast === 'function') {
            window.showToast('Updated Links profile photo in media/links/');
          }
        }
        fileInput.value = '';
      });
    }

    // 3. Card Style Chips
    document.querySelectorAll('.links-card-style-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.cardStyle = chip.dataset.cardStyle || 'rounded';
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    });

    // 4. Background Tabs
    document.querySelectorAll('.links-bg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = tab.dataset.bgType || 'color';
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    });

    // 5. Solid Color Presets
    document.querySelectorAll('.links-color-chip:not(.links-color-chip-custom)').forEach(chip => {
      chip.addEventListener('click', () => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = 'color';
        draft.linksData.design.bgColor = chip.dataset.color || '';
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    });

    const customColorInput = document.getElementById('input-links-bg-color');
    const colorPicker = document.getElementById('input-links-bg-color-picker');
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = 'color';
        draft.linksData.design.bgColor = e.target.value;
        if (customColorInput) customColorInput.value = e.target.value;
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    }
    if (customColorInput) {
      customColorInput.addEventListener('input', (e) => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = 'color';
        draft.linksData.design.bgColor = e.target.value;
        if (colorPicker && /^#[0-9a-f]{6}$/i.test(e.target.value)) {
          colorPicker.value = e.target.value;
        }
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    }

    // 6. Gradients
    document.querySelectorAll('.links-gradient-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = 'gradient';
        draft.linksData.design.bgGradient = chip.dataset.gradient || 'sunset';
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    });

    // 7. Patterns
    document.querySelectorAll('.links-pattern-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = 'pattern';
        draft.linksData.design.bgPattern = chip.dataset.pattern || 'grid';
        renderLinksStudio(draft);
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    });

    // 8. Wallpaper Upload & URL
    const uploadBgBtn = document.getElementById('btn-links-upload-bg-image');
    const changeBgBtn = document.getElementById('btn-links-change-bg-image');
    const emptyDropzone = document.getElementById('links-wallpaper-empty-dropzone');
    const bgFileInput = document.getElementById('input-links-bg-image-file');
    const bgUrlInput = document.getElementById('input-links-bg-image-url');
    const clearBgBtn = document.getElementById('btn-links-clear-bg-image');
    const clearBgUrlBtn = document.getElementById('btn-links-clear-bg-url');

    if (uploadBgBtn && bgFileInput) {
      uploadBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bgFileInput.click();
      });
    }
    if (changeBgBtn && bgFileInput) {
      changeBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bgFileInput.click();
      });
    }
    if (emptyDropzone && bgFileInput) {
      emptyDropzone.addEventListener('click', (e) => {
        if (e.target.closest('#btn-links-upload-bg-image')) return;
        bgFileInput.click();
      });
      emptyDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        emptyDropzone.classList.add('dragover');
      });
      emptyDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        emptyDropzone.classList.remove('dragover');
      });
      emptyDropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        emptyDropzone.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const fn = `links_wallpaper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.webp`;
        if (typeof window.saveLinkMediaAsset === 'function') {
          const media = await window.saveLinkMediaAsset(fn, file, 'Links Wallpaper');
          const draft = getLinksDraft();
          if (!draft.linksData.design) draft.linksData.design = {};
          draft.linksData.design.bgType = 'image';
          draft.linksData.design.bgImageUrl = media.relativePath || media.filename;
          renderLinksStudio(draft);
          updateLiveDevicePreview(draft);
          scheduleSaveLinks();
          if (typeof window.showToast === 'function') {
            window.showToast('Updated Links wallpaper in media/links/');
          }
        }
      });
    }
    if (bgFileInput) {
      bgFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fn = `links_wallpaper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.webp`;
        if (typeof window.saveLinkMediaAsset === 'function') {
          const media = await window.saveLinkMediaAsset(fn, file, 'Links Wallpaper');
          const draft = getLinksDraft();
          if (!draft.linksData.design) draft.linksData.design = {};
          draft.linksData.design.bgType = 'image';
          draft.linksData.design.bgImageUrl = media.relativePath || media.filename;
          renderLinksStudio(draft);
          updateLiveDevicePreview(draft);
          scheduleSaveLinks();
          if (typeof window.showToast === 'function') {
            window.showToast('Updated Links wallpaper in media/links/');
          }
        }
        bgFileInput.value = '';
      });
    }
    if (bgUrlInput) {
      bgUrlInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (clearBgUrlBtn) clearBgUrlBtn.style.display = val ? 'flex' : 'none';
        const draft = getLinksDraft();
        if (!draft.linksData.design) draft.linksData.design = {};
        draft.linksData.design.bgType = 'image';
        draft.linksData.design.bgImageUrl = val;

        const bgImgThumb = document.getElementById('links-bg-image-preview-thumb');
        const bgImgPreviewWrap = document.getElementById('links-wallpaper-preview-wrap');
        const bgImgEmptyDropzone = document.getElementById('links-wallpaper-empty-dropzone');
        const bgImgRemoveBtn = document.getElementById('btn-links-clear-bg-image');
        if (val) {
          if (bgImgThumb) bgImgThumb.style.backgroundImage = `url('${val}')`;
          if (bgImgPreviewWrap) bgImgPreviewWrap.style.display = 'block';
          if (bgImgEmptyDropzone) bgImgEmptyDropzone.style.display = 'none';
          if (bgImgRemoveBtn) bgImgRemoveBtn.style.display = 'inline-flex';
        } else {
          if (bgImgThumb) bgImgThumb.style.backgroundImage = 'none';
          if (bgImgPreviewWrap) bgImgPreviewWrap.style.display = 'none';
          if (bgImgEmptyDropzone) bgImgEmptyDropzone.style.display = 'flex';
          if (bgImgRemoveBtn) bgImgRemoveBtn.style.display = 'none';
        }
        updateLiveDevicePreview(draft);
        scheduleSaveLinks(true);
      });
    }
    if (clearBgUrlBtn && bgUrlInput) {
      clearBgUrlBtn.addEventListener('click', () => {
        bgUrlInput.value = '';
        bgUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    if (clearBgBtn) {
      clearBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const draft = getLinksDraft();
        if (draft.linksData && draft.linksData.design) {
          draft.linksData.design.bgImageUrl = '';
          renderLinksStudio(draft);
          updateLiveDevicePreview(draft);
          scheduleSaveLinks();
        }
      });
    }

    // 9. Global paste listener when #view-links is active
    window.addEventListener('paste', (e) => {
      const linksView = document.getElementById('view-links');
      if (!linksView || linksView.style.display === 'none') return;
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return; // Don't intercept normal typing into inputs
      }

      const pastedText = e.clipboardData?.getData('text/plain') || '';
      if (pastedText && /^(https?:\/\/|\/|www\.)/i.test(pastedText.trim())) {
        e.preventDefault();
        processAndAddUrl(pastedText.trim());
      }
    });

    // 4. Add Card Buttons
    const addCardBottomBtn = document.getElementById('btn-links-add-card-bottom');
    if (addCardBottomBtn) {
      addCardBottomBtn.addEventListener('click', () => addEmptyCard());
    }

    const addCardBtn = document.getElementById('btn-links-add-card');
    if (addCardBtn) {
      addCardBtn.addEventListener('click', () => addEmptyCard());
    }

    // 5. Modal close button & dead-space click
    const closePickerBtn = document.getElementById('btn-close-icon-picker');
    const pickerModal = document.getElementById('modal-links-icon-picker');
    if (closePickerBtn) {
      closePickerBtn.addEventListener('click', closeIconPickerModal);
    }
    if (pickerModal) {
      pickerModal.addEventListener('click', (e) => {
        if (e.target === pickerModal) closeIconPickerModal();
      });
    }

    // Icon Modal Tab switching
    document.querySelectorAll('.links-icon-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.links-icon-tab').forEach(t => t.classList.remove('is-active'));
        tabBtn.classList.add('is-active');
        const tabName = tabBtn.dataset.tab;
        const presetsTab = document.getElementById('icon-tab-presets');
        const uploadTab = document.getElementById('icon-tab-upload');
        const customUrlTab = document.getElementById('icon-tab-custom-url');
        const autoTab = document.getElementById('icon-tab-auto');

        if (presetsTab) presetsTab.style.display = tabName === 'presets' ? 'block' : 'none';
        if (uploadTab) uploadTab.style.display = tabName === 'upload' ? 'block' : 'none';
        if (customUrlTab) customUrlTab.style.display = tabName === 'custom-url' ? 'block' : 'none';
        if (autoTab) autoTab.style.display = tabName === 'auto' ? 'block' : 'none';
      });
    });

    // Auto-detect Icon from URL Tab Action
    const applyAutoBtn = document.getElementById('btn-apply-auto-icon');
    if (applyAutoBtn) {
      applyAutoBtn.addEventListener('click', () => {
        if (!currentEditingCardId) return;
        const draft = getLinksDraft();
        const item = (draft.linksData.items || []).find(i => i.id === currentEditingCardId);
        if (item) {
          delete item.customIcon;
          const cardEl = document.querySelector(`.links-card-slot[data-id="${item.id}"]`);
          if (cardEl) {
            enhanceCardFromUrl(item, cardEl, item.url || '');
          }
          closeIconPickerModal();
          renderLinksStudio();
          scheduleSaveLinks();
          if (typeof window.showToast === 'function') {
            window.showToast('Pulling logo automatically from card URL');
          }
        }
      });
    }

    // Custom Icon Upload
    const pickCustomIconBtn = document.getElementById('btn-pick-custom-icon-file');
    const customIconFileInput = document.getElementById('input-custom-icon-file');
    if (pickCustomIconBtn && customIconFileInput) {
      pickCustomIconBtn.addEventListener('click', () => customIconFileInput.click());
      customIconFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fn = `link_icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.webp`;
        if (typeof window.saveLinkMediaAsset === 'function') {
          const media = await window.saveLinkMediaAsset(fn, file, 'Link Icon');
          applyIconToCurrentCard(media.relativePath || media.filename);
          closeIconPickerModal();
          if (typeof window.showToast === 'function') {
            window.showToast('Saved custom link icon to media/links/');
          }
        }
        customIconFileInput.value = '';
      });
    }

    // Custom Icon URL
    const applyIconUrlBtn = document.getElementById('btn-apply-custom-icon-url');
    const customIconUrlInput = document.getElementById('input-icon-custom-url');
    if (applyIconUrlBtn && customIconUrlInput) {
      applyIconUrlBtn.addEventListener('click', () => {
        const urlVal = customIconUrlInput.value.trim();
        if (urlVal) {
          applyIconToCurrentCard(urlVal);
          customIconUrlInput.value = '';
          closeIconPickerModal();
        }
      });
    }

    // Visibility toggle (Unhide / Hide)
    const toggleVisBtn = document.getElementById('btn-links-toggle-visibility');
    if (toggleVisBtn) {
      toggleVisBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.toggleLinksPageVisibility === 'function') {
          window.toggleLinksPageVisibility();
        } else {
          const draft = getLinksDraft();
          const isHidden = Boolean(draft.hidden || draft.retired);
          draft.hidden = !isHidden;
          draft.retired = !isHidden;
          draft.status = 'published';
          updateLinksVisibilityBadge(draft);
          scheduleSaveLinks();
          if (typeof window.showToast === 'function') {
            window.showToast(draft.hidden ? 'Links page is now Hidden' : 'Links page is now Published');
          }
        }
      });
    }

    // Preview button flushes changes immediately before opening tab
    const previewBtn = document.getElementById('btn-links-preview-tab');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        saveLinksData();
      });
    }
  }

  // Hook into updateLinksViewUI
  const origUpdateLinksViewUI = window.updateLinksViewUI;
  window.updateLinksViewUI = function() {
    if (typeof origUpdateLinksViewUI === 'function') {
      try { origUpdateLinksViewUI(); } catch (e) {}
    }
    renderLinksStudio();
  };

  // Expose API
  window.renderLinksStudio = renderLinksStudio;
  window.closeLinksIconPicker = closeIconPickerModal;
  window.Cedar = window.Cedar || {};
  window.Cedar.links = {
    render: renderLinksStudio,
    save: saveLinksData,
    processUrl: processAndAddUrl,
    addEmptyCard: addEmptyCard,
    openIconPicker: openIconPickerModal,
    closeIconPicker: closeIconPickerModal
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLinksStudioEvents);
  } else {
    initLinksStudioEvents();
  }

})();
