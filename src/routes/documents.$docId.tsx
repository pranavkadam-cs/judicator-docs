import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import {
  ClassificationTag,
  EmptyState,
  IntegrityBadge,
  Label,
  Panel,
  Sha256Display,
  StatusTag,
  formatBytes,
  formatDate,
  useRefreshSnapshot,
  useSnapshot,
} from "@/components/dms/primitives";
import {
  applySignature,
  checkIntegrity,
  reclassifyDocument,
  requestDownload,
  simulateTamperFn,
  restoreDocumentFn,
} from "@/lib/dms.functions";
import { shortHash, ROLE_PROFILE, CLASSIFICATIONS, type Classification } from "@/lib/dms-types";
import { WorkflowActions } from "@/components/dms/workflow-actions";
import { SharePanel } from "@/components/dms/share-panel";
import { ShieldCheck, ShieldAlert, Download, Copy, RefreshCw, Key, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/documents/$docId")({
  component: DocumentDetailsPage,
});

function triggerBrowserDownload(filename: string, mimeType: string, base64Data: string) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DocumentDetailsPage() {
  const { docId } = Route.useParams();
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const refresh = useRefreshSnapshot();

  const download = useServerFn(requestDownload);
  const verify = useServerFn(checkIntegrity);
  const tamper = useServerFn(simulateTamperFn);
  const restore = useServerFn(restoreDocumentFn);
  const sign = useServerFn(applySignature);
  const reclassify = useServerFn(reclassifyDocument);

  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "sharing">("history");

  const doc = data?.documents.find((d) => d.id === docId);
  const cs = data?.cases.find((c) => c.id === doc?.caseId);

  if (isPending) {
    return (
      <AppShell title="Loading Document" subtitle="Registry Search">
        <EmptyState title="Opening sealed docket" body="Reading hash registry..." />
      </AppShell>
    );
  }

  if (!doc) {
    return (
      <AppShell title="Document Unavailable" subtitle="Registry Search">
        <EmptyState title="Document not found" body="The docket ID may be invalid or access was restricted." />
      </AppShell>
    );
  }

  if (!actor) {
    return (
      <AppShell title="Authentication Required" subtitle="Security Clearance">
        <EmptyState title="Sign in required" body="Please select active personnel credentials to inspect this docket." />
      </AppShell>
    );
  }

  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0];
  const profile = ROLE_PROFILE[actor.role];
  const isTampered = doc.status === "TAMPER_ALERT" || current?.integrity_status === "TAMPER_ALERT";

  async function handleDownloadAndVerify(versionStr?: string) {
    if (!doc || !actor) return;
    setBusy("download");
    try {
      const res = await download({
        data: {
          actor,
          documentId: doc.id,
          version: versionStr,
        },
      });

      if (res.verified) {
        toast.success(`✓ Integrity Verified — Download Safe (SHA-256: ${res.sha256.slice(0, 10)}...)`, { duration: 5000 });
        if (res.base64Content) {
          triggerBrowserDownload(res.filename, res.mimeType, res.base64Content);
        } else if (res.url) {
          window.open(res.url, "_blank", "noopener");
        }
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to retrieve and verify document", { duration: 6000 });
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function handleDirectServerVerify(versionStr?: string) {
    if (!doc || !actor) return;
    setBusy("verify");
    try {
      const res = await verify({
        data: {
          actor,
          documentId: doc.id,
          version: versionStr,
        },
      });

      if (res.ok) {
        toast.success(`✓ Integrity Verified! SHA-256 digest matches server storage (${res.computed.slice(0, 10)}...).`, { duration: 5000 });
      } else {
        toast.error(`⚠ Integrity Check Failed! Expected [${res.expected.slice(0, 8)}...] but found [${res.computed.slice(0, 8)}...]. Tamper alert flagged!`, { duration: 7000 });
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Integrity check failed", { duration: 6000 });
    } finally {
      setBusy("");
    }
  }

  async function handleTamperDemo() {
    if (!doc || !actor) return;
    setBusy("tamper");
    try {
      await tamper({
        data: {
          actor,
          documentId: doc.id,
        },
      });
      toast.warning("DEMO: Inverted 1 byte of the stored file on server disk! Now click 'Download & Verify' to demonstrate tamper detection.", { duration: 8000 });
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Tamper demo failed");
    } finally {
      setBusy("");
    }
  }

  async function handleRestoreDemo() {
    if (!doc || !actor) return;
    setBusy("restore");
    try {
      await restore({
        data: {
          actor,
          documentId: doc.id,
        },
      });
      toast.success("✓ Record restored and re-sealed with authentic SHA-256 digest.");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Restore failed");
    } finally {
      setBusy("");
    }
  }

  async function handleSign() {
    if (!doc || !actor) return;
    setBusy("sign");
    try {
      await sign({
        data: {
          actor,
          documentId: doc.id,
        },
      });
      toast.success("Digital signature applied successfully.");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply digital signature");
    } finally {
      setBusy("");
    }
  }

  async function handleReclassify(c: Classification) {
    if (!doc || !actor) return;
    setBusy("reclassify");
    try {
      await reclassify({
        data: {
          actor,
          documentId: doc.id,
          classification: c,
        },
      });
      toast.success(`Document reclassified to ${c}`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to reclassify document");
    } finally {
      setBusy("");
    }
  }

  function copyHash() {
    if (!current?.hash) return;
    navigator.clipboard.writeText(current.hash);
    setCopied(true);
    toast.success("SHA-256 digest copied to clipboard.");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <AppShell title={doc.name} subtitle={`Docket: ${doc.refId}`}>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-xs">
          <Link to="/documents" className="font-mono text-primary hover:underline">
            ← Document Index
          </Link>
          <span className="text-muted-foreground">/</span>
          {cs && (
            <Link to="/cases/$caseId" params={{ caseId: cs.id }} className="font-mono text-primary hover:underline">
              Case {cs.caseNumber}
            </Link>
          )}
        </div>

        {/* Tamper Alert Banner */}
        {isTampered && (
          <div className="flex items-center justify-between rounded-sm border border-destructive bg-destructive/15 p-4 text-sm font-semibold text-destructive animate-pulse">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 shrink-0" />
              <div>
                <p className="font-bold">CRITICAL FILE INTEGRITY VIOLATION DETECTED</p>
                <p className="text-xs text-destructive/90 font-normal">
                  The SHA-256 hash of the stored file does not match the sealed metadata. Download has been blocked to protect chain-of-custody.
                </p>
              </div>
            </div>
            {(actor.role === "ADMIN" || actor.role === "INVESTIGATOR") && (
              <button
                onClick={handleRestoreDemo}
                disabled={busy === "restore"}
                className="ml-4 shrink-0 rounded-xs bg-destructive px-3 py-1.5 font-mono text-[11px] font-bold uppercase text-destructive-foreground hover:opacity-90"
              >
                {busy === "restore" ? "Restoring…" : "Re-seal Record"}
              </button>
            )}
          </div>
        )}

        {/* Top Summary & Cryptographic Integrity Card */}
        <Panel className={cn("p-5 space-y-4", isTampered && "border-destructive/60 bg-destructive/5")}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag value={doc.status} />
            <ClassificationTag value={doc.classification} />
            <IntegrityBadge status={current?.integrity_status ?? (isTampered ? "TAMPER_ALERT" : "VERIFIED")} />
            <span className="font-mono text-xs text-muted-foreground ml-auto">
              Current version: <span className="font-bold text-foreground">{doc.currentVersion}</span>
            </span>
          </div>

          <dl className="grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Category</Label>
              <dd className="mt-1 text-foreground font-bold">{doc.category}</dd>
            </div>
            <div>
              <Label>Storage Subsystem</Label>
              <dd className="mt-1 text-foreground font-mono">
                {doc.storage === "s3" ? "S3 Object Store" : "Secure Local Store (.data/storage)"}
              </dd>
            </div>
            <div>
              <Label>Sealed Timestamp</Label>
              <dd className="mt-1 text-foreground">{formatDate(doc.updatedAt)}</dd>
            </div>
            <div>
              <Label>Digital Signature</Label>
              <dd className="mt-1 text-foreground font-mono text-[11px]">
                {current?.signature ? (
                  <span className="text-seal font-bold">{current.signature}</span>
                ) : (
                  <span className="text-muted-foreground">Unsigned</span>
                )}
              </dd>
            </div>
          </dl>

          {/* Cryptographic SHA-256 Digest Section */}
          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cryptographic SHA-256 Digest (64 Hex Characters)</Label>
              <span className="font-mono text-[10px] text-muted-foreground">Algorithm: Standard SHA-256</span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-background p-3 rounded-sm border border-border">
              <div className="font-mono text-xs text-foreground select-all break-all tracking-wider font-semibold">
                {current?.hash}
              </div>
              <button
                type="button"
                onClick={copyHash}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
              >
                {copied ? <CheckCircle2 className="size-3.5 text-seal" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy SHA-256"}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-muted-foreground pt-1">
              <span>Original File: {current?.originalName || `${doc.refId}.pdf`} ({formatBytes(current?.size ?? 0)})</span>
              <span>
                {current?.last_verified_at
                  ? `Last Verified: ${formatDate(current.last_verified_at)} (${current.verification_count || 1} checks)`
                  : "Status: Sealed on intake"}
              </span>
            </div>
          </div>
        </Panel>

        {/* Actions panel */}
        <Panel className="p-4 space-y-3">
          <Label>Archive Custody & Integrity Controls</Label>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => void handleDownloadAndVerify()}
              disabled={busy === "download"}
              className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
              title="Performs on-the-fly server-side SHA-256 verification and delivers verified file"
            >
              <Download className="size-3.5" />
              {busy === "download" ? "Verifying SHA-256…" : "Download & Verify File"}
            </button>

            <button
              onClick={() => void handleDirectServerVerify()}
              disabled={busy === "verify"}
              className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
            >
              <ShieldCheck className="size-3.5 text-seal" />
              {busy === "verify" ? "Verifying…" : "Verify Integrity on Server"}
            </button>

            {/* Tamper Simulation Diagnostic Button for SIH Demonstration */}
            {(actor.role === "ADMIN" || actor.role === "INVESTIGATOR") && (
              <>
                {!isTampered ? (
                  <button
                    onClick={handleTamperDemo}
                    disabled={busy === "tamper"}
                    className="flex items-center gap-1.5 rounded-sm border border-destructive/40 bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10 cursor-pointer"
                    title="Modifies 1 byte on server disk to test live tamper detection"
                  >
                    <ShieldAlert className="size-3.5" />
                    {busy === "tamper" ? "Tampering…" : "Simulate Tampering (Demo)"}
                  </button>
                ) : (
                  <button
                    onClick={handleRestoreDemo}
                    disabled={busy === "restore"}
                    className="flex items-center gap-1.5 rounded-sm border border-seal/40 bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-seal hover:bg-seal/10 cursor-pointer"
                  >
                    <RefreshCw className="size-3.5" />
                    {busy === "restore" ? "Restoring…" : "Re-seal Record"}
                  </button>
                )}
              </>
            )}

            {profile.canSign && !current?.signature && (
              <button
                onClick={handleSign}
                disabled={busy === "sign"}
                className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-seal hover:bg-seal/10 cursor-pointer"
              >
                <Key className="size-3.5" /> Apply Digital Signature
              </button>
            )}

            {(actor.role === "ADMIN" || actor.role === "INVESTIGATOR") && (
              <div className="flex items-center gap-2 border-l border-border pl-2.5">
                <span className="text-xs text-muted-foreground font-mono">Reclassify:</span>
                <select
                  value={doc.classification}
                  onChange={(e) => handleReclassify(e.target.value as Classification)}
                  disabled={busy === "reclassify"}
                  className="rounded-sm border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] uppercase cursor-pointer"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Panel>

        {/* Workflow controls */}
        <WorkflowActions documentId={doc.id} currentStatus={doc.status} />

        {/* Dynamic section tabs */}
        <div className="space-y-4">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer ${
                activeTab === "history"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Revision History & Digests
            </button>
            <button
              onClick={() => setActiveTab("sharing")}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer ${
                activeTab === "sharing"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Access Sharing
            </button>
          </div>

          {activeTab === "history" ? (
            <Panel className="p-5">
              <Label className="mb-4 block">Version Log & Cryptographic Custody Record</Label>
              <ol className="relative border-l border-border pl-4 space-y-6">
                {[...doc.versions].reverse().map((v) => (
                  <li key={v.version} className="relative space-y-1.5">
                    <span className="absolute -left-[21px] top-1 flex size-2 items-center justify-center rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold text-foreground">
                      <span>{v.version}</span>
                      <span className="text-muted-foreground">·</span>
                      <IntegrityBadge status={v.integrity_status ?? "VERIFIED"} />
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">({formatBytes(v.size)})</span>
                      {v.signature && <span className="text-seal ml-2">Signed by {v.signedBy}</span>}
                    </div>

                    <div className="font-mono text-xs text-foreground bg-background p-2 rounded-xs border border-border">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase">SHA-256 Digest</div>
                      <div className="select-all break-all">{v.hash}</div>
                    </div>

                    <p className="text-xs text-foreground">{v.note}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Uploaded by {v.uploadedBy}</span>
                      <span>·</span>
                      <span>{formatDate(v.uploadedAt)}</span>
                      <span>·</span>
                      <button
                        onClick={() => void handleDownloadAndVerify(v.version)}
                        className="text-primary hover:underline font-mono uppercase font-bold tracking-wider cursor-pointer"
                      >
                        Download & Verify {v.version}
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : (
            <SharePanel documentId={doc.id} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
