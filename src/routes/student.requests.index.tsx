import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, FileText, Loader2, Wallet } from "lucide-react";
import { getStudentRequestTypesForStudent } from "@/lib/student-affairs.functions";
import { getMyStudentRequestsWithProgress } from "@/lib/student-requests/student-tracking.functions";
import {
  filterAvailableRequestTypesForStudentPage,
  isRequestTypeActionable,
} from "@/lib/student-requests/available-request-types-ui";
import {
  filterStudentRequestTypesForDisplay,
  getStudentRequestTypeDisplayName,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import { portalFeatures } from "@/lib/portal-features";
import { B1StudentServiceList } from "@/components/student-requests/b1";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";

export const Route = createFileRoute("/student/requests/")({
  component: StudentRequestsIndexPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُرسل",
  in_review: "قيد المراجعة",
  under_review: "قيد المراجعة",
  returned_for_completion: "عاد للاستكمال",
  returned: "عاد للاستكمال",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
  completed: "مكتمل",
};

const GENERAL_SERVICE_DISPLAY_ORDER = [
  "enrollment_certificate",
  "replacement_student_card",
  "grade_appeal",
  "october_exam_entry_form",
] as const;

function getGeneralServiceDisplayRank(code: string): number {
  const normalized = normalizeStudentRequestTypeCode(code);
  const rank = GENERAL_SERVICE_DISPLAY_ORDER.indexOf(
    normalized as (typeof GENERAL_SERVICE_DISPLAY_ORDER)[number],
  );
  return rank === -1 ? GENERAL_SERVICE_DISPLAY_ORDER.length : rank;
}

type RequestRow = {
  id: string;
  request_number: string | null;
  request_type: string;
  request_type_name_ar?: string | null;
  title: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  currentStageAr: string | null;
  currentStepKey: string | null;
  fee: {
    status: string;
    amount: number;
    currency: string;
    requiresPayment: boolean;
    isConfirmed: boolean;
  };
};

function formatFeeShort(fee: RequestRow["fee"]): {
  text: string;
  tone: "danger" | "success" | "muted";
} {
  if (fee.requiresPayment) {
    return {
      text: `مطلوب سداد ${Math.round(fee.amount * 100) / 100} ${fee.currency === "YER" ? "ريال" : fee.currency}`,
      tone: "danger",
    };
  }
  if (fee.isConfirmed) return { text: "تم تأكيد السداد", tone: "success" };
  if (fee.status === "not_required") return { text: "لا رسوم مطلوبة", tone: "success" };
  return { text: "—", tone: "muted" };
}

function StudentRequestsIndexPage() {
  const listFn = useServerFn(getMyStudentRequestsWithProgress);
  const typesFn = useServerFn(getStudentRequestTypesForStudent);

  const {
    data: requests = [],
    isLoading: requestsLoading,
    isError: requestsError,
    error: requestsErr,
  } = useQuery({
    queryKey: ["student-affairs", "my-requests-progress"],
    queryFn: () => listFn({ data: {} }),
  });

  const {
    data: typeRows = [],
    isLoading: typesLoading,
    isError: typesError,
  } = useQuery({
    queryKey: ["student-affairs", "available-types", "requests-page"],
    queryFn: () => typesFn({ data: {} }),
    staleTime: 60_000,
    retry: 1,
  });

  const services = [
    ...filterAvailableRequestTypesForStudentPage(
      filterStudentRequestTypesForDisplay(
        typeRows as Parameters<typeof filterStudentRequestTypesForDisplay>[0],
      ),
    ),
  ].sort(
    (left, right) =>
      getGeneralServiceDisplayRank(left.code) - getGeneralServiceDisplayRank(right.code),
  );

  const [activeTab, setActiveTab] = useState<"services" | "requests">("services");

  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-extrabold text-primary flex items-center gap-2">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-gold shrink-0" />
            <span className="leading-snug">الخدمات الطلابية</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر خدمة للتقديم أو تابع طلباتك الحالية والسابقة.
          </p>
        </div>
      </header>

      <nav
        aria-label="أقسام الخدمات الطلابية"
        role="tablist"
        className="grid grid-cols-2 rounded-xl border border-border bg-muted/30 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "services"}
          aria-controls="student-services-panel"
          onClick={() => setActiveTab("services")}
          className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
            activeTab === "services"
              ? "bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:text-primary"
          }`}
        >
          الخدمات المتاحة
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "requests"}
          aria-controls="student-requests-panel"
          onClick={() => setActiveTab("requests")}
          className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
            activeTab === "requests"
              ? "bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:text-primary"
          }`}
        >
          طلباتي السابقة
          {!requestsLoading && requests.length > 0 ? (
            <span className="mr-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs text-primary">
              {requests.length}
            </span>
          ) : null}
        </button>
      </nav>

      {activeTab === "services" ? (
        <>
      <B1StudentServiceList />

      {/* —— الوثائق والإفادات والشكاوى —— */}
      <section id="student-services-panel" role="tabpanel" className="space-y-3">
        <div>
          <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-gold" />
            الوثائق والإفادات والشكاوى
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر الخدمة التي ترغب في تقديم طلب بشأنها.
          </p>
        </div>

        {typesLoading ? (
          <div
            className="grid place-items-center rounded-xl border border-border bg-card p-8"
            aria-busy="true"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : typesError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            تعذر تحميل الخدمات المتاحة. حاول مرة أخرى.
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            لا توجد خدمات متاحة للتقديم حالياً.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((type) => {
              const actionable = isRequestTypeActionable(type);
              return (
                <div
                  key={type.code}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-primary leading-snug">
                      {getStudentRequestTypeDisplayName(type.code, type.name_ar)}
                    </div>
                    {type.description_ar ? (
                      <p className="mt-0.5 text-xs text-muted-foreground leading-5 line-clamp-2">
                        {type.description_ar}
                      </p>
                    ) : null}
                    {/* Fees only when finance feature is on — currently frozen. */}
                    {portalFeatures.studentFinance ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        تفاصيل الرسوم حسب النظام.
                      </p>
                    ) : null}
                    <div className="mt-2">
                      {actionable ? (
                        isB1ServiceCode(normalizeStudentRequestTypeCode(type.code)) ? (
                          <Link
                            to="/student/requests/b1/$service"
                            params={{ service: normalizeStudentRequestTypeCode(type.code) }}
                            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                          >
                            تقديم طلب
                          </Link>
                        ) : (
                          <Link
                            to="/student/requests/new"
                            search={{ type: type.code }}
                            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                          >
                            تقديم طلب
                          </Link>
                        )
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-bold text-muted-foreground">
                          غير متاح حالياً
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
        </>
      ) : null}

      {/* —— طلباتي —— */}
      {activeTab === "requests" ? (
      <section id="student-requests-panel" role="tabpanel" className="space-y-3">
        <div>
          <h2 className="font-display text-base font-bold text-primary">طلباتي</h2>
          <p className="mt-1 text-sm text-muted-foreground">الطلبات الحالية والسابقة.</p>
        </div>

        {requestsError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {(requestsErr as Error)?.message || "تعذر تحميل الطلبات. حاول مرة أخرى."}
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          {requestsLoading ? (
            <div className="grid place-items-center p-10" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !requestsError && requests.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا توجد طلبات بعد.</div>
          ) : !requestsError ? (
            <>
              {/* Mobile cards */}
              <ul className="md:hidden divide-y divide-border">
                {(requests as RequestRow[]).map((request) => (
                  <li key={request.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className="text-[11px] font-mono text-muted-foreground break-all"
                          dir="ltr"
                        >
                          {request.request_number ?? "—"}
                        </div>
                        <div className="font-bold text-sm text-primary break-words">
                          {request.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {getStudentRequestTypeDisplayName(
                            request.request_type,
                            request.request_type_name_ar,
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                        {STATUS_LABEL[request.status] ?? request.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                      <div>
                        <span className="font-semibold text-foreground/70">المرحلة الحالية: </span>
                        {request.currentStageAr ?? "—"}
                      </div>
                      <div>
                        <span className="font-semibold text-foreground/70">التقديم: </span>
                        {request.submitted_at
                          ? new Date(request.submitted_at).toLocaleDateString("ar-EG")
                          : "—"}
                      </div>
                      <div className="col-span-2 flex items-center gap-1">
                        <Wallet className="h-3 w-3" />
                        <span className="font-semibold text-foreground/70">الرسوم: </span>
                        {(() => {
                          const f = formatFeeShort(request.fee);
                          const cls =
                            f.tone === "danger"
                              ? "text-orange-800 font-bold"
                              : f.tone === "success"
                                ? "text-emerald-700 font-semibold"
                                : "";
                          return <span className={cls}>{f.text}</span>;
                        })()}
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-foreground/70">آخر تحديث: </span>
                        {new Date(request.updated_at).toLocaleString("ar-EG")}
                      </div>
                    </div>
                    {isB1ServiceCode(normalizeStudentRequestTypeCode(request.request_type)) ? (
                      <Link
                        to="/student/requests/b1/view/$requestId"
                        params={{ requestId: request.id }}
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary"
                      >
                        عرض التفاصيل
                      </Link>
                    ) : (
                      <Link
                        to="/student/requests/$id"
                        params={{ id: request.id }}
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary"
                      >
                        عرض التفاصيل
                      </Link>
                    )}
                  </li>
                ))}
              </ul>

              {/* Desktop / tablet table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-primary">
                    <tr>
                      <th className="px-3 py-2 text-right">رقم الطلب</th>
                      <th className="px-3 py-2 text-right">نوع الطلب</th>
                      <th className="px-3 py-2 text-right">العنوان</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">المرحلة الحالية</th>
                      <th className="px-3 py-2 text-right">الرسوم</th>
                      <th className="px-3 py-2 text-right">تاريخ التقديم</th>
                      <th className="px-3 py-2 text-right">آخر تحديث</th>
                      <th className="px-3 py-2 text-right">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(requests as RequestRow[]).map((request) => (
                      <tr key={request.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-mono text-xs break-all max-w-[9rem]">
                          {request.request_number ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {getStudentRequestTypeDisplayName(
                            request.request_type,
                            request.request_type_name_ar,
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold max-w-[12rem] break-words">
                          {request.title}
                        </td>
                        <td className="px-3 py-2">
                          {STATUS_LABEL[request.status] ?? request.status}
                        </td>
                        <td className="px-3 py-2">{request.currentStageAr ?? "—"}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const f = formatFeeShort(request.fee);
                            const cls =
                              f.tone === "danger"
                                ? "text-orange-800 font-bold"
                                : f.tone === "success"
                                  ? "text-emerald-700 font-semibold"
                                  : "";
                            return <span className={cls}>{f.text}</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {request.submitted_at
                            ? new Date(request.submitted_at).toLocaleString("ar-EG")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(request.updated_at).toLocaleString("ar-EG")}
                        </td>
                        <td className="px-3 py-2">
                          {isB1ServiceCode(
                            normalizeStudentRequestTypeCode(request.request_type),
                          ) ? (
                            <Link
                              to="/student/requests/b1/view/$requestId"
                              params={{ requestId: request.id }}
                              className="font-bold text-primary underline"
                            >
                              عرض
                            </Link>
                          ) : (
                            <Link
                              to="/student/requests/$id"
                              params={{ id: request.id }}
                              className="font-bold text-primary underline"
                            >
                              عرض
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </section>
      ) : null}
    </div>
  );
}
