# Project Memory — datefmt-lite

**Purpose:** everything a new session needs to continue this work without
rediscovering it. Read this file first.

**Last updated:** 2026-10-05, after commit `fdf3af7`

---

## 1. What this library is, and why it exists

`datefmt-lite` converts a date **string** from one format to another. It never
constructs a `Date`, never touches `Intl`, never applies a timezone. Zero runtime
dependencies.

The positioning is deliberate and should not be diluted:

> **Fixed-width date reformatting for data pipelines and constrained runtimes.**

The defensible differentiators, in priority order:

1. **No `Date`, no `Intl`.** Every alternative forces a `Date` into memory —
   `dayjs` internally constructs one, `date-fns` returns them by design, `luxon`
   uses `Intl`. In hardened runtimes, edge functions and WASM targets, `Intl` may
   be absent and constructing a `Date` can pull in ~300 kB of ICU data. This is a
   compliance property, not a style choice.
2. **Fixed-width / positional records.** COBOL `PIC 9(8)` → ISO, SAP/EDIFACT
   segments, mainframe and AS/400 flat files. Competitors want `(string) → Date`
   and force you through `new Date(...)` with its implicit guessing.
3. **Injectable custom tokens.** Fiscal quarters, period codes, plant codes. A
   three-line, zero-plugin extension point. **This is the moat** and it is
   under-advertised.

**Do not** add date math, timezone handling, or locale support. `docs/design.md`
protects this and it is correct — competing with `date-fns` on features loses.
**Do not** add runtime dependencies; the zero-dep property _is_ the product.

### What it is not

It is currently a **subset** of `date-fns`. That is fine and honest as long as it
competes on the axis above rather than pretending to be a general date library.
The README was rewritten to lead with fixed-width pipelines instead of
`yyyyMMdd → dd/MM/yyyy`, which is the one thing `date-fns` does in a single line.

---

## 2. Repository state

- **Branch:** `main`. 14 commits by the maintainer, all reviewed before landing.
- **Version:** `2.1.0` in `package.json`. **CHANGELOG has a full `[3.0.0]`
  section describing breaking changes but the version was never bumped.** See
  §6.
- **Tags:** `v1.0.0`, `v2.0.0`, `v2.1.0`, and `perf-baseline` (points at
  `9c5565f`, the commit before the caching work — used as the differential-test
  reference).
- **Tests:** 567 total, 15 files. 4 skip unless `DATEFMT_REFERENCE` is set.
- **Bundle:** 5,232 B gzipped (`dist/esm/index.esm.js`), budget 5,632 B enforced
  in `scripts/verify-dist.mjs`.
- **Working tree is clean.** Do not leave `dist/` or
  `.differential-reference/` behind.

### Commands

```bash
npm ci                # install (yarn.lock was deleted; package-lock.json is canonical)
npm test              # 567 tests
npm run test:coverage # coverage report
npm run test:differential  # parity vs the perf-baseline tag (needs that tag)
npm run build         # dist/cjs/index.cjs + dist/esm/index.esm.js
npm run test:dist     # 14 checks against the built bundles
npm run benchmark     # ns/op per workload + bundle size
npm run verify        # format:check + lint + typecheck + test + differential
                      #   + build + test:dist + benchmark
```

CI runs on Node 20/22/24 and executes `npm run verify` plus `npm pack --dry-run`.

**Gotcha:** `npm ci` requires `package-lock.json`. If you regenerate it, do not
run plain `npm install` in the repo — npm will rewrite the lockfile.

---

## 3. Architecture

Pure token-to-token. **Fork-join, not a linear pipeline** — this was
misdocumented for two versions and is worth knowing:

```
formatDate
  ├─ extractTokens(inputDate, inputFormat, table, {verifyLiterals})
  │     → { tokens, values, mismatched }
  │        tokens = only what matched; values = raw strings or null
  │        mismatched = the string as a whole failed to conform
  │
  ├─ normalizeFields(parsed, {yearConverter, errorPolicy})   ← branch A
  │     → { year, month, day, hour, minute, second, tokens }
  │
  ├─ validateOutput({parsedTokens, dateParts, outputFormat, overrides, ...})
  │     → handler table                                ← branch B
  │
  └─ buildTemplate(outputFormat, handlers) → renderTemplate(plan, handlers, parts)
```

Branches A and B both consume the parse result; they do not feed each other.

### The single most important design decision

**`tokenizeFormat` in `src/utils.js` is the only format parser.** The input
parser, the output validator and the renderer all go through it, so they
structurally cannot disagree about what a token is.

