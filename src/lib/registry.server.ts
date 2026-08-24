import type { Registry } from "./dms-types";
import { buildSeedRegistry } from "./seed-registry";
import { readJson, s3Configured, writeJson } from "./s3.server";

export const REGISTRY_KEY = "vigil/registry.json";

/** Fallback store used when no S3 bucket is linked yet. */
let memory: Registry | null = null;

export async function loadRegistry(): Promise<Registry> {
  if (s3Configured()) {
    const remote = await readJson<Registry>(REGISTRY_KEY);
    if (remote && Array.isArray(remote.cases)) return remote;
    const seeded = buildSeedRegistry();
    await writeJson(REGISTRY_KEY, seeded);
    return seeded;
  }
  if (!memory) memory = buildSeedRegistry();
  return memory;
}

export async function saveRegistry(reg: Registry): Promise<void> {
  reg.version += 1;
  if (s3Configured()) {
    const ok = await writeJson(REGISTRY_KEY, reg);
    if (!ok) throw new Error("Could not persist the registry to the linked S3 bucket.");
    return;
  }
  memory = reg;
}

export function storageMode(): "s3" | "local" {
  return s3Configured() ? "s3" : "local";
}
