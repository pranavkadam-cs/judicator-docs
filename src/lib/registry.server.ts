/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Registry persistence layer
 *  Supports: Supabase PostgreSQL → S3 → local JSON file → memory
 * ───────────────────────────────────────────────────────────── */

import type { Registry } from "./dms-types";
import { buildSeedRegistry } from "./seed-registry";
import { readJson, s3Configured, writeJson } from "./s3.server";
import { isSupabaseConfigured } from "./supabase";
import {
  loadRegistryFromSupabase,
  saveRegistryToSupabase,
} from "./supabase-db.server";
import { isGoogleCloudStorageConfigured } from "./google-cloud-storage.server";

export const REGISTRY_KEY = "vigil/registry.json";

/** In-memory fallback store. */
let memory: Registry | null = null;

/** Attempt to load from the local file system (Node.js environments). */
async function loadFromFile(): Promise<Registry | null> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), ".data");
    const file = path.join(dir, "registry.json");
    const raw = await fs.readFile(file, "utf-8").catch(() => null);
    if (!raw) return null;
    const data = JSON.parse(raw) as Registry;
    if (data && Array.isArray(data.cases)) return data;
    return null;
  } catch {
    return null;
  }
}

/** Persist to the local file system (Node.js environments). */
async function saveToFile(reg: Registry): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), ".data");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, "registry.json");
    await fs.writeFile(file, JSON.stringify(reg, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function loadRegistry(): Promise<Registry> {
  // Priority 1: In-memory cache (fastest and guarantees local consistency)
  if (memory) return memory;

  // Priority 2: Supabase PostgreSQL (Cloud Database)
  if (isSupabaseConfigured()) {
    try {
      const supabaseReg = await loadRegistryFromSupabase();
      if (supabaseReg && Array.isArray(supabaseReg.cases)) {
        memory = supabaseReg;
        // Mirror to local file for offline resilience
        void saveToFile(supabaseReg);
        return supabaseReg;
      }
    } catch (err) {
      console.warn(`[Vigil.OS] Supabase load notice: ${err}`);
    }
  }

  // Priority 3: S3
  if (s3Configured()) {
    const remote = await readJson<Registry>(REGISTRY_KEY);
    if (remote && Array.isArray(remote.cases)) {
      memory = remote;
      return remote;
    }
    const seeded = await buildSeedRegistry();
    await writeJson(REGISTRY_KEY, seeded);
    memory = seeded;
    return seeded;
  }

  // Priority 4: Local file
  const local = await loadFromFile();
  if (local) {
    memory = local;
    // If Supabase is configured but was empty, seed Supabase from local file
    if (isSupabaseConfigured()) {
      void saveRegistryToSupabase(local);
    }
    return local;
  }

  // Priority 5: Seed fresh registry
  const seeded = await buildSeedRegistry();
  memory = seeded;
  await saveToFile(seeded);

  if (isSupabaseConfigured()) {
    void saveRegistryToSupabase(seeded);
  }

  return seeded;
}

export async function saveRegistry(reg: Registry): Promise<void> {
  reg.version += 1;
  memory = reg;

  // Always mirror to local file
  void saveToFile(reg);

  // If Supabase is active, persist to PostgreSQL
  if (isSupabaseConfigured()) {
    try {
      const ok = await saveRegistryToSupabase(reg);
      if (ok) return;
    } catch (err) {
      console.warn(`[Vigil.OS] Supabase save notice: ${err}`);
    }
  }

  if (s3Configured()) {
    const ok = await writeJson(REGISTRY_KEY, reg);
    if (!ok) {
      throw new Error("Could not persist the registry to the linked S3 bucket.");
    }
  }
}

export function storageMode(): "supabase" | "google-cloud" | "s3" | "local" {
  if (isSupabaseConfigured()) {
    return "supabase";
  }
  if (isGoogleCloudStorageConfigured()) {
    return "google-cloud";
  }
  return s3Configured() ? "s3" : "local";
}
