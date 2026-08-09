/**
 * Strict client input contracts for Graduates Affairs server adapters.
 *
 * These schemas are the trust-boundary wire format: only non-authoritative
 * identifiers are accepted. Ownership, lifecycle, continuity, assignments,
 * department scope, follow-up ids, and app roles must never appear here.
 */

import { z } from "zod";

/** P0 §6.1 vocabulary (plus legacy aliases retained by account-continuity). */
export const graduateAccountCapabilitySchema = z.enum([
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

/**
 * Client may supply capability (+ optional clock). Authoritative facts
 * (ownership, record state, continuity) are forbidden on the wire.
 */
export const graduateSelfSurfaceInputSchema = z
  .object({
    capability: graduateAccountCapabilitySchema,
    at: z.string().optional(),
  })
  .strict();

export type GraduateSelfSurfaceInput = z.infer<typeof graduateSelfSurfaceInputSchema>;

/**
 * Client may supply target record id (+ optional clock). Staff assignments,
 * app roles, department scope, and follow-up ids are forbidden on the wire.
 */
export const staffGraduateAccessInputSchema = z
  .object({
    recordId: z.string().uuid(),
    at: z.string().optional(),
  })
  .strict();

export type StaffGraduateAccessInput = z.infer<typeof staffGraduateAccessInputSchema>;
