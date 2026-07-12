import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachAuditWarning,
  evaluateStaffDeletionPreflight,
  interpretStaffDeleteOutcome,
  validateStaffDeleteConfirmation,
  type StaffDeletionPreflightResult,
} from "../../src/lib/admin-staff-deletion.core";

const ROOT = join(import.meta.dir, "../..");

function deletablePreflight(overrides: Partial<StaffDeletionPreflightResult> = {}) {
  return {
    ...evaluateStaffDeletionPreflight(
      {
        staffProfileId: "staff-1",
        fullNameAr: "أحمد علي",
        employeeNumber: "EMP-001",
        email: "staff@example.edu",
        userId: "user-1",
        status: "active",
        roleType: "registrar_general",
        appRoles: [],
        actorUserId: "actor-1",
        hasFacultyProfile: false,
      },
      {
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
      },
    ),
    ...overrides,
  };
}

async function runPureDeleteOrchestration(input: {
  preflight: StaffDeletionPreflightResult;
  expectedFullName: string;
  expectedEmployeeNumber: string;
  confirmationText: string;
  deleteAuthUser: boolean;
  deleteAuthUserFn: () => Promise<boolean>;
  deleteStaffProfileFn: () => Promise<boolean>;
}) {
  const confirmation = validateStaffDeleteConfirmation(input);
  if (!confirmation.ok) {
    return {
      authUserDeleted: false,
      staffProfileDeleted: false,
      ...interpretStaffDeleteOutcome({ authUserDeleted: false, staffProfileDeleted: false }),
      messageAr: confirmation.messageAr,
    };
  }

  let authUserDeleted = false;
  if (input.preflight.user_id) {
    authUserDeleted = await input.deleteAuthUserFn();
    if (!authUserDeleted) {
      return {
        authUserDeleted,
        staffProfileDeleted: false,
        ...interpretStaffDeleteOutcome({ authUserDeleted, staffProfileDeleted: false }),
        messageAr: "لم يتم حذف ملف الموظف.",
      };
    }
  }

  const staffProfileDeleted = await input.deleteStaffProfileFn();
  return {
    authUserDeleted,
    staffProfileDeleted,
    ...interpretStaffDeleteOutcome({ authUserDeleted, staffProfileDeleted }),
    messageAr: staffProfileDeleted
      ? "تم حذف ملف الموظف بنجاح."
      : "حدث فشل جزئي أثناء حذف ملف الموظف.",
  };
}

describe("admin staff deletion orchestration policy 01O / R1", () => {
  it("12 — auth delete failure should not delete staff profile", async () => {
    const deleteAuthUserFn = mock(async () => false);
    const deleteStaffProfileFn = mock(async () => true);

    const result = await runPureDeleteOrchestration({
      preflight: deletablePreflight(),
      expectedFullName: "أحمد علي",
      expectedEmployeeNumber: "EMP-001",
      confirmationText: "أحمد علي",
      deleteAuthUser: true,
      deleteAuthUserFn,
      deleteStaffProfileFn,
    });

    expect(deleteAuthUserFn).toHaveBeenCalledTimes(1);
    expect(deleteStaffProfileFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      authUserDeleted: false,
      staffProfileDeleted: false,
      partialFailure: false,
      severity: "failed",
      messageAr: "لم يتم حذف ملف الموظف.",
    });
  });

  it("13 — partial failure means auth was deleted but staff profile remained", () => {
    expect(
      interpretStaffDeleteOutcome({
        authUserDeleted: true,
        staffProfileDeleted: false,
      }),
    ).toEqual({ partialFailure: true, severity: "partial" });

    expect(
      interpretStaffDeleteOutcome({
        authUserDeleted: false,
        staffProfileDeleted: false,
      }),
    ).toEqual({ partialFailure: false, severity: "failed" });

    expect(
      interpretStaffDeleteOutcome({
        authUserDeleted: false,
        staffProfileDeleted: true,
      }),
    ).toEqual({ partialFailure: false, severity: "ok" });
  });

  it("confirmation failure stops both auth and staff delete calls", async () => {
    const deleteAuthUserFn = mock(async () => true);
    const deleteStaffProfileFn = mock(async () => true);

    const result = await runPureDeleteOrchestration({
      preflight: deletablePreflight(),
      expectedFullName: "أحمد علي",
      expectedEmployeeNumber: "EMP-001",
      confirmationText: "اسم غير مطابق",
      deleteAuthUser: true,
      deleteAuthUserFn,
      deleteStaffProfileFn,
    });

    expect(deleteAuthUserFn).not.toHaveBeenCalled();
    expect(deleteStaffProfileFn).not.toHaveBeenCalled();
    expect(result.severity).toBe("failed");
    expect(result.messageAr).toContain("الاسم الكامل");
  });

  it("R1 — successful Auth delete proceeds directly to staff_profile delete without user_roles DELETE", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/admin-staff-deletion.functions.ts"),
      "utf8",
    );
    expect(source).toContain("auth.admin.deleteUser");
    expect(source).toContain("ON DELETE CASCADE");
    expect(source).toContain('from("staff_profiles")');
    expect(source).not.toMatch(/from\("user_roles"\)[\s\S]{0,40}\.delete\(/);
    expect(source).not.toMatch(/from\("staff_profile_departments"\)[\s\S]{0,40}\.delete\(/);

    const authIdx = source.indexOf("auth.admin.deleteUser");
    const staffDeleteIdx = source.indexOf('.from("staff_profiles")', authIdx);
    // Find the delete call after auth delete (not the earlier loadStaffProfile selects).
    const deleteCallIdx = source.indexOf(".delete()", staffDeleteIdx);
    expect(authIdx).toBeGreaterThan(-1);
    expect(staffDeleteIdx).toBeGreaterThan(authIdx);
    expect(deleteCallIdx).toBeGreaterThan(staffDeleteIdx);
    const between = source.slice(authIdx, deleteCallIdx);
    expect(between).not.toContain('.from("user_roles")');
    expect(between).not.toMatch(/staff_profile_departments[\s\S]{0,40}\.delete\(/);
  });

  it("R1 — auth failure path returns before staff delete", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/admin-staff-deletion.functions.ts"),
      "utf8",
    );
    expect(source).toContain("تعذر حذف حساب الدخول، ولم يتم حذف ملف الموظف");
    const authFailBlock = source.slice(
      source.indexOf("if (error) {", source.indexOf("auth.admin.deleteUser")),
      source.indexOf("authUserDeleted = true"),
    );
    expect(authFailBlock).toContain("staffProfileDeleted: false");
    expect(authFailBlock).toContain("authUserDeleted: false");
  });

  it("R1 — audit failure after staff deactivate keeps success + warning", () => {
    const result = attachAuditWarning(
      { ok: true as const, staffProfileId: "staff-1", status: "inactive" as const },
      new Error("audit insert failed"),
      "تم تعطيل ملف الموظف",
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("inactive");
    expect(result.warning).toContain("تم تعطيل ملف الموظف");
    expect(result.warning).toContain("audit insert failed");

    const source = readFileSync(
      join(ROOT, "src/lib/admin-staff-deletion.functions.ts"),
      "utf8",
    );
    expect(source).toContain("attachAuditWarning");
    expect(source).toContain("تم تعطيل ملف الموظف");
    // No automatic retry of deactivate after audit failure.
    expect(source).not.toMatch(/attachAuditWarning[\s\S]{0,200}deactivateStaffProfile\(/);
  });
});
