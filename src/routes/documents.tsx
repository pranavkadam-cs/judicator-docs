import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/dms/shell";
import {
  EmptyState,
  Label,
  Panel,
  ClassificationTag,
  StatusTag,
  IntegrityBadge,
  Sha256Display,
  formatDate,
  useSnapshot,
} from "@/components/dms/primitives";
import { SearchFilters, type FilterState } from "@/components/dms/search-filters";
import { useActor } from "@/components/dms/actor";
import { canRead, shortHash } from "@/lib/dms-types";
import { FileText, Eye } from "lucide-react";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();

  const [filters, setFilters] = useState<FilterState>({
    query: "",
    category: "",
    classification: "",
    status: "",
    tag: "",
    startDate: "",
    endDate: "",
  });

  // Calculate unique tags for filter dropdown
  const allTags = useMemo(() => {
    if (!data?.documents) return [];
    const tagsSet = new Set<string>();
    data.documents.forEach((doc) => {
      doc.tags?.forEach((t) => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [data]);

  // Filter documents based on clearance and filter settings
  const filteredDocuments = useMemo(() => {
    if (!data?.documents || !actor) return [];

    return data.documents.filter((doc) => {
      // 1. Role-based clearance check
      if (!canRead(actor.role, doc.classification)) return false;

      // 2. Keyword Search (ID, name, refId, tags)
      if (filters.query) {
        const q = filters.query.toLowerCase().trim();
        const matchesQuery =
          doc.name.toLowerCase().includes(q) ||
          doc.refId.toLowerCase().includes(q) ||
          doc.category.toLowerCase().includes(q) ||
          doc.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      // 3. Category Filter
      if (filters.category && doc.category !== filters.category) return false;

      // 4. Classification Filter
      if (filters.classification && doc.classification !== filters.classification) return false;

      // 5. Status Filter
      if (filters.status && doc.status !== filters.status) return false;

      // 6. Tag Filter
      if (filters.tag && !doc.tags.includes(filters.tag)) return false;

      // 7. Date Range Filter
      if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        const docDate = new Date(doc.updatedAt).getTime();
        if (docDate < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate).getTime() + 86400000; // include full day
        const docDate = new Date(doc.updatedAt).getTime();
        if (docDate > end) return false;
      }

      return true;
    });
  }, [data, actor, filters]);

  return (
    <AppShell title="Sealed Document Registry" subtitle="Secure Archiving division">
      <div className="space-y-6">
        <SearchFilters
          filters={filters}
          onFilterChange={setFilters}
          availableTags={allTags}
          placeholder="Search by ref ID, document title, category, tags..."
        />

        {isPending ? (
          <EmptyState title="Opening secure index" body="Verifying digital digests..." />
        ) : filteredDocuments.length === 0 ? (
          <EmptyState title="No documents found" body="Adjust filters or search parameters." />
        ) : (
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Ref ID
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Document Title
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Classification
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Workflow & Integrity
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Last Updated
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      SHA-256 Digest
                    </th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDocuments.map((doc) => {
                    const currentVersion = doc.versions.find((v) => v.version === doc.currentVersion) || doc.versions[0];
                    return (
                      <tr key={doc.id} className="hover:bg-accent/40 transition-colors">
                        <td className="p-4 font-mono text-xs font-bold text-primary">
                          {doc.refId}
                        </td>
                        <td className="p-4">
                          <div>
                            <div className="font-bold text-foreground">{doc.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-1.5 items-center">
                              <span>{doc.category}</span>
                              <span>·</span>
                              <span>{doc.currentVersion}</span>
                              {doc.tags?.map((t) => (
                                <span key={t} className="text-primary font-mono">#{t}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <ClassificationTag value={doc.classification} />
                        </td>
                        <td className="p-4 space-y-1">
                          <div><StatusTag value={doc.status} /></div>
                          <div><IntegrityBadge status={currentVersion?.integrity_status ?? (doc.status === "TAMPER_ALERT" ? "TAMPER_ALERT" : "VERIFIED")} /></div>
                        </td>
                        <td className="p-4 text-xs font-mono text-muted-foreground">
                          {formatDate(doc.updatedAt)}
                        </td>
                        <td className="p-4 text-xs">
                          {currentVersion ? (
                            <Sha256Display hash={currentVersion.hash} />
                          ) : (
                            <span className="text-muted-foreground font-mono">—</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            to="/documents/$docId"
                            params={{ docId: doc.id }}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                          >
                            <Eye className="size-3" /> Detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
