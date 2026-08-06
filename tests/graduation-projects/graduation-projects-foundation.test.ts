import { describe, expect, test } from "bun:test";
import {
  assessDefenseReadiness,
  assessDiscussionReadiness,
  authorizeProjectAction,
  averageSubmittedScores,
  calculateProgress,
  canArchiveByFinalDecision,
  isFinalDecision,
  isSafePrivateObjectKey,
  isValidEvaluationScore,
  isValidTransition,
  resolveGpActorKind,
  summarizeProjects,
} from "../../src/lib/graduation-projects/domain";

const project = { id: "p1", departmentId: "d1", state: "active" as const };
const supervisorAccepted = {
  actorId: "f1",
  role: "supervisor" as const,
  departmentId: "d1",
  projectId: "p1",
  active: true,
  directlyAssigned: true,
  supervisionStatus: "accepted" as const,
};

describe("graduation projects MVP foundation (freeze)", () => {
  test("requires exact active direct assignment and project scope", () => {
    expect(authorizeProjectAction(supervisorAccepted, project, "review_progress")).toBe(true);
    expect(authorizeProjectAction({ ...supervisorAccepted, directlyAssigned: false }, project, "review_progress")).toBe(false);
    expect(authorizeProjectAction({ ...supervisorAccepted, projectId: "other" }, project, "review_progress")).toBe(false);
    expect(authorizeProjectAction(null, project, "review_progress")).toBe(false);
  });

  test("title-only dean/head never bypass; pending supervisor cannot review", () => {
    expect(authorizeProjectAction({ ...supervisorAccepted, role: "dean" }, project, "conclude_result")).toBe(false);
    expect(authorizeProjectAction({ ...supervisorAccepted, role: "department_head" }, project, "archive")).toBe(false);
    expect(resolveGpActorKind({
      ...supervisorAccepted,
      supervisionStatus: "pending",
    })).toBe("supervisor_pending");
    expect(authorizeProjectAction({
      ...supervisorAccepted,
      supervisionStatus: "pending",
    }, project, "review_progress")).toBe(false);
  });

  test("leader vs member write distinction", () => {
    const leader = {
      actorId: "s1",
      role: "student" as const,
      departmentId: "d1",
      projectId: "p1",
      active: true,
      directlyAssigned: true,
      isLeader: true,
    };
    const member = { ...leader, actorId: "s2", isLeader: false };
    expect(authorizeProjectAction(leader, project, "submit_progress")).toBe(true);
    expect(authorizeProjectAction(member, project, "submit_progress")).toBe(false);
    expect(authorizeProjectAction(member, project, "read")).toBe(true);
  });

  test("canonical transitions and final_decision archive gate", () => {
    expect(isValidTransition("active", "defense_scheduled")).toBe(true);
    expect(isValidTransition("active", "discussion_requested")).toBe(false);
    expect(isValidTransition("evaluating", "archived")).toBe(true);
    expect(isFinalDecision("passed")).toBe(true);
    expect(isFinalDecision("completed")).toBe(false);
    expect(canArchiveByFinalDecision("passed")).toBe(true);
    expect(canArchiveByFinalDecision("revisions_required")).toBe(false);
    expect(canArchiveByFinalDecision(null)).toBe(false);
  });

  test("computes weighted progress and average scores deterministically", () => {
    expect(calculateProgress([
      { weight: 1, completion: 100, completedAt: new Date("2026-01-01") },
      { weight: 3, completion: 50, dueAt: new Date("2026-01-01") },
    ], new Date("2026-02-01"))).toEqual({ percent: 62.5, overdue: 1, atRisk: true });
    expect(averageSubmittedScores([80, 90, 100])).toBe(90);
    expect(averageSubmittedScores([])).toBeNull();
    expect(isValidEvaluationScore(100)).toBe(true);
    expect(isValidEvaluationScore(101)).toBe(false);
  });

  test("accepts only project-bound private object keys", () => {
    expect(isSafePrivateObjectKey("p1", "graduation-projects/p1/final/a.pdf")).toBe(true);
    expect(isSafePrivateObjectKey("p1", "graduation-projects/p2/a.pdf")).toBe(false);
    expect(isSafePrivateObjectKey("p1", "graduation-projects/p1/../secret")).toBe(false);
    expect(isSafePrivateObjectKey("p1", "https://public.example/a.pdf")).toBe(false);
  });

  test("defense readiness fails closed with explicit blockers", () => {
    expect(assessDefenseReadiness({
      projectState: "active",
      teamMembers: 2,
      acceptedSupervisors: 1,
      currentFinalReady: false,
      currentFinalClean: false,
      committeeMembers: 0,
    })).toEqual({
      ready: false,
      blockers: ["final_not_ready", "clean_final_file_missing"],
      atRisk: false,
    });
  });

  test("legacy discussion readiness wrapper still maps milestone blockers", () => {
    expect(assessDiscussionReadiness({
      projectState: "active",
      teamMembers: 2,
      activeSupervisors: 1,
      milestoneWeight: 90,
      incompleteMilestones: 1,
      overdueMilestones: 1,
      pendingCorrections: 0,
      cleanFinalFiles: 0,
      acceptedSupervisors: 0,
      currentFinalReady: false,
      currentFinalClean: false,
      committeeMembers: 0,
    })).toMatchObject({
      ready: false,
      atRisk: true,
    });
  });

  test("summarizes delay, readiness and supervisor load", () => {
    expect(summarizeProjects([
      { projectId: "p1", supervisorIds: ["s1"], progressPercent: 80, overdueMilestones: 1, discussionReady: false },
      { projectId: "p2", supervisorIds: ["s1", "s2"], progressPercent: 100, overdueMilestones: 0, discussionReady: true },
    ])).toEqual({ projects: 2, delayed: 1, readyForDiscussion: 1, supervisorLoad: { s1: 2, s2: 1 } });
  });
});
