/**
 * Where the extraction cascade is plugged in.
 *
 * AUTHORSHIP: Claude. App-side wiring only.
 *
 * The island declares its own copy of the input and output types in
 * `src/extraction/types.ts` rather than importing `port.ts`, deliberately: that
 * directory compiles with `lib: ["ES2022"]` and `types: []` so it can run
 * unchanged in bare Node against the corpus, and importing an app-side module
 * would drag React Native's ambient declarations in with it — which is the exact
 * hole the island rules exist to close, since those declarations re-declare
 * `fetch` globally.
 *
 * The two shapes are structurally identical, so this is a type-level bridge with
 * no runtime cost. If they ever genuinely diverge, this file is where they are
 * reconciled — never the island (INTERFACE.md).
 */

// Relative with an explicit `.ts`, not the `@/` alias. The bare-Node Jest
// project has no moduleNameMapper on purpose, and the metrics harness imports
// this island by file path — both resolve a relative path and neither resolves
// the alias.
import { extract as cascadeExtract } from '../../extraction/index.ts';
import type { Extractor } from './port.ts';

export const extractNotice: Extractor = cascadeExtract as unknown as Extractor;

/** True while the app is running on the scaffold rather than the real cascade. */
export const USING_SCAFFOLD = false;
