# Carta — demo video script

**Target 2:30.** SPEC §12.1 allows 1–3 minutes. ~345 spoken words.

Register matches the website copy: declarative, dense, no scene-setting, no
rhetorical questions, no second-person hypotheticals. It opens cold on the
statistic and never asks the viewer to imagine anything.

Order is deliberate: **what it is, then how it works.** Nothing technical is said
before 1:10, because a judge who does not yet know what the app does cannot
evaluate how it is built.

---

## 0:00 – 0:16 · The statistic, cold

> **Shot:** black card, the two figures set in type. No voice-over flourish.

"During the 2023 to 2024 Medicaid unwinding, about 25 million people lost
coverage. Among states that reported a reason, KFF found 69 percent were dropped
for paperwork, not because anyone found them ineligible."

---

## 0:16 – 0:32 · The insight

> **Shot:** `ENROLLMENT` struck through, `RETENTION` beneath it.

"They were already enrolled. Every benefits app I could find is built for
enrollment, so Carta is built for the other half. Retention. Keeping what you
have already been approved for."

---

## 0:32 – 1:10 · What it does

> **Shot:** screen recording, Capture → Review → Home. Hold on the countdown for
> a beat without narrating over it.

"A recipient photographs the renewal letter. A CalFresh SAR 7, a Medi-Cal
redetermination. The app reads it on the phone, pulls out the program, the case
number, and the deadline buried in the third paragraph, then asks the recipient
to confirm what it read before it acts on it, because this is a legal document.

Then it does the part nothing else does. It remembers. Home is a countdown."

> **Shot:** cut to the lock-screen reminder.

"Five weeks later the reminder names the form and what to put in the envelope."

---

## 1:10 – 2:10 · How it works

> **Shot:** the no-network test running green, then the metrics table.

"Nothing on that path touches the network. A test enforces it. It disables
fetch, XMLHttpRequest, WebSocket and the native bridge, verifies the sabotage
actually throws, then replays 79 recorded scans and fails on any attempt to
reach out.

Most of the reading is not the model. A deterministic cascade of regular
expressions and lexicons reaches 96.4 percent precision on the core fields, and
100 percent on every date the app schedules against, measured across 23
photographs shot flat, creased, shadowed, skewed and upside down. The
1.5-billion-parameter model made those same fields worse, so it is excluded from
them."

> **Shot:** the on-device explanation generating.

"It earns the plain-language rewrite instead. On the phone, about a second to
the first word.

That rewrite is the third design. Constraining the shape of a date accepted
00/00/0001. A grammar with no production meaning 'not stated' left the sampler
no legal way to abstain, so on a notice with no deadline the model confidently
emitted the notice date."

---

## 2:10 – 2:30 · Close

> **Shot:** Home, countdown visible, disclaimer legible.

"I assumed a gigabyte model needed an iOS memory entitlement I could not get on
a student account. I measured it rather than assuming. It does not. It runs on a
stock build.

Carta runs in English and Spanish, though the rewrite still answers Spanish
letters in English and is unfinished. It never contacts an agency, and it is not
legal advice."

---

# Do not say, and why

| Claim | Status |
|---|---|
| "the iOS entitlements that let a process hold that much in memory" | **False.** Measured 2026-08-28: a Build A binary with `extended-virtual-addressing` *and* `increased-memory-limit` stripped loaded the 1.04 GB model and ran it. The closing line above is the true version, and it is stronger. |
| "1.3 seconds to first token and 37 tokens per second" | Stale, and the real numbers are *better*. Those came from the first probe, whose flat prompt echoed the instruction template back instead of reading the letter. The fixed chat-turn version measured **0.7–1.1 s to first token and 28.8–40.3 tok/s** across four notices, prefill at **439 tok/s**. |
| "nine physical conditions" | **Five.** Counted off the manifest: flat, creased, shadow, skew, inverted, across 23 real captures. The "nine" in CLAUDE.md §12 double-counts overlapping labels. |
| "the database is encrypted" | Field-level only. The recipient name, dates, programme and photo are plaintext. |
| "device" over Simulator footage | Only the LLM timings and the camera were ever exercised on a physical iPhone. |

# Held in reserve

For written answers or Q&A, not the video. All measured, all in the repo.

- The app works in airplane mode permanently. The single network call in the
  codebase is the optional model download, excluded from the privacy test by
  name.
- 591 tests across 25 suites.
- Every accuracy figure is reported beside the OCR ceiling, so a miss is
  attributable to the recogniser or to the parser. 97.9 percent on real captures.
- Date arithmetic runs in local calendar components, not milliseconds, because
  `(a - b) / 86400000` returns 90.04 days across a daylight-saving boundary. A
  test caught it, not a review.
- The reminder names the documents. It used to say "open Carta to see" — a
  notification about a notification — and that was only obvious once it buzzed in
  a pocket rather than in a simulator.

# Do not film

- **Settings → "Remind me at."** `RNDateTimePicker` resolves to an unimplemented
  placeholder on iOS. Unresolved as of 2026-09-01.
- **A Spanish notice through the rewrite.** It answers in English.
- **The model download.** 1.12 GB, minutes of nothing.

# Verify before publishing

The 25 million and 69 percent figures are KFF's Medicaid Enrollment and
Unwinding Tracker, not this repository's. Check both against the tracker's final
numbers. A judge who recognises the statistic will also recognise a misquote.
