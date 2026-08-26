import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import {
  ClassificationTag,
  EmptyState,
  Label,
  Panel,
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
} from "@/lib/dms.functions";
import { shortHash, ROLE_PROFILE, CLASSIFICATIONS, type Classification } from "@/lib/dms-types";
import { WorkflowActions } from "@/components/dms/workflow-actions";
import { SharePanel } from "@/components/dms/share-panel";
import { Shield, Download, CheckSquare, RefreshCw, Key } from "lucide-react";

export const Route = createFileRoute("/documents/$docId")({
  component: DocumentDetailsPage,
});

function DocumentDetailsPage() {
  const { docId } = Route.useParams();
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const refresh = useRefreshSnapshot();

  const download = useServerFn(requestDownload);
  const verify = useServerFn(checkIntegrity);
  const sign = useServerFn(applySignature);
  const reclassify = useServerFn(reclassifyDocument);

  const [busy, setBusy] = useState("");
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

  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0];
  const profile = ROLE_PROFILE[actor.role];

  async function handleRetrieve(versionStr?: string) {
    setBusy("retrieve");
    try {
      const res = await download({
        data: {
          actor,
          documentId: doc.id,
          version: versionStr,
        },
      });
      if (res.url) {
        window.open(res.url, "_blank", "noopener");
        toast.success(`Retrieval URL generated successfully. link is active.`);
      } else {
        toast.info("No S3 bucket configured. Metadata check logged to audit trail.");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to retrieve document");
    } finally {
      setBusy("");
    }
  }

  async function handleVerify(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy("verify");
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const computed = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await verify({
        data: {
          actor,
          documentId: doc.id,
          computedHash: computed,
        },
      });

      if (res.ok) {
        toast.success("Digest matches. The document is authentic.");
      } else {
        toast.error("Digest mismatch! Tamper review flag activated.");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Integrity verification failed");
    } finally {
      setBusy("");
    }
  }

  async function handleSign() {
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

        {/* Top summary card */}
        <Panel className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag value={doc.status} />
            <ClassificationTag value={doc.classification} />
            <span className="font-mono text-xs text-muted-foreground ml-auto">
              Current version: {doc.currentVersion}
            </span>
          </div>

          <dl className="grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Category</Label>
              <dd className="mt-1 text-foreground font-bold">{doc.category}</dd>
            </div>
            <div>
              <Label>Storage Host</Label>
              <dd className="mt-1 text-foreground font-mono">
                {doc.storage.toUpperCase()} Storage
              </dd>
            </div>
            <div>
              <Label>Last Sealed</Label>
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

          <div className="border-t border-border pt-4">
            <Label>SHA-256 Digest</Label>
            <div className="mt-1 font-mono text-xs text-foreground bg-background p-2.5 rounded-sm border border-border select-all break-all">
              {current?.hash}
            </div>
          </div>
        </Panel>

        {/* Actions panel */}
        <Panel className="p-4 space-y-3">
          <Label>Archive Custody Controls</Label>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => void handleRetrieve()}
              disabled={busy === "retrieve"}
              className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Download className="size-3.5" /> Retrieve File
            </button>

            <label className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer">
              <CheckSquare className="size-3.5" />
              {busy === "verify" ? "Verifying..." : "Verify Integrity"}
              <input type="file" className="hidden" onChange={handleVerify} />
            </label>

            {profile.canSign && !current?.signature && (
              <button
                onClick={handleSign}
                disabled={busy === "sign"}
                className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-seal hover:bg-seal/10 cursor-pointer"
              >
                <Key className="size-3.5" /> Apply Signature
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
              Revision History
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
              <Label className="mb-4 block">Version Log</Label>
              <ol className="relative border-l border-border pl-4 space-y-6">
                {[...doc.versions].reverse().map((v) => (
                  <li key={v.version} className="relative">
                    <span className="absolute -left-[21px] top-1 flex size-2 items-center justify-center rounded-full bg-primary" />
                    <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-foreground">
                      <span>{v.version}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{shortHash(v.hash)}</span>
                      <span className="text-muted-foreground">({formatBytes(v.size)})</span>
                      {v.signature && <span className="text-seal ml-2">Signed by {v.signedBy}</span>}
                    </div>
                    <p className="mt-1 text-xs text-foreground">{v.note}</p>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Uploaded by {v.uploadedBy}</span>
                      <span>·</span>
                      <span>{formatDate(v.uploadedAt)}</span>
                      <span>·</span>
                      <button
                        onClick={() => void handleRetrieve(v.version)}
                        className="text-primary hover:underline font-mono uppercase font-bold tracking-wider"
                      >
                        Retrieve this version
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
