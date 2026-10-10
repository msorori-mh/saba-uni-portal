/**
 * STUDENT-REQUEST-DRAFT-DELETE-01 — source contract. Behaviour is proven by the
 * PG chain `student-request-draft-delete`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const draft = read("docs/migration-drafts/STUDENT-REQUEST-DRAFT-DELETE-01.sql");
const button = read("src/components/student-requests/DeleteDraftRequestButton.tsx");
const desktop = read("src/routes/student.requests.index.tsx");
const mobile = read("src/routes/mobile.student.requests.index.tsx");
const ci = read(".github/workflows/ci.yml");

describe("student request draft delete 01", () => {
  test("the RPC is owner-bound, draft-only and not callable by anon", () => {
    expect(draft).toContain("sp.user_id = auth.uid()");
    expect(draft).toContain("r.status <> 'draft' or r.submitted_at is not null");
    expect(draft).toContain("SR_DRAFT_DELETE_HAS_HISTORY");
    expect(draft).toContain(
      "revoke all on function public.delete_my_student_request_draft(uuid) from public, anon;",
    );
    expect(draft).toContain(
      "grant execute on function public.delete_my_student_request_draft(uuid) to authenticated;",
    );
  });

  test("the button deletes through the RPC only and asks for confirmation", () => {
    expect(button).toContain('"delete_my_student_request_draft"');
    expect(button).not.toMatch(/\.from\s*\(\s*["']student_requests/);
    expect(button).toContain("تأكيد الحذف نهائيًا");
  });

  test("both request lists offer deletion for drafts only", () => {
    for (const source of [desktop, mobile]) {
      expect(source).toContain("DeleteDraftRequestButton");
      expect(source).toMatch(/request\.status === "draft" \? \(\s*(<div[^>]*>\s*)?<DeleteDraftRequestButton/);
    }
  });

  test("the PG chain is registered in CI", () => {
    expect(ci).toContain("name: student-request-draft-delete");
    expect(ci).toContain("tests/student-requests/student-request-draft-delete-01.pg-verify.sql");
  });
});
