import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1';

const firebaseConfig = {
  apiKey: 'AIzaSyAkOCgTGRpSyVGRIHf-HDJXDTa6nFFcync',
  authDomain: 'studio-285787437-bc95b.firebaseapp.com',
  projectId: useEmulators ? 'demo-vehicle-import' : 'studio-285787437-bc95b',
  storageBucket: 'studio-285787437-bc95b.firebasestorage.app',
  appId: '1:361047726956:web:18087147a9b516279eb149',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence);

export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
// Best-effort removal of the previous persistent private-record cache. An old
// open tab can block cleanup; this release always uses memory caching.
void clearIndexedDbPersistence(db).catch(() => undefined);
export const functions = getFunctions(app);
export const storage = getStorage(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
