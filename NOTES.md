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

2. **Which engine `expo-mlkit-ocr` runs on iOS is decided at compile time by a
   config flag, and it is easy to be wrong about which one you are measuring.**
   Reading `ios/ExpoMlkitOcrModule.swift`, the engine choice is
   `#if canImport(MLKitTextRecognition) … #else` Vision `#endif` — a
   *compile-time* switch, not a runtime fallback, because Google's ML Kit
   CocoaPods ship no arm64 iOS Simulator slices.

   *Refined after actually running `expo prebuild` on Day 1:* the package's
   config plugin defaults to `iosEngine: "auto"`, which resolves to **ML Kit
   disabled**. `Podfile.lock` confirms it — zero ML Kit pods in the project.
   So out of the box on iOS this package is Apple Vision on both simulator and
   device, and you only get ML Kit by explicitly setting `iosEngine: "mlkit"`,
   which then will not link on an arm64 simulator at all.

   Either way the methodology problem is real: which recogniser produced a
   given accuracy number depends on a plugin flag, and on the Vision branch the
   package collapses every line into a **single block** (it unions all the line
   rectangles), so block-level structure is meaningless there. For a project
   whose headline artifact is an extraction metrics table, that is a hole in
   the methodology, not an inconvenience.

   Consequence for the bake-off: a genuine Vision-vs-ML-Kit comparison has to
   run ML Kit on the physical iPhone or on Android, never on the simulator.

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

### Open — carried into Day 1 *(originally logged Day 0)*

- Blank CDSS/DHCS forms to be downloaded into `/tools/forms/` with the revision
  code printed on each one recorded here (`cdss.ca.gov` is not reachable from
  the agent sandbox, so this is a manual step).
- Verify whether the SAR 7 PDF carries AcroForm fields. If it is flat we draw
  values at measured coordinates instead of filling fields — which is the
  better outcome, because it yields exact pixel-level ground truth for every
  value and lets Layer 1 be scored geometrically rather than by string match.

---

## 2026-08-11 — Phase 1, Day 1: scaffold

Expo SDK 57.0.12 / React Native 0.86.2 / React 19.2.3, TypeScript strict,
expo-router, expo-dev-client. Not Expo Go — the app links native modules Expo
Go does not contain.

### Decision: SDK 57 confirmed, no fallback to 56 needed

The fallback was gated on `@op-engineering/op-sqlite` only. It installed and
its pod resolved on SDK 57 without complaint, so we stay on 57. `llama.rn` was
deliberately excluded from this decision: it is Phase 4, explicitly cuttable by
the Oct 1 decision point, and currently only a release candidate. A dependency
that may never ship does not get to pick the SDK for the whole app.

### Decision: web target dropped

SPEC §10 forbids a web version, so `react-native-web` and `react-dom` are not
shipping dependencies. This turned out to have a small cost: expo-router's dev
tooling pulls `react-dom` in transitively, and left alone npm resolves it to a
version demanding a newer React than RN 0.86.2 ships with. Resolved with an
`overrides` pin rather than by re-adding the web target.

Also dropped from the default template: `@expo/ui` and `expo-glass-effect`
(experimental, heavy, unused) and `expo-font` (system fonts are the right
choice anyway, because Dynamic Type support is an accessibility requirement).

### Native modules installed up front, on purpose

Every native module for Phases 1–3 was installed in one pass — camera, image
manipulator, file system, secure store, notifications, localization, op-sqlite,
expo-mlkit-ocr — even though most are not used yet. Reason: with a dev client,
adding a native module later means a new native build. One build now beats four
builds spread across September. `llama.rn` is the deliberate exception.

**SQLCipher is intentionally not enabled yet.** Flipping op-sqlite to its
SQLCipher compilation target changes the native build, and the Day 1 deliverable
is a working dev client on the phone. Enabling it belongs inside the two-day
SQLCipher timebox (Phase 1d), where its rebuild risk is budgeted for.

### The extraction island, and what actually enforces it

CLAUDE.md requires `/src/extraction` to be pure TypeScript that runs in plain
Node. Three mechanisms now enforce that:

1. `src/extraction/tsconfig.json` — `"lib": ["ES2022"]`, `"types": []`
2. `eslint.config.js` — bans platform and Node imports in that directory
3. `tests/node/extraction-island.test.ts` — reads the bytes on disk

**These were probed rather than assumed, and the probe changed the design.**
Writing a deliberate violation into the directory and running all three
revealed:

- **The tsconfig alone does not block the network.** A bare `fetch` correctly
  fails with `TS2304: Cannot find name 'fetch'` — but add
  `import type { ViewProps } from 'react-native'` to the same file and the
  error *disappears*, because React Native's type definitions re-declare `fetch`
  globally. So mechanism 1 only holds while mechanism 2 does. They are a pair,
  not redundant copies.
- **The guard test had a bug that made it useless for imports.** It blanked
  string literals before scanning for import specifiers, which turned
  `from 'react-native'` into `from ''` — so it passed a file that plainly
  imported React Native. The import scan and the global scan need different
  preprocessing; they are separate functions now.

Both are recorded because "we wrote three checks" is worth nothing next to "we
tested the three checks and two of them were wrong."

### i18n on day one, not week seven

English and Spanish wired before any screen was written, per the Day 0 decision
to build bilingual from the start. Strings are statically imported and bundled,
with no i18next HTTP backend — the app is fully translated in airplane mode
because the translations were never remote.

### Camera roll blocked at the manifest level

CLAUDE.md rule 6 says captured images must never reach the camera roll. Rather
than relying on never calling MediaLibrary, `app.json` adds Android
`blockedPermissions` for `READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE` and
`WRITE_EXTERNAL_STORAGE`, so a transitive dependency cannot request them either.
On iOS the equivalent is simply never declaring an `NSPhotoLibrary*` usage
string, which the OS treats as a hard denial.

Also removed `ITSAppUsesNonExemptEncryption: false` from the template config.
We bundle SQLCipher, i.e. AES, so asserting "no non-exempt encryption" is a
claim we have not verified. It only matters for App Store submission, which is
not a goal (SPEC §12), so the honest move is to not assert it. Revisit with a
`TODO(verify)` if TestFlight ever becomes relevant.

### Broke and fixed: iOS build

First build attempt was run with its output piped to `tail`, which killed
`xcodebuild` with SIGPIPE partway through the "Build ExpoModulesJSI xcframework"
step. That left a 174 MB corrupted build cache at
`node_modules/expo-modules-jsi/apple/.DerivedData`, and every subsequent build
failed inside Expo's own Swift source:

```
JavaScriptCodable+Date.swift:53:50
  guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds
  type of expression is ambiguous without a type annotation
```

That reads like an Xcode 26.2 / Swift 6.2.3 incompatibility with SDK 57, which
would have been a serious problem — it would have meant downgrading Xcode or
the SDK in week 1. Before acting on that theory it was tested directly: the
exact function was extracted into a standalone file and `swiftc -typecheck`
compiled it without complaint. So the compiler was fine and the cache was not.
Deleting the two DerivedData directories fixed it.

Lesson, recorded because it will happen again: **never pipe a native build
through `tail` or `head`.** The pipe closes, the builder dies mid-write, and the
resulting corruption surfaces later as an error message that points at somebody
else's source code. Redirect to a file and read the file.

### Broke and fixed: Expo SDK 57 does not compile under Xcode 26.2

The real Day 1 blocker, and the first entry here that is a genuine upstream bug
rather than our own mistake.

**Symptom.** Every iOS build failed inside Expo's own Swift source:

```
node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift:53:50
  guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds
  error: type of expression is ambiguous without a type annotation
```

Both operands are `Double`. That should be trivially inferable, which is what
made it worth investigating instead of guessing.

**How it was narrowed down.** Four steps, each one ruling out a hypothesis:

1. Extracted the function into a standalone file and ran `swiftc -typecheck`.
   It compiled. So the compiler was not simply broken, and it was not the code
   in isolation.
2. Suspected a corrupted build cache — an earlier build had been killed by
   SIGPIPE mid-xcframework-build, leaving 174 MB in
   `node_modules/expo-modules-jsi/apple/.DerivedData`. Deleted it and every
   other DerivedData directory. **Still failed.** Hypothesis wrong; recorded
   because a wrong-but-plausible theory is worth the same as a right one when
   the next person reads this.
3. Checked npm for a fixed release. `expo-modules-jsi` is at 57.0.4, which is
   what was installed. No upstream fix exists.
4. Ran the failing build step directly
   (`expo-modules-jsi/apple/scripts/build-xcframework.sh`) to get the exact
   `swift-frontend` invocation, and read the flags. The one that matters:

   ```
   -swift-version 6  -cxx-interoperability-mode=default
   ```

**Root cause.** ExpoModulesJSI compiles with C++ interop enabled, because it
bridges to JSI. C++ interop makes C's `abs` family (`abs(Int32)`, `fabs`, …)
visible to Swift alongside Swift's own generic `abs<T: SignedNumeric>`. Under
Swift 6 language mode the resulting overload set is ambiguous for a `Double`
argument. Confirmed with an 8-line reproduction: the same expression compiles
under `-swift-version 6` alone and fails the moment
`-cxx-interoperability-mode=default` is added.

