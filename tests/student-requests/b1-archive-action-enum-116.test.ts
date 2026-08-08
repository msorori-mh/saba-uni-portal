/**
 * B1_STAGE2_FIX_FILE_WITHDRAWAL_ARCHIVE_ACTION_ENUM_SOURCE_ONLY-116
 *
 * SOURCE-ONLY guard. The file_withdrawal `archive` step (literal configured
 * action_type = 'archive') was blocked client-side because the B1 server
 * function input validator enum omitted "archive". These tests pin the
 * validation + routing contract for archive without changing behaviour for
 * approve / review / clear / apply_decision / return / reject.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { B1_ACT_ON_STEP_ACTIONS } from "@/lib/student-requests/b1-ui/b1-rpc";
import { B1_PANEL_EXECUTABLE_ACTIONS } from "@/lib/student-requests/b1-staff-action-routing";
import { B1_STAFF_ACTIONS_REQUIRING_COMMENT } from "@/lib/student-requests/b1-ui/adapter.types";

const ROOT = join(import.meta.dir, "../..");
const SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/b1-ui/b1-ui.functions.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const ACT_ENUM =
  SRC.match(/action: z\.enum\(\[([^\]]*)\]\)/)?.[1]
    ?.split(",")
    .map((v) => v.trim().replace(/^"|"$/g, ""))
    .filter(Boolean) ?? [];

const CLIENT_UNION =
  SRC.match(/clientAction:\s*([^,\n]*),/)?.[1]
    ?.split("|")
    .map((v) => v.trim().replace(/^"|"$/g, ""))
    .filter(Boolean) ?? [];

const EXPECTED = [
  "approve",
  "review",
  "apply_decision",
  "clear",
  "archive",
  "return",
  "reject",
];

describe("B1 archive action — validation and routing contract", () => {
  it("accepts archive in the server input validator enum", () => {
    expect(ACT_ENUM).toContain("archive");
  });

  it("keeps the client action resolver union aligned with the enum", () => {
    expect([...CLIENT_UNION].sort()).toEqual([...ACT_ENUM].sort());
  });

  it("does not change the other executable actions", () => {
    expect([...ACT_ENUM].sort()).toEqual([...EXPECTED].sort());
    for (const action of ["approve", "review", "apply_decision", "clear"]) {
      expect(ACT_ENUM).toContain(action);
    }
  });

  it("routes archive to the atomic act-on-step RPC (not a specialized RPC)", () => {
    expect(B1_ACT_ON_STEP_ACTIONS as readonly string[]).toContain("archive");
    expect(B1_PANEL_EXECUTABLE_ACTIONS as readonly string[]).toContain("archive");
    expect(SRC).toContain("rpcActOnB1StudentRequestStepAtomic");
    // Specialized guard list must not swallow archive.
    expect(SRC).not.toMatch(/actionType === "archive"/);
  });

  it("resolves archive literally, with no aliasing", () => {
    expect(SRC).toContain("if (clientAction !== resolved) throw new Error");
  });

  it("keeps the comment optional for archive and required for return/reject", () => {
    expect(SRC).toContain(
      'if ((data.action === "return" || data.action === "reject") && !data.comment?.trim())',
    );
    expect(SRC).not.toMatch(/data\.action === "archive"[^\n]*comment/);
    expect([...B1_STAFF_ACTIONS_REQUIRING_COMMENT]).toEqual(["return", "reject"]);
  });

  it("short-circuits only return/reject before configured-action resolution", () => {
    expect(SRC).toContain(
      'if (clientAction === "return" || clientAction === "reject") return clientAction;',
    );
  });
});
