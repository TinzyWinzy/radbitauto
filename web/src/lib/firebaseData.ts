import {
  initializeFirestore,
  memoryLocalCache,
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { app } from './firebase';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1';

// Firestore and Storage live in their own module so the public shell (landing,
// sign-in, import catalogue) never downloads them. Only authenticated app
// routes import this file.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
// Best-effort removal of the previous persistent private-record cache. An old
// open tab can block cleanup; this release always uses memory caching.
void clearIndexedDbPersistence(db).catch(() => undefined);

export const storage = getStorage(app);

if (useEmulators) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
