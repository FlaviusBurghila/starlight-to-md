/**
 * Documentation bundler: formats single merged Markdown, LLM indexes, and ZIP archives
 */
import { slugify } from './utils.js';

/**
 * Resolve a clean, deterministic file slug for a documentation page.
 * Prioritizes URL path segment (e.g. /docs/cli/headless/ -> 'headless')
 * to guarantee 1:1 parity with online docs, avoiding numeric order prefixes.
 *
 * @param {{ url?: string, slug?: string, title?: string }} page
 * @returns {string}
 */
export function resolvePageSlug(page) {
  if (page.url) {
    try {
      const parsed = new URL(page.url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (last && last !== 'index') {
          const candidate = slugify(last);
          if (candidate && candidate !== 'untitled') {
            return candidate;
          }
        }
      }
    } catch {}
  }
  if (page.slug && page.slug !== 'untitled') {
    return slugify(page.slug);
  }
  return slugify(page.title || 'untitled');
}

/**
 * Extract a concise, single-line description from page frontmatter or markdown body.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function extractPageDescription(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/^description:\s*(?:"([^"]*)"|'([^']*)'|(.*))$/m);
    if (descMatch) {
      const val = (descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? '').trim();
      if (val) return val;
    }
  }
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  for (const block of body.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('```')) {
      continue;
    }
    const clean = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length > 0) {
      return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
    }
  }
  return '';
}

/**
 * Generate standard llms.txt index content optimized for LLMs, RAG, and agent tooling.
 * Follows the llms.txt standard (https://llmstxt.org).
 *
 * @param {string} siteTitle
 * @param {Array<{ title: string, category: string, relativePath: string, description: string }>} indexedPages
 * @returns {string}
 */
export function generateLlmIndex(siteTitle, indexedPages) {
  const cleanTitle = siteTitle || 'Documentation';
  let output = `# ${cleanTitle}\n\n`;
  output += `> Complete documentation extract for ${cleanTitle}, formatted for LLM context, RAG, and agent tooling.\n\n`;

  const categories = new Map();
  for (const page of indexedPages) {
    const cat = page.category || 'General';
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat).push(page);
  }

  for (const [category, pages] of categories.entries()) {
    output += `## ${category}\n`;
    for (const page of pages) {
      const desc = page.description ? `: ${page.description}` : '';
      output += `- [${page.title}](${page.relativePath})${desc}\n`;
    }
    output += '\n';
  }

  return output.trim() + '\n';
}

/**
 * Generate a single consolidated Markdown file containing all pages with a unified Table of Contents.
 *
 * @param {string} siteTitle
 * @param {Array<{ title: string, category: string, order: number, slug: string, markdown: string, url: string }>} pages
 * @returns {string}
 */
export function generateSingleMarkdown(siteTitle, pages) {
  const cleanTitle = siteTitle || 'Documentation';
  let output = `# ${cleanTitle}\n\n`;

  // Build Table of Contents
  output += `## Table of Contents\n\n`;

  // Group pages by category
  const categories = new Map();
  for (const page of pages) {
    const cat = page.category || 'General';
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat).push(page);
  }

  // Render TOC
  for (const [category, catPages] of categories.entries()) {
    if (categories.size > 1 || category !== 'General') {
      output += `### ${category}\n`;
    }
    for (const page of catPages) {
      const anchor = slugify(page.title);
      output += `- [${page.title}](#${anchor})\n`;
    }
    output += '\n';
  }

  output += `---\n\n`;

  // Append each page content
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    let body = page.markdown;
    body = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

    output += `<!-- Page: ${page.title} | Source: ${page.url} -->\n\n`;
    output += `${body.trim()}\n\n`;

    if (i < pages.length - 1) {
      output += `---\n\n`;
    }
  }

  return output;
}

/**
 * Package documentation pages into a JSZip archive structure.
 * Includes un-numbered semantic Markdown files, standard llms.txt, and categorized README.md.
 *
 * @param {string} siteTitle
 * @param {Array<{ title: string, category: string, order: number, slug: string, markdown: string, url: string }>} pages
 * @param {any} JSZipConstructor
 * @returns {any} JSZip instance
 */
export function buildZipArchive(siteTitle, pages, JSZipConstructor) {
  const zip = new JSZipConstructor();
  const rootFolderName = slugify(siteTitle || 'docs');
  const root = zip.folder(rootFolderName);

  const sorted = [...pages].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Track filenames per category to avoid collisions
  const usedNamesByCategory = new Map();
  const indexedPages = [];

  for (const page of sorted) {
    const catFolder = page.category ? slugify(page.category) : '';
    if (!usedNamesByCategory.has(catFolder)) {
      usedNamesByCategory.set(catFolder, new Set());
    }
    const usedInCat = usedNamesByCategory.get(catFolder);

    const baseSlug = resolvePageSlug(page);
    let fileName = `${baseSlug}.md`;
    let counter = 2;
    while (usedInCat.has(fileName)) {
      fileName = `${baseSlug}-${counter}.md`;
      counter++;
    }
    usedInCat.add(fileName);

    const relativePath = catFolder ? `${catFolder}/${fileName}` : fileName;
    const description = extractPageDescription(page.markdown);

    indexedPages.push({
      title: page.title,
      category: page.category || 'General',
      relativePath,
      description,
      url: page.url
    });

    if (catFolder) {
      root.folder(catFolder).file(fileName, page.markdown);
    } else {
      root.file(fileName, page.markdown);
    }
  }

  // 1. Generate standard llms.txt
  const llmsTxt = generateLlmIndex(siteTitle, indexedPages);
  root.file('llms.txt', llmsTxt);

  // 2. Generate clean README.md
  let readme = `# ${siteTitle || 'Documentation'}\n\n`;
  readme += `Extracted with starlight-to-md.\n\n`;
  readme += `> For LLMs and AI coding assistants, see [llms.txt](llms.txt) for machine-optimized index.\n\n`;
  readme += `## Content Index\n\n`;

  const categories = new Map();
  for (const page of indexedPages) {
    if (!categories.has(page.category)) {
      categories.set(page.category, []);
    }
    categories.get(page.category).push(page);
  }

  for (const [category, catPages] of categories.entries()) {
    if (categories.size > 1 || category !== 'General') {
      readme += `### ${category}\n\n`;
    }
    for (const page of catPages) {
      const desc = page.description ? ` — *${page.description}*` : '';
      readme += `- [${page.title}](${page.relativePath})${desc}\n`;
    }
    readme += '\n';
  }

  root.file('README.md', readme.trim() + '\n');
  return zip;
}
