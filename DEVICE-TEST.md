# Device test — the camera path

**For Devansh, on the physical iPhone.** Written by Claude.

Everything Carta has proven so far sits downstream of an image that was already
on disk, put there by a script. This is the first run where the input is a real
camera frame: 12 megapixels, an EXIF orientation tag, and a URI shape nothing in
the pipeline has seen. **It is the demo path, and it has never executed.**

Every run records a **trace** — each stage with its timing and what it produced.
When something fails, tap **Copy details** and paste it back. The trace contains
no notice content, only stage names, timings, dimensions and counts, so it is
safe to paste anywhere.

---

## Build

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/Carta-*
npx expo run:ios --device            # pick your iPhone, or use EAS
```

The clean DerivedData matters — see CLAUDE.md §13. **`expo-image-picker` is
new**, so this build must be fresh; a cached one will not have it.

Do **not** set `ios.buildReactNativeFromSource`. It looks like a fix for a dyld
failure and it breaks the build.

---

## Test 1 — camera, flat and well lit

The baseline. If this does not work nothing else matters.

1. Open Carta → **Photograph a notice**
2. Allow the camera when asked
3. Lay a printed notice flat, fill the frame, tap **Take photo**
4. Wait for "Reading the letter…"

**Report back:**

| what | why it matters |
|---|---|
| how long "Reading the letter…" lasted | first real measurement of OCR on a phone |
| the "N lines of text" number | corpus captures give 31–36. Under 20 means the frame was bad |
| whether an upside-down warning appeared | it must **not** here |
| tap **Copy details** and paste the trace | the numbers below |

In that trace, these three lines are the ones I want:

```
ok   ocr            ####ms
       sourceWidth: 3024      <- the camera frame, before resizing
       sourceHeight: 4032
       sourcePortrait: true   <- MUST be true for a portrait photo
```

**If `sourcePortrait` is `false` on a photo you took upright, stop and tell me.**
It means EXIF rotation is not being applied, every bounding box is on its side,
and the orientation check and the extractor are both reading a sideways page.
That is the failure this whole test exists to find, and it cannot happen in the
Simulator because there is no camera there.

5. Tap **Use this photo** → Review opens

**Report back:** which field the cursor lands in (expect the name or the case
number), whether the deadline is right, and whether the name and case number are
right. **The name and case number are the two that fail plausibly** — check them
against the letter character by character, especially the digits.

6. Fix anything wrong, tap **Save and set reminders**
7. Allow notifications when asked — **this is the tap only you can do**

**Report back:** whether you land back on Home, and whether the card shows a
countdown or a red "No reminders set" block.

8. On Home, tap **Copy diagnostics** and paste. The stage I want:

```
ok   schedule       ##ms
       permission: granted
       requested: 5
       osHeld: 6        <- MUST be >= requested
       tiers: t14,t7,t3,t1,day_of
```

**If `osHeld` is 0 while `requested` is 5, that is the bug from 2026-08-20** —
iOS accepting the schedule and retaining nothing. It should be fixed; this
confirms it.

---

## Test 2 — the banner

The one thing still unproven. Provisional authorisation delivers quietly, so a
real banner has never been seen.

1. Save a notice with a deadline **2 or 3 days out** so the ladder fires soon,
   or use a notice whose deadline is today
2. Lock the phone and wait

**Report back:** whether a banner actually appeared, what it said, and whether
tapping it opened Carta.

If nothing arrives within a few minutes of when you expect it, send the
`schedule` stage from the trace and I will work out whether it was scheduled for
the wrong moment or not at all.

---

## Test 3 — the picker

The fallback, equally untested. It is what works when the camera does not.

1. Take a photo of a notice with the normal **Camera app** first, so it is in
   your library
2. In Carta → **Photograph a notice** → **Choose a photo instead**
3. Allow photo access, pick the notice

**Report back:** the line count and the trace, same as Test 1. Compare
`sourceWidth`/`sourceHeight` with Test 1 — the picker returns an already-rotated
image where the camera may not, so **these two paths can disagree**, and that
disagreement would be invisible without the trace.

Also confirm: **nothing new appears in your photo library.** Carta must never
write there (CLAUDE.md §3 rule 7).

---

## Test 4 — upside down, on the camera

The orientation warning has only ever been validated against files, and against
**one** inverted capture. This is the first real test of it.

1. Put a notice on the table **rotated 180°** — text upside down from where you
   stand
2. Hold the phone normally, portrait, and photograph it
3. Do **not** rotate the phone

**Report back:**

- whether **"Turn the page around"** appeared
- from the trace:

```
ok   orientation    #ms
       verdict: inverted
       anchors: 2
       anchorPosition: 0.65     <- upright reads 0.21-0.32
```

**The `anchorPosition` number is the result.** On the corpus, 22 upright
captures land at 0.21–0.32 and the single inverted one at 0.65, threshold 0.5.
If your real inverted capture lands near 0.65, the threshold holds on camera
input. If it lands at 0.45 or 0.55, the margin is thinner than the corpus
suggested and I will move the threshold or add a second anchor.

4. Tap **Use it anyway** and look at Review

**Report back:** how many fields came through. On the corpus, an inverted page
keeps the case number and the programme (text-only matching) and loses the
deadline (geometry). If your capture loses *more* than that, tell me.

5. Now turn the page the right way up, photograph it again, and confirm the
   warning does **not** appear.

**A false warning on an upright page is worse than a missed one** — it teaches
you to ignore the warning. If it fires on an upright capture, that is a
stop-everything bug.

---

## Test 5 — the ugly ones

Two minutes, and this is where real failures live.

| shot | what to report |
|---|---|
| dim room, no flash | line count, and whether extraction still found the deadline |
| held at ~30°, not flat | same |
| creased sheet, folded in thirds | same |
| a notice in Spanish, if you have one | whether the deadline was found at all |

Line count and deadline for each is enough. Copy the trace on anything that
fails.

---

## What "it broke" should look like

Never just "it didn't work". The failure screen names the stage and offers
**Copy details**. Paste that and it will say which of these happened:

| stage | means |
|---|---|
| `ocr` | the recogniser returned nothing — bad frame, or the resize produced something it could not read |
| `orientation` | boxes were missing or malformed. Should be near-impossible; interesting if it happens |
| `extract` | text was read, fields were not found. Expected on an unfamiliar layout |
| `save` | SQLite or the encryption failed. Would be serious |
| `encrypt-image` | the photo could not be encrypted or deleted |
| `schedule` | iOS refused the reminders |

---

## Not covered here

- **Android.** Compile-check only (CLAUDE.md §6).
- **The Review edit fields on a real keyboard.** Worth a look while you are in
  there — report anything where the keyboard covers the field you are editing.
