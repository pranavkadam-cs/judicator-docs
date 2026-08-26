import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import {
  ClassificationTag,
  EmptyState,
  Label,
  Panel,
  StatusTag,
  PriorityTag,
  formatDate,
  useRefreshSnapshot,
  useSnapshot,
} from "@/components/dms/primitives";
import { updateCaseFn } from "@/lib/dms.functions";
import { CASE_STATUSES, CASE_PRIORITIES, canRead, type CaseStatus, type CasePriority } from "@/lib/dms-types";
import { IntakeForm, DocumentCard } from "@/components/dms/records";
import { Settings, FileText, UserPlus, Users, Edit3 } from "lucide-react";

export const Route = createFileRoute("/cases/$caseId")({
  component: CaseDossier,
});

function CaseDossier() {
  const { caseId } = Route.useParams();
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const updateCase = useServerFn(updateCaseFn);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    status: "OPEN" as CaseStatus,
    priority: "MEDIUM" as CasePriority,
    summary: "",
    assignedOfficerIds: [] as string[],
  });

  const dossier = data?.cases.find((item) => item.id === caseId);

  // Initialize edit form when case details are loaded
  useMemo(() => {
    if (dossier) {
      setForm({
        status: dossier.status,
        priority: dossier.priority,
        summary: dossier.summary,
        assignedOfficerIds: dossier.assignedOfficerIds || [],
      });
    }
  }, [dossier]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateCase({
        data: {
          actor,
          caseId,
          ...form,
        },
      }),
    onSuccess: async () => {
      toast.success("Case file credentials modified.");
      setEditOpen(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filter documents inside this case based on user role clearance
  const visibleDocuments = useMemo(() => {
    if (!data?.documents) return [];
    return data.documents.filter(
      (item) => item.caseId === caseId && canRead(actor.role, item.classification),
    );
  }, [data, caseId, actor]);

  const allPersonnel = data?.users ?? [];

  if (isPending) {
    return (
      <AppShell title="Opening dossier" subtitle="Dossier registry">
        <EmptyState title="Opening dossier" body="Reading sealed records…" />
      </AppShell>
    );
  }

  if (!dossier) {
    return (
      <AppShell title="Dossier Unavailable" subtitle="Dossier registry">
        <EmptyState title="Dossier not found" body="This case file is unavailable or has been removed." />
      </AppShell>
    );
  }

  const isAssigned =
    actor.role === "ADMIN" ||
    dossier.leadId === actor.id ||
    dossier.assignedOfficerIds?.includes(actor.id);

  return (
    <AppShell title={dossier.title} subtitle={dossier.caseNumber}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/cases" className="font-mono text-[11px] uppercase text-primary hover:underline">
            ← Case dossiers
          </Link>
          {isAssigned && actor.role !== "VIEWER" && (
            <button
              onClick={() => setEditOpen(!editOpen)}
              className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
            >
              <Edit3 className="size-3.5" />
              {editOpen ? "Close Controls" : "Edit Dossier"}
            </button>
          )}
        </div>

        {/* Edit Case Panel */}
        {editOpen && (
          <Panel className="p-5 animate-entry">
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <Settings className="size-4 text-primary" />
              <Label>Edit Case Metadata</Label>
            </div>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate();
              }}
            >
              <div>
                <Label className="mb-1.5 block">Case Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as CaseStatus })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {CASE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="mb-1.5 block">Case Priority</Label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as CasePriority })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {CASE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p} Priority
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <Label className="mb-1.5 block">Case Summary / Description</Label>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  className="w-full min-h-[80px] rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="mb-1.5 block">Assigned Personnel</Label>
                <div className="grid grid-cols-2 gap-2 bg-background p-3 border border-border rounded-sm max-h-[140px] overflow-y-auto">
                  {allPersonnel
                    .filter((u) => u.id !== dossier.leadId)
                    .map((u) => {
                      const checked = form.assignedOfficerIds.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            className="rounded-xs"
                            onChange={() => {
                              const updated = checked
                                ? form.assignedOfficerIds.filter((id) => id !== u.id)
                                : [...form.assignedOfficerIds, u.id];
                              setForm({ ...form, assignedOfficerIds: updated });
                            }}
                          />
                          <span>
                            {u.name} ({u.role.replace(/_/g, " ")})
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50 cursor-pointer"
                >
                  {updateMutation.isPending ? "Saving changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </Panel>
        )}

        {/* Case Metadata Details */}
        <Panel className="p-5">
          <div className="flex flex-wrap gap-2">
            <StatusTag value={dossier.status} />
            <ClassificationTag value={dossier.classification} />
            <PriorityTag value={dossier.priority} />
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-foreground">{dossier.summary}</p>
          <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-4">
            <div>
              <Label>Lead Investigator</Label>
              <dd className="mt-1 font-bold">{dossier.lead}</dd>
            </div>
            <div>
              <Label>Jurisdiction</Label>
              <dd className="mt-1">{dossier.jurisdiction}</dd>
            </div>
            <div>
              <Label>Statute Clause</Label>
              <dd className="mt-1 font-mono">{dossier.statute || "—"}</dd>
            </div>
            <div>
              <Label>Opened At</Label>
              <dd className="mt-1">{formatDate(dossier.openedAt)}</dd>
            </div>
          </dl>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* Filed documents list */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <Label>Sealed Case Files · {visibleDocuments.length}</Label>
            </div>

            <div className="space-y-3">
              {visibleDocuments.map((document) => (
                <DocumentCard key={document.id} document={document} />
              ))}
              {visibleDocuments.length === 0 && (
                <EmptyState
                  title="No files catalogued"
                  body="This dossier contains no documents matching your security clearance."
                />
              )}
            </div>
          </div>

          {/* Secure intake form & Assigned officers panel */}
          <div className="space-y-6">
            {isAssigned && actor.role !== "VIEWER" && (
              <IntakeForm caseId={dossier.id} documents={data?.documents.filter((d) => d.caseId === caseId) ?? []} />
            )}

            <Panel className="p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2 flex-wrap">
                <Users className="size-4 text-primary" />
                <Label>Assigned Officers ({dossier.assignedOfficerIds?.length ?? 1})</Label>
              </div>
              <ul className="space-y-2.5 text-xs">
                <li className="flex justify-between items-center bg-accent/25 px-2 py-1.5 rounded-xs border border-border/40">
                  <span className="font-bold text-foreground">{dossier.lead}</span>
                  <span className="font-mono text-[9px] text-primary uppercase font-bold tracking-wider">
                    Lead Officer
                  </span>
                </li>
                {dossier.assignedOfficerIds
                  ?.filter((uid) => uid !== dossier.leadId)
                  .map((uid) => {
                    const u = allPersonnel.find((x) => x.id === uid);
                    if (!u) return null;
                    return (
                      <li key={uid} className="flex justify-between items-center px-2 py-1">
                        <span className="font-semibold">{u.name}</span>
                        <span className="font-mono text-[9px] text-muted-foreground uppercase">
                          {u.role.replace(/_/g, " ")}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}