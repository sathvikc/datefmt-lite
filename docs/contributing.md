# Contributing

Thanks for your interest in improving this library! Here's how to get started.

---

## 📦 Setup

```bash
git clone https://github.com/your-org/your-repo.git
cd your-repo
yarn install
```

---

## 🧪 Run Tests

```bash
yarn test
```

Uses Jest. Tests live in `*.test.js` files next to their source.

---

## 🔨 Build the Library

```bash
yarn build
```

Builds CommonJS and ESM outputs to `dist/`

---

## 🧹 Scripts

```bash
yarn clean      # Remove build artifacts
yarn build      # Run both Babel + Rollup builds
yarn test       # Run full test suite
yarn prepare    # Hook used by publish process
```

---

## ✏️ Style Guide

* Use Prettier defaults
* Prefer small, composable functions
* Stick to the core philosophy: **string-to-string conversion with zero dependencies**

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

* Add new formatting tokens (e.g. `Do` for ordinal day)
* Improve test coverage for edge cases
* Add support for `warn` errorPolicy mode

---

## 🔖 Commit Style (Angular Convention)

We follow [Angular Commit Messages](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#-commit-message-format):

```
type: short summary

body (optional)
```

Common types:

* `feat`: New feature
* `fix`: Bug fix
* `refactor`: Code change that doesn’t fix a bug or add a feature
* `test`: Adding or improving tests
* `docs`: Documentation only
* `chore`: Build system, CI, tooling

Example:

```bash
refactor: restructure normalizeFields and add validation tests
```

---

## 🤝 Feedback & Bugs

* Found a bug? [Open an issue](https://github.com/your-org/your-repo/issues)
* Want to discuss design? Start a [discussion thread](https://github.com/your-org/your-repo/discussions)

Thanks for helping make this library better!
