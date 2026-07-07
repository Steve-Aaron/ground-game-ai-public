// Auth constants that need to be importable from the Edge runtime
// (middleware.ts). Kept separate from src/lib/auth.ts because that file
// imports firebase-admin, which uses dynamic code evaluation and can't run
// on Edge.

export const SESSION_COOKIE_NAME = "__session";
