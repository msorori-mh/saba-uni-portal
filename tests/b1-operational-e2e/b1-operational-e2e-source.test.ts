import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const harness = join(root, "tests/b1-operational-e2e/run-harness.ps1");
const report = join(
  root,
  "docs/PORTAL-FIRST-DELIVERY-FIVE-SERVICES-LOCAL-OPERATIONAL-E2E-01-REPORT.md",
);

const five = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

describe("B1 local operational E2E harness — source surface", () => {
  it("pins SEQ07-B→24 + Gate25 + operational namespace", () => {
    expect(existsSync(harness)).toBe(true);
    const body = readFileSync(harness, "utf8");
    expect(body).toContain("TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E");
    expect(body).toContain("local-seq07b-through-24.ps1");
    expect(body).toContain("Invoke-B1Seq07bThrough24Chain");
    expect(body).toContain("Invoke-B1F1F2HardeningLocalOnly");
    expect(body).toContain("35-activate-workflows-local-only.sql");
    expect(body).toContain("40-lifecycle-five-services.sql");
    expect(body).toContain("65-per-service-ec-checkpoints.sql");
    expect(body).toContain("F1F2_AFTER_SEQ24_NOT_GATE25=PASS");
    expect(body).toContain("GATE25_IS_NOT_F1F2=PASS");
    expect(body).toContain("docker stop");
    expect(body).not.toMatch(/supabase\s+db\s+push|force-push|student_visible\s*=\s*true/i);
    expect(body).not.toMatch(
      /Invoke-B1DockerPsqlFile[\s\S]{0,180}20260725110000_b1_07_secure_attachments_source_01/,
    );
  });

  it("covers five services and protects enrollment_certificate", () => {
    const life = readFileSync(
      join(root, "tests/b1-integrated-runtime/pg/40-lifecycle-five-services.sql"),
      "utf8",
    );
    for (const code of five) expect(life).toContain(code);
    const ec = readFileSync(
      join(root, "tests/b1-operational-e2e/pg/65-per-service-ec-checkpoints.sql"),
      "utf8",
    );
    expect(ec).toContain("enrollment_certificate");
    for (const code of five) expect(ec).toContain(code);
  });

  it("reserves mission report path", () => {
    expect(
      report.endsWith(
        "PORTAL-FIRST-DELIVERY-FIVE-SERVICES-LOCAL-OPERATIONAL-E2E-01-REPORT.md",
      ),
    ).toBe(true);
  });
});
