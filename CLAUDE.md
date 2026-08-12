# Carta — project conventions

Read `SPEC.md` before doing anything. This file is the short version of the rules that must never be broken.

*Revised 2026-08-11 (v2) for the local-LLM-first re-scope. See NOTES.md.*

## Hard constraints

1. **No network calls on any code path that touches notice data.** OCR, extraction, storage, scheduling — all offline. `no-network.test.ts` enforces this; if you make it fail, you've broken the product, not the test.
2. **No cloud LLM APIs.** No OpenAI, Anthropic, Google AI, or any hosted inference. All inference is local via `llama.rn` with a downloaded GGUF model.
3. **Exactly one network call exists in the app:** the user-initiated, wifi-gated model download in Settings. It touches no notice data and lives outside the pipeline. Everything else works in airplane mode.
4. **No backend, no accounts, no API keys, no paid services.** If a task seems to need a server, bundle static JSON instead.
5. **Never persist an SSN.** Redact before the first write. Case numbers are stored as salted hashes plus last 4 only.
6. **The user confirms every extraction before anything is scheduled.** No silent action on a machine reading of a legal document.
7. **Never write captured images to the camera roll.** App sandbox only.

## Carta is a deadline tracker, not a document explainer

The defensible claim is that Carta **remembers and acts** — the reminder ladder,
the checklist, months of persistence. Comprehension is commoditised; a chat
session will explain a letter but will not wake someone at 9am five weeks later.

Design consequence: **the countdown is the dominant element on Home and at the
top of Notice Detail.** The plain-language explanation is the *trust mechanism*
— it is how a user checks that the app read the letter correctly before
believing the number — not the headline. Do not let the explanation take visual
priority over the deadline anywhere.

## "Worth checking" is a cross-reference, never a determination

SPEC §2.1 shows adjacent programs after a notice is confirmed. Three rules,
non-negotiable, because this feature sits next to the eligibility screening that
§10 forbids:

1. Population-level phrasing only — "people receiving X are often also eligible
   for Y", never "you may qualify".
2. Keyed on **program and county only**. Never household size, income, or age.
   Filtering on an eligibility input turns a cross-reference into a
   determination. If a feature needs to ask the user an eligibility question, it
   has crossed the line.
3. The public-charge myth-buster renders inline with the list, never behind a
   link.

## The model does not invent legal rules

Deadlines, appeal windows, and required documents come from what is printed on the letter plus the bundled content pack. If the model cannot find a value, **the field is empty and the user fills it in. Never fabricate a date.**

The plain-language rewrite has five guardrails (SPEC §4), all of which must be **visible in the UI**, not quiet internal rules: original text one tap away on the same screen; visibly labelled machine-generated; never states an unconfirmed deadline; never tells a user they are ineligible; and a self-check that flags any date in the rewrite that is not in the confirmed fields.

## Manual entry is a first-class path

The model is an opt-in ~1 GB download. Before it is downloaded, if the user declines, on a low-RAM device, or if it stalls, **the app must be fully usable**. The deterministic regex/lexicon pre-fill always runs, model or not, so a user without the model gets a half-filled form rather than a blank one. Never build a screen that assumes the model is present.

## Platform

**iOS / iPhone is the primary target.** Keep Android compiling via an EAS build at each phase boundary, but spend no time on Android-specific polish. All demo footage is filmed on iPhone.

## Working style — this is a competition entry with authorship rules

- **`/src/extraction` is the student's work.** The GBNF grammar, extraction schema, prompt construction, redaction matcher, region-selection and pre-fill heuristics, sanity pass, and confidence model. Propose designs, review, and critique there — but don't autonomously write it. When you do draft something in that directory, say so explicitly, in the message and in NOTES.md.
- **Explain before you implement.** Every non-trivial change gets a plain explanation of what it does and why, specific enough to answer "what does this function do?" from memory later.
- **Maintain `NOTES.md`** — a dated decision log: what was tried, what broke, what was chosen and why. Append at the end of every session. This is where written answer #4 comes from. **Latency and quantization measurements are a deliverable, not just an input to a decision — record the numbers, not only the conclusion.**
- **Maintain `DEPENDENCIES.md`** — every open-source library and what it's for.
- Flag anything you think is a bad idea. Don't silently work around problems in the spec.

## Architecture

Pipeline is SPEC §4: OCR → redact → deterministic pre-fill and region select → optional local LLM with GBNF-constrained JSON → sanity pass → user confirmation.

Deterministic beats probabilistic. If a field can be extracted with a regex or a lexicon, do that — do not reach for the model. The model exists for the cases regex cannot reach, and for the plain-language rewrite.

## Code conventions

- TypeScript strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`. Discriminated unions for `ActionType`, `ExtractionSource`, notice `status`.
- **Extraction logic lives in `/src/extraction` and must be pure and platform-free** — no React, no native modules — so it runs in plain Node against the corpus. Enforced three ways: the directory's own `tsconfig.json` (`lib: ES2022`, `types: []`), an ESLint rule, and `tests/node/extraction-island.test.ts`. These are not redundant: the tsconfig stops the network globals, the lint rule stops the import that would smuggle them back in.
- All user-facing strings go through i18n. No hardcoded English in components, ever. **Write the Spanish as each screen lands**, not at the end.
- Dates are epoch millis computed in the device's local timezone. Test DST boundaries.

## Screens and cut order

Core four must be excellent: **Home, Capture, Review, Notice Detail.** Then Checklist. Cuttable in order if time goes: Where to Go, Vault, then Settings reduced to language + model + delete everything. **Nothing below the line may steal polish from anything above it.**

Polish means every screen has a real empty, loading, and error state. No lorem ipsum, no placeholder copy, no dead buttons. **If a screen isn't finished, cut the screen rather than ship a stub.**

## Testing

Ship gates: `no-network.test.ts` passes; redaction tests pass for SSN in 8 formats; readability gate ≤ grade 6 on bundled English explanation content. Metrics table in the README covers both the deterministic-only path and the model path.

## Content and accuracy

Never invent a form ID, a deadline rule, a regulation citation, an appeal window, or an office's hours. If you need one and don't have a verified source, leave a `// TODO(verify):` marker and surface it — do not guess. Legal deadlines here are the difference between a family keeping food benefits and not.

Every explanation string pairs with a real citation and carries the standing disclaimer that Carta is not legal advice and never contacts any agency.

## Accessibility

≥16pt body text with Dynamic Type, ≥44pt touch targets, full screen-reader labels, no timeouts, one-handed operation, works airplane-mode. This is a scored rubric axis and it is also the entire point of the app — treat a11y regressions as build breaks.
