import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/academic-status.functions.ts", "utf8");

describe("academic-status PostgREST embeds", () => {
  test("course_offerings never embeds academic_years directly (no FK exists)", () => {
    const embeds = src.match(/course_offerings\([^"]*/g) ?? [];
    expect(embeds.length).toBeGreaterThan(0);
    for (const e of embeds) {
      expect(e).not.toMatch(/offerings\([^()]*academic_years\(/);
      expect(e).not.toMatch(/,\s*academic_year:academic_years\(name, start_date\),\s*semester:/);
    }
    expect(src).toContain("semester:semesters(name, code, start_date, academic_year:academic_years(name, start_date))");
  });

  test("enrollment, grade and component query errors are not swallowed", () => {
    expect(src).toContain("if (enrError) throw");
    expect(src).toContain("if (gError) throw");
    expect(src).toContain("if (compError) throw");
  });
});
