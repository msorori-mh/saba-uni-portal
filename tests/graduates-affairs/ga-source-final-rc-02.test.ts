import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const readBytes = (path: string) => readFileSync(join(root, path));

function normalizeLf(raw: Buffer): Buffer {
  const s = raw.toString("binary").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(s, "binary");
}

function sha256Lf(buf: Buffer): string {
  return createHash("sha256").update(normalizeLf(buf)).digest("hex");
}

function bodySha256Lf(buf: Buffer): string {
  const norm = normalizeLf(buf);
  const idx = norm.indexOf(Buffer.from("begin;"));
  expect(idx).toBeGreaterThanOrEqual(0);
  return createHash("sha256").update(norm.subarray(idx)).digest("hex");
}

describe("GA source final RC-02 readiness", () => {
  test("emits SOURCE RC token and keeps production apply fail-closed", () => {
    const report = read(
      "docs/reviews/PORTAL-24H-GRADUATES-AFFAIRS-SOURCE-AND-SPECIALIST-SCOPE-FINAL-RC-02-REPORT.md",
    );
    expect(report).toContain("PASS_GA_SOURCE_FINAL_RC_READY_FOR_PRODUCTION_SEQUENCE");
    expect(report).toContain("PRODUCTION_WRITES=0");
    expect(report).toContain("staffGraduatesAffairs:false");
    expect(report).toContain("studentGraduatesAffairs:false");
    expect(report).toContain("AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE");
    expect(report).toContain("NEXT_WRITE=NONE_SCHEMA");
    expect(report).toContain("GA3_CURRENT=VERIFIED_PRESENT");
  });

  test("preserves exact GA1/GA2/GA3 FULL and BODY hashes", () => {
    const ga1 = readBytes("supabase/migrations/20260808210000_ga_mvp_foundation_01.sql");
    const ga2 = readBytes("supabase/migrations/20260808210100_ga_mvp_completion_01.sql");
    const ga3 = readBytes("supabase/migrations/20260808210200_ga_authorization_04.sql");
    expect(sha256Lf(ga1)).toBe("3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43");
    expect(bodySha256Lf(ga1)).toBe("43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819");
    expect(sha256Lf(ga2)).toBe("3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa");
    expect(bodySha256Lf(ga2)).toBe("834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc");
    expect(sha256Lf(ga3)).toBe("212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c");
    expect(bodySha256Lf(ga3)).toBe("3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd");
  });

  test("specialist decision closes human pick and plans TEST_ONLY without live INSERT", () => {
    const decision = read(
      "docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md",
    );
    expect(decision).toContain("aa4f5c16-c993-4af6-a6d4-59d9542c1a7f");
    expect(decision).toContain("276cf8d1-4bce-4fea-9e96-b1f8dc1bdf0e");
    expect(decision).toContain("AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE");
    expect(decision).toContain("ce485c67-5f7c-498d-b120-4b1130a86ae8");
    expect(decision).toContain("11111111-1111-4111-8111-111111111111");
    expect(decision).toContain("22222222-2222-4222-8222-222222222222");
    expect(decision).toContain("Production writes this package:** `0`");
    expect(decision).toContain("TEST_ONLY_GA_SPECIALIST_E2E_01");
    expect(decision).toContain("a6e30100-0000-4000-a300-000000000001");

    const dryRun = read(
      "docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql",
    );
    expect(dryRun).toContain("AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE");
    expect(dryRun).not.toMatch(/INSERT INTO public\.staff_profile_departments/);
    expect(dryRun).not.toMatch(/^\s*INSERT\b/m);
  });

  test("staff workspace remains present and feature flags stay OFF", () => {
    const workspace = read("src/components/portal/GraduatesAffairsStaffWorkspace.tsx");
    const features = read("src/lib/portal-features.ts");
    const route = read("src/routes/staff.graduates-affairs.tsx");
    expect(workspace).toContain("searchGraduateRecordsFn");
    expect(workspace).toContain("getStaffGraduateFileFn");
    expect(features).toMatch(/staffGraduatesAffairs:\s*false/);
    expect(features).toMatch(/studentGraduatesAffairs:\s*false/);
    expect(route).toContain("portalFeatures.staffGraduatesAffairs");
  });
});
