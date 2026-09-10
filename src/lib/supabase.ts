/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Supabase Client & Connection Engine
 *  Provides unified client access, environment detection,
 *  and real-time connection diagnostic checks.
 * ───────────────────────────────────────────────────────────── */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// ── Environment Auto-loader for Node / SSR Environments ──────
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore error
  }
}

loadEnv();

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string | undefined;
  bucket: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  loadEnv();
  const url = process.env["SUPABASE_URL"] || "";
  const anonKey = process.env["SUPABASE_ANON_KEY"] || "";
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"] || "evidence-vault";

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("your-supabase")) {
    return null;
  }

  return {
    url,
    anonKey,
    serviceRoleKey: serviceRoleKey && !serviceRoleKey.includes("your-supabase") ? serviceRoleKey : undefined,
    bucket,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

let cachedClient: SupabaseClient | null = null;
let cachedAdminClient: SupabaseClient | null = null;

/**
 * Returns a standard Supabase client for client-side or anon operations.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;

  if (!cachedClient) {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedClient;
}

/**
 * Returns a Supabase client with administrative / service-role capabilities
 * (falling back to anon client if service role key is not configured).
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;

  if (config.serviceRoleKey) {
    if (!cachedAdminClient) {
      cachedAdminClient = createClient(config.url, config.serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    return cachedAdminClient;
  }

  return getSupabaseClient();
}

export interface SupabaseHealthCheckResult {
  configured: boolean;
  connected: boolean;
  latencyMs: number;
  url?: string;
  bucket?: string;
  database: {
    available: boolean;
    tablesFound: boolean;
    error?: string;
  };
  storage: {
    available: boolean;
    bucketFound: boolean;
    error?: string;
  };
  auth: {
    available: boolean;
    error?: string;
  };
  details: string;
}

/**
 * Executes a comprehensive live diagnostic check against Supabase services
 * (PostgreSQL Database, Storage Bucket, and Auth).
 */
export async function checkSupabaseConnection(): Promise<SupabaseHealthCheckResult> {
  const config = getSupabaseConfig();

  if (!config) {
    return {
      configured: false,
      connected: false,
      latencyMs: 0,
      database: { available: false, tablesFound: false, error: "Credentials not provided in .env" },
      storage: { available: false, bucketFound: false, error: "Credentials not provided in .env" },
      auth: { available: false, error: "Credentials not provided in .env" },
      details: "SUPABASE_URL and SUPABASE_ANON_KEY are not configured in .env",
    };
  }

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) {
    return {
      configured: false,
      connected: false,
      latencyMs: 0,
      database: { available: false, tablesFound: false, error: "Failed to initialize client" },
      storage: { available: false, bucketFound: false, error: "Failed to initialize client" },
      auth: { available: false, error: "Failed to initialize client" },
      details: "Failed to create Supabase client instance.",
    };
  }

  const startTime = Date.now();
  const result: SupabaseHealthCheckResult = {
    configured: true,
    connected: false,
    latencyMs: 0,
    url: config.url,
    bucket: config.bucket,
    database: { available: false, tablesFound: false },
    storage: { available: false, bucketFound: false },
    auth: { available: false },
    details: "",
  };

  try {
    // 1. Test Database
    const { data: dbData, error: dbError } = await client
      .from("vigil_registry_snapshot")
      .select("id, version, updated_at")
      .limit(1);

    if (!dbError) {
      result.database.available = true;
      result.database.tablesFound = true;
    } else {
      // Table might not exist yet if schema hasn't been run, but DB itself is responding
      result.database.error = dbError.message;
      if (dbError.code === "PGRST204" || dbError.message.includes("does not exist")) {
        result.database.available = true;
        result.database.tablesFound = false;
      }
    }

    // 2. Test Storage Bucket
    const { data: buckets, error: storageError } = await client.storage.listBuckets();
    if (!storageError && buckets) {
      result.storage.available = true;
      result.storage.bucketFound = buckets.some((b) => b.name === config.bucket || b.id === config.bucket);
    } else if (storageError) {
      result.storage.error = storageError.message;
    }

    // 3. Test Auth Endpoint
    const { error: authError } = await client.auth.getSession();
    if (!authError) {
      result.auth.available = true;
    } else {
      result.auth.error = authError.message;
    }

    result.latencyMs = Date.now() - startTime;
    result.connected = result.database.available || result.storage.available || result.auth.available;
    result.details = result.connected
      ? `Successfully connected to Supabase (${result.latencyMs}ms). DB: ${result.database.available ? "OK" : "Error"}, Storage: ${result.storage.available ? "OK" : "Error"}`
      : "Could not reach Supabase services.";

    return result;
  } catch (err: any) {
    result.latencyMs = Date.now() - startTime;
    result.connected = false;
    result.details = `Connection attempt failed: ${err?.message || String(err)}`;
    return result;
  }
}
