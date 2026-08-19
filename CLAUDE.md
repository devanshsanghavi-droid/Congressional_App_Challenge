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
| OCR | `expo-mlkit-ocr` **off the shelf**, both platforms |
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
- **Metrics table** — per-field precision/recall on the corpus, for *both* the
  deterministic-only path and the model path. Goes in the README.
- **Corpus** — ~20 printed-and-photographed pages, filled with fictional data.
  **Never use a real person's notice.**

---

## 12. Where we are right now

Week 2 of nine. Eight commits. `main` pushed to
`git@github.com:devanshsanghavi-droid/Congressional_App_Challenge.git`.

**Done:** repo + docs; Expo SDK 57 scaffold building and running on the iOS
simulator; extraction island enforced and probe-verified; i18n en/es wired;
storage/OCR/LLM dependencies installed and linking; week 1 benchmark harness
built, committed, and verified to compile and bundle.

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
- **Configuring a thing is not verifying it happened.** This shape has caused
  three separate errors here. Read the generated artifact.

---

## 14. Commands

```bash
npm run typecheck    # app config, then the extraction island's stricter config
npm run lint
npm test             # both Jest projects
npm run test:node    # extraction + tools, bare Node, fast, no simulator
npx expo start --dev-client --port 8082
npx expo run:ios     # local simulator build
eas build --profile development --platform ios   # device build (needs Apple ID)
eas build --profile android-compile-check --platform android   # phase-boundary check
bash tools/forms/fetch-forms.sh                  # will fail; prints manual URLs
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
