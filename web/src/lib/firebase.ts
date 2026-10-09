import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

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

export const functions = getFunctions(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
