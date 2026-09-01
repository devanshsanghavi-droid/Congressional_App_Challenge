/** Web stub: Vision/ML Kit are native. Capture is not exercised in the preview. */
export function isSupported(): boolean {
  return false;
}
export async function recognizeText(): Promise<{ blocks: never[]; lines: never[] }> {
  return { blocks: [], lines: [] };
}
