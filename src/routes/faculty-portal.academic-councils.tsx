import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  FilePlus2,
  Loader2,
  Paperclip,
  Pencil,
  ScrollText,
  Users2,
  Archive,
  Send,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  Plus,
  CheckCircle2,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { formatBytes, getExt, policyHint, validateUpload } from "@/lib/storage-validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  scheduleCouncilMeeting,
  updateCouncilMeeting,
  getAvailableTopicsForAgenda,
  addTopicToAgenda,
  addManualAgendaItem,
  updateAgendaItem,
  reorderAgendaItems,
  finalizeMeetingAgenda,
  reviewCouncilTopic,
  type CouncilLinkMemberRole,
  type CouncilAgendaItem,
  type AvailableTopicForAgenda,
} from "@/lib/admin-councils.functions";
import {
  getCouncilTopicAttachmentSignedUrl,
  getCouncilTopicAttachments,
  getMyAcademicCouncilMembershipsV2,
  getMyCouncilMeetingsV2,
  getMyCouncilTopics,
  getAgendaItemsForMeeting,
  prepareCouncilTopicAttachmentUpload,
  submitCouncilTopic,
  getOpenIntakeMeetingsForMember,
  getCouncilTopicReviewQueue,
  editCouncilTopic,
  resubmitCouncilTopic,
  type CouncilTopicAttachmentItem,
  type MyCouncilMembershipV2,
  type CouncilMeetingV2Item,
  type MyCouncilTopicItem,
  type OpenIntakeMeetingItem,
  type CouncilTopicReviewQueueItem,
} from "@/lib/faculty-councils.functions";
import { CouncilSessionAndGovernanceWorkspace } from "@/components/councils/CouncilSessionAndGovernanceWorkspace";

export const Route = createFileRoute("/faculty-portal/academic-councils")({
  head: () => ({
    meta: [
      { title: "مجالسي الأكاديمية — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyAcademicCouncilsPage,
});

const MEMBER_ROLE_LABELS: Record<CouncilLinkMemberRole, string> = {
  chair: "رئيس المجلس",
  secretary: "أمين السر",
  member: "عضو",
  viewer: "مطّلع",
};

const COUNCIL_TYPE_LABELS: Record<string, string> = {
  college: "مجلس الكلية",
  department: "مجلس قسم",
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: "مجدول",
  intake_open: "استقبال الموضوعات مفتوح",
  intake_closed: "استقبال الموضوعات مغلق",
  agenda_ready: "جدول الأعمال جاهز",
  in_session: "جلسة قيد الانعقاد",
  minutes_draft: "مسودة محضر",
  minutes_locked: "محضر مقفل",
  archived: "مؤرشف",
  cancelled: "ملغى",
};

const TOPIC_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "مقدّم",
  under_review: "قيد المراجعة",
  needs_completion: "مطلوب استكمال",
  accepted_for_agenda: "مقبول للجدول",
  rejected: "مرفوض",
  added_to_agenda: "مُضاف إلى جدول الأعمال",
  deferred: "مؤجّل",
  decided: "مُبت فيه",
  closed: "مغلق",
  archived: "مؤرشف",
};

const MEETING_SCHEDULE_DENIED_UI = "لا تملك صلاحية جدولة اجتماع لهذا المجلس.";
const MEETING_UPDATE_DENIED_UI = "لا تملك صلاحية تعديل هذا الاجتماع.";
const MEETINGS_LOAD_FAILED_UI = "تعذر تحميل الاجتماعات.";
const MEETING_SAVE_FAILED_UI = "تعذر حفظ الاجتماع.";
const AGENDA_LOAD_FAILED_UI = "تعذر تحميل جدول الأعمال.";
const AGENDA_TOPICS_LOAD_FAILED_UI = "تعذر تحميل الموضوعات المتاحة.";
const AGENDA_WRITE_DENIED_UI = "لا تملك صلاحية إدارة جدول أعمال هذا المجلس.";
const AGENDA_TOPIC_ALREADY_ADDED_UI = "هذا الموضوع مضاف مسبقاً إلى جدول الأعمال.";
const AGENDA_REORDER_FAILED_UI = "تعذر حفظ ترتيب جدول الأعمال.";
const AGENDA_FINALIZE_DENIED_UI = "لا تملك صلاحية اعتماد جدول الأعمال.";
const AGENDA_SAVE_FAILED_UI = "تعذر حفظ جدول الأعمال.";
const SESSION_EXPIRED_UI = "انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى.";

const MEETING_STATUS_OPTIONS = [
  "scheduled",
  "intake_open",
  "intake_closed",
  "agenda_ready",
  "in_session",
  "minutes_draft",
  "minutes_locked",
  "archived",
  "cancelled",
] as const;

const SUBMIT_ELIGIBLE_ROLES = new Set<string>(["chair", "secretary", "member", "vice_chair"]);

const PERMISSION_DENIED_MESSAGE = "لا تملك صلاحية تقديم موضوع لهذا المجلس.";
const SESSION_EXPIRED_MESSAGE =
  "انتهت جلسة تسجيل الدخول، يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.";
const SUBMIT_GENERIC_ERROR_MESSAGE = "تعذّر إرسال الموضوع. يرجى المحاولة مرة أخرى.";
const MAX_TOPIC_ATTACHMENTS = 5;
const PARTIAL_UPLOAD_MESSAGE =
  "تم إنشاء الموضوع، لكن تعذر رفع بعض المرفقات. يرجى المحاولة لاحقاً أو التواصل مع الإدارة.";
const ATTACHMENT_UPLOAD_DENIED_MESSAGE = "لا تملك صلاحية رفع مرفقات لهذا الموضوع.";
const ATTACHMENT_OPEN_ERROR_MESSAGE = "تعذر فتح المرفق حالياً.";

const ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Heuristic: a message composed only of printable ASCII is a raw technical
 * (English/driver) error and must be replaced by a generic Arabic message.
 */
const PRINTABLE_ASCII_RE = /^[ -~]+$/;
function isRawTechnicalMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length > 0 && PRINTABLE_ASCII_RE.test(trimmed);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

function isSessionExpiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("jwt has expired") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("refresh token") ||
    lower.includes("session expired") ||
    lower.includes("session has expired") ||
    lower.includes("authapierror") ||
    lower.includes("token expired") ||
    lower.includes("not authenticated") ||
    lower.includes("invalid claim") ||
    (lower.includes("jwt") && lower.includes("expir"))
  );
}

function mapSubmitError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("مطّلع") ||
    lower.includes("viewer") ||
    lower.includes("صلاحية") ||
    lower.includes("policy") ||
    lower.includes("permission") ||
    lower.includes("row-level security")
  ) {
    return PERMISSION_DENIED_MESSAGE;
  }
  if (lower.includes("jwt") || lower.includes("authapi") || lower.includes("refresh token")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (isRawTechnicalMessage(message)) {
    return SUBMIT_GENERIC_ERROR_MESSAGE;
  }
  if (message.trim().length > 0) return message;
  return SUBMIT_GENERIC_ERROR_MESSAGE;
}

function mapAttachmentError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("لا تملك صلاحية رفع مرفقات") ||
    lower.includes("مطّلع") ||
    lower.includes("viewer")
  ) {
    return ATTACHMENT_UPLOAD_DENIED_MESSAGE;
  }
  if (
    lower.includes("لا تملك صلاحية فتح") ||
    lower.includes("permission") ||
    lower.includes("policy")
  ) {
    return ATTACHMENT_OPEN_ERROR_MESSAGE;
  }
  if (lower.includes("5 ملفات") || lower.includes("maximum 5")) {
    return "لا يمكن رفع أكثر من 5 مرفقات للموضوع.";
  }
  if (lower.includes("jwt") || lower.includes("authapi") || lower.includes("refresh token")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (message.includes("تعذر رفع الملف") || message.includes("لا يمكن إرفاق")) {
    return message;
  }
  if (isRawTechnicalMessage(message)) {
    return ATTACHMENT_OPEN_ERROR_MESSAGE;
  }
  if (message.trim().length > 0) return message;
  return ATTACHMENT_OPEN_ERROR_MESSAGE;
}

