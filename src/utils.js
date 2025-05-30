export function buildTokenRegex(handlers, extraTokens = []) {
  const pattern = [...Object.keys(handlers), ...extraTokens]
    .sort((a, b) => b.length - a.length)
    .map((tok) => tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')) // escape regex symbols
    .join('|');

  return new RegExp(`(${pattern})`, 'g');
}

export function extractAllTokensFromFormat(format) {
  return Array.from(new Set(format.match(/[a-zA-Z]+/g) || []));
}
