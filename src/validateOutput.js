import { buildTokenRegex, extractAllTokensFromFormat } from './utils.js';

/**
 * Validates that all tokens required by the output format are either:
 *  - Parsed from input
 *  - Overridden by `overrideTokens`
 *  - Handled via `customTokens`
 *  - Covered by `defaultTokens`
 *
 * If a token is unknown or cannot be produced, behavior depends on `errorPolicy`.
 * In `silent` mode, fallback literals (token-as-string) are returned instead.
 *
 * @param {Object} opts
 * @param {string[]} opts.parsedTokens - Tokens successfully parsed from input format
 * @param {string} opts.outputFormat - Target format string (e.g. "dd/MM/yyyy")
 * @param {Object} opts.handlers - Built-in formatting handlers
 * @param {Object} [opts.customTokens={}] - Additional token handlers
 * @param {Object} [opts.defaultTokens={}] - Fallback values when data is missing
 * @param {Object} [opts.overrideTokens={}] - Fixed overrides for token output
 * @param {'throw'|'silent'} [opts.errorPolicy='throw'] - Controls validation strictness
 *
 * @returns {Object} A map of all tokens that should override normal formatting behavior
 * @example
 * validateOutput({
 *   parsedTokens: ['yyyy', 'MM'],
 *   outputFormat: 'dd/MM/yyyy',
 *   handlers,
 *   defaultTokens: { dd: '01' }
 * })
 * // → { dd: '01' } // fallback applied
 */
export function validateOutput({
  parsedTokens,
  outputFormat,
  handlers,
  customTokens = {},
  defaultTokens = {},
  overrideTokens = {},
  errorPolicy = 'throw',
}) {
  const userOverrides = { ...overrideTokens };
  const defaultTokenKeys = Object.keys(defaultTokens);

  // Remove bracketed literals (e.g. [at]) before token extraction
  const sanitized = outputFormat.replace(/\[.*?\]/g, '');

  // Build greedy matcher including custom/override/default/unknown tokens
  const tokenRE = buildTokenRegex(handlers, [
    ...Object.keys(userOverrides),
    ...defaultTokenKeys,
    ...extractAllTokensFromFormat(sanitized),
  ]);

  // Add defaults to override map if not present in parsed input
  for (const tok of defaultTokenKeys) {
    if (!parsedTokens.includes(tok)) {
      userOverrides[tok] = defaultTokens[tok];
    }
  }

  // Determine what we are capable of rendering
  const produceable = new Set([
    ...parsedTokens,
    ...Object.keys(userOverrides),
    ...Object.keys(customTokens),
    ...defaultTokenKeys,
  ]);

  const needed = [...sanitized.matchAll(tokenRE)].map((m) => m[0]);

  for (const tok of needed) {
    const isDerived = tok === 'yyyy' && parsedTokens.includes('yy');

    const known =
      tok in handlers ||
      tok in customTokens ||
      defaultTokenKeys.includes(tok) ||
      tok in overrideTokens ||
      isDerived;

    const renderable = produceable.has(tok) || isDerived;

    if (!known) {
      if (errorPolicy === 'throw') {
        throw new Error(`Unknown token "${tok}" in output format`);
      }
      userOverrides[tok] = tok; // fallback literal
      continue;
    }

    if (!renderable) {
      if (errorPolicy === 'throw') {
        throw new Error(`Cannot produce token "${tok}" — no data or default`);
      }
      userOverrides[tok] = tok;
    }
  }

  return userOverrides;
}
