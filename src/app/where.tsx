/**
 * Where to Go — the offices, offline.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7). **The data is not mine**: every
 * address, phone number and opening time comes from `content/offices.json`,
 * sourced and dated by hand. Nothing on this screen is computed or inferred.
 *
 * ---------------------------------------------------------------------------
 * THE POINT OF IT BEING OFFLINE
 * ---------------------------------------------------------------------------
 * This is the screen someone opens **standing outside**, or on a bus, on a
 * phone with no data left in the month. A list of county offices is trivially
 * googleable with a connection; the version that works without one is the one
 * that is worth having, and it is the same argument as the rest of the app.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES, BOTH FROM CLAUDE.md §16
 * ---------------------------------------------------------------------------
 * **1. Every entry carries "call to confirm".** Not once at the top of the
 * screen — on every office, next to its hours. Hours change, offices close, and
 * a stale opening time sends someone on a bus trip with two children to a
 * locked door. `confirmHoursNote` is required by the parser: an office cannot
 * exist in the pack without one, so this line cannot be forgotten for one entry.
 *
 * **2. "What to bring" prefers the real checklist.** The pack has a generic
 * fallback list and it is explicitly labelled as one. When the user has an
 * active notice with requirements on it, those are shown instead, because the
 * letter is the only authority on what that letter needs.
 *
 * This is **priority 8 of 8** and the first thing to cut (§10). It is built to
 * be cuttable: one route, no other screen links into it except Settings, and
 * deleting the file plus its `<Stack.Screen>` removes it cleanly.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, ErrorState, Muted, Screen, Section } from '@/components/ui';
import { loadDocTypes, loadOffices } from '@/lib/content';
import type { OfficeLocation, OfficesPack } from '@/lib/content/types';
import { listActiveNotices } from '@/lib/db/notices';
import { listRequirements } from '@/lib/db/checklist';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

export default function WhereToGoScreen() {
  const { t, i18n } = useTranslation();
  const spanish = i18n.language.startsWith('es');

  const [pack, setPack] = useState<OfficesPack | 'failed'>();
  /** Doc-type labels from the nearest deadline's checklist, if there is one. */
  const [bringing, setBringing] = useState<string[]>();

  const load = useCallback(() => {
    try {
      setPack(loadOffices());
    } catch {
      setPack('failed');
    }

    // Best effort, and deliberately not blocking: the office list is the point
    // of this screen and it must render even if the database is unavailable.
    void (async () => {
      try {
        const notices = await listActiveNotices();
        const nearest = notices[0];
        if (!nearest) {
          setBringing([]);
          return;
        }
        const requirements = await listRequirements(nearest.id);
        const types = loadDocTypes().byId;
        setBringing(
          requirements
            .filter((r) => r.state !== 'not_applicable')
            .map((r) => {
              if (r.label !== undefined && r.label !== '') return r.label;
              if (r.docType === undefined) return undefined;
              const found = types.get(r.docType);
              return found ? (spanish ? found.labelEs : found.label) : r.docType;
            })
            .filter((label): label is string => label !== undefined),
        );
      } catch {
        setBringing([]);
      }
    })();
  }, [spanish]);

  useFocusEffect(useCallback(() => void load(), [load]));

  if (pack === 'failed') {
    return (
      <Screen>
        <ErrorState
          title={t('where.errorTitle')}
          body={t('where.errorBody')}
          action={<Button title={t('common.tryAgain')} onPress={load} variant="secondary" />}
        />
      </Screen>
    );
  }
  if (pack === undefined) return <Screen>{null}</Screen>;

  const call = (number: string) => () => void Linking.openURL(`tel:${number}`);

  return (
    <Screen>
      <Body>{t('where.intro')}</Body>

      {/* Phones first. The pack's own advice is that calling beats going, and
          burying that under six addresses would be the app disagreeing with its
          own sourced content. */}
      <Section title={t('where.callFirst')}>
        {pack.countyPhones.map((phone) => (
          <View key={`${phone.label}-${phone.number}`} style={styles.phone}>
            <Text style={styles.phoneLabel}>{phone.label}</Text>
            <Pressable
              onPress={call(phone.number)}
              accessibilityRole="link"
              accessibilityLabel={t('where.callNumber', { number: phone.number })}
              style={styles.link}
            >
              <Text style={styles.linkText}>{phone.number}</Text>
            </Pressable>
          </View>
        ))}
        <Muted>{pack.phoneTip}</Muted>

        <View style={styles.access}>
          <Text style={styles.accessTitle}>{t('where.accessibilityTitle')}</Text>
          <Body>{pack.accessibilityNote}</Body>
          <Pressable
            onPress={call(pack.accessibilityLine)}
            accessibilityRole="link"
            accessibilityLabel={t('where.callNumber', { number: pack.accessibilityLine })}
            style={styles.link}
          >
            <Text style={styles.linkText}>{pack.accessibilityLine}</Text>
          </Pressable>
        </View>
      </Section>

      <Section title={t('where.whatToBring')}>
        {bringing === undefined ? null : bringing.length > 0 ? (
          <>
            {/* Rule 2: the letter's own list, when there is one. */}
            <Muted>{t('where.fromYourNotice')}</Muted>
            {bringing.map((item) => (
              <Text key={item} style={styles.bullet}>
                {`•  ${item}`}
              </Text>
            ))}
            <Caption>{t('where.alsoAlways')}</Caption>
            {pack.whatToBringAlways.map((item) => (
              <Text key={item} style={styles.bullet}>
                {`•  ${item}`}
              </Text>
            ))}
          </>
        ) : (
          <>
            {/* Labelled as generic, because it is. */}
            <Muted>{t('where.genericList')}</Muted>
            {[...pack.whatToBringAlways, ...pack.whatToBringUsually].map((item) => (
              <Text key={item} style={styles.bullet}>
                {`•  ${item}`}
              </Text>
            ))}
          </>
        )}
      </Section>

      <Section title={t('where.countyOffices')}>
        <Muted>{pack.countyAgency}</Muted>
        <Body>{t('where.languagesSpoken', { list: pack.languages.join(', ') })}</Body>
        {pack.dropBoxNote ? <Body>{pack.dropBoxNote}</Body> : null}
        {pack.countyLocations.map((office) => (
          <OfficeCard key={office.id} office={office} />
        ))}
      </Section>

      <Section title={t('where.ssaOffices')}>
        <Muted>{pack.ssaAgency}</Muted>
        <Pressable
          onPress={call(pack.ssaNationalPhone)}
          accessibilityRole="link"
          accessibilityLabel={t('where.callNumber', { number: pack.ssaNationalPhone })}
          style={styles.link}
        >
          <Text style={styles.linkText}>{pack.ssaNationalPhone}</Text>
        </Pressable>
        {pack.ssaLocations.map((office) => (
          <OfficeCard key={office.id} office={office} />
        ))}
      </Section>

      {/* This list is not complete, and saying so is better than a short list
          that reads as exhaustive.

          What is NOT rendered here is `pack.stillNeeded`. Those entries are a
          work list written for whoever sources the content — "Not yet
          researched -- add name, address, phone, hours, languages" — and they
          were on screen until a device check caught them. Second time a
          developer note has reached a user through a content pack (the first
          was `_disclaimer_required`, which was phrased as an instruction to the
          renderer). **A string in a content pack is user-facing unless it is
          proven otherwise**, and `stillNeeded` is proven otherwise: it is
          surfaced by `npm run content:check`, where its audience is. */}
      {pack.stillNeeded.length > 0 ? (
        <Section title={t('where.notHereTitle')}>
          <Body>{t('where.notHereBody')}</Body>
        </Section>
      ) : null}

      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
    </Screen>
  );
}

