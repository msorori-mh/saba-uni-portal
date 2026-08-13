import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mobile/student/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات" }] }),
  component: MobileStudentNotifications,
});

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
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
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["mobile-student", "notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, notification_type, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const unread = items.filter((n) => !n.is_read);

  const markAll = async () => {
    if (unread.length === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unread.map((n) => n.id));
    qc.invalidateQueries({ queryKey: ["mobile-student", "notifications"] });
  };

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <Bell className="h-5 w-5 text-gold" /> الإشعارات
        </h1>
        {unread.length > 0 && (
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-extrabold text-primary">{n.title}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {TYPE_LABELS[n.notification_type] ?? n.notification_type}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{n.message}</p>
              <div dir="ltr" className="mt-1 text-right text-[10px] text-muted-foreground/80">
                {new Date(n.created_at).toLocaleString("ar")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
