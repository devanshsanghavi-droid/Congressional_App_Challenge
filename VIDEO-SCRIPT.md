# Carta — video plan and script

**About 2:46**: 360 written words, 373 with the numbers said aloud. Including
holds and picture time, that is **2:36 brisk, 2:46 at 150 words a minute, 2:56
at a slow 140**. Time one real read-through before recording, and use the
optional cuts if it runs past 2:52.

Revised 2026-10-01, after a fourth blind, order-rotated simulated panel (8
judges). Every judge was told the CAC's required elements and that it had just
watched a chatbot-wrapper entry. The panel picked this version over the
2026-09-29 script:
- first with 7 of 8 judges;
- best for national with 8 of 8;
- "most clearly more than a chatbot wrapper" with 8 of 8;
- rules compliance 9.1, against 3.4 for the old script, which never said your
  name or the tools.

JOURNAL.md §9 has the full history. Your two opening sentences are unchanged.

**Part 1 is how to make it. Part 2 is what to say.**

---

# Part 1 — The plan

## 1. What the rules require, and where the video does it

From the [official 2026 CAC rules](https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf):
1 to 3 minutes (overtime can be penalised), public on YouTube or Vimeo, and it
must include each of these.

| Required | Where |
|---|---|
| Each participant's name | 0:19, spoken ("I'm Devansh Sanghavi"), plus a lower third and the end card |
| The app's name | 0:19 spoken, end card |
| A clear one-sentence purpose | 0:19: "My app, Carta, reads benefit letters for families on CalFresh and Medi-Cal so they don't miss a deadline." |
| The target audience | Same sentence, plus "families in San Jose and Santa Clara County" in the close |
| Tools and coding languages | 1:48: "TypeScript with React Native", plus the tools card held on screen |
| Functionality showcase | 0:00–2:10, all on the real app |

## 2. Calendar (feature freeze Oct 12, submit Oct 20; the deadline is Oct 26)

| When | What |
|---|---|
| **Oct 1–3** | Build the current code onto the iPhone 16 Pro. Nothing added since Sept 24 has run on a phone. Download the AI model over wifi in Settings. **Rehearse every shot once** and write down what fails. |
| Oct 4 | Make the graphics (§10) and print the shoot kit (§4). |
| **Oct 5–7** | **Rehearsal cut**, the SPEC's hard gate: scratch voice in Voice Memos, rough screen recordings, rough edit. Watch it once on a phone and once on a laptop **with the sound off** (are the captions readable?). |
| Oct 8–11 | Fix whatever the rehearsal found. Code fixes must land before the freeze. |
| Oct 12 | Feature freeze. |
| Oct 13, evening | Stage the phone (§5). The 14-days-out letter must be confirmed **the day before** the shoot. |
| **Oct 14, shoot day** | 8:50 AM: start a screen recording on Home and catch the 9:00 reminder. Then every phone shot in shot-list order, the hands footage, and the Mac terminal recordings. |
| Oct 15 | Voice-over. Run `npx jest` that day and read the test count off it. |
| Oct 16–18 | Edit, captions, sound. |
| Oct 19 | Export, upload as **public**, and watch it logged out on a phone. |
| **Oct 20** | **Submit.** Oct 21 is the backup. The portal jams near the deadline, and a submission cannot be edited afterwards. |

## 3. Gear

- **The iPhone 16 Pro**, for the app and every screen recording.
- **A second camera for hands footage**: a borrowed phone is fine. Add a phone
  tripod or an overhead arm, or a stack of books and a clamp.
- **Light**: a desk lamp at about 45° or a window, on a **matte** surface. Dark
  poster board behind white paper reads best. Avoid glare on the paper and on the
  iPhone screen.
- **The Mac**, for terminal recordings (QuickTime → New Screen Recording) and
  editing.
- **Sound**: a small, soft room (a closet full of clothes is ideal). The iPhone
  itself in Voice Memos (Settings → Voice Memos → Audio Quality: Lossless), or a
  wired earbud mic.
- **A pen**, for filling in forms on camera.

## 4. Shoot kit (print and prepare)

