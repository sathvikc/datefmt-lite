# Formatting Behaviour

How `formatDate()` resolves a token when several sources could supply it, what
each `errorPolicy` and validation mode does, and how the pieces interact.

Every cell in the matrices below was executed against the current source. Where
a cell throws, the code shown is the `DateFormatError.code`.

**Setup assumed by every example:**

```js
import { formatDate } from 'datefmt-lite';
```

The pipeline behind all of this is documented in
[`internals.md`](./internals.md). The option reference is in
[`api.md`](./api.md); the token table is in [`tokens.md`](./tokens.md).

---

## Precedence

### The ladder

When an output token needs a value, sources are consulted highest first:

| Rank | Source                      | Wins because                                               |
| ---- | --------------------------- | ---------------------------------------------------------- |
| 1    | `overrideTokens`            | An explicit fixed value the caller supplied for this token |
| 2    | `customTokens`              | A registered handler for this token name                   |
| 3    | value parsed from the input | Real data from the record                                  |
| 4    | `defaultTokens`             | A fallback, used only when there is no data                |
| 5    | the literal token name      | Last resort, `'silent'` only                               |

Each rung is exclusive: the first source that applies takes the token outright.
There is no merging, and a lower rung never contributes to a token a higher
rung already claimed.

### `defaultTokens` keys off the field, not the token name

This is the single most misread rule. `defaultTokens` applies when the
**underlying field** has no parsed value — not when a particular token name is
absent from the input. All of `MMMM`, `MMM`, `MM` and `M` populate `month`, so
one of them being present satisfies the field for every one of them.

With an input format that parses the month as `M`, a `defaultTokens.MM` has
nothing to do:

```js
formatDate('4-25-2025', 'M-dd-yyyy', 'dd/MM/yyyy', {
  defaultTokens: { MM: '11' },
});
// → '25/04/2025'     parsed month 4 wins over the MM default
```

The reverse is equally true — a month parsed as `MM` satisfies a `M` default:

```js
formatDate('04-25-2025', 'MM-dd-yyyy', 'dd/MM/yyyy', {
  defaultTokens: { M: '11' },
});
// → '25/04/2025'
```

When the field genuinely has no data, the default applies:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  defaultTokens: { dd: '01', MM: '02' },
});
// → '01/02/2025'
```

### `overrideTokens` beats `defaultTokens`, parsed or not

The override is checked first and is never overwritten, including for a token
that was never parsed:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
  defaultTokens: { dd: '99', MM: '11' },
});
// → '01/11/2025'    override for dd, default for MM
```

An override that names a token absent from the output format costs nothing:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { HH: '00' },
});
// → '25/04/2025'
```

An explicit `undefined` is still an override — presence is tested with
`hasOwn`, not truthiness — so it does not fall through to a lower rung:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  overrideTokens: { dd: undefined },
});
// → 'dd/MM/2025'
```

### Worked precedence matrix

Input `20250425`, input format `yyyyMMdd` unless stated otherwise. Each row is
one verified call.

| Output format | `overrideTokens`                   | `defaultTokens`                    | Result                      |
| ------------- | ---------------------------------- | ---------------------------------- | --------------------------- |
| `dd/MM/yyyy`  | —                                  | —                                  | `'25/04/2025'`              |
| `dd/MM/yyyy`  | `{ dd: '01' }`                     | —                                  | `'01/04/2025'`              |
| `dd/MM/yyyy`  | —                                  | `{ dd: '01' }`                     | `'25/04/2025'`              |
| `dd/MM/yyyy`  | —                                  | `{ dd: '01', MM: '11' }`           | `'25/04/2025'`              |
| `dd/MM/yyyy`  | `{ dd: '01' }`                     | `{ dd: '99', MM: '11' }`           | `'01/04/2025'`              |
| `dd/MM/yyyy`  | `{ yyyy: '2024' }`                 | —                                  | `'25/04/2024'`              |
| `dd/MM/yyyy`  | `{ MM: (p) => String(p.month) }`   | —                                  | `'25/4/2025'`               |
| `dd/MM/yyyy`  | `{ dd: (p) => String(p.day) }`     | —                                  | `'25/04/2025'`              |
| `HH:mm:ss`    | —                                  | `{ HH: '00', mm: '00', ss: '00' }` | `'00:00:00'`                |
| `HH:mm:ss`    | `{ HH: '00', mm: '00', ss: '00' }` | —                                  | `'00:00:00'`                |
| `HH:mm:ss`    | —                                  | —                                  | `UNPRODUCIBLE_TOKEN` (`HH`) |
| `dd/MM/yyyy`  | —                                  | `{ HH: '00' }`                     | `'25/04/2025'`              |

