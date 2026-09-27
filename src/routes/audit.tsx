import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import {
  EmptyState,
  Label,
  Panel,
  IntegrityBadge,
  Sha256Display,
  Stat,
  StatusTag,
  ClassificationTag,
  formatDate,
  useSnapshot,
  useRefreshSnapshot,
} from "@/components/dms/primitives";
import { bulkVerifyIntegrityFn } from "@/lib/dms.functions";
import { shortHash } from "@/lib/dms-types";
import { Search, Download, ShieldAlert, ShieldCheck, Calendar, Activity, Database, CheckCircle2, AlertTriangle, Eye, RefreshCw, X, Key, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const bulkVerify = useServerFn(bulkVerifyIntegrityFn);

  const [verifyingAll, setVerifyingAll] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<"logs" | "integrity">("integrity");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Collect all unique action types for filter dropdown
  const uniqueActions = useMemo(() => {
    if (!data?.audit) return [];
    return Array.from(new Set(data.audit.map((e) => e.action)));
  }, [data]);

  // Real statistics computed from database
  const stats = useMemo(() => {
    const documents = data?.documents || [];
    const totalFiles = documents.reduce((acc, d) => acc + (d.versions?.length || 1), 0);
    const tamperAlerts = documents.filter((d) => d.status === "TAMPER_ALERT").length;
    const verifiedFiles = documents.filter((d) => d.status !== "TAMPER_ALERT").length;
    const integrityFailures = (data?.audit || []).filter((e) => e.action === "INTEGRITY_FAILED").length;
    const verifiedEvents = (data?.audit || []).filter((e) => e.action === "INTEGRITY_VERIFIED").length;
    const signedDocs = documents.filter((d) => d.status === "SIGNED" || d.versions?.some((v) => !!(v as any).signatureBase64)).length;
    const sigVerifyEvents = (data?.audit || []).filter((e) => e.action === "SIGNATURE_VERIFIED" || e.action === "DOCUMENT_SIGNED").length;

    return {
      totalFiles,
      verifiedFiles,
      tamperAlerts,
      integrityFailures,
      verifiedEvents,
      signedDocs,
      sigVerifyEvents,
    };
  }, [data]);

  // Filter logs
  const filteredAudit = useMemo(() => {
    if (!data?.audit) return [];

    return data.audit.filter((event) => {
      // 1. Text Query (Actor, detail, target, targetId, hash)
      if (query) {
        const q = query.toLowerCase().trim();
        const matches =
          event.actor.toLowerCase().includes(q) ||
          event.detail.toLowerCase().includes(q) ||
          event.target.toLowerCase().includes(q) ||
          event.targetId.toLowerCase().includes(q) ||
          (event.hash && event.hash.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Action Type Filter
      if (actionFilter && event.action !== actionFilter) return false;

      // 3. Date Filters
      if (startDate) {
        const start = new Date(startDate).getTime();
        const eventDate = new Date(event.at).getTime();
        if (eventDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate).getTime() + 86400000; // include full day
        const eventDate = new Date(event.at).getTime();
        if (eventDate > end) return false;
      }

      return true;
    });
  }, [data, query, actionFilter, startDate, endDate]);

  // All document versions for Integrity Monitoring table
  const allDocVersions = useMemo(() => {
    if (!data?.documents) return [];
    const list: Array<{
      documentId: string;
      refId: string;
      title: string;
      category: string;
      classification: any;
      version: string;
      hash: string;
      uploadedAt: string;
      uploadedBy: string;
      lastVerifiedAt: string | null;
      verificationCount: number;
      integrityStatus: string;
      isTampered: boolean;
    }> = [];

    data.documents.forEach((doc) => {
      doc.versions.forEach((v) => {
        const isTampered = doc.status === "TAMPER_ALERT" || v.integrity_status === "TAMPER_ALERT";
        list.push({
          documentId: doc.id,
          refId: doc.refId,
          title: doc.name,
          category: doc.category,
          classification: doc.classification,
          version: v.version,
          hash: v.hash,
          uploadedAt: v.uploadedAt,
          uploadedBy: v.uploadedBy,
          lastVerifiedAt: v.last_verified_at || null,
          verificationCount: v.verification_count || 1,
          integrityStatus: v.integrity_status || (isTampered ? "TAMPER_ALERT" : "VERIFIED"),
          isTampered,
        });
      });
    });

    if (!query) return list;
    const q = query.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.refId.toLowerCase().includes(q) ||
        item.hash.toLowerCase().includes(q) ||
        item.uploadedBy.toLowerCase().includes(q),
    );
  }, [data, query]);

  // Export audit logs to CSV format
  function exportCSV() {
    if (filteredAudit.length === 0) return;
    const headers = "Timestamp,Actor,Role,Action,Target Name,Target ID,Detail,SHA-256 Digest\n";
    const rows = filteredAudit
      .map((e) => {
        const timestamp = e.at;
        const actorName = `"${e.actor.replace(/"/g, '""')}"`;
        const roleName = e.role;
        const actionName = e.action;
        const targetName = `"${e.target.replace(/"/g, '""')}"`;
        const targetId = e.targetId;
        const detail = `"${e.detail.replace(/"/g, '""')}"`;
        const digest = e.hash || "";
        return `${timestamp},${actorName},${roleName},${actionName},${targetName},${targetId},${detail},${digest}`;
      })
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `VigilOS_Audit_Trail_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleBulkVerify() {
    if (!actor) {
      toast.error("Active officer credentials required to execute bulk audit.");
      return;
    }
    setVerifyingAll(true);
    try {
      const res = await bulkVerify({
        data: { actor },
      });
      setBulkResult(res);
      await refresh();
      if (res.tampered > 0) {
        toast.error(`Audit Complete: ${res.verified} verified, ${res.tampered} TAMPER ALERTS detected!`, { duration: 6000 });
      } else {
        toast.success(`Integrity Audit Complete: All ${res.verified} files verified cryptographically intact!`, { duration: 5000 });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to execute bulk integrity verification.");
    } finally {
      setVerifyingAll(false);
    }
  }

  return (
    <AppShell
      title="Security & Integrity Audit"
      subtitle="Chain of Custody & SHA-256 Verification Center"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleBulkVerify}
            disabled={verifyingAll}
            className="flex items-center gap-1.5 rounded-sm border border-seal/60 bg-seal/10 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-seal hover:bg-seal/20 disabled:opacity-50 cursor-pointer transition-colors"
            title="Compute and verify SHA-256 digests for all files across disk/cloud storage"
          >
            <ShieldCheck className={cn("size-3.5", verifyingAll && "animate-spin")} />
            {verifyingAll ? "Auditing Vault…" : "Run Full Integrity Audit"}
          </button>
          {filteredAudit.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              <Download className="size-3.5" /> Export Ledger CSV
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Bulk Scan Results Banner */}
        {bulkResult && (
          <div className="rounded-sm border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-seal" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                  Vault Integrity Audit Results
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({bulkResult.total} scanned)
                </span>
              </div>
              <button
                onClick={() => setBulkResult(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 font-mono text-xs">
              <div className="rounded-xs bg-background p-2.5 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase">Verified Intact</div>
                <div className="text-lg font-bold text-seal">{bulkResult.verified}</div>
              </div>
              <div className="rounded-xs bg-background p-2.5 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase">Tamper Alerts</div>
                <div className={cn("text-lg font-bold", bulkResult.tampered > 0 ? "text-destructive" : "text-foreground")}>
                  {bulkResult.tampered}
                </div>
              </div>
              <div className="rounded-xs bg-background p-2.5 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase">Skipped / Pending</div>
                <div className="text-lg font-bold text-muted-foreground">{bulkResult.skipped}</div>
              </div>
              <div className="rounded-xs bg-background p-2.5 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase">Storage Integrity</div>
                <div className="text-lg font-bold text-primary">
                  {bulkResult.total > 0 ? `${Math.round((bulkResult.verified / bulkResult.total) * 100)}%` : "100%"}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Real-time Statistics Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Panel className="p-4">
            <Label>Total Tracked Files</Label>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">{stats.totalFiles}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Active dockets in registry</p>
          </Panel>
          <Panel className="p-4">
            <Label>Integrity Verified</Label>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-seal">{stats.verifiedFiles}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Matching SHA-256 digests</p>
          </Panel>
          <Panel className={cn("p-4", stats.tamperAlerts > 0 && "border-destructive/60 bg-destructive/10")}>
            <Label className={stats.tamperAlerts > 0 ? "text-destructive" : ""}>Active Tamper Alerts</Label>
            <div className={cn("mt-2 font-mono text-2xl font-bold tabular-nums", stats.tamperAlerts > 0 ? "text-destructive animate-pulse" : "text-foreground")}>
              {stats.tamperAlerts}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Hash mismatch incidents</p>
          </Panel>
          <Panel className="p-4">
            <Label>Integrity Verifications</Label>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-primary">{stats.verifiedEvents}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Successful intake/retrievals</p>
          </Panel>
          <Panel className="p-4">
            <Label>Integrity Failures Logged</Label>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-destructive">{stats.integrityFailures}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Blocked download attempts</p>
          </Panel>
          <Panel className="p-4 border-seal/30 bg-seal/5">
            <Label className="text-seal">RSA-SHA256 Signed Docs</Label>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-seal">{stats.signedDocs}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Cryptographically signed</p>
          </Panel>
          <Panel className="p-4">
            <Label>Signature Events</Label>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-primary">{stats.sigVerifyEvents}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Sign + verification operations</p>
          </Panel>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("integrity")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-colors",
              activeTab === "integrity"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <ShieldCheck className="size-4" /> File Integrity Monitoring
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-colors",
              activeTab === "logs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Activity className="size-4" /> Custody Event Logs
          </button>
        </div>

        {/* Search & Filter Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3.5 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by file, actor, target ID, detail, or SHA-256 digest..."
              className="w-full rounded-sm border border-border bg-surface pl-10 pr-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {activeTab === "logs" && (
            <div className="flex flex-wrap gap-2">
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary cursor-pointer"
              >
                <option value="">All Action Types</option>
                {uniqueActions.map((act) => (
                  <option key={act} value={act}>
                    {act.replace(/_/g, " ")}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Calendar className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-sm border border-border bg-surface pl-8 pr-2 py-1.5 text-xs outline-none focus:border-primary"
                  title="Start date filter"
                />
              </div>

              <div className="relative">
                <Calendar className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-sm border border-border bg-surface pl-8 pr-2 py-1.5 text-xs outline-none focus:border-primary"
                  title="End date filter"
                />
              </div>
            </div>
          )}
        </div>

        {isPending ? (
          <EmptyState title="Opening audit registers" body="Reading activity records..." />
        ) : activeTab === "integrity" ? (
          /* File Integrity Monitoring View */
          allDocVersions.length === 0 ? (
            <EmptyState title="No records found" body="Adjust search query." />
          ) : (
            <Panel className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Document File
                      </th>
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        SHA-256 Digest
                      </th>
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Upload Date
                      </th>
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Uploaded By
                      </th>
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Last Verification
                      </th>
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Integrity Status
                      </th>
                      <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Digital Signature
                      </th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allDocVersions.map((item) => (
                      <tr
                        key={`${item.documentId}-${item.version}`}
                        className={cn(
                          "hover:bg-accent/40 transition-colors",
                          item.isTampered && "bg-destructive/10 hover:bg-destructive/15",
                        )}
                      >
                        <td className="p-4">
                          <div>
                            <div className="font-bold text-foreground flex items-center gap-2">
                              <span>{item.title}</span>
                              <span className="font-mono text-xs text-primary font-normal">({item.version})</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              {item.refId} · {item.category}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Sha256Display hash={item.hash} />
                        </td>
                        <td className="p-4 text-xs font-mono text-muted-foreground">
                          {formatDate(item.uploadedAt)}
                        </td>
                        <td className="p-4 text-xs font-semibold text-foreground">
                          {item.uploadedBy}
                        </td>
                        <td className="p-4 text-xs font-mono text-muted-foreground">
                          {item.lastVerifiedAt ? formatDate(item.lastVerifiedAt) : "On intake"}
                        </td>
                        <td className="p-4">
                          <IntegrityBadge status={item.integrityStatus} />
                        </td>
                        <td className="p-4">
                          {(() => {
                            const doc = data?.documents?.find(d => d.id === item.documentId);
                            const v = doc?.versions?.find(v2 => v2.version === item.version);
                            return (v as any)?.signatureBase64 ? (
                              <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-seal">
                                <BadgeCheck className="size-3" /> RSA-SHA256
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">Unsigned</span>
                            );
                          })()}
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            to="/documents/$docId"
                            params={{ docId: item.documentId }}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                          >
                            <Eye className="size-3" /> Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )
        ) : (
          /* Custody Event Logs View */
          filteredAudit.length === 0 ? (
            <EmptyState title="No recorded actions" body="Modify search criteria or filters." />
          ) : (
            <Panel className="overflow-hidden animate-entry">
              <ol className="divide-y divide-border">
                {filteredAudit.map((event) => {
                  const isFail = event.action.includes("FAILED") || event.action.includes("DENIED");
                  const isVerify = event.action.includes("VERIFIED") || event.action === "DOCUMENT_SIGNED";
                  const isSig = event.action === "DOCUMENT_SIGNED" || event.action.includes("SIGNATURE");
                  return (
                    <li
                      key={event.id}
                      className={cn(
                        "grid gap-4 p-4 sm:grid-cols-[180px_1fr_200px] hover:bg-accent/20 transition-colors",
                        isFail && "bg-destructive/10",
                        isSig && !isFail && "bg-seal/5",
                        !isSig && isVerify && !isFail && "bg-seal/5",
                      )}
                    >
                      <div className="font-mono text-xs text-muted-foreground">
                        {formatDate(event.at)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {isFail ? (
                            <ShieldAlert className="size-3.5 text-destructive animate-pulse" />
                          ) : event.action === "DOCUMENT_SIGNED" ? (
                            <Key className="size-3.5 text-seal" />
                          ) : event.action === "SIGNATURE_VERIFIED" ? (
                            <BadgeCheck className="size-3.5 text-seal" />
                          ) : event.action === "SIGNATURE_VERIFICATION_FAILED" ? (
                            <BadgeCheck className="size-3.5 text-destructive" />
                          ) : isVerify ? (
                            <ShieldCheck className="size-3.5 text-seal" />
                          ) : null}
                          <Label className={
                            isFail ? "text-destructive font-bold"
                            : event.action === "DOCUMENT_SIGNED" || event.action === "SIGNATURE_VERIFIED" ? "text-seal font-bold"
                            : event.action === "SIGNATURE_VERIFICATION_FAILED" ? "text-destructive font-bold"
                            : isVerify ? "text-seal" : ""
                          }>
                            {event.action.replace(/_/g, " ")}
                          </Label>
                        </div>
                        <p className="text-sm text-foreground">{event.detail}</p>
                        <p className="text-[11px] text-muted-foreground font-semibold">
                          {event.actor} · {event.role.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground sm:text-right space-y-1">
                        <div className="truncate max-w-[190px]" title={event.target}>
                          {event.target}
                        </div>
                        {event.hash && (
                          <div className="text-[10px] text-muted-foreground">
                            <span className="font-bold">SHA-256:</span> {shortHash(event.hash)}
                          </div>
                        )}
                        {event.actionTaken && (
                          <div className={cn("text-[10px] font-bold uppercase", isFail ? "text-destructive" : "text-seal")}>
                            Action: {event.actionTaken.replace(/_/g, " ")}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )
        )}
      </div>
    </AppShell>
  );
}
