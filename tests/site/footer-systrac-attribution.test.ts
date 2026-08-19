import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const footer = readFileSync("src/components/site/Footer.tsx", "utf8");
const home = readFileSync("src/routes/index.tsx", "utf8");

describe("public footer attribution", () => {
  test("credits SysTrac without displacing the university identity", () => {
    expect(footer).toContain("تم تصميم وتطوير البوابة بواسطة");
    expect(footer).toContain("SysTrac للأنظمة والحلول التقنية");
    expect(footer).toContain("https://sys-reimagined-studio.lovable.app/");
    expect(footer).toContain('rel="noreferrer noopener"');
    expect(footer.indexOf("{universityName}")).toBeLessThan(
      footer.indexOf("SysTrac للأنظمة والحلول التقنية"),
    );
  });

  test("reduces the excessive pre-footer gap responsively", () => {
    expect(footer).toContain("mt-8 md:mt-12");
    expect(footer).not.toContain("mt-20 border-t-4");
  });

  test("uses one consistent contact label", () => {
    expect(footer).toContain("تواصل معنا");
    expect(footer).not.toContain("صفحة التواصل");
    expect(home).not.toContain("صفحة التواصل الكاملة");
  });
});
