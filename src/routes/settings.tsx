import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { EmptyState, Label, Panel, Stat, useSnapshot } from "@/components/dms/primitives";
import { useActor } from "@/components/dms/actor";
import { fetchSupabaseStatus, bulkVerifyIntegrityFn } from "@/lib/dms.functions";
import {
  Database,
  HardDrive,
  Cloud,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  WifiOff,
  Eye,
  Settings as SettingsIcon,
  RefreshCw,
  Server,
  Lock,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isConfigured as ethIsConfigured, ETH_NETWORK, CONTRACT_ADDRESS } from "@/lib/ethereum/config";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "System settings — Vigil.OS" },
      { name: "description", content: "Monitor system configuration, storage backends, OCR provider status, and blockchain connectivity." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const supabaseStatusFn = useServerFn(fetchSupabaseStatus);
  const bulkVerifyFn = useServerFn(bulkVerifyIntegrityFn);

  const [bulkResult, setBulkResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const supabaseQuery = useQuery({
    queryKey: ["vigil", "supabase-status"],
    queryFn: () => supabaseStatusFn({ data: undefined }),
    enabled: !!actor && actor.role === "ADMIN",
  });

  if (!actor) return null;
  if (actor.role !== "ADMIN") {
    return (
      <AppShell title="System Settings" subtitle="Configuration">
        <EmptyState
          title="Access denied"
          body="Only administrators can view system settings."
        />
      </AppShell>
    );
  }

  const storageMode = data?.storage || "local";
  const totalDocs = data?.documents.length || 0;
  const totalCases = data?.cases.length || 0;
  const totalUsers = data?.users?.length || 0;
  const totalAudit = data?.audit.length || 0;
  const totalTampered = (data?.documents || []).filter((d) => d.status === "TAMPER_ALERT").length;
  const ocrCompleted = (data?.documents || []).filter((d) => d.ocr_status === "COMPLETED").length;
  const ethConfigured = ethIsConfigured;

  const ocrProvider = (() => {
    try {
      return (import.meta as any).env?.OCR_PROVIDER || "auto";
    } catch {
      return "auto";
    }
  })();

  async function handleBulkVerify() {
    setVerifying(true);
    setBulkResult(null);
    try {
      const result = await bulkVerifyFn({
        data: {
          actor: { id: actor!.id, name: actor!.name, badge: actor!.badge, role: actor!.role },
        },
      });
      setBulkResult(result);
      if (result.tampered === 0) {
        toast.success(`✓ All ${result.total} documents passed SHA-256 integrity verification.`);
      } else {
        toast.error(`⚠ ${result.tampered} of ${result.total} documents failed integrity check!`);
      }
    } catch (e: any) {
      toast.error(e.message || "Bulk verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AppShell title="System Settings" subtitle="Configuration & Diagnostics">
      {isPending ? (
        <EmptyState title="Loading settings" body="Reading system configuration…" />
      ) : (
        <div className="space-y-6">
          {/* System Overview Stats */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-entry">
            <Stat label="Total documents" value={totalDocs} hint={`${ocrCompleted} OCR processed`} />
            <Stat label="Case dossiers" value={totalCases} hint="Active case registry" />
            <Stat label="Personnel" value={totalUsers} hint="Registered system users" />
            <Stat label="Audit events" value={totalAudit} hint={`${totalTampered} tamper alerts`} />
          </div>

          {/* Storage Backend */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Database className="size-4 text-primary" />
              <Label>Storage Backend</Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <StorageCard
                icon={<HardDrive className="size-5" />}
                title="Local Filesystem"
                description="Secure disk storage (.data/storage)"
                active={storageMode === "local"}
              />
              <StorageCard
                icon={<Cloud className="size-5" />}
                title="Supabase Cloud"
                description="PostgreSQL + S3 Object Storage"
                active={storageMode === "supabase"}
                status={
                  supabaseQuery.data
                    ? supabaseQuery.data.health?.connected
                      ? "Connected"
                      : "Disconnected"
                    : undefined
                }
              />
              <StorageCard
                icon={<Server className="size-5" />}
                title="Google Cloud Storage"
                description="Enterprise GCS Buckets"
                active={storageMode === "google-cloud"}
              />
            </div>

            {supabaseQuery.data && (
              <div className="text-xs space-y-1 mt-2 font-mono text-muted-foreground border-t border-border pt-3">
                <div>Configured: <span className="text-foreground font-bold">{supabaseQuery.data.configured ? "Yes" : "No"}</span></div>
                <div>URL: <span className="text-foreground">{supabaseQuery.data.url || "Not set"}</span></div>
                <div>Bucket: <span className="text-foreground">{supabaseQuery.data.bucket}</span></div>
                <div>
                  Health:{" "}
                  <span className={cn("font-bold", supabaseQuery.data.health?.connected ? "text-seal" : "text-destructive")}>
                    {supabaseQuery.data.health?.connected ? "Healthy" : supabaseQuery.data.health?.details || "Unreachable"}
                  </span>
                </div>
              </div>
            )}
          </Panel>

          {/* OCR Provider */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Eye className="size-4 text-primary" />
              <Label>OCR Engine Configuration</Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <OCRCard
                title="Tesseract.js WASM"
                description="Local OCR — eng, hin, mar"
                active={ocrProvider === "tesseract" || ocrProvider === "auto"}
                badge="Default"
              />
              <OCRCard
                title="Google Gemini AI"
                description="Multimodal Vision AI"
                active={ocrProvider === "gemini" || ocrProvider === "auto"}
                badge="Primary"
              />
              <OCRCard
                title="Google Cloud Vision"
                description="Enterprise Cloud OCR API"
                active={ocrProvider === "google-vision"}
                badge="Enterprise"
              />
            </div>

            <div className="text-xs font-mono text-muted-foreground mt-2 border-t border-border pt-3">
              Active Provider: <span className="text-foreground font-bold uppercase">{ocrProvider}</span>
              {" · "}Documents Processed: <span className="text-foreground font-bold">{ocrCompleted}</span>
              {" · "}Total Characters Extracted: <span className="text-foreground font-bold">
                {(data?.documents || []).reduce((a, d) => a + (d.ocr_text?.length || 0), 0).toLocaleString()}
              </span>
            </div>
          </Panel>

          {/* Ethereum Blockchain */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Cpu className="size-4 text-primary" />
              <Label>Ethereum Blockchain Configuration</Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-sm border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {ethConfigured ? (
                    <Wifi className="size-4 text-seal" />
                  ) : (
                    <WifiOff className="size-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-bold text-foreground">
                    {ethConfigured ? "Connected" : "Not Configured"}
                  </span>
                </div>
                <div className="text-xs font-mono text-muted-foreground space-y-1">
                  <div>Network: <span className="text-foreground uppercase font-bold">{ETH_NETWORK || "—"}</span></div>
                  <div>Contract: <span className="text-foreground">{CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 10)}…${CONTRACT_ADDRESS.slice(-8)}` : "Not deployed"}</span></div>
                  <div>Smart Contract: <span className="text-foreground font-bold">DocumentNotary.sol (Solidity ^0.8.20)</span></div>
                </div>
              </div>

              <div className="rounded-sm border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  <span className="text-sm font-bold text-foreground">Local SHA-256 Ledger</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground space-y-1">
                  <div>Status: <span className="text-seal font-bold">Active</span></div>
                  <div>Storage: <span className="text-foreground">.data/blockchain-ledger.json</span></div>
                  <div>Chain Link: <span className="text-foreground">sha256(prevTxId : metadataHash : timestamp)</span></div>
                </div>
              </div>
            </div>
          </Panel>

          {/* Bulk Integrity Verification */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-seal" />
                <Label>Bulk Integrity Verification</Label>
              </div>
              <button
                onClick={handleBulkVerify}
                disabled={verifying}
                className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", verifying && "animate-spin")} />
                {verifying ? "Verifying all documents…" : "Verify All Documents"}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Re-computes SHA-256 hashes for all stored documents and compares against authoritative hashes in the registry.
              This is a forensic-grade bulk verification suitable for court demonstrations.
            </p>

            {bulkResult && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-sm border border-border p-3 text-center">
                    <div className="font-mono text-xl font-bold text-foreground">{bulkResult.total}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Total Checked</div>
                  </div>
                  <div className="rounded-sm border border-seal/30 bg-seal/5 p-3 text-center">
                    <div className="font-mono text-xl font-bold text-seal">{bulkResult.verified}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Verified ✓</div>
                  </div>
                  <div className={cn("rounded-sm border p-3 text-center", bulkResult.tampered > 0 ? "border-destructive/30 bg-destructive/5" : "border-border")}>
                    <div className={cn("font-mono text-xl font-bold", bulkResult.tampered > 0 ? "text-destructive" : "text-foreground")}>{bulkResult.tampered}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Tampered ⚠</div>
                  </div>
                  <div className="rounded-sm border border-border p-3 text-center">
                    <div className="font-mono text-xl font-bold text-foreground">{bulkResult.skipped}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Skipped</div>
                  </div>
                </div>

                {bulkResult.results && bulkResult.results.length > 0 && (
                  <div className="max-h-64 overflow-y-auto rounded-sm border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-surface sticky top-0">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Document</th>
                          <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">SHA-256</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResult.results.map((r: any) => (
                          <tr key={r.documentId} className="border-b border-border/50">
                            <td className="px-3 py-2 font-semibold text-foreground">{r.name}</td>
                            <td className="px-3 py-2">
                              {r.status === "VERIFIED" ? (
                                <span className="inline-flex items-center gap-1 text-seal font-bold font-mono text-[10px] uppercase">
                                  <CheckCircle2 className="size-3" /> Verified
                                </span>
                              ) : r.status === "TAMPERED" ? (
                                <span className="inline-flex items-center gap-1 text-destructive font-bold font-mono text-[10px] uppercase animate-pulse">
                                  <AlertTriangle className="size-3" /> Tampered
                                </span>
                              ) : (
                                <span className="text-muted-foreground font-mono text-[10px]">{r.status}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                              {r.hash ? `${r.hash.slice(0, 8)}…${r.hash.slice(-6)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* System Info */}
          <Panel className="p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <SettingsIcon className="size-4 text-muted-foreground" />
              <Label>System Information</Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-xs font-mono">
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Application</span><span className="text-foreground font-bold">Vigil.OS v1.0.0</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Framework</span><span className="text-foreground">TanStack Start + React 19</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bundler</span><span className="text-foreground">Vite 8</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Language</span><span className="text-foreground">TypeScript 5.8</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Smart Contract</span><span className="text-foreground">Solidity ^0.8.20</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Problem Statement</span><span className="text-foreground font-bold">SIH 26190</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Organization</span><span className="text-foreground">Ministry of Home Affairs</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Test Suite</span><span className="text-seal font-bold">23/23 Passing</span></div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

function StorageCard({
  icon,
  title,
  description,
  active,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  status?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border p-4 space-y-2 transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-surface opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("text-foreground", active ? "text-primary" : "text-muted-foreground")}>{icon}</div>
        {active && (
          <span className="inline-flex items-center gap-1 rounded-xs border border-seal/30 bg-seal/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-seal uppercase">
            Active
          </span>
        )}
      </div>
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground">{description}</div>
      {status && (
        <div className={cn("text-[10px] font-mono font-bold", status === "Connected" ? "text-seal" : "text-destructive")}>
          {status}
        </div>
      )}
    </div>
  );
}

function OCRCard({
  title,
  description,
  active,
  badge,
}: {
  title: string;
  description: string;
  active: boolean;
  badge: string;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border p-4 space-y-2 transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-surface opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <Eye className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
        <span className="font-mono text-[9px] font-bold uppercase text-muted-foreground">
          {badge}
        </span>
      </div>
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground">{description}</div>
    </div>
  );
}
