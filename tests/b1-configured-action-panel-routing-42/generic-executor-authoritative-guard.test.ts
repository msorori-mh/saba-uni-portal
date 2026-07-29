/**
 * PORTAL-B1-CONFIGURED-ACTION-ATOMIC-ROUTING-INDEPENDENT-REVIEW-REMEDIATION-46
 *
 * G2 — generic-executor authoritative guard tests.
 *
 * These do NOT touch the DB and issue NO workflow RPC. They drive the exact
 * guard the server handler runs (`assertGenericExecutorAuthoritativeRequestType`)
 * with a recording lookup + recording RPC/audit counters, and pin the input
 * schema contract of `executeStudentRequestStaffAction` at source level.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  assertGenericExecutorAuthoritativeRequestType,
  GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
  GENERIC_EXECUTOR_REQUEST_MISMATCH_ERROR,
  GENERIC_EXECUTOR_TYPE_MISMATCH_ERROR,
  GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR,
  isB1StaffRoutedRequestType,
} from "@/lib/student-requests/b1-staff-action-routing";

const ROOT = join(import.meta.dir, "../..");
const SERVER_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
).replace(/\r\n/g, "\n");

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const STEP_ID = "22222222-2222-4222-8222-222222222222";

type Counters = { lookups: number; rpcCalls: number; auditWrites: number };

/**
 * Simulates the server handler ordering: guard first, then (only on success)
 * the workflow RPC and the audit insert. Counters prove nothing is written
 * when the guard rejects.
 */
async function runGuardedExecutor(params: {
  clientRequestTypeCode: unknown;
  authoritativeRequestTypeCode: string | null;
  authoritativeRequestId?: string | null;
  rowMissing?: boolean;
}): Promise<{ ok: boolean; error: string | null; counters: Counters }> {
  const counters: Counters = { lookups: 0, rpcCalls: 0, auditWrites: 0 };
  try {
    await assertGenericExecutorAuthoritativeRequestType({
      requestId: REQUEST_ID,
      stepId: STEP_ID,
      clientRequestTypeCode: params.clientRequestTypeCode as string | null | undefined,
      lookup: async () => {
        counters.lookups += 1;
        if (params.rowMissing) return null;
        return {
          requestId:
            params.authoritativeRequestId === undefined
              ? REQUEST_ID
              : params.authoritativeRequestId,
          requestTypeCode: params.authoritativeRequestTypeCode,
        };
      },
    });
    // Only reachable when the guard allowed the generic path.
    counters.rpcCalls += 1; // act_on_student_request_step
    counters.auditWrites += 1; // audit_logs insert
    return { ok: true, error: null, counters };
  } catch (error) {
    return { ok: false, error: (error as Error).message, counters };
  }
}

const B1_CODES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
];

describe("executeStudentRequestStaffAction — schema contract", () => {
  it("declares requestTypeCode as required, non-null and non-empty", () => {
    const block = SERVER_SRC.slice(
      SERVER_SRC.indexOf("const executeReviewActionSchema"),
      SERVER_SRC.indexOf("export type ExecuteStudentRequestStaffActionResult"),
    );
    expect(block).toContain("requestTypeCode: z.string().trim().min(1),");
    expect(block).not.toMatch(/requestTypeCode:[^\n]*optional\(\)/);
    expect(block).not.toMatch(/requestTypeCode:[^\n]*nullable\(\)/);
  });

  it("rejects omitted / null / empty requestTypeCode before any handler code", () => {
    const schema = z.object({
      requestId: z.string().uuid(),
      requestTypeCode: z.string().trim().min(1),
      workflowStepRuntimeId: z.string().uuid(),
    });
    const base = { requestId: REQUEST_ID, workflowStepRuntimeId: STEP_ID };
    expect(schema.safeParse(base).success).toBe(false);
    expect(schema.safeParse({ ...base, requestTypeCode: null }).success).toBe(false);
    expect(schema.safeParse({ ...base, requestTypeCode: "" }).success).toBe(false);
    expect(schema.safeParse({ ...base, requestTypeCode: "   " }).success).toBe(false);
    expect(schema.safeParse({ ...base, requestTypeCode: "enrollment_certificate" }).success)
      .toBe(true);
  });

  it("runs the authoritative guard before the RPC and the audit insert", () => {
    const handlerStart = SERVER_SRC.indexOf(
      "export const executeStudentRequestStaffAction",
    );
    const handlerEnd = SERVER_SRC.indexOf(
      "export const prepareStudentRequestSignAction",
      handlerStart + 1,
    );
    const block = SERVER_SRC.slice(
      handlerStart,
      handlerEnd > handlerStart ? handlerEnd : handlerStart + 6000,
    );
    const guardIdx = block.indexOf("assertGenericExecutorAuthoritativeRequestType");
    const rpcIdx = block.indexOf('rpc("act_on_student_request_step"');
    const auditIdx = block.indexOf('from("audit_logs")');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(guardIdx);
    expect(auditIdx).toBeGreaterThan(guardIdx);
    expect(block).toContain("request:student_requests!inner(id, request_type)");
  });
});

