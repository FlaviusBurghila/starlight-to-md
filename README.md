# starlight-to-md

Extract Astro [Starlight](https://starlight.astro.build) documentation sites into clean, LLM-ready Markdown via CLI or browser extension.

Designed for developer workflows with AI coding assistants (**Claude Code, Cursor, Copilot, Gemini**).

---

## Why starlight-to-md

Generic web scrapers and manual copy-pasting pollute markdown with UI noise (sticky navbars, search modals, copy buttons) while flattening tabbed content and code metadata. `starlight-to-md` specifically parses Starlight's DOM structure across all versions (v0.1.0 through modern v0.42+).

| Feature | Naive Scrapers / Copy-Paste | `starlight-to-md` |
| :--- | :--- | :--- |
| **Expressive Code** | Loses language, file titles, copies "Copy" buttons | Clean fenced blocks with language and `title="..."` |
| **Tabs (`<starlight-tabs>`)** | Truncates to active tab; drops alternates | Preserves all variants as labeled sections (`**Tab: npm**`, `**Tab: pnpm**`) |
| **Asides / Callouts** | Plain text or broken blockquotes | Standard GitHub-flavored alerts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`) |
| **Navigation & Order** | Unordered or missing context | YAML frontmatter (`title`, `description`, `source`, `category`, `order`) |
| **Site Cleanup** | Retains search modals, headers, pagination, footers | Extracts only semantic content body |

---

## CLI Quickstart

Run directly with `npx`—no installation required:

```bash
# 1. Pipe directly into clipboard or AI CLI (auto-streams to stdout)
npx starlight-to-md https://starlight.astro.build/getting-started/ | pbcopy
npx starlight-to-md https://starlight.astro.build/getting-started/ --plain | claude

# 2. Extract a single page to a local file (auto-named ./getting-started.md)
npx starlight-to-md https://starlight.astro.build/getting-started/

# 3. Consolidate an entire documentation site into a single file with TOC
npx starlight-to-md https://starlight.astro.build/getting-started/ -s -o starlight.md

# 4. Crawl full documentation tree into organized local directories
npx starlight-to-md https://starlight.astro.build/getting-started/ -a -o ./docs

# 5. Export full documentation tree as a structured ZIP archive with llms.txt
npx starlight-to-md https://starlight.astro.build/getting-started/ -z -o starlight-docs.zip
```

### CLI Options Reference

| Flag | Shorthand | Description | Default |
| :--- | :--- | :--- | :--- |
| `-o, --output <path>` | `-o` | Output file or destination directory (`-` streams to stdout) | `./<slug>.md` / cwd |
| `-s, --single` | `-s` | Consolidate all crawled pages into a single file with unified TOC (implies `--all`) | `false` |
| `-z, --zip` | `-z` | Package all crawled pages into a structured ZIP archive with `llms.txt` (implies `--all`) | `false` |
| `-a, --all` | `-a` | Crawl all documentation pages discovered in the sidebar | `false` |
| `--plain`, `--raw` | | Omit YAML frontmatter for pure Markdown (alias: `--no-frontmatter`) | `false` |
| `--stdout` | | Stream markdown output directly to stdout (auto-enabled when piped) | `false` |
| `-c, --concurrency <n>` | `-c` | Number of concurrent HTTP requests when crawling | `5` |
| `-q, --quiet` | `-q` | Suppress logs and progress bars (errors only) | `false` |
| `-v, --version` | `-v` | Display CLI version | |
| `-h, --help` | `-h` | Show usage help and examples | |

---

## Output Formats & Examples

Extracting from `https://starlight.astro.build/getting-started/` (or any Starlight documentation site) yields clean outputs tailored to your workflow:

### 1. Default Single Page (With Frontmatter)

Ideal when saving reference files where metadata (`title`, `source`, `category`) provides provenance:

```bash
npx starlight-to-md https://starlight.astro.build/getting-started/
```

**Output snippet (`getting-started.md`):**
```markdown
---
title: "Getting Started"
source: "https://starlight.astro.build/getting-started/"
category: "Start Here"
---
# Getting Started

Starlight is a full-featured documentation theme built on top of the Astro framework.

## Quick Start

### Create a new project

Create a new Astro project with Starlight pre-installed using your package manager of choice:

**Tab: npm**
```bash
npm create astro@latest -- --template starlight
```

**Tab: pnpm**
```bash
pnpm create astro --template starlight
```
```

### 2. Plain Markdown (`--plain` / `--no-frontmatter`)

Ideal for piping directly into prompt contexts, clipboard (`pbcopy`), or local docs where YAML frontmatter would be redundant:

```bash
npx starlight-to-md https://starlight.astro.build/getting-started/ --plain
```

**Output snippet (`getting-started.md`):**
```markdown
# Getting Started

Starlight is a full-featured documentation theme built on top of the Astro framework.

## Quick Start

### Create a new project

Create a new Astro project with Starlight pre-installed using your package manager of choice:

**Tab: npm**
```bash
npm create astro@latest -- --template starlight
```

**Tab: pnpm**
```bash
pnpm create astro --template starlight
```
```

### 3. Consolidated Single File (`-s, --single`)

Combines all pages discovered across the sidebar into one structured Markdown document with an automated, anchor-linked Table of Contents:

```bash
npx starlight-to-md https://starlight.astro.build/getting-started/ -s -o starlight.md
```

**Output snippet (`starlight.md`):**
```markdown
# Starlight Docs

> Consolidated documentation extracted from [https://starlight.astro.build](https://starlight.astro.build) by starlight-to-md.
> Total pages: 42 | Generated: 2026-09-14T12:00:00.000Z

## Table of Contents

### Start Here
- [Getting Started](#getting-started)
- [Environmental Setup](#environmental-setup)

### Guides
- [Authoring Markdown](#authoring-markdown)
- [Sidebar Navigation](#sidebar-navigation)

---

# Getting Started

Starlight is a full-featured documentation theme...
```

### 4. Structured ZIP Archive with LLM Index (`-z, --zip`)

Extracts the full documentation tree into categorized subfolders using clean URL slugs (no numeric prefixes) and generates standard `llms.txt` and `README.md` indexes:

```bash
npx starlight-to-md https://starlight.astro.build/getting-started/ -z -o starlight.zip
```

**Archive structure:**
```text
starlight.zip
├── llms.txt                     # LLM entry-point index with URLs, titles, and descriptions
├── README.md                    # Agent & human-readable index with Table of Contents
├── start-here/
│   ├── getting-started.md       # Clean URL slug filenames
│   └── manual-setup.md
└── guides/
    ├── authoring-content.md
    └── sidebar-navigation.md
```

**`llms.txt` index snippet:**
```markdown
# Starlight Docs

> Clean documentation export extracted by starlight-to-md.
> Ready for LLM ingestion, agent context loading, and RAG pipelines.

## Documentation Index

- [Getting Started](start-here/getting-started.md): Quick start guide for creating a new documentation site with Starlight.
- [Manual Setup](start-here/manual-setup.md): Add Starlight to an existing Astro project manually.
- [Authoring Content](guides/authoring-content.md): Guide to Markdown syntax, frontmatter, components, and tabs in Starlight.
```

---

## Browser Extension

Export documentation while browsing in Chrome, Firefox, Edge, or Brave.

### Installation

#### Chrome / Edge / Brave / Arc:
1. Clone this repository and run:
   ```bash
   npm install && npm run build
   ```
2. Navigate to `chrome://extensions/` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repository root directory.

#### Firefox:
1. Run `npm install && npm run build`.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `manifest.json`.

### Extension Export Modes

Click the extension icon on any Starlight site to choose:
- **Current Page (.md)**: Downloads active page.
- **All Pages (.zip)**: Crawls the full sidebar into organized category subfolders with a root `README.md` index.
- **Single Markdown (.md)**: Merges the entire documentation tree into a single file with an anchor-linked Table of Contents.
- **Frontmatter Toggle**: Easily toggle **"Include YAML frontmatter"** on or off directly in the popup (persists automatically).

---

## Development

Requires Node.js 18+.

```bash
# Build extension bundles
npm run build

# Watch mode for extension development
npm run dev

# Run unit and integration tests (BDD test suite)
npm test

# Run Playwright E2E extension tests
npm run test:e2e

# Run live showcase audit against production Starlight sites
npm run test:showcase

# Run all test suites
npm run test:all
```

---

## Issue Reporting

Encountered a site where formatting fails?
- Click **"Report issue / Feedback"** in the extension popup to auto-generate diagnostic details.
- Or open an issue with the [Bug Report Template](.github/ISSUE_TEMPLATE/conversion_bug.yml).

---

## Credits & Acknowledgements

- **[Starlight](https://github.com/withastro/starlight)**: The official Astro documentation framework.
- **[deepwiki-md](https://github.com/zxmfke/deepwiki-md-chrome-extension)**: Initial conceptual inspiration for documentation extraction extensions.
- **[Turndown](https://github.com/mixmark-io/turndown)**: HTML-to-Markdown converter.
- **[JSZip](https://github.com/Stuk/jszip)**: In-memory zip generation.

For complete attribution details, see [CREDITS.md](CREDITS.md).

---

## License

[MIT](LICENSE) © Flavius Burghila
