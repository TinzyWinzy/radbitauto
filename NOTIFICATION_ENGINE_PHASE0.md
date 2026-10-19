# Notification Engine — Phase 0 Specification

**Status:** Phase 0 spec · **Date:** 2026-10-18 · **Owner:** Radbit Studios
**Depends on:** `POTRAZ_COMPLIANCE_ASSESSMENT.md` (consent/preferences before Phase 2)

## 1. Problem

The portal writes **in-app notifications** only, and it writes them **after** the
business transaction completes, best-effort, inside a `try/catch`:

- `notifyCaseUpdate` / `bestEffortNotify` — `firebase/functions/src/audits.ts:28,65`
- Call sites after the transaction: `cases.ts:318`, `cases.ts:422`,
  `payments.ts:201`, `quotations.ts:247`

**Consequence (VERIFIED by reading the code):** if the process crashes, the network
drops, or the customer has no linked user account at that instant, the notification
is **silently lost** — the business write is committed but the customer is never told.

**Second problem:** there is no outbound channel. Staff and customers learn about
changes only by opening the portal. There is no email, SMS, WhatsApp, or push.

## 2. Goals and non-goals

### Goals (Phase 0)
- **Never lose a notification intent:** enqueue the intent **inside** the business
  transaction (transactional outbox), so it is atomic with the business change.
- **Reliable in-app delivery** via a dispatcher that is idempotent and retryable.
- **A channel abstraction** so email/SMS/WhatsApp can be added without re-touching
  business code.
- **A log channel** for observability and test assertions.
- **Templates** decoupled from business logic.
- **Consent/preference substrate** (data model only in Phase 0) so Phase 2 messaging
  can be built compliantly.

### Non-goals (Phase 0)
- No FCM/push, no email provider, no SMS/WhatsApp provider.
- No marketing/bulk messaging.
- No notification preferences UI (data model only).

## 3. Architecture

```
business transaction ──► notification_outbox (pending)   ← atomic, cannot be lost
                                │  onDocumentCreated
                                ▼
                          dispatcher (transactional claim)
                                │
              ┌─────────────────┼───────────────────┐
              ▼                 ▼                   ▼
     in_app channel        log channel        (future: email / sms / whatsapp)
  users/{uid}/notifications  notification_log
```

- **Outbox** = durable intent, written in the same Firestore transaction as the
  business write.
- **Dispatcher** = a Firestore `onDocumentCreated` trigger that atomically **claims**
  the outbox row (only if `status == 'pending'`) and then performs channel delivery.
  Claiming inside a transaction makes concurrent/retried dispatches idempotent.
- **Channels** are independent delivery adapters. Phase 0 ships `in_app` and `log`.
- **Templates** render title/body from event data.

### Why a transactional outbox
A Firestore trigger alone does not guarantee the notification row is ever created if
the business write and the notification write are separate operations. Writing the
intent inside the business transaction removes that failure mode; the trigger only
needs to be *eventually* reliable, which the platform retries.

## 4. Data model

### 4.1 `notification_outbox/{outboxId}` (server-only)

| Field | Type | Notes |
|---|---|---|
| `companyId` | string | tenant |
| `caseId` | string | business entity the event refers to |
| `eventKey` | string | template key, e.g. `status_update` |
| `data` | map | event-specific variables (e.g. `stageLabel`, `totalDueCents`) |
| `channels` | string[] | default `['in_app','log']` |
| `status` | string | `pending` → `dispatched` \| `skipped` \| `failed` |
| `attempts` | number | dispatch attempts |
| `recipientUserId` | string \| null | resolved at dispatch |
| `createdAt` | timestamp | server timestamp |
| `dispatchedAt` | timestamp | set on dispatch |

### 4.2 `notification_log/{logId}` (server-only)

Append-only delivery record: `outboxId`, `companyId`, `caseId`, `eventKey`,
`channels`, `recipientUserId`, `status`, `createdAt`. Used for observability,
audit, and test assertions.

### 4.3 `users/{uid}/notifications/{nid}` — unchanged

The existing `NotificationDoc` shape is preserved (`types.ts:163`), so the client
(`useNotifications`, `hooks.ts:406`) and the Account page keep working unchanged:

```ts
{ companyId, caseId, type, title, body, payload, createdAt }
```

### 4.4 Preferences / consent (Phase 0 = schema only)

Reserved for Phase 2, stored per recipient (e.g. `users/{uid}/notification_prefs/main`
and customer consent flags). Not read by Phase 0 delivery.

## 5. Event catalog (existing touch-points)

