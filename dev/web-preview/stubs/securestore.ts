/** Web stub: localStorage stands in for the keychain. Preview data only. */
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'whenUnlockedThisDeviceOnly';
export const WHEN_UNLOCKED = 'whenUnlocked';
export type SecureStoreOptions = Record<string, unknown>;

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(`carta:${key}`) ?? null;
  } catch {
    return null;
  }
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    globalThis.localStorage?.setItem(`carta:${key}`, value);
  } catch {
    /* private window */
  }
}
export async function deleteItemAsync(key: string): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(`carta:${key}`);
  } catch {
    /* private window */
  }
}
