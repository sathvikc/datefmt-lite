import { extractTokens } from './extractTokens.js';
import { normalizeFields } from './normalizeFields.js';
import { validateOutput } from './validateOutput.js';
import { buildTemplate } from './buildTemplate.js';
import { DEFAULT_HANDLERS } from './handlers.js';

export function formatDate(
  inputDate,
  inputFormat,
  outputFormat,
  {
    errorPolicy = 'throw',
    yearConverter,
    customTokens = {},
    overrideTokens = {},
    defaultTokens = {},
  } = {}
) {
  const { tokens: parsedTokens, ...raw } = extractTokens(
    inputDate,
    inputFormat,
    DEFAULT_HANDLERS,
    { errorPolicy }
  );

  if (
    errorPolicy === 'silent' &&
    parsedTokens.length > 0 &&
    parsedTokens.every((tok) => raw[tok] == null)
  ) {
    return inputDate;
  }

  const dateParts = normalizeFields(
    { tokens: parsedTokens, ...raw },
    { yearConverter, errorPolicy }
  );

  const overrides = validateOutput({
    parsedTokens,
    outputFormat,
    handlers: DEFAULT_HANDLERS,
    customTokens,
    defaultTokens,
    overrideTokens,
    errorPolicy,
  });

  if (errorPolicy === 'silent') {
    const tokenFieldMap = {
      yyyy: 'year',
      yy: 'year',
      MMMM: 'month',
      MMM: 'month',
      MM: 'month',
      M: 'month',
      dd: 'day',
      d: 'day',
      HH: 'hour',
      H: 'hour',
      mm: 'minute',
      m: 'minute',
      ss: 'second',
      s: 'second',
    };
    for (const tok of parsedTokens) {
      const field = tokenFieldMap[tok];
      if (field && dateParts[field] == null) {
        overrides[tok] = tok;
      }
    }
  }

  const finalHandlers = {
    ...DEFAULT_HANDLERS,
    ...customTokens,
    ...overrides,
  };

  const chunks = buildTemplate(outputFormat, finalHandlers);
  return chunks
    .map((chunk) => (typeof chunk === 'string' ? chunk : chunk(dateParts)))
    .join('');
}
