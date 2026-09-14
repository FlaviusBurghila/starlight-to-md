#!/usr/bin/env node

/**
 * starlight-to-md CLI
 *
 * Extract Astro Starlight documentation pages or full documentation trees
 * into clean, LLM-ready Markdown.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

import { isStarlightSite, getSiteTitle, extractSidebar, extractArticleContent } from '../src/parser.js';
import { convertToMarkdown } from '../src/converter.js';
import { generateSingleMarkdown, buildZipArchive, resolvePageSlug, extractPageDescription, generateLlmIndex } from '../src/bundler.js';
import { slugify, sanitizeName, formatFrontmatter, normalizeUrl, cleanHeading } from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const USER_AGENT = 'Mozilla/5.0 (compatible; starlight-to-md)';
const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9,*/*;q=0.8'
};

function printHelp() {
  console.log(`
starlight-to-md v${packageJson.version}
Convert Astro Starlight documentation into clean, LLM-ready Markdown.

USAGE:
  starlight-to-md <url> [options]
  npx starlight-to-md <url> [options]

OPTIONS:
  -o, --output <path>     Output file or destination directory (use '-' for stdout)
  -s, --single            Consolidate all pages into a single Markdown file with TOC
  -z, --zip               Export all pages as a structured ZIP archive with llms.txt
  -a, --all               Extract all documentation pages linked in the sidebar
  --plain, --raw          Omit YAML frontmatter (pure Markdown, alias: --no-frontmatter)
  --stdout                Print markdown output directly to stdout (auto-enabled when piped)
  -c, --concurrency <num> Concurrent HTTP requests when crawling (default: 5)
  -q, --quiet             Suppress informational output (errors only)
  -v, --version           Show version
  -h, --help              Show this help message

EXAMPLES:
  # Extract a single page (saved to ./getting-started.md)
  starlight-to-md https://starlight.astro.build/getting-started/

  # Pipe directly to clipboard or AI CLI (auto-streams to stdout)
  starlight-to-md https://starlight.astro.build/getting-started/ | pbcopy
  starlight-to-md https://starlight.astro.build/getting-started/ --plain | claude

  # Consolidate entire documentation site into a single file with TOC
  starlight-to-md https://starlight.astro.build/getting-started/ -s -o starlight.md

  # Crawl full documentation tree into categorized directory
  starlight-to-md https://starlight.astro.build/getting-started/ -a -o ./starlight-docs

  # Export all pages as structured ZIP archive with llms.txt index
  starlight-to-md https://starlight.astro.build/getting-started/ -z -o starlight.zip
`.trim());
}

function parseArgs(args) {
  const options = {
    url: null,
    all: false,
    single: false,
    zip: false,
    output: null,
    stdout: false,
    frontmatter: true,
    concurrency: 5,
    quiet: false,
    help: false,
    version: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-v' || arg === '--version') {
      options.version = true;
    } else if (arg === '-a' || arg === '--all') {
      options.all = true;
    } else if (arg === '-s' || arg === '--single') {
      options.single = true;
      options.all = true;
    } else if (arg === '-z' || arg === '--zip') {
      options.zip = true;
      options.all = true;
    } else if (arg === '--stdout') {
      options.stdout = true;
    } else if (arg === '--no-frontmatter' || arg === '--no-yaml' || arg === '--plain' || arg === '--raw') {
      options.frontmatter = false;
    } else if (arg === '-q' || arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-c' || arg === '--concurrency') {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0) options.concurrency = parsed;
    } else if (!arg.startsWith('-') && !options.url) {
      options.url = arg;
    }
  }

  // Support '-' as output to mean stdout
  if (options.output === '-') {
    options.stdout = true;
    options.output = null;
  }

  // If stdout is redirected / piped and no explicit output file given, default to stdout
  if (!process.stdout.isTTY && !options.output && !options.zip && !options.all) {
    options.stdout = true;
    options.quiet = true;
  }

  if (options.stdout) {
    options.quiet = true;
  }

  return options;
}

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

    // Candidate 1: [path].md
    parsed.pathname = (trimmed || '') + '.md';
    candidates.push(parsed.toString());

    // Candidate 2: [path]/index.md
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

