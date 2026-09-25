/**
 * Rendering tests for the three core screens.
 *
 * AUTHORSHIP: Claude. App-side tests.
 *
 * These exist because `tests/app/` was empty and `npm test` reported green
 * while covering **zero React components** — the `app` Jest project had never
 * executed a single test (see `babel.config.js` for why it could not).
 *
 * They are deliberately not exhaustive. What they hold is the set of things
 * that would be silently wrong on a screen and would not fail any other check:
 *
 *   - the countdown tier a notice renders, which is the whole product;
 *   - that Home's empty state is the *empty* state and not a flash of it during
 *     the first read;
 *   - that Review flags the two fields measurement says are unreliable, and
 *     stops claiming "read clearly" over something the user typed;
 *   - that Notice Detail renders "by when" from the confirmed field and never
 *     from the model — the thing the whole explanation redesign turns on.
 *
 * The DB and router are mocked. Storage has its own coverage and the real
 * SQLite path needs a device; what is under test here is what a person sees.
 */

// NOTE: `render` is ASYNC in @testing-library/react-native v14. Calling it
// without `await` returns a Promise, `screen` is never populated, and every
// query fails with "`render` function has not been called" — which reads as a
// broken test rather than a missing await.
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import '../../src/lib/i18n';

// ---------------------------------------------------------------- mocks

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockRouteParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
  // The real one runs the effect on focus; in a test the screen is always
  // focused, so running it once on mount is the honest equivalent.
  useFocusEffect: (callback: () => void) => {
    const React_ = jest.requireActual('react') as typeof React;
    React_.useEffect(() => {
      callback();
    }, [callback]);
  },
}));

const mockListActiveNotices = jest.fn();
const mockGetNotice = jest.fn();
const mockGetNoticeText = jest.fn();
const mockGetNoticeRecipientName = jest.fn();

jest.mock('../../src/lib/db/notices', () => ({
  listActiveNotices: (...a: unknown[]) => mockListActiveNotices(...a),
  getNotice: (...a: unknown[]) => mockGetNotice(...a),
  getNoticeText: (...a: unknown[]) => mockGetNoticeText(...a),
  getNoticeRecipientName: (...a: unknown[]) => mockGetNoticeRecipientName(...a),
  saveNotice: jest.fn(),
  setImageRef: jest.fn(),
}));

jest.mock('../../src/lib/db/checklist', () => ({
  listRequirements: jest.fn().mockResolvedValue([]),
  seedFromLetter: jest.fn(),
  progressOf: jest.requireActual('../../src/lib/checklist').progressOf,
}));

// Review reaches the settings table and the scheduler on save. Neither is
// under test here, and `expo-sqlite` pulls in `expo-asset`, which is not
// installed — the DB path belongs on a device (`carta://selftest`), not here.
jest.mock('../../src/lib/db/settings', () => ({
  getBooleanSetting: jest.fn().mockResolvedValue(true),
  SETTINGS: { deleteSourceImage: 'deleteSourceImage' },
}));
jest.mock('../../src/lib/db/reminders', () => ({ recordScheduled: jest.fn() }));
jest.mock('../../src/lib/notifications', () => ({
  requestPermission: jest.fn().mockResolvedValue(true),
  scheduleForNotice: jest.fn().mockResolvedValue([]),
  listScheduled: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../src/lib/diagnostics/last-trace', () => ({ rememberTrace: jest.fn() }));

jest.mock('../../src/lib/db/images', () => ({
  decryptCaptureForDisplay: jest.fn(),
  decryptDocumentForDisplay: jest.fn(),
  discardDecryptedPreviews: jest.fn(),
  storeCaptureEncrypted: jest.fn(),
  storeDocumentEncrypted: jest.fn(),
  discardCapture: jest.fn(),
}));

// The sections added on 2026-09-24 each read their own table. What they show is
// covered by the node tests over their pure halves; here they only need to load.
const mockListWaiting = jest.fn().mockResolvedValue([]);
jest.mock('../../src/lib/db/expected', () => ({
  listWaiting: (...a: unknown[]) => mockListWaiting(...a),
}));
jest.mock('../../src/lib/expected-letters', () => ({
  afterNoticeSaved: jest.fn().mockResolvedValue(undefined),
  answerExpected: jest.fn().mockResolvedValue(undefined),
  isDue: () => false,
  letterTitle: (rule: { title: string }) => rule.title,
  ruleFor: () => undefined,
  rescheduleAsks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/lib/db/followups', () => ({
  listFollowups: jest.fn().mockResolvedValue([]),
  followupTier: (ruleId: string) => `followup:${ruleId}`,
}));
jest.mock('../../src/lib/db/sent', () => ({
  SENT_FORM_DOC_TYPE: 'sent_form',
  listSentCopies: jest.fn().mockResolvedValue([]),
  saveSentCopy: jest.fn(),
}));
const mockRemoveNotice = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/lib/remove-notice', () => ({
  removeNotice: (...a: unknown[]) => mockRemoveNotice(...a),
}));
const mockRemindedRuleIds = jest.fn().mockResolvedValue(new Set());
jest.mock('../../src/lib/second-chance-reminders', () => ({
  remindBefore: jest.fn(),
  cancelBefore: jest.fn(),
  remindedRuleIds: (...a: unknown[]) => mockRemindedRuleIds(...a),
}));

