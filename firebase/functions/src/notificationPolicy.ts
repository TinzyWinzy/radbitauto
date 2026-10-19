import type { NotificationChannel, NotificationPrefs } from './types.ts';

/** Transactional channels default on; marketing defaults off (opt-in). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: true,
  whatsapp: true,
  sms: true,
  marketing: false,
};

export function resolveNotificationPrefs(raw: unknown): NotificationPrefs {
  const source = (raw ?? {}) as Partial<Record<keyof NotificationPrefs, unknown>>;
  return {
    email: source.email !== false,
    whatsapp: source.whatsapp !== false,
    sms: source.sms !== false,
    marketing: source.marketing === true,
  };
}

export function channelEnabled(prefs: NotificationPrefs, channel: NotificationChannel): boolean {
  switch (channel) {
    case 'email':
      return prefs.email;
    case 'whatsapp':
      return prefs.whatsapp;
    case 'sms':
      return prefs.sms;
    case 'in_app':
    case 'log':
    default:
      return true;
  }
}

/** Effective channels for an outbox row, honouring the recipient's preferences. */
export function effectiveChannels(
  eventKey: string,
  requested: NotificationChannel[],
  prefs: NotificationPrefs,
): NotificationChannel[] {
  if (eventKey.startsWith('marketing_') && !prefs.marketing) return [];
  return requested.filter((channel) => channelEnabled(prefs, channel));
}
