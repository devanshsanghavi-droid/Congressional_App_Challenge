# What the extraction cascade is

**Author: Claude. A design explanation, written before the implementation.**

It was written while `/src/extraction` was reserved as hand-written work, to
explain what a cascade *is* rather than to hand over code. That reservation was
lifted on 2026-08-26 and the cascade is now implemented — but this file is kept
as written, because the reasoning is still the reasoning, and a design document
edited to match its implementation stops being a record of what was decided in
advance.

---

## 1. The word

A **cascade** is not a machine-learning technique. It is an ordered list of
strategies for finding *one* value, tried strongest first, stopping at the first
one that works.

That is the whole idea. For `deadlineDate`, the strategies are roughly:

1. The label and the value are on the same printed line — `SUBMIT BY: SEPTEMBER 5, 2026`. Read it off directly.
2. They are not on the same line, but they are on the same **visual row** — the label sits in the left column and the date in the right. Use the bounding boxes to pair them.
3. They are in a label-above-value stack. Look at the line below, at roughly the same left edge.
4. No label at all, but the sentence states a rule and another date is known — `you must ask for a hearing within 90 days`. Derive it.
5. Nothing. Return `undefined` and let the user type it.

Water falls through the layers until something catches it. Hence "cascade."

**Why layers instead of one big regex:** each layer is stronger and narrower
than the one below. Layer 1 is nearly always right when it fires, but it only
fires when the geometry is clean. Layer 4 fires on almost anything, and is the
most likely to be wrong. Ordering them means the confident method gets first
refusal and the desperate one only sees what the others could not handle. A
single flat regex has no way to express "I am guessing now."

**Why stopping at the first hit matters:** the alternative is collecting several
candidates and picking a winner, which requires a scoring function, which is a
confidence model you have to defend. First-hit-wins is defensible in one
sentence: *the most reliable method that produced an answer is the answer.*

---

## 2. One field, all the way through

Real lines, from `na960x-clean-06`, exactly as `expo-mlkit-ocr` returned them:

```
line  8   "Notice Date"                 y = 0.292
line  9   "Effective Date"              y = 0.315
line 10   "NA 960X SAR (Rev. 10/24)"    y = 0.153
line 11   "Case Number: 01-4472-9931"   y = 0.250
line 14   "SEPTEMBER 8, 2026"           y = 0.292
line 15   "SEPTEMBER 30, 2026"          y = 0.317
```

Finding `noticeDate`:

- **Layer 1 — find the label.** `/Notice Date/i` matches line 8.
- **Layer 2 — same line?** Line 8 is the bare string `"Notice Date"`. Nothing after the label. No.
- **Layer 3 — same visual row?** Line 8 has `y = 0.292`. Line 14 has `y = 0.292`. Same row, and line 14 is to the right of line 8's right edge. Pair them.
- **Layer 4 — parse.** `"SEPTEMBER 8, 2026"` → `2026-09-08`.
- **Layer 5 — record provenance.** `sourceLineIndexes: [8, 14]` — *both*, so Review can highlight the label and the value together. A lone highlighted date floating mid-page does not help the user check anything.

Now notice what a text-only approach does here. The label is line 8, the value
is line 14, and **lines 9–13 contain two other dates**. Every window setting
that reaches line 14 also reaches line 15 — `SEPTEMBER 30, 2026`, the effective
date. There is no window size that gets this right. The geometry gets it right
exactly.

That is the single measured argument for the whole design: **+4.8pp of core
precision from geometry alone**, and it is why `ExtractionInput` hands you
boxes at all.

---

## 3. What the cascade is made of, in the order it runs

Seven parts. Only the middle three are what most people would call "parsing."

### a. Normalisation

OCR text is not clean text. `O`/`0`, `l`/`1`/`I`, `S`/`5` are confusable;
spacing inside form IDs is unreliable (`NA960X`, `NA 960X`, `NA  960 X`);
accents come back inconsistently. Normalise once, up front, and keep the
original alongside — you return the *original* to the user, because a value you
silently cleaned is a value they cannot check against the photo.

