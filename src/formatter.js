import { extractTokens } from './extractTokens.js';
import { normalizeFields } from './normalizeFields.js';
import { validateOutput } from './validateOutput.js';
import { buildTemplate } from './buildTemplate.js';
import { DEFAULT_HANDLERS, TOKEN_FIELD_MAP } from './handlers.js';

/**
 * Converts a date string from one format to another using token-based parsing and rendering.
 *
 * This is the main entry point to the library and supports advanced options like custom tokens,
 * token overrides, default fallbacks, error handling modes, and year expansion.
 *
 * @param {string} inputDate - Input string to parse (e.g. '20250425')
 * @param {string} inputFormat - Format of the input string (e.g. 'yyyyMMdd')
 * @param {string} outputFormat - Desired output format (e.g. 'dd/MM/yyyy')
 * @param {Object} [options={}]
 * @param {'throw'|'silent'} [options.errorPolicy='throw'] - How to handle errors (strict vs. fallback)
 * @param {function} [options.yearConverter] - Required if using 'yy'; converts 2-digit year to 4-digit
 * @param {Object<string, function>} [options.customTokens] - Add or override formatting tokens
 * @param {Object<string, string|function>} [options.overrideTokens] - Hard-coded token outputs
 * @param {Object<string, string|function>} [options.defaultTokens] - Fallback values for missing tokens
 *
 * @returns {string} The reformatted date string.
 *
 * @example
 * formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')
 * // → '25/04/2025'
 */
export function formatDate(
  inputDate,
  inputFormat,
  outputFormat,
  {
    errorPolicy = 'throw',
    yearConverter,
    customTokens = {},
    overrideTokens = {},
    defaultTokens = {},
  } = {}
) {
  const { tokens: parsedTokens, ...raw } = extractTokens(
    inputDate,
    inputFormat,
    DEFAULT_HANDLERS,
    { errorPolicy }
  );

  // Special case: in silent mode, if nothing valid was extracted, return input
  if (
    errorPolicy === 'silent' &&
    parsedTokens.length > 0 &&
    parsedTokens.every((tok) => raw[tok] == null)
  ) {
    return inputDate;
  }

  // Map raw input into named fields like year, month, etc.
  const dateParts = normalizeFields(
    { tokens: parsedTokens, ...raw },
    { yearConverter, errorPolicy }
  );

  // Validate that all required output tokens are present or handled
  const overrides = validateOutput({
    parsedTokens,
    outputFormat,
    handlers: DEFAULT_HANDLERS,
    customTokens,
    defaultTokens,
    overrideTokens,
    errorPolicy,
  });

  // In silent mode, fallback to raw token name if data is missing
  if (errorPolicy === 'silent') {
    for (const tok of parsedTokens) {
      const field = TOKEN_FIELD_MAP[tok];
      if (field && dateParts[field] == null) {
        overrides[tok] = tok; // fallback to token name
      }
    }
  }

  // Combine built-ins, custom, and override/default handlers
  const finalHandlers = {
    ...DEFAULT_HANDLERS,
    ...customTokens,
    ...overrides,
  };

  const chunks = buildTemplate(outputFormat, finalHandlers);
  return chunks
    .map((chunk) => (typeof chunk === 'string' ? chunk : chunk(dateParts)))
    .join('');
}
