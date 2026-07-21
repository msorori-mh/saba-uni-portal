import type { CourseSnapshot } from "@/lib/academic-clearance";

export interface SourceResultSnapshotView extends CourseSnapshot {
  finalGrade: string | null;
  officialResultReference: string;
}

export interface TargetPlanSnapshotView extends CourseSnapshot {
  isRequired: boolean;
}

// Read-only snapshot evidence: the student's official successful results
// (source) against the frozen target study-plan courses. Nothing here is
// student-facing; it renders only inside staff clearance screens.
export function ClearanceSnapshotsPanel(props: {
  sourceCourses: readonly SourceResultSnapshotView[];
  targetCourses: readonly TargetPlanSnapshotView[];
}) {
  return (
    <section
      dir="rtl"
      className="space-y-4 rounded-lg border p-4"
      aria-label="لقطات نتائج الطالب والخطة المستهدفة"
    >
      <h2 className="text-base font-semibold">اللقطات المرجعية</h2>
      <div className="overflow-x-auto">
        <h3 className="text-sm font-medium">نتائج الطالب الرسمية الناجحة</h3>
        <table className="w-full text-sm" aria-label="لقطة نتائج الطالب">
          <thead>
            <tr>
              <th>المقرر المنجز</th>
              <th>الساعات</th>
              <th>التقدير</th>
              <th>المرجع الرسمي للنتيجة</th>
            </tr>
          </thead>
          <tbody>
            {props.sourceCourses.map((course) => (
              <tr key={course.id}>
                <td>
                  {course.code} — {course.name}
                </td>
                <td>{course.creditHours}</td>
                <td>{course.finalGrade ?? "—"}</td>
                <td>{course.officialResultReference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <h3 className="text-sm font-medium">مقررات الخطة المستهدفة</h3>
        <table className="w-full text-sm" aria-label="لقطة الخطة المستهدفة">
          <thead>
            <tr>
              <th>المقرر</th>
              <th>الساعات</th>
              <th>المستوى</th>
              <th>الإلزامية</th>
            </tr>
          </thead>
          <tbody>
            {props.targetCourses.map((course) => (
              <tr key={course.id}>
                <td>
                  {course.code} — {course.name}
                </td>
                <td>{course.creditHours}</td>
                <td>{course.levelNumber ?? "—"}</td>
                <td>{course.isRequired ? "إلزامي" : "اختياري"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
