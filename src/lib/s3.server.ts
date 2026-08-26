/**
 * Server-only AWS S3 access through the connector gateway.
 * Reads/writes go through pre-signed URLs; listing goes through the gateway proxy.
 */
const GATEWAY_URL = process.env["S3_GATEWAY_URL"] ?? "";
const API_URL = process.env["S3_API_URL"] ?? "";

type Creds = { gatewayKey: string; connectionKey: string };

function creds(): Creds | null {
  const gatewayKey = process.env["GATEWAY_API_KEY"];
  const connectionKey = process.env["AWS_S3_API_KEY"];
  if (!gatewayKey || !connectionKey) return null;
  return { gatewayKey, connectionKey };
}

export function s3Configured() {
  return creds() !== null;
}

function headers(c: Creds, json = false) {
  return {
    Authorization: `Bearer ${c.gatewayKey}`,
    "X-Connection-Api-Key": c.connectionKey,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function signUrl(objectKey: string, mode: "read" | "write") {
  const c = creds();
  if (!c) return null;
  const res = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=${mode}`, {
    method: "POST",
    headers: headers(c, true),
    body: JSON.stringify({ object_path: objectKey }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`S3 sign (${mode}) failed [${res.status}]: ${body}`);
    throw new Error(`Storage sign failed [${res.status}]: ${body}`);
  }
  return (await res.json()) as { url: string; expires_in: number; method?: string };
}

export async function signDownload(objectKey: string) {
  return signUrl(objectKey, "read");
}

export async function signUpload(objectKey: string) {
  return signUrl(objectKey, "write");
}

export async function readJson<T>(objectKey: string): Promise<T | null> {
  const signed = await signDownload(objectKey).catch(() => null);
  if (!signed) return null;
  const res = await fetch(signed.url);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) {
    console.error(`S3 read failed [${res.status}] for ${objectKey}`);
    return null;
  }
  return (await res.json()) as T;
}

export async function writeJson(objectKey: string, value: unknown): Promise<boolean> {
  const signed = await signUpload(objectKey).catch(() => null);
  if (!signed) return false;
  const res = await fetch(signed.url, {
    method: signed.method ?? "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    console.error(`S3 write failed [${res.status}] for ${objectKey}: ${await res.text()}`);
    return false;
  }
  return true;
}

export async function listObjects(prefix: string, maxKeys = 100) {
  const c = creds();
  if (!c) return [];
  const params = new URLSearchParams({ "list-type": "2", prefix, "max-keys": String(maxKeys) });
  const res = await fetch(`${GATEWAY_URL}/?${params}`, { method: "GET", headers: headers(c) });
  if (!res.ok) {
    console.error(`S3 list failed [${res.status}]: ${await res.text()}`);
    return [];
  }
  const xml = await res.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1] as string);
}
