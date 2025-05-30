import { extractTokens } from '../src/extractTokens.js';
import { DEFAULT_HANDLERS } from '../src/handlers.js';

describe('extractTokens', () => {
  it('should return flattened raw values with tokens array for yyyy-MM-dd', () => {
    const result = extractTokens('2025-04-25', 'yyyy-MM-dd', DEFAULT_HANDLERS);
    expect(result).toEqual({
      yyyy: '2025',
      MM: '04',
      dd: '25',
      tokens: ['yyyy', 'MM', 'dd'],
    });
  });

  it('should throw error when segment length mismatches expected token length', () => {
    expect(() =>
      extractTokens('2025-4-25', 'yyyy-MM-dd', DEFAULT_HANDLERS)
    ).toThrow('Input does not match inputFormat — failed at token "MM"');
  });

  it('should handle two-digit year token yy correctly', () => {
    const result = extractTokens('25/12/31', 'yy/MM/dd', DEFAULT_HANDLERS);
    expect(result).toEqual({
      yy: '25',
      MM: '12',
      dd: '31',
      tokens: ['yy', 'MM', 'dd'],
    });
  });

  it('should ignore literal separators and parse only token segments', () => {
    const result = extractTokens('01022021', 'MMddyyyy', DEFAULT_HANDLERS);
    expect(result).toEqual({
      MM: '01',
      dd: '02',
      yyyy: '2021',
      tokens: ['MM', 'dd', 'yyyy'],
    });
  });

  it('should return empty tokens array when no tokens are defined in format', () => {
    const result = extractTokens('anyvalue', 'literal', DEFAULT_HANDLERS);
    expect(result).toEqual({
      tokens: [],
    });
  });

  it('should throw when non-digit characters appear in a token position', () => {
    expect(() =>
      extractTokens('20A5-04-25', 'yyyy-MM-dd', DEFAULT_HANDLERS)
    ).toThrow('Input does not match inputFormat — failed at token "yyyy"');
  });

  it('should use DEFAULT_HANDLERS when handlers argument is omitted', () => {
    const result = extractTokens('2025-04-25', 'yyyy-MM-dd');
    expect(result).toEqual({
      yyyy: '2025',
      MM: '04',
      dd: '25',
      tokens: ['yyyy', 'MM', 'dd'],
    });
  });

  it('should parse single-character tokens correctly', () => {
    const result = extractTokens('5/4/21', 'M/d/yy');
    expect(result).toEqual({
      M: '5',
      d: '4',
      yy: '21',
      tokens: ['M', 'd', 'yy'],
    });
  });

  it('should handle custom literal separators like "*"', () => {
    const result = extractTokens('2025*04*25', 'yyyy*MM*dd');
    expect(result).toEqual({
      yyyy: '2025',
      MM: '04',
      dd: '25',
      tokens: ['yyyy', 'MM', 'dd'],
    });
  });

  it('should throw when input is too short for the final token', () => {
    expect(() => extractTokens('202504', 'yyyyMMdd', DEFAULT_HANDLERS)).toThrow(
      /failed at token "dd"/
    );
  });

  it('should return empty tokens array when format string is empty', () => {
    const result = extractTokens('anything', '');
    expect(result).toEqual({ tokens: [] });
  });
});
