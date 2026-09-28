import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      // Explicitly include unimported production files as zero coverage.
      include: ['src/**/*.{ts,tsx}', 'middleware.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.d.ts',
        'src/test/**',
        '**/__fixtures__/**',
        '**/fixtures/**',
      ],
      reporter: ['json-summary', 'text-summary'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
