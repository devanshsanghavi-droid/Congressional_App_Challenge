/**
 * The explanation sanity pass.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * CLAUDE.md §4's guardrails are the reason this file exists. Three of the five
 * are checkable in code and every one of them protects against a specific way
 * this feature could hurt someone: telling them they are ineligible when they
 * are not, or stating a deadline that is not on their letter.
 */

import {
  checkExplanation,
  parseSections,
  substitute,
} from '../../src/lib/llm/explain-check.ts';

describe('guardrail 4 — never tell someone they do not qualify', () => {
  it.each([
    'You are not eligible for CalFresh.',
    'This means you are ineligible.',
    'You do not qualify any more.',
    'You no longer qualify for this help.',
    'Usted no califica para este programa.',
  ])('withholds: %s', (text) => {
    const result = checkExplanation(text, []);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('eligibility-claim');
  });

  it('allows describing what the county decided, which is not the same claim', () => {
    // The letter itself says benefits are stopping. Reporting that is the whole
    // job; what is forbidden is Carta concluding the reader is ineligible.
    const text = 'The county says your food benefits will stop. You can ask for a hearing.';
    expect(checkExplanation(text, []).ok).toBe(true);
  });
});

describe('guardrail 3 and 5 — no number that the user did not confirm', () => {
  it('accepts a date the user confirmed', () => {
    const text = 'Send the form back by September 5, 2026.';
    expect(checkExplanation(text, ['September 5, 2026']).ok).toBe(true);
  });

  it('withholds a date the user never confirmed', () => {
    // The grammar forbids the model writing digits at all, so a number here
    // arrived through substitution — this catches a substitution bug just as
    // surely as it would catch a fabrication.
    const text = 'Send the form back by September 30, 2026.';
    const result = checkExplanation(text, ['September 5, 2026']);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('unconfirmed-number');
  });

  it('withholds a placeholder that was never filled', () => {
    const result = checkExplanation('Send it back by {deadline}.', []);
    expect(result.problems).toContain('unfilled-placeholder');
  });

  it('is clean when the explanation states no date at all', () => {
    // The empty case: a notice with no deadline should produce prose that says
    // so, and that must pass rather than be treated as suspicious.
    const text = 'This letter does not give you a date to act by.';
    expect(checkExplanation(text, []).ok).toBe(true);
  });
});

describe('sections', () => {
  const raw = [
    'SAYS: Your food benefits are going to stop.',
    'DO: Send back the form they asked for.',
    'WHEN: Before September 5, 2026.',
    'APPEAL: You can ask for a hearing.',
  ].join('\n');

  it('parses four labelled sections', () => {
    expect(parseSections(raw)).toEqual({
      says: 'Your food benefits are going to stop.',
      doing: 'Send back the form they asked for.',
      when: 'Before September 5, 2026.',
      appeal: 'You can ask for a hearing.',
    });
  });

  it('returns nothing when a section is missing', () => {
    // A partial explanation is a stub, and CLAUDE.md §10 says cut a stub rather
    // than ship it. Returning three-quarters of an answer is not an option.
    const missing = raw.split('\n').slice(0, 3).join('\n');
    expect(parseSections(missing)).toBeUndefined();
  });

  it('returns nothing when a section is present but empty', () => {
    expect(parseSections(raw.replace('APPEAL: You can ask for a hearing.', 'APPEAL:'))).toBeUndefined();
  });
});

describe('substitution', () => {
  it('fills known placeholders and leaves unknown ones visible', () => {
    // Left visible on purpose: `checkExplanation` then flags it and the whole
    // explanation is withheld. Silently deleting it would ship a sentence with
    // a hole in it.
    const filled = substitute('Send by {deadline} to {office}. {mystery}', {
      deadline: 'September 5, 2026',
      office: 'Santa Clara County',
    });
    expect(filled).toBe('Send by September 5, 2026 to Santa Clara County. {mystery}');
    expect(checkExplanation(filled, ['September 5, 2026']).problems).toContain('unfilled-placeholder');
  });
});
