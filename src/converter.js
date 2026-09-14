/**
 * HTML to Markdown converter tailored for Starlight documentation
 */
import TurndownService from 'turndown';
import { formatFrontmatter, cleanHeading } from './utils.js';

/**
 * Initialize and configure TurndownService with Starlight rules.
 *
 * @param {any} [CustomTurndown]
 * @returns {TurndownService}
 */
export function createStarlightTurndown(CustomTurndown) {
  const Service =
    CustomTurndown ||
    (typeof TurndownService !== 'undefined' ? TurndownService : null) ||
    (typeof window !== 'undefined' ? window.TurndownService : null) ||
    (typeof globalThis !== 'undefined' ? globalThis.TurndownService : null);

  if (!Service) {
    throw new Error('TurndownService is not loaded.');
  }

  const turndown = new Service({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });

  // 1. Remove UI noise and non-content elements
  turndown.remove([
    'script',
    'style',
    'noscript',
    'template',
    'starlight-toc',
    'mobile-starlight-toc',
    'site-search',
    'starlight-theme-select',
    'starlight-lang-select',
    '.pagination-links',
    '.sl-skip-link',
    '.right-sidebar-container',
    'nav.sidebar',
    'sl-sidebar-pane',
    'button[data-copy]',
    '.copy-icon',
    '.sr-only',
    '[data-pagefind-ignore]',
    'footer'
  ]);

  // Strip section permalink anchor links e.g. [Section titled "Foo"](#foo) or [#](#foo)
  turndown.addRule('stripSectionAnchors', {
    filter: (node) => {
      if (node.nodeType === 1 && node.tagName.toLowerCase() === 'a') {
        const href = node.getAttribute('href') || '';
        const text = node.textContent?.trim() || '';
        if (href.startsWith('#') && (text.startsWith('Section titled') || !text || /^([#🔗¶§]+)$/.test(text))) {
          return true;
        }
      }
      return false;
    },
    replacement: () => ''
  });

  // 2. Expressive Code Frame rule
  turndown.addRule('starlightExpressiveCode', {
    filter: (node) => {
      return (
        node.nodeType === 1 &&
        (node.classList?.contains('expressive-code') ||
         node.tagName.toLowerCase() === 'figure' && node.classList?.contains('frame'))
      );
    },
    replacement: (content, node) => {
      // Find title if present
      const titleEl = node.querySelector('.header .title, figcaption .title');
      const title = titleEl?.textContent?.trim() || '';

      // Find code element
      const preEl = node.querySelector('pre');
      const codeEl = node.querySelector('code');
      const lang =
        preEl?.getAttribute('data-language') ||
        codeEl?.getAttribute('data-language') ||
        codeEl?.className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1] ||
        preEl?.className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1] ||
        '';

      // Extract code lines
      let codeText = '';
      const ecLines = node.querySelectorAll('.ec-line');
      if (ecLines.length > 0) {
        codeText = Array.from(ecLines)
          .map(line => line.textContent.replace(/\u00A0/g, ' '))
          .join('\n');
      } else if (codeEl) {
        codeText = codeEl.textContent.replace(/\u00A0/g, ' ');
      } else if (preEl) {
        codeText = preEl.textContent.replace(/\u00A0/g, ' ');
      } else {
        codeText = content;
      }

      // Format code header annotation
      const titleAttr = title ? ` title="${title}"` : '';
      return `\n\n\`\`\`${lang}${titleAttr}\n${codeText.trimEnd()}\n\`\`\`\n\n`;
    }
  });

  // 3. Starlight Asides / Callouts (convert to GitHub Alert syntax)
  turndown.addRule('starlightAsides', {
    filter: (node) => {
      return (
        node.nodeType === 1 &&
        (node.tagName.toLowerCase() === 'aside' || node.classList?.contains('starlight-aside')) &&
        !node.classList?.contains('right-sidebar-container')
      );
    },
    replacement: (content, node) => {
      let type = 'NOTE';
      const classList = Array.from(node.classList || []);
      for (const cls of classList) {
        if (cls.includes('tip')) type = 'TIP';
        else if (cls.includes('caution')) type = 'CAUTION';
        else if (cls.includes('danger')) type = 'CAUTION';
        else if (cls.includes('warning')) type = 'WARNING';
      }

      const titleEl = node.querySelector('.starlight-aside__title, p.starlight-aside__title');
      const customTitle = titleEl ? cleanHeading(titleEl.textContent) : '';

      // Remove title element text from content if already included
      let cleanContent = content.trim();
      if (customTitle && cleanContent.startsWith(customTitle)) {
        cleanContent = cleanContent.slice(customTitle.length).trim();
      }

      const lines = cleanContent.split('\n');
      const quoted = lines.map(line => `> ${line}`).join('\n');

      return `\n\n> [!${type}]${customTitle ? ` **${customTitle}**` : ''}\n${quoted}\n\n`;
    }
  });

  // 4. Starlight Tabs rule
  turndown.addRule('starlightTabs', {
    filter: (node) => {
      return (
        node.nodeType === 1 &&
        (node.tagName.toLowerCase() === 'starlight-tabs' || node.classList?.contains('starlight-tabs'))
      );
    },
    replacement: (content, node) => {
      const tabs = Array.from(node.querySelectorAll('[role="tab"]'));
      const panels = Array.from(node.querySelectorAll('[role="tabpanel"]'));

      let result = '\n\n';
      panels.forEach((panel, i) => {
        const tabLabel = tabs[i]?.textContent?.trim() || `Tab ${i + 1}`;
        const panelMarkdown = turndown.turndown(panel.innerHTML);
        result += `**Tab: ${tabLabel}**\n\n${panelMarkdown.trim()}\n\n`;
      });

      return result;
    }
  });

  // 5. Starlight Link Cards
  turndown.addRule('starlightLinkCard', {
    filter: (node) => {
      return node.nodeType === 1 && node.classList?.contains('sl-link-card');
    },
    replacement: (content, node) => {
      const a = node.querySelector('a');
      const titleEl = node.querySelector('.title') || a;
      const descEl = node.querySelector('.description');

      const title = titleEl?.textContent?.trim() || 'Link';
      const href = a?.getAttribute('href') || '#';
      const desc = descEl?.textContent?.trim() || '';

      return `\n\n- [**${title}**](${href})${desc ? `: ${desc}` : ''}\n\n`;
    }
  });

  // 6. Starlight Badges
  turndown.addRule('starlightBadge', {
    filter: (node) => {
      return node.nodeType === 1 && node.classList?.contains('sl-badge');
    },
    replacement: (content, node) => {
      const text = node.textContent?.trim() || '';
      return text ? ` \`${text}\` ` : '';
    }
  });

  // 7. Full GFM Markdown Tables
  turndown.addRule('gfmTable', {
    filter: 'table',
    replacement: (content, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return content;

      const tableLines = [];
      let colCount = 0;

      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.children).filter(el => el.tagName === 'TH' || el.tagName === 'TD');
        if (cells.length === 0) return;
        if (cells.length > colCount) colCount = cells.length;

        const cellTexts = cells.map(cell => {
          const cellMd = turndown.turndown(cell.innerHTML);
          return cellMd.replace(/[\r\n\t]+/g, ' ').trim().replace(/\|/g, '\\|');
        });

        tableLines.push(`| ${cellTexts.join(' | ')} |`);

        // Insert GFM header separator row after the first row
        if (rowIndex === 0) {
          const alignments = cells.map(cell => {
            const align = cell.getAttribute('align') || cell.style?.textAlign;
            if (align === 'center') return ':---:';
            if (align === 'right') return '---:';
            return '---';
          });
          tableLines.push(`| ${alignments.join(' | ')} |`);
        }
      });

      return `\n\n${tableLines.join('\n')}\n\n`;
    }
  });

  return turndown;
}

