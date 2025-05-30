export function normalizeFields(
  { tokens, ...raw },
  { yearConverter, errorPolicy = 'throw' } = {}
) {
  const dateParts = {};
  const hasYYYY = raw.yyyy != null;
  const hasYY = raw.yy != null;

  if (hasYYYY) {
    dateParts.year = Number(raw.yyyy);
  } else if (hasYY) {
    const numeric = Number(raw.yy);
    if (typeof yearConverter === 'function') {
      dateParts.year = yearConverter(numeric);
    } else if (errorPolicy === 'silent') {
      // best-effort two-digit year
      dateParts.year = numeric;
    } else {
      throw new Error(
        'yearConverter is required when using two-digit year "yy" format'
      );
    }
  } else {
    dateParts.year = null;
  }

  dateParts.month =
    raw.MM != null ? Number(raw.MM) : raw.M != null ? Number(raw.M) : null;
  dateParts.day =
    raw.dd != null ? Number(raw.dd) : raw.d != null ? Number(raw.d) : null;
  dateParts.hour =
    raw.HH != null ? Number(raw.HH) : raw.H != null ? Number(raw.H) : null;
  dateParts.minute =
    raw.mm != null ? Number(raw.mm) : raw.m != null ? Number(raw.m) : null;
  dateParts.second =
    raw.ss != null ? Number(raw.ss) : raw.s != null ? Number(raw.s) : null;

  // Preserve parsed token order
  dateParts.tokens = Array.isArray(tokens) ? [...tokens] : [];

  return dateParts;
}
