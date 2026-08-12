import { Directory, File, Paths } from 'expo-file-system';

/**
 * Model catalogue and on-device file management.
 *
 * Downloading the model is the *only* network call in Carta (SPEC §0). It is
 * user-initiated from Settings, wifi-gated, shown with a clear size warning,
 * and it touches no notice data — the notice pipeline itself never opens a
 * socket, which is what `no-network.test.ts` enforces. Keeping the download in
 * this module, well away from anything that handles notices, is what makes that
 * boundary easy to see and easy to defend.
 *
 * Note this uses the current `expo-file-system` API (`File`/`Directory`/`Paths`),
 * not the legacy `documentDirectory` + `downloadResumable` one. The legacy
 * surface still exists behind `expo-file-system/legacy` but throws at runtime in
 * SDK 57.
 */

export type ModelId = 'qwen2.5-1.5b-instruct-q4_k_m' | 'qwen2.5-0.5b-instruct-q4_k_m';

export interface ModelSpec {
  id: ModelId;
  /** Shown to the user. */
  label: string;
  /** Parameter count, for the size warning copy. */
  parameters: string;
  /** Approximate download size in bytes, for the warning and the progress bar. */
  approxBytes: number;
  /** Hugging Face resolve URL for the GGUF file. */
  url: string;
  /** Filename on disk inside the app sandbox. */
  filename: string;
  /**
   * Context window we ask llama.cpp for. Not the model's maximum — it is the
   * size we are willing to pay for in memory. A page of OCR'd notice text plus
   * the prompt and the generated JSON has to fit inside this.
   */
  contextTokens: number;
}

/**
 * Both candidates are Qwen2.5 Instruct at Q4_K_M.
 *
 * Qwen2.5 was chosen over Llama specifically because it is Apache 2.0 — the
 * licence is unambiguous for a competition submission, where Llama's community
 * licence would be a question we would rather not have to answer.
 *
 * Q4_K_M is the standard 4-bit quantization: roughly a quarter the size of the
 * float16 weights for a small quality cost. It is the size that makes a 1.5B
 * model fit on a phone at all.
 */
export const MODELS: Record<ModelId, ModelSpec> = {
  'qwen2.5-1.5b-instruct-q4_k_m': {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    label: 'Qwen2.5 1.5B Instruct',
    parameters: '1.5B',
    approxBytes: 1_120_000_000,
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    contextTokens: 4096,
  },
  'qwen2.5-0.5b-instruct-q4_k_m': {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    label: 'Qwen2.5 0.5B Instruct',
    parameters: '0.5B',
    approxBytes: 400_000_000,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    contextTokens: 4096,
  },
};

/** Models live in the app sandbox, never in a shared or user-visible location. */
export function modelDirectory(): Directory {
  return new Directory(Paths.document, 'models');
}

export function modelFile(spec: ModelSpec): File {
  return new File(modelDirectory(), spec.filename);
}

/** llama.rn wants a plain filesystem path, not a `file://` URI. */
export function modelPath(spec: ModelSpec): string {
  return modelFile(spec).uri.replace(/^file:\/\//, '');
}

export function ensureModelDirectory(): void {
  const dir = modelDirectory();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

export interface DownloadedModel {
  spec: ModelSpec;
  path: string;
  bytes: number;
}

/** Returns the model's on-disk record, or null when it has not been downloaded. */
export function findDownloadedModel(spec: ModelSpec): DownloadedModel | null {
  const file = modelFile(spec);
  if (!file.exists) return null;
  return { spec, path: modelPath(spec), bytes: file.size ?? 0 };
}

export interface ModelDownloadProgress {
  bytesWritten: number;
  /** -1 when the server sent no Content-Length. */
  bytesTotal: number;
  /** 0..1, or null when the total is unknown. */
  fraction: number | null;
}

/**
 * Downloads a model, reporting progress so the UI can show a real progress bar
 * rather than a spinner. A gigabyte over a phone connection is long enough that
 * an indeterminate spinner reads as "frozen".
 */
export async function downloadModel(
  spec: ModelSpec,
  onProgress: (progress: ModelDownloadProgress) => void,
  signal?: AbortSignal
): Promise<DownloadedModel> {
  ensureModelDirectory();

  await File.downloadFileAsync(spec.url, modelFile(spec), {
    idempotent: true,
    ...(signal !== undefined ? { signal } : {}),
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress({
        bytesWritten,
        bytesTotal: totalBytes,
        fraction: totalBytes > 0 ? bytesWritten / totalBytes : null,
      });
    },
  });

  const downloaded = findDownloadedModel(spec);
  if (downloaded === null) {
    throw new Error('Model download reported success but no file is on disk.');
  }

  // A truncated download produces a file that llama.cpp fails to load with a
  // much less obvious error, so check the size here, where we can still say
  // something useful about what went wrong.
  if (downloaded.bytes < spec.approxBytes * 0.5) {
    deleteModel(spec);
    throw new Error(
      `Model download was incomplete (${formatBytes(downloaded.bytes)} of about ` +
        `${formatBytes(spec.approxBytes)}). The partial file was removed; please try again.`
    );
  }

  return downloaded;
}

/** Used by Settings → delete model, and by Delete Everything (SPEC §5.8). */
export function deleteModel(spec: ModelSpec): void {
  const file = modelFile(spec);
  if (file.exists) {
    file.delete();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}
