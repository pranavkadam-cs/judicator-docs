# SIH Problem Statement 26190: SHA-256 File Integrity Verification System

## Executive Overview
**Vigil.OS** features an end-to-end, production-quality **Cryptographic File Integrity Verification System** built to satisfy all requirements of **SIH Problem Statement 26190**.

The system ensures absolute chain-of-custody, authenticity, and immutability for all legal records, digital evidence dossiers, and forensic documents.

---

## 1. Core Architecture & Cryptographic Engine

```
                                  ┌──────────────────────────────────────────────┐
                                  │           Vigil.OS Client (Browser)          │
                                  └──────────────────────┬───────────────────────┘
                                                         │
                                  ┌──────────────────────▼───────────────────────┐
                                  │       Client-Side Pre-Upload Hash Preview    │
                                  │      Web Crypto SubtleCrypto (SHA-256)       │
                                  └──────────────────────┬───────────────────────┘
                                                         │ Base64 Payload + Metadata
                                                         │
                                  ┌──────────────────────▼───────────────────────┐
                                  │     Server-Side Authoritative Hashing        │
                                  │           src/lib/crypto.server.ts           │
                                  │  - Node crypto.createHash("sha256")          │
                                  │  - Streaming Chunks for Large Files          │
                                  │  - crypto.timingSafeEqual (Anti-Timing)      │
                                  └──────────────┬───────────────────────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        │                                                 │
                        ▼                                                 ▼
        ┌───────────────────────────────┐                 ┌───────────────────────────────┐
        │   Physical File Storage       │                 │   JSON Registry Database      │
        │   .data/storage/{hash}_{file} │                 │   .data/registry.json         │
        │   - Strict Path Traversal     │                 │   - sha256_hash               │
        │   - Isolated Binary Storage   │                 │   - integrity_status          │
        │   - Fallback S3 Storage       │                 │   - audit trail event         │
        └───────────────────────────────┘                 └───────────────────────────────┘
```

---

## 2. File Ingestion & Intake Flow (Upload)

1. **User Attachment**: The user selects any document (PDF, PNG, DOCX, TXT, etc.) in the Intake Form.
2. **Pre-Upload Client Preview**: Client-side `crypto.subtle.digest("SHA-256", buffer)` calculates and displays the pre-upload SHA-256 digest in real time.
3. **Transmission**: The raw byte payload is sent to the server function `fileDocument` (`registerDocument`).
4. **Authoritative Server Hashing**:
   - Server computes authoritative SHA-256 using `src/lib/crypto.server.ts`.
   - Streaming hash pipeline is used for files exceeding memory thresholds.
   - Hash is normalized to 64 lowercase hexadecimal characters.
5. **Physical Storage**:
   - Stored in `.data/storage/` with sanitized, collision-resistant object keys.
   - Path-traversal attacks (`../`) are strictly blocked via `resolveStoragePath`.
6. **Immutable Registry Recording**:
   - Version metadata stores `sha256_hash`, `hash_algorithm: "SHA-256"`, `hash_created_at`, `integrity_status: "VERIFIED"`, `verification_count: 1`.
   - Audit trail registers `FILE_UPLOADED` and `INTEGRITY_VERIFIED` events.

---

## 3. Retrieval & Integrity Verification Flow (Download)

```
[User clicks "Download & Verify"]
               │
               ▼
[RBAC Clearance & Security Check]
               │
               ├─ If Unauthorized ──> [BLOCK: 403 Forbidden / Access Denied]
               │
               ▼
[Retrieve Physical File from Disk (.data/storage)]
               │
               ▼
[Compute Live SHA-256 of Physical File Stream]
               │
               ▼
[Constant-Time Hash Comparison (crypto.timingSafeEqual)]
               │
      ┌────────┴────────────────────────────────────────┐
      │                                                 │
   [MATCH]                                         [MISMATCH]
      │                                                 │
      ▼                                                 ▼
- Mark `VERIFIED`                               - Mark `TAMPER_ALERT`
- Increment verification count                  - Log `INTEGRITY_FAILED` with Expected vs Computed
- Log `INTEGRITY_VERIFIED`                      - Raise Tamper Notification to Admins
- Deliver Verified Base64 Payload               - **BLOCK FILE DOWNLOAD**
- Browser triggers direct file download         - Show Critical Alert in UI
```

---

## 4. Key Database & Type Extensions

