import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/LocationTracker': {
          target: 'https://kv5zhpcr-7044.uks1.devtunnels.ms',
          changeOrigin: true,
          secure: false,
          ws: true,
          headers: {
            'X-Tunnel-Skip-Anti-Phishing-Page': 'true',
          },
        },
        '/storage': {
          target: 'https://kv5zhpcr-7044.uks1.devtunnels.ms',
          changeOrigin: true,
          secure: false,
          headers: {
            'X-Tunnel-Skip-Anti-Phishing-Page': 'true',
          },
        },
      },
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
    },
  };
});
