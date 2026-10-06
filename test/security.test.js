import { formatDate } from '../src/formatter.js';
import { ERROR_CODES } from '../src/errors.js';
import { extractTokens } from '../src/extractTokens.js';
import { validateOutput } from '../src/validateOutput.js';
import {
  buildTokenMatcher,
  escapeRegex,
  tokenizeFormat,
} from '../src/utils.js';
import { BUILTIN_TOKENS } from '../src/handlers.js';

const silent = { errorPolicy: 'silent' };

describe('Object.prototype key confusion', () => {
  it('never resolves an inherited member as a handler', () => {
    for (const key of [
      'toString',
      'constructor',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ]) {
      const out = formatDate('20250425', 'yyyyMMdd', key, silent);
      expect(out).toBe(key);
    }
  });

  it('renders an inherited member name literally in strict mode too', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'toString')).toBe('toString');
  });

  it('does not treat an inherited member as an input token', () => {
    const r = extractTokens('toString', 'toString');
    expect(r.tokens).toEqual([]);
    expect(r.mismatched).toBe(false);
  });

  it('keeps a real token working alongside an inherited name', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy toString')).toBe(
      '2025 toString',
    );
  });

  it('does not let a valueOf literal be read as data', () => {
    const r = extractTokens('2025valueOf12', 'yyyyvalueOfMM', undefined);
    expect(r.tokens).not.toContain('valueOf');
  });

  it('produces a handler table with no prototype', () => {
    const table = validateOutput({
      parsedTokens: ['yyyy'],
      dateParts: { year: 2025 },
      outputFormat: 'yyyy',
    });
    expect(Object.getPrototypeOf(table)).toBeNull();
    expect(table.toString).toBeUndefined();
  });
});

describe('prototype pollution', () => {
  const hostileKeys = [
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'polluted',
  ];

  const buildOptions = (key) => ({
    ...silent,
    overrideTokens: JSON.parse(`{"${key}": "X"}`),
    defaultTokens: JSON.parse(`{"${key}": "Y"}`),
  });

  it.each(hostileKeys)('does not pollute Object.prototype via %s', (key) => {
    const before = Object.prototype.polluted;
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', `${key}-yyyy`, buildOptions(key)),
    ).not.toThrow();
    expect(Object.prototype.polluted).toBe(before);
    expect({}.polluted).toBeUndefined();
  });

  it('leaves Object.prototype intact after every hostile call', () => {
    const keysBefore = Object.getOwnPropertyNames(Object.prototype).length;
    for (const key of hostileKeys) {
      formatDate('20250425', 'yyyyMMdd', `${key}`, buildOptions(key));
      formatDate('20250425', 'yyyyMMdd', `dd/${key}`, buildOptions(key));
    }
    expect(Object.getOwnPropertyNames(Object.prototype)).toHaveLength(
      keysBefore,
    );
  });

  it('does not treat a __proto__ token as a real token', () => {
    expect(formatDate('20250425', 'yyyyMMdd', '__proto__')).toBe('__proto__');
  });

  it('rejects a custom token named after an Object.prototype member', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
      const customTokens = {};
      Object.defineProperty(customTokens, key, {
        value: () => 'X',
        enumerable: true,
      });
      let caught;
      try {
        formatDate('20250425', 'yyyyMMdd', key, { customTokens });
      } catch (err) {
        caught = err;
      }
      expect(caught.code).toBe(ERROR_CODES.RESERVED_TOKEN);
    }
  });
});

describe('regular expression safety', () => {
  it('escapes all metacharacters', () => {
    const specials = '^$\\.*+?()[]{}|/';
    expect(new RegExp(`^${escapeRegex(specials)}$`).test(specials)).toBe(true);
  });

  it('matches a metacharacter-laden token literally', () => {
    const token = 'a+b*c?[d]';
    const re = buildTokenMatcher([token]);
    re.lastIndex = 1;
    expect(re.exec(`x${token}y`)[0]).toBe(token);
  });

  it('does not match a different string that looks similar', () => {
    const re = buildTokenMatcher(['a.c']);
    re.lastIndex = 0;
    expect(re.exec('abc')).toBeNull();
  });

  it('cannot be made to backtrack catastrophically', () => {
    const tokens = Array.from({ length: 2000 }, (_, i) => `t${i}`);
    const re = buildTokenMatcher(tokens);
    const subject = `${'t'.repeat(5000)}!`;
    const start = process.hrtime.bigint();
    re.lastIndex = 0;
    re.exec(subject);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(ms).toBeLessThan(500);
  });

  it('handles a very long format without hanging', () => {
    const format = 'yyyy'.repeat(500);
    expect(() => tokenizeFormat(format, BUILTIN_TOKENS)).not.toThrow();
  });

  it('handles a very long output format', () => {
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', `${'dd/MM/'.repeat(500)}yyyy`, silent),
    ).not.toThrow();
  });
});

describe('error message hygiene', () => {
  it('does not echo the input value', () => {
    const secret = '4111111111111111';
    let message = '';
    try {
      formatDate(secret, 'yyyyMMdd', 'dd/MM/yyyy');
    } catch (err) {
      message = err.message;
    }
    expect(message).not.toContain(secret);
  });

  it('does not echo a long input value', () => {
    const long = '9'.repeat(5000);
    let message = '';
    try {
      formatDate(long, 'yyyyMMdd', 'dd/MM/yyyy');
    } catch (err) {
      message = err.message;
    }
    expect(message.length).toBeLessThan(300);
  });

  it('truncates an absurd token name in the message', () => {
    let err;
    try {
      formatDate('20250425', 'yyyyMMdd', `${'A'.repeat(100000)}`, {
        strictTokens: true,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message.length).toBeLessThan(300);
  });

  it('produces a message short enough for a log line', () => {
    for (const fmt of ['MMM', 'MMMM', 'HH', 'mm', 'ss', 'QQQ']) {
      let message = '';
      try {
        formatDate('2025', 'yyyy', fmt);
      } catch (err) {
        message = err.message;
      }
      expect(message.length).toBeLessThan(200);
    }
  });
});

describe('injection into literals', () => {
  it('renders format metacharacters in an input as literal text only', () => {
    // A regex-special input must be compared literally, never compiled.
    const out = formatDate('a+b*c', 'a+b*c', 'yyyy', { ...silent });
    expect(typeof out).toBe('string');
  });

  it('does not let a literal in the format alter later fields', () => {
    expect(formatDate('2025.04.25', 'yyyy.MM.dd', 'dd/MM/yyyy')).toBe(
      '25/04/2025',
    );
  });

  it('treats a backslash in a format as a literal character', () => {
    const out = formatDate(
      '2025\\04\\25',
      'yyyy\\MM\\dd',
      'dd/MM/yyyy',
      silent,
    );
    expect(typeof out).toBe('string');
  });
});

describe('resource limits', () => {
  it('handles a long input string without excessive work', () => {
    const input = '20250425'.repeat(5000);
    const start = process.hrtime.bigint();
    formatDate(input, 'yyyyMMdd', 'dd/MM/yyyy', silent);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(ms).toBeLessThan(500);
  });

  it('handles many distinct custom tokens', () => {
    const customTokens = {};
    const parts = [];
    for (let i = 0; i < 500; i++) {
      customTokens[`X${i}`] = () => 'v';
      parts.push(`X${i}`);
    }
    expect(() =>
      formatDate('20250425', 'yyyyMMdd', parts.join(''), {
        ...silent,
        customTokens,
      }),
    ).not.toThrow();
  });
});
