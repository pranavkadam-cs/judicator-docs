import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calendar, Trash2, UserPlus, Users } from "lucide-react";
import { useActor } from "./actor";
import { Label, Panel, useRefreshSnapshot, useSnapshot } from "./primitives";
import { shareDocumentFn, revokeShareFn } from "@/lib/dms.functions";
import type { SharePermission } from "@/lib/dms-types";

interface SharePanelProps {
  documentId: string;
}

export function SharePanel({ documentId }: SharePanelProps) {
  const { actor } = useActor();
  const { data } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const shareDoc = useServerFn(shareDocumentFn);
  const revokeShare = useServerFn(revokeShareFn);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [canDownload, setCanDownload] = useState(true);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const allUsers = data?.users ?? [];
  const activeShares = data?.shares?.filter((s) => s.documentId === documentId && s.isActive) ?? [];
  
  if (!actor) return null;

  // Filter out the current user and users who already have active shares
  const eligibleUsers = allUsers.filter(
    (u) => u.id !== actor.id && !activeShares.some((s) => s.sharedWithUserId === u.id),
  );

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Please select a user to share with");
      return;
    }

    setBusy(true);
    try {
      const perms: SharePermission[] = ["VIEW"];
      if (canDownload) perms.push("DOWNLOAD");

      await shareDoc({
        data: {
          actor,
          documentId,
          sharedWithUserId: selectedUserId,
          permissions: perms,
          expiresAt: expiry ? new Date(expiry).toISOString() : null,
        },
      });

      toast.success("Document shared successfully");
      setSelectedUserId("");
      setExpiry("");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to share document");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(shareId: string) {
    try {
      await revokeShare({
        data: {
          actor,
          shareId,
        },
      });
      toast.success("Access revoked");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke share");
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Panel className="p-4 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <UserPlus className="size-4 text-primary" />
          <Label>Grant Secure Access</Label>
        </div>

        <form onSubmit={handleShare} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Select User / Officer</Label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">— Select Recipient —</option>
              {eligibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace(/_/g, " ")}) — {u.badge}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-background/50 border border-border p-2.5 rounded-sm">
            <input
              type="checkbox"
              id="canDownload"
              checked={canDownload}
              onChange={(e) => setCanDownload(e.target.checked)}
              className="rounded-xs border-border"
            />
            <label htmlFor="canDownload" className="text-xs text-foreground font-semibold cursor-pointer">
              Allow recipient to download this file (PDF retrieval)
            </label>
          </div>

          <div>
            <Label className="mb-1.5 block">Optional Expiration Date</Label>
            <div className="relative">
              <Calendar className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-sm border border-border bg-background pl-10 pr-3 py-2 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !selectedUserId}
            className="w-full rounded-sm bg-primary px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? "Sharing..." : "Authorize Access"}
          </button>
        </form>
      </Panel>

      <Panel className="p-4 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <Users className="size-4 text-primary" />
          <Label>Active Access Authorizations</Label>
        </div>

        {activeShares.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-center text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">No active shares</span>
            <p className="mt-1 text-xs">This document is currently only visible to authorized case officials.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {activeShares.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between p-3 border border-border bg-background/40 rounded-sm hover:bg-background/80 transition-colors"
              >
                <div>
                  <div className="text-xs font-bold text-foreground">{s.sharedWithName}</div>
                  <div className="font-mono text-[9px] text-muted-foreground mt-0.5">
                    Granted by {s.sharedByName} · {s.permissions.join(" + ")}
                  </div>
                  {s.expiresAt && (
                    <div className="font-mono text-[9px] text-destructive mt-0.5">
                      Expires: {new Date(s.expiresAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void handleRevoke(s.id)}
                  className="rounded-sm p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="Revoke access"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
