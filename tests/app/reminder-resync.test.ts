/**
 * Reminders dropped for want of permission must come back when it is granted.
 *
 * AUTHORSHIP: Claude. App-side tests.
 *
 * ---------------------------------------------------------------------------
 * THE TRAP THIS GUARDS
 * ---------------------------------------------------------------------------
 * Found on a physical iPhone, 2026-08-26. Three *correct* behaviours compose
 * into a state with no exit:
 *
 *   1. A notice saved before notification permission exists schedules its
 *      ladder, and iOS keeps none of it.
 *   2. `reconcileWithOs` marks every one of them `cancelled` — correctly. That
 *      is the 2026-08-25 fix working.
 *   3. Home reads `remindersActive` as `COUNT(*) WHERE state = 'scheduled'`, so
 *      it says "reminders are not set" — accurately.
 *
 * Grant permission afterwards and **nothing re-evaluates**. The count never
 * recovers and the warning never clears; the only escape was to delete the
 * notice and photograph it again.
 *
 * No single one of those three is a bug, which is why nothing caught it. The
 * bug is the absence of a fourth thing.
 */

const mockHasPermission = jest.fn<Promise<boolean>, []>();
const mockScheduleForNotice = jest.fn();
const mockCancel = jest.fn();
const mockListActiveNotices = jest.fn();
const mockPendingOsIds = jest.fn();
const mockMarkCancelled = jest.fn();
const mockRecordScheduled = jest.fn();
const mockGetStringSetting = jest.fn();

jest.mock('../../src/lib/notifications/index.ts', () => ({
  hasPermission: () => mockHasPermission(),
  scheduleForNotice: (...args: unknown[]) => mockScheduleForNotice(...args),
  cancel: (...args: unknown[]) => mockCancel(...args),
}));

jest.mock('../../src/lib/db/reminders.ts', () => ({
  pendingOsIds: (...args: unknown[]) => mockPendingOsIds(...args),
  markCancelled: (...args: unknown[]) => mockMarkCancelled(...args),
  recordScheduled: (...args: unknown[]) => mockRecordScheduled(...args),
}));

jest.mock('../../src/lib/db/notices.ts', () => ({
  listActiveNotices: () => mockListActiveNotices(),
  datesOf: (notice: Record<string, unknown>) => ({
    actionType: notice['actionType'],
    ...(notice['deadlineDate'] === undefined ? {} : { deadlineDate: notice['deadlineDate'] }),
  }),
}));

jest.mock('../../src/lib/db/settings.ts', () => ({
  SETTINGS: { reminderHour: 'reminderHour' },
  getStringSetting: (...args: unknown[]) => mockGetStringSetting(...args),
}));

import { resyncDroppedReminders } from '../../src/lib/reschedule.ts';

const DEADLINE = new Date(2026, 8, 5).getTime();

/** A notice whose reminders iOS refused: has a deadline, has no live reminders. */
const stranded = {
  id: 'n_stranded',
  actionType: 'recert_due',
  deadlineDate: DEADLINE,
  remindersActive: false,
  programId: 'CalFresh',
};

const healthy = { ...stranded, id: 'n_healthy', remindersActive: true };

/** No date to count down to, so there is nothing to schedule and never was. */
const dateless = {
  id: 'n_dateless',
  actionType: 'recert_due',
  remindersActive: false,
  programId: 'CalFresh',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPendingOsIds.mockResolvedValue([]);
  mockMarkCancelled.mockResolvedValue(undefined);
  mockRecordScheduled.mockResolvedValue(undefined);
  mockCancel.mockResolvedValue(undefined);
  mockGetStringSetting.mockResolvedValue(undefined);
  mockScheduleForNotice.mockResolvedValue([
    { tier: 't7', fireAt: DEADLINE, urgent: false, osNotificationId: 'os-1' },
  ]);
});

describe('resyncDroppedReminders', () => {
  it('does nothing at all when permission is still refused', async () => {
    mockHasPermission.mockResolvedValue(false);
    mockListActiveNotices.mockResolvedValue([stranded]);

    expect(await resyncDroppedReminders()).toBe(0);
    // The important half: it must not schedule into a permission that does not
    // exist, which is the failure the 2026-08-25 entry is about.
    expect(mockScheduleForNotice).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('never asks iOS for permission itself', async () => {
    // A permission dialog appearing on app foreground, outside anything the user
    // initiated, would be its own bug. `hasPermission()` only reads; the module
    // must not reach for `requestPermission()`.
    const source = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'src/lib/reschedule.ts'),
      'utf8',
    ) as string;
    expect(source).not.toContain('requestPermission');
  });

  it('re-schedules a notice whose reminders were dropped', async () => {
    mockHasPermission.mockResolvedValue(true);
    mockListActiveNotices.mockResolvedValue([stranded]);

    expect(await resyncDroppedReminders()).toBe(1);
    expect(mockScheduleForNotice).toHaveBeenCalledTimes(1);
    expect(mockRecordScheduled).toHaveBeenCalledWith('n_stranded', expect.any(Array));
  });

  it('leaves healthy notices alone, so foregrounding does not churn the OS queue', async () => {
    mockHasPermission.mockResolvedValue(true);
    mockListActiveNotices.mockResolvedValue([healthy]);

    expect(await resyncDroppedReminders()).toBe(0);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockScheduleForNotice).not.toHaveBeenCalled();
  });

  it('ignores a notice with no date to count down to', async () => {
    // `remindersActive` is false here and always will be. Rescheduling it every
    // time the app foregrounds would be an infinite no-op loop against iOS.
    mockHasPermission.mockResolvedValue(true);
    mockListActiveNotices.mockResolvedValue([dateless]);

    expect(await resyncDroppedReminders()).toBe(0);
    expect(mockScheduleForNotice).not.toHaveBeenCalled();
  });

  it('fixes only the stranded ones when the two are mixed', async () => {
    mockHasPermission.mockResolvedValue(true);
    mockListActiveNotices.mockResolvedValue([healthy, stranded, dateless]);

    expect(await resyncDroppedReminders()).toBe(1);
    expect(mockScheduleForNotice).toHaveBeenCalledTimes(1);
    expect(mockScheduleForNotice.mock.calls[0]?.[0]).toMatchObject({ noticeId: 'n_stranded' });
  });

  it('uses the hour the user chose, not the default', async () => {
    mockHasPermission.mockResolvedValue(true);
    mockListActiveNotices.mockResolvedValue([stranded]);
    mockGetStringSetting.mockResolvedValue('18');

    await resyncDroppedReminders();
    expect(mockScheduleForNotice.mock.calls[0]?.[0]).toMatchObject({ hour: 18 });
  });

  it('falls back to the default hour when the stored value is nonsense', async () => {
    mockHasPermission.mockResolvedValue(true);
    mockListActiveNotices.mockResolvedValue([stranded]);
    mockGetStringSetting.mockResolvedValue('banana');

    await resyncDroppedReminders();
    expect(mockScheduleForNotice.mock.calls[0]?.[0]).toMatchObject({ hour: 9 });
  });
});
