import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Box,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Mail,
} from "lucide-react";
import {
  fetchStaffCorrespondence,
  fetchStaffCustody,
  fetchStaffLeaveBalances,
  remainingLeaveDays,
} from "@/lib/staff-self-service-read";
import { listAccessibleStaffServiceRequests } from "@/lib/staff-self-service-live";
import { getB1UiAdapter } from "@/lib/student-requests/b1-ui";
import { B1_ASSIGNED_REQUESTS_QUERY_KEY } from "@/components/student-requests/b1/B1StaffWorkspace";

type StaffEmployeeHomeProps = {
  profile: {
    full_name_ar: string;
    job_title: string;
  };
  onOpen: (section: string) => void;
};

const OPEN_STATUSES = new Set(["submitted", "in_review"]);
const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  submitted: "مرسل",
  in_review: "قيد الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};
const SERVICE_AR: Record<string, string> = {
  leave: "إجازة",
  permission: "مغادرة",
  custody_transfer: "نقل عهدة",
  custody_return: "إرجاع عهدة",
  employment_statement: "إفادة وظيفية",
  experience_certificate: "شهادة خبرة",
  overtime: "عمل إضافي",
  training: "تدريب وتطوير",
  promotion_adjustment: "ترقية أو تسوية",
  clearance: "إخلاء طرف",
};

function safeReference(value: string) {
  return value.replace(/^TEST_ONLY_[A-Z0-9]+-?/i, "طلب-");
}

function dateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(parsed);
}

