/**
 * Read-only readiness probe for the B1 details preflight.
 *
 * The UI calls this BEFORE offering a forward staff action, so the missing
 * details row is summarized in the panel instead of surfacing only as a
 * backend error after the click.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inspectB1DetailsRowForStep } from "@/lib/student-requests/b1-details-preflight.server";

export type B1DetailsReadiness = {
  /** true when no details row is required (non-B1 service) or the row exists. */
  ready: boolean;
  /** Detail table that must hold a row for this request, when applicable. */
  table: string | null;
  serviceLabelAr: string | null;
  requestNumber: string | null;
  /** Explicit Arabic explanation when `ready` is false. */
  messageAr: string | null;
};

const schema = z.object({ stepId: z.string().uuid() }).strict();

export const getB1DetailsReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<B1DetailsReadiness> => {
    return inspectB1DetailsRowForStep({ stepId: data.stepId });
  });
