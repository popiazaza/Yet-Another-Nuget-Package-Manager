import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react()],
  build: {
    minify: 'esbuild',
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        webview: path.resolve(__dirname, 'src/webview/index.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        format: 'iife',
        sourcemap: false,
      },
    },
  },
  esbuild: {
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
