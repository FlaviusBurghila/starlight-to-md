/**
 * DOM parser for Starlight documentation sites across all eras:
 *   - Era 1 (v0.1.0 – v0.2.x, May-June 2023): Genesis release. No generator tag, <div id="starlight__sidebar">,
 *     <div class="content">, <h2> group headers in <summary>, window.StarlightThemeProvider.
 *   - Era 2 (v0.3.0 – v0.13.x, June-Nov 2023): Generator tag introduced (<meta name="generator" content="Starlight v...">),
 *     still <div class="content">, <h2 class="large"> group headers.
 *   - Era 3 (v0.14.0 – v0.20.x, Nov 2023-Apr 2024): Introduced <div class="sl-markdown-content">, <ul class="top-level">,
 *     <div class="group-label"><span class="large">.
 *   - Era 4 (v0.21.0 – v0.41.x, Apr 2024-Feb 2026): Introduced @layer starlight CSS, Page.astro structure,
 *     custom elements <starlight-menu-button>, <site-search>.
 *   - Era 5 (v0.42.0+, modern 2026): HTML Popover API with <sl-sidebar-pane popover id="starlight__sidebar">,
 *     <sl-sidebar-state-persist>, <sl-sidebar-restore>.
 */
import { normalizeUrl, cleanHeading } from './utils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a single sidebar link entry from an anchor element.
 *
 * @param {Element} a
 * @param {string} baseUrl
 * @param {string} normalizedCurrentUrl
 * @param {Set<string>} seenUrls
 * @param {string} category
 * @param {{ order: number }} counter
 * @returns {{ title: string, url: string, category: string, order: number, isCurrent: boolean } | null}
 */
function extractLinkEntry(a, baseUrl, normalizedCurrentUrl, seenUrls, category, counter) {
  // Ignore non-doc controls (social links, theme/lang pickers, mobile preferences)
  if (a.closest('.social-icons, .mobile-preferences, starlight-theme-select, starlight-lang-select, .right-group')) {
    return null;
  }

  const rawHref = a.getAttribute('href');
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return null;

  const resolvedUrl = normalizeUrl(rawHref, baseUrl);
  if (!resolvedUrl || seenUrls.has(resolvedUrl)) return null;

  const clone = a.cloneNode(true);
  clone.querySelectorAll('.sl-badge, .badge, svg, .caret, .sr-only').forEach(n => n.remove());

  const extractedText = cleanHeading(clone.textContent);
  const title = extractedText || cleanHeading(a.getAttribute('title') || '') || 'Untitled Page';

  seenUrls.add(resolvedUrl);
  counter.order++;

  const isCurrent = (
    a.getAttribute('aria-current') === 'page' ||
    a.getAttribute('aria-current') === 'true' ||
    (Boolean(normalizedCurrentUrl) && resolvedUrl === normalizedCurrentUrl)
  );

  return {
    title,
    url: resolvedUrl,
    category: category.trim(),
    order: counter.order,
    isCurrent
  };
}

/**
 * Recursively traverse a sidebar list (UL/OL) to extract groups and nested subgroups
 * without flattening or dropping categories.
 *
 * @param {Element} listEl
 * @param {string} currentCategory
 * @param {string} baseUrl
 * @param {string} normalizedCurrentUrl
 * @param {Set<string>} seenUrls
 * @param {Array<object>} pages
 * @param {{ order: number }} counter
 */
