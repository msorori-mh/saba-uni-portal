import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getRegistryDefaultsForAdminForm,
  isLegacyStudentRequestTypeAlias,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";

export const REQUEST_TYPES_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "registrar",
  "student_affairs",
] as const;

export type RequestTypeAdminRow = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  is_active: boolean;
  requires_attachment: boolean;
  sort_order: number;
  student_visible: boolean;
  request_audience: "active_student" | "graduate" | "both" | null;
  ineligible_display_mode: "hidden" | "disabled" | null;
};

export type RequestTypeAdminSchemaCapabilities = {
  hasAudienceFields: boolean;
  hasStudentVisible: boolean;
};

export type ListRequestTypesResult = {
  types: RequestTypeAdminRow[];
  capabilities: RequestTypeAdminSchemaCapabilities;
};

const audienceSchema = z.enum(["active_student", "graduate", "both"]);
const ineligibleSchema = z.enum(["hidden", "disabled"]);

const basePayloadSchema = z.object({
  code: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "الكود غير صالح"),
  name_ar: z.string().min(1),
  description_ar: z.string().nullable(),
  is_active: z.boolean(),
  requires_attachment: z.boolean(),
  sort_order: z.number().int().min(0),
  student_visible: z.boolean().optional(),
  request_audience: audienceSchema.optional(),
  ineligible_display_mode: ineligibleSchema.optional(),
});

function isMissingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist")
    || lower.includes("column")
    || lower.includes("42703")
  );
}

async function probeRequestTypeSchema(): Promise<RequestTypeAdminSchemaCapabilities> {
  const caps: RequestTypeAdminSchemaCapabilities = {
    hasAudienceFields: false,
    hasStudentVisible: false,
  };

  const audienceProbe = await supabaseAdmin
    .from("request_types")
    .select("request_audience, ineligible_display_mode")
    .limit(1);
  if (!audienceProbe.error) caps.hasAudienceFields = true;

  const visibleProbe = await supabaseAdmin
    .from("request_types")
    .select("student_visible")
    .limit(1);
  if (!visibleProbe.error) caps.hasStudentVisible = true;

  return caps;
}

function rowToAdminType(
  row: Record<string, unknown>,
  caps: RequestTypeAdminSchemaCapabilities,
): RequestTypeAdminRow {
  const defaults = getRegistryDefaultsForAdminForm(String(row.code ?? ""));
  return {
    id: String(row.id),
    code: String(row.code),
    name_ar: String(row.name_ar),
    description_ar: (row.description_ar as string | null) ?? null,
    is_active: Boolean(row.is_active),
    requires_attachment: Boolean(row.requires_attachment),
    sort_order: Number(row.sort_order ?? 0),
    student_visible: caps.hasStudentVisible
      ? Boolean(row.student_visible)
      : Boolean(row.is_active),
    request_audience: caps.hasAudienceFields
      ? (row.request_audience as RequestTypeAdminRow["request_audience"]) ?? defaults?.request_audience ?? "active_student"
      : defaults?.request_audience ?? null,
    ineligible_display_mode: caps.hasAudienceFields
      ? (row.ineligible_display_mode as RequestTypeAdminRow["ineligible_display_mode"]) ?? defaults?.ineligible_display_mode ?? "hidden"
      : defaults?.ineligible_display_mode ?? null,
  };
}

async function assertRequestTypesAdmin(userId: string) {
  await assertAnyRole(
    userId,
    REQUEST_TYPES_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة أنواع الطلبات",
  );
}

export const listRequestTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListRequestTypesResult> => {
    await assertRequestTypesAdmin(context.userId);
    const capabilities = await probeRequestTypeSchema();

    const selectCols = [
      "id",
      "code",
      "name_ar",
      "description_ar",
      "is_active",
      "requires_attachment",
      "sort_order",
      capabilities.hasStudentVisible ? "student_visible" : null,
      capabilities.hasAudienceFields ? "request_audience" : null,
      capabilities.hasAudienceFields ? "ineligible_display_mode" : null,
    ]
      .filter(Boolean)
      .join(", ");

    const { data, error } = await supabaseAdmin
      .from("request_types")
      .select(selectCols)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);

    const types = (data ?? []).map((row) =>
      rowToAdminType(row as Record<string, unknown>, capabilities),
    );

    return { types, capabilities };
  });

