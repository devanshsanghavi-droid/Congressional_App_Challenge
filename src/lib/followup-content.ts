/**
 * The words of a second-chance reminder.
 *
 * AUTHORSHIP: Claude. App-side. Its own module so the scheduler and the
 * reschedule path share one wording without importing each other.
 */

import i18n from './i18n/index.ts';
import type { SecondChanceRule } from './content/types.ts';

export function followupContent(rule: SecondChanceRule, targetMs: number): { title: string; body: string } {
  const spanish = i18n.language.startsWith('es');
  const date = new Date(targetMs).toLocaleDateString(i18n.language, { weekday: 'long', month: 'long', day: 'numeric' });
  return {
    title: spanish ? rule.titleEs : rule.title,
    body: i18n.t('notifications.secondChanceBody', { date }),
  };
}
