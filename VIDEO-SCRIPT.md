# Carta — demo video script

**Target 2:45.** SPEC §12.1 allows 1–3 minutes. About 430 spoken words: 2:42
at 160 words a minute, 2:52 at 150. Do not add lines; the margin under 3:00 is
thin. Revised 2026-09-25 for the four new features, and built from the version
of the Carta card that placed first in the simulated panel's re-score (see
JOURNAL.md).

The first two sentences are the author's and do not change. After them the
order is: why it matters here, what Carta does, the form check as the one big
visual, what happens after a deadline and before a letter, the helper, how it is
built, and the close. Nothing technical is said before 2:15, because a judge who
does not yet know what the app does cannot weigh how it is built.

---

## 0:00 – 0:14 · The statistic

> **Shot:** black card, the two figures set in type.

"During the 2023 to 2024 Medicaid unwinding, about 25 million people lost
coverage. Among states that reported a reason, KFF found 69 percent were dropped
for paperwork, not because anyone found them ineligible."

## 0:14 – 0:30 · Why it matters here

> **Shot:** `ENROLLMENT` struck through, `RETENTION` beneath it.

"In California, families are six times more likely to leave CalFresh in a month
when paperwork is due, and more than half who leave are likely still eligible.
Every benefits app I found is built for enrollment. Carta is built for
retention."

## 0:30 – 0:55 · What it does

> **Shot:** Capture → Review → Home. Hold on the countdown for a beat. Cut to
> the lock-screen reminder.

"Photograph the letter. Carta reads it on the phone, finds the deadline buried
in the third paragraph, and has you confirm it first, because this is a legal
document. Then it does what a chatbot can't: it remembers. Home
is a countdown, and weeks later the reminder names the form and what goes in the
envelope."

## 0:55 – 1:30 · Before you mail it

> **Shot:** airplane mode on. Photograph the filled-in form: red rings appear on
> question 2 and question 3 with "Look again at 2 things before you mail it".
> Fix the boxes, shoot again: every ring green. Tap "Save a copy of what I'm
> mailing".

"A quarter of people who tried to renew were told their documents were
incomplete. So before the envelope is sealed, Carta checks the form. It lines
the photo up with the blank form and checks every yes-or-no box, the signature
and the date. One question is blank; another has both boxes marked.
It quotes the form's own rule and never says 'complete'. The county decides the
rest. Fix it, shoot again, and it goes green. Then it saves a dated copy of
exactly what you mailed."

## 1:30 – 2:00 · After the deadline, and before the letter

> **Shot:** a stop notice's "If your benefits stop" card, then "Where this comes
> from" with the rule word for word. Cut to Home: "Letters on the way", then the
> "Did it come?" card.

"If benefits do stop, the letter prints the stop date, not the way back. Carta
works it out from sourced rules, like 30 days to turn the form in so CalFresh
can restart, and says to confirm with your county. It also
watches for the letter that never comes. In the state's survey of people dropped
from Medi-Cal, 47 percent said they never got a renewal form. When the month for
the next letter passes with nothing scanned, Carta asks: did it come?"

## 2:00 – 2:15 · The helper

> **Shot:** the helper's phone looping the QR code, the four-digit check code
> beside it. (Two phones face to face only once this has worked on two real
> phones; see "Do not film".)

"A navigator helping a family can confirm the letter with them, then pass it to
the family's phone through the two cameras: encrypted, offline, and the helper's
phone keeps nothing."

## 2:15 – 2:45 · How it's built, and the close

> **Shot:** the no-network test running green, then the metrics table, then
> Home with the disclaimer legible.

"All of it runs on the phone, and a test fails if anything reaches the network.
The reading is mostly deterministic: 96.9 percent precision on the letters it
was built with. On three it had never seen, six of seven answers were right, and
it left the rest blank rather than guess. An on-device language model only
rewrites the letter in plain words; it is never trusted with a date.

Carta works in English and Spanish, never contacts an agency, and is not legal
advice. It exists so that paperwork is never the reason a family loses food or
health care."

---

# Do not say, and why

