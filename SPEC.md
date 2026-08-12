# Carta — Build Specification

> **Never lose a benefit to paperwork.**
> Congressional App Challenge 2026 · CA-16 (Rep. Sam Liccardo) · Due **Mon Oct 26, 2026, 12:00 PM EDT / 9:00 AM PDT**
>
> **Primary platform: iOS (iPhone).** Cross-platform by construction via React Native; developed and demoed on iPhone, smoke-tested on the Android emulator.

*Name is swappable. Alternatives: Backstop, Keepstead, Sobre, PaperTrail. "Carta" = letter in Spanish/Portuguese/Italian, which fits the multilingual audience and describes the input.*

---

## 0. Read this first

This spec is written for an implementing agent. Three rules override everything else in it:

1. **No notice content ever touches the network.** Not for OCR, not for parsing, not for analytics. There is a test that enforces this (§8.4). If a feature requires a network call on document data, the feature is cut.
2. **No cloud LLM. Ever.** Optional local inference only (§4, Layer 3), opt-in, downloaded on device, $0.
3. **The user always confirms extracted fields before anything is scheduled.** The app never silently acts on a machine reading of a legal document.

There is **no backend**. No server, no database, no accounts, no API keys, no hosting bill. This is a product decision, not a shortcut — it is the centerpiece of the pitch.

---

## 1. The problem

Most people who lose SNAP/CalFresh, Medi-Cal, or a housing voucher **do not become ineligible.** They get terminated for *procedural* reasons: a missed semi-annual report, an unreturned verification request, a recertification packet that arrived while they were working a double shift. Policy researchers call this **churn**. It is a documented, enormous, and almost entirely unaddressed failure mode.

The government's own communication is the proximate cause. A Notice of Action is a dense, jargon-heavy legal document, often mailed only in English, with a deadline buried in the third paragraph. Recipients get several a year across multiple programs from multiple agencies, each with its own form, deadline, and document requirements.

**Every other entry in this district will build for enrollment — helping people find and apply for benefits. Carta builds for retention: helping people keep what they've already been approved for.** That is the differentiating insight, and it should be sentence one of the demo video.

### Target user

Maria, 34, San Jose. Two kids. Works two part-time jobs. Receives CalFresh and Medi-Cal. Primary language Spanish. One Android phone, limited data plan, no printer, no home computer. She has lost CalFresh twice — both times for paperwork, both times she was still eligible, both times it took two months to get back on.

---

## 2. What Carta does

Four capabilities, in dependency order:

| # | Capability | Description |
|---|---|---|
| **1** | **Capture & Understand** | Photograph any government notice. On-device OCR + parsing extracts program, agency, action type, effective date, deadline, and required documents. |
| **2** | **Decode** | Plain-language explanation at ≤6th-grade reading level, in English or Spanish: *What this says / What you must do / By when / What happens if you don't / How to appeal.* Cited to the governing regulation. |
| **3** | **Guard** | Escalating local reminders (T-30/14/7/3/1/day-of), a per-notice document checklist, and an encrypted local vault of recurring proof documents so recertification is a 10-minute task instead of a 3-hour scramble. |
| **4** | **Deliver** | Offline directory: where to submit, hours, languages spoken, what to bring, whether you need an appointment. |

### The three features that will win it

