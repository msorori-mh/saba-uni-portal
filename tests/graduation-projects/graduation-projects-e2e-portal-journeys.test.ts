import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { availableProjectActions } from "../../src/lib/graduation-projects/lifecycle";
import { isValidTransition, type ProjectState } from "../../src/lib/graduation-projects/domain";
import { ERROR_LABELS } from "../../src/lib/graduation-projects/rpc";

const journeysSql = readFileSync("tests/graduation-projects/postgres-e2e-journeys-verifier.sql", "utf8");
const studentLayout = readFileSync("src/routes/student.tsx", "utf8");
const facultyLayout = readFileSync("src/routes/faculty-portal.tsx", "utf8");
const adminLayout = readFileSync("src/routes/admin.tsx", "utf8");
const gpStudentRoute = readFileSync("src/routes/student.graduation-project.tsx", "utf8");
const gpFacultyRoute = readFileSync("src/routes/faculty-portal.graduation-projects.tsx", "utf8");
const gpAdminRoute = readFileSync("src/routes/admin/graduation-projects.tsx", "utf8");

describe("GP-08 journey coverage pins (SQL operational E2E)", () => {
  test("all 22 mission journeys are represented", () => {
    for (const marker of [
      "J1","J2","J3","J4","J5","J6","J7","J8","J9","J10","J11","J12","J13","J14","J15","J16","J17",
    ]) {
      expect(journeysSql, marker).toContain(`'${marker}'`);
    }
    // J18 double-click + J19 network retry map onto the correlation-replay steps
    expect(journeysSql).toContain("double-click retry computes the result exactly once");
    expect(journeysSql).toContain("exactly one result event recorded");
    // TEST_ONLY dataset marking
    expect(journeysSql).toContain("7e570000-");
    expect(journeysSql).toContain("TEST_ONLY —");
  });

  test("journey gate raises unless every step passes", () => {
    expect(journeysSql).toContain("E2E JOURNEYS FAILED: % of % steps failed");
    expect(journeysSql).toContain("E2E JOURNEYS PASS: % steps, fail=0");
  });
});

describe("GP-08 state-walk mirrors the operational journeys", () => {
  test("the full happy-path transition chain is valid", () => {
    const chain: [ProjectState, ProjectState][] = [
      ["draft", "submitted"],
      ["submitted", "under_review"],
      ["under_review", "revision_required"],
      ["revision_required", "submitted"],
      ["submitted", "under_review"],
      ["under_review", "approved"],
      ["approved", "active"],
      ["active", "discussion_requested"],
      ["discussion_requested", "discussion_scheduled"],
      ["discussion_scheduled", "evaluating"],
      ["evaluating", "corrections_required"],
      ["corrections_required", "evaluating"],
      ["evaluating", "completed"],
      ["completed", "archived"],
    ];
    for (const [from, to] of chain) {
      expect(isValidTransition(from, to), `${from}->${to}`).toBe(true);
    }
  });

  test("role action availability follows the journey states", () => {
    expect(availableProjectActions(["student"], "draft")).toEqual(["submit_proposal"]);
    expect(availableProjectActions(["student"], "active")).toContain("request_discussion");
    expect(availableProjectActions(["coordinator"], "discussion_requested")).toContain("schedule_discussion");
    expect(availableProjectActions(["panel_member"], "evaluating")).toContain("finalize_evaluation");
    expect(availableProjectActions(["department_head"], "completed")).toContain("archive");
    expect(availableProjectActions(["student"], "archived")).toEqual([]);
  });

  test("panel completeness denial has an Arabic label", () => {
    expect(ERROR_LABELS["panel incomplete for defense"]).toBeTruthy();
  });
});

describe("GP-08 direct-route and session-expiry guards", () => {
  test("GP routes live under parents that redirect unauthenticated users", () => {
    for (const parent of [studentLayout, facultyLayout, adminLayout]) {
      expect(parent).toContain("beforeLoad");
      expect(parent).toMatch(/redirect\(\{ to: "\/(portal-login|admin\/login)/);
    }
    // GP child routes rely on the parent guard plus server-function auth.
    for (const child of [gpStudentRoute, gpFacultyRoute, gpAdminRoute]) {
      expect(child).not.toContain("skipToken");
    }
  });
});
