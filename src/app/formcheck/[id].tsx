/**
 * Check a filled-in form before it goes in the envelope.
 *
 * AUTHORSHIP: Claude. App-side screen (CLAUDE.md §7).
 *
 * Reached from Notice Detail, only for a letter whose form Carta has a template
 * for. The person photographs the form they filled in; Carta lines it up with
 * the blank form, looks inside every answer box and along the signature line,
 * reads the date they wrote, and draws a numbered ring on each spot it checked.
 *
 * What it will not do is say "complete". It checks three things the form itself
 * lists, quotes the form for each, asks about the proof rather than claiming to
 * see it, and says the county decides the rest. The rings are there so the
 * person can see exactly where Carta looked, which is the same trust mechanism
 * as the original letter being one tap away on Notice Detail.
 */

import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { Body, Button, Caption, Card, ErrorState, Muted, Screen } from '@/components/ui';
import { loadFormTemplates } from '@/lib/content';
import { addDocument, setDocumentImageRef } from '@/lib/db/checklist';
import { storeDocumentEncrypted } from '@/lib/db/images';
import { getNotice } from '@/lib/db/notices';
import type { Notice } from '@/lib/db/notices';
import { SENT_FORM_DOC_TYPE, saveSentCopy } from '@/lib/db/sent';
import { checkFilledForm, checkedCount } from '@/lib/formcheck/check';
import type { CheckState, FormCheck, Finding, Quad } from '@/lib/formcheck/check';
import type { GrayImage } from '@/lib/formcheck/ink';
import { grayPixels } from '@/lib/formcheck/pixels';
import { sameFormId } from '@/lib/formcheck/template';
import type { FormTemplate } from '@/lib/formcheck/template';
import { parseWrittenDate } from '@/lib/formcheck/written-date';
import type { CalendarDate } from '@/lib/formcheck/written-date';
import { recognize } from '@/lib/ocr/recognize';
import type { OcrLine } from '@/lib/ocr/types';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

type Phase = 'intro' | 'checking' | 'result' | 'failed';

interface Reading {
  readonly lines: readonly OcrLine[];
  readonly ocrWidth: number;
  readonly ocrHeight: number;
  readonly image: GrayImage;
  /** The photo as shown: the resized copy the recogniser read. */
  readonly shownUri: string;
  /** The photo as taken, kept until the person saves a copy or leaves. */
  readonly originalUri: string;
}

const RING: Record<CheckState, string> = {
  looks_done: color.green,
  look_again: color.red,
  not_checked: color.textFaint,
};

