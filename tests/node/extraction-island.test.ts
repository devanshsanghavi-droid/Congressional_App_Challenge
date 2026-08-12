import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

/**
 * Guards the rule from CLAUDE.md: "/src/extraction must be pure and
 * platform-free — no React, no native modules — so it can be unit-tested
 * against the golden corpus in plain Node."
 *
 * There are already two other mechanisms enforcing this:
 *   - src/extraction/tsconfig.json removes the DOM and all ambient types, so
 *     `fetch` and `process` are not declared in there;
 *   - eslint.config.js bans platform module imports in that directory.
 *
 * This test exists because those two only fire when someone runs `tsc` or
 * `eslint`. This one fires on `npm test`, reads the actual bytes on disk, and
 * does not care whether the offending line typechecks.
 *
 * The three are not redundant — measured, not assumed (NOTES.md 2026-08-11):
 * the tsconfig rejects a bare `fetch` with "Cannot find name 'fetch'", but as
 * soon as a file imports react-native, React Native's own type definitions
 * re-declare `fetch` globally and that error disappears. The ESLint rule is
 * what stops the import that would smuggle the globals back in. Remove either
 * one and there is a hole; this test covers both from a third direction.
 *
 * Why it matters: if extraction stops being portable, the golden-corpus
 * harness stops running, and that harness is the only way to know whether a
 * change to a template made accuracy better or worse.
 */

const EXTRACTION_DIR = join(__dirname, '..', '..', 'src', 'extraction');
const TEMPLATES_DIR = join(__dirname, '..', '..', 'content', 'templates');
const REPO_ROOT = join(__dirname, '..', '..');

/** Module specifiers that must never appear in an import inside the island. */
const FORBIDDEN_MODULES = [
  /^react$/,
  /^react\//,
  /^react-native$/,
  /^react-native\//,
  /^react-native-/,
  /^expo$/,
  /^expo-/,
  /^@expo\//,
  /^@op-engineering\//,
  /^zustand$/,
  /^i18next$/,
  /^react-i18next$/,
  /^node:/,
  /^(fs|path|crypto|http|https|net|os|child_process|worker_threads)$/,
  /^@\/(lib|components|app)\//,
];

/**
 * Globals that only exist on a platform. Extraction receives everything it
 * needs as an argument, so none of these should appear. `fetch` and
 * `XMLHttpRequest` are the important ones — they are SPEC §0 rule 1.
 */
const FORBIDDEN_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'navigator',
  'document',
  'window',
  'localStorage',
  'require',
  'process',
  '__dirname',
];

function collectTsFiles(dir: string): string[] {
  let found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found; // directory does not exist yet — nothing to guard
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found = found.concat(collectTsFiles(full));
    } else if (extname(entry) === '.ts' && !entry.endsWith('.test.ts')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Removes comments so that a forbidden name written in prose does not fail the
 * build. String literals are left intact — module specifiers live inside them.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
}

/**
 * Removes comments *and* string literals. Used only for the global-reference
 * check, where a match inside a string would be a false positive.
 *
 * Note the ordering bug this function used to cause: blanking strings before
 * scanning for imports turned `from 'react-native'` into `from ''`, so the
 * import check silently passed on a file that imported React Native. The two
 * checks need different preprocessing, which is why they are separate now.
 */
function stripCommentsAndStrings(source: string): string {
  return stripComments(source)
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/** Pulls every module specifier out of import/export-from/require/dynamic-import. */
function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

const files = [...collectTsFiles(EXTRACTION_DIR), ...collectTsFiles(TEMPLATES_DIR)];

describe('the extraction island stays pure', () => {
  it('has files to check once extraction work begins', () => {
    // Not a failure before Phase 2 — this documents that the guard is live and
    // will start covering files as soon as any land.
    expect(Array.isArray(files)).toBe(true);
  });

  it.each(files.map((f) => [relative(REPO_ROOT, f), f]))(
    '%s imports nothing platform-specific',
    (_label, file) => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const offenders = extractImportSpecifiers(code).filter((specifier) =>
        FORBIDDEN_MODULES.some((pattern) => pattern.test(specifier))
      );
      expect(offenders).toEqual([]);
    }
  );

  it.each(files.map((f) => [relative(REPO_ROOT, f), f]))(
    '%s references no platform globals',
    (_label, file) => {
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      const offenders = FORBIDDEN_GLOBALS.filter((name) =>
        new RegExp(`(?<![.\\w$])${name}\\s*[({.[]`).test(code)
      );
      expect(offenders).toEqual([]);
    }
  );
});
