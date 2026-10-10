import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  AlertTriangle,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { fetchMobileStudentContext, useMobileStudentContext } from "@/lib/mobile/student-context";
import { getMyProgress } from "@/lib/academic-status.functions";
import { AcademicTranscript } from "@/components/academic/AcademicTranscript";
import { MOBILE_QUERY_GC_TIME_MS } from "@/lib/mobile/query-cache";
import {
  MOBILE_OFFLINE_PREFETCH_OPTIONS,
  prefetchMobileOfflineScreen,
} from "@/lib/mobile/offline/screen-prefetch";

export const Route = createFileRoute("/mobile/student/academic-record")({
  head: () => ({
    meta: [
      { title: "سجلي الأكاديمي — تطبيق الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  // Offline mode: downloaded (and saved) in the background when the layout
  // preloads this route — the student context first (it carries the profile id
  // the record is keyed by), then the record itself.
  loader: ({ context }) =>
    prefetchMobileOfflineScreen(context.queryClient, async (queryClient) => {
      const studentContext = await queryClient.fetchQuery({
        queryKey: ["mobile-student", "context"],
        queryFn: fetchMobileStudentContext,
        ...MOBILE_OFFLINE_PREFETCH_OPTIONS,
      });
      const studentProfileId = studentContext.profile?.id;
      if (!studentProfileId) return;
      await queryClient.prefetchQuery({
        queryKey: ["mobile-student", "academic-record", studentProfileId],
        queryFn: () => getMyProgress(),
        ...MOBILE_OFFLINE_PREFETCH_OPTIONS,
      });
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

function MobileStudentAcademicRecordPage() {
  const studentContext = useMobileStudentContext();
  const studentProfileId = studentContext.data?.profile?.id;
  const fetchMine = useServerFn(getMyProgress);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "academic-record", studentProfileId],
    enabled: Boolean(studentProfileId),
    queryFn: () => fetchMine(),
    staleTime: 5 * 60 * 1000,
    gcTime: MOBILE_QUERY_GC_TIME_MS,
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
              ملخص النتائج الرسمية والحالة الأكاديمية والمقررات
            </p>
          </div>
        </div>
        <Link to="/mobile/student" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>
      </header>

      {(studentContext.isLoading || isLoading) && <RecordSkeleton />}

      {(isError || studentContext.isError || (!studentContext.isLoading && !studentProfileId)) && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-extrabold">تعذّر تحميل السجل</span>
          </div>
          <button
            onClick={() => {
              void studentContext.refetch();
              if (studentProfileId) void refetch();
            }}
            disabled={isFetching || studentContext.isFetching}
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

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        عرض للاطلاع على نتائجك المعتمدة والتقدم في خطتك الدراسية. الوثائق الرسمية متاحة من قسم الوثائق.
      </p>
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

      <AcademicTranscript d={d} />
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
