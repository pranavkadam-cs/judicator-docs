import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PERSONNEL, useActor } from "./actor";
import { Label, useSnapshot } from "./primitives";
import { ROLES, ROLE_PROFILE } from "@/lib/dms-types";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Command", hint: "Overview" },
  { to: "/cases", label: "Case files", hint: "Dossiers" },
  { to: "/assets", label: "Assets", hint: "Lifecycle" },
  { to: "/audit", label: "Audit trail", hint: "Chain of custody" },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { actor, setRole } = useActor();
  const snapshot = useSnapshot();
  const profile = ROLE_PROFILE[actor.role];

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="border-b border-border px-5 py-5">
          <div className="font-mono text-sm font-bold tracking-[0.3em] text-primary uppercase">
            Vigil.OS
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Secure legal &amp; investigation document registry
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="group shrink-0 rounded-sm px-3 py-2 transition-colors hover:bg-accent data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
            >
              <div className="text-sm font-semibold">{item.label}</div>
              <div className="hidden text-[11px] text-muted-foreground group-data-[status=active]:text-primary-foreground/70 lg:block">
                {item.hint}
              </div>
            </Link>
          ))}
        </nav>

        <div className="border-t border-border p-4 lg:absolute lg:bottom-0 lg:w-64">
          <Label>Signed in as</Label>
          <div className="mt-2 text-sm font-semibold text-foreground">{actor.name}</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {actor.badge} · clearance {profile.clearance}
          </div>
          <select
            aria-label="Switch personnel role"
            value={actor.role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="mt-3 w-full rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-[11px] uppercase"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {PERSONNEL[role].name} — {ROLE_PROFILE[role].label}
              </option>
            ))}
          </select>
          <div
            className={cn(
              "mt-3 font-mono text-[10px] tracking-[0.14em] uppercase",
              snapshot.data?.storage === "s3" ? "text-seal" : "text-muted-foreground",
            )}
          >
            Store: {snapshot.data?.storage === "s3" ? "S3 bucket" : "local registry"}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-16">
        <header className="border-b border-border bg-surface px-5 py-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Label>{subtitle}</Label>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            </div>
            {actions}
          </div>
        </header>
        <div className="animate-rise px-5 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
