import { TOKEN_REGISTRY } from './handlers.js';

/**
 * Input-format detection.
 *
 * The goal is that `formatDate('20250425', null, 'dd/MM/yyyy')` just works,
 * because nobody should have to learn a token vocabulary to reformat a column.
 *
 * Detection is ambiguous by nature — `04/25/2025` is a valid `dd/MM/yyyy` and a
 * valid `MM/dd/yyyy` — so candidates are not matched by shape alone. Each one is
 * *parsed* and then checked against what the output format actually needs. That
 * resolves the common cases without a scoring heuristic: if the output wants a
 * day greater than 12, only one ordering can supply it.
 */

/**
 * Candidate input formats, in preference order.
 *
 * @type {ReadonlyArray<[string, RegExp]>}
 */
export const CANDIDATES = [
  ['yyyy-MM-dd[T]HH:mm:ss', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/],
  ['yyyyMMddHHmmss', /^\d{14}$/],
  ['yyyyMMddHHmm', /^\d{12}$/],
  ['yyyyMMdd', /^\d{8}$/],
  ['yyyy-MM-dd', /^\d{4}-\d{2}-\d{2}$/],
  ['yyyy-M-d', /^\d{4}-\d{1,2}-\d{1,2}$/],
  ['MMM dd, yyyy', /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/],
  ['MMM d, yyyy', /^[A-Za-z]{3,9}\s+\d{1,2}\s+\d{4}$/],
  ['dd-MMM-yyyy', /^\d{1,2}-[A-Za-z]{3,9}-\d{4}$/],
  ['d-MMM-yyyy', /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/],
  ['MMM dd yyyy', /^[A-Za-z]{3,9}\s+\d{1,2}\s+\d{4}$/],
  ['dd MMM yyyy', /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/],
  ['yyyyMM', /^\d{6}$/],
  ['yyMMdd', /^\d{6}$/],
  ['dd/MM/yyyy', /^\d{1,2}\/\d{1,2}\/\d{4}$/],
  ['MM/dd/yyyy', /^\d{1,2}\/\d{1,2}\/\d{4}$/],
  ['yyyy/MM/dd', /^\d{4}\/\d{1,2}\/\d{1,2}$/],
  ['dd-MM-yyyy', /^\d{1,2}-\d{1,2}-\d{4}$/],
  ['MM-dd-yyyy', /^\d{1,2}-\d{1,2}-\d{4}$/],
  ['yyyy-MM-dd', /^\d{4}-\d{1,2}-\d{1,2}$/],
  ['dd.MM.yyyy', /^\d{1,2}\.\d{1,2}\.\d{4}$/],
  ['MM.dd.yyyy', /^\d{1,2}\.\d{1,2}\.\d{4}$/],
  ['dd/MM/yy', /^\d{1,2}\/\d{1,2}\/\d{2}$/],
  ['MM/dd/yy', /^\d{1,2}\/\d{1,2}\/\d{2}$/],
  ['yyyy_MM_dd', /^\d{4}_\d{1,2}_\d{1,2}$/],
  ['yyyyMMddTHHmmss', /^\d{8}T\d{6}$/],
  ['yyyy', /^\d{4}$/],
  ['yy', /^\d{2}$/],
];

/**
 * Fields the output format will actually consume, so detection only has to
 * supply those. A wider match is not better if the result is discarded.
 *
 * @param {string} outputFormat
 * @returns {Set<string> | null} `null` when the output uses only literal text.
 */
export function requiredFields(outputFormat) {
  const text = outputFormat.replace(/\[[^\]]*\]/g, '');
  const fields = new Set();

  // A textual month is present, so the input probably carries one too. Checked
  // first: the character-class test below would otherwise read a bare `yyyy` as
  // needing a month, because the token names are letters.
  if (/M{3,4}/.test(text)) fields.add('month');

  // Longest names first so `MMM` is not read as `MM` plus `M`.
  const names = Object.keys(TOKEN_REGISTRY).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const spec = TOKEN_REGISTRY[name];
    if (spec.text) continue;
    if (new RegExp(`(?<![a-zA-Z])${name}(?![a-zA-Z])`).test(text)) {
      fields.add(spec.field);
    }
  }

  return fields;
}

/**
 * Whether parsed raw token values satisfy everything the output needs.
 *
 * Values arrive keyed by token name (`MM`, `dd`), so they are mapped onto their
 * fields first. This is what resolves the genuinely ambiguous cases: a first
 * component above 12 cannot be a month, so `25/04/2025` can only be `dd/MM/yyyy`.
 *
 * @param {Record<string, string|null>} values Raw values keyed by token name.
 * @param {Set<string> | null} required
 * @returns {boolean}
 */
export function satisfies(values, required) {
  if (!required || required.size === 0) return true;

  for (const field of required) {
    let value = null;
    for (const [token, spec] of Object.entries(TOKEN_REGISTRY)) {
      if (spec.field !== field) continue;
      const raw = values[token];
      if (raw == null || raw === '') continue;
      const num = Number(raw);
      if (Number.isFinite(num)) {
        value = num;
        break;
      }
    }

    if (value == null) return false;
    if (field === 'month' && (value < 1 || value > 12)) return false;
    if (field === 'day' && (value < 1 || value > 31)) return false;
    if (field === 'hour' && value > 23) return false;
    if (field === 'year' && value < 1000) return false;
  }

  return true;
}

