import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getNotificationLink } from "@/lib/notifications/notification-link";
import { MOBILE_QUERY_GC_TIME_MS } from "@/lib/mobile/query-cache";

export const Route = createFileRoute("/mobile/student/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات" }] }),
  component: MobileStudentNotifications,
});

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  request: "طلبات",
  grade: "درجات",
  system: "إعلانات",
  announcement: "إعلانات",
};

/** Self-scope only: RLS restricts `notifications` to the signed-in user. */
function MobileStudentNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["mobile-student", "notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, notification_type, reference_type, reference_id, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    gcTime: MOBILE_QUERY_GC_TIME_MS,
  });

  const { data: unreadTotal = 0 } = useQuery({
    queryKey: ["mobile-student", "notifications", "unread-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    gcTime: MOBILE_QUERY_GC_TIME_MS,
  });

  const markAll = async () => {
    if (unreadTotal === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);
    if (error) {
      toast.error("تعذّر تعليم الإشعارات كمقروءة. حاول مرة أخرى.");
      return;
    }
    qc.setQueriesData(
      { queryKey: ["mobile-student", "notifications", "unread-count"] },
      0,
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mobile-student", "notifications"] }),
      qc.invalidateQueries({
        queryKey: ["mobile-student", "notifications", "unread-count"],
      }),
    ]);
  };

  const toggle = async (notification: NotificationRow) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: !notification.is_read })
      .eq("id", notification.id);
    if (error) return toast.error("تعذّر تحديث الإشعار. حاول مرة أخرى.");
    qc.setQueryData<NotificationRow[]>(["mobile-student", "notifications"], (current) =>
      current?.map((item) => item.id === notification.id ? { ...item, is_read: !notification.is_read } : item),
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mobile-student", "notifications"] }),
      qc.invalidateQueries({ queryKey: ["mobile-student", "notifications", "unread-count"] }),
    ]);
  };

  const openItem = async (notification: NotificationRow) => {
    setExpandedId((current) => current === notification.id ? null : notification.id);
    if (!notification.is_read) {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id);
      if (error) return toast.error("تعذّر تحديث الإشعار. حاول مرة أخرى.");
      qc.setQueriesData<number>(
        { queryKey: ["mobile-student", "notifications", "unread-count"] },
        (count) => Math.max(0, (count ?? 0) - 1),
      );
      qc.setQueryData<NotificationRow[]>(["mobile-student", "notifications"], (current) =>
        current?.map((item) => item.id === notification.id ? { ...item, is_read: true } : item),
      );
      await qc.invalidateQueries({ queryKey: ["mobile-student", "notifications"] });
    }
  };

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <Bell className="h-5 w-5 text-gold" /> الإشعارات
        </h1>
        {unreadTotal > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="inline-flex items-center gap-1 rounded-md border border-gold/40 px-2.5 py-1.5 text-[11px] font-bold text-primary"
          >
            <CheckCheck className="h-3.5 w-3.5" /> تعليم الكل كمقروء
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد إشعارات.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-2xl border p-3.5 shadow-card ${
                n.is_read ? "border-border bg-card" : "border-gold/50 bg-gold/5"
              }`}
            >
              <button type="button" onClick={() => openItem(n)} className="w-full text-right">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-extrabold text-primary">{n.title}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {TYPE_LABELS[n.notification_type] ?? n.notification_type}
                </span>
              </div>
              <p className={`mt-1 text-[11px] text-muted-foreground leading-relaxed ${expandedId === n.id ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{n.message}</p>
              <div dir="ltr" className="mt-1 text-right text-[10px] text-muted-foreground/80">
                {new Date(n.created_at).toLocaleString("ar-EG-u-nu-latn")}
              </div>
              </button>
              {expandedId === n.id && (
                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <button type="button" onClick={() => toggle(n)} className="text-[11px] font-bold text-primary">
                    {n.is_read ? "تعليم كغير مقروء" : "تعليم كمقروء"}
                  </button>
                  {getNotificationLink(n, "mobile") && (
                    <button
                      type="button"
                      onClick={() => navigate({ to: getNotificationLink(n, "mobile") ?? "/mobile/student/notifications" })}
                      className="mr-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> فتح
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
