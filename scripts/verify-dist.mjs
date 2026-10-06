#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/**
 * The public API, listed explicitly. Deriving this from src/index.js would let
 * the check silently re-baseline itself when an export is dropped, which is
 * exactly the regression this exists to catch.
 */
const PUBLIC_API = [
  'buildTemplate',
  'extractTokens',
  'formatDate',
  'normalizeFields',
  'validateOutput',
];

/**
 * Behaviours a bundle must reproduce. Without these, a stale `dist/` carrying
 * only the right export names would pass while shipping a broken library.
 */
const BEHAVIOURS = [
  [
    'basic conversion',
    ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'],
    {},
    '25/04/2025',
  ],
  [
    'bracketed literal',
    ['20250425', 'yyyyMMdd', 'dd [at] MM'],
    {},
    '25 [at] 04',
  ],
  [
    'literal month name',
    ['20250425', 'yyyyMMdd', 'MMM dd, yyyy'],
    {},
    'Apr 25, 2025',
  ],
  [
    'two-digit year with converter',
    ['250425', 'yyMMdd', 'dd/MM/yyyy'],
    { yearConverter: (n) => (n < 50 ? 2000 + n : 1900 + n) },
    '25/04/2025',
  ],
  [
    'silent fallback',
    ['2025', 'yyyy', 'MM/dd/yyyy'],
    { errorPolicy: 'silent' },
    'MM/dd/2025',
  ],
  [
    'override token',
    ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'],
    { overrideTokens: { dd: '01' } },
    '01/04/2025',
  ],
];

const EXPECTED = '25/04/2025';
const ARGS = ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'];

/**
 * Size budget for the two bundles combined, gzipped.
 *
 * A consumer loads one entrypoint, but this is enforced on the total so neither
 * can grow unchecked while the other stays small. It leaves roughly 1 kB of
 * headroom over the current ~3.3 kB, which is room for a fix but not for a
 * dependency.
 */
const GZIP_BUDGET = 4096;

const results = [];