| Claim | Status |
|---|---|
| "Carta checks your SAR 7" as if any SAR 7 | **Only the demonstration copy has a template.** Film the printed demo form (`tools/forms/demo/sar7-demo-blank.pdf`). The real CalSAWS layout needs its own template, which is data, not code, but it does not exist yet, and the app says "Carta can't check this form yet" to anything else. |
| "Vietnamese", "Chinese", "the state's own translation" | **Not built.** See JOURNAL.md, "What didn't make the cut". |
| "fountain-coded" hand-off | The hand-off loops numbered frames until the other phone has them all. It is not a fountain code. |
| "verified on device" for the form check, the new dates, the letter forecast or the hand-off | **Simulator only.** The hand-off has never crossed between two phones. Only the LLM timings and the camera have run on a physical iPhone. |
| "47 percent of Californians" | 47 percent of **survey respondents** dropped from Medi-Cal (DHCS Month 1 survey, N=1,262, self-reported). The script says "in the state's survey of people dropped from Medi-Cal". |
| "a quarter had incomplete forms, and Carta fixes that" | KFF, national Medicaid: 25% were *told* their documents were incomplete. That usually means missing proofs, which Carta cannot see. It asks about them; it does not check them. |
| "Carta tells you if you can get benefits back" | Never. Every second-chance date says "ask your county to confirm". Carta counts from dates the person confirmed; it does not decide eligibility. |
| "96.4 percent" | The feasibility probe's figure. The shipped cascade is **96.9% precision, 87.9% recall in-sample**, and **6 of 7 correct, 6 of 12 found** on the held-out notices. The held-out row is the one to trust. |
| "the iOS entitlements that let a process hold that much in memory" | **False.** Measured 2026-08-28: the 1.04 GB model loaded and ran with `extended-virtual-addressing` and `increased-memory-limit` stripped. |
| "1.3 seconds to first token and 37 tokens per second" | Stale. The fixed chat-turn version measured **0.7–1.1 s to first token and 28.8–40.3 tok/s** on an iPhone across four notices. |
| "nine physical conditions" | **Five**: flat, creased, shadow, skew, inverted, across 23 real captures. |
| "the database is encrypted" | Field-level only. The recipient name, dates and programme are plaintext; photos and mailed copies are AES-GCM files. |

# Held in reserve

For written answers or Q&A, not the video. All measured, all in the repo.

- 713 tests across 28 suites. The form check reads all seven of its fixture
  photos exactly as drawn and refuses a different form layout.
- The app works in airplane mode permanently. The single network call in the
  codebase is the optional model download, excluded from the privacy test by
  name. The new screens, including the hand-off, are inside that test.
- An SSN bug was found while building the hand-off: Review had been saving
  unredacted text since week 2. Redaction is now a pipeline stage, re-run at
  every write and every hand-off, with a test that fails on the old code.
- Every accuracy figure is reported beside the OCR ceiling, so a miss is
  attributable to the recogniser or to the parser. 97.9 percent on real captures.
- Date arithmetic runs in local calendar components, not milliseconds, because
  `(a - b) / 86400000` returns 90.04 days across a daylight-saving boundary.

# Do not film

- **Settings → "Remind me at."** `RNDateTimePicker` resolves to an unimplemented
  placeholder on iOS. Unresolved as of 2026-09-01.
- **A Spanish notice through the plain-words rewrite.** It answers in English.
- **The model download.** 1.12 GB, minutes of nothing.
- **Two phones doing the hand-off**, until it has actually worked on two phones.
- **A real county SAR 7 in the form check.** It will say it cannot check it.

# Verify before publishing

- 25 million and 69 percent: KFF's Medicaid Enrollment and Unwinding Tracker, not
  this repository. Check both against the tracker's final numbers. A judge who
  recognises the statistic will also recognise a misquote.
- Six times, and more than half likely still eligible: California Policy Lab on
  CalFresh exits. Cite the report by name in the written answers.
- 25 percent told incomplete: KFF Survey of Medicaid Unwinding (Feb 15 to
  Mar 11, 2024; 1,227 adults).
- 47 percent: DHCS Medi-Cal Disenrollment Survey, Month 1.
