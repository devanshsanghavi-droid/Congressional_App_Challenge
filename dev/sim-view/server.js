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
 * **Input is real.** `simctl` cannot synthesise a touch, so taps, swipes and
 * typing go through `idb_companion` (vendored in `vendor/`, official prebuilt
 * v1.5.2, SHA-256 verified against the published checksum) and its Python
 * client in a local venv. Nothing is installed system-wide and nothing needed
 * sudo.
 *
 * Coordinates are sent **normalised 0..1** and converted to device points here,
 * so the mapping does not care how large the panel is, what the downscale is,
 * or which device is booted — `idb describe` reports the point size once and
 * everything derives from that. Hard-coding 402x874 would break the moment
 * anyone booted a different iPhone.
 *
 * Binds to 127.0.0.1 only.
 */

const http = require('node:http');
const { execFile } = require('node:child_process');
const { readFileSync, unlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const HERE = __dirname;
const IDB = join(HERE, 'vendor', 'idbenv', 'bin', 'idb');
const COMPANION = join(HERE, 'vendor', 'idb_companion');
const GRPC_PORT = 10882;

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

/** Device point size, read once from idb — never hard-coded. */
let screen = null;

async function idb(args) {
  return run(IDB, [...args, '--udid', DEVICE]);
}

async function ensureCompanion() {
  try {
    await run('bash', ['-c', `lsof -ti:${String(GRPC_PORT)}`]);
    return; // already listening
  } catch {
    /* not running */
  }
  const { spawn } = require('node:child_process');
  spawn(COMPANION, ['--udid', DEVICE, '--grpc-port', String(GRPC_PORT)], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  await new Promise((r) => setTimeout(r, 4000));
  await run(IDB, ['connect', 'localhost', String(GRPC_PORT)]).catch(() => {});
}

async function screenSize() {
  if (screen) return screen;
  const out = await idb(['describe', '--json']);
  const d = JSON.parse(out).screen_dimensions;
  screen = { w: d.width_points, h: d.height_points };
  return screen;
}

/** Normalised 0..1 from the page -> device points. */
async function toPoints(nx, ny) {
  const { w, h } = await screenSize();
  const clamp = (v) => Math.min(0.999, Math.max(0, Number.isFinite(v) ? v : 0));
  return [Math.round(clamp(nx) * w), Math.round(clamp(ny) * h)];
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
  img { max-width:100%; max-height:100%; border-radius:22px; box-shadow:0 8px 30px rgba(0,0,0,.5);
        display:block; cursor:crosshair; -webkit-user-select:none; user-select:none; touch-action:none; }
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
  <input type=text id=kbd placeholder="type into the app + Enter" title="Sends keystrokes to the focused field" />
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
  if(on && !document.hidden) timer=setInterval(tick, Number(every.value));
}
play.onclick=()=>{ on=!on; play.classList.toggle('on',on); play.textContent=on?'Live':'Paused'; schedule(); if(on) tick(); };
every.onchange=schedule;
document.addEventListener('visibilitychange',()=>{ schedule(); if(!document.hidden&&on) tick(); });
document.getElementById('shot').onclick=tick;

async function post(u){ stat.textContent='...'; try{ await fetch(u,{method:'POST'}); }catch{} setTimeout(tick,700); }

// ---- input. Normalised 0..1 so the panel can be any size.
function norm(e){
  const r=img.getBoundingClientRect();
  return [(e.clientX-r.left)/r.width, (e.clientY-r.top)/r.height];
}
let down=null, downAt=0;
img.addEventListener('pointerdown', e=>{ down=norm(e); downAt=Date.now(); img.setPointerCapture(e.pointerId); });
img.addEventListener('pointerup', e=>{
  if(!down) return;
  const up=norm(e);
  const dx=up[0]-down[0], dy=up[1]-down[1];
  const far=Math.hypot(dx*0.46, dy)>0.02;   // 0.46 ~ aspect, so the threshold is roughly circular on screen
  const held=Date.now()-downAt;
  if(far){
    // A drag is a scroll. Longer drags get a longer duration so they do not fling.
    const ms=Math.min(0.6, 0.15+Math.abs(dy)*0.6).toFixed(2);
    post('/swipe?x1='+down[0]+'&y1='+down[1]+'&x2='+up[0]+'&y2='+up[1]+'&ms='+ms);
    stat.textContent='swipe';
  }else{
    post('/tap?x='+up[0]+'&y='+up[1]);
    stat.textContent='tap'+(held>500?' (held)':'');
  }
  down=null;
});
img.addEventListener('pointercancel',()=>{ down=null; });
// Wheel scrolling, because a trackpad is how anyone actually reads a long screen.
let wheelAcc=0, wheelTimer=null;
img.addEventListener('wheel', e=>{
  e.preventDefault(); wheelAcc+=e.deltaY;
  clearTimeout(wheelTimer);
  wheelTimer=setTimeout(()=>{
    const d=Math.max(-0.35,Math.min(0.35, wheelAcc/1400)); wheelAcc=0;
    if(Math.abs(d)<0.01) return;
    const y=0.5+d/2, y2=0.5-d/2;
    post('/swipe?x1=0.5&y1='+y+'&x2=0.5&y2='+y2+'&ms=0.2');
    stat.textContent='scroll';
  },90);
},{passive:false});

for(const b of document.querySelectorAll('[data-go]'))
  b.onclick=()=>post('/go?path='+encodeURIComponent(b.dataset.go));
document.getElementById('goPath').onclick=()=>{
  const v=document.getElementById('path').value.trim(); if(v) post('/go?path='+encodeURIComponent(v));
};
document.getElementById('size').onchange=e=>post('/size?v='+e.target.value);
document.getElementById('appear').onchange=e=>post('/appearance?v='+e.target.value);
document.getElementById('reload').onclick=()=>post('/reload');

const kbd=document.getElementById('kbd');
kbd.addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault();
    const v=kbd.value; if(v) post('/text?v='+encodeURIComponent(v));
    kbd.value=''; }
  if(e.key==='Backspace' && kbd.value===''){ e.preventDefault(); post('/key?v=42'); }
});

