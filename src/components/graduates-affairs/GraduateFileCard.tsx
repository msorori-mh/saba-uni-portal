import {
  evaluateAccountContinuityAccess,
  type AccountContinuityPolicy,
} from "@/lib/graduates-affairs/account-continuity";
import {
  summarizeGraduateFile,
  type GraduateFile,
} from "@/lib/graduates-affairs/graduate-file";
import type { EmploymentStatus, GraduationDecisionState } from "@/lib/graduates-affairs/foundation";
import type { GraduateConsentPurpose } from "@/lib/graduates-affairs/consents";

const RECORD_STATE_LABELS: Record<GraduationDecisionState, string> = {
  pending: "قيد الانتظار",
  approved: "معتمد",
  corrected: "مصحّح",
  revoked: "ملغى",
};

const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  employed: "موظف",
  self_employed: "عمل حر",
  seeking_work: "يبحث عن عمل",
  continuing_education: "مواصلة التعليم",
  not_seeking: "لا يبحث عن عمل",
  not_disclosed: "غير مصرّح",
};

const PURPOSE_LABELS: Record<GraduateConsentPurpose, string> = {
  career_followup: "المتابعة المهنية",
  communications: "التواصل",
  surveys: "الاستبيانات",
  events: "الفعاليات",
  employment_quality: "جودة التوظيف",
};

const VISIBILITY_LABELS = {
  private: "خاص",
  graduates_affairs: "شؤون الخريجين",
  public_opt_in: "عام بموافقة الخريج",
} as const;

function accountContinuityLabel(policy: AccountContinuityPolicy, at: string): string {
  const evaluation = evaluateAccountContinuityAccess(policy, "portal_sign_in", at);
  if (evaluation.ok) {
    return "معتمدة — الدخول إلى البوابة مسموح";
  }
  switch (evaluation.reason) {
    case "account_continuity_policy_undecided":
      return "سياسة استمرارية الحساب قيد الاعتماد (لم تُحسم)";
    case "account_continuity_policy_rejected":
      return "سياسة استمرارية الحساب مرفوضة";
    case "account_continuity_policy_not_in_force":
      return "سياسة استمرارية الحساب غير سارية حالياً";
    default:
      return "استمرارية الحساب غير متاحة";
  }
}

/**
 * Comprehensive graduate file card. Presentational only — the summary is
 * computed by the domain layer and this panel never exposes protected
 * contact values.
 */
export function GraduateFileCard(props: {
  file: GraduateFile;
  accountPolicy: AccountContinuityPolicy;
  evaluatedAt: string;
}) {
  const summary = summarizeGraduateFile(props.file);
  return (
    <section dir="rtl" aria-labelledby="graduate-file-title" className="rounded-lg border p-4">
      <h3 id="graduate-file-title" className="font-semibold">ملف الخريج الشامل</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt>حالة السجل</dt>
        <dd>{RECORD_STATE_LABELS[summary.recordState]}</dd>
        <dt>تاريخ التخرج</dt>
        <dd>{props.file.record.effectiveGraduationDate}</dd>
        <dt>إصدار السجل</dt>
        <dd>{summary.version}</dd>
        <dt>الملف التعريفي</dt>
        <dd>
          {summary.hasProfile
            ? `موجود — الظهور: ${summary.profileVisibility ? VISIBILITY_LABELS[summary.profileVisibility] : "—"}`
            : "غير مكتمل"}
        </dd>
        <dt>قنوات الاتصال الموثقة</dt>
        <dd>
          {summary.usableContactChannels.length > 0
            ? summary.usableContactChannels
                .map((channel) => (channel === "email" ? "بريد إلكتروني" : "هاتف"))
                .join("، ")
            : "لا توجد"}
        </dd>
        <dt>الموافقات الفعالة</dt>
        <dd>
          {summary.activeConsentPurposes.length > 0
            ? summary.activeConsentPurposes.map((purpose) => PURPOSE_LABELS[purpose]).join("، ")
            : "لا توجد"}
        </dd>
        <dt>الحالة الوظيفية الحالية</dt>
        <dd>
          {summary.currentEmploymentStatus
            ? `${EMPLOYMENT_STATUS_LABELS[summary.currentEmploymentStatus]}${summary.currentEmploymentVerified ? " (موثقة)" : " (بإفادة الخريج)"}`
            : "لم تُسجل بعد"}
        </dd>
        <dt>متابعات مفتوحة</dt>
        <dd>{summary.openFollowUps}</dd>
      </dl>
      <p className="mt-3 border-t pt-2 text-sm text-muted-foreground" aria-label="حالة سياسة استمرارية الحساب">
        {accountContinuityLabel(props.accountPolicy, props.evaluatedAt)}
      </p>
    </section>
  );
}
