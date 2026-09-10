/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Supabase Cloud Storage Subsystem (Server-only)
 *  Provides persistent legal document and evidence vault storage
 *  backed by Supabase Storage with SHA-256 integrity verification.
 * ───────────────────────────────────────────────────────────── */

import { computeSha256 } from "./crypto.server";
import {
  getSupabaseAdminClient,
  getSupabaseClient,
  getSupabaseConfig,
  isSupabaseConfigured,
} from "./supabase";

export interface SupabaseUploadResult {
  success: boolean;
  objectKey: string;
  bucket: string;
  publicUrl?: string;
  signedUrl?: string;
  sha256Hash: string;
  sizeBytes: number;
  error?: string;
}

/**
 * Checks if Supabase Storage is active and configured.
 */
export function isSupabaseStorageConfigured(): boolean {
  return isSupabaseConfigured();
}

/**
 * Ensures the target evidence storage bucket exists in Supabase.
 */
async function ensureBucketExists(): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) return false;

  try {
    const { data: buckets } = await client.storage.listBuckets();
    if (buckets && buckets.some((b) => b.name === config.bucket || b.id === config.bucket)) {
      return true;
    }
    // Attempt to create bucket
    const { error } = await client.storage.createBucket(config.bucket, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Uploads an authoritative legal document buffer to Supabase Storage.
 */
export async function uploadToSupabaseStorage(
  objectKey: string,
  buffer: Buffer | Uint8Array,
  mimeType: string = "application/pdf",
): Promise<SupabaseUploadResult> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) {
    throw new Error("Could not initialize Supabase client for storage upload.");
  }

  const normalizedBuffer = Buffer.from(buffer);
  const sha256Hash = computeSha256(normalizedBuffer);
  const cleanPath = objectKey.replace(/^[/\\]+/, "");

  try {
    await ensureBucketExists();

    const { error: uploadError } = await client.storage
      .from(config.bucket)
      .upload(cleanPath, normalizedBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        objectKey: cleanPath,
        bucket: config.bucket,
        sha256Hash,
        sizeBytes: normalizedBuffer.length,
        error: uploadError.message,
      };
    }

    // Generate public or signed URL
    const { data: publicData } = client.storage
      .from(config.bucket)
      .getPublicUrl(cleanPath);

    return {
      success: true,
      objectKey: cleanPath,
      bucket: config.bucket,
      publicUrl: publicData?.publicUrl,
      sha256Hash,
      sizeBytes: normalizedBuffer.length,
    };
  } catch (err: any) {
    return {
      success: false,
      objectKey: cleanPath,
      bucket: config.bucket,
      sha256Hash,
      sizeBytes: normalizedBuffer.length,
      error: err?.message || String(err),
    };
  }
}

/**
 * Downloads a file buffer from Supabase Storage and computes its SHA-256 digest.
 */
export async function downloadFromSupabaseStorage(
  objectKey: string,
): Promise<{ buffer: Buffer; sha256: string } | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) return null;

  const cleanPath = objectKey.replace(/^[/\\]+/, "");

  try {
    const { data, error } = await client.storage
      .from(config.bucket)
      .download(cleanPath);

    if (error || !data) {
      return null;
    }

    const arrayBuf = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const sha256 = computeSha256(buffer);

    return { buffer, sha256 };
  } catch {
    return null;
  }
}

/**
 * Retrieves a signed or public download URL for an object in Supabase Storage.
 */
export async function getSupabaseDownloadUrl(
  objectKey: string,
  expiresInSeconds: number = 3600,
): Promise<string | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) return null;

  const cleanPath = objectKey.replace(/^[/\\]+/, "");

  try {
    const { data: signedData, error: signedError } = await client.storage
      .from(config.bucket)
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (!signedError && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    // Fall back to public URL
    const { data: publicData } = client.storage
      .from(config.bucket)
      .getPublicUrl(cleanPath);

    return publicData?.publicUrl || null;
  } catch {
    return null;
  }
}

/**
 * Deletes a file from Supabase Storage.
 */
export async function deleteFromSupabaseStorage(
  objectKey: string,
): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) return false;

  const cleanPath = objectKey.replace(/^[/\\]+/, "");

  try {
    const { error } = await client.storage
      .from(config.bucket)
      .remove([cleanPath]);

    return !error;
  } catch {
    return false;
  }
}
