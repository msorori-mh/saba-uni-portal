import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function sha256Lf(rel: string) {
  const raw = readFileSync(join(root, rel));
  const lf = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return createHash("sha256").update(lf).digest("hex");
}

describe("C8 decision UI ↔ backend contract (RC2 blocker closure)", () => {
  const workspace = read("src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx");
  const c48fn = read("src/lib/councils-c4-c8.functions.ts");
  const closureSql = read(
    "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql",
  );

  it("C8_UI_AGENDA_ITEM_REQUIRED=PASS — validator and UI require agenda_item_id", () => {
    expect(c48fn).toMatch(/agenda_item_id:\s*string/);
    expect(c48fn).not.toMatch(/agenda_item_id\?:\s*string/);
    expect(c48fn).toContain('throw new Error("اختر بند جدول الأعمال المرتبط بالقرار.")');
    expect(c48fn).toMatch(/p_agenda_item_id:\s*data\.agenda_item_id(?!\s*\?\?)/);
    expect(c48fn).not.toMatch(/p_agenda_item_id:\s*data\.agenda_item_id\s*\?\?\s*null/);

    expect(workspace).toContain("اختر بند جدول الأعمال المرتبط بالقرار.");
    expect(workspace).toContain("selectedAgendaItemId");
    expect(workspace).toMatch(/!selectedAgendaItemId\.trim\(\)/);
    expect(workspace).toMatch(/agenda_item_id:\s*selectedAgendaItemId(?!\s*\|\|)/);
    expect(workspace).not.toMatch(/agenda_item_id:\s*selectedAgendaItemId\s*\|\|\s*undefined/);
  });

  it("C8_UI_UNRESOLVED_ITEM_NOT_ELIGIBLE=PASS — only resolved agenda items are selectable", () => {
    expect(workspace).toContain("resolvedAgendaItems");
    expect(workspace).toMatch(/session_status\s*===\s*["']resolved["']/);
    expect(workspace).toContain("resolvedAgendaItems.map");
    // Eligibility list must not dump unfiltered agenda items into the decision Select.
    const dialogSlice = workspace.slice(
      workspace.indexOf("إصدار قرار مجلس جديد"),
      workspace.lastIndexOf("إصدار القرار رسمياً"),
    );
    expect(dialogSlice).toContain("resolvedAgendaItems.map");
    expect(dialogSlice).not.toMatch(/\(agendaQuery\.data\?\.items\s*\?\?\s*\[\]\)\.map/);
  });

  it("C8_UI_ISSUE_BEFORE_MINUTES_LOCKED=DENY — issue CTA gated to minutes_locked only", () => {
    expect(workspace).toContain("canIssueDecision");
    expect(workspace).toMatch(
      /canIssueDecision\s*=\s*canWriteAgenda\s*&&\s*meetingStatus\s*===\s*["']minutes_locked["']/,
    );
    expect(workspace).toContain("{canIssueDecision && (");
    // Must not reopen the old early-lifecycle gate.
    expect(workspace).not.toMatch(
      /canWriteAgenda\s*&&\s*\(meetingStatus\s*===\s*["']minutes_draft["']/,
    );
    expect(workspace).not.toMatch(
      /meetingStatus\s*===\s*["']in_session["']\s*\|\|\s*meetingStatus\s*===\s*["']minutes_draft["']/,
    );
  });

  it("C8_UI_MINUTES_LOCKED_RESOLVED_ITEM=ALLOW — agenda still loads at minutes_locked", () => {
    expect(workspace).toContain('queryKey: ["council-session-agenda", meetingId]');
    const agendaBlock = workspace.slice(
      workspace.indexOf('queryKey: ["council-session-agenda", meetingId]'),
      workspace.indexOf("resolvedAgendaItems"),
    );
    expect(agendaBlock).toContain('meetingStatus === "minutes_locked"');
    expect(agendaBlock).toContain('meetingStatus === "in_session"');
    expect(agendaBlock).toContain('meetingStatus === "agenda_ready"');
  });

  it("C8_BACKEND_CONTRACT_UNCHANGED=YES — closure SQL still enforces source relationship", () => {
    expect(closureSql).toContain("IF p_agenda_item_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_ID_REQUIRED'");
    expect(closureSql).toContain("COUNCIL_DECISION_AGENDA_ITEM_NOT_RESOLVED");
    expect(closureSql).toContain("COUNCIL_DECISION_MINUTES_NOT_LOCKED");
    expect(closureSql).toContain("COUNCIL_DECISION_SOURCE_MEETING_MISMATCH");
    expect(closureSql).toContain("COUNCIL_DECISION_MINUTES_REQUIRED");
    expect(c48fn).toContain('supabase.rpc("issue_council_decision"');
  });

  it("preserves C5 V2 sole apply candidate fingerprint (RC2 guard)", () => {
    const v2 = "supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql";
    const plan = read("docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md");
    expect(sha256Lf(v2)).toBe(
      "0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8",
    );
    expect(plan).toContain("SUPERSEDED_DO_NOT_APPLY");
    expect(plan).toContain("20260808150000_councils_c5_minutes_lifecycle_01.sql");
    expect(plan).toContain("20260810180000_councils_c5_minutes_lifecycle_02.sql");
  });
});
