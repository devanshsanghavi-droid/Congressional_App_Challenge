/** Web stub: the model is native-only. Settings shows its not-downloaded state. */
export type LlamaContext = { completion: unknown; release: () => Promise<void> };
export async function initLlama(): Promise<never> {
  throw new Error('llama.rn is native-only; not available in the web preview');
}
export async function releaseAllLlama(): Promise<void> {}
