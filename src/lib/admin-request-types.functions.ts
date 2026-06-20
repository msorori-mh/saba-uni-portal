import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const REQUEST_TYPES_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "registrar",
  "student_affairs",
] as const;

const requestTypePayloadSchema = z.object({
  code: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "الكود غير صالح"),
  name_ar: z.string().min(1),
  description_ar: z.string().nullable(),
  is_active: z.boolean(),
  requires_attachment: z.boolean(),
  sort_order: z.number().int().min(0),
});

async function assertRequestTypesAdmin(userId: string) {
  await assertAnyRole(
    userId,
    REQUEST_TYPES_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة أنواع الطلبات",
  );
}

export const listRequestTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRequestTypesAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("request_types")
      .select("id, code, name_ar, description_ar, is_active, requires_attachment, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
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
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestTypesAdmin(context.userId);

    const code = data.code.trim().toLowerCase().replace(/\s+/g, "_");
    const name_ar = data.name_ar.trim();
    const payload = requestTypePayloadSchema.parse({
      code,
      name_ar,
      description_ar: data.description_ar.trim() || null,
      is_active: data.is_active,
      requires_attachment: data.requires_attachment,
      sort_order: Number(data.sort_order) || 0,
    });

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("request_types")
        .update({
          name_ar: payload.name_ar,
          description_ar: payload.description_ar,
          is_active: payload.is_active,
          requires_attachment: payload.requires_attachment,
          sort_order: payload.sort_order,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("request_types")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
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
