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
  formatDate,
  useRefreshSnapshot,
  useSnapshot,
} from "@/components/dms/primitives";
import { openCase } from "@/lib/dms.functions";
import { CLASSIFICATIONS, type Classification } from "@/lib/dms-types";

export const Route = createFileRoute("/cases/")({
  head: () => ({
    meta: [
      { title: "Case files — Vigil.OS" },
      {
        name: "description",
        content: "Browse, search and open investigation dossiers with classification-aware access control.",
      },
      { property: "og:title", content: "Case files — Vigil.OS" },
      { property: "og:description", content: "Centralised dossiers for investigations, filings and evidence records." },
    ],
  }),
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
  });

  const mutation = useMutation({
    mutationFn: () => create({ data: { actor, ...form } }),
    onSuccess: async () => {
      toast.success("Dossier opened and logged to the audit trail.");
      setOpen(false);
      setForm({ title: "", caseNumber: "", summary: "", jurisdiction: "", statute: "", classification: "CONFIDENTIAL" });
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cases = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.cases;
    return data.cases.filter((c) =>
      [c.caseNumber, c.title, c.summary, c.jurisdiction, c.statute, c.lead, ...c.tags]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, query]);

  return (
    <AppShell
      title="Case files"
      subtitle="Dossier registry"
      actions={
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground hover:opacity-90"
        >
          {open ? "Cancel" : "Open new dossier"}
        </button>
      }
    >
      <div className="space-y-6">
        {open ? (
          <Panel className="p-5">
            <Label>New dossier</Label>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <Field label="Case number" value={form.caseNumber} onChange={(v) => setForm({ ...form, caseNumber: v })} required />
              <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
              <Field label="Jurisdiction" value={form.jurisdiction} onChange={(v) => setForm({ ...form, jurisdiction: v })} required />
              <Field label="Statute" value={form.statute} onChange={(v) => setForm({ ...form, statute: v })} />
              <div className="sm:col-span-2">
                <Field label="Summary" value={form.summary} onChange={(v) => setForm({ ...form, summary: v })} />
              </div>
              <div>
                <Label>Classification</Label>
                <select
                  value={form.classification}
                  onChange={(e) => setForm({ ...form, classification: e.target.value as Classification })}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground disabled:opacity-50"
                >
                  {mutation.isPending ? "Filing…" : "File dossier"}
                </button>
              </div>
            </form>
          </Panel>
        ) : null}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search case number, title, statute, officer or tag"
          className="w-full rounded-sm border border-border bg-surface px-4 py-2.5 text-sm"
        />

        {isPending ? (
          <EmptyState title="Loading dossiers" body="Reading the registry…" />
        ) : cases.length === 0 ? (
          <EmptyState title="No matching dossiers" body="Adjust the search or open a new case file." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {cases.map((c) => {
              const docs = data?.documents.filter((d) => d.caseId === c.id) ?? [];
              return (
                <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }} className="panel block rounded-sm p-4 transition-colors hover:bg-accent">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{c.caseNumber}</span>
                    <StatusTag value={c.status} />
                    <ClassificationTag value={c.classification} />
                  </div>
                  <h2 className="mt-2 text-base font-bold text-foreground">{c.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.summary}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
                    <div>Lead: {c.lead}</div>
                    <div>{c.jurisdiction}</div>
                    <div>Opened {formatDate(c.openedAt)}</div>
                    <div>{docs.length} records</div>
                  </dl>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