- **The demonstration SAR 7, two copies.** Print `tools/forms/demo/sar7-demo-blank.pdf`.
  - Copy 1, filled with **all four faults**: question 2 blank, question 3 with
    both boxes marked, no signature, and a date inside the report month (August
    2026).
  - Copy 2, filled **correctly**: one box per question, signed, dated in
    September 2026.
  - Write the dates in large, clear digits.
- **A sample letter that is due 14 days after shoot day.** For an Oct 14 shoot
  that is **Oct 28, 2026**. It is fictional, never a real person's. The cold-open
  take photographs it, so the printed date is what Home will count down from. *(I
  can generate this PDF.)*
- **A stop notice** with its stop date in the future. Its dates are not seen on
  camera, so set them on Review.
- **A six-month report due April 5, 2026 or earlier**, for the "Did it come?"
  card. Set that date on Review and film this sequence first, then delete it so
  its overdue card does not sit on Home in later shots.
- **Graphics** (§10), exported as 1920×1080 images.

## 5. Phone setup (the night before)

- **Delete everything:** Settings in Carta → Delete everything. Then stage only
  the letters in §4.
- **Permissions:** grant camera and notifications in a throwaway capture first,
  then delete that letter. A permission dialog would break the unbroken take.
- **Focus / Do Not Disturb:** allow only Carta. Set Settings → Notifications →
  Show Previews to **Always**.
- **Airplane mode:** after the model is downloaded, turn airplane mode **on** and
  Wi-Fi and Bluetooth off. The airplane icon is part of the story.
- **Display:** Light mode, high brightness, Auto-Lock **Never**, Low Power Mode
  off (it turns the battery icon yellow), and a full charge.
- **Text size:** the iOS default ("Large") for every shot except the close, which
  uses a bigger size. After changing the size, relaunch the app: React Native
  does not re-lay out a running app.
- **Screen Recording:** add it to Control Center, with the microphone **off**.

## 6. Shot list

| # | Section | Shot | How | Length |
|---|---|---|---|---|
| 1 | Statistic | One unbroken take: photograph the 14-days letter, scroll Review, tap "Save and set reminders", Home shows **14 days** | Hands on the second camera **and** a screen recording at the same time (combined later) | 19 s |
| 2 | Who | Hold on Home, then scroll the cards. Lower third: name · Carta · CA-16 | Screen recording | 26 s |
| 3 | Remembered | Review close-up ("Please check this" on the case number). Then the 9:00 reminder arriving as a banner, pulled down and long-pressed open | Screen recording | 14 s |
| 4 | Form check | Photograph copy 1 → red rings, "Look again at 4 things". Jump cut, photograph copy 2 → all green. **Hold 2 s.** Tap "Save a copy…" | Hands + screen recording | 22 s |
| 5 | Stop / letters | "If your benefits stop" card → "Where this comes from". DHCS title card. "Letters on the way" → "Did it come?" → "It never came" | Screen recording + graphic | 27 s |
| 6 | Built | Tools card. AI-vs-rules still (6 s). In airplane mode, tap "Explain this in plain words", **jump cut past "Getting ready…"** (about 9 s of loading), let the text stream | Graphics + screen recording | 22 s |
| 7 | Tested | Terminal `Tests: 752 passed`. Privacy test red with a planted call, then green. Review with an empty field being typed in | Mac recording + screen recording | 17 s |
| 8 | Close | Home in Spanish, then English Home at a large text size. End card | Screen recording + graphic | 19 s |

## 7. How to capture each kind of shot

- **Phone screen recordings** capture the real pixels, so the UI stays crisp.
  Start them a second early and trim later. The red recording pill in the Dynamic
  Island is acceptable; crop it if it distracts.
- **The 9:00 reminder.** The ladder fires 30, 14, 7, 3, 1 and 0 days before a
  deadline, at 9:00 AM. The time picker is still broken on iOS, so 9:00 cannot be
  changed. Keep the phone **unlocked on Home with a screen recording running**
  from 8:59: the banner lands in the recording. Pull down Notification Center and
  long-press the reminder so the list of papers shows.
