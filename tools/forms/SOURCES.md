# Blank form sources

Source PDFs for the synthetic golden corpus (SPEC.md §8.1). Every one is a
**blank public form** published by the State of California. They are filled with
**fictional data** by `/tools` to build the corpus.

> **Never use a real person's benefit notice.** Not for testing, not for a
> screenshot, not once. CLAUDE.md and SPEC.md §8.1 both forbid it, and
> `.gitignore` blocks `**/real-notices/` and `*.real.pdf` as a backstop.

Run `bash tools/forms/fetch-forms.sh` to download everything and verify each
file is a real PDF.

## Priority 1 — Layer 0 is built against these

| Form | Program | URL |
|---|---|---|
| SAR 7 — Semi-Annual Eligibility Status Report | CalFresh / CalWORKs | `https://www.cdss.ca.gov/cdssweb/entres/forms/english/sar7.pdf` |
| SAR 7 Addendum | CalFresh / CalWORKs | `https://www.cdss.ca.gov/cdssweb/entres/forms/english/sar7addendum.pdf` |
| SAR 7A — "How to Fill Out Your SAR 7" | — | `https://www.cdss.ca.gov/cdssweb/entres/forms/english/sar7a.pdf` |
| NA 960X SAR — Notice of Action | CalFresh | `https://www.cdss.ca.gov/cdssweb/entres/forms/English/NA960X_SAR.pdf` |
| NA 960Y SAR — Notice of Action | CalFresh | `https://www.cdss.ca.gov/cdssweb/entres/forms/English/NA960Y_SAR.pdf` |
| CF 377.6 — Information/Verification Needed | CalFresh | `https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf377.6.pdf` |
| MC 210 — Medi-Cal redetermination | Medi-Cal (DHCS) | `https://dhcs.ca.gov/formsandpubs/forms/Forms/MC-210-ENG.pdf` |

Alternate SAR 7 mirror if the primary 404s:
`https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/Q-T/sar7.pdf`

## URL pattern

Most CDSS forms follow:

```
https://www.cdss.ca.gov/cdssweb/entres/forms/english/{formid}.pdf
```

lowercased, dots kept, spaces removed — so `CF 377.5` → `cf377.5.pdf`. Guess
first, fall back to the index.

## Indexes

- CDSS forms by program — https://www.cdss.ca.gov/inforesources/forms-brochures/forms-by-program
- CalFresh forms and brochures — https://cdss.ca.gov/inforesources/calfresh/forms-and-brochures
- **CDSS translated forms, Spanish** — https://www.cdss.ca.gov/inforesources/forms-brochures/translated-forms-and-publications/spanish
- DHCS Medi-Cal forms — https://dhcs.ca.gov/formsandpubs

## Why the Spanish index matters

CDSS publishes official Spanish translations of these exact forms. That hands us
the state's own approved wording for every field label and standard notice
phrase — authoritative, and better than anything we would translate ourselves.

Two consequences, both decided on Day 0 and both cheaper now than in Week 7:

1. **Spanish field labels come from the state, not from us.** Explanation
   content still has to be written, but the vocabulary is given.
2. **Layer 0 fingerprints are bilingual from the start.** Real notices are
   frequently printed in English and Spanish on the same page, so template
   fingerprints carry Spanish label variants and Vision runs with
   `recognitionLanguages = ["en-US", "es-ES"]` from the first spike.

## Revision codes

Every CDSS form prints a revision code, usually bottom-left, like `SAR 7 (5/25)`.
Template IDs are pinned to the revision they were built against, because forms
get revised and a fingerprint written for one revision may not match the next.

After downloading, run:

```bash
npx tsx tools/forms/read-revisions.ts     # once /tools has its deps
```

and record the results in NOTES.md. Until then they are recorded by hand.

| File | Revision code | Recorded |
|---|---|---|
| sar7.pdf | _pending_ | — |
| sar7addendum.pdf | _pending_ | — |
| sar7a.pdf | _pending_ | — |
| na960x_sar.pdf | _pending_ | — |
| na960y_sar.pdf | _pending_ | — |
| cf377.6.pdf | _pending_ | — |
| mc210.pdf | _pending_ | — |

## Note on downloading

`cdss.ca.gov` and `dhcs.ca.gov` block automated/datacenter traffic. `cdss.ca.gov`
drops the TCP connection outright; `dhcs.ca.gov` serves an Imperva/Incapsula
challenge page. If `fetch-forms.sh` fails, download them by hand in a browser —
it takes about two minutes — and drop them in this directory with the filenames
in the table above.
