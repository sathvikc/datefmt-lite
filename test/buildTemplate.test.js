import { buildTemplate } from '../src/buildTemplate.js';

describe('buildTemplate', () => {
  it('should render tokens and literals correctly', () => {
    const handlers = {
      foo: parts => parts.foo.toUpperCase(),
      bar: 'BAR',
    };
    const format = 'fooXbar';
    const chunks = buildTemplate(format, handlers);
    const out = chunks
      .map(chunk => (typeof chunk === 'string' ? chunk : chunk({ foo: 'a' })))
      .join('');
    expect(out).toBe('AXBAR');
  });

  it('should treat the entire string as literal if no tokens match', () => {
    const handlers = { foo: () => {} };
    const format = 'no tokens here';
    const chunks = buildTemplate(format, handlers);
    expect(chunks).toEqual(['no tokens here']);
  });

  it('should prefer longer tokens over shorter when they overlap', () => {
    const handlers = {
      aa: () => 'AA',
      a: () => 'A',
    };
    const format = 'aaa';
    const chunks = buildTemplate(format, handlers);
    const out = chunks
      .map(chunk => (typeof chunk === 'string' ? chunk : chunk({})))
      .join('');
    expect(out).toBe('AAA');
  });
});
