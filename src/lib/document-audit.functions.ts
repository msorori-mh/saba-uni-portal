// Phase 10A: best-effort audit logging for document print/download actions.
// Never throws to caller; missing auth or RPC errors are swallowed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  documentId: z.string().uuid(),
  action: z.enum(["document_printed", "document_downloaded"]),
});

export const logDocumentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof schema>) => schema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      const { data: doc } = await sb.from("official_documents")
        .select("document_number, document_type")
        .eq("id", data.documentId).maybeSingle();
      await sb.rpc("log_audit", {
        _entity_type: "document",
        _entity_id: data.documentId,
        _action_type: data.action,
        _old: null,
        _new: {
          document_number: doc?.document_number ?? null,
          document_type: doc?.document_type ?? null,
        },
        _notes: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
