/**
 * SOURCE-LEVEL tests for the student-facing "request completed + document ready"
 * notification emitted by archive_enrollment_certificate_from_workflow_step.
 *
 * These tests inspect the applied migration SQL (the CORRECTION apply) to
 * lock down the currently accepted invariants:
 *   1) A UNIQUE partial index enforces "one notification per
 *      (user_id, notification_type, reference_type, reference_id)" for
 *      notification_type='student_request_completed'.
 *   2) A single INSERT lives in the successful-archive branch, guarded by
 *      ON CONFLICT (four cols) WHERE <partial predicate> DO NOTHING.
 *   3) The previously-archived branch does NOT insert a notification.
 *   4) Recipient is the request's student_profile.user_id — never a staff user.
 *   5) Message text is exactly "رقم الطلب: <n> — رقم الوثيقة: <d>" and
 *      never contains links, pdf_url, verification_code, or storage paths.
 *   6) Notification metadata: type=student_request_completed,
 *      reference_type=student_request, reference_id=request_id.
 *   7) No notification insert precedes any RAISE EXCEPTION guard.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(import.meta.dir, "../../supabase/migrations");
const migFile = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => {
    const c = readFileSync(join(MIG_DIR, f), "utf-8");
    return (
      c.includes("archive_enrollment_certificate_from_workflow_step") &&
      c.includes("student_request_completed") &&
      c.includes("notifications_student_request_completed_uniq")
    );
  })
  .sort()
  .pop();

const sql = migFile ? readFileSync(join(MIG_DIR, migFile), "utf-8") : "";

function previouslyArchivedBranch(): string {
  const start = sql.indexOf("IF v_doc.status = 'archived' THEN");
  const tail = sql.slice(start);
  const end = tail.indexOf("IF v_doc.status IS DISTINCT FROM 'issued'");
  return tail.slice(0, end);
}

function successBranch(): string {
  const start = sql.indexOf("INSERT INTO public.student_request_workflow_events");
  return sql.slice(start);
}

describe("student_request_completed notification (applied migration)", () => {
  it("applied correction migration file exists", () => {
    expect(migFile).toBeDefined();
    expect(sql.length).toBeGreaterThan(0);
  });

  it("creates the UNIQUE partial index with the required predicate", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS notifications_student_request_completed_uniq\s+ON public\.notifications \(user_id, notification_type, reference_type, reference_id\)/,
    );
    expect(sql).toMatch(/WHERE notification_type = 'student_request_completed'/);
    expect(sql).toMatch(/AND reference_type\s*=\s*'student_request'/);
    expect(sql).toMatch(/AND reference_id\s+IS NOT NULL/);
  });

  it("does NOT modify notifications_type_chk", () => {
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS notifications_type_chk/i);
    expect(sql).not.toMatch(/ADD CONSTRAINT notifications_type_chk/i);
  });

  it("replaces archive_enrollment_certificate_from_workflow_step", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.archive_enrollment_certificate_from_workflow_step/,
    );
  });

  it("emits exactly one notification INSERT overall, inside the success branch", () => {
    const inserts = sql.match(/INSERT INTO public\.notifications/g) ?? [];
    expect(inserts.length).toBe(1);
    expect(successBranch()).toMatch(/INSERT INTO public\.notifications/);
  });

  it("previously-archived branch does NOT insert a notification", () => {
    const b = previouslyArchivedBranch();
    expect(b.length).toBeGreaterThan(0);
    expect(b).not.toMatch(/INSERT INTO public\.notifications/);
    expect(b).not.toMatch(/v_notif_message/);
    expect(b).not.toMatch(/v_notif_title/);
  });

  it("uses ON CONFLICT with four-column target + partial WHERE + DO NOTHING (no WHERE NOT EXISTS)", () => {
    const b = successBranch();
    expect(b).not.toMatch(/ON CONFLICT ON CONSTRAINT/);
    expect(b).toMatch(
      /ON CONFLICT\s*\(\s*user_id,\s*notification_type,\s*reference_type,\s*reference_id\s*\)/,
    );
    expect(b).toMatch(
      /WHERE notification_type = 'student_request_completed'\s*\n?\s*AND reference_type = 'student_request'\s*\n?\s*AND reference_id IS NOT NULL/,
    );
    expect(b).toMatch(/DO NOTHING\s*;/);
    expect(b).not.toMatch(/WHERE NOT EXISTS/);
  });

  it("recipient is the request's student_profile.user_id (not staff)", () => {
    expect(sql).toMatch(
      /FROM public\.student_profiles sp WHERE sp\.id = v_req\.student_profile_id/,
    );
    expect(sql).not.toMatch(/staff_profiles[\s\S]{0,200}notifications/);
    expect(sql).not.toMatch(/completed_by[\s\S]{0,80}INSERT INTO public\.notifications/);
  });

  it("message is exactly 'رقم الطلب: <n> — رقم الوثيقة: <d>' and title matches spec", () => {
    expect(sql).toContain("'اكتمل طلبك وأصبحت الوثيقة جاهزة'");
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
    const idxUpdateDoc = sql.indexOf("UPDATE public.official_documents");
    const idxUpdateReq = sql.lastIndexOf("UPDATE public.student_requests");
    const idxInsertNotif = sql.indexOf("INSERT INTO public.notifications");
    expect(idxUpdateDoc).toBeGreaterThan(-1);
    expect(idxUpdateReq).toBeGreaterThan(-1);
    expect(idxInsertNotif).toBeGreaterThan(idxUpdateDoc);
    expect(idxInsertNotif).toBeGreaterThan(idxUpdateReq);
  });

  it("preserves the existing workflow_events 'archived' insert", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.student_request_workflow_events[\s\S]*'archived'/,
    );
  });

  it("no notification insert precedes any RAISE EXCEPTION guard", () => {
    const firstNotifIdx = sql.indexOf("INSERT INTO public.notifications");
    const raiseMatches = [...sql.matchAll(/RAISE EXCEPTION/g)];
    const raisesBefore = raiseMatches.filter((m) => (m.index ?? 0) < firstNotifIdx);
    expect(raisesBefore.length).toBeGreaterThanOrEqual(3);
  });
});
