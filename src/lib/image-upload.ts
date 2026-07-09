// Shared image-upload validation + storage for user photo features
// (campaign material, canvassing sessions). Firebase Storage stays private;
// callers serve images via signed URLs.

import { randomUUID } from "crypto";
import { adminBucket } from "@/lib/firebase-admin";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Validate an uploaded image; returns the file extension or an error string. */
export function validateImage(file: File): { ext: string } | { error: string } {
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Photo too large (max 8MB)" };
  }
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    return { error: "Unsupported file type — use JPEG, PNG, WebP or HEIC" };
  }
  return { ext };
}

/** Save an image under `<prefix>/<uuid>.<ext>`; returns the storage path. */
export async function saveImage(file: File, prefix: string, ext: string): Promise<string> {
  const storagePath = `${prefix}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await adminBucket().file(storagePath).save(buffer, {
    contentType: file.type,
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });
  return storagePath;
}

/** Signed read URL (1h) for a stored image. */
export async function signedImageUrl(storagePath: string): Promise<string> {
  const [url] = await adminBucket()
    .file(storagePath)
    .getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return url;
}