/** One cell of the summary strip: quiet number + label, no lift or shadow. */
function StatCard({
  label,
  value,
  hint,
  icon,
  onClick,
  className = "",
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} bg-card p-4 text-right transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

/** One "needs attention" row: neutral surface, a small dot carries the tone. */
function AttentionRow({
  tone,
  title,
  detail,
  onClick,
}: {
  tone: "primary" | "amber" | "destructive";
  title: string;
  detail: string;
  onClick: () => void;
}) {
  const dot =
    tone === "amber" ? "bg-amber-500" : tone === "destructive" ? "bg-destructive" : "bg-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-right transition-colors hover:bg-muted/40"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

export function StaffEmployeeHome({ profile, onOpen }: StaffEmployeeHomeProps) {
  const leave = useQuery({
    queryKey: ["staff-portal-home", "leave"],
    queryFn: () => fetchStaffLeaveBalances({ ownOnly: true }),
  });
  const requests = useQuery({
    queryKey: ["staff-portal-home", "requests"],
    queryFn: () => listAccessibleStaffServiceRequests({ ownOnly: true }),
  });
  const letters = useQuery({
    queryKey: ["staff-portal-home", "correspondence"],
    queryFn: fetchStaffCorrespondence,
  });
  const custody = useQuery({
    queryKey: ["staff-portal-home", "custody"],
    queryFn: () => fetchStaffCustody({ ownOnly: true }),
  });
  const assignedStudentRequests = useQuery({
    queryKey: B1_ASSIGNED_REQUESTS_QUERY_KEY,
    queryFn: () => getB1UiAdapter().getAssignedB1Requests(),
  });

  const annual = (leave.data ?? []).find((item) => item.leave_type === "annual");
  const annualRemaining = annual ? remainingLeaveDays(annual).toFixed(0) : "—";
  const openRequests = (requests.data ?? []).filter((item) => OPEN_STATUSES.has(item.status));
  const unreadLetters = (letters.data ?? []).filter((item) => !item.receipt?.read_at);
  const activeCustody = (custody.data ?? []).filter((item) => !item.returned_on);
  const attentionCustody = activeCustody.filter(
    (item) => item.condition === "needs_maintenance" || item.condition === "damaged",
  );
  const latestRequests = (requests.data ?? []).slice(0, 5);
  const assignedCount = assignedStudentRequests.data?.length ?? null;
  // Never show a fake number: loading → "…", failure → "—" plus the page error banner.
  const assignedValue = assignedStudentRequests.isError
    ? "—"
    : (assignedCount ?? "…");
  const loading =
    leave.isLoading ||
    requests.isLoading ||
    letters.isLoading ||
    custody.isLoading ||
    assignedStudentRequests.isLoading;
  const hasError =
    leave.isError ||
    requests.isError ||
    letters.isError ||
    custody.isError ||
    assignedStudentRequests.isError;

  const nothingUrgent =
    !loading &&
    (assignedCount === null || assignedCount === 0) &&
    unreadLetters.length === 0 &&
    openRequests.length === 0 &&
    attentionCustody.length === 0;
  const CARD = "rounded-xl border border-border bg-card p-4";
  const CARD_TITLE = "text-sm font-semibold text-foreground";

  return (
    <div dir="rtl" data-testid="staff-portal-home" className="space-y-5">
      <header className="border-b border-border pb-4">
        <div className="text-xs text-muted-foreground">مرحباً بك</div>
        <h1 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
          {profile.full_name_ar}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{profile.job_title}</p>
      </header>

      {hasError && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          تعذر تحديث بعض المؤشرات الآن. الخدمات المستقلة ما زالت متاحة من القائمة.
        </div>
      )}

      <section aria-labelledby="staff-summary-title">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="staff-summary-title" className={CARD_TITLE}>ملخص اليوم</h2>
          {loading && <span className="text-xs text-muted-foreground">جاري التحديث...</span>}
        </div>
        {/* One strip: the 1px gaps over a border-coloured background draw the dividers. */}
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="طلبات طلابية مسندة" value={assignedValue} hint="بانتظار إجرائك" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => onOpen("student-requests")} className="sm:col-span-2 xl:col-span-1" />
          <StatCard label="رصيد الإجازة السنوية" value={annualRemaining} hint="يوم متبقٍ" icon={<CalendarDays className="h-4 w-4" />} onClick={() => onOpen("leave")} />
          <StatCard label="طلبات مفتوحة" value={openRequests.length} hint="تحتاج متابعة" icon={<FileText className="h-4 w-4" />} onClick={() => onOpen("requests")} />
          <StatCard label="تعاميم غير مقروءة" value={unreadLetters.length} hint="بانتظار القراءة" icon={<Mail className="h-4 w-4" />} onClick={() => onOpen("communications")} />
          <StatCard label="العهد المسجلة" value={activeCustody.length} hint="عهدة نشطة" icon={<Box className="h-4 w-4" />} onClick={() => onOpen("custody")} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className={CARD}>
          <h2 className={CARD_TITLE}>يحتاج انتباهك</h2>
          <div className="mt-1 divide-y divide-border">
            {assignedCount !== null && assignedCount > 0 && (
              <AttentionRow tone="primary" title="طلبات طلابية مسندة إليك" detail={`${assignedCount} طلب بانتظار إجرائك`} onClick={() => onOpen("student-requests")} />
            )}
            {unreadLetters.slice(0, 1).map((item) => (
              <AttentionRow key={item.id} tone="amber" title="تعميم ينتظر القراءة" detail={item.subject} onClick={() => onOpen("communications")} />
            ))}
            {openRequests.slice(0, 1).map((item) => (
              <AttentionRow key={item.id} tone="primary" title="طلب قيد المتابعة" detail={`${safeReference(item.request_no)} — ${STATUS_AR[item.status] ?? item.status}`} onClick={() => onOpen("requests")} />
            ))}
            {attentionCustody.slice(0, 1).map((item) => (
              <AttentionRow key={item.id} tone="destructive" title="عهدة تحتاج إجراء" detail={item.asset_name} onClick={() => onOpen("custody")} />
            ))}
            {nothingUrgent && (
              <p className="py-4 text-sm text-muted-foreground">لا توجد إجراءات عاجلة حالياً.</p>
            )}
          </div>
        </section>

        <section className={CARD}>
          <h2 className={CARD_TITLE}>إجراءات سريعة</h2>
          <div className="mt-1 divide-y divide-border">
            {[
              ["معالجة الطلبات الطلابية", "student-requests"],
              ["طلب إجازة أو مغادرة", "requests"],
              ["عرض كشف الراتب", "payroll"],
              ["طلب إفادة وظيفية", "documents"],
              ["نقل أو إرجاع عهدة", "requests"],
            ].map(([label, section]) => (
              <button key={label} type="button" onClick={() => onOpen(section)} className="flex w-full items-center justify-between gap-3 py-2.5 text-right text-sm text-foreground transition-colors hover:text-primary">
                {label}
                <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className={CARD_TITLE}>آخر المعاملات</h2>
          <button type="button" onClick={() => onOpen("requests")} className="text-xs text-primary hover:underline">عرض الكل</button>
        </div>
        <div className="mt-1 divide-y divide-border">
          {latestRequests.map((item) => (
            <button key={item.id} type="button" onClick={() => onOpen("requests")} className="flex w-full items-center justify-between gap-3 py-3 text-right transition-colors hover:bg-muted/40">
              <span>
                <span className="block text-sm font-medium text-foreground">{SERVICE_AR[item.service_type] ?? item.service_type}</span>
                <span className="text-xs text-muted-foreground">{safeReference(item.request_no)} • {dateLabel(item.updated_at)}</span>
              </span>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">{STATUS_AR[item.status] ?? item.status}</span>
            </button>
          ))}
          {!loading && latestRequests.length === 0 && <p className="py-4 text-sm text-muted-foreground">لا توجد معاملات بعد.</p>}
        </div>
      </section>
    </div>
  );
}
