import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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
    expect(content).toContain("20260801021541");
    expect(content).toContain("PINNED");
    expect(content).toContain("execution_authorized = false");
    expect(content).toContain("enrollment_certificate");
    expect(content).toContain("PASS_OPERATOR_PREFLIGHT_PACK_READY");
  });

  it("validates negative matrix execution plan specifications", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-NEGATIVE-MATRIX-EXECUTION-PLAN-27.md"),
      "utf8",
    );
    expect(content).toContain("267 Executable");
    expect(content).toContain("0 Blocked");
    expect(content).toContain("UNAUTHORIZED_STEP_ACTION");
    expect(content).toContain("STEP_ACTION_NOT_ALLOWED");
    expect(content).toContain("fingerprint");
    expect(content).toContain("20260801021541");
    expect(content.toLowerCase()).toContain("zero-mutation");
    expect(content).toContain("PASS_NEGATIVE_MATRIX_EXECUTION_PLAN_READY");
  });

  it("validates positive authorization matrix specifications with authoritative identities", () => {
    const content = readFileSync(
      join(root, "docs/B1-FIRST-DELIVERY-POSITIVE-AUTHORIZATION-MATRIX-27.md"),
      "utf8",
    );
    expect(content).toContain("19");
    expect(content).toContain("SR-20260727-88D885F0");
    expect(content).toContain("SR-20260727-50BEDCE2");
    expect(content).toContain("SR-20260727-695EC35B");
    expect(content).toContain("SR-20260727-42393846");
    expect(content).toContain("SR-20260727-3C550070");
    expect(content).toContain("department_head");
    expect(content).toContain("dean");
    expect(content).toContain("student_affairs_manager");
    expect(content).toContain("student_affairs_specialist");
    expect(content).toContain("library_officer");
    expect(content).toContain("labs_manager");
    expect(content).toContain("revenue_finance_officer");
    expect(content).toContain("registrar_general");
    expect(content).toContain("archive_officer");
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

  it("validates cleanup verification specifications matching Stage-3 SQL", () => {
    const content = readFileSync(join(root, "docs/B1-FIRST-DELIVERY-CLEANUP-VERIFICATION-27.md"), "utf8");
    expect(content).toContain("B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql");
    expect(content).toContain("37");
    expect(content).toContain("135");
    expect(content).toContain("157");
    expect(content).toContain("20");
    expect(content).toContain("848");
    expect(content).toContain("33");
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
    expect(content).toContain("d35612906b2d3ad4d059623b02e5862aa42ab9db");
    expect(content).toContain("20260801021541");
    expect(content).toContain("SOURCE-ONLY");
  });

  describe("Phase C Contract Drift Guards", () => {
    it("asserts matrix totals in manifest match 267 defined / 267 executable / 0 blocked", () => {
      const manifest = JSON.parse(
        readFileSync(join(root, "scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json"), "utf8"),
      );
      expect(manifest.matrix.negative_total).toBe(267);
      expect(manifest.matrix.executable_negative_total).toBe(267);
      expect(manifest.matrix.blocked_negative_total).toBe(0);
    });

    it("asserts migration head in manifest and baseline is 20260801021541", () => {
      const manifest = JSON.parse(
        readFileSync(join(root, "scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json"), "utf8"),
      );
      const baseline = JSON.parse(
        readFileSync(
          join(root, "scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json"),
          "utf8",
        ),
      );
      expect(manifest.authoritative_baseline.migration_head).toBe("20260801021541");
      expect(baseline.migration_head).toBe("20260801021541");
    });

    it("asserts baseline authorization is strictly false in baseline artifact and manifest", () => {
      const manifest = JSON.parse(
        readFileSync(join(root, "scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json"), "utf8"),
      );
      const baseline = JSON.parse(
        readFileSync(
          join(root, "scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json"),
          "utf8",
        ),
      );
      expect(baseline.execution_authorized).toBe(false);
      expect(manifest.authoritative_baseline.execution_authorized).toBe(false);
    });

    it("asserts execution authorization artifact is status NOT_GRANTED and false", () => {
      const auth = JSON.parse(
        readFileSync(
          join(root, "scripts/b1-rpc-principal-harness-01/authorization/EXECUTION-AUTHORIZATION.json"),
          "utf8",
        ),
      );
      expect(auth.status).toBe("NOT_GRANTED");
      expect(auth.execution_authorized).toBe(false);
    });

    it("fails if any synthetic positive identity or imaginary CLI flag appears in docs", () => {
      const FORBIDDEN_TOKENS = [
        "STEP-TRANSFER-01-SRC",
        "head_dept_src",
        "approve_source_dept",
        "--authorize-execution",
      ];
      for (const docRel of DELIVERABLE_DOCS) {
        const content = readFileSync(join(root, docRel), "utf8");
        for (const token of FORBIDDEN_TOKENS) {
          expect(content).not.toContain(token);
        }
      }
    });

    it("asserts cleanup SQL inventory matches Stage-3 SQL script", () => {
      const cleanupSql = readFileSync(join(root, "docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql"), "utf8");
      expect(cleanupSql).toContain("PRECHECK_CANDIDATE_COUNT % <> 37");
      expect(cleanupSql).toContain("PRECHECK_STEPS % <> 135");
      expect(cleanupSql).toContain("PRECHECK_EVENTS % <> 157");
      expect(cleanupSql).toContain("PRECHECK_ATTACHMENTS % <> 20");
      expect(cleanupSql).toContain("POSTCHECK_TOTAL_PROFILES % <> 848");
      expect(cleanupSql).toContain("POSTCHECK_TOTAL_REQUESTS % <> 33");
    });
  });
});
