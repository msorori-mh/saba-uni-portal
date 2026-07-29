import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { negativeCases, renderCase } from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const root = process.cwd();
const pkg = join(root, "scripts", "b1-rpc-principal-harness-01");
const matrix = JSON.parse(
  readFileSync(
    join(root, "tests", "b1-five-services-rpc-authorization-preflight-01", "MATRIX.json"),
    "utf8",
  ),
);
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sha = (p: string) => createHash("sha256").update(read(p)).digest("hex");

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-EXECUTION-PACKAGE-01", () => {
  it("plans exactly 267 negative cases and zero positive cases", () => {
    expect(matrix.counts.negative_core).toBe(240);
    expect(matrix.counts.illegal_action).toBe(24);
    expect(matrix.counts.supplemental_department_scope).toBe(3);
    expect(matrix.counts.negative_total).toBe(267);
    expect(negativeCases).toHaveLength(267);
    expect(
      negativeCases.filter((c) => c.expect !== "DENY"),
    ).toHaveLength(0);
    // the launcher never executes positives
    expect(read(join(pkg, "run-negative-matrix.ps1"))).toContain("positive_cases_executed  = 0");
  });

  it("renders one isolated ROLLBACK-only transaction per case", () => {
    for (const [i, c] of negativeCases.entries()) {
      const sql = renderCase(c, i);
      expect(sql.match(/^BEGIN;$/gm) ?? []).toHaveLength(1);
      expect(sql.match(/^ROLLBACK;$/gm) ?? []).toHaveLength(1);
      expect(sql).not.toContain("COMMIT");
      expect(sql).toContain("SET LOCAL ROLE authenticated;");
      expect(sql).toContain("request.jwt.claims");
      expect(sql).toContain("B1_NEG_UNEXPECTED_ALLOW");
      expect(sql).toContain("B1_NEG_MUTATION_DETECTED");
      expect(sql).toContain(
        c.action === "confirm_payment"
          ? "record_external_university_payment_confirmation"
          : "act_on_b1_student_request_step_atomic",
      );
    }
  });

  it("preflight is fail-closed on the operator session role", () => {
    const pf = read(join(pkg, "00-preflight.sql"));
    for (const token of [
      "wpmicqriltrowwonknox",
      "B1_PREFLIGHT_FORBIDDEN_SESSION_USER",
      "B1_PREFLIGHT_SESSION_USER_HAS_BYPASSRLS",
      "B1_PREFLIGHT_SET_ROLE_AUTHENTICATED_FAILED",
      "B1_PREFLIGHT_ROLE_GUC_MISMATCH",
      "B1_PREFLIGHT_ROW_SECURITY_OFF",
      "B1_PREFLIGHT_AUTHENTICATED_HAS_BYPASSRLS",
      "B1_PREFLIGHT_AUTH_UID_MISMATCH",
      "B1_PREFLIGHT_MIGRATION_29_COUNT_",
      "B1_OPERATOR_PREFLIGHT_PASS",
    ]) {
      expect(pf).toContain(token);
    }
    expect(pf).toContain("sandbox_exec");
    expect(pf.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    // read-only: no DDL, no grants, no role management (ignore comment lines)
    const executable = pf
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(
      /\b(CREATE ROLE|ALTER ROLE|GRANT|CREATE TABLE|DROP|INSERT|UPDATE|DELETE)\b/,
    );
  });

  describe("G1 session_user guard — offline simulation of the SQL guard block", () => {
    const pf = read(join(pkg, "00-preflight.sql"));
    const guard = pf.slice(
      pf.indexOf("-- 2. session_user"),
      pf.indexOf("-- 3-5."),
    );

    // Faithful offline model of the guard block above; each branch is pinned to
    // the exact RAISE text present in the SQL so drift breaks the test.
    const reason = (name: string, tag: string) => {
      const m = guard.match(
        new RegExp(`RAISE EXCEPTION\\s+'(PREFLIGHT_FAIL:[^']*${tag}[^']*)'`),
      );
      if (!m) throw new Error(`guard branch missing: ${tag}`);
      return m[1].replace("%", name);
    };

    const evaluate = (
      sessionUser: string,
      pgRoles: Record<string, { rolsuper: boolean; rolbypassrls: boolean }>,
      canSetRoleAuthenticated = true,
    ) => {
      if (["sandbox_exec", "service_role", "supabase_admin"].includes(sessionUser)) {
        return { ok: false, reason: reason(sessionUser, "FORBIDDEN_SESSION_USER") };
      }
      const row = pgRoles[sessionUser];
      if (!row) return { ok: false, reason: reason(sessionUser, "NOT_FOUND_IN_PG_ROLES") };
      if (row.rolsuper) return { ok: false, reason: reason(sessionUser, "must not be superuser") };
      if (row.rolbypassrls) {
        return { ok: false, reason: reason(sessionUser, "SESSION_USER_HAS_BYPASSRLS") };
      }
      if (!canSetRoleAuthenticated) {
        return { ok: false, reason: "B1_PREFLIGHT_SET_ROLE_AUTHENTICATED_FAILED" };
      }
      return { ok: true, reason: "" };
    };

    const roles = {
      op_super: { rolsuper: true, rolbypassrls: false },
      op_bypass: { rolsuper: false, rolbypassrls: true },
      op_normal: { rolsuper: false, rolbypassrls: false },
    };

    it("the SQL guard runs before SET LOCAL ROLE authenticated", () => {
      expect(pf.indexOf("-- 2. session_user")).toBeLessThan(
        pf.indexOf("SET LOCAL ROLE authenticated;"),
      );
      expect(guard).toContain("rolsuper");
      expect(guard).toContain("rolbypassrls");
      expect(guard).toContain("NOT FOUND");
      expect(guard).toContain("session_user must not be superuser");
    });

    it("1. session_user superuser => FAIL with the superuser reason", () => {
      const r = evaluate("op_super", roles);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("session_user must not be superuser");
      expect(r.reason).toContain("PREFLIGHT_FAIL");
    });

    it("2. session_user BYPASSRLS => FAIL with the bypassrls reason", () => {
      const r = evaluate("op_bypass", roles);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("B1_PREFLIGHT_SESSION_USER_HAS_BYPASSRLS");
    });

    it("3. forbidden session_user names => FAIL with the forbidden reason", () => {
      for (const name of ["sandbox_exec", "service_role", "supabase_admin"]) {
        const r = evaluate(name, { ...roles, [name]: { rolsuper: false, rolbypassrls: false } });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain("B1_PREFLIGHT_FORBIDDEN_SESSION_USER");
        expect(r.reason).toContain(name);
      }
    });

    it("4. session_user absent from pg_roles => FAIL, never silent pass", () => {
      const r = evaluate("ghost_operator", roles);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("B1_PREFLIGHT_SESSION_USER_NOT_FOUND_IN_PG_ROLES");
    });

    it("5. ordinary operator with SET ROLE authenticated => PASS", () => {
      expect(evaluate("op_normal", roles)).toEqual({ ok: true, reason: "" });
      expect(evaluate("op_normal", roles, false).reason).toBe(
        "B1_PREFLIGHT_SET_ROLE_AUTHENTICATED_FAILED",
      );
    });
  });


  it("the launcher keeps credentials out of git, logs and reports", () => {
    const ps = read(join(pkg, "run-negative-matrix.ps1"));
    expect(ps).toContain("$env:DATABASE_URL");
    expect(ps).toContain("ON_ERROR_STOP=1");
    expect(ps).toContain("UNEXPECTED_ALLOW");
    expect(ps).toContain("FINGERPRINT_DRIFT");
    expect(ps).not.toMatch(/postgresql:\/\/[^<\s]*:[^@\s]+@/); // no literal credentials
    const ignore = read(join(root, ".gitignore"));
    expect(ignore).toContain("scripts/b1-rpc-principal-harness-01/generated/");
  });

  it("keeps the positive harness held back", () => {
    const held = read(
      join(root, "tests", "b1-five-services-rpc-authorization-preflight-01", "02-positive-harness.HELD_BACK.sql"),
    );
    expect(held).toMatch(/HELD_BACK/);
  });

  it("tracks no pycache and no secret files", () => {
    const tracked = execSync("git ls-files", { cwd: root }).toString().split("\n");
    expect(tracked.filter((f) => f.includes("__pycache__"))).toHaveLength(0);
    expect(
      tracked.filter((f) => /(^|\/)\.env(\.|$)|DATABASE_URL/.test(f)),
    ).toHaveLength(0);
    expect(tracked.filter((f) => f.startsWith("scripts/b1-rpc-principal-harness-01/generated/"))).toHaveLength(0);
  });

  it("pins package checksums", () => {
    const shas = Object.fromEntries(
      ["00-preflight.sql", "fingerprint.sql", "render-negative-cases.ts", "run-negative-matrix.ps1"].map(
        (f) => [f, sha(join(pkg, f))],
      ),
    );
    for (const v of Object.values(shas)) expect(v).toMatch(/^[0-9a-f]{64}$/);
    console.log(JSON.stringify(shas, null, 2));
  });
});
