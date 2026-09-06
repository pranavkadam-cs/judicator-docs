# ⚖️ Vigil.OS — Secure Digital Document Management System

> **A secure, enterprise-grade digital document management system built for law enforcement, judiciary, and forensic investigation teams.**

Vigil.OS provides end-to-end document lifecycle management with **SHA-256 cryptographic integrity**, **Optical Character Recognition (OCR)**, **role-based access control**, **audit logging**, and **blockchain-ready architecture** — built on TanStack Start + React.

---

## 🏗️ High-Level System Architecture

```mermaid
graph TD
    User([👤 Security User]) -->|Authenticates| Login[Login / Session Engine]
    Login -->|Session Token| Client[Vigil.OS Client — React + TailwindCSS]

    Client -->|Server Function RPC| ServerFn[TanStack Start Server Functions]

    ServerFn -->|Session / RBAC Validation| Auth[Auth Engine — auth.server.ts]
    ServerFn -->|SHA-256 Hashing| Crypto[Crypto Engine — crypto.server.ts]
    ServerFn -->|Document CRUD & Workflows| DMS[DMS Engine — dms.server.ts]
    ServerFn -->|Text Extraction & Recognition| OCR[OCR Engine — src/lib/ocr/]

    DMS -->|Metadata Registry| DB[(JSON Registry — .data/registry.json)]
    DMS -->|Physical File I/O| Storage[(Secure Disk Store — .data/storage/)]
    DMS -.->|Future: Cloud Tier| S3[S3 Storage Gateway — s3.server.ts]

    OCR -->|Digital PDFs| PDFExtractor[PDF Text Extractor — pdf-parse]
    OCR -->|Scanned Docs & Images| Tesseract[Tesseract Provider — tesseract.js WASM]

    DMS -.->|Future: Immutable Ledger| Blockchain[Hyperledger Fabric Peer]

    style User fill:#1e293b,stroke:#60a5fa,color:#f8fafc
    style Client fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
    style ServerFn fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style Auth fill:#1e3a5f,stroke:#38bdf8,color:#e2e8f0
    style Crypto fill:#1e3a5f,stroke:#38bdf8,color:#e2e8f0
    style DMS fill:#1e3a5f,stroke:#38bdf8,color:#e2e8f0
    style OCR fill:#3b1f6e,stroke:#a78bfa,color:#ede9fe
    style DB fill:#064e3b,stroke:#34d399,color:#d1fae5
    style Storage fill:#064e3b,stroke:#34d399,color:#d1fae5
    style S3 fill:#374151,stroke:#9ca3af,color:#d1d5db
    style Blockchain fill:#374151,stroke:#9ca3af,color:#d1d5db
```

---

## 📄 Complete Document Lifecycle Flow

```mermaid
flowchart TD
    A[📤 User Uploads File] --> B{Client-Side Processing}
    B --> B1[Compute SHA-256 via Web Crypto API]
    B --> B2[Encode File as Base64]
    B1 & B2 --> C[Send to Server Function — fileDocument]

    C --> D[Server: Validate Clearance & RBAC]
    D --> E[Server: Decode & Store Raw Bytes to Disk]
    E --> F[Server: Compute Authoritative SHA-256]
    F --> G{File Type Detection}

    G -->|Digital PDF| H[Direct Text Extraction — pdf-parse]
    G -->|Scanned PDF / Image| I[OCR via Tesseract.js WASM]
    G -->|Plain Text| J[Direct Ingestion]

    H & I & J --> K[Store Extracted Text + OCR Metadata]
    K --> L[Create Document Record in Registry]
    L --> M[Log Immutable Audit Event]
    M --> N[✅ Document Available in DMS]

    N --> O{Workflow Engine}
    O -->|Submit| P[DRAFT → UNDER_REVIEW]
    P -->|Approve| Q[UNDER_REVIEW → APPROVED]
    Q -->|Seal| R[APPROVED → SEALED]
    R -->|Sign| S[SEALED → SIGNED]
    S -->|Archive| T[SIGNED → ARCHIVED]
    O -->|Reject| U[UNDER_REVIEW → REJECTED]
    U -->|Revise| V[REJECTED → DRAFT]

    style A fill:#1e40af,stroke:#3b82f6,color:#dbeafe
    style N fill:#065f46,stroke:#10b981,color:#d1fae5
    style S fill:#7c3aed,stroke:#a78bfa,color:#ede9fe
```

---

## 🔒 SHA-256 Cryptographic Integrity Engine (SIH 26190)

