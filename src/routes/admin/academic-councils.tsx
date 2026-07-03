import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ScrollText, Users2, CalendarClock, FilePlus2, ListChecks, FileText,
  ClipboardCheck, Archive, Bell, Info, Lock, LayoutDashboard, BarChart3,
  AlertTriangle, ArrowRight, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCouncilsSummary, type CouncilsSummary } from "@/lib/admin-councils.functions";

export const Route = createFileRoute("/admin/academic-councils")({
  head: () => ({
    meta: [
      { title: "بوابة إدارة المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcademicCouncilsPage,
});

// ============================================================================
// SHARED UI PIECES
// ============================================================================

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof ScrollText;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-start gap-3 border-b border-border/60 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-primary">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LockedAction({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled className="gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        {label}
      </Button>
      <span className="text-[11px] text-muted-foreground">
        {hint ?? "سيتاح بعد اكتمال اعتماد صلاحيات الكتابة على بوابة المجالس."}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// ============================================================================
// PAGE
// ============================================================================

const EMPTY_SUMMARY: CouncilsSummary = {
  councils: [],
  kpis: {
    upcoming_meetings: 0,
    submitted_topics: 0,
    open_decisions: 0,
    overdue_decisions: 0,
  },
  agenda_stages: { draft: 0, under_review: 0, approved: 0, deferred: 0 },
  upcoming_meetings: [],
};

function AcademicCouncilsPage() {
  const fetchSummary = useServerFn(getCouncilsSummary);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "academic-councils", "summary"],
    queryFn: () => fetchSummary(),
    staleTime: 30_000,
  });

  const summary: CouncilsSummary = data ?? EMPTY_SUMMARY;
  const collegeCouncils = summary.councils.filter((c) => c.council_type === "college");
  const departmentCouncils = summary.councils.filter((c) => c.council_type === "department");

  const kpis = [
    { label: "الاجتماعات القادمة", value: summary.kpis.upcoming_meetings, icon: CalendarClock },
    { label: "الموضوعات المرفوعة", value: summary.kpis.submitted_topics, icon: FilePlus2 },
    { label: "القرارات قيد المتابعة", value: summary.kpis.open_decisions, icon: ClipboardCheck },
    { label: "القرارات المتأخرة", value: summary.kpis.overdue_decisions, icon: AlertTriangle },
  ] as const;

  const agendaStages = [
    { label: "دراسة المقترح", count: summary.agenda_stages.draft },
    { label: "قيد المراجعة", count: summary.agenda_stages.under_review },
    { label: "معتمد على جدول الأعمال", count: summary.agenda_stages.approved },
    { label: "مؤجَّل", count: summary.agenda_stages.deferred },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold-gradient text-primary-deep shrink-0">
          <ScrollText className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-primary">
              بوابة إدارة المجالس الأكاديمية
            </h1>
            <Badge variant="outline" className="border-emerald-400 bg-emerald-50 text-emerald-800">
              قراءة فقط
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
            بوابة رقمية متخصصة لإدارة مجالس الكلية ومجالس الأقسام، تشمل جدولة الاجتماعات،
            استقبال الموضوعات، إعداد جداول الأعمال، توثيق المحاضر والقرارات، متابعة تنفيذ
            التوصيات، وأرشفة أعمال المجالس وفق صلاحيات مؤسسية دقيقة.
          </p>
        </div>
      </div>

      {/* Notice */}
      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-amber-900">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
        <div className="text-sm">
          <div className="font-bold">وضع القراءة فقط</div>
          <div className="mt-0.5 leading-relaxed">
            تم تفعيل قراءة بيانات المجالس من قاعدة البيانات. جميع عمليات الإنشاء والتعديل
            والإصدار وإرسال التنبيهات لا تزال معطّلة ريثما يعتمد الفريق التنفيذي مرحلة
            الكتابة الآمنة.
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          تعذّر تحميل بيانات المجالس حالياً. يرجى إعادة المحاولة لاحقاً.
        </div>
      ) : null}

      {/* KPI strip */}
      <SectionCard
        icon={BarChart3}
        title="لوحة المجالس"
        subtitle="مؤشرات مباشرة من قاعدة بيانات المجالس."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <k.icon className="h-4 w-4" />
                <span className="text-xs">{k.label}</span>
              </div>
              <div className="mt-1 font-bold text-primary">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : k.value}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* College + department councils overview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={Users2}
          title="مجلس الكلية"
          subtitle="مجلس واحد على مستوى الكلية."
        >
          {isLoading ? (
            <EmptyState text="جاري تحميل بيانات مجلس الكلية…" />
          ) : collegeCouncils.length === 0 ? (
            <EmptyState text="لا يوجد مجلس كلية مفعّل حالياً." />
          ) : (
            <ul className="space-y-2">
              {collegeCouncils.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                >
                  <div>
                    <div className="font-bold text-primary text-sm">{c.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      الأعضاء: {c.members_count} · الاجتماع القادم: {formatDateTime(c.next_meeting_at)}
                    </div>
                  </div>
                  <Badge variant={c.is_active ? "secondary" : "outline"} className="text-[11px]">
                    {c.is_active ? "مفعّل" : "غير مفعّل"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={Users2}
          title="مجالس الأقسام"
          subtitle="مجلس لكل قسم أكاديمي داخل الكلية."
        >
          {isLoading ? (
            <EmptyState text="جاري تحميل بيانات مجالس الأقسام…" />
          ) : departmentCouncils.length === 0 ? (
            <EmptyState text="لا توجد مجالس أقسام مفعّلة حالياً." />
          ) : (
            <ul className="space-y-2">
              {departmentCouncils.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                >
                  <div>
                    <div className="font-bold text-primary text-sm">{c.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      الأعضاء: {c.members_count} · الاجتماع القادم: {formatDateTime(c.next_meeting_at)}
                    </div>
                  </div>
                  <Badge variant={c.is_active ? "secondary" : "outline"} className="text-[11px]">
                    {c.is_active ? "مفعّل" : "غير مفعّل"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Upcoming meetings */}
      <SectionCard
        icon={CalendarClock}
        title="الاجتماعات القادمة"
        subtitle="أقرب خمسة اجتماعات مجدولة."
      >
        {isLoading ? (
          <EmptyState text="جاري تحميل الاجتماعات…" />
        ) : summary.upcoming_meetings.length === 0 ? (
          <EmptyState text="لا توجد اجتماعات مجدولة حالياً." />
        ) : (
          <ul className="space-y-2">
            {summary.upcoming_meetings.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3"
              >
                <div>
                  <div className="font-bold text-primary text-sm">{m.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {m.council_name} · الموعد: {formatDateTime(m.scheduled_at)} ·
                    المكان: {m.location ?? "—"}
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px]">مجدول</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <LockedAction label="إنشاء اجتماع" />
        </div>
      </SectionCard>

      {/* Submit topic */}
      <SectionCard
        icon={FilePlus2}
        title="رفع موضوع جديد"
        subtitle="استقبال الموضوعات المقترحة للإدراج في جدول الأعمال."
      >
        <EmptyState text="نموذج رفع الموضوع سيتاح بعد اعتماد مرحلة الكتابة." />
        <div className="mt-4">
          <LockedAction label="رفع موضوع جديد" />
        </div>
      </SectionCard>

      {/* Agenda stages */}
      <SectionCard
        icon={ListChecks}
        title="جدول الأعمال"
        subtitle="توزيع الموضوعات على مراحل جدول الأعمال."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agendaStages.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-bold text-primary">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : s.count}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <LockedAction label="اعتماد جدول أعمال" />
        </div>
      </SectionCard>

      {/* Minutes & decisions */}
      <SectionCard
        icon={FileText}
        title="المحاضر والقرارات"
        subtitle="توثيق المحاضر واعتماد القرارات رسمياً."
      >
        <EmptyState text="لا توجد محاضر أو قرارات لعرضها حالياً." />
        <div className="mt-4">
          <LockedAction label="إصدار قرار" />
        </div>
      </SectionCard>

      {/* Follow-up */}
      <SectionCard
        icon={ClipboardCheck}
        title="متابعة تنفيذ القرارات"
        subtitle="تتبع حالة تنفيذ التوصيات والقرارات."
      >
        {isLoading ? (
          <EmptyState text="جاري تحميل بيانات المتابعة…" />
        ) : summary.kpis.open_decisions === 0 ? (
          <EmptyState text="لا توجد قرارات قيد المتابعة حالياً." />
        ) : (
          <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
            يوجد {summary.kpis.open_decisions} قرار قيد المتابعة، منها
            {" "}{summary.kpis.overdue_decisions} متأخرة.
          </div>
        )}
      </SectionCard>

      {/* Archive + Reports */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={Archive}
          title="الأرشيف"
          subtitle="أرشفة أعمال المجالس السابقة للرجوع إليها."
        >
          <EmptyState text="سيُعرض هنا أرشيف المحاضر والقرارات المعتمدة." />
        </SectionCard>

        <SectionCard
          icon={BarChart3}
          title="التقارير"
          subtitle="تقارير أداء المجالس ونسب تنفيذ التوصيات."
        >
          <EmptyState text="ستُتاح التقارير بعد تفعيل مرحلة الكتابة والقرارات." />
        </SectionCard>
      </div>

      {/* Scheduling + notifications settings */}
      <SectionCard
        icon={Bell}
        title="إعدادات الجدولة والتنبيهات"
        subtitle="ضبط مواعيد التنبيهات والتذكيرات الآلية."
      >
        <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed list-disc pr-5">
          <li>قواعد جدولة دورية للاجتماعات (يومياً/أسبوعياً/شهرياً) — قيد التأسيس.</li>
          <li>تنبيهات قبل موعد الاجتماع للأعضاء — قيد التأسيس.</li>
          <li>تنبيهات فتح وإغلاق استقبال الموضوعات — قيد التأسيس.</li>
          <li>تذكيرات القرارات المتأخرة على المسؤولين — قيد التأسيس.</li>
        </ul>
        <div className="mt-4">
          <LockedAction label="إرسال تنبيه" hint="سيتاح بعد تفعيل خدمات التنبيهات المؤسسية." />
        </div>
      </SectionCard>

      {/* Concept cards */}
      <SectionCard
        icon={Info}
        title="نظرة معمارية على البوابة"
        subtitle="بطاقات تعريفية للتصميم المعتمد."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: LayoutDashboard, title: "هدف البوابة", desc: "توحيد إدارة مجلس الكلية ومجالس الأقسام في بيئة رقمية آمنة تحفظ سرية القرارات وتحدد الصلاحيات." },
            { icon: Users2, title: "مجلس الكلية", desc: "مجلس واحد على مستوى الكلية يضم العمادة ورؤساء الأقسام وأعضاء التمثيل الأكاديمي." },
            { icon: Users2, title: "مجالس الأقسام", desc: "مجلس لكل قسم أكاديمي معزول عن باقي الأقسام وفق سياسة العزل بالقسم." },
            { icon: FilePlus2, title: "دورة الموضوع", desc: "من الرفع إلى المراجعة إلى الاعتماد على جدول الأعمال أو التأجيل أو الرفض." },
            { icon: CalendarClock, title: "دورة الاجتماع", desc: "من الجدولة إلى فتح استقبال المواضيع إلى الجلسة إلى إغلاق المحضر والأرشفة." },
            { icon: ClipboardCheck, title: "دورة القرار والمتابعة", desc: "إصدار القرار، إسناد المسؤول، تتبع التنفيذ، وإغلاقه رسمياً بعد الإنجاز." },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-primary shrink-0">
                  <c.icon className="h-4 w-4" />
                </div>
                <div className="font-bold text-primary text-sm">{c.title}</div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Footer note */}
      <div className="rounded-lg border border-dashed border-border bg-card p-4 flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
        <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <div>
          الوظائف التشغيلية (إنشاء المجالس، جدولة الاجتماعات، استقبال الموضوعات، إصدار
          القرارات، إرسال التنبيهات) ستُفعَّل في مرحلة الكتابة الآمنة بعد اعتمادها.
        </div>
      </div>
    </div>
  );
}
