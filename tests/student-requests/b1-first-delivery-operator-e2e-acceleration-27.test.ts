import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const FIVE_SERVICES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

const PROTECTED_RECORDS = [
  "SR-20260716-26BAD4C8",
  "SR-20260715-FEDCB3E1",
  "SR-20260713-2DE64041",
  "USR-2026-000001",
  "USR-2026-000002",
] as const;

const DELIVERABLE_DOCS = [
  "docs/B1-FIRST-DELIVERY-OPERATOR-PREFLIGHT-PACK-27.md",
  "docs/B1-FIRST-DELIVERY-NEGATIVE-MATRIX-EXECUTION-PLAN-27.md",
  "docs/B1-FIRST-DELIVERY-POSITIVE-AUTHORIZATION-MATRIX-27.md",
  "docs/B1-FIRST-DELIVERY-FIVE-SERVICES-E2E-PLAN-27.md",
  "docs/B1-FIRST-DELIVERY-POST-EXECUTION-VERIFIER-27.md",
  "docs/B1-FIRST-DELIVERY-ENROLLMENT-CERTIFICATE-REGRESSION-27.md",
  "docs/B1-FIRST-DELIVERY-CLEANUP-VERIFICATION-27.md",
  "docs/B1-FIRST-DELIVERY-LAUNCH-READINESS-27.md",
  "docs/B1-FIRST-DELIVERY-OPERATOR-E2E-ACCELERATION-27-REPORT.md",
] as const;

describe("PORTAL-B1-FIRST-DELIVERY-OPERATOR-E2E-ACCELERATION-PACK-27 verification", () => {
  it("verifies all 9 pack-27 deliverable documents exist and contain required assertions", () => {
    for (const docRel of DELIVERABLE_DOCS) {
      const fullPath = join(root, docRel);
      expect(existsSync(fullPath)).toBe(true);
      const content = readFileSync(fullPath, "utf8");

      // Verify basic structure & non-emptiness
      expect(content.length).toBeGreaterThan(500);

      // Verify strictly forbidden constraints are noted
      expect(content.toUpperCase()).toContain("SOURCE-ONLY");
      for (const service of FIVE_SERVICES) {
        expect(content).toContain(service);
      }
    }
  });

  it("validates operator preflight package specifications", () => {
    const content = readFileSync(join(root, "docs/B1-FIRST-DELIVERY-OPERATOR-PREFLIGHT-PACK-27.md"), "utf8");
    expect(content).toContain("267");
    expect(content).toContain("19");
    expect(content).toContain("104");
    expect(content).toContain("28/28");
    expect(content).toContain("PINNED");
    expect(content).toContain("execution_authorized");
    expect(content).toContain("enrollment_certificate");
    expect(content).toContain("PASS_OPERATOR_PREFLIGHT_PACK_READY");
  });

  it("validates negative matrix execution plan specifications", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-NEGATIVE-MATRIX-EXECUTION-PLAN-27.md"),
      "utf8",
    );
    expect(content).toContain("267");
    expect(content).toContain("UNAUTHORIZED_STEP_ACTION");
    expect(content).toContain("STEP_ACTION_NOT_ALLOWED");
    expect(content).toContain("fingerprint");
    expect(content.toLowerCase()).toContain("zero-mutation");
    expect(content).toContain("PASS_NEGATIVE_MATRIX_EXECUTION_PLAN_READY");
  });

  it("validates positive authorization matrix specifications", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-POSITIVE-AUTHORIZATION-MATRIX-27.md"),
      "utf8",
    );
    expect(content).toContain("19");
    expect(content).toContain("head_dept_src");
    expect(content).toContain("head_dept_tgt");
    expect(content).toContain("dean_faculty");
    expect(content).toContain("manager_student_affairs");
    expect(content).toContain("officer_library");
    expect(content).toContain("officer_labs");
    expect(content).toContain("officer_activities");
    expect(content).toContain("central_registrar");
    expect(content).toContain("PASS_POSITIVE_AUTHORIZATION_MATRIX_READY");
  });

  it("validates five-services E2E plan specifications", () => {
    const content = readFileSync(join(root, "docs/B1-FIRST-DELIVERY-FIVE-SERVICES-E2E-PLAN-27.md"), "utf8");
    for (const service of FIVE_SERVICES) {
      expect(content).toContain(service);
    }
    expect(content).toContain("Arabic UI");
    expect(content).toContain("idempotency");
    expect(content).toContain("PASS_FIVE_SERVICES_E2E_PLAN_READY");
  });

  it("validates post-execution verifier specifications", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-POST-EXECUTION-VERIFIER-27.md"),
      "utf8",
    );
    expect(content).toContain("read-only");
    expect(content.toLowerCase()).toContain("drift");
    expect(content).toContain("enrollment_certificate");
    expect(content).toContain("PASS_POST_EXECUTION_VERIFIER_READY");
  });

  it("validates enrollment_certificate regression specifications", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-ENROLLMENT-CERTIFICATE-REGRESSION-27.md"),
      "utf8",
    );
    expect(content).toContain("enrollment_certificate");
    for (const record of PROTECTED_RECORDS) {
      expect(content).toContain(record);
    }
    expect(content).toContain("PASS_ENROLLMENT_CERTIFICATE_REGRESSION_READY");
  });

  it("validates cleanup verification specifications", () => {
    const content = readFileSync(join(root, "docs/B1-FIRST-DELIVERY-CLEANUP-VERIFICATION-27.md"), "utf8");
    expect(content).toContain("B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql");
    expect(content).toContain("protected");
    expect(content).toContain("PASS_CLEANUP_VERIFICATION_READY");
  });

  it("validates launch readiness specifications", () => {
    const content = readFileSync(join(root, "docs/B1-FIRST-DELIVERY-LAUNCH-READINESS-27.md"), "utf8");
    expect(content).toContain("student_visible");
    expect(content).toContain("RTL");
    expect(content.toLowerCase()).toContain("mobile");
    expect(content).toContain("rollback");
    expect(content).toContain("PASS_LAUNCH_READINESS_READY");
  });

  it("validates master report final decision format", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-OPERATOR-E2E-ACCELERATION-27-REPORT.md"),
      "utf8",
    );
    expect(content).toContain(
      "PASS_B1_FIRST_DELIVERY_OPERATOR_E2E_ACCELERATION_PACKAGE_READY_FOR_INDEPENDENT_REVIEW",
    );
    expect(content).toContain("87449f85b95d927436e7607ae3c2b6a73245eb0d");
    expect(content).toContain("SOURCE-ONLY");
  });
});
