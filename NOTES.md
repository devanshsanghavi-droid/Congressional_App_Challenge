# Carta — decision log

Running record of what was tried, what broke, what was chosen, and why. Newest
entries at the bottom. This file is the source material for submission written
question #4 ("what technical difficulty did you face and how did you address
it"), so decisions are recorded with the evidence that drove them, not just the
outcome.

Convention: every entry is dated, states the decision, and states what would
make us reverse it.

---

## 2026-08-11 — Phase 1, Day 0: project kickoff

Week 1 of the eleven-week plan (SPEC §9). Repo initialised, remote set to
`git@github.com:devanshsanghavi-droid/Congressional_App_Challenge.git`.

### Environment baseline

Recorded so that a future "it worked on my machine" is debuggable.

| Tool | Version |
|---|---|
| Node | 24.13.0 |
| npm | 11.6.2 |
| Xcode | 26.2 (build 17C52) |
| CocoaPods | 1.16.2 |
| git | 2.50.1 |
| Android SDK | **not installed — deliberate, see below** |

### Decision: OCR engine — write our own Apple Vision module

**The question.** SPEC §3 lists three candidate OCR packages and says to prefer
whichever uses Apple Vision on iOS. Before committing, we read the published
TypeScript definitions of all three and the iOS Swift source of the leading one,
because the thing that matters is not "does it do OCR" but *what geometry does
it return* — Layer 1 of the cascade is spatial anchoring, and it can only work
if the OCR result exposes text at a granularity finer than a paragraph.

**What we found.**

| Package | Geometry returned | iOS engine on a real device | Per-item confidence | Corner points | Downloads/mo | First published |
|---|---|---|---|---|---|---|
| `expo-ocr-kit` | **blocks only** | Vision | no | no | 2,286 | Apr 2026 |
| `expo-mlkit-ocr` | blocks → lines → elements | **ML Kit** | no | no | 19,428 | May 2026 |
| `rn-mlkit-ocr` | blocks → lines → elements | ML Kit | no | no | 2,938 | Dec 2025 |

Three findings, in order of how much they changed the plan:

1. **`expo-ocr-kit` — the package SPEC.md named as preferred — is unusable for
   this project.** Its entire result type is `{ text, blocks: [{ text,
   boundingBox }] }`. There is no line or word level. On a dense government
   form a "block" is a whole paragraph or a whole column, so a block-level box
   cannot express "this label sits to the left of this value". Layer 1 would
   have been dead on arrival. The spec has been corrected.

2. **No package on the list gives you Apple Vision on an actual iPhone.**
   `expo-mlkit-ocr` advertises a Vision fallback, but reading
   `ios/ExpoMlkitOcrModule.swift` shows it is a *compile-time* switch —
   `#if canImport(MLKitTextRecognition) … #else` Vision `#endif`. Vision only
   runs when ML Kit cannot be linked, i.e. on the arm64 iOS Simulator. So the
   simulator would run Vision and the phone would run ML Kit: two different
   engines, different line segmentation, different text. Every accuracy number
   we measured would have been measured against an engine we do not ship. For a
   project whose headline artifact is an extraction metrics table, that is a
   hole in the methodology, not just an inconvenience.

3. **All three wrappers discard signal the OS hands them for free.** ML Kit
   exposes `cornerPoints` and `recognizedLanguage`; Vision exposes per-
   observation `confidence` and `topCandidates(n)` alternates. Every one of
   these packages flattens that to an axis-aligned rectangle and a string. The
   confidence model in SPEC §4 would have started with zero signal from the OCR
   engine itself.

**Decision.** Write our own Expo module wrapping `VNRecognizeTextRequest`
directly in Swift. Keep an `OcrEngine` adapter interface so the engine is
swappable, and keep `expo-mlkit-ocr` behind that same interface as (a) the
Android implementation and (b) the comparison arm for the bake-off.

**Why, concretely — four things the wrapper packages cannot give us:**

- `recognitionLanguages = ["en-US", "es-ES"]`. California benefit notices are
  frequently printed bilingually on the same page, and Spanish is half the
  product. This is not reachable through any of the three packages.
- `customWords = ["SAR 7", "CF 377.5", "CalFresh", "Medi-Cal", …]`. Layer 0 is
  a form-ID fingerprint match. Whether Vision reads `SAR 7` or `5AR 7` decides
  whether the highest-confidence layer fires at all. Seeding the recogniser
  with the exact vocabulary we are searching for is a direct accuracy win on
  the single most important extraction step.
