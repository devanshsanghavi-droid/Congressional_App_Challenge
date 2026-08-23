/**
 * Carta metrics harness — the logic checks.
 *
 * AUTHORSHIP: Claude. Harness infrastructure.
 *
 * Two of the corpus's requirements are not about OCR at all, and scoring them
 * as though they were would hide them.
 *
 *   THE CHAIN.      Notices 01 and 02 are one household: Maria Reyes, case
 *                   01-4472-9931. Notice 02 is the discontinuance caused by the
 *                   SAR 7 that notice 01 asked for. The data model has to be
 *                   able to say that — a notice that refers back to an earlier
 *                   one on the same case — because that relationship is the
 *                   product's whole argument and it is the demo narrative.
 *
 *   THE APPROVAL.   Notice 10 is good news. No deadline, nothing required. The
 *                   app must not render a red countdown or schedule an urgent
 *                   reminder for it. An app that makes every letter look
 *                   frightening is not a deadline tracker, it is an anxiety
 *                   machine, and it would be worse than useless to someone who
 *                   already lives with this mail.
 *
 * Each check carries a positive control. "Notice 10 produces no red countdown"
 * passes trivially if the countdown never goes red for anything, so the same
 * run asserts that notice 01 *does* go red and notice 02 *does* schedule the
 * urgent aid-paid-pending tier.
 */

import type { Corpus, NoticeTruth } from './corpus.ts';
import { APPROVAL_NOTICE, CASE_CHAIN } from './corpus.ts';
import { countdownTier, isUrgent, remindersFor } from '../../src/lib/urgency.ts';
import type { ActionType, NoticeDates } from '../../src/lib/urgency.ts';

export interface Check {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** Ground-truth ISO date to epoch millis at local midnight (CLAUDE.md §9). */
export function isoToLocalMs(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`not an ISO date: ${iso}`);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
}

function field(notice: NoticeTruth, key: string): string | undefined {
  const value = notice.fields[key];
  return typeof value === 'string' ? value : undefined;
}

/** The confirmed-dates view of a ground-truth notice. */
export function datesOf(notice: NoticeTruth): NoticeDates {
  const deadline = field(notice, 'deadline_date');
  const app = field(notice, 'aid_paid_pending_deadline');
  const appeal = field(notice, 'appeal_deadline');
  return {
    actionType: notice.action_type as ActionType,
    ...(deadline === undefined ? {} : { deadlineDate: isoToLocalMs(deadline) }),
    ...(app === undefined ? {} : { aidPaidPendingDeadline: isoToLocalMs(app) }),
    ...(appeal === undefined ? {} : { appealDeadline: isoToLocalMs(appeal) }),
  };
}

function require(notice: NoticeTruth | undefined, id: string): NoticeTruth {
  if (!notice) throw new Error(`ground truth has no notice ${id}`);
  return notice;
}

// ------------------------------------------------------------------- chain

export interface ChainResult {
  readonly checks: readonly Check[];
  /** Corpus defects found while checking — reported, not silently tolerated. */
  readonly warnings: readonly string[];
}

