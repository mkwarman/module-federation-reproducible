import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    ...federation({
      name: 'remote',
      filename: 'remoteEntry.js',
      exposes: {
        './Widget': './src/Widget.jsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '19.2.5' },
        'react-dom': { singleton: true, requiredVersion: '19.2.5' },
      },
      dts: false
    }),
    react(),
  ],
  server: { port: 5174, strictPort: true, cors: true },
  preview: { port: 5174, strictPort: true, cors: true },
  build: { target: 'esnext' },
});
