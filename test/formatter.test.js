import { formatDate } from '../src/formatter.js';
import { DateFormatError, ERROR_CODES } from '../src/errors.js';

const pivot = (n) => (n < 50 ? 2000 + n : 1900 + n);

describe('argument and option validation', () => {
  it.each([
    [null, 'yyyy', 'yyyy'],
    [123, 'yyyy', 'yyyy'],
    ['2025', null, 'yyyy'],
    ['2025', 'yyyy', null],
    ['2025', 'yyyy', 123],
  ])('rejects bad argument types', (a, b, c) => {
    expect(() => formatDate(a, b, c)).toThrow(DateFormatError);
  });

  it('rejects null options', () => {
    expect(() => formatDate('2025', 'yyyy', 'yyyy', null)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_ARGUMENT }),
    );
  });

  it.each([['slient'], ['SILENT'], ['Throw'], [''], [null], [0], [false]])(
    'rejects errorPolicy %p',
    (errorPolicy) => {
      expect(() => formatDate('2025', 'yyyy', 'yyyy', { errorPolicy })).toThrow(
        expect.objectContaining({ code: ERROR_CODES.INVALID_OPTION }),
      );
    },
  );

  it.each(['off', 'lenient', 'strict'])('accepts validate %s', (validate) => {
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate }),
    ).not.toThrow();
  });

  it.each([['yes'], [''], [null], [1]])('rejects validate %p', (validate) => {
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { validate }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_OPTION }));
  });

  it('rejects a non-function yearConverter', () => {
    expect(() =>
      formatDate('250425', 'yyMMdd', 'yyyy', { yearConverter: 'nope' }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_OPTION }));
  });

  it('rejects a non-function custom token', () => {
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', 'Q', { customTokens: { Q: 'nope' } }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_OPTION }));
  });
});

describe('core conversion', () => {
  it('formats a basic date', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('25/04/2025');
  });

  it('formats to an identical compact format', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd')).toBe('20250425');
  });

  it('formats a full timestamp', () => {
    expect(
      formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd HH:mm:ss'),
    ).toBe('2025-04-25 03:07:09');
  });

  it.each([
    ['dd/MM/yyyy', '25/04/2025'],
    ['yyyy-MM-dd', '2025-04-25'],
    ['MM/dd/yyyy', '04/25/2025'],
    ['dd.MM.yyyy', '25.04.2025'],
    ['dd-MMM-yyyy', '25-Apr-2025'],
    ['MMM dd, yyyy', 'Apr 25, 2025'],
    ['MMMM d, yyyy', 'April 25, 2025'],
    ['dd/MM/yy', '25/04/25'],
    ['d/M/yy', '25/4/25'],
  ])('formats to %s', (outputFormat, expected) => {
    expect(formatDate('20250425', 'yyyyMMdd', outputFormat)).toBe(expected);
  });

  it('formats ISO 8601 with a literal T', () => {
    expect(
      formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-ddTHH:mm:ss'),
    ).toBe('2025-04-25T03:07:09');
  });

  it('formats literal words in the output', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'Date: dd/MM/yyyy')).toBe(
      'Date: 25/04/2025',
    );
    expect(formatDate('20250425', 'yyyyMMdd', 'Day dd of MMMM yyyy')).toBe(
      'Day 25 of April 2025',
    );
  });

  it('formats an empty output format to an empty string', () => {
    expect(formatDate('20250425', 'yyyyMMdd', '')).toBe('');
  });
});

