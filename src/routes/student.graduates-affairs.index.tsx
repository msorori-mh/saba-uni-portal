import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, GraduationCap, Loader2, AlertTriangle, Briefcase, Calendar, Mail, Phone, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { FeatureFrozenNotice } from "@/components/portal/FeatureFrozenNotice";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addGraduateContactPointFn,
  cancelGraduateEventRegistrationFn,
  getGraduateSelfFileFn,
  grantGraduateConsentFn,
  listGraduateSelfConsentsFn,
  listGraduateSelfContactPointsFn,
  listGraduateSelfEventsFn,
  listGraduateSelfOpportunitiesFn,
  listGraduateSelfSurveysFn,
  registerGraduateForEventFn,
  reportGraduateEmploymentFn,
  resolveGraduateSelfSurfaceFn,
  revokeGraduateContactPointFn,
  submitGraduateSurveyResponseFn,
  withdrawGraduateConsentFn,
} from "@/lib/graduates-affairs/graduates-affairs.functions";
import type {
  GraduateSelfConsent,
  GraduateSelfSurvey,
} from "@/lib/graduates-affairs/rpc";
import { ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE } from "@/lib/graduates-affairs/account-continuity";
import { supabase } from "@/integrations/supabase/client";
import {
  portalFeatures,
  STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG,
} from "@/lib/portal-features";
import { GraduateFileCard } from "@/components/graduates-affairs/GraduateFileCard";
import { GraduateCommunicationPanel } from "@/components/graduates-affairs/GraduateCommunicationPanel";
import { GraduateSurveyCard } from "@/components/graduates-affairs/GraduateSurveyCard";
import { GraduateReportsPanel } from "@/components/graduates-affairs/GraduateReportsPanel";
import { gaPurposeLabelAr } from "@/components/graduates-affairs/display-format";

export const Route = createFileRoute("/student/graduates-affairs/")({
  component: StudentGraduatesAffairsPage,
});

/**
 * Graduate self-service surface.
 *
 * Authorization is enforced server-side through AUTH-04 RPCs:
 * - resolveGraduateSelfSurfaceFn derives ownership, official graduation state,
 *   and account continuity from the authenticated user.
 * - Only an approved graduate record with allowed continuity grants access.
 * - Corrected/revoked/absent records fail closed.
 */
function StudentGraduatesAffairsPage() {
  const navigate = useNavigate();
  const resolveSelf = useServerFn(resolveGraduateSelfSurfaceFn);

  const selfQuery = useQuery({
    queryKey: ["graduates-affairs", "self-context"],
    queryFn: () => resolveSelf({ data: { capability: "profile_self_service" } }),
    retry: 1,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="بوابة الطالب" actions={<NotificationsBell />} onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-4xl" dir="rtl">
        <div className="mb-4">
          <Link to="/student" className="text-sm text-primary hover:text-gold inline-flex items-center gap-1">
            <ArrowRight className="h-4 w-4" /> العودة إلى البوابة
          </Link>
        </div>
        <h1 className="font-display text-xl font-extrabold text-primary mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-gold" /> شؤون الخريجين
        </h1>

        {!portalFeatures.studentGraduatesAffairs ? (
          <FeatureFrozenNotice
            message={STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG}
            homeHref="/student"
            homeLabel="العودة لبوابة الطالب"
          />
        ) : selfQuery.isLoading ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center" role="status">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground" />
            <p className="mt-3 font-bold text-primary">جارٍ التحقق من صلاحية الخريج</p>
            <p className="text-sm text-muted-foreground">
              يتم قراءة السجل الرسمي وسياسة استمرارية الحساب من قاعدة البيانات.
            </p>
          </div>
        ) : selfQuery.data?.allowed && selfQuery.data.graduateRecordId ? (
          <GraduateSelfServiceDashboard graduateRecordId={selfQuery.data.graduateRecordId} />
        ) : (
          <div
            className="space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground"
            role="alert"
          >
            <p className="font-bold text-primary">الوصول غير مسموح به</p>
            <p>
              {selfQuery.data?.reason
                ? translateSelfDenial(selfQuery.data.reason)
                : "لا يوجد سجل خريج معتمد مرتبط بحسابك، أو سياسة استمرارية الحساب لا تسمح بالقدرة المطلوبة."}
            </p>
            <p className="text-xs">
              لا يكفي اجتياز مشروع التخرج أو ظهورك في قوائم المرشحين للوصول — يلزم قرار تخرج رسمي
              معتمد.
            </p>
          </div>
        )}
      </main>
    </PortalShell>
  );
}

