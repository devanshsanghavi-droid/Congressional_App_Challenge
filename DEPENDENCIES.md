# Open-source dependencies

Every third-party library in Carta, what it is for, and its licence. The
Congressional App Challenge rules require documenting external tools, so this
file is a submission deliverable, not just housekeeping.

Versions are as installed on **2026-08-11**. Runtime target is Expo SDK 57 /
React Native 0.86.2 / React 19.2.3.

*Revised 2026-08-11 for the v2 local-LLM-first re-scope: `@op-engineering/op-sqlite`
removed, `expo-sqlite` and `llama.rn` added, the custom Apple Vision module cut.*

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
| `expo-mlkit-ocr` | 0.2.7 | MIT | The OCR module. Returns text with blocks, lines, words and bounding boxes; used off the shelf, since the user confirms every field. **The name is not the engine.** On Android it is Google ML Kit Text Recognition v2 (`com.google.mlkit:text-recognition:16.0.1`). On iOS, at the plugin's default `iosEngine: "auto"`, it installs no ML Kit pod and compiles Apple Vision instead — verified in `ios/Podfile.lock`, the podspec's `EXPO_MLKIT_OCR_DISABLE_MLKIT` switch, `plugins/withMlkitSimulatorArm64Fix.js`, and the `#if canImport` in the module source. Since iOS is the primary target, **the shipping recogniser on the demo phone is Apple Vision.** |

*A custom Apple Vision native module was designed and then cut in the v2
re-scope — see NOTES.md, 2026-08-11. It would have bought per-observation
confidence, alternate candidates and custom vocabulary, none of which survive
contact with a pipeline where a language model reads the text and the user
confirms every field.*

## Storage and privacy

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `expo-sqlite` | 57.0.1 | MIT | The local database. All notice data lives here and nowhere else. Sensitive columns are encrypted at the field level with a key from `expo-secure-store` — SQLCipher was cut as unnecessary complexity for an equivalent privacy guarantee. |
| `expo-secure-store` | 57.0.1 | MIT | Holds the database encryption key in the iOS Keychain / Android Keystore. |
| `expo-crypto` | 57.0.1 | MIT | CSPRNG and SHA-256. Generates the AES key and the per-install case-number salt, and hashes case numbers so the number itself is never stored (CLAUDE.md §3 rule 5). Digest and random only — it has no cipher. |
| `@noble/ciphers` | 2.3.0 | MIT | AES-256-GCM for field-level encryption of notice text. Audited, zero dependencies, pure JS, so it runs under Hermes with no native module. Authenticated: a tampered ciphertext throws rather than decrypting to plausible garbage. Chosen over hand-rolling AES, and over SQLCipher which was cut in the v2 re-scope. |
| `expo-file-system` | 57.0.2 | MIT | Reads and writes captured images inside the app sandbox. Never the camera roll. |

## On-device inference

| Package | Version | Licence | What it does here |
|---|---|---|---|
| `llama.rn` | 0.12.9 | MIT | React Native binding for llama.cpp. Runs Qwen2.5-1.5B-Instruct entirely on the phone with Metal acceleration. Supports **hand-written GBNF grammars**, which make schema-invalid JSON structurally impossible, and per-token streaming callbacks, which is what lets the explanation appear as it is generated. Pinned to the **stable** line: npm's `latest` tag points at a release candidate. |

**Model (not an npm dependency):** Qwen2.5-1.5B-Instruct GGUF, Q4_K_M, ~1 GB,
**Apache 2.0** — chosen partly because the licence is unambiguous, unlike Llama's.
Downloaded on demand over wifi with a clear size warning, never bundled. Falls
back to Qwen2.5-0.5B on devices where 1.5B is too slow.

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

## Not npm packages, but part of the build

| Tool | Where | Why |
|---|---|---|
| **Apple Vision** (`swiftc`, macOS SDK) | `tools/metrics/ocr/vision-ocr.swift` | Produces the corpus OCR text layer so the metrics harness can run in bare Node. **This turns out to be the same engine family the iOS app uses** — `expo-mlkit-ocr` installs no ML Kit pod at its default `iosEngine: "auto"` and compiles the Vision path instead (verified in `Podfile.lock`, the podspec, the config plugin and the module source). It ships in no build, touches no notice data, and its output is a committed cache, so a machine without Xcode can still run `npm run metrics`. See `tools/metrics/README.md`. |
| **Node 24 type stripping** | `tools/metrics/*.ts` | The harness is TypeScript run directly by Node, with no transpiler and no new dependency. `tools/tsconfig.json` sets `erasableSyntaxOnly` so a construct Node cannot strip becomes a compile error rather than a runtime one. |
| `numpy`, `Pillow`, `reportlab` (Python) | `tools/corpus/tools/*.py` | Generated the corpus PDFs and the synthetic degradations. Run once, by hand, off the build path — the outputs are committed, so nobody needs these installed to build or test Carta. |

## Planned, not yet installed

| Package | Week | Why |
|---|---|---|
| `pdf-lib` | 8 (test corpus) | Fills blank CDSS form PDFs with fictional data, which then get printed and photographed. **No rasteriser needed any more** — the v2 corpus is printed and photographed rather than synthetically distorted, so `pdfjs-dist`, `@napi-rs/canvas` and `sharp` are all no longer required. That is three dependencies removed by choosing the simpler method. |

## Deliberately not used

| Not used | Why |
|---|---|
| Any cloud OCR (Google Cloud Vision, AWS Textract, Azure) | SPEC §0 rule 1: notice content never touches the network. |
| Any hosted LLM API (OpenAI, Anthropic, Google) | SPEC §0 rule 2. Optional local inference only. |
| `react-native-mlkit-ocr` | Unmaintained (SPEC §3). |
| `expo-ocr-kit` | Returns block-level bounding boxes only — no lines, no words. See NOTES.md, 2026-08-11. |
| `@op-engineering/op-sqlite` / SQLCipher | Cut in the v2 re-scope. `expo-sqlite` plus field-level encryption gives the same privacy guarantee where it matters, with far less build complexity. |
| `pdfjs-dist`, `@napi-rs/canvas`, `sharp` | Cut with the synthetic-distortion corpus generator. The corpus is now printed and photographed. |
| `react-native-web`, `react-dom` as a shipping target | SPEC §10 forbids a web version. `react-dom` is pinned via `overrides` purely because expo-router's dev tooling pulls it in transitively. |
| Any analytics or crash-reporting SDK | SPEC §5 item 7. Events go to a local table for a user-visible debug screen. |
| A JS OCR engine (`tesseract.js`) for the harness | Would give the harness a portable text layer, but a different and markedly worse recogniser than either shipping engine — the numbers would measure Tesseract, not Carta. Apple Vision at least sits in the same class as ML Kit, and the cache keeps the harness portable anyway. |
| `ts-node` / `tsx` for the harness | Node 24 runs TypeScript directly. A transpiler dependency to run four scripts is not worth it. |
