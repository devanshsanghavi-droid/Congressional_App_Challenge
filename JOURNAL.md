# Carta: the journal

*Last updated 2026-10-01.* One place for the key points: what Carta is, who it
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
  precision and 87.9% recall on the notices it was built with; on the two
  held-out letters it had never seen (notice 10 of the held-out three was never
  photographed), all 6 values it filled in were right, and it left the other 6
  blank rather than guess. (It was 6 of 7 until 2026-09-29: the one wrong answer
  was a masked SSN read as a case number, a privacy bug fixed that day.) 100% precision on every date it schedules on.
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
- **752 tests across 28 suites**, typecheck and lint clean, in CI on Ubuntu.
  §12 explains what they cover and why they are worth showing.

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
- **Found and fixed on 2026-09-29: a masked SSN offered as a case number.** Social
  Security letters print the number where a case number goes. The case-number
  reader took it from the unredacted lines, so it reached Review and its last four
  were stored. It was also the one wrong answer on the held-out letters. It is
  fixed, tested, and disclosed in the README.
- **Other open items:**
  - the corpus's notice 05 may be mislabelled;
  - the OCR module never sets recognition languages;
  - the 25 million figure: the 2026-09-29 fact-checker reported that KFF's tracker
    says "over 25 million", but confirm it yourself once.

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

### The script panels (2026-09-29)

The script was then judged on its own, in three rounds. All the judges were
simulated, and each round was blind and order-rotated. There were four personas:
a Silicon Valley engineering manager, a San Jose benefits-nonprofit director, a
high-school CS teacher, and a national Top Apps reviewer.

1. **Old script against a first rewrite, 8 judges.** Split 4–4 for the district
   panel, and 6–2 for the rewrite nationally. The rewrite scored higher on coding
   (8.3 vs 6.5) but lower on user experience (6.8 vs 7.8), because its testing
   section had pushed the app off the screen.
2. **Three new rewrites, each fact-checked, then ranked by 8 judges.** The
   "five-second" rewrite leads every section with what the family gets. It ranked
   first with 6 of the 8 judges and was picked for national by all 8. By Borda
   count (a ranking point score) it got 22 of a possible 24. The district-focused
   rewrite came second, with the best topic fit (9.1). The first rewrite came
   last with every judge.
3. **The winner with the judges' consensus grafts, against the winner as it was,
   8 judges.** 8–0 for the grafted version, on both district and national. Mean
   scores: idea 8.4, originality 8.0, UX 8.0, coding 8.1, impact 8.4, fit 9.0,
   against 8.3, 8.0, 7.4, 7.3, 7.8 and 7.1.

The consensus grafts:
- restore "more than half who leave are likely still eligible";
- name San Jose and Santa Clara County in the close;
- say that fixed rules, not the AI model, read the dates;
- add an accessibility caption and a CA-16 end card.

**Three adversarial fact-checks** then went over the result: statistics, app
behaviour, and tests. They found errors that had been sitting in the fact sheet
and the journal:
- the held-out letters were **two**, not three;
- the 23 photos cover **9** notices, not 10;
- the reminder names the programme, not the form;
- the family confirms dates and names, not the list of papers.

They also found the three test-suite gaps and the case-number SSN leak that §12
describes.

A last blind check, 4 judges, compared the corrected script with the 8–0
version. It came out even: 3–1 district, 2–2 national, all low confidence. So
the corrections cost nothing measurable, and a producer's timing check cut about
40 more words for a safe margin under 3:00.


### The fourth panel (2026-10-01): the rules, and a chatbot-wrapper rival

**The 2026-09-29 script was missing two things the CAC rules require:** your name
and the tools and languages used. Adding them meant cutting elsewhere, so three
scripts went to 8 blind, order-rotated judges:
- the 2026-09-29 script;
- **A**, with an engineering section built from verified highlights;
- **B**, with lighter engineering.

Every judge was told the required elements, and told it had just watched a
rival entry that sends a user's situation to a cloud chatbot and lists
resources.

