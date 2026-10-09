import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, isPreview }) => ({
  // Production builds (and `vite preview` of them) are served from GitHub Pages at
  // /dungeon-company/; the dev server uses /.
  base: command === 'build' || isPreview ? '/dungeon-company/' : '/',
  build: {
    // Phaser alone is ~1.2 MB minified; keep it in its own cached chunk.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