The last two rows are the shape to remember: a default or override for a field
the output never asks about is inert, and an override for a field the _input_
never parsed is what makes it fire.

A token name that is not in the registry at all is not gated by any field, so
`overrideTokens` is the only way to give it a value — otherwise it renders
literally:

```js
formatDate('2025', 'yyyy', 'HH:mm:ss', {
  defaultTokens: { HH: '00', mm: '00', ss: '00' },
});
// → '00:00:00'

formatDate('2025', 'yyyy', 'HH:mm:ss', {
  overrideTokens: { HH: '00', mm: '00', ss: '00' },
});
// → '00:00:00'

formatDate('2025', 'yyyy', 'HH:mm:ss');
// throws UNPRODUCIBLE_TOKEN  (token 'HH')
```

---

## Full behaviour matrix

The same input, varying `errorPolicy`, `defaultTokens` and `overrideTokens`.
Every cell executed.

| Input        | Input format | Output format    | `errorPolicy` | Other options                                     | Result                      |
| ------------ | ------------ | ---------------- | ------------- | ------------------------------------------------- | --------------------------- |
| `20250425`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `throw`       | —                                                 | `'25/04/2025'`              |
| `20250425`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `silent`      | —                                                 | `'25/04/2025'`              |
| `20250425`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `throw`       | `overrideTokens: { dd: '01' }`                    | `'01/04/2025'`              |
| `20250425`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `silent`      | `overrideTokens: { dd: '01' }`                    | `'01/04/2025'`              |
| `20250425`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `throw`       | `defaultTokens: { dd: '01' }`                     | `'25/04/2025'`              |
| `20250425`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `silent`      | `defaultTokens: { dd: '01' }`                     | `'25/04/2025'`              |
| `202504`     | `yyyyMM`     | `dd/MM/yyyy`     | `throw`       | `defaultTokens: { dd: '99' }`                     | `'99/04/2025'`              |
| `202504`     | `yyyyMM`     | `dd/MM/yyyy`     | `silent`      | `defaultTokens: { dd: '99' }`                     | `'99/04/2025'`              |
| `2025`       | `yyyy`       | `dd/MM/yyyy`     | `throw`       | —                                                 | `UNPRODUCIBLE_TOKEN` (`dd`) |
| `2025`       | `yyyy`       | `MM/dd/yyyy`     | `silent`      | —                                                 | `'MM/dd/2025'`              |
| `2025`       | `yyyy`       | `dd/MM/yyyy`     | `silent`      | `defaultTokens: { dd: '01' }`                     | `'01/MM/2025'`              |
| `2025`       | `yyyy`       | `dd/MM/yyyy`     | `silent`      | `overrideTokens: { dd: '01' }`                    | `'01/MM/2025'`              |
| `2025`       | `yyyy`       | `dd/MM/yyyy`     | `silent`      | `defaultTokens: { dd: '01', MM: '02' }`           | `'01/02/2025'`              |
| `2025`       | `yyyy`       | `HH:mm:ss`       | `silent`      | —                                                 | `'HH:mm:ss'`                |
| `2025`       | `yyyy`       | `HH:mm:ss`       | `silent`      | `defaultTokens: { HH: '00', mm: '00', ss: '00' }` | `'00:00:00'`                |
| `20250425`   | `yyyyMMdd`   | `yyyyMMddHHmmss` | `silent`      | —                                                 | `'20250425HHmmss'`          |
| `20250425`   | `yyyyMMdd`   | `yyyyMMddHHmmss` | `throw`       | `defaultTokens: { HH: '23', mm: '59', ss: '59' }` | `'20250425235959'`          |
| `not-a-date` | `yyyyMMdd`   | `dd/MM/yyyy`     | `silent`      | —                                                 | `'not-a-date'`              |
| `not-a-date` | `yyyyMMdd`   | `dd/MM/yyyy`     | `silent`      | `defaultTokens: { dd: '99' }`                     | `'not-a-date'`              |
| `2025/04/25` | `yyyy-MM-dd` | `dd/MM/yyyy`     | `silent`      | —                                                 | `'2025/04/25'`              |
| `2025AB25`   | `yyyyMMdd`   | `dd/MM/yyyy`     | `silent`      | —                                                 | `'2025AB25'`                |

