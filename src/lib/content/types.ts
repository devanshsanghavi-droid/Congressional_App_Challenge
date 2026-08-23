/**
 * Types for the bundled content packs.
 *
 * AUTHORSHIP: Claude. App-side code (CLAUDE.md §7).
 *
 * These mirror `content/cross_reference.json` and `content/offices.json`, with
 * two deliberate differences from the raw JSON — both there to make a rule
 * unforgettable rather than merely documented:
 *
 *   - `CrossReferenceEntry` and `OfficeLocation` carry `verifiedOn` as a
 *     required field, so a screen cannot render an entry without having its
 *     provenance in hand. SPEC §16: every content string pairs with a real
 *     citation.
 *
 *   - `OfficeLocation` carries `confirmHoursNote`, also required. Hours change,
 *     and a wasted trip across the county is a real harm for someone without a
 *     car. The note is attached by the loader to every office; there is no way
 *     to obtain an office without it.
 */

export type Confidence = 'high' | 'medium' | 'low';

/** ISO date, YYYY-MM-DD. */
export type IsoDate = string;

export interface Sourced {
  /** Where the claim came from. Always a URL to the operating agency. */
  readonly sourceUrl: string;
  /** When a human last checked it. Rendered in the UI, not just stored. */
  readonly verifiedOn: IsoDate;
  readonly confidence: Confidence;
  /**
   * Present when the entry is not yet confirmed and must not ship as-is.
   * Surfaced by `outstandingVerifications()`, never silently ignored.
   */
  readonly todoVerify?: string;
}

export interface CrossReferenceEntry extends Sourced {
  readonly id: string;
  readonly name: string;
  /** Plain-language description of the programme. ≤6th grade (CLAUDE.md §10). */
  readonly what: string;
  /**
   * True when an official source says receipt of the source programme itself
   * establishes eligibility. False means a common co-occurrence — which is
   * still only ever phrased at population level.
   */
  readonly categoricalEligibility: boolean;
  readonly basis: string;
  readonly applyUrl?: string;
}

export interface PublicChargeNote extends Sourced {
  readonly en: string;
  readonly es: string;
}

export interface CrossReferencePack {
  readonly counties: readonly string[];
  /** Programme id -> the programmes worth checking alongside it. */
  readonly byProgram: ReadonlyMap<string, readonly CrossReferenceEntry[]>;
  /**
   * Renders inline with the list, never behind a link (CLAUDE.md §4). Pushing
   * extra programmes at a mixed-status household is exactly where fear does its
   * damage, so the reassurance travels with the suggestion.
   */
  readonly publicChargeNote: PublicChargeNote;
  /** Required on every rendering. */
  readonly disclaimer: string;
}

export interface OfficeLocation {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly state: string;
  readonly zip: string;
  readonly purpose?: string;
  readonly walkIn?: boolean;
  readonly hours?: string;
  /** Required. Attached by the loader; an office cannot exist without it. */
  readonly confirmHoursNote: string;
  readonly verifiedOn: IsoDate;
  readonly confidence: Confidence;
}

export interface PhoneNumber {
  readonly label: string;
  readonly number: string;
}

export interface AppealsInfo extends Sourced {
  readonly how: string;
  readonly appealsUnit: {
    readonly name: string;
    readonly address: string;
    readonly city: string;
    readonly state: string;
    readonly zip: string;
  };
  readonly stateHearingsPhone: string;
  readonly stateHearingsTdd: string;
  readonly ombudsNote: string;
}

export interface OfficesPack {
  readonly countyAgency: string;
  readonly countyLocations: readonly OfficeLocation[];
  readonly countyPhones: readonly PhoneNumber[];
  readonly phoneTip: string;
  readonly accessibilityLine: string;
  readonly accessibilityNote: string;
  readonly languages: readonly string[];
  readonly dropBoxNote?: string;
  readonly ssaAgency: string;
  readonly ssaNationalPhone: string;
  readonly ssaLocations: readonly OfficeLocation[];
  readonly appeals: AppealsInfo;
  readonly whatToBringAlways: readonly string[];
  readonly whatToBringUsually: readonly string[];
  readonly stillNeeded: readonly string[];
}

/** An entry that must be confirmed by a human before submission. */
export interface OutstandingVerification {
  readonly where: string;
  readonly reason: string;
  readonly confidence: Confidence;
}
