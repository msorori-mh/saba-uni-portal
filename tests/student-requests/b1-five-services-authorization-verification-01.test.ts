import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "tests", "b1-five-services-authorization");
const matrix = JSON.parse(readFileSync(join(dir, "authorization-matrix.json"), "utf8"));
const harness = readFileSync(join(dir, "rpc-authorization-harness.sql"), "utf8");
const fixtures = readFileSync(
  join(root, "scripts", "b1-safe-rpc-matrix-harness-01", "01-runtime-matrix.sql"),
  "utf8",
);
const runner = readFileSync(join(dir, "run-full-matrix.ps1"), "utf8");
const payment = readFileSync(
  join(root, "supabase", "migrations", "20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("PORTAL-B1-FIVE-SERVICES-AUTHORIZATION-AND-VERIFICATION-01", () => {
  it("pins all five services and all 24 staff steps", () => {
    expect(matrix.services.map((x: { code: string }) => x.code).sort()).toEqual([
      "department_transfer", "enrollment_suspension", "excused_absence",
      "file_withdrawal", "final_chance",
    ]);
    expect(matrix.services.flatMap((x: { steps: unknown[] }) => x.steps)).toHaveLength(24);
    for (const service of matrix.services) {
      for (const [step, unit, role, action] of service.steps) {
        expect(fixtures).toContain(
          `('${service.code}','${step}','${unit}','${role}','${action}')`,
        );
      }
    }
  });

  it("pins the complete negative authorization universe", () => {
    expect(matrix.negative_cases).toHaveLength(22);
    for (const scenario of matrix.negative_cases) {
      expect(harness).toContain(`'${scenario}'`);
    }
    expect(matrix.negative_cases).toContain("unassigned_admin");
    expect(matrix.negative_cases).toContain("registrar_outside_step");
    expect(matrix.negative_cases).toContain("dean_outside_step");
  });

  it("uses an authenticated transaction with JWT claims and unconditional rollback", () => {
    expect(runner).toContain('$combined = "BEGIN;');
    expect(harness).toContain("SET LOCAL ROLE authenticated;");
    expect(harness).toContain("'request.jwt.claims'");
    expect(harness.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(harness).toContain("B1_LOCAL_RPC_HARNESS_PREREQUISITE_MISSING");
  });

  it("bootstraps auth matrix on SEQ07-B→24 with no original SEQ07 apply", () => {
    expect(runner).toContain("local-seq07b-through-24.ps1");
    expect(runner).toContain("Invoke-B1Seq07bThrough24Chain");
    expect(runner).toContain("Invoke-B1F1F2HardeningLocalOnly");
    expect(runner).toContain("ORIGINAL_SEQ07_ABSENT=PASS");
    expect(runner).toContain("AUTH_MATRIX_SAME_DELIVERY_CHAIN=PASS");
    expect(runner).toContain("GATE25=SKIPPED_AUTH_MATRIX_NOT_ACTIVATION");
    expect(runner).not.toMatch(
      /Invoke-B1DockerPsqlFile[\s\S]{0,180}20260725110000_b1_07_secure_attachments_source_01/,
    );
    expect(runner).not.toMatch(
      /Invoke-PsqlFile[\s\S]{0,180}20260725110000_b1_07_secure_attachments_source_01/,
    );
  });

  it("requires zero mutation across every protected surface", () => {
    for (const relation of matrix.zero_mutation_relations) {
      const aliases: Record<string, string> = {
        student_requests: "student_requests",
        student_request_workflow_steps: "student_request_workflow_steps",
        student_request_workflow_events: "student_request_workflow_events",
        service_details: "'details'",
        student_request_attachment_uploads: "student_request_attachment_uploads",
        revenue_confirmation: "'revenue'",
        audit_logs: "audit_logs",
        notifications: "notifications",
      };
      expect(harness).toContain(aliases[relation]);
    }
    expect(harness).toContain("after_j IS DISTINCT FROM before_j");
    for (const id of matrix.protected_records) expect(harness).toContain(id);
  });

  it("freezes simplified confirm_payment to step id and optional note", () => {
    expect(payment).toContain(
      "record_external_university_payment_confirmation(\n  p_step_id uuid,\n  p_note text DEFAULT NULL",
    );
    expect(payment).toContain("v_uid uuid := auth.uid()");
    expect(payment).toContain("completed_at = now()");
    expect(payment).not.toMatch(
      /\m(amount|currency|invoice|gateway_transaction|payment_reference|internal_balance)\M/i,
    );
    expect(payment).not.toContain("payment_not_confirmed");
    expect(payment).toContain("DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(payment).toContain("EXACT_FINANCE_PROCESSING_BINDING_REQUIRED");
  });

  it("is merge-ready for PR #219 without claiming its absent source exists", () => {
    const freeze = join(root, "docs", "B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md");
    const promoted = join(
      root, "supabase", "migrations", "20260725111100_b1_18_detail_acl_cutover_06.sql",
    );
    if (existsSync(freeze) || existsSync(promoted)) {
      expect(existsSync(freeze)).toBe(true);
      expect(existsSync(promoted)).toBe(true);
      const contract = readFileSync(freeze, "utf8");
      expect(contract).toContain("record_external_university_payment_confirmation(uuid, text");
      expect(contract).toContain("No amount/currency/invoice/gateway");
    } else {
      expect(harness).toContain("B1_PR219_RPC_CONTRACT_NOT_INSTALLED");
    }
  });

  it("pins private attachment authorization and server-side validation contracts", () => {
    const source = readFileSync(
      join(root, "docs", "migration-drafts", "STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql"),
      "utf8",
    );
    expect(source).toContain("public=false");
    expect(source).not.toMatch(/getPublicUrl|publicUrl|public_url/i);
    expect(source).toContain("ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED");
    expect(source).toContain("ATTACHMENT_REQUEST_NOT_OWNED");
    expect(source).toContain("ATTACHMENT_MIME_NOT_ALLOWED");
    expect(source).toContain("ATTACHMENT_SIZE_EXCEEDED");
    expect(source).toContain("ATTACHMENT_OBJECT_MISMATCH");
    expect(source).toMatch(/storage_object_path[\s\S]*auth\.uid\(\)/);
  });
});
