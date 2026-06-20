import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOperationsOverview, type OperationsOverview as Ops } from "@/lib/admin-operations.functions";
import { DataCleanupPanel } from "@/components/admin/DataCleanupPanel";
import { logOperationsEvent } from "@/lib/operations/ops-audit.functions";
import { cn } from "@/lib/utils";
import {
  Activity, Database, ShieldCheck, Bell, FileBadge, Wallet, BarChart3,
  HardDrive, Users, AlertTriangle, CheckCircle2, XCircle, Info,
  Server, Loader2, FileWarning, RotateCcw, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/admin/operations")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: OperationsPage,
});

type Health = "PASS" | "WARNING" | "FAIL";
type Severity = "INFO" | "WARNING" | "CRITICAL";

// -------- UI helpers --------
function badge(s: Health) {
  const map: Record<Health, string> = {
    PASS: "bg-emerald-100 text-emerald-700 border-emerald-200",
    WARNING: "bg-amber-100 text-amber-700 border-amber-200",
    FAIL: "bg-red-100 text-red-700 border-red-200",
  };
  const Icon = s === "PASS" ? CheckCircle2 : s === "WARNING" ? AlertTriangle : XCircle;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold", map[s])}>
      <Icon className="h-3 w-3" /> {s}
    </span>
  );
}

function HealthCard({ icon: Icon, title, status, detail }: {
  icon: any; title: string; status: Health; detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="font-display text-sm font-bold text-primary">{title}</div>
        </div>
        {badge(status)}
      </div>
      {detail && <div className="mt-2 text-xs text-muted-foreground leading-5">{detail}</div>}
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}
function fmtBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// -------- derived health computations --------
function computeHealth(d: Ops | undefined) {
  if (!d) return null;
  const db: Health = !d.db.reachable ? "FAIL" : d.db.audits24 < 0 ? "WARNING" : "PASS";
  const storage: Health = d.storage.some((b) => !b.exists) ? "FAIL"
    : d.storage.some((b) => !b.size_limit || !b.mime_types?.length) ? "WARNING" : "PASS";
  const auth: Health = d.auth.adminCount < 1 ? "FAIL"
    : (d.auth.adminCount < 2 || d.auth.sysAdminCount === 0 || d.auth.hibp === false) ? "WARNING" : "PASS";
  const notifs: Health = d.db.notifs < 0 ? "FAIL" : "PASS";
  const documents: Health = d.docs.all < 0 ? "FAIL" : "PASS";
  const financial: Health = d.finance.fees < 0 ? "FAIL"
    : d.finance.receiptsPending > 20 ? "WARNING" : "PASS";
  const reports: Health = d.reports.exports < 0 ? "FAIL" : "PASS";
  return { db, storage, auth, notifs, documents, financial, reports };
}

function buildAlerts(d: Ops | undefined): Array<{ severity: Severity; title: string; detail?: string }> {
  if (!d) return [];
  const a: Array<{ severity: Severity; title: string; detail?: string }> = [];
  if (d.auth.adminCount < 1) a.push({ severity: "CRITICAL", title: "لا يوجد حساب admin مفعّل", detail: "يجب إنشاء حساب admin واحد على الأقل" });
  else if (d.auth.adminCount < 2) a.push({ severity: "WARNING", title: "حساب admin واحد فقط", detail: "يُفضّل وجود حسابين على الأقل لمنع الإغلاق" });
  if (d.auth.sysAdminCount === 0) a.push({ severity: "WARNING", title: "لا يوجد system_admin", detail: "حسابات system_admin مطلوبة للعمليات الحرجة" });
  if (d.auth.hibp === false) a.push({ severity: "WARNING", title: "HIBP غير مفعّل", detail: "حماية كلمات المرور المسرّبة معطّلة" });
  if (d.issues.importsFailed > 0) a.push({ severity: "WARNING", title: `${d.issues.importsFailed} عملية استيراد فاشلة`, detail: "راجع سجل الاستيراد الجماعي" });
  if (d.issues.receiptsPending > 10) a.push({ severity: "WARNING", title: `${d.issues.receiptsPending} سند بانتظار المراجعة` });
  for (const b of d.storage) {
    if (!b.exists) a.push({ severity: "CRITICAL", title: `Bucket مفقود: ${b.id}` });
    else if (!b.size_limit || !b.mime_types?.length)
      a.push({ severity: "WARNING", title: `Bucket بلا حدود: ${b.id}`, detail: "حد الحجم أو أنواع MIME غير مضبوطة" });
  }
  a.push({ severity: "INFO", title: "التحقق اليدوي من النسخ الاحتياطي مطلوب", detail: "PITR وآخر استرجاع تجريبي يحتاجان توثيقاً يدوياً" });
  return a;
}

function severityBadge(s: Severity) {
  const map: Record<Severity, string> = {
    INFO: "bg-blue-100 text-blue-700 border-blue-200",
    WARNING: "bg-amber-100 text-amber-700 border-amber-200",
    CRITICAL: "bg-red-100 text-red-700 border-red-200",
  };
  const Icon = s === "CRITICAL" ? XCircle : s === "WARNING" ? AlertTriangle : Info;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold", map[s])}>
      <Icon className="h-3 w-3" /> {s}
    </span>
  );
}

