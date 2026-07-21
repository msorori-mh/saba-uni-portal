import type { ExecutionBreakdownKey, ExecutionBreakdownRow } from "@/lib/lecture-execution/domain";

const BREAKDOWN_TITLE: Record<ExecutionBreakdownKey, string> = {
  department: "نسب التنفيذ حسب القسم",
  level: "نسب التنفيذ حسب المستوى",
  course: "نسب التنفيذ حسب المقرر",
};

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export interface ExecutionMonitoringReportProps {
  breakdown: ExecutionBreakdownKey;
  rows: readonly ExecutionBreakdownRow[];
  /** Optional display names keyed by breakdown id (department/level/course). */
  labels?: Readonly<Record<string, string>>;
}

/**
 * Department-head / dean monitoring table (presentational). Accepts an
 * already-authorized execution-rate breakdown and renders planned vs
 * delivered/missed/pending counts with execution and settlement rates.
 */
export function ExecutionMonitoringReport({ breakdown, rows, labels = {} }: ExecutionMonitoringReportProps) {
  return (
    <section aria-labelledby="execution-monitoring-title" className="rounded-lg border p-4">
      <h3 id="execution-monitoring-title" className="font-semibold">
        {BREAKDOWN_TITLE[breakdown]}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-muted-foreground" role="status">
          لا توجد سجلات تنفيذ ضمن هذا النطاق بعد.
        </p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th scope="col" className="py-1 text-start">النطاق</th>
              <th scope="col" className="py-1 text-start">مخطط</th>
              <th scope="col" className="py-1 text-start">نُفِّذ/عُوِّض</th>
              <th scope="col" className="py-1 text-start">تعذَّر/أُلغي</th>
              <th scope="col" className="py-1 text-start">معلَّق</th>
              <th scope="col" className="py-1 text-start">بانتظار المندوب</th>
              <th scope="col" className="py-1 text-start">نسبة التنفيذ</th>
              <th scope="col" className="py-1 text-start">نسبة التسوية</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="py-1">{labels[row.key] ?? row.key}</td>
                <td className="py-1">{row.planned}</td>
                <td className="py-1">{row.delivered}</td>
                <td className="py-1">{row.missed}</td>
                <td className="py-1">{row.pending}</td>
                <td className="py-1">{row.awaitingDelegate}</td>
                <td className="py-1">{percent(row.executionRate)}</td>
                <td className="py-1">{percent(row.settlementRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
