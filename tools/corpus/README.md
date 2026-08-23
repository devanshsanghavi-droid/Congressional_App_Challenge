# Carta evaluation corpus

Test data for the notice-extraction pipeline. **Read `MANIFEST.md` for the full per-file breakdown.**

## Layout

```
tools/corpus/
├── README.md                    this file
├── MANIFEST.md                  per-file detail, conditions, caveats
├── ground_truth.json            every field on all 10 notices
├── notices/
│   ├── 01..10-*.pdf             the source notices
│   └── ALL-NOTICES-print-me.pdf 10-page print master
├── photos/
│   ├── *.jpg                    23 real captures, 2000px wide
│   └── synthetic/
│       ├── *.jpg                56 degraded variants, 1700px wide
│       └── synthetic_manifest.json
└── tools/
    ├── make_corpus.py           regenerates the notice PDFs
    └── degrade.py               regenerates the synthetic variants
```

## What this is

Ten fictional California benefit notices spanning five agencies — Santa Clara County DSS, Santa Clara County HHSA, DHCS, SSA, and the county Housing Authority — in English, Spanish, and bilingual layouts.

**All data is fictional.** Names, case numbers, addresses, and dollar amounts are invented. Layouts are plausible reconstructions in the house style of California benefit notices, not copies of official forms. The corpus was generated rather than collected because real benefit notices contain other people's Social Security numbers.

## The two buckets

| Bucket | Count | What it measures |
|---|---|---|
| **Real captures** | 23 | Printed on paper, photographed on an iPhone under 5 physical conditions: flat/bright, dim, angled, creased, shadowed. **This is the headline accuracy number.** |
| **Synthetic** | 56 | Blur, noise, underexposure, and JPEG artifacts applied in software to the 8 clean captures. **Robustness supplement — score separately.** |

Never merge them into a single accuracy figure.

## Why blur is synthetic

iPhone computational photography (Deep Fusion / Smart HDR) detects text and sharpens it after capture. Genuine motion blur is effectively uncapturable with the stock camera — every attempt came back near-sharp. `photos/cf3776-blur-11.jpg` is the evidence: shot as a blur test, repaired by the pipeline.

Blur and sensor noise are therefore parameterized in `tools/degrade.py` with a fixed seed. Skew, crease, shadow, and low light remain real captures, because the phone doesn't undo those.

## Two things the harness must assert

1. **Notices 01 and 02 are the same case.** Maria Reyes, case 01-4472-9931. Notice 02 is the discontinuance caused by the missed SAR 7 deadline in notice 01. They should chain in the data model.

2. **Notice 10 is an approval.** Good news, no deadline pressure. Assert the app does *not* produce a red countdown or an urgent reminder for it. That's a logic test, not an OCR test.

## The controlled comparison

`sar7-clean-01`, `sar7-dim-02`, `sar7-angled-03`, `sar7-shadow-05`, and `sar7-creased-04` are **the same physical sheet under five conditions with identical ground truth.** Any accuracy delta across those five is purely the condition, not the document. That isolation is the most defensible measurement in the corpus and belongs in the README of the project itself.
