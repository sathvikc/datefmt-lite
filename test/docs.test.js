import { formatDate } from '../src/formatter.js';
import { ERROR_CODES } from '../src/errors.js';

/**
 * Runs every executable example in the markdown documentation and asserts the
 * documented output, so docs cannot drift from behaviour again.
 */

const readDocs = () => {
  const files = [
    'README.md',
    'docs/api.md',
    'docs/tokens.md',
    'docs/examples.md',
  ];
  return files.flatMap((file) => ({
    file,
    body: require('node:fs').readFileSync(file, 'utf8'),
  }));
};

const pivot = (n) => (n < 50 ? 2000 + n : 1900 + n);

/** Every documented example, with the output the docs promise. */
const EXAMPLES = [
  {
    code: "formatDate('20250425','yyyyMMdd','dd/MM/yyyy')",
    expected: '25/04/2025',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','yyyyMMdd')",
    expected: '20250425',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','Day dd of MMMM')",
    expected: 'Day 25 of April',
  },
  {
    code: "formatDate('25-Apr-2025','dd-MMM-yyyy','yyyy-MM-dd')",
    expected: '2025-04-25',
  },
  {
    code: "formatDate('250425','yyMMdd','dd/MM/yyyy',{yearConverter:y=>2000+y})",
    expected: '25/04/2025',
  },
  {
    code: "formatDate('not-a-date','yyyyMMdd','dd/MM/yyyy',{errorPolicy:'silent'})",
    expected: 'not-a-date',
  },
  {
    code: "formatDate('2025','yyyy','MM/dd/yyyy',{errorPolicy:'silent'})",
    expected: 'MM/dd/2025',
  },
  {
    code: "formatDate('20240229','yyyyMMdd','dd/MM/yyyy',{validate:'strict'})",
    expected: '29/02/2024',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','yyyy [at] MM')",
    expected: '2025 at 04',
  },
  { code: "formatDate('2025','yyyy','[yyyy]')", expected: 'yyyy' },
  {
    code: "formatDate('20250615','yyyyMMdd','yyyy-[Q]Q',{customTokens:{Q:p=>String(Math.ceil(p.month/3))}})",
    expected: '2025-Q2',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','dd/MM/yyyy',{overrideTokens:{dd:'01'}})",
    expected: '01/04/2025',
  },
  {
    code: "formatDate('202504','yyyyMM','dd/MM/yyyy',{defaultTokens:{dd:'99'}})",
    expected: '99/04/2025',
  },
  {
    code: "formatDate('20250425030709','yyyyMMddHHmmss','yyyy-MM-ddTHH:mm:ss')",
    expected: '2025-04-25T03:07:09',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','yyyy-MM-dd')",
    expected: '2025-04-25',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','MMM dd, yyyy')",
    expected: 'Apr 25, 2025',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','MMMM d, yyyy')",
    expected: 'April 25, 2025',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','dd.MM.yyyy')",
    expected: '25.04.2025',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','yy-MM-dd')",
    expected: '25-04-25',
  },
  { code: "formatDate('20250425','yyyyMMdd','d/M/yy')", expected: '25/4/25' },
  {
    code: "formatDate('20250425030709','yyyyMMddHHmmss','yyyy-MM-dd HH:mm:ss')",
    expected: '2025-04-25 03:07:09',
  },
  {
    code: "formatDate('2025-4-9','yyyy-M-d','dd/MM/yyyy')",
    expected: '09/04/2025',
  },
  {
    code: "formatDate('050425','yyMMdd','yy',{yearConverter:()=>5})",
    expected: '05',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','[ISO] yyyy-MM-dd')",
    expected: 'ISO 2025-04-25',
  },
  {
    code: "formatDate('20250409','yyyyMd','dd/MM/yyyy')",
    expected: '09/04/2025',
  },
  {
    code: "formatDate('20250425','yyyyMMdd','dd/MM/yyyy',{validate:'lenient'})",
    expected: '25/04/2025',
  },
];

/** Examples the docs state must throw, with the expected error code. */
const FAILING_EXAMPLES = [
  {
    code: "formatDate('2025/04/25','yyyy-MM-dd','dd/MM/yyyy')",
    code_: ERROR_CODES.INPUT_MISMATCH,
  },
  {
    code: "formatDate('20250425JUNK','yyyyMMdd','dd/MM/yyyy')",
    code_: ERROR_CODES.INPUT_MISMATCH,
  },
  {
    code: "formatDate('\\uFEFF20250425','yyyyMMdd','dd/MM/yyyy')",
    code_: ERROR_CODES.INPUT_MISMATCH,
  },
  {
    code: "formatDate('20251345','yyyyMMdd','dd/MM/yyyy',{validate:'strict'})",
    code_: ERROR_CODES.OUT_OF_RANGE,
  },
  {
    code: "formatDate('20250229','yyyyMMdd','dd/MM/yyyy',{validate:'strict'})",
    code_: ERROR_CODES.OUT_OF_RANGE,
  },
  {
    code: "formatDate('20250425','yyyyMMdd','ISO yyyy',{strictTokens:true})",
    code_: ERROR_CODES.UNPRODUCIBLE_TOKEN,
  },
];

const run = (source) =>
  new Function('formatDate', 'pivot', `return (${source});`)(formatDate, pivot);

describe('documented examples', () => {
  it.each(EXAMPLES)(
    'produces the documented output for $code',
    ({ code, expected }) => {
      expect(run(code)).toBe(expected);
    },
  );

  it.each(FAILING_EXAMPLES)(
    'fails as documented for $code',
    ({ code, code_ }) => {
      let caught;
      try {
        run(code);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught.code).toBe(code_);
    },
  );
});

describe('markdown documentation', () => {
  const docs = readDocs();

  it('has documentation files to check', () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it('no longer instructs readers to use yarn', () => {
    for (const { body } of docs) {
      expect(body).not.toMatch(/\byarn\b/);
    }
  });

  it('no longer promises pre-compiled templates', () => {
    for (const { body } of docs) {
      expect(body).not.toMatch(/pre-?compiled/i);
    }
  });

  it('no longer claims full Unicode conformance', () => {
    for (const { body } of docs) {
      expect(body).not.toMatch(/follows \[?Unicode/i);
    }
  });

  it('has no placeholder repository URLs', () => {
    for (const { body } of docs) {
      expect(body).not.toMatch(/your-org|your-repo/);
    }
  });

  it('documents every option the formatter accepts', () => {
    const readme = docs.find((d) => d.file === 'README.md').body;
    for (const option of [
      'errorPolicy',
      'validate',
      'verifyLiterals',
      'strictTokens',
      'yearConverter',
      'customTokens',
      'overrideTokens',
      'defaultTokens',
    ]) {
      expect(readme).toContain(option);
    }
  });

  it('states that silent mode still reports caller mistakes', () => {
    const readme = docs.find((d) => d.file === 'README.md').body;
    expect(readme).toMatch(/caller mistakes/i);
  });
});
