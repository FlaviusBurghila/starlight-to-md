import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { isStarlightSite, getSiteTitle, extractSidebar, extractArticleContent } from '../src/parser.js';

const starlightHtml = fs.readFileSync(path.resolve('tests/fixtures/starlight.html'), 'utf8');
const antigravityHtml = fs.readFileSync(path.resolve('tests/fixtures/antigravity.html'), 'utf8');

// ---------------------------------------------------------------------------
// isStarlightSite Detection Across Eras
// ---------------------------------------------------------------------------

test('isStarlightSite correctly detects modern Starlight fixtures', () => {
  // Given: Production Starlight documentation pages (Starlight official docs & Google Antigravity)
  const starlightDom = new JSDOM(starlightHtml).window.document;
  const antigravityDom = new JSDOM(antigravityHtml).window.document;

  // When: Evaluating Starlight signatures
  const isStarlight1 = isStarlightSite(starlightDom);
  const isStarlight2 = isStarlightSite(antigravityDom);

  // Then: Both sites are definitively identified as Starlight
  assert.equal(isStarlight1, true);
  assert.equal(isStarlight2, true);
});

test('isStarlightSite rejects false positives on non-Starlight sites', () => {
  // Given: A plain non-documentation website
  const plainDom = new JSDOM('<!DOCTYPE html><html><head><title>Normal</title></head><body><h1>Hello</h1></body></html>').window.document;

  // When & Then: Verified not to be Starlight
  assert.equal(isStarlightSite(plainDom), false);

  // Given: An Astro website (blog) that does NOT use Starlight
  const astroBlogDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="generator" content="Astro v4.0.0">
        <link rel="stylesheet" href="/_astro/style.css">
      </head>
      <body>
        <nav class="sidebar" aria-label="Main"><ul><li><a href="/post-1">Post 1</a></li></ul></nav>
        <main><article><h1>Blog Post</h1></article></main>
      </body>
    </html>
  `).window.document;

  // When & Then: Astro site without Starlight markers must not be detected
  assert.equal(isStarlightSite(astroBlogDom), false, 'Astro site without Starlight markers must not be detected as Starlight');

  // Given: Generic docs framework (Hugo / Docusaurus / MkDocs with .sidebar)
  const genericDocsDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head><title>Hugo Docs</title></head>
      <body>
        <nav class="sidebar" aria-label="Main"><ul><li><a href="/intro">Intro</a></li></ul></nav>
        <main><article><h1>Hugo Doc</h1></article></main>
      </body>
    </html>
  `).window.document;

  // When & Then: Generic docs framework with .sidebar must be rejected
  assert.equal(isStarlightSite(genericDocsDom), false, 'Generic docs framework with .sidebar must be rejected');

  // Given: Site with a generic element id="theme-icons"
  const genericThemeIconsDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head><title>Some Blog</title></head>
      <body>
        <div id="theme-icons"></div>
        <p>Not starlight</p>
      </body>
    </html>
  `).window.document;

  // When & Then: Must not trigger detection on isolated generic element ID
  assert.equal(isStarlightSite(genericThemeIconsDom), false, 'Site with generic #theme-icons must NOT be detected as Starlight');
});

test('isStarlightSite detects Era 1 (v0.1.0) Starlight sites without generator tag', () => {
  // Given: Starlight v0.1.0 DOM (no generator meta tag, data-has-sidebar, ThemeProvider script)
  const v010Dom = new JSDOM(`
    <!DOCTYPE html>
    <html lang="en" dir="ltr" data-has-toc data-has-sidebar>
      <head>
        <meta name="generator" content="Astro v2.5.0">
        <script>
          window.StarlightThemeProvider = (() => { return {}; })();
        </script>
      </head>
      <body>
        <nav class="sidebar">
          <div id="starlight__sidebar" class="sidebar-pane">
            <ul><li><details open><summary><h2>Guide</h2></summary><ul><li><a href="/doc">Doc</a></li></ul></details></li></ul>
          </div>
        </nav>
        <main data-pagefind-body><div class="content"><h1>Doc</h1></div></main>
      </body>
    </html>
  `).window.document;

  // When: Evaluating legacy Starlight presence
  const isDetected = isStarlightSite(v010Dom);

  // Then: Detected via dataset, script, and stable ID
  assert.equal(isDetected, true, 'Starlight v0.1.0 must be detected via dataset, script, and stable ID');
});

test('isStarlightSite detects Era 1 splash pages without sidebars', () => {
  // Given: Starlight v0.1.0 splash landing page (no sidebar, no TOC, data-has-hero)
  const splashDom = new JSDOM(`
    <!DOCTYPE html>
    <html lang="en" dir="ltr" data-has-hero>
      <head>
        <meta name="generator" content="Astro v2.5.0">
        <script>
          window.StarlightThemeProvider = (() => { return {}; })();
        </script>
        <link rel="stylesheet" href="/_astro/style.css">
      </head>
      <body>
        <header><a class="site-title">My Docs</a></header>
        <main><div class="hero"><h1>Welcome</h1></div></main>
      </body>
    </html>
  `).window.document;

  // When: Evaluating splash page
  const isDetected = isStarlightSite(splashDom);

  // Then: Early Starlight splash page is detected
  assert.equal(isDetected, true, 'Early Starlight splash pages must be detected');
});

test('isStarlightSite detects via @layer starlight CSS (Era 4/5)', () => {
  // Given: Modern Starlight DOM using CSS layer scoping
  const cssLayerDom = new JSDOM(`
    <!DOCTYPE html>
    <html data-has-sidebar>
      <head>
        <style>@layer starlight.components { .card { border: 1px solid } }</style>
      </head>
      <body><main></main></body>
    </html>
  `).window.document;

  // When: Evaluating CSS layer marker
  const isDetected = isStarlightSite(cssLayerDom);

  // Then: Identified via @layer starlight
  assert.equal(isDetected, true, 'Starlight must be detected via @layer starlight CSS');
});

test('isStarlightSite returns false for null/undefined/DocumentFragment input', () => {
  // Given: Invalid DOM inputs
  const nullInput = null;
  const undefinedInput = undefined;
  const fragment = new JSDOM().window.document.createDocumentFragment();

  // When & Then: Handled defensively without exceptions
  assert.equal(isStarlightSite(nullInput), false);
  assert.equal(isStarlightSite(undefinedInput), false);
  assert.equal(isStarlightSite(fragment), false);
});

// ---------------------------------------------------------------------------
// getSiteTitle Across Eras
// ---------------------------------------------------------------------------

test('getSiteTitle extracts correct site name across Starlight title patterns', () => {
  // Given: Modern Starlight DOM fixtures
  const starlightDom = new JSDOM(starlightHtml).window.document;
  const antigravityDom = new JSDOM(antigravityHtml).window.document;

  // When: Extracting site titles
  const title1 = getSiteTitle(starlightDom);
  const title2 = getSiteTitle(antigravityDom);

  // Then: Canonical site titles are extracted
  assert.equal(title1, 'Starlight');
  assert.equal(title2, 'Google Antigravity Docs');

  // Given: Starlight Logo-only mode (title inside .sr-only span)
  const logoOnlyDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <header class="header">
          <div class="title-wrapper">
            <a href="/" class="site-title">
              <img src="/logo.svg" alt="Brand Logo" />
              <span class="sr-only" translate="no">My Brand Docs</span>
            </a>
          </div>
        </header>
      </body>
    </html>
  `).window.document;

  // When & Then: Extracted from screen-reader span
  assert.equal(getSiteTitle(logoOnlyDom), 'My Brand Docs');

  // Given: Starlight Logo-only with image alt fallback (no span)
  const imageAltDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <header class="header">
          <div class="title-wrapper">
            <a href="/" class="site-title">
              <img src="/logo.svg" alt="Custom Logo Docs" />
            </a>
          </div>
        </header>
      </body>
    </html>
  `).window.document;

  // When & Then: Extracted from image alt attribute
  assert.equal(getSiteTitle(imageAltDom), 'Custom Logo Docs');

  // Given: Delimited document titles (pipe and hyphen)
  const complexTitleDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head><title>Union Types: string | number | TypeScript Docs</title></head>
      <body></body>
    </html>
  `).window.document;

  // When & Then: Parses right-to-left preserving internal delimiters
  assert.equal(getSiteTitle(complexTitleDom), 'TypeScript Docs');

  const hyphenTitleDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head><title>Step 1 - Getting Started - Project Docs</title></head>
      <body></body>
    </html>
  `).window.document;

  assert.equal(getSiteTitle(hyphenTitleDom), 'Project Docs');
});

// ---------------------------------------------------------------------------
// extractSidebar Across Eras (v0.1.0 to v0.42.0+)
// ---------------------------------------------------------------------------

test('extractSidebar extracts pages from Era 1 (v0.1.0) with <h2> group headers and no top-level class', () => {
  // Given: Early Starlight v0.1.0 DOM structure using <h2> in <summary> and #starlight__sidebar
  const era1Dom = new JSDOM(`
    <!DOCTYPE html>
    <html data-has-sidebar>
      <body>
        <nav class="sidebar" aria-label="Main">
          <div id="starlight__sidebar" class="sidebar-pane">
            <div class="sidebar-content">
              <ul>
                <li class="sidebar-group">
                  <details open>
                    <summary>
                      <h2>Getting Started</h2>
                      <svg class="caret"></svg>
                    </summary>
                    <ul>
                      <li><a href="/intro" aria-current="page">Introduction</a></li>
                      <li><a href="/install">Installation</a></li>
                    </ul>
                  </details>
                </li>
                <li class="sidebar-group">
                  <details open>
                    <summary>
                      <h2>Guides</h2>
                      <svg class="caret"></svg>
                    </summary>
                    <ul>
                      <li><a href="/guides/routing">Routing</a></li>
                    </ul>
                  </details>
                </li>
              </ul>
            </div>
          </div>
        </nav>
      </body>
    </html>
  `, { url: 'https://example.com/intro' }).window.document;

  // When: Extracting sidebar navigation
  const pages = extractSidebar(era1Dom, 'https://example.com/intro');

  // Then: All pages, categories, and current page state are resolved
  assert.equal(pages.length, 3, 'Must extract all pages from multiple groups');
  assert.equal(pages[0].title, 'Introduction');
  assert.equal(pages[0].category, 'Getting Started', 'Must extract h2 group header as category');
  assert.equal(pages[0].isCurrent, true);
  assert.equal(pages[1].title, 'Installation');
  assert.equal(pages[1].category, 'Getting Started');
  assert.equal(pages[2].title, 'Routing');
  assert.equal(pages[2].category, 'Guides', 'Must extract second group');
});

test('extractSidebar preserves nested subcategories with breadcrumbs', () => {
  // Given: Deeply nested sidebar groups (Guides > Advanced > Deep Dive)
  const nestedDom = new JSDOM(`
    <!DOCTYPE html>
    <html data-has-sidebar>
      <body>
        <nav class="sidebar">
          <ul class="top-level">
            <li>
              <details open>
                <summary><span class="group-label"><span class="large">Guides</span></span></summary>
                <ul>
                  <li><a href="/guides/basics">Basics</a></li>
                  <li>
                    <details open>
                      <summary><span class="group-label"><span class="large">Advanced</span></span></summary>
                      <ul>
                        <li><a href="/guides/advanced/deep-dive">Deep Dive</a></li>
                      </ul>
                    </details>
                  </li>
                </ul>
              </details>
            </li>
          </ul>
        </nav>
      </body>
    </html>
  `, { url: 'https://example.com/' }).window.document;

  // When: Extracting sidebar
  const pages = extractSidebar(nestedDom, 'https://example.com/');

  // Then: Nested categories are breadcrumbed
  assert.equal(pages.length, 2);
  assert.equal(pages[0].title, 'Basics');
  assert.equal(pages[0].category, 'Guides');
  assert.equal(pages[1].title, 'Deep Dive');
  assert.equal(pages[1].category, 'Guides / Advanced', 'Subgroup must be breadcrumbed under parent');
});

test('extractSidebar excludes non-doc links (social icons, theme/lang selectors)', () => {
  // Given: Sidebar containing social links and theme switcher
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html data-has-sidebar>
      <body>
        <nav class="sidebar">
          <ul class="top-level">
            <li><a href="/docs/intro">Intro</a></li>
            <li>
              <div class="social-icons">
                <a href="https://github.com/example/repo">GitHub</a>
              </div>
            </li>
            <li>
              <starlight-theme-select>
                <a href="/theme">Theme</a>
              </starlight-theme-select>
            </li>
          </ul>
        </nav>
      </body>
    </html>
  `, { url: 'https://example.com/' }).window.document;

  // When: Extracting sidebar
  const pages = extractSidebar(dom, 'https://example.com/');

  // Then: Only documentation links are extracted
  assert.equal(pages.length, 1);
  assert.equal(pages[0].title, 'Intro');
});

