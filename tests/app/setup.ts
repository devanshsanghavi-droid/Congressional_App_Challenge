/**
 * Setup for the `app` Jest project.
 *
 * AUTHORSHIP: Claude. Test plumbing.
 *
 * React 19 requires `IS_REACT_ACT_ENVIRONMENT` to be set before it will let a
 * test renderer flush updates. `jest-expo`'s preset does not set it, and
 * without it `render()` returns an object with no `toJSON` and every query
 * fails with "`render` function has not been called" — which looks like a
 * broken test rather than a missing global.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
