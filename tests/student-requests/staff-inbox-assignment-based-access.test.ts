/**
 * Guards assertStaffInboxAccess: staff inbox access must NOT be gated on
 * a hard-coded functional role list. It must allow:
 *   - admin / system_admin
 *   - OR any user with an active request_processing_assignments row
 *
 * Motivation: Fares (finance_officer / revenue_finance_officer) is the
 * active actor on payment_confirmation for SR-20260715-FEDCB3E1 via
 * request_processing_assignments, but the old gate hard-coded a
 * student_affairs / registrar / dean allow-list and denied him even though
 * the assignment RPCs would authorize him.
 *
 * SOURCE-LEVEL only. The DB RPCs (get_my_request_actor_inbox,
 * get_student_request_detail_for_actor, act_on_student_request_step) still
 * scope every read/write to the caller's ACTIVE step assignment — this
 * gate only decides whether to try them at all.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const SOURCE = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
);

const gateBlock =
  SOURCE.match(/async function assertStaffInboxAccess[\s\S]*?\n\}/)?.[0] ?? "";

describe("assertStaffInboxAccess", () => {
  it("is defined and used by every server fn in the file", () => {
    expect(gateBlock).not.toEqual("");
    // fetch inbox + fetch detail + all action fns must call it
    const calls = SOURCE.match(/await assertStaffInboxAccess\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it("short-circuits for admin / system_admin", () => {
    expect(gateBlock).toMatch(/roles\.includes\(["']admin["']\)/);
    expect(gateBlock).toMatch(/roles\.includes\(["']system_admin["']\)/);
  });

  it("allows any user with an ACTIVE request_processing_assignments row", () => {
    expect(gateBlock).toMatch(/from\(\s*["']request_processing_assignments["']\s*\)/);
    expect(gateBlock).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*userId\s*\)/);
    expect(gateBlock).toMatch(/\.eq\(\s*["']is_active["']\s*,\s*true\s*\)/);
  });

  it("throws the localized unauthorized message when the user has no assignment and is not admin", () => {
    expect(gateBlock).toMatch(/throw new Error\(STAFF_INBOX_UNAVAILABLE_MSG\.unauthorized\)/);
  });

  it("does NOT hard-code a functional-role allow-list (student_affairs, registrar, dean, finance_officer, …)", () => {
    // The old bug delegated to assertAnyRole(STUDENT_REQUESTS_ADMIN_ROLES, …)
    expect(gateBlock).not.toMatch(/STUDENT_REQUESTS_ADMIN_ROLES/);
    expect(gateBlock).not.toMatch(/assertAnyRole\(/);
    expect(gateBlock).not.toMatch(/["']student_affairs["']/);
    expect(gateBlock).not.toMatch(/["']registrar["']/);
    expect(gateBlock).not.toMatch(/["']dean["']/);
    expect(gateBlock).not.toMatch(/["']finance_officer["']/);
  });
});

describe("staff inbox — RPC still enforces per-user step assignment", () => {
  it("inbox RPC call pins status=['active'] so pending/future steps never surface", () => {
    // Duplicates staff-inbox-active-only-filter guard — kept local so a future
    // refactor can't relax the gate here without also breaking that test.
    expect(SOURCE).toMatch(/status\s*:\s*\[\s*["']active["']\s*\]/);
  });

  it("inbox reads go through get_my_request_actor_inbox (per-user scoped RPC)", () => {
    expect(SOURCE).toMatch(/rpcGetMyRequestActorInbox\(/);
  });

  it("detail reads go through get_student_request_detail_for_actor (per-user scoped RPC)", () => {
    expect(SOURCE).toMatch(/rpcGetStudentRequestDetailForActor\(/);
  });

  it("action executor uses caller's session client on act_on_student_request_step so RLS/definer enforces step assignment", () => {
    const block =
      SOURCE.match(
        /executeStudentRequestStaffAction[\s\S]*?act_on_student_request_step[\s\S]*?\}\);/,
      )?.[0] ?? "";
    expect(block).toMatch(/context\.supabase[\s\S]*?\.rpc\(\s*["']act_on_student_request_step["']/);
    expect(block).not.toMatch(
      /supabaseAdmin\.rpc\(\s*["']act_on_student_request_step["']/,
    );
    // And it revalidates step status + ownership before calling the RPC.
    expect(block).toMatch(/stepRow\.status\s*!==\s*["']active["']/);
    expect(block).toMatch(/student_request_id\s*!==\s*data\.requestId/);
  });
});
