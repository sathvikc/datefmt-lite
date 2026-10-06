import {
  buildTokenMatcher,
  buildTokenPattern,
  collectTokens,
  escapeRegex,
  extractAllTokensFromFormat,
  hasOwn,
  looksLikeToken,
  nullProtoMap,
  tokenizeFormat,
} from '../src/utils.js';

const ALL = [
  'yyyy',
  'yy',
  'MMMM',
  'MMM',
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
];

describe('escapeRegex', () => {
  it('escapes every regex metacharacter', () => {
    const specials = '^$\\.*+?()[]{}|';
    const escaped = escapeRegex(specials);
    expect(new RegExp(escaped).test(specials)).toBe(true);
  });

  it('leaves ordinary characters untouched', () => {
    expect(escapeRegex('yyyy-MM')).toBe('yyyy\\-MM');
    expect(escapeRegex('abc')).toBe('abc');
  });

  it('escapes forward slashes so a pattern stays readable', () => {
    expect(escapeRegex('dd/MM')).toBe('dd\\/MM');
  });

  it('escapes a token containing a brace quantifier', () => {
    expect(() => new RegExp(buildTokenPattern(['a{1,2}']))).not.toThrow();
    expect('a{1,2}b'.match(buildTokenMatcher(['a{1,2}']))[0]).toBe('a{1,2}');
  });
});

describe('buildTokenPattern', () => {
  it('returns an empty string for no tokens', () => {
    expect(buildTokenPattern([])).toBe('');
    expect(buildTokenPattern(null)).toBe('');
    expect(buildTokenPattern(undefined)).toBe('');
  });

  it('sorts longest token first so yyyy beats yy', () => {
    const pattern = buildTokenPattern(['yy', 'yyyy']);
    expect(pattern.indexOf('yyyy')).toBeLessThan(pattern.indexOf('|yy'));
  });

  it('sorts MMMM ahead of MMM ahead of MM', () => {
    const pattern = buildTokenPattern(['MM', 'MMM', 'MMMM']);
    expect(pattern).toBe('MMMM|MMM|MM');
  });

  it('de-duplicates repeated token names', () => {
    expect(buildTokenPattern(['dd', 'dd', 'dd'])).toBe('dd');
  });

  it('drops empty and non-string entries', () => {
    expect(buildTokenPattern(['dd', '', null, undefined, 42])).toBe('dd');
  });

  it('produces a deterministic order regardless of input order', () => {
    expect(buildTokenPattern(['M', 'dd', 'yyyy'])).toBe(
      buildTokenPattern(['yyyy', 'dd', 'M']),
    );
  });
});

describe('buildTokenMatcher', () => {
  it('never matches when there are no tokens', () => {
    const re = buildTokenMatcher([]);
    expect(re.test('anything')).toBe(false);
    expect(re.exec('abc')).toBeNull();
  });

  it('anchors at lastIndex because it is sticky', () => {
    const re = buildTokenMatcher(['dd']);
    re.lastIndex = 1;
    expect(re.exec('dd')).toBeNull();
    re.lastIndex = 0;
    expect(re.exec('dd')[0]).toBe('dd');
  });

  it('matches the longest token at a position', () => {
    const re = buildTokenMatcher(ALL);
    re.lastIndex = 0;
    expect(re.exec('yyyyMMdd')[0]).toBe('yyyy');
  });
});

