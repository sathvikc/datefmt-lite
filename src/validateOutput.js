import {
  ERROR_CODES,
  DateFormatError,
  truncateToken,
  unproducibleToken,
} from './errors.js';
import {
  BUILTIN_TOKENS,
  DEFAULT_HANDLERS,
  FIELD_GROUPS,
  TOKEN_REGISTRY,
  tokenizeBuiltin,
} from './handlers.js';
import {
  collectTokens,
  hasOwn,
  nullProtoMap,
  tokenizeFormat,
} from './utils.js';

/**
 * Separator words that callers legitimately write literally in a format. Under
 * `strictTokens` these are exempt from unknown-token rejection so that ISO 8601
 * (`T`), week numbering (`W`) and am/pm (`a`) remain expressible.
 */
const STRUCTURAL = new Set(['T', 'Z', 'W', 'a', 't', 'z']);

/** The built-in vocabulary, reused when the caller declares no custom tokens. */
const BUILTIN_TOKEN_SET = new Set(BUILTIN_TOKENS);

/**
 * Resolves the precedence chain for a single output token.
 *
 * The documented order is `overrideTokens` > `customTokens` > parsed input >
 * `defaultTokens` > literal fallback. `overrideTokens` is checked first and
 * never overwritten, which is what the previous implementation got wrong: it
 * seeded defaults into the same map that already held the user's overrides and
 * clobbered them whenever the token had not been parsed.
 *
 * @param {string} token
 * @param {Set<string>} parsed
 * @param {Record<string, unknown>} sources
 * @returns {unknown|undefined} The winning value, or `undefined` to defer.
 */
function resolvePrecedence(token, parsed, sources, dateParts) {
  const { overrideTokens, defaultTokens, customTokens } = sources;

  // `hasOwn`, not truthiness: an explicit `undefined` override is still an
  // override and must not fall through to a lower-precedence source.
  if (hasOwn(overrideTokens, token)) {
    return { hit: true, value: overrideTokens[token] };
  }
  if (hasOwn(customTokens, token)) return { hit: false };

  const spec = hasOwn(TOKEN_REGISTRY, token) ? TOKEN_REGISTRY[token] : null;
  const fieldHasValue = spec ? dateParts?.[spec.field] != null : false;
  if (spec ? fieldHasValue : parsed.has(token)) return { hit: false };

  if (hasOwn(defaultTokens, token)) {
    return { hit: true, value: defaultTokens[token] };
  }
  return { hit: false };
}

/**
 * Works out how every token in an output format will be rendered.
 *
 * Returns the token table the renderer should use: built-in handlers, user
 * customisations, and literal fallbacks for anything that cannot be produced.
 *
 * @param {object} args
 * @param {string[]} args.parsedTokens Tokens successfully read from the input.
 * @param {Record<string, number|null>} args.dateParts Normalized fields, used
 *   to tell "token present" apart from "token present but its field is null".
 * @param {string} args.outputFormat
 * @param {{ overrideTokens?: object, defaultTokens?: object, customTokens?: object }} [args.overrides]
 * @param {'throw'|'silent'} [args.errorPolicy='throw']
 * @param {boolean} [args.strictTokens=false] Treat unrecognised alphabetic runs
 *   in the output format as errors instead of literal text.
 * @returns {Record<string, unknown>} Handler table for the renderer.
 *
 * @example
 * validateOutput({ parsedTokens: ['yyyy','MM'], outputFormat: 'dd/MM/yyyy', dateParts });
 * // → { dd: 'dd' } in silent mode, or throws in strict mode
 */
