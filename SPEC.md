# Carta — Build Specification

> **Never lose a benefit to paperwork.**
> Congressional App Challenge 2026 · CA-16 (Rep. Sam Liccardo) · Due **Mon Oct 26, 2026, 12:00 PM EDT / 9:00 AM PDT**
>
> **Primary platform: iOS (iPhone).** React Native keeps Android compiling; all footage is filmed on iPhone.
>
> *Revised 2026-08-11 (v2). The original spec optimised for engineering depth that is invisible on camera. This version optimises for a complete, polished, moving app. See NOTES.md for what changed and why.*

---

## 0. Read this first

Three rules override everything else in this document.

1. **No network on any code path that touches notice data.** Not for OCR, not for extraction, not for analytics. Enforced by `no-network.test.ts` (§8.3). If a feature needs a network call on document data, the feature is cut.
2. **No cloud LLM. Ever.** All inference is local, on-device, via `llama.rn`. No OpenAI, no Anthropic, no Google, no hosted anything.
3. **The user confirms every extracted field before anything is scheduled.** The app never silently acts on a machine reading of a legal document.

**There is exactly one network call in the entire app:** downloading the language model, which is user-initiated, wifi-gated, shown with a clear size warning, and happens in Settings — outside the notice pipeline, touching no notice data. Everything else works in airplane mode, forever.

There is **no backend**. No server, no database, no accounts, no API keys, no hosting bill. This is a product decision and it is the centrepiece of the pitch.

---

## 1. The problem

Most people who lose SNAP/CalFresh, Medi-Cal, or a housing voucher **do not become ineligible.** They are terminated for *procedural* reasons: a missed semi-annual report, an unreturned verification request, a recertification packet that arrived during a double shift. Researchers call this **churn**, and it is enormous and almost entirely unaddressed.

The government's own communication is the proximate cause. A Notice of Action is a dense, jargon-heavy legal document, often mailed only in English, with the deadline buried in the third paragraph. Recipients get several a year, across programs, from different agencies, each with its own form and rules.

**Every other entry in this district will build for enrollment — helping people find and apply for benefits. Carta builds for retention: helping people keep what they have already been approved for.** That is sentence one of the demo video.

### Target user

Maria, 34, San Jose. Two kids, two part-time jobs. CalFresh and Medi-Cal. Primary language Spanish. One phone, limited data, no printer, no computer. She has lost CalFresh twice — both times for paperwork, both times still eligible, both times two months to get back on.

---

## 2. What Carta does

**Carta is a deadline tracker for government paperwork.** It is not a document
explainer. That distinction drives every design decision below, and it is the
answer to the only hard question this product faces — *"why not just paste the
letter into ChatGPT?"*

ChatGPT will explain a letter. It will not know, five weeks later, at 9am, that
your SAR 7 is due on Thursday and you still have not attached a pay stub. **The
defensible claim is that Carta remembers and acts.** Comprehension is
commoditised; persistence is not.

| # | Capability | Description |
|---|---|---|
| **1** | **Guard — the product** | Escalating local reminders (T-30/14/7/3/1/day-of), a separate urgent clock for the appeal window, a per-notice document checklist, and an encrypted vault of recurring proof documents. Months of memory, on a phone, offline. |
| **2** | **Capture** | Photograph **any** government letter. On-device OCR plus a local language model find the program, agency, action type, dates, deadline, and required documents — so the user never types a date. |
| **3** | **Decode — the trust mechanism** | A plain-language explanation at ~5th-grade reading level, English or Spanish, generated on-device and streamed as it is written. **Supporting, not headline.** A countdown saying "12 days" is only worth anything if the user believes the app read the letter correctly; the explanation is how they check. That is a smaller role than "AI explains your letter" but it is load-bearing. |
| **4** | **Deliver** | Where to submit, and what else is worth checking (§2.1). |

### Why "any letter" and not "six California forms"

The original spec built a template registry for six specific CDSS forms. That approach only ever works on documents someone anticipated. A local model working from OCR text handles an SSA letter, a HUD notice, a county letter, or a form revised last month — with no new code. **"Point it at any government letter" is both a better product and a better demo than "point it at a SAR 7."**

