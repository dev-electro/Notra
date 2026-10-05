import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: { sourcemap: false, chunkSizeWarningLimit: 400 },
  test: { environment: 'jsdom', include: ['src/**/*.vtest.{ts,tsx}'], globals: false },
});