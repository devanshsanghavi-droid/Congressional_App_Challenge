# Carta: the journal

*Last updated 2026-09-25.* One place for the key points: what Carta is, who it
helps, what it does now, how it is built, what has been measured, what has not,
how it did in front of the simulated judges, and the video script that did best.
The dated decision log with every number is `NOTES.md`; the rules for working in
the repo are `CLAUDE.md`.

---

## 1. Carta in one paragraph

Carta is an iPhone app, built solo by Devansh Sanghavi for the 2026
Congressional App Challenge (CA-16, Rep. Sam Liccardo). You photograph a letter
about your CalFresh, Medi-Cal or housing benefits. Carta reads it on the phone,
has you confirm what it read, and then makes sure you do not miss the date: a
countdown on Home, and reminders that name the form and what to put in the
envelope. It works in airplane mode, has no account and no server, and never
sends the letter anywhere.

**The idea that sets it apart:** almost every benefits app is built for
*enrollment*, helping people apply. Carta is built for *retention*, helping
people keep what they have already been approved for. Most people who lose
these benefits are not found ineligible. They lose them over paperwork.

**Why not just paste the letter into ChatGPT?** A chatbot will explain a letter
today. It will not know, five weeks later at 9 am, that your SAR 7 is due
Thursday and you have not attached a pay stub. Understanding a letter is easy to
get anywhere. Remembering it and acting on it is not. That is why the countdown,
not the explanation, is the biggest thing on screen.

## 2. The problem, with sources

| Figure | Source | Careful wording |
|---|---|---|
| About 25 million people lost Medicaid in the 2023 to 2024 unwinding; 69% of those with a reported reason were dropped for paperwork | KFF Medicaid Enrollment and Unwinding Tracker | **Check both against the tracker before publishing.** They are KFF's, not this repo's. |
| About 2 million people were disenrolled in the Medi-Cal unwinding; 66% for procedural reasons | CHCF | California-specific. |
| Households are 6 times more likely to leave CalFresh in a month when paperwork is due; more than half who leave are likely still eligible | California Policy Lab | CalFresh, not Medi-Cal. |
| 47% of respondents said they never got a renewal form; 39% wanted to restart but did not know how | DHCS Medi-Cal Disenrollment Survey, Month 1 (N=1,262, self-reported) | "47% of **survey respondents** dropped from Medi-Cal", never "47% of Californians". |
| 25% of people who tried to renew were told their documents were incomplete; 24% were told their forms were not received | KFF Survey of Medicaid Unwinding (Feb 15 to Mar 11, 2024; 1,227 adults) | National Medicaid. "Incomplete" usually means missing proofs. |
| 19% of people who tried to renew got help from a case worker or navigator, the most common source of help | KFF, same survey | National. |

**The person Carta is built for:** Maria, 34, San Jose. Two kids, two part-time
jobs, CalFresh and Medi-Cal, Spanish first. One phone, limited data, no printer.
She has lost CalFresh twice over paperwork while still eligible, and both times
it took two months to get back on.

## 3. What Carta does now

In the order a family meets it. New features are marked **new**; the app itself
uses the plain names in quotes, with no brand names.

1. **Photograph a letter.** Apple's on-device text recognition reads it. An SSN is
   stripped out before anything else sees the text.
2. **"Check what Carta read."** Every field is shown for the person to confirm or
   fix. The two fields that fail quietly (the name and the case number) are
   flagged every time. Nothing is scheduled until the person saves.
3. **Home is a countdown.** The nearest deadline dominates the screen. Reminders
   arrive on a ladder before it, at the hour the person picks, and each one
   names the form and the documents to send.
4. **"What to bring."** A checklist built from what the letter asked for, with
   photos of each paper kept encrypted in **"Your papers"** for next time.
5. **"In plain words."** An optional 1 GB language model on the phone rewrites the
   letter simply. It is never asked for a date, and the original is always one
   tap away.
6. **New: "Before you mail it."** On a SAR 7, photograph the form after you fill
   it in. Carta lines the photo up with the blank form and checks the three
   things the form itself says it needs: every YES/NO question has one box
   marked, it is signed, and it is dated after the report month ends. It circles
   each spot on the photo, green or red, quotes the form's own rule, and asks
   about the proof it cannot see. It never says "complete"; the county decides.
7. **New: "Save a copy of what I'm mailing."** A dated, encrypted photo of exactly
   what went in the envelope, linked from the letter and kept in Your papers. If
   the county says it never arrived, sending it again takes a minute.
