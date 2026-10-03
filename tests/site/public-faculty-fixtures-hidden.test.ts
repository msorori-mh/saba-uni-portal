import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isTestFacultyRow, publicFacultyOnly } from "../../src/lib/public-faculty";

describe("public faculty directory — fixture identities are hidden", () => {
  // Shapes taken from rows that were visible on /faculty (2026-10-01 audit).
  const fixtures = [
    { employee_id: "DEMO-F-004", full_name_ar: "أ.د. طارق عبدالله الرداعي", full_name_en: null, rank: "أستاذ" },
    { employee_id: "DEMO-FAC", full_name_ar: "حساب تجريبي - عضو هيئة تدريس", full_name_en: null, rank: "أستاذ مساعد" },
    { employee_id: "f218", full_name_ar: "دكتور تجريبي", full_name_en: null, rank: "أستاذ مساعد" },
    { employee_id: "TEST-260930-F05", full_name_ar: "عضو هيئة تدريس وعميد الكلية — اختبار افتراضي", full_name_en: "TEST ONLY - Dean", rank: "أستاذ" },
    { employee_id: null, full_name_ar: "عضو", full_name_en: null, rank: "TEST_ONLY" },
  ];
  const real = [
    { employee_id: "E-1021", full_name_ar: "أ.م.د. مختار حسين السروري", full_name_en: null, rank: "Associate Professor" },
    { employee_id: "demographics-1", full_name_ar: "د. عضو حقيقي", full_name_en: "Real Member", rank: "معيد" },
  ];

  test("fixtures are detected and real members kept", () => {
    for (const row of fixtures) expect(isTestFacultyRow(row)).toBe(true);
    for (const row of real) expect(isTestFacultyRow(row)).toBe(false);
    expect(publicFacultyOnly([...fixtures, ...real])).toEqual(real);
  });

  test("the shared public query applies the filter", () => {
    const src = readFileSync("src/lib/queries.ts", "utf8");
    expect(src).toContain("return publicFacultyOnly(data ?? []);");
  });
});
