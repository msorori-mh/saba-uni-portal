import { useCallback, useEffect, useMemo, useState } from "react";
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

export function B1StaffWorkspace() {
  const adapter = useMemo(() => getB1UiAdapter(), []);
  const [requests, setRequests] = useState<readonly B1AssignedRequest[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<B1AssignedRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

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

  const refreshAfterAction = async (requestId: string) => {
    await loadInbox();
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

  if (error && !requests)
    return <B1ErrorState messageAr={error} onRetry={() => void loadInbox()} />;
  if (!requests) return <B1LoadingState labelAr="جارٍ تحميل الطلبات المسندة…" />;

  return (
    <main
      dir="rtl"
      data-testid="b1-staff-workspace"
      className="container mx-auto max-w-6xl space-y-5 px-4 py-6"
    >
      <header>
        <h1 className="font-display text-2xl font-extrabold text-primary">الطلبات المسندة إليّ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تظهر الطلبات ذات التعيين المباشر والإجراء القانوني الحالي فقط.
        </p>
      </header>
      {error ? <B1ErrorState messageAr={error} onRetry={() => void loadInbox()} /> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.5fr)]">
        <section className="space-y-2">
          {requests.length === 0 ? (
            <B1EmptyState
              titleAr="لا توجد طلبات مسندة"
              bodyAr="لا توجد خطوات نشطة مسندة إليك حاليًا."
            />
          ) : (
            requests.map((request) => (
              <button
                type="button"
                key={request.stepId}
                onClick={() => void loadDetails(request.requestId)}
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
              />
              <B1WorkflowTimeline steps={details.steps} />
              {details.allowedAction === "confirm_payment" ? (
                <B1RevenueReceiptCard
                  stepId={details.stepId}
                  acting={acting}
                  onConfirm={confirmRevenue}
                />
              ) : (
                <B1EmployeeActionPanel
                  allowedAction={details.allowedAction}
                  stepLabelAr={details.stepLabelAr}
                  acting={acting}
                  onAct={act}
                />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
