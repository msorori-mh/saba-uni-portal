import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import {
  Newspaper,
  Users,
  FlaskConical,
  Calendar,
  MessageSquare,
  Plus,
  Edit,
  CheckCircle2,
  Clock,
  MapPin,
} from "lucide-react";
import { eventsQuery, liveCountsQuery, newsQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

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

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["contact_messages", "unread_count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
  });

  const { data: recentMessages = [] } = useQuery({
    queryKey: ["contact_messages", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_messages")
        .select("id, full_name, subject, created_at, is_read")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const stats = [
    {
      label: "أعضاء هيئة التدريس",
      value: counts.faculty,
      icon: Users,
      bg: "bg-primary",
      fg: "text-primary-foreground",
    },
    {
      label: "الأخبار",
      value: counts.news,
      icon: Newspaper,
      bg: "bg-secondary",
      fg: "text-secondary-foreground",
    },
    {
      label: "الأبحاث العلمية",
      value: counts.research,
      icon: FlaskConical,
      bg: "bg-accent",
      fg: "text-accent-foreground",
    },
    {
      label: "رسائل جديدة",
      value: unreadCount,
      icon: MessageSquare,
      bg: "bg-gold-gradient",
      fg: "text-primary",
    },
  ];

  // News-per-month chart (last 6 months from loaded news + all news count)
  const monthly = useMemo(() => {
    const months: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString("ar-EG", { month: "short" }),
        count: 0,
      });
    }
    news.forEach((n) => {
      const d = new Date(n.published_at);
      const diff =
        (now.getFullYear() - d.getFullYear()) * 12 +
        (now.getMonth() - d.getMonth());
      if (diff >= 0 && diff <= 5) months[5 - diff].count += 1;
    });
    return months;
  }, [news]);

  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));

  const upcomingEvents = events
    .filter((e) => new Date(e.event_date) >= new Date(new Date().toDateString()))
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">
            لوحة التحكم
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة عامة على محتوى الموقع وإحصاءاته.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickAction to="/admin/news" icon={Newspaper} label="خبر جديد" />
          <QuickAction
            to="/admin/faculty"
            icon={Users}
            label="عضو هيئة تدريس"
          />
          <QuickAction
            to="/admin/research"
            icon={FlaskConical}
            label="بحث جديد"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl ${s.bg} p-6 shadow-card relative overflow-hidden`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-semibold opacity-80 ${s.fg}`}>
                  {s.label}
                </div>
                <div
                  className={`mt-2 font-display text-3xl font-extrabold ${s.fg}`}
                >
                  {s.value.toLocaleString("ar-EG")}
                </div>
              </div>
              <div
                className={`grid h-12 w-12 place-items-center rounded-lg bg-background/20 ${s.fg}`}
              >
                <s.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Upcoming events */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl bg-card border border-border p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-primary mb-6">
            الأخبار خلال الأشهر الستة الماضية
          </h2>
          <div className="flex items-end gap-3 h-44">
            {monthly.map((m, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-2 h-full justify-end"
              >
                <div className="text-xs font-bold text-primary">{m.count}</div>
                <div
                  className="w-full bg-gold-gradient rounded-t-md transition-all"
                  style={{
                    height: `${(m.count / maxMonthly) * 100}%`,
                    minHeight: m.count > 0 ? "8px" : "2px",
                  }}
                />
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-card border border-border p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-primary mb-4">
            الفعاليات القادمة
          </h2>
          <ul className="space-y-3">
            {upcomingEvents.length === 0 && (
              <li className="text-sm text-muted-foreground py-4 text-center">
                لا توجد فعاليات قادمة.
              </li>
            )}
            {upcomingEvents.map((e) => {
              const d = new Date(e.event_date);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30"
                >
                  <div className="shrink-0 grid place-items-center h-12 w-12 rounded-lg bg-gold-gradient text-primary font-display font-extrabold">
                    <div className="text-center leading-none">
                      <div className="text-lg">{d.getDate()}</div>
                      <div className="text-[10px]">
                        {d.toLocaleDateString("ar-EG", { month: "short" })}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-primary line-clamp-1">
                      {e.title_ar}
                    </div>
                    {e.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="h-3 w-3" />
                        <span className="line-clamp-1">{e.location}</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Recent messages + Recent news */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-card border border-border p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-primary">
              أحدث رسائل التواصل
            </h2>
            <Link
              to="/admin/messages"
              className="text-xs font-semibold text-primary hover:text-gold transition-colors"
            >
              عرض الكل ←
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 font-semibold">الاسم</th>
                  <th className="pb-2 font-semibold">الموضوع</th>
                  <th className="pb-2 font-semibold">التاريخ</th>
                  <th className="pb-2 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentMessages.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-6 text-center text-muted-foreground"
                    >
                      لا توجد رسائل.
                    </td>
                  </tr>
                )}
                {recentMessages.map((m) => (
                  <tr
                    key={m.id}
                    className={!m.is_read ? "bg-gold/10" : undefined}
                  >
                    <td className="py-3 font-semibold text-primary">
                      {m.full_name}
                    </td>
                    <td className="py-3 text-muted-foreground line-clamp-1 max-w-[160px]">
                      {m.subject}
                    </td>
                    <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="py-3">
                      {m.is_read ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3" /> مقروءة
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-gold-dark">
                          <Clock className="h-3 w-3" /> جديدة
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl bg-card border border-border p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-primary">
              أحدث الأخبار
            </h2>
            <Link
              to="/admin/news"
              className="text-xs font-semibold text-primary hover:text-gold transition-colors"
            >
              إدارة الأخبار ←
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {news.length === 0 && (
              <li className="py-4 text-sm text-muted-foreground text-center">
                لا توجد أخبار.
              </li>
            )}
            {news.map((n) => (
              <li
                key={n.id}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-primary line-clamp-1">
                    {n.title_ar}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        n.is_published ? "bg-green-500" : "bg-muted-foreground"
                      }`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {n.is_published ? "منشور" : "مسودة"} ·{" "}
                      {new Date(n.published_at).toLocaleDateString("ar-EG")}
                    </span>
                  </div>
                </div>
                <Link
                  to="/admin/news"
                  className="shrink-0 p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                  aria-label="تعديل"
                >
                  <Edit className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-4 py-2 text-sm font-bold text-primary shadow-card hover:opacity-90 transition-opacity"
    >
      <Icon className="h-4 w-4" />
      <Plus className="h-3 w-3" />
      <span>{label}</span>
    </Link>
  );
}
