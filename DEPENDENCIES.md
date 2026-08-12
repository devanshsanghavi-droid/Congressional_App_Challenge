# Open-source dependencies

Every third-party library in Carta, what it is for, and its licence. The
Congressional App Challenge rules require documenting external tools, so this
file is a submission deliverable, not just housekeeping.

Versions are as installed on **2026-08-11** (Phase 1, Day 1). Runtime target is
Expo SDK 57 / React Native 0.86.2 / React 19.2.3.

**There are no paid services, no API keys, no backend, and no hosted inference
anywhere in this list** — that is a product decision (SPEC.md §0), and it is why
every dependency below is either an on-device native module or a pure-JS
library.

---

## Framework and navigation

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `expo` | 57.0.12 | MIT | The React Native toolchain — build config, native module system, dev client. Not Expo Go: Carta needs custom native modules. |
| `react-native` | 0.86.2 | MIT | Cross-platform UI runtime. Chosen so one codebase covers iPhone (primary) and Android (kept compiling). |
| `react` | 19.2.3 | MIT | UI library React Native is built on. |
| `expo-router` | 57.0.12 | MIT | File-based navigation. Routes are the file tree under `src/app`. |
| `expo-dev-client` | 57.0.11 | MIT | Custom development build, required because the app links native modules Expo Go does not contain. |
| `expo-constants` | 57.0.10 | MIT | Reads app version and build config at runtime. |
| `expo-linking` | 57.0.5 | MIT | Deep-link handling for expo-router; also opens regulation citation URLs in the system browser. |
| `expo-splash-screen` | 57.0.6 | MIT | Launch screen. |
| `expo-status-bar` | 57.0.1 | MIT | Status bar styling. |
| `expo-system-ui` | 57.0.2 | MIT | System background colour, light/dark handling. |
| `react-native-safe-area-context` | 5.7.0 | MIT | Keeps content clear of the notch and home indicator. |
| `react-native-screens` | 4.26.2 | MIT | Native screen primitives behind expo-router. |
| `react-native-gesture-handler` | 2.32.0 | MIT | Native gesture handling used by the navigator. |
| `react-native-reanimated` | 4.5.1 | MIT | Animation runtime. |
| `react-native-worklets` | 0.10.1 | MIT | Worklet runtime required by Reanimated 4. |
| `expo-symbols` | 57.0.2 | MIT | SF Symbols icons on iOS. |
| `expo-image` | 57.0.2 | MIT | Image rendering for captured notices, with correct scaling for the bounding-box overlay. |

## Capture and OCR

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `expo-camera` | 57.0.3 | MIT | Photographing notices. |
| `expo-image-manipulator` | 57.0.9 | MIT | Resize and EXIF-rotate before OCR. Note: it cannot grayscale, adjust contrast, or deskew — see NOTES.md, 2026-08-11. |
| `expo-mlkit-ocr` | 0.2.7 | MIT | Google ML Kit Text Recognition v2. Used as the **Android** OCR engine and as the **comparison arm** in the OCR bake-off. On iOS the app uses its own Apple Vision module instead (see below). |

**Not a dependency — written for this project:** the iOS OCR engine is a custom
Expo module wrapping Apple's `VNRecognizeTextRequest` (Vision framework, part of
iOS). It is written in Swift by the student, lives in `/modules`, and exists
because none of the available OCR packages expose per-observation confidence,
alternate candidates, custom vocabulary, or multi-language recognition — all of
which the extraction cascade depends on. Reasoning and evidence in NOTES.md.

## Storage and privacy

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `@op-engineering/op-sqlite` | 17.2.0 | MIT | SQLite with SQLCipher as a compilation target — the encrypted local database. All notice data lives here and nowhere else. |
| `expo-secure-store` | 57.0.1 | MIT | Holds the database encryption key in the iOS Keychain / Android Keystore. |
| `expo-file-system` | 57.0.2 | MIT | Reads and writes captured images inside the app sandbox. Never the camera roll. |

## Product features

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `expo-notifications` | 57.0.10 | MIT | The reminder ladder. **Locally scheduled only** — no push tokens, no FCM/APNs server, no Expo push service. Works in airplane mode. |
| `expo-localization` | 57.0.1 | MIT | Reads the phone's language preferences to pick a starting locale. |
| `i18next` | 26.3.6 | MIT | Translation engine. Strings are bundled into the binary; no translation backend, so the app is fully translated offline. |
| `react-i18next` | 17.0.11 | MIT | React bindings for i18next. |
| `zustand` | 5.0.14 | MIT | Small state store. Chosen for being boring. |

## Development and verification

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `typescript` | 6.0.3 | Apache-2.0 | Strict-mode type checking, including the extraction island's stricter config. |
| `jest` | 29.7.0 | MIT | Test runner. Two projects: bare Node for extraction and tools, jest-expo for app code. |
| `jest-expo` | 57.0.4 | MIT | Jest preset that understands React Native and Expo modules. |
| `@testing-library/react-native` | 14.0.1 | MIT | Component tests written against what a user sees, which keeps accessibility labels honest. |
| `react-test-renderer` | 19.2.3 | MIT | Renderer backing the component tests. Pinned to match React exactly. |
| `@types/jest` | 29.5.14 | MIT | Jest type definitions. |
| `@types/react` | 19.2.18 | MIT | React type definitions. |
| `eslint` | 9.39.5 | MIT | Linting, including the rule that keeps `/src/extraction` free of platform imports. |
| `eslint-config-expo` | 57.0.1 | MIT | Expo's base lint rules. |
| `@babel/preset-typescript` | 7.x | MIT | Strips types for the bare-Node Jest project. Used instead of `babel-preset-expo` there because none of that code is React Native. |
| `@babel/plugin-transform-modules-commonjs` | 7.x | MIT | ESM to CommonJS for the same project. |

## Planned, not yet installed

| Package | Phase | Why |
|---|---|---|
| `pdf-lib` | 1 (corpus generator) | Fills blank CDSS form PDFs with fictional data. Note it cannot rasterise — see NOTES.md. |
| `pdfjs-dist` + `@napi-rs/canvas` | 1 (corpus generator) | Renders the filled PDF to PNG in pure Node, no system dependencies. |
| `sharp` | 1 (corpus generator) | Image I/O and the non-projective distortions. The perspective warp is hand-written, because sharp does affine but not projective transforms. |
| `llama.rn` | 4 (optional) | On-device llama.cpp for the optional Layer 3, with GBNF grammar-constrained JSON output. **Cut if not reliable by Oct 1.** Currently at a release candidate (`0.13.0-rc.0`), which is one reason it is not allowed to influence the SDK version choice. |

## Deliberately not used

| Not used | Why |
|---|---|
| Any cloud OCR (Google Cloud Vision, AWS Textract, Azure) | SPEC §0 rule 1: notice content never touches the network. |
| Any hosted LLM API (OpenAI, Anthropic, Google) | SPEC §0 rule 2. Optional local inference only. |
| `react-native-mlkit-ocr` | Unmaintained (SPEC §3). |
| `expo-ocr-kit` | Returns block-level bounding boxes only — no lines, no words — which makes Layer 1 spatial anchoring impossible. See NOTES.md, 2026-08-11. |
| `react-native-web`, `react-dom` as a shipping target | SPEC §10 forbids a web version. `react-dom` is pinned via `overrides` purely because expo-router's dev tooling pulls it in transitively. |
| Any analytics or crash-reporting SDK | SPEC §5 item 7. Events go to a local table for a user-visible debug screen. |
