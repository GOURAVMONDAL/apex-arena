import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  define: { __APEX_STATIC__: 'true' },
  build: { outDir: 'dist-pages', emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