### b. Redaction matcher

**Runs before anything is stored, and it is the reason `redacted` exists.**
Find SSN-shaped strings in the OCR text and remove them before the text can be
persisted. `saveNotice()` throws if `redacted` is false and you pass `ocrText` —
that is deliberate; a silent skip would let the app look like it worked while
the one guarantee it makes quietly did not hold.

The rule from §3.4 is *never persist an SSN* — so this is not a display filter,
it is a write gate. Case numbers get the same treatment differently: salted
SHA-256 plus last four, done app-side in `saveNotice`.

### c. Field extraction — the cascade proper

For each field in `ExtractedNotice`, the layered search from §1. Three families:

| family | fields | how they are found |
|---|---|---|
| **document identity** | `formId`, `programId`, `agency`, `actionType` | a table of `[RegExp, value]` pairs over the joined text, first match wins. Order matters: `NA 960X SAR` must be tried before `NA 960 SAR`, or the more specific form never matches. |
| **dates** | `noticeDate`, `deadlineDate`, `effectiveDate`, `appealDeadline`, `aidPaidPendingDeadline` | label → geometry → parse. This is where the layers earn their keep. |
| **identity** | `recipientName`, `caseNumber` | structural, not lexical. There is no label that says "recipient." |

`recipientName` deserves its own note, because it is the field that fails most
and the reason is instructive. There is no `Recipient:` label — the name is
simply the top line of the address block. Finding it by line index breaks,
because OCR reading order interleaves the right-hand column into the address:

```
6:  MARIA REYES
7:  Case Number: 01-4472-9931     <- right column, interleaved
8:  1428 STORY ROAD APT 12
9:  Worker ID: SC-2214            <- right column, interleaved
10: SAN JOSE, CA 95122
```

"Two lines above the city line" is the *street*. Anchoring instead on the city
line's **left edge** and walking up only through lines that share it skips the
interleaved column entirely. The street line is the reliable anchor — it is the
one line in the block with an unmistakable shape, a leading house number — and
the name is the line directly above it. Walking further up climbs into the
document title.

### d. Derivation

`appealDeadline` has no printed value on most notices. It is the notice date
plus the window the letter itself states (`within 90 days`). Two rules:

- **Only derive from a window the document prints.** Never from a rule you know
  to be true. §3.7: never invent a deadline rule.
- **Point `sourceLineIndexes` at the evidence** — the notice date line *and* the
  sentence stating the 90 days — not at nothing.

The two appeal clocks are separate and must never collapse into one number:
**10 days** to keep benefits flowing during the appeal (aid paid pending),
**90 days** to request the hearing at all. Different questions, different dates.

### e. Validity checks — the `invalid` flag

Checks a value can fail *on its own*: a year outside a plausible window, a month
of 20, a case number the wrong length.

**Do not silently repair.** A date that parses to 1901 comes back as
`"1901-03-04"` with `invalid: 'implausible_date'`, not dropped and not corrected
to 2026. The user is holding the paper. They can fix it in one tap. A silent
correction is a guess with better manners.

This is what makes Review's invalid state — currently dead UI — live.

### f. Sanity pass — cross-field checks

Checks that need two fields to notice: a deadline before the notice date, an
appeal window that contradicts the printed one, an effective date years away.
These also surface as `invalid`.

Worth knowing: writing this pass's tests **as attacks** already found four real
bugs in the check itself, including a Spanish date pattern that matched nothing
— Spanish month names in English word order, so `30 de septiembre de 2026`
"scanned clean." Write the attacks first.

### g. Confidence

**Optional. Nothing breaks without it.** `FIELD_RISK` in
`src/lib/extraction-port/port.ts` is already set from the corpus measurement,
and a confidence score can only *demote* a field, never promote one.

