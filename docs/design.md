# Design

Why `datefmt-lite` is shaped the way it is. For how the pieces fit together see
[`internals.md`](./internals.md); for the API see [`api.md`](./api.md).

---

## Core philosophy

**String → token → string.** The unit of work is a token, not a moment in time.
An input string is scanned once to pull out raw token values, those values are
resolved into semantic fields, and an output format is compiled into a render
plan that puts them back together as a string.

Everything follows from that:

- **No `Date` is constructed.** There is no instant anywhere in the pipeline, so
  there is nothing to convert _to_ and no intermediate representation that can
  lose information the caller's formats could have expressed.
- **No `Intl`, no ICU.** Output is fixed-width and locale-independent. `MMMM`
  means `April`, always, in every runtime.
- **No timezone is applied or parsed.** A string that looks like it carries an
  offset is rearranged as characters. Converting between zones is arithmetic,
  and this library does none.
- **Zero dependencies.** The whole surface is 10 files and 1,528 lines. It works
  in runtimes with no ICU, no `Date` polyfill and no module loader tricks.
- **No calendar assumptions by default.** `validate` is `'off'`. The library will
  happily format `31/02/2025` because the input said `yyyyMMdd` and the output
  asked for `dd/MM/yyyy`. Correctness is the caller's assertion to make, and
  there is a switch for callers who want it made for them.

### Why not return a `Date`

Because `(string) → Date` is the wrong shape for the job. Converting a
fixed-width COBOL column into an ISO string does not need an instant, and an
instant forces you to answer questions the data never asked: which zone? which
era? what calendar? which locale? Every one of those answers is an assumption,
and every assumption is a chance to turn a correct row into a wrong date.

A `Date` also does not exist in some constrained runtimes, and `Intl` pulls in
ICU. If a library needs both to do something, it is solving a different problem.

---

## Module breakdown

| Module               | Layer | Responsibility                                                                                         |
| -------------------- | :---: | ------------------------------------------------------------------------------------------------------ |
| `index.js`           |   1   | Re-export surface only. No logic.                                                                      |
| `formatter.js`       |   1   | `formatDate`. Option validation, token-table assembly, pipeline sequencing, `errorPolicy` application. |
| `errors.js`          |   1   | One error type, one code enum, message truncation.                                                     |
| `handlers.js`        |   3   | `TOKEN_REGISTRY` and everything derived from it; month-name tables.                                    |
| `utils.js`           |   3   | `tokenizeFormat`, matcher builders, `nullProtoMap`, `hasOwn`.                                          |
| `extractTokens.js`   |   2   | Input string → raw token values. `readNumeric` / `readTextual`.                                        |
| `normalizeFields.js` |   2   | Raw token values → semantic fields. `yearConverter` application.                                       |
| `validateOutput.js`  |   2   | Output format → handler table. Precedence resolution, `strictTokens` typo check.                       |
| `buildTemplate.js`   |   2   | Output format → render plan, and plan execution.                                                       |
| `validateFields.js`  |   2   | Optional range checking.                                                                               |

The split is by **contract**, not by line count: each module has one thing it
promises the next one. `extractTokens` promises "these are the raw strings I
found". `normalizeFields` promises "these are the fields". `validateOutput`
promises "every token in this format has a source". `buildTemplate` promises
"this plan is executable and reusable". Nothing reaches around its neighbour.

`formatter.js` deliberately owns the `errorPolicy` decision and nothing else
does, so that the boundary between "fail" and "degrade" is in one readable
place rather than smeared across five modules.

---

## Error policy design

Two policies, and the interesting work is deciding **what each one covers**.

### Caller mistake vs bad data

The line is drawn between _bugs in the calling code_ and _facts about the data_.

| Situation                                        | Class              | `'throw'`            | `'silent'`          |
| ------------------------------------------------ | ------------------ | -------------------- | ------------------- |
| `inputDate` is not a string                      | caller             | `INVALID_ARGUMENT`   | **throws**          |
| `options` is not an object                       | caller             | `INVALID_ARGUMENT`   | **throws**          |
| `errorPolicy` / `validate` is not a listed value | caller             | `INVALID_OPTION`     | **throws**          |
| `yearConverter` is not a function                | caller             | `INVALID_OPTION`     | **throws**          |
| `yearConverter` returned `NaN`, `-1`, `'25'`     | caller             | `INVALID_YEAR`       | **throws**          |
| `customTokens.toString` is a reserved key        | caller             | `RESERVED_TOKEN`     | **throws**          |
| Input does not match `inputFormat`               | data               | `INPUT_MISMATCH`     | returns `inputDate` |
| Output token has no source                       | data               | `UNPRODUCIBLE_TOKEN` | renders token name  |
| `validate: 'strict'` found an impossible value   | data, but asserted | `OUT_OF_RANGE`       | **throws**          |

