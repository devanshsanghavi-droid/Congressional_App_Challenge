/**
 * The documents a letter asked for, resolved to names a person reads.
 *
 * AUTHORSHIP: Claude. App-side orchestration.
 *
 * Separate from `reminder-content.ts` on purpose. That module composes the
 * sentence and is pure, so `notifications/` can import it without pulling a
 * database into the bare-Node test project. This one touches `db/` and
 * `content/`, so only the screens and the reschedule path import it.
 */

import i18n from './i18n/index.ts';
import { listRequirements } from './db/checklist.ts';
import { loadDocTypes } from './content/index.ts';

/**
 * The documents this letter asked for, in the user's language.
 *
 * Only `origin: 'letter'` rows: a document the user added themselves is their
 * own note to self, and repeating it back in a reminder as though the county
 * demanded it would be Carta inventing a requirement.
 */
export async function letterDocuments(noticeId: string): Promise<string[]> {
  try {
    const requirements = await listRequirements(noticeId);
    const wanted = requirements.filter((r) => r.origin === 'letter');
    if (wanted.length === 0) return [];

    let types: ReadonlyMap<string, { label: string; labelEs: string }>;
    try {
      types = loadDocTypes().byId as ReadonlyMap<string, { label: string; labelEs: string }>;
    } catch {
      return [];
    }

    const spanish = i18n.language.startsWith('es');
    const names: string[] = [];
    for (const requirement of wanted) {
      if (requirement.label !== undefined && requirement.label !== '') {
        names.push(requirement.label);
        continue;
      }
      const type = requirement.docType === undefined ? undefined : types.get(requirement.docType);
      if (type) names.push(spanish ? type.labelEs : type.label);
    }
    return names;
  } catch {
    // A reminder with no document list is still a useful reminder. This must
    // never be the reason a deadline goes unscheduled.
    return [];
  }
}

