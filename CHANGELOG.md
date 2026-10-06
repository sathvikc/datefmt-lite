# Changelog

All notable changes to `datefmt-lite` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`datefmt-lite` rearranges date **strings**. It never constructs a `Date`, never
uses `Intl`, and never applies a timezone. Anything that makes previously
plausible input start failing is treated as a breaking change, because a
silently wrong date is worse than a thrown one.

---

## [Unreleased]

No further behaviour changes are queued. What remains is release mechanics, and
it is recorded here rather than left implicit:

- `version` in `package.json` is still `2.1.0`. It has to be bumped to `3.0.0`
  and tagged `v3.0.0` in the release commit. This file cannot do that itself,
  and the repository deliberately has no `prepare` script, so nothing in the
  current tree publishes by accident.
- `README.md` still advertises **1.7 kB gzipped** in the feature list. The
  built bundles are 4.7 kB gzipped (`4702 B` for `dist/cjs/index.cjs`, `4699 B`
  for `dist/esm/index.esm.js`), which is inside the `5120 B` budget that
  `scripts/verify-dist.mjs` enforces. The figure needs correcting in the same
  release.

Everything under `[3.0.0]` below describes the state of the tree, and is dated
2026-10-05, the day those changes landed on `main`.

---

## [3.0.0] - 2026-10-05

A correctness release. The 2.x line was green in CI and wrong in production:
compact output formats threw, `require()` failed for every CommonJS consumer,
silent mode threw, and misaligned input produced a well-formed wrong date. Each
defect below was reachable through code that was already fully covered by tests,
which is why this is a major bump and not a patch.

### Breaking changes

Consumers must read this section before upgrading. Every item changes observable
behaviour.

#### 1. `errorPolicy` is validated

`errorPolicy` was previously never checked, and the two halves of the pipeline
gated on different literals — one compared against `'throw'`, the other against
`'silent'`. Any third value (`'slient'`, `'SILENT'`, `null`, `0`) produced a
half-silent mode in which validation was skipped but the fallbacks were not
installed, so a typo silently emitted output with the token name still in it.

It is now validated and a rejected value throws:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'slient' });
// 2.x: returned a string containing the literal token names
// 3.0: throws DateFormatError, code INVALID_OPTION
```

**What to change:** nothing in correct code. If a call site passes a
constructed value, make sure it is exactly `'throw'` or `'silent'`.

#### 2. Literal separators in `inputFormat` are verified by default

2.x skipped literal text by declared width, so a separator in the format did not
have to be present in the data, trailing content was ignored, and every later
field was read from the wrong offset.

3.0 verifies literals by default. A mismatch, trailing content, a byte-order
mark, or token content that is present but corrupt now throws:

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy');
// throws, code INPUT_MISMATCH

formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy'); // throws INPUT_MISMATCH
formatDate('\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy'); // throws INPUT_MISMATCH
```

**What to change:** nothing in correct code. If a format genuinely relies on
separators being positional only, note that `verifyLiterals: false` does **not**
make a mismatched separator succeed — it still throws `INPUT_MISMATCH`, because
skipping the literal desynchronises the cursor and reporting a well-formed wrong
date is the failure this release removes. Fix the format to match the data. To
tolerate bad records instead, catch `INPUT_MISMATCH`, or use
`errorPolicy: 'silent'`, which returns the raw input string untouched.

#### 3. `[text]` renders without its brackets, and its contents are never tokenized

2.x left the brackets in the output and still tokenized the contents, so `[yyyy]`
rendered `[2025]` and `yyyy[-]MM` produced a phantom token `yyyyMM` that threw.

```js
formatDate('2025', 'yyyy', '[yyyy]');
// 2.x: '[2025]'
// 3.0: 'yyyy'

formatDate('20250425', 'yyyyMMdd', 'yyyy [at] MM');
// 2.x: '2025 [at] 04'
// 3.0: '2025 at 04'

formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => String(Math.ceil(p.month / 3)) },
});
// 2.x: '2025 [2]2'
// 3.0: '2025-Q2'
```

**What to change:** stop wrapping data in brackets. `formatDate(s, f,
'[' + value + ']')` no longer emits the brackets, so a value carrying its own
brackets now differs in the output. Reserve `[...]` for format text you want
printed literally, and never build a format by concatenating data into it.

