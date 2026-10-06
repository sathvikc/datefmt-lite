# Contributing

`datefmt-lite` is a string-to-string date reformatting library with zero runtime
dependencies. It never constructs a `Date`, never touches `Intl`, and never
applies a timezone. Contributions are welcome; the constraints below are what
keep it small enough to justify that.

- Repository: <https://github.com/sathvikc/datefmt-lite>
- Issues: <https://github.com/sathvikc/datefmt-lite/issues>
- Pull requests: <https://github.com/sathvikc/datefmt-lite/pulls>

---

## Prerequisites

| Requirement | Version         | Notes                                                         |
| ----------- | --------------- | ------------------------------------------------------------- |
| Node        | **>=20**        | Required by `devEngines` for the toolchain and CI             |
| npm         | ships with Node | The project is npm-only; `package-lock.json` is authoritative |

The **published** package declares `engines.node: ">=18"`, and the bundles are
compiled for `> 0.5%, last 2 versions, not dead, node >= 18`. So Node 18 is
enough to _consume_ the library, but Node 20 or newer is required to _develop_
it.

There is deliberately **no `prepare` script**, so `npm install` in a fresh clone
does not try to build anything and cannot fail on a missing toolchain. The build
runs from `prepack`, which npm invokes on `npm pack` and `npm publish`.

---

## Setup

```bash
git clone https://github.com/sathvikc/datefmt-lite.git
cd datefmt-lite
npm ci
```

Use `npm ci`, not `npm install`: it installs exactly the tree in
`package-lock.json` and is what CI runs. `npm ci` does not build — run
`npm run build` when you need `dist/`.

Confirm the checkout is healthy before you change anything:

```bash
npm test
npm run build
npm run test:dist
```

---

## Scripts

Every command below is a script in `package.json`. Nothing else is wired up.

| Script                  | Command                                        | What it does                                                                          |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run clean`         | `rimraf dist`                                  | Removes `dist/`. `build` calls it first.                                              |
| `npm run build`         | `npm run clean && rollup -c`                   | Builds `dist/cjs/index.cjs` and `dist/esm/index.esm.js` with Rollup + Babel + terser. |
| `npm test`              | `jest --config jest.config.cjs`                | Runs the 14 test suites in `test/` (~550 tests, well under a second).                 |
| `npm run test:coverage` | `jest --config jest.config.cjs --coverage`     | Same suite with a coverage report over `src/**/*.js`.                                 |
| `npm run test:dist`     | `node scripts/verify-dist.mjs`                 | Requires a build, then 14 assertions about the bundles and the `exports` map.         |
| `npm run typecheck`     | `tsc --noEmit -p tsconfig.json`                | Type-checks `types/**/*.ts` — the declarations consumers actually see.                |
| `npm run lint`          | `eslint .`                                     | ESLint 9 flat config (`eslint.config.js`).                                            |
| `npm run lint:fix`      | `eslint . --fix`                               | Applies the safe autofixes.                                                           |
| `npm run format`        | `prettier --write .`                           | Rewrites every file to the `.prettierrc` style.                                       |
| `npm run format:check`  | `prettier --check .`                           | Fails if anything is unformatted.                                                     |
| `npm run benchmark`     | `node scripts/benchmark.mjs`                   | ns/op per workload plus raw and gzipped bundle size.                                  |
| `npm run verify`        | the chain below                                | Everything CI runs, locally, in order.                                                |
| `npm run prepack`       | `npm run build`                                | Lifecycle hook npm runs on `npm pack` and `npm publish`.                              |
| `prepublishOnly`        | `format:check` + `lint` + `typecheck` + `test` | Lifecycle hook npm runs on `npm publish` only.                                        |

`npm run verify` expands to:

```bash
npm run format:check && npm run lint && npm run typecheck && npm run test \
  && npm run build && npm run test:dist && npm run benchmark
```

Run it before every push. It is the same chain CI executes on Node 20, 22 and 24,
followed by an `npm pack --dry-run` job.

---

## Project structure

The library is plain ESM JavaScript. Tests live in `test/`, **not** beside the
sources they cover, and `jest.config.cjs` only matches `**/test/**/*.test.js`.

```
src/
  index.js          the only module that re-exports; defines the public surface
  formatter.js      formatDate: validates options, builds the token table, drives the pipeline
  extractTokens.js  input parser: reads raw values against the tokenized input format
  normalizeFields.js  raw token values -> semantic fields; validates yearConverter output
  validateFields.js  opt-in range checking (validate: 'lenient' | 'strict') and isRealDate
  validateOutput.js  resolves the precedence chain into a handler table; enforces strictTokens
  buildTemplate.js   compiles an output format into a render plan and renders it
  handlers.js        TOKEN_REGISTRY and every table derived from it
  utils.js           the shared tokenizer primitives, plus nullProtoMap/hasOwn
  errors.js          ERROR_CODES, DateFormatError, unproducibleToken, truncateToken
