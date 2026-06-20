import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_PANEL_ROLES } from "@/lib/admin-nav";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertDashboardAccess(userId: string) {
  await assertAnyRole(
    userId,
    ADMIN_PANEL_ROLES,
    "ليس لديك صلاحية عرض لوحة التحكم",
  );
}

async function tableCount(
  table: string,
  filters?: (q: ReturnType<typeof supabaseAdmin.from>) => ReturnType<typeof supabaseAdmin.from>,
): Promise<number> {
  let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const getHardeningStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDashboardAccess(context.userId);
    const { data, error } = await context.supabase.rpc("get_hardening_status");
    if (error) throw new Error(error.message);
    return data;
  });

export const getDashboardCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDashboardAccess(context.userId);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthIso = startOfMonth.toISOString();

    const [
      programs, courses, sections, students,
      faculty, staff,
      newReq, reviewReq,
      news, events, research,
      audit24h, notif24h,
      feesPending, feesPartial,
      docsAll, docsEnroll, docsTranscript, docsReceipt, docsToday,
      docsIssuedToday, docsCancelledToday,
      docsActive, docsCancelled, docsThisMonth,
      importsTotal, importsToday, importsCompleted, importsFailed,
    ] = await Promise.all([
      tableCount("programs", (q) => q.eq("is_active", true)),
      tableCount("courses"),
      tableCount("course_sections"),
      tableCount("student_profiles"),
      tableCount("faculty_profiles"),
      tableCount("staff_profiles"),
      tableCount("student_requests", (q) => q.eq("status", "submitted")),
      tableCount("student_requests", (q) => q.eq("status", "under_review")),
      tableCount("news", (q) => q.eq("is_published", true)),
      tableCount("events", (q) => q.eq("is_published", true)),
      tableCount("research_papers", (q) => q.eq("is_published", true)),
      tableCount("audit_logs", (q) => q.gte("created_at", since24h)),
      tableCount("notifications", (q) => q.gte("created_at", since24h)),
      tableCount("student_fees", (q) => q.eq("status", "pending")),
      tableCount("student_fees", (q) => q.eq("status", "partially_paid")),
      tableCount("official_documents"),
      tableCount("official_documents", (q) => q.eq("document_type", "enrollment_certificate")),
      tableCount("official_documents", (q) => q.eq("document_type", "official_transcript")),
      tableCount("official_documents", (q) => q.eq("document_type", "financial_receipt")),
      tableCount("official_documents", (q) => q.gte("issued_at", todayIso)),
      tableCount("audit_logs", (q) =>
        q.eq("entity_type", "document").eq("action_type", "document_issued").gte("created_at", todayIso)),
      tableCount("audit_logs", (q) =>
        q.eq("entity_type", "document").eq("action_type", "document_cancelled").gte("created_at", todayIso)),
      tableCount("official_documents", (q) => q.eq("status", "issued")),
      tableCount("official_documents", (q) => q.eq("status", "cancelled")),
      tableCount("official_documents", (q) => q.gte("issued_at", monthIso)),
      tableCount("import_logs"),
      tableCount("import_logs", (q) => q.gte("created_at", todayIso)),
      tableCount("import_logs", (q) => q.eq("status", "completed")),
      tableCount("import_logs", (q) => q.eq("status", "failed")),
    ]);

    const importsRate = importsTotal > 0 ? Math.round((importsCompleted / importsTotal) * 100) : 0;

    return {
      programs, courses, sections, students, faculty, staff,
      newReq, reviewReq, news, events, research, audit24h, notif24h,
      feesPending, feesPartial,
      docsAll, docsEnroll, docsTranscript, docsReceipt, docsToday,
      docsIssuedToday, docsCancelledToday,
      docsActive, docsCancelled, docsThisMonth,
      importsTotal, importsToday, importsCompleted, importsFailed, importsRate,
    };
  });

