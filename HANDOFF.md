# Handoff — 2026-08-25

Written because a session ended mid-verification. **Assume no memory of it.**

Read `CLAUDE.md` for the project. Read `NOTES.md` from the bottom for the
decision log. This file covers only what happened last and what to do next.

---

## 1. What was just fixed, and why it matters

### The reminder ladder was a lie on every first install ⚠️

**The most serious defect found in this project so far.** Full write-up in
NOTES.md, entry *"2026-08-25 — The reminder ladder was a lie on every first
install"*. The short version:

On a **freshly erased** device, Carta saved a notice, scheduled four reminders,
and iOS retained **zero** of them — while the database recorded all four as
`state = 'scheduled'` with real notification ids, and Home therefore showed the
notice as covered with no warning.

`scheduleNotificationAsync` succeeds without notification authorisation. It
returns an id per call and the OS keeps nothing. `recordScheduled` was writing
what the app *asked for* rather than what it *got*.

Worse: the app was already asking the right question. `listScheduled()` ran
immediately after scheduling and its result went into the diagnostic trace as
`osHeld`. **The discrepancy was observed, printed, and discarded.**

**Fixed in two places:**

| file | change |
|---|---|
| `src/lib/db/reminders.ts` | New `reconcileWithOs(noticeId, osNotificationIds)`. Marks as `cancelled` every reminder iOS is not actually holding; returns how many were dropped. |
| `src/app/review.tsx` | Calls it after `listScheduled()`, and reports `dropped` in the trace. |
| `src/app/selftest.tsx` | Requested notification permission **at the end of the run**, after scheduling everything — so the acceptance harness proved the spine against a state no real user is in. Permission is now requested first. Its comment claimed *"Scheduling is verifiable without display authorisation"*, which is false; corrected. |

Home's "No reminders set" card already existed, with real copy and a button that
opens iOS Settings. It was built for exactly this and **could never fire**,
because the only column it reads was never corrected. It can now.

### The `getDatabase()` first-launch race

Found on the same cold-start pass, fixed just before it. `getDatabase()`
memoised the *resolved handle*, which guards nothing while an open is in flight.
Two concurrent callers both ran the migrations, and migration v2's
`ALTER TABLE notices DROP COLUMN recipient_name` is not idempotent — the second
run threw *no such column*, the open rejected, and Home rendered **"Carta could
not open your notices"** on a brand-new install.

Latent since schema v2. Exposed only when the onboarding gate began reading a
setting from the root layout while Home read the notice list — the first
genuinely concurrent pair in the app's life. Fixed by memoising the **promise**
and clearing it on failure so a retry is possible.

---

## 2. What was verified, and how

Everything below was actually run, not reasoned about.

- **`npm run typecheck`, `npm run lint`, `npm test`** — clean.
  **304 tests, 19 suites, across both Jest projects.**
- **The `getDatabase` fix was verified by breaking it.** The original buggy
  implementation was restored temporarily; **five tests failed with the exact
  production error, `no such column: recipient_name`**; then it was reverted.
- **`no-network.test.ts` was verified the same way** (earlier session): a real
  `fetch('https://telemetry.example.com/…')` was injected into `urgency.ts` and
  both halves — runtime monkeypatch and static source audit — failed
  independently before it was reverted.
- **Cold start, twice, on a genuinely erased Simulator**
  (`xcrun simctl erase`, not just reinstall):
  - *Before the fix:* DB held 4 reminders marked `scheduled`; iOS held 0.
  - *After the fix:* permission granted first, `reminders scheduled: 4` with no
    `OS DROPPED`, `OS reports 8` across two notices, DB `scheduled|8`,
    `user_version|3`.
  - Read directly with `sqlite3` against the device's
    `Documents/SQLite/carta.db` — more reliable than screenshots and the reason
    the reminder bug was caught at all.

### Not verified — pick this up first

**The 5-second proof notification banner was never observed.** The session ended
while polling for it. Everything up to it is confirmed: permission granted, the
proof notification scheduled with an id, `OS now holds 9`. What is missing is
the visual confirmation that a banner actually appears on screen.

Also unexercised: **the Skip button on onboarding**. Synthetic taps in this
environment register reliably on bottom-of-screen controls and not on
top-of-screen ones — the same pattern hit the nav back chevron, a sheet's close
X, and Review's Edit affordance. **This is almost certainly the tap injection,
not the app**, and it should not be recorded as a defect without a human tap to
confirm. Onboarding was completed via *Next* instead, and the flag was verified
written (`onboardingDone|true` in the settings table).

---

## 3. State of the tree

Committed. `npm test` green at the commit.