**Fix.** `abs(milliseconds)` → `milliseconds.magnitude`. For a `Double` these
are exactly equivalent (`magnitude` is `Double`'s own `Numeric` requirement),
and it is a property lookup rather than a free-function call, so there is no
overload set to be ambiguous about. Verified in the reproduction first, then in
the real xcframework build, which then succeeded in 19s.

**Made durable.** A one-line edit inside `node_modules` survives exactly until
the next `npm install`, so it is checked in as
`patches/expo-modules-jsi+57.0.4.patch` and reapplied by `patch-package` from a
`postinstall` hook. The first generated patch was 15 MB because the build script
writes its intermediates *inside* `node_modules`; the generated directories were
deleted and the patch regenerated at 1.4 KB containing only the source change.

**When to remove this.** The moment `expo-modules-jsi` ships a version that
fixes it upstream. `patch-package` fails loudly if the target file has changed,
so an SDK bump cannot silently drop the fix — it will stop the install instead.

**Why this is worth writing down at length.** It is the first thing in this
project that looked like "the toolchain is broken, downgrade Xcode or drop to
SDK 56" — a decision that would have cost days in week 1 and constrained
everything after it. The actual fix is one word. The difference between those
two outcomes was reproducing the failure in isolation before acting on the
first plausible theory.

---

## 2026-08-11 — Phase 1: blank form sources

Form list received (`tools/forms/SOURCES.md`): SAR 7, SAR 7 Addendum, SAR 7A,
NA 960X SAR, NA 960Y SAR, CF 377.6, MC 210.

### Blocked: the agent cannot download California state forms

Not a sandbox problem — verified with sandboxing disabled. Two different blocks:

- **`cdss.ca.gov`** — DNS resolves to 162.2.15.178, but TCP 443 never completes
  the handshake. Connection times out. A network-layer drop, not a WAF and not
  a 403.
- **`dhcs.ca.gov`** — returns HTTP 200 with an Imperva/Incapsula challenge page
  instead of the PDF. Its response echoed the client IP it saw,
  `104.28.157.117`, a Cloudflare range, which explains both: agent traffic
  egresses through a proxy whose address range the state sites refuse.

**Resolution.** Downloading the forms is a manual step for Devansh, in a
browser. `tools/forms/fetch-forms.sh` tries anyway, verifies each file actually
begins with the bytes `%PDF` — which catches the failure mode where a WAF
returns 200 with an HTML challenge page saved under a `.pdf` name, a silently
corrupt corpus input — and prints the exact filenames and URLs to fetch by hand
when it cannot.

### Decided: Spanish comes from the state, not from us

CDSS publishes official Spanish translations of these same forms. Two
consequences, both already committed to on Day 0 and both cheaper now than in
Week 7:

1. Spanish **field labels and standard notice phrasing** are lifted from the
   state's own translations rather than translated by us. Explanation content
   still has to be written, but the vocabulary is authoritative and free.
2. **Layer 0 fingerprints are bilingual from the first template.** Real notices
   are frequently printed in English and Spanish on the same page, and Vision
   runs with `recognitionLanguages = ["en-US", "es-ES"]` from the first spike.

### Open

Revision codes (e.g. `SAR 7 (5/25)`) still to be recorded once the PDFs land.
Template IDs get pinned to the revision they were built against, because a
fingerprint written for one revision may not match the next.

---

## 2026-08-11 — v2 re-scope: local-LLM-first

Direction change, decided by Devansh. SPEC.md and CLAUDE.md rewritten to match.

### Why

The original spec optimised for engineering rigor that no judge will see. The
Congressional App Challenge is judged on a 1–3 minute video and six written
answers, by a congressional office, on three criteria: quality of the idea, user
experience and design, and coding skill. Nobody scores coordinate-space handling.
From here, hours go into the app being **complete, polished, and moving to
watch**.

### Cut

Custom Swift Vision module · the four-layer cascade · the Layer 0 template
registry for six CDSS forms · the ML Kit vs Vision bake-off · the
customWords × usesLanguageCorrection ablation · quad geometry and provenance /
OS-build recording · SQLCipher · the homography perspective-warp corpus
generator.

Nothing had been built for any of these except the SQLCipher dependency, so the
code cost of the reversal was one `npm uninstall`. The design work is recorded
above and is not wasted — the Vision investigation is why we know ML Kit's
geometry is adequate for a pipeline where the user confirms every field.

### New architecture

`photo → expo-mlkit-ocr → redact → deterministic pre-fill + region select →
local LLM with GBNF-constrained JSON → sanity pass → user confirms → schedule`

Working on any letter from any agency beats working on six specific California
forms, as a product and as a demo.

### Correction to the Day 1 note on llama.rn

Day 1 recorded llama.rn as "only at a release candidate" and used that to keep
it from influencing the SDK choice. **That was wrong.** npm's `latest` dist-tag
points at `0.13.0-rc.0`, but a stable line ships alongside it: `0.12.9`,
published 2026-08-04, with releases every 2–4 weeks and 82k downloads/month.
Reading `dist-tags.latest` and concluding "this package is pre-release" is a
mistake worth remembering — check the version list, not the tag.

Pinned to `0.12.9` explicitly so `npm install` cannot pull the RC.

### Verified before committing to the architecture

From the published type definitions of `llama.rn@0.12.9`:

- `grammar?: string` — raw **GBNF** accepted. Also `response_format:
  { type: 'json_schema' }`, but a hand-written grammar is preferred: a JSON
  schema cannot constrain a date to `\d{2}/\d{2}/\d{4}` at the token level, and
  a grammar can. That makes a malformed date structurally impossible rather
  than caught afterward, and it is unambiguously the student's own work.
- `completion(params, callback)` with a per-token callback — streaming is real,
  so "watch the model generate on-device" is an API, not a hope.
- Ships an Expo config plugin.

### Trap found in the llama.rn config plugin

The plugin adds `com.apple.developer.kernel.increased-memory-limit` and
`extended-virtual-addressing` **only when `EAS_BUILD_PROFILE` is `production`**
(or `NODE_ENV=production`). Those entitlements are what allow an iOS app past
the default per-process memory cap. A ~1 GB Q4_K_M model in a development build
without them can be OOM-killed by the OS — and the obvious misdiagnosis is
"the model is too big for the phone, downgrade to 0.5B."

Configured `entitlementsProfile: ["development", "preview", "production"]` so
development builds get them too. Recorded because if the week 1 latency gate had
been run without this, it would have produced a wrong answer to the most
important decision in the project.

### Storage simplified

`@op-engineering/op-sqlite` + SQLCipher → `expo-sqlite` + field-level encryption
with a key in `expo-secure-store`. The privacy claim changes from "the database
is encrypted" to "sensitive fields are encrypted", which is weaker but still
true — and the README and video must say the accurate version.

### Corpus simplified, three dependencies removed

Printed-and-photographed (~20 images) instead of synthetic perspective warps.
`pdf-lib` still fills the forms, but printing a filled PDF needs no rasteriser,
so `pdfjs-dist`, `@napi-rs/canvas` and `sharp` are all no longer needed.

### Kept, deliberately

The extraction island rule, `no-network.test.ts`, and the authorship rules.
They are cheap and they matter. Note the island still has real content under
the new architecture: the GBNF grammar, the extraction schema, prompt
construction, the redaction matcher, region selection, pre-fill heuristics and
the sanity pass are all pure TypeScript and all the student's.

### Open

`TODO(verify)`: printer available for the corpus photographs? Asked twice, not
yet answered. The README has to state whether the corpus was printed or
photographed off a screen.

### Week 1 — benchmark harness built and verified; numbers still pending

Harness is in and proven to build and bundle. The measurements themselves need
the physical iPhone: the simulator runs on the Mac's CPU and would say nothing
about Metal performance on a phone.

Verified on the simulator build:

- `llama-rn (0.12.9)` links and compiles — **0 errors**, `Build Succeeded`.
- The app bundle resolves the whole benchmark path (`initLlama`, the fixtures,
  the GBNF grammar all present in a 5.9 MB dev bundle), so nothing is broken on
  the JS side either.

**Second finding on the memory entitlements — the first fix did not work.**
Day 1's note recorded configuring `entitlementsProfile` to cover development
builds. Checking the *generated* `ios/Carta/Carta.entitlements` after prebuild
showed the entitlements were **absent**: the plugin gates on
`process.env.EAS_BUILD_PROFILE`, which local `expo prebuild` never sets, so no
value of that option can help a local build.

Now declared directly in `app.json` under `ios.entitlements`, and verified
present in the generated file:

```
com.apple.developer.kernel.increased-memory-limit      true
com.apple.developer.kernel.extended-virtual-addressing true
```

Worth recording as a general lesson: **configuring a thing is not the same as
verifying the thing happened.** The config looked right and was wrong, and only
reading the generated artifact caught it. Same failure shape as the Day 1
extraction-island probe.

### What the four benchmark cases are for

Designed so the *differences between them* are the answers, not the absolute
numbers:

| Case | Reads on its own | What its delta answers |
|---|---|---|
| `extraction-grammar` | The real extraction call | Decides 1.5B vs 0.5B |
| `extraction-free` | Same prompt, no grammar | vs grammar: cost of constrained decoding, and whether free output is even valid JSON |
| `explanation-stream` | 400-token generation | How the streamed explanation feels; this is the video shot |
| `extraction-short` | Quarter of the page | vs full page: prices region-selection **before** it is built |

Timings come from llama.cpp's own `timings` field rather than wall-clock timers
around the call, so prefill and generation are separated instead of smeared
together. Prefill is the number region-selection attacks; generation is the one
that governs how the demo feels.

The fixture is a full fictional one-page CalFresh notice rather than a toy
prompt, because prompt tokens dominate cost and a three-line prompt would
produce a flattering number that predicts nothing.

---

## 2026-08-18 — Week 2: the evaluation corpus and the metrics harness

Corpus built and staged by Devansh, copied into `tools/corpus/`. Ten fictional
California notices across five agencies in English, Spanish and bilingual
layouts; **23 real captures** (printed, photographed on the demo iPhone under
five physical conditions) and **56 synthetic degradations**, plus
`ground_truth.json` and both generator scripts. Harness built around it in
`tools/metrics/`.

### The finding worth putting in written answer #4: blur is uncapturable

**iPhone computational photography sharpens document text after capture.** Deep
Fusion and Smart HDR detect text and repair it, so genuine motion blur cannot be
photographed with the stock camera app — every attempt came back near-sharp.

`photos/cf3776-blur-11.jpg` is the evidence: shot deliberately as a blur test,
repaired by the pipeline. It is kept in the corpus under its own condition label
`blur-attempt`, excluded from the "five physical conditions" claim, and the
reason is printed as a footnote in the metrics report rather than being dropped
silently. It is not entirely unscathed — it is the only real capture that loses
`form_id` and `case_number` — but it is not a blurred image and must not be
counted as one.

So blur and sensor noise are generated in software with fixed, documented
parameters (`degrade.py`, seed 20261026). **Everything else — skew, crease,
shadow, low light — is a real physical capture**, because those the phone does
not undo. This is a genuine methodological constraint discovered by trying,
which is exactly what the technical-difficulty question is asking for.

### Measurements (deliverable, not just an input)

`npm run metrics`, Apple Vision revision 3, 1700px OCR input, `null` extractor —
so these are **OCR ceiling** figures: is the printed value present in the
recognised text at all.

| bucket | images | ceiling on printed fields |
|---|---|---|
| real captures | 23 | **97.9%** (188/192) |
| synthetic | 56 | **64.3%** (288/448) |

Real-capture misses, all four of them:

| capture | condition | lost |
|---|---|---|
| `cf3776-blur-11` | blur-attempt | `form_id`, `case_number` |
| `mc210-dimangle-13` | dim + angled | `recipient_name` |
| `mc210-creased-22` | creased | `recipient_name` |

Synthetic ceiling by condition — the cliff is the result:

| condition | ceiling |
|---|---|
| defocus (r=2.2) | 100% |
| noise (σ=9) | 100% |
| underexposed (γ=1.75) | 100% |
| jpeg (q=22) | 98.4% |
| defocus-heavy (r=4.0) | **29.7%** |
| motionblur (15px) | **12.5%** |
| motionblur-diag (21px) | **9.4%** |

Mild degradation costs nothing; past a threshold the text layer collapses
outright. That is an argument for the Capture screen's live "text detected ✓"
indicator (SPEC §7) being a real gate rather than decoration — the difference
between a usable shot and a useless one is not visible to the user, but it is
trivially visible to the recogniser before they leave the screen.

### The controlled comparison saturates — say so rather than dress it up

All five photographs of the same SAR 7 sheet (flat, dim, angled, shadow,
creased) put **every** printed field into the text: 10/10 each, 35–38 recognised
lines each. The repeatability pair (`bilingual-creased-21` / `-24`) agrees on
every field.

So the claim *"deadline extraction is 94% on flat and 71% on creased"* **is not
available from this corpus at this stage.** At the OCR ceiling there is no
condition effect to report. The honest statement is that all five physical
conditions saturate, and the discriminating signal is in the synthetic bucket.
The report says this in the section itself rather than presenting a flat table
as though it were a gradient.

A condition effect may still appear *below* the ceiling once the cascade exists:
the values are all present, and finding them in a skewed or creased layout is a
harder problem than reading them. The harness is built to show that if it
happens.

### Corpus defect found: notice 02 is dated before the deadline it says was missed

Notice 02 (`notice_date` **2026-08-24**) states its reason as the SAR 7 due
**2026-09-05** not being returned. A notice cannot report a failure to meet a
deadline that has not arrived. The 01→02 chain is the demo narrative, so this is
worth knowing before it appears on camera next to a countdown.

Not fixing it now: the sheets are printed and photographed, and regenerating
means reprinting and reshooting. The chain assertion passes on the parts that
hold (same case number, same recipient, recert_due → discontinuance, reason
names the cause's form) and the chronology violation is reported as a **warning**
in the metrics output, not silently tolerated.

If the corpus is ever regenerated, the internally consistent version of notice
02 is:

| field | current | corrected |
|---|---|---|
| `notice_date` | 2026-08-24 | **2026-09-08** (county turnaround after the missed 09-05) |
| `aid_paid_pending_deadline` | 2026-09-03 | **2026-09-18** (notice_date + 10 days) |
| `appeal_deadline` | 2026-11-22 | **2026-12-07** (notice_date + 90 days) |
| `effective_date` | 2026-09-30 | unchanged — still clears the 10-day notice rule |

### The appeal deadline is derived, and that is the §4 rule in miniature

No notice in the corpus prints a hearing deadline. They print *"within 90 days
of the date of this notice"*, and the deadline is that date plus ninety days —
verified to hold on all four notices that carry the field. So `appeal_deadline`
is classified `derived`, gets no OCR ceiling, and is computed by deterministic
code from a number read off the page.

This is exactly CLAUDE.md §4 — the model does not invent legal rules — showing
up as a scoring decision. Had it been classified `printed`, the harness would
have reported an OCR failure on every single notice for a value that was never
there.

### The DST trap is real, caught by a failing test

The first version of the +90 assertion divided a millisecond difference by
86,400,000 and got **90.041666**. Aug 24 → Nov 22 crosses the end of daylight
saving, so one of those days is 25 hours long. Both `daysUntil` and the reminder
ladder now work in local calendar components rather than millisecond
arithmetic, and `tests/node/urgency.test.ts` pins both transitions. Getting this
wrong in the app means an appeal deadline off by a day.

### OCR engine: Apple Vision in the harness, ML Kit in the app

The app reads text with `expo-mlkit-ocr`. ML Kit does not run in Node on a Mac,
and the harness has to run in bare Node (CLAUDE.md §8) or the corpus loop is too
slow to use while iterating. So the corpus text layer is produced with **Apple
Vision**, pinned to revision 3.

**These are therefore not ML Kit numbers**, and the report says so in its header,
in `metrics.json`, and in `tools/metrics/README.md`. Every cache record carries
an `engine` field; the format is engine-agnostic, so a device-side ML Kit dump
drops into `tools/corpus/ocr/mlkit/` and `npm run metrics -- --engine mlkit`
reports it identically. Recorded as an open item below.

Vision at 1700px runs at ~264ms per page on this Mac, which is why the whole
79-image corpus scores in well under a second from cache.

### Decisions

- **The OCR cache is committed.** It makes the metrics table reproducible on any
  machine with no camera and no OCR engine, and it holds the text layer *fixed*
  so that when a number moves, the cascade is the only thing that could have
  moved it. Verified byte-identical across runs — which is why the record
  carries no timing field, and why `metrics.json` carries no timestamp.
- **Both buckets are downscaled to 1700px.** The synthetic variants were
  generated at 1700 and the real captures are 2000; at native sizes part of
  every real-vs-synthetic difference would be resolution. The loader refuses a
  cache that mixes widths.
- **A wrong value counts as both a false positive and a false negative.** A
  blank field is one the user fills in on Review; a wrong one is a reminder on
  the wrong morning that they have no reason to doubt. The arithmetic should
  say so in both directions.
- **`src/lib/urgency.ts` is new**, and it is Claude's, not the island's. The
  approval assertion needed rules to assert against. It holds SPEC §6/§7 only:
  countdown tiers, the reminder ladder, the urgent aid-paid-pending tier. No
  parsing, no I/O, no imports.

### Flagged for Devansh — a product question the harness surfaced

`countdownDate()` falls back to `aid_paid_pending_deadline` when a notice has no
`deadline_date`. SPEC §6 says the ladder is scheduled *from `deadline_date`*,
which means notice 05 (a reduction with no return-by date but an
aid-paid-pending window closing 2026-09-28) gets **only the two urgent
reminders, T-2 and T-1** — no T-30, T-14, T-7. That may be too thin for a
household about to lose $244 a month. Implemented to spec and flagged rather
than redesigned: the fix is a product decision, not a harness one.

### Still open

- **Week 1 gate remains blocked.** llama.rn benchmark numbers still need the
  physical iPhone. Devansh is running it next.
- ML Kit dump from the device, to replace the Apple Vision figures with the
  shipping recogniser's.
- Blank form PDFs into `tools/forms/` (week 8); "worth checking" JSON and the
  ~10 office records still need sourcing.

---

## 2026-08-19 — Corpus v2: notice 02 refixed, two conditions relabelled, engine question settled

### The chronology fix verifies

Notice 02 re-staged with `notice_date` **2026-09-08**, three days after the SAR
7 was due on 2026-09-05. Both arithmetic rules check out and are now asserted in
`corpus-integrity.test.ts` rather than eyeballed:

- aid-paid-pending 2026-09-18 = notice_date **+10 days**, and it lands before the
  2026-09-30 effective date, so the window is real.
- appeal 2026-12-07 = notice_date **+90 days**, matching the other three notices.

**The chain warning is gone.** All 11 logic assertions pass with no warnings.

The old "expect exactly one chronology warning" test is now inverted to expect
zero — which makes it a **regression guard**, because
`tools/corpus/tools/make_corpus.py` was *not* updated with the fix. It still
hardcodes `AUGUST 24, 2026` and `2026-08-24`. Re-running the generator would
silently reintroduce the defect and overwrite the corrected ground truth; the
test now catches that. Worth fixing the generator when convenient, but the
guard is the thing that matters.

### Two conditions relabelled, and it changes the shape of the table

| capture | was | now | why |
|---|---|---|---|
| `na960x-dim-07` | `dim` | **`colour-cast`** | Strong magenta/purple LED cast at normal brightness. A chromatic problem, not an exposure one. |
| `na960x-angled-08` | `angled` | **`inverted`** | Rotated ~180° plus skew. An orientation problem, not a skew one. |

Notice 02 now contributes `flat`, `colour-cast` and `inverted`, and no longer
contributes to `dim` or `angled`. Nine real conditions, up from seven.

Both relabels were the right call for the same reason: a bucket that mixes two
variables produces a number that answers no question. The `dim` bucket is now
three genuinely low-light captures of two notices; before, a third of it was a
brightly-lit magenta one.

### The synthetic na960x variants were stale — caught, not shipped

The reshoot changed `na960x-clean-06.jpg`, which is the source for seven
`na960x-synth-*` variants. Those were *not* regenerated in the staged corpus, so
they still showed the old notice: OCR on `na960x-synth-jpeg` returned "AUGUST
24, 2026" and "September 3, 2026" against ground truth that now says September 8
and September 18. Left alone they would have scored as ceiling misses on
`notice_date` and `aid_paid_pending_deadline` for reasons having nothing to do
with degradation.

Regenerated the seven from the new source with `degrade.py` (seed 20261026).

**Finding: `degrade.py` is not byte-reproducible across Pillow versions.**
Re-running it regenerated all 56 variants with different bytes, and the blur
variants differed *materially*, not just in encoding — `bilingual-synth-motionblur`
went 26 → 22 recognised lines, `cf3776-synth-motionblur-diag` 11 → 8. Cause is
almost certainly the LANCZOS resize at the top of the script: a different Pillow
build resamples slightly differently, and for images already at the recogniser's
threshold a sub-pixel shift flips whole lines.

Priced it before deciding, by scoring the corpus twice:

| synthetic bucket | 49 originals + 7 regenerated | all 56 regenerated |
|---|---|---|
| overall ceiling | **62.5%** | **62.5%** |
| per condition | defocus 96.9 · heavy 25.0 · jpeg 98.4 · blur 12.5 · blur-diag 4.7 · noise 100 · under 100 | 95.3 · 26.6 · 98.4 · 9.4 · 7.8 · 100 · 100 |

±3pp per condition, identical in aggregate. So the toolchain difference is below
the resolution of this bucket, and **the 49 unchanged variants were restored**
rather than churned. Recorded because the "deterministic, byte-identical"
claim in `degrade.py` and MANIFEST.md is now known to hold only within one
Pillow build. The committed images are the artifact of record and the metrics
*are* reproducible from them, which is the property that actually matters.

Toolchain here: Pillow 11.1.0, numpy 1.23.5, Python 3.9.

### Real-capture ceiling by condition, 9 conditions

| condition | n | ceiling |
|---|---|---|
| flat | 8 | 100% (64/64) |
| dim | 3 | 100% (17/17) |
| angled | 3 | 100% (19/19) |
| shadow | 2 | 100% (20/20) |
| **colour-cast** | 1 | **100% (9/9)** |
| **inverted** | 1 | **100% (9/9)** |
| creased | 5 | 97.4% (38/39) |
| dim-angled | 1 | 88.9% (8/9) |
| blur-attempt | 1 | 66.7% (4/6) |

Overall 97.9% (188/192), unchanged. Synthetic 62.5% (280/448).

### The inverted result, and why the 100% is narrower than it looks

**Apple Vision reads a 180°-rotated page without complaint.** 32 recognised
lines against 31 for the flat capture of the same sheet; all nine printed fields
found. Text extraction — regex, lexicon, form fingerprint — is unaffected by
orientation.

**But the bounding boxes come back in the raw camera frame.** The letterhead
that sits at (0.12, 0.12) on the flat capture is at (0.82, 0.51) on the inverted
one. Measured against the flat capture, line positions are off by a mean of
**0.45** of the frame.

Tested the obvious fix and it does not work: applying `x' = 1-x-w, y' = 1-y-h`
halves the error to 0.227 but does not recover the layout, and normalising each
image to its own text region first makes it slightly worse (0.281). The residual
is genuine perspective — this capture is rotation *plus* skew — so recovering
usable geometry needs a homography, which is exactly the work SPEC §10 cut in
the v2 re-scope.

**Detection, though, is nearly free.** On the inverted capture, reading order
comes out semantically correct while y *decreases* on 28 of 31 consecutive line
pairs. Document order running bottom-to-top in the raw frame is an unambiguous
180° tell, and it falls out of OCR you are already running.

**Design consequence for the Capture screen (SPEC §7).** The live "text
detected ✓" indicator should also check y-monotonicity and, when it fails,
say *"turn your phone around"*. That is a one-line geometric test and a string,
versus perspective correction in code — and it is strictly better for the user,
because a re-shot upright photo gives good geometry *and* good text, whereas
correction in code can only ever recover geometry. Recorded as an argument for
the cheap UI fix, with a measurement behind it.

Caveat is rendered in METRICS.md next to the condition, so nobody reads
`inverted 100%` as "orientation is solved".

`colour-cast` needs no such caveat: 31 lines, 9/9 fields, no geometry concern.
Vision is genuinely unbothered by the magenta.

### The engine question — `expo-mlkit-ocr` is not ML Kit on iOS

Devansh's inference from `Podfile.lock` was right, and the mechanism is worse
than an accident. Five places agree:

| evidence | what it says |
|---|---|
| `ios/Podfile.lock` | `ExpoMlkitOcr (0.2.7)` depends on `ExpoModulesCore` alone. No `GoogleMLKit` pod in the file. |
| `ExpoMlkitOcr.podspec` | `GoogleMLKit/TextRecognition` added only if `EXPO_MLKIT_OCR_DISABLE_MLKIT != '1'`. |
| `ios/Podfile` line 3 | `ENV['EXPO_MLKIT_OCR_DISABLE_MLKIT'] = '1'`, written by the package's own config plugin. |
| `plugins/withMlkitSimulatorArm64Fix.js` | `shouldDisableMlkit = iosEngine !== "mlkit"`, and `iosEngine` defaults to `"auto"`. **`app.json` passes no props, so we are on the default — ML Kit off, on device as well as simulator.** |
| `ExpoMlkitOcrModule.swift` | `import Vision` unconditional; ML Kit behind `#if canImport(MLKitTextRecognition)`. No pod ⇒ `canImport` false ⇒ `VNRecognizeTextRequest` is what compiles in. |

The package README says "using Google ML Kit Text Recognition v2 for **both iOS
and Android**". That is wrong for the default configuration. Android *is* ML Kit
(`com.google.mlkit:text-recognition:16.0.1`); iOS is Apple Vision unless you
pass `{"iosEngine": "mlkit"}`, which then breaks arm64 simulator builds.

**So the harness and the iOS app are the same engine family**, both
`.accurate` with `usesLanguageCorrection = true`. The caveat narrows from "these
are the wrong engine" to two much smaller gaps:

1. **Config.** Harness pins Vision revision 3 and declares `en-US,es-ES`; the app
   pins nothing and declares nothing, i.e. English only. **Measured: zero
   difference across all 79 images** — identical recognised text on every one,
   including all five Spanish and bilingual captures. The corpus PDFs are ASCII
   throughout, which is why. A corpus with real accents might not behave the
   same, so `--languages` is now a parameter of the producer rather than a
   constant.
2. **Platform.** macOS Vision and iOS Vision are separate model builds. Same API,
   same revision numbering, no guarantee of the same weights. **This is the one
   a device run has to close**, and until it does the wording stays "measured
   with Apple Vision on macOS".

To close it: run the corpus images through `expo-mlkit-ocr` on the phone, write
the same JSON, pull into `tools/corpus/ocr/ios-vision/`, and
`npm run metrics -- --engine ios-vision`. If they agree, the corpus numbers
transfer to the shipped iOS app outright and the caveat becomes a footnote.

This is the fourth instance of **configuring a thing is not verifying it
happened** — and the first found by reading a lockfile instead of a README.

### Harness changes

- `npm run corpus:ocr -- --only <pattern>` for incremental re-OCR. A corpus
  re-stage `rm -rf`s `tools/corpus/`, which takes the OCR cache with it;
  restoring from git and re-running only what changed keeps the other records
  byte-identical so the diff shows what actually moved. Partial runs verify that
  no cache record is orphaned and that the downscale width matches.
- `--languages` on the producer, to make the harness-vs-app config axis
  measurable.
- `CONDITION_CAVEATS` in `corpus.ts`, rendered in METRICS.md, for scores that
  mean something narrower than they look. `inverted` is the case.
- 71 tests across 4 suites.

### Still open

- **Week 1 gate still blocked** — llama.rn benchmark on the physical iPhone.
- **Device OCR confirmation** — iOS Vision vs macOS Vision, per above.
- `make_corpus.py` still generates the pre-fix notice 02.
- Blank form PDFs (week 8); "worth checking" JSON and the ~10 office records.

---

## 2026-08-19 — Corpus frozen

Re-staged with the generator fix, the Pillow-12.3.0 synthetic set, and the
small-n caveat. `--only na960x` moved exactly the 7 records it should have (the
regenerated synthetic variants); the 3 real na960x captures were unchanged and
re-OCR'd byte-identical, which is the incremental path working as intended.

Numbers unchanged: real **97.9%** (188/192), synthetic **62.5%** (280/448),
71 tests, 11/11 logic assertions, no warnings.

### Small-n rule is now enforced in code, not just documented

`MIN_IMAGES_FOR_RATE = 3` in `corpus.ts`. Conditions below it never render as a
percentage anywhere in the report: they are dropped from the field × condition
matrix entirely and given their own **Existence proofs** table showing raw
counts (`9/9 printed fields found, 1 image`). The coverage table gained a
"supports a rate" row so the constraint is visible before any number is.

**One consequence worth knowing, and it is a cost of the relabel.** Moving
`na960x-dim-07` to `colour-cast` and `na960x-angled-08` to `inverted` took one
image out of each of `dim` and `angled`. Both are now **n=2**, below the line.

So the corpus supports a rate claim for **flat (8) and creased (5) only.**
Everything else — dim (2), angled (2), shadow (2), colour-cast (1), inverted
(1), dim-angled (1), blur-attempt (1) — is an existence proof. MANIFEST.md still
lists dim and angled as claim-supporting, which was true before the relabel and
is not now. Logged, not fixed: the corpus is frozen and this changes no number.

Still the right trade. Two honest buckets beat four that mix variables, and the
README line was never going to be per-condition anyway.

### Frozen until week 8

No further corpus work. The harness runs, the numbers are real, and the next
thing it needs is an extractor to score — which is Phase 2, not more
measurement. If a defect turns up, it goes here and gets fixed in week 8 unless
it blocks the app.

**Next: week 1 latency gate on the physical iPhone, then Phase 2 — the
extraction cascade and the thin spine (photo → OCR → redact → extract → confirm
→ save → one reminder fires).**

---

## 2026-08-20 — Three research tasks: real-OCR probe, local Qwen, content packs

### 1. Deterministic extraction on real OCR — the upper bound does not hold

`npm run probe`. Same approach as `probe_deterministic.py`, ported to the real
OCR cache: 23 photographed captures, nine conditions, scored through the metrics
harness so the comparators and the bucket rules are the same ones the shipped
cascade will face.

| variant | core P | core R | all P | all R |
|---|---|---|---|---|
| pdftotext baseline (clean digital text) | **100%** | 95.5% | 92.9% | 77.5% |
| real OCR, text only | 91.6% | 85.6% | 85.7% | 67.8% |
| real OCR, **text + geometry** | **96.4%** | **87.6%** | 88.6% | 76.0% |

**The 100% precision claim does not survive photography.** That matters because
the whole "deterministic fails safe" argument rested on it. It is now 96.4%, and
the difference is real wrong answers, not just misses.

**But the failure is not where it would hurt most.** Split by field:

| field | precision | what goes wrong |
|---|---|---|
| `notice_date` | **100%** | — |
| `deadline_date` | **100%** | — |
| `appeal_deadline` | **100%** | derived, so it inherits notice_date |
| `aid_paid_pending_deadline` | **100%** | — |
| `action_type`, `program` | **100%** | — |
| `effective_date` | 87.5% | one label/value mis-association on the hardest capture |
| `recipient_name` | 90.5% | OCR misreads: ANH TRAN → "AN TRAN", "ANN TRAN" |
| `case_number` | 91.3% | OCR misread: 01-8813-2205 → 01-**83**13-2205 |

Every date the app schedules on holds 100% precision on real photographs. The
precision loss is concentrated in identity fields, and its cause is character
misrecognition, not parsing. **That is the single most important line in this
entry for the Review screen: the fields most likely to be silently wrong are the
name and the case number, so those are the two that most need to be visibly
verifiable against the photo.**

The wrong case number is the one that worries me. `01-8313-2205` is well-formed,
plausible, and wrong, on a capture that looks fine to a human.

#### Geometry is worth 4.8 points of precision

Reading order is not document order. On `na960x-clean-06` the recogniser emits
`"Notice Date"` as line 8 and `"SEPTEMBER 8, 2026"` as line 14 — six lines
apart, with two other dates in between — and their bounding boxes are both at
**y = 0.292**. Same visual row. No window over the joined string recovers that;
the geometry recovers it exactly.

So SPEC §4's Layer 1 is worth building, and now there is a number for it:
+4.8pp core precision, +2.0pp core recall, +8.2pp on all-field recall.

#### By condition (n≥3 only; the rest are counts)

| condition | n | core precision | core recall |
|---|---|---|---|
| flat | 8 | 98.0% | 94.3% |
| creased | 5 | 96.9% | 91.2% |
| dim | 2 | — | 10/10 fields correct |
| angled | 2 | — | 12/12 |
| shadow | 2 | — | 12/13 |
| colour-cast | 1 | — | 8/9 |
| dim-angled | 1 | — | 4/7 |
| blur-attempt | 1 | — | 3/6 |
| **inverted** | 1 | — | **4/9** |

`inverted` is the prediction from 2026-08-19 coming true. The OCR ceiling on
that capture is 9/9 — every value is in the text — and deterministic extraction
gets 4. Spatial anchoring is reading the boxes upside down. It is the clearest
possible argument for the "turn your phone around" prompt on Capture.

Two probe bugs were fixed mid-run and are worth recording because they are the
kind the cascade will also hit: `\bMedi-?Cal\b` matches the word **"medical"**,
which appears on a CalFresh notice; and walking up an address column to find the
recipient walks into the document title unless it is anchored on the street
line's leading house number.

#### Caveats

The probe is fitted to these ten notices and was written with ground truth
visible. It is an architecture input, not a reportable accuracy figure — the
shipped cascade gets scored through `npm run metrics` like anything else.
`tools/metrics/probe/README.md` says so, in the file.

Also: every value the probe produced that ground truth does not record is
**actually printed on the page** — `worker_id` on seven notices, `case_number`
on the SSA notice, `monthly_amount` on notice 05. Those are ground-truth gaps,
not fabrications. Real fabrication count: **zero**.

### 2. Qwen2.5-1.5B-Instruct Q4_K_M under llama.cpp on the Mac

`brew install llama.cpp`, model in `~/models/`. 866 t/s prompt, ~147 t/s
generation on Apple silicon. **Not the gate** — the iPhone number is still owed.

#### Does GBNF make a malformed date structurally impossible?

**Yes — and that is a narrower guarantee than it sounds.** Three grammars, three
prompts, temperature 0:

| grammar | notice states a deadline | notice states NO deadline | told to output "UNKNOWN", no digits |
|---|---|---|---|
| `\d\d/\d\d/\d\d\d\d` (the shape only) | `09/30/2026` ✓ | `00/00/0001` | `00/00/0000` |
| month 01–12, day 01–31 | `09/30/2026` ✓ | `08/12/2026` | `01/01/2022` |
| the same, plus `null` | `09/30/2026` ✓ | `08/12/2026` | `01/01/2022` |
| **no grammar** | `` ```json {...} `` | `""` | `{"NOTICE": "ACTION", …}` |

Three findings, in increasing order of how much they change the design:

1. **The constraint holds.** Under a direct instruction to emit letters and no
   digits, every grammar-constrained run still produced conformant output. The
   claim in CLAUDE.md §5 is true. The unconstrained run broke the schema
   entirely on the same prompt.

2. **Well-formed is not valid.** The grammar CLAUDE.md actually describes —
   `\d{2}/\d{2}/\d{4}` — accepts `00/00/0001`, and an earlier run of it produced
   `20/09/2026`, month twenty. Constrain the *ranges*, not just the shape:
   `month ::= ("0" [1-9]) | ("1" [0-2])`. Day-versus-month validity (31
   September) is not expressible in GBNF and belongs in the sanity pass.

3. **Valid is not true, and the grammar can *cause* the fabrication.** On the
   approval notice, which states no deadline, the range-constrained grammar
   produced `08/12/2026` — the notice date, presented as a deadline. Well-formed,
   plausible, and false. With no `null` production the sampler has no legal token
   sequence for "not stated", so it must emit something. **The unconstrained
   model got this right** and returned `""`.

   Adding `null` to the grammar was necessary but not sufficient — the model
   still fabricated until the prompt told it to use null:

   | | deadline stated | no deadline |
   |---|---|---|
   | nullable grammar alone | `09/30/2026` ✓ | `08/12/2026` ✗ |
   | nullable grammar **+ "output null, do not guess"** | `09/30/2026` ✓ | `null` ✓ |

   So the rule "never fabricate a date" needs all three: a null production, a
   prompt that names it, and the sanity pass behind both.

#### Does it recover the long tail without corrupting the core?

**No.** Five captures, real OCR text, grammar-constrained, scored against ground
truth with the harness comparators:

| group | who | correct | wrong | missing | invented |
|---|---|---|---|---|---|
| core (dates, case number) | **model** | 12 | **4** | 1 | **2** |
| core | **regex** | **16** | **0** | 1 | **0** |
| long tail | model | 5 | 0 | 0 | **5** |
| long tail | regex | **5** | 0 | 0 | **0** |

The model adds **nothing** on the four long-tail fields — targeted patterns
already get all five instances — and it corrupts four core values and invents
two more. On `na960x-clean-06` it turned every September date into December.
Its `employer` answers were worker IDs three times out of five.

**The honest caveat cuts the other way, and it matters.** The probe's regex was
written with these ten notices visible; the model is zero-shot. On an unseen
letter format the fitted patterns fall off a cliff and the model does not. So
the conclusion is *not* "the model is useless for extraction" — it is:

> On known form layouts, deterministic extraction wins outright and the model
> should not be allowed near the core fields. The model earns its place on
> layouts we have no template for, and on the plain-language explanation, which
> is a generation task with no ground truth to corrupt.

Sample is five captures, one-shot prompt, Q4_K_M, 1.5B. A larger model or a
few-shot prompt would likely narrow it. None of that changes the architecture
decision, which is what this was for.

### 3. Content packs wired in with validation

`content/cross_reference.json` and `content/offices.json`, loaded through
`src/lib/content/` with validation on parse. A malformed or unsourced entry
throws rather than rendering. 89 tests now pass.

- **Parsing takes the raw JSON as an argument.** Node ESM and Metro disagree
  about how a JSON import is spelled (`with { type: 'json' }` or not), so
  `parse.ts` imports nothing and the app barrel and the Node ship gate each
  supply the data. Same discipline as the extraction island, for the same
  reason.
- **Population-level phrasing is enforced mechanically.** SPEC §10's line
  between a cross-reference and an eligibility determination is one word of
  copy, so `requirePopulationLevelPhrasing()` rejects "you may qualify", "you
  are eligible", "usted califica" and friends, in both languages, and runs over
  every shipped string on every `npm test`.
- **`OfficeLocation.confirmHoursNote` is a required field.** The "call to
  confirm hours" line is attached by the loader to every office, so there is no
  way to render one without it. Hours change and a wasted trip across the county
  is a real harm.
- **`npm run content:check` is the ship gate.** Nine items still need a human:
  the USCIS public-charge copy, the CDSS appeal window, three SSA addresses from
  aggregators, and four `medium`-confidence cross-references. Deliberately not
  wired into `npm test` — blocking every run on known items gets the gate
  disabled. The list is pinned in `tests/node/content.test.ts` instead, so a
  *new* unverified entry fails the build.
- Appeals routing is real: Appeals Unit at 353 W. Julian St., state hearings
  800-952-5253, TDD 800-952-8349. Notice Detail's "How to appeal" no longer has
  to be a placeholder.

### Trap: `.ts` import extensions, and verifying it

Bare Node ESM will not resolve an extensionless relative import, and the root
tsconfig rejected explicit `.ts` ones. Added `allowImportingTsExtensions` and
standardised on explicit extensions.

That could have broken the Metro bundle, so it was checked rather than assumed:
`npx expo export --platform ios` with a temporary import of the content loader
in `src/app/index.tsx`. Exit 0, and `californialifeline` — a string that only
exists in `cross_reference.json` — is present in the emitted `.hbc`. The whole
chain resolves. Probe import reverted.

### Also learned

- This build of llama.cpp **cannot parse a GBNF rule split across lines.** A
  newline ends the rule and the next line must start with a rule name. The
  readable multi-line `root` had to become one long line.
- `llama-cli` truncates a long echoed prompt, which swallows a sentinel appended
  to the end of it, so `ask.sh` falls back to extracting the last top-level JSON
  object.

### Still open

- **Week 1 gate: the device benchmark.** Running tonight.
- Nine content items needing human verification (`npm run content:check`).
- `_still_needed` in offices.json: 2–3 community organisations.

---

## 2026-08-20 — The finding: constraining the output made the model hallucinate more

**This is written for written answer #4. It is the most interesting thing this
project has found, and it is a result about a design pattern, not about our app.**

### The claim we started with

From this repo's own design notes, written before any of it was measured:

> A hand-written grammar constrains a date field to `\d{2}/\d{2}/\d{4}` *at the
> token level* — a malformed date becomes structurally unreachable rather than
> caught afterwards.

That is the standard argument for grammar-constrained decoding (GBNF in
llama.cpp, "structured outputs" elsewhere). It sounds airtight. You are not
filtering bad output, you are making it *impossible*: at each step the sampler
is only offered tokens that keep the string on a path the grammar allows.

The claim is true. It is also much narrower than it sounds, and pursuing it
naively made our output **worse** in the one way this app cannot tolerate.

### The experiment

Qwen2.5-1.5B-Instruct, Q4_K_M, llama.cpp on Apple silicon, temperature 0. Three
grammars and one unconstrained control, over three prompts. Each prompt asks for
a deadline as JSON.

| grammar | A: notice states a deadline | B: notice states **no** deadline | C: instructed to output "UNKNOWN" and no digits |
|---|---|---|---|
| shape only — `\d\d/\d\d/\d\d\d\d` | `09/30/2026` ✓ | `00/00/0001` | `00/00/0000` |
| ranges — month 01–12, day 01–31 | `09/30/2026` ✓ | `08/12/2026` | `01/01/2022` |
| ranges **+ `null` allowed** | `09/30/2026` ✓ | `08/12/2026` | `01/01/2022` |
| **no grammar at all** | ` ```json {…} ` | `""` | `{"NOTICE": "ACTION", …}` |

Prompt B is an approval notice — good news, nothing required, no deadline
anywhere on the page. The correct answer is "there isn't one."

### Three findings, in increasing order of how much they matter

**1. The constraint genuinely holds.** Column C is the adversarial case: the
prompt explicitly instructs the model to emit the word UNKNOWN and no digits.
Every grammar-constrained run still produced grammar-conformant output. The
unconstrained model, on the same prompt, abandoned the schema entirely and
returned a completely different object. So the mechanism works exactly as
advertised — you cannot talk the model out of the grammar.

**2. Well-formed is not valid.** The grammar as originally specified —
digit-count only — happily produces `00/00/0001`, and in an earlier run produced
`20/09/2026`, a date in month twenty. The grammar was doing its job perfectly;
its job was just narrower than we thought. Constraining the *ranges* rather than
the shape fixes it:

```gbnf
month ::= ("0" [1-9]) | ("1" [0-2])
day   ::= ("0" [1-9]) | ([12] [0-9]) | ("3" [01])
```

Day-versus-month validity — 31 September — is not expressible in a context-free
grammar without an unreasonable one, so that check belongs downstream.

**3. Valid is not true, and this is where it turns around.** On the approval
notice, the range-constrained grammar returned `08/12/2026`. That is the date
the notice was *written*, presented as a deadline the recipient must meet. It is
well-formed. It is a real date. It is on the page. And it is completely false.

**The unconstrained model got this case right.** It returned an empty string.

The grammar did not fail to prevent the hallucination. **The grammar caused it.**
With no `null` production, there is no legal token sequence that means "not
stated" — so the sampler's only permitted continuations are digits, and the
model must emit some date. We had removed its ability to abstain and then been
surprised that it didn't.

### The fix, and the part that surprised us twice

Adding `null` to the grammar was necessary and **not sufficient**:

| | A: deadline stated | B: no deadline |
|---|---|---|
| nullable grammar alone | `09/30/2026` ✓ | `08/12/2026` ✗ |
| nullable grammar **+ a prompt that names the empty case** | `09/30/2026` ✓ | `null` ✓ |

Making abstention *legal* was not enough; the prompt had to make it *expected*.
The instruction that worked was explicit about the failure mode rather than
generically cautious: *"If the notice does not state a deadline the recipient
must meet, output null. Do not guess. Do not use the notice date."*

So the rule needs three things working together, and any two of them are not
enough:

1. a `null` production in the grammar, so abstaining is reachable;
2. a prompt that names the empty case, so abstaining is expected;
3. a sanity pass behind both, because neither is a guarantee.

### Why it matters here specifically

Carta schedules reminders from dates it reads off a benefit letter. A missing
deadline is a mild failure: the field is blank, the user notices, the user types
it in. A **wrong** deadline is a severe one — the app confidently promises to
remind someone about a date that does not exist, and they have no reason to
doubt it.

Constrained decoding is normally sold as the safe option. On the one axis this
product actually cares about, the naive version made things worse, and the
measurement is the only reason we know.

### The general lesson

> A grammar that cannot express "I don't know" converts every gap in the input
> into a confident fabrication. The constraint doesn't reduce hallucination — it
> relocates it, from malformed output you would have caught into well-formed
> output you won't.

Anyone adopting structured outputs should check that their schema has a
representable empty case for every field that can legitimately be absent, and
should test it on an input where the field genuinely is absent. That test is
easy to skip, because the happy path looks perfect.

### What this changed in the build

The local model is **no longer part of extraction at all**. That decision came
from a separate measurement — deterministic extraction reaches 96.4% precision
on real photographed OCR and 100% on every date the app schedules on, while the
1.5B model corrupted four core values and invented two more on the same text.
The model's remaining job is the plain-language explanation, which is generation
with no ground truth to corrupt.

When that lands, it carries all three requirements above.

---

## 2026-08-20 — Phase 2: the thin spine

Photo → OCR → extract → confirm → save → reminder scheduled. Unstyled, one path,
which is what week 2 is for (SPEC §9). Typecheck, lint, **125 tests**, and an
iOS Metro bundle all clean. **Not yet run on a device** — that is the acceptance
test and it needs the phone.

### What went in

| piece | where | note |
|---|---|---|
| OCR adapter | `src/lib/ocr/recognize.ts` | resize to 1700px, then normalise pixel boxes to 0–1 top-left so the phone and the corpus harness feed the cascade the same shape |
| Upside-down check | `src/lib/ocr/orientation.ts` | pure, 23/23 on the corpus |
| Extraction port | `src/lib/extraction-port/port.ts` | the contract, with per-field risk |
| Scaffold extractor | `src/lib/extraction-port/scaffold.ts` | ⚠️ delete when the island lands |
| Field encryption | `src/lib/db/crypto.ts` | AES-256-GCM, key in the keychain |
| Storage | `src/lib/db/` | SPEC §6 subset: notices, reminders |
| Scheduling | `src/lib/notifications/` | the ladder from `urgency.ts`, local only |
| Screens | `src/app/{index,capture,review}.tsx` | Home, Capture, Review |

### The orientation check had to be redesigned

The signal found on 2026-08-19 — Vision's semantic reading order runs
bottom-to-top on an inverted page — **is not available to the app.**
`expo-mlkit-ocr` sorts lines geometrically before returning them, so by the time
the app sees the result that ordering is gone. The measurement was made against
our own producer, which preserves Vision's native order.

Two other approaches were tested and rejected with data:

- **Confidence comparison.** OCR the image and the image rotated 180°, keep the
  better one. Measured on six captures: the inverted one scores 32 lines at
  0.978 either way. Vision reads upside-down text exactly as well, so there is
  no quality signal at all.
- **Header-keyword position.** Confounded — the form ID with its revision
  (`SAR 7 (Rev. 5/25)`) prints in the *header*, and "Department of Social
  Services" appears in the *footer* address, so both lexicons point both ways.

What worked is a structural fact about mailed letters rather than about these
forms: **the recipient's address block sits in the upper third of page one.**
Anchor on `CITY, ST 12345` and the case-number line, exclude sender addresses,
take the median position.

| | anchors land at |
|---|---|
| 22 upright captures | 0.21 – 0.32 |
| the inverted capture | **0.65** |

23/23 correct, threshold 0.5, margin 0.33. **The inverted class is n=1** — a
wide margin around a single example is not a validated rate, and it is written
in the file as such. It fails safe: no anchors, no opinion, no warning.

### Review is built around the measurement, not around confidence

Dates measured 100% precision on real photographs; `recipientName` and
`caseNumber` measured 90.5% and 91.3%, and those failures are OCR character
misreads that arrive looking plausible. So the screen splits them:

- dates are shown as already checked — asking the user to re-verify nine fields
  teaches them to tap through everything, which is how the one wrong field gets
  confirmed too;
- the name and the case number are flagged **regardless of confidence**, because
  the failure mode *is* a confident wrong answer, and the cursor opens in the
  worst one that actually has a value;
- editing is one tap, because the screen is for correction, not confirmation.

`FIELD_RISK` is per field and set from measurement. A confidence score can
demote a field but never promote one.

### Encryption

AES-256-GCM via `@noble/ciphers`, key in `expo-secure-store` under
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` — excluded from iCloud Keychain and from
backups, so a restore onto a new phone cannot read old notices. Right trade
here: the data is re-photographable, and a benefits history syncing to a
household iCloud account is a real harm.

Case numbers are a per-install salted SHA-256 plus the last four. That is enough
to chain two notices to one case (the Maria Reyes narrative) without storing the
number, and the per-install salt means the hashes cannot be attacked with a
dictionary of county case numbers.

Field-level rather than whole-database, since SQLCipher was cut: the recognised
text is ciphertext, the dates the app queries on are not. Worth being straight
about — whole-database encryption would cover the dates too. What this covers is
the material that would actually harm someone if the file were read.

`saveNotice()` **throws** if handed OCR text with `redacted: false` rather than
skipping quietly. The scaffold has no redaction matcher and reports so honestly,
which means the app currently stores no notice text at all.

### Two bugs the tooling caught that review would not have

- **`Date.now()` during render** in Home's countdown. Caught by the React
  Compiler lint. Also a correctness bug beyond purity: two countdowns on one
  screen could be computed against different milliseconds. The clock is now read
  when the screen loads.
- **Pure date helpers living in the SQLite module.** `isoToLocalMs` sat in
  `db/notices.ts`, so testing it in bare Node dragged in `expo-sqlite` and an
  ESM-only cipher and the suite failed to parse. Split into `src/lib/dates.ts`,
  which is better layering anyway — the extraction port speaks ISO, the database
  speaks millis, and Home and the scheduler both compute days remaining from it.
  A disagreement there would show up as the screen and the notification naming
  different days for the same deadline.

### Owed, and needs the phone

`npx expo run:ios` or an EAS dev build, then: photograph a notice → check the
fields → save → confirm a notification is scheduled. `scheduleProof()` in
`src/lib/notifications/` fires one a few seconds out, because a real ladder's
earliest tier can be weeks away and the acceptance test is "a notification
appeared because I photographed a piece of paper".

Still owed: the device benchmark (no longer blocking anything), and the nine
content items in `npm run content:check`.

---

## 2026-08-20 — The privacy model, field by field

Written so it can be described accurately out loud. **Encryption is
field-level, not whole-database** (SQLCipher was cut in the v2 re-scope), so
"the database is encrypted" would be false. What follows is what is actually on
disk in `carta.db`.

### `notices`

| column | on disk as | why |
|---|---|---|
| `id` | plaintext | random local id, no meaning outside this device |
| `captured_at` | plaintext | epoch millis |
| `program_id` | **plaintext** | "CalFresh", "Medi-Cal". Identifies a *programme*, not a person, and Home groups by it |
| `agency` | **plaintext** | the issuing office |
| `form_id` | **plaintext** | "SAR 7", "NA 960X SAR" |
| `action_type` | **plaintext** | queried on; drives the countdown and the ladder |
| ~~**`recipient_name`**~~ | **COLUMN DROPPED (migration v2)** | superseded 2026-08-26: the name moved into the encrypted `ocr_ref` payload and the column is dropped. The prose below is kept as the record of the decision at the time. |
| `notice_date` | **plaintext** | epoch millis |
| `effective_date` | **plaintext** | epoch millis |
| `deadline_date` | **plaintext** | epoch millis; **indexed**, Home orders by it |
| `appeal_deadline` | **plaintext** | epoch millis |
| `aid_paid_pending_deadline` | **plaintext** | epoch millis |
| `case_hash` | **hashed** | per-install salted SHA-256; **indexed** for chaining |
| `case_last4` | **plaintext, truncated** | last 4 characters only |
| `extraction_source` | plaintext | provenance label |
| `contained_ssn` | plaintext | a 0/1 flag, not the SSN |
| `image_ref` | plaintext **path** | app-sandbox URI. **Superseded 2026-08-26: the photo is deleted by default, and encrypted under the notice key when kept.** The path is still plaintext. |
| `ocr_ref` | **AES-256-GCM ciphertext** | the recognised text of the letter |
| `status`, `locale` | plaintext | |

### `reminders`

Everything plaintext: `fire_at`, `tier`, `urgent`, `os_notification_id`,
`state`. None of it identifies a person, and **iOS holds the notification body
outside our database anyway** — a scheduled notification's text lives in the
system's own store, so a reminder saying "CalFresh: 3 days left" exists on the
device regardless of what we do here. Worth knowing before claiming the
programme name is protected.

### The three things to say plainly

**1. `recipient_name` is stored in plaintext, and it is the most identifying
value in the app.** Not hashed, because Review shows it back, Notice Detail
shows it, and the user has to be able to check that Carta read their own name
correctly — which is the whole point of flagging it as high-risk. A hash cannot
be displayed and cannot be corrected.

This is a real gap and it is a choice, not an oversight. Two options if it
should change: encrypt it like `ocr_ref` and take the decrypt cost on every
Home render, or drop the column and read the name out of the encrypted OCR text
on demand. The second is cleaner and costs a decrypt per notice detail view
rather than per list render. **Not done yet — flagged for a decision.**

**2. `case_number` is genuinely never stored.** Only a per-install salted
SHA-256 and the last four characters. The salt lives in the keychain, so the
hashes are not comparable across devices and a stolen database cannot be
attacked with a dictionary of county case numbers. The hash is what lets two
notices chain to one case — the Maria Reyes narrative — without the number.

**3. The photograph is not encrypted.** `image_ref` is a path into the app
sandbox; the JPEG at the other end is a plain file. On iOS it sits inside the
app container, which is covered by the device's own file protection when the
phone is locked, and it is never written to the camera roll (CLAUDE.md §3
rule 7). But it is a picture of the whole letter, including the name and the
case number, and it is not covered by our key.

### So the honest one-sentence version

> **⚠️ SUPERSEDED 2026-08-26. The current sentence is below; this one is kept
> because it is what the app renders in the video only if nobody re-checks it,
> which is exactly what happened.**
>
> ~~The text of the letter is encrypted with AES-256-GCM under a key that never
> leaves the device; the case number is never stored, only a salted hash and
> the last four digits; the deadline dates, the programme, and the recipient's
> name are stored in plaintext so the app can sort, display and correct them,
> and the photograph is a plain file inside the app sandbox.~~

**Current, as of 2026-08-26** — and this is the string `settings.privacyExact`
renders and `PRIVACY_SENTENCE` pins:

> The text of the letter and the recipient's name are encrypted with AES-256-GCM
> under a key that never leaves the device; the case number is never stored, only
> a salted hash and the last four digits; the photograph is deleted once the text
> has been read, and kept encrypted under the same key if you turn that off; and
> the dates, the programme and the form type are stored in plaintext so the app
> can sort, display and correct them.

**Both drifts understated the app**, which is the interesting part — the copy was
*more* pessimistic than the code, so nothing looked wrong and no user was misled
in the dangerous direction. It was still a claim nobody had re-checked, and a
privacy statement that is not re-checked is a privacy statement you cannot
defend on camera.

That is a weaker claim than "everything is encrypted" and it is the true one.
It is still meaningfully stronger than every alternative in this space, because
**none of it leaves the phone** — which is the property that actually protects
someone, and the one `no-network.test.ts` enforces.

### Key handling

`expo-secure-store` under `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: unavailable while
the phone is locked, excluded from iCloud Keychain and from encrypted backups.
A restore onto a new phone therefore cannot read old notices — right trade
here, since the letters are re-photographable and a benefits history syncing
into a shared household iCloud account is a real harm.

"Delete everything" destroys the keys first (`destroyKeys()`), which makes
`ocr_ref` permanently unrecoverable in one operation regardless of what happens
to the rows afterwards.

---

## 2026-08-20 — Acceptance test in the iOS Simulator: three failures, then a working spine

Ran the full thin spine over three real corpus photographs on iOS 26.2,
iPhone 17 Pro simulator. Not mocked — the same `recognize()`, `saveNotice()`
and `scheduleForNotice()` the screens call.

**Final state: the pipeline works.** Photo on disk → OCR → orientation check →
extraction → SQLite → reminders registered with iOS. Getting there turned up
four real problems, three of which would have shipped silently.

### Result

| capture | OCR | orientation | deadline | name | reminders |
|---|---|---|---|---|---|
| `sar7-clean-01` | 35 lines | upright, anchor **0.207** | 2026-09-05 ✓ | MARIA REYES ✓ | 5 |
| `sar7-creased-04` | 36 lines | upright, anchor **0.215** | 2026-09-05 ✓ | MARIA REYES ✓ | 5 |
| `na960x-angled-08` | 31 lines | **inverted, anchor 0.651** | — | — | 0 |

`osHeld: 11` — iOS is holding all ten reminders plus the proof notification.

Two things worth noting in that table. The orientation anchors measured on
device (0.207, 0.215, 0.651) land almost exactly where the corpus harness
predicted (upright 0.21–0.32, inverted 0.65), which is the first evidence that
the harness and the phone agree about anything. And the ladder is five tiers,
not six: T-30 is correctly suppressed because the deadline is 16 days out.

### Failure 1 — the app could not launch at all

`Library not loaded: @rpath/React.framework/React`, dyld, every launch.

React Native 0.86 ships **prebuilt** `React.framework` and
`ReactNativeDependencies.framework` as XCFrameworks. Eight Expo dynamic
frameworks link against them, `Build Succeeded` with 0 errors — and the
`[CP] Embed Pods Frameworks` phase never copies them into the bundle. The build
is green and the app is dead on arrival.

Worth dwelling on: **a clean build log proved nothing here.** The failure only
appears at dyld time, and only if you actually launch it.

Unblocked for the test by embedding by hand:

```bash
B=~/Library/Developer/Xcode/DerivedData/Carta-*/Build/Products/Debug-iphonesimulator
cp -R "$B/XCFrameworkIntermediates/React-Core-prebuilt/React.framework" "$B/Carta.app/Frameworks/"
cp -R "$B/XCFrameworkIntermediates/ReactNativeDependencies/ReactNativeDependencies.framework" "$B/Carta.app/Frameworks/"
codesign --force --sign - "$B/Carta.app/Frameworks/"*.framework
```

**That is a workaround in DerivedData, not a fix, and it does not survive a
rebuild.** The real fix is to stop using the prebuilt artefacts, which
`ios/Podfile` already supports — add to `ios/Podfile.properties.json`:

```json
"ios.buildReactNativeFromSource": "true"
```

which sets `RCT_USE_PREBUILT_RNCORE=0` and `RCT_USE_RN_DEP=0`, then
`npx pod-install && npx expo run:ios`. **Not applied, because it needs a full
rebuild to verify and an unverified build-config change is worse than a
documented one.** Diagnosis is verified; the fix is not. Do this before the
device build.

### Failure 2 — reminders were scheduled and iOS kept none of them

First run reported `reminders scheduled: 5` and `OS reports 0 scheduled
notification(s)`.

Without notification authorisation, `scheduleNotificationAsync` returns an
identifier and iOS silently retains nothing. Every layer reports success; no
reminder will ever fire. For an app whose entire purpose is the reminder, this
is the worst possible failure — invisible, and it looks like it worked.

Confirmed by fixing it: once authorisation exists, the same code path gives
`osHeld: 11`.

`review.tsx` already gated scheduling behind `requestPermission()`, but it
**silently skipped** when refused. Now it saves the notice and says so:
*"Saved, but no reminders — Carta cannot remind you because notifications are
turned off."* Saving a deadline that will never fire, without saying so, is not
something this product can ship.

### Failure 3 — the recipient name failed on every capture

`recipientName: null` on all three, where the corpus harness extracts it fine.

The device dump explains it, and this is the most useful thing the whole run
produced:

```
 6: MARIA REYES
 7: Case Number: 01-4472-9931      <- right column, interleaved
 8: 1428 STORY ROAD APT 12
 9: Worker ID: SC-2214             <- right column, interleaved
10: SAN JOSE, CA 95122
```

`expo-mlkit-ocr` sorts lines geometrically, which **interleaves the right-hand
column into the left-hand address block**. So "two lines above the city line"
is the street, not the name.

This is the same hazard already documented for reading order and orientation,
now confirmed for a third time and on a mainstream notice rather than an edge
case. **For the extractor: never index relative to a line. Anchor on a column
x-position and walk within it.** The scaffold now does this and returns
MARIA REYES on both upright captures.

### Failure 4 — not a failure: the inverted page behaved exactly as predicted

`na960x-angled-08` produced no deadline and **zero reminders**, while still
extracting the case number, the programme and the action type.

That is the predicted split holding in the running app: text-only matching survives
inversion, geometry-dependent matching does not. And the orientation check
fired — `inverted`, anchor 0.651 — so the user is told to turn the page around
before any of it matters. Scheduling nothing was correct: the alternative is
inventing a date.

### What is still not verified

**A visible notification banner.** iOS grants *provisional* authorisation
without a prompt (status 3), which is what made the run possible — and
provisional delivers **quietly to Notification Center, never as a banner**.

Full authorisation needs one tap on "Allow", and the Simulator cannot be tapped
from the command line: `simctl privacy` has no `notifications` service,
`simctl` has no input injection, and `osascript` is refused
(`-1002, not allowed to send keystrokes`) without Accessibility rights this
machine has not granted.

So: **scheduling is proven end to end (`osHeld: 11`); the banner is not.** One
tap on Allow closes it, on the phone or in the Simulator.

### Notes on the harness itself

- The self-test is `src/app/selftest.tsx`, a dev screen, deleted with
  `bench.tsx` before freeze. It reads images from the app sandbox rather than
  the photo library: driving the system picker needs a human, and CLAUDE.md §3
  rule 7 keeps this app out of MediaLibrary. **The picker sheet itself is
  therefore untested** — everything downstream of `recognize(uri)` is not.
- `xcrun simctl openurl` raises an "Open in Carta?" confirmation that needs a
  tap, so the run is triggered by *staging images* instead, behind `__DEV__`.
- The Mac's LAN IP changed mid-session and the dev client kept the old one
  baked in, which surfaced as "There was a problem loading the project". Use
  `localhost:8082` in the dev-client URL — the Simulator shares the host
  network and it cannot go stale.

134 tests, typecheck and lint clean.

---

## 2026-08-20 (later) — Privacy model, rewritten against what is now true

Supersedes the field-by-field table earlier today. Three things changed: the
recipient's name is no longer a column, the photograph is encrypted, and the
container declares the strongest iOS file-protection class.

### The sentence

> **Everything Carta reads stays on your phone.** The text of your letter and
> your name are encrypted with AES-256-GCM under a key held in the device
> keychain, which never leaves the phone and is excluded from backups and from
> iCloud. The photograph is encrypted with that same key, and by default it is
> deleted once the text has been read out of it. Your case number is never
> stored — only a one-way hash of it, salted per install, plus the last four
> digits so you can recognise it. What is left in the clear is the information
> Carta needs to show you a countdown and sort your notices: the dates, the
> programme name, and which office sent it. Nothing is ever uploaded, and there
> is no account, no server and no analytics.

Use that verbatim. Every clause is checked by `tests/node/privacy.test.ts`.

### Field by field, after today's changes

**`notices`**

| column | on disk as |
|---|---|
| `id`, `captured_at`, `status`, `locale` | plaintext — local ids and timestamps |
| `program_id`, `agency`, `form_id` | plaintext — a programme and an office, not a person |
| `action_type` | plaintext — drives the countdown and the ladder |
| `notice_date`, `effective_date`, `deadline_date`, `appeal_deadline`, `aid_paid_pending_deadline` | plaintext epoch millis; `deadline_date` is **indexed**, Home orders by it |
| `case_hash` | per-install salted SHA-256, **indexed** for chaining |
| `case_last4` | last 4 characters only |
| `extraction_source`, `contained_ssn` | plaintext label and a 0/1 flag — never the SSN |
| `image_ref` | path to an **encrypted** file. Null unless the user turned off "delete the photo" |
| `ocr_ref` | **AES-256-GCM** envelope: the recognised text **and the recipient's name** |
| ~~`recipient_name`~~ | **dropped in migration v2** |

**`reminders`** — all plaintext: `fire_at`, `tier`, `urgent`,
`os_notification_id`, `state`. None of it names a person. Note that **iOS holds
the notification body in its own store regardless**, so a reminder reading
"CalFresh: 3 days left" exists on the device whatever we do here. Worth knowing
before claiming the programme name is protected.

**Files** — the capture is `Documents/notices/<id>.enc`, ciphertext. Decrypted
previews go to the **cache** directory and are deleted when the viewer closes,
so a plaintext copy never outlives the moment it was needed for.

### Three decisions and why

**The name is in the envelope, not re-derived.** The instruction was to read it
out of the encrypted OCR text on demand, and taken literally that loses the
user's correction — `recipientName` is the field they are most likely to have
fixed, because it fails most (90.5% precision) and fails plausibly ("ANH TRAN"
read as "ANN TRAN"). Re-running the extractor later would show them "ANN TRAN"
again, every time, after they had already corrected it. Storing it *inside* the
encrypted envelope gets the same privacy property — not a column, not indexed,
not queryable, unreadable without the key — and keeps what they typed. One
decrypt, on single-record screens only. Home never decrypts anything.

**A path to a plaintext capture is now unrepresentable.** `SaveNoticeInput` no
longer has an `imageRef` field at all. The row is written first, the image is
encrypted afterwards and attached with `setImageRef()`. So there is no code path
that can record a pointer to an unencrypted photo, rather than a convention
saying we would not.

**`NSFileProtectionComplete`, with a caveat.** Set via
`com.apple.developer.default-data-protection` in `app.json`, so iOS keeps every
file in the container unreadable while the device is locked — stronger than the
default `CompleteUntilFirstUserAuthentication`, which stays readable after the
first unlock until shutdown.

⚠️ **This is only safe because Carta has no background execution.** Under
`Complete`, files are unreadable while locked, so a background task touching
SQLite would fail. Reminders are scheduled *with iOS* and fire without our code
running, which is why this is free for us. **If a background task is ever added,
this entitlement has to be revisited** — that is a real constraint, not a
footnote.

### What is still not protected, stated plainly

- **The dates are in the clear.** Someone with the unlocked device and a SQLite
  browser learns that this person has a CalFresh deadline on a given date. They
  do not learn whose, from the database alone.
- **iOS holds notification bodies**, which name the programme.
- **The encryption is only as good as the device passcode.** The key is in the
  keychain at `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; a device with no passcode has
  weaker keychain protection. Nothing we can do about that from inside the app.

That is a narrower claim than "everything is encrypted" and it is the true one.
It is still meaningfully stronger than the alternatives, because **none of it
leaves the phone** — which is the property that actually protects someone, and
the one `no-network.test.ts` enforces.

---

## 2026-08-20 (later) — Correction: the React.framework failure was not a packaging bug

**I reported this morning that RN 0.86's prebuilt frameworks are never embedded
and that the fix was `ios.buildReactNativeFromSource`. That was wrong on both
counts.**

Verified by wiping DerivedData and doing a clean prebuilt build:

```
React.framework:                   PRESENT
ReactNativeDependencies.framework: PRESENT
Build Succeeded
```

**A clean build embeds them correctly.** The original failure came from a dirty
DerivedData — the first `expo run:ios` of the session was interrupted and
overlapped a separate `expo start`, and `[CP] Embed Pods Frameworks` skipped
the copy on the incremental rebuild that followed. The manual embed I did to
unblock the acceptance test was treating a symptom.

And the proposed fix is actively harmful. Setting
`ios.buildReactNativeFromSource: "true"` makes the build fail outright:

```
❌ node_modules/expo-modules-core/ios/Core/Events/EventEmitter.swift:52:17
   guard let emitter else { … }
             ^ sending 'emitter' risks causing data races
```

Building RN from source turns on Swift 6 strict concurrency for the pods, and
`expo-modules-core` does not compile under it. So the "fix" trades a
recoverable state for an unrecoverable one.

**The actual remedy is `rm -rf ~/Library/Developer/Xcode/DerivedData/Carta-*`
and rebuild.** `ios/Podfile.properties.json` is back to where it was. The
lesson stands and is now sharper: *a green build log proves nothing — launch
it* — but the cause was my own interrupted build, not the toolchain.

---

## 2026-08-20 (later) — Privacy changes verified in the Simulator

> **Heading corrected 2026-08-26.** It read "verified on device" over a body that
> says the files were read out of the *simulator container*. Nothing in this
> entry ran on a phone.

Re-ran the acceptance test on the clean build, then read the actual files out of
the simulator container rather than trusting the code.

| capture | orientation | deadline | name | reminders |
|---|---|---|---|---|
| `sar7-clean-01` | upright | 2026-09-05 | MARIA REYES | 5 |
| `sar7-creased-04` | upright | 2026-09-05 | MARIA REYES | 5 |
| `na960x-angled-08` | inverted | — | — | 0 |

### What the database actually contains

```
user_version: 2
columns: id captured_at program_id agency form_id action_type notice_date
         effective_date deadline_date appeal_deadline aid_paid_pending_deadline
         case_hash case_last4 extraction_source contained_ssn image_ref
         ocr_ref status locale
```

No `recipient_name`. A row reads:

```
   case_hash = a35056c89bb9568f221bfc66812a35ab67beb5d467ebe2bc4f2e9e6fe2143b92
  case_last4 = 9931
     ocr_ref = WlDwTa6m52kWZFPs.gI+X/FNO0sit1ybGxjumecC57s8RZma…
```

And grepping the raw `.db` file for `MARIA REYES`, `STORY ROAD` and the full
case number `01-4472-9931` finds **none of them**.

### The photograph really is ciphertext

With "keep the original" turned on, the stored capture:

| check | result |
|---|---|
| `file` says | `data` — not a JPEG |
| first three bytes | `497f56` (a JPEG begins `ffd8ff`) |
| JFIF / Exif / Apple markers | **0** occurrences |
| Shannon entropy | **8.000** bits/byte |

8.000 is the ceiling. For comparison the source JPEG is ~7.5 and carries a JFIF
marker. On the default path the file is not written at all and the camera's
temporary copy is deleted: `plaintextRemains=false` on all three captures, on
both branches.

### A migration bug worth recording

The first run after dropping `recipient_name` failed on every notice:

```
SQLiteErrorException: no such column: "recipient_name"
```

I had removed the column from migration **v1** *and* added the `DROP COLUMN` in
v2. On an existing install that works. On a **fresh** install, migrations replay
from zero: v1 creates the table without the column, then v2 drops a column that
never existed.

**A migration is history. The only safe edit to a shipped one is none.** v1 now
carries `recipient_name` again, with a comment saying why it must stay, and v2
drops it. Fresh installs and upgrades both end at the same schema — confirmed,
`user_version: 2` with the column absent.

### Where the app asks for notification permission

Moved out of launch. It is asked **after the first successful save**, when the
user has just confirmed a deadline and the reason is on screen. A prompt on
first launch, before they have seen what the app does, gets declined — and a
declined prompt on iOS cannot be re-raised.

If it is refused, the notice still saves and two things happen rather than one:
an alert at save time, and a **permanent red block on the Home card** —
*"No reminders set — Carta cannot remind you about this deadline because
notifications are turned off"* with a button into iOS Settings. The card carries
it for as long as it is true. A toast is gone in three seconds; a deadline the
app is silently not going to remind anyone about is the most dangerous state
this product can be in.

Counted per notice by a `COUNT(*)` on scheduled reminders in the same query that
loads the card, so there is no extra round trip.

### Tests

144 across 9 suites. New: `tests/node/privacy.test.ts` checks the invariants
against the source and the migration list rather than prose — no
`recipient_name` column after replaying every migration, no column that could
hold a case number or an SSN, an exact allow-list of remaining columns so
additions to the hot path are a decision rather than a drift, no `fetch` or
`XMLHttpRequest` anywhere under `src/lib/db`, no push-token call in the
notification layer, and `NSFileProtectionComplete` present in `app.json`.

---

## 2026-08-20 (later) — Instrumenting the camera path before it runs

The camera has never executed. Everything verified so far — OCR, orientation,
extraction, storage, scheduling — sits downstream of a file a script placed on
disk. On a phone the input is a 12-megapixel frame with an EXIF orientation tag
arriving through a URI shape nothing here has seen.

`DEVICE-TEST.md` is the tap-by-tap script. What went in to support it:

### One pipeline, three callers

`src/lib/capture/pipeline.ts`. Camera, picker and the dev self-test all call
`runCapturePipeline`. The self-test used to have its own copy of the stages,
which meant it could pass on a path the product does not take. Now a bug found
through the picker is the same bug the camera has.

### Traces, because the failures that matter here are not exceptions

Every stage records **what it produced**, not just whether it threw. That is the
whole design. An image that resizes to the wrong dimensions, OCR that returns
four lines instead of thirty-five, an orientation verdict computed from boxes
that were never rotated — all of those *succeed*. A stack trace says nothing
about any of them; a number says everything.

The one that matters most:

```
ok   ocr            ####ms
       sourceWidth: 3024
       sourceHeight: 4032
       sourcePortrait: true
```

`prepareForOcr` now renders once before resizing to learn the true post-EXIF
dimensions. **If a portrait photo reports `sourcePortrait: false`, the rotation
was not applied and every bounding box downstream is on its side** — which would
break spatial anchoring and the orientation check simultaneously, while every
stage reported success. This cannot be caught in the Simulator, which has no
camera, and it is the single most likely way the device differs.

Traces are copyable from the failure screen and, after the fact, from Home.
They contain stage names, timings, dimensions and counts — **no notice
content**. The deadline value is included because a wrong deadline is the
failure worth debugging; the name and case number are reported as `found`/`none`
only. `tests/node/trace.test.ts` asserts that, because a "Copy details" button
that leaked a recipient's name would turn a diagnostic into a privacy hole.

### The picker

`expo-image-picker`, with usage strings that say what is actually true: Carta
opens a photo you already took and never adds anything to your library. No
editing UI — cropping the page is how someone cuts off the deadline.

It matters beyond being a fallback: **the picker returns an already-rotated
image where the camera may not**, so the two paths can disagree about
orientation. Without the trace that disagreement would be invisible.

### Two bugs fixed while wiring it

- **The failure screen read `error.trace` and nothing set it.** Now
  `CaptureError` carries the trace and keeps the original as `cause`.
- **A failed save left the button spinning forever** and told the user nothing.
  Now wrapped, with an alert that says nothing was lost, and the trace is kept
  either way — a *successful* trace is what proves the reminders really reached
  iOS.

### Still unproven, and it needs the phone

The camera itself, the picker, a real inverted capture, and a visible banner.
`DEVICE-TEST.md` says what to tap and what to report for each. The orientation
threshold in particular is validated against 22 upright files and **one**
inverted one; a real inverted camera capture is the first independent test of
it, and the `anchorPosition` number is the result — upright reads 0.21–0.32,
inverted read 0.65, threshold 0.5.

151 tests.

### First latency measurement of the OCR stage

From the traces above, Simulator (Mac CPU, so an upper bound on nothing — read
it as a ballpark, not a device number):

| capture | ocr stage | orientation | extract |
|---|---|---|---|
| `sar7-clean-01` | **1691ms** | 0ms | 0ms |
| `sar7-creased-04` | **1699ms** | 0ms | 0ms |
| `na960x-angled-08` | **1725ms** | 1ms | 1ms |

**The `ocr` stage is the entire cost.** Orientation and extraction are free —
0–1ms each — which is worth knowing before anyone optimises the wrong thing.

That ~1.7s covers `expo-image-manipulator` rendering twice (once to read the
post-EXIF dimensions, once after the resize), the JPEG re-encode, the bridge
crossing, and the recognition itself. The bare Vision recogniser on the same
images in the harness takes ~264ms, so **roughly 1.4s of this is preprocessing
and bridge overhead, not recognition.**

Two consequences:

1. Capture needs a visible "Reading the letter…" state, which it has. 1.7s of
   apparently-nothing is where a user taps again.
2. If it needs to come down, the target is the double render, not the
   recogniser. Reading dimensions costs a full render pass and exists only to
   answer the EXIF question — once the device run confirms whether rotation is
   applied, that pass can go.

Device numbers may differ in either direction: a phone's Neural Engine is
faster at recognition than a Mac CPU, and its storage is slower. `DEVICE-TEST.md`
asks for the number.

Also noted: `ocrHeight` is 2267 here against 2266 in the corpus harness — a
one-pixel rounding difference between `expo-image-manipulator` and the Swift
producer's thumbnail. Harmless, and worth knowing before someone treats a
one-pixel discrepancy as a bug.

---

## 2026-08-20 (later) — Device build: two blockers, and one that costs us the benchmark

First attempt at a physical-device build. Two failures, neither in our code.

### 1. Developer Mode disabled

```
error: Developer Mode disabled. To use Devansh iPhone for development,
       enable Developer Mode in Settings → Privacy & Security.
```

Settings → Privacy & Security → Developer Mode → on → restart. One time. The
device also shows as `connected (no DDI)` in `xcrun devicectl list devices`
until it is done — that is the same thing said differently.

### 2. A personal Apple team cannot sign this entitlement set ⚠️

```
error: Cannot create a iOS App Development provisioning profile for
"com.devanshsanghavi.carta". Personal development teams, including
"Devansh Sanghavi", do not support the Extended Virtual Addressing and
Push Notifications capabilities.
```

Xcode refuses to create a profile *at all* if the entitlement set contains
anything the team cannot hold. Four entitlements were declared; two are blocked.
Handled with a local config plugin, `plugins/withPersonalTeamEntitlements.js`,
so `app.json` keeps the full intended set and the plugin removes what cannot be
signed today. Delete the plugin from the array when there is a paid account.

**`aps-environment` — removed permanently, and this is a correction.** Added by
expo-notifications' own plugin, which assumes remote push. Carta has never
wanted it: every reminder is computed on the device and scheduled locally with
iOS, there is no push token call anywhere, and `privacy.test.ts` asserts that.
Removing it makes the app *unable* to receive a remote push, which is a stronger
version of the promise than a comment saying we do not. This is a small win we
got by accident.

**`extended-virtual-addressing` — removed temporarily, and it costs something
real.**

> ⚠️ **The week 1 llama.rn benchmark cannot be run meaningfully on this build.**
> That entitlement is exactly what CLAUDE.md §13 records as necessary for a
> ~1 GB GGUF: without it the model is OOM-killed, and the failure *misreads as*
> "the model is too big, downgrade to 0.5B". Any tok/s figure measured on a
> build made with this plugin active is measuring the wrong thing, and a
> crash-on-load means nothing.

`increased-memory-limit` survives — a personal team can hold that one — so the
memory ceiling is still raised, just not the address space. Whether 1.1 GB fits
under that alone is unknown and not worth guessing at.

This does not block anything on the critical path: the local model stopped being
part of extraction on 2026-08-20, so the capture path, Review, storage and
reminders are all unaffected and the device test can proceed in full.

**Decision needed:** the benchmark needs a paid Apple Developer account ($99/yr)
before its numbers mean anything. Not urgent — the model is explanation-only now
— but it should not be discovered in October. Note that CLAUDE.md's "no paid
services" rule is about *the app's dependencies*, not the developer account, so
this is not a rule violation, just a cost.

### Also learned: Expo config plugin mods run in reverse registration order

`withPersonalTeamEntitlements` had to be moved to **first** in the `plugins`
array. Registered last, it ran first, and expo-notifications — which re-adds
`aps-environment` whenever it finds it missing — then put it straight back.
First-registered runs last. Comment to that effect is in the plugin, because
the next person to touch plugin order will hit this.

---

## 2026-08-20 (evening) — We named the app after an App Store product and Apple silently refused to verify it

Most of an evening lost to a device install that would not launch. The
diagnosis walked through three hypotheses and the first two were wrong, which is
the interesting part.

```
Unable to launch com.devanshsanghavi.carta because it has an invalid code
signature, inadequate entitlements or its profile has not been explicitly
trusted by the user.
```

Three named causes, and iOS does not say which. On the phone, Settings showed
the developer certificate as **trusted** while the app itself sat at **Not
Verified**, and tapping *Verify App* produced a spinner for a split second and
then nothing — with the message *"will not run until it is verified using your
network connection."*

### What it was not

**Not the network**, despite what the message says. Tried on strong Wi-Fi and on
cellular, airplane-mode cycled, clock automatic.

**Not the entitlements**, which was the leading hypothesis and a good one:
Carta requests two capabilities a personal team ordinarily cannot hold, and one
of them (`default-data-protection`) had been added that same day, after the last
time anything installed on this phone. Tested properly by bisect — and cheaply,
because entitlements only affect *signing*, so the built `.app` can be re-signed
with a different set in seconds rather than rebuilt in fifteen minutes. The
existing profile is a superset, so signing with a subset is valid.

| test | entitlements | result |
|---|---|---|
| A | neither | **failed** |
| D (control) | both, re-signed | failed |
| — | both, pristine build | failed |

A failing is decisive: the failure survives removing everything, so no
entitlement can cause it. The control matters as much — it proves the re-signing
method was faithful rather than itself being the problem, and the re-signed
bundle verified as `valid on disk` / `satisfies its Designated Requirement`.

**Not the free-account app limit.** `devicectl device info apps` showed exactly
one development-signed app on the phone. Everything else was App Store.

**And a premise worth correcting**: "my other apps install fine" turned out not
to be evidence. There were no other development-signed apps on the device — the
others all came from the App Store, which never touches free provisioning. There
was no baseline showing the handshake had *ever* worked here.

### What it was

**`ppq.apple.com`** — Apple's anti-piracy service, checked during free-account
app verification. PPQ matches sideloaded apps against App Store apps to catch
clones, and it is enforced for developer accounts created from 2021 onward.

**Carta is a real App Store app** — the cap-table company. Our bundle identifier
was `com.devanshsanghavi.carta`.

It fits every symptom: rejection is instant rather than a timeout, because
nothing is waiting on a slow network; the message blames the network because
that is the generic string returned for *any* PPQ rejection; the entitlements
were irrelevant because verification never got as far as evaluating them; and no
development-signed app had ever verified on this device, so there was nothing to
contradict it.

Tested by changing the bundle identifier to
`com.devanshsanghavi.noticetracker` and `CFBundleDisplayName` /
`CFBundleName` to `NoticeTracker` in one attempt — both, deliberately, because
whether PPQ matches on the display name as well as the identifier is not
documented and two rebuilds is an hour.

### Why this matters beyond tonight

**The product is called Carta.** It is the name in the video, the README and the
submission. If the *name* is what PPQ objects to, that is a decision to make in
August, not October.

The likely answer — pending the test result — is that the two are separable:
PPQ matches on the bundle identifier, which nobody sees, while the display name
is ours to choose. An app can ship as "Carta" from
`com.devanshsanghavi.noticetracker` with no collision. But that has to be
demonstrated, not assumed, and the test above is what demonstrates it.

### The lesson

A build can be signed correctly, provisioned correctly, entitled correctly, and
installed successfully, and still be refused at launch by a service that has
nothing to do with any of that — reporting the failure as a network problem.
**The error message named three causes and the real one was a fourth it did not
mention.** When a diagnostic message enumerates possibilities, that list is not
necessarily exhaustive.

Also worth recording: the bisect took two minutes because entitlements are a
signing-time property. Re-signing to test a hypothesis, instead of rebuilding,
turned an hour of guessing into a decisive answer.

---

## 2026-08-20 (late) — Paid team, and what the Simulator can actually settle

**The free personal team was the whole problem.** A paid account existed the
entire time; the assumption that simulator work did not need it meant every
device install went through `ppq.apple.com`, Apple's anti-piracy check, which
only applies to free provisioning. Paid accounts skip it.

So the PPQ hypothesis was never proven or disproven — it stopped mattering.
Recorded because the reasoning was sound and the symptom pattern is worth
knowing, but **the actual root cause was signing with the wrong team**, which is
a much more boring answer and the correct one. Two evening hours on
free-provisioning archaeology that a one-line team change removes.

Switched: team `A4367BS428` via `plugins/withDevelopmentTeam.js` (pinned in a
plugin because `ios/` is regenerated by prebuild and a hand edit in Xcode does
not survive). Bundle id stays `com.devanshsanghavi.noticetracker` —
non-colliding costs nothing and removes a variable permanently. **Display name
back to "Carta"**, which is what appears on the home screen, in the video and in
the submission.

`plugins/withPersonalTeamEntitlements.js` is **deleted from the plugin list**: a
paid team can hold `extended-virtual-addressing`, so the llama.rn benchmark gets
the entitlement it needs and the earlier warning about invalid benchmark numbers
is withdrawn. All four entitlements are back in the generated project.

### What the Simulator can prove tonight

**EXIF orientation — yes, and this is the valuable one.** The `sourcePortrait`
question did not actually need a phone. An iPhone stores the sensor-native
landscape buffer and tags it `Orientation = 6`; that is reproducible with
Pillow. Three fixtures were built from `sar7-clean-01`:

| fixture | stored pixels | EXIF orientation | should display as |
|---|---|---|---|
| `exif-upright` | 2000×2666 | 1 | 2000×2666 |
| `exif-rotate90` | **2666×2000** | **6** | 2000×2666 — *the camera case* |
| `exif-rotate180` | 2000×2666 | 3 | upside down |

`xcrun simctl addmedia` **preserves the tags** — verified by reading them back
out of the Simulator's DCIM store — so the library round-trip does not launder
them.

Caveat worth stating: running these through the sandbox tests
`expo-image-manipulator`'s EXIF handling, which is the core question. It does
**not** test what `ImagePicker` hands back, since the picker may normalise and
re-encode before we ever see the file. Those are two different questions and
only the first is answerable without a tap.

### What still genuinely needs hardware

- **The camera itself.** `takePictureAsync` on real optics, at 12 MP, with the
  frame the phone actually produces. Everything downstream is now testable, but
  the source is not.
- **The picker UI.** Selecting a photo needs a tap; `simctl` has no input
  injection and `osascript` is refused Accessibility rights on this machine.
  The pipeline behind it is tested; the sheet is not.
- **A real inverted capture.** The threshold is validated against 22 upright
  files and one inverted one. A tagged fixture tests EXIF, not optics — a real
  180° photograph has perspective and lighting that a rotated file does not.
- **Whether a banner appears in normal use.** See below; a Simulator banner is
  evidence the scheduling and payload are right, not that a phone will show it.

### Results — Simulator, paid team, 2026-08-20 late

**1. EXIF orientation is applied. The `sourcePortrait` question is answered.**

| fixture | on disk | EXIF | `prepareForOcr` reports | OCR | verdict |
|---|---|---|---|---|---|
| `exif-upright` | 2000×2666 | 1 | 2000×2666, portrait **true** | 35 lines | upright, 0.207 |
| `exif-rotate90` | **2666×2000** | **6** | **2000×2666, portrait true** | 37 lines | upright, 0.207 |
| `exif-rotate180` | 2000×2666 | 3 | 2000×2666, portrait true | 35 lines | upright, 0.207 |

The middle row is the camera case and it is decisive: a file stored **landscape**
with `Orientation = 6` is reported by `prepareForOcr` as **portrait**.
`expo-image-manipulator` normalises rotation before anything downstream sees a
dimension or a bounding box. All three found the deadline and all three landed
on the same anchor position, 0.207, which is what you would expect if
normalisation happens upstream of everything.

So the `sourcePortrait: false` disaster case does not occur, and the diagnostic
built for it stays as a regression guard rather than a live worry.

⚠️ **`exif-rotate180` does NOT test the orientation detector**, and reading it
that way would be a mistake. It reports `upright` *because EXIF correction
rotated it* — by the time the detector runs, the page genuinely is upright.
A real inverted photograph carries **no** such tag: the phone was held level, so
EXIF says "upright" while the page on the table is not. That case is still
untested and still needs hardware.

**2. A real visible banner, from our own locally-scheduled notification.**

The permission alert cannot be tapped from the command line, and provisional
authorisation delivers silently — so the banner had never been seen. Solved by
editing the Simulator's own BulletinBoard store
(`scratchpad/grant-notifications.py`): the per-app
`authorizationStatus` follows `UNAuthorizationStatus`, so flipping 3
(provisional) to 2 (authorized) and `alertType` to 1 (banner) grants what the
tap would have. It survives a reboot.

Two banners, and the distinction matters:

- via `simctl push` — proves banners display at all. A *remote* payload, so it
  says nothing about our code.
- via **our own `scheduleNotificationAsync`** — *"Carta is set up / This is the
  reminder you just set for CalFresh."* That is `notifications.proofTitle` and
  `proofBody` from `en.json`, rendered by iOS from a request our scheduler made.

`osHeld: 16` at the time it fired. **The loop is closed in the Simulator:**
image → OCR → orientation → extract → SQLite → scheduler → iOS → visible banner.

**3. Display name and bundle id are now independent.** The app shows as
**Carta** on the home screen and in the notification, from bundle id
`com.devanshsanghavi.noticetracker`. Whatever PPQ would or would not have done,
the product keeps its name — that October question is closed.

### Still needs hardware, and the list is now short

| what | why the Simulator cannot |
|---|---|
| the camera | no optics; `takePictureAsync` has never run |
| the picker sheet | selecting a photo needs a tap, and there is no input injection |
| a real inverted capture | EXIF fixtures test rotation, not a level phone over a rotated page |
| a banner in normal use | Simulator authorisation was granted by editing a plist, not by a user |

Everything between the input and the banner is now proven.

---

## 2026-08-21 — Device provisioning: stopped, and why

**Not an engineering problem. Stopped work on it.**

The device build is blocked behind an Apple account-administration gate:

```
Unable to process request - PLA Update available: You currently don't have
access to this membership resource.
```

**Only the Account Holder can accept the Program License Agreement.** The Apple
ID being used holds the **Admin** role on team `A4367BS428`, and Apple returns
exactly that "you don't have access to this membership resource" wording to an
Admin while a PLA update is pending — which is why accepting it appeared to have
been done and the error persisted.

Everything else in the failure is downstream. With the agreement pending, Apple
refuses every provisioning request, so Xcode falls back to the wildcard
`iOS Team Provisioning Profile: *`, which carries no capabilities and no
devices. That produces the six follow-on errors about Data Protection, Extended
Virtual Addressing, Increased Memory Limit, Push Notifications and the
unregistered device. None of them are real; they are all the same refusal.

Corroboration that the team itself is healthy: the only `A4367BS428` profile on
this Mac is a **Store** profile for a different app, created before this PLA
update. New provisioning requests are what is frozen, not the membership.

### The chain of blockers, for the record

Each one masked the next, which is why this took an evening:

1. Developer Mode disabled on the phone
2. Signing with the **free** personal team, whose installs go through
   `ppq.apple.com` — Apple's anti-piracy check — and our bundle id was
   `com.devanshsanghavi.carta` while *Carta* is a real App Store app
3. Wrong team: a paid account existed the whole time and was not being used
4. PLA not accepted on the paid team
5. Device not registered to the paid team
6. Command-line `xcodebuild` cannot see Xcode's Apple ID accounts, so
   `-allowProvisioningUpdates` reported *No Accounts* even with both IDs signed
   into the GUI

### A correction I made mid-diagnosis

I reported "provisioning is solved" after one run showed no provisioning errors.
That was wrong: the run had failed at **destination resolution**, before the
signing phase was ever evaluated. Absence of an error is not evidence when the
code path did not execute. Caught by checking which profiles actually existed
on disk afterwards — only free-team ones did.

### What is deferred, and what it costs

| deferred | cost |
|---|---|
| `expo-camera`'s `takePictureAsync` | real, but narrow — the frame it produces is now testable via AirDropped HEIC |
| the picker sheet UI | narrow — the pipeline behind it is tested |
| a banner from a real user tap | narrow — the banner itself is proven, only the grant path differs |
| the llama.rn benchmark | none right now; the model left the extraction path on 2026-08-20 |

Deliberately **not** worked around. Free-team signing is what caused most of
this and going back to it would trade a known gate for a subtler one.

---

## 2026-08-21 — Real iPhone captures through the pipeline: the detector holds at n=4

Four photographs from the stock Camera app, HEIC, unedited, byte-identical from
the phone. Run through `runCapturePipeline` in the Simulator. **Fixture only —
the scored corpus stays frozen.**

| file | stored | EXIF | portrait | verdict | anchor | truth |
|---|---|---|---|---|---|---|
| `device-upright` | 3023×4030 | 1 | true | upright | **0.249** | upright ✓ |
| `device-dim-angled-upright` | 5712×4284 | **6** | true | upright | **0.385** | upright ✓ |
| `device-inverted-angled` | 5712×4284 | **8** | true | inverted | **0.651** | inverted ✓ |
| `device-inverted` | 3023×4031 | 1 | true | inverted | **0.757** | inverted ✓ |

**4 / 4 correct.** No false warning on either upright capture, which was the
outcome that mattered most — both were deliberately bad, one a heavy magenta LED
cast and one dim and angled, since that is where a false positive comes from.

### 1. The threshold holds, and the margin narrowed from the side I did not expect

Real camera data, threshold 0.5:

```
upright    0.249            0.385                          <- max
                                    0.5 threshold
inverted                                    0.651   0.757  <- min
```

Gap **0.266**, against 0.33 on the corpus. The narrowing is real and it is worth
being precise about *which* side moved: the corpus upright band was 0.21–0.32
and the new upright maximum is **0.385**, on the skewed capture. The skewed
*inverted* one did not drift toward 0.5 — it sat at 0.651, comfortably clear.

**So skew pushes an upright anchor upward, toward the threshold.** That is the
false-positive direction, which is the direction that matters: a false warning
teaches the user to ignore the warning, while a missed one costs a re-shoot.
A more severely skewed upright capture is the case that would break this first.

Not moving the threshold. Two reasons: with n=4 real captures plus 23 corpus
ones, moving a boundary to fit the most recent photograph is how you overfit to
whatever was shot last; and the honest fix if the margin does close is a wider
anchor set, which adds evidence rather than redrawing a line. Recorded as the
thing to watch.

Locked in by `tests/node/orientation-device.test.ts`, which asserts the measured
bounds (upright < 0.45, inverted > 0.6, gap > 0.15) rather than merely the
verdicts — so a change that keeps all four verdicts right while collapsing the
margin still fails.

### 2. `sourcePortrait` is true on all four, and two of them earned it

The fixture was described as all four being Orientation = 1. **Two are not:**
`device-dim-angled-upright` is 6 and `device-inverted-angled` is 8, both stored
**landscape** 5712×4284 and both corrected to portrait 4284×5712 by the time
`prepareForOcr` reports.

`sips` is why this was missable — it reports `orientation=<nil>` for HEIC and
does not surface the tag. Only `CGImageSourceCopyPropertiesAtIndex` does.

This makes the fixture better than advertised. The earlier EXIF evidence used
tags written by Pillow; these are **camera-written**, on the real HEIC path, and
they confirm rotation is applied end to end. And `device-inverted.heic` is still
a clean test of the detector — orientation 1, nothing to correct, phone level
and the paper turned.

### 3. A bug in our own OCR producer, found by the disagreement

The Swift producer reported those two files as landscape while the app reported
portrait. The app was right. `CGImageSourceCreateImageAtIndex` returns the
stored buffer **untransformed**, and the producer computed its resize target
from that — so a 5712×4284 capture tagged 6 was scaled to **1276×1700** instead
of 1700×2267. Different scale, different recognition, silently.

Harmless on the corpus, where every JPEG is orientation 1 — verified by
re-running the whole cache and confirming it is byte-identical. Wrong on
anything straight off a camera. Fixed by reading the orientation tag and
swapping the dimensions for the transposed cases (5–8); the producer and the app
now agree exactly.

**Worth noting how it surfaced**: not from a failing test, but from two
independent implementations of the same step disagreeing about a number. The
app and the harness were never meant to be a cross-check on each other and that
is exactly what they turned out to be.

### 4. Extraction: the predicted inverted split, confirmed on real captures

| file | recipient | case number |
|---|---|---|
| upright ×2 | **found** | found |
| inverted ×2 | **none** | found |

Exactly the split predicted from the corpus: text-only matching survives
inversion, geometry-dependent matching does not. Confirmed now at n=2 on real
camera input rather than one corpus photograph.

`deadline: none` on all four, and that is **not** a device finding — all four
are notice 02, whose deadline is stated as prose ("...WILL STOP ON SEPTEMBER 30,
2026") rather than behind a `SUBMIT BY:`-style label. The scaffold only handles
labelled deadlines; the same file scored the same way on the corpus JPEG. It is
scaffold thinness and it goes away with the real cascade.

### 5. OCR latency on real camera input

| capture | pixels | ocr stage |
|---|---|---|
| `device-upright` | 12 MP | 1945 ms |
| `device-inverted` | 12 MP | 1896 ms |
| `device-inverted-angled` | 24 MP | 2301 ms |
| `device-dim-angled-upright` | 24 MP | **2839 ms** |

Against ~1700 ms on the 5 MP corpus JPEGs. Orientation and extraction remain
0–1 ms, so the `ocr` stage is still the entire cost, and it scales with input
pixels — which is an argument for resizing *before* handing anything to the
recogniser, which the pipeline already does. Simulator on Mac CPU; a phone's
Neural Engine may differ in either direction.

Recognition quality did not degrade with the harder captures: **31 lines and
~1,300 characters on all four**, including the dim, the skewed and the inverted.

---

## 2026-08-24 — The explanation grammar, measured. It does not work.

**AUTHORSHIP: Claude ran the probe and wrote this entry. No file in
`/src/extraction` was touched.**

`src/lib/llm/explain-grammar.ts` made a strong claim that had never been run:
`char ::= [^0-9{}]` forbids the model any digit, so a fabricated date is not
rejected afterwards but *unreachable*, and the only route to a number is a
placeholder the app fills from confirmed fields.

New probe `tools/metrics/probe/llm/explain-probe.ts` (`npm run probe:explain`)
runs the real grammar, the real prompt builder and the real sanity pass over all
ten notices — nine on the committed OCR text of their flat capture, notice 10 on
its PDF because no photograph of it exists.

### Result: shown 2, withheld 8, of 10

The digit ban works perfectly and is worth nothing.

| | |
|---|---|
| digits emitted by the model, all 10 notices | **0** |
| placeholders emitted by the model, all 10 notices | **0** |
| withheld as `incomplete` | **8** |
| shown to the user | **2, and both are garbage** |

### Failure 1 — the model never uses a placeholder. Not once.

`word ::= placeholder | plain` makes `{deadline}` reachable, and the prompt names
the available placeholders explicitly. Across ten notices the model emitted zero.
A base instruct model has no language-prior reason to write `{deadline}` in the
middle of a sentence, and one prompt line does not overcome that. **`substitute()`
therefore had nothing to substitute on any notice.** The mechanism the guardrail
rests on is, in practice, dead.

### Failure 2 — forbidden digits produce a degeneration loop, not an abstention

Notice 10, the approval, verbatim:

> SAYS: …You need to keep your benefits and report any changes in your household
> income before February **oubt oubt oubt oubt oubt** … (×83, to the token limit)

The model reached "February 28, 2027". `2` was unreachable. No placeholder exists
for a certification end date, so there was no legal way to say the true thing
either. The sampler took the highest-probability legal token, which put it in a
state where that token was again most likely, and it burned all 300 of
`n_predict` there. It never reached `DO:`, `WHEN:` or `APPEAL:`, `parseSections`
returned undefined, and the explanation was withheld.

Eight of ten fail this way. Notice 02 loops on "September XX. ENTION Date is
September XX." Notice 06 loops on "The letter is in Spanish." ×15.

**Correction to the header comment in `explain-grammar.ts`:** it says a grammar
with no null production "forces fabrication". Measured, this one does not
fabricate — it *stalls*. That is the correct failure direction and a completely
different problem, and it needs a different fix.

### Failure 3 — the two that pass are the dangerous ones

The sanity pass checks for unconfirmed **digits**, unfilled `{placeholders}`, and
eligibility claims. Under a digit ban the model writes numbers as **letters**,
and letters pass every one of those checks.

Notice 04, shown to the user, all four sections:

> SAYS: …you need to renew your Medi-Cal coverage by **October XXX XXX**.
> DO: You have to renew your Medi-Cal coverage by October XXX XXX.
> WHEN: You have to renew your Medi-Cal coverage by October XXX XXX.
> APPEAL: If you disagree… you can appeal by October XXX XXX.

Notice 05, shown to the user:

> APPEAL: Rosa can ask for a hearing by calling **XXX-XXX-XXXX**.

and it says "by October XX" for a hearing-by date that is **September 28**.

`checkExplanation` returned `ok` for both. `\d+` cannot see `XXX`, and `XXX` is
not `{deadline}`. **The guardrail measures the wrong thing: it asks whether an
unconfirmed digit reached the text, when the question is whether the model tried
to write a number at all.** Under a digit ban those are not the same question,
and a digit check is blind by construction.

### What this means

The design intent — a date the user did not confirm should be structurally
impossible, not merely caught — is right and worth keeping. The implementation
achieves it by making the model unable to speak, and the check that was supposed
to catch the remainder cannot see the failure mode the ban creates.

Not fixed here. This is a product decision on a documented §4 guardrail and it is
Devansh's to make. Recorded so it is made with the numbers in front of it.

Directions, cheapest first, none of them measured yet:

1. **Add the missing placeholders** (`{amount}`, `{certificationEnd}`,
   `{reportWithin}`, `{hearingPhone}`) so there is always a legal way to say the
   true thing. Does not address failure 1 — the model still has to choose them.
2. **Extend the sanity pass to spelled-out and X-substituted numbers** — this one
   is cheap, mechanical, and should happen regardless of what else is decided,
   because failure 3 is live today.
3. **Drop the digit ban; keep the sanity pass and make it the whole mechanism.**
   Every number in the finished text must match a confirmed value or the
   explanation is withheld. Weaker guarantee, honest one, and the model can write.
4. **Two-stage:** generate freely, then have the check rewrite offending spans to
   placeholders before display.

### Caveats on these numbers

macOS llama.cpp b10470, `--temp 0`, where the app uses llama.rn at temperature
0.3 — same engine family, different build. This measures the grammar and the
sanity pass, which are deterministic text processing; it says nothing about
latency or on-device behaviour. `-no-cnv` is **not honoured** by this build, so
the prompt went through Qwen's chat template here; `explain.ts` passes a bare
prompt to `context.completion`, which does not. Worth checking whether the app
should be using the chat template — an instruct model given a raw completion
prompt is being used off-label.

**`ask.sh` cannot be used for prose.** It finds the response via a sentinel at the
end of the echoed prompt, and b10470 truncates a long echoed prompt, so the
sentinel vanishes and the helper returns llama.cpp's own banner. The first run of
this probe reported "16 digits emitted by the model" that were the build number
in that banner. `explain-probe.ts` anchors on the grammar's own `SAYS:` literal
instead.

---

## 2026-08-24 — Checklist, cross-reference, and four defects the screenshots found

**AUTHORSHIP: Claude, app-side only. Nothing in `/src/extraction` was touched.**

### Screenshots before code, and what they showed

Ten screenshots in `screenshots/`, all driven through the real UI in the
Simulator over real corpus photographs. Four defects came out of it that no test
would have caught, because they are layout and copy:

1. **Capture: "Choose a photo instead" overlaps the shutter button.**
   `shutterRow` is `space-between` with `pickButton: { minWidth: 120 }` —
   `minWidth` is a floor, not a cap, and the label at 16pt bodyStrong is far
   wider than 120pt, so the row overflows its 338pt and the text runs under the
   76pt shutter. **Not yet fixed.**
2. **Capture: only the top two corner brackets render.** `guide` is
   `absoluteFill` over the whole screen, so its bottom half sits behind
   `cameraControls`. The document guide is half a guide. **Not yet fixed.**
3. **Every full-screen sheet rendered its first line under the Dynamic Island.**
   React Native's `Modal` is a separate view hierarchy and
   `react-native-safe-area-context` does not carry insets across it, so the
   `SafeAreaView` inside measured a zero top inset. Affected the existing
   photo/text viewer on Notice Detail as well as the two new Checklist sheets.
   **Fixed** — `Sheet` in `ui.tsx` re-provides `SafeAreaProvider` inside the
   modal, which is the library's documented fix, and `Screen` grew `insetTop`.
4. **Review says "Read clearly" over a date the user typed themselves.**
   `effectiveRisk` returns `verified` for `source === 'manual'`, and the
   verified+date branch renders "Read clearly" — which claims Carta read it off
   the page. It did not; the user typed it. **Not yet fixed.**

Also confirmed, not a defect: **Review requests notification permission before
scheduling** and verifies with `listScheduled()`. The `OS reports 0` line in the
self-test output is a self-test ordering artifact — it requests permission after
scheduling — not the app path.

Still unreachable: **the "this does not look right" invalid-value state on
Review has no producer.** `review.tsx` branches on `field.invalid`; `scaffold.ts`
never sets it. The red styling and its copy are dead until the cascade populates
it. Left alone rather than faked — making the scaffold set it would be doing
extraction work.

### Checklist (SPEC §7 priority 5)

Schema **v3**: `documents` and `requirements`, two tables not one, because a
document outlives the requirement it was attached for — the pay stub this SAR 7
asks for is the one the next notice will ask for. That is also what makes the
Vault possible later without another migration.

The rule the design is built around is CLAUDE.md §16. Every requirement records
`origin`:

- `letter` — the cascade read it off the page. Carta may say "the letter asks
  for this". `seedFromLetter()` is the only writer and takes its list straight
  from `ExtractionResult.requiredDocs`.
- `user` — the person added it. Carta says "you added this" and nothing more.

There is deliberately no code path that promotes one to the other, and
`addUserRequirement` hard-codes `'user'` rather than taking it as a parameter.

`content/doc_types.json` is a **vocabulary, not a rule**: twelve document types
with descriptions, and nothing anywhere in it that maps a programme or an action
type to a set of documents. A test asserts that — `doc_types` is the only
non-underscore key, and a set of forbidden keys must not appear.

The scaffold extractor produces no `requiredDocs`, so today the Checklist opens
on its empty state and the user builds the list. That is the correct behaviour
and not a degraded one: Carta must never assert that a programme requires a
document it did not read.

**`progressOf` lives in `src/lib/checklist.ts`, pure**, so the readiness rule is
a bare-Node test. The rule worth the split: **`ready` is false for an empty
checklist**. Zero of zero is arithmetically complete and is not readiness — an
empty checklist means Carta does not know what the letter asks for, and telling
someone they are ready to send a packet on that basis is the worst thing that
screen could say. It is exactly what `resolved === total` alone would say.

"Does not apply to me" is a first-class state, counted as resolved. A checklist
that can only be completed tells someone with no employer that they can never be
ready.

### "Worth checking" (SPEC §2.1)

`WorthChecking` renders `content/cross_reference.json` at the **bottom** of
Notice Detail, below "Check it yourself" — it is the least urgent thing on a
deadline tracker and nothing may take priority from the countdown. The three
§4 rules are structural: the component takes exactly one selector (`program`)
and cannot reach an eligibility input; the public-charge note renders inline
above the list; `verified_on` renders per entry.

Three things the first render exposed, all fixed:

- The disclaimer was rendering its own schema instruction — the JSON value was
  written as "Every rendering must carry: '…'" and that whole string reached the
  screen. Split into `_disclaimer_rule` (documentation) and
  `_disclaimer_required` (the sentence).
- It reused `detail.verifiedOn`, which says "Office details checked on…" for
  programmes. Own string now.
- An identical date under all five entries was noise. Now one line for the
  section, using the **oldest** entry's date, and a per-entry line only when it
  differs. Oldest, not newest: a section is only as fresh as its stalest entry.

**A validator caught a real mistake.** Running the disclaimer through
`requirePopulationLevelPhrasing` failed the build on "find out if you qualify" —
correctly. The disclaimer is the one string that has to say that; its job is to
say Carta is *not* deciding. Exempted, for the same reason `basis` is.

That also exposed a gap: the forbidden-phrasing list had three Spanish patterns
and none of them covered "reúne/cumple los requisitos", the ordinary Spanish for
"to qualify". The Spanish copy was being checked more loosely than the English.
Added.

### Spanish

`what_es` on every cross-reference entry, `label_es`/`what_es` on every document
type, plus `_disclaimer_required_es`, and both languages are **required at parse
time** — an optional translation is one that quietly does not exist by ship.

These are written for Carta, not taken from an agency translation. CLAUDE.md §9
prefers CDSS's own wording, and for the cross-referenced programmes there is
nothing to point at — they are not CDSS forms. For the document types there
*is*: the translated SAR 7 (SAR 7 SP) and CF 377.6 name these items, and that
wording should replace these strings. Both are now named by
`npm run content:check`, which reports **10** outstanding items, and pinned in
`tests/node/content.test.ts` so the list cannot grow silently.

### Gates

`npm run typecheck`, `npm run lint`, `npm test` — **181 tests, 13 suites, green.**
Still absent and still worth naming: **`no-network.test.ts` does not exist and
never has**, and `tests/app/` is empty, so the `jest-expo/ios` project
contributes zero of those 181.

---

## 2026-08-24 (later) — The explanation guardrail, in three designs

**AUTHORSHIP: Claude implemented and measured. The decision to drop the digit
ban was Devansh's. Nothing in `/src/extraction` was touched.**

> **Written-answer material.** This is one problem attacked three times, where
> each fix was a reasonable response to the previous failure and the first two
> made things worse in ways only measurement showed. The final answer was not a
> better constraint. It was noticing the question was wrong.

### The problem

A 1.5B model writing a plain-language summary of a benefits letter must never
put a date in front of someone that they did not confirm. CLAUDE.md §4,
guardrail 3. The stakes are not abstract: a wrong deadline in a plain-language
summary is *more* dangerous than a dense official one, because the whole point
of the rewrite is that people believe it.

### Design 1 — constrain the shape of the date (2026-08-20)

GBNF: `\d{2}/\d{2}/\d{4}`. Constrain a date at the token level so a malformed
one is structurally unreachable.

**Two failures, both measured.**

It accepted `00/00/0001` and `20/09/2026` — digit *counts* are not value
*ranges*. And the serious one: on a notice with no deadline, the model emitted
the notice date instead. The grammar had no production meaning "not stated", so
there was no legal token sequence for abstaining, and the sampler had to emit
*something*.

> **A grammar with no null production converts every gap into a confident
> fabrication.**

The unconstrained model got that case right. The constrained one did not. That
is the first counter-intuitive result: **adding a constraint made the output
less truthful**, because the constraint removed the option of silence.

### Design 2 — forbid digits entirely (2026-08-24 morning)

If a well-formed date can still be a false date, make dates *impossible*:

```
char ::= [^0-9{}]        # no digit may ever be generated
```

Where a date belongs the model emits `{deadline}`, and the app substitutes the
value the user confirmed. Guardrail 3 stops being a rule checked afterwards and
becomes one that is unreachable.

It reads as airtight. **First measurement over all ten corpus notices** (new
probe, `npm run probe:explain`) — the numbers:

| | |
|---|---|
| digits emitted by the model, all 10 notices | **0** |
| placeholders emitted by the model, all 10 notices | **0** |
| withheld as `incomplete` | **8 of 10** |
| shown to the user | **2, and both were garbage** |

**Failure A — the model never used a placeholder. Not once, on any notice.**
`word ::= placeholder | plain` made `{deadline}` reachable and the prompt named
the available placeholders explicitly. It emitted zero. A base instruct model
has no language-prior reason to write `{deadline}` mid-sentence, and one line of
prompt does not overcome that. **`substitute()` therefore had nothing to
substitute, on any notice, ever.** The mechanism the entire guardrail rested on
never executed a single time in production conditions.

**Failure B — the ban produced degeneration, not abstention.** Notice 10, the
approval, verbatim:

> SAYS: …You need to keep your benefits and report any changes in your household
> income before February **oubt oubt oubt oubt oubt** … (×83, to the token limit)

The model reached "February 28, 2027". `2` was unreachable. No placeholder
existed for a certification end date, so there was no legal way to say the true
thing either. The sampler took the highest-probability legal token, which put it
in a state where that token was again most likely, and it burned the entire
budget there. It never reached `DO:` or `APPEAL:`, so `parseSections` returned
undefined and the explanation was withheld. Eight of ten failed this way —
notice 02 looping on "September XX. ENTION Date is September XX.", notice 06 on
"The letter is in Spanish." ×15.

**Failure C — the two that passed were the dangerous ones.** The sanity pass
checked for unconfirmed **digits**, unfilled `{placeholders}`, and eligibility
claims. Under a digit ban the model wrote numbers as **letters**, and letters
pass all three. Shown to the user, notice 04, all four sections:

> SAYS: …you need to renew your Medi-Cal coverage by **October XXX XXX**.
> DO: You have to renew your Medi-Cal coverage by October XXX XXX.
> WHEN: You have to renew your Medi-Cal coverage by October XXX XXX.
> APPEAL: If you disagree… you can appeal by October XXX XXX.

And notice 05: *"Rosa can ask for a hearing by calling **XXX-XXX-XXXX**"*, plus
"by October XX" for a hearing-by date that is **September 28**.

`checkExplanation` returned `ok` for both. `\d+` cannot see `XXX`; `XXX` is not
`{deadline}`.

> **The check measured the wrong thing. It asked "did an unconfirmed digit reach
> the text?" when the question is "did the model try to write a number?" Under a
> digit ban those stop being the same question — and the check was blind
> precisely to the failure mode the ban itself created.**

That is the second counter-intuitive result, and the sharper one: **a constraint
and its backstop can be individually sound and jointly useless**, because the
constraint changes the distribution the backstop was calibrated against.

### Design 3 — stop asking the model for the number

Both failures came from the same mistake, visible only in hindsight: *asking the
model to produce a value the app already had, and then policing the answer.*

The deadline is not something the model knows. It was extracted deterministically
at 100% precision on every date the app schedules on (2026-08-20), and the user
confirmed it on Review. **The app can simply render it.**

So the explanation now has **no "by when" section at all**. Notice Detail renders
that date from the confirmed field, above the explanation, and always did. The
model writes only the three sections it can genuinely contribute to:

```
SAYS   — what the letter is telling them
DO     — what they have to do
APPEAL — how to disagree
```

Digits are allowed. There is no placeholder machinery, no substitution step, and
nothing that can be left unfilled. The grammar is a **shape** — three labelled
sections in a fixed order, so no heading renders empty — and makes no claim
about truth. The sanity pass becomes a **net rather than the mechanism**: any
date in the finished prose that is not among the dates the user confirmed
withholds the whole explanation.

### Result, same probe, same ten notices

| design | shown | withheld | what the failures were |
|---|---|---|---|
| 2 — digit ban | 2 | 8 | degeneration loops; the 2 shown were `October XXX XXX` |
| 3 — no `when`, digits allowed | **8** | **2** | both real unconfirmed dates |

Notice 10, the same notice that produced `oubt` ×83:

> SAYS: This letter is telling Samuel Bright that his CalFresh application has
> been approved. He will receive **$412 per month** for benefits starting on
> **August 15, 2026**. He needs to complete a Semi-Annual Eligibility Status
> Report (SAR 7) before **February 28, 2027**, to keep receiving benefits.

Every number correct and off the letter. **The model could always do this. The
ban was the only thing stopping it.**

**Both remaining withholdings are true positives**, which is the net working:

- **Notice 07** — the model wrote *"the proof they asked for on September 14,
  2026"*. That date is on no field of notice 07. It is the notice date of a
  *different* corpus notice. **A real hallucination, caught.**
- **Notice 10** — it wrote "February 28, 2027", the certification end date. That
  is genuinely printed on the letter, but Carta does not extract it, so the user
  never confirmed it. Withheld. Correct under the contract, which is about what
  the *user confirmed*, not what exists on the page — and conservative in the
  right direction.

### Two smaller findings from building design 3

**The grammar still needed a length bound, for a reason unrelated to truth.**
The first version had `line ::= char+`, unbounded. 6 of 10 withheld as
`incomplete` — the model spent the whole budget on `SAYS` and never reached
`APPEAL`; notice 10 wrote 600 correct characters then repeated itself three
times. Bounding in **sentences** (`sentence (" " sentence){0,2}`,
`sentence ::= schar{1,180} punct`) rather than characters is deliberate: at
`char{1,60}` the cut lands mid-sentence and the next section reads as a
continuation of the previous one — measured, verbatim:
`DO: Date, which is September 5, 2026. This means that the letter`. Ending only
at a full stop cannot do that. With the bound: **8 of 10**, and no `incomplete`
at all.

**The confirmed set has to be the whole set.** Given only `deadline` and
`hearingBy`, the check withheld a *correct* explanation of notice 04 because the
model mentioned the coverage end date — a value that is on the letter, is
extracted, and that the user confirmed two fields above the deadline on the same
screen. Answering "no date the user did not confirm" with a partial view of what
they confirmed turns it into "no date except one". Widening to all five
confirmed date fields took it from 6 shown to 8.

### Four bugs the new tests found in the new check

Written as attacks on the check rather than confirmations of it, and all four
were real:

1. `#{3,}` and `\?{3,}` never fired — `\b` before `#` or `?` asserts the
   *opposite* of what it looks like, because neither is a word character.
2. `2026-09-05` was rejected against a confirmed "Saturday, September 5, 2026",
   because the month is a digit in one and a word in the other. Month names now
   resolve to numbers before comparison.
3. `30 de septiembre de 2026` matched no date pattern at all — the shapes only
   handled month-then-number, and the number leads in Spanish. A Spanish
   explanation could have carried any date past the check.
4. `parseSections` used `\s*`, which includes the newline — so a section with an
   empty body consumed the line break and captured the **next** section's text.
   `DO:` with nothing after it returned "APPEAL: Call." as the DO section and
   reported the explanation complete.

### Caveats on every number here

macOS llama.cpp b10470, `--temp 0`; the app uses llama.rn at temperature 0.3 —
same engine family, different build. This measures the grammar and the sanity
pass, which are deterministic text processing. It says nothing about latency or
on-device behaviour. `-no-cnv` is not honoured by this build, so the probe ran
through Qwen's chat template while `explain.ts` passes a bare prompt to
`context.completion`; whether the app should use the chat template is still
open, and an instruct model on a raw completion prompt is being used off-label.

Notice 10 has no photograph in the corpus, so its text is the PDF's rather than
OCR. The other nine use the committed OCR of their flat capture.

---

## 2026-08-24 (later still) — The network test, and why `tests/app/` was empty

**AUTHORSHIP: Claude. App-side tests and build plumbing.**

### The `app` Jest project had never run a single test

`jest.config.js` has declared two projects since week 2. The bare-Node one works
and carries everything. The `jest-expo/ios` one had an empty `tests/app/`, so
`npm test` reported green while covering **zero React components** — and the
reason it was empty turns out not to be "nobody got round to it":

```
SyntaxError: node_modules/@react-native/jest-preset/jest/setup.js
  value(id: TimeoutID): void  — Unexpected token, expected ","
```

React Native's own Jest setup is written in Flow. Stripping it needs
`babel-preset-expo`, which was **not installed**, and there was **no
`babel.config.js`**. Metro never needed one — Expo SDK 57 applies the preset to
the app bundle by default — so the app built and ran perfectly while the test
project could not parse its first file. The project could never have executed a
test, and nothing said so.

**Fifth instance of "configuring a thing is not verifying it happened"**
(CLAUDE.md §13), and the most expensive so far: it hid the absence of the
project's single most demonstrable privacy claim for two weeks.

Fixed with `babel.config.js` and `babel-preset-expo` as a dev dependency.

Two further traps behind it, both of which look like broken tests rather than
missing configuration:

- **React 19 will not flush a test render without `IS_REACT_ACT_ENVIRONMENT`**,
  which `jest-expo`'s preset does not set. Symptom: `render()` returns an object
  with no `toJSON` and every query fails with "`render` function has not been
  called". Set in `tests/app/setup.ts`.
- **`render` is ASYNC in `@testing-library/react-native` v14.** Without `await`
  it returns a Promise and `screen` is never populated — same misleading error.

### `no-network.test.ts` — SPEC §8.3

The claim: no code path that touches notice data ever reaches the network. It is
the strongest privacy statement Carta makes and it was pure prose until now.

**Two halves, because neither is sufficient alone.**

*Runtime.* `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`navigator.sendBeacon`, and the `Networking` / `WebSocketModule` / `BlobModule`
native modules underneath them are all replaced with functions that record the
attempt and throw. Patching only the JS globals would be theatre — a library
wanting to bypass them would call the bridge directly. Then the notice-data path
runs over **all 79 corpus OCR records**: extraction, orientation, countdowns and
the full reminder ladder, content-pack parsing, prompt construction, the sanity
pass, checklist progress. Any attempt fails the build. Its limit is that it only
proves the lines it executes.

*Static.* Every module reachable from that path is read off disk as bytes and
checked for any reference to a networking API — `fetch(`, `XMLHttpRequest`,
`WebSocket`, `sendBeacon`, `downloadFileAsync`, `axios`, a hard-coded URL. This
covers the branches a run does not take: an error handler that phones home, a
reporter behind a flag. Its limit is that it cannot see through an indirection.

`src/lib/llm/model.ts` — the one documented exception, the user-initiated
wifi-gated model download — is excluded **by name**, so adding a second
exception is a visible edit to that list rather than a silent one.

**41 assertions.** Four of them test the test: if the monkeypatch silently
failed, every other assertion would pass while proving nothing, so `fetch`,
`XMLHttpRequest` and `WebSocket` are each provoked into throwing and the suite
asserts that at least one native module was actually patched.

**Verified by breaking it.** A `fetch('https://telemetry.example.com/...')` was
injected into `daysUntil` in `urgency.ts` — squarely on the notice-data path —
and both halves failed independently: the runtime patch threw with the URL in
the message, and the static audit flagged the module. Reverted. A test that has
never failed is a test nobody has checked.

One refinement the static half needed: the URL pattern originally fired on
`raw.startsWith('https://')` in `content/validate.ts` — the code that
*validates* a provenance URL, not code that opens one. Requiring a host
character after the slashes fixes it. A rule that cries wolf on its own
enforcement is a rule someone eventually deletes.

### Component tests — `tests/app/screens.test.tsx`

Home, Review and Notice Detail. Deliberately not exhaustive; they hold the
things that would be silently wrong on a screen and would fail no other check:

- Home's empty state is the **empty** state and not a flash of it during the
  first read — `undefined` means "not loaded", `[]` means "none", and rendering
  the first as the second tells someone with four deadlines they have none.
- The countdown tier, which is the whole product.
- Home never renders a raw error string (`SQLITE_CORRUPT` must not reach a user).
- The "no reminders set" warning appears — the most dangerous state this product
  can be in is a deadline it is silently not going to remind anyone about.
- Review flags name and case number regardless of confidence, and **no longer
  claims "Read clearly" over a value the user typed**.
- Notice Detail renders "by when" **from the confirmed field**, with the model
  absent. If that ever comes from generated text the guardrail is gone.

Assertions target **accessibility labels** where the component is one accessible
element — the countdown is deliberately a single stop so a screen reader says
"2 days left" rather than "2" then "days left". Testing the label rather than
the glyph tests the thing the rubric actually scores.

### UI fixes from the screenshots

**Capture guide clipped** — the guide was `absoluteFill` over the whole screen,
so its lower half sat behind the controls panel and only two corners were ever
visible. A document guide with two corners does not read as a guide. Now a child
of the camera view. Verified on the Simulator: four corners.

**Capture shutter row overflow** — `pickButton: { minWidth: 120 }` in a
`space-between` row. `minWidth` is a floor, not a cap: the 16pt label expanded
past it, the row overflowed its 338pt, and "Choose a photo instead" ran under
the shutter. The picker is now absolutely positioned with a `maxWidth` that
stops 13pt clear of the shutter's left edge, so no label length can move the
shutter. Verified on the Simulator.

**"Read clearly" over a user-typed value** — `effectiveRisk` returns `verified`
for `source === 'manual'`, which is *correct*: a value the user typed does not
need re-checking. The bug was this screen reading "verified" as "Carta read this
clearly off the page" — claiming a provenance the value does not have, and
taking credit for the user's own work. **The fix belongs in the screen, not in
`effectiveRisk`**: the risk answer was right and the screen misread it. Now
gated on `field.source !== 'manual'`.

Left alone as agreed: the invalid-value state on Review, which is dead UI until
the cascade populates `field.invalid`, and `effectiveRisk` itself.

### Gates

**247 tests, 15 suites, across both Jest projects** — up from 181 in one.
`npm run typecheck` and `npm run lint` clean.

---

## 2026-08-24 — The test project that could never have run

**AUTHORSHIP: Claude found and fixed this.**

> **Written-answer material.** The fifth instance of one specific mistake in this
> project, and the most expensive: it hid the absence of the app's central
> privacy claim for two weeks while every signal said the repo was healthy.

### What was true

`jest.config.js` has declared two Jest projects since week 2:

- `node` — bare Node, for the extraction island and the corpus tools.
- `app` — `jest-expo/ios`, for components, storage, and **`no-network.test.ts`,
  which the config file names in a comment as the pipeline gate.**

`npm test` reported green. 181 tests, 13 suites, every one of them from the
`node` project. `tests/app/` was an empty directory.

The natural reading — mine, and it is in an earlier entry — was "the app tests
have not been written yet". That reading was wrong. When I tried to write the
first one, this happened before a single test executed:

```
SyntaxError: node_modules/@react-native/jest-preset/jest/setup.js
  value(id: TimeoutID): void  — Unexpected token, expected ","
```

React Native's own Jest setup file is written in **Flow**. Stripping Flow needs
`babel-preset-expo`, which was **not in `package.json`**, and there was **no
`babel.config.js` in the repo at all**.

**The `app` project had never been capable of running a test.** Not "no tests
were written for it" — no test *could* have run. Any test placed in
`tests/app/` at any point in the last two weeks would have failed to parse.

### Why nothing caught it

Because **Metro does not need `babel.config.js`.** Expo SDK 57 applies
`babel-preset-expo` to the app bundle by default, so:

- `npx expo run:ios` built and launched. ✅
- `npm run typecheck` passed. ✅
- `npm run lint` passed. ✅
- `npm test` printed **PASS** and a rising test count. ✅

Every gate was green. The app ran on a phone. And one half of the test
configuration was inert, silently, with no output distinguishing "this project
ran zero tests" from "this project does not exist".

Jest does not warn on a project that matches no test files. That is the whole
gap: **a test project with no tests and a test project that cannot run tests
produce identical output.**

### Why this one mattered more than the others

The four previous instances (CLAUDE.md §13) cost time. This one cost a claim.

`no-network.test.ts` is the single most demonstrable thing Carta asserts — that
no code path touching notice data ever reaches the network. It is named by
filename in the README and in the video script. It was assigned to the `app`
project. **It was assigned to a project that could not run it**, and the plan
recorded it as "not written yet" rather than "not possible yet", which is a
materially different problem with a materially different fix.

Had the video been filmed on the current plan, it would have pointed at a
filename in a project that had never executed.

### The pattern, stated properly

Four previous instances, all the same shape:

1. `llama.rn`'s plugin adds memory entitlements only when `EAS_BUILD_PROFILE` is
   set — declared in config, never applied locally.
2. `expo-mlkit-ocr` is configured for ML Kit and runs Apple Vision — found by
   reading `Podfile.lock`, not the README.
3. Notification scheduling returns an id and the OS retains nothing without
   authorisation — every layer reports success.
4. A green `xcodebuild` log and an app that cannot launch at dyld time.

And now: a Jest project that is configured, named in comments, referenced in the
spec, and cannot parse its first file.

> **Configuring a thing is not verifying it happened. The check has to be "did
> it run and produce output I looked at", not "is the setting present".**

The corollary this one adds, which the earlier four did not: **an absence is
harder to see than a failure.** All four earlier cases eventually produced a
visible symptom. This one produced *nothing at all* — and "nothing" is what a
passing test project and a dead one both look like from the outside.

### Fixed

`babel.config.js` plus `babel-preset-expo` as a dev dependency. The file itself
carries the explanation, because the next person to see a repo with no
`babel.config.js` and a working build will reasonably conclude it is not needed.

Two further traps sat directly behind it, both of which present as a broken test
rather than as missing configuration:

- React 19 refuses to flush a test render unless `IS_REACT_ACT_ENVIRONMENT` is
  set, and `jest-expo`'s preset does not set it.
- `render` is **async** in `@testing-library/react-native` v14.

Both produce the identical, misleading message: **"`render` function has not
been called"** — which points at the test, and the cause is in the config.

`tests/app/` now holds 61 tests. `npm test` runs 247 across both projects.

### What I would change about the process

A green suite should have to say *which* projects ran. The line
`Ran all test suites in 2 projects.` only appeared once the second project had
a test in it — which is exactly backwards, since that is the moment it stopped
mattering.


---

## 2026-08-24 — Writing the tests as attacks, and finding four bugs in the check

**AUTHORSHIP: Claude.**

> **Written-answer material.** A safety check is the one piece of code where
> tests written to confirm it works are close to worthless, because a check that
> silently passes everything satisfies every confirming test perfectly.

### The setup

The digit ban had just been removed. `checkExplanation` went from being a
*backstop* — the grammar was supposed to make a fabricated date unreachable, so
the check only had to catch what form could not express — to being **the only
thing between an unconstrained 1.5B model and the screen**.

That is a promotion, and it changes what the tests have to be. The old suite
tested a helper. The new one has to test a guard.

### The failure the old suite had already missed

Worth stating plainly, because it is the reason for the change in approach.

Under the digit ban, `checkExplanation` had tests. They passed. And this was
shown to a user, on all four sections of notice 04:

> *"you need to renew your Medi-Cal coverage by **October XXX XXX**"*

Every test passed because every test asked "does the check accept a good
explanation and reject an obviously bad one?" None asked "**what is the cheapest
way to get a wrong number past this?**" The answer was: write the number as
letters. `\d+` cannot see `XXX`.

### The change

Each test in the new suite is a specific route a wrong number could take to a
screen, named as such. Not "accepts a valid date" but "rejects a *plausible*
date that was not confirmed" — using `September 30`, which is the deadline of a
different corpus notice, because a model that conflates two notices or reads the
effective date instead of the return-by date produces exactly that.

**Four of them failed on first run. All four were real bugs in the check, not in
the tests.**

**1. Two patterns never fired at all.** The letter-number check included:

```js
/\b(?:NN+|nn+|\?{3,}|#{3,})\b/
```

`\b` is a word boundary. `#` and `?` are not word characters, so `\b` before
them asserts the *opposite* of what it looks like. `###-####` and `???` sailed
through. This is a pattern that reads correctly, was written deliberately, and
matched nothing — a confirming test using `XXX` would have passed and never
touched it.

**2. The check rejected the app's own confirmed date.** Notice Detail renders
`Saturday, September 5, 2026`. Given `2026-09-05`, the check withheld it as
unconfirmed — the month is a **word** in one and a **digit** in the other, so
the two shared only `{5, 2026}`. The guard was rejecting the exact value the
guard exists to permit. Month names now resolve to numbers before comparison.

**3. A Spanish date format matched nothing.** This is the one worth the entry.

```js
/\b(?:january|…|septiembre|…)\b[^.,;:!?]{0,20}?\b\d{1,4}\b/gi
```

Spanish month names were in the alternation. It looks complete. But the pattern
requires the **month name first and the number after it** — English order. In
Spanish the number leads:

> `30 de septiembre de 2026`

That matched **no date pattern at all**, which does not mean "rejected". It
means the text was scanned, no date was found in it, and the explanation was
**passed as clean**. A Spanish explanation could have carried any date to a
screen, including a fabricated one.

The month names being present is what makes this bad. It is not an omission
someone would spot in review — the file *looks* bilingual. It took an assertion
written in Spanish to find it, and Spanish is half this app's audience
(CLAUDE.md §1: Maria's primary language). Fixed by adding a number-then-month
shape; both orders are now tested explicitly.

**4. An empty section was reported as a complete explanation.** `parseSections`
used:

```js
new RegExp(`${label}:\\s*([^\\n]*)`, 'i')
```

`\s` **includes the newline.** So given:

```
SAYS: Something.
DO:
APPEAL: Call your worker.
```

the `DO:` match consumed the line break and captured **`APPEAL: Call your
worker.`** as the body of `DO`. All three sections "present", explanation
reported complete, `APPEAL` rendered under the "what you must do" heading — and
the real appeal text silently gone. Fixed with `[ \t]*`.

This bug predates the redesign. It was in the file the whole time the digit ban
was in place, and it never surfaced because under the ban the model almost never
produced an empty section — it produced 300 tokens of `oubt` instead. **One bug
was masking another.**

### What generalises

- **A safety check must be tested by trying to defeat it.** Tests that confirm
  the happy path measure the author's imagination, and the author already
  believed the code worked.
- **The best test cases come from real failures.** `October XXX XXX` is in the
  suite verbatim. It is not hypothetical; it reached a user.
- **Test the guard in every language it guards.** Pattern (3) had Spanish month
  names and no Spanish grammar. Bilingual-looking is not bilingual, and only an
  assertion written in the second language finds the difference.
- **A pattern that matches nothing fails silently and looks like success.**
  Patterns (1) and (3) both had this shape. There is no error, no exception, no
  log line — the text is scanned, nothing is found, and "nothing found" is
  indistinguishable from "nothing wrong". Any regex used as a filter should have
  at least one test that proves it *can* fire.
- **Removing a bug can expose one that was hiding behind it** (4). Fixing the
  loud failure is when to re-check the quiet paths, not when to stop looking.

The same standard is why `no-network.test.ts` was verified by injecting a real
`fetch` into `urgency.ts` and watching both halves fail before reverting it. A
guard nobody has watched fail is a guard nobody has tested.


---

## 2026-08-24 — Vault, Where to Go, onboarding; and a race that first launch would always have hit

**AUTHORSHIP: Claude, app-side. Nothing in `/src/extraction` was touched.**

### The bug worth reading first

Adding the onboarding gate to the root layout broke **first launch**, and it
broke it in a way that would have reached a judge's phone.

`getDatabase()` memoised the resolved handle:

```ts
if (database) return database;      // undefined until the FIRST open finishes
```

That guards nothing while an open is in flight. Two callers arriving together
both see `undefined`, both `openDatabaseAsync`, and both run `migrate()`.
`CREATE TABLE IF NOT EXISTS` survives being run twice. Migration v2's
`ALTER TABLE notices DROP COLUMN recipient_name` does not — the second run
throws *no such column*, the open rejects, and Home renders
**"Carta could not open your notices"** on a brand-new install.

The race has existed since v2. It had never fired because nothing had ever
opened the database twice at once: every screen reads it, but screens mount one
at a time. The onboarding gate reads a *setting* from the **root layout**, at
the same moment Home reads the notice list — the first genuinely concurrent
pair in the app's life.

Three things make it worth an entry:

1. **It only happens on first launch.** After the migrations complete, the
   second run is a no-op and the app is fine forever. So it is invisible on
   every device that has already run the app once — which is every device
   anyone develops on.
2. **It presents as the worst possible first impression**: a database error
   before the user has done anything at all.
3. **Nothing in the test suite could see it.** The DB path needs a device, and
   this needs a device *and* a fresh install *and* two callers racing.

Fixed by memoising the **promise**, not the handle, and clearing it on failure
so a "Try again" tap can retry rather than being stuck with a cached rejection.

> A cache keyed on "is it done yet" does not protect the window before it is
> done. That window is exactly where concurrency lives.

### Vault (SPEC §7, priority 7)

Documents grouped by type, newest first, untyped last. Ages computed in local
calendar days — `documentAge` sits next to `progressOf` in the pure module so
it is a bare-Node test, and its DST case is tested in the **spring-forward**
direction specifically: autumn's extra hour rounds harmlessly, spring's missing
hour makes `Math.floor` report 30 for a document saved 31 days ago. Testing only
one direction would have passed and shipped it.

**The staleness warning is where §16 bites.** "This pay stub is 47 days old" is
a fact Carta owns. *"…and most offices want the last 30"* is a rule about what
an agency requires. So the second half is not in the screen and not in code: it
lives in `offices.json` under `what_to_bring.freshness`, keyed on doc type, with
its own `source_url`, `verified_on` and `confidence`, and it is surfaced by
`npm run content:check` like every other sourced claim.

It could not go in `doc_types.json`, which has a test asserting it never grows a
key mapping a programme to a document — that file is a vocabulary and must stay
one.

**A document type with no entry gets its age and no judgement.** That asymmetry
is the design and it is a test: `documentAge` must never return `stale: true`
without a sourced limit. A default limit would convert "Carta has no source for
this" into a confident claim about all twelve types at once.

Two entries exist. `pay_stub` echoes the county's own "what to bring" wording
and is marked `medium`. `bank_statement` is marked `low` with a TODO saying
plainly that it is **not sourced** and must be cited or deleted.

### Where to Go (SPEC §8, priority 8 — first to cut)

Built to be cuttable: one route, one link from Home, deleting the file and its
`<Stack.Screen>` removes it cleanly.

Phones before addresses, because the pack's own sourced advice is that calling
beats going and burying that under six addresses would be the app disagreeing
with its own content. "Call to confirm" renders on **every** office next to its
hours, not once at the top — `confirmHoursNote` is required by the parser, so an
office cannot exist in the pack without one. "What to bring" prefers the active
notice's checklist and labels the fallback list as generic when there is none.

**And a defect the device check caught.** The "Not on this list" section was
rendering `still_needed` verbatim — which is a work list written for whoever
sources the content:

> *"Not yet researched -- add name, address, phone, hours, languages, and what
> they actually help with."*

That was on screen, to a user. It is the **second** time a developer note has
reached a user through a content pack: the first was `_disclaimer_required`,
whose value was phrased as an instruction to the renderer ("Every rendering must
carry: '…'") and was rendered including the instruction.

> **A string in a content pack is user-facing unless proven otherwise.** Both
> failures came from a JSON file mixing two audiences with nothing marking
> which is which.

`still_needed` now goes to `content:check`, where its audience actually is.

### Onboarding

Three screens — what Carta does, nothing leaves this phone, the model offer —
with **Skip in the same place on every one**. Someone opening this app has often
just been frightened by a letter; standing between them and the camera to
explain a value proposition is the wrong trade every time. Skipping *completes*
onboarding rather than deferring it, because skipping is a decision.

The privacy screen says three checkable things rather than the word "private":
read on this phone, never contacts your county or immigration, works in airplane
mode — *"you can turn off wifi and try it"*, which is a claim the user can
falsify in ten seconds and `no-network.test.ts` backs.

**Two defects found in the Simulator, both mine:**

- The last screen's button said **"Take a photo of a notice"** and went to Home.
  A label that promises one thing and does another.
- The model screen *described* the download and offered no way to accept it,
  while the copy said "you can turn this on later in Settings" — **a screen that
  does not exist yet**. That is placeholder copy pointing at a placeholder.

Both fixed by making it a real offer: the primary button starts the actual
download and leaves for Home. Deliberately **not awaited** — a gigabyte on a
phone connection is minutes, and holding someone on an onboarding screen for it
is the opposite of this screen's point.

### i18n parity is now a build gate

`tests/node/i18n.test.ts`. A key added to `en.json` and forgotten in `es.json`
does not crash, does not warn, and does not fail a build — i18next silently
falls back to English, so a Spanish speaker gets an English sentence mid-screen
and nothing says so. Now checked: identical key sets, identical `{{placeholder}}`
names, no blank Spanish, no long string left identical to its English, and
`_one`/`_other` plural forms in pairs (a missing `_other` renders the key itself
on screen for any count above one).

### Spanish content — what I could and could not do

**Could not:** replace the doc-type wording with CDSS's own. `cdss.ca.gov`
returns a **302 to a dead host** for automated requests — exactly the block
CLAUDE.md §13 documents — for both `SAR7.pdf` and `sar7a_sp.pdf`. Getting those
forms is a manual browser step, like `tools/forms/fetch-forms.sh`. **I have not
claimed otherwise anywhere in the pack**, and `_translation_blocker` in
`doc_types.json` names the blocker so the next person does not rediscover it.

**Did:** applied the three terms I *could* source, from San Mateo County's
Spanish SAR 7 guide — **"servicios públicos"** for utilities (not the vaguer
"servicios"), **"comprobante"/"prueba"** for proof, **"gastos médicos"** for
medical expenses. And fixed orthography throughout: the Spanish had been written
without accents, so "identificación", "teléfono", "niños", "crédito", "reúne"
were all wrong. Accents are correct Spanish, not a sourcing question.

### The ship-gate number went UP, and that is the honest direction

**10 → 14.** Three of the four new entries are new claims (two freshness rules,
the `still_needed` work list). The fourth is a **counting bug**:
`outstandingVerifications` was never passed the doc-types pack at all, so
`doc_types._translation_todo` had never been counted since the pack was created.
The gate had been reporting a number lower than the truth.

> An unverified translation the ship gate does not name is one that ships.

Nothing was closed out, because nothing became verifiable — every remaining item
needs a human at an agency source, which is what the gate is for.

---

## 2026-08-25 — The reminder ladder was a lie on every first install

**AUTHORSHIP: Claude found this on a deliberate cold-start pass and fixed it.**

> **The most serious defect found in this project.** Carta is a deadline
> tracker. On a freshly installed device it saved the deadline, reported success
> at every layer, showed the user a green screen — and scheduled nothing that
> would ever fire.

### What was measured

Simulator **erased** (Erase All Content and Settings, not merely reinstalled),
app installed fresh, one real corpus photograph through the real spine. The
self-test log:

```
reminders scheduled: 4 [t7, t3, t1, day_of]
OS reports 0 scheduled notification(s)
notification permission (provisional): granted
proof notification scheduled 5s out: cd72eff4-…
OS now holds 1 scheduled notification(s)
```

And the database, read directly off the device with `sqlite3`:

```
t7|scheduled|1        ← state = 'scheduled', os_notification_id NOT NULL
t3|scheduled|1
t1|scheduled|1
day_of|scheduled|1
```

**Four rows claiming to be scheduled, each holding an iOS notification id, and
iOS holding none of them.**

### Why every layer said it was fine

1. `scheduleNotificationAsync` **succeeds without authorisation.** It accepts the
   request, returns a real identifier, and iOS silently retains nothing. This is
   documented in CLAUDE.md §11 and was still not enough.
2. `recordScheduled` writes `state = 'scheduled'` because that is what the app
   *asked for*. It never asked what it *got*.
3. Home computes `remindersActive` from
   `COUNT(*) FROM reminders WHERE state = 'scheduled'` → 4 → **no warning**.

Home already has a "No reminders set" card, with copy, a real explanation and a
button that opens iOS Settings. It was built precisely for this. **It could
never fire**, because the only input it reads is a column nothing ever corrected.

The app was even asking the right question already: `listScheduled()` was called
straight after scheduling, and its result went into the diagnostic trace as
`osHeld`. **The number was observed, printed, and thrown away.**

### Two distinct bugs, and only one of them was the harness

**(a) `selftest.tsx` requested permission at the END of the run**, after
scheduling everything. So the acceptance harness — the thing whose whole purpose
is to prove the spine works — was proving it against a state no real user is
ever in. Its comment even asserted the opposite of the truth:

> *"Scheduling is verifiable without display authorisation: iOS registers the
> request either way, so this proves the ladder reached the OS."*

That sentence is false and the cold-start run disproved it in one line. Fixed:
permission is requested first, and the comment now records what was measured.

**(b) Nothing reconciled the database against the OS.** This one is NOT
harness-only. `review.tsx` has the ordering right — it asks permission before
scheduling and refuses to schedule if refused — but it still wrote
`state = 'scheduled'` for every reminder regardless of what iOS kept. Permission
is not the only way to lose a notification: iOS caps pending notifications at 64
per app, and a user with several notices and a full ladder will reach it.

So the fix is not "ask permission earlier". It is **stop recording what we asked
for as though it were what happened.**

### The fix

`reconcileWithOs(noticeId, osNotificationIds)` in `src/lib/db/reminders.ts`.
Marks as `cancelled` every reminder whose id iOS is not actually holding, and
returns how many were dropped. Called from Review and from the self-test, both
of which already had the OS's answer in hand.

`cancelled` rather than a new state, deliberately: from the user's point of view
a reminder the OS never accepted and one that was cancelled are the same thing —
it is not coming — and Home's existing warning already covers it. A third state
would mean teaching every reader a distinction that changes nothing.

### Verified after the fix, on a second erased Simulator

```
notification permission (provisional): granted     ← first, now
reminders scheduled: 4 [t7, t3, t1, day_of]        ← and no "OS DROPPED"
OS reports 8 scheduled notification(s)
```

Database: `scheduled|8` across two notices, `user_version|3`. Nothing dropped,
nothing misrecorded.

### Why nothing caught it

- **It only happens before notification permission exists** — i.e. on a real
  first install, and never again.
- **Every development device granted permission weeks ago.** The state is
  unreachable without erasing the simulator.
- **It is not an error.** No exception, no rejected promise, no failed
  assertion. Four ids came back. The only signal was a *count in a log line*
  that nobody was comparing to anything.

It is the same shape as the `getDatabase` race found on the same pass, and the
same shape as the four earlier entries in CLAUDE.md §13: **the system reported
success and the success was not real.** The difference is that this one had a
correct check already written, already running, and already printing the right
number — and the number went into a diagnostic string instead of a decision.

> **Observing a discrepancy is not handling it.** If code goes to the trouble of
> asking what actually happened, the answer has to change something.

### Regression tests

`tests/app/db-first-launch.test.ts` — four cases covering "OS kept nothing",
"OS kept some", "OS kept everything", and a reminder with no OS id at all.
The same file holds the `getDatabase` race tests; both bugs came from the same
cold-start pass and they belong together.

### What this changes about how to test this app

A device that has ever run Carta is not a device you can find first-launch bugs
on. Both defects from this pass were invisible on a warm device and obvious
within ninety seconds of an erased one. **`xcrun simctl erase` belongs in the
routine before a phase boundary**, not as something done accidentally.

---

## 2026-08-25 — The countdown was the accessibility bug, not the accessibility feature

Found on the same erased Simulator as the reminder defect, by sweeping Dynamic
Type sizes rather than by looking at the default.

### What was wrong

`tokens.ts` claimed, in a comment: *"Sizes are chosen so the layout survives the
larger accessibility sizes, which is also why the countdown uses a single short
string rather than a sentence."*

Measured, that was false. At the largest accessibility size (AX5) the 72pt
countdown scaled uncapped to roughly **220pt**, and the card alone became about
**600pt of an 874pt screen**. The programme name — "CalFresh/CalWORKs", the text
that says *which* notice this is — was pushed off the bottom of the card.

So a user at AX5 got a gigantic number and no way to tell what it counted down
to. On a device with two notices, each card was more than a full screen, and
every card looked identical.

The irony is the point: **Dynamic Type existed to help this user, and the
biggest element on the screen turned it into a worse experience than no scaling
at all.**

### Why it was invisible

The default text size is `large`, and at `large` Home is fine — the title fits,
nothing wraps, nothing clips. Every screenshot ever taken of this app was at
`large`. Nothing in the repo looks at how big anything gets: it typechecks, it
lints, it renders, and `screens.test.tsx` asserts the right tier and the right
number at whatever size they happen to be.

A note on the earlier report: the previous session recorded this as "the default
text size is larger on an erased device and the title wraps." That is not what is
happening. `xcrun simctl ui <device> content_size` reports `large` on a freshly
erased device, which is the ordinary iOS default, and the Home title does **not**
wrap there — it fits with about 27pt to spare, and the previous session's own
screenshot shows it on one line. The real defect was one text size band away from
where anyone was looking.

### The fix, and the rule it establishes

`maxFontSizeMultiplier` on the countdown number (1.6) and its word (2.0).
Nothing else in the app is capped, and a test enforces that.

> **Cap display type. Never cap prose.**

The reasoning, because the obvious wrong fix is to cap everything and make all
the screenshots tidy:

- Dynamic Type exists so text can be **read**. The countdown is already 72pt,
  four times body size. It was never the thing that was hard to read.
- Prose is the opposite. At AX5 a 17pt sentence genuinely needs to become a 53pt
  sentence and take as many lines as it needs. Body text, labels, headings and
  the programme name are uncapped and reflow freely.
- A cap is a **multiplier, not a size**. The capped countdown still grows — to
  ~115pt — which keeps SPEC §7's "a number and a colour in two seconds" while
  leaving the notice's identity on screen.

Verified after the fix on the same device at AX5: the card is ~215pt instead of
~600pt, "CalFresh/CalWORKs" wraps across three lines and is fully readable, and
the footer button renders both its lines.

`tests/app/countdown-scaling.test.tsx` — 12 tests. It asserts the caps are
applied to all five `Text` elements in the component (each early return is a
separate branch that can be missed independently), that the number's cap is
tighter than the word's, and — the converse — that **no other file in `src/`
uses `maxFontSizeMultiplier` or `allowFontScaling={false}`**. Verified by
breaking it: removing the cap from the number failed 2 tests.

Two things the test had to get right, both of which cost a run:

- The number is deliberately hidden from the accessibility tree (the wrapping
  `View` carries one combined label so a screen reader says "11 days left", not
  "11" then "days left"). `getByText` therefore needs
  `{ includeHiddenElements: true }`, or it reports the element as missing —
  which reads as a broken component, not a hidden one.
- The static half scans **comments stripped**. `tokens.ts` documents this very
  rule and names both banned patterns while using neither; scanning raw bytes
  flagged it, and the tempting fix — adding `tokens.ts` to the exempt list —
  would have trained the next person to add exemptions instead of reading the
  finding.

### A separate thing found on the way, NOT fixed

**React Native does not re-run layout when iOS Dynamic Type changes while the
app is running.** Changing the text size in Settings and returning to Carta
leaves glyphs drawn at the new size inside boxes measured for the old one: on
Home the programme name, action and case line drew on top of one another, and
the footer button clipped to "Photo".

This looked exactly like a layout bug at AX5 and is not one — **a relaunch at the
same size renders correctly**, which is how it was told apart. Worth knowing
before someone spends an afternoon on a layout that is already right. It is
still a real user-facing path (people change text size in Settings and come
back), and the fix is to key the tree on `useWindowDimensions().fontScale` so a
change forces re-measurement. Not done: it is a platform behaviour rather than
something Carta introduced, and the feature freeze rule applies. **Devansh's
call.**

### What this changes about testing

`xcrun simctl ui <device> content_size <size>` is a one-line sweep and it found
a defect that eleven screenshot reviews did not. It belongs beside
`xcrun simctl erase` in the phase-boundary routine. Accessibility is a scored
rubric axis *and* the entire point of the app; "we never set
`allowFontScaling={false}`" is a statement about the code, not a measurement of
the result.

---

## 2026-08-25 — Settings existed in the copy for weeks before it existed in the app

### The bug

Six user-facing strings told people to go to Settings. Carta had no Settings
screen.

Two of the six meant the *iOS* Settings app and were fine. The other four meant
Carta's own, and the worst was `onboarding.modelLater`:

> "You can turn this on later in Settings. Nothing is missing without it."

Onboarding runs **once**, and it was the **only** production path to the model
download (`bench.tsx` is the other and is deleted before freeze). So a user who
tapped **"Not now"** — the sensible choice on a metered connection, and the one
the copy actively reassures you about — was told they could enable it later and
then never could. The plain-language explanation, one of the two things this app
exists to do, was permanently unreachable, and Notice Detail rendered
`explain.notDownloaded` — "Turn it on in Settings" — as a dead end with no
button under it.

### Why nothing caught it

Nothing was broken in any way this repo can detect. It typechecked. It rendered.
The copy read well. **Both locales were in perfect parity** — `npm test` proved
en and es agreed, and they agreed about a screen that did not exist.

The i18n parity gate compares the two locales to each other. Nothing compared
either of them to the app.

### The fix

`src/app/settings.tsx`. Language, the local model (download / delete / size /
what it does), reminder timing, the privacy statement, and delete everything.
Reachable from Home in both the populated and the empty state, and from the two
places in `Explanation.tsx` whose copy names it.

`photoDeleted` — "You can change that in Settings" — was **not** fixed by
building the control it promised. The `deleteSourceImage` toggle is a default-on
privacy protection (SPEC §5), and a one-tap "keep the most legible copy of my
case number on disk", sitting under a paragraph explaining that nothing leaves
the phone, is a trap rather than a setting. The string was changed to state the
behaviour instead: *"Carta keeps the text, not the picture."* **Making the
sentence true was the cheaper and safer half.**

### The guard

`tests/node/settings-strings.test.ts`. Every string naming Settings must be
classified as **ours** (route exists, reachable from Home, registered in the
navigator) or **iOS** (the app actually calls `Linking.openSettings()`
somewhere). There is no unclassified bucket, because that is the bucket all six
were in.

It knows *Ajustes* and *Configuración* as well as *Settings* — a check that only
read English would have passed the Spanish half of every one of them.

Two things it caught while being written, both worth keeping:

- **The exemption list was wrong on the first try.** I wrote
  `home.noRemindersBody` and `capture.cameraDenied`; the real keys are
  `review.noRemindersBody` and `checklist.cameraDenied`. A stale exemption
  excuses nothing while making the list look considered, so there is now a test
  that every named key actually exists.
- **Comments are not code**, again. The privacy assertion "never claims the
  database is encrypted" failed because `settings.tsx` *documents* that this is
  the forbidden sentence. Same fix as `countdown-scaling.test.ts`: strip comments
  before scanning. Second time this month.

### Three things found while building it

**1. "Delete everything" did not delete everything.** `deleteAllData()` removed
`notices` and `reminders` and relied on foreign keys for the rest. `requirements`
really does cascade. **`documents` does not** — schema.ts makes it standalone on
purpose, because a pay stub outlives the notice it was attached to, which is what
makes the Vault possible. So the wipe kept every photographed document the user
owned. `settings` has no parent either, so the app did not even return to a
first-launch state.

A wipe that quietly keeps the most sensitive images on the device is worse than
no wipe, because the user has been told it is gone. Every table is now named
explicitly in `WIPED_TABLES` and nothing relies on cascade.

**2. Orchestration does not belong in a data-access module.** `rescheduleAllNotices`
was first written into `db/reminders.ts`, which seemed natural. Importing
`db/notices.ts` from there pulled `db/crypto.ts` and then `@noble/ciphers` — ESM,
untransformed — into every test that had only ever needed a mocked SQLite, and
`db-first-launch.test.ts` stopped being able to *parse*, on a change that had
nothing to do with first launch. Moved to `src/lib/reschedule.ts`, beside
`wipe.ts`, which already followed the rule: **a function that coordinates several
stores lives next to them, not inside one of them.**

**3. Changing the reminder hour has to reschedule.** Reminders already registered
with iOS carry the fire time they were created with, so writing the setting alone
would change what the screen says and nothing about when the phone buzzes. That
is the same shape as the reminder bug earlier today — the database and the OS
holding different truths — so it is fixed the same way: ask the OS to forget,
tell it again, record what it accepted.

### Verified in the Simulator

*(Heading corrected 2026-08-26 — it read "on the device" and the body has always
said Simulator.)*

Erased Simulator, real notification authorisation. Settings renders; the model
section reads 1.12 GB and offers the download; reminder timing persisted
(`reminderHour|8` in the settings table); **"Delete everything" took the database
from 38 notices / 152 reminders to 0 across all five tables, with no encrypted
image files left**, and returned to Home's empty state — which now carries the
Settings link.

---

## 2026-08-25 — Two things that looked like app bugs and were not

Recorded because the *reasoning that separated them* is the reusable part. Both
cost real time, and in both cases the tempting move was to start fixing the app.

### 1. React Native does not re-run layout when Dynamic Type changes at runtime

**Symptom.** After capping the countdown's font scaling, Home at AX5 looked
worse, not better: the programme name, the action line and the case line drew on
top of one another, the footer button clipped "Photograph a notice" to "Photo",
and the countdown card had a large dead gap between the number and its word.

That is three separate layout defects, all plausible, all in code I had just
touched. I nearly wrote them up as such.

**What distinguished it.** The text size had been changed with
`xcrun simctl ui <device> content_size` **while the app was running**. So the
question is not "is the layout wrong at AX5" but "is the layout wrong at AX5, or
is it wrong *after a change to* AX5" — and those have different tests.

**Relaunch at the same size.** Everything rendered correctly: the name wrapped
across three lines, the button showed both of its lines, the gap was gone. The
size was identical; only the transition was removed. So the layout is right and
the *response to the change* is wrong — React Native redraws glyphs at the new
size inside boxes Yoga measured for the old one.

**Decision: not fixed.** Platform behaviour, not something Carta introduced, and
a relaunch corrects it. It is still a real user path — people change text size in
Settings and come back — and the fix would be to key the tree on
`useWindowDimensions().fontScale` so a change forces re-measurement. Devansh's
call; left out under the feature freeze.

**The generalisation.** A stale-layout artifact and a real layout bug look
identical in a screenshot. The cheap discriminator is to *reach the state a
different way* — here, launch into it rather than transition into it. If the two
paths disagree, the bug is in the transition, not the layout.

### 2. Synthetic taps land about 50pt above where they are aimed

**Symptom.** Tapping the "Español" row in Settings did nothing, repeatedly.
Tapping the nav back chevron did nothing. The previous session recorded the same
thing and concluded "top-of-screen taps do not register", which is the wrong
shape of explanation — a region that ignores input is not a thing iOS does.

**What distinguished it.** After tapping "Español" (centre y≈254) several times
with no visible change, the settings table read `language|en`. **The taps were
landing — on the "English" row, centre y≈202.** A 52pt offset, not a dead zone.

Confirmed from the other direction: the identical `Choice` component lower on the
same screen — "Early morning (8:00)" at y≈707 — selected on the first tap and
wrote `reminderHour|8`.

So the control works, the offset is constant, and it only *looks* like a
top-of-screen problem because near the top there is usually something 50pt above
your target to hit instead, while near the bottom the tall primary buttons
absorb the error.

**CORRECTED 2026-08-26 — the offset explanation was wrong.** On a later pass the
window geometry checked out exactly (bezel 15 all round, title bar 20, so
`OFF_Y = 35` is right), and a tap at the *unadjusted* coordinate worked once the
**press duration** was raised from 0.06s to 0.25s. So the failing variable was
time, not position.

That is not the end of it either, and the honest state is that there are now
three diagnoses and no settled one: 0.06s fails on a SpringBoard system alert,
0.25s works on that alert but triggers **text selection** on a React Native
`Pressable`, and 0.10s registered on neither. The same `Pressable` rows accepted
taps earlier in the same session.

**So the useful conclusion is about method, not about a constant:** synthetic
taps here are unreliable in a way that has resisted three explanations, and a
negative result from one is worth nothing. Drive navigation with
**`xcrun simctl openurl carta:///<route>`**, which needs no tap at all, and
confirm outcomes at the **data layer** with `sqlite3` rather than by eye. Both
were used for everything structural in this session, and both were what actually
caught the reminder bug.

The wider lesson is the one this file keeps arriving at: **a confident diagnosis
that explains the symptom is not the same as the cause.** The 50pt figure was
derived from one real observation — `language|en` being written when `Español`
was aimed at — and it fitted. It was still wrong.

**The generalisation, and it is the same one as above.** "The tap did nothing" is
a claim about the app. Before believing it, check what the app *did* — the
database said the tap had worked perfectly, on the wrong row. **An input that
appears to do nothing has usually done something; look for the side effect
before concluding the control is dead.**

---

## 2026-08-25 — The feature whose purpose is privacy was the one that did not work

Found while building Settings, which is the screen "Delete everything" lives on.

### What it did

`deleteAllData()` ran two statements:

```sql
DELETE FROM reminders;
DELETE FROM notices;
```

There are **five** tables. `requirements` really does cascade from `notices`, so
it went. `documents` and `settings` did not.

So a user who tapped "Delete everything" — the strongest privacy control in the
app, the one whose copy says *"Removes every notice, every document, every
reminder and the key that unlocks them. This cannot be undone"* — kept:

- **every photographed document they owned.** Pay stubs, bank statements, a
  Social Security card, an immigration document. The Vault's whole contents.
- **every setting**, including `onboardingDone`, so the app did not even return
  to a first-launch state afterwards.

### Why it was invisible, and why that is the interesting part

**The bug was produced by a good design decision, working exactly as designed.**

`schema.ts` makes `documents` deliberately standalone, and says why in a comment
written weeks earlier:

> a pay stub photographed for August's SAR 7 is the same pay stub the next notice
> asks for, and collapsing them would either duplicate the file or lose the
> history. It is also what makes the Vault possible later without another
> migration.

That is correct. A document *should* outlive the notice it was attached to —
that is the entire premise of the Vault, and the Vault is a real feature that
exists because of it.

But "outlives its notice" and "survives a wipe" are the same sentence to a
foreign key. The deletion code was written when `documents` did not exist, it
said `DELETE FROM notices` and trusted the schema to carry the rest, and the
schema carried exactly what it had been told to carry. Nothing regressed.
Nothing threw. The two decisions were made months apart by the same person and
neither one was wrong on its own.

### The shape, for the written answer

Carta's pitch is that nothing leaves the phone. The corollary a user actually
cares about is that they can get it *off* the phone — and for a mixed-status
household deciding whether to trust this app at all, that is not a nice-to-have.

**The feature whose entire purpose is privacy was the one that did not work, and
it did not work because a decision made to enable a different feature quietly
changed what a third piece of code meant.** It is not a typo, it is not a race,
and no amount of care while writing `deleteAllData()` would have caught it,
because that function did not change. The thing that changed was the meaning of
"delete the notices".

That is the failure mode this project keeps finding, in a new costume:
configuring a thing is not verifying it happened; observing a discrepancy is not
handling it; and now — **a guarantee is not transitive. Deleting a parent does
not delete everything the user thinks of as "theirs", and the only way to know is
to enumerate.**

### The fix

`WIPED_TABLES` in `db/index.ts` names all five explicitly, children first, and
nothing relies on cascade. `wipe.ts` composes the four stores that have to go
together — iOS's scheduled notifications, the database, the image files and the
cached plaintext previews, and the keychain entries — collects failures instead
of stopping at the first, and reports what did not go rather than claiming
success.

Verified on an erased Simulator: 38 notices and 152 reminders across five tables
went to **0|0|0|0|0**, with no encrypted image files left on disk.

**The general rule this leaves behind:** a destructive operation must enumerate
what it destroys. Relying on the schema to imply the list means the list changes
whenever the schema does, silently, in the one code path where silence is worst.

---

## 2026-08-26 — Two green-on-one-machine bugs, and the CI that had never existed

Session goal was to close everything that is not the extraction cascade. Two
defects surfaced first, and they belong together: both were invisible for the
same reason, which is that nothing in this project had ever run anywhere other
than one Mac.

### 1. `scaffold.ts` claimed redaction it had never done

`extract()` in `src/lib/extraction-port/scaffold.ts` returned `redacted: true`.
It had returned `redacted: true` since `fc33506`, the commit that created the
file. Directly above it sat a comment saying so and instructing the reader to
revert it before the file was anything but a local experiment:

> TEMPORARILY true to exercise the explanation path end to end in the Simulator
> — REVERT before this is anything but a local experiment.

It was never reverted. In the weeks since, every notice the user confirmed wrote
OCR text into the database that had never been through a redaction matcher —
because there is no redaction matcher, in that file or anywhere else yet.

**What makes it a member of the family.** `saveNotice()` is written correctly:

```ts
if (input.ocrText !== undefined && !input.redacted) {
  throw new Error('refusing to store OCR text that has not been through the redaction matcher …');
}
```

That guard is not a comment or a convention; it throws. It also fires on a
*flag*, and the flag is supplied by the thing being guarded. A caller that lies
does not trip the guard — it disarms it. Nothing threw, nothing logged, and the
absence of an exception read exactly like a passing redaction.

`INTERFACE.md` states the opposite of what the code did — *"The scaffold returns
`false` and so the app currently stores no notice text at all"* — which is the
third time in this project a comment has asserted the inverse of behaviour, and
the reason nobody re-read the line.

**The rule this leaves behind:** *a guard that takes the guarded party's word
for it is a request, not a guard.* Where a caller can assert its own compliance,
the assertion has to be checked against something the caller does not control,
or the guard has to check the artifact itself.

Fixed: `redacted: false`, honestly. The cost is real and worth paying — the app
now stores no OCR text at all, so the explanation path has nothing to read until
the redaction matcher lands in `/src/extraction`. A privacy guarantee that is
false is worse than a feature that is absent.

The regression guard is in `tests/node/extraction-contract.test.ts`, and it is
written to die of natural causes: it asserts `redacted === false` only while
`USING_SCAFFOLD` is true, and hands over to the general contract — *if you
claim `redacted`, then an SSN in the text must come back as `containedSsn`* —
the moment the cascade is wired. Verified by putting `redacted: true` back and
watching nine assertions fail.

**Also found by the same suite:** the scaffold's `/Case Number:?\s*([\w-]+)/i`
matched the prose *"…or case numbers."* and returned a case number of `"s"`,
which the app would then salt, hash, and display to the user as the last four
digits of their case. The colon is now required and the value must contain a
digit. It surfaced from an adversarial input — a page built to contain no fields
at all, asserting that nothing comes back — which is the only kind of input that
finds this class of bug, because every real notice has a case number on it.

### 2. The suite was green in Pacific and red everywhere else

`npm test` reported 331 passing. Run on a machine set to UTC, it was 330 and one
failure: `tests/node/vault.test.ts`, the spring-forward DST case.

The assertion that failed is the *contrast* line — the naive millisecond
division that the test exists to argue against:

```ts
expect(documentAge(before, after).days).toBe(31);      // passes anywhere
expect(Math.floor((after - before) / DAY)).toBe(30);   // only true where DST happens
```

The code under test was never wrong. The test encodes a claim about local
calendar arithmetic, and in a zone with no spring-forward there is no lost hour,
so the naive number is also 31 and the contrast disappears. The test was correct
and its environment was assumed.

Fixed by pinning `process.env.TZ = 'America/Los_Angeles'` in `jest.config.js` —
the zone the corpus notices are mailed from — rather than by weakening the
assertion. `tests/node/timezone.test.ts` then asserts the pin actually took
effect, that the runtime resolved that zone, that the spring-forward transition
is still real inside it, and that local midnight is not UTC midnight. That last
one is the guard against a future "fix" that pins UTC and quietly turns every
local-midnight test into a tautology. Verified by deleting the pin and watching
all four fail alongside the original.

### 3. There was no CI

`.github/workflows` did not exist. CLAUDE.md §11 described the readability gate
as something that "fails CI", and SPEC §5 said the same — a gate that fails a
thing that does not exist. Both are corrected; the readability gate is still not
built and is now marked as such in both files.

`.github/workflows/ci.yml` runs typecheck, lint and both Jest projects on
Ubuntu, plus the metrics harness's own logic assertions. `content:check` runs
non-blocking on purpose: it exits non-zero while any sourcing item is open, and
items are meant to stay open until they are genuinely closed at the source
(§16). Gating merges on it would create pressure to close items early, and a
permanently red badge teaches everyone to ignore red.

**The point of CI here is not the badge.** It is that the tests run on a machine
nobody configured. Both defects above were unfindable on the only computer that
had ever run them, and the first one shipped to a public repository for weeks in
the feature the entire app exists to justify.

### What is now in place for the cascade

`tests/node/extraction-contract.test.ts` — 24 assertions that run against
whatever `adapter.ts` is wired to, so no edit is needed when the cascade lands.
Almost every one is conditional in one direction: *if you return a value, it
must satisfy this*, never *you must return a value*. Recall is the metrics
harness's job and requiring it here would keep the file red for the whole time
the cascade is being written. These guard the other failure mode — dates that
are not ISO or not real days, `invalid` set with nothing to show, indexes past
the end of the line array, an empty string standing in for "not found", the two
appeal clocks collapsing into one number, an approval read as a termination, a
value invented from a page that has none, and any answer that changes when the
clock does.

`docs/CASCADE.md` explains what a cascade is and the order to build one in.
Written because "write the extraction cascade" is only a useful instruction to
someone who already knows what the word means.

**Suite: 542 tests, 23 suites, typecheck clean.** Lint was not verified this
session — it needs a native binding that is not installed on the Linux VM the
work was done from; CI will run it on Ubuntu.
---

## 2026-08-26 — The check ran in the environment it was checking

`npm ci` failed on Ubuntu and all three CI jobs died inside ten seconds, before
a single test ran:

```
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

The lockfile carried `@emnapi/runtime` only *nested* under
`@unrs/resolver-binding-wasm32-wasi`, with no hoisted entry, while
`@emnapi/wasi-threads` **was** hoisted — internally inconsistent. npm 11
tolerates that; npm 10 refuses. The runner was Node 22 (npm 10.9.8) and this
machine is Node 24 (npm 11.6.2).

### The finding is not the lockfile

Before the CI commit, the lockfile was validated here with:

```
npm ci --dry-run     →  passes
```

It passed. It was also **meaningless**, for two compounding reasons:

1. It ran under **npm 11**, the resolver that does not mind the gap. The
   question was "is this lockfile valid", and it was answered by the one
   implementation that says yes.
2. It ran in a tree that **already had `node_modules`**. A dry run against a
   satisfied tree is not a clean install; the thing that fails on a fresh
   machine is precisely the thing already present here.

So the check consumed the environment it was supposed to be testing, and
reported the environment back as a result. It could not have failed.

### This is the third instance, and the shape is now unmistakable

- **The DST test.** `vault.test.ts` asserted that a naive millisecond division
  under-reports a 31-day span as 30 — true only where a spring-forward exists.
  Green in Pacific, red everywhere else. The test inherited the operator's
  timezone and called it a property of the code.
- **The `redacted` flag.** `saveNotice()`'s guard is written correctly and does
  throw, but it fires on a flag supplied by the caller it is guarding. A caller
  that lies does not trip the guard, it disarms it. The check inherited its
  answer from the thing under test.
- **`npm ci --dry-run`.** As above.

Each one is a check that **took an input from the thing it was checking**. A
guard that trusts the guarded party, a test that trusts the machine, a
validation that trusts the resolver that has already accepted the file. None of
them can fail, and all three read as green for weeks.

> **A check must not draw any input from its subject.** If it does, it reports
> the subject's own state back and calls it a verdict. The question to ask of any
> green check is not "did it pass" but **"what would have made it fail, and is
> that thing reachable from here?"** For `--dry-run` on a warm tree with the
> permissive resolver, the honest answer was *nothing*.

### The fix, and why it goes this direction

The npm version difference finds nothing true about this app. It is churn, so it
is removed rather than tested against:

- `.github/workflows/ci.yml` — Node **24** in all three jobs.
- `package.json` — `engines.node` `>=24 <25`, `engines.npm` `>=11 <12`, and
  `packageManager: npm@11.6.2`, so the pin lives in the repo and not only in the
  workflow. A machine that clones this repo now knows what it is supposed to run
  without reading a CI file.
- `package-lock.json` — **and this is where the plan met the evidence.** The
  intent was to regenerate under npm 11, the pinned resolver, so the lockfile
  would be authored by the tool that validates it. npm 11 promptly deleted the
  two `@emnapi` entries npm 10 had added, which is the drift demonstrating
  itself in both directions inside one afternoon. **That lockfile then failed
  `npm ci` on Linux**, so the pin alone does not settle it.

  Regenerating with `--os=linux --cpu=x64 --libc=glibc` produced a byte-identical
  file, so npm 11 omits those entries on every platform, not just this one. The
  lockfile that is actually installable is the **superset** — the npm 10 output,
  which npm 11 also accepts, pruning one optional package without error.

  So the committed lockfile is npm-10-authored on purpose. "Authored by the
  pinned resolver" was the tidier principle; "installs under both resolvers" is
  the true one, and where they disagreed the evidence won.

**Ubuntu and UTC stay.** Those are the differences that found the DST bug: a
different OS and a different timezone are properties this app genuinely has to
survive. A different npm is not.

### How the fix was verified, given the above

Not with `--dry-run`, and not in this tree. A **pristine clone into a temporary
directory, with no `node_modules`, running a real `npm ci`** — the same method
that reproduced the original failure under Node 22 before anything was changed.
The reproduction failing first is what made the pass afterwards mean anything.

**And then the lesson had to be applied twice.** That clean-clone check runs on
macOS, and the failure being chased was on Linux — so it, too, was a check that
could not see the thing it was checking. There is no Linux and no container
runtime on this machine, so CI is the only Linux available and the push *is* the
experiment. Confirmed by the shape of the result rather than a green tick: the
failing runs died at 23s / 11s / 7s, and the passing run took 79s / 38s / 33s,
which is the difference between `npm ci` aborting and the suite actually running.

One process note worth keeping. The first attempt at this changed **three things
at once** — Node version, `engines`/`packageManager`, and the lockfile — and when
CI went red the failure could not be attributed to any of them. Isolating cost an
extra round trip that changing one variable would have saved. `engines` and
`packageManager` were then each cleared by a local experiment rather than an
argument: there is no `.npmrc`, so `engine-strict` is off and `EBADENGINE` only
warns; and setting `packageManager` to a version other than the running npm still
exits 0, because npm does not enforce that field — corepack does, and `setup-node`
does not enable it.

---

## 2026-08-26 — Four of the five open sourcing items cannot be checked from here

Attempted to close the `content:check` items that a source can settle rather than
a fluent Spanish speaker. **Nothing was closed, and the count stays at 12.**

### Every government source refuses this environment

| source | needed for | result |
|---|---|---|
| `ssa.gov/locator` and `secure.ssa.gov` | the three SSA office records | **403** |
| `socialservices.sccgov.org` | the pay-stub freshness rule | **403** |
| `ssa.santaclaracounty.gov` | same | **403** |

Checked two independent ways — plain `curl` and the agent fetch path — so this is
not a user-agent artifact of one client. It is the same wall `cdss.ca.gov` and
`dhcs.ca.gov` already put up (CLAUDE.md §13), now confirmed for SSA and Santa
Clara County too. **Assume every `.gov` source in this project is a manual
browser step**, the way the Spanish CDSS forms already were.

### What that means for each item

**The three SSA offices stay open.** Their own `TODO_verify` says the addresses
"came from third-party aggregators, not ssa.gov" and that SSA closes and
relocates field offices. A confident wrong address in Carta is worse than no
address: someone takes a bus across San Jose to a shuttered office on the last
day of an appeal window. Aggregator data cannot be laundered into a source by
re-reading it.

**The pay-stub rule stays open, and is NOT narrowed.** The question was whether
"pay stubs from the last 30 days" applies to CalFresh *recertification* or only
to a new application. The county page that would answer it is blocked, so the
answer is unknown — and **narrowing the rule on a guess would be worse than
leaving it broad**, because the Vault's staleness warning would then either stop
warning on a document that is genuinely stale, or start warning about one that is
fine. Neither is a safe default to invent. It keeps `confidence: medium` and its
existing county wording, and the open item now says precisely what a human has to
look up.

### The community organisations: researched, not shipped

Both nonprofits are reachable, and their own sites gave everything the item asks
for. Recorded here so the work is not lost:

**Sacred Heart Community Service** — sacredheartcs.org, read 2026-08-26.
1381 South First Street, San Jose, CA 95110 · (408) 278-2160 general,
(408) 278-2172 financial coaching · Mon/Wed/Thu 9:00–16:00, Tue 9:00–18:00,
Fri 9:00–12:00, closed weekends · member intake in English, Spanish, Vietnamese
and Traditional Chinese · a computer lab where people can "sign up for CalFresh
or Medi-Cal" themselves, plus financial coaching with eligibility screening,
**by appointment**.

**Second Harvest of Silicon Valley** — shfb.org, read 2026-08-26.
Food Connection hotline 1-800-984-3663 · "here to help you figure out if you
qualify for CalFresh, answer any questions you may have, and help you apply when
you're ready" · thirteen languages including Spanish, Vietnamese, Chinese and
Tagalog · **no public street address or hours stated** — it is a phone service,
not a counter, which is a genuine difference from every other record in
`offices.json`.

**It is deliberately not in the content pack yet.** `offices.json` has
`county_offices` and `ssa_offices`; there is no community-organisation section in
`parse.ts` and no section rendering one in `where.tsx`. Adding the data without
those would put an unrendered block in a pack — and this repo has twice shipped a
string to a user because a pack and a screen disagreed about what a key was for.

So this is a **screen change, not a sourcing task**, and it needs: a parser and a
type, a `Section` on Where to Go, en+es strings, and a decision about how to
render an organisation that has a hotline instead of an address. That is Devansh's
call under the feature freeze — the research is done and waiting.

---

## 2026-08-26 — What the corpus cannot measure about `recipient_name`

Two defects in the column-walk approach to finding the recipient. Neither can be
observed by `npm run metrics`, because the corpus does not contain the inputs
that trigger them. Recorded as a **limit on the measurement**, not as a bug list:
the corpus is frozen until final metrics and must not grow to chase this.

### 1. Every ground-truth name is unaccented and upper-case

All ten:

```
MARIA REYES · DAVID OKONKWO · ANH TRAN · ROSA MARTINEZ CRUZ · CARMEN DELGADO
JOSE RAMIREZ · GLORIA HAYES · PATRICIA NGUYEN · SAMUEL BRIGHT
```

**`ROSA MARTINEZ CRUZ` and `JOSE RAMIREZ` would carry accents on a real notice**
— MARTÍNEZ, JOSÉ. The name-shape test that guards the walk is
`/^[A-Z][A-Z .'-]{3,40}$/`, whose character class contains no accented capitals
and no mixed case. So `JOSÉ MARTÍNEZ` and `Maria Reyes` both fail the shape test
and the field returns `undefined`.

The corpus cannot see this. Every fixture satisfies the pattern, so the metrics
run reports `recipient_name` at or near its OCR ceiling while the field fails,
silently, for a substantial share of the households Carta is built for. **The
measurement is not wrong. It is answering a narrower question than it appears to
answer.**

### 2. The sender's address block is never printed first

The walk anchors on the first line matching `/,\s*CA\s+\d{5}/`. The premise
"every capture has exactly one CA ZIP" turns out to be false — **four of the
twenty-three real captures have two**: the three `na960x` captures carry the
state appeals PO box in Sacramento, and `hcv-angled-20` carries
`505 W JULIAN ST, SAN JOSE, CA 95110`.

But in all four, **the recipient's city line is emitted before the sender's**. So
the corpus contains the hazard and never once orders it adversarially. The
untested case is not "more than one ZIP" — it is specifically *sender-before-
recipient ordering*, which is narrower and more precise.

That ordering produces a **well-formed wrong answer**, not a blank. Anchoring on
the agency's ZIP walks up to `333 W JULIAN ST`, takes the line above it, and gets
`SOCIAL SERVICES AGENCY` — upper-case, 22 characters, letters and spaces, which
satisfies the name-shape test. Verified against the code actually wired into the
app today: `scaffold.ts` returns exactly that.

This is the worse of the two defects. Defect 1 fails to `undefined`, which costs
the user a typing prompt. Defect 2 puts a plausible wrong name on Review under
the words "check this against your letter", which is precisely what a tired
person taps past.

### The general form, which is the part worth keeping

> **A measurement cannot see what its test data does not contain.**

This is the same instinct as `MIN_IMAGES_FOR_RATE`, applied to *content* rather
than *sample size*. That constant already stops the harness printing a percentage
for a condition with too few images — it refuses to answer a question the data
cannot support. Nothing yet stops the harness printing a confident
`recipient_name` figure derived from ten names that are all shaped the same way.

The failure mode is worse than an ordinary blind spot, because a corpus is
*generated*: `make_corpus.py` produced ten fictional recipients, and whoever
wrote them typed names they could type. The bias is not random and it points in a
predictable direction — toward the ASCII, toward the majority-culture spelling,
and away from the user in `CLAUDE.md`'s own persona, whose primary language is
Spanish.

**A corpus of fictional data inherits its author's defaults.** Ask of any test
set not only "is it large enough" but "what does it not contain, and does the
thing it omits correlate with the users who matter most."

### What was done instead of touching the corpus

Three cases added to `tests/node/extraction-contract.test.ts` as synthetic pages
with controlled boxes: an accented name, a mixed-case name, and a page where the
agency's block with its own CA ZIP precedes the recipient's.

They assert the **contract, not a value** — returning `undefined` is a pass,
because recall belongs to the metrics harness. What must never happen is a
confident wrong name. There is also a fixture-integrity test, because the way a
suite like this decays is that someone tidies a fixture, the distractor
disappears, and the tests keep passing while testing nothing.

**Two of them are red as of this commit**, against `scaffold.ts`. That is a true
positive, not a broken test, and it is deliberately not suppressed: the scaffold
reproduces the defect and is deleted at step 4 of the build order, at which point
these become the definition of done for `recipientName`.

---

## 2026-08-26 — Implicit membership is invisible membership

Three defects in this project turned out to be the same defect. Writing it down
once rather than logging a fourth instance.

### The three

**1. `deleteAllData()` deleted two tables of five.** It ran `DELETE FROM
reminders` and `DELETE FROM notices` and relied on foreign keys to imply the
rest. `requirements` cascades and went; `documents` is deliberately standalone —
that is what makes the Vault possible — and `settings` has no parent. So the
strongest privacy control in the app kept every photographed document the user
owned.

**2. `isRealIsoDate()` checked whichever dates a loop happened to reach.** It was
written the same day as the contract suite and called in exactly one place: a
loop over the real captures. Every adversarial synthetic page in that file — the
ones built specifically to produce bad values — was never calendar-checked. The
corpus is generated from valid dates, so the check was pointed away from the only
inputs that could fail it.

**3. Settings existed in six strings before it existed as a screen.** The i18n
parity gate compared the two locales *to each other*, and they agreed perfectly,
about a screen that was not there. Membership in "places the app can send you"
was implied by prose rather than stated anywhere a test could read.

### The shape

In each case a set that mattered — *tables to wipe*, *inputs to validate*,
*destinations that exist* — was never written down. It was implied: by the
schema's foreign keys, by a loop's iteration order, by the text of some strings.

> **A set defined by "whatever happens to be reachable" changes silently whenever
> the surrounding code changes, and it changes in the direction of covering
> less.**

That direction is the whole problem. Adding a table, adding a fixture, adding a
string — each is a perfectly ordinary edit, each *narrows* the implicit set as a
side effect, and none of them looks like it touched a guarantee. Nothing fails.
The check keeps passing, over a smaller domain, and reports the same green it
reported when the domain was complete.

Explicit membership inverts that. `WIPED_TABLES` and `SYNTHETIC_PAGES` are both
just arrays, and neither is clever. What they buy is that **adding a member is
now a visible act**: a new table that is not in `WIPED_TABLES` shows up in a
diff, and a synthetic page constructed inline is a page the sweep provably cannot
see, so the mechanism is the list rather than a convention about remembering.

The test for whether a set is at risk: *if someone adds a thing tomorrow, does
the set grow by itself, and if it does, what told it to?* If the answer is "the
schema" or "the loop" or "the file", the set is implicit and it will quietly stop
covering what you think it covers.

### The calendar finding, which is the clearest argument for `invalid` so far

Found by the sweep in (2), and worth keeping for its own reason. `parseDate` built
the day with `pad(Number(...))` and never asked the calendar:

```
"SEPTEMBER 45, 2026"  ->  2026-09-45
"SEPTEMBER 31, 2026"  ->  2026-09-31
```

Both ISO-shaped, both sorting correctly, neither a day.

**Nothing was ever mis-scheduled.** `isoToLocalMs` in `src/lib/dates.ts` rejects
`day > 31` outright and catches the rollover cases by comparing the components
back out of the `Date` — September 31 becomes October 1, so the round-trip fails
and it returns `undefined`. The guard is correct and it was already there.

**But the rejection is silent, and that is the damage.** The sequence a user
actually experiences: Review shows `2026-09-45` as what Carta read, with no
`invalid` flag to mark it, so it looks confirmed; they tap save; the storage
boundary drops it; no reminder is scheduled. Shown confidently, not flagged, then
discarded.

> **A guard that can only reject cannot explain.**

`isoToLocalMs` is at the wrong altitude to help: by the time a value reaches the
storage boundary the screen has already been drawn, the user has already made a
decision about it, and the only vocabulary left is "yes" or "silently no". The
validity check has to live in the layer that can still talk to Review — which is
exactly what `invalid` is for, and why INTERFACE.md asks for the value *plus a
flag* rather than a drop. Present-and-wrong and absent are different situations
and only one of them can be fixed by the person holding the paper.

Fixed in `scaffold.ts` today, in the one date path it has. It returns `undefined`
rather than a flagged value, deliberately: flagging is better behaviour and it is
step 6 of the cascade, in the file that replaces this one. A placeholder should
fail in the mild direction, not grow features. **The reason it was fixed at all,
rather than left to be deleted, is that "we are deleting this soon" is precisely
the reasoning that left `redacted: true` sitting in that file from fc33506 until
last week.**

---

## 2026-08-26 — A plugin that was never registered, and the reason it was invisible

The single most expensive defect in this project. Every device build since
2026-08-20 failed on entitlements a config plugin was supposed to strip. The
plugin was written, documented, and correct.

**It was never in `app.json`'s `plugins` array.**

```
plugins: ['./plugins/withDevelopmentTeam', 'expo-router', 'expo-secure-store', ...]
```

`withPersonalTeamEntitlements.js` sat next to `withDevelopmentTeam.js` on disk,
fully implemented, deleting `aps-environment` and
`extended-virtual-addressing` — and never ran once.

### Why it survived so long

**A plugin that is not registered is indistinguishable, from the outside, from a
plugin that runs and does not work.** Both produce an `.entitlements` file with
the entitlement still in it. Both produce the same Xcode error. Nothing warns
that a file in `plugins/` is not referenced — it is just a file.

Three things then made it worse rather than better:

- **CLAUDE.md documented it as active**, including a precise ordering rule:
  *"It must stay FIRST in the plugins array: Expo mods run in reverse
  registration order, and expo-notifications re-adds `aps-environment` whenever
  it finds it missing."* That rule is correct. It described a plugin that was not
  there. **A document describing behaviour is not evidence of behaviour**, and a
  *detailed* document is more convincing than a vague one, so the better the
  writing the longer the error survived.
- **The failure had a plausible owner.** Xcode said a personal team cannot hold
  these capabilities, which is true, so the conclusion "we need a paid account"
  fit the evidence perfectly and stopped the investigation. The paid team was
  eventually obtained and the build still failed, because the entitlement was
  still being declared.
- **The two entitlements were coupled.** Only the ~1 GB model needs
  `extended-virtual-addressing`; the camera needs none of it. Because they were
  declared together and stripped together, every failure to sign the *model*
  entitlement also cost the *camera*. The most demonstrable feature in the app
  was blocked on the least essential one, for months, and nobody separated them
  because the blocker looked like a single wall.

### The family it belongs to

This is the fourth instance of the shape recorded on 2026-08-26 as **implicit
membership is invisible membership**, and it is the sharpest:

| set | implied by | what it silently omitted |
|---|---|---|
| tables to wipe | foreign keys | `documents`, `settings` |
| inputs to calendar-check | a loop's iteration | every synthetic page |
| places the app can send you | the text of six strings | Settings, which did not exist |
| **config plugins that run** | **a directory listing** | **the one that mattered** |

And it rhymes with the `babel.config.js` finding: the `app` Jest project was
configured, referenced in the spec, and could not parse its first file for two
weeks while `npm test` reported green. Configured is not running.

> **A file's existence is not membership.** The registry is the membership list —
> `plugins`, `WIPED_TABLES`, `SYNTHETIC_PAGES`, `testMatch` — and anything not in
> it is inert no matter how good it is.

### What would have caught it in one command

Reading the generated artifact:

```bash
npx expo prebuild --platform ios
cat ios/*/*.entitlements
```

This repo already has the rule — *"configuring a thing is not verifying it
happened; read the generated artifact"* — recorded after four earlier instances.
It was not applied here, and the reason is worth naming: the artifact lives in
`ios/`, which is **gitignored and regenerated**, so it never appears in a diff
and there is no habit of looking at it. **The rule needs to be attached to the
places it is hardest to follow, not just stated.**

### Fixed

Registered first in the array, and made conditional so the two builds separate:

- **Build A** (default) — strips both. Camera, picker, OCR, cascade, Review,
  save, notifications. Needs nothing a paid team cannot hold.
- **Build B** (`CARTA_MODEL_BUILD=1`) — keeps `extended-virtual-addressing`, for
  the model only.

Verified by reading `ios/Carta/Carta.entitlements`: `default-data-protection` and
`increased-memory-limit` present, `extended-virtual-addressing` and
`aps-environment` gone.

---

## 2026-08-26 — The provisioning wall, actually explained

**Carta ran on a physical iPhone for the first time today.** Bundle id
`com.devansh-s.carta`, installed and launched on an iPhone 16 Pro, iOS 26.6.

### The real cause, and the correction

Every device build since 2026-08-20 failed. Two explanations were recorded along
the way and **both were wrong**:

1. **The PPQ theory** (2026-08-20, NOTES §"ppq.apple.com"). That free-account
   installs are checked against Apple's anti-piracy service and ours was being
   rejected on the bundle identifier or the display name. That entry already
   admits it was "never proven or disproven — it stopped mattering". **Mark it
   closed and wrong.** PPQ had nothing to do with it.
2. **The paid-account theory.** That a personal team simply cannot hold the
   entitlement set, so the fix was to buy a developer account. This one was
   *partly* true and entirely misleading: a personal team indeed cannot hold
   `extended-virtual-addressing`, so the error message fit — but the account was
   obtained and **the build still failed**, because the entitlement was still
   being declared by a plugin that was never registered (see the previous entry).

The actual cause, seen only once the account was signed in and the plugin was
running:

```
Failed Registering Bundle Identifier: The app identifier
"com.devanshsanghavi.noticetracker" cannot be registered to your development
team because it is not available.
```

**The free personal team `Q5BQCZ5D4G` had permanently claimed that bundle id.**
Free teams auto-create an App ID the first time you build to a device, and there
is no portal, no UI and no API to release one — a free account has no
Certificates, Identifiers & Profiles section to manage. So the string was gone
forever, and the paid team could never have it, and no amount of correct signing
configuration was ever going to work.

Fixed by taking a new identifier: **`com.devansh-s.carta`**, matching the paid
team's existing pattern. Permanent.

> **A free Apple team is not a sandbox you can back out of.** The first device
> build you attempt burns the bundle identifier. Choose the one you intend to
> ship *before* the first free-account build, not after.

### Why it took three explanations

Each wrong theory fitted the evidence available at the time, and each one
**stopped the investigation** because it had a plausible action attached — change
the display name, buy an account. The pattern is worth naming: an explanation
that comes with something to *do* is much harder to abandon than one that does
not, regardless of whether it is correct.

The tell that should have been noticed earlier: the paid account was bought and
the failure did not change. That is the moment the theory was falsified, and it
was read as "still more configuration to do" instead.

### And one more piece of instrumentation that reported success by existing

`formatRememberedTraces()`, `hasTraces()` and `clearTraces()` in
`src/lib/diagnostics/last-trace.ts` have had **no caller since fc33506**.
`review.tsx` calls `rememberTrace()` on every confirmed notice, so traces have
been recorded on every single run since the pipeline was built — and nothing has
ever read one.

That is the same shape as the rest of this list. The instrumentation existed, ran,
cost something, and produced a result nobody could see. It looks identical to
working instrumentation from every angle except the one that matters.

It also had a real cost today: on a physical phone there was **no way to read
`sourcePortrait`**, the one number that says whether EXIF rotation was applied to
a real `takePictureAsync` result. The copy-trace button exists only on the
failure branch, so a *successful* capture surfaces nothing.

> **Instrumentation with no reader is not instrumentation.** If nothing consumes
> it, it is a log file being written to `/dev/null` at the cost of a function
> call and a false sense of coverage.

---

## 2026-08-26 — The verification chain contained a check that could not fail

The sharpest instance of this project's recurring theme, because it was not in
the app. It was in the thing that checks the app.

I pushed `79e21ab` with `tsc` failing. The gate I was using:

```bash
npm run typecheck 2>&1 | tail -2 && npm run lint 2>&1 | tail -2 && npm test
```

**A pipeline's exit status is the exit status of its *last* command.** `tail`
succeeds at printing whatever it was given, including a compiler error, so
`$?` was 0 and `&&` continued. The error was printed on my screen, in the output
I had just read, and the chain ran on regardless.

### Why this one is the sharpest

Every other entry in this file is a check that could not fail *about the
product*: a wipe that implied its table list, a validator pointed only at data
that could not break it, a plugin that was never registered, instrumentation
nobody read. This one is a check that could not fail **about the checks**.

It is also the cheapest possible failure to avoid and the hardest to notice,
because it looks *more* careful than the alternative. Piping to `tail` is
something you do to keep output readable — a tidiness habit — and it silently
converts a gate into a print statement. The command reads as rigour and behaves
as decoration.

And note what did *not* save me: the error was visible. I read the output. Being
shown the failure was not enough, because the shape of the command told me it had
already been handled.

> **A gate you cannot see fail is not a gate.** Before trusting one, break the
> thing it guards and confirm it goes red. If that is inconvenient, the gate is
> probably not wired up.

### The fix, and the general form

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "typecheck=$?"
```

Redirect to a file and test the status, or `set -o pipefail`. Both are one
token longer than the broken version.

The general rule, which now covers five instances in this file: **whenever a
result is passed through something, ask what the something does to failure.** A
pipe drops it. A `catch` that logs swallows it. A boolean derived from a caller's
own claim inverts it. A regex with `\b` before `#` matches nothing. In every case
the machinery keeps running and reports the same green it reported when it was
working.

---

## 2026-08-26 — The device session, and the thing only a phone could tell us

Carta ran on a physical iPhone 16 Pro (iOS 26.6) for the first time. Five of six
planned checks passed; the sixth was skipped as impractical.

| | result |
|---|---|
| **A. Permission transition** | Warning appears when notifications are off, and **clears by itself** on return from iOS Settings without navigating. The `AppState` listener earned its place: `useFocusEffect` alone would not have fired, because coming back from Settings re-activates the app without Home ever losing focus. |
| **B. Native camera** | Focus, tap-to-focus and pinch zoom all good on a close-up page. |
| **C. Extraction** | Correct on a real photograph. |
| **D. Library path** | Reaches Review through the same `runCapturePipeline`. No fork. |
| **E. Reminder timing** | Set without error. The "off by default" text seen alongside it was the Diagnostics toggle's own description, confirmed by reading the string rather than assuming. |
| **F. Live banner** | Skipped, impractical timing. A verified banner already exists from the cold-start run. |

### What the phone found that nothing else had

**The reminder notification carried none of the information the app already
had.** It said:

```
CalFresh: 3 days left
Open Carta to see what to send.
```

A notification about a notification. Which form, and what to put in the
envelope, were one screen away in the app and the reminder pointed at them
instead of carrying them.

This is not a bug in any ordinary sense. Nothing threw, no test could have
failed, every string was correct, the copy was reviewed and the i18n parity gate
was green. It is a **product** defect, and it is only visible from the position
of someone standing at a bus stop with a phone buzzing in their pocket. A
reminder that costs an unlock, a launch and two taps before it says anything has
failed at the one job this entire product exists to do.

Fixed by composing the body from what the letter itself asked for: the action
first (so the collapsed lock-screen line is useful on its own), then the
documents. It reports and never prescribes — every document named came off the
user's own letter with `origin: 'letter'`, so §16 holds.

> **The gap between "the app is correct" and "the app is useful" is not visible
> from inside the repository.** Every finding in this session that mattered came
> from holding the phone: the camera that could not focus, the picker button
> nobody could see, the navigation with no way back, the reminder that said
> nothing. None of them would ever have failed a test, because each one was
> working exactly as written.

### Also changed, from the same session

- **Time format** now follows the device. The reminder picker is the native iOS
  control, so it honours Settings > General > Date & Time > 24-Hour Time and the
  locale without the app hardcoding either form.
- **A real time picker** replaced four preset hours. The presets were justified
  on the grounds that every extra decision is a burden on a frightened user;
  using the app disproved it. "Morning" and "evening" are not the shape of a real
  day, and someone starting a shift at 6:45 needs 6:15.
- **Every em dash removed** from user-facing English and Spanish, with
  `tests/node/no-em-dash.test.ts` to stop them coming back. Thirteen English and
  ten Spanish strings had drifted in. Replacements are per sentence, never a
  hyphen, which would just be a worse dash.
- **A third instance of the same layering mistake:** `reminder-content.ts`
  reached into `db/` and dragged `expo-sqlite` into the bare-Node test project,
  breaking suites unrelated to the change. Split into a pure composer and a
  fetching half. The rule keeps proving itself: **a module the test project
  imports must not touch a store.**

