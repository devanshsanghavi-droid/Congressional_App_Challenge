# Carta — project guide

Everything a new session needs to be useful here: what this is, why it is built
the way it is, where the code lives, what has already been decided, and the
rules that must never be broken.

**Read `SPEC.md` for the full specification. Read `NOTES.md` for the dated
decision log.** This file is the orientation and the standing rules.

*Revised 2026-08-18. Currently in week 2 of the nine-week plan.*

---

## 1. What this is

**Carta** is a Congressional App Challenge 2026 entry for **CA-16 (Rep. Sam
Liccardo)**, built solo by **Devansh Sanghavi**. It is a React Native / Expo
iPhone app that photographs a government benefit letter, reads it entirely
on-device, and then makes sure the recipient does not miss the deadline.

Deadline: **Mon Oct 26, 2026, 12:00 PM EDT**. Feature freeze **Oct 12**. Submit
**Oct 20–21** — the portal jams near the deadline and submissions cannot be
edited afterwards.

### The problem

Most people who lose SNAP/CalFresh, Medi-Cal, or a housing voucher **do not
become ineligible**. They get terminated for *procedural* reasons — a missed
semi-annual report, an unreturned verification request, a recertification packet
that arrived during a double shift. Researchers call this **churn**. It is
enormous and almost entirely unaddressed.

The government's own communication causes it: a Notice of Action is dense,
jargon-heavy, often English-only, with the deadline buried in the third
paragraph.

### The insight that differentiates the entry

> Every other entry in this district will build for **enrollment** — helping
> people find and apply for benefits. Carta builds for **retention** — helping
> people keep what they have already been approved for.

### The target user

Maria, 34, San Jose. Two kids, two part-time jobs. CalFresh and Medi-Cal.
Primary language Spanish. One phone, limited data, no printer, no computer. She
has lost CalFresh twice — both times for paperwork, both times still eligible,
both times two months to get back on.

---

## 2. Carta is a deadline tracker, not a document explainer

This is the most important strategic framing in the project, and it drives
design decisions everywhere.

The only hard question this product faces is **"why not just paste the letter
into ChatGPT?"** The honest answer: ChatGPT will explain a letter. It will not
know, five weeks later, at 9am, that your SAR 7 is due Thursday and you still
have not attached a pay stub. **Comprehension is commoditised; persistence is
not.** The defensible claim is that Carta *remembers and acts*.

**Design consequence:** the countdown is the dominant element on Home and at the
top of Notice Detail. The plain-language explanation is the **trust mechanism**,
not the headline — a countdown saying "12 days" is worth nothing unless the user
believes the app read the letter correctly, and the explanation is how they
check. That is a smaller role than "AI explains your letter", but it is
load-bearing. Never let the explanation take visual priority over the deadline.

---

## 3. Hard constraints — never break these

1. **No network calls on any code path that touches notice data.** OCR,
   extraction, storage, scheduling — all offline. `no-network.test.ts` enforces
   it; if you make it fail, you broke the product, not the test.
2. **No cloud LLM APIs.** No OpenAI, Anthropic, Google AI, no hosted inference
   of any kind. All inference is local via `llama.rn` with a downloaded GGUF
   model.
3. **Exactly one network call exists in the app:** the user-initiated,
   wifi-gated model download in Settings. It touches no notice data and lives
   outside the pipeline. Everything else works in airplane mode, forever.
4. **No backend, no accounts, no API keys, no paid services.** If a task seems
   to need a server, bundle static JSON instead.
5. **Never persist an SSN.** Redact before the first write. Case numbers are
   stored as salted hashes plus last 4 only.
6. **The user confirms every extraction before anything is scheduled.** No
   silent action on a machine reading of a legal document.
7. **Never write captured images to the camera roll.** App sandbox only.

---

## 4. Product rules

### The model does not invent legal rules

Deadlines, appeal windows, and required documents come from what is printed on
the letter plus the bundled content pack. If the model cannot find a value,
**the field is empty and the user fills it in. Never fabricate a date.**

The plain-language rewrite has **five guardrails**, all of which must be
**visible in the UI**, not quiet internal rules:

1. The original text is always one tap away, on the same screen.
2. The rewrite is visibly labelled machine-generated.
3. It never states a deadline that was not extracted *and confirmed*.
4. It never tells a user they are ineligible.
5. It may only restate content present in the source. A self-check flags any
   date in the rewrite that is not in the confirmed fields.

