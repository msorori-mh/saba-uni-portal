import {
  REPORT_BENEFICIARY_LABELS,
  type AggregateMetric,
  type AggregateReport,
} from "@/lib/reports/aggregate";

function formatMetricValue(metric: AggregateMetric): string {
  if (metric.suppressed || metric.total === null) {
    return "محجوب";
  }
  return Number.isInteger(metric.total) ? `${metric.total}` : metric.total.toFixed(1);
}

function metricAriaLabel(label: string, metric: AggregateMetric): string {
  if (metric.suppressed || metric.total === null) {
    return `${label}: محجوب لصغر حجم العينة`;
  }
  return `${label}: ${formatMetricValue(metric)}`;
}

export interface AggregateReportViewProps {
  readonly report: AggregateReport;
}

/**
 * Renders any aggregate report (KPI cards + suppression-aware tables).
 * Presentational only — receives a pre-built report, performs no network
 * access, and never renders a suppressed value.
 */
export function AggregateReportView({ report }: AggregateReportViewProps) {
  return (
    <section dir="rtl" aria-label={report.title} className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-gray-900">{report.title}</h2>
        <p className="text-sm text-gray-600">
          المستفيد: {REPORT_BENEFICIARY_LABELS[report.beneficiary]} · الحد الأدنى لحجم الخلية:{" "}
          {report.minimumCellSize}
        </p>
        <p className="text-xs text-gray-500">
          تقرير مجمع فقط — تُحجب أي خلية يقل عددها عن الحد الأدنى.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {report.kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            aria-label={metricAriaLabel(kpi.label, kpi.metric)}
          >
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                kpi.metric.suppressed ? "text-gray-400" : "text-gray-900"
              }`}
            >
              {formatMetricValue(kpi.metric)}
            </p>
            {kpi.hint ? <p className="mt-1 text-[11px] text-gray-400">{kpi.hint}</p> : null}
          </div>
        ))}
      </div>

      {report.tables.map((table) => (
        <section key={table.id} aria-label={table.title} className="space-y-2">
          <h3 className="text-base font-semibold text-gray-800">{table.title}</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-gray-600">
                    البند
                  </th>
                  {table.columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className="px-4 py-2 text-right font-medium text-gray-600"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={table.columns.length + 1}
                      className="px-4 py-3 text-center text-gray-400"
                    >
                      لا توجد بيانات
                    </td>
                  </tr>
                ) : (
                  table.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="px-4 py-2 text-right font-medium text-gray-700">
                        {row.key}
                      </th>
                      {row.cells.map((cell, cellIndex) => {
                        const column = table.columns[cellIndex];
                        return (
                          <td
                            key={column?.id ?? cellIndex}
                            className={`px-4 py-2 ${cell.suppressed ? "text-gray-400" : "text-gray-900"}`}
                            aria-label={metricAriaLabel(column?.label ?? "", cell)}
                          >
                            {formatMetricValue(cell)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </section>
  );
}
