/**
 * Builds a greedy regex to match known tokens inside a format string.
 *
 * Sorts tokens by length (longest first) to avoid partial matches,
 * and escapes regex-reserved characters.
 *
 * @param {Object<string, Function|string>} handlers - Known token handler map (e.g. { yyyy: fn, MM: fn })
 * @param {string[]} [extraTokens=[]] - Additional tokens to include (e.g. from overrideTokens or defaultTokens)
 *
 * @returns {RegExp} Regex that matches all known tokens
 *
 * @example
 * const re = buildTokenRegex({ yyyy: fn, MM: fn }, ['label']);
 * 'yyyy-MM-label'.match(re); // → ['yyyy', 'MM', 'label']
 */
export function buildTokenRegex(handlers, extraTokens = []) {
  const pattern = [...Object.keys(handlers), ...extraTokens]
    .sort((a, b) => b.length - a.length) // prioritize longer tokens
    .map((tok) => tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')) // escape regex
    .join('|');

  return new RegExp(`(${pattern})`, 'g');
}

/**
 * Extracts all token-like substrings from a format string.
 *
 * Unlike `buildTokenRegex()`, this doesn't use any known handler list —
 * it simply collects all contiguous alphabetic groups for later validation.
 *
 * @param {string} format - Format string (e.g. "yyyy-MM-[label]")
 * @returns {string[]} De-duplicated list of tokens (e.g. ["yyyy", "MM", "label"])
 *
 * @example
 * extractAllTokensFromFormat("yyyy-MM-QQ"); // → ["yyyy", "MM", "QQ"]
 */
export function extractAllTokensFromFormat(format) {
  return Array.from(new Set(format.match(/[a-zA-Z]+/g) || []));
}
