# tools/metrics — the extraction metrics harness

Scores the extraction pipeline against the golden corpus and writes the metrics
table that goes in the project README (SPEC §8.2).

**Authorship: Claude.** This directory is harness infrastructure — it measures
extraction, it does not perform it. The extraction cascade itself is Devansh's
work and lives in `/src/extraction` (CLAUDE.md §15). The seam between the two is
`extractor.ts`, and it is documented there.

```bash
npm run metrics                                     # score, write the report
npm run metrics -- --extractor src/extraction/index.ts
npm run metrics:check                               # non-zero exit if a logic assertion fails
npm run corpus:ocr                                  # rebuild the OCR cache (macOS only)
npm run corpus:ocr -- --only na960x                 # just the images that changed
npm run corpus:ocr -- --languages en-US             # match the app's language set
npm test                                            # the assertions, as tests
```

**The corpus is re-staged in place** when a notice is reshot, which deletes
`tools/corpus/ocr/` along with it. Restore the cache from git (`git checkout --
tools/corpus/ocr`) and then use `--only` for the images that actually changed,
so the other records stay byte-identical and the diff shows what moved.

Output lands in `tools/metrics/out/`: `METRICS.md` for humans, `metrics.json`
for diffing one run against the next.

---

## The engine question, settled as far as static evidence can settle it

`expo-mlkit-ocr` does not use ML Kit on iOS at its default settings. That is not
a guess — four independent places say so:

| evidence | what it shows |
|---|---|
| `ios/Podfile.lock` | `ExpoMlkitOcr (0.2.7)` depends on `ExpoModulesCore` and nothing else. No `GoogleMLKit` pod anywhere in the file. |
| `ExpoMlkitOcr.podspec` | `GoogleMLKit/TextRecognition` is added only when `EXPO_MLKIT_OCR_DISABLE_MLKIT != '1'`. |
| `ios/Podfile` | Line 3 is `ENV['EXPO_MLKIT_OCR_DISABLE_MLKIT'] = '1'`, written by the package's own config plugin. |
| `plugins/withMlkitSimulatorArm64Fix.js` | `shouldDisableMlkit = iosEngine !== "mlkit"`. `iosEngine` defaults to `"auto"`, so the default disables ML Kit — on device as well as simulator. `app.json` passes no props, so we are on the default. |
| `ExpoMlkitOcrModule.swift` | `import Vision` is unconditional; the ML Kit branch is behind `#if canImport(MLKitTextRecognition)`. With no pod, `canImport` is false and `VNRecognizeTextRequest` is what compiles in. |

**So the harness and the iOS app run the same engine family.** Both use
`recognitionLevel = .accurate` with `usesLanguageCorrection = true`. The
package's own README claiming "Google ML Kit Text Recognition v2 for both iOS
and Android" is wrong for the default configuration, which is a good reason not
to take it on trust.

**Android is genuinely ML Kit** (`com.google.mlkit:text-recognition:16.0.1`),
and none of these figures describe it. Android is a compile-check target
(CLAUDE.md §6), so that is acceptable — but do not quote a corpus number as an
Android number.

### What is still not verified

Two differences remain between this harness and the iOS build:

1. **Configuration.** The harness pins Vision revision 3 and declares
   `en-US,es-ES`; the app pins no revision and declares no languages, which
   means English only. Measured: **zero difference across all 79 images.** The
   corpus PDFs are ASCII throughout — no accented characters — so Spanish reads
   identically either way. A corpus with real accents might not, so the language
   set is a parameter (`--languages`) rather than a constant.

2. **Platform.** macOS Vision and iOS Vision are separate model builds shipped
   with separate OSes. Same API, same revision numbering, not guaranteed to be
   the same weights. **Only a device run closes this**, and until it does, say
   "measured with Apple Vision on macOS" rather than "measured with the app's
   recogniser."

To close it: run the corpus images through `expo-mlkit-ocr` on the phone, write
the same JSON format, pull the files into `tools/corpus/ocr/ios-vision/`, and
run `npm run metrics -- --engine ios-vision`. Everything downstream is
unchanged. If the two agree, the corpus numbers transfer to the shipped iOS app
outright.

### Cache format

One file per image at `tools/corpus/ocr/<engine>/<image>.jpg.json`:

```json
{
  "file": "sar7-clean-01.jpg",
  "engine": "apple-vision",
  "revision": 3,
  "sourceWidth": 2000, "sourceHeight": 2666,
  "ocrWidth": 1700,    "ocrHeight": 2266,
  "maxWidth": 1700,
  "lines": [
    { "text": "SUBMIT BY: SEPTEMBER 5, 2026",
      "confidence": 1.0,
      "box": { "x": 0.13, "y": 0.28, "w": 0.42, "h": 0.02 } }
  ]
}
```

Boxes are normalised to the OCR input size with a **top-left origin** — Vision's
native origin is bottom-left and the producer converts, so an ML Kit dump needs
no conversion. There is no timing field: the cache is committed and must be
byte-identical across runs, and a duration never is.

---

## Why the images are downscaled to 1700px

The real captures are 2000px wide; the synthetic variants were generated at
1700px. If each went to the recogniser at its native size, part of every
real-vs-synthetic difference would be resolution rather than degradation. Both
are downscaled to the same 1700px, so the buckets are comparable and the only
difference between them is what was done to the image.

