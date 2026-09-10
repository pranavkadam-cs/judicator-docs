/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Supabase Database (PostgreSQL) Persistence Layer
 *  Provides atomic snapshot persistence and relational table sync
 *  for cases, documents, assets, and forensic audit trails.
 * ───────────────────────────────────────────────────────────── */

import type { Registry } from "./dms-types";
import {
  getSupabaseAdminClient,
  getSupabaseClient,
  isSupabaseConfigured,
} from "./supabase";

export function isSupabaseDbConfigured(): boolean {
  return isSupabaseConfigured();
}

/**
 * Loads the complete case registry state from Supabase PostgreSQL.
 */
export async function loadRegistryFromSupabase(): Promise<Registry | null> {
  if (!isSupabaseConfigured()) return null;

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("vigil_registry_snapshot")
      .select("data, version, updated_at")
      .eq("id", "active")
      .maybeSingle();

    if (error) {
      console.warn(`[Vigil.OS] Supabase load note: ${error.message}`);
      return null;
    }

    if (data && data.data && Array.isArray(data.data.cases)) {
      const reg = data.data as Registry;
      if (typeof data.version === "number" && reg.version < data.version) {
        reg.version = data.version;
      }
      return reg;
    }

    return null;
  } catch (err: any) {
    console.warn(`[Vigil.OS] Supabase DB read error: ${err?.message || err}`);
    return null;
  }
}

/**
 * Asynchronously syncs individual relational tables in Supabase for SQL reporting.
 */
async function syncRelationalTables(client: any, reg: Registry): Promise<void> {
  try {
    // 1. Sync Cases
    if (reg.cases && reg.cases.length > 0) {
      const caseRows = reg.cases.map((c) => ({
        id: c.id,
        case_number: c.caseNumber,
        title: c.title,
        summary: c.summary || "",
        status: c.status,
        priority: c.priority,
        classification: c.classification,
        jurisdiction: c.jurisdiction,
        lead: c.lead,
        lead_id: c.leadId,
        assigned_officer_ids: c.assignedOfficerIds || [],
        statute: c.statute || "",
        tags: c.tags || [],
        opened_at: c.openedAt,
        closed_at: c.closedAt,
      }));
      try {
        await client.from("vigil_cases").upsert(caseRows, { onConflict: "id" });
      } catch {
        // Continue
      }
    }

    // 2. Sync Documents
    if (reg.documents && reg.documents.length > 0) {
      const docRows = reg.documents.map((d) => ({
        id: d.id,
        case_id: d.caseId,
        ref_id: d.refId,
        name: d.name,
        category: d.category,
        classification: d.classification,
        status: d.status,
        current_version: d.currentVersion,
        versions: d.versions || [],
        tags: d.tags || [],
        shared_with: d.sharedWith || [],
        storage: d.storage || "supabase",
        cloud_uri: d.cloud_uri || null,
        ocr_status: d.ocr_status || null,
        ocr_text: d.ocr_text || null,
        ocr_engine: d.ocr_engine || null,
        created_by_id: d.createdById,
        created_at: d.createdAt,
        updated_at: d.updatedAt,
      }));
      try {
        await client.from("vigil_documents").upsert(docRows, { onConflict: "id" });
      } catch {
        // Continue
      }
    }

    // 3. Sync Audit Events (latest 100)
    if (reg.audit && reg.audit.length > 0) {
      const auditRows = reg.audit.slice(0, 100).map((a) => ({
        id: a.id,
        at: a.at,
        action: a.action,
        actor_id: a.actorId,
        actor_name: a.actor,
        actor_role: a.role,
        target_name: a.target,
        details: a.detail,
        sha256: a.hash,
        metadata: {
          targetId: a.targetId,
          expectedHash: a.expectedHash ?? null,
          computedHash: a.computedHash ?? null,
          actionTaken: a.actionTaken ?? null,
          blockchain_tx_id: a.blockchain_tx_id ?? null,
        },
      }));
      try {
        await client.from("vigil_audit_events").upsert(auditRows, { onConflict: "id" });
      } catch {
        // Continue
      }
    }
  } catch (err) {
    // Non-blocking sync error
    console.warn(`[Vigil.OS] Relational table sync notice: ${err}`);
  }
}

/**
 * Persists the complete case registry atomically to Supabase PostgreSQL.
 */
export async function saveRegistryToSupabase(reg: Registry): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) return false;

  try {
    const payload = {
      id: "active",
      version: reg.version,
      data: reg,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("vigil_registry_snapshot")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error(`[Vigil.OS] Supabase save error: ${error.message}`);
      return false;
    }

    // Asynchronously update relational tables without blocking response
    void syncRelationalTables(client, reg);

    return true;
  } catch (err: any) {
    console.error(`[Vigil.OS] Supabase DB write exception: ${err?.message || err}`);
    return false;
  }
}
