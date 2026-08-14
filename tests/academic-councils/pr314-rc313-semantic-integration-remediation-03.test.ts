/**
 * PORTAL-RC313-PR314-SEMANTIC-INTEGRATION-REMEDIATION-LONGRUN-03
 *
 * Proves the independent Codex findings are closed:
 * HIGH — RC313/#311 server-function consumers + reports discovery survive PR314 UX
 * MEDIUM — single composition (PR314 operational hierarchy + RC313 governance/review)
 *
 * SOURCE-LEVEL only. No DB / production access.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkTsFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const ROUTE_SRC = read("src/routes/faculty-portal.academic-councils.tsx");
const REPORTS_ROUTE_SRC = read("src/routes/faculty-portal.academic-councils.reports.tsx");
const ROUTE_TREE_SRC = read("src/routeTree.gen.ts");
const COUNCILS_UI_FILES = walkTsFiles(join(ROOT, "src/components/portal/councils"));
const COUNCILS_UI_SRC = COUNCILS_UI_FILES.map((f) => readFileSync(f, "utf-8")).join("\n");
const ALL_COUNCILS_SURFACE = `${ROUTE_SRC}\n${COUNCILS_UI_SRC}`;

const ROUTE_SEMANTIC_SHA256 =
  "0ac44ee8dbe34a0701d069dc625c329bcbc96de0434e915c46bbe08d460a7d27";

function routeSemanticHash(routeTree: string): string {
  const semanticLines = routeTree
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(id|path|fullPath|parentRoute|getParentRoute):/.test(line))
    .join("\n");
  return createHash("sha256").update(semanticLines).digest("hex");
}

const RC313_SERVER_CONSUMERS = [
  "reviewCouncilTopic",
  "getCouncilTopicReviewQueue",
  "editCouncilTopic",
  "resubmitCouncilTopic",
  "getOpenIntakeMeetingsForMember",
  "CouncilSessionAndGovernanceWorkspace",
  "CouncilChairDashboard",
  "CouncilSecretaryDashboard",
  "CouncilMemberWorkspace",
  "CouncilResponsibleActorView",
  "CouncilNotificationBell",
] as const;

const PR314_UX_MARKERS = [
  "CouncilsOperationalSummaryStrip",
  "CouncilsActionRequired",
  'data-testid="councils-current-memberships"',
  "NextMeetingPriorityCard",
  'data-testid="councils-tab-meetings"',
  'data-testid="councils-tab-topics"',
  'data-testid="councils-tab-archive"',
  "ScheduleMeetingDialog",
  "CouncilAgendaDialog",
  "SubmitCouncilTopicDialog",
  "MeetingAgendaExpandable",
] as const;

describe("PR314×RC313 semantic integration remediation 03", () => {
  it("1 — reports discovery survives PR314 integration", () => {
    expect(ROUTE_SRC).toContain('/faculty-portal/academic-councils/reports');
    expect(ROUTE_SRC).toContain("التقارير");
    expect(ROUTE_SRC).toContain("CouncilNotificationBell");
    expect(REPORTS_ROUTE_SRC).toContain("CouncilReportsView");
    expect(ROUTE_TREE_SRC).toContain("fullPath: '/faculty-portal/academic-councils'");
    expect(ROUTE_TREE_SRC).toContain("fullPath: '/faculty-portal/academic-councils/reports'");
  });

  it("2 — every RC313 server-function consumer survives on the faculty route surface", () => {
    for (const marker of RC313_SERVER_CONSUMERS) {
      expect(ALL_COUNCILS_SURFACE).toContain(marker);
    }
    expect(ALL_COUNCILS_SURFACE).toContain("getMyAcademicCouncilMembershipsV2");
    expect(ALL_COUNCILS_SURFACE).toContain("getMyCouncilMeetingsV2");
    expect(ALL_COUNCILS_SURFACE).toContain("getMyCouncilTopics");
    expect(ALL_COUNCILS_SURFACE).toContain("submitCouncilTopic");
    expect(ALL_COUNCILS_SURFACE).toMatch(/meeting_id:\s*meetingId/);
    expect(ALL_COUNCILS_SURFACE).not.toMatch(
      /submitTopic\(\{\s*data:\s*\{\s*council_id:/,
    );
  });

  it("3 — council-scoped composition remains the page spine", () => {
    const header = ROUTE_SRC.indexOf('data-testid="councils-page-header"');
    const current = ROUTE_SRC.indexOf('data-testid="councils-current-memberships"');
    const summary = ROUTE_SRC.indexOf("<CouncilsOperationalSummaryStrip");
    const tabs = ROUTE_SRC.indexOf('data-testid="councils-workspace-tabs"');
    const actions = ROUTE_SRC.indexOf("<CouncilsActionRequired");
    const review = ROUTE_SRC.indexOf("<CouncilTopicReviewQueue");
    expect(header).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(header);
    expect(summary).toBeGreaterThan(current);
    expect(tabs).toBeGreaterThan(summary);
    expect(actions).toBeGreaterThan(tabs);
    expect(review).toBeGreaterThan(actions);
    for (const marker of PR314_UX_MARKERS) {
      expect(ALL_COUNCILS_SURFACE).toContain(marker);
    }
  });

  it("4 — councils reporting remains reachable without routeTree re-pin masking", () => {
    expect(routeSemanticHash(ROUTE_TREE_SRC)).toBe(ROUTE_SEMANTIC_SHA256);
    expect(ROUTE_TREE_SRC).toContain("fullPath: '/faculty-portal/academic-councils/reports'");
    expect(ROUTE_TREE_SRC).toContain("fullPath: '/faculty-portal/graduation-projects'");
    expect(ROUTE_TREE_SRC).toContain("fullPath: '/admin/graduation-projects'");
    expect(ROUTE_TREE_SRC).toMatch(/graduates-affairs|\/ga\//);
  });

  it("5 — authorization matrix surface remains exact (no admin/dean bypass)", () => {
    expect(ROUTE_SRC).toMatch(/filterChairMemberships/);
    expect(ROUTE_SRC).toMatch(/filterAgendaWriteMemberships/);
    expect(ROUTE_SRC).toMatch(/filterSubmitEligible/);
    expect(ROUTE_SRC).toMatch(/isViewerOnly/);
    expect(ROUTE_SRC).toMatch(/chairMemberships\.length > 0/);
    expect(ROUTE_SRC).toMatch(/agendaWriteMemberships\.length > 0/);
    expect(ROUTE_SRC).toMatch(/submitEligibleMemberships\.length > 0/);
    expect(ROUTE_SRC).toMatch(/data-testid="councils-viewer-banner"/);
    expect(ALL_COUNCILS_SURFACE).toContain("TOPIC_REVIEW_FINAL_DENIED_UI");
    expect(ALL_COUNCILS_SURFACE).toMatch(/role === "chair"/);
    expect(ALL_COUNCILS_SURFACE).toMatch(/role === "secretary"/);
    expect(ALL_COUNCILS_SURFACE).not.toMatch(
      /assertAnyRole\(|system_admin|dean.*bypass|admin.*bypass/i,
    );
    // UI gating is not the only barrier — review still calls server fn
    expect(ALL_COUNCILS_SURFACE).toContain("useServerFn(reviewCouncilTopic)");
    expect(ALL_COUNCILS_SURFACE).toContain("useServerFn(editCouncilTopic)");
    expect(ALL_COUNCILS_SURFACE).toContain("useServerFn(resubmitCouncilTopic)");
  });

  it("6 — no direct table writes on faculty councils UI surface", () => {
    expect(ALL_COUNCILS_SURFACE).not.toMatch(/\.from\(["']academic_council/);
    expect(ALL_COUNCILS_SURFACE).not.toMatch(/\.insert\(/);
    expect(ALL_COUNCILS_SURFACE).not.toMatch(/\.update\(/);
    expect(ALL_COUNCILS_SURFACE).not.toMatch(/\.upsert\(/);
    expect(ALL_COUNCILS_SURFACE).not.toMatch(/\.delete\(/);
  });

  it("7 — C9 operational surfaces remain mounted (session/governance + role dashboards)", () => {
    expect(ALL_COUNCILS_SURFACE).toContain("CouncilSessionAndGovernanceWorkspace");
    expect(ROUTE_SRC).toContain("CouncilChairDashboard");
    expect(ROUTE_SRC).toContain("CouncilSecretaryDashboard");
    expect(ROUTE_SRC).toContain("CouncilMemberWorkspace");
    expect(ROUTE_SRC).toContain("CouncilResponsibleActorView");
    expect(ROUTE_SRC).toContain("لوحة دوري في المجلس");
    expect(ALL_COUNCILS_SURFACE).toContain("الجلسة الحية والحوكمة");
    expect(ROUTE_SRC).toMatch(/selectedRole === "viewer"/);
    expect(ROUTE_SRC).toMatch(/readOnly/);
  });
});
