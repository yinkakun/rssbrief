import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import prettierConfig from 'eslint-config-prettier';
import hooksPlugin from 'eslint-plugin-react-hooks';
import tanstackQueryPlugin from '@tanstack/eslint-plugin-query';
import tanstackRouterPlugin from '@tanstack/eslint-plugin-router';

export default tseslint.config(
  {
    ignores: ['**/*.config.*', 'routetree.gen.ts'],
  },
  {
    files: ['**/*.js', '**/*.ts', '**/*.tsx'],
    extends: [
      prettierConfig,
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tanstackQueryPlugin.configs['flat/recommended'],
      tanstackRouterPlugin.configs['flat/recommended'],
    ],
    plugins: {
      react: reactPlugin,
      'react-hooks': hooksPlugin,
    },
    rules: {
      ...hooksPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      '@typescript-eslint/no-unused-vars': 'off',
    },
    languageOptions: {
      globals: {
        React: 'writable',
      },
    },
  },
);
