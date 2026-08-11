/**
 * Graduates Affairs operational authoring adapters (GA-OPS-01).
 *
 * Every call goes through a SECURITY DEFINER RPC that resolves the actor mode
 * (manager / specialist-in-scope / admin operational fallback) and writes an
 * audit event carrying that mode. No direct table mutations here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };

async function callRpc<T>(supabase: unknown, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as Rpc).rpc(name, args);
  if (error) {
    throw new Error(error.message ?? "GRADUATE_AFFAIRS_RPC_FAILED");
  }
  return data as T;
}

export interface GaOpportunityRow {
  id: string;
  employer_id: string | null;
  opportunity_type: string;
  title: string;
  description: string;
  audience_scope: Record<string, unknown> | null;
  state: string;
  published_at: string | null;
  closes_at: string | null;
  created_at: string;
}

export interface GaEventRow {
  id: string;
  title: string;
  event_type: string;
  purpose_code: string;
  notice_version: string;
  starts_at: string;
  ends_at: string;
  audience_scope: Record<string, unknown> | null;
  state: string;
  registrations_count: number;
}

export interface GaSurveyRow {
  survey_id: string;
  title: string;
  purpose_code: string;
  state: string;
  minimum_report_cell_size: number;
  version_id: string | null;
  version: number | null;
  notice_version: string | null;
  questions: unknown[] | null;
  published_at: string | null;
  response_count: number | null;
}

export interface GaEmployerRow {
  id: string;
  legal_name: string;
  sector_code: string | null;
  verification_state: string;
  verified_at: string | null;
}

export interface GaCommunicationRow {
  id: string;
  channel: string;
  template_code: string;
  purpose_code: string;
  notice_version: string;
  sent_at: string;
  sent_by: string | null;
}

/* ---------------- opportunities ---------------- */

const opportunitySchema = z.object({
  id: z.string().uuid().nullable().default(null),
  opportunityType: z.enum(["job", "internship", "training"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  employerId: z.string().uuid().nullable().default(null),
  closesAt: z.string().min(1).nullable().default(null),
  audienceScope: z.record(z.string(), z.unknown()).default({}),
});

export const listGaOpportunitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    callRpc<GaOpportunityRow[]>(context.supabase, "ga_op_list_opportunities", {}),
  );

export const saveGaOpportunityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => opportunitySchema.parse(input))
  .handler(async ({ data, context }) =>
    callRpc<string>(context.supabase, "ga_op_save_opportunity", {
      p_id: data.id,
      p_opportunity_type: data.opportunityType,
      p_title: data.title,
      p_description: data.description,
      p_audience_scope: data.audienceScope,
      p_closes_at: data.closesAt,
      p_employer_id: data.employerId,
    }),
  );

export const moderateGaOpportunityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        opportunityId: z.string().uuid(),
        targetState: z.enum(["draft", "in_review", "published", "closed", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    callRpc<null>(context.supabase, "graduate_affairs_moderate_opportunity", {
      p_opportunity_id: data.opportunityId,
      p_target_state: data.targetState,
    }),
  );

/* ---------------- events ---------------- */

const eventSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  title: z.string().min(1).max(200),
  eventType: z.enum(["career", "training", "networking", "survey", "quality"]),
  purposeCode: z.string().min(1).max(80),
  noticeVersion: z.string().min(1).max(40),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  audienceScope: z.record(z.string(), z.unknown()).default({}),
});

export const listGaEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => callRpc<GaEventRow[]>(context.supabase, "ga_op_list_events", {}));

export const saveGaEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => eventSchema.parse(input))
  .handler(async ({ data, context }) =>
    callRpc<string>(context.supabase, "ga_op_save_event", {
      p_id: data.id,
      p_title: data.title,
      p_event_type: data.eventType,
      p_purpose_code: data.purposeCode,
      p_notice_version: data.noticeVersion,
      p_starts_at: data.startsAt,
      p_ends_at: data.endsAt,
      p_audience_scope: data.audienceScope,
    }),
  );

export const transitionGaEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        targetState: z.enum(["published", "completed", "cancelled", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    callRpc<null>(context.supabase, "ga_op_transition_event", {
      p_event_id: data.eventId,
      p_target_state: data.targetState,
    }),
  );

/* ---------------- surveys ---------------- */

export const listGaSurveysFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => callRpc<GaSurveyRow[]>(context.supabase, "ga_op_list_surveys", {}));

export const saveGaSurveyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().default(null),
        title: z.string().min(1).max(200),
        purposeCode: z.string().min(1).max(80),
        minimumReportCellSize: z.number().int().min(3).max(100).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    callRpc<string>(context.supabase, "ga_op_save_survey", {
      p_id: data.id,
      p_title: data.title,
      p_purpose_code: data.purposeCode,
      p_minimum_report_cell_size: data.minimumReportCellSize,
    }),
  );

export const saveGaSurveyVersionDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        surveyId: z.string().uuid(),
        versionId: z.string().uuid().nullable().default(null),
        noticeVersion: z.string().min(1).max(40),
        questions: z.array(z.record(z.string(), z.unknown())).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    callRpc<string>(context.supabase, "ga_op_save_survey_version_draft", {
      p_survey_id: data.surveyId,
      p_version_id: data.versionId,
      p_notice_version: data.noticeVersion,
      p_questions: data.questions,
    }),
  );

export const publishGaSurveyVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    callRpc<null>(context.supabase, "ga_op_publish_survey_version", { p_version_id: data.versionId }),
  );

export const closeGaSurveyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ surveyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    callRpc<null>(context.supabase, "ga_op_close_survey", { p_survey_id: data.surveyId }),
  );

/* ---------------- employers & communications ---------------- */

export const listGaEmployersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => callRpc<GaEmployerRow[]>(context.supabase, "ga_op_list_employers", {}));

export const setGaEmployerVerificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        targetState: z.enum(["in_review", "verified", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    callRpc<null>(context.supabase, "graduate_affairs_set_employer_verification", {
      p_employer_id: data.employerId,
      p_target_state: data.targetState,
    }),
  );

export const listGaCommunicationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ graduateRecordId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    callRpc<GaCommunicationRow[]>(context.supabase, "ga_op_list_communications", {
      p_graduate_record_id: data.graduateRecordId,
    }),
  );

export const logGaCommunicationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        graduateRecordId: z.string().uuid(),
        contactPointId: z.string().uuid(),
        purposeCode: z.string().min(1).max(80),
        channel: z.enum(["email", "phone"]),
        templateCode: z.string().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    callRpc<string>(context.supabase, "ga_op_log_communication", {
      p_graduate_record_id: data.graduateRecordId,
      p_contact_point_id: data.contactPointId,
      p_purpose_code: data.purposeCode,
      p_channel: data.channel,
      p_template_code: data.templateCode,
      p_payload_meta: {},
    }),
  );
