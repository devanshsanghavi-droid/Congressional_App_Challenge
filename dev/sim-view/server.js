#!/usr/bin/env node
/**
 * A live view of the headless iOS Simulator, for the editor's side panel.
 *
 * AUTHORSHIP: Claude. Dev tooling. Delete before the freeze with
 * `dev/web-preview/` and `src/lib/diagnostics/`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS ALONGSIDE dev/web-preview/
 * ---------------------------------------------------------------------------
 * The web preview renders the real components through react-native-web, which
 * is fast and free but is NOT what iOS draws. The reminder time picker proved
 * the gap: it rendered fine in the browser (a stub) and was a zero-sized
 * "Unimplemented" placeholder on iOS. A preview that cannot show that class of
 * bug cannot be the only thing you look at.
 *
 * This one is the real thing — actual UIKit, actual Fabric, actual fonts — and
 * costs almost nothing, because:
 *
 *   1. **The device runs headless.** `simctl boot` without opening
 *      Simulator.app. The window is what costs: it is composited by
 *      WindowServer every frame whether or not anyone is looking at it. Booted
 *      and idle with no window, the runtime does not appear in `top`'s first
 *      fifteen processes at all.
 *   2. **Frames are captured on demand.** No background loop. The page asks for
 *      a frame, the server takes exactly one. A capture measures ~130 ms and a
 *      downscale ~20 ms, so at the default two-second interval this is roughly
 *      7% of one core while visible.
 *   3. **It stops when you are not looking.** The Page Visibility API pauses
 *      the loop when the panel is hidden, which takes the cost to zero rather
 *      than to "a bit less".
 *
 * There is no tapping: `simctl` cannot synthesise touches and `idb` is not
 * installed. Navigation is by deep link instead, which this repo already
 * prefers — CLAUDE.md notes taps in the Simulator helper land ~50pt above the
 * target, and `openurl` needs no tap at all.
 *
 * Binds to 127.0.0.1 only.
 */

const http = require('node:http');
const { execFile } = require('node:child_process');
const { readFileSync, unlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const DEVICE = process.env.CARTA_SIM_UDID ?? 'booted';
const BUNDLE = 'com.devansh-s.carta';
const PORT = Number(process.env.CARTA_SIM_PORT ?? 8090);
/** Panel width in CSS pixels; 2x for a crisp image without paying for full res. */
const FRAME_WIDTH = 760;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 20000 }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr || error.message)) : resolve(stdout),
    );
  });
}

async function frame() {
  const raw = join(tmpdir(), `carta-frame-${process.pid}.png`);
  await run('xcrun', ['simctl', 'io', DEVICE, 'screenshot', raw]);
  // `sips` ships with macOS, so the viewer needs nothing installed.
  await run('sips', ['-Z', String(FRAME_WIDTH), raw, '--out', raw]);
  const png = readFileSync(raw);
  try {
    unlinkSync(raw);
  } catch {
    /* already gone */
  }
  return png;
}

