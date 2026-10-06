# Internals

How `datefmt-lite` is put together. Written for contributors and for anyone who
needs to call the low-level modules directly rather than going through
`formatDate`.

For the public surface see [`api.md`](./api.md); for token semantics see
[`tokens.md`](./tokens.md); for the reasoning behind the design see
[`design.md`](./design.md).

---

## Module map

`src/` is 10 files, 1,528 lines, pure ESM, zero dependencies. The public typings add
one more file.

| File                     | Lines | Responsibility                                                                                          |
| ------------------------ | ----: | ------------------------------------------------------------------------------------------------------- |
| `src/index.js`           |    30 | Public surface. Re-exports only; contains no logic.                                                     |
| `src/formatter.js`       |   236 | `formatDate`. Validates options, builds the token table, sequences the pipeline, applies `errorPolicy`. |
| `src/extractTokens.js`   |   190 | Reads raw token values out of the input string. `readNumeric` / `readTextual` live here.                |
| `src/validateOutput.js`  |   188 | Decides how every output token will be rendered. `resolvePrecedence` lives here.                        |
| `src/utils.js`           |   201 | Shared primitives: `tokenizeFormat`, the matcher builders, `nullProtoMap`, `hasOwn`.                    |
| `src/handlers.js`        |   256 | `TOKEN_REGISTRY` plus every table derived from it, and the month-name tables.                           |
| `src/normalizeFields.js` |   126 | Raw token values → semantic fields (`year`, `month`, …). Applies `yearConverter`.                       |
| `src/validateFields.js`  |   113 | Optional range checking (`validate: 'lenient' \| 'strict'`) and `isRealDate`.                           |
| `src/buildTemplate.js`   |   105 | `buildTemplate` compiles an output format; `renderTemplate` executes the plan.                          |
| `src/errors.js`          |    83 | `DateFormatError`, `ERROR_CODES`, message truncation.                                                   |
| `types/index.d.ts`       |   254 | Hand-written public typings (not generated, checked by `npm run typecheck`).                            |

Two functions in `utils.js` are the load-bearing part of the whole design:
`tokenizeFormat` and `buildTokenMatcher`. Everything else is bookkeeping.

---

## Dependency graph

Acyclic, three layers. `handlers.js` and `utils.js` are leaves; `formatter.js`
imports nothing upward.

```
index.js
 ├─ formatter.js ─┬─ extractTokens.js ─┬─ handlers.js
 │                ├─ normalizeFields.js
 │                ├─ validateOutput.js ┤
 │                ├─ buildTemplate.js ─┴─ utils.js
 │                └─ validateFields.js
 └─ errors.js, handlers.js, utils.js, validateFields.js
```

`handlers.js` imports `nullProtoMap` from `utils.js`, which is the only edge
that crosses from the leaf layer into another leaf.

---

## The pipeline is a fork-join

The pipeline is **not** a linear chain. After parsing, the result branches:

```
                    ┌───────────────────────────────────────────┐
inputDate ─────────▶│ extractTokens ──▶ { tokens, values,      │
inputFormat         │                    mismatched }           │
                    └──────────────────────┬────────────────────┘
                                           │
                    ┌──────────────────────┴────────────────────┐
                    │                                           │
        branch A:  ▼                                           ▼  branch B:
   normalizeFields(parsed)                        validateOutput({
     → dateParts (semantic fields)                   parsedTokens: parsed.tokens,
                    │                                 dateParts, outputFormat,
                    │                                 overrides, errorPolicy, strictTokens
                    │                                 }) → handlers (token table)
                    │                                           │
                    │                    ┌──────────────────────┘
                    │                    ▼
                    │            buildTemplate(outputFormat, handlers)
                    │                    → plan [{type:'text'|'token', value}]
                    │                    │
                    └────────────────────┤
                                         ▼
                       renderTemplate(plan, handlers, dateParts, { onMissing })
                                         │
                                         ▼
                                     string
```

Two properties follow from the fork:

- **`normalizeFields` does not feed `validateOutput`.** They are siblings.
  `validateOutput` receives `dateParts` as an _argument_ alongside the parse
  result, never as the result of calling `normalizeFields` itself.
- **`buildTemplate` does not feed back into `validateOutput`.** The validator
  tokenizes the output format itself, compiles nothing, and hands `renderTemplate`
  both the plan and the table. The plan is derived data; the table is the
  authority.

`validateOutput` needs `dateParts` for one specific reason: to distinguish "the
token name was never in the input" from "the token name was in the input but the
_field_ it feeds is `null`". Only the second one is invisible from `tokens`.

