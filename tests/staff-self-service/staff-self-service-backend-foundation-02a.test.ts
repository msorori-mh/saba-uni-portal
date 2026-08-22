import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  STAFF_SELF_SERVICE_BACKEND_MARKER,
  leaveRequestPayloadSchema,
  roleCan,
  staffServiceAccessMatrix,
  staffServiceDecisionSchema,
  staffServiceRoles,
  staffServiceTypes,
  staffServiceWorkflow,
} from "../../src/lib/staff-self-service-contracts";

const migration = readFileSync(
  "supabase/migrations/20260821220000_staff_self_service_backend_foundation_02a.sql",
  "utf8",
);

describe("PORTAL_STAFF_SELF_SERVICE_BACKEND_FOUNDATION_02A", () => {
  test("freezes the approved role model without widening the legacy app_role enum", () => {
    expect(STAFF_SELF_SERVICE_BACKEND_MARKER).toBe(
      "PORTAL_STAFF_SELF_SERVICE_BACKEND_FOUNDATION_02A",
    );
    expect(staffServiceRoles).toEqual([
      "employee",
      "direct_manager",
      "hr",
      "finance",
      "administrator",
    ]);
    expect(migration).not.toMatch(/alter\s+type\s+public\.app_role/i);
    expect(migration).toContain("staff_service_role_assignments");
  });

  test("creates a deterministic approval path for every request service", () => {
    expect(Object.keys(staffServiceWorkflow).sort()).toEqual(
      [...staffServiceTypes].sort(),
    );
    expect(staffServiceWorkflow.leave).toEqual(["direct_manager", "hr"]);
    expect(staffServiceWorkflow.overtime).toEqual([
      "direct_manager",
      "hr",
      "finance",
    ]);
    expect(staffServiceWorkflow.clearance).toEqual([
      "direct_manager",
      "hr",
      "finance",
      "administrator",
    ]);
  });

  test("validates leave dates and requires a rejection reason", () => {
    expect(
      leaveRequestPayloadSchema.safeParse({
        leaveType: "annual",
        startsOn: "2026-08-25",
        endsOn: "2026-08-29",
        durationDays: 5,
      }).success,
    ).toBe(true);
    expect(
      leaveRequestPayloadSchema.safeParse({
        leaveType: "annual",
        startsOn: "2026-08-29",
        endsOn: "2026-08-25",
        durationDays: 5,
      }).success,
    ).toBe(false);
    expect(
      staffServiceDecisionSchema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        decision: "rejected",
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
  });

  test("keeps salary access own-row or Finance and excludes it from manager access", () => {
    expect(roleCan("employee", "payroll.read.own")).toBe(true);
    expect(roleCan("direct_manager", "payroll.manage")).toBe(false);
    expect(roleCan("hr", "payroll.manage")).toBe(false);
    expect(roleCan("finance", "payroll.manage")).toBe(true);
    expect(migration).toContain("staff_payroll_statements_owner_or_finance_read");
    expect(migration).toContain("sp.user_id = auth.uid()");
    expect(migration).toContain(
      "staff_service_has_role(auth.uid(), 'finance', null)",
    );
  });

  test("enables RLS and grants clients read-only table access by default", () => {
    for (const table of [
      "staff_service_role_assignments",
      "staff_service_requests",
      "staff_service_approval_steps",
      "staff_service_attachments",
      "staff_service_events",
      "staff_leave_balances",
      "staff_payroll_statements",
      "staff_payroll_components",
      "staff_career_history",
      "staff_correspondence",
      "staff_correspondence_recipients",
      "staff_custody_assignments",
      "staff_service_notifications_outbox",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      );
    }
    expect(migration).not.toMatch(/grant\s+(insert|delete)\s+on\s+table/i);
  });

  test("uses atomic idempotent RPCs and denies self approval", () => {
    expect(migration).toContain("staff_service_submit_request");
    expect(migration).toContain("staff_service_decide_request");
    expect(migration).toContain("STAFF_SERVICE_IDEMPOTENT_REPLAY_MISMATCH");
    expect(migration).toContain("STAFF_SERVICE_SELF_APPROVAL_DENIED");
    expect(migration).toContain("for update of r");
    expect(migration).toContain("p_idempotency_key uuid");
  });

  test("makes the audit timeline append-only and correlation-safe", () => {
    expect(migration).toContain("staff_service_events_immutable_update");
    expect(migration).toContain("staff_service_events_immutable_delete");
    expect(migration).toContain("STAFF_SERVICE_AUDIT_IMMUTABLE");
    expect(migration).toContain(
      "unique (request_id, event_type, correlation_id)",
    );
  });

  test("models secure attachments, source integrations, and notification outbox", () => {
    expect(migration).toContain("staff-service-private");
    expect(migration).toContain("size_bytes <= 10485760");
    expect(migration).toContain("scan_state");
    expect(migration).toContain("source_system");
    expect(migration).toContain("source_reference");
    expect(migration).toContain("staff_service_notifications_outbox");
    expect(staffServiceAccessMatrix.administrator).toContain("roles.manage");
  });
});

