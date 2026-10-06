/**
 * Every reminder states the days left to the date it was built from.
 *
 * AUTHORSHIP: Claude. App-side tests.
 *
 * ---------------------------------------------------------------------------
 * THE TRAP THIS GUARDS
 * ---------------------------------------------------------------------------
 * The ladder fires each tier at the right time; `remindersFor` builds the
 * hearing tier from `aidPaidPendingDeadline` and the ordinary tiers from
 * `deadlineDate`. But the body was counted to one date for the whole ladder —
 * `deadlineDate ?? aidPaidPendingDeadline` — so on a notice carrying both, the
 * hearing reminder told the user they had days they did not have.
 *
 * Notice 02 in the corpus is that notice: a SAR 7 due 30 Sep and a hearing to
 * request by 18 Sep. Its reminder two days before the hearing date said
 * "14 days left to ask for a hearing". Found by a review of the web version,
 * which vendors this code, on 2026-10-06. The urgency tests never saw it: they
 * test when reminders fire, and nothing tested what they say.
 */

const mockSchedule = jest.fn<Promise<string>, [unknown]>();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: (request: unknown) => mockSchedule(request),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import i18n from '../../src/lib/i18n';
import { scheduleForNotice } from '../../src/lib/notifications/index.ts';

interface Request {
  content: { title: string; body: string; data: { tier: string } };
  trigger: { date: Date };
}

function local(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}

// Notice 02: discontinuance, SAR 7 due 30 Sep, aid paid pending until 18 Sep.
const NOTICE_02 = {
  actionType: 'discontinuance' as const,
  deadlineDate: local(2026, 9, 30),
  aidPaidPendingDeadline: local(2026, 9, 18),
};

async function schedule(dates: typeof NOTICE_02 | Omit<typeof NOTICE_02, 'deadlineDate'>) {
  mockSchedule.mockClear();
  let n = 0;
  mockSchedule.mockImplementation(() => Promise.resolve(`os-${n++}`));
  await scheduleForNotice({
    noticeId: 'n02',
    dates,
    programName: 'CalFresh',
    nowMs: local(2026, 8, 25),
  });
  return mockSchedule.mock.calls.map(([request]) => request as Request);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('a notice with both a form deadline and a hearing deadline', () => {
  it('counts each hearing reminder to the hearing date, not the form date', async () => {
    const urgent = (await schedule(NOTICE_02)).filter(
      (r) => r.content.data.tier === 'appeal_urgent',
    );

    expect(urgent.map((r) => r.content.body)).toEqual([
      '2 days left to ask for a hearing and keep CalFresh while you wait.',
      '1 day left to ask for a hearing and keep CalFresh while you wait.',
    ]);
  });

  it('still counts the ordinary reminders to the form deadline', async () => {
    const ordinary = (await schedule(NOTICE_02)).filter(
      (r) => r.content.data.tier !== 'appeal_urgent',
    );

    expect(ordinary.map((r) => r.content.title)).toEqual([
      'CalFresh: 30 days left',
      'CalFresh: 14 days left',
      'CalFresh: 7 days left',
      'CalFresh: 3 days left',
      'CalFresh: 1 day left',
      'CalFresh is due today',
    ]);
  });

  it('states the same number in Spanish', async () => {
    await i18n.changeLanguage('es');
    try {
      const urgent = (await schedule(NOTICE_02)).filter(
        (r) => r.content.data.tier === 'appeal_urgent',
      );
      expect(urgent.map((r) => r.content.body)).toEqual([
        'Quedan 2 días para pedir una audiencia y mantener CalFresh mientras espera.',
        'Queda 1 día para pedir una audiencia y mantener CalFresh mientras espera.',
      ]);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('a notice with only a hearing deadline', () => {
  it('counts to the hearing date, as before', async () => {
    const { deadlineDate: _unused, ...hearingOnly } = NOTICE_02;
    const bodies = (await schedule(hearingOnly)).map((r) => r.content.body);

    expect(bodies).toEqual([
      '2 days left to ask for a hearing and keep CalFresh while you wait.',
      '1 day left to ask for a hearing and keep CalFresh while you wait.',
    ]);
  });
});
