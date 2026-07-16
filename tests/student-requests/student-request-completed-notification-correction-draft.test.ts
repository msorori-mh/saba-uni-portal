/**
 * SOURCE-ONLY tests for the completion-notification correction draft.
 *
 * Draft SQL: docs/migration-drafts/ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql
 * Not applied. These tests inspect the draft SQL text and the
 * client-side notification link resolver — they never touch the DB.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNotificationLink } from "@/lib/notifications/notification-link";

const DRAFT_PATH = join(
  import.meta.dir,
  "../../docs/migration-drafts/ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql",
);
const sql = readFileSync(DRAFT_PATH, "utf-8");

// Isolate the "previously archived" branch (from `IF v_doc.status = 'archived' THEN`
// up to and including its `RETURN ... idempotent ... document_id`).
function previouslyArchivedBranch(): string {
  const start = sql.indexOf("IF v_doc.status = 'archived' THEN");
  expect(start).toBeGreaterThan(-1);
  const tail = sql.slice(start);
  const end = tail.indexOf("IF v_doc.status IS DISTINCT FROM 'issued'");
  expect(end).toBeGreaterThan(-1);
  return tail.slice(0, end);
}

// Isolate the "successful transition" branch (from the workflow_events
// INSERT to end of function body).
function successBranch(): string {
  const start = sql.indexOf("INSERT INTO public.student_request_workflow_events");
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start);
}

describe("draft: student_request_completed notification correction", () => {
  it("draft file exists and is not under supabase/migrations", () => {
    expect(sql.length).toBeGreaterThan(0);
    expect(DRAFT_PATH).toContain("/docs/migration-drafts/");
    expect(DRAFT_PATH).not.toContain("/supabase/migrations/");
  });

  it("creates the UNIQUE partial index with the required predicate", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS notifications_student_request_completed_uniq\s+ON public\.notifications \(user_id, notification_type, reference_type, reference_id\)/,
    );
    expect(sql).toMatch(/WHERE notification_type = 'student_request_completed'/);
    expect(sql).toMatch(/AND reference_type\s*=\s*'student_request'/);
    expect(sql).toMatch(/AND reference_id\s+IS NOT NULL/);
  });

  it("replaces archive_enrollment_certificate_from_workflow_step", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.archive_enrollment_certificate_from_workflow_step/,
    );
  });

  // ---- Fresh-archive path ----

  it("emits exactly one notification INSERT overall, inside the success branch", () => {
    const inserts = sql.match(/INSERT INTO public\.notifications/g) ?? [];
    expect(inserts.length).toBe(1);
    expect(successBranch()).toMatch(/INSERT INTO public\.notifications/);
  });

  it("success-branch INSERT uses ON CONFLICT DO NOTHING on the new unique index", () => {
    const b = successBranch();
    expect(b).toMatch(
      /ON CONFLICT ON CONSTRAINT notifications_student_request_completed_uniq\s*\n?\s*DO NOTHING/,
    );
    // No WHERE NOT EXISTS fallback — idempotency is schema-enforced.
    expect(b).not.toMatch(/WHERE NOT EXISTS/);
  });

  it("recipient is the request's student user (never staff)", () => {
    expect(sql).toMatch(
      /FROM public\.student_profiles sp WHERE sp\.id = v_req\.student_profile_id/,
    );
    expect(sql).not.toMatch(/staff_profiles[\s\S]{0,120}notifications/);
    expect(sql).not.toMatch(/completed_by[\s\S]{0,80}INSERT INTO public\.notifications/);
  });

  it("uses the exact required title and message shape", () => {
    expect(sql).toContain("'اكتمل طلبك وأصبحت الوثيقة جاهزة'");
    // Message: "رقم الطلب: <n> — رقم الوثيقة: <d>"
    expect(sql).toMatch(
      /v_notif_message\s*:=\s*'رقم الطلب: '\s*\|\|\s*COALESCE\(v_req\.request_number, ''\)\s*\|\|\s*' — رقم الوثيقة: '\s*\|\|\s*COALESCE\(v_doc\.document_number, ''\)\s*;/,
    );
  });

  it("message never contains a link, pdf_url, verification_code, or storage path", () => {
    const notifBlocks = sql.match(/v_notif_message[\s\S]*?;/g) ?? [];
    expect(notifBlocks.length).toBeGreaterThan(0);
    for (const b of notifBlocks) {
      expect(b).not.toMatch(/pdf_url/);
      expect(b).not.toMatch(/verification_code/);
      expect(b).not.toMatch(/storage/i);
      expect(b).not.toMatch(/\/student\/requests\//);
      expect(b).not.toMatch(/https?:\/\//);
    }
  });

  it("inserts with the required notification metadata", () => {
    expect(successBranch()).toMatch(
      /'student_request_completed',\s*'student_request',\s*v_req\.id/,
    );
  });

  it("notification insert lives AFTER the archive UPDATEs (same tx, only on success)", () => {
    const b = successBranch();
    const idxUpdateDoc = sql.indexOf("UPDATE public.official_documents");
    const idxUpdateReq = sql.lastIndexOf("UPDATE public.student_requests");
    const idxInsertNotif = sql.indexOf("INSERT INTO public.notifications");
    expect(idxUpdateDoc).toBeGreaterThan(-1);
    expect(idxUpdateReq).toBeGreaterThan(-1);
    expect(idxInsertNotif).toBeGreaterThan(idxUpdateDoc);
    expect(idxInsertNotif).toBeGreaterThan(idxUpdateReq);
    expect(b).toMatch(/UPDATE public\.official_documents[\s\S]*INSERT INTO public\.notifications/);
  });

  // ---- Previously-archived path ----

  it("previously-archived branch does NOT insert a notification", () => {
    const b = previouslyArchivedBranch();
    expect(b).not.toMatch(/INSERT INTO public\.notifications/);
    expect(b).not.toMatch(/v_notif_message/);
    expect(b).not.toMatch(/v_notif_title/);
  });

  // ---- Failure paths ----

  it("no notification insert precedes any RAISE EXCEPTION guard", () => {
    const firstNotifIdx = sql.indexOf("INSERT INTO public.notifications");
    const raiseMatches = [...sql.matchAll(/RAISE EXCEPTION/g)];
    const raisesBefore = raiseMatches.filter((m) => (m.index ?? 0) < firstNotifIdx);
    // auth + not-found + wrong-step + cancelled/rejected + missing doc
    // + issued check + pdf_url check + signatures + transition
    expect(raisesBefore.length).toBeGreaterThanOrEqual(6);
  });

  it("preserves the existing workflow_events 'archived' insert", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.student_request_workflow_events[\s\S]*'archived'/,
    );
  });
});

describe("client: getNotificationLink", () => {
  it("routes student_request_completed + student_request to the request detail page", () => {
    expect(
      getNotificationLink({
        notification_type: "student_request_completed",
        reference_type: "student_request",
        reference_id: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe("/student/requests/11111111-1111-1111-1111-111111111111");
  });

  it("returns null when reference_id is missing", () => {
    expect(
      getNotificationLink({
        notification_type: "student_request_completed",
        reference_type: "student_request",
        reference_id: null,
      }),
    ).toBeNull();
  });

  it("returns null for unrelated notification types", () => {
    expect(
      getNotificationLink({
        notification_type: "payment_receipt",
        reference_type: "student_request",
        reference_id: "abc",
      }),
    ).toBeNull();
    expect(
      getNotificationLink({
        notification_type: "student_request_completed",
        reference_type: "official_document",
        reference_id: "abc",
      }),
    ).toBeNull();
  });
});
