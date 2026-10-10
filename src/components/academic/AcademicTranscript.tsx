import { Printer } from "lucide-react";
import type { StudentProgressDTO } from "@/lib/academic-status.functions";
import { buildAcademicTranscriptTerms, overallGradeLabel } from "@/lib/academic/transcript-groups";
import { standingLabel } from "@/lib/academic-status";
import { Button } from "@/components/ui/button";

const STUDY_SYSTEM_LABELS: Record<string, string> = {
  general: "عام",
  private_expense: "نفقة خاصة",
  regular: "عام",
  private: "نفقة خاصة",
};

export function AcademicTranscript({ d, printable = false }: { d: StudentProgressDTO; printable?: boolean }) {
  const terms = buildAcademicTranscriptTerms(d.transcript.courses);
  const generalGrade = overallGradeLabel(d.progress.cumulative_official_average);

  return (
    <section className="space-y-4" aria-label="سجل أكاديمي غير رسمي">
      {printable && (
        <div className="flex justify-end print:hidden">
          <Button type="button" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> طباعة
          </Button>
        </div>
      )}
      <div id={printable ? "academic-transcript-print" : undefined} className="space-y-4">
        <header className="border-b-2 border-primary pb-4 text-center">
          <div className="text-sm font-bold text-primary">جامعة إقليم سبأ</div>
          <div className="text-sm font-bold text-primary">كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
          <h2 className="mt-2 font-display text-xl font-extrabold text-foreground">سجل أكاديمي غير رسمي</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-right text-xs sm:grid-cols-3">
            <Meta label="اسم الطالب" value={d.student.full_name_ar} />
            <Meta label="الرقم الأكاديمي" value={d.student.academic_number} mono />
            <Meta label="البرنامج" value={d.student.program ?? "—"} />
            <Meta label="القسم" value={d.student.department ?? "—"} />
            <Meta label="المستوى الحالي" value={d.student.level ?? "—"} />
            <Meta label="نظام الدراسة" value={STUDY_SYSTEM_LABELS[d.student.study_system ?? ""] ?? d.student.study_system ?? "—"} />
          </div>
        </header>

        {terms.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            لا توجد مقررات مسجلة في السجل حالياً.
          </div>
        ) : terms.map((term) => (
          <article key={term.key} className="overflow-hidden rounded-md border border-border bg-card break-inside-avoid">
            <div className="border-b border-border bg-muted/50 px-3 py-2 text-sm font-extrabold text-primary">
              {term.academicYearName} — {term.semesterName}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <Th>رمز المقرر</Th><Th>اسم المقرر</Th><Th>الساعات</Th><Th>الدرجة</Th><Th>التقدير</Th><Th>النتيجة</Th>
                  </tr>
                </thead>
                <tbody>
                  {term.courses.map((course) => (
                    <tr key={course.enrollment_id} className="border-t border-border">
                      <Td mono>{course.course_code}</Td>
                      <Td>{course.course_name_ar}</Td>
                      <Td>{course.credit_hours}</Td>
                      <Td>{course.result_mark || course.official_result == null ? "—" : `${course.official_result.toFixed(1)}%`}</Td>
                      <Td>{course.grade_label ?? "—"}</Td>
                      <Td>{course.result === "passed" ? "ناجح" : course.result === "failed" ? "راسب" : course.result === "excused" ? "غير محتسب" : "قيد الدراسة"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 p-3 text-xs sm:grid-cols-4">
              <Metric label="الساعات المسجلة" value={term.registeredHours} />
              <Metric label="الساعات المكتسبة" value={term.earnedHours} />
              <Metric label="المعدل الفصلي" value={term.termAverage > 0 ? `${term.termAverage.toFixed(1)}%` : "—"} />
              <Metric label="المعدل التراكمي" value={term.cumulativeAverage > 0 ? `${term.cumulativeAverage.toFixed(1)}%` : "—"} />
            </footer>
          </article>
        ))}

        <footer className="grid grid-cols-2 gap-2 rounded-md border-2 border-primary/30 bg-primary-soft p-3 text-xs sm:grid-cols-4">
          <Metric label="الساعات المكتسبة" value={`${d.progress.completed_hours} من ${d.progress.total_plan_hours}`} />
          <Metric label="المعدل التراكمي" value={d.progress.cumulative_official_average > 0 ? `${d.progress.cumulative_official_average.toFixed(1)}%` : "—"} />
          <Metric label="التقدير العام" value={generalGrade ?? (d.progress.cumulative_official_average > 0 ? `${d.progress.cumulative_official_average.toFixed(1)}%` : "—")} />
          <Metric label="الوضع الأكاديمي" value={standingLabel(d.standing.standing)} />
        </footer>
      </div>
      {printable && <style>{`@media print { body * { visibility: hidden; } #academic-transcript-print, #academic-transcript-print * { visibility: visible; } #academic-transcript-print { position: absolute; inset: 0; padding: 12mm; } }`}</style>}
    </section>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><span className="text-muted-foreground">{label}: </span><strong className={mono ? "font-mono" : ""}>{value}</strong></div>;
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-0.5 font-extrabold text-foreground">{value}</div></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-2 py-2 text-right font-bold">{children}</th>; }
function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <td className={`px-2 py-2 ${mono ? "font-mono" : ""}`}>{children}</td>; }