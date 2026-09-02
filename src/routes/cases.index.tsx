import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { openCase } from "@/lib/dms.functions";
import { CLASSIFICATIONS, CASE_PRIORITIES, canRead, type Classification, type CasePriority } from "@/lib/dms-types";
import { Briefcase, Calendar, FolderPlus } from "lucide-react";

export const Route = createFileRoute("/cases/")({
  component: CasesPage,
});

function CasesPage() {
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const create = useServerFn(openCase);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    caseNumber: "",
    summary: "",
    jurisdiction: "",
    statute: "",
    classification: "CONFIDENTIAL" as Classification,
    priority: "MEDIUM" as CasePriority,
    assignedOfficerIds: [] as string[],
  });

  const mutation = useMutation({
    mutationFn: () => create({ data: { actor, ...form } }),
    onSuccess: async () => {
      toast.success("Case dossier opened and logged to the audit trail.");
      setOpen(false);
      setForm({
        title: "",
        caseNumber: "",
        summary: "",
        jurisdiction: "",
        statute: "",
        classification: "CONFIDENTIAL",
        priority: "MEDIUM",
        assignedOfficerIds: [],
      });
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filter visible cases based on clearance level and query
  const cases = useMemo(() => {
    if (!data?.cases || !actor) return [];

    // 1. Role-based clearance check
    let visible = data.cases.filter((c) => canRead(actor.role, c.classification));

    // 2. Search query check
    const q = query.trim().toLowerCase();
    if (q) {
      visible = visible.filter((c) =>
        [c.caseNumber, c.title, c.summary, c.jurisdiction, c.statute, c.lead, ...c.tags]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return visible;
  }, [data, query, actor]);

  const allPersonnel = data?.users ?? [];

  return (
    <AppShell
      title="Case Dossier Registry"
      subtitle="Records Division"
      actions={
        actor &&
        actor.role !== "VIEWER" && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground hover:opacity-90 cursor-pointer"
          >
            {open ? "Cancel" : "Open Dossier"}
          </button>
        )
      }
    >
      <div className="space-y-6">
        {open && (
          <Panel className="p-5 animate-entry">
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <FolderPlus className="size-4 text-primary" />
              <Label>Register New Case Dossier</Label>
            </div>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <Field
                label="Case ID / Docket Number"
                value={form.caseNumber}
                onChange={(v) => setForm({ ...form, caseNumber: v })}
                placeholder="e.g. 2024-ND-8891"
                required
              />
              <Field
                label="Case Title"
                value={form.title}
                onChange={(v) => setForm({ ...form, title: v })}
                placeholder="e.g. Operation Silver Spoke"
                required
              />
              <Field
                label="Jurisdiction Area"
                value={form.jurisdiction}
                onChange={(v) => setForm({ ...form, jurisdiction: v })}
                placeholder="e.g. Precinct 9"
                required
              />
              <Field
                label="Filing Statute"
                value={form.statute}
                onChange={(v) => setForm({ ...form, statute: v })}
                placeholder="e.g. IPC 420 / 120B"
              />
              <div className="sm:col-span-2">
                <Label className="mb-1.5 block">Summary / Description</Label>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  placeholder="Case brief, primary suspects, and initial facts..."
                  className="w-full min-h-[80px] rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <Label className="mb-1.5 block">Security Classification</Label>
                <select
                  value={form.classification}
                  onChange={(e) => setForm({ ...form, classification: e.target.value as Classification })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="mb-1.5 block">Priority Rating</Label>
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
                <Label className="mb-1.5 block">Assign Additional Officers</Label>
                <div className="grid grid-cols-2 gap-2 bg-background p-3 border border-border rounded-sm max-h-[140px] overflow-y-auto">
                  {allPersonnel
                    .filter((u) => !actor || u.id !== actor.id)
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
                  disabled={mutation.isPending}
                  className="rounded-sm bg-primary px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50 cursor-pointer"
                >
                  {mutation.isPending ? "Opening Case File..." : "Open Dossier"}
                </button>
              </div>
            </form>
          </Panel>
        )}

        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cases by number, title, statute, lead officer, or tags..."
            className="w-full rounded-sm border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        {isPending ? (
          <EmptyState title="Loading dossiers" body="Reading case directories..." />
        ) : cases.length === 0 ? (
          <EmptyState title="No dossiers found" body="Adjust keywords or create a new case file." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {cases.map((c) => {
              const docs = data?.documents.filter((d) => d.caseId === c.id) ?? [];
              const caseDocsCount = docs.filter((d) => (actor ? canRead(actor.role, d.classification) : false)).length;
              return (
                <Link
                  key={c.id}
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="panel block rounded-sm p-5 hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{c.caseNumber}</span>
                    <StatusTag value={c.status} />
                    <ClassificationTag value={c.classification} />
                    <PriorityTag value={c.priority} />
                  </div>
                  <h2 className="mt-3 text-base font-bold text-foreground leading-snug">{c.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">{c.summary}</p>
                  
                  <div className="mt-4 border-t border-border/60 pt-3 flex flex-wrap justify-between items-center text-[10px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="size-3" /> Lead: {c.lead}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3" /> Opened {formatDate(c.openedAt)}
                    </div>
                    <div>{caseDocsCount} sealed files</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
