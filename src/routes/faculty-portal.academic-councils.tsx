import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  FilePlus2,
  Loader2,
  ScrollText,
  Users2,
  Archive,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMyAcademicCouncilMembershipsV2,
  getMyCouncilMeetings,
  getMyCouncilTopics,
  submitCouncilTopic,
  type MyCouncilMembershipV2,
  type MyCouncilMeetingItem,
  type MyCouncilTopicItem,
} from "@/lib/faculty-councils.functions";
import type { CouncilLinkMemberRole } from "@/lib/admin-councils.functions";

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

const SUBMIT_ELIGIBLE_ROLES = new Set<string>(["chair", "secretary", "member", "vice_chair"]);

const PERMISSION_DENIED_MESSAGE = "لا تملك صلاحية تقديم موضوع لهذا المجلس.";
const SESSION_EXPIRED_MESSAGE =
  "انتهت جلسة تسجيل الدخول، يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.";
const SUBMIT_GENERIC_ERROR_MESSAGE = "تعذّر إرسال الموضوع. يرجى المحاولة مرة أخرى.";

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
  if (/^[\x00-\x7F]+$/.test(message.trim()) && message.trim().length > 0) {
    return SUBMIT_GENERIC_ERROR_MESSAGE;
  }
  if (message.trim().length > 0) return message;
  return SUBMIT_GENERIC_ERROR_MESSAGE;
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
  const qc = useQueryClient();
  const fetchMembershipsV2 = useServerFn(getMyAcademicCouncilMembershipsV2);
  const fetchMeetings = useServerFn(getMyCouncilMeetings);
  const fetchTopics = useServerFn(getMyCouncilTopics);
  const submitTopic = useServerFn(submitCouncilTopic);

  const membershipsQuery = useQuery({
    queryKey: ["faculty", "my-council-memberships-v2"],
    queryFn: () => fetchMembershipsV2(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const meetingsQuery = useQuery({
    queryKey: ["faculty", "my-council-meetings"],
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

  const viewerOnly =
    currentMemberships.length > 0 &&
    currentMemberships.every((m) => m.role === "viewer");

  const pageLoading =
    membershipsQuery.isLoading && meetingsQuery.isLoading && topicsQuery.isLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      <header className="bg-primary-deep text-primary-foreground border-b-2 border-gold/40">
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/faculty-portal"
            className="inline-flex items-center gap-1 text-xs font-bold text-gold hover:text-primary-foreground transition-colors mb-3"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            العودة إلى بوابة عضو هيئة التدريس
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
              <ScrollText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-gold">مجالسي الأكاديمية</h1>
              <p className="text-xs text-primary-foreground/70 mt-0.5 max-w-2xl leading-relaxed">
                من هذه الصفحة يمكنك الاطلاع على عضوياتك في المجالس الأكاديمية، متابعة الاجتماعات،
                وتقديم موضوعات للعرض على المجلس حسب صلاحياتك.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
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

            <SectionShell icon={CalendarClock} title="الاجتماعات القادمة">
              {meetingsQuery.isLoading ? (
                <LoadingBlock />
              ) : meetingsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل الاجتماعات القادمة." />
              ) : upcomingMeetings.length === 0 ? (
                <EmptyBlock text="لا توجد اجتماعات قادمة مرتبطة بعضوياتك الحالية." />
              ) : (
                <ul className="space-y-3">
                  {upcomingMeetings.map((m) => (
                    <MeetingCard key={m.meeting_id} meeting={m} variant="upcoming" />
                  ))}
                </ul>
              )}
            </SectionShell>

            <SectionShell icon={CalendarClock} title="الاجتماعات السابقة">
              {meetingsQuery.isLoading ? (
                <LoadingBlock />
              ) : meetingsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل الاجتماعات السابقة." />
              ) : previousMeetings.length === 0 ? (
                <EmptyBlock text="لا توجد اجتماعات سابقة متاحة لك حالياً." />
              ) : (
                <ul className="space-y-3">
                  {previousMeetings.map((m) => (
                    <MeetingCard key={m.meeting_id} meeting={m} variant="previous" />
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
                    <TopicCard key={t.topic_id} topic={t} showDescription />
                  ))}
                </ul>
              )}
            </SectionShell>

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
              <SubmitTopicForm
                eligibleMemberships={submitEligibleMemberships}
                onSubmit={async (payload) => {
                  await submitTopic({ data: payload });
                  toast.success("تم إرسال الموضوع إلى المجلس بنجاح");
                  await qc.invalidateQueries({ queryKey: ["faculty", "my-council-topics"] });
                }}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
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

function MeetingCard({
  meeting,
  variant,
}: {
  meeting: MyCouncilMeetingItem;
  variant: "upcoming" | "previous";
}) {
  const displayTitle = meeting.meeting_title?.trim() || meeting.council_name;
  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-primary text-sm">{displayTitle}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{meeting.council_name}</p>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {meetingStatusLabel(meeting.status)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
        <div>
          <dt className="text-muted-foreground">التاريخ والوقت</dt>
          <dd className="font-medium text-foreground mt-0.5">{formatDateTime(meeting.meeting_date)}</dd>
        </div>
        {meeting.location ? (
          <div>
            <dt className="text-muted-foreground">المكان</dt>
            <dd className="font-medium text-foreground mt-0.5">{meeting.location}</dd>
          </div>
        ) : null}
        {meeting.user_membership_role ? (
          <div>
            <dt className="text-muted-foreground">دورك في المجلس</dt>
            <dd className="font-medium text-foreground mt-0.5">
              {roleLabel(meeting.user_membership_role)}
            </dd>
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
    </li>
  );
}

function TopicCard({
  topic,
  showDescription,
}: {
  topic: MyCouncilTopicItem;
  showDescription: boolean;
}) {
  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-primary text-sm">{topic.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{topic.council_name}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {topicStatusLabel(topic.status)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">تاريخ التقديم</dt>
            <dd className="font-medium text-foreground mt-0.5">
              {topic.submitted_at ? formatDateTime(topic.submitted_at) : formatDateTime(topic.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">آخر تحديث</dt>
            <dd className="font-medium text-foreground mt-0.5">{formatDateTime(topic.updated_at)}</dd>
          </div>
        </div>
        {showDescription && topic.description ? (
          <div>
            <dt className="text-muted-foreground">الوصف</dt>
            <dd className="text-foreground mt-0.5 leading-relaxed line-clamp-4">{topic.description}</dd>
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
      </dl>
    </li>
  );
}

function SubmitTopicForm({
  eligibleMemberships,
  onSubmit,
}: {
  eligibleMemberships: MyCouncilMembershipV2[];
  onSubmit: (payload: { council_id: string; title: string; description?: string }) => Promise<void>;
}) {
  const [councilId, setCouncilId] = useState(eligibleMemberships[0]?.council_id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionExpiredHint, setSessionExpiredHint] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 5) {
      toast.error("عنوان الموضوع يجب أن لا يقل عن 5 أحرف");
      return;
    }
    if (!councilId) {
      toast.error("اختر المجلس أولاً");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        council_id: councilId,
        title: trimmedTitle,
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setSessionExpiredHint(false);
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
          <label className="text-xs font-medium text-foreground">المجلس</label>
          <Select value={councilId} onValueChange={setCouncilId} dir="rtl">
            <SelectTrigger>
              <SelectValue placeholder="اختر المجلس" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {eligibleMemberships.map((m) => (
                <SelectItem key={m.membership_id} value={m.council_id}>
                  {m.council_name} — {roleLabel(m.role)}
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

        <Button type="submit" className="gap-2" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          إرسال الموضوع
        </Button>
      </form>
    </SectionShell>
  );
}