const TOPIC_REVIEW_DENIED_UI = "لا تملك صلاحية مراجعة هذا الموضوع.";
const TOPIC_REVIEW_FINAL_DENIED_UI = "قرار القبول النهائي أو الرفض يعود لرئيس المجلس فقط.";
const TOPIC_REVIEW_STATUS_SKIP_UI = "انتقال الحالة غير مسموح به في دورة حياة الموضوع.";
const TOPIC_REVIEW_FAILED_UI = "تعذّر حفظ حالة المراجعة.";
const TOPIC_EDIT_DENIED_UI = "لا يمكن تعديل هذا الموضوع.";
const TOPIC_EDIT_FAILED_UI = "تعذّر تعديل الموضوع.";

function mapReviewError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("لا تملك صلاحية") ||
    lower.includes("مراجعة") ||
    lower.includes("permission") ||
    lower.includes("policy") ||
    lower.includes("row-level security")
  ) {
    return TOPIC_REVIEW_DENIED_UI;
  }
  if (lower.includes("رئيس المجلس فقط") || lower.includes("final approval")) {
    return TOPIC_REVIEW_FINAL_DENIED_UI;
  }
  if (lower.includes("دورة حياة") || lower.includes("lifecycle") || lower.includes("skip")) {
    return TOPIC_REVIEW_STATUS_SKIP_UI;
  }
  if (isRawTechnicalMessage(message)) {
    return TOPIC_REVIEW_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return TOPIC_REVIEW_FAILED_UI;
}