Vigil.OS implements a forensic-grade **SHA-256 File Integrity Verification System** for legal chain-of-custody compliance:

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Client Pre-Upload** | Web Crypto `SubtleCrypto.digest()` | Instant SHA-256 preview before upload |
| **Server Authoritative** | Node.js `crypto.createHash("sha256")` | Streaming hash computation from raw bytes |
| **Tamper Detection** | `crypto.timingSafeEqual()` | Constant-time comparison to prevent timing attacks |
| **Download Gate** | On-the-fly re-hash | Physical file re-hashed before delivery; mismatches are **blocked** |
| **Tamper Simulation** | Diagnostic tool | Demonstrates real-time tamper alerts for SIH judges |

```mermaid
flowchart LR
    Upload[📤 Upload] --> ClientHash[Client SHA-256]
    ClientHash --> ServerHash[Server SHA-256 — Authoritative]
    ServerHash --> Store[Store Hash + File on Disk]
    Store --> Download[📥 Download Request]
    Download --> ReHash[Re-compute SHA-256 from Disk]
    ReHash --> Compare{Hashes Match?}
    Compare -->|✅ Yes| Deliver[Deliver File]
    Compare -->|❌ No| Block[🚫 TAMPER ALERT — Blocked]

    style Block fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style Deliver fill:#065f46,stroke:#10b981,color:#d1fae5
```

📖 **Full Technical Documentation**: See [`SHA256_INTEGRITY.md`](SHA256_INTEGRITY.md)

---

## 🔍 OCR Engine — Optical Character Recognition

The OCR subsystem automatically extracts searchable text from uploaded documents using a **modular provider architecture**.

### Supported Formats

| Format | MIME Type | Processing Method |
| :--- | :--- | :--- |
| PDF (Digital) | `application/pdf` | Direct stream text extraction |
| PDF (Scanned) | `application/pdf` | Tesseract OCR on extracted page images |
| PNG | `image/png` | Tesseract OCR |
| JPEG / JPG | `image/jpeg` | Tesseract OCR |
| TIFF / TIF | `image/tiff` | Tesseract OCR |
| Plain Text | `text/plain` | Direct ingestion |

### Supported OCR Languages
- 🇬🇧 **English** (`eng`) — Default
- 🇮🇳 **Hindi** (`hin`) — हिन्दी
- 🇮🇳 **Marathi** (`mar`) — मराठी

### Provider Architecture

```mermaid
flowchart TD
    OCRService[OCR Service — ocr-service.ts] --> Detect{Detect File Type}

    Detect -->|PDF| PDFPath{Has Selectable Text?}
    PDFPath -->|Yes| DirectExtract[PDF Text Extraction — pdf-parse]
    PDFPath -->|No| ScanExtract[Extract Pages as Images]
    ScanExtract --> TesseractOCR

    Detect -->|Image| TesseractOCR[Tesseract Provider — tesseract.js WASM]

    Detect -->|Text| DirectRead[Direct Text Read]

    DirectExtract --> Result[📝 Extracted Text + Metadata]
    TesseractOCR --> Result
    DirectRead --> Result

    Result --> SaveDB[Save to Registry with OCR Status]
    SaveDB --> AuditLog[Log OCR Audit Event]

    style OCRService fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style TesseractOCR fill:#3b1f6e,stroke:#a78bfa,color:#ede9fe
    style Result fill:#065f46,stroke:#10b981,color:#d1fae5
```

> **Forensic Boundary**: The SHA-256 digest is computed from the **original uploaded bytes** before any OCR processing. Re-running OCR never alters the cryptographic hash.

📖 **Full Technical Documentation**: See [`OCR_ARCHITECTURE.md`](OCR_ARCHITECTURE.md)

---

## 🔑 Role-Based Access Control (RBAC)

Five hierarchical clearance levels enforce granular access control across the entire system:

| Role | Clearance | Upload | Sign | Manage Assets | Manage Users | Approve |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Admin** | Level 4 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Investigator** | Level 3 | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Legal Officer** | Level 3 | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Court Officer** | Level 2 | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Viewer** | Level 1 | ❌ | ❌ | ❌ | ❌ | ❌ |

### Document Classification Levels

```
PUBLIC → RESTRICTED → CONFIDENTIAL → SECRET → TOP SECRET
  (0)       (1)           (2)          (3)       (4)
```

Users can only access documents at or below their clearance level.

---

## 📂 Document Workflow State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT : File Document

    DRAFT --> UNDER_REVIEW : Submit for Review
    DRAFT --> ARCHIVED : Archive

    UNDER_REVIEW --> APPROVED : Approve
    UNDER_REVIEW --> REJECTED : Reject

    APPROVED --> SEALED : Seal Document
    APPROVED --> ARCHIVED : Archive

    REJECTED --> DRAFT : Revise

    SEALED --> SIGNED : Apply Digital Signature
    SEALED --> ARCHIVED : Archive

    SIGNED --> ARCHIVED : Final Archive

    TAMPER_ALERT --> TAMPER_ALERT : Locked (Immutable)
