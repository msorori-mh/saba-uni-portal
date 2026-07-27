import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const shared = readFileSync(
  join(root, "tests/b1-delivery-chain/local-seq07b-through-24.ps1"),
  "utf8",
);
const proof = readFileSync(
  join(root, "tests/b1-delivery-chain/pg/40-seq07b-canonical-proof.sql"),
  "utf8",
);
const ops = readFileSync(join(root, "tests/b1-operational-e2e/run-harness.ps1"), "utf8");
const auth = readFileSync(
  join(root, "tests/b1-five-services-authorization/run-full-matrix.ps1"),
  "utf8",
);

describe("B1 delivery chain — SEQ07-B canonical bootstrap", () => {
  it("bans original SEQ07 apply and pins SEQ07-B→24 shared helper", () => {
    expect(shared).toContain("FORBIDDEN_ORIGINAL_SEQ07_APPLY_PATH");
    expect(shared).toContain("20260725110050_b1_07b_secure_attachments_sql_only_01.sql");
    expect(shared).toContain("Invoke-B1Seq07bThrough24Chain");
    expect(shared).toContain("Invoke-B1F1F2HardeningLocalOnly");
    expect(shared).toContain("AFTER_SEQ24_BEFORE_OR_WITHIN_LOCAL_OPERATIONAL");
    expect(shared).toContain("f1f2_is_gate25");
    expect(shared).toMatch(/F1F2_PRODUCTION_APPLY=FORBIDDEN|f1f2_production',\s*'FORBIDDEN'/);
  });

  it("SQL proof asserts original SEQ07 absent and SEQ07-B once", () => {
    expect(proof).toContain("ORIGINAL_SEQ07_PRESENT_IN_APPLY_LOG");
    expect(proof).toContain("SEQ07B_APPLY_LOG_COUNT");
    expect(proof).toContain("20260725110050_b1_07b_secure_attachments_sql_only_01");
    expect(proof).not.toMatch(/APPLY[\s\S]*20260725110000_b1_07_secure_attachments_source_01/);
  });

  it("operational and auth harnesses share the canonical chain with no original SEQ07 apply", () => {
    for (const body of [ops, auth]) {
      expect(body).toContain("local-seq07b-through-24.ps1");
      expect(body).toContain("Invoke-B1Seq07bThrough24Chain");
      expect(body).toContain("Invoke-B1F1F2HardeningLocalOnly");
      expect(body).toContain("ORIGINAL_SEQ07_ABSENT=PASS");
      expect(body).toContain("SEQ07B_APPLIED_EXACTLY_ONCE=PASS");
      expect(body).toContain("NO_SILENT_FALLBACK_TO_ORIGINAL_SEQ07=PASS");
      expect(body).toContain("F1F2_AFTER_SEQ24_NOT_GATE25=PASS");
      expect(body).not.toMatch(
        /Invoke-B1DockerPsqlFile[\s\S]{0,180}20260725110000_b1_07_secure_attachments_source_01/,
      );
      expect(body).not.toMatch(
        /Invoke-PsqlFile[\s\S]{0,180}20260725110000_b1_07_secure_attachments_source_01/,
      );
    }
    expect(ops).toContain("GATE25_LOCAL=PASS");
    expect(ops).toContain("GATE25_IS_NOT_F1F2=PASS");
    expect(auth).toContain("GATE25=SKIPPED_AUTH_MATRIX_NOT_ACTIVATION");
    expect(auth).toContain("AUTH_MATRIX_SAME_DELIVERY_CHAIN=PASS");
  });
});
