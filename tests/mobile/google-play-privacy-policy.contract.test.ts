import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Google Play public privacy policy", () => {
  const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
  const footer = readFileSync("src/components/site/Footer.tsx", "utf8");

  test("is a public Arabic application route with required disclosures", () => {
    expect(privacy).toContain('createFileRoute("/privacy")');
    expect(privacy).toContain('dir="rtl"');
    expect(privacy).toContain("سياسة الخصوصية");
    expect(privacy).toContain("البيانات التي نعالجها");
    expect(privacy).toContain("لا نبيع البيانات الشخصية");
    expect(privacy).toContain("لا يجمع التطبيق صورة البصمة");
    expect(privacy).toContain("طلبات التصحيح أو الحذف");
    expect(privacy).toContain("support@it.saba.edu.ye");
  });

  test("is discoverable from the public site footer", () => {
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain("سياسة الخصوصية");
  });
});
