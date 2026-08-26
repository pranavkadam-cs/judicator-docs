import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import { EmptyState, Label, Panel, formatDate, useSnapshot } from "@/components/dms/primitives";
import { shortHash } from "@/lib/dms-types";
import { Search, Download, ShieldAlert, Calendar } from "lucide-react";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { data, isPending } = useSnapshot();

  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Collect all unique action types for filter dropdown
  const uniqueActions = useMemo(() => {
    if (!data?.audit) return [];
    return Array.from(new Set(data.audit.map((e) => e.action)));
  }, [data]);

  // Filter logs
  const filteredAudit = useMemo(() => {
    if (!data?.audit) return [];

    return data.audit.filter((event) => {
      // 1. Text Query (Actor, detail, target, targetId)
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

  return (
    <AppShell
      title="Custody Audit Trail"
      subtitle="Chain of custody"
      actions={
        filteredAudit.length > 0 && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer"
          >
            <Download className="size-3.5" /> Export Ledger
          </button>
        )
      }
    >
      <div className="space-y-6">
        {/* Advanced Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3.5 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by actor, target name, ID, or custody details..."
              className="w-full rounded-sm border border-border bg-surface pl-10 pr-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

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
        </div>

        {isPending ? (
          <EmptyState title="Opening audit registers" body="Reading activity records..." />
        ) : filteredAudit.length === 0 ? (
          <EmptyState title="No recorded actions" body="Modify search criteria or filters." />
        ) : (
          <Panel className="overflow-hidden animate-entry">
            <ol className="divide-y divide-border">
              {filteredAudit.map((event) => {
                const isFail = event.action.includes("FAILED") || event.action.includes("DENIED");
                return (
                  <li
                    key={event.id}
                    className={`grid gap-4 p-4 sm:grid-cols-[180px_1fr_160px] hover:bg-accent/20 transition-colors ${
                      isFail ? "bg-destructive/5" : ""
                    }`}
                  >
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatDate(event.at)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isFail && <ShieldAlert className="size-3.5 text-destructive" />}
                        <Label className={isFail ? "text-destructive" : ""}>
                          {event.action.replace(/_/g, " ")}
                        </Label>
                      </div>
                      <p className="text-sm text-foreground">{event.detail}</p>
                      <p className="text-[11px] text-muted-foreground font-semibold">
                        {event.actor} · {event.role.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground sm:text-right">
                      <div className="truncate max-w-[150px]" title={event.target}>
                        {event.target}
                      </div>
                      {event.hash && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Digest: {shortHash(event.hash)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}