Before this, `validateOutput` and `buildTemplate` each built their own matcher
from different inputs. That is _why_ `formatDate('20250425','yyyyMMdd','yyyyMMdd')`
threw `Unknown token "yyyyMMdd"` — contiguous alphabetic runs were scraped as
single unknown tokens, so every separator-free format, ISO 8601 output, and any
literal word was unusable.

**Never reintroduce a second tokenizer.** If you need new behaviour, extend
`tokenizeFormat`.

### Tokenizer rules that are easy to break

- A token may be followed immediately by another token (`yyyyMMdd`, ISO
  `ddTHH:mm:ss`), but may **not** sit inside a longer word. The decision is made
  **per alphabetic run**: a run is tokenized only if it decomposes entirely into
  known tokens, allowing at most one structural separator.
  - `day` → literal. Previously it became `d` + `ay` → `"25ay 25 of April"`.
  - `hours HH` → `["hours ", HH]`. Previously `HH` threw
    `Cannot produce token "s"`.
- Structural separators: `T`, `Z`, `W`, `t`, `z`, `a`. Both sides must be real
  tokens.
- Unbalanced `[` falls through to literal. Nested brackets close at the **first**
  `]`.
- `[text]` renders `text` **without** brackets, contents never tokenized.

### Caching (added recently, easy to break)

| Cache             | Where                          | Key                                                    | Cap             |
| ----------------- | ------------------------------ | ------------------------------------------------------ | --------------- |
| tokenizer results | `utils.js` `tokenizeCache`     | length-prefixed `format` + vocabulary                  | 256, FIFO       |
| compiled plans    | `buildTemplate.js` `planCache` | length-prefixed `outputFormat` (+ vocabulary)          | 256, FIFO       |
| tokenizers        | `utils.js` `tokenizerCache`    | sorted vocabulary names                                | unbounded, tiny |
| handler table     | —                              | returns shared frozen `DEFAULT_HANDLERS` when pristine | —               |

Three bugs were found and fixed here; **all three are now regression-tested**:

1. **Key collision.** `format + separator + names` was ambiguous because a custom
   token name may contain the separator. Now length-prefixed.
2. **Shallow freeze.** `Object.freeze(array)` left `.value` writable, so a caller
   could poison the cache process-wide. Each element is frozen too.
3. **Stale vocabulary.** A `WeakMap` keyed on array _identity_ returned stale
   results after a caller mutated the array. Keys are derived from **contents**.

`validateOutput` returns the **shared frozen** `DEFAULT_HANDLERS` when no custom /
override / default tokens are declared. Every write goes through `writable()`,
which swaps in a private copy first. Verified leak-free under a hostile `Proxy`.

---

## 4. Behaviour contract (do not regress these)

| Behaviour               | Detail                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `errorPolicy: 'silent'` | Never throws on **bad data**. Returns `inputDate` unchanged when the format is not honoured; renders unproducible tokens as their own name.                                                                              |
| `errorPolicy: 'silent'` | **Still throws** on **caller mistakes** — non-string args, invalid `errorPolicy`/`validate`, non-function `yearConverter`, non-function `customTokens`, reserved token names. Hiding a caller bug is worse than failing. |
| Input widths            | `M`/`d`/`H`/`m`/`s` read **1 or 2 digits** (two tried first, fallback to one). `MM`/`dd`/`HH`/`mm`/`ss` exactly 2. `yyyy` exactly 4.                                                                                     |
| Textual months          | `MMM` **and** `MMMM` both parse full names _and_ abbreviations, case-insensitively, longest match wins.                                                                                                                  |
| Literal separators      | **Verified** against the input by default. A mismatch, trailing content, a BOM or corrupt token content throws `INPUT_MISMATCH`.                                                                                         |
| `verifyLiterals: false` | Only meaningful for direct `extractTokens` callers. Through `formatDate` a skipped separator desynchronises the cursor, so it still reports a mismatch rather than returning a wrong date. Documented as such.           |
| Precedence              | `overrideTokens` > `customTokens` > parsed input > `defaultTokens` > literal name. Resolved **per field**, so a month parsed as `M` is not overwritten by `defaultTokens.MM`.                                            |
| `validate`              | `'off'` by default — preserves the no-assumptions contract. `'lenient'` clamps, `'strict'` throws. Real leap-year rules (1900 and 2100 are not leap years; 2000 is).                                                     |
| `strictTokens`          | Rejects unrecognised words in the output format. Bracketed groups and `T`/`Z`/`W`/`a`/`t`/`z` stay allowed so ISO works.                                                                                                 |
| `mm` is minutes         | Correct per Unicode TR35/CLDR. The PHP `date()` footgun where `m` = month does **not** apply here.                                                                                                                       |

