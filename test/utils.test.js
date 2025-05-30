import { buildTokenRegex, extractAllTokensFromFormat } from '../src/utils.js';

describe('buildTokenRegex', () => {
  it('should return a RegExp with the global flag', () => {
    const regex = buildTokenRegex({ a: () => {} });
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.flags).toContain('g');
  });

  it('should sort tokens longest-first', () => {
    const handlers = { a: () => {}, aa: () => {}, bbb: () => {} };
    const extra = ['z', 'zz'];
    const regex = buildTokenRegex(handlers, extra);
    expect(regex.source).toBe('(bbb|aa|zz|a|z)');
  });

  it('should escape regex metacharacters in tokens', () => {
    const handlers = { 'a.b': () => {}, 'c*d': () => {} };
    const regex = buildTokenRegex(handlers);
    expect(regex.source).toBe('(a\\.b|c\\*d)');
  });

  it('should match tokens in a string', () => {
    const handlers = { yyyy: () => {}, MM: () => {}, label: () => {} };
    const regex = buildTokenRegex(handlers);
    const matches = Array.from('yyyy-label-MM'.matchAll(regex)).map(
      (m) => m[0]
    );
    expect(matches).toEqual(['yyyy', 'label', 'MM']);
  });

  it('should handle empty handlers and extraTokens', () => {
    const regex = buildTokenRegex({}, []);
    expect(regex.source).toBe('()');
  });
});

describe('extractAllTokensFromFormat', () => {
  it('should extract alphanumeric tokens and dedupe', () => {
    expect(extractAllTokensFromFormat('yyyy-MM-QQ-QQ')).toEqual([
      'yyyy',
      'MM',
      'QQ',
    ]);
  });

  it('should return an empty array if no alphabetic sequences', () => {
    expect(extractAllTokensFromFormat('---123---')).toEqual([]);
  });

  it('should handle mixed-case tokens', () => {
    expect(extractAllTokensFromFormat('YYYY-mm')).toEqual(['YYYY', 'mm']);
  });

  it('should handle tokens adjacent to numbers and punctuation', () => {
    expect(extractAllTokensFromFormat('a1b2c')).toEqual(['a', 'b', 'c']);
  });

  it('should handle underscores and slashes', () => {
    expect(extractAllTokensFromFormat('YY_MM/DD')).toEqual(['YY', 'MM', 'DD']);
  });
});
