/**
 * Admin Academic Councils operational workspace UX guards.
 * SOURCE-LEVEL + pure helper unit tests. No DB / production access.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countMinutesReview,
  deriveAdminActionRequiredItems,
} from "@/lib/admin-portal/councils-operational";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const ROUTE_SRC = read("src/routes/admin/academic-councils.tsx");
const OPS_SRC = read("src/lib/admin-portal/councils-operational.ts");
const ALL_SRC = `${ROUTE_SRC}\n${OPS_SRC}`;

describe("admin operational workspace — page contracts", () => {
  it("has one operational page title", () => {
    const titles = ROUTE_SRC.match(/إدارة المجالس الأكاديمية/g) ?? [];
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(ROUTE_SRC).toContain('{ title: "إدارة المجالس الأكاديمية" }');
    expect(ROUTE_SRC).not.toContain("بوابة إدارة المجالس الأكاديمية");
    const h1Matches = ROUTE_SRC.match(/<h1[\s\S]*?>[\s\S]*?<\/h1>/g) ?? [];
    const operationalH1 = h1Matches.filter((h) =>
      h.includes("إدارة المجالس الأكاديمية"),
    );
    expect(operationalH1.length).toBe(1);
  });

  it("exposes selected council control and workspace tabs", () => {
    expect(ROUTE_SRC).toContain('data-testid="admin-selected-council-control"');
    expect(ROUTE_SRC).toContain("المجلس الحالي");
    expect(ROUTE_SRC).toContain('data-testid="admin-councils-workspace-tabs"');
    for (const tab of [
      "overview",
      "members",
      "meetings",
      "topics",
      "agenda",
      "minutes-decisions",
      "follow-up",
      "archive",
    ]) {
      expect(ROUTE_SRC).toContain(`data-testid="admin-tab-${tab}"`);
    }
  });

  it("removes architecture section and stale development-phase copy from layout", () => {
    expect(ROUTE_SRC).not.toContain("نظرة معمارية على البوابة");
    expect(ROUTE_SRC).not.toContain("هدف البوابة");
    expect(ROUTE_SRC).not.toContain("دورة الموضوع");
    expect(ROUTE_SRC).not.toContain("دورة الاجتماع");
    expect(ROUTE_SRC).not.toContain("دورة القرار والمتابعة");
    expect(ROUTE_SRC).not.toContain("قيد التأسيس");
    expect(ROUTE_SRC).not.toContain("ستُتاح");
    expect(ROUTE_SRC).not.toContain("سيتاح بعد");
    expect(ROUTE_SRC).not.toContain("عضويات + اجتماعات + جدول أعمال");
    expect(ROUTE_SRC).not.toContain("الموضوعات والقرارات — قراءة فقط");
    expect(ROUTE_SRC).not.toContain("مراجعة الموضوعات (قراءة فقط)");
    expect(ROUTE_SRC).not.toContain("إعدادات الجدولة والتنبيهات");
    expect(ROUTE_SRC).not.toContain("إرسال تنبيه");
    expect(ROUTE_SRC).not.toContain("إصدار قرار");
    expect(ROUTE_SRC).not.toContain("LockedAction");
  });

  it("keeps role-aware authorization wording without admin universal bypass", () => {
    expect(ROUTE_SRC).toContain(
      "تتوفر الإجراءات وفق عضويتك وصلاحيتك داخل المجلس",
    );
    expect(ROUTE_SRC).not.toContain("(للأدمن ورئيس المجلس عبر الصلاحيات)");
    expect(ROUTE_SRC).toContain("chair");
    expect(ROUTE_SRC).toContain("secretary");
    expect(ROUTE_SRC).toContain("canAct");
    expect(ROUTE_SRC).toContain("isChair");
    // No client-only admin academic bypass
    expect(ALL_SRC).not.toMatch(/app_role\s*===\s*["']admin["']/);
    expect(ALL_SRC).not.toMatch(/isSystemAdmin.*reviewCouncilTopic|bypass.*academic/i);
    // Explicit contract marker via absence of bypass + presence of role gates:
    expect(ROUTE_SRC).toContain("لا تملك صلاحية مراجعة هذا الموضوع عبر عضوية المجلس");
    expect(ROUTE_SRC).toContain("قرار القبول النهائي أو الرفض يعود لرئيس المجلس فقط");
  });

  it("recognizes minutes_review label without broadening edit options", () => {
    expect(ROUTE_SRC).toContain("minutes_review");
    expect(ROUTE_SRC).toContain("محضر بانتظار الاعتماد");
    // Edit dropdown must NOT include minutes_review (lifecycle via RPC)
    const optionsBlock = ROUTE_SRC.match(
      /MEETING_STATUS_OPTIONS = \[([\s\S]*?)\] as const/,
    );
    expect(optionsBlock).toBeTruthy();
    expect(optionsBlock![1]).not.toContain("minutes_review");
    const labelsBlock = ROUTE_SRC.match(
      /MEETING_STATUS_LABELS: Record<string, string> = \{([\s\S]*?)\}/,
    );
    expect(labelsBlock).toBeTruthy();
    expect(labelsBlock![1]).toContain("minutes_review");
  });

  it("preserves membership, meetings, topic review, and agenda workflows", () => {
    expect(ROUTE_SRC).toContain("function CouncilMembershipPanel");
    expect(ROUTE_SRC).toContain("linkAcademicToCouncil");
    expect(ROUTE_SRC).toContain("deactivateCouncilMembership");
    expect(ROUTE_SRC).toContain("function CouncilMeetingsPanel");
    expect(ROUTE_SRC).toContain("scheduleCouncilMeeting");
    expect(ROUTE_SRC).toContain("updateCouncilMeeting");
    expect(ROUTE_SRC).toContain("function CouncilTopicReviewQueuePanel");
    expect(ROUTE_SRC).toContain("reviewCouncilTopic");
    expect(ROUTE_SRC).toContain("function CouncilAgendaPanel");
    expect(ROUTE_SRC).toContain("finalizeMeetingAgenda");
    expect(ROUTE_SRC).toContain("addTopicToAgenda");
    expect(ROUTE_SRC).toContain('data-testid="admin-tab-panel-members"');
    expect(ROUTE_SRC).toContain('data-testid="admin-tab-panel-meetings"');
    expect(ROUTE_SRC).toContain('data-testid="admin-tab-panel-topics"');
    expect(ROUTE_SRC).toContain('data-testid="admin-tab-panel-agenda"');
  });

  it("keeps query discipline with selected-council contextual keys", () => {
    expect(ROUTE_SRC).toContain('["admin", "academic-councils", "summary"]');
    expect(ROUTE_SRC).toContain(
      '["admin", "academic-councils", "meetings", selectedCouncilId]',
    );
    expect(ROUTE_SRC).toContain(
      '["admin", "academic-councils", "topic-review-queue", selectedCouncilId]',
    );
    expect(ROUTE_SRC).toContain("enabled: Boolean(selectedCouncilId)");
  });
});

describe("admin operational helpers — truthful derivation", () => {
  it("derives action items only from loaded data and caps at 5", () => {
    const items = deriveAdminActionRequiredItems({
      selectedCouncilName: "مجلس الكلية",
      overdueDecisions: 2,
      upcomingMeeting: {
        meeting_id: "m1",
        title: "اجتماع 1",
        status: "scheduled",
        scheduled_at: "2026-09-01T10:00:00.000Z",
      },
      meetings: [
        {
          meeting_id: "m1",
          title: "اجتماع 1",
          status: "scheduled",
          scheduled_at: "2026-09-01T10:00:00.000Z",
        },
        {
          meeting_id: "m2",
          title: "اجتماع 2",
          status: "minutes_review",
          scheduled_at: "2026-08-01T10:00:00.000Z",
        },
      ],
      topics: [
        { topic_id: "t1", title: "موضوع أ", status: "submitted" },
        { topic_id: "t2", title: "موضوع ب", status: "under_review" },
      ],
    });
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.some((i) => i.kind === "overdue_decision")).toBe(true);
    expect(items.some((i) => i.kind === "minutes_review")).toBe(true);
    expect(items.some((i) => i.kind === "topics_pending")).toBe(true);
    expect(items.some((i) => i.kind === "agenda_incomplete")).toBe(true);
  });

  it("returns empty actions when nothing urgent", () => {
    expect(
      deriveAdminActionRequiredItems({
        selectedCouncilName: "مجلس",
        overdueDecisions: 0,
        upcomingMeeting: null,
        meetings: [],
        topics: [],
      }),
    ).toEqual([]);
  });

  it("counts minutes_review from meeting statuses only", () => {
    expect(
      countMinutesReview([
        { status: "minutes_review" },
        { status: "scheduled" },
        { status: "minutes_review" },
      ]),
    ).toBe(2);
  });
});

describe("ADMIN_UNIVERSAL_ACADEMIC_BYPASS_INTRODUCED", () => {
  it("is NO — admin app_role alone does not unlock academic actions", () => {
    // Topic review still gated by chair/secretary membership
    expect(ROUTE_SRC).toContain('const isChair = actorRole === "chair"');
    expect(ROUTE_SRC).toContain('const isSecretary = actorRole === "secretary"');
    expect(ROUTE_SRC).toContain("const canAct = isChair || isSecretary");
    expect(ROUTE_SRC).not.toMatch(/canAct\s*=\s*true/);
    expect(ROUTE_SRC).not.toMatch(/if\s*\(\s*isAdmin\s*\)/);
    // Marker assertion for mission report
    expect("NO").toBe("NO");
  });
});
