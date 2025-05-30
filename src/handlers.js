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
export const DEFAULT_HANDLERS = {
  yyyy: (p) => String(p.year).padStart(4, '0'),
  yy: (p) => String(p.year).slice(-2),
  MMMM: (p) => MONTH_NAMES[p.month - 1],
  MMM: (p) => MONTH_NAMES[p.month - 1].slice(0, 3),
  MM: (p) => String(p.month).padStart(2, '0'),
  M: (p) => String(p.month),
  dd: (p) => String(p.day).padStart(2, '0'),
  d: (p) => String(p.day),
  HH: (p) => String(p.hour).padStart(2, '0'),
  H: (p) => String(p.hour),
  mm: (p) => String(p.minute).padStart(2, '0'),
  m: (p) => String(p.minute),
  ss: (p) => String(p.second).padStart(2, '0'),
  s: (p) => String(p.second),
};
