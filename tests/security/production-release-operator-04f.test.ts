import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PRODUCTION_DEPLOY_APPROVAL,
  PRODUCTION_ORIGIN,
  PRODUCTION_PUBLISH_APPROVAL,
  assertApprovalToken,
  assertCanonicalProductionOrigin,
  assertNoStoreHeader,
  assertProductionBuildInputs,
  assertProductionBuildShaMeta,
  assertProductionVersionPayload,
  normalizeProductionReleaseSha,
  normalizeRollbackDeploymentId,
} from "../../scripts/production/production-release-contract";
import { PRODUCTION_SUPABASE_URL } from "../../src/integrations/supabase/deployment-profile";

const ROOT = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const SHA = "da71d95d22c3cbccc879ca80b012d28627ac644b";
const PUBLIC_KEY = "sb_publishable_04f_public_test_value";

describe("04F — production release identity", () => {
  test("accepts only a full candidate SHA and canonical origin", () => {
    expect(normalizeProductionReleaseSha(SHA.toUpperCase())).toBe(SHA);
    expect(() => normalizeProductionReleaseSha("da71d95d")).toThrow(
      /PRODUCTION_RELEASE_GATE_REQUIRED/,
    );
    expect(assertCanonicalProductionOrigin(PRODUCTION_ORIGIN).origin).toBe(PRODUCTION_ORIGIN);
    expect(() => assertCanonicalProductionOrigin("https://www.quboolye.com")).toThrow(
      /must use exactly/,
    );
    expect(() => assertCanonicalProductionOrigin("https://quboolye.com/path")).toThrow(
      /must use exactly/,
    );
  });

  test("requires the exact production runtime profile without returning the key", () => {
    expect(
      assertProductionBuildInputs({
        buildSha: SHA,
        deployTarget: "production",
        publishableKey: PUBLIC_KEY,
        supabaseUrl: PRODUCTION_SUPABASE_URL,
      }),
    ).toEqual({ buildSha: SHA, deployTarget: "production", supabaseUrl: PRODUCTION_SUPABASE_URL });

    expect(() =>
      assertProductionBuildInputs({
        buildSha: SHA,
        deployTarget: "staging",
        publishableKey: PUBLIC_KEY,
        supabaseUrl: PRODUCTION_SUPABASE_URL,
      }),
    ).toThrow(/PRODUCTION_RELEASE_GATE_REQUIRED/);
    expect(() =>
      assertProductionBuildInputs({
        buildSha: SHA,
        deployTarget: "production",
        publishableKey: "sb_secret_forbidden",
        supabaseUrl: PRODUCTION_SUPABASE_URL,
      }),
    ).toThrow(/PRODUCTION_RELEASE_GATE_REQUIRED/);
  });

  test("requires matching no-store JSON and HTML provenance", () => {
    expect(() => assertNoStoreHeader("private, no-store")).not.toThrow();
    expect(() => assertNoStoreHeader("max-age=60")).toThrow(/no-store/);
    expect(() => assertProductionVersionPayload({ sha: SHA }, SHA)).not.toThrow();
    expect(() => assertProductionVersionPayload({ sha: SHA, env: "production" }, SHA)).toThrow(
      /return only/,
    );
    expect(() =>
      assertProductionBuildShaMeta(`<meta name="build-sha" content="${SHA}">`, SHA),
    ).not.toThrow();
    expect(() =>
      assertProductionBuildShaMeta('<meta name="build-sha" content="unknown">', SHA),
    ).toThrow(/exact candidate SHA/);
  });
});

describe("04F — operator gates", () => {
  test("requires a recorded rollback target and the two exact approvals", () => {
    expect(normalizeRollbackDeploymentId("deploy_healthy-20260829")).toBe(
      "deploy_healthy-20260829",
    );
    expect(() => normalizeRollbackDeploymentId("")).toThrow(/deployment ID/);
    expect(() =>
      assertApprovalToken(PRODUCTION_DEPLOY_APPROVAL, PRODUCTION_DEPLOY_APPROVAL),
    ).not.toThrow();
    expect(() =>
      assertApprovalToken(PRODUCTION_PUBLISH_APPROVAL, PRODUCTION_PUBLISH_APPROVAL),
    ).not.toThrow();
    expect(() => assertApprovalToken("approved", PRODUCTION_PUBLISH_APPROVAL)).toThrow(
      /explicit approval/,
    );
  });

  test("documents the Lovable-only single writer and database-free rollback", () => {
    const packet = read("docs/go-live/operator-packets/LOVABLE-PRODUCTION-RELEASE-04F.txt");
    expect(packet).toContain("PRODUCTION_WRITER=LOVABLE_ONLY");
    expect(packet).toContain("SINGLE_WRITER_LEASE=REQUIRED");
    expect(packet).toContain(PRODUCTION_DEPLOY_APPROVAL);
    expect(packet).toContain(PRODUCTION_PUBLISH_APPROVAL);
    expect(packet).toContain("NO_DATABASE_ROLLBACK");
    expect(packet).toContain("SET_TO_FINAL_MAIN_SHA_AFTER_04F_MERGE");
    expect(packet).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}|eyJhbGciOi[A-Za-z0-9_-]{8,}/);
  });

  test("keeps the 04F workflow source-only and credential-free", () => {
    const workflow = read(".github/workflows/production-release-contract-04f.yml");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("production-release-operator-04f.test.ts");
    expect(workflow).not.toMatch(/environment:\s*production|secrets\.|wrangler\s+deploy/i);
    expect(workflow).not.toMatch(/(?:uses|run):[^\n]*lovable/i);
    expect(workflow).not.toMatch(/supabase\s+(?:db|migration|functions)/i);
  });

  test("keeps live verification read-only and unauthenticated", () => {
    const verifier = read("scripts/production/verify-production-release.ts");
    expect(verifier).toContain('method: "GET"');
    expect(verifier).toContain('redirect: "manual"');
    expect(verifier).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
    expect(verifier).not.toMatch(/authorization|cookie|service[_-]?role|sb_secret_/i);
  });
});
