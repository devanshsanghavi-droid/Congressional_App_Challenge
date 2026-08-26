# Carta

**An iPhone app that photographs a government benefit letter, reads it entirely
on the phone, and makes sure you do not miss the deadline.**

Congressional App Challenge 2026 · CA-16 · Devansh Sanghavi

---

## The problem

Most people who lose CalFresh, Medi-Cal, or a housing voucher **do not become
ineligible**. They are terminated for *procedural* reasons — a missed semi-annual
report, an unreturned verification request, a recertification packet that arrived
during a double shift. Researchers call this **churn**, and it is enormous.

The government's own paperwork causes it. A Notice of Action is dense,
jargon-heavy, often English-only, and the deadline is buried in the third
paragraph.

> Every other entry will build for **enrollment** — helping people find and apply
> for benefits. **Carta is built for retention** — helping people keep what they
> have already been approved for.

## Why an app, and not ChatGPT

The honest question this project has to answer is *"why not paste the letter into
a chatbot?"*

A chatbot will explain a letter. It will not know, five weeks later, at 9am, that
your SAR 7 is due Thursday and you still have not attached a pay stub.
**Comprehension is commoditised. Persistence is not.**

So the countdown is the largest thing on the screen, and the plain-language
explanation exists to earn trust in it — "12 days" is worth nothing unless you
believe the app read your letter correctly.

---

## Architecture

Everything below happens on the phone. There is no server, no account, and no API
key anywhere in this repository.

```
                photograph
                     │
      expo-image-manipulator      resize + EXIF rotate ONLY
                     │
          expo-mlkit-ocr          on-device text + bounding boxes
                     │                (Apple Vision on iOS — see note)
                  REDACT          SSN stripped before ANY write
                     │
        DETERMINISTIC PASS        always runs, model or not
             │       │            • pre-fill: dates, programs, agencies, form IDs
             │       │            • region select: what is worth sending onward
             │       └──────────────────────┐
             │                              │
             │                        LOCAL LLM (optional)
             │                        llama.rn + Qwen2.5-1.5B
             │                        GBNF-constrained JSON
             │                              │
             └──────────┬───────────────────┘
                        │
                   SANITY PASS         always runs
                        │
                 USER CONFIRMS         never skippable
                        │
        ┌───────────────┴───────────────┐
   schedule reminders            build checklist
   (local notifications)
```

Three rules this shape encodes:

- **Deterministic beats probabilistic.** If a regex or a lexicon can extract a
  field, it does. Measured on real photographed OCR, the deterministic pass gets
  **100% precision on every date the app schedules on**, and the 1.5B model
  *corrupts* those fields when allowed near them. So it is not allowed near them.
  It earns its place on unseen layouts and on the plain-language rewrite.
- **The model is optional.** It is a ~1 GB download. Before it exists, if the user
  declines it, or on a low-RAM phone, the app is fully usable — the deterministic
  pass still fills the form in.
- **The user confirms everything.** Nothing is scheduled from a machine reading of
  a legal document without a person looking at it first.

> **On the OCR engine.** `expo-mlkit-ocr` does **not** use ML Kit on iOS. At its
> default configuration it installs no ML Kit pod and compiles Apple Vision
> instead — verified in `Podfile.lock`, the podspec, and the module source, not
> from the package README. Since iOS is the primary target, **the shipping
> recogniser is Apple Vision.** Android genuinely is ML Kit, and the numbers below
> do not describe it.

---

## Privacy

Carta makes **exactly one network call**: the user-initiated, wifi-gated model
download in Settings. It touches no notice data. Everything else works in
airplane mode, forever.

This is enforced, not asserted. **`tests/app/no-network.test.ts`** has two halves:
a runtime half that poisons `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`
*and the native bridge modules* and then runs the notice-data path over all 79
corpus OCR records; and a static half that reads every module on that path off
disk and fails on any networking API or hard-coded URL. It was verified by
injecting a real `fetch` into the pipeline and watching both halves fail.

### What is actually stored

The encryption is **field-level, not whole-database**. Saying "the database is
encrypted" would be false, so this project does not say it. The precise claim,
which is also what the app itself shows in Settings:

> The text of the letter is encrypted with AES-256-GCM under a key that never
> leaves the device; the case number is never stored, only a salted hash and the
> last four digits; the deadline dates, the programme, and the recipient's name
> are stored in plaintext so the app can sort, display and correct them, and the
> photograph is a plain file inside the app sandbox.

That is a weaker claim than "everything is encrypted" and it is the true one. It
is still meaningfully stronger than the alternatives, because **none of it leaves
the phone** — which is the property that actually protects someone.

