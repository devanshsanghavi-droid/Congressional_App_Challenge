/**
 * Web stub: local notifications, kept in memory.
 *
 * Permissions report **granted**, because that is the ordinary state and the
 * preview is for layout. To style Home's "reminders are off" warning instead,
 * flip GRANTED to false and save — fast refresh shows it immediately.
 */
const GRANTED = true;

export const IosAuthorizationStatus = {
  NOT_DETERMINED: 0,
  DENIED: 1,
  AUTHORIZED: 2,
  PROVISIONAL: 3,
  EPHEMERAL: 4,
} as const;

export const SchedulableTriggerInputTypes = {
  DATE: 'date',
  TIME_INTERVAL: 'timeInterval',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  YEARLY: 'yearly',
  CALENDAR: 'calendar',
} as const;

export interface NotificationRequest {
  identifier: string;
  content: Record<string, unknown>;
  trigger: unknown;
}

const scheduled = new Map<string, NotificationRequest>();
let nextId = 1;

export function setNotificationHandler(): void {}

export async function getPermissionsAsync() {
  return {
    granted: GRANTED,
    status: GRANTED ? 'granted' : 'denied',
    canAskAgain: true,
    ios: { status: GRANTED ? IosAuthorizationStatus.AUTHORIZED : IosAuthorizationStatus.DENIED },
  };
}
export async function requestPermissionsAsync() {
  return getPermissionsAsync();
}

export async function scheduleNotificationAsync(request: {
  content: Record<string, unknown>;
  trigger: unknown;
}): Promise<string> {
  const id = `web-${String(nextId++)}`;
  scheduled.set(id, { identifier: id, content: request.content, trigger: request.trigger });
  return id;
}

export async function getAllScheduledNotificationsAsync(): Promise<NotificationRequest[]> {
  return [...scheduled.values()];
}
export async function cancelScheduledNotificationAsync(id: string): Promise<void> {
  scheduled.delete(id);
}
export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  scheduled.clear();
}
