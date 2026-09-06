# Judicator Docs — Optical Character Recognition (OCR) Engine Architecture

## 1. Overview & Objective

The **Judicator Docs / Vigil.OS** system integrates an enterprise-grade, modular **Optical Character Recognition (OCR)** engine into the digital evidence and document management lifecycle.

When law enforcement, judicial officers, or forensic investigators upload case records (FIRs, autopsy reports, seizure memos, witness statements, court orders), the OCR subsystem automatically:
1. Validates the physical file payload.
2. Persists the original file bytes into the secure storage repository (`.data/storage/`).
3. Computes the immutable **SHA-256 cryptographic digest** from the **raw uploaded bytes**.
4. Analyzes the file format to determine whether OCR or text extraction is needed.
5. Performs text extraction:
   - **Digital PDFs**: Direct stream text extraction without OCR overhead.
   - **Scanned PDFs & Images (PNG, JPG, JPEG, TIFF)**: Optical character recognition via the Tesseract OCR engine.
6. Stores the extracted text and granular forensic OCR metadata in the registry database.
7. Logs an immutable audit trail event with the document's SHA-256 digest.

---

## 2. Cryptographic Separation: SHA-256 vs. OCR

> [!IMPORTANT]
> **Strict Forensic Boundary:**
> - The **SHA-256 digest** is calculated **strictly on the original uploaded file bytes** before any text processing occurs.
> - The extracted OCR text is **auxiliary search and analytical metadata**.
> - Alterations, retries, or re-running OCR with different language models will **never alter the original document's SHA-256 cryptographic hash**.
> - This guarantees forensic chain-of-custody compliance (SIH Problem Statement 26190) and ensures clean integration with Hyperledger Fabric smart contracts.

---

## 3. Architecture & Dual-Provider OCR Engine

```text
                                USER UPLOAD
                                     │
                     ┌───────────────▼───────────────┐
                     │   Validate File & Clearance   │
                     └───────────────┬───────────────┘
                                     │
                     ┌───────────────▼───────────────┐
                     │   Store Original File Bytes   │
                     │  Compute Authoritative SHA-256 │
                     └───────────────┬───────────────┘
                                     │
                     ┌───────────────▼───────────────┐
                     │     OCR Pipeline Dispatch     │
                     └───────────────┬───────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │                               │
             [PDF Document]                  [Raster Image]
                     │                               │
        ┌────────────┴────────────┐                  │
        │                         │                  │
  Selectable Text?          Scanned Pages?           │
        │                         │                  │
  [Direct Extraction]       [Extract Pages]          │
        │                         │                  │
        │                         └──────────┬───────┘
        │                                    │
        │                    ┌───────────────▼───────────────┐
        │                    │   Auto Provider Selection     │
        │                    │   (OCR_PROVIDER env config)   │
        │                    └───────────────┬───────────────┘
        │                         ┌──────────┴──────────┐
        │                         │                     │
        │              ┌──────────▼──────────┐   ┌──────▼──────────┐
        │              │ ☁ Google Cloud      │   │ Tesseract.js   │
        │              │   Vision API        │   │ (WASM Local)   │
        │              │ DOCUMENT_TEXT_DETECT │   │ Offline OCR    │
        │              └──────────┬──────────┘   └──────┬─────────┘
        │                         │    On Failure       │
        │                         └──────► Fallback ────┘
        │                                    │
        └────────────────────┬───────────────┘
                             │
                     ┌───────▼───────┐
                     │  Extract Text │
                     │  & Page Data  │
                     └───────┬───────┘
                             │
                     ┌───────▼───────────────────────┐
                     │ Save Document Record & Status │
                     │ Log Cryptographic Audit Trail │
                     └───────────────────────────────┘
```

### Provider Strategy (Environment Controlled)

| `OCR_PROVIDER` Value | Behavior |
| :--- | :--- |
| `auto` (default) | **Google Cloud Vision** primary → **Tesseract.js** automatic fallback on failure |
| `google-vision` | Google Cloud Vision only (requires API key) |
| `tesseract` | Local Tesseract.js only (offline, no API key needed) |

### OCR Provider Abstraction

All optical recognition engines implement the `OCRProvider` interface:

```typescript
export interface OCRProvider {
  name: string;
  recognize(
    imageBuffer: Buffer,
    language?: string,
  ): Promise<{ text: string; confidence?: number }>;
  cleanup?(): Promise<void>;
}
```

### Shipped Providers

| Provider | Engine | Mode | Key Features |
| :--- | :--- | :--- | :--- |
| **`GoogleVisionProvider`** | Google Cloud Vision API v1 | Cloud (HTTP) | `DOCUMENT_TEXT_DETECTION`, block-level confidence, multi-language hints, enterprise accuracy |
| **`TesseractProvider`** | Tesseract.js 7 (WASM) | Local (Offline) | WebAssembly in Node.js workers, no external dependencies, per-worker isolation |

