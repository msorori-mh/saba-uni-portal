import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/notifications")({
  component: NotificationsPage,
});

type Notification = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
};

const TYPES = [
  { value: "", label: "كل الأنواع" },
  { value: "request", label: "طلبات" },
  { value: "grade", label: "درجات" },
  { value: "finance", label: "مالية" },
  { value: "payment_receipt", label: "سندات دفع" },
  { value: "system", label: "نظام" },
];

const TYPE_COLORS: Record<string, string> = {
  request: "bg-blue-500/15 text-blue-700",
  grade: "bg-emerald-500/15 text-emerald-700",
  finance: "bg-amber-500/15 text-amber-700",
  payment_receipt: "bg-violet-500/15 text-violet-700",
  system: "bg-slate-500/15 text-slate-700",
};

function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [type, setType] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", "all", type],
    queryFn: async () => {
      let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
      if (type) q = q.eq("notification_type", type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const markAll = async () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const toggle = async (n: Notification) => {
    await supabase.from("notifications").update({ is_read: !n.is_read }).eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      <header className="bg-primary-deep text-primary-foreground border-b-2 border-gold/40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-4xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gold/20">
              <Bell className="h-5 w-5 text-gold" />
            </div>
            <div>
              <div className="font-display font-extrabold text-gold leading-tight">الإشعارات</div>
              <div className="text-xs text-primary-foreground/70">جميع إشعارات حسابك</div>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/student" })}
            className="inline-flex items-center gap-2 rounded-md border border-gold/40 px-3 py-2 text-xs font-bold text-gold hover:bg-gold hover:text-primary-deep"
          >
            <ArrowRight className="h-4 w-4" /> العودة
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={markAll}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-bold hover:opacity-90"
          >
            <CheckCheck className="h-4 w-4" /> تعليم الكل كمقروء
          </button>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            لا توجد إشعارات لعرضها.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border border-border bg-card p-4 ${n.is_read ? "opacity-75" : "border-r-4 border-r-primary"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${TYPE_COLORS[n.notification_type] ?? "bg-muted"}`}>
                        {TYPES.find((t) => t.value === n.notification_type)?.label ?? n.notification_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("ar-EG")}
                      </span>
                    </div>
                    <div className="font-bold text-foreground">{n.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{n.message}</div>
                  </div>
                  <button
                    onClick={() => toggle(n)}
                    className="text-[11px] font-bold text-primary hover:underline shrink-0"
                  >
                    {n.is_read ? "غير مقروء" : "مقروء"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