---

## The four stages

### 1. `extractTokens(inputDate, inputFormat, handlers?, { verifyLiterals })`

Returns `{ tokens, values, mismatched }`.

- `tokens` lists **only** tokens that matched. A token that could not be read is
  omitted entirely.
- `values` maps every token encountered to its raw string, or `null` when
  unreadable. Keys with `null` values are how "absent from the data" stays
  distinguishable from "not in the format".
- `mismatched` is `true` when the string as a whole failed to conform. That is
  the single signal `errorPolicy: 'silent'` uses to fall back to raw input.

```js
extractTokens('2025-04-25T09:30:45', 'yyyy-MM-ddTHH:mm:ss');
// {
//   tokens: ['yyyy','MM','dd','HH','mm','ss'],
//   values: { yyyy:'2025', MM:'04', dd:'25', HH:'09', mm:'30', ss:'45' },
//   mismatched: false
// }
```

The token vocabulary is `Object.keys(handlers)`, defaulting to
`TOKEN_REGISTRY`. Passing a wider table is how `customTokens` become readable in
`inputFormat`.

### 2a. `normalizeFields(parsed, { yearConverter, errorPolicy })` — branch A

Consumes the parse result and produces semantic fields. Values are sourced
**per field** via `FIELD_PREFERENCE`, widest token first:

```js
normalizeFields(extractTokens('20250425', 'yyyyMMdd'), {});
// { tokens: ['yyyy','MM','dd'],
//   month: 4, day: 25, hour: null, minute: null, second: null,
//   yyyy: 2025, MM: 4, dd: 25,
//   year: 2025 }
```

Note the per-token numeric aliases (`yyyy`, `MM`, `dd`). They come from the
custom-token loop: it walks `Object.keys(values)` and skips any key that is a
key of `FIELD_GROUPS`, which holds _field_ names (`year`, `month`, …), not token
names. So every built-in token name also lands on `dateParts` as a number.
Harmless, and it is what makes `parts[tokenName]` work uniformly for custom
tokens — but it is a coincidence of naming rather than an intended contract.

Year is special-cased: `yyyy` wins outright; `yy` requires a `yearConverter`
unless `errorPolicy` is `'silent'`, in which case `25` stays `25` and renders as
`0025`.

### 2b. `validateOutput({ parsedTokens, dateParts, outputFormat, overrides, errorPolicy, strictTokens })` — branch B

Tokenizes `outputFormat`, then builds the handler table the renderer will use.
Returns a prototype-less map of **all 14 built-in handlers** plus any custom
handlers, with per-token replacements written in for overrides, defaults and
silent-mode fallbacks.

```js
const h = validateOutput({
  parsedTokens: ['yyyy', 'MM', 'dd'],
  dateParts,
  outputFormat: 'dd/MM/yyyy',
});
Object.keys(h).length; // 14 — always the full built-in table
```

Because the returned table is also the token vocabulary passed to
`buildTemplate`, a word in the output format that is _not_ in the registry is
never tokenised and simply renders as literal text:

```js
validateOutput({ parsedTokens, dateParts, outputFormat: 'yyyy QQQ MM' });
// plan: [token yyyy, text ' QQQ ', token MM]  →  '2025 QQQ 04'
```

### 3. `buildTemplate(outputFormat, handlers)`

Compiles the output format into an executable plan:

```js
buildTemplate('dd MMM yyyy [at] HH:mm', handlers);
// [ {type:'token', value:'dd'},
//   {type:'text',  value:' '},
//   {type:'token', value:'MMM'},
//   {type:'text',  value:' '},
//   {type:'token', value:'yyyy'},
//   {type:'text',  value:' at '},   ← escaped 'at' folded in, coalesced
//   {type:'token', value:'HH'},
//   {type:'text',  value:':'},
//   {type:'token', value:'mm'} ]
```

Three things happen here:

- `escaped` segments are folded into `text`, since `[...]` renders literally with
  the brackets removed.
- Adjacent `text` steps are coalesced into one, so the plan has one step per
  token plus at most one step per literal run.
- The plan is a plain array of frozen-shape objects, so it is a usable cache key.

### 4. `renderTemplate(plan, handlers, dateParts, { onMissing })`

Walks the plan. `text` steps are appended verbatim. `token` steps call
`handlers[token](dateParts)`; a `null`/`undefined` result, a non-function entry,
or a handler that throws all route to `onMissing(token)` when one is supplied,
and throw otherwise.

```js
renderTemplate(plan, handlers, dateParts, { onMissing: (t) => t });
```

