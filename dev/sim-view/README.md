# sim-view — the real iOS screen, in the editor's side panel

**Dev only. Delete before the freeze, with `dev/web-preview/` and
`src/lib/diagnostics/`.**

```bash
npm run sim:boot     # boots the device headless — do NOT open Simulator.app
npm run sim:view     # http://127.0.0.1:8090
```

Then point the app at Metro once:

```bash
xcrun simctl openurl booted "exp+carta://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083"
```

## Why this exists next to `dev/web-preview/`

They answer different questions and you want both.

| | web-preview | sim-view |
|---|---|---|
| renders | react-native-web | **real UIKit / Fabric** |
| edit loop | instant, fast refresh | fast refresh + a ≤2s frame delay |
| tapping | yes | **no** — deep links only |
| tells you the truth about native views | **no** | yes |

The reminder time picker is the case that justifies the second row: it rendered
fine in the browser and is a zero-sized `Unimplemented` placeholder on iOS. A
preview that cannot show that class of bug should not be the only thing you look
at before saying a screen is done.

## Why it is cheap

- **The device runs headless.** `simctl boot` without `open -a Simulator`. The
  window is the expensive part — WindowServer composites it every frame whether
  or not anyone is looking. Booted with no window, the runtime does not appear
  in `top`'s first fifteen processes.
- **Frames are pulled, not pushed.** One capture per request, no background
  loop. Measured: ~130 ms to capture, ~20 ms to downscale.
- **It stops when the panel is hidden.** The Page Visibility API pauses the
  loop, so the cost goes to zero rather than to "less".

At the default 2 s interval that is roughly **0.19 s of work per 2 s, about a
tenth of one core**, and nothing at all while paused.

## Controls

Route buttons and the free-text path box use `simctl openurl`, because `simctl`
cannot synthesise a touch and `idb` is not installed. **There is no tapping** —
this is a viewer, not a remote control. Navigation by deep link is what this
repo already prefers anyway (CLAUDE.md: taps in the Simulator helper land ~50pt
above the target).

The size dropdown drives `simctl ui content_size` — the Dynamic Type sweep that
found the 220pt countdown. **Press "Reload JS" after changing it**: React Native
does not re-run layout when Dynamic Type changes while the app is running, so
glyphs redraw at the new size inside boxes measured for the old one. That looks
exactly like a broken layout and is not one.
