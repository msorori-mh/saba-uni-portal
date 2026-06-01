import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Newspaper, Users, FlaskConical, Calendar, MessageSquare, Plus,
  GraduationCap, BookOpen, CalendarDays, ClipboardList, ClipboardCheck,
  FileWarning, UserCog, FileText, ListTree, ScrollText, Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

async function tableCount(table: string, filters?: (q: any) => any) {
  let q = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count } = await q;
  return count ?? 0;
}

function AdminDashboard() {
  const { data: s } = useQuery({
    queryKey: ["admin-dashboard-counts"],
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [
        programs, courses, sections, students,
        faculty, staff,
        newReq, reviewReq,
        news, events, research,
        audit24h,
      ] = await Promise.all([
        tableCount("programs", (q) => q.eq("is_active", true)),
        tableCount("courses"),
        tableCount("course_sections"),
        tableCount("student_profiles"),
        tableCount("faculty_profiles"),
        tableCount("staff_profiles"),
        tableCount("student_requests", (q) => q.eq("status", "submitted")),
        tableCount("student_requests", (q) => q.eq("status", "under_review")),
        tableCount("news", (q) => q.eq("is_published", true)),
        tableCount("events", (q) => q.eq("is_published", true)),
        tableCount("research_papers", (q) => q.eq("is_published", true)),
        tableCount("audit_logs", (q) => q.gte("created_at", since24h)),
      ]);
      return { programs, courses, sections, students, faculty, staff, newReq, reviewReq, news, events, research, audit24h };
    },
  });

  const counts = s ?? {
    programs: 0, courses: 0, sections: 0, students: 0,
    faculty: 0, staff: 0, newReq: 0, reviewReq: 0,
    news: 0, events: 0, research: 0, audit24h: 0,
  };

  const sections_: Array<{
    title: string;
    cards: Array<{ label: string; value: number; icon: any }>;
  }> = [
    {
      title: "إحصائيات أكاديمية",
      cards: [
        { label: "البرامج", value: counts.programs, icon: GraduationCap },
        { label: "المقررات", value: counts.courses, icon: BookOpen },
        { label: "الشعب", value: counts.sections, icon: CalendarDays },
        { label: "الطلاب", value: counts.students, icon: ClipboardList },
      ],
    },
    {
      title: "الموارد البشرية",
      cards: [
        { label: "أعضاء هيئة التدريس", value: counts.faculty, icon: Users },
        { label: "الموظفون", value: counts.staff, icon: UserCog },
      ],
    },
    {
      title: "الخدمات",
      cards: [
        { label: "طلبات جديدة", value: counts.newReq, icon: FileWarning },
        { label: "قيد المراجعة", value: counts.reviewReq, icon: ClipboardCheck },
      ],
    },
    {
      title: "الموقع",
      cards: [
        { label: "الأخبار المنشورة", value: counts.news, icon: Newspaper },
        { label: "الفعاليات", value: counts.events, icon: Calendar },
        { label: "الأبحاث", value: counts.research, icon: FlaskConical },
      ],
    },
    {
      title: "النظام",
      cards: [
        { label: "سجل التدقيق (آخر 24 ساعة)", value: counts.audit24h, icon: ScrollText },
      ],
    },
  ];

  const quickActions = [
    { to: "/admin/study-plans", label: "إضافة مقرر", icon: BookOpen },
    { to: "/admin/study-plans", label: "إنشاء خطة دراسية", icon: ListTree },
    { to: "/admin/course-offerings", label: "إنشاء شعبة", icon: CalendarDays },
    { to: "/admin/enrollments", label: "تسجيل طالب", icon: ClipboardList },
    { to: "/admin/grades", label: "إدخال درجات", icon: ClipboardCheck },
    { to: "/admin/student-requests", label: "مراجعة الطلبات", icon: FileWarning },
    { to: "/admin/news", label: "خبر جديد", icon: Newspaper },
    { to: "/admin/contacts", label: "الرسائل", icon: MessageSquare },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نظرة شاملة على حركة الكلية والخدمات الأكاديمية.
        </p>
      </div>

      {/* Stats grouped sections */}
      {sections_.map((sec) => (
        <section key={sec.title} className="space-y-3">
          <h2 className="font-display text-base font-bold text-primary">{sec.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sec.cards.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="rounded-xl bg-card border border-border p-5 shadow-card flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">{c.label}</div>
                    <div className="mt-2 font-display text-3xl font-extrabold text-primary">
                      {c.value.toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold text-primary">إجراءات سريعة</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-3 rounded-xl bg-card border border-border p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 text-sm font-bold text-primary">{a.label}</div>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Shortcut to record link */}
      <section className="rounded-xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-primary">السجلات الأكاديمية</h2>
            <p className="text-sm text-muted-foreground mt-1">
              ابحث عن طالب لعرض سجله الأكاديمي غير الرسمي.
            </p>
          </div>
          <Link
            to="/admin/transcripts"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <FileText className="h-4 w-4" /> فتح السجلات
          </Link>
        </div>
      </section>
    </div>
  );
}
