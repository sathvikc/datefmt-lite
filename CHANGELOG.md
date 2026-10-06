# Changelog

## [2.2.0] – 2026-10-05

### 📦 Packaging

- **`npm install` no longer fails.** `rollup-plugin-terser@7` peer-requires
  `rollup@^2` while this package pinned `^3`, so every install died with
  `ERESOLVE`. Replaced with `@rollup/plugin-terser` (peers on 2, 3 and 4) and
  bumped rollup to 4, which also clears CVE-2026-27606 (arbitrary file write via
  path traversal, CVSS 8.8) and the deprecated `rimraf@3`.
- **`require('datefmt-lite')` works again.** It threw
  `ReferenceError: exports is not defined in ES module scope` for every
  CommonJS consumer: the package declares `"type": "module"` and pointed
  `main` at `dist/cjs/index.cjs.js`, but only a literal `.cjs` suffix marks a
  file as CommonJS. The bundle is now emitted as `dist/cjs/index.cjs`.
- `dist/cjs` no longer ships 8 dead ESM duplicates. `build:cjs` set
  `BABEL_ENV=cjs`, which fell through to the top-level Babel preset with
  `"modules": false`. Those files were 80% of the published tarball.
- The build no longer shells out to `yarn`, which is neither installed nor a
  dependency, so a plain `npm install` failed with exit 127. It now runs from
  `prepack`.
- Added the `types` and `default` conditions to the `exports` map; TypeScript
  ignores the top-level `types` field once `exports` exists.
- `docs/`, `CHANGELOG.md` and `LICENSE` are now published, so the README's
  documentation links resolve on npm instead of 404ing.
- `yarn.lock` replaced by `package-lock.json`, so `npm ci` works.
- The build fails on an unresolved import, enforcing the zero-dependency claim.

### 📝 Types

- **Removed `buildTokenRegex` and `extractAllTokensFromFormat` from
  `types/index.d.ts`.** Both were declared as package exports but neither is
  actually exported, so a TypeScript consumer compiled cleanly and received
  `undefined` at runtime. This is a compile-time breaking change for anyone who
  imported them.

### 🧰 Tooling

- CI on Node 20/22/24: formatting, lint, typecheck, tests with coverage, build,
  and dist verification, plus a publish dry run.
- `npm run verify` runs the whole chain.
- `npm run test:dist` checks the exports map resolves for both entrypoints and
  that each resolves to its own bundle, that the public API is intact, that six
  concrete behaviours still hold, and that the two bundles together stay within
  a 4,096 B gzipped budget.
- Added eslint, prettier and TypeScript configuration.

### ➕ Additive

Nothing below removes or changes an existing runtime behaviour. These are new
capabilities, which is why this is a minor rather than a patch release:

- The `exports` map gained `types` and `default` conditions, plus a
  `./package.json` subpath, so TypeScript under `node16`/`nodenext` and
  bundler resolution now find the declarations.
- `sideEffects: false` tells consumer bundlers the modules are pure, so
  tree-shaking is safe.
- `docs/`, `CHANGELOG.md` and `LICENSE` are now published, so the README's
  documentation links resolve instead of 404ing.

### ⚠️ Runtime behaviour is unchanged from 2.1.0

Verified by running a large generated corpus through both this version and 2.1.0:
identical output and identical thrown errors throughout. The 112 original tests
pass unmodified. A separate, larger rewrite is planned for v3.

## [2.1.0] – 2025-05-30

### 🛠 Fixes & Refactorings
- Centralized all token metadata in a single `TOKEN_REGISTRY` in `handlers.js`  
- Auto-generated `DEFAULT_HANDLERS` and `TOKEN_FIELD_MAP` from `TOKEN_REGISTRY`  
- Updated `formatter.js` and `validateOutput.js` to import and use `TOKEN_FIELD_MAP` rather than inline maps  
- **Bugfix**: “Cannot produce token `MMM`” error no longer throws when formatting `MMM` if only `MM` was parsed  
- Added missing `normalizeFields` test case covering single-digit seconds (`s`) branch  
- Added `formatter.test.js` case for `formatDate('20250425', 'yyyyMMdd', 'MMM dd, yyyy') → 'Apr 25, 2025'`
- Added public TypeScript definitions under `types/index.d.ts`  
- Added complete JSDoc and inline comments across all core modules  
- `CHANGELOG.md` and link from `README.md`

---

## [2.0.0] - 2025-05-30

### ✨ What’s New

* Refactored internal architecture into a clean pipeline: `extract → normalize → validate → render`
* Removed legacy monolithic logic and replaced with modular low-level functions per phase
* Made error handling fully customizable with `errorPolicy: 'silent'` — supports best-effort output and literal fallback
* Formalized support for `overrideTokens`, `defaultTokens`, and `customTokens` with consistent precedence
* Added full Jest test coverage for tokens, edge cases, and all code paths
* Introduced greedy token matching (longest token match wins)
* Bracketed literals like `[at]` are now officially supported
* Authored full documentation suite including usage, internals, and formatting behavior

### 🛠 Upgrade Notes

* Low-level modules like `extractTokens`, `normalizeFields`, `validateOutput`, and `buildTemplate` are now stable and documented — intended for advanced usage or library authors
* If you were using deep internal imports in v1.0.0, refactor to use only `formatDate()` or these now-public modules
* `formatDate()` itself remains backward-compatible with v1

### ✅ Unchanged

* `formatDate()` public API and core usage patterns
* Built-in token behavior (`yyyy`, `dd`, `MM`, etc.)

---

## \[1.0.0] - 2025-05-22

### ✨ What’s New

* Modular architecture: split parsing, compilation, rendering, and handlers into focused modules
* Core formatting API: `formatDate()` → parse → validate → compile → render
* Supports `customTokens`, `overrideTokens`, and `defaultTokens`
* Built‑in token support: years (`yyyy`, `yy`), months (`MMMM`, `MMM`, `MM`, `M`), days (`dd`, `d`), hours, minutes, seconds
* Strict error handling: throws on malformed input or unsupported tokens (configurable via `errorPolicy`)
* Extensible tokens: add or override tokens without touching core logic

### 🛠 Upgrade Notes

* All public entry points live in the root module—no deep imports required
* If migrating from a single‑file formatter, point your calls at `formatDate(...)`
* Default behavior is strict; pass `{ errorPolicy: 'silent' }` to fall back to raw input on errors
