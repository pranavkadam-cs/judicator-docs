import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useActor } from "./actor";
import { Label, useSnapshot } from "./primitives";
import { ROLES, ROLE_PROFILE } from "@/lib/dms-types";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { LogOut, Shield, User as UserIcon } from "lucide-react";

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
  const { actor, logout, demoSwitchRole } = useActor();
  const snapshot = useSnapshot();
  const navigate = useNavigate();

  if (!actor) return null;

  const profile = ROLE_PROFILE[actor.role];

  const NAV = [
    { to: "/", label: "Command", hint: "Overview" },
    { to: "/cases", label: "Case files", hint: "Dossiers" },
    { to: "/documents", label: "Documents", hint: "Registry Search" },
    { to: "/assets", label: "Assets", hint: "Lifecycle" },
    { to: "/audit", label: "Audit trail", hint: "Chain of custody" },
  ];

  // Add Admin-only Navigation item
  if (actor.role === "ADMIN") {
    NAV.push({ to: "/users", label: "Personnel", hint: "User Accounts" });
  }

  async function handleLogout() {
    await logout();
    void navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Sidebar */}
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0 flex flex-col justify-between">
        <div>
          <div className="border-b border-border px-5 py-5 flex items-center justify-between">
            <div>
              <div className="font-mono text-sm font-bold tracking-[0.3em] text-primary uppercase">
                Vigil.OS
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Secure Legal Document Registry
              </p>
            </div>
            <NotificationBell />
          </div>

          <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="group shrink-0 rounded-sm px-3 py-2 transition-colors hover:bg-accent data-[status=active]:bg-primary data-[status=active]:text-primary-foreground cursor-pointer"
              >
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="hidden text-[11px] text-muted-foreground group-data-[status=active]:text-primary-foreground/70 lg:block">
                  {item.hint}
                </div>
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserIcon className="size-4 text-muted-foreground" />
            <div>
              <div className="text-xs font-bold text-foreground leading-none">{actor.name}</div>
              <div className="font-mono text-[9px] text-muted-foreground mt-1">
                {actor.badge} · {profile.label}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to="/profile"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-sm border border-border bg-background py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center rounded-sm border border-border bg-background p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 cursor-pointer"
              title="Log out"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>

          {/* Admin Role Switcher for Development/Demo purposes */}
          {actor.role === "ADMIN" && (
            <div className="border-t border-border/60 pt-3">
              <div className="flex items-center gap-1 text-muted-foreground mb-1.5">
                <Shield className="size-3 text-caution" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider">
                  Admin Demo Control
                </span>
              </div>
              <select
                aria-label="Switch personnel role"
                value={actor.role}
                onChange={(e) => demoSwitchRole(e.target.value as (typeof ROLES)[number])}
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-[10px] uppercase cursor-pointer"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    Impersonate: {role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            className={cn(
              "font-mono text-[9px] tracking-[0.14em] uppercase text-center",
              snapshot.data?.storage === "s3" ? "text-seal" : "text-muted-foreground",
            )}
          >
            Store: {snapshot.data?.storage === "s3" ? "S3 object store" : "local registry"}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
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
        <div className="animate-entry px-5 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
