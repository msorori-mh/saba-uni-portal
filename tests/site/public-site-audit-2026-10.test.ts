import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  arabicMemberCount,
  displayRankAr,
  isTestFacultyRow,
  normalizeRank,
  publicFacultyOnly,
} from "../../src/lib/public-faculty";
import { arabicYears, programDegree, programDescription, programYears } from "../../src/lib/program-display";
import { renderSitemap, STATIC_SITEMAP_ENTRIES } from "../../src/lib/sitemap";

describe("public faculty directory — fixture identities are hidden", () => {
  // Shapes taken from the rows that were visible on /faculty (2026-10-01 audit).
  const fixtures = [
    { employee_id: "DEMO-F-004", full_name_ar: "أ.د. طارق عبدالله الرداعي", full_name_en: null, rank: "أستاذ" },
    { employee_id: "DEMO-F-003", full_name_ar: "د. رمزي حميد", full_name_en: null, rank: "أستاذ مشارك" },
    { employee_id: "DEMO-FAC", full_name_ar: "حساب تجريبي - عضو هيئة تدريس", full_name_en: null, rank: "أستاذ مساعد" },
    { employee_id: "f218", full_name_ar: "دكتور تجريبي", full_name_en: null, rank: "أستاذ مساعد" },
    {
      employee_id: "TEST-260930-F05",
      full_name_ar: "عضو هيئة تدريس وعميد الكلية — اختبار افتراضي",
      full_name_en: "TEST ONLY - Dean",
      rank: "أستاذ",
    },
    { employee_id: null, full_name_ar: "عضو", full_name_en: null, rank: "TEST_ONLY" },
  ];
  const real = [
    { employee_id: "E-1021", full_name_ar: "أ.م.د. مختار حسين السروري", full_name_en: null, rank: "Associate Professor" },
    { employee_id: null, full_name_ar: "د. رمزي حميد الجابري", full_name_en: null, rank: "Assistant Professor" },
    { employee_id: "demographics-1", full_name_ar: "د. عضو حقيقي", full_name_en: "Real Member", rank: "معيد" },
  ];

  test("every fixture row is detected", () => {
    for (const row of fixtures) expect(isTestFacultyRow(row)).toBe(true);
  });

  test("real members are kept", () => {
    for (const row of real) expect(isTestFacultyRow(row)).toBe(false);
    expect(publicFacultyOnly([...fixtures, ...real])).toEqual(real);
  });
});

describe("rank normalisation", () => {
  test("Arabic and English spellings map to one key", () => {
    expect(normalizeRank("Professor")).toBe("professor");
    expect(normalizeRank("أستاذ")).toBe("professor");
    expect(normalizeRank(" Associate  Professor ")).toBe("associate");
    expect(normalizeRank("أستاذ مشارك")).toBe("associate");
    expect(normalizeRank("Assistant Professor")).toBe("assistant");
    expect(normalizeRank("Lecturer Assistant")).toBe("lecturer_assistant");
    expect(normalizeRank("Teaching Assistant")).toBe("teaching");
    expect(normalizeRank("معيد")).toBe("teaching");
    expect(normalizeRank(null)).toBeNull();
    expect(normalizeRank("TEST_ONLY")).toBeNull();
  });

  test("full professors are labelled أستاذ, not محاضر مساعد", () => {
    expect(displayRankAr("أستاذ")).toBe("أستاذ");
    expect(displayRankAr("Assistant Professor")).toBe("أستاذ مساعد");
  });

  test("/faculty lists professors first and has no mislabelled fallback", () => {
    const page = readFileSync("src/routes/faculty.tsx", "utf8");
    const order = ["الأساتذة\"", "الأساتذة المشاركون", "الأساتذة المساعدون", "المحاضرون المساعدون", "المعيدون"].map(
      (t) => page.indexOf(t),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).not.toContain('title: "محاضر مساعد"');
    expect(page).toContain("publicFacultyOnly(");
  });
});

