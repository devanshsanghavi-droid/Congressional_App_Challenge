/**
 * Babel — for Jest only.
 *
 * AUTHORSHIP: Claude. Build plumbing.
 *
 * Metro does not need this file: Expo SDK 57 applies `babel-preset-expo` to the
 * app bundle by default, which is why the app has always built without one.
 * **Jest does.** `jest-expo`'s iOS preset loads React Native's own
 * `jest/setup.js`, which is written in Flow, and without a preset that strips
 * Flow the whole `app` project failed to parse before a single test ran:
 *
 *     SyntaxError: value(id: TimeoutID): void  — Unexpected token
 *
 * That is why `tests/app/` was empty. The project was configured in
 * `jest.config.js` and never executed once, so `npm test` reported green while
 * covering zero React components. Fourth instance in this repo of "configuring
 * a thing is not verifying it happened" (CLAUDE.md §13).
 *
 * The bare-Node project does not use this file — it declares its own inline
 * transform, deliberately, so that extraction code cannot be quietly shimmed
 * with React Native's globals.
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
