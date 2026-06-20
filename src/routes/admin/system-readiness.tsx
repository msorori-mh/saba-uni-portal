import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  runSystemReadinessChecks,
  type SystemReadinessCheck as Check,
  type SystemReadinessSection as Section,
  type SystemReadinessStatus as Status,
} from "@/lib/admin-system-readiness.functions";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, FileDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/system-readiness")({
  component: SystemReadinessPage,
});
function sectionScore(s: Section): { score: number; max: number } {
  let score = 0, max = 0;
  for (const ch of s.checks) {
    const w = ch.weight ?? 1;
    max += w;
    if (ch.status === "PASS") score += w;
    else if (ch.status === "WARNING") score += w * 0.5;
  }
  return { score, max };
}

function statusIcon(s: Status) {
  if (s === "PASS") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "WARNING") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}
function statusBadge(s: Status) {
  const map: Record<Status, string> = {
    PASS: "bg-emerald-100 text-emerald-700 border-emerald-200",
    WARNING: "bg-amber-100 text-amber-700 border-amber-200",
    FAIL: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold", map[s])}>
      {statusIcon(s)} {s}
    </span>
  );
}

function SystemReadinessPage() {
  const runChecks = useServerFn(runSystemReadinessChecks);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["system-readiness"],
    queryFn: () => runChecks(),
  });

  const [showReport, setShowReport] = useState(false);

  const summary = useMemo(() => {
    if (!data) return null;
    let pass = 0, warn = 0, fail = 0, totalScore = 0, totalMax = 0;
    const perSection: Array<{ id: string; title: string; score: number; max: number; pct: number }> = [];
    for (const sec of data) {
      const { score, max } = sectionScore(sec);
      totalScore += score; totalMax += max;
      perSection.push({ id: sec.id, title: sec.title, score, max, pct: max ? Math.round((score / max) * 100) : 0 });
      for (const ch of sec.checks) {
        if (ch.status === "PASS") pass++;
        else if (ch.status === "WARNING") warn++;
        else fail++;
      }
    }
    const readiness = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;
    return { pass, warn, fail, readiness, perSection };
  }, [data]);

  const criticals = useMemo(
    () => (data ?? []).flatMap((s) => s.checks.filter((c) => c.status === "FAIL").map((c) => ({ section: s.title, ...c }))),
    [data],
  );
  const warnings = useMemo(
    () => (data ?? []).flatMap((s) => s.checks.filter((c) => c.status === "WARNING").map((c) => ({ section: s.title, ...c }))),
    [data],
  );

  if (isLoading || !data || !summary) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scoreColor =
    summary.readiness >= 85 ? "text-emerald-600" :
    summary.readiness >= 60 ? "text-amber-600" : "text-destructive";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">جاهزية النظام للتشغيل</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختبار شامل وقراءة فقط لحالة البوابة قبل الإطلاق التجريبي.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-primary hover:bg-secondary"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> إعادة الفحص
          </button>
          <button
            onClick={() => setShowReport((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <FileDown className="h-4 w-4" /> {showReport ? "إخفاء التقرير" : "Generate Readiness Report"}
          </button>
        </div>
      </div>

      {/* Score + counts */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card md:col-span-2">
          <div className="text-xs font-semibold text-muted-foreground">نسبة الجاهزية</div>
          <div className={cn("mt-2 font-display text-5xl font-extrabold", scoreColor)}>
            {summary.readiness}%
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full",
                summary.readiness >= 85 ? "bg-emerald-500" :
                summary.readiness >= 60 ? "bg-amber-500" : "bg-destructive",
              )}
              style={{ width: `${summary.readiness}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold text-emerald-700">PASS</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-emerald-700">{summary.pass}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-semibold text-amber-700">WARNING</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-amber-700">{summary.warn}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 md:col-span-1">
          <div className="text-xs font-semibold text-red-700">FAIL</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-red-700">{summary.fail}</div>
        </div>
      </div>

      {/* Section scores */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4">جاهزية الأقسام</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.perSection.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="text-xs font-bold text-primary">{p.title}</div>
              <div className="mt-2 text-2xl font-extrabold text-primary">{p.pct}%</div>
              <div className="text-[11px] text-muted-foreground">{p.score.toFixed(1)} / {p.max}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Checklist */}
      {data.map((sec) => (
        <section key={sec.id} className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display text-base font-bold text-primary mb-4">{sec.title}</h2>
          <div className="divide-y divide-border">
            {sec.checks.map((ch) => (
              <div key={ch.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-primary">{ch.label}</div>
                  {ch.detail && <div className="text-[11px] text-muted-foreground">{ch.detail}</div>}
                </div>
                {statusBadge(ch.status)}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Report */}
      {showReport && (
        <section className="rounded-xl border-2 border-primary bg-card p-6 shadow-card space-y-5">
          <h2 className="font-display text-lg font-extrabold text-primary">Readiness Report</h2>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div><span className="font-bold text-primary">Readiness Score:</span> {summary.readiness}%</div>
            <div><span className="font-bold text-primary">PASS:</span> {summary.pass}</div>
            <div><span className="font-bold text-primary">WARNING:</span> {summary.warn} &nbsp;|&nbsp; <span className="font-bold text-primary">FAIL:</span> {summary.fail}</div>
          </div>

          <div>
            <h3 className="font-bold text-destructive mb-2">المشاكل الحرجة ({criticals.length})</h3>
            {criticals.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مشاكل حرجة.</p>
            ) : (
              <ul className="list-disc pr-5 space-y-1 text-sm">
                {criticals.map((c, i) => (
                  <li key={i}><span className="font-semibold">[{c.section}]</span> {c.label} {c.detail ? `— ${c.detail}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-bold text-amber-700 mb-2">المشاكل المتوسطة ({warnings.length})</h3>
            {warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تحذيرات.</p>
            ) : (
              <ul className="list-disc pr-5 space-y-1 text-sm">
                {warnings.map((c, i) => (
                  <li key={i}><span className="font-semibold">[{c.section}]</span> {c.label} {c.detail ? `— ${c.detail}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-bold text-primary mb-2">التحسينات المقترحة</h3>
            <ul className="list-disc pr-5 space-y-1 text-sm text-muted-foreground">
              <li>التأكد من وجود مدير احتياطي قبل الإطلاق.</li>
              <li>اختبار دورة كاملة (طلب → اعتماد → إشعار) قبل الانطلاق التجريبي.</li>
              <li>تفعيل سياسة كلمات مرور قوية وإلزام تغييرها عند أول دخول.</li>
              <li>مراجعة الرسوم وسندات الدفع قبل بدء الفصل الدراسي.</li>
              <li>إضافة نسخ احتياطي دوري للقاعدة قبل الإطلاق.</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
