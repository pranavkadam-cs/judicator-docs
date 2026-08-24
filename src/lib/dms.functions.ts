import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CLASSIFICATIONS, DOC_CATEGORIES, ROLES } from "./dms-types";

const actorSchema = z.object({
  name: z.string().min(1),
  badge: z.string().min(1),
  role: z.enum(ROLES),
});

const classificationSchema = z.enum(CLASSIFICATIONS);
const assetStatusSchema = z.enum([
  "IN SERVICE",
  "ISSUED",
  "MAINTENANCE",
  "RETURNED",
  "RETIRED",
  "IMPOUNDED",
]);
const assetCategorySchema = z.enum(["WEAPON", "VEHICLE", "DEVICE", "RADIO", "FORENSIC KIT"]);

export const fetchSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { getSnapshot } = await import("./dms.server");
  return getSnapshot();
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
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createCase } = await import("./dms.server");
    return createCase(data);
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
        hash: z.string().min(16),
        size: z.number().nonnegative(),
        note: z.string().default(""),
        documentId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { registerDocument } = await import("./dms.server");
    return registerDocument(data);
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
    const { getDownloadTarget } = await import("./dms.server");
    return getDownloadTarget(data);
  });

export const checkIntegrity = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        actor: actorSchema,
        documentId: z.string().min(1),
        computedHash: z.string().min(16),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyIntegrity } = await import("./dms.server");
    return verifyIntegrity(data);
  });

export const applySignature = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ actor: actorSchema, documentId: z.string().min(1) }).parse(input))
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

export const toggleShare = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ actor: actorSchema, documentId: z.string().min(1), role: z.enum(ROLES) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { shareDocument } = await import("./dms.server");
    return shareDocument(data);
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