function translateSelfDenial(reason: string): string {
  const map: Record<string, string> = {
    graduates_affairs_feature_flag_off: "الخدمة غير مفعّلة حالياً.",
    graduates_affairs_not_authenticated: "يجب تسجيل الدخول.",
    graduate_record_not_owned: "لا يوجد سجل خريج مملوك لهذا الحساب.",
    graduate_record_not_approved: "سجل الخريج قيد الانتظار ولم يُعتمد بعد.",
    graduate_record_corrected: "سجل الخريج مصحّح — غير مسموح بالوصول.",
    graduate_record_revoked: "سجل الخريج ملغى — غير مسموح بالوصول.",
    graduate_record_absent: "لا يوجد سجل خريج.",
    graduate_record_unavailable: "حالة السجل غير متاحة.",
    graduate_record_not_current: "السجل غير سارٍ.",
    account_continuity_policy_undecided: "لم تُعتمد سياسة استمرارية الحساب بعد.",
    account_continuity_policy_rejected: "سياسة استمرارية الحساب مرفوضة.",
    account_continuity_policy_not_in_force: "سياسة استمرارية الحساب غير سارية حالياً.",
    account_continuity_capability_not_allowed: "القدرة المطلوبة غير مسموح بها في سياسة الاستمرارية.",
  };
  return map[reason] ?? reason;
}

interface GraduateSelfServiceDashboardProps {
  graduateRecordId: string;
}

interface ContactPoint {
  id: string;
  channel_type: "email" | "phone";
  purpose_code: string;
  is_verified: boolean;
  is_revoked: boolean;
  created_at: string;
}

interface Opportunity {
  id: string;
  opportunity_type: string;
  title: string;
  description: string;
  published_at: string | null;
  closes_at: string | null;
  employer_name: string | null;
}

interface GraduateEvent {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "بريد إلكتروني",
  phone: "هاتف",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  career: "مهني",
  training: "تدريب",
  networking: "تواصل",
  survey: "استبيان",
  quality: "جودة",
};

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  job: "وظيفة",
  internship: "تدريب مهني",
  training: "دورة تدريبية",
};

const SURVEY_QUESTION_LABELS: Record<string, string> = {
  employment_status: "الحالة الوظيفية",
  comments: "ملاحظات إضافية",
};

const SURVEY_OPTION_LABELS: Record<string, string> = {
  employed: "موظف",
  self_employed: "عمل حر",
  seeking_work: "أبحث عن عمل",
  continuing_education: "مواصلة تعليم",
  not_seeking: "لا أبحث عن عمل",
  not_disclosed: "غير مصرّح",
};

