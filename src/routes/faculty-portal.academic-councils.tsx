import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  CalendarClock,
  FilePlus2,
  Loader2,
  Plus,
  ScrollText,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CouncilsActionRequired,
  CouncilsOperationalSummaryStrip,
  CurrentMembershipCard,
  PreviousMembershipCard,
  ScheduleMeetingDialog,
  CouncilAgendaDialog,
  SubmitCouncilTopicDialog,
  CouncilMeetingsWorkspace,
  NextMeetingPriorityCard,
  CouncilTopicsWorkspace,
  CouncilTopicReviewQueue,
  CompactEmpty,
  ErrorBlock,
  LoadingBlock,
  SectionShell,
  formatDateTime,
  MEMBER_ROLE_LABELS,
  meetingStatusLabel,
} from "@/components/portal/councils";
import {
  buildOperationalSummary,
  deriveActionRequiredItems,
  filterAgendaWriteMemberships,
  filterChairMemberships,
  filterSecretaryMemberships,
  filterSubmitEligible,
  isViewerOnly,
} from "@/lib/faculty-portal/councils-operational";
import {
  getMyAcademicCouncilMembershipsV2,
  getMyCouncilMeetingsV2,
  getMyCouncilTopics,
  getOpenIntakeMeetingsForMember,
  type MyCouncilMembershipV2,
} from "@/lib/faculty-councils.functions";
import type { CouncilLinkMemberRole } from "@/lib/admin-councils.functions";
import { CouncilSessionAndGovernanceWorkspace } from "@/components/councils/CouncilSessionAndGovernanceWorkspace";
import { CouncilNotificationBell } from "@/components/councils/CouncilNotificationBell";
import { CouncilChairDashboard } from "@/components/councils/CouncilChairDashboard";
import { CouncilSecretaryDashboard } from "@/components/councils/CouncilSecretaryDashboard";
import { CouncilMemberWorkspace } from "@/components/councils/CouncilMemberWorkspace";
import { CouncilResponsibleActorView } from "@/components/councils/CouncilResponsibleActorView";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/faculty-portal/academic-councils")({
  head: () => ({
    meta: [
      { title: "مجالسي الأكاديمية — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyAcademicCouncilsPage,
});

const GOVERNANCE_MEETING_STATUSES = [
  "agenda_ready",
  "in_session",
  "minutes_draft",
  "minutes_review",
  "minutes_locked",
  "archived",
] as const;

const INTAKE_CLOSED_NOTICE =
  "أُغلق استقبال الموضوعات لهذا الاجتماع بعد اعتماد جدول الأعمال.";

function FacultyAcademicCouncilsPage() {
  const fetchMembershipsV2 = useServerFn(getMyAcademicCouncilMembershipsV2);
  const fetchMeetings = useServerFn(getMyCouncilMeetingsV2);
  const fetchTopics = useServerFn(getMyCouncilTopics);
  const fetchOpenIntakeMeetings = useServerFn(getOpenIntakeMeetingsForMember);

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
  const userId = userIdQuery.data ?? null;

  const submitEligibleMemberships = useMemo(
    () => filterSubmitEligible(currentMemberships),
    [currentMemberships],
  );
  const chairMemberships = useMemo(
    () => filterChairMemberships(currentMemberships),
    [currentMemberships],
  );
  const agendaWriteMemberships = useMemo(
    () => filterAgendaWriteMemberships(currentMemberships),
    [currentMemberships],
  );
  const secretaryMemberships = useMemo(
    () => filterSecretaryMemberships(currentMemberships),
    [currentMemberships],
  );
  const chairCouncilIds = useMemo(
    () => new Set(chairMemberships.map((m) => m.council_id)),
    [chairMemberships],
  );
  const agendaWriteCouncilIds = useMemo(
    () => new Set(agendaWriteMemberships.map((m) => m.council_id)),
    [agendaWriteMemberships],
  );
  const secretaryCouncilIds = useMemo(
    () => new Set(secretaryMemberships.map((m) => m.council_id)),
    [secretaryMemberships],
  );
  const roleByCouncilId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of currentMemberships) {
      map.set(m.council_id, m.role);
    }
    return map;
  }, [currentMemberships]);
  const viewerOnly = isViewerOnly(currentMemberships);

  const summary = useMemo(
    () =>
      buildOperationalSummary({
        currentMemberships,
        chairMemberships,
        agendaWriteMemberships,
        upcomingMeetings,
        mySubmittedTopics,
        formatDateTime,
      }),
    [
      currentMemberships,
      chairMemberships,
      agendaWriteMemberships,
      upcomingMeetings,
      mySubmittedTopics,
    ],
  );

  const actionItems = useMemo(
    () =>
      deriveActionRequiredItems({
        chairMemberships,
        agendaWriteMemberships,
        upcomingMeetings,
        mySubmittedTopics,
      }),
    [chairMemberships, agendaWriteMemberships, upcomingMeetings, mySubmittedTopics],
  );

  const nextMeeting = upcomingMeetings[0];
  const nextMeetingByCouncil = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of upcomingMeetings) {
      if (!map.has(m.council_id)) {
        map.set(m.council_id, formatDateTime(m.scheduled_at));
      }
    }
    return map;
  }, [upcomingMeetings]);

  const governanceMeetings = useMemo(
    () =>
      [...upcomingMeetings, ...previousMeetings].filter((m) =>
        (GOVERNANCE_MEETING_STATUSES as readonly string[]).includes(m.status),
      ),
    [upcomingMeetings, previousMeetings],
  );

  const [workspaceTab, setWorkspaceTab] = useState("meetings");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [agendaMeetingId, setAgendaMeetingId] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [focusMeetingId, setFocusMeetingId] = useState<string | null>(null);
  const [agendaExpandMeetingId, setAgendaExpandMeetingId] = useState<string | null>(null);

  const openAgenda = (meetingId: string) => {
    setAgendaMeetingId(meetingId);
    setAgendaOpen(true);
  };

  const scrollToMeetingCard = (meetingId: string) => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      const el = document.getElementById(`council-meeting-card-${meetingId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).focus({ preventScroll: true });
    }, 120);
  };

  const openMeeting = (meetingId: string) => {
    setWorkspaceTab("meetings");
    setAgendaExpandMeetingId(null);
    setFocusMeetingId(meetingId);
    scrollToMeetingCard(meetingId);
  };

  const viewMeetingAgenda = (meetingId: string) => {
    setWorkspaceTab("meetings");
    setFocusMeetingId(meetingId);
    setAgendaExpandMeetingId(meetingId);
    scrollToMeetingCard(meetingId);
  };

  const openIntakeQuery = useQuery({
    queryKey: ["faculty", "open-intake-meetings"],
    queryFn: () => fetchOpenIntakeMeetings(),
    enabled: submitEligibleMemberships.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const openIntakeMeetings = openIntakeQuery.data ?? [];
  const hasOpenIntake = openIntakeMeetings.length > 0;
  const intakeNoticeForNextMeeting =
    nextMeeting &&
    !openIntakeMeetings.some((m) => m.meeting_id === nextMeeting.meeting_id) &&
    (GOVERNANCE_MEETING_STATUSES as readonly string[]).includes(nextMeeting.status)
      ? INTAKE_CLOSED_NOTICE
      : null;


  const pageLoading =
    membershipsQuery.isLoading && meetingsQuery.isLoading && topicsQuery.isLoading;

  const allMeetingsForAgenda = useMemo(
    () => [...upcomingMeetings, ...previousMeetings],
    [upcomingMeetings, previousMeetings],
  );

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[{ label: "المجالس الأكاديمية" }]}
    >
      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-4xl space-y-4 sm:space-y-5">
        <header
          data-testid="councils-page-header"
          className="flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
              <ScrollText className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-extrabold text-primary">
                مجالسي الأكاديمية
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
                إدارة عضويتك واجتماعاتك وموضوعات المجالس الأكاديمية من مكان واحد.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CouncilNotificationBell />
            <Button variant="outline" size="sm" asChild>
              <Link to="/faculty-portal/academic-councils/archive">الاجتماعات المؤرشفة</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/faculty-portal/academic-councils/authorization-audit">
                فحص الصلاحيات
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/faculty-portal/academic-councils/reports">التقارير</Link>
            </Button>

          </div>
        </header>

        {pageLoading ? (
          <div className="grid place-items-center py-16" role="status" aria-label="جاري التحميل">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <CouncilsOperationalSummaryStrip summary={summary} />

            <CouncilsActionRequired
              items={actionItems}
              onSchedule={
                chairMemberships.length > 0 ? () => setScheduleOpen(true) : undefined
              }
              onOpenAgenda={
                agendaWriteMemberships.length > 0 ? openAgenda : undefined
              }
              onOpenTopics={() => setWorkspaceTab("topics")}
            />

            <SectionShell
              icon={Users2}
              title="مجالسي الحالية"
              testId="councils-current-memberships"
            >
              {membershipsQuery.isLoading ? (
                <LoadingBlock />
              ) : membershipsQuery.isError ? (
                <ErrorBlock message="تعذّر تحميل عضويات المجالس. يرجى إعادة المحاولة لاحقاً." />
              ) : currentMemberships.length === 0 ? (
                <CompactEmpty text="لا توجد عضويات فعّالة مرتبطة بحسابك حالياً." />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {currentMemberships.map((m) => (
                    <CurrentMembershipCard
                      key={m.membership_id}
                      membership={m}
                      nextMeeting={nextMeetingByCouncil.get(m.council_id)}
                      onOpen={() => setWorkspaceTab("meetings")}
                    />
                  ))}
                </ul>
              )}
            </SectionShell>

            {nextMeeting ? (
              <NextMeetingPriorityCard
                meeting={nextMeeting}
                canManageAgenda={agendaWriteCouncilIds.has(nextMeeting.council_id)}
                onManageAgenda={openAgenda}
                onOpenMeeting={openMeeting}
                onViewAgenda={viewMeetingAgenda}
                intakeNotice={intakeNoticeForNextMeeting}
              />
            ) : null}

            {currentMemberships.length > 0 ? (
              <SectionShell icon={ShieldCheck} title="لوحة العمل والمتابعة">
                <CouncilWorkspacesSection
                  memberships={currentMemberships}
                  userId={userId}
                />
              </SectionShell>
            ) : null}

            {agendaWriteMemberships.length > 0 ? (
              <CouncilTopicReviewQueue
                roleByCouncilId={roleByCouncilId}
                onUpdated={() => void topicsQuery.refetch()}
              />
            ) : null}

            <div
              data-testid="councils-primary-actions"
              className="flex flex-wrap gap-2"
            >
              {chairMemberships.length > 0 ? (
                <Button
                  type="button"
                  className="min-h-9 gap-1.5"
                  data-testid="councils-schedule-meeting-button"
                  onClick={() => setScheduleOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  جدولة اجتماع
                </Button>
              ) : null}
              {submitEligibleMemberships.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9 gap-1.5"
                  data-testid="councils-submit-topic-button"
                  disabled={openIntakeQuery.isLoading || !hasOpenIntake}
                  title={
                    !openIntakeQuery.isLoading && !hasOpenIntake
                      ? INTAKE_CLOSED_NOTICE
                      : undefined
                  }
                  onClick={() => setSubmitOpen(true)}
                >
                  {openIntakeQuery.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden />
                  )}
                  تقديم موضوع
                </Button>
              ) : null}
              {submitEligibleMemberships.length > 0 &&
              !openIntakeQuery.isLoading &&
              !hasOpenIntake ? (
                <p
                  data-testid="councils-submit-topic-disabled-reason"
                  className="w-full text-[11px] leading-relaxed text-muted-foreground"
                >
                  {INTAKE_CLOSED_NOTICE}
                </p>
              ) : null}
            </div>

            {viewerOnly ? (
              <div
                data-testid="councils-viewer-banner"
                className="rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900"
              >
                صلاحيتك الحالية قراءة فقط، ولا يمكنك تقديم موضوعات لهذا المجلس.
              </div>
            ) : null}

            <Tabs
              value={workspaceTab}
              onValueChange={setWorkspaceTab}
              dir="rtl"
              data-testid="councils-workspace-tabs"
            >
              <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1">
                <TabsTrigger
                  value="meetings"
                  className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                  data-testid="councils-tab-meetings"
                >
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  الاجتماعات
                </TabsTrigger>
                <TabsTrigger
                  value="topics"
                  className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                  data-testid="councils-tab-topics"
                >
                  <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                  الموضوعات
                </TabsTrigger>
                <TabsTrigger
                  value="archive"
                  className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                  data-testid="councils-tab-archive"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden />
                  الأرشيف
                </TabsTrigger>
              </TabsList>

              <TabsContent value="meetings" className="mt-4">
                <CouncilMeetingsWorkspace
                  upcomingMeetings={upcomingMeetings}
                  previousMeetings={previousMeetings}
                  isLoading={meetingsQuery.isLoading}
                  isError={meetingsQuery.isError}
                  chairCouncilIds={chairCouncilIds}
                  agendaWriteCouncilIds={agendaWriteCouncilIds}
                  secretaryCouncilIds={secretaryCouncilIds}
                  onManageAgenda={openAgenda}
                  onUpdated={() => void meetingsQuery.refetch()}
                  focusMeetingId={focusMeetingId}
                  agendaExpandMeetingId={agendaExpandMeetingId}
                />
              </TabsContent>

              <TabsContent value="topics" className="mt-4">
                <CouncilTopicsWorkspace
                  mySubmittedTopics={mySubmittedTopics}
                  councilVisibleTopics={councilVisibleTopics}
                  isLoading={topicsQuery.isLoading}
                  isError={topicsQuery.isError}
                  userId={userId}
                  onUpdated={() => void topicsQuery.refetch()}
                />
              </TabsContent>

              <TabsContent value="archive" className="mt-4" data-testid="councils-archive-panel">
                <SectionShell icon={Archive} title="عضويات سابقة">
                  {membershipsQuery.isLoading ? (
                    <LoadingBlock />
                  ) : membershipsQuery.isError ? (
                    <ErrorBlock message="تعذّر تحميل أرشيف العضويات." />
                  ) : previousMemberships.length === 0 ? (
                    <CompactEmpty
                      text="لا توجد عناصر مؤرشفة."
                      testId="councils-archive-empty"
                    />
                  ) : (
                    <ul className="space-y-3">
                      {previousMemberships.map((m) => (
                        <PreviousMembershipCard key={m.membership_id} membership={m} />
                      ))}
                    </ul>
                  )}
                </SectionShell>
              </TabsContent>
            </Tabs>

            {governanceMeetings.length > 0 && currentMemberships.length > 0 ? (
              <SectionShell icon={ShieldCheck} title="الجلسة الحية والحوكمة">
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  إدارة الجلسة والتصويت والمحضر والقرارات والأرشفة متاح وفق دورك المعتمد في المجلس.
                </p>
                <div className="space-y-6">
                  {governanceMeetings.map((m) => {
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

            {chairMemberships.length > 0 ? (
              <ScheduleMeetingDialog
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
                chairMemberships={chairMemberships}
                onScheduled={() => void meetingsQuery.refetch()}
              />
            ) : null}

            {agendaWriteMemberships.length > 0 ? (
              <CouncilAgendaDialog
                open={agendaOpen}
                onOpenChange={setAgendaOpen}
                meetingId={agendaMeetingId}
                writeMemberships={agendaWriteMemberships}
                upcomingMeetings={allMeetingsForAgenda}
                onUpdated={() => void meetingsQuery.refetch()}
              />
            ) : null}

            {submitEligibleMemberships.length > 0 ? (
              <SubmitCouncilTopicDialog
                open={submitOpen}
                onOpenChange={setSubmitOpen}
                eligibleMemberships={submitEligibleMemberships}
              />
            ) : null}
          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}

function CouncilWorkspacesSection({
  memberships,
  userId,
}: {
  memberships: MyCouncilMembershipV2[];
  userId: string | null;
}) {
  const [selectedId, setSelectedId] = useState(memberships[0]?.council_id ?? "");
  const selected = memberships.find((m) => m.council_id === selectedId) ?? memberships[0];

  if (!selected) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        لا توجد عضويات متاحة.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <label htmlFor="current-council-select" className="text-xs font-bold text-primary whitespace-nowrap">
            المجلس الحالي:
          </label>
          <Select value={selectedId} onValueChange={setSelectedId} dir="rtl">
            <SelectTrigger id="current-council-select" className="sm:max-w-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {memberships.map((m) => (
                <SelectItem key={m.council_id} value={m.council_id}>
                  {m.council_name} — {MEMBER_ROLE_LABELS[m.role as CouncilLinkMemberRole] ?? m.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          تستند الصلاحيات والخيارات المتاحة إلى دورك المعتمد في كل مجلس.
        </p>
      </div>

      {selected.role === "chair" ? (
        <CouncilChairDashboard councilId={selected.council_id} councilName={selected.council_name} />
      ) : selected.role === "secretary" ? (
        <CouncilSecretaryDashboard
          councilId={selected.council_id}
          councilName={selected.council_name}
        />
      ) : selected.role === "viewer" ? (
        <CouncilMemberWorkspace
          councilId={selected.council_id}
          councilName={selected.council_name}
          readOnly
        />
      ) : (
        <CouncilMemberWorkspace
          councilId={selected.council_id}
          councilName={selected.council_name}
        />
      )}

      {userId && selected.role !== "viewer" ? (
        <CouncilResponsibleActorView userId={userId} />
      ) : null}
    </div>
  );
}
