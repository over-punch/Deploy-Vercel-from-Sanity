// Test configuration — unit tests only; nothing here ships in the package
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		environment: 'node',
	},
})