#### 4. `customTokens` names inherited from `Object.prototype` are rejected

`__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`,
`isPrototypeOf`, `propertyIsEnumerable` and `toLocaleString` now throw with code
`RESERVED_TOKEN`. A handler map is looked up by key, and an ambiguous key would
resolve against the prototype chain rather than failing loudly.

**What to change:** rename the custom token. `Q`, `Q1`, `FQ` and similar are
unaffected.

#### 5. Exported tables are frozen

`MONTH_NAMES`, `MONTH_ABBREV`, `BUILTIN_TOKENS`, `TOKEN_REGISTRY`,
`DEFAULT_HANDLERS`, `TOKEN_FIELD_MAP`, `FIELD_GROUPS` and `ERROR_CODES` are
`Object.freeze`d. In 2.x they were mutable, so one caller adding a token to
`TOKEN_REGISTRY` corrupted the behaviour of every later call in the process —
including other libraries sharing the module instance.

Assignment now throws in strict mode (ESM is always strict).

**What to change:** stop patching the exported tables. Use `customTokens`,
`overrideTokens` or `defaultTokens` per call instead.

#### 6. `extractTokens` has a different return shape

2.x returned `{ raw, tokens }`, and its `tokens` array included tokens that had
**failed** to parse — so `tokens` did not mean what it was documented to mean.

3.0 returns:

```js
{ tokens: string[], values: Record<string, string|null>, mismatched: boolean }
```

`tokens` contains only successfully matched tokens. `values` holds the raw
strings, with `null` where a token was present but unreadable. `mismatched` is
true when the string as a whole failed to conform, which is what
`errorPolicy: 'silent'` uses to fall back to the raw input.

`extractTokens` also takes a fourth `options` argument, `{ verifyLiterals }`.

**What to change:** `raw` is now `values`; membership of `tokens` now means what
you always assumed it meant. Check `values[token] !== null` rather than relying
on `tokens` to exclude a failed read. This is a signature break for anyone
deep-importing the function.

#### 7. `validateOutput` takes an options object

2.x took positional arguments `(dateParts, outputFormat, options)`. It now takes a
single destructured object:

```js
validateOutput({
  parsedTokens,
  dateParts,
  outputFormat,
  overrides: { overrideTokens, defaultTokens, customTokens },
  errorPolicy,
  strictTokens,
});
```

`dateParts` is new and load-bearing: it distinguishes "this token was not
parsed" from "this token was parsed but its underlying field is `null`".

**What to change:** rewrite the call. `overrides` is nested rather than three
separate arguments.

#### 8. `buildTemplate` returns a render plan, not a mixed array

2.x returned `['dd', '/', fn, '/', fn]` — strings and functions interleaved, so
callers had to type-check each element. It now returns typed steps:

```js
buildTemplate('dd/MM/yyyy', handlers);
// 2.x: ['dd', '/', fn, '/', fn]
// 3.0: [{ type: 'token', value: 'dd' },
//       { type: 'text',  value: '/'  },
//       { type: 'token', value: 'MM' },
//       { type: 'text',  value: '/'  },
//       { type: 'token', value: 'yyyy' }]
```

`escaped` segments are folded into `text`, because bracketed groups render
literally with the brackets removed.

**What to change:** read `step.type` instead of `typeof step === 'function'`.

#### 9. Errors are `DateFormatError` with a `.code`

2.x threw plain `Error` in most paths and raw `TypeError` in others, so
distinguishing "the data was bad" from "the caller passed something wrong" meant
matching message text.

3.0 throws a single `DateFormatError` class carrying:

- `code` — one of the values in the frozen `ERROR_CODES` map
- `token` — the offending token name, truncated to 64 characters
- `field` — the offending field, where one applies

**What to change:** replace message matching with `err.code`. Remove any
`instanceof TypeError` checks for data problems — those are now
`INVALID_ARGUMENT` or `INVALID_OPTION`.

#### 10. Variable-width tokens read one or two digits

`M`, `d`, `H`, `m` and `s` previously consumed exactly one character on input,
so the second digit was eaten by the following token. The result was silently
wrong, not wrong-and-loud:

