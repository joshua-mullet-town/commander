import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/movement-server.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  bundle: true,
  noExternal: [/.*/], // Bundle all dependencies
  esbuildOptions(options) {
    options.resolveExtensions = ['.ts', '.js', '.mjs', '.json'];
  },
});