function OfficeCard({ office }: { office: OfficeLocation }) {
  const { t } = useTranslation();
  const address = `${office.address}, ${office.city}, ${office.state} ${office.zip}`;

  return (
    <Card>
      <Text style={styles.officeName}>{office.name}</Text>
      {office.purpose ? <Body>{office.purpose}</Body> : null}

      <Pressable
        onPress={() => void Linking.openURL(`maps:0,0?q=${encodeURIComponent(address)}`)}
        accessibilityRole="link"
        accessibilityLabel={t('where.openInMaps', { name: office.name })}
        style={styles.link}
      >
        <Text style={styles.address}>{office.address}</Text>
        <Text style={styles.address}>
          {office.city}, {office.state} {office.zip}
        </Text>
      </Pressable>

      {/* Walk-in or not is the question that decides whether the trip is worth
          making, so it is a labelled fact rather than a footnote. */}
      <Text style={office.walkIn ? styles.walkIn : styles.appointment}>
        {office.walkIn === undefined
          ? t('where.walkInUnknown')
          : office.walkIn
            ? t('where.walkInYes')
            : t('where.walkInNo')}
      </Text>

      {office.hours ? <Body>{office.hours}</Body> : <Muted>{t('where.hoursUnknown')}</Muted>}

      {/* Rule 1: on every entry, never once at the top of the screen. */}
      <Caption>{office.confirmHoursNote}</Caption>
      <Caption>{t('where.checkedOn', { date: office.verifiedOn })}</Caption>
    </Card>
  );
}

const styles = StyleSheet.create({
  phone: { gap: space.xs, paddingVertical: space.sm },
  phoneLabel: { ...type.body, color: color.textMuted },

  access: {
    gap: space.sm,
    padding: space.lg,
    marginTop: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: color.border,
  },
  accessTitle: { ...type.bodyStrong, color: color.text },

  officeName: { ...type.subheading, color: color.text },
  address: { ...type.body, color: color.accent },

  walkIn: { ...type.bodyStrong, color: color.green },
  appointment: { ...type.bodyStrong, color: color.amber },

  bullet: { ...type.body, color: color.text, paddingVertical: 2 },

  link: { minHeight: touchTarget, justifyContent: 'center' },
  linkText: { ...type.bodyStrong, color: color.accent },
});