`formatDate` always supplies `onMissing`, so a user-supplied handler that throws
is degraded to its own token name even under `errorPolicy: 'throw'`:

```js
formatDate('20250415', 'yyyyMMdd', 'Q', {
  customTokens: {
    Q: () => {
      throw new Error('boom');
    },
  },
});
// → 'Q'
```

### `formatDate` control flow

```js
const parsed = extractTokens(inputDate, inputFormat, table, { verifyLiterals });
if (parsed.mismatched) {
  /* throw INPUT_MISMATCH | return inputDate if silent */
}

dateParts = normalizeFields(parsed, { yearConverter, errorPolicy }); // try/catch
if (validate !== 'off') {
  /* validateFields, may clamp or throw OUT_OF_RANGE */
}

handlers = validateOutput({ parsedTokens: parsed.tokens, dateParts /* … */ }); // try/catch

return renderTemplate(
  buildTemplate(outputFormat, handlers),
  handlers,
  dateParts,
  { onMissing: (token) => token },
);
```

`buildTemplate` is called inline, so `formatDate` recompiles the plan on every
call. Callers processing many rows with one output format should hoist the
compilation themselves:

```js
const parsed = extractTokens(row, inputFormat);
const parts = normalizeFields(parsed, {});
const handlers = validateOutput({
  parsedTokens: parsed.tokens,
  dateParts: parts,
  outputFormat,
});
const plan = buildTemplate(outputFormat, handlers);
// per row: renderTemplate(plan, handlers, parts, { onMissing: (t) => t })
```

---

## Worked trace

```js
formatDate(
  '2025-04-25T09:30:45',
  'yyyy-MM-ddTHH:mm:ss',
  'dd MMM yyyy [at] HH:mm',
);
// → '25 Apr 2025 at 09:30'
```

Every intermediate state, as printed:

```
1. tokenizeFormat('yyyy-MM-ddTHH:mm:ss', builtins)      → 11 segments
   token yyyy | literal '-' | token MM | literal '-' | token dd
   | literal 'T' | token HH | literal ':' | token mm | literal ':' | token ss

2. extractTokens(...)                                  → FORK
   tokens:     ['yyyy','MM','dd','HH','mm','ss']
   values:     { yyyy:'2025', MM:'04', dd:'25', HH:'09', mm:'30', ss:'45' }
   mismatched: false
   (the literal 'T' at offset 10 was compared against the input and matched)

3a. normalizeFields(parsed, {})                        → BRANCH A
   { tokens:   ['yyyy','MM','dd','HH','mm','ss'],
     month: 4, day: 25, hour: 9, minute: 30, second: 45,
     yyyy: 2025, MM: 4, dd: 25, HH: 9, mm: 30, ss: 45,
     year: 2025 }

4. tokenizeFormat('dd MMM yyyy [at] HH:mm', builtins) → 10 segments
   token dd | literal ' ' | token MMM | literal ' ' | token yyyy
   | literal ' ' | escaped 'at' | literal ' ' | token HH | literal ':' | token mm
   needed = ['dd','MMM','yyyy','HH','mm']

5. validateOutput({ parsedTokens, dateParts, outputFormat })  → BRANCH B
   all 14 built-ins present as functions; no token replaced, because
   dd→day 25, MMM→month 4, yyyy→year 2025, HH→hour 9, mm→minute 30
   all have values, and no override or default applies

6. buildTemplate(outputFormat, handlers)               → 9 steps (2 literals coalesced)
   [token dd, text ' ', token MMM, text ' ', token yyyy,
    text ' at ', token HH, text ':', token mm]

7. renderTemplate(plan, handlers, dateParts, { onMissing: t => t })
   '25' + ' ' + 'Apr' + ' ' + '2025' + ' at ' + '09' + ':' + '30'
   → '25 Apr 2025 at 09:30'
```

Stage 5 is where `MMM` is provable even though only `MM` was parsed: `resolvePrecedence`
looks at `TOKEN_REGISTRY.MMM.field` → `'month'`, finds `dateParts.month === 4`, and
lets the built-in `MMM` handler run. The token name mismatch does not matter.

---

## `tokenizeFormat`: one tokenizer, two consumers

```js
tokenizeFormat(format, tokens) → Segment[]
// { type: 'literal' | 'token' | 'escaped', value: string }
```

`extractTokens`, `validateOutput` and `buildTemplate` all call it. This is the
central architectural decision in the codebase.

### Why it has to be one

Before the shared tokenizer existed, `validateOutput` and `buildTemplate` each
compiled their own matcher from _different_ inputs:

