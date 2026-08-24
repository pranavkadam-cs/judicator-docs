export const CLASSIFICATIONS = [
  "PUBLIC",
  "RESTRICTED",
  "CONFIDENTIAL",
  "SECRET",
  "TOP SECRET",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLEARANCE: Record<Classification, number> = {
  PUBLIC: 0,
  RESTRICTED: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  "TOP SECRET": 4,
};

export const ROLES = [
  "OFFICER",
  "INVESTIGATOR",
  "FORENSICS",
  "PROSECUTOR",
  "ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export type Actor = {
  name: string;
  badge: string;
  role: Role;
};

export const ROLE_PROFILE: Record<
  Role,
  { label: string; clearance: number; canUpload: boolean; canSign: boolean; canManageAssets: boolean }
> = {
  OFFICER: { label: "Patrol Officer", clearance: 1, canUpload: true, canSign: false, canManageAssets: false },
  INVESTIGATOR: { label: "Lead Investigator", clearance: 3, canUpload: true, canSign: true, canManageAssets: true },
  FORENSICS: { label: "Forensic Analyst", clearance: 3, canUpload: true, canSign: true, canManageAssets: false },
  PROSECUTOR: { label: "Public Prosecutor", clearance: 3, canUpload: false, canSign: true, canManageAssets: false },
  ADMIN: { label: "Records Administrator", clearance: 4, canUpload: true, canSign: true, canManageAssets: true },
};

export const DOC_CATEGORIES = [
  "FIR",
  "Police Report",
  "Investigation Record",
  "Witness Statement",
  "Charge Sheet",
  "Court Filing",
  "Evidence Record",
  "Forensic Report",
  "Legal Notice",
  "Judgment",
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

export type DocVersion = {
  version: string;
  hash: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  objectKey: string;
  signature: string | null;
  signedBy: string | null;
  note: string;
};

export type DocStatus = "DRAFT" | "SEALED" | "SIGNED" | "TAMPER ALERT";

export type CaseDocument = {
  id: string;
  caseId: string;
  refId: string;
  name: string;
  category: DocCategory;
  classification: Classification;
  status: DocStatus;
  currentVersion: string;
  versions: DocVersion[];
  sharedWith: Role[];
  updatedAt: string;
  storage: "s3" | "registry";
};

export type CaseStatus = "OPEN" | "UNDER INVESTIGATION" | "IN TRIAL" | "CLOSED";

export type CaseFile = {
  id: string;
  caseNumber: string;
  title: string;
  summary: string;
  status: CaseStatus;
  classification: Classification;
  jurisdiction: string;
  lead: string;
  openedAt: string;
  statute: string;
  tags: string[];
};

export type AssetCategory = "WEAPON" | "VEHICLE" | "DEVICE" | "RADIO" | "FORENSIC KIT";
export type AssetStatus =
  | "IN SERVICE"
  | "ISSUED"
  | "MAINTENANCE"
  | "RETURNED"
  | "RETIRED"
  | "IMPOUNDED";

export type AssetEvent = {
  at: string;
  action: string;
  actor: string;
  note: string;
};

export type Asset = {
  id: string;
  tag: string;
  name: string;
  category: AssetCategory;
  serial: string;
  status: AssetStatus;
  assignedTo: string;
  station: string;
  acquiredAt: string;
  lastServiceAt: string;
  serviceIntervalDays: number;
  linkedCaseId: string | null;
  events: AssetEvent[];
};

export type AuditAction =
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_VIEWED"
  | "DOCUMENT_DOWNLOADED"
  | "VERSION_ADDED"
  | "INTEGRITY_VERIFIED"
  | "INTEGRITY_FAILED"
  | "DOCUMENT_SIGNED"
  | "CLASSIFICATION_CHANGED"
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED"
  | "CASE_CREATED"
  | "ASSET_LIFECYCLE";

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  role: Role;
  action: AuditAction;
  target: string;
  targetId: string;
  detail: string;
  hash: string | null;
};

export type Registry = {
  version: number;
  cases: CaseFile[];
  documents: CaseDocument[];
  assets: Asset[];
  audit: AuditEvent[];
};

export function clearanceOf(role: Role) {
  return ROLE_PROFILE[role].clearance;
}

export function canRead(role: Role, classification: Classification) {
  return clearanceOf(role) >= CLEARANCE[classification];
}

export function shortHash(hash: string) {
  if (!hash) return "—";
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

export function nextVersion(current: string) {
  const parts = current.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] = (parts[2] ?? 0) + 1;
  return `v${parts[0]}.${parts[1]}.${parts[2]}`;
}