types/
  index.d.ts        public declarations; drift-checked against src/index.js by the test suite
scripts/
  verify-dist.mjs   bundle, exports-map and behaviour verification
  benchmark.mjs     throughput and bundle-size measurement
test/               all 14 test suites
docs/               api.md, tokens.md, examples.md, formatting-behavior.md,
                    internals.md, contributing.md, design.md
```

### `src/` in pipeline order

`formatDate` runs five stages, and the modules are named after them:

1. `src/extractTokens.js` — walks the tokenized `inputFormat` and reads raw
   strings. Verifies literal separators against the input rather than skipping
   them by width, and reports a `corrupt` token distinctly from an `absent` one.
2. `src/normalizeFields.js` — sources a value for each semantic field, preferring
   the widest token that captured one; validates whatever `yearConverter` returns.
   Also exports `hasField`.
3. `src/validateFields.js` — the opt-in range check. Off by default, because the
   library's contract is to make no assumptions. Also exports `isRealDate`.
4. `src/validateOutput.js` — walks the tokenized `outputFormat` and builds the
   handler table: `overrideTokens` > `customTokens` > parsed value >
   `defaultTokens` > literal fallback. Rejects unknown words under
   `strictTokens`.
5. `src/buildTemplate.js` — compiles the output format into a plan of
   `{type:'text'|'token'}` steps and renders it. `escaped` segments fold into
   `text`, so `[at]` renders as `at`.

Supporting modules:

| File               | Responsibility                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/index.js`     | The single re-export surface. Nothing else exports anything; this is what consumers and bundlers see.            |
| `src/handlers.js`  | `TOKEN_REGISTRY` plus `MONTH_NAMES`, `MONTH_ABBREV`, `parseMonthName` and every table derived from the registry. |
| `src/utils.js`     | `tokenizeFormat` and its helpers, used by **both** the parser and the renderer so the two can never disagree.    |
| `src/errors.js`    | One error class with a `code`, the frozen `ERROR_CODES` map, and message truncation.                             |
| `src/formatter.js` | Option validation, reserved-token rejection, and the orchestration of the five stages.                           |

`src/index.js` and `src/handlers.js` are the two places where an undeclared
dependency would sneak in. `rollup.config.js` throws on `UNRESOLVED_IMPORT`
precisely so an accidental bare import fails the build rather than shipping.

### `test/`

14 suites, ~550 tests, ~0.7 s wall clock:

| Suite                          | Covers                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `test/formatter.test.js`       | The `formatDate` contract end to end: options, literals, years, precedence, silent mode, `strictTokens`, `verifyLiterals`, determinism. |
| `test/utils.test.js`           | `escapeRegex`, `buildTokenPattern`, `buildTokenMatcher`, `tokenizeFormat`, `collectTokens`, `looksLikeToken`, `nullProtoMap`, `hasOwn`. |
| `test/handlers.test.js`        | Month tables, `parseMonthName`, registry metadata, and that the derived tables really are derived.                                      |
| `test/extractTokens.test.js`   | Argument validation, numeric and variable-width reads, textual months, brackets, literal verification, custom handler tables.           |
| `test/normalizeFields.test.js` | Field extraction and preference order, year handling, `hasField`.                                                                       |
| `test/validateOutput.test.js`  | Producible tokens, precedence, silent-mode fallbacks, unknown-token rejection, table shape.                                             |
| `test/validateFields.test.js`  | Range checking in both modes and `isRealDate`.                                                                                          |
| `test/buildTemplate.test.js`   | Render-plan compilation and rendering, including the missing-value fallback.                                                            |
| `test/errors.test.js`          | `ERROR_CODES` contents and the `DateFormatError` shape.                                                                                 |
| `test/roundtrip.test.js`       | Seeded differential fuzzing over the whole token matrix: round-trips, idempotence, determinism.                                         |
| `test/publicApi.test.js`       | The runtime export surface against `types/index.d.ts`, catching declaration drift in both directions.                                   |
| `test/security.test.js`        | Prototype pollution, `Object.prototype` key confusion, ReDoS, error-message hygiene, resource limits.                                   |
| `test/docs.test.js`            | Executes every example documented in `README.md` and `docs/`, plus doc-hygiene rules.                                                   |
| `test/dist.test.js`            | The built bundles against `src/`, `package.json` manifest integrity, and exported state immutability. Skipped when `dist/` is absent.   |

