# Corpus extension — names the frozen corpus does not contain

**Not part of the corpus. Never merged into its numbers.**

The frozen corpus has ten recipient names and every one of them is unaccented and
upper-case — including `ROSA MARTINEZ CRUZ` and `JOSE RAMIREZ`, two that would
carry accents in life. Santa Clara County is heavily Latino and Vietnamese. So a
`recipient_name` figure measured on that corpus overstates accuracy for precisely
the households Carta exists for, and no amount of care in the parser shows up as
a difference in the number.

This set exists to give that failure somewhere to appear.

| notice | name | what it adds |
|---|---|---|
| `ext-01` | `JOSÉ RAMÍREZ` | accented Latin capitals; agency return address with its own CA ZIP printed **above** the recipient's |
| `ext-02` | `Nguyễn Thị Lan` | Vietnamese tone marks, mixed case |
| `ext-03` | `Ana María Delgado-Cruz` | hyphenated compound surname, accent, mixed case; both appeal clocks printed |

## Two things it is not

**It is not photographed.** These are hand-authored lines with hand-authored
boxes. The OCR ceiling is 100% by construction, so a number from this set is a
claim about the *parser* and about nothing else. It must never be quoted beside
the photographed figure as though the two measured the same thing.

**It is not a corpus edit.** The frozen corpus stays exactly as it was on
2026-08-19, so every number measured against it before and after this file
remains comparable. A corpus edited after seeing which cases fail is a corpus
fitted to the extractor.

## Why it was written before the matcher

It was committed **before a single line of `/src/extraction` existed** — git
history is the evidence, not this sentence. A fixture authored after seeing what
the code catches tests the code's own assumptions back at it; the only way to
avoid that is ordering, and the only way to prove the ordering is the log.
