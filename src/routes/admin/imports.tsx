import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Download, CheckCircle2, XCircle, Loader2, FileSpreadsheet,
  AlertTriangle, History, FileDown, FlaskConical, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadLookups } from "@/lib/imports/lookups";
import { parseExcel, downloadTemplate } from "@/lib/imports/templates";
import {
  validateStudents, validateFaculty, validateStaff, validateCourses, validateStudyPlans,
} from "@/lib/imports/validators";
import {
  importStudents, importFaculty, importStaff, importCourses, importStudyPlans,
  finalizeImport, emptyReport,
  auditImportStarted, auditImportValidated, auditImportFailed,
} from "@/lib/imports/engine";
import { downloadValidationReport, downloadImportReport } from "@/lib/imports/reports";
import type { ImportReport, ImportType, ValidationResult, ValidatedRow } from "@/lib/imports/types";

export const Route = createFileRoute("/admin/imports")({
  head: () => ({ meta: [{ title: "الاستيراد الجماعي — لوحة الإدارة" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ImportsPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type TabId = ImportType | "faculty_accounts";

const TABS: { id: TabId; label: string }[] = [
  { id: "students", label: "الطلاب" },
  { id: "faculty", label: "أعضاء هيئة التدريس" },
  { id: "staff", label: "الموظفون" },
  { id: "courses", label: "المقررات" },
  { id: "study_plans", label: "الخطط الدراسية" },
  { id: "faculty_accounts", label: "حسابات أعضاء هيئة التدريس" },
];

const TYPE_LABEL: Record<ImportType, string> = {
  students: "طلاب", faculty: "أعضاء هيئة تدريس", staff: "موظفون", courses: "مقررات", study_plans: "خطط دراسية",
};

const STEPS = [
  "تنزيل القالب",
  "رفع الملف",
  "المعاينة",
  "التحقق",
  "الاستيراد",
  "التقرير",
] as const;

function ImportsPage() {
  const [tab, setTab] = useState<TabId>("students");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [validation, setValidation] = useState<ValidationResult<any> | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [perfMs, setPerfMs] = useState<number | null>(null);
  const qc = useQueryClient();

  const reset = () => {
    setFile(null); setRows(null); setValidation(null); setReport(null); setPerfMs(null);
  };

  const onTabChange = (t: TabId) => { setTab(t); reset(); };

  // Determine current step (0..5)
  const step = useMemo(() => {
    if (report) return 5;
    if (importing) return 4;
    if (validation) return 3;
    if (rows) return 2;
    if (file) return 1;
    return 0;
  }, [report, importing, validation, rows, file]);

  const onFile = async (f: File) => {
    if (tab === "faculty_accounts") return;
    const t = tab as ImportType;
    setFile(f); setRows(null); setValidation(null); setReport(null); setPerfMs(null);
    setValidating(true);
    try {
      const parsed = await parseExcel(f);
      setRows(parsed);
      const lookups = await loadLookups();
      let res: ValidationResult<unknown>;
      if (t === "students") res = await validateStudents(parsed, lookups);
      else if (t === "faculty") res = await validateFaculty(parsed, lookups);
      else if (t === "staff") res = await validateStaff(parsed, lookups);
      else if (t === "courses") res = await validateCourses(parsed, lookups);
      else res = await validateStudyPlans(parsed, lookups);
      setValidation(res);
      void auditImportValidated(t, f.name, {
        total: res.totalRows, valid: res.validRows, invalid: res.invalidRows,
      });
    } catch (e) {
      void auditImportFailed(t, f.name, (e as Error).message);
      alert("تعذر قراءة الملف: " + (e as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const runImport = async () => {
    if (!validation || !file) return;
    setImporting(true);
    setReport(null);
    setPerfMs(null);
    const t0 = performance.now();
    try {
      void auditImportStarted(tab, file.name, validation.totalRows, dryRun);
      let rep = emptyReport();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vrows = validation.rows as ValidatedRow<any>[];
      if (tab === "students") rep = await importStudents(vrows, dryRun);
      else if (tab === "faculty") rep = await importFaculty(vrows, dryRun);
      else if (tab === "staff") rep = await importStaff(vrows, dryRun);
      else if (tab === "courses") rep = await importCourses(vrows, dryRun);
      else rep = await importStudyPlans(vrows, dryRun);
      const duration = Math.round(performance.now() - t0);
      setPerfMs(duration);
      await finalizeImport({ type: tab, fileName: file.name, report: rep, dryRun, durationMs: duration });
      setReport(rep);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["import-stats"] });
    } catch (e) {
      void auditImportFailed(tab, file.name, (e as Error).message);
      alert("فشل الاستيراد: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-gold" /> الاستيراد الجماعي
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          استورد بيانات حقيقية من ملفات Excel مع التحقق المسبق، الوضع التجريبي، وتقارير قابلة للتنزيل.
        </p>
      </header>

      <ImportStats />

      <Stepper current={step} />

      <nav className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
              tab === t.id ? "border-gold text-primary" : "border-transparent text-muted-foreground hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => downloadTemplate(tab)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:border-gold"
          >
            <Download className="h-4 w-4" /> تنزيل القالب
          </button>

          <label className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer hover:opacity-90">
            <Upload className="h-4 w-4" />
            رفع ملف Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </label>

          {file && (
            <span className="text-xs text-muted-foreground">
              الملف: <span className="font-mono">{file.name}</span>
            </span>
          )}

          {validation && (
            <button
              onClick={() => downloadValidationReport(tab, file?.name ?? "file.xlsx", validation)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-primary hover:border-gold"
            >
              <FileDown className="h-3.5 w-3.5" /> تقرير التحقق
            </button>
          )}

          {validation && !report && (
            <div className="ml-auto flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-primary cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-gold"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                <FlaskConical className="h-3.5 w-3.5 text-gold" /> وضع التحقق فقط (Dry Run)
              </label>
              <button
                onClick={runImport}
                disabled={importing || validation.validRows === 0}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                  dryRun ? "bg-amber-600" : "bg-emerald-600"
                }`}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {dryRun ? "تشغيل تجريبي" : "تنفيذ الاستيراد"} ({validation.validRows} صف)
              </button>
            </div>
          )}
        </div>

        {validating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحقق من البيانات...
          </div>
        )}

        {validation && (
          <PreviewBlock validation={validation} />
        )}

        {report && (
          <ReportBlock
            report={report}
            type={tab}
            dryRun={dryRun}
            durationMs={perfMs}
            onDownload={() => downloadImportReport(tab, file?.name ?? "file.xlsx", report)}
          />
        )}
      </section>

      <ImportHistory />
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-card">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <div className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-extrabold ${
              done ? "bg-emerald-600 text-white" : active ? "bg-gold text-primary" : "bg-secondary text-muted-foreground"
            }`}>{i + 1}</div>
            <span className={`text-xs font-bold ${active ? "text-primary" : done ? "text-emerald-700" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-6 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

function ImportStats() {
  const { data } = useQuery({
    queryKey: ["import-stats"],
    queryFn: async () => {
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const todayIso = startOfToday.toISOString();
      const [all, today, completed, failed] = await Promise.all([
        sb.from("import_logs").select("id", { count: "exact", head: true }),
        sb.from("import_logs").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        sb.from("import_logs").select("id", { count: "exact", head: true }).eq("status", "completed"),
        sb.from("import_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      ]);
      const total = all.count ?? 0;
      const okCount = completed.count ?? 0;
      const rate = total > 0 ? Math.round((okCount / total) * 100) : 0;
      return { total, today: today.count ?? 0, completed: okCount, failed: failed.count ?? 0, rate };
    },
  });
  const cards = [
    { label: "إجمالي الاستيرادات", value: data?.total ?? 0, tone: "neutral" as const },
    { label: "استيرادات اليوم", value: data?.today ?? 0, tone: "neutral" as const },
    { label: "ناجحة", value: data?.completed ?? 0, tone: "ok" as const },
    { label: "فاشلة", value: data?.failed ?? 0, tone: "bad" as const },
    { label: "نسبة النجاح %", value: data?.rate ?? 0, tone: "ok" as const },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-primary flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-gold" /> إحصائيات الاستيراد الجماعي
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Stat key={c.label} label={c.label} value={c.value} tone={c.tone} />
        ))}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PreviewBlock({ validation }: { validation: ValidationResult<any> }) {
  const { totalRows, validRows, invalidRows, rows } = validation;
  const errorRows = useMemo(() => rows.filter((r) => r.errors.length > 0).slice(0, 100), [rows]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="إجمالي الصفوف" value={totalRows} tone="neutral" />
        <Stat label="صفوف صالحة" value={validRows} tone="ok" />
        <Stat label="صفوف بأخطاء" value={invalidRows} tone="bad" />
      </div>

      {errorRows.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-destructive mb-2">
            <AlertTriangle className="h-4 w-4" /> أخطاء التحقق (أول {errorRows.length} صف)
          </div>
          <div className="max-h-64 overflow-y-auto text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-right text-muted-foreground border-b border-border">
                  <th className="py-1 px-2 w-16">الصف</th>
                  <th className="py-1 px-2 w-40">العمود</th>
                  <th className="py-1 px-2">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {errorRows.flatMap((r) =>
                  r.errors.map((e, i) => (
                    <tr key={`${r.rowNumber}-${i}`} className="border-b border-border/50">
                      <td className="py-1 px-2 font-mono">{r.rowNumber}</td>
                      <td className="py-1 px-2 font-mono">{e.column ?? "—"}</td>
                      <td className="py-1 px-2">{e.message}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportBlock({ report, type, dryRun, durationMs, onDownload }: {
  report: ImportReport; type: ImportType; dryRun: boolean; durationMs: number | null; onDownload: () => void;
}) {
  const tone = dryRun ? "amber" : "emerald";
  return (
    <div className={`rounded-lg border border-${tone}-500/30 bg-${tone}-500/5 p-4 space-y-3`}>
      <div className={`flex items-center justify-between gap-2 font-bold text-${tone}-700`}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          {dryRun ? "تشغيل تجريبي مكتمل (لم تتم أي تغييرات)" : `تم تنفيذ استيراد ${TYPE_LABEL[type]}`}
        </div>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:border-gold"
        >
          <FileDown className="h-3.5 w-3.5" /> تنزيل التقرير
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="إجمالي" value={report.rows_total} tone="neutral" />
        <Stat label="نجح" value={report.rows_success} tone="ok" />
        <Stat label="فشل" value={report.rows_failed} tone="bad" />
        <Stat label="الزمن (ms)" value={durationMs ?? 0} tone="neutral" />
      </div>
      {report.errors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-destructive">أخطاء ({report.errors.length})</summary>
          <ul className="mt-2 list-disc pr-5 space-y-1 max-h-40 overflow-y-auto">
            {report.errors.slice(0, 100).map((e, i) => (
              <li key={i}>صف {e.row}{e.column ? ` [${e.column}]` : ""}: {e.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "bad" | "neutral" }) {
  const toneClass = tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-destructive" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-extrabold ${toneClass}`}>{value.toLocaleString("ar-EG")}</div>
    </div>
  );
}

type HistoryRow = {
  id: string; created_at: string; import_type: ImportType; file_name: string;
  rows_total: number; rows_success: number; rows_failed: number; status: string; notes: string | null;
};

function ImportHistory() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["import-history"],
    queryFn: async () => {
      const { data, error } = await sb.from("import_logs")
        .select("id, created_at, import_type, file_name, rows_total, rows_success, rows_failed, status, notes")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as HistoryRow[];
    },
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-primary flex items-center gap-2 mb-3">
        <History className="h-5 w-5 text-gold" /> سجل عمليات الاستيراد
      </h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground">لا توجد عمليات استيراد سابقة.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="py-2 px-2 w-8" />
                <th className="py-2 px-2">التاريخ</th>
                <th className="py-2 px-2">النوع</th>
                <th className="py-2 px-2">الملف</th>
                <th className="py-2 px-2">إجمالي</th>
                <th className="py-2 px-2">نجح</th>
                <th className="py-2 px-2">فشل</th>
                <th className="py-2 px-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-2">
                        {r.notes ? (
                          <button
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            className="text-primary"
                            aria-label="تفاصيل"
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 text-xs">{new Date(r.created_at).toLocaleString("ar-EG")}</td>
                      <td className="py-2 px-2">{TYPE_LABEL[r.import_type] ?? r.import_type}</td>
                      <td className="py-2 px-2 font-mono text-xs">{r.file_name}</td>
                      <td className="py-2 px-2">{r.rows_total}</td>
                      <td className="py-2 px-2 text-emerald-700 font-bold">{r.rows_success}</td>
                      <td className="py-2 px-2 text-destructive font-bold">{r.rows_failed}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          r.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                          r.status === "partial" ? "bg-amber-100 text-amber-700" :
                          "bg-destructive/10 text-destructive"
                        }`}>
                          {r.status === "completed" ? "مكتمل" : r.status === "partial" ? "جزئي" : "فشل"}
                        </span>
                      </td>
                    </tr>
                    {isOpen && r.notes && (
                      <tr key={`${r.id}-d`} className="bg-secondary/20">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="text-xs font-bold text-primary mb-1 flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5 text-destructive" /> ملخص الأخطاء
                          </div>
                          <div className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                            {r.notes}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
