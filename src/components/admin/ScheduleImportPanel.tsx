import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload, Download, CheckCircle2, XCircle, Loader2, AlertTriangle,
} from "lucide-react";
import { getScheduleImportLookups, runScheduleImport } from "@/lib/imports.functions";
import { parseExcel } from "@/lib/imports/templates";
import { downloadMasterTemplate } from "@/lib/imports/master-templates";
import {
  loadScheduleLookups, validateClassSchedule,
  type ScheduleContext, type ScheduleValidationResult, type ScheduleImportReport,
} from "@/lib/imports/class-schedule";

type RefRow = { id: string; label: string };

export type ScheduleImportPanelProps = {
  /** Pre-fill context selectors when available (e.g. current academic year). */
  initialContext?: Partial<ScheduleContext>;
  /** When true, shows copy tailored for the course-offerings schedule tab. */
  embedded?: boolean;
};

export function ScheduleImportPanel({ initialContext, embedded = false }: ScheduleImportPanelProps) {
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getScheduleImportLookups);
  const importFn = useServerFn(runScheduleImport);
  const [ay, setAy] = useState(initialContext?.academic_year_id ?? "");
  const [sem, setSem] = useState(initialContext?.semester_id ?? "");
  const [prog, setProg] = useState(initialContext?.program_id ?? "");
  const [lvl, setLvl] = useState(initialContext?.level_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<ScheduleValidationResult | null>(null);
  const [report, setReport] = useState<ScheduleImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialContext?.academic_year_id && !ay) setAy(initialContext.academic_year_id);
    if (initialContext?.semester_id && !sem) setSem(initialContext.semester_id);
    if (initialContext?.program_id && !prog) setProg(initialContext.program_id);
    if (initialContext?.level_id && !lvl) setLvl(initialContext.level_id);
  }, [initialContext, ay, sem, prog, lvl]);

  const { data: refs } = useQuery({
    queryKey: ["class-schedule-ref-options"],
    queryFn: async () => {
      const raw = await lookupsFn({ data: {} });
      return {
        academicYears: (raw.academicYears ?? []).map((r: { id: string; name: string }) => ({ id: r.id, label: r.name })) as RefRow[],
        semesters: (raw.semesters ?? []).map((r: { id: string; name: string; code: string }) => ({ id: r.id, label: `${r.name} (${r.code})` })) as RefRow[],
        programs: (raw.programs ?? []).map((r: { id: string; code: string; name_ar: string }) => ({ id: r.id, label: `${r.name_ar} (${r.code})` })) as RefRow[],
        levels: (raw.levels ?? []).map((r: { id: string; name: string; level_number: number }) => ({ id: r.id, label: `${r.name} — ${r.level_number}` })) as RefRow[],
      };
    },
  });

  const contextReady = !!(ay && sem && prog && lvl);
  const ctx: ScheduleContext | null = contextReady
    ? { academic_year_id: ay, semester_id: sem, program_id: prog, level_id: lvl }
    : null;

  const reset = () => {
    setFile(null); setValidation(null); setReport(null); setError(null);
  };

  const onFile = async (f: File) => {
    if (!ctx) return;
    setFile(f); setValidation(null); setReport(null); setError(null);
    setValidating(true);
    try {
      const rows = await parseExcel(f);
      const lookups = await loadScheduleLookups(ctx);
      const res = await validateClassSchedule(rows, ctx, lookups);
      setValidation(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const runImport = async () => {
    if (!ctx || !validation || !file) return;
    setImporting(true);
    setError(null);
    try {
      const rep = await importFn({
        data: {
          context: ctx,
          rows: validation.rows.map((r) => r.raw),
          fileName: file.name,
        },
      });
      setReport(rep);
      if (!rep.aborted && rep.rows_inserted > 0) {
        qc.invalidateQueries({ queryKey: ["class-schedule-stats"] });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
      {embedded && (
        <ul className="text-xs text-muted-foreground list-disc pr-5 space-y-1">
          <li>سيتم ربط الجدول بالمجموعات الدراسية الموجودة مسبقاً.</li>
          <li>يجب إنشاء إسناد المقررات والمجموعات قبل استيراد الجدول.</li>
          <li>استخدم رمز المجموعة في ملف Excel، وليس اسم المجموعة.</li>
        </ul>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        {embedded ? (
          <>
            <strong>تحذير:</strong> سيتم استبدال جداول السياق المحدد (السنة + الفصل + البرنامج + المستوى) عند تأكيد الاستيراد.
            أي تعارض حرج (قاعة / عضو هيئة التدريس / مجموعة) يرفض الملف كاملاً.
          </>
        ) : (
          <>
            مستورد الجداول الدراسية: نمط <strong>Replace Context</strong> — رفع ملف الجدول لسياق واحد فقط
            (السنة + الفصل + البرنامج + المستوى). أي تعارض حرج (قاعة/مدرس/مجموعة) يرفض الملف كاملاً.
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <ContextSelect label="السنة الأكاديمية" value={ay} onChange={(v) => { setAy(v); reset(); }} options={refs?.academicYears} />
        <ContextSelect label="الفصل الدراسي" value={sem} onChange={(v) => { setSem(v); reset(); }} options={refs?.semesters} />
        <ContextSelect label="البرنامج" value={prog} onChange={(v) => { setProg(v); reset(); }} options={refs?.programs} />
        <ContextSelect label="المستوى" value={lvl} onChange={(v) => { setLvl(v); reset(); }} options={refs?.levels} />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => downloadMasterTemplate("class_schedule")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:border-gold"
        >
          <Download className="h-4 w-4" /> تنزيل القالب
        </button>

        <label
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-primary-foreground ${
            contextReady ? "bg-primary cursor-pointer hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
          title={contextReady ? "" : "اختر السنة والفصل والبرنامج والمستوى أولاً"}
        >
          <Upload className="h-4 w-4" />
          رفع ملف Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={!contextReady}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </label>

        {file && <span className="text-xs text-muted-foreground">الملف: <span className="font-mono">{file.name}</span></span>}

        {validation && !report && (
          <button
            type="button"
            onClick={runImport}
            disabled={importing || validation.invalidRows > 0 || validation.blockingConflicts.length > 0}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تنفيذ استيراد الجدول ({validation.validRows} صف)
          </button>
        )}
      </div>

      {!contextReady && (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          اختر <strong>السنة الأكاديمية</strong> و<strong>الفصل الدراسي</strong> و<strong>البرنامج</strong> و<strong>المستوى</strong> قبل رفع ملف الجدول.
        </div>
      )}

      {validating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحقق...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {validation && !report && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="إجمالي" value={validation.totalRows} tone="neutral" />
            <Stat label="صالحة" value={validation.validRows} tone="ok" />
            <Stat label="بأخطاء" value={validation.invalidRows} tone="bad" />
            <Stat label="تعارضات حرجة" value={validation.blockingConflicts.length} tone="bad" />
          </div>

          {validation.blockingConflicts.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <div className="font-bold text-destructive mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> تعارضات حرجة (الملف سيُرفض بالكامل)
              </div>
              <ul className="list-disc pr-5 space-y-1 max-h-48 overflow-y-auto">
                {validation.blockingConflicts.slice(0, 50).map((c, i) => (
                  <li key={i}>صف {c.row}: {c.message}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.invalidRows > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <div className="font-bold text-destructive mb-2">أخطاء التحقق</div>
              <ul className="list-disc pr-5 space-y-1 max-h-48 overflow-y-auto">
                {validation.rows.filter((r) => r.errors.length > 0).slice(0, 50).flatMap((r) =>
                  r.errors.map((e, i) => (
                    <li key={`${r.rowNumber}-${i}`}>صف {r.rowNumber}{e.column ? ` [${e.column}]` : ""}: {e.message}</li>
                  )),
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {report && (
        <div className={`rounded-lg border p-4 space-y-3 ${
          report.aborted ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/30 bg-emerald-500/5"
        }`}>
          <div className={`flex items-center gap-2 font-bold ${report.aborted ? "text-destructive" : "text-emerald-700"}`}>
            {report.aborted ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            {report.aborted ? `تم رفض الملف: ${report.abortReason}` : "تم تنفيذ استيراد الجدول"}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="إجمالي" value={report.rows_total} tone="neutral" />
            <Stat label="مُدخلة" value={report.rows_inserted} tone="ok" />
            <Stat label="فاشلة" value={report.rows_failed} tone="bad" />
            <Stat label="فترات منشأة" value={report.slots_created} tone="neutral" />
          </div>
          {report.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-bold text-destructive">تفاصيل ({report.errors.length})</summary>
              <ul className="mt-2 list-disc pr-5 space-y-1 max-h-48 overflow-y-auto">
                {report.errors.slice(0, 100).map((e, i) => (
                  <li key={i}>صف {e.row}{e.column ? ` [${e.column}]` : ""}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            onClick={() => { setReport(null); setValidation(null); setFile(null); }}
            className="text-xs font-bold text-primary underline"
          >
            رفع ملف آخر لنفس السياق
          </button>
        </div>
      )}
    </section>
  );
}

function ContextSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options?: RefRow[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-bold text-primary">{label} <span className="text-destructive">*</span></span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-gold"
      >
        <option value="">— اختر —</option>
        {(options ?? []).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
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
