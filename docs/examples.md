# Examples

Worked examples for `formatDate(inputDate, inputFormat, outputFormat, options?)`.

Every example below was executed against the current source. Each one carries the
exact string it returns, or the exact `DateFormatError.code` it throws. There is
nothing in this file that has not been run.

**Notation.** A `// throws INPUT_MISMATCH` comment means the call raised a
`DateFormatError` whose `.code` is the value shown. Error _messages_ are quoted
only where the message itself is the point being made.

**Setup assumed by every example:**

```js
import { formatDate } from 'datefmt-lite';
```

---

## Basic reformatting

The common case: a compact record in, a delimited string out.

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('20250425', 'yyyyMMdd', 'dd.MM.yyyy');
// → '25.04.2025'

formatDate('20250425', 'yyyyMMdd', 'ddMMyyyy');
// → '25042025'
```

The output format decides width and padding. `dd` always renders two digits,
`d` renders the value unpadded, `yyyy` always renders four:

```js
formatDate('20250425', 'yyyyMMdd', 'd/M/yy');
// → '25/4/25'

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yy');
// → '25/04/25'

formatDate('20250425', 'yyyyMMdd', 'M');
// → '4'

formatDate('20250425', 'yyyyMMdd', 'd');
// → '25'
```

### Two-digit years need a converter

`yy` on input has no century. Supply `yearConverter`, or the call throws:

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => (yy < 50 ? 2000 + yy : 1900 + yy),
});
// → '25/04/2025'

formatDate('990425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => (yy < 50 ? 2000 + yy : 1900 + yy),
});
// → '25/04/1999'
```

Without a converter the call fails, because guessing a century is exactly the
kind of assumption this library refuses to make:

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy');
// throws INVALID_OPTION  (token 'yy', field 'year')

formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '25/04/0025'         the raw two digits, zero-padded by yyyy
```

`yy` output is always zero-padded to two characters, and `yyyy` to four, even for
a small year:

```js
formatDate('050425', 'yyMMdd', 'yy', { yearConverter: () => 5 });
// → '05'

formatDate('050425', 'yyMMdd', 'yyyy', { yearConverter: () => 5 });
// → '0005'
```

A converter must return a non-negative integer, or the call throws
`INVALID_YEAR`:

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', { yearConverter: () => -1 });
// throws INVALID_YEAR
```

---

## Compact and fixed-width records

`datefmt-lite` exists for positional data: COBOL `PIC 9(8)` fields, fixed-width
mainframe and AS400 report columns, packed-decimal dumps. There are no
separators in the input, so nothing to mis-parse.

### COBOL `PIC 9(8)`

An 8-digit numeric date field, then a separate 6-digit time field:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '25/04/2025'
```

Widening a date-only record into a full timestamp by supplying the time
components from elsewhere in the row:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyyMMddHHmmss', {
  overrideTokens: { HH: '23', mm: '59', ss: '59' },
});
// → '20250425235959'

formatDate('20250425', 'yyyyMMdd', 'yyyyMMddHHmmss', {
  defaultTokens: { HH: '23', mm: '59', ss: '59' },
});
// → '20250425235959'
```

Both fill the gap here, because `hour`, `minute` and `second` are all absent
from the input. See
[`formatting-behavior.md`](./formatting-behavior.md#precedence) for why the two
options differ.

### Mainframe / AS400 style

Round-tripping a 14-digit timestamp, and reordering it:

```js
formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyyMMddHHmmss');
// → '20250425030709'

formatDate('20250425030709', 'yyyyMMddHHmmss', 'ddMMyyyyHHmmss');
// → '25042025030709'

formatDate('250425', 'yyMMdd', 'ddMMyyyy', {
  yearConverter: (yy) => 2000 + yy,
});
// → '25042025'
```

A plant code baked into the layout is literal text, not a token:

```js
formatDate('20250425', 'yyyyMMdd', '[Plant 40] yyyyMMdd');
// → 'Plant 40 20250425'
```

Overriding one position of an otherwise-parsed record:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd', {
  overrideTokens: { MM: '12' },
});
// → '20251225'
```

With no override and no default, the missing components render as their own
names under `errorPolicy: 'silent'`:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyyMMddHHmmss', { errorPolicy: 'silent' });
// → '20250425HHmmss'
```

