import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Newspaper, Users, BookOpen, FlaskConical, Calendar, MessageSquare } from "lucide-react";
import { eventsQuery, liveCountsQuery, newsQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(liveCountsQuery);
    context.queryClient.ensureQueryData(newsQuery(5));
    context.queryClient.ensureQueryData(eventsQuery(5));
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: counts } = useSuspenseQuery(liveCountsQuery);
  const { data: news } = useSuspenseQuery(newsQuery(5));
  const { data: events } = useSuspenseQuery(eventsQuery(5));
  const [messages, setMessages] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("contact_messages").select("id", { count: "exact", head: true })
      .then(({ count }) => setMessages(count ?? 0));
  }, []);

  const stats = [
    { label: "البرامج النشطة", value: counts.programs, icon: BookOpen, color: "text-primary" },
    { label: "أعضاء هيئة التدريس", value: counts.faculty, icon: Users, color: "text-primary" },
    { label: "الأبحاث المنشورة", value: counts.research, icon: FlaskConical, color: "text-primary" },
    { label: "الأخبار المنشورة", value: counts.news, icon: Newspaper, color: "text-primary" },
    { label: "الفعاليات", value: events.length, icon: Calendar, color: "text-primary" },
    { label: "رسائل التواصل", value: messages ?? 0, icon: MessageSquare, color: "text-primary" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground">نظرة عامة على محتوى الموقع وإحصاءاته.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-card border border-border p-6 shadow-card relative overflow-hidden">
            <div className="absolute top-0 right-0 h-1 w-full bg-gold-gradient" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">{s.label}</div>
                <div className="mt-2 font-display text-3xl font-extrabold text-primary">
                  {s.value.toLocaleString("ar-EG")}
                </div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary">
                <s.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-card border border-border p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-primary mb-4">أحدث الأخبار</h2>
          <ul className="divide-y divide-border">
            {news.length === 0 && <li className="py-4 text-sm text-muted-foreground">لا توجد أخبار.</li>}
            {news.map((n) => (
              <li key={n.id} className="py-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-primary line-clamp-1 flex-1">{n.title_ar}</span>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(n.published_at).toLocaleDateString("ar-EG")}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-card border border-border p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-primary mb-4">الفعاليات القادمة</h2>
          <ul className="divide-y divide-border">
            {events.length === 0 && <li className="py-4 text-sm text-muted-foreground">لا توجد فعاليات.</li>}
            {events.map((e) => (
              <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-primary line-clamp-1 flex-1">{e.title_ar}</span>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(e.event_date).toLocaleDateString("ar-EG")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
