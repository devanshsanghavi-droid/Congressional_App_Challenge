# What the app needs from `/src/extraction`

**For Devansh.** Written by Claude; this is a request, not a design. The schema,
the grammar, the heuristics and the confidence model are yours (CLAUDE.md §15).
This file says only what the app-side code already calls, so that when your
parser lands the wiring is one line.

Right now `src/lib/extraction-port/adapter.ts` points at a scaffold. Replace that
import and delete `scaffold.ts`.

---

## The one function

```ts
export function extract(input: ExtractionInput): ExtractionResult;
```

Pure. No I/O, no globals, no clock of its own — everything arrives as an
argument, which is what keeps it runnable in bare Node against the corpus.

## Input — what the app hands you

```ts
interface ExtractionInput {
  lines: readonly OcrLine[];   // reading order as the recogniser returned it
  text: string;                // the same lines joined with "\n"
  width: number;               // pixels the boxes were normalised against
  height: number;
  nowMs: number;               // the clock, passed in
  languageHint?: string;       // "en" | "es", may be absent or wrong
}

interface OcrLine {
  text: string;
  confidence: number;          // 1 on both engines — neither reports per-line
  box: { x: number; y: number; w: number; h: number };  // 0–1, TOP-LEFT origin
}
```

**Boxes are normalised 0–1 with a top-left origin**, identical to what the
metrics harness feeds you. The adapter divides by the image size so you never
see pixels. Geometry is worth having: it measured +4.8pp of core precision over
text-only matching, because OCR reading order is not document order — on
`na960x-clean-06` the label `"Notice Date"` and its value are six lines apart in
the text and on the same visual row, `y = 0.292` for both.

## Output — what the app can store and schedule from

```ts
interface ExtractionResult {
  fields: ExtractedNotice;
  requiredDocs?: readonly string[];
  redacted: boolean;           // has your redaction matcher run over `text`?
  containedSsn?: boolean;
}

interface ExtractedNotice {
  recipientName?: ExtractedField;
  caseNumber?: ExtractedField;
  programId?: ExtractedField;
  agency?: ExtractedField;
  formId?: ExtractedField;
  actionType?: ExtractedField;   // approval | denial | reduction |
                                 // discontinuance | info_request | recert_due
  noticeDate?: ExtractedField;
  deadlineDate?: ExtractedField;
  effectiveDate?: ExtractedField;
  appealDeadline?: ExtractedField;
  aidPaidPendingDeadline?: ExtractedField;
}

interface ExtractedField {
  value?: string;                        // absent when not found — never invented
  source: 'manual' | 'regex' | 'llm' | 'llm_corrected';
  confidence?: number;                   // 0–1, optional
  sourceLineIndexes?: readonly number[]; // which lines it came from
}
```

### Four things the app depends on

**Dates are ISO `YYYY-MM-DD` strings.** The app converts to local-midnight epoch
millis at the storage boundary (`src/lib/dates.ts`). Do not return millis — a
timezone conversion in the wrong place moves a deadline by a day.

**An absent field is `undefined`, never a guess.** Storage and Review both treat
a missing value as "the user fills this in", which is a mild failure. A wrong
value is a severe one. This is the same rule the grammar experiment produced:
without a representable empty case, every gap becomes a confident fabrication.

**`redacted` must be true before OCR text can be persisted.**
`saveNotice()` throws otherwise, deliberately — it does not silently skip. The
scaffold returns `false` and so the app currently stores no notice text at all.

**`sourceLineIndexes` is worth returning if it is cheap.** It is what lets Review
highlight where a value came from on the photo, and the two fields that most
need it are the two that fail: the name and the case number.

### `sourceLineIndexes` — return every line, not just the first

Your assumption is right. Review highlights a *region*, so it needs the whole
set, and it draws the union of those boxes.

Return them in reading order, and include every line the value drew on:

```ts
// "1428 STORY ROAD APT 12" / "SAN JOSE, CA 95122" spanning two OCR lines
{ value: 'MARIA REYES', source: 'regex', sourceLineIndexes: [5] }
{ value: '1428 STORY ROAD APT 12, SAN JOSE, CA 95122',
  source: 'regex', sourceLineIndexes: [6, 7] }
```

Two cases worth being explicit about, because they are the ones that make the
highlight useful rather than decorative:

- **A value assembled from a label and a value on different lines** — include
  *both*, the label line as well as the value line. On `na960x-clean-06` the
  label `"Notice Date"` is line 8 and `"SEPTEMBER 8, 2026"` is line 14; showing
  the user only line 14 highlights a bare date floating in the middle of the
  page, which does not help them check it. Highlighting both makes the reading
  legible.
- **A derived value with no line of its own** — `appealDeadline` is computed
  from the notice date plus a printed window. Point it at the lines the
  *evidence* came from (the notice date, and the sentence stating the 90 days).
  An empty array and `undefined` are both fine if that is awkward; the app
  degrades to no highlight.

Indexes are into `input.lines`, the array you were handed, in that order.

### Invalid values — return them, with `invalid` set

Return the value **plus a flag**, not `undefined`. You are right that
present-and-wrong is a different situation from absent, and Review can only
prompt for what it knows about.

I have added this to `ExtractedField`:

```ts
interface ExtractedField {
  value?: string;
  source: 'manual' | 'regex' | 'llm' | 'llm_corrected';
  confidence?: number;
  sourceLineIndexes?: readonly number[];
  /**
   * Set when a value was found but failed a validity check. Review shows the
   * value, marks it, and opens focused on it — a wrong value the user can see
   * is fixable; a blank field where the page clearly has a value is confusing.
   */
  invalid?: 'implausible_date' | 'out_of_range' | 'malformed' | 'failed_checksum';
}
```

The distinction the app makes:

| situation | return | what Review does |
|---|---|---|
| nothing found | field absent, or `value: undefined` | "Not found — tap to add" |
| found, looks right | `value` set, no `invalid` | shows it; flags only if the field is high-risk |
| found, clearly wrong | `value` set **and** `invalid` set | shows the value, marks it, **focuses it first** |

`invalid` outranks `high` risk for deciding where the cursor opens, because a
value you already know is wrong beats one that is merely likely to be.

**Do not silently repair.** If a date parses to 1901, return `"1901-03-04"` with
`invalid: 'implausible_date'` rather than dropping it or guessing 2026 — the
user can see the page and correct it in one tap, and a silent correction is a
guess with better manners.

**`invalid` is not the sanity pass.** It is for what you can tell from the value
alone: a year outside a plausible window, a case number the wrong length, a
month of 20. Cross-field checks — a deadline before the notice date, an appeal
window that does not match the printed one — stay in your sanity pass, and the
app is happy to receive those as `invalid` too if that is where they land.

## What the app does *not* need

No confidence model is required for any of this to work. `FIELD_RISK` in
`src/lib/extraction-port/port.ts` is set from the corpus measurement — dates
`verified`, `recipientName` and `caseNumber` `high` — and a confidence score can
only demote a field, never promote one. That is on purpose: the identity-field
failures are OCR character misreads, so they arrive *looking* confident.
`01-8313-2205` is a well-formed case number; it is simply the wrong one.

If your cascade produces a confidence, pass it and it will be used as a demotion
signal. If it does not, nothing breaks.

## If your types differ

Adapt them in `src/lib/extraction-port/adapter.ts`. That file exists for exactly
this. Do not bend the island to fit the app.
