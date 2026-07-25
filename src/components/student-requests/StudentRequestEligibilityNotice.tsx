import { AlertCircle, HelpCircle, XCircle } from "lucide-react";
import {
  getStudentRequestAvailabilityBadge,
  getStudentRequestUiEligibility,
  type StudentRequestUiEligibilityInput,
} from "@/lib/student-requests/request-eligibility-ui";
import { getStudentRequestTypeDisplayName } from "@/lib/student-requests/request-type-registry";

type Props = StudentRequestUiEligibilityInput & {
  className?: string;
  /**
   * When provided and the request already exists in a post-draft lifecycle
   * state, the eligibility notice hides entirely. Creation-time eligibility
   * MUST NOT be re-evaluated for a request that was already accepted by the
   * system — see STUDENT-REQUEST-DETAIL-ELIGIBILITY-BANNER-UX-FIX-01.
   */
  existingRequestStatus?: string | null;
};

/**
 * Request lifecycle statuses for which creation-time eligibility must not be
 * shown. The detail page uses its own status-specific banners (returned /
 * rejected / cancelled) instead.
 */
const HIDDEN_FOR_EXISTING_REQUEST = new Set([
  "submitted",
  "in_review",
  "under_review",
  "processing",
  "in_progress",
  "approved",
  "completed",
  "archived",
  "returned_for_completion",
  "returned",
  "rejected",
  "cancelled",
]);

const BLOCKED_CARD_STYLES = {
  blocked: "bg-rose-100 text-rose-900 border-rose-200",
  unsupported: "bg-zinc-200 text-zinc-800 border-zinc-300",
} as const;

export function StudentRequestEligibilityNotice({
  requestTypeCode,
  studentContext,
  typePickerState,
  formValidation,
  serviceWindow,
  formSupported,
  hasSubject,
  className = "",
  existingRequestStatus = null,
}: Props) {
  if (!requestTypeCode) return null;

  // Never re-evaluate creation eligibility for an already-submitted request.
  if (
    existingRequestStatus &&
    HIDDEN_FOR_EXISTING_REQUEST.has(existingRequestStatus.toLowerCase())
  ) {
    return null;
  }

  const eligibility = getStudentRequestUiEligibility({
    requestTypeCode,
    studentContext,
    typePickerState,
    formValidation,
    serviceWindow,
    formSupported,
    hasSubject,
  });

  const informationCard =
    eligibility.notices.length > 0 ? (
      <div
        dir="rtl"
        role="note"
        className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
      >
        <div className="font-bold mb-1">معلومات الخدمة</div>
        <ul className="list-disc list-inside space-y-0.5">
          {eligibility.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      </div>
    ) : null;

  // Eligible path: no big card. The type picker itself already shows the
  // service as selectable; a positive banner would be visual noise.
  if (eligibility.badge === "available") {
    return informationCard && className ? (
      <div className={className}>{informationCard}</div>
    ) : (
      informationCard
    );
  }

  const typeName = getStudentRequestTypeDisplayName(requestTypeCode);

  // Needs-verification path: compact neutral hint, not a red error card.
  if (eligibility.badge === "needs_verification") {
    const hints = eligibility.warnings;
    if (hints.length === 0) return informationCard;
    return (
      <div className={`space-y-2 ${className}`}>
        {informationCard}
        <div
          dir="rtl"
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 p-3 text-xs space-y-1"
        >
          <div className="flex items-center gap-1.5 font-bold">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>تعذر إكمال التحقق من خدمة «{typeName}»</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 opacity-90">
            {hints.slice(0, 4).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // blocked / unsupported: full styled card with reasons.
  const { labelAr } = getStudentRequestAvailabilityBadge(eligibility.badge);
  const Icon = eligibility.badge === "blocked" ? XCircle : AlertCircle;
  const styles = BLOCKED_CARD_STYLES[eligibility.badge];

  return (
    <div className={`space-y-2 ${className}`}>
      {informationCard}
      <div
        dir="rtl"
        className={`rounded-xl border p-4 space-y-3 ${styles}`}
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 shrink-0" />
            <div>
              <div className="text-sm font-bold">{typeName}</div>
              <div className="text-[11px] opacity-80">حالة التوفر والأهلية (واجهة)</div>
            </div>
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full border border-current/20 bg-white/40">
            {labelAr}
          </span>
        </div>

        {eligibility.warnings.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="font-bold">تنبيهات</div>
            <ul className="space-y-0.5 list-disc list-inside">
              {eligibility.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {eligibility.blockedReasons.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="font-bold">أسباب المنع (واجهة)</div>
            <ul className="space-y-0.5 list-disc list-inside">
              {eligibility.blockedReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] border-t border-current/10 pt-2 opacity-80">
          {eligibility.rpcNoticeAr}
        </p>
      </div>
    </div>
  );
}

export function useStudentRequestUiEligibility(input: StudentRequestUiEligibilityInput) {
  return getStudentRequestUiEligibility(input);
}

export { HIDDEN_FOR_EXISTING_REQUEST };
