/**
 * Error codes raised by this library.
 *
 * @readonly
 * @enum {string}
 */
export const ERROR_CODES = Object.freeze({
  /** An argument was missing or of the wrong type. */
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  /** An option value was not one of the accepted values. */
  INVALID_OPTION: 'INVALID_OPTION',
  /** An option or token name collided with a reserved `Object.prototype` key. */
  RESERVED_TOKEN: 'RESERVED_TOKEN',
  /** The input string did not match the declared input format. */
  INPUT_MISMATCH: 'INPUT_MISMATCH',
  /** An output token could not be produced from the available data. */
  UNPRODUCIBLE_TOKEN: 'UNPRODUCIBLE_TOKEN',
  /** A field parsed successfully but held a value outside its legal range. */
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  /** `yearConverter` returned something that is not a year. */
  INVALID_YEAR: 'INVALID_YEAR',
});

const MAX_TOKEN_IN_MESSAGE = 64;

/**
 * Truncates a token name before interpolating it into an error message, so a
 * pathological format string cannot produce a megabyte-long log line.
 *
 * @param {string} token
 * @returns {string}
 */
export function truncateToken(token) {
  const str = String(token);
  return str.length > MAX_TOKEN_IN_MESSAGE
    ? `${str.slice(0, MAX_TOKEN_IN_MESSAGE)}…`
    : str;
}

const safeToken = truncateToken;

/**
 * The single error type thrown by `datefmt-lite`.
 *
 * Callers can branch on `err.code` instead of pattern-matching message text,
 * and `err.token` / `err.field` identify what went wrong.
 *
 * @example
 * try {
 *   formatDate('2025', 'yyyy', 'dd');
 * } catch (err) {
 *   if (err.code === 'UNPRODUCIBLE_TOKEN') console.warn(err.token);
 * }
 */
export class DateFormatError extends Error {
  /**
   * @param {string} message
   * @param {string} code - One of {@link ERROR_CODES}
   * @param {{ token?: string, field?: string }} [details]
   */
  constructor(message, code, { token, field } = {}) {
    super(message);
    this.name = 'DateFormatError';
    this.code = code;
    if (token !== undefined) this.token = safeToken(token);
    if (field !== undefined) this.field = field;
  }
}

/**
 * Builds a `DateFormatError` for an output token that has no source of data.
 *
 * @param {string} token
 * @param {string} reason
 * @returns {DateFormatError}
 */
export function unproducibleToken(token, reason) {
  return new DateFormatError(
    `Cannot produce token "${safeToken(token)}" — ${reason}`,
    ERROR_CODES.UNPRODUCIBLE_TOKEN,
    { token },
  );
}
