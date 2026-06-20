import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ACADEMIC_OPS_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "department_head",
] as const;

async function assertAcademicOpsAdmin(userId: string) {
  await assertAnyRole(
    userId,
    ACADEMIC_OPS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة العمليات الأكاديمية",
  );
}

async function safeCount(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any,
): Promise<number> {
  try {
    const adminDb = supabaseAdmin as unknown as { from: (table: string) => any };
    let q = adminDb.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return -1;
    return count ?? 0;
  } catch {
    return -1;
  }
}

async function logAuditOp(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> },
  action: "current_year_changed" | "current_semester_changed",
  entityId: string,
  oldId: string | null,
  newId: string,
  oldName: string | null,
  newName: string,
) {
  try {
    await supabase.rpc("log_audit", {
      _entity_type: "academic_operation",
      _entity_id: entityId,
      _action_type: action,
      _old: oldId ? { id: oldId, name: oldName } : null,
      _new: { id: newId, name: newName },
      _notes: action === "current_year_changed"
        ? "تغيير السنة الأكاديمية الحالية من مركز العمليات"
        : "تغيير الفصل الدراسي الحالي من مركز العمليات",
    });
  } catch {
    /* secondary */
  }
}

export const getAcademicOpsContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAcademicOpsAdmin(context.userId);
    const [yearsRes, semestersRes] = await Promise.all([
      supabaseAdmin
        .from("academic_years")
        .select("id, name, is_current, status")
        .order("start_date", { ascending: false }),
      supabaseAdmin
        .from("semesters")
        .select("id, academic_year_id, name, is_current, status")
        .order("start_date", { ascending: false }),
    ]);
    if (yearsRes.error) throw new Error(yearsRes.error.message);
    if (semestersRes.error) throw new Error(semestersRes.error.message);
    return {
      years: yearsRes.data ?? [],
      semesters: semestersRes.data ?? [],
    };
  });

export const getAcademicOpsKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      academicYearId: z.string().uuid(),
      semesterId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicOpsAdmin(context.userId);
    const yearId = data.academicYearId;
    const semId = data.semesterId;

    const { data: offerings, error: offErr } = await supabaseAdmin
      .from("course_offerings")
      .select("id, status")
      .eq("academic_year_id", yearId)
      .eq("semester_id", semId);
    if (offErr) throw new Error(offErr.message);

    const offeringIds = (offerings ?? []).map((o) => o.id as string);
    const activeOfferings = (offerings ?? []).filter((o) => o.status === "active").length;

    let sectionsTotal = 0;
    let sectionsActive = 0;
    let sectionIds: string[] = [];
    if (offeringIds.length > 0) {
      const { data: secs, error: secErr } = await supabaseAdmin
        .from("course_sections")
        .select("id, status")
        .in("course_offering_id", offeringIds);
      if (secErr) throw new Error(secErr.message);
      sectionsTotal = (secs ?? []).length;
      sectionsActive = (secs ?? []).filter((s) => s.status === "active").length;
      sectionIds = (secs ?? []).map((s) => s.id as string);
    }

    const [enrolledCount, droppedCount, statusActive, gradeComps, pendingReceipts, unpaidFees] = await Promise.all([
      sectionIds.length
        ? safeCount("student_enrollments", (q) =>
            q.in("course_section_id", sectionIds).eq("enrollment_status", "enrolled"))
        : Promise.resolve(0),
      sectionIds.length
        ? safeCount("student_enrollments", (q) =>
            q.in("course_section_id", sectionIds).eq("enrollment_status", "dropped"))
        : Promise.resolve(0),
      safeCount("student_academic_status", (q) =>
        q.eq("academic_year_id", yearId).eq("semester_id", semId).eq("enrollment_status", "active")),
      sectionIds.length
        ? safeCount("grade_components", (q) => q.in("course_section_id", sectionIds))
        : Promise.resolve(0),
      safeCount("payment_receipts", (q) => q.eq("status", "submitted")),
      safeCount("student_fees", (q) => q.in("status", ["pending", "partially_paid"])),
    ]);

    return {
      activeOfferings,
      totalOfferings: offerings?.length ?? 0,
      sectionsTotal,
      sectionsActive,
      enrolledCount,
      droppedCount,
      statusActive,
      pendingReceipts,
      unpaidFees,
      gradeComponentsTotal: gradeComps,
    };
  });

export const setCurrentAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ yearId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicOpsAdmin(context.userId);

    const { data: years, error: fetchErr } = await supabaseAdmin
      .from("academic_years")
      .select("id, name, is_current");
    if (fetchErr) throw new Error(fetchErr.message);

    const target = years?.find((y) => y.id === data.yearId);
    const prev = years?.find((y) => y.is_current);
    if (!target) throw new Error("السنة الأكاديمية غير موجودة");
    if (prev?.id === data.yearId) return { ok: true as const };

    const { error: e1 } = await supabaseAdmin
      .from("academic_years")
      .update({ is_current: false })
      .neq("id", data.yearId);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabaseAdmin
      .from("academic_years")
      .update({ is_current: true })
      .eq("id", data.yearId);
    if (e2) throw new Error(e2.message);

    await logAuditOp(
      context.supabase as unknown as Parameters<typeof logAuditOp>[0],
      "current_year_changed",
      data.yearId,
      prev?.id ?? null,
      data.yearId,
      prev?.name ?? null,
      target.name,
    );

    return { ok: true as const };
  });

export const setCurrentSemester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ semesterId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicOpsAdmin(context.userId);

    const { data: target, error: targetErr } = await supabaseAdmin
      .from("semesters")
      .select("id, name, academic_year_id, is_current")
      .eq("id", data.semesterId)
      .maybeSingle();
    if (targetErr) throw new Error(targetErr.message);
    if (!target) throw new Error("الفصل الدراسي غير موجود");

    const { data: prev } = await supabaseAdmin
      .from("semesters")
      .select("id, name")
      .eq("academic_year_id", target.academic_year_id)
      .eq("is_current", true)
      .maybeSingle();

    if (target.is_current) return { ok: true as const };

    const { error: e1 } = await supabaseAdmin
      .from("semesters")
      .update({ is_current: false })
      .eq("academic_year_id", target.academic_year_id);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabaseAdmin
      .from("semesters")
      .update({ is_current: true })
      .eq("id", data.semesterId);
    if (e2) throw new Error(e2.message);

    await logAuditOp(
      context.supabase as unknown as Parameters<typeof logAuditOp>[0],
      "current_semester_changed",
      data.semesterId,
      prev?.id ?? null,
      data.semesterId,
      prev?.name ?? null,
      target.name,
    );

    return { ok: true as const };
  });