Also: an SSN is redacted before the first write, in eight formats, with tests.
Captured images are never written to the camera roll. "Delete everything" in
Settings erases the database, the image files, the cached previews, the keychain
entries, and every notification still queued with iOS.

---

## Accuracy

Carta is evaluated against a committed corpus of **10 fictional notices, 23 real
captures** printed and photographed across nine physical conditions, and 56
synthetic degradations. No real person's notice was ever used.

The cascade was developed against notices **01–07**, with **08–10 held out** —
their text, their ground truth and their failures were not looked at while it was
written. Both numbers are reported, because a single blended figure hides exactly
what a holdout exists to reveal.

**Core fields**, real photographed captures only (`recipient_name`, `program`,
`action_type`, `case_number` and the five dates):

| | notices | captures | OCR ceiling | precision | recall |
|---|---|---|---|---|---|
| **In-sample** (01–07) | 7 | 21 | 97.7% | **96.9%** | **87.9%** |
| **Held out** (08–10) | 3 | 2 | 100% | 6 of 7 | 6 of 12 |

**Read the held-out row as counts, not rates.** Two images is below the harness's
own `MIN_IMAGES_FOR_RATE`, which refuses to print a percentage for any condition
that thin — printing one here would be applying a standard to this table that the
rest of the report rejects.

### What the gap means, stated plainly

The in-sample figure is **not independent**. The cascade was written by someone
who had read `tools/metrics/probe/`, a working extractor fitted to all ten
notices. **The held-out figure is the one to trust**, and the distance between the
two is the honest measure of how much was fitted rather than generalised.

Some of that gap is deliberate. The probe's form identifiers for the held-out
notices — `SSA-8202`, `HCV-AR-101` — were **left out** of the cascade's tables on
purpose, so `form_id`, `program` and `agency` score zero on those notices. Copying
them across would have raised the number while measuring nothing except whether
they had been copied.

Full per-field tables, per condition and beside the OCR ceiling, are in
`tools/metrics/out/METRICS.md`. Real captures and synthetic degradations are never
merged into one figure.

### The corpus cannot measure everything

All ten ground-truth recipient names are unaccented and upper-case, so a
`recipient_name` figure measured on the corpus alone overstates accuracy for a
county that is heavily Latino and Vietnamese. A separate **extension set** of
three authored notices — `JOSÉ RAMÍREZ`, `Nguyễn Thị Lan`,
`Ana María Delgado-Cruz` — covers that gap and scores **100% precision, 100%
recall**.

That number measures the **parser and nothing else**: the pages are hand-authored,
so their OCR ceiling is 100% by construction and the figure is not comparable to a
photographed one. It is reported beside the corpus number, never merged into it,
and the corpus itself was left frozen so every measurement taken before it remains
comparable. See `tools/corpus-extension/README.md`.

Two findings from building the corpus that hold regardless of the numbers:

- **Blur is uncapturable on an iPhone.** Deep Fusion sharpens document text after
  capture, so blur and noise had to be synthesised while skew, crease, shadow and
  low light stayed real.
- **The physical conditions largely saturate at the OCR stage.** All five captures
  of the same SAR 7 put every printed field into the text. "94% on flat, 71% on
  creased" is *not available* from this corpus, and the report says so rather than
  dressing a flat table up as a gradient.

### Known limitation

On a skewed capture the two columns of a form drift apart vertically, and a label
can pair with the value from an adjacent row — on `mc210-dimangle-13` the label
`Coverage Ends Without Action` pairs with the notice date rather than the coverage
end date. The row tolerance in `geometry.ts` is deliberately **not** tuned to fix
that one image, because tuning a constant against a development notice makes the
in-sample figure mean less without making the app better.

## Accessibility

Not a checkbox here — it is most of the point. One-handed operation; ≥16pt body
text; every interactive target ≥44pt; full screen-reader labels; no timeouts;
every screen usable in airplane mode; and all copy written at or below a
6th-grade reading level in **both English and Spanish**.

Dynamic Type scales without limit everywhere except the countdown number, which
is capped — at the largest accessibility size an uncapped 72pt number grew to
~220pt and pushed the notice's own name off the card, which is Dynamic Type
harming the person it exists to help. The rule is *cap display type, never cap
prose*, and a test enforces that nothing else joins it.

Spanish is not a translation layer bolted on at the end. Where CDSS publishes an
official Spanish translation of the same form, Carta uses the state's wording
rather than its own — provenance for every string is tracked in
`src/lib/i18n/SOURCES.md`, including which strings are still Carta's own and what
would be needed to source them.

---

## Content and legal accuracy