### Manual entry is a first-class path

The model is an opt-in ~1 GB download. Before it is downloaded, if the user
declines, on a low-RAM device, or if it stalls — **the app must be fully
usable**. The deterministic regex/lexicon pre-fill always runs, model or not, so
a user without the model gets a half-filled form rather than a blank one.
**Never build a screen that assumes the model is present.** This is also the
video insurance: if the model stumbles on camera there is still a complete app.

### Progressive fill

Regex populates the Review screen **instantly**; LLM values sharpen fields in
place as they arrive. This collapses the manual path and the model path into one
screen (less code), removes the blocking wait, and on camera reads far better
than any loading state. Extraction total time is a comfort metric, not a gate.

### "Worth checking" is a cross-reference, never a determination

SPEC §2.1 shows adjacent programs after a notice is confirmed. Three
non-negotiable rules, because this sits right next to the eligibility screening
§10 forbids:

1. **Population-level phrasing only** — "people receiving X are often also
   eligible for Y", never "you may qualify".
2. **Keyed on program and county only.** Never household size, income, or age.
   Filtering on an eligibility input turns a cross-reference into a
   determination. *If a feature needs to ask the user an eligibility question,
   it has crossed the line.*
3. **The public-charge myth-buster renders inline** with the list, never behind
   a link.

---

## 5. Architecture — the pipeline

```
photo
 └─> expo-image-manipulator   (resize + EXIF rotate ONLY)
      └─> expo-mlkit-ocr      (on-device, off the shelf)
           └─> REDACT         (SSN stripped before anything is persisted)
                └─> DETERMINISTIC PASS      (always runs, model or not)
                     │   • pre-fill: dates, programs, agencies, form IDs
                     │   • region select: pick what is worth sending to the model
                     └─> LOCAL LLM          (optional, GBNF-constrained JSON)
                          └─> SANITY PASS   (always runs)
                               └─> USER CONFIRMS (never skippable)
                                    └─> schedule reminders, build checklist
```

**Deterministic beats probabilistic.** If a field can be extracted with a regex
or a lexicon, do that — do not reach for the model. The model exists for what
regex cannot reach, and for the plain-language rewrite.

**Extraction and explanation are two separate calls.** Extraction returns fast
on capture; explanation streams **on demand** when the user taps "Explain this".
Better latency and better on camera than one long wait.

**GBNF over JSON schema.** A hand-written grammar constrains a date field to
`\d{2}/\d{2}/\d{4}` *at the token level* — a malformed date becomes
structurally unreachable rather than caught afterwards. A JSON schema cannot
express that. It is also unambiguously the student's own work.

### Preprocessing is resize + EXIF rotate only

`expo-image-manipulator` **cannot** grayscale, adjust contrast, or deskew — its
complete action set is `resize | rotate | flip | crop | extent`. Beyond that,
aggressive binarisation is Tesseract-era advice; neural recognisers generally do
*worse* on hand-thresholded input. Whether more preprocessing helps is an
experiment against the corpus, not an assumption.

---

