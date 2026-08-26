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
import { AnalyticsCharts } from "@/components/dms/analytics-charts";
import { Shield, Clock, FileWarning, Eye } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Command,
});

function Command() {
  const { actor } = useActor();
  const { data, isPending, error } = useSnapshot();

  if (!actor) return null;
  const profile = ROLE_PROFILE[actor.role];

  return (
    <AppShell title="Command Overview" subtitle="Records Division">
      {error ? (
        <EmptyState title="Registry unavailable" body={String(error)} />
      ) : isPending || !data ? (
        <EmptyState title="Opening the registry" body="Reading sealed records…" />
      ) : (() => {
        // Filter elements based on role-based clearance
        const visibleCases = data.cases.filter((c) => canRead(actor.role, c.classification));
        const visibleDocuments = data.documents.filter((d) => canRead(actor.role, d.classification));
        const tamperAlerts = visibleDocuments.filter((d) => docStatusIsTampered(d.status)).length;
        const pendingReviews = visibleDocuments.filter((d) => d.status === "UNDER_REVIEW").length;

        // Helper to check if document status is tampered
        function docStatusIsTampered(status: string) {
          return status === "TAMPER_ALERT" || status === "TAMPER ALERT";
        }

        return (
          <div className="space-y-6">
            {/* Security Alerts Banner for Admins/Investigators */}
            {tamperAlerts > 0 && (actor.role === "ADMIN" || actor.role === "INVESTIGATOR") && (
              <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 p-4 rounded-sm animate-pulse text-destructive">
                <FileWarning className="size-5 shrink-0" />
                <div>
                  <div className="text-xs font-bold font-mono uppercase tracking-wider">Security Tamper Alert Active</div>
                  <p className="text-xs mt-0.5">
                    There are {tamperAlerts} sealed records with SHA-256 digest mismatches. Investigate immediately.
                  </p>
                </div>
                <Link
                  to="/audit"
                  className="ml-auto font-mono text-[10px] font-bold uppercase tracking-wider text-destructive border border-destructive/30 px-3 py-1.5 rounded-sm hover:bg-destructive/10 cursor-pointer"
                >
                  Audit Trail
                </Link>
              </div>
            )}

            {/* Statistics Row */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-entry">
              <Stat
                label="Active dossiers"
                value={visibleCases.filter((c) => c.status !== "CLOSED").length}
                hint={`${visibleCases.length} dossiers on file`}
              />
              <Stat
                label="Sealed records"
                value={visibleDocuments.length}
                hint={`${visibleDocuments.filter((d) => d.status === "SIGNED").length} digitally signed`}
              />
              <Stat
                label="Pending Reviews"
                value={pendingReviews}
                hint={`${visibleDocuments.filter((d) => d.status === "DRAFT").length} in draft status`}
              />
              <Stat
                label="Assets tracked"
                value={data.assets.length}
                hint={`${data.assets.filter((a) => a.status === "MAINTENANCE").length} in maintenance`}
              />
            </div>

            {/* Graphical Analytics */}
            <AnalyticsCharts cases={visibleCases} documents={visibleDocuments} />

            {/* Dashboard Lists */}
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              {/* Recent Dossiers */}
              <Panel className="p-5">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <Label>Recent dossiers</Label>
                  <Link to="/cases" className="font-mono text-[10px] uppercase font-bold text-primary hover:underline cursor-pointer">
                    All case files
                  </Link>
                </div>
                <ul className="mt-4 divide-y divide-border">
                  {visibleCases.slice(0, 5).map((c) => (
                    <li key={c.id} className="py-3">
                      <Link to="/cases/$caseId" params={{ caseId: c.id }} className="block hover:opacity-80 cursor-pointer">
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
                  {visibleCases.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      No case dossiers found matching your clearance.
                    </div>
                  )}
                </ul>
              </Panel>

              {/* Latest Custody Events */}
              <Panel className="p-5">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <Label>Latest custody events</Label>
                  <Link to="/audit" className="font-mono text-[10px] uppercase font-bold text-primary hover:underline cursor-pointer">
                    Full trail
                  </Link>
                </div>
                <ol className="mt-4 space-y-4 border-l border-border pl-4">
                  {data.audit.slice(0, 6).map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
                      <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
                        {e.action.replace(/_/g, " ")} · {formatDate(e.at)}
                      </div>
                      <div className="text-xs text-foreground mt-0.5">{e.detail}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        {e.actor} · {e.role} {e.hash && `· ${shortHash(e.hash)}`}
                      </div>
                    </li>
                  ))}
                  {data.audit.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      No activity events logged in the audit trail.
                    </div>
                  )}
                </ol>
              </Panel>
            </div>

            {/* Access Envelope Panel */}
            <Panel className="p-5">
              <div className="flex items-center gap-2 border-b border-border pb-2.5">
                <Shield className="size-4 text-primary" />
                <Label>Your Access Envelope</Label>
              </div>
              <div className="mt-4 grid gap-4 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="font-semibold text-foreground">{profile.label}</div>
                  <p className="text-[10px] text-muted-foreground">Clearance Level {profile.clearance}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Filing Rights: <strong className="text-foreground">{profile.canUpload ? "Authorised" : "Restricted"}</strong>
                </div>
                <div className="text-xs text-muted-foreground">
                  Signing Authority: <strong className="text-foreground">{profile.canSign ? "Authorised" : "Restricted"}</strong>
                </div>
                <div className="text-xs text-muted-foreground">
                  Readable Records:{" "}
                  <strong className="text-foreground">
                    {visibleDocuments.length} of {data.documents.length}
                  </strong>
                </div>
              </div>
            </Panel>
          </div>
        );
      })()}
    </AppShell>
  );
}
