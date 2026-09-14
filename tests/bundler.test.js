import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  generateSingleMarkdown,
  buildZipArchive,
  resolvePageSlug,
  extractPageDescription,
  generateLlmIndex
} from '../src/bundler.js';

const samplePages = [
  {
    title: 'Getting Started',
    category: 'Start Here',
    order: 1,
    slug: 'getting-started',
    url: 'https://starlight.astro.build/getting-started/',
    markdown: '---\ntitle: "Getting Started"\ndescription: "Welcome guide to Starlight docs."\n---\n\n# Getting Started\n\nWelcome to Starlight.'
  },
  {
    title: 'Manual Setup',
    category: 'Start Here',
    order: 2,
    slug: 'manual-setup',
    url: 'https://starlight.astro.build/manual-setup/',
    markdown: '---\ntitle: "Manual Setup"\n---\n\n# Manual Setup\n\nManual installation steps for custom workflows.'
  },
  {
    title: 'Authoring Content',
    category: 'Guides',
    order: 3,
    slug: 'authoring-content',
    url: 'https://starlight.astro.build/guides/authoring-content/',
    markdown: '---\ntitle: "Authoring Content"\n---\n\n# Authoring Content\n\nWriting markdown guides and reference docs.'
  }
];

test('resolvePageSlug extracts clean slug from URL pathname without numbers', () => {
  assert.equal(
    resolvePageSlug({ url: 'https://antigravity.google/docs/cli/headless/', title: 'Headless Mode' }),
    'headless'
  );
  assert.equal(
    resolvePageSlug({ url: 'https://antigravity.google/docs/cli/getting-started', title: 'Getting Started' }),
    'getting-started'
  );
  assert.equal(
    resolvePageSlug({ title: 'Vim Editor Mode' }),
    'vim-editor-mode'
  );
});

test('extractPageDescription extracts frontmatter description or first paragraph', () => {
  const withFm = '---\ntitle: "Foo"\ndescription: "A neat tool"\n---\n# Foo\nBody text.';
  assert.equal(extractPageDescription(withFm), 'A neat tool');

  const withoutFm = '# Heading\n\nFirst clean paragraph describing the document.';
  assert.equal(extractPageDescription(withoutFm), 'First clean paragraph describing the document.');
});

test('generateSingleMarkdown builds document with TOC and all pages', () => {
  // Given: A list of documentation pages belonging to multiple categories
  const siteTitle = 'Starlight';

  // When: Consolidated into a single Markdown document
  const merged = generateSingleMarkdown(siteTitle, samplePages);

  // Then: Unified Table of Contents with jump links and body sections are generated
  assert.match(merged, /# Starlight/);
  assert.match(merged, /## Table of Contents/);
  assert.match(merged, /### Start Here/);
  assert.match(merged, /- \[Getting Started\]\(#getting-started\)/);
  assert.match(merged, /### Guides/);
  assert.match(merged, /- \[Authoring Content\]\(#authoring-content\)/);

  assert.match(merged, /<!-- Page: Getting Started/);
  assert.match(merged, /Welcome to Starlight/);
  assert.match(merged, /Manual installation steps/);
  assert.match(merged, /Writing markdown/);
});

test('generateSingleMarkdown strips frontmatter cleanly even with CRLF Windows line endings', () => {
  // Given: Pages containing Windows-style CRLF (\r\n) YAML frontmatter
  const crlfPages = [
    {
      title: 'Windows Doc',
      category: 'Setup',
      order: 1,
      slug: 'windows-doc',
      url: 'https://example.com/windows',
      markdown: '---\r\ntitle: "Windows Doc"\r\ndescription: "CRLF test"\r\n---\r\n\r\n# Windows Doc\r\n\r\nContent without frontmatter leak.'
    }
  ];

  // When: Consolidated into single file
  const merged = generateSingleMarkdown('CRLF Docs', crlfPages);

  // Then: Frontmatter block is stripped cleanly without leaking metadata text into body
  assert.match(merged, /# Windows Doc/);
  assert.match(merged, /Content without frontmatter leak\./);
  assert.doesNotMatch(merged, /description: "CRLF test"/);
});

test('buildZipArchive packages files into category folders with un-numbered filenames and llms.txt index', async () => {
  // Given: A site title and structured documentation page models
  const siteTitle = 'Starlight Docs';

  // When: Packaged into in-memory ZIP structure via JSZip
  const zip = buildZipArchive(siteTitle, samplePages, JSZip);

  // Then: The root folder contains a README.md index, llms.txt, and category subfolders
  const readmeFile = zip.file('starlight-docs/README.md');
  assert.ok(readmeFile, 'README.md must exist in root');
  const readmeContent = await readmeFile.async('text');
  assert.match(readmeContent, /# Starlight Docs/);
  assert.match(readmeContent, /start-here\/getting-started\.md/);
  assert.doesNotMatch(readmeContent, /01-getting-started\.md/);

  // llms.txt must exist and follow the llms.txt specification
  const llmsFile = zip.file('starlight-docs/llms.txt');
  assert.ok(llmsFile, 'llms.txt must exist in root for LLM navigation');
  const llmsContent = await llmsFile.async('text');
  assert.match(llmsContent, /# Starlight Docs/);
  assert.match(llmsContent, /## Start Here/);
  assert.match(llmsContent, /\[Getting Started\]\(start-here\/getting-started\.md\): Welcome guide to Starlight docs\./);

  // Files must be named without numeric prefixes
  const page1 = zip.file('starlight-docs/start-here/getting-started.md');
  assert.ok(page1, 'Page 1 must be inside start-here folder as getting-started.md');
  const page1Content = await page1.async('text');
  assert.match(page1Content, /Welcome to Starlight/);

  const page3 = zip.file('starlight-docs/guides/authoring-content.md');
  assert.ok(page3, 'Page 3 must be inside guides folder as authoring-content.md');
});
