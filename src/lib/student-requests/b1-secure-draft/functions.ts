import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { B1_CANONICAL_CODES } from "../request-service-adapter";
import { B1SecureDraftRpcClient, mapB1SecureDraftThrown } from "./rpc";
import { normalizeB1DraftFormData } from "./contracts";

const uuid = z.string().uuid();
const canonical = z.enum(B1_CANONICAL_CODES);

/** Adapter-consumable: createB1Draft */
export const createB1Draft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        serviceCode: canonical,
        idempotencyKey: z.string().min(1).max(200).optional().nullable(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      return await new B1SecureDraftRpcClient(context.supabase).createDraft(
        data.serviceCode,
        data.idempotencyKey,
      );
    } catch (error) {
      mapB1SecureDraftThrown(error, {
        operation: "createDraft",
        serviceCode: data.serviceCode,
        requestId: null,
      });
    }
  });

/** Adapter-consumable: saveB1Draft */
export const saveB1Draft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: uuid,
        formData: z.record(z.unknown()),
        expectedUpdatedAt: z.string().datetime({ offset: true }),
        idempotencyKey: z.string().min(1).max(200).optional().nullable(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      return await new B1SecureDraftRpcClient(context.supabase).saveDraft({
        requestId: data.requestId,
        // Normalize secure-attachment reference fields to the exact jsonb shape
        // the backend contract accepts (absent key or uuid array).
        formData: normalizeB1DraftFormData(data.formData),
        expectedUpdatedAt: data.expectedUpdatedAt,
        idempotencyKey: data.idempotencyKey,
      });
    } catch (error) {
      mapB1SecureDraftThrown(error, {
        operation: "saveDraft",
        serviceCode: null,
        requestId: data.requestId,
      });
    }
  });
