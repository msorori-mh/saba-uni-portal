import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FACULTY_ONLY_ROLE_CODES,
  isFacultyOnlyRoleCode,
} from "../../src/lib/admin-processing-assignments.functions";

const ROOT = join(import.meta.dir, "../..");
const SRC = readFileSync(
  join(ROOT, "src/lib/admin-processing-assignments.functions.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(ROOT, "src/routes/admin/processing-assignments.tsx"),
  "utf8",
);
const NAV = readFileSync(join(ROOT, "src/lib/admin-nav.ts"), "utf8");
const SHELL = readFileSync(
  join(ROOT, "src/components/admin/AdminShell.tsx"),
  "utf8",
);

describe("processing assignments admin — policy contracts", () => {
  it("dean and vice_dean are faculty-only role codes", () => {
    expect([...FACULTY_ONLY_ROLE_CODES]).toEqual(["dean", "vice_dean"]);
    expect(isFacultyOnlyRoleCode("dean")).toBe(true);
    expect(isFacultyOnlyRoleCode("vice_dean")).toBe(true);
    expect(isFacultyOnlyRoleCode("student_affairs_manager")).toBe(false);
    expect(isFacultyOnlyRoleCode(null)).toBe(false);
    expect(isFacultyOnlyRoleCode(undefined)).toBe(false);
    expect(isFacultyOnlyRoleCode("")).toBe(false);
  });

  it("mutations require admin or system_admin only", () => {
    expect(SRC).toContain(
      'const PROCESSING_ASSIGNMENT_ADMIN_ROLES = ["admin", "system_admin"] as const',
    );
    expect(SRC).toContain("assertProcessingAssignmentAdmin(context.userId)");
    expect(NAV).toContain(
      '"/admin/processing-assignments": ["system_admin", "admin"]',
    );
  });

  it("duplicate active assignment for the same role is blocked", () => {
    expect(SRC).toContain('.eq("role_id", data.role_id)');
    expect(SRC).toContain('.eq("is_active", true)');
    expect(SRC).toContain(
      "يوجد إسناد نشط آخر لهذا الدور. عطّله أولاً قبل إضافة إسناد جديد.",
    );
    expect(SRC).toContain(
      "يوجد بالفعل إسناد نشط لهذا المستخدم على نفس الدور.",
    );
  });

  it("faculty-only role rejects non-faculty user", () => {
    expect(SRC).toContain("isFacultyOnlyRoleCode(role.code)");
    expect(SRC).toContain("هذا الدور يتطلب اختيار عضو هيئة تدريس.");
  });

  it("create + deactivate write audit_logs with processing_assignment entity", () => {
    expect(SRC).toContain('entity_type: "processing_assignment"');
    expect(SRC).toContain('action_type: "created"');
    expect(SRC).toContain('action_type: "deactivated"');
  });

  it("uses supabaseAdmin via dynamic import inside handler (not module-scope)", () => {
    expect(SRC).not.toMatch(/^import\s.*client\.server/m);
    expect(SRC).toContain('await import("@/integrations/supabase/client.server")');
  });

  it("no hard-coded F2025001 or other employee number", () => {
    expect(SRC).not.toMatch(/F2025\d+/);
    expect(ROUTE).not.toMatch(/F2025\d+/);
  });

  it("admin shell nav links to the new screen", () => {
    expect(SHELL).toContain('to: "/admin/processing-assignments"');
    expect(SHELL).toContain("ممثلو أدوار الطلبات");
  });

  it("UI disables the assign button when an active assignee already exists", () => {
    expect(ROUTE).toContain("disabled={!role.is_active || !!cur || !unit?.is_active}");
  });
});
