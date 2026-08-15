import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  P1_MIGRATION_PACKAGE,
  P1_REVENUE_GATE,
  P1_SERVER_ERROR_CODES,
  P1_SERVER_ERROR_MESSAGES_AR,
  isRevenueGateOpen,
  p1ServerErrorMessageAr,
  parseP1ServerError,
} from "../../../src/lib/student-requests/p1/backend-contract";
import {
  P1_AUTHZ_DENY,
  P1_WORKFLOWS,
  evaluateP1StepAuthorization,
  type P1ActorContext,
} from "../../../src/lib/student-requests/p1/authorization-matrix";
import { OLD_GRADE_APPEAL_TRIGGER_DECISION } from "../../../src/lib/student-requests/p1/final-result-appeal";

const ROOT = join(import.meta.dir, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const DRAFTS = P1_MIGRATION_PACKAGE.map(read);
const ALL_SQL = DRAFTS.join("\n");

describe("P1 source closure 02 — migration package", () => {
  it("ships all four forward-only drafts", () => {
    expect(P1_MIGRATION_PACKAGE).toHaveLength(4);
    for (const sql of DRAFTS) {
      expect(sql).toContain("BEGIN;");
      expect(sql).toContain("COMMIT;");
    }
  });

  it("creates the P1 detail models with grants and RLS", () => {
    const sql = DRAFTS[0]!;
    for (const table of ["october_exam_entry_details", "replacement_card_details"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
      expect(sql).toContain(`GRANT ALL    ON public.${table} TO service_role`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    // client write is never granted on server-written detail models
    expect(sql).not.toContain("GRANT INSERT");
    expect(sql).not.toContain("GRANT UPDATE");
  });

  it("evolves grade_appeal_details for the formal final-result appeal", () => {
    const sql = DRAFTS[0]!;
    for (const col of [
      "appeal_kind",
      "final_result_published_at",
      "appeal_window_end",
      "previous_final_result",
      "approved_final_result",
      "result_change_applied_at",
      "result_change_applied_by",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("never flips student_visible and never backfills data", () => {
    expect(ALL_SQL).not.toMatch(/student_visible\s*=\s*true/i);
    expect(ALL_SQL).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(ALL_SQL).not.toMatch(/\bTRUNCATE\b/i);
    expect(ALL_SQL).not.toMatch(/DROP\s+TABLE/i);
  });

  it("declares every server error code it raises in the TS contract", () => {
    const raised = [...ALL_SQL.matchAll(/RAISE EXCEPTION '([A-Z0-9_]+)'/g)].map((m) => m[1]!);
    expect(raised.length).toBeGreaterThan(10);
    for (const code of raised) {
      expect(P1_SERVER_ERROR_CODES).toContain(code as never);
    }
  });

  it("keeps an Arabic message for every server error code", () => {
    for (const code of P1_SERVER_ERROR_CODES) {
      expect(P1_SERVER_ERROR_MESSAGES_AR[code].length).toBeGreaterThan(5);
    }
  });

  it("maps raw server errors back to Arabic", () => {
    const raw = new Error('new row violates: OCTOBER_NOT_LEVEL_4');
    expect(parseP1ServerError(raw)).toBe("OCTOBER_NOT_LEVEL_4");
    expect(p1ServerErrorMessageAr(raw)).toContain("المستوى الرابع");
    expect(parseP1ServerError("something else")).toBeNull();
    expect(p1ServerErrorMessageAr("something else")).toContain("تعذر");
  });
});

describe("P1 source closure 02 — grade appeal trigger decision", () => {
  it("is REPLACE and removes the proportional redistribution trigger", () => {
    expect(OLD_GRADE_APPEAL_TRIGGER_DECISION).toBe("REPLACE");
    const sql = DRAFTS[3]!;
    expect(sql).toContain(
      "DROP TRIGGER IF EXISTS trg_apply_grade_appeal_on_approval ON public.student_requests",
    );
    expect(sql).toContain("p1_apply_final_result_decision");
    // the replacement never rewrites coursework components
    expect(sql).not.toContain("UPDATE public.student_grades");
  });

  it("binds the replacement to the registrar step and audits before/after", () => {
    const sql = DRAFTS[3]!;
    expect(sql).toContain("p1_assert_step_actor(p_request, 'registrar_apply_result'");
    expect(sql).toContain("previous_final_result");
    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toContain("ALREADY_APPLIED");
  });
});

describe("P1 source closure 02 — revenue confirmation gate", () => {
  it("never introduces a payment gateway, amount or currency", () => {
    expect(P1_REVENUE_GATE.portalCollectsMoney).toBe(false);
    expect(ALL_SQL).not.toMatch(/amount|currency|gateway/i);
  });

  it("blocks paid services until revenue confirms and skips free services", () => {
    expect(
      isRevenueGateOpen({ hasPaymentStep: true, paymentStepStatus: "pending", paymentStepDecision: null }),
    ).toBe(false);
    expect(
      isRevenueGateOpen({ hasPaymentStep: true, paymentStepStatus: "completed", paymentStepDecision: "confirmed" }),
    ).toBe(true);
    expect(
      isRevenueGateOpen({ hasPaymentStep: false, paymentStepStatus: null, paymentStepDecision: null }),
    ).toBe(true);
  });
});

describe("P1 source closure 02 — workflow seeds", () => {
  const seeds = DRAFTS[2]!;

  it("seeds a real workflow for every P1 service that needs one", () => {
    for (const code of [
      "october_exam_entry_form_v1",
      "replacement_student_card_v1",
      "final_result_appeal_v1",
    ]) {
      expect(seeds).toContain(code);
    }
  });

  it("binds every seeded step to a processing unit and role that exists", () => {
    const units = new Set([
      "student_affairs",
      "finance",
      "registrar",
      "archive",
      "department",
      "dean",
    ]);
    const steps = [...seeds.matchAll(/"unit":"([a-z_]+)","role":"([a-z_]+)"/g)];
    expect(steps.length).toBe(13);
    for (const [, unit] of steps) expect(units.has(unit!)).toBe(true);
    expect(seeds).toContain("'course_instructor'");
    expect(seeds).toContain("P1_SEED_MISSING_PROCESSING_BINDING");
  });

  it("keeps the source matrix aligned with the seeded units", () => {
    const seededUnits = new Set([...seeds.matchAll(/"unit":"([a-z_]+)"/g)].map((m) => m[1]!));
    for (const service of ["october_exam_entry_form", "replacement_student_card", "grade_appeal"] as const) {
      for (const step of P1_WORKFLOWS[service]) {
        expect(seededUnits.has(step.unit)).toBe(true);
      }
    }
  });
});

describe("P1 source closure 02 — full actor-bound authorization matrix", () => {
  const actor = (over: Partial<P1ActorContext> = {}): P1ActorContext => ({
    userId: "u-actor",
    roles: [],
    directAssignment: null,
    ...over,
  });

  it("allows exactly the assigned actor on the current step (positive matrix)", () => {
    for (const [service, steps] of Object.entries(P1_WORKFLOWS)) {
      for (const step of steps) {
        const result = evaluateP1StepAuthorization({
          service: service as keyof typeof P1_WORKFLOWS,
          stepKey: step.key,
          currentStepKey: step.key,
          paymentConfirmed: true,
          actor: actor({
            directAssignment: {
              stepKey: step.key,
              unit: step.unit,
              role: step.role,
              assigneeUserId: "u-actor",
            },
          }),
        });
        expect({ service, step: step.key, result }).toEqual({
          service,
          step: step.key,
          result: { allowed: true },
        });
      }
    }
  });

  it("denies every unassigned actor on every step (negative matrix)", () => {
    for (const [service, steps] of Object.entries(P1_WORKFLOWS)) {
      for (const step of steps) {
        const base = {
          service: service as keyof typeof P1_WORKFLOWS,
          stepKey: step.key,
          currentStepKey: step.key,
          paymentConfirmed: true,
        };

        // no assignment at all
        expect(
          evaluateP1StepAuthorization({ ...base, actor: actor() }),
        ).toEqual({ allowed: false, deny: P1_AUTHZ_DENY.NO_DIRECT_ASSIGNMENT });

        // privileged role names never bypass
        for (const role of ["admin", "system_admin", "dean", "registrar_general"]) {
          expect(
            evaluateP1StepAuthorization({ ...base, actor: actor({ roles: [role] }) }),
          ).toEqual({ allowed: false, deny: P1_AUTHZ_DENY.NO_DIRECT_ASSIGNMENT });
        }

        // someone else's assignment
        expect(
          evaluateP1StepAuthorization({
            ...base,
            actor: actor({
              directAssignment: {
                stepKey: step.key,
                unit: step.unit,
                role: step.role,
                assigneeUserId: "someone-else",
              },
            }),
          }),
        ).toEqual({ allowed: false, deny: P1_AUTHZ_DENY.NO_DIRECT_ASSIGNMENT });

        // assignment for a different step
        expect(
          evaluateP1StepAuthorization({
            ...base,
            actor: actor({
              directAssignment: {
                stepKey: `${step.key}-other`,
                unit: step.unit,
                role: step.role,
                assigneeUserId: "u-actor",
              },
            }),
          }).allowed,
        ).toBe(false);

        // wrong processing binding
        expect(
          evaluateP1StepAuthorization({
            ...base,
            actor: actor({
              directAssignment: {
                stepKey: step.key,
                unit: "wrong_unit",
                role: step.role,
                assigneeUserId: "u-actor",
              },
            }),
          }),
        ).toEqual({ allowed: false, deny: P1_AUTHZ_DENY.PROCESSING_BINDING_MISMATCH });

        // acting out of turn
        expect(
          evaluateP1StepAuthorization({
            ...base,
            currentStepKey: "some_other_step",
            actor: actor({
              directAssignment: {
                stepKey: step.key,
                unit: step.unit,
                role: step.role,
                assigneeUserId: "u-actor",
              },
            }),
          }),
        ).toEqual({ allowed: false, deny: P1_AUTHZ_DENY.STEP_NOT_CURRENT });
      }
    }
  });

  it("holds payment-gated steps until revenue confirmation", () => {
    for (const [service, steps] of Object.entries(P1_WORKFLOWS)) {
      for (const step of steps.filter((s) => s.requiresPaymentConfirmed)) {
        expect(
          evaluateP1StepAuthorization({
            service: service as keyof typeof P1_WORKFLOWS,
            stepKey: step.key,
            currentStepKey: step.key,
            paymentConfirmed: false,
            actor: actor({
              directAssignment: {
                stepKey: step.key,
                unit: step.unit,
                role: step.role,
                assigneeUserId: "u-actor",
              },
            }),
          }),
        ).toEqual({ allowed: false, deny: P1_AUTHZ_DENY.PAYMENT_NOT_CONFIRMED });
      }
    }
  });
});

describe("P1 source closure 02 — terminology", () => {
  it("never renders the duplicated services wording", () => {
    const summary = read("src/components/portal/StudentRequestsPortalSummary.tsx");
    expect(summary).not.toContain("الخدمات والخدمات");
    expect(summary).toContain("الخدمات الطلابية");
  });
});
