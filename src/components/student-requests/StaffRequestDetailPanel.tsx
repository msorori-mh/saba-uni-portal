import { Loader2, Paperclip, User } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStudentRequestAttachmentUrl } from "@/lib/admin-student-requests.functions";
import { getStudentRequestFeeProcessingContext } from "@/lib/student-request-fee.functions";
import { getFeeProcessingCapability } from "@/lib/student-requests/fee-processing-capability.functions";
import type { StaffRequestDetail } from "@/lib/student-requests/staff-inbox-ui";
import { getStaffRoleLabelAr } from "@/lib/student-requests/staff-inbox-ui";
import {
  shouldShowFeeAssessmentForm,
  shouldShowFeeStatusDisplay,
  shouldShowPaymentConfirmationForm,
} from "@/lib/student-requests/fee-processing-ui-policy";
import { StudentRequestFormDataView } from "@/components/student-requests/StudentRequestFormDataView";
import { StaffRequestWorkflowTimeline } from "@/components/student-requests/StaffRequestWorkflowTimeline";
import { StaffRequestActionPanel } from "@/components/student-requests/StaffRequestActionPanel";
import { B1StaffStepActionSection } from "@/components/student-requests/b1/B1StaffStepActionSection";
import { isB1StaffRoutedRequestType } from "@/lib/student-requests/b1-staff-action-routing";
import { B1_STEP_LABELS_AR } from "@/lib/student-requests/b1-ui/service-config";
import { StaffRequestSignaturePanel } from "@/components/student-requests/StaffRequestSignaturePanel";
import { EnrollmentCertificateIssueButton } from "@/components/student-requests/EnrollmentCertificateIssueButton";
import { StaffRequestFinanceClearancePanel } from "@/components/student-requests/StaffRequestFinanceClearancePanel";
import { StaffRequestArchivePanel } from "@/components/student-requests/StaffRequestArchivePanel";
import { StudentRequestFeeAssessmentForm } from "@/components/student-requests/StudentRequestFeeAssessmentForm";
import { StudentRequestPaymentConfirmationForm } from "@/components/student-requests/StudentRequestPaymentConfirmationForm";
import { StudentRequestFeeStatusDisplay } from "@/components/student-requests/StudentRequestFeeStatusDisplay";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <div className="text-muted-foreground w-28 shrink-0">{label}:</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function SignedAttachment({ path, name }: { path: string; name: string }) {
  const urlFn = useServerFn(getStudentRequestAttachmentUrl);
  const open = async () => {
    try {
      const { signedUrl } = await urlFn({ data: { path } });
      window.open(signedUrl, "_blank");
    } catch {
      toast.error("تعذر فتح المرفق");
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      className="text-xs inline-flex items-center gap-1 border bg-muted/30 px-2 py-1 rounded hover:bg-muted"
    >
      <Paperclip className="h-3 w-3" /> {name}
    </button>
  );
}

const STUDENT_STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  graduated: "خريج",
  suspended: "موقوف القيد",
  withdrawn: "منسحب",
};

function StaffRequestFeeProcessingSection({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const feeContextFn = useServerFn(getStudentRequestFeeProcessingContext);
  const capabilityFn = useServerFn(getFeeProcessingCapability);

  const {
    data: feeCtx,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["student-request-fee-context", requestId],
    queryFn: () => feeContextFn({ data: { requestId } }),
    retry: 1,
  });

  const { data: capability } = useQuery({
    queryKey: ["fee-processing-capability"],
    queryFn: () => capabilityFn(),
    staleTime: 5 * 60 * 1000,
  });

  const refreshAfterFeeAction = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["student-request-fee-context", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-student-request", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/10 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        جاري تحميل سياق الرسوم...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        تعذر تحميل سياق الرسوم: {error instanceof Error ? error.message : "خطأ غير معروف"}
      </div>
    );
  }

  if (!feeCtx) return null;

  const fee = feeCtx.feeAssessment;
  const showStatus = shouldShowFeeStatusDisplay(Boolean(fee));
  // `can_execute_current_step` is false for fee steps (assess_fee/confirm_payment
  // are not actor actions), so fall back to the processing-role capability.
  // Server RPCs remain the authorization boundary.
  const showAssess = shouldShowFeeAssessmentForm({
    actionType: feeCtx.actionType,
    stepStatus: feeCtx.stepStatus,
    canExecuteStep: feeCtx.canExecuteCurrentStep || Boolean(capability?.canAssessFee),
    hasActiveFeeAssessment: Boolean(fee),
  });
  const showConfirm = shouldShowPaymentConfirmationForm({
    actionType: feeCtx.actionType,
    stepStatus: feeCtx.stepStatus,
    canExecuteStep: feeCtx.canExecuteCurrentStep || Boolean(capability?.canConfirmPayment),
    paymentStatus: fee?.paymentStatus ?? null,
  });

  if (!showStatus && !showAssess && !showConfirm) return null;

  return (
    <section className="space-y-3" data-testid="fee-processing-section">
      <div className="text-xs font-bold text-primary">الرسوم والسداد</div>
      {showStatus && fee && (
        <StudentRequestFeeStatusDisplay
          amountYer={fee.amount}
          paymentStatus={fee.paymentStatus}
          currency={fee.currency}
          paymentReference={fee.paymentReference}
        />
      )}
      {showAssess && (
        <StudentRequestFeeAssessmentForm
          requestId={requestId}
          currentStepKey={feeCtx.stepKey ?? "fee_assessment"}
          onAssessed={refreshAfterFeeAction}
        />
      )}
      {showConfirm && fee && (
        <StudentRequestPaymentConfirmationForm
          requestId={requestId}
          currentStepKey={feeCtx.stepKey ?? "payment_confirmation"}
          existingPaymentStatus={fee.paymentStatus}
          onConfirmed={refreshAfterFeeAction}
        />
      )}
      {!showAssess && !showConfirm && showStatus && (
        <p className="text-[11px] text-muted-foreground">
          يمكنك الاطلاع على حالة الرسوم. إجراءات التقييم/التأكيد تظهر فقط للمخول في الخطوة النشطة.
        </p>
      )}
    </section>
  );
}

