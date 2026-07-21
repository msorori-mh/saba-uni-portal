import {
  evaluateCommunicationEligibility,
  type GraduateCommunicationRequest,
  type GraduateContactPointView,
} from "@/lib/graduates-affairs/communications";
import type { GraduateConsent } from "@/lib/graduates-affairs/foundation";

const REASON_LABELS: Record<string, string> = {
  unknown_communication_purpose: "غرض التواصل غير معروف",
  missing_notice_version: "إصدار الإشعار مفقود",
  missing_communication_template: "قالب الرسالة مفقود",
  unknown_contact_point: "نقطة الاتصال غير معروفة",
  contact_point_channel_mismatch: "قناة الإرسال لا تطابق نقطة الاتصال",
  contact_point_purpose_mismatch: "غرض الرسالة لا يطابق غرض نقطة الاتصال",
  contact_point_revoked: "نقطة الاتصال ملغاة",
  contact_point_not_verified: "نقطة الاتصال غير موثقة",
  missing_active_purpose_consent: "لا توجد موافقة فعالة لهذا الغرض وإصدار الإشعار",
};

/**
 * Communication eligibility panel. Display only: it surfaces the domain
 * decision for each draft and never exposes protected contact values. Hiding
 * or disabling controls here is not an authorization boundary — the SQL
 * guard (graduate_communication_consent_guard) is.
 */
export function GraduateCommunicationPanel(props: {
  consents: readonly GraduateConsent[];
  contactPoints: readonly GraduateContactPointView[];
  drafts: readonly GraduateCommunicationRequest[];
}) {
  return (
    <section dir="rtl" aria-labelledby="graduate-communication-title" className="rounded-lg border p-4">
      <h3 id="graduate-communication-title" className="font-semibold">التواصل مع الخريج</h3>

      <h4 className="mt-3 text-sm font-medium">نقاط الاتصال</h4>
      <ul className="mt-1 list-disc ps-5 text-sm" aria-label="نقاط اتصال الخريج">
        {props.contactPoints.length === 0 && <li>لا توجد نقاط اتصال مسجلة.</li>}
        {props.contactPoints.map((point) => (
          <li key={point.contactPointId}>
            {point.channelType === "email" ? "بريد إلكتروني" : "هاتف"} — الغرض: {point.purposeCode}
            {point.revoked ? (
              <span className="text-red-700"> (ملغاة)</span>
            ) : point.verified ? (
              <span className="text-green-700"> (موثقة)</span>
            ) : (
              <span className="text-amber-700"> (بانتظار التوثيق)</span>
            )}
          </li>
        ))}
      </ul>

      <h4 className="mt-3 text-sm font-medium">مسودات الرسائل</h4>
      <ul className="mt-1 space-y-2 text-sm" aria-label="أهلية مسودات الرسائل">
        {props.drafts.length === 0 && <li>لا توجد مسودات.</li>}
        {props.drafts.map((draft) => {
          const eligibility = evaluateCommunicationEligibility({
            request: draft,
            consents: props.consents,
            contactPoints: props.contactPoints,
          });
          return (
            <li key={`${draft.contactPointId}:${draft.templateCode}`} className="rounded border p-2">
              <p>
                القالب: {draft.templateCode} — القناة: {draft.channel === "email" ? "بريد إلكتروني" : "هاتف"}
              </p>
              {eligibility.ok ? (
                <p className="text-green-700">جاهزة للإرسال ضمن الموافقة المسجلة.</p>
              ) : (
                <p className="text-amber-700">
                  غير جاهزة: {REASON_LABELS[eligibility.reason] ?? eligibility.reason}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