**A won clearly:**
- ranked first by 7 of 8 judges;
- best for national with 8 of 8;
- "most clearly more than a chatbot wrapper" with 8 of 8;
- mean scores of 9.0 idea, 9.0 originality, 8.9 coding and 9.0 fit;
- rules compliance 9.1, against 3.4 for the old script.

Every tech judge named the same best moment: *"Fixed rules read the dates,
because on our test letters a small AI model got four dates wrong and made up
two."*

The final version then took the panel's consensus edits:
- the concrete 30-day example went back in;
- the statistic now runs over the phone take from the first frame;
- three test captions instead of five;
- the timing was cut to about 2:46.

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

The current script, copied from `VIDEO-SCRIPT.md` on 2026-10-01. It opens with
your two sentences unchanged and runs about 2:46.

`VIDEO-SCRIPT.md` also holds:
- the full recording plan: calendar, gear, shoot kit, phone setup, shot list,
  capture, voice, edit, graphics, upload and fallbacks;
- the technical highlights the video leans on;
- the "Do not say" list.

### 0:00 – 0:19 · The statistic

> **Shot:** one unbroken take from the first frame: a printed sample letter on a
> table, the iPhone held over it, a corner caption **Airplane mode** for the whole
> take. The photo; a thumb scrolls the filled-in fields and taps "Save and set
> reminders"; the page becomes Home and the countdown (**14 days**) fills the
> screen. The two figures set in type over the take. Small type: *Sample letter,
> not a real person's*. Source caption: **KFF Medicaid Enrollment and Unwinding
> Tracker**. Delivery: pause after "reason"; say K, F, F as three letters.

"During the 2023 to 2024 Medicaid unwinding, about 25 million people lost
coverage. Among states that reported a reason, KFF found 69 percent were dropped
for paperwork, not because anyone found them ineligible."

### 0:19 – 0:45 · Why it matters here, and who made it

> **Shot:** hold on Home and its countdown, then a slow scroll down the card list.
> Source caption for the first two sentences: **California Policy Lab**. Lower
> third while the name is spoken: **Devansh Sanghavi · Carta · CA-16**.

"In California, households are six times more likely to leave CalFresh, the
state's food aid, in a month when paperwork is due. More than half who leave are
likely still eligible. I'm Devansh Sanghavi. My app, Carta, reads benefit
letters for families on CalFresh and Medi-Cal so they don't miss a deadline.
Most benefits tools help people apply. Carta helps them stay."

### 0:45 – 0:59 · The deadline, remembered

> **Shot:** a close-up of Review from a different angle: the case number flagged
> "Please check this", a thumb confirming the deadline. Then the real 9:00 AM
> reminder arriving as a banner over Home, pulled down and long-pressed open so the
> papers show (see the plan: this is screen-recorded, not a lock-screen shot).

"It strips out the Social Security number, and the family confirms every date
and name. Carta does what a chatbot doesn't: it remembers, and the reminder
lists the papers the letter asked for."

### 0:59 – 1:21 · Before you mail it

