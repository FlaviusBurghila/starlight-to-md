# Privacy Policy for starlight-to-md

**Last Updated:** September 13, 2026

## Overview

**starlight-to-md** ("the Extension") is an open-source browser extension designed to extract Starlight documentation into clean Markdown format for use with AI coding agents and local archiving. We are strictly committed to privacy and local-first execution.

---

## Zero Data Collection Policy

**We do not collect, store, transmit, or monetize any personal data.**

The Extension operates **100% locally** within your browser. All documentation parsing, conversion, and packaging happens directly on your device.

- ❌ **No Tracking:** We do not track your browsing activity or history.
- ❌ **No Telemetry:** We do not include analytics, telemetry, or tracking SDKs.
- ❌ **No External Servers:** Converted Markdown files and ZIP archives never leave your device.
- ❌ **No Cookies:** The extension does not set or read any cookies.
- ❌ **No Advertisements:** We do not display ads or affiliate links.
- ❌ **No Third-Party Sharing:** No data is ever shared with third parties or cloud backends.

---

## Permissions Usage & Justification

The Extension requests only the minimum permissions necessary to function:

### 1. `downloads`

- **Purpose:** Enables saving the converted `.md` files and structured `.zip` archives directly to your browser's default download folder.
- **Data Access:** Triggers file downloads initiated by your explicit user action. Does not read or inspect existing downloads.

### 2. `tabs`

- **Purpose:** Identifies the active documentation tab when you open the extension popup, allowing the popup to display page counts and initiate extraction.
- **Data Access:** Reads only the URL and ID of the active tab. Browsing history is never collected or stored.

### 3. `scripting`

- **Purpose:** Ensures the lightweight content extraction script is available on the active documentation tab when you open the popup.
- **Data Access:** Executes the local parsing script only in the context of the active tab.

### 4. `activeTab`

- **Purpose:** Grants temporary permission to inspect the DOM of the active tab when you click the extension action.
- **Data Access:** Reads the documentation DOM structure on the page you are currently viewing.

### 5. `host_permissions: ["<all_urls>"]`

- **Purpose:** Starlight documentation sites are decentralized and hosted on custom developer domains across the internet (e.g. `antigravity.google`, `biomejs.dev`, `ion.sst.dev`, `docs.papermc.io`, internal corporate doc sites, and `localhost`). Broad matching is required so the extension can detect and extract documentation on any domain running Starlight.
- **Data Access:** Only activates when you open a Starlight documentation page and interact with the extension popup.

---

## Third-Party Libraries

The Extension bundles two open-source libraries locally:

- **Turndown** (HTML-to-Markdown conversion)
- **JSZip** (in-memory ZIP archive generation)

Both libraries run entirely within your local browser context and do not communicate with external servers.

---

## Source Code & Transparency

`starlight-to-md` is open source. You can audit the entire source code, build scripts, and dependencies on GitHub:
[https://github.com/FlaviusBurghila/starlight-to-md](https://github.com/FlaviusBurghila/starlight-to-md)

---

## Contact

For privacy questions, bug reports, or feature requests:

- Open an issue on GitHub: [https://github.com/FlaviusBurghila/starlight-to-md/issues](https://github.com/FlaviusBurghila/starlight-to-md/issues)