- `buildTemplate` matched the known token list — correct.
- `validateOutput` matched the known token list **plus every alphabetic run
  harvested from the output format** (`extractAllTokensFromFormat`, i.e.
  `/[a-zA-Z]+/g`).

For a compact format the alphabetic run _is_ the whole format string, so the
harvested "candidate token" was `yyyyMMdd` and the validator rejected it. The
renderer would then have been asked to render a token the validator had just
declared illegal. Reproduced against commit `a6c3565`:

```
old: formatDate('20250425','yyyyMMdd','yyyyMMdd')
     → Error: Unknown token "yyyyMMdd" in output format
new: formatDate('20250425','yyyyMMdd','yyyyMMdd')
     → '20250425'
```

The old validator had the same flaw on any literal word (`Day dd of MMMM` →
`Unknown token "Day"`), and the same flaw on ISO-with-`T`
(`yyyyMMddTHHmmss` → `Unknown token "yyyyMMddTHHmmss"`).

Deriving token candidates from a regex over the format string is the mistake,
not the idea of a token table. `tokenizeFormat` fixes it structurally: there is
one function that decides what a token is, and every stage of the pipeline asks
it rather than re-deriving.

### How it walks the format

`buildTokenMatcher` compiles one alternation from the token names, sorted
**longest-first with alphabetical tie-break**, so `MMMM` beats `MMM` beats `MM`
beats `M`:

```js
buildTokenPattern(['M', 'MM', 'MMM', 'MMMM', 'yyyy', 'yy']); // 'MMMM|yyyy|MMM|MM|yy|M'
```

`tokenizeFormat` then walks left to right with that regex in **sticky (`y`)**
mode, setting `lastIndex = i` before each attempt:

```js
matcher.lastIndex = i;
const match = matcher.exec(format);
```

Sticky matching anchors at `lastIndex` and needs no look-ahead, so each character
of the format is visited a constant number of times. Cost is O(n) in the format
length with no backtracking. A 4,000-character format tokenizes in roughly
0.1–0.3 ms regardless of shape:

```
'all letters 4000'  len 4000  segments    1  0.130 ms
'literal words'     len 4000  segments    1  0.116 ms
'no tokens'         len 4000  segments    1  0.102 ms
'alternating'       len 4000  segments 1500  0.329 ms
```

An empty token list compiles to `/(?!)()/y`, which can never match, rather than
throwing on an empty alternation.

### Bracket escapes

`[` starts an escape. It closes at the **first** `]`, there is no nesting, and
the inner text is emitted as `{type:'escaped'}` with the brackets removed:

```js
tokenizeFormat('yyyy[-]MM', builtins); // [token yyyy, escaped '-', token MM]
tokenizeFormat('[a]b]c', builtins); // [escaped 'a', literal 'b]c']
tokenizeFormat('[a[b]c]', builtins); // [escaped 'a[b', literal 'c]']
tokenizeFormat('yyyy[MM', builtins); // [token yyyy, literal '[', token MM]
tokenizeFormat('MM][', builtins); // [token MM, literal '][']
```

An unbalanced `[` falls through and is treated as an ordinary literal character,
which means the characters after it are tokenised normally. Nesting is not
supported: `[a[b]c]` closes at the first `]` and `c]` leaks out as literal text.

### Literal merging

Everything that is not a known token accumulates into one literal run. Runs are
emitted as a single segment, and `buildTemplate` merges adjacent ones again:

```js
tokenizeFormat('Day, dd MMMM (yyyy)', builtins);
// [literal 'Day, ', token dd, literal ' ', token MMMM, literal ' (', token yyyy, literal ')']
```

There is no word boundary in the matcher. This is the deliberate mechanism that
makes literal words work (`Day `, `at `, `of ` all fall out of the same rule), but
it also means a literal word that _starts_ with a lowercase token letter gets
split:

```js
tokenizeFormat('day dd', builtins); // [token d, literal 'ay ', token dd]
tokenizeFormat('hours HH', builtins); // [literal 'hour', token s, literal ' ', token HH]
tokenizeFormat('mon MM yyyy', builtins); // [token m, literal 'on ', token MM, ...]
```

`formatDate('20250425', 'yyyyMMdd', 'mon MM yyyy')` therefore throws
`UNPRODUCIBLE_TOKEN` for token `m` (minutes, unparsed) rather than emitting the
word `mon`. Bracket the literal — `[mon] MM yyyy` — if you need a lowercase word
that begins with `d`, `h`, `m` or `s`.

---

## Token metadata

