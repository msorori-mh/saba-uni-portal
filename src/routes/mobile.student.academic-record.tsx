import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  ArrowRight,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  GraduationCap,
} from "lucide-react";
import { getMyProgress } from "@/lib/academic-status.functions";

export const Route = createFileRoute("/mobile/student/academic-record")({
  head: () => ({
    meta: [
      { title: "سجلي الأكاديمي — تطبيق الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MobileStudentAcademicRecordPage,
});

const STANDING_LABEL: Record<string, { label: string; cls: string }> = {
  good_standing: { label: "وضع جيد", cls: "bg-green-100 text-green-800" },
  warning: { label: "إنذار أكاديمي", cls: "bg-amber-100 text-amber-800" },
  probation: { label: "تحت المراقبة", cls: "bg-red-100 text-red-800" },
  suspended: { label: "موقوف القيد", cls: "bg-red-100 text-red-800" },
  graduated: { label: "خرّيج", cls: "bg-primary/10 text-primary" },
};

const STATUS_BADGE = {
  completed: { label: "مكتمل", cls: "bg-green-100 text-green-800", Icon: CheckCircle2 },
  failed: { label: "راسب", cls: "bg-red-100 text-red-800", Icon: XCircle },
  in_progress: { label: "قيد الدراسة", cls: "bg-amber-100 text-amber-800", Icon: Clock },
  missing: { label: "لم يُدرس", cls: "bg-muted text-muted-foreground", Icon: BookOpen },
} as const;

function MobileStudentAcademicRecordPage() {
  const fetchMine = useServerFn(getMyProgress);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "academic-record"],
    queryFn: () => fetchMine(),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return (
    <div className="px-4 py-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <GraduationCap className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-extrabold text-primary leading-tight">
              سجلي الأكاديمي
            </h1>
            <p className="text-[10px] text-muted-foreground truncate">
              ملخص المعدلات والحالة الأكاديمية والمقررات
            </p>
          </div>
        </div>
        <Link to="/mobile/student" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>
      </header>

      {isLoading && <RecordSkeleton />}

      {isError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-extrabold">تعذّر تحميل السجل</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-card px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
          >
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            إعادة المحاولة
          </button>
        </div>
      )}

      {!isLoading && !isError && data && <RecordBody d={data} />}
    </div>
  );
}

function RecordBody({ d }: { d: Awaited<ReturnType<typeof getMyProgress>> }) {
  const standing = STANDING_LABEL[d.standing.standing] ?? {
    label: d.standing.standing,
    cls: "bg-muted text-foreground",
  };

  const courses = [...d.audit.courses].sort((a, b) => {
    const order = { completed: 0, in_progress: 1, failed: 2, missing: 3 } as const;
    return order[a.status] - order[b.status];
  });

  const completed = courses.filter((c) => c.status === "completed");
  const inProgress = courses.filter((c) => c.status === "in_progress");
  const failed = courses.filter((c) => c.status === "failed");

  return (
    <div className="space-y-4">
      {/* Standing + official results */}
      <section className="rounded-2xl bg-primary-deep text-primary-foreground p-4 space-y-3 shadow-elegant">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gold/80">
            الحالة الأكاديمية
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${standing.cls}`}>
            {standing.label}
          </span>
        </div>
        <p className="text-[11px] text-primary-foreground/80 leading-snug">
          {d.standing.reason}
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <ResultTile label="النتيجة الفصلية" value={d.progress.current_official_average} />
          <ResultTile label="النتيجة التراكمية" value={d.progress.cumulative_official_average} />
        </div>
      </section>

      {/* Progress stats */}
      <section className="grid grid-cols-2 gap-2.5">
        <StatTile label="ساعات مكتملة" value={`${d.progress.completed_hours}`} sub={`من ${d.progress.total_plan_hours}`} />
        <StatTile label="ساعات متبقية" value={`${d.progress.remaining_hours}`} sub="ساعة" />
        <StatTile label="مقررات ناجحة" value={`${d.progress.passed_courses}`} />
        <StatTile label="مقررات راسبة" value={`${d.progress.failed_courses}`} />
      </section>

      {/* Completion bar */}
      <section className="rounded-xl border border-border bg-card p-3.5">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="font-bold text-foreground/80">نسبة الإنجاز</span>
          <span dir="ltr" className="font-mono font-extrabold text-primary">
            {d.progress.completion_percentage}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gold-gradient transition-all"
            style={{ width: `${Math.min(100, Math.max(0, d.progress.completion_percentage))}%` }}
          />
        </div>
      </section>

      {/* Course buckets */}
      <CoursesGroup title="مقررات مكتملة" Icon={CheckCircle2} courses={completed} variant="completed" />
      {inProgress.length > 0 && (
        <CoursesGroup title="قيد الدراسة" Icon={Clock} courses={inProgress} variant="in_progress" />
      )}
      {failed.length > 0 && (
        <CoursesGroup title="مقررات راسبة" Icon={XCircle} courses={failed} variant="failed" />
      )}
    </div>
  );
}

function ResultTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-primary-foreground/10 border border-gold/30 p-2.5">
      <div className="text-[10px] font-bold text-gold/90">{label}</div>
      <div dir="ltr" className="mt-0.5 font-display text-xl font-extrabold text-gold">
        {value.toFixed(1)}%
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span dir="ltr" className="font-display text-lg font-extrabold text-primary">
          {value}
        </span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

type CourseRow = Awaited<ReturnType<typeof getMyProgress>>["audit"]["courses"][number];

function CoursesGroup({
  title,
  Icon,
  courses,
  variant,
}: {
  title: string;
  Icon: typeof CheckCircle2;
  courses: CourseRow[];
  variant: keyof typeof STATUS_BADGE;
}) {
  if (courses.length === 0) {
    return (
      <section>
        <SectionHeader title={title} Icon={Icon} count={0} />
        <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-[11px] text-muted-foreground">
          لا توجد مقررات في هذه الفئة.
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader title={title} Icon={Icon} count={courses.length} />
      <ul className="space-y-2">
        {courses.map((c) => (
          <li key={c.course_id}>
            <CourseItem c={c} variant={variant} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeader({
  title,
  Icon,
  count,
}: {
  title: string;
  Icon: typeof CheckCircle2;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      <Icon className="h-4 w-4 text-gold" />
      <h2 className="font-display text-sm font-extrabold text-primary">{title}</h2>
      <span className="text-[10px] font-bold text-muted-foreground">({count})</span>
    </div>
  );
}

function CourseItem({ c, variant }: { c: CourseRow; variant: keyof typeof STATUS_BADGE }) {
  const badge = STATUS_BADGE[variant];
  const BadgeIcon = badge.Icon;
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[12.5px] font-extrabold text-primary leading-tight">
            {c.name_ar}
          </h3>
          <div dir="ltr" className="mt-0.5 text-[10px] font-mono text-muted-foreground text-right">
            {c.code} • {c.credit_hours} ساعة
            {c.is_required && <span className="text-primary"> • إجباري</span>}
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${badge.cls}`}>
          <BadgeIcon className="h-3 w-3" />
          {badge.label}
        </span>
      </div>
      {c.best_percentage != null && (
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">أفضل نتيجة</span>
          <span dir="ltr" className="font-mono font-extrabold text-primary">
            {c.best_percentage}%
          </span>
        </div>
      )}
      {c.attempts > 1 && (
        <div className="mt-1 text-[10px] text-amber-700 font-bold">
          عدد المحاولات: {c.attempts}
        </div>
      )}
    </article>
  );
}

function RecordSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="rounded-2xl bg-muted h-32 animate-pulse" />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl h-20 bg-muted animate-pulse" />
        ))}
      </div>
      <div className="rounded-xl h-14 bg-muted animate-pulse" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-28 bg-muted rounded animate-pulse" />
          {[0, 1].map((j) => (
            <div key={j} className="rounded-xl h-16 bg-muted animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
