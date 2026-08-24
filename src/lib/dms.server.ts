import type {
  Asset,
  AssetStatus,
  AuditAction,
  AuditEvent,
  CaseDocument,
  CaseFile,
  Classification,
  DocCategory,
  Registry,
  Role,
} from "./dms-types";
import { CLEARANCE, ROLE_PROFILE, nextVersion } from "./dms-types";
import { loadRegistry, saveRegistry, storageMode } from "./registry.server";
import { signDownload, signUpload } from "./s3.server";

export type ActorInput = { name: string; badge: string; role: Role };

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function record(
  reg: Registry,
  actor: ActorInput,
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
    role: actor.role,
    action,
    target,
    targetId,
    detail,
    hash,
  };
  reg.audit = [event, ...reg.audit].slice(0, 500);
  return event;
}

function assertClearance(actor: ActorInput, classification: Classification) {
  if (ROLE_PROFILE[actor.role].clearance < CLEARANCE[classification]) {
    throw new Error(
      `Access denied: ${ROLE_PROFILE[actor.role].label} clearance is below ${classification}.`,
    );
  }
}

export async function getSnapshot() {
  const reg = await loadRegistry();
  return {
    storage: storageMode(),
    cases: reg.cases,
    documents: reg.documents,
    assets: reg.assets,
    audit: reg.audit,
  };
}

export async function createCase(input: {
  actor: ActorInput;
  title: string;
  caseNumber: string;
  summary: string;
  jurisdiction: string;
  statute: string;
  classification: Classification;
}) {
  const reg = await loadRegistry();
  assertClearance(input.actor, input.classification);
  const created: CaseFile = {
    id: id("case"),
    caseNumber: input.caseNumber,
    title: input.title,
    summary: input.summary,
    status: "OPEN",
    classification: input.classification,
    jurisdiction: input.jurisdiction,
    lead: input.actor.name,
    openedAt: new Date().toISOString(),
    statute: input.statute,
    tags: [],
  };
  reg.cases = [created, ...reg.cases];
  record(reg, input.actor, "CASE_CREATED", created.title, created.id, `Dossier opened under ${created.statute}.`);
  await saveRegistry(reg);
  return created;
}

