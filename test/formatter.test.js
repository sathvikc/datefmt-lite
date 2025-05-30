import { formatDate } from '../src/formatter.js';

describe('formatDate()', () => {
  const pivot = (n) => (n < 50 ? 2000 + n : 1900 + n);

  it('should format a basic date with built‑in handlers', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('25/04/2025');
  });

  it('should handle converting parsed month token into abbreviated MMM output', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'MMM dd, yyyy')).toBe('Apr 25, 2025');
  });

  it('should preserve literal tokens in the format', () => {
    expect(
      formatDate('20250425T101010', 'yyyyMMddTHHmmss', 'dd-MM-yyyy [at] HH:mm')
    ).toBe('25-04-2025 [at] 10:10');
  });

  it('should apply a two‑digit year converter when provided', () => {
    expect(
      formatDate('250425', 'yyMMdd', 'dd/MM/yyyy', { yearConverter: pivot })
    ).toBe('25/04/2025');
  });

  it('should throw if yy format used without a yearConverter', () => {
    expect(() => formatDate('250425', 'yyMMdd', 'dd/MM/yyyy')).toThrow(
      /yearConverter/
    );
  });

  it('should use custom tokens to override built‑ins', () => {
    const handlers = { Q: (p) => 'Q' + Math.ceil(p.month / 3) };
    expect(
      formatDate('20250615', 'yyyyMMdd', 'yyyy-Q/dd', {
        customTokens: handlers,
      })
    ).toBe('2025-Q2/15');
  });

  it('should let overrideTokens win over handlers', () => {
    expect(
      formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy', {
        overrideTokens: { dd: '01' },
      })
    ).toBe('01/04/2025');
  });

  it('should fallback to defaultTokens when a part is missing', () => {
    expect(
      formatDate('202504', 'yyyyMM', 'dd/MM/yyyy', {
        defaultTokens: { dd: '99' },
      })
    ).toBe('99/04/2025');
  });

  it('should throw on missing output token without a default', () => {
    expect(() => formatDate('2025', 'yyyy', 'MM/dd/yyyy')).toThrow(
      /Cannot produce token "MM"/
    );
  });

  it('should best‑effort format in silent mode with literal fallbacks', () => {
    const out = formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('MM/dd/2025');
  });

  it('should best‑effort format two‑digit year fallback in silent mode', () => {
    const out = formatDate('200423', 'yyMMdd', 'MM/dd/yyyy', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('04/23/0020');
  });

  it('should return raw input on parse errors in silent mode', () => {
    const out = formatDate('BAD', 'yyyy', 'yyyy-MM-dd', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('BAD');
  });

  it('should yield partial best‑effort when non-digits appear in numeric tokens', () => {
    const out = formatDate('2025AB05', 'yyyyMMdd', 'dd/MM/yyyy', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('05/MM/2025');
  });

  it('should return raw input if shorter than the format when all tokens fail', () => {
    const out = formatDate('25', 'yyyyMMdd', 'dd/MM/yyyy', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('25');
  });

  it('should apply custom defaultTokens in silent mode', () => {
    const out = formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
      errorPolicy: 'silent',
      defaultTokens: { MM: '00', dd: '99' },
    });
    expect(out).toBe('00/99/2025');
  });

  it('should use overrideTokens over literal fallback in silent mode', () => {
    const out = formatDate('2025', 'yyyy', 'MM/dd/yyyy', {
      errorPolicy: 'silent',
      overrideTokens: { MM: () => 'XX' },
    });
    expect(out).toBe('XX/dd/2025');
  });

  it('should preserve bracketed literals with missing tokens', () => {
    const out = formatDate('2025', 'yyyy', '[Year] MM/yyyy', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('[Year] MM/2025');
  });

  it('should handle partial parse with non-digits and two-digit year fallback', () => {
    const out = formatDate('20ABCD', 'yyMMdd', 'dd-MM-yyyy', {
      errorPolicy: 'silent',
    });
    expect(out).toBe('dd-MM-0020');
  });
});
