# sim-view — the real iOS screen, in the editor's side panel

**Dev only. Delete before the freeze, with `dev/web-preview/` and
`src/lib/diagnostics/`.**

```bash
npm run sim:setup    # once — fetches idb into vendor/ (gitignored)
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
| tapping | yes | **yes** — click, drag, scroll, type |
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

**Click the phone screen and it taps. Drag to scroll, or use the trackpad
wheel.** Type into the box in the toolbar and Enter sends the keystrokes to
whatever field the app has focused.

`simctl` cannot synthesise a touch, so input goes through `idb_companion` —
the official prebuilt v1.5.2, SHA-256 verified against the published checksum,
unpacked into `vendor/` with its Python client in a local venv. Nothing is
installed system-wide and nothing needed sudo. `npm run sim:setup` does it and
is safe to re-run.

Coordinates are sent **normalised 0..1** and converted to device points on the
server, which reads the point size from `idb describe` at startup. Nothing
assumes 402x874, so booting a different iPhone just works.

A drag becomes a swipe, and longer drags get a longer duration so the content
lands where you aimed instead of flinging past it. The route buttons still use
`simctl openurl`, because jumping straight to a screen is quicker than tapping
to it.

The size dropdown drives `simctl ui content_size` — the Dynamic Type sweep that
found the 220pt countdown. **Press "Reload JS" after changing it**: React Native
does not re-run layout when Dynamic Type changes while the app is running, so
glyphs redraw at the new size inside boxes measured for the old one. That looks
exactly like a broken layout and is not one.
