/**
 * Vigil.OS — Initial Sync to Supabase
 * Pushes all cases, documents, users, and audit trail from .data/registry.json into Supabase.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) throw new Error(".env not found");
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  const registryFile = path.resolve(__dirname, "../.data/registry.json");
  if (!fs.existsSync(registryFile)) {
    console.log("No .data/registry.json found.");
    return;
  }

  const raw = fs.readFileSync(registryFile, "utf-8");
  const reg = JSON.parse(raw);

  console.log(`📂 Read registry with:`);
  console.log(`   - Cases: ${reg.cases?.length || 0}`);
  console.log(`   - Documents: ${reg.documents?.length || 0}`);
  console.log(`   - Users: ${reg.users?.length || 0}`);
  console.log(`   - Audit entries: ${reg.audit?.length || 0}`);
  console.log(`   - Assets: ${reg.assets?.length || 0}`);

  // 1. Snapshot
  console.log("\n1️⃣ Upserting vigil_registry_snapshot...");
  const snapRes = await client.from("vigil_registry_snapshot").upsert({
    id: "active",
    version: reg.version || 1,
    data: reg,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (snapRes.error) {
    console.error("❌ Snapshot error:", snapRes.error);
  } else {
    console.log("✅ vigil_registry_snapshot updated!");
  }

  // 2. Users
  if (reg.users?.length) {
    console.log("2️⃣ Upserting vigil_users...");
    const userRows = reg.users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      badge: u.badge,
      role: u.role,
      password_hash: u.passwordHash,
      is_active: u.isActive,
      created_at: u.createdAt,
      last_login_at: u.lastLoginAt || null,
    }));
    const res = await client.from("vigil_users").upsert(userRows, { onConflict: "id" });
    if (res.error) console.error("❌ Users error:", res.error);
    else console.log(`✅ ${userRows.length} users synced!`);
  }

  // 3. Cases
  if (reg.cases?.length) {
    console.log("3️⃣ Upserting vigil_cases...");
    const caseRows = reg.cases.map(c => ({
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
    const res = await client.from("vigil_cases").upsert(caseRows, { onConflict: "id" });
    if (res.error) console.error("❌ Cases error:", res.error);
    else console.log(`✅ ${caseRows.length} cases synced!`);
  }

  // 4. Documents
  if (reg.documents?.length) {
    console.log("4️⃣ Upserting vigil_documents...");
    const docRows = reg.documents.map(d => ({
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
    const res = await client.from("vigil_documents").upsert(docRows, { onConflict: "id" });
    if (res.error) console.error("❌ Documents error:", res.error);
    else console.log(`✅ ${docRows.length} documents synced!`);
  }

  // 5. Audit Events
  if (reg.audit?.length) {
    console.log("5️⃣ Upserting vigil_audit_events...");
    const auditRows = reg.audit.slice(0, 100).map(a => ({
      id: a.id,
      at: a.at,
      action: a.action,
      actor_id: a.actorId,
      actor_name: a.actor,
      actor_badge: (reg.users?.find(u => u.id === a.actorId)?.badge) || "OFFICIAL",
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
    const res = await client.from("vigil_audit_events").upsert(auditRows, { onConflict: "id" });
    if (res.error) console.error("❌ Audit error:", res.error);
    else console.log(`✅ ${auditRows.length} audit entries synced!`);
  }

  // 6. Assets
  if (reg.assets?.length) {
    console.log("6️⃣ Upserting vigil_assets...");
    const assetRows = reg.assets.map(a => ({
      id: a.id,
      tag: a.tag,
      name: a.name,
      category: a.category,
      serial: a.serial,
      status: a.status,
      assigned_to: a.assignedTo,
      station: a.station,
      acquired_at: a.acquiredAt,
      last_service_at: a.lastServiceAt,
      service_interval_days: a.serviceIntervalDays || 90,
      linked_case_id: a.linkedCaseId || null,
      events: a.events || [],
    }));
    const res = await client.from("vigil_assets").upsert(assetRows, { onConflict: "id" });
    if (res.error) console.error("❌ Assets error:", res.error);
    else console.log(`✅ ${assetRows.length} assets synced!`);
  }

  console.log("\n🎉 ALL LOCAL DATA HAS BEEN SYNCED TO SUPABASE!");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
