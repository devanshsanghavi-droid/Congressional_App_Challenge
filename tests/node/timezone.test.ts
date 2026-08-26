/**
 * The test suite's own timezone, asserted rather than assumed.
 *
 * AUTHORSHIP: Claude. App-side test infrastructure.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Several tests in this repo are claims about local calendar arithmetic, and a
 * few of them are only *meaningful* inside a zone that observes DST. The
 * spring-forward case in `vault.test.ts` asserts that a naive millisecond
 * division under-reports a 31-day span as 30. In UTC there is no lost hour, the
 * naive number is also 31, and the assertion fails.
 *
 * That is exactly what happened: `npm test` was green on a machine set to
 * Pacific and red anywhere else, and nobody found out because until CI existed
 * there was nowhere else. A suite whose result depends on the operator's
 * system settings is not a suite, it is an opinion.
 *
 * So the zone is pinned in `jest.config.js`. This file asserts the pin took
 * effect — the artifact, not the configuration. Deleting the pin fails a test
 * here, loudly, instead of quietly turning the DST case into a tautology that
 * passes for the wrong reason.
 */

const PINNED = 'America/Los_Angeles';

describe('test timezone', () => {
  it('is pinned, not inherited from the machine', () => {
    expect(process.env.TZ).toBe(PINNED);
  });

  it('is the zone the runtime actually resolved', () => {
    // process.env.TZ can be set after the first Date is constructed, in which
    // case some runtimes keep the old zone. Ask the runtime, not the variable.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(PINNED);
  });

  it('observes the spring-forward transition the date tests depend on', () => {
    // 08 Mar 2026, 02:00 -> 03:00 Pacific. If this ever stops being true, the
    // DST assertions elsewhere are no longer testing what they claim to test,
    // and this is where you find that out.
    const before = new Date(2026, 2, 8, 0, 0).getTimezoneOffset();
    const after = new Date(2026, 2, 9, 0, 0).getTimezoneOffset();
    expect(before - after).toBe(60);
  });

  it('puts local midnight at a non-zero UTC offset', () => {
    // The guard against someone "fixing" a future failure by pinning UTC: it
    // would make every local-midnight test pass trivially, because local
    // midnight and UTC midnight would be the same instant.
    expect(new Date(2026, 7, 24, 0, 0).getTimezoneOffset()).not.toBe(0);
  });
});
