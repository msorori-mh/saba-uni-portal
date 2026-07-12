import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAnyRole, primaryActorRole } from "@/lib/authz.server";
import {
  evaluateStaffDeletionPreflight,
  validateStaffDeleteConfirmation,
  attachAuditWarning,
  type StaffDeletionDependencyCounts,
  type StaffDeletionPreflightResult,
} from "@/lib/admin-staff-deletion.core";

const STAFF_DELETE_ADMIN_ROLES = ["admin", "system_admin"] as const;
const STAFF_NOT_FOUND_AR = "ملف الموظف غير موجود.";

const staffProfileIdSchema = z.object({
  staffProfileId: z.string().uuid(),
});

const deleteStaffProfileSchema = z.object({
  staffProfileId: z.string().uuid(),
  expectedFullName: z.string().trim().min(1),
  expectedEmployeeNumber: z.string().trim().min(1),
  confirmationText: z.string().trim().min(1),
  deleteAuthUser: z.boolean(),
});

type StaffProfileRow = {
  id: string;
  user_id: string | null;
  employee_number: string | null;
  full_name_ar: string;
  email: string | null;
  status: string;
  role_type: string | null;
};

type DeleteStaffProfileResult = {
  authUserDeleted: boolean;
  staffProfileDeleted: boolean;
  partialFailure: boolean;
  warning?: string | null;
  deletedStaffProfileId: string;
  deletedUserId: string | null;
  messageAr: string;
};

async function assertStaffDeleteAdmin(actorUserId: string): Promise<void> {
  await assertAnyRole(
    actorUserId,
    STAFF_DELETE_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة حذف ملفات الموظفين.",
  );
}

async function loadStaffProfile(staffProfileId: string): Promise<StaffProfileRow | null> {
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, employee_number, full_name_ar, email, status, role_type")
    .eq("id", staffProfileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StaffProfileRow | null) ?? null;
}

async function userRolesFor(userId: string | null): Promise<string[]> {
  if (!userId) return [];

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => String(row.role));
}

async function exactCount(
  tableName: string,
  buildQuery: () => PromiseLike<{ count: number | null; error: any }>,
): Promise<{ count: number | null; failure: string | null }> {
  const { count, error } = await buildQuery();
  if (error) return { count: null, failure: tableName };
  return { count: count ?? 0, failure: null };
}

function addCountFailure(
  deps: StaffDeletionDependencyCounts,
  key: keyof Omit<StaffDeletionDependencyCounts, "queryFailures">,
  result: { count: number | null; failure: string | null },
) {
  deps[key] = result.count as never;
  if (result.failure) deps.queryFailures.push(result.failure);
}

async function countUserLinkedProfiles(tableName: "faculty_profiles" | "student_profiles", userId: string | null) {
  if (!userId) return { count: 0, error: null };
  return supabaseAdmin
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
}

async function checkHasFacultyProfile(staff: StaffProfileRow): Promise<boolean> {
  const clauses: string[] = [];
  if (staff.user_id) clauses.push(`user_id.eq.${staff.user_id}`);
  if (staff.employee_number) clauses.push(`employee_number.eq.${staff.employee_number}`);
  if (clauses.length === 0) return false;

  const { count, error } = await supabaseAdmin
    .from("faculty_profiles")
    .select("id", { count: "exact", head: true })
    .or(clauses.join(","));

  if (error) return true;
  return (count ?? 0) > 0;
}

