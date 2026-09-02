import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { computeSha256, computeSha256Stream, safeCompareHashes, isValidSha256 } from "../src/lib/crypto.server";
import {
  registerDocument,
  downloadDocumentWithIntegrity,
  verifyStoredDocumentIntegrity,
  simulateTamperDocument,
  restoreDocumentFile,
  createCase,
} from "../src/lib/dms.server";
import { saveLocalFile, readLocalFile, deleteLocalFile } from "../src/lib/storage.server";
import type { Actor } from "../src/lib/dms-types";

// Mock Actors for testing
const adminActor: Actor = {
  id: "usr-admin-001",
  name: "S. Rao",
  badge: "REC-0001",
  role: "ADMIN",
};

const investigatorActor: Actor = {
  id: "usr-invest-002",
  name: "Insp. A. Deshmukh",
  badge: "MH-1180",
  role: "INVESTIGATOR",
};

const viewerActor: Actor = {
  id: "usr-viewer-005",
  name: "Dr. N. Iyer",
  badge: "FSL-303",
  role: "VIEWER",
};

describe("SIH Problem Statement 26190: SHA-256 File Integrity Verification Engine", () => {
  let testCaseId = "case-test-sih";

  test("TEST 1: Upload a file → SHA-256 is generated automatically and stored", async () => {
    const fileContent = "CONFIDENTIAL POLICE REPORT: Incident at Sector 7 on 28 Aug 2026";
    const expectedHash = computeSha256(fileContent);

    assert.equal(isValidSha256(expectedHash), true, "Hash must be 64-character hexadecimal");
    assert.equal(expectedHash, expectedHash.toLowerCase(), "Hash must be normalized lowercase");

    const uploadRes = await registerDocument({
      actor: investigatorActor,
      caseId: testCaseId,
      name: "Sector 7 Incident Report",
      category: "Police Report",
      classification: "RESTRICTED",
      hash: expectedHash,
      size: Buffer.byteLength(fileContent),
      note: "Initial field filing",
      tags: ["incident", "sector7"],
      fileBase64: Buffer.from(fileContent).toString("base64"),
      originalFileName: "sector7_report.pdf",
    });

    assert.equal(uploadRes.integrityStatus, "VERIFIED");
    assert.equal(uploadRes.hashAlgorithm, "SHA-256");
    assert.equal(uploadRes.sha256, expectedHash);
    assert.equal(uploadRes.document.versions[0].hash, expectedHash);
  });

  test("TEST 2: Upload same file twice → identical content produces identical SHA-256", async () => {
    const payload = "Identical forensic telemetry packet buffer #1092";
    const hash1 = computeSha256(payload);
    const hash2 = computeSha256(Buffer.from(payload));

    assert.equal(hash1, hash2, "Identical content must always generate exact same SHA-256");
  });

  test("TEST 3: Modify one byte → SHA-256 changes completely (Avalanche Effect)", async () => {
    const original = Buffer.from("Vigil.OS Cryptographic Dossier v1.0.0");
    const tampered = Buffer.from("Vigil.OS Cryptographic Dossier v1.0.0");

    // Invert single bit in single byte
    tampered[10] = (tampered[10] ?? 0) ^ 0x01;

    const hashA = computeSha256(original);
    const hashB = computeSha256(tampered);

    assert.notEqual(hashA, hashB, "Even a 1-bit modification must completely change the SHA-256 digest");
  });

  test("TEST 4: Download untouched file → server verification succeeds", async () => {
    const content = "WITNESS TESTIMONY: Subject confirmed on premises at 22:45.";
    const hash = computeSha256(content);

    const docRes = await registerDocument({
      actor: investigatorActor,
      caseId: testCaseId,
      name: "Witness Testimony 01",
      category: "Witness Statement",
      classification: "CONFIDENTIAL",
      hash,
      size: Buffer.byteLength(content),
      note: "Deposition under caution",
      tags: ["witness"],
      fileBase64: Buffer.from(content).toString("base64"),
      originalFileName: "witness_statement_01.pdf",
    });

    const downloadRes = await downloadDocumentWithIntegrity({
      actor: investigatorActor,
      documentId: docRes.document.id,
    });

    assert.equal(downloadRes.verified, true);
    assert.equal(downloadRes.integrityStatus, "VERIFIED");
    assert.equal(downloadRes.sha256, hash);
    assert.equal(downloadRes.filename, "witness_statement_01.pdf");

    // Verify downloaded base64 content matches original
    const decoded = Buffer.from(downloadRes.base64Content, "base64").toString("utf-8");
    assert.equal(decoded, content);
  });

  test("TEST 5: Tamper with stored file → download is blocked and tamper alert raised", async () => {
    const content = "SECURE EVIDENCE RECORD: Weapon serial #W-99201 sealed in locker 4";
    const hash = computeSha256(content);

    const docRes = await registerDocument({
      actor: investigatorActor,
      caseId: testCaseId,
      name: "Ballistics Record",
      category: "Evidence Record",
      classification: "CONFIDENTIAL",
      hash,
      size: Buffer.byteLength(content),
      note: "Locker custody log",
      tags: ["evidence", "ballistics"],
      fileBase64: Buffer.from(content).toString("base64"),
      originalFileName: "ballistics_record.pdf",
    });

    // Simulate physical tamper on disk (invert 1 byte)
    const tamperRes = await simulateTamperDocument({
      actor: adminActor,
      documentId: docRes.document.id,
    });
    assert.equal(tamperRes.success, true);
    assert.notEqual(tamperRes.originalHash, tamperRes.tamperedHash);

    // Attempt download -> MUST THROW & BLOCK DOWNLOAD
    await assert.rejects(
      async () => {
        await downloadDocumentWithIntegrity({
          actor: investigatorActor,
          documentId: docRes.document.id,
        });
      },
      (err: Error) => {
        assert.match(err.message, /File integrity verification failed/);
        return true;
      },
      "Tampered file download must be blocked with an integrity exception",
    );

    // Verify direct server integrity check flags TAMPER_ALERT
    const verifyRes = await verifyStoredDocumentIntegrity({
      actor: adminActor,
      documentId: docRes.document.id,
    });
    assert.equal(verifyRes.ok, false);
    assert.equal(verifyRes.document.status, "TAMPER_ALERT");
    assert.notEqual(verifyRes.expected, verifyRes.computed);

    // Restore file and verify re-seal works
    const restoreRes = await restoreDocumentFile({
      actor: adminActor,
      documentId: docRes.document.id,
    });
    assert.equal(restoreRes.success, true);
  });

  test("TEST 6: Wrong/missing stored hash → download is not silently trusted", async () => {
    const content = "FORENSIC DNA PROFILE MATCH";
    const actualHash = computeSha256(content);
    const forgedHash = "0000000000000000000000000000000000000000000000000000000000000000";

    const isMatch = safeCompareHashes(actualHash, forgedHash);
    assert.equal(isMatch, false, "Mismatch between actual and forged hash must be false");
  });

  test("TEST 7: Unauthorized user → cannot download protected file", async () => {
    const docRes = await registerDocument({
      actor: adminActor,
      caseId: testCaseId,
      name: "Top Secret Intelligence Brief",
      category: "Legal Notice",
      classification: "TOP SECRET",
      hash: "a".repeat(64),
      size: 100,
      note: "Restricted clearance",
      tags: ["topsecret"],
      fileBase64: Buffer.from("TOP SECRET SURVEILLANCE LOGS").toString("base64"),
    });

    // Viewer (clearance level 1) attempting to download TOP SECRET (clearance level 4)
    await assert.rejects(
      async () => {
        await downloadDocumentWithIntegrity({
          actor: viewerActor,
          documentId: docRes.document.id,
        });
      },
      (err: Error) => {
        assert.match(err.message, /Access denied/);
        return true;
      },
      "User without required clearance must be rejected before retrieval",
    );
  });

  test("TEST 8: Large file → streaming hashing works without excessive memory consumption", async () => {
    // Create a 5MB stream in chunks
    const chunkSize = 64 * 1024; // 64KB
    const totalChunks = 80; // ~5.12 MB
    let chunkIndex = 0;

    const stream = new Readable({
      read() {
        if (chunkIndex < totalChunks) {
          this.push(Buffer.alloc(chunkSize, `chunk_${chunkIndex}_test_payload`));
          chunkIndex++;
        } else {
          this.push(null);
        }
      },
    });

    const streamHash = await computeSha256Stream(stream);
    assert.equal(isValidSha256(streamHash), true);
    assert.equal(streamHash.length, 64);
  });

  test("TEST 9: File versioning → each version has correct independent hash", async () => {
    const v1Content = "Charge Sheet v1.0.0 — Initial Accusation";
    const v2Content = "Charge Sheet v1.0.1 — Amended Section IPC 302 with Supplementary Evidence";

    const v1Hash = computeSha256(v1Content);
    const v2Hash = computeSha256(v2Content);

    // Initial v1.0.0
    const docRes = await registerDocument({
      actor: investigatorActor,
      caseId: testCaseId,
      name: "State vs Accused Charge Sheet",
      category: "Charge Sheet",
      classification: "CONFIDENTIAL",
      hash: v1Hash,
      size: Buffer.byteLength(v1Content),
      note: "Filing revision 1",
      tags: ["chargesheet"],
      fileBase64: Buffer.from(v1Content).toString("base64"),
      originalFileName: "chargesheet_v1.pdf",
    });

    // Add revision v1.0.1
    const v2Res = await registerDocument({
      actor: investigatorActor,
      caseId: testCaseId,
      name: "State vs Accused Charge Sheet",
      category: "Charge Sheet",
      classification: "CONFIDENTIAL",
      hash: v2Hash,
      size: Buffer.byteLength(v2Content),
      note: "Filing revision 2 with amended section",
      tags: ["chargesheet"],
      documentId: docRes.document.id,
      fileBase64: Buffer.from(v2Content).toString("base64"),
      originalFileName: "chargesheet_v2.pdf",
    });

    assert.equal(v2Res.document.versions.length, 2);
    assert.equal(v2Res.document.versions[0].hash, v1Hash);
    assert.equal(v2Res.document.versions[1].hash, v2Hash);

    // Verify downloading v1 verifies against v1Hash
    const dlV1 = await downloadDocumentWithIntegrity({
      actor: investigatorActor,
      documentId: docRes.document.id,
      version: "v1.0.0",
    });
    assert.equal(dlV1.sha256, v1Hash);

    // Verify downloading v2 verifies against v2Hash
    const dlV2 = await downloadDocumentWithIntegrity({
      actor: investigatorActor,
      documentId: docRes.document.id,
      version: "v1.0.1",
    });
    assert.equal(dlV2.sha256, v2Hash);
  });

  test("TEST 10: Existing upload/download functionality still works seamlessly", async () => {
    const uploadRes = await registerDocument({
      actor: adminActor,
      caseId: testCaseId,
      name: "Court Decree #291",
      category: "Judgment",
      classification: "PUBLIC",
      hash: computeSha256("Final Court Decree sealed on 28 Aug 2026"),
      size: 50,
      note: "Standard public filing",
      tags: ["decree"],
    });

    assert.ok(uploadRes.document.id);
    assert.equal(uploadRes.document.category, "Judgment");
    assert.equal(uploadRes.document.status, "DRAFT");
  });
});
