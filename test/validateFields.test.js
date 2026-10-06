import { isRealDate, validateFields } from '../src/validateFields.js';
import { ERROR_CODES } from '../src/errors.js';

const dp = (o) => ({
  year: null,
  month: null,
  day: null,
  hour: null,
  minute: null,
  second: null,
  ...o,
});

describe('validateFields', () => {
  it('rejects an invalid mode', () => {
    expect(() => validateFields(dp({}), 'off')).toThrow(TypeError);
    expect(() => validateFields(dp({}), 'nope')).toThrow(TypeError);
  });

  it('passes a fully valid date', () => {
    expect(
      validateFields(dp({ year: 2025, month: 4, day: 25 }), 'strict'),
    ).toBeNull();
  });

  it('ignores absent fields', () => {
    expect(validateFields(dp({ year: 2025 }), 'strict')).toBeNull();
    expect(validateFields(dp({}), 'strict')).toBeNull();
  });

  describe('strict mode', () => {
    it.each([
      ['month', 0],
      ['month', 13],
      ['month', -1],
      ['day', 0],
      ['day', 32],
      ['hour', 24],
      ['hour', -1],
      ['minute', 60],
      ['second', 60],
    ])('rejects %s = %i', (field, value) => {
      const outcome = validateFields(dp({ [field]: value }), 'strict');
      expect(outcome).not.toBeNull();
      expect(outcome.fatal).toBe(true);
      expect(outcome.field).toBe(field);
      expect(outcome.message).toMatch(/out of range/);
    });

    it('rejects 31 April', () => {
      const outcome = validateFields(
        dp({ year: 2025, month: 4, day: 31 }),
        'strict',
      );
      expect(outcome).not.toBeNull();
      expect(outcome.field).toBe('day');
      expect(outcome.message).toMatch(/expected 1-30/);
    });

    it('rejects 29 February in a common year', () => {
      expect(
        validateFields(dp({ year: 2025, month: 2, day: 29 }), 'strict'),
      ).not.toBeNull();
    });

    it('accepts 29 February in a leap year', () => {
      expect(
        validateFields(dp({ year: 2024, month: 2, day: 29 }), 'strict'),
      ).toBeNull();
      expect(
        validateFields(dp({ year: 2000, month: 2, day: 29 }), 'strict'),
      ).toBeNull();
    });

    it('rejects 29 February in a century non-leap year', () => {
      expect(
        validateFields(dp({ year: 1900, month: 2, day: 29 }), 'strict'),
      ).not.toBeNull();
    });

    it('accepts 30 and 31 day months at their limits', () => {
      expect(
        validateFields(dp({ year: 2025, month: 1, day: 31 }), 'strict'),
      ).toBeNull();
      expect(
        validateFields(dp({ year: 2025, month: 12, day: 31 }), 'strict'),
      ).toBeNull();
      expect(
        validateFields(dp({ year: 2025, month: 11, day: 30 }), 'strict'),
      ).toBeNull();
    });

    it('uses the generic day limit when the year is unknown', () => {
      expect(validateFields(dp({ month: 2, day: 29 }), 'strict')).toBeNull();
    });
  });

  describe('lenient mode', () => {
    it('clamps an hour above range instead of failing', () => {
      const outcome = validateFields(dp({ hour: 99 }), 'lenient');
      expect(outcome.fatal).toBe(false);
      expect(outcome.clamped).toEqual({ hour: 23 });
    });

    it('clamps a month above range', () => {
      expect(validateFields(dp({ month: 13 }), 'lenient').clamped).toEqual({
        month: 12,
      });
    });

    it('clamps a day above the month limit', () => {
      const outcome = validateFields(
        dp({ year: 2025, month: 2, day: 31 }),
        'lenient',
      );
      expect(outcome.clamped).toEqual({ day: 28 });
    });

    it('clamps several fields at once', () => {
      const outcome = validateFields(
        dp({ year: 2025, month: 13, day: 40, hour: 25 }),
        'lenient',
      );
      expect(outcome.clamped).toEqual({ month: 12, day: 31, hour: 23 });
    });

    it('returns null when nothing needs clamping', () => {
      expect(
        validateFields(dp({ year: 2025, month: 4, day: 25 }), 'lenient'),
      ).toBeNull();
    });
  });
});

describe('isRealDate', () => {
  it.each([
    [{ year: 2025, month: 2, day: 28 }, true],
    [{ year: 2025, month: 2, day: 29 }, false],
    [{ year: 2024, month: 2, day: 29 }, true],
    [{ year: 2025, month: 4, day: 31 }, false],
    [{ year: 2025, month: 1, day: 31 }, true],
    [{ year: 2025, month: 13, day: 1 }, false],
  ])('isRealDate(%j) === %i', (input, expected) => {
    expect(isRealDate(input)).toBe(expected);
  });

  it('returns true when a component is unknown', () => {
    expect(isRealDate({ month: 2, day: 29 })).toBe(true);
    expect(isRealDate({ year: 2025, day: 31 })).toBe(true);
    expect(isRealDate({})).toBe(true);
  });
});

describe('validateFields error code', () => {
  it('is surfaced as OUT_OF_RANGE by the formatter', () => {
    expect(ERROR_CODES.OUT_OF_RANGE).toBe('OUT_OF_RANGE');
  });
});
