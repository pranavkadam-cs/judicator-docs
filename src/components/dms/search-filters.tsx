import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Label, Panel } from "./primitives";
import { CLASSIFICATIONS, DOC_CATEGORIES, DOC_STATUSES } from "@/lib/dms-types";

export interface FilterState {
  query: string;
  category: string;
  classification: string;
  status: string;
  tag: string;
  startDate: string;
  endDate: string;
}

interface SearchFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  availableTags?: string[];
  placeholder?: string;
}

export function SearchFilters({
  filters,
  onFilterChange,
  availableTags = [],
  placeholder = "Search by ID, keyword, name...",
}: SearchFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function updateFilter(key: keyof FilterState, value: string) {
    onFilterChange({
      ...filters,
      [key]: value,
    });
  }

  function resetFilters() {
    onFilterChange({
      query: "",
      category: "",
      classification: "",
      status: "",
      tag: "",
      startDate: "",
      endDate: "",
    });
  }

  const activeFilterCount = Object.entries(filters).filter(
    ([key, val]) => key !== "query" && val !== "",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3.5 size-4 text-muted-foreground" />
          <input
            value={filters.query}
            onChange={(e) => updateFilter("query", e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-sm border border-border bg-surface pl-10 pr-4 py-2 text-sm outline-none focus:border-primary"
          />
          {filters.query && (
            <button
              onClick={() => updateFilter("query", "")}
              className="absolute top-2.5 right-3.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 rounded-sm border px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            showAdvanced || activeFilterCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground hover:bg-accent"
          }`}
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-sans">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showAdvanced && (
        <Panel className="p-4 animate-entry">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Advanced Filter Panel
            </span>
            <button
              onClick={resetFilters}
              className="font-mono text-[9px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Reset All
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            <div>
              <Label className="mb-1.5 block">Category</Label>
              <select
                value={filters.category}
                onChange={(e) => updateFilter("category", e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">All Categories</option>
                {DOC_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1.5 block">Classification</Label>
              <select
                value={filters.classification}
                onChange={(e) => updateFilter("classification", e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">All Classifications</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1.5 block">Workflow Status</Label>
              <select
                value={filters.status}
                onChange={(e) => updateFilter("status", e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">All Statuses</option>
                {DOC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1.5 block">Tag</Label>
              <select
                value={filters.tag}
                onChange={(e) => updateFilter("tag", e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">All Tags</option>
                {availableTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1.5 block">Start Date</Label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter("startDate", e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">End Date</Label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilter("endDate", e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