### 2.1 Worth checking — the access half

Carta is a retention product. The district's brief is about helping residents
**access** benefits and services, and retention alone is silent on that. This
closes the gap for a few days of work, without becoming the eligibility-screener
that §10 forbids and that every other entry will build.

After a notice is confirmed, Carta knows the **program** and the **county**. It
shows a short curated list from bundled static JSON: *"People receiving CalFresh
in Santa Clara County are often also eligible for WIC."* Each entry carries a
plain-language note, a source, a `verifiedOn` date, and a link to the real
application.

**Three constraints keep this on the right side of §10. They are not optional.**

1. **It is a statement about a population, never about this user.** "People
   receiving CalFresh are often also eligible for…" — never "You may qualify."
   Carta does not know whether this household qualifies and must never imply it
   does.
2. **Keyed on program and county only. Never household size, income, or age.**
   The moment the list is filtered on an eligibility input, it stops being a
   cross-reference and becomes a determination — which is screening, which is
   forbidden. This constraint is the whole reason the feature is safe, and it
   costs nothing: program plus county is enough to be useful.
3. **The public-charge myth-buster renders inline with the list, not behind a
   link.** Suggesting additional programs to a mixed-status household is exactly
   where fear does its damage (§5.9). If the list is on screen, the reassurance
   is on screen.

Every entry is sourced and dated like the office directory (§11). Never invent a
program, an eligibility rule, or an application URL.

### The three things that will win it

- **It runs entirely on the phone.** A language model doing real work, offline, on a $0 budget, with no account and no server. Demonstrated by putting the phone in airplane mode for the whole demo.
- **The appeal and aid-paid-pending clocks.** When a notice is a denial, reduction, or termination, Carta surfaces both the appeal deadline and the much shorter window to request a hearing **with benefits continued while the appeal is pending**. Almost nobody knows this rule exists. *(Never hardcode a number not sourced from current CDSS guidance — see §11.)*
- **The readability gate.** CI fails if user-facing explanation content scores above 6th-grade Flesch–Kincaid. You are not claiming plain language; you are enforcing it.

---

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React Native + Expo SDK 57 (dev client)** | Not Expo Go. RN 0.86.2, React 19.2.3. |
| Language | TypeScript, strict | Plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. |
| Navigation | `expo-router` | File-based, routes under `src/app`. |
| Camera | `expo-camera` | |
| Image prep | `expo-image-manipulator` | **Resize + EXIF rotate only.** It cannot grayscale, contrast, or deskew — and modern neural OCR does worse on hand-thresholded input anyway. |
| **OCR** | **`expo-mlkit-ocr`, off the shelf** | Whatever geometry it returns is good enough: the user confirms every field. No custom native module. |
| **Local LLM** | **`llama.rn` (stable line, ≥0.12.9)** | Metal on iOS. Ships an Expo config plugin. Supports raw **GBNF grammars** and per-token streaming callbacks. |
| Model | **Qwen2.5-1.5B-Instruct GGUF Q4_K_M** (~1 GB) | Apache 2.0. Falls back to **Qwen2.5-0.5B** if 1.5B is too slow (§9 week 1 gate). **Downloaded on demand, never bundled.** |
| DB | **`expo-sqlite`** | Plus field-level encryption for sensitive columns, key in `expo-secure-store`. SQLCipher was cut as unnecessary complexity. |
| Files | `expo-file-system` | App sandbox only. **Never MediaLibrary** — captured notices must not reach the camera roll. |
| Reminders | `expo-notifications`, **locally scheduled only** | No push tokens, no FCM/APNs, no Expo push service. Works in airplane mode. |
| i18n | `i18next` + `react-i18next` | **en + es only.** Strings bundled, no translation backend. |
| State | Zustand | Keep it boring. |
| Testing | Jest + `@testing-library/react-native` | Two projects: bare Node and jest-expo. Plus the gates in §8. |

**Static bundled data (no server):** program metadata, explanation content, document types, office directory, and the "worth checking" program cross-reference (§2.1) — versioned JSON in `/content`, every record sourced and carrying a `verifiedOn` date.