8. **New: "If your benefits stop."** A stop notice prints the stop date but not the
   way back. Carta works out the dates from sourced rules: 30 days to turn the
   missing form in so CalFresh can restart, the good-cause month, the Medi-Cal
   90-day cure, the outer limit for asking for a hearing. Each shows the rule
   word for word, where it comes from and when it was checked, with "ask your
   county to confirm". A reminder is set only if the person taps for one.
9. **New: "Letters on the way."** A confirmed SAR 7 means a renewal notice about
   five months later. Until then it is one quiet line under the countdowns. If
   that month passes with nothing scanned, Carta asks "Did it come?": scan it, not
   yet, it never came, or "I get my letters online". "It never came" shows the
   county's phone numbers.
10. **New: "Get a letter from a helper's phone."** A navigator or family member
    can photograph and confirm a letter with the family, then tap "Send to another
    phone instead". The letter moves to the family's phone through the two
    cameras: encrypted, offline, with a four-digit code both screens show. The
    family checks every field again on their own phone, and the helper's phone
    keeps nothing.
11. **"Remove this letter"** at the bottom of each letter, behind a confirmation.
    Before, a letter scanned by mistake could only go with "Delete everything".
12. **"Where to go"**, **"Worth checking"** (programmes people on the same benefit
    often also get, phrased for a population and never "you qualify"),
    **Settings** (language, reminder hour, model download, "Delete everything"),
    and a short onboarding.

## 4. What it means for the people involved

**For a family like Maria's**
- The deadline cannot hide in paragraph three, and the reminder says what to send.
- The most common self-inflicted mistakes on a SAR 7 (a blank box, both boxes, no
  signature, a date too early) get caught at the kitchen table, not weeks later
  by the county.
- There is proof of what was mailed and when.
- If benefits stop anyway, the way back comes with dates, and a reminder if they
  want one.
- A letter that never arrived gets noticed, instead of discovered when the
  benefits stop.
- English and Spanish. Works with no data plan. Nothing is uploaded, so there is
  nothing to leak.

**For navigators, clinic staff and grown children who help**
- They can read and confirm a letter with the family and hand it over to the
  family's phone, without keeping a copy of anyone's case on their own.

**For the county** (a possibility, not a measured result)
- Fewer incomplete reports and fewer people reapplying after a paperwork stop is
  less rework for eligibility workers. Carta has not measured this, and says so.

## 5. How it is built

- **React Native and Expo, TypeScript strict**, iPhone first; Android kept
  compiling.
- **Deterministic first.** The fields come from a cascade of patterns, word lists
  and page geometry, not the model. On real photographed letters: 96.9%
  precision and 87.9% recall on the notices it was built with; on three it had
  never seen, 6 of the 7 values it filled in were right, and it left the other
  fields blank rather than guess. 100% precision on every date it schedules on.
  The 1.5B model made those fields worse, so it is kept away from them.
- **The form check** is a homography (the transform that maps the blank form onto
  a tilted photo) fitted by DLT and RANSAC from matching printed lines. Then it
  measures the ink inside each box and along the signature line against the
  paper around it. Each box is snapped to its own printed border first; that one
  step took empty boxes from reading 0.14 ink to 0.000. It reads all seven of its
  test photos exactly as drawn in about 10 ms, and refuses a different form
  layout instead of guessing.
- **Rules as data.** Every second-chance date and every forecast comes from
  `content/timelines.json`, where each rule is quoted from its source with the
  date it was checked. A ship gate (`npm run content:check`) lists every rule
  still waiting for a human to confirm it.
- **The hand-off** uses X25519 key agreement, HKDF-SHA256 and AES-256-GCM over a
  loop of numbered QR frames, with a check code from the shared secret. Any
  change to a single character is refused rather than half-read.
- **Privacy is enforced by a test**, not a promise. `no-network.test.ts` switches
  off every network API, checks that doing so actually works, replays 79
  recorded scans, and reads every file on the notice path for a network call.
  The only network call in the app is the optional model download.
- **Dates are counted in calendar days**, never milliseconds, because across a
  daylight-saving change `(a - b) / 86400000` is 90.04 days, not 90.
- **713 tests across 28 suites**, typecheck and lint clean, in CI on Ubuntu.

## 6. Rules that never bend