async function runStaffDeletionPreflightQueries(
  staff: StaffProfileRow,
): Promise<StaffDeletionDependencyCounts> {
  const deps: StaffDeletionDependencyCounts = {
    processingAssignments: null,
    workflowStepsAssigned: null,
    staffProfileDepartments: null,
    positionAssignments: null,
    notifications: null,
    auditLogs: null,
    otherStaffWithSameUserId: null,
    facultyProfilesWithUserId: null,
    studentProfilesWithUserId: null,
    queryFailures: [],
  };

  const staffId = staff.id;
  const userId = staff.user_id;

  const [
    processingAssignments,
    workflowStepsAssigned,
    staffProfileDepartments,
    positionAssignments,
    notifications,
    auditLogs,
    otherStaffWithSameUserId,
    facultyProfilesWithUserId,
    studentProfilesWithUserId,
  ] = await Promise.all([
    exactCount("request_processing_assignments", () => {
      const q = supabaseAdmin
        .from("request_processing_assignments")
        .select("id", { count: "exact", head: true });
      return userId
        ? q.or(`staff_profile_id.eq.${staffId},user_id.eq.${userId}`)
        : q.eq("staff_profile_id", staffId);
    }),
    exactCount("student_request_workflow_steps", () => {
      const q = supabaseAdmin
        .from("student_request_workflow_steps")
        .select("id", { count: "exact", head: true });
      return userId
        ? q.or(`assigned_staff_profile_id.eq.${staffId},assigned_user_id.eq.${userId}`)
        : q.eq("assigned_staff_profile_id", staffId);
    }),
    exactCount("staff_profile_departments", () =>
      supabaseAdmin
        .from("staff_profile_departments")
        .select("staff_profile_id", { count: "exact", head: true })
        .eq("staff_profile_id", staffId),
    ),
    exactCount("position_assignments", async () => {
      if (!userId) return { count: 0, error: null };
      return supabaseAdmin
        .from("position_assignments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
    }),
    exactCount("notifications", async () => {
      if (!userId) return { count: 0, error: null };
      return supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
    }),
    exactCount("audit_logs", () => {
      const q = supabaseAdmin
        .from("audit_logs")
        .select("id", { count: "exact", head: true });
      return userId
        ? q.or(`entity_id.eq.${staffId},actor_user_id.eq.${userId},entity_id.eq.${userId}`)
        : q.eq("entity_id", staffId);
    }),
    exactCount("staff_profiles", async () => {
      if (!userId) return { count: 0, error: null };
      return supabaseAdmin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("id", staffId);
    }),
    exactCount("faculty_profiles", () => countUserLinkedProfiles("faculty_profiles", userId)),
    exactCount("student_profiles", () => countUserLinkedProfiles("student_profiles", userId)),
  ]);

  addCountFailure(deps, "processingAssignments", processingAssignments);
  addCountFailure(deps, "workflowStepsAssigned", workflowStepsAssigned);
  addCountFailure(deps, "staffProfileDepartments", staffProfileDepartments);
  addCountFailure(deps, "positionAssignments", positionAssignments);
  addCountFailure(deps, "notifications", notifications);
  addCountFailure(deps, "auditLogs", auditLogs);
  addCountFailure(deps, "otherStaffWithSameUserId", otherStaffWithSameUserId);
  addCountFailure(deps, "facultyProfilesWithUserId", facultyProfilesWithUserId);
  addCountFailure(deps, "studentProfilesWithUserId", studentProfilesWithUserId);

  return deps;
}

export async function buildStaffDeletionPreflightFromDb(input: {
  staffProfileId: string;
  actorUserId: string;
}): Promise<StaffDeletionPreflightResult> {
  const staff = await loadStaffProfile(input.staffProfileId);
  if (!staff) throw new Error(STAFF_NOT_FOUND_AR);

  const [appRoles, hasFacultyProfile, deps] = await Promise.all([
    userRolesFor(staff.user_id),
    checkHasFacultyProfile(staff),
    runStaffDeletionPreflightQueries(staff),
  ]);

  return evaluateStaffDeletionPreflight(
    {
      staffProfileId: staff.id,
      fullNameAr: staff.full_name_ar,
      employeeNumber: staff.employee_number ?? "",
      email: staff.email,
      userId: staff.user_id,
      status: staff.status,
      roleType: staff.role_type,
      appRoles,
      actorUserId: input.actorUserId,
      hasFacultyProfile,
    },
    deps,
  );
}

async function logStaffAudit(input: {
  actorUserId: string;
  entityId: string;
  actionType: "staff_profile_deleted" | "staff_profile_deactivated";
  notes: string;
  payload: Record<string, unknown>;
}) {
  const actorRole = await primaryActorRole(input.actorUserId);
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    actor_role: actorRole,
    entity_type: "staff",
    entity_id: input.entityId,
    action_type: input.actionType,
    notes: input.notes,
    new_values: {
      source: "admin_staff_management",
      ...input.payload,
    },
  } as any);
  if (error) throw new Error(error.message);
}

function isAuthUserMissingError(error: any): boolean {
  const status = Number(error?.status ?? error?.__isAuthError?.status);
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  return status === 404 || code.includes("not_found") || message.includes("user not found");
}

function staffDeleteResult(input: DeleteStaffProfileResult): DeleteStaffProfileResult {
  return {
    warning: null,
    ...input,
  };
}

