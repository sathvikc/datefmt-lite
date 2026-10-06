import { ERROR_CODES, DateFormatError } from './errors.js';
import { CANDIDATES, requiredFields, satisfies } from './detect.js';
import { TOKEN_REGISTRY } from './handlers.js';
import { hasOwn, nullProtoMap, tokenizeFormat } from './utils.js';

const DIGITS_ONLY = /^\d+$/;

/** Longest month name, used as the read-ahead bound for textual tokens. */
const TEXT_LIMIT = 9;

/**
 * Outcome of reading one token.
 *
 * `absent` means the input ran out before the token could be read, which is a
 * tolerable partial parse. `corrupt` means the characters are there but are not
 * the shape the token requires, which signals a genuinely malformed record.
 *
 * @typedef {{status: 'ok', raw: string, next: number}
 *   | {status: 'absent', advance: number}
 *   | {status: 'corrupt', advance: number}} ReadResult
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
 * Reads a textual token by matching a month name or abbreviation, preferring the
 * longest match so that `April` is not truncated to `Apr`.
 *
 * @param {string} input
 * @param {number} pos
 * @param {(text: string) => number|null} parse
 * @returns {ReadResult}
 */
function readTextual(input, pos, parse) {
  let best = null;

  for (let width = 1; width <= TEXT_LIMIT; width++) {
    const slice = input.slice(pos, pos + width);
    if (slice.length < width) break;
    const value = parse(slice);
    if (value !== null) {
      best = { status: 'ok', raw: slice, value, next: pos + width };
    }
  }

  if (best) return best;
  return { status: pos >= input.length ? 'absent' : 'corrupt', advance: 1 };
}

/**
 * Reads a format's tokens out of an input string.
 *
 * @param {string} inputDate
 * @param {string} inputFormat
 * @param {Record<string, object>} table
 * @returns {{tokens: string[], values: Record<string, string|null>, mismatched: boolean}}
 */
function parseWith(inputDate, inputFormat, table) {
  const names = Object.keys(table);
  const segments =
    table === TOKEN_REGISTRY
      ? tokenizeFormat(inputFormat, names)
      : tokenizeFormat(
          inputFormat,
          names.filter((name) => typeof name === 'string' && name),
        );

  const values = nullProtoMap();
  const tokens = [];
  let sawToken = false;
  let mismatched = false;
  let pos = 0;

  for (const segment of segments) {
    if (segment.type === 'literal') {
      const expected = segment.value;
      if (inputDate.slice(pos, pos + expected.length) !== expected) {
        mismatched = true;
        break;
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
      if (read.status === 'corrupt') mismatched = true;
      pos += read.advance ?? 0;
      continue;
    }

    values[token] = spec.parse ? String(read.value) : read.raw;
    tokens.push(token);
    pos = read.next;
  }

  if (!mismatched && pos < inputDate.length) mismatched = true;
  if (!mismatched && pos > inputDate.length) mismatched = true;
  if (!mismatched && sawToken && tokens.length === 0) mismatched = true;

  return { tokens, values, mismatched };
}

/**
 * Guesses the input format for a string.
 *
 * Every candidate is genuinely parsed and then checked against the fields the
 * output format needs, so `04/25/2025` resolves to `MM/dd/yyyy` when the output
 * wants a month and to `dd/MM/yyyy` when it wants a day, without any
 * hand-tuned scoring.
 *
 * @param {string} inputDate
 * @param {Record<string, object>} table
 * @param {string} [outputFormat] Used to disambiguate day and month order.
 * @returns {string|null} The chosen format, or `null` when nothing fits.
 */
export function detectFormat(inputDate, table, outputFormat) {
  const required = outputFormat ? requiredFields(outputFormat) : null;

  for (const [format, pattern] of CANDIDATES) {
    if (!pattern.test(inputDate)) continue;

    const parsed = parseWith(inputDate, format, table);
    if (parsed.mismatched) continue;

    if (!satisfies(parsed.values, required)) continue;

    return format;
  }

  return null;
}

/**
 * Extracts raw token values from an input string.
 *
 * When `inputFormat` is `null` or omitted the format is detected from the input,
 * guided by the fields the output format needs. Literal separators are verified
 * rather than skipped by length, which is what stops a BOM or a wrong separator
 * from silently shifting every later field.
 *
 * A token that cannot be read yields a `null` value and is omitted from
 * `tokens`, so callers can tell "absent from the data" apart from "present but
 * unparseable". `mismatched` is true when the string as a whole failed to
 * conform.
 *
 * @param {string} inputDate
 * @param {string|null} [inputFormat] Omit or pass `null` to detect it.
 * @param {Record<string, object>} [handlers] Token table. Defaults to built-ins.
 * @param {{ outputFormat?: string }} [options]
 * @returns {{tokens: string[], values: Record<string, string|null>, mismatched: boolean, detected?: string}}
 *
 * @example
 * extractTokens('20250425', 'yyyyMMdd');
 * // → { tokens: ['yyyy','MM','dd'], values: { yyyy:'2025', MM:'04', dd:'25' }, mismatched: false }
 * extractTokens('25/04/2025', null, undefined, { outputFormat: 'dd/MM/yyyy' });
 * // → detects 'dd/MM/yyyy'
 */
export function extractTokens(inputDate, inputFormat, handlers, options = {}) {
  if (typeof inputDate !== 'string') {
    throw new DateFormatError(
      `inputDate must be a string, received ${typeof inputDate}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  const table = handlers ?? TOKEN_REGISTRY;

  if (inputFormat == null) {
    const detected = detectFormat(inputDate, table, options.outputFormat);
    if (detected === null) {
      return { tokens: [], values: nullProtoMap(), mismatched: true };
    }
    return { ...parseWith(inputDate, detected, table), detected };
  }

  if (typeof inputFormat !== 'string') {
    throw new DateFormatError(
      `inputFormat must be a string or null, received ${typeof inputFormat}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  return parseWith(inputDate, inputFormat, table);
}