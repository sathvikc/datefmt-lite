import { DEFAULT_HANDLERS } from './handlers.js';
import { parseInput } from './parser.js';
import { compileFormat } from './compiler.js';
import { buildTokenRegex } from './utils.js';

/**
 * formatDate()
 * High‑level API: parses, validates, and renders a date string.
 */
export function formatDate(
  inputDate,
  inputFormat,
  outputFormat,
  {
    customTokens = {},
    overrideTokens = {},
    defaultTokens = {},
    yearConverter,
    errorPolicy = 'throw',
  } = {}
) {
  if (typeof inputDate !== 'string') return null;

  const handlers = { ...DEFAULT_HANDLERS, ...customTokens };

  let dateParts;
  try {
    dateParts = parseInput(inputDate, inputFormat, handlers, yearConverter);
  } catch (err) {
    if (errorPolicy === 'silent') {
      // best‑effort: return raw input on parse error
      return inputDate;
    }
    throw err;
  }

  const tokenRE = buildTokenRegex(handlers);
  const defaultTokenKeys = Object.keys(defaultTokens);
  const parsedTokens = [...inputFormat.matchAll(tokenRE)].map((m) => m[0]);

  // allow yyyy output if input had yy + converter
  if (parsedTokens.includes('yy') && typeof yearConverter === 'function') {
    parsedTokens.push('yyyy');
  }
  dateParts._tokens = parsedTokens;

  const userOverride = { ...overrideTokens };
  for (const tok of defaultTokenKeys) {
    if (!parsedTokens.includes(tok)) {
      userOverride[tok] = defaultTokens[tok];
    }
  }

  const validTokens = new Set([
    ...Object.keys(handlers),
    ...defaultTokenKeys,
    ...Object.keys(overrideTokens),
  ]);

  const produceable = new Set([
    ...Object.keys(overrideTokens),
    ...parsedTokens,
    ...defaultTokenKeys,
    ...Object.keys(customTokens),
  ]);

  const needed = [...outputFormat.matchAll(tokenRE)].map((m) => m[0]);
  for (const tok of needed) {
    if (!validTokens.has(tok)) {
      if (errorPolicy === 'throw') {
        throw new Error(`Unknown token "${tok}" in output format`);
      }
      userOverride[tok] = tok;
      continue;
    }
    if (!produceable.has(tok)) {
      if (errorPolicy === 'throw') {
        throw new Error(`Cannot produce token "${tok}"—no data or default`);
      }
      userOverride[tok] = tok;
    }
  }

  const template = compileFormat(
    outputFormat,
    handlers,
    userOverride,
    defaultTokens
  );
  return template
    .map((chunk) => (typeof chunk === 'string' ? chunk : chunk(dateParts)))
    .join('');
}
