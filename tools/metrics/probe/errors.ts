/** FEASIBILITY PROBE — error listing. Not shipping code. `npm run probe:errors` */
import { loadCorpus } from '../corpus.ts';
import { loadOcrCache } from '../ocr-cache.ts';
import { CORPUS_CLOCK_MS } from '../extractor.ts';
import { truthFields } from '../score.ts';
import { valuesMatch } from '../fields.ts';
import { extract } from './spatial.ts';

const corpus = loadCorpus();
const cache = loadOcrCache('apple-vision');

console.log('WRONG VALUES — truth present, probe produced something different\n');
for (const capture of corpus.captures) {
  if (capture.bucket !== 'real') continue;
  const record = cache.records.get(capture.file);
  const notice = corpus.notices.get(capture.notice);
  if (!record || !notice) continue;
  const got = extract({
    lines: record.lines,
    text: record.lines.map((l) => l.text).join('\n'),
    width: record.ocrWidth,
    height: record.ocrHeight,
    nowMs: CORPUS_CLOCK_MS,
  });
  for (const [field, want] of truthFields(notice)) {
    if (Array.isArray(want)) continue;
    const have = got.fields[field];
    if (have === undefined) continue;
    if (!valuesMatch(field, want as string, have.value)) {
      console.log(
        `  ${capture.file.padEnd(26)} ${capture.condition.padEnd(13)} ${field.padEnd(16)}` +
          ` want "${String(want)}"  got "${String(have.value)}"`,
      );
    }
  }
}

console.log('\nFIELDS THE PROBE PRODUCES THAT GROUND TRUTH DOES NOT RECORD');
console.log('(scored as fabrication — check whether the value is actually printed)\n');
const seen = new Map<string, string>();
for (const capture of corpus.captures) {
  if (capture.bucket !== 'real' || capture.condition !== 'flat') continue;
  const record = cache.records.get(capture.file);
  const notice = corpus.notices.get(capture.notice);
  if (!record || !notice) continue;
  const truth = truthFields(notice);
  const got = extract({
    lines: record.lines,
    text: record.lines.map((l) => l.text).join('\n'),
    width: record.ocrWidth,
    height: record.ocrHeight,
    nowMs: CORPUS_CLOCK_MS,
  });
  for (const [field, value] of Object.entries(got.fields)) {
    if (value === undefined || truth.has(field)) continue;
    const key = `${capture.notice}:${field}`;
    if (!seen.has(key)) {
      seen.set(key, '');
      const onPage = record.lines.some((l) => l.text.includes(String(value.value)));
      console.log(
        `  notice ${capture.notice}  ${field.padEnd(16)} got "${String(value.value)}"` +
          `  ${onPage ? '<- IS printed on the page' : '<- not on the page'}`,
      );
    }
  }
}
