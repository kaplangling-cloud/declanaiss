// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'prisma/data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', __dirname: 'readonly', require: 'readonly', module: 'readonly' },
    },
    rules: {
      // Les DTO et les entites Prisma portent des champs optionnels a foison :
      // l'assertion non nulle est utilisee sciemment apres validation.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // `const { cniChiffre, ...reste } = d` sert a retirer les champs sensibles
      // des reponses : les variables extraites ne sont pas toujours utilisees.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  {
    // Scripts de seed et d'import : hors du tsconfig applicatif
    files: ['prisma/**/*.ts'],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.seed.json'], tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
