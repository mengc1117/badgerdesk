import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    // Disable demo seeding; must be set here (import hoisting evaluates DEMO_MODE first)
    env: { BADGERDESK_DEMO: '0' },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Pure-logic modules
      include: ['lib/estimate.ts', 'lib/amenity.ts', 'lib/geo.ts', 'lib/hours.ts', 'lib/scoring.ts'],
    },
  },
});