- `confidence` and `topCandidates(3)`. Real input to the confidence model, plus
  alternates to test a fingerprint against when the top candidate misses.
- Simulator and device run the same engine, so measured accuracy is shipped
  accuracy.

Secondary benefits: no ML Kit CocoaPods on iOS (smaller binary, no arm64
simulator workaround), and it makes the line already written into the video
script in SPEC §12.1 — "Swift/Objective-C native modules" — true.

**Ownership.** The Swift module is written by Devansh (see AI disclosure in
CLAUDE.md and §13 of the spec). Claude walks through the Vision API and the
Expo Modules bridging and reviews the result.

**What would reverse this:** if Vision's accuracy on the golden corpus turns
out materially worse than ML Kit's, the adapter means we switch by changing one
provider binding. That is the point of the adapter.

**Still doing the bake-off.** Vision vs ML Kit measured on the same corpus, but
as a recorded measurement rather than a fork in the road. The comparison table
is itself a wanted artifact for written question #4.

### Decision: preprocessing is resize + EXIF rotation only, then measure

SPEC §3 and the §4 cascade diagram both describe preprocessing as "deskew,
grayscale, contrast, resize" via `expo-image-manipulator`. That library cannot
do three of those four: its complete action set is `resize | rotate | flip |
crop | extent`. There is no grayscale, no contrast, and no deskew.

Beyond the factual error, the advice itself is dated. Aggressive binarisation
and thresholding are Tesseract-era techniques; Vision and ML Kit are neural
recognisers and generally perform *worse* on hand-thresholded input than on the
original photograph.

**Decision.** Preprocessing is resize + EXIF rotation only. Whether anything
more helps is an experiment to run against the golden corpus, not an assumption
to build on. Spec corrected.

### Decision: no local Android emulator

Android Studio is not installed and will not be. `CLAUDE.md` says iOS is the
primary target and Android only needs to keep compiling; SPEC §12 notes judges
evaluate a video and will not install a build. A local emulator costs a
multi-gigabyte install plus first-build time for a platform nobody will open.

**Decision.** Android is proved by an EAS Android build run at each phase
boundary. If one fails we either fix it or drop the cross-platform claim
honestly in the README. No October days spent on Android.

### Decision: Expo SDK 57

SDK 57 (React Native 0.87) released 2026-06-30, currently at 57.0.12
(2026-08-10) — six weeks of patch releases in, settled enough to build on.

Fallback to SDK 56 is gated on **`op-sqlite` only**. `llama.rn` is at
`0.13.0-rc.0`, but it belongs to Phase 4, which is explicitly cuttable by the
Oct 1 decision point — a release-candidate dependency that may not ship at all
does not get to drive the SDK choice for the whole app.

### Correction: `pdf-lib` does not render

SPEC §8.1 says to fill blank forms with `pdf-lib` and "render to PNG".
`pdf-lib` writes PDFs; it has no rasteriser. The corpus generator needs a
separate rasterising step. Plan: `pdfjs-dist` + `@napi-rs/canvas`, which
rasterises in pure Node with no system dependencies (ImageMagick is not
installed on this machine and we would rather not require it).

The perspective warp is hand-rolled regardless — `sharp` does affine but not
projective transforms, so a homography plus a bilinear sampler gets written by
hand. Reproducible from a seed, which is the property SPEC §8.1 is really
arguing for.

### Decision: Layer 0 is bilingual from day one

CDSS publishes official Spanish translations of the same forms. Building
Spanish label variants into the template fingerprints now — rather than
retrofitting in Week 7 — costs less, and it means the Spanish half of the
product uses the state's own approved wording instead of a from-scratch
translation. `recognitionLanguages` carries `es-ES` from the first spike.

### Decision: redaction is written by one person and tested by another

The SSN redaction matcher (SPEC §5.2) is the highest-stakes correctness surface
in the app: a miss writes a Social Security number to disk. Devansh writes the
matcher; Claude writes the adversarial test suite and the disk-inspection
harness independently, so the tests are not written by the author of the code
they are testing.

### Open — carried into Day 1

- Blank CDSS/DHCS forms to be downloaded into `/tools/forms/` with the revision
  code printed on each one recorded here (`cdss.ca.gov` is not reachable from
  the agent sandbox, so this is a manual step).
- Verify whether the SAR 7 PDF carries AcroForm fields. If it is flat we draw
  values at measured coordinates instead of filling fields — which is the
  better outcome, because it yields exact pixel-level ground truth for every
  value and lets Layer 1 be scored geometrically rather than by string match.
