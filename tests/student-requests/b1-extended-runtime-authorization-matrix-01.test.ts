import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_FEE_POLICIES,
  B1_WORKFLOWS,
  canActOnB1RuntimeStep,
  isFinalChanceTypeForWrite,
} from "../../src/lib/student-requests/request-service-adapter";

const actorSql = readFileSync(
  join(
    process.cwd(),
    "docs",
    "migration-drafts",
    "STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  ),
  "utf8",
);
const transferScopeSql = readFileSync(
  join(
    process.cwd(),
    "docs",
    "migration-drafts",
    "DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01.sql",
  ),
  "utf8",
);
const attachmentSql = readFileSync(
  join(
    process.cwd(),
    "docs",
    "migration-drafts",
    "STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql",
  ),
  "utf8",
);
const paymentSql = readFileSync(
  join(
    process.cwd(),
    "docs",
    "migration-drafts",
    "EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql",
  ),
  "utf8",
);

describe("B1-EXTENDED-RUNTIME-AUTHORIZATION-MATRIX-01", () => {
  for (const [service, steps] of Object.entries(B1_WORKFLOWS)) {
    for (const step of steps) {
      const base = {
        step,
        authenticatedUserId: "assigned",
        assignedUserId: "assigned",
        actorUnit: step.unit,
        actorRole: step.role,
        attemptedAction: step.action,
        stepStatus: "active",
        stepRequestId: "request-a",
        actionRequestId: "request-a",
        predecessorComplete: true,
        actorDepartmentId:
          step.role === "department_head"
            ? step.key.startsWith("source_")
              ? "source"
              : "target"
            : null,
        requiredDepartmentId:
          step.role === "department_head"
            ? step.key.startsWith("source_")
              ? "source"
              : "target"
            : null,
      };

      it(`${service}/${step.key} ALLOW exact direct assignee only`, () => {
        expect(canActOnB1RuntimeStep(base)).toBe(true);
        expect(actorSql).toContain(
          `('${service}','${step.key}','${step.unit}','${step.role}','${step.action}')`,
        );
      });

      it(`${service}/${step.key} DENY matrix`, () => {
        expect(
          canActOnB1RuntimeStep({ ...base, authenticatedUserId: "same-role-not-assigned" }),
        ).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, actorUnit: "wrong-unit" })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, actorRole: "wrong-role" })).toBe(false);
        for (const role of ["admin", "registrar_general", "dean"]) {
          expect(
            canActOnB1RuntimeStep({ ...base, authenticatedUserId: role, actorRole: role }),
          ).toBe(false);
        }
        expect(canActOnB1RuntimeStep({ ...base, authenticatedUserId: null })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, stepStatus: "pending" })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, stepStatus: "inactive" })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, stepStatus: "completed" })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, actionRequestId: "request-b" })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, predecessorComplete: false })).toBe(false);
        expect(canActOnB1RuntimeStep({ ...base, attemptedAction: "wrong-action" })).toBe(false);
      });
    }
  }

  it("pins B1 database authorization to active steps with exactly one direct assignee", () => {
    expect(actorSql).toContain("v_step.status IS DISTINCT FROM 'active'");
    expect(actorSql).toContain("num_nonnulls(");
    expect(actorSql).toContain("IS DISTINCT FROM 1");
    expect(actorSql).toContain("including admin/registrar/dean");
    expect(actorSql).toContain("current_user_has_exact_processing_binding(");
    expect(actorSql).toContain("'enrollment_suspension'");
    expect(actorSql).toContain("'file_withdrawal'");
  });

  it("isolates source and target department heads", () => {
    const source = B1_WORKFLOWS.department_transfer.find(
      (step) => step.key === "source_department_head_approval",
    )!;
    const target = B1_WORKFLOWS.department_transfer.find(
      (step) => step.key === "target_department_head_approval",
    )!;
    const common = {
      authenticatedUserId: "source-head",
      assignedUserId: "source-head",
      actorUnit: "department",
      actorRole: "department_head",
      attemptedAction: "approve",
      stepStatus: "active",
      stepRequestId: "r",
      actionRequestId: "r",
      predecessorComplete: true,
    };
    expect(
      canActOnB1RuntimeStep({
        ...common,
        step: source,
        actorDepartmentId: "source",
        requiredDepartmentId: "source",
      }),
    ).toBe(true);
    expect(
      canActOnB1RuntimeStep({
        ...common,
        step: target,
        actorDepartmentId: "source",
        requiredDepartmentId: "target",
      }),
    ).toBe(false);
    expect(transferScopeSql).toContain("current_user_matches_transfer_department_scope(");
    expect(transferScopeSql).toMatch(/rpa\.department_id\s*=\s*d\.current_department_id/);
    expect(transferScopeSql).toMatch(/rpa\.department_id\s*=\s*d\.requested_department_id/);
    expect(transferScopeSql).not.toMatch(/fp\.department_id\s*=\s*d\.(?:current|requested)_department_id/);
  });

  it("keeps attachment download direct-active-assignee only", () => {
    expect(attachmentSql).toContain("s.status='active'");
    expect(attachmentSql).toContain("ELSE false END");
    expect(attachmentSql).toContain("ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED");
    expect(attachmentSql).toContain("current_user_has_exact_processing_binding");
    expect(attachmentSql).not.toContain("secure_attachment_owner_select");
    expect(attachmentSql).not.toContain("secure_attachment_direct_assignee_select");
  });

  it("keeps payment external and exact-finance-assignee only", () => {
    expect(B1_FEE_POLICIES.department_transfer).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(B1_FEE_POLICIES.final_chance).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(paymentSql).toContain("EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(paymentSql).toContain("DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(paymentSql).toContain("EXACT_FINANCE_PROCESSING_BINDING_REQUIRED");
    expect(paymentSql).not.toMatch(
      /fee_type\.code|\bamount\b|\bcurrency\b|invoice|gateway_transaction|internal_balance/i,
    );
  });

  it("keeps final_chance limited to the final exam chance", () => {
    expect(isFinalChanceTypeForWrite("final_chance")).toBe(true);
    for (const value of ["grade_recovery", "additional_chance", "additional_exam"]) {
      expect(isFinalChanceTypeForWrite(value)).toBe(false);
    }
  });
});
