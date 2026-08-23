/**
 * Where the extraction cascade gets plugged in.
 *
 * AUTHORSHIP: Claude. App-side wiring only.
 *
 * One line changes when `/src/extraction` is ready:
 *
 *     import { extract } from '@/extraction';
 *
 * and delete `scaffold.ts`. Everything downstream — Capture, Review, storage,
 * scheduling — is written against `port.ts` and does not change.
 */

import type { Extractor } from './port.ts';
import { extract as scaffoldExtract } from './scaffold.ts';

/**
 * ⚠️ Currently the scaffold. See `scaffold.ts` for why it exists and why it
 * must not be improved in place.
 */
export const extractNotice: Extractor = scaffoldExtract;

/** True while the app is running on the scaffold rather than the real cascade. */
export const USING_SCAFFOLD = true;
