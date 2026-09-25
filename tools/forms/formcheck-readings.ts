import { readFileSync, readdirSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { checkFilledForm } from '../../src/lib/formcheck/check.ts';
import { toGray } from '../../src/lib/formcheck/ink.ts';
import { parseFormTemplate } from '../../src/lib/formcheck/template.ts';
const R = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const template = parseFormTemplate(JSON.parse(readFileSync(`${R}/content/forms/carta-demo-sar7.json`, 'utf8')));
const dir = `${R}/tests/fixtures/formcheck`;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.jpg')).sort()) {
  const ocr = JSON.parse(readFileSync(`${dir}/${f.replace('.jpg', '.ocr.json')}`, 'utf8').split('\n')[0] ?? '{}');
  const raw = jpeg.decode(readFileSync(`${dir}/${f}`), { useTArray: true, formatAsRGBA: true });
  const image = toGray(raw.data, raw.width, raw.height);
  const t0 = performance.now();
  const r = checkFilledForm({ template, lines: ocr.lines, ocrWidth: ocr.ocrWidth, ocrHeight: ocr.ocrHeight, image });
  const ms = Math.round(performance.now() - t0);
  if (!r.ok) { console.log(f.padEnd(24), 'NOT OK:', r.reason, `${ms}ms`); continue; }
  const parts = r.findings.map((x) => {
    if (x.kind === 'question') return `Q${x.number}:${x.state}/${x.why}${x.ink ? `(y${x.ink.yes.toFixed(3)} n${x.ink.no.toFixed(3)})` : ''}`;
    if (x.kind === 'signature') return `SIG:${x.state}/${x.why}${x.ink !== undefined ? `(${x.ink.toFixed(4)})` : ''}`;
    return `DATE:${x.state}/${x.why}${x.written ? `(${x.written.month}/${x.written.day}/${x.written.year})` : ''}`;
  });
  console.log(f.padEnd(24), `lines=${r.agreeingLines} ${ms}ms`, '\n   ', parts.join('\n    '));
}
