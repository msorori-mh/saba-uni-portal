import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BarChart3, Loader2 } from "lucide-react";
import { useMemo } from "react";
import {
  getStudentSelfReportCatalog,
  getStudentSelfReportsSummary,
} from "@/lib/beneficiary-reports.functions";
import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import { StudentSelfReportsList } from "@/components/reports/StudentSelfReportsList";
import { buildStudentAttention } from "@/lib/reports/attention";

export const Route = createFileRoute("/student/reports")({
  head: () => ({
    meta: [
      { title: "تقاريري — بوابة الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudentReportsPage,
});

function StudentReportsPage() {
  const fetchSummary = useServerFn(getStudentSelfReportsSummary);
  const fetchStudentCatalog = useServerFn(getStudentSelfReportCatalog);
  const summaryQuery = useQuery({
    queryKey: ["student-self-reports"],
    queryFn: () => fetchSummary(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const catalogQuery = useQuery({
    queryKey: ["student-reports-catalog"],
    queryFn: () => fetchStudentCatalog({ data: { surface: "web" as const } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const data = summaryQuery.data;
  const studentCatalog = catalogQuery.data;
  // Combined state: one spinner, one error, one retry for both reads.
  const isLoading = summaryQuery.isLoading || catalogQuery.isLoading;
  const error = summaryQuery.error ?? catalogQuery.error;
  const retry = () => {
    void summaryQuery.refetch();
    void catalogQuery.refetch();
  };


  const attentionItems = useMemo(
    () =>
      buildStudentAttention({
        returnedForCompletion: data?.returnedForCompletion ?? 0,
        allowedActionTos: ["/student/requests"],
      }),
    [data?.returnedForCompletion],
  );

  const kpiTiles = useMemo(
    () =>
      data
        ? [
            { label: "المقررات الحالية", metric: data.kpis.activeEnrollments },
            { label: "الطلبات المفتوحة", metric: data.kpis.openRequests },
            { label: "الوثائق الصادرة", metric: data.kpis.issuedDocuments },
          ]
        : [],
    [data],
  );

  return (
    <div dir="rtl" className="container mx-auto max-w-5xl px-4 py-6">
      {isLoading ? (
        <div className="flex justify-center py-12" data-testid="student-reports-loading">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="space-y-3" data-testid="student-reports-error">
          <p className="text-sm text-destructive" role="alert">
            {(error as Error).message || "تعذر تحميل التقارير"}
          </p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-bold text-primary hover:border-gold"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (

        <ReportsOperationalWorkspace
          attentionItems={attentionItems}
          kpiTiles={kpiTiles}
          header={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-extrabold text-primary">
                    تقاريري
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    نطاق ذاتي فقط — لا تعرض بيانات طلاب آخرين.
                    {data?.scopeLabelAr ? ` — ${data.scopeLabelAr}` : ""}
                  </p>
                </div>
              </div>
              <Link
                to="/student"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold"
              >
                <ArrowRight className="h-4 w-4" /> الرجوع
              </Link>
            </div>
          }
          betweenKpisAndCatalog={
            data?.links?.length ? (
              <section className="space-y-2" aria-label="روابط سريعة">
                <h2 className="font-semibold">روابط سريعة</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.links.map((link: { to: string; label: string }) => (
                    <li key={link.to}>
                      <a
                        href={link.to}
                        className="block rounded-md border border-border px-3 py-2 text-sm font-bold text-primary hover:border-gold"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null
          }
          catalog={undefined}
          afterCatalog={
            <StudentSelfReportsList items={studentCatalog?.items ?? []} />
          }
        />
      )}
    </div>
  );
}