Extended `DocVersion` in `src/lib/dms-types.ts`:
```typescript
export interface DocVersion {
  version: string;
  hash: string;                // Authoritative 64-char hex SHA-256
  sha256_hash?: string;        // Dedicated SHA-256 field
  hash_algorithm?: string;     // "SHA-256"
  hash_created_at?: string;    // ISO timestamp
  original_filename?: string;  // Preserved filename
  stored_filename?: string;    // Physical disk filename
  integrity_status?: "VERIFIED" | "TAMPER_ALERT" | "UNVERIFIED";
  last_verified_at?: string;   // Timestamp of last download/check
  verification_count?: number; // Total successful checks
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  note: string;
  signature?: string;
  signedBy?: string;
  signedAt?: string;
}
```

Extended `AuditEvent` in `src/lib/dms-types.ts`:
```typescript
export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  actorId: string;
  role: Role;
  action: AuditAction;         // Includes "INTEGRITY_VERIFIED", "INTEGRITY_FAILED"
  target: string;
  targetId: string;
  detail: string;
  hash: string | null;
  expectedHash?: string;
  computedHash?: string;
  actionTaken?: string;        // "DOWNLOAD_GRANTED" | "DOWNLOAD_BLOCKED"
  ipAddress: string | null;
}
```

---

## 5. Automated Test Suite (10 Comprehensive Tests)

Run the automated test suite with:
```bash
npm test
```

### Test Coverage Summary:
| # | Test Scenario | Verified Behavior |
|---|---------------|-------------------|
| **1** | **Upload Generates SHA-256** | 64-character lowercase hex digest generated on server and stored. |
| **2** | **Identical Content Consistency** | Identical byte payloads produce identical SHA-256 digests. |
| **3** | **Avalanche Effect** | Modifying 1 single bit in 1 byte completely alters the entire hash digest. |
| **4** | **Untouched Download Verification** | Physical file on disk matches stored hash; download succeeds. |
| **5** | **Tampered File Blocked** | Inverting 1 byte on disk triggers `INTEGRITY_FAILED`, blocks download, and sets `TAMPER_ALERT`. |
| **6** | **Forged Hash Rejection** | Mismatched / forged hashes are never trusted. |
| **7** | **RBAC Clearance Enforcement** | Users without security clearance (e.g. Viewer trying to access Top Secret) are rejected before retrieval. |
| **8** | **Streaming Large File Hashing** | Streaming hashing handles multi-megabyte files in chunks without memory exhaustion. |
| **9** | **Independent Version Hashing** | Revisions (v1.0.0, v1.0.1) maintain independent hashes and verify separately. |
| **10** | **Existing DMS Functionality** | Workflow transitions, RBAC, search, and metadata management remain fully operational. |

---

## 6. Live Hackathon Demo Instructions (For SIH Judges)

Follow these steps to demonstrate the SHA-256 File Integrity Verification Engine live:

### Step 1: Upload a New File
1. Switch role to **Insp. A. Deshmukh (Investigator)** or **S. Rao (Admin)** in the bottom personnel bar.
2. Open any Case Dossier (e.g. `MH-2026-CR-0891`).
3. In the **Secure Intake Form**, attach any sample file (e.g. `forensic_report.pdf`).
4. Observe the **Pre-Upload SHA-256** computed instantly in the browser.
5. Click **Seal & File Record (SHA-256)**.
6. Observe the green notification displaying the authoritative 64-character SHA-256 digest sealed on the server.

### Step 2: Download & Verify (Untouched File)
1. In the document list, click **Download & Verify**.
2. Notice the instant server verification:
   - Server reads the file from disk `.data/storage/`.
   - Computes live SHA-256.
   - Compares with stored hash.
   - Shows `✓ Integrity Verified — Download Safe` and automatically downloads the verified file to your computer.

### Step 3: Demonstrate Live Tamper Detection
1. Open the document detail page by clicking **Detail**.
2. Click the red **Simulate Tampering (Demo)** button.
   *(This intentionally flips 1 byte in the physical file on server disk)*.
3. Click **Download & Verify File**.
4. **Result**:
   - The download is **IMMEDIATELY BLOCKED**.
   - A critical red banner appears: **CRITICAL FILE INTEGRITY VIOLATION DETECTED**.
   - Document status is changed to `TAMPER_ALERT`.
5. Open the **Security & Integrity Audit** page (`/audit`):
   - Check the **File Integrity Monitoring** tab: document is highlighted in red.
   - Check the **Custody Event Logs** tab: see the `INTEGRITY_FAILED` log with `DOWNLOAD_BLOCKED`.

### Step 4: Re-seal / Restore Record
1. Return to the document detail page.
2. Click **Re-seal Record** / **Re-seal / Restore**.
3. File is restored to authentic bytes and re-sealed with `VERIFIED` status.
4. Click **Download & Verify File** — download succeeds again!
