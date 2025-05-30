import { buildTokenRegex, extractAllTokensFromFormat } from './utils.js';

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

  const sanitized = outputFormat.replace(/\[.*?\]/g, '');

  const tokenRE = buildTokenRegex(handlers, [
    ...Object.keys(userOverrides),
    ...defaultTokenKeys,
    ...extractAllTokensFromFormat(sanitized),
  ]);

  for (const tok of defaultTokenKeys) {
    if (!parsedTokens.includes(tok)) {
      userOverrides[tok] = defaultTokens[tok];
    }
  }

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
      userOverrides[tok] = tok;
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
