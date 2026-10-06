import { buildTemplate, renderTemplate } from '../src/buildTemplate.js';
import { nullProtoMap } from '../src/utils.js';

const handlers = () =>
  nullProtoMap({
    yyyy: () => '2025',
    MM: () => '04',
    dd: () => '25',
    HH: () => '03',
    MMM: () => 'Apr',
    nullish: () => null,
    undef: () => undefined,
    num: () => 42,
    obj: () => ({ a: 1 }),
  });

describe('buildTemplate', () => {
  it('rejects a non-string format', () => {
    expect(() => buildTemplate(42, handlers())).toThrow(TypeError);
    expect(() => buildTemplate(null, handlers())).toThrow(TypeError);
  });

  it('compiles a token-only format', () => {
    expect(buildTemplate('yyyyMMdd', handlers())).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'token', value: 'MM' },
      { type: 'token', value: 'dd' },
    ]);
  });

  it('compiles literals between tokens', () => {
    expect(buildTemplate('dd/MM/yyyy', handlers())).toEqual([
      { type: 'token', value: 'dd' },
      { type: 'text', value: '/' },
      { type: 'token', value: 'MM' },
      { type: 'text', value: '/' },
      { type: 'token', value: 'yyyy' },
    ]);
  });

  it('folds escaped groups into text with brackets removed', () => {
    expect(buildTemplate('yyyy [at] HH', handlers())).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'text', value: ' at ' },
      { type: 'token', value: 'HH' },
    ]);
  });

  it('compiles an empty format to no steps', () => {
    expect(buildTemplate('', handlers())).toEqual([]);
  });

  it('never emits an empty text step', () => {
    for (const step of buildTemplate('[]yyyy', handlers())) {
      expect(step.type === 'token' || step.value.length > 0).toBe(true);
    }
  });

  it('treats an undeclared word as literal text', () => {
    expect(buildTemplate('Date: yyyy', handlers())).toEqual([
      { type: 'text', value: 'Date: ' },
      { type: 'token', value: 'yyyy' },
    ]);
  });
});

describe('renderTemplate', () => {
  const render = (format, parts = {}, h = handlers()) =>
    renderTemplate(buildTemplate(format, h), h, parts);

  it('renders a simple format', () => {
    expect(render('dd/MM/yyyy')).toBe('25/04/2025');
  });

  it('renders a compact format', () => {
    expect(render('yyyyMMdd')).toBe('20250425');
  });

  it('renders literal words', () => {
    expect(render('Date: dd/MM/yyyy')).toBe('Date: 25/04/2025');
  });

  it('renders escaped groups without brackets', () => {
    expect(render('dd [at] HH')).toBe('25 at 03');
  });

  it('coerces a number result to a string', () => {
    expect(render('num')).toBe('42');
  });

  it('coerces an object result to a string', () => {
    expect(render('obj')).toBe('[object Object]');
  });

  it('throws when a handler yields null and no fallback is set', () => {
    expect(() => render('nullish')).toThrow(/produced no usable value/);
  });

  it('reports the offending token when coercion fails', () => {
    const h = nullProtoMap({ bad: () => Object.create(null) });
    expect(() => renderTemplate(buildTemplate('bad', h), h, {})).toThrow(
      /"bad"/,
    );
  });

  it('uses the fallback for a null result', () => {
    const h = handlers();
    const plan = buildTemplate('nullish', h);
    expect(renderTemplate(plan, h, {}, { onMissing: (t) => `<${t}>` })).toBe(
      '<nullish>',
    );
  });

  it('uses the fallback for an undefined result', () => {
    const h = handlers();
    const plan = buildTemplate('undef', h);
    expect(renderTemplate(plan, h, {}, { onMissing: () => 'X' })).toBe('X');
  });

  it('renders a string handler value', () => {
    const h = nullProtoMap({ d: '01' });
    expect(renderTemplate(buildTemplate('d', h), h, {})).toBe('01');
  });

  it('never emits the string "null"', () => {
    const h = handlers();
    const plan = buildTemplate('nullish undef', h);
    const out = renderTemplate(plan, h, {}, { onMissing: () => '' });
    expect(out).not.toContain('null');
    expect(out).not.toContain('undefined');
  });

  it('renders an empty format as an empty string', () => {
    expect(render('')).toBe('');
  });

  it('ignores a missing handler by falling back', () => {
    const h = nullProtoMap({});
    const plan = buildTemplate('yyyy', h);
    expect(renderTemplate(plan, h, {}, { onMissing: (t) => t })).toBe('yyyy');
  });

  it('never resolves a prototype member as a handler', () => {
    const h = nullProtoMap({ yyyy: () => '2025' });
    const plan = buildTemplate('toString', h);
    expect(plan).toEqual([{ type: 'text', value: 'toString' }]);
  });
});