describe('input format flexibility', () => {
  it.each([
    ['2025-04-25', 'yyyy-MM-dd', 'dd/MM/yyyy', '25/04/2025'],
    ['2025/04/25', 'yyyy/MM/dd', 'dd.MM.yyyy', '25.04.2025'],
    ['20250425', 'yyyyMMdd', 'dd/MM/yyyy', '25/04/2025'],
    ['25-04-2025', 'dd-MM-yyyy', 'yyyy-MM-dd', '2025-04-25'],
    ['04/25/2025', 'MM/dd/yyyy', 'yyyyMMdd', '20250425'],
  ])(
    'reads %s with %s into %s',
    (input, inputFormat, outputFormat, expected) => {
      expect(formatDate(input, inputFormat, outputFormat)).toBe(expected);
    },
  );

  it('reads variable-width single-digit tokens', () => {
    expect(formatDate('2025-4-9', 'yyyy-M-d', 'dd/MM/yyyy')).toBe('09/04/2025');
  });

  it('reads a two-digit month into a variable-width token', () => {
    expect(formatDate('20250409', 'yyyyMd', 'dd/MM/yyyy')).toBe('09/04/2025');
  });

  it('reads textual months', () => {
    expect(formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'dd/MM/yyyy')).toBe(
      '25/04/2025',
    );
    expect(formatDate('25-April-2025', 'dd-MMMM-yyyy', 'MMM dd')).toBe(
      'Apr 25',
    );
  });

  it('reads a compact textual date', () => {
    expect(formatDate('2025Apr25', 'yyyyMMMdd', 'dd/MM/yyyy')).toBe(
      '25/04/2025',
    );
  });

  it('verifies literal separators', () => {
    expect(() => formatDate('2025/04/25', 'yyyy-MM-dd', 'dd/MM/yyyy')).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INPUT_MISMATCH }),
    );
  });

  it('rejects trailing content', () => {
    expect(() => formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy')).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INPUT_MISMATCH }),
    );
  });

  it('rejects a BOM prefix', () => {
    expect(() =>
      formatDate('\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy'),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INPUT_MISMATCH }));
  });

  it('returns the raw input for a BOM in silent mode', () => {
    const input = '\uFEFF20250425';
    expect(
      formatDate(input, 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' }),
    ).toBe(input);
  });
});

describe('bracketed literals', () => {
  it('renders bracketed text without the brackets', () => {
    expect(
      formatDate(
        '20250425T101010',
        'yyyyMMddTHHmmss',
        'dd MMM yyyy [at] HH:mm',
      ),
    ).toBe('25 Apr 2025 at 10:10');
  });

  it('escapes a token so it renders literally', () => {
    expect(formatDate('2025', 'yyyy', '[yyyy]')).toBe('yyyy');
  });

  it('does not fuse neighbouring tokens', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy[-]MM')).toBe('2025-04');
  });

  it('supports an escaped group between custom tokens', () => {
    expect(
      formatDate('20250601', 'yyyyMMdd', 'yyyy [Q]Q', {
        customTokens: { Q: (p) => String(Math.ceil(p.month / 3)) },
      }),
    ).toBe('2025 Q2');
  });

  it('handles an empty escaped group', () => {
    expect(formatDate('20250425', 'yyyyMMdd', '[]dd/MM')).toBe('25/04');
  });
});

describe('year handling', () => {
  it('expands a two-digit year with a converter', () => {
    expect(
      formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', { yearConverter: pivot }),
    ).toBe('25/04/2025');
  });

  it('renders yy zero-padded for single-digit years', () => {
    expect(
      formatDate('050425', 'yyMMdd', 'yy', { yearConverter: () => 5 }),
    ).toBe('05');
  });

  it('throws for yy without a converter', () => {
    expect(() => formatDate('250425', 'yyMMdd', 'dd/MM/yyyy')).toThrow(
      /yearConverter/,
    );
  });

  it('treats yy as-is in silent mode', () => {
    expect(
      formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' }),
    ).toBe('25/04/0025');
  });

  it('derives yyyy from a parsed yy', () => {
    expect(
      formatDate('250425', 'yyMMdd', 'yyyy', { yearConverter: pivot }),
    ).toBe('2025');
  });

  it('renders a zero year', () => {
    expect(formatDate('00000425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('25/04/0000');
  });
});

describe('custom, override and default tokens', () => {
  it('adds a custom token', () => {
    expect(
      formatDate('20250615', 'yyyyMMdd', 'yyyy-Q/dd', {
        customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
      }),
    ).toBe('2025-Q2/15');
  });

  it('recognises a custom token positionally in the input format', () => {
    // A custom token occupies its own width in the record and is read as digits,
    // so single-character codes work in fixed-width layouts.
    expect(
      formatDate('20254', 'yyyyY', 'yyyy-Y', {
        customTokens: { Y: (p) => String(p.year).slice(-1) },
      }),
    ).toBe('2025-5');
  });

  it('lets overrideTokens win over handlers', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
        overrideTokens: { dd: '01' },
      }),
    ).toBe('01/04/2025');
  });

  it('lets overrideTokens beat defaultTokens', () => {
    expect(
      formatDate('202504', 'yyyyMM', 'dd', {
        overrideTokens: { dd: '77' },
        defaultTokens: { dd: '99' },
      }),
    ).toBe('77');
  });

  it('falls back to defaultTokens when a field is missing', () => {
    expect(
      formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', {
        defaultTokens: { dd: '99' },
      }),
    ).toBe('99/04/2025');
  });

  it('lets an override beat a parsed value', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'dd', {
        overrideTokens: { dd: '77' },
      }),
    ).toBe('77');
  });

  it('supports a function override', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'dd', {
        overrideTokens: { dd: (p) => 'X' + p.day },
      }),
    ).toBe('X25');
  });
});

