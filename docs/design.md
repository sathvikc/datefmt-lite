# Design

Internal architecture and reasoning behind this date formatting library.

---

## 🎯 Core Philosophy

* **Token-to-token conversion only**
* **No Date objects**

  * Avoids `new Date()` and `Intl`
  * No built-in timezone logic
* **No dependencies** — designed for embeddable, zero-cost builds
* **Predictable behavior**:

  * Parsing is greedy, literal-safe, and unambiguous
  * Rendering uses a fixed resolution hierarchy

---

## 🧱 Module Breakdown

Each module follows single-responsibility principles:

| Module            | Role                                                 |
| ----------------- | ---------------------------------------------------- |
| `extractTokens`   | Slices `inputDate` using tokens from `inputFormat`   |
| `normalizeFields` | Maps raw values to `year`, `month`, etc. + converter |
| `validateOutput`  | Checks all output tokens are satisfiable             |
| `buildTemplate`   | Prepares reusable formatter chunks                   |
| `formatter`       | Glue layer — manages control flow + options handling |

---

## ⚠️ Error Policy Design

### `'throw'`

* Default strict mode
* Fails on unknown tokens, missing inputs, or invalid configurations

### `'silent'`

* Returns best-effort formatting
* Prioritizes:

  1. `overrideTokens`
  2. parsed input
  3. `defaultTokens`
  4. literal fallback (token name)

### Future modes

* `'warn'`: log errors, continue formatting
* `'coerce'`: use fallback/defaults automatically, no literal leakage

---

## 🧩 Token Extensibility

This library supports full per-call token customization:

| Feature          | Purpose                        | Priority    |
| ---------------- | ------------------------------ | ----------- |
| `customTokens`   | Add new renderable tokens      | Low         |
| `overrideTokens` | Force output (overrides input) | Highest     |
| `defaultTokens`  | Fill missing values            | Conditional |

No global registration. You control all tokens through options.

---

## 🚫 What It Doesn’t Do (By Design)

* No timezone shifts or offset parsing
* No locale-based formatting or pluralization
* No calendar correctness (unless enabled)

---

## 🚧 Future Enhancements

* `enableDateValidation`: check for leap years, invalid dates, etc.
* TS typings: native `.d.ts` support for options and fields
* Token aliases: support mapping `MMM` → `mon` or `Do` → `dth`
* Grouping output templates for formatting reuse

---

This design ensures maximum control, low surface area, and clear extension paths for any future need.
