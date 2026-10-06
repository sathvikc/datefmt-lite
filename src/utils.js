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

const LETTER = /[a-zA-Z]/;
const ALPHA_RUN = /^[a-zA-Z]+/;

/**
 * Single characters that may stand between two tokens inside one alphabetic
 * run. ISO 8601 writes `ddTHH:mm:ss`, where `T` separates tokens but is not a
 * token itself. Recognising these keeps literal separator letters literal while
 * letting the tokens on either side still be found.
 */
const STRUCTURAL_SEPARATORS = new Set(['T', 'Z', 'W', 't', 'z', 'a']);

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
 * Builds a reusable tokenizer bound to one token vocabulary.
 *
 * Callers that tokenize repeatedly with the same vocabulary — which is every
 * pipeline call site, since the built-in tokens dominate — should hold on to the
 * returned function. Building the cache key is then a plain concatenation
 * instead of sorting and joining the vocabulary on every call, which measured as
 * the single largest cost before this was hoisted.
 *
 * @param {Iterable<string>} tokens
 * @returns {(format: string) => readonly Segment[]}
 *
 * @example
 * const tokenize = buildTokenizer(BUILTIN_TOKENS);
 * tokenize('yyyyMMdd'); // → [token yyyy, token MM, token dd]
 */
export function buildTokenizer(tokens) {
  const tokenSet = new Set(
    [...tokens].filter((name) => typeof name === 'string' && name),
  );

  // Length-prefixed so no two distinct (format, vocabulary) pairs can produce
  // the same key. A plain `format + separator + names` is ambiguous: a token
  // name may contain the separator, letting one call evict another's entry.
  const suffix = `\u0000${tokenSet.size}\u0000${[...tokenSet].sort().join('\u0000')}`;

  return (format) => {
    const key = `${format.length}\u0000${format}${suffix}`;

    const cached = tokenizeCache.get(key);
    if (cached !== undefined) return cached;

    const segments = tokenizeUncached(format, tokenSet);

    // Bounded because a caller may derive formats from data rather than config.
    // An unbounded cache would then retain every distinct string ever seen.
    if (tokenizeCache.size >= TOKENIZE_CACHE_LIMIT) {
      tokenizeCache.delete(tokenizeCache.keys().next().value);
    }
    // Each segment is frozen too: a shallow freeze would leave `value` writable,
    // letting one caller poison the cached result for every later caller.
    tokenizeCache.set(
      key,
      Object.freeze(segments.map((segment) => Object.freeze(segment))),
    );

    return tokenizeCache.get(key);
  };
}

/**
 * Compiles a sticky matcher for a token set.
 *
 * Sticky (`y`) matching anchors at `lastIndex`, which lets a caller walk a
 * format string in a single left-to-right pass instead of repeatedly scanning
 * ahead for the next match. {@link tokenizeFormat} no longer needs it, but it is
 * exported for callers tokenizing with their own scanning logic.
 *
 * @param {Iterable<string>} tokens
 * @returns {RegExp} Sticky matcher, or a never-matching regex when empty.
 */
export function buildTokenMatcher(tokens) {
  const pattern = buildTokenPattern(tokens);
  if (!pattern) return /(?!)()/y;
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
 * A token may be followed immediately by another token, which is what makes
 * `yyyyMMdd` and the ISO `ddTHH:mm:ss` work, but it may not sit inside a longer
 * word, so `day` stays literal rather than becoming `d` followed by `ay`. That
 * decision is made per alphabetic run: a run is tokenized only when it
 * decomposes entirely into known tokens, allowing at most one structural
 * separator between them.
 *
 * Results are memoized. Tokenizing is pure and pipeline callers reuse the same
 * format strings for every row, so the same work would otherwise repeat on each
 * call.
 *
 * @param {string} format
 * @param {Iterable<string>} tokens Known token names.
 * @returns {readonly Segment[]}
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
  const key = tokenizerKey(tokens);

  let tokenizer = tokenizerCache.get(key);
  if (tokenizer === undefined) {
    tokenizer = buildTokenizer(tokens);
    tokenizerCache.set(key, tokenizer);
  }

  return tokenizer(format);
}