const PAGE = `<!doctype html><meta charset=utf-8><title>Carta on iOS</title>
<style>
  :root { color-scheme: light dark; --bg:#1c1c1e; --fg:#f2f2f7; --mut:#8e8e93; --line:#3a3a3c; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:13px -apple-system,system-ui,sans-serif;
         display:flex; flex-direction:column; height:100vh; }
  header { padding:8px 10px; border-bottom:1px solid var(--line); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  #stage { flex:1; display:flex; align-items:center; justify-content:center; overflow:auto; padding:10px; }
  img { max-width:100%; max-height:100%; border-radius:22px; box-shadow:0 8px 30px rgba(0,0,0,.5); display:block; }
  button, select, input { font:inherit; background:#2c2c2e; color:var(--fg); border:1px solid var(--line);
           border-radius:7px; padding:5px 9px; cursor:pointer; }
  button:hover { background:#3a3a3c; }
  button.on { background:#0a84ff; border-color:#0a84ff; }
  .sp { flex:1 }
  .mut { color:var(--mut); }
  input[type=text] { min-width:110px; cursor:text; }
</style>
<header>
  <button id=play class=on title="Pause to drop CPU to zero">Live</button>
  <select id=every title="Refresh interval">
    <option value=1000>1s</option><option value=2000 selected>2s</option>
    <option value=4000>4s</option><option value=10000>10s</option>
  </select>
  <button id=shot title="Capture one frame now">Snap</button>
  <span class=sp></span>
  <button data-go="/">Home</button>
  <button data-go="/settings">Settings</button>
  <button data-go="/vault">Vault</button>
  <button data-go="/where">Where</button>
  <button data-go="/onboarding">Onboard</button>
  <input type=text id=path placeholder="/notice/&lt;id&gt;" />
  <button id=goPath>Go</button>
  <span class=sp></span>
  <select id=size title="Dynamic Type — the sweep that found the 220pt countdown">
    <option value=small>S</option><option value=medium>M</option>
    <option value=large selected>L (default)</option><option value=extra-large>XL</option>
    <option value=accessibility-medium>AX3</option><option value=accessibility-extra-extra-large>AX5</option>
  </select>
  <select id=appear title="Light or dark">
    <option value=light selected>Light</option><option value=dark>Dark</option>
  </select>
  <button id=reload title="Reload the JS bundle">Reload JS</button>
  <span class=mut id=stat></span>
</header>
<div id=stage><img id=img alt="Simulator screen"></div>
<script>
const img=document.getElementById('img'), stat=document.getElementById('stat');
const play=document.getElementById('play'), every=document.getElementById('every');
let on=true, timer=null, busy=false;

async function tick(){
  if(busy) return; busy=true;
  const t=performance.now();
  try{
    const r=await fetch('/frame?'+Date.now());
    if(!r.ok) throw new Error(await r.text());
    const b=await r.blob();
    const u=URL.createObjectURL(b);
    const old=img.src; img.src=u; if(old.startsWith('blob:')) URL.revokeObjectURL(old);
    stat.textContent=Math.round(performance.now()-t)+'ms';
  }catch(e){ stat.textContent='error: '+e.message.slice(0,60); }
  busy=false;
}
function schedule(){
  clearInterval(timer);
  // Only runs while visible AND playing — hidden panel costs nothing.
  if(on && !document.hidden) timer=setInterval(tick, Number(every.value));
}
play.onclick=()=>{ on=!on; play.classList.toggle('on',on); play.textContent=on?'Live':'Paused'; schedule(); if(on) tick(); };
every.onchange=schedule;
document.addEventListener('visibilitychange',()=>{ schedule(); if(!document.hidden&&on) tick(); });
document.getElementById('shot').onclick=tick;

async function post(u){ stat.textContent='...'; try{ await fetch(u,{method:'POST'}); }catch{} setTimeout(tick,900); }
for(const b of document.querySelectorAll('[data-go]'))
  b.onclick=()=>post('/go?path='+encodeURIComponent(b.dataset.go));
document.getElementById('goPath').onclick=()=>{
  const v=document.getElementById('path').value.trim(); if(v) post('/go?path='+encodeURIComponent(v));
};
document.getElementById('size').onchange=e=>post('/size?v='+e.target.value);
document.getElementById('appear').onchange=e=>post('/appearance?v='+e.target.value);
document.getElementById('reload').onclick=()=>post('/reload');

tick(); schedule();
</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', PAGE);

  if (url.pathname === '/frame') {
    return frame().then(
      (png) => send(200, 'image/png', png),
      (error) => send(500, 'text/plain', String(error.message)),
    );
  }

  const ok = () => send(200, 'text/plain', 'ok');
  const fail = (error) => send(500, 'text/plain', String(error.message));

  if (url.pathname === '/go') {
    const path = url.searchParams.get('path') ?? '/';
    const link = `carta://${path.startsWith('/') ? '' : '/'}${path}`;
    return run('xcrun', ['simctl', 'openurl', DEVICE, link]).then(ok, fail);
  }
  if (url.pathname === '/size') {
    return run('xcrun', ['simctl', 'ui', DEVICE, 'content_size', url.searchParams.get('v') ?? 'large'])
      .then(ok, fail);
  }
  if (url.pathname === '/appearance') {
    return run('xcrun', ['simctl', 'ui', DEVICE, 'appearance', url.searchParams.get('v') ?? 'light'])
      .then(ok, fail);
  }
  if (url.pathname === '/reload') {
    // Re-entering through the dev-client URL is the reliable way to remount
    // without a tap; RN's own reload command needs the dev menu.
    const metro = process.env.CARTA_METRO ?? 'http://localhost:8083';
    const link = `exp+carta://expo-development-client/?url=${encodeURIComponent(metro)}`;
    return run('xcrun', ['simctl', 'openurl', DEVICE, link]).then(ok, fail);
  }
  send(404, 'text/plain', 'not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`sim-view on http://127.0.0.1:${PORT}  device=${DEVICE}  bundle=${BUNDLE}`);
});
