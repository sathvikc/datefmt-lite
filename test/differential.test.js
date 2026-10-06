import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { formatDate } from '../src/index.js';

// jest transforms tests to CommonJS, so `import.meta` is unavailable here.
const root = resolve(process.cwd());

/**
 * Differential test against the pre-optimization implementation.
 *
 * The caches in src/utils.js and src/buildTemplate.js are only safe if they are
 * truly transparent: identical output, identical thrown errors, for every input.
 * This runs a large seeded corpus through both the current implementation and
 * the commit that preceded the caching work, then compares byte for byte.
 *
 * The reference is fetched from git, so the test skips rather than fails when
 * the repository history is unavailable (a published tarball, a shallow clone).
 */
const REFERENCE_COMMIT = process.env.DATEFMT_REFERENCE ?? '';

const hasReference = (() => {
  if (!REFERENCE_COMMIT) return false;
  try {
    execFileSync(
      'git',
      ['cat-file', '-e', `${REFERENCE_COMMIT}:src/formatter.js`],
      {
        cwd: root,
        stdio: 'ignore',
      },
    );
    return true;
  } catch {
    return false;
  }
})();

const TOKENS = [
  'yyyy',
  'yy',
  'MMMM',
  'MMM',
  'MM',
  'M',
  'dd',
  'd',
  'HH',
  'H',
  'mm',
  'm',
  'ss',
  's',
];

const SEPARATORS = ['', '-', '/', '.', ' ', ':', ', ', 'T', '_', '[at] '];
const LITERAL_WORDS = ['', 'Date: ', '[ISO] ', 'Day ', 'Week '];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

/** Builds one (input, inputFormat, outputFormat, options) case. */
function makeCase(rand) {
  const count = 1 + Math.floor(rand() * 5);
  const tokens = Array.from({ length: count }, () => pick(rand, TOKENS));
  const sep = pick(rand, SEPARATORS);

  const inputFormat = tokens.join(sep);
  const outputFormat = `${pick(rand, LITERAL_WORDS)}${tokens.join(
    pick(rand, SEPARATORS),
  )}`;

  // Generate an input that mostly matches the format, sometimes corrupted.
  const length = inputFormat.length;
  let input = '';
  for (let i = 0; i < length; i += 1) {
    const isTokenLetter = /[a-zA-Z]/.test(inputFormat[i]);
    input += isTokenLetter ? String(Math.floor(rand() * 10)) : inputFormat[i];
  }

  const roll = rand();
  if (roll > 0.85) input += 'JUNK';
  else if (roll > 0.75) input = input.slice(0, Math.max(0, input.length - 2));
  else if (roll > 0.7 && input.length > 2) {
    const at = Math.floor(rand() * input.length);
    input = input.slice(0, at) + 'X' + input.slice(at + 1);
  }

  const options = {
    errorPolicy: rand() > 0.5 ? 'throw' : 'silent',
    yearConverter: (n) => (n < 50 ? 2000 + n : 1900 + n),
  };
  if (rand() > 0.7) options.validate = pick(rand, ['off', 'lenient', 'strict']);
  if (rand() > 0.8) options.strictTokens = true;
  if (rand() > 0.8) options.verifyLiterals = false;

  return { input, inputFormat, outputFormat, options };
}

/** Runs a case, capturing the result or the error identity. */
function run(formatDateImpl, testCase) {
  try {
    return { ok: true, value: formatDateImpl(...arguments0(testCase)) };
  } catch (err) {
    return { ok: false, name: err.name, code: err.code, message: err.message };
  }
}

function arguments0({ input, inputFormat, outputFormat, options }) {
  return [input, inputFormat, outputFormat, options];
}

const describeResult = (r) =>
  r.ok
    ? `OK ${JSON.stringify(r.value)}`
    : `ERR ${r.name} ${r.code} ${r.message}`;

/**
 * The reference is extracted inside the project so jest's resolver and
 * babel transform can both reach it, then removed afterwards.
 */
const referenceDir = join(root, '.differential-reference');

afterAll(() => {
  rmSync(referenceDir, { recursive: true, force: true });
});

/**
 * Materializes the reference implementation in a temp directory.
 *
 * @returns {Promise<Function|null>}
 */
async function loadReference() {
  if (!hasReference) return null;

  rmSync(referenceDir, { recursive: true, force: true });
  mkdirSync(referenceDir, { recursive: true });

  const archive = join(referenceDir, 'ref.tar');
  writeFileSync(
    archive,
    execFileSync('git', ['archive', REFERENCE_COMMIT, 'src'], { cwd: root }),
  );
  execFileSync('tar', ['-xf', archive], { cwd: referenceDir, stdio: 'ignore' });

  if (!existsSync(join(referenceDir, 'src/index.js'))) {
    throw new Error(`reference commit ${REFERENCE_COMMIT} has no src/index.js`);
  }

  const mod = await import(join(referenceDir, 'src/index.js'));
  if (typeof mod.formatDate !== 'function') {
    throw new Error('reference module did not export formatDate');
  }
  return mod.formatDate;
}