describe("Arabic count agreement", () => {
  test("members", () => {
    expect(arabicMemberCount(1)).toBe("عضو واحد");
    expect(arabicMemberCount(2)).toBe("عضوان");
    expect(arabicMemberCount(6)).toBe("6 أعضاء");
    expect(arabicMemberCount(10)).toBe("10 أعضاء");
    expect(arabicMemberCount(11)).toBe("11 عضوًا");
    expect(arabicMemberCount(19)).toBe("19 عضوًا");
    expect(arabicMemberCount(103)).toBe("103 أعضاء");
  });

  test("years", () => {
    expect(arabicYears(2)).toBe("سنتان");
    expect(arabicYears(4)).toBe("4 سنوات");
  });
});

describe("program display", () => {
  test("degree and duration come from data, with code-based fallback", () => {
    expect(programDegree({ code: "MCS", name_ar: "x", degree_type: null })).toBe("ماجستير");
    expect(programDegree({ code: "CS", name_ar: "x", degree_type: null })).toBe("بكالوريوس");
    expect(programDegree({ code: "MIT", name_ar: "x", degree_type: "ماجستير" })).toBe("ماجستير");
    expect(programYears({ code: "MCS", name_ar: "x", degree_type: "ماجستير", years: null })).toBe(2);
    expect(programYears({ code: "CS", name_ar: "x", years: 4 })).toBe(4);
  });

  test("a program without a description still gets one", () => {
    const d = programDescription({ code: "cisjw", name_ar: "نظم المعلومات - الجوف", description_ar: null });
    expect(d.length).toBeGreaterThan(20);
    expect(d).toContain("نظم المعلومات - الجوف");
  });

  test("detail page no longer invents admission numbers or fixed degree", () => {
    const detail = readFileSync("src/routes/departments.$code.tsx", "utf8");
    expect(detail).not.toContain("70%");
    expect(detail).not.toContain('<span className="font-bold">بكالوريوس</span>');
  });

  test("no hard-coded program count in public copy", () => {
    for (const f of ["src/routes/departments.index.tsx", "src/routes/index.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toContain("أربعة برامج");
    }
  });
});

describe("list routes are index routes, so detail pages render", () => {
  test("no layout file swallows /departments/$code or /news/$slug", () => {
    expect(existsSync("src/routes/departments.tsx")).toBe(false);
    expect(existsSync("src/routes/news.tsx")).toBe(false);
    expect(existsSync("src/routes/departments.index.tsx")).toBe(true);
    expect(existsSync("src/routes/news.index.tsx")).toBe(true);
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(tree).not.toMatch(/getParentRoute: \(\) => DepartmentsRoute\b/);
    expect(tree).not.toMatch(/getParentRoute: \(\) => NewsRoute\b/);
  });
});

describe("sitemap", () => {
  const paths = STATIC_SITEMAP_ENTRIES.map((e) => e.path);

  test("contains only public, indexable pages", () => {
    for (const hidden of ["/portal-login", "/forgot-password", "/reset-password", "/messages", "/verify-document", "/admin"]) {
      expect(paths).not.toContain(hidden);
    }
    for (const shown of ["/", "/about", "/departments", "/faculty", "/privacy"]) {
      expect(paths).toContain(shown);
    }
  });

  test("renders absolute, escaped locations with lastmod", () => {
    const xml = renderSitemap([{ path: "/departments/A&B", lastmod: "2026-10-01" }]);
    expect(xml).toContain("<loc>https://quboolye.com/departments/A&amp;B</loc>");
    expect(xml).toContain("<lastmod>2026-10-01</lastmod>");
  });
});

describe("public SEO and naming", () => {
  test("canonical URLs are absolute on public pages", () => {
    for (const f of ["index", "about", "faculty", "contact", "research", "privacy", "events", "departments.index"]) {
      const src = readFileSync(`src/routes/${f}.tsx`, "utf8");
      expect(src).toContain('rel: "canonical"');
      expect(src).not.toMatch(/rel: "canonical", href: "\//);
    }
  });

  test("verify-document uses the official college name", () => {
    const src = readFileSync("src/routes/verify-document.tsx", "utf8");
    expect(src).not.toContain("كلية تقنية المعلومات");
  });

  test("contact page has no dead social links", () => {
    expect(readFileSync("src/routes/contact.tsx", "utf8")).not.toContain('href="#"');
  });
});