function GraduateSelfServiceDashboard(props: GraduateSelfServiceDashboardProps) {
  const queryClient = useQueryClient();
  const getFile = useServerFn(getGraduateSelfFileFn);
  const listContactPoints = useServerFn(listGraduateSelfContactPointsFn);
  const [genericError, setGenericError] = useState<string | null>(null);

  const fileQuery = useQuery({
    queryKey: ["graduates-affairs", "self-file", props.graduateRecordId],
    queryFn: () => getFile({ data: { graduateRecordId: props.graduateRecordId } }),
  });

  const contactPointsQuery = useQuery({
    queryKey: ["graduates-affairs", "self-contact-points", props.graduateRecordId],
    queryFn: () => listContactPoints({ data: { graduateRecordId: props.graduateRecordId } }),
  });

  if (fileQuery.isLoading || contactPointsQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center" role="status">
        <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground" />
        <p className="mt-3 font-bold text-primary">جارٍ تحميل ملف الخريج</p>
        <p className="text-sm text-muted-foreground">يتم التحقق من السجل المعتمد والاستمرارية.</p>
      </div>
    );
  }

  if (fileQuery.isError || !fileQuery.data) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center" role="alert">
        <AlertTriangle className="mx-auto h-9 w-9 text-muted-foreground" />
        <p className="mt-3 font-bold text-primary">تعذّر تحميل ملف الخريج</p>
        <p className="text-sm text-muted-foreground">
          {fileQuery.error instanceof Error ? fileQuery.error.message : "السجل غير موجود أو غير مسموح بالوصول."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => fileQuery.refetch()}
        >
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </Button>
      </div>
    );
  }

  const file = fileQuery.data;
  const contactPoints: ContactPoint[] = Array.isArray(contactPointsQuery.data) ? contactPointsQuery.data : [];

  return (
    <div className="space-y-5" data-testid="graduate-self-service-dashboard">
      {genericError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {genericError}
        </div>
      )}

      <GraduateFileCard
        file={{
          record: {
            recordId: file.record.id,
            officialDecisionId: "",
            studentProfileId: "",
            effectiveGraduationDate: `${file.record.graduation_year}-06-30`,
            programId: file.record.program_id,
            departmentId: file.record.department_id,
            recordState: file.record.record_state,
            version: file.record.version,
          },
          profile: file.profile as never,
          contactPoints: contactPoints.map((cp) => ({
            contactPointId: cp.id,
            graduateRecordId: props.graduateRecordId,
            channelType: cp.channel_type,
            purposeCode: cp.purpose_code,
            verified: cp.is_verified,
            revoked: cp.is_revoked,
          })),
          consents: [],
          employmentEvents: [],
          followUps: [],
        }}
        accountPolicy={ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE}
        evaluatedAt={new Date().toISOString()}
      />

      <ContactPointsSection
        graduateRecordId={props.graduateRecordId}
        contactPoints={contactPoints}
        onInvalidate={() => {
          queryClient.invalidateQueries({ queryKey: ["graduates-affairs", "self-file", props.graduateRecordId] });
          queryClient.invalidateQueries({ queryKey: ["graduates-affairs", "self-contact-points", props.graduateRecordId] });
          setGenericError(null);
        }}
        onError={setGenericError}
      />

      <OpportunitiesSection graduateRecordId={props.graduateRecordId} />

      <EventsSection
        graduateRecordId={props.graduateRecordId}
        onInvalidate={() => setGenericError(null)}
        onError={setGenericError}
      />

      <GraduateCommunicationPanel
        consents={[]}
        contactPoints={contactPoints.map((cp) => ({
          contactPointId: cp.id,
          graduateRecordId: props.graduateRecordId,
          channelType: cp.channel_type,
          purposeCode: cp.purpose_code,
          verified: cp.is_verified,
          revoked: cp.is_revoked,
        }))}
        drafts={[]}
      />

      <SurveyEntrySection
        graduateRecordId={props.graduateRecordId}
        onSubmitted={() => setGenericError(null)}
        onError={setGenericError}
      />

      <EmploymentReportSection
        graduateRecordId={props.graduateRecordId}
        onSubmitted={() => setGenericError(null)}
        onError={setGenericError}
      />

      <ConsentManagementSection
        graduateRecordId={props.graduateRecordId}
        onSubmitted={() => setGenericError(null)}
        onError={setGenericError}
      />

      <GraduateReportsPanel cohortReports={[]} />
    </div>
  );
}

