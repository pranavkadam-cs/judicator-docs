import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  applySignature,
  checkIntegrity,
  fileDocument,
  reclassifyDocument,
  requestDownload,
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
  Label,
  Panel,
  StatusTag,
  formatBytes,
  formatDate,
  hashFile,
  useRefreshSnapshot,
} from "./primitives";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";
const btnCls =
  "rounded-sm border border-border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.12em] uppercase transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtn =
  "rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.12em] text-primary-foreground uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Operation refused by the registry.";
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
  const [busy, setBusy] = useState(false);
  const canUpload = ROLE_PROFILE[actor.role].canUpload;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!payload) {
      toast.error("Attach the document file so a digest can be sealed.");
      return;
    }
    setBusy(true);
    try {
      const digest = await hashFile(payload);
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
          ...(revisionOf ? { documentId: revisionOf } : {}),
        },
      });
      if (result.uploadUrl) {
        await fetch(result.uploadUrl, { method: result.uploadMethod, body: payload });
      }
      toast.success(
        `${result.document.refId} sealed at ${result.document.currentVersion} · SHA-256 ${shortHash(digest)}`,
      );
      setName("");
      setNote("");
      setPayload(null);
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
          {ROLE_PROFILE[actor.role].label} has read-only filing rights. Switch personnel to file records.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      <Label>Secure intake</Label>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-xs sm:col-span-2">
          <span className="text-muted-foreground">Document file</span>
          <input
            type="file"
            required
            onChange={(e) => setPayload(e.target.files?.[0] ?? null)}
            className={cn(inputCls, "mt-1 file:mr-3 file:border-0 file:bg-transparent file:font-mono file:text-xs")}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Title</span>
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
          <span className="text-muted-foreground">Custody note</span>
          <input className={cn(inputCls, "mt-1")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for filing / chain-of-custody remark" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? "Sealing…" : "Seal & file record"}
          </button>
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
  const sign = useServerFn(applySignature);
  const reclassify = useServerFn(reclassifyDocument);
  const share = useServerFn(toggleShare);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0];

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
      await refresh();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-primary">{doc.refId}</span>
        <StatusTag value={doc.status} />
        <ClassificationTag value={doc.classification} />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{doc.currentVersion}</span>
      </div>
      <h3 className="mt-2 text-sm font-bold text-foreground">{doc.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {doc.category} · {doc.storage === "s3" ? "S3 object store" : "local registry"} · updated {formatDate(doc.updatedAt)}
      </p>
      {current ? (
        <p className="mt-3 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
          SHA-256 {shortHash(current.hash)} · {formatBytes(current.size)} ·{" "}
          {current.signature ? `signed by ${current.signedBy}` : "unsigned"}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={btnCls}
          disabled={busy === "get"}
          onClick={() =>
            run("get", async () => {
              const res = await download({ data: { actor, documentId: doc.id } });
              if (res.url) {
                window.open(res.url, "_blank", "noopener");
                toast.success(`Retrieval link issued (${res.expiresIn}s).`);
              } else {
                toast.info("No object store linked — metadata access logged instead.");
              }
            })
          }
        >
          Retrieve
        </button>

        <label className={cn(btnCls, "cursor-pointer")}>
          {busy === "verify" ? "Verifying…" : "Verify integrity"}
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void run("verify", async () => {
                const computed = await hashFile(f);
                const res = await verify({ data: { actor, documentId: doc.id, computedHash: computed } });
                if (res.ok) toast.success("Digest matches — record is intact.");
                else toast.error("Digest mismatch — record flagged as TAMPER ALERT.");
              });
            }}
          />
        </label>

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
          {open ? "Hide detail" : "Detail"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <Label>Version history</Label>
            <ol className="mt-2 space-y-2">
              {[...doc.versions].reverse().map((v) => (
                <li key={v.version} className="border-l-2 border-border pl-3">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span className="font-bold text-foreground">{v.version}</span>
                    <span className="text-muted-foreground">{shortHash(v.hash)}</span>
                    <span className="text-muted-foreground">{formatBytes(v.size)}</span>
                    {v.signature ? <span className="text-seal">{v.signature}</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {v.uploadedBy} · {formatDate(v.uploadedAt)} · {v.note}
                  </p>
                  <button
                    className="mt-1 font-mono text-[10px] uppercase text-primary hover:underline"
                    onClick={() =>
                      run(`v-${v.version}`, async () => {
                        const res = await download({ data: { actor, documentId: doc.id, version: v.version } });
                        if (res.url) window.open(res.url, "_blank", "noopener");
                        else toast.info(`Revision ${v.version} inspected — access logged.`);
                      })
                    }
                  >
                    Retrieve revision
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
                        "rounded-xs border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em] uppercase",
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
