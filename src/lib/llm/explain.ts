/**
 * The plain-language explanation — streamed, on demand.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * This is the local model's only remaining job. It left the extraction path on
 * 2026-08-20, when deterministic extraction measured 96.4% precision on real
 * photographs against a 1.5B model that corrupted four core values and invented
 * two more. Generation has no ground truth to corrupt, which is why it is the
 * job the model keeps.
 *
 * **On demand, behind a tap** (CLAUDE.md §5). Nothing blocks on inference:
 * capture, extraction, saving and reminders all complete without the model
 * being present, and a user who never downloads it has a complete product.
 *
 * **Streamed**, because a 400-token explanation at 6 tok/s is over a minute of
 * silence otherwise — and because watching it write is the demo moment.
 */

import { initLlama, releaseAllLlama } from 'llama.rn';
import type { LlamaContext } from 'llama.rn';

import { modelFile, type ModelSpec } from './model.ts';
import { EXPLANATION_GRAMMAR, buildExplanationPrompt } from './explain-grammar.ts';
import { checkExplanation, parseSections, substitute } from './explain-check.ts';
import type { ExplanationSections } from './explain-check.ts';

export type ExplainStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'streaming'; readonly partial: string }
  | { readonly state: 'done'; readonly sections: ExplanationSections }
  | { readonly state: 'withheld'; readonly reason: string }
  | { readonly state: 'failed'; readonly reason: string };

export interface ExplainRequest {
  readonly spec: ModelSpec;
  readonly program: string;
  readonly office: string;
  readonly actionType: string;
  readonly noticeText: string;
  /** Confirmed values, already formatted the way they should read. */
  readonly deadline?: string;
  readonly hearingBy?: string;
}

/**
 * Generate an explanation, reporting progress as it arrives.
 *
 * Returns the final status. `withheld` is a success in the sense that nothing
 * broke — the sanity pass found a problem and the explanation is not being
 * shown, which is the correct outcome and must not be dressed up as an error.
 */
export async function explain(
  request: ExplainRequest,
  onStatus: (status: ExplainStatus) => void,
): Promise<ExplainStatus> {
  const file = modelFile(request.spec);
  if (!file.exists) {
    return finish(onStatus, { state: 'failed', reason: 'model-missing' });
  }

  onStatus({ state: 'loading' });
  let context: LlamaContext | undefined;

  try {
    context = await initLlama({
      model: file.uri.replace('file://', ''),
      n_ctx: 4096,
      n_gpu_layers: 99,
    });

    const prompt = buildExplanationPrompt({
      program: request.program,
      office: request.office,
      actionType: request.actionType,
      hasDeadline: request.deadline !== undefined,
      hasHearingDate: request.hearingBy !== undefined,
      noticeText: request.noticeText,
    });

    let partial = '';
    const result = await context.completion(
      {
        prompt,
        n_predict: 300,
        temperature: 0.3,
        // The grammar forbids digits outright, so a fabricated date is not
        // merely rejected afterwards — it is unreachable.
        grammar: EXPLANATION_GRAMMAR,
        stop: ['\n\n', 'LETTER:'],
      },
      (data) => {
        partial += data.token;
        // Substituted as it streams, so the reader never sees `{deadline}`
        // flash past on its way to being replaced.
        onStatus({ state: 'streaming', partial: fill(partial, request) });
      },
    );

    const filled = fill(result.text.trim(), request);
    const sections = parseSections(filled);
    if (!sections) {
      // A partial explanation is a stub, and CLAUDE.md §10 says cut a stub
      // rather than ship it.
      return finish(onStatus, { state: 'withheld', reason: 'incomplete' });
    }

    const confirmed = [request.deadline, request.hearingBy].filter(
      (v): v is string => v !== undefined,
    );
    const check = checkExplanation(
      [sections.says, sections.doing, sections.when, sections.appeal].join(' '),
      confirmed,
    );
    if (!check.ok) {
      return finish(onStatus, { state: 'withheld', reason: check.problems.join(', ') });
    }

    return finish(onStatus, { state: 'done', sections });
  } catch (error) {
    return finish(onStatus, {
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Always released. A ~1 GB context left resident is what gets the app
    // killed the next time the camera opens.
    if (context) await releaseAllLlama();
  }
}

function fill(text: string, request: ExplainRequest): string {
  return substitute(text, {
    program: request.program,
    office: request.office,
    ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
    ...(request.hearingBy === undefined ? {} : { hearingBy: request.hearingBy }),
  });
}

function finish(onStatus: (s: ExplainStatus) => void, status: ExplainStatus): ExplainStatus {
  onStatus(status);
  return status;
}
