import { AlertCircle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import {
  getStudentRequestAvailabilityBadge,
  getStudentRequestUiEligibility,
  type StudentRequestUiEligibilityInput,
} from "@/lib/student-requests/request-eligibility-ui";
import { getStudentRequestTypeDisplayName } from "@/lib/student-requests/request-type-registry";

type Props = StudentRequestUiEligibilityInput & {
  className?: string;
};

const BADGE_STYLES = {
  available: "bg-emerald-100 text-emerald-900 border-emerald-200",
  needs_verification: "bg-amber-100 text-amber-900 border-amber-200",
  blocked: "bg-rose-100 text-rose-900 border-rose-200",
  unsupported: "bg-zinc-200 text-zinc-800 border-zinc-300",
} as const;

const BADGE_ICONS = {
  available: CheckCircle2,
  needs_verification: HelpCircle,
  blocked: XCircle,
  unsupported: AlertCircle,
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
}: Props) {
  if (!requestTypeCode) return null;

  const eligibility = getStudentRequestUiEligibility({
    requestTypeCode,
    studentContext,
    typePickerState,
    formValidation,
    serviceWindow,
    formSupported,
    hasSubject,
  });

  const { labelAr } = getStudentRequestAvailabilityBadge(eligibility.badge);
  const Icon = BADGE_ICONS[eligibility.badge];
  const typeName = getStudentRequestTypeDisplayName(requestTypeCode);

  return (
    <div
      dir="rtl"
      className={`rounded-xl border p-4 space-y-3 ${BADGE_STYLES[eligibility.badge]} ${className}`}
      role="status"
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

      {eligibility.notices.length > 0 && (
        <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
          {eligibility.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

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
  );
}

export function useStudentRequestUiEligibility(input: StudentRequestUiEligibilityInput) {
  return getStudentRequestUiEligibility(input);
}
