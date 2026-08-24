import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260824120000_staff_attendance_scoped_hr_report_02m.sql",
  "utf8",
);

describe("PORTAL_STAFF_OPERATIONAL_E2E_02M", () => {
  test("admits active scoped HR without broadening institution scope", () => {
    expect(migration).toContain("a.role in ('direct_manager', 'hr')");
    expect(migration).toContain("a.role = 'hr'");
    expect(migration).toContain("a.department_id = sp.department_id");
    expect(migration).toContain("a.department_id is not null");
    expect(migration).toContain("a.valid_from <= current_date");
    expect(migration).toContain(
      "a.valid_until is null or a.valid_until >= current_date",
    );
  });

  test("keeps the report fail-closed and RPC-only", () => {
    expect(migration).toContain("STAFF_SERVICE_AUTH_REQUIRED");
    expect(migration).toContain("STAFF_SERVICE_REPORT_SCOPE_DENIED");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  test("does not weaken payroll, audit, correspondence, or governance contracts", () => {
    expect(migration).not.toMatch(/staff_payroll|staff_correspondence/i);
    expect(migration).not.toMatch(/staff_governance_audit_events/i);
    expect(migration).not.toMatch(/staff_service_require_aal2/i);
    expect(migration).not.toMatch(/disable\s+trigger|session_replication_role|truncate/i);
  });
});