async function ensureAuthUserCanBeDeleted(input: {
  staffProfileId: string;
  userId: string;
  appRoles: string[];
}): Promise<{ authUserExists: boolean; warning?: string }> {
  const { staffProfileId, userId, appRoles } = input;

  if (appRoles.includes("admin") || appRoles.includes("system_admin")) {
    throw new Error("لا يمكن حذف حساب يملك صلاحية admin أو system_admin.");
  }

  const [otherStaff, facultyProfiles, studentProfiles] = await Promise.all([
    exactCount("staff_profiles", () =>
      supabaseAdmin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("id", staffProfileId),
    ),
    exactCount("faculty_profiles", () => countUserLinkedProfiles("faculty_profiles", userId)),
    exactCount("student_profiles", () => countUserLinkedProfiles("student_profiles", userId)),
  ]);

  if (otherStaff.failure || facultyProfiles.failure || studentProfiles.failure) {
    throw new Error("تعذر التحقق من ارتباطات حساب الدخول قبل الحذف.");
  }
  if ((otherStaff.count ?? 0) > 0) {
    throw new Error("حساب الدخول مرتبط بملف موظف آخر.");
  }
  if ((facultyProfiles.count ?? 0) > 0) {
    throw new Error("حساب الدخول مرتبط بملف عضو هيئة تدريس.");
  }
  if ((studentProfiles.count ?? 0) > 0) {
    throw new Error("حساب الدخول مرتبط بملف طالب.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    if (isAuthUserMissingError(error)) {
      return {
        authUserExists: false,
        warning: "حساب الدخول محذوف مسبقاً؛ سيتم استكمال حذف ملف الموظف.",
      };
    }
    throw new Error(error.message);
  }

  return { authUserExists: Boolean(data?.user) };
}

export const getStaffDeletionPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffProfileIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaffDeleteAdmin(context.userId);
    return buildStaffDeletionPreflightFromDb({
      staffProfileId: data.staffProfileId,
      actorUserId: context.userId,
    });
  });