describe('tokenizeFormat', () => {
  it('splits a fully tokenized format', () => {
    expect(tokenizeFormat('yyyyMMdd', ALL)).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'token', value: 'MM' },
      { type: 'token', value: 'dd' },
    ]);
  });

  it('keeps literals between tokens', () => {
    expect(tokenizeFormat('dd/MM/yyyy', ALL)).toEqual([
      { type: 'token', value: 'dd' },
      { type: 'literal', value: '/' },
      { type: 'token', value: 'MM' },
      { type: 'literal', value: '/' },
      { type: 'token', value: 'yyyy' },
    ]);
  });

  it('treats an empty format as no segments', () => {
    expect(tokenizeFormat('', ALL)).toEqual([]);
  });

  it('treats a literal-only format as one literal', () => {
    expect(tokenizeFormat('----', ALL)).toEqual([
      { type: 'literal', value: '----' },
    ]);
  });

  it('does not mistake literal words for tokens', () => {
    expect(tokenizeFormat('Date: dd/MM/yyyy', ALL)).toEqual([
      { type: 'literal', value: 'Date: ' },
      { type: 'token', value: 'dd' },
      { type: 'literal', value: '/' },
      { type: 'token', value: 'MM' },
      { type: 'literal', value: '/' },
      { type: 'token', value: 'yyyy' },
    ]);
  });

  it('keeps an ISO 8601 T separator as a literal', () => {
    expect(tokenizeFormat('yyyy-MM-ddTHH:mm:ss', ALL)).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: 'MM' },
      { type: 'literal', value: '-' },
      { type: 'token', value: 'dd' },
      { type: 'literal', value: 'T' },
      { type: 'token', value: 'HH' },
      { type: 'literal', value: ':' },
      { type: 'token', value: 'mm' },
      { type: 'literal', value: ':' },
      { type: 'token', value: 'ss' },
    ]);
  });

  it('emits bracketed groups as escaped segments without brackets', () => {
    expect(tokenizeFormat('yyyy [at] HH', ALL)).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'literal', value: ' ' },
      { type: 'escaped', value: 'at' },
      { type: 'literal', value: ' ' },
      { type: 'token', value: 'HH' },
    ]);
  });

  it('does not tokenize inside brackets', () => {
    expect(tokenizeFormat('[yyyy]', ALL)).toEqual([
      { type: 'escaped', value: 'yyyy' },
    ]);
  });

  it('emits an empty escaped group', () => {
    expect(tokenizeFormat('[]', ALL)).toEqual([{ type: 'escaped', value: '' }]);
  });

  it('treats an unbalanced opening bracket as a literal and keeps tokenizing', () => {
    expect(tokenizeFormat('dd[MM', ALL)).toEqual([
      { type: 'token', value: 'dd' },
      { type: 'literal', value: '[' },
      { type: 'token', value: 'MM' },
    ]);
  });

  it('treats a stray closing bracket as a literal', () => {
    expect(tokenizeFormat('dd]MM', ALL)).toEqual([
      { type: 'token', value: 'dd' },
      { type: 'literal', value: ']' },
      { type: 'token', value: 'MM' },
    ]);
  });

  it('closes nested brackets at the first closing bracket', () => {
    const segs = tokenizeFormat('[a[b]c]', ALL);
    expect(segs).toEqual([
      { type: 'escaped', value: 'a[b' },
      { type: 'literal', value: 'c]' },
    ]);
  });

  it('does not let bracket removal fuse neighbouring tokens', () => {
    // The old implementation stripped brackets then re-scanned, producing a
    // phantom "yyyyMM" token and throwing.
    expect(tokenizeFormat('yyyy[-]MM', ALL)).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'escaped', value: '-' },
      { type: 'token', value: 'MM' },
    ]);
  });

  it('resolves custom tokens when they are declared', () => {
    expect(tokenizeFormat('yyyy-Q', [...ALL, 'Q'])).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: 'Q' },
    ]);
  });

  it('handles a format with no known tokens at all', () => {
    expect(tokenizeFormat('abc', [])).toEqual([
      { type: 'literal', value: 'abc' },
    ]);
  });

  it('never emits an empty literal segment', () => {
    for (const format of ['yyyy', 'yyyyMMdd', 'dd/MM', '[x]', 'a']) {
      for (const seg of tokenizeFormat(format, ALL)) {
        expect(seg.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('preserves unicode and whitespace literals', () => {
    expect(tokenizeFormat('dd ✓ MMMM', ALL)).toEqual([
      { type: 'token', value: 'dd' },
      { type: 'literal', value: ' ✓ ' },
      { type: 'token', value: 'MMMM' },
    ]);
  });
});

describe('collectTokens', () => {
  it('returns each token once, in first-seen order', () => {
    const segs = tokenizeFormat('yyyy/MM/yyyy/dd', ALL);
    expect(collectTokens(segs)).toEqual(['yyyy', 'MM', 'dd']);
  });

  it('returns an empty list when there are no tokens', () => {
    expect(collectTokens(tokenizeFormat('literal', ALL))).toEqual([]);
  });
});

describe('looksLikeToken', () => {
  it.each(['yyyy', 'MM', 'Q', 'QQQ', 'Date', 'noon'])(
    'treats %s as token-shaped',
    (name) => expect(looksLikeToken(name)).toBe(true),
  );

  it.each(['dd/MM', '2025', '', 'a1', 'a-b'])(
    'treats %s as not token-shaped',
    (name) => expect(looksLikeToken(name)).toBe(false),
  );
});

describe('extractAllTokensFromFormat', () => {
  it('finds every alphabetic run, de-duplicated', () => {
    expect(extractAllTokensFromFormat('yyyy-MM-QQ')).toEqual([
      'yyyy',
      'MM',
      'QQ',
    ]);
  });

  it('returns an empty array when there are no letters', () => {
    expect(extractAllTokensFromFormat('2025-04-25')).toEqual([]);
  });

  it('handles an empty string', () => {
    expect(extractAllTokensFromFormat('')).toEqual([]);
  });
});

describe('nullProtoMap', () => {
  it('creates a map with no prototype', () => {
    expect(Object.getPrototypeOf(nullProtoMap())).toBeNull();
  });

  it('copies own properties across', () => {
    expect({ ...nullProtoMap({ a: 1 }) }).toEqual({ a: 1 });
  });

  it('does not resolve inherited members', () => {
    const map = nullProtoMap({ own: 1 });
    expect(map.toString).toBeUndefined();
    expect(map.__proto__).toBeUndefined();
  });
});

describe('hasOwn', () => {
  it('is true for own keys', () => {
    expect(hasOwn({ a: 1 }, 'a')).toBe(true);
  });

  it('is false for inherited keys', () => {
    expect(hasOwn({}, 'toString')).toBe(false);
    expect(hasOwn({}, '__proto__')).toBe(false);
    expect(hasOwn({}, 'constructor')).toBe(false);
  });

  it('is false for null and undefined', () => {
    expect(hasOwn(null, 'a')).toBe(false);
    expect(hasOwn(undefined, 'a')).toBe(false);
  });

  it('is true for an own __proto__ data property', () => {
    const o = JSON.parse('{"__proto__": {"polluted": 1}}');
    expect(hasOwn(o, '__proto__')).toBe(true);
  });
});
