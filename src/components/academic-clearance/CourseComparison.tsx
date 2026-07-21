import type { CourseSnapshot, EquivalencyDecision, EquivalencyRow } from "@/lib/academic-clearance";

const labels: Record<EquivalencyDecision, string> = {
  equivalent: "معادل",
  partially_equivalent: "معادل جزئياً",
  general_requirement: "متطلب عام",
  supporting_requirement: "متطلب مساند",
  not_equivalent: "غير معادل",
  needs_review: "يحتاج مراجعة",
  committee_decision_required: "يتطلب قرار لجنة",
};

export function CourseComparison(props: {
  sourceCourses: readonly CourseSnapshot[];
  targetCourses: readonly CourseSnapshot[];
  decisions: readonly EquivalencyRow[];
  readOnly: boolean;
  onDecisionChange?: (sourceCourseId: string, decision: EquivalencyDecision) => void;
  onTargetChange?: (sourceCourseId: string, targetCourseId: string | null) => void;
  onAcceptedCreditsChange?: (sourceCourseId: string, hours: number) => void;
  onRationaleChange?: (sourceCourseId: string, rationale: string) => void;
}) {
  return (
    <div dir="rtl" className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="مقارنة مقررات المقاصة الأكاديمية">
        <thead>
          <tr>
            <th>المقرر المنجز</th>
            <th>الساعات</th>
            <th>مقرر الخطة المستهدفة</th>
            <th>القرار</th>
            <th>الساعات المقبولة</th>
            <th>المسوغ</th>
          </tr>
        </thead>
        <tbody>
          {props.sourceCourses.map((source) => {
            const row = props.decisions.find((item) => item.sourceCourseId === source.id);
            const target = props.targetCourses.find((item) => item.id === row?.targetCourseId);
            return (
              <tr key={source.id}>
                <td>
                  {source.code} — {source.name}
                </td>
                <td>{source.creditHours}</td>
                <td>
                  <select
                    aria-label={`المقرر المستهدف ${source.code}`}
                    disabled={props.readOnly}
                    value={target?.id ?? ""}
                    onChange={(event) =>
                      props.onTargetChange?.(source.id, event.target.value || null)
                    }
                  >
                    <option value="">—</option>
                    {props.targetCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} — {course.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`قرار ${source.code}`}
                    disabled={props.readOnly}
                    value={row?.decision ?? "needs_review"}
                    onChange={(event) =>
                      props.onDecisionChange?.(source.id, event.target.value as EquivalencyDecision)
                    }
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`الساعات المقبولة ${source.code}`}
                    type="number"
                    min={0}
                    max={Math.min(source.creditHours, target?.creditHours ?? source.creditHours)}
                    disabled={props.readOnly}
                    value={row?.acceptedCreditHours ?? 0}
                    onChange={(event) =>
                      props.onAcceptedCreditsChange?.(source.id, Number(event.target.value))
                    }
                  />
                </td>
                <td>
                  <textarea
                    aria-label={`مسوغ ${source.code}`}
                    disabled={props.readOnly}
                    value={row?.rationale ?? ""}
                    onChange={(event) => props.onRationaleChange?.(source.id, event.target.value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
