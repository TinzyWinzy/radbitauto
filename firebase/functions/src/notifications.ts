import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from './db.ts';
import { ts } from './audits.ts';
import { DEFAULT_NOTIFICATION_PREFS, effectiveChannels, resolveNotificationPrefs } from './notificationPolicy.ts';
import type {
  NotificationChannel,
  NotificationDoc,
  NotificationLogDoc,
  NotificationOutboxDoc,
  NotificationOutboxStatus,
} from './types.ts';

export const OUTBOX_COLLECTION = 'notification_outbox';
export const LOG_COLLECTION = 'notification_log';
export const DEFAULT_CHANNELS: NotificationChannel[] = ['in_app', 'log'];

interface NotificationTemplate {
  title: (data: Record<string, unknown>) => string;
  body: (data: Record<string, unknown>) => string;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asUsd(value: unknown): string {
  return typeof value === 'number' ? (value / 100).toFixed(2) : '0.00';
}

const TEMPLATES: Record<string, NotificationTemplate> = {
  case_created: {
    title: () => 'Import enquiry received',
    body: (data) => `Your import ${asString(data.caseNum)} (${asString(data.stageLabel)}) has been registered.`,
  },
  status_update: {
    title: () => 'Import status updated',
    body: (data) => `Your import ${asString(data.caseNum)} is now at: ${asString(data.stageLabel)}`,
  },
  quotation_issued: {
    title: () => 'New quotation',
    body: (data) => `Your quotation for ${asString(data.caseNum)} is ready. Total due: $${asUsd(data.totalDueCents)}`,
  },
  payment_confirmed: {
    title: () => 'Payment confirmed',
    body: () => 'Payment confirmed on your import.',
  },
  marketing_offer: {
    title: () => 'News from your agency',
    body: (data) => asString(data.message, 'You have a new update from your agency.'),
  },
};

export interface EnqueueNotificationInput {
  companyId: string;
  caseId: string;
  eventKey: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

/**
 * Writes a notification intent inside the caller's business transaction, so the
 * intent cannot be lost when the business write commits. Delivery is performed
 * asynchronously by the outbox dispatcher.
 */
export function enqueueNotification(txn: Transaction, input: EnqueueNotificationInput): string {
  const outbox: NotificationOutboxDoc = {
    companyId: input.companyId,
    caseId: input.caseId,
    eventKey: input.eventKey,
    data: input.data ?? {},
    channels: input.channels ?? DEFAULT_CHANNELS,
    status: 'pending',
    attempts: 0,
    createdAt: ts(),
  };
  const ref = db.collection(OUTBOX_COLLECTION).doc();
  txn.set(ref, outbox);
  return ref.id;
}

/**
 * Idempotent dispatcher for one outbox row. Atomically claims the row (only when it
 * is still `pending`), resolves the recipient, renders the template and writes the
 * in-app notification plus a log record. Safe to run concurrently or on retry.
 */
export async function dispatchOutbox(outboxId: string): Promise<void> {
  const outboxRef = db.collection(OUTBOX_COLLECTION).doc(outboxId);
  await db.runTransaction(async (txn) => {
    const outboxSnap = await txn.get(outboxRef);
    if (!outboxSnap.exists) {
      return;
    }
    const outbox = outboxSnap.data() as NotificationOutboxDoc;
    if (outbox.status !== 'pending') {
      return;
    }

    const caseRef = db.collection('import_cases').doc(outbox.caseId);
    const caseSnap = await txn.get(caseRef);
    const caseData = caseSnap.exists ? (caseSnap.data() as Record<string, unknown>) : undefined;
    const customerId = typeof caseData?.customerId === 'string' ? caseData.customerId : undefined;
    const customerRef = customerId ? db.collection('customers').doc(customerId) : null;
    const customerSnap = customerRef ? await txn.get(customerRef) : null;
    const linkedUserId = customerSnap?.exists ? customerSnap.data()?.userId : undefined;
    const recipientUserId = typeof linkedUserId === 'string' && linkedUserId !== '' ? linkedUserId : null;

    const data = outbox.data ?? {};
    const requested = outbox.channels ?? DEFAULT_CHANNELS;
    const template = TEMPLATES[outbox.eventKey];
    const now = ts();
    const logRef = db.collection(LOG_COLLECTION).doc();

    let prefs = DEFAULT_NOTIFICATION_PREFS;
    if (recipientUserId !== null) {
      const userSnap = await txn.get(db.collection('users').doc(recipientUserId));
      prefs = resolveNotificationPrefs(userSnap.data()?.notificationPrefs);
    }
    const channels = effectiveChannels(outbox.eventKey, requested, prefs);

    const writeLog = (status: NotificationOutboxStatus): void => {
      const log: NotificationLogDoc = {
        outboxId,
        companyId: outbox.companyId,
        caseId: outbox.caseId,
        eventKey: outbox.eventKey,
        channels,
        recipientUserId,
        status,
        createdAt: now,
      };
      txn.set(logRef, log);
    };

    if (template === undefined) {
      writeLog('failed');
      txn.update(outboxRef, {
        status: 'failed',
        attempts: (outbox.attempts ?? 0) + 1,
        dispatchedAt: now,
        recipientUserId,
      });
      return;
    }

    const title = template.title(data);
    const body = template.body(data);
    const inApp = channels.includes('in_app') && recipientUserId !== null;

    if (inApp && recipientUserId !== null) {
      txn.set(
        db.collection('users').doc(recipientUserId).collection('notifications').doc(),
        {
          companyId: outbox.companyId,
          caseId: outbox.caseId,
          type: outbox.eventKey,
          title,
          body,
          payload: { caseRef: caseData?.caseNum, stage: caseData?.currentStage, ...data },
          createdAt: now,
        } satisfies NotificationDoc,
      );
    }

    const status: NotificationOutboxStatus = inApp ? 'dispatched' : 'skipped';
    writeLog(status);
    txn.update(outboxRef, {
      status,
      attempts: (outbox.attempts ?? 0) + 1,
      dispatchedAt: now,
      recipientUserId,
    });
  });
}

export const onNotificationOutbox = onDocumentCreated(`${OUTBOX_COLLECTION}/{outboxId}`, async (event) => {
  await dispatchOutbox(event.params.outboxId);
});
