import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'

/**
 * ESLint en formato «flat config» (el único que existe en ESLint 10).
 *
 * Regla del proyecto: NADA de `any`. Lo vigila typescript-eslint.
 * El formato de código lo manda Prettier; aquí solo van reglas de corrección.
 */
export default ts.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.svelte-kit/**', 'bench/results/**'],
  },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  // Apaga las reglas de estilo que chocan con Prettier (lo formatea él).
  ...svelte.configs.prettier,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Soporte de `<script lang="ts">` dentro de los ficheros .svelte
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },

  {
    rules: {
      // TypeScript ya comprueba los identificadores; `no-undef` da falsos positivos.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // El proyecto es estricto: un `any` explícito hay que justificarlo.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)
