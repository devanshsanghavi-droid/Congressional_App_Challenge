/**
 * Vault — the proof documents, grouped by type, with their age.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * The same three or four documents are asked for over and over: a pay stub for
 * the SAR 7, a pay stub for the recertification, a pay stub for the Medi-Cal
 * renewal. Photographing the same piece of paper four times is friction, and
 * friction on a benefits deadline is how churn happens (CLAUDE.md §1).
 *
 * So a document attached on the Checklist is stored once and offered again next
 * time. This screen is where they live. It is **priority 7 of 8** (§10) and it
 * reads that way deliberately: a list and an age, not a file manager.
 *
 * ---------------------------------------------------------------------------
 * THE STALENESS WARNING, AND THE LINE IT WALKS
 * ---------------------------------------------------------------------------
 * "This pay stub is 47 days old" is a **fact** — Carta knows when it was saved.
 *
 * "…and most offices want the last 30" is a **rule about what an agency
 * requires**, which CLAUDE.md §16 forbids inventing. It is not in this file and
 * not in code: it comes from `offices.json`'s `what_to_bring.freshness`, keyed
 * on doc type, with its own source URL and verification date, and it is
 * surfaced by `npm run content:check` like every other sourced claim.
 *
 * A document type with **no** entry in that pack gets its age shown and no
 * judgement attached. That asymmetry is the whole design: an unwarned document
 * means "Carta has no sourced rule for this", never "this is fine".
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, EmptyState, ErrorState, Muted, Screen, Sheet } from '@/components/ui';
import { loadDocTypes, loadOffices } from '@/lib/content';
import type { DocType, DocumentFreshness } from '@/lib/content/types';
import { documentAge, groupDocuments } from '@/lib/checklist';
import { listDocuments } from '@/lib/db/checklist';
import type { StoredDocument } from '@/lib/db/checklist';
import { decryptDocumentForDisplay, discardDecryptedPreviews } from '@/lib/db/images';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

export default function VaultScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [documents, setDocuments] = useState<StoredDocument[]>();
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [viewing, setViewing] = useState<{ document: StoredDocument; uri?: string }>();

  const load = useCallback(() => {
    setFailed(false);
    setNow(Date.now());
    listDocuments().then(setDocuments).catch(() => setFailed(true));
  }, []);

  // On focus: the Checklist adds documents and returns here, and a list read
  // once would not show what was just attached.
  useFocusEffect(useCallback(() => void load(), [load]));

  const spanish = i18n.language.startsWith('es');

  // Both packs are static and validated on parse; a malformed one throws, and
  // this screen must not take the app down over a content file it only uses for
  // labels. Empty maps degrade to "show the id, judge nothing", which is the
  // same conservative default the rest of this screen runs on.
  let docTypes: ReadonlyMap<string, DocType> = new Map();
  let freshness: ReadonlyMap<string, DocumentFreshness> = new Map();
  try {
    docTypes = loadDocTypes().byId;
    freshness = loadOffices().freshness;
  } catch {
    // Labels degrade, the screen still works.
  }

  const nameOf = (document: StoredDocument): string => {
    if (document.label !== undefined && document.label !== '') return document.label;
    if (document.docType === undefined) return t('vault.untitled');
    const found = docTypes.get(document.docType);
    if (!found) return document.docType;
    return spanish ? found.labelEs : found.label;
  };

  const openPhoto = useCallback(async (document: StoredDocument) => {
    setViewing({ document });
    const uri = await decryptDocumentForDisplay(document.id);
    // `uri` stays undefined when the encrypted file is missing — the sheet
    // renders its own "cannot open" state rather than an empty grey box.
    setViewing({ document, ...(uri === undefined ? {} : { uri }) });
  }, []);

  const closePhoto = useCallback(() => {
    setViewing(undefined);
    // A decrypted copy must not outlive the look at it.
    discardDecryptedPreviews();
  }, []);

  if (failed) {
    return (
      <Screen>
        <ErrorState
          title={t('vault.errorTitle')}
          body={t('vault.errorBody')}
          action={<Button title={t('common.tryAgain')} onPress={load} variant="secondary" />}
        />
      </Screen>
    );
  }

  // `undefined` is "not read yet", `[]` is "genuinely none" — the same rule
  // Home and the Checklist follow, for the same reason.
  if (documents === undefined) return <Screen>{null}</Screen>;

  if (documents.length === 0) {
    return (
      <Screen>
        <EmptyState title={t('vault.emptyTitle')} body={t('vault.emptyBody')} />
        <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
      </Screen>
    );
  }

  const groups = groupDocuments(documents);

  return (
    <Screen>
      <Body>{t('vault.intro')}</Body>

      {groups.map((group) => {
        const rule = group.docType === undefined ? undefined : freshness.get(group.docType);
        const label =
          group.docType === undefined
            ? t('vault.otherPapers')
            : nameOf(group.documents[0] as StoredDocument);

        return (
          <Card key={group.docType ?? '__untyped'}>
            <Text style={styles.groupName}>{label}</Text>
            <Muted>{t('vault.savedCount', { count: group.documents.length })}</Muted>

            {group.documents.map((document) => {
              const age = documentAge(document.capturedAt, now, rule?.days);
              return (
                <View key={document.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={age.stale ? styles.ageStale : styles.age}>
                      {age.days === 0
                        ? t('vault.savedToday')
                        : t('vault.savedDaysAgo', { count: age.days })}
                    </Text>

                    {/* The judgement, and ONLY when a sourced rule says so. */}
                    {age.stale && rule ? (
                      <>
                        <Text style={styles.staleNote}>{spanish ? rule.es : rule.en}</Text>
                        <Caption>{t('vault.ruleCheckedOn', { date: rule.verifiedOn })}</Caption>
                      </>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={() => void openPhoto(document)}
                    accessibilityRole="button"
                    accessibilityLabel={t('vault.openPhoto', { name: label })}
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>{t('vault.look')}</Text>
                  </Pressable>
                </View>
              );
            })}

            {/* No rule for this type is a real answer and the screen says so,
                rather than leaving silence to be read as approval. */}
            {rule === undefined ? <Caption>{t('vault.noFreshnessRule')}</Caption> : null}
          </Card>
        );
      })}

      {/* `replace`, not `push`. Pushing Home onto the stack put a second copy
          above the first, so Home appeared with a back chevron and the stack
          grew every time someone came through here. */}
      <Button
        title={t('vault.addFromNotice')}
        variant="secondary"
        onPress={() => router.replace('/')}
      />
      <Caption>{t('vault.storedHere')}</Caption>
      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>

      <Sheet
        visible={viewing !== undefined}
        onClose={closePhoto}
        closeLabel={t('common.close')}
      >
        {viewing?.uri ? (
          <Image
            source={{ uri: viewing.uri }}
            style={styles.photo}
            accessibilityLabel={t('vault.photoAlt', { name: nameOf(viewing.document) })}
          />
        ) : viewing ? (
          <ErrorState title={t('vault.missingTitle')} body={t('vault.missingBody')} />
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupName: { ...type.subheading, color: color.text },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  rowText: { flex: 1, gap: space.xs },

  age: { ...type.body, color: color.text },
  ageStale: { ...type.bodyStrong, color: color.amber },
  staleNote: { ...type.body, color: color.amber },

  action: { minHeight: touchTarget, justifyContent: 'center' },
  actionText: { ...type.bodyStrong, color: color.accent },

  photo: { width: '100%', height: 520, resizeMode: 'contain', borderRadius: radius.md },
});
