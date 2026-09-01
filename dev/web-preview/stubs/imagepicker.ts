/** Web stub: no camera. Reports cancelled so Capture returns cleanly. */
export async function requestCameraPermissionsAsync() {
  return { granted: false, status: 'denied', canAskAgain: true };
}
export async function launchCameraAsync() {
  return { canceled: true as const, assets: null };
}
export async function launchImageLibraryAsync() {
  return { canceled: true as const, assets: null };
}
