import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/index.js',
    output: { file: 'dist/cjs/index.cjs.js', format: 'cjs', exports: 'named' },
    plugins: [
      // 1) let Rollup resolve ./compiler.js, ./parser.js, etc.
      resolve({ extensions: ['.js', '.mjs'] }),
      // 2) convert any CommonJS deps (if you ever import one)
      commonjs(),
      // 3) transpile (but keep import/export intact)
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.mjs'],
        exclude: 'node_modules/**',
      }),
      // 4) minify
      terser(),
    ],
  },
  {
    input: 'src/index.js',
    output: { file: 'dist/esm/index.esm.js', format: 'esm' },
    plugins: [
      resolve({ extensions: ['.js', '.mjs'] }),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.mjs'],
        exclude: 'node_modules/**',
      }),
      terser(),
    ],
  },
];
