# Handoff to Claude Code

## Setup

```bash
mkdir carta && cd carta && git init
# copy SPEC.md and CLAUDE.md into this folder
claude
```

Claude Code reads `CLAUDE.md` automatically every session. `SPEC.md` is the full reference. This file is just for you.

---

## Session 1 — copy-paste this

```
Read CLAUDE.md and SPEC.md in full before writing any code.

Context: this is my Congressional App Challenge 2026 entry, solo, due Oct 26. I develop
and demo on an iPhone — iOS is the primary target, Android just needs to keep compiling.
Judges evaluate a 1-3 minute demo video plus written answers; they may request source
access. So optimize for "ships, demos well on iPhone, and the code holds up if someone
reads it."

Important on authorship: the CAC rules permit AI assistance but require it to be
disclosed and to not constitute the entirety of the technical development. Follow the
"Working style" section in CLAUDE.md. Specifically — /src/extraction is mine to write.
Design it with me, review it, critique it, but don't autonomously produce the parsing
cascade, the notice templates, or the heuristics. Everywhere else you can drive. And
explain things well enough that I can answer "what does this function do" without
looking.

Start with Week 1 from SPEC.md section 9:

1. Scaffold an Expo project with expo-dev-client, TypeScript strict, expo-router, and
   the dependencies from SPEC.md section 3. Get it building on my iPhone via a dev
   build, and confirm the Android emulator still compiles. Not Expo Go.

2. Wire a minimal capture-to-OCR spike: expo-camera -> expo-image-manipulator
   preprocessing -> on-device text recognition (Apple Vision on iOS) -> dump the raw
   blocks/lines/elements with bounding boxes to the screen. I need to see the actual
   bounding box output shape before we design the extraction layer around it. Evaluate
   expo-ocr-kit vs expo-mlkit-ocr vs rn-mlkit-ocr and tell me which one actually gives
   usable geometry on iOS — don't just pick the first one.

3. Build the synthetic corpus generator from SPEC.md section 8.1 as a standalone Node
   script in /tools: take a blank CDSS form PDF, fill it with fictional data via pdf-lib,
   render to PNG, and emit N distorted variants (perspective warp, rotation, blur, JPEG
   artifacts, lighting gradients) with a ground-truth JSON of the field values.

Structure the repo so /src/extraction is pure TypeScript with no React and no native
imports — it must be unit-testable in plain Node against the corpus.

Also create NOTES.md and DEPENDENCIES.md and start maintaining them per CLAUDE.md.

Before writing code: give me your plan, tell me which OCR package you recommend and why,
and flag anything in the spec you think is wrong, unbuildable, or a bad idea. Don't
silently work around problems.

Confirm you understand the two hard rules: no network calls anywhere in the notice
pipeline, and no cloud LLM APIs of any kind.
```

---

## Every session after that

```
Read CLAUDE.md and SPEC.md. We're on Week N. Last session we finished X.
Today's deliverable is [the week's row from SPEC.md section 9].
Plan first, then implement. Append to NOTES.md when we're done.
```

When it proposes scope beyond that week, point it at SPEC.md §10 — the do-not-build list.

---

## Two dates you decide, not Claude

**Oct 1 — cut or keep the local LLM (Layer 3).** If GBNF-constrained inference isn't reliable on your iPhone by then, cut it and spend the week polishing. Layers 0–2 plus manual entry is a complete product. Don't let this eat October.

**Oct 12 — feature freeze.** Whatever's half-done gets deleted, not finished. A smaller app that works flawlessly in a 2:30 video beats a bigger one that stutters once.

---

## Submission checklist

Registration:
- [ ] Registered on the CAC portal — **personal email, not school email** (rules requirement)
- [ ] Parent/guardian name + email ready
- [ ] Home and school addresses with **9-digit** ZIPs

Deliverables:
- [ ] Public GitHub repo with source code
- [ ] README: architecture diagram, extraction metrics table, **open-source dependency list**, **AI usage disclosure**
- [ ] Video 1–3 min (target 2:30), **set to PUBLIC** on YouTube or Vimeo
- [ ] Video contains all six required elements: your name, app name, purpose in one sentence, target audience, tools/languages used, functionality showcase
- [ ] Six written answers drafted — especially #4, the technical-difficulty question
- [ ] App runnable on request (judges can demand access; refusing = disqualification)

Timing:
- [ ] **Submit Oct 20–21.** Hard deadline is Oct 26, 12:00 PM EDT / 9:00 AM PDT, and after it passes the submission cannot be modified at all.
- [ ] Exit questionnaire after the deadline
