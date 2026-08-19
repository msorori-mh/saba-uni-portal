import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Award,
  BookOpen,
  ClipboardList,
  FileText,
  Loader2,
  UserRound,
} from "lucide-react";
import { getStudentSelfReportsSummary } from "@/lib/beneficiary-reports.functions";
import {
  STUDENT_STATUS_LABELS_AR,
  STUDY_SYSTEM_LABELS_AR,
  useMobileStudentContext,
} from "@/lib/mobile/student-context";

export const Route = createFileRoute("/mobile/student/profile")({
  head: () => ({ meta: [{ title: "بياناتي الأكاديمية" }] }),
  component: MobileStudentAcademicProfile,
});

function metricNumber(metric: { value?: number | null } | null | undefined): number {
  return typeof metric?.value === "number" ? metric.value : 0;
}

/** Student self-only: server scope resolves the authenticated student's profile. */
function MobileStudentAcademicProfile() {
  const { data, isLoading, isError } = useMobileStudentContext();
  const fetchSummary = useServerFn(getStudentSelfReportsSummary);
  const summaryQuery = useQuery({
    queryKey: ["mobile-student", "academic-self-summary"],
    queryFn: () => fetchSummary({ data: {} }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const p = data?.profile ?? null;
  const current = data?.currentEnrolment ?? null;

  const rows: { label: string; value: string; ltr?: boolean }[] = p
    ? [
        { label: "الاسم", value: p.full_name_ar ?? "—" },
        { label: "الرقم الأكاديمي", value: p.academic_number ?? "—", ltr: true },
        { label: "القسم", value: p.department?.name_ar ?? "—" },
        { label: "البرنامج", value: p.program?.name_ar ?? "—" },
        {
          label: "المستوى الحالي",
          value: current?.levelName ?? (data?.levelNumber ? `المستوى ${data.levelNumber}` : "—"),
        },
        { label: "العام الأكاديمي", value: current?.academicYearName ?? "—" },
        { label: "الفصل الحالي", value: current?.semesterName ?? "—" },
        {
          label: "نظام الدراسة",
          value: p.study_system ? STUDY_SYSTEM_LABELS_AR[p.study_system] ?? p.study_system : "—",
        },
        {
          label: "حالة القيد",
          value: p.status ? STUDENT_STATUS_LABELS_AR[p.status] ?? p.status : "—",
        },
        { label: "البريد الإلكتروني", value: p.email ?? "—", ltr: true },
        { label: "رقم الهاتف", value: p.phone ?? "—", ltr: true },
      ]
    : [];

  if (isLoading || summaryQuery.isLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || summaryQuery.isError || !p) {
    return (
      <div className="px-4 py-6" dir="rtl">
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          تعذر تحميل بياناتك الأكاديمية. حاول مرة أخرى.
        </p>
      </div>
    );
  }

  const kpis = summaryQuery.data?.kpis;

  return (
    <div className="px-4 py-5 space-y-5" dir="rtl">
      <header>
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <UserRound className="h-5 w-5 text-gold" /> بياناتي الأكاديمية
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          ملخص ذاتي من السجل الأكاديمي والطلبات والوثائق المرتبطة بحسابك فقط.
        </p>
      </header>

      <section aria-labelledby="academic-status-heading">
        <h2 id="academic-status-heading" className="mb-2 text-sm font-extrabold text-primary">
          الحالة والقيد الأكاديمي
        </h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="text-[11px] font-bold text-muted-foreground">{r.label}</span>
              <span
                dir={r.ltr ? "ltr" : undefined}
                className={`max-w-[65%] text-left text-[13px] font-extrabold text-primary ${r.ltr ? "font-mono" : ""}`}
              >
                {r.value}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="academic-indicators-heading">
        <h2 id="academic-indicators-heading" className="mb-2 text-sm font-extrabold text-primary">
          مؤشرات حسابي
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "مقررات مسجلة", value: metricNumber(kpis?.activeEnrollments), Icon: BookOpen },
            { label: "طلبات مفتوحة", value: metricNumber(kpis?.openRequests), Icon: ClipboardList },
            { label: "وثائق صادرة", value: metricNumber(kpis?.issuedDocuments), Icon: FileText },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-xl border border-gold/30 bg-card p-3 text-center shadow-card">
              <Icon className="mx-auto h-4 w-4 text-gold" />
              <div className="mt-1 text-lg font-extrabold text-primary">{value}</div>
              <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {(summaryQuery.data?.returnedForCompletion ?? 0) > 0 ? (
        <Link
          to="/mobile/student/requests"
          className="block rounded-xl border border-orange-300 bg-orange-50 p-3 text-sm font-bold text-orange-900"
        >
          لديك {summaryQuery.data?.returnedForCompletion} طلب يحتاج استكمالاً
        </Link>
      ) : null}

      <section aria-labelledby="academic-links-heading">
        <h2 id="academic-links-heading" className="mb-2 text-sm font-extrabold text-primary">
          التفاصيل
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "الدرجات", to: "/mobile/student/grades" as const, Icon: Award },
            { label: "الخطة الدراسية", to: "/mobile/student/study-plan" as const, Icon: BookOpen },
            { label: "طلباتي السابقة", to: "/mobile/student/requests" as const, Icon: ClipboardList },
            { label: "وثائقي", to: "/mobile/student/documents" as const, Icon: FileText },
          ].map(({ label, to, Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-extrabold text-primary"
            >
              <Icon className="h-4 w-4 text-gold" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        هذه البيانات للعرض فقط. لتعديل أي بيان، راجع شؤون الطلاب في الكلية.
      </p>
    </div>
  );
}
