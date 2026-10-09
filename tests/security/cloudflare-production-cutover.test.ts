import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertProductionBuildInputs, assertProductionSmokeResponse, CUTOVER_SUPABASE_URL, finalizeProductionConfig } from "../../scripts/production/cloudflare-production-contract";

const workflow = readFileSync(resolve(import.meta.dir, "../../.github/workflows/cloudflare-production.yml"), "utf8");
const key = "sb_publishable_12345678901234567890";
const sha = "a".repeat(40);

describe("LOVABLE-EXIT-02 production cutover", () => {
  test("production inputs reject rehearsal, legacy, staging and server keys", () => {
    expect(() => assertProductionBuildInputs(CUTOVER_SUPABASE_URL, key, "production")).not.toThrow();
    for (const url of ["https://pwapivqjofdsevycegph.supabase.co", "https://wpmicqriltrowwonknox.supabase.co", undefined]) {
      expect(() => assertProductionBuildInputs(url, key, "production")).toThrow();
    }
    expect(() => assertProductionBuildInputs(CUTOVER_SUPABASE_URL, key, "staging")).toThrow();
    expect(() => assertProductionBuildInputs(CUTOVER_SUPABASE_URL, "sb_secret_12345678901234567890", "production")).toThrow();
    expect(() => assertProductionBuildInputs(CUTOVER_SUPABASE_URL, undefined, "production")).toThrow();
  });
  test("adds exactly the two custom domains and runtime binding compatibility", () => {
    const out = finalizeProductionConfig({ account_id: "ignored", compatibility_flags: ["nodejs_compat"] });
    expect(out.name).toBe("saba-uni-portal-production");
    expect(out.workers_dev).toBe(false);
    expect(out.routes).toEqual([{ pattern: "quboolye.com", custom_domain: true }, { pattern: "www.quboolye.com", custom_domain: true }]);
    expect(out.account_id).toBeUndefined();
    expect(out.compatibility_flags).toContain("nodejs_compat_populate_process_env");
    expect(() => finalizeProductionConfig({ routes: [] })).toThrow();
    expect(() => finalizeProductionConfig({ route: "foreign.example" })).toThrow();
  });
  test("smoke fails closed on wrong SHA, redirects and unavailable pages", () => {
    expect(() => assertProductionSmokeResponse("/version.json", 200, JSON.stringify({ sha }), sha)).not.toThrow();
    expect(() => assertProductionSmokeResponse("/version.json", 200, JSON.stringify({ sha: "b".repeat(40) }), sha)).toThrow();
    for (const path of ["/", "/portal-login"]) {
      expect(() => assertProductionSmokeResponse(path, 200, "html", sha)).not.toThrow();
      for (const status of [302, 403, 500]) expect(() => assertProductionSmokeResponse(path, status, "html", sha)).toThrow();
    }
  });
  test("workflow remains manual/main-only with exact SHA, dry-run size gate and rollback", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
    for (const value of ["refs/heads/main", "git rev-parse origin/main", "environment: supabase-production", "WORKER_NAME: saba-uni-portal-production", `VITE_SUPABASE_URL: ${CUTOVER_SUPABASE_URL}`, "VITE_PORTAL_DEPLOY_TARGET: production", "--dry-run", "assert-cloudflare-staging-size.ts", "wrangler rollback", "steps.deploy.outcome == 'success'", "RESEND_API_KEY:$resend", 'SITE_URL:"https://quboolye.com"', "verify-cloudflare-production-deployment.ts"]) expect(workflow).toContain(value);
    expect(workflow).not.toMatch(/supabase (db push|migration)|psql /);
  });
});
