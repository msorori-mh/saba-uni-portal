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

function StatCard({
  label,
  value,
  hint,
  icon,
  onClick,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-border bg-card p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</span>
        <ArrowLeft className="h-4 w-4 text-muted-foreground transition group-hover:-translate-x-1" />
      </div>
      <div className="mt-4 text-2xl font-black text-foreground">{value}</div>
      <div className="mt-1 text-sm font-bold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

export function StaffEmployeeHome({ profile, onOpen }: StaffEmployeeHomeProps) {
  const leave = useQuery({
    queryKey: ["staff-portal-home", "leave"],
    queryFn: fetchStaffLeaveBalances,
  });
  const requests = useQuery({
    queryKey: ["staff-portal-home", "requests"],
    queryFn: listAccessibleStaffServiceRequests,
  });
  const letters = useQuery({
    queryKey: ["staff-portal-home", "correspondence"],
    queryFn: fetchStaffCorrespondence,
  });
  const custody = useQuery({
    queryKey: ["staff-portal-home", "custody"],
    queryFn: fetchStaffCustody,
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
    (item) => item.condition_state === "needs_maintenance" || item.condition_state === "damaged",
  );
  const latestRequests = (requests.data ?? []).slice(0, 5);
  const loading = leave.isLoading || requests.isLoading || letters.isLoading || custody.isLoading;
  const hasError = leave.isError || requests.isError || letters.isError || custody.isError;

  return (
    <div dir="rtl" data-testid="staff-portal-home" className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-hero-gradient p-6 text-primary-foreground shadow-elegant sm:p-8">
        <div className="absolute -left-8 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs font-bold text-gold">مرحباً بك</div>
          <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">
            {profile.full_name_ar}
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/75">{profile.job_title}</p>
        </div>
      </section>

      {hasError && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-bold text-destructive">
          <AlertCircle className="h-4 w-4" />
          تعذر تحديث بعض المؤشرات الآن. الخدمات المستقلة ما زالت متاحة من القائمة.
        </div>
      )}

      <section aria-labelledby="staff-summary-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="staff-summary-title" className="text-base font-black text-foreground">ملخص اليوم</h2>
          {loading && <span className="text-xs text-muted-foreground">جاري التحديث...</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="رصيد الإجازة السنوية" value={annualRemaining} hint="يوم متبقٍ" icon={<CalendarDays className="h-5 w-5" />} onClick={() => onOpen("leave")} />
          <StatCard label="طلبات مفتوحة" value={openRequests.length} hint="تحتاج متابعة" icon={<FileText className="h-5 w-5" />} onClick={() => onOpen("requests")} />
          <StatCard label="تعاميم غير مقروءة" value={unreadLetters.length} hint="بانتظار القراءة" icon={<Mail className="h-5 w-5" />} onClick={() => onOpen("communications")} />
          <StatCard label="العهد المسجلة" value={activeCustody.length} hint="عهدة نشطة" icon={<Box className="h-5 w-5" />} onClick={() => onOpen("custody")} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-black text-foreground">يحتاج انتباهك</h2>
          <div className="mt-3 space-y-2">
            {unreadLetters.slice(0, 1).map((item) => (
              <button key={item.id} type="button" onClick={() => onOpen("communications")} className="flex w-full items-center justify-between rounded-xl bg-amber-500/10 p-3 text-right">
                <span><span className="block text-sm font-bold">تعميم ينتظر القراءة</span><span className="text-xs text-muted-foreground">{item.subject}</span></span>
                <ArrowLeft className="h-4 w-4" />
              </button>
            ))}
            {openRequests.slice(0, 1).map((item) => (
              <button key={item.id} type="button" onClick={() => onOpen("requests")} className="flex w-full items-center justify-between rounded-xl bg-primary/5 p-3 text-right">
                <span><span className="block text-sm font-bold">طلب قيد المتابعة</span><span className="text-xs text-muted-foreground">{safeReference(item.request_no)} — {STATUS_AR[item.status] ?? item.status}</span></span>
                <ArrowLeft className="h-4 w-4" />
              </button>
            ))}
            {attentionCustody.slice(0, 1).map((item) => (
              <button key={item.id} type="button" onClick={() => onOpen("custody")} className="flex w-full items-center justify-between rounded-xl bg-destructive/5 p-3 text-right">
                <span><span className="block text-sm font-bold">عهدة تحتاج إجراء</span><span className="text-xs text-muted-foreground">{item.asset_name}</span></span>
                <ArrowLeft className="h-4 w-4" />
              </button>
            ))}
            {!loading && unreadLetters.length === 0 && openRequests.length === 0 && attentionCustody.length === 0 && (
              <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">لا توجد إجراءات عاجلة حالياً.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-black text-foreground">إجراءات سريعة</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["معالجة الطلبات الطلابية", "student-requests"],
              ["طلب إجازة أو مغادرة", "requests"],
              ["عرض كشف الراتب", "payroll"],
              ["طلب إفادة وظيفية", "documents"],
              ["نقل أو إرجاع عهدة", "requests"],
            ].map(([label, section]) => (
              <button key={label} type="button" onClick={() => onOpen(section)} className="rounded-xl border border-border px-3 py-3 text-xs font-bold text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-foreground">آخر المعاملات</h2>
          <button type="button" onClick={() => onOpen("requests")} className="text-xs font-bold text-primary">عرض الكل</button>
        </div>
        <div className="mt-3 divide-y divide-border">
          {latestRequests.map((item) => (
            <button key={item.id} type="button" onClick={() => onOpen("requests")} className="flex w-full items-center justify-between gap-3 py-3 text-right">
              <span>
                <span className="block text-sm font-bold text-foreground">{SERVICE_AR[item.service_type] ?? item.service_type}</span>
                <span className="text-xs text-muted-foreground">{safeReference(item.request_no)} • {dateLabel(item.updated_at)}</span>
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">{STATUS_AR[item.status] ?? item.status}</span>
            </button>
          ))}
          {!loading && latestRequests.length === 0 && <p className="py-5 text-sm text-muted-foreground">لا توجد معاملات بعد.</p>}
        </div>
      </section>
    </div>
  );
}