Note the two rows where `defaultTokens` is present but the field was parsed:
`20250425` with `defaultTokens: { dd: '01' }` gives `'25/04/2025'` under **both**
policies. The parsed day wins, and the policy has no bearing on it.

The last row pair shows the ordering of the fallbacks: a `defaultTokens`
entry cannot rescue a record that failed to parse, because the input check
happens before token resolution at all.

---

## `errorPolicy`

### `'throw'` (default)

The first problem stops the call and raises a `DateFormatError`.

| Condition                              | Code                 | `.token`  | `.field` |
| -------------------------------------- | -------------------- | --------- | -------- |
| Input does not match `inputFormat`     | `INPUT_MISMATCH`     | —         | —        |
| Output token has no source             | `UNPRODUCIBLE_TOKEN` | the token | —        |
| `yy` parsed without a `yearConverter`  | `INVALID_OPTION`     | `yy`      | `year`   |
| `yearConverter` returned a non-integer | `INVALID_YEAR`       | —         | `year`   |
| `strictTokens` found an unknown word   | `UNPRODUCIBLE_TOKEN` | the word  | —        |

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  — the separator did not match, so every later field
//                         would have been read from the wrong offset

formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  — trailing content is never ignored

formatDate('\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  — a BOM shifts the whole record

formatDate('2025AB25', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  — corrupt token content

formatDate('2025', 'yyyy', 'dd/MM/yyyy');
// throws UNPRODUCIBLE_TOKEN  (token 'dd')

formatDate('250425', 'yyMMdd', 'dd/MM/yyyy');
// throws INVALID_OPTION  (token 'yy', field 'year')

formatDate('20250425', 'yyyyMMdd', 'dd/mm/yyyy');
// throws UNPRODUCIBLE_TOKEN  (token 'mm') — lower-case mm is minutes
```

Branch on `err.code`, not on message text:

```js
try {
  formatDate('2025', 'yyyy', 'dd/MM/yyyy');
} catch (err) {
  err.name; // 'DateFormatError'
  err.code; // 'UNPRODUCIBLE_TOKEN'
  err.token; // 'dd'
}
```

### `'silent'`

Two fallbacks, both chosen so a bad record cannot pass as a good one:

| Failure                         | Result                             |
| ------------------------------- | ---------------------------------- |
| Input does not match the format | `inputDate`, returned unchanged    |
| An output token has no source   | The token name, rendered literally |

```js
formatDate('not-a-date', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → 'not-a-date'

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '2025/04/25'

formatDate('2025', 'yyyy', 'MM/dd/yyyy', { errorPolicy: 'silent' });
// → 'MM/dd/2025'

formatDate('20250425', 'yyyyMMdd', 'yyyyMMddHHmmss', { errorPolicy: 'silent' });
// → '20250425HHmmss'
```

The token-name fallback still honours overrides and defaults, because those are
deliberate supplies rather than fallbacks:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  overrideTokens: { dd: '01' },
});
// → '01/MM/2025'
```

### What `'silent'` never suppresses

`errorPolicy` governs bad **data**, not bad **calls**. These throw under every
policy, because a bug in the calling code is worth surfacing rather than
hiding:

| Mistake                                           | Code               |
| ------------------------------------------------- | ------------------ |
| `inputDate` not a string                          | `INVALID_ARGUMENT` |
| `outputFormat` not a string                       | `INVALID_ARGUMENT` |
| `options` not an object                           | `INVALID_ARGUMENT` |
| `errorPolicy` not `'throw'` or `'silent'`         | `INVALID_OPTION`   |
| `validate` not `'off'`, `'lenient'` or `'strict'` | `INVALID_OPTION`   |
| `yearConverter` not a function                    | `INVALID_OPTION`   |
| `customTokens` entry not a function               | `INVALID_OPTION`   |
| `customTokens` named an `Object.prototype` member | `RESERVED_TOKEN`   |

```js
formatDate(123, 'yyyyMMdd', 'yyyy');
// throws INVALID_ARGUMENT

formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  yearConverter: 'nope',
});
// throws INVALID_OPTION

formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  customTokens: { Q: 'nope' },
});
// throws INVALID_OPTION

formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  customTokens: { toString: () => 'x' },
});
// throws RESERVED_TOKEN
```

**The one exception:** a `validate: 'strict'` range failure throws even under
`'silent'`. A range assertion is a data-quality gate, not a formatting
inconvenience:

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
  validate: 'strict',
  errorPolicy: 'silent',
});
// throws OUT_OF_RANGE  (field 'month')
```

### Error message hygiene

Messages quote token and format names only, never the input value, so a
customer identifier in a bad record cannot leak into a log line. Long names are
truncated at 64 characters.

```js
try {
  formatDate('ACCOUNT-99182', 'yyyyMMdd', 'dd/MM/yyyy');
} catch (err) {
  err.message; // 'Input does not match inputFormat "yyyyMMdd"'
}
```

---

## `validate`

Off by default, because the library's contract is to rearrange strings and make
no assumptions. Turn it on when a pipeline needs data-quality guarantees.

### `'off'` (default)

No range checking at all. Out-of-range values pass straight through:

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy');
// → '45/13/2025'

formatDate('99999999', 'yyyyMMdd', 'dd/MM/yyyy');
// → '99/99/9999'
```

### `'strict'`

Rejects any field outside its legal range, with `OUT_OF_RANGE` and `.field`
naming the culprit.

| Field    | Bounds          |
| -------- | --------------- |
| `month`  | 1–12            |
| `day`    | 1–days-in-month |
| `hour`   | 0–23            |
| `minute` | 0–59            |
| `second` | 0–59            |

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'month')  — "month 13 is out of range (expected 1-12)"