`TOKEN_REGISTRY` in `src/handlers.js` is the single source of truth. `width` is
the **maximum** number of characters consumed from the input. `variable` marks
the single-digit forms. `text` marks tokens whose input is a word rather than
digits, and those carry a `parse` function.

| Token  | Field    | `width` | `variable` | `text` | Reads on input                           | Renders            |
| ------ | -------- | ------: | :--------: | :----: | ---------------------------------------- | ------------------ |
| `yyyy` | `year`   |       4 |     no     |   no   | exactly 4 digits (`2025`)                | `2025`, 4-wide     |
| `yy`   | `year`   |       2 |     no     |   no   | exactly 2 digits (`25`)                  | last 2 of the year |
| `MMMM` | `month`  |       9 |     no     |  yes   | name or abbreviation, longest match wins | `April`            |
| `MMM`  | `month`  |       3 |     no     |  yes   | name or abbreviation, longest match wins | `Apr`              |
| `MM`   | `month`  |       2 |     no     |   no   | exactly 2 digits (`04`)                  | `04`, 2-wide       |
| `M`    | `month`  |       2 |  **yes**   |   no   | 1 or 2 digits, 2 tried first             | `4`                |
| `dd`   | `day`    |       2 |     no     |   no   | exactly 2 digits (`25`)                  | `25`, 2-wide       |
| `d`    | `day`    |       2 |  **yes**   |   no   | 1 or 2 digits, 2 tried first             | `25`               |
| `HH`   | `hour`   |       2 |     no     |   no   | exactly 2 digits (`09`)                  | `09`, 2-wide       |
| `H`    | `hour`   |       2 |  **yes**   |   no   | 1 or 2 digits, 2 tried first             | `9`                |
| `mm`   | `minute` |       2 |     no     |   no   | exactly 2 digits (`30`)                  | `30`, 2-wide       |
| `m`    | `minute` |       2 |  **yes**   |   no   | 1 or 2 digits, 2 tried first             | `30`               |
| `ss`   | `second` |       2 |     no     |   no   | exactly 2 digits (`45`)                  | `45`, 2-wide       |
| `s`    | `second` |       2 |  **yes**   |   no   | 1 or 2 digits, 2 tried first             | `45`               |

`mm` is minutes, following Unicode TR35. The PHP `date()` convention where `m`
means month does not apply.

Input and output widths deliberately differ. `d` renders a single digit when the
value needs one, but on input reads one _or_ two, which is what lets `Mdd` parse
`0415` as 15 April:

```js
extractTokens('0415', 'Mdd'); // { tokens:['M','dd'], values:{ M:'04', dd:'15' }, mismatched:false }
```

### Month tables are 0-based, months are 1-based

`MONTH_NAMES` and `MONTH_ABBREV` are plain arrays indexed from 0, but
`dateParts.month` runs 1–12, so every read is `[month - 1]`:

```js
MONTH_ABBREV[4 - 1]; // 'Apr'
MONTH_NAMES[4 - 1]; // 'April'
```

`MONTH_ABBREV` is derived (`MONTH_NAMES.map(n => n.slice(0, 3))`), and both are
frozen. The 1-based lookup map is keyed on the lower-cased full name _and_
abbreviation, so `MMM` and `MMMM` share one parser. `parseMonthText` does not
trim, so the matched text is exactly the characters consumed;
`parseMonthName` (the exported, forgiving form) does trim.

### Textual reads use a 9-character look-ahead

`readTextual` tries every slice from 1 to `TEXT_LIMIT` (9, the longest month
name) and keeps the **longest** match, so `MMM` does not truncate `April` to
`Apr`. Trailing junk still fails: `'Aprilx'` under `MMM` matches `April` and then
sets `mismatched` on the leftover.

### Handlers return `null`, they never throw

Every built-in handler is total: it returns `null` when the field holds no usable
value, and it never coerces. `renderTemplate` decides whether that `null` becomes
an error or a literal fallback.

This is what makes `errorPolicy: 'silent'` structurally unable to throw from the
render stage — there is nothing to catch. It also keeps the error _shape_ in one
place rather than spread across 14 handlers.

---

## Variable-width reads and the cursor

`readNumeric` tries the declared `width` first, then 1, and requires the slice to
be all digits:

```js
const widths = spec.variable ? [spec.width, 1] : [spec.width];
for (const width of widths) {
  const slice = input.slice(pos, pos + width);
  if (slice.length < width) continue;
  sawChars = true;
  if (DIGITS_ONLY.test(slice))
    return { status: 'ok', raw: slice, next: pos + width };
}
return { status: sawChars ? 'corrupt' : 'absent', advance: spec.width };
```

