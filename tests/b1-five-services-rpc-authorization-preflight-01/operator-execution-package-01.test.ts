import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  APPROVED_PROJECT_REF,
  EXPECTED_NEGATIVE_TOTAL,
  FORBIDDEN_PATTERNS,
  EXPECTED_BLOCKED_TOTAL,
  EXPECTED_EXECUTABLE_TOTAL,
  MATRIX_SHA256_LF,
  assertDenialContract,
  assertSafeDiagnostic,
  assertSafeScalar,
  classifyDenialOutcome,
  expectationFor,
  extractFingerprintExpr,
  isBlockedCase,
  main as renderPackage,
  readLf,
  requiresActiveFixture,
  sha256Lf,
  toLf,
} from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const root = process.cwd();
const pkg = join(root, "scripts", "b1-rpc-principal-harness-01");
const read = (p: string) => toLf(readFileSync(p, "utf8"));

// REMEDIATION-57 G3: the package is regenerated from source on EVERY run.
// generated/ is never committed and a stale tree can never be tested or
// executed — the renderer wipes and rewrites it before a single assertion runs.
renderPackage();

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
    // LONGRUN-08 G11: authoritative_baseline remains PENDING with fingerprint=null.
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
    expect(renderer).toContain("effective unit+role assignments for step");
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
  it("G2: 267 = 240 + 24 + 3 and the baseline is PENDING (LONGRUN-08)", () => {
    expect(matrix.counts.negative_core).toBe(240);
    expect(matrix.counts.illegal_action).toBe(24);
    expect(matrix.counts.supplemental_department_scope).toBe(3);
    expect(manifest.authoritative_baseline.status).toBe("PENDING");
    expect(manifest.authoritative_baseline.fingerprint).toBeNull();
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
    expect(Object.keys(matrix.production_readonly_attestation.requests)).toHaveLength(24);
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

  it("package: no COMMIT is emitted and the preflight ends in ROLLBACK plus the gate-2 session marker", () => {
    expect(renderer).not.toMatch(/\bCOMMIT;/u);
    expect(strip(preflight)).not.toMatch(/\bCOMMIT\b/u);
    // REMEDIATION-26: the ROLLBACK is followed by the gate-2 session marker,
    // set AFTER the rollback so it survives as session state for
    // 01-execution-gate.sql. The marker proves the preflight passed; it is not
    // execution authorization.
    expect(preflight).toContain("ROLLBACK;");
    expect(
      preflight
        .trimEnd()
        .endsWith("SELECT set_config('b1.operator_preflight_passed', 'true', false) AS operator_preflight_session_marker;"),
    ).toBe(true);
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

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-CODEX-FINAL-FINDINGS-REMEDIATION-09", () => {
  const illegalRule = contract.resolution_rules.find(
    (r) => r.id === "atomic_illegal_action_by_exact_assignee",
  )!;
  const illegalCtx = {
    rpc: "act_on_b1_student_request_step_atomic",
    case_class: "illegal_action_by_exact_assignee",
    runtime_status: "active",
  };

  it("G1: an illegal action by the exact assignee expects 42501 / B1_ACTION_TYPE_MISMATCH", () => {
    expect(illegalRule.sqlstate).toBe("42501");
    expect(illegalRule.message_family).toEqual(["B1_ACTION_TYPE_MISMATCH"]);
    expect(expectationFor(contract, illegalCtx).id).toBe(illegalRule.id);
    expect(
      classifyDenialOutcome(
        { allowed: false, sqlstate: "42501", message: "B1_ACTION_TYPE_MISMATCH" },
        contract,
        illegalCtx,
      ).verdict,
    ).toBe("PASS");
  });

  it("G1: B1_ACTION_TYPE_MISMATCH is the live exact-assignee illegal-action denial (LONGRUN-08)", () => {
    const v = classifyDenialOutcome(
      { allowed: false, sqlstate: "42501", message: "B1_ACTION_TYPE_MISMATCH" },
      contract,
      illegalCtx,
    );
    expect(v.verdict).toBe("PASS");
    expect(JSON.stringify(contract.resolution_rules)).toContain("B1_ACTION_TYPE_MISMATCH");
  });

  it("G1: every illegal-action case is the exact assignee changing ONLY the action", () => {
    for (const c of matrix.illegal_action_cases as any[]) {
      const pin = matrix.step_state_pins[`${c.request_number}|${c.step_key}`];
      expect(pin).toBeTruthy();
      expect(c.assignee_is_exact_direct_assignee).toBe(true);
      expect(c.actor_user_id).toBe(pin.direct_assignee_user_id);
      expect(c.only_negative_variable).toBe("action");
      expect(c.action).not.toBe(pin.configured_action_type);
    }
  });

  it("G2: the three transfer-scope cases are executable against ACTIVE transfer fixtures", () => {
    const scope = matrix.supplemental_department_scope_cases as any[];
    expect(scope.length).toBe(3);
    for (const c of scope) {
      expect(c.requires_active_transfer_scope_fixture).toBe(true);
      expect(c.execution_status).toBe("EXECUTABLE_PENDING_FIXTURE_APPLY");
      expect(c.blocked_reason).toBeNull();
      expect(c.requires_fixture_package).toBe("B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13");
      expect(matrix.step_state_pins[`${c.request_number}|${c.step_key}`].runtime_status).toBe("active");
    }
    // IT source head on the target step, CS target head on the source step,
    // and an unrelated CIS third-department head.
    expect(scope.map((c) => c.actor_department_scope).sort()).toEqual([
      "source_department",
      "target_department",
      "unrelated_department",
    ]);
    const model = matrix.fixture_package.department_model;
    for (const c of scope) {
      expect(c.actor_department_id).toBe(model[`${c.actor_department_scope}_id`]);
    }
    expect(matrix.transfer_scope_execution.status).toBe("EXECUTABLE_PENDING_FIXTURE_APPLY");
    expect(matrix.transfer_scope_execution.bound_fixture_package).toContain("FIXTURES-13");
    expect(matrix.counts.execution_blocked_transfer_scope).toBe(0);

    const master = read(join(pkg, "generated", "master-negative-matrix.sql"));
    expect(master).not.toContain("BLOCKED.sql");
    for (const n of [265, 266, 267]) {
      const sql = read(join(pkg, "generated", "cases", `case-0${n}.sql`));
      expect(sql).toContain("BEGIN ISOLATION LEVEL SERIALIZABLE");
      expect(sql).toContain("CASE_STATE_DRIFT: transfer department scope");
    }
  });

  it("G3: every executable case pins unit, role, configured action_type and the direct assignee", () => {
    for (const n of [1, 100, 240]) {
      const sql = read(join(pkg, "generated", "cases", `case-${String(n).padStart(4, "0")}.sql`));
      expect(sql).toContain("unit/role/action_type pin failed");
      expect(sql).toContain("direct assignee pin failed");
      expect(sql).toContain("request_processing_units");
      expect(sql).toContain("request_processing_roles");
      expect(sql).toContain("request_type_workflow_steps");
      expect(sql).toContain("unsatisfied predecessor steps");
    }
    for (const [key, pin] of Object.entries(matrix.step_state_pins as Record<string, any>)) {
      expect(key).toMatch(/^SR-\d{8}-[0-9A-F]{8}\|[a-z][a-z0-9_]+$/u);
      assertSafeScalar("unit", pin.processing_unit_code);
      assertSafeScalar("role", pin.processing_role_code);
      assertSafeScalar("action_type", pin.configured_action_type);
      expect(pin.direct_assignee_user_id).toMatch(/^[0-9a-f-]{36}$/u);
    }
  });

  it("G4: the migration ledger is part of the operator privilege contract", () => {
    expect(preflight).toContain("supabase_migrations.schema_migrations");
    expect(preflight).toContain("B1_PREFLIGHT_OPERATOR_HAS_WRITE_PRIVILEGE: supabase_migrations.schema_migrations");
    expect(manifest.operator_privilege_contract.migration_ledger.relation).toBe(
      "supabase_migrations.schema_migrations",
    );
    expect(manifest.operator_privilege_contract.required).toContain(
      "no table-level INSERT/UPDATE/DELETE/TRUNCATE on supabase_migrations.schema_migrations",
    );
  });

  it("G5: trigger-aware closure — unpinned trigger functions are FUNCTION_GRAPH_DRIFT", () => {
    const closure = manifest.function_graph.trigger_aware_closure;
    expect(closure.unpinned_trigger_function_verdict).toBe("FUNCTION_GRAPH_DRIFT");
    expect(closure.dml_relations).toContain("student_request_workflow_steps");
    expect(closure.dml_relations).toContain("student_profiles");
    expect(closure.dml_relations.length).toBeGreaterThanOrEqual(10);
    expect(preflight).toContain("unpinned trigger function");
    expect(preflight).toContain("b1_pin_dml_relation");
    const pins = read(join(pkg, "generated", "pins.sql"));
    expect(pins).toContain("CREATE TEMP TABLE b1_pin_dml_relation");
    for (const rel of closure.dml_relations as string[]) expect(pins).toContain(`'${rel}'`);
    const pinnedSigs = new Set((manifest.function_graph.functions as any[]).map((f) => f.signature));
    for (const sig of closure.pinned_trigger_functions as string[]) expect(pinnedSigs.has(sig)).toBe(true);
  });

  it("G6: matrix SHA and manifest stay consistent after remediation", () => {
    expect(sha256Lf(matrixRaw)).toBe(MATRIX_SHA256_LF);
    expect(manifest.matrix.sha256_lf).toBe(MATRIX_SHA256_LF);
    expect(manifest.matrix.negative_total).toBe(267);
    expect(manifest.matrix.executable_negative_total).toBe(267);
    expect(manifest.matrix.blocked_negative_total).toBe(0);
    expect(manifest.matrix.fixture_rebind.rebound_cases).toBe(22);
    expect(matrix.fixture_rebind.rebound_cases).toBe(22);
    expect(matrix.production_ref).toBe(APPROVED_PROJECT_REF);
  });
});

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-INDEPENDENT-REVIEW-RECONCILIATION-12", () => {
  const allCases = [
    ...matrix.negative_cases,
    ...matrix.illegal_action_cases,
    ...matrix.supplemental_department_scope_cases,
  ] as any[];
  const pins = matrix.step_state_pins as Record<string, any>;
  const isRebound = (c: any) => c.execution_status === "EXECUTABLE_PENDING_FIXTURE_APPLY";
  const master = read(join(pkg, "generated", "master-negative-matrix.sql"));
  const generatedManifest = JSON.parse(read(join(pkg, "generated", "MANIFEST.json")));
  const pinsSql = read(join(pkg, "generated", "pins.sql"));

  // ---- G1 / G7: 267 = 267 executable + 0 blocked (22 rebound) ---------------
  it("G1: 267 defined = 267 executable + 0 blocked, 0 positives", () => {
    expect(allCases).toHaveLength(267);
    expect(EXPECTED_EXECUTABLE_TOTAL).toBe(267);
    expect(EXPECTED_BLOCKED_TOTAL).toBe(0);
    expect(matrix.counts.negative_total).toBe(267);
    expect(matrix.counts.executable_negative_total).toBe(267);
    expect(matrix.counts.execution_blocked).toBe(0);
    expect(matrix.counts.positive).toBe(0);
    expect(matrix.counts.positive_rendered).toBe(0);
    expect(allCases.filter(isRebound)).toHaveLength(22);
    expect(allCases.filter((c) => c.execution_status === "EXECUTABLE")).toHaveLength(245);
    expect(generatedManifest.negative_total).toBe(267);
    expect(generatedManifest.executable_negative_total).toBe(267);
    expect(generatedManifest.blocked_negative_total).toBe(0);
    expect(generatedManifest.rebound_cases).toBe(22);
    expect(generatedManifest.fixture_readiness).toBe("FIXTURE_PACKAGE_NOT_APPLIED");
    expect(generatedManifest.readiness_hold_token).toBe(
      "HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED",
    );
    expect(generatedManifest.positive_rendered).toBe(0);
    expect(generatedManifest.commits).toBe(0);
  });

  it("G1: all 24 illegal-action cases are bound to ACTIVE steps; 19 are rebound to fixtures", () => {
    const ia = matrix.illegal_action_cases as any[];
    const active = ia.filter((c) => pins[`${c.request_number}|${c.step_key}`].runtime_status === "active");
    expect(active).toHaveLength(24);
    const rebound = ia.filter(isRebound);
    expect(rebound).toHaveLength(19);
    for (const c of rebound) {
      expect(c.request_number).toMatch(/^SR-20260801-13/u);
      expect(c.requires_fixture_package).toBe("B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13");
      expect(c.blocked_reason).toBeNull();
    }
    for (const c of ia.filter((c) => !isRebound(c))) expect(c.execution_status).toBe("EXECUTABLE");
  });

  it("G1: the 19 rebound illegal-action cases halt fail-closed without the fixture package", () => {
    const rebound = (matrix.illegal_action_cases as any[]).filter(isRebound);
    expect(rebound).toHaveLength(19);
    for (const c of rebound) {
      const pin = pins[`${c.request_number}|${c.step_key}`];
      // Bound to an ACTIVE fixture step now, so nothing renders as blocked…
      expect(isBlockedCase(c, pin)).toBe(false);
      // …but the contract still sits behind the active-step gate: without the
      // fixture the case is unbound and the render/preflight aborts.
      expect(requiresActiveFixture(c)).toBe(true);
      expect(isBlockedCase(c, { ...pin, runtime_status: "pending" })).toBe(true);
    }
  });

  it("G1: the 3 transfer-scope cases halt fail-closed without the fixture package", () => {
    const scope = matrix.supplemental_department_scope_cases as any[];
    expect(scope).toHaveLength(3);
    for (const c of scope) {
      expect(isRebound(c)).toBe(true);
      expect(isBlockedCase(c, pins[`${c.request_number}|${c.step_key}`])).toBe(false);
      expect(requiresActiveFixture(c)).toBe(true);
    }
  });

  // ---- G2: master contains all 267 cases; zero blocked files ----------------
  it("G2: master contains exactly the 267 executable cases and zero blocked files", () => {
    expect((master.match(/\\ir cases\//gu) ?? []).length).toBe(267);
    expect(master).not.toContain("BLOCKED.sql");
    expect(master).toContain("HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED");
    expect(generatedManifest.blocked_files).toHaveLength(0);
    expect(generatedManifest.blocked_by_class).toEqual({});
    expect(generatedManifest.blocked_reason).toBeNull();
    const caseFiles = readdirSync(join(pkg, "generated", "cases"));
    expect(caseFiles.filter((f) => f.endsWith(".BLOCKED.sql"))).toHaveLength(0);
    expect(caseFiles.filter((f) => /^case-\d{4}\.sql$/u.test(f))).toHaveLength(267);
    // case IDs 0242–0267 (the rebound partition) are all present and executable
    for (let n = 242; n <= 267; n++) {
      const name = `case-${String(n).padStart(4, "0")}.sql`;
      expect(caseFiles).toContain(name);
      expect(master).toContain(`\\ir cases/${name}`);
    }
  });

  // ---- G3: launcher + preflight stop before execution while not ready ------
  it("G3: the launcher stops on the fixture readiness gate before psql", () => {
    expect(launcher).toContain("FIXTURE_PACKAGE_NOT_APPLIED");
    expect(launcher).toContain("RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED");
    expect(launcher).toContain("exit 2");
    expect(launcher).toContain("RESULT: PASS_B1_NEGATIVE_RPC_MATRIX_267_DENY_ZERO_MUTATION_0_BLOCKED");
    const gateIdx = launcher.indexOf("RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(launcher.indexOf("& psql "));
    expect(launcher).toContain("if ($blockedCases.Count -ne 0)");
    expect(launcher).toContain("if ($executableCount -ne 267)");
    expect(launcher).toContain("if ($masterIncludes -ne 267)");
    // the baseline and authorization gates also stop before psql
    expect(launcher.indexOf("Deny-Baseline \"status is")).toBeLessThan(launcher.indexOf("& psql "));
    expect(launcher).toContain("baseline self-authorizes execution");
  });

  it("G3: the preflight halts on the fixture-state gate, so psql cannot bypass the launcher", () => {
    expect(pinsSql).toContain("('executable_case_total', '267')");
    expect(pinsSql).toContain("('fixture_package_id', 'B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13')");
    expect(pinsSql).toContain("('fixture_marker', 'TEST_ONLY_B1_FIXTURE_13')");
    expect(pinsSql).toContain("HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED");
    expect(preflight).toContain("HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED");
    expect(preflight).toContain("fixture requests (expected 19)");
    expect(preflight).toContain("fixture runtime steps (expected 104)");
    expect(preflight).toContain("ACTIVE fixture steps (expected 19)");
    expect(preflight).toContain("transfer scope rows (expected 5)");
    expect(preflight).not.toContain("blocked_case_total");
  });

  // ---- G4: complete migration-ledger contract ------------------------------
  it("G4: schema_migrations contract covers ownership, SELECT and table/column writes", () => {
    const ledger = manifest.operator_privilege_contract.migration_ledger;
    expect(ledger.relation).toBe("supabase_migrations.schema_migrations");
    expect(ledger.ownership).toContain("FORBIDDEN");
    expect(ledger.read).toContain("REQUIRED");
    expect(ledger.table_level_write).toContain("FORBIDDEN");
    expect(ledger.column_level_write).toContain("FORBIDDEN");
    for (const req of [
      "SELECT on supabase_migrations.schema_migrations",
      "not owner of supabase_migrations.schema_migrations",
      "no table-level INSERT/UPDATE/DELETE/TRUNCATE on supabase_migrations.schema_migrations",
      "no column-level INSERT/UPDATE on supabase_migrations.schema_migrations",
    ]) {
      expect(manifest.operator_privilege_contract.required).toContain(req);
    }
    expect(preflight).toContain("B1_PREFLIGHT_OPERATOR_OWNS_MIGRATION_LEDGER");
    expect(preflight).toContain(
      "B1_PREFLIGHT_OPERATOR_HAS_WRITE_PRIVILEGE: supabase_migrations.schema_migrations",
    );
    expect(preflight).toContain(
      "B1_PREFLIGHT_OPERATOR_HAS_COLUMN_WRITE_PRIVILEGE: supabase_migrations.schema_migrations",
    );
    expect(preflight).toContain("g.table_schema = 'supabase_migrations'");
  });

  // ---- G5: student_profiles trigger closure --------------------------------
  it("G5: student_profiles is in the DML closure with both enabled triggers pinned", () => {
    const closure = manifest.function_graph.trigger_aware_closure;
    expect(closure.dml_relations).toContain("student_profiles");
    expect(pinsSql).toContain("'student_profiles'");
    const trg = closure.declared_relation_triggers["public.student_profiles"] as any[];
    expect(trg).toHaveLength(2);
    const names = trg.map((t) => t.tgname);
    expect(names).toContain("trg_student_profiles_updated_at");
    expect(names).toContain("trg_protect_student_sensitive");
    for (const t of trg) {
      expect(t.tgenabled).toBe("O");
      expect(t.tgtype).toBe(19);
      expect(t.timing).toBe("BEFORE UPDATE");
    }
    const sigs = trg.map((t) => t.function_signature);
    expect(sigs).toContain("public.update_updated_at_column()");
    expect(sigs).toContain("public.protect_student_sensitive_fields()");
  });

  it("G5: the student_profiles trigger closure is attested, pinned and side-effect scanned", () => {
    const closure = manifest.function_graph.trigger_aware_closure;
    const pending = closure.production_attestation;
    expect(pending.status).toBe("PRODUCTION_ATTESTED_AND_PINNED");
    expect(pending.attestation_mode).toBe("PRODUCTION_READ_ONLY_ATTESTATION_ONLY");
    expect(pending.verdict_when_unpinned).toBe("FUNCTION_GRAPH_DRIFT");
    expect(pending.trigger_bindings_verified.trg_student_profiles_updated_at).toBe(
      "public.update_updated_at_column()",
    );
    expect(pending.trigger_bindings_verified.trg_protect_student_sensitive).toBe(
      "public.protect_student_sensitive_fields()",
    );
    const pinnedSigs = new Set((manifest.function_graph.functions as any[]).map((f) => f.signature));
    const bySig = new Map<string, any>(pending.functions.map((f: any) => [f.signature, f]));
    for (const sig of [
      "public.update_updated_at_column()",
      "public.protect_student_sensitive_fields()",
      "public.has_any_role(uuid,text[])",
    ]) {
      const f = bySig.get(sig);
      expect(f).toBeTruthy();
      expect(["DEFINER", "INVOKER"]).toContain(f.security);
      expect(f.owner).toBe("postgres");
      expect(f.search_path).toBe("search_path=public");
      expect(f.external_side_effects_source_scan).toBe("none");
      expect(f.definition_sha256).toMatch(/^[0-9a-f]{64}$/u);
      // every closure member is pinned in the function graph with a real SHA
      expect(pinnedSigs.has(sig)).toBe(true);
      expect(closure.pinned_trigger_functions).toContain(sig);
    }
    // the transitive callee discovered from protect_student_sensitive_fields
    expect(bySig.get("public.protect_student_sensitive_fields()").source_derived_calls).toContain(
      "public.has_any_role(uuid,text[])",
    );
    // unpinned (SHA-less) closure members must keep the run fail-closed
    expect(preflight).toContain("FUNCTION_GRAPH_DRIFT: unpinned reachable function");
  });


  // ---- G6: exact state pinning ---------------------------------------------
  it("G6: every step pin carries action, unit, role, assignee, predecessor set and scope", () => {
    for (const [key, pin] of Object.entries(pins)) {
      expect(pin.configured_action_type).toBeTruthy();
      expect(pin.processing_unit_code).toBeTruthy();
      expect(pin.processing_role_code).toBeTruthy();
      expect(pin.direct_assignee_user_id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(Array.isArray(pin.predecessor_set)).toBe(true);
      expect(pin.predecessor_set).toHaveLength(pin.predecessor_total_expected);
      expect(pin.predecessor_set.filter((p: any) => !["completed", "skipped"].includes(p.runtime_status))).toHaveLength(
        pin.predecessor_incomplete_expected,
      );
      expect(pin.department_scope).toBe(
        pin.request_type === "department_transfer" ? "transfer_department_scope" : "not_applicable",
      );
    }
  });

  it("G6: rendered cases compare the exact predecessor set, statuses and scope", () => {
    const later = read(join(pkg, "generated", "cases", "case-0010.sql"));
    expect(later).toContain("predecessor steps (want");
    expect(later).toContain("unsatisfied predecessor steps (want");
    expect(later).toContain("unit/role/action_type pin failed");
    expect(later).toContain("direct assignee pin failed");
    expect(later).toContain("CASE_STATE_DRIFT: transfer department scope");
    const withPreds = read(join(pkg, "generated", "cases", "case-0031.sql"));
    expect(withPreds).toMatch(/predecessor [a-z_]+ is not (pending|completed|skipped|active)/u);
  });
});

// ===========================================================================
// PORTAL-B1-NEGATIVE-RPC-MATRIX-EXECUTABLE-PACKAGE-REMEDIATION-57
// Closes HOLD_B1_NEGATIVE_RPC_MATRIX_FINAL_PACKAGE_NOT_EXECUTABLE.
// Source-only. No case is executed, no RPC is called, no connection is opened.
// ===========================================================================
describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-EXECUTABLE-PACKAGE-REMEDIATION-57", () => {
  const caseDir = join(pkg, "generated", "cases");
  const caseFiles = readdirSync(caseDir).filter((f) => f.startsWith("case-")).sort();
  const executableFiles = caseFiles.filter((f) => !f.endsWith(".BLOCKED.sql"));
  const executableSql = executableFiles.map((f) => ({ name: f, sql: read(join(caseDir, f)) }));

  // ---- 1. EOL normalization ------------------------------------------------
  it("1: LF and CRLF inputs produce an identical hash and an identical parse", () => {
    const lf = "line-a\nline-b\n";
    const crlf = "line-a\r\nline-b\r\n";
    expect(sha256Lf(crlf)).toBe(sha256Lf(lf));
    expect(toLf(crlf)).toBe(lf);
    expect(toLf("legacy-cr\rnext")).toBe("legacy-cr\nnext");
    expect(sha256Lf(matrixRaw)).toBe(MATRIX_SHA256_LF);
    expect(sha256Lf(matrixRaw.replace(/\n/gu, "\r\n"))).toBe(MATRIX_SHA256_LF);
  });

  it("1: the fingerprint expression is normalized to LF before the LIMIT scan", () => {
    const crlfFingerprint = fingerprint.replace(/\n/gu, "\r\n");
    expect(extractFingerprintExpr(crlfFingerprint)).toBe(extractFingerprintExpr(fingerprint));
    expect(extractFingerprintExpr(crlfFingerprint)).not.toMatch(/\r/u);
    const withLimit = fingerprint.replace(
      "-- END_FINGERPRINT_EXPR",
      "\r\n-- END_FINGERPRINT_EXPR",
    ).replace("-- BEGIN_FINGERPRINT_EXPR", "-- BEGIN_FINGERPRINT_EXPR\r\n(select 1 limit 1)--");
    expect(() => extractFingerprintExpr(withLimit)).toThrow();
  });

  it("1: every read boundary in the renderer normalizes line endings", () => {
    expect(renderer).toContain("export function readLf(");
    expect(renderer).toContain("readLf(MATRIX_PATH)");
    expect(renderer).toContain("readLf(MANIFEST_PATH)");
    expect(renderer).toContain("readLf(FINGERPRINT_PATH)");
    expect(renderer).not.toMatch(/readFileSync\((MATRIX|MANIFEST|FINGERPRINT)_PATH/u);
    expect(readLf(join(pkg, "fingerprint.sql"))).not.toMatch(/\r/u);
  });

  // ---- 2. control-character regex -----------------------------------------
  it("2: the control-character pattern is exactly /[\\u0000-\\u001F\\u007F]/u", () => {
    const control = FORBIDDEN_PATTERNS.find(([n]) => n === "control_char")?.[1];
    expect(control).toBeDefined();
    expect(control!.source).toBe("[\\u0000-\\u001F\\u007F]");
    expect(control!.flags).toBe("u");
    for (const cp of [0x00, 0x07, 0x0a, 0x0d, 0x1f, 0x7f]) {
      expect(control!.test(String.fromCharCode(cp))).toBe(true);
    }
    expect(control!.test("review")).toBe(false);
  });

  // ---- 3. no -SkipRender, always regenerate --------------------------------
  it("3: -SkipRender is gone and both the launcher and the renderer force a fresh tree", () => {
    expect(launcher).not.toMatch(/SkipRender\s*[)\],]/u);
    expect(launcher).not.toMatch(/\[switch\]/u);
    expect(launcher).toContain("param()");
    expect(launcher).toContain("there is no skip path");
    expect(renderer).toContain("rmSync(OUT, { recursive: true, force: true })");
  });

  it("3: a stale generated tree can never be executed — the test itself re-renders", () => {
    const testSelf = read(
      join(root, "tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts"),
    );
    expect(testSelf).toContain("renderPackage()");
    // generated/ must stay out of version control.
    expect(read(join(root, ".gitignore"))).toMatch(/b1-rpc-principal-harness-01\/generated/u);
  });

  // ---- 4. payment RPC takes the workflow step uuid -------------------------
  it("4: the payment RPC is always called with the runtime STEP id, never the request id", () => {
    const paymentCases = executableSql.filter((c) =>
      c.sql.includes("record_external_university_payment_confirmation"),
    );
    expect(paymentCases.length).toBeGreaterThan(0);
    for (const c of paymentCases) {
      expect(c.sql).toContain("PERFORM public.record_external_university_payment_confirmation(v_step,");
      expect(c.sql).not.toMatch(/record_external_university_payment_confirmation\(\s*v_req/u);
    }
    expect(renderer).toContain("record_external_university_payment_confirmation(v_step,");
    expect(renderer).not.toMatch(/record_external_university_payment_confirmation\(v_req/u);
  });

  // ---- 5. denial classified by the exact (SQLSTATE, message family) pair ---
  it("5: a denial is PASS only on the exact SQLSTATE + approved message family pair", () => {
    const expected = expectationFor(contract, CTX);
    expect(contract.fail_closed).toBe(true);
    expect(classify({ allowed: false, sqlstate: expected.sqlstate, message: expected.message_family[0] }).verdict)
      .toBe("PASS");
    // known SQLSTATE, unknown message family => HOLD
    expect(classify({ allowed: false, sqlstate: "42501", message: "some other refusal" }).verdict).toBe("HOLD");
    // known message family, unexpected SQLSTATE => HOLD
    expect(classify({ allowed: false, sqlstate: "42P01", message: expected.message_family[0] }).verdict).toBe("HOLD");
    expect(classify({ allowed: true }).verdict).toBe("HOLD");
    for (const c of executableSql) {
      expect(c.sql).toContain("sqlstate % expected");
      expect(c.sql).toContain("message outside expected family");
    }
  });

  // ---- 6/7. connection-override and TLS contract ---------------------------
  it("6: every connection-override channel is refused by the manifest and the launcher", () => {
    for (const banned of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "DATABASE_URL", "PGPASSWORD", "PGPASSFILE"]) {
      expect(manifest.endpoint.forbidden_environment_channels).toContain(banned);
    }
    expect(launcher).toContain("FORBIDDEN_CREDENTIAL_CHANNEL");
    expect(launcher).toMatch(/Test-Path "env:\$banned"/u);
  });

  it("7: sslmode=verify-full with a pinned CA bundle is mandatory", () => {
    expect(manifest.endpoint.approved_pgsslmode).toBe("verify-full");
    expect(manifest.endpoint.approved_pgsslrootcert_path).toBeTruthy();
    expect(launcher).toContain("HOLD_NEEDS_VERIFIED_TLS_ENDPOINT");
    expect(launcher).toMatch(/\$env:PGSSLMODE\s*=\s*\$pgSslMode/u);
    expect(launcher).toMatch(/\$env:PGSSLROOTCERT\s*=/u);
  });

  // ---- 8. no row locks, operator stays a read-only observer -----------------
  it("8: no FOR SHARE / FOR UPDATE anywhere in the package", () => {
    for (const sql of [preflight, fingerprint, ...executableSql.map((c) => c.sql)]) {
      // Comments may describe why row locking was removed; executable SQL may not use it.
      expect(strip(sql)).not.toMatch(/\bFOR\s+(SHARE|UPDATE|KEY\s+SHARE|NO\s+KEY\s+UPDATE)\b/iu);
    }
    expect(manifest.operator_privilege_contract).toBeDefined();
  });

  // ---- 9. full per-case state pinning --------------------------------------
  it("9: every executable case pins request, action, unit, role, assignee, scope, predecessors, counts and fees", () => {
    for (const c of executableSql) {
      expect(c.sql).toContain("CASE_STATE_DRIFT: request status");
      expect(c.sql).toContain("active steps (want");
      expect(c.sql).toContain("fee assessments (want");
      expect(c.sql).toContain("unit/role/action_type pin failed");
      expect(c.sql).toContain("direct assignee pin failed");
      expect(c.sql).toContain("predecessor steps (want");
      expect(c.sql).toContain("unsatisfied predecessor steps (want");
    }
  });

  // ---- 10. function graph completeness -------------------------------------
  it("10: every function in the graph has a signature and a non-empty SHA256", () => {
    const fns = manifest.function_graph.functions as Array<Record<string, string>>;
    expect(fns.length).toBeGreaterThanOrEqual(28);
    for (const f of fns) {
      expect(typeof f.signature).toBe("string");
      expect(f.signature.length).toBeGreaterThan(0);
      expect(f.definition_sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(f.security).toBeTruthy();
      expect(f.owner).toBeTruthy();
    }
    expect(fns.filter((f) => (f as unknown as { entry_point: boolean }).entry_point).length).toBe(2);
  });

  // ---- 11. external-call scan ----------------------------------------------
  it("11: nextval/setval/pg_net/http/dblink/pg_notify/COPY PROGRAM/EXECUTE/CALL are all rejected", () => {
    const ids = (manifest.function_graph.forbidden_definition_patterns as Array<{ id: string }>).map((p) => p.id);
    for (const id of [
      "nextval",
      "setval",
      "pg_net",
      "http",
      "dblink",
      "pg_notify",
      "copy_program",
      "dynamic_execute",
      "dynamic_call",
    ]) {
      expect(ids).toContain(id);
    }
    expect(preflight).toContain("b1_pin_forbidden_pattern");
  });

  // ---- 12. fingerprint has no LIMIT ----------------------------------------
  it("12: the canonical fingerprint covers full content with no LIMIT", () => {
    const expr = extractFingerprintExpr(fingerprint);
    expect(strip(expr)).not.toMatch(/\bLIMIT\b/iu);
    expect(expr.startsWith("(")).toBe(true);
  });

  // ---- 13. authoritative baseline is PENDING (LONGRUN-08 G11) --------------
  it("13: the authoritative baseline remains PENDING until an explicit later capture", () => {
    const baseline = manifest.authoritative_baseline;
    expect(baseline.status).toBe("PENDING");
    expect(baseline.execution_authorized).toBe(false);
    expect(baseline.fingerprint).toBeNull();
    expect(baseline.captured_at_utc).toBeNull();
    expect(baseline.valid_for_minutes).toBeNull();
    expect(baseline.reviewed_package_sha).toBeNull();
    expect(baseline.migration_head).toBe("20260801021541");
    expect(baseline.expected_migration_head).toBe("20260801021541");
    expect(baseline.scope).toHaveLength(8);
    expect(baseline.contains_secrets).toBe(false);
    expect(baseline.artifact_sha256).toMatch(/^[0-9a-f]{64}$/u);

    const artifactRaw = read(join(root, baseline.artifact_path));
    const artifact = JSON.parse(artifactRaw) as Record<string, any>;
    expect(createHash("sha256").update(artifactRaw.replace(/\r\n/gu, "\n")).digest("hex"))
      .toBe(baseline.artifact_sha256);
    expect(artifact.status).toBe("PENDING");
    expect(artifact.fingerprint).toBeNull();
    expect(artifact.operator_preflight_executed).toBe(false);
    expect(artifact.negative_cases_executed).toBe(0);

    const check = read(join(pkg, "generated", "fingerprint-check.sql"));
    expect(check).toContain("v_expected text := NULL");
    expect(check).toContain("HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE");
  });


  // ---- 14. positive harness held back --------------------------------------
  it("14: the positive harness stays HELD_BACK and is never rendered or included", () => {
    const positive = read(
      join(root, "tests/b1-five-services-rpc-authorization-preflight-01/02-positive-harness.HELD_BACK.sql"),
    );
    expect(positive).toContain("B1_POSITIVE_HARNESS_HELD_BACK");
    expect(positive).toContain("HELD_BACK_PENDING_SEPARATE_WRITE_APPROVAL");
    const master = read(join(pkg, "generated", "master-negative-matrix.sql"));
    expect(master).not.toMatch(/positive/iu);
    expect(JSON.parse(read(join(pkg, "generated", "MANIFEST.json"))).positive_rendered).toBe(0);
  });

  // ---- 15. counts + transaction shape --------------------------------------
  it("15: 267 = 240 + 24 + 3, partitioned into 267 executable + 0 blocked", () => {
    expect(matrix.negative_cases.length).toBe(240);
    expect(matrix.illegal_action_cases.length).toBe(24);
    expect(matrix.supplemental_department_scope_cases.length).toBe(3);
    expect(240 + 24 + 3).toBe(EXPECTED_NEGATIVE_TOTAL);
    expect(caseFiles.length).toBe(EXPECTED_NEGATIVE_TOTAL);
    expect(executableFiles.length).toBe(EXPECTED_EXECUTABLE_TOTAL);
    expect(caseFiles.length - executableFiles.length).toBe(EXPECTED_BLOCKED_TOTAL);
  });

  it("15: every executable case is exactly one BEGIN SERIALIZABLE, one ROLLBACK, zero COMMIT", () => {
    for (const c of executableSql) {
      const sql = strip(c.sql);
      expect((sql.match(/\bBEGIN ISOLATION LEVEL SERIALIZABLE\b/gu) ?? []).length).toBe(1);
      expect((sql.match(/^ROLLBACK;$/gmu) ?? []).length).toBe(1);
      expect((sql.match(/\bCOMMIT\b/giu) ?? []).length).toBe(0);
      expect((sql.match(/\bSAVEPOINT\b/giu) ?? []).length).toBe(0);
    }
  });

  it("15: zero blocked files exist and the master includes every rendered case exactly once", () => {
    const master = read(join(pkg, "generated", "master-negative-matrix.sql"));
    expect(caseFiles.filter((n) => n.endsWith(".BLOCKED.sql"))).toHaveLength(0);
    for (const f of executableFiles) {
      expect((master.match(new RegExp(`\\\\ir cases/${f}`, "gu")) ?? []).length).toBe(1);
    }
  });

  // ---- enrollment_certificate protection -----------------------------------
  it("regression: enrollment_certificate is untouched and the five B1 services stay hidden", () => {
    const protectedRecords = ["SR-20260713-2DE64041", "SR-20260715-FEDCB3E1", "SR-20260716-26BAD4C8"];
    for (const c of executableSql) {
      // The only permitted mention is the read-only fingerprint relation.
      const mentions = c.sql.match(/enrollment_certificate[a-z_]*/gu) ?? [];
      expect(new Set(mentions)).toEqual(new Set(["enrollment_certificate_document_details"]));
      // No case may target a protected enrollment-certificate request.
      for (const rec of protectedRecords) {
        expect(c.sql).not.toMatch(new RegExp(`request_number = '${rec}'`, "u"));
      }
      expect(c.sql).not.toMatch(/PERFORM public\.[a-z_]*enrollment_certificate/u);
    }
    expect(matrix.positive_cases.every((p: { request_type: string }) => p.request_type !== "enrollment_certificate"))
      .toBe(true);
    expect(manifest.b1_services as string[]).toEqual([
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]);
    expect(manifest.b1_services as string[]).not.toContain("enrollment_certificate");
    // The five services stay hidden: the preflight asserts student_visible = false.
    expect(preflight).toMatch(/student_visible/u);
  });
});

// ===========================================================================
// PORTAL-B1-NEGATIVE-RPC-MATRIX-267-EXECUTABLE-CONTRACT-RECONCILIATION-17
// Reconciles the obsolete 245 executable / 22 blocked model to the reviewed
// 267 executable / 0 blocked model while keeping every gate fail-closed.
// Source-only. No case is executed, no RPC is called, no connection is opened.
// ===========================================================================
describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-267-EXECUTABLE-CONTRACT-RECONCILIATION-17", () => {
  const generatedManifest = JSON.parse(read(join(pkg, "generated", "MANIFEST.json")));
  const master = read(join(pkg, "generated", "master-negative-matrix.sql"));
  const caseDir = join(pkg, "generated", "cases");
  const caseFiles = readdirSync(caseDir).filter((f) => f.startsWith("case-")).sort();

  it("source contract: 267 cases, 267 executable, 0 blocked, 22 rebound", () => {
    expect(manifest.matrix.negative_total).toBe(267);
    expect(manifest.matrix.executable_negative_total).toBe(267);
    expect(manifest.matrix.blocked_negative_total).toBe(0);
    expect(manifest.matrix.blocked_reason).toBeNull();
    expect(manifest.matrix.blocked_token).toBeNull();
    expect(manifest.matrix.fixture_rebind.package_id).toBe("B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13");
    expect(manifest.matrix.fixture_rebind.marker).toBe("TEST_ONLY_B1_FIXTURE_13");
    expect(manifest.matrix.fixture_rebind.rebound_cases).toBe(22);
    expect(matrix.counts.executable_negative_total).toBe(267);
    expect(matrix.counts.execution_blocked).toBe(0);
    expect(matrix.fixture_rebind.rebound_cases).toBe(22);
    expect(generatedManifest.negative_total).toBe(267);
    expect(generatedManifest.executable_negative_total).toBe(267);
    expect(generatedManifest.blocked_negative_total).toBe(0);
    expect(generatedManifest.rebound_cases).toBe(22);
  });

  it("generated output: 267 case files, 0 BLOCKED files, master includes 267 exactly once", () => {
    expect(caseFiles).toHaveLength(267);
    expect(caseFiles.filter((f) => f.endsWith(".BLOCKED.sql"))).toHaveLength(0);
    const includes = master.match(/\\ir cases\/case-\d{4}\.sql/gu) ?? [];
    expect(includes).toHaveLength(267);
    expect(new Set(includes).size).toBe(267);
    for (const f of caseFiles) expect(master).toContain(`\\ir cases/${f}`);
  });

  it("readiness: FIXTURE_PACKAGE_NOT_APPLIED is separate from the executable count", () => {
    expect(manifest.matrix.readiness.status).toBe("FIXTURE_PACKAGE_NOT_APPLIED");
    expect(manifest.matrix.readiness.hold_token).toBe(
      "HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED",
    );
    expect(manifest.matrix.readiness.note).toContain("execution_authorized");
    const readiness = manifest.operator_privilege_contract.execution_readiness;
    expect(readiness.status).toBe("FIXTURE_PACKAGE_NOT_APPLIED");
    expect(readiness.current_blocked_total).toBe(0);
    expect(readiness.rule).toContain("fixture package is applied and verified");
    expect(readiness.rule).toContain("baseline");
    expect(readiness.rule).toContain("execution_authorized");
    // readiness never reduces the executable case count
    expect(manifest.matrix.executable_negative_total).toBe(267);
  });

  it("fixture contract pins: deterministic identities and exact counts", () => {
    const fp = matrix.fixture_package;
    expect(fp.package_id).toContain("B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13");
    expect(fp.status).toBe("NOT_APPLIED");
    expect(fp.marker).toBe("TEST_ONLY_B1_FIXTURE_13");
    expect(fp.requests).toBe(19);
    expect(fp.runtime_steps).toBe(104);
    expect(fp.active_steps).toBe(19);
    expect(fp.transfer_detail_rows).toBe(5);
    expect(fp.fixtures).toHaveLength(19);
    for (const f of fp.fixtures as any[]) {
      const ord = String(f.ordinal);
      expect(f.request_id).toBe(`f1300000-0000-4000-8000-${ord.padStart(12, "0")}`);
      expect(f.request_number).toBe(`SR-20260801-13${ord.padStart(6, "0")}`);
      expect(f.active_step_id).toMatch(
        new RegExp(`^f1300001-0000-4000-8000-${ord.padStart(6, "0")}\\d{6}$`, "u"),
      );
      expect(f.active_step_id).toBe(
        `f1300001-0000-4000-8000-${ord.padStart(6, "0")}${String(f.active_step_order).padStart(6, "0")}`,
      );
    }
    // the preflight asserts the same contract
    expect(preflight).toContain("TEST_ONLY_B1_FIXTURE_13");
    expect(preflight).toContain("SR-20260801-13%");
  });

  it("department model: IT source, CS target, CIS unrelated are three distinct departments", () => {
    const model = matrix.fixture_package.department_model;
    const ids = [model.source_department_id, model.target_department_id, model.unrelated_department_id];
    expect(new Set(ids).size).toBe(3);
    const heads = [model.source_head_user_id, model.target_head_user_id, model.unrelated_head_user_id];
    expect(new Set(heads).size).toBe(3);
    for (const id of [...ids, ...heads]) expect(id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("renderer fails closed when fixture pins are absent or manifest and MATRIX disagree", () => {
    expect(renderer).toContain("FIXTURE_REBIND_PIN_MISSING");
    expect(renderer).toContain("FIXTURE_READINESS_STATUS_MISSING");
    expect(renderer).toContain("MANIFEST_EXECUTABLE_COUNT_MISMATCH");
    expect(renderer).toContain("MANIFEST_BLOCKED_COUNT_MISMATCH");
    expect(renderer).toContain("MATRIX_EXECUTABLE_TOTAL_FIELD_MISMATCH");
    expect(renderer).toContain("MATRIX_BLOCKED_FIELD_MISMATCH");
  });

  it("execution stays gated: baseline gate and fixture gate both run before psql", () => {
    // launcher order: baseline gate -> render -> fixture readiness gate ->
    // execution authorization gate -> psql
    const baselineIdx = launcher.indexOf("$baselineHold = 'HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE'");
    const fixtureIdx = launcher.indexOf("RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED", baselineIdx);
    const authIdx = launcher.indexOf("function Deny-Authorization", fixtureIdx);
    const psqlIdx = launcher.indexOf("& psql ");
    expect(baselineIdx).toBeGreaterThan(-1);
    expect(fixtureIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    expect(psqlIdx).toBeGreaterThan(-1);
    expect(baselineIdx).toBeLessThan(psqlIdx);
    expect(fixtureIdx).toBeLessThan(psqlIdx);
    expect(authIdx).toBeLessThan(psqlIdx);
    expect(launcher).toContain("HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED");
    expect(manifest.authoritative_baseline.status).toBe("PENDING");
    // REMEDIATION-26: the PINNED baseline never authorizes execution by itself.
    expect(manifest.authoritative_baseline.execution_authorized).toBe(false);
    // the SQL preflight carries the same fail-closed gates
    expect(preflight).toContain("HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE");
    expect(preflight).toContain("HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED");
  });

});
