# Carta — project conventions

Read `SPEC.md` before doing anything. This file is the short version of the rules that must never be broken.

## Hard constraints

1. **No network calls on any code path that touches notice data.** OCR, parsing, storage, scheduling — all offline. `no-network.test.ts` enforces this; if you make it fail, you've broken the product, not the test.
2. **No cloud LLM APIs.** No OpenAI, Anthropic, Google AI, or any hosted inference. Local-only via `llama.rn` with a downloaded GGUF model, and only as an opt-in fallback layer.
3. **No backend, no accounts, no API keys, no paid services.** If a task seems to need a server, the answer is to bundle static JSON instead.
4. **Never persist an SSN.** Redact before the first write. Case numbers are stored as salted hashes plus last 4 only.
5. **The user confirms every extraction before anything is scheduled.** No silent action on a machine reading of a legal document.
6. **Never write captured images to the camera roll.** App sandbox only.

## Platform

**iOS / iPhone is the primary target.** React Native keeps Android building for free — keep it compiling and smoke-test it on the emulator, but spend no time on Android-specific polish. All demo footage is filmed on iPhone. Prefer Apple Vision for OCR on iOS.

## Working style — this is a competition entry with authorship rules

The Congressional App Challenge permits AI assistance but requires that it be disclosed and that it not constitute the entirety of the technical development. That shapes how we work:

- **`/src/extraction` is the student's work.** Propose designs, review, and critique there — but don't autonomously write large swaths of the parsing cascade, templates, or heuristics. When you do draft something in that directory, say so explicitly and explain it thoroughly enough that it can be rewritten from understanding.
- **Explain before you implement.** Every non-trivial change gets a plain explanation of what it does and why, in terms specific enough to answer "what does this function do?" from memory later.
- **Maintain `NOTES.md`** — a running decision log: what was tried, what broke, what was chosen and why, with dates. Append to it at the end of every session. This becomes the answer to the submission's hardest question ("what technical difficulty did you face and how did you address it").
- **Maintain `DEPENDENCIES.md`** — every open-source library used and what it's for. The rules require documenting external tools.
- Flag anything you think is a bad idea. Don't silently work around problems in the spec.

## Architecture

Parsing is a four-layer cascade — see SPEC.md §4. Layers are independently testable and each returns a confidence score. Build **Layer 0 (form fingerprint) first**, starting with the **SAR 7** template. Layer 3 (local LLM) is optional and gets cut if week 8 arrives and it isn't working.

Deterministic beats probabilistic. If a field can be extracted with a regex or a bounding-box anchor, do that — do not reach for the model.

## Code conventions

- TypeScript strict. No `any`. Discriminated unions for `ActionType`, `ExtractionLayer`, notice `status`.
- Extraction logic lives in `/src/extraction` and must be **pure and platform-free** — no React, no native modules — so it can be unit-tested against the golden corpus in plain Node.
- Notice templates are data (`/content/templates/*.ts`), not code branches. Adding a new form means adding a file, never editing the parser.
- All user-facing strings go through i18n. No hardcoded English in components, ever.
- Dates are stored as epoch millis, computed in the device's local timezone. Test DST boundaries.

## Testing

Every new template ships with golden-corpus fixtures and an entry in the extraction metrics table. Ship-gate is ≥90% field accuracy on Layer 0 templates. The readability gate (≤ grade 6 Flesch–Kincaid on English explanation content) runs in CI.

## Content and accuracy

Never invent a form ID, a deadline rule, a regulation citation, or an appeal window. If you need one and don't have a verified source, leave a `// TODO(verify):` marker and surface it — do not guess. Legal deadlines in this app are the difference between a family keeping food benefits and not.

Every explanation string pairs with a real citation (eCFR or CDSS MPP) and carries the standing disclaimer that Carta is not legal advice and never contacts any agency.

## Accessibility

≥16pt body text with Dynamic Type, ≥44pt touch targets, full screen-reader labels, no timeouts, one-handed operation, works airplane-mode. This is a scored rubric axis and it is also the entire point of the app — treat a11y regressions as build breaks.
