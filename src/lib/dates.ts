/**
 * Date conversions at the storage boundary.
 *
 * AUTHORSHIP: Claude. App-side, and pure — no imports, so it can be tested in
 * bare Node without dragging in SQLite or the crypto layer.
 *
 * Its own module rather than living beside the SQL because everything in the
 * app agrees on these two functions: the extraction port speaks ISO, the
 * database stores epoch millis, and Home and the scheduler both compute days
 * remaining from the result. A disagreement here would show up as the screen
 * and the notification naming different days for the same deadline.
 *
 * **Local midnight, never UTC** (CLAUDE.md §9). A deadline is a *day*, and
 * which day it is depends on where the user is standing. Converting through
 * UTC moves it by one for anybody west of Greenwich, which is everybody this
 * app is for.
 */

/** ISO `YYYY-MM-DD` to epoch millis at local midnight. */
export function isoToLocalMs(iso: string): number | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!parts) return undefined;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  // Rejects 2026-02-31: the Date constructor rolls it over to March, so the
  // components coming back out no longer match what went in.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date.getTime();
}

export function localMsToIso(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