export async function registerDocument(input: {
  actor: ActorInput;
  caseId: string;
  name: string;
  category: DocCategory;
  classification: Classification;
  hash: string;
  size: number;
  note: string;
  documentId?: string;
}) {
  const reg = await loadRegistry();
  if (!ROLE_PROFILE[input.actor.role].canUpload) {
    record(reg, input.actor, "ACCESS_DENIED", input.name, input.caseId, "Upload rejected: role has no filing rights.");
    await saveRegistry(reg);
    throw new Error(`${ROLE_PROFILE[input.actor.role].label} may not file new records.`);
  }
  assertClearance(input.actor, input.classification);

  const existing = input.documentId ? reg.documents.find((d) => d.id === input.documentId) : undefined;
  const version = existing ? nextVersion(existing.currentVersion) : "v1.0.0";
  const refId = existing?.refId ?? `${input.category.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
  const objectKey = `vigil/cases/${input.caseId}/${refId}-${version}`;
  const now = new Date().toISOString();

  const signed = await signUpload(objectKey).catch(() => null);

  const newVersion = {
    version,
    hash: input.hash,
    size: input.size,
    uploadedAt: now,
    uploadedBy: input.actor.name,
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
    existing.storage = signed ? "s3" : "registry";
    doc = existing;
    record(reg, input.actor, "VERSION_ADDED", doc.name, doc.id, `Revision ${version} sealed.`, input.hash);
  } else {
    doc = {
      id: id("doc"),
      caseId: input.caseId,
      refId,
      name: input.name,
      category: input.category,
      classification: input.classification,
      status: "SEALED",
      currentVersion: version,
      versions: [newVersion],
      sharedWith: [input.actor.role],
      updatedAt: now,
      storage: signed ? "s3" : "registry",
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

export async function getDownloadTarget(input: { actor: ActorInput; documentId: string; version?: string }) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  if (ROLE_PROFILE[input.actor.role].clearance < CLEARANCE[doc.classification]) {
    record(reg, input.actor, "ACCESS_DENIED", doc.name, doc.id, `Blocked: ${doc.classification} exceeds clearance.`);
    await saveRegistry(reg);
    throw new Error(`Access denied: ${doc.classification} exceeds your clearance.`);
  }
  const v = doc.versions.find((x) => x.version === (input.version ?? doc.currentVersion));
  if (!v) throw new Error("Requested revision not found.");
  const signed = await signDownload(v.objectKey).catch(() => null);
  record(
    reg,
    input.actor,
    signed ? "DOCUMENT_DOWNLOADED" : "DOCUMENT_VIEWED",
    doc.name,
    doc.id,
    signed ? `Signed retrieval link issued for ${v.version}.` : `Metadata inspected for ${v.version}.`,
    v.hash,
  );
  await saveRegistry(reg);
  return { url: signed?.url ?? null, expiresIn: signed?.expires_in ?? 0, version: v };
}

export async function verifyIntegrity(input: {
  actor: ActorInput;
  documentId: string;
  computedHash: string;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  const v = doc.versions.find((x) => x.version === doc.currentVersion)!;
  const ok = v.hash === input.computedHash;
  if (!ok) doc.status = "TAMPER ALERT";
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
  return { ok, expected: v.hash, computed: input.computedHash, document: doc };
}

export async function signDocument(input: { actor: ActorInput; documentId: string }) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  if (!ROLE_PROFILE[input.actor.role].canSign) {
    record(reg, input.actor, "ACCESS_DENIED", doc.name, doc.id, "Signature rejected: role has no signing authority.");
    await saveRegistry(reg);
    throw new Error(`${ROLE_PROFILE[input.actor.role].label} has no signing authority.`);
  }
  const v = doc.versions.find((x) => x.version === doc.currentVersion)!;
  v.signature = `SIG-${v.hash.slice(0, 12).toUpperCase()}-${input.actor.badge}`;
  v.signedBy = input.actor.name;
  doc.status = "SIGNED";
  doc.updatedAt = new Date().toISOString();
  record(reg, input.actor, "DOCUMENT_SIGNED", doc.name, doc.id, `Digitally signed ${v.version}.`, v.hash);
  await saveRegistry(reg);
  return doc;
}

export async function setClassification(input: {
  actor: ActorInput;
  documentId: string;
  classification: Classification;
}) {
  const reg = await loadRegistry();
  const doc = reg.documents.find((d) => d.id === input.documentId);
  if (!doc) throw new Error("Record not found in the archive.");
  if (input.actor.role !== "ADMIN" && input.actor.role !== "INVESTIGATOR") {
    throw new Error("Only investigators and records administrators may reclassify records.");
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

export async function shareDocument(input: { actor: ActorInput; documentId: string; role: Role }) {
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

export async function createAsset(input: {
  actor: ActorInput;
  name: string;
  tag: string;
  serial: string;
  category: Asset["category"];
  station: string;
}) {
  const reg = await loadRegistry();
  if (!ROLE_PROFILE[input.actor.role].canManageAssets) {
    throw new Error(`${ROLE_PROFILE[input.actor.role].label} may not induct assets.`);
  }
  const now = new Date().toISOString();
  const asset: Asset = {
    id: id("asset"),
    tag: input.tag,
    name: input.name,
    category: input.category,
    serial: input.serial,
    status: "IN SERVICE",
    assignedTo: "Unassigned",
    station: input.station,
    acquiredAt: now,
    lastServiceAt: now,
    serviceIntervalDays: 180,
    linkedCaseId: null,
    events: [{ at: now, action: "ACQUIRED", actor: input.actor.name, note: "Inducted into the asset register." }],
  };
  reg.assets = [asset, ...reg.assets];
  record(reg, input.actor, "ASSET_LIFECYCLE", asset.name, asset.id, `Asset ${asset.tag} inducted.`);
  await saveRegistry(reg);
  return asset;
}

export async function advanceAsset(input: {
  actor: ActorInput;
  assetId: string;
  status: AssetStatus;
  assignedTo?: string;
  note: string;
}) {
  const reg = await loadRegistry();
  const asset = reg.assets.find((a) => a.id === input.assetId);
  if (!asset) throw new Error("Asset not found in the register.");
  if (!ROLE_PROFILE[input.actor.role].canManageAssets) {
    throw new Error(`${ROLE_PROFILE[input.actor.role].label} may not move assets through the lifecycle.`);
  }
  const now = new Date().toISOString();
  asset.status = input.status;
  if (input.assignedTo !== undefined && input.assignedTo !== "") asset.assignedTo = input.assignedTo;
  if (input.status === "IN SERVICE") asset.lastServiceAt = now;
  if (input.status === "RETURNED" || input.status === "RETIRED") asset.assignedTo = "Unassigned";
  asset.events = [
    ...asset.events,
    { at: now, action: input.status, actor: input.actor.name, note: input.note || `Status set to ${input.status}.` },
  ];
  record(reg, input.actor, "ASSET_LIFECYCLE", asset.name, asset.id, `${asset.tag} → ${input.status}.`);
  await saveRegistry(reg);
  return asset;
}
