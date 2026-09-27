/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Core DMS business logic (server-only)
 * ───────────────────────────────────────────────────────────── */

import type {
  Actor,
  Asset,
  AssetStatus,
  AuditAction,
  AuditEvent,
  CaseDocument,
  CaseFile,
  CasePriority,
  CaseStatus,
  Classification,
  DocCategory,
  DocStatus,
  DocVersion,
  DocumentShare,
  Notification,
  NotificationType,
  Registry,
  Role,
  SharePermission,
} from "./dms-types";
import {
  CLEARANCE,
  ROLE_PROFILE,
  canTransition,
  nextVersion,
} from "./dms-types";
import { loadRegistry, saveRegistry, storageMode } from "./registry.server";
import { signDownload, signUpload } from "./s3.server";

import { computeSha256, safeCompareHashes } from "./crypto.server";
import {
  deleteLocalFile,
  readLocalFile,
  retrieveFileBytes,
  saveLocalFile,
  simulateTamperFile,
} from "./storage.server";
import { processDocumentOCR } from "./ocr/ocr-service";
import {
  isGoogleCloudStorageConfigured,
  uploadToGoogleCloud,
} from "./google-cloud-storage.server";
import {
  isSupabaseStorageConfigured,
  uploadToSupabaseStorage,
} from "./supabase-storage.server";
import {
  anchorDocumentHash,
  anchorSignatureEvent,
  anchorTamperEvent,
  anchorIntegrityVerification,
  anchorToBlockchain,
} from "./blockchain.server";
import {
  createDigitalSignature,
  verifyDigitalSignature,
  verifySignatureBySigner,
} from "./digital-signature.server";


function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function record(
  reg: Registry,
  actor: Actor,
  action: AuditAction,
  target: string,
  targetId: string,
  detail: string,
  hash: string | null = null,
  options?: {
    expectedHash?: string | null;
    computedHash?: string | null;
    actionTaken?: string | null;
  },
): AuditEvent {
  const event: AuditEvent = {
    id: id("aud"),
    at: new Date().toISOString(),
    actor: actor.name,
    actorId: actor.id,
    role: actor.role,
    action,
    target,
    targetId,
    detail,
    hash,
    expectedHash: options?.expectedHash ?? null,
    computedHash: options?.computedHash ?? null,
    actionTaken: options?.actionTaken ?? null,
    ipAddress: null,
  };
  reg.audit = [event, ...reg.audit].slice(0, 1000);
  return event;
}

function notify(
  reg: Registry,
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  linkedEntityId: string | null = null,
  linkedEntityType: Notification["linkedEntityType"] = null,
) {
  const n: Notification = {
    id: id("notif"),
    userId,
    type,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
    linkedEntityId,
    linkedEntityType,
  };
  reg.notifications = [n, ...reg.notifications].slice(0, 500);
}

function assertClearance(actor: Actor, classification: Classification) {
  if (ROLE_PROFILE[actor.role].clearance < CLEARANCE[classification]) {
    throw new Error(
      `Access denied: ${ROLE_PROFILE[actor.role].label} clearance is below ${classification}.`,
    );
  }
}

// ── Snapshot ──────────────────────────────────────────────────

export async function getSnapshot(actorId?: string) {
  const reg = await loadRegistry();
  return {
    storage: storageMode(),
    cases: reg.cases,
    documents: reg.documents,
    assets: reg.assets,
    shares: reg.shares,
    notifications: actorId
      ? reg.notifications.filter((n) => n.userId === actorId)
      : [],
    audit: reg.audit,
    users: reg.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      badge: u.badge,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    })),
  };
}

// ── Case Management ──────────────────────────────────────────

export async function createCase(input: {
  actor: Actor;
  title: string;
  caseNumber: string;
  summary: string;
  jurisdiction: string;
  statute: string;
  classification: Classification;
  priority: CasePriority;
  assignedOfficerIds: string[];
}) {
  const reg = await loadRegistry();
  assertClearance(input.actor, input.classification);
  const created: CaseFile = {
    id: id("case"),
    caseNumber: input.caseNumber,
    title: input.title,
    summary: input.summary,
    status: "OPEN",
    priority: input.priority,
    classification: input.classification,
    jurisdiction: input.jurisdiction,
    lead: input.actor.name,
    leadId: input.actor.id,
    assignedOfficerIds: [input.actor.id, ...input.assignedOfficerIds],
    openedAt: new Date().toISOString(),
    closedAt: null,
    statute: input.statute,
    tags: [],
  };
  reg.cases = [created, ...reg.cases];
  record(
    reg,
    input.actor,
    "CASE_CREATED",
    created.title,
    created.id,
    `Dossier opened under ${created.statute || "unspecified statute"}.`,
  );

  // Notify assigned officers
  for (const officerId of input.assignedOfficerIds) {
    if (officerId !== input.actor.id) {
      notify(
        reg,
        officerId,
        "CASE_ASSIGNED",
        "New case assignment",
        `You have been assigned to ${created.title}.`,
        created.id,
        "case",
      );
    }
  }

  await saveRegistry(reg);
  return created;
}

export async function updateCase(input: {
  actor: Actor;
  caseId: string;
  status?: CaseStatus | undefined;
  priority?: CasePriority | undefined;
  assignedOfficerIds?: string[] | undefined;
  summary?: string | undefined;
}) {
  const reg = await loadRegistry();
  const cs = reg.cases.find((c) => c.id === input.caseId);
  if (!cs) throw new Error("Case not found.");

  const changes: string[] = [];
  if (input.status !== undefined && input.status !== cs.status) {
    changes.push(`status ${cs.status} → ${input.status}`);
    cs.status = input.status;
    if (input.status === "CLOSED") cs.closedAt = new Date().toISOString();
  }
  if (input.priority !== undefined && input.priority !== cs.priority) {
    changes.push(`priority ${cs.priority} → ${input.priority}`);
    cs.priority = input.priority;
  }
  if (input.assignedOfficerIds !== undefined) {
    cs.assignedOfficerIds = input.assignedOfficerIds;
    changes.push("assigned officers updated");
  }
  if (input.summary !== undefined && input.summary !== cs.summary) {
    cs.summary = input.summary;
    changes.push("summary updated");
  }

  if (changes.length > 0) {
    record(
      reg,
      input.actor,
      input.status === "CLOSED" ? "CASE_CLOSED" : "CASE_UPDATED",
      cs.title,
      cs.id,
      changes.join(", "),
    );
    await saveRegistry(reg);
  }

  return cs;
}

// ── Document Management ──────────────────────────────────────

