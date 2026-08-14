/**
 * Faculty Academic Councils operational dashboard UX guards.
 * SOURCE-LEVEL + pure helper unit tests. No DB / production access.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildOperationalSummary,
  deriveActionRequiredItems,
  deriveActionRequiredLabel,
  filterAgendaWriteMemberships,
  filterChairMemberships,
  filterSubmitEligible,
  isViewerOnly,
  meetingNeedsAgendaCompletion,
  SUBMIT_ELIGIBLE_ROLES,
} from "@/lib/faculty-portal/councils-operational";
import type {
  CouncilMeetingV2Item,
  MyCouncilMembershipV2,
  MyCouncilTopicItem,
} from "@/lib/faculty-councils.functions";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const ROUTE_SRC = read("src/routes/faculty-portal.academic-councils.tsx");
const OPS_SRC = read("src/lib/faculty-portal/councils-operational.ts");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkTsFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const COUNCILS_UI_FILES = walkTsFiles(join(ROOT, "src/components/portal/councils"));
const COUNCILS_UI_SRC = COUNCILS_UI_FILES.map((f) => readFileSync(f, "utf-8")).join("\n");
const ALL_SRC = `${ROUTE_SRC}\n${OPS_SRC}\n${COUNCILS_UI_SRC}`;

const membership = (
  overrides: Partial<MyCouncilMembershipV2> & Pick<MyCouncilMembershipV2, "role" | "council_id">,
): MyCouncilMembershipV2 => ({
  membership_id: overrides.membership_id ?? `m-${overrides.council_id}`,
  council_id: overrides.council_id,
  council_name: overrides.council_name ?? "مجلس تجريبي",
  council_type: overrides.council_type ?? "college",
  department_name: overrides.department_name ?? null,
  role: overrides.role,
  is_active: overrides.is_active ?? true,
  active_from: overrides.active_from ?? "2026-01-01T00:00:00.000Z",
  active_to: overrides.active_to ?? null,
  created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
});

const meeting = (
  overrides: Partial<CouncilMeetingV2Item> & Pick<CouncilMeetingV2Item, "meeting_id" | "council_id">,
): CouncilMeetingV2Item => ({
  meeting_id: overrides.meeting_id,
  council_id: overrides.council_id,
  council_name: overrides.council_name ?? "مجلس تجريبي",
  meeting_number: overrides.meeting_number ?? 1,
  meeting_title: overrides.meeting_title ?? "اجتماع",
  scheduled_at: overrides.scheduled_at ?? "2026-09-01T10:00:00.000Z",
  status: overrides.status ?? "scheduled",
  location: overrides.location ?? "قاعة أ",
  intake_opens_at: overrides.intake_opens_at ?? null,
  intake_closes_at: overrides.intake_closes_at ?? null,
  notes: overrides.notes ?? null,
  agenda_summary: overrides.agenda_summary ?? null,
  minutes_summary: overrides.minutes_summary ?? null,
  user_membership_role: overrides.user_membership_role ?? "member",
  created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
});

const topic = (
  overrides: Partial<MyCouncilTopicItem> & Pick<MyCouncilTopicItem, "topic_id" | "status">,
): MyCouncilTopicItem => ({
  topic_id: overrides.topic_id,
  council_id: overrides.council_id ?? "c1",
  council_name: overrides.council_name ?? "مجلس تجريبي",
  meeting_id: overrides.meeting_id ?? null,
  title: overrides.title ?? "موضوع",
  description: overrides.description ?? "",
  status: overrides.status,
  submitted_by: overrides.submitted_by ?? "u1",
  submitted_at: overrides.submitted_at ?? "2026-08-01T00:00:00.000Z",
  created_at: overrides.created_at ?? "2026-08-01T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-08-01T00:00:00.000Z",
  admin_notes: overrides.admin_notes ?? null,
  agenda_order: overrides.agenda_order ?? null,
});

describe("councils-operational helpers — truthful derivation", () => {
  it("filters roles without inventing permissions", () => {
    const rows = [
      membership({ council_id: "c1", role: "chair" }),
      membership({ council_id: "c2", role: "secretary" }),
      membership({ council_id: "c3", role: "member" }),
      membership({ council_id: "c4", role: "viewer" }),
      membership({ council_id: "c5", role: "vice_chair" }),
    ];
    expect(filterChairMemberships(rows).map((r) => r.council_id)).toEqual(["c1"]);
    expect(filterAgendaWriteMemberships(rows).map((r) => r.council_id)).toEqual(["c1", "c2"]);
    expect(filterSubmitEligible(rows).map((r) => r.role)).toEqual([
      "chair",
      "secretary",
      "member",
      "vice_chair",
    ]);
    expect(SUBMIT_ELIGIBLE_ROLES.has("viewer")).toBe(false);
    expect(isViewerOnly([membership({ council_id: "c4", role: "viewer" })])).toBe(true);
    expect(isViewerOnly(rows)).toBe(false);
  });

  it("builds summary from loaded counts only", () => {
    const summary = buildOperationalSummary({
      currentMemberships: [
        membership({ council_id: "c1", role: "member" }),
        membership({ council_id: "c2", role: "chair" }),
      ],
      chairMemberships: [membership({ council_id: "c2", role: "chair" })],
      agendaWriteMemberships: [membership({ council_id: "c2", role: "chair" })],
      upcomingMeetings: [
        meeting({
          meeting_id: "m1",
          council_id: "c2",
          council_name: "مجلس القسم",
          scheduled_at: "2026-09-10T09:00:00.000Z",
        }),
      ],
      mySubmittedTopics: [topic({ topic_id: "t1", status: "submitted" })],
      formatDateTime: (iso) => `FMT(${iso})`,
    });
    expect(summary.currentCouncilsCount).toBe(2);
    expect(summary.mySubmittedTopicsCount).toBe(1);
    expect(summary.nextMeetingLabel).toContain("مجلس القسم");
    expect(summary.nextMeetingLabel).toContain("FMT(");
    expect(summary.actionRequiredLabel).toMatch(/رئيس|إجراء|استكمال|لا توجد/);
  });

  it("action-required label stays truthful when empty", () => {
    expect(
      deriveActionRequiredLabel({
        chairMemberships: [],
        agendaWriteMemberships: [],
        upcomingMeetings: [],
        mySubmittedTopics: [],
      }),
    ).toBe("لا توجد إجراءات حالية");
  });

  it("derives schedule / agenda / topic completion actions deterministically", () => {
    const chair = [membership({ council_id: "c1", role: "chair" })];
    const scheduleActions = deriveActionRequiredItems({
      chairMemberships: chair,
      agendaWriteMemberships: chair,
      upcomingMeetings: [],
      mySubmittedTopics: [],
    });
    expect(scheduleActions.some((a) => a.kind === "schedule_needed")).toBe(true);

    const agendaActions = deriveActionRequiredItems({
      chairMemberships: chair,
      agendaWriteMemberships: chair,
      upcomingMeetings: [
        meeting({ meeting_id: "m1", council_id: "c1", status: "intake_open" }),
      ],
      mySubmittedTopics: [],
    });
    expect(agendaActions.some((a) => a.kind === "agenda_incomplete")).toBe(true);
    expect(meetingNeedsAgendaCompletion("agenda_ready")).toBe(false);

    const topicActions = deriveActionRequiredItems({
      chairMemberships: [],
      agendaWriteMemberships: [],
      upcomingMeetings: [],
      mySubmittedTopics: [
        topic({ topic_id: "t1", status: "needs_completion", title: "استكمال مطلوب" }),
      ],
    });
    expect(topicActions).toHaveLength(1);
    expect(topicActions[0]!.kind).toBe("topic_needs_completion");
  });
});

describe("councils page IA — operational dashboard", () => {
  it("renders page header with required copy", () => {
    expect(ROUTE_SRC).toMatch(/data-testid="councils-page-header"/);
    expect(ROUTE_SRC).toMatch(/مجالسي الأكاديمية/);
    expect(ROUTE_SRC).toMatch(
      /إدارة عضويتك واجتماعاتك وموضوعات المجالس الأكاديمية من مكان واحد/,
    );
  });

  it("scopes the page to the selected council before workspace tabs", () => {
    const header = ROUTE_SRC.indexOf('data-testid="councils-page-header"');
    const selector = ROUTE_SRC.indexOf("<CouncilContextSelector");
    const current = ROUTE_SRC.indexOf('data-testid="councils-current-memberships"');
    const summary = ROUTE_SRC.indexOf("<CouncilsOperationalSummaryStrip");
    const tabs = ROUTE_SRC.indexOf('data-testid="councils-workspace-tabs"');
    const actions = ROUTE_SRC.indexOf("<CouncilsActionRequired");
    const next = ROUTE_SRC.indexOf("<NextMeetingPriorityCard");
    expect(header).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(header);
    expect(selector).toBeGreaterThan(current);
    expect(summary).toBeGreaterThan(selector);
    expect(tabs).toBeGreaterThan(summary);
    expect(actions).toBeGreaterThan(tabs);
    expect(next).toBeGreaterThan(actions);
  });

  it("exposes meetings / topics / archive tabs with meetings default", () => {
    expect(ROUTE_SRC).toMatch(/data-testid="councils-tab-meetings"/);
    expect(ROUTE_SRC).toMatch(/data-testid="councils-tab-topics"/);
    expect(ROUTE_SRC).toMatch(/data-testid="councils-tab-decisions"/);
    expect(ROUTE_SRC).toMatch(/useState\("overview"\)/);
    expect(ROUTE_SRC).toMatch(/الاجتماعات/);
    expect(ROUTE_SRC).toMatch(/الموضوعات/);
    expect(ROUTE_SRC).toMatch(/الأرشيف/);
  });

  it("consolidates meetings and topics into workspaces", () => {
    expect(ROUTE_SRC).toMatch(/CouncilLifecycleMeetings/);
    expect(ROUTE_SRC).toMatch(/CouncilTopicsWorkspace/);
    expect(ROUTE_SRC).not.toMatch(/title="الاجتماعات القادمة"/);
    expect(ROUTE_SRC).not.toMatch(/title="الاجتماعات السابقة"/);
    expect(ROUTE_SRC).not.toMatch(/title="مواضيعي المقدمة"/);
    expect(ROUTE_SRC).not.toMatch(/title="موضوعات المجلس"/);
    expect(COUNCILS_UI_SRC).toMatch(/القادمة/);
    expect(COUNCILS_UI_SRC).toMatch(/السابقة/);
    expect(COUNCILS_UI_SRC).toMatch(/موضوعاتي/);
  });

  it("moves archive under tab with compact empty state", () => {
    expect(ROUTE_SRC).toMatch(/data-testid="councils-archive-panel"/);
    expect(ROUTE_SRC).toMatch(/لا توجد عناصر مؤرشفة/);
    expect(ROUTE_SRC).not.toMatch(/title="مجالسي السابقة \/ الأرشيف"/);
  });

  it("uses progressive disclosure for schedule / agenda / submit forms", () => {
    expect(ROUTE_SRC).toMatch(/data-testid="councils-schedule-meeting-button"/);
    expect(ROUTE_SRC).toMatch(/data-testid="councils-submit-topic-button"/);
    expect(ROUTE_SRC).toMatch(/ScheduleMeetingDialog/);
    expect(ROUTE_SRC).toMatch(/CouncilAgendaDialog/);
    expect(ROUTE_SRC).toMatch(/SubmitCouncilTopicDialog/);
    expect(ROUTE_SRC).not.toMatch(/title="جدولة اجتماع \(رئيس المجلس\)"/);
    expect(ROUTE_SRC).not.toMatch(/title="جدول الأعمال \(رئيس المجلس\)"/);
    expect(ROUTE_SRC).not.toMatch(/title="تقديم موضوع جديد للمجلس"/);
    expect(COUNCILS_UI_SRC).toMatch(/data-testid="schedule-meeting-dialog"/);
    expect(COUNCILS_UI_SRC).toMatch(/data-testid="council-agenda-dialog"/);
    expect(COUNCILS_UI_SRC).toMatch(/data-testid="submit-topic-dialog"/);
  });

  it("gates schedule button and finalize to chair authorization surface", () => {
    expect(ROUTE_SRC).toMatch(/chairMemberships\.length > 0/);
    expect(ROUTE_SRC).toMatch(/filterChairMemberships/);
    expect(COUNCILS_UI_SRC).toMatch(/canFinalize/);
    expect(COUNCILS_UI_SRC).toMatch(/role === "chair"/);
  });

  it("keeps schedule dialog fields", () => {
    const scheduleFile = COUNCILS_UI_FILES.find((f) => f.endsWith("ScheduleMeetingDialog.tsx"))!;
    const src = readFileSync(scheduleFile, "utf-8");
    expect(src).toMatch(/عنوان الاجتماع/);
    expect(src).toMatch(/تاريخ ووقت الاجتماع/);
    expect(src).toMatch(/المكان/);
    expect(src).toMatch(/فتح استقبال الموضوعات/);
    expect(src).toMatch(/إغلاق استقبال الموضوعات/);
    expect(src).toMatch(/ملاحظات/);
    expect(src).toMatch(/scheduleCouncilMeeting/);
  });

  it("keeps agenda management capabilities for authorized writers", () => {
    const agendaFile = COUNCILS_UI_FILES.find((f) => f.endsWith("CouncilAgendaDialog.tsx"))!;
    const src = readFileSync(agendaFile, "utf-8");
    expect(src).toMatch(/getAvailableTopicsForAgenda/);
    expect(src).toMatch(/addTopicToAgenda/);
    expect(src).toMatch(/addManualAgendaItem/);
    expect(src).toMatch(/updateAgendaItem/);
    expect(src).toMatch(/reorderAgendaItems/);
    expect(src).toMatch(/finalizeMeetingAgenda/);
    expect(src).toMatch(/canWrite/);
  });

  it("preserves submit topic role gate and attachment validation", () => {
    const submitFile = COUNCILS_UI_FILES.find((f) => f.endsWith("SubmitCouncilTopicDialog.tsx"))!;
    const src = readFileSync(submitFile, "utf-8");
    expect(src).toMatch(/submitCouncilTopic/);
    expect(src).toMatch(/getOpenIntakeMeetingsForMember/);
    expect(src).toMatch(/meeting_id:\s*meetingId/);
    expect(src).toMatch(/prepareCouncilTopicAttachmentUpload/);
    expect(src).toMatch(/validateUpload\(file, "council_topic_attachment"\)/);
    expect(src).toMatch(/MAX_TOPIC_ATTACHMENTS/);
    expect(src).toMatch(/لا يمكن رفع أكثر من 5 مرفقات/);
    expect(src).toMatch(/submitTopic\(\{\s*data:\s*\{\s*meeting_id:/);
    expect(src).not.toMatch(/submitTopic\(\{\s*data:\s*\{\s*council_id:/);
    expect(ROUTE_SRC).toMatch(/submitEligibleMemberships\.length > 0/);
    expect(ROUTE_SRC).toMatch(/viewerOnly/);
    expect(ROUTE_SRC).toMatch(/data-testid="councils-viewer-banner"/);
  });

  it("preserves secure server function contracts and avoids direct table writes", () => {
    expect(ROUTE_SRC).toMatch(/getMyAcademicCouncilMembershipsV2/);
    expect(ROUTE_SRC).toMatch(/getMyCouncilMeetingsV2/);
    expect(ROUTE_SRC).toMatch(/getMyCouncilTopics/);
    expect(ALL_SRC).toMatch(/scheduleCouncilMeeting/);
    expect(ALL_SRC).toMatch(/updateCouncilMeeting/);
    expect(ALL_SRC).toMatch(/getAgendaItemsForMeeting/);
    expect(ALL_SRC).toMatch(/getAvailableTopicsForAgenda/);
    expect(ALL_SRC).toMatch(/addTopicToAgenda/);
    expect(ALL_SRC).toMatch(/addManualAgendaItem/);
    expect(ALL_SRC).toMatch(/updateAgendaItem/);
    expect(ALL_SRC).toMatch(/reorderAgendaItems/);
    expect(ALL_SRC).toMatch(/finalizeMeetingAgenda/);
    expect(ALL_SRC).toMatch(/submitCouncilTopic/);
    expect(ALL_SRC).toMatch(/getOpenIntakeMeetingsForMember/);
    expect(ALL_SRC).toMatch(/getCouncilTopicReviewQueue/);
    expect(ALL_SRC).toMatch(/reviewCouncilTopic/);
    expect(ALL_SRC).toMatch(/editCouncilTopic/);
    expect(ALL_SRC).toMatch(/resubmitCouncilTopic/);
    expect(ALL_SRC).toMatch(/prepareCouncilTopicAttachmentUpload/);
    expect(ALL_SRC).toMatch(/getCouncilTopicAttachments/);
    expect(ALL_SRC).toMatch(/getCouncilTopicAttachmentSignedUrl/);
    // no direct table mutation API on councils UI surface
    expect(ALL_SRC).not.toMatch(/\.from\(["']academic_council/);
    expect(ALL_SRC).not.toMatch(/\.insert\(/);
    expect(ALL_SRC).not.toMatch(/\.update\(/);
    expect(ALL_SRC).not.toMatch(/\.upsert\(/);
    expect(ALL_SRC).not.toMatch(/\.delete\(/);
  });

  it("keeps route path and RTL/responsive guards", () => {
    expect(ROUTE_SRC).toMatch(/createFileRoute\("\/faculty-portal\/academic-councils"\)/);
    expect(ROUTE_SRC).toMatch(/dir="rtl"/);
    expect(ROUTE_SRC).toMatch(/sm:grid-cols-2|sm:flex-none|max-w-4xl/);
    expect(COUNCILS_UI_SRC).toMatch(/dir="rtl"/);
    expect(COUNCILS_UI_SRC).toMatch(/CompactEmpty/);
    expect(COUNCILS_UI_SRC).toMatch(/min-h-8|min-h-9|min-h-10|h-8|h-9/);
  });

  it("uses compact empty states instead of tall empty panels", () => {
    expect(ALL_SRC).toMatch(/لا توجد اجتماعات قادمة/);
    expect(ALL_SRC).toMatch(/لم تقدم أي موضوعات بعد/);
    expect(ALL_SRC).toMatch(/لا توجد عناصر مؤرشفة/);
    expect(ALL_SRC).not.toMatch(/function EmptyBlock/);
    expect(ALL_SRC).toMatch(/function CompactEmpty|CompactEmpty/);
  });
});