---

## 4. The pipeline

```
photo
 └─> expo-image-manipulator  (resize, EXIF rotate)
      └─> expo-mlkit-ocr     (on-device)
           └─> REDACT        (§5) — SSNs stripped before anything is persisted
                └─> REGION SELECT + REGEX PRE-FILL   (deterministic, always runs)
                     └─> LOCAL LLM EXTRACTION        (GBNF-constrained JSON, optional)
                          └─> SANITY PASS            (deterministic, always runs)
                               └─> USER CONFIRMATION (never skippable)
                                    └─> schedule reminders, build checklist
```

### The deterministic pass is not optional, and it is not a fallback

**Manual entry is a first-class, complete path through this app — not a degraded one.** The model is an opt-in ~1 GB download; before it is downloaded, if the user declines it, on a low-RAM device, or if it stalls, the app must still be fully usable.

So the deterministic pass **always runs, model or no model**, and it does two jobs:

1. **Pre-fill.** Dates, program names, agency names, and form IDs are extracted by regex and lexicon so that a user without the model gets a **half-filled form rather than a blank one**.
2. **Region select.** Prompt tokens dominate inference cost and most of a dense form is boilerplate. The deterministic pass picks the regions worth sending to the model instead of feeding it the whole page.

This lives in `/src/extraction` and is the student's work (§13).

### Local LLM extraction

- Fires only when the model is present and enabled.
- **Constrained decoding with a hand-written GBNF grammar** so the model can only emit schema-valid JSON. A grammar constrains a date field to `\d{2}/\d{2}/\d{4}` **at the token level** — it makes a malformed date structurally impossible rather than catching it afterward. This is sharper than `response_format: json_schema` and it is the single best technical detail in the project.
- The prompt contains only **redacted** OCR text.
- Every model-produced field is badged **"AI-read — please check"** and rendered distinctly.
- Runs with a hard timeout. On timeout it falls back to the pre-filled deterministic result, never hangs.

### The model extracts. It does not invent legal rules.

Deadlines, appeal windows, and required documents come from **what is printed on the letter**, plus a small bundled content pack keyed by program. If the model cannot find something, **the field is empty and the user fills it in. Never fabricate a date.**

### Sanity pass

Deterministic checks over whatever the model returned: do dates parse; is the deadline after the notice date; is the program in the known list; is the action type in the enum. Failures drop confidence and pre-focus the field on the confirmation screen.

### Second use of the model — plain-language rewriting

Feed the redacted notice text back to the model and stream a ~5th-grade explanation in the user's language. This is summarisation of a document the user is physically holding, which is the low-risk use, and it is the most watchable thing in the demo.

**Five guardrails, all non-negotiable, all visible in the UI rather than quiet internal rules:**

1. The original text is always one tap away **on the same screen**.
2. The rewrite is visibly labelled machine-generated.
3. The rewrite never states a deadline that was not extracted **and confirmed by the user**.
4. It never tells a user they are ineligible.
5. **The rewrite may only restate content present in the source text.** A cheap self-check scans the generated text for dates and flags any that do not appear in the confirmed fields, surfacing a visible warning.

**Latency is the governing constraint.** Extraction and explanation are **two separate calls**: extraction returns fast on capture, explanation streams **on demand** when the user taps "Explain this." That is both faster to first result and better on camera than one long wait.

---

## 5. Privacy architecture

Every item is demonstrable on stage.

