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
