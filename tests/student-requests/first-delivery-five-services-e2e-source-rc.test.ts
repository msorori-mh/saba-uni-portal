import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const five = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

describe("first-delivery five services integrated source RC", () => {
  it("freezes the five services and protects enrollment_certificate", () => {
    const report = join(
      root,
      "docs/PORTAL-FIRST-DELIVERY-FIVE-SERVICES-INTEGRATED-SOURCE-RC-01-REPORT.md",
    );
    expect(existsSync(report)).toBe(true);
    const body = readFileSync(report, "utf8");
    for (const code of five) expect(body).toContain(code);
    expect(body).toContain("enrollment_certificate");
    expect(body).toContain("TEST_ONLY_FIRST_DELIVERY_5_SERVICES");
    expect(body).not.toMatch(/wpmicqriltrowwonknox.*(write|apply|deploy)/i);
    expect(body).toContain("NO_PRODUCTION_WRITE");
  });

  it("wires mock adapter student+staff contracts without Supabase imports in UI", () => {
    const uiRoot = join(root, "src/components/student-requests");
    const files = readdirSync(uiRoot, { recursive: true, encoding: "utf8" }) as string[];
    for (const rel of files.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))) {
      const src = readFileSync(join(uiRoot, rel), "utf8");
      expect(src).not.toMatch(/from\s+['"]@supabase\//);
      expect(src).not.toMatch(/createClient\(/);
    }
    const mock = readFileSync(join(root, "src/lib/student-requests/b1-ui/adapter.mock.ts"), "utf8");
    expect(mock).toContain("createMockB1UiAdapter");
    expect(mock).toContain("confirmB1RevenueReceipt");
    const adapter = readFileSync(
      join(root, "src/lib/student-requests/request-service-adapter.ts"),
      "utf8",
    );
    for (const code of five) expect(adapter).toContain(code);
  });

  it("keeps finance confirmation free of amount/currency/invoice fields", () => {
    const payment = readFileSync(
      join(root, "docs/migration-drafts/EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql"),
      "utf8",
    ).toLowerCase();
    for (const forbidden of ["amount numeric", "currency text", "invoice", "gateway_transaction"]) {
      expect(payment).not.toContain(forbidden);
    }
    expect(payment).toContain("p_note text default null");
  });

  it("requires authorization matrix harness artifacts for direct RPC proof", () => {
    expect(existsSync(join(root, "tests/b1-five-services-authorization/run-full-matrix.ps1"))).toBe(
      true,
    );
    expect(
      existsSync(join(root, "tests/b1-five-services-authorization/rpc-authorization-harness.sql")),
    ).toBe(true);
    const matrix = JSON.parse(
      readFileSync(
        join(root, "tests/b1-five-services-authorization/authorization-matrix.json"),
        "utf8",
      ),
    ) as { services: unknown[]; negative_cases: string[]; protected_records: string[] };
    expect(matrix.services).toHaveLength(5);
    expect(matrix.negative_cases.length).toBeGreaterThanOrEqual(20);
    expect(matrix.protected_records).toEqual(
      expect.arrayContaining([
        "SR-20260716-26BAD4C8",
        "SR-20260715-FEDCB3E1",
        "SR-20260713-2DE64041",
        "USR-2026-000001",
        "USR-2026-000002",
      ]),
    );
  });

  it("documents student/staff negative direct-access expectations", () => {
    const report = readFileSync(
      join(root, "docs/PORTAL-FIRST-DELIVERY-FIVE-SERVICES-INTEGRATED-SOURCE-RC-01-REPORT.md"),
      "utf8",
    );
    for (const needle of [
      "student A cannot access student B",
      "staff A cannot access staff B",
      "wrong role rejected",
      "no admin bypass",
      "360px",
      "768px",
      "1366px",
      "RTL",
    ]) {
      expect(report.toLowerCase()).toContain(needle.toLowerCase());
    }
  });
});