// -------- runbook content --------
const RUNBOOK: Array<{ title: string; steps: string[] }> = [
  {
    title: "استرجاع قاعدة البيانات",
    steps: [
      "تأكيد آخر نسخة احتياطية ناجحة من Lovable Cloud → Database → Backups",
      "اختيار نقطة الاسترجاع (PITR إن كان مفعّلاً)",
      "تنفيذ الاسترجاع إلى مشروع منفصل واختبار الاتصال",
      "توثيق RTO/RPO الفعليّين بعد الاسترجاع",
    ],
  },
  {
    title: "استرجاع التخزين (Storage)",
    steps: [
      "تأكيد توفّر نسخة من سندات الدفع ومرفقات الطلبات",
      "إعادة رفع الملفات إلى Buckets المناسبة مع الحفاظ على المسار",
      "اختبار قراءة عيّنة عشوائية من الملفات بعد الاسترجاع",
    ],
  },
  {
    title: "استرجاع المصادقة",
    steps: [
      "التحقق من جدولَي auth.users و public.user_roles",
      "إعادة تفعيل HIBP وتعطيل الاشتراك العام إن لزم",
      "إعادة تعيين كلمات المرور لحسابات حرجة عبر Admin",
    ],
  },
  {
    title: "وصول طوارئ للمسؤول",
    steps: [
      "إنشاء مستخدم admin مؤقت عبر Lovable Cloud → Users",
      "إضافة الدور admin في public.user_roles يدوياً",
      "إلغاء الحساب فور انتهاء الطوارئ وتسجيل ذلك في سجل التدقيق",
    ],
  },
  {
    title: "استرجاع الوثائق الرسمية",
    steps: [
      "التحقق من جدول official_documents وأرقام الوثائق المسلسلة",
      "التأكد من صحة verification_code وروابط QR بعد الاسترجاع",
      "اختبار /verify-document لعيّنة من الوثائق",
    ],
  },
];

// -------- page --------
function OperationsPage() {
  const { tab: tabParam } = Route.useSearch();
  const log = useServerFn(logOperationsEvent);
  const fetchOps = useServerFn(getOperationsOverview);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["operations-overview"],
    queryFn: () => fetchOps(),
    staleTime: 30_000,
  });
  const validTabs = ["overview", "cleanup", "storage", "auth", "backup", "runbook", "alerts"] as const;
  type TabId = typeof validTabs[number];
  const initialTab = validTabs.includes(tabParam as TabId) ? (tabParam as TabId) : "overview";
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    log({ data: { action: "operations_viewed", page: "operations" } }).catch(() => {});
  }, [log]);

  useEffect(() => {
    if (tab === "backup") log({ data: { action: "backup_status_viewed", page: "operations", section: "backup" } }).catch(() => {});
    if (tab === "runbook") log({ data: { action: "recovery_runbook_viewed", page: "operations", section: "runbook" } }).catch(() => {});
  }, [tab, log]);

  const health = useMemo(() => computeHealth(data), [data]);
  const alerts = useMemo(() => buildAlerts(data), [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">مركز العمليات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مراقبة تشغيلية شاملة لصحة النظام، التخزين، المصادقة، النسخ الاحتياطي والاسترجاع.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary disabled:opacity-50"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border">
        {([
          ["overview", "نظرة عامة", Activity],
          ["cleanup", "تنظيف البيانات", Trash2],
          ["storage", "التخزين", HardDrive],
          ["auth", "المصادقة", ShieldCheck],
          ["backup", "النسخ الاحتياطي", Database],
          ["runbook", "خطة الاسترجاع", Server],
          ["alerts", `التنبيهات (${alerts.length})`, Bell],
        ] as const).map(([id, label, Icon]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as any)}
              className={cn(
                "inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-bold transition-all border-b-2",
                active ? "border-gold text-primary bg-card"
                       : "border-transparent text-muted-foreground hover:text-primary hover:bg-secondary/40",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
        })}
      </div>

      {tab === "cleanup" ? (
        <DataCleanupPanel />
      ) : isLoading || !data ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin me-2" /> جاري تحميل بيانات العمليات...
        </div>
      ) : tab === "overview" ? (
        <OverviewTab d={data} health={health!} />
      ) : tab === "storage" ? (
        <StorageTab d={data} />
      ) : tab === "auth" ? (
        <AuthTab d={data} />
      ) : tab === "backup" ? (
        <BackupTab />
      ) : tab === "runbook" ? (
        <RunbookTab />
      ) : (
        <AlertsTab alerts={alerts} />
      )}
    </div>
  );
}

