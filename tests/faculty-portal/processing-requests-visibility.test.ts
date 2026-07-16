/**
 * Guards the faculty-portal «طلبات المعالجة» card + route.
 *
 * SOURCE-LEVEL. No DB, no real render.
 *
 *  1. The card in /faculty-portal renders ONLY when the user has an
 *     active request_processing_assignments row (or is admin), via the
 *     dedicated `hasActiveProcessingAssignment` server fn.
 *  2. The card is HIDDEN for a faculty member without any assignment.
 *  3. The processing-requests route reuses `<StaffInboxShell />` and the
 *     same server fn — no duplicated inbox logic.
 *  4. The gate query hits `request_processing_assignments` filtered by
 *     `user_id = current` AND `is_active = true` (so pending/inactive
 *     rows never open the card).
 *  5. The route hides the shell entirely for unauthorized users.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const INDEX_SRC = readFileSync(
  join(ROOT, "src/routes/faculty-portal.index.tsx"),
  "utf-8",
);
const ROUTE_SRC = readFileSync(
  join(ROOT, "src/routes/faculty-portal.processing-requests.tsx"),
  "utf-8",
);
const GATE_SRC = readFileSync(
  join(ROOT, "src/lib/faculty-portal/processing-access.functions.ts"),
  "utf-8",
);

describe("hasActiveProcessingAssignment server fn — gate", () => {
  it("runs under requireSupabaseAuth", () => {
    expect(GATE_SRC).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
  });

  it("queries request_processing_assignments filtered by user_id and is_active=true", () => {
    expect(GATE_SRC).toMatch(/from\(\s*["']request_processing_assignments["']\s*\)/);
    expect(GATE_SRC).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*context\.userId\s*\)/);
    expect(GATE_SRC).toMatch(/\.eq\(\s*["']is_active["']\s*,\s*true\s*\)/);
  });

  it("returns admin/system_admin short-circuit as isAdmin", () => {
    expect(GATE_SRC).toMatch(/roles\.includes\(["']admin["']\)/);
    expect(GATE_SRC).toMatch(/roles\.includes\(["']system_admin["']\)/);
  });

  it("does NOT hard-code any functional role allow-list", () => {
    expect(GATE_SRC).not.toMatch(/["']student_affairs["']/);
    expect(GATE_SRC).not.toMatch(/["']registrar["']/);
    expect(GATE_SRC).not.toMatch(/["']dean["']/);
    expect(GATE_SRC).not.toMatch(/["']finance_officer["']/);
  });
});

describe("faculty-portal dashboard — processing card visibility", () => {
  it("imports the gate server fn from the shared helper (no duplication)", () => {
    expect(INDEX_SRC).toMatch(
      /from\s+["']@\/lib\/faculty-portal\/processing-access\.functions["']/,
    );
  });

  it("computes showProcessingCard from hasAssignment || isAdmin", () => {
    expect(INDEX_SRC).toMatch(
      /showProcessingCard\s*=[\s\S]*hasAssignment[\s\S]*isAdmin/,
    );
  });

  it("wraps the card in a truthy showProcessingCard guard (hidden for unassigned users)", () => {
    expect(INDEX_SRC).toMatch(
      /\{showProcessingCard\s*&&\s*\(\s*<Link[\s\S]*data-testid="faculty-processing-card"/,
    );
  });

  it("card links to /faculty-portal/processing-requests", () => {
    expect(INDEX_SRC).toMatch(
      /to="\/faculty-portal\/processing-requests"/,
    );
  });
});

describe("/faculty-portal/processing-requests — reuses StaffInboxShell", () => {
  it("does not reimplement the inbox — imports the shared shell", () => {
    expect(ROUTE_SRC).toMatch(
      /from\s+["']@\/components\/student-requests\/StaffInboxShell["']/,
    );
    // and never redefines its own fetchers
    expect(ROUTE_SRC).not.toMatch(/fetchStaffInbox\(/);
    expect(ROUTE_SRC).not.toMatch(/fetchStaffRequestDetail\(/);
  });

  it("uses the same access gate as the dashboard card", () => {
    expect(ROUTE_SRC).toMatch(
      /from\s+["']@\/lib\/faculty-portal\/processing-access\.functions["']/,
    );
  });

  it("hides the shell and shows the unauthorized panel when the user has no assignment", () => {
    expect(ROUTE_SRC).toMatch(/data-testid="faculty-processing-unauthorized"/);
    // Shell rendering must be behind the allowed guard
    expect(ROUTE_SRC).toMatch(/allowed[\s\S]*<StaffInboxShell\s*\/>/);
    expect(ROUTE_SRC).toMatch(
      /allowed\s*=\s*!!data\s*&&\s*\(data\.hasAssignment\s*\|\|\s*data\.isAdmin\)/,
    );
  });
});

describe("staff inbox — pending steps never surface to the dean", () => {
  it("staff-inbox server fn still pins status=['active'] before calling the actor RPC", () => {
    // Cross-check with the assignment-access test: guarantees the faculty
    // portal path (which reuses the same shell + server fn) can't leak the
    // upcoming `document_issuance` step to the dean while `dean_signature`
    // is still active.
    const SERVER_SRC = readFileSync(
      join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
      "utf-8",
    );
    expect(SERVER_SRC).toMatch(/status\s*:\s*\[\s*["']active["']\s*\]/);
  });
});