```js
formatDate('0415', 'Mdd', 'MM-dd');
// 2.x: '00-41'   month 0, day 41, no error
// 3.0: '04-15'

formatDate('20250409', 'yyyyMd', 'yyyy-MM-dd');
// 2.x: '2025-00-04'
// 3.0: '2025-04-09'
```

3.0 tries the wider slice first and falls back to one digit when the two-digit
slice is not purely numeric or would overrun the input.

**What to change:** none. This only makes the documented behaviour true. Note the
genuine ambiguity it introduces — `MMDD` and `Md` are distinguishable only
because the wider read is attempted first and must be all digits.

### Added

- **`validate: 'off' | 'lenient' | 'strict'`** — opt-in range checking of the
  parsed fields. `'off'` (default) keeps the no-assumptions contract. `'lenient'`
  clamps; `'strict'` throws `OUT_OF_RANGE`. Leap years are handled, so
  `20250229` is rejected and `20240229` is accepted. A strict failure surfaces
  even under `errorPolicy: 'silent'`, because it is a data-quality assertion
  rather than recoverable noise.
- **`strictTokens: boolean`** — treats unrecognised words in `outputFormat` as
  errors rather than literal text, so `'ISO yyyy'` throws
  `UNPRODUCIBLE_TOKEN` instead of shipping the word `ISO` into a data file.
  Bracketed groups and the structural separators `T`, `Z`, `W`, `a`, `t`, `z`
  remain allowed, so ISO 8601 output still works. Off by default.
- **`verifyLiterals: boolean`** (default `true`) — controls whether the input
  parser stops at the first literal mismatch or keeps reading the remaining
  tokens. `false` deliberately still reports `mismatched: true`, so `formatDate`
  behaves identically either way; what it changes is what a direct
  `extractTokens` caller recovers, since the values past the mismatch are
  populated instead of dropped.
- **`MMM` / `MMMM` input parsing** — textual months parse in `inputFormat` as
  well as rendering in `outputFormat`, accepting a full name or an abbreviation.
  Round-tripping a textual month was previously impossible.
- **Compact format support** — separator-free output formats such as `yyyyMMdd`
  now work in both directions, and are tokenized by the same routine as
  separator-bearing ones.
- **`renderTemplate(plan, handlers, dateParts, { onMissing })`** — exported
  separately from `buildTemplate`, so a compiled plan can be rendered against
  different data. A handler returning `null` or `undefined` falls back to
  `onMissing(token)` instead of leaking `"null"` into the output.
- **`buildTokenMatcher`, `buildTokenPattern`, `collectTokens`, `escapeRegex`,
  `looksLikeToken`** — the tokenizer primitives behind `tokenizeFormat`, now
  public so callers can compile formats themselves.
- **`hasField`, `isRealDate`, `parseMonthName`, `validateFields`** — field
  predicates, calendar-date checking, month-name resolution, and the range
  checker that `validate` drives.
- **Error codes `RESERVED_TOKEN`, `OUT_OF_RANGE` and `INVALID_YEAR`** — a
  reserved custom-token name, a field parsed successfully but out of range, and a
  `yearConverter` that did not return a non-negative integer. The full set is
  the frozen `ERROR_CODES` map: `INVALID_ARGUMENT`, `INVALID_OPTION`,
  `RESERVED_TOKEN`, `INPUT_MISMATCH`, `UNPRODUCIBLE_TOKEN`, `OUT_OF_RANGE`,
  `INVALID_YEAR`.

### Changed

- The pipeline was rewritten around a single shared tokenizer,
  `tokenizeFormat`, so the input parser and the output renderer can no longer
  disagree about what counts as a token. That disagreement was the root cause of
  the compact-format, ISO 8601 and bracketed-literal defects above.
- `types/index.d.ts` is now checked by `npm run typecheck`, which runs `tsc
  --noEmit` over `types/**/*.ts` under `strict`.
- Toolchain is npm-only. There is no `prepare` script, so `npm install` in a
  fresh clone does not attempt a build; `prepack` does it instead, at pack and
  publish time.
- The build emits exactly two minified bundles — `dist/cjs/index.cjs` and
  `dist/esm/index.esm.js`. Babel's non-bundled output is gone, so the tarball no
  longer ships a duplicate copy of the library.
