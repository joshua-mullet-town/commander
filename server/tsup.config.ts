import { defineConfig } from 'tsup';
import { esbuildPluginFilePathExtensions } from 'esbuild-plugin-file-path-extensions';

export default defineConfig({
  entry: ['src/movement-server.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  bundle: true,
  noExternal: [/.*/], // Bundle all dependencies
  esbuildPlugins: [esbuildPluginFilePathExtensions()],
});
