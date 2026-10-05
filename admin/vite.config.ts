import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false, chunkSizeWarningLimit: 400 },
  test: { environment: 'jsdom', include: ['src/**/*.vtest.{ts,tsx}'], globals: false },
});
