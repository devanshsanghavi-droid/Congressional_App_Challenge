/**
 * The visual language, in one place.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Picked once and held (SPEC §7). Every screen reads from here so the design
 * pass is a change to this file rather than a hunt through components.
 *
 * The constraints in CLAUDE.md §10 are structural, not decoration, and they are
 * why the numbers are what they are:
 *
 *   - **≥16pt body.** Nothing in `type` below `body` is allowed to carry
 *     meaning; `caption` is for provenance and disclaimers only.
 *   - **≥44pt touch targets.** `touchTarget` is the floor and components use it
 *     as a minimum height rather than a suggestion.
 *   - **Dynamic Type.** Nothing sets `allowFontScaling={false}` — no text in
 *     Carta is ever prevented from scaling. Body text, labels and headings
 *     scale without limit and reflow to as many lines as they need.
 *
 *     **`countdown` and `countdownWord` are the exception, and the only one.**
 *     They are *display* type, not prose. Measured at the largest accessibility
 *     size on 2026-08-25, an uncapped 72pt number reached ~220pt and pushed the
 *     programme name off the card — leaving a user who needs AX5 with a huge
 *     number and no idea which notice it belonged to. `Countdown.tsx` therefore
 *     applies `maxFontSizeMultiplier`, and documents why at length. The rule is
 *     **cap display type, never cap prose**; if a second display size is ever
 *     added here, it needs the same treatment and the same measurement.
 *   - **One-handed.** Primary actions sit at the bottom of a screen, not the top.
 *
 * Contrast: every foreground/background pair here clears WCAG AA at body size.
 * The countdown colours are the ones most at risk, so they are darkened
 * versions of the obvious green/amber/red rather than the pure hues.
 */

export const color = {
  /** Page background. Warm white — pure #FFF glares under the camera lights. */
  background: '#FBFAF8',
  /** Cards and raised surfaces. */
  surface: '#FFFFFF',
  /** Hairlines and card edges. */
  border: '#E2DFDA',
  /** A stronger border for something that needs attention. */
  borderStrong: '#C9C4BC',

  /** Body text. Not pure black: softer on paper-white and easier to read. */
  text: '#1A1A1A',
  /** Labels, metadata, supporting sentences. AA at 16pt on `background`. */
  textMuted: '#5A5751',
  /** Provenance and disclaimers only. Never load-bearing. */
  textFaint: '#767268',

  /** The action colour. Also the splash colour, so the app opens into itself. */
  accent: '#1E63B8',
  accentText: '#FFFFFF',
  /** Tinted accent background for quiet emphasis. */
  accentSoft: '#E8F0FB',

  /**
   * Countdown tiers (SPEC §7). Green above 14 days, amber 3–14, red below 3.
   *
   * These are the one place colour carries meaning on its own, so every use is
   * paired with a number and a word — colour-blind users get the same
   * information without the hue.
   */
  green: '#1B5E20',
  greenSoft: '#E6F2E7',
  amber: '#8A5300',
  amberSoft: '#FBF0DF',
  red: '#B3261E',
  redSoft: '#FBEAE9',
  /** Expired or no deadline: present, not alarming. */
  neutral: '#5A5751',
  neutralSoft: '#F0EEEA',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * Type scale. `countdown` is deliberately enormous: SPEC §7 says the days
 * remaining must dominate by a wide margin, and "a stranger seeing this screen
 * for two seconds should come away with a number and a colour."
 */
export const type = {
  countdown: { fontSize: 72, fontWeight: '800', letterSpacing: -2 },
  countdownWord: { fontSize: 22, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700' },
  subheading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  bodyStrong: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

/** Apple's minimum, and CLAUDE.md §10's. Used as a floor, never a target. */
export const touchTarget = 44;

export type CountdownTone = 'green' | 'amber' | 'red' | 'neutral';

export const tone: Record<CountdownTone, { fg: string; bg: string }> = {
  green: { fg: color.green, bg: color.greenSoft },
  amber: { fg: color.amber, bg: color.amberSoft },
  red: { fg: color.red, bg: color.redSoft },
  neutral: { fg: color.neutral, bg: color.neutralSoft },
};
