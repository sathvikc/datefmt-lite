import { DEFAULT_HANDLERS } from './handlers.js';
import { buildTokenRegex } from './utils.js';

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

  // Split format into tokens & literals
  for (const match of inputFormat.matchAll(tokenRE)) {
    const tok = match[0],
      idx = match.index;
    if (idx > lastIdx) formatParts.push(inputFormat.slice(lastIdx, idx));
    formatParts.push(tok);
    lastIdx = idx + tok.length;
  }
  if (lastIdx < inputFormat.length) {
    formatParts.push(inputFormat.slice(lastIdx));
  }

  const raw = {};
  const tokens = [];
  let pos = 0;

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
      pos += segment.length;
    }
  }

  return { ...raw, tokens };
}