formatDate('20250431', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day')    — "day 31 is out of range (expected 1-30)"

formatDate('2025042525', 'yyyyMMddHH', 'dd/MM/yyyy HH', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'hour')   — "hour 25 is out of range (expected 0-23)"
```

### Leap years

Gregorian: divisible by 4, except centuries not divisible by 400.

```js
formatDate('20240229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2024'

formatDate('20000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2000'

formatDate('20250229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day')

formatDate('19000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day')  — 1900 is divisible by 100 but not 400

formatDate('21000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day')  — 2100 likewise
```

The day limit depends on the year being present. With no year, February is
allowed 29 days, because a missing year must not reject a date that could
legitimately be a leap year:

```js
formatDate('0229', 'MMdd', 'MM-dd', { validate: 'strict' });
// → '02-29'
```

### `'lenient'`

Clamps each offending value into range and carries on:

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'lenient' });
// → '31/12/2025'     month 13 → 12, day 45 → 31

formatDate('20250431', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'lenient' });
// → '30/04/2025'

formatDate('2025042525', 'yyyyMMddHH', 'dd/MM/yyyy HH', {
  validate: 'lenient',
});
// → '25/04/2025 23'

formatDate('00000000', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'lenient' });
// → '01/01/0000'
```

An unrecognised mode is a caller mistake:

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'nope' });
// throws INVALID_OPTION
```

### Interaction with `errorPolicy`

`'lenient'` never throws, so `'silent'` changes nothing. `'strict'` throws, and
that throw is not suppressible:

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
  validate: 'strict',
  errorPolicy: 'silent',
});
// throws OUT_OF_RANGE
```

Validation runs before token resolution, so a strict failure wins even over an
`overrideTokens` entry that would have supplied the field anyway:

```js
formatDate('20250431235959', 'yyyyMMddHHmmss', 'HH:mm:ss', {
  validate: 'strict',
});
// throws OUT_OF_RANGE  (field 'day')
```

---

## `strictTokens`

`false` by default. When `true`, an unrecognised alphabetic run in
`outputFormat` is a probable typo rather than literal text, and is rejected
outright.

```js
formatDate('20250425', 'yyyyMMdd', 'ISO yyyy', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'ISO')

formatDate('20250425', 'yyyyMMdd', 'UTC yyyy-MM-dd', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'UTC')

formatDate('20250425', 'yyyyMMdd', 'day dd of MMMM yyyy', {
  strictTokens: true,
});
// throws UNPRODUCIBLE_TOKEN  (token 'day')
```

Bracketing any literal word fixes it:

```js
formatDate('20250425', 'yyyyMMdd', '[ISO] yyyy', { strictTokens: true });
// → 'ISO 2025'

formatDate('20250425', 'yyyyMMdd', '[day ]dd[ of ]MMMM yyyy', {
  strictTokens: true,
});
// → 'day 25 of April 2025'

formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd[ ]HH:mm:ss', {
  strictTokens: true,
  errorPolicy: 'silent',
});
// → '2025-04-25 HH:mm:ss'
```

Punctuation and separators are exempt, so ordinary delimited formats are
unaffected. Only the alphabetic runs themselves are checked:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { strictTokens: true });
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'Date: dd MMMM', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'Date') — 'Date' is a word, ':' is not

