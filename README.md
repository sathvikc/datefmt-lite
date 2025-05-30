# datefmt-lite

**A lightweight, zero‑dependency string‑to‑string date format converter with pluggable tokens and an extensible architecture.**

Convert date strings from one format to another using pure token-to-token logic—no internal `Date` objects and no assumptions. You control everything via inputs.

---

## 🚀 Features

* **Fast**: Parses and formats via pre‑compiled templates
* **Pluggable Tokens**: Add or override tokens without touching core code
* **Flexible Year Handling**: Supply a `yearConverter` to expand two‑digit years or provide defaults
* **Override & Default Tokens**: Control individual token output on a per-call basis
* **Error Policies**: Choose strict (throw) or silent (best‑effort) behavior
* **Bracketed Literals**: Use `[text]` to preserve literals in format output
* **Zero Dependencies**: Core library is pure JS—no external packages

---

## 📦 Installation

```bash
npm install datefmt-lite
# or
yarn add datefmt-lite
```

---

## 🔰 Quick Usage

```js
import { formatDate } from 'datefmt-lite';

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => 2000 + yy,
});
// → '25/04/2025'
```

---

## 📘 When to Use This Library

* You control both the input and output formats
* You want predictable, fast token-to-token formatting
* You want fallback behavior instead of runtime errors
* You don’t need built-in date math, timezone offsets, or localization (but you can inject that logic via tokens)

✅ Perfect for:

* ETL data pipelines
* Formatted export tools
* Browser-safe string conversion
* Small-bundle apps where you want full control

---

## 🔠 Supported Tokens

| Token | Meaning          | Example |
| ----- | ---------------- | ------- |
| yyyy  | full year        | 2025    |
| yy    | 2-digit year     | 25      |
| MMMM  | full month       | April   |
| MMM   | short month      | Apr     |
| MM    | 2-digit month    | 04      |
| M     | 1/2-digit month  | 4       |
| dd    | 2-digit day      | 09      |
| d     | 1/2-digit day    | 9       |
| HH    | 2-digit hour     | 03      |
| H     | 1/2-digit hour   | 3       |
| mm    | 2-digit minute   | 07      |
| m     | 1/2-digit minute | 7       |
| ss    | 2-digit second   | 09      |
| s     | 1/2-digit second | 9       |

➡️ Token definitions follow [Unicode Date Field Symbols](https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table).

➡️ See [`docs/tokens.md`](./docs/tokens.md) for the full list and examples.

---

## 🔧 Advanced Options

```js
formatDate(inputDate, inputFormat, outputFormat, {
  errorPolicy: 'silent',
  yearConverter: (yy) => 1900 + yy,
  customTokens: {
    Q: (p) => 'Q' + Math.ceil(p.month / 3),
  },
  overrideTokens: {
    dd: '01',
  },
  defaultTokens: {
    MM: '00',
  },
});
```

### errorPolicy: `'throw' | 'silent'`

* `'throw'` (default): throws on parse/validation errors
* `'silent'`: returns raw input if nothing parsed; otherwise returns best-effort output with literal token fallback

➡️ See [`docs/formatting-behavior.md`](./docs/formatting-behavior.md)

### yearConverter

* Required when using `yy` (2-digit year)
* If not provided in silent mode, raw `yy` is used as-is (`'25' → 0025`)

### customTokens

* Add your own tokens

```js
customTokens: {
  Q: (p) => 'Q' + Math.ceil(p.month / 3)
}
```

### overrideTokens

* Override built-in or derived tokens (e.g., force day = '01')

### defaultTokens

* Provide fallback values when parsed data is missing

---

## 🧪 Scripts

```bash
# Run tests
yarn test

# Build ESM and CJS
yarn build
```

---

## 📚 Full Docs

See [`/docs`](./docs/) for:

* [`api.md`](./docs/api.md): Main `formatDate` function signature, options, and behavior
* [`tokens.md`](./docs/tokens.md): List of supported tokens (e.g., `yyyy`, `dd`, `MMM`, `HH`) and how they're matched
* [`examples.md`](./docs/examples.md): Real-world and edge-case formatting examples
* [`formatting-behavior.md`](./docs/formatting-behavior.md): How `overrideTokens`, `defaultTokens`, and `errorPolicy` interact
* [`internals.md`](./docs/internals.md): Behind-the-scenes architecture and function flow for contributors
* [`contributing.md`](./docs/contributing.md): Development setup, code structure, and how to contribute
* [`design.md`](./docs/design.md): Core philosophy, extensibility plan, and long-term goals

---

## 📓 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history, breaking changes, and upgrade notes.

---

## 📄 License

MIT © 2025
