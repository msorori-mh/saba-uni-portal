import { AggregateReportView } from "@/components/reports/AggregateReportView";
import type { AggregateReport } from "@/lib/reports/aggregate";
import { STAFF_ACTIVITY_REPORT_ID } from "@/lib/reports/staff-activity-reports";

export interface StaffActivityDashboardProps {
  readonly report: AggregateReport;
  readonly subtitle?: string;
}

/**
 * Staff activity dashboard for university leadership / dean. Aggregates are
 * by role, never by individual actor. Presentational only: receives a
 * pre-built aggregate report (no network). Fails closed — renders nothing if
 * handed a different report kind.
 */
export function StaffActivityDashboard({ report, subtitle }: StaffActivityDashboardProps) {
  if (report.reportId !== STAFF_ACTIVITY_REPORT_ID) {
    return null;
  }
  return (
    <div dir="rtl" className="space-y-3">
      <p className="text-sm text-gray-600">
        {subtitle ?? "لوحة نشاط المعالجة حسب الدور الوظيفي — بيانات مجمعة فقط."}
      </p>
      <AggregateReportView report={report} />
    </div>
  );
}
