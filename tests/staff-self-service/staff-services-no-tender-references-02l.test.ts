import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// PORTAL_STAFF_REMOVE_TENDER_REFERENCES_02L
// Contract guard: no user-visible tender/RFP terminology may return to the
// staff portal or the admin staff-management surfaces (Arabic or English).

const FORBIDDEN: RegExp[] = [
  /مناقصة/,
  /مناقصات/,
  /العطاء/,
  /عطاءات/,
  /tender/i,
  /\brfp\b/i,
];

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(dir, entry.name));
}

const SCANNED_FILES: string[] = [
  ...listTsx("src/components/staff-showcase"),
  ...listTsx("src/components/admin/staff-management"),
  "src/routes/staff.tsx",
  "src/routes/staff.index.tsx",
  "src/routes/admin/staff-management.tsx",
  "src/lib/staff-self-service-showcase.ts",
  "src/lib/staff-self-service-live.ts",
  "src/lib/staff-self-service-read.ts",
  "src/lib/staff-self-service-value-added.ts",
];

describe("PORTAL_STAFF_REMOVE_TENDER_REFERENCES_02L", () => {
  test("covers the staff portal and admin staff-management surfaces", () => {
    expect(SCANNED_FILES.length).toBeGreaterThanOrEqual(12);
    expect(SCANNED_FILES).toContain(
      "src/components/staff-showcase/StaffSelfServiceShowcase.tsx",
    );
    expect(SCANNED_FILES).toContain(
      "src/components/admin/staff-management/EmployeeServicesShowcase.tsx",
    );
  });

  test("no tender/RFP terminology remains in any scanned staff surface", () => {
    for (const file of SCANNED_FILES) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source, `${file} must not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("print packs keep neutral institutional naming", () => {
    const staff = readFileSync(
      "src/components/staff-showcase/StaffSelfServiceShowcase.tsx",
      "utf8",
    );
    const admin = readFileSync(
      "src/components/admin/staff-management/EmployeeServicesShowcase.tsx",
      "utf8",
    );
    for (const source of [staff, admin]) {
      expect(source).toContain("طباعة حزمة العرض");
      expect(source).toContain("print:break-after-page");
    }
    expect(staff).toContain("استعراض خدمات الموظفين");
    expect(admin).toContain("استعراض خدمات الموظفين");
    expect(staff).toContain("staff-services-print-pack");
    expect(admin).toContain("admin-services-print-pack");
  });
});
