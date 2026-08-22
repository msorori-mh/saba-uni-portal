/**
 * PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F
 * Arabic RTL surfaces for scoped HR reports, safe integration provenance,
 * AAL2 state and the redacted unified audit feed.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  History,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  NO_GOVERNANCE_CAPABILITIES,
  fetchGovernanceAudit,
  fetchGovernanceCapabilities,
  fetchGovernanceReport,
  fetchIntegrationHealth,
  fetchOwnIntegrationProvenance,
  recordGovernanceReportExport,
} from "@/lib/staff-self-service-governance";

export const STAFF_GOVERNANCE_UI_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string | null) {
  if (!value) return "لا توجد مزامنة بعد";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(parsed);
}

function Card({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      dir="rtl"
      data-testid={testId}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function MfaRequired() {
  return (
    <div
      dir="rtl"
      data-testid="staff-02f-mfa-required"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
    >
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-bold">يلزم التحقق متعدد العوامل</div>
          <p className="mt-1 text-xs leading-6">
            أكمل MFA ثم أعد تحميل الصفحة لعرض التقارير والتكاملات وسجل
            التدقيق. الإخفاء هنا مساعد فقط؛ الخادم يرفض الطلب عند AAL1.
          </p>
        </div>
      </div>
    </div>
  );
}

export function StaffGovernanceEmployeePanel() {
  const capabilities = useQuery({
    queryKey: ["staff-02f", "capabilities"],
    queryFn: fetchGovernanceCapabilities,
  });
  const provenance = useQuery({
    queryKey: ["staff-02f", "own-provenance"],
    queryFn: fetchOwnIntegrationProvenance,
  });

  return (
    <div
      dir="rtl"
      data-testid="staff-governance-employee-panel"
      className="grid gap-4 lg:grid-cols-2"
    >
      <Card
        title="حماية الحساب والعمليات الحساسة"
        icon={<ShieldCheck className="h-4 w-4 text-primary" />}
        testId="staff-02f-employee-security"
      >
        {capabilities.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : capabilities.data?.mfa_verified ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            جلسة AAL2 موثقة للعمليات الحساسة
          </div>
        ) : (
          <MfaRequired />
        )}
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          لا تمنح هذه اللوحة صلاحية إدارية، ولا تغيّر حدود رؤية بيانات الرواتب
          أو الملفات الشخصية.
        </p>
      </Card>

      <Card
        title="مصدر بياناتي — قراءة آمنة"
        icon={<Database className="h-4 w-4 text-primary" />}
        testId="staff-02f-own-provenance"
      >
        {provenance.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : provenance.isError ? (
          <div className="text-xs text-destructive">
            تعذر قراءة حالة المصادر بأمان.
          </div>
        ) : (
          <div className="space-y-2">
            {(provenance.data ?? []).map((row) => (
              <div
                key={row.source_system}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"
              >
                <div>
                  <div className="font-bold text-foreground">
                    {row.source_system === "hr"
                      ? "نظام الموارد البشرية الحالي"
                      : "النظام المالي الحالي"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {dateLabel(row.last_synced_at)}
                  </div>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 font-bold">
                  {row.has_snapshot ? "متصل للقراءة" : "بانتظار المزامنة"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function StaffGovernanceAdminPanel() {
  const qc = useQueryClient();
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);
  const [periodFrom, setPeriodFrom] = useState(isoDate(monthAgo));
  const [periodTo, setPeriodTo] = useState(isoDate(today));
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const capabilityQuery = useQuery({
    queryKey: ["staff-02f", "capabilities"],
    queryFn: fetchGovernanceCapabilities,
  });
  const capabilities =
    capabilityQuery.data ?? NO_GOVERNANCE_CAPABILITIES;
  const secure = capabilities.mfa_verified;

  const report = useQuery({
    queryKey: ["staff-02f", "report", periodFrom, periodTo],
    queryFn: () => fetchGovernanceReport({ periodFrom, periodTo }),
    enabled: secure && capabilities.can_view_reports,
  });
  const integrations = useQuery({
    queryKey: ["staff-02f", "integration-health"],
    queryFn: fetchIntegrationHealth,
    enabled: secure && capabilities.can_view_integrations,
  });
  const audit = useQuery({
    queryKey: ["staff-02f", "audit"],
    queryFn: () => fetchGovernanceAudit(80),
    enabled: secure && capabilities.can_view_unified_audit,
  });

  const exportReport = async () => {
    if (!capabilities.can_export_reports || !secure || exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      await recordGovernanceReportExport({ periodFrom, periodTo });
      setNotice("تم توثيق عملية التصدير، ويمكن طباعة التقرير الآن.");
      window.print();
      await qc.invalidateQueries({ queryKey: ["staff-02f", "audit"] });
    } catch {
      setNotice("تعذر توثيق التصدير؛ لم يتم إنشاء ملف غير موثق.");
    } finally {
      setExporting(false);
    }
  };

  if (capabilityQuery.isLoading) {
    return (
      <div dir="rtl" className="grid min-h-28 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!secure) return <MfaRequired />;

  const hasAnyCapability =
    capabilities.can_view_reports ||
    capabilities.can_view_integrations ||
    capabilities.can_view_unified_audit;

  if (!hasAnyCapability) {
    return (
      <div
        dir="rtl"
        data-testid="staff-02f-no-capability"
        className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
      >
        لا توجد صلاحيات تقارير أو تكاملات أو تدقيق لهذا الحساب.
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      data-testid="staff-governance-admin-panel"
      className="space-y-4"
    >
      {capabilities.can_view_reports && (
        <Card
          title="تقارير الموارد البشرية والمديرين"
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          testId="staff-02f-scoped-reports"
        >
          <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
            <label className="text-xs font-bold">
              من
              <input
                type="date"
                value={periodFrom}
                onChange={(event) => setPeriodFrom(event.target.value)}
                className="mt-1 block rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-xs font-bold">
              إلى
              <input
                type="date"
                value={periodTo}
                onChange={(event) => setPeriodTo(event.target.value)}
                className="mt-1 block rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => report.refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold"
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </button>
            {capabilities.can_export_reports && (
              <button
                type="button"
                onClick={exportReport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                توثيق وطباعة
              </button>
            )}
          </div>
          {notice && <div className="mb-3 text-xs text-muted-foreground">{notice}</div>}
          {report.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : report.isError ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4" />
              تعذر تحميل التقرير ضمن النطاق المصرح.
            </div>
          ) : (report.data?.departments.length ?? 0) === 0 ? (
            <div className="rounded-lg bg-secondary p-4 text-xs text-muted-foreground">
              لا توجد بيانات ضمن الفترة والنطاق المحددين.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead className="bg-secondary">
                  <tr>
                    {[
                      "القسم",
                      "الموظفون",
                      "الإجازات",
                      "الحضور",
                      "التأخير",
                      "الإضافي",
                      "التدريب",
                      "الأداء",
                      "الترقيات",
                      "العهد",
                      "إخلاء الطرف",
                    ].map((title) => (
                      <th key={title} className="px-3 py-2 text-right">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.data?.departments ?? []).map((row) => (
                    <tr key={row.department_id} className="border-t border-border">
                      <td className="px-3 py-3 font-bold">{row.department_name_ar}</td>
                      <td className="px-3 py-3">{row.employees}</td>
                      <td className="px-3 py-3">
                        {row.approved_leave_requests}/{row.leave_requests}
                      </td>
                      <td className="px-3 py-3">{row.attendance_days}</td>
                      <td className="px-3 py-3">{row.late_days}</td>
                      <td className="px-3 py-3">{row.approved_overtime_hours}</td>
                      <td className="px-3 py-3">{row.completed_training}</td>
                      <td className="px-3 py-3">{row.finalized_evaluations}</td>
                      <td className="px-3 py-3">{row.promotions}</td>
                      <td className="px-3 py-3">{row.active_custody}</td>
                      <td className="px-3 py-3">{row.open_clearance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {capabilities.can_view_integrations && (
        <Card
          title="سلامة تكاملات القراءة"
          icon={<Database className="h-4 w-4 text-primary" />}
          testId="staff-02f-integration-health"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {(integrations.data ?? []).map((row) => (
              <div key={row.source_system} className="rounded-lg border border-border p-3">
                <div className="font-bold">
                  {row.source_system === "hr"
                    ? "الموارد البشرية"
                    : "النظام المالي"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>السجلات: {row.records}</span>
                  <span>المتأخرة: {row.stale_records}</span>
                  <span className="col-span-2">{dateLabel(row.last_synced_at)}</span>
                </div>
              </div>
            ))}
          </div>
          {!integrations.isLoading && (integrations.data?.length ?? 0) === 0 && (
            <div className="text-xs text-muted-foreground">لا توجد لقطات تكامل بعد.</div>
          )}
        </Card>
      )}

      {capabilities.can_view_unified_audit && (
        <Card
          title="سجل التدقيق الموحد والمختزل"
          icon={<History className="h-4 w-4 text-primary" />}
          testId="staff-02f-unified-audit"
        >
          <div className="mb-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-950">
            لا يعرض هذا السجل metadata أو أسباباً حرة أو مسارات أو رموز تحقق أو
            قيم رواتب.
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-secondary">
                <tr>
                  {["الوقت", "المصدر", "الوحدة", "الحدث", "الممثل"].map((title) => (
                    <th key={title} className="px-3 py-2 text-right">{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(audit.data ?? []).map((row, index) => (
                  <tr
                    key={`${row.source}-${row.occurred_at}-${index}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-3">{dateLabel(row.occurred_at)}</td>
                    <td className="px-3 py-3">{row.source}</td>
                    <td className="px-3 py-3">{row.module}</td>
                    <td className="px-3 py-3 font-bold">{row.event_type}</td>
                    <td className="px-3 py-3 font-mono">
                      {row.actor_user_id?.slice(0, 8) ?? "system"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
