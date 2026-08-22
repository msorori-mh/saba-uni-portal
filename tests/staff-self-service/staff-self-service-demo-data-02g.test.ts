import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seed = readFileSync("scripts/staff-self-service-demo-data-02g.sql", "utf8");
const cleanup = readFileSync("scripts/staff-self-service-demo-data-02g-cleanup.sql", "utf8");
const flags = readFileSync("src/lib/portal-features.ts", "utf8");
const staff = readFileSync("src/routes/staff.index.tsx", "utf8");
const admin = readFileSync("src/routes/admin/staff-management.tsx", "utf8");

describe("PORTAL_STAFF_SELF_SERVICE_DEMO_DATA_02G", () => {
  it("uses a narrow TEST_ONLY marker and existing accounts", () => {
    expect(seed).toContain("PORTAL_STAFF_SELF_SERVICE_DEMO_DATA_02G");
    expect(seed).toContain("TEST_ONLY_02G");
    expect(seed).toContain("test.employee01@staff.usr.edu.ye");
    expect(seed).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(seed).not.toMatch(/password|encrypted_password|secret/i);
  });

  it("covers employee, approval, payroll, communication, custody and value-added domains", () => {
    for (const table of [
      "staff_service_role_assignments", "staff_leave_balances", "staff_service_requests",
      "staff_service_approval_steps", "staff_payroll_statements",
      "staff_payroll_components", "staff_career_history", "staff_correspondence",
      "staff_correspondence_recipients", "staff_custody_assignments", "staff_attendance_days",
      "staff_profile_departments",
      "staff_performance_evaluations", "staff_overtime_claims", "staff_training_enrollments",
      "staff_promotion_cases", "staff_clearance_cases", "staff_hr_read_snapshots",
      "staff_finance_read_snapshots", "staff_issued_documents", "staff_service_notifications_outbox",
    ]) expect(seed).toContain(table);
    expect(seed).toMatch(/approved/);
    expect(seed).toMatch(/rejected/);
    expect(seed).toMatch(/in_review/);
  });

  it("is rerunnable and keeps document downloads unavailable for demo rows", () => {
    expect(seed.match(/on conflict/gi)?.length ?? 0).toBeGreaterThan(15);
    expect(seed).toContain("on conflict");
    expect(seed).toContain("set_config('app.bypass_staff_lock','1',true)");
    expect(seed).toContain("set_config('app.bypass_staff_lock','0',true)");
    expect(seed).toContain("pdf_object_path=null");
    expect(seed).toContain("object_path=null");
    expect(seed).not.toMatch(/pdf_object_path\s*[,)]?\s*values\s*\([^)]*TEST_ONLY/i);
  });

  it("cleanup is exact and never deletes identities or master data", () => {
    expect(cleanup).toContain("TEST_ONLY_02G");
    expect(cleanup).not.toMatch(/delete\s+from\s+(auth\.users|public\.staff_profiles|public\.departments)/i);
    expect(cleanup).not.toMatch(/truncate|session_replication_role|disable\s+trigger/i);
    expect(cleanup).not.toContain("staff_service_events");
    expect(cleanup).toContain("profile_department_seeded_by_02g");
    expect(cleanup).toContain("staff_profile_departments");
  });

  it("enables all three staff services and labels both live surfaces", () => {
    expect(flags).toMatch(/staffSelfServiceLive:\s*true/);
    expect(flags).toMatch(/staffSelfServiceValueAdded:\s*true/);
    expect(flags).toMatch(/staffSelfServiceGovernance:\s*true/);
    expect(staff).toContain("بيانات تجريبية للعرض");
    expect(admin).toContain("بيانات تجريبية للعرض");
  });
});
