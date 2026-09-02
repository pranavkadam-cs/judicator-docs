/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — DMS server functions (TanStack Start)
 * ───────────────────────────────────────────────────────────── */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CLASSIFICATIONS,
  DOC_CATEGORIES,
  ROLES,
  CASE_STATUSES,
  CASE_PRIORITIES,
  DOC_STATUSES,
} from "./dms-types";

const actorSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  badge: z.string().min(1),
  role: z.enum(ROLES),
});

const classificationSchema = z.enum(CLASSIFICATIONS);
const caseStatusSchema = z.enum(CASE_STATUSES);
const casePrioritySchema = z.enum(CASE_PRIORITIES);
const docStatusSchema = z.enum(DOC_STATUSES);

const assetStatusSchema = z.enum([
  "IN_SERVICE",
  "ISSUED",
  "MAINTENANCE",
  "RETURNED",
  "RETIRED",
  "IMPOUNDED",
]);
const assetCategorySchema = z.enum([
  "WEAPON",
  "VEHICLE",
  "DEVICE",
  "RADIO",
  "FORENSIC KIT",
]);

export const fetchSnapshot = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ actorId: z.string().optional() }).parse(input))
  .handler(async ({ data }) => {
    const { getSnapshot } = await import("./dms.server");
    return getSnapshot(data.actorId);
  });

export const openCase = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        title: z.string().min(3),
        caseNumber: z.string().min(3),
        summary: z.string().default(""),
        jurisdiction: z.string().min(1),
        statute: z.string().default(""),
        classification: classificationSchema,
        priority: casePrioritySchema,
        assignedOfficerIds: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createCase } = await import("./dms.server");
    return createCase(data);
  });

export const updateCaseFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        caseId: z.string().min(1),
        status: caseStatusSchema.optional(),
        priority: casePrioritySchema.optional(),
        assignedOfficerIds: z.array(z.string()).optional(),
        summary: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { updateCase } = await import("./dms.server");
    return updateCase(data);
  });

export const fileDocument = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        caseId: z.string().min(1),
        name: z.string().min(1),
        category: z.enum(DOC_CATEGORIES),
        classification: classificationSchema,
        hash: z.string().default(""),
        size: z.number().nonnegative().default(0),
        note: z.string().default(""),
        tags: z.array(z.string()).default([]),
        documentId: z.string().optional(),
        fileBase64: z.string().optional(),
        mimeType: z.string().optional(),
        originalFileName: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { registerDocument } = await import("./dms.server");
    return registerDocument(data);
  });

export const advanceWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        newStatus: docStatusSchema,
        comment: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { advanceWorkflow } = await import("./dms.server");
    return advanceWorkflow(data);
  });

export const requestDownload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        version: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { downloadDocumentWithIntegrity } = await import("./dms.server");
    return downloadDocumentWithIntegrity(data);
  });

export const checkIntegrity = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        computedHash: z.string().optional(),
        version: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyStoredDocumentIntegrity } = await import("./dms.server");
    return verifyStoredDocumentIntegrity({
      actor: data.actor,
      documentId: data.documentId,
      version: data.version,
    });
  });

export const simulateTamperFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        version: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { simulateTamperDocument } = await import("./dms.server");
    return simulateTamperDocument(data);
  });

export const restoreDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        version: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { restoreDocumentFile } = await import("./dms.server");
    return restoreDocumentFile(data);
  });

export const applySignature = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ actor: actorSchema, documentId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { signDocument } = await import("./dms.server");
    return signDocument(data);
  });

export const reclassifyDocument = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        classification: classificationSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { setClassification } = await import("./dms.server");
    return setClassification(data);
  });

export const shareDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        sharedWithUserId: z.string().min(1),
        permissions: z.array(z.enum(["VIEW", "DOWNLOAD"])).default(["VIEW"]),
        expiresAt: z.string().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { shareDocument } = await import("./dms.server");
    return shareDocument(data);
  });

export const revokeShareFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        shareId: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { revokeShare } = await import("./dms.server");
    return revokeShare(data);
  });

export const toggleShare = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { shareDocumentWithRole } = await import("./dms.server");
    return shareDocumentWithRole(data);
  });

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        userId: z.string(),
        notificationId: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { markNotificationRead } = await import("./dms.server");
    return markNotificationRead(data);
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ userId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { markAllNotificationsRead } = await import("./dms.server");
    return markAllNotificationsRead(data.userId);
  });

export const inductAsset = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        name: z.string().min(2),
        tag: z.string().min(2),
        serial: z.string().min(2),
        category: assetCategorySchema,
        station: z.string().min(2),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createAsset } = await import("./dms.server");
    return createAsset(data);
  });

export const moveAssetStage = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        assetId: z.string().min(1),
        status: assetStatusSchema,
        assignedTo: z.string().optional(),
        note: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { advanceAsset } = await import("./dms.server");
    return advanceAsset(data);
  });
