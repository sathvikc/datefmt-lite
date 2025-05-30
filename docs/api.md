# API Reference

## `formatDate(inputDate, inputFormat, outputFormat, options?)`

### Description

Converts a string `inputDate` into a new format using token-based extraction and rendering.

### Signature

```js
formatDate(inputDate, inputFormat, outputFormat, options?) → string
```

### Parameters

| Name           | Type     | Description                                           |
| -------------- | -------- | ----------------------------------------------------- |
| `inputDate`    | `string` | The raw date string to convert (e.g. `'20250425'`)    |
| `inputFormat`  | `string` | The tokenized format of the input (e.g. `'yyyyMMdd'`) |
| `outputFormat` | `string` | Desired output format (e.g. `'dd/MM/yyyy'`)           |
| `options`      | `object` | Optional config — see below                           |

### Returns

* A formatted string in the desired `outputFormat`
* Or the original `inputDate` if parsing fails and `errorPolicy === 'silent'`

---

## Options

```js
{
  errorPolicy: 'throw' | 'silent',
  yearConverter: (yy) => number,
  customTokens: { [token]: string | ((parts) => string) },
  overrideTokens: { [token]: string | ((parts) => string) },
  defaultTokens: { [token]: string | ((parts) => string) }
}
```

### errorPolicy

* `'throw'` (default): throws on any parsing/validation/rendering issue
* `'silent'`: suppresses errors and returns either best-effort output or the raw input

### yearConverter

* Required if using `yy` (two-digit years)
* Converts values like `25` → `2025`
* If not provided in silent mode, `yy` is interpreted as-is (`25` → `0025`)

### customTokens

* Define your own token renderers.
* Each token can be a static string or a function.

```js
customTokens: {
  Q: (p) => 'Q' + Math.ceil(p.month / 3),
  X: 'static'
}
```

### overrideTokens

* Override any token with a fixed string or function

```js
overrideTokens: {
  dd: () => '01',
  MM: '12'
}
```

### defaultTokens

* Provide fallback values if tokens can't be parsed from input
* Must be a string

```js
defaultTokens: {
  dd: '99',
  MM: '00'
}
```

---

## Token Handling

See [`tokens.md`](./tokens.md) for the complete list of built-in tokens and behaviors.

---

## Examples

```js
formatDate('20250425', 'yyyyMMdd', 'dd-MM-yyyy');
// → '25-04-2025'

formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => 2000 + yy,
});
// → '25/04/2025'

formatDate('BAD', 'yyyy', 'yyyy-MM-dd', {
  errorPolicy: 'silent',
});
// → 'BAD'

formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', {
  defaultTokens: { dd: '01' },
});
// → '01/04/2025'

formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  overrideTokens: { MM: '00', dd: '99' },
});
// → '00/99/2025'
```
