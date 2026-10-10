import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COLLEGE_REHEARSAL_WORKER_NAME,
  COLLEGE_SUPABASE_URL,
  assertCollegeRehearsalBuildInputs,
  finalizeCollegeRehearsalConfig,
} from "../../scripts/college/college-rehearsal-contract";

const ROOT = resolve(import.meta.dir, "../..");
const workflow = readFileSync(
  resolve(ROOT, ".github/workflows/cloudflare-college-rehearsal.yml"),
  "utf8",
);
const KEY = "sb_publishable_12345678901234567890";

describe("LOVABLE-EXIT-01 — college rehearsal Worker contract", () => {
  test("accepts only the college Supabase URL, the staging profile and a public key", () => {
    expect(() => assertCollegeRehearsalBuildInputs(COLLEGE_SUPABASE_URL, KEY, "staging")).not.toThrow();
    expect(() =>
      assertCollegeRehearsalBuildInputs("https://wpmicqriltrowwonknox.supabase.co", KEY, "staging"),
    ).toThrow(/COLLEGE_REHEARSAL_HOLD/);
    expect(() =>
      assertCollegeRehearsalBuildInputs(COLLEGE_SUPABASE_URL, KEY, "production"),
    ).toThrow(/staging deploy profile/);
    expect(() =>
      assertCollegeRehearsalBuildInputs(COLLEGE_SUPABASE_URL, "sb_secret_abcdefghijklmnopqrstu", "staging"),
    ).toThrow(/COLLEGE_REHEARSAL_HOLD/);
    expect(() =>
      assertCollegeRehearsalBuildInputs(COLLEGE_SUPABASE_URL, undefined, "staging"),
    ).toThrow(/COLLEGE_REHEARSAL_HOLD/);
  });

  test("renames the Worker, keeps workers.dev and enables process.env bindings", () => {
    const out = finalizeCollegeRehearsalConfig({
      name: "saba-uni-portal-staging",
      account_id: "x",
      compatibility_date: "2026-08-28",
      compatibility_flags: ["nodejs_compat"],
    });
    expect(out.name).toBe(COLLEGE_REHEARSAL_WORKER_NAME);
    expect(out.workers_dev).toBe(true);
    expect(out.account_id).toBeUndefined();
    expect(out.compatibility_flags).toEqual(["nodejs_compat", "nodejs_compat_populate_process_env"]);
  });

  test("refuses routes and custom domains", () => {
    expect(() => finalizeCollegeRehearsalConfig({ route: "quboolye.com/*" })).toThrow(/routes/);
    expect(() => finalizeCollegeRehearsalConfig({ routes: [] })).toThrow(/routes/);
  });

  test("workflow is manual, main-only, workers.dev-only and never names the legacy project", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain(`WORKER_NAME: ${COLLEGE_REHEARSAL_WORKER_NAME}`);
    expect(workflow).toContain(`VITE_SUPABASE_URL: ${COLLEGE_SUPABASE_URL}`);
    expect(workflow).toContain("VITE_PORTAL_DEPLOY_TARGET: staging");
    expect(workflow).not.toContain("wpmicqriltrowwonknox");
    expect(workflow).not.toMatch(/quboolye\.com\/|routes?:/);
    expect(workflow).not.toMatch(/supabase (db push|migration)|psql /);
  });
});
