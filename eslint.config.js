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
        __GIT_COMMIT_DATE__: 'readonly',
      },
    },
    rules: {
      // Promoted from warn to error: this rule is what catches a call to a
      // helper that does not exist, and the codebase is now clean under it.
      // It is not a style preference here — an undefined identifier inside an
      // async handler rejects silently, so the button renders, the click does
      // nothing, and no error reaches the user. That is exactly how the
      // `promptDialog` call in relinkEditExpenseReceipt shipped dead.
      // Anything genuinely global belongs in languageOptions.globals above.
      'no-undef': 'error',
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
      'gen_icons.cjs',
      'apps-script/**',
      'backend/**',
      'scripts/**',
    ],
  },
];