## 6. Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK **57.0.12**, React Native **0.86.2**, React **19.2.3** — dev client, **not** Expo Go |
| Language | TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Navigation | `expo-router` (file-based, routes under `src/app`) |
| OCR | `expo-mlkit-ocr` **off the shelf**. ⚠️ Despite the name it runs **Apple Vision on iOS** at its default `iosEngine: "auto"` — no ML Kit pod is installed. ML Kit on Android. See §13. |
| Local LLM | `llama.rn` **0.12.9** (stable line — npm's `latest` tag points at an RC) |
| Model | Qwen2.5-1.5B-Instruct GGUF Q4_K_M (~1.1 GB), Apache 2.0; 0.5B fallback |
| DB | `expo-sqlite` + field-level encryption, key in `expo-secure-store` |
| Files | `expo-file-system` (app sandbox only, never MediaLibrary) |
| Reminders | `expo-notifications`, **locally scheduled only** |
| i18n | `i18next` + `react-i18next`, **en + es only**, bundled not fetched |
| State | Zustand |
| Testing | Jest, two projects: bare Node and `jest-expo/ios` |

### Platform

**iOS / iPhone is the primary target.** React Native keeps Android compiling for
free — keep it compiling and prove it with an EAS Android build at each phase
boundary, but **spend no time on Android-specific polish**. All demo footage is
filmed on iPhone, and judges evaluate a video: nobody is installing this build.
If an Android build ever fails, either fix it quickly or drop the cross-platform
claim honestly in the README.

There is deliberately **no local Android emulator** on this machine — Android
Studio is a multi-gigabyte install plus first-build time for a platform nobody
will open.

Full inventory with licences and rationale: **`DEPENDENCIES.md`**.

---

## 7. Code layout

```
src/app/                 expo-router routes
  _layout.tsx            root Stack, SafeAreaProvider, i18n init (side-effect import)
  index.tsx              build-check screen — replaced by Home in week 3
  bench.tsx              DEV TOOL: week 1 latency gate. Delete before freeze.

src/lib/                 app-side, platform-aware code (Claude drives this)
  i18n/index.ts          i18next setup; resolveInitialLanguage() from device prefs
  i18n/locales/{en,es}.json
  llm/model.ts           model catalogue, sandboxed download + progress, delete
  llm/benchmark.ts       latency harness; timings come from llama.cpp, not wall clock
  llm/benchmark-fixtures.ts  fictional notice, stub GBNF grammar, 4 benchmark cases

src/extraction/          THE STUDENT'S WORK — pure TS island, see §8
  README.md              what lives here and why the island rule is enforced 3 ways
  tsconfig.json          lib: ES2022, types: [] — no DOM, no Node globals
  index.ts               placeholder barrel (build plumbing only, flagged in-file)

content/                 static bundled JSON: programs, explanations, doc types,
                         offices, "worth checking" cross-reference
content/templates/       notice templates as DATA — part of the island

tests/node/              bare-Node tests
  extraction-island.test.ts   reads bytes on disk, fails the build on a violation
  corpus-integrity.test.ts    corpus map vs disk; the 01->02 chain; the approval
  metrics-scoring.test.ts     the comparators and the P/R arithmetic
  urgency.test.ts             countdown tiers, reminder ladder, DST boundaries

src/lib/urgency.ts       countdown tier + reminder ladder (SPEC 6/7), pure
src/lib/capture/pipeline.ts   ONE traced path: OCR -> orientation -> extract.
                              Camera, picker and self-test all call it.
src/lib/diagnostics/     stage trace with timings; copyable, carries no notice
                         content. Dev only, delete before freeze.
src/lib/content/         bundled content packs, validated on parse
  parse.ts               pure - takes raw JSON as an argument, throws on bad data
  validate.ts            population-level phrasing rule, enforced mechanically
  index.ts               the only place content/*.json is imported

content/cross_reference.json   "worth checking" cross-references, sourced
content/offices.json           Where to Go directory + appeals routing

tools/corpus/            THE EVALUATION CORPUS - 10 notices, 23 real captures,
                         56 synthetic variants, ground_truth.json, generators
tools/corpus/ocr/        committed OCR text layer, one JSON per image per engine
tools/metrics/           the metrics harness - see its README
  ocr/vision-ocr.swift   Apple Vision producer (harness only, NOT the app's OCR)
  corpus.ts              machine-readable MANIFEST.md: photo -> notice/condition
  fields.ts              field taxonomy: printed | derived | semantic
  extractor.ts           the seam where /src/extraction plugs in
  score.ts report.ts run.ts logic.ts
  probe/                 FEASIBILITY PROBE - measurement only, never copy into
                         /src/extraction. See probe/README.md.

tools/forms/             blank public form PDFs + fetch script (manual download)

patches/                 patch-package patches, reapplied on postinstall
```

---

## 8. The extraction island — the most important structural rule

`/src/extraction` must run **unchanged** in two places: on the phone, and in
plain Node against the golden corpus. It therefore imports nothing
platform-specific and reaches for no global. OCR text, bounding boxes, a
template, and a clock all arrive as **arguments**.

Enforced three ways, and **they are not redundant — this was verified by probe,
not assumed**:

1. **`src/extraction/tsconfig.json`** — `lib: ["ES2022"]`, `types: []`. No DOM
   means `fetch` is not declared: reaching for the network is a compile error
   (`TS2304`).
2. **`eslint.config.js`** — bans `react`, `react-native`, `expo-*`, app-side
   `@/lib/*`, and Node built-ins in that directory.
3. **`tests/node/extraction-island.test.ts`** — reads the actual bytes on disk
   every `npm test`.

**Why they are a pair, not copies:** a bare `fetch` correctly fails under (1) —
but add `import type { ViewProps } from 'react-native'` to the same file and the
error *disappears*, because React Native's type definitions re-declare `fetch`
globally. Rule (2) is what stops the import that smuggles the globals back in.
Remove either and there is a hole.

If extraction stops being portable, the corpus harness stops running, and that
harness is the only way to know whether a change made accuracy better or worse.

---

## 9. Conventions

- TypeScript strict. No `any`. Discriminated unions for `ActionType`,
  `ExtractionSource`, notice `status`.
- **All user-facing strings go through i18n. No hardcoded English in components,
  ever.** Write the Spanish as each screen lands, not at the end — i18n is
  already wired, so week 7 is *review*, not first-write.
- Spanish wording comes from **CDSS's official translations** of the same forms
  wherever it exists, not from scratch translation.
- Dates are epoch millis computed in the device's local timezone. Test DST
  boundaries.
- Notice templates are **data** (`content/templates/*.ts`), never code branches.

---

## 10. Screens and cut order

**Decided in advance so week 9 is not a panic.** Nothing below the line may
steal polish from anything above it.

| Priority | Screen |
|---|---|
| **Core — must be excellent** | **Home** (countdown dominates), **Capture**, **Review**, **Notice Detail** |
| 5 | Checklist |
| 6 | Settings — *if cut back: language + model + delete everything only* |
| 7 | Vault |
| 8 | Where to Go — **first to cut** |
| — | Onboarding (3 screens) |

**Polish means** every screen has a real empty state, loading state, and error
state. No lorem ipsum, no placeholder copy, no dead buttons. **If a screen is
not finished, cut the screen rather than ship a stub.**

**Non-negotiable design constraints:** one-handed operation; ≥16pt body text
with Dynamic Type; every interactive element ≥44pt; full screen-reader labels;
no timeouts; every screen usable in airplane mode; all copy ≤6th-grade in both
languages. Accessibility is a scored rubric axis *and* the entire point of the
app — treat a11y regressions as build breaks.

---

## 11. Testing and ship gates

- **`no-network.test.ts`** — monkey-patches `fetch`, `XMLHttpRequest`, and the
  RN bridge to throw, then runs the full pipeline over the corpus. Any network
  attempt fails the build. Referenced by filename in the README and the video.
- **Redaction tests** — SSN in 8 formats must never reach the DB or a file.
- **Readability gate** — Flesch–Kincaid ≤ grade 6 on bundled English
  explanation content; Fernández-Huerta for Spanish. Fails CI above that.
- **Metrics table** — `npm run metrics`. Per-field precision/recall by
  condition, for *both* the deterministic-only path and the model path. Goes in
  the README. Three rules it enforces structurally:
  **real captures and synthetic degradations are never merged into one number**;
  **conditions are the rows, not the average**; and every figure is reported
  beside the **OCR ceiling** so a miss is attributable to extraction or to the
  recogniser. See `tools/metrics/README.md`.
- **Corpus** — built 2026-08-18. 10 fictional notices, 23 printed-and-
  photographed captures across 5 physical conditions, 56 synthetic degradations.
  **Never use a real person's notice.**
- **A personal Apple team cannot sign this app's full entitlement set.** Xcode
  refuses to create a profile at all if *any* entitlement is unavailable to the
  team. `plugins/withPersonalTeamEntitlements.js` strips the two that are:
  `aps-environment` (removed permanently — Carta is local-notifications only and
  never wanted it) and `extended-virtual-addressing` (**removed temporarily, and
  it invalidates the llama.rn benchmark** — see NOTES.md 2026-08-20). Delete the
  plugin when there is a paid account. **It must stay FIRST in the plugins
  array**: Expo mods run in reverse registration order, and expo-notifications
  re-adds `aps-environment` whenever it finds it missing.
- **Developer Mode must be on for a device build.** Settings → Privacy &
  Security → Developer Mode, then restart. `devicectl` shows the device as
  `connected (no DDI)` until it is.
- **A dirty DerivedData produces an app that builds and cannot launch.**
  `Library not loaded: @rpath/React.framework/React` at dyld time, after
  `Build Succeeded, 0 errors`. RN 0.86 ships `React.framework` and
  `ReactNativeDependencies.framework` as prebuilt XCFrameworks, and an
  interrupted or concurrent build leaves `[CP] Embed Pods Frameworks` having
  skipped them. **A clean build embeds them correctly** — verified 2026-08-20 by
  wiping DerivedData and rebuilding. Fix is `rm -rf ~/Library/Developer/Xcode/DerivedData/Carta-*`,
  not a config change. **Do NOT set `ios.buildReactNativeFromSource`** — it
  looks like the fix and it breaks the build with a Swift 6 concurrency error in
  `expo-modules-core/ios/Core/Events/EventEmitter.swift`. A green build log
  proves nothing; launch it.
- **Without notification authorisation iOS keeps nothing.**
  `scheduleNotificationAsync` returns an id, every layer reports success, and
  the OS retains zero. Always check what the OS actually holds
  (`listScheduled()`), and always tell the user when reminders were not set.
- **`expo-mlkit-ocr` sorts lines geometrically, interleaving columns.** On a
  real notice the right-hand column lands *inside* the address block, so
  "N lines above X" is wrong. Anchor on a column x-position and walk within it.
  Third time this hazard has bitten; see NOTES.md 2026-08-20.
- **Privacy model is field-level, not whole-database.** The full column-by-column
  list is in NOTES.md (2026-08-20). Short version: the OCR text is AES-256-GCM
  ciphertext, the case number is a salted hash plus last 4, and **the recipient
  name, the dates, the programme and the photo file are plaintext**. Never say
  "the database is encrypted" — say what is actually true, which is still
  strong because none of it leaves the phone.
- **The harness and the iOS app run the same engine family — Apple Vision.**
  Established from `Podfile.lock`, the podspec, the config plugin and the module
  source (§13). The harness's extra config — pinned revision 3, `en-US,es-ES`
  declared — measures **zero difference across all 79 images** against the app's
  defaults. What is still unverified is macOS Vision vs iOS Vision, which are
  separate model builds; only a device run closes that. **Android is genuinely
  ML Kit and these figures do not describe it.** Never quote a corpus number
  without naming the engine and the platform.

---

## 12. Where we are right now

Week 2 of nine. Eight commits. `main` pushed to
`git@github.com:devanshsanghavi-droid/Congressional_App_Challenge.git`.

**Done:** repo + docs; Expo SDK 57 scaffold building and running on the iOS
simulator; extraction island enforced and probe-verified; i18n en/es wired;
storage/OCR/LLM dependencies installed and linking; week 1 benchmark harness
built, committed, and verified to compile and bundle.

**NEXT — the camera path has never run.** Everything proven so far is
downstream of a file a script put on disk. `DEVICE-TEST.md` is the tap-by-tap
script for the physical phone: camera, picker, a real inverted capture, and the
notification banner. Every run is traced, so a failure names the stage. **The
one number to watch is `sourcePortrait` in the `ocr` stage** — if a portrait
photo reports `false`, EXIF rotation is not being applied and every bounding box
is sideways. That cannot be caught in the Simulator, which has no camera.

**2026-08-20 — the thin spine runs, verified in the Simulator.** Photo → OCR →
orientation check → extract → save → reminders registered with iOS, over three
real corpus photographs. `osHeld: 11`. Orientation anchors measured on device
(0.207 / 0.215 upright, 0.651 inverted) match what the corpus harness predicted.
**Four problems found doing it**, three of which would have shipped silently —
the app could not launch at all, reminders were being scheduled into nothing,
and the recipient name failed on every capture. All in NOTES.md; the build one
still needs a fix applied. 134 tests.

The extraction cascade is stubbed behind `src/lib/extraction-port/`; see
`src/extraction/INTERFACE.md` for the exact shape the app calls, and delete
`scaffold.ts` when the real one lands.

**2026-08-20 — the architecture question is answered.** Deterministic
extraction on real photographed OCR: **96.4% precision / 87.6% recall** on core
fields, and **100% precision on every date the app schedules on**. The precision
loss is entirely in `recipient_name` and `case_number`, from OCR character
misreads — which is a Review-screen requirement, not a parser one: those two
fields need to be visibly checkable against the photo. Geometry (SPEC §4 Layer
1) is worth +4.8pp precision and is now justified by measurement.

Qwen2.5-1.5B on the same text **corrupts the core** (4 wrong, 2 invented, vs 0
and 0 for regex) and adds nothing on the long tail. So: **the model does not
touch the core fields.** It earns its place on unseen layouts and on the
plain-language explanation. Details and the full caveats in NOTES.md.

**FROZEN 2026-08-19 — the corpus is done.** No further work on it until week 8,
when the real extractor runs against it and produces the number that goes in the
README. Defects found before then go in NOTES.md and wait, unless they block the
app. It already does its job: one number in the README, one line in the video.
The harness supports a rate claim for **flat (n=8) and creased (n=5)** only —
everything else is an existence proof and the report refuses to print it as a
percentage.

**Done 2026-08-19 — corpus v2.** Notice 02's chronology defect fixed and the
three na960x captures reshot. Two relabelled to their true conditions —
`colour-cast` (magenta LED, not low light) and `inverted` (180° + skew, not
skew) — so notice 02 now contributes flat/colour-cast/inverted and nine real
conditions exist. The chain warning is clear. **`expo-mlkit-ocr` turns out to
run Apple Vision on iOS, not ML Kit** (§13), so the harness and the app share an
engine family; what is left to verify is macOS Vision vs iOS Vision on device.
Vision reads a 180° page fine but returns boxes in the raw frame — see NOTES.md
for why that argues for a "turn your phone around" prompt on Capture rather than
orientation correction in code.

**Done 2026-08-18 — the evaluation corpus and the metrics harness.** 10
fictional notices, 23 real captures across 5 physical conditions, 56 synthetic
degradations, committed with ground truth and both generators. `npm run metrics`
scores them and writes `tools/metrics/out/METRICS.md`. The extraction cascade is
not written yet, so the extractor is `null` and the informative number today is
the **OCR ceiling**: 97.9% on real captures, 62.5% on synthetic. `npm test` is
71 tests across 4 suites.

Three things that came out of it and matter beyond the harness:

1. **Blur is uncapturable on an iPhone** — Deep Fusion sharpens document text
   after capture, so blur and noise had to be synthetic while skew, crease,
   shadow and low light stayed real. This is written-answer material.
2. **The physical conditions largely saturate.** All five captures of the same
   SAR 7 sheet put every printed field into the text, and seven of nine
   conditions score 100%. The claim "94% on flat, 71% on creased" is *not
   available* from this corpus at the OCR stage — say so rather than dress a
   flat table up as a gradient.
3. **A corpus defect was found and fixed** (notice 02's chronology). The test
   that reported it is now inverted into a regression guard, because
   `make_corpus.py` was never updated and would reintroduce it.

**BLOCKED — the week 1 gate is not closed.** The benchmark has never been run.
It requires the **physical iPhone**: the simulator runs on the Mac's CPU and
says nothing about Metal. Nothing else in week 1 matters until these numbers
exist, because they decide 1.5B vs 0.5B, which everything else is built on.

To close it: `eas build --profile development --platform ios`, install, open the
app, tap **Model benchmark**, download the 1.5B, **Run benchmark**, **Copy
results**, paste into NOTES.md.

### How to read the results (decision tree agreed with Devansh)

- **Gate 0** — `extraction-grammar` JSON = ✗ → grammar bug, not performance.
  Stop; no other number means anything.
- **Gate 1 — TTFT** (the number that decides "does it feel broken"):
  <3s ship · 3–5s acceptable *with a visible thinking state* · >5s → lever ladder.
- **Gate 2 — generation rate** on `explanation-stream`: ≥6 tok/s outruns the
  real reader (5th-grade, second language, phone — ~2–3.5 tok/s), stop
  optimising · 3–6 acceptable · <3 shorten output.
- **Gate 3 — extraction total**: <10s fine · 10–15s fine *with progressive
  fill* · >15s → lever ladder.
- **Gate 4 — which lever:** `promptMs` >60% of total → prefill-bound (expected).

**Lever ladder, cheapest first:** (1) prompt prefix caching — check `cache_n`,
it may be free; (2) **region selection** — `extraction-short` vs
`extraction-grammar` already measures the size of this prize; (3) fewer
generated tokens; (4) progressive fill (UI, do it anyway); (5) **0.5B last** —
downgrade *extraction* before *explanation*, because GBNF prevents malformed
output from a weak extractor and the user confirms every field, whereas a weak
explainer produces visibly clunky prose in the shot that is on camera.

**Also outstanding:** blank form PDFs are not yet in `tools/forms/` (needed
week 8); "worth checking" JSON and the ~10 office records need sourcing by
Devansh (an afternoon each).

---

## 13. Traps already discovered — do not rediscover these

- **Expo SDK 57 does not compile under Xcode 26.2 without our patch.**
  `abs(milliseconds)` in `expo-modules-jsi` is ambiguous under Swift 6 with
  `-cxx-interoperability-mode=default` (C++ interop makes C's `abs` overloads
  visible). Fixed with `.magnitude` in
  `patches/expo-modules-jsi+57.0.4.patch`, reapplied by `patch-package` on
  `postinstall`. Remove when upstream fixes it.
- **iOS memory entitlements.** `llama.rn`'s plugin only adds
  `increased-memory-limit` when `EAS_BUILD_PROFILE` is set, which local
  `expo prebuild` never sets. They are now declared directly in `app.json`.
  Without them a ~1 GB model is OOM-killed, which misreads as "too big,
  downgrade to 0.5B".
- **Never pipe a native build through `tail`/`head`.** SIGPIPE kills xcodebuild
  mid-write and the corruption later surfaces as an error in someone else's
  source. Redirect to a file.
- **Port 8081 is occupied** by another project on this machine. Metro runs on
  **8082**.
- **`cdss.ca.gov` and `dhcs.ca.gov` block agent traffic** (TCP drop and an
  Incapsula challenge respectively, both from a proxy IP range). Form downloads
  are a manual browser step.
- **Check `dist-tags.latest` against the version list.** `llama.rn`'s `latest`
  points at a release candidate while a healthy stable line ships alongside.
- **`expo-mlkit-ocr` does not use ML Kit on iOS.** Its config plugin computes
  `shouldDisableMlkit = iosEngine !== "mlkit"`, and `iosEngine` defaults to
  `"auto"` — so the default writes `EXPO_MLKIT_OCR_DISABLE_MLKIT = '1'` into the
  Podfile, no `GoogleMLKit` pod is installed, and the module's `#if canImport`
  falls through to `VNRecognizeTextRequest`. On device as well as simulator. The
  package README claims ML Kit "for both iOS and Android" and is wrong for the
  default configuration. To actually get ML Kit on iOS you would pass
  `{"iosEngine": "mlkit"}`, which then breaks arm64 simulator builds. **This is
  fine — Vision is a good recogniser and it is what the corpus is scored with —
  but the name of the package is not evidence of the engine.** Fourth instance
  of "configuring a thing is not verifying it happened", found by reading
  `Podfile.lock` rather than the README.
- **GBNF guarantees the shape, not the value, and not the truth.** Measured
  2026-08-20. `\d{2}/\d{2}/\d{4}` accepts `00/00/0001` and `20/09/2026` —
  constrain month and day *ranges*, not just digit counts. And a grammar with no
  `null` production forces fabrication: on a notice with no deadline the model
  emitted the notice date instead, because no legal token sequence meant "not
  stated". Needs all three — a null production, a prompt that names it, and the
  sanity pass. The unconstrained model got that case right; the constrained one
  did not.
- **This llama.cpp build cannot parse a GBNF rule split across lines.** A
  newline ends the rule. Long rules go on one line.
- **Bare Node ESM will not resolve an extensionless relative import.** The repo
  standardises on explicit `.ts` extensions with `allowImportingTsExtensions`.
  Verified against a real Metro bundle, not assumed.
- **Configuring a thing is not verifying it happened.** This shape has caused
  four separate errors here. Read the generated artifact.
- **A corpus re-stage deletes the OCR cache.** It lives at `tools/corpus/ocr/`,
  inside the directory that gets `rm -rf`'d when notices are reshot. Restore it
  from git, then `npm run corpus:ocr -- --only <pattern>` for the images that
  actually changed.
- **`tools/corpus/tools/make_corpus.py` is stale.** It still hardcodes notice
  02's pre-fix dates, so re-running it would reintroduce the chronology defect
  and overwrite the corrected ground truth. `corpus-integrity.test.ts` catches
  that, but do not re-run the generator expecting the current corpus back.
- **`degrade.py` is not byte-reproducible across Pillow versions.** Re-running
  it here changed all 56 synthetic variants, and the blur ones changed enough to
  move OCR output by a few lines. Aggregate effect on the metrics: nil (62.5%
  either way, ±3pp per condition). The committed images are the artifact of
  record — the metrics are reproducible from them, which is the property that
  matters.
- **Millisecond arithmetic on dates is wrong twice a year.** `(a - b) / 86400000`
  across a DST boundary gives 90.04, not 90. Both `daysUntil` and the reminder
  ladder work in local calendar components. Caught by a failing test, not by
  review.
- **A committed cache must not contain a timestamp or a duration.** The first
  OCR cache stored recognition time and was therefore never byte-identical
  across runs, which defeats the point of committing it. Timing is measured and
  reported, not stored.
- **`import.meta` is a syntax error under Jest's CommonJS transform.** Anything
  in `tools/` that Jest also imports has to find paths another way — the metrics
  harness walks up from `process.cwd()` looking for the corpus.

---

## 14. Commands

```bash
npm run typecheck    # app config, the extraction island, then tools/
npm run lint
npm test             # both Jest projects
npm run test:node    # extraction + tools, bare Node, fast, no simulator
npx expo start --dev-client --port 8082
npx expo run:ios     # local simulator build
eas build --profile development --platform ios   # device build (needs Apple ID)
eas build --profile android-compile-check --platform android   # phase-boundary check
bash tools/forms/fetch-forms.sh                  # will fail; prints manual URLs

npm run probe        # deterministic extraction on real OCR, both variants
npm run probe:errors # every wrong value from the probe, named
npm run probe:llm    # Qwen2.5-1.5B long-tail test (needs the GGUF in ~/models)
npm run content:check  # ship gate: what a human still has to verify in content/

npm run metrics      # score the corpus, write tools/metrics/out/METRICS.md
npm run metrics -- --extractor src/extraction/index.ts   # once the cascade exists
npm run metrics:check                            # non-zero exit if an assertion fails
npm run corpus:ocr   # rebuild the OCR text layer (macOS only, needs swiftc)

# End-to-end acceptance test in the Simulator (dev screen, deleted before freeze).
# Copies corpus photos into the app sandbox and runs the real spine over them.
npx expo run:ios --device "iPhone 17 Pro" --port 8082
C=$(xcrun simctl get_app_container booted com.devanshsanghavi.carta data)
mkdir -p "$C/Documents/selftest" && cp tools/corpus/photos/sar7-clean-01.jpg "$C/Documents/selftest/"
xcrun simctl openurl booted carta://selftest
cat "$C/Documents/selftest-report.json"
```

---

## 15. Authorship — this is a competition entry with rules

The CAC permits AI assistance but requires it **disclosed** and requires it not
to constitute the entirety of the technical development.

- **`/src/extraction` is the student's work.** The GBNF grammar, extraction
  schema, prompt construction, redaction matcher, region-selection and pre-fill
  heuristics, sanity pass, and confidence model. Propose designs, review, and
  critique — but do not autonomously write it. **When you do touch that
  directory, say so explicitly, in the message and in NOTES.md.**
- **Explain before implementing.** Every non-trivial change gets an explanation
  specific enough to answer "what does this function do?" from memory later.
  Never merge code the student cannot explain line by line.
- **Maintain `NOTES.md`** — dated decision log: what was tried, what broke, what
  was chosen and why. This is where written answer #4 comes from. **Latency and
  quantization measurements are a deliverable, not just an input — record the
  numbers, not only the conclusion.**
- **Maintain `DEPENDENCIES.md`** — every library and what it is for.
- **Flag bad ideas.** Do not silently work around problems in the spec.

**Two distinct disclosures, stated separately in the README** — conflating them
looks evasive:

1. *The product* uses a local LLM at runtime. That is a **feature**.
2. *The source code* was written partly with AI assistance. That is what the
   rule governs.

Model statement: *"Claude Code was used for project scaffolding, UI components,
the storage layer, and test harnesses. The extraction schema, GBNF grammar,
prompt design, redaction logic, and confidence model were designed and
implemented by me."* **Make that statement true.**

---

## 16. Content and accuracy

Never invent a form ID, a deadline rule, a regulation citation, an appeal
window, a program eligibility rule, or an office's hours. If you need one and do
not have a verified source, leave a `// TODO(verify):` marker and surface it —
do not guess. **Legal deadlines here are the difference between a family keeping
food benefits and not.**

The aid-paid-pending window is the highest-stakes number in the app: source it,
cite it, and pair every instance with "confirm with your county — this is not
legal advice."

Every explanation string pairs with a real citation and carries the standing
disclaimer that Carta is not legal advice and never contacts any agency.