1. **Zero network on document paths.** Enforced by test (§8.3). The model download is the sole network call and it touches no notice data.
2. **SSN never persisted.** Redact `\b\d{3}-?\d{2}-?\d{4}\b` plus "SSN"/"Social Security" adjacency from OCR text *before* the first write. Store a boolean `containedSsn` so the UI can say it was scrubbed.
3. **Case numbers hashed.** Store `sha256(caseNumber + deviceSalt)` plus the last 4 for display. The full number is never at rest.
4. **Sensitive fields encrypted at rest.** `expo-sqlite` with per-field encryption on the sensitive columns (OCR text, case hash, image references), key generated on first launch and held in `expo-secure-store` (Keychain / Android Keystore).
5. **Images sandboxed.** `expo-file-system` app directory. Never the camera roll. Optional setting to delete the source image after extraction.
6. **No accounts.** Nothing to breach.
7. **No analytics SDK.** Events go to a local table for a user-visible debug screen only.
8. **Panic delete.** Settings → "Delete everything" wipes the database, files, keychain entry, downloaded model, and all scheduled notifications, with confirmation.
9. **Immigration-status safe.** Never asks for or stores immigration status. Explanation content includes a public-charge myth-buster grounded in cited USCIS policy text.

---

## 6. Data model

```sql
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  program_id TEXT NOT NULL,
  agency TEXT,
  action_type TEXT NOT NULL,        -- approval|denial|reduction|discontinuance|info_request|recert_due
  notice_date INTEGER,
  effective_date INTEGER,
  deadline_date INTEGER,
  appeal_deadline INTEGER,
  aid_paid_pending_deadline INTEGER,
  case_hash TEXT, case_last4 TEXT,
  confidence REAL NOT NULL,
  extraction_source TEXT NOT NULL,  -- manual|regex|llm|llm_corrected
  contained_ssn INTEGER DEFAULT 0,
  image_ref TEXT,
  ocr_ref TEXT,                     -- redacted text, encrypted
  explanation_ref TEXT,             -- generated explanation, encrypted, nullable
  status TEXT NOT NULL,             -- pending_review|active|completed|dismissed|expired
  locale TEXT
);

CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  doc_type_id TEXT NOT NULL, label TEXT NOT NULL,
  satisfied_by_document_id TEXT REFERENCES documents(id),
  status TEXT NOT NULL              -- needed|attached|submitted|na
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  doc_type_id TEXT NOT NULL, label TEXT NOT NULL, file_ref TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  covers_period_start INTEGER, covers_period_end INTEGER,
  expires_at INTEGER
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  fire_at INTEGER NOT NULL,
  tier TEXT NOT NULL,               -- t30|t14|t7|t3|t1|day_of|appeal_urgent
  os_notification_id TEXT,
  state TEXT NOT NULL               -- scheduled|fired|cancelled
);

CREATE TABLE corrections (          -- local-only, never transmitted
  id TEXT PRIMARY KEY, field_id TEXT,
  extracted TEXT, corrected TEXT, source TEXT, created_at INTEGER
);
```

Dates are epoch millis computed in the device's local timezone. Test DST boundaries.

### Reminder ladder

On confirmation, schedule from `deadline_date`: **T-30, T-14, T-7, T-3, T-1, day-of at 9am local.** Suppress tiers already past. If `aid_paid_pending_deadline` exists, schedule a visually distinct **urgent** reminder at T-2 and T-1 with different copy. Cancel the ladder when the user marks the notice submitted. Re-schedule on locale change, because notification bodies are localised at schedule time.

---

## 7. Screens

**Cut order is decided now, so week 9 is not a panic.**

**The core four must be excellent.** Nothing below the line may steal polish from anything above it.

| Priority | Screen | Purpose |
|---|---|---|
| **Core** | **Home** | **The countdown is the screen.** One card per tracked benefit, and the dominant visual element by a wide margin is the days remaining on the nearest deadline — not the program name, not the notice text. Green >14d, amber 3–14d, red <3d. If a stranger sees this screen for two seconds they should come away with a number and a colour. The video opens here. |
| **Core** | **Capture** | Camera with framing guide, torch, multi-page, and a live "text detected ✓" indicator so the user knows the shot is good before leaving the screen. |
| **Core** | **Review** | Every field editable, confidence shown, AI-read fields distinct. Tap a field to highlight where it came from on the photo. Low-confidence fields pre-focused. |
| **Core** | **Notice Detail** | **Opens with the deadline and the action**, not with prose. Order is: the countdown and what must be done, then the checklist state, then the explanation — **What this says · What you must do · By when · How to appeal** — streamed from the local model. Then "worth checking" (§2.1) at the bottom. Language toggle. Original photo and original text one tap away, always. |
| 5 | Checklist | Required documents. Attach from vault, capture new, or mark N/A. Progress ring. "You're ready" state. |
| 6 | Settings | Language, reminder timing, model download/delete, privacy explainer, **Delete everything**. *If cut back: language + model + delete only.* |
| 7 | Vault | Recurring documents grouped by type, with staleness warnings ("this pay stub is 47 days old"). |
| 8 | Where to Go | ~10 verified offices. **First to cut if week 5 is tight.** |
| — | Onboarding | Three screens: what Carta does, nothing leaves your phone, offer the model download. |