export const getScheduleStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDashboardAccess(context.userId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [rooms, slots, published, sectionsAll, scheduledRes, publishedToday, scheduleRes] = await Promise.all([
      tableCount("rooms", (q) => q.eq("is_active", true)),
      tableCount("time_slots", (q) => q.eq("is_active", true)),
      tableCount("class_schedule", (q) => q.eq("status", "published")),
      tableCount("course_sections", (q) => q.eq("status", "active")),
      supabaseAdmin
        .from("class_schedule")
        .select("course_section_id, room_id, faculty_profile_id")
        .in("status", ["draft", "published"]),
      tableCount("class_schedule", (q) =>
        q.eq("status", "published").gte("updated_at", todayStart.toISOString())),
      supabaseAdmin
        .from("class_schedule")
        .select("room_id, faculty_profile_id")
        .eq("status", "published"),
    ]);

    if (scheduledRes.error) throw new Error(scheduledRes.error.message);
    if (scheduleRes.error) throw new Error(scheduleRes.error.message);

    const scheduledIds = new Set(
      (scheduledRes.data ?? []).map((r) => r.course_section_id as string),
    );
    const pubRows = scheduleRes.data ?? [];
    const roomsUsed = new Set(pubRows.map((r) => r.room_id).filter(Boolean)).size;
    const facultyWithSchedules = new Set(pubRows.map((r) => r.faculty_profile_id).filter(Boolean)).size;

    return {
      rooms,
      slots,
      published,
      unscheduled: Math.max(0, sectionsAll - scheduledIds.size),
      publishedToday,
      roomsUsed,
      facultyWithSchedules,
    };
  });

export const getRecentOfficialDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDashboardAccess(context.userId);
    const { data, error } = await supabaseAdmin
      .from("official_documents")
      .select("id, document_number, document_type, issued_at, status, student_profiles(full_name_ar, academic_number)")
      .order("issued_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDashboardPerfKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDashboardAccess(context.userId);
    const { data, error } = await context.supabase.rpc("get_admin_dashboard_kpis");
    if (error) throw new Error(error.message);
    const k = (data ?? {}) as {
      successRate?: number;
      outstanding?: number;
      openRequests?: number;
    };
    return {
      successRate: Number(k.successRate ?? 0),
      outstanding: Math.round(Number(k.outstanding ?? 0) * 100) / 100,
      openRequests: Number(k.openRequests ?? 0),
    };
  });

export const getAcademicOpsKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDashboardAccess(context.userId);

    const [yearRes, semRes] = await Promise.all([
      supabaseAdmin.from("academic_years").select("id").eq("is_current", true).maybeSingle(),
      supabaseAdmin.from("semesters").select("id").eq("is_current", true).maybeSingle(),
    ]);
    if (yearRes.error) throw new Error(yearRes.error.message);
    if (semRes.error) throw new Error(semRes.error.message);

    const yearId = yearRes.data?.id;
    const semId = semRes.data?.id;
    if (!yearId || !semId) {
      return { activeOfferings: 0, activeSections: 0, activeEnrollments: 0, pendingReceipts: 0 };
    }

    const offeringsRes = await supabaseAdmin
      .from("course_offerings")
      .select("id, status")
      .eq("academic_year_id", yearId)
      .eq("semester_id", semId);
    if (offeringsRes.error) throw new Error(offeringsRes.error.message);

    const offeringIds = (offeringsRes.data ?? []).map((o) => o.id as string);
    const activeOfferings = (offeringsRes.data ?? []).filter((o) => o.status === "active").length;

    let activeSections = 0;
    let sectionIds: string[] = [];
    if (offeringIds.length > 0) {
      const secsRes = await supabaseAdmin
        .from("course_sections")
        .select("id, status")
        .in("course_offering_id", offeringIds);
      if (secsRes.error) throw new Error(secsRes.error.message);
      sectionIds = (secsRes.data ?? []).map((s) => s.id as string);
      activeSections = (secsRes.data ?? []).filter((s) => s.status === "active").length;
    }

    let activeEnrollments = 0;
    if (sectionIds.length > 0) {
      const enRes = await supabaseAdmin
        .from("student_enrollments")
        .select("id", { count: "exact", head: true })
        .in("course_section_id", sectionIds)
        .eq("enrollment_status", "enrolled");
      if (enRes.error) throw new Error(enRes.error.message);
      activeEnrollments = enRes.count ?? 0;
    }

    const prRes = await supabaseAdmin
      .from("payment_receipts")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted");
    if (prRes.error) throw new Error(prRes.error.message);

    return {
      activeOfferings,
      activeSections,
      activeEnrollments,
      pendingReceipts: prRes.count ?? 0,
    };
  });
