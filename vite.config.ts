import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = `http://127.0.0.1:${process.env.API_PORT || 8787}`;

/** GitHub Pages kennt keine App-Routen: 404.html = index.html, dann übernimmt der Router (z. B. /marktkueche/plan). */
const spaFallback = (): Plugin => ({
  name: 'spa-404',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve('dist');
    if (fs.existsSync(path.join(dist, 'index.html'))) fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
  },
});

export default defineConfig({
  // Auf GitHub Pages liegt die App in einem Unterordner (BASE_PATH=/marktkueche/), lokal unter /
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), spaFallback()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/images': api },
  },
  build: { chunkSizeWarningLimit: 800 },
});
