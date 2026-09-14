/**
 * starlight-to-md: Background Service Worker (Manifest V3)
 * Handles file downloads, script injection, and message routing.
 */

import JSZip from 'jszip';
import { slugify, utf8ToBase64 } from './utils.js';
import { generateSingleMarkdown, buildZipArchive } from './bundler.js';

let batchStatus = {
  isRunning: false,
  format: 'zip',
  siteTitle: '',
  processed: 0,
  total: 0,
  currentTitle: '',
  tabId: null
};

/**
 * Broadcast status update to all extension views (popup).
 *
 * @param {string} type
 * @param {object} [extra]
 */
function broadcast(type, extra = {}) {
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    type,
    status: { ...batchStatus },
    ...extra
  }).catch(() => {
    // Popup might not be open, ignore error
  });
}

/**
 * Ensure content scripts are injected and responsive in the target tab.
 *
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function ensureContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (res && res.pong) return true;
  } catch {
    // Content script not ready, inject
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.js']
    });
    return true;
  } catch (err) {
    console.error('starlight-to-md: Failed to inject content script:', err);
    return false;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'ensureContentScript': {
      ensureContentScript(request.tabId).then(success => {
        sendResponse({ success });
      });
      return true;
    }

    case 'getBatchStatus': {
      sendResponse({ status: batchStatus });
      break;
    }

    case 'batchStarted': {
      batchStatus = {
        isRunning: true,
        format: request.format || 'zip',
        siteTitle: request.siteTitle || 'Documentation',
        processed: 0,
        total: request.total || 0,
        currentTitle: '',
        tabId: sender.tab?.id || null
      };
      broadcast('batchStarted');
      break;
    }

    case 'batchProgress': {
      batchStatus.processed = request.processed;
      batchStatus.total = request.total;
      batchStatus.currentTitle = request.currentTitle;
      broadcast('batchProgress');
      break;
    }

    case 'batchCancelled': {
      batchStatus.isRunning = false;
      broadcast('batchCancelled');
      break;
    }

    case 'batchError': {
      batchStatus.isRunning = false;
      broadcast('batchError', { error: request.error });
      break;
    }

    case 'batchComplete': {
      const { format, siteTitle, pages } = request;
      batchStatus.isRunning = false;

      (async () => {
        try {
          const siteSlug = slugify(siteTitle || 'docs');

          if (format === 'single') {
            const markdown = generateSingleMarkdown(siteTitle, pages);
            const encoded = utf8ToBase64(markdown);
            const dataUrl = `data:text/markdown;charset=utf-8;base64,${encoded}`;

            await chrome.downloads.download({
              url: dataUrl,
              filename: `${siteSlug}-all-docs.md`,
              saveAs: true
            });
          } else {
            // Default: ZIP
            const zip = buildZipArchive(siteTitle, pages, JSZip);
            const base64 = await zip.generateAsync({
              type: 'base64',
              compression: 'DEFLATE',
              compressionOptions: { level: 9 }
            });
            const dataUrl = `data:application/zip;base64,${base64}`;

            await chrome.downloads.download({
              url: dataUrl,
              filename: `${siteSlug}-docs.zip`,
              saveAs: true
            });
          }

          broadcast('batchDone');
        } catch (err) {
          console.error('starlight-to-md: Failed to package/download:', err);
          broadcast('batchError', { error: err.message });
        }
      })();

      break;
    }

    default:
      break;
  }

  return true;
});
