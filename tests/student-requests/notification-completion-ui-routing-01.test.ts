/**
 * ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-UI-ROUTING-VERIFICATION-01
 * (+ REMEDIATION-01: strict UUID validation inside the link builder)
 *
 * Client-side routing + guard verification for the
 * `student_request_completed` notification (enrollment-certificate
 * completion): the notification must open the correct request detail page
 * safely, must not leak data, and must not let a student open another
 * student's request.
 *
 * Complements the existing DB-side creation contract tests
 * (tests/student-requests/student-request-completed-notification*.test.ts)
 * which lock the migration-side INSERT. This file locks the UI routing
 * side: link builder behavior (including strict UUID validation of
 * reference_id), bell open flow, route guards, and the notifications RLS
 * UPDATE policy that makes mark-as-read user-scoped.
 *
 * All Arabic literals are written as \uXXXX escapes to keep this file
 * pure ASCII.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNotificationLink } from "../../src/lib/notifications/notification-link";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf-8");
const norm = (s: string): string => s.replace(/\s+/g, "");

// Arabic error literals (unauthorized / request-not-found) written as \uXXXX escapes.
const UNAUTH = "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D";
const NOT_FOUND = "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F";
const UNAUTH_N = norm(UNAUTH);
const NOT_FOUND_N = norm(NOT_FOUND);

const LINK_SRC = "src/lib/notifications/notification-link.ts";
const BELL_SRC = "src/components/portal/NotificationsBell.tsx";
const LAYOUT_SRC = "src/routes/student.tsx";
const AFFAIRS_SRC = "src/lib/student-affairs.functions.ts";
const TRACKING_SRC = "src/lib/student-requests/student-tracking.functions.ts";
const NOTIF_MIGRATION =
  "supabase/migrations/20260601021528_918c7cad-221c-4de2-bc27-1c79c1819814.sql";

const VALID_ID = "11111111-2222-3333-4444-555555555555";
const COMPLETED = {
  notification_type: "student_request_completed",
  reference_type: "student_request",
  reference_id: VALID_ID,
};

describe("1) getNotificationLink routing contract (unit)", () => {
  it("a correct completion notification opens the exact request detail path", () => {
    expect(getNotificationLink(COMPLETED)).toBe(`/student/requests/${VALID_ID}`);
  });

  it("an uppercase canonical UUID is accepted", () => {
    const upper = VALID_ID.toUpperCase();
    expect(getNotificationLink({ ...COMPLETED, reference_id: upper })).toBe(
      `/student/requests/${upper}`,
    );
  });

  it("an unsupported reference_type yields no link (null)", () => {
    for (const reference_type of ["official_document", "payment_receipt", "student_grade", "student_fee", null]) {
      expect(getNotificationLink({ ...COMPLETED, reference_type })).toBeNull();
    }
  });

  it("an empty reference_id fails safe (null, no link)", () => {
    expect(getNotificationLink({ ...COMPLETED, reference_id: null })).toBeNull();
    expect(getNotificationLink({ ...COMPLETED, reference_id: "" })).toBeNull();
  });

  it("any other notification_type yields no link", () => {
    for (const notification_type of ["request", "grade", "finance", "payment_receipt", "system", "student_affairs_request"]) {
      expect(getNotificationLink({ ...COMPLETED, notification_type })).toBeNull();
    }
  });

  it("a partial or malformed UUID yields null", () => {
    const rejected = [
      "11111111-2222-3333-4444",
      "11111111-2222-3333-4444-55555555555",
      "11111111-2222-3333-4444-5555555555555",
      "11111111-2222-3333-4444-55555555555g",
      "11111111222233334444555555555555",
      "11111111_2222_3333_4444_555555555555",
    ];
    for (const reference_id of rejected) {
      expect(getNotificationLink({ ...COMPLETED, reference_id })).toBeNull();
    }
  });

  it("a UUID with extra text or separators yields null", () => {
    const rejected = [
      `${VALID_ID}x`,
      `x${VALID_ID}`,
      `${VALID_ID} extra`,
      `${VALID_ID}/admin`,
      `${VALID_ID}?tab=document`,
      `${VALID_ID}#fragment`,
    ];
    for (const reference_id of rejected) {
      expect(getNotificationLink({ ...COMPLETED, reference_id })).toBeNull();
    }
  });

  it("any non-UUID reference_id yields null (paths, URLs, encoded payloads, ? / # / /)", () => {
    const rejected = [
      "../../admin/requests",
      "%2e%2e%2fadmin",
      "/admin",
      "//evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "a/b",
      "a?b",
      "a#b",
      "https:%2f%2fevil.example",
      " ",
    ];
    for (const reference_id of rejected) {
      expect(getNotificationLink({ ...COMPLETED, reference_id })).toBeNull();
    }
  });

  it("the builder enforces strict UUID validation internally (structural)", () => {
    const src = read(LINK_SRC);
    expect(src).toContain("UUID_RE");
    expect(src).toContain("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    expect(src).toContain("UUID_RE.test(n.reference_id)");
  });

  it("the builder never consults title/message/pdf_url/verification_code (structural)", () => {
    const src = read(LINK_SRC);
    for (const banned of ["title", "message", "pdf_url", "verification_code"]) {
      expect(src).not.toContain(banned);
    }
  });
});

describe("2) bell opens an item: mark-read on actual open, then navigate", () => {
  const src = read(BELL_SRC);
  const n = norm(src);

  it("openItem marks the notification read before navigating", () => {
    const openIdx = n.indexOf("constopenItem=async");
    expect(openIdx).toBeGreaterThan(-1);
    const markIdx = n.indexOf("if(!n.is_read)awaitmarkRead(n.id);", openIdx);
    const navIdx = n.indexOf("navigate({to:target})", openIdx);
    expect(markIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(markIdx);
  });

  it("markRead updates only is_read, scoped by the row id (RLS enforces own rows)", () => {
    expect(n).toContain('constmarkRead=async(id:string)=>{');
    expect(n).toContain('.update({is_read:true}).eq("id",id)');
  });

  it("the navigation target is getNotificationLink output or the fixed see-all page only", () => {
    expect(n).toContain("getNotificationLink(n)??seeAllHref");
  });

  it("no external navigation primitives anywhere in the bell", () => {
    for (const banned of ["window.open", "location.href", 'target="_blank"', "target='_blank'"]) {
      expect(src).not.toContain(banned);
    }
  });

  it("no pdf_url / verification_code anywhere in the notification-to-request UI path", () => {
    for (const rel of [LINK_SRC, BELL_SRC]) {
      const s = read(rel);
      expect(s).not.toContain("pdf_url");
      expect(s).not.toContain("verification_code");
    }
  });
});

describe("3) request detail route guards fail closed", () => {
  it("the student layout requires an existing student_profiles row, else sign-out + portal-login", () => {
    const s = read(LAYOUT_SRC);
    const m = norm(s);
    expect(m).toContain('.from("student_profiles")');
    expect(m).toContain('.eq("user_id",data.user.id)');
    expect(m).toContain("supabase.auth.signOut()");
    expect(m).toContain('redirect({to:"/portal-login"})');
    // no staff-role bypass inside the student layout guard
    expect(m).not.toContain("has_any_role");
    expect(m).not.toContain('"admin"');
    expect(m).not.toContain('"dean"');
  });

  it("getStudentServiceRequestDetails validates uuid input and fails with generic errors", () => {
    const m = norm(read(AFFAIRS_SRC));
    const fnIdx = m.indexOf("getStudentServiceRequestDetails=");
    expect(fnIdx).toBeGreaterThan(-1);
    // invalid reference_id (non-uuid) is rejected before any data fetch
    expect(m.indexOf("z.object({requestId:z.string().uuid()})", fnIdx)).toBeGreaterThan(-1);
    // missing / deleted / unavailable request -> generic not-found, reveals nothing
    expect(m.indexOf(`thrownewError("${NOT_FOUND_N}")`, fnIdx)).toBeGreaterThan(-1);
    // access check before returning any data; generic unauthorized message
    expect(m.indexOf("canAccessRequest(context.userId,roles,req", fnIdx)).toBeGreaterThan(-1);
    expect(m.indexOf(`thrownewError("${UNAUTH_N}")`, fnIdx)).toBeGreaterThan(-1);
  });

  it("canAccessRequest evaluates ownership first; privileged clauses are staff roles only", () => {
    const m = norm(read(AFFAIRS_SRC));
    expect(m).toContain("constisOwner=request.student_profile?.user_id===userId;");
    expect(m).toContain('roles.includes("admin")||roles.includes("system_admin")');
    expect(m).toContain("roleMatchesCurrentStep(roles,request)");
  });

  it("student tracking reads are strictly owner-only (no admin/step bypass at all)", () => {
    const s = read(TRACKING_SRC);
    const m = norm(s);
    const assertIdx = m.indexOf("asyncfunctionassertStudentOwnsRequest");
    expect(assertIdx).toBeGreaterThan(-1);
    expect(m.indexOf("ownerUserId!==userId", assertIdx)).toBeGreaterThan(-1);
    expect(m.indexOf(`thrownewError("${UNAUTH_N}")`, assertIdx)).toBeGreaterThan(-1);
    for (const fn of ["getStudentRequestWorkflowTimelineForStudent=", "getStudentRequestFeeSummaryForStudent="]) {
      const idx = m.indexOf(fn);
      expect(idx).toBeGreaterThan(-1);
      expect(m.indexOf("awaitassertStudentOwnsRequest(context.userId,data.requestId);", idx)).toBeGreaterThan(-1);
    }
  });

  it("the student timeline projection excludes actor/assignee identifiers", () => {
    const s = read(TRACKING_SRC);
    expect(s).toContain('"step_key, step_name_ar, step_order, status, entered_at, completed_at"');
    for (const banned of ["assigned_user_id", "assigned_staff_profile_id", "assigned_faculty_profile_id", "completed_by"]) {
      expect(s).not.toMatch(new RegExp("select\\([^)]*" + banned));
    }
  });
});

describe("4) mark-as-read is user-scoped at the database level (RLS)", () => {
  const sql = read(NOTIF_MIGRATION);
  const lower = norm(sql).toLowerCase();

  it("the UPDATE policy restricts affected rows to the current user (no cross-user mark-as-read)", () => {
    expect(lower).toContain('"notif_update_own_read"');
    expect(lower).toContain(
      "forupdatetoauthenticatedusing(user_id=auth.uid())withcheck(user_id=auth.uid())",
    );
  });

  it("exactly one UPDATE policy exists (no privileged mark-read bypass, admins included)", () => {
    const policies = sql.match(/CREATE POLICY[^;]+FOR UPDATE[^;]+;/gi) ?? [];
    expect(policies.length).toBe(1);
  });

  it("the immutable-fields trigger locks routing fields (user_id/reference_*) on user updates", () => {
    const m = norm(sql);
    expect(m).toContain("protect_notification_fields");
    expect(m).toContain("NEW.user_id:=OLD.user_id;");
    expect(m).toContain("NEW.reference_type:=OLD.reference_type;");
    expect(m).toContain("NEW.reference_id:=OLD.reference_id;");
  });

  it("the authenticated role has no INSERT grant (creation only via SECURITY DEFINER paths)", () => {
    expect(lower).toContain("grantselect,updateonpublic.notificationstoauthenticated;");
    expect(lower).not.toContain("grantinsertonpublic.notifications");
  });
});

describe("5) repeated open is safe and deterministic (idempotency)", () => {
  it("markRead is a plain set-true update (repeated opens are no-ops, no error)", () => {
    const m = norm(read(BELL_SRC));
    expect(m).toContain("constmarkRead=async(id:string)=>{");
    expect(m).toContain('.update({is_read:true}).eq("id",id)');
  });

  it("getNotificationLink is pure: same input always yields the same output", () => {
    const input = {
      notification_type: "student_request_completed",
      reference_type: "student_request",
      reference_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    };
    const first = getNotificationLink(input);
    expect(first).toBe("/student/requests/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(getNotificationLink(input)).toBe(first);
    expect(getNotificationLink(input)).toBe(first);
  });
});
