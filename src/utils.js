/**
 * Shared format-parsing primitives.
 *
 * Both the input parser and the output renderer tokenize formats through
 * {@link tokenizeFormat}, so validation and rendering can never disagree about
 * what counts as a token. That agreement is what makes compact formats such as
 * `yyyyMMdd` and literal text such as `Date:` work.
 */

const RESERVED_CHARS = /[-/\\^$*+?.()|[\]{}]/g;

/** Matches a run of characters that could plausibly be a token name. */
const TOKEN_SHAPE = /^[A-Za-z]+$/;

const emptyMatcher = () => {
  const never = /(?!)()/y;
  never.lastIndex = 0;
  return never;
};

/**
 * Escapes a literal string for safe inclusion in a regular expression.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return String(str).replace(RESERVED_CHARS, '\\$&');
}

/**
 * Builds the alternation body for a token matcher, longest token first so that
 * `yyyy` wins over `yy` and `MMMM` over `MMM`.
 *
 * @param {Iterable<string>} tokens
 * @returns {string} Pattern body, or the empty string when there are no tokens.
 */
export function buildTokenPattern(tokens) {
  const unique = [...new Set(tokens)].filter((t) => typeof t === 'string' && t);
  if (!unique.length) return '';
  return unique
    .slice()
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(escapeRegex)
    .join('|');
}

/**
 * Compiles a sticky matcher for a token set.
 *
 * Sticky (`y`) matching anchors at `lastIndex`, which lets {@link tokenizeFormat}
 * walk a format string in a single left-to-right pass instead of repeatedly
 * scanning ahead for the next match.
 *
 * @param {Iterable<string>} tokens
 * @returns {RegExp} Sticky matcher, or a never-matching regex when empty.
 */
export function buildTokenMatcher(tokens) {
  const pattern = buildTokenPattern(tokens);
  if (!pattern) return emptyMatcher();
  return new RegExp(pattern, 'y');
}

/**
 * @typedef {object} LiteralSegment
 * @property {'literal'} type
 * @property {string} value
 */
/**
 * @typedef {object} TokenSegment
 * @property {'token'} type
 * @property {string} value Token name exactly as declared.
 */
/**
 * @typedef {object} EscapedSegment
 * @property {'escaped'} type
 * @property {string} value Inner text of a `[...]` group, brackets removed.
 */
/** @typedef {LiteralSegment | TokenSegment | EscapedSegment} Segment */

/**
 * Splits a format string into literals, tokens and bracketed escapes.
 *
 * Anything that is not a known token becomes a literal, so alphabetic runs
 * (`Date`, `T`, `noon`) are emitted verbatim instead of being mistaken for
 * unknown tokens. Bracketed groups are emitted as `escaped` segments whose text
 * is rendered literally, with the brackets removed — the same convention used by
 * moment and `SimpleDateFormat`.
 *
 * @param {string} format
 * @param {Iterable<string>} tokens Known token names.
 * @returns {Segment[]}
 *
 * @example
 * tokenizeFormat('yyyyMMdd', ['yyyy', 'MM', 'dd']);
 * // → [token yyyy, token MM, token dd]
 * tokenizeFormat('Day dd [at] HH', ['dd', 'HH']);
 * // → [literal 'Day ', token dd, literal ' at ', token HH]
 * tokenizeFormat('yyyy[-]MM', ['yyyy', 'MM']);
 * // → [token yyyy, escaped '-', token MM]
 */
export function tokenizeFormat(format, tokens) {
  const matcher = buildTokenMatcher(tokens);
  const segments = [];
  let literalStart = 0;
  let i = 0;

  const flushLiteral = (end) => {
    if (end > literalStart) {
      segments.push({
        type: 'literal',
        value: format.slice(literalStart, end),
      });
    }
  };

  while (i < format.length) {
    if (format[i] === '[') {
      const close = format.indexOf(']', i + 1);
      if (close !== -1) {
        flushLiteral(i);
        segments.push({ type: 'escaped', value: format.slice(i + 1, close) });
        i = close + 1;
        literalStart = i;
        continue;
      }
    }

    matcher.lastIndex = i;
    const match = matcher.exec(format);
    if (match) {
      flushLiteral(i);
      segments.push({ type: 'token', value: match[0] });
      i += match[0].length;
      literalStart = i;
      continue;
    }

    i += 1;
  }

  flushLiteral(format.length);
  return segments;
}

/**
 * Collects the distinct token names referenced by an already-tokenized format.
 *
 * @param {Segment[]} segments
 * @returns {string[]}
 */
export function collectTokens(segments) {
  const seen = [];
  for (const seg of segments) {
    if (seg.type === 'token' && !seen.includes(seg.value)) seen.push(seg.value);
  }
  return seen;
}

/**
 * Reports whether a name is shaped like a token, so callers can distinguish a
 * plausible typo (`QQQ`) from ordinary literal text (`Date`).
 *
 * @param {string} name
 * @returns {boolean}
 */
export function looksLikeToken(name) {
  return TOKEN_SHAPE.test(name);
}

/**
 * Collects every contiguous alphabetic run in a string.
 *
 * @param {string} str
 * @returns {string[]}
 */
export function extractAllTokensFromFormat(str) {
  return [...new Set(str.match(/[a-zA-Z]+/g) || [])];
}

/**
 * Creates a prototype-less map, so lookups can never resolve to
 * `Object.prototype` members such as `toString` or `__proto__`.
 *
 * @param {Object} [source]
 * @returns {Object}
 */
export function nullProtoMap(source) {
  return Object.assign(Object.create(null), source);
}

/**
 * Own-property test that is immune to inherited members.
 *
 * @param {Object} object
 * @param {string} key
 * @returns {boolean}
 */
export function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}
