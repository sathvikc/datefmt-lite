# API Reference

`datefmt-lite` exposes one function you are meant to call — `formatDate` — plus
the lower-level pieces it is assembled from. The call rearranges a date **string**
from one format into another: no `Date` is constructed, no timezone is applied and
no locale is consulted.

| Read this                                                 | For                                           |
| --------------------------------------------------------- | --------------------------------------------- |
| [`docs/tokens.md`](./tokens.md)                           | the 14 tokens, input widths, matching rules   |
| [`docs/examples.md`](./examples.md)                       | worked examples and edge cases                |
| [`docs/formatting-behavior.md`](./formatting-behavior.md) | precedence and fallback matrix                |
| [`README.md`](../README.md)                               | overview, installation and the option summary |

---

## `formatDate`

### Signature

```ts
formatDate(
  inputDate: string,
  inputFormat: string,
  outputFormat: string,
  options?: FormatOptions,
): string
```

### Parameters

| Name           | Type     | Description                                |
| -------------- | -------- | ------------------------------------------ |
| `inputDate`    | `string` | The date string to read, e.g. `'20250425'` |
| `inputFormat`  | `string` | How to read it, e.g. `'yyyyMMdd'`          |
| `outputFormat` | `string` | How to write it, e.g. `'dd/MM/yyyy'`       |
| `options`      | `object` | Optional behaviour flags — see below       |

Both formats use the same 14 tokens, so a format is portable between the two
directions. Anything in a format that is not a token is literal text.

```js
import { formatDate } from 'datefmt-lite';

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd');
// → '20250425'          compact formats round-trip

formatDate('20250425', 'yyyyMMdd', 'Day dd of MMMM');
// → 'Day 25 of April'   unknown words are literal text

formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'        textual months parse in both directions

formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-ddTHH:mm:ss');
// → '2025-04-25T03:07:09'   ISO 8601 needs no escaping
```

### Returns

