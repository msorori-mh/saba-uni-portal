import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useStudentRequestRoutes } from "@/lib/student-requests/surface";
import {
  b1AdapterErrorMessageAr,
  buildB1StudentFormSummaryItems,
  getB1ServiceConfig,
  getB1UiAdapter,
  isB1ServiceCode,
  type B1CanonicalCode,
  type B1FormOptions,
  type B1RequestDetails,
} from "@/lib/student-requests/b1-ui";
import { B1ErrorState } from "./B1ErrorState";
import { B1LoadingState } from "./B1LoadingState";
import { B1RequestStatusCard } from "./B1RequestStatusCard";
import { B1RequestSummary } from "./B1RequestSummary";
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
  const routes = useStudentRequestRoutes();
  const adapter = useMemo(() => getB1UiAdapter(), []);
  const [details, setDetails] = useState<B1RequestDetails | null>(null);
  const [formOptions, setFormOptions] = useState<B1FormOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setDetails(null);
    setFormOptions(null);
    void adapter
      .getB1RequestDetails(requestId)
      .then(async (loaded) => {
        setDetails(loaded);
        if (isB1ServiceCode(loaded.serviceCode)) {
          try {
            setFormOptions(await adapter.getB1RequestFormOptions(loaded.serviceCode));
          } catch {
            // Labels still come from the form registry; options enrich names when available.
            setFormOptions(null);
          }
        }
      })
      .catch((caught) => setError(b1AdapterErrorMessageAr(caught)));
  };

  useEffect(load, [adapter, requestId]);

  if (error) return <B1ErrorState messageAr={error} onRetry={load} />;
  if (!details) return <B1LoadingState labelAr="جارٍ تحميل تفاصيل الطلب…" />;

  const activeStep = details.steps.find((step) => step.status === "active");
  const completedSteps = details.steps.filter((step) => step.status === "completed");
  const canResume = details.status === "draft" || details.status === "returned";
  const serviceCode = details.serviceCode as B1CanonicalCode;
  const config = getB1ServiceConfig(serviceCode);
  const summaryItems = isB1ServiceCode(serviceCode)
    ? buildB1StudentFormSummaryItems({
        serviceCode,
        formData: details.formData,
        options: formOptions,
      })
    : [];

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

      {activeStep ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm">
          <strong>الخطوة الحالية: </strong>
          {activeStep.labelAr}
        </p>
      ) : null}

      {completedSteps.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          الخطوات المكتملة: {completedSteps.map((step) => step.labelAr).join("، ")}
        </p>
      ) : null}

      <B1RequestSummary
        serviceTitleAr={details.serviceTitleAr}
        items={summaryItems}
        attachments={details.attachments}
      />

      {details.steps.length > 0 ? <B1WorkflowTimeline steps={details.steps} /> : null}
      {details.studentVisibleMessages.length > 0 ? (
        <section data-testid="b1-request-history" className="space-y-2">
          <h2 className="font-bold text-primary">الملاحظات وسجل الحالة</h2>
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

      <div className="flex flex-col gap-2 sm:flex-row">
        {canResume && config ? (
          <Link
            to={routes.b1Service}
            params={{ service: serviceCode }}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            استكمال الطلب
          </Link>
        ) : null}
        <Link
          to={routes.list}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-primary px-4 text-sm font-bold text-primary"
        >
          العودة إلى الطلبات
        </Link>
      </div>
    </main>
  );
}