formatDate('20250425', 'yyyyMMdd', '[Date: ]dd MMMM', { strictTokens: true });
// → 'Date: 25 April'

formatDate('20250425', 'yyyyMMdd', 'no. dd', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'no') — the full stop does not help
```

### ISO 8601 needs a bracketed `T`

The check runs over the raw format string, so the `T` in `ddTHH:mm:ss` is part
of one alphabetic run, not a separator. `T`, `Z`, `W`, `a`, `t` and `z` are
exempt as standalone words only:

```js
formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-ddTHH:mm:ss', {
  strictTokens: true,
});
// throws UNPRODUCIBLE_TOKEN  (token 'ddTHH')

formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd[T]HH:mm:ss', {
  strictTokens: true,
});
// → '2025-04-25T03:07:09'
```

### Interaction with `errorPolicy`

`strictTokens` failures are `UNPRODUCIBLE_TOKEN`, so `'silent'` swallows them
like any other unproducible token:

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  strictTokens: true,
  errorPolicy: 'silent',
});
// → 'MM/dd/2025'
```

### Why it matters

With `strictTokens: false`, an unbracketed literal word can be silently
mis-tokenised rather than rejected:

```js
formatDate('20250425', 'yyyyMMdd', 'day dd of MMMM');
// → '25ay 25 of April'     the 'd' of 'day' was read as the day token

formatDate('20250425', 'yyyyMMdd', 'dated dd');
// → '25ate25 25'

formatDate('20250425', 'yyyyMMdd', '[day ]dd[ of ]MMMM');
// → 'day 25 of April'

formatDate('20250425', 'yyyyMMdd', '[dated ]dd');
// → 'dated 25'
```

---

## `verifyLiterals`

`true` by default. Literal separators in `inputFormat` are checked against the
input instead of being skipped by declared width, which is what stops one stray
byte from shifting every later field.

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { verifyLiterals: true });
// → '25/04/2025'

