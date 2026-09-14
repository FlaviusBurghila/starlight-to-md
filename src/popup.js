/**
 * starlight-to-md: Popup Script
 * Manages the extension popup UI, tab communication, and export actions.
 */
import { utf8ToBase64 } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  const siteStatusEl = document.getElementById('siteStatus');
  const siteTitleEl = document.getElementById('siteTitle');
  const pageCountEl = document.getElementById('pageCount');

  const actionsGroupEl = document.getElementById('actionsGroup');
  const convertCurrentBtn = document.getElementById('convertCurrentBtn');
  const batchZipBtn = document.getElementById('batchZipBtn');
  const batchSingleBtn = document.getElementById('batchSingleBtn');

  const progressSectionEl = document.getElementById('progressSection');
  const progressPercentEl = document.getElementById('progressPercent');
  const progressBarEl = document.getElementById('progressBar');
  const progressDetailEl = document.getElementById('progressDetail');
  const cancelBtn = document.getElementById('cancelBtn');

  const messageBoxEl = document.getElementById('messageBox');
  const frontmatterToggle = document.getElementById('frontmatterToggle');
  const toggleText = document.getElementById('toggleText');
  const toggleBadge = document.getElementById('toggleBadge');
  const footerStatus = document.querySelector('.footer-status');

  let activeTabId = null;
  let activeTabUrl = '';
  let currentSiteInfo = null;

  function showMessage(text, type = 'info', duration = 4000) {
    messageBoxEl.textContent = text;
    messageBoxEl.className = `message-box ${type}`;
    if (duration > 0) {
      setTimeout(() => {
        messageBoxEl.className = 'message-box hidden';
      }, duration);
    }
  }

  function setButtonsEnabled(enabled) {
    convertCurrentBtn.disabled = !enabled;
    batchZipBtn.disabled = !enabled;
    batchSingleBtn.disabled = !enabled;
  }

  function updateProgress(processed, total, currentTitle) {
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    progressPercentEl.textContent = `${percent}%`;
    progressBarEl.style.width = `${percent}%`;
    progressDetailEl.textContent = currentTitle
      ? `[${processed}/${total}] ${currentTitle}`
      : `Processing page ${processed} of ${total}...`;
  }

  function updateFrontmatterUI(includeFm) {
    if (toggleText) {
      toggleText.textContent = includeFm ? 'Include YAML frontmatter' : 'Plain Markdown only';
    }
    if (toggleBadge) {
      toggleBadge.textContent = includeFm ? 'YAML Metadata' : 'Plain Markdown';
      toggleBadge.className = includeFm ? 'format-badge' : 'format-badge plain';
    }
    if (footerStatus) {
      footerStatus.textContent = includeFm
        ? 'Agent-optimized Markdown with YAML frontmatter'
        : 'Pure plain Markdown (no frontmatter)';
    }
  }

  // Load and persist frontmatter setting
  if (frontmatterToggle) {
    if (chrome.storage?.local) {
      chrome.storage.local.get(['includeFrontmatter'], (res) => {
        const val = (res && typeof res.includeFrontmatter === 'boolean') ? res.includeFrontmatter : true;
        frontmatterToggle.checked = val;
        updateFrontmatterUI(val);
      });
    } else {
      updateFrontmatterUI(frontmatterToggle.checked);
    }

    frontmatterToggle.addEventListener('change', () => {
      const val = frontmatterToggle.checked;
      if (chrome.storage?.local) {
        chrome.storage.local.set({ includeFrontmatter: val });
      }
      updateFrontmatterUI(val);
    });
  }

  function getIncludeFrontmatter() {
    return frontmatterToggle ? frontmatterToggle.checked : true;
  }

  // Safe message sending with re-injection retry
  async function sendMessageWithRetry(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Content script not answering, ask background to ensure injection
      const injected = await chrome.runtime.sendMessage({
        action: 'ensureContentScript',
        tabId
      });
      if (!injected?.success) {
        throw new Error('Failed to connect to page content script. Please refresh the page.');
      }
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  // Get active tab
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // If popup is opened in a tab (e.g. testing or direct URL), find the documentation tab
    if (tab?.url?.startsWith('chrome-extension://') || tab?.url?.startsWith('chrome://')) {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const webTab = allTabs.find(t => t.id !== tab?.id && t.url && !t.url.startsWith('chrome-') && !t.url.startsWith('about:'));
      if (webTab) {
        tab = webTab;
      }
    }

    if (!tab?.id || !tab.url) {
      siteStatusEl.className = 'status-card status-inactive';
      siteTitleEl.textContent = 'Restricted page';
      pageCountEl.textContent = 'Cannot run on internal browser pages';
      return;
    }

    activeTabId = tab.id;
    activeTabUrl = tab.url;

    // Detect Starlight
    const info = await sendMessageWithRetry(activeTabId, { action: 'detectStarlight' });
    currentSiteInfo = info;

    if (info?.isStarlight) {
      siteStatusEl.className = 'status-card status-active';
      siteTitleEl.textContent = info.siteTitle || 'Starlight';
      const apiBadge = info.hasRawMarkdown ? ' (⚡ Raw Markdown)' : '';
      pageCountEl.textContent = `${info.pageCount} documentation pages found in sidebar${apiBadge}`;
      setButtonsEnabled(true);
    } else {
      siteStatusEl.className = 'status-card status-inactive';
      siteTitleEl.textContent = 'Not Starlight docs';
      pageCountEl.textContent = 'Open a Starlight documentation page';
      setButtonsEnabled(false);
    }
  } catch (err) {
    siteStatusEl.className = 'status-card status-inactive';
    siteTitleEl.textContent = 'Detection unavailable';
    pageCountEl.textContent = err.message || 'Please refresh this page and retry';
    setButtonsEnabled(false);
  }

  // Check if background already has an active batch running
  try {
    const statusRes = await chrome.runtime.sendMessage({ action: 'getBatchStatus' });
    if (statusRes?.status?.isRunning && statusRes.status.tabId === activeTabId) {
      setButtonsEnabled(false);
      progressSectionEl.classList.remove('hidden');
      updateProgress(statusRes.status.processed, statusRes.status.total, statusRes.status.currentTitle);
    }
  } catch {
    // Ignore background query errors
  }

  // Listen for background updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action !== 'statusUpdate') return;

    const { type, status, error } = msg;

    switch (type) {
      case 'batchStarted':
        setButtonsEnabled(false);
        progressSectionEl.classList.remove('hidden');
        updateProgress(0, status.total, 'Starting extraction...');
        break;

      case 'batchProgress':
        updateProgress(status.processed, status.total, status.currentTitle);
        break;

      case 'batchDone':
        progressSectionEl.classList.add('hidden');
        setButtonsEnabled(true);
        showMessage('Download complete! File saved.', 'success');
        break;

      case 'batchCancelled':
        progressSectionEl.classList.add('hidden');
        setButtonsEnabled(true);
        showMessage('Operation cancelled.', 'info');
        break;

      case 'batchError':
        progressSectionEl.classList.add('hidden');
        setButtonsEnabled(true);
        showMessage(error || 'An error occurred during extraction.', 'error', 6000);
        break;

      default:
        break;
    }
  });

  // Action: Download Current Page
  convertCurrentBtn.addEventListener('click', async () => {
    if (!activeTabId) return;
    try {
      convertCurrentBtn.disabled = true;
      showMessage('Converting current page...', 'info', 0);

      const includeFrontmatter = getIncludeFrontmatter();
      const res = await sendMessageWithRetry(activeTabId, {
        action: 'convertCurrentPage',
        includeFrontmatter
      });

      if (res?.success) {
        const encoded = utf8ToBase64(res.markdown);
        const dataUrl = `data:text/markdown;charset=utf-8;base64,${encoded}`;

        await chrome.downloads.download({
          url: dataUrl,
          filename: res.fileName,
          saveAs: true
        });

        showMessage(`Downloaded ${res.title}!`, 'success');
      } else {
        showMessage(res?.error || 'Failed to convert page.', 'error');
      }
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      convertCurrentBtn.disabled = false;
    }
  });

  // Action: Download All Pages (.zip)
  batchZipBtn.addEventListener('click', async () => {
    if (!activeTabId) return;
    try {
      setButtonsEnabled(false);
      progressSectionEl.classList.remove('hidden');
      updateProgress(0, 0, 'Initializing batch...');

      const includeFrontmatter = getIncludeFrontmatter();
      await sendMessageWithRetry(activeTabId, {
        action: 'startBatch',
        format: 'zip',
        includeFrontmatter
      });
    } catch (err) {
      progressSectionEl.classList.add('hidden');
      setButtonsEnabled(true);
      showMessage(err.message, 'error');
    }
  });

  // Action: Download as Single Markdown
  batchSingleBtn.addEventListener('click', async () => {
    if (!activeTabId) return;
    try {
      setButtonsEnabled(false);
      progressSectionEl.classList.remove('hidden');
      updateProgress(0, 0, 'Initializing single markdown export...');

      const includeFrontmatter = getIncludeFrontmatter();
      await sendMessageWithRetry(activeTabId, {
        action: 'startBatch',
        format: 'single',
        includeFrontmatter
      });
    } catch (err) {
      progressSectionEl.classList.add('hidden');
      setButtonsEnabled(true);
      showMessage(err.message, 'error');
    }
  });

  // Action: Cancel
  cancelBtn.addEventListener('click', async () => {
    if (!activeTabId) return;
    try {
      cancelBtn.disabled = true;
      await sendMessageWithRetry(activeTabId, { action: 'cancelBatch' });
    } catch (err) {
      console.error(err);
    } finally {
      cancelBtn.disabled = false;
    }
  });

  // External links (GitHub)
  const githubLink = document.getElementById('githubLink');
  if (githubLink) {
    githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: githubLink.href });
    });
  }

  // Action: Report Issue / Feedback on GitHub with Diagnostic Auto-Copy
  const reportIssueBtn = document.getElementById('reportIssueBtn');
  if (reportIssueBtn) {
    reportIssueBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const siteName = currentSiteInfo?.siteTitle || 'Documentation Site';
      const issueTitle = `[Extraction Issue]: ${siteName}`;

      const diagnosticData = {
        url: activeTabUrl || 'N/A',
        siteTitle: currentSiteInfo?.siteTitle || 'N/A',
        isStarlight: Boolean(currentSiteInfo?.isStarlight),
        pageCount: currentSiteInfo?.pageCount || 0,
        hasRawMarkdown: Boolean(currentSiteInfo?.hasRawMarkdown),
        extensionVersion: '1.0.0',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      };

      const diagnosticJson = JSON.stringify(diagnosticData, null, 2);

      // Attempt to copy diagnostic JSON to clipboard
      let clipboardCopied = false;
      try {
        await navigator.clipboard.writeText(diagnosticJson);
        clipboardCopied = true;
      } catch {
        // Clipboard write might fail if permissions or focus issue, ignore safely
      }

      const issueBody = `### Documentation Page Information
- **URL**: ${activeTabUrl || '`[Enter URL]`'}
- **Extracted Title**: ${currentSiteInfo?.siteTitle || 'N/A'}
- **Sidebar Pages Count**: ${currentSiteInfo?.pageCount || 0}
- **Extension Version**: v1.0.0
- **Browser / OS**: ${navigator.userAgent}

### What went wrong?
<!-- Check any that apply: -->
- [ ] Code block formatting broken or language syntax missing
- [ ] Tables mangled or columns misaligned
- [ ] Tabs content missing or interleaved
- [ ] Sidebar pages missing or wrong order
- [ ] Callouts / Asides (Tip, Note, Warning) not converted
- [ ] Starlight site was not detected

### Expected vs Actual Behavior
**Expected**: 
**Actual**: 

<details>
<summary>Diagnostic Information (Auto-Copied)</summary>

\`\`\`json
${diagnosticJson}
\`\`\`
</details>`;

      const issueUrl = `https://github.com/FlaviusBurghila/starlight-to-md/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

      if (clipboardCopied) {
        showMessage('Diagnostic info copied to clipboard! Opening GitHub...', 'success', 3000);
      } else {
        showMessage('Opening GitHub Issues...', 'info', 2000);
      }

      setTimeout(() => {
        chrome.tabs.create({ url: issueUrl });
      }, 350);
    });
  }
});
