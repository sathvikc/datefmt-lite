import { DEFAULT_HANDLERS } from './handlers.js';
import { parseInput } from './parser.js';
import { compileFormat, buildTokenRegex } from './compiler.js';

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

  // 1) Merge handlers (built‑ins + custom)
  const handlers = { ...DEFAULT_HANDLERS, ...customTokens };

  // 2) Parse (strict or best‑effort)
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

  // 3) Derive which tokens were in the inputFormat
  const tokenRE = buildTokenRegex(handlers);
  const parsedTokens = [...inputFormat.matchAll(tokenRE)].map((m) => m[0]);
  // allow yyyy output if input had yy + converter
  if (parsedTokens.includes('yy') && typeof yearConverter === 'function') {
    parsedTokens.push('yyyy');
  }
  dateParts._tokens = parsedTokens;

  // 3a) Promote missing defaultTokens into overrideTokens so they fire first
  for (const tok of Object.keys(defaultTokens)) {
    if (!parsedTokens.includes(tok)) {
      overrideTokens[tok] = defaultTokens[tok];
    }
  }

  // 5) Build validity sets
  const validTokens = new Set([
    ...Object.keys(handlers),
    ...Object.keys(defaultTokens),
    ...Object.keys(overrideTokens),
  ]);
  const produceable = new Set([
    ...Object.keys(overrideTokens),
    ...parsedTokens,
    ...Object.keys(defaultTokens),
    ...Object.keys(customTokens),
  ]);

  // 6) Pre‑validate & inject literal overrides in silent mode
  const needed = [...outputFormat.matchAll(tokenRE)].map((m) => m[0]);
  for (const tok of needed) {
    if (!validTokens.has(tok)) {
      if (errorPolicy === 'throw') {
        throw new Error(`Unknown token "${tok}" in output format`);
      }
      // silent: literal‑fallback
      overrideTokens[tok] = tok;
      continue;
    }
    if (!produceable.has(tok)) {
      if (errorPolicy === 'throw') {
        throw new Error(`Cannot produce token "${tok}"—no data or default`);
      }
      // silent: literal‑fallback
      overrideTokens[tok] = tok;
    }
  }

  // 7) Compile & render
  const template = compileFormat(
    outputFormat,
    handlers,
    overrideTokens,
    defaultTokens
  );
  return template
    .map((chunk) => (typeof chunk === 'string' ? chunk : chunk(dateParts)))
    .join('');
}