function mapEditError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("لا يمكن تعديل") ||
    lower.includes("صلاحية") ||
    lower.includes("permission") ||
    lower.includes("policy") ||
    lower.includes("row-level security")
  ) {
    return TOPIC_EDIT_DENIED_UI;
  }
  if (lower.includes("jwt") || lower.includes("authapi") || lower.includes("refresh token")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (isRawTechnicalMessage(message)) {
    return TOPIC_EDIT_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return TOPIC_EDIT_FAILED_UI;
}

function mimeLabel(mime: string, ext: string): string {
  if (mime) return mime;
  return ext ? `.${ext.toUpperCase()}` : "—";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function mapMeetingUiError(message: string, mode: "schedule" | "update" | "load"): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  if (message.includes(MEETING_SCHEDULE_DENIED_UI)) return MEETING_SCHEDULE_DENIED_UI;
  if (message.includes(MEETING_UPDATE_DENIED_UI)) return MEETING_UPDATE_DENIED_UI;
  if (message.includes(MEETINGS_LOAD_FAILED_UI)) return MEETINGS_LOAD_FAILED_UI;
  if (message.includes(MEETING_SAVE_FAILED_UI)) return MEETING_SAVE_FAILED_UI;
  const lower = message.toLowerCase();
  if (
    lower.includes("policy") ||
    lower.includes("permission") ||
    lower.includes("row-level security") ||
    lower.includes("صلاحية")
  ) {
    if (mode === "schedule") return MEETING_SCHEDULE_DENIED_UI;
    if (mode === "update") return MEETING_UPDATE_DENIED_UI;
  }
  if (mode === "load") return MEETINGS_LOAD_FAILED_UI;
  if (isRawTechnicalMessage(message)) {
    return MEETING_SAVE_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return MEETING_SAVE_FAILED_UI;
}

function mapAgendaUiError(
  message: string,
  mode: "load" | "topics_load" | "write" | "reorder" | "finalize",
): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_UI;
  if (message.includes(AGENDA_LOAD_FAILED_UI)) return AGENDA_LOAD_FAILED_UI;
  if (message.includes(AGENDA_TOPICS_LOAD_FAILED_UI)) return AGENDA_TOPICS_LOAD_FAILED_UI;
  if (message.includes(AGENDA_WRITE_DENIED_UI)) return AGENDA_WRITE_DENIED_UI;
  if (message.includes(AGENDA_TOPIC_ALREADY_ADDED_UI)) return AGENDA_TOPIC_ALREADY_ADDED_UI;
  if (message.includes(AGENDA_REORDER_FAILED_UI)) return AGENDA_REORDER_FAILED_UI;
  if (message.includes(AGENDA_FINALIZE_DENIED_UI)) return AGENDA_FINALIZE_DENIED_UI;
  const lower = message.toLowerCase();
  if (
    lower.includes("policy") ||
    lower.includes("permission") ||
    lower.includes("row-level security") ||
    lower.includes("صلاحية")
  ) {
    if (mode === "finalize") return AGENDA_FINALIZE_DENIED_UI;
    if (mode === "load") return AGENDA_LOAD_FAILED_UI;
    if (mode === "topics_load") return AGENDA_TOPICS_LOAD_FAILED_UI;
    if (mode === "reorder") return AGENDA_REORDER_FAILED_UI;
    return AGENDA_WRITE_DENIED_UI;
  }
  if (mode === "load") return AGENDA_LOAD_FAILED_UI;
  if (mode === "topics_load") return AGENDA_TOPICS_LOAD_FAILED_UI;
  if (mode === "reorder") return AGENDA_REORDER_FAILED_UI;
  if (mode === "finalize") return AGENDA_FINALIZE_DENIED_UI;
  if (isRawTechnicalMessage(message)) {
    return AGENDA_SAVE_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return AGENDA_SAVE_FAILED_UI;
}

function roleLabel(role: string): string {
  return MEMBER_ROLE_LABELS[role as CouncilLinkMemberRole] ?? role;
}

function councilTypeLabel(type: string): string {
  return COUNCIL_TYPE_LABELS[type] ?? type;
}

function meetingStatusLabel(status: string): string {
  return MEETING_STATUS_LABELS[status] ?? status;
}

function topicStatusLabel(status: string): string {
  return TOPIC_STATUS_LABELS[status] ?? status;
}

function SectionShell({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ScrollText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <h2 className="font-display font-bold text-primary text-sm">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LoadingBlock() {
  return (
    <div className="grid place-items-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive text-center">
      {message}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function FacultyAcademicCouncilsPage() {
  const fetchMembershipsV2 = useServerFn(getMyAcademicCouncilMembershipsV2);
  const fetchMeetings = useServerFn(getMyCouncilMeetingsV2);
  const fetchTopics = useServerFn(getMyCouncilTopics);

  const membershipsQuery = useQuery({
    queryKey: ["faculty", "my-council-memberships-v2"],
    queryFn: () => fetchMembershipsV2(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const meetingsQuery = useQuery({
    queryKey: ["faculty", "my-council-meetings-v2"],
    queryFn: () => fetchMeetings(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const topicsQuery = useQuery({
    queryKey: ["faculty", "my-council-topics"],
    queryFn: () => fetchTopics(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const userIdQuery = useQuery({
    queryKey: ["auth", "session-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session?.user.id ?? null;
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const currentMemberships = membershipsQuery.data?.currentMemberships ?? [];
  const previousMemberships = membershipsQuery.data?.previousMemberships ?? [];
  const upcomingMeetings = meetingsQuery.data?.upcomingMeetings ?? [];
  const previousMeetings = meetingsQuery.data?.previousMeetings ?? [];
  const mySubmittedTopics = topicsQuery.data?.mySubmittedTopics ?? [];
  const councilVisibleTopics = topicsQuery.data?.councilVisibleTopics ?? [];

  const submitEligibleMemberships = useMemo(
    () => currentMemberships.filter((m) => SUBMIT_ELIGIBLE_ROLES.has(m.role)),
    [currentMemberships],
  );

  const chairMemberships = useMemo(
    () => currentMemberships.filter((m) => m.role === "chair"),
    [currentMemberships],
  );

  const chairCouncilIds = useMemo(
    () => new Set(chairMemberships.map((m) => m.council_id)),
    [chairMemberships],
  );

  const agendaWriteMemberships = useMemo(
    () => currentMemberships.filter((m) => m.role === "chair" || m.role === "secretary"),
    [currentMemberships],
  );

  const roleByCouncilId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of currentMemberships) {
      map.set(m.council_id, m.role);
    }
    return map;
  }, [currentMemberships]);

  const userId = userIdQuery.data ?? null;

  const viewerOnly =
    currentMemberships.length > 0 && currentMemberships.every((m) => m.role === "viewer");

  const pageLoading =
    membershipsQuery.isLoading && meetingsQuery.isLoading && topicsQuery.isLoading;

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[{ label: "المجالس الأكاديمية" }]}
    >
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <ScrollText className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">مجالسي الأكاديمية</h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
              من هذه الصفحة يمكنك الاطلاع على عضوياتك في المجالس الأكاديمية، متابعة الاجتماعات،
              وتقديم موضوعات للعرض على المجلس حسب صلاحياتك.
            </p>
          </div>
        </div>

        {pageLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <SectionShell icon={Users2} title="مجالسي الحالية">
              {membershipsQuery.isLoading ? (
                <LoadingBlock />
              ) : membershipsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل عضويات المجالس. يرجى إعادة المحاولة لاحقاً." />
              ) : currentMemberships.length === 0 ? (
                <EmptyBlock text="لا توجد عضويات فعّالة مرتبطة بحسابك حالياً." />
              ) : (
                <ul className="space-y-3">
                  {currentMemberships.map((m) => (
                    <CurrentMembershipCard key={m.membership_id} membership={m} />
                  ))}
                </ul>
              )}
            </SectionShell>

            <SectionShell icon={Archive} title="مجالسي السابقة / الأرشيف">
              {membershipsQuery.isLoading ? (
                <LoadingBlock />
              ) : membershipsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل أرشيف العضويات." />
              ) : previousMemberships.length === 0 ? (
                <EmptyBlock text="لا توجد عضويات سابقة في الأرشيف حالياً." />
              ) : (
                <ul className="space-y-3">
                  {previousMemberships.map((m) => (
                    <PreviousMembershipCard key={m.membership_id} membership={m} />
                  ))}
                </ul>
              )}
            </SectionShell>

            {chairMemberships.length > 0 ? (
              <ChairMeetingScheduleSection
                chairMemberships={chairMemberships}
                onScheduled={() => {
                  void meetingsQuery.refetch();
                }}
              />
            ) : null}

            {agendaWriteMemberships.length > 0 ? (
              <ChairAgendaEditorSection
                writeMemberships={agendaWriteMemberships}
                upcomingMeetings={upcomingMeetings}
                onUpdated={() => void meetingsQuery.refetch()}
              />
            ) : null}

            <SectionShell icon={CalendarClock} title="الاجتماعات القادمة">
              {meetingsQuery.isLoading ? (
                <LoadingBlock />
              ) : meetingsQuery.isError ? (
                <ErrorBlock message={MEETINGS_LOAD_FAILED_UI} />
              ) : upcomingMeetings.length === 0 ? (
                <EmptyBlock text="لا توجد اجتماعات قادمة مرتبطة بعضوياتك الحالية." />
              ) : (
                <ul className="space-y-3">
                  {upcomingMeetings.map((m) => (
                    <MeetingCard
                      key={m.meeting_id}
                      meeting={m}
                      variant="upcoming"
                      canEdit={chairCouncilIds.has(m.council_id)}
                      onUpdated={() => void meetingsQuery.refetch()}
                    />
                  ))}
                </ul>
              )}
            </SectionShell>

            <SectionShell icon={CalendarClock} title="الاجتماعات السابقة">
              {meetingsQuery.isLoading ? (
                <LoadingBlock />
              ) : meetingsQuery.isError ? (
                <ErrorBlock message={MEETINGS_LOAD_FAILED_UI} />
              ) : previousMeetings.length === 0 ? (
                <EmptyBlock text="لا توجد اجتماعات سابقة متاحة لك حالياً." />
              ) : (
                <ul className="space-y-3">
                  {previousMeetings.map((m) => (
                    <MeetingCard
                      key={m.meeting_id}
                      meeting={m}
                      variant="previous"
                      canEdit={chairCouncilIds.has(m.council_id)}
                      onUpdated={() => void meetingsQuery.refetch()}
                    />
                  ))}
                </ul>
              )}
            </SectionShell>

            <SectionShell icon={FilePlus2} title="مواضيعي المقدمة">
              {topicsQuery.isLoading ? (
                <LoadingBlock />
              ) : topicsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل مواضيعك." />
              ) : mySubmittedTopics.length === 0 ? (
                <EmptyBlock text="لم تقدّم أي موضوعات للمجالس بعد." />
              ) : (
                <ul className="space-y-3">
                  {mySubmittedTopics.map((t) => (
                    <TopicCard
                      key={t.topic_id}
                      topic={t}
                      showDescription
                      userId={userId}
                      onUpdated={() => void topicsQuery.refetch()}
                    />
                  ))}
                </ul>
              )}
            </SectionShell>

            {agendaWriteMemberships.length > 0 ? (
              <TopicReviewQueue
                roleByCouncilId={roleByCouncilId}
                onUpdated={() => void topicsQuery.refetch()}
              />
            ) : null}

            {(upcomingMeetings.length > 0 || previousMeetings.length > 0) &&
            currentMemberships.length > 0 ? (
              <SectionShell icon={ShieldCheck} title="الجلسة الحية والحوكمة">
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  إدارة الجلسة والتصويت والمحضر والقرارات والأرشفة وفق دورك في المجلس. الصلاحيات
                  النهائية يحددها الخادم وليس واجهة الأزرار فقط.
                </p>
                <div className="space-y-6">
                  {[...upcomingMeetings, ...previousMeetings]
                    .filter((m) =>
                      [
                        "agenda_ready",
                        "in_session",
                        "minutes_draft",
                        "minutes_review",
                        "minutes_locked",
                        "archived",
                      ].includes(m.status),
                    )
                    .map((m) => {
                      const role =
                        m.user_membership_role ??
                        roleByCouncilId.get(m.council_id) ??
                        "viewer";
                      return (
                        <div key={`gov-${m.meeting_id}`} className="space-y-2">
                          <div className="text-sm font-bold text-primary">
                            {m.council_name} · الاجتماع رقم {m.meeting_number} ·{" "}
                            {meetingStatusLabel(m.status)}
                          </div>
                          <CouncilSessionAndGovernanceWorkspace
                            meetingId={m.meeting_id}
                            councilId={m.council_id}
                            meetingStatus={m.status}
                            userRole={role}
                            userId={userId ?? undefined}
                            onStateChanged={() => void meetingsQuery.refetch()}
                          />
                        </div>
                      );
                    })}
                </div>
              </SectionShell>
            ) : null}

            <SectionShell icon={ScrollText} title="موضوعات المجلس">
              {topicsQuery.isLoading ? (
                <LoadingBlock />
              ) : topicsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل موضوعات المجلس." />
              ) : councilVisibleTopics.length === 0 ? (
                <EmptyBlock text="لا توجد موضوعات أخرى مرئية في مجالسك حالياً." />
              ) : (
                <ul className="space-y-3">
                  {councilVisibleTopics.map((t) => (
                    <TopicCard key={t.topic_id} topic={t} showDescription={false} />
                  ))}
                </ul>
              )}
            </SectionShell>

            {viewerOnly ? (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-4 text-sm text-amber-900">
                صلاحيتك الحالية قراءة فقط، ولا يمكنك تقديم موضوعات لهذا المجلس.
              </div>
            ) : submitEligibleMemberships.length > 0 ? (
              <SubmitTopicForm />
            ) : null}
          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}

function CurrentMembershipCard({ membership }: { membership: MyCouncilMembershipV2 }) {
  return (
    <li className="rounded-lg border-2 border-gold/20 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-primary text-sm">{membership.council_name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {councilTypeLabel(membership.council_type)}
            {membership.department_name ? ` · ${membership.department_name}` : ""}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          فعّالة
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
        <div>
          <dt className="text-muted-foreground">الدور</dt>
          <dd className="font-bold text-foreground mt-0.5">{roleLabel(membership.role)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">بداية العضوية</dt>
          <dd className="font-bold text-foreground mt-0.5">{formatDate(membership.active_from)}</dd>
        </div>
      </dl>
    </li>
  );
}

function PreviousMembershipCard({ membership }: { membership: MyCouncilMembershipV2 }) {
  return (
    <li className="rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-primary text-sm">{membership.council_name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {councilTypeLabel(membership.council_type)}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          عضوية سابقة
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
        <div>
          <dt className="text-muted-foreground">الدور السابق</dt>
          <dd className="font-bold text-foreground mt-0.5">{roleLabel(membership.role)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">من</dt>
          <dd className="font-bold text-foreground mt-0.5">{formatDate(membership.active_from)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">إلى</dt>
          <dd className="font-bold text-foreground mt-0.5">
            {membership.active_to ? formatDate(membership.active_to) : "—"}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function swapFacultyAgendaOrder(
  items: CouncilAgendaItem[],
  itemId: string,
  direction: "up" | "down",
): CouncilAgendaItem[] {
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
  const idx = sorted.findIndex((i) => i.id === itemId);
  if (idx < 0) return items;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return items;
  const next = [...sorted];
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  return next.map((item, i) => ({ ...item, order_index: i + 1 }));
}

function MeetingAgendaExpandable({ meetingId }: { meetingId: string }) {
  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  const [expanded, setExpanded] = useState(false);

  const agendaQuery = useQuery({
    queryKey: ["faculty", "meeting-agenda", meetingId],
    queryFn: () => fetchAgenda({ data: { meetingId } }),
    enabled: expanded,
    staleTime: 15_000,
  });

  const items = agendaQuery.data?.items ?? [];

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
      >
        <ListChecks className="h-3.5 w-3.5" />
        جدول الأعمال
        <ChevronLeft
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "-rotate-90" : "rotate-180"}`}
        />
      </button>
      {expanded ? (
        <div className="mt-2">
          {agendaQuery.isLoading ? (
            <p className="text-[11px] text-muted-foreground">جاري تحميل جدول الأعمال…</p>
          ) : agendaQuery.isError ? (
            <p className="text-[11px] text-destructive">{AGENDA_LOAD_FAILED_UI}</p>
          ) : items.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              لا توجد بنود في جدول الأعمال حتى الآن.
            </p>
          ) : (
            <ol className="space-y-2 list-none">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border/70 bg-muted/10 px-2.5 py-2 text-[11px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-primary">{item.order_index}.</span>
                    <span className="font-medium text-foreground">{item.title}</span>
                    {item.is_approved ? (
                      <Badge variant="secondary" className="text-[9px]">
                        معتمد
                      </Badge>
                    ) : null}
                  </div>
                  {item.topic ? (
                    <p className="mt-1 text-muted-foreground">موضوع: {item.topic.title}</p>
                  ) : null}
                  {item.notes ? <p className="mt-1 text-foreground/80">{item.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChairAgendaEditorSection({
  writeMemberships,
  upcomingMeetings,
  onUpdated,
}: {
  writeMemberships: MyCouncilMembershipV2[];
  upcomingMeetings: CouncilMeetingV2Item[];
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  const fetchAvailableTopics = useServerFn(getAvailableTopicsForAgenda);
  const addTopic = useServerFn(addTopicToAgenda);
  const addManual = useServerFn(addManualAgendaItem);
  const updateItem = useServerFn(updateAgendaItem);
  const reorderItems = useServerFn(reorderAgendaItems);
  const finalizeAgenda = useServerFn(finalizeMeetingAgenda);

  const writeCouncilIds = useMemo(
    () => new Set(writeMemberships.map((m) => m.council_id)),
    [writeMemberships],
  );
  const chairCouncilIds = useMemo(
    () => new Set(writeMemberships.filter((m) => m.role === "chair").map((m) => m.council_id)),
    [writeMemberships],
  );

  const eligibleMeetings = useMemo(
    () => upcomingMeetings.filter((m) => writeCouncilIds.has(m.council_id)),
    [upcomingMeetings, writeCouncilIds],
  );

  const [selectedMeetingId, setSelectedMeetingId] = useState(eligibleMeetings[0]?.meeting_id ?? "");
  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [addTopicBusyId, setAddTopicBusyId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);

  const [editTarget, setEditTarget] = useState<CouncilAgendaItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [editApproved, setEditApproved] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const selectedMeeting = eligibleMeetings.find((m) => m.meeting_id === selectedMeetingId) ?? null;
  const canFinalize = selectedMeeting ? chairCouncilIds.has(selectedMeeting.council_id) : false;

  const agendaQuery = useQuery({
    queryKey: ["faculty", "chair-agenda", selectedMeetingId],
    queryFn: () => fetchAgenda({ data: { meetingId: selectedMeetingId } }),
    enabled: Boolean(selectedMeetingId),
    staleTime: 10_000,
  });

  const topicsQuery = useQuery({
    queryKey: ["faculty", "chair-agenda-topics", selectedMeetingId],
    queryFn: () => fetchAvailableTopics({ data: { meetingId: selectedMeetingId } }),
    enabled: Boolean(selectedMeetingId),
    staleTime: 10_000,
  });

  const agendaItems = agendaQuery.data?.items ?? [];
  const availableTopics = topicsQuery.data?.topics ?? [];

  const refreshAgenda = () => {
    if (selectedMeetingId) {
      qc.invalidateQueries({ queryKey: ["faculty", "chair-agenda", selectedMeetingId] });
      qc.invalidateQueries({ queryKey: ["faculty", "chair-agenda-topics", selectedMeetingId] });
      qc.invalidateQueries({ queryKey: ["faculty", "meeting-agenda", selectedMeetingId] });
    }
    onUpdated();
  };

  const persistReorder = async (items: CouncilAgendaItem[]) => {
    if (!selectedMeetingId) return;
    setReorderBusy(true);
    try {
      await reorderItems({
        data: {
          meetingId: selectedMeetingId,
          items: items.map((i) => ({ agendaItemId: i.id, orderIndex: i.order_index })),
        },
      });
      toast.success("تم حفظ ترتيب جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "reorder"));
    } finally {
      setReorderBusy(false);
    }
  };

  const handleAddTopic = async (topic: AvailableTopicForAgenda) => {
    if (!selectedMeetingId) return;
    setAddTopicBusyId(topic.topic_id);
    try {
      await addTopic({ data: { meetingId: selectedMeetingId, topicId: topic.topic_id } });
      toast.success("تمت إضافة الموضوع إلى جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "write"));
    } finally {
      setAddTopicBusyId(null);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeetingId || manualTitle.trim().length < 3) return;
    setManualBusy(true);
    try {
      await addManual({
        data: {
          meetingId: selectedMeetingId,
          title: manualTitle.trim(),
          notes: manualNotes.trim() || undefined,
        },
      });
      toast.success("تمت إضافة البند.");
      setManualTitle("");
      setManualNotes("");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "write"));
    } finally {
      setManualBusy(false);
    }
  };

  const openEdit = (item: CouncilAgendaItem) => {
    setEditTarget(item);
    setEditTitle(item.title);
    setEditNotes(item.notes ?? "");
    setEditOrder(String(item.order_index));
    setEditApproved(item.is_approved);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || editTitle.trim().length < 3) return;
    const orderNum = Number(editOrder);
    if (!Number.isInteger(orderNum) || orderNum < 1) return;
    setEditBusy(true);
    try {
      await updateItem({
        data: {
          agendaItemId: editTarget.id,
          title: editTitle.trim(),
          notes: editNotes.trim() || null,
          orderIndex: orderNum,
          isApproved: editApproved,
        },
      });
      toast.success("تم تحديث البند.");
      setEditTarget(null);
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "write"));
    } finally {
      setEditBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedMeetingId) return;
    setFinalizeBusy(true);
    try {
      await finalizeAgenda({ data: { meetingId: selectedMeetingId } });
      toast.success("تم اعتماد جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "finalize"));
    } finally {
      setFinalizeBusy(false);
    }
  };

  const sectionTitle = writeMemberships.some((m) => m.role === "chair")
    ? "جدول الأعمال (رئيس المجلس)"
    : "جدول الأعمال (إعداد)";

  return (
    <SectionShell icon={ListChecks} title={sectionTitle}>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        يمكنك إعداد وترتيب جدول الأعمال للمجالس التي تملك صلاحية الكتابة عليها.
        {canFinalize
          ? " بصفتك رئيس مجلس يمكنك اعتماد جدول الأعمال."
          : " اعتماد جدول الأعمال متاح لرئيس المجلس فقط."}
      </p>
      {eligibleMeetings.length === 0 ? (
        <EmptyBlock text="لا توجد اجتماعات قادمة في مجالسك لإعداد جدول الأعمال." />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">الاجتماع</label>
            <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId} dir="rtl">
              <SelectTrigger>
                <SelectValue placeholder="اختر اجتماعاً" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {eligibleMeetings.map((m) => (
                  <SelectItem key={m.meeting_id} value={m.meeting_id}>
                    {m.council_name} — {m.meeting_title} — {formatDateTime(m.scheduled_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMeetingId ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {agendaItems.length} بند · {meetingStatusLabel(selectedMeeting?.status ?? "")}
                </span>
                {canFinalize ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    disabled={finalizeBusy || selectedMeeting?.status === "agenda_ready"}
                    onClick={() => void handleFinalize()}
                  >
                    {finalizeBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    اعتماد جدول الأعمال
                  </Button>
                ) : null}
              </div>

              {agendaQuery.isLoading ? (
                <LoadingBlock />
              ) : agendaQuery.isError ? (
                <ErrorBlock message={AGENDA_LOAD_FAILED_UI} />
              ) : (
                <ul className="space-y-2">
                  {agendaItems.map((item, idx) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-border bg-background p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-primary">
                            {item.order_index}.{" "}
                          </span>
                          <span className="font-bold">{item.title}</span>
                          {item.is_approved ? (
                            <Badge variant="secondary" className="text-[9px] ms-2">
                              معتمد
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            aria-label="نقل البند للأعلى"
                            disabled={reorderBusy || idx === 0}
                            onClick={() =>
                              void persistReorder(
                                swapFacultyAgendaOrder(agendaItems, item.id, "up"),
                              )
                            }
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            aria-label="نقل البند للأسفل"
                            disabled={reorderBusy || idx === agendaItems.length - 1}
                            onClick={() =>
                              void persistReorder(
                                swapFacultyAgendaOrder(agendaItems, item.id, "down"),
                              )
                            }
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() => openEdit(item)}
                          >
                            تعديل
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {topicsQuery.data && availableTopics.length > 0 ? (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="text-xs font-bold text-primary">موضوعات متاحة</div>
                  <ul className="space-y-2">
                    {availableTopics.map((t) => (
                      <li
                        key={t.topic_id}
                        className="flex justify-between gap-2 items-center text-xs"
                      >
                        <span>{t.title}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[10px]"
                          disabled={addTopicBusyId === t.topic_id}
                          onClick={() => void handleAddTopic(t)}
                        >
                          إضافة
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form
                onSubmit={(e) => void handleManualAdd(e)}
                className="space-y-2 border-t border-border pt-3"
              >
                <div className="text-xs font-bold text-primary">بند يدوي</div>
                <Input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="عنوان البند"
                  dir="rtl"
                />
                <Textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات (اختياري)"
                  dir="rtl"
                />
                <Button type="submit" size="sm" disabled={manualBusy} className="gap-1">
                  {manualBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  إضافة بند
                </Button>
              </form>
            </>
          ) : null}
        </div>
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && !editBusy && setEditTarget(null)}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بند الأجندة</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleEdit(e)} className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} dir="rtl" />
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              dir="rtl"
            />
            <Input
              type="number"
              min={1}
              value={editOrder}
              onChange={(e) => setEditOrder(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={editApproved}
                onCheckedChange={(v) => setEditApproved(v === true)}
              />
              معتمد
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy}>
                حفظ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionShell>
  );
}

function MeetingCard({
  meeting,
  variant,
  canEdit,
  onUpdated,
}: {
  meeting: CouncilMeetingV2Item;
  variant: "upcoming" | "previous";
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const updateMeeting = useServerFn(updateCouncilMeeting);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editIntakeOpensAt, setEditIntakeOpensAt] = useState("");
  const [editIntakeClosesAt, setEditIntakeClosesAt] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("scheduled");
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = () => {
    setEditTitle(meeting.meeting_title);
    setEditScheduledAt(toDatetimeLocalValue(meeting.scheduled_at));
    setEditLocation(meeting.location ?? "");
    setEditIntakeOpensAt(toDatetimeLocalValue(meeting.intake_opens_at));
    setEditIntakeClosesAt(toDatetimeLocalValue(meeting.intake_closes_at));
    setEditNotes(meeting.notes ?? "");
    setEditStatus(meeting.status);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const scheduledIso = toIsoFromDatetimeLocal(editScheduledAt);
    if (!scheduledIso || editTitle.trim().length < 3) {
      toast.error(MEETING_SAVE_FAILED_UI);
      return;
    }
    setEditBusy(true);
    try {
      await updateMeeting({
        data: {
          meetingId: meeting.meeting_id,
          title: editTitle.trim(),
          scheduledAt: scheduledIso,
          location: editLocation.trim() || null,
          intakeOpensAt: editIntakeOpensAt.trim()
            ? (toIsoFromDatetimeLocal(editIntakeOpensAt) ?? null)
            : null,
          intakeClosesAt: editIntakeClosesAt.trim()
            ? (toIsoFromDatetimeLocal(editIntakeClosesAt) ?? null)
            : null,
          notes: editNotes.trim() || null,
          status: editStatus as (typeof MEETING_STATUS_OPTIONS)[number],
        },
      });
      toast.success("تم تحديث الاجتماع بنجاح");
      setEditOpen(false);
      onUpdated();
    } catch (err) {
      toast.error(mapMeetingUiError(extractErrorMessage(err), "update"));
    } finally {
      setEditBusy(false);
    }
  };

  const displayTitle = meeting.meeting_title?.trim() || meeting.council_name;
  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-primary text-sm">{displayTitle}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{meeting.council_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">
            {meetingStatusLabel(meeting.status)}
          </Badge>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px]"
              onClick={openEdit}
            >
              <Pencil className="h-3 w-3" />
              تعديل
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
        <div>
          <dt className="text-muted-foreground">رقم الاجتماع</dt>
          <dd className="font-medium text-foreground mt-0.5">{meeting.meeting_number}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">التاريخ والوقت</dt>
          <dd className="font-medium text-foreground mt-0.5">
            {formatDateTime(meeting.scheduled_at)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">المكان</dt>
          <dd className="font-medium text-foreground mt-0.5">{meeting.location ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">فتح استقبال الموضوعات</dt>
          <dd className="font-medium text-foreground mt-0.5">
            {meeting.intake_opens_at ? formatDateTime(meeting.intake_opens_at) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">إغلاق استقبال الموضوعات</dt>
          <dd className="font-medium text-foreground mt-0.5">
            {meeting.intake_closes_at ? formatDateTime(meeting.intake_closes_at) : "—"}
          </dd>
        </div>
        {meeting.user_membership_role ? (
          <div>
            <dt className="text-muted-foreground">دورك في المجلس</dt>
            <dd className="font-medium text-foreground mt-0.5">
              {roleLabel(meeting.user_membership_role)}
            </dd>
          </div>
        ) : null}
        {meeting.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">ملاحظات</dt>
            <dd className="text-foreground mt-0.5 leading-relaxed">{meeting.notes}</dd>
          </div>
        ) : null}
        {meeting.agenda_summary ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">ملخص الأجندة</dt>
            <dd className="text-foreground mt-0.5 leading-relaxed">{meeting.agenda_summary}</dd>
          </div>
        ) : null}
        {variant === "previous" && meeting.minutes_summary ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">ملخص المحضر</dt>
            <dd className="text-foreground mt-0.5 leading-relaxed">{meeting.minutes_summary}</dd>
          </div>
        ) : null}
      </dl>

      <MeetingAgendaExpandable meetingId={meeting.meeting_id} />

      <Dialog open={editOpen} onOpenChange={(open) => !open && !editBusy && setEditOpen(false)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل الاجتماع</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleUpdate(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">العنوان</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">تاريخ ووقت الاجتماع</label>
              <Input
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">المكان</label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">فتح استقبال الموضوعات</label>
              <Input
                type="datetime-local"
                value={editIntakeOpensAt}
                onChange={(e) => setEditIntakeOpensAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">إغلاق استقبال الموضوعات</label>
              <Input
                type="datetime-local"
                value={editIntakeClosesAt}
                onChange={(e) => setEditIntakeClosesAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">الحالة</label>
              <Select value={editStatus} onValueChange={setEditStatus} dir="rtl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {MEETING_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {meetingStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">ملاحظات</label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                dir="rtl"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={editBusy}
                onClick={() => setEditOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy} className="gap-1.5">
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function ChairMeetingScheduleSection({
  chairMemberships,
  onScheduled,
}: {
  chairMemberships: MyCouncilMembershipV2[];
  onScheduled: () => void;
}) {
  const scheduleMeeting = useServerFn(scheduleCouncilMeeting);
  const [councilId, setCouncilId] = useState(chairMemberships[0]?.council_id ?? "");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [intakeOpensAt, setIntakeOpensAt] = useState("");
  const [intakeClosesAt, setIntakeClosesAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!councilId) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      toast.error("عنوان الاجتماع قصير جداً");
      return;
    }
    const scheduledIso = toIsoFromDatetimeLocal(scheduledAt);
    if (!scheduledIso) {
      toast.error("أدخل تاريخاً ووقتاً صالحين للاجتماع");
      return;
    }
    setBusy(true);
    try {
      await scheduleMeeting({
        data: {
          councilId,
          title: trimmedTitle,
          scheduledAt: scheduledIso,
          location: location.trim() || undefined,
          intakeOpensAt: toIsoFromDatetimeLocal(intakeOpensAt),
          intakeClosesAt: toIsoFromDatetimeLocal(intakeClosesAt),
          notes: notes.trim() || undefined,
        },
      });
      toast.success("تم جدولة الاجتماع بنجاح");
      setTitle("");
      setScheduledAt("");
      setLocation("");
      setIntakeOpensAt("");
      setIntakeClosesAt("");
      setNotes("");
      onScheduled();
    } catch (err) {
      toast.error(mapMeetingUiError(extractErrorMessage(err), "schedule"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionShell icon={CalendarClock} title="جدولة اجتماع (رئيس المجلس)">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          بصفتك رئيس مجلس، يمكنك جدولة اجتماع لمجلسك فقط. الحماية النهائية عبر صلاحيات قاعدة
          البيانات.
        </p>
        {chairMemberships.length > 1 ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium">المجلس</label>
            <Select value={councilId} onValueChange={setCouncilId} dir="rtl">
              <SelectTrigger>
                <SelectValue placeholder="اختر المجلس" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {chairMemberships.map((m) => (
                  <SelectItem key={m.membership_id} value={m.council_id}>
                    {m.council_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-xs font-medium text-primary">
            المجلس: {chairMemberships[0]?.council_name}
          </p>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-medium">عنوان الاجتماع</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            dir="rtl"
            maxLength={500}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">تاريخ ووقت الاجتماع</label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">المكان (اختياري)</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} dir="rtl" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">فتح استقبال الموضوعات من (اختياري)</label>
          <Input
            type="datetime-local"
            value={intakeOpensAt}
            onChange={(e) => setIntakeOpensAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">إغلاق استقبال الموضوعات في (اختياري)</label>
          <Input
            type="datetime-local"
            value={intakeClosesAt}
            onChange={(e) => setIntakeClosesAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">ملاحظات (اختياري)</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} dir="rtl" />
        </div>
        <Button type="submit" className="gap-2" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
          جدولة الاجتماع
        </Button>
      </form>
    </SectionShell>
  );
}

function TopicCard({
  topic,
  showDescription,
  userId,
  onUpdated,
}: {
  topic: MyCouncilTopicItem;
  showDescription: boolean;
  userId?: string | null;
  onUpdated?: () => void;
}) {
  const doEdit = useServerFn(editCouncilTopic);
  const doResubmit = useServerFn(resubmitCouncilTopic);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [resubmitBusy, setResubmitBusy] = useState(false);

  const canEdit =
    userId != null &&
    topic.submitted_by === userId &&
    (topic.status === "draft" || topic.status === "needs_completion");

  const canResubmit =
    userId != null &&
    topic.submitted_by === userId &&
    topic.status === "needs_completion";

  const openEdit = () => {
    setEditTitle(topic.title);
    setEditDescription(topic.description ?? "");
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = editTitle.trim();
    if (title.length < 5) {
      toast.error("عنوان الموضوع يجب أن لا يقل عن 5 أحرف");
      return;
    }
    setEditBusy(true);
    try {
      await doEdit({
        data: {
          topic_id: topic.topic_id,
          title,
          description: editDescription.trim() || undefined,
        },
      });
      toast.success("تم تعديل الموضوع بنجاح");
      setEditOpen(false);
      onUpdated?.();
    } catch (err) {
      toast.error(mapEditError(extractErrorMessage(err)));
    } finally {
      setEditBusy(false);
    }
  };

  const handleResubmit = async () => {
    setResubmitBusy(true);
    try {
      await doResubmit({ data: { topic_id: topic.topic_id } });
      toast.success("تم إعادة تقديم الموضوع");
      onUpdated?.();
    } catch (err) {
      toast.error(mapEditError(extractErrorMessage(err)));
    } finally {
      setResubmitBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-primary text-sm">{topic.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{topic.council_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px]"
              onClick={openEdit}
            >
              <Pencil className="h-3 w-3" />
              تعديل
            </Button>
          ) : null}
          {canResubmit ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7 gap-1 text-[10px]"
              disabled={resubmitBusy}
              onClick={() => void handleResubmit()}
            >
              {resubmitBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              إعادة تقديم
            </Button>
          ) : null}
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {topicStatusLabel(topic.status)}
          </Badge>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">تاريخ التقديم</dt>
            <dd className="font-medium text-foreground mt-0.5">
              {topic.submitted_at
                ? formatDateTime(topic.submitted_at)
                : formatDateTime(topic.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">آخر تحديث</dt>
            <dd className="font-medium text-foreground mt-0.5">
              {formatDateTime(topic.updated_at)}
            </dd>
          </div>
        </div>
        {showDescription && topic.description ? (
          <div>
            <dt className="text-muted-foreground">الوصف</dt>
            <dd className="text-foreground mt-0.5 leading-relaxed line-clamp-4">
              {topic.description}
            </dd>
          </div>
        ) : null}
        {topic.admin_notes ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2">
            <dt className="text-amber-800 font-medium">ملاحظات الإدارة</dt>
            <dd className="text-amber-900 mt-0.5 leading-relaxed">{topic.admin_notes}</dd>
          </div>
        ) : null}
        {topic.agenda_order !== null ? (
          <div>
            <dt className="text-muted-foreground">ترتيب البند في الأجندة</dt>
            <dd className="font-medium text-foreground mt-0.5">{topic.agenda_order}</dd>
          </div>
        ) : null}
        <TopicAttachmentsList topicId={topic.topic_id} />
      </dl>

      <Dialog open={editOpen} onOpenChange={(open) => !open && !editBusy && setEditOpen(false)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل الموضوع</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleEdit(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">العنوان</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                dir="rtl"
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">الوصف</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                dir="rtl"
                maxLength={8000}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={editBusy} onClick={() => setEditOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy} className="gap-1.5">
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function TopicAttachmentsList({ topicId }: { topicId: string }) {
  const fetchAttachments = useServerFn(getCouncilTopicAttachments);
  const fetchSignedUrl = useServerFn(getCouncilTopicAttachmentSignedUrl);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ["faculty", "council-topic-attachments", topicId],
    queryFn: () => fetchAttachments({ data: { topic_id: topicId } }),
    staleTime: 30_000,
  });

  const handleOpen = async (attachment: CouncilTopicAttachmentItem) => {
    setOpeningId(attachment.id);
    try {
      const result = await fetchSignedUrl({ data: { attachment_id: attachment.id } });
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      const raw = extractErrorMessage(err);
      toast.error(mapAttachmentError(raw));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="pt-1">
      <dt className="text-muted-foreground mb-1.5">المرفقات</dt>
      {attachmentsQuery.isLoading ? (
        <dd className="text-muted-foreground text-[11px]">جاري تحميل المرفقات…</dd>
      ) : attachmentsQuery.isError ? (
        <dd className="text-destructive text-[11px]">تعذّر تحميل المرفقات.</dd>
      ) : (attachmentsQuery.data ?? []).length === 0 ? (
        <dd className="text-muted-foreground text-[11px]">لا توجد مرفقات.</dd>
      ) : (
        <dd>
          <ul className="space-y-2">
            {(attachmentsQuery.data ?? []).map((att) => (
              <li
                key={att.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2"
              >
                <div className="min-w-0 text-[11px]">
                  <p className="font-medium text-foreground truncate">{att.file_name}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {formatBytes(att.file_size)} · {mimeLabel(att.mime_type, att.file_ext)} ·{" "}
                    {formatDateTime(att.created_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] shrink-0 gap-1"
                  disabled={openingId === att.id}
                  onClick={() => void handleOpen(att)}
                >
                  {openingId === att.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  فتح / تحميل
                </Button>
              </li>
            ))}
          </ul>
        </dd>
      )}
    </div>
  );
}

const REVIEW_QUEUE_STATUS_TABS = [
  { value: "submitted", label: "مقدّم" },
  { value: "under_review", label: "قيد المراجعة" },
  { value: "needs_completion", label: "مطلوب استكمال" },
  { value: "accepted_for_agenda", label: "مقبول للجدول" },
  { value: "rejected", label: "مرفوض" },
] as const;

function TopicReviewQueue({
  roleByCouncilId,
  onUpdated,
}: {
  roleByCouncilId: Map<string, string>;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getCouncilTopicReviewQueue);
  const reviewTopic = useServerFn(reviewCouncilTopic);

  const queueQuery = useQuery({
    queryKey: ["faculty", "council-topic-review-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const [activeStatus, setActiveStatus] = useState<string>("submitted");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyByTopic, setBusyByTopic] = useState<Record<string, boolean>>({});

  const queue = queueQuery.data?.queue ?? [];
  const filtered = queue.filter((t) => t.status === activeStatus);

  const handleReview = async (
    topic: CouncilTopicReviewQueueItem,
    status: "under_review" | "needs_completion" | "accepted_for_agenda" | "rejected",
  ) => {
    const role = roleByCouncilId.get(topic.council_id);
    const isChair = role === "chair";
    const isSecretary = role === "secretary";

    if (!isChair && !isSecretary) {
      toast.error(TOPIC_REVIEW_DENIED_UI);
      return;
    }
    if ((status === "accepted_for_agenda" || status === "rejected") && !isChair) {
      toast.error(TOPIC_REVIEW_FINAL_DENIED_UI);
      return;
    }

    setBusyByTopic((prev) => ({ ...prev, [topic.topic_id]: true }));
    try {
      await reviewTopic({
        data: {
          topicId: topic.topic_id,
          status,
          expectedStatus: topic.status,
          reviewNote: reviewNotes[topic.topic_id]?.trim() || undefined,
        },
      });
      toast.success("تم تحديث حالة الموضوع");
      setReviewNotes((prev) => ({ ...prev, [topic.topic_id]: "" }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["faculty", "council-topic-review-queue"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "my-council-topics"] }),
      ]);
      onUpdated();
    } catch (err) {
      toast.error(mapReviewError(extractErrorMessage(err)));
    } finally {
      setBusyByTopic((prev) => ({ ...prev, [topic.topic_id]: false }));
    }
  };

  return (
    <SectionShell icon={ListChecks} title="قائمة مراجعة الموضوعات">
      {queueQuery.isLoading ? (
        <LoadingBlock />
      ) : queueQuery.isError ? (
        <ErrorBlock message="تعذّر تحميل قائمة مراجعة الموضوعات." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_QUEUE_STATUS_TABS.map((tab) => {
              const count = queue.filter((t) => t.status === tab.value).length;
              return (
                <Button
                  key={tab.value}
                  type="button"
                  size="sm"
                  variant={activeStatus === tab.value ? "default" : "outline"}
                  className="h-8 text-[11px] gap-1"
                  onClick={() => setActiveStatus(tab.value)}
                >
                  {tab.label}
                  {count > 0 ? (
                    <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                      {count}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyBlock text="لا توجد موضوعات في هذه الحالة حالياً." />
          ) : (
            <ul className="space-y-3">
              {filtered.map((topic) => {
                const role = roleByCouncilId.get(topic.council_id);
                const isChair = role === "chair";
                const isSecretary = role === "secretary";
                const busy = busyByTopic[topic.topic_id] ?? false;
                const note = reviewNotes[topic.topic_id] ?? "";
                return (
                  <li
                    key={topic.topic_id}
                    className="rounded-lg border border-border bg-background p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-primary text-sm">{topic.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {topic.council_name}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {topicStatusLabel(topic.status)}
                      </Badge>
                    </div>

                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">مقدّم من</dt>
                        <dd className="font-medium text-foreground mt-0.5">
                          {topic.submitted_by_name ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">تاريخ التقديم</dt>
                        <dd className="font-medium text-foreground mt-0.5">
                          {topic.submitted_at ? formatDateTime(topic.submitted_at) : "—"}
                        </dd>
                      </div>
                    </dl>

                    {topic.admin_notes ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-xs">
                        <span className="font-medium text-amber-800">ملاحظات المراجعة: </span>
                        <span className="text-amber-900">{topic.admin_notes}</span>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">ملاحظة المراجعة (اختياري)</label>
                      <Textarea
                        value={note}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [topic.topic_id]: e.target.value,
                          }))
                        }
                        rows={2}
                        dir="rtl"
                        maxLength={4000}
                        disabled={busy}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(isChair || isSecretary) && topic.status !== "under_review" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          disabled={busy}
                          onClick={() => void handleReview(topic, "under_review")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          تحت المراجعة
                        </Button>
                      ) : null}
                      {(isChair || isSecretary) && topic.status !== "needs_completion" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          disabled={busy}
                          onClick={() => void handleReview(topic, "needs_completion")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          طلب استكمال
                        </Button>
                      ) : null}
                      {isChair && topic.status !== "accepted_for_agenda" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-8 text-[11px]"
                          disabled={busy}
                          onClick={() => void handleReview(topic, "accepted_for_agenda")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          قبول للجدول
                        </Button>
                      ) : null}
                      {isChair && topic.status !== "rejected" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 text-[11px]"
                          disabled={busy}
                          onClick={() => void handleReview(topic, "rejected")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          رفض
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </SectionShell>
  );
}

function SubmitTopicForm() {
  const qc = useQueryClient();
  const submitTopic = useServerFn(submitCouncilTopic);
  const prepareUpload = useServerFn(prepareCouncilTopicAttachmentUpload);
  const fetchOpenMeetings = useServerFn(getOpenIntakeMeetingsForMember);

  const openMeetingsQuery = useQuery({
    queryKey: ["faculty", "open-intake-meetings"],
    queryFn: () => fetchOpenMeetings(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const openMeetings = openMeetingsQuery.data ?? [];

  const [meetingId, setMeetingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessionExpiredHint, setSessionExpiredHint] = useState(false);

  useEffect(() => {
    if (openMeetings.length > 0 && !meetingId) {
      setMeetingId(openMeetings[0].meeting_id);
    }
  }, [openMeetings, meetingId]);

  const selectedMeeting = openMeetings.find((m) => m.meeting_id === meetingId) ?? null;
  const councilId = selectedMeeting?.council_id ?? "";

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length === 0) return;

    const next = [...selectedFiles];
    for (const file of incoming) {
      if (next.length >= MAX_TOPIC_ATTACHMENTS) {
        toast.error("لا يمكن رفع أكثر من 5 مرفقات للموضوع.");
        break;
      }
      const check = validateUpload(file, "council_topic_attachment");
      if (!check.ok) {
        toast.error(check.message);
        continue;
      }
      next.push(file);
    }
    setSelectedFiles(next);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadTopicAttachments = async (topicId: string, files: File[]) => {
    if (!councilId) return files.length;
    let failures = 0;
    for (const file of files) {
      try {
        const ext = getExt(file.name);
        const prep = await prepareUpload({
          data: {
            topic_id: topicId,
            council_id: councilId,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            file_ext: ext,
          },
        });

        const { error: uploadErr } = await supabase.storage
          .from(prep.bucket)
          .upload(prep.file_path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadErr) {
          failures += 1;
        }
      } catch (err) {
        failures += 1;
        const raw = extractErrorMessage(err);
        if (isSessionExpiredError(raw)) throw err;
      }
    }
    return failures;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 5) {
      toast.error("عنوان الموضوع يجب أن لا يقل عن 5 أحرف");
      return;
    }
    if (!meetingId) {
      toast.error("اختر اجتماعاً مفتوح الاستقبال أولاً");
      return;
    }
    if (selectedFiles.length > MAX_TOPIC_ATTACHMENTS) {
      toast.error("لا يمكن رفع أكثر من 5 مرفقات للموضوع.");
      return;
    }

    setBusy(true);
    try {
      const result = await submitTopic({
        data: {
          meeting_id: meetingId,
          title: trimmedTitle,
          description: description.trim() || undefined,
        },
      });

      const topicId = result.topic_id;
      let uploadFailures = 0;

      if (selectedFiles.length > 0) {
        uploadFailures = await uploadTopicAttachments(topicId, selectedFiles);
      }

      if (uploadFailures > 0) {
        toast.warning(PARTIAL_UPLOAD_MESSAGE);
      } else if (selectedFiles.length > 0) {
        toast.success("تم تقديم الموضوع ورفع المرفقات بنجاح");
      } else {
        toast.success("تم إرسال الموضوع إلى المجلس بنجاح");
      }

      setTitle("");
      setDescription("");
      setSelectedFiles([]);
      setSessionExpiredHint(false);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["faculty", "my-council-topics"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "council-topic-attachments"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "open-intake-meetings"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "council-topic-review-queue"] }),
      ]);
    } catch (err) {
      const raw = extractErrorMessage(err);
      const mapped = mapSubmitError(raw);
      if (isSessionExpiredError(raw)) setSessionExpiredHint(true);
      toast.error(mapped);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionShell icon={Send} title="تقديم موضوع جديد للمجلس">
      {openMeetingsQuery.isLoading ? (
        <LoadingBlock />
      ) : openMeetingsQuery.isError ? (
        <ErrorBlock message="تعذّر تحميل الاجتماعات المفتوحة للاستقبال." />
      ) : openMeetings.length === 0 ? (
        <EmptyBlock text="لا توجد اجتماعات مفتوحة لاستقبال الموضوعات في مجالسك حالياً." />
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {sessionExpiredHint ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <p>{SESSION_EXPIRED_MESSAGE}</p>
              <Link
                to="/portal-login"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                العودة إلى تسجيل الدخول
              </Link>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">الاجتماع</label>
            <Select value={meetingId} onValueChange={setMeetingId} dir="rtl">
              <SelectTrigger>
                <SelectValue placeholder="اختر اجتماعاً" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {openMeetings.map((m) => (
                  <SelectItem key={m.meeting_id} value={m.meeting_id}>
                    {m.council_name} — {m.meeting_title} — {formatDate(m.scheduled_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">عنوان الموضوع</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="أدخل عنوان الموضوع (5 أحرف على الأقل)"
              dir="rtl"
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              وصف الموضوع <span className="text-muted-foreground">(اختياري)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اشرح الموضوع المقترح للمجلس"
              dir="rtl"
              rows={4}
              maxLength={8000}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">
                المرفقات الداعمة{" "}
                <span className="text-muted-foreground">
                  (اختياري — حتى {MAX_TOPIC_ATTACHMENTS} ملفات)
                </span>
              </label>
              <span className="text-[10px] text-muted-foreground">
                {selectedFiles.length}/{MAX_TOPIC_ATTACHMENTS}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {policyHint("council_topic_attachment")}
            </p>
            <Input
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={busy || selectedFiles.length >= MAX_TOPIC_ATTACHMENTS}
              onChange={handleFilesSelected}
              className="text-xs cursor-pointer"
            />
            {selectedFiles.length > 0 ? (
              <ul className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-2">
                {selectedFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {formatBytes(file.size)} · {mimeLabel(file.type, getExt(file.name))}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] text-destructive hover:text-destructive gap-1"
                      disabled={busy}
                      onClick={() => removeSelectedFile(index)}
                    >
                      <X className="h-3 w-3" />
                      إزالة
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <Button type="submit" className="gap-2" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال الموضوع
          </Button>
        </form>
      )}
    </SectionShell>
  );
}
