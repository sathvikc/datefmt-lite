# Formatting Behavior

Detailed behavior of `formatDate()` around override tokens, fallback defaults, and error handling modes.

---

## 🎯 Goal

This library is designed for **token-to-token conversion** — predictable formatting regardless of locale, timezone, or native Date objects.

To preserve that control, you can influence the formatter's behavior using:

* `overrideTokens`: force output for specific tokens
* `defaultTokens`: fill missing values if input is incomplete
* `errorPolicy`: control how failures are handled

---

## 🔁 `overrideTokens`

Use this to *force specific output values* — even if a value exists from the input.

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' }
});
// → '01/04/2025'
```

* ✅ Takes **precedence** over parsed and computed values
* ✅ Can be a `string` or a function:

```js
overrideTokens: {
  dd: () => '00',
  MM: (parts) => parts.month % 2 === 0 ? 'EVEN' : 'ODD'
}
```

* ✅ Works in both `'throw'` and `'silent'` mode

---

## 🧩 `defaultTokens`

Use this to *provide fallback values* **only when the token cannot be parsed**.

```js
formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', {
  defaultTokens: { dd: '99' }
});
// → '99/04/2025'
```

* ❌ Has no effect if a parsed value exists
* ✅ Useful for padding partial input
* ✅ Used in `'silent'` mode to improve best-effort output

---

## ⚠️ Comparison

| Feature          | Purpose                     | Takes Precedence | Applies When          |
| ---------------- | --------------------------- | ---------------- | --------------------- |
| `overrideTokens` | Force output per token      | ✅ Highest        | Always                |
| `defaultTokens`  | Fallback when missing input | ❌ Lower          | Only if parsing fails |

---

## 🛠 `errorPolicy`

Controls what happens when `formatDate` can't extract or render all required tokens.

### `'throw'` (default)

* Strict parsing — throws if any token can’t be parsed or rendered

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy');
// ❌ Throws: Cannot produce token "dd"
```

### `'silent'`

* Best-effort mode:

  * If **nothing can be parsed**, returns the raw input string
  * If **some tokens are parsed**, fills others with:

    * `overrideTokens` (if provided)
    * `defaultTokens` (if provided)
    * literal fallback (e.g. `'MM'`, `'dd'` as-is)

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  errorPolicy: 'silent',
});
// → 'MM/dd/2025'
```

```js
formatDate('BAD', 'yyyy', 'yyyy-MM-dd', {
  errorPolicy: 'silent'
});
// → 'BAD'
```

---

## 🧠 Tips

* Prefer `overrideTokens` when you want to **force a specific output structure**
* Use `defaultTokens` when you **expect partial input** and want to avoid hard failures
* Use `'silent'` policy when you want graceful degradation (e.g. data pipelines, display previews)

---

## ✅ Summary Matrix

| Case                          | Input      | Format       | Policy   | Output         |
| ----------------------------- | ---------- | ------------ | -------- | -------------- |
| All tokens parse correctly    | `20250425` | `dd/MM/yyyy` | `throw`  | `'25/04/2025'` |
| Missing input + no fallback   | `2025`     | `MM/yyyy/dd` | `throw`  | ❌ Throws error |
| Missing input + defaultTokens | `2025`     | `MM/dd/yyyy` | `silent` | `'MM/dd/2025'` |
| defaultTokens applied         | `202504`   | `dd/MM/yyyy` | `silent` | `'99/04/2025'` |
| overrideTokens win            | `20250425` | `dd/MM/yyyy` | `silent` | `'01/04/2025'` |
| Nothing parsed                | `BAD`      | `yyyy-MM-dd` | `silent` | `'BAD'`        |

---

See [`api.md`](./api.md) for usage reference.