async function fetchRawMarkdown(url) {
  const candidates = getRawMarkdownCandidates(url);
  for (const rawUrl of candidates) {
    try {
      const res = await fetch(rawUrl, {
        headers: {
          ...DEFAULT_HEADERS,
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

function prepareRawMarkdown(rawMarkdown, metadata = {}) {
  let trimmed = rawMarkdown.trim();
  const includeFrontmatter = metadata.includeFrontmatter !== false && metadata.frontmatter !== false;
  if (!includeFrontmatter) {
    trimmed = trimmed.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    const heading = !trimmed.startsWith('# ') ? `# ${metadata.title || 'Untitled'}\n\n` : '';
    return `${heading}${trimmed}\n`;
  }
  if (trimmed.startsWith('---')) {
    return trimmed + '\n';
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

async function fetchHtmlDocument(url) {
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  return { doc: dom.window.document, html };
}

async function processPageUrl(url, metadata = {}) {
  const includeFrontmatter = metadata.includeFrontmatter !== false && metadata.frontmatter !== false;

  // 1. Try author-provided raw markdown
  const directMd = await fetchRawMarkdown(url);
  if (directMd) {
    const headingMatch = directMd.match(/^#\s+(.+)$/m);
    const title = metadata.title || (headingMatch ? cleanHeading(headingMatch[1]) : 'Documentation Page');
    return {
      title,
      description: metadata.description || '',
      category: metadata.category || '',
      order: metadata.order || 0,
      slug: slugify(title),
      url,
      markdown: prepareRawMarkdown(directMd, { ...metadata, title, source: url, includeFrontmatter })
    };
  }

  // 2. Fetch and convert HTML DOM
  const { doc } = await fetchHtmlDocument(url);
  const article = extractArticleContent(doc);
  const title = metadata.title || article.title || 'Documentation Page';
  const description = metadata.description || article.description || '';
  const content = article.contentNode || doc.body;

  const markdown = convertToMarkdown(content, {
    title,
    description,
    source: url,
    category: metadata.category || undefined,
    order: metadata.order !== undefined ? metadata.order : undefined,
    includeFrontmatter
  });

  return {
    title,
    description,
    category: metadata.category || '',
    order: metadata.order || 0,
    slug: slugify(title),
    url,
    markdown
  };
}

async function mapConcurrent(items, limit, workerFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await workerFn(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  if (options.version) {
    console.log(`v${packageJson.version}`);
    return 0;
  }

  if (!options.url) {
    console.error('Error: Please provide a documentation URL.\n');
    printHelp();
    return 1;
  }

  try {
    new URL(options.url);
  } catch {
    console.error(`Error: Invalid URL "${options.url}". Please provide a complete http:// or https:// URL.`);
    return 1;
  }

  const log = (...msg) => {
    if (!options.quiet) console.log(...msg);
  };
  const logError = (...msg) => console.error(...msg);

  // Single page mode (default when --all is not set)
  if (!options.all) {
    log(`Fetching ${options.url} ...`);
    let page;
    try {
      page = await processPageUrl(options.url, { includeFrontmatter: options.frontmatter });
    } catch (err) {
      logError(`Failed to extract page: ${err.message}`);
      return 1;
    }

    if (options.stdout) {
      process.stdout.write(page.markdown);
      return 0;
    }

    const targetFile = options.output || `${page.slug || 'documentation'}.md`;
    const resolvedPath = path.resolve(targetFile);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, page.markdown, 'utf8');

    const stat = fs.statSync(resolvedPath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    log(`✔ Extracted "${page.title}" -> ${targetFile} (${sizeKb} KB)`);
    return 0;
  }

  // Full documentation crawl mode (--all)
  log(`Discovering documentation tree on ${options.url} ...`);
  let doc;
  try {
    const result = await fetchHtmlDocument(options.url);
    doc = result.doc;
  } catch (err) {
    logError(`\x1b[31mError:\x1b[0m Failed to reach documentation site: ${err.message}`);
    return 1;
  }

  if (!isStarlightSite(doc)) {
    log(`⚠️  Warning: Site does not display standard Starlight markers. Attempting extraction anyway.`);
  }

  const rawSiteTitle = getSiteTitle(doc, 'Documentation');
  const siteTitle = rawSiteTitle.replace(/[\r\n\t]+/g, ' ').trim() || 'Documentation';
  const siteSlug = slugify(siteTitle);
  const sidebarLinks = extractSidebar(doc, options.url);

  if (sidebarLinks.length === 0) {
    log(`⚠️  No sidebar links discovered. Falling back to single page extraction.`);
    const single = await processPageUrl(options.url, { title: siteTitle, includeFrontmatter: options.frontmatter });
    const targetFile = options.output || `${siteSlug}.md`;
    fs.writeFileSync(path.resolve(targetFile), single.markdown, 'utf8');
    log(`✔ Extracted single page -> ${targetFile}`);
    return 0;
  }

  log(`Discovered ${sidebarLinks.length} documentation pages across sidebar categories.`);
  log(`Crawling pages with concurrency limit of ${options.concurrency} ...`);

  let completedCount = 0;
  const pages = await mapConcurrent(sidebarLinks, options.concurrency, async (item) => {
    try {
      const processed = await processPageUrl(item.url, {
        title: item.title,
        category: item.category,
        order: item.order,
        includeFrontmatter: options.frontmatter
      });
      completedCount++;
      if (!options.quiet) {
        process.stdout.write(`\rCrawling documentation: [${completedCount}/${sidebarLinks.length}] ${item.title.slice(0, 40).padEnd(40)}`);
      }
      return processed;
    } catch (err) {
      completedCount++;
      if (!options.quiet) {
        process.stdout.write(`\rFailed [${completedCount}/${sidebarLinks.length}]: ${item.url.slice(0, 40).padEnd(40)}\n`);
      }
      return null;
    }
  });

  if (!options.quiet) process.stdout.write('\n');

  const validPages = pages.filter(Boolean);
  log(`Successfully converted ${validPages.length} of ${sidebarLinks.length} pages.`);

  if (validPages.length === 0) {
    logError('Error: Failed to extract any pages.');
    return 1;
  }

  // Mode 1: Single consolidated Markdown file (--single)
  if (options.single) {
    const singleMd = generateSingleMarkdown(siteTitle, validPages);

    if (options.stdout) {
      process.stdout.write(singleMd);
      return 0;
    }

    const targetFile = options.output || `${siteSlug}.md`;
    const resolvedPath = path.resolve(targetFile);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, singleMd, 'utf8');

    const stat = fs.statSync(resolvedPath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    log(`✔ Consolidated ${validPages.length} pages into ${targetFile} (${sizeKb} KB)`);
    return 0;
  }

  // Mode 2: ZIP archive (--zip)
  if (options.zip) {
    const zip = buildZipArchive(siteTitle, validPages, JSZip);
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const targetFile = options.output || `${siteSlug}.zip`;
    const resolvedPath = path.resolve(targetFile);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, buffer);

    const stat = fs.statSync(resolvedPath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    log(`✔ Exported ${validPages.length} pages to ZIP archive ${targetFile} (${sizeKb} KB)`);
    return 0;
  }

  // Mode 3: Directory of Markdown files grouped by category (default for --all)
  const targetDir = path.resolve(options.output || `./${siteSlug}`);
  fs.mkdirSync(targetDir, { recursive: true });

  const sortedPages = [...validPages].sort((a, b) => (a.order || 0) - (b.order || 0));
  const usedNamesByCategory = new Map();
  const indexedPages = [];

  for (const page of sortedPages) {
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
      const categoryDir = path.join(targetDir, catFolder);
      fs.mkdirSync(categoryDir, { recursive: true });
      fs.writeFileSync(path.join(categoryDir, fileName), page.markdown, 'utf8');
    } else {
      fs.writeFileSync(path.join(targetDir, fileName), page.markdown, 'utf8');
    }
  }

  // 1. Generate standard llms.txt
  fs.writeFileSync(path.join(targetDir, 'llms.txt'), generateLlmIndex(siteTitle, indexedPages), 'utf8');

  // 2. Generate clean README.md
  let readmeIndex = `# ${siteTitle}\n\nExtracted with starlight-to-md.\n\n`;
  readmeIndex += `> For LLMs and AI coding assistants, see [llms.txt](llms.txt) for machine-optimized index.\n\n`;
  readmeIndex += `## Content Index\n\n`;

  const categories = new Map();
  for (const page of indexedPages) {
    if (!categories.has(page.category)) {
      categories.set(page.category, []);
    }
    categories.get(page.category).push(page);
  }

  for (const [category, catPages] of categories.entries()) {
    if (categories.size > 1 || category !== 'General') {
      readmeIndex += `### ${category}\n\n`;
    }
    for (const page of catPages) {
      const desc = page.description ? ` — *${page.description}*` : '';
      readmeIndex += `- [${page.title}](${page.relativePath})${desc}\n`;
    }
    readmeIndex += '\n';
  }

  fs.writeFileSync(path.join(targetDir, 'README.md'), readmeIndex.trim() + '\n', 'utf8');
  log(`✔ Extracted ${validPages.length} pages into directory ${path.relative(process.cwd(), targetDir) || targetDir}/`);
  return 0;
}

// Execute when run directly as CLI binary (handling symlinks from npm/npx)
let isDirectCli = false;
try {
  if (process.argv[1]) {
    const currentScript = fileURLToPath(import.meta.url);
    isDirectCli = process.argv[1] === currentScript || fs.realpathSync(process.argv[1]) === currentScript;
  }
} catch {
  // Fallback
}

if (isDirectCli) {
  runCli().then(code => {
    if (code !== 0) process.exit(code);
  }).catch(err => {
    console.error(`\x1b[31mError:\x1b[0m ${err.message || err}`);
    process.exit(1);
  });
}

