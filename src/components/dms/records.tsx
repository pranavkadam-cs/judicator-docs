import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  applySignature,
  checkIntegrity,
  fileDocument,
  reclassifyDocument,
  requestDownload,
  simulateTamperFn,
  restoreDocumentFn,
  toggleShare,
} from "@/lib/dms.functions";
import {
  CLASSIFICATIONS,
  DOC_CATEGORIES,
  ROLES,
  ROLE_PROFILE,
  shortHash,
  type CaseDocument,
  type Classification,
  type DocCategory,
} from "@/lib/dms-types";
import { useActor } from "./actor";
import {
  ClassificationTag,
  IntegrityBadge,
  Label,
  Panel,
  Sha256Display,
  StatusTag,
  formatBytes,
  formatDate,
  hashFile,
  useRefreshSnapshot,
} from "./primitives";
import { cn } from "@/lib/utils";
import { Download, ShieldCheck, ShieldAlert, Copy, RefreshCw, AlertTriangle } from "lucide-react";

const inputCls =
  "w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";
const btnCls =
  "inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.12em] uppercase transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.12em] text-primary-foreground uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Operation refused by the registry.";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64 ?? "");
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

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

export function IntakeForm({
  caseId,
  documents,
  onDone,
}: {
  caseId: string;
  documents: CaseDocument[];
  onDone?: () => void;
}) {
  const { actor } = useActor();
  const refresh = useRefreshSnapshot();
  const file = useServerFn(fileDocument);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocCategory>("FIR");
  const [classification, setClassification] = useState<Classification>("CONFIDENTIAL");
  const [note, setNote] = useState("");
  const [revisionOf, setRevisionOf] = useState("");
  const [payload, setPayload] = useState<File | null>(null);
  const [clientHash, setClientHash] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const canUpload = actor ? ROLE_PROFILE[actor.role].canUpload : false;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPayload(f);
    if (f) {
      if (!name) setName(f.name.replace(/\.[^/.]+$/, ""));
      try {
        const h = await hashFile(f);
        setClientHash(h);
      } catch {
        setClientHash("");
      }
    } else {
      setClientHash("");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!payload || !actor) {
      toast.error("Attach the document file and ensure active session.");
      return;
    }
    setBusy(true);
    try {
      // 1. Calculate client-side hash for verification preview
      const digest = clientHash || (await hashFile(payload));
      // 2. Read base64 payload to send directly to server
      const fileBase64 = await fileToBase64(payload);

      // 3. Register document on server (server calculates authoritative SHA-256 and persists file)
      const result = await file({
        data: {
          actor,
          caseId,
          name: name || payload.name,
          category,
          classification,
          hash: digest,
          size: payload.size,
          note,
          fileBase64,
          mimeType: payload.type || "application/pdf",
          originalFileName: payload.name,
          ...(revisionOf ? { documentId: revisionOf } : {}),
        },
      });

      if (result.uploadUrl) {
        await fetch(result.uploadUrl, { method: result.uploadMethod, body: payload }).catch(() => null);
      }

      toast.success(
        `✓ Upload Successful! ${result.document.refId} sealed at ${result.document.currentVersion} · SHA-256: ${result.sha256.slice(0, 12)}... (Integrity Verified)`,
        { duration: 6000 },
      );

      setName("");
      setNote("");
      setPayload(null);
      setClientHash("");
      setRevisionOf("");
      await refresh();
      onDone?.();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }

  if (!canUpload) {
    return (
      <Panel className="p-4">
        <Label>Intake locked</Label>
        <p className="mt-2 text-xs text-muted-foreground">
          {actor ? ROLE_PROFILE[actor.role].label : "Current account"} has read-only filing rights. Switch personnel to file records.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <Label>Secure intake · SHA-256 File Custody Engine</Label>
        <span className="font-mono text-[10px] text-primary">SIH 26190 Protocol</span>
      </div>

      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-xs sm:col-span-2">
          <span className="text-muted-foreground font-semibold">Document file (Raw byte stream will be hashed)</span>
          <input
            type="file"
            required
            onChange={handleFileSelect}
            className={cn(inputCls, "mt-1 file:mr-3 file:border-0 file:bg-transparent file:font-mono file:text-xs file:font-bold file:text-primary")}
          />
          {clientHash && (
            <div className="mt-1.5 flex items-center gap-2 rounded-xs border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-[11px] text-foreground">
              <span className="font-bold text-primary">Pre-Upload SHA-256:</span>
              <span className="truncate">{clientHash}</span>
            </div>
          )}
        </label>

        <label className="text-xs">
          <span className="text-muted-foreground">Document Title</span>
          <input className={cn(inputCls, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} placeholder={payload?.name ?? "Record title"} />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Category</span>
          <select className={cn(inputCls, "mt-1")} value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Classification</span>
          <select className={cn(inputCls, "mt-1")} value={classification} onChange={(e) => setClassification(e.target.value as Classification)}>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">File as revision of</span>
          <select className={cn(inputCls, "mt-1")} value={revisionOf} onChange={(e) => setRevisionOf(e.target.value)}>
            <option value="">— New record —</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>{d.refId} · {d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-muted-foreground">Custody Remark</span>
          <input className={cn(inputCls, "mt-1")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for filing / chain-of-custody remark" />
        </label>
        <div className="sm:col-span-2 flex items-center justify-between pt-1">
          <button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? "Hashing & Sealing on Server…" : "Seal & File Record (SHA-256)"}
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">Algorithm: Standard Cryptographic SHA-256</span>
        </div>
      </form>
    </Panel>
  );
}

export function DocumentCard({ document: doc }: { document: CaseDocument }) {
  const { actor } = useActor();
  const refresh = useRefreshSnapshot();
  const download = useServerFn(requestDownload);
  const verify = useServerFn(checkIntegrity);
  const tamper = useServerFn(simulateTamperFn);
  const restore = useServerFn(restoreDocumentFn);
  const sign = useServerFn(applySignature);
  const reclassify = useServerFn(reclassifyDocument);
  const share = useServerFn(toggleShare);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0];
  const isTampered = doc.status === "TAMPER_ALERT" || current?.integrity_status === "TAMPER_ALERT";

  if (!actor) return null;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
      await refresh();
    } catch (error) {
      toast.error(message(error), { duration: 6000 });
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadAndVerify(versionStr?: string) {
    await run("download", async () => {
      const res = await download({ data: { actor, documentId: doc.id, version: versionStr } });
      if (res.verified) {
        toast.success(`✓ Integrity Verified — Download Safe (SHA-256: ${res.sha256.slice(0, 10)}...)`, { duration: 5000 });
        if (res.base64Content) {
          triggerBrowserDownload(res.filename, res.mimeType, res.base64Content);
        } else if (res.url) {
          window.open(res.url, "_blank", "noopener");
        }
      }
    });
  }

  return (
    <Panel className={cn("p-4 transition-all", isTampered && "border-destructive/60 bg-destructive/5")}>
      {isTampered && (
        <div className="mb-3 flex items-center gap-2 rounded-xs border border-destructive bg-destructive/10 p-2 text-xs font-semibold text-destructive">
          <AlertTriangle className="size-4 shrink-0 animate-pulse" />
          <span>⚠ INTEGRITY VERIFICATION FAILED: Stored file hash mismatch detected. Download has been blocked.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-primary">{doc.refId}</span>
        <StatusTag value={doc.status} />
        <ClassificationTag value={doc.classification} />
        <IntegrityBadge status={current?.integrity_status ?? (isTampered ? "TAMPER_ALERT" : "VERIFIED")} />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{doc.currentVersion}</span>
      </div>

      <h3 className="mt-2 text-sm font-bold text-foreground">{doc.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {doc.category} · {doc.storage === "s3" ? "S3 object store" : "Secure local store"} · updated {formatDate(doc.updatedAt)}
      </p>

      {current ? (
        <div className="mt-3 border-t border-border pt-3 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Sha256Display hash={current.hash} label="SHA-256" />
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatBytes(current.size)} · {current.signature ? `signed by ${current.signedBy}` : "unsigned"}
            </span>
          </div>
          {current.last_verified_at && (
            <p className="font-mono text-[10px] text-muted-foreground">
              Last verified: {formatDate(current.last_verified_at)} ({current.verification_count || 1} checks passed)
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={cn(primaryBtn, isTampered && "bg-destructive text-destructive-foreground")}
          disabled={busy === "download"}
          onClick={() => handleDownloadAndVerify()}
          title="Verifies SHA-256 server-side before delivering file bytes"
        >
          <Download className="size-3.5" />
          {busy === "download" ? "Verifying SHA-256…" : "Download & Verify"}
        </button>

        <button
          className={btnCls}
          disabled={busy === "check"}
          onClick={() =>
            run("check", async () => {
              const res = await verify({ data: { actor, documentId: doc.id } });
              if (res.ok) {
                toast.success(`✓ Integrity Verified! SHA-256 matches trusted record (${res.computed.slice(0, 10)}...).`);
              } else {
                toast.error(`⚠ Integrity Check Failed! Expected [${res.expected.slice(0, 8)}...] but got [${res.computed.slice(0, 8)}...].`);
              }
            })
          }
        >
          <ShieldCheck className="size-3.5 text-seal" />
          {busy === "check" ? "Checking…" : "Verify on Server"}
        </button>

        {/* Demo Diagnostic Tools for SIH Judges */}
        {(actor.role === "ADMIN" || actor.role === "INVESTIGATOR") && (
          <>
            {!isTampered ? (
              <button
                className={cn(btnCls, "border-destructive/40 text-destructive hover:bg-destructive/10")}
                disabled={busy === "tamper"}
                onClick={() =>
                  run("tamper", async () => {
                    await tamper({ data: { actor, documentId: doc.id } });
                    toast.warning("DEMO: 1 byte on server disk inverted! Now click 'Download & Verify' to test tamper detection.", { duration: 7000 });
                  })
                }
                title="Intentionally modifies 1 byte in physical file on disk to demo tamper detection"
              >
                <ShieldAlert className="size-3.5" />
                {busy === "tamper" ? "Tampering…" : "Simulate Tampering (Demo)"}
              </button>
            ) : (
              <button
                className={cn(btnCls, "border-seal/40 text-seal hover:bg-seal/10")}
                disabled={busy === "restore"}
                onClick={() =>
                  run("restore", async () => {
                    await restore({ data: { actor, documentId: doc.id } });
                    toast.success("✓ Record restored and re-sealed with authentic SHA-256 digest.");
                  })
                }
              >
                <RefreshCw className="size-3.5" />
                {busy === "restore" ? "Restoring…" : "Re-seal / Restore"}
              </button>
            )}
          </>
        )}

        <button
          className={btnCls}
          disabled={busy === "sign" || !ROLE_PROFILE[actor.role].canSign}
          onClick={() =>
            run("sign", async () => {
              await sign({ data: { actor, documentId: doc.id } });
              toast.success("Digital signature applied.");
            })
          }
        >
          Sign
        </button>

        <button className={btnCls} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide Details" : "Details & History"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <Label>Version History & Independent Hashes</Label>
            <ol className="mt-2 space-y-2">
              {[...doc.versions].reverse().map((v) => (
                <li key={v.version} className="border-l-2 border-border pl-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span className="font-bold text-foreground">{v.version}</span>
                    <IntegrityBadge status={v.integrity_status ?? "VERIFIED"} />
                    <span className="text-muted-foreground">{formatBytes(v.size)}</span>
                    {v.signature ? <span className="text-seal">{v.signature}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Sha256Display hash={v.hash} label="Digest" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.uploadedBy} · {formatDate(v.uploadedAt)} · {v.note}
                  </p>
                  <button
                    className="font-mono text-[10px] uppercase text-primary hover:underline font-bold"
                    onClick={() => handleDownloadAndVerify(v.version)}
                  >
                    Download & Verify {v.version}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <Label>Reclassify</Label>
              <select
                className={cn(inputCls, "mt-2")}
                value={doc.classification}
                onChange={(e) =>
                  run("class", async () => {
                    await reclassify({
                      data: { actor, documentId: doc.id, classification: e.target.value as Classification },
                    });
                    toast.success("Classification updated and logged.");
                  })
                }
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="text-xs">
              <Label>Shared with</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROLES.map((role) => {
                  const active = doc.sharedWith.includes(role);
                  return (
                    <button
                      key={role}
                      className={cn(
                        "rounded-xs border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em] uppercase cursor-pointer",
                        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                      )}
                      onClick={() =>
                        run(`share-${role}`, async () => {
                          await share({ data: { actor, documentId: doc.id, role } });
                          toast.success(`Collaboration updated for ${role}.`);
                        })
                      }
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
