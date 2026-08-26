import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import { EmptyState, Label, Panel, StatusTag } from "@/components/dms/primitives";
import { createUserFn, updateUserFn, listUsersFn } from "@/lib/auth.functions";
import { ROLES, type Role } from "@/lib/dms-types";
import { UserPlus, UserX, UserCheck, Shield } from "lucide-react";

export const Route = createFileRoute("/users")({
  component: UsersManagementPage,
});

function UsersManagementPage() {
  const { actor, sessionId } = useActor();
  const createUser = useServerFn(createUserFn);
  const updateUser = useServerFn(updateUserFn);
  const listUsers = useServerFn(listUsersFn);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    badge: "",
    role: "INVESTIGATOR" as Role,
    password: "",
  });

  // Query users
  const { data: users = [], refetch, isPending } = useQuery({
    queryKey: ["admin", "users", sessionId],
    queryFn: () => listUsers({ data: { sessionId: sessionId || "" } }),
    enabled: !!sessionId && actor?.role === "ADMIN",
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        data: {
          sessionId: sessionId || "",
          ...form,
        },
      }),
    onSuccess: () => {
      toast.success(`User account for ${form.name} created successfully.`);
      setOpen(false);
      setForm({ name: "", email: "", badge: "", role: "INVESTIGATOR", password: "" });
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleToggleStatus(userId: string, currentActive: boolean) {
    try {
      await updateUser({
        data: {
          sessionId: sessionId || "",
          userId,
          isActive: !currentActive,
        },
      });
      toast.success(currentActive ? "User deactivated" : "User reactivated");
      void refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to update user status");
    }
  }

  // Access check
  if (actor?.role !== "ADMIN") {
    return (
      <AppShell title="Access Restricted" subtitle="Security Administration">
        <EmptyState
          title="Access Denied"
          body="Your credentials do not authorize viewing this administrative ledger."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Personnel Ledger"
      subtitle="Security Administration"
      actions={
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground hover:opacity-90 cursor-pointer"
        >
          {open ? "Cancel" : "Add Personnel"}
        </button>
      }
    >
      <div className="space-y-6">
        {open && (
          <Panel className="p-5 animate-entry">
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <UserPlus className="size-4 text-primary" />
              <Label>Register New Officer / Account</Label>
            </div>

            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <Field
                label="Full Name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                required
              />
              <Field
                label="Agency Email"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
                type="email"
                required
              />
              <Field
                label="Badge / ID Number"
                value={form.badge}
                onChange={(v) => setForm({ ...form, badge: v })}
                required
              />
              <div>
                <Label className="mb-1.5 block">Security Role</Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Initial Password"
                  value={form.password}
                  onChange={(v) => setForm({ ...form, password: v })}
                  type="password"
                  required
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground disabled:opacity-50 cursor-pointer"
                >
                  {createMutation.isPending ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </Panel>
        )}

        {isPending ? (
          <EmptyState title="Opening Personnel registry" body="Verifying access directories..." />
        ) : (
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Name
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Badge ID
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Email
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Role
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="p-4 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Last Active
                    </th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-accent/40 transition-colors">
                      <td className="p-4 font-bold text-foreground">{u.name}</td>
                      <td className="p-4 font-mono text-xs text-primary">{u.badge}</td>
                      <td className="p-4 text-xs text-muted-foreground">{u.email}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center rounded-xs border border-border bg-accent/20 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase text-foreground">
                          {u.role.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-4">
                        <StatusTag value={u.isActive ? "IN SERVICE" : "RETIRED"} />
                      </td>
                      <td className="p-4 text-xs font-mono text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                      </td>
                      <td className="p-4 text-right">
                        {u.id !== actor.id && (
                          <button
                            onClick={() => void handleToggleStatus(u.id, u.isActive)}
                            className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer ${
                              u.isActive
                                ? "border-destructive/30 hover:bg-destructive/10 text-destructive"
                                : "border-seal/30 hover:bg-seal/10 text-seal"
                            }`}
                          >
                            {u.isActive ? (
                              <>
                                <UserX className="size-3" /> Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="size-3" /> Activate
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