```

---

## 🛰️ API Server Functions Reference

All server functions are exposed via TanStack Start RPC (`src/lib/dms.functions.ts`):

### Document Management
| Function | Method | Description |
| :--- | :---: | :--- |
| `fileDocument` | POST | Upload document, store bytes, compute SHA-256, run OCR, log audit |
| `requestDownload` | POST | Download with on-the-fly integrity verification gate |
| `checkIntegrity` | POST | Verify stored document hash against computed hash |
| `advanceWorkflowFn` | POST | Transition document through workflow states |
| `applySignature` | POST | Apply digital signature to sealed documents |
| `reclassifyDocument` | POST | Change document classification level |
| `simulateTamperFn` | POST | Tamper simulation for SIH demonstration |
| `restoreDocumentFn` | POST | Restore a tampered document from backup |

### OCR Operations
| Function | Method | Description |
| :--- | :---: | :--- |
| `triggerOCR` | POST | Manually trigger/re-run OCR with language selection |
| `getExtractedText` | POST | Retrieve extracted text (clearance-gated) |
| `getOCRStatus` | POST | Lightweight OCR status metadata query |

### Case Management
| Function | Method | Description |
| :--- | :---: | :--- |
| `openCase` | POST | Create a new case dossier |
| `updateCaseFn` | POST | Update case status, priority, or assignments |
| `fetchSnapshot` | GET | Full registry snapshot (clearance-filtered) |

### Sharing & Collaboration
| Function | Method | Description |
| :--- | :---: | :--- |
| `shareDocumentFn` | POST | Share document with time-bound permissions |
| `revokeShareFn` | POST | Revoke an active share |
| `toggleShare` | POST | Toggle role-level sharing access |

### Assets & Notifications
| Function | Method | Description |
| :--- | :---: | :--- |
| `inductAsset` | POST | Register a new physical asset |
| `moveAssetStage` | POST | Advance asset lifecycle stage |
| `markNotificationReadFn` | POST | Mark notification as read |
| `markAllNotificationsReadFn` | POST | Mark all notifications as read |

---

## 📁 Repository Structure

```
judicator-docs/
├── .data/
│   ├── registry.json                  # Persistent JSON database
│   └── storage/vigil/cases/           # Physical file storage (per case)
├── public/
│   ├── favicon.png                    # Security shield icon
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── dms/
│   │   │   ├── actor.tsx              # User identity & role context
│   │   │   ├── analytics-charts.tsx   # Recharts dashboard widgets
│   │   │   ├── confirm-dialog.tsx     # Confirmation modals
│   │   │   ├── notification-bell.tsx  # Real-time notification bell
│   │   │   ├── primitives.tsx         # Shared UI primitives
│   │   │   ├── records.tsx            # Document records table
│   │   │   ├── search-filters.tsx     # Advanced search & filter panel
│   │   │   ├── share-panel.tsx        # Document sharing UI
│   │   │   ├── shell.tsx              # Application shell layout
│   │   │   └── workflow-actions.tsx   # Workflow transition controls
│   │   └── ui/                        # Radix-based reusable components
│   ├── hooks/                         # React state & lifecycle hooks
│   ├── lib/
│   │   ├── auth.server.ts             # Authentication & session engine
│   │   ├── auth.functions.ts          # Auth server function endpoints
│   │   ├── crypto.server.ts           # SHA-256 cryptographic engine
│   │   ├── dms-types.ts               # Core domain type definitions
│   │   ├── dms.functions.ts           # DMS server function endpoints
│   │   ├── dms.server.ts              # DMS business logic (40KB+)
│   │   ├── registry.server.ts         # JSON database adapter
│   │   ├── storage.server.ts          # Physical file storage service
│   │   ├── s3.server.ts               # Cloud storage gateway (future)
│   │   ├── seed-registry.ts           # Demo data seeder
│   │   ├── error-capture.ts           # Error boundary capture
│   │   ├── error-page.ts              # Error page renderer
│   │   ├── error-reporting.ts         # Runtime exception telemetry
│   │   ├── utils.ts                   # Shared utilities
│   │   └── ocr/
│   │       ├── ocr-service.ts         # OCR orchestration service
│   │       ├── ocr-types.ts           # OCR type definitions
│   │       ├── pdf-extractor.ts       # PDF text extraction engine
│   │       └── tesseract-provider.ts  # Tesseract.js WASM provider
│   ├── routes/
│   │   ├── __root.tsx                 # Root layout with providers
│   │   ├── index.tsx                  # Dashboard — analytics & overview
│   │   ├── login.tsx                  # Authentication page
│   │   ├── cases.index.tsx            # Case dossier listing
│   │   ├── cases.$caseId.tsx          # Case detail & document view
│   │   ├── documents.tsx              # Document registry browser
│   │   ├── documents.$docId.tsx       # Document detail & viewer (31KB+)
│   │   ├── audit.tsx                  # Security audit log viewer
│   │   ├── assets.tsx                 # Asset management dashboard
│   │   ├── users.tsx                  # User management panel
│   │   ├── notifications.tsx          # Notification center
│   │   └── profile.tsx                # User profile & settings
│   ├── router.tsx                     # Router initialization
│   ├── server.ts                      # SSR server entry
│   ├── start.ts                       # Client shell mount
│   └── styles.css                     # Global styles
├── tests/
│   ├── integrity.test.ts              # 10 SHA-256 integrity tests
│   └── ocr.test.ts                    # 10 OCR engine tests
├── eng.traineddata                    # Tesseract English language model
├── OCR_ARCHITECTURE.md                # OCR engine technical docs
├── SHA256_INTEGRITY.md                # SHA-256 integrity technical docs
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛡️ Security Features

