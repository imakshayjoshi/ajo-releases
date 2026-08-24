import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 49', 'android >= 5', 'safari >= 10'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
      modernPolyfills: true
    })
  ],
  build: {
    target: ['es2015', 'chrome49'],
    cssTarget: 'chrome49',
    minify: 'terser',
    outDir: '../pikashow-tv-build',
    emptyOutDir: true // v3.11.0: outDir sits outside the project root, so
    // vite would otherwise skip cleaning it and every rebuild would ship all
    // stale JS chunks in the APK (the "app got heavy" bug).
  },
  server: {
    port: 3000,
    host: true
  }
});
