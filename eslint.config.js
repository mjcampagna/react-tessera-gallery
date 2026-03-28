import tseslint from 'typescript-eslint'

export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ['dist/', 'coverage/'],
  rules: {
    '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
})
