import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const portal = readFileSync("src/components/staff-portal/StaffEmployeePortal.tsx", "utf8");
const home = readFileSync("src/components/staff-portal/StaffEmployeeHome.tsx", "utf8");

describe("staff portal — calm, organised layout", () => {
  test("every section is listed in the sidebar exactly once", () => {
    const union = portal.slice(portal.indexOf("export type StaffPortalSection"), portal.indexOf("export type StaffPortalProfile"));
    const sections = [...union.matchAll(/\| "([a-z-]+)"/g)].map((m) => m[1]);
    expect(sections.length).toBe(17);
    const groups = portal.slice(portal.indexOf("const GROUPS"), portal.indexOf("const NAV_ROW"));
    for (const id of sections) {
      expect(groups.match(new RegExp(`\\{ id: "${id}",`, "g")) ?? []).toHaveLength(1);
    }
  });

  test("sidebar groups follow the agreed order", () => {
    const titles = ["العمل اليومي", "الدوام والإجازات", "الملف والمسار الوظيفي", "الرواتب والعهد والوثائق"];
    const at = titles.map((t) => portal.indexOf(`title: "${t}"`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test("one shared row style; no loud fills, gradients or heavy weights", () => {
    expect(portal).toContain("NAV_ROW_ACTIVE");
    for (const src of [portal, home]) {
      expect(src).not.toContain("font-black");
      expect(src).not.toContain("bg-hero-gradient");
      expect(src).not.toContain("hover:-translate-y");
      expect(src).not.toContain("bg-primary text-primary-foreground");
    }
  });

  test("behaviour hooks are untouched", () => {
    expect(portal).toContain('data-testid="staff-employee-portal"');
    expect(portal).toContain('data-testid="b1-assigned-nav-badge"');
    expect(portal).toContain('data-testid="staff-processing-inbox-link"');
    expect(home).toContain('data-testid="staff-portal-home"');
    expect(portal).toContain('aria-current={selected ? "page" : undefined}');
  });
});
