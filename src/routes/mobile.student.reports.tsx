import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2 } from "lucide-react";
import { getStudentSelfReportCatalog } from "@/lib/beneficiary-reports.functions";
import { StudentSelfReportsList } from "@/components/reports/StudentSelfReportsList";

export const Route = createFileRoute("/mobile/student/reports")({
  head: () => ({ meta: [{ title: "تقاريري" }] }),
  component: MobileStudentReports,
});

/**
 * Student-safe reports only: the server projects the catalog through the
 * mobile allowlist (opaque ids, no report_code / sensitivity / data_scope and
 * no internal routes).
 */
function MobileStudentReports() {
  const fetchCatalog = useServerFn(getStudentSelfReportCatalog);
  const { data, isLoading, error } = useQuery({
    queryKey: ["mobile-student", "reports-catalog"],
    queryFn: () => fetchCatalog({ data: { surface: "mobile" as const } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-gold" /> تقاريري
      </h1>

      {isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message || "تعذر تحميل التقارير"}
        </p>
      ) : (
        <StudentSelfReportsList items={data?.items ?? []} title="التقارير المتاحة" />
      )}
    </div>
  );
}
