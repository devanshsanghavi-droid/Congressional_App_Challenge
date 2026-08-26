/**
 * The sanity pass over a generated explanation.
 *
 * AUTHORSHIP: Claude. App-side code under test.
 *
 * This suite grew teeth on 2026-08-24. The old version of this file tested a
 * backstop — the grammar forbade digits, so the check only had to catch what
 * form could not express. Measurement showed the ban made the model write
 * numbers as *letters*, which every test here passed, and "renew your Medi-Cal
 * coverage by October XXX XXX" reached a user.
 *
 * The ban is gone. This check is now the only thing between an unconstrained
 * 1.5B model and the screen, so these tests are written as attacks on it: each
 * one is a way a wrong number could get in front of someone.
 */

import {
  checkExplanation,
  parseSections,
} from '../../src/lib/llm/explain-check.ts';

/** The deadline as Notice Detail renders it, which is what the app passes in. */
const CONFIRMED = ['Saturday, September 5, 2026'];

describe('dates must trace back to something the user confirmed', () => {
  it('accepts the confirmed date written the same way', () => {
    const result = checkExplanation(
      'Send the form back by Saturday, September 5, 2026.',
      CONFIRMED,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts the confirmed date abbreviated', () => {
    // A real abbreviation of a real value. Withholding here would withhold most
    // correct explanations, because no model repeats "Saturday, " every time.
    expect(checkExplanation('Send it by September 5.', CONFIRMED).ok).toBe(true);
    expect(checkExplanation('Send it by September 5, 2026.', CONFIRMED).ok).toBe(true);
  });

  /**
   * The one that matters. `September 30` is the date on notice 02 and it is not
   * this notice's deadline — a model that conflates two notices, or reads the
   * effective date instead of the return-by date, produces exactly this.
   */
  it('rejects a plausible date that was not confirmed', () => {
    const result = checkExplanation('Send the form back by September 30, 2026.', CONFIRMED);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('unconfirmed-date');
  });

  it('rejects a numeric date that was not confirmed', () => {
    expect(checkExplanation('Due 09/30/2026.', CONFIRMED).problems).toContain('unconfirmed-date');
    expect(checkExplanation('Due 2026-09-30.', CONFIRMED).problems).toContain('unconfirmed-date');
  });

  it('accepts the confirmed date in ISO form', () => {
    expect(checkExplanation('Due 2026-09-05.', CONFIRMED).ok).toBe(true);
  });

  it('rejects every date when nothing was confirmed', () => {
    // The approval notice: no deadline was extracted, so no date may appear.
    // This is the 2026-08-20 fabrication case, checked from the other end.
    const result = checkExplanation('Your benefits start on August 15, 2026.', []);
    expect(result.problems).toContain('unconfirmed-date');
  });

  it('allows prose with no dates in it at all', () => {
    const result = checkExplanation(
      'This letter says your food benefits are being renewed. Send back the form.',
      [],
    );
    expect(result.ok).toBe(true);
  });

  /**
   * Amounts and durations are NOT dates and must survive. Forbidding them is
   * what the digit ban did, and it is why the model looped on 8 of 10 notices.
   */
  it('allows an amount and a duration', () => {
    const result = checkExplanation(
      'You will get $412 each month. Report changes within 10 days. You have 90 days to ask for a hearing.',
      CONFIRMED,
    );
    expect(result.ok).toBe(true);
  });

  it('matches a Spanish month name', () => {
    expect(checkExplanation('Antes del 30 de septiembre de 2026.', CONFIRMED).problems).toContain(
      'unconfirmed-date',
    );
    expect(checkExplanation('Antes del 5 de septiembre de 2026.', CONFIRMED).ok).toBe(true);
  });
});

describe('numbers written as letters', () => {
  /**
   * The live failure from 2026-08-24, kept as a regression guard. Under the
   * digit ban the model wrote these; without the ban it should not, but a model
   * that will not commit to a value still reaches for a placeholder shape, and
   * "October XXX XXX" reads to a hurried person as a date they cannot make out.
   */
  it('rejects the exact string that reached a user', () => {
    const result = checkExplanation(
      'You need to renew your Medi-Cal coverage by October XXX XXX.',
      CONFIRMED,
    );
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('letter-number');
  });

  it('rejects a masked phone number', () => {
    expect(
      checkExplanation('Ask for a hearing by calling XXX-XXX-XXXX.', CONFIRMED).problems,
    ).toContain('letter-number');
  });

  it('rejects other placeholder shapes', () => {
    for (const text of ['Due on NNN.', 'Call ###-####.', 'By ??? of next month.']) {
      expect(checkExplanation(text, CONFIRMED).problems).toContain('letter-number');
    }
  });

  it('does not fire on ordinary words containing x', () => {
    for (const text of ['Bring your tax papers.', 'Your next report is due.', 'Six months.']) {
      expect(checkExplanation(text, CONFIRMED).problems).not.toContain('letter-number');
    }
  });
});

describe('eligibility claims', () => {
  it('rejects telling the reader they do not qualify', () => {
    for (const text of [
      'You are not eligible for CalFresh.',
      'You do not qualify.',
      'You no longer qualify for benefits.',
      'Usted no califica.',
    ]) {
      expect(checkExplanation(text, CONFIRMED).problems).toContain('eligibility-claim');
    }
  });

  it('allows describing what the county decided', () => {
    // The letter's own decision is a fact about the letter, not a determination
    // Carta is making — an explanation that cannot say this cannot explain a
    // discontinuance at all.
    const result = checkExplanation('The county is stopping your food benefits.', CONFIRMED);
    expect(result.ok).toBe(true);
  });
});

describe('parsing the sections', () => {
  const good = 'SAYS: Your benefits are being renewed.\nDO: Send back the form.\nAPPEAL: Call your worker.';

  it('reads three labelled sections', () => {
    const sections = parseSections(good);
    expect(sections).toEqual({
      says: 'Your benefits are being renewed.',
      doing: 'Send back the form.',
      appeal: 'Call your worker.',
    });
  });

  it('returns undefined when a section is missing', () => {
    // How the degeneration loops were caught: the model never reached APPEAL.
    expect(parseSections('SAYS: Something.\nDO: Something else.')).toBeUndefined();
  });

  it('returns undefined when a section is present but empty', () => {
    expect(parseSections('SAYS: Something.\nDO: \nAPPEAL: Call.')).toBeUndefined();
  });

  /** There is no WHEN section any more, and its absence must not be a failure. */
  it('does not require a "when" section', () => {
    expect(parseSections(good)).toBeDefined();
  });
});