It also matches the app: full-resolution OCR is wasted compute on a phone, and
`expo-image-manipulator` resizes before OCR in the real pipeline too.

Change it with `npm run corpus:ocr -- --max-width 1200`. The width is recorded
in every cache record and in the report header, and the loader refuses a cache
that mixes two widths.

---

## What the report contains, and why it is shaped that way

### Two buckets, never merged

`tools/corpus/README.md` is explicit: real captures are the accuracy claim,
synthetic degradations are a robustness supplement, and merging them produces a
number that means nothing. The harness enforces this structurally — there is no
code path that produces a combined figure, and `corpus-integrity.test.ts` fails
if an image appears in both buckets.

### Conditions are the rows

The result Devansh needs to be able to state is *"deadline extraction is X% on
flat captures and Y% on creased"*. The average of those two is not the result.
So every table is field × condition, and the "all" column is there for
completeness, not as the headline.

### Three metrics, kept apart

| | what it answers |
|---|---|
| **OCR ceiling** | Is the printed value even in the recognised text? The most any extraction could get right. |
| **Precision** | Of the values produced, how many were right. A wrong deadline is worse than a blank one — a blank field is one the user fills in on Review, a wrong one is a reminder on the wrong morning that the user has no reason to doubt. |
| **Recall** | Of the values that were there, how many were produced. How much typing the user is saved. |

The ceiling is what makes a miss attributable: below it is an extraction
problem, at it is an OCR problem. A wrong value counts as both a false positive
and a false negative — the conservative convention, and the right one here.

### Fields are classified by what kind of evidence they are

Not every ground-truth field is a string on the page (`fields.ts`):

- **printed** — literally there. Gets a ceiling.
- **derived** — computed from a printed value and a printed rule.
  `appeal_deadline` is the case: no notice prints a hearing deadline, they print
  *"within 90 days of the date of this notice"*, and the deadline is that date
  plus ninety days. Scoring it against the text would report a recogniser
  failure for a value that was never on the page. It gets no ceiling.
  `corpus-integrity.test.ts` asserts the +90 rule actually holds for all four
  notices that carry the field, so the classification cannot quietly go stale.
- **semantic** — a normalised label standing in for prose. `reason`,
  `action_type`, `required_docs`, `agency`. Classification targets, no ceiling.

### The controlled comparison

`sar7-clean-01`, `-dim-02`, `-angled-03`, `-shadow-05`, `-creased-04` are five
photographs of **one physical sheet**. Ground truth is identical by
construction, so any difference between the five is the condition and cannot be
the document. Everywhere else a condition comparison is confounded by layout —
the creased captures are of different notices with different fields.

The report states what those five rows actually show rather than leaving the
reader to infer it, including when they show no effect at all.

### The repeatability pair

`bilingual-creased-21` and `-24` are two takes of the same sheet under the same
condition. The gap between them is capture noise, and it is the error bar on
every other comparison in the report: **a condition difference smaller than that
gap is not a finding.**

### The logic assertions

Two of the corpus's requirements are not about OCR and would be hidden if
scored as though they were:

- **The chain.** Notices 01 and 02 are one household — Maria Reyes, case
  01-4472-9931 — where 02 is the discontinuance caused by the SAR 7 that 01
  asked for. The data model has to be able to represent that, because it is the
  product's whole argument and it is the demo narrative.
- **The approval.** Notice 10 is good news. The app must not render a red
  countdown or schedule an urgent reminder for it. An app that makes every
  letter look frightening is not a deadline tracker.

Both carry **positive controls**: "notice 10 produces no red countdown" passes
trivially if the countdown never goes red, so the same run asserts that notice
01 *does* go red two days out and notice 02 *does* schedule the urgent
aid-paid-pending tier. The rules under test are `src/lib/urgency.ts`.

---

## Wiring in the extraction cascade

The default extractor is `null` — it produces nothing, so recall is 0 and
precision is undefined. That is not a placeholder, it is the floor: every number
the cascade posts is only meaningful as a distance from it.

When the cascade exists, export from `/src/extraction`:

```ts
export function extract(input: ExtractionInput): ExtractionResult;
```

and run `npm run metrics -- --extractor src/extraction/index.ts`. `ExtractionInput`
carries the OCR lines, their boxes, the page size and **a fixed clock** — the
corpus is scored at 2026-09-01T09:00 local so that relative reasoning resolves
identically on every run.

If the island's own API ends up shaped differently, adapt it in
`extractor.ts`. **Do not bend the island to fit the harness** — the harness is
the thing that is allowed to be inconvenient.

---

## Files

| file | what it is |
|---|---|
| `ocr/vision-ocr.swift` | Apple Vision producer: downscale, recognise, emit JSONL |
| `ocr/run-ocr.ts` | driver — compiles the producer, runs it, writes the cache |
| `corpus.ts` | machine-readable `MANIFEST.md`: photo → notice, condition, bucket |
| `fields.ts` | field taxonomy, normalisers, surface forms, comparators |
| `ocr-cache.ts` | reads and validates the committed text layer |
| `extractor.ts` | the seam where `/src/extraction` plugs in |
| `score.ts` | the counting |
| `logic.ts` | the chain and approval assertions |
| `report.ts` | rendering — no counting happens here |
| `run.ts` | CLI |
