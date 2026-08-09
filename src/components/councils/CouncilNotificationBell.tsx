import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellDot, Loader2, Inbox } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getMyCouncilNotificationsFn,
  acknowledgeCouncilNotificationFn,
} from "@/lib/councils-c9.functions";

interface CouncilNotificationBellProps {
  ariaLabel?: string;
}

export function CouncilNotificationBell({
  ariaLabel = "إشعارات المجالس الأكاديمية",
}: CouncilNotificationBellProps) {
  const qc = useQueryClient();
  const fetchNotifications = useServerFn(getMyCouncilNotificationsFn);
  const ackNotification = useServerFn(acknowledgeCouncilNotificationFn);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["council-notifications"],
    queryFn: () => fetchNotifications({ data: { limit: 25 } }),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const ackMutation = useMutation({
    mutationFn: (notificationId: string) =>
      ackNotification({ data: { notification_id: notificationId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["council-notifications"] });
    },
  });

  const notifications = (query.data?.notifications ?? []) as Array<{
    id: string;
    title: string;
    body: string;
    is_read: boolean;
    created_at: string;
    council_name?: string;
  }>;
  const unreadCount = query.data?.unread_count ?? 0;

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString("ar", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {unreadCount > 0 ? (
            <>
              <BellDot className="h-5 w-5" aria-hidden />
              <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </>
          ) : (
            <Bell className="h-5 w-5" aria-hidden />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="end"
        className="w-80 sm:w-96 p-0"
        role="dialog"
        aria-label="قائمة الإشعارات"
      >
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm">إشعارات المجالس</h3>
          {unreadCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {unreadCount} غير مقروءة
            </span>
          ) : null}
        </div>
        {query.isLoading ? (
          <div className="grid place-items-center py-8" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : query.isError ? (
          <div className="p-4 text-xs text-destructive text-center" aria-live="assertive">
            تعذر تحميل الإشعارات.
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-50" aria-hidden />
            <p className="text-xs">لا توجد إشعارات حالياً.</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <ul className="divide-y divide-border" role="list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 transition-colors ${
                    n.is_read ? "bg-background" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground">{n.title}</p>
                      {n.council_name ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {n.council_name}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {formatTime(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] shrink-0"
                        disabled={ackMutation.isPending}
                        onClick={() => ackMutation.mutate(n.id)}
                        aria-label="تحديد كمقروء"
                      >
                        {ackMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "قراءة"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
