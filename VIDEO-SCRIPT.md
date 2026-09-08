# Carta — demo video script

**Target 2:30.** SPEC §12.1 allows 1–3 minutes. ~340 spoken words, which leaves
room to breathe over the demo instead of racing.

Structure: **problem → insight → what it does in plain words → how it works →
honest close.** Nothing technical is said before 1:15, because a judge who does
not yet know what the app is cannot evaluate how it is built.

---

## 0:00 – 0:18 · The problem

> **Shot:** a printed SAR 7 on a table, deadline circled in pen.

"This is the form my county sends people on food assistance. Miss it, and your
benefits stop — not because you stopped qualifying, but because a piece of paper
went unanswered.

During the 2023 to 2024 Medicaid unwinding, about 25 million people lost
coverage. Among states that reported a reason, KFF found 69 percent were dropped
for paperwork, not because anyone found them ineligible."

---

## 0:18 – 0:32 · The insight

> **Shot:** title card — `ENROLLMENT` struck through, `RETENTION` beneath it.

"Every benefits app I could find helps you sign up. These people were already
signed up. So Carta is built for the other half — keeping what you already have."

---

## 0:32 – 1:15 · What it does, in plain words

> **Shot:** screen recording — Capture → Review → Home → Notice Detail.
> Let the countdown sit on screen for a beat. Do not narrate over it.

"You photograph the letter. The phone reads it: the program, the case number,
and the date buried in the third paragraph.

You check what it read — it is a legal document, and a machine should not act on
its own guess.

Then the app does the part nobody else does. It remembers. Home is a countdown."

> **Shot:** cut to the lock-screen reminder.

"Five weeks later, your phone tells you the form is due Thursday — and what to
put in the envelope."

---

## 1:15 – 2:15 · How it works

> **Shot:** the no-network test running green, then the metrics table.

"Everything I just showed runs on the phone. No account, no server, no upload.
That is a promise, so I test it. One test disables fetch, XMLHttpRequest,
WebSocket and the native bridge, checks the sabotage actually throws, then
replays 79 recorded scans and fails on any attempt to reach the network.

Reading the letter is mostly not the model. A deterministic cascade — regular
expressions and lexicons — gets 96.4 percent precision on the core fields, and
100 percent on every date the app schedules against. That is measured on 23
photographs of printed notices, across five physical conditions: flat, creased,
shadowed, skewed, and upside down. The 1.5-billion-parameter model made those
fields *worse*, so it is not allowed near them."

> **Shot:** the on-device explanation generating.

"It does earn the plain-language rewrite, running entirely on the phone, about a
second to the first word.

And the guardrail there is the third design, not the first. Constrain a date's
shape, and the grammar happily accepts 00/00/0001. Give it no way to say 'not
stated', and the model cannot abstain — on a letter with no deadline, it
confidently printed the notice date instead."

---

## 2:15 – 2:30 · Close

> **Shot:** Home, countdown visible, disclaimer legible.

"It runs in English and Spanish — though the rewrite still answers Spanish
letters in English, and that is unfinished.

Carta never contacts an agency, and it is not legal advice. It just makes sure
the letter does not get lost."

---

# Do not say, and why

| Claim | Status |
|---|---|
| "the iOS entitlements that let a process hold that much in memory" | **False.** Measured 2026-08-28: a Build A binary with `extended-virtual-addressing` *and* `increased-memory-limit` stripped loaded the 1.04 GB model and ran it. The entitlement was never the blocker. NOTES.md, "The entitlement was not needed". **Swap in the line below — it is true and it is a better story.** |
| "1.3 seconds to first token and 37 tokens per second" | Stale, and the real numbers are *better*. Those came from the first probe, whose flat prompt echoed the instruction template back instead of reading the letter. The fixed chat-turn version measured **0.7–1.1 s to first token and 28.8–40.3 tok/s** across four notices, with prefill at **439 tok/s**. |
| "nine physical conditions" | **Five.** Counted from the manifest: flat, creased, shadow, skew, inverted, over 23 real captures. The "nine" in CLAUDE.md §12 double-counts overlapping labels. |
| "the database is encrypted" | Field-level only. The recipient name, dates, programme and photo are plaintext. |
| Anything using the word "device" for Simulator footage | Only the LLM timings and the camera were ever exercised on a physical iPhone. |

# Stronger true lines, if you want more impact

Every one of these is measured and in the repo. Use them to *replace* the cut
claims — they are better material, not consolation.

**The entitlement, told truthfully** (drop in after "about a second to the first
word"; costs ~8 seconds):

> "I assumed a gigabyte model needed a special iOS memory entitlement, and I
> could not get one on a student account. I measured it instead of assuming —
> and it turns out it does not. It runs on a stock build."

That lands better than the original claim did. "I tested my own assumption and
it was wrong" is the thing a judge remembers.

**Held in reserve, if a written answer or Q&A needs more:**

- The whole app works in airplane mode, permanently. The single network call in
  the entire codebase is the optional model download, and it is excluded from
  the privacy test *by name*.
- 591 tests across 25 suites.
- The OCR ceiling is reported beside every accuracy figure, so a miss is
  attributable to the recogniser or to the parser — 97.9 percent on real
  captures.
- Date arithmetic works in local calendar components, not milliseconds, because
  `(a - b) / 86400000` returns 90.04 days across a daylight-saving boundary. A
  test caught that, not a code review.
- The reminder tells you what to send. It used to say "open Carta to see" — a
  notification about a notification — and that was only obvious once it buzzed
  in a pocket rather than in a simulator.

# Do not film

- **Settings → "Remind me at."** The time picker does not render on iOS —
  `RNDateTimePicker` resolves to an unimplemented placeholder. Unresolved as of
  2026-09-01.
- **A Spanish notice going through the rewrite.** It answers in English.
- **The model download.** 1.12 GB, and nothing happens on screen for minutes.

# Verify before publishing

The 25 million / 69 percent figures come from KFF's Medicaid Enrollment and
Unwinding Tracker, not from anything in this repository. Check both against the
tracker's final numbers and be ready to name the source on screen — a judge who
recognises the statistic will also recognise a misquote of it.
