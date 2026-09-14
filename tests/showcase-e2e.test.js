import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { slugify } from '../src/utils.js';

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

const showcaseSites = [
  { name: 'Google Antigravity', url: 'https://antigravity.google/docs/cli/getting-started', expectedTitle: 'Google Antigravity Docs', minPages: 90 },
  { name: 'SST Ion', url: 'https://ion.sst.dev/docs/', expectedTitle: 'SST', minPages: 100 },
  { name: 'Biome', url: 'https://biomejs.dev/guides/getting-started/', expectedTitle: 'Biome', minPages: 50 },
  { name: 'Knip', url: 'https://knip.dev/overview/getting-started', expectedTitle: 'Knip', minPages: 30 },
  { name: 'Sharp', url: 'https://sharp.pixelplumbing.com/', expectedTitle: 'sharp', minPages: 100 },
  { name: 'PaperMC', url: 'https://docs.papermc.io/paper', expectedTitle: 'PaperMC Docs', minPages: 50 },
  { name: 'AstroNvim', url: 'https://docs.astronvim.com/', expectedTitle: 'AstroNvim Documentation', minPages: 30 },
  { name: 'OpenAI Agents SDK', url: 'https://openai.github.io/openai-agents-js/', expectedTitle: 'OpenAI Agents SDK', minPages: 500 }
];

test('E2E Showcase: Verify famous Starlight documentation sites across the web', { timeout: 240000, skip: !chromeBin }, async (t) => {
  // Given: An unpacked extension environment and a permanent test-results directory
  const extensionPath = path.resolve('.');
  const showcaseArtifactsDir = path.resolve('test-results/showcase');
  fs.mkdirSync(showcaseArtifactsDir, { recursive: true });

  const browserUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-browser-'));
  const downloadsDir = path.join(browserUserDataDir, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  let context;
  const auditReport = [];

  try {
    context = await chromium.launchPersistentContext(browserUserDataDir, {
      executablePath: chromeBin,
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = sw.url().split('/')[2];

    for (const site of showcaseSites) {
      await t.test(`Audit ${site.name} (${site.url})`, async () => {
        // Given: A target live Starlight documentation website
        const page = await context.newPage();
        let popupPage = null;

        try {
          // When: Navigating to the site and opening the extension popup
          await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await new Promise(r => setTimeout(r, 1200));

          popupPage = await context.newPage();
          await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

          await popupPage.waitForFunction(() => {
            const text = document.querySelector('#pageCount')?.textContent || '';
            return text.length > 0 && !text.includes('Scanning');
          }, { timeout: 15000 });

          const siteTitle = await popupPage.locator('#siteTitle').textContent();
          const pageCountText = await popupPage.locator('#pageCount').textContent();
          const isRawMd = pageCountText.includes('Raw Markdown');

          // Then: Verify title and sidebar page count extraction
          assert.ok(siteTitle.length > 0, `Site title must be non-empty for ${site.name}`);
          assert.match(pageCountText, /\d+ documentation pages found/);

          // When: Triggering the "Current Page (.md)" conversion download
          const [download] = await Promise.all([
            popupPage.waitForEvent('download', { timeout: 20000 }),
            popupPage.click('#convertCurrentBtn')
          ]);

          const downloadTempPath = await download.path();
          const mdContent = fs.readFileSync(downloadTempPath, 'utf8');

          // Then: Verify markdown substance, YAML frontmatter, and headings
          assert.ok(mdContent.length > 250, `Markdown content should be substantive (got ${mdContent.length} bytes)`);
          assert.match(mdContent, /^---\n/, 'Should contain YAML frontmatter');
          assert.match(mdContent, /# /, 'Should contain a primary Markdown header');

          // Persist the markdown file to test-results/showcase/ for manual inspection
          const siteSlug = slugify(site.name);
          const savedFileName = `${siteSlug}.md`;
          const savedFilePath = path.join(showcaseArtifactsDir, savedFileName);
          fs.writeFileSync(savedFilePath, mdContent, 'utf8');

          const estTokens = Math.round(mdContent.length / 4);

          auditReport.push({
            site: site.name,
            mode: isRawMd ? '⚡ Raw Markdown' : '🔄 HTML Turndown',
            title: siteTitle.replace(/[\r\n]+/g, ' ').trim(),
            pages: pageCountText.match(/\d+/)?.[0] || 'Unknown',
            sizeBytes: mdContent.length,
            sizeFormatted: `${(mdContent.length / 1024).toFixed(1)} KB`,
            estTokens: `~${estTokens.toLocaleString()}`,
            filePath: savedFilePath,
            status: 'PASS'
          });

        } finally {
          if (popupPage) await popupPage.close();
          await page.close();
        }
      });
    }

    // Print summary report table
    const totalBytes = auditReport.reduce((acc, r) => acc + r.sizeBytes, 0);
    const totalTokens = auditReport.reduce((acc, r) => acc + Math.round(r.sizeBytes / 4), 0);

    console.log('\n' + '━'.repeat(96));
    console.log('                   🌟 STARLIGHT EXTRACTOR: LIVE SHOWCASE AUDIT MATRIX');
    console.log('━'.repeat(96));
    console.log(
      'SITE'.padEnd(20) +
      'MODE'.padEnd(18) +
      'PAGES'.padEnd(8) +
      'SIZE'.padEnd(10) +
      'TOKENS'.padEnd(12) +
      'STATUS'.padEnd(8) +
      'INSPECT MARKDOWN'
    );
    console.log('─'.repeat(96));

    for (const row of auditReport) {
      const fileName = path.basename(row.filePath);
      console.log(
        row.site.padEnd(20) +
        row.mode.padEnd(18) +
        row.pages.padEnd(8) +
        row.sizeFormatted.padEnd(10) +
        row.estTokens.padEnd(12) +
        ('✔ ' + row.status).padEnd(8) +
        `test-results/showcase/${fileName}`
      );
    }

    console.log('━'.repeat(96));
    console.log(`✔ Summary: ${auditReport.length}/${showcaseSites.length} passed | Total extracted: ${(totalBytes / 1024).toFixed(1)} KB (~${totalTokens.toLocaleString()} tokens)`);
    console.log(`📂 All extracted Markdown files saved to: file://${showcaseArtifactsDir}`);
    console.log('━'.repeat(96) + '\n');

  } finally {
    if (context) {
      await context.close();
    }
    try {
      fs.rmSync(browserUserDataDir, { recursive: true, force: true });
    } catch {}
  }
});
