import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Política de contenido solo en el build: el servidor de desarrollo necesita scripts en línea y WebSocket.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const csp = {
  name: 'dgus-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  plugins: [react(), csp],
  base: './',
  // release/ y dist/ los escriben el empaquetado y el build: vigilarlos tumba el servidor (EBUSY).
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/release/**', '**/dist/**'] } },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node' },
} as never);
