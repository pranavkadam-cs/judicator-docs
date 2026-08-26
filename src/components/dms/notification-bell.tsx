import { Link } from "@tanstack/react-router";
import { Bell, Check, Inbox } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSnapshot, useRefreshSnapshot } from "./primitives";
import { markNotificationReadFn, markAllNotificationsReadFn } from "@/lib/dms.functions";
import { useActor } from "./actor";

export function NotificationBell() {
  const { actor } = useActor();
  const { data } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const markRead = useServerFn(markNotificationReadFn);
  const markAllRead = useServerFn(markAllNotificationsReadFn);

  // filter notifications for this user
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="View notifications"
          className="relative rounded-sm p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-primary"></span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 rounded-sm border border-border bg-surface p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Notifications ({unreadCount})
          </span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              <Check className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
              <Inbox className="size-6 stroke-[1.5]" />
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider">No notifications</p>
            </div>
          ) : (
            notifications.slice(0, 5).map((n) => (
              <DropdownMenuItem
                key={n.id}
                asChild
                className="block p-3 hover:bg-accent focus:bg-accent transition-colors cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-bold ${n.isRead ? "text-muted-foreground" : "text-foreground"}`}>
                      {n.title}
                    </span>
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleMarkRead(n.id);
                        }}
                        className="size-2 rounded-full bg-primary shrink-0"
                        title="Mark as read"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {n.message}
                  </p>
                  <span className="mt-1 block font-mono text-[9px] text-muted-foreground/80">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <div className="border-t border-border p-2 text-center">
          <Link
            to="/notifications"
            className="block font-mono text-[10px] font-bold uppercase tracking-wider text-primary hover:underline py-1"
          >
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
