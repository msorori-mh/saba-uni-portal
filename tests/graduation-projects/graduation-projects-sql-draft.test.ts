import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const legacy = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql", "utf8");

describe("graduation projects legacy SQL draft", () => {
  test("is superseded by Package A foundation draft", () => {
    expect(legacy).toContain("SUPERSEDED BY PACKAGE A");
    expect(existsSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql")).toBe(true);
    expect(existsSync("tests/graduation-projects/graduation-projects-package-a-sql-draft.test.ts")).toBe(true);
  });
});
