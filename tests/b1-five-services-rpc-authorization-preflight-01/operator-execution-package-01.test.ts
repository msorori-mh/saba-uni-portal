import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APPROVED_PROJECT_REF,
  EXPECTED_NEGATIVE_TOTAL,
  FORBIDDEN_PATTERNS,
  MATRIX_SHA256_LF,
  assertDenialContract,
  assertSafeDiagnostic,
  assertSafeScalar,
  classifyDenialOutcome,
  expectationFor,
  extractFingerprintExpr,
  sha256Lf,
} from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const root = process.cwd();
const pkg = join(root, "scripts", "b1-rpc-principal-harness-01");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/gu, "\n");

const matrixRaw = read(join(root, "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json"));
const matrix = JSON.parse(matrixRaw);
const manifest = JSON.parse(read(join(pkg, "TARGET-MANIFEST.json")));
const preflight = read(join(pkg, "00-preflight.sql"));
const fingerprint = read(join(pkg, "fingerprint.sql"));
const launcher = read(join(pkg, "run-negative-matrix.ps1"));
const renderer = read(join(pkg, "render-negative-cases.ts"));
const readme = read(join(pkg, "README.md"));
const renderedCase = read(join(pkg, "generated", "cases", "case-0001.sql"));
const contract = assertDenialContract(matrix.denial_class_contract);
const CTX = {
  rpc: "act_on_b1_student_request_step_atomic",
  case_class: "unassigned_admin",
  runtime_status: "active",
};
const classify = (o: { allowed: boolean; sqlstate?: string | null; message?: string | null }) =>
  classifyDenialOutcome(o, contract, CTX);