Three statuses:

| Status    | Meaning                                                | `mismatched`  |
| --------- | ------------------------------------------------------ | :-----------: |
| `ok`      | A digit run was read; cursor moves to `next`.          |   unchanged   |
| `absent`  | The input ran out before the token could be read.      |   unchanged   |
| `corrupt` | Characters were there but were not the required shape. | set to `true` |

The critical line is that **both `absent` and `corrupt` advance the cursor by the
declared width**. An unreadable slice still occupies its space on the page. If
it did not, the next variable-width token would re-read the same characters and
report a plausible, wrong value:

```js
// MM is corrupt; dd must NOT re-read '0x'
extractTokens('2025-0x-25', 'yyyy-MM-dd');
// { tokens:['yyyy','dd'], values:{ yyyy:'2025', MM:null, dd:'25' }, mismatched:true }
```

That `'25'` is correct precisely because the cursor skipped `0x`. Without the
forced advance, `dd` would have read `0x` as well.

`absent` alone does not set `mismatched`, so a genuinely truncated record is a
tolerable partial parse:

```js
extractTokens('2025-', 'yyyy-MM'); // mismatched:false, MM:null  (input ended)
extractTokens('2025ab25', 'yyyyMMdd'); // mismatched:true,  MM:null  (wrong shape)
```

### Whole-string mismatch

After the walk:

```js
if (!mismatched && pos < inputDate.length) mismatched = true; // trailing junk
if (!mismatched && sawToken && tokens.length === 0) mismatched = true;
```

```js
extractTokens('20250425JUNK', 'yyyyMMdd'); // mismatched:true — trailing content ignored
extractTokens('2025/04/25', 'yyyy-MM-dd'); // mismatched:true — literal '-' did not match
extractTokens('﻿20250425', 'yyyyMMdd'); // mismatched:true — BOM shifts the record
```

### `verifyLiterals: false`

Literal separators are normally compared against the input rather than skipped by
length. Setting `verifyLiterals: false` restores positional-only skipping for
legacy call sites. The parse may then desynchronise the cursor, so `desynced`
forces `mismatched` even when every segment "matched":

```js
extractTokens('2025/04/25', 'yyyy-MM-dd'); // mismatched:true
extractTokens('2025/04/25', 'yyyy-MM-dd', undefined, { verifyLiterals: false });
// { tokens:['yyyy','MM','dd'], values:{ yyyy:'2025', MM:'04', dd:'25' }, mismatched:true }
//                                       ^ reads as if the separators were there
```

The values look clean but `mismatched` is still `true`, precisely so that
best-effort mode refuses to trust them.

---

## Precedence, resolved per field

`resolvePrecedence` in `src/validateOutput.js` runs for each token the output
format needs:

1. `overrideTokens` — wins immediately, via `hasOwn`, so an explicit `undefined`
   override is still an override.
2. `customTokens` — if the caller registered a handler for this token name, that
   handler is already in the table and nothing further is applied.
3. Parsed input — for a registry token the test is
   `dateParts[TOKEN_REGISTRY[token].field] != null`; otherwise
   `parsedTokens.has(token)`.
4. `defaultTokens`.
5. Literal fallback (token name), silent mode only.

The field check in step 3 is the point. It means a month parsed as `M` is not
overwritten by `defaultTokens.MM`:

```js
formatDate('20250415', 'yyyyMdd', 'MM', { defaultTokens: { MM: '00' } }); // → '04'
formatDate('20250415', 'yyyyMMdd', 'M', { defaultTokens: { M: '00' } }); // → '4'
formatDate('20250415', 'yyyyMMdd', 'MM', { overrideTokens: { MM: '12' } }); // → '12'
formatDate('202504', 'yyyyMM', 'MM', {
  overrideTokens: { MM: '12' },
  defaultTokens: { MM: '00' },
}); // → '12'
formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', { defaultTokens: { dd: '01' } }); // → '01/04/2025'
```

The defaults loop at the end of `validateOutput` repeats the same per-field
checks, because an earlier token may have been resolved before a later one was
considered. Overrides and custom handlers are excluded again there.

`formatDate` also lets `customTokens` shadow a built-in name — a custom `MM`
handler replaces the built-in:

```js
formatDate('20250415', 'yyyyMMdd', 'MM', { customTokens: { MM: (p) => 'cu' } }); // → 'cu'
```

---

## Prototype-less maps

