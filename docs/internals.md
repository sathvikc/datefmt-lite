# Internals

Overview of how `formatDate()` works under the hood. For contributors and advanced users.

---

## 🧱 Core Flow

The `formatDate()` function follows a 5-step pipeline:

```js
extractTokens → normalizeFields → validateOutput → buildTemplate → render
```

### 1. `extractTokens(inputDate, inputFormat, handlers)`

Parses `inputDate` into raw pieces based on `inputFormat` tokens. Returns a flat
map of token names to the digits that were read, plus the list of tokens that
matched:

```js
extractTokens('20250425', 'yyyyMMdd', handlers);
// → { yyyy: '2025', MM: '04', dd: '25', tokens: ['yyyy', 'MM', 'dd'] }
```

### 2. `normalizeFields(rawMap, options)`

Cleans and maps raw input values to final field names: `year`, `month`, `day`, etc.

- Handles number conversion
- Applies `yearConverter` if needed
- Short-circuits on invalid inputs if `errorPolicy === 'silent'`

### 3. `validateOutput(dateParts, outputFormat, options)`

Ensures all output tokens can be generated:

- Throws if token is missing and no default/override exists
- In `silent` mode, skips missing ones

### 4. `buildTemplate(outputFormat, tokenMap)`

Compiles the output format into a list of chunks:

```js
['dd', '/', 'MM', '/', 'yyyy'] → [fn, '/', fn, '/', fn]
```

Each `fn` pulls from `dateParts` or uses override/default logic.

### 5. `render(chunks, dateParts)`

Joins the chunks to produce the final output string.

---

## ⚙️ Token Resolution Hierarchy

When rendering each output token:

1. `overrideTokens` (if defined)
2. `parsed/normalized value` (from input)
3. `defaultTokens` (if defined)
4. Literal fallback (token shown as-is)

---

## 🔍 Parsing Notes

- Greedy matching, longest tokens first
- Uses `buildTokenRegex()` for parsing and rendering
- Bracketed literals `[like this]` are preserved

---

## 🚫 No Native `Date`

This library does not use `Date.parse()`, `Intl`, or `Date.toLocaleString()`.

- All behavior is deterministic and string-based
- Leap year, bounds checking, and calendar rules are opt-in via future `enableDateValidation`

---

## 📦 Modularity

The codebase is split into reusable modules:

- `extractTokens.js`: input token parsing
- `normalizeFields.js`: mapping raw fields
- `validateOutput.js`: token validation rules
- `buildTemplate.js`: compiles format string
- `utils.js`: shared helpers
- `formatter.js`: glue layer and public API

---

For advanced control, see [`formatting-behavior.md`](./formatting-behavior.md) and [`api.md`](./api.md).
