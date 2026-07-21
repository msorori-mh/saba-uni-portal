import { AggregateReportView } from "@/components/reports/AggregateReportView";
import type { AggregateReport } from "@/lib/reports/aggregate";
import { REQUESTS_OVERVIEW_REPORT_ID } from "@/lib/reports/request-reports";

export interface RequestsAggregateDashboardProps {
  readonly report: AggregateReport;
  readonly subtitle?: string;
}

/**
 * Requests dashboard for the dean / student affairs / university leadership.
 * Presentational only: receives a pre-built aggregate report (no network).
 * Fails closed — renders nothing if handed a different report kind.
 */
export function RequestsAggregateDashboard({
  report,
  subtitle,
}: RequestsAggregateDashboardProps) {
  if (report.reportId !== REQUESTS_OVERVIEW_REPORT_ID) {
    return null;
  }
  return (
    <div dir="rtl" className="space-y-3">
      <p className="text-sm text-gray-600">
        {subtitle ?? "لوحة متابعة مؤشرات طلبات الطلاب — بيانات مجمعة فقط."}
      </p>
      <AggregateReportView report={report} />
    </div>
  );
}
