export default [
  {
    ignores: [
      '**/dist/**',
      '**/.svelte-kit/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      'fixtures/**',
      'schemas/**'
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
