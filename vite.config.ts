import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the built game can be served from any sub-path.
  base: './',
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
});
