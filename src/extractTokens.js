import { ERROR_CODES, DateFormatError } from './errors.js';
import { TOKEN_REGISTRY, tokenizeBuiltin } from './handlers.js';
import { hasOwn, nullProtoMap, tokenizeFormat } from './utils.js';

const DIGITS_ONLY = /^\d+$/;

/**
 * Longest month name, used as the read-ahead bound for textual tokens.
 * `MMM` also accepts full names so that forgiving input is possible.
 */
const TEXT_LIMIT = 9;

/**
 * Outcome of reading one token.
 *
 * `absent` means the input ran out before the token could be read, which is a
 * tolerable partial parse. `corrupt` means the characters are there but are not
 * the shape the token requires, which signals a genuinely malformed record and
 * must not be rendered as a best-effort date.
 *
 * @typedef {{status: 'ok', raw: string, next: number}
 *   | {status: 'absent'}
 *   | {status: 'corrupt'}} ReadResult
 */

/**
 * Reads the numeric value for one token, honouring variable-width tokens.
 *
 * `M`, `d`, `H`, `m` and `s` accept one or two digits. Two are tried first so
 * that `Mdd` reads `0415` as month `04` day `15`; one is used when the wider
 * slice is not purely numeric or would overrun the input.
 *
 * @param {string} input
 * @param {number} pos
 * @param {{width: number, variable: boolean}} spec
 * @returns {ReadResult}
 */
function readNumeric(input, pos, spec) {
  const widths = spec.variable ? [spec.width, 1] : [spec.width];
  let sawChars = false;

  for (const width of widths) {
    const slice = input.slice(pos, pos + width);
    if (slice.length < width) continue;
    sawChars = true;
    if (DIGITS_ONLY.test(slice)) {
      return { status: 'ok', raw: slice, next: pos + width };
    }
  }

  // The unreadable slice still occupies its declared width, so the caller
  // advances the cursor and later tokens stay aligned.
  return { status: sawChars ? 'corrupt' : 'absent', advance: spec.width };
}

/**
 * Reads a textual token by matching a month name or abbreviation at the current
 * position, preferring the longest match so that `April` is not truncated to
 * `Apr` when the format says `MMM`.
 *
 * @param {string} input
 * @param {number} pos
 * @param {(text: string) => number|null} parse
 * @returns {{ raw: string, value: number, next: number }|null}
 */
function readTextual(input, pos, parse) {
  let best = null;

  for (let width = 1; width <= TEXT_LIMIT; width++) {
    const slice = input.slice(pos, pos + width);
    if (slice.length < width) break;
    const value = parse(slice);
    if (value !== null)
      best = { status: 'ok', raw: slice, value, next: pos + width };
  }

  if (best) return best;
  return { status: pos >= input.length ? 'absent' : 'corrupt' };
}

/**
 * Extracts raw token values from an input string using an input format.
 *
 * The format is tokenized with the same routine the renderer uses, so compact
 * formats (`yyyyMMdd`) and literal text behave identically in both directions.
 * Literal separators are verified against the input rather than skipped by
 * length, which is what stops a stray byte from silently shifting every later
 * field.
 *
 * A token that cannot be read yields a `null` value and is omitted from
 * `tokens`, so callers can tell "absent from the data" apart from "present in
 * the data". `mismatched` is true when the string as a whole failed to conform,
 * which is the signal `errorPolicy: 'silent'` uses to fall back to raw input.
 *
 * @param {string} inputDate
 * @param {string} inputFormat
 * @param {Record<string, object>} [handlers] Token table used to recognise
 *   format tokens. Defaults to the built-ins.
 * @param {{ verifyLiterals?: boolean }} [options]
 * @returns {{ tokens: string[], values: Record<string, string|null>, mismatched: boolean }}
 *
 * @example
 * extractTokens('20250425', 'yyyyMMdd');
 * // → { tokens: ['yyyy','MM','dd'], values: { yyyy: '2025', MM: '04', dd: '25' }, mismatched: false }
 */
export function extractTokens(inputDate, inputFormat, handlers, options = {}) {
  if (typeof inputDate !== 'string') {
    throw new DateFormatError(
      `inputDate must be a string, received ${typeof inputDate}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }
  if (typeof inputFormat !== 'string') {
    throw new DateFormatError(
      `inputFormat must be a string, received ${typeof inputFormat}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  // Lenient literal skipping exists for legacy call sites that rely on
  // separators being positional only. It can desynchronise the cursor, so it
  // reports that fact rather than looking like a clean parse.
  const { verifyLiterals = true } = options;
  const table = handlers ?? TOKEN_REGISTRY;

  const names = Object.keys(table);
  const segments =
    table === TOKEN_REGISTRY
      ? tokenizeBuiltin(inputFormat)
      : tokenizeFormat(
          inputFormat,
          names.filter((name) => typeof name === 'string' && name),
        );

  const values = nullProtoMap();
  const tokens = [];
  let sawToken = false;
  let mismatched = false;
  let desynced = false;
  let pos = 0;

  for (const segment of segments) {
    if (segment.type === 'literal') {
      const expected = segment.value;
      const found = inputDate.slice(pos, pos + expected.length);
      if (found !== expected) {
        mismatched = true;
        if (verifyLiterals) break;
        desynced = true;
      }
      pos += expected.length;
      continue;
    }

    if (segment.type === 'escaped') {
      if (inputDate.slice(pos, pos + segment.value.length) !== segment.value) {
        mismatched = true;
      }
      pos += segment.value.length;
      continue;
    }

    const token = segment.value;
    if (!hasOwn(table, token)) {
      pos += token.length;
      continue;
    }

    sawToken = true;
    const spec = table[token];
    const read = spec.parse
      ? readTextual(inputDate, pos, spec.parse)
      : readNumeric(inputDate, pos, spec);

    if (read.status !== 'ok') {
      values[token] = null;
      // An unreadable token still occupies its declared width. Advancing the
      // cursor is what stops a following variable-width token from re-reading
      // the same characters and reporting a bogus value.
      if (read.status === 'corrupt') mismatched = true;
      pos += read.advance ?? 0;
      continue;
    }

    values[token] = spec.parse ? String(read.value) : read.raw;
    tokens.push(token);
    pos = read.next;
  }

  if (!mismatched && pos < inputDate.length) mismatched = true;
  if (!mismatched && sawToken && tokens.length === 0) mismatched = true;

  // Reading past the end of the input means the declared widths did not fit the
  // record, so the shape never matched even if every readable token did.
  if (!mismatched && pos > inputDate.length) mismatched = true;

  return { tokens, values, mismatched: mismatched || desynced };
}
