import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import { Label, Panel, formatDate, useSnapshot } from "@/components/dms/primitives";
import { changePasswordFn } from "@/lib/auth.functions";
import { KeyRound, Shield, Clock, FileText } from "lucide-react";
import { shortHash } from "@/lib/dms-types";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { actor, sessionId } = useActor();
  const changePassword = useServerFn(changePasswordFn);
  const { data } = useSnapshot();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Filter audit log to only show events for this actor
  const myAuditTrail = useMemo(() => {
    if (!data?.audit || !actor) return [];
    return data.audit.filter((event) => event.actorId === actor.id);
  }, [data, actor]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const res = await changePassword({
        data: {
          sessionId: sessionId || "",
          oldPassword,
          newPassword,
        },
      });

      if (res.success) {
        toast.success("Security credentials updated successfully.");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(res.error || "Password change rejected.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to change password.");
    } finally {
      setBusy(false);
    }
  }

  if (!actor) return null;

  return (
    <AppShell title="Personnel Profile" subtitle="Personnel Ledger">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card & Password Reset */}
        <div className="lg:col-span-1 space-y-6">
          <Panel className="p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Shield className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">{actor.name}</h2>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">
                  {actor.badge}
                </p>
              </div>
            </div>

            <dl className="space-y-3 text-xs">
              <div>
                <Label>Security Clearance Cadre</Label>
                <dd className="mt-1 font-semibold text-foreground">
                  {actor.role.replace(/_/g, " ")}
                </dd>
              </div>
              <div>
                <Label>Linked Agency Email</Label>
                <dd className="mt-1 font-mono text-muted-foreground">
                  {data?.users.find((u) => u.id === actor.id)?.email || "—"}
                </dd>
              </div>
              <div>
                <Label>Account Registered On</Label>
                <dd className="mt-1 text-muted-foreground">
                  {formatDate(data?.users.find((u) => u.id === actor.id)?.createdAt || "")}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <KeyRound className="size-4 text-primary" />
              <Label>Update Passcode / Password</Label>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <Label className="mb-1.5 block">Current Password</Label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <Label className="mb-1.5 block">New Password</Label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <Label className="mb-1.5 block">Confirm New Password</Label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-sm bg-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {busy ? "Updating..." : "Update Passcode"}
              </button>
            </form>
          </Panel>
        </div>

        {/* User Specific Audit Trail */}
        <div className="lg:col-span-2">
          <Panel className="h-full flex flex-col">
            <div className="flex items-center gap-2 border-b border-border p-4">
              <Clock className="size-4 text-primary" />
              <Label>Your Authentication & Access Activity Log</Label>
            </div>

            {myAuditTrail.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <FileText className="size-8 stroke-[1.2]" />
                <p className="mt-2 font-mono text-[10px] uppercase tracking-wider">
                  No activity recorded
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[580px] divide-y divide-border">
                {myAuditTrail.map((event) => (
                  <div key={event.id} className="p-4 flex gap-4 text-xs hover:bg-accent/10 transition-colors">
                    <div className="font-mono text-[10px] text-muted-foreground w-32 shrink-0">
                      {formatDate(event.at)}
                    </div>
                    <div className="space-y-1">
                      <div className="font-bold text-foreground">
                        {event.action.replace(/_/g, " ")}
                      </div>
                      <p className="text-muted-foreground">{event.detail}</p>
                      <div className="font-mono text-[9px] text-muted-foreground/80 flex gap-2">
                        <span>Target: {event.target}</span>
                        {event.hash && (
                          <>
                            <span>·</span>
                            <span>SHA-256: {shortHash(event.hash)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
