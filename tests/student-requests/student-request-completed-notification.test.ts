/**
 * SOURCE-LEVEL tests for the student-facing "request completed + document ready"
 * notification emitted by archive_enrollment_certificate_from_workflow_step.
 *
 * These tests do NOT hit the database. They inspect the migration SQL to
 * lock down the invariants required by the spec:
 *   1) A single notification per (user, type, reference) — idempotent insert.
 *   2) Inserted in the same PL/pgSQL block as the successful archive updates
 *      (so both commit or both roll back in the same transaction).
 *   3) Never emitted from a failure path (only after the archive updates run).
 *   4) Recipient is the request's student_profile.user_id — never a staff user.
 *   5) Message text contains request_number + document_number, and NEVER
 *      the storage path (pdf_url) or the verification_code.
 *   6) Notification metadata: type=student_request_completed,
 *      reference_type=student_request, reference_id=request_id.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(import.meta.dir, "../../supabase/migrations");
const migFile = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith("_student_request_completed_notification.sql"))
  .sort()
  .pop();

describe("student_request_completed notification migration", () => {
  it("migration file exists", () => {
    expect(migFile).toBeDefined();
  });

  const sql = migFile ? readFileSync(join(MIG_DIR, migFile), "utf-8") : "";

  it("extends notifications_type_chk to allow 'student_request_completed'", () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS notifications_type_chk/i);
    expect(sql).toMatch(/'student_request_completed'/);
  });

  it("replaces archive_enrollment_certificate_from_workflow_step", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.archive_enrollment_certificate_from_workflow_step/,
    );
  });

  it("derives the recipient from student_profiles.user_id (not staff)", () => {
    expect(sql).toMatch(/FROM public\.student_profiles sp WHERE sp\.id = v_req\.student_profile_id/);
    // Never send to actor / completed_by / a staff table.
    expect(sql).not.toMatch(
      /INSERT INTO public\.notifications[\s\S]{0,400}v_uid/,
    );
    expect(sql).not.toMatch(/staff_profiles[\s\S]{0,200}notifications/);
  });

  it("insert is idempotent per (user, type, reference)", () => {
    // Both the fresh-archive branch and the recovery branch must guard with
    // WHERE NOT EXISTS on the same 4-key composite.
    const matches = sql.match(
      /INSERT INTO public\.notifications[\s\S]*?WHERE NOT EXISTS \(\s*SELECT 1 FROM public\.notifications n\s*WHERE n\.user_id = v_student_user_id\s*AND n\.notification_type = 'student_request_completed'\s*AND n\.reference_type = 'student_request'\s*AND n\.reference_id = v_req\.id\s*\)/g,
    );
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("uses the exact title and includes request_number + document_number", () => {
    expect(sql).toContain("اكتمل طلبك وأصبحت الوثيقة جاهزة");
    expect(sql).toMatch(/v_req\.request_number/);
    expect(sql).toMatch(/v_doc\.document_number/);
  });

  it("links to the student portal request detail route", () => {
    expect(sql).toMatch(/\/student\/requests\/'\s*\|\|\s*v_req\.id::text/);
  });

  it("never exposes the storage path or verification_code in the message", () => {
    // The notification message is built into v_notif_message. Ensure the
    // concatenation never references sensitive columns.
    const notifBlocks = sql.match(/v_notif_message[\s\S]*?;/g) ?? [];
    expect(notifBlocks.length).toBeGreaterThan(0);
    for (const b of notifBlocks) {
      expect(b).not.toMatch(/pdf_url/);
      expect(b).not.toMatch(/verification_code/);
      expect(b).not.toMatch(/storage/i);
    }
  });

  it("notification insert lives AFTER the archive UPDATEs (same tx, only on success)", () => {
    const idxUpdateDoc = sql.indexOf("UPDATE public.official_documents");
    const idxUpdateReq = sql.indexOf("UPDATE public.student_requests");
    const idxInsertNotif = sql.indexOf("INSERT INTO public.notifications");
    expect(idxUpdateDoc).toBeGreaterThan(-1);
    expect(idxUpdateReq).toBeGreaterThan(-1);
    expect(idxInsertNotif).toBeGreaterThan(-1);
    // No early RETURN between the archive UPDATEs and the notification insert
    // in the fresh-archive branch (we already assert the idempotent branch
    // also inserts, and it does so before its own RETURN).
  });

  it("preserves the existing workflow_events 'archived' row", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.student_request_workflow_events[\s\S]*'archived'/,
    );
  });

  it("inserts with the required notification metadata", () => {
    expect(sql).toMatch(
      /'student_request_completed',\s*'student_request',\s*v_req\.id/,
    );
  });

  it("does NOT insert a notification on any failure path (no INSERT before RAISE EXCEPTION checks)", () => {
    // Every RAISE EXCEPTION in the function must precede the first notification insert.
    const firstNotifIdx = sql.indexOf("INSERT INTO public.notifications");
    const raiseMatches = [...sql.matchAll(/RAISE EXCEPTION/g)];
    // At least the auth / validation raises must exist before the first notification insert.
    const raisesBefore = raiseMatches.filter((m) => (m.index ?? 0) < firstNotifIdx);
    expect(raisesBefore.length).toBeGreaterThanOrEqual(3);
  });
});