**Design constraints, non-negotiable:** one-handed operation; ≥16pt body text with Dynamic Type; every interactive element ≥44pt; full screen-reader labels; no timeouts; every screen usable in airplane mode; all copy ≤6th-grade in both languages.

**Polish means:** every screen has a real empty state, loading state, and error state. No lorem ipsum, no placeholder copy, no dead buttons. **If a screen is not finished, cut the screen rather than ship a stub.** One consistent visual language — type scale, spacing, colour, iconography — picked once and held.

---

## 8. Verification

### 8.1 Test corpus — ~20 photographs
Fill blank public forms with **fictional** data, render, print, and photograph ~20 under varied lighting and angles with the demo phone. Commit the images plus expected-extraction JSON. **Never use a real person's notice.**

Confirmed 2026-08-11: **printing** on a school/library printer, ~20 pages. The README states the corpus was printed and photographed, not captured off a screen.

### 8.2 Extraction metrics
Per field: precision/recall against the corpus, for both the deterministic-only path and the model path. Print a table in CI and put it in the README. Quantified self-evaluation is rare in high-school submissions and reads as real engineering.

### 8.3 The network test ⭐
Jest suite that monkey-patches `fetch`, `XMLHttpRequest`, and the RN networking bridge to throw, then runs the full pipeline — OCR → redact → extract → persist → schedule — over the corpus. **Any network attempt fails the build.** Named `no-network.test.ts` and referenced by filename in the README and the video.

### 8.4 Readability gate
CI scores every string in `content/explanations/en/*.json` with Flesch–Kincaid and **fails above grade 6**. Spanish uses Fernández-Huerta with the same gate. Model-generated explanations are sampled and scored too, but cannot fail the build — they are generated at runtime.

### 8.5 Also
- Redaction tests: SSN in 8 formats must never reach the database or a file.
- Reminder scheduling tests including DST boundaries and past-deadline suppression.
- Latency measurements recorded in NOTES.md (§9 week 1) — these are the deliverable, not just an input to a decision.
- Accessibility audit logged in `A11Y.md`.
- Device matrix: the demo iPhone (primary), iOS simulator, and one EAS Android build per phase boundary to confirm nothing platform-specific broke.

---

## 9. Nine build weeks to freeze

Solo. Sequenced so the app is end-to-end early and every later week makes it **better, not bigger.**

| Wk | Dates | Deliverable | Gate |
|---|---|---|---|
| **1** | Aug 11–17 | **De-risk the model.** llama.rn on device, model download UX, GBNF-constrained JSON from pasted OCR text. Remove cut work; swap to `expo-sqlite`. | **Measured tok/s on the real phone. 1.5B or 0.5B. Go/no-go.** |
| **2** | Aug 18–24 | Thin spine, ugly but real: photo → OCR → redact → pre-fill → extract → confirm → save → one reminder fires. | End-to-end works once |
| **3** | Aug 25–31 | Home + Notice Detail with **streamed** explanation. | Looks like a product |
| **4** | Sep 1–7 | Checklist + Vault. Full reminder ladder + appeal urgent tier. | **Demoable end-to-end** |
| **5** | Sep 8–14 | "Worth checking" (§2.1) as a **section on Notice Detail**, not a screen. Settings + Delete Everything + onboarding. Where to Go if time allows. | All screens exist |
| **6** | Sep 15–21 | **Design pass.** One visual language; every empty/loading/error state real. | **🎬 Film a full rehearsal video and watch it** |
| **7** | Sep 22–28 | Spanish QA, accessibility pass, readability gate in CI. | Both languages complete |
| **8** | Sep 29–Oct 5 | Corpus photographs, measure, fix the worst failures. | Metrics table real |
| **9** | Oct 6–12 | Self-QA. Cut anything half-done. **Feature freeze Oct 12.** | Shippable |
| 10 | Oct 13–19 | README, architecture diagram, metrics table, dependency list, AI disclosure. Film and edit the final video. Draft the six written answers. | |
| 11 | Oct 20–26 | **Submit Oct 20–21.** The portal jams near the deadline and submissions cannot be modified after it. | |

