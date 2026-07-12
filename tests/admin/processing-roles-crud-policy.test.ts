import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES,
  evaluateProcessingRoleMutationSafety,
} from "../../src/lib/admin-staff-deletion.core";
import {
  attachAuditWarning,
  evaluateProcessingRoleUsageSafety,
  interpretRoleDeleteResult,
  normalizeProcessingRoleCode,
  validateProcessingRoleCode,
  type ProcessingRoleUsageSafetyInput,
} from "../../src/lib/admin-processing-roles.core";

const ROOT = join(import.meta.dir, "../..");

const noUsage: ProcessingRoleUsageSafetyInput = {
  workflowStepsCount: 0,
  assignmentsCount: 0,
  positionMappingsCount: 0,
  queryFailures: [],
};

function usage(overrides: Partial<ProcessingRoleUsageSafetyInput>): ProcessingRoleUsageSafetyInput {
  return { ...noUsage, ...overrides };
}

describe("admin processing roles CRUD policy 01O", () => {
  it("15 — accepts valid normalized processing role codes", () => {
    expect(normalizeProcessingRoleCode(" Student_Affairs_Manager ")).toBe(
      "student_affairs_manager",
    );
    expect(validateProcessingRoleCode("student_affairs_manager")).toEqual({ ok: true });
  });

  it("16 — duplicate checks are server-side, while validate only enforces format", () => {
    expect(validateProcessingRoleCode("dean")).toEqual({ ok: true });

    const source = readFileSync(
      join(ROOT, "src/lib/admin-processing-roles.functions.ts"),
      "utf8",
    );
    expect(source).toContain('eq("code", code)');
    expect(source).toContain("رمز مسمى المعالجة مستخدم مسبقاً");
  });

  it("17 — rejects invalid processing role code format", () => {
    const invalid = validateProcessingRoleCode("1 Bad-Code");
    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? "" : invalid.messageAr).toContain("يجب أن يبدأ بحرف لاتيني صغير");
  });

  it("18 — inactive unit policy is server-side; unused roles can be deleted by pure safety", () => {
    expect(evaluateProcessingRoleUsageSafety(noUsage, "delete", "archive_officer")).toEqual({
      allowed: true,
      reasons: [],
    });

    const source = readFileSync(
      join(ROOT, "src/lib/admin-processing-roles.functions.ts"),
      "utf8",
    );
    expect(source).toContain("requireActiveUnit");
    expect(source).toContain("جهة المعالجة غير مفعلة");
  });

  it("21 — used roles cannot change processing unit", () => {
    const result = evaluateProcessingRoleMutationSafety({
      code: "registrar_general",
      action: "change_unit",
      usage: usage({ workflowStepsCount: 1 }),
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("دورات الحياة");
  });

  it("22 — workflow usage blocks delete", () => {
    const result = evaluateProcessingRoleUsageSafety(
      usage({ workflowStepsCount: 2 }),
      "delete",
      "dean",
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("2");
  });

  it("23 — assignment usage blocks delete", () => {
    const result = evaluateProcessingRoleUsageSafety(
      usage({ assignmentsCount: 1 }),
      "delete",
      "student_affairs_specialist",
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("تكليف معالجة");
  });

  it("24 — unused role can be deleted", () => {
    const result = evaluateProcessingRoleUsageSafety(noUsage, "delete", "new_role");
    expect(result).toEqual({ allowed: true, reasons: [] });
  });

  it("25 — deactivation is blocked when draft workflow steps are present", () => {
    const result = evaluateProcessingRoleUsageSafety(
      usage({
        workflowStepsCount: 1,
        activeWorkflowStepsCount: 0,
        draftWorkflowStepsCount: 1,
      }),
      "deactivate",
      "student_affairs_manager",
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("1 خطوة مسودة");
  });

  it("asserts ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES has exactly the six protected codes", () => {
    expect([...ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES].sort()).toEqual(
      [
        "archive_officer",
        "dean",
        "registrar_general",
        "revenue_finance_officer",
        "student_affairs_manager",
        "student_affairs_specialist",
      ].sort(),
    );
    expect(ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES).toHaveLength(6);
  });
});

describe("admin processing roles source contracts 01O", () => {
  const source = readFileSync(
    join(ROOT, "src/lib/admin-processing-roles.functions.ts"),
    "utf8",
  );

  it("19 — code is immutable after creation", () => {
    expect(source).toContain("if (data.code !== undefined)");
    expect(source).toContain("لا يمكن تغيير رمز مسمى المعالجة");
    expect(source).not.toMatch(/patch\.code\s*=/);
  });

  it("20 — editable fields include name and sort order", () => {
    expect(source).toContain("if (data.name_ar !== undefined) patch.name_ar = data.name_ar");
    expect(source).toContain("if (data.name_en !== undefined) patch.name_en = data.name_en");
    expect(source).toContain("if (data.sort_order !== undefined) patch.sort_order = data.sort_order");
  });

  it("26 — processing role mutations require admin or system_admin", () => {
    expect(source).toContain('const PROCESSING_ROLE_ADMIN_ROLES = ["admin", "system_admin"] as const');
    expect(source).toContain("assertProcessingRoleAdmin(context.userId)");
  });

  it("R1 — audit insert errors return success + warning without retry", () => {
    expect(source).toContain("const { error } = await supabaseAdmin.from(\"audit_logs\").insert");
    expect(source).toContain("attachAuditWarning");
    expect(source).toContain("تم إنشاء الدور الوظيفي");
    expect(source).toContain("تم تحديث الدور الوظيفي");
    expect(source).toContain("تم حذف الدور الوظيفي");
    expect(source).not.toMatch(/attachAuditWarning[\s\S]{0,120}createRequestProcessingRole\(/);
    expect(source).not.toMatch(/warning[\s\S]{0,80}await createRequestProcessingRole/);
  });

  it("R1 — delete uses select(id) and does not audit zero-row deletes as new deletes", () => {
    expect(source).toContain('.select("id")');
    expect(source).toContain("interpretRoleDeleteResult");
    expect(source).toContain("idempotent");
    expect(source).toContain("do not write a fresh deleted audit");
  });
});

describe("admin processing roles audit warning policy R1", () => {
  it("audit insert error after role delete yields success + warning", () => {
    const result = attachAuditWarning(
      { ok: true as const, deleted_id: "role-1", idempotent: false as const },
      "audit down",
      "تم حذف الدور الوظيفي",
    );
    expect(result.ok).toBe(true);
    expect(result.deleted_id).toBe("role-1");
    expect(result.warning).toContain("تم حذف الدور الوظيفي");
    expect(result.warning).toContain("audit down");
  });

  it("audit insert error after create/update/toggle yields success + warning", () => {
    for (const label of [
      "تم إنشاء الدور الوظيفي",
      "تم تحديث الدور الوظيفي",
      "تم تفعيل الدور الوظيفي",
      "تم تعطيل الدور الوظيفي",
    ]) {
      const result = attachAuditWarning(
        { ok: true as const, role: { id: "r1" } },
        new Error("insert failed"),
        label,
      );
      expect(result.ok).toBe(true);
      expect(result.warning).toContain(label);
      expect(result.warning).toContain("insert failed");
    }
  });

  it("interpretRoleDeleteResult distinguishes real delete vs idempotent missing", () => {
    expect(
      interpretRoleDeleteResult({ deletedCount: 1, roleId: "r1", alreadyMissing: false }),
    ).toEqual({ ok: true, deleted_id: "r1", idempotent: false });
    expect(
      interpretRoleDeleteResult({ deletedCount: 0, roleId: "r1", alreadyMissing: true }),
    ).toMatchObject({ ok: true, idempotent: true });
    expect(
      interpretRoleDeleteResult({ deletedCount: 0, roleId: "r1", alreadyMissing: false }).ok,
    ).toBe(false);
  });
});
