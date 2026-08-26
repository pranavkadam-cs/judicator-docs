/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Registry persistence layer
 *  Supports: in-memory → local JSON file → S3
 *  S3 integration can be added later without changing the API.
 * ───────────────────────────────────────────────────────────── */

import type { Registry } from "./dms-types";
import { buildSeedRegistry } from "./seed-registry";
import { readJson, s3Configured, writeJson } from "./s3.server";

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
  // Priority 1: S3
  if (s3Configured()) {
    const remote = await readJson<Registry>(REGISTRY_KEY);
    if (remote && Array.isArray(remote.cases)) return remote;
    const seeded = await buildSeedRegistry();
    await writeJson(REGISTRY_KEY, seeded);
    return seeded;
  }

  // Priority 2: In-memory cache
  if (memory) return memory;

  // Priority 3: Local file
  const local = await loadFromFile();
  if (local) {
    memory = local;
    return local;
  }

  // Priority 4: Seed fresh registry
  const seeded = await buildSeedRegistry();
  memory = seeded;
  await saveToFile(seeded);
  return seeded;
}

export async function saveRegistry(reg: Registry): Promise<void> {
  reg.version += 1;

  if (s3Configured()) {
    const ok = await writeJson(REGISTRY_KEY, reg);
    if (!ok)
      throw new Error(
        "Could not persist the registry to the linked S3 bucket.",
      );
    return;
  }

  memory = reg;
  await saveToFile(reg);
}

export function storageMode(): "s3" | "local" {
  return s3Configured() ? "s3" : "local";
}
