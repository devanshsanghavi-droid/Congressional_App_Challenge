# Web preview — a UI workbench, not a target platform

**Dev only. Delete before the freeze, with `src/lib/diagnostics/`.**

Carta ships to iOS. This directory exists so the real screens can be rendered in
a browser next to the editor, with fast refresh, for **layout and copy work** —
it is not a claim that Carta runs on the web and must never become one.

Nothing here is imported by the app. Metro swaps these in **only when
`platform === 'web'`** (see `metro.config.js`); an iOS or Android bundle never
sees them.

## What is real and what is not

**Real:** every screen, every component, the theme tokens, i18n in both
languages, `expo-router` navigation, the countdown and urgency logic, the
checklist rules, the content packs. That is the whole of what this preview is
for.

**Stubbed:** the native leaves — camera, OCR, the model, notifications, the
keychain, the filesystem. They return plausible values so the screens mount.

**The rule that keeps this honest:** a screen that looks right here has been
proven to *lay out* right, and nothing more. Behaviour is still proven on the
phone. Never write "verified on web" and mean "verified" — the same rule
CLAUDE.md already sets for "device" vs "Simulator".
