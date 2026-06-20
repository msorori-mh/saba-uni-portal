import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CMS_BUCKETS = [
  "news-images",
  "events-images",
  "faculty-images",
  "research-pdfs",
] as const;

const BUCKET_ROLES: Record<(typeof CMS_BUCKETS)[number], readonly string[]> = {
  "news-images": ["system_admin", "admin"],
  "events-images": ["system_admin", "admin"],
  "faculty-images": ["system_admin", "admin", "dean", "hr_officer"],
  "research-pdfs": ["system_admin", "admin"],
};

export const uploadAdminStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      bucket: z.enum(CMS_BUCKETS),
      fileBase64: z.string().min(1),
      contentType: z.string().min(1),
      fileName: z.string().min(1).max(200),
      maxBytes: z.number().int().min(1).max(20 * 1024 * 1024).default(5 * 1024 * 1024),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const roles = BUCKET_ROLES[data.bucket];
    await assertAnyRole(context.userId, roles, "ليس لديك صلاحية رفع الملفات");
    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.byteLength > data.maxBytes) {
      throw new Error(`الحد الأقصى ${Math.round(data.maxBytes / 1024 / 1024)} ميجابايت`);
    }
    const ext = data.fileName.split(".").pop()?.toLowerCase() || "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(path, buffer, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: urlData } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path);
    return { publicUrl: urlData.publicUrl, path };
  });

export const removeAdminStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      bucket: z.enum(CMS_BUCKETS),
      path: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const roles = BUCKET_ROLES[data.bucket];
    await assertAnyRole(context.userId, roles);
    const { error } = await supabaseAdmin.storage.from(data.bucket).remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