Screenshots from this and the previous session are in `screenshots/`.

### `content:check` is at 14 items — and that number went **up** on purpose

Nothing was closed. Four items were added: two new freshness rules, the
`still_needed` work list now surfaced instead of rendered to users, and one
**counting bug** — `outstandingVerifications` had never been passed the
doc-types pack, so its translation TODO had never been counted at all.

**Do not treat a falling count as progress unless something became verifiable.**

### Spanish: two CDSS forms applied, doc types still unsourced

`tools/forms/spanish/` holds two manually downloaded PDFs (cdss.ca.gov 302s to a
dead host for automated requests — CLAUDE.md §13).

- **CF 377.6 (SP)** gave the notice-level field labels now used on Review:
  `Número del caso`, `Nombre del caso`, `Fecha de la notificación`.
- **CF 30 (SP)** — the SAR 7 *reminder*, not the SAR 7 — gave the phrasing in
  `detail.mustDoWithDeadline` and the form's official Spanish name.

**Neither carries a required-document checklist**, so `content/doc_types.json`
(pay stub, rent receipt, utility bill, photo ID…) is **still Carta's own
wording**. It must stay open on `content:check`. `_translation_blocker` in that
file says exactly what is still needed: **SAR 7 (SP)** and **SAR 7A (SP)**.

Full per-string provenance is in **`src/lib/i18n/SOURCES.md`** — which Spanish is
the state's words and which is Carta's. i18n files have no `source_url` field,
so that file is the mechanism.

---

## 4. The next three actions, in order

### 1. Run the cascade through the metrics harness — *this is the priority*

```bash
npm run metrics -- --extractor src/extraction/index.ts
```

Devansh was writing the extraction cascade when this session ran. Everything is
on `scaffold.ts` until it lands. That command produces **the number that goes in
the README and the video**, and it is the last big unknown in the project.

Two things should change the moment it lands:

- **`field.invalid` gets a producer.** The invalid-value state on Review
  (`review.tsx`, the `flagged` branch) has been dead UI since it was built —
  `scaffold.ts` never sets it. It was deliberately left alone rather than faked.
- **`ExtractionResult.requiredDocs` starts populating**, which turns the
  Checklist from "the user adds everything" into "the letter's own list", and
  makes `origin: 'letter'` rows appear for the first time.

### 2. Finish the interrupted cold-start verification

Erase, install, run to a saved notice, and **watch for the banner**:

```bash
xcrun simctl erase DB2B3461-F7CD-4982-9DB1-53A316769153
xcrun simctl boot   DB2B3461-F7CD-4982-9DB1-53A316769153
xcrun simctl install DB2B3461-F7CD-4982-9DB1-53A316769153 \
  ~/Library/Developer/Xcode/DerivedData/Carta-*/Build/Products/Debug-iphonesimulator/Carta.app
# Metro: the LAN IP changes; localhost works from the Simulator.
xcrun simctl openurl DB2B3461-F7CD-4982-9DB1-53A316769153 \
  "exp+carta://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"
```

Then, after a notice is saved, confirm the state at the data layer rather than
by eye:

```bash
D=$(xcrun simctl get_app_container booted com.devanshsanghavi.noticetracker data)
sqlite3 "$D/Documents/SQLite/carta.db" \
  "SELECT state, COUNT(*) FROM reminders GROUP BY state; PRAGMA user_version;"
```

Expected: all `scheduled`, `user_version` 3, and a visible banner ~5s after the
self-test finishes.

### 3. Get SAR 7 (SP) and SAR 7A (SP), then close the doc-type translations

Browser download — automated fetches are blocked. Put them in
`tools/forms/spanish/`, copy the wording for the proof items into
`content/doc_types.json` (`label_es` / `what_es`), update `_translation_note`,
and only then clear `_translation_blocker`. A fluent speaker still has to read
the result.

---

## 5. Standing hazards worth re-reading before touching anything

All in CLAUDE.md §13, but these three bit *this* session:

- **A cache keyed on "is it done yet" does not protect the window before it is
  done.** That window is where concurrency lives.
- **A string in a content pack is user-facing unless proven otherwise.** Two
  developer notes have reached users this way; `tests/node/pack-audience.test.ts`
  now guards it structurally.
- **Configuring a thing is not verifying it happened.** Fifth instance this
  month was the `app` Jest project, which was configured, referenced in the spec,
  and could not parse its first file for two weeks. `npm test` was green
  throughout.

And one added by this session:

- **Observing a discrepancy is not handling it.** If code asks what actually
  happened, the answer must change something. The reminder bug survived a check
  that was already written, already running, and already printing the right
  number.