> **Shot:** caption **Blank boxes, a missing signature, an early date: caught
> before mailing**. Photograph the hand-filled demonstration SAR 7 (footer: "CARTA
> DEMONSTRATION COPY"): question 2 blank, question 3 marked twice, no signature,
> an early date. Red rings land on each; "Look again at 4 things before you mail
> it". Jump cut to a second, correctly filled copy: shoot again, every ring turns
> green. **Hold two seconds, no narration.** Tap "Save a copy of what I'm mailing".

"Text recognition can't reliably see a checkmark. So on its demonstration copy
of the six-month report, Carta lines the photo up with the blank form and
measures the ink in every box. It never tells you the form is complete; the
county decides that."

### 1:21 – 1:48 · If benefits stop, and if a letter never comes

> **Shot:** a stop notice's "If your benefits stop" card full screen while "30
> days" is spoken, then "Where this comes from" pushed in on its source line.
> During the survey line, a plain title card with the source caption **DHCS
> Medi-Cal Disenrollment Survey**. Then Home: "Letters on the way", the "Did it
> come?" card, "It never came" and the county's phone numbers.

"If benefits stop anyway, Carta shows time limits the letter doesn't print, like
30 days to turn in what was missing so CalFresh may start again, all marked 'ask
your county to confirm'. Nearly half of the people surveyed after losing
Medi-Cal said they never got a renewal form. For CalFresh, when the renewal
notice is late, Carta asks: did it come?"

### 1:48 – 2:10 · How it is built

> **Shot:** the tools card, held for the whole first sentence: **TypeScript ·
> React Native · Expo · Apple Vision · llama.cpp · Qwen2.5 1.5B · SQLite ·
> AES-256 · Jest**. Then a still, held six seconds, two rows: **AI model: 4 dates
> wrong, 2 made up** / **Fixed rules: 0 wrong, 0 made up**, small type *5 test
> photos, scored on a Mac*. Then the phone in airplane mode: tap "Explain this in
> plain words", jump cut past "Getting ready…", and let the text stream, caption
> **Written on this iPhone, not on a server**.

"Carta is written in TypeScript with React Native, and everything runs on the
phone. Fixed rules read the dates, because on our test letters a small AI model
got four dates wrong and made up two. So the AI, running on the iPhone itself,
only explains the letter in plain words."

### 2:10 – 2:27 · Tested like it matters

> **Shot:** the terminal, summary lines only, `Tests: 752 passed, 752 total`, with
> the caption **752 tests · re-run on a clean machine on every update**. Then the
> privacy test failing red with a network call planted in the deadline code, and
> green with it removed, captioned **Internet cut off · 79 recorded scans · 82
> source files checked**. Then Review with one field left empty and a thumb typing
> it in, captioned **2 letters it never saw: 6 details filled in, all 6 right · 6
> left blank for the family**.

"A wrong date can cost a family its food, so every update re-runs 752 tests. One
cuts off the internet and fails if anything handling a letter goes online; a
network call planted on purpose was caught."

### 2:27 – 2:46 · The close

> **Shot:** Home in Spanish, then English Home at a larger text size (change the
> size, then relaunch the app), the disclaimer "Carta is not legal advice and
> never contacts any agency" legible. Caption: **Bigger text ·
> screen-reader labels**. End card: **Carta · Devansh Sanghavi · Congressional App
> Challenge 2026 · CA-16**.

"Carta works in English and Spanish, and it is not legal advice. It was made for
families in San Jose and Santa Clara County, so that paperwork is never the
reason a family loses food or health care."

## 12. The 752 tests, and why they are worth showing off

*Counted from the full run on 2026-09-29, and audited claim by claim against the
Jest output, the test files and CI by an independent checker. It was 713 that
morning. The audit found three claims the suite did not yet back, and fixing them
took it to 752:*
- *SSN removal was asserted for only 2 of the 8 formats. 8 tests were added.*
- *The privacy test skipped every screen. It now scans every source file, which
  added 26 tests.*
- *An SSN could reach Review as a case number, a real bug. It was fixed, with 5
  tests added.*

**752 automated tests in 28 suites, 0 failing, and the run prints nothing but
the results.** They run in two environments:
- bare Node: 23 suites, 597 tests;
- a simulated iPhone React Native environment that renders real screens: 5 suites,
  155 tests.

CI re-runs typecheck, lint and every test on a clean Ubuntu machine on every
push to `main` and every pull request; the last run was green. On this Mac, with
a warm cache, the whole suite takes about 3 seconds by Jest's own timer.

### What they protect

| What | Tests | Suites |
|---|---|---|
| Reading the letter right | 296 | extraction contract 234, orientation 29, real-iPhone orientation 7, extraction island 17, extraction port 9 |
| Measuring honestly | 51 | metrics scoring 25, corpus integrity 26 |
| Privacy and security | 121 | no-network 96, privacy 10, hand-off 15 |
| Dates and reminders | 90 | urgency 17, notice mapping 7, timelines 27, timezone 4, vault 13, reminder resync 8, first launch 14 |
| The form check | 48 | form check 48 |
| Honest, safe words | 102 | content 22, pack audience 26, explanation check 19, no em dash 9, Settings strings 11, i18n 6, checklist 9 |
| Screens and accessibility | 44 | screens 25, countdown scaling 12, trace 7 |
| **Total** | **752** | **28 suites** |

### The ones to name out loud

- **The privacy test cuts off the network (96 tests).**
  - It booby-traps `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
    `sendBeacon` and React Native's native networking modules so that any call
    throws.
  - With the traps set, it runs extraction and the upside-down check over all 79
    recorded scans (23 real photos, 56 with simulated damage).
  - Separately, it reads every other source file in the app, 82 of them, and
    fails on any network API or hard-coded URL. Each file is its own test. The
    one file it skips, by name, is the optional AI model download.
  - A `fetch` planted in the Review screen was caught. Before 2026-09-29 the
    test only scanned a hand-picked list of pipeline modules, and it would have
    missed that.
  - Four tests prove the traps really throw.
  - It was itself checked by planting a real network call in the deadline code
    and watching both halves fail.
- **184 contract checks on 23 real photographs.** Every photo must satisfy 8 rules:
  every date is a real calendar day, every field names where it came from, no
  empty strings pretending to be answers, and so on.
- **The eight SSN formats (18 tests), plus the case number (5).**
  - For each of 8 ways a Social Security number appears (dashed, spaced, nine bare
    digits, labelled, "Social Security Number:", non-breaking hyphens, masked
    `XXX-XX-6789`, and Spanish "Numero de Seguro Social"), the digits must be gone
    from the saved text. The case number, the phone number and the date on the
    same page must survive.
  - A screen-level test feeds Review all 8 at once, on purpose, and checks that
    none reaches the database.
  - When the redactor was deliberately broken to flag SSNs without removing them,
    9 tests failed.
  - Social Security letters print the number where a case number goes. 5 tests
    make sure a masked SSN is never offered as the case number, including on
    every real photograph. Removing the fix fails 4 of them.
- **Daylight saving.**
  - Countdowns and the date conversion at the storage boundary are tested across
    both clock changes; the reminder ladder across the November one.
  - The suite is pinned to Los Angeles time, and a 4-test suite proves the pin
    works. It includes a guard against anyone "fixing" a failure by switching to
    UTC.
- **Tests of the tests (42, by a strict count).** Their only job is to prove other
  checks can fail, or are not passing on nothing: "the poison is actually poison",
  "the audit can actually fire" (every banned phrase pattern must catch its own
  example), "has strings to check, so a pass is not vacuous", and the timezone
  suite.
- **The measuring tools are tested too (51).** 25 tests check the scorer's
  arithmetic (a date one day off is wrong, a missing answer is not a wrong one).
  26 check the corpus itself: every photo on disk is mapped, and the story linking
  notices 01 and 02 is consistent.
- **Real iPhone photos.** Upside-down detection is tested on OCR from four photos
  taken on an iPhone 16 Pro, not only on generated images.
- **Ethics as tests.**
  - "You may qualify" wording is rejected in English and Spanish.
  - The AI rewrite may not state any date the family did not confirm, and may not
    say they are ineligible.
  - Developer notes can never reach a user's screen.
  - English and Spanish must match key for key (453 strings each).
- **Accessibility as a test.** Only the countdown number may cap how large text
  grows. A test scans every other file for anything that would stop text growing.
- **Regression tests named after real bugs:**
  - the "October XXX XXX" string that once reached a user;
  - "Not yet researched -- add name, address, phone", which once rendered on
    Where to Go;
  - the first-launch database race;
  - Home blaming notifications for a deadline that had already passed;
  - the SSN bug.
- **Held-out honesty.** Accuracy is reported separately for letters the code was
  built against and for letters it never saw. The report refuses to print a
  percentage from fewer than 3 photos.

### How to say it without overclaiming

- **Say** "Carta runs 752 tests". Do not say "I wrote 752 tests": the README
  discloses that the code, tests included, was written substantially with AI
  assistance. What was yours is the testing standard: prove a test can fail, hold
  letters out, test on a clean machine, and turn every bug into a test.
- **Say** "run on every update". It runs on pushes to `main` and on pull requests.
- **Say** "replays 79 recorded scans". Do not say 79 real scans (23 are real
  photos) or "runs every step on every scan".
- **Update the count at filming time** to whatever the terminal shows.
