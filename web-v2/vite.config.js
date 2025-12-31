import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  server: {
    port: 3001,
    open: true,
    hmr: false,  // Disable hot module replacement to prevent unwanted reloads during long processing
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  }
});
