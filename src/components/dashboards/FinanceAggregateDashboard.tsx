import { AggregateReportView } from "@/components/reports/AggregateReportView";
import type { AggregateReport } from "@/lib/reports/aggregate";
import { FINANCE_SUMMARY_REPORT_ID } from "@/lib/reports/finance-reports";

export interface FinanceAggregateDashboardProps {
  readonly report: AggregateReport;
  readonly subtitle?: string;
}

/**
 * Finance summary dashboard for the finance officer / university leadership.
 * Presentational only: receives a pre-built aggregate report (no network).
 * Fails closed — renders nothing if handed a different report kind.
 */
export function FinanceAggregateDashboard({ report, subtitle }: FinanceAggregateDashboardProps) {
  if (report.reportId !== FINANCE_SUMMARY_REPORT_ID) {
    return null;
  }
  return (
    <div dir="rtl" className="space-y-3">
      <p className="text-sm text-gray-600">
        {subtitle ?? "لوحة المؤشرات المالية — بيانات مجمعة فقط."}
      </p>
      <AggregateReportView report={report} />
    </div>
  );
}
