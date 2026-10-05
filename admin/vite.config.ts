import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin starts its own dev server, which clashes with vitest (mode 'test').
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'test' ? [] : [cloudflare()])],
  build: { sourcemap: false, chunkSizeWarningLimit: 400 },
  test: { environment: 'jsdom', include: ['src/**/*.vtest.{ts,tsx}'], globals: false },
}));