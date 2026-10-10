import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcGetAvailableRequestTypes } from "@/lib/student-request-rpc";

const input = z.object({ question: z.string().trim().min(5).max(1500) });

export const askStudentServiceGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { runServiceGuide, ServiceGuideError } = await import("@/lib/student-service-guide.server");
    // Only services the backend exposes to this student (student_visible + eligibility via RPC).
    const rows = await rpcGetAvailableRequestTypes(context.supabase as never);
    const services = rows
      .filter((r) => !r.is_disabled || r.ineligible_display_mode !== "hidden")
      .map((r) => ({
        code: r.code,
        name_ar: r.name_ar,
        description_ar: r.description_ar ?? null,
        requires_attachment: r.requires_attachment ?? null,
        is_eligible: r.is_eligible ?? null,
        disabled_reason: r.disabled_reason ?? null,
      }));
    try {
      return { ok: true as const, result: await runServiceGuide(data.question, services) };
    } catch (error) {
      if (error instanceof ServiceGuideError) return { ok: false as const, error: error.message };
      throw error;
    }
  });
