import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import {
  EmptyState,
  Label,
  Panel,
  Stat,
  StatusTag,
  ClassificationTag,
  IntegrityBadge,
  formatDate,
  formatBytes,
  useSnapshot,
} from "@/components/dms/primitives";
import { useActor } from "@/components/dms/actor";
import { canRead, shortHash } from "@/lib/dms-types";
import { IntegrityCertificate } from "@/components/dms/integrity-certificate";
import {
  FileText,
  Download,
  Shield,
  Search,
  Printer,
  BarChart3,
  FileCheck,
} from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Vigil.OS" },
      { name: "description", content: "Generate integrity certificates, audit exports, and case summary reports." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const [certDocId, setCertDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (!actor) return null;

  const visibleDocuments = (data?.documents || []).filter((d) =>
    canRead(actor.role, d.classification),
  );
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return visibleDocuments;
    const q = searchQuery.toLowerCase();
    return visibleDocuments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.refId.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [visibleDocuments, searchQuery]);

  const certDoc = certDocId
    ? data?.documents.find((d) => d.id === certDocId)
    : null;
  const certCase = certDoc
    ? data?.cases.find((c) => c.id === certDoc.caseId)
    : undefined;

  function handleExportAudit() {
    if (!data?.audit) return;
    const headers = [
      "Timestamp",
      "Action",
      "Actor",
      "Role",
      "Target",
      "Detail",
      "SHA-256 Hash",
    ];
    const rows = data.audit.map((e) => [
      e.at,
      e.action,
      e.actor,
      e.role,
      e.target,
      `"${e.detail.replace(/"/g, '""')}"`,
      e.hash || "",
    ]);
    const csv =
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vigil-os-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleExportCaseSummary(caseId: string) {
    if (!data) return;
    const cs = data.cases.find((c) => c.id === caseId);
    if (!cs) return;
    const docs = data.documents.filter((d) => d.caseId === caseId);
    const auditEntries = data.audit.filter(
      (e) =>
        e.targetId === caseId ||
        docs.some((d) => e.targetId === d.id),
    );

    const lines = [
      `VIGIL.OS — CASE SUMMARY REPORT`,
      `Generated: ${new Date().toISOString()}`,
      `${"=".repeat(60)}`,
      ``,
      `Case Number: ${cs.caseNumber}`,
      `Title: ${cs.title}`,
      `Summary: ${cs.summary}`,
      `Status: ${cs.status}`,
      `Priority: ${cs.priority}`,
      `Classification: ${cs.classification}`,
      `Jurisdiction: ${cs.jurisdiction}`,
      `Lead: ${cs.lead}`,
      `Statute: ${cs.statute}`,
      `Opened: ${cs.openedAt}`,
      ``,
      `${"─".repeat(60)}`,
      `DOCUMENTS (${docs.length})`,
      `${"─".repeat(60)}`,
      ...docs.map(
        (d) =>
          `  [${d.refId}] ${d.name} | ${d.category} | ${d.status} | ${d.classification} | SHA-256: ${shortHash(d.versions[0]?.hash || "—")}`,
      ),
      ``,
      `${"─".repeat(60)}`,
      `AUDIT TRAIL (${auditEntries.length} events)`,
      `${"─".repeat(60)}`,
      ...auditEntries.slice(0, 50).map(
        (e) =>
          `  [${e.at}] ${e.action} — ${e.actor} (${e.role}): ${e.detail}`,
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vigil-case-${cs.caseNumber}-summary.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <AppShell title="Reports & Certificates" subtitle="Forensic Intelligence Division">
      {isPending || !data ? (
        <EmptyState title="Loading reports" body="Preparing report engine…" />
      ) : (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-entry">
            <Stat
              label="Total documents"
              value={visibleDocuments.length}
              hint={`${visibleDocuments.filter((d) => d.status === "SIGNED").length} digitally signed`}
            />
            <Stat
              label="Integrity verified"
              value={visibleDocuments.filter((d) => d.status !== "TAMPER_ALERT").length}
              hint={`${visibleDocuments.filter((d) => d.status === "TAMPER_ALERT").length} tamper alerts`}
            />
            <Stat
              label="OCR processed"
              value={visibleDocuments.filter((d) => d.ocr_status === "COMPLETED").length}
              hint={`${visibleDocuments.filter((d) => d.ocr_text).reduce((a, d) => a + (d.ocr_text?.length || 0), 0)} chars extracted`}
            />
            <Stat
              label="Audit events"
              value={data.audit.length}
              hint="Complete chain of custody"
            />
          </div>

          {/* Export Actions */}
          <Panel className="p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Label>Quick Export Actions</Label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportAudit}
                className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
              >
                <Download className="size-3.5" />
                Export Full Audit Trail (CSV)
              </button>
              {data.cases.slice(0, 3).map((cs) => (
                <button
                  key={cs.id}
                  onClick={() => handleExportCaseSummary(cs.id)}
                  className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                >
                  <BarChart3 className="size-3.5" />
                  Case {cs.caseNumber} Summary
                </button>
              ))}
            </div>
          </Panel>

          {/* Certificate Generator */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-seal" />
                <Label>Document Integrity Certificate Generator</Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Select a document to generate a comprehensive, printable integrity certificate containing SHA-256
              cryptographic proof, blockchain anchoring details, version history, OCR summary, and full chain of custody.
            </p>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents by name, reference, or category…"
                className="w-full rounded-sm border border-border bg-background pl-9 pr-3 py-2 text-xs outline-none focus:border-primary"
              />
            </div>

            {/* Document list */}
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {filteredDocs.map((doc) => {
                const v = doc.versions[0];
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-sm border border-border p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {doc.refId}
                        </span>
                        <StatusTag value={doc.status} />
                        <ClassificationTag value={doc.classification} />
                        <IntegrityBadge
                          status={
                            doc.status === "TAMPER_ALERT"
                              ? "TAMPER_ALERT"
                              : "VERIFIED"
                          }
                        />
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground truncate">
                        {doc.name}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {doc.category} · {formatBytes(v?.size ?? 0)} · SHA-256:{" "}
                        {shortHash(v?.hash || "")}
                      </div>
                    </div>
                    <button
                      onClick={() => setCertDocId(doc.id)}
                      className="shrink-0 flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
                    >
                      <Printer className="size-3.5" />
                      Generate Certificate
                    </button>
                  </div>
                );
              })}
              {filteredDocs.length === 0 && (
                <EmptyState
                  title="No documents found"
                  body="Adjust your search query or clearance level."
                />
              )}
            </div>
          </Panel>

          {/* Certificate Modal */}
          {certDoc && (
            <IntegrityCertificate
              document={certDoc}
              caseFile={certCase}
              auditEvents={data.audit}
              onClose={() => setCertDocId(null)}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
