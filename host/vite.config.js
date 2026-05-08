import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    ...federation({
      name: 'host',
      remotes: {
        remote: {
          type: 'module',
          name: 'remote',
          entry: 'http://localhost:5174/remoteEntry.js',
          dts: false,
        },
      },
      shared: {
        react: { singleton: true, requiredVersion: '19.2.5' },
        'react-dom': { singleton: true, requiredVersion: '19.2.5' },
      },
      dts: false,
    }),
    react(),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: 'esnext' },
});
