import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, FileWarning, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  getMyStudentServiceRequests,
  getStudentRequestTypesForStudent,
} from "@/lib/student-affairs.functions";
import { STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG } from "@/lib/student-request-rpc";
import {
  filterStudentRequestTypesForDisplay,
  getStudentRequestTypeDisplayName,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";

export const Route = createFileRoute("/mobile/student/requests/")({
  head: () => ({ meta: [{ title: "الخدمات الطلابية" }] }),
  component: MobileStudentRequests,
});

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "مسودة", cls: "bg-muted text-foreground" },
  submitted: { text: "مُرسَل", cls: "bg-blue-100 text-blue-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  in_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  returned: { text: "يحتاج استكمال", cls: "bg-orange-100 text-orange-800" },
  returned_for_completion: { text: "يحتاج استكمال", cls: "bg-orange-100 text-orange-800" },
  approved: { text: "مقبول", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { text: "مرفوض", cls: "bg-rose-100 text-rose-800" },
  cancelled: { text: "ملغي", cls: "bg-zinc-200 text-zinc-800" },
  completed: { text: "مكتمل", cls: "bg-emerald-100 text-emerald-800" },
};

const ACADEMIC_SERVICE_ORDER = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

const DOCUMENT_SERVICE_ORDER = [
  "enrollment_certificate",
  "replacement_student_card",
  "grade_appeal",
  "october_exam_entry_form",
] as const;

const academicCodes = new Set<string>(ACADEMIC_SERVICE_ORDER);

function rank(code: string, order: readonly string[]): number {
  const normalized = normalizeStudentRequestTypeCode(code);
  const index = order.indexOf(normalized);
  return index === -1 ? order.length : index;
}

type ServiceType = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  requires_attachment?: boolean;
  is_eligible: boolean;
  is_disabled: boolean;
  disabled_reason: string | null;
};

type RequestRow = {
  id: string;
  title: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  request_type: string;
  request_type_name_ar: string | null;
  description?: string | null;
};

function isTestOnlyRequest(row: RequestRow): boolean {
  return /(?:TEST_ONLY|REQUESTS_E2E|E2E[_ -]?\d*)/i.test(
    `${row.title ?? ""} ${row.description ?? ""}`,
  );
}

