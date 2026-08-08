import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarClock,
  Loader2,
  ScrollText,
  Users,
  Vote,
  FileText,
  Archive,
} from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CouncilSessionAndGovernanceWorkspace } from "@/components/councils/CouncilSessionAndGovernanceWorkspace";
import { CouncilVotingControl } from "@/components/councils/CouncilVotingControl";
import {
  getMyAcademicCouncilMembershipsV2,
  getMyCouncilMeetingsV2,
  getAgendaItemsForMeeting,
  type MyCouncilMembershipV2,
  type CouncilMeetingV2Item,
  type CouncilAgendaItem,
} from "@/lib/faculty-councils.functions";
import {
  getCouncilAttendanceQuorumSummaryFn,
  getCouncilHistoricalMinutesFn,
} from "@/lib/councils-c4-c8.functions";

export const Route = createFileRoute("/faculty-portal/academic-councils/$meetingId")({
  head: () => ({
    meta: [
      { title: "تفاصيل الاجتماع — المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyCouncilMeetingDetailPage,
});

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

function meetingStatusLabel(status: string): string {
  return MEETING_STATUS_LABELS[status] ?? status;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function FacultyCouncilMeetingDetailPage() {
  const { meetingId } = Route.useParams();
  const fetchMemberships = useServerFn(getMyAcademicCouncilMembershipsV2);
  const fetchMeetings = useServerFn(getMyCouncilMeetingsV2);
  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  const fetchAttendance = useServerFn(getCouncilAttendanceQuorumSummaryFn);
  const fetchMinutes = useServerFn(getCouncilHistoricalMinutesFn);

  const membershipsQuery = useQuery({
    queryKey: ["faculty", "my-council-memberships-v2"],
    queryFn: () => fetchMemberships(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const meetingsQuery = useQuery({
    queryKey: ["faculty", "my-council-meetings-v2"],
    queryFn: () => fetchMeetings(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const agendaQuery = useQuery({
    queryKey: ["faculty", "meeting-agenda", meetingId],
    queryFn: () => fetchAgenda({ data: { meetingId } }),
    enabled: Boolean(meetingId),
    staleTime: 15_000,
  });

  const attendanceQuery = useQuery({
    queryKey: ["faculty", "meeting-attendance", meetingId],
    queryFn: () => fetchAttendance({ data: { meeting_id: meetingId } }),
    enabled: Boolean(meetingId),
    staleTime: 15_000,
  });

  const minutesQuery = useQuery({
    queryKey: ["faculty", "meeting-minutes", meetingId],
    queryFn: () => fetchMinutes({ data: { meeting_id: meetingId } }),
    enabled: Boolean(meetingId),
    staleTime: 15_000,
  });

  const meeting = useMemo(() => {
    return (
      meetingsQuery.data?.upcomingMeetings.find((m) => m.meeting_id === meetingId) ??
      meetingsQuery.data?.previousMeetings.find((m) => m.meeting_id === meetingId) ??
      null
    );
  }, [meetingsQuery.data, meetingId]);

  const membership = useMemo(() => {
    return membershipsQuery.data?.currentMemberships.find(
      (m) => m.council_id === meeting?.council_id
    );
  }, [membershipsQuery.data, meeting?.council_id]);

  const isLoading = membershipsQuery.isLoading || meetingsQuery.isLoading;
  const isError = membershipsQuery.isError || meetingsQuery.isError;

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[
        { label: "المجالس الأكاديمية", href: "/faculty-portal/academic-councils" },
        { label: "تفاصيل الاجتماع" },
      ]}
    >
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="gap-1">
            <Link to="/faculty-portal/academic-councils">
              <ArrowRight className="h-4 w-4" aria-hidden />
              عودة
            </Link>
          </Button>
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <ScrollText className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-lg font-extrabold text-primary">تفاصيل الاجتماع</h1>
            <p className="text-xs text-muted-foreground">
              متابعة الجلسة والتصويت والمحضر والقرارات حسب دورك.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="sr-only">جاري تحميل بيانات الاجتماع…</span>
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center">
            تعذّر تحميل بيانات الاجتماع. يرجى المحاولة لاحقاً.
          </div>
        ) : !meeting ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            لم يُعثر على الاجتماع أو لا تملك صلاحية الوصول إليه.
          </div>
        ) : !membership ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center">
            لا تملك عضوية فعّالة في المجلس المنظم لهذا الاجتماع.
          </div>
        ) : (
          <>
            <MeetingInfoCard meeting={meeting} membership={membership} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <AgendaAndVotingCard
                  meeting={meeting}
                  agenda={agendaQuery.data?.items ?? []}
                  membership={membership}
                  agendaLoading={agendaQuery.isLoading}
                />

                {(membership.role === "chair" || membership.role === "secretary") &&
                  meeting.status !== "archived" &&
                  meeting.status !== "cancelled" && (
                    <CouncilSessionAndGovernanceWorkspace
                      meetingId={meeting.meeting_id}
                      councilId={meeting.council_id}
                      meetingStatus={meeting.status}
                      userRole={membership.role}
                      userId={membership.membership_id}
                      onStateChanged={() => {
                        void meetingsQuery.refetch();
                        void attendanceQuery.refetch();
                        void minutesQuery.refetch();
                      }}
                    />
                  )}

                {membership.role === "member" && meeting.status === "in_session" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Vote className="h-4 w-4 text-primary" aria-hidden />
                        مشاركتك في الجلسة
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        يمكنك المشاركة في التصويت على البنود المفتوحة أدناه حسب جدول الأعمال.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-6">
                <AttendanceCard
                  data={attendanceQuery.data}
                  loading={attendanceQuery.isLoading}
                  error={attendanceQuery.isError}
                />
                <MinutesCard
                  data={minutesQuery.data}
                  loading={minutesQuery.isLoading}
                  error={minutesQuery.isError}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}

function MeetingInfoCard({
  meeting,
  membership,
}: {
  meeting: CouncilMeetingV2Item;
  membership: MyCouncilMembershipV2;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-bold text-primary">{meeting.meeting_title}</h2>
              <Badge variant="secondary" className="text-[10px]">
                {meetingStatusLabel(meeting.status)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {meeting.council_name} · الاجتماع رقم {meeting.meeting_number}
            </p>
          </div>
          <div className="text-left text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {formatDateTime(meeting.scheduled_at)}
            </div>
            {meeting.location ? <div className="mt-0.5">المكان: {meeting.location}</div> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">
            دورك: {membership.role === "chair" ? "رئيس المجلس" : membership.role === "secretary" ? "أمين السر" : membership.role === "member" ? "عضو" : "مطّلع"}
          </Badge>
          {meeting.status === "archived" ? (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Archive className="h-3 w-3" aria-hidden />
              مؤرشف — قراءة فقط
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AgendaAndVotingCard({
  meeting,
  agenda,
  membership,
  agendaLoading,
}: {
  meeting: CouncilMeetingV2Item;
  agenda: CouncilAgendaItem[];
  membership: MyCouncilMembershipV2;
  agendaLoading: boolean;
}) {
  const isReadOnly = membership.role === "viewer" || meeting.status === "archived";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden />
          جدول الأعمال والتصويت
        </CardTitle>
      </CardHeader>
      <CardContent>
        {agendaLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="sr-only">جاري تحميل جدول الأعمال…</span>
          </div>
        ) : agenda.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground">
            لا توجد بنود في جدول الأعمال حتى الآن.
          </div>
        ) : (
          <ol className="space-y-4" role="list" aria-label="بنود جدول الأعمال">
            {agenda.map((item) => (
              <li key={item.id} className="rounded-lg border border-border/70 bg-muted/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary">{item.order_index}.</span>
                    <span className="font-medium text-sm">{item.title}</span>
                    {item.is_approved ? (
                      <Badge variant="secondary" className="text-[9px]">
                        معتمد
                      </Badge>
                    ) : null}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {item.session_status ?? "pending"}
                  </Badge>
                </div>
                {item.notes ? (
                  <p className="mt-2 text-xs text-muted-foreground">{item.notes}</p>
                ) : null}
                {!isReadOnly && meeting.status === "in_session" ? (
                  <div className="mt-3">
                    <CouncilVotingControl
                      agendaItemId={item.id}
                      sessionStatus={item.session_status ?? "pending"}
                      isChair={membership.role === "chair"}
                      isEligibleMember={membership.role === "member" || membership.role === "chair" || membership.role === "secretary" || membership.role === "vice_chair"}
                      resolutionText={item.resolution}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceCard({
  data,
  loading,
  error,
}: {
  data: unknown;
  loading: boolean;
  error: boolean;
}) {
  const d = data as {
    eligible_member_count?: number;
    present_member_count?: number;
    quorum_met?: boolean;
    required_member_count?: number;
    roll_status?: string;
    attendance?: Array<{ user_id: string; member_role: string; attendance_state: string }>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" aria-hidden />
          الحضور والنصاب
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive text-center">تعذّر تحميل بيانات الحضور.</div>
        ) : !d ? (
          <div className="text-xs text-muted-foreground text-center">لا توجد بيانات حضور مسجلة.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-md border border-border bg-muted/20 p-2">
                <div className="font-bold text-primary">{d.present_member_count ?? 0}</div>
                <div className="text-muted-foreground">حاضرون</div>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-2">
                <div className="font-bold text-primary">{d.required_member_count ?? 0}</div>
                <div className="text-muted-foreground">المطلوب</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">النصاب:</span>
              <Badge variant={d.quorum_met ? "secondary" : "destructive"} className="text-[10px]">
                {d.quorum_met ? "مكتمل" : "غير مكتمل"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              حالة الكشف: {d.roll_status === "open" ? "مفتوح" : d.roll_status === "finalized" ? "مغلق نهائياً" : "غير موجود"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MinutesCard({
  data,
  loading,
  error,
}: {
  data: unknown;
  loading: boolean;
  error: boolean;
}) {
  const d = data as {
    body?: string;
    is_locked?: boolean;
    locked_at?: string;
    fingerprint?: string;
    status?: string;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden />
          المحضر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive text-center">تعذّر تحميل المحضر.</div>
        ) : !d ? (
          <div className="text-xs text-muted-foreground text-center">لا يوجد محضر مسجل.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">الحالة:</span>
              <Badge variant={d.is_locked ? "secondary" : "outline"} className="text-[10px]">
                {d.is_locked ? "مقفل" : "مسودة"}
              </Badge>
            </div>
            {d.is_locked ? (
              <>
                <p className="text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap">
                  {d.body}
                </p>
                {d.fingerprint ? (
                  <div className="text-[10px] text-muted-foreground break-all">
                    البصمة: {d.fingerprint}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">المحضر لم يُقفل بعد.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
