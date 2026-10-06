import { babel } from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';

const extensions = ['.js', '.mjs'];

export default {
  input: 'src/index.js',
  // The library has zero runtime dependencies by design. Without node-resolve,
  // an accidental bare import would otherwise be emitted unresolved and ship
  // green, so fail the build instead.
  onwarn(warning, warn) {
    if (warning.code === 'UNRESOLVED_IMPORT') {
      throw new Error(
        `Unresolved import "${warning.source}" from "${warning.importer}". ` +
          `datefmt-lite must stay dependency-free; use a relative path or ` +
          `add a bundler plugin plus a real dependency.`,
      );
    }
    warn(warning);
  },
  plugins: [
    babel({
      babelHelpers: 'bundled',
      extensions,
      exclude: 'node_modules/**',
    }),
  ],
  output: [
    {
      file: 'dist/cjs/index.cjs',
      format: 'cjs',
      exports: 'named',
      plugins: [terser()],
    },
    {
      file: 'dist/esm/index.esm.js',
      format: 'esm',
      plugins: [terser()],
    },
  ],
};
