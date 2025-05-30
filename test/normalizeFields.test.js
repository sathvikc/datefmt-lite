import { normalizeFields } from '../src/normalizeFields.js';

describe('normalizeFields', () => {
  it('should map yyyy token to year', () => {
    const tokens = { yyyy: 2025, MM: 4, dd: 12, tokens: ['yyyy', 'MM', 'dd'] };
    const parts = normalizeFields(tokens);
    expect(parts).toEqual({
      tokens: ['yyyy', 'MM', 'dd'],
      year: 2025,
      month: 4,
      day: 12,
      hour: null,
      minute: null,
      second: null,
    });
  });

  it('should use yearConverter for yy token', () => {
    const tokens = { yy: 25, M: 1, d: 9, tokens: ['yy', 'M', 'd'] };
    const conv = (raw) => 1900 + raw;
    const parts = normalizeFields(tokens, { yearConverter: conv });
    expect(parts.year).toBe(1925);
    expect(parts.month).toBe(1);
    expect(parts.day).toBe(9);
  });

  it('should throw error when converting yy to yyyy and no converter provided', () => {
    const tokens = { yy: 99, MM: 12, dd: 31, tokens: ['yy', 'MM', 'dd'] };

    expect(() => normalizeFields(tokens)).toThrow(
      'yearConverter is required when using two-digit year "yy" format'
    );
  });

  it('should prefer MM over M, and dd over d', () => {
    const tokens = {
      MM: 11,
      M: 3,
      dd: 5,
      d: 1,
      tokens: ['MM', 'M', 'dd', 'd'],
    };
    const parts = normalizeFields(tokens);
    expect(parts.month).toBe(11);
    expect(parts.day).toBe(5);
  });

  it('should map hour/minute/second tokens correctly', () => {
    const tokens = {
      HH: 23,
      H: 5,
      mm: 7,
      m: 2,
      ss: 45,
      s: 3,
      tokens: ['HH', 'mm', 'ss'],
    };
    const parts = normalizeFields(tokens);
    expect(parts.hour).toBe(23);
    expect(parts.minute).toBe(7);
    expect(parts.second).toBe(45);
  });

  it('should preserve the original tokens array', () => {
    const seen = ['yy', 'MM', 'dd'];
    const parts = normalizeFields(
      { yy: 21, MM: 6, dd: 15, tokens: seen },
      { errorPolicy: 'silent' }
    );
    expect(parts.tokens).toStrictEqual(seen);
  });

  it('should default tokens to an empty array when none provided', () => {
    const parts = normalizeFields({ yyyy: 2021, MM: 7, dd: 20 });
    expect(parts.tokens).toStrictEqual([]);
  });

  it('should handle non-array tokens by defaulting to empty array', () => {
    const tokens = { yy: 30, M: 12, d: 31, tokens: 'not-an-array' };
    const parts = normalizeFields(tokens, { yearConverter: (y) => 2000 + y });
    expect(parts.tokens).toStrictEqual([]);
  });

  it('should prefer yyyy over yy when both are present', () => {
    const tokens = {
      yyyy: 1999,
      yy: 49,
      MM: 10,
      dd: 5,
      tokens: ['yyyy', 'yy', 'MM', 'dd'],
    };
    const parts = normalizeFields(tokens, { yearConverter: (y) => 1900 + y });
    expect(parts.year).toBe(1999);
  });

  it('should leave fields null when tokens are missing', () => {
    const parts = normalizeFields({ H: 15, m: 45, tokens: ['H', 'm'] });
    expect(parts.year).toBeNull();
    expect(parts.month).toBeNull();
    expect(parts.day).toBeNull();
    expect(parts.hour).toBe(15);
    expect(parts.minute).toBe(45);
    expect(parts.second).toBeNull();
  });

  it('should propagate errors thrown by yearConverter', () => {
    const tokens = { yy: 75, M: 6, d: 14, tokens: ['yy', 'M', 'd'] };
    const badConverter = () => {
      throw new Error('converter failed');
    };
    expect(() =>
      normalizeFields(tokens, { yearConverter: badConverter })
    ).toThrow('converter failed');
  });

  it('should map single-digit seconds token correctly', () => {
    const parts = normalizeFields(
      { tokens: ['s'], s: '7' }
    );
    expect(parts.second).toBe(7);
    expect(parts.tokens).toEqual(['s']);
  });
});
