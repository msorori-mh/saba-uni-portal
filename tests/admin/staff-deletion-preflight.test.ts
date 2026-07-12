import { describe, expect, it } from "bun:test";
import {
  evaluateStaffDeletionPreflight,
  validateStaffDeleteConfirmation,
  type StaffDeletionDependencyCounts,
  type StaffDeletionIdentity,
} from "../../src/lib/admin-staff-deletion.core";

const cleanDeps: StaffDeletionDependencyCounts = {
  processingAssignments: 0,
  workflowStepsAssigned: 0,
  staffProfileDepartments: 0,
  positionAssignments: 0,
  notifications: 0,
  auditLogs: 0,
  otherStaffWithSameUserId: 0,
  facultyProfilesWithUserId: 0,
  studentProfilesWithUserId: 0,
  queryFailures: [],
};

const baseIdentity: StaffDeletionIdentity = {
  staffProfileId: "staff-1",
  fullNameAr: "أحمد علي",
  employeeNumber: "EMP-001",
  email: "staff@example.edu",
  userId: null,
  status: "active",
  roleType: "registrar_general",
  appRoles: [],
  actorUserId: "actor-1",
  hasFacultyProfile: false,
};

function preflight(
  identity: Partial<StaffDeletionIdentity> = {},
  deps: Partial<StaffDeletionDependencyCounts> = {},
) {
  return evaluateStaffDeletionPreflight(
    { ...baseIdentity, ...identity },
    { ...cleanDeps, ...deps },
  );
}

describe("admin staff deletion preflight 01O", () => {
  it("1 — preflight allows hard delete with zero blocking references", () => {
    const result = preflight();
    expect(result.canHardDelete).toBe(true);
    expect(result.canDeactivate).toBe(true);
    expect(result.dependency_count).toBe(0);
    expect(result.blockingReasons).toEqual([]);
  });

  it("2 — preflight blocks hard delete when processing assignments exist", () => {
    const result = preflight({}, { processingAssignments: 1 });
    expect(result.canHardDelete).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("تكليفات معالجة");
    expect(result.dependency_count).toBe(1);
  });

  it("3 — preflight blocks self-delete", () => {
    const result = preflight({ userId: "actor-1", actorUserId: "actor-1" });
    expect(result.isCurrentUser).toBe(true);
    expect(result.canHardDelete).toBe(false);
    expect(result.canDeactivate).toBe(false);
  });

  it("4 — preflight blocks admin staff", () => {
    const result = preflight({ appRoles: ["admin"] });
    expect(result.isAdmin).toBe(true);
    expect(result.canHardDelete).toBe(false);
    expect(result.canDeactivate).toBe(false);
  });

  it("5 — preflight blocks system_admin staff", () => {
    const result = preflight({ appRoles: ["system_admin"] });
    expect(result.isSystemAdmin).toBe(true);
    expect(result.canHardDelete).toBe(false);
    expect(result.canDeactivate).toBe(false);
  });

  it("6 — preflight blocks faculty profile links", () => {
    const result = preflight({ hasFacultyProfile: true });
    expect(result.hasFacultyProfile).toBe(true);
    expect(result.canHardDelete).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("هيئة التدريس");
  });

  it("7 — preflight blocks on dependency query failures", () => {
    const result = preflight({}, { queryFailures: ["audit_logs"], auditLogs: null });
    expect(result.canHardDelete).toBe(false);
    expect(result.queryFailures).toEqual(["audit_logs"]);
    expect(result.blockingReasons.join(" ")).toContain("فُشل الفحص");
  });

  it("8 — confirmation requires exact full name text", () => {
    const result = validateStaffDeleteConfirmation({
      preflight: preflight(),
      expectedFullName: "أحمد علي",
      expectedEmployeeNumber: "EMP-001",
      confirmationText: "أحمد",
      deleteAuthUser: false,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.messageAr).toContain("الاسم الكامل");
  });

  it("9 — confirmation requires expected employee number to match preflight", () => {
    const result = validateStaffDeleteConfirmation({
      preflight: preflight(),
      expectedFullName: "أحمد علي",
      expectedEmployeeNumber: "EMP-999",
      confirmationText: "أحمد علي",
      deleteAuthUser: false,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.messageAr).toContain("الرقم الوظيفي تغيّر");
  });

  it("10 — delete without user_id is valid without deleteAuthUser", () => {
    const result = validateStaffDeleteConfirmation({
      preflight: preflight({ userId: null }),
      expectedFullName: "أحمد علي",
      expectedEmployeeNumber: "EMP-001",
      confirmationText: "أحمد علي",
      deleteAuthUser: false,
    });
    expect(result).toEqual({ ok: true });
  });

  it("11 — delete with user_id requires deleteAuthUser true", () => {
    const result = validateStaffDeleteConfirmation({
      preflight: preflight({ userId: "user-1" }),
      expectedFullName: "أحمد علي",
      expectedEmployeeNumber: "EMP-001",
      confirmationText: "أحمد علي",
      deleteAuthUser: false,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.messageAr).toContain("حساب الدخول");
  });

  it("14 — deactivate does not require zero dependencies for non-admin non-self staff", () => {
    const result = preflight(
      { userId: "user-2", actorUserId: "actor-1", appRoles: [] },
      {
        processingAssignments: 2,
        workflowStepsAssigned: 1,
        auditLogs: 3,
      },
    );
    expect(result.canHardDelete).toBe(false);
    expect(result.canDeactivate).toBe(true);
  });

  it("R1 — staff_profile_departments blocks hard delete and keeps canDeactivate", () => {
    const result = preflight(
      { userId: "user-2", actorUserId: "actor-1", appRoles: [] },
      { staffProfileDepartments: 2 },
    );
    expect(result.canHardDelete).toBe(false);
    expect(result.dependency_count).toBe(2);
    expect(result.staffProfileDepartmentsCount).toBe(2);
    expect(result.blockingReasons.join(" ")).toContain(
      "الموظف مرتبط بأقسام أو نطاقات إدارية؛ عطّل الملف بدل الحذف النهائي.",
    );
    expect(result.canDeactivate).toBe(true);
  });
});
