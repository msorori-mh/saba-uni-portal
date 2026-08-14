import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  BarChart3,
  CalendarClock,
  FilePlus2,
  Gavel,
  LayoutDashboard,
  Loader2,
  Plus,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CouncilsActionRequired,
  CouncilsOperationalSummaryStrip,
  CouncilContextSelector,
  CouncilLifecycleMeetings,
  CouncilDecisionsPanel,
  CouncilMeetingWorkspacePanel,
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
} from "@/components/portal/councils";
import {
  buildOperationalSummary,
  deriveActionRequiredItems,
  filterAgendaWriteMemberships,
  filterChairMemberships,
  filterSubmitEligible,
  isViewerOnly,
} from "@/lib/faculty-portal/councils-operational";
import {
  classifyMeetingLifecycle,
  pickDefaultCouncilId,
  scopeMeetingsToCouncil,
  scopeTopicsToCouncil,
} from "@/lib/faculty-portal/councils-context";
import {
  getMyAcademicCouncilMembershipsV2,
  getMyCouncilMeetingsV2,
  getMyCouncilTopics,
  getOpenIntakeMeetingsForMember,
} from "@/lib/faculty-councils.functions";
import { CouncilNotificationBell } from "@/components/councils/CouncilNotificationBell";
import { CouncilChairDashboard } from "@/components/councils/CouncilChairDashboard";
import { CouncilSecretaryDashboard } from "@/components/councils/CouncilSecretaryDashboard";
import { CouncilMemberWorkspace } from "@/components/councils/CouncilMemberWorkspace";
import {
  COUNCIL_LIVE_INDICATORS_INTERVAL_MS,
  liveQueryOptions,
  useLivePollInterval,
} from "@/lib/councils-live";

