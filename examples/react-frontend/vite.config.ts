import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Option A: proxy via your backend (examples/express-backend)
      '/api': {
        target: 'http://localhost:4000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Option B: call survey-engine directly (useful for prototypes / internal tools)
      '/survey-engine': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/survey-engine/, ''),
      },
    },
  },
});