function OverviewTab({ d, health }: { d: Ops; health: NonNullable<ReturnType<typeof computeHealth>> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HealthCard icon={Database} title="قاعدة البيانات" status={health.db}
          detail={`جداول: ${d.db.tables ?? "—"} · دوال: ${d.db.functions ?? "—"} · تدقيق 24س: ${Math.max(d.db.audits24, 0)}`} />
        <HealthCard icon={HardDrive} title="التخزين" status={health.storage}
          detail={`${d.storage.filter((b) => b.exists).length}/${d.storage.length} bucket مفعّل`} />
        <HealthCard icon={ShieldCheck} title="المصادقة" status={health.auth}
          detail={`Admin: ${d.auth.adminCount} · System: ${d.auth.sysAdminCount} · HIBP: ${d.auth.hibp ? "✓" : "✗"}`} />
        <HealthCard icon={Bell} title="الإشعارات" status={health.notifs}
          detail={`الكل: ${Math.max(d.db.notifs, 0)} · غير مقروء: ${Math.max(d.db.notifsUnread, 0)}`} />
        <HealthCard icon={FileBadge} title="الوثائق الرسمية" status={health.documents}
          detail={`إجمالي: ${Math.max(d.docs.all, 0)} · ملغاة: ${Math.max(d.docs.cancelled, 0)}`} />
        <HealthCard icon={Wallet} title="المالية" status={health.financial}
          detail={`رسوم: ${Math.max(d.finance.fees, 0)} · مدفوعات: ${Math.max(d.finance.payments, 0)} · سندات معلّقة: ${Math.max(d.finance.receiptsPending, 0)}`} />
        <HealthCard icon={BarChart3} title="التقارير" status={health.reports}
          detail={`عمليات تصدير مسجّلة: ${Math.max(d.reports.exports, 0)}`} />
        <HealthCard icon={Activity} title="النشاط الأخير" status="PASS"
          detail={`تدقيق: ${fmtDate(d.db.lastAudit)} · مالية: ${fmtDate(d.db.lastFinance)} · وثائق: ${fmtDate(d.db.lastDoc)}`} />
      </div>
    </div>
  );
}