Verified:

```js
formatDate(123, 'yyyy', 'yyyy', { errorPolicy: 'silent' });
// throws INVALID_ARGUMENT — a number where a string was promised

formatDate('25', 'yy', 'yyyy', { yearConverter: () => NaN });
// throws INVALID_YEAR — the converter is the caller's code

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '2025/04/25' — the record is wrong, not the program

formatDate('2025', 'yyyy', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → 'dd/MM/2025' — the gap is marked, not invented
```

### Why the line is drawn there

**Silently absorbing a caller bug produces a wrong answer that is impossible to
trace.** If `formatDate` is handed `undefined` because a caller forgot to
`await` something, `'silent'` returns `undefined`, the field lands in a CSV as
the empty string, and the pipeline keeps running. The bad date is 400,000 rows
downstream and nobody knows a check existed.

If it throws, the caller finds out on the first row, and the fix is obvious from
the message.

**Absorbing bad data, on the other hand, is the entire point of best-effort
mode.** A pipeline over a legacy feed will eventually meet a truncated record or
a column that is empty on holiday rows. The correct behaviour there is to flag
it and move on, not to halt the batch. `'silent'` returns the input untouched or
renders the token as its own name — both of which are _visible in the output_.
A pipeline operator can grep for `dd/MM/2025` or reconcile the short column.
`null` or `0000` would not be visible.

So the two cases get opposite treatment on purpose: caller mistakes are made
loud because they are rare and always actionable; bad data is made quiet but
_legible_, because it is expected and the caller has explicitly opted in.

### The deliberate exceptions

Two cases break the pattern, both intentionally:

**`validate: 'strict'` throws even under `'silent'`.** Turning range checking on
is an assertion that the data should be in range. Returning raw input for a
record that parsed perfectly but says month 13 hides the one thing the caller
asked to be told about. `'lenient'` clamping _is_ suppressed under `'silent'`,
because clamping is a repair rather than a report.

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
  validate: 'strict',
  errorPolicy: 'silent',
});
// throws OUT_OF_RANGE: month 13 is out of range (expected 1-12)

formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
  validate: 'lenient',
  errorPolicy: 'silent',
});
// → '20251345'  (raw input; the clamp is discarded)
```

**A `customTokens` handler that throws is degraded rather than propagated.** A
throw inside caller-supplied code is technically a caller problem, but it is also
a per-record data problem: the handler was handed _this row's_ `parts` and could
not cope. In a batch, one pathological row should not abort the batch. Under
`formatDate` the token renders as its own name:

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

Calling `renderTemplate` directly without `onMissing` re-raises, so a library
author embedding the low-level API can opt into strictness.

### Structural guarantees behind the policy

`errorPolicy` cannot leak exceptions it is not meant to suppress:

- **Built-in handlers never throw and never coerce.** They return `null` when a
  field has no usable value. `renderTemplate` turns that into an error or a
  literal, so the render stage has nothing to catch in the first place.
- **`normalizeFields` and `validateOutput` are the only two stages that can throw
  from inside the `try` blocks**, and both are wrapped.
- **`formatDate` validates its own arguments before doing any work**, so a
  misconfigured call fails identically under both policies.

### Rejected modes

`'warn'` (log and continue) and `'coerce'` (substitute silently) are listed in
the older version of this document as future work and remain unimplemented.

- `'warn'` would need a logger dependency or a global, which breaks the zero-dep,
  no-globals contract. `errorPolicy: 'silent'` plus a comparison against the
  input already gives callers a way to detect the degraded rows themselves.
- `'coerce'` is a footgun. Filling a missing day with `01` is the same class of
  bug as inventing a timezone.

---

## Token extensibility

Two routes, deliberately separated by cost.

### Per call, through options — no library change

| Option           | Kind                          | Precedence | Also usable in `inputFormat` | Notes                                                                  |
| ---------------- | ----------------------------- | ---------- | ---------------------------- | ---------------------------------------------------------------------- |
| `overrideTokens` | `string \| (parts) => string` | 1 — wins   | no                           | Checked with `hasOwn`, so an explicit `undefined` still overrides.     |
| `customTokens`   | `(parts) => string`           | 2          | **yes**                      | Rejects non-functions and reserved names. May shadow a built-in name.  |
| parsed input     | —                             | 3          | —                            | Checked per **field**, not per token name.                             |
| `defaultTokens`  | `string \| (parts) => string` | 4          | no                           | Applies when the field has no value, not when a token name is missing. |
| literal fallback | —                             | 5          | no                           | Silent mode only. Token name is rendered.                              |

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => String(Math.ceil(parts.month / 3)) },
}); // → '2025-Q2'
```