- **Hands footage.**
  - Shoot at 1080p or 4K, **30 fps** to match the edit.
  - Long-press in the Camera app to lock focus and exposure.
  - Plain sleeves; rehearse each motion; three takes of each.
  - Where the phone screen is hard to read in the hands shot, the edit lays the
    screen recording over it as a large inset.
- **Terminal (Mac).**
  - Set the font to 22–24 pt, use a high-contrast theme, clear the scrollback,
    and keep the window about 1280×720.
  - For the planted call: open `src/lib/urgency.ts` and add
    `void fetch('https://example.com');` as the first line of `daysUntil`.
  - Run `npx jest tests/app/no-network.test.ts`. It goes red with 2 failures.
  - Undo the change and run it again. It goes green, 96 passed.
  - **Never commit it.** `git diff` must be empty afterwards.
- **The AI on the phone.**
  - Rehearse in airplane mode first. It has never been filmed that way, and never
    through the in-app button.
  - Every tap reloads the model, which takes about 9 s, so cut from the tap
    straight to the first words. Keep the airplane icon visible on both sides of
    the cut.
  - **Never film this in the Simulator**, where it takes 90–110 s.

## 8. Recording the voice

- Record **after the freeze**, so the test count is final.
- Print the script large, mark the pauses, and read it standing, phone 15–20 cm
  from your mouth and slightly off to the side.
- Do three full takes, then pick-ups for any stumbles, then 10 seconds of silence
  ("room tone") for patching gaps.
- Aim for about 150 words a minute. It will feel slow; that is right for judges
  and for second-language listeners.
- Say "K, F, F" as letters, "seven hundred fifty-two", and pause after "reason".

## 9. Editing

- **Software**: DaVinci Resolve (free) or iMovie. Timeline 1920×1080 at 30 fps.
- **Order**: lay the voice down first, then cut the picture to it. Cuts only, no
  flashy transitions.
- **Captions**:
  - one font (Inter or SF Pro), at least 54 px, at most two lines;
  - at least 3.5 seconds each, in the lower third, never covering the UI being
    talked about.
