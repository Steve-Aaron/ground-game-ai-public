#!/usr/bin/env tsx
/**
 * Diagnoses why a signed-in user is getting 401s.
 *
 * Usage: npx tsx scripts/diagnose-auth.ts your-email@example.com
 *
 * Checks:
 *   1. Does a Firebase Auth user exist for this email?
 *   2. Does a Firestore users/{uid} doc exist with that UID?
 *   3. What custom claims does the Auth user have?
 *   4. Are there multiple Auth users for the same email (provider drift)?
 */

import { config as loadEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

loadEnv({ path: ".env.local" });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/diagnose-auth.ts you@example.com");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing FIREBASE_* env vars.");
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const auth = getAuth();
  const db = getFirestore();

  console.log(`\n=== Checking: ${email} ===\n`);

  // 1. Auth user
  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
    console.log("[1] Auth user FOUND:");
    console.log(`    uid:        ${authUser.uid}`);
    console.log(`    email:      ${authUser.email}`);
    console.log(`    providers:  ${authUser.providerData.map(p => p.providerId).join(", ") || "(none yet)"}`);
    console.log(`    claims:     ${JSON.stringify(authUser.customClaims || {})}`);
    console.log(`    disabled:   ${authUser.disabled}`);
    console.log(`    metadata.lastSignIn: ${authUser.metadata.lastSignInTime}`);
  } catch {
    console.log("[1] Auth user MISSING for that email");
    process.exit(1);
  }

  // 2. Firestore doc keyed to that UID
  const snap = await db.collection("users").doc(authUser.uid).get();
  if (snap.exists) {
    const data = snap.data()!;
    console.log("\n[2] Firestore users/{uid} FOUND:");
    console.log(`    role:                  ${data.role}`);
    console.log(`    allowedConstituencies: ${data.allowedConstituencies?.length || 0} entries`);
    console.log(`    first 3:               ${JSON.stringify((data.allowedConstituencies || []).slice(0, 3))}`);
  } else {
    console.log("\n[2] Firestore users/{uid} MISSING");
    console.log(`    Looked up: users/${authUser.uid}`);
    console.log("    THIS IS YOUR PROBLEM. Re-run: npm run bootstrap-admin -- " + email);
  }

  // 3. List all Auth users to detect duplicates by email
  console.log("\n[3] Scanning for duplicate Auth users with this email…");
  const all = await auth.listUsers(1000);
  const matches = all.users.filter(u => u.email?.toLowerCase() === email);
  if (matches.length > 1) {
    console.log(`    FOUND ${matches.length} Auth users with this email — provider drift:`);
    for (const u of matches) {
      console.log(`      uid: ${u.uid}  providers: ${u.providerData.map(p => p.providerId).join(", ")}`);
    }
    console.log("    This usually means Account Linking is disabled.");
  } else {
    console.log("    Single Auth user — no provider drift.");
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