- No network call on anything that touches a letter. No cloud AI of any kind.
- No account, no server, no API key.
- **Never keep an SSN.** Redacted before anything is saved or sent.
- The person confirms every field before anything is scheduled, including letters
  that arrive from a helper's phone.
- Photos never go to the camera roll.
- Never invent a date, a rule, a form number or an office's hours. If it cannot
  be sourced, it is left out and flagged.
- Never tell anyone they are eligible or ineligible.

## 7. Honest limits

- **The form check only knows the demonstration SAR 7** made for this project.
  The real county layout needs its own template. That is a data file, not code,
  but it does not exist yet, and the app says "Carta can't check this form yet".
- **Its accuracy is measured on synthetic photos only**: seven of them, of a
  fictional form. Real handwriting on a real phone has not been measured.
- **The hand-off has never crossed between two real phones.** The protocol is
  tested end to end in Node, and the codes it draws decode, but that is not the
  same thing.
- **Nothing new has run on a physical iPhone.** Everything added on 2026-09-24/25
  was checked in the Simulator. Only the camera and the language model have run
  on a real phone.
- **The plain-words rewrite answers Spanish letters in English.**
- **The reminder-time picker shows "Unimplemented" on iOS.**
- **The Spanish in the new rules is Carta's own**, not an official translation.
  The state's site blocks automated requests.
- **Rules go stale with no update channel.** The CalFresh restore waiver ends
  June 30, 2027 (the app stops offering it after that date), and the federal
  H.R. 1 changes to Medicaid renewals are coming.
- **Found and fixed on 2026-09-24: SSNs were being saved.** Review had been storing
  the unredacted scan text since week 2, inside the encryption but present. It is
  fixed three ways, with a test that fails on the old code.
- **Other open items:** the corpus's notice 05 may be mislabelled; the OCR module
  never sets recognition languages; the 25 million figure is unverified.

## 8. Where Carta stands among similar tools

- **ChatGPT and other chatbots** explain a letter. They do not remember it.
- **BenefitsCal**, the state's portal, has e-notices, text reminders and uploads.
  Carta is a companion to it for the paper letter in the kitchen: offline, for
  people who do not use the portal, and pointing them back to the county.
- **Renova** (github.com/StephenSook/renova, Aug 2026) reads
  renewal paperwork offline for five states including California. It does not
  track deadlines or send reminders, which is Carta's whole point. It is the
  closest prior art, and Carta should say so rather than be caught by it.
- **GetCalFresh** has step-by-step SAR 7 guides for filing online.

## 9. The simulated judge panels

These are **simulated** judges, AI models asked to score like a CAC panel. They
are not real judges. Each scored 13 app ideas on the CAC rubric (core out of 50,
plus topic fit for 60) and ran head-to-head duels.

| Round | Core /50 | Total /60 | Rank |
|---|---|---|---|
| Primed panel, original Carta card | 39.5 | 49.5 | 1st of 13 |
| **Blind** panel, same card | 28.1 | 38.1 | 13th on core, 11th on total |
| Re-score with the five-feature card | **40.3** | **50.3** | **1st of 13** (next: RampCheck, 43.0) |

The blind round was the wake-up call. Without priming, Carta's coding (6.2) and
originality (3.2) scored near the bottom: judges could not see the engineering,
and a reminder app sounds ordinary. The re-score, with the features, moved
coding to 9.0, originality to 6.2, idea quality to 8.5, user experience and
impact to 8.3, with topic fit 10. Six of the judges put Carta in their top five.
In duels it now wins the district question and the impact question against all
four challengers. It still loses the "national Top App" question to RampCheck,
Every Word and Last Seen, narrowly: their demos are understood in five seconds,
and Carta's California paperwork needs explaining. That is why the script leads
its demo with the form check, the most visual thing Carta does.

**What the re-score does not cover.** The panel scored a *card*, not the built
app. That card described five features, and the build differs: the state's own
translations ("Rosetta") were **not built**, the hand-off loops numbered frames
rather than using a fountain code, and the form check runs on a demonstration
form, not the county's. Read the 50.3 as a score for the plan, not for what
ships.

## 10. What didn't make the cut, and why

Ten candidate features were researched and scored. Four were built, one was
built in part, and five were not.

