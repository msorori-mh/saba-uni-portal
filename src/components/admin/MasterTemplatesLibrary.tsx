// MASTER-IMPORT-TEMPLATES-01
// Library section that lists all official import templates and lets admins
// download any of them. Read-only; does not perform imports.

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle, BookOpen } from "lucide-react";
import {
  MASTER_TEMPLATES,
  getTemplatesByCategory,
  downloadMasterTemplate,
} from "@/lib/imports/master-templates";

export function MasterTemplatesLibrary() {
  const groups = useMemo(() => getTemplatesByCategory(), []);
  const [downloading, setDownloading] = useState<string | null>(null);

  const totals = useMemo(() => {
    const total = MASTER_TEMPLATES.length;
    const withImporter = MASTER_TEMPLATES.filter((t) => !!t.importerKey).length;
    const withValidator = MASTER_TEMPLATES.filter((t) => t.hasValidator).length;
    return { total, withImporter, withValidator, future: total - withImporter };
  }, []);

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

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-5">
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
          <span className="rounded-md bg-secondary/40 px-2 py-1 font-bold text-primary">
            القوالب: {totals.total}
          </span>
          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 font-bold text-emerald-700">
            مستورد فعلي: {totals.withImporter}
          </span>
          <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1 font-bold text-amber-700">
            بحاجة تطوير: {totals.future}
          </span>
        </div>
      </header>

      {groups.map((g) => (
        <div key={g.category} className="space-y-2">
          <h3 className="text-sm font-bold text-primary">{g.label}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.templates.map((t) => {
              const ready = !!t.importerKey;
              return (
                <article
                  key={t.id}
                  className={`rounded-lg border p-3 flex flex-col gap-2 transition ${
                    ready
                      ? "border-border bg-background hover:border-gold"
                      : "border-amber-200 bg-amber-50/40 hover:border-amber-400"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
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
                    {ready ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> جاهز
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-bold text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> قالب فقط
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onDownload(t.id)}
                    disabled={downloading === t.id}
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:border-gold disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloading === t.id ? "جارٍ التحضير..." : "تنزيل القالب"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
