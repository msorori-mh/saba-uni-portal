/**
 * PORTAL-B1-ACTOR-IS-ACTIONABLE-VERIFIER-AND-RUNTIME-REGRESSION-REMEDIATION-33
 *
 * SOURCE-ONLY. Pins the four Cursor (Hold) remediations:
 *   G1 owner + search_path (public, pg_temp) for the helper and the 3 RPCs
 *   G2 the five B1 services pinned INDIVIDUALLY (is_active / student_visible)
 *   G3 enrollment_certificate pinned INDIVIDUALLY and untouched
 *   G4 deterministic executable runtime regression (local disposable cluster)
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const DRAFT_PATH = "docs/migration-drafts/B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql";
const VERIFIER_DIR = "docs/migration-drafts/b1-backend-verifiers";
const PREFIX = "30-B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01";
const HARNESS_DIR = "tests/b1-actor-is-actionable-runtime-regression-33";

const draft = read(DRAFT_PATH);
const preflight = read(`${VERIFIER_DIR}/${PREFIX}-PREFLIGHT.sql`);
const structural = read(`${VERIFIER_DIR}/${PREFIX}-STRUCTURAL-VERIFIER.sql`);
const post = read(`${VERIFIER_DIR}/${PREFIX}-POST-VERIFIER.sql`);

const RPCS = [
  "get_my_request_actor_inbox",
  "get_student_request_detail_for_actor",
  "get_student_request_fee_processing_context",
] as const;

const FIVE_SERVICES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

describe("G1 — owner and search_path pins", () => {
  it("draft sets search_path to public, pg_temp on the helper and all three RPCs", () => {
    expect(draft).toContain("set search_path to 'public', 'pg_temp'");
    const pinned = draft.match(/SET search_path TO 'public', 'pg_temp'/g) ?? [];
    expect(pinned.length).toBe(3);
    expect(draft).not.toMatch(/SET search_path TO 'public'\s*\n/);
  });

  it("draft pins ownership of the helper and the three replaced RPCs to postgres", () => {
    expect(draft).toContain(
      "alter function public.workflow_runtime_step_configured_action(uuid) owner to postgres;",
    );
    for (const rpc of RPCS) {
      expect(draft).toMatch(
        new RegExp(`alter function public\\.${rpc}\\([^)]*\\) owner to postgres;`, "i"),
      );
    }
  });

  it("structural and post verifiers assert owner, security mode, volatility and search_path fail-closed", () => {
    for (const file of [structural, post]) {
      expect(file).toContain('{"search_path=public, pg_temp"}');
      expect(file).toContain("FAIL_HELPER_OWNER");
      expect(file).toContain("FAIL_HELPER_SEARCH_PATH");
      expect(file).toContain("FAIL_HELPER_NOT_SECURITY_DEFINER");
      expect(file).toContain("FAIL_HELPER_NOT_STABLE");
      expect(file).toContain("FAIL_OWNER");
      expect(file).toContain("FAIL_SEARCH_PATH");
      expect(file).toContain("FAIL_NULL_ACL_DEFAULT_PUBLIC_EXECUTE");
      expect(file).toContain("FAIL_ACL_DRIFT");
    }
  });

  it("preflight captures the pre-apply owner/ACL baseline of the three RPCs", () => {
    expect(preflight).toContain("P9:");
    expect(preflight).toContain("has_function_privilege");
    expect(preflight).toContain("FAIL_HELPER_ALREADY_EXISTS");
    for (const rpc of RPCS) expect(preflight).toContain(rpc);
  });
});

describe("G2/G3 — request type visibility pinned individually", () => {
  it("pins each of the five B1 services by exact code in all three verifiers", () => {
    for (const file of [preflight, structural, post]) {
      for (const code of FIVE_SERVICES) expect(file).toContain(`('${code}')`);
      expect(file).toContain("FAIL_STUDENT_VISIBLE");
      expect(file).toContain("FAIL_NOT_ACTIVE");
      expect(file).toContain("FAIL_ROW_COUNT");
    }
  });

  it("pins enrollment_certificate individually as active and student_visible", () => {
    for (const file of [preflight, structural, post]) {
      expect(file).toContain("enrollment_certificate");
    }
    expect(structural).toContain("FAIL_VISIBILITY_CHANGED");
    expect(post).toContain("FAIL_VISIBILITY_CHANGED");
    expect(structural).toContain("FAIL_EC_FUNCTION_TOUCHED");
  });

  it("draft performs no DML on request_types and no visibility change", () => {
    const code = draft
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\b(update|insert into|delete from)\b/i);
    expect(code).not.toContain("student_visible");
  });
});

describe("G4 — deterministic executable runtime regression", () => {
  it("ships schema, cases, runner and recorded results", () => {
    for (const f of ["pg/10-minimal-schema.sql", "pg/30-cases.sql", "run-harness.sh", "RESULTS.md"]) {
      expect(existsSync(join(ROOT, HARNESS_DIR, f))).toBe(true);
    }
  });

  it("applies the draft VERBATIM in a disposable local cluster and never touches production", () => {
    const runner = read(`${HARNESS_DIR}/run-harness.sh`);
    expect(runner).toContain("B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql");
    expect(runner).not.toContain("supabase.co");
    expect(runner).not.toContain("wpmicqriltrowwonknox");
    const cases = read(`${HARNESS_DIR}/pg/30-cases.sql`);
    expect(cases).toContain("ROLLBACK");
  });

  it("records REGRESSION_PASS for cases A..E against the current draft bytes", () => {
    const results = read(`${HARNESS_DIR}/RESULTS.md`);
    expect(results).toContain("REGRESSION_PASS");
    for (const c of ["| A |", "| B |", "| C |", "| D |", "| E |"]) expect(results).toContain(c);
    const sha = createHash("sha256").update(draft, "utf8").digest("hex");
    expect(results).toContain(sha);
  });
});

describe("promotion map stays truthful", () => {
  it("records the current LF SHA256 of every package artifact and NOT_APPLIED", () => {
    const map = JSON.parse(read(`${VERIFIER_DIR}/PROMOTION-MAP.json`));
    const list: Array<Record<string, unknown>> = Array.isArray(map) ? map : map.packages;
    const entry = list.find((e) => e.draft === "B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql");
    expect(entry).toBeTruthy();
    expect(entry!.apply_status).toBe("NOT_APPLIED");
    expect(entry!.migration).toBeNull();

    const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    expect(entry!.draft_sha_lf).toBe(sha(draft));
    expect(entry!.preflight_sha_lf).toBe(sha(preflight));
    expect(entry!.structural_verifier_sha_lf).toBe(sha(structural));
    expect(entry!.post_verifier_sha_lf).toBe(sha(post));
  });

  it("the draft is still absent from applied migrations", () => {
    const applied = readdirSync(join(ROOT, "supabase/migrations"));
    expect(
      applied.some((f) =>
        readFileSync(join(ROOT, "supabase/migrations", f), "utf8").includes(
          "workflow_runtime_step_configured_action",
        ),
      ),
    ).toBe(false);
  });
});
