// Lint rules — the compat seam is enforced here, not by convention
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.{ts,tsx}', 'proxy/**/*.ts', 'test/**/*.ts'],
		plugins: { 'react-hooks': reactHooks },
		rules: {
			...reactHooks.configs.recommended.rules,
			// The unused-vars default flags intentionally-ignored destructured rest.
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				ignoreRestSiblings: true,
			}],
		},
	},
	{
		// The whole point of src/compat is that @sanity/ui and @sanity/icons are
		// reached through one seam. Thirteen names bypassed it once and would have
		// stopped the Studio booting on the next major; a rule prevents the class
		// rather than catching it in review.
		files: ['src/**/*.{ts,tsx}'],
		ignores: ['src/compat/**'],
		rules: {
			'no-restricted-imports': ['error', {
				paths: [
					{
						name: '@sanity/ui',
						message: 'Import from ../compat instead — a relocated export must degrade, not fail to link.',
					},
					{
						name: '@sanity/icons',
						message: 'Import from ../icons instead — icons v5 removed the named exports from the barrel.',
					},
				],
				patterns: [
					{
						group: ['@sanity/ui/*', '@sanity/icons/*'],
						message: 'Subpath imports do not exist before @sanity/ui v4 / @sanity/icons v4.1 — use the compat seam.',
					},
				],
			}],
		},
	},
)
