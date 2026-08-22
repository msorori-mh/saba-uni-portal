/**
 * PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
 * Administrative live workbench. Every section is RLS-driven: the client never
 * decides authority — it only renders the rows the database actually returned.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Box,
  ClipboardList,
  History,
  Loader2,
  Mail,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  STAFF_SERVICE_NO_CAPABILITIES,
  fetchStaffApprovalSteps,
  fetchStaffCareerHistory,
  fetchStaffCorrespondence,
  fetchStaffCorrespondenceReceiptSummary,
  fetchStaffCustody,
  fetchStaffPayrollStatements,
  fetchStaffReadAuditEvents,
  fetchStaffServiceCapabilities,
  fetchStaffServiceRequestRows,
} from "@/lib/staff-self-service-read";

export const STAFF_SELF_SERVICE_LIVE_WORKBENCH_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "مرسل",
  in_review: "قيد الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

function money(value: number, currency = "YER") {
  return `${new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(value)} ${currency}`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(parsed);
}

function Section({
  title,
  icon,
  testId,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      dir="rtl"
      data-testid={testId}
      className="rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-primary">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function StaffSelfServiceLiveWorkbench() {
  const capabilitiesQuery = useQuery({
    queryKey: ["staff-02d", "capabilities"],
    queryFn: fetchStaffServiceCapabilities,
  });
  const capabilities = capabilitiesQuery.data ?? STAFF_SERVICE_NO_CAPABILITIES;
  const requests = useQuery({
    queryKey: ["staff-02d", "wb", "requests"],
    queryFn: fetchStaffServiceRequestRows,
  });
  const steps = useQuery({
    queryKey: ["staff-02d", "wb", "steps"],
    queryFn: fetchStaffApprovalSteps,
  });
  const payroll = useQuery({
    queryKey: ["staff-02d", "wb", "payroll"],
    queryFn: fetchStaffPayrollStatements,
    enabled: capabilities.can_view_payroll_scope,
  });
  const career = useQuery({
    queryKey: ["staff-02d", "wb", "career"],
    queryFn: fetchStaffCareerHistory,
  });
  const letters = useQuery({
    queryKey: ["staff-02d", "wb", "correspondence"],
    queryFn: fetchStaffCorrespondence,
  });
  const custody = useQuery({
    queryKey: ["staff-02d", "wb", "custody"],
    queryFn: fetchStaffCustody,
  });
  const audit = useQuery({
    queryKey: ["staff-02d", "wb", "audit"],
    queryFn: () => fetchStaffReadAuditEvents(50),
    enabled: capabilities.can_view_audit_scope,
  });
  const receiptSummary = useQuery({
    queryKey: ["staff-02d", "wb", "correspondence-receipts"],
    queryFn: fetchStaffCorrespondenceReceiptSummary,
  });

  const loading = requests.isLoading || capabilitiesQuery.isLoading;

  /**
   * Section visibility comes from an explicit boolean-only capability probe —
   * never inferred from the presence of another employee's row. RLS remains
   * the real defence line; this only avoids rendering unusable sections.
   */
  const financeScope = capabilities.can_view_payroll_scope;
  const scopedPayroll = financeScope ? (payroll.data ?? []) : [];

  return (
    <div
      dir="rtl"
      data-runtime-marker={STAFF_SELF_SERVICE_LIVE_WORKBENCH_MARKER}
      data-testid="staff-self-service-live-workbench"
      className="space-y-4 print:hidden"
    >
      <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          مساحة العمل الإدارية الحية
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          يعرض هذا القسم فقط ما تسمح به صلاحياتك الفعلية في قاعدة البيانات.
        </p>
        {loading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            جاري تحميل النطاق المسموح...
          </div>
        )}
      </div>

      <Section
        title="الطلبات ضمن نطاقك"
        icon={<ClipboardList className="h-4 w-4" aria-hidden />}
        testId="staff-02d-wb-requests"
      >
        {(requests.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد طلبات ضمن نطاقك.</p>
        ) : (
          <ul className="space-y-2">
            {(requests.data ?? []).map((request) => (
              <li key={request.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div className="font-bold text-foreground">
                  {request.request_no} — {request.service_type}
                </div>
                <div className="text-muted-foreground">
                  الحالة: {STATUS_LABELS[request.status] ?? request.status} • الخطوة:{" "}
                  {request.current_step} • {dateLabel(request.submitted_at)} • خطوات مرتبطة:{" "}
                  {(steps.data ?? []).filter((step) => step.request_id === request.id).length}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="الرواتب (مالية/إدارة عليا فقط)"
        icon={<Wallet className="h-4 w-4" aria-hidden />}
        testId="staff-02d-wb-payroll"
      >
        {!financeScope ? (
          <p className="text-xs text-muted-foreground" data-testid="staff-02d-wb-payroll-denied">
            لا تملك صلاحية الاطلاع على بيانات الرواتب.
          </p>
        ) : scopedPayroll.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="staff-02d-wb-payroll-empty">
            {payroll.isLoading
              ? "جاري تحميل كشوف الرواتب ضمن نطاقك..."
              : "لا توجد كشوف رواتب ضمن نطاقك حاليًا."}
          </p>
        ) : (
          <>
            <div className="mb-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
              إجمالي الصافي ضمن نطاقك:{" "}
              {money(
                scopedPayroll.reduce((sum, statement) => sum + statement.net_amount, 0),
              )}
            </div>
            <ul className="space-y-2">
              {scopedPayroll.map((statement) => (
                <li key={statement.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <div className="font-bold text-foreground">
                    {dateLabel(statement.period_start)} — {dateLabel(statement.period_end)}
                  </div>
                  <div className="text-muted-foreground">
                    الأساسي: {money(statement.basic_salary, statement.currency_code)} • البدلات:{" "}
                    {money(statement.allowances_total, statement.currency_code)} • الاستقطاعات:{" "}
                    {money(statement.deductions_total, statement.currency_code)} • الصافي:{" "}
                    {money(statement.net_amount, statement.currency_code)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {capabilities.can_view_hr_scope && (
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="السجل الوظيفي ضمن نطاقك"
          icon={<History className="h-4 w-4" aria-hidden />}
          testId="staff-02d-wb-career"
        >
          <p className="mb-2 text-xs text-muted-foreground">
            عدد الحركات المتاحة: {(career.data ?? []).length}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(career.data ?? []).slice(0, 8).map((event) => (
              <li key={event.id}>
                {event.event_type} — {dateLabel(event.effective_on)}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="العهد ضمن نطاقك"
          icon={<Box className="h-4 w-4" aria-hidden />}
          testId="staff-02d-wb-custody"
        >
          <p className="mb-2 text-xs text-muted-foreground">
            إجمالي العهد: {(custody.data ?? []).length} • غير المُرجعة:{" "}
            {(custody.data ?? []).filter((item) => !item.returned_on).length}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(custody.data ?? []).slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.asset_name} — {item.asset_tag}
              </li>
            ))}
          </ul>
        </Section>
      </div>
      )}

      <Section
        title="التعاميم ضمن نطاقك"
        icon={<Mail className="h-4 w-4" aria-hidden />}
        testId="staff-02d-wb-correspondence"
      >
        {(letters.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد تعاميم ضمن نطاقك.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(letters.data ?? []).slice(0, 10).map((letter) => {
              const summary = (receiptSummary.data ?? []).find(
                (row) => row.correspondence_id === letter.id,
              );
              return (
                <li key={letter.id}>
                  {letter.reference_no} — {letter.title} ({dateLabel(letter.published_at)})
                  {" • "}
                  المستلمون: {summary?.recipients_total ?? 0} • المقروء:{" "}
                  {summary?.read_total ?? 0} • المؤكد: {summary?.acknowledged_total ?? 0}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {capabilities.can_view_audit_scope && (
      <Section
        title="سجل التدقيق غير القابل للتعديل"
        icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
        testId="staff-02d-wb-audit"
      >
        {(audit.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد أحداث تدقيق ضمن نطاقك.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(audit.data ?? []).map((event) => (
              <li key={event.id}>
                {event.event_type} • {event.subject_kind} • {dateLabel(event.occurred_at)}
              </li>
            ))}
          </ul>
        )}
      </Section>
      )}
    </div>
  );
}