A new string in `outputFormat`. Under `errorPolicy: 'silent'` it can instead be
the untouched `inputDate` — see [Error handling](#error-handling).

### Throws

`DateFormatError` for caller mistakes, and for bad data unless
`errorPolicy: 'silent'`. Every error carries a `code`, plus `token` and `field`
where they apply. See [Error codes](#error-codes).

---

## Options

```js
formatDate(inputDate, inputFormat, outputFormat, {
  errorPolicy: 'throw',
  validate: 'off',
  verifyLiterals: true,
  strictTokens: false,
  yearConverter: (yy) => 2000 + yy,
  customTokens: { Q: (parts) => String(Math.ceil(parts.month / 3)) },
  overrideTokens: { dd: '01' },
  defaultTokens: { MM: '00' },
});
```

| Option           | Type                                        | Default   | Purpose                                      |
| ---------------- | ------------------------------------------- | --------- | -------------------------------------------- |
| `errorPolicy`    | `'throw' \| 'silent'`                       | `'throw'` | Whether bad data throws or degrades          |
| `validate`       | `'off' \| 'lenient' \| 'strict'`            | `'off'`   | Range checking of parsed fields              |
| `verifyLiterals` | `boolean`                                   | `true`    | Verify literal separators in `inputFormat`   |
| `strictTokens`   | `boolean`                                   | `false`   | Reject unrecognised words in `outputFormat`  |
| `yearConverter`  | `(yy: number) => number`                    | —         | Expands `yy` to a full year                  |
| `customTokens`   | `Record<string, (parts) => string \| null>` | `{}`      | Extra tokens, usable in input **and** output |
| `overrideTokens` | `Record<string, string \| TokenHandler>`    | `{}`      | Fixed values that win over everything        |
| `defaultTokens`  | `Record<string, string \| TokenHandler>`    | `{}`      | Used when a field has no parsed value        |

Unknown option keys are ignored rather than rejected.

### `errorPolicy: 'throw' | 'silent'`

`'throw'` raises a `DateFormatError` on any bad data. `'silent'` never does: an
unparseable input comes back unchanged and an unproducible output token renders
as its own name, so a defect in one field is visible in the output instead of
killing the batch.

```js
formatDate('not-a-date', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → 'not-a-date'    returned untouched, not a wrong date

formatDate('2025', 'yyyy', 'MM/dd/yyyy', { errorPolicy: 'silent' });
// → 'MM/dd/2025'    the token name marks the gap

formatDate('2025', 'yyyy', 'MM/dd/yyyy');
// throws: UNPRODUCIBLE_TOKEN, token 'MM'
```

`'silent'` still throws on **caller mistakes** — see
[Bad data vs caller mistakes](#bad-data-vs-caller-mistakes).

### `validate: 'off' | 'lenient' | 'strict'`

Off by default, because the library's contract is to make no calendar
assumptions. Turn it on when a pipeline needs data-quality guarantees.

| Mode        | An out-of-range field              | `formatDate('20250231', 'yyyyMMdd', 'dd/MM/yyyy')` |
| ----------- | ---------------------------------- | -------------------------------------------------- |
| `'off'`     | rendered exactly as parsed         | `'31/02/2025'`                                     |
| `'lenient'` | clamped to the nearest legal value | `'28/02/2025'`                                     |
| `'strict'`  | throws `OUT_OF_RANGE`              | throws                                             |

```js
formatDate('20250231', 'yyyyMMdd', 'dd/MM/yyyy');
// → '31/02/2025'    'off' makes no assertions

formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws: OUT_OF_RANGE, field 'month'

formatDate('20250425309900', 'yyyyMMddHHmmss', 'yyyy-MM-dd HH:mm:ss', {
  validate: 'lenient',
});
// → '2025-04-25 23:59:00'    hour clamped to its maximum
```

`'strict'` applies real leap-year rules: 2000 is a leap year, 1900 and 2100 are
not.

```js
formatDate('20240229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2024'

formatDate('20000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2000'    divisible by 400

formatDate('19000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws: OUT_OF_RANGE, field 'day'

formatDate('20250229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws: OUT_OF_RANGE, field 'day'
```

February is treated as 29 days long when the year was not parsed, because a
missing year must not reject a date that could be a leap year.

Two interactions worth knowing:

- A `'strict'` range failure is a data-quality assertion, so it throws **even
  under `'silent'`**.
- A `'lenient'` clamp under `'silent'` has nothing to render, so the raw input
  is returned unchanged.

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
  validate: 'strict',
  errorPolicy: 'silent',
});
// throws: OUT_OF_RANGE — 'silent' does not swallow assertions

formatDate('20250425309900', 'yyyyMMddHHmmss', 'yyyy-MM-dd HH:mm:ss', {
  validate: 'lenient',
  errorPolicy: 'silent',
});
// → '20250425309900'
```

### `verifyLiterals: boolean`

`true` by default. Literal separators in `inputFormat` are compared against the
input, so a stray byte fails the record instead of shifting every later field.

`false` skips a mismatched separator by its declared width, which is only useful
for legacy call sites that treat separators as positional. It is not a way to
tolerate a wrong separator: skipping desynchronises the cursor, and the parse
reports a mismatch anyway.

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy');
// throws: INPUT_MISMATCH — the separator did not match

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// throws: INPUT_MISMATCH — still reported, because the cursor desynchronised

formatDate('2025-04-25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// → '25/04/2025'    the flag only changes what a mismatch means, not whether it is one
```

### `strictTokens: boolean`

`false` by default, which is why `'Day dd of MMMM'` works: unrecognised words are
literal text. `true` treats any alphabetic run outside brackets as a probable
typo and throws `UNPRODUCIBLE_TOKEN`.

```js
formatDate('20250425', 'yyyyMMdd', 'ISO yyyy');
// → 'ISO 2025'    'ISO' is literal text

formatDate('20250425', 'yyyyMMdd', 'ISO yyyy', { strictTokens: true });
// throws: UNPRODUCIBLE_TOKEN, token 'ISO'

formatDate('20250425', 'yyyyMMdd', '[ISO] yyyy', { strictTokens: true });
// → 'ISO 2025'    brackets are the escape hatch
```

Separators that are a single character — `T`, `Z`, `W`, `a`, `t`, `z` — stay
allowed so ISO 8601 output remains expressible. That exemption applies to the
whole word, so a `T` glued to a token needs brackets:

```js
formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd[T]HH:mm:ss', {
  strictTokens: true,
});
// → '2025-04-25T03:07:09'

formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-ddTHH:mm:ss', {
  strictTokens: true,
});
// throws: UNPRODUCIBLE_TOKEN, token 'ddTHH'
```

### `yearConverter: (yy: number) => number`

Required whenever `yy` appears in `inputFormat` and the policy is `'throw'`,
because `25` alone does not say which century you meant. The return value must be
a non-negative integer, or `INVALID_YEAR` is thrown.

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => 2000 + yy,
});
// → '25/04/2025'

formatDate('250425', 'yyMMdd', 'dd/MM/yyyy');
// throws: INVALID_OPTION, token 'yy', field 'year'

formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '25/04/0025'    without a converter 'yy' is taken literally, so no throw