describe("authoritative generic-executor guard", () => {
  it("fails closed when requestTypeCode is omitted / null / empty", async () => {
    for (const value of [undefined, null, "", "   "]) {
      const r = await runGuardedExecutor({
        clientRequestTypeCode: value,
        authoritativeRequestTypeCode: "enrollment_certificate",
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe(GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR);
      expect(r.counters.lookups).toBe(0);
      expect(r.counters.rpcCalls).toBe(0);
      expect(r.counters.auditWrites).toBe(0);
    }
  });

  it("fails closed for every B1 service sent honestly by the client", async () => {
    for (const code of B1_CODES) {
      const r = await runGuardedExecutor({
        clientRequestTypeCode: code,
        authoritativeRequestTypeCode: code,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe(GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR);
      expect(r.counters.rpcCalls).toBe(0);
      expect(r.counters.auditWrites).toBe(0);
    }
  });

  it("fails closed for the legacy alias absence_excuse", async () => {
    const r = await runGuardedExecutor({
      clientRequestTypeCode: "absence_excuse",
      authoritativeRequestTypeCode: "absence_excuse",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe(GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR);
    expect(isB1StaffRoutedRequestType("absence_excuse")).toBe(true);
    expect(r.counters.rpcCalls).toBe(0);
  });

  it("fails closed when a B1 request is forged as enrollment_certificate", async () => {
    for (const code of B1_CODES) {
      const r = await runGuardedExecutor({
        clientRequestTypeCode: "enrollment_certificate",
        authoritativeRequestTypeCode: code,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe(GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR);
      expect(r.counters.lookups).toBe(1);
      expect(r.counters.rpcCalls).toBe(0);
      expect(r.counters.auditWrites).toBe(0);
    }
  });

  it("fails closed when a B1 request is forged as an arbitrary non-B1 type", async () => {
    const r = await runGuardedExecutor({
      clientRequestTypeCode: "some_other_service",
      authoritativeRequestTypeCode: "excused_absence",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe(GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR);
    expect(r.counters.rpcCalls).toBe(0);
  });

  it("fails closed on client/authoritative mismatch between two non-B1 types", async () => {
    const r = await runGuardedExecutor({
      clientRequestTypeCode: "enrollment_certificate",
      authoritativeRequestTypeCode: "grade_appeal",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe(GENERIC_EXECUTOR_TYPE_MISMATCH_ERROR);
    expect(r.counters.rpcCalls).toBe(0);
    expect(r.counters.auditWrites).toBe(0);
  });

  it("fails closed when the authoritative type is missing or the row is absent", async () => {
    const missingType = await runGuardedExecutor({
      clientRequestTypeCode: "enrollment_certificate",
      authoritativeRequestTypeCode: null,
    });
    expect(missingType.ok).toBe(false);
    expect(missingType.error).toBe(GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR);

    const missingRow = await runGuardedExecutor({
      clientRequestTypeCode: "enrollment_certificate",
      authoritativeRequestTypeCode: "enrollment_certificate",
      rowMissing: true,
    });
    expect(missingRow.ok).toBe(false);
    expect(missingRow.error).toBe(GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR);
    expect(missingRow.counters.rpcCalls).toBe(0);
  });

  it("fails closed when the step's request id differs from the submitted requestId", async () => {
    const r = await runGuardedExecutor({
      clientRequestTypeCode: "enrollment_certificate",
      authoritativeRequestTypeCode: "enrollment_certificate",
      authoritativeRequestId: "33333333-3333-4333-8333-333333333333",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe(GENERIC_EXECUTOR_REQUEST_MISMATCH_ERROR);
    expect(r.counters.rpcCalls).toBe(0);
    expect(r.counters.auditWrites).toBe(0);
  });

  it("allows a genuine non-B1 service (enrollment_certificate) through", async () => {
    const r = await runGuardedExecutor({
      clientRequestTypeCode: "enrollment_certificate",
      authoritativeRequestTypeCode: "enrollment_certificate",
    });
    expect(r.ok).toBe(true);
    expect(r.error).toBeNull();
    expect(r.counters.rpcCalls).toBe(1);
    expect(r.counters.auditWrites).toBe(1);
  });
});
