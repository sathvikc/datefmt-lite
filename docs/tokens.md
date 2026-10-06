# Tokens

`datefmt-lite` implements **14 tokens**. Each one names a semantic field and a
width, and can be used in `inputFormat`, `outputFormat`, or both. Everything
else in a format is literal text.

| Read this                                                 | For                                            |
| --------------------------------------------------------- | ---------------------------------------------- |
| [`docs/api.md`](./api.md)                                 | signature, options, precedence and error codes |
| [`docs/examples.md`](./examples.md)                       | worked examples and edge cases                 |
| [`docs/formatting-behavior.md`](./formatting-behavior.md) | precedence and fallback matrix                 |
| [`README.md`](../README.md)                               | overview and installation                      |

---

## The 14 tokens

Output values below are for the input `'20250409030709'` read as
`yyyyMMddHHmmss` — 9 April 2025, 03:07:09.

| Token  | Field  | Output  | Input width                        | Notes                                                               |
| ------ | ------ | ------- | ---------------------------------- | ------------------------------------------------------------------- |
| `yyyy` | year   | `2025`  | exactly 4 digits                   |                                                                     |
| `yy`   | year   | `25`    | exactly 2 digits                   | zero-padded, so year 5 renders `05`; needs `yearConverter` on input |
| `MMMM` | month  | `April` | full name or 3-letter abbreviation | case-insensitive                                                    |
| `MMM`  | month  | `Apr`   | full name or abbreviation          | accepts the same input as `MMMM`                                    |
| `MM`   | month  | `04`    | exactly 2 digits                   |                                                                     |
| `M`    | month  | `4`     | 1 or 2 digits                      | two digits are tried first                                          |
| `dd`   | day    | `09`    | exactly 2 digits                   |                                                                     |
| `d`    | day    | `9`     | 1 or 2 digits                      |                                                                     |
| `HH`   | hour   | `03`    | exactly 2 digits                   | 24-hour clock, 0-23                                                 |
| `H`    | hour   | `3`     | 1 or 2 digits                      |                                                                     |
| `mm`   | minute | `07`    | exactly 2 digits                   | minutes, as in TR35 — not months                                    |
| `m`    | minute | `7`     | 1 or 2 digits                      |                                                                     |
| `ss`   | second | `09`    | exactly 2 digits                   |                                                                     |
| `s`    | second | `9`     | 1 or 2 digits                      |                                                                     |

```js
formatDate('20250409030709', 'yyyyMMddHHmmss', 'd MMMM yyyy');
// → '9 April 2025'

formatDate('20250409030709', 'yyyyMMddHHmmss', 'H:m:s');
// → '3:7:9'

formatDate('20250425', 'yyyyMMdd', 'yy-MM-dd');
// → '25-04-25'

formatDate('050425', 'yyMMdd', 'yy', { yearConverter: () => 5 });
// → '05'          'yy' pads to two characters rather than truncating to one
```

### `mm` is minutes

`mm` and `m` are minutes, following [Unicode
TR35](https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table).
The PHP `date()` convention, where `m` means month, does not apply here.

```js
formatDate('20250425030709', 'yyyyMMddHHmmss', 'MM/mm');
// → '04/07'      month 04, minute 07 — not month 04 twice

formatDate('20250425', 'yyyyMMdd', 'mm');
// throws: UNPRODUCIBLE_TOKEN, token 'mm' — no time was parsed
```

---

## Output width is not input width

Output width is fixed: `MM` always renders two characters and `M` renders as
many as the number needs. Input width is what the token is willing to **read**.
The single-digit tokens read one _or_ two digits, and they try two first — which
is what makes compact formats such as `Mdd` work at all.

```js
formatDate('0415', 'Mdd', 'MMdd');
// → '0415'      input 'Mdd' reads 04 and 15; output 'MMdd' renders 04 and 15

formatDate('0415', 'Mdd', 'dd/MM');
// → '15/04'

formatDate('20250415', 'yyyyMdd', 'dd/MM/yyyy');
// → '15/04/2025'
```

`d` is the same token: it renders `9` but reads one or two digits, so
`formatDate('2025-4-9', 'yyyy-M-d', 'dd/MM/yyyy')` is `'09/04/2025'`.

Two consequences of trying the wider slice first:

- The two-digit tokens are exact. `formatDate('2025-4-25', 'yyyy-MM-dd', 'dd/MM/yyyy')`
  throws `INPUT_MISMATCH`, because `MM` will not accept `4-`. Use `M` for
  variable-width input.
- An unreadable token still occupies its declared width, and the cursor advances
  past it. That is what stops the next token from re-reading the same characters
  and inventing a value, but it also means a value wider than the token declares
  is never split.

```js
formatDate('415', 'Mdd', 'dd/MM');
// throws: UNPRODUCIBLE_TOKEN, token 'dd' — 'M' took '41' as the month, leaving '5'

formatDate('30709', 'Hms', 'H:m:s');
// → '30:70:9'    'H' took '30' and 'm' took '70'; pad the input if you want 3:7:9
```