tick(); schedule();
</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const ok = () => send(200, 'text/plain', 'ok');
  const fail = (error) => send(500, 'text/plain', String(error.message));

  if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', PAGE);

  if (url.pathname === '/frame') {
    return frame().then((png) => send(200, 'image/png', png), fail);
  }

  if (url.pathname === '/tap') {
    const p = url.searchParams;
    return toPoints(Number(p.get('x')), Number(p.get('y')))
      .then(([x, y]) => idb(['ui', 'tap', String(x), String(y)]))
      .then(ok, fail);
  }
  if (url.pathname === '/swipe') {
    const p = url.searchParams;
    return Promise.all([
      toPoints(Number(p.get('x1')), Number(p.get('y1'))),
      toPoints(Number(p.get('x2')), Number(p.get('y2'))),
    ])
      .then(([[x1, y1], [x2, y2]]) =>
        idb([
          'ui', 'swipe',
          String(x1), String(y1), String(x2), String(y2),
          // A duration makes it a scroll rather than a flick, so the content
          // lands where you aimed instead of coasting past it.
          '--duration', p.get('ms') ?? '0.25',
        ]),
      )
      .then(ok, fail);
  }
  if (url.pathname === '/text') {
    return idb(['ui', 'text', url.searchParams.get('v') ?? '']).then(ok, fail);
  }
  if (url.pathname === '/key') {
    // HID usage codes: 40 return, 42 backspace, 43 tab.
    return idb(['ui', 'key', url.searchParams.get('v') ?? '40']).then(ok, fail);
  }

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
    const metro = process.env.CARTA_METRO ?? 'http://localhost:8083';
    const link = `exp+carta://expo-development-client/?url=${encodeURIComponent(metro)}`;
    return run('xcrun', ['simctl', 'openurl', DEVICE, link]).then(ok, fail);
  }
  send(404, 'text/plain', 'not found');
});

ensureCompanion()
  .then(() => screenSize())
  .then((s) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`sim-view http://127.0.0.1:${PORT}  device=${DEVICE}  ${s.w}x${s.h}pt`);
    });
  })
  .catch((error) => {
    console.error('could not reach the simulator:', error.message);
    process.exit(1);
  });
