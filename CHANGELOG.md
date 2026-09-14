# Changelog

All notable changes to `starlight-to-md` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-13

### Added
- **Multi-Era Starlight Detection Engine**: Robust multi-marker scoring system detecting Starlight sites across all eras (v0.1.0 through v0.42.0+), including sites with custom domains and stripped generator tags.
- **Expressive Code Parser**: Converts syntax-highlighted code blocks to clean fenced Markdown while retaining file path banners (`title="..."`) and stripping copy buttons and line numbers.
- **Multi-Variant Tab Unpacking (`<starlight-tabs>`)**: Unrolls all tab panels (e.g. `npm`, `pnpm`, `yarn`, `bun`, `cargo`) into labeled Markdown subsections to provide complete technical context for AI agents.
- **GitHub Alert Formatting**: Maps Starlight asides (`note`, `tip`, `caution`, `danger`) to standard GitHub callouts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`).
- **Three Export Modes**:
  - **Current Page (.md)**: Converts the active page to a single Markdown file.
  - **All Pages (.zip)**: Exports the full documentation tree into categorized folders with a root `README.md` index.
  - **Single Markdown (.md)**: Merges all pages into one continuous, searchable document with a unified Table of Contents.
- **Agent-Ready Metadata**: Injects structured YAML frontmatter (`title`, `description`, `source_url`, `category`, `order`) into exported documents.
- **Local-First Privacy Architecture**: 100% in-browser processing using `Turndown` and `JSZip` with zero remote servers, telemetry, or external network calls.
- **One-Click Feedback & Diagnostic Reporter**: Automatically collects sanitized page structure metadata to pre-populate GitHub issue reports.
