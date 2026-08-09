import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2 } from "lucide-react";
import { useMemo } from "react";
import {
  getDepartmentReportsSummary,
  getMyReportScope,
} from "@/lib/beneficiary-reports.functions";
import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import {
  REPORT_CATALOG_ENTRIES,
  catalogViewerFromActorScope,
} from "@/lib/reports/catalog";
import { buildDepartmentAttention } from "@/lib/reports/attention";

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
  const fetchScope = useServerFn(getMyReportScope);
  const { data, isLoading, error } = useQuery({
    queryKey: ["department-reports-summary"],
    queryFn: () => fetchSummary({ data: {} }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: actorScope } = useQuery({
    queryKey: ["department-reports-scope"],
    queryFn: () => fetchScope(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const viewerScope = actorScope
    ? catalogViewerFromActorScope(actorScope)
    : null;

  const attentionItems = useMemo(
    () =>
      buildDepartmentAttention({
        weeklyIssues: data?.weeklyIssues ?? [],
        unassignedSections: data?.teachingLoad?.unassignedSections ?? null,
        allowedActionTos: [
          "/admin/reports?tab=schedules",
          "/admin/course-offerings",
          "/admin/schedules",
        ],
      }),
    [data?.weeklyIssues, data?.teachingLoad?.unassignedSections],
  );

  const kpiTiles = useMemo(
    () =>
      data
        ? [
            { label: "طلاب القسم", metric: data.students },
            { label: "أعضاء هيئة التدريس", metric: data.faculty },
            { label: "البرامج", metric: data.programs },
            { label: "المقررات", metric: data.courses },
            {
              label: "المجموعات الدراسية المسندة",
              metric: data.teachingLoad.assignedSections,
            },
            {
              label: "المجموعات الدراسية غير المسندة",
              metric: data.teachingLoad.unassignedSections,
            },
          ]
        : [],
    [data],
  );

  return (
    <div dir="rtl" className="p-4 md:p-6">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message || "تعذر تحميل تقارير القسم"}
        </p>
      ) : (
        <ReportsOperationalWorkspace
          attentionItems={attentionItems}
          kpiTiles={kpiTiles}
          header={
            <div className="flex items-center gap-3">
              <BarChart3 className="h-7 w-7 text-gold" />
              <div>
                <h1 className="text-xl font-bold">تقارير القسم</h1>
                <p className="text-sm text-muted-foreground">
                  رئيس القسم يرى قسمه فقط — لا يوجد تجاوز لقسم آخر.
                  {data?.scopeLabelAr ? ` — ${data.scopeLabelAr}` : ""}
                </p>
              </div>
            </div>
          }
          betweenKpisAndCatalog={
            data?.links?.length ? (
              <section className="space-y-2" aria-label="روابط">
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
            ) : null
          }
          catalog={{
            entries: REPORT_CATALOG_ENTRIES,
            viewerRoles: viewerScope?.roles?.length
              ? viewerScope.roles
              : roles.length
                ? roles
                : ["department_head"],
            viewerScope,
            title: "جميع التقارير",
            defaultGrouping: "status",
          }}
        />
      )}
    </div>
  );
}
