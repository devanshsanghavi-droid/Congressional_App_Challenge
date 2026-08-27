/**
 * No em dash reaches a user.
 *
 * AUTHORSHIP: Claude. App-side content under test.
 *
 * A house style rule rather than a correctness one, and it is enforced
 * mechanically for the same reason the population-level phrasing rule is: a
 * convention that lives only in someone's head is a convention that survives
 * exactly as long as their attention does. Thirteen English strings and ten
 * Spanish ones had drifted in before anyone counted.
 *
 * The en dash is included because it is the same key on the same menu and reads
 * the same way at 17pt on a phone.
 *
 * Replacements are chosen per sentence: a comma where the clause continues, a
 * colon where the second half explains the first, a semicolon where two
 * statements are balanced, a full stop where the dash was really doing a full
 * stop's job. Never a hyphen, which would just be a worse dash.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../../tools/metrics/corpus.ts';

const LOCALES = ['en', 'es'] as const;
const PACKS = ['cross_reference.json', 'offices.json', 'doc_types.json'] as const;

/** U+2014 em dash and U+2013 en dash. */
const DASHES = /[—–]/;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function walk(node: Json, path: string, out: { path: string; text: string }[]): void {
  if (typeof node === 'string') {
    out.push({ path, text: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`, out));
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walk(value, path === '' ? key : `${path}.${key}`, out);
    }
  }
}

function stringsIn(file: string): { path: string; text: string }[] {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Json;
  const out: { path: string; text: string }[] = [];
  walk(raw, '', out);
  return out;
}

describe('no em dash in anything a user can read', () => {
  it.each(LOCALES)('%s.json', (locale) => {
    const file = join(REPO_ROOT, 'src/lib/i18n/locales', `${locale}.json`);
    const offenders = stringsIn(file)
      .filter(({ text }) => DASHES.test(text))
      .map(({ path, text }) => `${path}: ${text.slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it.each(PACKS)('%s', (pack) => {
    // Content packs carry `_`-prefixed maintainer notes as well as user copy.
    // Both are checked: a note that becomes a screen string later should not
    // smuggle a dash in with it, and this repo has shipped a maintainer note to
    // a user twice.
    const offenders = stringsIn(join(REPO_ROOT, 'content', pack))
      .filter(({ text }) => DASHES.test(text))
      .map(({ path, text }) => `${path}: ${text.slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it('has strings to check, so a pass is not vacuous', () => {
    const total = LOCALES.reduce(
      (n, locale) =>
        n + stringsIn(join(REPO_ROOT, 'src/lib/i18n/locales', `${locale}.json`)).length,
      0,
    );
    expect(total).toBeGreaterThan(200);
  });

  it('actually detects a dash when one is present', () => {
    // Guards the failure where the pattern is wrong and every assertion above
    // passes by matching nothing — the exact way the `XXX` check broke.
    expect(DASHES.test('Not found — tap to add')).toBe(true);
    expect(DASHES.test('a range 1–5')).toBe(true);
    expect(DASHES.test('a hyphen-joined word')).toBe(false);
  });
});
