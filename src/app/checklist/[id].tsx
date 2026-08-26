/**
 * Checklist — what this notice asks for, and what has been gathered.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCREEN IS FOR
 * ---------------------------------------------------------------------------
 * Churn is procedural (CLAUDE.md §1): people lose benefits they are still
 * eligible for because a packet went back without a pay stub in it. The
 * countdown says *when*; this says *what*, and it is the difference between
 * knowing the deadline and meeting it.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THAT ARE NOT NEGOTIABLE HERE
 * ---------------------------------------------------------------------------
 * **1. Carta never claims a programme requires something.** CLAUDE.md §16.
 * A row says "the letter asks for this" only when the extraction cascade read
 * it off the page (`origin === 'letter'`). Everything else says "you added
 * this". The distinction is rendered, not just stored, and there is no code
 * path that turns the second into the first.
 *
 * **2. "Does not apply to me" is a first-class outcome.** A checklist that can
 * only be completed tells someone with no employer that they can never be
 * ready. They can — a pay stub does not apply to them — and marking it so
 * counts as resolved.
 *
 * **3. "You're ready" is never shown for an empty checklist.** Zero of zero is
 * arithmetically complete and is not readiness: an empty checklist means Carta
 * does not know what the letter asks for. `progressOf()` encodes that, and it
 * is pure so `tests/node/checklist.test.ts` can hold the line without a phone.
 *
 * ---------------------------------------------------------------------------
 * ATTACHING
 * ---------------------------------------------------------------------------
 * Two ways, both offline. Photograph it now, or reuse a document already
 * stored — which is the Vault's data (SPEC §7, below the line) read before the
 * Vault exists, so someone whose pay stub is already in Carta does not
 * photograph it twice. Attachments are encrypted with the same key as the
 * notices and never touch MediaLibrary (CLAUDE.md §3 rule 7).
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, EmptyState, ErrorState, Muted, Screen, Sheet } from '@/components/ui';
import { loadDocTypes } from '@/lib/content';
import type { DocType } from '@/lib/content/types';
import {
  addUserRequirement,
  attachDocument,
  attachExistingDocument,
  listDocuments,
  listRequirements,
  markNeeded,
  markNotApplicable,
  progressOf,
  removeRequirement,
  setDocumentImageRef,
} from '@/lib/db/checklist';
import type { Requirement, StoredDocument } from '@/lib/db/checklist';
import { storeDocumentEncrypted } from '@/lib/db/images';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

/** Which sheet is open, if any. Named for the state, not the component. */
type SheetState =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'attach'; requirement: Requirement };

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [requirements, setRequirements] = useState<Requirement[]>();
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [attachError, setAttachError] = useState<string>();

  const load = useCallback(() => {
    if (!id) return;
    setFailed(false);
    listRequirements(id).then(setRequirements).catch(() => setFailed(true));
  }, [id]);

  // On focus rather than on mount: the camera takes the user out of this
  // screen and back, and a list read once would not show what they attached.
  useFocusEffect(useCallback(() => void load(), [load]));

  const spanish = i18n.language.startsWith('es');

  /** A row's visible name: the doc-type label, or the user's own words. */
  const nameOf = useCallback(
    (item: { docType?: string; label?: string }): string => {
      if (item.label !== undefined && item.label !== '') return item.label;
      if (item.docType === undefined) return t('checklist.untitled');
      let types: ReadonlyMap<string, DocType>;
      try {
        types = loadDocTypes().byId;
      } catch {
        return item.docType;
      }
      const found = types.get(item.docType);
      // An id with no entry in the pack still names something real — it came
      // off a letter. Showing the raw id beats showing nothing.
      if (!found) return item.docType;
      return spanish ? found.labelEs : found.label;
    },
    [spanish, t],
  );

  const attachFromCamera = useCallback(
    async (requirement: Requirement) => {
      setBusy(true);
      setAttachError(undefined);
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setAttachError(t('checklist.cameraDenied'));
          return;
        }
        const shot = await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false });
        const uri = shot.assets?.[0]?.uri;
        if (shot.canceled || uri === undefined) return;

        // The row is written first because the encrypted file is named after
        // its id — the same order `saveNotice` then `setImageRef` uses. If the
        // write fails the requirement goes back to `needed` rather than sitting
        // in `attached` pointing at a file that was never created.
        const documentId = await attachDocument(requirement.id, {
          ...(requirement.docType === undefined ? {} : { docType: requirement.docType }),
          ...(requirement.label === undefined ? {} : { label: requirement.label }),
          imageRef: '',
        });
        const stored = await storeDocumentEncrypted(documentId, uri);
        if (stored === undefined) {
          await markNeeded(requirement.id);
          setAttachError(t('checklist.attachFailed'));
          return;
        }
        await setDocumentImageRef(documentId, stored);
        setSheet({ kind: 'none' });
        load();
      } catch {
        setAttachError(t('checklist.attachFailed'));
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  if (failed) {
    return (
      <Screen>
        <ErrorState
          title={t('checklist.errorTitle')}
          body={t('checklist.errorBody')}
          action={<Button title={t('common.tryAgain')} onPress={load} variant="secondary" />}
        />
      </Screen>
    );
  }

  // `undefined` is "not read yet". Rendering the empty state during the first
  // read would flash "Carta does not know what to bring" at someone with a
  // full checklist — the same rule Home follows.
  if (requirements === undefined) return <Screen>{null}</Screen>;

  const progress = progressOf(requirements);

  const addButton = (
    <Button
      title={t('checklist.addSomething')}
      variant={requirements.length === 0 ? 'primary' : 'secondary'}
      onPress={() => setSheet({ kind: 'add' })}
    />
  );

  if (requirements.length === 0) {
    return (
      <Screen footer={addButton}>
        <EmptyState title={t('checklist.emptyTitle')} body={t('checklist.emptyBody')} />
        <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
        <AddSheet
          visible={sheet.kind === 'add'}
          onClose={() => setSheet({ kind: 'none' })}
          onPick={async (docType, label) => {
            if (!id) return;
            await addUserRequirement(id, {
              ...(docType === undefined ? {} : { docType }),
              ...(label === undefined ? {} : { label }),
            });
            setSheet({ kind: 'none' });
            load();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen footer={addButton}>
      {/* The progress figure, and the readiness statement it earns. Ready is a
          real state with its own copy, not a full bar with nothing to say. */}
      <Card>
        {progress.ready ? (
          <>
            <Text style={styles.readyTitle}>{t('checklist.readyTitle')}</Text>
            <Body>{t('checklist.readyBody')}</Body>
          </>
        ) : (
          <>
            <Text style={styles.progressCount}>
              {t('checklist.progress', { done: progress.resolved, total: progress.total })}
            </Text>
            <Body>{t('checklist.progressBody')}</Body>
          </>
        )}
        <View
          style={styles.bar}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: progress.total, now: progress.resolved }}
          accessibilityLabel={t('checklist.progress', {
            done: progress.resolved,
            total: progress.total,
          })}
        >
          <View
            style={[
              styles.barFill,
              progress.ready && styles.barFillReady,
              // Percentage width rather than a measured layout: the bar is
              // decorative and the number above it is the real answer.
              { width: `${Math.round((progress.resolved / progress.total) * 100)}%` },
            ]}
          />
        </View>
      </Card>

      {requirements.map((requirement) => {
        const name = nameOf(requirement);
        return (
          <View
            key={requirement.id}
            style={[
              styles.row,
              requirement.state === 'attached' && styles.rowDone,
              requirement.state === 'not_applicable' && styles.rowSkipped,
            ]}
          >
            <Text style={styles.rowName}>{name}</Text>

            {/* Rule 1, rendered. Never "this is required" for a user-added row. */}
            <Muted>
              {requirement.origin === 'letter'
                ? t('checklist.fromLetter')
                : t('checklist.fromYou')}
            </Muted>

            {requirement.state === 'attached' ? (
              <>
                <Text style={styles.stateDone}>{t('checklist.attached')}</Text>
                <Pressable
                  onPress={() => void markNeeded(requirement.id).then(load)}
                  accessibilityRole="button"
                  accessibilityLabel={t('checklist.undoAttach', { name })}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>{t('checklist.undo')}</Text>
                </Pressable>
              </>
            ) : requirement.state === 'not_applicable' ? (
              <>
                <Text style={styles.stateSkipped}>{t('checklist.notApplicable')}</Text>
                <Pressable
                  onPress={() => void markNeeded(requirement.id).then(load)}
                  accessibilityRole="button"
                  accessibilityLabel={t('checklist.undoSkip', { name })}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>{t('checklist.undo')}</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.actions}>
                <Button
                  title={t('checklist.attachIt')}
                  variant="secondary"
                  onPress={() => {
                    setAttachError(undefined);
                    setSheet({ kind: 'attach', requirement });
                  }}
                />
                <Pressable
                  onPress={() => void markNotApplicable(requirement.id).then(load)}
                  accessibilityRole="button"
                  accessibilityLabel={t('checklist.skipIt', { name })}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>{t('checklist.doesNotApply')}</Text>
                </Pressable>
                {/* Only a row the user created may be deleted. Removing one the
                    letter asked for would let someone hide a real requirement
                    from themselves, which is the exact failure this app is for. */}
                {requirement.origin === 'user' ? (
                  <Pressable
                    onPress={() => void removeRequirement(requirement.id).then(load)}
                    accessibilityRole="button"
                    accessibilityLabel={t('checklist.removeIt', { name })}
                    style={styles.action}
                  >
                    <Text style={styles.actionTextQuiet}>{t('checklist.remove')}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        );
      })}

      <Button
        title={t('checklist.backToNotice')}
        variant="secondary"
        onPress={() => router.replace(`/notice/${id}`)}
      />
      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>

      <AddSheet
        visible={sheet.kind === 'add'}
        onClose={() => setSheet({ kind: 'none' })}
        onPick={async (docType, label) => {
          if (!id) return;
          await addUserRequirement(id, {
            ...(docType === undefined ? {} : { docType }),
            ...(label === undefined ? {} : { label }),
          });
          setSheet({ kind: 'none' });
          load();
        }}
      />

      {/* Mounted only when there is a row to attach to, and keyed by that row:
          remounting is what resets the sheet's own state, instead of an effect
          that clears it by hand on every close. */}
      {sheet.kind === 'attach' ? (
        <AttachSheet
          key={sheet.requirement.id}
          requirement={sheet.requirement}
          name={nameOf(sheet.requirement)}
          busy={busy}
          {...(attachError === undefined ? {} : { error: attachError })}
          onClose={() => setSheet({ kind: 'none' })}
          onCamera={attachFromCamera}
          onExisting={async (requirement, document) => {
            await attachExistingDocument(requirement.id, document.id);
            setSheet({ kind: 'none' });
            load();
          }}
          nameOf={nameOf}
        />
      ) : null}
    </Screen>
  );
}

/** Pick a kind of document to add. The list is a vocabulary, never a rule. */
function AddSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (docType: string | undefined, label: string | undefined) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const spanish = i18n.language.startsWith('es');

  let types: readonly DocType[] = [];
  try {
    types = loadDocTypes().all;
  } catch {
    types = [];
  }

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('common.close')}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          {t('checklist.addTitle')}
        </Text>
        <Body>{t('checklist.addBody')}</Body>
        {types.length === 0 ? (
          <ErrorState title={t('checklist.errorTitle')} body={t('checklist.errorBody')} />
        ) : (
          types.map((docType) => (
            <Pressable
              key={docType.id}
              onPress={() => void onPick(docType.id, undefined)}
              accessibilityRole="button"
              accessibilityLabel={spanish ? docType.labelEs : docType.label}
              style={({ pressed }) => [styles.pick, pressed && styles.pickPressed]}
            >
              <Text style={styles.pickName}>{spanish ? docType.labelEs : docType.label}</Text>
              <Text style={styles.pickWhat}>{spanish ? docType.whatEs : docType.what}</Text>
            </Pressable>
          ))
        )}
    </Sheet>
  );
}

/** Photograph it now, or reuse one already stored. */
function AttachSheet({
  requirement,
  name,
  busy,
  error,
  onClose,
  onCamera,
  onExisting,
  nameOf,
}: {
  requirement: Requirement;
  name: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onCamera: (requirement: Requirement) => Promise<void>;
  onExisting: (requirement: Requirement, document: StoredDocument) => Promise<void>;
  nameOf: (item: { docType?: string; label?: string }) => string;
}) {
  const { t, i18n } = useTranslation();
  const [existing, setExisting] = useState<StoredDocument[]>();

  useEffect(() => {
    // Filtered to the requirement's own type when it has one, so the pay stub
    // the last notice asked for is the first thing offered for this one.
    listDocuments(requirement.docType).then(setExisting).catch(() => setExisting([]));
  }, [requirement]);

  return (
    <Sheet visible onClose={onClose} closeLabel={t('common.close')}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          {t('checklist.attachTitle', { name })}
        </Text>

        {error !== undefined ? (
          <ErrorState title={t('checklist.attachFailedTitle')} body={error} />
        ) : null}

        <Button
          title={t('checklist.photographIt')}
          busy={busy}
          onPress={() => void onCamera(requirement)}
        />
        <Muted>{t('checklist.photographBody')}</Muted>

        <Text style={styles.sheetSubtitle}>{t('checklist.alreadyHave')}</Text>
        {existing === undefined ? null : existing.length === 0 ? (
          <Muted>{t('checklist.noneStored')}</Muted>
        ) : (
          existing.map((document) => (
            <Pressable
              key={document.id}
              onPress={() => void onExisting(requirement, document)}
              accessibilityRole="button"
              accessibilityLabel={t('checklist.useStored', { name: nameOf(document) })}
              style={({ pressed }) => [styles.pick, pressed && styles.pickPressed]}
            >
              <Text style={styles.pickName}>{nameOf(document)}</Text>
              <Text style={styles.pickWhat}>
                {t('checklist.storedOn', {
                  date: new Date(document.capturedAt).toLocaleDateString(i18n.language, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                })}
              </Text>
            </Pressable>
          ))
        )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  progressCount: { ...type.title, color: color.text },
  readyTitle: { ...type.title, color: color.green },

  bar: {
    height: 10,
    borderRadius: radius.sm,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  barFill: { height: 10, backgroundColor: color.accent },
  barFillReady: { backgroundColor: color.green },

  row: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  rowDone: { borderColor: color.green },
  rowSkipped: { backgroundColor: color.background },
  rowName: { ...type.subheading, color: color.text },

  stateDone: { ...type.bodyStrong, color: color.green },
  stateSkipped: { ...type.bodyStrong, color: color.textMuted },

  actions: { gap: space.sm },
  action: { minHeight: touchTarget, justifyContent: 'center' },
  actionText: { ...type.bodyStrong, color: color.accent },
  actionTextQuiet: { ...type.body, color: color.textMuted },

  sheetTitle: { ...type.title, color: color.text },
  sheetSubtitle: { ...type.subheading, color: color.text, marginTop: space.lg },

  pick: {
    gap: space.xs,
    paddingVertical: space.md,
    minHeight: touchTarget,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  pickPressed: { opacity: 0.6 },
  pickName: { ...type.bodyStrong, color: color.text },
  pickWhat: { ...type.body, color: color.textMuted },
});
