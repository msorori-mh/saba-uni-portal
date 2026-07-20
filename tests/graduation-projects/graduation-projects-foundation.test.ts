import { describe, expect, test } from "bun:test";
import { authorizeProjectAction, calculateProgress, isSafePrivateObjectKey, isValidTransition } from "../../src/lib/graduation-projects/domain";

const project = { id: "p1", departmentId: "d1", state: "active" as const };
const supervisor = { actorId: "f1", role: "supervisor" as const, departmentId: "d1", projectId: "p1", active: true, directlyAssigned: true };

describe("graduation projects fail-closed foundation", () => {
  test("requires exact active direct assignment and department/project scope", () => {
    expect(authorizeProjectAction(supervisor, project, "comment")).toBe(true);
    expect(authorizeProjectAction({ ...supervisor, directlyAssigned: false }, project, "comment")).toBe(false);
    expect(authorizeProjectAction({ ...supervisor, projectId: "other" }, project, "comment")).toBe(false);
    expect(authorizeProjectAction({ ...supervisor, departmentId: "other" }, project, "comment")).toBe(false);
    expect(authorizeProjectAction(null, project, "comment")).toBe(false);
  });

  test("does not turn broad titles into bypasses", () => {
    expect(authorizeProjectAction({ ...supervisor, role: "dean" }, project, "comment")).toBe(false);
    expect(authorizeProjectAction({ ...supervisor, role: "coordinator" }, project, "evaluate")).toBe(false);
  });

  test("freezes terminal projects and permits only ordered transitions", () => {
    expect(isValidTransition("active", "discussion_requested")).toBe(true);
    expect(isValidTransition("active", "completed")).toBe(false);
    expect(authorizeProjectAction(supervisor, { ...project, state: "archived" }, "comment")).toBe(false);
  });

  test("computes weighted progress and risk deterministically", () => {
    expect(calculateProgress([
      { weight: 1, completion: 100, completedAt: new Date("2026-01-01") },
      { weight: 3, completion: 50, dueAt: new Date("2026-01-01") },
    ], new Date("2026-02-01"))).toEqual({ percent: 62.5, overdue: 1, atRisk: true });
  });

  test("accepts only project-bound private object keys", () => {
    expect(isSafePrivateObjectKey("p1", "graduation-projects/p1/final/a.pdf")).toBe(true);
    expect(isSafePrivateObjectKey("p1", "graduation-projects/p2/a.pdf")).toBe(false);
    expect(isSafePrivateObjectKey("p1", "graduation-projects/p1/../secret")).toBe(false);
    expect(isSafePrivateObjectKey("p1", "https://public.example/a.pdf")).toBe(false);
  });
});
