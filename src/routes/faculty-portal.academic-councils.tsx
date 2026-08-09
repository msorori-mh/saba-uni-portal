import { createFileRoute } from "@tanstack/react-router";
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
  Users2,
} from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getMyAcademicCouncilMembershipsV2,
  getMyCouncilMeetingsV2,
  getMyCouncilTopics,
} from "@/lib/faculty-councils.functions";

export const Route = createFileRoute("/faculty-portal/academic-councils")({
  head: () => ({
    meta: [
      { title: "مجالسي الأكاديمية — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyAcademicCouncilsPage,
});

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

  const currentMemberships = membershipsQuery.data?.currentMemberships ?? [];
  const previousMemberships = membershipsQuery.data?.previousMemberships ?? [];
  const upcomingMeetings = meetingsQuery.data?.upcomingMeetings ?? [];
  const previousMeetings = meetingsQuery.data?.previousMeetings ?? [];
  const mySubmittedTopics = topicsQuery.data?.mySubmittedTopics ?? [];
  const councilVisibleTopics = topicsQuery.data?.councilVisibleTopics ?? [];

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
  const chairCouncilIds = useMemo(
    () => new Set(chairMemberships.map((m) => m.council_id)),
    [chairMemberships],
  );
  const agendaWriteCouncilIds = useMemo(
    () => new Set(agendaWriteMemberships.map((m) => m.council_id)),
    [agendaWriteMemberships],
  );
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

  const [workspaceTab, setWorkspaceTab] = useState("meetings");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [agendaMeetingId, setAgendaMeetingId] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);

  const openAgenda = (meetingId: string) => {
    setAgendaMeetingId(meetingId);
    setAgendaOpen(true);
  };

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
          className="flex items-start gap-3"
        >
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
                onOpenMeeting={() => setWorkspaceTab("meetings")}
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
                  onClick={() => setSubmitOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  تقديم موضوع
                </Button>
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
                  onManageAgenda={openAgenda}
                  onUpdated={() => void meetingsQuery.refetch()}
                />
              </TabsContent>

              <TabsContent value="topics" className="mt-4">
                <CouncilTopicsWorkspace
                  mySubmittedTopics={mySubmittedTopics}
                  councilVisibleTopics={councilVisibleTopics}
                  isLoading={topicsQuery.isLoading}
                  isError={topicsQuery.isError}
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