const describeIt = hasReference ? describe : describe.skip;

describeIt(
  'differential parity with the pre-optimization implementation',
  () => {
    let reference;
    let results;
    const sampled = [];

    beforeAll(async () => {
      reference = await loadReference();
      if (!reference) return;

      results = { compared: 0, mismatches: 0, samples: [] };

      for (const seed of [1, 7, 42, 1234, 987654, 31337]) {
        const rand = mulberry32(seed);
        for (let i = 0; i < 2500; i += 1) {
          const testCase = makeCase(rand);
          sampled.push(testCase);
          const mine = run(formatDate, testCase);
          const theirs = run(reference, testCase);
          results.compared += 1;

          if (describeResult(mine) !== describeResult(theirs)) {
            results.mismatches += 1;
            if (results.samples.length < 10) {
              results.samples.push({
                case: testCase,
                mine: describeResult(mine),
                theirs: describeResult(theirs),
              });
            }
          }
        }
      }
    }, 120_000);

    it('loaded the reference implementation', () => {
      expect(typeof reference).toBe('function');
    });

    it('produces identical results for every generated case', () => {
      expect(results.compared).toBeGreaterThan(10000);
      expect(results.mismatches).toBe(0);
    });

    it('exercises both successes and failures', () => {
      const kinds = new Set(
        sampled.slice(0, 2000).map((c) => {
          const r = run(formatDate, c);
          return r.ok ? 'ok' : r.code;
        }),
      );
      expect(kinds.size).toBeGreaterThan(2);
    });

    it('reports the first mismatches when they occur', () => {
      if (results.mismatches === 0) return;
      throw new Error(
        `mismatches:\n${results.samples
          .map((s) => JSON.stringify(s, null, 2))
          .join('\n')}`,
      );
    });
  },
);

describe('caching is transparent', () => {
  const cases = [
    ['20250425', 'yyyyMMdd', 'dd/MM/yyyy'],
    ['20250425', 'yyyyMMdd', 'yyyyMMdd'],
    ['25-Apr-2025', 'dd-MMM-yyyy', 'yyyy-MM-dd'],
    ['20250425030709', 'yyyyMMddHHmmss', 'yyyy-MM-ddTHH:mm:ss'],
    ['20250425', 'yyyyMMdd', 'Day dd of MMMM'],
    ['20250409', 'yyyyMd', 'dd/MM/yyyy'],
  ];

  it.each(cases)('is stable across repeated calls for %s', (...args) => {
    const first = formatDate(...args);
    for (let i = 0; i < 25; i += 1) {
      expect(formatDate(...args)).toBe(first);
    }
  });

  it('is not confused by interleaved formats', () => {
    const order = [cases[0], cases[2], cases[1], cases[5], cases[0], cases[4]];
    const expected = order.map((args) => formatDate(...args));
    for (let pass = 0; pass < 3; pass += 1) {
      order.forEach((args, i) => expect(formatDate(...args)).toBe(expected[i]));
    }
  });

  it('keeps custom tokens from leaking between calls', () => {
    const withQ = formatDate('20250425', 'yyyyMMdd', 'yyyy-Q', {
      customTokens: { Q: (p) => 'Q' + Math.ceil(p.month / 3) },
    });
    expect(withQ).toBe('2025-Q2');
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy-Q')).toBe('2025-Q');
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy-Q')).toBe('2025-Q');
  });

  it('keeps bracket handling stable across calls', () => {
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy [at] MM')).toBe(
      '2025 at 04',
    );
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy [-] MM')).toBe('2025 - 04');
    expect(formatDate('20250425', 'yyyyMMdd', 'yyyy [at] MM')).toBe(
      '2025 at 04',
    );
  });

  it('handles many distinct formats without unbounded growth', () => {
    // Exceeds the cache cap repeatedly; correctness must hold regardless.
    for (let i = 0; i < 2000; i += 1) {
      const format = `yyyy${'-'.repeat(0)}MM${i % 10}`;
      expect(
        formatDate('20250425', 'yyyyMMdd', format, {
          errorPolicy: 'silent',
        }),
      ).toContain('2025');
    }
    // The original case must still work afterwards.
    expect(formatDate('20250425', 'yyyyMMdd', 'dd/MM/yyyy')).toBe('25/04/2025');
  });
});
