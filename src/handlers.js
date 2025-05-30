/**
 * Month names used by `MMMM` and `MMM` tokens.
 * Indexing is 1-based (`month = 1` maps to 'January').
 *
 * @constant {string[]}
 */
export const MONTH_NAMES = [
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
];

export const TOKEN_REGISTRY = {
  yyyy: {
    field: 'year',
    handler: (p) => String(p.year).padStart(4, '0'),
  },
  yy: {
    field: 'year',
    handler: (p) => String(p.year).slice(-2),
  },
  MMMM: {
    field: 'month',
    handler: (p) => MONTH_NAMES[p.month - 1],
  },
  MMM: {
    field: 'month',
    handler: (p) => MONTH_NAMES[p.month - 1].slice(0, 3),
  },
  MM: {
    field: 'month',
    handler: (p) => String(p.month).padStart(2, '0'),
  },
  M: {
    field: 'month',
    handler: (p) => String(p.month),
  },
  dd: {
    field: 'day',
    handler: (p) => String(p.day).padStart(2, '0'),
  },
  d: {
    field: 'day',
    handler: (p) => String(p.day),
  },
  HH: {
    field: 'hour',
    handler: (p) => String(p.hour).padStart(2, '0'),
  },
  H: {
    field: 'hour',
    handler: (p) => String(p.hour),
  },
  mm: {
    field: 'minute',
    handler: (p) => String(p.minute).padStart(2, '0'),
  },
  m: {
    field: 'minute',
    handler: (p) => String(p.minute),
  },
  ss: {
    field: 'second',
    handler: (p) => String(p.second).padStart(2, '0'),
  },
  s: {
    field: 'second',
    handler: (p) => String(p.second),
  },
};

/**
 * Built-in token renderers for `buildTemplate()`.
 * Each token maps to a function that receives a `dateParts` object and returns a string.
 * These functions assume valid numeric fields; no internal validation is performed.
 *
 * @type {Object<string, (dateParts: Object) => string>}
 *
 * @example
 * // Given: { year: 2025, month: 4, day: 9, hour: 7, minute: 5, second: 3 }
 * // Token "dd" → "09"
 * // Token "MMM" → "Apr"
 * // Token "yyyy" → "2025"
 */
export const DEFAULT_HANDLERS = Object.fromEntries(
  Object.entries(TOKEN_REGISTRY).map(([tok, def]) => [tok, def.handler])
);

export const TOKEN_FIELD_MAP = Object.fromEntries(
  Object.entries(TOKEN_REGISTRY).map(([tok, def]) => [tok, def.field])
);