export const deleteStaffProfileSafely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteStaffProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaffDeleteAdmin(context.userId);

    const staff = await loadStaffProfile(data.staffProfileId);
    if (!staff) {
      return staffDeleteResult({
        authUserDeleted: false,
        staffProfileDeleted: true,
        partialFailure: false,
        deletedStaffProfileId: data.staffProfileId,
        deletedUserId: null,
        messageAr: "ملف الموظف محذوف مسبقاً.",
      });
    }

    const preflight = await buildStaffDeletionPreflightFromDb({
      staffProfileId: data.staffProfileId,
      actorUserId: context.userId,
    });

    const confirmation = validateStaffDeleteConfirmation({
      preflight,
      expectedFullName: data.expectedFullName,
      expectedEmployeeNumber: data.expectedEmployeeNumber,
      confirmationText: data.confirmationText,
      deleteAuthUser: data.deleteAuthUser,
    });
    if (!confirmation.ok) throw new Error(confirmation.messageAr);

    let authUserDeleted = false;
    let warning: string | null = null;

    if (preflight.user_id) {
      let authCheck: { authUserExists: boolean; warning?: string };
      try {
        authCheck = await ensureAuthUserCanBeDeleted({
          staffProfileId: preflight.staff_profile_id,
          userId: preflight.user_id,
          appRoles: preflight.user_roles,
        });
      } catch (error: any) {
        return staffDeleteResult({
          authUserDeleted: false,
          staffProfileDeleted: false,
          partialFailure: false,
          warning: error?.message ?? "تعذر التحقق من حساب الدخول قبل الحذف.",
          deletedStaffProfileId: preflight.staff_profile_id,
          deletedUserId: preflight.user_id,
          messageAr: "لم يتم حذف ملف الموظف.",
        });
      }

      if (authCheck.warning) warning = authCheck.warning;

      if (authCheck.authUserExists) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(preflight.user_id);
        if (error) {
          return staffDeleteResult({
            authUserDeleted: false,
            staffProfileDeleted: false,
            partialFailure: false,
            warning: error.message || "تعذر حذف حساب الدخول، ولم يتم حذف ملف الموظف.",
            deletedStaffProfileId: preflight.staff_profile_id,
            deletedUserId: preflight.user_id,
            messageAr: "لم يتم حذف ملف الموظف.",
          });
        }
      }
      authUserDeleted = true;
      // user_roles.user_id → auth.users(id) ON DELETE CASCADE
      // (supabase/migrations/20260531205946_2c4ce56a-7217-4866-ad75-cf5a7ea812e3.sql).
      // Do not issue a separate DELETE on user_roles after auth.admin.deleteUser.
    }

    // No automatic cascade deletes of dependent tables (e.g. staff_profile_departments).
    // Those rows must fail preflight and force deactivate instead of hard delete.

    const { data: deletedRows, error: staffDeleteError } = await supabaseAdmin
      .from("staff_profiles")
      .delete()
      .eq("id", preflight.staff_profile_id)
      .eq("employee_number", data.expectedEmployeeNumber)
      .select("id");

    if (staffDeleteError) {
      return staffDeleteResult({
        authUserDeleted,
        staffProfileDeleted: false,
        partialFailure: authUserDeleted,
        warning: authUserDeleted
          ? `تم حذف حساب الدخول لكن بقي ملف الموظف دون حذف: ${staffDeleteError.message}`
          : staffDeleteError.message,
        deletedStaffProfileId: preflight.staff_profile_id,
        deletedUserId: preflight.user_id,
        messageAr: "لم يتم حذف ملف الموظف.",
      });
    }

    if ((deletedRows ?? []).length === 0) {
      const remainingStaff = await loadStaffProfile(preflight.staff_profile_id);
      if (remainingStaff) {
        return staffDeleteResult({
          authUserDeleted,
          staffProfileDeleted: false,
          partialFailure: authUserDeleted,
          warning: authUserDeleted
            ? "تم حذف حساب الدخول لكن بقي ملف الموظف دون حذف لأن الرقم الوظيفي تغيّر قبل تنفيذ الحذف."
            : "لم يتم حذف ملف الموظف لأن الرقم الوظيفي تغيّر قبل تنفيذ الحذف.",
          deletedStaffProfileId: preflight.staff_profile_id,
          deletedUserId: preflight.user_id,
          messageAr: "لم يتم حذف ملف الموظف.",
        });
      }
    }

    try {
      await logStaffAudit({
        actorUserId: context.userId,
        entityId: preflight.staff_profile_id,
        actionType: "staff_profile_deleted",
        notes: "Staff profile safely deleted from admin staff management.",
        payload: {
          deleted_user_id: preflight.user_id,
          employee_number: preflight.employee_number,
          full_name_ar: preflight.full_name_ar,
        },
      });
    } catch (error: any) {
      warning = warning
        ? `${warning} ${error?.message ?? "تعذر تسجيل سجل التدقيق."}`
        : "تم الحذف بنجاح، لكن تعذر تسجيل سجل التدقيق.";
    }

    return staffDeleteResult({
      authUserDeleted,
      staffProfileDeleted: true,
      partialFailure: false,
      warning,
      deletedStaffProfileId: preflight.staff_profile_id,
      deletedUserId: preflight.user_id,
      messageAr: "تم حذف ملف الموظف بنجاح.",
    });
  });

export const deactivateStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffProfileIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaffDeleteAdmin(context.userId);

    const preflight = await buildStaffDeletionPreflightFromDb({
      staffProfileId: data.staffProfileId,
      actorUserId: context.userId,
    });

    if (!preflight.canDeactivate) {
      if (preflight.isCurrentUser) {
        throw new Error("لا يمكن تعطيل حسابك الحالي.");
      }
      if (preflight.isAdmin || preflight.isSystemAdmin) {
        throw new Error("لا يمكن تعطيل موظف بصلاحية admin أو system_admin من هذه الصفحة.");
      }
      if (preflight.status === "inactive") {
        throw new Error("ملف الموظف معطّل مسبقاً.");
      }
      throw new Error(preflight.blockingReasons[0] ?? "تعذر تعطيل ملف الموظف.");
    }

    const { error } = await supabaseAdmin
      .from("staff_profiles")
      .update({ status: "inactive" } as any)
      .eq("id", data.staffProfileId);
    if (error) throw new Error(error.message);

    let auditError: unknown = null;
    try {
      await logStaffAudit({
        actorUserId: context.userId,
        entityId: data.staffProfileId,
        actionType: "staff_profile_deactivated",
        notes: "Staff profile deactivated from admin staff management.",
        payload: {
          staff_profile_id: data.staffProfileId,
          status: "inactive",
        },
      });
    } catch (error) {
      auditError = error;
    }

    return attachAuditWarning(
      {
        ok: true as const,
        staffProfileId: data.staffProfileId,
        status: "inactive" as const,
      },
      auditError,
      "تم تعطيل ملف الموظف",
    );
  });