| Feature | Description |
| :--- | :--- |
| **SHA-256 Chain of Custody** | Every file is cryptographically hashed on upload and re-verified on download |
| **Path Traversal Protection** | Storage keys are resolved under `.data/storage/` — no directory escape |
| **Timing-Safe Comparison** | Hash comparisons use `crypto.timingSafeEqual()` to prevent timing attacks |
| **Classification Gating** | Documents above a user's clearance level are invisible |
| **Immutable Audit Trail** | Every action (login, upload, share, sign, OCR) is permanently logged |
| **OCR Error Containment** | Failed OCR never corrupts original files; status tracked separately |
| **Session Management** | Cookie-based sessions with server-side validation |
| **Input Validation** | All server functions validated with Zod schemas |

---

## 🧪 Automated Testing

Run the complete test suite (20 tests):

```bash
# Run all tests
npm test

# Run only SHA-256 integrity tests (10 tests)
npm run test:integrity

# Run only OCR engine tests (10 tests)
npm run test:ocr
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+
- **npm** v9+

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/pranavkadam-cs/judicator-docs.git
cd judicator-docs

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The application will be available at: **`http://localhost:8080`**

### Production Build

```bash
npm run build
npm run preview
```

---

## 🎫 Demo Credentials

Use these pre-configured accounts to explore different roles:

| Email | Password | Role | Badge ID |
| :--- | :--- | :--- | :--- |
| `admin@vigil.os` | `admin123` | **Admin** | `REC-0001` |
| `investigator@vigil.os` | `invest123` | **Investigator** | `MH-1180` |
| `legal@vigil.os` | `legal123` | **Legal Officer** | `PP-0092` |
| `court@vigil.os` | `court123` | **Court Officer** | `MH-4471` |
| `viewer@vigil.os` | `viewer123` | **Viewer** | `FSL-303` |

---

## 🔗 Hyperledger Fabric — Blockchain Readiness

The system architecture is pre-partitioned for immutable ledger anchoring:

```mermaid
flowchart LR
    Server[Vigil.OS Server] -->|gRPC / REST| Peer[Hyperledger Fabric Peer]
    Peer --> Chaincode[DocumentNotaryCC]
    Chaincode --> Ledger[(Immutable Ledger)]

    Server -->|Payload| Payload["{ sha256_hash, ocr_status, ocr_source, metadata_hash }"]
    Payload -.-> Chaincode

    style Server fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style Peer fill:#064e3b,stroke:#34d399,color:#d1fae5
    style Ledger fill:#065f46,stroke:#10b981,color:#d1fae5
```

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TailwindCSS 4, Radix UI, Recharts, Lucide Icons |
| **Framework** | TanStack Start, TanStack Router, TanStack Query |
| **Backend** | Node.js (SSR), TanStack Server Functions |
| **Crypto** | Node.js `crypto` (SHA-256), Web Crypto API |
| **OCR** | Tesseract.js 7 (WASM), pdf-parse |
| **Validation** | Zod |
| **Database** | JSON file registry (`.data/registry.json`) |
| **Testing** | Node.js native test runner via `tsx` |
| **Build** | Vite 8 |

---

<p align="center">
  <strong>Vigil.OS</strong> — Securing Justice Through Technology<br/>
  <em>Built for SIH Problem Statement 26190</em>
</p>
