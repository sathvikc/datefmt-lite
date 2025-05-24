/**
 * buildTokenRegex()
 */
export function buildTokenRegex(handlers) {
  const pattern = Object.keys(handlers)
    .sort((a, b) => b.length - a.length)
    .map(tok => tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
    .join('|');
  return new RegExp(`(${pattern})`, 'g');
}