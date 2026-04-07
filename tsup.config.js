import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.js'],
  format: ['esm'],
  target: 'node18',
  bundle: true,
  outDir: 'dist',
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: false,
  esbuildOptions(options) {
    options.platform = 'node';
    options.loader = { '.js': 'jsx', '.jsx': 'jsx' };
    options.jsx = 'automatic';
  },
});
