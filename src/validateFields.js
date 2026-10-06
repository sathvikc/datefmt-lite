/**
 * Optional semantic range checking.
 *
 * Disabled by default because the library's contract is "rearrange strings, make
 * no assumptions". Callers that need data-quality guarantees opt in, because for
 * a pipeline a silently wrong date is far more expensive than a thrown one.
 */

/** Legal inclusive bounds for each numeric field. */
const BOUNDS = Object.freeze({
  month: [1, 12],
  day: [1, 31],
  hour: [0, 23],
  minute: [0, 59],
  second: [0, 59],
});

/**
 * Days per month for a non-leap year.
 */
const DAYS_IN_MONTH = Object.freeze([
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
]);

/**
 * @param {number} year
 * @returns {boolean}
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Maximum day for a given year and month, or `null` when the month itself is
 * impossible.
 *
 * February is resolved to 29 days when the year is unknown, because a missing
 * year must not reject a date that could legitimately be a leap year.
 *
 * @param {number|null} year
 * @param {number} month
 * @returns {number|null}
 */
function maxDay(year, month) {
  if (month < 1 || month > 12) return null;
  if (month === 2) {
    if (year == null) return 29;
    return isLeapYear(year) ? 29 : 28;
  }
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Checks parsed fields against their legal ranges.
 *
 * @param {object} dateParts
 * @param {'lenient'|'strict'} mode
 * @returns {{message: string, field: string, fatal: boolean, clamped?: object}|null}
 *   `null` when everything is in range. `fatal` distinguishes an impossible
 *   value (February 31st) from one that can simply be clamped (hour 99).
 */
export function validateFields(dateParts, mode) {
  if (mode !== 'lenient' && mode !== 'strict') {
    throw new TypeError(`validate must be 'off', 'lenient' or 'strict'`);
  }

  const clamped = {};

  for (const [field, [min, max]] of Object.entries(BOUNDS)) {
    const value = dateParts[field];
    if (value == null) continue;

    // Only integers are clampable. A fractional value cannot be nudged into
    // range without rounding, which would silently invent data, so it is
    // reported rather than adjusted.
    if (!Number.isInteger(value)) {
      return {
        message: `${field} ${value} is not an integer`,
        field,
        fatal: mode === 'strict',
        clamped: null,
      };
    }

    const limit =
      field === 'day' ? (maxDay(dateParts.year, dateParts.month) ?? max) : max;
    if (value >= min && value <= limit) continue;

    const message = `${field} ${value} is out of range (expected ${min}-${limit})`;

    if (mode === 'strict')
      return { message, field, fatal: true, clamped: null };

    clamped[field] = Math.min(Math.max(value, min), limit);
  }

  return Object.keys(clamped).length
    ? { message: 'clamped', field: '', fatal: false, clamped }
    : null;
}

/**
 * Reports whether a year/month/day triple is a real calendar date.
 *
 * @param {{year?: number|null, month?: number|null, day?: number|null}} dateParts
 * @returns {boolean}
 */
export function isRealDate(dateParts) {
  const { year, month, day } = dateParts;
  if (year == null || month == null || day == null) return true;
  const limit = maxDay(year, month);
  return limit !== null && day >= 1 && day <= limit;
}
