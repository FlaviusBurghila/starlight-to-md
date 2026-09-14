import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, slugify, normalizeUrl, cleanHeading, formatFrontmatter, utf8ToBase64 } from '../src/utils.js';

test('sanitizeName cleans illegal filesystem characters', () => {
  // Given: Document titles containing invalid filesystem characters or messy whitespace
  const rawWithSlashes = 'Getting Started: Intro / Setup';
  const rawWithTags = 'What is <Starlight>? *FAQ*';
  const rawEmpty = '';
  const rawDotted = '   ...doc-title...   ';

  // When: Sanitized for local filesystem safety
  const cleanSlashes = sanitizeName(rawWithSlashes);
  const cleanTags = sanitizeName(rawWithTags);
  const cleanEmpty = sanitizeName(rawEmpty);
  const cleanDotted = sanitizeName(rawDotted);

  // Then: All illegal characters are neutralized and fallbacks are applied
  assert.equal(cleanSlashes, 'Getting Started Intro - Setup');
  assert.equal(cleanTags, 'What is Starlight FAQ');
  assert.equal(cleanEmpty, 'untitled');
  assert.equal(cleanDotted, 'doc-title');
});

test('slugify converts text to safe URL/file slugs', () => {
  // Given: Heading strings with punctuation and spaces
  const titleWithParens = 'Getting Started (CLI)';
  const titleWithAmpersand = 'Starlight & Astro: A Guide!';
  const titleWithWhitespace = '   hello   world   ';
  const titleEmpty = '';

  // When: Slugifying to kebab-case
  const slug1 = slugify(titleWithParens);
  const slug2 = slugify(titleWithAmpersand);
  const slug3 = slugify(titleWithWhitespace);
  const slug4 = slugify(titleEmpty);

  // Then: Output matches kebab-case alphanumeric characters only
  assert.equal(slug1, 'getting-started-cli');
  assert.equal(slug2, 'starlight-astro-a-guide');
  assert.equal(slug3, 'hello-world');
  assert.equal(slug4, 'untitled');
});

test('normalizeUrl resolves relative links and strips hashes', () => {
  // Given: A base documentation URL and various relative/query/hash link formats
  const base = 'https://starlight.astro.build/getting-started/';
  const relativeLink = 'manual-setup/#prerequisites';
  const rootRelativeLink = '/guides/components/#tabs';
  const linkWithTracking = 'https://example.com/docs?utm_source=twitter&ref=header#foo';

  // When: Normalizing URLs
  const resolved1 = normalizeUrl(relativeLink, base);
  const resolved2 = normalizeUrl(rootRelativeLink, base);
  const resolved3 = normalizeUrl(linkWithTracking);

  // Then: Query parameters, hashes, and relative fragments are cleanly canonicalized
  assert.equal(resolved1, 'https://starlight.astro.build/getting-started/manual-setup/');
  assert.equal(resolved2, 'https://starlight.astro.build/guides/components/');
  assert.equal(resolved3, 'https://example.com/docs/');
});

test('cleanHeading strips permalinks and markdown symbols even with trailing whitespace', () => {
  // Given: Header text with copy anchor emojis, permalink hashes, and paragraph symbols
  const headerWithEmoji = '### Installation 🔗';
  const headerWithHash = 'Getting Started #';
  const headerWithTrailingHash = 'Getting Started #   ';
  const headerWithTab = 'Overview 🔗 \t';
  const headerWithPilcrow = 'Overview ¶';

  // When: Stripping permalinks and markdown tokens
  const clean1 = cleanHeading(headerWithEmoji);
  const clean2 = cleanHeading(headerWithHash);
  const clean3 = cleanHeading(headerWithTrailingHash);
  const clean4 = cleanHeading(headerWithTab);
  const clean5 = cleanHeading(headerWithPilcrow);

  // Then: Pure semantic heading text remains
  assert.equal(clean1, 'Installation');
  assert.equal(clean2, 'Getting Started');
  assert.equal(clean3, 'Getting Started');
  assert.equal(clean4, 'Overview');
  assert.equal(clean5, 'Overview');
});

test('formatFrontmatter outputs valid YAML frontmatter block with proper string escaping', () => {
  // Given: Metadata with multi-line strings, backslashes, and array tags
  const metadata = {
    title: 'Getting Started',
    description: 'Introduction\nwith newlines\rand backslashes: C:\\Users\\test',
    source: 'https://antigravity.google/docs/cli/getting-started',
    order: 1,
    tags: ['cli', 'tools\nand utilities']
  };

  // When: Formatting frontmatter block
  const yaml = formatFrontmatter(metadata);

  // Then: Valid YAML delimiters are produced with proper string escaping
  assert.match(yaml, /^---\n/);
  assert.match(yaml, /title: "Getting Started"/);
  assert.match(yaml, /description: "Introduction with newlines and backslashes: C:\\\\Users\\\\test"/);
  assert.match(yaml, /order: 1/);
  assert.match(yaml, /tags:\n  - "cli"\n  - "tools and utilities"/);
  assert.match(yaml, /---\n$/);
});

test('utf8ToBase64 converts UTF-8 strings and multi-byte unicode cleanly', () => {
  // Given: A multi-byte Unicode string with emojis and multilingual characters
  const sample = 'Hello 🚀 — Starlight Extractor: é, à, ç, 简体中文, 日本語, 한국어';

  // When: Base64 encoding using chunked UTF-8 pipeline
  const encoded = utf8ToBase64(sample);

  // Then: Decodes back losslessly to the exact original UTF-8 string
  assert.equal(typeof encoded, 'string');
  assert.ok(encoded.length > 0);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(decoded, sample);

  // Given: A large payload (> 16KB)
  const largeSample = sample.repeat(500);

  // When: Encoding large payload
  const largeEncoded = utf8ToBase64(largeSample);

  // Then: Decodes accurately without stack overflows or truncation
  const largeDecoded = Buffer.from(largeEncoded, 'base64').toString('utf8');
  assert.equal(largeDecoded, largeSample);

  // Given & When: Empty or null inputs
  const emptyRes = utf8ToBase64('');
  const nullRes = utf8ToBase64(null);

  // Then: Handled gracefully without errors
  assert.equal(emptyRes, '');
  assert.equal(nullRes, '');
});
