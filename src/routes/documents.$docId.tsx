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
  triggerOCR,
} from "@/lib/dms.functions";
import { shortHash, ROLE_PROFILE, CLASSIFICATIONS, canRead, type Classification } from "@/lib/dms-types";
import { SUPPORTED_OCR_LANGUAGES } from "@/lib/ocr/ocr-types";
import { WorkflowActions } from "@/components/dms/workflow-actions";
import { SharePanel } from "@/components/dms/share-panel";
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  Copy,
  RefreshCw,
  Key,
  AlertTriangle,
  Search,
  Sparkles,
  ExternalLink,
  Cpu,
  CheckCircle2,
  FileText,
} from "lucide-react";
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
  const reocr = useServerFn(triggerOCR);

  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [activeTab, setActiveTab] = useState<"ocr" | "history" | "sharing" | "blockchain">("ocr");
  const [ocrSearch, setOcrSearch] = useState("");
  const [ocrLangSelection, setOcrLangSelection] = useState("eng");

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

  function handleCopyOCR() {
    if (!doc?.ocr_text) return;
    navigator.clipboard.writeText(doc.ocr_text);
    setCopiedText(true);
    toast.success("Extracted OCR text copied to clipboard.");
    setTimeout(() => setCopiedText(false), 2500);
  }

  function handleExportOCR() {
    if (!doc?.ocr_text) return;
    const blob = new Blob([doc.ocr_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.refId}-extracted-ocr.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("OCR text file downloaded.");
  }

  async function handleTriggerOCR() {
    if (!doc || !actor) return;
    setBusy("ocr");
    try {
      const res = await reocr({
        data: {
          actor,
          documentId: doc.id,
          language: ocrLangSelection,
        },
      });
      if (res.ocrStatus === "COMPLETED") {
        toast.success(`✓ OCR Complete! Extracted ${res.ocrTextLength} characters (${res.ocrPageCount} pg).`);
      } else {
        toast.error(`⚠ OCR Execution Failed: ${res.ocrError || "Unreadable image"}`);
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to execute OCR");
    } finally {
      setBusy("");
    }
  }

  const hasClearance = actor ? canRead(actor.role, doc.classification) : false;

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
                {doc.storage === "google-cloud" ? (
                  <span className="text-primary font-bold inline-flex items-center gap-1">
                    ☁ Google Cloud Storage (Project: {doc.cloud_project || "324957553228"})
                  </span>
                ) : doc.storage === "s3" ? (
                  "S3 Object Store"
                ) : (
                  "Secure Local Store (.data/storage)"
                )}
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

            {doc.storage === "google-cloud" && (
              <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-primary/90 pt-1.5 border-t border-border/50">
                <span>☁ Google Cloud Resource: {doc.cloud_name || current?.cloud_name || "Synced on intake"}</span>
                <span>Project: {doc.cloud_project || "324957553228"}</span>
              </div>
            )}
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
              onClick={() => setActiveTab("ocr")}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "ocr"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="size-3.5" />
              <span>OCR & Extracted Text</span>
              {doc.ocr_status === "COMPLETED" && (
                <span className="text-[9px] text-seal font-mono">✓</span>
              )}
              {doc.ocr_status === "FAILED" && (
                <span className="text-[9px] text-destructive font-mono">⚠</span>
              )}
            </button>
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
            <button
              onClick={() => setActiveTab("blockchain")}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "blockchain"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Cpu className="size-3.5" />
              Blockchain
            </button>
          </div>

          {activeTab === "ocr" ? (
            <Panel className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Optical Character Recognition (OCR) Intelligence</Label>
                    <StatusTag value={doc.ocr_status || "NOT_REQUIRED"} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Engine: <strong className="text-foreground">{doc.ocr_engine || "Tesseract OCR / PDF Parser"}</strong> · Source: <span className="font-mono text-foreground">{doc.ocr_source || "N/A"}</span> · Language: <span className="font-mono uppercase text-foreground">{doc.ocr_language || "eng"}</span> · Pages: <span className="font-mono text-foreground">{doc.ocr_page_count || 1}</span>
                  </p>
                </div>

                {hasClearance && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={ocrLangSelection}
                      onChange={(e) => setOcrLangSelection(e.target.value)}
                      className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase cursor-pointer"
                      title="Select language for OCR re-run"
                    >
                      {SUPPORTED_OCR_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleTriggerOCR}
                      disabled={busy === "ocr"}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                    >
                      <RefreshCw className={cn("size-3", busy === "ocr" && "animate-spin")} />
                      {busy === "ocr" ? "Running OCR…" : "Re-run OCR"}
                    </button>
                  </div>
                )}
              </div>

              {!hasClearance ? (
                <div className="rounded-sm border border-dashed border-border p-8 text-center bg-muted/20">
                  <AlertTriangle className="size-8 mx-auto text-caution mb-2" />
                  <p className="text-sm font-bold text-foreground">RESTRICTED OCR FORENSIC CONTENT</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your current clearance level ({profile.label}) does not permit reading {doc.classification} extracted document contents.
                  </p>
                </div>
              ) : doc.ocr_status === "FAILED" ? (
                <div className="rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-destructive">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>OCR Processing Failure Diagnostic</span>
                  </div>
                  <p className="text-foreground">{doc.ocr_error || "The image stream or PDF could not be deciphered by the OCR engine."}</p>
                  <p className="text-muted-foreground">
                    Notice: The original document file and its cryptographic SHA-256 digest ({shortHash(current?.hash || "")}) remain 100% intact and available for download.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={handleTriggerOCR}
                      disabled={busy === "ocr"}
                      className="rounded-sm bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
                    >
                      {busy === "ocr" ? "Retrying OCR…" : "Retry OCR Processing"}
                    </button>
                  </div>
                </div>
              ) : doc.ocr_status === "COMPLETED" && doc.ocr_text ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                      <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={ocrSearch}
                        onChange={(e) => setOcrSearch(e.target.value)}
                        placeholder="Search within extracted text..."
                        className="w-full rounded-sm border border-border bg-background pl-8 pr-3 py-1 text-xs outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {doc.ocr_text.split(/\s+/).filter(Boolean).length} words · {doc.ocr_text.length} chars
                      </span>
                      <button
                        onClick={handleCopyOCR}
                        className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                      >
                        {copiedText ? <CheckCircle2 className="size-3 text-seal" /> : <Copy className="size-3" />}
                        {copiedText ? "Copied" : "Copy Text"}
                      </button>
                      <button
                        onClick={handleExportOCR}
                        className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                      >
                        <Download className="size-3" />
                        Export .txt
                      </button>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto rounded-sm border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground select-text whitespace-pre-wrap">
                    {ocrSearch.trim() ? (
                      doc.ocr_text.split(new RegExp(`(${ocrSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")).map((part, i) =>
                        part.toLowerCase() === ocrSearch.toLowerCase() ? (
                          <mark key={i} className="bg-caution/30 text-foreground font-bold px-0.5 rounded-xs">
                            {part}
                          </mark>
                        ) : (
                          part
                        ),
                      )
                    ) : (
                      doc.ocr_text
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground space-y-2">
                  <p>No OCR text was extracted for this record, or this file did not require optical character recognition.</p>
                  <button
                    onClick={handleTriggerOCR}
                    disabled={busy === "ocr"}
                    className="rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                  >
                    {busy === "ocr" ? "Running OCR…" : "Execute OCR Scan Now"}
                  </button>
                </div>
              )}
            </Panel>
          ) : activeTab === "history" ? (
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
          ) : activeTab === "sharing" ? (
            <SharePanel documentId={doc.id} />
          ) : (
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <Label>Blockchain Ledger & Anchors</Label>
                <Link
                  to="/blockchain"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-primary hover:underline"
                >
                  View Full Ledger <ExternalLink className="size-3" />
                </Link>
              </div>
              
              <div className="rounded-sm border border-border bg-muted/20 p-4">
                <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                  <Cpu className="size-8 text-muted-foreground/40" />
                  <div className="text-sm font-semibold text-foreground">
                    Blockchain Anchors
                  </div>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    This document's cryptographic hashes and integrity events are anchored to the blockchain. View the full ledger to verify the chain of custody.
                  </p>
                  <Link
                    to="/blockchain"
                    className="mt-2 rounded-sm bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90"
                  >
                    Verify on Ledger Explorer
                  </Link>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
