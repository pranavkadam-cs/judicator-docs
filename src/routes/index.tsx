import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/dms/shell";
import {
  ClassificationTag,
  EmptyState,
  Label,
  Panel,
  Stat,
  StatusTag,
  formatDate,
  useSnapshot,
} from "@/components/dms/primitives";
import { useActor } from "@/components/dms/actor";
import { ROLE_PROFILE, canRead, shortHash } from "@/lib/dms-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vigil.OS — Secure Legal Document Registry" },
      {
        name: "description",
        content:
          "Command view for a secure digital document management system: case dossiers, sealed records, integrity checks and full audit trail.",
      },
      { property: "og:title", content: "Vigil.OS — Secure Legal Document Registry" },
      {
        property: "og:description",
        content:
          "Centralised, tamper-evident storage for FIRs, charge sheets, forensic reports and police asset records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Command,
});

function Command() {
  const { actor } = useActor();
  const { data, isPending, error } = useSnapshot();
  const profile = ROLE_PROFILE[actor.role];

  return (
    <AppShell title="Command overview" subtitle="Records division">
      {error ? (
        <EmptyState title="Registry unavailable" body={String(error)} />
      ) : isPending || !data ? (
        <EmptyState title="Opening the registry" body="Reading sealed records…" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Active dossiers" value={data.cases.filter((c) => c.status !== "CLOSED").length} hint={`${data.cases.length} total on file`} />
            <Stat
              label="Sealed records"
              value={data.documents.length}
              hint={`${data.documents.filter((d) => d.status === "SIGNED").length} digitally signed`}
            />
            <Stat
              label="Tamper alerts"
              value={data.documents.filter((d) => d.status === "TAMPER ALERT").length}
              hint="Digest mismatches pending review"
            />
            <Stat
              label="Assets tracked"
              value={data.assets.length}
              hint={`${data.assets.filter((a) => a.status === "MAINTENANCE").length} in maintenance`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <Label>Recent dossiers</Label>
                <Link to="/cases" className="font-mono text-[11px] uppercase text-primary hover:underline">
                  All case files
                </Link>
              </div>
              <ul className="mt-4 divide-y divide-border">
                {data.cases.slice(0, 5).map((c) => (
                  <li key={c.id} className="py-3">
                    <Link to="/cases/$caseId" params={{ caseId: c.id }} className="block hover:opacity-80">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">{c.caseNumber}</span>
                        <StatusTag value={c.status} />
                        <ClassificationTag value={c.classification} />
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{c.title}</div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <Label>Latest custody events</Label>
                <Link to="/audit" className="font-mono text-[11px] uppercase text-primary hover:underline">
                  Full trail
                </Link>
              </div>
              <ol className="mt-4 space-y-4 border-l border-border pl-4">
                {data.audit.slice(0, 6).map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
                      {e.action.replace(/_/g, " ")} · {formatDate(e.at)}
                    </div>
                    <div className="text-sm text-foreground">{e.detail}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {e.actor} · {e.role} · {shortHash(e.hash ?? "")}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          <Panel className="p-5">
            <Label>Your access envelope</Label>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="font-semibold text-foreground">{profile.label}</div>
                <p className="text-xs text-muted-foreground">Clearance level {profile.clearance}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                Filing rights: <strong className="text-foreground">{profile.canUpload ? "yes" : "no"}</strong>
              </div>
              <div className="text-xs text-muted-foreground">
                Signing authority: <strong className="text-foreground">{profile.canSign ? "yes" : "no"}</strong>
              </div>
              <div className="text-xs text-muted-foreground">
                Readable records:{" "}
                <strong className="text-foreground">
                  {data.documents.filter((d) => canRead(actor.role, d.classification)).length} of {data.documents.length}
                </strong>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
