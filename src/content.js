/**
 * starlight-to-md: Content Script
 * Runs in the context of the active documentation page.
 */

import { slugify, formatFrontmatter } from './utils.js';
import { isStarlightSite, getSiteTitle, extractSidebar, extractArticleContent } from './parser.js';
import { convertToMarkdown } from './converter.js';

(function () {
  if (window.__starlightToMdLoaded) return;
  window.__starlightToMdLoaded = true;

  let isBatchRunning = false;
  let batchCancelled = false;

  /**
   * Derive candidate .md URLs for a given doc page URL.
   * Checks both direct [path].md and [path]/index.md for directory root paths.
   *
   * @param {string} url
   * @returns {string[]}
   */
  function getRawMarkdownCandidates(url) {
    try {
      const parsed = new URL(url);
      parsed.search = '';
      parsed.hash = '';
      const pathname = parsed.pathname;

      if (pathname.endsWith('.md')) {
        return [parsed.toString()];
      }

      const trimmed = pathname.replace(/\/+$/, '');
      const candidates = [];

      // Candidate 1: /docs/cli/getting-started.md
      parsed.pathname = (trimmed || '') + '.md';
      candidates.push(parsed.toString());

      // Candidate 2: /docs/index.md (for section root or trailing slash paths)
      if (pathname.endsWith('/') || !trimmed) {
        parsed.pathname = trimmed + '/index.md';
        candidates.push(parsed.toString());
      }

      return candidates;
    } catch {
      const clean = url.replace(/\/+$/, '');
      return [clean + '.md', clean + '/index.md'];
    }
  }

  /**
   * Attempt to fetch author-provided raw markdown directly from the server if supported.
   *
   * @param {string} url
   * @returns {Promise<string | null>}
   */
  async function fetchRawMarkdown(url) {
    const candidates = getRawMarkdownCandidates(url);
    for (const rawUrl of candidates) {
      try {
        const res = await fetch(rawUrl, {
          credentials: 'same-origin',
          headers: {
            'Accept': 'text/markdown, text/plain;q=0.9, */*;q=0.1'
          }
        });

        if (!res.ok) continue;

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const isMarkdownType =
          contentType.includes('text/markdown') ||
          contentType.includes('text/plain') ||
          contentType.includes('text/x-markdown');

        if (!isMarkdownType) continue;

        const text = await res.text();
        const trimmed = text.trim();
        if (trimmed.length < 20 || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
          continue;
        }

        return text;
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Ensure raw markdown has consistent YAML frontmatter and title heading.
   *
   * @param {string} rawMarkdown
   * @param {object} metadata
   * @returns {string}
   */
  function prepareMarkdownWithFrontmatter(rawMarkdown, metadata = {}) {
    let trimmed = rawMarkdown.trim();
    const includeFrontmatter = metadata.includeFrontmatter !== false && metadata.frontmatter !== false;
    if (!includeFrontmatter) {
      trimmed = trimmed.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
      const heading = !trimmed.startsWith('# ') ? `# ${metadata.title || 'Untitled'}\n\n` : '';
      return `${heading}${trimmed}\n`;
    }
    if (trimmed.startsWith('---')) {
      return `${trimmed}\n`;
    }
    const frontmatter = formatFrontmatter({
      title: metadata.title || 'Untitled',
      description: metadata.description || undefined,
      source: metadata.source || undefined,
      category: metadata.category || undefined,
      order: metadata.order !== undefined ? metadata.order : undefined
    });
    const heading = !trimmed.startsWith('# ') ? `# ${metadata.title || 'Untitled'}\n\n` : '';
    return `${frontmatter}${heading}${trimmed}\n`;
  }

  /**
   * Helper to fetch and parse an HTML page into a DOM Document.
   *
   * @param {string} url
   * @returns {Promise<Document>}
   */
  async function fetchPageDom(url) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  /**
   * Process an array of tasks with bounded concurrency.
   *
   * @template T, R
   * @param {T[]} items
   * @param {number} concurrency
   * @param {(item: T, index: number) => Promise<R>} workerFn
   * @returns {Promise<R[]>}
   */
  async function asyncPool(items, concurrency, workerFn) {
    let index = 0;
    const results = new Array(items.length);

    async function worker() {
      while (index < items.length) {
        if (batchCancelled) return;
        const i = index++;
        try {
          results[i] = await workerFn(items[i], i);
        } catch (err) {
          console.error(`starlight-to-md: Error processing item ${i}:`, err);
          results[i] = { error: err.message, item: items[i] };
        }
      }
    }

    const poolSize = Math.min(concurrency, items.length);
    const workers = Array.from({ length: poolSize }, () => worker());
    await Promise.all(workers);
    return results;
  }

  /**
   * Execute batch conversion of all pages found in the sidebar.
   *
   * @param {string} format 'zip' | 'single'
   * @param {boolean} [includeFrontmatter=true]
   */
  async function runBatchConversion(format, includeFrontmatter = true) {
    if (isBatchRunning) return;
    isBatchRunning = true;
    batchCancelled = false;

    const siteTitle = getSiteTitle(document, 'Documentation');
    const pages = extractSidebar(document, window.location.href);

    if (pages.length === 0) {
      chrome.runtime.sendMessage({
        action: 'batchError',
        error: 'No sidebar documentation pages detected.'
      });
      isBatchRunning = false;
      return;
    }

    let processedCount = 0;
    const total = pages.length;

    chrome.runtime.sendMessage({
      action: 'batchStarted',
      total,
      format,
      siteTitle
    });

    // Probe if this site serves raw markdown
    const siteSupportsRawMd = Boolean(await fetchRawMarkdown(window.location.href));

    const convertedPages = await asyncPool(pages, siteSupportsRawMd ? 8 : 4, async (page, idx) => {
      if (batchCancelled) return null;

      try {
        let markdown = null;

        // 1. Try author-provided raw Markdown endpoint if site supports it
        if (siteSupportsRawMd) {
          const rawMd = await fetchRawMarkdown(page.url);
          if (rawMd) {
            markdown = prepareMarkdownWithFrontmatter(rawMd, {
              title: page.title,
              source: page.url,
              category: page.category,
              order: page.order,
              includeFrontmatter
            });
          }
        }

        // 2. Fallback to DOM extraction + HTML converter
        if (!markdown) {
          let article;
          if (page.isCurrent) {
            article = extractArticleContent(document);
          } else {
            const pageDoc = await fetchPageDom(page.url);
            article = extractArticleContent(pageDoc);
          }

          markdown = convertToMarkdown(article.contentNode, {
            title: article.title || page.title,
            description: article.description,
            source: page.url,
            category: page.category,
            order: page.order,
            includeFrontmatter
          });
        }

        processedCount++;

        chrome.runtime.sendMessage({
          action: 'batchProgress',
          processed: processedCount,
          total,
          currentTitle: page.title
        });

        return {
          title: page.title,
          url: page.url,
          category: page.category,
          order: page.order,
          slug: slugify(page.title),
          markdown
        };
      } catch (err) {
        console.error(`starlight-to-md: Failed to process ${page.url}:`, err);
        processedCount++;
        chrome.runtime.sendMessage({
          action: 'batchProgress',
          processed: processedCount,
          total,
          currentTitle: `Skipped ${page.title}`
        });
        return null;
      }
    });

    if (batchCancelled) {
      chrome.runtime.sendMessage({ action: 'batchCancelled' });
    } else {
      const successfulPages = convertedPages.filter(p => p && !p.error);
      if (successfulPages.length === 0) {
        chrome.runtime.sendMessage({
          action: 'batchError',
          error: 'Failed to extract content from pages. Please check the browser console for details.'
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'batchComplete',
          format,
          siteTitle,
          pages: successfulPages
        });
      }
    }

    isBatchRunning = false;
  }

  // Listen for messages from popup and background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'ping': {
        sendResponse({ pong: true });
        break;
      }

      case 'detectStarlight': {
        (async () => {
          const isStarlight = isStarlightSite(document);
          const siteTitle = getSiteTitle(document, 'Documentation');
          const pages = isStarlight ? extractSidebar(document, window.location.href) : [];
          const hasRawMarkdown = isStarlight ? Boolean(await fetchRawMarkdown(window.location.href)) : false;

          sendResponse({
            isStarlight,
            siteTitle,
            pageCount: pages.length,
            pages,
            currentUrl: window.location.href,
            hasRawMarkdown
          });
        })();
        return true;
      }

      case 'convertCurrentPage': {
        (async () => {
          try {
            const siteTitle = getSiteTitle(document, 'Documentation');
            const article = extractArticleContent(document);
            const currentUrl = window.location.href;
            const includeFrontmatter = request.includeFrontmatter !== false;
            let markdown = null;

            // 1. Try raw .md endpoint first
            const rawMd = await fetchRawMarkdown(currentUrl);
            if (rawMd) {
              const headingMatch = rawMd.match(/^#\s+(.+)$/m);
              const title = article.title || (headingMatch ? headingMatch[1].trim() : 'Documentation Page');
              markdown = prepareMarkdownWithFrontmatter(rawMd, {
                title,
                description: article.description,
                source: currentUrl,
                category: '',
                includeFrontmatter
              });
            }

            // 2. Fallback to DOM conversion
            if (!markdown) {
              markdown = convertToMarkdown(article.contentNode, {
                title: article.title,
                description: article.description,
                source: currentUrl,
                category: '',
                includeFrontmatter
              });
            }

            const pageSlug = slugify(article.title || 'page');
            const siteSlug = slugify(siteTitle || 'docs');
            const fileName = `${siteSlug}-${pageSlug}.md`;

            sendResponse({
              success: true,
              title: article.title,
              fileName,
              markdown
            });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      }

      case 'startBatch': {
        runBatchConversion(request.format || 'zip', request.includeFrontmatter !== false);
        sendResponse({ success: true });
        break;
      }

      case 'cancelBatch': {
        batchCancelled = true;
        isBatchRunning = false;
        sendResponse({ success: true });
        break;
      }

      default:
        break;
    }

    return true;
  });

  chrome.runtime.sendMessage({ action: 'contentScriptReady' }).catch(() => {});
})();