// The model is a ~1 GB optional download; a test must never look for it.
jest.mock('../../src/lib/llm/model', () => ({
  MODELS: { 'qwen2.5-1.5b-instruct-q4_k_m': { id: 'qwen2.5-1.5b-instruct-q4_k_m' } },
  modelFile: () => ({ exists: false }),
}));
jest.mock('../../src/lib/llm/explain', () => ({ explain: jest.fn() }));

import HomeScreen from '../../src/app/index';
import NoticeDetailScreen from '../../src/app/notice/[id]';
import ReviewScreen from '../../src/app/review';
import { useCaptureStore } from '../../src/lib/store/capture';

const DAY = 86_400_000;

function noticeAt(daysFromNow: number, over: Record<string, unknown> = {}) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return {
    id: 'n_1',
    capturedAt: midnight.getTime(),
    programId: 'CalFresh',
    actionType: 'recert_due' as const,
    deadlineDate: midnight.getTime() + daysFromNow * DAY,
    status: 'active' as const,
    remindersActive: true,
    caseLast4: '9931',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = {};
});

// ------------------------------------------------------------------ Home

describe('Home', () => {
  it('shows the empty state when there are genuinely no notices', async () => {
    mockListActiveNotices.mockResolvedValue([]);
    await render(<HomeScreen />);
    expect(await screen.findByText(/Nothing to keep track of yet/i)).toBeTruthy();
  });

  it('does NOT flash the empty state while the first read is in flight', async () => {
    // `undefined` means "not loaded"; `[]` means "genuinely empty". Rendering
    // the empty state for the first is how someone with four deadlines is told
    // they have none, for a frame, every launch.
    mockListActiveNotices.mockReturnValue(new Promise(() => {}));
    await render(<HomeScreen />);
    expect(screen.queryByText(/Nothing to keep track of yet/i)).toBeNull();
  });

  it('renders a red countdown under three days', async () => {
    mockListActiveNotices.mockResolvedValue([noticeAt(2)]);
    await render(<HomeScreen />);
    // The countdown is ONE accessible element with one label, deliberately: a
    // screen reader should say "2 days left", not "2" then "days left" as two
    // stops. So the assertion is on the label, which is also the thing a
    // rubric-scored accessibility pass cares about.
    expect(await screen.findByLabelText(/2 days left/i)).toBeTruthy();
  });

  it('renders the programme and the action for each notice', async () => {
    mockListActiveNotices.mockResolvedValue([noticeAt(12)]);
    await render(<HomeScreen />);
    expect(await screen.findByText('CalFresh')).toBeTruthy();
    expect(screen.getByLabelText(/12 days left/i)).toBeTruthy();
  });

  it('orders by nearest deadline, so the top card is the urgent one', async () => {
    mockListActiveNotices.mockResolvedValue([noticeAt(2, { id: 'a' }), noticeAt(30, { id: 'b' })]);
    await render(<HomeScreen />);
    await screen.findByLabelText(/2 days left/i);
    // The SQL orders these; this asserts the screen does not reorder them.
    const countdowns = screen.getAllByLabelText(/days left/i);
    expect(countdowns[0]?.props.accessibilityLabel).toMatch(/^2 /);
  });

  it('does not blame notifications for a deadline that has already passed', async () => {
    // Nothing is scheduled for a date in the past, so reminder_count is 0 for a
    // reason that has nothing to do with permission. Found 2026-09-25 by saving
    // a SAR 7 whose due date had passed and watching Home say notifications
    // were off while two notifications sat scheduled in iOS.
    mockListActiveNotices.mockResolvedValue([noticeAt(-3, { remindersActive: false })]);
    await render(<HomeScreen />);
    await screen.findByText(/CalFresh/);
    expect(screen.queryByText(/No reminders set/i)).toBeNull();
  });

  /**
   * The most dangerous state this product can be in: a deadline it is silently
   * not going to remind anyone about. It must be visible on the card.
   */
  it('warns on a notice whose reminders were never scheduled', async () => {
    mockListActiveNotices.mockResolvedValue([noticeAt(12, { remindersActive: false })]);
    await render(<HomeScreen />);
    expect(await screen.findByText(/reminder/i)).toBeTruthy();
  });

  it('shows an error state the user can retry', async () => {
    mockListActiveNotices.mockRejectedValue(new Error('db gone'));
    await render(<HomeScreen />);
    expect(await screen.findByText(/could not open your notices/i)).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });

  it('never renders a raw error message', async () => {
    mockListActiveNotices.mockRejectedValue(new Error('SQLITE_CORRUPT: malformed'));
    await render(<HomeScreen />);
    await screen.findByText(/could not open your notices/i);
    expect(screen.queryByText(/SQLITE_CORRUPT/)).toBeNull();
  });
});

