/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Secure Digital Document Management System
 *  Core type definitions and domain helpers
 * ───────────────────────────────────────────────────────────── */

// ── Classification levels ────────────────────────────────────

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

// ── Roles ────────────────────────────────────────────────────

export const ROLES = [
  "ADMIN",
  "INVESTIGATOR",
  "LEGAL_OFFICER",
  "COURT_OFFICER",
  "VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_PROFILE: Record<
  Role,
  {
    label: string;
    clearance: number;
    canUpload: boolean;
    canSign: boolean;
    canManageAssets: boolean;
    canManageUsers: boolean;
    canApprove: boolean;
  }
> = {
  ADMIN: {
    label: "Administrator",
    clearance: 4,
    canUpload: true,
    canSign: true,
    canManageAssets: true,
    canManageUsers: true,
    canApprove: true,
  },
  INVESTIGATOR: {
    label: "Investigator",
    clearance: 3,
    canUpload: true,
    canSign: true,
    canManageAssets: true,
    canManageUsers: false,
    canApprove: true,
  },
  LEGAL_OFFICER: {
    label: "Legal Officer",
    clearance: 3,
    canUpload: true,
    canSign: true,
    canManageAssets: false,
    canManageUsers: false,
    canApprove: true,
  },
  COURT_OFFICER: {
    label: "Court Officer",
    clearance: 2,
    canUpload: true,
    canSign: false,
    canManageAssets: false,
    canManageUsers: false,
    canApprove: false,
  },
  VIEWER: {
    label: "Viewer",
    clearance: 1,
    canUpload: false,
    canSign: false,
    canManageAssets: false,
    canManageUsers: false,
    canApprove: false,
  },
};

// ── Users ────────────────────────────────────────────────────

export type User = {
  id: string;
  name: string;
  email: string;
  badge: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type Actor = {
  id: string;
  name: string;
  badge: string;
  role: Role;
};

// ── Document categories ──────────────────────────────────────

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

// ── Document status / workflow ───────────────────────────────

export const DOC_STATUSES = [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
  "SEALED",
  "SIGNED",
  "TAMPER_ALERT",
] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];

/** Allowed workflow transitions per status. */
export const WORKFLOW_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["SEALED", "ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: [],
  SEALED: ["SIGNED", "ARCHIVED"],
  SIGNED: ["ARCHIVED"],
  TAMPER_ALERT: [],
};

// ── Document versions ────────────────────────────────────────

export type DocVersion = {
  version: string;
  hash: string;
  size: number;
  mimeType: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedById: string;
  objectKey: string;
  signature: string | null;
  signedBy: string | null;
  note: string;
};

// ── Case document ────────────────────────────────────────────

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
  tags: string[];
  sharedWith: Role[];
  updatedAt: string;
  createdAt: string;
  createdById: string;
  storage: "s3" | "registry" | "local";
};

// ── Case management ──────────────────────────────────────────

export const CASE_STATUSES = [
  "OPEN",
  "UNDER_INVESTIGATION",
  "IN_TRIAL",
  "CLOSED",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export type CaseFile = {
  id: string;
  caseNumber: string;
  title: string;
  summary: string;
  status: CaseStatus;
  priority: CasePriority;
  classification: Classification;
  jurisdiction: string;
  lead: string;
  leadId: string;
  assignedOfficerIds: string[];
  openedAt: string;
  closedAt: string | null;
  statute: string;
  tags: string[];
};

// ── Assets ───────────────────────────────────────────────────

export type AssetCategory =
  | "WEAPON"
  | "VEHICLE"
  | "DEVICE"
  | "RADIO"
  | "FORENSIC KIT";

export type AssetStatus =
  | "IN_SERVICE"
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

// ── Sharing ──────────────────────────────────────────────────

export type SharePermission = "VIEW" | "DOWNLOAD";

export type DocumentShare = {
  id: string;
  documentId: string;
  sharedByUserId: string;
  sharedByName: string;
  sharedWithUserId: string;
  sharedWithName: string;
  permissions: SharePermission[];
  expiresAt: string | null;
  createdAt: string;
  isActive: boolean;
};

// ── Notifications ────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  "DOCUMENT_UPLOADED",
  "DOCUMENT_SHARED",
  "REVIEW_REQUESTED",
  "REVIEW_COMPLETED",
  "ACCESS_EXPIRING",
  "CASE_ASSIGNED",
  "TAMPER_DETECTED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  linkedEntityId: string | null;
  linkedEntityType: "case" | "document" | "user" | null;
};

// ── Audit ────────────────────────────────────────────────────

export type AuditAction =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DEACTIVATED"
  | "PASSWORD_CHANGED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_VIEWED"
  | "DOCUMENT_DOWNLOADED"
  | "DOCUMENT_DELETED"
  | "DOCUMENT_SHARED"
  | "DOCUMENT_SHARE_REVOKED"
  | "VERSION_ADDED"
  | "INTEGRITY_VERIFIED"
  | "INTEGRITY_FAILED"
  | "DOCUMENT_SIGNED"
  | "CLASSIFICATION_CHANGED"
  | "WORKFLOW_CHANGED"
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED"
  | "PERMISSION_CHANGED"
  | "CASE_CREATED"
  | "CASE_UPDATED"
  | "CASE_CLOSED"
  | "ASSET_LIFECYCLE";

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  actorId: string;
  role: Role;
  action: AuditAction;
  target: string;
  targetId: string;
  detail: string;
  hash: string | null;
  ipAddress: string | null;
};

// ── Registry (top-level data store) ──────────────────────────

export type Registry = {
  version: number;
  users: User[];
  cases: CaseFile[];
  documents: CaseDocument[];
  assets: Asset[];
  shares: DocumentShare[];
  notifications: Notification[];
  audit: AuditEvent[];
};

// ── Allowed upload file types ────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Helpers ──────────────────────────────────────────────────

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
  const parts = current
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] = (parts[2] ?? 0) + 1;
  return `v${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  return WORKFLOW_TRANSITIONS[from]?.includes(to) ?? false;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}
