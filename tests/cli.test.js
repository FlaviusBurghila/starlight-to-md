import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { runCli } from '../bin/cli.js';

function startFixtureServer() {
  const fixtureHtml = fs.readFileSync(path.resolve('tests/fixtures/starlight.html'), 'utf8');

  const server = http.createServer((req, res) => {
    if (req.url === '/manual-setup.md') {
      res.writeHead(200, { 'Content-Type': 'text/markdown' });
      res.end('# Author Raw Markdown\n\nDirect markdown served.');
      return;
    }

    if (req.url === '/getting-started' || req.url === '/getting-started/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fixtureHtml);
      return;
    }

    if (req.url === '/manual-setup' || req.url === '/manual-setup/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Manual Setup | Starlight</title></head>
          <body>
            <main>
              <h1>Manual Setup</h1>
              <p>Manual installation instructions.</p>
            </main>
          </body>
        </html>
      `);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fixtureHtml);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({ server, baseUrl });
    });
  });
}

test('CLI prints help message and exits with code 0 on --help', async () => {
  // Given: Standard CLI help request
  let stdoutOutput = '';
  const originalLog = console.log;
  console.log = (msg) => { stdoutOutput += msg + '\n'; };

  try {
    // When: runCli is executed with --help
    const exitCode = await runCli(['--help']);

    // Then: Exit code is 0 and usage instructions are displayed
    assert.equal(exitCode, 0);
    assert.match(stdoutOutput, /USAGE:/);
    assert.match(stdoutOutput, /starlight-to-md <url>/);
    assert.match(stdoutOutput, /--all/);
  } finally {
    console.log = originalLog;
  }
});

test('CLI prints version and exits with code 0 on --version', async () => {
  // Given: Standard CLI version request
  let stdoutOutput = '';
  const originalLog = console.log;
  console.log = (msg) => { stdoutOutput += msg + '\n'; };

  try {
    // When: runCli is executed with --version
    const exitCode = await runCli(['--version']);

    // Then: Exit code is 0 and version is displayed
    assert.equal(exitCode, 0);
    assert.match(stdoutOutput, /^v1\.0\.0/);
  } finally {
    console.log = originalLog;
  }
});

test('CLI rejects missing or invalid URL with code 1', async () => {
  // Given: Invocation without valid URL
  let stderrOutput = '';
  const originalError = console.error;
  console.error = (msg) => { stderrOutput += msg + '\n'; };

  try {
    // When: runCli is called with invalid arguments
    const missingCode = await runCli([]);
    const invalidCode = await runCli(['not-a-valid-url']);

    // Then: Both invocations exit with 1 and log error
    assert.equal(missingCode, 1);
    assert.equal(invalidCode, 1);
    assert.match(stderrOutput, /Error:/);
  } finally {
    console.error = originalError;
  }
});

test('CLI extracts single page to target markdown file', async () => {
  // Given: A local fixture server and a temporary output directory
  const { server, baseUrl } = await startFixtureServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-single-'));
  const outFile = path.join(tmpDir, 'page.md');

  try {
    // When: CLI extracts a single documentation URL to outFile
    const exitCode = await runCli([`${baseUrl}/getting-started`, '-o', outFile]);

    // Then: File is written with clean frontmatter and content
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(outFile));
    const content = fs.readFileSync(outFile, 'utf8');
    assert.match(content, /^---\ntitle: "Getting Started"/);
    assert.match(content, /# Getting Started/);
    assert.match(content, /\*\*Tab: npm\*\*/);
    assert.match(content, /npm create astro@latest/);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI consolidates documentation into a single markdown file with --all --single', async () => {
  // Given: A local fixture server and a single markdown target path
  const { server, baseUrl } = await startFixtureServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-merged-'));
  const outFile = path.join(tmpDir, 'merged-docs.md');

  try {
    // When: CLI extracts with --all and --single
    const exitCode = await runCli([
      `${baseUrl}/getting-started`,
      '--all',
      '--single',
      '-o', outFile,
      '--quiet'
    ]);

    // Then: Consolidated file is generated with unified Table of Contents
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(outFile));
    const content = fs.readFileSync(outFile, 'utf8');
    assert.match(content, /## Table of Contents/);
    assert.match(content, /### Start Here/);
    assert.match(content, /<!-- Page: Getting Started/);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI packages documentation tree into structured ZIP archive with --all --zip', async () => {
  // Given: A local fixture server and a zip target path
  const { server, baseUrl } = await startFixtureServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-zip-'));
  const zipFile = path.join(tmpDir, 'docs.zip');

  try {
    // When: CLI extracts with --all and --zip
    const exitCode = await runCli([
      `${baseUrl}/getting-started`,
      '--all',
      '--zip',
      '-o', zipFile,
      '--quiet'
    ]);

    // Then: Valid ZIP archive is generated containing category folders and README.md
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(zipFile));
    const buffer = fs.readFileSync(zipFile);
    const zip = await JSZip.loadAsync(buffer);

    const filePaths = Object.keys(zip.files);
    assert.ok(filePaths.some(p => p.endsWith('README.md')));
    assert.ok(filePaths.some(p => p.includes('getting-started.md')));
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI omits YAML frontmatter when --no-frontmatter is passed', async () => {
  // Given: A local fixture server and a temporary output directory
  const { server, baseUrl } = await startFixtureServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-plain-'));
  const outFile = path.join(tmpDir, 'plain-page.md');

  try {
    // When: CLI extracts page with --no-frontmatter
    const exitCode = await runCli([
      `${baseUrl}/getting-started`,
      '--no-frontmatter',
      '-o', outFile,
      '--quiet'
    ]);

    // Then: Output starts directly with title heading without YAML block
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(outFile));
    const content = fs.readFileSync(outFile, 'utf8');
    assert.doesNotMatch(content, /^---/);
    assert.ok(content.startsWith('# Getting Started'));
    assert.match(content, /npm create astro@latest/);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI omits YAML frontmatter when --plain is passed', async () => {
  // Given: A local fixture server and a temporary output directory
  const { server, baseUrl } = await startFixtureServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-plain-alias-'));
  const outFile = path.join(tmpDir, 'plain-page.md');

  try {
    // When: CLI extracts page with --plain
    const exitCode = await runCli([
      `${baseUrl}/getting-started`,
      '--plain',
      '-o', outFile,
      '--quiet'
    ]);

    // Then: Output starts directly with title heading without YAML block
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(outFile));
    const content = fs.readFileSync(outFile, 'utf8');
    assert.doesNotMatch(content, /^---/);
    assert.ok(content.startsWith('# Getting Started'));
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI allows -s without -a to consolidate entire site into single markdown file', async () => {
  // Given: A local fixture server and temporary output directory
  const { server, baseUrl } = await startFixtureServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-single-short-'));
  const outFile = path.join(tmpDir, 'full-docs.md');

  try {
    // When: CLI runs with -s (implying full site consolidation)
    const exitCode = await runCli([
      `${baseUrl}/getting-started`,
      '-s',
      '-o', outFile,
      '--quiet'
    ]);

    // Then: Complete consolidated markdown with TOC is written
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(outFile));
    const content = fs.readFileSync(outFile, 'utf8');
    assert.match(content, /# Starlight/);
    assert.match(content, /## Table of Contents/);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