test('extractSidebar extracts pages from real Starlight and Antigravity fixtures', () => {
  // Given: Real Starlight DOM fixtures
  const dom = new JSDOM(starlightHtml, { url: 'https://starlight.astro.build/getting-started/' });
  const agDom = new JSDOM(antigravityHtml, { url: 'https://antigravity.google/docs/cli/getting-started' });

  // When: Extracting sidebar navigation
  const pages = extractSidebar(dom.window.document, 'https://starlight.astro.build/getting-started/');
  const agPages = extractSidebar(agDom.window.document, 'https://antigravity.google/docs/cli/getting-started');

  // Then: Complete navigation hierarchies are recovered
  assert.ok(pages.length > 20);
  assert.equal(pages[0].title, 'Getting Started');
  assert.equal(pages[0].category, 'Start Here');

  assert.ok(agPages.length > 50);
  const cliPage = agPages.find(p => p.url.includes('/docs/cli/getting-started'));
  assert.ok(cliPage);
  assert.equal(cliPage.category, 'Antigravity CLI');
});

// ---------------------------------------------------------------------------
// extractArticleContent Across Eras & Edge Cases
// ---------------------------------------------------------------------------

test('extractArticleContent extracts content from Era 1-2 (.content) wrapper', () => {
  // Given: Pre-v0.14.0 Starlight page using .content wrapper instead of .sl-markdown-content
  const era1ContentDom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head><meta name="description" content="Old Starlight docs"></head>
      <body>
        <main data-pagefind-body>
          <div class="content">
            <h1 id="starlight__overview">Overview Page</h1>
            <p>This is the markdown body of old Starlight.</p>
          </div>
          <footer><p>Footer content should be outside content</p></footer>
        </main>
      </body>
    </html>
  `).window.document;

  // When: Extracting article content
  const article = extractArticleContent(era1ContentDom);

  // Then: Title, description, and .content container are isolated
  assert.equal(article.title, 'Overview Page');
  assert.equal(article.description, 'Old Starlight docs');
  assert.ok(article.contentNode !== null);
  assert.ok(article.contentNode.classList.contains('content'), 'Should target .content wrapper');
});

test('extractArticleContent preserves technical terms in cleanHeading (C#, F#, #1)', () => {
  // Given: Headings containing technical symbols (#)
  const csharpDom = new JSDOM(`
    <!DOCTYPE html>
    <html><body><main><h1>C# Programming Guide</h1><div class="sl-markdown-content"><p>C#</p></div></main></body></html>
  `).window.document;

  const issueDom = new JSDOM(`
    <!DOCTYPE html>
    <html><body><main><h1>#1 Architecture Overview</h1><div class="sl-markdown-content"><p>Body</p></div></main></body></html>
  `).window.document;

  // When: Extracting articles
  const art1 = extractArticleContent(csharpDom);
  const art2 = extractArticleContent(issueDom);

  // Then: Technical symbols are preserved without being stripped as markdown hashes
  assert.equal(art1.title, 'C# Programming Guide');
  assert.equal(art2.title, '#1 Architecture Overview');
});

test('extractArticleContent preserves anchor text inside h1 (markdown link)', () => {
  // Given: Heading containing an inline link
  const linkInH1Dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <main>
          <h1>Using <a href="https://react.dev">React</a> with Starlight</h1>
          <div class="sl-markdown-content"><p>Content</p></div>
        </main>
      </body>
    </html>
  `).window.document;

  // When: Extracting article
  const article = extractArticleContent(linkInH1Dom);

  // Then: Text inside anchor is retained in heading
  assert.equal(article.title, 'Using React with Starlight');
});

test('extractArticleContent extracts hero section on landing pages', () => {
  // Given: Starlight hero landing page
  const heroDom = new JSDOM(`
    <!DOCTYPE html>
    <html data-has-hero>
      <body>
        <main>
          <div class="content-panel">
            <div class="hero">
              <h1 id="_top">Starlight Documentation</h1>
              <div class="tagline">Make your docs shine</div>
            </div>
            <div class="sl-markdown-content">
              <p>Additional landing page content</p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `).window.document;

  // When: Extracting article content
  const article = extractArticleContent(heroDom);

  // Then: Container includes both the hero and the markdown content
  assert.equal(article.title, 'Starlight Documentation');
  assert.ok(article.contentNode !== null);
  assert.ok(article.contentNode.querySelector('.hero') !== null, 'Hero must be inside contentNode');
});
