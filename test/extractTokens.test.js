import { extractTokens } from '../src/extractTokens.js';
import { ERROR_CODES } from '../src/errors.js';
import { TOKEN_REGISTRY } from '../src/handlers.js';

const val = (res) => res.values;
const toks = (res) => res.tokens;

describe('argument validation', () => {
  it.each([
    [null, 'yyyy'],
    [undefined, 'yyyy'],
    [123, 'yyyy'],
    [{}, 'yyyy'],
    [[], 'yyyy'],
    [true, 'yyyy'],
  ])('rejects inputDate %p', (input) => {
    expect(() => extractTokens(input, 'yyyy')).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_ARGUMENT }),
    );
  });

  it.each([123, {}, true, []])('rejects inputFormat %p', (format) => {
    expect(() => extractTokens('2025', format)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_ARGUMENT }),
    );
  });

  it.each([null, undefined])('detects the format when inputFormat is %p', (format) => {
    const r = extractTokens('20250425', format);
    expect(r.detected).toBe('yyyyMMdd');
    expect(r.tokens).toEqual(['yyyy', 'MM', 'dd']);
  });

  it('names the offending argument', () => {
    expect(() => extractTokens(1, 'yyyy')).toThrow(
      /inputDate must be a string/,
    );
    expect(() => extractTokens('1', 1)).toThrow(/inputFormat must be a string/);
  });
});

describe('numeric extraction', () => {
  it('reads a plain date', () => {
    const r = extractTokens('20250425', 'yyyyMMdd');
    expect(toks(r)).toEqual(['yyyy', 'MM', 'dd']);
    expect(val(r)).toEqual({ yyyy: '2025', MM: '04', dd: '25' });
    expect(r.mismatched).toBe(false);
  });

  it('reads a full timestamp', () => {
    const r = extractTokens('20250425030709', 'yyyyMMddHHmmss');
    expect(val(r)).toEqual({
      yyyy: '2025',
      MM: '04',
      dd: '25',
      HH: '03',
      mm: '07',
      ss: '09',
    });
  });

  it('preserves leading zeros as strings', () => {
    expect(val(extractTokens('20250409', 'yyyyMMdd')).MM).toBe('04');
  });

  it('verifies literal separators', () => {
    const r = extractTokens('2025-04-25', 'yyyy-MM-dd');
    expect(toks(r)).toEqual(['yyyy', 'MM', 'dd']);
    expect(r.mismatched).toBe(false);
  });

  it('flags a wrong separator instead of silently skipping it', () => {
    const r = extractTokens('2025/04/25', 'yyyy-MM-dd');
    expect(r.mismatched).toBe(true);
  });

  it('flags trailing content after the format is consumed', () => {
    expect(extractTokens('20250425JUNK', 'yyyyMMdd').mismatched).toBe(true);
  });

  it('reads what it can from a truncated record and reports the mismatch', () => {
    // The values that did parse are still reported, so a caller doing a partial
    // recovery has them, while `mismatched` records that the shape was wrong.
    const r = extractTokens('2025', 'yyyyMM');
    expect(toks(r)).toEqual(['yyyy']);
    expect(val(r).MM).toBeNull();
    expect(r.mismatched).toBe(true);
  });

  it('flags a format whose widths overrun the input', () => {
    // MMdd needs four characters; '415' has three, so the record cannot have had
    // this shape even though yyyy-shaped reads inside it are valid.
    expect(extractTokens('415', 'MMdd').mismatched).toBe(true);
    expect(extractTokens('2025', 'yyyyMMdd').mismatched).toBe(true);
  });

  it('treats non-numeric characters in a token slot as corrupt', () => {
    const r = extractTokens('2025AB05', 'yyyyMMdd');
    expect(toks(r)).toEqual(['yyyy', 'dd']);
    expect(val(r).MM).toBeNull();
    expect(r.mismatched).toBe(true);
  });

  it('flags a total failure as mismatched', () => {
    expect(extractTokens('not-a-date', 'yyyyMMdd').mismatched).toBe(true);
  });
});

