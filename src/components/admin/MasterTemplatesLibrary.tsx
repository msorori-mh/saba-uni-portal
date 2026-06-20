// MASTER-IMPORT-TEMPLATES-01
// IMPORTS-PAGE-AVAILABLE-VS-TEMPLATE-ONLY-UX-01
// Library section that lists all official import templates and lets admins
// download any of them. Read-only; does not perform imports.
// Templates are now split visually into two groups:
//   1. قوالب قابلة للاستيراد فعلياً — لها مستورد (importerKey) ويمكن رفعها.
//   2. قوالب للتحميل فقط — للتوثيق/التحضير المسبق، رفعها غير متاح حالياً.

import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Info,
  BookOpen,
  Upload,
  Lock,
} from "lucide-react";
import {
  MASTER_TEMPLATES,
  CATEGORY_LABEL_MAP,
  downloadMasterTemplate,
  type MasterTemplate,
} from "@/lib/imports/master-templates";

export function MasterTemplatesLibrary() {
  const { importable, downloadOnly } = useMemo(() => {
    const importable = MASTER_TEMPLATES.filter((t) => !!t.importerKey);
    const downloadOnly = MASTER_TEMPLATES.filter((t) => !t.importerKey);
    return { importable, downloadOnly };
  }, []);

  const [downloading, setDownloading] = useState<string | null>(null);

  const onDownload = async (id: string) => {
    setDownloading(id);
    try {
      await downloadMasterTemplate(id);
    } catch (e) {
      alert("تعذر إنشاء القالب: " + (e as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  const groupByCategory = (list: MasterTemplate[]) => {
    const map = new Map<string, MasterTemplate[]>();
    for (const t of list) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries()).map(([cat, templates]) => ({
      category: cat,
      label: CATEGORY_LABEL_MAP[cat as keyof typeof CATEGORY_LABEL_MAP],
      templates,
    }));
  };

  const importableGroups = groupByCategory(importable);
  const downloadOnlyGroups = groupByCategory(downloadOnly);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-6">
      <header className="flex flex-wrap items-start gap-3 border-b border-border pb-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-extrabold text-primary">
            قوالب الاستيراد الرسمية
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            مكتبة موحّدة لجميع قوالب الاستيراد المعتمدة. كل قالب يحتوي على ثلاث أوراق:
            <span className="font-mono mx-1">Data</span> /
            <span className="font-mono mx-1">Instructions</span> /
            <span className="font-mono mx-1">Example</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 font-bold text-emerald-700">
            قابلة للاستيراد: {importable.length}
          </span>
          <span className="rounded-md bg-secondary/40 px-2 py-1 font-bold text-primary">
            للتحميل فقط: {downloadOnly.length}
          </span>
        </div>
      </header>

      {/* ======================================================== */}
      {/* القسم 1: قوالب قابلة للاستيراد فعلياً */}
      {/* ======================================================== */}
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50/60 border border-emerald-200 p-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display text-base font-extrabold text-emerald-800">
              قوالب قابلة للاستيراد
            </h3>
            <p className="text-xs text-emerald-800/80 mt-0.5">
              يمكنك تنزيل القالب، تعبئته، ثم رفعه من تبويبات الاستيراد في أعلى الصفحة لتنفيذ الاستيراد فعلياً.
            </p>
          </div>
        </div>

        {importableGroups.map((g) => (
          <div key={g.category} className="space-y-2">
            <h4 className="text-sm font-bold text-primary">{g.label}</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  variant="importable"
                  downloading={downloading === t.id}
                  onDownload={() => onDownload(t.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ======================================================== */}
      {/* القسم 2: قوالب للتحميل فقط */}
      {/* ======================================================== */}
      {downloadOnlyGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-base font-extrabold text-amber-800">
                قوالب للتحميل فقط — الاستيراد غير متاح حالياً
              </h3>
              <p className="text-xs text-amber-800/90 mt-0.5">
                هذه القوالب متاحة للتوثيق أو التحضير المسبق للبيانات، لكن لا يمكن رفعها واستيرادها حالياً
                حتى يتم تطوير المستورد الخاص بها. لا تظهر هذه الأنواع ضمن تبويبات الرفع في أعلى الصفحة.
              </p>
            </div>
          </div>

          {downloadOnlyGroups.map((g) => (
            <div key={g.category} className="space-y-2">
              <h4 className="text-sm font-bold text-primary">{g.label}</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    t={t}
                    variant="download-only"
                    downloading={downloading === t.id}
                    onDownload={() => onDownload(t.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateCard({
  t,
  variant,
  downloading,
  onDownload,
}: {
  t: MasterTemplate;
  variant: "importable" | "download-only";
  downloading: boolean;
  onDownload: () => void;
}) {
  const importable = variant === "importable";

  // Special note for class_schedule per spec
  const specialNote =
    t.id === "class_schedule"
      ? "استخدم تبويب «الجداول الدراسية» في أعلى الصفحة لرفع الجدول بعد اختيار السياق الأكاديمي."
      : null;

  return (
    <article
      className={`rounded-lg border p-3 flex flex-col gap-2 transition ${
        importable
          ? "border-border bg-background hover:border-gold"
          : "border-amber-200 bg-amber-50/40 hover:border-amber-400"
      }`}
    >
      <div className="flex items-start gap-2">
        <FileSpreadsheet
          className={`h-5 w-5 shrink-0 ${importable ? "text-primary" : "text-amber-700"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-primary truncate">{t.title}</div>
          <div className="font-mono text-[10px] text-muted-foreground truncate">
            {t.fileName}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground line-clamp-2 min-h-[2.4em]">
        {t.description}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded bg-secondary/40 px-1.5 py-0.5 font-bold text-primary">
          {t.columns.length} عمود
        </span>
        <span className="rounded bg-secondary/40 px-1.5 py-0.5 font-bold text-primary">
          {t.columns.filter((c) => c.required).length} مطلوب
        </span>
        {importable ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-bold text-emerald-700">
            <Upload className="h-3 w-3" /> الرفع متاح
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 font-bold text-amber-800">
            <Lock className="h-3 w-3" /> تحميل النموذج فقط
          </span>
        )}
      </div>

      {!importable && (
        <p className="text-[11px] leading-relaxed text-amber-800 bg-amber-100/60 border border-amber-200 rounded px-2 py-1.5">
          {specialNote ?? "الاستيراد غير مدعوم حالياً لهذا النوع. القالب متاح للتوثيق والتحضير فقط."}
        </p>
      )}

      <button
        onClick={onDownload}
        disabled={downloading}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:border-gold disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {downloading ? "جارٍ التحضير..." : "تنزيل القالب"}
      </button>
    </article>
  );
}
