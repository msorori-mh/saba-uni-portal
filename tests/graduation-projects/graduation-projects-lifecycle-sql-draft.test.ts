import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const legacy = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql", "utf8");

describe("graduation projects legacy lifecycle SQL draft", () => {
  test("is superseded by Package A lifecycle draft", () => {
    expect(legacy).toContain("SUPERSEDED BY PACKAGE A");
    expect(existsSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql")).toBe(true);
    expect(existsSync("tests/graduation-projects/postgres-package-a-verifier.sql")).toBe(true);
  });
});
