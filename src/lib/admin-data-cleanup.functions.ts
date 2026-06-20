import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  executeDataCleanup,
  type CleanupScope,
} from "@/lib/admin-data-cleanup.core";

const CLEANUP_ROLES = ["system_admin", "admin"] as const;

export type { CleanupScope };

export type CleanupPreview = {
  toDelete: Record<string, number>;
  preserved: Record<string, number>;
  scope: CleanupScope;
};

const CONFIRM_PHRASES: Record<CleanupScope, string> = {
  transactional: "تأكيد التنظيف",
  academic_sections: "تأكيد إعادة الإعداد",
  all_students: "تأكيد حذف الطلاب",
};

const REQUEST_DETAIL_TABLES = [
  "student_request_attachments",
  "absence_excuse_details",
  "grade_appeal_details",
  "enrollment_suspension_details",
  "extra_chance_details",
  "transfer_request_details",
  "equivalency_request_details",
] as const;

async function assertCleanupAccess(userId: string) {
  await assertAnyRole(userId, CLEANUP_ROLES, "ليس لديك صلاحية تنظيف البيانات");
}

async function countTable(table: string): Promise<number> {
  const adminDb = supabaseAdmin as unknown as { from: (table: string) => any };
  const { count, error } = await adminDb
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

async function getStudentUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("user_id")
    .not("user_id", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.user_id as string);
}

function tablesForScope(scope: CleanupScope): string[] {
  const transactional = [
    ...REQUEST_DETAIL_TABLES,
    "student_requests",
    "payment_receipts",
    "student_payments",
    "student_fee_adjustments",
    "student_discounts",
    "student_fees",
    "student_grades",
    "student_enrollments",
    "official_documents",
    "student_academic_status",
  ];
  const academic = ["class_schedule", "grade_components", "course_sections", "course_offerings"];
  const students = [
    "announcement_reads",
    "notifications",
    "internal_messages",
    "student_profiles",
    "user_role_assignments",
    "user_roles",
    "auth_users",
  ];
  if (scope === "transactional") return transactional;
  if (scope === "academic_sections") return [...transactional, ...academic];
  return [...transactional, ...academic, ...students];
}

async function buildPreview(scope: CleanupScope): Promise<CleanupPreview> {
  const toDelete: Record<string, number> = {};
  for (const table of tablesForScope(scope)) {
    if (table === "auth_users") {
      toDelete[table] = (await getStudentUserIds()).length;
    } else if (table === "user_roles") {
      const userIds = await getStudentUserIds();
      if (userIds.length === 0) {
        toDelete[table] = 0;
      } else {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .in("user_id", userIds)
          .eq("role", "student");
        toDelete[table] = count ?? 0;
      }
    } else {
      toDelete[table] = await countTable(table);
    }
  }

  const preserved: Record<string, number> = {
    programs: await countTable("programs"),
    courses: await countTable("courses"),
    departments: await countTable("departments"),
    academic_years: await countTable("academic_years"),
    semesters: await countTable("semesters"),
    study_plans: await countTable("study_plans"),
    faculty_profiles: await countTable("faculty_profiles"),
    staff_profiles: await countTable("staff_profiles"),
  };
  if (scope !== "all_students") {
    preserved.student_profiles = await countTable("student_profiles");
  }

  return { toDelete, preserved, scope };
}

export const getDataCleanupPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ scope: z.enum(["transactional", "academic_sections", "all_students"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCleanupAccess(context.userId);
    return buildPreview(data.scope);
  });

export const runDataCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      scope: z.enum(["transactional", "academic_sections", "all_students"]),
      confirmPhrase: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCleanupAccess(context.userId);
    const expected = CONFIRM_PHRASES[data.scope];
    if (data.confirmPhrase.trim() !== expected) {
      throw new Error(`عبارة التأكيد غير صحيحة. اكتب: ${expected}`);
    }

    const deleted = await executeDataCleanup(data.scope);
    const preview = await buildPreview(data.scope);

    return { ok: true as const, scope: data.scope, deleted, preserved: preview.preserved };
  });

export const CLEANUP_SCOPE_LABELS: Record<CleanupScope, { title: string; description: string; confirm: string }> = {
  transactional: {
    title: "تنظيف المعاملات التجريبية",
    description: "يحذف التسجيلات والدرجات والطلبات والمالية والوثائق — ويبقي ملفات الطلاب والهيكل الأكاديمي.",
    confirm: CONFIRM_PHRASES.transactional,
  },
  academic_sections: {
    title: "إعادة إعداد الفصل الأكاديمي",
    description: "يشمل التنظيف المعاملات + حذف الجداول والمجموعات وعروض المقررات — جاهز لبناء فصل خريف 2026.",
    confirm: CONFIRM_PHRASES.academic_sections,
  },
  all_students: {
    title: "حذف جميع بيانات الطلاب",
    description: "يحذف كل ملفات الطلاب وحساباتهم — قبل استيراد دفعة 2026-2027. لا يمس هيئة التدريس أو البرامج.",
    confirm: CONFIRM_PHRASES.all_students,
  },
};
