import { hasField, normalizeFields } from '../src/normalizeFields.js';
import { ERROR_CODES } from '../src/errors.js';

const nf = (tokens, values, options) =>
  normalizeFields({ tokens, values }, options);

describe('argument validation', () => {
  it.each([null, undefined, 'x', 42, true])('rejects %p', (input) => {
    expect(() => normalizeFields(input)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_ARGUMENT }),
    );
  });

  it('accepts a flat map with a tokens array', () => {
    expect(nf(['yyyy'], { yyyy: '2025' }).year).toBe(2025);
  });
});

describe('field extraction', () => {
  it('maps every field', () => {
    const out = nf(['yyyy', 'MM', 'dd', 'HH', 'mm', 'ss'], {
      yyyy: '2025',
      MM: '04',
      dd: '25',
      HH: '03',
      mm: '07',
      ss: '09',
    });
    expect(out).toMatchObject({
      year: 2025,
      month: 4,
      day: 25,
      hour: 3,
      minute: 7,
      second: 9,
    });
  });

  it('defaults every absent field to null', () => {
    const out = nf(['yyyy'], { yyyy: '2025' });
    expect(out.month).toBeNull();
    expect(out.day).toBeNull();
    expect(out.hour).toBeNull();
    expect(out.minute).toBeNull();
    expect(out.second).toBeNull();
  });

  it('accepts single-digit tokens', () => {
    const out = nf(['yyyy', 'M', 'd', 'H', 'm', 's'], {
      yyyy: '2025',
      M: '4',
      d: '5',
      H: '3',
      m: '7',
      s: '9',
    });
    expect(out).toMatchObject({
      month: 4,
      day: 5,
      hour: 3,
      minute: 7,
      second: 9,
    });
  });

  it('prefers the wider token when both are present', () => {
    expect(nf(['MM', 'M'], { MM: '04', M: '9' }).month).toBe(4);
  });

  it('falls back to the narrower token when the wider one is null', () => {
    expect(nf(['MM', 'M'], { MM: null, M: '9' }).month).toBe(9);
  });

  it('ignores an empty-string value', () => {
    expect(nf(['MM'], { MM: '' }).month).toBeNull();
  });

  it('preserves a zero value', () => {
    expect(nf(['mm'], { mm: '00' }).minute).toBe(0);
  });

  it('copies the tokens array defensively', () => {
    const tokens = ['yyyy'];
    const out = nf(tokens, { yyyy: '2025' });
    tokens.push('MM');
    expect(out.tokens).toEqual(['yyyy']);
    expect(out.tokens).not.toBe(tokens);
  });

  it('defaults tokens to an empty array', () => {
    expect(normalizeFields({ values: {} }).tokens).toEqual([]);
  });

  it('exposes a custom token as its own field', () => {
    const out = nf(['yyyy', 'Q'], { yyyy: '2025', Q: '2' });
    expect(out.Q).toBe(2);
  });

  it('leaves a custom token null when it was unreadable', () => {
    const out = nf(['yyyy', 'Q'], { yyyy: '2025', Q: null });
    expect(out.Q).toBeNull();
  });

  it.each([
    ['0x10', 'must reject hexadecimal-looking input'],
    ['1e2', 'must reject exponent notation'],
    [' 04', 'must reject padded input'],
    ['4.5', 'must reject fractional input'],
    ['+4', 'must reject signed input'],
  ])('does not coerce %s with Number()', (raw) => {
    expect(nf(['MM'], { MM: raw }).month).toBeNull();
  });

  it('accepts a zero-padded digit run', () => {
    expect(nf(['MM'], { MM: '04' }).month).toBe(4);
  });
});

describe('year handling', () => {
  it('prefers yyyy over yy', () => {
    expect(nf(['yyyy', 'yy'], { yyyy: '2025', yy: '99' }).year).toBe(2025);
  });

  it('uses yy with a converter', () => {
    expect(
      nf(['yy'], { yy: '25' }, { yearConverter: (y) => 2000 + y }).year,
    ).toBe(2025);
  });

  it('uses yy as-is in silent mode without a converter', () => {
    expect(nf(['yy'], { yy: '25' }, { errorPolicy: 'silent' }).year).toBe(25);
  });

  it('throws without a converter in throw mode', () => {
    expect(() => nf(['yy'], { yy: '25' })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_OPTION }),
    );
  });

  it('names the yy token in the error', () => {
    expect(() => nf(['yy'], { yy: '25' })).toThrow(/yearConverter/);
  });

  it.each([
    ['undefined', () => undefined],
    ['null', () => null],
    ['NaN', () => NaN],
    ['Infinity', () => Infinity],
    ['a string', () => 'abc'],
    ['a float', () => 2025.5],
    ['a negative', () => -1],
    ['an object', () => ({})],
  ])('rejects a yearConverter returning %s', (_label, fn) => {
    expect(() => nf(['yy'], { yy: '25' }, { yearConverter: fn })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_YEAR }),
    );
  });

  it('reports NaN readably rather than as null', () => {
    expect(() =>
      nf(['yy'], { yy: '25' }, { yearConverter: () => NaN }),
    ).toThrow(/received NaN/);
  });

  it('accepts year zero', () => {
    expect(nf(['yy'], { yy: '00' }, { yearConverter: () => 0 }).year).toBe(0);
  });

  it('rejects a non-numeric yyyy value', () => {
    expect(() => nf(['yyyy'], { yyyy: 'ABCD' })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_YEAR }),
    );
  });

  it('accepts a zero year from yyyy', () => {
    expect(nf(['yyyy'], { yyyy: '0000' }).year).toBe(0);
  });

  it('rejects a non-function yearConverter', () => {
    expect(() => nf(['yy'], { yy: '25' }, { yearConverter: 'nope' })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_OPTION }),
    );
  });
});

describe('hasField', () => {
  it('is true for a populated field', () => {
    expect(hasField({ month: 4 }, 'month')).toBe(true);
  });

  it('is false for null, undefined and missing keys', () => {
    expect(hasField({ month: null }, 'month')).toBe(false);
    expect(hasField({}, 'month')).toBe(false);
    expect(hasField(null, 'month')).toBe(false);
  });

  it('is false for a zero-valued-but-present field only when null', () => {
    expect(hasField({ minute: 0 }, 'minute')).toBe(true);
  });
});
