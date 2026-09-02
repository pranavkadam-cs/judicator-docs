/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — File Storage Layer (Server-only)
 *  Provides persistent local file storage with path-traversal protection
 *  and seamless S3 gateway integration.
 * ───────────────────────────────────────────────────────────── */

import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { computeSha256 } from "./crypto.server";
import { s3Configured, signDownload, signUpload } from "./s3.server";

const STORAGE_ROOT = path.resolve(process.cwd(), ".data", "storage");

/**
 * Resolves a safe filesystem path within the storage directory,
 * strictly preventing path-traversal attacks.
 */
function resolveStoragePath(objectKey: string): string {
  // Normalize and prevent directory traversal
  const cleanKey = objectKey.replace(/^[/\\]+/, "").replace(/\.\./g, "");
  const resolved = path.resolve(STORAGE_ROOT, cleanKey);

  // Security check: ensure resolved path is inside STORAGE_ROOT
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error(`Security Exception: Path traversal attempt detected for key "${objectKey}"`);
  }
  return resolved;
}

/**
 * Ensures the base storage directory exists.
 */
async function ensureStorageDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Stores a file buffer to the local storage subsystem.
 */
export async function saveLocalFile(objectKey: string, buffer: Buffer | Uint8Array): Promise<string> {
  const targetPath = resolveStoragePath(objectKey);
  await ensureStorageDir(targetPath);
  await fs.writeFile(targetPath, Buffer.from(buffer));
  return targetPath;
}

/**
 * Reads a stored file as a Buffer.
 */
export async function readLocalFile(objectKey: string): Promise<Buffer | null> {
  const targetPath = resolveStoragePath(objectKey);
  try {
    return await fs.readFile(targetPath);
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Returns a readable stream for a stored file (for memory-efficient processing).
 */
export function getLocalFileStream(objectKey: string): Readable | null {
  const targetPath = resolveStoragePath(objectKey);
  if (!existsSync(targetPath)) return null;
  return createReadStream(targetPath);
}

/**
 * Checks if a file exists in local storage.
 */
export async function fileExists(objectKey: string): Promise<boolean> {
  const targetPath = resolveStoragePath(objectKey);
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a stored file (used for rollback/cleanup).
 */
export async function deleteLocalFile(objectKey: string): Promise<boolean> {
  const targetPath = resolveStoragePath(objectKey);
  try {
    await fs.unlink(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIMULATE TAMPERING: Modifies exactly 1 byte in the stored file on disk.
 * This is used for live demonstration and testing to show that the SHA-256
 * verification engine detects unauthorized modification and blocks downloads.
 */
export async function simulateTamperFile(objectKey: string): Promise<{
  originalHash: string;
  tamperedHash: string;
  bytesModified: number;
}> {
  const targetPath = resolveStoragePath(objectKey);
  const data = await fs.readFile(targetPath);
  const originalHash = computeSha256(data);

  // Flip bits in the middle byte
  const modified = Buffer.from(data);
  const targetIndex = Math.floor(modified.length / 2);
  modified[targetIndex] = (modified[targetIndex] ?? 0) ^ 0xff; // Invert all 8 bits of one byte

  await fs.writeFile(targetPath, modified);
  const tamperedHash = computeSha256(modified);

  return {
    originalHash,
    tamperedHash,
    bytesModified: 1,
  };
}

/**
 * Unified file retrieval: pulls file bytes from either local storage or S3.
 */
export async function retrieveFileBytes(objectKey: string): Promise<Buffer | null> {
  // Check local storage first
  const local = await readLocalFile(objectKey);
  if (local) return local;

  // Fallback to S3 if configured
  if (s3Configured()) {
    const signed = await signDownload(objectKey).catch(() => null);
    if (signed?.url) {
      const res = await fetch(signed.url);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    }
  }

  return null;
}
