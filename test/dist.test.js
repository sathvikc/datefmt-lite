import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import * as publicApi from '../src/index.js';

const root = resolve(process.cwd());
const distBuilt = existsSync(join(root, 'dist/esm/index.esm.js'));

// `dist/` is a build artifact, so these checks run only after `npm run build`.
// The same assertions are enforced unconditionally by scripts/verify-dist.mjs,
// which the CI workflow runs on every push.
const describeDist = distBuilt ? describe : describe.skip;

describeDist('built esm bundle', () => {
  let dist;

  beforeAll(async () => {
    dist = await import(join(root, 'dist/esm/index.esm.js'));
  });

  it('exports exactly the same names as src/', () => {
    expect(Object.keys(dist).sort()).toEqual(Object.keys(publicApi).sort());
  });

  it('behaves identically to src/ on a basic conversion', () => {
    const args = ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'];
    expect(dist.formatDate(...args)).toBe(publicApi.formatDate(...args));
    expect(dist.formatDate(...args)).toBe('25/04/2025');
  });

  it('supports textual month parsing in the built bundle', () => {
    expect(dist.formatDate('25-Apr-2025', 'dd-MMM-yyyy', 'dd/MM/yyyy')).toBe(
      '25/04/2025',
    );
  });

  it('supports compact output formats in the built bundle', () => {
    expect(dist.formatDate('20250425', 'yyyyMMdd', 'yyyyMMdd')).toBe(
      '20250425',
    );
  });

  it('honours validate:strict in the built bundle', () => {
    expect(() =>
      dist.formatDate('20251345', 'yyyyMMdd', 'dd/MM/yyyy', {
        validate: 'strict',
      }),
    ).toThrow(/out of range/);
  });

  it('throws typed errors from the built bundle', () => {
    expect(() => dist.formatDate('2025', 'yyyy', 'MM')).toThrow(
      expect.objectContaining({ code: 'UNPRODUCIBLE_TOKEN' }),
    );
  });
});

describe('dist manifest integrity', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  it('keeps main and exports.require pointed at the same file', () => {
    const rel = (p) => String(p).replace(/^\.\//, '');
    expect(rel(pkg.exports['.'].require)).toBe(rel(pkg.main));
    expect(pkg.main.endsWith('.cjs')).toBe(true);
  });

  it('keeps the types condition pointed at the declarations', () => {
    const rel = (p) => String(p).replace(/^\.\//, '');
    expect(rel(pkg.exports['.'].types)).toBe(rel(pkg.types));
  });

  it('lists the types condition first so it wins resolution', () => {
    expect(Object.keys(pkg.exports['.'])[0]).toBe('types');
  });

  it('publishes the docs the README links to', () => {
    expect(pkg.files).toEqual(
      expect.arrayContaining(['docs', 'types', 'dist']),
    );
  });

  it('declares no side effects so tree-shaking stays safe', () => {
    expect(pkg.sideEffects).toBe(false);
  });

  it('does not expose internal source paths through exports', () => {
    const subpaths = Object.keys(pkg.exports).filter((k) => k !== '.');
    expect(subpaths).toEqual(['./package.json']);
  });

  it('does not depend on yarn', () => {
    const scripts = Object.values(pkg.scripts).join(' ');
    expect(scripts).not.toContain('yarn');
  });

  it('does not run a build on install', () => {
    expect(pkg.scripts.prepare).toBeUndefined();
    expect(pkg.scripts.prepack).toBe('npm run build');
  });
});

describe('exported state cannot be mutated', () => {
  const mutationAttempts = [
    ['MONTH_NAMES', 3, 'MUTATED'],
    ['MONTH_ABBREV', 3, 'XXX'],
    ['BUILTIN_TOKENS', 0, 'ZZZ'],
    ['TOKEN_FIELD_MAP', 'dd', 'nonsense'],
    ['FIELD_GROUPS', 'month', []],
    ['ERROR_CODES', 'INVALID_ARGUMENT', 'hacked'],
  ];

  it.each(mutationAttempts)('rejects mutating %s', (name, key, value) => {
    const target = publicApi[name];
    const before = JSON.stringify(
      Array.isArray(target) ? target : { ...target },
    );
    try {
      target[key] = value;
    } catch {
      // Frozen objects throw in strict mode, which is the expected outcome.
    }
    const after = JSON.stringify(
      Array.isArray(target) ? target : { ...target },
    );
    expect(after).toBe(before);
  });

  it('rejects adding a token to the registry', () => {
    expect(() => {
      publicApi.TOKEN_REGISTRY.ZZ = { field: 'year' };
    }).toThrow();
    expect(publicApi.TOKEN_REGISTRY.ZZ).toBeUndefined();
  });

  it('rejects replacing a built-in handler', () => {
    expect(() => {
      publicApi.DEFAULT_HANDLERS.MM = () => 'HACKED';
    }).toThrow();
    expect(publicApi.formatDate('20250425', 'yyyyMMdd', 'MM')).toBe('04');
  });
});

describe('dist directory hygiene', () => {
  it('contains only the two bundles', () => {
    if (!distBuilt) return;
    for (const [dir, expected] of Object.entries({
      'dist/cjs': 'index.cjs',
      'dist/esm': 'index.esm.js',
    })) {
      const files = readdirSync(join(root, dir)).filter(
        (f) => !f.endsWith('.map'),
      );
      expect(files).toEqual([expected]);
    }
  });
});
