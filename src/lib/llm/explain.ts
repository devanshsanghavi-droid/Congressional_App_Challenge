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
import { EXPLANATION_GRAMMAR, buildExplanationTurns } from './explain-grammar.ts';
import { checkExplanation, parseSections } from './explain-check.ts';
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
  /**
   * Confirmed dates, formatted the way Notice Detail renders them.
   *
   * Two jobs, and they used to be three. They go into the prompt so the model
   * can refer to a date it is told rather than one it derives, and they are the
   * set `checkExplanation` traces every date in the output back to. What they
   * are no longer is substitution input — there are no placeholders to fill.
   */
  readonly deadline?: string;
  readonly hearingBy?: string;
  /**
   * **Every** date the user confirmed on Review, rendered as the screen shows
   * it — notice date, effective date, appeal deadline, all of them, not just
   * the two above.
   *
   * This is the set `checkExplanation` traces against, and it has to be the
   * whole set. Measured 2026-08-24: given only the deadline, the check withheld
   * a correct explanation of notice 04 because the model mentioned the coverage
   * end date — a value that is on the letter, was extracted, and that the user
   * confirmed two fields above the deadline. The guardrail is "no date the user
   * did not confirm", and answering it with a partial view of what they
   * confirmed turns it into "no date except one".
   */
  readonly confirmedDates?: readonly string[];
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

    const messages = buildExplanationTurns({
      program: request.program,
      office: request.office,
      actionType: request.actionType,
      ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
      ...(request.hearingBy === undefined ? {} : { hearingBy: request.hearingBy }),
      noticeText: request.noticeText,
    });

    let partial = '';
    const result = await context.completion(
      {
        // `messages`, not `prompt`: llama.rn applies the chat template from the
        // GGUF's own metadata. Handed a flat string the model continued the
        // nearest pattern it could see, which was the instruction template, and
        // echoed it back instead of reading the letter. Measured 2026-08-28.
        messages,
        add_generation_prompt: true,
        // Three sections of prose rather than four, and none of them spends
        // tokens dodging a digit it is not allowed to write.
        n_predict: 260,
        temperature: 0.3,
        // A shape, not a filter: three labelled sections in a fixed order, so
        // the screen always has something under each heading. It makes no claim
        // about truth — that is `checkExplanation`, on the finished text.
        grammar: EXPLANATION_GRAMMAR,
        stop: ['\n\n', 'LETTER:'],
      },
      (data) => {
        partial += data.token;
        onStatus({ state: 'streaming', partial });
      },
    );

    const sections = parseSections(result.text.trim());
    if (!sections) {
      // A partial explanation is a stub, and CLAUDE.md §10 says cut a stub
      // rather than ship it.
      return finish(onStatus, { state: 'withheld', reason: 'incomplete' });
    }

    const confirmed = [
      ...(request.confirmedDates ?? []),
      request.deadline,
      request.hearingBy,
    ].filter((v): v is string => v !== undefined);
    const check = checkExplanation(
      [sections.says, sections.doing, sections.appeal].join(' '),
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

function finish(onStatus: (s: ExplainStatus) => void, status: ExplainStatus): ExplainStatus {
  onStatus(status);
  return status;
}
