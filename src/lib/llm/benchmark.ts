import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';

import { type ModelSpec, modelPath } from './model';

/**
 * The week 1 latency gate (SPEC §9).
 *
 * The whole v2 architecture rests on a 1.5B model being fast enough on a real
 * iPhone to be worth watching in a 2:30 video. This module measures that before
 * anything is built on top of it, and the numbers it produces go into NOTES.md
 * and then into written answer #4 — they are a deliverable, not just an input
 * to a go/no-go.
 *
 * What is measured and why each number matters:
 *
 *   loadMs            One-time cost of mapping the model into memory. Paid once
 *                     per app launch, so it belongs in the launch experience,
 *                     not in the per-notice cost.
 *
 *   promptPerSecond   Prefill speed — how fast the model reads the OCR text.
 *                     This is the number the region-selection optimisation
 *                     attacks: prompt tokens dominate on a dense form, and most
 *                     of a form is boilerplate we never needed to send.
 *
 *   predictedPerSecond  Generation speed. Governs how the streamed explanation
 *                     *feels*. Below roughly reading speed it looks laboured.
 *
 *   totalMs           What the user actually waits. The only number that
 *                     honestly answers "is this demoable".
 *
 * Everything here is timed by llama.cpp itself via the `timings` field rather
 * than with wall-clock timers around the call, so prefill and generation are
 * separated properly instead of being smeared together.
 */

export interface BenchmarkCase {
  /** Short label for the results table. */
  name: string;
  /** The full prompt as it will be sent. */
  prompt: string;
  /** Optional GBNF grammar to constrain decoding. */
  grammar?: string;
  /** Upper bound on generated tokens. */
  maxTokens: number;
}

export interface BenchmarkResult {
  name: string;
  modelLabel: string;
  grammarConstrained: boolean;

  loadMs: number;

  promptTokens: number;
  promptMs: number;
  promptPerSecond: number;

  predictedTokens: number;
  predictedMs: number;
  predictedPerSecond: number;

  /** Prefill + generation, i.e. what the user waits after the model is loaded. */
  totalMs: number;
  /** Wall-clock from calling completion to the first token arriving. */
  timeToFirstTokenMs: number;

  output: string;
  /** True when `output` parses as JSON — the point of grammar-constrained decoding. */
  outputIsValidJson: boolean;
}

export interface BenchmarkOptions {
  /** Layers offloaded to Metal. 99 means "all of them" and is what we want on iOS. */
  gpuLayers?: number;
  contextTokens?: number;
  onToken?: (token: string) => void;
}

/**
 * Loads a model, runs every case against it, and releases it.
 *
 * The context is created once and reused across cases so that load time is
 * attributed correctly — charging every case for a fresh model load would make
 * the per-notice cost look several times worse than it is.
 */
export async function runBenchmark(
  spec: ModelSpec,
  cases: BenchmarkCase[],
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult[]> {
  const { gpuLayers = 99, contextTokens = spec.contextTokens, onToken } = options;

  const loadStart = Date.now();
  let context: LlamaContext | null = null;

  try {
    context = await initLlama({
      model: modelPath(spec),
      n_ctx: contextTokens,
      n_gpu_layers: gpuLayers,
    });
    const loadMs = Date.now() - loadStart;

    const results: BenchmarkResult[] = [];

    for (const testCase of cases) {
      let firstTokenAt: number | null = null;
      const completionStart = Date.now();

      const completion = await context.completion(
        {
          prompt: testCase.prompt,
          n_predict: testCase.maxTokens,
          // Greedy. Reproducibility matters more than variety here: two runs of
          // the same benchmark should differ because the device differed, not
          // because sampling did.
          temperature: 0,
          ...(testCase.grammar !== undefined ? { grammar: testCase.grammar } : {}),
        },
        (data) => {
          firstTokenAt ??= Date.now();
          onToken?.(data.token);
        }
      );

      const timings = completion.timings;
      const output = completion.text.trim();

      results.push({
        name: testCase.name,
        modelLabel: spec.label,
        grammarConstrained: testCase.grammar !== undefined,
        loadMs,
        promptTokens: timings?.prompt_n ?? 0,
        promptMs: Math.round(timings?.prompt_ms ?? 0),
        promptPerSecond: Math.round(timings?.prompt_per_second ?? 0),
        predictedTokens: timings?.predicted_n ?? 0,
        predictedMs: Math.round(timings?.predicted_ms ?? 0),
        predictedPerSecond: Math.round(timings?.predicted_per_second ?? 0),
        totalMs: Math.round((timings?.prompt_ms ?? 0) + (timings?.predicted_ms ?? 0)),
        timeToFirstTokenMs: (firstTokenAt ?? Date.now()) - completionStart,
        output,
        outputIsValidJson: isJson(output),
      });
    }

    return results;
  } finally {
    if (context !== null) {
      await releaseAllLlama();
    }
  }
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Markdown table, so results paste straight into NOTES.md. */
export function formatResultsAsMarkdown(results: BenchmarkResult[]): string {
  if (results.length === 0) return '_No results._';

  const header =
    '| Case | Model | Grammar | Load | Prompt tok | Prefill tok/s | Gen tok | Gen tok/s | First token | Total | Valid JSON |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|';

  const rows = results.map(
    (r) =>
      `| ${r.name} | ${r.modelLabel} | ${r.grammarConstrained ? 'yes' : 'no'} | ${(r.loadMs / 1000).toFixed(1)}s | ` +
      `${r.promptTokens} | ${r.promptPerSecond} | ${r.predictedTokens} | ${r.predictedPerSecond} | ` +
      `${(r.timeToFirstTokenMs / 1000).toFixed(1)}s | ${(r.totalMs / 1000).toFixed(1)}s | ${r.outputIsValidJson ? '✓' : '✗'} |`
  );

  return [header, ...rows].join('\n');
}
