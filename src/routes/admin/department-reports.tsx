import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2 } from "lucide-react";
import { getDepartmentReportsSummary } from "@/lib/beneficiary-reports.functions";
import { ScopedKpiGrid } from "@/components/reports/ScopedKpiGrid";
import { ReportsCenter } from "@/components/reports-center/ReportsCenter";
import { REPORT_CATALOG_ENTRIES } from "@/lib/reports/catalog";

export const Route = createFileRoute("/admin/department-reports")({
  head: () => ({
    meta: [
      { title: "تقارير القسم — بوابة الإدارة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DepartmentReportsPage,
});

function DepartmentReportsPage() {
  const { adminSession } = useRouteContext({ from: "/admin" });
  const roles = adminSession?.roles ?? ["department_head"];
  const fetchSummary = useServerFn(getDepartmentReportsSummary);
  const { data, isLoading, error } = useQuery({
    queryKey: ["department-reports-summary"],
    queryFn: () => fetchSummary({ data: {} }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-gold" />
        <div>
          <h1 className="text-xl font-bold">تقارير القسم</h1>
          <p className="text-sm text-muted-foreground">
            رئيس القسم يرى قسمه فقط — لا يوجد تجاوز لقسم آخر.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message || "تعذر تحميل تقارير القسم"}
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">{data.scopeLabelAr}</p>
          <ScopedKpiGrid
            tiles={[
              { label: "طلاب القسم", metric: data.students },
              { label: "أعضاء هيئة التدريس", metric: data.faculty },
              { label: "البرامج", metric: data.programs },
              { label: "المقررات", metric: data.courses },
              {
                label: "شعب مسندة",
                metric: data.teachingLoad.assignedSections,
              },
              {
                label: "غير مسندة",
                metric: data.teachingLoad.unassignedSections,
              },
            ]}
          />
          {data.weeklyIssues.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-semibold">مشكلات تحتاج تدخلاً</h2>
              <ul className="list-disc pr-5 text-sm">
                {data.weeklyIssues.map((issue: any) => (
                  <li key={issue.code}>
                    {issue.label_ar}
                    {issue.count != null ? ` (${issue.count})` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="space-y-2">
            <h2 className="font-semibold">روابط</h2>
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
        </>
      ) : null}

      <ReportsCenter
        entries={REPORT_CATALOG_ENTRIES}
        viewerRoles={roles.length ? roles : ["department_head"]}
        title="كتالوج تقارير رئيس القسم"
        defaultGrouping="status"
      />
    </div>
  );
}
