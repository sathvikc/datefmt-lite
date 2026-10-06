/**
 * Type definitions for datefmt-lite.
 *
 * Every export declared here is verified against the runtime surface by
 * test/publicApi.test.js, so the two cannot drift apart.
 */

/** Semantic fields populated from the input format. */
export type DateField = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/** Normalized fields handed to token renderers. */
export interface DateParts {
  year: number | null;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  second: number | null;
  tokens: string[];
}

/** A token renderer. Returning `null` triggers the configured fallback. */
export type TokenHandler = (parts: DateParts) => string | null;

/** A fixed value or a renderer. */
export type TokenValue = string | TokenHandler;

/** Map of token name to renderer. */
export type HandlerMap = Record<string, TokenHandler>;

/** A step in a compiled render plan. */
export type RenderStep =
  { type: 'text'; value: string } | { type: 'token'; value: string };

/** A token as produced by {@link tokenizeFormat}. */
export type FormatSegment =
  | { type: 'literal'; value: string }
  | { type: 'token'; value: string }
  | { type: 'escaped'; value: string };

/** Metadata describing one built-in token. */
export interface TokenSpec {
  field: DateField;
  width: number;
  variable: boolean;
  text?: boolean;
  parse?: (text: string) => number | null;
  handler: TokenHandler;
}

/** How recoverable failures are handled. */
export type ErrorPolicy = 'throw' | 'silent';

/** How aggressively field values are range-checked. */
export type ValidationMode = 'off' | 'lenient' | 'strict';

/** Machine-readable error codes. */
export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_OPTION'
  | 'INPUT_MISMATCH'
  | 'UNPRODUCIBLE_TOKEN'
  | 'OUT_OF_RANGE'
  | 'INVALID_YEAR'
  | 'RESERVED_TOKEN';

/** The single error type thrown by this library. */
export class DateFormatError extends Error {
  constructor(
    message: string,
    code: ErrorCode,
    details?: { token?: string; field?: string },
  );
  name: 'DateFormatError';
  code: ErrorCode;
  token?: string;
  field?: string;
}

/** Options accepted by {@link formatDate}. */
export interface FormatOptions {
  /**
   * `'throw'` (default) rejects malformed input and unproducible tokens.
   * `'silent'` never throws on bad data: it returns the raw input or renders
   * unproducible tokens as their own name. Caller mistakes such as a non-string
   * argument still throw.
   */
  errorPolicy?: ErrorPolicy;
  /** Expands a two-digit `yy` into a full year. Must return a non-negative integer. */
  yearConverter?: (yy: number) => number;
  /** Extra tokens, usable in both `inputFormat` and `outputFormat`. */
  customTokens?: Record<string, TokenHandler>;
  /** Fixed values that take precedence over every other source. */
  overrideTokens?: Record<string, TokenValue>;
  /** Values used when the input did not supply the field. */
  defaultTokens?: Record<string, TokenValue>;
  /** Range checking. `'off'` (default) keeps the no-assumptions contract. */
  validate?: ValidationMode;
  /** Verify literal separators in `inputFormat` instead of skipping them. Defaults to `true`. */
  verifyLiterals?: boolean;
  /**
   * Treat unrecognised words in `outputFormat` as errors rather than literal
   * text. Bracketed groups and the structural separators `T`, `Z`, `W`, `a`,
   * `t` and `z` stay allowed, so ISO 8601 output keeps working.
   */
  strictTokens?: boolean;
}

/** Result of {@link extractTokens}. */
export interface ExtractedTokens {
  /** Tokens that were successfully read, in parse order. */
  tokens: string[];
  /** Raw string values, keyed by token. `null` where a token was unreadable. */
  values: Record<string, string | null>;
  /** True when the input as a whole did not conform to the format. */
  mismatched: boolean;
}

/** Result of range validation. */
export interface ValidationOutcome {
  message: string;
  field: string;
  fatal: boolean;
  clamped?: Partial<Record<DateField, number>>;
}

/**
 * Converts a date string from one format to another using token-to-token
 * conversion. No `Date` is constructed.
 *
 * @throws {DateFormatError} for caller mistakes, malformed input, unproducible
 *   output tokens and range violations under `validate: 'strict'`.
 */