describe('unproducible tokens', () => {
  it('throws when data is missing', () => {
    expect(() => formatDate('2025', 'yyyy', 'MM/dd/yyyy')).toThrow(
      expect.objectContaining({ code: ERROR_CODES.UNPRODUCIBLE_TOKEN }),
    );
  });

  it('names the token in the message', () => {
    expect(() => formatDate('2025', 'yyyy', 'MM/dd/yyyy')).toThrow(
      /Cannot produce token "MM"/,
    );
  });

  it('falls back to the literal name in silent mode', () => {
    expect(
      formatDate('2025', 'yyyy', 'MM/dd/yyyy', { errorPolicy: 'silent' }),
    ).toBe('MM/dd/2025');
  });

  it('falls back for an out-of-range month in silent mode', () => {
    expect(
      formatDate('20251301', 'yyyyMMdd', 'MMM', { errorPolicy: 'silent' }),
    ).toBe('MMM');
    expect(
      formatDate('20251301', 'yyyyMMdd', 'MMMM', { errorPolicy: 'silent' }),
    ).toBe('MMMM');
  });

  it('never emits the string null or undefined', () => {
    for (const out of ['MMM', 'MMMM', 'M', 'mm', 'yy', 's']) {
      const r = formatDate('2025', 'yyyy', out, { errorPolicy: 'silent' });
      expect(r).not.toContain('null');
      expect(r).not.toContain('undefined');
    }
  });
});

describe('silent mode never throws on bad data', () => {
  const hostile = [
    ['', 'yyyyMMdd', 'dd/MM/yyyy'],
    ['not-a-date', 'yyyyMMdd', 'dd/MM/yyyy'],
    ['2025', 'yyyy', 'MMM'],
    ['20251301', 'yyyyMMdd', 'MMM'],
    ['20250001', 'yyyyMMdd', 'MMMM'],
    ['20250425', 'yyyyMMdd', 'HHmmss'],
    ['20250425', 'yyyyMMdd', 'unknownThing'],
    ['\uFEFF20250425', 'yyyyMMdd', 'dd/MM/yyyy'],
    ['20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy'],
    ['20250425', 'zzz', 'dd/MM/yyyy'],
  ];

  it.each(hostile)('does not throw for %j %j %j', (a, b, c) => {
    expect(() => formatDate(a, b, c, { errorPolicy: 'silent' })).not.toThrow();
  });

  it('still returns a string', () => {
    for (const [a, b, c] of hostile) {
      expect(typeof formatDate(a, b, c, { errorPolicy: 'silent' })).toBe(
        'string',
      );
    }
  });

  it('returns the raw input when the format cannot be honoured', () => {
    expect(
      formatDate('nope', 'yyyyMMdd', 'dd/MM/yyyy', { errorPolicy: 'silent' }),
    ).toBe('nope');
  });

  it('returns a best-effort value when only some fields are missing', () => {
    expect(
      formatDate('2025', 'yyyy', 'yyyy-MM', { errorPolicy: 'silent' }),
    ).toBe('2025-MM');
  });

  it('swallows a throwing custom handler', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'X', {
        errorPolicy: 'silent',
        customTokens: {
          X: () => {
            throw new Error('handler exploded');
          },
        },
      }),
    ).toBe('X');
  });
});

describe('silent mode does not hide caller mistakes', () => {
  // Silent suppresses data errors, not programmer errors: passing a non-string
  // is a bug in the calling code and must surface rather than be papered over.
  const badCalls = [
    () => formatDate(null, 'yyyy', 'yyyy', { errorPolicy: 'silent' }),
    () => formatDate(undefined, 'yyyy', 'yyyy', { errorPolicy: 'silent' }),
    () => formatDate(42, 'yyyy', 'yyyy', { errorPolicy: 'silent' }),
    () => formatDate('2025', null, 'yyyy', { errorPolicy: 'silent' }),
    () => formatDate('2025', 'yyyy', null, { errorPolicy: 'silent' }),
    () => formatDate('2025', 'yyyy', 'yyyy', null),
  ];

  it.each(badCalls)('throws a typed INVALID_ARGUMENT error', (call) => {
    let caught;
    try {
      call();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DateFormatError);
    expect(caught.code).toBe(ERROR_CODES.INVALID_ARGUMENT);
  });

  it('throws for an invalid errorPolicy even in silent mode', () => {
    let caught;
    try {
      formatDate('2025', 'yyyy', 'yyyy', { errorPolicy: 'slient' });
    } catch (err) {
      caught = err;
    }
    expect(caught.code).toBe(ERROR_CODES.INVALID_OPTION);
  });
});

