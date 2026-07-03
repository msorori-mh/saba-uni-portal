import { createFileRoute } from "@tanstack/react-router";
import {
  ScrollText, Users2, CalendarClock, FilePlus2, ListChecks, FileText,
  ClipboardCheck, Archive, Bell, Info, Lock, LayoutDashboard, BarChart3,
  AlertTriangle, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/academic-councils")({
  head: () => ({
    meta: [
      { title: "بوابة إدارة المجالس الأكاديمية — قيد التأسيس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcademicCouncilsScaffoldPage,
});

// ============================================================================
// STATIC DEMO DATA — for presentation/design only. Never fetched from DB.
// ============================================================================

const KPIS = [
  { label: "الاجتماعات القادمة", value: "قيد التأسيس", icon: CalendarClock },
  { label: "الموضوعات المرفوعة", value: "قيد التأسيس", icon: FilePlus2 },
  { label: "القرارات قيد المتابعة", value: "قيد التأسيس", icon: ClipboardCheck },
  { label: "القرارات المتأخرة", value: "قيد التأسيس", icon: AlertTriangle },
] as const;

const COUNCIL_OVERVIEW = [
  {
    name: "مجلس الكلية",
    type: "college" as const,
    members: "— عضو",
    lastMeeting: "—",
    nextMeeting: "—",
    status: "قيد التأسيس",
  },
  {
    name: "مجلس قسم تقنية المعلومات",
    type: "department" as const,
    members: "— عضو",
    lastMeeting: "—",
    nextMeeting: "—",
    status: "قيد التأسيس",
  },
  {
    name: "مجلس قسم علوم الحاسوب",
    type: "department" as const,
    members: "— عضو",
    lastMeeting: "—",
    nextMeeting: "—",
    status: "قيد التأسيس",
  },
];

const UPCOMING_MEETINGS_PLACEHOLDER = [
  { title: "الاجتماع الدوري لمجلس الكلية", when: "—", where: "—" },
  { title: "الاجتماع الدوري لمجلس القسم", when: "—", where: "—" },
];

const AGENDA_STAGES = [
  { label: "دراسة المقترح", count: "—" },
  { label: "قيد المراجعة", count: "—" },
  { label: "معتمد على جدول الأعمال", count: "—" },
  { label: "مؤجَّل", count: "—" },
];

const CONCEPT_CARDS = [
  {
    icon: LayoutDashboard,
    title: "هدف البوابة",
    desc: "توحيد إدارة مجلس الكلية ومجالس الأقسام في بيئة رقمية آمنة تحفظ سرية القرارات وتحدد الصلاحيات.",
  },
  {
    icon: Users2,
    title: "مجلس الكلية",
    desc: "مجلس واحد على مستوى الكلية يضم العمادة ورؤساء الأقسام وأعضاء التمثيل الأكاديمي.",
  },
  {
    icon: Users2,
    title: "مجالس الأقسام",
    desc: "مجلس لكل قسم أكاديمي معزول عن باقي الأقسام وفق سياسة العزل بالقسم.",
  },
  {
    icon: FilePlus2,
    title: "دورة الموضوع",
    desc: "من الرفع إلى المراجعة إلى الاعتماد على جدول الأعمال أو التأجيل أو الرفض.",
  },
  {
    icon: CalendarClock,
    title: "دورة الاجتماع",
    desc: "من الجدولة إلى فتح استقبال المواضيع إلى الجلسة إلى إغلاق المحضر والأرشفة.",
  },
  {
    icon: ClipboardCheck,
    title: "دورة القرار والمتابعة",
    desc: "إصدار القرار، إسناد المسؤول، تتبع التنفيذ، وإغلاقه رسمياً بعد الإنجاز.",
  },
  {
    icon: Bell,
    title: "الجدولة والتنبيهات المستقبلية",
    desc: "قواعد جدولة دورية وتنبيهات آلية للأعضاء قبل الاجتماعات وعند فتح الاستقبال.",
  },
  {
    icon: Archive,
    title: "الأرشفة والتقارير",
    desc: "أرشيف كامل للمحاضر والقرارات وتقارير أداء المجالس ونسب تنفيذ التوصيات.",
  },
];

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
        {hint ?? "سيتاح بعد تفعيل قاعدة بيانات المجالس والصلاحيات."}
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

// ============================================================================
// PAGE
// ============================================================================

function AcademicCouncilsScaffoldPage() {
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
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
              قيد التأسيس
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
            بوابة رقمية متخصصة لإدارة مجالس الكلية ومجالس الأقسام، تشمل جدولة الاجتماعات،
            استقبال الموضوعات، إعداد جداول الأعمال، توثيق المحاضر والقرارات، متابعة تنفيذ
            التوصيات، وأرشفة أعمال المجالس وفق صلاحيات مؤسسية دقيقة.
          </p>
        </div>
      </div>

      {/* Prominent notice */}
      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-amber-900">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
        <div className="text-sm">
          <div className="font-bold">تنبيه عرض</div>
          <div className="mt-0.5 leading-relaxed">
            هذه البوابة في مرحلة التأسيس، والبيانات المعروضة لأغراض العرض والتصميم فقط،
            ولا تمثل بيانات رسمية. لا يوجد اتصال بأي قاعدة بيانات للمجالس في هذه المرحلة.
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <SectionCard
        icon={BarChart3}
        title="لوحة المجالس"
        subtitle="مؤشرات عامة عن نشاط المجالس — عرض توضيحي فقط."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <k.icon className="h-4 w-4" />
                <span className="text-xs">{k.label}</span>
              </div>
              <div className="mt-1 font-bold text-primary">{k.value}</div>
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
          <ul className="space-y-2">
            {COUNCIL_OVERVIEW.filter((c) => c.type === "college").map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
              >
                <div>
                  <div className="font-bold text-primary text-sm">{c.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    الأعضاء: {c.members} · الاجتماع القادم: {c.nextMeeting}
                  </div>
                </div>
                <Badge variant="secondary" className="text-[11px]">{c.status}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          icon={Users2}
          title="مجالس الأقسام"
          subtitle="مجلس لكل قسم أكاديمي داخل الكلية."
        >
          <ul className="space-y-2">
            {COUNCIL_OVERVIEW.filter((c) => c.type === "department").map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
              >
                <div>
                  <div className="font-bold text-primary text-sm">{c.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    الأعضاء: {c.members} · الاجتماع القادم: {c.nextMeeting}
                  </div>
                </div>
                <Badge variant="secondary" className="text-[11px]">{c.status}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Upcoming meetings */}
      <SectionCard
        icon={CalendarClock}
        title="الاجتماعات القادمة"
        subtitle="جدولة الاجتماعات وإرسال الدعوات."
      >
        <ul className="space-y-2">
          {UPCOMING_MEETINGS_PLACEHOLDER.map((m) => (
            <li
              key={m.title}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-background p-3"
            >
              <div>
                <div className="font-bold text-primary text-sm">{m.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  الموعد: {m.when} · المكان: {m.where}
                </div>
              </div>
              <Badge variant="outline" className="text-[11px]">قيد التأسيس</Badge>
            </li>
          ))}
        </ul>
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
        <EmptyState text="نموذج رفع الموضوع سيتاح بعد تفعيل قاعدة بيانات المجالس." />
        <div className="mt-4">
          <LockedAction label="رفع موضوع جديد" />
        </div>
      </SectionCard>

      {/* Agenda */}
      <SectionCard
        icon={ListChecks}
        title="جدول الأعمال"
        subtitle="إعداد وترتيب بنود جدول الأعمال لكل اجتماع."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENDA_STAGES.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-bold text-primary">{s.count}</div>
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
        <EmptyState text="لا توجد محاضر أو قرارات لعرضها في المرحلة الحالية." />
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
        <EmptyState text="لا توجد قرارات قيد المتابعة في المرحلة الحالية." />
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
          <EmptyState text="ستُتاح التقارير بعد تفعيل قاعدة بيانات المجالس." />
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
        subtitle="بطاقات تعريفية للتصميم المقترح."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONCEPT_CARDS.map((c) => (
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
          القرارات، إرسال التنبيهات) ستُفعَّل في مراحل لاحقة بعد اعتماد قاعدة البيانات
          الخاصة بالمجالس والصلاحيات المرتبطة بها.
        </div>
      </div>
    </div>
  );
}
