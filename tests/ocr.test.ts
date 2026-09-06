process.env["NODE_ENV"] = "test";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { computeSha256 } from "../src/lib/crypto.server";
import {
  registerDocument,
  getDocumentExtractedText,
  getDocumentOCRStatus,
  processDocumentOCRFn,
} from "../src/lib/dms.server";
import { processDocumentOCR, setOCRProvider, getOCRProvider } from "../src/lib/ocr/ocr-service";
import type { OCRProvider } from "../src/lib/ocr/ocr-types";
import { extractFromPdf } from "../src/lib/ocr/pdf-extractor";
import type { Actor } from "../src/lib/dms-types";

// Mock Actors with different clearance tiers
const adminActor: Actor = {
  id: "usr-admin-ocr",
  name: "S. Rao (Director)",
  badge: "REC-0001",
  role: "ADMIN",
};

const investigatorActor: Actor = {
  id: "usr-invest-ocr",
  name: "Insp. Deshmukh",
  badge: "MH-1180",
  role: "INVESTIGATOR",
};

const viewerActor: Actor = {
  id: "usr-viewer-ocr",
  name: "Dr. N. Iyer (Forensic Viewer)",
  badge: "FSL-303",
  role: "VIEWER",
};

describe("Judicator Docs — OCR (Optical Character Recognition) Engine", () => {
  const originalProvider = getOCRProvider();

  // Test Provider Mock that can simulate both fast local recognition and failure
  class MockOCRProvider implements OCRProvider {
    name = "Mock Forensic OCR Engine";
    public shouldFail = false;
    public lastLanguageReceived = "";

    async recognize(buffer: Buffer, language: string = "eng"): Promise<{ text: string; confidence: number }> {
      this.lastLanguageReceived = language;
      if (this.shouldFail) {
        throw new Error("Simulated OCR optical engine timeout / failure.");
      }
      return {
        text: `RECOGNIZED EVIDENCE [LANG=${language}]: State of Maharashtra vs Accused Party, FIR #402/2026. Forensic sample authenticated.`,
        confidence: 96,
      };
    }
  }

  const mockProvider = new MockOCRProvider();

  before(() => {
    setOCRProvider(mockProvider);
  });

  after(() => {
    setOCRProvider(originalProvider);
  });

  // ── TEST 1: Digital PDF direct extraction ────────────────────
  test("TEST 1: Digital PDF with selectable text → extracts directly without running heavy OCR", async () => {
    // Generate valid minimal PDF with selectable text stream
    const digitalPdfContent =
      `%PDF-1.4\n` +
      `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n` +
      `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n` +
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n` +
      `4 0 obj << /Length 72 >> stream\n` +
      `BT /F1 12 Tf 50 700 Td (IN THE SESSIONS COURT OF GREATER MUMBAI - JUDICATOR CASE 881) Tj ET\n` +
      `endstream endobj\n` +
      `xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \n` +
      `trailer << /Root 1 0 R /Size 5 >>\nstartxref\n340\n%%EOF`;

    const pdfBuf = Buffer.from(digitalPdfContent);
    const pdfResult = await extractFromPdf(pdfBuf);

    assert.equal(pdfResult.hasSelectableText, true, "Digital PDF must be recognized as having selectable text");
    assert.match(pdfResult.text, /SESSIONS COURT/i, "Extracted text must contain digital text content");

    // Process via OCR Service
    const ocrResult = await processDocumentOCR({
      fileBuffer: pdfBuf,
      mimeType: "application/pdf",
      filename: "court_order.pdf",
    });

    assert.equal(ocrResult.status, "COMPLETED");
    assert.equal(ocrResult.source, "DIRECT_TEXT", "Must use direct extraction for digital text");
    assert.match(ocrResult.text, /GREATER MUMBAI/i);
  });

  // ── TEST 2: Image OCR (PNG/JPG/TIFF) ─────────────────────────
  test("TEST 2: Image document upload → routes to OCR engine and extracts text", async () => {
    const fakeImageBuffer = Buffer.from("FAKE_PNG_BYTE_STREAM_EVIDENCE_SCAN_001");
    mockProvider.shouldFail = false;

    const ocrResult = await processDocumentOCR({
      fileBuffer: fakeImageBuffer,
      mimeType: "image/png",
      filename: "crime_scene_memo.png",
      language: "eng",
    });

    assert.equal(ocrResult.status, "COMPLETED");
    assert.equal(ocrResult.source, "OCR_IMAGE");
    assert.match(ocrResult.text, /State of Maharashtra/i);
    assert.equal(ocrResult.confidence, 96);
  });

  // ── TEST 3: Multi-language OCR Configuration ──────────────────
  test("TEST 3: Multi-language parameter (Hindi / Marathi) is propagated to OCR engine", async () => {
    const fakeImageBuffer = Buffer.from("FAKE_IMAGE_MARATHI_FIR");
    mockProvider.shouldFail = false;

    const ocrResult = await processDocumentOCR({
      fileBuffer: fakeImageBuffer,
      mimeType: "image/jpeg",
      filename: "fir_marathi.jpg",
      language: "mar",
    });

    assert.equal(ocrResult.status, "COMPLETED");
    assert.equal(mockProvider.lastLanguageReceived, "mar", "OCR provider must receive specified language code");
    assert.match(ocrResult.text, /LANG=mar/);
  });

  // ── TEST 4: Full Upload Workflow with SHA-256 + OCR ──────────
  test("TEST 4: Document upload pipeline automatically stores file, generates SHA-256, and completes OCR", async () => {
    const rawContent = "EVIDENCE MEMORANDUM: Serial #88192-A recovered from suspect vehicle.";
    const originalHash = computeSha256(rawContent);

    mockProvider.shouldFail = false;

    const uploadRes = await registerDocument({
      actor: investigatorActor,
      caseId: "case-ocr-test-01",
      name: "Vehicle Recovery Memo",
      category: "Seizure Memo",
      classification: "CONFIDENTIAL",
      hash: originalHash,
      size: Buffer.byteLength(rawContent),
      note: "Recovered at checkpoint",
      tags: ["memo", "checkpoint"],
      fileBase64: Buffer.from(rawContent).toString("base64"),
      mimeType: "text/plain",
      originalFileName: "recovery_memo.txt",
      ocrLanguage: "eng",
    });

    // 1. Verify SHA-256 is strictly generated from the ORIGINAL file
    assert.equal(uploadRes.sha256, originalHash, "SHA-256 must match original file bytes exactly");
    assert.equal(uploadRes.document.versions[0].hash, originalHash);

    // 2. Verify OCR metadata is attached to the document record
    assert.equal(uploadRes.ocrStatus, "COMPLETED");
    assert.equal(uploadRes.document.ocr_status, "COMPLETED");
    assert.match(uploadRes.document.ocr_text || "", /EVIDENCE MEMORANDUM/i);
    assert.equal(uploadRes.document.ocr_source, "DIRECT_TEXT");
  });

  // ── TEST 5: OCR Failure Fault Isolation ──────────────────────
  test("TEST 5: OCR engine failure does NOT delete or corrupt original document", async () => {
    const fileBytes = "CONFIDENTIAL AUTOPSY FORENSIC REPORT - STRICTLY EMBARGOED";
    const expectedHash = computeSha256(fileBytes);

    // Simulate OCR failure
    mockProvider.shouldFail = true;

    const uploadRes = await registerDocument({
      actor: investigatorActor,
      caseId: "case-ocr-test-01",
      name: "Autopsy Report",
      category: "Forensic Report",
      classification: "SECRET",
      hash: expectedHash,
      size: Buffer.byteLength(fileBytes),
      note: "Autopsy report",
      tags: ["autopsy"],
      fileBase64: Buffer.from(fileBytes).toString("base64"),
      mimeType: "image/png",
      originalFileName: "autopsy.png",
    });

    // 1. Document upload must still succeed
    assert.ok(uploadRes.document.id, "Document must still be registered in archive");
    // 2. Original SHA-256 hash must be preserved
    assert.equal(uploadRes.sha256, expectedHash);
    // 3. Status must record FAILED with error detail
    assert.equal(uploadRes.document.ocr_status, "FAILED");
    assert.match(uploadRes.document.ocr_error || "", /simulated ocr/i);

    // Reset mock
    mockProvider.shouldFail = false;
  });

  // ── TEST 6: Authorization & Clearance Gate on OCR Text ────────
  test("TEST 6: Unauthorized personnel cannot inspect OCR text of classified documents", async () => {
    const topSecretContent = "TOP SECRET NATIONAL DEFENSE INTELLIGENCE DOSSIER";
    const hash = computeSha256(topSecretContent);
    mockProvider.shouldFail = false;

    const uploadRes = await registerDocument({
      actor: adminActor,
      caseId: "case-ocr-test-01",
      name: "Classified Dossier",
      category: "Intelligence Dossier",
      classification: "TOP SECRET",
      hash,
      size: Buffer.byteLength(topSecretContent),
      note: "High priority classified record",
      tags: ["top-secret"],
      fileBase64: Buffer.from(topSecretContent).toString("base64"),
      mimeType: "text/plain",
      originalFileName: "intel.txt",
    });

    // Admin has Level 5 clearance -> Can retrieve OCR text
    const adminFetch = await getDocumentExtractedText({
      actor: adminActor,
      documentId: uploadRes.document.id,
    });
    assert.ok(adminFetch.ocrText.length > 0, "Admin must be able to inspect OCR text");

    // Viewer has Level 1 clearance -> Gated and rejected!
    await assert.rejects(
      async () => {
        await getDocumentExtractedText({
          actor: viewerActor,
          documentId: uploadRes.document.id,
        });
      },
      (err: any) => {
        assert.match(err.message, /clearance/i);
        return true;
      },
      "Viewer must be denied access to TOP SECRET OCR text",
    );
  });

  // ── TEST 7: Lightweight OCR Status Endpoint ───────────────────
  test("TEST 7: getDocumentOCRStatus returns lightweight metadata without large text payloads", async () => {
    const content = "ROUTINE CHARGESHEET SUMMARY";
    const hash = computeSha256(content);
    mockProvider.shouldFail = false;

    const uploadRes = await registerDocument({
      actor: investigatorActor,
      caseId: "case-ocr-test-01",
      name: "Chargesheet Summary",
      category: "Chargesheet",
      classification: "RESTRICTED",
      hash,
      size: Buffer.byteLength(content),
      note: "Filing",
      tags: ["chargesheet"],
      fileBase64: Buffer.from(content).toString("base64"),
      mimeType: "text/plain",
      originalFileName: "chargesheet.txt",
    });

    const statusRes = await getDocumentOCRStatus({
      actor: investigatorActor,
      documentId: uploadRes.document.id,
    });

    assert.equal(statusRes.documentId, uploadRes.document.id);
    assert.equal(statusRes.ocrStatus, "COMPLETED");
    assert.equal(statusRes.sha256, hash);
    assert.equal((statusRes as any).ocrText, undefined, "Status endpoint must not leak full text payload");
  });

  // ── TEST 8: On-demand Re-run OCR ─────────────────────────────
  test("TEST 8: processDocumentOCRFn allows re-running OCR on archived records", async () => {
    const fileBytes = "IMAGE FOR RE-OCR TESTING";
    mockProvider.shouldFail = false;

    const uploadRes = await registerDocument({
      actor: investigatorActor,
      caseId: "case-ocr-test-01",
      name: "Re-OCR Test Memo",
      category: "Police Report",
      classification: "RESTRICTED",
      hash: computeSha256(fileBytes),
      size: Buffer.byteLength(fileBytes),
      note: "Initial test file",
      tags: ["reocr"],
      fileBase64: Buffer.from(fileBytes).toString("base64"),
      mimeType: "image/png",
      originalFileName: "reocr_test.png",
      ocrLanguage: "eng",
    });

    // Re-run OCR with Hindi ('hin')
    const rerunResult = await processDocumentOCRFn({
      actor: investigatorActor,
      documentId: uploadRes.document.id,
      language: "hin",
    });

    assert.equal(rerunResult.ocrStatus, "COMPLETED");
    assert.equal(rerunResult.ocrLanguage, "hin");
    assert.equal(mockProvider.lastLanguageReceived, "hin");
  });

  // ── TEST 9: Non-document File Types ──────────────────────────
  test("TEST 9: Unsupported file types are gracefully marked NOT_REQUIRED", async () => {
    const binData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
    const ocrResult = await processDocumentOCR({
      fileBuffer: binData,
      mimeType: "application/octet-stream",
      filename: "firmware.bin",
    });

    assert.equal(ocrResult.status, "NOT_REQUIRED");
    assert.equal(ocrResult.source, "NOT_REQUIRED");
    assert.equal(ocrResult.text, "");
  });

  // ── TEST 10: Pluggable OCR Architecture ───────────────────────
  test("TEST 10: setOCRProvider allows plugging custom OCR providers seamlessly", async () => {
    class CustomCloudVisionProvider implements OCRProvider {
      name = "Hyperledger Notarized OCR Gateway";
      async recognize(buf: Buffer) {
        return { text: "NOTARIZED OCR PROOF", confidence: 99 };
      }
    }

    setOCRProvider(new CustomCloudVisionProvider());

    const ocrResult = await processDocumentOCR({
      fileBuffer: Buffer.from("EVIDENCE"),
      mimeType: "image/jpeg",
      filename: "evidence.jpg",
    });

    assert.equal(ocrResult.engine, "Hyperledger Notarized OCR Gateway");
    assert.equal(ocrResult.text, "NOTARIZED OCR PROOF");
    assert.equal(ocrResult.confidence, 99);
  });

  // ── TEST 11: Google Gemini Multimodal AI OCR Engine ───────────
  test("TEST 11: GeminiOCRProvider initializes with API key and conforms to OCRProvider contract", async () => {
    const { GeminiOCRProvider } = await import("../src/lib/ocr/gemini-ocr-provider");
    const gemini = new GeminiOCRProvider("test-gemini-key");
    assert.equal(gemini.name, "Google Gemini 2.5 Multimodal AI OCR");
    assert.equal(typeof gemini.recognize, "function");
    assert.equal(typeof gemini.cleanup, "function");
  });
});
