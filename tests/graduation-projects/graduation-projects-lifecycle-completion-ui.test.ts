import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { availableProjectActions, ACTION_LABELS } from "../../src/lib/graduation-projects/lifecycle";

const portalFunctions = readFileSync("src/lib/graduation-projects/portal.functions.ts", "utf8");
const workspace = readFileSync("src/components/graduation-projects/GraduationProjectWorkspace.tsx", "utf8");
const portalWorkspace = readFileSync(
  "src/components/graduation-projects/GraduationProjectPortalWorkspace.tsx",
  "utf8",
);
const assignmentsPanel = readFileSync("src/components/graduation-projects/AssignmentsPanel.tsx", "utf8");
const milestonesPanel = readFileSync("src/components/graduation-projects/MilestonesPanel.tsx", "utf8");
const evaluationPanel = readFileSync("src/components/graduation-projects/EvaluationPanel.tsx", "utf8");
const archivePanel = readFileSync(
  "src/components/graduation-projects/ResultCorrectionsArchivePanel.tsx",
  "utf8",
);

describe("GP-04 action matrix: team, milestones, finalize, archive", () => {
  test("managers add team members in draft/revision_required only", () => {
    expect(availableProjectActions(["coordinator"], "draft")).toContain("add_team_member");
    expect(availableProjectActions(["coordinator"], "revision_required")).toContain("add_team_member");
    expect(availableProjectActions(["coordinator"], "active")).not.toContain("add_team_member");
    expect(availableProjectActions(["student"], "draft")).not.toContain("add_team_member");
  });

  test("set_milestone mirrors the supervisor/coordinator SQL whitelist", () => {
    expect(availableProjectActions(["coordinator"], "approved")).toContain("set_milestone");
    expect(availableProjectActions(["coordinator"], "active")).toContain("set_milestone");
    expect(availableProjectActions(["supervisor"], "approved")).toEqual(["set_milestone"]);
    expect(availableProjectActions(["supervisor"], "active")).toContain("set_milestone");
    // department_head manages but is not in the milestone RPC whitelist.
    expect(availableProjectActions(["department_head"], "active")).not.toContain("set_milestone");
    expect(availableProjectActions(["department_head"], "approved")).not.toContain("set_milestone");
    expect(availableProjectActions(["student"], "active")).not.toContain("set_milestone");
  });

  test("panel members finalize evaluations only while evaluating", () => {
    expect(availableProjectActions(["panel_member"], "evaluating")).toContain("finalize_evaluation");
    expect(availableProjectActions(["panel_member"], "discussion_scheduled")).toEqual([]);
    expect(availableProjectActions(["supervisor"], "evaluating")).not.toContain("finalize_evaluation");
  });

  test("new actions have Arabic labels", () => {
    expect(ACTION_LABELS.add_team_member).toBeTruthy();
    expect(ACTION_LABELS.set_milestone).toBeTruthy();
    expect(ACTION_LABELS.finalize_evaluation).toBeTruthy();
  });
});

describe("GP-04 server functions", () => {
  test("exposes the six lifecycle-completing server functions", () => {
    for (const name of [
      "addGraduationProjectTeamMember",
      "assignGraduationProjectFaculty",
      "endGraduationProjectAssignment",
      "setGraduationProjectMilestone",
      "finalizeGraduationProjectEvaluation",
      "archiveGraduationProject",
      "listGraduationProjectAssignmentCandidates",
    ]) {
      expect(portalFunctions).toContain(`export const ${name}`);
    }
  });

  test("client schemas never carry actor user ids (derived server-side)", () => {
    const teamSchema = portalFunctions.slice(
      portalFunctions.indexOf("addGraduationProjectTeamMember"),
      portalFunctions.indexOf("assignGraduationProjectFaculty"),
    );
    expect(teamSchema).not.toContain("studentUserId: uuid");
    expect(teamSchema).toContain("studentUserId: profile.user_id");
    expect(teamSchema).toContain('from("student_profiles")');
    const facultySchema = portalFunctions.slice(
      portalFunctions.indexOf("assignGraduationProjectFaculty"),
      portalFunctions.indexOf("endGraduationProjectAssignment"),
    );
    expect(facultySchema).not.toContain("userId: uuid");
    expect(facultySchema).toContain('from("faculty_profiles")');
  });

  test("faculty role enum is the literal SQL whitelist", () => {
    expect(portalFunctions).toContain(
      'z.enum(["supervisor", "co_supervisor", "coordinator", "panel_member"])',
    );
    expect(portalFunctions).toContain('z.enum(["progress", "final"])');
  });

  test("candidates function gates on the authorized project detail RPC", () => {
    const candidates = portalFunctions.slice(
      portalFunctions.indexOf("listGraduationProjectAssignmentCandidates"),
    );
    expect(candidates).toContain("getProjectDetail(data.projectId)");
    expect(candidates).toContain('from("student_profiles")');
    expect(candidates).toContain('from("faculty_profiles")');
  });
});

describe("GP-04 workspace wiring", () => {
  test("workspace exposes the team tab and new handlers", () => {
    expect(workspace).toContain("الفريق والتعيينات");
    for (const handler of [
      "onAddTeamMember",
      "onAssignFaculty",
      "onEndAssignment",
      "onSetMilestone",
      "onFinalizeEvaluation",
      "onArchive",
    ]) {
      expect(workspace).toContain(handler);
      expect(portalWorkspace).toContain(handler);
    }
  });

  test("assignments panel never renders raw user ids (privacy rule)", () => {
    expect(/\{[^}]*user_id/.test(assignmentsPanel)).toBe(false);
    expect(assignmentsPanel).not.toContain("viewerUserId");
  });

  test("milestone form is weight-capped at 100 and sequence-unique", () => {
    expect(milestonesPanel).toContain("totalWeight + msWeightNum <= 100");
    expect(milestonesPanel).toContain("!usedSequences.has(msSequenceNum)");
    expect(milestonesPanel).toContain("onSetMilestone(msTitle.trim(), msKind, msSequenceNum, msWeightNum)");
  });

  test("evaluation finalize button is gated on own submitted evaluation", () => {
    expect(evaluationPanel).toContain('ownEvaluation?.state === "submitted"');
    expect(evaluationPanel).toContain("gp-finalize-evaluation");
    expect(evaluationPanel).toContain("onFinalize(ownEvaluation.id)");
  });

  test("archive form selects a clean-scanned final file only", () => {
    expect(archivePanel).toContain('file.scan_state === "clean"');
    expect(archivePanel).toContain("gp-archive-project");
    expect(archivePanel).toContain("onArchive(finalFileId)");
  });
});