---

## ISO 8601

```js
formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-ddTHH:mm:ss');
// → '2025-04-25T03:07:09'

formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd HH:mm:ss');
// → '2025-04-25 03:07:09'
```

The `T` needs no brackets in the default policy — an unrecognised letter run is
literal text:

```js
formatDate('20250425T030709', 'yyyyMMdd[T]HHmmss', 'yyyy-MM-ddTHH:mm:ss');
// → '2025-04-25T03:07:09'

formatDate('20250425 030709', 'yyyyMMdd HHmmss', 'yyyy-MM-ddTHH:mm:ss');
// → '2025-04-25T03:07:09'
```

Adding a wall-clock time to a date-only record, with the value stated up front
rather than silently defaulted:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd HH:mm:ss', {
  overrideTokens: { HH: '12', mm: '34', ss: '56' },
});
// → '2025-04-25 12:34:56'
```

A fixed suffix is a bracketed literal:

```js
formatDate('20250425', 'yyyyMMdd', '[UTC ]yyyy-MM-dd');
// → 'UTC 2025-04-25'
```

Under `strictTokens: true` the `T` must be bracketed, because the whole `ddTHH`
run is checked as one word:

```js
formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd[T]HH:mm:ss', {
  strictTokens: true,
});
// → '2025-04-25T03:07:09'
```

---

## Human-readable output

```js
formatDate('20250425', 'yyyyMMdd', 'MMMM d, yyyy');
// → 'April 25, 2025'

formatDate('20250425', 'yyyyMMdd', 'MMM dd, yyyy');
// → 'Apr 25, 2025'

formatDate('20250425', 'yyyyMMdd', 'dd-MMM-yyyy');
// → '25-Apr-2025'

formatDate('20250425', 'yyyyMMdd', 'd MMM yyyy');
// → '25 Apr 2025'
```

`MMMM` and `MMM` render from the `month` field; there is no locale data in the
library, so the names are the fixed English set.

### Bracketed literals

`[text]` renders `text` verbatim, with the brackets removed and the contents
never treated as tokens:

```js
formatDate('20250425', 'yyyyMMdd', 'Day dd of MMMM');
// → 'Day 25 of April'

formatDate('20250425', 'yyyyMMdd', 'yyyy [at] MM');
// → '2025 at 04'

formatDate('2025', 'yyyy', '[yyyy]');
// → 'yyyy'

formatDate('20250425', 'yyyyMMdd', 'yyyy[MM]');
// → '2025MM'

formatDate('20250425', 'yyyyMMdd', '[ISO] yyyy-MM-dd');
// → 'ISO 2025-04-25'

formatDate('20250425', 'yyyyMMdd', '[Day ]dd[ of ]MMMM');
// → 'Day 25 of April'

