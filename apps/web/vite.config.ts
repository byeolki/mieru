import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 3000;

const webPort = Number(process.env.PASEO_PORT ?? process.env.WEB_PORT ?? DEFAULT_WEB_PORT);
const apiPort = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    open: false,
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
  preview: { host: '127.0.0.1', port: webPort, strictPort: true, open: false },
});