function ContactPointsSection(props: {
  graduateRecordId: string;
  contactPoints: ContactPoint[];
  onInvalidate: () => void;
  onError: (message: string) => void;
}) {
  const addContactPoint = useServerFn(addGraduateContactPointFn);
  const revokeContactPoint = useServerFn(revokeGraduateContactPointFn);
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [purpose, setPurpose] = useState("communications");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await addContactPoint({
        data: {
          graduateRecordId: props.graduateRecordId,
          channelType: channel,
          value: value.trim(),
          purposeCode: purpose,
        },
      });
      setValue("");
      props.onInvalidate();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر إضافة نقطة الاتصال.");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(true);
    try {
      await revokeContactPoint({ data: { contactPointId: id } });
      props.onInvalidate();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر إلغاء نقطة الاتصال.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section dir="rtl" className="rounded-lg border p-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Mail className="h-4 w-4 text-gold" /> نقاط الاتصال
      </h3>
      <ul className="mt-2 space-y-2 text-sm">
        {props.contactPoints.length === 0 && <li className="text-muted-foreground">لا توجد نقاط اتصال مسجلة.</li>}
        {props.contactPoints.map((point) => (
          <li key={point.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
            <span>
              {CHANNEL_LABELS[point.channel_type]} — {gaPurposeLabelAr(point.purpose_code)}
              {point.is_revoked ? (
                <span className="text-red-700"> (ملغاة)</span>
              ) : point.is_verified ? (
                <span className="text-green-700"> (موثقة)</span>
              ) : (
                <span className="text-amber-700"> (بانتظار التوثيق)</span>
              )}
            </span>
            {!point.is_revoked && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => handleRevoke(point.id)}
              >
                إلغاء
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_1fr_auto]">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "email" | "phone")}
        >
          <option value="email">بريد</option>
          <option value="phone">هاتف</option>
        </select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={channel === "email" ? "email@example.com" : "05xxxxxxxx"}
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        >
          <option value="communications">التواصل</option>
          <option value="surveys">الاستبيانات</option>
          <option value="events">الفعاليات</option>
          <option value="career_followup">المتابعة المهنية</option>
          <option value="employment_quality">جودة التوظيف</option>
        </select>
        <Button type="button" disabled={busy || !value.trim()} onClick={handleAdd}>
          إضافة
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        قيمة نقطة الاتصال تُحفظ آمنة في قاعدة البيانات ولا تُعرض هنا بعد الإضافة.
      </p>
    </section>
  );
}

function OpportunitiesSection(props: { graduateRecordId: string }) {
  const listOpportunities = useServerFn(listGraduateSelfOpportunitiesFn);

  const query = useQuery({
    queryKey: ["graduates-affairs", "self-opportunities", props.graduateRecordId],
    queryFn: () => listOpportunities({ data: { graduateRecordId: props.graduateRecordId } }),
  });

  const opportunities: Opportunity[] = Array.isArray(query.data) ? query.data : [];

  return (
    <section dir="rtl" className="rounded-lg border p-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-gold" /> الفرص المهنية المتاحة
      </h3>
      {query.isLoading ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground" />
      ) : opportunities.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">لا توجد فرص متاحة ضمن نطاقك حالياً.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {opportunities.map((opp) => (
            <li key={opp.id} className="rounded border p-3 text-sm">
              <p className="font-medium">{opp.title}</p>
              <p className="text-muted-foreground">{opp.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                النوع: {OPPORTUNITY_TYPE_LABELS[opp.opportunity_type] ?? opp.opportunity_type}
                {opp.employer_name ? ` · الجهة: ${opp.employer_name}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventsSection(props: {
  graduateRecordId: string;
  onInvalidate: () => void;
  onError: (message: string) => void;
}) {
  const listEvents = useServerFn(listGraduateSelfEventsFn);
  const registerForEvent = useServerFn(registerGraduateForEventFn);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["graduates-affairs", "self-events", props.graduateRecordId],
    queryFn: () => listEvents({ data: { graduateRecordId: props.graduateRecordId } }),
  });

  const events: GraduateEvent[] = Array.isArray(query.data) ? query.data : [];

  const handleRegister = async (eventId: string) => {
    setBusy(true);
    try {
      await registerForEvent({
        data: {
          eventId,
          graduateRecordId: props.graduateRecordId,
          consentId: "00000000-0000-0000-0000-000000000000",
        },
      });
      props.onInvalidate();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر التسجيل في الفعالية.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section dir="rtl" className="rounded-lg border p-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Calendar className="h-4 w-4 text-gold" /> الفعاليات المتاحة
      </h3>
      {query.isLoading ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground" />
      ) : events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">لا توجد فعاليات متاحة ضمن نطاقك حالياً.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {events.map((event) => (
            <li key={event.id} className="rounded border p-3 text-sm">
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                النوع: {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} ·{" "}
                {new Date(event.starts_at).toLocaleString("ar-SA")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={busy}
                onClick={() => handleRegister(event.id)}
              >
                تسجيل
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SurveyEntrySection(props: {
  graduateRecordId: string;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const listSurveys = useServerFn(listGraduateSelfSurveysFn);
  const submitResponse = useServerFn(submitGraduateSurveyResponseFn);
  const grantConsent = useServerFn(grantGraduateConsentFn);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const surveysQuery = useQuery({
    queryKey: ["graduates-affairs", "self-surveys", props.graduateRecordId],
    queryFn: () => listSurveys({ data: { graduateRecordId: props.graduateRecordId } }),
  });

  const surveys: GraduateSelfSurvey[] = Array.isArray(surveysQuery.data) ? surveysQuery.data : [];

  const setAnswer = (surveyVersionId: string, key: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [surveyVersionId]: { ...(prev[surveyVersionId] ?? {}), [key]: value },
    }));
  };

  const handleSubmit = async (survey: GraduateSelfSurvey) => {
    const current = answers[survey.survey_version_id] ?? {};
    const missing = (survey.questions ?? []).find(
      (q) => q.required && !String(current[q.key] ?? "").trim(),
    );
    if (missing) {
      props.onError("يرجى الإجابة على جميع الأسئلة الإلزامية.");
      return;
    }
    setBusyId(survey.survey_version_id);
    try {
      let consentId = survey.consent_id;
      if (!consentId) {
        consentId = (await grantConsent({
          data: {
            graduateRecordId: props.graduateRecordId,
            purposeCode: survey.purpose_code,
            noticeVersion: survey.notice_version,
          },
        })) as string;
      }
      const payload: Record<string, unknown> = {};
      for (const question of survey.questions ?? []) {
        const raw = String(current[question.key] ?? "").trim();
        if (!raw) continue;
        payload[question.key] = question.kind === "number" ? Number(raw) : raw;
      }
      await submitResponse({
        data: {
          surveyVersionId: survey.survey_version_id,
          graduateRecordId: props.graduateRecordId,
          consentId,
          answers: payload,
        },
      });
      setAnswers((prev) => ({ ...prev, [survey.survey_version_id]: {} }));
      await surveysQuery.refetch();
      props.onSubmitted();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر إرسال إجابة الاستبيان.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section dir="rtl" className="rounded-lg border p-4">
      <h3 className="font-semibold">الاستبيانات المتاحة</h3>
      <p className="text-sm text-muted-foreground">
        مشاركتك اختيارية، وتُسجَّل موافقتك تلقائياً عند الإرسال.
      </p>
      {surveysQuery.isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">جارٍ تحميل الاستبيانات…</p>
      ) : surveys.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">لا توجد استبيانات نشطة حالياً.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {surveys.map((survey) => (
            <li key={survey.survey_version_id} className="rounded border p-3">
              <p className="font-medium">{survey.title}</p>
              {survey.already_responded ? (
                <p className="mt-1 text-sm text-muted-foreground">تم إرسال إجابتك على هذا الاستبيان.</p>
              ) : (
                <>
                  <div className="mt-2 space-y-3">
                    {(survey.questions ?? []).map((question) => {
                      const value = answers[survey.survey_version_id]?.[question.key] ?? "";
                      return (
                        <div key={question.key} className="space-y-1">
                          <label className="text-sm font-medium">
                            {question.label ?? SURVEY_QUESTION_LABELS[question.key] ?? question.key}
                            {question.required ? " *" : ""}
                          </label>
                          {question.kind === "single_choice" ? (
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                              value={value}
                              onChange={(e) => setAnswer(survey.survey_version_id, question.key, e.target.value)}
                            >
                              <option value="">اختر…</option>
                              {(question.options ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {SURVEY_OPTION_LABELS[option] ?? option}
                                </option>
                              ))}
                            </select>
                          ) : question.kind === "free_text" ? (
                            <textarea
                              className="w-full rounded border p-2 text-sm"
                              rows={2}
                              maxLength={question.maxLength ?? 500}
                              value={value}
                              onChange={(e) => setAnswer(survey.survey_version_id, question.key, e.target.value)}
                            />
                          ) : (
                            <Input
                              type={question.kind === "number" ? "number" : "text"}
                              value={value}
                              onChange={(e) => setAnswer(survey.survey_version_id, question.key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    className="mt-3"
                    disabled={busyId === survey.survey_version_id}
                    onClick={() => handleSubmit(survey)}
                  >
                    إرسال الإجابة
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmploymentReportSection(props: {
  graduateRecordId: string;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const reportEmployment = useServerFn(reportGraduateEmploymentFn);
  const [status, setStatus] = useState<string>("employed");
  const [employerName, setEmployerName] = useState("");
  const [occupationTitle, setOccupationTitle] = useState("");
  const [relationship, setRelationship] = useState<string>("directly_related");
  const [startedOn, setStartedOn] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await reportEmployment({
        data: {
          graduateRecordId: props.graduateRecordId,
          employmentStatus: status as never,
          employerNameReported: employerName.trim() || null,
          occupationTitle: occupationTitle.trim() || null,
          specializationRelationship: relationship as never,
          startedOn: startedOn || null,
          endedOn: null,
        },
      });
      setEmployerName("");
      setOccupationTitle("");
      setStartedOn("");
      props.onSubmitted();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر إرسال بيانات التوظيف.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section dir="rtl" className="rounded-lg border p-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-gold" /> الإفادة بالحالة الوظيفية
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="employed">موظف</option>
          <option value="self_employed">عمل حر</option>
          <option value="seeking_work">أبحث عن عمل</option>
          <option value="continuing_education">مواصلة تعليم</option>
          <option value="not_seeking">لا أبحث عن عمل</option>
          <option value="not_disclosed">غير مصرّح</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="directly_related">مرتبط مباشرة بالتخصص</option>
          <option value="partially_related">مرتبط جزئياً</option>
          <option value="not_related">غير مرتبط</option>
          <option value="not_assessed">لم يُقيّم</option>
        </select>
        <Input
          value={employerName}
          onChange={(e) => setEmployerName(e.target.value)}
          placeholder="اسم الجهة (اختياري)"
        />
        <Input
          value={occupationTitle}
          onChange={(e) => setOccupationTitle(e.target.value)}
          placeholder="المسمى الوظيفي (اختياري)"
        />
        <Input
          type="date"
          value={startedOn}
          onChange={(e) => setStartedOn(e.target.value)}
          placeholder="تاريخ البدء"
        />
      </div>
      <Button type="button" className="mt-2" disabled={busy} onClick={handleSubmit}>
        إرسال الإفادة
      </Button>
    </section>
  );
}

const CONSENT_PURPOSES = [
  "communications",
  "surveys",
  "events",
  "career_followup",
  "employment_quality",
] as const;

const CONSENT_NOTICE_VERSION = "v1";

function ConsentManagementSection(props: {
  graduateRecordId: string;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const listConsents = useServerFn(listGraduateSelfConsentsFn);
  const grantConsent = useServerFn(grantGraduateConsentFn);
  const withdrawConsent = useServerFn(withdrawGraduateConsentFn);
  const [busy, setBusy] = useState(false);

  const consentsQuery = useQuery({
    queryKey: ["graduates-affairs", "self-consents", props.graduateRecordId],
    queryFn: () => listConsents({ data: { graduateRecordId: props.graduateRecordId } }),
  });

  const consents: GraduateSelfConsent[] = Array.isArray(consentsQuery.data) ? consentsQuery.data : [];
  const activeByPurpose = new Map(
    consents.filter((c) => c.consent_state === "granted").map((c) => [c.purpose_code, c]),
  );

  const handleGrant = async (purposeCode: string) => {
    setBusy(true);
    try {
      await grantConsent({
        data: {
          graduateRecordId: props.graduateRecordId,
          purposeCode,
          noticeVersion: CONSENT_NOTICE_VERSION,
        },
      });
      await consentsQuery.refetch();
      props.onSubmitted();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر منح الموافقة.");
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (consentId: string) => {
    setBusy(true);
    try {
      await withdrawConsent({ data: { consentId } });
      await consentsQuery.refetch();
      props.onSubmitted();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "تعذّر سحب الموافقة.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section dir="rtl" className="rounded-lg border p-4">
      <h3 className="font-semibold">إدارة الموافقات</h3>
      <p className="text-sm text-muted-foreground">
        يمكنك منح الموافقة لكل غرض أو سحبها في أي وقت.
      </p>
      {consentsQuery.isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">جارٍ تحميل الموافقات…</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {CONSENT_PURPOSES.map((purpose) => {
            const active = activeByPurpose.get(purpose);
            return (
              <li
                key={purpose}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
              >
                <span>
                  <span className="font-medium">{gaPurposeLabelAr(purpose)}</span>
                  <span className="mr-2 text-xs text-muted-foreground">
                    {active ? "ممنوحة" : "غير ممنوحة"}
                  </span>
                </span>
                {active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => handleWithdraw(active.id)}
                  >
                    سحب الموافقة
                  </Button>
                ) : (
                  <Button type="button" size="sm" disabled={busy} onClick={() => handleGrant(purpose)}>
                    منح الموافقة
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