Deadlines, appeal windows and required documents come from what is printed on the
letter plus a bundled, sourced content pack. **The model never invents a legal
rule.** If a value cannot be found, the field is empty and the user fills it in.

Every claim in `content/*.json` carries a `source_url`, a `verified_on` date and a
`confidence` level, and **`npm run content:check` is a ship gate** that names
everything a human still has to verify. A claim without a citation gets deleted,
not shipped: an unsourced freshness rule for bank statements was removed for
exactly this reason.

The highest-stakes numbers in the app are the two appeal clocks, and they are
deliberately never conflated — **10 days** to request a hearing and keep benefits
at the current amount while it is pending, **90 days** to request a hearing at
all. Sourced to Legal Services of Northern California's CalFresh guide, marked as
a legal aid guide rather than regulation, and paired everywhere with *"confirm
with your county — this is not legal advice."*

Carta is not legal advice and never contacts any agency.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57, React Native 0.86.2, React 19.2.3 (dev client) |
| Language | TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Navigation | `expo-router` |
| OCR | `expo-mlkit-ocr` → Apple Vision on iOS, ML Kit on Android |
| Local LLM | `llama.rn` 0.12.9 |
| Model | Qwen2.5-1.5B-Instruct GGUF Q4_K_M (~1.1 GB), **Apache 2.0** |
| Database | `expo-sqlite` + field-level AES-256-GCM, key in `expo-secure-store` |
| Reminders | `expo-notifications`, locally scheduled only |
| i18n | `i18next`, English + Spanish, bundled |
| Testing | Jest — bare Node and `jest-expo/ios` |

Every library is MIT, Apache 2.0, or BSD. There are **no paid services, no API
keys, no backend, and no hosted inference**. The complete inventory, with a
licence and a justification for each package, is in
**[`DEPENDENCIES.md`](DEPENDENCIES.md)**.

---

## Running it

```bash
npm install
npx expo run:ios                 # local simulator build
npx expo start --dev-client --port 8082
```

The local LLM requires a physical device — the Simulator runs on the Mac's CPU
and says nothing about Metal.

```bash
npm run typecheck
npm run lint
npm test                         # both Jest projects
npm run content:check            # ship gate for sourced content
npm run metrics                  # score the corpus
```

---

## AI usage disclosure

The Congressional App Challenge permits AI assistance and requires it to be
disclosed. **There are two separate things to disclose here, and conflating them
would be misleading, so they are stated separately.**

### 1. The product uses a language model at runtime — this is a feature

Carta runs Qwen2.5-1.5B locally, via `llama.rn`, to rewrite letters in plain
language. It is an optional download, it runs entirely on the phone, and no text
from a user's letter is ever transmitted anywhere. This is a product capability,
not authorship.

### 2. The source code was written with AI assistance — this is what the rule governs

> **Claude Code was used throughout this project**, including the extraction
> cascade in `/src/extraction` — the date parser, the geometry pairing, the
> identity tables, the redaction matcher, the document lexicon and the name
> resolution. It was also used for project scaffolding, UI components, the
> storage layer, the content packs, the evaluation corpus and the test harnesses.
> Design decisions, priorities, scope, the held-out evaluation method and every
> product judgement were the author's; the implementation is substantially
> AI-written and is disclosed as such.

An earlier version of this file reserved `/src/extraction` as hand-written work.
That was true when it was written and stopped being true on 2026-08-26, when the
constraint was lifted and the cascade was written with AI assistance like the
rest. The statement was replaced in the same commit as the code, rather than left
to be corrected later.

`/src/extraction` remains structurally isolated — a pure-TypeScript island that
imports nothing platform-specific, enforced three independent ways (a `tsconfig`
with no DOM types, an ESLint rule, and a test that reads the bytes on disk). That
isolation is an engineering property, not an authorship claim: it is what lets the
same code run on the phone and in bare Node against the corpus.

`NOTES.md` is a dated decision log kept throughout — what was tried, what broke,
what was chosen and why, with the measurements rather than only the conclusions.

---

## Repository map

| Path | What it is |
|---|---|
| `src/app/` | Screens (expo-router file-based routes) |
| `src/lib/` | App-side, platform-aware code |
| `src/extraction/` | The extraction cascade. Pure TS island — runs unchanged on device and in bare Node |
| `content/` | Bundled, sourced JSON: programmes, offices, document types, cross-references |
| `tools/corpus/` | The evaluation corpus and its ground truth |
| `tools/metrics/` | The scoring harness |
| `tests/` | Two Jest projects: bare Node, and `jest-expo/ios` |
| `SPEC.md` | Full specification |
| `NOTES.md` | Dated decision log |
| `DEPENDENCIES.md` | Every dependency, with licence and rationale |
