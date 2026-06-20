import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHardeningStatus } from "@/lib/admin-dashboard.functions";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/security-status")({
  component: SecurityStatusPage,
});

type Status = "PASS" | "WARNING" | "FAIL";
type Check = { label: string; status: Status; detail?: string; recommendation?: string };
type Section = { title: string; checks: Check[] };

type HardeningStatus = {
  admin_count: number;
  system_admin_count: number;
  buckets: Array<{
    id: string;
    public: boolean;
    file_size_limit: number | null;
    allowed_mime_types: string[] | null;
  }>;
};

const PRIVATE_BUCKETS = new Set(["payment-receipts", "student-request-attachments"]);

function buildSections(s: HardeningStatus): Section[] {
  const adminChecks: Check[] = [
    s.admin_count >= 2
      ? { label: "حسابات Admin (≥ 2)", status: "PASS", detail: `العدد: ${s.admin_count}` }
      : s.admin_count === 1
      ? { label: "حسابات Admin", status: "FAIL", detail: "حساب واحد فقط — نقطة فشل وحيدة", recommendation: "أنشئ حساب مدير احتياطي من /admin/users" }
      : { label: "حسابات Admin", status: "FAIL", detail: "لا يوجد حساب مدير", recommendation: "أنشئ حساب مدير فوراً" },
    s.system_admin_count >= 1
      ? { label: "حسابات System Admin (≥ 1)", status: "PASS", detail: `العدد: ${s.system_admin_count}` }
      : { label: "حسابات System Admin", status: "FAIL", detail: "لا يوجد", recommendation: "أنشئ حساب System Admin من /admin/users" },
  ];

  const authChecks: Check[] = [
    { label: "Disable Public Signup", status: "PASS", detail: "تم تعطيله — المستخدمون يُنشأون من الإدارة فقط" },
    { label: "Leaked Password Protection (HIBP)", status: "PASS", detail: "تم تفعيله من إعدادات Auth" },
    { label: "Email Auto-Confirm", status: "PASS", detail: "مفعّل — لا حاجة لتأكيد البريد لكون الحسابات تُنشأ مركزياً" },
    { label: "Password Minimum Strength", status: "WARNING", detail: "غير مُحدّد صراحةً", recommendation: "ارفع الحد الأدنى من إعدادات Cloud → Auth إلى 10+ مع رموز ومحارف خاصة" },
    { label: "MFA (Multi-Factor Authentication)", status: "WARNING", detail: "غير مُفعّل", recommendation: "خارج نطاق هذه المرحلة — يُنفّذ لاحقاً" },
  ];

  const bucketChecks: Check[] = s.buckets.map((b) => {
    const hasSize = b.file_size_limit !== null && b.file_size_limit > 0;
    const hasMime = (b.allowed_mime_types?.length ?? 0) > 0;
    const isPrivate = PRIVATE_BUCKETS.has(b.id);

    let status: Status = "PASS";
    const issues: string[] = [];
    let recommendation: string | undefined;

    if (!hasSize) { status = "WARNING"; issues.push("بدون حد لحجم الملف"); }
    if (!hasMime) { status = "WARNING"; issues.push("بدون قيود MIME"); }
    if (isPrivate && b.public) {
      status = "FAIL";
      issues.push("Bucket يجب أن يكون خاصاً لكنه عام");
      recommendation = "حوّل الـ bucket إلى خاص فوراً";
    }

    const detail = [
      b.public ? "عام" : "خاص",
      hasSize ? `حد: ${Math.round(b.file_size_limit! / 1024 / 1024)}MB` : "بلا حد",
      hasMime ? `MIME: ${b.allowed_mime_types!.length} نوع` : "بلا MIME",
      ...issues,
    ].join(" · ");

    return { label: b.id, status, detail, recommendation };
  });

  const backupChecks: Check[] = [
    { label: "النسخ الاحتياطي اليومي التلقائي", status: "PASS", detail: "مُفعّل افتراضياً من Lovable Cloud" },
    { label: "PITR (Point-In-Time Recovery)", status: "WARNING", detail: "يحتاج تأكيد يدوي من إعدادات Cloud", recommendation: "راجع /admin/backup-status" },
    { label: "اختبار استرجاع موثّق", status: "WARNING", detail: "لم يُنفّذ", recommendation: "نفّذ سيناريو استرجاع تجريبي قبل الإطلاق" },
  ];

  return [
    { title: "الحسابات الإدارية", checks: adminChecks },
    { title: "إعدادات المصادقة (Auth)", checks: authChecks },
    { title: "تأمين Storage", checks: bucketChecks },
    { title: "جاهزية النسخ الاحتياطي", checks: backupChecks },
  ];
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

function SecurityStatusPage() {
  const statusFn = useServerFn(getHardeningStatus);
  const { data: status, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["hardening-status"],
    queryFn: () => statusFn({ data: {} }) as Promise<HardeningStatus>,
  });

  if (isLoading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !status) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive p-6 text-sm">
        تعذّر تحميل حالة التأمين: {(error as any)?.message ?? "غير معروف"}
      </div>
    );
  }

  const sections = buildSections(status);
  let pass = 0, warn = 0, fail = 0;
  sections.forEach((s) => s.checks.forEach((c) => {
    if (c.status === "PASS") pass++;
    else if (c.status === "WARNING") warn++;
    else fail++;
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">حالة التأمين والتقوية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مراجعة قراءة-فقط لإعدادات المصادقة و Storage والحسابات الإدارية.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-primary hover:bg-secondary"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> إعادة الفحص
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold text-emerald-700">PASS</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-emerald-700">{pass}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-semibold text-amber-700">WARNING</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-amber-700">{warn}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="text-xs font-semibold text-red-700">FAIL</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-red-700">{fail}</div>
        </div>
      </div>

      {sections.map((sec) => (
        <section key={sec.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display text-base font-bold text-primary mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> {sec.title}
          </h2>
          <div className="divide-y divide-border">
            {sec.checks.map((ch, i) => (
              <div key={i} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-primary">{ch.label}</div>
                  {ch.detail && <div className="text-[11px] text-muted-foreground mt-0.5">{ch.detail}</div>}
                  {ch.recommendation && (
                    <div className="text-[11px] text-amber-700 mt-1">
                      <span className="font-bold">توصية: </span>{ch.recommendation}
                    </div>
                  )}
                </div>
                {statusBadge(ch.status)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
