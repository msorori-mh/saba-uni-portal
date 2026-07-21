import type { ClearanceMinutes as ClearanceMinutesModel } from "@/lib/academic-clearance";
import { ClearanceStatusBadge } from "./ClearanceStatusBadge";

// Read-only minutes of equivalencies (محضر المعادلات), mirroring the
// academic_clearance_minutes view: one row per decided source course,
// ordered by source course code.
export function ClearanceMinutes(props: { minutes: ClearanceMinutesModel }) {
  const { minutes } = props;
  return (
    <section dir="rtl" className="space-y-3 rounded-lg border p-4" aria-label="محضر المعادلات">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">محضر المعادلات</h2>
        <ClearanceStatusBadge status={minutes.status} />
      </header>
      <p className="text-sm">
        الساعات المعتمدة: {minutes.acceptedCreditHours} — الساعات المتبقية:{" "}
        {minutes.remainingCreditHours}
      </p>
      {minutes.approvedAt ? <p className="text-sm">تاريخ الاعتماد: {minutes.approvedAt}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="جدول محضر المعادلات">
          <thead>
            <tr>
              <th>المقرر المنجز</th>
              <th>مقرر الخطة</th>
              <th>القرار</th>
              <th>الساعات المقبولة</th>
              <th>المسوغ</th>
            </tr>
          </thead>
          <tbody>
            {minutes.equivalencies.map((entry) => (
              <tr key={entry.sourceCode}>
                <td>{entry.sourceCode}</td>
                <td>{entry.targetCode ?? "—"}</td>
                <td>{entry.decisionLabel}</td>
                <td>{entry.acceptedHours}</td>
                <td>{entry.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
