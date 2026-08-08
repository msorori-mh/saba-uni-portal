import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getMyCouncilNotificationsFn,
  markCouncilNotificationReadFn,
  type CouncilNotificationItem,
} from "@/lib/councils-c9.functions";

function formatNotificationTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function NotificationIcon({ eventType }: { eventType: string }) {
  const color =
    eventType === "decision_overdue" || eventType === "topic_rejected"
      ? "text-destructive"
      : eventType === "decision_approaching_due" || eventType === "intake_closing"
        ? "text-amber-600"
        : "text-primary";
  return (
    <div
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted ${color}`}
      aria-hidden
    >
      <Bell className="h-4 w-4" />
    </div>
  );
}

export function CouncilNotificationsBell() {
  const qc = useQueryClient();
  const fetchNotifications = useServerFn(getMyCouncilNotificationsFn);
  const markRead = useServerFn(markCouncilNotificationReadFn);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["council-notifications"],
    queryFn: () => fetchNotifications({ data: { unread_only: false, limit: 25 } }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return markRead({ data: { notification_id: notificationId, is_read: true } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["council-notifications"] });
    },
  });

  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unread_count ?? 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`الإشعارات${unreadCount > 0 ? `، ${unreadCount} غير مقروءة` : ""}`}
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -left-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 md:w-96"
        dir="rtl"
        aria-label="قائمة إشعارات المجالس الأكاديمية"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <span className="text-sm font-bold text-primary">إشعارات المجالس</span>
          {unreadCount > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {unreadCount} غير مقروءة
            </Badge>
          ) : null}
        </div>
        <ScrollArea className="h-80">
          {query.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="sr-only">جاري تحميل الإشعارات…</span>
            </div>
          ) : query.isError ? (
            <div className="px-3 py-4 text-xs text-destructive text-center">
              تعذّر تحميل الإشعارات.
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              لا توجد إشعارات حالياً.
            </div>
          ) : (
            <ul className="divide-y divide-border/60" role="list">
              {notifications.map((n: CouncilNotificationItem) => (
                <li key={n.notification_id}>
                  <DropdownMenuItem
                    className="flex items-start gap-3 px-3 py-3 cursor-pointer"
                    onClick={() => {
                      if (!n.is_read) {
                        markReadMutation.mutate(n.notification_id);
                      }
                    }}
                    aria-label={n.title}
                  >
                    <NotificationIcon eventType={n.event_type} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-bold ${n.is_read ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/80">
                        {formatNotificationTime(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read ? (
                      <span className="sr-only">غير مقروء</span>
                    ) : (
                      <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                    )}
                    {!n.is_read ? (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" aria-hidden />
                    ) : null}
                  </DropdownMenuItem>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="px-3 py-2 text-center">
          <button
            type="button"
            disabled={unreadCount === 0 || markReadMutation.isPending}
            onClick={() => {
              for (const n of notifications) {
                if (!n.is_read) markReadMutation.mutate(n.notification_id);
              }
            }}
            className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {markReadMutation.isPending ? (
              <Loader2 className="inline h-3 w-3 animate-spin ml-1" />
            ) : null}
            تحديد الكل كمقروء
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
