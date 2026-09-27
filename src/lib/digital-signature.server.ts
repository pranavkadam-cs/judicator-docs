/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Cryptographic Digital Signature Engine
 *  Server-only RSA-SHA256 digital signature module
 *
 *  Implements real public-key cryptography:
 *    1. RSA-2048 key pair generation (per signer)
 *    2. SHA-256 digest signing with RSA private key
 *    3. Signature verification with RSA public key
 *    4. Key storage & management in .data/keys/
 *
 *  Standards: PKCS#1 v1.5, SHA-256
 * ───────────────────────────────────────────────────────────── */

import {
  generateKeyPairSync,
  createSign,
  createVerify,
  createHash,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────

export interface KeyPairInfo {
  publicKeyPem: string;
  privateKeyPem: string;
  algorithm: "RSA-SHA256";
  keySize: 2048;
  createdAt: string;
  signerId: string;
  signerName: string;
}

export interface DigitalSignatureResult {
  /** Base64-encoded RSA signature bytes */
  signatureBase64: string;
  /** Hex-encoded signature (for display) */
  signatureHex: string;
  /** Short display-friendly signature ID */
  signatureId: string;
  /** The SHA-256 hash that was signed */
  signedHash: string;
  /** Algorithm used */
  algorithm: "RSA-SHA256";
  /** Key size in bits */
  keySize: 2048;
  /** PEM-encoded public key of signer (for independent verification) */
  publicKeyPem: string;
  /** Fingerprint of the signer's public key */
  publicKeyFingerprint: string;
  /** Signer identity */
  signerId: string;
  signerName: string;
  signerBadge: string;
  signerRole: string;
  /** Timestamp of signing */
  signedAt: string;
  /** Whether signature was verified immediately after creation */
  verifiedOnCreate: boolean;
}

export interface SignatureVerificationResult {
  /** Whether the signature is cryptographically valid */
  valid: boolean;
  /** Algorithm used for verification */
  algorithm: "RSA-SHA256";
  /** The hash that was verified */
  verifiedHash: string;
  /** Public key fingerprint that verified the signature */
  publicKeyFingerprint: string;
  /** Timestamp of verification */
  verifiedAt: string;
  /** If invalid, a reason string */
  failureReason?: string;
}

// ── Key Storage ────────────────────────────────────────────

const KEYS_DIR = join(process.cwd(), ".data", "keys");

function ensureKeysDir(): void {
  if (!existsSync(KEYS_DIR)) {
    mkdirSync(KEYS_DIR, { recursive: true });
  }
}

function keyPath(signerId: string, type: "public" | "private"): string {
  // Sanitize signer ID for filesystem
  const safe = signerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(KEYS_DIR, `${safe}.${type}.pem`);
}

/**
 * Computes a SHA-256 fingerprint of a PEM-encoded public key.
 * Returns a colon-separated hex string (e.g., "ab:cd:ef:12:...")
 */
export function computeKeyFingerprint(publicKeyPem: string): string {
  const hash = createHash("sha256")
    .update(publicKeyPem.trim())
    .digest("hex");
  // Format as colon-separated pairs for readability
  return hash.match(/.{2}/g)!.join(":").toUpperCase();
}

// ── Key Pair Management ────────────────────────────────────

/**
 * Generates or retrieves an RSA-2048 key pair for a given signer.
 * Keys are persisted in .data/keys/ for consistency across sessions.
 *
 * @param signerId  Unique identifier of the signer
 * @param signerName  Human-readable name (stored in key metadata)
 * @returns KeyPairInfo with PEM-encoded public and private keys
 */
export function getOrCreateKeyPair(
  signerId: string,
  signerName: string,
): KeyPairInfo {
  ensureKeysDir();

  const pubPath = keyPath(signerId, "public");
  const privPath = keyPath(signerId, "private");

  // Return existing key pair if present
  if (existsSync(pubPath) && existsSync(privPath)) {
    return {
      publicKeyPem: readFileSync(pubPath, "utf8"),
      privateKeyPem: readFileSync(privPath, "utf8"),
      algorithm: "RSA-SHA256",
      keySize: 2048,
      createdAt: new Date().toISOString(),
      signerId,
      signerName,
    };
  }

  // Generate fresh RSA-2048 key pair
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  // Persist to disk
  writeFileSync(pubPath, publicKey, "utf8");
  writeFileSync(privPath, privateKey, "utf8");

  console.log(
    `[Vigil.OS] Generated RSA-2048 key pair for signer: ${signerName} (${signerId})`,
  );

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    algorithm: "RSA-SHA256",
    keySize: 2048,
    createdAt: new Date().toISOString(),
    signerId,
    signerName,
  };
}

/**
 * Retrieves the public key for a signer (if it exists).
 * Used for independent signature verification without exposing private key.
 */
export function getPublicKey(signerId: string): string | null {
  ensureKeysDir();
  const pubPath = keyPath(signerId, "public");
  if (existsSync(pubPath)) {
    return readFileSync(pubPath, "utf8");
  }
  return null;
}

// ── Digital Signature Creation ─────────────────────────────

/**
 * Creates a cryptographic RSA-SHA256 digital signature over a document's
 * SHA-256 hash digest.
 *
 * Process:
 *   1. Retrieves or generates the signer's RSA-2048 key pair
 *   2. Creates an RSA signature over the SHA-256 hash using the private key
 *   3. Immediately verifies the signature to ensure correctness
 *   4. Returns the complete signature result with public key for verification
 *
 * @param sha256Hash  The 64-character hex SHA-256 hash of the document
 * @param signerId    Unique ID of the signer
 * @param signerName  Human-readable signer name
 * @param signerBadge Badge/credential of the signer
 * @param signerRole  Role of the signer
 * @returns DigitalSignatureResult with all cryptographic proof
 */
