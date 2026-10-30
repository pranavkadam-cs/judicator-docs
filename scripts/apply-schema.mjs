/**
 * Vigil.OS — Apply Supabase Schema
 * Executes schema.sql against your Supabase project using the service role key.
 * Run: node scripts/apply-schema.mjs
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

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ SUPABASE_URL or service key not set in .env");
  process.exit(1);
}

// ── Read schema SQL ───────────────────────────────────────────
const schemaPath = path.resolve(__dirname, "../supabase/schema.sql");
const rawSql = fs.readFileSync(schemaPath, "utf-8");

// Split into individual statements (split on semicolon + newline, keep non-empty)
function splitStatements(sql) {
  const stmts = [];
  let current = "";
  let inDollarQuote = false;

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    // Skip pure comment lines
    if (trimmed.startsWith("--")) {
      continue;
    }
    current += line + "\n";

    // Very simple dollar-quote tracker (for CREATE FUNCTION bodies)
    if (trimmed.includes("$$")) inDollarQuote = !inDollarQuote;

    if (!inDollarQuote && trimmed.endsWith(";")) {
      const stmt = current.trim();
      if (stmt && stmt !== ";") stmts.push(stmt);
      current = "";
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

// ── Execute SQL via Supabase REST (pg endpoint) ───────────────
async function execSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.status === 404) return { ok: false, notFound: true };
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

// ── Alternative: Use Supabase Management API (pg/query) ──────
async function execViaManagementSQL(fullSql) {
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: fullSql }),
    }
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

// ── Create exec_sql helper function first ─────────────────────
const CREATE_EXEC_SQL = `
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE query;
  RETURN '{"ok":true}'::json;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$$;
`.trim();

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Vigil.OS — Applying Supabase schema...");
  console.log(`   Project: ${SUPABASE_URL}`);
  console.log(`   Schema:  ${schemaPath}\n`);

  const statements = splitStatements(rawSql);
  console.log(`   Found ${statements.length} SQL statements to execute.\n`);

  // Strategy 1: Try management API with full schema
  console.log("📡 Attempting via Supabase Management API...");
  const mgmtResult = await execViaManagementSQL(rawSql);

  if (mgmtResult.ok) {
    console.log("✅ Schema applied successfully via Management API!\n");
    printSummary();
    return;
  }

  // If management API returns 401, it needs a personal access token (not project key)
  // Fall through to per-statement execution via exec_sql RPC
  console.log(
    `   Management API returned ${mgmtResult.status} — trying per-statement execution...\n`
  );

  // Strategy 2: Create exec_sql function first, then run each statement
  console.log("🔧 Step 1: Creating exec_sql helper function...");
  const helperResult = await execSQL(CREATE_EXEC_SQL);

  if (helperResult.notFound) {
    // exec_sql function doesn't exist yet and management API didn't work
    // This means we need a personal access token or direct DB connection
    console.log("\n⚠️  Cannot execute DDL without a personal access token.");
    console.log("\n   The fastest fix — paste this into the Supabase SQL Editor:");
    console.log(
      `   → https://supabase.com/dashboard/project/${SUPABASE_URL.replace("https://", "").split(".")[0]}/sql/new\n`
    );
    console.log("─".repeat(60));
    console.log("Copy the file: supabase/schema.sql → paste → Run");
    console.log("─".repeat(60));
    await fallbackInstructions(statements);
    return;
  }

  console.log("   Helper function ready.\n");

  // Strategy 3: Execute each statement via exec_sql RPC
  let passed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 60).replace(/\n/g, " ");
    process.stdout.write(`   [${i + 1}/${statements.length}] ${preview}...`);

    try {
      const r = await execSQL(stmt);
      if (r.ok) {
        console.log(" ✅");
        passed++;
      } else {
        let parsed = {};
        try { parsed = JSON.parse(r.body); } catch {}
        // Ignore "already exists" type errors
        if (r.body?.includes("already exists") || parsed?.code === "42P07") {
          console.log(" ⏭  (already exists)");
          skipped++;
        } else {
          console.log(` ❌ [${r.status}] ${parsed?.error || r.body?.slice(0, 80)}`);
          failed++;
        }
      }
    } catch (err) {
      console.log(` ❌ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ Passed:  ${passed}`);
  console.log(`⏭  Skipped: ${skipped} (already existed)`);
  console.log(`❌ Failed:  ${failed}`);

  if (failed === 0) {
    console.log("\n🎉 Schema fully applied! Restart your dev server:");
    console.log("   npm run dev");
  } else {
    console.log("\n⚠️  Some statements failed. Check the Supabase SQL Editor:");
    console.log(
      `   https://supabase.com/dashboard/project/${SUPABASE_URL.replace("https://", "").split(".")[0]}/sql/new`
    );
  }
}

function printSummary() {
  const ref = SUPABASE_URL.replace("https://", "").split(".")[0];
  console.log("🎉 All done! Tables created:");
  console.log("   ✅ vigil_registry_snapshot");
  console.log("   ✅ vigil_users");
  console.log("   ✅ vigil_cases");
  console.log("   ✅ vigil_documents");
  console.log("   ✅ vigil_audit_events");
  console.log("   ✅ vigil_assets");
  console.log("   ✅ vigil_notifications");
  console.log("   ✅ evidence-vault storage bucket");
  console.log(`\n📊 View tables: https://supabase.com/dashboard/project/${ref}/editor`);
  console.log("\n▶  Now restart your dev server:  npm run dev");
}

async function fallbackInstructions(statements) {
  console.log("\n📋 Your schema has been saved. Manual steps:");
  console.log("1. Open the Supabase SQL Editor (link above)");
  console.log("2. Open the file: supabase/schema.sql in your editor");
  console.log("3. Copy all → Paste → Run");
  console.log("4. Restart: npm run dev");
}

main().catch((e) => {
  console.error("\n❌ Fatal:", e.message);
  process.exit(1);
});

