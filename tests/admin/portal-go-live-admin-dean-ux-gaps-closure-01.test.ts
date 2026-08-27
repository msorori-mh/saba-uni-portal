import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_NAV_GROUPS,
  applyAdminFinanceNavGate,
} from "../../src/lib/admin-navigation-config";
import { filterNavGroups } from "../../src/lib/admin-nav";
import {
  isActiveMembership,
  membershipRoleAt,
  type MyCouncilMembershipV2,
  type CouncilMeetingV2Item,
} from "../../src/lib/faculty-councils.functions";
import {
  deriveActionRequiredItems,
  deriveActionRequiredLabel,
} from "../../src/lib/faculty-portal/councils-operational";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const MESSAGES_SRC = read("src/routes/messages.tsx");
const DEPT_REPORTS_SRC = read("src/routes/admin/department-reports.tsx");
const GP_ADMIN_SRC = read("src/routes/admin/graduation-projects.tsx");
const GP_ADAPTER_SRC = read("src/routes/-graduation-projects-adapter.ts");
const COUNCILS_FACULTY_SRC = read("src/routes/faculty-portal.academic-councils.tsx");
const COUNCILS_C9_FUNC_SRC = read("src/lib/councils-c9.functions.ts");
const C9_CHAIR_SRC = read("src/components/councils/CouncilChairDashboard.tsx");
const C9_SECRETARY_SRC = read("src/components/councils/CouncilSecretaryDashboard.tsx");
const C9_MEMBER_SRC = read("src/components/councils/CouncilMemberWorkspace.tsx");
const C9_RESPONSIBLE_SRC = read("src/components/councils/CouncilResponsibleActorView.tsx");

