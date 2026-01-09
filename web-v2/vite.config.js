import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testSvgsDir = path.resolve(__dirname, 'api/test_svgs');

// Plugin to serve test SVG file list and files
function testSvgsPlugin() {
  return {
    name: 'test-svgs',
    configureServer(server) {
      // API endpoint to list SVG files
      server.middlewares.use('/api/test-svgs', (req, res) => {
        try {
          if (!fs.existsSync(testSvgsDir)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ files: [], exists: false }));
            return;
          }
          const files = fs.readdirSync(testSvgsDir)
            .filter(f => f.endsWith('.svg'))
            .sort();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files, exists: true }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // Serve SVG files from test_svgs directory
      server.middlewares.use('/test_svgs', (req, res, next) => {
        const filePath = path.join(testSvgsDir, decodeURIComponent(req.url));
        if (fs.existsSync(filePath) && filePath.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml');
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig({
  root: '.',
  plugins: [testSvgsPlugin()],
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
