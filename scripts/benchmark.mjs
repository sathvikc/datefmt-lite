#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatDate } from '../src/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ITERATIONS = 200_000;
const WARMUP = 20_000;
const REPEATS = 3;

function measure(fn) {
  let best = Infinity;
  for (let r = 0; r < REPEATS; r++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) fn(i);
    const ns = Number(process.hrtime.bigint() - start) / ITERATIONS;
    if (ns < best) best = ns;
  }
  return best;
}

function bench(label, fn) {
  for (let i = 0; i < WARMUP; i++) fn(i);
  const ns = measure(fn);
  return { label, ns, ops: 1e9 / ns };
}

const rotating = [
  'dd/MM/yyyy',
  'yyyy-MM-dd',
  'MMM dd, yyyy',
  'dd.MM.yyyy',
  'MM/dd/yyyy',
  'dd-MMM-yyyy',
  'yyyy/MM/dd',
  'MMMM dd, yyyy',
];

const distinct = Array.from({ length: 4096 }, (_, i) =>
  String(20250100 + i).slice(0, 8),
);

const results = [
  bench('identical args (ETL batch)', () =>
    formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy'),
  ),
  bench('distinct values, fixed formats', (i) =>
    formatDate(distinct[i & 4095], 'yyyyMMdd', 'dd/MM/yyyy'),
  ),
  bench('rotating output formats', (i) =>
    formatDate('20250425', 'yyyyMMdd', rotating[i & 7]),
  ),
  bench('full timestamp', () =>
    formatDate('20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-dd HH:mm:ss'),
  ),
];

const width = Math.max(...results.map((r) => r.label.length));
console.log(`\ndatefmt-lite benchmark (node ${process.version})`);
console.log(`${ITERATIONS.toLocaleString()} iterations, best of ${REPEATS}\n`);
console.log(
  `${'workload'.padEnd(width)}  ${'ns/op'.padStart(10)}  ${'ops/sec'.padStart(12)}`,
);
console.log('-'.repeat(width + 28));
for (const r of results) {
  console.log(
    `${r.label.padEnd(width)}  ${r.ns.toFixed(1).padStart(10)}  ${(r.ops / 1e6)
      .toFixed(2)
      .padStart(10)} M/s`,
  );
}

const worst = Math.max(...results.map((r) => r.ns));
console.log(`\nworst case: ${worst.toFixed(0)} ns/op`);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (existsSync(join(root, pkg.module))) {
  const raw = readFileSync(join(root, pkg.module));
  console.log(
    `bundle: ${raw.length} B raw / ${gzipSync(raw).length} B gzipped ` +
      `(budget 5632 B)`,
  );
}

console.log(
  `\nnote: timings are informational only and are not a CI pass/fail gate.\n`,
);
