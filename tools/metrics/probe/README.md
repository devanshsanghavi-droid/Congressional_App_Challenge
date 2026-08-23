# tools/metrics/probe — deterministic feasibility probe

**Not shipping code. Must not be copied into `/src/extraction`.**

Answers one question: *how much of the deterministic extraction result survives
the move from clean digital text to photographed OCR?*

Devansh's `probe_deterministic.py` scored **100% precision / 95.5% recall** on
core fields against `pdftotext`. That is an upper bound — clean text, preserved
layout. This runs the same approach against the real OCR cache: 23 photographed
captures, nine physical conditions.

```bash
npm run probe            # both variants, core-field roll-up, condition breakdown
npm run probe:errors     # every wrong value, named
```

## Two variants, because the gap between them is the finding

| file | how a label finds its value |
|---|---|
| `text-only.ts` | regex over the joined text, windowed. The direct port. |
| `spatial.ts` | same patterns, plus bounding-box lookup: nearest line to the right on the same visual row. |

Reading order is **not** document order. On `na960x-clean-06` the recogniser
emits `"Notice Date"` as line 8 and `"SEPTEMBER 8, 2026"` as line 14 — six lines
apart, with three unrelated lines and two other dates in between. Their boxes
are at y = 0.292 and y = 0.292: **the same visual row.** No window setting over
the joined string recovers that; the geometry recovers it exactly.

That is SPEC §4's Layer 1 stated as a measurement.

## Authorship

`/src/extraction` is Devansh's (CLAUDE.md §15). This directory is an instrument,
deliberately probe-shaped: no confidence model, no template registry, no
provenance, no real error handling. It was also written with the ground truth
visible and fitted to ten notices, which is fine for an architecture decision
and disqualifying as a reported accuracy figure. The shipped cascade gets scored
through `npm run metrics` like anything else.