| eventKey | Trigger | Touch-point | Channels (Phase 0) |
|---|---|---|---|
| `case_created` | case created | `cases.ts` `createCase` | in_app, log |
| `status_update` | stage advanced | `cases.ts` `advanceImportStage` | in_app, log |
| `quotation_issued` | quotation issued | `quotations.ts` `issueQuotation` | in_app, log |
| `payment_confirmed` | payment confirmed | `payments.ts` `confirmPayment` | in_app, log |

Future event keys (Phase 1+), not implemented now: `document_verified`,
`payment_recorded`, `invitation_created`, `case_assigned`.

## 6. Internal API

```ts
// firebase/functions/src/notifications.ts

// Called INSIDE a business transaction. Synchronous; writes the outbox row and
// returns the new outbox id (handy for tests and for chaining).
enqueueNotification(txn: Transaction, input: {
  companyId: string;
  caseId: string;
  eventKey: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}): string;

// Core dispatcher. Idempotent. Exported for tests.
dispatchOutbox(outboxId: string): Promise<void>;

// Firestore trigger registered in index.ts.
onNotificationOutbox  // onDocumentCreated('notification_outbox/{outboxId}')
```

Dispatcher behaviour:

1. Transactionally read the outbox row; **return early unless `status == 'pending'`**.
2. Resolve the recipient user from `import_cases/{caseId}` → `customers/{customerId}.userId`.
3. Render the template to `{ title, body }`.
4. If `in_app` and a recipient exists → write `users/{uid}/notifications`.
5. Always append a `notification_log` row.
6. Set outbox `status` to `dispatched` (delivered) or `skipped` (no recipient).
7. All reads happen before any write (Firestore transaction rule).

## 7. Failure handling

- **No recipient user:** status `skipped`; logged. Not an error (customer may simply
  not have portal access yet).
- **Unknown template key:** status `failed`; logged. Fail loud in tests.
- **Channel error:** Phase 0 throws so the platform retries the trigger; a dedicated
  retry/attempt cap is a Phase 1 item (`attempts`, dead-letter).

## 8. Observability

- `notification_log` is the source of truth for "what was sent, to whom, when".
- Structured `console.log`/`console.error` per dispatch for Cloud Logging.
- No PII beyond ids/log text already present in the in-app body.

## 9. Testing (emulator)

New suite `firebase/functions/test/emulator/notifications.test.ts`:

1. Enqueue + dispatch writes exactly one `users/{uid}/notifications` row with the
   preserved `NotificationDoc` shape and a `notification_log` row.
2. Dispatch is **idempotent** — running twice yields one in-app row, one log row.
3. No linked user → `status: 'skipped'`, no in-app row, one log row.
4. Unknown template key → `status: 'failed'`.
5. Cross-tenant: dispatch only ever targets the case's own customer.

Run: `npm --prefix firebase run test:emulator` (or `npm run test:emulator` from
`firebase/`).

## 10. Rollout

- **Commit 1 (this change):** engine (`notifications.ts`), templates, outbox + log
  collections, trigger registration, migration of the four call sites from
  `bestEffortNotify` to in-transaction `enqueueNotification`, emulator tests.
- **Commit 2:** `email` channel to staff (staff already have email; customers do not
  — see §11), preference/consent data model.
- **Commit 3:** customer email (requires capturing customer email), unsubscribe.
- **Commit 4:** SMS/WhatsApp adapters, gated behind consent + POTRAZ work.

## 11. Known constraints

- **VERIFIED:** `customers` docs have **no `email`** field (`customers.ts:26`,
  `CustomerDoc` `types.ts:33`); staff do have email. So email-to-staff is available
  first; customer email requires a schema/data-collection change.
- **VERIFIED:** notifications are in-app only today; the client read path is
  `useNotifications` (`hooks.ts:406`).
- **Cross-cutting:** any outbound channel must respect the consent/preferences
  substrate and the POTRAZ assessment before launch.

## 12. Acceptance criteria (Phase 0)

- [ ] Notification intent is written inside the business transaction (outbox row).
- [ ] A Firestore trigger dispatches it; dispatch is idempotent under retry/race.
- [ ] In-app `NotificationDoc` shape is unchanged; the Account page still renders.
- [ ] A `notification_log` row exists per dispatch.
- [ ] The four existing call sites no longer use post-transaction best-effort notify.
- [ ] `npm --prefix firebase/functions run build` and `run typecheck` pass.
- [ ] Full emulator suite passes (existing tests + new notification tests).

## 13. Open decisions

1. Outbox retention/cleanup policy (e.g. delete `dispatched` rows after N days)?
2. Do we add a bounded retry + dead-letter in Phase 1?
3. Should staff be notified for the same events as customers (fan-out in one event)?
4. Preference granularity: per event type, per channel, or both?
5. Does the platform or each agency own the messaging consent record (see POTRAZ
   assessment §3)?
