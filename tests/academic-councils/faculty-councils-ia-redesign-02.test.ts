/**
 * FACULTY_COUNCILS_WORKSPACE_INFORMATION_ARCHITECTURE_REDESIGN_02
 * SOURCE-LEVEL guards + pure helper unit tests. No DB / production access.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyMeetingLifecycle,
  groupMeetingsByLifecycle,
  pickDefaultCouncilId,
  scopeMeetingsToCouncil,
  scopeTopicsToCouncil,
  deriveCouncilPriority,
} from "@/lib/faculty-portal/councils-context";
import type {
  CouncilMeetingV2Item,
  MyCouncilMembershipV2,
  MyCouncilTopicItem,
} from "@/lib/faculty-councils.functions";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const ROUTE_SRC = read("src/routes/faculty-portal.academic-councils.tsx");
const MEETINGS_SRC = read("src/components/portal/councils/CouncilLifecycleMeetings.tsx");
const PANEL_SRC = read("src/components/portal/councils/CouncilMeetingWorkspacePanel.tsx");
const DECISIONS_SRC = read("src/components/portal/councils/CouncilDecisionsPanel.tsx");
const GOVERNANCE_SRC = read(
  "src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx",
);

const meeting = (
  id: string,
  councilId: string,
  status: string,
  scheduledAt = "2026-09-01T10:00:00.000Z",
): CouncilMeetingV2Item =>
  ({
    meeting_id: id,
    council_id: councilId,
    council_name: "مجلس",
    meeting_number: 1,
    meeting_title: "اجتماع",
    scheduled_at: scheduledAt,
    status,
    location: null,
    intake_opens_at: null,
    intake_closes_at: null,
    notes: null,
    agenda_summary: null,
    minutes_summary: null,
    user_membership_role: "member",
    created_at: scheduledAt,
    updated_at: scheduledAt,
  }) as CouncilMeetingV2Item;

const membership = (councilId: string, role = "member"): MyCouncilMembershipV2 =>
  ({
    membership_id: `m-${councilId}`,
    council_id: councilId,
    council_name: `مجلس ${councilId}`,
    council_type: "college",
    department_name: null,
    role,
    is_active: true,
    active_from: "2026-01-01T00:00:00.000Z",
    active_to: null,
    created_at: "2026-01-01T00:00:00.000Z",
  }) as MyCouncilMembershipV2;

describe("councils-context helpers", () => {
  it("classifies meetings into the four operational buckets", () => {
    expect(classifyMeetingLifecycle("in_session")).toBe("in_session");
    expect(classifyMeetingLifecycle("agenda_ready")).toBe("preparation");
    expect(classifyMeetingLifecycle("scheduled")).toBe("preparation");
    expect(classifyMeetingLifecycle("minutes_locked")).toBe("completed");
    expect(classifyMeetingLifecycle("archived")).toBe("archived");
  });

  it("groups meetings without dropping any row", () => {
    const rows = [
      meeting("a", "c1", "in_session"),
      meeting("b", "c1", "scheduled"),
      meeting("c", "c1", "minutes_review"),
      meeting("d", "c1", "archived"),
    ];
    const grouped = groupMeetingsByLifecycle(rows);
    expect(grouped.in_session).toHaveLength(1);
    expect(grouped.preparation).toHaveLength(1);
    expect(grouped.completed).toHaveLength(1);
    expect(grouped.archived).toHaveLength(1);
  });

  it("scopes meetings and topics to the selected council only", () => {
    const rows = [meeting("a", "c1", "scheduled"), meeting("b", "c2", "scheduled")];
    expect(scopeMeetingsToCouncil(rows, "c2").map((m) => m.meeting_id)).toEqual(["b"]);
    expect(scopeMeetingsToCouncil(rows, null)).toEqual([]);
    const topics = [
      { topic_id: "t1", council_id: "c1" } as MyCouncilTopicItem,
      { topic_id: "t2", council_id: "c2" } as MyCouncilTopicItem,
    ];
    expect(scopeTopicsToCouncil(topics, "c1").map((t) => t.topic_id)).toEqual(["t1"]);
  });

  it("defaults to the council with a live session, then the nearest meeting", () => {
    const memberships = [membership("c1"), membership("c2")];
    expect(
      pickDefaultCouncilId(memberships, [
        meeting("a", "c2", "in_session"),
        meeting("b", "c1", "scheduled", "2026-08-01T10:00:00.000Z"),
      ]),
    ).toBe("c2");
    expect(
      pickDefaultCouncilId(memberships, [
        meeting("b", "c2", "scheduled", "2026-08-01T10:00:00.000Z"),
        meeting("c", "c1", "scheduled", "2026-09-01T10:00:00.000Z"),
      ]),
    ).toBe("c2");
    expect(pickDefaultCouncilId(memberships, [])).toBe("c1");
    expect(pickDefaultCouncilId([], [])).toBeNull();
  });

  it("derives operational priority live > action > next", () => {
    expect(
      deriveCouncilPriority({
        councilMeetings: [meeting("a", "c1", "in_session")],
        hasActionItems: true,
      }),
    ).toBe("live_session");
    expect(
      deriveCouncilPriority({ councilMeetings: [], hasActionItems: true }),
    ).toBe("action_required");
    expect(
      deriveCouncilPriority({
        councilMeetings: [meeting("a", "c1", "scheduled")],
        hasActionItems: false,
      }),
    ).toBe("next_meeting");
    expect(deriveCouncilPriority({ councilMeetings: [], hasActionItems: false })).toBe("idle");
  });
});

describe("councils IA redesign 02 — source guards", () => {
  it("makes the council the primary context of the page", () => {
    expect(ROUTE_SRC).toContain("CouncilContextSelector");
    expect(ROUTE_SRC).toContain("pickDefaultCouncilId");
    expect(ROUTE_SRC).toContain("scopeMeetingsToCouncil");
    expect(ROUTE_SRC).toContain("scopeTopicsToCouncil");
  });

  it("exposes council-scoped tabs including decisions and reports", () => {
    for (const id of [
      "councils-tab-overview",
      "councils-tab-meetings",
      "councils-tab-topics",
      "councils-tab-decisions",
      "councils-tab-reports",
      "councils-tab-archive",
    ]) {
      expect(ROUTE_SRC).toContain(`data-testid="${id}"`);
    }
    expect(ROUTE_SRC).toMatch(/useState\("overview"\)/);
  });

  it("splits meetings into four lifecycle buckets instead of upcoming/previous", () => {
    for (const bucket of ["in_session", "preparation", "completed", "archived"]) {
      expect(MEETINGS_SRC).toContain(`councils-meetings-bucket-${bucket}`);
    }
  });

  it("opens exactly one meeting workspace at a time", () => {
    expect(ROUTE_SRC).toContain("CouncilMeetingWorkspacePanel");
    expect(ROUTE_SRC).toMatch(/activeMeeting \?/);
    expect(PANEL_SRC).toContain('data-testid="councils-meeting-workspace"');
    expect(PANEL_SRC).toContain("الجلسة الحية والحوكمة");
  });

  it("shows council-level decisions with their source meeting", () => {
    expect(DECISIONS_SRC).toContain("getCouncilDecisionFollowupDashboardFn");
    expect(DECISIONS_SRC).toContain('data-testid="councils-decision-source-meeting"');
  });

  it("replaces the disabled minutes textarea with a real read-only view", () => {
    expect(GOVERNANCE_SRC).toContain('data-testid="council-minutes-readonly"');
    expect(GOVERNANCE_SRC).not.toMatch(/disabled=\{!canWriteAgenda\}/);
  });
});
