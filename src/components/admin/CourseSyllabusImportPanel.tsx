import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parseExcel } from "@/lib/imports/templates";
import { downloadMasterTemplate } from "@/lib/imports/master-templates";
import {
  validateCourseSyllabusRows,
  type SyllabusValidationResult,
} from "@/lib/imports/course-syllabus";
import {
  runCourseSyllabusImport,
  listCourseSyllabi,
  approveCourseSyllabus,
  type SyllabusImportReport,
} from "@/lib/course-syllabus.functions";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  superseded: "مُستبدل",
};

/**
 * Official course syllabus importer.
 * The syllabus is the academic source of the lecture plan: approving a version
 * generates the delivery plan of every active section of that course.
 */
export function CourseSyllabusImportPanel() {
  const qc = useQueryClient();
  const importFn = useServerFn(runCourseSyllabusImport);
  const listFn = useServerFn(listCourseSyllabi);
  const approveFn = useServerFn(approveCourseSyllabus);

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [validation, setValidation] = useState<SyllabusValidationResult | null>(null);
  const [report, setReport] = useState<SyllabusImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const { data: syllabi, isLoading } = useQuery({
    queryKey: ["course-syllabi"],
    queryFn: () => listFn({ data: {} }),
  });

  const reset = () => {
    setFile(null);
    setRows([]);
    setValidation(null);
    setReport(null);
  };

  const onFile = async (f: File) => {
    reset();
    setFile(f);
    setBusy(true);
    try {
      const parsed = await parseExcel(f);
      setRows(parsed);
      setValidation(validateCourseSyllabusRows(parsed));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (!validation?.valid) return;
    setBusy(true);
    try {
      const result = await importFn({ data: { rows } });
      setReport(result);
      if (result.aborted) toast.error(result.abortReason ?? "تعذر الاستيراد");
      else toast.success("تم إنشاء إصدارات التوصيف كمسودات بانتظار الاعتماد");
      void qc.invalidateQueries({ queryKey: ["course-syllabi"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onApprove = async (id: string) => {
    setApproving(id);
    try {
      const result = await approveFn({ data: { syllabusId: id } });
      toast.success(`تم اعتماد التوصيف. خطط المجموعات المُنشأة: ${result.plansCreated}`);
      void qc.invalidateQueries({ queryKey: ["course-syllabi"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApproving(null);
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <div className="space-y-2">
          <h2 className="font-bold text-primary flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gold" aria-hidden /> استيراد توصيف المقررات
          </h2>
          <p className="text-sm text-muted-foreground">
            التوصيف المعتمد هو مصدر خطة المحاضرات. عند اعتماد الإصدار تُولَّد خطة تنفيذ المحاضرات
            لكل مجموعة نشطة للمقرر، ولا يستطيع عضو هيئة التدريس تعديل العناوين أو المفردات.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              الاستيراد ينشئ إصداراً بحالة «مسودة» فقط. لا يؤثر على الخطط القائمة حتى الاعتماد.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void downloadMasterTemplate("course_syllabi")}
          >
            <Download className="h-4 w-4" /> تنزيل القالب
          </Button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
            <Upload className="h-4 w-4" />
            {file ? file.name : "اختر ملف Excel"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>

          <Button
            onClick={() => void onImport()}
            disabled={busy || !validation?.valid}
            className="gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تنفيذ الاستيراد
          </Button>

          {file && (
            <Button variant="ghost" onClick={reset}>
              إلغاء
            </Button>
          )}
        </div>

        {validation && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
            <div className="font-bold text-primary">
              الصفوف: {validation.totalRows} • المقررات: {validation.courses.length} •{" "}
              {validation.valid ? "الملف صالح" : `أخطاء: ${validation.errors.length}`}
            </div>
            {validation.courses.length > 0 && (
              <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {validation.courses.map((c) => (
                  <li key={c.course_code}>
                    <span className="font-mono">{c.course_code}</span> — {c.sessions.length} محاضرة
                  </li>
                ))}
              </ul>
            )}
            {!validation.valid && (
              <ul className="space-y-1 text-xs text-destructive">
                {validation.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e.row ? `صف ${e.row}: ` : ""}{e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {report && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            {report.aborted ? (
              <div className="text-destructive font-bold">{report.abortReason}</div>
            ) : (
              report.courses.map((c) => (
                <div key={c.course_code} className="flex items-center gap-2 text-xs">
                  {c.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  <span className="font-mono">{c.course_code}</span>
                  <span>
                    {c.status === "created"
                      ? `إصدار ${c.version} — ${c.sessions} محاضرة`
                      : (c.message ?? "")}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
        <h3 className="font-bold text-primary">إصدارات التوصيف</h3>
        {isLoading ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !syllabi || syllabi.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد توصيفات مستوردة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="p-2 text-right">المقرر</th>
                  <th className="p-2 text-right">الإصدار</th>
                  <th className="p-2 text-right">المحاضرات</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {syllabi.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-2">
                      <span className="font-mono">{s.course_code}</span> — {s.course_name_ar}
                    </td>
                    <td className="p-2">{s.version}</td>
                    <td className="p-2">{s.planned_session_count}</td>
                    <td className="p-2">
                      {STATUS_LABELS[s.status] ?? s.status}
                      {s.is_current && " (الحالي)"}
                    </td>
                    <td className="p-2">
                      {s.status === "draft" && (
                        <Button
                          size="sm"
                          disabled={approving === s.id}
                          onClick={() => void onApprove(s.id)}
                          className="gap-1"
                        >
                          {approving === s.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          اعتماد
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