describe("PORTAL-GO-LIVE-ADMIN-DEAN-UX-GAPS-CLOSURE-01", () => {
  describe("1. ADMIN NAV", () => {
    it("renames group to الوثائق الرسمية when adminFinance is false", () => {
      const gated = applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, false);
      const finGroup = gated.find((g) => g.id === "finance_documents");
      expect(finGroup).toBeDefined();
      expect(finGroup?.label).toBe("الوثائق الرسمية");
      expect(finGroup?.items.some((it) => it.to === "/admin/finance")).toBe(false);
      expect(finGroup?.items.some((it) => it.to === "/admin/documents")).toBe(true);
    });

    it("preserves المالية والوثائق label when adminFinance is true", () => {
      const gated = applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, true);
      const finGroup = gated.find((g) => g.id === "finance_documents");
      expect(finGroup).toBeDefined();
      expect(finGroup?.label).toBe("المالية والوثائق");
      expect(finGroup?.items.some((it) => it.to === "/admin/finance")).toBe(true);
    });

    it("preserves role filtering on gated nav groups", () => {
      const gated = applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, false);
      const filtered = filterNavGroups(gated, ["registrar"]);
      const finGroup = filtered.find((g) => g.id === "finance_documents");
      expect(finGroup).toBeDefined();
      expect(finGroup?.label).toBe("الوثائق الرسمية");
      expect(finGroup?.items.map((it) => it.to)).toEqual(["/admin/documents"]);
    });
  });

  describe("2. MESSAGES", () => {
    it("uses a fixed portal-aware back action instead of browser history", () => {
      expect(MESSAGES_SRC).not.toContain('<Link to="/" className="text-xs text-muted-foreground inline-flex items-center gap-1"><ArrowRight className="h-3.5 w-3.5" /> الرئيسية</Link>');
      expect(MESSAGES_SRC).toContain("handleBack");
      expect(MESSAGES_SRC).toContain("MESSAGES_PORTAL_HOME");
      expect(MESSAGES_SRC).toContain("firstAccessibleAdminRoute(roles)");
      expect(MESSAGES_SRC).toContain("navigate({ to: portalHome })");
      expect(MESSAGES_SRC).not.toContain("history.back");
      expect(MESSAGES_SRC).toContain("رجوع");
    });
  });

  describe("3. DEPARTMENT REPORTS", () => {
    it("supports explicit department selection for admin only; dean fail-closed to College/Reports Center", () => {
      expect(DEPT_REPORTS_SRC).toContain("selectedDepartmentId");
      expect(DEPT_REPORTS_SRC).toContain("department_id:");
      expect(DEPT_REPORTS_SRC).toContain("/admin/reports");
      expect(DEPT_REPORTS_SRC).toContain("رئيس القسم يرى قسمه فقط");
      // Remediation: dean is NOT a selectable-department actor.
      expect(DEPT_REPORTS_SRC).toContain("isPrivilegedAdmin");
      expect(DEPT_REPORTS_SRC).toContain("isDeanWithoutAdmin");
      expect(DEPT_REPORTS_SRC).not.toContain("isPrivilegedOrDean");
      expect(DEPT_REPORTS_SRC).toContain("enabled: isPrivilegedAdmin");
      expect(DEPT_REPORTS_SRC).toContain("/admin/executive-reports");
      expect(DEPT_REPORTS_SRC).toContain("ربط كلية→أقسام موثوق");
    });
  });

  describe("4. GRADUATION PROJECT ADMIN", () => {
    it("uses administration report hook, renders KPIs and state filters, and maps errors cleanly", () => {
      expect(GP_ADMIN_SRC).toContain("useGraduationProjectAdministrationReport");
      expect(GP_ADMIN_SRC).toContain("STATE_OPTIONS");
      expect(GP_ADMIN_SRC).toContain('data-testid="admin-gp-kpis"');
      expect(GP_ADMIN_SRC).toContain("readOnly");
      expect(GP_ADAPTER_SRC).toContain("عفواً، لا تملك الصلاحية الكافية لاستعراض النشرة الإدارية لمشاريع التخرج.");
    });
  });

  describe("5. FACULTY/DEAN ACADEMIC COUNCILS", () => {
    it("removes internal engineering copy and replaces with role-oriented copy", () => {
      expect(COUNCILS_FACULTY_SRC).not.toContain("الصلاحيات النهائية يحددها الخادم وليس واجهة الأزرار فقط.");
      expect(COUNCILS_C9_FUNC_SRC).not.toContain("الصلاحيات النهائية يحددها الخادم.");
      expect(COUNCILS_FACULTY_SRC).toContain("إدارة الجلسة والتصويت والمحضر والقرارات والأرشفة متاح وفق دورك المعتمد في المجلس.");
      expect(COUNCILS_FACULTY_SRC).toContain("تستند الصلاحيات والخيارات المتاحة إلى دورك المعتمد في كل مجلس.");
      expect(COUNCILS_C9_FUNC_SRC).toContain("عفواً، لا تملك الصلاحية الكافية للوصول إلى هذا المحتوى وفق دورك المعتمد في المجلس.");
    });

    it("makes C9 dashboard and responsible actor views fail-soft on error", () => {
      expect(C9_CHAIR_SRC).toContain("لوحة متابعة رئيس المجلس غير متاحة حالياً");
      expect(C9_SECRETARY_SRC).toContain("لوحة متابعة أمين السر غير متاحة حالياً");
      expect(C9_MEMBER_SRC).toContain("مساحة عمل عضو المجلس غير متاحة حالياً");
      expect(C9_RESPONSIBLE_SRC).toContain("قائمة القرارات المكلفة غير متاحة حالياً");
    });
  });

  describe("6. MULTI_COUNCIL_MEMBERSHIP_ROLE_RESOLUTION", () => {
    it("future_active_to_current=PASS, expired_membership_previous=PASS, inactive_membership_not_current=PASS", () => {
      const today = "2026-08-10";
      // future active_to membership remains current
      expect(isActiveMembership({ is_active: true, active_to: "2026-12-31" }, today)).toBe(true);
      // expired membership is previous
      expect(isActiveMembership({ is_active: true, active_to: "2025-12-31" }, today)).toBe(false);
      // inactive membership is not current
      expect(isActiveMembership({ is_active: false, active_to: null }, today)).toBe(false);
    });

    it("multi_council_current_count=2, department_chair=PASS, college_member=PASS, meeting_role_resolution=PASS", () => {
      const chairDeptMembership: MyCouncilMembershipV2 = {
        membership_id: "m-dept",
        council_id: "dept-council-id",
        council_name: "مجلس قسم نظم المعلومات الحاسوبية",
        council_type: "department",
        department_name: "نظم المعلومات الحاسوبية",
        role: "chair",
        is_active: true,
        active_from: "2025-09-01",
        active_to: "2026-12-31",
        created_at: "2025-09-01",
      };

      const memberCollegeMembership: MyCouncilMembershipV2 = {
        membership_id: "m-college",
        council_id: "college-council-id",
        council_name: "مجلس الكلية",
        council_type: "college",
        department_name: null,
        role: "member",
        is_active: true,
        active_from: "2025-09-01",
        active_to: null,
        created_at: "2025-09-01",
      };

      const inactiveHistoricalMembership = {
        council_id: "dept-council-id",
        member_role: "member",
        active_from: "2024-09-01",
        active_to: "2025-08-31",
        is_active: false,
      };

      const today = "2026-08-10";
      const allMemberships = [chairDeptMembership, memberCollegeMembership];
      const currentMemberships = allMemberships.filter((m) =>
        isActiveMembership({ is_active: m.is_active, active_to: m.active_to }, today),
      );

      // Verify current memberships count = 2
      expect(currentMemberships.length).toBe(2);

      // Verify department council role is chair and college council role is member
      const dept = currentMemberships.find((m) => m.council_id === "dept-council-id");
      const college = currentMemberships.find((m) => m.council_id === "college-council-id");
      expect(dept?.role).toBe("chair");
      expect(college?.role).toBe("member");

      // Verify meeting role resolution
      const membershipRows = [
        {
          council_id: chairDeptMembership.council_id,
          member_role: chairDeptMembership.role,
          active_from: chairDeptMembership.active_from,
          active_to: chairDeptMembership.active_to,
          is_active: chairDeptMembership.is_active,
        },
        {
          council_id: memberCollegeMembership.council_id,
          member_role: memberCollegeMembership.role,
          active_from: memberCollegeMembership.active_from,
          active_to: memberCollegeMembership.active_to,
          is_active: memberCollegeMembership.is_active,
        },
        inactiveHistoricalMembership,
      ];

      const meetingDate = "2026-08-15T10:00:00Z";
      expect(membershipRoleAt(membershipRows, "dept-council-id", meetingDate)).toBe("chair");
      expect(membershipRoleAt(membershipRows, "college-council-id", meetingDate)).toBe("member");
    });

    it("role_scoped_actions=PASS: scopes action-required items per council + actual role", () => {
      const chairMembership: MyCouncilMembershipV2 = {
        membership_id: "m1",
        council_id: "dept-council-id",
        council_name: "مجلس قسم نظم المعلومات الحاسوبية",
        council_type: "department",
        department_name: "نظم المعلومات",
        role: "chair",
        is_active: true,
        active_from: "2025-09-01",
        active_to: null,
        created_at: "2025-09-01",
      };

      const memberMembership: MyCouncilMembershipV2 = {
        membership_id: "m2",
        council_id: "college-council-id",
        council_name: "مجلس الكلية",
        council_type: "college",
        department_name: null,
        role: "member",
        is_active: true,
        active_from: "2025-09-01",
        active_to: null,
        created_at: "2025-09-01",
      };

      const upcomingMeetings: CouncilMeetingV2Item[] = [
        {
          meeting_id: "mtg-college",
          council_id: "college-council-id",
          council_name: "مجلس الكلية",
          meeting_number: 5,
          meeting_title: "الاجتماع الخامس",
          scheduled_at: "2026-08-20T10:00:00Z",
          status: "scheduled",
          location: "القاعة 1",
          intake_opens_at: null,
          intake_closes_at: null,
          notes: null,
          agenda_summary: null,
          minutes_summary: null,
          user_membership_role: "member",
          created_at: "2026-08-01",
          updated_at: "2026-08-01",
        },
      ];

      const actions = deriveActionRequiredItems({
        chairMemberships: [chairMembership],
        agendaWriteMemberships: [chairMembership],
        upcomingMeetings,
        mySubmittedTopics: [],
      });

      expect(actions.length).toBe(1);
      expect(actions[0]?.kind).toBe("schedule_needed");
      expect(actions[0]?.councilId).toBe("dept-council-id");
      expect(actions[0]?.role).toBe("chair");

      const label = deriveActionRequiredLabel({
        chairMemberships: [chairMembership],
        agendaWriteMemberships: [chairMembership],
        upcomingMeetings,
        mySubmittedTopics: [],
      });
      expect(label).toBe("لديك مهام كرئيس مجلس");
    });
  });
});
