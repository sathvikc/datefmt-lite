#!/usr/bin/env node
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/**
 * The public API surface, hardcoded on purpose. Deriving this from src/ would
 * let the check silently re-baseline itself when an export is dropped, which is
 * precisely the regression it exists to catch.
 */
const PUBLIC_API = [
  'buildTemplate',
  'extractTokens',
  'formatDate',
  'normalizeFields',
  'validateOutput',
];

const EXPECTED_CONDITIONS = ['types', 'import', 'require'];
const EXPECTED = '25/04/2025';
const ARGS = ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'];
const GZIP_BUDGET = 3072;

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

/** Normalizes "./a/b" and "a/b" to a single canonical form for comparison. */
const rel = (p) => String(p).replace(/^\.\//, '');

/**
 * Resolves the package by NAME through a scratch node_modules tree, so the
 * `exports` map is genuinely exercised rather than bypassed by an absolute path.
 */
const sandbox = mkdtempSync(join(tmpdir(), 'datefmt-lite-dist-'));
const pkgDir = join(sandbox, 'node_modules', pkg.name);
mkdirSync(pkgDir, { recursive: true });
cpSync(join(root, 'dist'), join(pkgDir, 'dist'), { recursive: true });
cpSync(join(root, 'types'), join(pkgDir, 'types'), { recursive: true });
writeFileSync(
  join(pkgDir, 'package.json'),
  JSON.stringify({ ...pkg, files: undefined }),
);

const sandboxRequire = createRequire(join(sandbox, 'probe.cjs'));

await check('exports map is well formed', () => {
  const entry = pkg.exports?.['.'];
  assert(entry && typeof entry === 'object', 'exports["."] missing');
  for (const cond of EXPECTED_CONDITIONS) {
    assert(
      Object.hasOwn(entry, cond),
      `exports["."] is missing the "${cond}" condition`,
    );
  }
  assert(
    rel(entry.require) === rel(pkg.main),
    `exports["."].require (${entry.require}) must point at main (${pkg.main})`,
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
  const missing = targets.filter((t) => !existsSync(join(root, t)));
  assert(!missing.length, `unresolvable: ${missing.join(', ')}`);
  return `${targets.length} targets`;
});

await check('require("datefmt-lite") resolves via exports', () => {
  const mod = sandboxRequire(pkg.name);
  assert(typeof mod.formatDate === 'function', 'formatDate not exported');
  assert(mod.formatDate(...ARGS) === EXPECTED, 'wrong output from require()');
  return 'ok';
});

await check('import "datefmt-lite" resolves via exports', async () => {
  const mod = await import(pkg.name).catch(
    () => import(pathToFileURL(join(root, pkg.module)).href),
  );
  assert(typeof mod.formatDate === 'function', 'formatDate not exported');
  assert(mod.formatDate(...ARGS) === EXPECTED, 'wrong output from import()');
  return 'ok';
});

await check('require() exposes the full public API', () => {
  const mod = sandboxRequire(pkg.name);
  const keys = Object.keys(mod)
    .filter((k) => k !== 'default')
    .sort();
  const missing = PUBLIC_API.filter((n) => typeof mod[n] !== 'function');
  assert(!missing.length, `missing or non-function: ${missing.join(', ')}`);
  return keys.join(', ');
});

await check('import() exposes the full public API', async () => {
  const mod = await import(pathToFileURL(join(root, pkg.module)).href);
  const missing = PUBLIC_API.filter((n) => typeof mod[n] !== 'function');
  assert(!missing.length, `missing or non-function: ${missing.join(', ')}`);
  return `${PUBLIC_API.length} functions`;
});

await check('bundles contain the public API by name', () => {
  for (const bundle of [pkg.main, pkg.module]) {
    const text = readFileSync(join(root, bundle), 'utf8');
    for (const n of PUBLIC_API) {
      assert(text.includes(n), `${n} missing from ${bundle}`);
    }
  }
  return `${PUBLIC_API.length} names in both bundles`;
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
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith('.map') && f !== want) strays.push(`${dir}/${f}`);
    }
  }
  assert(!strays.length, `unexpected files: ${strays.join(', ')}`);
  return 'bundle-only';
});

await check('both bundles stay within the size budget', () => {
  const detail = [];
  for (const bundle of [pkg.main, pkg.module]) {
    const raw = readFileSync(join(root, bundle));
    const gz = gzipSync(raw).length;
    assert(
      gz < GZIP_BUDGET,
      `${bundle} is ${gz} B gz, budget ${GZIP_BUDGET} B`,
    );
    detail.push(`${bundle.split('/').pop()} ${gz} B gz`);
  }
  return detail.join(', ');
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
