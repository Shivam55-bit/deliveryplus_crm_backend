import admin from 'firebase-admin';
import { existsSync, readFileSync } from 'node:fs';

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n').trim();

const resolveServiceAccount = () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    return null;
  }

  if (!existsSync(serviceAccountPath)) {
    console.error('Firebase service account path is configured but the file could not be found.');
    return null;
  }

  try {
    const raw = readFileSync(serviceAccountPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse Firebase service account file', { message: error.message });
    return null;
  }
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = resolveServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID || 'delivery-plus-driver';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || serviceAccount?.client_email;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || serviceAccount?.private_key);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Firebase Admin configuration is missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_PATH.');
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });

  return admin.app();
};

const firebaseApp = initializeFirebaseAdmin();
export const messaging = firebaseApp?.messaging?.() || null;
export const isFirebaseConfigured = Boolean(messaging);
export default firebaseApp;