function traverseSidebarList(listEl, currentCategory, baseUrl, normalizedCurrentUrl, seenUrls, pages, counter) {
  const items = Array.from(listEl.children).filter(el => el.tagName === 'LI');

  for (const item of items) {
    const details = item.querySelector(':scope > details, details');
    if (details) {
      // 1. Extract group category name from <summary>
      // Covers:
      //   Era 1: <summary><h2>Title</h2>...
      //   Era 2: <summary><h2 class="large">Title</h2>...
      //   Era 3: <summary><div class="group-label"><span class="large">Title</span>...
      //   Era 4/5: <summary><span class="group-label"><span class="large">Title</span>...
      const summary = details.querySelector('summary');
      const cloneSummary = summary ? summary.cloneNode(true) : null;
      if (cloneSummary) {
        cloneSummary.querySelectorAll('.sl-badge, .badge, svg, .caret, .sr-only').forEach(n => n.remove());
      }
      const groupLabelEl = cloneSummary?.querySelector('h2, h3, .group-label, .large, span') || cloneSummary;
      const groupName = cleanHeading(groupLabelEl?.textContent || 'General').replace(/[\r\n\t]+/g, ' ').trim();

      const subCategory = currentCategory ? `${currentCategory} / ${groupName}` : groupName;

      // 2. Check if summary itself contains a link (<summary><a href="...">)
      const summaryLink = summary?.querySelector('a[href]');
      if (summaryLink) {
        const entry = extractLinkEntry(summaryLink, baseUrl, normalizedCurrentUrl, seenUrls, currentCategory, counter);
        if (entry) pages.push(entry);
      }

      // 3. Find nested list(s) inside this <details>
      const innerLists = Array.from(details.querySelectorAll(':scope > ul, :scope > ol, ul, ol'));
      if (innerLists.length > 0) {
        for (const innerList of innerLists) {
          traverseSidebarList(innerList, subCategory, baseUrl, normalizedCurrentUrl, seenUrls, pages, counter);
        }
      } else {
        // Fallback for flat anchor links inside details without list wrapper
        const directLinks = details.querySelectorAll('a[href]');
        for (const a of directLinks) {
          const entry = extractLinkEntry(a, baseUrl, normalizedCurrentUrl, seenUrls, subCategory, counter);
          if (entry) pages.push(entry);
        }
      }
    } else {
      // Direct link item in the list
      const a = item.querySelector(':scope > a[href], a[href]');
      if (a) {
        const entry = extractLinkEntry(a, baseUrl, normalizedCurrentUrl, seenUrls, currentCategory, counter);
        if (entry) pages.push(entry);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Check if the current document is powered by Starlight across any era.
 *
 * Grounded markers:
 *   - Generator meta: "Starlight v..." (introduced v0.3.0)
 *   - <html> dataset: data-has-sidebar, data-has-toc, data-has-hero (present since v0.1.0)
 *   - Custom elements: starlight-toc, mobile-starlight-toc, starlight-tabs,
 *     starlight-tabs-restore, starlight-theme-select, starlight-lang-select,
 *     starlight-menu-button, sl-sidebar-pane, sl-sidebar-state-persist,
 *     sl-sidebar-restore, site-search
 *   - Stable IDs: #starlight__sidebar (present in every era since v0.1.0), #starlight__search
 *   - Global scripts: window.StarlightThemeProvider (present since v0.1.0, even on splash pages)
 *   - CSS layers: @layer starlight.* (introduced v0.21.0)
 *   - Core classes: .sl-markdown-content, .sl-link-card, .sl-badge, .sl-menu-button, .sl-skip-link
 *   - Astro engine: generator "Astro v...", /_astro/ asset bundles, astro-island, data-astro-cid
 *
 * @param {Document} doc
 * @returns {boolean}
 */
export function isStarlightSite(doc) {
  if (!doc) return false;

  try {
    const htmlEl = doc.documentElement;
    if (!htmlEl) return false;

    // 1. Generator Meta Tag Check
    //    Starlight v0.3.0+ emits <meta name="generator" content="Starlight v...">
    const generators = Array.from(doc.querySelectorAll('meta[name="generator"]'))
      .map(el => el.getAttribute('content') || '');
    const hasStarlightGen = generators.some(g => /\bstarlight\b/i.test(g));
    if (hasStarlightGen) return true;

    // 2. Core Starlight Dataset Attributes on <html> (Page.astro / index.astro, present since v0.1.0)
    const hasStarlightDataset =
      htmlEl.hasAttribute('data-has-sidebar') ||
      htmlEl.hasAttribute('data-has-toc') ||
      htmlEl.hasAttribute('data-has-hero');

    // 3. Starlight Custom Elements (across all eras)
    const hasStarlightComponents = Boolean(
      doc.querySelector(
        'starlight-toc, mobile-starlight-toc, starlight-tabs, starlight-tabs-restore, ' +
        'starlight-theme-select, starlight-lang-select, starlight-menu-button, ' +
        'sl-sidebar-pane, sl-sidebar-state-persist, sl-sidebar-restore, site-search'
      )
    );

    // 4. Starlight Core CSS Classes
    const hasStarlightClasses = Boolean(
      doc.querySelector(
        '.sl-markdown-content, .sl-link-card, .sl-badge, .sl-menu-button, .sl-skip-link'
      )
    );

    // 5. Canonical Starlight Unique Element IDs
    //    #starlight__sidebar has been the canonical container ID since v0.1.0
    //    #starlight__search has been the canonical search container ID since early Starlight
    const hasStarlightIds = Boolean(
      doc.getElementById('starlight__sidebar') ||
      doc.getElementById('starlight__search')
    );

    // 6. Starlight Inline Script Signatures (ThemeProvider is inlined since v0.1.0, even on splash pages)
    const hasStarlightScripts = Array.from(doc.querySelectorAll('script:not([src])')).some(
      s => s.textContent && s.textContent.includes('StarlightThemeProvider')
    );

    // 7. Scoped CSS Cascade Layers (@layer starlight.core / starlight.components, v0.21.0+)
    const hasStarlightCssLayers = Array.from(doc.querySelectorAll('style')).some(
      style => /\s*@layer\s+starlight\b/.test(style.textContent || '')
    );

    // 8. Astro Engine Detection
    const hasAstroGen = generators.some(g => /\bastro\b/i.test(g));
    const hasAstroAssets = Boolean(
      doc.querySelector("link[href*='/_astro/'], script[src*='/_astro/'], astro-island, [data-astro-cid]")
    );
    const isAstro = hasAstroGen || hasAstroAssets;

    // Multi-marker scoring:
    let score = 0;
    if (hasStarlightDataset) score += 2;
    if (hasStarlightComponents) score += 2;
    if (hasStarlightClasses) score += 1;
    if (hasStarlightIds) score += 2;
    if (hasStarlightScripts) score += 2;
    if (hasStarlightCssLayers) score += 2;
    if (isAstro) score += 1;

    const hasDefinitiveMarker =
      hasStarlightDataset || hasStarlightComponents ||
      hasStarlightClasses || hasStarlightIds ||
      hasStarlightScripts || hasStarlightCssLayers;

    return hasDefinitiveMarker && score >= 2;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Site title
// ---------------------------------------------------------------------------

/**
 * Extract documentation site title.
 * Prioritizes Starlight's canonical SiteTitle component hierarchy before falling
 * back to OG metadata and <title> tag parsing.
 *
 * Handles:
 *   - Standard text site titles (<span translate="no">Site Title</span>)
 *   - Logo-only mode with .sr-only span (<span class="sr-only">Site Title</span>)
 *   - Logo-only mode with image alt text (<img alt="Site Title" />)
 *   - Document <title> delimiters: '|', ' - ', ' — ', ' • ', ' :: '
 *
 * @param {Document} doc
 * @param {string} [fallback='Documentation']
 * @returns {string}
 */
export function getSiteTitle(doc, fallback = 'Documentation') {
  if (!doc) return fallback;

  try {
    // 1. Starlight Canonical Site Title (Header.astro -> SiteTitle.astro)
    const siteTitleEl = doc.querySelector(
      'header .title-wrapper a.site-title, ' +
      'header .title-wrapper a, ' +
      'a.site-title, ' +
      '.site-title'
    );

    if (siteTitleEl) {
      // Check for image alt text (in case text node was replaced completely by an image logo)
      const imgAlt = siteTitleEl.querySelector('img[alt]')?.getAttribute('alt')?.trim();

      const clone = siteTitleEl.cloneNode(true);
      clone.querySelectorAll('svg, .caret, img').forEach(n => n.remove());
      const extracted = cleanHeading(clone.textContent);
      if (extracted) {
        return extracted;
      }
      if (imgAlt) {
        return cleanHeading(imgAlt);
      }
    }

    // 2. OpenGraph site name metadata
    const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    if (ogSiteName?.trim()) return ogSiteName.trim();

    // 3. Fallback: Parse Document Title (<title>Page | Site</title> or <title>Page - Site</title>)
    //    Starlight format is `${pageTitle} ${titleDelimiter} ${siteTitle}` (site title is at the end).
    //    Extract from the right to avoid truncating titles that contain delimiters.
    const docTitle = (doc.title || '').trim();
    if (docTitle) {
      const delimiters = [' | ', '|', ' - ', ' — ', ' • ', ' :: '];
      for (const delim of delimiters) {
        if (docTitle.includes(delim)) {
          const lastIdx = docTitle.lastIndexOf(delim);
          const candidate = cleanHeading(docTitle.slice(lastIdx + delim.length));
          if (candidate) return candidate;
        }
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Sidebar extraction
// ---------------------------------------------------------------------------

/**
 * Extract all documentation pages from the Starlight navigation sidebar across all eras.
 *
 * Handles:
 *   - Era 1 & 2: <nav class="sidebar"><div id="starlight__sidebar"> with <h2> headers
 *   - Era 3 & 4: <ul class="top-level"> with <div class="group-label"><span class="large">
 *   - Era 5: <sl-sidebar-pane id="starlight__sidebar">
 *   - Nested subgroups (<details> inside <details>), preserving full breadcrumb category
 *   - Summary links (<summary><a href="...">)
 *   - Multiple sibling <ul> elements
 *   - Fallback custom sidebars without standard wrappers
 *
 * @param {Document} doc
 * @param {string} currentUrl
 * @returns {Array<{ title: string, url: string, category: string, order: number, isCurrent: boolean }>}
 */
export function extractSidebar(doc, currentUrl = '') {
  if (!doc) return [];

  try {
    // Container search:
    // 1. Primary: <sl-sidebar-pane> (modern), #starlight__sidebar (all eras), or <nav class="sidebar">
    let sidebarNav = doc.querySelector('sl-sidebar-pane, #starlight__sidebar, nav.sidebar');

    // 2. Secondary: Standard layout sidebars in aside or role="navigation"
    if (!sidebarNav) {
      sidebarNav = doc.querySelector(
        'aside.sidebar-container nav, aside nav, [role="navigation"] nav, nav[aria-label="Main"], aside.sidebar-container, aside'
      );
    }

    // 3. Defensive fallback for overridden Sidebar components when data-has-sidebar is present
    if (!sidebarNav && doc.documentElement?.hasAttribute('data-has-sidebar')) {
      sidebarNav = doc.querySelector(
        '.page > aside, .page > nav, [role="navigation"], .sidebar-pane, .sidebar, [data-sidebar]'
      );
      if (!sidebarNav) {
        const pageChildren = Array.from(doc.querySelectorAll('.page > *'));
        sidebarNav = pageChildren.find(el =>
          !el.matches('header, .main-frame, .sl-skip-link, style, script') &&
          el.querySelector('a[href]')
        ) || null;
      }
    }

    if (!sidebarNav) return [];

    const baseUrl = currentUrl || doc.baseURI || (typeof doc.location !== 'undefined' ? doc.location.href : '') || undefined;
    const normalizedCurrentUrl = baseUrl ? normalizeUrl(baseUrl) : '';

    const pages = [];
    const seenUrls = new Set();
    const counter = { order: 0 };

    // Find all top-level list containers
    const topLists = Array.from(sidebarNav.querySelectorAll('ul.top-level, .sidebar-content > ul'));
    const candidateLists = topLists.length > 0 ? topLists : Array.from(sidebarNav.querySelectorAll(':scope > ul, :scope > ol, ul'));

    if (candidateLists.length > 0) {
      // Process each top-level list
      for (const listEl of candidateLists) {
        // If candidate list is an inner nested list of another candidate, skip to avoid double processing
        if (candidateLists.some(other => other !== listEl && other.contains(listEl))) {
          continue;
        }
        traverseSidebarList(listEl, '', baseUrl, normalizedCurrentUrl, seenUrls, pages, counter);
      }
    }

    // Defensive fallback: If candidate lists yielded 0 links (e.g. custom div-based sidebar),
    // extract all doc anchor links from sidebarNav
    if (pages.length === 0) {
      const allLinks = sidebarNav.querySelectorAll('a[href]');
      for (const a of allLinks) {
        const entry = extractLinkEntry(a, baseUrl, normalizedCurrentUrl, seenUrls, '', counter);
        if (entry) pages.push(entry);
      }
    }

    return pages;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Article content extraction
// ---------------------------------------------------------------------------

/**
 * Extract article content and metadata from the document across all Starlight eras.
 *
 * Content priority (grounded across all eras):
 *   1. Hero page container: if <div class="hero"> exists, select parent content-panel or container
 *   2. main .sl-markdown-content (Starlight v0.14.0+)
 *   3. .sl-markdown-content (fallback)
 *   4. main .content (Starlight v0.1.0 – v0.13.0 markdown wrapper)
 *   5. main [data-pagefind-body] (Starlight Page.astro main attribute)
 *   6. main article (generic wrapper)
 *   7. main (broadest fallback)
 *
 * @param {Document} doc
 * @returns {{ title: string, description: string, contentNode: Element | null }}
 */
export function extractArticleContent(doc) {
  if (!doc) {
    return { title: 'Untitled', description: '', contentNode: null };
  }

  try {
    // 1. Heading extraction:
    // Look for h1 in main, content-panel, or Era 1's #starlight__overview
    const h1 = doc.querySelector('main h1, .content-panel h1, #starlight__overview, h1');
    let title = '';
    if (h1) {
      const cloneH1 = h1.cloneNode(true);
      // Strip anchor permalinks and icon graphics, but PRESERVE anchor text if h1 contains a markdown link
      cloneH1.querySelectorAll('.sr-only, svg, .caret, a.sl-anchor-link, a[aria-hidden="true"]').forEach(n => n.remove());
      title = cleanHeading(cloneH1.textContent);
    }

    // Fallback: og:title
    if (!title) {
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (ogTitle?.trim()) {
        title = cleanHeading(ogTitle.trim());
      }
    }

    // Fallback: parse <title> tag (${pageTitle} ${titleDelimiter} ${siteTitle})
    // Extract pageTitle from the left of the LAST delimiter to avoid breaking titles with hyphens/pipes
    if (!title) {
      const rawTitle = (doc.title || '').trim();
      const delimiters = [' | ', '|', ' - ', ' — ', ' • ', ' :: '];
      let extracted = false;
      for (const delim of delimiters) {
        if (rawTitle.includes(delim)) {
          const lastIdx = rawTitle.lastIndexOf(delim);
          const pageTitlePart = rawTitle.slice(0, lastIdx).trim();
          if (pageTitlePart) {
            title = cleanHeading(pageTitlePart);
            extracted = true;
            break;
          }
        }
      }
      if (!extracted) {
        title = cleanHeading(rawTitle) || 'Untitled';
      }
    }

    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                     doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                     '';

    // 2. Content Node extraction
    let contentNode = null;

    // If this is a Starlight hero landing page, select the container holding the hero
    const heroEl = doc.querySelector('main .hero, .hero');
    if (heroEl) {
      contentNode = heroEl.closest('.content-panel') || heroEl.parentElement || heroEl;
    }

    // Standard markdown documentation content across eras
    if (!contentNode) {
      contentNode =
        doc.querySelector('main .sl-markdown-content') ||
        doc.querySelector('.sl-markdown-content') ||
        doc.querySelector('main .content') ||
        doc.querySelector('.content') ||
        doc.querySelector('main [data-pagefind-body]') ||
        doc.querySelector('main article') ||
        doc.querySelector('main');
    }

    return {
      title,
      description: metaDesc.trim(),
      contentNode
    };
  } catch {
    return { title: 'Untitled', description: '', contentNode: null };
  }
}
