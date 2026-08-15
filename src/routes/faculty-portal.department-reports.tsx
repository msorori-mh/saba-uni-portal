/**
 * Department-head reports inside the faculty portal.
 * Same server contract as the admin surface (`getDepartmentReportsSummary`),
 * which enforces the actor's own department scope — no department selector,
 * no admin-only destinations.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import { getDepartmentReportsSummary } from "@/lib/beneficiary-reports.functions";
import { buildDepartmentAttention } from "@/lib/reports/attention";

export const Route = createFileRoute("/faculty-portal/department-reports")({
  head: () => ({
    meta: [
      { title: "تقارير القسم — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyDepartmentReportsPage,
});

function FacultyDepartmentReportsPage() {
  const fetchSummary = useServerFn(getDepartmentReportsSummary);
  const { data, isLoading, error } = useQuery({
    queryKey: ["faculty-department-reports"],
    queryFn: () => fetchSummary({ data: {} }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const attentionItems = useMemo(
    () =>
      buildDepartmentAttention({
        unassignedSections: data?.teachingLoad?.unassignedSections ?? null,
        allowedActionTos: [],
      }),
    [data?.teachingLoad?.unassignedSections],
  );

  const kpiTiles = useMemo(
    () =>
      data
        ? [
            { label: "طلاب القسم", metric: data.students },
            { label: "أعضاء هيئة التدريس", metric: data.faculty },
            { label: "المقررات", metric: data.courses },
            {
              label: "المجموعات الدراسية غير المسندة",
              metric: data.teachingLoad.unassignedSections,
            },
          ]
        : [],
    [data],
  );

  return (
    <FacultyPortalShell
      title="تقارير القسم"
      subtitle="نطاق قسمك فقط — العبء الأكاديمي والإسناد"
      breadcrumbs={[{ label: "تقارير القسم" }]}
    >
      <div className="container mx-auto max-w-5xl px-4 py-6" dir="rtl">
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
              data?.scopeLabelAr ? (
                <p className="text-sm text-muted-foreground">{data.scopeLabelAr}</p>
              ) : null
            }
          />
        )}
      </div>
    </FacultyPortalShell>
  );
}
