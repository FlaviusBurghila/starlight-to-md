# Contributing to starlight-to-md

Thank you for your interest in contributing to `starlight-to-md`! We welcome bug reports, feature requests, documentation improvements, and code contributions.

---

## Getting Started

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm 9+
- Google Chrome or a Chromium-based browser (Brave, Edge, Chromium)

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/starlight-to-md.git
   cd starlight-to-md
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   ```

4. **Load the extension in Chrome**:
   - Open `chrome://extensions/` in Chrome.
   - Toggle **Developer mode** on (top right).
   - Click **Load unpacked** and select the `starlight-to-md` directory.

   *(Note: If you only want to use the extension without modifying code, install it directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/starlight-to-markdown/njegnmnbddnkpmkenljdacehicedokek)).*

---

## Testing Guidelines

We enforce a strict quality gate with zero-regression testing.

### Test Suites

```bash
# 1. Run all unit tests (parser, converter, bundler, utils)
npm test

# 2. Run Playwright headless E2E live extension test
npm run test:e2e

# 3. Run multi-site showcase audit across 8 production Starlight websites
npm run test:showcase

# 4. Run all suites in sequence
npm run test:all
```

### Writing Tests

- **Unit tests** (`tests/*.test.js`): Must be fast (< 2 seconds total) and deterministic using HTML fixtures.
- **Fixtures** (`tests/fixtures/`): When adding support for a new Starlight pattern, save an offline snippet to `tests/fixtures/`.
- **E2E tests** (`tests/e2e.test.js`): Test user-facing flows using Playwright's persistent context.

---

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`.
2. Ensure all tests pass: `npm run test:all`.
3. Make sure code follows project conventions and passes review gates.
4. Submit a pull request with a descriptive title and context.

---

## Code of Conduct & License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
