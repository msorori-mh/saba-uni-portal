import type {
  ClearanceReportingRow,
  CourseOutcomeRow,
} from "@/lib/academic-clearance";

// Staff-facing operational reporting: per-department/status counts with the
// 14-day overdue window, plus approved-style course outcomes. Mirrors the
// academic_clearance_reporting and academic_clearance_course_outcomes views.
export function ClearanceReporting(props: {
  rows: readonly ClearanceReportingRow[];
  outcomes: readonly CourseOutcomeRow[];
}) {
  return (
    <section dir="rtl" className="space-y-4 rounded-lg border p-4" aria-label="تقارير المقاصة">
      <h2 className="text-base font-semibold">تقارير المقاصة</h2>
      <div className="overflow-x-auto">
        <h3 className="text-sm font-medium">الحالات التشغيلية حسب القسم</h3>
        <table className="w-full text-sm" aria-label="تقرير حالات المقاصة">
          <thead>
            <tr>
              <th>القسم المستهدف</th>
              <th>الحالة</th>
              <th>عدد الحالات</th>
              <th>متوسط الساعات المعتمدة</th>
              <th>حالات متأخرة (أكثر من 14 يوماً)</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={`${row.targetDepartmentId}-${row.status}`}>
                <td>{row.targetDepartmentId}</td>
                <td>{row.statusLabel}</td>
                <td>{row.caseCount}</td>
                <td>{row.avgAcceptedHours}</td>
                <td>{row.overdueCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <h3 className="text-sm font-medium">نواتج المعادلة حسب المقرر</h3>
        <table className="w-full text-sm" aria-label="تقرير نواتج المعادلة">
          <thead>
            <tr>
              <th>المقرر المنجز</th>
              <th>مقرر الخطة</th>
              <th>القرار</th>
              <th>عدد الحالات</th>
            </tr>
          </thead>
          <tbody>
            {props.outcomes.map((row) => (
              <tr key={`${row.sourceCourseId}-${row.targetCourseId ?? "none"}-${row.decision}`}>
                <td>{row.sourceCourseCode}</td>
                <td>{row.targetCourseCode ?? "—"}</td>
                <td>{row.decisionLabel}</td>
                <td>{row.decisionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
