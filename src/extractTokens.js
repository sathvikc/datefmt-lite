import { DEFAULT_HANDLERS } from './handlers.js';
import { buildTokenRegex } from './utils.js';

/**
 * Extracts raw token values from an input date string based on the input format.
 *
 * This function attempts to align each token in the `inputFormat` with a substring in `inputDate`,
 * storing matched values by token name. If a token fails to match (e.g., insufficient length or non-digit),
 * the function either throws or sets its value to `null`, depending on `errorPolicy`.
 *
 * @param {string} inputDate - The raw input date string (e.g., '20250425')
 * @param {string} inputFormat - Format to parse against (e.g., 'yyyyMMdd')
 * @param {Object<string, function>} handlers - Token handlers map (e.g., { yyyy: fn, MM: fn })
 * @param {Object} options
 * @param {'throw'|'silent'} [options.errorPolicy='throw'] - Determines how to handle parse failures
 *
 * @returns {Object} Object with extracted token values and a `tokens` array of successfully matched tokens.
 * Example:
 * ```js
 * extractTokens('202504', 'yyyyMM', handlers)
 * // → { yyyy: '2025', MM: '04', tokens: ['yyyy', 'MM'] }
 * ```
 */
export function extractTokens(
  inputDate,
  inputFormat,
  handlers = DEFAULT_HANDLERS,
  options = {}
) {
  const { errorPolicy = 'throw' } = options;
  const tokenRE = buildTokenRegex(handlers);
  const formatParts = [];
  let lastIdx = 0;

  // Split inputFormat into an array of tokens and literals
  for (const match of inputFormat.matchAll(tokenRE)) {
    const tok = match[0],
      idx = match.index;
    if (idx > lastIdx) formatParts.push(inputFormat.slice(lastIdx, idx)); // literal
    formatParts.push(tok);
    lastIdx = idx + tok.length;
  }

  if (lastIdx < inputFormat.length) {
    formatParts.push(inputFormat.slice(lastIdx));
  }

  const raw = {}; // raw extracted token values
  const tokens = []; // token names in parsing order
  let pos = 0; // pointer in inputDate string

  for (const segment of formatParts) {
    if (handlers[segment]) {
      const len = segment.length;
      const slice = inputDate.slice(pos, pos + len);

      if (slice.length < len || !/^\d+$/.test(slice)) {
        if (errorPolicy === 'throw') {
          throw new Error(
            `Input does not match inputFormat — failed at token "${segment}"`
          );
        }
        raw[segment] = null;
        tokens.push(segment);
        pos += len;
        continue;
      }

      raw[segment] = slice;
      tokens.push(segment);
      pos += len;
    } else {
      // Literal segment — skip over it in input string
      pos += segment.length;
    }
  }

  return { ...raw, tokens };
}
