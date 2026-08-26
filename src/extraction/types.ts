/**
 * The island's own view of its input.
 *
 * Declared here rather than imported from `src/lib/**` on purpose: this
 * directory must compile with `lib: ["ES2022"]` and `types: []` and must run
 * unchanged in bare Node against the corpus (CLAUDE.md §8). Importing an
 * app-side module would drag React Native's ambient declarations in with it —
 * which is exactly the hole the island rules exist to close, since those
 * declarations re-declare `fetch` globally.
 *
 * Structurally identical to `src/lib/ocr/types.ts` and to what the metrics
 * harness feeds in. If the two ever drift, the adapter is where they are
 * reconciled, not here.
 */

export interface OcrBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface OcrLine {
  readonly text: string;
  readonly confidence: number;
  readonly box: OcrBox;
}

export interface ExtractionInput {
  readonly lines: readonly OcrLine[];
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly nowMs: number;
  readonly languageHint?: string;
}

export type ExtractionSource = 'manual' | 'regex' | 'llm' | 'llm_corrected';
export type InvalidReason =
  | 'implausible_date'
  | 'out_of_range'
  | 'malformed'
  | 'failed_checksum';

export interface ExtractedField {
  readonly value?: string;
  readonly source: ExtractionSource;
  readonly confidence?: number;
  readonly sourceLineIndexes?: readonly number[];
  readonly invalid?: InvalidReason;
}

export interface ExtractedNotice {
  readonly recipientName?: ExtractedField;
  readonly caseNumber?: ExtractedField;
  readonly programId?: ExtractedField;
  readonly agency?: ExtractedField;
  readonly formId?: ExtractedField;
  readonly actionType?: ExtractedField;
  readonly noticeDate?: ExtractedField;
  readonly deadlineDate?: ExtractedField;
  readonly effectiveDate?: ExtractedField;
  readonly appealDeadline?: ExtractedField;
  readonly aidPaidPendingDeadline?: ExtractedField;
}

export interface ExtractionResult {
  readonly fields: ExtractedNotice;
  readonly requiredDocs?: readonly string[];
  readonly redacted: boolean;
  readonly containedSsn?: boolean;
}
