/**
 * Text normalisation for the cascade.
 *
 * The one rule that governs this file: **normalise for comparison, return the
 * original.** A value Carta silently cleaned is a value the user cannot check
 * against the paper in front of them, and checking against the paper is the
 * entire purpose of the Review screen.
 */

/**
 * Letters with no canonical decomposition, and therefore invisible to NFD.
 *
 * `String.prototype.normalize('NFD')` splits a letter into base plus combining
 * mark, so `É` becomes `E` + U+0301 and stripping the marks leaves `E`. That
 * works for most of Latin-1 and for Vietnamese tone marks, which is why folding
 * is the cheap general answer.
 *
 * It does not work for letters whose diacritic is a **stroke or a ligature**,
 * because those have no decomposition to apply — `Đ` is one indivisible code
 * point, not `D` plus a bar. NFD returns it unchanged and an ASCII-only test
 * then rejects it.
 *
 * `Đ`/`đ` is the one that matters here and it is not hypothetical: `ĐỖ` and
 * `ĐẶNG` are common Vietnamese surnames and Santa Clara County has one of the
 * largest Vietnamese-speaking populations in the United States. The rest are on
 * the list because they are the same class of problem and the list is cheaper to
 * write once than to extend twice.
 */
const UNDECOMPOSABLE: Readonly<Record<string, string>> = {
  Đ: 'D', đ: 'd',
  Ð: 'D', ð: 'd',
  Ø: 'O', ø: 'o',
  Ł: 'L', ł: 'l',
  Æ: 'AE', æ: 'ae',
  Œ: 'OE', œ: 'oe',
  Þ: 'TH', þ: 'th',
  ß: 'ss',
  Ħ: 'H', ħ: 'h',
  Ŧ: 'T', ŧ: 't',
};

/**
 * Strip diacritics for comparison only.
 *
 * Decompose, drop the combining marks, then substitute the letters that have no
 * decomposition. Order matters: the substitution has to run after NFD so that a
 * letter carrying both a stroke and a tone mark is fully reduced.
 */
export function fold(value: string): string {
  const decomposed = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const character of decomposed) out += UNDECOMPOSABLE[character] ?? character;
  return out;
}

/** Collapse runs of whitespace and trim. OCR spacing is not reliable. */
export function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Fold, tidy and upper-case — the form used for every table lookup and shape
 * test in the cascade. Never the form returned to the app.
 */
export function compareKey(value: string): string {
  return fold(tidy(value)).toUpperCase();
}
