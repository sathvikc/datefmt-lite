// Token handler function types
export type TokenHandler = (parts: Record<string, any>) => string;

// Map of tokens to handler functions
export type HandlerMap = Record<string, TokenHandler>;

// DateParts used during formatting
export interface DateParts {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  tokens?: string[];
}

// Configuration options for formatDate
export interface FormatOptions {
  errorPolicy?: 'throw' | 'silent';
  yearConverter?: (yy: number) => number;
  customTokens?: Record<string, TokenHandler>;
  overrideTokens?: Record<string, string | TokenHandler>;
  defaultTokens?: Record<string, string>;
}

// Main formatting API
export function formatDate(
  inputDate: string,
  inputFormat: string,
  outputFormat: string,
  options?: FormatOptions
): string;

// Output from extractTokens
export interface ExtractedTokens {
  tokens: string[];
  [key: string]: string | null | string[];
}

export function extractTokens(
  inputDate: string,
  inputFormat: string,
  handlers: HandlerMap,
  options?: { errorPolicy?: 'throw' | 'silent' }
): ExtractedTokens;

export function normalizeFields(
  raw: ExtractedTokens,
  options?: { yearConverter?: (yy: number) => number; errorPolicy?: 'throw' | 'silent' }
): DateParts;

export function validateOutput(args: {
  parsedTokens: string[];
  outputFormat: string;
  handlers: HandlerMap;
  customTokens?: Record<string, TokenHandler>;
  overrideTokens?: Record<string, string | TokenHandler>;
  defaultTokens?: Record<string, string>;
  errorPolicy?: 'throw' | 'silent';
}): Record<string, string | TokenHandler>;

export function buildTemplate(
  outputFormat: string,
  handlers: HandlerMap
): Array<string | ((parts: DateParts) => string)>;

export function buildTokenRegex(
  handlers: HandlerMap,
  extraTokens?: string[]
): RegExp;

export function extractAllTokensFromFormat(format: string): string[];