| Candidate (research name) | Decision | Why |
|---|---|---|
| Red Pen | **Built** as "Before you mail it" | Best single demo, answers "why not just use the portal", and it is real engineering. |
| Deadline X-Ray / Clock Map | **Built** as "If your benefits stop" | Every date sourced and quoted. Cut from the research version: a ranked list of remedies (that is legal strategy), any derived aid-paid-pending date (the rule conflicts with a printed date), and the "cost of waiting" strip (no law found). |
| Ghost Letters | **Built** as "Letters on the way" | Only for the CalFresh renewal after a SAR 7. Medi-Cal renewal packets are not forecast: the timing could not be sourced well enough to ask anyone about a missing letter. |
| Hand-Off Beam | **Built** as "Get a letter from a helper's phone" | Built without the research version's watch copy (against SPEC §10) and without claiming a strength the check code does not have. |
| Sealed Envelope | **Half built**: "Save a copy of what I'm mailing" | The useful half is proof of what you mailed. The cryptographic receipt was cut: it does nothing when the whole envelope is lost, which is the case that matters. |
| Rosetta | **Not built** | Needs the state's own Vietnamese and Chinese wording for each form revision. The state's site blocks automated requests, and the Vietnamese PDFs that were fetched come out as garbled legacy-encoded text. SPEC §10 limits Carta to English and Spanish, and the only form with a template is fictional. A machine translation labelled as such is the thing Rosetta was meant to replace. |
| Needs Your Eyes | Not built | It promised a guarantee about review accuracy that cannot be delivered, and Review already flags the two fields that fail quietly. |
| Family Voice | Not built | A helper's recorded voice as the reminder. It does not play on a silenced phone, and as designed it broke the one-network-call rule. |
| Is This Really the County? | Not built | A scam check against your own letters. It could flag the county's real texts, and it applied CalFresh's card-replacement limit to cash aid, which edges into telling people they will not be reimbursed. |
| The 80-Hour Ledger | Not built | Proof of hours for the 2027 Medi-Cal work rule. Two of its legal rules were wrong, Maria is exempt as a parent of a young child, and "under 80 hours" reads as a verdict on someone's benefits. |

## 11. The video script

The current script, copied from `VIDEO-SCRIPT.md` on 2026-09-25. It is built on
the card that placed first in the re-score and leads its demo with the form
check. Your first two sentences are unchanged. About 430 spoken words, 2:42 to
2:52. The "Do not say", "Do not film" and "Verify before publishing" lists are in
`VIDEO-SCRIPT.md` and matter as much as the script.

### 0:00 – 0:14 · The statistic

> **Shot:** black card, the two figures set in type.

"During the 2023 to 2024 Medicaid unwinding, about 25 million people lost
coverage. Among states that reported a reason, KFF found 69 percent were dropped
for paperwork, not because anyone found them ineligible."

### 0:14 – 0:30 · Why it matters here

> **Shot:** `ENROLLMENT` struck through, `RETENTION` beneath it.

"In California, families are six times more likely to leave CalFresh in a month
when paperwork is due, and more than half who leave are likely still eligible.
Every benefits app I found is built for enrollment. Carta is built for
retention."

### 0:30 – 0:55 · What it does

> **Shot:** Capture → Review → Home. Hold on the countdown for a beat. Cut to
> the lock-screen reminder.

"Photograph the letter. Carta reads it on the phone, finds the deadline buried
in the third paragraph, and has you confirm it first, because this is a legal
document. Then it does what a chatbot can't: it remembers. Home
is a countdown, and weeks later the reminder names the form and what goes in the
envelope."

### 0:55 – 1:30 · Before you mail it

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

### 1:30 – 2:00 · After the deadline, and before the letter

> **Shot:** a stop notice's "If your benefits stop" card, then "Where this comes
> from" with the rule word for word. Cut to Home: "Letters on the way", then the
> "Did it come?" card.

"If benefits do stop, the letter prints the stop date, not the way back. Carta
works it out from sourced rules, like 30 days to turn the form in so CalFresh
can restart, and says to confirm with your county. It also
watches for the letter that never comes. In the state's survey of people dropped
from Medi-Cal, 47 percent said they never got a renewal form. When the month for
the next letter passes with nothing scanned, Carta asks: did it come?"

### 2:00 – 2:15 · The helper

> **Shot:** the helper's phone looping the QR code, the four-digit check code
> beside it. (Two phones face to face only once this has worked on two real
> phones; see "Do not film".)

"A navigator helping a family can confirm the letter with them, then pass it to
the family's phone through the two cameras: encrypted, offline, and the helper's
phone keeps nothing."

### 2:15 – 2:45 · How it's built, and the close

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