export function validateOutput({
  parsedTokens,
  dateParts,
  outputFormat,
  overrides = {},
  errorPolicy = 'throw',
  strictTokens = false,
}) {
  if (typeof outputFormat !== 'string') {
    throw new DateFormatError(
      `outputFormat must be a string, received ${typeof outputFormat}`,
      ERROR_CODES.INVALID_ARGUMENT,
    );
  }

  const overrideTokens = overrides.overrideTokens ?? nullProtoMap();
  const defaultTokens = overrides.defaultTokens ?? nullProtoMap();
  const customTokens = overrides.customTokens ?? nullProtoMap();

  const declared = [
    ...Object.keys(overrideTokens),
    ...Object.keys(defaultTokens),
    ...Object.keys(customTokens),
  ];

  // The common case is no custom tokens at all, so the built-in vocabulary is
  // reused directly. Rebuilding that set, and the cache key it implies, was the
  // largest single cost in the whole pipeline.
  const known =
    declared.length === 0
      ? BUILTIN_TOKEN_SET
      : new Set([...Object.keys(TOKEN_REGISTRY), ...declared]);

  const needed =
    declared.length === 0
      ? collectTokens(tokenizeBuiltin(outputFormat))
      : collectTokens(tokenizeFormat(outputFormat, known));

  const parsed = new Set(parsedTokens);

  // With no custom tokens and nothing to override or default, the shared
  // built-in table is already the answer. Returning it avoids copying 14
  // handlers per call and lets the render plan cache hit.
  // The shared built-in table is reused while it needs no changes at all. Any
  // token that must fall back, and any custom handler, forces a private copy,
  // because the shared table is frozen.
  let table =
    declared.length === 0 ? DEFAULT_HANDLERS : nullProtoMap(DEFAULT_HANDLERS);

  const writable = () => {
    if (table === DEFAULT_HANDLERS) table = nullProtoMap(DEFAULT_HANDLERS);
    return table;
  };

  for (const [token, handler] of Object.entries(customTokens)) {
    writable()[token] = handler;
  }

  // Under strictTokens an unrecognised word is a probable typo rather than
  // literal text, so alphabetic runs outside brackets are rejected outright.
  // The check runs against the raw format so that the separator characters
  // callers are expected to write literally (`T`, `/`, `-`, space) are exempt.
  if (strictTokens) {
    const bracketRanges = [];
    const stripped = outputFormat.replace(/\[[^\]]*\]/g, (match) => {
      bracketRanges.push([match.index, match.index + match.length]);
      return ' '.repeat(match.length);
    });

    for (const match of stripped.matchAll(/[a-zA-Z]+/g)) {
      const word = match[0];
      if (known.has(word) || STRUCTURAL.has(word)) continue;

      const insideBracket = bracketRanges.some(
        ([start, end]) => match.index >= start && match.index < end,
      );
      if (insideBracket) continue;

      throw new DateFormatError(
        `Unknown token "${truncateToken(word)}" in output format`,
        ERROR_CODES.UNPRODUCIBLE_TOKEN,
        { token: word },
      );
    }
  }

  for (const token of needed) {
    const resolved = resolvePrecedence(
      token,
      parsed,
      { overrideTokens, defaultTokens, customTokens },
      dateParts,
    );
    if (resolved.hit) {
      writable()[token] = resolved.value;
      continue;
    }

    // A token is derivable when the field it populates has a value. Custom
    // tokens are not in the registry, so they are always considered derivable
    // and their handler decides what to emit.
    const spec = hasOwn(TOKEN_REGISTRY, token) ? TOKEN_REGISTRY[token] : null;

    // A token the user redefined via customTokens is theirs to resolve, so it is
    // always renderable. Without this, a custom token shadowing a built-in would
    // inherit that built-in's requirement and be rejected when its own handler
    // could have produced the value.
    if (spec && hasOwn(customTokens, token)) continue;

    if (spec ? dateParts?.[spec.field] != null : true) continue;

    if (errorPolicy === 'throw') {
      throw unproducibleToken(
        token,
        'no parsed value, default or override supplies it',
      );
    }

    writable()[token] = token;
  }

  // Apply defaults last, but only where nothing of higher precedence already
  // supplied a value. Both checks are per-field rather than per-token, so a
  // month parsed as `M` still counts as parsed when `MM` has a default.
  for (const token of Object.keys(defaultTokens)) {
    if (hasOwn(overrideTokens, token)) continue;
    if (hasOwn(customTokens, token)) continue;

    const spec = hasOwn(TOKEN_REGISTRY, token) ? TOKEN_REGISTRY[token] : null;
    if (spec && dateParts?.[spec.field] != null) continue;
    if (!spec && parsed.has(token)) continue;

    writable()[token] = defaultTokens[token];
  }

  return table;
}

export { FIELD_GROUPS };