**Spanish is written as each screen lands**, not saved for week 7 — i18n is already wired, so week 7 is *review*, not first-write. Otherwise Spanish becomes "making it bigger" late.

**The week 6 rehearsal video is a hard gate, not a nice-to-have.** Film it, watch it, and fix what watching reveals — there are still three weeks. If weeks 7–9 all slip, you already have a submittable film.

---

## 10. Scope guard — do NOT build

- ❌ Any backend, account system, or cloud sync
- ❌ Auto-filling or auto-submitting government forms
- ❌ **Eligibility screening** — a different app, and what everyone else is building. The line against §2.1: a curated list keyed on *program and county* is a cross-reference. The same list filtered on *household size, income, or age* is a determination. Cross-references are allowed; determinations are not. If a feature ever needs to ask the user an eligibility question, it has crossed the line.
- ❌ A chatbot interface
- ❌ Multi-user / household sharing
- ❌ Languages beyond English and Spanish
- ❌ A web version
- ❌ Content-update-over-the-air infrastructure
- ❌ Any dependency requiring a paid tier
- ❌ Landing pages, marketing sites, app-store listings

**Cut in the v2 re-scope (2026-08-11):** custom Swift Vision module; the four-layer cascade; the Layer 0 template registry for six CDSS forms; ML Kit vs Vision bake-off; the customWords × usesLanguageCorrection ablation; quad geometry and provenance/OS-build recording; SQLCipher; the homography/perspective-warp synthetic corpus generator.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| **Model too slow on the demo phone** | Week 1 gate before anything is built on it. Mitigations in order: region-select the prompt instead of sending the page; split extraction and explanation with explanation on demand; then 0.5B for extraction and 1.5B only for explanation; then 0.5B for both. |
| **Model unavailable or declined** | Deterministic pre-fill plus manual entry is a complete path. This is also the video insurance. |
| **Model hallucinates a field** | GBNF makes malformed output structurally impossible; the sanity pass catches implausible output; the user confirms everything; nothing is scheduled until they do. |
| **Explanation states something untrue** | Five guardrails in §4, including the date self-check, all visible in the UI. |
| Aid-paid-pending window stated incorrectly | The highest-stakes number in the app. Source it, cite it, pair every instance with "confirm with your county — this is not legal advice." |
| Where-to-Go data wrong or stale | ~10 records, each with a `verifiedOn` date and a "call to confirm" line in the UI. Never invented. |
| **"Why not just use ChatGPT?"** | The honest answer is that comprehension is commoditised and persistence is not. The product is reframed around the deadline, the reminder ladder, and months of memory — the things a chat session cannot do. Explanation is demoted to the trust mechanism (§2). |
| **§2.1 drifts into eligibility screening** | Hard constraints in §2.1: population-level phrasing only, keyed on program and county only, never an eligibility input. Reviewed against §10 before shipping. |
| **§2.1 causes harm to a mixed-status household** | Public-charge myth-buster renders inline with the list, never behind a link (§5.9). |
| Scope overrun | Cut order in §7 is decided in advance. |

**Ethical guardrails:** a persistent, non-dismissible disclaimer that Carta is not legal advice and never contacts any agency; always show the original document alongside any interpretation; never tell a user they are ineligible; when confidence is low, say so plainly rather than guessing.

---

## 12. The submission

Judged on a **1–3 minute video plus six written answers**, by a congressional office, on three criteria: **quality of the idea, user experience and design, and coding skill.** Judges may request source access; they will not install an iOS build.