formatDate('250425', 'yyMMdd', 'yyyy', { yearConverter: (yy) => `${yy}` });
// throws: INVALID_YEAR, field 'year'
```

A pivot that keeps two-digit years sortable is the usual choice:

```js
const pivot = (yy) => (yy < 50 ? 2000 + yy : 1900 + yy);
formatDate('991231', 'yyMMdd', 'yyyy-MM-dd', { yearConverter: pivot });
// → '1999-12-31'
```

### `customTokens: Record<string, (parts) => string | null>`

Extra tokens, recognised in `inputFormat` **and** `outputFormat`. The handler
receives the normalised fields and returns the text to emit. This is how fiscal
quarters, plant codes and period codes are expressed without a plugin.

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => String(Math.ceil(parts.month / 3)) },
});
// → '2025-Q2'

formatDate('20250601', 'yyyyMMdd', 'yyyy-Q/dd', {
  customTokens: { Q: (parts) => `Q${Math.ceil(parts.month / 3)}` },
});
// → '2025-Q2/01'
```

Rules:

- The value must be a function; a string throws `INVALID_OPTION`.
- The name must not be an inherited `Object.prototype` member
  (`toString`, `valueOf`, `constructor`, `__proto__`, …), or `RESERVED_TOKEN` is
  thrown.
- In `inputFormat` a custom token consumes a run of digits exactly as long as
  its name, and the parsed value is exposed as `parts[tokenName]`.
- A handler that returns `null`, or throws, renders the token name — under both
  policies. The earlier `UNPRODUCIBLE_TOKEN` check is about field availability,
  not handler return values.

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { customTokens: { Q: 'Q' } });
// throws: INVALID_OPTION, token 'Q'

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  customTokens: { toString: () => 'x' },
});
// throws: RESERVED_TOKEN, token 'toString'

formatDate('20250425', 'yyyyMMdd', 'yyyy-[X]X', {
  customTokens: { X: () => null },
});
// → '2025-XX'    a handler with nothing to say renders its own name
```

Custom tokens in an input format work like this — the token name is the input
width, and the digits it read land in `parts[tokenName]`:

```js
formatDate('2025040902', 'yyyyMMddQQ', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => `Q${parts.Q}` },
});
// → '2025-QQ2'
```

See [`docs/tokens.md`](./tokens.md#custom-tokens) for the full rules.

### `overrideTokens: Record<string, string | TokenHandler>`

The highest-precedence source. An entry replaces whatever the parsed input,
another custom token, or a default would have produced.

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
});
// → '01/04/2025'

formatDate('20250425', 'yyyyMMdd', 'MM/dd/yyyy', {
  overrideTokens: { MM: (parts) => (parts.month % 2 === 0 ? 'EVEN' : 'ODD') },
});
// → 'EVEN/25/2025'
```

Overrides win over `customTokens` too, so a caller can pin a custom token's
output without editing the handler.

### `defaultTokens: Record<string, string | TokenHandler>`

The lowest-precedence source that is not a literal. It applies when the
**field** behind a token has no parsed value — not when a particular token name
is absent. A month parsed as `M` therefore satisfies `MM`.

```js
formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', { defaultTokens: { dd: '99' } });
// → '99/04/2025'    no day was parsed at all

formatDate('20250409', 'yyyyMd', 'dd/MM/yyyy', { defaultTokens: { dd: '99' } });
// → '09/04/2025'    the day field *was* parsed, as 'd', so the default stands down

formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  defaultTokens: { MM: '00', dd: '99' },
});
// → '00/99/2025'
```

`defaultTokens` and `errorPolicy: 'silent'` compose — the default fills the hole
it can, and anything still missing falls back to the token name:

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  errorPolicy: 'silent',
  defaultTokens: { MM: '00' },
});
// → '00/dd/2025'
```

---

## Precedence

When several sources could supply an output token, the winner is the first of:

1. `overrideTokens`
2. `customTokens`
3. the value parsed from the input
4. `defaultTokens`
5. the literal token name (only reachable under `'silent'`)

`overrideTokens` and `customTokens` are matched by token **name**, while built-in
tokens are matched by **field**. That is why a month parsed as `M` satisfies
`MM` and is not overwritten by a `defaultTokens.MM`.

Naming a custom token after a built-in replaces that built-in's renderer, but the
built-in field still decides whether the token is producible — so shadowing a name
whose field was never parsed leaves `UNPRODUCIBLE_TOKEN` in force:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  customTokens: { MM: (parts) => `MONTH-${parts.month}` },
});
// → '25/MONTH-4/2025'    the custom renderer replaces the built-in one

formatDate('2025', 'yyyy', 'MM/yyyy', {
  customTokens: { MM: () => 'C' },
  defaultTokens: { MM: 'D' },
});
// throws: UNPRODUCIBLE_TOKEN, token 'MM' — the month field is still empty
```