---

## Adding a built-in token

A new token belongs in `src/handlers.js` and nowhere else.

Edit **only** `TOKEN_REGISTRY`. Every other table is derived from it at module
evaluation time, so nothing else needs touching:

| Export             | Derived how                                            |
| ------------------ | ------------------------------------------------------ |
| `DEFAULT_HANDLERS` | `field.handler` for every entry                        |
| `TOKEN_FIELD_MAP`  | `field` for every entry                                |
| `FIELD_GROUPS`     | entries bucketed by `field`                            |
| `FIELD_PREFERENCE` | `FIELD_GROUPS` re-sorted longest-token-first per field |
| `BUILTIN_TOKENS`   | `Object.keys(TOKEN_REGISTRY)`                          |

A registry entry looks like this:

```js
export const TOKEN_REGISTRY = Object.freeze({
  // ...
  Q: {
    field: 'month',
    width: 1,
    variable: false,
    handler: (p) =>
      isUsable(p.month) && p.month >= 1 && p.month <= 12
        ? String(Math.ceil(p.month / 3))
        : null,
  },
});
```

Rules that matter:

- `field` must be one of the six semantic fields (`year`, `month`, `day`,
  `hour`, `minute`, `second`). Reusing an existing field is what makes the token
  substitutable for it: any sibling in `FIELD_GROUPS` can then supply the value.
- `width` is the **maximum** number of characters read from the input. Set
  `variable: true` for tokens that should accept one _or_ two digits.
- `handler` returns a string, or `null` when the field holds nothing usable.
  **Handlers must never throw.** Returning `null` is how `errorPolicy: 'silent'`
  stays honest.
- Add `parse` and `text: true` only for tokens read from words rather than
  digits. `parseMonthText` in the same file is the reference: no trimming, so
  the matched text is exactly the characters consumed and a match never eats a
  trailing separator.

Then add coverage. `test/handlers.test.js` checks the registry and the derived
tables; `test/roundtrip.test.js` walks `BUILTIN_TOKENS` automatically, so a new
token is round-trip tested for free once it is in the registry. Add a case to
`test/formatter.test.js` for anything user-visible, and update
`README.md` and `docs/tokens.md`.

Note that adding a token needs **no** change to `types/index.d.ts` — the registry
is declared as `Record<string, TokenSpec>`. Adding a new **export** does: the
name must be added to `src/index.js`, `test/publicApi.test.js` and the
`PUBLIC_API` list in `scripts/verify-dist.mjs`, or both will fail.

---

## Adding a custom token without touching core

Almost nothing needs a fork. `customTokens` takes a name and a renderer, and the
name works in both `inputFormat` and `outputFormat`:

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => String(Math.ceil(parts.month / 3)) },
});
// → '2025-Q2'
```

The custom token is merged into the registry for the duration of the call:

- `field` is the token name itself, so what it parsed is readable as
  `dateParts.Q`.
- `width` is the name's length, so it occupies that many characters in the input
- The handler may return `null` to trigger the normal fallback chain.

Names inherited from `Object.prototype` — `__proto__`, `constructor`,
`prototype`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`,
`propertyIsEnumerable`, `toLocaleString` — are rejected with a
`RESERVED_TOKEN` error. This is deliberate: a handler map is looked up by key,
and an ambiguous key would resolve against the prototype chain rather than
failing loudly.

If you need a fixed value rather than a function, use `overrideTokens` (wins over
everything) or `defaultTokens` (used only when the field was never parsed).

---

## Coding standards

Prettier and ESLint are both enforced in CI, so run them before you push:

```bash
npm run format:check
npm run lint
```

- **Prettier 3** with `.prettierrc`: single quotes, semicolons, trailing commas
  (`all`), 80-column width, always-parenthesised arrow params, LF endings.
  `.prettierignore` excludes `dist/`, `coverage/`, `node_modules/`,
  `package-lock.json`, `CHANGELOG.md` and `REVIEW.md`.
- **ESLint 9** flat config (`eslint.config.js`): `js.configs.recommended` plus
  `no-unused-vars` (ignore `_`-prefixed args), `eqeqeq` (except `== null`),
  `prefer-const` and `no-var`. Node globals everywhere, Jest globals in `test/`,
  CommonJS source type for `jest.config.cjs`.
- **TypeScript 5** type-checks `types/index.d.ts` under `strict`, with
  `noUnusedLocals` and `noUnusedParameters`. `skipLibCheck` is off.
