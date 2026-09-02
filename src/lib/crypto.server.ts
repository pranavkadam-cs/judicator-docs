/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Cryptographic SHA-256 File Integrity Engine
 *  Server-only cryptographic module using Node.js crypto
 * ───────────────────────────────────────────────────────────── */

import { createHash, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";

/**
 * Computes a standardized 64-character lowercase hexadecimal SHA-256 digest
 * from a Buffer, Uint8Array, or string.
 *
 * @param data Buffer | Uint8Array | string - Raw content to hash
 * @returns 64-character lowercase hex string
 */
export function computeSha256(data: Buffer | Uint8Array | string): string {
  const hash = createHash("sha256");
  if (typeof data === "string") {
    hash.update(data, "utf8");
  } else {
    hash.update(data);
  }
  return hash.digest("hex").toLowerCase();
}

/**
 * Computes SHA-256 hash using streaming/chunked processing to avoid
 * memory spikes for large files.
 *
 * @param stream Readable stream of file bytes
 * @returns Promise<string> 64-character lowercase hex string
 */
export async function computeSha256Stream(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex").toLowerCase());
    });
    stream.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Performs a constant-time comparison between two SHA-256 hex strings
 * to protect against timing attacks.
 *
 * @param hashA First hash (64 hex chars)
 * @param hashB Second hash (64 hex chars)
 * @returns boolean
 */
export function safeCompareHashes(hashA: string, hashB: string): boolean {
  if (!hashA || !hashB || hashA.length !== 64 || hashB.length !== 64) {
    return false;
  }
  try {
    const bufA = Buffer.from(hashA.toLowerCase(), "hex");
    const bufB = Buffer.from(hashB.toLowerCase(), "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Validates whether a given string is a valid 64-character hexadecimal SHA-256 digest.
 */
export function isValidSha256(hash: string): boolean {
  return typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash.trim());
}
