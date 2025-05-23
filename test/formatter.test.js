import {
  formatDate,
  parseInput,
  compileFormat,
  DEFAULT_HANDLERS,
} from '../src/index.js';

describe('parseInput()', () => {
  const conv = (n) => 2000 + n;

  test('parses full yyyyMMddTHHmmss correctly', () => {
    const parts = parseInput('20250425T101010', 'yyyyMMddTHHmmss', DEFAULT_HANDLERS);
    expect(parts).toEqual({
      year:   2025,
      month:     4,
      day:      25,
      hour:     10,
      minute:   10,
      second:   10,
      _tokens: ['yyyy','MM','dd','HH','mm','ss'],
    });
  });

  test('parses two‑digit‑year formats with converter', () => {
    const parts = parseInput('250425T101010', 'yyMMddTHHmmss', DEFAULT_HANDLERS, conv);
    expect(parts).toEqual({
      year:   2025,
      month:     4,
      day:      25,
      hour:     10,
      minute:   10,
      second:   10,
      _tokens: ['yy','MM','dd','HH','mm','ss'],
    });
  });

  test('throws when inputFormat lacks yy/yyyy', () => {
    expect(() => parseInput('0425', 'MMdd', DEFAULT_HANDLERS, conv))
      .toThrow(/No "yyyy" or "yy" token/);
  });

  test('throws when token slice is non‑numeric', () => {
    expect(() =>
      parseInput('20AB0425', 'yyyyMMdd', DEFAULT_HANDLERS)
    ).toThrow(/Invalid numeric value for token "yyyy": "20AB/);
  });

  test('throws on literal mismatch', () => {
    expect(() =>
      parseInput('2025X0425', 'yyyy- MM dd', DEFAULT_HANDLERS)
    ).toThrow(/Expected literal/);
  });

  test('throws on extra trailing characters', () => {
    expect(() =>
      parseInput('20250425EXTRA', 'yyyyMMdd', DEFAULT_HANDLERS)
    ).toThrow(/Extra characters in inputDate/);
  });
});

describe('compileFormat()', () => {
  const dummyHandlers = {
    A: (p) => `A${p.x}`,
    B: (p) => p.x > 1 ? null : `B${p.x}`,
  };

  test('builds literal+formatter template', () => {
    const tpl = compileFormat('A-B-C', dummyHandlers);
    const result = tpl.map(chunk =>
      typeof chunk === 'string' ? chunk : chunk({ x: 1 })
    ).join('');
    expect(result).toBe('A1-B1-C');
  });

  test('overrideTokens always wins', () => {
    const tpl = compileFormat('A', dummyHandlers, { A: () => 'OVR' });
    expect(tpl[0]({ x: 42 })).toBe('OVR');
  });

  test('handler wins when not null', () => {
    const tpl = compileFormat('A', dummyHandlers);
    expect(tpl[0]({ x: 5 })).toBe('A5');
  });

  test('defaultTokens used when handler returns null', () => {
    const tpl = compileFormat('B', dummyHandlers, {}, { B: () => 'DEF' });
    expect(tpl[0]({ x: 2 })).toBe('DEF');
  });

  test('literal fallback when nothing else', () => {
    const tpl = compileFormat('Z', dummyHandlers);
    expect(tpl[0]).toBe('Z');
  });
});

describe('formatDate()', () => {
  const pivot = (n) => n < 50 ? 2000+n : 1900+n;

  test('basic formatting with built‑ins', () => {
    expect(formatDate('20250425','yyyyMMdd','dd/MM/yyyy'))
      .toBe('25/04/2025');
  });

  test('preserves literal tokens', () => {
    expect(formatDate('20250425T101010','yyyyMMddTHHmmss','dd-MM-yyyy [at] HH:mm'))
      .toBe('25-04-2025 [at] 10:10');
  });

  test('two‑digit year + converter', () => {
    expect(formatDate('250425','yyMMdd','dd/MM/yyyy',{ yearConverter: pivot }))
      .toBe('25/04/2025');
  });

  test('throws when yy without converter', () => {
    expect(() => formatDate('250425','yyMMdd','dd/MM/yyyy'))
      .toThrow(/yearConverter/);
  });

  test('custom tokens override defaults and built‑ins', () => {
    const handlers = { Q: (p) => 'Q'+Math.ceil(p.month/3) };
    expect(formatDate('20250615','yyyyMMdd','yyyy-Q/dd',{ customTokens: handlers }))
      .toBe('2025-Q2/15');
  });

  test('overrideTokens wins over handlers', () => {
    expect(formatDate('20250425','yyyyMMdd','dd/MM/yyyy',{
      overrideTokens: { dd: '01' },
    })).toBe('01/04/2025');
  });

  test('defaultTokens fallback when part missing', () => {
    expect(formatDate('202504','yyyyMM','dd/MM/yyyy',{
      defaultTokens: { dd: '99' },
    })).toBe('99/04/2025');
  });

  test('throws on missing output token without default', () => {
    expect(() =>
      formatDate('2025','yyyy','MM/dd/yyyy')
    ).toThrow(/Cannot produce token "MM"/);
  });

  test('errorPolicy silent: best‑effort formatting', () => {
    const out = formatDate('2025','yyyy','MM/dd/yyyy',{
      errorPolicy: 'silent',
    });
    expect(out).toBe('MM/dd/2025'); // literal fallback for MM/dd
  });

  test('errorPolicy silent: parse errors become best‑effort', () => {
    const out = formatDate('BAD','yyyy','yyyy-MM-dd',{ errorPolicy: 'silent' });
    // "BAD" literal, no formatting
    expect(out).toBe('BAD');
  });
});
