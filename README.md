# datefmt-lite

A lightweight, zero‑dependency string‑to‑string date format converter with pluggable tokens and an extensible architecture.

## 🚀 Features

- **Fast**: Parses and formats via pre‑compiled templates  
- **Pluggable Tokens**: Add or override tokens without touching core code  
- **Flexible Year Handling**: Supply a `yearConverter` to expand two‑digit years or provide defaults  
- **Override & Default Tokens**: Control individual token output on a per-call basis  
- **Error Policies**: Choose strict (throw) or silent (best‑effort) behavior  
- **Zero Dependencies**: Core library is pure JS—no external packages  

---

## 📦 Installation

```bash
npm install datefmt-lite
# or
yarn add datefmt-lite
```

## ✨ Basic Usage

```js
import { formatDate } from 'datefmt-lite';

const yearConv = (n) =>
  n == null
    ? 2000          // default if no year in input
    : n < 50
      ? 2000 + n    // pivot two‑digit years
      : 1900 + n;

// Convert "250425T101010" from `yyMMddTHHmmss` to `dd/MM/yyyyTHH:mm:ss`
const result = formatDate(
  '250425T101010',
  'yyMMddTHHmmss',
  'dd/MM/yyyyTHH:mm:ss',
  {
    yearConverter: yearConv,
    errorPolicy: 'throw',       // 'throw' | 'silent'
    customTokens: {
      Q: (p) => 'Q' + Math.ceil(p.month / 3)
    }
  }
);

console.log(result);
// → "25/04/2025T10:10:10"
```

---

## 🧩 API

### `formatDate(inputDate, inputFormat, outputFormat, options)`

- **`inputDate`** (`string`)  
- **`inputFormat`** (`string`): e.g. `"yyyyMMddTHHmmss"`  
- **`outputFormat`** (`string`): e.g. `"dd/MM/yyyyTHH:mm:ss"`  
- **`options`** (`object`, optional):
  - **`customTokens`** `{ [token: string]: (parts) => string }`  
    Add or override token handlers  
  - **`overrideTokens`** `{ [token: string]: string | (parts) => string }`  
    Highest‑priority, per-call literal or function overrides  
  - **`defaultTokens`** `{ [token: string]: string | (parts) => string }`  
    Fallbacks when a handler returns `null`/`undefined` or the part was missing  
  - **`yearConverter`** `(n: number | undefined) => number`  
    **Required** if `inputFormat` uses `yy`  
  - **`errorPolicy`** `'throw'` (default) | `'silent'`  
    - `'throw'`: any parse- or formatting-error throws  
    - `'silent'`: best-effort—unknown/missing tokens fall back to literals or defaults  
  - **`enableDateValidation`** `false` (default) | `true`  
    Stub for future real-date checks (e.g. invalid months/days)

**Returns** the formatted string, or `null` if `inputDate` is not a string.

---

## 🔎 Low-Level Modules

If you need fine-grained control:

```js
import {
  parseInput,
  compileFormat,
  DEFAULT_HANDLERS,
  MONTH_NAMES
} from 'datefmt-lite';

// 1) Parse raw string
const parts = parseInput('20250425', 'yyyyMMdd', DEFAULT_HANDLERS);

// 2) Pre-compile a format template
const tpl = compileFormat('MMM dd, yyyy', DEFAULT_HANDLERS);

// 3) Render
console.log(tpl(parts)); // "Apr 25, 2025"
```

---

## 🔧 Scripts

- `npm run build`  — Transpile & bundle CJS + ESM  
- `npm run test`   — Run unit tests  
- `npm run lint`   — Run linter  
- `npm run format` — Auto-format code  

---

## 🤝 Contributing

1. Fork the repo  
2. Create a feature branch:  
   ```bash
   git checkout -b feat/your-feature
   ```  
3. Commit your changes:  
   ```bash
   git commit -m "feat: your description"
   ```  
4. Run tests & lint:  
   ```bash
   npm test && npm run lint
   ```  
5. Open a pull request

---

## 📄 License

MIT © Sathvik Cheela