See [`docs/formatting-behavior.md`](./formatting-behavior.md) for the full matrix.

---

## Error handling

Everything thrown is a `DateFormatError` with a `name` of `'DateFormatError'`, a
`code`, and `token` / `field` where they apply:

```js
try {
  formatDate('2025', 'yyyy', 'dd');
} catch (err) {
  err.name; // → 'DateFormatError'
  err.code; // → 'UNPRODUCIBLE_TOKEN'
  err.token; // → 'dd'
}
```

Branch on `code` rather than matching message text; messages are for humans and
may change.

### Bad data vs caller mistakes

`errorPolicy` splits the world in two.

| Dimension        | Bad data                                                         | Caller mistake                                                                                       |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| What it is       | a malformed record                                               | a bug in the calling code                                                                            |
| Under `'throw'`  | `DateFormatError`                                                | `DateFormatError`                                                                                    |
| Under `'silent'` | degrades to input or token name                                  | still throws                                                                                         |
| Examples         | wrong separator, trailing junk, missing field, out-of-range date | non-string argument, bad option value, `yearConverter` returning `'abc'`, reserved custom-token name |

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '2025/04/25'    bad data degrades

formatDate(20250425, 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// throws: INVALID_ARGUMENT — a number was passed where a string was required

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'ignore' });
// throws: INVALID_OPTION — an unrecognised policy is a typo, not bad data
```

The reasoning is that a caller mistake will produce wrong output for **every**
row, which silent handling would turn into a quiet, total loss of data quality.
Bad data is per-record and worth tolerating when you ask for it.

### What each policy does, case by case

| Situation                                     | `'throw'`                   | `'silent'`             |
| --------------------------------------------- | --------------------------- | ---------------------- |
| Input does not match `inputFormat`            | throws `INPUT_MISMATCH`     | returns `inputDate`    |
| Output token has no source                    | throws `UNPRODUCIBLE_TOKEN` | renders the token name |
| `strictTokens` rejects an unknown word        | throws `UNPRODUCIBLE_TOKEN` | returns `inputDate`    |
| `validate: 'strict'` finds an impossible date | throws `OUT_OF_RANGE`       | throws `OUT_OF_RANGE`  |
| `validate: 'lenient'` must clamp              | clamped values are used     | returns `inputDate`    |
| `validate: 'off'`                             | no checking                 | no checking            |
| Custom handler returns `null` or throws       | renders the token name      | renders the token name |
| Caller mistake                                | throws                      | throws                 |

---

## Error codes

| Code                 | Raised when                                                                                                                                                                           | Carries                         | Silenced by `'silent'`                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| `INVALID_ARGUMENT`   | A required argument is not a string, or `options` is not an object                                                                                                                    | —                               | No                                                  |
| `INVALID_OPTION`     | `errorPolicy` or `validate` is not one of the accepted values; `yearConverter` is not a function; a `customTokens` value is not a function; `yy` was parsed without a `yearConverter` | `token`, `field` where relevant | No                                                  |
| `RESERVED_TOKEN`     | A `customTokens` name collides with an inherited `Object.prototype` member                                                                                                            | `token`                         | No                                                  |
| `INPUT_MISMATCH`     | The input did not conform to `inputFormat`: literal mismatch, unreadable token, trailing content, or a cursor desynchronised by `verifyLiterals: false`                               | —                               | Yes — returns `inputDate`                           |
| `UNPRODUCIBLE_TOKEN` | An output token has no parsed value, default or override; or `strictTokens` found an unknown word in `outputFormat`                                                                   | `token`                         | Yes — token name, or `inputDate` for `strictTokens` |
| `OUT_OF_RANGE`       | `validate: 'strict'` found a field outside its legal range, including real leap-year rules                                                                                            | `field`                         | No                                                  |
| `INVALID_YEAR`       | `yearConverter` returned something that is not a non-negative integer, or the parsed year was not one                                                                                 | `field`                         | Yes — returns `inputDate`                           |

```js
formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy');
// throws: INPUT_MISMATCH — trailing content is never ignored

