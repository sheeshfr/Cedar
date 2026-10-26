/**
 * Cedar Built-in Plugin: Interactive Blocks
 * Registers CTA buttons, related links box, image galleries, and adjacent post navigation.
 */
(function () {
  'use strict';

  const host = window.Cedar || window.Outpost;
  if (!host || !host.registerPlugin) return;

  host.registerPlugin({
    id: 'cedar-blocks-interactive',
    name: 'Interactive Components',
    version: '1.0.0',
    description: 'Provides buttons, image galleries, and adjacent post navigation.',

    init(api) {
      // 1. Primary CTA Button
      api.blocks.register({
        id: 'insert-cta-btn',
        label: 'Primary CTA Button',
        category: 'Interactive',
        order: 60,
        isHeading: false,
        action() {
          const btnUrl = prompt('Enter button destination URL:', 'https://');
          if (btnUrl) {
            const btnText = prompt('Enter button label:', 'Click Here');
            if (typeof window.insertHtmlAtCursor === 'function') {
              window.insertHtmlAtCursor(`<div style="text-align:center; margin: 1.5rem 0;" contenteditable="false"><a href="${api.ui.escapeHtml(btnUrl)}" class="btn btn-primary" style="display:inline-block; padding: 0.6rem 1.4rem; font-weight:700; text-decoration:none; border-radius: 8px;">${api.ui.escapeHtml(btnText || 'Click Here')} &rarr;</a></div><p><br></p>`);
            }
          }
        }
      });

      // 2. Secondary Button
      api.blocks.register({
        id: 'insert-secondary-btn',
        label: 'Secondary Button',
        category: 'Interactive',
        order: 61,
        isHeading: false,
        action() {
          const secUrl = prompt('Enter button destination URL:', 'https://');
          if (secUrl) {
            const secText = prompt('Enter button label:', 'Read More');
            if (typeof window.insertHtmlAtCursor === 'function') {
              window.insertHtmlAtCursor(`<div style="text-align:center; margin: 1.5rem 0;" contenteditable="false"><a href="${api.ui.escapeHtml(secUrl)}" class="btn btn-secondary" style="display:inline-block; padding: 0.6rem 1.4rem; font-weight:600; text-decoration:none; border-radius: 8px;">${api.ui.escapeHtml(secText || 'Read More')}</a></div><p><br></p>`);
            }
          }
        }
      });

      // 3. Related Links Box
      api.blocks.register({
        id: 'insert-link-box',
        label: 'Related Links Box',
        category: 'Interactive',
        order: 62,
        isHeading: false,
        action() {
          if (typeof window.insertHtmlAtCursor === 'function') {
            window.insertHtmlAtCursor('<blockquote><p><em>*Check out our related articles:*<br/>- <a href="#">Related Article Title</a></em></p></blockquote><p><br></p>');
          }
        }
      });

      // 4. Image Gallery Modal Trigger
      api.blocks.register({
        id: 'open-gallery-modal',
        label: 'Image Gallery',
        category: 'Media',
        order: 70,
        isHeading: false,
        action() {
          const urlInput = document.getElementById('gallery-dialog-urls');
          const capInput = document.getElementById('gallery-dialog-caption');
          if (urlInput) urlInput.value = '';
          if (capInput) capInput.value = '';
          api.modals.open('modal-insert-gallery');
        }
      });

      // 5. Adjacent Posts Navigation Trigger
      api.blocks.register({
        id: 'open-adjacent-posts-modal',
        label: 'Next / Prev Nav',
        category: 'Navigation',
        order: 80,
        isHeading: false,
        action() {
          const pTitle = document.getElementById('dialog-nav-prev-title');
          const pSlug = document.getElementById('dialog-nav-prev-slug');
          const nTitle = document.getElementById('dialog-nav-next-title');
          const nSlug = document.getElementById('dialog-nav-next-slug');
          if (pTitle) pTitle.value = '';
          if (pSlug) pSlug.value = '';
          if (nTitle) nTitle.value = '';
          if (nSlug) nSlug.value = '';
          api.modals.open('modal-insert-adjacent-posts');
        }
      });
    }
  });
})();
