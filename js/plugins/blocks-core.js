/**
 * Cedar Built-in Plugin: Core Blocks
 * Registers standard content blocks (Text, Quote, Codeblock, Divider, Headings).
 */
(function () {
  'use strict';

  const host = window.Cedar || window.Outpost;
  if (!host || !host.registerPlugin) return;

  host.registerPlugin({
    id: 'cedar-blocks-core',
    name: 'Core Content Blocks',
    version: '1.0.0',
    description: 'Provides standard text, blockquote, codeblock, and heading blocks.',

    init(api) {
      // 1. Text (Paragraph)
      api.blocks.register({
        id: 'text',
        label: 'Text',
        category: 'Standard',
        order: 1,
        isHeading: false,
        create(rawText) {
          const p = document.createElement('p');
          p.innerHTML = rawText ? api.ui.escapeHtml(rawText) : '<br>';
          return p;
        },
        toMarkdownString(rawText) {
          return rawText || '';
        }
      });

      // Alias 'p' -> 'text'
      api.blocks.register({
        id: 'p',
        label: 'Text',
        category: 'Standard',
        order: 2,
        isHeading: false,
        create(rawText) {
          return api.blocks.get('text').create(rawText);
        }
      });

      // 2. Quote (Blockquote)
      api.blocks.register({
        id: 'quote',
        label: 'Quote',
        category: 'Standard',
        order: 10,
        isHeading: false,
        create(rawText) {
          const b = document.createElement('blockquote');
          b.innerHTML = `<p>${rawText ? api.ui.escapeHtml(rawText) : 'Quote text here...'}</p>`;
          return b;
        },
        toMarkdownString(rawText) {
          return `> ${rawText || 'Quote text here...'}`;
        }
      });

      // 3. Codeblock
      api.blocks.register({
        id: 'codeblock',
        label: 'Code Block',
        category: 'Standard',
        order: 20,
        isHeading: false,
        create(rawText) {
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          code.textContent = rawText || '// Code here';
          pre.appendChild(code);
          return pre;
        },
        toMarkdownString(rawText) {
          return `\`\`\`\n${rawText || '// Code here'}\n\`\`\``;
        }
      });

      // 4. Divider (Horizontal Rule)
      api.blocks.register({
        id: 'hr',
        label: 'Divider',
        category: 'Standard',
        order: 30,
        isHeading: false,
        create() {
          const hr = document.createElement('hr');
          hr.style.cssText = 'border:0; border-top: 1px solid rgba(255,255,255,0.1); margin: 2.5rem 0;';
          return hr;
        },
        toMarkdownString() {
          return '\n---\n\n';
        }
      });

      // 5. Headings (Marked with isHeading: true so they are routed to Style menu, not Block Type menu)
      api.blocks.register({
        id: 'h2',
        label: 'Heading 2',
        category: 'Headings',
        order: 40,
        isHeading: true,
        create(rawText) {
          const h = document.createElement('h2');
          h.innerHTML = rawText ? api.ui.escapeHtml(rawText) : 'Heading 2';
          return h;
        },
        toMarkdownString(rawText) {
          return `## ${rawText || 'Heading 2'}`;
        }
      });

      api.blocks.register({
        id: 'h3',
        label: 'Heading 3',
        category: 'Headings',
        order: 41,
        isHeading: true,
        create(rawText) {
          const h = document.createElement('h3');
          h.innerHTML = rawText ? api.ui.escapeHtml(rawText) : 'Heading 3';
          return h;
        },
        toMarkdownString(rawText) {
          return `### ${rawText || 'Heading 3'}`;
        }
      });

      api.blocks.register({
        id: 'h4',
        label: 'Heading 4',
        category: 'Headings',
        order: 42,
        isHeading: true,
        create(rawText) {
          const h = document.createElement('h4');
          h.innerHTML = rawText ? api.ui.escapeHtml(rawText) : 'Heading 4';
          return h;
        },
        toMarkdownString(rawText) {
          return `#### ${rawText || 'Heading 4'}`;
        }
      });
    }
  });
})();
