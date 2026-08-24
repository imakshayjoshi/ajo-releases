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
    outDir: '../pikashow-tv-build'
  },
  server: {
    port: 3000,
    host: true
  }
});