- `rollup.config.js` throws on `UNRESOLVED_IMPORT`. The library has zero runtime
  dependencies and there is no node-resolve or commonjs plugin; an accidental
  bare import now fails the build instead of shipping.
- `package.json` declares `sideEffects: false`, an `exports` map with `types`
  listed first, an `./package.json` subpath, and `engines.node: ">=18"`.
- Bundles are 4.7 kB gzipped, against a 5120-byte budget enforced in CI.
- The test suite was replaced with contract and property coverage: seeded
  differential fuzzing over the whole token matrix, a security suite
  (prototype pollution, `Object.prototype` key confusion, ReDoS, message
  hygiene), a docs suite that executes every documented example, and a public-API
  suite that checks `types/index.d.ts` against the runtime. 548 tests across 14
  suites, all under a second.
- CI runs `format:check`, `lint`, `typecheck`, `test:coverage`, `build`,
  `test:dist` and `benchmark` on Node 20, 22 and 24, plus an `npm pack --dry-run`
  job.

### Fixed

Every item below was reproducible on the 2.x line and produced a wrong result,
an exception where none was expected, or a broken install.

- **Compact output formats threw `Unknown token "yyyyMMdd"`.** The output
  validator scraped contiguous alphabetic runs, so every separator-free format
  was read as one long token name. `formatDate('20250425', 'yyyyMMdd',
  'yyyyMMdd')` threw. This is the shape an ETL pipeline actually produces.
- **ISO 8601 output was impossible.** `formatDate(s, 'yyyyMMddHHmmss',
  'yyyy-MM-ddTHH:mm:ss')` threw `Unknown token "ddTHH"`.
- **Literal words in output were impossible.** `'Date: dd/MM/yyyy'` threw
  `Unknown token "Date"`. It could only be made to work under
  `errorPolicy: 'silent'`, which disabled all checking as a side effect.
- **`errorPolicy: 'silent'` threw.** `formatDate('20251301', 'yyyyMMdd', 'MMM',
  { errorPolicy: 'silent' })` raised `TypeError: Cannot read properties of
  undefined (reading 'slice')`, because the `MMM` handler indexed `MONTH_NAMES`
  with month 13 and called `.slice` on `undefined`. The policy's core promise
  was false.
- **`MMM` / `MMMM` could never be parsed.** Both tokens were output-only, so
  round-tripping a textual month was impossible in either direction.
- **Bracketed literals corrupted adjacent tokens.** `yyyy[-]MM` concatenated the
  surviving text into a phantom token `yyyyMM`; `yyyy[MM]dd` produced `yyyydd`;
  `[a[b]c]` produced `c`. Validation stripped the brackets and the renderer did
  not, so the two halves of the pipeline disagreed about the format.
- **`overrideTokens` lost to `defaultTokens`.** Defaults were written into the
  same map that already held the user's overrides, clobbering them whenever the
  token had not been parsed. `formatDate('202504', 'yyyyMM', 'dd',
  { overrideTokens: { dd: '77' }, defaultTokens: { dd: '99' } })` returned
  `'99'`, inverting the documented precedence. A test asserted the broken
  behaviour and had to be rewritten.
- **`defaultTokens` was never applied to a failed parse.** The exact case the
  option exists for. `formatDate('2025AB', 'yyyyMMdd', 'dd/MM/yyyy',
  { defaultTokens: { MM: '00' } })` returned `'dd/MM/2025'` instead of
  `'dd/00/2025'`, because unreadable tokens were still recorded as parsed.
- **`"null"` and `"undefined"` leaked into output.** Ten handlers called
  `String(p.field)` unguarded, and a `yearConverter` returning `undefined`
  rendered the literal text `"undefined"` into a date string.
- **`yy` was not zero-padded below 10.** Year 5 rendered as `'5'`, not `'05'`.
- **Mutable exported state corrupted every later call.** `TOKEN_REGISTRY`,
  `MONTH_NAMES`, `DEFAULT_HANDLERS` and friends were plain objects, so a single
  caller could reassign a built-in handler and change the behaviour of every
  subsequent `formatDate` call in the process, including for unrelated
  consumers.
