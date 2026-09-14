import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import JSZip from 'jszip';
import { execSync } from 'node:child_process';

function findChromeBinary() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  const playwrightCache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(playwrightCache)) {
    const entries = fs.readdirSync(playwrightCache);
    for (const entry of entries) {
      if (entry.startsWith('chromium-')) {
        const candidate = path.join(
          playwrightCache,
          entry,
          'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
        );
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

const chromeBin = findChromeBinary();

test('E2E: Chrome Extension loads, detects Starlight, and extracts docs', { timeout: 90000, skip: !chromeBin }, async (t) => {
  // Given: Freshly bundled extension and isolated browser context with CDP downloads enabled
  execSync('node build.js', { stdio: 'pipe' });

  const extensionPath = path.resolve('.');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starlight-e2e-'));
  const downloadsDir = path.join(tmpDir, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(tmpDir, {
      executablePath: chromeBin,
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    assert.ok(sw, 'Service worker must be registered');
    assert.match(sw.url(), /dist\/background\.js$/);

    const extensionId = sw.url().split('/')[2];
    assert.ok(extensionId, 'Extension ID must be extracted');

    // When: Navigating to a live Starlight documentation site (Google Antigravity)
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: downloadsDir,
      eventsEnabled: true
    });

    await page.goto('https://antigravity.google/docs/cli/getting-started', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    // When: Opening the extension popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await new Promise(r => setTimeout(r, 1000));

    // Then: Extension popup detects Starlight and counts sidebar pages
    const siteTitle = await popupPage.locator('#siteTitle').textContent();
    const pageCountText = await popupPage.locator('#pageCount').textContent();

    assert.equal(siteTitle, 'Google Antigravity Docs');
    assert.match(pageCountText, /\d+ documentation pages found in sidebar/);

    const convertCurrentBtn = popupPage.locator('#convertCurrentBtn');
    assert.equal(await convertCurrentBtn.isEnabled(), true);

    // -------------------------------------------------------------------------
    // Scenario 1: Download current page as markdown
    // -------------------------------------------------------------------------
    await t.test('Download current page as markdown', async () => {
      // Given: Active documentation page in ready state
      const filesBefore = fs.readdirSync(downloadsDir);

      // When: Clicking 'Download Current Page'
      await popupPage.click('#convertCurrentBtn');

      let newFile = null;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const currentFiles = fs.readdirSync(downloadsDir);
        newFile = currentFiles.find(f => !filesBefore.includes(f));
        if (newFile) break;
      }

      // Then: A single markdown file with valid frontmatter and substantive content is downloaded
      assert.ok(newFile, 'A new markdown file should be downloaded to downloadsDir');
      const content = fs.readFileSync(path.join(downloadsDir, newFile), 'utf8');

      assert.ok(content.length > 500, 'Markdown length should be substantive');
      assert.match(content, /^---\ntitle: "Getting Started with Antigravity CLI"/);
      assert.match(content, /# Getting Started with Antigravity CLI/);
      assert.match(content, /Welcome to Antigravity CLI/);
    });

    // -------------------------------------------------------------------------
    // Scenario 2: Batch export single consolidated markdown
    // -------------------------------------------------------------------------
    await t.test('Batch export single consolidated markdown', async () => {
      // Given: Active documentation tree with ~100 pages
      const filesBefore = fs.readdirSync(downloadsDir);

      // When: Clicking 'Download as Single Markdown'
      await popupPage.click('#batchSingleBtn');

      let completed = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const msg = await popupPage.locator('#messageBox').textContent();
        if (msg.includes('Download complete')) {
          completed = true;
          break;
        }
      }

      // Then: Batch completes and a single consolidated markdown file is generated
      assert.ok(completed, 'Batch single markdown export must complete');

      await new Promise(r => setTimeout(r, 1000));
      const currentFiles = fs.readdirSync(downloadsDir);
      const newFile = currentFiles.find(f => !filesBefore.includes(f));
      assert.ok(newFile, 'A new consolidated markdown file must be downloaded');

      const content = fs.readFileSync(path.join(downloadsDir, newFile), 'utf8');

      assert.ok(content.length > 100000, `Consolidated markdown should contain substantive content (got ${content.length} bytes)`);
      assert.match(content, /# Google Antigravity Docs/);
      assert.match(content, /## Table of Contents/);
      assert.match(content, /### Antigravity 2\.0/);
    });

    // -------------------------------------------------------------------------
    // Scenario 3: Batch export structured ZIP archive with category folders
    // -------------------------------------------------------------------------
    await t.test('Batch export structured ZIP archive with category folders', async () => {
      // Given: Active documentation tree
      const filesBefore = fs.readdirSync(downloadsDir);

      // When: Clicking 'Download All Pages (.zip)'
      await popupPage.click('#batchZipBtn');

      let completed = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const msg = await popupPage.locator('#messageBox').textContent();
        if (msg.includes('Download complete')) {
          completed = true;
          break;
        }
      }

      // Then: ZIP archive is downloaded containing organized category folders and README.md index
      assert.ok(completed, 'Batch ZIP export must complete');

      await new Promise(r => setTimeout(r, 1000));
      const currentFiles = fs.readdirSync(downloadsDir);
      const newZip = currentFiles.find(f => !filesBefore.includes(f));
      assert.ok(newZip, 'A new ZIP file must be downloaded');

      const zipBuffer = fs.readFileSync(path.join(downloadsDir, newZip));
      const zip = await JSZip.loadAsync(zipBuffer);
      const zipFiles = Object.keys(zip.files);

      assert.ok(zipFiles.length >= 100, `ZIP should contain all extracted doc pages (got ${zipFiles.length} files)`);
      assert.ok(zipFiles.includes('google-antigravity-docs/README.md'), 'ZIP must include README.md index');

      const readme = await zip.file('google-antigravity-docs/README.md').async('text');
      assert.match(readme, /# Google Antigravity Docs/);
      assert.match(readme, /## Content Index/);
      assert.match(readme, /- \[(Home|Welcome to Google Antigravity)\]/);
    });

  } finally {
    if (context) {
      await context.close();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});