If a field must land in a legal range, ask for it: `validate: 'strict'` rejects
the row and `validate: 'lenient'` clamps it. See
[`docs/api.md`](./api.md#validate-off--lenient--strict).

---

## Matching rules

**Longest match wins.** Tokens are matched with a sticky regex built
longest-name-first, so `yyyy` beats `yy` and `MMMM` beats `MMM` — no ordering
tricks in your format string.

**Names are case-sensitive.** `MM` is a month and `mm` is minutes. There is no
`Mm` token — and because single-letter tokens exist, letters in the wrong case
are matched against them anyway, so adjacent letters can be tokenised
unexpectedly:

```js
formatDate('20250425', 'yyyyMMdd', 'MM/mm');
// throws: UNPRODUCIBLE_TOKEN, token 'mm' — no time was parsed

formatDate('20250425030709', 'yyyyMMddHHmmss', 'MM/mmm');
// → '04/077'      'mmm' is read as 'mm' followed by 'm'

formatDate('20250425', 'yyyyMMdd', 'Mm');
// throws: UNPRODUCIBLE_TOKEN, token 'm' — the minute token is found inside it
```

**Unknown words are literals.** That is why prose formats need no escaping:

```js
formatDate('20250425', 'yyyyMMdd', 'Day dd of MMMM');
// → 'Day 25 of April'

formatDate('20250425', 'yyyyMMdd', 'Date: dd/MM/yyyy');
// → 'Date: 25/04/2025'
```

Set `strictTokens: true` to invert that and treat an unrecognised word as a typo:

```js
formatDate('20250425', 'yyyyMMdd', 'Day dd of MMMM', { strictTokens: true });
// throws: UNPRODUCIBLE_TOKEN, token 'Day'
```

**A literal can contain a token name.** `d` inside `Wed` is a day token, and the
word will be silently rearranged:

```js
formatDate('20250425', 'yyyyMMdd', 'dd Wed MMMM');
// → '25 We25 April'    the 'd' in "Wed" is the day token

formatDate('20250425', 'yyyyMMdd', 'dd [Wed] MMMM');
// → '25 Wed April'     brackets stop tokenisation
```

**Separators in `inputFormat` are verified.** A literal in the input format is
compared against the input, and trailing content is never ignored:

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy');
// throws: INPUT_MISMATCH

formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy');
// throws: INPUT_MISMATCH
```

---

## Bracketed literals

`[text]` renders `text` verbatim with the brackets removed, and the contents are
never tokenized. This is the escape hatch for literal token names, for words that
contain token letters, and for the ISO 8601 `T`.

```js
formatDate('20250425', 'yyyyMMdd', '[yyyy]');
// → 'yyyy'

formatDate('20250425', 'yyyyMMdd', 'yyyy [at] MM');
// → '2025 at 04'

formatDate('20250425', 'yyyyMMdd', '[ISO] yyyy-MM-dd');
// → 'ISO 2025-04-25'

formatDate('20250425', 'yyyyMMdd', '[dd] dd');
// → 'dd 25'

formatDate('20250425030709', 'yyyyMMddHHmmss', 'dd MMM yyyy [at] HH:mm');
// → '25 Apr 2025 at 03:07'
```

An unmatched `[` is literal text, so a stray bracket degrades to a literal rather
than swallowing the rest of the format:

```js
formatDate('2025', 'yyyy', 'yyyy [');
// → '2025 ['
```

Brackets work in `inputFormat` too, and the text inside them is verified against
the input like any other literal — which is how a fixed offset rides along:

```js
formatDate('2025-04-25+02:00', 'yyyy-MM-dd[+02:00]', 'yyyy-MM-dd[+02:00]');
// → '2025-04-25+02:00'

formatDate('2025-04-25+05:00', 'yyyy-MM-dd[+02:00]', 'yyyy-MM-dd');
// throws: INPUT_MISMATCH — the bracketed text did not match
```

---

## Textual months

`MMMM` and `MMM` accept either a full name or a three-letter abbreviation, in any
case, on input. The longest match wins, so `April` is not truncated to `Apr`
because the format said `MMM`.

```js
formatDate('25-April-2025', 'dd-MMM-yyyy', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('25-Apr-2025', 'dd-MMMM-yyyy', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('25-APR-2025', 'dd-MMM-yyyy', 'dd/MM/yyyy');
// → '25/04/2025'      month names are case-insensitive

formatDate('April 25 2025', 'MMMM dd yyyy', 'dd/MM/yyyy');
// → '25/04/2025'
```

Names are English only, with no locale, and there is no standalone-month token
(`L`) — a month name is always attached to a day or year. `parseMonthName` is
exported if you want the lookup directly: it returns `1`-`12` or `null`.

Numeric input does not feed a textual token:

```js
formatDate('25-04-2025', 'dd-MMM-yyyy', 'dd/MM/yyyy');
// throws: INPUT_MISMATCH
```

---

## Custom tokens

`customTokens` adds names of your own, usable in both directions. The handler
receives the normalised fields and returns the text to emit.

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

Without a `customTokens` entry, `Q` is just an unrecognised word — literal text:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy-[Q]Q');
// → '2025-QQ'
```

### Custom tokens in `inputFormat`

In an input format a custom token consumes a run of digits exactly as long as
its name, and the value it read is exposed as `parts[tokenName]`:

```js
formatDate('2025040902', 'yyyyMMddQQ', 'yyyy-[Q]Q', {
  customTokens: { Q: (parts) => `Q${parts.Q}` },
});
// → '2025-QQ2'

formatDate('20250409P7', 'yyyyMMdd[P]P', 'yyyy-MM-dd [plant ]P', {
  customTokens: { P: (parts) => `P${parts.P}` },
});
// → '2025-04-09 plant P7'
```

So `Q` reads one character and `QQ` reads two. Only digits parse; a
non-numeric value makes the record a mismatch rather than a custom field.

### Custom-token rules

- The value must be a function returning a string, `null`, or a number. A string
  throws `INVALID_OPTION`.
- The name must not be an inherited `Object.prototype` member (`toString`,
  `valueOf`, `constructor`, `__proto__`, …), or `RESERVED_TOKEN` is thrown.
- A handler that returns `null`, or throws, renders the token name under both
  error policies.
- `overrideTokens` beats a `customTokens` entry of the same name.
- Naming a custom token after a built-in replaces that renderer, but the built-in
  field still decides whether the token is producible, so shadowing a name whose
  field was never parsed keeps `UNPRODUCIBLE_TOKEN` in force.

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
// → '2025-XX'    the bracketed 'X' is literal, the bare one is the token

formatDate('2025', 'yyyy', 'MM/yyyy', {
  customTokens: { MM: () => 'C' },
  defaultTokens: { MM: 'D' },
});
// throws: UNPRODUCIBLE_TOKEN, token 'MM' — no month was parsed
```

---

## Not implemented

Anything below is not a token. Written into a format it is literal text, and
under `strictTokens: true` it is an `UNPRODUCIBLE_TOKEN` error.

| TR35 symbol      | Meaning                            | What you get instead                         |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| `Q`, `QQQ`, `QQ` | quarter of year                    | define `Q` in `customTokens`                 |
| `D`, `DD`, `DDD` | day of year                        | none — `d` and `dd` are day-of-month only    |
| `E`…`EEEE`       | day of week                        | none — no weekday arithmetic exists          |
| `w`, `ww`        | week of year                       | none                                         |
| `L`, `LL`, `LLL` | standalone month                   | attach `MMM`/`MMMM` to a day or year         |
| `S`…`SSSSSS`     | fractional second                  | none — `ss` is whole seconds                 |
| `a`, `b`, `B`    | am/pm and flexible day periods     | none — `HH` is a 24-hour clock               |
| `z`, `zzzz`      | non-location zone                  | literal text, or a bracketed literal         |
| `Z`, `ZZ`, `ZZZ` | RFC 822 offset                     | literal text, or a bracketed literal         |
| `X`, `x`         | ISO offset, expanded year          | literal text; `yyyy` is a plain 4-digit year |
| `G`, `GG`        | era                                | none                                         |
| `Y`, `u`         | week-numbering year, extended year | none — `yyyy` is the only year               |

```js
formatDate('20250425', 'yyyyMMdd', 'EEE dd MMM');
// → 'EEE 25 Apr'      'EEE' is literal text

formatDate('20250425', 'yyyyMMdd', 'DDD dd');
// → 'DDD 25'          uppercase 'D' is not a token; lowercase 'dd' is day-of-month

formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd.SSS');
// → '2025-04-25.SSS'  no fractional seconds, so 'SSS' stays literal

formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-ddZ');
// → '2025-04-25Z'     'Z' is not a zone token here

formatDate('20250425030709', 'yyyyMMddHHmmss', 'hh:mm a');
// → 'hh:07 a'         no am/pm token, and 'mm' is still the minute token
```

### Conformance

This is a **deliberately partial subset** of
[TR35](https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table)
— roughly 15% of the Date Field Symbol Table. The 14 implemented symbols carry
their TR35 _meanings_, and `mm` is minutes as TR35 specifies, but the parser is
not a TR35-conformant parser:

- Single-quote escaping is not implemented. TR35 uses `''` for a literal
  apostrophe; here both quotes are ordinary characters, so `''yy''` renders as
  `''25''`. Use brackets.
- Only English month names are recognised, with no locale data and no narrow or
  stand-alone forms.
- There is no era, calendar or numbering-system support.

If you need a conforming parser, or anything arithmetic, use a full date library.

---

## See also

- [`docs/api.md`](./api.md) — signature, options, precedence and error codes
- [`docs/examples.md`](./examples.md) — worked examples and edge cases
- [`docs/formatting-behavior.md`](./formatting-behavior.md) — precedence and fallback matrix
- [`README.md`](../README.md) — overview and installation