Every lookup table is built with `nullProtoMap` (`Object.assign(Object.create(null), source)`),
and every lookup uses `hasOwn`. `Object.prototype` members are therefore
unreachable by construction, not by convention:

```js
const parsed = extractTokens('20250425', 'yyyyMMdd');
parsed.values.toString; // undefined, not [Function: toString]
'toString' in parsed.values; // false
Object.getPrototypeOf(parsed.values); // null
```

That covers the returned tables from `extractTokens`, `validateOutput`,
`DEFAULT_HANDLERS` and `formatDate`'s internal table. Caller-supplied
`overrideTokens` / `defaultTokens` / `customTokens` are **not** copied into a
null-prototype map, but they are only ever read through `hasOwn`, so inherited
members are still ignored:

```js
const evil = Object.create({ MM: 'injected', dd: 'injected' });
evil.year = 'nope';
formatDate('20250415', 'yyyyMMdd', 'MM dd', { overrideTokens: evil }); // → '04 15'
```

On top of that, `formatDate` rejects `customTokens` names that collide with
`Object.prototype` members outright, because a token called `toString` would be
ambiguous between "a token named toString" and "the inherited method":

```js
formatDate('2025', 'yyyy', 'yyyy', { customTokens: { toString: (p) => 'x' } });
// throws RESERVED_TOKEN: customTokens["toString"] is a reserved Object.prototype key;
//                       choose a different token name
```

The reserved set is `__proto__`, `constructor`, `prototype`, `toString`,
`valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable` and
`toLocaleString`.

---

## Error codes

| Code                 | Raised when                                                        | Silent mode         |
| -------------------- | ------------------------------------------------------------------ | ------------------- |
| `INVALID_ARGUMENT`   | `inputDate`, `inputFormat`, `outputFormat` or `options` wrong type | **throws**          |
| `INVALID_OPTION`     | `errorPolicy`, `validate` or `yearConverter` value not accepted    | **throws**          |
| `RESERVED_TOKEN`     | `customTokens` key collides with `Object.prototype`                | **throws**          |
| `INVALID_YEAR`       | `yearConverter` returned a non-integer, negative or `NaN` year     | **throws**          |
| `INPUT_MISMATCH`     | the input string did not conform to `inputFormat`                  | returns `inputDate` |
| `UNPRODUCIBLE_TOKEN` | an output token has no parsed value, default or override           | renders token name  |
| `OUT_OF_RANGE`       | `validate` found an impossible value                               | **`strict` throws** |

The first four are caller mistakes and are not suppressible. The last three are
data problems, with `OUT_OF_RANGE` under `validate: 'strict'` deliberately
treated as a non-suppressible assertion — see [`design.md`](./design.md) for why.

Messages interpolate token names and format strings through `truncate`, which
caps them at 64 characters so a pathological format cannot produce a
megabyte-long log line.

---

## State and immutability

- **`inputDate` is read-only.** No stage writes to it.
- **`parsed` is never mutated.** `normalizeFields` copies `tokens` into a fresh
  array and builds a new `dateParts`; it reads `values` and nothing writes it.
  (`validateFields` returning a `clamped` object is merged via `Object.assign`
  into `dateParts` — that is the one in-place write, and it targets the freshly
  built object, never the parse result.)
- **`dateParts` is rebuilt per call.** The `clamped` merge above is safe for that
  reason.
- **The render plan is never mutated.** `renderTemplate` appends to a local
  string and reads `plan` and `handlers` read-only.
- **Every exported table is frozen**: `TOKEN_REGISTRY`, `DEFAULT_HANDLERS`,
  `TOKEN_FIELD_MAP`, `FIELD_GROUPS`, `BUILTIN_TOKENS`, `MONTH_NAMES`,
  `MONTH_ABBREV`, `ERROR_CODES`, `BOUNDS`, `DAYS_IN_MONTH`.

Verified round-trip:

```js
const parsed = extractTokens(input, 'yyyy-MM-dd');
const parts = normalizeFields(parsed, {});
const hs = validateOutput({
  parsedTokens: parsed.tokens,
  dateParts: parts,
  outputFormat: 'dd/MM/yyyy',
});
const plan = buildTemplate('dd/MM/yyyy', hs);
const before = JSON.stringify([input, parsed, parts, plan]);
renderTemplate(plan, hs, parts, { onMissing: (t) => t });
JSON.stringify([input, parsed, parts, plan]) === before; // true
```

One gap: `Object.freeze` on `TOKEN_REGISTRY` is shallow. The spec objects inside
it are mutable, so `TOKEN_REGISTRY.MMM.width = 3` succeeds in a consumer's
process. Freezing each entry would close that.

