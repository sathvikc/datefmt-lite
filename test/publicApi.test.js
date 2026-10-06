import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import * as publicApi from '../src/index.js';

const root = resolve(process.cwd());
const types = readFileSync(join(root, 'types/index.d.ts'), 'utf8');

const FUNCTION_EXPORTS = [
  'buildTemplate',
  'buildTokenMatcher',
  'buildTokenPattern',
  'collectTokens',
  'escapeRegex',
  'extractAllTokensFromFormat',
  'extractTokens',
  'formatDate',
  'hasField',
  'isRealDate',
  'looksLikeToken',
  'normalizeFields',
  'parseMonthName',
  'renderTemplate',
  'tokenizeFormat',
  'validateFields',
  'validateOutput',
];

const VALUE_EXPORTS = [
  'BUILTIN_TOKENS',
  'DEFAULT_HANDLERS',
  'ERROR_CODES',
  'FIELD_GROUPS',
  'MONTH_ABBREV',
  'MONTH_NAMES',
  'TOKEN_FIELD_MAP',
  'TOKEN_REGISTRY',
];

const CLASS_EXPORTS = ['DateFormatError'];

describe('runtime public API', () => {
  it('exports exactly the documented surface', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      [...FUNCTION_EXPORTS, ...VALUE_EXPORTS, ...CLASS_EXPORTS].sort(),
    );
  });

  it('exports every function as a function', () => {
    for (const name of FUNCTION_EXPORTS) {
      expect(typeof publicApi[name]).toBe('function');
    }
  });

  it('exports every constant as a defined object', () => {
    for (const name of VALUE_EXPORTS) {
      expect(publicApi[name]).toBeDefined();
      expect(typeof publicApi[name]).toBe('object');
    }
  });

  it('exports DateFormatError as a constructor', () => {
    expect(typeof publicApi.DateFormatError).toBe('function');
    expect(
      new publicApi.DateFormatError('x', 'INVALID_ARGUMENT'),
    ).toBeInstanceOf(Error);
  });
});

describe('types/index.d.ts', () => {
  const declared = () => {
    const functions = [...types.matchAll(/export\s+function\s+(\w+)/g)].map(
      (m) => m[1],
    );
    const consts = [
      ...types.matchAll(/export\s+(?:declare\s+)?const\s+(\w+)/g),
    ].map((m) => m[1]);
    const classes = [...types.matchAll(/export\s+class\s+(\w+)/g)].map(
      (m) => m[1],
    );
    return { functions, consts, classes };
  };

  it('declares no function that the runtime does not export', () => {
    const runtime = new Set(Object.keys(publicApi));
    expect(declared().functions.filter((n) => !runtime.has(n))).toEqual([]);
  });

  it('declares no const that the runtime does not export', () => {
    const runtime = new Set(Object.keys(publicApi));
    expect(declared().consts.filter((n) => !runtime.has(n))).toEqual([]);
  });

  it('declares no class that the runtime does not export', () => {
    const runtime = new Set(Object.keys(publicApi));
    expect(declared().classes.filter((n) => !runtime.has(n))).toEqual([]);
  });

  it('covers every runtime export', () => {
    const d = declared();
    const covered = new Set([...d.functions, ...d.consts, ...d.classes]);
    const missing = Object.keys(publicApi).filter((n) => !covered.has(n));
    expect(missing).toEqual([]);
  });

  it('declares formatDate with the four-argument signature', () => {
    expect(types).toMatch(
      /export function formatDate\(\s*inputDate: string,\s*inputFormat: string,\s*outputFormat: string,\s*options\?: FormatOptions,?\s*\): string;/,
    );
  });

  it('defines the errorPolicy and validate unions behind named aliases', () => {
    expect(types).toMatch(/export type ErrorPolicy = 'throw' \| 'silent';/);
    expect(types).toMatch(
      /export type ValidationMode = 'off' \| 'lenient' \| 'strict';/,
    );
  });

  it('documents that handlers may return null', () => {
    expect(types).toMatch(
      /export type TokenHandler = \(parts: DateParts\) => string \| null;/,
    );
  });

  it('declares DateFormatError as a class with a code', () => {
    expect(types).toMatch(/export class DateFormatError extends Error/);
    expect(types).toMatch(/code: ErrorCode;/);
  });

  it('declares every error code it can throw', () => {
    for (const code of [
      'INVALID_ARGUMENT',
      'INVALID_OPTION',
      'INPUT_MISMATCH',
      'UNPRODUCIBLE_TOKEN',
      'OUT_OF_RANGE',
      'INVALID_YEAR',
    ]) {
      expect(types).toContain(`'${code}'`);
    }
  });
});

describe('bundled entrypoints', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  it('resolves main, module and types on disk after a build', () => {
    // The full dist check lives in scripts/verify-dist.mjs; here we only assert
    // the manifest is internally consistent.
    expect(pkg.main.endsWith('.cjs')).toBe(true);
    expect(pkg.exports['.'].require).toBe(`./${pkg.main.replace(/^\.\//, '')}`);
    expect(pkg.exports['.'].import).toBe(
      `./${pkg.module.replace(/^\.\//, '')}`,
    );
    expect(pkg.exports['.'].types).toBe(`./${pkg.types.replace(/^\.\//, '')}`);
  });

  it('publishes the docs the README links to', () => {
    expect(pkg.files).toEqual(
      expect.arrayContaining(['docs', 'types', 'dist']),
    );
  });
});
