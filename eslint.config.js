// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

/**
 * The rule that matters in this file is the `src/extraction/**` block.
 *
 * src/extraction/tsconfig.json already removes the DOM and all ambient types,
 * so extraction code cannot name `fetch` or `process`. That covers globals but
 * not module imports — `import { View } from 'react-native'` would still
 * resolve. This block closes that gap, so between the two, extraction code
 * physically cannot reach the platform or the network.
 *
 * Why bother enforcing it mechanically: the golden-corpus harness (SPEC §8.2)
 * runs the whole cascade in plain Node with no simulator and no camera. One
 * stray `react-native` import anywhere in the dependency graph breaks that, and
 * it breaks it at the worst possible time — when you are trying to measure
 * accuracy, not debug a bundler.
 */
module.exports = [
  ...expoConfig,

  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'ios/*', 'android/*'],
  },

  {
    // Config files and the Node-side scripts genuinely run in Node, so they get
    // Node globals. Everything else does not.
    files: ['*.config.js', 'tools/**/*.ts', 'tests/node/**/*.ts'],
    languageOptions: {
      globals: { __dirname: 'readonly', module: 'writable', require: 'readonly', process: 'readonly' },
    },
  },

  {
    files: ['src/extraction/**/*.ts', 'content/templates/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-native',
                'react-native/*',
                'react-native-*',
                'expo',
                'expo-*',
                '@expo/*',
                '@op-engineering/*',
                '@testing-library/*',
                'zustand',
                'i18next',
                'react-i18next',
                '@/lib/*',
                '@/components/*',
                '@/app/*',
              ],
              message:
                'src/extraction is a pure-TypeScript island (CLAUDE.md): no React, no native modules, no app-side imports. It has to run in plain Node against the golden corpus. Pass what you need in as an argument instead.',
            },
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'http', 'https', 'net', 'os', 'child_process'],
              message:
                'src/extraction may not use Node built-ins either — it runs both on-device and in Node, so it targets neither. File and crypto work belongs in src/lib; pass the result in as an argument.',
            },
          ],
        },
      ],
    },
  },
];
