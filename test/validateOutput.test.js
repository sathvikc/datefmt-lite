import { validateOutput } from '../src/validateOutput.js';
import { ERROR_CODES } from '../src/errors.js';

const dp = (o = {}) => ({
  year: null,
  month: null,
  day: null,
  hour: null,
  minute: null,
  second: null,
  ...o,
});

const run = (args) =>
  validateOutput({
    parsedTokens: [],
    dateParts: dp(),
    outputFormat: '',
    errorPolicy: 'throw',
    ...args,
  });

const FULL = dp({
  year: 2025,
  month: 4,
  day: 25,
  hour: 3,
  minute: 7,
  second: 9,
});

describe('argument validation', () => {
  it('rejects a non-string outputFormat', () => {
    expect(() => run({ outputFormat: 42 })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_ARGUMENT }),
    );
  });
});

describe('produceable tokens', () => {
  it('returns a handler table for a fully populated date', () => {
    const table = run({
      parsedTokens: ['yyyy', 'MM', 'dd'],
      dateParts: FULL,
      outputFormat: 'dd/MM/yyyy',
    });
    expect(typeof table.dd).toBe('function');
    expect(typeof table.MM).toBe('function');
    expect(typeof table.yyyy).toBe('function');
  });

  it('allows every token in a field once one is available', () => {
    const table = run({
      parsedTokens: ['MM'],
      dateParts: FULL,
      outputFormat: 'MMMM',
    });
    expect(table.MMMM).toBeInstanceOf(Function);
  });

  it('treats a null field as unproduceable', () => {
    expect(() =>
      run({
        parsedTokens: ['MM'],
        dateParts: dp({ month: null }),
        outputFormat: 'MMM',
      }),
    ).toThrow(/Cannot produce token "MMM"/);
  });

  it('reports the token on the error', () => {
    try {
      run({ parsedTokens: [], dateParts: dp(), outputFormat: 'dd' });
    } catch (err) {
      expect(err.code).toBe(ERROR_CODES.UNPRODUCIBLE_TOKEN);
      expect(err.token).toBe('dd');
    }
  });
});

describe('precedence', () => {
  it('overrideTokens beats defaultTokens', () => {
    const table = run({
      parsedTokens: ['yyyy', 'MM'],
      dateParts: FULL,
      outputFormat: 'dd',
      overrides: { overrideTokens: { dd: '77' }, defaultTokens: { dd: '99' } },
    });
    expect(table.dd).toBe('77');
  });

  it('overrideTokens wins even when the token was parsed', () => {
    const table = run({
      parsedTokens: ['yyyy', 'MM', 'dd'],
      dateParts: FULL,
      outputFormat: 'dd',
      overrides: { overrideTokens: { dd: 'forced' } },
    });
    expect(table.dd).toBe('forced');
  });

  it('defaultTokens applies when the field has no value at all', () => {
    const table = run({
      parsedTokens: ['yyyy', 'MM'],
      dateParts: {
        year: 2025,
        month: 4,
        day: null,
        hour: null,
        minute: null,
        second: null,
      },
      outputFormat: 'dd',
      overrides: { defaultTokens: { dd: '99' } },
    });
    expect(table.dd).toBe('99');
  });

  it('defaultTokens does not displace a field parsed under a sibling token', () => {
    const table = run({
      parsedTokens: ['yyyy', 'M'],
      dateParts: FULL,
      outputFormat: 'MM',
      overrides: { defaultTokens: { MM: '11' } },
    });
    expect(table.MM).toBeInstanceOf(Function);
  });

  it('defaultTokens does not displace a custom token handler', () => {
    const custom = () => 'CUSTOM';
    const table = run({
      dateParts: FULL,
      outputFormat: 'MM',
      overrides: {
        customTokens: { MM: custom },
        defaultTokens: { MM: 'DEFAULT' },
      },
    });
    expect(table.MM).toBe(custom);
  });

  it('treats an explicit undefined override as present', () => {
    const table = run({
      dateParts: FULL,
      outputFormat: 'MM',
      overrides: {
        overrideTokens: { MM: undefined },
        defaultTokens: { MM: 'D' },
      },
    });
    expect(table.MM).toBeUndefined();
  });

  it('defaultTokens is ignored when the token was parsed', () => {
    const table = run({
      parsedTokens: ['yyyy', 'MM', 'dd'],
      dateParts: FULL,
      outputFormat: 'dd',
      overrides: { defaultTokens: { dd: '99' } },
    });
    expect(table.dd).toBeInstanceOf(Function);
  });

  it('accepts a function override', () => {
    const fn = () => 'FN';
    const table = run({
      dateParts: FULL,
      outputFormat: 'dd',
      overrides: { overrideTokens: { dd: fn } },
    });
    expect(table.dd).toBe(fn);
  });
});

describe('silent mode fallbacks', () => {
  it('falls back to the literal token name', () => {
    const table = run({
      dateParts: dp(),
      outputFormat: 'dd/MM/yyyy',
      errorPolicy: 'silent',
    });
    expect(table.dd).toBe('dd');
    expect(table.MM).toBe('MM');
    expect(table.yyyy).toBe('yyyy');
  });

  it('uses a default instead of the literal name', () => {
    const table = run({
      dateParts: dp(),
      outputFormat: 'dd',
      errorPolicy: 'silent',
      overrides: { defaultTokens: { dd: '99' } },
    });
    expect(table.dd).toBe('99');
  });
});

describe('unknown tokens', () => {
  it('treats an unrecognised word as literal text', () => {
    const table = run({ dateParts: FULL, outputFormat: 'Date: yyyy' });
    expect(table.Date).toBeUndefined();
  });

  it('does not treat a declared custom token as unknown', () => {
    const Q = () => 'Q2';
    const table = run({
      dateParts: FULL,
      outputFormat: 'yyyy-Q',
      overrides: { customTokens: { Q } },
    });
    expect(table.Q).toBe(Q);
  });

  it('allows literal punctuation under strictTokens', () => {
    expect(() =>
      run({ dateParts: FULL, outputFormat: 'dd/MM/yyyy', strictTokens: true }),
    ).not.toThrow();
  });
});

describe('table shape', () => {
  it('has no prototype', () => {
    const table = run({ dateParts: FULL, outputFormat: 'yyyy' });
    expect(Object.getPrototypeOf(table)).toBeNull();
    expect(table.toString).toBeUndefined();
  });

  it('includes every built-in handler', () => {
    const table = run({ dateParts: FULL, outputFormat: 'yyyy' });
    for (const token of [
      'yyyy',
      'yy',
      'MM',
      'M',
      'dd',
      'd',
      'HH',
      'H',
      'mm',
      'm',
      'ss',
      's',
      'MMM',
      'MMMM',
    ]) {
      expect(typeof table[token]).toBe('function');
    }
  });

  it('does not apply a default for a field that already has a value', () => {
    const table = run({
      parsedTokens: ['yyyy', 'MM', 'dd'],
      dateParts: FULL,
      outputFormat: 'yyyy',
      overrides: { defaultTokens: { dd: '01' } },
    });
    expect(table.dd).toBeInstanceOf(Function);
  });

  it('does not shadow a parsed token with an unused default', () => {
    const table = run({
      parsedTokens: ['yyyy'],
      dateParts: FULL,
      outputFormat: 'yyyy',
      overrides: { defaultTokens: { yyyy: 'nope' } },
    });
    expect(table.yyyy).toBeInstanceOf(Function);
  });
});
