import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import {
  b1AdapterErrorMessageAr,
  getB1UiAdapter,
  type B1AssignedRequest,
  type B1AssignedRequestDetails,
  type B1StaffAction,
} from "@/lib/student-requests/b1-ui";
import { B1EmployeeActionPanel } from "./B1EmployeeActionPanel";
import { B1EmptyState } from "./B1EmptyState";
import { B1ErrorState } from "./B1ErrorState";
import { B1LoadingState } from "./B1LoadingState";
import { B1RequestSummary } from "./B1RequestSummary";
import { B1RevenueReceiptCard } from "./B1RevenueReceiptCard";
import { B1WorkflowTimeline } from "./B1WorkflowTimeline";

/**
 * Shared React Query key for the assigned-requests count shown on the staff
 * home card and the portal navigation badge. The workspace itself reads via
 * the adapter directly, but after every successful action it invalidates
 * this key so all counters refresh from the trusted backend source
 * (no optimistic updates).
 */
export const B1_ASSIGNED_REQUESTS_QUERY_KEY = ["b1-assigned-requests"] as const;

export function B1StaffWorkspace({ embedded = false }: { embedded?: boolean }) {
  const adapter = useMemo(() => getB1UiAdapter(), []);
  const queryClient = useQueryClient();
  const [requests, setRequests] = useState<readonly B1AssignedRequest[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<B1AssignedRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");

  const loadInbox = useCallback(async () => {
    setError(null);
    try {
      const rows = await adapter.getAssignedB1Requests();
      setRequests(rows);
      if (selectedId && !rows.some((row) => row.requestId === selectedId)) {
        setSelectedId(null);
        setDetails(null);
      }
    } catch (caught) {
      setError(b1AdapterErrorMessageAr(caught));
    }
  }, [adapter, selectedId]);

  const loadDetails = async (requestId: string) => {
    setSelectedId(requestId);
    setDetails(null);
    setError(null);
    try {
      setDetails(await adapter.getAssignedB1RequestDetails(requestId));
    } catch (caught) {
      setError(b1AdapterErrorMessageAr(caught));
    }
  };

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  /** Actual refresh: re-read the inbox and invalidate the shared count cache. */
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadInbox();
      await queryClient.invalidateQueries({ queryKey: B1_ASSIGNED_REQUESTS_QUERY_KEY });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAfterAction = async (requestId: string) => {
    await loadInbox();
    // Counters (home card + nav badge) must come from the trusted source.
    await queryClient.invalidateQueries({ queryKey: B1_ASSIGNED_REQUESTS_QUERY_KEY });
    try {
      setDetails(await adapter.getAssignedB1RequestDetails(requestId));
    } catch {
      setSelectedId(null);
      setDetails(null);
    }
  };

  const act = async (action: B1StaffAction, comment?: string) => {
    if (!details || acting) return;
    setActing(true);
    try {
      await adapter.actOnB1RequestStep(details.stepId, action, comment);
      await refreshAfterAction(details.requestId);
    } finally {
      setActing(false);
    }
  };

  const confirmRevenue = async (stepId: string, note?: string) => {
    if (!details || acting) return;
    setActing(true);
    try {
      await adapter.confirmB1RevenueReceipt(stepId, note);
      await refreshAfterAction(details.requestId);
    } finally {
      setActing(false);
    }
  };

  // Operational bar counts — derived from the authorized inbox only.
  const totalAssigned = requests?.length ?? 0;
  const actionableCount =
    requests?.filter((row) => row.allowedAction !== null).length ?? 0;
  const feeConfirmationCount =
    requests?.filter((row) => row.allowedAction === "confirm_payment").length ?? 0;

  // Service filter options are derived only from requests the caller is authorized to see.
  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of requests ?? []) {
      if (!map.has(row.serviceCode)) map.set(row.serviceCode, row.serviceTitleAr);
    }
    return [...map.entries()];
  }, [requests]);

  // Safe local search over already-authorized rows — no data or authorization change.
  const filteredRequests = useMemo(() => {
    const query = search.trim();
    return (requests ?? []).filter((row) => {
      if (serviceFilter && row.serviceCode !== serviceFilter) return false;
      if (!query) return true;
      return [row.requestNumber, row.studentNameAr, row.studentNumber, row.serviceTitleAr].some(
        (value) => value.includes(query),
      );
    });
  }, [requests, search, serviceFilter]);

  if (error && !requests)
    return <B1ErrorState messageAr={error} onRetry={() => void loadInbox()} />;
  if (!requests) return <B1LoadingState labelAr="جارٍ تحميل الطلبات المسندة…" />;

  const RootTag: "main" | "section" = embedded ? "section" : "main";

  return (
    <RootTag
      dir="rtl"
      data-testid="b1-staff-workspace"
      className={
        embedded
          ? "space-y-4"
          : "container mx-auto max-w-6xl space-y-5 px-4 py-6"
      }
    >
      {!embedded && (
        <header>
          <h1 className="font-display text-2xl font-extrabold text-primary">الطلبات المسندة إليّ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تظهر الطلبات ذات التعيين المباشر والإجراء القانوني الحالي فقط.
          </p>
        </header>
      )}
      {error ? <B1ErrorState messageAr={error} onRetry={() => void loadInbox()} /> : null}

      <div
        data-testid="b1-ops-bar"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs font-bold shadow-sm"
      >
        <span className="rounded-lg bg-muted px-2.5 py-1.5 text-foreground">
          الطلبات المسندة: {totalAssigned}
        </span>
        <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-emerald-700">
          تتطلب إجراءً: {actionableCount}
        </span>
        <span className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-amber-700">
          تأكيد رسوم: {feeConfirmationCount}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="تحديث الطلبات المسندة"
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {requests.length > 0 && (
        <div data-testid="b1-inbox-filters" className="flex flex-wrap gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="بحث في الطلبات المسندة"
              placeholder="بحث: رقم الطلب / اسم الطالب / رقمه / الخدمة"
              className="h-10 w-full rounded-xl border border-border bg-card pe-9 ps-3 text-sm"
            />
          </label>
          <select
            value={serviceFilter}
            onChange={(event) => setServiceFilter(event.target.value)}
            aria-label="تصفية حسب الخدمة"
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
          >
            <option value="">كل الخدمات</option>
            {serviceOptions.map(([code, titleAr]) => (
              <option key={code} value={code}>
                {titleAr}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.5fr)]">
        <section className="space-y-2" aria-label="قائمة الطلبات المسندة">
          {requests.length === 0 ? (
            <B1EmptyState
              titleAr="لا توجد طلبات مسندة"
              bodyAr="لا توجد خطوات نشطة مسندة إليك حاليًا."
            />
          ) : filteredRequests.length === 0 ? (
            <B1EmptyState
              titleAr="لا توجد نتائج مطابقة"
              bodyAr="جرّب تعديل البحث أو مرشح الخدمة."
            />
          ) : (
            filteredRequests.map((request) => (
              <button
                type="button"
                key={request.stepId}
                onClick={() => void loadDetails(request.requestId)}
                aria-current={selectedId === request.requestId ? "true" : undefined}
                aria-label={`طلب ${request.requestNumber} — ${request.serviceTitleAr} — ${request.studentNameAr}`}
                className={`w-full rounded-xl border p-4 text-start shadow-sm ${selectedId === request.requestId ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <span dir="ltr" className="block font-mono text-xs text-muted-foreground">
                  {request.requestNumber}
                </span>
                <strong className="mt-1 block text-sm text-primary">
                  {request.serviceTitleAr}
                </strong>
                <span className="mt-1 block text-xs">
                  {request.studentNameAr} — {request.studentNumber}
                </span>
                <span className="mt-2 block text-xs font-bold text-muted-foreground">
                  {request.stepLabelAr}
                </span>
              </button>
            ))
          )}
        </section>

        <section className="space-y-4">
          {!selectedId ? (
            <B1EmptyState
              titleAr="اختر طلبًا"
              bodyAr="اختر طلبًا مسندًا لعرض التفاصيل والإجراء الحالي."
            />
          ) : !details ? (
            <B1LoadingState labelAr="جارٍ تحميل تفاصيل الطلب…" />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <strong>رقم الطلب: </strong>
                    <span dir="ltr" className="font-mono">
                      {details.requestNumber}
                    </span>
                  </p>
                  <p>
                    <strong>الخدمة: </strong>
                    {details.serviceTitleAr}
                  </p>
                  <p>
                    <strong>الطالب: </strong>
                    {details.studentNameAr}
                  </p>
                  <p>
                    <strong>الرقم الجامعي: </strong>
                    <span dir="ltr">{details.studentNumber}</span>
                  </p>
                </div>
              </div>
              <B1RequestSummary
                serviceTitleAr={details.serviceTitleAr}
                items={details.formDataSummary}
                attachments={details.attachments}
                onDownloadAttachment={async (attachmentId) => {
                  const downloaded = await adapter.downloadB1RequestAttachment(attachmentId);
                  window.open(downloaded.url, "_blank", "noopener,noreferrer");
                }}
              />
              <B1WorkflowTimeline steps={details.steps} />
              {details.allowedAction === "confirm_payment" ? (
                <B1RevenueReceiptCard
                  stepId={details.stepId}
                  acting={acting}
                  onConfirm={confirmRevenue}
                />
              ) : details.allowedAction ? (
                <B1EmployeeActionPanel
                  allowedAction={details.allowedAction}
                  stepLabelAr={details.stepLabelAr}
                  stepKey={details.stepKey}
                  acting={acting}
                  onAct={act}
                />
              ) : (
                <p className="text-sm text-muted-foreground" role="status">
                  لا يوجد إجراء مسموح لك على هذه المرحلة حالياً.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </RootTag>
  );
}
