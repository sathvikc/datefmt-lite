import {
  BUILTIN_TOKENS,
  DEFAULT_HANDLERS,
  FIELD_GROUPS,
  FIELD_PREFERENCE,
  MONTH_ABBREV,
  MONTH_NAMES,
  TOKEN_FIELD_MAP,
  TOKEN_REGISTRY,
  parseMonthName,
} from '../src/handlers.js';

const parts = (o) => ({
  year: null,
  month: null,
  day: null,
  hour: null,
  minute: null,
  second: null,
  tokens: [],
  ...o,
});

describe('month tables', () => {
  it('exposes twelve full month names', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
  });

  it('exposes three-letter abbreviations', () => {
    expect(MONTH_ABBREV).toHaveLength(12);
    expect(MONTH_ABBREV[3]).toBe('Apr');
    expect(MONTH_ABBREV[8]).toBe('Sep');
  });

  it('freezes both tables', () => {
    expect(Object.isFrozen(MONTH_NAMES)).toBe(true);
    expect(Object.isFrozen(MONTH_ABBREV)).toBe(true);
  });

  it('cannot be mutated by a consumer', () => {
    expect(() => {
      'use strict';
      MONTH_NAMES[3] = 'MUTATED';
    }).toThrow();
    expect(MONTH_NAMES[3]).toBe('April');
  });
});

describe('parseMonthName', () => {
  it.each([
    ['January', 1],
    ['january', 1],
    ['JANUARY', 1],
    ['Jan', 1],
    ['jan', 1],
    ['April', 4],
    ['apr', 4],
    ['April'.toLowerCase(), 4],
    ['december', 12],
    ['dec', 12],
  ])('parses %s to %i', (text, expected) => {
    expect(parseMonthName(text)).toBe(expected);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseMonthName('  Apr  ')).toBe(4);
  });

  it.each(['nope', '', 'Ap', 'Aprx', '13', 'Aprilx'])(
    'returns null for %s',
    (text) => expect(parseMonthName(text)).toBeNull(),
  );

  it('returns null for a non-string', () => {
    expect(parseMonthName(null)).toBeNull();
    expect(parseMonthName(4)).toBeNull();
    expect(parseMonthName(undefined)).toBeNull();
  });
});

describe('TOKEN_REGISTRY', () => {
  it('declares exactly the fourteen built-in tokens', () => {
    expect([...BUILTIN_TOKENS].sort()).toEqual(
      [
        'MM',
        'MMM',
        'MMMM',
        'M',
        'H',
        'HH',
        'd',
        'dd',
        'm',
        'mm',
        's',
        'ss',
        'yy',
        'yyyy',
      ].sort(),
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TOKEN_REGISTRY)).toBe(true);
  });

  it('marks the single-digit tokens as variable width', () => {
    for (const token of ['M', 'd', 'H', 'm', 's']) {
      expect(TOKEN_REGISTRY[token].variable).toBe(true);
      expect(TOKEN_REGISTRY[token].width).toBe(2);
    }
  });

  it('marks the double-digit tokens as fixed width', () => {
    for (const token of ['MM', 'dd', 'HH', 'mm', 'ss', 'yy']) {
      expect(TOKEN_REGISTRY[token].variable).toBe(false);
      expect(TOKEN_REGISTRY[token].width).toBe(2);
    }
    expect(TOKEN_REGISTRY.yyyy.width).toBe(4);
  });

  it('marks the textual tokens and gives them a parser', () => {
    expect(TOKEN_REGISTRY.MMM.text).toBe(true);
    expect(TOKEN_REGISTRY.MMMM.text).toBe(true);
    expect(typeof TOKEN_REGISTRY.MMM.parse).toBe('function');
    expect(typeof TOKEN_REGISTRY.MMMM.parse).toBe('function');
  });

  it('gives every token a field and a handler', () => {
    for (const [token, spec] of Object.entries(TOKEN_REGISTRY)) {
      expect(typeof spec.field).toBe('string');
      expect(typeof spec.handler).toBe('function');
      expect(spec.handler).toBeInstanceOf(Function);
      expect(token).toBeTruthy();
    }
  });
});

describe('derived tables', () => {
  it('freezes DEFAULT_HANDLERS, TOKEN_FIELD_MAP and FIELD_GROUPS', () => {
    expect(Object.isFrozen(DEFAULT_HANDLERS)).toBe(true);
    expect(Object.isFrozen(TOKEN_FIELD_MAP)).toBe(true);
    expect(Object.isFrozen(FIELD_GROUPS)).toBe(true);
  });

  it('maps every token to the right field', () => {
    expect(TOKEN_FIELD_MAP.yyyy).toBe('year');
    expect(TOKEN_FIELD_MAP.MMMM).toBe('month');
    expect(TOKEN_FIELD_MAP.dd).toBe('day');
    expect(TOKEN_FIELD_MAP.HH).toBe('hour');
    expect(TOKEN_FIELD_MAP.mm).toBe('minute');
    expect(TOKEN_FIELD_MAP.ss).toBe('second');
  });

  it('groups tokens by field', () => {
    expect(FIELD_GROUPS.year).toEqual(expect.arrayContaining(['yyyy', 'yy']));
    expect(FIELD_GROUPS.month.sort()).toEqual(['M', 'MM', 'MMM', 'MMMM']);
    expect(FIELD_GROUPS.day.sort()).toEqual(['d', 'dd']);
  });

  it('prefers the widest token per field', () => {
    expect(FIELD_PREFERENCE.month[0]).toBe('MMMM');
    expect(FIELD_PREFERENCE.year[0]).toBe('yyyy');
    expect(FIELD_PREFERENCE.month).toHaveLength(4);
  });

  it('exposes handlers with no prototype so toString is not a token', () => {
    expect(DEFAULT_HANDLERS.toString).toBeUndefined();
    expect(DEFAULT_HANDLERS.__proto__).toBeUndefined();
  });
});

