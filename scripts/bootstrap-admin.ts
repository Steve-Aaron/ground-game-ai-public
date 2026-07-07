#!/usr/bin/env tsx
/**
 * One-off script to create the first admin user.
 *
 * Usage:
 *   npm run bootstrap-admin -- you@example.com
 *
 * What it does:
 *   1. Creates (or finds) a Firebase Auth user for the given email
 *   2. Sets role='admin' custom claim
 *   3. Writes a Firestore users/{uid} document with role='admin' and
 *      allowedConstituencies = ALL 650 slugs
 *   4. Generates a magic sign-in link and prints it to stdout
 *
 * Required env (read from .env.local):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *   NEXT_PUBLIC_SITE_URL  (e.g. http://localhost:3000)
 *
 * Re-running with the same email is safe: it upgrades the user to admin and
 * regrants all constituencies, but doesn't duplicate the Auth record.
 */

import { config as loadEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { CONSTITUENCIES } from "../src/data/constituencies";

loadEnv({ path: ".env.local" });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run bootstrap-admin -- you@example.com");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "Missing env. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const auth = getAuth();
  const db = getFirestore();

  // 1. Get or create the Auth user.
  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
    console.log(`Found existing Auth user: ${authUser.uid}`);
  } catch {
    authUser = await auth.createUser({ email });
    console.log(`Created Auth user: ${authUser.uid}`);
  }

  // 2. Set admin custom claim.
  await auth.setCustomUserClaims(authUser.uid, { role: "admin" });
  console.log("Set custom claim: role=admin");

  // 3. Write Firestore user record with all 650 constituencies.
  const allSlugs = CONSTITUENCIES.map((c) => c.slug);
  const now = new Date().toISOString();
  await db.collection("users").doc(authUser.uid).set(
    {
      uid: authUser.uid,
      email,
      displayName: authUser.displayName || email,
      role: "admin",
      allowedConstituencies: allSlugs,
      createdAt: now,
      updatedAt: now,
      createdBy: "bootstrap-script",
    },
    { merge: true }
  );
  console.log(`Wrote users/${authUser.uid} with ${allSlugs.length} constituencies`);

  // 4. Generate a magic sign-in link.
  const link = await auth.generateSignInWithEmailLink(email, {
    url: `${siteUrl}/login`,
    handleCodeInApp: true,
  });

  console.log("\n--- Sign-in link ---");
  console.log(link);
  console.log("\nOpen this in your browser on the same device, or send it to the user.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
