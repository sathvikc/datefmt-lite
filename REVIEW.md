# datefmt-lite — Engineering Review & Strategic Plan

**Reviewer:** Claude (Opus), acting as maintainer
**Date:** 2026-10-05
**Reviewed commit:** `9aa9ce9` — release: v2.1.0 (#9)
**Scope:** all source (`src/`, 449 LOC), types, tests (112), build/packaging config, all 7 docs
**Method:** full file-by-file read + empirical execution of every falsifiable claim, cross-verified by 4 independent reviewer subagents (correctness, security/supply-chain, performance/architecture, docs/test-quality). Every finding below was reproduced first-hand; agent claims that did not survive direct verification were discarded.

---

## Verdict

**The idea is good. The 14-token core is solid. The packaging is broken. The headline use case does not work.**

This is not a "needs polish" library. There are defects that make it **silently produce wrong dates** and defects that make it **fail to load at all** for CommonJS users. Both are shipping blockers.

The most important framing: 100% of the 112 tests pass and coverage reports 100% statements/branches/functions/lines — while the library cannot do its own README example's inverse (`yyyyMMdd` → `yyyyMMdd` throws), cannot `require()` from CJS, and silently turns month 4 into month 0. **Coverage measured the wrong thing.** The gaps are not in "which lines ran" but in "which inputs were ever tried."

I want to be direct about one thing: the library's *thesis* — string-to-string, no `Date`, no `Intl`, zero deps — is genuinely differentiated and worth owning. The problem is not the idea. The problem is that the implementation currently contradicts the thesis, and the docs advertise an architecture (pre-compiled templates) that was never built.

---

## Scorecard

| Area | Grade | One-line reason |
|---|---|---|
| Core architecture | **A−** | Clean acyclic DAG, 3 layers, no cycles, `handlers`/`utils` are true leaves. Better than most libs this size. |
| Correctness | **F** | 6 defects silently corrupt data; 4 make the documented `silent` policy throw. |
| Packaging / shipping | **F** | `require()` is 100% broken; `dist/cjs` is ESM; `npm install` fails; `prepare` can't run. |
| Performance | **D** | 5.6 µs/call for a 3-segment string concat. 62% of runtime rebuilds constants. Claimed optimization doesn't exist. |
| Tests | **D** | 100% coverage, 0% contract coverage. 9 tests assert wrong behavior as correct. No test imports the public entry or `dist/`. |
| Docs | **D+** | Prose quality is genuinely high. 7 of 42 code examples fail; ~40 documented claims are false. |
| Security posture | **B−** | No ReDoS, no global prototype pollution, no secret leakage, lockfile integrity intact. Fixes are cheap. |
| Positioning | **C** | Currently a strictly worse `date-fns`. The real differentiation exists but is unclaimed. |

---

## Part 1 — Blocking defects (fix before anything else)

### B1. `require('datefmt-lite')` throws for every CommonJS consumer — **CRITICAL**

`package.json` declares `"type": "module"` and points `main` + `exports.require` at `dist/cjs/index.cjs.js`. The extension `.cjs.js` is **not** `.cjs`. Node classifies the file as ESM, `require()` triggers `loadESMFromCJS`, and the CommonJS body hits undefined `exports`.

Reproduced against a real consumer tree with the project's own build output:

```
ESM  import → "25/04/2025"                                  ✅
CJS  require → ReferenceError: exports is not defined in ES module scope   ❌
```

**Fix:** emit a genuine `.cjs` file and point `main`/`exports.require` at it.

```js
// rollup.config.js
output: { file: 'dist/cjs/index.cjs', format: 'cjs', exports: 'named' }
```
```json
"main": "dist/cjs/index.cjs",
"exports": { ".": { "types": "./types/index.d.ts", "import": "./dist/esm/index.esm.js", "require": "./dist/cjs/index.cjs" } }
```

### B2. `npm install` fails — the repo cannot be set up — **CRITICAL**

```
npm error code ERESOLVE
peer rollup@"^2.0.0" from rollup-plugin-terser@7.0.2
dev   rollup@"^3.0.0"   from the root project
```
A fresh clone cannot install. `--legacy-peer-deps` then fails again, because `prepare` shells out to `yarn`, which is not installed and is not a dependency:

```
> yarn build && yarn bundle
sh: yarn: command not found      (exit 127)
```

**This is also the single most damaging positioning failure.** A user's first action is `npm i && npm test`. Both fail. They conclude "abandoned" in under a minute.

**Fix:** replace `rollup-plugin-terser` → `@rollup/plugin-terser` (peers on rollup 2||3||4, which *also* clears the ERESOLVE); replace every `yarn` with `npm run`; move the build off `prepare` and onto `prepack`; commit a lockfile for `npm ci`.

### B3. Compact output formats throw — including `yyyyMMdd` → `yyyyMMdd` — **CRITICAL**

```js
formatDate('20250425','yyyyMMdd','yyyyMMdd')          // THREW Unknown token "yyyyMMdd"
formatDate('20250425','yyyyMMdd','ddMMyyyy')          // THREW Unknown token "ddMMyyyy"
formatDate('20250425','yyyyMMdd','HHmmss')            // THREW Unknown token "HHmmss"
formatDate('20250425','yyyyMMdd','yyyy-MM-dd')        // "2025-04-25"  ← only separator-bearing works
formatDate('20250425030709','yyyyMMddHHmmss','yyyy-MM-ddTHH:mm:ss')  // THREW Unknown token "ddTHH"
```

**Root cause:** `src/validateOutput.js:52` feeds `extractAllTokensFromFormat(sanitized)` into the token matcher. That helper (`src/utils.js:38`) returns *contiguous alphabetic runs* — `/[a-zA-Z]+/g` — so `'yyyyMMdd'` is scraped as **one** token named `yyyyMMdd`. The longest-first sort then makes that 8-char run win over `yyyy` in the alternation, and it's not a handler, so: "Unknown token."

Every separator-free format — precisely the shape an ETL pipeline produces — is unusable. ISO 8601 output is impossible. Literal words in output (`'Date: dd/MM/yyyy'`) are impossible in default mode; they only "work" in `silent` mode, which disables all checking.

Note the architecture smell: `validateOutput` and `buildTemplate` each build their own matcher from *different* inputs, so validator and renderer disagree about what a token is.

**Fix:** don't scrape raw alphabetic runs. Restrict `extraTokens` to keys the user actually supplied (`customTokens`/`overrideTokens`/`defaultTokens`) and let unrecognized runs remain literals — or greedily split runs against the known token set. ~5 lines.

### B4. `M`/`d`/`H`/`m`/`s` cannot parse 2 digits — silently produces month 0, day 41 — **CRITICAL**

`src/extractTokens.js:54` slices `token.length` characters, so `M` always consumes exactly 1 char and the second digit is eaten by the next token.

```js
formatDate('0415','Mdd','MM-dd')          // "00-41"   ← month 0, day 41, no error, default mode
formatDate('20250409','yyyyMd','yyyy-MM-dd')  // "2025-00-04"
```

An exhaustive sweep (10,000 candidate inputs per token, 270 two-digit round-trips per token) found **zero** multi-digit extractions and **zero** successful two-digit round-trips for `M`, `d`, `H`, `m`, `s`.

This contradicts `README.md:72-80` and `docs/tokens.md:5` ("can be used in both `inputFormat` and `outputFormat`").

**A date library that silently turns April into month 0 is worse than useless in ETL, where silent corruption is the primary failure mode.** This one finding disqualifies the library from its own stated use case.

**Fix:** make input width regex-driven (`M` → `/\d{1,2}/`) rather than `token.length`. Note this introduces genuine ambiguity (`MMDD` vs `Md`) — resolve by preferring the widest match that still lets the remaining format fit.

### B5. `errorPolicy: 'silent'` throws — the policy's core promise is false — **CRITICAL**

```js
formatDate('20251301','yyyyMMdd','MMM',{errorPolicy:'silent'})
// TypeError: Cannot read properties of undefined (reading 'slice')
```

`src/handlers.js:37` does `MONTH_NAMES[p.month - 1].slice(0, 3)` unguarded. Month 13 → index 12 → `undefined`. Reachable from `defaultTokens` and `overrideTokens` too. `MMMM` (`handlers.js:33`) returns bare `undefined`, which `join('')` swallows to `""` — so `MMM` crashes while `MMMM` silently vanishes. Two different failure modes for the same bug.

Also throwing in `silent`: any non-string `inputDate`/`inputFormat`/`outputFormat`, `options: null`, and `customTokens: null` — raw internal `TypeError`s, not library errors.

**Fix:** guard every handler (`MONTH_NAMES[p.month - 1] ?? ''`), validate arguments up front, and add a top-level guarantee that `silent` never throws. Ship a typed error class so callers can distinguish library errors from bugs.

### B6. Bracketed literals are broken three ways — and they corrupt neighbouring tokens — **CRITICAL**

The `[text]` feature is advertised in the README headline, the CHANGELOG ("officially supported"), and `docs/tokens.md`. All three behaviors are wrong:

```js
// (a) brackets are never stripped from the output
formatDate('20250425T101010','yyyyMMddTHHmmss','dd MMM yyyy [at] HH:mm')
// → "25 Apr 2025 [at] 10:10"     docs say "25 Apr 2025 at 10:10"

// (b) content is still tokenized, so it can't escape a token
formatDate('2025','yyyy','[yyyy]')        // → "[2025]"    (should be literal "yyyy")
formatDate('20250601','yyyyMMdd','yyyy [Q]Q',{customTokens:{Q:p=>Math.ceil(p.month/3)}})
// → "2025 [2]2"  (docs/tokens.md:53 promises "2025 Q2")

// (c) bracket removal CONCATENATES adjacent tokens into a phantom token
formatDate('20250425','yyyyMMdd','yyyy[-]MM')  // THREW Unknown token "yyyyMM"
formatDate('20250425','yyyyMMdd','yyyy[MM]dd')  // THREW Unknown token "yyyydd"
formatDate('20250425','yyyyMMdd','[a[b]c]')     // THREW Unknown token "c"
```

Root cause: `validateOutput.js:46` strips `[...]` into `sanitized` **for validation only**, while `buildTemplate` receives the **original** format. Two different strings, one pipeline. The stripping then feeds `extractAllTokensFromFormat` the joined text, creating tokens that never existed.

**Fix:** render from `sanitized` with a placeholder→literal map, and strip brackets in *both* stages (or neither). Also: nested/unbalanced brackets are undocumented and unhandled.

### B7. `MMM`/`MMMM` are output-only — round-tripping is impossible — **HIGH**

```js
formatDate('25-Apr-2025','dd-MMM-yyyy','dd/MM/yyyy')          // THREW
formatDate('25-Apr-2025','dd-MMM-yyyy','dd/MM/yyyy',{errorPolicy:'silent'})  // "25/null/2025"
formatDate('Apr','MMM','yyyy')                                 // THREW
```

`src/extractTokens.js:57` requires `/^\d+$/` on every token slice, so textual months can never be parsed. The output side fully supports them and `README.md:82` claims Unicode TR35 conformance.

Full asymmetry matrix (196 token pairs, measured): identity round-trip passes for 12 of 14 tokens; `MMM`/`MMMM` fail as input in **14 of 14** positions. `MMM` is the single most common real-world month format after ISO — its absence is conspicuous.

Note: `mm` = **minute** here, which *is* correct per Unicode TR35/CLDR. (The PHP `date()` footgun where `m`=month does not apply.) But conformance is only ~15%: TR35 mandates **single quotes** for literal text, not `[...]`; and `Q`, `D`, `E`, `w`, `L`, `a`, `S`, `z`/`Z`, `G` are all absent — including `Q`, which is the library's own flagship custom-token example.

### B8. `overrideTokens` loses to `defaultTokens` — documented precedence is inverted — **HIGH**

```js
formatDate('202504','yyyyMM','dd',{overrideTokens:{dd:'77'},defaultTokens:{dd:'99'}})
// → "99"     docs promise "77"
```

`src/validateOutput.js:56-60` writes `userOverrides[tok] = defaultTokens[tok]` into the *same* map that already holds the user's overrides, clobbering them whenever the token wasn't parsed.

This inverts the library's own documented resolution hierarchy in **four** places: `design.md:48,67`, `formatting-behavior.md:65`, `internals.md:61`, `design.md:64-68` ("Highest" priority). And `test/validateOutput.test.js:75-88` **asserts the broken behavior** — a test literally named *"should let defaultTokens override overrideTokens"*. Fixing the code requires fixing that test.

---

## Part 2 — Correctness & data integrity

| # | Severity | Finding | Evidence / Location |
|---|---|---|---|
| C1 | **HIGH** | Zero range validation. `month 13`, `day 99`, `hour 99`, `Feb 31` all pass in **both** policies. `'20250231'` → `"31/02/2025"`. | `handlers.js` has no bounds. `design.md:84` lists `enableDateValidation` as *future*. |
| C2 | **HIGH** | Input literal separators are never verified; only length-skipped. `'2025-04-25'` with format `'yyyy/MM/dd'` → success. Contradicts `design.md:17` "literal-safe". | `extractTokens.js:72-75` |
| C3 | **HIGH** | Trailing garbage silently ignored: `'20250425JUNK'` → `"25/04/2025"`. Nothing checks the input is fully consumed. | `extractTokens.js` |
| C4 | **HIGH** | BOM corrupts silently: `'\uFEFF20250425'` + `silent` → `"42/50/yyyy"`. No resynchronization possible — positional parsing never recovers. | confirmed |
| C5 | **HIGH** | Literal width drift: a literal in the *format* need not occupy the same width in the *data*. `'2025 Q1'` as `'yyyy Q'` + `silent` → `"dd/MM/2025"` — well-formed and wrong. | `extractTokens.js:74` |
| C6 | **MEDIUM** | `"null"` / `"undefined"` leak into output. Ten handlers do `String(p.field)` unguarded. `yearConverter` returning `undefined` → `"25/04/undefined"`. | `handlers.js:41,45,49,…` |
| C7 | **MEDIUM** | `errorPolicy` is never validated, and the two halves gate on *different* literals (`=== 'throw'` in `validateOutput`, `=== 'silent'` in `formatter`). Any third value — `'SILENT'`, `'slient'`, `null`, `0` — is a **half-silent** mode: validation skipped, fallbacks not installed. A typo emits `"null-MM-dd"`. | `formatter.js:34,75`; `validateOutput.js:40,98,106` |
| C8 | **MEDIUM** | `defaultTokens` is skipped when a token is *present but failed to parse* — exactly the documented use case. `'2025AB'` + `{defaultTokens:{MM:'00'}}` → `"dd/MM/2025"`. | `validateOutput.js:57` + `extractTokens.js:64` |
| C9 | **MEDIUM** | `yy` isn't zero-padded below 10: year 5 → `"5"`, not `"05"`. | `handlers.js:29` |
| C10 | **MEDIUM** | `extractTokens` pushes **failed** tokens into `tokens`, so `tokens` is documented as "successfully matched" but isn't. This is the root cause of C8 and B5. | `extractTokens.js:63-64` |
| C11 | **MEDIUM** | Literal words in an *input* format are shredded into tokens: `'yyyy day MM'` → `['yyyy',' d','d','ay ','MM']`. | `extractTokens.js:36-42` |
| C12 | **LOW** | `buildTokenRegex({})` → `()` — a zero-width regex matching at every index. `test/utils.test.js:32-35` **locks this in**. | `utils.js:17-22` |
| C13 | **LOW** | `silent`'s "return raw input" rule is skipped when the input format has no tokens (`parsedTokens.length > 0` guard). | `formatter.js:51` |
| C14 | **LOW** | `'yyy'` typo tokenizes as `yy` + literal `y` → year silently wrong (`'2025'` → `2020`). | `extractTokens.js:36-42` |
| C15 | **LOW** | Custom handler returning `undefined` silently vanishes (dropped by `join('')`). Returning non-string is not validated. | `buildTemplate.js:36-42` |

### Object-prototype confusion (all confirmed, all contained)

Handler maps are plain object literals, so `handlers[k]` and `k in handlers` walk `Object.prototype`:

```js
formatDate('20250425','yyyyMMdd','toString')
// Error: Cannot produce token "toString" — no data or default
//   ^ wrong diagnosis: "toString" is UNKNOWN, not unproducible
extractTokens('abcdefgh','toString')   // tries to parse "toString" as a data field
```

Reachable inherited names containing no token characters: `valueOf`, `__proto__`, `__lookupGetter__`.

**Credit where due — verified non-issues.** I attacked this hard and could not achieve **global `Object.prototype` pollution** across 18 attack shapes (object-literal and `JSON.parse`-derived keys, `__proto__`/`constructor`/`prototype`, all three option maps). `Object.getPrototypeOf({}) === Object.prototype` survived every one. The barrier is accidental rather than designed (`extractAllTokensFromFormat`'s `/[a-zA-Z]+/` excludes `_`, and `__proto__` is the only prototype accessor), and `Object.keys()` paths carry arbitrary strings straight past it — but nothing is exploitable today.

Fix cheaply anyway: `Object.hasOwn()` at `extractTokens.js:53`, `validateOutput.js:89`, `formatter.js:77`, and build maps with `Object.create(null)`.

---

## Part 3 — Performance: the README's central claim is false

`README.md:11` — *"Fast: Parses and formats via pre-compiled templates."* **No cache exists anywhere in `src/`.** `grep` for `cache|Map(|memo|WeakMap` returns zero hits.

Measured on Node v26 (`process.hrtime.bigint`, warm, best of 3, N=200k):

| Workload | ns/op | ops/sec |
|---|---|---|
| Identical args *(the ETL batch case)* | **5,582** | 0.18 M |
| 4,096 distinct values, same formats | 5,566 | 0.18 M |
| Rotating output formats | ~6,250 | 0.16 M |
| *reference: bare string concat* | *2.1* | *474 M* |

**The identical-args and distinct-values cases are indistinguishable — that is the diagnosis.** Nothing in the hot path depends on the data, so all cost is per-call setup recomputed identically for every row. 10M rows ≈ **57 seconds**.

### `node --cpu-prof`, 1.5M calls

```
SELF   %      function
32.12%        the escape .map() callback   @utils.js:19
24.43%        buildTokenRegex              @utils.js:16
 8.65%        validateOutput               @validateOutput.js:33
 6.12%        formatDate                   @formatter.js:29
 4.71%        RegExp escape (native)       @:0
 ...
───────────── by file ─────────────
utils.js 61.45% | validateOutput.js 11.52% | native 10.68%
```

**`utils.js` — a 39-line helper — is 61% of the library's CPU time.** `buildTokenRegex` is called **three times per `formatDate`** (`extractTokens.js:31`, `validateOutput.js:49`, `buildTemplate.js:23`), each time sorting token keys, running every key through an escape regex, and compiling a fresh `RegExp`.

Decomposition of one `buildTokenRegex` call (1167 ns):

| Step | ns | share |
|---|---|---|
| `.map(escape)` | 725.8 | **62.2%** |
| `.sort((a,b)=>b.length-a.length)` | 239.9 | 20.6% |
| `.join('|')` | 116.5 | 10.0% |
| `new RegExp(...)` | 51.0 | 4.4% |

Worth noting: **the `RegExp` compile is only 4.4%.** The real cost is the escape pass — which is *provably* constant work, since no built-in token (`yyyy`, `MMMM`, `s`) contains a single regex-reserved character. So every one of those 14 `String.replace` calls returns its input unchanged, forever. **Hoisting only the sort recovers a fifth of the win; you must cache the compiled artifact.**

### The fix, measured

Four changes, all cross-call caching:
1. `WeakMap` cache of sorted+escaped pattern body and compiled `RegExp`, keyed on handler-map identity.
2. Cache `extractTokens`' `formatParts` per `(handlers, inputFormat)`; hoist `/^\d+$/` to a module constant.
3. Hoist the `TOKEN_FIELD_MAP` group `reduce` (`validateOutput.js:71-75`) to a module constant; cache the `needed` token list per output format.
4. **Precompile a render plan per `outputFormat`** — the literal "pre-compiled template" the README already promises — and render with a concat loop.

| | original | optimized | speedup |
|---|---|---|---|
| ETL batch | 5,667 ns | **523 ns** | **10.8×** |
| 4,096 distinct values | 5,613 ns | 536 ns | 10.5× |
| Rotating formats | 6,250 ns | 802 ns | 7.8× |
| **10M-row ETL** | **57.7 s** | **5.2 s** | **11.1×** |

Attribution — the two big caches carry it; micro-fixes alone reach only 2.06×:

| Variant | ns/op |
|---|---|
| original | 5,667 |
| + memoize `buildTokenRegex` only | 3,139 (1.80×) |
| + hoisted regex/groups/Set/concat | 2,745 (2.06×) |
| + `needed` cache | 1,011 (5.60×) |
| + render-plan cache | **523 (10.8×)** |

**Differential proof of behavior preservation: 882,600 comparisons across 5 seeds — 0 mismatches**, including identical thrown error classes and messages.

One trap worth recording: my first concat-loop attempt diverged on 1,407 cases. `Array.join('')` coerces `undefined`→`''`, but `'' + undefined` yields the string `"undefined"`. Any concat-loop optimization **must** guard `out += r == null ? '' : r`.

**Cache eviction:** unbounded `Map` is a genuine leak *if* `outputFormat` comes from row data (measured 456 B/entry → 4.35 GB projected at 10M distinct formats). For the documented batch case memory is flat (0.12 MB after 1M calls). Cap at 64–256 with FIFO eviction — measured cost 0.4% on the ETL case, 117 KB worst case. Skip LRU reordering; at cap 64 a scan-through workload thrashes anyway.

### Bundle size — the "lite" claim IS earned

Measured from a real rollup+terser build:

| Artifact | minified | gzipped |
|---|---|---|
| `dist/esm/index.esm.js` | 4,509 B | **1,754 B** |
| tree-shaken to `formatDate` only | 4,088 B | 1,638 B |
| raw `src/*.js` | 17,938 B | 5,410 B |

1.75 kB min+gz is **4× smaller than dayjs** (~7 kB), **34× smaller than moment** (~60 kB), competitive with tree-shaken `date-fns`. The JSDoc blocks dominate raw source; terser strips them. **Keep the "lite" claim.** The 4 internal exports cost only 114 B gz (9%) — exposing them is a design decision, not a size one.

---

## Part 4 — Packaging, supply chain, process

| # | Severity | Finding |
|---|---|---|
| P1 | **CRITICAL** | `build:cjs` does not emit CommonJS. `babel.config.json` defines only a `test` env; `BABEL_ENV=cjs` falls through to the top-level preset with `"modules": false`. Verified: **0 of 8** output files contain CJS markers, **8 of 8** are ESM. → **80% of the tarball (36 KB of 45 KB) is dead duplicate ESM.** |
| P2 | **HIGH** | `exports` has no `types` condition → TypeScript under `node16`/`bundler` resolution gets `any` (TS7016). The top-level `"types"` field is ignored whenever `exports` exists. |
| P3 | **HIGH** | `bundle:cjs` and `bundle:esm` both invoke `rollup -c`, and the config exports **two** configs — so each runs the full build twice. |
| P4 | **MAJOR** | 39 high-severity advisories, all dev-only (`dependencies` is empty — the zero-dep claim holds). Notable: **`rollup@3.29.5` → CVE-2026-27606, arbitrary file write via path traversal → persistent RCE (CVSS 8.8)**, fixed in 3.30.0; `serialize-javascript@4.0.0` RCE; `brace-expansion@1.1.11` (5 high); `minimatch@3.1.2` (3 high ReDoS). Not directly reachable here (fixed `output.file`), but amplified by `prepare` running the whole toolchain on every install. |
| P5 | **MAJOR** | Deprecated devDeps: `rollup-plugin-terser` (→ `@rollup/plugin-terser`), `rimraf@3` (→ `^6`, or drop), `rollup@3` (→ `^4`), `@babel/*@7` (→ `^8`). Fixing this **also clears B2**. |
| P6 | **MAJOR** | `types/index.d.ts:68-73` declares `buildTokenRegex` and `extractAllTokensFromFormat`, which `src/index.js` does not export. TS consumers compile clean, get `undefined` at runtime. |
| P7 | **MEDIUM** | `files` omits `docs/` — yet the README links to all 7 doc files. **Every documentation link 404s on npm.** Add `docs` and `CHANGELOG.md`. |
| P8 | **MEDIUM** | **No CI.** No `.github/`. No lint, format, or typecheck script. No Prettier/ESLint config (contradicting `contributing.md:50`). No TypeScript devDep. |
| P9 | **MEDIUM** | `bundle:esm` produces only a non-minified Babel copy plus a terser bundle — duplicated work; `dist/esm` has both `formatter.js` (Babel ESM) and `index.esm.js` (bundled). |
| P10 | **LOW** | Missing `sideEffects: false` (blocks safe tree-shaking), `engines`, `exports["./package.json"]`. `browserslist` hardcoded in `babel.config.json` so consumers can't influence it; `caniuse-lite` is **17 months stale**. |
| P11 | **LOW** | `contributing.md:10,12,107,108` still contain `your-org/your-repo` placeholders. |

**Verified clean — do not "fix" these:**
- `yarn.lock` hygiene is good: 377 entries, **0** without integrity, **0** non-HTTPS `resolved` URLs, no git deps.
- **No secrets anywhere in history** — all 10 commits, 3 tags, both branches scanned.
- **Regex escaping is complete** — all 128 ASCII chars audited; all 15 metacharacters escaped.
- **No ReDoS possible** — all alternatives are escaped literals; nested quantifiers structurally impossible. Worst measured case: 18 ms for 20,000 alternatives.
- **The input date string is never echoed into error messages** — only token names. Correct for ETL/server logging. (But token-derived messages *are* unbounded: a 100 KB format yields a 100 KB error. Slice to 64 chars. CRLF injection is impossible — the scrape regex excludes it.)
- `LICENSE` ships correctly in the tarball.

---

## Part 5 — Tests: 100% coverage, 0% contract coverage

```
All files | %Stmts 100 | %Branch 100 | %Funcs 100 | %Lines 100
112 tests / 7 suites, all passing
```

Coverage is a **red herring here**. There is not one uncovered branch — which is precisely why it cannot see any of the 12 defects in Part 1. The gaps are entirely at the **input/contract boundary**: no test ever passes a non-string, an out-of-range value, a malformed `errorPolicy`, bracket-adjacent tokens, or a mutable export.

### Tests that lock in *wrong* behavior (must be changed, not added to)

| Test | Asserts | Reality |
|---|---|---|
| `formatter.test.js:16-18` | `'25-04-2025 [at] 10:10'` | brackets retained; contradicts `tokens.md:41` |
| `formatter.test.js:114-119` | `'[Year] MM/2025'` | same |
| `validateOutput.test.js:75-88` | test **named** *"defaultTokens override overrideTokens"* | the inverted precedence of B8 |
| `formatter.test.js:84-89` | `'05/MM/2025'` for `'2025AB05'` | cements misaligned-parse garbage as correct |
| `utils.test.js:32-35` | `buildTokenRegex({}).source === '()'` | zero-width regex matching everywhere |
| `formatter.test.js:32-39` | *"should use custom tokens to override built-ins"* | contradicts `tokens.md:61` ("built-ins are reserved") |
| `validateOutput.test.js:172-201` | `'Today is yyyy'` → words become tokens | makes natural-language formats unusable |
| `formatter.test.js:121-126` | byte-identical copy of `examples.md:113-119` | duplication |

### Structural gaps

- **0 of 7 test files import `src/index.js`** — the actual `exports` surface is untestable today, which is why P6 went unnoticed.
- **0 tests touch `dist/`** — the Babel+Rollup pipeline has never been executed in CI. Highest-risk untested surface.
- **0 tests reference the TypeScript definitions**; no `tsc`, no typecheck script. A broken `.d.ts` ships green.
- **No property-based or differential testing.** No round-trip idempotence test (`formatDate(formatDate(x,f,f),f,f) === formatDate(x,f,f)`).
- Only one table-driven block exists (`handlers.test.js:48-56`); the 13-token matrix is hand-rolled 13 times.

### Highest-value new tests

```js
// P0 — silent must never throw
expect(() => formatDate('20251301','yyyyMMdd','dd MMM yyyy',{errorPolicy:'silent'})).not.toThrow();
expect(formatDate('20250001','yyyyMMdd','MMMM',{errorPolicy:'silent'})).toBe('MMMM');   // now ''

// P0 — compact formats (the core use case)
expect(formatDate('20250425','yyyyMMdd','yyyyMMdd')).toBe('20250425');                // now THROWS
expect(formatDate('20250425030709','yyyyMMddHHmmss','yyyy-MM-ddTHH:mm:ss'))
  .toBe('2025-04-25T03:07:09');                                                        // now THROWS

// P0 — argument + option validation
expect(() => formatDate(20250425,'yyyyMMdd','dd/MM/yyyy')).toThrow(/inputDate must be a string/);
expect(() => formatDate('20250425','yyyyMMdd','dd/MM/yyyy',{errorPolicy:'slient'})).toThrow(/errorPolicy/);

// P0 — brackets
expect(formatDate('2025','yyyy','[yyyy]')).toBe('yyyy');                              // now '[2025]'
expect(formatDate('20250425','yyyyMMdd','yyyy[-]MM')).toBe('2025-04');                 // now THROWS

// P0 — variable width
expect(formatDate('0415','Mdd','MM-dd')).toBe('04-15');                               // now '00-41'

// P1 — precedence (flip the locked-in test)
expect(formatDate('202504','yyyyMM','dd',{overrideTokens:{dd:'77'},defaultTokens:{dd:'99'}})).toBe('77');

// P1 — immutability of exported state
expect(Object.isFrozen(MONTH_NAMES)).toBe(true);   // now false
// and a smoke test that MMM({month:null}) / MMM({month:13}) return a value, not throw

// P2 — the surfaces nothing covers today
import * as pub from '../src/index.js';
expect(Object.keys(pub).sort()).toEqual([...5 real exports]);   // catches phantom .d.ts exports
// + dist smoke test (both esm and cjs), + tsc --noEmit on types/
```

---

## Part 6 — Documentation: ~40 false claims

Prose quality is genuinely high — this is the best-written part of the repo. But **7 of 42 code examples fail**, and the docs describe an architecture and a contract the code doesn't implement.

Highest-impact discrepancies:

| file:line | Claim | Reality |
|---|---|---|
| `README.md:11` | "pre-compiled templates" | No cache exists; measured 5.6 µs/call |
| `README.md:16`, `CHANGELOG:28` | `[text]` "officially supported" | Brackets retained, content tokenized, neighbours corrupted (B6) |
| `README.md:72-80`, `tokens.md:5` | `M`/`d`/`H`/`m`/`s` = "1/2-digit", usable in both formats | Never parse 2 digits (B4) |
| `tokens.md:5` | `MMM`/`MMMM` work in `inputFormat` | Output-only (B7) |
| `tokens.md:53` | `'yyyy [Q]Q'` → `'2025 Q2'` | `"2025 [2]2"` |
| `README.md:109`, `api.md:27` | `silent` returns raw input / never throws | Throws in 12 of 41 silent calls |
| `design.md:48,67`, `formatting-behavior.md:65` | `overrideTokens` = "Highest" priority | Loses to `defaultTokens` (B8) |
| `internals.md:20-24` | `extractTokens` → `{raw:{yyyy:2025,...}}` | Actual: **flat**, **strings**: `{yyyy:'2025', MM:'04', ...}` — no `raw` key |
| `internals.md:34` | `validateOutput(dateParts, outputFormat, options)` | Actual: single destructured options object. As documented it returns `undefined` |
| `internals.md:12` | "5-step pipeline" | It's a **fork-join**: `extractTokens` fans out to `normalizeFields` *and* `validateOutput`; they never meet until render. That's *why* B3 exists |
| `internals.md:32` | `normalizeFields` short-circuits in silent | No short-circuit exists |
| `design.md:17` | "Parsing is greedy, literal-safe, unambiguous" | Separators never verified; `M` is neither greedy nor unambiguous (C2, B4) |
| `design.md:70` | "No global registration. You control all tokens" | `MONTH_NAMES`/`DEFAULT_HANDLERS` are exported, **unfrozen** — `MONTH_NAMES[3]='X'` rewrites April process-wide |
| `design.md:85` | "Future: TS typings" | Shipped in 2.1.0, one release earlier |
| `CHANGELOG:26` | "full Jest coverage ... all code paths" | True line-wise; 0 contract coverage |
| `contributing.md:23` | "Tests live next to their source" | All 7 are in `test/` |
| `api.md:39` vs `:80` | `defaultTokens` values `string \| function` vs "must be a string" | Self-contradictory; runtime accepts both |
| `tokens.md:61` | "Built-in token names are reserved" | `customTokens:{MM:...}` overrides them (`formatter.js:87`) |
| `README.md:82` | "follows Unicode Date Field Symbols" | ~15% of TR35; literal-escaping syntax deviates; parsing is asymmetric |

---

## Part 7 — Strategy: why this should exist, and how

### The honest diagnosis

**As shipped, `datefmt-lite` is a strictly worse `date-fns`.** `date-fns.parse('4/5/2021','M/d/yyyy')` works; this library returns `"00-41"`. The README's headline example — `yyyyMMdd` → `dd/MM/yyyy` — is the one use case `date-fns` handles in one line. **It is currently the library's worst advertisement.**

Worse, the library's *only* claimed differentiator doesn't exist in code, its `.d.ts` ships phantom exports, its own 4-stage priority table is inverted in the implementation, `npm i` fails, and `require()` throws. Each of those individually reads as "abandoned."

### The defensible position (it exists — it's just unclaimed)

The thesis in `design.md:9-14` is **right**. It just sells philosophy ("predictable", "you control everything") when it should sell **capability**. Philosophy doesn't create a category. Capability does.

**1. Zero-dependency, no-`Date`, no-`Intl` is a compliance property, not a style choice.**
Every alternative forces a `Date` into memory: `dayjs` internally constructs one; `date-fns` returns `Date` objects by design; `luxon` uses `Intl`; `date-and-time` wraps native `Date`. In hardened runtimes, edge functions, WASM sandboxes, or embedded targets, `Intl` may be absent and constructing `Date` can pull in ICU (~300 KB with full locale data). **Positioning: the only date formatter for runtimes where `Date` and `Intl` are unavailable or undesirable.** Checkable, and none of the alternatives can satisfy it. `internals.md:78` already claims it — it just isn't the headline.

**2. Fixed-width / positional record reformatting — the strongest moat, almost entirely unexploited.**
`extractTokens` is a positional slice-and-shift scanner that never builds a `Date`. That is *exactly* COBOL `PIC 9(8)` → ISO, SAP/EDIFACT segment reformatting, mainframe flat-file conversion, AS/400 date normalization. All competitors want `(string) → Date` and force you through `new Date(...)` with its implicit guessing and timezone hazards. **Positioning: the fixed-width record reformatting specialist.**

**3. Injectable custom tokens as a first-class extension point.**
Fiscal quarters, fiscal years, plant codes, period codes (`2024Q3P2`) — corporate reporting calendars that Gregorian libraries have no vocabulary for. date-fns has `locale`/`context` but no arbitrary token injection; moment has plugins. `customTokens` is a **3-line, zero-plugin, zero-dependency** extension point. **That is the moat, and it's under-advertised.**

**4. Data that isn't a date.** Julian day numbers, fiscal year labels, batch IDs, plant/shift codes. Every alternative insists on producing a `Date`. A library that says "I never validate, never construct, never assume — I rearrange strings" is structurally *correct* for this. `design.md:74-79` is an asset if marketed as "handles data that isn't a date."

### Recommended positioning

> **`datefmt-lite` — fixed-width date reformatting for pipelines and constrained runtimes.**
> Zero dependencies, no `Date`, no `Intl`. 1.7 kB gzipped.
> Built for COBOL `PIC 9(8)` records, ETL batches, and edge/WASM targets.
> Need fiscal quarters? Add a token in three lines.

**Drop `yyyyMMdd → dd/MM/yyyy` from the README headline** — it invites the `date-fns` comparison and loses. Lead with a fixed-width record example and the fiscal-token example.

### If you don't want that positioning

Then be honest about it: the library is a ~450-line convenience wrapper whose honest scope is "narrow, tiny, no-Date string reformatting." In that case, cut the 4 internal exports, cut the `MMM`/`MMMM` tokens (output-only is a trap), fix the blockers, and let it be a good small tool — not a competitor to `date-fns`. **What you must not do is sit between the two.** The current position — advertising `date-fns` features, delivering a subset, with broken docs — is the worst of both.

---

## Part 8 — Execution plan

### Phase 0 — Unblock reality (½ day, no behavior change)

Everything here is packaging, tooling, or process. Zero API risk.

- [ ] Fix `require()`: emit `dist/cjs/index.cjs`, update `main` + `exports.require`, add `exports.types` *(B1)*
- [ ] Fix install: `@rollup/plugin-terser` replaces `rollup-plugin-terser`; `yarn` → `npm run` everywhere; build moves `prepare` → `prepack`; commit a lockfile *(B2, P5)*
- [ ] Add `env.cjs`/`env.esm` to `babel.config.json` with `modules: "commonjs"` for cjs, or drop the Babel step and keep only Rollup bundles *(P1)*
- [ ] Remove `buildTokenRegex` + `extractAllTokensFromFormat` from `types/index.d.ts` *(P6)*
- [ ] `rollup -c` once, not per-format; make `build` and `bundle` coherent *(P3)*
- [ ] Add `docs` + `CHANGELOG.md` to `files` *(P7)*
- [ ] Add `.github/workflows/ci.yml`: install → test → build → `tsc --noEmit` → **dist smoke test (both esm and cjs)**
- [ ] Add `sideEffects: false`, `engines`, and real `lint`/`format`/`typecheck` scripts
- [ ] Freeze the placeholder URLs in `contributing.md`

### Phase 1 — Make the core correct (2–3 days)

- [ ] **B3:** fix compact output formats — restrict `extraTokens` to user-supplied keys; make validator and renderer share one matcher *(the single highest-value correctness fix)*
- [ ] **B5:** guard every handler against null/out-of-range; validate arguments; add a typed `DateFormatError`; guarantee `silent` never throws
- [ ] **B4:** make `M`/`d`/`H`/`m`/`s` variable-width in **input** (regex width, not `token.length`); resolve the `MMDD` vs `Md` ambiguity by widest-fit
- [ ] **B6:** implement bracket literals properly — render from `sanitized` with a placeholder→literal map, strip in both stages; handle nested/unbalanced
- [ ] **B8:** fix precedence — defaults must not clobber explicit overrides; **update `validateOutput.test.js:75-88`**, which asserts the bug
- [ ] **C7:** validate `errorPolicy` against an enum and throw on anything else
- [ ] **C8/C10:** only push *successfully matched* tokens into `tokens`; let `defaultTokens` apply to failed parses
- [ ] Prototype-chain: `Object.hasOwn()` at the three lookup sites; `Object.create(null)` for handler maps
- [ ] `Object.freeze` `MONTH_NAMES`, `TOKEN_REGISTRY`, `DEFAULT_HANDLERS`, `TOKEN_FIELD_MAP`
- [ ] Truncate interpolated token names in error messages to 64 chars

### Phase 2 — Close the honest gaps (2–3 days)

- [ ] **B7:** implement `MMM`/`MMMM` parsing (a name→number resolver in `extractTokens`) — or, if not, remove them from the README and say "output-only" loudly
- [ ] **C2/C3/C5:** verify input literals actually match; detect trailing garbage; stop the pointer drift on BOM/width mismatch. **This is what makes `silent` trustworthy for ETL.**
- [ ] **C1:** add opt-in `validate: 'strict' | 'lenient' | 'off'` (range + real-calendar day check). `design.md:84` already planned this — ship it.
- [ ] **C6:** no `"null"`/`"undefined"` in output; validate `yearConverter`'s return (`Number.isInteger`, plausible range)
- [ ] **C9:** pad `yy`
- [ ] **C12:** `buildTokenRegex({})` → `(?!)`; update the test that locks in `()`
- [ ] Move the four internals behind a `datefmt-lite/internal` subpath, or document them properly (their current docs have the wrong shapes — see Part 6)

### Phase 3 — Make the README true (1–2 days)

- [ ] **Cache the compiled regex + precompile the render plan** — 10.8× measured. Do this *last among the code work*: fixing B3 changes which regexes are needed, and a cache would have masked that bug during testing.
- [ ] Hoist `/^\d+$/`, the `TOKEN_FIELD_MAP` group reduce, and the redundant `{tokens, ...raw}` re-spread; render with a guarded concat loop
- [ ] Cap the format-keyed caches at 64–256 with FIFO eviction; `WeakMap` for the handler-keyed ones
- [ ] Land a differential harness in CI: seeded PRNG over format/date combinations, asserting byte-identical output *and* identical thrown errors against a frozen baseline
- [ ] Commit a `benchmark.js` so "Fast" becomes a claim anyone can check

### Phase 4 — Correct the docs (1 day, parallel with Phase 1)

- [ ] Fix the 7 failing examples and the ~40 false claims in Part 6 — especially `internals.md:20-24,34` (wrong shapes and arity) and the inverted precedence table
- [ ] Reword `README.md:82`: *"the 14 implemented symbols use their TR35 meanings for output formatting; this is a deliberately partial subset and is not a TR35-conformant parser"*
- [ ] Rewrite the headline around fixed-width/COBOL + non-`Date` runtimes + injected fiscal tokens; drop the `date-fns`-inviting example
- [ ] Replace every "Future Enhancements" item you've shipped (`design.md:85`) with reality

---

## What I would not do

- **Don't add date math.** It's the one thing every competitor does well and the one thing this library should *not* do. `design.md:74-79` is correct — protect it.
- **Don't chase `date-fns` feature parity.** You'll lose; it's a 3-person-year project. Compete on the axis where a 450-line library can actually win: fixed-width positional data in constrained runtimes.
- **Don't add dependencies.** The zero-dep property *is* the moat. It costs 1.75 kB gzipped and survives audit.
- **Don't ship `MMM`/`MMMM` as output-only without saying so loudly.** A documented token that throws when used as documented is worse than an absent one.

---

## Appendix — verified non-issues

Recorded so they aren't "fixed" later:

- No global `Object.prototype` pollution — 18 attack shapes tested, all contained
- No catastrophic backtracking — all regex alternatives are escaped literals; worst case 18 ms
- Regex escaping is complete — all 15 metacharacters covered; all 128 ASCII chars audited
- Input date strings are never echoed into error messages (only token names) — correct for logging
- `yarn.lock` integrity: 377 entries, 0 missing `integrity`, 0 non-HTTPS URLs, no git deps
- No secrets in any commit, tag, or branch
- `LICENSE` ships correctly in the tarball
- Architecture is a clean acyclic DAG with correct dependency direction — better than most libraries this size
- The 4 internal exports cost only 114 B gz — exposing them is a design choice, not a size problem
- 112 tests pass; coverage is genuinely 100% line/branch (it just measures the wrong thing)
- `require()` failure is purely the filename + `"type": "module"` interaction — the bundle itself is valid CJS