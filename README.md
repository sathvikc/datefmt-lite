# datefmt-lite

**Fixed-width date reformatting for data pipelines and constrained runtimes.**

`datefmt-lite` converts a date **string** from one format to another. It never
constructs a `Date`, never touches `Intl`, and never applies a timezone. Whatever
the input format can express is rearranged into whatever the output format asks
for — nothing more, nothing assumed.

- **4.9 kB** gzipped, **zero dependencies**, no `Date` and no `Intl`
- Compact (`yyyyMMdd`), ISO 8601, and human-readable formats all work
- Verifies the input actually matched, so bad records fail loudly instead of
  silently becoming wrong dates
- Fiscal quarters, plant codes and period codes in three lines, via `customTokens`

---

## Installation

```bash
npm install datefmt-lite
```

Works with both ESM and CommonJS:

```js
import { formatDate } from 'datefmt-lite'; // ESM
const { formatDate } = require('datefmt-lite'); // CommonJS
```

---

## Usage

```js
import { formatDate } from 'datefmt-lite';

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd');
// → '20250425'          compact formats round-trip

formatDate('20250425', 'yyyyMMdd', 'Day dd of MMMM');
// → 'Day 25 of April'   literal text just works

formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'        textual months parse in both directions
```

### Why this exists

Most date libraries want to hand you a `Date`. That is the wrong shape for a
pipeline reformatting a fixed-width column, and it is unavailable entirely in
some runtimes.

| If you need…                                 | Use                            |
| -------------------------------------------- | ------------------------------ |
| `(string) → Date`, timezone math, locale     | `date-fns`, `dayjs`, `luxon`   |
| A `Date` in a runtime without `Intl`         | this library                   |
| COBOL `PIC 9(8)` → ISO reformatting          | this library                   |
| Fiscal quarters / non-Gregorian period codes | this library + `customTokens`  |
| Date arithmetic                              | anything else — this does none |

---

## When to Use This Library

- You control both the input and output formats
- The data is positional and fixed-width rather than natural language
- You are moving rows in a pipeline and cannot afford a silently wrong date
- `Date` or `Intl` is unavailable, undesirable, or pulls in ICU

Not a fit if you need date arithmetic, timezones, or localization. That is
deliberate: `datefmt-lite` rearranges strings and makes no calendar
assumptions.

---

## Supported Tokens

| Token  | Meaning            | Output  | Input width         |
| ------ | ------------------ | ------- | ------------------- |
| `yyyy` | full year          | `2025`  | exactly 4 digits    |
| `yy`   | 2-digit year       | `25`    | exactly 2 digits    |
| `MMMM` | full month name    | `April` | full name or abbrev |
| `MMM`  | short month        | `Apr`   | full name or abbrev |
| `MM`   | 2-digit month      | `04`    | exactly 2 digits    |
| `M`    | 1-or-2-digit month | `4`     | 1 or 2 digits       |
| `dd`   | 2-digit day        | `09`    | exactly 2 digits    |
| `d`    | 1-or-2-digit day   | `9`     | 1 or 2 digits       |
| `HH`   | 2-digit hour       | `03`    | exactly 2 digits    |
| `H`    | 1-or-2-digit hour  | `3`     | 1 or 2 digits       |
| `mm`   | 2-digit minute     | `07`    | exactly 2 digits    |
| `m`    | 1-or-2-digit min   | `7`     | 1 or 2 digits       |
| `ss`   | 2-digit second     | `09`    | exactly 2 digits    |
| `s`    | 1-or-2-digit sec   | `9`     | 1 or 2 digits       |

The 14 implemented symbols follow their
[Unicode TR35](https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table)
meanings for output. This is a deliberately partial subset, **not** a
TR35-conformant parser: `Q`, `D`, `E`, `w`, `L`, `S` and the zone tokens are not
implemented. `mm` is minutes, as in TR35 (the PHP `date()` convention where `m`
means month does not apply here).

Note that output and input widths differ. `d` renders a single digit when
appropriate, but on input it reads **one or two** digits, so `Mdd` correctly
parses `0415` as 15 April.

➡️ See [`docs/tokens.md`](./docs/tokens.md).

---

## Options

```js
formatDate(inputDate, inputFormat, outputFormat, {
  errorPolicy: 'throw',
  validate: 'off',
  verifyLiterals: true,
  strictTokens: false,
  yearConverter: (yy) => 2000 + yy,
  customTokens: { Q: (parts) => 'Q' + Math.ceil(parts.month / 3) },
  overrideTokens: { dd: '01' },
  defaultTokens: { MM: '00' },
});
```