/**
 * Convert a Starlight HTML content node or HTML string into clean Markdown.
 *
 * @param {Element | string} content
 * @param {object} metadata
 * @param {string} metadata.title
 * @param {string} [metadata.description]
 * @param {string} [metadata.source]
 * @param {string} [metadata.category]
 * @param {number} [metadata.order]
 * @param {any} [CustomTurndown]
 * @returns {string}
 */
export function convertToMarkdown(content, metadata = {}, CustomTurndown = null) {
  const turndown = createStarlightTurndown(CustomTurndown);

  let body = '';
  if (typeof content === 'string') {
    body = turndown.turndown(content);
  } else if (content && content.innerHTML) {
    body = turndown.turndown(content);
  }

  body = body.trim().replace(/\n{3,}/g, '\n\n');

  const includeFrontmatter = metadata.includeFrontmatter !== false && metadata.frontmatter !== false;

  const frontmatter = includeFrontmatter
    ? formatFrontmatter({
        title: metadata.title || 'Untitled',
        description: metadata.description || undefined,
        source: metadata.source || undefined,
        category: metadata.category || undefined,
        order: metadata.order !== undefined ? metadata.order : undefined
      })
    : '';

  const titleHeading = `# ${metadata.title || 'Untitled'}`;
  if (!body.startsWith('# ')) {
    return `${frontmatter}${titleHeading}\n\n${body}\n`;
  }

  return `${frontmatter}${body}\n`;
}
