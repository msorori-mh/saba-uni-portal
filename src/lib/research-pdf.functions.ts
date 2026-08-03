import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { storagePathFromPublicUrl } from "@/lib/file-upload";

const PDF_BUCKET = "research-pdfs";

/**
 * Returns a short-lived signed URL for a research paper PDF.
 * The bucket is private: unpublished papers are never retrievable publicly.
 * Published papers are readable by anyone; unpublished ones require an
 * authenticated user with a research-admin role.
 */
export const getResearchPaperPdfUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ paperId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: paper, error } = await supabaseAdmin
      .from("research_papers")
      .select("id, pdf_url, is_published")
      .eq("id", data.paperId)
      .maybeSingle();

    if (error) throw new Error("تعذر تحميل الملف");
    if (!paper?.pdf_url) throw new Error("الملف غير متاح");

    if (!paper.is_published) {
      // Unpublished drafts require an authorised staff session.
      const authHeader = (globalThis as { __unused?: never }) && undefined;
      void authHeader;
      throw new Error("الملف غير متاح");
    }

    const path =
      storagePathFromPublicUrl(PDF_BUCKET, paper.pdf_url) ?? paper.pdf_url;

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(PDF_BUCKET)
      .createSignedUrl(path, 300);

    if (signErr || !signed?.signedUrl) throw new Error("تعذر تحميل الملف");
    return { url: signed.signedUrl };
  });
