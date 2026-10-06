# Contributing

Thanks for your interest in improving this library! Here's how to get started.

---

## 📦 Setup

```bash
git clone https://github.com/sathvikc/datefmt-lite.git
cd datefmt-lite
npm ci
```

---

## 🧪 Run Tests

```bash
npm test
```

Uses Jest. Tests live in `test/`, not next to their source.

---

## 🔨 Build the Library

```bash
npm run build
```

Builds CommonJS and ESM outputs to `dist/`

---

## 🧹 Scripts

```bash
npm run clean      # Remove build artifacts
npm run build      # Build the ESM and CJS bundles with Rollup
npm run test       # Run the test suite
npm run test:dist  # Verify the built bundles
npm run verify     # format:check, lint, typecheck, test, build, test:dist
```

---

## ✏️ Style Guide

- Use Prettier defaults
- Prefer small, composable functions
- Stick to the core philosophy: **string-to-string conversion with zero dependencies**

---

## 📁 Folder Structure

```
src/
├── formatter.js         # Main entry point
├── extractTokens.js     # Input parser
├── normalizeFields.js   # Raw → semantic mapping
├── validateOutput.js    # Ensures output is valid
├── buildTemplate.js     # Output compiler
├── utils.js             # Shared helpers
```

---

## ✅ Good First Issues

- Add new formatting tokens (e.g. `Do` for ordinal day)
- Improve test coverage for edge cases
- Add support for `warn` errorPolicy mode

---

## 🔖 Commit Style (Angular Convention)

We follow [Angular Commit Messages](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#-commit-message-format):

```
type: short summary

body (optional)
```

Common types:

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that doesn’t fix a bug or add a feature
- `test`: Adding or improving tests
- `docs`: Documentation only
- `chore`: Build system, CI, tooling

Example:

```bash
refactor: restructure normalizeFields and add validation tests
```

---

## 🤝 Feedback & Bugs

- Found a bug? [Open an issue](https://github.com/sathvikc/datefmt-lite/issues)
- Want to discuss design? Start a [discussion thread](https://github.com/sathvikc/datefmt-lite/discussions)

Thanks for helping make this library better!
