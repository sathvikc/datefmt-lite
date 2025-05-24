import { buildTokenRegex } from './utils.js';

/**
 * parseInput()
 * Parses inputDate according to inputFormat and handlers, returning numeric parts.
 * Throws on mismatched literals, non-numeric slices, too-short or extra input,
 * or missing year token.
 *
 * Returns: { year, month?, day?, hour?, minute?, second?, _tokens }
 */
export function parseInput(inputDate, inputFormat, handlers, yearConverter) {
  const tokenRE = buildTokenRegex(handlers);
  const formatParts = [];
  let lastIdx = 0;

  // Split format into literals and tokens
  for (const match of inputFormat.matchAll(tokenRE)) {
    const tok = match[0], idx = match.index;
    if (idx > lastIdx) formatParts.push(inputFormat.slice(lastIdx, idx));
    formatParts.push(tok);
    lastIdx = idx + tok.length;
  }
  if (lastIdx < inputFormat.length) formatParts.push(inputFormat.slice(lastIdx));

  // Consume inputDate
  let pos = 0;
  const parts = {};
  const seenTokens = [];

  for (const segment of formatParts) {
    if (handlers[segment]) {
      const len = segment.length;
      const raw = inputDate.slice(pos, pos + len);
      if (raw.length < len) {
        throw new Error(`Input too short for token "${segment}"`);
      }
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid numeric value for token "${segment}": "${raw}"`);
      }
      parts[segment] = num;
      seenTokens.push(segment);
      pos += len;
    } else {
      // Literal: must match exactly
      if (inputDate.slice(pos, pos + segment.length) !== segment) {
        throw new Error(`Expected literal "${segment}" at position ${pos}`);
      }
      pos += segment.length;
    }
  }

  if (pos !== inputDate.length) {
    throw new Error(`Extra characters in inputDate after position ${pos}: "${inputDate.slice(pos)}"`);
  }

  // Resolve year
  const hasYYYY = parts.yyyy != null;
  const hasYY   = parts.yy   != null;
  let year;
  if (hasYYYY) {
    year = parts.yyyy;
  } else if (hasYY) {
    if (typeof yearConverter !== 'function') {
      throw new Error('Two-digit year used but no yearConverter supplied');
    }
    year = yearConverter(parts.yy);
  } else {
    throw new Error('No "yyyy" or "yy" token found in inputFormat');
  }

  return {
    year,
    month:  parts.MM != null ? parts.MM : parts.M,
    day:    parts.dd != null ? parts.dd : parts.d,
    hour:   parts.HH != null ? parts.HH : parts.H,
    minute: parts.mm != null ? parts.mm : parts.m,
    second: parts.ss != null ? parts.ss : parts.s,
    _tokens: seenTokens,
  };
}