import { DateFormatError, ERROR_CODES } from '../src/errors.js';

describe('ERROR_CODES', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
  });

  it('exposes the documented codes', () => {
    expect(Object.keys(ERROR_CODES).sort()).toEqual(
      [
        'INPUT_MISMATCH',
        'INVALID_ARGUMENT',
        'INVALID_OPTION',
        'INVALID_YEAR',
        'OUT_OF_RANGE',
        'RESERVED_TOKEN',
        'UNPRODUCIBLE_TOKEN',
      ].sort(),
    );
  });
});

describe('DateFormatError', () => {
  it('is an Error subclass', () => {
    const err = new DateFormatError('boom', ERROR_CODES.INVALID_ARGUMENT);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DateFormatError);
    expect(err.name).toBe('DateFormatError');
    expect(err.message).toBe('boom');
  });

  it('exposes the code', () => {
    const err = new DateFormatError('boom', ERROR_CODES.OUT_OF_RANGE);
    expect(err.code).toBe(ERROR_CODES.OUT_OF_RANGE);
  });

  it('records the offending token and field when given', () => {
    const err = new DateFormatError('boom', ERROR_CODES.UNPRODUCIBLE_TOKEN, {
      token: 'MM',
      field: 'month',
    });
    expect(err.token).toBe('MM');
    expect(err.field).toBe('month');
  });

  it('omits token and field when not given', () => {
    const err = new DateFormatError('boom', ERROR_CODES.INVALID_OPTION);
    expect('token' in err).toBe(false);
    expect('field' in err).toBe(false);
  });

  it('truncates an absurdly long token name', () => {
    const long = 'a'.repeat(5000);
    const err = new DateFormatError('boom', ERROR_CODES.UNPRODUCIBLE_TOKEN, {
      token: long,
    });
    expect(err.token).toHaveLength(65);
    expect(err.token.endsWith('…')).toBe(true);
  });

  it('keeps a token of exactly the limit intact', () => {
    const exact = 'b'.repeat(64);
    const err = new DateFormatError('boom', ERROR_CODES.UNPRODUCIBLE_TOKEN, {
      token: exact,
    });
    expect(err.token).toBe(exact);
  });

  it('produces a short message even for a huge token', () => {
    const long = 'c'.repeat(1_000_000);
    const err = new DateFormatError('boom', ERROR_CODES.UNPRODUCIBLE_TOKEN, {
      token: long,
    });
    expect(err.message.length).toBeLessThan(100);
  });

  it('coerces a non-string token safely', () => {
    const err = new DateFormatError('boom', ERROR_CODES.INVALID_OPTION, {
      token: 42,
    });
    expect(err.token).toBe('42');
  });

  it('can be caught as a TypeError-free library error', () => {
    try {
      throw new DateFormatError('x', ERROR_CODES.INVALID_ARGUMENT);
    } catch (err) {
      expect(err.code).toBeDefined();
      expect(err instanceof DateFormatError).toBe(true);
    }
  });
});
