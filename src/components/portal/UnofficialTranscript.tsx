import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Printer, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getUnofficialTranscriptData } from "@/lib/transcript.functions";
import { gradeArabicLabel, normalizeOfficialResult, officialWeightedAverage } from "@/lib/academic/grading-scale";

export type TranscriptRow = {
  enrollment_id: string;
  student_profile_id: string;
  academic_number: string;
  student_name_ar: string;
  student_name_en: string | null;
  program_name: string | null;
  department_name: string | null;
  academic_year_id: string;
  academic_year_name: string;
  semester_id: string;
  semester_name: string;
  semester_code: string;
  level_name: string;
  level_number: number;
  course_code: string;
  course_name: string;
  credit_hours: number;
  section_code: string;
  final_score: number;
  max_score: number;
  percentage: number;
  course_status: "passed" | "failed";
  notes: string | null;
};

export type SummaryRow = {
  student_profile_id: string;
  academic_year_id: string;
  academic_year_name: string;
  semester_id: string;
  semester_name: string;
  semester_code: string;
  level_name: string;
  level_number: number;
  courses_count: number;
  passed_count: number;
  failed_count: number;
  registered_hours: number;
  passed_hours: number;
  avg_percentage: number;
};

export function UnofficialTranscript({ studentProfileId, header }: { studentProfileId: string; header?: React.ReactNode }) {
  const transcriptFn = useServerFn(getUnofficialTranscriptData);
  const [yearFilter, setYearFilter] = useState<string>("");
  const [semFilter, setSemFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["transcript", studentProfileId],
    enabled: !!studentProfileId,
    queryFn: () => transcriptFn({ data: { studentProfileId } }),
  });

  const rows = (data?.rows ?? []) as TranscriptRow[];
  const summary = (data?.summary ?? []) as SummaryRow[];

  const years = useMemo(() => Array.from(new Map(rows.map(r => [r.academic_year_id, r.academic_year_name])).entries()), [rows]);
  const sems = useMemo(() => Array.from(new Map(rows.filter(r => !yearFilter || r.academic_year_id === yearFilter).map(r => [r.semester_id, r.semester_name])).entries()), [rows, yearFilter]);

  const filtered = rows.filter(r =>
    (!yearFilter || r.academic_year_id === yearFilter) &&
    (!semFilter || r.semester_id === semFilter)
  );

  // Group by year > semester
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, TranscriptRow[]>>();
    for (const r of filtered) {
      const yk = `${r.academic_year_id}|${r.academic_year_name}`;
      const sk = `${r.semester_id}|${r.semester_name}|${r.level_name}`;
      if (!m.has(yk)) m.set(yk, new Map());
      const sm = m.get(yk)!;
      if (!sm.has(sk)) sm.set(sk, []);
      sm.get(sk)!.push(r);
    }
    return m;
  }, [filtered]);

  // Overall totals (filtered)
  const totals = useMemo(() => {
    const totalHours = filtered.reduce((s, r) => s + Number(r.credit_hours), 0);
    const passedHours = filtered.filter(r => r.course_status === "passed").reduce((s, r) => s + Number(r.credit_hours), 0);
    const passedCount = filtered.filter(r => r.course_status === "passed").length;
    const failedCount = filtered.filter(r => r.course_status === "failed").length;
    // Official (normalized) credit-weighted average — percentage scale, not a GPA.
    const avg = officialWeightedAverage(filtered.map(r => ({ raw: Number(r.percentage), creditHours: Number(r.credit_hours) })));
    return { totalHours, passedHours, passedCount, failedCount, count: filtered.length, avg };
  }, [filtered]);

  const header_row = rows[0];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 text-xs flex items-start gap-2 print:hidden">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>هذا السجل غير رسمي ولا يُعتد به كوثيقة رسمية. للحصول على السجل الرسمي، يرجى التقدم بطلب من شؤون الطلاب.</div>
      </div>

      {header}

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد درجات معتمدة في السجل حالياً.
        </div>
      ) : (
        <>
          {/* Filters + Print */}
          <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground block">السنة الأكاديمية</label>
                <select
                  value={yearFilter}
                  onChange={(e) => { setYearFilter(e.target.value); setSemFilter(""); }}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">الكل</option>
                  {years.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block">الفصل</label>
                <select
                  value={semFilter}
                  onChange={(e) => setSemFilter(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">الكل</option>
                  {sems.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
            >
              <Printer className="h-4 w-4" /> طباعة / حفظ PDF
            </button>
          </div>

          {/* Printable area */}
          <div id="transcript-print" className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-primary font-display font-bold">
                <FileText className="h-4 w-4 text-gold" /> السجل الأكاديمي غير الرسمي
              </div>
              {header_row && (
                <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">الاسم:</span> <b>{header_row.student_name_ar}</b></div>
                  <div><span className="text-muted-foreground">الرقم الأكاديمي:</span> <span className="font-mono font-bold">{header_row.academic_number}</span></div>
                  <div><span className="text-muted-foreground">البرنامج:</span> <b>{header_row.program_name ?? "—"}</b></div>
                  <div><span className="text-muted-foreground">القسم:</span> <b>{header_row.department_name ?? "—"}</b></div>
                </div>
              )}
            </div>

            {/* Overall summary */}
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs font-bold text-muted-foreground mb-2">ملخص أكاديمي {(yearFilter || semFilter) && "(مفلتر)"}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                <SummaryStat label="عدد المقررات" value={totals.count} />
                <SummaryStat label="ناجحة" value={totals.passedCount} cls="text-emerald-700" />
                <SummaryStat label="راسبة" value={totals.failedCount} cls="text-rose-700" />
                <SummaryStat label="ساعات مسجلة" value={totals.totalHours} />
                <SummaryStat label="ساعات مجتازة" value={totals.passedHours} />
                <SummaryStat label="متوسط النسبة" value={`${totals.avg}%`} />
              </div>
            </div>

            {/* Courses grouped */}
            {Array.from(grouped.entries()).map(([yk, sm]) => {
              const yname = yk.split("|")[1];
              return (
                <div key={yk} className="rounded-lg border bg-card overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">السنة الأكاديمية: {yname}</div>
                  <div className="divide-y">
                    {Array.from(sm.entries()).map(([sk, items]) => {
                      const [, sname, lname] = sk.split("|");
                      const semSum = summary.find(s => s.semester_id === sk.split("|")[0] && s.academic_year_id === yk.split("|")[0]);
                      return (
                        <div key={sk} className="p-3">
                          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                            <div className="text-xs font-bold text-foreground">{sname} <span className="text-muted-foreground font-normal">— {lname}</span></div>
                            {semSum && (
                              <div className="text-[11px] text-muted-foreground">
                                {semSum.passed_count}/{semSum.courses_count} ناجح •
                                {" "}{semSum.passed_hours}/{semSum.registered_hours} س.م •
                                {" "}متوسط {normalizeOfficialResult(Number(semSum.avg_percentage)) ?? 0}%
                              </div>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead className="bg-muted/30 text-muted-foreground">
                                <tr>
                                  <Th>كود</Th>
                                  <Th>المقرر</Th>
                                  <Th className="text-center">س.م</Th>
                                  <Th className="text-center">الدرجة</Th>
                                  <Th className="text-center">النتيجة الرسمية</Th>
                                  <Th className="text-center">التقدير</Th>
                                  <Th className="text-center">الحالة</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map(r => (
                                  <tr key={r.enrollment_id} className="border-t">
                                    <Td className="font-mono font-bold">{r.course_code}</Td>
                                    <Td>{r.course_name}</Td>
                                    <Td className="text-center">{r.credit_hours}</Td>
                                    <Td className="text-center font-mono">{Number(r.final_score)}/{Number(r.max_score)}</Td>
                                    <Td className="text-center font-mono">{normalizeOfficialResult(Number(r.percentage)) ?? 0}%</Td>
                                    <Td className="text-center">{gradeArabicLabel(Number(r.percentage)) ?? "—"}</Td>
                                    <Td className="text-center">
                                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${r.course_status === "passed" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                        {r.course_status === "passed" ? "ناجح" : "راسب"}
                                      </span>
                                    </Td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="text-[10px] text-muted-foreground text-center pt-2 border-t print:block">
              تم إنشاء هذا السجل في {new Date().toLocaleDateString("ar-EG")} • سجل غير رسمي
            </div>
          </div>
        </>
      )}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #transcript-print, #transcript-print * { visibility: visible; }
          #transcript-print { position: absolute; inset: 0; padding: 16px; }
        }
      `}</style>
    </div>
  );
}

function SummaryStat({ label, value, cls }: { label: string; value: number | string; cls?: string }) {
  return (
    <div className="rounded border bg-muted/20 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-base font-extrabold ${cls ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 text-right font-bold ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className}`}>{children}</td>;
}