export function checkCaseChain(corpus: Corpus): ChainResult {
  const cause = require(corpus.notices.get(CASE_CHAIN.cause), CASE_CHAIN.cause);
  const consequence = require(corpus.notices.get(CASE_CHAIN.consequence), CASE_CHAIN.consequence);

  const causeCase = field(cause, 'case_number');
  const consequenceCase = field(consequence, 'case_number');
  const checks: Check[] = [
    {
      name: 'same case number',
      passed: causeCase === CASE_CHAIN.caseNumber && consequenceCase === CASE_CHAIN.caseNumber,
      detail: `01=${String(causeCase)} 02=${String(consequenceCase)} expected ${CASE_CHAIN.caseNumber}`,
    },
    {
      name: 'same recipient',
      passed:
        field(cause, 'recipient_name') === CASE_CHAIN.recipient &&
        field(consequence, 'recipient_name') === CASE_CHAIN.recipient,
      detail: CASE_CHAIN.recipient,
    },
    {
      name: 'cause is a report request, consequence is a discontinuance',
      passed: cause.action_type === 'recert_due' && consequence.action_type === 'discontinuance',
      detail: `01=${cause.action_type} 02=${consequence.action_type}`,
    },
    {
      name: 'consequence names the cause’s form in its reason',
      passed: (field(consequence, 'reason') ?? '').includes(CASE_CHAIN.viaForm),
      detail: `reason="${String(field(consequence, 'reason'))}" form=${cause.form_id}`,
    },
  ];

  // The chronology the narrative depends on, checked rather than assumed.
  const warnings: string[] = [];
  const causeDeadline = field(cause, 'deadline_date');
  const consequenceNoticeDate = field(consequence, 'notice_date');
  if (causeDeadline !== undefined && consequenceNoticeDate !== undefined) {
    if (consequenceNoticeDate < causeDeadline) {
      warnings.push(
        `Notice 02 is dated ${consequenceNoticeDate} but its stated reason is that the ` +
          `SAR 7 due ${causeDeadline} was not returned. A notice cannot report a failure ` +
          'to meet a deadline that has not arrived yet. The corpus is internally ' +
          'inconsistent here — see NOTES.md for the corrected dates if it is ever regenerated.',
      );
    }
  }

  return { checks, warnings };
}

// ---------------------------------------------------------------- approval

export interface ApprovalResult {
  readonly checks: readonly Check[];
  readonly clockMs: number;
}

/**
 * The approval assertion, with its positive controls.
 *
 * Clocks are chosen per notice so each check is evaluated where it is
 * meaningful: two days before notice 01's deadline (which must be red), inside
 * notice 02's aid-paid-pending window (which must schedule the urgent tier),
 * and the day after notice 10 was issued (which must be quiet).
 */
export function checkApproval(corpus: Corpus): ApprovalResult {
  const approval = require(corpus.notices.get(APPROVAL_NOTICE), APPROVAL_NOTICE);
  const dates = datesOf(approval);
  const clock = new Date(2026, 7, 13, 9, 0, 0, 0).getTime(); // day after it was issued
  const tier = countdownTier(dates, clock);
  const reminders = remindersFor(dates, clock);

  const checks: Check[] = [
    {
      name: 'approval: countdown is not red',
      passed: tier !== 'red',
      detail: `tier=${tier}`,
    },
    {
      name: 'approval: no countdown at all',
      passed: tier === 'none',
      detail: `tier=${tier} (no deadline_date and no aid-paid-pending date on this notice)`,
    },
    {
      name: 'approval: no urgent reminder',
      passed: !reminders.some((r) => r.urgent),
      detail: `${reminders.length} reminders scheduled`,
    },
    {
      name: 'approval: no reminders at all',
      passed: reminders.length === 0,
      detail: `appeal_deadline=${String(field(approval, 'appeal_deadline'))}, ` +
        `certification_end=${String(field(approval, 'certification_end'))} — ` +
        'neither may schedule anything',
    },
    {
      name: 'approval: not urgent',
      passed: !isUrgent(dates, clock),
      detail: `tier=${tier}`,
    },
  ];

  // --- positive controls: the same functions must fire when they should ---
  const sar7 = require(corpus.notices.get('01'), '01');
  const redClock = new Date(2026, 8, 3, 9, 0, 0, 0).getTime(); // 2 days before Sept 5
  const redTier = countdownTier(datesOf(sar7), redClock);
  checks.push({
    name: 'control: notice 01 two days out IS red',
    passed: redTier === 'red',
    detail: `tier=${redTier} at 2026-09-03 for a 2026-09-05 deadline`,
  });

  const discontinuance = require(corpus.notices.get('02'), '02');
  const urgentClock = new Date(2026, 8, 1, 8, 0, 0, 0).getTime(); // inside the APP window
  const urgentReminders = remindersFor(datesOf(discontinuance), urgentClock);
  checks.push({
    name: 'control: notice 02 DOES schedule the urgent aid-paid-pending tier',
    passed: urgentReminders.some((r) => r.urgent),
    detail: `${urgentReminders.filter((r) => r.urgent).length} urgent of ${urgentReminders.length}`,
  });

  return { checks, clockMs: clock };
}
