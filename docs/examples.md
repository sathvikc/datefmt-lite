# Examples

A collection of common and edge-case `formatDate()` examples.

---

## ✅ Basic formatting

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// → '25/04/2025'
```

---

## 🧠 Two-digit year + converter

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => 2000 + yy,
});
// → '25/04/2025'
```

---

## 🛑 Missing converter (throws)

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy');
// ❌ Throws: yearConverter required for yy
```

---

## 🧩 Custom token for quarter

```js
formatDate('20250601', 'yyyyMMdd', 'yyyy-Q/dd', {
  customTokens: {
    Q: (p) => 'Q' + Math.ceil(p.month / 3),
  },
});
// → '2025-Q2/01'
```

---

## 🎭 overrideTokens win over input

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
});
// → '01/04/2025'
```

---

## 💬 Bracketed literals

```js
formatDate('20250425T101010', 'yyyyMMddTHHmmss', 'dd MMM yyyy [at] HH:mm');
// → '25 Apr 2025 [at] 10:10'

// The brackets are kept verbatim, and their contents are never tokenized, so
// this is the reliable way to write literal text that resembles a token.
```

---

## 🧩 defaultTokens fill partial input

```js
formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', {
  defaultTokens: { dd: '99' },
});
// → '99/04/2025'
```

---

## ⚠️ Error policy: silent (fallback output)

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  errorPolicy: 'silent',
});
// → 'MM/dd/2025'
```

---

## 🧪 Parse failure: silent returns input

```js
formatDate('BAD', 'yyyy', 'yyyy-MM-dd', {
  errorPolicy: 'silent',
});
// → 'BAD'
```

---

## 🔁 Non-digit in input yields partial best-effort

```js
formatDate('2025AB05', 'yyyyMMdd', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
});
// → '05/MM/2025'
```

---

## 📉 Short input with 2-digit year and fallback

```js
formatDate('20ABCD', 'yyMMdd', 'dd-MM-yyyy', {
  errorPolicy: 'silent',
});
// → 'dd-MM-0020'
```

---

See [`api.md`](./api.md) for parameter reference and [`formatting-behavior.md`](./formatting-behavior.md) for detailed fallback rules.
