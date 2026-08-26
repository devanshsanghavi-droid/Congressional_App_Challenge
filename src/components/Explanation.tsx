/**
 * The plain-language explanation, with its guardrails on screen.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * CLAUDE.md §4 lists five guardrails and says they must be **visible in the UI,
 * not quiet internal rules**. Where each one lives:
 *
 *   1. Original one tap away — the "Check it yourself" section of Notice
 *      Detail, on the same screen, always.
 *   2. Visibly labelled machine-generated — the line under the heading, before
 *      the text, never after it.
 *   3. Never a deadline that was not confirmed — structural, but not the way
 *      it once was. The explanation has **no "by when" section**: that date is
 *      rendered by Notice Detail from the confirmed field and the model is
 *      never asked for it. `checkExplanation` then withholds the whole
 *      explanation if any date appears in the prose that is not one the user
 *      confirmed. See `explain-grammar.ts` for the two designs this replaced.
 *   4. Never tells a user they are ineligible — `checkExplanation`, and if it
 *      fires the explanation is withheld rather than shown with a caveat.
 *   5. Only restates the source — same check; any date not traceable to a
 *      confirmed field withholds the whole thing.
 *
 * On demand behind a tap, so nothing in the product waits on inference.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Muted } from '@/components/ui';
import { explain } from '@/lib/llm/explain';
import type { ExplainRequest, ExplainStatus } from '@/lib/llm/explain';
import { MODELS, modelFile } from '@/lib/llm/model';
import { color, radius, space, type } from '@/lib/theme/tokens';

const SPEC = MODELS['qwen2.5-1.5b-instruct-q4_k_m'];

export function Explanation(props: Omit<ExplainRequest, 'spec'>) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ExplainStatus>({ state: 'idle' });

  const start = useCallback(() => {
    void explain({ ...props, spec: SPEC }, setStatus);
  }, [props]);

  // Not downloaded is not an error. It is the ordinary state for most users and
  // the app is complete without it, so it says what the feature is and offers
  // it — it does not apologise.
  if (status.state === 'idle' && !modelFile(SPEC).exists) {
    return (
      <View style={styles.offer}>
        <Muted>{t('explain.notDownloaded')}</Muted>
      </View>
    );
  }

  if (status.state === 'idle') {
    return <Button title={t('explain.action')} variant="secondary" onPress={start} />;
  }

  if (status.state === 'loading') {
    return (
      <View style={styles.busy}>
        <ActivityIndicator color={color.accent} />
        <Muted>{t('explain.loading')}</Muted>
      </View>
    );
  }

  if (status.state === 'streaming') {
    return (
      <View style={styles.panel}>
        <Text style={styles.machineLabel}>{t('explain.machineLabel')}</Text>
        {/* The text appears as it is written. A blank minute reads as a hang,
            and watching it write is the point. */}
        <Body>{status.partial}</Body>
        <View style={styles.busy}>
          <ActivityIndicator color={color.accent} />
          <Caption>{t('explain.writing')}</Caption>
        </View>
      </View>
    );
  }

  if (status.state === 'withheld') {
    // Deliberately not shown with a warning attached. An explanation that
    // failed its own check is not improved by a caveat — it is withheld, and
    // the original text is one tap away on this same screen.
    return (
      <View style={styles.withheld}>
        <Text style={styles.withheldTitle}>{t('explain.withheldTitle')}</Text>
        <Body>{t('explain.withheldBody')}</Body>
        <Caption>{t('explain.withheldReason', { reason: status.reason })}</Caption>
      </View>
    );
  }

  if (status.state === 'failed') {
    return (
      <View style={styles.withheld}>
        <Text style={styles.withheldTitle}>{t('explain.failedTitle')}</Text>
        <Body>
          {status.reason === 'model-missing' ? t('explain.notDownloaded') : t('explain.failedBody')}
        </Body>
        {status.reason !== 'model-missing' ? (
          <Button title={t('common.tryAgain')} variant="secondary" onPress={start} />
        ) : null}
      </View>
    );
  }

  const { sections } = status;
  return (
    <View style={styles.panel}>
      {/* Guardrail 2, before the text rather than after it. */}
      <Text style={styles.machineLabel}>{t('explain.machineLabel')}</Text>
      {/* Three, not four. There is no "by when" line here: Notice Detail
          renders the confirmed deadline itself, higher up this screen, and the
          model is never asked for it. See `explain-grammar.ts` — removing that
          section is what fixed the guardrail, not a stricter check. */}
      <ExplanationLine label={t('detail.whatThisSays')} text={sections.says} />
      <ExplanationLine label={t('detail.whatYouMustDo')} text={sections.doing} />
      <ExplanationLine label={t('detail.howToAppeal')} text={sections.appeal} />
    </View>
  );
}

function ExplanationLine({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Body>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  offer: { paddingVertical: space.sm },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  panel: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: color.border,
  },
  machineLabel: { ...type.caption, color: color.textMuted },
  line: { gap: space.xs },
  lineLabel: { ...type.label, color: color.textMuted },

  withheld: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.neutralSoft,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  withheldTitle: { ...type.subheading, color: color.text },
});
