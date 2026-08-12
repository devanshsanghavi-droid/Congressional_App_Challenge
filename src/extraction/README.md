# /src/extraction — the parsing cascade

**Authorship.** This directory is written by Devansh. Per SPEC.md §13 and
CLAUDE.md, the cascade design, the notice templates, the extraction heuristics,
and the confidence model are the student's own work. Claude reviews, critiques,
and builds the harness around it, and any file it touches in here says so at the
top.

## What lives here

The four-layer cascade from SPEC.md §4. Layers are independently testable and
each returns a confidence score:

| Layer | Method | Confidence |
|---|---|---|
| L0 | Form fingerprint — match a printed form ID, then extract deterministically | 0.95 |
| L1 | Spatial anchoring — find a label, read the nearest value by bounding-box geometry | 0.85 |
| L2 | Generic heuristics — date battery, deadline phrases, program lexicon, action classification | 0.60 |
| L3 | Local LLM, opt-in, grammar-constrained (optional; cut if not working by Oct 1) | 0.50 |
| L4 | Human confirmation — never skippable | 1.00 |

Notice templates are **data**, not code (`/content/templates/*.ts`). Adding
support for a new form means adding a file. It never means editing the parser.

## The island rule

This code must run unchanged in two places: on the phone, and in plain Node
against the golden corpus. So it imports nothing platform-specific and reaches
for no global. OCR text, bounding boxes, a template, and a clock all arrive as
arguments.

That is not a convention here, it is enforced three ways, deliberately:

1. **`tsconfig.json` in this directory** sets `"lib": ["ES2022"]` and
   `"types": []`. No DOM means `fetch`, `XMLHttpRequest` and `WebSocket` are not
   declared, so reaching for the network is a compile error
   (`TS2304: Cannot find name 'fetch'`). No ambient types means no `require`,
   no `process`, no JSX.
2. **`eslint.config.js`** bans `react`, `react-native`, `expo-*`, app-side
   `@/lib/*` imports, and Node built-ins in this directory.
3. **`tests/node/extraction-island.test.ts`** reads the files on disk and fails
   `npm test` if either rule is broken, whether or not the offending code
   typechecks.

**These are not three redundant copies of one check** — that was verified by
probe, not assumed (NOTES.md, 2026-08-11). The tsconfig rejects a bare `fetch`,
but a file that imports `react-native` pulls in React Native's global type
declarations, which re-declare `fetch`, and the error vanishes. So rule 1 holds
only while rule 2 holds: the lint rule is what prevents the import that would
smuggle the globals back in. Rule 3 catches both from a third direction, on
disk, on every `npm test`.

If extraction stops being portable, the golden-corpus harness stops running, and
that harness is the only way to know whether a change to a template made
accuracy better or worse — which is the basis of the metrics table in the README
and of written answer #4.

## Running the tests

```bash
npm run test:node    # this directory + /content/templates + /tools, in bare Node
npm run typecheck    # app config, then this directory's stricter config
```

No simulator, no camera, no device needed.
