import { HttpsError } from 'firebase-functions/v2/https';

// A stale Firestore read stream can outlive its transaction during contention, so the
// client reports "Transaction is invalid or closed" instead of the real outcome.
// Recreating the whole transaction is safe where the work is idempotent: reads repeat,
// creates fail on a document that already exists, and capacity is recomputed from state.
export async function retryClosedTransaction<T>(work: () => Promise<T>, exhaustedMessage: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await work();
    } catch (error) {
      const e = error as { code?: number | string; message?: string };
      const closed = e.message?.includes('Transaction is invalid or closed') === true && (e.code === 3 || e.code === 'invalid-argument');
      if (attempt === 2 || !closed) throw error;
    }
  }
  throw new HttpsError('aborted', exhaustedMessage);
}
