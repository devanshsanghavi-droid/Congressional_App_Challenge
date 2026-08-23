/**
 * The capture trace.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * The trace exists to make a device failure legible, so the properties worth
 * pinning are: it records what a stage produced even when the stage succeeds,
 * it names the first stage that failed rather than the last, and it never
 * carries notice content — because a "Copy details" button that leaked a
 * recipient's name would turn a diagnostic into a privacy hole.
 */

import { formatTrace, startTrace } from '../../src/lib/diagnostics/trace.ts';

const NOW = new Date(2026, 7, 20, 9, 0, 0).getTime();

describe('recording stages', () => {
  it('records detail from a stage that succeeded', async () => {
    const recorder = startTrace('camera', NOW);
    const value = await recorder.step('ocr', async () =>
      Promise.resolve({ value: 42, detail: { lines: 35, engine: 'apple-vision' } }),
    );
    expect(value).toBe(42);

    const [stage] = recorder.trace().stages;
    expect(stage?.stage).toBe('ocr');
    expect(stage?.ok).toBe(true);
    // The point of the trace: a successful stage still says what it produced,
    // because the failures that matter on a phone are stages that succeed with
    // the wrong numbers.
    expect(stage?.detail).toEqual({ lines: 35, engine: 'apple-vision' });
  });

  it('records a failure, rethrows, and names the stage', async () => {
    const recorder = startTrace('camera', NOW);
    await expect(
      recorder.step('ocr', () => Promise.reject(new Error('no text'))),
    ).rejects.toThrow('no text');

    const trace = recorder.trace();
    expect(trace.failedAt).toBe('ocr');
    expect(trace.stages[0]?.ok).toBe(false);
    expect(trace.stages[0]?.error).toContain('no text');
  });

  it('names the FIRST failure, not the last', async () => {
    // A later stage failing because an earlier one did is noise; the first one
    // is the diagnosis.
    const recorder = startTrace('picker', NOW);
    await expect(recorder.step('ocr', () => Promise.reject(new Error('first')))).rejects.toThrow();
    await expect(recorder.step('save', () => Promise.reject(new Error('second')))).rejects.toThrow();
    expect(recorder.trace().failedAt).toBe('ocr');
  });

  it('keeps the cause of a native module error, which is where the detail lives', async () => {
    const recorder = startTrace('camera', NOW);
    const error = new Error('Calling the function has failed', { cause: 'no such column: x' });
    await expect(recorder.step('save', () => Promise.reject(error))).rejects.toThrow();
    expect(recorder.trace().stages[0]?.error).toContain('no such column');
  });
});

describe('the formatted trace', () => {
  async function sampleTrace() {
    const recorder = startTrace('camera', NOW);
    await recorder.step('ocr', async () =>
      Promise.resolve({ value: null, detail: { lines: 35, sourcePortrait: true } }),
    );
    await expect(
      recorder.step('extract', () => Promise.reject(new Error('nothing found'))),
    ).rejects.toThrow();
    return recorder.trace();
  }

  it('leads with the verdict so it is readable on a phone', async () => {
    const text = formatTrace(await sampleTrace());
    expect(text).toContain('FAILED at extract');
    expect(text).toContain('sourcePortrait: true');
    expect(text).toContain('total:');
  });

  it('stays narrow enough to paste into a message', async () => {
    for (const line of formatTrace(await sampleTrace()).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('carries no notice content', async () => {
    // The trace is offered behind a "Copy details" button. It reports the
    // deadline, which is the value worth debugging, and reports the name and
    // the case number as found/none — never the values themselves.
    const recorder = startTrace('camera', NOW);
    await recorder.step('extract', async () =>
      Promise.resolve({
        value: null,
        detail: { deadline: '2026-09-05', recipient: 'found', caseNumber: 'found' },
      }),
    );
    const text = formatTrace(recorder.trace());
    expect(text).not.toContain('MARIA');
    expect(text).not.toMatch(/\d{2}-\d{4}-\d{4}/);
    expect(text).toContain('recipient: found');
  });
});