formatDate('2025-04-25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: true });
// → '25/04/2025'
```

Setting it to `false` relaxes the _cursor handling_ — the parser stops bailing
out at the first bad literal and keeps reading — but a literal that is not
present is still reported as a desync, and a desync is still `INPUT_MISMATCH`:

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// throws INPUT_MISMATCH

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', {
  verifyLiterals: false,
  errorPolicy: 'silent',
});
// → '2025/04/25'
```

**Through the public `formatDate` entry point, `verifyLiterals: false` changes
no observable result.** This was checked across a 3,528-case sweep of input
strings, input formats, output formats and policies: zero differences. The
option matters only when calling `extractTokens()` directly, where the relaxed
cursor is visible in the returned token list — `extractTokens('2025/04/25',
'yyyy-MM-dd', undefined, { verifyLiterals: false })` returns all three tokens
parsed but still reports `mismatched: true`. Leave it at the default.

---

## `customTokens`

`customTokens` extends the token table, so a name is recognised in **both**
`inputFormat` and `outputFormat`. Each value must be a function of the parsed
fields.

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => String(Math.ceil(p.month / 3)) },
});
// → '2025-Q2'
```

A custom token is usable in the input format too. It occupies its own name
length there, and its parsed value is available as `parts[tokenName]`:

```js
formatDate('1152025', 'DDDyyyy', 'yyyy-[day ]DDD', {
  customTokens: { DDD: (p) => String(p.DDD) },
});
// → '2025-day 115'
```

### Precedence

`overrideTokens` outranks a custom handler. `defaultTokens` does **not**,
because a custom token is always treated as derivable and its handler makes the
final call:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
  overrideTokens: { Q: 'Q9' },
});
// → '2025-QQ9'

formatDate('20250425', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => String(Math.ceil(p.month / 3)) },
  defaultTokens: { Q: 'Q0' },
});
// → '2025-Q2'
```

A handler returning `null` or `undefined` renders the token name. It never
throws, whatever the policy:

```js
formatDate('20250425', 'yyyyMMdd', 'WW', { customTokens: { W: () => null } });
// → 'WW'
```

A handler that throws is caught the same way, so one bad custom token cannot
abort a batch:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: {
    Q: () => {
      throw new Error('boom');
    },
  },
});
// → '2025-QQ'
```

### Shadowing a built-in name

A custom token whose name collides with a built-in inherits that built-in's
field requirement. `MM` still needs a parsed `month`:

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  errorPolicy: 'silent',
  customTokens: { MM: (p) => 'X' },
});
// → 'MM/dd/2025'

formatDate('20250425', 'yyyyMMdd', 'MM', {
  customTokens: { MM: (p) => String(p.month) },
});
// → '4'
```

### Reserved names

Nine `Object.prototype` members are rejected outright, because a lookup against
them would be ambiguous:

`__proto__`, `constructor`, `prototype`, `toString`, `valueOf`,
`hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`.

```js
formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  customTokens: { toString: () => 'x' },
});
// throws RESERVED_TOKEN  (token 'toString')
```

A non-function value is an `INVALID_OPTION` caller mistake:

```js
formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  customTokens: { Q: 'not-a-function' },
});
// throws INVALID_OPTION  (token 'Q')
```

Registering a token the format never mentions costs nothing:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
});
// → '25/04/2025'
```

---

## `overrideTokens`

Fixed values that outrank every other source, for the token named — whether or
not it was parsed, and whether or not a default exists for it.

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
});
// → '01/04/2025'

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { yyyy: '2024' },
});
// → '25/04/2024'

formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd', {
  overrideTokens: { MM: '12' },
});
// → '20251225'
```

Supplying a component the input never carried is the main use — a date-only
record widened into a full timestamp:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyyMMddHHmmss', {
  overrideTokens: { HH: '23', mm: '59', ss: '59' },
});
// → '20250425235959'
```

The value may be a function of the parsed fields:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { MM: (p) => String(p.month) },
});
// → '25/4/2025'
```

Overrides for tokens the output does not mention are inert:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { HH: '00' },
});
// → '25/04/2025'
```

Works identically under both policies:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  overrideTokens: { dd: '01' },
});
// → '01/04/2025'
```

---

## `defaultTokens`

Fallbacks, used only where the **field** has no parsed value. Always lower
precedence than the parsed input and than any override.

```js
formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', { defaultTokens: { dd: '99' } });
// → '99/04/2025'

formatDate('2025', 'yyyy', 'HH:mm:ss', {
  defaultTokens: { HH: '00', mm: '00', ss: '00' },
});
// → '00:00:00'
```

### Inert when the field was parsed

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  defaultTokens: { dd: '01' },
});
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd', {
  defaultTokens: { dd: '01' },
});
// → '2025-04-25'
```

And inert when a _sibling_ token for the same field was parsed, however it was
spelled:

```js
formatDate('4-25-2025', 'M-dd-yyyy', 'dd/MM/yyyy', {
  defaultTokens: { MM: '11' },
});
// → '25/04/2025'     month parsed as M, so the MM default never applies