/** SQL with `--` line comments and block comments stripped. */
const strip = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/u, ""))
    .join("\n");

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-FINAL-EXECUTION-PACKAGE-REMEDIATION-07", () => {
  // ---- G1 -----------------------------------------------------------------
  it("G1: control-character pattern uses the unicode flag and full C0+DEL range", () => {
    const control = FORBIDDEN_PATTERNS.find(([n]) => n === "control_char")?.[1];
    expect(control?.source).toBe("[\\u0000-\\u001F\\u007F]");
    expect(control?.flags).toContain("u");
    expect(FORBIDDEN_PATTERNS.every(([, re]) => re.flags.includes("u"))).toBe(true);
  });

  it("G1: unsafe scalars are rejected and safe ones pass", () => {
    expect(() => assertSafeScalar("t", "review")).not.toThrow();
    for (const bad of ["a\u0007b", "a\nb", "a;b", "a--b", "a'b", "../x", "a/b", "COMMIT"]) {
      expect(() => assertSafeScalar("t", bad)).toThrow(/MATRIX_VALIDATION_FAIL/u);
    }
  });

  it("G1: expect_error diagnostics reject control characters, quotes and terminators", () => {
    expect(() => assertSafeDiagnostic("e", "UNAUTHORIZED_STEP_ACTION / STEP_ACTION_NOT_ALLOWED")).not.toThrow();
    for (const bad of ["x\u0000y", "x\ny", "x;y", "x'y"]) {
      expect(() => assertSafeDiagnostic("e", bad)).toThrow(/MATRIX_VALIDATION_FAIL/u);
    }
  });

  // ---- G2 -----------------------------------------------------------------
  it("G2: launcher never reads DATABASE_URL or any pgpass channel", () => {
    expect(launcher).not.toMatch(/env:DATABASE_URL\b(?![^\n]*FORBIDDEN)/u);
    expect(launcher).not.toMatch(/New-TempPgpass/u);
    expect(launcher).not.toMatch(/\$env:PGPASSFILE\s*=/u);
    expect(launcher).not.toMatch(/\$env:PGPASSWORD\s*=/u);
  });

  it("G2: launcher aborts when a credential channel is present in the environment", () => {
    for (const name of ["DATABASE_URL", "PGPASSWORD", "PGPASSFILE", "PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGOPTIONS", "PGREQUIRESSL"]) {
      expect(manifest.endpoint.forbidden_environment_channels).toContain(name);
    }
    expect(launcher).toContain("forbidden_environment_channels");
    expect(launcher).toContain("FORBIDDEN_CREDENTIAL_CHANNEL");
  });

  it("G2: psql is invoked with -W for an interactive password prompt", () => {
    expect(launcher).toMatch(/'-W',/u);
    expect(launcher).toContain("Protect-Output");
  });

  // ---- G3 -----------------------------------------------------------------
  it("G3: the manifest pins the approved project ref, host, database and sslmode", () => {
    expect(manifest.endpoint.project_ref).toBe(APPROVED_PROJECT_REF);
    expect(manifest.endpoint.approved_pgdatabase).toBe("postgres");
    expect(manifest.endpoint.approved_pgsslmode).toBe("verify-full");
    expect(manifest.endpoint.approved_pgsslrootcert_path).toContain("tls/");
    expect(launcher).toContain("HOLD_NEEDS_VERIFIED_TLS_ENDPOINT");
    expect(preflight).toContain("HOLD_NEEDS_VERIFIED_TLS_ENDPOINT");
    expect(manifest.endpoint.approved_pguser_regex).toContain(APPROVED_PROJECT_REF);
  });

  it("G3: session-mode port 5432 is required and 6543 is rejected", () => {
    expect(manifest.endpoint.approved_pgport).toBe("5432");
    expect(launcher).toContain("TARGET_PORT_NOT_APPROVED");
    expect(launcher).toMatch(/\$pgPort -ne '5432'/u);
  });

  it("G3: the launcher exposes no host/user/ref override parameters", () => {
    expect(launcher).not.toMatch(/\[string\]\$PgHost|\[string\]\$PgUser|\[string\]\$ExpectedRef/u);
    expect(launcher).toContain("TARGET_REF_MISMATCH");
  });

  it("G3: the preflight re-attests the ref, database and user shape from pins", () => {
    expect(preflight).toContain("B1_PREFLIGHT_PRODUCTION_REF_MISMATCH");
    expect(preflight).toContain("B1_PREFLIGHT_DATABASE_MISMATCH");
    expect(preflight).toContain("B1_PREFLIGHT_SESSION_USER_SHAPE_MISMATCH");
  });

  // ---- G4 -----------------------------------------------------------------
  it("G4: migration version and exact name are pinned and asserted", () => {
    expect(manifest.migration.version).toBe("20260729014519");
    expect(manifest.migration.version).toBe(matrix.installed_migration.version);
    expect(manifest.migration.name).toBe(matrix.installed_migration.name);
    expect(preflight).toContain("B1_PREFLIGHT_MIGRATION_29_NAME_MISMATCH");
  });

  it("G4: six Migration-29 functions are pinned by exact signature", () => {
    expect(manifest.migration_29_functions).toHaveLength(6);
    expect(new Set(manifest.migration_29_functions).size).toBe(6);
    expect(manifest.migration_29_functions).toContain("public.guard_b1_runtime_step_activation()");
    expect(preflight).toContain("B1_PREFLIGHT_MIGRATION_29_FUNCTION_SET_DRIFT");
  });

  it("G4: eight Migration-29 triggers are pinned with tgtype, tgenabled and UPDATE OF columns", () => {
    expect(manifest.migration_29_triggers).toHaveLength(8);
    for (const t of manifest.migration_29_triggers) {
      expect(typeof t.tgtype).toBe("number");
      expect(t.tgenabled).toBe("O");
      expect(Array.isArray(t.update_columns)).toBe(true);
      expect(manifest.migration_29_functions).toContain(t.function_signature);
    }
    expect(preflight).toContain("B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT");
  });

  it("G4: the five services must exist and stay hidden", () => {
    expect(manifest.b1_services).toHaveLength(5);
    expect(preflight).toContain("B1_PREFLIGHT_SERVICE_UNEXPECTEDLY_VISIBLE_");
    expect(preflight).toContain("B1_PREFLIGHT_SERVICE_SET_DRIFT_");
  });

  // ---- G5 -----------------------------------------------------------------
  it("G5: the operator is proven a non-superuser, non-bypassrls, non-owner observer", () => {
    expect(preflight).toContain("B1_PREFLIGHT_FORBIDDEN_SESSION_USER");
    expect(preflight).toContain("B1_PREFLIGHT_SESSION_USER_IS_SUPERUSER");
    expect(preflight).toContain("B1_PREFLIGHT_SESSION_USER_HAS_BYPASSRLS");
    expect(preflight).toContain("B1_PREFLIGHT_OPERATOR_OWNS_SCOPE_RELATION");
    expect(preflight).toContain("B1_PREFLIGHT_OPERATOR_HAS_WRITE_PRIVILEGE");
  });

  it("G5: partial RLS (enabled without policy, or policy without RLS) is rejected", () => {
    expect(preflight).toContain("B1_PREFLIGHT_RLS_DISABLED_ON_SCOPE_RELATION");
    expect(preflight).toContain("B1_PREFLIGHT_NO_POLICY_ON_SCOPE_RELATION");
  });

  it("G5: visibility is proven by baseline fingerprint equality, not row counts", () => {
    expect(manifest.authoritative_baseline.status).toBe("PENDING");
    expect(manifest.authoritative_baseline.fingerprint).toBeNull();
    expect(preflight).toContain("OPERATOR_VISIBILITY_NOT_PROVEN");
    expect(preflight).toMatch(/baseline_fingerprint/u);
  });

  // ---- G6 -----------------------------------------------------------------
  it("G6: advisory locks are gone from the package", () => {
    expect(preflight).not.toContain("pg_advisory_xact_lock");
    expect(renderer).not.toContain("pg_advisory_xact_lock");
  });

  it("G6: rendered cases are SERIALIZABLE and take NO row locks at all", () => {
    expect(renderer).toContain("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(strip(renderedCase)).not.toMatch(/\bFOR\s+(SHARE|UPDATE|KEY\s+SHARE|NO\s+KEY\s+UPDATE)\b/iu);
    expect(strip(preflight)).not.toMatch(/\bFOR\s+(SHARE|UPDATE)\b/iu);
    expect(preflight).not.toContain("OPERATOR_ROW_LOCK_CAPABILITY_NOT_PROVEN");
    expect(launcher).toContain("FORBIDDEN_ROW_LOCK_IN_RENDERED_CASES");
    expect(preflight).toContain("B1_PREFLIGHT_OPERATOR_HAS_COLUMN_WRITE_PRIVILEGE");
  });

  it("G6: cases pin request type, step id, order, status, assignee and predecessors", () => {
    expect(renderer).toContain("CASE_STATE_DRIFT: request_type");
    expect(renderer).toContain("CASE_STATE_DRIFT: step status");
    expect(renderer).toContain("CASE_STATE_DRIFT: step_order");
    expect(renderer).toContain("CASE_STATE_DRIFT: assigned_user_id is no longer NULL on step");
    expect(renderer).toContain("direct assignee slots on step");
    expect(renderer).toContain("active unit+role assignments for step");
    expect(renderedCase).toContain("CASE_STATE_DRIFT: request status % (want submitted)");
    expect(renderedCase).toContain("fee assessments (want 0)");
    expect(renderer).toContain("unsatisfied predecessor steps");
    expect(renderer).toContain("CASE_STATE_DRIFT: transfer department scope");
  });

  // ---- G7 -----------------------------------------------------------------
  it("G7: the fingerprint has no LIMIT and the renderer refuses one", () => {
    expect(strip(fingerprint)).not.toMatch(/\bLIMIT\b/iu);
    expect(renderer).toContain("FINGERPRINT_EXPR_HAS_LIMIT");
    expect(() => extractFingerprintExpr(fingerprint)).not.toThrow();
  });

  it("G7: all 22 mutation-set relations plus student_profiles are fingerprinted", () => {
    const required = [
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
      "student_profiles",
      "notifications",
      "audit_logs",
      "schema_migrations",
    ];
    for (const rel of required) expect(fingerprint).toContain(rel);
    expect(required).toHaveLength(23);
  });

  it("G7: the same canonical expression is reused before/after and post-run", () => {
    const expr = extractFingerprintExpr(fingerprint);
    expect(expr.startsWith("(")).toBe(true);
    expect(renderer).toContain("v_before := ${fingerprintExpr}");
    expect(renderer).toContain("v_after := ${fingerprintExpr}");
    expect(renderer).toContain("renderFingerprintCheck");
  });

  // ---- G8 -----------------------------------------------------------------
  it("G8: the full discovered closure (>= 19 functions) is pinned, including both entry points", () => {
    const fns = manifest.function_graph.functions;
    expect(fns.length).toBeGreaterThanOrEqual(19);
    for (const f of fns) expect(f.definition_sha256).toMatch(/^[0-9a-f]{64}$/u);
    const entries = fns.filter((f: any) => f.entry_point).map((f: any) => f.signature);
    expect(entries).toContain("public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)");
    expect(entries).toContain("public.record_external_university_payment_confirmation(uuid,text)");
  });

  it("G8: the closure is computed from the database and drift fails closed", () => {
    expect(preflight).toContain("FUNCTION_GRAPH_DRIFT: unpinned reachable function");
    expect(preflight).toContain("B1_PREFLIGHT_FUNCTION_GRAPH_UNPINNED");
    expect(preflight).toContain("pg_get_functiondef");
  });

  it("G8: external-call tokens are rejected anywhere in the closure", () => {
    const ids = (manifest.function_graph.forbidden_definition_patterns as Array<{ id: string; regex: string }>).map(
      (p) => p.id,
    );
    for (const t of [
      "nextval",
      "setval",
      "pg_net",
      "http",
      "dblink",
      "pg_notify",
      "large_object",
      "copy_program",
      "dynamic_execute",
      "dynamic_call",
    ]) {
      expect(ids).toContain(t);
    }
    expect(preflight).toContain("b1_pin_forbidden_pattern");
    // comments must be stripped before the scan, both in SQL and in the pins
    expect(preflight).toContain("regexp_replace(v_def, '/\\*.*?\\*/', ' ', 'gs')");
    expect(preflight).toContain("B1_PREFLIGHT_EXTERNAL_SIDE_EFFECT_IN_FUNCTION");
  });

  // ---- G9 -----------------------------------------------------------------
  it("G9: a single psql process runs the master script", () => {
    expect(renderer).toContain("master-negative-matrix.sql");
    expect(renderer).toContain("\\ir ../00-preflight.sql");
    expect(renderer).toContain("\\ir fingerprint-check.sql");
    expect((launcher.match(/& psql /gu) ?? []).length).toBe(1);
    expect(launcher).toContain("'-f', $master");
  });

  it("G9: the run is read-write (no masking layer) and stops on the first error", () => {
    expect(launcher).not.toContain("default_transaction_read_only=on");
    expect(launcher).toContain("default_transaction_read_only=off");
    expect(launcher).toContain("'ON_ERROR_STOP=1'");
    expect(preflight).toContain("\\set ON_ERROR_STOP on");
  });


  // ---- G1 denial class fail-closed ---------------------------------------
  describe("G1: denial class gate is fail-closed", () => {
    it("contract is pinned in MATRIX.json and covers every expect_error", () => {
      expect(contract.fail_closed).toBe(true);
      expect(contract.version).toBeGreaterThanOrEqual(3);
      expect(contract.authorization_sqlstates).toEqual(["28000", "42501", "P0001", "22023"]);
      const positives = new Map<string, any>(
        matrix.positive_cases.map((p: any) => [`${p.request_number}|${p.step_key}`, p]),
      );
      const all = [
        ...matrix.negative_cases,
        ...matrix.illegal_action_cases,
        ...matrix.supplemental_department_scope_cases,
      ];
      for (const c of all) {
        const pc = positives.get(`${c.request_number}|${c.step_key}`);
        expect(pc).toBeDefined();
        expect(() =>
          expectationFor(contract, { rpc: pc.rpc, case_class: c.case, runtime_status: pc.runtime_status }),
        ).not.toThrow();
      }
      for (const s of ["25006", "42883", "42P01", "40001", "40P01", "55P03", "57014", "08006", "42601"]) {
        expect(contract.infrastructure_sqlstates).toContain(s);
      }
    });

    it("1. correct authorization denial => PASS", () => {
      expect(
        classify({
          allowed: false,
          sqlstate: "42501",
          message: "B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED: principal is not the direct assignee",
        }),
      ).toEqual({ verdict: "PASS", reason: expect.any(String) });
    });

    it("2. read-only transaction error => HOLD", () => {
      const v = classify({ allowed: false, sqlstate: "25006", message: "cannot execute UPDATE in a read-only transaction" });
      expect(v.verdict).toBe("HOLD");
      expect(v.reason).toContain("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL");
    });

    it("3. table/sequence permission error => HOLD", () => {
      const v = classify({ allowed: false, sqlstate: "42501", message: "permission denied for table student_requests" });
      expect(v.verdict).toBe("HOLD");
      expect(v.reason).toContain("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL");
    });

    it("4. RLS hidden-row error => HOLD", () => {
      const v = classify({
        allowed: false,
        sqlstate: "42501",
        message: "new row violates row-level security policy for table student_request_workflow_steps",
      });
      expect(v.verdict).toBe("HOLD");
      expect(v.reason).toContain("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL");
    });

    it("5. serialization / deadlock / lock timeout / connection / syntax => HOLD", () => {
      for (const o of [
        { sqlstate: "40001", message: "could not serialize access due to read/write dependencies" },
        { sqlstate: "40P01", message: "deadlock detected" },
        { sqlstate: "55P03", message: "could not obtain lock on row" },
        { sqlstate: "57014", message: "canceling statement due to statement timeout" },
        { sqlstate: "08006", message: "connection failure" },
        { sqlstate: "42601", message: "syntax error at or near" },
        { sqlstate: "42883", message: "function public.act_on_b1_student_request_step_atomic does not exist" },
      ]) {
        const v = classify({ allowed: false, ...o });
        expect(v.verdict).toBe("HOLD");
        expect(v.reason).toContain("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL");
      }
    });

    it("6. unexpected RPC success => HOLD", () => {
      const v = classify({ allowed: true });
      expect(v.verdict).toBe("HOLD");
      expect(v.reason).toContain("CASE_FAIL_ALLOWED");
    });

    it("7. correct message with wrong SQLSTATE => HOLD", () => {
      const v = classify({ allowed: false, sqlstate: "P0002", message: "B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED" });
      expect(v.verdict).toBe("HOLD");
      expect(v.reason).toContain("sqlstate");
    });

    it("8. correct SQLSTATE with wrong message => HOLD", () => {
      const v = classify({ allowed: false, sqlstate: "42501", message: "SOME_OTHER_GUARD tripped" });
      expect(v.verdict).toBe("HOLD");
      expect(v.reason).toContain("message outside the expected family");
    });

    it("rendered cases embed the gate and never rely on a read-only session", () => {
      expect(renderedCase).toContain("GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE");
      expect(renderedCase).toContain("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL");
      expect(renderedCase).toContain("CASE_FAIL_ALLOWED");
      expect(renderedCase).toContain("current_setting('transaction_read_only') = 'on'");
      expect(renderedCase).toContain("'AUTHENTICATION_REQUIRED'");
      expect((renderedCase.match(/BEGIN ISOLATION LEVEL SERIALIZABLE;/gu) ?? []).length).toBe(1);
      expect((renderedCase.match(/^ROLLBACK;$/gmu) ?? []).length).toBe(1);
      expect(strip(renderedCase)).not.toMatch(/\bCOMMIT\b/u);
    });

    it("contract validation itself is fail-closed", () => {
      expect(() => assertDenialContract(undefined)).toThrow(/DENIAL_CONTRACT_NOT_FAIL_CLOSED/u);
      expect(() => assertDenialContract({ ...contract, fail_closed: false })).toThrow(/NOT_FAIL_CLOSED/u);
      expect(() =>
        assertDenialContract({ ...contract, infrastructure_sqlstates: [...contract.infrastructure_sqlstates, "P0001"] }),
      ).toThrow(/SQLSTATE_OVERLAP/u);
      expect(() =>
        expectationFor(contract, { rpc: "no_such_rpc", case_class: "x", runtime_status: "y" }),
      ).toThrow(/MISSING_EXPECTATION/u);
      expect(() => assertDenialContract({ ...contract, version: 2 })).toThrow(/VERSION_TOO_OLD/u);
      expect(() => assertDenialContract({ ...contract, resolution_rules: [] })).toThrow(/NO_RESOLUTION_RULES/u);
    });
  });

  // ---- G2 package state ---------------------------------------------------
  it("G2: 267 = 240 + 24 + 3 and the baseline is PENDING and fails closed", () => {
    expect(matrix.counts.negative_core).toBe(240);
    expect(matrix.counts.illegal_action).toBe(24);
    expect(matrix.counts.supplemental_department_scope).toBe(3);
    expect(manifest.authoritative_baseline.status).toBe("PENDING");
    expect(manifest.authoritative_baseline.fingerprint === null || manifest.authoritative_baseline.fingerprint === "PENDING").toBe(true);
  });

  // ---- matrix / package invariants ---------------------------------------
  it("matrix: pinned LF SHA256 still matches", () => {
    expect(sha256Lf(matrixRaw)).toBe(MATRIX_SHA256_LF);
    expect(createHash("sha256").update(matrixRaw).digest("hex")).toBe(MATRIX_SHA256_LF);
  });

  it("matrix: 267 negative cases, 0 positives rendered", () => {
    const total =
      matrix.negative_cases.length +
      matrix.illegal_action_cases.length +
      matrix.supplemental_department_scope_cases.length;
    expect(total).toBe(EXPECTED_NEGATIVE_TOTAL);
    expect(total).toBe(267);
    expect(matrix.counts.negative_total).toBe(267);
    expect(Object.keys(matrix.production_readonly_attestation.requests)).toHaveLength(5);
    expect(renderer).toContain("positive_rendered: 0");
  });

  it("matrix: every negative case expects DENY with zero mutation", () => {
    const all = [
      ...matrix.negative_cases,
      ...matrix.illegal_action_cases,
      ...matrix.supplemental_department_scope_cases,
    ];
    expect(all.every((c: any) => c.expect === "DENY")).toBe(true);
    expect(all.every((c: any) => c.zero_mutation === true)).toBe(true);
  });

  it("package: no COMMIT is emitted and the preflight ends in ROLLBACK", () => {
    expect(renderer).not.toMatch(/\bCOMMIT;/u);
    expect(strip(preflight)).not.toMatch(/\bCOMMIT\b/u);
    expect(preflight.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(renderer).toContain("ROLLBACK;");
    expect(launcher).toContain("FORBIDDEN_COMMIT_IN_RENDERED_CASES");
  });

  it("package: README documents G1-G9 without reintroducing DATABASE_URL as a channel", () => {
    for (const g of ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"]) {
      expect(readme).toContain(`## ${g} —`);
    }
    expect(readme).toContain("`DATABASE_URL` is **not read and not supported**");
  });
});
