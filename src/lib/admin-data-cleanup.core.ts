/**
 * Core pilot data cleanup — used by server functions and CLI script.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in environment.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CleanupScope = "transactional" | "academic_sections" | "all_students";

const REQUEST_DETAIL_TABLES = [
  "student_request_attachments",
  "absence_excuse_details",
  "grade_appeal_details",
  "enrollment_suspension_details",
  "extra_chance_details",
  "transfer_request_details",
  "equivalency_request_details",
] as const;

async function deleteAll(table: string): Promise<number> {
  const { error, count } = await supabaseAdmin
    .from(table)
    .delete({ count: "exact" })
    .not("id", "is", null);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function countTable(table: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function deleteTransactionalData(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of REQUEST_DETAIL_TABLES) {
    counts[table] = await deleteAll(table);
  }
  counts.student_requests = await deleteAll("student_requests");
  counts.payment_receipts = await deleteAll("payment_receipts");
  counts.student_payments = await deleteAll("student_payments");
  counts.student_fee_adjustments = await deleteAll("student_fee_adjustments");
  counts.student_discounts = await deleteAll("student_discounts");
  counts.student_fees = await deleteAll("student_fees");
  counts.student_grades = await deleteAll("student_grades");
  counts.student_enrollments = await deleteAll("student_enrollments");
  counts.official_documents = await deleteAll("official_documents");
  counts.student_academic_status = await deleteAll("student_academic_status");
  return counts;
}

export async function deleteAcademicSectionsData(): Promise<Record<string, number>> {
  return {
    class_schedule: await deleteAll("class_schedule"),
    grade_components: await deleteAll("grade_components"),
    course_sections: await deleteAll("course_sections"),
    course_offerings: await deleteAll("course_offerings"),
  };
}

async function getStudentUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("user_id")
    .not("user_id", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.user_id as string);
}

export async function deleteAllStudents(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const userIds = await getStudentUserIds();

  if (userIds.length > 0) {
    const { count: arCount, error: arErr } = await supabaseAdmin
      .from("announcement_reads")
      .delete({ count: "exact" })
      .in("user_id", userIds);
    if (arErr) throw new Error(arErr.message);
    counts.announcement_reads = arCount ?? 0;

    const { count: nCount, error: nErr } = await supabaseAdmin
      .from("notifications")
      .delete({ count: "exact" })
      .in("user_id", userIds);
    if (nErr) throw new Error(nErr.message);
    counts.notifications = nCount ?? 0;

    const { count: mCount, error: mErr } = await supabaseAdmin
      .from("internal_messages")
      .delete({ count: "exact" })
      .not("id", "is", null);
    if (mErr) throw new Error(mErr.message);
    counts.internal_messages = mCount ?? 0;
  } else {
    counts.announcement_reads = 0;
    counts.notifications = 0;
    counts.internal_messages = 0;
  }

  counts.student_profiles = await deleteAll("student_profiles");

  if (userIds.length > 0) {
    const { count: uraCount, error: uraErr } = await supabaseAdmin
      .from("user_role_assignments")
      .delete({ count: "exact" })
      .in("user_id", userIds);
    if (uraErr) throw new Error(uraErr.message);
    counts.user_role_assignments = uraCount ?? 0;

    const { count: urCount, error: urErr } = await supabaseAdmin
      .from("user_roles")
      .delete({ count: "exact" })
      .in("user_id", userIds)
      .eq("role", "student");
    if (urErr) throw new Error(urErr.message);
    counts.user_roles_student = urCount ?? 0;

    let authDeleted = 0;
    for (const uid of userIds) {
      const { data: faculty } = await supabaseAdmin
        .from("faculty_profiles").select("id").eq("user_id", uid).maybeSingle();
      const { data: staff } = await supabaseAdmin
        .from("staff_profiles").select("id").eq("user_id", uid).maybeSingle();
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", uid);
      if (faculty || staff || (roles?.length ?? 0) > 0) continue;
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (!error) authDeleted++;
    }
    counts.auth_users = authDeleted;
  } else {
    counts.user_role_assignments = 0;
    counts.user_roles_student = 0;
    counts.auth_users = 0;
  }

  return counts;
}

export async function executeDataCleanup(scope: CleanupScope): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  Object.assign(deleted, await deleteTransactionalData());
  if (scope === "academic_sections" || scope === "all_students") {
    Object.assign(deleted, await deleteAcademicSectionsData());
  }
  if (scope === "all_students") {
    Object.assign(deleted, await deleteAllStudents());
  }
  await supabaseAdmin.rpc("log_audit", {
    _entity_type: "pilot",
    _entity_id: null,
    _action_type: "pilot_data_cleanup",
    _old: null,
    _new: { scope, deleted },
    _notes: `PILOT-DATA-CLEANUP: scope=${scope}`,
  } as never);
  return deleted;
}

export async function getCleanupSnapshot(): Promise<Record<string, number>> {
  const tables = [
    "student_enrollments", "student_grades", "student_requests", "student_fees",
    "student_payments", "payment_receipts", "official_documents", "course_sections",
    "course_offerings", "class_schedule", "student_profiles", "programs", "courses",
    "faculty_profiles",
  ];
  const snap: Record<string, number> = {};
  for (const t of tables) snap[t] = await countTable(t);
  return snap;
}
