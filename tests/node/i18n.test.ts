/**
 * English and Spanish must stay the same shape.
 *
 * AUTHORSHIP: Claude. App-side content under test.
 *
 * CLAUDE.md §9: *"All user-facing strings go through i18n. No hardcoded English
 * in components, ever."* and *"Spanish is written as each screen lands"*. Both
 * of those degrade the same silent way — a key added to `en.json` and forgotten
 * in `es.json` does not crash, does not warn, and does not fail a build. i18next
 * falls back to English, so a Spanish speaker gets an English sentence in the
 * middle of a Spanish screen and nothing anywhere says so.
 *
 * That is half this app's audience (CLAUDE.md §1: Maria's primary language is
 * Spanish), so it is a build failure here rather than something week 7 is
 * supposed to catch by reading.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../../tools/metrics/corpus.ts';

type Tree = { [key: string]: string | Tree };

function load(language: string): Tree {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'src/lib/i18n/locales', `${language}.json`), 'utf8'),
  ) as Tree;
}

/** Every leaf path, e.g. `home.emptyTitle`. */
function paths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'string' ? [path] : paths(value, path);
  });
}

/** The `{{name}}` placeholders in a string. */
function placeholders(text: string): string[] {
  return (text.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) ?? [])
    .map((p) => p.replace(/[{}\s]/g, ''))
    .sort();
}

function leaf(tree: Tree, path: string): string | undefined {
  const value = path.split('.').reduce<string | Tree | undefined>(
    (node, key) => (typeof node === 'object' && node !== null ? node[key] : undefined),
    tree,
  );
  return typeof value === 'string' ? value : undefined;
}

const en = load('en');
const es = load('es');
const enPaths = paths(en);
const esPaths = paths(es);

describe('en and es', () => {
  it('have something to compare', () => {
    expect(enPaths.length).toBeGreaterThan(100);
  });

  it('define exactly the same keys', () => {
    const missingInSpanish = enPaths.filter((p) => !esPaths.includes(p));
    const missingInEnglish = esPaths.filter((p) => !enPaths.includes(p));
    // Named rather than counted, so the failure says which string to write.
    expect({ missingInSpanish, missingInEnglish }).toEqual({
      missingInSpanish: [],
      missingInEnglish: [],
    });
  });

  it('use the same interpolation placeholders in both languages', () => {
    // `{{count}}` in English and `{{cuenta}}` in Spanish renders the literal
    // braces to the user. Word order changes between languages; the variable
    // names cannot.
    const mismatched = enPaths
      .map((path) => ({
        path,
        en: placeholders(leaf(en, path) ?? ''),
        es: placeholders(leaf(es, path) ?? ''),
      }))
      .filter(({ en: a, es: b }) => a.join(',') !== b.join(','));
    expect(mismatched).toEqual([]);
  });

  it('has no empty Spanish string standing in for a translation', () => {
    const blank = esPaths.filter((p) => (leaf(es, p) ?? '').trim() === '');
    expect(blank).toEqual([]);
  });

  it('has no Spanish value left identical to a long English one', () => {
    // Short strings legitimately match — "Medi-Cal", "CalFresh", "EBT", "PDF".
    // A long identical string is almost always an untranslated placeholder that
    // was pasted across and never revisited.
    const suspicious = enPaths.filter((path) => {
      const source = leaf(en, path) ?? '';
      return source.length > 25 && source === leaf(es, path);
    });
    expect(suspicious).toEqual([]);
  });

  /**
   * i18next needs `_one`/`_other` in pairs. A missing `_other` renders the key
   * itself — `vault.savedCount_other` — on screen, for any count above one.
   */
  it('keeps plural forms in pairs, in both languages', () => {
    const broken: string[] = [];
    for (const [language, all] of [
      ['en', enPaths],
      ['es', esPaths],
    ] as const) {
      for (const path of all) {
        if (!path.endsWith('_one')) continue;
        const other = `${path.slice(0, -'_one'.length)}_other`;
        if (!all.includes(other)) broken.push(`${language}: ${path} has no ${other}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
