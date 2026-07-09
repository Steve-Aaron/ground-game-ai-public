// Firebase Admin SDK singleton — server-only.
// Used for: session cookie creation/verification, custom claims, user CRUD,
// and any Firestore access that should bypass client-side security rules.
//
// Env vars (set server-side, NOT NEXT_PUBLIC):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY    (paste with literal `\n` in .env, we replace)
//
// Get these from: Firebase Console → Project Settings → Service Accounts →
// Generate new private key. The JSON contains projectId/clientEmail/privateKey.

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let _app: App | undefined;

function getAdminApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length) {
    _app = existing[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin SDK not configured. Missing one of: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return _app;
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/**
 * Default Storage bucket. Uses NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (already
 * set for the client SDK) so no extra env var is needed.
 */
export function adminBucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }
  return getStorage(getAdminApp()).bucket(bucketName);
}
