import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { B1_CANONICAL_CODES } from "../request-service-adapter";
import { B1SecureReadRpcClient, B1SecureReadRpcError, isB1SecureReadRpcUnavailable } from "./rpc";
import { B1_SECURE_READ_UPDATING_MSG } from "./contracts";
import { createB1Draft, saveB1Draft } from "../b1-secure-draft/functions";

const uuid = z.string().uuid();
const canonical = z.enum(B1_CANONICAL_CODES);
const empty = (input: unknown) =>
  z
    .object({})
    .strict()
    .parse(input ?? {});

type RpcLike = ConstructorParameters<typeof B1SecureReadRpcClient>[0];

function clientOf(supabase: RpcLike) {
  return new B1SecureReadRpcClient(supabase);
}

function mapThrown(error: unknown): never {
  if (error instanceof B1SecureReadRpcError) throw error;
  if (error instanceof Error) {
    if (isB1SecureReadRpcUnavailable({ message: error.message })) {
      throw new B1SecureReadRpcError(B1_SECURE_READ_UPDATING_MSG, "", true);
    }
    throw new B1SecureReadRpcError(error.message);
  }
  throw new B1SecureReadRpcError(B1_SECURE_READ_UPDATING_MSG, "", true);
}

export const probeB1SecureReadCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(empty)
  .handler(async ({ context }) => {
    try {
      return await clientOf(context.supabase).getCapability();
    } catch (error) {
      mapThrown(error);
    }
  });

export const getB1SecureFormOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ serviceCode: canonical }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).getFormOptions(data.serviceCode);
    } catch (error) {
      mapThrown(error);
    }
  });

export const getB1SecureDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).getDraft(data.requestId);
    } catch (error) {
      mapThrown(error);
    }
  });

export const getB1SecureStudentRequestDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).getStudentRequestDetails(data.requestId);
    } catch (error) {
      mapThrown(error);
    }
  });

export const listB1SecureStudentRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).listStudentRequests(data.limit, data.offset);
    } catch (error) {
      mapThrown(error);
    }
  });

export const getB1SecureAssignedInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).getAssignedInbox(data.limit, data.offset);
    } catch (error) {
      mapThrown(error);
    }
  });

export const getB1SecureAssignedRequestDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).getAssignedRequestDetails(data.requestId);
    } catch (error) {
      mapThrown(error);
    }
  });

export const getB1SecureStepAllowedActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stepId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).getStepAllowedActions(data.stepId);
    } catch (error) {
      mapThrown(error);
    }
  });

export const listB1SecureAttachmentsForViewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await clientOf(context.supabase).listAttachmentsForViewer(data.requestId);
    } catch (error) {
      mapThrown(error);
    }
  });

/** Stacked write wrappers — delegate to secure-draft mutation contracts. */
export const createB1SecureDraftFailClosed = createB1Draft;
export const saveB1SecureDraftFailClosed = saveB1Draft;
