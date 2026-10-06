import { buildTemplate, renderTemplate } from './buildTemplate.js';
import { ERROR_CODES, DateFormatError } from './errors.js';
import { extractTokens } from './extractTokens.js';
import { TOKEN_REGISTRY } from './handlers.js';
import { normalizeFields } from './normalizeFields.js';
import { validateOutput } from './validateOutput.js';
import { nullProtoMap } from './utils.js';
import { validateFields } from './validateFields.js';

const ERROR_POLICIES = new Set(['throw', 'silent']);
const VALIDATIONS = new Set(['off', 'lenient', 'strict']);

/**
 * Token names that collide with inherited `Object.prototype` members. Using one
 * as a custom token would be ambiguous, so it is rejected rather than silently
 * resolved against the prototype chain.
 */
const RESERVED_TOKENS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

/**
 * Converts a date string from one format into another.
 *
 * Pure token-to-token conversion: no `Date` is constructed, no timezone is
 * applied and no locale is consulted. Whatever the input format can express is
 * rearranged into whatever the output format asks for.
 *
 * @param {string} inputDate
 * @param {string} inputFormat
 * @param {string} outputFormat
 * @param {object} [options]
 * @param {'throw'|'silent'} [options.errorPolicy='throw'] `'silent'` never
 *   throws on bad data: unparseable input returns the raw input and unproducible
 *   tokens render as their own name. Caller mistakes, such as passing a
 *   non-string, still throw a {@link DateFormatError}.
 * @param {(yy: number) => number} [options.yearConverter] Expands `yy` to a full
 *   year. Must return a non-negative integer.
 * @param {Record<string, (parts: object) => string|null>} [options.customTokens]
 *   Extra tokens, usable in both `inputFormat` and `outputFormat`.
 * @param {Record<string, string|((parts: object) => string)>} [options.overrideTokens]
 *   Fixed values that take precedence over every other source.
 * @param {Record<string, string>} [options.defaultTokens] Used when no value for
 *   the underlying field was parsed.
 * @param {'off'|'lenient'|'strict'} [options.validate='off'] Range checking.
 *   `'off'` keeps the no-assumptions default; `'strict'` rejects impossible
 *   dates; `'lenient'` clamps them.
 * @param {boolean} [options.verifyLiterals=true] Verify literal separators in
 *   `inputFormat` against the input instead of skipping them by declared width.
 * @param {boolean} [options.strictTokens=false] Treat unrecognised words in
 *   `outputFormat` as errors rather than literal text. Bracketed groups and the
 *   structural separators `T`, `Z`, `W`, `a`, `t` and `z` remain allowed, so ISO
 *   8601 output keeps working.
 * @returns {string}
 * @throws {DateFormatError}
 *
 * @example
 * formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy');
 * // → '25/04/2025'
 * formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd');
 * // → '2025-04-25'
 */
export function formatDate(inputDate, inputFormat, outputFormat, options = {}) {
  if (options == null || typeof options !== 'object') {
    throw new DateFormatError(
      `options must be an object, received ${
        options === null ? 'null' : typeof options
      }`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  const {
    errorPolicy = 'throw',
    yearConverter,
    customTokens,
    overrideTokens,
    defaultTokens,
    validate = 'off',
    verifyLiterals = true,
    strictTokens = false,
  } = options;

  if (!ERROR_POLICIES.has(errorPolicy)) {
    throw new DateFormatError(
      `errorPolicy must be one of 'throw' | 'silent', received ${describe(
        errorPolicy,
      )}`,
      ERROR_CODES.INVALID_OPTION,
    );
  }
  if (!VALIDATIONS.has(validate)) {
    throw new DateFormatError(
      `validate must be one of 'off' | 'lenient' | 'strict', received ${describe(
        validate,
      )}`,
      ERROR_CODES.INVALID_OPTION,
    );
  }
  if (yearConverter !== undefined && typeof yearConverter !== 'function') {
    throw new DateFormatError(
      `yearConverter must be a function, received ${typeof yearConverter}`,
      ERROR_CODES.INVALID_OPTION,
    );
  }
  if (typeof outputFormat !== 'string') {
    throw new DateFormatError(
      `outputFormat must be a string, received ${typeof outputFormat}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  const custom = customTokens ?? nullProtoMap();
  const overrides = overrideTokens ?? nullProtoMap();
  const defaults = defaultTokens ?? nullProtoMap();

  // Custom tokens extend the registry so they are recognised in both the input
  // and the output format. They occupy their own name length in the input
  // string and populate their own field, readable via `dateParts[tokenName]`.
  const table = nullProtoMap(TOKEN_REGISTRY);
  for (const [name, def] of Object.entries(custom)) {
    if (RESERVED_TOKENS.has(name)) {
      throw new DateFormatError(
        `customTokens["${name}"] is a reserved Object.prototype key; ` +
          `choose a different token name`,
        ERROR_CODES.RESERVED_TOKEN,
        { token: name },
      );
    }
    if (typeof def !== 'function') {
      throw new DateFormatError(
        `customTokens["${name}"] must be a function, received ${typeof def}`,
        ERROR_CODES.INVALID_OPTION,
        { token: name },
      );
    }
    table[name] = {
      field: name,
      width: name.length,
      variable: false,
      handler: def,
    };
  }

  const parsed = extractTokens(inputDate, inputFormat, table, {
    verifyLiterals,
  });

  if (parsed.mismatched) {
    if (errorPolicy === 'silent') return inputDate;
    throw new DateFormatError(
      `Input does not match inputFormat "${truncate(inputFormat)}"`,
      ERROR_CODES.INPUT_MISMATCH,
    );
  }

  let dateParts;
  try {
    dateParts = normalizeFields(parsed, { yearConverter, errorPolicy });
  } catch (err) {
    if (errorPolicy === 'silent') return inputDate;
    throw err;
  }

  if (validate !== 'off') {
    const outcome = validateFields(dateParts, validate);
    if (outcome) {
      // A strict range failure is a data-quality assertion, so it surfaces even
      // under a best-effort policy rather than being silently swallowed.
      if (outcome.fatal) {
        throw new DateFormatError(outcome.message, ERROR_CODES.OUT_OF_RANGE, {
          field: outcome.field,
        });
      }
      if (errorPolicy === 'silent') return inputDate;
      if (outcome.clamped) Object.assign(dateParts, outcome.clamped);
    }
  }

  let handlers;
  try {
    handlers = validateOutput({
      parsedTokens: parsed.tokens,
      dateParts,
      outputFormat,
      overrides: {
        overrideTokens: overrides,
        defaultTokens: defaults,
        customTokens: custom,
      },
      errorPolicy,
      strictTokens,
    });
  } catch (err) {
    if (errorPolicy === 'silent') return inputDate;
    throw err;
  }

  return renderTemplate(
    // Only the resolved token names matter when compiling, and those come from
    // the token vocabulary rather than from the per-call handler values, so the
    // plan can be cached across calls that share a vocabulary.
    buildTemplate(outputFormat, handlers),
    handlers,
    dateParts,
    { onMissing: (token) => token },
  );
}

/**
 * Renders a rejected option value readably in an error message.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return value === null ? 'null' : typeof value;
}

/**
 * Shortens a format string before it appears in an error message.
 *
 * @param {string} format
 * @returns {string}
 */
function truncate(format) {
  return format.length > 64 ? `${format.slice(0, 64)}…` : format;
}
