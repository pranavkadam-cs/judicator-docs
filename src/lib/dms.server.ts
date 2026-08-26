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
  status?: CaseStatus;
  priority?: CasePriority;
  assignedOfficerIds?: string[];
  summary?: string;
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

  const signed = await signUpload(objectKey).catch(() => null);

  const newVersion = {
    version,
    hash: input.hash,
    size: input.size,
    mimeType: "application/pdf",
    originalName: `${refId}.pdf`,
    uploadedAt: now,
    uploadedBy: input.actor.name,
    uploadedById: input.actor.id,
    objectKey,
    signature: null,
    signedBy: null,
    note: input.note || "Filed through the secure intake.",
  };

  let doc: CaseDocument;
  if (existing) {
    existing.versions = [...existing.versions, newVersion];
    existing.currentVersion = version;
    existing.updatedAt = now;
    existing.status = "SEALED";
    existing.storage = signed ? "s3" : "local";
    doc = existing;
    record(
      reg,
      input.actor,
      "VERSION_ADDED",
      doc.name,
      doc.id,
      `Revision ${version} sealed.`,
      input.hash,
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
      storage: signed ? "s3" : "local",
    };
    reg.documents = [doc, ...reg.documents];
    record(
      reg,
      input.actor,
      "DOCUMENT_UPLOADED",
      doc.name,
      doc.id,
      `Ingested as ${doc.category} and sealed with a SHA-256 digest.`,
      input.hash,
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
  return {
    document: doc,
    uploadUrl: signed?.url ?? null,
    uploadMethod: signed?.method ?? "PUT",
    objectKey,
    storage: storageMode(),
  };
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

// ── Download / View ──────────────────────────────────────────

export async function getDownloadTarget(input: {
  actor: Actor;
  documentId: string;
  version?: string | undefined;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
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
  const signed = await signDownload(v.objectKey).catch(() => null);
  record(
    reg,
    input.actor,
    signed ? "DOCUMENT_DOWNLOADED" : "DOCUMENT_VIEWED",
    doc.name,
    doc.id,
    signed
      ? `Signed retrieval link issued for ${v.version}.`
      : `Metadata inspected for ${v.version}.`,
    v.hash,
  );
  await saveRegistry(reg);
  return {
    url: signed?.url ?? null,
    expiresIn: signed?.expires_in ?? 0,
    version: v,
  };
}

// ── Integrity Verification ───────────────────────────────────

export async function verifyIntegrity(input: {
  actor: Actor;
  documentId: string;
  computedHash: string;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  const v = doc.versions.find(
    (x) => x.version === doc.currentVersion,
  )!;
  const ok = v.hash === input.computedHash;
  if (!ok) {
    doc.status = "TAMPER_ALERT";
    // Notify admin
    const admins = reg.users.filter(
      (u) => u.role === "ADMIN" && u.isActive,
    );
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
  }
  record(
    reg,
    input.actor,
    ok ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILED",
    doc.name,
    doc.id,
    ok
      ? `Digest matches the sealed value for ${v.version}.`
      : `Digest mismatch on ${v.version} — record flagged for tamper review.`,
    input.computedHash,
  );
  await saveRegistry(reg);
  return {
    ok,
    expected: v.hash,
    computed: input.computedHash,
    document: doc,
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
  const v = doc.versions.find(
    (x) => x.version === doc.currentVersion,
  )!;
  v.signature = `SIG-${v.hash.slice(0, 12).toUpperCase()}-${input.actor.badge}`;
  v.signedBy = input.actor.name;
  doc.status = "SIGNED";
  doc.updatedAt = new Date().toISOString();
  record(
    reg,
    input.actor,
    "DOCUMENT_SIGNED",
    doc.name,
    doc.id,
    `Digitally signed ${v.version}.`,
    v.hash,
  );
  await saveRegistry(reg);
  return doc;
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
