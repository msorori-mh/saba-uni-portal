import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  b1AdapterErrorMessageAr,
  getB1UiAdapter,
  type B1RequestDetails,
} from "@/lib/student-requests/b1-ui";
import { B1ErrorState } from "./B1ErrorState";
import { B1LoadingState } from "./B1LoadingState";
import { B1RequestStatusCard } from "./B1RequestStatusCard";
import { B1WorkflowTimeline } from "./B1WorkflowTimeline";

const STATUS_LABEL_AR: Record<B1RequestDetails["status"], string> = {
  draft: "مسودة",
  submitted: "مُرسل",
  in_review: "قيد المراجعة",
  waiting_payment_confirmation: "بانتظار تأكيد السداد",
  returned: "مُعاد للاستكمال",
  rejected: "مرفوض",
  completed: "مكتمل",
};

export function B1StudentRequestDetail({ requestId }: { requestId: string }) {
  const adapter = useMemo(() => getB1UiAdapter(), []);
  const [details, setDetails] = useState<B1RequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setDetails(null);
    void adapter
      .getB1RequestDetails(requestId)
      .then(setDetails)
      .catch((caught) => setError(b1AdapterErrorMessageAr(caught)));
  };

  useEffect(load, [adapter, requestId]);

  if (error) return <B1ErrorState messageAr={error} onRetry={load} />;
  if (!details) return <B1LoadingState labelAr="جارٍ تحميل تفاصيل الطلب…" />;

  const activeStep = details.steps.find((step) => step.status === "active");

  return (
    <main dir="rtl" data-testid="b1-student-request-detail" className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-extrabold text-primary">تفاصيل الطلب</h1>
        <p className="text-sm text-muted-foreground">{details.serviceTitleAr}</p>
      </header>
      <B1RequestStatusCard
        requestNumber={details.requestNumber}
        statusAr={STATUS_LABEL_AR[details.status] ?? details.status}
        serviceTitleAr={details.serviceTitleAr}
        currentStepLabelAr={activeStep?.labelAr}
        updatedAt={details.updatedAt}
      />
      {details.steps.length > 0 ? <B1WorkflowTimeline steps={details.steps} /> : null}
      {details.studentVisibleMessages.length > 0 ? (
        <section data-testid="b1-request-history" className="space-y-2">
          <h2 className="font-bold text-primary">سجل الحالة</h2>
          <ul className="space-y-2">
            {details.studentVisibleMessages.map((message, index) => (
              <li
                key={`${message.at}-${index}`}
                className="rounded-lg border border-border bg-card p-3 text-sm"
              >
                <p className="font-bold">{message.fromLabelAr}</p>
                <p className="mt-1 text-muted-foreground">{message.bodyAr}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link
        to="/student/requests"
        className="inline-flex min-h-10 items-center rounded-lg border border-primary px-4 text-sm font-bold text-primary"
      >
        العودة إلى الطلبات
      </Link>
    </main>
  );
}
