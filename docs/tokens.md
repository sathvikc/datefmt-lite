# Supported Tokens

Built-in tokens follow the [Unicode Date Field Symbol Table](https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table), and are purely string-based — no native `Date` objects involved.

These tokens can be used in both `inputFormat` and `outputFormat` for `formatDate()`.

---

## 📆 Date Tokens

| Token  | Meaning            | Example |
| ------ | ------------------ | ------- |
| `yyyy` | Full year          | 2025    |
| `yy`   | 2-digit year       | 25      |
| `MMMM` | Full month name    | April   |
| `MMM`  | Short month name   | Apr     |
| `MM`   | 2-digit month      | 04      |
| `M`    | 1 or 2-digit month | 4       |
| `dd`   | 2-digit day        | 09      |
| `d`    | 1 or 2-digit day   | 9       |

## 🕐 Time Tokens

| Token | Meaning             | Example |
| ----- | ------------------- | ------- |
| `HH`  | 2-digit hour (24h)  | 03      |
| `H`   | 1 or 2-digit hour   | 3       |
| `mm`  | 2-digit minute      | 07      |
| `m`   | 1 or 2-digit minute | 7       |
| `ss`  | 2-digit second      | 09      |
| `s`   | 1 or 2-digit second | 9       |

---

## 🔖 Bracketed Literals

You can include literal text in output formats using square brackets:

```js
formatDate('20250425T101010', 'yyyyMMddTHHmmss', 'dd MMM yyyy [at] HH:mm');
// → '25 Apr 2025 at 10:10'
```

Anything inside `[...]` is treated as a literal — even if it looks like a token.

---

## 🧩 Custom Tokens

You can add your own tokens using `customTokens` in options:

```js
formatDate('20250601', 'yyyyMMdd', 'yyyy [Q]Q', {
  customTokens: {
    Q: (parts) => Math.ceil(parts.month / 3)
  }
});
// → '2025 Q2'
```

Built-in token names are reserved. You can override them using `overrideTokens` if needed.

---

## 🔍 Token Matching

* Token extraction is greedy and longest-match wins
* Unknown tokens will throw (unless in `'silent'` mode)
* Tokens are case-sensitive

---

For formatting behaviors, error handling, and token fallback logic, see [`formatting-behavior.md`](./formatting-behavior.md).
