/**
 * Preview seeding — populates the browser database so the screens have
 * something to lay out.
 *
 * There is no camera in the web preview, so without this every screen renders
 * its empty state and the Core screens (Home, Notice Detail, Checklist) cannot
 * be worked on at all. The notices below are the corpus's own fictional people,
 * chosen to put **one of each urgency tier on Home at once** — so a change to
 * the countdown can be judged across all its states in a single glance rather
 * than by editing dates between screenshots.
 *
 * It writes through the real `saveNotice`, so the redaction rule, the case
 * number hashing and the field encryption all run exactly as they do on the
 * phone. Nothing here bypasses the storage layer.
 *
 * **Bump `SEED_VERSION` after editing the seeds below.** The database survives a
 * reload, so without a version the old rows stay and an edit here looks like it
 * did nothing — which cost a confused twenty minutes the first time. The version
 * lives in `localStorage` rather than the settings table on purpose: the preview
 * must not add a key to the app's own settings schema.
 */
import { SETTINGS, getBooleanSetting, setBooleanSetting } from '@/lib/db/settings.ts';
import { listActiveNotices, saveNotice } from '@/lib/db/notices.ts';
import { wipeEverything } from '@/lib/wipe.ts';
import type { ExtractedNotice } from '@/lib/extraction-port/port.ts';

/** Bump after editing SEEDS — see the note above. */
const SEED_VERSION = '2';

/** Every seeded field is "confirmed by the user", which is what saving means. */
function confirmed(value: string) {
  return { value, source: 'manual' as const };
}

/** ISO date `days` from today, in local calendar terms. */
function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

interface Seed {
  readonly fields: ExtractedNotice;
  readonly locale?: string;
  readonly ocrText: string;
}

const SEEDS: readonly Seed[] = [
  // Tier 1 — the red end of the countdown.
  {
    fields: {
      recipientName: confirmed('MARIA REYES'),
      caseNumber: confirmed('01-4471-9928'),
      programId: confirmed('CalFresh'),
      agency: confirmed('Santa Clara County HHSA'),
      formId: confirmed('SAR 7'),
      actionType: confirmed('recert_due'),
      noticeDate: confirmed(isoIn(-24)),
      deadlineDate: confirmed(isoIn(2)),
    },
    ocrText:
      'SEMI-ANNUAL ELIGIBILITY STATUS REPORT\nCalFresh / CalWORKs\nMARIA REYES\n' +
      'You must complete, sign and return this form. Attach copies of paycheck ' +
      'stubs, your current rent receipt or lease agreement, and your most recent ' +
      'utility bill.',
  },
  // Tier 2 — the discontinuance, and the only one with an aid-paid-pending date.
  {
    fields: {
      recipientName: confirmed('MARIA REYES'),
      caseNumber: confirmed('01-4471-9928'),
      programId: confirmed('CalFresh'),
      agency: confirmed('Santa Clara County DSS'),
      formId: confirmed('NA 960X'),
      actionType: confirmed('discontinuance'),
      noticeDate: confirmed(isoIn(-6)),
      deadlineDate: confirmed(isoIn(11)),
      effectiveDate: confirmed(isoIn(24)),
      aidPaidPendingDeadline: confirmed(isoIn(4)),
      appealDeadline: confirmed(isoIn(84)),
    },
    ocrText:
      'NOTICE OF ACTION\nCalFresh - Discontinuance\nYour CalFresh benefits will ' +
      'stop. If you think this action is wrong you may ask for a state hearing.',
  },
  // Tier 3 — far out, and the Spanish one, so both languages are on Home.
  {
    fields: {
      recipientName: confirmed('CARMEN DELGADO'),
      caseNumber: confirmed('01-5538-7742'),
      programId: confirmed('Medi-Cal'),
      agency: confirmed('Santa Clara County HHSA'),
      formId: confirmed('MC 210 RV'),
      actionType: confirmed('redetermination'),
      noticeDate: confirmed(isoIn(-3)),
      deadlineDate: confirmed(isoIn(46)),
    },
    locale: 'es',
    ocrText:
      'INFORME SEMESTRAL DE ELEGIBILIDAD\nCalFresh / CalWORKs\nCARMEN DELGADO\n' +
      'Debe completar, firmar y devolver este formulario.',
  },
  // The good-news case. No deadline at all, which is the state most likely to
  // be got wrong: Home must not show a red countdown here.
  {
    fields: {
      recipientName: confirmed('SAMUEL BRIGHT'),
      caseNumber: confirmed('01-2204-6653'),
      programId: confirmed('CalFresh'),
      agency: confirmed('Santa Clara County DSS'),
      formId: confirmed('NA 960 SAR'),
      actionType: confirmed('approval'),
      noticeDate: confirmed(isoIn(-16)),
      effectiveDate: confirmed(isoIn(-13)),
      appealDeadline: confirmed(isoIn(74)),
    },
    ocrText:
      'NOTICE OF ACTION\nCalFresh - Approval\nYOUR CALFRESH APPLICATION IS ' +
      'APPROVED.\nMonthly benefit: $412.00',
  },
];

let done = false;

function storedVersion(): string | null {
  try {
    return globalThis.localStorage?.getItem('carta:seedVersion') ?? null;
  } catch {
    return null;
  }
}

export async function devSeed(): Promise<void> {
  if (done) return;
  done = true;

  try {
    // An edit to SEEDS must actually show up. Anything else and the preview is
    // quietly displaying data that no longer matches the file on disk.
    if (storedVersion() !== SEED_VERSION) {
      await wipeEverything();
      try {
        globalThis.localStorage?.setItem('carta:seedVersion', SEED_VERSION);
      } catch {
        /* private window */
      }
    }

    // Onboarding is a real screen and worth working on, but it should not stand
    // between a reload and Home every time. Reach it at /onboarding directly.
    if (!(await getBooleanSetting(SETTINGS.onboardingDone))) {
      await setBooleanSetting(SETTINGS.onboardingDone, true);
    }

    if ((await listActiveNotices()).length > 0) return;

    for (const seed of SEEDS) {
      await saveNotice({
        fields: seed.fields,
        ocrText: seed.ocrText,
        // True because these strings contain no SSN by construction, not
        // because the matcher ran. The storage layer refuses text without it.
        redacted: true,
        ...(seed.locale === undefined ? {} : { locale: seed.locale }),
      });
    }
    console.info('[web preview] seeded', SEEDS.length, 'notices');
  } catch (error) {
    console.warn('[web preview] seeding failed', error);
  }
}
