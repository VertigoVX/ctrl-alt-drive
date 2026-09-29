import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → multi-file build for GitHub Pages.
// `npm run build:single` → one self-contained HTML file (handy for sharing a playable demo).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { include: ['src/core/**'], reporter: ['text', 'html'] },
  },
}));