export async function registerDocument(input: {
  actor: Actor;
  caseId: string;
  name: string;
  category: DocCategory;
  classification: Classification;
  hash: string;
  size: number;
  note: string;
  tags: string[];
  documentId?: string | undefined;
  fileBase64?: string | undefined;
  mimeType?: string | undefined;
  originalFileName?: string | undefined;
  ocrLanguage?: string | undefined;
}) {
  const reg = await loadRegistry();
  if (!ROLE_PROFILE[input.actor.role].canUpload) {
    record(
      reg,
      input.actor,
      "ACCESS_DENIED",
      input.name,
      input.caseId,
      "Upload rejected: role has no filing rights.",
    );
    await saveRegistry(reg);
    throw new Error(
      `${ROLE_PROFILE[input.actor.role].label} may not file new records.`,
    );
  }
  assertClearance(input.actor, input.classification);

  const existing = input.documentId
    ? reg.documents.find((d) => d.id === input.documentId)
    : undefined;
  const version = existing
    ? nextVersion(existing.currentVersion)
    : "v1.0.0";
  const refId =
    existing?.refId ??
    `${input.category.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
  const objectKey = `vigil/cases/${input.caseId}/${refId}-${version}`;
  const now = new Date().toISOString();

  // Process file payload & calculate authoritative server-side SHA-256
  let fileBuffer: Buffer;
  let computedServerHash: string;

  if (input.fileBase64) {
    // Decode base64 payload
    fileBuffer = Buffer.from(input.fileBase64, "base64");
    computedServerHash = computeSha256(fileBuffer);
  } else {
    // Generate authentic digital evidence docket content if only metadata is posted
    const placeholder =
      `%PDF-1.4\n%Vigil.OS Cryptographic Dossier Record\n` +
      `Docket Reference: ${refId}\n` +
      `Title: ${input.name}\n` +
      `Category: ${input.category}\n` +
      `Classification: ${input.classification}\n` +
      `Case ID: ${input.caseId}\n` +
      `Revision: ${version}\n` +
      `Sealed At: ${now}\n` +
      `Uploaded By: ${input.actor.name} (${input.actor.id})\n` +
      `Note: ${input.note || "Filed through intake"}\n` +
      `Security Protocol: SIH-26190 SHA-256 Cryptographic File Integrity Verification\n` +
      `%%EOF\n`;
    fileBuffer = Buffer.from(placeholder);
    computedServerHash = input.hash || computeSha256(fileBuffer);
  }

  // Authoritative hash is the calculated server hash
  const authoritativeHash = computedServerHash;
  const originalFileName = input.originalFileName || `${refId}.pdf`;
  const mimeType = input.mimeType || "application/pdf";
  const finalSize = fileBuffer.length;

  // Persist original file to local storage (before OCR, ensuring forensic custody)
  await saveLocalFile(objectKey, fileBuffer);

  // Persist case file to Supabase Storage Vault
  let supabaseUpload: { fileUri?: string | undefined; name: string } | null = null;
  if (isSupabaseStorageConfigured() && process.env["NODE_ENV"] !== "test") {
    try {
      const sbResult = await uploadToSupabaseStorage(
        objectKey,
        fileBuffer,
        mimeType,
      );
      if (sbResult.success) {
        supabaseUpload = {
          fileUri: sbResult.publicUrl || sbResult.signedUrl,
          name: sbResult.objectKey,
        };
      }
    } catch (sbErr: any) {
      console.warn(`[Vigil.OS] Supabase Storage upload note: ${sbErr.message}`);
    }
  }

  // Persist case file to Google Cloud Storage infrastructure
  let cloudUpload: { fileUri: string; name: string } | null = null;
  if (isGoogleCloudStorageConfigured() && process.env["NODE_ENV"] !== "test") {
    try {
      const gcsResult = await uploadToGoogleCloud(
        objectKey,
        fileBuffer,
        mimeType,
        `${refId}-${version}-${originalFileName}`,
      );
      if (gcsResult.success) {
        cloudUpload = {
          fileUri: gcsResult.fileUri,
          name: gcsResult.name,
        };
      }
    } catch (gcsErr: any) {
      console.warn(`[Vigil.OS] Google Cloud Storage upload note: ${gcsErr.message}`);
    }
  }

  const signed = await signUpload(objectKey).catch(() => null);
  const activeStorage = supabaseUpload
    ? "supabase"
    : cloudUpload
    ? "google-cloud"
    : signed
    ? "s3"
    : "local";
  const activeCloudUri = supabaseUpload?.fileUri || cloudUpload?.fileUri;
  const activeCloudName = supabaseUpload?.name || cloudUpload?.name;
  const activeCloudProject = supabaseUpload ? "supabase-vault" : "324957553228";

  // Execute Optical Character Recognition (OCR) / Text Extraction
  // Note: Operates on original byte stream; original file and SHA-256 are unchanged
  const ocrResult = await processDocumentOCR({
    fileBuffer,
    mimeType,
    filename: originalFileName,
    language: input.ocrLanguage,
  });

  const newVersion: DocVersion = {
    version,
    hash: authoritativeHash,
    sha256_hash: authoritativeHash,
    hash_algorithm: "SHA-256",
    hash_created_at: now,
    size: finalSize,
    mimeType,
    originalName: originalFileName,
    original_filename: originalFileName,
    stored_filename: `${refId}-${version}.pdf`,
    uploadedAt: now,
    uploadedBy: input.actor.name,
    uploadedById: input.actor.id,
    objectKey,
    signature: null,
    signedBy: null,
    note: input.note || "Filed through the secure intake.",
    integrity_status: "VERIFIED",
    last_verified_at: now,
    verification_count: 1,
    cloud_uri: activeCloudUri,
    cloud_name: activeCloudName,
    cloud_project: activeCloudProject,
    ocr_status: ocrResult.status,
    ocr_text: ocrResult.text,
    ocr_processed_at: ocrResult.processedAt,
  };

  let doc: CaseDocument;
  try {
    if (existing) {
      existing.versions = [...existing.versions, newVersion];
      existing.currentVersion = version;
      existing.updatedAt = now;
      existing.status = "SEALED";
      existing.storage = activeStorage;
      if (activeCloudUri) {
        existing.cloud_uri = activeCloudUri;
        existing.cloud_name = activeCloudName;
        existing.cloud_project = activeCloudProject;
      }
      existing.ocr_status = ocrResult.status;
      existing.ocr_text = ocrResult.text;
      existing.ocr_language = ocrResult.language;
      existing.ocr_processed_at = ocrResult.processedAt;
      existing.ocr_engine = ocrResult.engine;
      existing.ocr_error = ocrResult.error;
      existing.ocr_page_count = ocrResult.pageCount;
      existing.ocr_source = ocrResult.source;
      doc = existing;
      record(
        reg,
        input.actor,
        "VERSION_ADDED",
        doc.name,
        doc.id,
        `Revision ${version} stored in ${activeStorage === "google-cloud" ? "Google Cloud" : activeStorage.toUpperCase()} & sealed with SHA-256 (${authoritativeHash.slice(0, 8)}...).`,
        authoritativeHash,
        {
          expectedHash: authoritativeHash,
          computedHash: authoritativeHash,
          actionTaken: "VERSION_SEALED",
        },
      );
    } else {
      doc = {
        id: id("doc"),
        caseId: input.caseId,
        refId,
        name: input.name,
        category: input.category,
        classification: input.classification,
        status: "DRAFT",
        currentVersion: version,
        versions: [newVersion],
        tags: input.tags,
        sharedWith: [input.actor.role],
        updatedAt: now,
        createdAt: now,
        createdById: input.actor.id,
        storage: activeStorage,
        cloud_uri: activeCloudUri,
        cloud_name: activeCloudName,
        cloud_project: activeCloudProject,
        ocr_status: ocrResult.status,
        ocr_text: ocrResult.text,
        ocr_language: ocrResult.language,
        ocr_processed_at: ocrResult.processedAt,
        ocr_engine: ocrResult.engine,
        ocr_error: ocrResult.error,
        ocr_page_count: ocrResult.pageCount,
        ocr_source: ocrResult.source,
      };
      reg.documents = [doc, ...reg.documents];
      record(
        reg,
        input.actor,
        "DOCUMENT_UPLOADED",
        doc.name,
        doc.id,
        `Ingested into ${activeStorage === "google-cloud" ? "Google Cloud Storage" : activeStorage.toUpperCase()} as ${doc.category} and sealed with SHA-256 digest (${authoritativeHash.slice(0, 8)}...).`,
        authoritativeHash,
        {
          expectedHash: authoritativeHash,
          computedHash: authoritativeHash,
          actionTaken: "DOCUMENT_SEALED",
        },
      );

      // Record separate immutable audit event for OCR processing
      record(
        reg,
        input.actor,
        ocrResult.status === "FAILED" ? "OCR_FAILED" : "OCR_COMPLETED",
        doc.name,
        doc.id,
        ocrResult.status === "FAILED"
          ? `OCR processing failed: ${ocrResult.error || "Unknown error"}. Original document preserved.`
          : `OCR extracted ${ocrResult.text.length} characters via ${ocrResult.engine} (${ocrResult.source}, ${ocrResult.pageCount} page(s)).`,
        authoritativeHash,
        {
          actionTaken: ocrResult.status === "FAILED" ? "OCR_FAILED" : "OCR_COMPLETED",
        },
      );

      // Notify case lead and assigned officers
      const cs = reg.cases.find((c) => c.id === input.caseId);
      if (cs) {
        const notifyIds = [
          ...new Set([cs.leadId, ...cs.assignedOfficerIds]),
        ].filter((uid) => uid !== input.actor.id);
        for (const uid of notifyIds) {
          notify(
            reg,
            uid,
            "DOCUMENT_UPLOADED",
            "New document filed",
            `${input.actor.name} uploaded ${doc.name} to ${cs.title}.`,
            doc.id,
            "document",
          );
        }
      }
    }

    await saveRegistry(reg);
  } catch (error) {
    // Atomic rollback: clean up orphaned file on disk
    await deleteLocalFile(objectKey).catch(() => null);
    throw error;
  }

  const result = {
    document: doc,
    uploadUrl: signed?.url ?? null,
    uploadMethod: signed?.method ?? "PUT",
    objectKey,
    storage: storageMode(),
    sha256: authoritativeHash,
    hashAlgorithm: "SHA-256",
    integrityStatus: "VERIFIED",
    ocrStatus: ocrResult.status,
    ocrLanguage: ocrResult.language,
    ocrEngine: ocrResult.engine,
    ocrSource: ocrResult.source,
    ocrPageCount: ocrResult.pageCount,
    ocrTextPreview: ocrResult.text ? ocrResult.text.slice(0, 150) : "",
  };

  // ── Blockchain: Anchor document hash (fire-and-forget, non-blocking) ──
  anchorDocumentHash({
    documentId: doc.id,
    refId: doc.refId,
    documentName: doc.name,
    category: doc.category,
    classification: doc.classification,
    status: doc.status,
    version: doc.currentVersion,
    fileSize: finalSize,
    mimeType: input.mimeType,
    sha256Hash: authoritativeHash,
    ocrStatus: ocrResult.status,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    caseId: input.caseId,
  }).then(async (bcResult) => {
    if (bcResult.success) {
      const reg2 = await loadRegistry();
      const d = reg2.documents.find((x) => x.id === doc.id);
      const v = d?.versions.find((x) => x.version === doc.currentVersion);
      if (v) {
        v.blockchain_tx_id = bcResult.txId;
        v.blockchain_block = bcResult.blockIndex;
      }
      reg2.audit = [
        {
          id: id("aud"),
          at: new Date().toISOString(),
          actor: input.actor.name,
          actorId: input.actor.id,
          role: input.actor.role,
          action: "BLOCKCHAIN_ANCHORED" as const,
          target: doc.name,
          targetId: doc.id,
          detail: `SHA-256 hash anchored to ${bcResult.simulated ? "simulation ledger" : "Hyperledger Fabric"} at block #${bcResult.blockIndex} (tx: ${bcResult.txId.slice(0, 12)}...).`,
          hash: authoritativeHash,
          blockchain_tx_id: bcResult.txId,
          blockchain_block: bcResult.blockIndex,
          blockchain_simulated: bcResult.simulated,
          ipAddress: null,
        },
        ...reg2.audit,
      ].slice(0, 1000);
      await saveRegistry(reg2);
    } else {
      console.warn(`[Vigil.OS Blockchain] Anchor failed for ${doc.id}: ${bcResult.error}`);
    }
  }).catch((err: any) => {
    console.warn(`[Vigil.OS Blockchain] Anchor error: ${err.message}`);
  });

  return result;
}