formatDate('20250425', 'yyyyMMdd', 'Date: dd MMMM');
// → 'Date: 25 April'
```

---

## Textual month input

`MMM` and `MMMM` parse full month names and three-letter abbreviations
alike, case-insensitively, longest match first. Both tokens read the same way
regardless of which one the format declares:

```js
formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('25-April-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('25-April-2025', 'dd-MMMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('25-APRIL-2025', 'dd-MMMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('25-apr-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd');
// → '2025-04-25'

formatDate('25 Apr 2025', 'dd MMM yyyy', 'dd/MM/yyyy');
// → '25/04/2025'

formatDate('September 2025', 'MMMM yyyy', 'MMMM-yyyy');
// → 'September-2025'
```

Month parsing reads ahead up to nine characters and keeps the longest
recognised match, so `April` is not truncated to `Apr` just because the format
says `MMM`.

### Going the other way

Textual months out, numeric months in, and vice versa, all without a `Date`:

```js
formatDate('20250425', 'yyyyMMdd', 'dd-MMM-yyyy');
// → '25-Apr-2025'
```

---

## Variable-width input

`M`, `d`, `H`, `m` and `s` accept one **or** two digits on input, while `MM`,
`dd`, `HH`, `mm` and `ss` require exactly two. `yyyy` requires exactly four and
`yy` exactly two.

Two digits are always tried first, so `Mdd` reads `0415` as 15 April rather
than 4 April with day `15` misaligned:

```js
formatDate('20250409', 'yyyyMd', 'dd/MM/yyyy');
// → '09/04/2025'

formatDate('2025-4-9', 'yyyy-M-d', 'dd/MM/yyyy');
// → '09/04/2025'

formatDate('0415', 'Mdd', 'MM-dd');
// → '04-15'

formatDate('0415', 'Md', 'M/d');
// → '4/15'

formatDate('9/4/25', 'M/d/yy', 'yyyy-MM-dd', {
  yearConverter: (yy) => 2000 + yy,
});
// → '2025-09-04'
```

The compact formats round-trip exactly:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd');
// → '20250425'

formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyyMMddHHmmss');
// → '20250425030709'
```

---

## Custom tokens

`customTokens` adds token names usable in **both** `inputFormat` and
`outputFormat`. The handler receives the parsed fields and returns a string.

### Fiscal quarter

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => String(Math.ceil(p.month / 3)) },
});
// → '2025-Q2'
```

The handler emits only the digit, and the literal `Q` comes from the brackets.
Returning the prefix yourself gives you the doubled letter:

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
});
// → '2025-QQ2'
```

### Week of year

A custom token is just arithmetic over `year`, `month` and `day` — no `Date`
needed:

```js
formatDate('20250425', 'yyyyMMdd', 'yyyy-[W]W', {
  customTokens: {
    W: (p) =>
      String(
        Math.ceil(
          ([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
            .slice(0, p.month - 1)
            .reduce((a, b) => a + b, 0) +
            p.day) /
            7,
        ),
      ),
  },
});
// → '2025-W17'
```

### Period code

```js
formatDate('20250425', 'yyyyMMdd', '[P]P/yyyy', {
  customTokens: { P: (p) => 'P' + String(Math.ceil(p.month / 3)) },
});
// → 'PP2/2025'
```

### Day of year, in and out

A custom token occupies its own name length in the input string, and its parsed
value is available as `parts[tokenName]`:

```js
formatDate('1152025', 'DDDyyyy', 'yyyy-[day ]DDD', {
  customTokens: { DDD: (p) => String(p.DDD) },
});
// → '2025-day 115'
```

### Precedence against a custom token

`overrideTokens` outranks a custom handler; `defaultTokens` does not, because a
custom token is always considered derivable and its handler decides:

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

### Invalid custom token definitions

Caller mistakes, and these throw under every `errorPolicy` including `'silent'`:

```js
formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  customTokens: { Q: 'not-a-function' },
});
// throws INVALID_OPTION  (token 'Q')

formatDate('2025', 'yyyy', 'yyyy', {
  errorPolicy: 'silent',
  customTokens: { toString: () => 'x' },
});
// throws RESERVED_TOKEN  (token 'toString')
```

The reserved set is every `Object.prototype` member the token tables could
otherwise collide with: `__proto__`, `constructor`, `prototype`, `toString`,
`valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`,
`toLocaleString`.

### Custom tokens are opt-in per call

A registered custom token costs nothing if the format does not mention it:

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
});
// → '25/04/2025'
```

---

## The full option matrix

Every option, with the smallest input that shows what it does.

### `errorPolicy`

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// → '25/04/2025'      default is 'throw'

formatDate('2025', 'yyyy', 'dd/MM/yyyy');
// throws UNPRODUCIBLE_TOKEN  (token 'dd')

formatDate('2025', 'yyyy', 'MM/dd/yyyy', { errorPolicy: 'silent' });
// → 'MM/dd/2025'

formatDate('not-a-date', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → 'not-a-date'

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '2025/04/25'

formatDate('2025AB25', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → '2025AB25'
```

### `validate`

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy');
// → '45/13/2025'       default is 'off': no range checking

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'off' });
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '25/04/2025'

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'lenient' });
// → '25/04/2025'
```

### `verifyLiterals`

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { verifyLiterals: true });
// → '25/04/2025'       default

formatDate('2025-04-25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// → '25/04/2025'

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// throws INPUT_MISMATCH  (see Gotchas)
```

