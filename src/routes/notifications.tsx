import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { useActor } from "@/components/dms/actor";
import { EmptyState, Label, Panel, formatDate, useRefreshSnapshot, useSnapshot } from "@/components/dms/primitives";
import { markNotificationReadFn, markAllNotificationsReadFn } from "@/lib/dms.functions";
import { Check, MailOpen, Mail, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { actor } = useActor();
  const { data, isPending } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const markRead = useServerFn(markNotificationReadFn);
  const markAllRead = useServerFn(markAllNotificationsReadFn);

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleMarkRead(id: string) {
    if (!actor) return;
    try {
      await markRead({ data: { userId: actor.id, notificationId: id } });
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to mark read");
    }
  }

  async function handleMarkAllRead() {
    if (!actor) return;
    try {
      await markAllRead({ data: { userId: actor.id } });
      toast.success("All notifications marked as read");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to mark all read");
    }
  }

  return (
    <AppShell
      title="Notification Desk"
      subtitle="Personnel Intake"
      actions={
        unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground hover:opacity-90 cursor-pointer"
          >
            Mark all read
          </button>
        )
      }
    >
      <div className="space-y-4">
        {isPending ? (
          <EmptyState title="Opening Inbox" body="Synchronizing alert registries..." />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="Inbox Empty"
            body="You have no notifications or security alerts at this time."
          />
        ) : (
          <Panel className="overflow-hidden">
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors ${
                    n.isRead ? "bg-surface text-muted-foreground" : "bg-accent/15 text-foreground font-semibold"
                  }`}
                >
                  <div className="flex gap-3 items-start">
                    <div className="mt-0.5 shrink-0">
                      {n.isRead ? (
                        <MailOpen className="size-4 text-muted-foreground" />
                      ) : (
                        <Mail className="size-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold">{n.title}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      <span className="mt-1 block font-mono text-[9px] text-muted-foreground/80">
                        {formatDate(n.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {n.linkedEntityId && n.linkedEntityType && (
                      <Link
                        to={n.linkedEntityType === "document" ? "/documents/$docId" : "/cases/$caseId"}
                        params={n.linkedEntityType === "document" ? { docId: n.linkedEntityId } : { caseId: n.linkedEntityId }}
                        className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary hover:underline cursor-pointer"
                      >
                        Inspect <ArrowRight className="size-3.5" />
                      </Link>
                    )}

                    {!n.isRead && (
                      <button
                        onClick={() => void handleMarkRead(n.id)}
                        className="rounded-sm border border-border bg-background p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        <Check className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
