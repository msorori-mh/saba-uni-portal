/**
 * Graduates Affairs server adapters.
 *
 * Client/UI must not mutate domain tables. Every operational call uses the
 * AUTH-04 RPC client. Feature flags default OFF and block mutations.
 *
 * Trust boundary: resolve* adapters accept only non-authoritative client
 * identifiers (capability / recordId). Ownership, lifecycle, continuity,
 * assignments, department scope, and follow-up authority are derived via
 * AUTH-04 context RPCs — never from client-supplied facts.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import {
  ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
  type AccountContinuityPolicy,
  type GraduateAccountCapability,
} from "@/lib/graduates-affairs/account-continuity";
import {
  graduateSelfSurfaceInputSchema,
  staffGraduateAccessInputSchema,
} from "@/lib/graduates-affairs/adapter-input";
import {
  assertGraduateMutationAllowed,
  assertNoDirectGraduateTableMutation,
  evaluateGraduateSelfRuntimeAccess,
  type GraduateFactLifecycle,
} from "@/lib/graduates-affairs/runtime-gate";
import {
  GraduatesAffairsRpcClient,
  GraduatesAffairsRpcError,
} from "@/lib/graduates-affairs/rpc";

export {
  graduateSelfSurfaceInputSchema,
  staffGraduateAccessInputSchema,
} from "@/lib/graduates-affairs/adapter-input";

export const GRADUATES_AFFAIRS_FROZEN_MSG =
  "بوابة شؤون الخريجين مجمدة مؤقتًا وغير متاحة حالياً.";

type SessionRpc = ConstructorParameters<typeof GraduatesAffairsRpcClient>[0];

function rpcClient(supabase: SessionRpc) {
  return new GraduatesAffairsRpcClient(supabase);
}

function denyMutationWhenFlagOff(flag: "studentGraduatesAffairs" | "staffGraduatesAffairs") {
  const gate = assertGraduateMutationAllowed(isPortalFeatureEnabled(flag));
  if (!gate.allowed) {
    throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, gate.reason);
  }
}

/** Explicit contract: adapters never expose a table-write helper. */
export function graduatesAffairsDirectTableWriteAttempt(
  table: string,
  kind: "insert" | "update" | "delete" | "upsert",
): never {
  const blocked = assertNoDirectGraduateTableMutation(table, kind);
  throw new GraduatesAffairsRpcError(blocked.reason, blocked.reason);
}

const GRADUATE_FACT_LIFECYCLES: readonly GraduateFactLifecycle[] = [
  "approved",
  "corrected",
  "revoked",
  "pending",
  "absent",
  "unavailable",
];

function asGraduateFactLifecycle(state: string): GraduateFactLifecycle {
  if ((GRADUATE_FACT_LIFECYCLES as readonly string[]).includes(state)) {
    return state as GraduateFactLifecycle;
  }
  return "unavailable";
}

/**
 * Map server-derived continuity boolean into a policy object the pure gate
 * can evaluate. Never constructed from client input.
 */
function continuityPolicyFromServerDecision(
  continuityAllowed: boolean,
  capability: GraduateAccountCapability,
  at: string,
): AccountContinuityPolicy {
  if (!continuityAllowed) {
    return ACCOUNT_CONTINUITY_POLICY_UNDECIDED;
  }
  return {
    policyCode: "graduate-account-continuity",
    state: "approved",
    allowPortalSignIn: capability === "portal_sign_in",
    allowUniversityEmailReuse: capability === "university_email_reuse",
    allowedCapabilities: [capability],
    validFrom: null,
    expiresAt: null,
    decidedBy: "graduate_affairs_resolve_self_context",
    decidedAt: at,
  };
}

/**
 * Resolves whether the authenticated user may enter the graduate self surface.
 * Does not grant access from student_profiles.status or candidate lists.
 * Client-forged ownership / lifecycle / continuity fields are rejected.
 */
export const resolveGraduateSelfSurfaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateSelfSurfaceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const at = data.at ?? new Date().toISOString();
    const featureEnabled = isPortalFeatureEnabled("studentGraduatesAffairs");
    const ctx = await rpcClient(context.supabase as SessionRpc).resolveSelfContext(
      data.capability,
    );
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled,
      authenticated: Boolean(context.userId),
      // Never authoritative — placeholders only; gate ignores these fields.
      studentProfileStatus: null,
      isGraduationCandidate: false,
      ownsGraduateRecord: Boolean(ctx.owns_graduate_record),
      graduateRecordState: asGraduateFactLifecycle(ctx.graduate_record_state),
      continuityPolicy: continuityPolicyFromServerDecision(
        Boolean(ctx.continuity_allowed),
        data.capability,
        at,
      ),
      capability: data.capability,
      at,
    });
    return {
      allowed: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
      via: decision.allowed ? decision.via ?? "self" : null,
      featureEnabled,
      userId: context.userId,
      graduateRecordId: ctx.graduate_record_id ?? null,
    };
  });

export const resolveStaffGraduateAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffGraduateAccessInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    void data.at;
    const featureEnabled = isPortalFeatureEnabled("staffGraduatesAffairs");
    if (!featureEnabled) {
      return {
        allowed: false,
        reason: "graduates_affairs_feature_flag_off",
        via: null,
        featureEnabled: false,
      };
    }
    if (!context.userId) {
      return {
        allowed: false,
        reason: "graduates_affairs_not_authenticated",
        via: null,
        featureEnabled,
      };
    }
    const result = await rpcClient(context.supabase as SessionRpc).resolveStaffRecordAccess(
      data.recordId,
    );
    return {
      allowed: Boolean(result.allowed),
      reason: result.allowed ? null : (result.reason ?? "graduate_record_access_denied"),
      via: result.allowed ? (result.via ?? null) : null,
      featureEnabled,
    };
  });

const graduateRecordIdSchema = z.object({
  graduateRecordId: z.string().uuid(),
});

/** Staff file read — AUTH-04 RPC only. Flag OFF blocks the operational call. */
export const getStaffGraduateFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("staffGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).getGraduateFile(data.graduateRecordId);
  });

const searchSchema = z.object({
  programId: z.string().uuid().nullable(),
  departmentId: z.string().uuid().nullable(),
  graduationYear: z.number().int().nullable(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const searchGraduateRecordsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("staffGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).searchRecords(data);
  });

const updateProfileSchema = z.object({
  graduateRecordId: z.string().uuid(),
  publicDisplayName: z.string().nullable(),
  preferredContactChannel: z.string().nullable(),
  careerSummary: z.string().nullable(),
  profileVisibility: z.string().nullable(),
  rowVersion: z.number().int(),
});

/** Self profile mutation — AUTH-04 RPC only; blocked when student flag OFF. */
export const updateGraduateOwnProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).updateOwnProfile(data);
  });