function MobileStudentRequests() {
  const [activeTab, setActiveTab] = useState<"services" | "history">("services");
  const typesFn = useServerFn(getStudentRequestTypesForStudent);
  const listFn = useServerFn(getMyStudentServiceRequests);

  const typesQuery = useQuery({
    queryKey: ["mobile-student", "request-types"],
    queryFn: () => typesFn({ data: {} }),
    staleTime: 60_000,
  });
  const requestsQuery = useQuery({
    queryKey: ["mobile-student", "requests"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 60_000,
  });

  const refetch = () => {
    void typesQuery.refetch();
    void requestsQuery.refetch();
  };
  const isFetching = typesQuery.isFetching || requestsQuery.isFetching;

  if (typesQuery.isLoading || requestsQuery.isLoading) return <ListSkeleton />;
  if (typesQuery.isError || requestsQuery.isError) {
    const error = typesQuery.error ?? requestsQuery.error;
    return (
      <ErrorBox
        message={error instanceof Error ? error.message : "تعذر تحميل الطلبات"}
        onRetry={refetch}
        busy={isFetching}
      />
    );
  }

  const types = filterStudentRequestTypesForDisplay(
    (typesQuery.data ?? []) as ServiceType[],
  ) as ServiceType[];
  const visibleRequests = ((requestsQuery.data ?? []) as RequestRow[]).filter(
    (request) => !isTestOnlyRequest(request),
  );

  const available = types.filter((type) => type.is_eligible && !type.is_disabled);
  const academicServices = available
    .filter((type) => academicCodes.has(normalizeStudentRequestTypeCode(type.code)))
    .sort((a, b) => rank(a.code, ACADEMIC_SERVICE_ORDER) - rank(b.code, ACADEMIC_SERVICE_ORDER));
  const documentServices = available
    .filter((type) => !academicCodes.has(normalizeStudentRequestTypeCode(type.code)))
    .sort((a, b) => rank(a.code, DOCUMENT_SERVICE_ORDER) - rank(b.code, DOCUMENT_SERVICE_ORDER));
  const unavailable = types.filter((type) => type.is_disabled || !type.is_eligible);

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <header>
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-gold" /> الخدمات الطلابية
        </h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          اختر خدمة للتقديم أو تابع طلباتك الحالية والسابقة.
        </p>
      </header>

      <nav
        className="grid grid-cols-2 rounded-xl border border-border bg-muted/30 p-1"
        role="tablist"
        aria-label="أقسام الخدمات الطلابية"
      >
        <TabButton active={activeTab === "services"} onClick={() => setActiveTab("services")}>
          الخدمات المتاحة
        </TabButton>
        <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}>
          طلباتي السابقة
          {visibleRequests.length > 0 ? (
            <span className="mr-1 rounded-full bg-primary/10 px-1.5 text-[10px]">
              {visibleRequests.length}
            </span>
          ) : null}
        </TabButton>
      </nav>

      {activeTab === "services" ? (
        <div className="space-y-5" role="tabpanel">
          <ServiceSection
            title="الحالة والقيد الأكاديمي"
            items={academicServices}
            emptyText="لا توجد خدمات أكاديمية متاحة لك حالياً."
          />
          <ServiceSection
            title="الوثائق والإفادات والشكاوى"
            items={documentServices}
            emptyText="لا توجد خدمات وثائق أو إفادات متاحة حالياً."
          />
          {unavailable.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-extrabold text-muted-foreground">
                خدمات غير متاحة لك حالياً
              </h2>
              <div className="space-y-2">
                {unavailable.map((type) => (
                  <div key={type.id} className="rounded-xl border bg-muted/20 p-3 opacity-75">
                    <div className="text-sm font-bold text-primary">{type.name_ar}</div>
                    <div className="mt-1 text-[10px] font-bold text-amber-800">
                      {type.disabled_reason ?? STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <RequestsHistory requests={visibleRequests} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-2 py-2.5 text-xs font-extrabold transition-colors ${
        active ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ServiceSection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: ServiceType[];
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm font-extrabold text-primary">{title}</h2>
      {items.length === 0 ? (
        <EmptyMini text={emptyText} />
      ) : (
        <div className="space-y-2">
          {items.map((type) => (
            <ServiceCard key={type.id} type={type} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestsHistory({ requests }: { requests: RequestRow[] }) {
  return (
    <section role="tabpanel">
      <h2 className="mb-2 font-display text-sm font-extrabold text-primary">طلباتي السابقة</h2>
      {requests.length === 0 ? (
        <EmptyMini text="لا توجد طلبات حالياً." />
      ) : (
        <div className="space-y-2">
          {requests.map((request) => {
            const status = STATUS_LABEL[request.status] ?? {
              text: request.status,
              cls: "bg-muted",
            };
            const displayName = getStudentRequestTypeDisplayName(
              request.request_type,
              request.request_type_name_ar,
            );
            return (
              <Link
                key={request.id}
                to="/mobile/student/requests/$id"
                params={{ id: request.id }}
                className="block rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-primary">{displayName}</div>
                    {request.title && request.title.trim() !== displayName.trim() ? (
                      <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {request.title}
                      </div>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>
                    {status.text}
                  </span>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {request.submitted_at
                    ? `أُرسل: ${new Date(request.submitted_at).toLocaleDateString("ar-EG")}`
                    : `أُنشئ: ${new Date(request.created_at).toLocaleDateString("ar-EG")}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ServiceCard({ type }: { type: ServiceType }) {
  const canonical = normalizeStudentRequestTypeCode(type.code);
  const body = (
    <>
      <div className="min-w-0">
        <div className="text-sm font-bold text-primary">
          {getStudentRequestTypeDisplayName(type.code, type.name_ar)}
        </div>
        {type.description_ar ? (
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
            {type.description_ar}
          </div>
        ) : null}
        {type.requires_attachment ? (
          <div className="mt-1 text-[10px] font-bold text-amber-800">يتطلب إرفاق مستند</div>
        ) : null}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground">
        <Plus className="h-3 w-3" /> تقديم
      </span>
    </>
  );
  const className =
    "flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-card active:scale-[0.99]";

  return isB1ServiceCode(canonical) ? (
    <Link
      to="/mobile/student/requests/b1/$service"
      params={{ service: canonical }}
      className={className}
    >
      {body}
    </Link>
  ) : (
    <Link
      to="/mobile/student/requests/new"
      search={{ type: canonical }}
      className={className}
    >
      {body}
    </Link>
  );
}

function ErrorBox({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div className="px-4 py-6">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
        <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
        <div className="mb-1 text-sm font-bold text-destructive">تعذر التحميل</div>
        <div className="mb-3 text-[11px] text-muted-foreground">{message}</div>
        <button
          onClick={onRetry}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-[11px] text-muted-foreground">
      {text}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 px-4 py-5" dir="rtl">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
