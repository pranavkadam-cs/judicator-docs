import { useState, useMemo } from "react";
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
  verifySignatureFn,
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
import { IntegrityCertificate } from "@/components/dms/integrity-certificate";
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
  Clock,
  Award,
  Lock,
  Fingerprint,
  BadgeCheck,
  XCircle,
  Globe,
} from "lucide-react";
import { NotarizeButton } from "@/lib/ethereum/NotarizeButton";
import { WalletButton } from "@/lib/ethereum/WalletButton";
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
  const verifySig = useServerFn(verifySignatureFn);
  const reclassify = useServerFn(reclassifyDocument);
  const reocr = useServerFn(triggerOCR);

  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedSig, setCopiedSig] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [activeTab, setActiveTab] = useState<"ocr" | "history" | "timeline" | "sharing">("ocr");
  const [ocrSearch, setOcrSearch] = useState("");
  const [ocrLangSelection, setOcrLangSelection] = useState("eng");
  const [showCertificate, setShowCertificate] = useState(false);
  const [showSigDetails, setShowSigDetails] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState("");
  const [sigVerifyResult, setSigVerifyResult] = useState<null | { valid: boolean; reason?: string; signatureId?: string | null; algorithm?: string | null; signerName?: string | null; signerBadge?: string | null; signerRole?: string | null; signedAt?: string | null; signedHash?: string | null; publicKeyFingerprint?: string | null; verifiedAt?: string }>(null);

  const doc = data?.documents.find((d) => d.id === docId);
  const cs = data?.cases.find((c) => c.id === doc?.caseId);

  const docAuditEvents = useMemo(() => {
    if (!data?.audit || !doc) return [];
    const hashes = new Set(doc.versions.map((v) => v.hash));
    return data.audit.filter(
      (e) =>
        e.targetId === doc.id ||
        e.target === doc.name ||
        e.target === doc.refId ||
        (e.hash && hashes.has(e.hash)),
    );
  }, [data, doc]);

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
      const res = await sign({
        data: {
          actor,
          documentId: doc.id,
        },
      });
      const sigId = (res as any)?.signatureResult?.signatureId || "";
      toast.success(
        `✓ RSA-SHA256 digital signature applied!${sigId ? ` ID: ${sigId.slice(0, 28)}...` : ""}`,
        { duration: 6000 }
      );
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply digital signature");
    } finally {
      setBusy("");
    }
  }

  async function handleVerifySignature() {
    if (!doc || !actor) return;
    setBusy("verifysig");
    setSigVerifyResult(null);
    try {
      const res = await verifySig({
        data: {
          actor,
          documentId: doc.id,
        },
      });
      setSigVerifyResult(res as any);
      if ((res as any).valid) {
        toast.success(`✓ RSA-SHA256 signature is VALID — signed by ${(res as any).signerName || "unknown"}`, { duration: 6000 });
      } else {
        toast.error(`✗ Signature verification FAILED: ${(res as any).reason || "Invalid signature"}`, { duration: 7000 });
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Signature verification failed");
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
    <AppShell
      title={doc.name}
      subtitle={`Docket: ${doc.refId}`}
      actions={
        <div className="flex items-center gap-2">
          <WalletButton />
        </div>
      }
    >
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
                {current?.signatureBase64 ? (
                  <button
                    onClick={() => setShowSigDetails(!showSigDetails)}
                    className="flex items-center gap-1.5 text-seal font-bold hover:underline cursor-pointer"
                    title="Click to expand full signature details"
                  >
                    <BadgeCheck className="size-3.5" />
                    RSA-SHA256 Signed
                    <span className="text-muted-foreground font-normal">({current.signatureAlgorithm || "RSA-SHA256"}, {current.signatureKeySize || 2048}-bit)</span>
                  </button>
                ) : current?.signature ? (
                  <span className="text-seal font-bold flex items-center gap-1">
                    <Lock className="size-3" />{current.signature}
                  </span>
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

            {/* Ethereum Sepolia Public Blockchain Notarization */}
            <div className="pt-3 border-t border-primary/30 space-y-2 rounded-sm bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-primary font-bold">
                  <Globe className="size-3.5" />
                  Ethereum Sepolia Blockchain Notary
                </Label>
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  Contract: DocumentNotary.sol
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Anchor this document's SHA-256 fingerprint on Ethereum Sepolia. Once notarized, it can be independently verified on Sepolia Etherscan.
              </p>
              <div className="pt-1">
                <NotarizeButton
                  sha256Hash={current?.hash || ""}
                  documentId={doc.id}
                  documentName={doc.name}
                />
              </div>
            </div>
          </div>

          {/* RSA-SHA256 Digital Signature Details Panel */}
          {showSigDetails && current?.signatureBase64 && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Fingerprint className="size-3.5 text-seal" />
                  RSA-SHA256 Digital Signature Details
                </Label>
                <button
                  onClick={() => setShowSigDetails(false)}
                  className="text-muted-foreground hover:text-foreground text-xs font-mono"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid gap-2 rounded-sm border border-seal/30 bg-seal/5 p-4 font-mono text-[11px] text-foreground">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div><span className="text-muted-foreground">Algorithm:</span> <span className="font-bold text-seal">{current.signatureAlgorithm || "RSA-SHA256"}</span></div>
                  <div><span className="text-muted-foreground">Key Size:</span> <span className="font-bold">{current.signatureKeySize || 2048} bits</span></div>
                  <div><span className="text-muted-foreground">Signed By:</span> <span className="font-bold">{current.signedBy}</span></div>
                  <div><span className="text-muted-foreground">Badge:</span> <span className="font-bold">{current.signerBadge || "—"}</span></div>
                  <div><span className="text-muted-foreground">Role:</span> <span className="font-bold">{current.signerRole || "—"}</span></div>
                  <div><span className="text-muted-foreground">Signed At:</span> <span className="font-bold">{current.signedAt ? new Date(current.signedAt).toLocaleString() : "—"}</span></div>
                </div>

                {current.signatureId && (
                  <div className="mt-1">
                    <div className="text-muted-foreground text-[10px] uppercase font-bold mb-1">Signature ID</div>
                    <div className="select-all break-all text-foreground bg-background p-2 rounded-xs border border-border">{current.signatureId}</div>
                  </div>
                )}

                {current.publicKeyFingerprint && (
                  <div>
                    <div className="text-muted-foreground text-[10px] uppercase font-bold mb-1">Public Key Fingerprint (SHA-256)</div>
                    <div className="select-all break-all text-foreground bg-background p-2 rounded-xs border border-border text-[10px] leading-relaxed">{current.publicKeyFingerprint}</div>
                  </div>
                )}

                {current.signedHash && (
                  <div>
                    <div className="text-muted-foreground text-[10px] uppercase font-bold mb-1">Signed Hash (SHA-256 of Document)</div>
                    <div className="select-all break-all text-foreground bg-background p-2 rounded-xs border border-border">{current.signedHash}</div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold">RSA Signature (Base64, {current.signatureBase64?.length} chars)</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(current.signatureBase64 || "");
                        setCopiedSig(true);
                        toast.success("RSA signature copied to clipboard.");
                        setTimeout(() => setCopiedSig(false), 2500);
                      }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedSig ? <CheckCircle2 className="size-3 text-seal" /> : <Copy className="size-3" />}
                      {copiedSig ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="select-all break-all text-muted-foreground bg-background p-2 rounded-xs border border-border max-h-24 overflow-y-auto text-[10px]">
                    {current.signatureBase64}
                  </div>
                </div>

                {/* Signature Verification */}
                {sigVerifyResult && (
                  <div className={`flex items-center gap-2 rounded-xs border p-2.5 text-xs font-bold ${
                    sigVerifyResult.valid
                      ? "border-seal/40 bg-seal/10 text-seal"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}>
                    {sigVerifyResult.valid
                      ? <><BadgeCheck className="size-4" /> Signature VALID — Cryptographic verification passed</>  
                      : <><XCircle className="size-4" /> Verification FAILED — {sigVerifyResult.reason}</>}
                  </div>
                )}
              </div>
            </div>
          )}
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
                className="flex items-center gap-1.5 rounded-sm border border-seal/50 bg-seal/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-seal hover:bg-seal/20 cursor-pointer"
              >
                <Key className="size-3.5" />
                {busy === "sign" ? "Signing (RSA-SHA256)…" : "Apply RSA-SHA256 Signature"}
              </button>
            )}

            {current?.signatureBase64 && (
              <button
                onClick={handleVerifySignature}
                disabled={busy === "verifysig"}
                className="flex items-center gap-1.5 rounded-sm border border-seal/30 bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-seal hover:bg-seal/10 cursor-pointer"
                title="Cryptographically verify the RSA-SHA256 digital signature"
              >
                <BadgeCheck className="size-3.5" />
                {busy === "verifysig" ? "Verifying Signature…" : "Verify Digital Signature"}
              </button>
            )}

            <button
              onClick={() => setShowCertificate(true)}
              className="flex items-center gap-1.5 rounded-sm border border-seal/50 bg-seal/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-seal hover:bg-seal/20 cursor-pointer"
              title="Generate official legal Integrity Certificate with cryptographic verification proof"
            >
              <Award className="size-3.5" /> Integrity Certificate
            </button>

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
              onClick={() => setActiveTab("timeline")}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "timeline"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="size-3.5" />
              <span>Chain of Custody ({docAuditEvents.length})</span>
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
                      {v.signatureBase64 && (
                        <span className="flex items-center gap-1 text-seal ml-2 font-bold">
                          <BadgeCheck className="size-3.5" /> RSA-SHA256 Signed by {v.signedBy}
                        </span>
                      )}
                      {v.signature && !v.signatureBase64 && (
                        <span className="text-seal ml-2">Signed by {v.signedBy}</span>
                      )}
                    </div>

                    <div className="font-mono text-xs text-foreground bg-background p-2 rounded-xs border border-border">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase">SHA-256 Digest</div>
                      <div className="select-all break-all">{v.hash}</div>
                    </div>

                    {v.signatureBase64 && (
                      <div className="rounded-xs border border-seal/30 bg-seal/5 p-3 font-mono text-[11px] space-y-1.5">
                        <div className="text-[10px] text-seal font-bold uppercase flex items-center gap-1.5">
                          <Fingerprint className="size-3" /> Digital Signature (RSA-SHA256)
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                          <div><span className="text-muted-foreground">Algorithm:</span> <span className="font-bold">{v.signatureAlgorithm || "RSA-SHA256"}</span></div>
                          <div><span className="text-muted-foreground">Key Size:</span> <span className="font-bold">{v.signatureKeySize || 2048} bits</span></div>
                          <div><span className="text-muted-foreground">Badge:</span> <span className="font-bold">{v.signerBadge || "—"}</span></div>
                          <div><span className="text-muted-foreground">Role:</span> <span className="font-bold">{v.signerRole || "—"}</span></div>
                        </div>
                        {v.signatureId && (
                          <div className="text-[10px]">
                            <span className="text-muted-foreground">ID: </span>
                            <span className="text-foreground select-all">{v.signatureId}</span>
                          </div>
                        )}
                        {v.publicKeyFingerprint && (
                          <div className="text-[10px]">
                            <span className="text-muted-foreground">Key Fingerprint: </span>
                            <span className="text-foreground select-all">{v.publicKeyFingerprint.slice(0, 47)}…</span>
                          </div>
                        )}
                        {v.signedHash && (
                          <div className="text-[10px]">
                            <span className="text-muted-foreground">Signed Hash: </span>
                            <span className="text-foreground select-all">{v.signedHash.slice(0, 16)}…{v.signedHash.slice(-8)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-0.5">
                          {v.signatureVerified
                            ? <span className="flex items-center gap-1 text-seal text-[10px] font-bold"><CheckCircle2 className="size-3" /> Verified on creation</span>
                            : <span className="flex items-center gap-1 text-muted-foreground text-[10px]"><AlertTriangle className="size-3" /> Not yet re-verified</span>}
                        </div>
                      </div>
                    )}

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
          ) : activeTab === "timeline" ? (
            <Panel className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Label>Chain of Custody Audit Trail</Label>
                    <span className="font-mono text-xs text-primary font-bold">
                      {docAuditEvents.length} Recorded Custody Events
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chronological, immutable audit ledger tracking intake, hash verification, digital signatures, access sharing, and downloads.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 size-3 text-muted-foreground" />
                    <input
                      type="text"
                      value={timelineFilter}
                      onChange={(e) => setTimelineFilter(e.target.value)}
                      placeholder="Filter custody events..."
                      className="rounded-sm border border-border bg-background pl-7 pr-3 py-1 font-mono text-[11px] outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    onClick={() => setShowCertificate(true)}
                    className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
                  >
                    <Award className="size-3" /> Certificate
                  </button>
                </div>
              </div>

              {docAuditEvents.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No custody events recorded for this docket yet.
                </div>
              ) : (
                <ol className="relative border-l border-border pl-4 space-y-5">
                  {docAuditEvents
                    .filter((e) => {
                      if (!timelineFilter.trim()) return true;
                      const q = timelineFilter.toLowerCase();
                      return (
                        e.action.toLowerCase().includes(q) ||
                        e.actor.toLowerCase().includes(q) ||
                        e.detail.toLowerCase().includes(q) ||
                        (e.hash && e.hash.toLowerCase().includes(q))
                      );
                    })
                    .map((event) => {
                      const isTamper =
                        event.action.includes("TAMPER") || event.action.includes("FAILED");
                      const isVerified =
                        event.action.includes("VERIF") || (event.action as string) === "DOCUMENT_CREATED";
                      const isSign = event.action.includes("SIGN");

                      return (
                        <li key={event.id} className="relative space-y-1.5">
                          <span
                            className={cn(
                              "absolute -left-[21px] top-1.5 flex size-2.5 items-center justify-center rounded-full",
                              isTamper
                                ? "bg-destructive animate-ping"
                                : isSign
                                ? "bg-seal"
                                : isVerified
                                ? "bg-primary"
                                : "bg-muted-foreground",
                            )}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-xs border",
                                  isTamper
                                    ? "border-destructive/40 bg-destructive/15 text-destructive"
                                    : isSign
                                    ? "border-seal/40 bg-seal/15 text-seal"
                                    : "border-primary/40 bg-primary/15 text-primary",
                                )}
                              >
                                {event.action.replace(/_/g, " ")}
                              </span>
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {event.actor}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                ({event.role})
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {formatDate(event.at)}
                            </span>
                          </div>

                          <div className="text-xs text-foreground bg-surface p-2.5 rounded-xs border border-border">
                            <div>{event.detail}</div>
                            {event.hash && (
                              <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground border-t border-border/50 pt-1.5">
                                <span className="font-bold text-foreground">SHA-256:</span>
                                <span className="text-primary select-all break-all">{event.hash}</span>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ol>
              )}
            </Panel>
          ) : (
            <SharePanel documentId={doc.id} />
          )}
        </div>

        {/* Certificate Modal */}
        {showCertificate && (
          <IntegrityCertificate
            document={doc}
            caseFile={cs}
            auditEvents={data?.audit || []}
            onClose={() => setShowCertificate(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
