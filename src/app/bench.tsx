import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

import {
  MODELS,
  formatBytes,
  downloadModel,
  deleteModel,
  findDownloadedModel,
  type DownloadedModel,
  type ModelId,
} from '@/lib/llm/model';
import { runBenchmark, formatResultsAsMarkdown, type BenchmarkResult } from '@/lib/llm/benchmark';
import { BENCHMARK_CASES } from '@/lib/llm/benchmark-fixtures';

/**
 * The week 1 latency gate, as a screen you can run on the actual phone.
 *
 * This is a developer tool, not a product screen — it does not appear in
 * navigation and gets deleted before the feature freeze. It exists because the
 * single most important number in this project ("is a 1.5B model fast enough to
 * be worth watching?") can only be measured on real hardware. A simulator runs
 * on the Mac's CPU and would tell us nothing about an iPhone's Metal
 * performance.
 *
 * Output is a markdown table that pastes straight into NOTES.md.
 */
export default function BenchmarkScreen() {
  const { t } = useTranslation();

  const [modelId, setModelId] = useState<ModelId>('qwen2.5-1.5b-instruct-q4_k_m');
  const [downloaded, setDownloaded] = useState<DownloadedModel | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const spec = MODELS[modelId];

  // Tokens arrive faster than React should re-render, so they are buffered and
  // flushed on a timer. Without this the UI spends more time rendering than the
  // model spends generating, which would corrupt the very number we are
  // measuring.
  const streamBuffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    setDownloaded(findDownloadedModel(spec));
  }, [spec]);

  const onDownload = useCallback(async () => {
    setError(null);
    setDownloadPercent(0);
    try {
      const result = await downloadModel(spec, (progress) => {
        setDownloadPercent(Math.round((progress.fraction ?? 0) * 100));
      });
      setDownloaded(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadPercent(null);
    }
  }, [spec]);

  const onDelete = useCallback(() => {
    deleteModel(spec);
    setDownloaded(null);
    setResults([]);
  }, [spec]);

  const onRun = useCallback(async () => {
    setError(null);
    setRunning(true);
    setResults([]);
    setStreamed('');
    streamBuffer.current = '';

    flushTimer.current = setInterval(() => {
      if (streamBuffer.current.length > 0) {
        setStreamed((prev) => (prev + streamBuffer.current).slice(-2000));
        streamBuffer.current = '';
      }
    }, 100);

    try {
      const benchmarkResults = await runBenchmark(spec, BENCHMARK_CASES, {
        onToken: (token) => {
          streamBuffer.current += token;
        },
      });
      setResults(benchmarkResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (flushTimer.current !== null) {
        clearInterval(flushTimer.current);
        flushTimer.current = null;
      }
      setRunning(false);
    }
  }, [spec]);

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(formatResultsAsMarkdown(results));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results]);

  return (
    <ScrollView contentContainerStyle={styles.container} onLayout={refresh}>
      <Text style={styles.title} accessibilityRole="header">
        {t('bench.title')}
      </Text>
      <Text style={styles.body}>{t('bench.subtitle')}</Text>

      <View style={styles.row}>
        {(Object.keys(MODELS) as ModelId[]).map((id) => (
          <Pressable
            key={id}
            onPress={() => {
              setModelId(id);
              setResults([]);
            }}
            style={[styles.chip, modelId === id && styles.chipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: modelId === id }}
          >
            <Text style={styles.chipText}>{MODELS[id].parameters}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{spec.label}</Text>
        <Text style={styles.body}>
          {downloaded === null
            ? t('bench.notDownloaded')
            : t('bench.downloaded', { size: formatBytes(downloaded.bytes) })}
        </Text>

        {downloaded === null ? (
          <>
            <Text style={styles.warning}>
              {t('bench.wifiWarning', { size: formatBytes(spec.approxBytes) })}
            </Text>
            <Button
              label={
                downloadPercent === null
                  ? t('bench.download')
                  : t('bench.downloading', { percent: downloadPercent })
              }
              onPress={onDownload}
              disabled={downloadPercent !== null}
            />
          </>
        ) : (
          <>
            <Button label={running ? t('bench.running') : t('bench.run')} onPress={onRun} disabled={running} />
            <Button label={t('bench.delete')} onPress={onDelete} disabled={running} variant="secondary" />
          </>
        )}
      </View>

      {error !== null && (
        <View style={styles.errorBox}>
          <Text style={styles.cardTitle}>{t('bench.error')}</Text>
          <Text style={styles.body}>{error}</Text>
        </View>
      )}

      {running && (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.cardTitle}>{t('bench.stream')}</Text>
          <Text style={styles.mono}>{streamed}</Text>
        </View>
      )}

      {results.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('bench.results')}</Text>
          {results.map((r) => (
            <View key={r.name} style={styles.resultRow}>
              <Text style={styles.resultName}>{r.name}</Text>
              <Text style={styles.body}>
                prefill {r.promptTokens} tok @ {r.promptPerSecond}/s · gen {r.predictedTokens} tok @{' '}
                {r.predictedPerSecond}/s
              </Text>
              <Text style={styles.body}>
                first token {(r.timeToFirstTokenMs / 1000).toFixed(1)}s · total{' '}
                {(r.totalMs / 1000).toFixed(1)}s · JSON {r.outputIsValidJson ? '✓' : '✗'}
              </Text>
            </View>
          ))}
          <Button label={copied ? t('bench.copied') : t('bench.copy')} onPress={onCopy} />
        </View>
      )}
    </ScrollView>
  );
}

function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.button, variant === 'secondary' && styles.buttonSecondary, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  mono: { fontSize: 13, fontFamily: 'Menlo', lineHeight: 18 },
  warning: { fontSize: 16, lineHeight: 22, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#8E8E93',
  },
  chipSelected: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  chipText: { fontSize: 16, fontWeight: '600' },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8E8E93',
  },
  errorBox: { gap: 8, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#D70015' },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  resultRow: { gap: 4, paddingVertical: 8 },
  resultName: { fontSize: 16, fontWeight: '600' },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#208AEF',
  },
  buttonSecondary: { backgroundColor: '#8E8E93' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