describe('built-in handlers', () => {
  const empty = parts({});

  describe('yyyy', () => {
    it('zero-pads to four digits', () => {
      expect(DEFAULT_HANDLERS.yyyy(parts({ year: 2025 }))).toBe('2025');
      expect(DEFAULT_HANDLERS.yyyy(parts({ year: 45 }))).toBe('0045');
      expect(DEFAULT_HANDLERS.yyyy(parts({ year: 5 }))).toBe('0005');
    });

    it('returns null when the year is missing', () => {
      expect(DEFAULT_HANDLERS.yyyy(empty)).toBeNull();
    });
  });

  describe('yy', () => {
    it('takes the last two digits', () => {
      expect(DEFAULT_HANDLERS.yy(parts({ year: 2025 }))).toBe('25');
      expect(DEFAULT_HANDLERS.yy(parts({ year: 1999 }))).toBe('99');
    });

    it('zero-pads single-digit years', () => {
      expect(DEFAULT_HANDLERS.yy(parts({ year: 5 }))).toBe('05');
      expect(DEFAULT_HANDLERS.yy(parts({ year: 0 }))).toBe('00');
    });

    it('returns null when the year is missing', () => {
      expect(DEFAULT_HANDLERS.yy(empty)).toBeNull();
    });
  });

  describe('MMM / MMMM', () => {
    it('renders full and abbreviated names', () => {
      expect(DEFAULT_HANDLERS.MMMM(parts({ month: 4 }))).toBe('April');
      expect(DEFAULT_HANDLERS.MMM(parts({ month: 4 }))).toBe('Apr');
    });

    it('renders the first and last months', () => {
      expect(DEFAULT_HANDLERS.MMMM(parts({ month: 1 }))).toBe('January');
      expect(DEFAULT_HANDLERS.MMMM(parts({ month: 12 }))).toBe('December');
    });

    it('returns null for a missing month', () => {
      expect(DEFAULT_HANDLERS.MMM(empty)).toBeNull();
      expect(DEFAULT_HANDLERS.MMMM(empty)).toBeNull();
    });

    it('returns null for an out-of-range month instead of throwing', () => {
      for (const month of [0, 13, -1, 99]) {
        expect(DEFAULT_HANDLERS.MMM(parts({ month }))).toBeNull();
        expect(DEFAULT_HANDLERS.MMMM(parts({ month }))).toBeNull();
      }
    });
  });

  describe('numeric tokens', () => {
    it.each([
      ['MM', 'month', 4, '04'],
      ['M', 'month', 4, '4'],
      ['dd', 'day', 9, '09'],
      ['d', 'day', 9, '9'],
      ['HH', 'hour', 3, '03'],
      ['H', 'hour', 3, '3'],
      ['mm', 'minute', 7, '07'],
      ['m', 'minute', 7, '7'],
      ['ss', 'second', 9, '09'],
      ['s', 'second', 9, '9'],
    ])('%s renders %s', (token, field, value, expected) => {
      expect(DEFAULT_HANDLERS[token](parts({ [field]: value }))).toBe(expected);
    });

    it.each(['MM', 'M', 'dd', 'd', 'HH', 'H', 'mm', 'm', 'ss', 's'])(
      '%s returns null when its field is missing',
      (token) => expect(DEFAULT_HANDLERS[token](empty)).toBeNull(),
    );
  });

  it('never throws for any handler with any field value', () => {
    const values = [null, undefined, 0, -1, 1.5, 99, 1000, NaN, Infinity];
    for (const token of BUILTIN_TOKENS) {
      for (const value of values) {
        for (const field of [
          'year',
          'month',
          'day',
          'hour',
          'minute',
          'second',
        ]) {
          expect(() =>
            DEFAULT_HANDLERS[token](parts({ [field]: value })),
          ).not.toThrow();
        }
      }
    }
  });

  it('never returns the string "null" or "undefined"', () => {
    for (const token of BUILTIN_TOKENS) {
      const out = DEFAULT_HANDLERS[token](empty);
      expect(out === null || typeof out === 'string').toBe(true);
      if (typeof out === 'string') {
        expect(out).not.toContain('null');
        expect(out).not.toContain('undefined');
      }
    }
  });
});
