/**
 * Core utility functions for starlight-to-md
 */

/**
 * Sanitize a string for safe use as a file or folder name.
 *
 * @param {string} name
 * @param {string} [defaultName='untitled']
 * @returns {string}
 */
export function sanitizeName(name, defaultName = 'untitled') {
  if (!name || typeof name !== 'string') {
    return defaultName;
  }

  let sanitized = name
    .replace(/[\\/]/g, '-')
    .replace(/[:*?"<>|]/g, '')
    .replace(/[\u00A0\t\r\n]+/g, ' ')
    .trim();

  sanitized = sanitized.replace(/^[\s.-]+|[\s.-]+$/g, '');
  return sanitized.length > 0 ? sanitized : defaultName;
}

/**
 * Convert a title or text into a URL/file-safe slug.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text || typeof text !== 'string') {
    return 'untitled';
  }

  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'untitled';
}

/**
 * Normalize and resolve a doc link relative to a base URL.
 *
 * @param {string} href
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function normalizeUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return '';
  try {
    const parsed = baseUrl ? new URL(href, baseUrl) : new URL(href);
    parsed.hash = '';
    const cleanSearchParams = new URLSearchParams();
    for (const [key, val] of parsed.searchParams.entries()) {
      if (!key.startsWith('utm_') && key !== 'ref') {
        cleanSearchParams.set(key, val);
      }
    }
    parsed.search = cleanSearchParams.toString();
    if (parsed.pathname && !parsed.pathname.endsWith('/') && !parsed.pathname.includes('.')) {
      parsed.pathname += '/';
    }
    return parsed.toString();
  } catch {
    return href.split('#')[0];
  }
}

/**
 * Clean heading text by removing anchor links, badges, and redundant whitespace.
 *
 * @param {string} heading
 * @returns {string}
 */
export function cleanHeading(heading) {
  if (!heading || typeof heading !== 'string') return '';
  return heading
    .replace(/[\u00A0\t\r\n]+/g, ' ')
    .trim()
    .replace(/^#+\s+/, '')
    .replace(/(?:[\s\u00A0]+#+|[🔗¶§\s]+)$/, '')
    .trim();
}

/**
 * Format YAML frontmatter string given key-value pairs.
 *
 * @param {Record<string, any>} fields
 * @returns {string}
 */
export function formatFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const sanitized = value.replace(/[\r\n\t]+/g, ' ').trim();
      lines.push(`${key}: ${JSON.stringify(sanitized)}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        const sanitized = String(item).replace(/[\r\n\t]+/g, ' ').trim();
        lines.push(`  - ${JSON.stringify(sanitized)}`);
      }
    }
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

/**
 * Safely encode a UTF-8 string to base64 without relying on deprecated unescape().
 * Handles arbitrary length strings in chunks to prevent stack overflow.
 *
 * @param {string} str
 * @returns {string}
 */
export function utf8ToBase64(str) {
  if (!str || typeof str !== 'string') return '';
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

