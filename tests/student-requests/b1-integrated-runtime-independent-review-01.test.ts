import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("PR232 independent runtime E2E security review", () => {
  test("department-chair authorization requires one exact active position assignment and department", () => {
    const sql = read(
      "docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql",
    );

    for (const required of [
      "auth.uid() IS NOT NULL",
      "count(*) = 1",
      "s.assigned_position_assignment_id",
      "pa.user_id = auth.uid()",
      "pa.is_active",
      "rpa.position_assignment_id = pa.id",
      "rpa.unit_id = s.processing_unit_id",
      "rpa.role_id = s.processing_role_id",
      "rpa.department_id = d.current_department_id",
      "rpa.department_id = d.requested_department_id",
      "s.assigned_user_id IS NULL",
      "s.assigned_staff_profile_id IS NULL",
      "s.assigned_faculty_profile_id IS NULL",
    ]) {
      expect(sql).toContain(required);
    }
    expect(sql).not.toMatch(/\b(admin|registrar|dean)\b/i);
    expect(sql).not.toMatch(/JOIN public\.faculty_profiles/i);
  });

  test("wrong source and target department probes are zero-mutation guarded", () => {
    const lifecycle = read("tests/b1-integrated-runtime/pg/40-lifecycle-five-services.sql");
    const helpers = read("tests/b1-integrated-runtime/pg/10-e2e-helpers.sql");

    expect(lifecycle).toContain("source_scope_wrong_department");
    expect(lifecycle).toContain("target_scope_wrong_department");
    expect(lifecycle.match(/source_scope_wrong_department/g)).toHaveLength(1);
    expect(lifecycle.match(/target_scope_wrong_department/g)).toHaveLength(1);
    expect(helpers).toContain("v_before = v_after");
    for (const protectedSurface of [
      "'updated_at'",
      "'form_data'",
      "'steps'",
      "'events'",
      "'attachments'",
      "'processing_assignments_total'",
      "'suspension_detail'",
      "'absence_detail'",
      "'transfer_detail'",
      "'final_chance_detail'",
      "'withdrawal_detail'",
    ]) {
      expect(helpers).toContain(protectedSurface);
    }
  });

  test("withdrawal acknowledgment rejects missing, JSON null, and false using SQL-safe semantics", () => {
    const remediation = read(
      "docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql",
    );
    const functionBody = remediation.slice(remediation.indexOf("CREATE OR REPLACE FUNCTION"));
    const lifecycle = read("tests/b1-integrated-runtime/pg/40-lifecycle-five-services.sql");

    expect(functionBody).toMatch(/impact_acknowledgment'\s+IS DISTINCT FROM\s+'true'::jsonb/i);
    expect(functionBody).not.toMatch(/impact_acknowledgment'\s*<>\s*'true'::jsonb/i);
    expect(lifecycle).toContain("submit_without_ack");
    expect(lifecycle).toContain("submit_null_ack");
    expect(lifecycle).toContain("submit_false_ack");
    expect(lifecycle).toContain("'impact_acknowledgment', true");
  });

  test(
    "production sequence 21-24 and gate 25 are unique, contiguous, and hash-correct",
    () => {
      const applyOrder = read("tests/b1-rpc-matrix/pg/20-draft-apply-order.txt");
      const entries = [...applyOrder.matchAll(/^(\d{2})\s+(\S+)\s+# blob\s+([0-9a-f]{40})$/gm)].map(
        ([, sequence, path, pin]) => ({ sequence: Number(sequence), path, pin }),
      );
      const sequences = entries.map(({ sequence }) => sequence);

      expect(new Set(sequences).size).toBe(entries.length);
      expect(sequences).toEqual([...Array.from({ length: 24 }, (_, index) => index + 1), 90]);
      expect(entries[20]?.path).toContain("SECURE-READ-CONTRACTS");
      expect(entries[21]?.path).toContain("SECURE-DRAFT-MUTATIONS");
      expect(entries[22]?.path).toContain("POSITION-ASSIGNMENT");
      expect(entries[23]?.path).toContain("IMPACT-ACK-NULL-GUARD");
      expect(entries[24]?.path).toContain("ACTOR-ACTION-ASSIGNMENT-HARDENING");

      const actualPins = entries.map(({ path }) =>
        execFileSync("git", ["hash-object", "--", join(root, path)], {
          encoding: "utf8",
          timeout: 15_000,
        }).trim(),
      );
      expect(actualPins).toEqual(entries.map(({ pin }) => pin));

      const runner = read("tests/b1-integrated-runtime/pg/run-harness.ps1");
      expect(runner).not.toContain("Invoke-PsqlFile $readPath");
      expect(runner).toContain("secure-draft applied before secure-read in apply-order");

      const manifest = JSON.parse(read("docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json")) as {
        global_policies: { activation_gate: string };
        migrations: Array<{ sequence_order: number }>;
      };
      expect(manifest.global_policies.activation_gate).toMatch(/gate 25/);
      expect(manifest.migrations.map(({ sequence_order }) => sequence_order)).toEqual(
        Array.from({ length: 24 }, (_, index) => index + 1),
      );
    },
    { timeout: 30_000 },
  );

  test("five-service completion and enrollment-certificate regression remain hard gates", () => {
    const runner = read("tests/b1-integrated-runtime/pg/run-harness.ps1");
    const summary = read("tests/b1-integrated-runtime/pg/70-summarize.sql");
    const regression = read(
      "tests/b1-integrated-runtime/pg/60-enrollment-certificate-regression.sql",
    );

    expect(runner).toContain("[int]$completed -ne 5");
    expect(runner).toContain("FAIL_COUNT");
    expect(summary).toContain("services_completed");
    expect(regression).toContain("submit_student_request(uuid)");
    expect(regression).toContain("no_new_certificate_grant_surface");
    expect(regression).toContain("certificate_workflow_not_activated_here");
  });
});