### 12.1 Video — 1 to 3 minutes, public on YouTube or Vimeo, target 2:30

Required by the rules: participant name, app name, purpose in **one sentence**, target audience, **tools and coding languages used**, and a functionality showcase.

| Time | Content |
|---|---|
| 0:00–0:15 | Name, app name. *"Carta reads government benefit letters and makes sure you never lose your benefits to a missed deadline."* Audience. |
| 0:15–0:35 | The problem: most people who lose these benefits are **still eligible** — they got dropped for paperwork. Show a real form and let the density speak. |
| 0:35–1:45 | Live demo on the iPhone, **airplane mode visible in the status bar throughout**. Open on Home with a red countdown already running — the app has been remembering for weeks. Then: photograph a new letter → fields fill instantly from the regex pass and **visibly sharpen** as the model refines them → confirm → **the new countdown appears and the reminder ladder is scheduled** → tap Explain and watch the model generate on-device (the trust beat) → Spanish toggle → checklist. |
| 1:45–2:10 | Architecture. Say "React Native, TypeScript, llama.cpp, Qwen2.5, GBNF grammar-constrained decoding" out loud. Show `no-network.test.ts` going green. "Zero servers, zero cost, zero data collected." |
| 2:10–2:30 | Metrics table. Close: *"The problem was never eligibility. It was the mail."* |

**The demo must never show waiting on the 1 GB model download.** Onboarding is shown briefly with the model already present.

Screen-record on the phone; record voiceover separately; set the video to **public**.

### 12.2 The six written answers

Drafted in week 10, from NOTES.md, not from memory.

1. Title — Carta.
2. Purpose — the one sentence, expanded.
3. Inspiration — the churn insight: most terminations are procedural, and every app in this space is built for signup instead of retention.
4. **Technical difficulty ⭐ — the highest-leverage question.** The answer is the on-device model work: getting a 1.5B parameter model to run usefully on a phone, quantization choice, the latency measurements and what made them acceptable, GBNF grammar-constrained decoding forcing schema-valid output, and why a deterministic pre-fill path exists underneath it. **Name real numbers from NOTES.md.**
5. What you learned.
6. What you would change in 2.0 — more languages, more programs, Android polish, household sharing.

---

## 13. AI usage disclosure — read carefully

> *"The use of AI tools in app development is permitted, provided that all AI usage is fully disclosed in the submission materials. AI may only be used to support specific aspects of the project and must not constitute the entirety of the technical development."*

Using Claude Code is allowed. Handing it the whole build is not.

**Note the distinction that matters now that a model does the extraction:** the *product* uses a local LLM at runtime. That is a feature, and it is disclosed as one. It is unrelated to how much of the *source code* was written by an AI assistant, which is what the rule governs. Both get stated plainly, separately, in the README.

**How to stay clearly on the right side:**

- **`/src/extraction` is the student's.** The GBNF grammar, the extraction schema, the prompt construction, the redaction matcher, the region-selection and pre-fill heuristics, the sanity pass, and the confidence model. That is the intellectual core and it is still substantial — arguably more so than the template registry it replaced.
- **Keep `NOTES.md` current.** It is where written answer #4 comes from and it is the artifact that proves the understanding is yours.
- **Never merge code you cannot explain line by line.** If a judge points at a function, you answer immediately. If you cannot, delete it and write it yourself.
- **Disclose specifically:** *"Claude Code was used for project scaffolding, UI components, the storage layer, and test harnesses. The extraction schema, GBNF grammar, prompt design, redaction logic, and confidence model were designed and implemented by me."* Make that statement true.

---

## 14. Open items

- `TODO(verify)`: current CDSS guidance for the appeal window and the aid-paid-pending deadline. Never ship a number without an opened source.
- Blank forms to be downloaded into `/tools/forms/` — see `tools/forms/SOURCES.md`. The agent cannot reach `cdss.ca.gov` or `dhcs.ca.gov`; this is a manual step.
- Where-to-Go records to be collected and dated (~10, an afternoon).
- EAS device build onto the demo iPhone (needs interactive Apple ID).
