import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { fetchSnapshot } from "@/lib/dms.functions";
import type { Classification, DocStatus, AssetStatus, CaseStatus } from "@/lib/dms-types";
import { cn } from "@/lib/utils";

export const SNAPSHOT_KEY = ["vigil", "snapshot"] as const;

export function useSnapshot() {
  const fn = useServerFn(fetchSnapshot);
  return useQuery({ queryKey: SNAPSHOT_KEY, queryFn: () => fn({}) });
}

export function useRefreshSnapshot() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });
}

export async function hashFile(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(size: number) {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-mono", className)}>{children}</div>;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel rounded-sm", className)}>{children}</section>;
}

const CLASS_TONE: Record<Classification, string> = {
  PUBLIC: "border-border text-muted-foreground",
  RESTRICTED: "border-border text-foreground",
  CONFIDENTIAL: "border-caution/60 text-caution-foreground bg-caution/25",
  SECRET: "border-primary/50 text-primary bg-primary/10",
  "TOP SECRET": "border-destructive/60 text-destructive bg-destructive/10",
};

export function ClassificationTag({ value }: { value: Classification }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] uppercase",
        CLASS_TONE[value],
      )}
    >
      {value}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  SEALED: "bg-secondary text-foreground",
  SIGNED: "bg-seal/15 text-seal border-seal/40",
  DRAFT: "bg-muted text-muted-foreground",
  "TAMPER ALERT": "bg-destructive/15 text-destructive border-destructive/40",
  OPEN: "bg-secondary text-foreground",
  "UNDER INVESTIGATION": "bg-caution/25 text-caution-foreground",
  "IN TRIAL": "bg-primary/10 text-primary",
  CLOSED: "bg-muted text-muted-foreground",
  "IN SERVICE": "bg-seal/15 text-seal",
  ISSUED: "bg-primary/10 text-primary",
  MAINTENANCE: "bg-caution/25 text-caution-foreground",
  RETURNED: "bg-secondary text-foreground",
  RETIRED: "bg-muted text-muted-foreground",
  IMPOUNDED: "bg-destructive/15 text-destructive",
};

export function StatusTag({ value }: { value: DocStatus | CaseStatus | AssetStatus | string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border border-transparent px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] uppercase",
        STATUS_TONE[value] ?? "bg-secondary text-foreground",
      )}
    >
      {value}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Panel className="p-4">
      <Label>{label}</Label>
      <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-border p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