/**
 * Builds a cache key identifying a token vocabulary by its sorted names.
 *
 * @param {Iterable<string>} tokens
 * @returns {string}
 */
function tokenizerKey(tokens) {
  // Derived from the contents, never from the collection's identity: a caller
  // that mutates an array between calls must not get a stale cached result.
  return [...new Set(tokens)]
    .filter((name) => typeof name === 'string' && name)
    .sort()
    .join(',');
}

/** Tokenizers retained per vocabulary, so the key is not rebuilt per call. */
const tokenizerCache = new Map();

/**
 * Tokenize without consulting the cache.
 *
 * @param {string} format
 * @param {Set<string>} tokenSet
 * @returns {Segment[]}
 */
function tokenizeUncached(format, tokenSet) {
  let maxLength = 0;
  for (const name of tokenSet) {
    if (name.length > maxLength) maxLength = name.length;
  }

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

    if (!LETTER.test(format[i])) {
      i += 1;
      continue;
    }

    const end = ALPHA_RUN.exec(format.slice(i))[0].length + i;
    const run = format.slice(i, end);

    if (decomposes(run, tokenSet, maxLength)) {
      const hit = longestPrefix(run, tokenSet, maxLength);
      if (hit) {
        flushLiteral(i);
        segments.push({ type: 'token', value: hit });
        i += hit.length;
        literalStart = i;
        continue;
      }

      // The run is made of tokens but opens with a structural separator, as in
      // the ISO `T` between `dd` and `HH`. Leave it to the surrounding literal.
      i += 1;
      continue;
    }

    // Not tokenizable: the whole run is literal text.
    i = end;
  }

  flushLiteral(format.length);
  return segments;
}

/**
 * Memoized tokenizer results, keyed by format plus the token vocabulary in use.
 */
const TOKENIZE_CACHE_LIMIT = 256;
const tokenizeCache = new Map();

/**
 * Reports whether an alphabetic run can be split into known tokens.
 *
 * A run qualifies only if every character belongs to a token, except for at
 * most one structural separator. That admits `yyyyMMdd` and `ddTHH`, where `T`
 * separates two tokens, while rejecting `day`, which is a single word.
 *
 * @param {string} run
 * @param {Set<string>} tokenSet
 * @param {number} maxLength
 * @returns {boolean}
 */
function decomposes(run, tokenSet, maxLength) {
  let rest = run;
  let separatorsLeft = 1;

  while (rest) {
    const matched = longestPrefix(rest, tokenSet, maxLength);
    if (matched) {
      rest = rest.slice(matched.length);
      continue;
    }

    // A single structural separator may stand between two tokens, which is what
    // ISO 8601 relies on. Both sides must be real tokens.
    if (
      separatorsLeft > 0 &&
      rest.length > 1 &&
      STRUCTURAL_SEPARATORS.has(rest[0]) &&
      longestPrefix(rest.slice(1), tokenSet, maxLength)
    ) {
      separatorsLeft -= 1;
      rest = rest.slice(1);
      continue;
    }

    return false;
  }

  return true;
}

/**
 * The longest known token that prefixes a run.
 *
 * Bounded by the longest token name, so a long literal word costs a handful of
 * comparisons rather than one per character.
 *
 * @param {string} run
 * @param {Set<string>} tokenSet
 * @param {number} maxLength
 * @returns {string|null}
 */
function longestPrefix(run, tokenSet, maxLength) {
  const limit = Math.min(run.length, maxLength);
  for (let end = limit; end > 0; end -= 1) {
    const candidate = run.slice(0, end);
    if (tokenSet.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Collects the distinct token names referenced by an already-tokenized format.
 *
 * @param {readonly Segment[]} segments
 * @returns {string[]}
 */
export function collectTokens(segments) {
  const seen = [];
  for (const segment of segments) {
    if (segment.type === 'token' && !seen.includes(segment.value)) {
      seen.push(segment.value);
    }
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