formatDate('04-25-2025', 'MM-dd-yyyy', 'dd/MM/yyyy', {
  defaultTokens: { M: '11' },
});
// → '25/04/2025'
```

### Loses to an override for the same token

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
  defaultTokens: { dd: '99', MM: '11' },
});
// → '01/11/2025'
```

### Cannot rescue a record that failed to parse

The input check happens before token resolution, so a default never papers over
a mismatch:

```js
formatDate('not-a-date', 'yyyyMMdd', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  defaultTokens: { dd: '99' },
});
// → 'not-a-date'
```

Defaults are inert for fields the output never asks about:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  defaultTokens: { HH: '00' },
});
// → '25/04/2025'
```

---

## Decision guide

### If you want…

| Goal                                          | Use                                                         |
| --------------------------------------------- | ----------------------------------------------------------- |
| `20250425` → `25/04/2025`                     | `formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')`          |
| A round-trip that changes nothing             | The same format for input and output                        |
| ISO 8601                                      | `'yyyy-MM-ddTHH:mm:ss'` as the output format                |
| A human-readable string                       | `MMMM d, yyyy` or `MMM dd, yyyy`                            |
| A literal word in the output                  | Write it bare with `strictTokens: false`, or `[bracket]` it |
| `25-Apr-2025` → `2025-04-25`                  | `'dd-MMM-yyyy'` as the input format                         |
| Unpadded or padded numeric input              | `M`/`d` for either; `MM`/`dd` for exactly two digits        |
| A fiscal quarter                              | `customTokens`                                              |
| A two-digit year expanded                     | `yearConverter`                                             |
| A bad record to fail loudly                   | `errorPolicy: 'throw'` (default)                            |
| A bad record to pass through unchanged        | `errorPolicy: 'silent'`                                     |
| A gap in the output to render as its own name | `errorPolicy: 'silent'` with no default                     |
| A gap in the output to be filled              | `defaultTokens`                                             |
| A value forced regardless of the input        | `overrideTokens`                                            |
| Impossible dates rejected                     | `validate: 'strict'`                                        |
| Impossible dates corrected                    | `validate: 'lenient'`                                       |
| No date judgment at all                       | `validate: 'off'` (default)                                 |
| Typos in the output format caught             | `strictTokens: true`                                        |
| Literal words immune to mis-tokenising        | `[bracket]` them, then add `strictTokens: true`             |

### The rules that catch people out

1. **`defaultTokens` is per field, not per token name.** A month parsed as `M`
   is not replaced by `defaultTokens.MM`.
2. **`overrideTokens` wins even for tokens the input never parsed.** It is
   checked before the parse result is consulted at all.
3. **`errorPolicy: 'silent'` still throws on caller mistakes** — a non-string
   argument, a bad option value, a reserved custom token name. The one
   exception is `validate: 'strict'`, which throws because it is a
   data-quality assertion rather than a formatting fallback.
4. **A `defaultTokens` entry cannot rescue an input mismatch.** Input validation
   runs first.
5. **Bare literal words containing `d`, `M`, `m`, `s`, `H` or `y` are
   mis-tokenised.** `day dd of MMMM` renders `'25ay 25 of April'`. Bracket them.
6. **`mm` is minutes**, per Unicode TR35. The PHP `date()` convention does not
   apply.
7. **Single-digit input tokens read two digits first**, so `'415'` with `'Md'`
   is month 41. Pad the input or use `MM`/`dd`.
8. **ISO 8601 output under `strictTokens: true` needs `[T]`**, because the check
   sees `ddTHH` as one word.

---

## Further reading

- [`../README.md`](../README.md) — overview, token table, option summary
- [`api.md`](./api.md) — full parameter and option reference
- [`tokens.md`](./tokens.md) — token table, input widths, matching rules
- [`examples.md`](./examples.md) — worked examples by task, plus gotchas
- [`internals.md`](./internals.md) — pipeline and module map for contributors
