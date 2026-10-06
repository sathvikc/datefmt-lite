import { buildTokenizer, nullProtoMap } from './utils.js';

/**
 * Full month names, indexed 1-based (`month = 1` maps to `January`).
 *
 * @type {readonly string[]}
 */
export const MONTH_NAMES = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

/**
 * Three-letter month abbreviations, used by the `MMM` token.
 *
 * @type {readonly string[]}
 */
export const MONTH_ABBREV = Object.freeze(
  MONTH_NAMES.map((name) => name.slice(0, 3)),
);

/** Lower-cased month lookup accepting both full names and abbreviations. */
const MONTH_LOOKUP = (() => {
  const map = new Map();
  MONTH_NAMES.forEach((name, index) => {
    map.set(name.toLowerCase(), index + 1);
    map.set(name.slice(0, 3).toLowerCase(), index + 1);
  });
  return map;
})();

/**
 * Resolves a textual month to its number, ignoring surrounding whitespace.
 * This is the forgiving form intended for direct calls; the input parser uses
 * {@link parseMonthText} so a match never consumes a trailing separator.
 *
 * @param {string} text
 * @returns {number|null} 1-12, or `null` when unrecognised.
 */
export function parseMonthName(text) {
  if (typeof text !== 'string') return null;
  return MONTH_LOOKUP.get(text.trim().toLowerCase()) ?? null;
}

/**
 * Strict month lookup used while reading an input string. No trimming, so the
 * matched text is exactly the characters consumed.
 *
 * @param {string} text
 * @returns {number|null}
 */
function parseMonthText(text) {
  if (typeof text !== 'string') return null;
  return MONTH_LOOKUP.get(text.toLowerCase()) ?? null;
}

/**
 * @param {number|null|undefined} value
 * @returns {boolean}
 */
function isUsable(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {number|null|undefined} value
 * @param {number} pad
 * @returns {string|null}
 */
function pad(value, pad_) {
  if (!isUsable(value)) return null;
  return String(value).padStart(pad_, '0');
}

/**
 * Every built-in token, with the metadata the parser and renderer need.
 *
 * `width` is the maximum number of characters consumed from the input string.
 * `variable` marks the single-digit forms (`M`, `d`, `H`, `m`, `s`) which accept
 * either one or two digits. `text` marks tokens parsed from words rather than
 * digits (`MMM`, `MMMM`).
 *
 * Handlers return `null` when the underlying field holds no usable value; the
 * renderer decides whether that becomes a throw or a literal fallback. Handlers
 * never throw, so `errorPolicy: 'silent'` is honoured unconditionally.
 *
 * @type {Readonly<Record<string, {field: string, width: number, variable: boolean, text?: boolean, handler: (parts: object) => string|null}>>}
 */
const REGISTRY_ENTRIES = {
  yyyy: {
    field: 'year',
    width: 4,
    variable: false,
    handler: (p) => pad(p.year, 4),
  },
  yy: {
    field: 'year',
    width: 2,
    variable: false,
    handler: (p) => {
      if (!isUsable(p.year)) return null;
      return String(p.year).padStart(2, '0').slice(-2);
    },
  },
  MMMM: {
    field: 'month',
    width: 9,
    variable: false,
    text: true,
    parse: parseMonthText,
    handler: (p) =>
      isUsable(p.month) && p.month >= 1 && p.month <= 12
        ? MONTH_NAMES[p.month - 1]
        : null,
  },
  MMM: {
    field: 'month',
    width: 3,
    variable: false,
    text: true,
    parse: parseMonthText,
    handler: (p) =>
      isUsable(p.month) && p.month >= 1 && p.month <= 12
        ? MONTH_ABBREV[p.month - 1]
        : null,
  },
  MM: {
    field: 'month',
    width: 2,
    variable: false,
    handler: (p) => pad(p.month, 2),
  },
  M: {
    field: 'month',
    width: 2,
    variable: true,
    handler: (p) => (isUsable(p.month) ? String(p.month) : null),
  },
  dd: {
    field: 'day',
    width: 2,
    variable: false,
    handler: (p) => pad(p.day, 2),
  },
  d: {
    field: 'day',
    width: 2,
    variable: true,
    handler: (p) => (isUsable(p.day) ? String(p.day) : null),
  },
  HH: {
    field: 'hour',
    width: 2,
    variable: false,
    handler: (p) => pad(p.hour, 2),
  },
  H: {
    field: 'hour',
    width: 2,
    variable: true,
    handler: (p) => (isUsable(p.hour) ? String(p.hour) : null),
  },
  mm: {
    field: 'minute',
    width: 2,
    variable: false,
    handler: (p) => pad(p.minute, 2),
  },
  m: {
    field: 'minute',
    width: 2,
    variable: true,
    handler: (p) => (isUsable(p.minute) ? String(p.minute) : null),
  },
  ss: {
    field: 'second',
    width: 2,
    variable: false,
    handler: (p) => pad(p.second, 2),
  },
  s: {
    field: 'second',
    width: 2,
    variable: true,
    handler: (p) => (isUsable(p.second) ? String(p.second) : null),
  },
};

/**
 * Freezes each token's metadata as well as the table, so a consumer cannot widen
 * a token's declared width and silently corrupt parsing for every later call.
 */
export const TOKEN_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(REGISTRY_ENTRIES).map(([token, spec]) => [
      token,
      Object.freeze(spec),
    ]),
  ),
);

/**
 * Built-in token renderers, derived from {@link TOKEN_REGISTRY}.
 *
 * @type {Readonly<Record<string, (parts: object) => string|null>>}
 */
export const DEFAULT_HANDLERS = Object.freeze(
  nullProtoMap(
    Object.fromEntries(
      Object.entries(TOKEN_REGISTRY).map(([tok, def]) => [tok, def.handler]),
    ),
  ),
);

/**
 * Maps each token to the semantic field it populates.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TOKEN_FIELD_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries(TOKEN_REGISTRY).map(([tok, def]) => [tok, def.field]),
  ),
);

/**
 * Groups tokens by the field they populate, e.g. `month` holds `MMMM`, `MMM`,
 * `MM`, `M`. Precomputed once because it is consulted on every format call.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const FIELD_GROUPS = Object.freeze(
  Object.entries(TOKEN_REGISTRY).reduce((acc, [tok, def]) => {
    (acc[def.field] ||= []).push(tok);
    return acc;
  }, Object.create(null)),
);

/**
 * Ordered `field -> preferred tokens` used when normalizing raw input. Longer
 * tokens win so that a value captured as `MM` is preferred over `M`.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const FIELD_PREFERENCE = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_GROUPS).map(([field, toks]) => [
      field,
      Object.freeze([...toks].sort((a, b) => b.length - a.length)),
    ]),
  ),
);

/**
 * Every built-in token name.
 *
 * @type {readonly string[]}
 */
export const BUILTIN_TOKENS = Object.freeze(Object.keys(TOKEN_REGISTRY));

/**
 * Tokenizer bound to the built-in vocabulary.
 *
 * Held at module scope so the cache key is precomputed: the parser, the
 * validator and the renderer all tokenize with the same vocabulary on every
 * call, so hoisting this removes a sort and a join from each of them.
 *
 * @type {(format: string) => readonly import('./utils.js').Segment[]}
 */
export const tokenizeBuiltin = buildTokenizer(BUILTIN_TOKENS);