A `customTokens` entry is registered into a per-call copy of `TOKEN_REGISTRY`
with `width: name.length` and `variable: false`, which is what makes it readable
in the input format and what puts the parsed value on `parts[tokenName]`. The
name length _is_ the input width, so a two-character token consumes two
characters — there is no way to declare "variable width" for a custom token.

### In the library, through `TOKEN_REGISTRY`

`src/handlers.js` holds the only hand-written token table. `DEFAULT_HANDLERS`,
`TOKEN_FIELD_MAP`, `FIELD_GROUPS`, `FIELD_PREFERENCE` and `BUILTIN_TOKENS` are
all derived from it at module load, so a new token for an existing field is a
single insertion. See [Adding a token](./internals.md#adding-a-token) for the
worked recipe and the one case that needs more than one edit.

**The registry shape is the extension contract.** `{ field, width, variable,
text?, parse?, handler }` is what both the input scanner and the output resolver
read. A built-in is not special: it takes exactly the same path as a
`customTokens` handler once it is in the table. There is no plugin system, no
`register()`, and no global mutable state — the set of tokens is either the
literal registry or the literal contents of one options object.

---

## What it deliberately does not do

- **No `Date`, no `Intl`, no timezone.** Not a gap; the reason the library
  exists. Date arithmetic, zone conversion and locale formatting are all
  different problems with different dependencies.
- **No date arithmetic.** Adding days, diffing, "last day of the month". This is
  a reformatting tool.
- **No natural-language or fuzzy parsing.** `next Friday`, `yesterday`,
  `2025年4月25日`. The input is positional and the format is exact.
- **No calendar correctness by default.** `validate: 'off'` formats month 13
  happily. When validation _is_ enabled it is Gregorian only — no Julian,
  Islamic, Persian or Buddhist calendars, and no non-Gregorian year eras.
- **No locale, pluralisation or ordinals built in.** `April`, not `avril`. `Do`
  is not a token; it is a five-line `customTokens` recipe, which keeps the
  registry free of opinionated formatting that most callers would override.
- **Not a Unicode TR35 parser.** The 14 symbols follow TR35 _meanings_ for
  output. `Q`, `D`, `E`, `w`, `L`, `S` and the zone tokens are not implemented.
- **No global token registration.** Extension is per call. A process-wide mutable
  registry is a shared-state bug waiting for whoever loads this library second.
- **No silent filling of missing data.** `'silent'` marks gaps with the token
  name; it never substitutes a plausible value.
- **No batch or streaming API.** `formatDate` handles one string. Callers
  processing many rows can hoist `buildTemplate` and loop over `renderTemplate`,
  but there is no built-in iterator — a batch API would need to make decisions
  about memory, error aggregation and back-pressure that this library has no
  opinion on.
- **No I/O, no schema, no configuration layer.** Formats are arguments, not
  files.

---

## Roadmap

Status is against `src/` as it stands, not against intent.

### Shipped

| Capability                                          | Where                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Zero-dependency ESM + CJS build                     | `rollup.config.js`, `npm run test:dist`                                                 |
| Public TypeScript definitions                       | `types/index.d.ts`, checked by `npm run typecheck`                                      |
| Hand-written JSDoc on every export                  | all of `src/`                                                                           |
| Centralised token metadata                          | `TOKEN_REGISTRY` in `src/handlers.js`                                                   |
| One shared format tokenizer                         | `tokenizeFormat` in `src/utils.js`                                                      |
| `errorPolicy: 'silent'`                             | `src/formatter.js`                                                                      |
| Machine-readable error codes                        | `ERROR_CODES`, `DateFormatError.code`                                                   |
| Range validation (`off`/`lenient`/`strict`)         | `src/validateFields.js`                                                                 |
| `isRealDate` helper                                 | `src/validateFields.js`                                                                 |
| `customTokens` / `overrideTokens` / `defaultTokens` | `src/validateOutput.js`                                                                 |
| Bracket escapes `[...]`                             | `tokenizeFormat`, `buildTemplate`                                                       |
| Typo detection via `strictTokens`                   | `src/validateOutput.js`                                                                 |
| Literal verification / `verifyLiterals`             | `src/extractTokens.js`                                                                  |
| Public low-level modules                            | `extractTokens`, `normalizeFields`, `validateOutput`, `buildTemplate`, `renderTemplate` |
| Prototype-less maps, frozen tables                  | `src/utils.js`, all exported tables                                                     |

### Open

Ordered roughly by how much they would improve the library rather than by effort.

| Item                                     | Why it is open                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Output-template caching**              | `formatDate` calls `buildTemplate` inline, so the plan is recompiled per call. A `Map` keyed by output format (with the handler table keyed separately) would remove the tokenize step from the hot path. Must not grow unbounded. |
| **Token aliases**                        | `MMM` ↔ `mon`, `Do` ↔ ordinal day. Aliases would need a documented precedence rule and would complicate the "longest token first" matcher.                                                                                         |
| **`'warn'` error policy**                | Needs a logging hook. A caller-supplied `onWarning` callback would keep the zero-dep contract; `errorPolicy` alone cannot.                                                                                                         |
| **TR35 coverage**                        | `Q`, `D`, `E`, `w`, `L`, `S` and the zone tokens, for callers migrating off a heavier library. Each needs a decision about parse behaviour, not just output.                                                                       |
| **Batch helper**                         | A thin `formatMany(rows, inputFormat, outputFormat)` over hoisted `buildTemplate`/`renderTemplate`, returning `{ value, degraded }` per row so failures are visible instead of silent.                                             |
| **Per-call `strictTokens` improvements** | See below.                                                                                                                                                                                                                         |

### Known issues worth fixing

Found while writing [`internals.md`](./internals.md). All reproducible against
the current `src/`.

1. **`strictTokens` breaks ISO 8601 output.** The typo check scans the _raw_
   format string with `/[a-zA-Z]+/g` instead of using the tokenizer, so a
   compact run that happens to include `T` is reported as one bogus token:

   ```js
   formatDate('20250425T093045', 'yyyyMMddTHHmmss', 'yyyy-MM-ddTHH:mm:ss', {
     strictTokens: true,
   });
   // throws UNPRODUCIBLE_TOKEN: Unknown token "ddTHH" in output format
   ```

   The `STRUCTURAL` allow-list (`T`, `Z`, `W`, `a`, `t`, `z`) can never fire,
   because the run it would have matched is `ddTHH`, not `T`. The fix is to run
   the check over `tokenizeFormat` segments and treat non-token, non-bracketed
   alphabetic runs as the candidates — which is the same lesson the shared
   tokenizer taught the rest of the pipeline. The README currently claims ISO
   output keeps working here.

2. **Literal words fragment into tokens.** The matcher has no word boundary, so
   a literal starting with a lowercase token letter is split:
   `tokenizeFormat('hours HH', builtins)` → `[literal 'hour', token s, …]`, and
   `formatDate('20250425', 'yyyyMMdd', 'mon MM yyyy')` throws
   `UNPRODUCIBLE_TOKEN` for token `m`. Users must bracket these. Worth either
   documenting more prominently or matching only against known tokens when
   followed by a non-token character.

3. **`TOKEN_REGISTRY` is frozen only one level deep.** `TOKEN_REGISTRY.MMM.width
= 3` succeeds in a consumer's process. The spec objects should be frozen too.

4. **`FIELD_PREFERENCE` is not part of the public surface.** It is exported from
   `src/handlers.js` and used by `normalizeFields`, but not re-exported from
   `src/index.js` and absent from `types/index.d.ts`.

5. **`dateParts` carries per-token numeric aliases** (`yyyy`, `MM`, `dd`, …)
   alongside the semantic fields, because `normalizeFields`' custom-token loop
   tests token names against `FIELD_GROUPS`, which is keyed by _field_ names.
   It is harmless and it is what makes `parts[tokenName]` uniform, but it is
   accidental. The same comparison means a custom token _named_ `month`, `year`,
   `day`, `hour`, `minute` or `second` is silently skipped by that loop, so its
   captured value never reaches `parts` — `parts.month` reports whatever `MM` or
   `M` parsed instead:

   ```js
   formatDate('202504', 'yyyyMM', 'yyyy-[m]month', {
     customTokens: { month: (p) => String(p.month) },
   });
   // → '2025-m4'   the handler sees month 4 from MM, not its own captured value
   ```

   Field-name collisions should be rejected the way reserved `Object.prototype`
   keys are.

---

## Related

- [`../README.md`](../README.md) — overview and usage
- [`api.md`](./api.md) — public signature and options
- [`tokens.md`](./tokens.md) — token reference
- [`formatting-behavior.md`](./formatting-behavior.md) — precedence and fallback matrix
- [`examples.md`](./examples.md) — worked examples
- [`internals.md`](./internals.md) — pipeline, module map, contributor guide
- [`contributing.md`](./contributing.md) — development setup
