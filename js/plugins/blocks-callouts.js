/**
 * Cedar Built-in Plugin: Callouts
 * Registers Info Callout Box, Warning Box, and Tip Box blocks matching Markdown alerts.
 */
(function () {
  'use strict';

  const host = window.Cedar || window.Outpost;
  if (!host || !host.registerPlugin) return;

  host.registerPlugin({
    id: 'cedar-blocks-callouts',
    name: 'Callout Alert Boxes',
    version: '1.0.0',
    description: 'Provides GitHub and Sheesh-style [!NOTE], [!WARNING], and [!TIP] callout alert blocks.',

    init(api) {
      // 1. Info Callout Box
      api.blocks.register({
        id: 'callout-note',
        label: 'Info Callout Box',
        category: 'Callouts',
        order: 50,
        isHeading: false,
        create(rawText) {
          const b = document.createElement('blockquote');
          const noteContent = rawText || 'Add your informative note or tip here.';
          b.innerHTML = `<p><strong>[!NOTE]</strong><br/>${api.ui.escapeHtml(noteContent)}</p>`;
          return b;
        },
        toMarkdownString(rawText) {
          return `> [!NOTE]\n> ${rawText || 'Add your informative note or tip here.'}`;
        }
      });

      // 2. Warning Box
      api.blocks.register({
        id: 'callout-warning',
        label: 'Warning Box',
        category: 'Callouts',
        order: 51,
        isHeading: false,
        create(rawText) {
          const b = document.createElement('blockquote');
          const warnContent = rawText || 'Caution: Make sure to check your configuration before continuing.';
          b.innerHTML = `<p><strong>[!WARNING]</strong><br/>${api.ui.escapeHtml(warnContent)}</p>`;
          return b;
        },
        toMarkdownString(rawText) {
          return `> [!WARNING]\n> ${rawText || 'Caution: Make sure to check your configuration before continuing.'}`;
        }
      });

      // 3. Tip Box
      api.blocks.register({
        id: 'callout-tip',
        label: 'Tip Box',
        category: 'Callouts',
        order: 52,
        isHeading: false,
        create(rawText) {
          const b = document.createElement('blockquote');
          const tipContent = rawText || 'Helpful tip or shortcut here.';
          b.innerHTML = `<p><strong>[!TIP]</strong><br/>${api.ui.escapeHtml(tipContent)}</p>`;
          return b;
        },
        toMarkdownString(rawText) {
          return `> [!TIP]\n> ${rawText || 'Helpful tip or shortcut here.'}`;
        }
      });
    }
  });
})();
