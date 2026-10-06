import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertAnyRole, hasAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STUDENT_SERVICES_MESSAGE_MAX_LENGTH,
  STUDENT_SERVICES_STATUS_NOT_INSTALLED,
  STUDENT_SERVICES_SWITCH_ADMIN_ROLES,
  isStudentServicesSwitchNotInstalled,
  validateStudentServicesMessage,
  type StudentServicesAdminView,
  type StudentServicesStatus,
} from "@/lib/student-requests/student-services-switch";
import {
  readStudentServicesStatus,
  type StudentServicesRpcClient,
} from "@/lib/student-requests/student-services-switch.server";

/** Roles that may SEE the card (the admin page's own audience). */
const STUDENT_SERVICES_SWITCH_VIEW_ROLES = [
  "system_admin",
  "admin",
  "registrar",
  "student_affairs",
] as const;

const SWITCH_NOT_INSTALLED_MESSAGE_AR =
  "مفتاح الخدمات الطلابية غير مفعّل في قاعدة البيانات بعد. يلزم تطبيق الترحيل المعتمد أولاً.";

function asRpc(client: unknown): StudentServicesRpcClient {
  return client as StudentServicesRpcClient;
}

/**
 * Student / any signed-in user: is starting a new request possible right now?
 * A read problem never blocks browsing — the server still refuses the submit.
 */
export const getStudentServicesStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentServicesStatus> => {
    try {
      return await readStudentServicesStatus(asRpc(context.supabase));
    } catch {
      return { ...STUDENT_SERVICES_STATUS_NOT_INSTALLED, installed: true };
    }
  });

async function resolveActorName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data: staff } = await supabaseAdmin
    .from("staff_profiles")
    .select("full_name_ar")
    .eq("user_id", userId)
    .maybeSingle();
  const staffName = (staff as { full_name_ar?: string | null } | null)?.full_name_ar;
  if (staffName) return staffName;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Admin page card: current state, notice, who/when. Read-only for non-admins. */
export const getAdminStudentServicesSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentServicesAdminView> => {
    await assertAnyRole(
      context.userId,
      STUDENT_SERVICES_SWITCH_VIEW_ROLES,
      "ليس لديك صلاحية عرض حالة الخدمات الطلابية",
    );
    const canManage = await hasAnyRole(context.userId, STUDENT_SERVICES_SWITCH_ADMIN_ROLES);
    const rpc = asRpc(context.supabase);

    if (!canManage) {
      // Non-admin staff see the state only — never who changed it.
      const status = await readStudentServicesStatus(rpc);
      return {
        enabled: status.enabled,
        messageAr: status.enabled ? null : status.messageAr,
        updatedAt: status.updatedAt,
        updatedByName: null,
        hasBeenChanged: Boolean(status.updatedAt),
        installed: status.installed,
        canManage: false,
      };
    }

    const { data, error } = await rpc.rpc("admin_get_student_services_switch");
    if (error) {
      if (isStudentServicesSwitchNotInstalled(error)) {
        return {
          enabled: true,
          messageAr: null,
          updatedAt: null,
          updatedByName: null,
          hasBeenChanged: false,
          installed: false,
          canManage: true,
        };
      }
      throw new Error("تعذر تحميل حالة الخدمات الطلابية");
    }
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const updatedBy = typeof row.updated_by === "string" ? row.updated_by : null;
    return {
      // Anything but an explicit true is "paused" (fail closed).
      enabled: row.enabled === true,
      messageAr: typeof row.message_ar === "string" ? row.message_ar : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      updatedByName: await resolveActorName(updatedBy),
      hasBeenChanged: updatedBy !== null,
      installed: true,
      canManage: true,
    };
  });

const setSchema = z
  .object({
    enabled: z.boolean(),
    message: z
      .string()
      .max(STUDENT_SERVICES_MESSAGE_MAX_LENGTH + 200)
      .nullish(),
  })
  .strict();

/**
 * The switch itself. admin | system_admin only — checked here AND again inside
 * `admin_set_student_services_enabled()` (called with the caller's own session
 * so auth.uid() is the admin and the database writes the audit row).
 */
export const setAdminStudentServicesSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const message = validateStudentServicesMessage(data.message ?? null);
    if (!message.ok) throw new Error(message.messageAr);

    const { data: result, error } = await asRpc(context.supabase).rpc(
      "admin_set_student_services_enabled",
      { p_enabled: data.enabled, p_message: message.value },
    );
    if (error) {
      if (isStudentServicesSwitchNotInstalled(error)) throw new Error(SWITCH_NOT_INSTALLED_MESSAGE_AR);
      const text = error.message ?? "";
      if (/STUDENT_SERVICES_SWITCH_(ADMIN|AUTH)_REQUIRED/.test(text)) throw new Error("ليس لديك صلاحية");
      if (/STUDENT_SERVICES_SWITCH_MESSAGE_TOO_LONG/.test(text)) {
        throw new Error(`الرسالة أطول من الحد المسموح (${STUDENT_SERVICES_MESSAGE_MAX_LENGTH} حرفًا).`);
      }
      if (/STUDENT_SERVICES_SWITCH_MESSAGE_PLAIN_TEXT_REQUIRED/.test(text)) {
        throw new Error("الرسالة نص عادي فقط.");
      }
      throw new Error("تعذر حفظ حالة الخدمات الطلابية");
    }
    const row = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
    return {
      enabled: row.enabled === true,
      changed: row.changed === true,
    };
  });
