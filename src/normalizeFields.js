import { ERROR_CODES, DateFormatError } from './errors.js';
import {
  BUILTIN_TOKENS,
  FIELD_PREFERENCE,
  TOKEN_REGISTRY,
} from './handlers.js';
import { hasOwn } from './utils.js';

/**
 * Validates the value returned by a user-supplied `yearConverter`.
 *
 * Without this a converter returning `undefined` or `'abc'` silently rendered
 * the literal strings `"undefined"` and `"0abc"` into the output.
 *
 * @param {unknown} year
 * @param {number} input
 * @returns {number}
 */
function coerceYear(year, input) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 0) {
    const shown = Number.isNaN(year)
      ? 'NaN'
      : (JSON.stringify(year) ?? typeof year);
    throw new DateFormatError(
      `yearConverter must return a non-negative integer, received ${shown} for input ${input}`,
      ERROR_CODES.INVALID_YEAR,
      { field: 'year' },
    );
  }
  return year;
}

/**
 * Converts raw token values into named semantic fields.
 *
 * Values are sourced by field, preferring the widest token that captured a
 * usable value, so a date parsed with both `MM` and `M` resolves deterministically.
 *
 * @param {{ tokens?: string[], values?: Record<string, string|null> }} input
 *   Either the object returned by {@link extractTokens}, or a flat map of token
 *   values with a `tokens` array.
 * @param {{ yearConverter?: (yy: number) => number, errorPolicy?: 'throw'|'silent' }} [options]
 * @returns {{ year: number|null, month: number|null, day: number|null, hour: number|null, minute: number|null, second: number|null, tokens: string[] }}
 *
 * @example
 * normalizeFields({ tokens: ['yyyy','MM'], values: { yyyy: '2025', MM: '04' } });
 * // → { year: 2025, month: 4, day: null, ..., tokens: ['yyyy','MM'] }
 */
export function normalizeFields(input, options = {}) {
  const { yearConverter, errorPolicy = 'throw' } = options;

  if (input == null || typeof input !== 'object') {
    throw new DateFormatError(
      `normalizeFields expects an object, received ${typeof input}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  const values = input.values ?? input;
  const tokens = Array.isArray(input.tokens) ? input.tokens : [];
  const dateParts = { tokens: [...tokens] };

  for (const field of ['month', 'day', 'hour', 'minute', 'second']) {
    dateParts[field] = null;
    for (const token of FIELD_PREFERENCE[field] ?? []) {
      const raw = values[token];
      if (raw == null || raw === '') continue;
      // Only a plain run of digits counts. `Number()` would also accept '0x10',
      // '1e2' and ' 04', which would silently invent a value.
      if (!/^\d+$/.test(raw)) continue;
      dateParts[field] = Number(raw);
      break;
    }
  }

  // Custom tokens own their field, so a handler can read what it parsed. Built-in
  // token names are deliberately excluded: exposing `dateParts.MM` alongside
  // `dateParts.month` would give the same value two spellings, and a custom token
  // named `month` would collide with the semantic field.
  for (const token of Object.keys(values)) {
    if (BUILTIN_TOKENS.includes(token)) continue;
    if (token in FIELD_PREFERENCE) continue;
    if (Object.hasOwn(dateParts, token)) continue;
    const raw = values[token];
    dateParts[token] = raw == null || raw === '' ? null : Number(raw);
  }

  const hasYYYY = values.yyyy != null && values.yyyy !== '';
  const hasYY = values.yy != null && values.yy !== '';

  if (hasYYYY) {
    dateParts.year = Number(values.yyyy);
  } else if (hasYY) {
    const numeric = Number(values.yy);
    if (typeof yearConverter === 'function') {
      dateParts.year = coerceYear(yearConverter(numeric), numeric);
    } else if (errorPolicy === 'silent') {
      dateParts.year = numeric;
    } else {
      throw new DateFormatError(
        'yearConverter is required when using two-digit year "yy"',
        ERROR_CODES.INVALID_OPTION,
        { token: 'yy', field: 'year' },
      );
    }
  } else {
    dateParts.year = null;
  }

  if (
    dateParts.year != null &&
    (!Number.isInteger(dateParts.year) || dateParts.year < 0)
  ) {
    throw new DateFormatError(
      `year must be a non-negative integer, received ${dateParts.year}`,
      ERROR_CODES.INVALID_YEAR,
      { field: 'year' },
    );
  }

  return dateParts;
}

/**
 * Reports whether a field holds a usable value.
 *
 * @param {object} dateParts
 * @param {string} field
 * @returns {boolean}
 */
export function hasField(dateParts, field) {
  return hasOwn(dateParts, field) && dateParts[field] != null;
}

export { TOKEN_REGISTRY };