async function check(name, fn) {
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** Normalizes "./a/b" and "a/b" to one canonical form for comparison. */
const rel = (p) => String(p).replace(/^\.\//, '');

/**
 * Resolves the package by NAME through a scratch node_modules tree, so the
 * exports map is genuinely exercised rather than bypassed by an absolute path.
 */
const sandbox = mkdtempSync(join(tmpdir(), 'datefmt-lite-dist-'));
const pkgDir = join(sandbox, 'node_modules', pkg.name);
mkdirSync(pkgDir, { recursive: true });
cpSync(join(root, 'dist'), join(pkgDir, 'dist'), { recursive: true });
cpSync(join(root, 'types'), join(pkgDir, 'types'), { recursive: true });
writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(pkg));

const sandboxRequire = createRequire(join(sandbox, 'probe.cjs'));

// Resolve through the package NAME from inside the sandbox, so the exports map
// is genuinely exercised for each condition. An absolute path would bypass it.
writeFileSync(
  join(sandbox, 'probe.cjs'),
  `const m = require(${JSON.stringify(pkg.name)});\n` +
    `console.log(JSON.stringify({ ok: typeof m.formatDate === 'function', ` +
    `value: m.formatDate(...${JSON.stringify(ARGS)}), ` +
    `resolved: require.resolve(${JSON.stringify(pkg.name)}), ` +
    `keys: Object.keys(m).sort() }));\n`,
);
writeFileSync(
  join(sandbox, 'probe.mjs'),
  `import * as m from ${JSON.stringify(pkg.name)};\n` +
    `console.log(JSON.stringify({ ok: typeof m.formatDate === 'function', ` +
    `value: m.formatDate(...${JSON.stringify(ARGS)}), ` +
    `resolved: import.meta.resolve(${JSON.stringify(pkg.name)}), ` +
    `keys: Object.keys(m).filter((k) => k !== 'default').sort() }));\n`,
);

/**
 * Runs one of the sandbox probes in a fresh Node process.
 *
 * @param {string} file Probe filename inside the sandbox.
 * @returns {{ok: boolean, value: string, keys: string[]}}
 */
function probe(file) {
  const out = spawnSync(process.execPath, [join(sandbox, file)], {
    encoding: 'utf8',
  });
  if (out.status !== 0) {
    throw new Error(`${file} exited ${out.status}: ${out.stderr.trim()}`);
  }
  return JSON.parse(out.stdout);
}

await check('exports map is well formed', () => {
  const entry = pkg.exports?.['.'];
  assert(entry && typeof entry === 'object', 'exports["."] missing');
  for (const cond of ['types', 'import', 'require']) {
    assert(
      Object.hasOwn(entry, cond),
      `exports["."] is missing the "${cond}" condition`,
    );
  }
  assert(
    rel(entry.require) === rel(pkg.main),
    `exports["."].require must point at main (${pkg.main})`,
  );
  assert(
    rel(entry.types) === rel(pkg.types),
    `exports["."].types must point at ${pkg.types}`,
  );
  assert(
    pkg.main.endsWith('.cjs'),
    `main must use a .cjs extension to be loadable as CommonJS, got ${pkg.main}`,
  );
  return `${Object.keys(entry).join(', ')}`;
});

await check('every exports target exists on disk', () => {
  const targets = [];
  const walk = (node) => {
    if (typeof node === 'string') targets.push(node);
    else if (node && typeof node === 'object')
      Object.values(node).forEach(walk);
  };
  walk(pkg.exports);
  assert(targets.length > 0, 'exports map yielded no targets');
  const missing = targets.filter((t) => !exists(join(root, t)));
  assert(!missing.length, `unresolvable: ${missing.join(', ')}`);
  return `${targets.length} targets`;
});

await check('require("datefmt-lite") resolves via exports', () => {
  const r = probe('probe.cjs');
  assert(r.ok, 'formatDate not exported to require()');
  assert(r.value === EXPECTED, `wrong output from require(): ${r.value}`);
  return 'ok';
});

await check('import "datefmt-lite") resolves via exports', () => {
  const r = probe('probe.mjs');
  assert(r.ok, 'formatDate not exported to import()');
  assert(r.value === EXPECTED, `wrong output from import(): ${r.value}`);
  return 'ok';
});

await check('both entrypoints expose the full public API', () => {
  for (const file of ['probe.cjs', 'probe.mjs']) {
    const r = probe(file);
    const missing = PUBLIC_API.filter((n) => !r.keys.includes(n));
    assert(!missing.length, `${file} is missing: ${missing.join(', ')}`);
  }
  return `${PUBLIC_API.length} exports from each`;
});

await check(
  'bundles reproduce current behaviour, not just export names',
  () => {
    const mod = sandboxRequire(pkg.name);
    for (const [label, args, options, expected] of BEHAVIOURS) {
      const out = mod.formatDate(...args, options);
      assert(
        out === expected,
        `${label}: bundle gave ${JSON.stringify(out)}, expected ${expected}`,
      );
    }
    return `${BEHAVIOURS.length} behaviours match`;
  },
);

await check('bundles still reject bad input like src/', () => {
  let threw = false;
  try {
    sandboxRequire(pkg.name).formatDate('2025', 'yyyy', 'MM/dd/yyyy');
  } catch {
    threw = true;
  }
  assert(threw, 'bundle silently accepted an unproducible token');
  return 'strict validation enforced';
});

await check('each condition resolves to its own bundle', () => {
  const cjs = probe('probe.cjs').resolved;
  const esm = probe('probe.mjs').resolved;
  assert(
    cjs.endsWith(rel(pkg.main)),
    `require() resolved ${cjs}, expected ${pkg.main}`,
  );
  assert(
    esm.endsWith(rel(pkg.module)),
    `import() resolved ${esm}, expected ${pkg.module}`,
  );
  return 'require→cjs, import→esm';
});

await check('cjs bundle is CommonJS and carries no ESM syntax', () => {
  const src = readFileSync(join(root, pkg.main), 'utf8');
  assert(/\bexports\.|module\.exports/.test(src), 'no CommonJS export found');
  // Bundles are minified to a single line, so this must not be line-anchored.
  assert(
    !/(^|[;\s}])(import|export)[\s{*(]/.test(src),
    'ESM syntax in cjs bundle',
  );
  return 'clean CJS';
});

await check('esm bundle is ESM and carries no CJS syntax', () => {
  const src = readFileSync(join(root, pkg.module), 'utf8');
  assert(/\bexport\s*[{*]/.test(src), 'no ESM export found');
  assert(!/\bmodule\.exports\b/.test(src), 'CJS syntax in esm bundle');
  return 'clean ESM';
});

await check('bundles are self-contained (zero runtime deps)', () => {
  for (const bundle of [pkg.main, pkg.module]) {
    const src = readFileSync(join(root, bundle), 'utf8');
    const bare = src.match(/(?:from|require\()\s*["'][^./][^"']*["']/g);
    assert(!bare, `${bundle} references external modules: ${bare?.join(', ')}`);
  }
  return 'no external imports';
});

await check('dist holds bundles only (no stray transpiler output)', () => {
  const expected = { 'dist/cjs': 'index.cjs', 'dist/esm': 'index.esm.js' };
  const strays = [];
  for (const [dir, want] of Object.entries(expected)) {
    const abs = join(root, dir);
    if (!exists(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith('.map') && f !== want) strays.push(`${dir}/${f}`);
    }
  }
  assert(!strays.length, `unexpected files: ${strays.join(', ')}`);
  return 'bundle-only';
});

await check('shipped bundle total stays within the size budget', () => {
  // Measured on the SUM. A consumer loads one entrypoint, but a per-entry
  // budget would let the total drift to twice the stated figure.
  let total = 0;
  const detail = [];
  for (const bundle of [pkg.main, pkg.module]) {
    const gz = gzipSync(readFileSync(join(root, bundle))).length;
    total += gz;
    detail.push(`${bundle.split('/').pop()} ${gz} B`);
  }
  assert(
    total < GZIP_BUDGET,
    `bundles total ${total} B gzipped, budget ${GZIP_BUDGET} B`,
  );
  return `${detail.join(' + ')} = ${total} B (budget ${GZIP_BUDGET})`;
});

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail ?? ''}`,
  );
}

const failed = results.filter((r) => !r.ok);
rmSync(sandbox, { recursive: true, force: true });

console.log('');
if (failed.length) {
  console.error(
    `dist verification FAILED (${failed.length}/${results.length})`,
  );
  process.exit(1);
}
console.log(`dist verification passed (${results.length} checks)`);

function exists(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
