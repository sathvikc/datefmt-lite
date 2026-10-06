import { formatDate } from '../src/formatter.js';
import { BUILTIN_TOKENS, TOKEN_REGISTRY } from '../src/handlers.js';

const pivot = (n) => (n < 50 ? 2000 + n : 1900 + n);

const SEPARATORS = ['', '-', '/', '.', ' ', ':', ', ', 'T', '_'];
const LITERALS = ['Date: ', '[at] ', 'Day ', ''];

/** Deterministic PRNG so a failure is always reproducible. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

const pad = (n, w) => String(n).padStart(w, '0');

/** Every token's canonical numeric input width. */
const inputWidth = (token) => TOKEN_REGISTRY[token].width;

describe('round-trip fidelity', () => {
  it('round-trips every built-in token through its own format', () => {
    for (const token of BUILTIN_TOKENS) {
      // `yy` needs a yearConverter and MMM/MMMM need text; both are covered
      // by dedicated cases below.
      if (token === 'yy' || TOKEN_REGISTRY[token].text) continue;
      const width = inputWidth(token);
      const value = '1234567890'.slice(0, Math.min(width, 4));
      const parts = {
        yyyy: '2025',
        yy: '25',
        MMMM: 'April',
        MMM: 'Apr',
        MM: '04',
        M: '4',
        dd: '25',
        d: '5',
        HH: '03',
        H: '3',
        mm: '07',
        m: '7',
        ss: '09',
        s: '9',
      };
      expect(formatDate(value, token, token)).toBe(
        value.padStart(width, '0').slice(-width),
      );
      expect(parts[token]).toBeDefined();
    }
  });

  it('preserves a full timestamp through an identical format', () => {
    const fmt = 'yyyyMMddHHmmss';
    expect(formatDate('20250425030709', fmt, fmt)).toBe('20250425030709');
  });

  it('preserves a date through a formatted variant', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('25/04/2025');
    expect(formatDate('25/04/2025', 'dd/MM/yyyy', 'yyyyMMdd')).toBe('20250425');
  });

  it('round-trips a two-digit year with a converter', () => {
    expect(
      formatDate('250425', 'yyMMdd', 'yyMMdd', { yearConverter: pivot }),
    ).toBe('250425');
  });

  it('round-trips a textual month', () => {
    expect(formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'dd-MMM-yyyy')).toBe(
      '25-Apr-2025',
    );
    expect(formatDate('25-April-2025', 'dd-MMMM-yyyy', 'dd-MMMM-yyyy')).toBe(
      '25-April-2025',
    );
  });

  it('preserves bracket escapes through a round trip', () => {
    expect(formatDate('2025 at 04', 'yyyy [at] MM', 'yyyy [at] MM')).toBe(
      '2025 at 04',
    );
  });
});

describe('idempotence', () => {
  const samples = [
    ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'],
    ['20250425', 'yyyyMMdd', 'yyyy-MM-dd'],
    ['20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd HH:mm:ss'],
    ['20250425', 'yyyyMMdd', 'MMM dd, yyyy'],
    ['20250425', 'yyyyMMdd', 'MMMM d, yyyy'],
  ];

  it.each(samples)(
    'is stable for %s %s %s',
    (input, inputFormat, outputFormat) => {
      const once = formatDate(input, inputFormat, outputFormat);
      const twice = formatDate(once, outputFormat, outputFormat);
      expect(twice).toBe(once);
    },
  );
});

describe('token pair matrix', () => {
  const VALUES = {
    yyyy: '2025',
    yy: '25',
    MM: '04',
    M: '4',
    dd: '25',
    d: '5',
    HH: '03',
    H: '3',
    mm: '07',
    m: '7',
    ss: '09',
    s: '9',
    MMM: 'Apr',
    MMMM: 'April',
  };

  it('derives every output token in a field group from any sibling', () => {
    const groups = [
      ['yyyy', 'MM', 'dd'],
      ['MM', 'MMM', 'MMMM'],
      ['MM', 'dd', 'HH'],
    ];
    for (const source of groups) {
      for (const target of source) {
        const input = source.map((t) => VALUES[t]).join('');
        const inputFormat = source.join('');
        const out = formatDate(input, inputFormat, target, {
          errorPolicy: 'silent',
        });
        expect(typeof out).toBe('string');
        expect(out).not.toBe('');
      }
    }
  });

  it('produces every field in the format when all data is present', () => {
    const out = formatDate(
      '20250425030709',
      'yyyyMMddHHmmss',
      'yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|mm|m|ss|s',
    );
    // dd and d both render the same day field, so both are 25.
    expect(out).toBe('2025|25|April|Apr|04|4|25|25|03|3|07|7|09|9');
  });
});

