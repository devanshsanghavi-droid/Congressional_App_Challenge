/**
 * "Worth checking" — the cross-reference section on Notice Detail.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * THE LINE THIS FEATURE STANDS ON
 * ---------------------------------------------------------------------------
 * SPEC §10 forbids eligibility screening outright, and this section sits
 * directly beside that line. CLAUDE.md §4 states the three rules that keep it
 * on the permitted side, and all three are structural here rather than
 * intentions:
 *
 * 1. **Population-level phrasing only.** Every visible sentence is either from
 *    the content pack — where `requirePopulationLevelPhrasing()` rejects "you
 *    may qualify" at parse time, in both languages — or from `en.json`/`es.json`
 *    written the same way. The heading is a question about programmes, not a
 *    claim about the reader.
 *
 * 2. **Keyed on programme and county only.** This component receives one
 *    argument that selects content: `program`. It has no access to household
 *    size, income or age, and it does not take a `Notice`, so it cannot reach
 *    for them. *If this component ever needs an eligibility input, the feature
 *    has crossed the line and should be deleted rather than parameterised.*
 *
 * 3. **The public-charge note renders inline**, above the list, never behind a
 *    link or a disclosure. Suggesting extra benefit programmes to a
 *    mixed-status household is precisely where fear does its damage, so the
 *    reassurance travels with the suggestion and cannot be scrolled past on the
 *    way to it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS LAST ON THE SCREEN
 * ---------------------------------------------------------------------------
 * CLAUDE.md §2: Carta is a deadline tracker. Nothing may take visual priority
 * from the countdown, and this is the least urgent content on Notice Detail —
 * a person opened this screen to find out when their SAR 7 is due, not to
 * browse programmes. It renders below "Check it yourself" so that the trust
 * affordance (guardrail 1, the original one tap away) stays above it.
 *
 * `verified_on` is rendered per entry, because CLAUDE.md §16 requires content
 * to carry its provenance, and because a programme list that is quietly two
 * years stale sends someone to an office that no longer runs the programme.
 */

import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { loadCrossReferences } from '@/lib/content';
import type { CrossReferenceEntry } from '@/lib/content/types';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

import { Body, Caption, Muted, Section } from './ui';

interface Props {
  /**
   * The confirmed programme on this notice. The ONLY selector. Adding a second
   * one that is an eligibility input turns this into a determination — see the
   * header.
   */
  readonly program: string | undefined;
}

export function WorthChecking({ program }: Props): React.JSX.Element | null {
  const { t, i18n } = useTranslation();

  // Parsing throws on malformed content by design, and a bad content pack must
  // not take down a screen whose real job is the deadline. Failing to nothing
  // is right here specifically because this section is supplementary: there is
  // no partial state worth showing and nothing the user could do about it.
  let entries: readonly CrossReferenceEntry[] = [];
  let note: { text: string; sourceUrl: string; verifiedOn: string } | undefined;
  let disclaimer = '';
  try {
    const pack = loadCrossReferences();
    entries = (program === undefined ? undefined : pack.byProgram.get(program)) ?? [];
    note = {
      text: i18n.language.startsWith('es') ? pack.publicChargeNote.es : pack.publicChargeNote.en,
      sourceUrl: pack.publicChargeNote.sourceUrl,
      verifiedOn: pack.publicChargeNote.verifiedOn,
    };
    disclaimer = i18n.language.startsWith('es') ? pack.disclaimerEs : pack.disclaimer;
  } catch {
    return null;
  }

  // No entry for this programme is not an error and not an empty state to
  // decorate — there is simply nothing to cross-reference, and a card saying so
  // would be noise on a screen that is about a deadline.
  if (entries.length === 0 || note === undefined) return null;

  const spanish = i18n.language.startsWith('es');

  // The OLDEST date in the section, not the newest: the section is only as
  // fresh as its stalest entry, and rounding that up would overstate it.
  const sectionVerifiedOn = entries.reduce(
    (oldest, entry) => (entry.verifiedOn < oldest ? entry.verifiedOn : oldest),
    entries[0]?.verifiedOn ?? '',
  );

  return (
    <Section title={t('worthChecking.title')}>
      {/* Population-level, and it names the programme rather than the reader. */}
      <Body>{t('worthChecking.intro', { program })}</Body>

      {/* Rule 3: inline, above the list, never behind a link. */}
      <View style={styles.publicCharge}>
        <Text style={styles.publicChargeTitle}>{t('worthChecking.publicChargeTitle')}</Text>
        <Body>{note.text}</Body>
        <Caption>{t('worthChecking.verifiedOn', { date: note.verifiedOn })}</Caption>
      </View>

      {entries.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <Text style={styles.entryName}>{entry.name}</Text>
          <Body>{spanish ? entry.whatEs : entry.what}</Body>

          {/* `categorical_eligibility` is the difference between "receipt of
              this programme establishes eligibility by rule" and "these two
              commonly go together". Both are stated about a population; saying
              which is which is what stops the weaker one reading as the
              stronger one. */}
          <Muted>
            {entry.categoricalEligibility
              ? t('worthChecking.categorical', { program })
              : t('worthChecking.common', { program })}
          </Muted>

          {entry.applyUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(entry.applyUrl ?? '')}
              accessibilityRole="link"
              accessibilityLabel={t('worthChecking.openApply', { name: entry.name })}
              style={styles.link}
            >
              <Text style={styles.linkText}>{t('worthChecking.howToApply')}</Text>
            </Pressable>
          ) : null}

          {/* Only when this entry was checked on a different day from the rest
              of the section. Repeating an identical date under every card was
              five lines of noise that stopped being read, which defeats the
              point of showing provenance at all. */}
          {entry.verifiedOn === sectionVerifiedOn ? null : (
            <Caption>{t('worthChecking.verifiedOn', { date: entry.verifiedOn })}</Caption>
          )}
        </View>
      ))}

      <Caption>{t('worthChecking.verifiedOn', { date: sectionVerifiedOn })}</Caption>

      {/* From the pack, not from i18n: the pack declares this string mandatory
          on every rendering, so it travels with the data it qualifies rather
          than living somewhere it could drift away from. Both languages are
          required at parse time, and both are run through the phrasing check. */}
      <Caption>{disclaimer}</Caption>
    </Section>
  );
}

const styles = StyleSheet.create({
  publicCharge: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: color.border,
  },
  publicChargeTitle: { ...type.bodyStrong, color: color.text },

  entry: {
    gap: space.xs,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  entryName: { ...type.subheading, color: color.text },

  link: { minHeight: touchTarget, justifyContent: 'center' },
  linkText: { ...type.bodyStrong, color: color.accent },
});