Developers or administrators can swap in custom providers (e.g., AWS Textract, Azure Document Intelligence, or Hyperledger Fabric notary gateways) via `setOCRProvider(customProvider)`.


---

## 4. Supported File Types & Languages

### Supported Formats:
- **PDF** (`application/pdf`) — Automatic digital vs. scanned detection
- **PNG** (`image/png`)
- **JPEG / JPG** (`image/jpeg`, `image/jpg`)
- **TIFF / TIF** (`image/tiff`, `image/tif`)
- **Plaintext** (`text/plain`) — Direct ingestion

### Supported Languages:
- **English** (`eng`) — Default
- **Hindi** (`hin`) — हिन्दी
- **Marathi** (`mar`) — मराठी

Language codes can be passed during file intake or when re-running OCR on an archived dossier.

---

## 5. Database Schema Changes

The `CaseDocument` entity in `.data/registry.json` and `src/lib/dms-types.ts` has been extended with the following forensic fields:

```typescript
export type CaseDocument = {
  // ... existing fields (id, caseId, refId, name, classification, status, versions, ...)
  
  // OCR Intelligence & Extracted Forensic Text
  ocr_status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_REQUIRED";
  ocr_text?: string;
  ocr_language?: string;
  ocr_processed_at?: string;
  ocr_engine?: string;
  ocr_error?: string;
  ocr_page_count?: number;
  ocr_source?: "DIRECT_TEXT" | "OCR_IMAGE" | "OCR_SCANNED_PDF" | "NOT_REQUIRED";
};
```

---

## 6. API Server Functions

The following server functions are exposed via `src/lib/dms.functions.ts` (`@tanstack/react-start` RPC endpoints):

| Endpoint Function | Method | Description | Security Check |
| :--- | :--- | :--- | :--- |
| `fileDocument` | `POST` | Uploads document, saves original bytes, computes SHA-256, runs OCR, logs audit event. | Filing rights (`canUpload`) + clearance check |
| `triggerOCR` | `POST` | Manually triggers or re-runs OCR on an existing document with a chosen language. | Filing rights + clearance check |
| `getExtractedText` | `POST` | Retrieves full extracted OCR text and page metrics. | **Strict clearance gate** (Users below classification level receive `403 Access Denied`) |
| `getOCRStatus` | `POST` | Returns lightweight metadata (`ocrStatus`, `ocrEngine`, `sha256`) without large payloads. | Clearance check |

---

## 7. Security & Fault Tolerance

1. **Path-Traversal Protection:** File storage uses resolved safe keys under `.data/storage/` ensuring no directory escape attacks.
2. **Error Containment:** If a corrupted image or unreadable PDF causes Tesseract to fail:
   - The original file remains safe and uncorrupted on disk.
   - The authoritative SHA-256 hash remains intact.
   - The document is marked `ocr_status: "FAILED"` with sanitized diagnostic messages.
   - An immutable audit trail event `OCR_FAILED` is recorded.
3. **Clearance Gating:** Viewer personnel or officers lacking clearance for `SECRET` or `TOP SECRET` documents cannot view OCR text, search inside it, or export it.

---

## 8. Hyperledger Fabric Blockchain Readiness

In the upcoming phase, the document hash and OCR metadata will be anchored onto a Hyperledger Fabric ledger:

```text
┌───────────────────────────────┐
│     Judicator Docs Server     │
│                               │
│  Original File SHA-256        │
│  + OCR Text SHA-256           │
│  + Metadata Hash              │
└───────────────┬───────────────┘
                │
                ▼ gRPC / REST
┌───────────────────────────────┐
│    Hyperledger Fabric Peer    │
│                               │
│ Chaincode: DocumentNotaryCC   │
│ Function:  RecordDocumentHash │
│ State:     Immutable Ledger   │
└───────────────────────────────┘
```

The document metadata structure is already partitioned so that the `sha256_hash`, `ocr_status`, and `ocr_source` can be packaged into a JSON payload ready for chaincode invocation without refactoring.

---

## 9. How to Run Locally

### Running Development Server:
```powershell
npm run dev
```
The server will start at `http://localhost:8080`.

### Running the Test Suite:
```powershell
npm test
```
Executes all 20 automated tests (10 SHA-256 integrity tests + 10 OCR engine tests) via Node's native test runner (`tsx --test`).

### Optional Native Tesseract Installation (Windows):
`tesseract.js` is bundled and requires no external binaries. If you wish to install the native Windows C++ Tesseract binary:
1. Download the installer from UB-Mannheim: https://github.com/UB-Mannheim/tesseract/wiki
2. Install to default path: `C:\Program Files\Tesseract-OCR\tesseract.exe`
3. Add `C:\Program Files\Tesseract-OCR` to system PATH.