| Option           | Default   | Purpose                                                     |
| ---------------- | --------- | ----------------------------------------------------------- |
| `errorPolicy`    | `'throw'` | `'silent'` never throws on bad data                         |
| `validate`       | `'off'`   | Range checking: `'lenient'` clamps, `'strict'` rejects      |
| `verifyLiterals` | `true`    | Verify literal separators in the input format               |
| `strictTokens`   | `false`   | Reject unrecognised words in the output format              |
| `yearConverter`  | —         | Expands `yy` to a full year; must return a non-negative int |
| `customTokens`   | `{}`      | Extra tokens, usable in input **and** output formats        |
| `overrideTokens` | `{}`      | Fixed values that win over everything                       |
| `defaultTokens`  | `{}`      | Used when no value for the underlying field was parsed      |

### errorPolicy: `'throw' | 'silent'`

`'throw'` (default) raises a `DateFormatError` with a machine-readable `code`.

`'silent'` never throws on **bad data**: unparseable input comes back unchanged,
and an unproducible token renders as its own name.

```js
formatDate('not-a-date', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → 'not-a-date'   returned untouched, not a wrong date

formatDate('2025', 'yyyy', 'MM/dd/yyyy', { errorPolicy: 'silent' });
// → 'MM/dd/2025'   literal fallback marks the gap
```

Silent mode still throws on **caller mistakes** — a non-string argument, an
invalid `errorPolicy`, a `yearConverter` returning a non-integer. Those are bugs
in the calling code, not bad data, and hiding them would be worse than failing.

### validate: `'off' | 'lenient' | 'strict'`

Off by default, because the library's contract is to make no assumptions. Turn it
on when a pipeline needs data-quality guarantees.

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws: month 13 is out of range (expected 1-12)

formatDate('20250229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws: 2025 is not a leap year
formatDate('20240229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2024'
```

### Precedence

When several sources could supply a token:

1. `overrideTokens`
2. `customTokens`
3. value parsed from the input
4. `defaultTokens`
5. literal token name (silent mode)

`defaultTokens` applies when the **field** has no value, not when a specific
token name is missing — so a month parsed as `M` is not overwritten by a
`defaultTokens.MM`.

### Custom tokens

Three lines, no plugins, no dependencies. Read the parsed fields off `parts`:

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => String(Math.ceil(parts.month / 3)) },
});
// → '2025-Q2'
```

Custom tokens work in `inputFormat` too, and their parsed value is available as
`parts[tokenName]`.

### Bracketed literals

`[text]` renders `text` verbatim, with the brackets removed and the contents
never treated as tokens:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy [at] MM'); // → '2025 at 04'
formatDate('2025', 'yyyy', '[yyyy]'); // → 'yyyy'
```

Literal words and separators work without brackets too. `strictTokens` is for
catching typos, and it requires bracketing any literal word:

```js
formatDate('20250425', 'yyyyMMdd', 'ISO yyyy', { strictTokens: true });
// throws: Unknown token "ISO"
```

---

## Robustness

The library refuses to guess. Each of these is a `DateFormatError` under the
default policy, which matters more than it sounds in a pipeline:

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH — the separator did not match, so every later field
// would have been read from the wrong offset

formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH — trailing content is never ignored

formatDate('\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH — a BOM shifts the whole record
```

Every error carries a `code` (`INPUT_MISMATCH`, `UNPRODUCIBLE_TOKEN`,
`OUT_OF_RANGE`, `INVALID_YEAR`, …) plus the offending `token` and `field`, so
you can branch on the cause rather than matching message text.

---

## Scripts

```bash
npm test              # run the test suite
npm run test:coverage # with coverage
npm run lint          # eslint
npm run typecheck     # tsc against the published types
npm run build         # build dist/ (ESM + CJS)
npm run verify        # everything above, plus dist verification
npm run benchmark     # ns/op per workload and bundle size
```

CI runs the full chain on Node 20, 22 and 24, and verifies the built bundles
behave identically to the sources.

---

## Docs

- [`docs/api.md`](./docs/api.md) — full `formatDate` signature, options and errors
- [`docs/tokens.md`](./docs/tokens.md) — token table, input/output widths, matching rules
- [`docs/examples.md`](./docs/examples.md) — worked examples and edge cases
- [`docs/formatting-behavior.md`](./docs/formatting-behavior.md) — precedence and fallback matrix
- [`docs/internals.md`](./docs/internals.md) — pipeline and module map for contributors
- [`docs/contributing.md`](./docs/contributing.md) — development setup
- [`docs/design.md`](./docs/design.md) — philosophy, trade-offs and roadmap

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## License

MIT © 2025 Sathvik C
