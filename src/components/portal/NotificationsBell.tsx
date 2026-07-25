import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getNotificationLink } from "@/lib/notifications/notification-link";

type Notification = {
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
  request: "طلب",
  grade: "درجة",
  finance: "مالية",
  payment_receipt: "سند دفع",
  system: "نظام",
};

const TYPE_COLORS: Record<string, string> = {
  request: "bg-blue-500/15 text-blue-700",
  grade: "bg-emerald-500/15 text-emerald-700",
  finance: "bg-amber-500/15 text-amber-700",
  payment_receipt: "bg-violet-500/15 text-violet-700",
  system: "bg-slate-500/15 text-slate-700",
};

async function fetchTop(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export function NotificationsBell({ seeAllHref }: { seeAllHref?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", "top10"],
    queryFn: fetchTop,
    refetchInterval: 60000,
  });

  const unread = items.filter((n) => !n.is_read).length;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Escape closes the dropdown and returns focus to the trigger button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAll = async () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const openItem = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    const target = getNotificationLink(n) ?? seeAllHref;
    if (target) navigate({ to: target });
  };

  return (
    <div ref={ref} className="relative">
      {/* Screen-reader announcement of the unread count (polite, not on focus). */}
      <span aria-live="polite" className="sr-only">
        {unread > 0 ? `لديك ${unread > 9 ? "أكثر من 9" : unread} إشعارات غير مقروءة` : ""}
      </span>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notifications-bell-dropdown"
        className="relative inline-flex items-center justify-center h-10 w-10 rounded-md border border-gold/40 text-gold hover:bg-gold/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid place-items-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications-bell-dropdown"
          role="dialog"
          aria-label="قائمة الإشعارات"
          className="absolute left-0 mt-2 w-[min(92vw,360px)] z-50 rounded-lg bg-card border border-border shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/40">
            <div className="font-display font-bold text-primary text-sm">الإشعارات</div>
            <button
              onClick={markAll}
              disabled={unread === 0}
              className="text-[11px] text-primary font-bold inline-flex items-center gap-1 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> تعليم الكل كمقروء
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 grid place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">لا توجد إشعارات.</div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      className={`w-full text-right p-3 hover:bg-secondary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        n.is_read ? "opacity-70" : "bg-primary/[0.03]"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && (
                          <>
                            <span
                              className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0"
                              aria-hidden
                            />
                            <span className="sr-only">إشعار غير مقروء</span>
                          </>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${TYPE_COLORS[n.notification_type] ?? "bg-muted"}`}
                            >
                              {TYPE_LABELS[n.notification_type] ?? n.notification_type}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(n.created_at).toLocaleString("ar-EG")}
                            </span>
                          </div>
                          <div className="font-bold text-sm text-foreground">{n.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {n.message}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {seeAllHref && (
            <div className="border-t border-border p-2 text-center">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate({ to: seeAllHref });
                }}
                className="text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                عرض كل الإشعارات
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