### `strictTokens`

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { strictTokens: true });
// → '25/04/2025'       default is false

formatDate('20250425', 'yyyyMMdd', 'ISO yyyy', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'ISO')

formatDate('20250425', 'yyyyMMdd', '[ISO] yyyy', { strictTokens: true });
// → 'ISO 2025'
```

### `yearConverter`

```js
formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', {
  yearConverter: (yy) => 2000 + yy,
});
// → '25/04/2025'
```

### `customTokens`

```js
formatDate('20250615', 'yyyyMMdd', 'yyyy-[Q]Q', {
  customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
});
// → '2025-QQ2'
```

### `overrideTokens`

```js
formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
});
// → '01/04/2025'
```

### `defaultTokens`

```js
formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', { defaultTokens: { dd: '99' } });
// → '99/04/2025'
```

---

## Error handling

### `errorPolicy: 'throw'` (default)

Four things produce `INPUT_MISMATCH`: a literal separator that is not there,
trailing content, a byte-order mark, and corrupt token content.

```js
formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  separator did not match

formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  trailing content is never ignored

formatDate('\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  BOM shifts the whole record

formatDate('2025AB25', 'yyyyMMdd', 'dd/MM/yyyy');
// throws INPUT_MISMATCH  corrupt token content
```

`UNPRODUCIBLE_TOKEN` is raised when an output token has no source at all — no
parsed value, no default, no override:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy');
// throws UNPRODUCIBLE_TOKEN  (token 'dd')

formatDate('20250425', 'yyyyMMdd', 'dd/mm/yyyy');
// throws UNPRODUCIBLE_TOKEN  (token 'mm') — minutes, per Unicode TR35
```

The `.token` property names the offender, so you can branch without matching
message text:

```js
try {
  formatDate('2025', 'yyyy', 'dd/MM/yyyy');
} catch (err) {
  err.name; // 'DateFormatError'
  err.code; // 'UNPRODUCIBLE_TOKEN'
  err.token; // 'dd'
}
```

### `errorPolicy: 'silent'`

Two fallbacks, both visibly wrong on purpose so a bad record cannot pass as a
good one:

- Input that does not conform comes back **unchanged**.
- An unproducible token renders as **its own name**.

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', { errorPolicy: 'silent' });
// → 'MM/dd/2025'

formatDate('2025', 'yyyy', 'HH:mm:ss', { errorPolicy: 'silent' });
// → 'HH:mm:ss'

formatDate('not-a-date', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' });
// → 'not-a-date'

formatDate('20250425', 'yyyyMMdd', 'yyyyMMddHHmmss', { errorPolicy: 'silent' });
// → '20250425HHmmss'
```

Defaults and overrides still apply under `silent`, because they are deliberate
supplies rather than fallbacks:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  defaultTokens: { dd: '01' },
});
// → '01/MM/2025'

formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  overrideTokens: { dd: '01' },
});
// → '01/MM/2025'

formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  errorPolicy: 'silent',
  defaultTokens: { dd: '01', MM: '02' },
});
// → '01/02/2025'
```

### Silent still throws on caller mistakes

`errorPolicy` only covers bad **data**. A bad call is a bug in the calling code,
and hiding it would be worse than failing:

```js
formatDate(123, 'yyyyMMdd', 'yyyy');
// throws INVALID_ARGUMENT  even under errorPolicy: 'silent'

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

formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
  validate: 'strict',
  errorPolicy: 'silent',
});
// throws OUT_OF_RANGE  (field 'month')
```

That last one is the important exception. A strict range failure is a
data-quality assertion, and it surfaces even under a best-effort policy.

### Error messages are safe to log

Messages never echo the input value. Only token and format names appear, and
long names are truncated:

```js
try {
  formatDate('ACCOUNT-99182', 'yyyyMMdd', 'dd/MM/yyyy');
} catch (err) {
  err.message;
  // → 'Input does not match inputFormat "yyyyMMdd"'
}
```

---

## Validation

### `'strict'` rejects impossible dates

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'month') — month 13

formatDate('20250431', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day') — 31 April

formatDate('2025042525', 'yyyyMMddHH', 'dd/MM/yyyy HH', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'hour') — hour 25
```

### Leap years

Gregorian rules apply: divisible by 4, except centuries not divisible by 400.

```js
formatDate('20240229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2024'

formatDate('20000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// → '29/02/2000'

formatDate('20250229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day') — 2025 is not a leap year

formatDate('19000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day') — 1900 is not a leap year

formatDate('21000229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' });
// throws OUT_OF_RANGE  (field 'day') — 2100 is not a leap year
```

With no year in the input, February is allowed 29 days rather than rejecting a
date that could legitimately be a leap year:

```js
formatDate('0229', 'MMdd', 'MM-dd', { validate: 'strict' });
// → '02-29'
```

### `'lenient'` clamps instead

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'lenient' });
// → '31/12/2025'

formatDate('20250431', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'lenient' });
// → '30/04/2025'

formatDate('2025042525', 'yyyyMMddHH', 'dd/MM/yyyy HH', {
  validate: 'lenient',
});
// → '25/04/2025 23'
```

An invalid `validate` value is a caller mistake:

```js
formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'nope' });
// throws INVALID_OPTION
```

---

## Gotchas

### Greedy variable-width reads on unpadded data

`M` and `d` try two digits before one. On unpadded input that is genuinely
ambiguous, and the library resolves it greedily:

```js
formatDate('415', 'Md', 'M/d');
// → '41/5'     month 41, day 5 — a 2-digit read wins
```

The fix is on the input side: pad so the two-digit read is the correct one.

```js
formatDate('0415', 'Md', 'M/d');
// → '4/15'

formatDate('0415', 'Mdd', 'MM-dd');
// → '04-15'
```

Separators remove the ambiguity, because the token before them can only read the
characters that remain:

```js
formatDate('4-15', 'M-d', 'M/d');
// → '4/15'
```

The fixed-width tokens cannot mis-split, but they do require every digit to be
present. A short field is a mismatch, not a partial read:

```js
formatDate('9', 'MM', 'M');
// throws INPUT_MISMATCH
```

And when a fixed-width token overruns the record, the leftover characters are
dropped rather than read — which surfaces later as an unproducible token:

```js
formatDate('415', 'MMdd', 'MM/dd');
// throws UNPRODUCIBLE_TOKEN  (token 'dd') — MM consumed '41', '5' was left over
```

### Literal words must be bracketed under `strictTokens`

`strictTokens: true` rejects unrecognised alphabetic runs so that a typo like
`MMM` becomes an error instead of literal text. The cost is that every literal
word needs brackets:

```js
formatDate('20250425', 'yyyyMMdd', 'ISO yyyy', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'ISO')

formatDate('20250425', 'yyyyMMdd', '[ISO] yyyy', { strictTokens: true });
// → 'ISO 2025'

formatDate('20250425', 'yyyyMMdd', 'UTC yyyy-MM-dd', { strictTokens: true });
// throws UNPRODUCIBLE_TOKEN  (token 'UTC')

formatDate('20250425', 'yyyyMMdd', 'day dd of MMMM yyyy', {
  strictTokens: true,
});
// throws UNPRODUCIBLE_TOKEN  (token 'day')

formatDate('20250425', 'yyyyMMdd', '[day ]dd[ of ]MMMM yyyy', {
  strictTokens: true,
});
// → 'day 25 of April 2025'
```

### Unbracketed literal words can be silently mis-tokenised

Even with `strictTokens: false`, a literal word containing a token-shaped
letter run is partly consumed. `d` in `'day'` and `'dated'`, `M` in `'Monday'`
and `'dM'`:

```js
formatDate('20250425', 'yyyyMMdd', 'day dd of MMMM');
// → '25ay 25 of April'     the 'd' of 'day' was read as the day token

formatDate('20250425', 'yyyyMMdd', 'dated dd');
// → '25ate25 25'           both token-shaped runs consumed

formatDate('20250425', 'yyyyMMdd', 'Monday dd');
// → '4on25ay 25'           'M' and 'd' consumed, plus an unproducible 's'

formatDate('20250425', 'yyyyMMdd', '[day ]dd[ of ]MMMM');
// → 'day 25 of April'

formatDate('20250425', 'yyyyMMdd', '[dated ]dd');
// → 'dated 25'

formatDate('20250425', 'yyyyMMdd', '[Monday ]dd');
// → 'Monday 25'
```

A trailing `s` is worth calling out: `'days dd of MMMM'` reaches `s`, a
one-or-two-digit second token that has no value, so the call throws
`UNPRODUCIBLE_TOKEN`. Bracket anything you do not mean as a token. Words with
no token-shaped runs are safe unbracketed:

```js
formatDate('20250425', 'yyyyMMdd', 'no. dd');
// → 'no. 25'

formatDate('20250425', 'yyyyMMdd', 'Date: dd MMMM');
// → 'Date: 25 April'
```

Turn on `strictTokens: true` and these silent corruptions become loud errors.

### `verifyLiterals: false` does not accept a mismatched separator

The option relaxes the _cursor_ handling — the parser stops bailing out at the
first bad literal and keeps reading — but a literal that is not present is
still reported as a desync, and a desync is still `INPUT_MISMATCH`:

```js
formatDate('2025-04-25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// → '25/04/2025'

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', { verifyLiterals: false });
// throws INPUT_MISMATCH

formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy', {
  verifyLiterals: false,
  errorPolicy: 'silent',
});
// → '2025/04/25'
```

Through the public `formatDate` entry point, `verifyLiterals: false` therefore
changes no observable result — verified across a 3,528-case sweep of input,
input-format, output-format and policy combinations. It matters only when
calling `extractTokens()` directly, where the difference is visible in the
returned token list. Leave it at the default.

### Unknown token names render as literal text

Without `strictTokens`, a misspelt token is not an error — it is a literal:

```js
formatDate('20250425', 'yyyyMMdd', 'DD/MM/YYYY');
// → 'DD/04/YYYY'

formatDate('20250425', 'yyyyMMdd', 'dd/mm/yyyy');
// throws UNPRODUCIBLE_TOKEN  (token 'mm') — lower-case mm *is* minutes
```

`YYYY` is harmless because it is not a token name at all, but `mm` and `dd`
in the wrong case are real tokens with the wrong meaning.

### `overrideTokens` beats `defaultTokens` even for tokens never parsed

This is the case the old docs got backwards, so it is worth stating plainly:

```js
formatDate('2025', 'yyyy', 'dd/MM/yyyy', {
  overrideTokens: { dd: '01' },
  defaultTokens: { dd: '99', MM: '11' },
});
// → '01/11/2025'    override wins for dd, default supplies MM
```

And `defaultTokens` keys off the **field**, not the token name, so a month
parsed as `M` is not replaced by `defaultTokens.MM`:

```js
formatDate('4-25-2025', 'M-dd-yyyy', 'dd/MM/yyyy', {
  defaultTokens: { MM: '11' },
});
// → '25/04/2025'    the parsed month (4) wins over the MM default

formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
  defaultTokens: { dd: '01', MM: '11' },
});
// → '25/04/2025'    both fields parsed, neither default applies
```

### A custom token handler may not fill a built-in gap

`defaultTokens` is per field, so it cannot supply a value for a field that has
no data if the field check runs first. A custom handler shadowing a built-in
name inherits the built-in field's presence requirement:

```js
formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
  errorPolicy: 'silent',
  customTokens: { MM: (p) => 'X' },
});
// → 'MM/dd/2025'    month was never parsed, so MM is unproducible
```

### A custom handler returning `null` renders the token name

```js
formatDate('20250425', 'yyyyMMdd', 'WW', { customTokens: { W: () => null } });
// → 'WW'
```

---

## Further reading

- [`../README.md`](../README.md) — overview, token table, option summary
- [`api.md`](./api.md) — full parameter and option reference
- [`tokens.md`](./tokens.md) — token table and matching rules
- [`formatting-behavior.md`](./formatting-behavior.md) — precedence ladder and
  the worked matrix
- [`internals.md`](./internals.md) — pipeline and module map
