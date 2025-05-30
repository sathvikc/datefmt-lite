# Changelog

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