### Error codes

`INVALID_ARGUMENT`, `INVALID_OPTION`, `INPUT_MISMATCH`, `UNPRODUCIBLE_TOKEN`,
`OUT_OF_RANGE`, `INVALID_YEAR`, `RESERVED_TOKEN`.

Every error is a `DateFormatError` with `.code`, plus `.token` / `.field`.
Messages never echo the input value, only token/format names, truncated to 64
chars so a pathological format cannot produce a 100 kB log line.

---

## 5. Testing conventions

- **All tests live in `test/`**, not next to source.
- Tests are transformed to CJS by babel-jest, so **`import.meta` does not
  work**. Use `process.cwd()` when a test needs the repo root.
- `test/publicApi.test.js` cross-checks `src/index.js` against
  `types/index.d.ts` in both directions, so a phantom declaration or an
  undeclared export fails the build.
- `test/docs.test.js` executes documented examples and asserts exact output.
- `test/differential.test.js` compares 15,000 seeded cases against the
  `perf-baseline` tag. **Skips unless `DATEFMT_REFERENCE` is set** — in CI it
  runs via `npm run test:differential`.
- `test/dist.test.js` requires `dist/` to exist; it self-skips otherwise.

**Mutation testing was used to audit this suite** and it is worth repeating after
significant changes. The old suite reported 100% line coverage while the library
could not round-trip its own primary format — coverage measured _which lines ran_,
not _which inputs were tried_. Nine tests asserted broken behaviour as correct.

Current coverage is ~97% statements / ~93% branches.

---

## 6. Known open items

Ordered by value. Nothing here is broken; these are improvements.

1. **Bump the version to 3.0.0.** `CHANGELOG.md` has a complete `[3.0.0]`
   section with breaking changes, but `package.json` still says `2.1.0`. The
   work is complete and unreleased. This is the highest-priority item.
2. **Release.** No `npm publish` has been done. `prepack` builds, `prepublishOnly`
   runs format/lint/typecheck/test.
3. **Positioning follow-through.** The README now leads with fixed-width
   pipelines. Consider whether `docs/examples.md` needs a COBOL `PIC 9(8)`
   example promoted into the README, since that is the actual differentiator.
4. **Cache cap cliff.** Rotating over more than 256 distinct output formats costs
   ~29% of the win (measured: 1,953 ns at 255 formats, 2,740 ns at 257). Not a
   regression against baseline, and no correctness impact. If it matters, raise
   the cap or use generational eviction.
5. **Dead-ish public API.** `buildTokenMatcher`, `buildTokenPattern` and
   `escapeRegex` are exported and tested but no longer used internally — only by
   `test/security.test.js` and `scripts/verify-dist.mjs`. They cost ~157 B gz.
   Keeping them is a reasonable call; `docs/internals.md` no longer calls them
   load-bearing.
6. **Remaining minor items** from the perf review: duplicate comment block in
   `validateOutput.js`, `declared.length === 0` evaluated four times,
   `BUILTIN_TOKEN_SET` duplicates state `buildTokenizer` already holds,
   `names.filter(...)` is dead since `Object.keys()` always returns strings.
7. **`extractAllTokensFromFormat` is exported** but no longer used internally.

### Deliberately not done

- **No performance work beyond the caching.** The remaining profile is dominated
  by genuine per-call work, not repeated constants. Further gains would need a
  different data structure, and the ETL case is already ~2.1× faster.
- **No `Date`-object support, no timezones, no locale.** Deliberate.
- **`yearConverter` is not given a smarter default.** The library will not guess
  a pivot year; supply it explicitly.

---

## 7. Review workflow used on this project

Each batch of changes was validated by independent subagents **before**
committing, which caught real defects in my own work every time:

- The core rewrite: caught that `silent` could still throw on an uncoercible
  override, that `defaultTokens` clobbered overrides, that absent tokens did not
  advance the cursor, and that `strictTokens` broke ISO output.
- The caching work: caught cache-key poisoning, shallow freeze, and a stale
  vocabulary. All three shipped in `fb00ebe`.

**Keep doing this.** It is cheap relative to the value.

When reviewing, run `node --input-type=module -e "import {formatDate} from
'./src/index.js'; ..."` to reproduce behaviour. The source is pure ESM with no
dependencies, so it runs directly with no build step.

---

## 8. Commit style

Angular Conventional Commits: `type(scope): imperative summary`, with a body
explaining **why**. Types used so far: `build`, `ci`, `docs`, `fix`, `perf`,
`refactor`, `style`, `test`.

Bodies are substantive — they state the defect, the reason, and the measured
effect. Do not write "update code" or "fix bug".