formatDate('\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// throws: INPUT_MISMATCH — a BOM shifts the whole record

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '25/04/2025'
```

---

## Public API surface

`formatDate` is the supported entry point. Everything else is exported so the
pipeline can be assembled by hand, and so tests can assert on intermediate
stages. All 26 exports are typed in `types/index.d.ts`.

### Entry point

| Export       | Kind     | Description                                                     |
| ------------ | -------- | --------------------------------------------------------------- |
| `formatDate` | function | Rearranges a date string from `inputFormat` into `outputFormat` |

### Pipeline stages

| Export            | Kind     | Description                                                                                     |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `extractTokens`   | function | Reads raw token values out of an input string; returns `{ tokens, values, mismatched }`         |
| `normalizeFields` | function | Maps raw token values onto semantic fields (`year`, `month`, `day`, `hour`, `minute`, `second`) |
| `hasField`        | function | Reports whether a normalised field holds a non-null value                                       |
| `validateOutput`  | function | Builds the handler table the renderer will use, applying precedence and `strictTokens`          |
| `buildTemplate`   | function | Compiles an output format into a reusable plan of `text` and `token` steps                      |
| `renderTemplate`  | function | Renders a compiled plan against a set of fields                                                 |
| `validateFields`  | function | Range-checks fields for `'lenient'` or `'strict'`, returning an outcome or `null`               |
| `isRealDate`      | function | Reports whether a year/month/day triple is a real calendar date                                 |

### Format primitives

| Export                       | Kind     | Description                                                     |
| ---------------------------- | -------- | --------------------------------------------------------------- |
| `tokenizeFormat`             | function | Splits a format into `literal`, `token` and `escaped` segments  |
| `buildTokenPattern`          | function | Builds the longest-first alternation body for a token set       |
| `buildTokenMatcher`          | function | Compiles a sticky `RegExp` matcher for a token set              |
| `collectTokens`              | function | Collects the distinct token names from tokenized segments       |
| `escapeRegex`                | function | Escapes a string for inclusion in a regular expression          |
| `extractAllTokensFromFormat` | function | Collects every contiguous alphabetic run in a string            |
| `looksLikeToken`             | function | Reports whether a name is shaped like a token (`/^[A-Za-z]+$/`) |

### Token tables and month data

| Export             | Kind     | Description                                                                  |
| ------------------ | -------- | ---------------------------------------------------------------------------- |
| `TOKEN_REGISTRY`   | object   | Every built-in token with its field, input width, variable flag and handler  |
| `BUILTIN_TOKENS`   | array    | The 14 built-in token names                                                  |
| `DEFAULT_HANDLERS` | object   | Built-in renderers keyed by token name                                       |
| `TOKEN_FIELD_MAP`  | object   | Maps each built-in token to the field it populates                           |
| `FIELD_GROUPS`     | object   | Groups tokens by field, e.g. `month` holds `MMMM`, `MMM`, `MM`, `M`          |
| `MONTH_NAMES`      | array    | The 12 full English month names, index 0 = January                           |
| `MONTH_ABBREV`     | array    | The 12 three-letter abbreviations, index 0 = Jan                             |
| `parseMonthName`   | function | Resolves a month name or abbreviation, case-insensitively, to 1-12 or `null` |

### Errors

| Export            | Kind   | Description                                                                   |
| ----------------- | ------ | ----------------------------------------------------------------------------- |
| `DateFormatError` | class  | The single error type; carries `code`, and `token` / `field` where they apply |
| `ERROR_CODES`     | object | The frozen set of the 7 codes listed above                                    |

---

## What this library deliberately does not do

These are decisions, not gaps. If you need one of them, use `date-fns`, `dayjs`
or `luxon`.

| It does not                       | Why                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Construct a `Date`                | The input is a string in a positional record; there is nothing to construct from                       |
| Apply a timezone or offset        | A fixed-width field has no zone information, so any offset would be invented                           |
| Consult a locale or `Intl`        | Output is byte-for-byte what the format asked for; `April` is not `avril`                              |
| Do date arithmetic                | Adding a day needs a calendar model; this rearranges fields and stops                                  |
| Infer a format                    | You declare both sides; guessing from the data is how wrong dates get shipped                          |
| Validate by default               | `validate: 'off'` keeps the no-assumptions contract; range checking is opt-in                          |
| Implement the full TR35 token set | 14 tokens cover fixed-width data; `Q`, `D`, `E`, `w`, `L`, `S` and the zone tokens are not implemented |
| Parse natural-language dates      | `25 April 2025` needs a real parser, not a width table                                                 |
| Offer a batch or stream API       | `formatDate` is a single pure call; map it over your own loop                                          |
| Reject unknown option keys        | An unrecognised option is ignored, so a typo in a key is not fatal — check your config                 |

---

## See also

- [`docs/tokens.md`](./tokens.md) — token table, input widths, matching rules
- [`docs/examples.md`](./examples.md) — worked examples and edge cases
- [`docs/formatting-behavior.md`](./formatting-behavior.md) — precedence and fallback matrix
- [`README.md`](../README.md) — overview and installation
