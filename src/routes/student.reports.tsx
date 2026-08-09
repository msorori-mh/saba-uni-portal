import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BarChart3, Loader2 } from "lucide-react";
import { getStudentSelfReportsSummary } from "@/lib/beneficiary-reports.functions";
import { ScopedKpiGrid } from "@/components/reports/ScopedKpiGrid";
import { ReportsCenter } from "@/components/reports-center/ReportsCenter";
import { REPORT_CATALOG_ENTRIES } from "@/lib/reports/catalog";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-self-reports"],
    queryFn: () => fetchSummary(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div dir="rtl" className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">تقاريري</h1>
            <p className="text-xs text-muted-foreground">
              نطاق ذاتي فقط — لا تعرض بيانات طلاب آخرين.
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

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message || "تعذر تحميل التقارير"}
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">{data.scopeLabelAr}</p>
          <ScopedKpiGrid
            tiles={[
              { label: "مقررات حالية", metric: data.kpis.activeEnrollments },
              { label: "طلبات مفتوحة", metric: data.kpis.openRequests },
              { label: "وثائق صادرة", metric: data.kpis.issuedDocuments },
            ]}
          />
          <section className="space-y-2">
            <h2 className="font-semibold">روابط سريعة</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.links.map((link) => (
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
        </>
      ) : null}

      <ReportsCenter
        entries={REPORT_CATALOG_ENTRIES}
        viewerRoles={["student"]}
        title="كتالوج تقارير الطالب"
        subtitle="ما يخصك فقط — التقارير المحجوبة لا تُعرض كأنها متاحة."
        showPreparation={false}
      />
    </div>
  );
}
