// eslint.config.mjs
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Put ignore patterns here (flat config replaces .eslintignore)
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', '**/*.cpp', '**/*.ino'],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Project-wide settings & custom rules
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }
);
