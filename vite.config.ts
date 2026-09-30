import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

// A short build label (commit + date) shown in Settings, so it's obvious which version is running.
function buildLabel(): string {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  return `${sha} · ${new Date().toISOString().slice(0, 10)}`;
}

// `npm run build` → multi-file build for GitHub Pages.
// `npm run build:single` → one self-contained HTML file (handy for sharing a playable demo).
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __BUILD__: JSON.stringify(buildLabel()) },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { include: ['src/core/**'], reporter: ['text', 'html'] },
  },
}));
