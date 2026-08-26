import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import { EmptyState, Label, Panel, StatusTag, formatDate, useSnapshot } from "@/components/dms/primitives";

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [
    { title: "Police assets — Vigil.OS" },
    { name: "description", content: "Monitor police assets, assignments, maintenance and lifecycle history." },
    { property: "og:title", content: "Police assets — Vigil.OS" },
    { property: "og:description", content: "Lifecycle monitoring for operational police assets." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AssetsPage,
});

function AssetsPage() {
  const { data, isPending } = useSnapshot();
  return (
    <AppShell title="Police assets" subtitle="Lifecycle registry">
      {isPending ? <EmptyState title="Loading assets" body="Reading lifecycle records…" /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.assets.map((asset) => (
            <Panel key={asset.id} className="p-4">
              <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold text-primary">{asset.tag}</span><StatusTag value={asset.status} /></div>
              <h2 className="mt-2 text-base font-bold text-foreground">{asset.name}</h2>
              <p className="text-xs text-muted-foreground">{asset.category} · Serial {asset.serial}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                <div><Label>Station</Label><dd className="mt-1">{asset.station}</dd></div>
                <div><Label>Custodian</Label><dd className="mt-1">{asset.assignedTo || "Unassigned"}</dd></div>
                <div><Label>Acquired</Label><dd className="mt-1">{formatDate(asset.acquiredAt)}</dd></div>
                <div><Label>Last service</Label><dd className="mt-1">{formatDate(asset.lastServiceAt)}</dd></div>
              </dl>
            </Panel>
          ))}
          {!data?.assets.length ? <EmptyState title="No assets registered" body="The lifecycle registry is empty." /> : null}
        </div>
      )}
    </AppShell>
  );
}