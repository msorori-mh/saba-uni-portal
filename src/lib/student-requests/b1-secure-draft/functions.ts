import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { B1_CANONICAL_CODES } from "../request-service-adapter";
import {
  B1SecureDraftRpcClient,
  B1SecureDraftRpcError,
  isB1SecureDraftRpcUnavailable,
} from "./rpc";
import { B1_SECURE_DRAFT_UPDATING_MSG } from "./contracts";

const uuid = z.string().uuid();
const canonical = z.enum(B1_CANONICAL_CODES);

type RpcLike = ConstructorParameters<typeof B1SecureDraftRpcClient>[0];

function clientOf(supabase: RpcLike) {
  return new B1SecureDraftRpcClient(supabase);
}

function mapThrown(error: unknown): never {
  if (error instanceof B1SecureDraftRpcError) throw error;
  if (error instanceof Error) {
    if (isB1SecureDraftRpcUnavailable({ message: error.message })) {
      throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG, "", true);
    }
    throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG);
  }
  throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG, "", true);
}

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
      return await clientOf(context.supabase).createDraft(data.serviceCode, data.idempotencyKey);
    } catch (error) {
      mapThrown(error);
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
      return await clientOf(context.supabase).saveDraft({
        requestId: data.requestId,
        formData: data.formData,
        expectedUpdatedAt: data.expectedUpdatedAt,
        idempotencyKey: data.idempotencyKey,
      });
    } catch (error) {
      mapThrown(error);
    }
  });
