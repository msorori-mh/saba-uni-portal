import type { CohortEmploymentReport } from "@/lib/graduates-affairs/reports";
import type { PrivacySafeMetric } from "@/lib/graduates-affairs/foundation";
import type { SurveyAggregateReport } from "@/lib/graduates-affairs/surveys";

function MetricCell({ metric }: { metric: PrivacySafeMetric }) {
  return metric.suppressed ? (
    <td className="text-amber-700" title="عينة أصغر من الحد الأدنى">محجوب</td>
  ) : (
    <td>{metric.total}</td>
  );
}

/**
 * Aggregate reports panel. Renders cohort-level and survey-level aggregates
 * only; suppressed cells are shown as «محجوب». Row-level contact/employment
 * exports stay prohibited by contract, so there is deliberately no export
 * affordance here.
 */
export function GraduateReportsPanel(props: {
  cohortReports: readonly CohortEmploymentReport[];
  surveyReports?: readonly { title: string; report: SurveyAggregateReport }[];
}) {
  return (
    <section dir="rtl" aria-labelledby="graduate-reports-title" className="rounded-lg border p-4">
      <h3 id="graduate-reports-title" className="font-semibold">التقارير المجمعة</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        تقارير مجمعة على مستوى الأفواج فقط — تُحجب كل خلية أصغر من الحد الأدنى، ولا تُعرض بيانات
        فردية.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm" aria-label="تقرير التوظيف حسب الفوج">
          <thead>
            <tr>
              <th>البرنامج</th>
              <th>سنة التخرج</th>
              <th>عدد الخريجين</th>
              <th>الموظفون</th>
              <th>مرتبط بالتخصص</th>
              <th>موثق</th>
            </tr>
          </thead>
          <tbody>
            {props.cohortReports.length === 0 && (
              <tr>
                <td colSpan={6}>لا توجد بيانات بعد.</td>
              </tr>
            )}
            {props.cohortReports.map((cohort) => (
              <tr key={`${cohort.programId}:${cohort.graduationYear}`}>
                <td>{cohort.programId}</td>
                <td>{cohort.graduationYear}</td>
                <MetricCell metric={cohort.summary.population} />
                <MetricCell metric={cohort.summary.employed} />
                <MetricCell metric={cohort.summary.specializationRelated} />
                <MetricCell metric={cohort.summary.verified} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(props.surveyReports ?? []).map(({ title, report }) => (
        <div key={title} className="mt-4">
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-sm">
            إجمالي الردود:{" "}
            {report.totalResponses.suppressed ? "محجوب" : report.totalResponses.total}
          </p>
          <table className="mt-1 w-full text-sm" aria-label={`نتائج مجمعة — ${title}`}>
            <thead>
              <tr>
                <th>السؤال</th>
                <th>الخيار</th>
                <th>العدد</th>
              </tr>
            </thead>
            <tbody>
              {report.questions.map((question) =>
                question.kind === "single_choice" ? (
                  question.distribution.map((entry) => (
                    <tr key={`${question.key}:${entry.option}`}>
                      <td>{question.key}</td>
                      <td>{entry.option}</td>
                      <MetricCell metric={entry.metric} />
                    </tr>
                  ))
                ) : (
                  <tr key={question.key}>
                    <td>{question.key}</td>
                    <td>إجابات نصية (تُحسب ولا تُعرض)</td>
                    <MetricCell metric={question.responded} />
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
