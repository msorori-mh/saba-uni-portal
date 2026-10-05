import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_FEE_POLICIES,
  B1_WORKFLOWS,
  EXCUSED_ABSENCE_LEGACY_FREE_WORKFLOW,
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

const excusedAbsenceWorkflowSql = readFileSync(
  join(
    process.cwd(),
    "docs",
    "migration-drafts",
    "EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql",
  ),
  "utf8",
);

/**
 * Where the database pins the exact (step, unit, role, action) contract.
 * - Four services: the hard-coded legacy contract in the applied actor
 *   authorization migration.
 * - excused_absence (paid signature cycle): the new workflow definition, whose
 *   steps are pinned into b1_workflow_runtime_contract_snapshot by the same draft.
 */
function expectDatabaseContractPin(
  service: string,
  step: { key: string; unit: string; role: string; action: string },
) {
  if (service !== "excused_absence") {
    expect(actorSql).toContain(
      `('${service}','${step.key}','${step.unit}','${step.role}','${step.action}')`,
    );
    return;
  }
  expect(excusedAbsenceWorkflowSql).toContain(
    `'key','${step.key}',`,
  );
  const declaration = excusedAbsenceWorkflowSql
    .split("\n")
    .find((line) => line.includes(`jsonb_build_object('key','${step.key}',`));
  expect(declaration, `${step.key} declared in the workflow draft`).toBeDefined();
  expect(declaration!).toContain(
    `'unit','${step.unit}','role','${step.role}','action','${step.action}',`,
  );
}

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
        expectDatabaseContractPin(service, step);
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

  it("keeps the retired free absence cycle pinned for in-flight requests", () => {
    for (const step of EXCUSED_ABSENCE_LEGACY_FREE_WORKFLOW) {
      expect(actorSql).toContain(
        `('excused_absence','${step.key}','${step.unit}','${step.role}','${step.action}')`,
      );
    }
  });

  it("denies every other workflow role on each excused-absence step", () => {
    const steps = B1_WORKFLOWS.excused_absence;
    const allRoles = [
      ...new Map(
        [
          ...steps.map((s) => [`${s.unit}/${s.role}`, { unit: s.unit, role: s.role }] as const),
          ["student_affairs/student_affairs_specialist", { unit: "student_affairs", role: "student_affairs_specialist" }] as const,
          ["library/library_officer", { unit: "library", role: "library_officer" }] as const,
          ["labs/labs_manager", { unit: "labs", role: "labs_manager" }] as const,
          ["admin/admin", { unit: "admin", role: "admin" }] as const,
        ],
      ).values(),
    ];
    for (const step of steps) {
      const departmentId = step.role === "department_head" ? "student-dept" : null;
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
        actorDepartmentId: departmentId,
        requiredDepartmentId: departmentId,
      };
      expect(canActOnB1RuntimeStep(base), `${step.key} allow`).toBe(true);
      for (const other of allRoles) {
        if (other.unit === step.unit && other.role === step.role) continue;
        // a different role holder, authenticated as someone else
        expect(
          canActOnB1RuntimeStep({
            ...base,
            authenticatedUserId: `holder-of-${other.role}`,
            actorUnit: other.unit,
            actorRole: other.role,
          }),
          `${step.key} deny ${other.unit}/${other.role}`,
        ).toBe(false);
        // even when (wrongly) recorded as the assignee, unit/role must match the step
        expect(
          canActOnB1RuntimeStep({ ...base, actorUnit: other.unit, actorRole: other.role }),
          `${step.key} deny mismatched binding ${other.unit}/${other.role}`,
        ).toBe(false);
      }
      // the same role holder is denied when not the direct assignee (no role-pool fallback)
      expect(canActOnB1RuntimeStep({ ...base, authenticatedUserId: "same-role-other-person" })).toBe(false);
      // every other configured action of this cycle is illegal on this step
      for (const action of ["review", "approve", "confirm_payment", "apply_decision", "archive", "sign", "reject", "return"]) {
        if (action === step.action) continue;
        expect(canActOnB1RuntimeStep({ ...base, attemptedAction: action }), `${step.key} deny ${action}`).toBe(false);
      }
    }
    // the dean and the registrar each own two steps; holding the role never unlocks the other step early
    const deanReview = steps.find((s) => s.key === "dean_review")!;
    expect(
      canActOnB1RuntimeStep({
        step: deanReview,
        authenticatedUserId: "dean",
        assignedUserId: "dean",
        actorUnit: "dean",
        actorRole: "dean",
        attemptedAction: "approve",
        stepStatus: "active",
        stepRequestId: "r",
        actionRequestId: "r",
        predecessorComplete: true,
      }),
    ).toBe(false);
  });

  it("scopes the excused-absence department-head signature to the student's department", () => {
    const step = B1_WORKFLOWS.excused_absence.find((s) => s.key === "department_head_signature")!;
    const common = {
      step,
      authenticatedUserId: "head-cs",
      assignedUserId: "head-cs",
      actorUnit: "department",
      actorRole: "department_head",
      attemptedAction: "approve",
      stepStatus: "active",
      stepRequestId: "r",
      actionRequestId: "r",
      predecessorComplete: true,
    };
    expect(canActOnB1RuntimeStep({ ...common, actorDepartmentId: "cs", requiredDepartmentId: "cs" })).toBe(true);
    expect(canActOnB1RuntimeStep({ ...common, actorDepartmentId: "is", requiredDepartmentId: "cs" })).toBe(false);
    expect(canActOnB1RuntimeStep({ ...common, actorDepartmentId: "cs", requiredDepartmentId: null })).toBe(false);
    expect(canActOnB1RuntimeStep({ ...common, actorDepartmentId: null, requiredDepartmentId: "cs" })).toBe(false);
    // database side: scope resolved from the student's profile at init, at activation and on resubmit
    expect(excusedAbsenceWorkflowSql).toContain("public.b1_excused_absence_student_department(p_request_id)");
    expect(excusedAbsenceWorkflowSql).toContain("JOIN public.student_profiles sp ON sp.id = r.student_profile_id");
    expect(excusedAbsenceWorkflowSql).toContain("EAWF01:init-student-department-scope");
    expect(excusedAbsenceWorkflowSql).toContain("EAWF01:activation-student-department-scope");
    expect(excusedAbsenceWorkflowSql).toContain("EAWF01:resubmit-student-department-scope");
    expect(excusedAbsenceWorkflowSql).toContain("B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED");
    expect(excusedAbsenceWorkflowSql).toContain("B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED");
  });

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
    expect(B1_FEE_POLICIES.excused_absence).toBe("REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT");
    // the fee decision carries no amount / currency either, and only FEE_REQUIRED reaches finance
    expect(excusedAbsenceWorkflowSql).toContain("CHECK (decision IN ('FEE_REQUIRED', 'FEE_NOT_REQUIRED'))");
    const feeTable = excusedAbsenceWorkflowSql.slice(
      excusedAbsenceWorkflowSql.indexOf("CREATE TABLE IF NOT EXISTS public.excused_absence_fee_decisions"),
      excusedAbsenceWorkflowSql.indexOf("COMMENT ON TABLE public.excused_absence_fee_decisions"),
    );
    expect(feeTable.length).toBeGreaterThan(200);
    expect(feeTable).not.toMatch(/amount|currency|price|balance|invoice|receipt|numeric|money/i);
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
