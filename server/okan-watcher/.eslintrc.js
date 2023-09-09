module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  extends: ['plugin:@typescript-eslint/recommended'],
  rules: {
    semi: ['error', 'never'],
    'brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
    'comma-dangle': ['error', 'always-multiline'],
    quotes: ['error', 'single', { avoidEscape: true }],
  },
}
