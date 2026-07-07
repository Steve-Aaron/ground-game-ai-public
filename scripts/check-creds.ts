#!/usr/bin/env tsx
// Diagnostic: prove the env vars are loading and the private key is well-formed.
// Run: npx tsx scripts/check-creds.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY;
const privateKey = rawKey?.replace(/\\n/g, "\n");

console.log("FIREBASE_PROJECT_ID:", projectId ? "SET" : "MISSING", projectId);
console.log("FIREBASE_CLIENT_EMAIL:", clientEmail ? "SET" : "MISSING", clientEmail);
console.log("FIREBASE_PRIVATE_KEY (raw):", rawKey ? `SET (${rawKey.length} chars)` : "MISSING");

if (privateKey) {
  console.log("---");
  console.log("First 40 chars:", JSON.stringify(privateKey.slice(0, 40)));
  console.log("Last 40 chars: ", JSON.stringify(privateKey.slice(-40)));
  console.log("Contains BEGIN header:", privateKey.includes("-----BEGIN PRIVATE KEY-----"));
  console.log("Contains END footer: ", privateKey.includes("-----END PRIVATE KEY-----"));
  console.log("Real newline count:  ", (privateKey.match(/\n/g) || []).length);
  console.log("Literal \\n count:   ", (privateKey.match(/\\n/g) || []).length);
}

console.log("---");
console.log("--- Client-side (NEXT_PUBLIC_*) ---");
for (const k of [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
]) {
  const v = process.env[k];
  console.log(`${k}: ${v ? `SET (${v.length} chars)` : "MISSING"}`);
}