export const toggleRequestTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      isActive: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestTypesAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("request_types")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type UpsertRequestTypeResult = {
  ok: true;
  id: string;
  savedAudienceFields: boolean;
  savedStudentVisible: boolean;
};

export const upsertRequestType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      code: z.string().min(1),
      name_ar: z.string().min(1),
      description_ar: z.string(),
      is_active: z.boolean(),
      requires_attachment: z.boolean(),
      sort_order: z.number(),
      student_visible: z.boolean().optional(),
      request_audience: audienceSchema.optional(),
      ineligible_display_mode: ineligibleSchema.optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<UpsertRequestTypeResult> => {
    await assertRequestTypesAdmin(context.userId);

    const code = data.code.trim().toLowerCase().replace(/\s+/g, "_");
    if (isLegacyStudentRequestTypeAlias(code)) {
      throw new Error("لا يمكن إنشاء نوع طلب بكود legacy. استخدم الكود الرسمي من القائمة.");
    }

    const capabilities = await probeRequestTypeSchema();
    const payload = basePayloadSchema.parse({
      code,
      name_ar: data.name_ar.trim(),
      description_ar: data.description_ar.trim() || null,
      is_active: data.is_active,
      requires_attachment: data.requires_attachment,
      sort_order: Number(data.sort_order) || 0,
      student_visible: data.student_visible,
      request_audience: data.request_audience,
      ineligible_display_mode: data.ineligible_display_mode,
    });

    const baseUpdate = {
      name_ar: payload.name_ar,
      description_ar: payload.description_ar,
      is_active: payload.is_active,
      requires_attachment: payload.requires_attachment,
      sort_order: payload.sort_order,
    };

    const extendedUpdate: Record<string, unknown> = { ...baseUpdate };
    let savedAudienceFields = false;
    let savedStudentVisible = false;

    if (capabilities.hasStudentVisible && payload.student_visible != null) {
      extendedUpdate.student_visible = payload.student_visible;
      savedStudentVisible = true;
    }

    if (
      capabilities.hasAudienceFields
      && payload.request_audience
      && payload.ineligible_display_mode
    ) {
      extendedUpdate.request_audience = payload.request_audience;
      extendedUpdate.ineligible_display_mode = payload.ineligible_display_mode;
      savedAudienceFields = true;
    }

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("request_types")
        .update(extendedUpdate)
        .eq("id", data.id);
      if (error) {
        if (isMissingColumnError(error.message) && Object.keys(extendedUpdate).length > Object.keys(baseUpdate).length) {
          const { error: fallbackErr } = await supabaseAdmin
            .from("request_types")
            .update(baseUpdate)
            .eq("id", data.id);
          if (fallbackErr) throw new Error(fallbackErr.message);
          return {
            ok: true,
            id: data.id,
            savedAudienceFields: false,
            savedStudentVisible: false,
          };
        }
        throw new Error(error.message);
      }
      return {
        ok: true,
        id: data.id,
        savedAudienceFields,
        savedStudentVisible,
      };
    }

    const insertRow: Record<string, unknown> = {
      code: payload.code,
      ...extendedUpdate,
    };

    const { data: row, error } = await supabaseAdmin
      .from("request_types")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      if (isMissingColumnError(error.message)) {
        const { data: fallbackRow, error: fallbackErr } = await supabaseAdmin
          .from("request_types")
          .insert({
            code: payload.code,
            ...baseUpdate,
          })
          .select("id")
          .single();
        if (fallbackErr) throw new Error(fallbackErr.message);
        return {
          ok: true,
          id: fallbackRow.id,
          savedAudienceFields: false,
          savedStudentVisible: false,
        };
      }
      throw new Error(error.message);
    }

    return {
      ok: true,
      id: row.id,
      savedAudienceFields,
      savedStudentVisible,
    };
  });

export const deleteRequestType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestTypesAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("request_types")
      .delete()
      .eq("id", data.id);
    if (error) {
      const msg = error.message;
      if (msg.includes("foreign") || msg.includes("violates")) {
        throw new Error("لا يمكن الحذف: هناك طلبات مرتبطة بهذا النوع. يمكنك تعطيله بدلًا من حذفه.");
      }
      throw new Error(msg);
    }
    return { ok: true as const };
  });

/** Exported for tests / UI hints. */
export function normalizedCodeForDisplay(code: string): string {
  return normalizeStudentRequestTypeCode(code);
}
