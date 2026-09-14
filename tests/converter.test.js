import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { convertToMarkdown, createStarlightTurndown } from '../src/converter.js';
import { extractArticleContent } from '../src/parser.js';

test('Expressive Code is converted to fenced code block with lang and title', () => {
  // Given: Starlight Expressive Code DOM structure with file title and copy button
  const html = `
    <div class="expressive-code">
      <figure class="frame">
        <figcaption class="header">
          <span class="title">terminal</span>
          <button data-copy>Copy</button>
        </figcaption>
        <pre data-language="bash">
          <code>
            <div class="ec-line">npm create astro@latest</div>
          </code>
        </pre>
      </figure>
    </div>
  `;

  // When: Converted to Markdown
  const md = convertToMarkdown(html, { title: 'CLI Setup' }, TurndownService);

  // Then: Code block contains language and title banner while stripping copy buttons
  assert.match(md, /```bash title="terminal"/);
  assert.match(md, /npm create astro@latest/);
  assert.doesNotMatch(md, /Copy/);
});

test('Starlight tabs are converted into labeled tab sections', () => {
  // Given: Interactive <starlight-tabs> component containing multiple package managers
  const html = `
    <starlight-tabs>
      <div role="tablist">
        <button role="tab">npm</button>
        <button role="tab">pnpm</button>
      </div>
      <section role="tabpanel">
        <p>Run npm install</p>
      </section>
      <section role="tabpanel">
        <p>Run pnpm install</p>
      </section>
    </starlight-tabs>
  `;

  // When: Converted to Markdown
  const md = convertToMarkdown(html, { title: 'Tabs Test' }, TurndownService);

  // Then: All tabs are preserved as labeled markdown subsections
  assert.match(md, /\*\*Tab: npm\*\*/);
  assert.match(md, /Run npm install/);
  assert.match(md, /\*\*Tab: pnpm\*\*/);
  assert.match(md, /Run pnpm install/);
});

test('Starlight asides are converted to GitHub-style alerts', () => {
  // Given: Starlight aside callout with title
  const html = `
    <aside class="starlight-aside starlight-aside--tip">
      <p class="starlight-aside__title">Pro Tip</p>
      <p>Use keyboard shortcut Ctrl+K to search.</p>
    </aside>
  `;

  // When: Converted to Markdown
  const md = convertToMarkdown(html, { title: 'Aside Test' }, TurndownService);

  // Then: Mapped to standard GitHub alert syntax
  assert.match(md, /> \[!TIP\] \*\*Pro Tip\*\*/);
  assert.match(md, /> Use keyboard shortcut/);
});

test('Starlight link cards and badges are converted cleanly', () => {
  // Given: Starlight link card and badge components
  const html = `
    <div class="sl-link-card">
      <a href="/guides/sidebar/"><span class="title">Sidebar Guide</span></a>
      <span class="description">How to configure navigation</span>
    </div>
    <p>Status: <span class="sl-badge">Experimental</span></p>
  `;

  // When: Converted to Markdown
  const md = convertToMarkdown(html, { title: 'Cards Test' }, TurndownService);

  // Then: Formatted as descriptive markdown links and inline backtick code
  assert.match(md, /\[\*\*Sidebar Guide\*\*\]\(\/guides\/sidebar\/\): How to configure navigation/);
  assert.match(md, /`Experimental`/);
});

test('Converts HTML tables into formatted GFM markdown tables with header separators', () => {
  // Given: HTML table with alignment attributes
  const html = `
    <table>
      <thead>
        <tr>
          <th>Command</th>
          <th align="center">Type</th>
          <th align="right">Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>starlight build</code></td>
          <td>CLI</td>
          <td>Execute build directly | piped</td>
        </tr>
      </tbody>
    </table>
  `;

  // When: Converted to Markdown
  const md = convertToMarkdown(html, { title: 'Tables Test' }, TurndownService);

  // Then: Produces valid GFM markdown table with alignment dashes and escaped pipes
  assert.match(md, /\| Command \| Type \| Description \|/);
  assert.match(md, /\| --- \| :---: \| ---: \|/);
  assert.match(md, /\| `starlight build` \| CLI \| Execute build directly \\\| piped \|/);
});

test('Converts full real Starlight article fixture with frontmatter', () => {
  // Given: Real Starlight documentation fixture HTML loaded into JSDOM
  const starlightHtml = fs.readFileSync(path.resolve('tests/fixtures/starlight.html'), 'utf8');
  const dom = new JSDOM(starlightHtml).window.document;
  const article = extractArticleContent(dom);

  // When: Full article is parsed and converted
  const md = convertToMarkdown(article.contentNode, {
    title: article.title,
    description: article.description,
    source: 'https://starlight.astro.build/getting-started/',
    category: 'Start Here',
    order: 1
  }, TurndownService);

  // Then: Complete frontmatter is present and UI navigation noise is omitted
  assert.match(md, /^---\n/);
  assert.match(md, /title: "Getting Started"/);
  assert.match(md, /source: "https:\/\/starlight\.astro\.build\/getting-started\/"/);
  assert.match(md, /category: "Start Here"/);
  assert.match(md, /order: 1/);

  assert.match(md, /# Getting Started/);
  assert.match(md, /Quick Start/);
  assert.doesNotMatch(md, /starlight-toc/);
  assert.doesNotMatch(md, /Select theme/);
  assert.doesNotMatch(md, /Copy code/);
});

test('convertToMarkdown omits frontmatter when includeFrontmatter is false', () => {
  // Given: Starlight article HTML and metadata with includeFrontmatter: false
  const html = '<article><h1>Plain Title</h1><p>Some plain paragraph.</p></article>';

  // When: Converted to Markdown with includeFrontmatter: false
  const md = convertToMarkdown(html, {
    title: 'Plain Title',
    includeFrontmatter: false
  }, TurndownService);

  // Then: Markdown starts directly with title heading without YAML block
  assert.doesNotMatch(md, /^---/);
  assert.ok(md.startsWith('# Plain Title'));
  assert.match(md, /Some plain paragraph\./);
});

test('Converts real Antigravity fixture with frontmatter and plain markdown options', () => {
  // Given: Real Google Antigravity documentation fixture
  const antigravityHtml = fs.readFileSync(path.resolve('tests/fixtures/antigravity.html'), 'utf8');
  const dom = new JSDOM(antigravityHtml).window.document;
  const article = extractArticleContent(dom);

  // When: Converted with default frontmatter enabled
  const withFm = convertToMarkdown(article.contentNode, {
    title: article.title,
    description: article.description,
    source: 'https://antigravity.google/docs/cli/getting-started',
    category: 'Antigravity CLI',
    order: 1,
    includeFrontmatter: true
  }, TurndownService);

  // Then: Frontmatter metadata is present
  assert.match(withFm, /^---\n/);
  assert.match(withFm, /title: "Getting Started with Antigravity CLI"/);
  assert.match(withFm, /source: "https:\/\/antigravity\.google\/docs\/cli\/getting-started"/);
  assert.match(withFm, /# Getting Started with Antigravity CLI/);

  // When: Converted with includeFrontmatter: false
  const plainMd = convertToMarkdown(article.contentNode, {
    title: article.title,
    description: article.description,
    source: 'https://antigravity.google/docs/cli/getting-started',
    includeFrontmatter: false
  }, TurndownService);

  // Then: Frontmatter is omitted and document begins directly with heading
  assert.doesNotMatch(plainMd, /^---/);
  assert.ok(plainMd.startsWith('# Getting Started with Antigravity CLI'));
  assert.match(plainMd, /## Roadmap checklist/);
  assert.match(plainMd, /curl -fsSL https:\/\/antigravity\.google\/cli\/install\.sh/);
});

