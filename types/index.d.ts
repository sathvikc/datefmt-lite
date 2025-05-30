export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export type TokenHandler = (parts: DateParts) => string;
export type OverrideTokenValue = string | ((parts: DateParts) => string);
export type TokensMap = Record<string, TokenHandler>;
export type OverrideTokensMap = Record<string, OverrideTokenValue>;
export type DefaultTokensMap = Record<string, OverrideTokenValue>;
export type YearConverter = (n: number | undefined) => number;

/**
 * Splits an inputDate string into DateParts based on inputFormat and yearConverter.
 */
export function parseInput(
  inputDate: string,
  inputFormat: string,
  handlers: TokensMap,
  yearConverter: YearConverter
): DateParts;

/**
 * Pre‑compiles outputFormat into an array of literals and formatter functions.
 */
export function compileFormat(
  formatStr: string,
  handlers: TokensMap,
  overrideTokens?: OverrideTokensMap,
  defaultTokens?: DefaultTokensMap
): Array<string | TokenHandler>;

export interface FormatDateOptions {
  customTokens?: TokensMap;
  overrideTokens?: OverrideTokensMap;
  defaultTokens?: DefaultTokensMap;
  yearConverter?: YearConverter;
}

// Overload #1: inputFormat contains `yy` ⇒ yearConverter is required
export function formatDate<
  IF extends string,
  OF extends string
>(
  inputDate: string,
  inputFormat: IF extends `${string}yy${string}` ? IF : never,
  outputFormat: OF,
  options: FormatDateOptions & { yearConverter: YearConverter }
): string;

// Overload #2: inputFormat does not contain `yy` ⇒ yearConverter optional
export function formatDate<
  IF extends string,
  OF extends string
>(
  inputDate: string,
  inputFormat: IF extends `${string}yy${string}` ? never : IF,
  outputFormat: OF,
  options?: FormatDateOptions
): string;
