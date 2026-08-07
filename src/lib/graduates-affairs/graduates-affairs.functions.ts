/**
 * Graduates Affairs server adapters.
 *
 * Client/UI must not mutate domain tables. Every operational call uses the
 * AUTH-04 RPC client. Feature flags default OFF and block mutations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import {
  ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
  type AccountContinuityPolicy,
} from "@/lib/graduates-affairs/account-continuity";
import {
  assertGraduateMutationAllowed,
  assertNoDirectGraduateTableMutation,
  evaluateGraduateSelfRuntimeAccess,
  evaluateStaffRuntimeAccess,
  type GraduateFactLifecycle,
} from "@/lib/graduates-affairs/runtime-gate";
import {
  GraduatesAffairsRpcClient,
  GraduatesAffairsRpcError,
} from "@/lib/graduates-affairs/rpc";
import type { GraduateAffairsActor, RecordScope } from "@/lib/graduates-affairs/authorization";

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

/** P0 §6.1 vocabulary (plus legacy aliases retained by account-continuity). */
const graduateAccountCapabilitySchema = z.enum([
  "portal_sign_in",
  "password_recovery",
  "university_email_reuse",
  "profile_self_service",
  "profile_self_service_non_academic",
  "request_audience_graduate",
  "request_audience_both_as_graduate",
  "official_document_download_issued_archived",
  "graduate_profile_self_service",
  "survey_participation",
  "graduate_survey_participation",
  "graduate_opportunity_view_eligible",
  "notification_receive_non_sensitive",
]);

const selfSurfaceSchema = z.object({
  capability: graduateAccountCapabilitySchema,
  ownsGraduateRecord: z.boolean(),
  graduateRecordState: z.enum([
    "approved",
    "corrected",
    "revoked",
    "pending",
    "absent",
    "unavailable",
  ]),
  studentProfileStatus: z.string().nullable(),
  isGraduationCandidate: z.boolean().default(false),
  continuityPolicy: z
    .object({
      policyCode: z.string(),
      state: z.enum(["undecided", "approved", "rejected"]),
      allowPortalSignIn: z.boolean(),
      allowUniversityEmailReuse: z.boolean(),
      allowedCapabilities: z.array(graduateAccountCapabilitySchema),
      validFrom: z.string().nullable(),
      expiresAt: z.string().nullable(),
      decidedBy: z.string().nullable(),
      decidedAt: z.string().nullable(),
    })
    .optional(),
  at: z.string().optional(),
});

/**
 * Resolves whether the authenticated user may enter the graduate self surface.
 * Does not grant access from student_profiles.status or candidate lists.
 */
export const resolveGraduateSelfSurfaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => selfSurfaceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const policy = (data.continuityPolicy ?? ACCOUNT_CONTINUITY_POLICY_UNDECIDED) as AccountContinuityPolicy;
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: isPortalFeatureEnabled("studentGraduatesAffairs"),
      authenticated: Boolean(context.userId),
      studentProfileStatus: data.studentProfileStatus,
      isGraduationCandidate: data.isGraduationCandidate,
      ownsGraduateRecord: data.ownsGraduateRecord,
      graduateRecordState: data.graduateRecordState as GraduateFactLifecycle,
      continuityPolicy: policy,
      capability: data.capability,
      at: data.at ?? new Date().toISOString(),
    });
    return {
      allowed: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
      via: decision.allowed ? decision.via ?? "self" : null,
      featureEnabled: isPortalFeatureEnabled("studentGraduatesAffairs"),
      userId: context.userId,
    };
  });

const staffAccessSchema = z.object({
  appRoles: z.array(z.string()).default([]),
  actor: z.object({
    userId: z.string().nullable(),
    ownGraduateRecordIds: z.array(z.string()),
    assignments: z.array(
      z.object({
        unitCode: z.string(),
        roleCode: z.string(),
        isActive: z.boolean(),
        startsAt: z.string().nullable(),
        endsAt: z.string().nullable(),
        departmentIds: z.array(z.string()),
      }),
    ),
    activeFollowupRecordIds: z.array(z.string()),
  }),
  record: z.object({
    recordId: z.string(),
    programId: z.string(),
    departmentId: z.string(),
  }),
  at: z.string().optional(),
});

export const resolveStaffGraduateAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffAccessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor: GraduateAffairsActor = {
      ...data.actor,
      userId: context.userId,
    };
    const record: RecordScope = data.record;
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: isPortalFeatureEnabled("staffGraduatesAffairs"),
      authenticated: Boolean(context.userId),
      appRoles: data.appRoles,
      actor,
      record,
      at: new Date(data.at ?? Date.now()),
    });
    return {
      allowed: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
      via: decision.allowed ? decision.via ?? null : null,
      featureEnabled: isPortalFeatureEnabled("staffGraduatesAffairs"),
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