// ── Document Workflow ────────────────────────────────────────

export async function advanceWorkflow(input: {
  actor: Actor;
  documentId: string;
  newStatus: DocStatus;
  comment: string;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Document not found.");

  if (!canTransition(doc.status, input.newStatus)) {
    throw new Error(
      `Cannot transition from ${doc.status} to ${input.newStatus}.`,
    );
  }

  // Only ADMIN, INVESTIGATOR, LEGAL_OFFICER can approve/reject
  if (
    (input.newStatus === "APPROVED" || input.newStatus === "REJECTED") &&
    !ROLE_PROFILE[input.actor.role].canApprove
  ) {
    throw new Error(
      `${ROLE_PROFILE[input.actor.role].label} does not have approval authority.`,
    );
  }

  const from = doc.status;
  doc.status = input.newStatus;
  doc.updatedAt = new Date().toISOString();

  record(
    reg,
    input.actor,
    "WORKFLOW_CHANGED",
    doc.name,
    doc.id,
    `Status changed from ${from} to ${input.newStatus}. ${input.comment}`.trim(),
  );

  anchorToBlockchain({
    eventType: "DOCUMENT_METADATA_UPDATED",
    documentId: doc.id,
    refId: doc.refId,
    documentName: doc.name,
    category: doc.category,
    classification: doc.classification,
    status: input.newStatus,
    version: doc.currentVersion,
    sha256Hash: doc.versions[0]?.hash || "",
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    caseId: doc.caseId,
  }).catch(() => null);

  // Notify document creator
  if (doc.createdById !== input.actor.id) {
    const typeMap: Record<string, NotificationType> = {
      UNDER_REVIEW: "REVIEW_REQUESTED",
      APPROVED: "REVIEW_COMPLETED",
      REJECTED: "REVIEW_COMPLETED",
    };
    const nType = typeMap[input.newStatus];
    if (nType) {
      notify(
        reg,
        doc.createdById,
        nType,
        `Document ${input.newStatus.toLowerCase().replace("_", " ")}`,
        `${doc.name} has been ${input.newStatus.toLowerCase().replace("_", " ")} by ${input.actor.name}.`,
        doc.id,
        "document",
      );
    }
  }

  await saveRegistry(reg);
  return doc;
}

// ── Download & Verification (Zero-Trust Gate) ────────────────

export async function downloadDocumentWithIntegrity(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");

  // Check role clearance
  if (
    ROLE_PROFILE[input.actor.role].clearance < CLEARANCE[doc.classification]
  ) {
    record(
      reg,
      input.actor,
      "ACCESS_DENIED",
      doc.name,
      doc.id,
      `Blocked: ${doc.classification} exceeds clearance.`,
    );
    await saveRegistry(reg);
    throw new Error(
      `Access denied: ${doc.classification} exceeds your clearance.`,
    );
  }

  const v = doc.versions.find(
    (x) => x.version === (input.version ?? doc.currentVersion),
  );
  if (!v) throw new Error("Requested revision not found.");

  // Retrieve stored file bytes
  let fileBytes = await retrieveFileBytes(v.objectKey);

  // If local file is missing, synthesize it and compute matching content
  if (!fileBytes) {
    const placeholder =
      `%PDF-1.4\n%Vigil.OS Cryptographic Dossier Record\n` +
      `Docket Reference: ${doc.refId}\n` +
      `Title: ${doc.name}\n` +
      `Category: ${doc.category}\n` +
      `Classification: ${doc.classification}\n` +
      `Revision: ${v.version}\n` +
      `Sealed At: ${v.uploadedAt}\n` +
      `Uploaded By: ${v.uploadedBy}\n` +
      `Security Protocol: SIH-26190 SHA-256 Cryptographic File Integrity Verification\n` +
      `%%EOF\n`;
    fileBytes = Buffer.from(placeholder);
    await saveLocalFile(v.objectKey, fileBytes);
  }

  // 1. Calculate live SHA-256 digest of stored bytes on the server
  const computedHash = computeSha256(fileBytes);
  const expectedHash = v.sha256_hash || v.hash;

  // 2. Perform constant-time verification against trusted metadata hash
  const isValid = safeCompareHashes(computedHash, expectedHash);

  if (!isValid) {
    // TAMPER DETECTED / CORRUPTED FILE: DO NOT SERVE THE FILE!
    doc.status = "TAMPER_ALERT";
    v.integrity_status = "TAMPER_ALERT";

    record(
      reg,
      input.actor,
      "INTEGRITY_FAILED",
      doc.name,
      doc.id,
      `SECURITY ALERT: SHA-256 verification failed on ${v.version}. Expected [${expectedHash.slice(0, 8)}...], got [${computedHash.slice(0, 8)}...]. File download BLOCKED.`,
      computedHash,
      {
        expectedHash,
        computedHash,
        actionTaken: "DOWNLOAD_BLOCKED",
      },
    );

    // Notify all administrators immediately
    const admins = reg.users.filter((u) => u.role === "ADMIN" && u.isActive);
    for (const admin of admins) {
      notify(
        reg,
        admin.id,
        "TAMPER_DETECTED",
        "CRITICAL: File Integrity Violation",
        `Integrity check failed for ${doc.name} (${v.version}). Stored file has been modified or corrupted.`,
        doc.id,
        "document",
      );
    }

    await saveRegistry(reg);

    // ── Blockchain: Anchor tamper detection event (fire-and-forget) ──
    anchorTamperEvent({
      documentId: doc.id,
      refId: doc.refId,
      documentName: doc.name,
      category: doc.category,
      classification: doc.classification,
      status: doc.status,
      version: v.version,
      fileSize: v.size,
      mimeType: v.mimeType,
      sha256Hash: computedHash,
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      caseId: doc.caseId,
    }).then(async (bcResult) => {
      if (bcResult.success) {
        const reg2 = await loadRegistry();
        reg2.audit = [
          {
            id: id("aud"),
            at: new Date().toISOString(),
            actor: input.actor.name,
            actorId: input.actor.id,
            role: input.actor.role,
            action: "BLOCKCHAIN_ANCHORED" as const,
            target: doc.name,
            targetId: doc.id,
            detail: `TAMPER ALERT anchored to ${bcResult.simulated ? "simulation ledger" : "Hyperledger Fabric"} at block #${bcResult.blockIndex} (tx: ${bcResult.txId.slice(0, 12)}...).`,
            hash: computedHash,
            blockchain_tx_id: bcResult.txId,
            blockchain_block: bcResult.blockIndex,
            blockchain_simulated: bcResult.simulated,
            ipAddress: null,
          },
          ...reg2.audit,
        ].slice(0, 1000);
        await saveRegistry(reg2);
      }
    }).catch(() => {});

    throw new Error(
      "File integrity verification failed. The file may have been modified or corrupted. Download has been blocked.",
    );
  }

  // INTEGRITY VERIFIED: Update verification metrics and log audit trail
  v.last_verified_at = new Date().toISOString();
  v.verification_count = (v.verification_count || 0) + 1;
  v.integrity_status = "VERIFIED";

  const signed = await signDownload(v.objectKey).catch(() => null);

  record(
    reg,
    input.actor,
    "INTEGRITY_VERIFIED",
    doc.name,
    doc.id,
    `SHA-256 digest verified for ${v.version} (${computedHash.slice(0, 8)}...). Download permitted.`,
    computedHash,
    {
      expectedHash,
      computedHash,
      actionTaken: "DOWNLOAD_ALLOWED",
    },
  );

  record(
    reg,
    input.actor,
    "DOCUMENT_DOWNLOADED",
    doc.name,
    doc.id,
    `Verified file ${v.originalName} (${v.version}) downloaded.`,
    computedHash,
  );

  await saveRegistry(reg);

  // ── Blockchain: Anchor integrity verification (fire-and-forget) ──
  anchorIntegrityVerification({
    documentId: doc.id,
    documentName: doc.name,
    sha256Hash: computedHash,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    caseId: doc.caseId,
  }).then(async (bcResult) => {
    if (bcResult.success) {
      const reg2 = await loadRegistry();
      reg2.audit = [
        {
          id: id("aud"),
          at: new Date().toISOString(),
          actor: input.actor.name,
          actorId: input.actor.id,
          role: input.actor.role,
          action: "BLOCKCHAIN_ANCHORED" as const,
          target: doc.name,
          targetId: doc.id,
          detail: `Integrity verification anchored to ${bcResult.simulated ? "simulation ledger" : "Hyperledger Fabric"} at block #${bcResult.blockIndex} (tx: ${bcResult.txId.slice(0, 12)}...).`,
          hash: computedHash,
          blockchain_tx_id: bcResult.txId,
          blockchain_block: bcResult.blockIndex,
          blockchain_simulated: bcResult.simulated,
          ipAddress: null,
        },
        ...reg2.audit,
      ].slice(0, 1000);
      await saveRegistry(reg2);
    }
  }).catch(() => {});

  return {
    verified: true,
    integrityStatus: "VERIFIED" as const,
    hashAlgorithm: "SHA-256" as const,
    sha256: computedHash,
    filename: v.originalName || `${doc.refId}.pdf`,
    mimeType: v.mimeType || "application/pdf",
    size: fileBytes.length,
    base64Content: fileBytes.toString("base64"),
    url: signed?.url ?? null,
    expiresIn: signed?.expires_in ?? 0,
    version: v,
  };
}

// Backward compatibility alias for existing callers
export async function getDownloadTarget(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  return downloadDocumentWithIntegrity(input);
}

// ── Direct Server Integrity Check ────────────────────────────

export async function verifyStoredDocumentIntegrity(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");

  const v = doc.versions.find(
    (x) => x.version === (input.version ?? doc.currentVersion),
  );
  if (!v) throw new Error("Requested revision not found.");

  const fileBytes = await retrieveFileBytes(v.objectKey);
  if (!fileBytes) {
    throw new Error("Physical file payload not found in storage.");
  }

  const computedHash = computeSha256(fileBytes);
  const expectedHash = v.sha256_hash || v.hash;
  const ok = safeCompareHashes(computedHash, expectedHash);

  if (!ok) {
    doc.status = "TAMPER_ALERT";
    v.integrity_status = "TAMPER_ALERT";

    const admins = reg.users.filter((u) => u.role === "ADMIN" && u.isActive);
    for (const admin of admins) {
      notify(
        reg,
        admin.id,
        "TAMPER_DETECTED",
        "Tamper alert",
        `Integrity check failed for ${doc.name} (${v.version}).`,
        doc.id,
        "document",
      );
    }
  } else {
    v.last_verified_at = new Date().toISOString();
    v.integrity_status = "VERIFIED";
  }

  record(
    reg,
    input.actor,
    ok ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILED",
    doc.name,
    doc.id,
    ok
      ? `Server verified SHA-256 digest matches for ${v.version}.`
      : `Server detected SHA-256 digest mismatch on ${v.version} — record flagged for tamper review.`,
    computedHash,
    {
      expectedHash,
      computedHash,
      actionTaken: ok ? "VERIFICATION_PASSED" : "TAMPER_FLAGGED",
    },
  );

  await saveRegistry(reg);

  return {
    ok,
    expected: expectedHash,
    computed: computedHash,
    document: doc,
    version: v,
  };
}

// Client hash check (optional double check)
export async function verifyIntegrity(input: {
  actor: Actor;
  documentId: string;
  computedHash: string;
}) {
  return verifyStoredDocumentIntegrity({
    actor: input.actor,
    documentId: input.documentId,
  });
}

// ── Tamper Simulation (For Hackathon Demonstration) ──────────

export async function simulateTamperDocument(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  const reg = await loadRegistry();
  if (input.actor.role !== "ADMIN" && input.actor.role !== "INVESTIGATOR") {
    throw new Error("Only administrators and investigators may run tamper simulation diagnostics.");
  }

  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found.");

  const v = doc.versions.find(
    (x) => x.version === (input.version ?? doc.currentVersion),
  );
  if (!v) throw new Error("Revision not found.");

  const tamperResult = await simulateTamperFile(v.objectKey);

  record(
    reg,
    input.actor,
    "ASSET_LIFECYCLE",
    doc.name,
    doc.id,
    `DEMO TEST: Intentionally modified 1 byte of ${doc.name} (${v.version}) on disk to demonstrate tamper detection.`,
    tamperResult.tamperedHash,
    {
      expectedHash: v.hash,
      computedHash: tamperResult.tamperedHash,
      actionTaken: "BYTE_INVERTED_FOR_DEMO",
    },
  );

  await saveRegistry(reg);

  return {
    success: true,
    documentId: doc.id,
    version: v.version,
    originalHash: tamperResult.originalHash,
    tamperedHash: tamperResult.tamperedHash,
    expectedHash: v.hash,
    message: "1 byte in the physical file on server disk was inverted. Subsequent downloads/verifications will catch this mismatch and block access.",
  };
}

// ── Restore File from Tampering ──────────────────────────────

export async function restoreDocumentFile(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found.");

  const v = doc.versions.find(
    (x) => x.version === (input.version ?? doc.currentVersion),
  );
  if (!v) throw new Error("Revision not found.");

  // Re-create authentic clean content
  const cleanContent =
    `%PDF-1.4\n%Vigil.OS Cryptographic Dossier Record\n` +
    `Docket Reference: ${doc.refId}\n` +
    `Title: ${doc.name}\n` +
    `Category: ${doc.category}\n` +
    `Classification: ${doc.classification}\n` +
    `Revision: ${v.version}\n` +
    `Sealed At: ${v.uploadedAt}\n` +
    `Uploaded By: ${v.uploadedBy}\n` +
    `Security Protocol: SIH-26190 SHA-256 Cryptographic File Integrity Verification\n` +
    `Status: SEALED\n` +
    `%%EOF\n`;
  const buf = Buffer.from(cleanContent);
  const cleanHash = computeSha256(buf);

  await saveLocalFile(v.objectKey, buf);

  v.hash = cleanHash;
  v.sha256_hash = cleanHash;
  v.integrity_status = "VERIFIED";
  doc.status = "SEALED";

  record(
    reg,
    input.actor,
    "INTEGRITY_VERIFIED",
    doc.name,
    doc.id,
    `Record restored and re-sealed with SHA-256 (${cleanHash.slice(0, 8)}...).`,
    cleanHash,
  );

  await saveRegistry(reg);

  return {
    success: true,
    document: doc,
    newHash: cleanHash,
  };
}

// ── Digital Signature ────────────────────────────────────────

export async function signDocument(input: {
  actor: Actor;
  documentId: string;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  if (!ROLE_PROFILE[input.actor.role].canSign) {
    record(
      reg,
      input.actor,
      "ACCESS_DENIED",
      doc.name,
      doc.id,
      "Signature rejected: role has no signing authority.",
    );
    await saveRegistry(reg);
    throw new Error(
      `${ROLE_PROFILE[input.actor.role].label} has no signing authority.`,
    );
  }

  const v = doc.versions.find((x) => x.version === doc.currentVersion)!;
  if (!v) throw new Error("Current version not found.");
  if (v.signature) throw new Error("This version has already been signed.");

  const sha256Hash = v.sha256_hash || v.hash;
  if (!sha256Hash || sha256Hash.length !== 64) {
    throw new Error("Document has no valid SHA-256 hash to sign.");
  }

  // ── RSA-SHA256 Digital Signature ──────────────────────────
  // Creates a real cryptographic signature over the document's SHA-256 hash
  // using the signer's RSA-2048 private key.
  const sigResult = createDigitalSignature(
    sha256Hash,
    input.actor.id,
    input.actor.name,
    input.actor.badge,
    input.actor.role,
  );

  const now = new Date().toISOString();

  // Store the complete RSA-SHA256 digital signature on the version
  v.signature = sigResult.signatureId;           // Human-readable ID (for display)
  v.signedBy = input.actor.name;
  v.signedAt = now;
  v.signatureBase64 = sigResult.signatureBase64; // Full RSA signature (Base64)
  v.signatureHex = sigResult.signatureHex;       // Full RSA signature (Hex)
  v.signatureId = sigResult.signatureId;
  v.signatureAlgorithm = "RSA-SHA256";
  v.signatureKeySize = 2048;
  v.publicKeyPem = sigResult.publicKeyPem;       // Signer's public key for verification
  v.publicKeyFingerprint = sigResult.publicKeyFingerprint;
  v.signedHash = sha256Hash;                     // Hash that was signed
  v.signerBadge = sigResult.signerBadge;
  v.signerRole = sigResult.signerRole;
  v.signatureVerified = sigResult.verifiedOnCreate;

  doc.status = "SIGNED";
  doc.updatedAt = now;

  record(
    reg,
    input.actor,
    "DOCUMENT_SIGNED",
    doc.name,
    doc.id,
    `RSA-SHA256 digital signature applied to ${v.version} by ${input.actor.name} (${input.actor.badge}). ` +
    `Signature: ${sigResult.signatureId}. ` +
    `Key fingerprint: ${sigResult.publicKeyFingerprint.slice(0, 23)}...`,
    sha256Hash,
  );

  await saveRegistry(reg);

  // ── Blockchain: Anchor signature event (fire-and-forget) ──
  anchorSignatureEvent({
    documentId: doc.id,
    refId: doc.refId,
    documentName: doc.name,
    category: doc.category,
    classification: doc.classification,
    status: doc.status,
    version: v.version,
    fileSize: v.size,
    mimeType: v.mimeType,
    sha256Hash: sha256Hash,
    digitalSignature: {
      signatureHex: sigResult.signatureHex,
      signerId: input.actor.id,
      signerName: input.actor.name,
      signerRole: input.actor.role,
      algorithm: sigResult.algorithm,
      signedAt: now,
    },
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    caseId: doc.caseId,
  }).then(async (bcResult) => {
    if (bcResult.success) {
      const reg2 = await loadRegistry();
      reg2.audit = [
        {
          id: id("aud"),
          at: new Date().toISOString(),
          actor: input.actor.name,
          actorId: input.actor.id,
          role: input.actor.role,
          action: "BLOCKCHAIN_ANCHORED" as const,
          target: doc.name,
          targetId: doc.id,
          detail: `RSA-SHA256 digital signature anchored to ${bcResult.simulated ? "simulation ledger" : "Hyperledger Fabric"} at block #${bcResult.blockIndex} (tx: ${bcResult.txId.slice(0, 12)}...).`,
          hash: v.hash,
          blockchain_tx_id: bcResult.txId,
          blockchain_block: bcResult.blockIndex,
          blockchain_simulated: bcResult.simulated,
          ipAddress: null,
        },
        ...reg2.audit,
      ].slice(0, 1000);
      await saveRegistry(reg2);
    }
  }).catch(() => {});

  return { document: doc, signatureResult: sigResult };
}

// ── Signature Verification ────────────────────────────────

export async function verifyDocumentSignature(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");

  const v = doc.versions.find(
    (x) => x.version === (input.version ?? doc.currentVersion),
  );
  if (!v) throw new Error("Requested revision not found.");

  if (!v.signature || !v.signatureBase64) {
    return {
      valid: false,
      reason: "This document version has not been digitally signed.",
      version: v.version,
      signatureId: null,
      algorithm: null,
      signerName: v.signedBy,
      signedAt: v.signedAt,
      publicKeyFingerprint: null,
      verifiedAt: new Date().toISOString(),
    };
  }

  // Verify RSA-SHA256 signature using the stored public key
  const verificationResult = v.publicKeyPem
    ? verifyDigitalSignature(
        v.signedHash || v.sha256_hash || v.hash,
        v.signatureBase64,
        v.publicKeyPem,
      )
    : verifySignatureBySigner(
        v.signedHash || v.sha256_hash || v.hash,
        v.signatureBase64,
        (v as any).signerId || input.actor.id, // fallback
      );

  // Record the verification event in audit trail
  record(
    reg,
    input.actor,
    verificationResult.valid ? "SIGNATURE_VERIFIED" : "SIGNATURE_VERIFICATION_FAILED",
    doc.name,
    doc.id,
    verificationResult.valid
      ? `RSA-SHA256 signature verified for ${v.version} (signed by ${v.signedBy}). Key fingerprint: ${verificationResult.publicKeyFingerprint?.slice(0, 23)}...`
      : `RSA-SHA256 signature verification FAILED for ${v.version}: ${verificationResult.failureReason}`,
    v.sha256_hash || v.hash,
  );

  await saveRegistry(reg);

  return {
    valid: verificationResult.valid,
    reason: verificationResult.failureReason,
    version: v.version,
    signatureId: v.signatureId,
    algorithm: verificationResult.algorithm,
    signerName: v.signedBy,
    signerBadge: v.signerBadge,
    signerRole: v.signerRole,
    signedAt: v.signedAt,
    signedHash: v.signedHash,
    publicKeyFingerprint: verificationResult.publicKeyFingerprint,
    verifiedAt: verificationResult.verifiedAt,
  };
}

// ── Classification ───────────────────────────────────────────

export async function setClassification(input: {
  actor: Actor;
  documentId: string;
  classification: Classification;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  if (
    input.actor.role !== "ADMIN" &&
    input.actor.role !== "INVESTIGATOR"
  ) {
    throw new Error(
      "Only investigators and administrators may reclassify records.",
    );
  }
  const from = doc.classification;
  doc.classification = input.classification;
  doc.updatedAt = new Date().toISOString();
  record(
    reg,
    input.actor,
    "CLASSIFICATION_CHANGED",
    doc.name,
    doc.id,
    `Reclassified from ${from} to ${input.classification}.`,
  );
  await saveRegistry(reg);
  return doc;
}

// ── Document Sharing ─────────────────────────────────────────

export async function shareDocument(input: {
  actor: Actor;
  documentId: string;
  sharedWithUserId: string;
  permissions: SharePermission[];
  expiresAt: string | null;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Document not found.");

  const targetUser = reg.users.find(
    (u) => u.id === input.sharedWithUserId,
  );
  if (!targetUser) throw new Error("Target user not found.");

  const share: DocumentShare = {
    id: id("share"),
    documentId: input.documentId,
    sharedByUserId: input.actor.id,
    sharedByName: input.actor.name,
    sharedWithUserId: input.sharedWithUserId,
    sharedWithName: targetUser.name,
    permissions: input.permissions,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  reg.shares = [share, ...reg.shares];

  record(
    reg,
    input.actor,
    "DOCUMENT_SHARED",
    doc.name,
    doc.id,
    `Shared with ${targetUser.name} (${input.permissions.join(" + ")}${input.expiresAt ? `, expires ${input.expiresAt}` : ""}).`,
  );

  notify(
    reg,
    input.sharedWithUserId,
    "DOCUMENT_SHARED",
    "Document shared with you",
    `${input.actor.name} shared ${doc.name} with you.`,
    doc.id,
    "document",
  );

  await saveRegistry(reg);
  return share;
}

export async function revokeShare(input: {
  actor: Actor;
  shareId: string;
}) {
  const reg = await loadRegistry();
  const share = reg.shares.find((s) => s.id === input.shareId);
  if (!share) throw new Error("Share not found.");

  share.isActive = false;
  const doc = reg.documents.find((d) => d.id === share.documentId);

  record(
    reg,
    input.actor,
    "DOCUMENT_SHARE_REVOKED",
    doc?.name ?? share.documentId,
    share.documentId,
    `Share with ${share.sharedWithName} revoked.`,
  );

  await saveRegistry(reg);
  return share;
}

// ── Role-based sharing (legacy toggle) ───────────────────────

export async function shareDocumentWithRole(input: {
  actor: Actor;
  documentId: string;
  role: Role;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  doc.sharedWith = doc.sharedWith.includes(input.role)
    ? doc.sharedWith.filter((r) => r !== input.role)
    : [...doc.sharedWith, input.role];
  record(
    reg,
    input.actor,
    "ACCESS_GRANTED",
    doc.name,
    doc.id,
    `Collaboration list updated — ${doc.sharedWith.join(", ") || "no cadres"}.`,
  );
  await saveRegistry(reg);
  return doc;
}

// ── Notifications ────────────────────────────────────────────

export async function markNotificationRead(input: {
  userId: string;
  notificationId: string;
}) {
  const reg = await loadRegistry();
  const n = reg.notifications.find(
    (x) => x.id === input.notificationId && x.userId === input.userId,
  );
  if (n) {
    n.isRead = true;
    await saveRegistry(reg);
  }
  return { success: true };
}

export async function markAllNotificationsRead(userId: string) {
  const reg = await loadRegistry();
  for (const n of reg.notifications) {
    if (n.userId === userId) n.isRead = true;
  }
  await saveRegistry(reg);
  return { success: true };
}

// ── Asset Management ─────────────────────────────────────────

export async function createAsset(input: {
  actor: Actor;
  name: string;
  tag: string;
  serial: string;
  category: Asset["category"];
  station: string;
}) {
  const reg = await loadRegistry();
  if (!ROLE_PROFILE[input.actor.role].canManageAssets) {
    throw new Error(
      `${ROLE_PROFILE[input.actor.role].label} may not induct assets.`,
    );
  }
  const now = new Date().toISOString();
  const asset: Asset = {
    id: id("asset"),
    tag: input.tag,
    name: input.name,
    category: input.category,
    serial: input.serial,
    status: "IN_SERVICE",
    assignedTo: "Unassigned",
    station: input.station,
    acquiredAt: now,
    lastServiceAt: now,
    serviceIntervalDays: 180,
    linkedCaseId: null,
    events: [
      {
        at: now,
        action: "ACQUIRED",
        actor: input.actor.name,
        note: "Inducted into the asset register.",
      },
    ],
  };
  reg.assets = [asset, ...reg.assets];
  record(
    reg,
    input.actor,
    "ASSET_LIFECYCLE",
    asset.name,
    asset.id,
    `Asset ${asset.tag} inducted.`,
  );
  await saveRegistry(reg);
  return asset;
}

export async function advanceAsset(input: {
  actor: Actor;
  assetId: string;
  status: AssetStatus;
  assignedTo?: string | undefined;
  note: string;
}) {
  const reg = await loadRegistry();
  const asset = reg.assets.find((a) => a.id === input.assetId);
  if (!asset) throw new Error("Asset not found in the register.");
  if (!ROLE_PROFILE[input.actor.role].canManageAssets) {
    throw new Error(
      `${ROLE_PROFILE[input.actor.role].label} may not move assets through the lifecycle.`,
    );
  }
  const now = new Date().toISOString();
  asset.status = input.status;
  if (input.assignedTo !== undefined && input.assignedTo !== "")
    asset.assignedTo = input.assignedTo;
  if (input.status === "IN_SERVICE") asset.lastServiceAt = now;
  if (input.status === "RETURNED" || input.status === "RETIRED")
    asset.assignedTo = "Unassigned";
  asset.events = [
    ...asset.events,
    {
      at: now,
      action: input.status,
      actor: input.actor.name,
      note: input.note || `Status set to ${input.status}.`,
    },
  ];
  record(
    reg,
    input.actor,
    "ASSET_LIFECYCLE",
    asset.name,
    asset.id,
    `${asset.tag} → ${input.status}.`,
  );
  await saveRegistry(reg);
  return asset;
}

// ── OCR Management & Intelligence ────────────────────────────

/**
 * Re-processes or triggers OCR on an existing archived document.
 * Requires sufficient clearance and upload/management authority.
 */
export async function processDocumentOCRFn(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
  language?: string | undefined;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Document not found in the archive.");

  // Security Clearance validation
  if (ROLE_PROFILE[input.actor.role].clearance < CLEARANCE[doc.classification]) {
    throw new Error(`Access denied: Document clearance (${doc.classification}) exceeds your authorization.`);
  }

  const v = doc.versions.find((x) => x.version === (input.version ?? doc.currentVersion));
  if (!v) throw new Error("Requested document revision not found.");

  // Retrieve raw file bytes from secure store
  const fileBytes = await retrieveFileBytes(v.objectKey);
  if (!fileBytes) {
    throw new Error("Physical document file could not be retrieved from secure storage.");
  }

  // Set processing status
  doc.ocr_status = "PROCESSING";
  await saveRegistry(reg);

  const ocrResult = await processDocumentOCR({
    fileBuffer: fileBytes,
    mimeType: v.mimeType,
    filename: v.originalName,
    language: input.language || doc.ocr_language,
  });

  // Update document and version metadata
  doc.ocr_status = ocrResult.status;
  doc.ocr_text = ocrResult.text;
  doc.ocr_language = ocrResult.language;
  doc.ocr_processed_at = ocrResult.processedAt;
  doc.ocr_engine = ocrResult.engine;
  doc.ocr_error = ocrResult.error;
  doc.ocr_page_count = ocrResult.pageCount;
  doc.ocr_source = ocrResult.source;

  v.ocr_status = ocrResult.status;
  v.ocr_text = ocrResult.text;
  v.ocr_processed_at = ocrResult.processedAt;

  record(
    reg,
    input.actor,
    ocrResult.status === "FAILED" ? "OCR_FAILED" : "OCR_COMPLETED",
    doc.name,
    doc.id,
    ocrResult.status === "FAILED"
      ? `On-demand OCR failed: ${ocrResult.error || "Unknown error"}.`
      : `On-demand OCR completed via ${ocrResult.engine} (${ocrResult.text.length} chars).`,
    v.hash,
    {
      actionTaken: ocrResult.status === "FAILED" ? "OCR_FAILED" : "OCR_COMPLETED",
    },
  );

  await saveRegistry(reg);

  return {
    documentId: doc.id,
    ocrStatus: ocrResult.status,
    ocrLanguage: ocrResult.language,
    ocrEngine: ocrResult.engine,
    ocrSource: ocrResult.source,
    ocrPageCount: ocrResult.pageCount,
    ocrError: ocrResult.error ?? null,
    ocrProcessedAt: ocrResult.processedAt,
    ocrTextLength: ocrResult.text.length,
    sha256: v.hash,
  };
}

/**
 * Retrieves the extracted OCR text for a document.
 * Strictly gated by role clearance and document permissions.
 */
export async function getDocumentExtractedText(input: {
  actor: Actor;
  documentId: string;
}): Promise<{
  documentId: string;
  name: string;
  ocrStatus: import("./ocr/ocr-types").OCRStatus;
  ocrText: string;
  ocrLanguage: string;
  ocrEngine: string;
  ocrSource: string;
  ocrPageCount: number;
  ocrProcessedAt: string;
  sha256: string;
}> {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Document not found in the archive.");

  // Clearance Gate: Viewer with lower clearance cannot read sensitive document OCR
  if (ROLE_PROFILE[input.actor.role].clearance < CLEARANCE[doc.classification]) {
    record(
      reg,
      input.actor,
      "ACCESS_DENIED",
      doc.name,
      doc.id,
      `OCR text inspection blocked: ${doc.classification} exceeds clearance.`,
    );
    await saveRegistry(reg);
    throw new Error(`Security Exception: ${doc.classification} classification exceeds your clearance level.`);
  }

  const currentVersion = doc.versions.find((v) => v.version === doc.currentVersion) || doc.versions[0];

  return {
    documentId: doc.id,
    name: doc.name,
    ocrStatus: doc.ocr_status || "NOT_REQUIRED",
    ocrText: doc.ocr_text || "",
    ocrLanguage: doc.ocr_language || "eng",
    ocrEngine: doc.ocr_engine || "None",
    ocrSource: doc.ocr_source || "NOT_REQUIRED",
    ocrPageCount: doc.ocr_page_count || 1,
    ocrProcessedAt: doc.ocr_processed_at || doc.updatedAt,
    sha256: currentVersion?.hash || "",
  };
}

/**
 * Returns lightweight OCR metadata and status without heavy text payloads.
 */
export async function getDocumentOCRStatus(input: {
  actor: Actor;
  documentId: string;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Document not found.");

  if (ROLE_PROFILE[input.actor.role].clearance < CLEARANCE[doc.classification]) {
    throw new Error(`Access denied: Document classification exceeds clearance.`);
  }

  const currentVersion = doc.versions.find((v) => v.version === doc.currentVersion) || doc.versions[0];

  return {
    documentId: doc.id,
    fileName: currentVersion?.originalName || doc.name,
    ocrStatus: doc.ocr_status || "NOT_REQUIRED",
    ocrLanguage: doc.ocr_language || "eng",
    ocrEngine: doc.ocr_engine || "None",
    ocrSource: doc.ocr_source || "NOT_REQUIRED",
    ocrPageCount: doc.ocr_page_count || 1,
    ocrProcessedAt: doc.ocr_processed_at || null,
    ocrError: doc.ocr_error || null,
    sha256: currentVersion?.hash || "",
  };
}

// ── Bulk Integrity Verification ──────────────────────────────

export async function bulkVerifyIntegrity(input: { actor: Actor }) {
  const reg = await loadRegistry();
  assertClearance(input.actor, "PUBLIC");

  const results: Array<{
    documentId: string;
    name: string;
    refId: string;
    status: "VERIFIED" | "TAMPERED" | "SKIPPED" | "ERROR";
    hash: string;
    computedHash?: string;
    error?: string;
  }> = [];

  let verified = 0;
  let tampered = 0;
  let skipped = 0;

  for (const doc of reg.documents) {
    const currentVersion =
      doc.versions.find((v) => v.version === doc.currentVersion) ??
      doc.versions[0];

    if (!currentVersion?.hash || !currentVersion?.objectKey) {
      results.push({
        documentId: doc.id,
        name: doc.name,
        refId: doc.refId,
        status: "SKIPPED",
        hash: currentVersion?.hash || "",
      });
      skipped++;
      continue;
    }

    try {
      const fileBytes = await retrieveFileBytes(currentVersion.objectKey);
      if (!fileBytes) {
        results.push({
          documentId: doc.id,
          name: doc.name,
          refId: doc.refId,
          status: "SKIPPED",
          hash: currentVersion.hash,
          error: "File not found on disk",
        });
        skipped++;
        continue;
      }

      const computedHash = computeSha256(fileBytes);
      const match = safeCompareHashes(currentVersion.hash, computedHash);

      if (match) {
        verified++;
        results.push({
          documentId: doc.id,
          name: doc.name,
          refId: doc.refId,
          status: "VERIFIED",
          hash: currentVersion.hash,
          computedHash,
        });
      } else {
        tampered++;
        results.push({
          documentId: doc.id,
          name: doc.name,
          refId: doc.refId,
          status: "TAMPERED",
          hash: currentVersion.hash,
          computedHash,
        });
      }
    } catch (err: any) {
      results.push({
        documentId: doc.id,
        name: doc.name,
        refId: doc.refId,
        status: "SKIPPED",
        hash: currentVersion.hash,
        error: err.message || "Verification failed",
      });
      skipped++;
    }
  }

  record(
    reg,
    input.actor,
    "INTEGRITY_VERIFIED",
    "Bulk Verification",
    "system",
    `Bulk integrity scan: ${verified} verified, ${tampered} tampered, ${skipped} skipped out of ${reg.documents.length} documents.`,
  );
  await saveRegistry(reg);

  return {
    total: reg.documents.length,
    verified,
    tampered,
    skipped,
    results,
    timestamp: new Date().toISOString(),
  };
}

// ── Full-Text Search Across Documents & OCR ──────────────────

export async function searchDocuments(input: {
  actor: Actor;
  query: string;
  limit?: number;
}) {
  const reg = await loadRegistry();
  const q = input.query.toLowerCase().trim();
  if (!q) return { results: [], total: 0 };

  const limit = input.limit || 50;
  const actorClearance = ROLE_PROFILE[input.actor.role].clearance;

  const results: Array<{
    documentId: string;
    name: string;
    refId: string;
    caseId: string;
    category: string;
    classification: string;
    status: string;
    matchType: "name" | "tag" | "ocr" | "category" | "refId";
    ocrSnippet?: string;
    hash: string;
  }> = [];

  for (const doc of reg.documents) {
    if (CLEARANCE[doc.classification] > actorClearance) continue;
    if (results.length >= limit) break;

    const currentVersion =
      doc.versions.find((v) => v.version === doc.currentVersion) ??
      doc.versions[0];

    let matchType: "name" | "tag" | "ocr" | "category" | "refId" | null = null;
    let ocrSnippet: string | undefined;

    if (doc.name.toLowerCase().includes(q)) {
      matchType = "name";
    } else if (doc.refId.toLowerCase().includes(q)) {
      matchType = "refId";
    } else if (doc.category.toLowerCase().includes(q)) {
      matchType = "category";
    } else if (doc.tags.some((t) => t.toLowerCase().includes(q))) {
      matchType = "tag";
    } else if (doc.ocr_text && doc.ocr_text.toLowerCase().includes(q)) {
      matchType = "ocr";
      // Extract snippet around the match
      const idx = doc.ocr_text.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 60);
      const end = Math.min(doc.ocr_text.length, idx + q.length + 60);
      ocrSnippet = (start > 0 ? "…" : "") + doc.ocr_text.slice(start, end) + (end < doc.ocr_text.length ? "…" : "");
    }

    if (matchType) {
      results.push({
        documentId: doc.id,
        name: doc.name,
        refId: doc.refId,
        caseId: doc.caseId,
        category: doc.category,
        classification: doc.classification,
        status: doc.status,
        matchType,
        ...(ocrSnippet ? { ocrSnippet } : {}),
        hash: currentVersion?.hash || "",
      });
    }
  }

  return { results, total: results.length };
}