- **Zero runtime dependencies.** There is no `dependencies` block in
  `package.json`, and `rollup.config.js` throws on `UNRESOLVED_IMPORT` so an
  accidental bare import fails the build. Everything else is a devDependency.
- **Size is a budget, not an aspiration.** `scripts/verify-dist.mjs` fails if
  either bundle exceeds 5120 bytes gzipped. The current bundles sit at roughly
  4.7 kB gzipped, so a dependency cannot creep in without failing CI.
- Keep functions small and pure where practical. JSDoc every exported symbol:
  the declarations in `types/index.d.ts` and the docs are expected to agree with
  the runtime.

Then run the full gate:

```bash
npm run verify
```

---

## Running the tests

```bash
npm test                                  # whole suite
npm test -- test/formatter.test.js        # one file
npm test -- -t 'silent mode'              # one test name
npm run test:coverage                     # with a coverage report
```

Jest 29 with `babel-jest`. `babel.config.json` compiles to CommonJS only under
`BABEL_ENV=test`, targeting the running Node; the top-level preset keeps
`modules: false` so Rollup can do the tree-shaking. `testEnvironment` is `node`
and `collectCoverageFrom` is `src/**/*.js`.

Because the suite is fast, add tests rather than skipping them. New behaviour
needs a test that fails without the change.

---

## Coverage

`npm run test:coverage` reports over `src/**/*.js` with `text` and `text-summary`
reporters. Current figures: **97.4% statements, 93.0% branches, 98.5% functions,
98.9% lines** (406/417, 344/370, 64/65, 370/374).

Two honest caveats:

- `src/index.js` shows 0% because it is pure re-export and Jest instruments the
  barrel, not the modules behind it. The export surface is not untested —
  `test/publicApi.test.js` enumerates it and cross-checks it against the
  declarations.
- Coverage measures execution, not contract. The defects that motivated 3.0.0
  were all reachable through code that was already 100% covered, so a green
  coverage number is not evidence of correctness. `test/roundtrip.test.js`
  (seeded differential fuzzing), `test/security.test.js` and `test/publicApi.test.js`
  exist because of that.

`test/dist.test.js` skips itself when `dist/` has not been built. Run
`npm run build` before `npm test` if you want those assertions.

---

## Dist verification

`npm run test:dist` runs `scripts/verify-dist.mjs`, which installs the built
package into a temporary `node_modules` and probes it **by name**, so the
`exports` map is genuinely exercised rather than bypassed by a file path. It
makes 14 assertions:

- The `exports` map is well formed, every target exists on disk, and `types`
  is listed first so it wins resolution
- `require('datefmt-lite')` and `import 'datefmt-lite'` both resolve and both
  expose all 26 public names
- The bundles reproduce six documented behaviours **from `src/`**, not merely the
  export names, and reject an impossible date the same way `src/` does
- Each bundle is the right module format and carries none of the other format's
  syntax
- Both bundles are self-contained, containing no external imports
- `dist/` holds bundles only, no stray transpiler output
- Both bundles stay under the 5120-byte gzip budget

This step exists because a stale or misconfigured `dist/` passes every other
gate. Before 3.0.0 the CommonJS entry point was emitted as `.cjs.js` inside a
`"type": "module"` package, so `require()` failed for every CommonJS consumer
while `import` and the unit tests were both green. A bundle has to be installed
and loaded the way a consumer loads it, or nothing catches that.

`dist/` is gitignored. It is built on demand, and by `prepack` at publish time.

---

## Pull request checklist

- [ ] `npm run verify` passes locally
- [ ] `npm ci` in a clean clone succeeds — a contributor must not need anything
      you did not add to `devDependencies`
- [ ] New behaviour has a test that fails without the change
- [ ] `README.md` and `docs/tokens.md` are updated; every example in them is
      executed by `test/docs.test.js`
- [ ] No runtime dependency is introduced, and the bundles stay inside the
      5120-byte gzip budget
- [ ] A new export is added to `src/index.js`, `types/index.d.ts`,
      `test/publicApi.test.js` **and** the `PUBLIC_API` list in
      `scripts/verify-dist.mjs`
- [ ] A breaking change is called out in `CHANGELOG.md` under `[Unreleased]`,
      with what a consumer must change
- [ ] Commit messages follow the [Angular convention](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#-commit-message-format):
      `type: short summary`, where `type` is one of `feat`, `fix`, `refactor`,
      `test`, `docs`, `chore`

Report bugs at <https://github.com/sathvikc/datefmt-lite/issues>. A useful
report includes the input string, both formats, the options, and whether the
value is a real record — the library refuses to guess, so the exact shapes are
what matter.

---

## License

MIT © 2025 Sathvik C. Contributions are accepted under the same terms.
