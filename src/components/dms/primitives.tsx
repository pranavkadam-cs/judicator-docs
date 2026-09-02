import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { fetchSnapshot } from "@/lib/dms.functions";
import type { Classification, DocStatus, AssetStatus, CaseStatus, CasePriority } from "@/lib/dms-types";
import { cn } from "@/lib/utils";
import { useActor } from "./actor";

export const SNAPSHOT_KEY = ["vigil", "snapshot"] as const;

export function useSnapshot() {
  const { actor } = useActor();
  const fn = useServerFn(fetchSnapshot);
  return useQuery({
    queryKey: [...SNAPSHOT_KEY, actor?.id],
    queryFn: () => fn({ data: { actorId: actor?.id } }),
    enabled: !!actor,
  });
}

export function useRefreshSnapshot() {
  const qc = useQueryClient();
  const { actor } = useActor();
  return () => qc.invalidateQueries({ queryKey: [...SNAPSHOT_KEY, actor?.id] });
}

export async function hashFile(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatDate(iso: string) {
  if (!iso) return "—";
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
  RESTRICTED: "border-border text-foreground bg-accent/20",
  CONFIDENTIAL: "border-caution/60 text-caution bg-caution/10",
  SECRET: "border-primary/50 text-primary bg-primary/5",
  "TOP SECRET": "border-destructive/60 text-destructive bg-destructive/5",
};

export function ClassificationTag({ value }: { value: Classification }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] uppercase",
        CLASS_TONE[value],
      )}
    >
      {value}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  // Document statuses
  DRAFT: "bg-muted text-muted-foreground border-border",
  UNDER_REVIEW: "bg-caution/15 text-caution border-caution/30",
  UNDER_INVESTIGATION: "bg-caution/15 text-caution border-caution/30",
  APPROVED: "bg-seal/15 text-seal border-seal/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
  SEALED: "bg-secondary text-foreground border-border",
  SIGNED: "bg-seal/15 text-seal border-seal/40",
  TAMPER_ALERT: "bg-destructive/15 text-destructive border-destructive/40 animate-pulse",

  // Case statuses
  OPEN: "bg-secondary text-foreground border-border",
  IN_TRIAL: "bg-primary/10 text-primary border-primary/20",
  CLOSED: "bg-muted text-muted-foreground border-border",

  // Asset statuses
  IN_SERVICE: "bg-seal/15 text-seal border-seal/30",
  ISSUED: "bg-primary/10 text-primary border-primary/20",
  MAINTENANCE: "bg-caution/15 text-caution border-caution/30",
  RETURNED: "bg-secondary text-foreground border-border",
  RETIRED: "bg-muted text-muted-foreground border-border",
  IMPOUNDED: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusTag({ value }: { value: DocStatus | CaseStatus | AssetStatus | string }) {
  const norm = value.replace(/ /g, "_").toUpperCase();
  const label = value.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
        STATUS_TONE[norm] ?? "bg-secondary text-foreground border-border",
      )}
    >
      {label}
    </span>
  );
}

const PRIORITY_TONE: Record<CasePriority, string> = {
  LOW: "border-border text-muted-foreground bg-accent/10",
  MEDIUM: "border-border text-foreground bg-accent/30",
  HIGH: "border-caution/50 text-caution bg-caution/5",
  CRITICAL: "border-destructive/60 text-destructive bg-destructive/5 animate-pulse",
};

export function PriorityTag({ value }: { value: CasePriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
        PRIORITY_TONE[value],
      )}
    >
      {value} Priority
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
    <div className="border border-dashed border-border p-8 text-center rounded-sm bg-surface">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

export function IntegrityBadge({ status }: { status?: string }) {
  const norm = (status || "VERIFIED").toUpperCase();
  if (norm === "TAMPER_ALERT" || norm === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-xs border border-destructive/60 bg-destructive/15 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-destructive uppercase animate-pulse">
        ⚠ Integrity Check Failed
      </span>
    );
  }
  if (norm === "VERIFYING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-xs border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-primary uppercase">
        ⏳ Verifying Integrity
      </span>
    );
  }
  if (norm === "UNVERIFIED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-xs border border-border bg-muted px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        — Integrity Not Available
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-xs border border-seal/40 bg-seal/15 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-seal uppercase">
      ✓ Integrity Verified
    </span>
  );
}

export function Sha256Display({ hash, label }: { hash: string; label?: string }) {
  const short = hash ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : "—";
  return (
    <div className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
      {label ? <span className="font-bold text-foreground">{label}:</span> : null}
      <span className="bg-background/80 px-1.5 py-0.5 rounded-xs border border-border text-[11px] select-all">
        {short}
      </span>
      <button
        type="button"
        onClick={async () => {
          if (!hash) return;
          await navigator.clipboard.writeText(hash);
          const { toast } = await import("sonner");
          toast.success("SHA-256 digest copied to clipboard.");
        }}
        className="font-mono text-[10px] uppercase font-bold text-primary hover:underline px-1 py-0.5 cursor-pointer"
        title="Copy full 64-char SHA-256 hash"
      >
        Copy
      </button>
    </div>
  );
}