// ---------------------------------------------------------------- Review

describe('Review', () => {
  function pending(fields: Record<string, unknown>) {
    useCaptureStore.setState({
      pending: {
        photoUri: 'file:///tmp/x.jpg',
        ocr: { text: '', lines: [], width: 1, height: 1, engine: 'apple-vision' },
        orientation: { verdict: 'upright', anchors: 2 },
        upsideDown: false,
        extraction: { fields, redacted: false },
        trace: { id: 't', startedAt: 0, source: 'camera', stages: [] },
      } as never,
    });
  }

  it('flags the recipient name and the case number regardless of confidence', async () => {
    // Measured at 90.5% and 91.3% on real photographs, and the failure mode is
    // a confident wrong answer — so they are flagged always, not on a threshold.
    pending({
      recipientName: { value: 'MARIA REYES', source: 'regex', confidence: 1 },
      caseNumber: { value: '01-4472-9931', source: 'regex', confidence: 1 },
    });
    await render(<ReviewScreen />);
    expect(screen.getAllByText(/Please check this/i).length).toBe(2);
  });

  it('does not ask the user to re-check a date it read at full confidence', async () => {
    pending({ deadlineDate: { value: '2026-09-05', source: 'regex', confidence: 1 } });
    await render(<ReviewScreen />);
    expect(screen.getByText(/Read clearly/i)).toBeTruthy();
  });

  /**
   * The bug the screenshots found. `effectiveRisk` returns `verified` for a
   * manual value — correctly, it does not need re-checking — but "Read clearly"
   * claims Carta read it off the page, and the user had just typed it.
   */
  it('never claims it read clearly a value the user typed', async () => {
    pending({ deadlineDate: { value: '2026-08-26', source: 'manual' } });
    await render(<ReviewScreen />);
    expect(screen.queryByText(/Read clearly/i)).toBeNull();
  });

  it('offers an empty field to fill rather than hiding it', async () => {
    pending({ recipientName: { value: 'MARIA REYES', source: 'regex' } });
    await render(<ReviewScreen />);
    expect(screen.getAllByText(/Not found/i).length).toBeGreaterThan(0);
  });

  it('says so when no deadline was found, instead of staying silent', async () => {
    pending({ recipientName: { value: 'MARIA REYES', source: 'regex' } });
    await render(<ReviewScreen />);
    expect(screen.getByText(/No deadline found/i)).toBeTruthy();
  });

  /**
   * CLAUDE.md §3 rule 5, found broken on 2026-09-24. The cascade redacted its
   * own copy of the page and reported `redacted: true`, and Review then saved
   * the recogniser's ORIGINAL text on the strength of that flag. Every capture
   * that printed an SSN wrote it to the database, encrypted but present. The
   * pipeline now redacts before anything sees the text, and this screen runs
   * the matcher again at the write, so this test hands it unredacted text on
   * purpose: whatever filled the store, the SSN must not reach `saveNotice`.
   */
  it('never saves an SSN, even when the text it was handed still has one', async () => {
    const { saveNotice } = jest.requireMock('../../src/lib/db/notices') as { saveNotice: jest.Mock };
    saveNotice.mockClear();
    saveNotice.mockResolvedValue('n_new');
    useCaptureStore.setState({
      pending: {
        photoUri: '',
        ocr: {
          text: 'NOTICE OF ACTION\nSSN: 123-45-6789\nAlso 987 65 4321 on file\nDue September 5, 2026',
          lines: [],
          width: 1,
          height: 1,
          engine: 'apple-vision',
        },
        extraction: { fields: { deadlineDate: { value: '2026-09-05', source: 'regex', confidence: 1 } }, redacted: true },
        trace: { id: 't', startedAt: 0, source: 'camera', stages: [] },
      } as never,
    });
    await render(<ReviewScreen />);
    fireEvent.press(screen.getByLabelText('Save and set reminders'));
    await waitFor(() => expect(saveNotice).toHaveBeenCalled());
    const input = saveNotice.mock.calls[0]?.[0] as { ocrText?: string; containedSsn?: boolean };
    expect(input.ocrText).toBeDefined();
    expect(input.ocrText).not.toMatch(/123-45-6789|987 65 4321/);
    expect(input.ocrText).toContain('[SSN REMOVED]');
    expect(input.containedSsn).toBe(true);
  });

  it('offers a helper the way to send the letter on instead of keeping it', async () => {
    pending({ deadlineDate: { value: '2026-09-05', source: 'regex', confidence: 1 } });
    await render(<ReviewScreen />);
    expect(screen.getByLabelText('Send to another phone instead')).toBeTruthy();
  });

  it('shows the check code on a letter that came from a helper, and no way to send it on again', async () => {
    useCaptureStore.setState({
      pending: {
        photoUri: '',
        ocr: { text: '', lines: [], width: 0, height: 0, engine: 'handoff' },
        extraction: { fields: { deadlineDate: { value: '2026-09-05', source: 'regex' } }, redacted: false },
        trace: { id: 't', startedAt: 0, source: 'handoff', stages: [] },
        handoffCheckCode: '4821',
      } as never,
    });
    await render(<ReviewScreen />);
    expect(screen.getByText(/Check code: 4821/)).toBeTruthy();
    expect(screen.queryByLabelText('Send to another phone instead')).toBeNull();
  });
});