That asymmetry is on purpose. The identity-field failures are OCR character
misreads, so they arrive looking perfectly confident. `01-8313-2205` is a
well-formed case number. It is simply the wrong one.

---

## 4. The rule the whole thing is built around

> **An absent field is `undefined`, never a guess.**

For a deadline app, a missing value prompts the user to type it — a mild
failure. A wrong value silently schedules the wrong day — a severe one. The
deterministic approach was chosen because it fails in the mild direction:
**zero wrong dates on either clean text or real OCR**, with the losses entirely
in names and case numbers, which is a Review-screen problem rather than a
parser problem.

This is the same lesson the GBNF experiment produced from the other side. A
grammar that cannot express "I don't know" converts every gap in the input into
a confident fabrication — on the approval notice, the constrained model emitted
the notice date as a deadline while the unconstrained model correctly returned
empty. Constraining the output made hallucination *worse*.

Your cascade must be able to say nothing. That is the feature.

---

## 5. What already exists, and why you cannot copy it

`tools/metrics/probe/` is a working deterministic extractor — 721 lines across
`patterns.ts`, `spatial.ts`, `text-only.ts`. It is the code that produced
100% / 95.5% on clean text and 96.4% / 87.6% on real OCR. Reading it is the
fastest way to see the shape of every layer above running on real data.

**It must not be copied into `/src/extraction`.** The authorship reason is gone
as of 2026-08-26; the methodological one is not, and it was always the stronger
of the two:

It was written **with the ground truth visible and fitted to ten notices**. That
is fine for deciding an architecture and disqualifying as a reported accuracy
figure — a number from copied probe code is a number fitted to its own test set.
The cascade was instead developed against notices 01–07 with **08–10 held out**,
and the probe's holdout-specific patterns (`SSA-8202`, `HCV-AR-101`) were
deliberately left out of its tables so the held-out figure measures
generalisation rather than transcription.

It is also missing everything in §3 b, e, f, g — no redaction matcher, no
`invalid`, no sanity pass, no confidence, no provenance, no error handling. The
probe answers "is this feasible." The cascade has to be *correct*.

---

## 6. The shortest path to a running app

Build in this order. Each step leaves the app in a better state than the last,
and the first one alone is enough to delete the scaffold.

1. **`parseDate` and the date labels.** English and Spanish. Gets you `noticeDate`, `deadlineDate`, `effectiveDate`.
2. **`sameRow` / `valueFor`.** The geometry pairing. This is the +4.8pp and it is about forty lines.
3. **The identity tables.** `formId`, `programId`, `actionType`, `agency`. Ordered, specific-before-general.
4. **`recipientName` and `caseNumber`.** The column walk.
5. **The redaction matcher.** Now `redacted` can honestly be `true`, and OCR text can be stored — which lights up the explanation path.
6. **`invalid`.** Review's dead state becomes live.
7. **`requiredDocs` from the doc lexicon.** Checklist stops being entirely user-added.
8. **The sanity pass.** Written as attacks.

After step 1 and 2, `npm run metrics -- --extractor src/extraction/index.ts`
already produces a real number.

---

## 7. The decisions that are judgement, not mechanism

Everything above is mechanism. These are judgements, and every one of them is
still open to challenge:

- **Which fields are worth a layer, and which get one strategy and a shrug.** `formId` was deliberately excluded from the probe's core-field set. Was that right?
- **Where the row tolerance sits.** The probe uses `0.6 × line height`. Skew widens rows. Too tight loses pairs; too loose pairs a label with the wrong column.
- **What counts as implausible.** A year window. A case-number shape. Every one of these is a claim about the world that a judge could ask you to defend.
- **Whether a confidence model earns its place at all.** The honest answer may be no, and saying so with the measurement behind it is a stronger answer than shipping one.
- **What the cascade refuses to do.** §3.6: cross-references, never determinations. If a layer needs to ask an eligibility question, it has crossed the line.
