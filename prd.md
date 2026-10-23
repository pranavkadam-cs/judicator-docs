# 📋 Product Requirements Document (PRD)
# Vigil.OS — Secure Digital Document Management System

> **SIH Problem Statement:** 26190  
> **Organization:** Ministry of Home Affairs (MHA)  
> **Category:** Software / Blockchain & Cybersecurity  
> **Version:** 1.0.0  
> **Last Updated:** October 2026  
> **Status:** 🟡 In Progress — Core Implemented, Enhancements Pending

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement Summary](#2-problem-statement-summary)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Tech Stack & Architecture Decisions](#4-tech-stack--architecture-decisions)
5. [Feature Requirements & Implementation Map](#5-feature-requirements--implementation-map)
   - [F1: Case-Centric Document Management](#f1-case-centric-document-management)
   - [F2: Role-Based Access Control (RBAC)](#f2-role-based-access-control-rbac)
   - [F3: SHA-256 Cryptographic Integrity Engine](#f3-sha-256-cryptographic-integrity-engine)
   - [F4: RSA-2048 Digital Signatures](#f4-rsa-2048-digital-signatures)
   - [F5: Dual-Layer Blockchain Notarization](#f5-dual-layer-blockchain-notarization)
   - [F6: Multi-Engine OCR Processing](#f6-multi-engine-ocr-processing)
   - [F7: Document Workflow State Machine](#f7-document-workflow-state-machine)
   - [F8: Audit Trail System](#f8-audit-trail-system)
   - [F9: Physical Asset & Evidence Tracker](#f9-physical-asset--evidence-tracker)
   - [F10: Temporal Document Sharing](#f10-temporal-document-sharing)
   - [F11: Forensic Integrity Certificates & Reports](#f11-forensic-integrity-certificates--reports)
   - [F12: Notification System](#f12-notification-system)
   - [F13: Hybrid Storage Backends](#f13-hybrid-storage-backends)
   - [F14: User Management](#f14-user-management)
6. [Database Schema](#6-database-schema)
7. [API Reference — Server Functions](#7-api-reference--server-functions)
8. [Pages & UI Routes](#8-pages--ui-routes)
9. [Smart Contract](#9-smart-contract)
10. [Test Suite](#10-test-suite)
11. [Environment Configuration](#11-environment-configuration)
12. [Demo Credentials](#12-demo-credentials)
13. [What Is Done](#13-what-is-done)
14. [What Remains To Be Done](#14-what-remains-to-be-done)
15. [Known Limitations & Technical Debt](#15-known-limitations--technical-debt)
16. [Developer Onboarding Guide](#16-developer-onboarding-guide)

---

## 1. Project Overview

**Vigil.OS** (codenamed `judicator-docs`) is a **forensic-grade, tamper-proof Digital Document Management System** designed for law enforcement, investigative agencies, forensic departments, prosecution teams, and courts across India.

It provides a centralized, case-centric platform for the entire document lifecycle — from FIR filing to final court judgment — with cryptographic integrity, blockchain anchoring, multi-role access control, and AI-powered OCR for scanned evidence.

### Key Identifiers

| Field | Value |
|---|---|
| **App Name** | Vigil.OS |
| **Repository** | `judicator-docs` |
| **SIH PS** | 26190 |
| **Dev URL** | `http://localhost:8080` |
| **Live Contract** | `0xd901f31DAd885610Ab4aBe0f2494B28d06E09Def` (Sepolia) |

---

## 2. Problem Statement Summary

**Title:** Secure Digital Document Management System for Legal and Investigation Documents  
**Ministry:** Ministry of Home Affairs (MHA)

### Core Problem

Law enforcement and judicial bodies manage massive volumes of sensitive documents:
- FIRs, police logs, charge sheets
- Witness statements, investigation records
- Forensic laboratory reports, court filings, judgments

Historical issues:
- **Tampering**: No cryptographic verification on document changes
- **Weak Access Control**: No role-based boundaries between departments
- **Siloed Systems**: Documents live across isolated, fragmented repositories
- **Version Chaos**: Multiple unsynced iterations of legal files
- **Slow Retrieval**: Time-sensitive cases delayed by inefficient search

### What the Problem Statement Demands

1. Case-centric centralization (One Case → One Record lifecycle)
2. Granular RBAC/ABAC (police, investigators, forensic, prosecutors, judges)
3. SHA-256 cryptographic integrity & digital signatures
4. Append-only immutable audit ledger or blockchain logs
5. Advanced version control with timestamp verifiability
6. Full-text intelligent search
7. Robust audit trails (who, what, when)

---

## 3. Goals & Non-Goals

### Goals

- Build a production-ready DMS satisfying all SIH 26190 requirements
- Provide forensic-grade integrity (SHA-256 + RSA-2048 + dual-layer blockchain)
- Enable multi-department collaboration under strict RBAC
- Support offline-first operation via local JSON registry with cloud sync fallback
- Deploy on Cloudflare Edge for low-latency access across India
- All cryptography must be legally admissible (PKCS#1 v1.5, SHA-256)

### Non-Goals (V1 Scope Exclusions)

- Real-time multi-user editing of documents (not a collaborative editor)
- Mobile app (PWA not scoped in V1)
- Video evidence ingestion and streaming
- Payment gateway integration
- SMS/email OTP authentication (session-based auth only in V1)

---

## 4. Tech Stack & Architecture Decisions

### Why Each Technology Was Chosen

| Layer | Technology | Reason |
|---|---|---|
| **Frontend** | React 19 + TailwindCSS 4 | Latest stable React; Tailwind 4 for near-zero CSS bundle |
| **Framework** | TanStack Start | Unified SSR + server functions; type-safe RPC without a separate API server |
| **Bundler** | Vite 8 + Rolldown | Fastest HMR; LightningCSS for minification |
| **Language** | TypeScript 5.8 | End-to-end type safety from DB types to UI |
| **Blockchain** | Solidity 0.8.20 + Ethers.js 6 + Wagmi 3 | Industry standard for smart contract + type-safe Web3 hooks |
| **Smart Contract Tools** | Hardhat + Alchemy + Sepolia | Battle-tested Ethereum dev toolchain |
| **OCR** | Tesseract.js 7 + Google Cloud Vision + Gemini AI | Cascading fallback: local-first → cloud for accuracy |
| **Database** | Supabase PostgreSQL + Local JSON Registry | Cloud-first with automatic local fallback |
| **Storage** | Supabase Storage + AWS S3 + GCS + Local Disk | Pluggable backends; no vendor lock-in |
| **Auth** | Session-based + bcrypt | Simple, secure, no external auth provider needed for offline deployment |
| **Crypto** | Node.js `crypto` (built-in) | No third-party crypto dependency; auditable standard library |
| **Server Runtime** | Nitro (Cloudflare Module target) | Single build target for edge deployment |
| **Testing** | Node.js built-in test runner + tsx | Zero extra test framework dependency |

### Architecture Overview

```
User Browser
    |
    |-- React 19 (UI) ─────────────── TailwindCSS 4 / Radix UI / Recharts
    |       |
    |       |-- Wagmi / Viem (Web3) ── MetaMask → Alchemy → DocumentNotary.sol
    |       |
    |       └── TanStack Router ────── File-based routing (src/routes/)
    |
    └── TanStack Start Server Functions (src/lib/*.functions.ts)
            |
            |-- auth.server.ts ──────── Session management, bcrypt
            |-- crypto.server.ts ────── SHA-256 hashing, tamper detection
            |-- digital-signature.server.ts  RSA-2048 sign/verify
            |-- dms.server.ts ────────── Case & document CRUD, workflow
            |-- blockchain.server.ts ─── Local SHA-256 chained ledger
            |-- ethereum.server.ts ───── Server-side Ethers.js notarization
            └── ocr/ ────────────────── Tesseract / Google Vision / Gemini
                    |
                    └── Storage Adapters:
                        |-- storage.server.ts        (Local Disk)
                        |-- supabase-storage.server.ts
                        |-- s3.server.ts
                        └── google-cloud-storage.server.ts
```

---

## 5. Feature Requirements & Implementation Map

---

### F1: Case-Centric Document Management

**What it is:** Every document must belong to a Case. Cases map the full lifecycle from FIR filing to judgment.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Case types | `src/lib/dms-types.ts` | `CaseFile`, `CaseStatus`, `CasePriority` types |
| Case CRUD | `src/lib/dms.server.ts` | `createCase()`, `updateCase()` business logic |
| Case RPC | `src/lib/dms.functions.ts` | `openCase`, `updateCaseFn` server functions |
| Case list UI | `src/routes/cases.index.tsx` | Case dossier index with search/filter |
| Case workspace | `src/routes/cases.$caseId.tsx` | Per-case document upload and management |

**Document Categories** (defined in `dms-types.ts`):
```
FIR | Police Report | Investigation Record | Witness Statement
Charge Sheet | Court Filing | Evidence Record | Forensic Report
Legal Notice | Judgment
```

**Case Statuses:** `OPEN → UNDER_INVESTIGATION → IN_TRIAL → CLOSED`

**Case Priorities:** `LOW | MEDIUM | HIGH | CRITICAL`

---

### F2: Role-Based Access Control (RBAC)

**What it is:** Five clearance tiers enforce who can upload, sign, approve, manage assets, and administer users.

**Where it is implemented:**

| Component | File |
|---|---|
| Role + clearance definitions | `src/lib/dms-types.ts` — `ROLE_PROFILE`, `CLEARANCE`, `canRead()` |
| Session enforcement | `src/lib/auth.server.ts` |
| Auth server functions | `src/lib/auth.functions.ts` |
| User management UI | `src/routes/users.tsx` |
| Role badge component | `src/components/dms/actor.tsx` |

**Role Matrix:**

| Role | Clearance | Upload | Sign/Seal | Manage Assets | Manage Users | Approve |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **ADMIN** | 4 (Top Secret) | Yes | Yes | Yes | Yes | Yes |
| **INVESTIGATOR** | 3 (Secret) | Yes | Yes | Yes | No | Yes |
| **LEGAL_OFFICER** | 3 (Secret) | Yes | Yes | No | No | Yes |
| **COURT_OFFICER** | 2 (Confidential) | Yes | No | No | No | No |
| **VIEWER** | 1 (Restricted) | No | No | No | No | No |

**Document Security Classifications:**
`PUBLIC (0)` → `RESTRICTED (1)` → `CONFIDENTIAL (2)` → `SECRET (3)` → `TOP SECRET (4)`

A user can only read a document if `clearance >= classification`.

---

### F3: SHA-256 Cryptographic Integrity Engine

**What it is:** Every file is hashed at upload and re-hashed on every download. Any mismatch triggers a permanent `TAMPER_ALERT`.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Crypto engine | `src/lib/crypto.server.ts` | `computeHash()`, `verifyHash()`, streaming hash |
| Client pre-hash | `src/routes/cases.$caseId.tsx` | `SubtleCrypto.digest("SHA-256")` before upload |
| Download gate | `src/lib/dms.server.ts` | `requestDownload()` — re-hashes file before serving |
| Bulk verify | `src/lib/dms.functions.ts` | `bulkVerifyIntegrityFn` |
| Tamper simulate | `src/lib/dms.functions.ts` | `simulateTamperFn` — byte-flip injection for demos |
| Restore | `src/lib/dms.functions.ts` | `restoreDocumentFn` — restore from secure backup |

**Integrity Flow:**
```
Upload → Client SHA-256 (preview) → Server SHA-256 (authoritative)
       → Store hash in Registry + Blockchain Ledger
Download → Re-hash physical file → Compare (timing-safe) → Serve OR Block (403 TAMPER)
```

**Tamper Detection:** Uses `crypto.timingSafeEqual()` to prevent timing side-channel attacks.

---

### F4: RSA-2048 Digital Signatures

**What it is:** Documents in `SEALED` state can receive a legally-binding RSA-2048 digital signature.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Signature engine | `src/lib/digital-signature.server.ts` | Key generation, signing, verification |
| RSA key storage | `.data/keys/` | PEM-encoded key pairs per signer |
| Sign RPC | `src/lib/dms.functions.ts` | `applySignature` server function |
| Verify RPC | `src/lib/dms.functions.ts` | `verifySignatureFn` server function |
| Document viewer UI | `src/routes/documents.$docId.tsx` | Sign/verify buttons + signature display |

**Signature Fields stored per `DocVersion`:**

| Field | Description |
|---|---|
| `signatureBase64` | Raw RSA signature (Base64) |
| `signatureAlgorithm` | "RSA-SHA256" |
| `signatureKeySize` | 2048 |
| `publicKeyPem` | Signer's public key (for independent verification) |
| `publicKeyFingerprint` | SHA-256 of public key |
| `signedHash` | SHA-256 hash that was signed |
| `signerBadge` | Officer badge number |
| `signerRole` | Role at time of signing |
| `signatureVerified` | Boolean verification result |

**Standard:** PKCS#1 v1.5, SHA-256 — legally admissible.

---

### F5: Dual-Layer Blockchain Notarization

**What it is:** Document hashes are anchored on two independent blockchain layers.

#### Layer 1 — Ethereum Smart Contract

| Component | File | Description |
|---|---|---|
| Smart contract | `contracts/DocumentNotary.sol` | Solidity 0.8.20; `notarize()` + `verify()` |
| Contract ABI | `src/lib/ethereum/contract.ts` | ABI + deployed address constants |
| Bytecode | `src/lib/ethereum/bytecode.ts` | Compiled bytecode for in-app deployment |
| Server notarization | `src/lib/ethereum/ethereum.server.ts` | Ethers.js — no MetaMask needed |
| Client notarization | `src/lib/ethereum/useNotarize.ts` | Wagmi mutation hook (MetaMask) |
| Wallet button | `src/lib/ethereum/WalletButton.tsx` | MetaMask connect/disconnect |
| Deploy modal | `src/lib/ethereum/DeployContractModal.tsx` | In-app contract deployment |
| Deploy script | `scripts/deploy.cjs` | CLI deployment + auto-writes address to `.env` |
| Hardhat config | `hardhat.config.cjs` | Sepolia + local network config |
| Blockchain UI | `src/routes/blockchain.tsx` | Full blockchain explorer UI |

**Live Contract:** `0xd901f31DAd885610Ab4aBe0f2494B28d06E09Def` on Sepolia

#### Layer 2 — Local SHA-256 Chained Ledger

| Component | File | Description |
|---|---|---|
| Ledger engine | `src/lib/blockchain.server.ts` | Block creation, chain verification |
| Ledger file | `.data/blockchain-ledger.json` | Persistent chained JSON blocks |
| Chain link formula | — | `txId = SHA-256(prevTxId : metadataHash : timestamp)` |

Any single modified block breaks the entire chain — detectable via `verifyBlockchainEntryFn`.

---

### F6: Multi-Engine OCR Processing

**What it is:** Automatically extracts text from scanned FIRs, forensic reports, images, and PDFs.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| OCR types | `src/lib/ocr/ocr-types.ts` | `OCRStatus`, `OCRSource`, `OCRResult` contracts |
| OCR orchestrator | `src/lib/ocr/ocr-service.ts` | Provider selection, fallback cascade |
| Tesseract provider | `src/lib/ocr/tesseract-provider.ts` | Local WASM — works offline |
| Google Vision provider | `src/lib/ocr/google-vision-provider.ts` | Cloud Vision API |
| Gemini provider | `src/lib/ocr/gemini-ocr-provider.ts` | Gemini 1.5/2.0 multimodal AI |
| PDF extractor | `src/lib/ocr/pdf-extractor.ts` | Stream extraction for digital PDFs |
| Tesseract language data | `eng.traineddata` | English trained model (5.2 MB) |

**Supported Languages:** English (`eng`), Hindi (`hin`), Marathi (`mar`)

**OCR Provider Selection (via `OCR_PROVIDER` env var):**
- `auto` → Gemini → Google Vision → Tesseract (cascade)
- `tesseract` → local WASM only (no network)
- `google-vision` → Cloud Vision
- `gemini` → Gemini AI Vision

**Important:** SHA-256 is computed from raw file bytes **before** OCR. Re-running OCR never changes the document hash.

---

### F7: Document Workflow State Machine

**What it is:** Documents progress through defined states with strict allowed transitions.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| States & transitions | `src/lib/dms-types.ts` | `DOC_STATUSES`, `WORKFLOW_TRANSITIONS` |
| Workflow server logic | `src/lib/dms.server.ts` | `advanceWorkflow()` |
| Workflow RPC | `src/lib/dms.functions.ts` | `advanceWorkflowFn` |
| Workflow UI buttons | `src/components/dms/workflow-actions.tsx` | Role-aware action buttons |

**State Machine:**
```
DRAFT → UNDER_REVIEW → APPROVED → SEALED → SIGNED → ARCHIVED
                     → REJECTED  → DRAFT
                     (any state) → ARCHIVED
TAMPER_ALERT → (hard-locked, no transitions allowed)
```

---

### F8: Audit Trail System

**What it is:** Every action is permanently logged with actor, timestamp, document hash, and blockchain anchoring.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Audit types | `src/lib/dms-types.ts` | `AuditAction` (32 actions), `AuditEvent` type |
| Audit logging | `src/lib/dms.server.ts` | `logAudit()` called on every mutation |
| DB table | `supabase/schema.sql` | `vigil_audit_events` table |
| Audit UI | `src/routes/audit.tsx` | Full-text searchable audit log viewer |

**32 Logged Actions include:**
`USER_LOGIN` · `DOCUMENT_UPLOADED` · `DOCUMENT_VIEWED` · `DOCUMENT_DOWNLOADED` · `DOCUMENT_SIGNED` · `INTEGRITY_VERIFIED` · `INTEGRITY_FAILED` · `WORKFLOW_CHANGED` · `BLOCKCHAIN_ANCHORED` · `OCR_COMPLETED` · `SIGNATURE_VERIFIED` · and 21 more.

Each event records: `actor`, `actorId`, `role`, `action`, `target`, `sha256`, `ipAddress`, `blockchain_tx_id`.

---

### F9: Physical Asset & Evidence Tracker

**What it is:** Track physical evidence and police equipment through their lifecycle.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Asset types | `src/lib/dms-types.ts` | `Asset`, `AssetCategory`, `AssetStatus`, `AssetEvent` |
| Asset CRUD | `src/lib/dms.server.ts` | `inductAsset()`, `moveAssetStage()` |
| Asset RPC | `src/lib/dms.functions.ts` | `inductAsset`, `moveAssetStage` server functions |
| Assets UI | `src/routes/assets.tsx` | Grid view with lifecycle history |
| DB table | `supabase/schema.sql` | `vigil_assets` table |

**Asset Categories:** `WEAPON | VEHICLE | DEVICE | RADIO | FORENSIC KIT`

**Asset Statuses:** `IN_SERVICE → ISSUED → MAINTENANCE → RETURNED → RETIRED | IMPOUNDED`

> **Current State:** Read-only UI. Server functions exist but UI forms for creating/transitioning assets are not yet built.

---

### F10: Temporal Document Sharing

**What it is:** Share a document with time-limited access (VIEW or DOWNLOAD), revocable at any time.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Share types | `src/lib/dms-types.ts` | `DocumentShare`, `SharePermission` |
| Share logic | `src/lib/dms.server.ts` | `shareDocument()`, `revokeShare()` |
| Share RPC | `src/lib/dms.functions.ts` | `shareDocumentFn`, `revokeShareFn`, `toggleShare` |
| Share panel UI | `src/components/dms/share-panel.tsx` | Time-picker + recipient selector |

---

### F11: Forensic Integrity Certificates & Reports

**What it is:** Downloadable, printable forensic certificates proving a document's SHA-256 integrity chain.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Certificate component | `src/components/dms/integrity-certificate.tsx` | Printable certificate template |
| Reports page | `src/routes/reports.tsx` | Integrity certificates + audit exports |

**Certificate includes:** Document name, SHA-256 hash, verification timestamp, actor details, blockchain TX ID, chain-of-custody log.

---

### F12: Notification System

**What it is:** In-app notifications for key events — tamper alerts, sharing, review requests, case assignments.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| Notification types | `src/lib/dms-types.ts` | `NotificationType` (7 types), `Notification` type |
| Notification RPC | `src/lib/dms.functions.ts` | `markNotificationReadFn`, `markAllNotificationsReadFn` |
| Bell component | `src/components/dms/notification-bell.tsx` | Live notification badge in header |
| Notifications page | `src/routes/notifications.tsx` | Alert center |
| DB table | `supabase/schema.sql` | `vigil_notifications` table |

**Notification Types:** `DOCUMENT_UPLOADED · DOCUMENT_SHARED · REVIEW_REQUESTED · REVIEW_COMPLETED · ACCESS_EXPIRING · CASE_ASSIGNED · TAMPER_DETECTED`

---

### F13: Hybrid Storage Backends

**What it is:** Pluggable storage adapters — auto-selected based on available env credentials.

**Where it is implemented:**

| Adapter | File | Trigger |
|---|---|---|
| Local Disk | `src/lib/storage.server.ts` | Default fallback (`.data/storage/`) |
| Supabase Storage | `src/lib/supabase-storage.server.ts` | When `SUPABASE_URL` is set |
| AWS S3 | `src/lib/s3.server.ts` | When `AWS_*` keys are set |
| Google Cloud Storage | `src/lib/google-cloud-storage.server.ts` | When `GCS_*` keys are set |

**Local Registry:** `src/lib/registry.server.ts` — JSON database abstraction over `.data/registry.json`.

**Cloud DB:** `src/lib/supabase-db.server.ts` — Supabase PostgreSQL client.

---

### F14: User Management

**What it is:** Admin-only user lifecycle management — create, activate/deactivate, change roles.

**Where it is implemented:**

| Component | File | Description |
|---|---|---|
| User types | `src/lib/dms-types.ts` | `User`, `Actor` types |
| User logic | `src/lib/auth.server.ts` | Password hashing (bcrypt), session tokens |
| User RPC | `src/lib/auth.functions.ts` | `createUserFn`, `updateUserFn`, `listUsersFn` |
| Users UI | `src/routes/users.tsx` | Admin-only user management table |
| DB table | `supabase/schema.sql` | `vigil_users` table |
| Seed data | `src/lib/seed-registry.ts` | Pre-seeded 5 demo accounts |

---

## 6. Database Schema

### Tables (Supabase PostgreSQL)

| Table | Purpose | Key Columns |
|---|---|---|
| `vigil_registry_snapshot` | Atomic JSON state sync | `id`, `version`, `data` (JSONB) |
| `vigil_users` | User accounts | `id`, `email`, `role`, `password_hash`, `badge` |
| `vigil_cases` | Case dossiers | `id`, `case_number`, `status`, `priority`, `classification` |
| `vigil_documents` | Document metadata | `id`, `case_id`, `category`, `status`, `versions` (JSONB), `ocr_text` |
| `vigil_audit_events` | Immutable audit log | `id`, `action`, `actor_id`, `sha256`, `prev_hash` |
| `vigil_assets` | Physical evidence | `id`, `tag`, `category`, `status`, `linked_case_id` |
| `vigil_notifications` | In-app alerts | `id`, `user_id`, `type`, `is_read` |

**Storage Bucket:** `evidence-vault` (50 MB per file limit)

**Allowed MIME types:** `application/pdf`, `application/msword`, `.docx`, `text/plain`, `image/png`, `image/jpeg`, `image/tiff`

Row Level Security (RLS) is enabled on all tables.

---

## 7. API Reference — Server Functions

All backend logic uses TanStack Start server functions — type-safe RPC, no separate API server.

### Auth (`src/lib/auth.functions.ts`)

| Function | Method | Description | Access |
|---|---|---|---|
| `loginFn` | POST | Authenticate; return session token | Public |
| `logoutFn` | POST | Destroy session | Authenticated |
| `getSessionFn` | GET | Return current user + role | Authenticated |
| `changePasswordFn` | POST | Change password with old password verification | Authenticated |
| `createUserFn` | POST | Create new user account | ADMIN only |
| `updateUserFn` | POST | Update profile or role | ADMIN only |
| `listUsersFn` | GET | List all users | ADMIN only |

### Document & DMS (`src/lib/dms.functions.ts`)

| Function | Method | Description |
|---|---|---|
| `fetchSnapshot` | GET | Load full registry (clearance-filtered) |
| `fileDocument` | POST | Upload + SHA-256 + OCR + audit |
| `requestDownload` | POST | Download gate — re-hash before serve |
| `checkIntegrity` | POST | On-demand integrity check |
| `bulkVerifyIntegrityFn` | POST | Batch audit all documents |
| `advanceWorkflowFn` | POST | Workflow state transition |
| `applySignature` | POST | RSA-2048 digital sign (SEALED → SIGNED) |
| `verifySignatureFn` | POST | Independently verify signature |
| `reclassifyDocument` | POST | Change clearance level |
| `simulateTamperFn` | POST | Inject byte tampering (demo/test) |
| `restoreDocumentFn` | POST | Restore from secure backup |
| `searchDocumentsFn` | POST | Full-text search |
| `openCase` | POST | Create new case dossier |
| `updateCaseFn` | POST | Update case priority/status/team |
| `shareDocumentFn` | POST | Create time-limited share |
| `revokeShareFn` | POST | Revoke active share |
| `toggleShare` | POST | Enable/disable sharing |
| `inductAsset` | POST | Register physical evidence |
| `moveAssetStage` | POST | Advance asset lifecycle |
| `markNotificationReadFn` | POST | Mark notification read |
| `markAllNotificationsReadFn` | POST | Mark all read |
| `fetchSupabaseStatus` | GET | Check cloud connectivity |

### Blockchain (`src/lib/ethereum/ethereum.server.ts`)

| Function | Method | Description |
|---|---|---|
| `getBlockchainLedgerFn` | GET | Full local SHA-256 ledger |
| `verifyBlockchainEntryFn` | POST | Audit chain integrity |
| `notarizeOnSepoliaFn` | POST | Server-side Ethereum notarization |
| `verifyOnSepoliaFn` | POST | On-chain hash verification |
| `getSepoliaStatusFn` | GET | Network + contract status |
| `updateContractAddressFn` | POST | Update deployed address at runtime |

### OCR (`src/lib/ocr/ocr-service.ts`)

| Function | Method | Description |
|---|---|---|
| `triggerOCR` | POST | Run/re-run OCR with language selection |
| `getExtractedText` | POST | Fetch OCR text (clearance-gated) |
| `getOCRStatus` | POST | Lightweight status query |

---

## 8. Pages & UI Routes

| Route | File | Description | Auth |
|---|---|---|---|
| `/login` | `routes/login.tsx` | Session auth + demo credentials | Public |
| `/` | `routes/index.tsx` | Executive dashboard — metrics + activity | Required |
| `/cases` | `routes/cases.index.tsx` | Case dossier index | Required |
| `/cases/:caseId` | `routes/cases.$caseId.tsx` | Case workspace — upload documents | Required |
| `/documents` | `routes/documents.tsx` | Global document browser with search/filter | Required |
| `/documents/:docId` | `routes/documents.$docId.tsx` | Forensic viewer — integrity, OCR, sign, notarize | Required |
| `/blockchain` | `routes/blockchain.tsx` | Dual ledger explorer + Ethereum notary | Required |
| `/audit` | `routes/audit.tsx` | Full system audit trail | Required |
| `/assets` | `routes/assets.tsx` | Physical asset lifecycle tracker | Required |
| `/reports` | `routes/reports.tsx` | Integrity certificates + audit exports | Required |
| `/settings` | `routes/settings.tsx` | Storage, OCR, blockchain connectivity status | ADMIN |
| `/users` | `routes/users.tsx` | User management + role assignment | ADMIN |
| `/notifications` | `routes/notifications.tsx` | Alert center | Required |
| `/profile` | `routes/profile.tsx` | User profile + password change | Required |
| `/about` | `routes/about.tsx` | Architecture + SIH 26190 alignment | Required |

---

## 9. Smart Contract

**File:** `contracts/DocumentNotary.sol`  
**Language:** Solidity 0.8.20  
**Network:** Ethereum Sepolia Testnet  
**Live Address:** `0xd901f31DAd885610Ab4aBe0f2494B28d06E09Def`

### Functions

```solidity
// Write
function notarize(bytes32 sha256Hash, string documentId, string documentName) external
    // Reverts with AlreadyNotarized if hash exists (immutable, anti-overwrite)

// Read
function verify(bytes32 sha256Hash) external view
    returns (bool, string, string, address, uint256)
function getHashByDocId(string documentId) external view returns (bytes32)
function totalNotarized() external view returns (uint256)
function getHashes(uint256 offset, uint256 limit) external view returns (bytes32[])
```

### Events
```solidity
event DocumentNotarized(
    bytes32 indexed sha256Hash,
    string  indexed documentId,
    string          documentName,
    address indexed notarizedBy,
    uint256         timestamp
)
```

### Deployment Commands

```bash
npm run contract:compile               # Compile Solidity
npm run contract:deploy:sepolia        # Deploy to Sepolia (auto-updates .env)
npm run contract:deploy:local          # Deploy to local Hardhat node
npm run contract:verify:sepolia        # Verify on Etherscan
npm run test:blockchain                # Run blockchain integration tests
```

---

## 10. Test Suite

**23 tests, 0 failures**

### SHA-256 Integrity Tests (`tests/integrity.test.ts` — 12 tests)

| # | Test Description |
|---|---|
| 1 | Upload file → SHA-256 generated automatically |
| 2 | Identical file → Identical hash |
| 3 | One byte change → Avalanche effect verified |
| 4 | Untouched file download → Verification passes |
| 5 | Tampered file download → Blocked with tamper alert |
| 6 | Missing stored hash → Not silently trusted |
| 7 | Unauthorized clearance → Access blocked |
| 8 | Large file → Streaming hash without memory spikes |
| 9 | File versioning → Independent version hashes |
| 10 | Existing upload/download functionality intact |
| 11 | Google Cloud Storage adapter exports |
| 12 | Supabase database and storage exports |

### OCR Engine Tests (`tests/ocr.test.ts` — 11 tests)

| # | Test Description |
|---|---|
| 1 | Digital PDF → Direct text extraction |
| 2 | Image document → Routes to OCR |
| 3 | Multi-language parameter (Hindi/Marathi) propagation |
| 4 | Upload pipeline auto-hashing + OCR |
| 5 | OCR failure containment (original document untouched) |
| 6 | Classified document OCR text RBAC clearance gating |
| 7 | Lightweight OCR status query |
| 8 | Manual re-run OCR on archived records |
| 9 | Unsupported file types gracefully handled |
| 10 | Custom OCR provider pluggability |
| 11 | Gemini OCR provider initialization |

```bash
npm test                  # All 23 tests
npm run test:integrity    # Integrity tests only
npm run test:ocr          # OCR tests only
npm run test:blockchain   # Blockchain integration (requires Sepolia keys)
```

---

## 11. Environment Configuration

Copy `.env.example` to `.env`:

```env
# OCR
GEMINI_API_KEY=
GOOGLE_CLOUD_PROJECT_NUMBER=
GOOGLE_CLOUD_VISION_API_KEY=
OCR_PROVIDER=auto                   # "auto" | "gemini" | "google-vision" | "tesseract"

# Hyperledger Fabric (blank = simulation mode)
FABRIC_PEER_ENDPOINT=
FABRIC_MSP_ID=
FABRIC_CHANNEL_NAME=
FABRIC_CHAINCODE_NAME=
FABRIC_CERT_PATH=
FABRIC_KEY_PATH=
FABRIC_TLS_CERT_PATH=

# Supabase (blank = local JSON fallback)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=evidence-vault

# Ethereum / Alchemy
VITE_ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
VITE_ALCHEMY_API_KEY=
VITE_ETH_NETWORK=sepolia
VITE_CHAIN_ID=11155111
VITE_CONTRACT_ADDRESS=0xd901f31DAd885610Ab4aBe0f2494B28d06E09Def
SEPOLIA_PRIVATE_KEY=

# Etherscan (optional, for contract verification)
ETHERSCAN_API_KEY=
```

**Fallback Behavior:** If any cloud key is blank, the system silently falls back to local mode:
- Tesseract WASM for OCR
- `.data/registry.json` for database
- `.data/storage/` for file storage
- Simulation mode for Hyperledger Fabric

---

## 12. Demo Credentials

Pre-seeded in `src/lib/seed-registry.ts`:

| Email | Password | Role | Clearance | Badge |
|---|---|---|---|---|
| `admin@vigil.os` | `admin123` | ADMIN | 4 — Top Secret | REC-0001 |
| `investigator@vigil.os` | `invest123` | INVESTIGATOR | 3 — Secret | MH-1180 |
| `legal@vigil.os` | `legal123` | LEGAL_OFFICER | 3 — Secret | PP-0092 |
| `court@vigil.os` | `court123` | COURT_OFFICER | 2 — Confidential | MH-4471 |
| `viewer@vigil.os` | `viewer123` | VIEWER | 1 — Restricted | FSL-303 |

---

## 13. What Is Done

### Core Infrastructure
- [x] TanStack Start + Vite 8 + Nitro server setup
- [x] TailwindCSS 4 + Radix UI design system
- [x] TypeScript 5.8 end-to-end type safety
- [x] Session-based auth with bcrypt password hashing
- [x] Local JSON registry + Supabase PostgreSQL dual backend
- [x] Local disk + Supabase Storage + S3 + GCS storage adapters
- [x] Cloudflare Module target deployment configuration

### Security & Cryptography
- [x] Client-side SHA-256 pre-hash (SubtleCrypto)
- [x] Server-side authoritative SHA-256 (streaming, Node.js crypto)
- [x] Timing-safe hash comparison (`crypto.timingSafeEqual`)
- [x] Active download gate (re-hash before serving)
- [x] Bulk integrity verification endpoint
- [x] Tamper simulation endpoint (for hackathon demos)
- [x] Document restore from secure backup
- [x] RSA-2048 key pair generation per signer
- [x] PKCS#1 v1.5 / SHA-256 digital signing
- [x] Independent signature verification with stored public key

### Blockchain
- [x] `DocumentNotary.sol` smart contract (Solidity 0.8.20)
- [x] Hardhat compile + deploy scripts (Sepolia + local)
- [x] Server-side Ethers.js notarization (no MetaMask needed)
- [x] Client-side Wagmi/Viem notarization (MetaMask)
- [x] In-app contract deployment modal
- [x] Local SHA-256 chained block ledger
- [x] Chain integrity verification
- [x] Full blockchain explorer UI (`/blockchain`)

### OCR
- [x] Tesseract.js WASM (offline, eng/hin/mar)
- [x] Google Cloud Vision provider
- [x] Google Gemini AI Vision provider
- [x] pdf-parse stream extractor for digital PDFs
- [x] OCR orchestrator with provider fallback cascade
- [x] OCR status tracking per document version
- [x] Clearance-gated OCR text access
- [x] Re-run OCR endpoint

### Document & Case Management
- [x] 10 document categories (FIR, Charge Sheet, Judgment, etc.)
- [x] 5 security classification levels
- [x] 8-state document workflow with strict transitions
- [x] TAMPER_ALERT hard-lock state
- [x] Document versioning with independent hashes per version
- [x] Full-text search
- [x] Classification filter bar
- [x] Case creation with jurisdiction, statute, assigned officers
- [x] Case status + priority management
- [x] Case dossier workspace with document upload

### RBAC
- [x] 5 roles with clearance levels 1–4
- [x] Permission matrix (upload, sign, approve, manage assets/users)
- [x] Document classification clearance gating (`canRead()`)
- [x] Admin-only user management

### Audit & Reporting
- [x] 32 audit action types
- [x] Immutable audit log with actor + hash + blockchain anchoring
- [x] Full-text searchable audit trail UI
- [x] Forensic integrity certificate component
- [x] Reports page

### Other
- [x] 23 automated tests (100% passing)
- [x] Physical asset lifecycle tracker (read-only UI)
- [x] Temporal document sharing with revocation
- [x] In-app notification system (7 notification types)
- [x] Settings page with connectivity diagnostics
- [x] About page with SIH 26190 architecture alignment

---

## 14. What Remains To Be Done

### High Priority — Core Gaps

| # | Feature | What Is Missing | Where to Implement |
|---|---|---|---|
| 1 | **Asset induction UI form** | `inductAsset` server function exists but no UI form to add new assets | Add a modal/drawer in `src/routes/assets.tsx` with asset fields (name, tag, category, serial, station) |
| 2 | **Asset stage transition UI** | `moveAssetStage` works server-side but no UI buttons for advancing lifecycle | Add stage-advance buttons with confirmation dialog in `src/routes/assets.tsx` |
| 3 | **FIR-specific intake form** | FIR is a document category but has no structured intake form (complainant, incident date, sections) | Create `src/components/dms/fir-intake.tsx` with FIR-specific fields |
| 4 | **Inter-department case transfer** | No "Transfer to Court" or "Hand off to Prosecution" workflow action on cases | Add `transferCase` server function + UI button in `src/routes/cases.$caseId.tsx` |

### Medium Priority — Enhancements

| # | Feature | What Is Missing | Where to Implement |
|---|---|---|---|
| 5 | **Supabase Auth integration** | `supabase-auth.server.ts` is a stub; auth is still local-only | Complete `src/lib/supabase-auth.server.ts` and wire into login flow |
| 6 | **Hindi/Marathi Tesseract models** | Only `eng.traineddata` is bundled; `hin` and `mar` models are absent | Download `hin.traineddata` + `mar.traineddata`, reference in `tesseract-provider.ts` |
| 7 | **Hyperledger Fabric integration** | Fabric env vars exist but peer is in simulation mode | Implement gRPC peer connection in `src/lib/blockchain.server.ts` |
| 8 | **Bulk document operations** | No multi-select for bulk download, bulk classify, or bulk verify | Add checkbox selection to `src/components/dms/records.tsx` |
| 9 | **Access expiry notifications** | `ACCESS_EXPIRING` notification type exists but no scheduled job fires it | Add a Supabase Edge Function or cron job to check expiring shares |
| 10 | **Witness statement template** | No structured form for witness statements | Create `src/components/dms/witness-form.tsx` |

### Low Priority — Polish & Production Readiness

| # | Feature | What Is Missing | Where to Implement |
|---|---|---|---|
| 11 | **In-app document preview** | PDFs and images open in new browser tab; no in-app viewer | Integrate `react-pdf` or iframe preview in `src/routes/documents.$docId.tsx` |
| 12 | **Supabase RLS by role** | Current RLS policies are permissive (`using (true)`) | Update `supabase/schema.sql` with JWT role-based policies after Supabase Auth is integrated |
| 13 | **Rate limiting on server functions** | No rate limiting on login or document upload | Add rate limiting middleware in `src/server.ts` |
| 14 | **2FA for high-clearance roles** | Only password auth; no second factor for ADMIN/INVESTIGATOR | Integrate TOTP or OTP via Supabase Auth |
| 15 | **Mobile / PWA support** | Not fully responsive below tablet widths on some pages | Audit + fix responsive layouts; add `manifest.json` |
| 16 | **Ethereum Mainnet deployment** | Currently Sepolia testnet only | Update `hardhat.config.cjs` + `VITE_ETH_NETWORK=mainnet` in `.env` |
| 17 | **Analytics charts with real data** | Dashboard charts use seed data | Wire Recharts in `src/components/dms/analytics-charts.tsx` to live registry queries |
| 18 | **E2E test suite** | Only unit tests exist; no browser automation tests | Add Playwright or Cypress E2E tests for upload, sign, verify, notarize flows |
| 19 | **Case archival + retention policy** | No automated archival or data retention enforcement | Add scheduled archival job + policy settings in `/settings` |
| 20 | **Audit log export (PDF/CSV)** | Reports page has export UI but download is not implemented | Wire CSV/PDF generation in `src/routes/reports.tsx` |

---

## 15. Known Limitations & Technical Debt

| Issue | Impact | Recommended Fix |
|---|---|---|
| `vigil_registry_snapshot` uses a single JSONB blob | Performance degrades with large registries (>10k documents) | Migrate to fully normalized table queries in `dms.server.ts` |
| RSA private keys stored in `.data/keys/` | Not production-safe; keys should be in a KMS or HSM | Integrate with AWS KMS or HashiCorp Vault for production |
| Session tokens in HTTP cookies | Vulnerable without HTTPS in local dev | Enforce `Secure; SameSite=Strict` in Nitro production config |
| No file deduplication | Same file can be uploaded multiple times | Add hash-based deduplication check in `fileDocument` |
| OCR runs synchronously on upload | Large scanned PDFs can block the server thread | Move OCR to a background job queue (Supabase Edge Functions or BullMQ) |
| Both `bun.lock` and `package-lock.json` exist | Dual lockfiles cause confusion | Pick one package manager and remove the other lockfile |
| Supabase RLS policies are open (`using (true)`) | Any authenticated user can read all data in cloud | Tighten policies once Supabase Auth JWT integration is complete |

---

## 16. Developer Onboarding Guide

### Prerequisites

- Node.js v18+ (`node --version`)
- npm v9+ or Bun
- MetaMask browser extension (for Web3 features)
- Git

### Setup

```bash
# 1. Clone
git clone https://github.com/pranavkadam-cs/judicator-docs.git
cd judicator-docs

# 2. Install dependencies
npm install

# 3. Configure environment (minimum: leave everything blank for local mode)
cp .env.example .env

# 4. Compile smart contract
npm run contract:compile

# 5. Start development server
npm run dev
# App runs at http://localhost:8080
```

### Login

Use any demo credential from Section 12. Start with `admin@vigil.os / admin123` for full access.

### Run Tests

```bash
npm test
# Expected: 23 passed, 0 failed
```

### Key Files to Understand First

| File | Why Read It |
|---|---|
| `src/lib/dms-types.ts` | All domain types — start here |
| `src/lib/dms.server.ts` | All business logic |
| `src/lib/dms.functions.ts` | All RPC endpoints |
| `src/routes/__root.tsx` | Root layout + Wagmi/Query providers |
| `src/lib/registry.server.ts` | Local DB abstraction layer |

### Adding a New Server Function

```typescript
// 1. Define in src/lib/dms.functions.ts
export const myNewFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ myField: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { myLogic } = await import("./dms.server");
    return myLogic(data);
  });

// 2. Implement business logic in src/lib/dms.server.ts
export async function myLogic(data: { myField: string }) {
  // read/write registry, log audit, etc.
}

// 3. Call from a React component
import { myNewFn } from "@/lib/dms.functions";
const result = await myNewFn({ data: { myField: "value" } });
```

### Adding a New Route

```bash
# Create a new file — filename becomes the route
touch src/routes/mypage.tsx
# Run dev server to trigger route tree auto-generation
npm run dev
```

### Storage Backend Selection Logic

```
SUPABASE_URL set?  → use Supabase Storage + PostgreSQL
AWS_* set?         → use AWS S3 via gateway
GCS_* set?         → use Google Cloud Storage
(none of the above)→ use local .data/ directory (default)
```

### Adding a New OCR Provider

1. Create `src/lib/ocr/my-provider.ts` implementing the `OCRProvider` interface from `ocr-types.ts`
2. Register it in `src/lib/ocr/ocr-service.ts` under the desired `OCR_PROVIDER` key
3. Add tests in `tests/ocr.test.ts`

---

*PRD maintained by the Vigil.OS development team.*  
*Smart India Hackathon 2024 · Problem Statement 26190 · Ministry of Home Affairs*