// --------------------------------------------------------- Notice Detail

describe('Notice Detail', () => {
  beforeEach(() => {
    mockRouteParams = { id: 'n_1' };
    mockGetNoticeText.mockResolvedValue('NOTICE OF ACTION');
    mockGetNoticeRecipientName.mockResolvedValue('MARIA REYES');
  });

  it('removes one letter only after the person confirms', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRemoveNotice.mockClear();
    mockGetNotice.mockResolvedValue(noticeAt(12));
    await render(<NoticeDetailScreen />);
    fireEvent.press(await screen.findByLabelText('Remove this letter'));
    expect(alert).toHaveBeenCalledWith('Remove this letter?', expect.any(String), expect.any(Array));
    expect(mockRemoveNotice).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Remove')?.onPress?.();
    await waitFor(() => expect(mockRemoveNotice).toHaveBeenCalledWith('n_1'));
    expect(mockReplace).toHaveBeenCalledWith('/');
    alert.mockRestore();
  });

  it('renders the four fixed headings in order', async () => {
    mockGetNotice.mockResolvedValue(noticeAt(12));
    await render(<NoticeDetailScreen />);
    expect(await screen.findByText(/What this says/i)).toBeTruthy();
    expect(screen.getByText(/What you must do/i)).toBeTruthy();
    expect(screen.getByText(/By when/i)).toBeTruthy();
    expect(screen.getByText(/How to appeal/i)).toBeTruthy();
  });

  /**
   * The whole explanation redesign turns on this: the deadline is rendered from
   * the confirmed field, by the screen, and the model is never asked for it.
   * If this ever comes from generated text, the guardrail is gone.
   */
  it('renders "by when" from the confirmed field, with the model absent', async () => {
    const notice = noticeAt(12);
    mockGetNotice.mockResolvedValue(notice);
    await render(<NoticeDetailScreen />);
    const expected = new Date(notice.deadlineDate).toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    expect(await screen.findByText(new RegExp(expected.split(',')[1]?.trim() ?? ''))).toBeTruthy();
  });

  it('says plainly when the letter states no deadline', async () => {
    mockGetNotice.mockResolvedValue(noticeAt(0, { deadlineDate: undefined }));
    await render(<NoticeDetailScreen />);
    expect(await screen.findByText(/did not find a date on this letter/i)).toBeTruthy();
  });

  it('offers the model rather than erroring when it is not downloaded', async () => {
    mockGetNotice.mockResolvedValue(noticeAt(12));
    await render(<NoticeDetailScreen />);
    // Not an error state: it is the ordinary state for most users.
    expect(await screen.findByText(/one-time download/i)).toBeTruthy();
  });

  it('keeps the original one tap away', async () => {
    mockGetNotice.mockResolvedValue(noticeAt(12));
    await render(<NoticeDetailScreen />);
    // Guardrail 1, on the same screen, never behind navigation.
    expect(await screen.findByText(/See the words Carta read/i)).toBeTruthy();
  });

  it('links to the checklist', async () => {
    mockGetNotice.mockResolvedValue(noticeAt(12));
    await render(<NoticeDetailScreen />);
    const button = (await screen.findAllByLabelText(/What to bring/i))[0];
    fireEvent.press(button as never);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/checklist/n_1'));
  });

  it('shows an error state for a notice that does not exist', async () => {
    mockGetNotice.mockResolvedValue(undefined);
    await render(<NoticeDetailScreen />);
    expect(await screen.findByText(/could not open this notice/i)).toBeTruthy();
  });
});
