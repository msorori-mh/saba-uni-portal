import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canFinalizeAgendaAtStatus,
  isAgendaEditable,
  isAgendaFrozen,
} from "@/lib/councils-live";

const read = (p: string) => readFileSync(p, "utf8");

describe("UX_06 agenda lifecycle rules", () => {
  it("agenda is editable only during preparation", () => {
    for (const s of ["scheduled", "intake_open", "intake_closed"]) {
      expect(isAgendaEditable(s)).toBe(true);
      expect(isAgendaFrozen(s)).toBe(false);
    }
    for (const s of [
      "agenda_ready",
      "in_session",
      "minutes_draft",
      "minutes_review",
      "minutes_locked",
      "archived",
      "cancelled",
    ]) {
      expect(isAgendaEditable(s)).toBe(false);
      expect(isAgendaFrozen(s)).toBe(true);
    }
  });

  it("finalization is only allowed at intake_closed", () => {
    expect(canFinalizeAgendaAtStatus("intake_closed")).toBe(true);
    for (const s of ["scheduled", "intake_open", "agenda_ready", "in_session", "minutes_draft"]) {
      expect(canFinalizeAgendaAtStatus(s)).toBe(false);
    }
  });
});

describe("UX_06 source guards", () => {
  const dialog = read("src/components/portal/councils/CouncilAgendaDialog.tsx");
  const admin = read("src/routes/admin/academic-councils.tsx");
  const session = read("src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx");

  it("faculty dialog derives gating from the shared lifecycle helpers", () => {
    expect(dialog).toContain("canFinalizeAgendaAtStatus(meeting?.status)");
    expect(dialog).toContain("isAgendaEditable(meeting?.status)");
    expect(dialog).toContain("council-agenda-frozen-notice");
    expect(dialog).not.toContain('meeting?.status === "agenda_ready"');
  });

  it("admin console applies the same rules", () => {
    expect(admin).toContain("isAgendaFrozen(selectedMeeting?.status)");
    expect(admin).toContain("canFinalizeAgendaAtStatus(selectedMeeting?.status)");
    expect(admin).toContain("admin-agenda-frozen-notice");
    expect(admin).not.toContain('selectedMeeting?.status === "agenda_ready"');
  });

  it("live session shows approval and session state as distinct badges", () => {
    expect(session).toContain("council-session-item-approved-badge");
    expect(session).toContain("council-session-item-session-badge");
    expect(session).toContain("agendaSessionStatusLabel(sessionStatus)");
    expect(session).not.toContain("حالة البند: {sessionStatus}");
  });

  it("chair sees the next-actor notice in minutes_draft without a lock button", () => {
    expect(session).toContain("council-minutes-chair-next-actor");
    expect(session).toContain("council-minutes-stage-path");
    expect(session).toContain("بانتظار أمين السر");
  });
});