function formatDate(d: CalendarDate, locale: string): string {
  return new Date(d.year, d.month - 1, d.day).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function FormCheckScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [notice, setNotice] = useState<Notice>();
  const [phase, setPhase] = useState<Phase>('intro');
  const [reading, setReading] = useState<Reading>();
  const [outcome, setOutcome] = useState<FormCheck>();
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [photoWidth, setPhotoWidth] = useState(0);

  useEffect(() => {
    void getNotice(id).then(setNotice);
  }, [id]);

  const template: FormTemplate | undefined = useMemo(
    () => loadFormTemplates().find((tpl) => sameFormId(notice?.formId, tpl.formId)),
    [notice],
  );

  const check = useCallback(
    async (uri: string) => {
      if (!template) return;
      setPhase('checking');
      setCopy('idle');
      try {
        const ocr = await recognize(uri);
        const image = await grayPixels(uri);
        const next: Reading = {
          lines: ocr.lines,
          ocrWidth: ocr.width,
          ocrHeight: ocr.height,
          image,
          shownUri: ocr.prepared.uri,
          originalUri: uri,
        };
        setReading(next);
        setOutcome(checkFilledForm({ template, ...next }));
        setPhase('result');
      } catch (error) {
        console.warn('[carta] form check failed', error);
        setPhase('failed');
      }
    },
    [template],
  );

  const take = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (!shot.canceled && shot.assets[0]) await check(shot.assets[0].uri);
  }, [check]);

  const choose = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (!picked.canceled && picked.assets[0]) await check(picked.assets[0].uri);
  }, [check]);

  /** Re-run with the date the person says they wrote, when it could not be read. */
  const applyTypedDate = useCallback(() => {
    const date = parseWrittenDate(typed);
    if (!date || !template || !reading) {
      setTypedError(true);
      return;
    }
    setTypedError(false);
    setOutcome(checkFilledForm({ template, ...reading, writtenDate: date }));
  }, [typed, template, reading]);

  const saveCopy = useCallback(async () => {
    if (!reading || !notice) return;
    setCopy('saving');
    try {
      const documentId = await addDocument({ docType: SENT_FORM_DOC_TYPE });
      const stored = await storeDocumentEncrypted(documentId, reading.originalUri);
      if (stored === undefined) throw new Error('could not store the copy');
      await setDocumentImageRef(documentId, stored);
      await saveSentCopy(notice.id, documentId, Date.now());
      setCopy('saved');
    } catch {
      setCopy('failed');
    }
  }, [reading, notice]);

  if (notice && !template) {
    return (
      <Screen>
        <ErrorState
          title={t('formcheck.differentFormTitle')}
          body={t('formcheck.differentFormBody')}
          action={<Button title={t('common.back')} variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (phase === 'checking') {
    return (
      <Screen>
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={color.accent} />
          <Body>{t('formcheck.checking')}</Body>
        </View>
      </Screen>
    );
  }

  if (phase === 'failed' || (phase === 'result' && outcome && !outcome.ok)) {
    const reason = outcome && !outcome.ok ? outcome.reason : undefined;
    return (
      <Screen
        footer={
          <>
            <Button title={t('formcheck.takePhoto')} onPress={() => void take()} />
            <Button title={t('formcheck.choosePhoto')} variant="secondary" onPress={() => void choose()} />
          </>
        }
      >
        <ErrorState
          title={
            reason === 'different_form'
              ? t('formcheck.differentFormTitle')
              : reason === 'not_lined_up'
                ? t('formcheck.notLinedUpTitle')
                : t('formcheck.failedTitle')
          }
          body={
            reason === 'different_form'
              ? t('formcheck.differentFormBody')
              : reason === 'not_lined_up'
                ? t('formcheck.notLinedUpBody')
                : t('formcheck.failedBody')
          }
        />
      </Screen>
    );
  }

  if (phase === 'result' && outcome?.ok && reading && template) {
    const findings = outcome.findings;
    const locale = i18n.language;
    const photoHeight = photoWidth * (reading.ocrHeight / reading.ocrWidth);
    const count = checkedCount(findings);
    const lookAgain = findings.filter((f) => f.state === 'look_again').length;
    const badges = placeBadges(findings, photoWidth, photoHeight);

    // Whatever needs doing next is the big button. With something to fix, that
    // is a new photo after fixing it; with nothing, it is keeping a copy.
    const again = (
      <Button
        title={t('formcheck.again')}
        variant={lookAgain > 0 ? 'primary' : 'secondary'}
        onPress={() => setPhase('intro')}
      />
    );
    const save =
      copy === 'saved' ? (
        <>
          <Body>{t('formcheck.copySaved')}</Body>
          <Button title={t('formcheck.done')} variant="quiet" onPress={() => router.back()} />
        </>
      ) : (
        <Button
          title={t('formcheck.saveCopy')}
          variant={lookAgain > 0 ? 'secondary' : 'primary'}
          busy={copy === 'saving'}
          onPress={() => void saveCopy()}
          accessibilityHint={t('formcheck.saveCopyHint')}
        />
      );

    return (
      <Screen
        footer={
          <>
            {lookAgain > 0 ? again : save}
            {lookAgain > 0 ? save : again}
            {copy === 'failed' ? <Caption>{t('formcheck.copyFailed')}</Caption> : null}
          </>
        }
      >
        {/* The answer first, in one line; the photo and the list are the proof. */}
        <View
          style={[styles.verdict, lookAgain > 0 ? styles.verdictAgain : styles.verdictDone]}
          accessibilityRole="summary"
        >
          <Text style={[styles.verdictText, { color: lookAgain > 0 ? color.red : color.green }]}>
            {lookAgain > 0 ? t('formcheck.lookAgainCount', { count: lookAgain }) : t('formcheck.allLooksDone')}
          </Text>
        </View>

        <View
          style={styles.photoFrame}
          onLayout={(e: LayoutChangeEvent) => setPhotoWidth(e.nativeEvent.layout.width)}
        >
          {photoWidth > 0 ? (
            <View style={{ width: photoWidth, height: photoHeight }}>
              <Image
                source={{ uri: reading.shownUri }}
                style={{ width: photoWidth, height: photoHeight }}
                accessibilityLabel={t('formcheck.photoAlt')}
              />
              {findings.map((finding, index) =>
                finding.ring ? (
                  <Ring key={index} ring={finding.ring} state={finding.state} width={photoWidth} height={photoHeight} />
                ) : null,
              )}
              {badges.map((badge) => (
                <View
                  key={badge.number}
                  pointerEvents="none"
                  style={[styles.badge, { left: badge.x, top: badge.y, backgroundColor: RING[badge.state] }]}
                >
                  <Text style={styles.badgeText}>{badge.number}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {findings.map((finding, index) => (
          <FindingRow
            key={index}
            number={index + 1}
            finding={finding}
            template={template}
            locale={locale}
            typed={typed}
            typedError={typedError}
            onType={setTyped}
            onUseTyped={applyTypedDate}
          />
        ))}

        <Card>
          <Body>{t('formcheck.summary', { count })}</Body>
          <Muted>{t('formcheck.proof')}</Muted>
          <Button
            title={t('checklist.openChecklist')}
            variant="secondary"
            onPress={() => router.push(`/checklist/${id}`)}
          />
        </Card>
        <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button title={t('formcheck.takePhoto')} onPress={() => void take()} disabled={!template} />
          <Button title={t('formcheck.choosePhoto')} variant="secondary" onPress={() => void choose()} disabled={!template} />
        </>
      }
    >
      <Body>{t('formcheck.intro')}</Body>
      <View style={styles.things}>
        {(['thingAnswers', 'thingSigned', 'thingDated'] as const).map((key, i) => (
          <View key={key} style={styles.thing}>
            <Text style={styles.thingNumber}>{i + 1}</Text>
            <Body style={styles.thingText}>{t(`formcheck.${key}`)}</Body>
          </View>
        ))}
      </View>
      <Muted>{t('formcheck.tip')}</Muted>
      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
    </Screen>
  );
}

const RING_PAD = 3;
const BADGE = 22;

function ringBox(ring: Quad, width: number, height: number): { left: number; top: number; w: number; h: number } {
  const xs = ring.map((p) => p.x * width);
  const ys = ring.map((p) => p.y * height);
  const left = Math.min(...xs) - RING_PAD;
  const top = Math.min(...ys) - RING_PAD;
  return { left, top, w: Math.max(...xs) - Math.min(...xs) + RING_PAD * 2, h: Math.max(...ys) - Math.min(...ys) + RING_PAD * 2 };
}

function Ring({ ring, state, width, height }: { ring: Quad; state: CheckState; width: number; height: number }) {
  const { left, top, w, h } = ringBox(ring, width, height);
  return (
    <View
      pointerEvents="none"
      style={[styles.ring, { left, top, width: w, height: h, borderColor: RING[state], borderRadius: Math.min(h, w) / 2 }]}
    />
  );
}

/**
 * Where each number goes: just left of its ring, vertically centred. Two
 * questions printed on neighbouring lines put their rings about 14pt apart on a
 * phone, closer than a badge is tall, so a badge that would land on an earlier
 * one steps further left until it is clear.
 */
function placeBadges(
  findings: readonly Finding[],
  width: number,
  height: number,
): { number: number; state: CheckState; x: number; y: number }[] {
  const placed: { number: number; state: CheckState; x: number; y: number }[] = [];
  findings.forEach((finding, index) => {
    if (!finding.ring || width === 0) return;
    const box = ringBox(finding.ring, width, height);
    const y = box.top + box.h / 2 - BADGE / 2;
    let x = Math.max(0, box.left - BADGE - 2);
    while (x > 0 && placed.some((p) => Math.abs(p.y - y) < BADGE && Math.abs(p.x - x) < BADGE)) x = Math.max(0, x - BADGE - 2);
    placed.push({ number: index + 1, state: finding.state, x, y });
  });
  return placed;
}

function FindingRow({
  number,
  finding,
  template,
  locale,
  typed,
  typedError,
  onType,
  onUseTyped,
}: {
  number: number;
  finding: Finding;
  template: FormTemplate;
  locale: string;
  typed: string;
  typedError: boolean;
  onType: (value: string) => void;
  onUseTyped: () => void;
}) {
  const { t } = useTranslation();
  const stateLabel =
    finding.state === 'looks_done'
      ? t('formcheck.stateLooksDone')
      : finding.state === 'look_again'
        ? t('formcheck.stateLookAgain')
        : t('formcheck.stateNotChecked');

  let heading: string;
  let message: string;
  let rule: keyof FormTemplate['rules'];
  switch (finding.kind) {
    case 'question':
      heading = t('formcheck.question', { number: finding.number });
      rule = 'answered';
      message =
        finding.why === 'one_box'
          ? t('formcheck.qOneBox')
          : finding.why === 'no_box'
            ? t('formcheck.qNoBox')
            : finding.why === 'both_boxes'
              ? t('formcheck.qBothBoxes')
              : t('formcheck.qNotFound');
      break;
    case 'signature':
      heading = t('formcheck.signature');
      rule = 'signed';
      message =
        finding.why === 'signed' ? t('formcheck.sigSigned') : finding.why === 'no_signature' ? t('formcheck.sigNone') : t('formcheck.rowNotFound');
      break;
    case 'date': {
      heading = t('formcheck.date');
      rule = 'dated_after_report_month';
      const written = finding.written ? formatDate(finding.written, locale) : '';
      const ends = finding.reportMonthEnds ? formatDate(finding.reportMonthEnds, locale) : '';
      message =
        finding.why === 'after_report_month'
          ? t('formcheck.dateOk', { written, ends })
          : finding.why === 'too_early'
            ? t('formcheck.dateTooEarly', { written, ends })
            : finding.why === 'not_dated'
              ? t('formcheck.dateNone')
              : finding.why === 'unreadable'
                ? t('formcheck.dateUnreadable')
                : finding.why === 'no_report_month'
                  ? t('formcheck.dateNoMonth')
                  : t('formcheck.rowNotFound');
      break;
    }
  }

  const accent = RING[finding.state];
  return (
    <View
      style={[styles.finding, { borderLeftColor: accent }]}
      accessible
      accessibilityLabel={`${number}. ${heading}. ${stateLabel}. ${message}`}
    >
      <View style={styles.findingHeader}>
        <View style={[styles.findingNumber, { backgroundColor: accent }]}>
          <Text style={styles.badgeText}>{number}</Text>
        </View>
        <Text style={styles.findingHeading}>{heading}</Text>
        <Text style={[styles.findingState, { color: accent }]}>{stateLabel}</Text>
      </View>
      <Body>{message}</Body>
      {finding.kind === 'date' && finding.why === 'unreadable' ? (
        <View style={styles.typeRow}>
          <TextInput
            value={typed}
            onChangeText={onType}
            placeholder={t('formcheck.typeDate')}
            placeholderTextColor={color.textFaint}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            accessibilityLabel={t('formcheck.typeDate')}
            returnKeyType="done"
            onSubmitEditing={onUseTyped}
          />
          <Button title={t('formcheck.useDate')} variant="secondary" onPress={onUseTyped} />
          {typedError ? <Caption>{t('formcheck.badDate')}</Caption> : null}
        </View>
      ) : null}
      {finding.state === 'look_again' ? (
        <Caption>{t('formcheck.ifNot', { text: template.rules[rule].ifNot })}</Caption>
      ) : (
        <Caption>{t('formcheck.formSays', { text: template.rules[rule].formSays })}</Caption>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xl * 2 },
  things: { gap: space.sm },
  thing: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  thingNumber: { ...type.subheading, color: color.accent, minWidth: 20 },
  thingText: { flex: 1 },

  photoFrame: { width: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.surface },
  ring: { position: 'absolute', borderWidth: 3 },
  badge: {
    position: 'absolute',
    minWidth: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  verdict: { padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  verdictAgain: { backgroundColor: color.redSoft, borderColor: color.red },
  verdictDone: { backgroundColor: color.greenSoft, borderColor: color.green },
  verdictText: { ...type.subheading },
  badgeText: { ...type.label, color: '#FFFFFF' },

  finding: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderLeftWidth: 5,
  },
  findingHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  findingNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  findingHeading: { ...type.subheading, color: color.text, flex: 1 },
  findingState: { ...type.label },
  typeRow: { gap: space.sm },
  input: {
    ...type.heading,
    color: color.text,
    minHeight: touchTarget,
    borderBottomWidth: 2,
    borderBottomColor: color.accent,
    paddingVertical: space.sm,
  },
});

