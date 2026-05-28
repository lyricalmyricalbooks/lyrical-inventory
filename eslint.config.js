// ESLint flat config for the lyrical-inventory app.
// Rules are deliberately conservative so the existing codebase passes today,
// while still catching genuine bugs (typo'd identifiers, accidental globals,
// loose equality on null checks, etc.).
import globals from 'globals';

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        // Libraries loaded from <script> tags in index.html.
        XLSX: 'readonly',
        QRCode: 'readonly',
        // Firebase compat-mode globals injected by /__/firebase scripts.
        firebase: 'readonly',
        Stripe: 'readonly',
      },
    },
    rules: {
      // Demoted to warn so it surfaces in lint output (e.g. broken
      // references to undefined helpers) without blocking CI on day one.
      'no-undef': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-implicit-globals': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'src/main.js.stable',
      'src/main.js.stable.txt',
      'patch.cjs',
      'patchAuth.cjs',
      'gen_icons.cjs',
      'make_transparent.cjs',
      'make_transparent.js',
      'newFunc.js',
      'apps-script/**',
      'backend/**',
      'scripts/**',
    ],
  },
];
