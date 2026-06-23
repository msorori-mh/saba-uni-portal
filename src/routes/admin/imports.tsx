import { createFileRoute } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { importFacultyAccountsRows } from "@/lib/faculty-accounts.functions";
import {
  Upload, Download, CheckCircle2, XCircle, Loader2, FileSpreadsheet,
  AlertTriangle, History, FileDown, FlaskConical, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import { runBulkImport, getImportStats, listImportHistory, validateBulkImportPreview } from "@/lib/imports.functions";
import { parseExcel, downloadTemplate } from "@/lib/imports/templates";
import {
  auditImportStarted, auditImportValidated, auditImportFailed,
} from "@/lib/imports/engine";
import { downloadValidationReport, downloadImportReport } from "@/lib/imports/reports";
import { IMPORT_TYPE_LABEL_AR, IMPORT_LOG_STATUS_AR, getReportStatLabels } from "@/lib/imports/labels";
import type { ImportReport, ImportType, ValidationResult, ValidatedRow } from "@/lib/imports/types";
import { MasterTemplatesLibrary } from "@/components/admin/MasterTemplatesLibrary";
import { downloadMasterTemplate } from "@/lib/imports/master-templates";
import { ScheduleImportPanel } from "@/components/admin/ScheduleImportPanel";

export const Route = createFileRoute("/admin/imports")({
  head: () => ({ meta: [{ title: "الاستيراد الجماعي — لوحة الإدارة" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ImportsPage,
});

type TabId = ImportType | "faculty_accounts" | "class_schedule";

const TABS: { id: TabId; label: string }[] = [
  { id: "students", label: "الطلاب" },
  { id: "faculty", label: "أعضاء هيئة التدريس" },
  { id: "staff", label: "الموظفون" },
  { id: "courses", label: "المقررات" },
  { id: "study_plans", label: "الخطط الدراسية" },
  { id: "departments", label: "الأقسام" },
  { id: "programs", label: "البرامج" },
  { id: "levels", label: "المستويات الدراسية" },
  { id: "course_sections", label: "مجموعات المقررات" },
  { id: "student_enrollments", label: "تسجيلات الطلاب" },
  { id: "student_grades", label: "درجات الطلاب" },
  { id: "student_fees", label: "رسوم الطلاب" },
  { id: "student_discounts", label: "خصومات الطلاب" },
  { id: "documents", label: "الوثائق الرسمية" },
  { id: "class_schedule", label: "الجداول الدراسية" },
  { id: "faculty_accounts", label: "حسابات أعضاء هيئة التدريس" },
];

const TYPE_LABEL = IMPORT_TYPE_LABEL_AR;

const STRUCTURE_TYPES = new Set<ImportType>([
  "departments", "programs", "levels", "course_sections", "student_enrollments", "student_grades", "student_fees", "student_discounts",
]);

const STEPS = [
  "تنزيل القالب",
  "رفع الملف",
  "المعاينة",
  "التحقق",
  "الاستيراد",
  "التقرير",
] as const;

const SERVER_PREVIEW_ERROR =
  "تعذر تنفيذ التحقق على الخادم. يرجى المحاولة مرة أخرى أو التواصل مع مدير النظام.";

function ImportsPage() {
  usePagePerf("/admin/imports");
  const runBulkImportFn = useServerFn(runBulkImport);
  const previewFn = useServerFn(validateBulkImportPreview);
  const [tab, setTab] = useState<TabId>("students");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [validation, setValidation] = useState<ValidationResult<any> | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [dryRunCompleted, setDryRunCompleted] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [perfMs, setPerfMs] = useState<number | null>(null);
  const qc = useQueryClient();

  const reset = () => {
    setFile(null); setRows(null); setValidation(null); setReport(null); setPerfMs(null);
    setDryRunCompleted(false);
  };

  const onTabChange = (t: TabId) => { setTab(t); reset(); setUpdateExisting(false); setDryRun(false); };

  // Determine current step (0..5)
  const step = useMemo(() => {
    if (report) return 5;
    if (importing) return 4;
    if (validation) return 3;
    if (rows) return 2;
    if (file) return 1;
    return 0;
  }, [report, importing, validation, rows, file]);

  const isSpecialTab = tab === "faculty_accounts" || tab === "class_schedule";
  const isStructureTab = !isSpecialTab && STRUCTURE_TYPES.has(tab as ImportType);

  const runServerPreview = async (
    parsed: Record<string, unknown>[],
    updateExistingFlag: boolean,
  ): Promise<ValidationResult<unknown>> => {
    try {
      return await previewFn({
        data: {
          type: tab as ImportType,
          rows: parsed,
          updateExisting: updateExistingFlag,
        },
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (/صلاحية|Unauthorized/i.test(msg)) throw e;
      throw new Error(SERVER_PREVIEW_ERROR);
    }
  };

  const onFile = async (f: File) => {
    if (isSpecialTab) return;
    const t = tab as ImportType;
    setFile(f); setRows(null); setValidation(null); setReport(null); setPerfMs(null);
    setValidating(true);
    try {
      const parsed = await parseExcel(f);
      setRows(parsed);
      const res = await runServerPreview(parsed, updateExisting);
      setValidation(res);
      void auditImportValidated(t, f.name, {
        total: res.totalRows, valid: res.validRows, invalid: res.invalidRows,
      });
    } catch (e) {
      void auditImportFailed(t, f.name, (e as Error).message);
      const msg = (e as Error).message;
      alert(msg === SERVER_PREVIEW_ERROR || /صلاحية|Unauthorized/i.test(msg)
        ? msg
        : "تعذر قراءة الملف: " + msg);
    } finally {
      setValidating(false);
    }
  };

  // Re-run validation when toggling Update Existing on structure tabs
  const onToggleUpdateExisting = async (next: boolean) => {
    setUpdateExisting(next);
    setDryRunCompleted(false);
    setReport(null);
    if (!rows || !isStructureTab) return;
    setValidating(true);
    try {
      const res = await runServerPreview(rows, next);
      setValidation(res);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const runImport = async () => {
    if (!validation || !file) return;
    if (isSpecialTab) return;
    const t = tab as ImportType;
    setImporting(true);
    setReport(null);
    setPerfMs(null);
    const t0 = performance.now();
    try {
      void auditImportStarted(t, file.name, validation.totalRows, dryRun);
      const rep = await runBulkImportFn({
        data: {
          type: t,
          fileName: file.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows: validation.rows as any[],
          dryRun,
          updateExisting,
        },
      });
      const duration = Math.round(performance.now() - t0);
      setPerfMs(duration);
      setReport(rep);
      if (dryRun) setDryRunCompleted(true);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["import-stats"] });
    } catch (e) {
      void auditImportFailed(t, file.name, (e as Error).message);
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

      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg bg-secondary/40 border border-border px-3 py-2 text-xs text-primary">
          <AlertTriangle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
          <span>
            الأنواع الظاهرة في التبويبات أدناه هي <strong>المستوردات المتاحة فعلياً</strong> للرفع والاستيراد.
            بعض القوالب الإضافية متاحة للتنزيل من قسم «قوالب الاستيراد الرسمية» في الأسفل.
          </span>
        </div>
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
      </div>


      {tab === "faculty_accounts" ? (
        <FacultyAccountsImportPanel />
      ) : tab === "class_schedule" ? (
        <ScheduleImportPanel />
      ) : (
      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => downloadTemplate(tab as ImportType)}
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
              onClick={() => downloadValidationReport(tab as ImportType, file?.name ?? "file.xlsx", validation)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-primary hover:border-gold"
            >
              <FileDown className="h-3.5 w-3.5" /> تقرير التحقق
            </button>
          )}

          {validation && !report && (
            <div className="ml-auto flex flex-col items-end gap-2">
              {!dryRun && !dryRunCompleted && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 max-w-md text-right">
                  <strong>خطوة مطلوبة:</strong> شغّل <strong>الوضع التجريبي (Dry Run)</strong> مرة واحدة قبل التنفيذ الفعلي للتأكد من النتائج المتوقعة.
                </div>
              )}
              {dryRunCompleted && !dryRun && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <CheckCircle2 className="inline h-3.5 w-3.5 ml-1" />
                  اكتمل التشغيل التجريبي — يمكنك تنفيذ الاستيراد الفعلي الآن.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
              {isStructureTab && (
                <label className="inline-flex items-center gap-2 text-xs font-bold text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-gold"
                    checked={updateExisting}
                    onChange={(e) => onToggleUpdateExisting(e.target.checked)}
                  />
                  تحديث القائم (Update Existing)
                </label>
              )}
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
                disabled={importing || validation.validRows === 0 || (!dryRun && !dryRunCompleted)}
                title={!dryRun && !dryRunCompleted ? "شغّل الوضع التجريبي أولاً" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                  dryRun ? "bg-amber-600" : "bg-emerald-600"
                }`}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {dryRun ? "تشغيل تجريبي" : "تنفيذ الاستيراد"} ({validation.validRows} صف)
              </button>
              </div>
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
            type={tab as ImportType}
            dryRun={dryRun}
            durationMs={perfMs}
            onDownload={() => downloadImportReport(tab as ImportType, file?.name ?? "file.xlsx", report, { dryRun, durationMs: perfMs })}
            onContinueRealImport={dryRun ? () => { setReport(null); setDryRun(false); } : undefined}
            onStartOver={() => reset()}
          />
        )}
      </section>
      )}

      <MasterTemplatesLibrary />

      <ImportHistory />
    </div>
  );
}

// ===== FACULTY-ACCOUNT-IMPORT-EXPORT-02 — accounts panel =====
type FacultyImportResult = Awaited<ReturnType<typeof importFacultyAccountsRows>>;
type FacultyImportRow = FacultyImportResult["results"][number];

function FacultyAccountsImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FacultyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importAccountsFn = useServerFn(importFacultyAccountsRows);

  const downloadAccountsTemplate = async () => {
    const { loadXLSX } = await import("@/lib/xlsx-loader");
    const XLSX = await loadXLSX();
    const headers = ["employee_number","email","initial_password","full_name_ar","department_name","academic_rank","role","force_password_change"];
    const sample = ["F2025001","faculty@example.com","TempPass!23","د. أحمد","قسم علوم الحاسوب","Assistant Professor","faculty_member","true"];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faculty Accounts");
    const inst = [["التعليمات"],
      ["الأعمدة المطلوبة: employee_number, email, initial_password"],
      ["الأعمدة الاختيارية: full_name_ar, department_name, academic_rank, role, force_password_change, status"],
      ["role فارغ = faculty_member"],
      ["force_password_change فارغ = true"],
      ["الربط يتم عبر employee_number فقط"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inst), "تعليمات");
    XLSX.writeFile(wb, "template_faculty_accounts.xlsx");
  };

  const onFile = async (f: File) => {
    setFile(f); setResult(null); setError(null);
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const parsed = await parseExcel(file);
      const rows = parsed.map((r, idx) => ({ ...r, row_number: idx + 2 }));
      const res = await importAccountsFn({ data: { rows } });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  const downloadResultReport = async () => {
    if (!result) return;
    const { loadXLSX } = await import("@/lib/xlsx-loader");
    const XLSX = await loadXLSX();
    const STATUS_AR: Record<string, string> = {
      created: "تم الإنشاء", linked: "تم الربط", already_linked: "مربوط مسبقاً", failed: "فشل",
    };
    const data = result.results.map((r: FacultyImportRow) => ({
      row: r.row_number,
      employee_number: r.employee_number,
      full_name_ar: r.full_name_ar ?? "",
      email: r.email,
      status: STATUS_AR[r.status] ?? r.status,
      reason: r.reason ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Report");
    XLSX.writeFile(wb, `faculty_accounts_import_report_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        نوع استيراد خاص لربط/إنشاء حسابات أعضاء هيئة التدريس عبر البريد الإلكتروني الرسمي. لا يتم توليد أي بريد افتراضي.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={downloadAccountsTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:border-gold">
          <Download className="h-4 w-4" /> تنزيل القالب
        </button>
        <label className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer hover:opacity-90">
          <Upload className="h-4 w-4" /> رفع ملف Excel
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
        {file && <span className="text-xs text-muted-foreground">الملف: <span className="font-mono">{file.name}</span></span>}
        {file && !result && (
          <button onClick={runImport} disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تنفيذ الاستيراد
          </button>
        )}
        {result && (
          <button onClick={downloadResultReport}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-primary hover:border-gold">
            <FileDown className="h-3.5 w-3.5" /> تصدير التقرير Excel
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="إجمالي" value={result.totals.total} tone="neutral" />
            <Stat label="إنشاء" value={result.totals.created} tone="ok" />
            <Stat label="ربط" value={result.totals.linked} tone="ok" />
            <Stat label="مربوط مسبقاً" value={result.totals.already_linked} tone="neutral" />
            <Stat label="فشل" value={result.totals.failed} tone="bad" />
          </div>
          <div className="rounded-lg border border-border bg-background overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="px-2 py-1 text-right">الصف</th>
                  <th className="px-2 py-1 text-right">الرقم الوظيفي</th>
                  <th className="px-2 py-1 text-right">الاسم</th>
                  <th className="px-2 py-1 text-right">البريد</th>
                  <th className="px-2 py-1 text-right">الحالة</th>
                  <th className="px-2 py-1 text-right">السبب</th>
                </tr>
              </thead>
              <tbody>
                {result.results.slice(0, 500).map((r: FacultyImportRow) => (
                  <tr key={r.row_number} className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono">{r.row_number}</td>
                    <td className="px-2 py-1 font-mono">{r.employee_number}</td>
                    <td className="px-2 py-1">{r.full_name_ar ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.email}</td>
                    <td className={`px-2 py-1 font-bold ${
                      r.status === "created" || r.status === "linked" ? "text-emerald-700" :
                      r.status === "already_linked" ? "text-amber-700" : "text-destructive"
                    }`}>
                      {r.status === "created" ? "تم الإنشاء"
                        : r.status === "linked" ? "تم الربط"
                        : r.status === "already_linked" ? "مربوط مسبقاً"
                        : "فشل"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{r.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
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
  const statsFn = useServerFn(getImportStats);
  const { data } = useQuery({
    queryKey: ["import-stats"],
    queryFn: () => statsFn({ data: {} }),
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

function ReportBlock({ report, type, dryRun, durationMs, onDownload, onContinueRealImport, onStartOver }: {
  report: ImportReport; type: ImportType; dryRun: boolean; durationMs: number | null;
  onDownload: () => void;
  onContinueRealImport?: () => void;
  onStartOver?: () => void;
}) {
  const statLabels = getReportStatLabels(type, dryRun);
  const boxClass = dryRun
    ? "rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
    : "rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3";
  const titleClass = dryRun ? "font-bold text-amber-700" : "font-bold text-emerald-700";

  return (
    <div className={boxClass}>
      <div className={`flex items-center justify-between gap-2 ${titleClass}`}>
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
      <div className={`grid gap-3 ${statLabels.showUpdated ? "grid-cols-2 md:grid-cols-6" : "grid-cols-2 md:grid-cols-5"}`}>
        <Stat label="إجمالي" value={report.rows_total} tone="neutral" />
        <Stat label="نجح" value={report.rows_success} tone="ok" />
        <Stat label="فشل" value={report.rows_failed} tone="bad" />
        <Stat label={statLabels.created} value={report.rows_created ?? 0} tone="ok" />
        {statLabels.showUpdated && (
          <Stat label={statLabels.updated} value={report.rows_updated ?? 0} tone="neutral" />
        )}
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
      {(onContinueRealImport || onStartOver) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onContinueRealImport && report.rows_success > 0 && (
            <button
              onClick={onContinueRealImport}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" /> تنفيذ الاستيراد الفعلي
            </button>
          )}
          {onStartOver && (
            <button
              onClick={onStartOver}
              className="text-xs font-bold text-primary underline"
            >
              رفع ملف جديد
            </button>
          )}
        </div>
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
  const listFn = useServerFn(listImportHistory);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["import-history"],
    queryFn: () => listFn({ data: {} }),
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
                      <td className="py-2 px-2">{TYPE_LABEL[r.import_type as ImportType] ?? r.import_type}</td>
                      <td className="py-2 px-2 font-mono text-xs">{r.file_name}</td>
                      <td className="py-2 px-2">{r.rows_total}</td>
                      <td className="py-2 px-2 text-emerald-700 font-bold">{r.rows_success}</td>
                      <td className="py-2 px-2 text-destructive font-bold">{r.rows_failed}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          r.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                          r.status === "dry_run" ? "bg-amber-100 text-amber-700" :
                          r.status === "partial" ? "bg-amber-100 text-amber-700" :
                          "bg-destructive/10 text-destructive"
                        }`}>
                          {IMPORT_LOG_STATUS_AR[r.status] ?? r.status}
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

