import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import {
  ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES,
  ENROLLMENT_CERTIFICATE_E2E_MARKER_PATTERN,
} from "@/lib/enrollment-certificate-e2e-auth";
import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";

/**
 * Internal E2E helpers only — no public admin UI route or student-facing entry.
 * DB SECURITY DEFINER RPCs remain the source of truth for authorization.
 */

const e2eMarkerSchema = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(ENROLLMENT_CERTIFICATE_E2E_MARKER_PATTERN, "صيغة وسم E2E غير صالحة");

async function assertEnrollmentCertificateE2EAdmin(userId: string) {
  await assertAnyRole(
    userId,
    ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES,
    "غير مصرح بإدارة اختبار شهادة القيد المخفي",
  );
}

export type AdminCreateEnrollmentCertificateE2EDraftResult = {
  success: true;
  requestId: string;
  requestTypeId: string;
  studentUserId: string;
  status: string;
  e2eMarker: string;
  reusedExisting: boolean;
  createdAt: string;
};

export const adminCreateEnrollmentCertificateE2EDraft = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        studentUserId: z.string().uuid(),
        e2eMarker: e2eMarkerSchema,
        studentNotes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<AdminCreateEnrollmentCertificateE2EDraftResult> => {
      await assertEnrollmentCertificateE2EAdmin(context.userId);

      const { data: rpcData, error } = await context.supabase.rpc(
        "admin_create_enrollment_certificate_e2e_draft",
        {
          p_student_user_id: data.studentUserId,
          p_e2e_marker: data.e2eMarker,
          p_student_notes: data.studentNotes ?? null,
        },
      );

      if (error) throw new Error(mapStudentRequestRpcError(error));

      const raw = (rpcData ?? {}) as Record<string, unknown>;
      if (raw.success !== true) {
        throw new Error("تعذر إنشاء مسودة اختبار شهادة القيد");
      }

      return {
        success: true,
        requestId: String(raw.request_id ?? ""),
        requestTypeId: String(raw.request_type_id ?? ""),
        studentUserId: String(raw.student_user_id ?? data.studentUserId),
        status: String(raw.status ?? "draft"),
        e2eMarker: String(raw.e2e_marker ?? data.e2eMarker),
        reusedExisting: Boolean(raw.reused_existing),
        createdAt: String(raw.created_at ?? ""),
      };
    },
  );

export type AdminSetEnrollmentCertificateE2ESubmitWindowResult = {
  success: true;
  windowOpen: boolean;
  requestTypeId: string;
  requestId: string | null;
  e2eMarker: string;
  isActive: boolean;
  studentVisible: false;
  previousIsActive: boolean;
  newIsActive: boolean;
};

export const adminSetEnrollmentCertificateE2ESubmitWindow = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        open: z.boolean(),
        e2eMarker: e2eMarkerSchema,
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<AdminSetEnrollmentCertificateE2ESubmitWindowResult> => {
      await assertEnrollmentCertificateE2EAdmin(context.userId);

      const { data: rpcData, error } = await context.supabase.rpc(
        "admin_set_enrollment_certificate_e2e_submit_window",
        {
          p_open: data.open,
          p_e2e_marker: data.e2eMarker,
        },
      );

      if (error) throw new Error(mapStudentRequestRpcError(error));

      const raw = (rpcData ?? {}) as Record<string, unknown>;
      if (raw.success !== true) {
        throw new Error("تعذر تحديث نافذة تقديم اختبار شهادة القيد");
      }

      if (raw.student_visible !== false) {
        throw new Error("student_visible must remain false after window update");
      }

      return {
        success: true,
        windowOpen: Boolean(raw.window_open),
        requestTypeId: String(raw.request_type_id ?? ""),
        requestId: raw.request_id ? String(raw.request_id) : null,
        e2eMarker: String(raw.e2e_marker ?? data.e2eMarker),
        isActive: Boolean(raw.is_active),
        studentVisible: false,
        previousIsActive: Boolean(raw.previous_is_active),
        newIsActive: Boolean(raw.new_is_active),
      };
    },
  );
