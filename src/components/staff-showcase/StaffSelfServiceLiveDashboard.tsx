/**
 * PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
 * Employee-facing live read dashboard (RTL, mobile-first, fail-closed).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Box,
  CalendarDays,
  CheckCircle2,
  Download,
  History,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import {
  acknowledgeCorrespondence,
  authorizePayrollStatementDownload,
  fetchStaffCareerHistory,
  fetchStaffCorrespondence,
  fetchStaffCustody,
  fetchStaffLeaveBalances,
  fetchStaffNotifications,
  fetchStaffPayrollStatements,
  fetchStaffTimelineEvents,
  markCorrespondenceRead,
  remainingLeaveDays,
  type StaffCorrespondenceWithReceipt,
} from "@/lib/staff-self-service-read";
import { generateStaffPayrollStatementPdf } from "@/lib/staff/staff-payroll-pdf.functions";

export const STAFF_SELF_SERVICE_LIVE_READ_UI_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D";

const LEAVE_LABELS: Record<string, string> = {
  annual: "سنوية",
  sick: "مرضية",
  emergency: "اضطرارية",
  unpaid: "بدون راتب",
  other: "أخرى",
};

const CAREER_LABELS: Record<string, string> = {
  appointment: "تعيين",
  grade_change: "تغيير درجة",
  title_change: "تغيير مسمى",
  promotion: "ترقية",
  adjustment: "تسوية",
  transfer: "نقل",
};

const CONDITION_LABELS: Record<string, string> = {
  new: "جديدة",
  good: "جيدة",
  needs_maintenance: "تحتاج صيانة",
  damaged: "تالفة",
  returned: "مُرجعة",
};

const IMPORTANCE_LABELS: Record<string, string> = {
  normal: "عادي",
  important: "مهم",
  urgent: "عاجل",
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

function Panel({
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

function StateBlock({
  loading,
  error,
  empty,
  emptyLabel,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        جاري التحميل...
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {(error as Error).message}
      </div>
    );
  }
  if (empty) {
    return (
      <p className="py-3 text-xs text-muted-foreground">{emptyLabel}</p>
    );
  }
  return null;
}

export function StaffSelfServiceLiveDashboard() {
  const leave = useQuery({
    queryKey: ["staff-02d", "leave"],
    queryFn: fetchStaffLeaveBalances,
  });
  const payroll = useQuery({
    queryKey: ["staff-02d", "payroll"],
    queryFn: fetchStaffPayrollStatements,
  });
  const career = useQuery({
    queryKey: ["staff-02d", "career"],
    queryFn: fetchStaffCareerHistory,
  });
  const letters = useQuery({
    queryKey: ["staff-02d", "correspondence"],
    queryFn: fetchStaffCorrespondence,
  });
  const custody = useQuery({
    queryKey: ["staff-02d", "custody"],
    queryFn: fetchStaffCustody,
  });
  const timeline = useQuery({
    queryKey: ["staff-02d", "timeline"],
    queryFn: () => fetchStaffTimelineEvents(40),
  });
  const notifications = useQuery({
    queryKey: ["staff-02d", "notifications"],
    queryFn: () => fetchStaffNotifications(30),
  });

  const refreshAll = () => {
    void leave.refetch();
    void payroll.refetch();
    void career.refetch();
    void letters.refetch();
    void custody.refetch();
    void timeline.refetch();
    void notifications.refetch();
  };

  return (
    <div
      dir="rtl"
      data-runtime-marker={STAFF_SELF_SERVICE_LIVE_READ_UI_MARKER}
      data-testid="staff-self-service-live-read-dashboard"
      className="space-y-4 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-primary/25 bg-primary/5 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
            <BadgeCheck className="h-5 w-5" aria-hidden />
            لوحة البيانات الحية للموظف
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            جميع البيانات تُقرأ مباشرة ضمن صلاحياتك، ولا تُعرض أي بيانات خارج نطاقك.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-bold text-primary"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          تحديث الكل
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="أرصدة الإجازات"
          icon={<CalendarDays className="h-4 w-4" aria-hidden />}
          testId="staff-02d-leave"
        >
          <StateBlock
            loading={leave.isLoading}
            error={leave.error}
            empty={(leave.data ?? []).length === 0}
            emptyLabel="لا توجد أرصدة إجازات مسجلة."
          />
          <ul className="space-y-2">
            {(leave.data ?? []).map((balance) => (
              <li
                key={balance.id}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs"
              >
                <span className="font-bold text-foreground">
                  {LEAVE_LABELS[balance.leave_type] ?? balance.leave_type} — {balance.balance_year}
                </span>
                <span className="font-extrabold text-primary">
                  المتبقي: {remainingLeaveDays(balance).toFixed(2)} يوم
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="السجل الوظيفي والترقيات"
          icon={<History className="h-4 w-4" aria-hidden />}
          testId="staff-02d-career"
        >
          <StateBlock
            loading={career.isLoading}
            error={career.error}
            empty={(career.data ?? []).length === 0}
            emptyLabel="لا توجد حركات وظيفية مسجلة."
          />
          <ol className="space-y-2">
            {(career.data ?? []).map((event) => (
              <li key={event.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div className="font-bold text-foreground">
                  {CAREER_LABELS[event.event_type] ?? event.event_type} — {dateLabel(event.effective_on)}
                </div>
                <div className="text-muted-foreground">
                  {[event.job_title, event.grade, event.decision_reference]
                    .filter(Boolean)
                    .join(" • ") || "—"}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <PayrollPanel
        loading={payroll.isLoading}
        error={payroll.error}
        statements={payroll.data ?? []}
      />

      <CorrespondencePanel
        loading={letters.isLoading}
        error={letters.error}
        letters={letters.data ?? []}
        onChanged={() => void letters.refetch()}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="العهد"
          icon={<Box className="h-4 w-4" aria-hidden />}
          testId="staff-02d-custody"
        >
          <StateBlock
            loading={custody.isLoading}
            error={custody.error}
            empty={(custody.data ?? []).length === 0}
            emptyLabel="لا توجد عهد مسجلة باسمك."
          />
          <ul className="space-y-2">
            {(custody.data ?? []).map((item) => (
              <li key={item.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div className="font-bold text-foreground">
                  {item.asset_name} — {item.asset_tag}
                </div>
                <div className="text-muted-foreground">
                  التسلسلي: {item.serial_number ?? "—"} • الحالة:{" "}
                  {CONDITION_LABELS[item.condition] ?? item.condition} • التسليم:{" "}
                  {dateLabel(item.delivered_on)}
                  {item.returned_on ? ` • الإرجاع: ${dateLabel(item.returned_on)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="الإشعارات"
          icon={<Bell className="h-4 w-4" aria-hidden />}
          testId="staff-02d-notifications"
        >
          <StateBlock
            loading={notifications.isLoading}
            error={notifications.error}
            empty={(notifications.data ?? []).length === 0}
            emptyLabel="لا توجد إشعارات."
          />
          <ul className="space-y-2">
            {(notifications.data ?? []).map((item) => (
              <li key={item.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div className="font-bold text-foreground">{item.template_key}</div>
                <div className="text-muted-foreground">
                  القناة: {item.channel} • الحالة: {item.status} • {dateLabel(item.created_at)}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="الخط الزمني للطلبات"
        icon={<Inbox className="h-4 w-4" aria-hidden />}
        testId="staff-02d-timeline"
      >
        <StateBlock
          loading={timeline.isLoading}
          error={timeline.error}
          empty={(timeline.data ?? []).length === 0}
          emptyLabel="لا توجد أحداث بعد."
        />
        <ol className="space-y-2">
          {(timeline.data ?? []).map((event) => (
            <li key={event.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <div className="font-bold text-foreground">{event.event_type}</div>
              <div className="text-muted-foreground">
                {(event.from_status ?? "—")} ← {(event.to_status ?? "—")} •{" "}
                {dateLabel(event.occurred_at)}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function PayrollPanel({
  loading,
  error,
  statements,
}: {
  loading: boolean;
  error: unknown;
  statements: Awaited<ReturnType<typeof fetchStaffPayrollStatements>>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function download(statementId: string) {
    setBusyId(statementId);
    setDownloadError(null);
    try {
      await authorizePayrollStatementDownload(statementId);
      const result = await generateStaffPayrollStatementPdf({
        data: { statementId },
      });
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof Error
          ? err.message
          : "تعذر إصدار كشف الراتب بأمان.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="كشوف الرواتب"
      icon={<Wallet className="h-4 w-4" aria-hidden />}
      testId="staff-02d-payroll"
    >
      <StateBlock
        loading={loading}
        error={error}
        empty={statements.length === 0}
        emptyLabel="لا توجد كشوف رواتب متاحة لك."
      />
      {downloadError && (
        <div
          role="alert"
          className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
        >
          {downloadError}
        </div>
      )}
      <div className="space-y-3">
        {statements.map((statement) => (
          <article
            key={statement.id}
            className="rounded-lg border border-border bg-muted/30 p-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-foreground">
                {dateLabel(statement.period_start)} — {dateLabel(statement.period_end)}
              </span>
              <button
                type="button"
                onClick={() => void download(statement.id)}
                disabled={busyId === statement.id || !statement.published_at}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-1.5 font-bold text-primary disabled:opacity-50"
              >
                {busyId === statement.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                تنزيل PDF
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">الأساسي</dt>
                <dd className="font-bold">{money(statement.basic_salary, statement.currency_code)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">البدلات</dt>
                <dd className="font-bold">{money(statement.allowances_total, statement.currency_code)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الاستقطاعات</dt>
                <dd className="font-bold">{money(statement.deductions_total, statement.currency_code)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الصافي</dt>
                <dd className="font-extrabold text-primary">
                  {money(statement.net_amount, statement.currency_code)}
                </dd>
              </div>
            </dl>
            {statement.components.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {statement.components.map((component) => (
                  <li key={component.id}>
                    {component.component_type === "allowance" ? "بدل" : "استقطاع"}:{" "}
                    {component.label_ar} — {money(component.amount, statement.currency_code)}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function CorrespondencePanel({
  loading,
  error,
  letters,
  onChanged,
}: {
  loading: boolean;
  error: unknown;
  letters: StaffCorrespondenceWithReceipt[];
  onChanged: () => void;
}) {
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = term.trim();
    return letters.filter((letter) => {
      const archived = Boolean(letter.receipt?.acknowledged_at);
      if (archived !== showArchived) return false;
      if (!needle) return true;
      return (
        letter.title.includes(needle) ||
        letter.reference_no.includes(needle) ||
        letter.archive_category.includes(needle)
      );
    });
  }, [letters, term, showArchived]);

  async function run(
    action: "read" | "ack",
    correspondenceId: string,
  ) {
    setBusyId(correspondenceId);
    setActionError(null);
    try {
      if (action === "read") await markCorrespondenceRead(correspondenceId);
      else await acknowledgeCorrespondence(correspondenceId);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="التعاميم والمراسلات"
      icon={<Mail className="h-4 w-4" aria-hidden />}
      testId="staff-02d-correspondence"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">بحث في التعاميم</span>
          <Search
            className="pointer-events-none absolute inset-y-0 right-2 my-auto h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="بحث بالعنوان أو المرجع أو التصنيف"
            className="w-full rounded-lg border border-border bg-background py-2 pe-3 ps-8 text-xs"
          />
        </label>
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="rounded-lg border border-border px-3 py-2 text-xs font-bold"
          aria-pressed={showArchived}
        >
          {showArchived ? "عرض الوارد" : "عرض الأرشيف"}
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
        >
          {actionError}
        </div>
      )}

      <StateBlock
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={showArchived ? "لا توجد تعاميم مؤرشفة." : "لا توجد تعاميم واردة."}
      />

      <ul className="space-y-2">
        {filtered.map((letter) => (
          <li
            key={letter.id}
            className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-foreground">{letter.title}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
                {IMPORTANCE_LABELS[letter.importance] ?? letter.importance}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              المرجع: {letter.reference_no} • التصنيف: {letter.archive_category} •{" "}
              {dateLabel(letter.published_at)}
            </div>
            <div className="mt-1 text-muted-foreground">
              الاستلام: {dateLabel(letter.receipt?.received_at ?? null)} • القراءة:{" "}
              {dateLabel(letter.receipt?.read_at ?? null)} • الإقرار:{" "}
              {dateLabel(letter.receipt?.acknowledged_at ?? null)}
            </div>
            {openId === letter.id && (
              <p
                data-testid="staff-02d-correspondence-body"
                className="mt-2 whitespace-pre-wrap rounded-lg bg-background px-3 py-2 leading-6 text-foreground"
              >
                {letter.body}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setOpenId((current) => (current === letter.id ? null : letter.id))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 font-bold"
                aria-expanded={openId === letter.id}
              >
                <Mail className="h-4 w-4" aria-hidden />
                {openId === letter.id ? "إخفاء نص التعميم" : "فتح نص التعميم"}
              </button>
              <button
                type="button"
                disabled={busyId === letter.id || Boolean(letter.receipt?.read_at)}
                onClick={() => void run("read", letter.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 font-bold disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                تأكيد القراءة
              </button>
              <button
                type="button"
                disabled={
                  busyId === letter.id || Boolean(letter.receipt?.acknowledged_at)
                }
                onClick={() => void run("ack", letter.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-background px-3 py-1.5 font-bold text-primary disabled:opacity-50"
              >
                <BadgeCheck className="h-4 w-4" aria-hidden />
                إقرار الاستلام
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
