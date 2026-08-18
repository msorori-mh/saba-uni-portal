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

/** Assignable Graduates Affairs staff — AUTH-04 RPC only; blocked when staff flag OFF. */
export const listGraduateAffairsAssignableStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!isPortalFeatureEnabled("staffGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).listAssignableStaff();
  });



const updateProfileSchema = z.object({
  graduateRecordId: z.string().uuid(),
  publicDisplayName: z.string().nullable(),
  preferredContactChannel: z.string().nullable(),
  careerSummary: z.string().nullable(),
  profileVisibility: z.string().nullable(),
  rowVersion: z.number().int(),
});

/** Self file read — AUTH-04 RPC only; blocked when student flag OFF. */
export const getGraduateSelfFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("studentGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).getGraduateFile(data.graduateRecordId);
  });

/** Self contact points listing — AUTH-04 RPC only; blocked when student flag OFF. */
export const listGraduateSelfContactPointsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("studentGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).myContactPoints(data.graduateRecordId);
  });

/** Self consents listing — AUTH-04 RPC only; blocked when student flag OFF. */
export const listGraduateSelfConsentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("studentGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).myConsents(data.graduateRecordId);
  });

/** Active surveys for the graduate — AUTH-04 RPC only; blocked when student flag OFF. */
export const listGraduateSelfSurveysFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("studentGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).listSelfSurveys(data.graduateRecordId);
  });

/** Self visible opportunities listing — AUTH-04 RPC only; blocked when student flag OFF. */
export const listGraduateSelfOpportunitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("studentGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).listVisibleOpportunities(data.graduateRecordId);
  });

/** Self visible events listing — AUTH-04 RPC only; blocked when student flag OFF. */
export const listGraduateSelfEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => graduateRecordIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isPortalFeatureEnabled("studentGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).listVisibleEvents(data.graduateRecordId);
  });

/** Self profile mutation — AUTH-04 RPC only; blocked when student flag OFF. */
export const updateGraduateOwnProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).updateOwnProfile(data);
  });

const grantConsentSchema = z.object({
  graduateRecordId: z.string().uuid(),
  purposeCode: z.string().min(1),
  noticeVersion: z.string().min(1),
});

/** Self consent grant — AUTH-04 RPC only; blocked when student flag OFF. */
export const grantGraduateConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => grantConsentSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).grantConsent(data);
  });

const consentIdSchema = z.object({
  consentId: z.string().uuid(),
});

/** Self consent withdrawal — AUTH-04 RPC only; blocked when student flag OFF. */
export const withdrawGraduateConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => consentIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).withdrawConsent(data.consentId);
  });

const addContactPointSchema = z.object({
  graduateRecordId: z.string().uuid(),
  channelType: z.enum(["email", "phone"]),
  value: z.string().min(1),
  purposeCode: z.string().min(1),
});

/** Self contact point addition — AUTH-04 RPC only; blocked when student flag OFF. */
export const addGraduateContactPointFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addContactPointSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).addContactPoint(data);
  });

const contactPointIdSchema = z.object({
  contactPointId: z.string().uuid(),
});

/** Self contact point revocation — AUTH-04 RPC only; blocked when student flag OFF. */
export const revokeGraduateContactPointFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contactPointIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).revokeContactPoint(data.contactPointId);
  });

const reportEmploymentSchema = z.object({
  graduateRecordId: z.string().uuid(),
  employmentStatus: z.enum([
    "employed",
    "self_employed",
    "seeking_work",
    "continuing_education",
    "not_seeking",
    "not_disclosed",
  ]),
  employerNameReported: z.string().nullable(),
  occupationTitle: z.string().nullable(),
  specializationRelationship: z.enum([
    "directly_related",
    "partially_related",
    "not_related",
    "not_assessed",
  ]),
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable(),
});

/** Self employment report — AUTH-04 RPC only; blocked when student flag OFF. */
export const reportGraduateEmploymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportEmploymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).reportEmployment(data);
  });

const submitSurveyResponseSchema = z.object({
  surveyVersionId: z.string().uuid(),
  graduateRecordId: z.string().uuid(),
  consentId: z.string().uuid(),
  answers: z.record(z.unknown()),
});

/** Self survey response submission — AUTH-04 RPC only; blocked when student flag OFF. */
export const submitGraduateSurveyResponseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSurveyResponseSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).submitSurveyResponse(data);
  });

const responseIdSchema = z.object({
  responseId: z.string().uuid(),
});

/** Self survey response withdrawal — AUTH-04 RPC only; blocked when student flag OFF. */
export const withdrawGraduateSurveyResponseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => responseIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).withdrawSurveyResponse(data.responseId);
  });

