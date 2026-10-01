import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { memberCount, normalizeRank, programCountLabel, programDescription } from "../../src/lib/public-site-format";

describe("public site formatting", () => {
  test("normalizes Arabic and English ranks", () => {
    expect(normalizeRank("Assistant Professor")).toBe("assistant");
    expect(normalizeRank("أستاذ مساعد")).toBe("assistant");
    expect(normalizeRank("أستاذ")).toBe("professor");
    expect(normalizeRank("Associate Professor")).toBe("associate");
    expect(normalizeRank("TEST_ONLY")).toBeNull();
  });
  test("Arabic count agreement", () => {
    expect(memberCount(1)).toBe("عضو واحد");
    expect(memberCount(2)).toBe("عضوان");
    expect(memberCount(6)).toBe("6 أعضاء");
    expect(memberCount(12)).toBe("12 عضوًا");
    expect(programCountLabel(8)).toBe("8 برامج");
  });
  test("description fallback", () => {
    expect(programDescription({ name_ar: "نظم المعلومات - الجوف", description_ar: null })).toContain("نظم المعلومات - الجوف");
  });
  test("sitemap excludes noindex pages", () => {
    const src = readFileSync("src/routes/sitemap[.]xml.ts", "utf8");
    for (const p of ["/portal-login", "/forgot-password", "/reset-password", "/messages", "/verify-document"]) {
      expect(src).not.toContain(`"${p}"`);
    }
    expect(src).toContain('"/privacy"');
  });
});