---

## Adding a token

### One edit, for an existing field

`TOKEN_REGISTRY` is the only table that is written by hand. `DEFAULT_HANDLERS`,
`TOKEN_FIELD_MAP`, `FIELD_GROUPS`, `FIELD_PREFERENCE` and `BUILTIN_TOKENS` are
all derived from it at module load, and `extractTokens` / `validateOutput` /
`buildTemplate` all read the vocabulary off it or off its derivatives. Adding an
ordinal-day token is a single insertion:

```js
// src/handlers.js
Do: {
  field: 'day',
  width: 2,
  variable: false,
  handler: (p) => {
    if (!isUsable(p.day)) return null;
    const sfx = p.day % 10 === 1 && p.day !== 11 ? 'st'
      : p.day % 10 === 2 && p.day !== 12 ? 'nd'
      : p.day % 10 === 3 && p.day !== 13 ? 'rd' : 'th';
    return String(p.day) + sfx;
  },
},
```

Immediately after that single edit, with no other source change:

```
BUILTIN_TOKENS:  [... 'Do' ...]
FIELD_GROUPS.day: ['Do','dd','d']
TOKEN_FIELD_MAP.Do: 'day'
DEFAULT_HANDLERS.Do: [Function]

formatDate('20250425', 'yyyyMMdd', 'Do MMMM yyyy'); // → '25th April 2025'
formatDate('20250101', 'yyyyMMdd', 'Do');           // → '1st'
formatDate('20250111', 'yyyyMMdd', 'Do');           // → '11th'
```

Checklist:

1. **Pick the right `field`.** It determines which semantic value the token
   shares, and therefore whether `validateOutput` considers it producible.
2. **Set `width` to the maximum input width**, and `variable: true` only for the
   1-or-2-digit forms. Getting `width` wrong desynchronises the cursor for
   everything after it.
3. **Return `null`, never throw, never coerce.** The renderer owns the fallback.
4. **Textual output needs a `parse` function to be readable on input.** Without
   one, `extractTokens` uses `readNumeric` and a token like `Do` will mark the
   record corrupt on input (`formatDate('20250425Do', 'yyyyMMddDo', …)` →
   `INPUT_MISMATCH`), while working fine on output. A `parse` of
   `parseMonthText`-style shape fixes that.
5. **Keep `TOKEN_REGISTRY` insertion order sensible.** It drives
   `BUILTIN_TOKENS`; the matcher sorts by length anyway, so this is cosmetic.
6. **Update the docs tables** in [`tokens.md`](./tokens.md), the README token
   table, and `types/index.d.ts`.

### More than one edit, for a new field

Adding a token that populates a _new_ field is not a one-liner, and the reason is
`normalizeFields`, which iterates a hard-coded list:

```js
for (const field of ['month', 'day', 'hour', 'minute', 'second']) { … }
```

`year` is handled separately after that loop. A field outside this list is never
populated, so `validateOutput` sees `dateParts[spec.field] == null` and throws
`UNPRODUCIBLE_TOKEN` even though the token parsed perfectly:

```
inject PPP { field: 'part' } into TOKEN_REGISTRY, nothing else changed
extractTokens('2025042507', 'yyyyMMddPPP')  → PPP: '07', mismatched: false
normalizeFields(...)                        → { …, PPP: 7 }   ← token alias present
formatDate('2025042507', 'yyyyMMddPPP', 'PPP/yyyy')
  → UNPRODUCIBLE_TOKEN: Cannot produce token "PPP"
```

So a new field needs the field added to `normalizeFields`' loop, an entry in
`BOUNDS` in `validateFields.js` if it should be range-checked, and `'part'` added
to the `DateField` union in `types/index.d.ts`.

### Prefer `customTokens` where it fits

A token that maps onto an existing field, or that is only needed by one caller,
does not belong in the registry:

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => String(Math.ceil(parts.month / 3)) },
}); // → '2025-Q2'
```

`customTokens` entries are registered into a per-call copy of the registry with
`width: name.length` and `variable: false`, which makes them usable in
`inputFormat` as well, with the parsed value available as `parts[tokenName]`.

---

## Related

- [`../README.md`](../README.md) — overview and usage
- [`api.md`](./api.md) — public signature and options
- [`tokens.md`](./tokens.md) — token reference
- [`formatting-behavior.md`](./formatting-behavior.md) — precedence and fallback matrix
- [`contributing.md`](./contributing.md) — development setup
- [`design.md`](./design.md) — why the library is shaped this way