export function formatDate(
  inputDate: string,
  inputFormat: string,
  outputFormat: string,
  options?: FormatOptions,
): string;

/** Reads raw token values out of an input string. */
export function extractTokens(
  inputDate: string,
  inputFormat: string,
  handlers?: Record<string, TokenSpec>,
  options?: { verifyLiterals?: boolean },
): ExtractedTokens;

/** Maps raw token values onto semantic fields. */
export function normalizeFields(
  input: { tokens?: string[]; values?: Record<string, string | null> },
  options?: {
    yearConverter?: (yy: number) => number;
    errorPolicy?: ErrorPolicy;
  },
): DateParts;

/** Reports whether a normalized field holds a value. */
export function hasField(
  dateParts: Partial<DateParts>,
  field: DateField,
): boolean;

/** Builds the handler table the renderer uses for an output format. */
export function validateOutput(args: {
  parsedTokens: string[];
  dateParts: Partial<DateParts>;
  outputFormat: string;
  overrides?: {
    overrideTokens?: Record<string, TokenValue>;
    defaultTokens?: Record<string, TokenValue>;
    customTokens?: Record<string, TokenHandler>;
  };
  errorPolicy?: ErrorPolicy;
  strictTokens?: boolean;
}): Record<string, TokenValue>;

/**
 * Compiles an output format into a reusable render plan.
 *
 * The returned plan is cached and deeply frozen: mutating it throws rather than
 * corrupting the cache for later callers.
 */
export function buildTemplate(
  outputFormat: string,
  handlers: Record<string, TokenValue>,
): readonly Readonly<RenderStep>[];

/** Renders a compiled plan. */
export function renderTemplate(
  plan: readonly Readonly<RenderStep>[],
  handlers: Record<string, TokenValue>,
  dateParts: Partial<DateParts>,
  options?: { onMissing?: (token: string) => string },
): string;

/** Range-checks parsed fields. */
export function validateFields(
  dateParts: Partial<DateParts>,
  mode: 'lenient' | 'strict',
): ValidationOutcome | null;

/** Reports whether a year/month/day triple is a real calendar date. */
export function isRealDate(dateParts: {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}): boolean;

/** Resolves a textual month name or abbreviation to 1-12. */
export function parseMonthName(text: string): number | null;

/**
 * Splits a format into literal, token and bracketed-escape segments.
 *
 * Results are cached and deeply frozen. Mutating them throws rather than
 * corrupting the cache for later callers.
 */
export function tokenizeFormat(
  format: string,
  tokens: Iterable<string>,
): readonly Readonly<FormatSegment>[];

/** Builds the longest-first alternation body for a token set. */
export function buildTokenPattern(tokens: Iterable<string>): string;

/** Compiles a sticky matcher for a token set. */
export function buildTokenMatcher(tokens: Iterable<string>): RegExp;

/** Collects the distinct token names in a tokenized format. */
export function collectTokens(segments: readonly FormatSegment[]): string[];

/** Escapes a string for inclusion in a regular expression. */
export function escapeRegex(str: string): string;

/** Collects every contiguous alphabetic run in a string. */
export function extractAllTokensFromFormat(str: string): string[];

/** Reports whether a name is shaped like a token. */
export function looksLikeToken(name: string): boolean;

/** Full month names, index 0 = January. */
export const MONTH_NAMES: readonly string[];

/** Three-letter month abbreviations, index 0 = Jan. */
export const MONTH_ABBREV: readonly string[];

/** Every built-in token with its parsing and rendering metadata. */
export const TOKEN_REGISTRY: Readonly<Record<string, TokenSpec>>;

/** Built-in renderers, keyed by token. */
export const DEFAULT_HANDLERS: Readonly<Record<string, TokenHandler>>;

/** Maps each built-in token to the field it populates. */
export const TOKEN_FIELD_MAP: Readonly<Record<string, DateField>>;

/** Groups tokens by the field they populate. */
export const FIELD_GROUPS: Readonly<Record<string, readonly string[]>>;

/** Every built-in token name. */
export const BUILTIN_TOKENS: readonly string[];

/** Machine-readable error codes. */
export const ERROR_CODES: Readonly<Record<string, ErrorCode>>;
