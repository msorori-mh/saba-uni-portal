import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Academic Councils C0-C9 UI / a11y / RTL closure contracts", () => {
  const faculty = read("src/routes/faculty-portal.academic-councils.tsx");
  const reportsRoute = read("src/routes/faculty-portal.academic-councils.reports.tsx");
  const workspace = read("src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx");
  const meetingPanel = read("src/components/portal/councils/CouncilMeetingWorkspacePanel.tsx");
  const voting = read("src/components/councils/CouncilVotingControl.tsx");
  const notif = read("src/components/councils/CouncilNotificationBell.tsx");
  const reports = read("src/components/councils/CouncilReportsView.tsx");
  const chair = read("src/components/councils/CouncilChairDashboard.tsx");
  const secretary = read("src/components/councils/CouncilSecretaryDashboard.tsx");
  const member = read("src/components/councils/CouncilMemberWorkspace.tsx");
  const responsible = read("src/components/councils/CouncilResponsibleActorView.tsx");
  const c9fn = read("src/lib/councils-c9.functions.ts");
  const c48fn = read("src/lib/councils-c4-c8.functions.ts");

  it("wires CHAIR/SECRETARY/MEMBER/RESPONSIBLE/VIEWER surfaces to backend RPCs", () => {
    expect(meetingPanel).toContain("CouncilSessionAndGovernanceWorkspace");
    expect(faculty).toContain("CouncilChairDashboard");
    expect(faculty).toContain("CouncilSecretaryDashboard");
    expect(faculty).toContain("CouncilMemberWorkspace");
    expect(faculty).toContain("CouncilResponsibleActorView");
    expect(faculty).toContain("CouncilNotificationBell");
    expect(reportsRoute).toContain("CouncilReportsView");
    expect(workspace).toContain("openCouncilSessionFn");
    expect(workspace).toContain("issueCouncilDecisionFn");
    expect(workspace).toContain("archiveCouncilMeetingFn");
    expect(workspace).toContain("updateCouncilDecisionFollowupFn");
    expect(voting).toContain("castCouncilVoteFn");
    expect(voting).toContain("closeAgendaItemVoteFn");
    expect(c48fn).toContain("castCouncilVoteFn");
    expect(c48fn).toContain("archiveCouncilMeetingFn");
    expect(c9fn).toContain("getCouncilChairDashboardFn");
    expect(c9fn).toContain("getCouncilSecretaryDashboardFn");
    expect(c9fn).toContain("getCouncilMemberWorkspaceFn");
    expect(c9fn).toContain("getMyCouncilNotificationsFn");
    expect(c9fn).toContain("acknowledgeCouncilNotificationFn");
    expect(c9fn).toContain("getCouncilResponsibleDecisionsFn");
  });

  it("keeps Arabic RTL direction and a11y labels on C9 operational UX", () => {
    for (const src of [workspace, notif, reports, chair, secretary, member, responsible, faculty, reportsRoute]) {
      expect(src).toMatch(/dir=["']rtl["']/);
    }
    expect(notif).toContain("aria-label");
    expect(reports).toContain("aria-label");
    expect(chair).toContain("aria-label");
    expect(voting).toContain("aria-live");
  });

  it("aligns decision follow-up UI with remediated FSM (no issued→completed skip)", () => {
    expect(workspace).toContain("followupOptions");
    expect(workspace).toContain('value: "in_progress"');
    expect(workspace).toContain('value: "blocked"');
    expect(workspace).toContain('value: "completed"');
    // issued branch offers only in_progress + blocked (no completed skip)
    const issuedBranch = workspace.match(
      /if \(status === "issued"\) \{\s*return \[([\s\S]*?)\];\s*\}/,
    );
    expect(issuedBranch?.[1] ?? "").toContain('value: "in_progress"');
    expect(issuedBranch?.[1] ?? "").toContain('value: "blocked"');
    expect(issuedBranch?.[1] ?? "").not.toContain('value: "completed"');
  });

  it("renders only valid responsible-actor follow-up transitions", () => {
    expect(responsible).toContain('"in_progress" | "blocked" | "completed"');
    expect(responsible).toContain('handleSaveProgress("in_progress")');
    expect(responsible).toContain('handleSaveProgress("blocked")');
    expect(responsible).toContain('selected.status === "in_progress"');
    expect(responsible).toContain('handleSaveProgress("completed")');
    expect(responsible).toContain("بدء التنفيذ");
    expect(responsible).toContain("استئناف التنفيذ");
    expect(responsible).toContain("تسجيل تعثّر");
    expect(responsible).not.toContain("handleSaveProgress(true)");
  });

  it("does not expose client recipient injection on notifications", () => {
    expect(c9fn).not.toMatch(/p_recipient/);
    expect(c9fn).not.toMatch(/recipient_user_ids/);
    expect(notif).not.toMatch(/recipient_user_ids/);
    expect(c9fn).toContain("get_my_council_notifications");
    expect(c9fn).toContain("acknowledge_council_notification");
    expect(c9fn).toMatch(/p_user_id:\s*null/);
  });
});