function StorageTab({ d }: { d: Ops }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs">
            <tr>
              <th className="px-4 py-2 text-right font-bold">Bucket</th>
              <th className="px-4 py-2 text-right font-bold">الوصول</th>
              <th className="px-4 py-2 text-left font-bold">عدد الملفات</th>
              <th className="px-4 py-2 text-left font-bold">حد الحجم</th>
              <th className="px-4 py-2 text-right font-bold">أنواع MIME</th>
              <th className="px-4 py-2 text-right font-bold">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {d.storage.map((b) => {
              const status: Health = !b.exists ? "FAIL"
                : !b.size_limit || !b.mime_types?.length ? "WARNING" : "PASS";
              return (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{b.id}</td>
                  <td className="px-4 py-2 text-xs">{b.public ? "Public" : "Private"}</td>
                  <td className="px-4 py-2 text-left text-xs font-mono">
                    {b.file_count < 0 ? "—" : b.file_count >= 100 ? "100+" : b.file_count}
                  </td>
                  <td className="px-4 py-2 text-left text-xs font-mono">{fmtBytes(b.size_limit)}</td>
                  <td className="px-4 py-2 text-xs">{b.mime_types?.length ? b.mime_types.join(", ") : "—"}</td>
                  <td className="px-4 py-2 text-right">{badge(status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthTab({ d }: { d: Ops }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <HealthCard icon={Users} title="حسابات Admin" status={d.auth.adminCount < 1 ? "FAIL" : d.auth.adminCount < 2 ? "WARNING" : "PASS"}
        detail={`عدد: ${d.auth.adminCount} (الموصى به ≥ 2)`} />
      <HealthCard icon={ShieldCheck} title="حسابات System Admin" status={d.auth.sysAdminCount === 0 ? "WARNING" : "PASS"}
        detail={`عدد: ${d.auth.sysAdminCount}`} />
      <HealthCard icon={ShieldCheck} title="HIBP" status={d.auth.hibp === false ? "WARNING" : d.auth.hibp ? "PASS" : "WARNING"}
        detail={d.auth.hibp == null ? "غير معروف — RPC لم يُرجع قيمة" : d.auth.hibp ? "مفعّل" : "غير مفعّل"} />
      <HealthCard icon={ShieldCheck} title="تعطيل التسجيل العام" status={d.auth.signupDisabled ? "PASS" : "WARNING"}
        detail={d.auth.signupDisabled == null ? "غير معروف" : d.auth.signupDisabled ? "معطّل" : "مفعّل"} />
      <HealthCard icon={ShieldCheck} title="تعطيل المجهول" status={d.auth.anonDisabled ? "PASS" : "WARNING"}
        detail={d.auth.anonDisabled == null ? "غير معروف" : d.auth.anonDisabled ? "معطّل" : "مفعّل"} />
      <HealthCard icon={Users} title="يجب تغيير كلمة المرور" status="PASS"
        detail={`أعضاء هيئة تدريس: ${Math.max(d.auth.mustChange, 0)}`} />
    </div>
  );
}

function BackupTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <div className="font-bold">Manual Verification Required</div>
          <p className="mt-1 leading-6">
            بيانات النسخ الاحتياطي و PITR وآخر استرجاع تجريبي غير متاحة عبر الـ API.
            يجب التحقق منها يدوياً من لوحة Lovable Cloud → Database → Backups.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HealthCard icon={Database} title="مزوّد النسخ" status="PASS" detail="Lovable Cloud (Supabase)" />
        <HealthCard icon={Database} title="تكرار النسخ" status="PASS" detail="يومي تلقائي (مُدار)" />
        <HealthCard icon={FileWarning} title="PITR" status="WARNING" detail="يحتاج تأكيد يدوي" />
        <HealthCard icon={FileWarning} title="آخر استرجاع تجريبي" status="WARNING" detail="غير موثّق — يحتاج تشغيل" />
        <HealthCard icon={Database} title="سياسة الاحتفاظ" status="PASS" detail="حسب خطة Cloud المُختارة" />
        <HealthCard icon={HardDrive} title="نسخ Storage" status="WARNING" detail="يجب تأكيد تغطية ملفات Buckets" />
      </div>
    </div>
  );
}

function RunbookTab() {
  return (
    <div className="space-y-4">
      {RUNBOOK.map((sec) => (
        <section key={sec.title} className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-display text-base font-bold text-primary mb-3">{sec.title}</h2>
          <ol className="space-y-2 text-sm">
            {sec.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-gradient text-xs font-bold text-primary">{i + 1}</span>
                <span className="leading-6 text-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function AlertsTab({ alerts }: { alerts: Array<{ severity: Severity; title: string; detail?: string }> }) {
  // Order: CRITICAL > WARNING > INFO (then preserve original order)
  const order: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const sorted = [...alerts].sort((a, b) => order[a.severity] - order[b.severity]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center text-sm text-emerald-800">
        <CheckCircle2 className="inline h-5 w-5 me-2" /> لا توجد تنبيهات تشغيلية حالياً.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <ul className="divide-y divide-border">
        {sorted.map((a, i) => (
          <li key={i} className="flex items-start justify-between gap-3 p-4">
            <div>
              <div className="font-bold text-sm text-primary">{a.title}</div>
              {a.detail && <div className="mt-1 text-xs text-muted-foreground leading-5">{a.detail}</div>}
            </div>
            {severityBadge(a.severity)}
          </li>
        ))}
      </ul>
    </div>
  );
}
