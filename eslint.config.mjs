import { fixupPluginRules } from '@eslint/compat';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const typeCheckedRules = {
  ...tseslint.configs['recommended-type-checked'].rules,
  ...tseslint.configs['strict-type-checked'].rules,
  ...tseslint.configs['stylistic-type-checked'].rules,
};

const typedFiles = [
  'apps/desktop/**/*.{ts,tsx}',
  'tests/**/*.{ts,tsx}',
  '*.config.ts',
];

export default [
  {
    ignores: [
      'archive/**',
      'demos/**',
      'design-specs/**',
      'node_modules/**',
      'out/**',
      '**/out/**',
      '.webpack/**',
      '**/.webpack/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'tests/e2e/test-output/**',
      'tests/prototype/**',
    ],
  },
  {
    files: typedFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: ['./apps/desktop/tsconfig.json', './tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: typeCheckedRules,
  },
  {
    files: [
      'apps/desktop/src/main/**/*.{ts,tsx}',
      'apps/desktop/src/preload/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
      '*.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      react: fixupPluginRules(react),
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    files: [
      '*.config.{js,mjs,cjs}',
      'tools/design-*.mjs',
      'tests/design-sync/*.mjs',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
    },
  },
];