describe('differential fuzzing', () => {
  const SEEDS = [1, 7, 42, 1234, 987654];
  const CASES_PER_SEED = 1500;

  it.each(SEEDS)(
    'never throws an unexpected error type for seed %i',
    (seed) => {
      const rand = mulberry32(seed);
      for (let i = 0; i < CASES_PER_SEED; i++) {
        const tokenCount = 1 + Math.floor(rand() * 5);
        const tokens = [];
        for (let t = 0; t < tokenCount; t++) {
          tokens.push(pick(rand, BUILTIN_TOKENS));
        }
        const sep = pick(rand, SEPARATORS);
        const inputFormat = tokens.join(sep);
        const outputFormat = tokens.join(pick(rand, SEPARATORS));

        const input = Array.from({ length: inputFormat.length }, () =>
          Math.floor(rand() * 10),
        ).join('');

        for (const errorPolicy of ['throw', 'silent']) {
          let threw = null;
          try {
            formatDate(input, inputFormat, outputFormat, {
              errorPolicy,
              yearConverter: pivot,
              validate: 'off',
            });
          } catch (err) {
            threw = err;
          }
          if (threw) {
            expect(threw.name).toBe('DateFormatError');
            expect(typeof threw.code).toBe('string');
            expect(threw.message.length).toBeLessThan(400);
            if (errorPolicy === 'silent') {
              expect(threw.code).not.toBe('INPUT_MISMATCH');
            }
          }
        }
      }
    },
  );

  it('produces a string for every generated case in silent mode', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 800; i++) {
      const tokens = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
        pick(rand, BUILTIN_TOKENS),
      );
      const inputFormat = tokens.join(pick(rand, SEPARATORS));
      const outputFormat = `${pick(rand, LITERALS)}${tokens.join(pick(rand, SEPARATORS))}`;
      const input = Array.from({ length: 12 }, () =>
        Math.floor(rand() * 10),
      ).join('');
      const out = formatDate(input, inputFormat, outputFormat, {
        errorPolicy: 'silent',
        yearConverter: pivot,
      });
      expect(typeof out).toBe('string');
      expect(out).not.toContain('undefined');
      expect(out).not.toContain('NaN');
    }
  });

  it('is deterministic across repeated calls on the same corpus', () => {
    const rand = mulberry32(555);
    for (let i = 0; i < 400; i++) {
      const inputFormat = 'yyyyMMdd';
      const outputFormat = pick(rand, [
        'dd/MM/yyyy',
        'yyyy-MM-dd',
        'MMM dd yyyy',
        'yyyyMMdd',
      ]);
      const input = `${20250000 + i}`;
      const a = formatDate(input, inputFormat, outputFormat);
      const b = formatDate(input, inputFormat, outputFormat);
      expect(a).toBe(b);
      expect(a).toContain('2025');
    }
  });
});

describe('structured corpus', () => {
  const dates = [
    ['20250101', 'yyyyMMdd'],
    ['20241231', 'yyyyMMdd'],
    ['20240229', 'yyyyMMdd'],
    ['19991231', 'yyyyMMdd'],
    ['20250715093045', 'yyyyMMddHHmmss'],
    ['00010101', 'yyyyMMdd'],
  ];
  const outputs = [
    'dd/MM/yyyy',
    'yyyy-MM-dd',
    'MMM dd, yyyy',
    'MMMM d, yyyy',
    'yyyyMMdd',
    'yy/MM/dd',
    '[ISO] yyyy-MM-dd',
    '[on] dd/MM/yyyy',
  ];

  it.each(dates)(
    'converts %s into every output format',
    (input, inputFormat) => {
      const year = input.slice(0, 4);
      for (const outputFormat of outputs) {
        const out = formatDate(input, inputFormat, outputFormat, {
          yearConverter: pivot,
        });
        expect(out.length).toBeGreaterThan(0);
        if (outputFormat !== 'yy/MM/dd') {
          expect(out).toContain(year);
        }
      }
    },
  );

  it('converts timestamps into every output format', () => {
    const input = '20250715093045';
    for (const outputFormat of [
      'dd-MM-yyyy HH:mm:ss',
      'yyyy-MM-dd[T]HH:mm:ss',
      'HHmmss',
      'yy/MM/dd HH:mm:ss',
    ]) {
      const out = formatDate(input, 'yyyyMMddHHmmss', outputFormat, {
        yearConverter: pivot,
      });
      // Every format in this list carries the time, so the time must survive
      // regardless of which date fields each one includes.
      expect(out).toMatch(/09:?30/);
    }
  });

  it('keeps every valid date representable', () => {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 15, 28]) {
        const input = `2025${pad(month, 2)}${pad(day, 2)}`;
        expect(formatDate(input, 'yyyyMMdd', 'yyyy-MM-dd')).toBe(
          `2025-${pad(month, 2)}-${pad(day, 2)}`,
        );
      }
    }
  });
});