export function StaffRequestDetailPanel({
  detail,
  loading,
  workflowRuntimeAvailable,
  dataSourceNote,
}: {
  detail: StaffRequestDetail | null;
  loading: boolean;
  workflowRuntimeAvailable: boolean;
  dataSourceNote?: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-8 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        اختر طلباً من القائمة لعرض التفاصيل.
      </div>
    );
  }

  const statusBadge = "text-[10px] font-bold px-2 py-0.5 rounded bg-secondary";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/20 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold text-primary text-sm">{detail.title}</h2>
          <span className={statusBadge}>{detail.statusLabelAr}</span>
          <span className="text-[10px] text-muted-foreground">{detail.requestTypeNameAr}</span>
        </div>
        {detail.requestNumber && (
          <div className="text-xs text-muted-foreground font-mono">
            رقم الطلب: {detail.requestNumber}
          </div>
        )}
        {dataSourceNote && (
          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            {dataSourceNote}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
        <section>
          <div className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> بيانات الطالب
          </div>
          <div className="rounded-lg border bg-muted/10 p-3 space-y-1.5">
            <DetailRow label="الاسم" value={detail.student.fullNameAr ?? "—"} />
            <DetailRow label="الرقم الأكاديمي" value={detail.student.academicNumber ?? "—"} />
            <DetailRow label="القسم" value={detail.student.departmentNameAr ?? "—"} />
            <DetailRow label="البرنامج" value={detail.student.programNameAr ?? "—"} />
            {detail.student.levelNameAr && (
              <DetailRow label="المستوى" value={detail.student.levelNameAr} />
            )}
            {detail.student.studySystemLabelAr && (
              <DetailRow label="نظام الدراسة" value={detail.student.studySystemLabelAr} />
            )}
            {detail.student.enrollmentStatusLabelAr && (
              <DetailRow label="حالة القيد" value={detail.student.enrollmentStatusLabelAr} />
            )}
            {detail.student.status && (
              <DetailRow
                label="حالة الملف"
                value={STUDENT_STATUS_LABEL[detail.student.status] ?? detail.student.status}
              />
            )}
          </div>
        </section>

        <section>
          <div className="text-xs font-bold text-primary mb-2">بيانات الطلب</div>
          <div className="space-y-1.5 mb-3">
            {detail.description && (
              <DetailRow label="الوصف" value={detail.description} />
            )}
            {detail.studentNotes && (
              <DetailRow label="ملاحظات الطالب" value={detail.studentNotes} />
            )}
            {detail.createdAt && (
              <DetailRow
                label="تاريخ الإنشاء"
                value={new Date(detail.createdAt).toLocaleString("ar-EG")}
              />
            )}
            {detail.submittedAt && (
              <DetailRow
                label="تاريخ التقديم"
                value={new Date(detail.submittedAt).toLocaleString("ar-EG")}
              />
            )}
            {detail.currentRoleKey && (
              <DetailRow
                label="الدور الحالي"
                value={getStaffRoleLabelAr(detail.currentRoleKey)}
              />
            )}
          </div>

          <div className="text-[11px] font-bold text-muted-foreground mb-2">
            بيانات النموذج
          </div>
          <StudentRequestFormDataView
            requestTypeCode={detail.requestTypeCode}
            formData={detail.formData}
          />
        </section>

        {detail.attachments.length > 0 && (
          <section>
            <div className="text-xs font-bold text-primary mb-2">المرفقات</div>
            <div className="flex flex-wrap gap-1.5">
              {detail.attachments.map((a) => (
                <SignedAttachment key={a.id} path={a.fileUrl} name={a.fileName} />
              ))}
            </div>
          </section>
        )}

        {detail.privacyNoticeAr && (
          <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/20">
            {detail.privacyNoticeAr}
          </div>
        )}

        <StaffRequestWorkflowTimeline
          steps={detail.workflowSteps}
          isPreview={detail.workflowIsPreview}
        />

        {(() => {
          const active = detail.activeStep;
          const activeType = active?.actionType ?? null;

          const isB1ServiceForGating = isB1StaffRoutedRequestType(detail.requestTypeCode);
          // B1 five services confirm external payment through the dedicated B1
          // revenue receipt card, never through the generic fee section (which
          // renders nothing without an in-portal fee assessment).
          const isB1PaymentConfirmation =
            isB1ServiceForGating && activeType === "confirm_payment";
          const showFee =
            !isB1PaymentConfirmation &&
            (activeType === "assess_fee" || activeType === "confirm_payment");
          const showFinanceClearance = activeType === "clearance" || activeType === "finance_clearance";
          // B1 five services execute `archive` literally through the B1 atomic
          // panel; only non-B1 services use the generic archive panel.
          const showArchivePanel = activeType === "archive" && !isB1ServiceForGating;
          const showEcIssueButton = activeType === "issue_document";
          const showSignPanel = activeType === "sign";
          const isReviewStep = activeType === "review";
          const isB1Service = isB1ServiceForGating;

          return (
            <>
              {showFee && <StaffRequestFeeProcessingSection requestId={detail.id} />}

              {showFinanceClearance && (
                <StaffRequestFinanceClearancePanel
                  requestId={detail.id}
                  requestTypeCode={detail.requestTypeCode}
                />
              )}

              {showArchivePanel && (
                <StaffRequestArchivePanel
                  requestId={detail.id}
                  workflowStepRuntimeId={active?.id ?? null}
                  actionType={activeType}
                  isActionable={active?.isActionable ?? false}
                  workflowRuntimeAvailable={workflowRuntimeAvailable}
                />
              )}

              {showEcIssueButton && (
                <EnrollmentCertificateIssueButton
                  requestId={detail.id}
                  requestTypeCode={detail.requestTypeCode}
                  currentStep={
                    active
                      ? {
                          id: active.id,
                          stepKey: active.stepKey,
                          status: "current",
                          isPreview: false,
                        }
                      : null
                  }
                  hasActiveOfficialDocument={false}
                  canActOnIssueDocument={workflowRuntimeAvailable}
                />
              )}

              {showSignPanel && (
                <StaffRequestSignaturePanel
                  requestId={detail.id}
                  workflowStepRuntimeId={active?.id ?? null}
                  stepKey={active?.stepKey ?? null}
                  actionType={activeType}
                  isActionable={active?.isActionable ?? false}
                  workflowRuntimeAvailable={workflowRuntimeAvailable}
                />
              )}

              {isB1Service && !showSignPanel && !showArchivePanel && !showFee && !showEcIssueButton && (
                <B1StaffStepActionSection
                  requestId={detail.id}
                  requestTypeCode={detail.requestTypeCode}
                  stepId={active?.id ?? null}
                  stepKey={active?.stepKey ?? null}
                  stepLabelAr={
                    (active?.stepKey && B1_STEP_LABELS_AR[active.stepKey]) ||
                    active?.stepKey ||
                    "المرحلة النشطة"
                  }
                  configuredActionType={activeType}
                  allowedAction={activeType}
                  isActionable={active?.isActionable ?? false}
                />
              )}

              {!isB1Service && !showSignPanel && !showArchivePanel && (
                <StaffRequestActionPanel
                  requestId={detail.id}
                  requestTypeCode={detail.requestTypeCode}
                  currentStepKey={active?.stepKey ?? null}
                  currentRoleKey={detail.currentRoleKey}
                  workflowStepRuntimeId={active?.id ?? null}
                  activeStepActionType={activeType}
                  activeStepIsActionable={active?.isActionable ?? false}
                  workflowRuntimeAvailable={workflowRuntimeAvailable}
                  requestUpdatedAt={detail.updatedAt}
                  canExecuteReview={isReviewStep && (active?.isActionable ?? false)}
                />
              )}
            </>
          );
        })()}

      </div>
    </div>
  );
}