- **Sound**: normalise the voice to around -14 LUFS (YouTube's level). Music is
  optional: if used, royalty-free (e.g. the YouTube Audio Library) and about
  25–30 dB under the voice.
- **Closed captions**: upload an SRT made from the script to YouTube. It costs
  nothing, it helps judges who watch muted, and it matches the app's own
  accessibility story.

## 10. Graphics to make (Keynote, 1920×1080, white, the app's blue #1E63B8)

1. **Statistic type**: "about 25 million lost coverage" and "69% dropped for
   paperwork", with the KFF source line.
2. **Lower third**: Devansh Sanghavi · Carta · CA-16.
3. **DHCS title card** for the survey line.
4. **Tools card**: TypeScript · React Native · Expo · Apple Vision · llama.cpp ·
   Qwen2.5 1.5B · SQLite · AES-256 · Jest.
5. **AI vs rules**:
   - two rows: "AI model: 4 dates wrong, 2 made up" / "Fixed rules: 0 wrong, 0
     made up";
   - small type: *5 test photos, scored on a Mac*;
   - hold it for 6 seconds.
6. **Test captions**: "752 tests · re-run on a clean machine on every update" ·
   "Internet cut off · 79 recorded scans · 82 source files checked" · "2 letters
   it never saw: 6 details filled in, all 6 right · 6 left blank for the family".
7. **End card**: Carta · Devansh Sanghavi · Congressional App Challenge 2026 ·
   CA-16.

## 11. Export, upload, submit

- **Export**: H.264, 1080p, 30 fps, about 16 Mbps. Confirm the runtime is
  **under 2:55**, and watch the whole export once.
- **Upload to YouTube**:
  - Visibility **Public** (the rules require it); not made for kids.
  - Title: *Carta — Congressional App Challenge 2026 (CA-16) — Devansh Sanghavi*.
- **Description**:
  - the one-sentence purpose, the audience and the tools list;
  - the GitHub link;
  - "Sample letters are fictional";
  - one line saying the code was written with AI assistance, as the README
    discloses.
- **Before submitting**: add the SRT captions, then open the link in a private
  window and on a phone.
- **Submit on Oct 20.**

## 12. If something goes wrong on the day

| Problem | Do this |
|---|---|
| The form check will not line up from a real camera photo | Reshoot flatter and in better light. Next, pick the photo from the library in Carta. Last resort: film it in the Simulator and caption it "Simulator". Never fake it. |
| The date ring is grey ("What date did you write?") | Type the date in on camera, inside the jump cut. |
| "Explain" is slow or crashes | Keep the tools card and the AI-vs-rules still; drop the streaming shot. |
| The 9:00 reminder does not appear | Check Focus and permissions, then re-stage with a letter due 7 days later and shoot it on the next tier. |
| The cut runs over 2:55 | Use the optional cuts at the end of Part 2. |

## 13. The technical highlights, and how the video shows them

The script never names the rival entry. It only says "Carta does what a chatbot
doesn't: it remembers." The contrast is carried by things a website that sends
your situation to a cloud chatbot cannot claim. Every one below was checked
against the code, the decision log and a fresh run on 2026-10-01.

| What | In the video | Verified |
|---|---|---|
| **Everything runs on the phone**: no server, no account, one optional network call (the model download) | "everything runs on the phone"; airplane mode visible throughout | the privacy test; airplane-mode rehearsal still to do |
| **AI was measured against plain rules on dates, and lost**: on 5 test photos, Qwen2.5-1.5B got 4 dates wrong and made up 2; fixed rules got 0 and 0. On one letter it moved every September date to December. So the AI fills in **no** fields | spoken, plus the 6-second still | Mac (`npm run probe:llm`, re-run 2026-10-01, identical) |
| **A 1.5-billion-parameter model running on the iPhone**: on an iPhone 16 Pro, about 9 s to load, then the first word 0.7–1.3 s later and about 29–41 tokens a second | "running on the iPhone itself", plus the streaming shot | physical iPhone 16 Pro (probe build) |
| **Text recognition can't reliably see a checkmark**: on the test photos it missed 5 of 15 pen marks, and a box with an X read "YES", the same as an empty box. So Carta measures the ink | spoken | Mac Vision, form-check fixtures |
| **It lines a tilted photo up with the blank form** from the form's own printed words: a perspective fit (RANSAC), in TypeScript, with no computer-vision library | spoken | 48 tests; Simulator |
| **752 tests, re-run on a clean Ubuntu machine on every update**; the privacy test caught a planted network call; it checks 82 source files and replays 79 recorded scans | spoken, plus three captions | CI green on 744e469 |

**Held for Q&A and the written answers** (true, but not in the video, for time):
- **Measured fixes:** empty boxes first read 14–17% ink; a fix that was measured
  took all 21 to exactly 0.000.
- **Old bugs put back on purpose:** five previously fixed bugs were reinserted in
  a throwaway copy, and each turned a test red.
- **Daylight saving:** across a clock change, naive math says 90.04 days and
  Carta counts 90.
- **What iOS actually kept:** Carta checks which reminders iOS kept and repairs
  itself when notifications come back on.
- **"Delete everything"** also destroys the encryption key.
- **The letter-reading code cannot reach the internet**, enforced three
  independent ways.
- **The AI is never asked for the deadline:** taking that question away took the
  rewrite from 2 of 10 letters shown to 8 of 10.
- **Upside-down pages are noticed**, and Carta asks the user to turn them.

---

# Part 2 — The script

## 0:00 – 0:19 · The statistic

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

## 0:19 – 0:45 · Why it matters here, and who made it

> **Shot:** hold on Home and its countdown, then a slow scroll down the card list.
> Source caption for the first two sentences: **California Policy Lab**. Lower
> third while the name is spoken: **Devansh Sanghavi · Carta · CA-16**.

"In California, households are six times more likely to leave CalFresh, the
state's food aid, in a month when paperwork is due. More than half who leave are
likely still eligible. I'm Devansh Sanghavi. My app, Carta, reads benefit
letters for families on CalFresh and Medi-Cal so they don't miss a deadline.
Most benefits tools help people apply. Carta helps them stay."

## 0:45 – 0:59 · The deadline, remembered

> **Shot:** a close-up of Review from a different angle: the case number flagged
> "Please check this", a thumb confirming the deadline. Then the real 9:00 AM
> reminder arriving as a banner over Home, pulled down and long-pressed open so the
> papers show (see the plan: this is screen-recorded, not a lock-screen shot).

"It strips out the Social Security number, and the family confirms every date
and name. Carta does what a chatbot doesn't: it remembers, and the reminder
lists the papers the letter asked for."

## 0:59 – 1:21 · Before you mail it

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

## 1:21 – 1:48 · If benefits stop, and if a letter never comes

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

## 1:48 – 2:10 · How it is built

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

## 2:10 – 2:27 · Tested like it matters

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

## 2:27 – 2:46 · The close

> **Shot:** Home in Spanish, then English Home at a larger text size (change the
> size, then relaunch the app), the disclaimer "Carta is not legal advice and
> never contacts any agency" legible. Caption: **Bigger text ·
> screen-reader labels**. End card: **Carta · Devansh Sanghavi · Congressional App
> Challenge 2026 · CA-16**.

"Carta works in English and Spanish, and it is not legal advice. It was made for
families in San Jose and Santa Clara County, so that paperwork is never the
reason a family loses food or health care."

## Optional cuts, in order, if a timed read runs long

1. "the state's food aid," (about 1.5 s)
2. "all marked 'ask your county to confirm'" (about 2.5 s; the card shows it)
3. "like 30 days to turn in what was missing so CalFresh may start again," (about
   5 s; but 6 of 8 judges asked for this example, so cut it last)

# Do not say, and why

| Claim | Status |
|---|---|
| "Carta checks your SAR 7", or any SAR 7 | **Only the demonstration copy has a template**, and the script says so aloud. The county's layout needs its own template. |
| "first word in about a second", timed from the tap | Every tap reloads the model, which takes about 9 s. The 0.7–1.3 s is measured **after loading**. Jump-cut, and never imply it is instant. |
| "AI can't read dates" / "AI is bad" | The measurement is 5 test photos, a 4-bit 1.5B model, scored on a Mac. Say "on our test letters". Never merge it with the 96.9% figure, which comes from a different extractor. |
| "wifi-gated download" | The app says to use wifi but does not check the network type. |
| "the family confirms every detail" | Review confirms the dates, names and fields; it does **not** show the list of papers. Say "every date and name". |
| "the reminder names the form" | It names the programme ("CalFresh: 14 days left") and says "Send the form back… Send: [papers]". |
| "Social Security numbers are never saved" | The redaction covers the **saved text** (8 formats, tested); the letter photo is deleted after reading by default. |
| "96.9% accurate" | It is the share of **key details it filled in** that were right, on the letters it was built with. |
| "three letters it had never seen" | **Two.** On those two, 6 of 6 key details it filled in were right, and 6 of 12 were found. |
| "79 real scans" | 23 real photos plus 56 degraded on purpose. Say "79 recorded scans". |
| "every source file" | 82 files: every one **except** the model download, which is excluded by name. |
| "I wrote 752 tests" | The README discloses that the code, tests included, was written substantially with AI assistance. Say "Carta runs 752 tests". |
| "Vietnamese", "Chinese" | Not built. |
| "verified on a phone" for the form check, the new dates, the forecast or the hand-off | Not until the Oct 1–3 rehearsal has actually happened on the phone. The hand-off has never crossed between two phones, so the script leaves it out. |
| "47 percent of Californians" | Survey respondents dropped from Medi-Cal. Say "nearly half of the people surveyed". |
| "Carta forecasts Medi-Cal letters" | Only the CalFresh renewal notice. |
| "what a chatbot can't" | Say "doesn't". |
| "the database is encrypted" | Field-level only. |

# Verify before publishing

- **25 million and 69 percent:** KFF's Medicaid Enrollment and Unwinding Tracker.
  An AI fact-checker reported it says "over 25 million" and 69%; open it yourself
  once.
- **Six times, and more than half likely still eligible:** California Policy Lab,
  on CalFresh exits (households).
- **Nearly half never got a renewal form:** DHCS Medi-Cal Disenrollment Survey,
  47% in Month 1 and 46% over six months.
- **The test count:** read it off the run on recording day.
