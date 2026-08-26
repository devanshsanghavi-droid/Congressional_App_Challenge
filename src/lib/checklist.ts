/**
 * The Checklist's rules, with no storage in them.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7), and pure — no imports, so it is
 * tested in bare Node without SQLite, the same discipline `urgency.ts`,
 * `dates.ts` and `explain-check.ts` follow. `src/lib/db/checklist.ts` does the
 * reading and writing and re-exports these, so nothing in the app has to know
 * which half it is talking to.
 *
 * The rule worth putting here rather than in a screen is `ready`. It is the
 * highest-stakes sentence the Checklist says, and it is one arithmetic slip
 * away from being wrong — see `progressOf`.
 */

/** What a checklist row is waiting on. */
export type RequirementState = 'needed' | 'attached' | 'not_applicable';

/**
 * Where a checklist row came from.
 *
 * Load-bearing, not bookkeeping. CLAUDE.md §16 forbids inventing a rule about
 * what a programme requires, so Carta may only say "the letter asks for this"
 * about a row whose origin is `letter` — one the extraction cascade read off
 * the page. Everything the user adds themselves is `user`, and the UI says so.
 */
export type RequirementOrigin = 'letter' | 'user';

export interface StoredDocument {
  readonly id: string;
  readonly capturedAt: number;
  /** A `doc_types.json` id, or undefined when the user named it themselves. */
  readonly docType?: string;
  /** The user's own words. Present when `docType` is absent or is `other`. */
  readonly label?: string;
  readonly imageRef: string;
}

export interface Requirement {
  readonly id: string;
  readonly noticeId: string;
  readonly docType?: string;
  readonly label?: string;
  readonly origin: RequirementOrigin;
  readonly state: RequirementState;
  readonly document?: StoredDocument;
  readonly position: number;
}

export interface ChecklistProgress {
  readonly total: number;
  /** Attached or marked not-applicable — everything the user has dealt with. */
  readonly resolved: number;
  readonly attached: number;
  readonly notApplicable: number;
  /** True only when there is at least one row and none are outstanding. */
  readonly ready: boolean;
}

/**
 * `ready` is false for an empty checklist, and that guard is the whole reason
 * this function exists rather than a `resolved === total` in the screen.
 *
 * Zero of zero is arithmetically complete and is not the same thing as being
 * ready to send a packet: an empty checklist means Carta does not know what the
 * letter asks for. Telling someone they are ready on that basis is the worst
 * thing this screen could say, and it is precisely what the obvious expression
 * would say.
 */
export function progressOf(requirements: readonly Requirement[]): ChecklistProgress {
  const attached = requirements.filter((r) => r.state === 'attached').length;
  const notApplicable = requirements.filter((r) => r.state === 'not_applicable').length;
  const resolved = attached + notApplicable;
  return {
    total: requirements.length,
    resolved,
    attached,
    notApplicable,
    ready: requirements.length > 0 && resolved === requirements.length,
  };
}

// ------------------------------------------------------------------- the Vault

/** A stored document with its age worked out. */
export interface DocumentAge {
  /** Whole local calendar days since it was saved. Never negative. */
  readonly days: number;
  /**
   * True only when a SOURCED freshness rule exists for this document type and
   * the document is older than it. Undefined-or-false means "no opinion", which
   * is the honest answer for most document types and must not be rendered as
   * "this is fine".
   */
  readonly stale: boolean;
}

/**
 * How old a document is, and whether a sourced rule says that is a problem.
 *
 * `limitDays` comes from `offices.json`'s `what_to_bring.freshness`, which is
 * cited and dated. Pass `undefined` when there is no rule — CLAUDE.md §16
 * forbids inventing one, and this function will then report an age and no
 * judgement. **Never give this a default limit.** A default would turn "we have
 * no source" into a confident claim about every document type at once, which is
 * the exact failure the content packs exist to prevent.
 *
 * Local calendar days, not milliseconds divided: `(a - b) / 86400000` across a
 * DST boundary gives 46.96, and `Math.floor` of that is 46 for a document saved
 * 47 days ago. Same rule as `daysUntil` in `urgency.ts`, same reason.
 */
export function documentAge(
  capturedAtMs: number,
  nowMs: number,
  limitDays?: number,
): DocumentAge {
  const startOfDay = (ms: number): number => {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const days = Math.max(
    0,
    Math.round((startOfDay(nowMs) - startOfDay(capturedAtMs)) / 86_400_000),
  );
  return { days, stale: limitDays !== undefined && days > limitDays };
}

/** Documents grouped by type, newest first inside each group. */
export interface DocumentGroup<T extends { docType?: string; capturedAt: number }> {
  /** The doc-type id, or undefined for documents the user named themselves. */
  readonly docType: string | undefined;
  readonly documents: readonly T[];
}

/**
 * Group for the Vault.
 *
 * Groups keep the order of first appearance rather than being sorted by name:
 * the caller hands these over newest-first, so the type someone photographed
 * most recently is the one at the top, which is the one they are most likely
 * looking for. Untyped documents sort last — they are the ones Carta knows
 * least about, not the ones the user cares least about, but they cannot be
 * grouped meaningfully with anything else.
 */
export function groupDocuments<T extends { docType?: string; capturedAt: number }>(
  documents: readonly T[],
): DocumentGroup<T>[] {
  const groups = new Map<string, T[]>();
  const UNTYPED = '\u0000untyped';
  for (const document of documents) {
    const key = document.docType ?? UNTYPED;
    const existing = groups.get(key);
    if (existing) existing.push(document);
    else groups.set(key, [document]);
  }
  for (const list of groups.values()) list.sort((a, b) => b.capturedAt - a.capturedAt);

  const out: DocumentGroup<T>[] = [];
  for (const [key, list] of groups) {
    if (key !== UNTYPED) out.push({ docType: key, documents: list });
  }
  const untyped = groups.get(UNTYPED);
  if (untyped) out.push({ docType: undefined, documents: untyped });
  return out;
}
