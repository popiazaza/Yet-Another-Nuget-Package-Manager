import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react()],
  esbuild: {
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
  build: {
    target: 'esnext',
    lib: {
      entry: {
        extension: path.resolve(__dirname, 'src/extension/extension.ts'),
        webview: path.resolve(__dirname, 'src/webview/index.tsx'),
      },
      formats: ['es'],
    },
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      external: ['vscode'],
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
