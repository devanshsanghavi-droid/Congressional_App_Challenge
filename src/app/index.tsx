import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';

/**
 * Phase 1 build-check screen.
 *
 * Its only job right now is to prove the dev client actually launched on the
 * phone with translations wired up. It gets replaced by the real Home screen
 * (SPEC §7 — one card per active benefit, countdown to the nearest deadline)
 * in Phase 3.
 *
 * Even this throwaway screen follows the two rules that apply everywhere:
 * every string comes from i18n rather than being hardcoded English
 * (CLAUDE.md), and body text is at least 16pt and free to scale with Dynamic
 * Type (SPEC §7 design constraints).
 */
export default function BuildCheckScreen() {
  const { t, i18n } = useTranslation();

  const rows: { label: string; value: string }[] = [
    { label: t('dev.platform'), value: `${Platform.OS} ${String(Platform.Version)}` },
    { label: t('dev.appVersion'), value: Constants.expoConfig?.version ?? '—' },
    { label: t('dev.locale'), value: i18n.language },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.tagline} accessibilityRole="header">
        {t('app.tagline')}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('dev.title')}
        </Text>
        <Text style={styles.cardBody}>{t('dev.subtitle')}</Text>

        {rows.map((row) => (
          <View key={row.label} style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.disclaimer}>{t('disclaimer.notLegalAdvice')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20 },
  tagline: { fontSize: 24, fontWeight: '600', lineHeight: 32 },
  card: { gap: 12, padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#8E8E93' },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  cardBody: { fontSize: 16, lineHeight: 22 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 44, alignItems: 'center' },
  rowLabel: { fontSize: 16, flexShrink: 1 },
  rowValue: { fontSize: 16, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  disclaimer: { fontSize: 16, lineHeight: 22, fontStyle: 'italic' },
});
