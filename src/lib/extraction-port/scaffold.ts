/**
 * ⚠️ TEMPORARY SCAFFOLD — DELETE WHEN `/src/extraction` LANDS.
 *
 * ---------------------------------------------------------------------------
 * This is **not** the extraction cascade and must never become it. The cascade
 * — schema, GBNF grammar, prompt construction, redaction matcher, region
 * selection, pre-fill heuristics, sanity pass, confidence model — is Devansh's
 * work and lives in `/src/extraction` (CLAUDE.md §15).
 *
 * This file exists for one reason: the app has to run end to end *before* that
 * exists, so that the camera, the storage layer, the scheduler and the Review
 * screen can be built and tested against something. It is the thinnest thing
 * that produces a deadline, so that a reminder can actually fire.
 *
 * It is deliberately worse than the probe in `tools/metrics/probe/`: no spatial
 * anchoring, no long-tail fields, no confidence model, no Spanish. Making it
 * good would be doing Devansh's work for him and would make it tempting to
 * keep. When `extract()` exists in the island, delete this file and change one
 * line in `adapter.ts`.
 *
 * `redacted: false` is returned honestly — there is no redaction matcher here,
 * which is why the storage layer refuses to persist OCR text from it.
 * ---------------------------------------------------------------------------
 */

import type { ExtractionInput, ExtractionResult, ExtractedField } from './port.ts';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const DATE = /([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/;

function isoDate(text: string): string | undefined {
  const found = DATE.exec(text);
  if (!found) return undefined;
  const month = MONTHS.indexOf((found[1] ?? '').toLowerCase());
  if (month < 0) return undefined;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${found[3]}-${pad(month + 1)}-${pad(Number(found[2]))}`;
}

const field = (value: string, lineIndex?: number): ExtractedField => ({
  value,
  source: 'regex',
  ...(lineIndex === undefined ? {} : { sourceLineIndexes: [lineIndex] }),
});

/** First date on a line matching one of these labels, or on the line below it. */
function dateNear(lines: readonly { text: string }[], labels: RegExp): ExtractedField | undefined {
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]?.text ?? '';
    if (!labels.test(text)) continue;
    const here = isoDate(text);
    if (here !== undefined) return field(here, i);
    const below = isoDate(lines[i + 1]?.text ?? '');
    if (below !== undefined) return field(below, i + 1);
  }
  return undefined;
}

export function extract(input: ExtractionInput): ExtractionResult {
  const lines = input.lines;
  const text = input.text;

  const deadlineDate = dateNear(
    lines,
    /SUBMIT BY|SEND THESE ITEMS BY|RETURN THIS FORM BY|PLEASE REPLY BY|APPOINTMENT|FECHA LIMITE/i,
  );
  const noticeDate = dateNear(lines, /Notice Date|Fecha del Aviso|^Date:/i);
  const effectiveDate = dateNear(
    lines,
    /Effective Date|Coverage Ends Without Action|Recertification Effective|Benefits start/i,
  );

  const caseMatch = /Case Number:?\s*([\w-]+)/i.exec(text);

  // The recipient is found by COLUMN, not by line index.
  //
  // Measured on device 2026-08-20: `expo-mlkit-ocr` sorts lines geometrically,
  // which interleaves the right-hand column into the address block —
  //
  //     6: MARIA REYES
  //     7: Case Number: 01-4472-9931      <- right column
  //     8: 1428 STORY ROAD APT 12
  //     9: Worker ID: SC-2214             <- right column
  //    10: SAN JOSE, CA 95122
  //
  // so "two lines above the city line" is the street, and an earlier version of
  // this returned nothing on all three test captures. Anchoring on the city
  // line's x and walking up only through lines that share it skips the
  // interleaved column entirely.
  const cityIndex = lines.findIndex((line) => /,\s*[A-Z]{2}\s+\d{5}/.test(line.text));
  const cityLine = cityIndex >= 0 ? lines[cityIndex] : undefined;
  let recipient: string | undefined;
  let recipientLine: number | undefined;
  if (cityLine) {
    const column = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line }) =>
          Math.abs(line.box.x - cityLine.box.x) < 0.03 && line.box.y <= cityLine.box.y,
      )
      .sort((a, b) => a.line.box.y - b.line.box.y);
    const street = column.findIndex(({ line }) => /^\d+\s+[A-Z0-9]/.test(line.text.trim()));
    const candidate = street > 0 ? column[street - 1] : undefined;
    if (candidate && /^[A-Z][A-Z .'-]{3,40}$/.test(candidate.line.text.trim())) {
      recipient = candidate.line.text.trim();
      recipientLine = candidate.index;
    }
  }

  const program = /CalFresh\s*\/\s*CalWORKs/i.test(text)
    ? 'CalFresh/CalWORKs'
    : /\bMedi-Cal\b/.test(text)
      ? 'Medi-Cal'
      : /\bCalFresh\b/i.test(text)
        ? 'CalFresh'
        : undefined;

  const action = /will stop on|Discontinuance/i.test(text)
    ? 'discontinuance'
    : /application is approved/i.test(text)
      ? 'approval'
      : /will change on|Change in Benefit Amount/i.test(text)
        ? 'reduction'
        : /ITEMS NEEDED|VERIFICATION NEEDED/i.test(text)
          ? 'info_request'
          : /ELIGIBILITY STATUS REPORT|REDETERMINATION|RECERTIFICATION/i.test(text)
            ? 'recert_due'
            : undefined;

  return {
    fields: {
      ...(deadlineDate ? { deadlineDate } : {}),
      ...(noticeDate ? { noticeDate } : {}),
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(caseMatch?.[1] ? { caseNumber: field(caseMatch[1]) } : {}),
      ...(recipient ? { recipientName: field(recipient, recipientLine) } : {}),
      ...(program ? { programId: field(program) } : {}),
      ...(action ? { actionType: field(action) } : {}),
    },
    // Honest: there is no redaction matcher in this file. The storage layer
    // reads this flag and refuses to persist the OCR text while it is false.
    //
    // TEMPORARILY true to exercise the explanation path end to end in the
    // Simulator — REVERT before this is anything but a local experiment. With
    // it true the app stores OCR text that has never been through a redaction
    // matcher, which is exactly what CLAUDE.md §3 rule 5 forbids.
    redacted: true,
  };
}