import { CouncilResponsibleActorView } from "@/components/councils/CouncilResponsibleActorView";
import { CouncilReportsView } from "@/components/councils/CouncilReportsView";
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

  // Live-polled so a meeting flipping to `in_session` is picked up within ~5s.
  const meetingsLiveInterval = useLivePollInterval(
    true,
    COUNCIL_LIVE_INDICATORS_INTERVAL_MS,
  );
  const meetingsQuery = useQuery({
    queryKey: ["faculty", "my-council-meetings-v2"],
    queryFn: () => fetchMeetings(),
    ...liveQueryOptions(meetingsLiveInterval),
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

  const allMeetings = useMemo(
    () => [...upcomingMeetings, ...previousMeetings],
    [upcomingMeetings, previousMeetings],
  );

  // ---- Council context (primary scope of the whole page) ----
  const [selectedCouncilIdState, setSelectedCouncilId] = useState<string | null>(null);
  const defaultCouncilId = useMemo(
    () => pickDefaultCouncilId(currentMemberships, allMeetings),
    [currentMemberships, allMeetings],
  );
  const selectedCouncilId =
    selectedCouncilIdState &&
    currentMemberships.some((m) => m.council_id === selectedCouncilIdState)
      ? selectedCouncilIdState
      : defaultCouncilId;
  const selectedMembership =
    currentMemberships.find((m) => m.council_id === selectedCouncilId) ?? null;
  const selectedRole = selectedMembership?.role ?? "viewer";

  const councilMemberships = useMemo(
    () => (selectedMembership ? [selectedMembership] : []),
    [selectedMembership],
  );
  const submitEligibleMemberships = useMemo(
    () => filterSubmitEligible(councilMemberships),
    [councilMemberships],
  );
  const chairMemberships = useMemo(
    () => filterChairMemberships(councilMemberships),
    [councilMemberships],
  );
  const agendaWriteMemberships = useMemo(
    () => filterAgendaWriteMemberships(councilMemberships),
    [councilMemberships],
  );
  const canManageAgenda = agendaWriteMemberships.length > 0;
  const roleByCouncilId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of currentMemberships) map.set(m.council_id, m.role);
    return map;
  }, [currentMemberships]);
  const viewerOnly = isViewerOnly(councilMemberships);

  // ---- Council-scoped data ----
  const councilUpcomingMeetings = useMemo(
    () => scopeMeetingsToCouncil(upcomingMeetings, selectedCouncilId),
    [upcomingMeetings, selectedCouncilId],
  );
  const councilPreviousMeetings = useMemo(
    () => scopeMeetingsToCouncil(previousMeetings, selectedCouncilId),
    [previousMeetings, selectedCouncilId],
  );
  const councilMeetings = useMemo(
    () => [...councilUpcomingMeetings, ...councilPreviousMeetings],
    [councilUpcomingMeetings, councilPreviousMeetings],
  );
  const councilMyTopics = useMemo(
    () => scopeTopicsToCouncil(mySubmittedTopics, selectedCouncilId),
    [mySubmittedTopics, selectedCouncilId],
  );
  const councilOtherTopics = useMemo(
    () => scopeTopicsToCouncil(councilVisibleTopics, selectedCouncilId),
    [councilVisibleTopics, selectedCouncilId],
  );

  const summary = useMemo(
    () =>
      buildOperationalSummary({
        currentMemberships: councilMemberships,
        chairMemberships,
        agendaWriteMemberships,
        upcomingMeetings: councilUpcomingMeetings,
        mySubmittedTopics: councilMyTopics,
        formatDateTime,
      }),
    [
      councilMemberships,
      chairMemberships,
      agendaWriteMemberships,
      councilUpcomingMeetings,
      councilMyTopics,
    ],
  );

  const actionItems = useMemo(
    () =>
      deriveActionRequiredItems({
        chairMemberships,
        agendaWriteMemberships,
        upcomingMeetings: councilUpcomingMeetings,
        mySubmittedTopics: councilMyTopics,
      }),
    [chairMemberships, agendaWriteMemberships, councilUpcomingMeetings, councilMyTopics],
  );

  const liveMeeting = councilMeetings.find(
    (m) => classifyMeetingLifecycle(m.status) === "in_session",
  );
  const nextMeeting = councilUpcomingMeetings[0];

  // ---- Workspace state ----
  const [workspaceTab, setWorkspaceTab] = useState("overview");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [agendaMeetingId, setAgendaMeetingId] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [activeMeetingIdState, setActiveMeetingId] = useState<string | null>(null);
  const activeMeeting =
    councilMeetings.find((m) => m.meeting_id === activeMeetingIdState) ?? null;

  const openAgenda = (meetingId: string) => {
    setAgendaMeetingId(meetingId);
    setAgendaOpen(true);
  };

  const openMeetingWorkspace = (meetingId: string) => {
    setActiveMeetingId(meetingId);
    setWorkspaceTab("meetings");
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document
          .querySelector('[data-testid="councils-meeting-workspace"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  };

  const selectCouncil = (councilId: string) => {
    setSelectedCouncilId(councilId);
    setActiveMeetingId(null);
  };

  const openIntakeQuery = useQuery({
    queryKey: ["faculty", "open-intake-meetings"],
    queryFn: () => fetchOpenIntakeMeetings(),
    enabled: submitEligibleMemberships.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const openIntakeMeetings = (openIntakeQuery.data ?? []).filter(
    (m: { council_id?: string }) => !selectedCouncilId || m.council_id === selectedCouncilId,
  );
  const hasOpenIntake = openIntakeMeetings.length > 0;
  const intakeNoticeForNextMeeting =
    nextMeeting &&
    !openIntakeMeetings.some(
      (m: { meeting_id?: string }) => m.meeting_id === nextMeeting.meeting_id,
    )
      ? INTAKE_CLOSED_NOTICE
      : null;

  const pageLoading =
    membershipsQuery.isLoading && meetingsQuery.isLoading && topicsQuery.isLoading;

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
          {/* IA_02: the authorization-audit route stays reachable directly,
              but it is no longer surfaced inside the member workspace header. */}
          <div className="flex items-center gap-2 shrink-0">
            <CouncilNotificationBell />
          </div>
        </header>

        {pageLoading ? (
          <div className="grid place-items-center py-16" role="status" aria-label="جاري التحميل">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : membershipsQuery.isError ? (
          <ErrorBlock message="تعذّر تحميل عضويات المجالس. يرجى إعادة المحاولة لاحقاً." />
        ) : currentMemberships.length === 0 ? (
          <SectionShell icon={ShieldCheck} title="مجالسي الحالية" testId="councils-current-memberships">
            <CompactEmpty text="لا توجد عضويات فعّالة مرتبطة بحسابك حالياً." />
          </SectionShell>
        ) : (
          <>
            <div data-testid="councils-current-memberships">
              <CouncilContextSelector
                memberships={currentMemberships}
                selectedCouncilId={selectedCouncilId}
                onSelect={selectCouncil}
                nextMeetingLabel={
                  nextMeeting ? formatDateTime(nextMeeting.scheduled_at) : null
                }
              />
            </div>

            <CouncilsOperationalSummaryStrip summary={summary} />

            {viewerOnly ? (
              <div
                data-testid="councils-viewer-banner"
                className="rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900"
              >
                صلاحيتك الحالية قراءة فقط، ولا يمكنك تقديم موضوعات لهذا المجلس.
              </div>
            ) : null}

            <div data-testid="councils-primary-actions" className="flex flex-wrap gap-2">
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

            <Tabs
              value={workspaceTab}
              onValueChange={setWorkspaceTab}
              dir="rtl"
              data-testid="councils-workspace-tabs"
            >
              <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1">
                <TabsTrigger
                  value="overview"
                  className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                  data-testid="councils-tab-overview"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                  نظرة المجلس
                </TabsTrigger>
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
                  value="decisions"
                  className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                  data-testid="councils-tab-decisions"
                >
                  <Gavel className="h-3.5 w-3.5" aria-hidden />
                  القرارات
                </TabsTrigger>
                <TabsTrigger
                  value="reports"
                  className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                  data-testid="councils-tab-reports"
                >
                  <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                  التقارير
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

              {/* نظرة المجلس — أولوية تشغيلية: جلسة حية ← إجراء مطلوب ← الاجتماع القادم */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {liveMeeting ? (
                  <SectionShell
                    icon={ShieldCheck}
                    title="جلسة منعقدة الآن"
                    testId="councils-live-session-card"
                    actions={
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-8 text-xs"
                        onClick={() => openMeetingWorkspace(liveMeeting.meeting_id)}
                      >
                        فتح مساحة الاجتماع
                      </Button>
                    }
                  >
                    <p className="text-xs text-muted-foreground">
                      {liveMeeting.meeting_title?.trim() ||
                        `اجتماع رقم ${liveMeeting.meeting_number}`}{" "}
                      · {formatDateTime(liveMeeting.scheduled_at)}
                    </p>
                  </SectionShell>
                ) : null}

                <CouncilsActionRequired
                  items={actionItems}
                  onSchedule={
                    chairMemberships.length > 0 ? () => setScheduleOpen(true) : undefined
                  }
                  onOpenAgenda={canManageAgenda ? openAgenda : undefined}
                  onOpenTopics={() => setWorkspaceTab("topics")}
                />

                {nextMeeting && !liveMeeting ? (
                  <NextMeetingPriorityCard
                    meeting={nextMeeting}
                    canManageAgenda={canManageAgenda}
                    onManageAgenda={openAgenda}
                    onOpenMeeting={openMeetingWorkspace}
                    onViewAgenda={openMeetingWorkspace}
                    intakeNotice={intakeNoticeForNextMeeting}
                  />
                ) : null}

                {selectedMembership ? (
                  <SectionShell icon={ShieldCheck} title="لوحة دوري في المجلس">
                    {selectedRole === "chair" ? (
                      <CouncilChairDashboard
                        councilId={selectedMembership.council_id}
                        councilName={selectedMembership.council_name}
                      />
                    ) : selectedRole === "secretary" ? (
                      <CouncilSecretaryDashboard
                        councilId={selectedMembership.council_id}
                        councilName={selectedMembership.council_name}
                      />
                    ) : (
                      <CouncilMemberWorkspace
                        councilId={selectedMembership.council_id}
                        councilName={selectedMembership.council_name}
                        readOnly={selectedRole === "viewer"}
                        onEnterMeeting={openMeetingWorkspace}
                        liveMeeting={
                          liveMeeting
                            ? {
                                meeting_id: liveMeeting.meeting_id,
                                title:
                                  liveMeeting.meeting_title?.trim() ||
                                  `اجتماع رقم ${liveMeeting.meeting_number}`,
                                scheduled_at: liveMeeting.scheduled_at ?? null,
                              }
                            : null
                        }
                      />

                    )}
                  </SectionShell>
                ) : null}

                {userId && selectedRole !== "viewer" ? (
                  <CouncilResponsibleActorView userId={userId} />
                ) : null}
              </TabsContent>

              {/* الاجتماعات — دورة حياة + مساحة اجتماع واحدة فقط */}
              <TabsContent value="meetings" className="mt-4 space-y-4">
                <CouncilLifecycleMeetings
                  meetings={councilMeetings}
                  isLoading={meetingsQuery.isLoading}
                  isError={meetingsQuery.isError}
                  activeMeetingId={activeMeeting?.meeting_id ?? null}
                  onOpenMeeting={openMeetingWorkspace}
                  canManageAgenda={canManageAgenda}
                  onManageAgenda={openAgenda}
                />

                {activeMeeting ? (
                  <CouncilMeetingWorkspacePanel
                    meeting={activeMeeting}
                    userRole={
                      activeMeeting.user_membership_role ??
                      roleByCouncilId.get(activeMeeting.council_id) ??
                      "viewer"
                    }
                    userId={userId}
                    canManageAgenda={canManageAgenda}
                    onManageAgenda={openAgenda}
                    onClose={() => setActiveMeetingId(null)}
                    onStateChanged={() => void meetingsQuery.refetch()}
                  />
                ) : (
                  <CompactEmpty
                    text="اختر اجتماعاً لفتح مساحته وإدارة جدول الأعمال والجلسة والمحضر."
                    testId="councils-meeting-workspace-empty"
                  />
                )}
              </TabsContent>

              {/* الموضوعات — ضمن المجلس المحدد */}
              <TabsContent value="topics" className="mt-4 space-y-4">
                <CouncilTopicsWorkspace
                  mySubmittedTopics={councilMyTopics}
                  councilVisibleTopics={councilOtherTopics}
                  isLoading={topicsQuery.isLoading}
                  isError={topicsQuery.isError}
                  userId={userId}
                  onUpdated={() => void topicsQuery.refetch()}
                />
                {canManageAgenda ? (
                  <CouncilTopicReviewQueue
                    roleByCouncilId={roleByCouncilId}
                    onUpdated={() => void topicsQuery.refetch()}
                  />
                ) : null}
              </TabsContent>

              {/* القرارات — على مستوى المجلس مع الاجتماع المصدر */}
              <TabsContent value="decisions" className="mt-4">
                {selectedCouncilId ? (
                  <CouncilDecisionsPanel
                    councilId={selectedCouncilId}
                    meetings={councilMeetings}
                    onOpenSourceMeeting={openMeetingWorkspace}
                  />
                ) : null}
              </TabsContent>

              {/* التقارير */}
              <TabsContent value="reports" className="mt-4 space-y-3">
                {selectedMembership ? (
                  <>
                    <CouncilReportsView
                      councilId={selectedMembership.council_id}
                      councilName={selectedMembership.council_name}
                    />
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/faculty-portal/academic-councils/reports">
                        فتح صفحة التقارير الكاملة
                      </Link>
                    </Button>
                  </>
                ) : null}
              </TabsContent>

              {/* الأرشيف */}
              <TabsContent value="archive" className="mt-4 space-y-3" data-testid="councils-archive-panel">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/faculty-portal/academic-councils/archive">
                      الاجتماعات المؤرشفة
                    </Link>
                  </Button>
                </div>
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
                upcomingMeetings={councilMeetings}
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

/** Legacy combined meetings workspace kept for compatibility with existing consumers. */
export const LegacyCouncilMeetingsWorkspace = CouncilMeetingsWorkspace;
