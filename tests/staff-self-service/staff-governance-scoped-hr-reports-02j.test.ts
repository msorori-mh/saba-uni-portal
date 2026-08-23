import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260823020000_staff_governance_scoped_hr_reports_02j.sql",
  "utf8",
);

describe("PORTAL_STAFF_GOVERNANCE_SCOPED_HR_REPORTS_02J", () => {
  it("lets any active HR assignment advertise scoped report capabilities", () => {
    expect(migration).toContain("v_hr_any");
    expect(migration).toContain("'can_view_reports', v_admin or v_hr_any or v_manager");
    expect(migration).toContain("'can_export_reports', v_admin or v_hr_any");
  });

  it("keeps integration and unified-audit capabilities global", () => {
    expect(migration).toContain("v_hr_global");
    expect(migration).toContain("'can_view_integrations', v_admin or v_hr_global");
    expect(migration).toContain("'can_view_unified_audit', v_admin or v_hr_global");
  });

  it("restricts departmental reports to manager or HR assignments", () => {
    expect(migration.match(/a\.role in \('direct_manager','hr'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("a.department_id = sp.department_id");
    expect(migration).toContain("a.department_id is not null");
    expect(migration).toContain("perform public.staff_service_require_aal2()");
  });

  it("changes functions only and preserves the fail-closed boundary", () => {
    expect(migration).toContain("STAFF_GOVERNANCE_02J_REQUIRES_02F");
    expect(migration).toContain("STAFF_SERVICE_REPORT_ACCESS_DENIED");
    expect(migration).not.toMatch(/drop\s+function|drop\s+table|truncate/i);
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security|session_replication_role/i);
  });
});
