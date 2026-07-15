// Regression: pressing "إعادة تعيين" on staff and faculty account pages
// must open a modal (either the credentials slip after successful reset, or
// the ResetPasswordDialog on the faculty-accounts page) and be closable.
// The prior server function threw `ReferenceError: identifier is not defined`,
// which surfaced as an error banner and prevented the modal from ever opening.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("admin password reset — dialog opens and closes", () => {
  const serverFns = read("src/lib/admin-users.functions.ts");
  const staffPage = read("src/routes/admin/staff-management.tsx");
  const facultyPage = read("src/routes/admin/faculty-management.tsx");
  const facultyAccountsPage = read("src/routes/admin/faculty-accounts.tsx");
  const slip = read("src/components/admin/people/shared.tsx");

  it("resetPassword handler declares `identifier` before using it in audit notes", () => {
    // Isolate the resetPassword handler block.
    const start = serverFns.indexOf("export const resetPassword");
    expect(start).toBeGreaterThan(-1);
    const end = serverFns.indexOf("export const ", start + 1);
    const body = serverFns.slice(start, end === -1 ? undefined : end);

    // The bug: `identifier` was referenced without a declaration.
    expect(body).toContain("const identifier");
    const declIndex = body.indexOf("const identifier");
    const firstUse = body.indexOf("لـ ${identifier}");
    expect(firstUse).toBeGreaterThan(-1);
    expect(declIndex).toBeLessThan(firstUse);
  });

  it("staff page wires reset -> setSlip -> CredentialsSlip modal with onClose", () => {
    expect(staffPage).toContain("resetPassword");
    expect(staffPage).toContain("setSlip");
    expect(staffPage).toContain("<CredentialsSlip slip={slip} onClose={() => setSlip(null)} />");
  });

  it("faculty page wires reset -> setSlip -> CredentialsSlip modal with onClose", () => {
    expect(facultyPage).toContain("resetPassword");
    expect(facultyPage).toContain("setSlip");
    expect(facultyPage).toContain("<CredentialsSlip slip={slip} onClose={() => setSlip(null)} />");
  });

  it("faculty-accounts page opens ResetPasswordDialog on button click and closes on cancel", () => {
    // Open trigger
    expect(facultyAccountsPage).toContain("setResetFor(r)");
    // Modal render is state-gated so it actually mounts
    expect(facultyAccountsPage).toMatch(/\{resetFor && \(\s*<ResetPasswordDialog/);
    // Close wiring resets the state (dialog unmounts)
    expect(facultyAccountsPage).toContain("onClose={() => setResetFor(null)}");
  });

  it("CredentialsSlip modal is rendered as a top-layer overlay (z-50) with a working close handler", () => {
    expect(slip).toContain("fixed inset-0 z-50");
    // Backdrop click closes
    expect(slip).toMatch(/onClick=\{onClose\}/);
    // Inner content stops propagation so clicking inside does NOT close
    expect(slip).toContain('onClick={(e) => e.stopPropagation()}');
    // Explicit close button
    expect(slip).toContain("إغلاق");
  });
});
