import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import { EmptyState, Label, Panel, formatDate, useSnapshot } from "@/components/dms/primitives";
import { shortHash } from "@/lib/dms-types";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [
    { title: "Audit trail — Vigil.OS" },
    { name: "description", content: "Review the immutable chain of custody for case, document and asset activity." },
    { property: "og:title", content: "Audit trail — Vigil.OS" },
    { property: "og:description", content: "Complete activity and chain-of-custody history for protected records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuditPage,
});

function AuditPage() {
  const { data, isPending } = useSnapshot();
  return (
    <AppShell title="Audit trail" subtitle="Chain of custody">
      {isPending ? <EmptyState title="Loading audit trail" body="Verifying activity records…" /> : !data?.audit.length ? <EmptyState title="No recorded activity" body="Audit events will appear here." /> : (
        <Panel className="overflow-hidden">
          <ol className="divide-y divide-border">
            {data.audit.map((event) => (
              <li key={event.id} className="grid gap-2 p-4 sm:grid-cols-[180px_1fr_160px]">
                <div className="font-mono text-[11px] text-muted-foreground">{formatDate(event.at)}</div>
                <div><Label>{event.action.replace(/_/g, " ")}</Label><p className="mt-1 text-sm text-foreground">{event.detail}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor} · {event.role}</p></div>
                <div className="font-mono text-[11px] text-muted-foreground sm:text-right">{event.target}<br />{shortHash(event.hash ?? "")}</div>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </AppShell>
  );
}