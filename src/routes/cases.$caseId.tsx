import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import {
  ClassificationTag,
  EmptyState,
  Label,
  Panel,
  StatusTag,
  formatBytes,
  formatDate,
  useSnapshot,
} from "@/components/dms/primitives";
import { shortHash } from "@/lib/dms-types";

export const Route = createFileRoute("/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case dossier — Vigil.OS" },
      { name: "description", content: "Review a secure investigation dossier, its records, versions and integrity state." },
      { property: "og:title", content: "Case dossier — Vigil.OS" },
      { property: "og:description", content: "Secure investigation records with version and integrity details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaseDossier,
});

function CaseDossier() {
  const { caseId } = Route.useParams();
  const { data, isPending } = useSnapshot();
  const dossier = data?.cases.find((item) => item.id === caseId);
  const documents = data?.documents.filter((item) => item.caseId === caseId) ?? [];

  return (
    <AppShell title={dossier?.title ?? "Case dossier"} subtitle={dossier?.caseNumber ?? "Dossier registry"}>
      {isPending ? (
        <EmptyState title="Opening dossier" body="Reading sealed records…" />
      ) : !dossier ? (
        <EmptyState title="Dossier not found" body="This case file is unavailable or has been removed." />
      ) : (
        <div className="space-y-6">
          <Link to="/cases" className="font-mono text-[11px] uppercase text-primary hover:underline">← Case files</Link>
          <Panel className="p-5">
            <div className="flex flex-wrap gap-2"><StatusTag value={dossier.status} /><ClassificationTag value={dossier.classification} /></div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-foreground">{dossier.summary}</p>
            <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-4">
              <div><Label>Lead</Label><dd className="mt-1">{dossier.lead}</dd></div>
              <div><Label>Jurisdiction</Label><dd className="mt-1">{dossier.jurisdiction}</dd></div>
              <div><Label>Statute</Label><dd className="mt-1">{dossier.statute || "—"}</dd></div>
              <div><Label>Opened</Label><dd className="mt-1">{formatDate(dossier.openedAt)}</dd></div>
            </dl>
          </Panel>
          <div>
            <Label>Filed records · {documents.length}</Label>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {documents.map((document) => {
                const version = document.versions.find((item) => item.version === document.currentVersion) ?? document.versions[0];
                return (
                  <Panel key={document.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-primary">{document.refId}</span><StatusTag value={document.status} /><ClassificationTag value={document.classification} /></div>
                    <h2 className="mt-2 text-sm font-bold text-foreground">{document.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{document.category} · {document.currentVersion}</p>
                    {version ? <div className="mt-3 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">SHA-256 {shortHash(version.hash)} · {formatBytes(version.size)} · {formatDate(version.uploadedAt)}</div> : null}
                  </Panel>
                );
              })}
              {documents.length === 0 ? <EmptyState title="No records filed" body="This dossier does not contain documents yet." /> : null}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}