import { buildTokenRegex } from './utils.js';

export function buildTemplate(outputFormat, handlers) {
  const tokenRE = buildTokenRegex(handlers);
  const chunks = [];
  let lastIndex = 0;

  for (const match of outputFormat.matchAll(tokenRE)) {
    const tok = match[0];
    const idx = match.index;
    if (idx > lastIndex) {
      chunks.push(outputFormat.slice(lastIndex, idx));
    }
    const handler = handlers[tok];
    if (typeof handler === 'function') {
      chunks.push(handler);
    } else {
      chunks.push(() => handler);
    }
    lastIndex = idx + tok.length;
  }

  if (lastIndex < outputFormat.length) {
    chunks.push(outputFormat.slice(lastIndex));
  }

  return chunks;
}