describe('range validation', () => {
  it('is off by default', () => {
    expect(formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('45/13/2025');
  });

  it('rejects an impossible month in strict mode', () => {
    expect(() =>
      formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.OUT_OF_RANGE }));
  });

  it('rejects 31 April in strict mode', () => {
    expect(() =>
      formatDate('20250431', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' }),
    ).toThrow(/day 31/);
  });

  it('accepts 29 February in a leap year', () => {
    expect(
      formatDate('20240229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' }),
    ).toBe('29/02/2024');
  });

  it('rejects 29 February in a common year', () => {
    expect(() =>
      formatDate('20250229', 'yyyyMMdd', 'dd/MM/yyyy', { validate: 'strict' }),
    ).toThrow(/day 29/);
  });

  it('clamps out-of-range values in lenient mode', () => {
    expect(
      formatDate('20250425992500', 'yyyyMMddHHmmss', 'HH:mm:ss', {
        validate: 'lenient',
      }),
    ).toBe('23:25:00');
  });

  it('does not clamp valid values', () => {
    expect(
      formatDate('20250425030709', 'yyyyMMddHHmmss', 'HH:mm:ss', {
        validate: 'lenient',
      }),
    ).toBe('03:07:09');
  });

  it('still returns raw input in silent mode when clamped data is invalid', () => {
    const out = formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
      errorPolicy: 'silent',
    });
    expect(typeof out).toBe('string');
  });
});

describe('strictTokens', () => {
  it('treats an unknown word as literal text by default', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'Week 12 of yyyy')).toBe(
      'Week 12 of 2025',
    );
  });

  it('rejects an unknown word when strictTokens is on', () => {
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', 'Week yyyy', { strictTokens: true }),
    ).toThrow(/Unknown token "Week"/);
  });

  it('still allows bracketed literals under strictTokens', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', '[Week] yyyy', { strictTokens: true }),
    ).toBe('Week 2025');
  });

  it('still allows a declared custom token under strictTokens', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'yyyy-Q', {
        strictTokens: true,
        customTokens: { Q: () => 'Q1' },
      }),
    ).toBe('2025-Q1');
  });

  it('still allows punctuation under strictTokens', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', { strictTokens: true }),
    ).toBe('25/04/2025');
  });
});

describe('verifyLiterals option', () => {
  it('still converts a correctly separated input when disabled', () => {
    expect(
      formatDate('2025-04-25', 'yyyy-MM-dd', 'dd/MM/yyyy', {
        verifyLiterals: false,
      }),
    ).toBe('25/04/2025');
  });

  it('reports a mismatched separator even when disabled, because skipping it desynchronises the cursor', () => {
    expect(() =>
      formatDate('20250425', 'yyyy-MM-dd', 'MM/yyyy', {
        verifyLiterals: false,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INPUT_MISMATCH }));
  });

  it('returns the raw input for that case in silent mode', () => {
    expect(
      formatDate('20250425', 'yyyy-MM-dd', 'MM/yyyy', {
        verifyLiterals: false,
        errorPolicy: 'silent',
      }),
    ).toBe('20250425');
  });

  it('does not disable corrupt-token or trailing-input detection', () => {
    expect(() =>
      formatDate('2025AB25', 'yyyyMMdd', 'dd/MM/yyyy', {
        verifyLiterals: false,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INPUT_MISMATCH }));
    expect(() =>
      formatDate('20250425JUNK', 'yyyyMMdd', 'dd/MM/yyyy', {
        verifyLiterals: false,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INPUT_MISMATCH }));
  });
});

describe('determinism', () => {
  it('produces the same output for repeated calls', () => {
    const args = ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'];
    const first = formatDate(...args);
    for (let i = 0; i < 5; i++) expect(formatDate(...args)).toBe(first);
  });

  it('does not leak options between calls', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
        overrideTokens: { dd: '01' },
      }),
    ).toBe('01/04/2025');
    expect(formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('25/04/2025');
  });

  it('does not mutate the caller options object', () => {
    const options = {
      overrideTokens: { dd: '01' },
      defaultTokens: { MM: '04' },
    };
    const snapshot = JSON.stringify(options);
    formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', options);
    expect(JSON.stringify(options)).toBe(snapshot);
  });

  it('handles interleaved formats without cross-talk', () => {
    const a = formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
    const b = formatDate('20250425', 'yyyyMMdd', 'yyyy-MM-dd');
    expect(a).toBe('25/04/2025');
    expect(b).toBe('2025-04-25');
    expect(formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe(a);
  });
});
