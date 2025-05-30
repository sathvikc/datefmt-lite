/**
 * Converts raw token values into named semantic fields like year, month, etc.
 *
 * This function is responsible for interpreting the raw slices extracted from the input date
 * and mapping them into a structured object used by formatting logic.
 *
 * It handles both `yyyy` and `yy` (via `yearConverter`), and assigns fallback values (`null`)
 * for any fields that couldn't be parsed.
 *
 * @param {Object} rawInput - The result of `extractTokens()`
 * @param {string[]} rawInput.tokens - Array of successfully parsed tokens
 * @param {Object<string, string|null>} rawInput - Remaining keys are raw token values (e.g. { yyyy: "2025", MM: "04" })
 * @param {Object} [options={}]
 * @param {function} [options.yearConverter] - Required if input includes `yy` token
 * @param {'throw'|'silent'} [options.errorPolicy='throw'] - Controls fallback behavior
 *
 * @returns {Object} dateParts
 * @returns {number|null} dateParts.year
 * @returns {number|null} dateParts.month
 * @returns {number|null} dateParts.day
 * @returns {number|null} dateParts.hour
 * @returns {number|null} dateParts.minute
 * @returns {number|null} dateParts.second
 * @returns {string[]} dateParts.tokens - Copied from input tokens
 *
 * @example
 * normalizeFields({ tokens: ['yyyy', 'MM'], yyyy: '2025', MM: '04' })
 * // → { year: 2025, month: 4, day: null, hour: null, minute: null, second: null, tokens: ['yyyy', 'MM'] }
 */
export function normalizeFields(
  { tokens, ...raw },
  { yearConverter, errorPolicy = 'throw' } = {}
) {
  const dateParts = {};

  const hasYYYY = raw.yyyy != null;
  const hasYY = raw.yy != null;

  // Handle year resolution logic
  if (hasYYYY) {
    dateParts.year = Number(raw.yyyy);
  } else if (hasYY) {
    const numeric = Number(raw.yy);
    if (typeof yearConverter === 'function') {
      dateParts.year = yearConverter(numeric);
    } else if (errorPolicy === 'silent') {
      dateParts.year = numeric; // best-effort fallback
    } else {
      throw new Error(
        'yearConverter is required when using two-digit year "yy" format'
      );
    }
  } else {
    dateParts.year = null;
  }

  // Map remaining fields using fallback order: long → short token
  dateParts.month =
    raw.MM != null ? Number(raw.MM) : raw.M != null ? Number(raw.M) : null;

  dateParts.day =
    raw.dd != null ? Number(raw.dd) : raw.d != null ? Number(raw.d) : null;

  dateParts.hour =
    raw.HH != null ? Number(raw.HH) : raw.H != null ? Number(raw.H) : null;

  dateParts.minute =
    raw.mm != null ? Number(raw.mm) : raw.m != null ? Number(raw.m) : null;

  dateParts.second =
    raw.ss != null ? Number(raw.ss) : raw.s != null ? Number(raw.s) : null;

  // Preserve input token list (used for downstream formatting decisions)
  dateParts.tokens = Array.isArray(tokens) ? [...tokens] : [];

  return dateParts;
}