describe('variable-width tokens', () => {
  it.each([
    ['0415', 'Mdd', { M: '04', dd: '15' }],
    ['20250409', 'yyyyMd', { M: '04', d: '09' }],
    ['2025125', 'yyyyMd', { M: '12', d: '5' }],
    ['2025049', 'yyyyMd', { M: '04', d: '9' }],
  ])('reads variable widths from %s with %s', (input, format, expected) => {
    const r = extractTokens(input, format);
    for (const [k, v] of Object.entries(expected)) {
      expect(val(r)[k]).toBe(v);
    }
  });

  it.each([
    ['4/4/2025', 'd/M/yyyy', { d: '4', M: '4', yyyy: '2025' }],
    ['12/4/2025', 'd/M/yyyy', { d: '12', M: '4', yyyy: '2025' }],
    ['12/11/2025', 'd/M/yyyy', { d: '12', M: '11', yyyy: '2025' }],
  ])('reads %s with %s', (input, format, expected) => {
    const r = extractTokens(input, format);
    for (const [k, v] of Object.entries(expected)) {
      expect(val(r)[k]).toBe(v);
    }
  });

  it('handles single-digit time components', () => {
    const r = extractTokens('2025-4-5 3:7:9', 'yyyy-M-d H:m:s');
    expect(val(r)).toMatchObject({ M: '4', d: '5', H: '3', m: '7', s: '9' });
  });

  it('does not let a variable token swallow a separator', () => {
    const r = extractTokens('4/4/2025', 'd/M/yyyy');
    expect(r.mismatched).toBe(false);
    expect(val(r).yyyy).toBe('2025');
  });

  it('keeps fixed-width tokens fixed', () => {
    const r = extractTokens('1/2/2025', 'MM/dd/yyyy');
    expect(r.mismatched).toBe(true);
  });
});

describe('textual month tokens', () => {
  it.each([
    ['25-Apr-2025', 'dd-MMM-yyyy'],
    ['25-April-2025', 'dd-MMM-yyyy'],
    ['25-APR-2025', 'dd-MMM-yyyy'],
    ['25-apr-2025', 'dd-MMM-yyyy'],
  ])('reads %s with %s', (input, format) => {
    const r = extractTokens(input, format);
    expect(val(r)).toEqual({ dd: '25', MMM: '4', yyyy: '2025' });
    expect(r.mismatched).toBe(false);
  });

  it.each([
    ['25-April-2025', 'dd-MMMM-yyyy'],
    ['25-April-2025', 'dd-MMMM-yyyy'],
    ['1-September-2025', 'd-MMMM-yyyy'],
  ])('reads %s with %s', (input, format) => {
    const r = extractTokens(input, format);
    expect(val(r)).toMatchObject({ yyyy: '2025', MMMM: expect.any(String) });
  });

  it('prefers the longest month name', () => {
    const r = extractTokens('25-April-2025', 'dd-MMM-yyyy');
    expect(val(r).MMM).toBe('4');
    expect(val(r).yyyy).toBe('2025');
  });

  it('reads a compact textual date', () => {
    const r = extractTokens('2025Apr25', 'yyyyMMMdd');
    expect(val(r)).toEqual({ yyyy: '2025', MMM: '4', dd: '25' });
  });

  it('flags an unknown month name', () => {
    expect(extractTokens('25-Xyz-2025', 'dd-MMM-yyyy').mismatched).toBe(true);
  });
});

describe('bracketed literals', () => {
  it('matches escaped text in the input', () => {
    const r = extractTokens('2025 at 04', 'yyyy [at] MM');
    expect(r.mismatched).toBe(false);
    expect(val(r)).toEqual({ yyyy: '2025', MM: '04' });
  });

  it('flags a missing escaped text', () => {
    expect(extractTokens('2025 xx 04', 'yyyy [at] MM').mismatched).toBe(true);
  });
});

describe('literal-only and edge formats', () => {
  it('handles an empty input format', () => {
    const r = extractTokens('', '');
    expect(toks(r)).toEqual([]);
    expect(r.mismatched).toBe(false);
  });

  it('flags non-empty input against an empty format', () => {
    expect(extractTokens('abc', '').mismatched).toBe(true);
  });

  it('handles a literal-only format', () => {
    expect(extractTokens('abc', 'abc').mismatched).toBe(false);
    expect(extractTokens('abd', 'abc').mismatched).toBe(true);
  });

  it('treats an unbracketed word as literal text, not as tokens', () => {
    // "day" contains the d and y tokens, but as a word it is literal text.
    const r = extractTokens('2025 day 04', 'yyyy day MM');
    expect(toks(r)).toEqual(['yyyy', 'MM']);
    expect(val(r).MM).toBe('04');
    expect(r.mismatched).toBe(false);
  });

  it('does not let a prototype member be read as a token', () => {
    const r = extractTokens('abcdefgh', 'toString');
    expect(toks(r)).toEqual([]);
  });
});

describe('custom handler tables', () => {
  const table = {
    ...TOKEN_REGISTRY,
    Q: {
      field: 'quarter',
      width: 2,
      variable: false,
      parse: (t) => (/^Q\d$/i.test(t) ? Number(t[1]) : null),
    },
  };

  it('recognises a custom token in the input format', () => {
    const r = extractTokens('2025Q2', 'yyyyQ', table);
    expect(val(r)).toEqual({ yyyy: '2025', Q: '2' });
  });
});