const registerForEventSchema = z.object({
  eventId: z.string().uuid(),
  graduateRecordId: z.string().uuid(),
  consentId: z.string().uuid(),
});

/** Self event registration — AUTH-04 RPC only; blocked when student flag OFF. */
export const registerGraduateForEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerForEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).registerForEvent(data);
  });

const registrationIdSchema = z.object({
  registrationId: z.string().uuid(),
});

/** Self event registration cancellation — AUTH-04 RPC only; blocked when student flag OFF. */
export const cancelGraduateEventRegistrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registrationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("studentGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).cancelEventRegistration(data.registrationId);
  });

const createFollowupSchema = z.object({
  graduateRecordId: z.string().uuid(),
  assigneeUserId: z.string().uuid(),
  followupTypeId: z.string().uuid(),
  nextActionAt: z.string().nullable(),
});

/** Staff follow-up creation — AUTH-04 RPC only; blocked when staff flag OFF. */
export const createGraduateFollowupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createFollowupSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("staffGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).createFollowup(data);
  });

/** Staff-side read of active follow-up types for the creation dropdown. */
export const listActiveFollowupTypesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!isPortalFeatureEnabled("staffGraduatesAffairs")) {
      throw new GraduatesAffairsRpcError(GRADUATES_AFFAIRS_FROZEN_MSG, "graduates_affairs_feature_flag_off");
    }
    return rpcClient(context.supabase as SessionRpc).listActiveFollowupTypes();
  });

// --- GA-1/2/3 Admin server functions ---

/** Admin: list all follow-up types with current workflow info. */
export const adminListFollowupTypesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return rpcClient(context.supabase as SessionRpc).adminListFollowupTypes();
  });

const adminSaveFollowupTypeSchema = z.object({
  id: z.string().uuid().nullable(),
  code: z.string().min(1),
  labelAr: z.string().min(1),
  descriptionAr: z.string().nullable(),
  isActive: z.boolean(),
});

/** Admin: create or update a follow-up type. */
export const adminSaveFollowupTypeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminSaveFollowupTypeSchema.parse(input))
  .handler(async ({ data, context }) => {
    return rpcClient(context.supabase as SessionRpc).adminSaveFollowupType(data);
  });

const adminListWorkflowsSchema = z.object({
  followupTypeId: z.string().uuid().nullable().optional(),
});

/** Admin: list workflow versions for a type. */
export const adminListFollowupWorkflowsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminListWorkflowsSchema.parse(input))
  .handler(async ({ data, context }) => {
    return rpcClient(context.supabase as SessionRpc).adminListFollowupWorkflows(
      data?.followupTypeId ?? null,
    );
  });

const adminSaveWorkflowDraftSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  followupTypeId: z.string().uuid(),
  states: z.array(z.string()),
  transitions: z.array(z.object({ from: z.string(), to: z.string() })),
  initialState: z.string(),
  terminalStates: z.array(z.string()),
  requireOutcomeOnComplete: z.boolean(),
  maxActivePerGraduate: z.number().int().min(1),
  notes: z.string().nullable(),
});

/** Admin: save a draft workflow version. */
export const adminSaveWorkflowDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminSaveWorkflowDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    return rpcClient(context.supabase as SessionRpc).adminSaveWorkflowDraft({
      id: data.id ?? null,
      followup_type_id: data.followupTypeId,
      states: data.states,
      transitions: data.transitions,
      initial_state: data.initialState,
      terminal_states: data.terminalStates,
      require_outcome_on_complete: data.requireOutcomeOnComplete,
      max_active_per_graduate: data.maxActivePerGraduate,
      notes: data.notes,
    });
  });

const adminPublishWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
});

/** Admin: publish a draft workflow. */
export const adminPublishWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminPublishWorkflowSchema.parse(input))
  .handler(async ({ data, context }) => {
    return rpcClient(context.supabase as SessionRpc).adminPublishWorkflow(data.workflowId);
  });

const transitionFollowupSchema = z.object({
  followupId: z.string().uuid(),
  // Configurable workflow states: validated server-side against the pinned snapshot.
  targetState: z.string().min(1).max(64),
  outcome: z.string().nullable(),
  nextActionAt: z.string().nullable(),
});

/** Staff follow-up transition — AUTH-04 RPC only; blocked when staff flag OFF. */
export const transitionGraduateFollowupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => transitionFollowupSchema.parse(input))
  .handler(async ({ data, context }) => {
    denyMutationWhenFlagOff("staffGraduatesAffairs");
    return rpcClient(context.supabase as SessionRpc).transitionFollowup(data);
  });
