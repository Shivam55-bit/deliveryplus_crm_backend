import admin from 'firebase-admin';
import { existsSync, readFileSync } from 'node:fs';

let firebaseApp = null;
let messagingInstance = null;
let firebaseConfigured = false;
let warningLogged = false;

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n').trim();

const resolveServiceAccount = () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    return null;
  }

  if (!existsSync(serviceAccountPath)) {
    if (!warningLogged) {
      console.warn('Firebase service account path is configured but the file could not be found.', { serviceAccountPath });
      warningLogged = true;
    }
    return null;
  }

  try {
    const raw = readFileSync(serviceAccountPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (!warningLogged) {
      console.warn('Failed to parse Firebase service account file.', { message: error.message });
      warningLogged = true;
    }
    return null;
  }
};

export const initializeFirebaseAdmin = () => {
  if (firebaseApp) {
    return { app: firebaseApp, messaging: messagingInstance, isConfigured: firebaseConfigured };
  }

  const serviceAccount = resolveServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount?.project_id || 'delivery-plus-driver';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || serviceAccount?.client_email;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || serviceAccount?.private_key);

  if (!projectId || !clientEmail || !privateKey) {
    if (!warningLogged) {
      console.warn('Firebase Admin configuration is missing. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.');
      warningLogged = true;
    }
    return { app: null, messaging: null, isConfigured: false };
  }

  firebaseApp = admin.apps.length > 0 ? admin.app() : admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    projectId,
  });

  messagingInstance = firebaseApp.messaging?.();
  firebaseConfigured = Boolean(messagingInstance);
  return { app: firebaseApp, messaging: messagingInstance, isConfigured: firebaseConfigured };
};

const initialized = initializeFirebaseAdmin();

export const messaging = initialized.messaging;
export const isFirebaseConfigured = initialized.isConfigured;
export default initialized.app;
