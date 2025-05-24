import { buildTokenRegex } from './utils.js';

/**
 * compileFormat()
 * Stateless: priority = overrideTokens → handler → defaultTokens → literal
 */
export function compileFormat(
  formatStr,
  handlers,
  overrideTokens = {},
  defaultTokens = {}
) {
  const tokenRE = buildTokenRegex(handlers);
  const parts = [];
  let lastIndex = 0;

  for (const match of formatStr.matchAll(tokenRE)) {
    const tok = match[0], idx = match.index;
    if (idx > lastIndex) parts.push(formatStr.slice(lastIndex, idx));

    parts.push(dateParts => {
      if (tok in overrideTokens) {
        const v = overrideTokens[tok];
        return typeof v === 'function' ? v(dateParts) : v;
      }
      const fn = handlers[tok];
      if (fn) {
        const out = fn(dateParts);
        if (out != null) return out;
      }
      if (tok in defaultTokens) {
        const d = defaultTokens[tok];
        return typeof d === 'function' ? d(dateParts) : d;
      }
      return tok;
    });

    lastIndex = idx + tok.length;
  }

  if (lastIndex < formatStr.length) {
    parts.push(formatStr.slice(lastIndex));
  }
  return parts;
}