import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, ArrowRight, AlertTriangle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCanonicalCurrentTerm,
  filterEnrollmentsForCurrentTerm,
  type CurrentTerm,
  type CurrentTermClient,
} from "@/lib/current-term";
import { COURSE_PASS_PERCENT } from "@/lib/academic/pass-threshold";

export const Route = createFileRoute("/mobile/student/grades")({
  head: () => ({
    meta: [
      { title: "درجاتي — تطبيق الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MobileStudentGradesPage,
});

const PASS_PERCENT = COURSE_PASS_PERCENT; // approved pass mark 48/100

type GradeCard = {
  enrollmentId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  total: number;
  totalMax: number;
  percentage: number | null;
  status: "passed" | "failed" | "in_progress";
  details: Array<{ name: string; max: number; score: number }>;
};

type GradesData = {
  rows: GradeCard[];
  term: { year: string | null; semester: string | null };
  unavailableReason?: "current_term_unavailable";
};

async function fetchMobileGrades(): Promise<GradesData> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { rows: [], term: { year: null, semester: null } };

  const { data: sp } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!sp?.id) return { rows: [], term: { year: null, semester: null } };

  const unavailableCurrentTerm: GradesData = {
    rows: [],
    term: { year: null, semester: null },
    unavailableReason: "current_term_unavailable",
  };
  let currentTerm: CurrentTerm | null;
  try {
    currentTerm = await fetchCanonicalCurrentTerm(supabase as unknown as CurrentTermClient);
  } catch {
    return unavailableCurrentTerm;
  }
  if (!currentTerm) return unavailableCurrentTerm;

  const cy = currentTerm.year;
  const cs = currentTerm.semester;

  const { data: enr, error: e1 } = await supabase
    .from("student_enrollments")
    .select(
      "id, course_section_id, enrollment_status, section:course_sections(section_code, offering:course_offerings(academic_year_id, semester_id, course:courses(code, name_ar)))",
    )
    .eq("student_profile_id", (sp as { id: string }).id);
  if (e1) throw e1;

  type EnRaw = {
    id: string;
    course_section_id: string;
    enrollment_status: string;
    section: {
      section_code: string;
      offering: {
        academic_year_id: string;
        semester_id: string;
        course: { code: string; name_ar: string } | null;
      } | null;
    } | null;
  };

  let enrollments = ((enr ?? []) as unknown as EnRaw[]).filter(
    (e) => e.enrollment_status !== "dropped" && e.section?.offering,
  );

  enrollments = filterEnrollmentsForCurrentTerm(enrollments, currentTerm);

  if (enrollments.length === 0) {
    return { rows: [], term: { year: cy?.name ?? null, semester: cs?.name ?? null } };
  }

  const { data: gs, error: e2 } = await supabase
    .from("student_grades")
    .select("id, student_enrollment_id, grade_component_id, score, status")
    .in("student_enrollment_id", enrollments.map((e) => e.id))
    .eq("status", "approved");
  if (e2) throw e2;

  type GR = {
    id: string;
    student_enrollment_id: string;
    grade_component_id: string;
    score: number;
    status: string;
  };
  const grades = (gs ?? []) as GR[];

  const sectionIds = Array.from(new Set(enrollments.map((e) => e.course_section_id)));
  const { data: cs2, error: e3 } = await supabase
    .from("grade_components")
    .select("id, course_section_id, name, max_score, sort_order")
    .in("course_section_id", sectionIds)
    .order("sort_order");
  if (e3) throw e3;

  type CR = { id: string; course_section_id: string; name: string; max_score: number };
  const comps = (cs2 ?? []) as CR[];

  const rows: GradeCard[] = enrollments.map((e) => {
    const myComps = comps.filter((c) => c.course_section_id === e.course_section_id);
    const myGrades = grades.filter((g) => g.student_enrollment_id === e.id);
    const totalMax = myComps.reduce((s, c) => s + Number(c.max_score), 0);
    const total = myGrades.reduce((s, g) => s + Number(g.score), 0);
    const percentage =
      myGrades.length > 0 && totalMax > 0
        ? Math.round((total / totalMax) * 1000) / 10
        : null;
    let status: GradeCard["status"];
    if (percentage == null) status = "in_progress";
    else if (percentage >= PASS_PERCENT) status = "passed";
    else status = e.enrollment_status === "completed" ? "failed" : "in_progress";

    return {
      enrollmentId: e.id,
      courseCode: e.section?.offering?.course?.code ?? "—",
      courseName: e.section?.offering?.course?.name_ar ?? "—",
      sectionCode: e.section?.section_code ?? "—",
      total,
      totalMax,
      percentage,
      status,
      details: myComps.map((c) => ({
        name: c.name,
        max: Number(c.max_score),
        score: Number(myGrades.find((g) => g.grade_component_id === c.id)?.score ?? 0),
      })),
    };
  });

  // Only show rows that have at least one approved component grade
  const visible = rows.filter((r) => r.percentage != null);

  return {
    rows: visible,
    term: { year: cy?.name ?? null, semester: cs?.name ?? null },
  };
}

const STATUS_BADGE: Record<GradeCard["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  passed: { label: "ناجح", cls: "bg-green-100 text-green-800", Icon: CheckCircle2 },
  failed: { label: "راسب", cls: "bg-red-100 text-red-800", Icon: XCircle },
  in_progress: { label: "قيد التقييم", cls: "bg-amber-100 text-amber-800", Icon: Loader2 },
};

function MobileStudentGradesPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "grades"],
    queryFn: fetchMobileGrades,
    staleTime: 3 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="px-4 py-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <Award className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-extrabold text-primary leading-tight">
              درجاتي
            </h1>
            {(data?.term.year || data?.term.semester) && (
              <p className="text-[10px] text-muted-foreground truncate">
                {[data.term.year, data.term.semester].filter(Boolean).join(" — ")}
              </p>
            )}
          </div>
        </div>
        <Link to="/mobile/student" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>
      </header>

      {isLoading && <CardsSkeleton />}

      {isError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-extrabold">تعذّر تحميل الدرجات</span>
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

      {!isLoading && !isError && (data?.rows.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Award className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm font-bold text-muted-foreground">
            لا توجد درجات منشورة حالياً.
          </p>
        </div>
      )}

      {!isLoading && !isError && (data?.rows.length ?? 0) > 0 && (
        <ul className="space-y-2.5">
          {data!.rows.map((row) => (
            <li key={row.enrollmentId}>
              <GradeCardItem row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GradeCardItem({ row }: { row: GradeCard }) {
  const badge = STATUS_BADGE[row.status];
  const Icon = badge.Icon;
  return (
    <article className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[13px] font-extrabold text-primary leading-tight">
            {row.courseName}
          </h3>
          <div dir="ltr" className="mt-0.5 text-[10px] font-mono text-muted-foreground text-right">
            {row.courseCode} • {row.sectionCode}
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${badge.cls}`}>
          <Icon className="h-3 w-3" />
          {badge.label}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-[11px] font-bold text-muted-foreground">المجموع</span>
        <div className="flex items-baseline gap-1.5">
          <span dir="ltr" className="font-display text-lg font-extrabold text-primary">
            {row.total}
          </span>
          <span className="text-[11px] text-muted-foreground">/ {row.totalMax}</span>
          {row.percentage != null && (
            <span dir="ltr" className="ms-2 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold text-primary-deep">
              {row.percentage}%
            </span>
          )}
        </div>
      </div>

      {row.details.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {row.details.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="text-foreground/80 truncate">{d.name}</span>
              <span dir="ltr" className="font-mono text-muted-foreground shrink-0">
                {d.score} / {d.max}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function CardsSkeleton() {
  return (
    <ul className="space-y-2.5" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="rounded-xl border border-border bg-card p-3.5 shadow-card space-y-3"
        >
          <div className="flex justify-between gap-2">
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-1/3 rounded bg-muted/70 animate-pulse" />
            </div>
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-10 rounded bg-muted/60 animate-pulse" />
        </li>
      ))}
    </ul>
  );
}
