import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { storagePathFromPublicUrl } from "@/lib/file-upload";

const PDF_BUCKET = "research-pdfs";
const RESEARCH_ADMIN_ROLES = ["system_admin", "admin"] as const;

async function signPaperPdf(paperId: string, requirePublished: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: paper, error } = await supabaseAdmin
    .from("research_papers")
    .select("id, pdf_url, is_published")
    .eq("id", paperId)
    .maybeSingle();

  if (error) throw new Error("تعذر تحميل الملف");
  if (!paper?.pdf_url) throw new Error("الملف غير متاح");
  if (requirePublished && !paper.is_published) throw new Error("الملف غير متاح");

  const path = storagePathFromPublicUrl(PDF_BUCKET, paper.pdf_url) ?? paper.pdf_url;
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, 300);

  if (signErr || !signed?.signedUrl) throw new Error("تعذر تحميل الملف");
  return { url: signed.signedUrl };
}

/** Public: short-lived signed URL, published papers only. */
export const getResearchPaperPdfUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ paperId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => signPaperPdf(data.paperId, true));

/** Staff: signed URL for any paper, research admins only. */
export const getAdminResearchPaperPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paperId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, RESEARCH_ADMIN_ROLES, "ليس لديك صلاحية عرض الملف");
    return signPaperPdf(data.paperId, false);
  });