- **Appeal + aid-paid-pending clock.** When a notice is a denial/reduction/termination, Carta starts *two* clocks: the appeal deadline, and the much shorter window to request a hearing **with benefits continued at the prior level while the appeal is pending**. In California that is roughly 10 days from the notice date. Almost nobody knows this rule exists, and missing it by a day is the difference between keeping groceries for three months and not. *(Verify current CDSS guidance before shipping — do not hardcode a number you haven't sourced.)*
- **The network test.** A unit test that fails the build if notice processing ever opens a socket. In the video: open the network inspector, process a notice, show zero requests.
- **The readability gate.** CI fails if any user-facing explanation string scores above 6th-grade Flesch–Kincaid. You are not claiming plain language; you are enforcing it.

---

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React Native + Expo (dev client)** | **Not Expo Go** — native modules required. Use `expo-dev-client` + EAS free tier. **iOS is the primary target**; keep Android building but don't spend time on Android-specific polish. |
| Language | TypeScript, strict mode | |
| Navigation | `expo-router` | File-based. |
| Camera | `expo-camera` | |
| Image prep | `expo-image-manipulator` | Rotate, crop, grayscale, resize before OCR. |
| **OCR** | `expo-ocr-kit` (preferred) or `expo-mlkit-ocr` / `rn-mlkit-ocr` | Prefer whichever uses **Apple Vision on iOS** and ML Kit on Android — Vision is excellent, built into the OS, needs no bundled model, and keeps the app small. Fully on-device, free, no quota. **Must return bounding boxes** — spatial anchoring depends on it; verify the output shape in Week 1 before designing around it. Do not use `react-native-mlkit-ocr` (unmaintained). |
| **Local LLM** (optional) | `llama.rn` | llama.cpp binding. Metal on iOS, CPU on Android. Only used for Layer 3 fallback. |
| Model | **Qwen2.5-1.5B-Instruct GGUF, Q4_K_M** (~1 GB) | Apache 2.0 — no license ambiguity, unlike Llama. Fall back to Qwen2.5-0.5B on low-RAM devices. **Downloaded on demand, not bundled.** |
| DB | `@op-engineering/op-sqlite` with **SQLCipher** | Key in `expo-secure-store`. Fall back to `expo-sqlite` if integration fights you — but then encrypt file blobs manually. |
| Files | `expo-file-system` | App sandbox only. Never MediaLibrary — captured notices must not land in the camera roll. |
| Reminders | `expo-notifications`, **local scheduled only** | No push tokens, no FCM/APNs server, no Expo push service. Works airplane-mode. |
| i18n | `i18next` + `react-i18next` | **en + es only.** Architecture supports more; scope stays at two. |
| State | Zustand | Keep it boring. |
| Testing | Jest + `@testing-library/react-native` | Plus the custom gates in §8. |

**Static bundled data (no server):** program metadata, notice templates, explanation content, office directory — all versioned JSON in `/content`. Optionally refreshable later from a signed static file on GitHub Pages; **do not build that in v1.**

---

## 4. The parsing cascade — core architecture

This is the engineering story. Build it as four explicit, independently testable layers with a confidence score at each, degrading gracefully. **The user confirms the result regardless of which layer produced it.**

```
Photo
 └─> preprocess (deskew, grayscale, contrast, resize)
      └─> ML Kit OCR → { blocks, lines, elements, bounding boxes }
           └─> REDACT (§5) — strip SSN before anything is persisted
                ├─ L0  Form fingerprint      → confidence 0.95   deterministic
                ├─ L1  Spatial anchoring     → confidence 0.85   deterministic
                ├─ L2  Generic heuristics    → confidence 0.60   deterministic
                └─ L3  Local LLM (opt-in)    → confidence 0.50   flagged as AI
                     └─> L4  Human confirmation screen  → confidence 1.00
                          └─> schedule reminders, build checklist
```

### Layer 0 — Form fingerprint *(highest confidence, build first)*

California benefit notices carry a printed form ID. Regex the OCR text against a registry; a hit means you know the document's exact layout and can extract fields deterministically.

Priority templates (**verify current form IDs against the CDSS forms library — they get revised**):

| Form | Program | Why it matters |
|---|---|---|
| **SAR 7** — Semi-Annual Eligibility/Status Report | CalFresh, CalWORKs | **Build this first.** A missed SAR 7 is a leading cause of discontinuance. It is the single highest-value document in the app. |
| **CF 377.5** — Notice of Expiration of Certification | CalFresh | Recertification trigger. |
| **NA 960** series | CalFresh | Notices of Action: approval, denial, change, discontinuance. |
| **MC 210 RV** | Medi-Cal | Annual redetermination. |
| **MC 239** series | Medi-Cal | Notices of Action. |
| **CW 2200** | CalWORKs | Request for verification. |
| **HUD-50058** / PHA annual recert | Housing voucher | Housing authority letters vary by PHA; handle at L1/L2. |
| SSA notices | SSI/SSDI | Distinct letterhead, non-form layout. |

Template registry entry:

```ts
interface NoticeTemplate {
  id: string;                       // "CA-SAR7-2024"
  programId: ProgramId;
  agency: string;
  fingerprint: RegExp[];            // ALL must match for a hit
  negativeFingerprint?: RegExp[];   // disambiguate near-identical forms
  fields: FieldExtractor[];
  actionTypeRule: (t: OcrResult) => ActionType;
  deadlineRule: DeadlineRule;       // absolute date | issueDate + N days
  requiredDocs: DocTypeId[];        // conditional on checkbox state
  citation: { title: string; url: string };  // eCFR / CDSS MPP
  appealRules: { appealDays: number; aidPaidPendingDays: number };
}
```

### Layer 1 — Spatial anchoring

For known-family-but-unmatched layouts: find a label ("Due Date", "Fecha límite", "Effective Date", "Case Number"), then read the nearest value to its right or below using bounding-box geometry. Handles form revisions without a new template.

### Layer 2 — Generic heuristics

Works on any letter, including ones you've never seen:

- **Date battery** — MM/DD/YYYY, spelled months, ISO, and Spanish month names.
- **Deadline phrases** — `/by ([A-Z][a-z]+ \d{1,2}, \d{4})/`, "no later than", "within (\d+) days", "on or before", "antes del", "a más tardar".
- **Program lexicon** — CalFresh/SNAP/food stamps, Medi-Cal/Medicaid, CalWORKs/TANF, Section 8/HCV, SSI, WIC, LIHEAP, and the Spanish/Vietnamese equivalents.
- **Agency detection** — letterhead keywords + return-address block.
- **Action classification** — approval / denial / reduction / discontinuance / request-for-information / recertification-due. Keyword scoring with negation handling ("will **not** be discontinued").
- **Document requests** — bulleted or checkbox lines following "you must provide" / "please send" / "debe enviar".

### Layer 3 — Local LLM *(optional, opt-in, last resort)*

Only fires when L0–L2 confidence is below threshold. Never enabled by default.

- User must explicitly enable it and download the model (~1 GB, wifi-gated, with a clear size warning).
- **Constrained decoding with a GBNF grammar** so llama.cpp can only emit schema-valid JSON. This structurally prevents hallucinated field names and malformed output — mention it in the video, it's the sharpest technical detail in the project.
- Prompt contains only the OCR text *after* redaction.
- Every field it produces is badged **"AI-read — please check"** in the UI and rendered in a distinct color.
- Runs on a background thread with a hard timeout; falls back to "we couldn't read this — enter it yourself" rather than hanging.
- **If this layer is behind schedule in week 8, cut it.** L0–L2 plus manual entry is a complete, shippable product. It is the flex, not the foundation.

### Layer 4 — Human confirmation *(never skippable)*

Every field shown editable, with the source region of the photo highlighted when tapped. Low-confidence fields pre-focused. Nothing is scheduled until the user taps Confirm.

**Correction loop:** when a user edits an L0/L1-extracted field, log the (template, field, correction) locally. Surface these in a dev-only screen so you can fix templates from real failures. Never transmitted.

---

## 5. Privacy architecture

Not a feature list — an architecture. Every item below is demonstrable on stage.

1. **Zero network on document paths.** Enforced by test (§8.4).
2. **SSN never persisted.** Redact `\b\d{3}-?\d{2}-?\d{4}\b` (plus "SSN:"/"Social Security" adjacency) from OCR text *before* the first write. Store a boolean `containedSsn` for the UI to note it was scrubbed.
3. **Case numbers hashed.** Store `sha256(caseNumber + deviceSalt)` for matching notices to the same case, plus last 4 characters for display. The full number is never at rest.
4. **Encryption at rest.** SQLCipher; key generated on first launch, stored in `expo-secure-store` (Keychain / Android Keystore).
5. **Images sandboxed.** `expo-file-system` app directory. Never written to the camera roll. Optional setting: delete the source image after successful extraction.
6. **No accounts.** No email, no phone, no sign-in. Nothing to breach.
7. **No analytics SDK.** Events written to a local table for a user-visible debug screen only.
8. **Panic delete.** Settings → "Delete everything" wipes DB, files, keychain entry, and all scheduled notifications in one action, with confirmation.
9. **Immigration-status safe.** The app never asks for or stores immigration status. Explanation content includes a public-charge myth-buster (grounded in current USCIS policy text, cited) noting which programs are generally safe for mixed-status households — because in Santa Clara County, fear is as much a barrier as eligibility.

---

## 6. Data model

```sql
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  program_id TEXT NOT NULL,
  template_id TEXT,                    -- NULL if L2/L3
  agency TEXT,
  action_type TEXT NOT NULL,           -- approval|denial|reduction|discontinuance|info_request|recert_due
  notice_date INTEGER,
  effective_date INTEGER,
  deadline_date INTEGER,
  appeal_deadline INTEGER,             -- NULL if not appealable
  aid_paid_pending_deadline INTEGER,   -- the short, critical clock
  case_hash TEXT,
  case_last4 TEXT,
  confidence REAL NOT NULL,
  extraction_layer INTEGER NOT NULL,   -- 0|1|2|3, 4 once user-confirmed
  contained_ssn INTEGER DEFAULT 0,
  image_ref TEXT,
  ocr_ref TEXT,                        -- redacted text, encrypted
  status TEXT NOT NULL,                -- pending_review|active|completed|dismissed|expired
  locale TEXT
);

CREATE TABLE requirements (            -- checklist items per notice
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  doc_type_id TEXT NOT NULL,
  label TEXT NOT NULL,
  satisfied_by_document_id TEXT REFERENCES documents(id),
  status TEXT NOT NULL                 -- needed|attached|submitted|na
);

CREATE TABLE documents (               -- the vault
  id TEXT PRIMARY KEY,
  doc_type_id TEXT NOT NULL,           -- pay_stub|lease|photo_id|utility_bill|bank_stmt|...
  label TEXT NOT NULL,
  file_ref TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  covers_period_start INTEGER,
  covers_period_end INTEGER,
  expires_at INTEGER                   -- e.g. pay stubs go stale at 30/45 days
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  fire_at INTEGER NOT NULL,
  tier TEXT NOT NULL,                  -- t30|t14|t7|t3|t1|day_of|appeal_urgent
  os_notification_id TEXT,
  state TEXT NOT NULL                  -- scheduled|fired|cancelled
);

CREATE TABLE corrections (             -- local-only template improvement log
  id TEXT PRIMARY KEY, template_id TEXT, field_id TEXT,
  extracted TEXT, corrected TEXT, created_at INTEGER
);
```

**Static content** (`/content`, bundled, not in DB): `programs.json`, `templates/*.ts`, `explanations/{locale}/*.json`, `doc_types.json`, `offices.json`.

### Reminder ladder

On confirmation, schedule from `deadline_date`: **T-30, T-14, T-7, T-3, T-1, day-of at 9am local.** Suppress tiers already in the past. If `aid_paid_pending_deadline` exists, schedule a separate, visually distinct **urgent** reminder at T-2 days and T-1 with different copy. Cancel the whole ladder when the user marks the notice submitted. Re-schedule everything on locale change (notification bodies are localized at schedule time).

---

## 7. Screens

| Screen | Purpose | Key details |
|---|---|---|
| **Home** | One card per active benefit | Largest element is the countdown to the nearest deadline. Color-coded: green >14d, amber 3–14d, red <3d. Empty state teaches capture. |
| **Capture** | Camera | Edge-detection guide overlay, multi-page support, torch toggle, "take from library" fallback. Show a live "text detected ✓" indicator so users know the shot is good *before* they leave the screen. |
| **Review** | Confirm extraction | Field list with confidence badges. Tapping a field highlights its bounding box on the photo. Low-confidence fields pre-focused. AI-read fields visually distinct. |
| **Notice Detail** | The decode | Four fixed sections: **What this says · What you must do · By when · How to appeal.** Regulation citation at the bottom with a link. Toggle to view original photo. |
| **Checklist** | Required docs | Each item: attach from vault, capture new, or mark N/A. Progress ring. "You're ready" state with a submit-method chooser. |
| **Vault** | Recurring documents | Grouped by type, expiry warnings ("this pay stub is 47 days old — most offices want the last 30"). |
| **Where to Go** | Last mile | Offline list/map of county offices, SSA field offices, community orgs. Hours, walk-in vs. appointment, languages, **what to bring** pre-filled from the current checklist. Mail and online-portal options too. |
| **Settings** | Control | Language, reminder times, local AI model (download/delete, with size + what-it-does explanation), privacy explainer, **Delete everything**. |

**Design constraints, non-negotiable:** works one-handed; minimum 16pt body text with Dynamic Type support; every interactive element ≥44pt; full screen-reader labels; no timeouts anywhere; every screen usable in airplane mode; all copy ≤6th-grade reading level in both languages.

---

## 8. Verification

### 8.1 Golden corpus — generated, not collected
Build **30+ synthetic test notices without leaving your desk.** Download blank public forms from the CDSS forms library, fill them programmatically with fictional data (`pdf-lib`), render to PNG, then apply **synthetic distortion** in a script: perspective warp, rotation ±15°, gaussian blur, JPEG artifacts, uneven lighting gradients, shadow overlays, and paper-crease textures. One clean render becomes a dozen realistic test photos, with ground-truth labels for free since you generated the field values.

Supplement with ~10 real hand-held photos of the printed forms if you have a printer — but the generator is the backbone, and it's more rigorous than manual photography anyway because the distortion parameters are reproducible.

**Never use a real person's benefit notice.** Commit images + expected-extraction JSON.

### 8.2 Extraction metrics
Per template, per field: precision/recall against the golden corpus. Print a table in CI. **Ship-gate: ≥90% field accuracy on L0 templates.** Put this table in the README — quantified self-evaluation is rare in high-school submissions and reads as real engineering.

### 8.3 Readability gate
CI script scores every string in `explanations/en/*.json` with Flesch–Kincaid. **Fail the build above grade 6.** For Spanish, use Fernández-Huerta (the Spanish-adapted equivalent) with the same gate.

### 8.4 The network test ⭐
Jest suite that monkey-patches `fetch`, `XMLHttpRequest`, and the RN networking bridge to throw, then runs the full pipeline (capture → OCR → parse → persist → schedule) on the golden corpus. **Any network attempt fails the build.** Name it `no-network.test.ts` and reference it by filename in the README and the video.

### 8.5 Also
- Reminder scheduling snapshot tests, including DST boundaries and past-deadline suppression.
- Redaction tests: SSN in 8 formats must never appear in DB or files.
- Accessibility audit with the RN a11y inspector; log results in `A11Y.md`.
- Device matrix: **your iPhone (primary — this is what gets filmed)**, iOS simulator, and one Android emulator smoke test per milestone to confirm nothing platform-specific has broken. Don't buy a test device.

---

## 9. Eleven-week plan

Solo build. No outreach, no interviews, no recruiting testers — everything below is doable alone at a desk.

| Week | Dates | Deliverable |
|---|---|---|
| **1** | Aug 11–17 | Register on the CAC portal (required, takes 10 min). Expo dev-client scaffold building on both platforms. `expo-mlkit-ocr` spiking successfully on a real photo. Download blank CDSS forms and build the synthetic corpus generator (§8.1). |
| **2** | Aug 18–24 | Capture → preprocess → OCR → raw text on screen. SQLCipher DB + schema. Redaction module with tests. |
| **3** | Aug 25–31 | Layer 0: template registry + **SAR 7** template end to end. Layer 4 confirmation screen. Extraction metrics harness running. |
| **4** | Sep 1–7 | Templates for CF 377.5, NA 960, MC 210 RV, MC 239. Layer 1 spatial anchoring. Deadline + appeal + aid-paid-pending computation. |
| **5** | Sep 8–14 | Layer 2 heuristics. Reminder ladder + local notifications. Checklist + document vault. |
| **6** | Sep 15–21 | Explanation content library (English), citations, Notice Detail screen. Readability gate in CI. `no-network.test.ts`. |
| **7** | Sep 22–28 | Spanish localization. Where-to-Go offline directory. Accessibility pass. |
| **8** | Sep 29–Oct 5 | Layer 3 local LLM with GBNF grammar — **or cut it and polish instead.** Decide by Oct 1 and don't relitigate. |
| **9** | Oct 6–12 | Self-QA on iPhone + Android emulator. Run the full golden corpus, fix the worst extraction failures. Cut anything half-finished. |
| **10** | Oct 13–19 | Freeze features. README + architecture diagram + metrics table + open-source dependency list + AI disclosure. Public GitHub repo. **Film and edit the video (§12.1). Draft the six written answers (§12.2).** |
| **11** | Oct 20–26 | **Submit by Oct 20–21.** The portal jams near the deadline, and after the deadline the submission cannot be modified at all. Buffer only. |

---

## 10. Scope guard — do NOT build

Cut these on sight. They are how this project dies.

- ❌ Any backend, account system, or cloud sync
- ❌ Auto-filling or auto-submitting government forms *(liability, and it wrecks the trust story)*
- ❌ Eligibility screening — that's a different app, and it's what everyone else is building
- ❌ A chatbot interface
- ❌ Multi-user / household sharing
- ❌ Languages beyond English and Spanish
- ❌ A web version
- ❌ Content-update-over-the-air infrastructure
- ❌ Any dependency requiring a paid tier
- ❌ Landing pages, marketing sites, app-store listings, social accounts — the submission is a repo, a build, and a video

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Can't obtain real notice samples | Synthetic corpus generated from public blank forms (§8.1). This is sufficient — don't chase real samples. |
| Local LLM too slow or unstable | Lower risk on iOS — `llama.rn` uses Metal, and Qwen2.5-1.5B Q4 is comfortable on a modern iPhone. Still opt-in and non-essential: ship without it if needed, L0–L2 + manual entry is a complete product. |
| Form IDs are wrong or outdated | Verify every ID against the current CDSS forms library in week 1. Never hardcode a citation you haven't opened. |
| Aid-paid-pending deadline stated incorrectly | This is the highest-stakes number in the app. Source it, cite it, and pair every instance with "confirm with your county — this is not legal advice." |
| SQLCipher integration burns days | Timebox to 2 days. Fall back to `expo-sqlite` + manual blob encryption. |
| Translation quality | **Ship English + Spanish only.** Two languages done carefully beats five done sloppily, and the README should say the rest is future work. Spanish content should reuse the official Spanish wording from the bilingual CDSS forms wherever possible rather than being translated from scratch. |

**Ethical guardrails:** ship a persistent, non-dismissible disclaimer that Carta is not legal advice and does not communicate with any agency; always show the original document alongside the interpretation; never tell a user they are ineligible; when confidence is low, say so plainly rather than guessing.

---

## 12. The actual submission

Per the 2026 official rules. **The submission is a video plus six written answers.** Judges — the Member of Congress and their office — evaluate those. They *may* request access to the app and source code to verify it works (refusing = immediate disqualification), but they will not install an iOS build as a matter of course.

**This is why iPhone-only is fine.** Nobody is sideloading your app. The video is the product as far as judging is concerned. Build for your own device, film it beautifully, and have a public repo ready if they ask.

### 12.1 Demonstration video — 1 to 3 minutes, MUST be public on YouTube or Vimeo

The rules specify required content. Missing any of these is free points lost. **Target 2:30.**

| Required element | Where it goes |
|---|---|
| Name(s) of each participant | On screen + spoken, first 10 seconds |
| Name of the app | Same |
| Purpose, **in one clear sentence** | Rules say one sentence — write it, time it, don't ramble |
| Target audience | Immediately after the purpose |
| **Tools and coding languages used** | Explicit callout — say "React Native, TypeScript, Swift/Objective-C native modules, Apple Vision, llama.cpp" out loud |
| Showcase of functionality | The bulk of the runtime |

**Script (2:30):**

| Time | Content |
|---|---|
| **0:00–0:15** | Your name, app name. Purpose in one sentence: *"Carta reads government benefit letters and makes sure you never lose your benefits to a missed deadline."* Audience: people receiving CalFresh, Medi-Cal, or housing assistance — especially those juggling multiple programs. |
| **0:15–0:35** | The problem. Most people who lose these benefits are **still eligible** — they got dropped for paperwork. Show a real SAR 7 form on screen and let the viewer see how dense it is. |
| **0:35–1:45** | Live demo, filmed on your iPhone: photograph the notice → fields extracted with confidence badges → confirm → plain-language decode → Spanish toggle → checklist → reminder scheduled. **Put the phone in airplane mode and make sure the viewer clearly sees the airplane icon in the status bar the whole time.** |
| **1:45–2:10** | Tools and architecture. Name the languages and frameworks explicitly. Show the four-layer cascade diagram. Show `no-network.test.ts` going green. Say "zero servers, zero cost, zero data collected." |
| **2:10–2:30** | Extraction metrics table with real numbers on 30+ test notices. Close: *"The problem was never eligibility. It was the mail."* |

**Production notes:** screen-record on the iPhone (Control Center recorder), don't film the screen with another camera. Record voiceover separately in a quiet room. Set the video to **public**, not unlisted — the rules require public.

### 12.2 The six written questions

These are scored alongside the video. Draft them in Week 10, not the night before.

1. **Title of your app** — Carta.
2. **Explain the app's purpose** — the one sentence from the video, expanded to a short paragraph.
3. **What inspired you to create this app?** — be honest and specific. The churn insight is the story: you learned that most benefit terminations are procedural, not eligibility-based, and realized every app in this space is built for signup instead of retention.
4. **What technical/coding difficulty did you face, and how did you address it?** — ⭐ **This is the highest-leverage question in the entire submission.** It maps directly to the "excellence of coding" rubric axis. Answer with the parsing cascade: OCR output on a photographed form is noisy and spatially scrambled, a naive regex over raw text fails, and a language model alone hallucinates fields. Describe the four-layer solution, the confidence thresholds, GBNF grammar-constrained decoding forcing schema-valid output, and the golden-corpus metrics that let you measure whether changes helped. **Name real numbers.** Keep a running notes file all build long so you can write this from evidence.
5. **What did you learn?** — specific technical and non-technical lessons.
6. **What would you change in 2.0?** — the honest cut list: more languages, more form templates, Android polish, a shared household mode.

### 12.3 Also required

- **Source code submitted online** — public GitHub repo, README with architecture diagram, extraction metrics table, and a documented list of every open-source library used (the rules explicitly require documenting external tools).
- **Exit questionnaire** after the deadline.
- Register with a **personal email, not a school email** (rules requirement), plus a parent/guardian contact.

---

## 13. AI usage disclosure — read this carefully

The 2026 rules address this directly, and it constrains how you use Claude Code:

> *"The use of AI tools in app development is permitted, provided that all AI usage is fully disclosed in the submission materials. AI may only be used to support specific aspects of the project and must not constitute the entirety of the technical development. Participants are expected to demonstrate significant individual contributions and technical understanding of their app."*

And separately: *"All coding and technical development must be done by the student or student team."*

So: **using Claude Code is allowed. Handing it the whole build and submitting the output is not.** Two reasons this matters practically, beyond the rule itself — judges may request source access and ask you about it, and question 4 above is unanswerable if you didn't do the work.

**How to stay clearly on the right side:**

- **Own the extraction layer yourself.** `/src/extraction` is the intellectual core of this project — the cascade design, the templates, the confidence thresholds, the heuristics. Write it, or at minimum rewrite and deeply understand everything AI drafts there. Let AI carry more of the scaffolding, styling, and boilerplate.
- **Keep a decision log.** A running `NOTES.md`: what you tried, what broke, what you chose and why. This is where question 4's answer comes from, and it is the artifact that proves the understanding is yours.
- **Never merge code you can't explain line by line.** If a judge points at a function and asks what it does, you answer immediately. That's the bar. If you can't, delete it and write it yourself.
- **Disclose specifically, in both the README and the submission.** Not "I used AI" — something like: *"Claude Code was used for project scaffolding, UI component boilerplate, and test harness setup. The parsing cascade architecture, notice templates, extraction heuristics, and confidence model were designed and implemented by me."* Make that statement true.

Full disclosure costs nothing and reads as maturity. Undisclosed AI use that surfaces during a source-code review ends the submission.

---

---

## 14. Sources to verify in week 1

- CDSS forms library — confirm SAR 7, CF 377.5, NA 960, CW 2200 IDs and current revisions
- DHCS / Medi-Cal — MC 210 RV, MC 239
- CDSS state hearings — appeal window and aid-paid-pending rule, exact language
- eCFR API (`ecfr.gov/developers`) — 7 CFR 273 (SNAP), 42 CFR 435 (Medicaid) for citations
- USCIS public charge policy — current text for the myth-buster content
- Santa Clara County Social Services Agency — office locations, hours, languages
- `expo-mlkit-ocr` / `rn-mlkit-ocr` — confirm bounding-box output shape before committing
- `llama.rn` — confirm GBNF grammar support in the current version
