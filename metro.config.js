// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Web-only stubs for the native leaves — see `dev/web-preview/README.md`.
 *
 * This exists so the real screens can be rendered in a browser beside the
 * editor for layout work. It is scoped as narrowly as it can be: the swap is
 * keyed on `platform === 'web'`, so an iOS or Android bundle resolves every one
 * of these to the genuine module and never sees this map at all.
 *
 * `expo-sqlite` is deliberately NOT here. It ships a real WASM build for the
 * web, so the database layer runs its actual code and the screens read from a
 * real database rather than a hand-written fake.
 */
const WEB_STUBS = {
  'llama.rn': 'dev/web-preview/stubs/llama.ts',
  'expo-mlkit-ocr': 'dev/web-preview/stubs/ocr.ts',
  'expo-secure-store': 'dev/web-preview/stubs/securestore.ts',
  'expo-file-system': 'dev/web-preview/stubs/filesystem.ts',
  'expo-image-manipulator': 'dev/web-preview/stubs/imagemanipulator.ts',
  'expo-image-picker': 'dev/web-preview/stubs/imagepicker.ts',
  'expo-notifications': 'dev/web-preview/stubs/notifications.ts',
  '@react-native-community/datetimepicker': 'dev/web-preview/stubs/datetimepicker.tsx',
};

// `expo-sqlite`'s web build ships wa-sqlite as a WASM binary and imports it as
// an asset. Without this Metro tries to parse it as JavaScript and the whole
// web bundle fails to resolve.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stub = WEB_STUBS[moduleName];
  if (platform === 'web' && stub !== undefined) {
    return { type: 'sourceFile', filePath: path.join(__dirname, stub) };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