export function createDigitalSignature(
  sha256Hash: string,
  signerId: string,
  signerName: string,
  signerBadge: string,
  signerRole: string,
): DigitalSignatureResult {
  // Validate hash format
  if (!sha256Hash || !/^[a-f0-9]{64}$/i.test(sha256Hash)) {
    throw new Error(
      "Invalid SHA-256 hash: must be 64 lowercase hexadecimal characters.",
    );
  }

  // Get or generate RSA key pair for this signer
  const keyPair = getOrCreateKeyPair(signerId, signerName);

  // Create RSA-SHA256 signature over the document hash
  const signer = createSign("RSA-SHA256");
  signer.update(sha256Hash.toLowerCase());
  signer.end();
  const signatureBuffer = signer.sign(keyPair.privateKeyPem);

  const signatureBase64 = signatureBuffer.toString("base64");
  const signatureHex = signatureBuffer.toString("hex");
  const publicKeyFingerprint = computeKeyFingerprint(keyPair.publicKeyPem);

  // Generate a human-readable signature ID
  const signatureId = `DSIG-${sha256Hash.slice(0, 8).toUpperCase()}-${signerBadge}-${Date.now().toString(36).toUpperCase()}`;

  const signedAt = new Date().toISOString();

  // Immediately verify the signature to ensure correctness
  const verifiedOnCreate = verifySignatureRaw(
    sha256Hash,
    signatureBuffer,
    keyPair.publicKeyPem,
  );

  if (!verifiedOnCreate) {
    throw new Error(
      "CRITICAL: Digital signature failed self-verification. Key pair may be corrupted.",
    );
  }

  console.log(
    `[Vigil.OS] Digital signature created: ${signatureId} (RSA-SHA256, verified: ${verifiedOnCreate})`,
  );

  return {
    signatureBase64,
    signatureHex,
    signatureId,
    signedHash: sha256Hash.toLowerCase(),
    algorithm: "RSA-SHA256",
    keySize: 2048,
    publicKeyPem: keyPair.publicKeyPem,
    publicKeyFingerprint,
    signerId,
    signerName,
    signerBadge,
    signerRole,
    signedAt,
    verifiedOnCreate,
  };
}

// ── Signature Verification ─────────────────────────────────

/**
 * Low-level RSA signature verification using raw buffer.
 */
function verifySignatureRaw(
  sha256Hash: string,
  signatureBuffer: Buffer,
  publicKeyPem: string,
): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(sha256Hash.toLowerCase());
    verifier.end();
    return verifier.verify(publicKeyPem, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies a digital signature against a document's SHA-256 hash.
 *
 * Process:
 *   1. Decodes the Base64 signature back to raw bytes
 *   2. Uses RSA-SHA256 verification with the signer's public key
 *   3. Returns detailed verification result
 *
 * @param sha256Hash        The 64-char hex SHA-256 hash of the document
 * @param signatureBase64   The Base64-encoded RSA signature
 * @param publicKeyPem      The PEM-encoded RSA public key of the signer
 * @returns SignatureVerificationResult
 */
export function verifyDigitalSignature(
  sha256Hash: string,
  signatureBase64: string,
  publicKeyPem: string,
): SignatureVerificationResult {
  const now = new Date().toISOString();

  // Validate inputs
  if (!sha256Hash || !/^[a-f0-9]{64}$/i.test(sha256Hash)) {
    return {
      valid: false,
      algorithm: "RSA-SHA256",
      verifiedHash: sha256Hash || "",
      publicKeyFingerprint: "",
      verifiedAt: now,
      failureReason: "Invalid SHA-256 hash format",
    };
  }

  if (!signatureBase64 || !publicKeyPem) {
    return {
      valid: false,
      algorithm: "RSA-SHA256",
      verifiedHash: sha256Hash,
      publicKeyFingerprint: "",
      verifiedAt: now,
      failureReason: "Missing signature or public key",
    };
  }

  try {
    const signatureBuffer = Buffer.from(signatureBase64, "base64");
    const fingerprint = computeKeyFingerprint(publicKeyPem);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(sha256Hash.toLowerCase());
    verifier.end();
    const isValid = verifier.verify(publicKeyPem, signatureBuffer);

    return {
      valid: isValid,
      algorithm: "RSA-SHA256" as const,
      verifiedHash: sha256Hash.toLowerCase(),
      publicKeyFingerprint: fingerprint,
      verifiedAt: now,
      ...(isValid ? {} : { failureReason: "RSA signature verification failed — the signature does not match the hash and public key" }),
    };
  } catch (err: any) {
    return {
      valid: false,
      algorithm: "RSA-SHA256",
      verifiedHash: sha256Hash,
      publicKeyFingerprint: "",
      verifiedAt: now,
      failureReason: `Cryptographic verification error: ${err.message}`,
    };
  }
}

/**
 * Verifies a digital signature using the signer's stored public key.
 * Convenience wrapper that looks up the public key by signer ID.
 */
export function verifySignatureBySigner(
  sha256Hash: string,
  signatureBase64: string,
  signerId: string,
): SignatureVerificationResult {
  const publicKey = getPublicKey(signerId);
  if (!publicKey) {
    return {
      valid: false,
      algorithm: "RSA-SHA256",
      verifiedHash: sha256Hash,
      publicKeyFingerprint: "",
      verifiedAt: new Date().toISOString(),
      failureReason: `Public key not found for signer: ${signerId}`,
    };
  }
  return verifyDigitalSignature(sha256Hash, signatureBase64, publicKey);
}
