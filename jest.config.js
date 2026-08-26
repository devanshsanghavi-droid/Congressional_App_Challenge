/**
 * Two test projects, deliberately separated.
 *
 *   node — a bare Node environment with no React Native anywhere in it. This is
 *          where src/extraction and the /tools corpus scripts are tested. There
 *          is intentionally NO moduleNameMapper for `react-native` here: if
 *          extraction code ever grows a native import, these tests fail with a
 *          module-not-found error rather than being quietly shimmed. That
 *          failure is the point. It is the same rule as src/extraction/tsconfig.json
 *          and eslint.config.js, enforced a third way, at runtime.
 *
 *   app  — jest-expo's iOS preset for components, storage, and the pipeline
 *          gates in /tests (including no-network.test.ts, SPEC §8.4). iOS
 *          because iOS is the primary target (CLAUDE.md).
 *
 * TIMEZONE. Pinned below, not inherited. Carta's date semantics are local —
 * a deadline is local midnight, an age is whole calendar days — so several
 * tests are only meaningful inside a zone that observes DST. The spring-forward
 * case in tests/node/vault.test.ts asserts that a naive millisecond division
 * reports 30 where the calendar says 31; in UTC there is no lost hour, the
 * naive version is also 31, and that assertion fails. It failed for weeks
 * without anyone seeing it, because it only fails somewhere other than a
 * machine set to Pacific — which, until CI existed, was nowhere.
 *
 * America/Los_Angeles because that is where the notices in the corpus are
 * mailed from and where the app is used. `tests/node/timezone.test.ts` asserts
 * the pin is actually in effect, so deleting this line fails a test rather than
 * silently turning the DST case into a tautology.
 *
 * Run both with `npm test`, or one with `npm run test:node` / `npm run test:app`.
 * The node project is the fast one — it needs no simulator and no camera, which
 * is what makes the golden-corpus loop (SPEC §8.2) quick enough to actually use
 * while iterating on templates.
 */

process.env.TZ = 'America/Los_Angeles';

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: { name: 'node', color: 'cyan' },
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: [
        '<rootDir>/src/extraction/**/*.test.ts',
        '<rootDir>/content/**/*.test.ts',
        '<rootDir>/tools/**/*.test.ts',
        '<rootDir>/tests/node/**/*.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': [
          'babel-jest',
          {
            // No babel-preset-expo here on purpose — that preset exists to make
            // React Native code work, and none of this code is React Native.
            // Strip the types, turn ESM into CJS for Jest, and nothing else.
            babelrc: false,
            configFile: false,
            presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: true }]],
            plugins: ['@babel/plugin-transform-modules-commonjs'],
          },
        ],
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
    },

    {
      displayName: { name: 'app', color: 'magenta' },
      preset: 'jest-expo/ios',
      rootDir: __dirname,
      // React 19 will not flush a test render without this global; see the file.
      setupFilesAfterEnv: ['<rootDir>/tests/app/setup.ts'],
      testMatch: [
        '<rootDir>/src/app/**/*.test.tsx',
        '<rootDir>/src/components/**/*.test.tsx',
        '<rootDir>/src/lib/**/*.test.ts',
        // tests/app, not tests/** — tests/node belongs to the bare-Node project
        // above, and jest-expo's React Native setup files cannot parse under
        // this project's transform anyway.
        '<rootDir>/tests/app/**/*.test.ts',
        '<rootDir>/tests/app/**/*.test.tsx',
      ],
    },
  ],
};
