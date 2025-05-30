import { buildTokenRegex } from './utils.js';

/**
 * Compiles an output format string into a list of renderable chunks.
 *
 * Each chunk is either:
 * - A literal string (e.g. '/', '-', ' at ')
 * - A function that maps `dateParts` to a token string (e.g. p => p.year)
 *
 * The result is used during rendering to dynamically build the final output.
 *
 * @param {string} outputFormat - Desired output format (e.g. 'dd/MM/yyyy [at] HH:mm')
 * @param {Object<string, function|string>} handlers - Map of token handlers
 *   Each token maps to a string or a function that receives `dateParts` and returns string.
 *
 * @returns {(string | function)[]} An array of string literals and token-resolving functions.
 *
 * @example
 * buildTemplate('dd/MM/yyyy', { dd: p => '25', MM: p => '04', yyyy: p => '2025' });
 * // → [fn, '/', fn, '/', fn]
 */
export function buildTemplate(outputFormat, handlers) {
  const tokenRE = buildTokenRegex(handlers); // regex to find tokens like yyyy, dd, etc.
  const chunks = [];
  let lastIndex = 0;

  for (const match of outputFormat.matchAll(tokenRE)) {
    const tok = match[0];
    const idx = match.index;

    // Push preceding literal if any
    if (idx > lastIndex) {
      chunks.push(outputFormat.slice(lastIndex, idx));
    }

    const handler = handlers[tok];
    // Push the handler (function or wrapped static string)
    if (typeof handler === 'function') {
      chunks.push(handler);
    } else {
      chunks.push(() => handler); // wrap string as function for uniformity
    }

    lastIndex = idx + tok.length;
  }

  // Append any trailing literal after last token
  if (lastIndex < outputFormat.length) {
    chunks.push(outputFormat.slice(lastIndex));
  }

  return chunks;
}
