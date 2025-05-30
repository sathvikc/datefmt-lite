import { validateOutput } from '../src/validateOutput.js';
import { DEFAULT_HANDLERS } from '../src/handlers.js';

describe('validateOutput', () => {
  const handlers = DEFAULT_HANDLERS;
  const customTokens = {};

  test('should throw for unknown token in throw mode', () => {
    expect(() =>
      validateOutput({
        parsedTokens: [],
        outputFormat: 'QQ',
        handlers,
        customTokens,
        defaultTokens: {},
        overrideTokens: {},
        errorPolicy: 'throw',
      })
    ).toThrow('Unknown token "QQ" in output format');
  });

  test('should fallback unknown token in silent mode', () => {
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: 'QQ',
      handlers,
      customTokens,
      defaultTokens: {},
      overrideTokens: {},
      errorPolicy: 'silent',
    });
    expect(result).toEqual({ QQ: 'QQ' });
  });

  test('should promote defaultTokens when not in parsedTokens', () => {
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: '',
      handlers,
      customTokens,
      defaultTokens: { ss: '00' },
      overrideTokens: {},
      errorPolicy: 'throw',
    });
    expect(result).toEqual({ ss: '00' });
  });

  test('should not promote defaultTokens if parsedTokens includes the token', () => {
    const result = validateOutput({
      parsedTokens: ['ss'],
      outputFormat: '',
      handlers,
      customTokens,
      defaultTokens: { ss: '00' },
      overrideTokens: {},
      errorPolicy: 'throw',
    });
    expect(result).toEqual({});
  });

  test('should preserve overrideTokens when no defaultTokens conflict', () => {
    const overrideFn = () => 'override';
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: '',
      handlers,
      customTokens,
      defaultTokens: {},
      overrideTokens: { MM: overrideFn },
      errorPolicy: 'throw',
    });
    expect(result).toEqual({ MM: overrideFn });
  });

  test('should let defaultTokens override overrideTokens when conflict', () => {
    const overrideFn = () => 'override';
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: '',
      handlers,
      customTokens,
      defaultTokens: { ss: '00' },
      overrideTokens: { ss: overrideFn },
      errorPolicy: 'throw',
    });
    // defaultTokens promotion replaces the override
    expect(result).toEqual({ ss: '00' });
  });

  test('should throw when known token is not produceable in throw mode', () => {
    expect(() =>
      validateOutput({
        parsedTokens: [],
        outputFormat: 'yyyy',
        handlers,
        customTokens,
        defaultTokens: {},
        overrideTokens: {},
        errorPolicy: 'throw',
      })
    ).toThrow('Cannot produce token "yyyy" — no data or default');
  });

  test('should fallback known but unrenderable token in silent mode', () => {
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: 'yyyy',
      handlers,
      customTokens,
      defaultTokens: {},
      overrideTokens: {},
      errorPolicy: 'silent',
    });
    expect(result).toEqual({ yyyy: 'yyyy' });
  });

  test('should derive yyyy when yy is parsed', () => {
    const result = validateOutput({
      parsedTokens: ['yy'],
      outputFormat: 'yyyy',
      handlers,
      customTokens,
      defaultTokens: {},
      overrideTokens: {},
      errorPolicy: 'throw',
    });
    expect(result).toEqual({});
  });

  test('should throw for non-derived tokens when only yy is parsed in throw mode', () => {
    expect(() =>
      validateOutput({
        parsedTokens: ['yy'],
        outputFormat: 'yyyy-MM',
        handlers,
        customTokens,
        defaultTokens: {},
        overrideTokens: {},
        errorPolicy: 'throw',
      })
    ).toThrow('Cannot produce token "MM" — no data or default');
  });

  test('should fallback non-derived tokens when only yy is parsed in silent mode', () => {
    const result = validateOutput({
      parsedTokens: ['yy'],
      outputFormat: 'yyyy-MM',
      handlers,
      customTokens,
      defaultTokens: {},
      overrideTokens: {},
      errorPolicy: 'silent',
    });
    // 'yyyy' is derived; 'MM' falls back
    expect(result).toEqual({ MM: 'MM' });
  });

  test('should handle multiple tokens with mixed promotion and fallback', () => {
    const result = validateOutput({
      parsedTokens: ['yy'],
      outputFormat: 'yyyy-MM-dd',
      handlers,
      customTokens,
      defaultTokens: { dd: '30' },
      overrideTokens: {},
      errorPolicy: 'silent',
    });
    // 'dd' from defaultTokens; 'yyyy' derived; 'MM' fallback
    expect(result).toEqual({ dd: '30', MM: 'MM' });
  });

  test('should fallback literal words as tokens in silent mode', () => {
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: 'Today is yyyy',
      handlers,
      customTokens,
      defaultTokens: {},
      overrideTokens: {},
      errorPolicy: 'silent',
    });
    expect(result).toEqual({
      Today: 'Today',
      is: 'is',
      yyyy: 'yyyy',
    });
  });

  test('should throw on literal words in throw mode', () => {
    expect(() =>
      validateOutput({
        parsedTokens: [],
        outputFormat: 'no tokens here',
        handlers,
        customTokens,
        defaultTokens: {},
        overrideTokens: {},
        errorPolicy: 'throw',
      })
    ).toThrow('Unknown token "no" in output format');
  });

  test('should return only defaultTokens when outputFormat has no tokens in silent mode', () => {
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: '',
      handlers,
      customTokens,
      defaultTokens: { hh: '00', mm: '59' },
      overrideTokens: {},
      errorPolicy: 'silent',
    });
    expect(result).toEqual({ hh: '00', mm: '59' });
  });

  test('should use default empty configs when optional params omitted', () => {
    // omit customTokens, defaultTokens, overrideTokens, errorPolicy
    const result = validateOutput({
      parsedTokens: [],
      outputFormat: '',
      handlers: DEFAULT_HANDLERS,
    });
    expect(result).toEqual({});
  });

  test('should default to throw errorPolicy when errorPolicy omitted', () => {
    // default errorPolicy = 'throw'
    expect(() =>
      validateOutput({
        parsedTokens: [],
        outputFormat: 'ZZ',
        handlers: DEFAULT_HANDLERS,
      })
    ).toThrow('Unknown token "ZZ" in output format');
  });
});
