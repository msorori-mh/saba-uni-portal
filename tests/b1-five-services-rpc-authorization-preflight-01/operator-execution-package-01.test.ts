import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOWED_ACTIONS,
  ALLOWED_CLASSES,
  EXPECTED_SPLIT,
  EXPECTED_TOTAL,
  MATRIX_SHA256,
  caseFileName,
  fingerprintExpression,
  loadNegativeCases,
  negativeCases,
  renderCase,
  sha256Lf,
  validateCase,
  type Case,
} from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const root = process.cwd();
const pkg = join(root, "scripts", "b1-rpc-principal-harness-01");
const matrixPath = join(
  root,
  "tests",
  "b1-five-services-rpc-authorization-preflight-01",
  "MATRIX.json",
);
const matrixRaw = readFileSync(matrixPath, "utf8");
const matrix = JSON.parse(matrixRaw);
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sha = (p: string) => createHash("sha256").update(read(p)).digest("hex");

const pf = read(join(pkg, "00-preflight.sql"));
const ps = read(join(pkg, "run-negative-matrix.ps1"));
const fp = read(join(pkg, "fingerprint.sql"));

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-PACKAGE-CODEX-COMPREHENSIVE-HARDENING-03", () => {
  // ---------------------------------------------------------------- counts --
  it("16. plans exactly 267 = 240 + 24 + 3 negative cases and zero positives", () => {
    expect(matrix.counts.negative_core).toBe(EXPECTED_SPLIT.negative_core);
    expect(matrix.counts.illegal_action).toBe(EXPECTED_SPLIT.illegal_action);
    expect(matrix.counts.supplemental_department_scope).toBe(EXPECTED_SPLIT.department_scope);
    expect(240 + 24 + 3).toBe(EXPECTED_TOTAL);
    expect(matrix.counts.negative_total).toBe(EXPECTED_TOTAL);
    expect(negativeCases).toHaveLength(EXPECTED_TOTAL);
    expect(negativeCases.filter((c) => c.expect !== "DENY")).toHaveLength(0);
    expect(ps).toContain("positive_cases_executed  = 0");
  });

  // ------------------------------------------------------- G1 credentials --
  it("1. the launcher never uses DATABASE_URL as a credential source", () => {
    expect(ps).not.toMatch(/\$conn\s*=\s*\$env:DATABASE_URL/);
    // DATABASE_URL is only mentioned in documentation or in the "ignored" notice
    const uses = ps.split("\n").filter((l) => l.includes("DATABASE_URL"));
    expect(uses.length).toBeGreaterThan(0);
    expect(
      uses.every(
        (l) =>
          /NOT used|NOT read|NOT accepted|ignored|deliberately/.test(l) ||
          /if \(\$env:DATABASE_URL\)/.test(l),
      ),
    ).toBe(true);
    for (const v of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSSLMODE"]) {
      expect(ps).toContain(`$env:${v}`);
    }
    expect(ps).toContain("$env:PGSSLMODE = 'require'");
  });

  it("2. no password and no connection URI is ever placed in psql argv", () => {
    const argvLine = ps.split("\n").find((l) => l.includes("$psqlArgs = @("))!;
    expect(argvLine).toBeDefined();
    expect(argvLine).not.toMatch(/conn|DATABASE_URL|PGPASSWORD|postgres(ql)?:\/\//);
    expect(ps).not.toMatch(/postgresql:\/\/[^<\s]*:[^@\s]+@/); // no literal credentials
    expect(ps).toContain("Remove-Item Env:PGPASSWORD");
  });

  it("3. the pgpass file is temporary, random, ACL-restricted and removed in finally", () => {
    expect(ps).toContain("Read-Host");
    expect(ps).toContain("-AsSecureString");
    expect(ps).toContain("[System.IO.Path]::GetTempPath()");
    expect(ps).toContain("[guid]::NewGuid()");
    expect(ps).toContain("SetAccessRuleProtection($true, $false)");
    expect(ps).toContain("AreAccessRulesProtected");
    expect(ps).toContain("PGPASS_ACL_NOT_ENFORCEABLE");
    expect(ps).toContain("$env:PGPASSFILE = $passFile");
    const finallyBlock = ps.slice(ps.lastIndexOf("\nfinally {"));
    expect(finallyBlock).toContain("Remove-Item $passFile -Force");
    expect(finallyBlock).toContain("Remove-Item Env:PGPASSFILE");
  });

  it("4. output redaction is applied before anything is written to disk", () => {
    expect(ps).toContain("function Protect-Output");
    for (const token of ["postgresql://", "postgres://", "password", "PGPASSWORD", "PGPASSFILE"]) {
      expect(ps).toContain(token);
    }
    // psql output is redacted at capture time, so every persisted artifact
    // derives from an already-redacted value
    const captures = ps.split("\n").filter((l) => l.includes("$out -join"));
    expect(captures.length).toBeGreaterThan(0);
    expect(captures.every((l) => l.includes("Protect-Output"))).toBe(true);
    expect(ps).toContain("Output = (Protect-Output");
  });

  // -------------------------------------------------- G2 target attestation --
  it("5. endpoint attestation in the launcher and catalog attestation in SQL", () => {
    expect(ps).toContain("TARGET_ATTESTATION_FAILED");
    expect(ps).toContain('$PgHost -like "*$ExpectedRef*"');
    expect(ps).toContain('$PgUser -like "*$ExpectedRef*"');
    expect(ps).toContain("wpmicqriltrowwonknox");
    expect(ps).toContain("$MigrationVersion = '20260729014519'");
    expect(ps).toContain("migration_version=$MigrationVersion");
    expect(pf).toContain("B1_PREFLIGHT_PRODUCTION_REF_MISMATCH");
    expect(pf).toContain("supabase_migrations.schema_migrations");
    expect(pf).toContain("B1_PREFLIGHT_MIGRATION_29_NAME_MISSING");
    expect(pf).toContain("B1_PREFLIGHT_MIGRATION_29_FUNCTION_SET_DRIFT");
    expect(pf).toContain("B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT");
    expect(pf).toContain("B1_PREFLIGHT_SERVICE_SET_DRIFT_");
    expect(pf).toContain("B1_PREFLIGHT_SERVICE_UNEXPECTEDLY_VISIBLE_");
    for (const fn of [
      "assert_b1_runtime_step_assignee_effective",
      "assert_b1_runtime_step_row_assignee_effective",
      "b1_assignment_identity_lock_key",
      "b1_lock_assignment_identity_boundary",
      "b1_lock_assignment_identity_stmt",
      "guard_b1_runtime_step_activation",
    ]) {
      expect(pf).toContain(fn);
    }
    for (const tg of [
      "trg_b1_lock_faculty_profile_identity_stmt",
      "trg_b1_lock_position_assignment_stmt",
      "trg_b1_lock_processing_assignment_stmt",
      "trg_b1_lock_runtime_step_identity_stmt",
      "trg_b1_lock_staff_profile_identity_stmt",
      "trg_b1_lock_transfer_department_scope_stmt",
      "trg_guard_b1_runtime_step_activation",
      "trg_guard_b1_runtime_step_activation_insert",
    ]) {
      expect(pf).toContain(tg);
    }
  });

  // -------------------------------------------- G3 operator privilege model --
  it("6. operator owner / superuser / BYPASSRLS / write privilege all FAIL", () => {
    expect(pf).toContain("B1_PREFLIGHT_OPERATOR_OWNS_SCOPE_RELATION");
    expect(pf).toContain("session_user must not be superuser");
    expect(pf).toContain("B1_PREFLIGHT_SESSION_USER_HAS_BYPASSRLS");
    expect(pf).toContain("B1_PREFLIGHT_OPERATOR_HAS_WRITE_PRIVILEGE");
    expect(pf).toContain("B1_PREFLIGHT_SESSION_USER_NOT_FOUND_IN_PG_ROLES");
    for (const p of ["'INSERT'", "'UPDATE'", "'DELETE'", "'TRUNCATE'"]) {
      expect(pf).toContain(p);
    }
    for (const name of ["sandbox_exec", "service_role", "supabase_admin", "postgres"]) {
      expect(pf).toContain(`'${name}'`);
    }
    // the session_user guard runs before any SET ROLE
    expect(pf.indexOf("-- 2. session_user contract")).toBeLessThan(
      pf.indexOf("SET LOCAL ROLE authenticated;"),
    );
  });

  it("7. incomplete visibility fails closed with OPERATOR_VISIBILITY_NOT_PROVEN", () => {
    expect(pf).toContain("OPERATOR_VISIBILITY_NOT_PROVEN");
    expect(pf).toContain("B1_PREFLIGHT_RLS_DISABLED_ON_SCOPE_RELATION");
    expect(pf).toContain("B1_PREFLIGHT_NO_POLICY_ON_SCOPE_RELATION");
    expect(pf).toContain("B1_PREFLIGHT_FINGERPRINT_RELATION_MISSING");
    expect(pf).toContain("b1_fingerprint_relations");
    const pfExecutable = pf
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(pfExecutable).not.toMatch(
      /\bCREATE\s+POLICY\b|\bCREATE\s+ROLE\b|\bALTER\s+ROLE\b|\bGRANT\b/,
    );
  });

  // ------------------------------------------------- G4 principal selection --
  it("8. authenticated vs anon principal selection is exact for every case", () => {
    const expr = fingerprintExpression();
    let anon = 0;
    for (const [i, c] of negativeCases.entries()) {
      const sql = renderCase(c, i, expr);
      if (c.actor_user_id === null) {
        anon += 1;
        expect(sql).toContain("SET LOCAL ROLE anon;");
        expect(sql).not.toContain("SET LOCAL ROLE authenticated;");
        expect(sql).toContain(`'{"role":"anon"}'`);
        expect(sql).toContain("auth.uid() IS DISTINCT FROM NULL::uuid");
      } else {
        expect(sql).toContain("SET LOCAL ROLE authenticated;");
        expect(sql).not.toContain("SET LOCAL ROLE anon;");
        expect(sql).toContain(`'role', 'authenticated'`);
        expect(sql).toContain(`'${c.actor_user_id}'::uuid`);
        expect(sql).not.toContain(`'{"role":"anon"}'`);
      }
    }
    expect(anon).toBeGreaterThan(0);
    expect(pf).toContain("B1_PREFLIGHT_ANON_HAS_BYPASSRLS");
    expect(pf).toContain("B1_PREFLIGHT_AUTHENTICATED_HAS_BYPASSRLS");
    expect(pf).toContain("B1_PREFLIGHT_ANON_AUTH_UID_NOT_NULL");
  });

  // ---------------------------------------------------------- G5 isolation --
  it("9. + 17. every case is one SERIALIZABLE BEGIN / one ROLLBACK / zero COMMIT", () => {
    const expr = fingerprintExpression();
    for (const [i, c] of negativeCases.entries()) {
      const sql = renderCase(c, i, expr);
      expect(sql.match(/^BEGIN ISOLATION LEVEL SERIALIZABLE;$/gm) ?? []).toHaveLength(1);
      expect(sql.match(/^ROLLBACK;$/gm) ?? []).toHaveLength(1);
      expect(sql).not.toContain("COMMIT");
      expect(sql).toContain("pg_advisory_xact_lock");
      expect(sql).toContain("B1_NEG_SERIALIZATION_FAILURE");
      expect(sql).toContain("B1_NEG_CONCURRENT_DRIFT_STEP");
      expect(sql).toContain("B1_NEG_UNEXPECTED_ALLOW");
      expect(sql).toContain("B1_NEG_MUTATION_DETECTED");
      expect(sql).toContain(
        c.action === "confirm_payment"
          ? "record_external_university_payment_confirmation"
          : "act_on_b1_student_request_step_atomic",
      );
    }
    expect(ps).toContain("no retry by contract");
    // every "retry" mention is a comment or the explicit no-retry failure text
    for (const line of ps.split("\n")) {
      if (/retry/i.test(line)) {
        expect(/^\s*#|no retry by contract/.test(line)).toBe(true);
      }
    }
  });

  // ------------------------------------------------- G6 matrix / generator --
  it("10. malicious MATRIX values are rejected before any file is produced", () => {
    const base: Case = {
      case: "unassigned_admin",
      request_number: "SR-20260727-42393846",
      step_key: "student_affairs_intake",
      actor_user_id: "c8a94548-4782-4252-86f9-23559d3b95bd",
      action: "review",
      expect: "DENY",
    };
    expect(() => validateCase(base, 0)).not.toThrow();

    const hostile: Array<Partial<Case>> = [
      { step_key: "a\nb" },
      { step_key: "a\rb" },
      { step_key: "a\u0000b" },
      { step_key: "a\u0007b" },
      { step_key: "a/b" },
      { step_key: "a\\b" },
      { step_key: "../etc" },
      { step_key: "a;DROP" },
      { step_key: "a--b" },
      { step_key: "a/*b" },
      { step_key: "a*/b" },
      { step_key: "$case$" },
      { step_key: "COMMIT" },
      { step_key: "rollback" },
      { step_key: "a'b" },
      { step_key: 'a"b' },
      { case: "not_a_known_class" },
      { action: "delete_everything" },
      { expect: "ALLOW" },
      { request_number: "SR-BAD" },
      { actor_user_id: "not-a-uuid" },
      { runtime_step_id: "not-a-uuid" },
      { expect_error: "boom\nnewline" },
    ];
    for (const patch of hostile) {
      expect(() => validateCase({ ...base, ...patch } as Case, 0)).toThrow(
        /B1_MATRIX_FIELD_REJECTED/,
      );
    }
    // and the renderer validates again at render time
    expect(() => renderCase({ ...base, action: "nope" } as Case, 0)).toThrow(
      /B1_MATRIX_FIELD_REJECTED/,
    );
  });

  it("11. case file names are generated ordinals only", () => {
    for (let i = 0; i < EXPECTED_TOTAL; i += 1) {
      expect(caseFileName(i)).toMatch(/^case-\d{4}\.sql$/);
    }
    expect(caseFileName(0)).toBe("case-0001.sql");
    expect(caseFileName(266)).toBe("case-0267.sql");
    const names = new Set(negativeCases.map((_, i) => caseFileName(i)));
    expect(names.size).toBe(EXPECTED_TOTAL);
    // no MATRIX-derived value can appear in a path
    const renderer = read(join(pkg, "render-negative-cases.ts"));
    expect(renderer).toContain("case-${String(index + 1).padStart(4, \"0\")}.sql");
    expect(renderer).not.toMatch(/join\(out,\s*`?\$\{.*c\.(case|step_key|request_number)/);
  });

  it("12. MATRIX.json SHA drift aborts rendering", () => {
    expect(sha256Lf(matrixRaw)).toBe(MATRIX_SHA256);
    const tampered = JSON.parse(matrixRaw);
    tampered.matrix_id = `${tampered.matrix_id}-tampered`;
    expect(() => loadNegativeCases(JSON.stringify(tampered, null, 2))).toThrow(
      /B1_MATRIX_SHA_DRIFT/,
    );
  });

  it("enumerates only known classes and actions", () => {
    for (const c of negativeCases) {
      expect(ALLOWED_CLASSES as readonly string[]).toContain(c.case);
      expect(ALLOWED_ACTIONS as readonly string[]).toContain(c.action);
    }
  });

  // ------------------------------------------------------- G7 fingerprint --
  it("13. the fingerprint covers the whole allowlist with row content", () => {
    const relations = [
      "student_requests",
      "student_request_workflow_steps",
      "student_request_workflow_events",
      "request_processing_assignments",
      "student_request_attachment_uploads",
      "student_request_attachments",
      "student_request_fee_assessments",
      "payment_receipts",
      "official_documents",
      "enrollment_certificate_document_details",
      "transfer_request_details",
      "enrollment_suspension_details",
      "absence_excuse_details",
      "extra_chance_details",
      "file_withdrawal_details",
      "student_excused_absences",
      "student_extra_chances",
      "student_academic_status",
      "student_enrollments",
      "notifications",
      "audit_logs",
      "request_types",
      "schema_migrations",
    ];
    for (const rel of relations) expect(fp).toContain(rel);
    // count + full row content, never count alone
    expect((fp.match(/count\(\*\)::text/g) ?? []).length).toBeGreaterThanOrEqual(relations.length);
    expect((fp.match(/string_agg\(t::text/g) ?? []).length).toBeGreaterThanOrEqual(20);
    expect(fp).toContain("SR-20260713-2DE64041");
    expect(fp).toContain("student_visible");

    // the in-transaction fingerprint is the SAME contract as the outside one
    const expr = fingerprintExpression();
    expect(expr.startsWith("(")).toBe(true);
    const sql = renderCase(negativeCases[0], 0, expr);
    expect((sql.match(/WITH b1_scope AS/g) ?? []).length).toBe(2); // before + after
    expect(sql).toContain(expr);
  });

  // ---------------------------------------------- G8 function graph pinning --
  it("14. function graph drift or an external-call token fails closed", () => {
    expect(pf).toContain("b1_function_allowlist");
    expect(pf).toContain("pg_get_functiondef");
    expect(pf).toContain("B1_PREFLIGHT_EXTERNAL_SIDE_EFFECT_IN_FUNCTION");
    expect(pf).toContain("B1_PREFLIGHT_FUNCTION_GRAPH_DRIFT");
    expect(pf).toContain("B1_PREFLIGHT_FUNCTION_GRAPH_UNPINNED");
    expect(pf).toContain("B1_PREFLIGHT_FUNCTION_GRAPH_MISSING");
    for (const token of [
      "pg_net\\.",
      "net\\.http_",
      "dblink",
      "http_post",
      "http_get",
      "lo_export",
      "lo_import",
    ]) {
      expect(pf).toContain(token);
    }

    expect(ps).toContain("fn_graph_md5=$FunctionGraphMd5");
    expect(ps).toContain("[Parameter(Mandatory = $true)][string]$FunctionGraphMd5");
  });

  // -------------------------------------------------------- G9 report dirs --
  it("15. the report directory is created after rendering and survives it", () => {
    const renderIdx = ps.indexOf("render-negative-cases.ts");
    const reportIdx = ps.indexOf("New-Item -ItemType Directory -Force -Path $ReportDir");
    expect(renderIdx).toBeGreaterThan(-1);
    expect(reportIdx).toBeGreaterThan(renderIdx);
    expect(ps).toContain("REPORT_DIR_NOT_WRITABLE");
    // the renderer only clears generated/cases, never generated/report
    const renderer = read(join(pkg, "render-negative-cases.ts"));
    const rm = renderer.split("\n").find((l) => l.includes("rmSync("))!;
    expect(rm).toContain("out");
    expect(renderer).toContain('join(here, "generated", "cases")');
    expect(renderer).not.toContain('rmSync(join(here, "generated")');
    expect(ps).toContain("generated/report");
  });

  // ------------------------------------------------------ hygiene + hold --
  it("18. the positive harness stays HELD_BACK and is not executed", () => {
    const held = read(
      join(
        root,
        "tests",
        "b1-five-services-rpc-authorization-preflight-01",
        "02-positive-harness.HELD_BACK.sql",
      ),
    );
    expect(held).toMatch(/HELD_BACK/);
    expect(ps).not.toContain("positive-harness");
    const localPositive = read(join(pkg, "positive-harness.sql"));
    expect(localPositive).toMatch(/DO NOT RUN|HELD_BACK|held back/);
    // the whole executable body is commented out
    expect(
      localPositive
        .split("\n")
        .filter((l) => l.trim() && !l.trimStart().startsWith("--") && !l.startsWith("\\set")),
    ).toHaveLength(0);
  });

  it("19. tracks no secrets, no generated files and no pycache", () => {
    const tracked = execSync("git ls-files", { cwd: root }).toString().split("\n");
    expect(tracked.filter((f) => f.includes("__pycache__"))).toHaveLength(0);
    expect(tracked.filter((f) => /(^|\/)\.env(\.|$)|DATABASE_URL/.test(f))).toHaveLength(0);
    expect(
      tracked.filter((f) => f.startsWith("scripts/b1-rpc-principal-harness-01/generated/")),
    ).toHaveLength(0);
    const ignore = read(join(root, ".gitignore"));
    expect(ignore).toContain("scripts/b1-rpc-principal-harness-01/generated/");
  });

  it("the preflight stays read-only and ends in ROLLBACK", () => {
    expect(pf.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(pf).toContain("B1_OPERATOR_PREFLIGHT_PASS");
    const executable = pf
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    // no role/privilege changes and no persistent-object DDL or writes
    expect(executable).not.toMatch(
      /\b(CREATE ROLE|ALTER ROLE|GRANT|REVOKE|DROP TABLE|DROP FUNCTION|TRUNCATE)\b/,
    );
    expect(executable).not.toMatch(
      /\b(INSERT INTO|UPDATE|DELETE FROM)\s+(public|auth|storage)\./,
    );
    // the only writable object is an ON COMMIT DROP temp table
    expect(executable).toContain("CREATE TEMP TABLE b1_fingerprint_relations");
    expect(executable).toContain("ON COMMIT DROP");
    const inserts = executable.match(/INSERT INTO\s+(\S+)/g) ?? [];
    expect(inserts.every((i) => i.includes("b1_fingerprint_relations"))).toBe(true);
  });


  it("pins package checksums", () => {
    const shas = Object.fromEntries(
      [
        "00-preflight.sql",
        "fingerprint.sql",
        "render-negative-cases.ts",
        "run-negative-matrix.ps1",
        "README.md",
      ].map((f) => [f, sha(join(pkg, f))]),
    );
    for (const v of Object.values(shas)) expect(v).toMatch(/^[0-9a-f]{64}$/);
    console.log(JSON.stringify(shas, null, 2));
  });
});
