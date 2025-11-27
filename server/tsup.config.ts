import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/movement-server.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  bundle: true,
  // Don't bundle node_modules - let them be required at runtime
  external: [/node_modules/],
});
