import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup.js'],
    include: ['test/unit/**/*.test.js'],
    globals: true,
  },
})