- **Phantom exports in `types/index.d.ts`.** The declarations included
  `buildTokenRegex` and `extractAllTokensFromFormat`, which the runtime did not
  export. TypeScript consumers compiled clean and got `undefined` at runtime.
  The declaration file is now cross-checked against the runtime surface in both
  directions on every run.
- **`require()` was completely broken.** The CommonJS entry point was emitted as
  `dist/cjs/index.cjs.js` inside a `"type": "module"` package, so Node classified
  it as ESM and every `require('datefmt-lite')` failed with
  `ReferenceError: exports is not defined in ES module scope` — while `import`
  and the unit tests were both green. The bundle is now `dist/cjs/index.cjs`, and
  `scripts/verify-dist.mjs` stages the built package in a scratch
  `node_modules` and loads it **by package name**, through the `exports` map,
  for both `require()` and `import()`.

---

## [2.1.0] - 2025-05-30

### Added

- Public TypeScript definitions under `types/index.d.ts`
- `CHANGELOG.md`, linked from `README.md`
- Complete JSDoc and inline comments across all core modules
- A `normalizeFields` test case covering the single-digit seconds (`s`) branch
- A `formatter.test.js` case for
  `formatDate('20250425', 'yyyyMMdd', 'MMM dd, yyyy')` → `'Apr 25, 2025'`

### Changed

- Centralised all token metadata in a single `TOKEN_REGISTRY` in `handlers.js`
- Auto-generated `DEFAULT_HANDLERS` and `TOKEN_FIELD_MAP` from `TOKEN_REGISTRY`
- Updated `formatter.js` and `validateOutput.js` to import and use
  `TOKEN_FIELD_MAP` rather than inline maps

### Fixed

- `Cannot produce token "MMM"` no longer throws when formatting `MMM` and only
  `MM` was parsed

---

## [2.0.0] - 2025-05-30

### Added

- `errorPolicy: 'silent'` for best-effort output and literal fallback
- `overrideTokens`, `defaultTokens` and `customTokens` with a consistent
  precedence
- Greedy token matching, longest token first
- Bracketed literals such as `[at]` (announced here; the implementation was
  broken until 3.0.0 — see the Fixed list there)
- A full documentation suite: usage, internals and formatting behaviour
- Jest coverage for tokens, edge cases and all code paths

### Changed

- Internal architecture reorganised into a clean pipeline:
  `extract → normalize → validate → render`, replacing monolithic legacy logic
  with one low-level module per phase

### Notes

- The low-level modules `extractTokens`, `normalizeFields`, `validateOutput` and
  `buildTemplate` became stable and documented, intended for advanced usage and
  library authors
- `formatDate()` itself was backward-compatible with 1.x at this point
- Built-in token behaviour (`yyyy`, `dd`, `MM`, and so on) was unchanged

---

## [1.0.0] - 2025-05-22

### Added

- `formatDate()`: parse, validate, compile, render
- Modular architecture, splitting parsing, compilation, rendering and handlers
  into focused modules
- `customTokens`, `overrideTokens` and `defaultTokens`
- Built-in tokens: years (`yyyy`, `yy`), months (`MMMM`, `MMM`, `MM`, `M`), days
  (`dd`, `d`), hours, minutes and seconds
- Strict error handling on malformed input and unsupported tokens, configurable
  via `errorPolicy`
- Extensible tokens that can be added or overridden without touching core logic

### Notes

- All public entry points live in the root module; no deep imports required
- The default behaviour is strict; pass `{ errorPolicy: 'silent' }` to fall back
  to the raw input on errors

---

## Upgrade summary

| From      | To        | Action                                                                                          |
| --------- | --------- | ----------------------------------------------------------------------------------------------- |
| 2.1.0     | 3.0.0     | Read the breaking changes above. Check call sites passing a computed `errorPolicy`, formats with literal separators in `inputFormat`, bracketed output, deep imports of `extractTokens` / `validateOutput` / `buildTemplate`, and any code matching on error messages or mutating the exported tables. |
| 2.0.0     | 2.1.0     | None. Token metadata was centralised internally; `formatDate` is unchanged.                     |
| 1.0.0     | 2.0.0     | None for `formatDate` users. Deep imports of internals should move to the documented low-level modules. |