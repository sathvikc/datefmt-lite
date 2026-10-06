import { DEFAULT_HANDLERS, tokenizeBuiltin } from './handlers.js';
import { hasOwn, tokenizeFormat } from './utils.js';

/**
 * Render plans already compiled, keyed by output format.
 *
 * The plan depends only on the format and the token vocabulary, so a pipeline
 * reformatting one column compiles once. Bounded for the same reason as the
 * tokenizer cache: formats derived from data must not accumulate.
 */
const PLAN_CACHE_LIMIT = 256;
const planCache = new Map();

/**
 * Compiles an output format into an executable render plan.
 *
 * Each step is either literal text to copy verbatim or a token to resolve at
 * render time. Compiling once and reusing the plan is what makes the library's
 * "pre-compiled template" claim true; the plan is also a stable cache key.
 *
 * @param {string} outputFormat
 * @param {Record<string, unknown>} handlers Token table.
 * @returns {ReadonlyArray<{type: 'text', value: string} | {type: 'token', value: string}>}
 *   `escaped` segments are folded into `text`, since bracketed groups render
 *   literally with their brackets removed.
 *
 * @example
 * buildTemplate('dd/MM/yyyy', { dd: (p) => '25', MM: (p) => '04', yyyy: (p) => '2025' });
 * // → [token dd, text '/', token MM, text '/', token yyyy]
 */
export function buildTemplate(outputFormat, handlers) {
  if (typeof outputFormat !== 'string') {
    throw new TypeError(
      `outputFormat must be a string, received ${typeof outputFormat}`,
    );
  }

  const table = handlers ?? DEFAULT_HANDLERS;

  // The built-in vocabulary is by far the common case, and its tokenizer is
  // hoisted, so the plan is cached under a bare format key.
  const isBuiltin = table === DEFAULT_HANDLERS;
  const key = isBuiltin
    ? outputFormat
    : `${outputFormat} ${Object.keys(table).sort().join(',')}`;

  const cached = planCache.get(key);
  if (cached !== undefined) return cached;

  const segments = isBuiltin
    ? tokenizeBuiltin(outputFormat)
    : tokenizeFormat(
        outputFormat,
        Object.keys(table).filter((name) => typeof name === 'string' && name),
      );

  const steps = [];
  const pushText = (value) => {
    if (value === '') return;
    const last = steps[steps.length - 1];
    if (last && last.type === 'text') last.value += value;
    else steps.push({ type: 'text', value });
  };

  for (const segment of segments) {
    if (segment.type === 'token') {
      steps.push({ type: 'token', value: segment.value });
    } else {
      pushText(segment.value);
    }
  }

  if (planCache.size >= PLAN_CACHE_LIMIT) {
    planCache.delete(planCache.keys().next().value);
  }
  planCache.set(key, Object.freeze(steps));

  return planCache.get(key);
}

/**
 * Renders a compiled plan.
 *
 * A handler that yields `null`/`undefined` falls back to `overrides[token]` and
 * then to the bare token name, so a missing field degrades predictably instead
 * of leaking `"null"` into the output. `onMissing` decides whether that is
 * tolerated or an error.
 *
 * @param {ReadonlyArray<object>} plan
 * @param {Record<string, unknown>} handlers
 * @param {object} dateParts
 * @param {{ onMissing?: (token: string) => string }} [options]
 * @returns {string}
 */
export function renderTemplate(plan, handlers, dateParts, options = {}) {
  const { onMissing } = options;
  let out = '';

  for (const step of plan) {
    if (step.type === 'text') {
      out += step.value;
      continue;
    }

    const token = step.value;
    const handler = hasOwn(handlers, token) ? handlers[token] : undefined;

    let value;
    try {
      value = typeof handler === 'function' ? handler(dateParts) : handler;

      if (value == null) {
        throw new Error(`no value for token "${token}"`);
      }

      // Coercion lives inside the guarded block: an exotic object result can
      // have a `toString` that throws, which must not escape a best-effort run.
      out += typeof value === 'string' ? value : String(value);
    } catch (err) {
      // A custom handler that throws is still user code, but in a best-effort
      // render a single bad token must not abort the whole batch.
      if (!onMissing) {
        throw err instanceof TypeError ||
          err.message.includes('no value for token')
          ? new TypeError(
              `Token "${token}" produced no usable value: ${err.message}`,
            )
          : err;
      }
      out += onMissing(token);
    }
  }

  return out;
}
