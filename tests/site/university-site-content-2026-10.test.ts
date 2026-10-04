import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// المصدر: صفحة الكلية في موقع جامعة إقليم سبأ (usr.edu.ye) — معلومات التواصل وبرامج الكلية.
describe("public content matches the university site", () => {
  const contact = read("src/routes/contact.tsx");

  it("uses the official college contact channels only", () => {
    for (const p of ["src/routes/contact.tsx", "src/routes/privacy.tsx", "src/routes/portal-login.tsx"]) {
      expect(read(p)).not.toContain("saba.edu.ye\"");
      expect(read(p)).not.toContain("it.saba.edu.ye");
    }
    expect(read("src/routes/privacy.tsx")).toContain("itandcs@usr.edu.ye");
    for (const phone of ["6302008", "6301274", "77963595"]) expect(contact).toContain(phone);
    expect(contact).toContain("اليمن — مأرب — المدينة");
  });

  it("FAQ lists the five official bachelor programs and no invented admission numbers", () => {
    expect(contact).toContain("الذكاء الاصطناعي (يركز على علم البيانات)");
    expect(contact).not.toContain("70%");
    expect(contact).toContain("ماجستير علوم الحاسوب وماجستير تكنولوجيا المعلومات");
  });
  it("about page carries the official about text, values and goals", () => {
    const about = read("src/routes/about.tsx");
    expect(about).toContain("نبذة عن الكلية");
    expect(about).toContain("إحدى الكليات العلمية الرائدة في إعداد كوادر مؤهلة");
    expect(about).toContain("تعزيز الانتماء للكلية، وتطبيق اللوائح والقوانين والأنظمة.");
    expect(about).toContain("والإسهام في التنمية الاجتماعية والاقتصادية.");
    expect(about).toContain("whitespace-pre-line");
  });
});
