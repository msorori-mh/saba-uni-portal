/**
 * Server-side trusted-device registration and web step-up proof issuance.
 *
 * All privileged operations (password re-authentication, proof minting, device
 * row writes) happen here, on the server, so the client cannot self-authorize.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  STEP_UP_SENSITIVE_SERVICES,
  getStepUpDescriptor,
  hashStepUpPayload,
  isStepUpSensitiveService,
} from "./step-up-contract";

const registerDeviceSchema = z
  .object({
    password: z.string().min(1),
    deviceId: z.string().min(8).max(256),
    publicKey: z.string().min(64).max(4096),
    algorithm: z.string().min(1).max(64),
    platform: z.string().min(1).max(64),
  })
  .strict();

export const registerTrustedDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerDeviceSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ registered: true; deviceId: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Fresh re-authentication: use the same Supabase auth endpoint the password
    // was originally issued against. A hijacked bearer token cannot do this.
    const email = context.claims?.email ?? context.user?.email;
    if (!email) throw new Error("AUTH_EMAIL_REQUIRED");
    const { error: authError } = await context.supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (authError) throw new Error("REAUTHENTICATION_FAILED");

    // Privileged device registration: only the server can write the trusted
    // device row, bypassing any client-side path.
    const { error } = await supabaseAdmin.from("student_trusted_devices").upsert(
      {
        user_id: context.userId,
        device_id: data.deviceId,
        public_key: data.publicKey,
        algorithm: data.algorithm,
        platform: data.platform,
        revoked_at: null,
      },
      { onConflict: "user_id,device_id" },
    );
    if (error) throw new Error(error.message);
    return { registered: true, deviceId: data.deviceId };
  });

const beginChallengeSchema = z
  .object({
    requestId: z.string().uuid(),
    deviceId: z.string().min(8).max(256),
  })
  .strict();

export type StepUpChallenge = {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  deviceId: string;
};

export const beginStepUpChallengeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => beginChallengeSchema.parse(input))
  .handler(async ({ data, context }): Promise<StepUpChallenge> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify the device is trusted for this user.
    const { data: device, error: deviceError } = await supabaseAdmin
      .from("student_trusted_devices")
      .select("device_id")
      .eq("user_id", context.userId)
      .eq("device_id", data.deviceId)
      .is("revoked_at", null)
      .maybeSingle();
    if (deviceError) throw new Error(deviceError.message);
    if (!device) throw new Error("DEVICE_NOT_TRUSTED");

    // Resolve the request and canonical service code.
    const { data: req, error: reqError } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_type, status, form_data, student_profile_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqError) throw new Error(reqError.message);
    if (!req || req.student_profile_id !== (await currentStudentProfileId(context.userId))) {
      throw new Error("REQUEST_NOT_FOUND");
    }
    const canonical = req.request_type;
    if (!isStepUpSensitiveService(canonical)) {
      throw new Error("STEP_UP_NOT_REQUIRED_FOR_SERVICE");
    }
    if (!["draft", "returned", "returned_for_completion"].includes(req.status)) {
      throw new Error("REQUEST_NOT_SUBMITTABLE");
    }

    // Load attachment ids for the signed payload hash.
    const { data: attachments } = await supabaseAdmin
      .from("student_request_attachments")
      .select("attachment_id:id")
      .eq("student_request_id", data.requestId)
      .is("rejected_at", null);
    const attachmentIds = ((attachments ?? []) as { id: string }[])
      .map((a) => a.id)
      .sort();
    const formData = (req.form_data as Record<string, unknown> | null) ?? {};

    const payloadHash = await hashStepUpPayload({
      requestId: data.requestId,
      canonicalCode: canonical,
      formData,
      attachmentIds,
    });

    const descriptor = getStepUpDescriptor(canonical)!;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiresAt = new Date(Date.now() + 120_000).toISOString();

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("step_up_challenges")
      .insert({
        user_id: context.userId,
        device_id: data.deviceId,
        action_code: descriptor.actionCode,
        request_id: data.requestId,
        payload_hash: payloadHash,
        nonce,
        expires_at: expiresAt,
      })
      .select("id, nonce, expires_at, device_id")
      .single();
    if (insertError || !inserted) throw new Error(insertError?.message ?? "CHALLENGE_CREATE_FAILED");

    return {
      challengeId: String(inserted.id),
      nonce: String(inserted.nonce),
      expiresAt: String(inserted.expires_at),
      deviceId: String(inserted.device_id),
    };
  });

async function currentStudentProfileId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("ACTIVE_STUDENT_PROFILE_REQUIRED");
  return data.id;
}

const webStepUpSchema = z
  .object({
    password: z.string().min(1),
    requestId: z.string().uuid(),
  })
  .strict();

export const performWebStepUpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => webStepUpSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ proofToken: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify the request and canonical service code.
    const { data: req, error: reqError } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_type, status, form_data, student_profile_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqError) throw new Error(reqError.message);
    if (!req || req.student_profile_id !== (await currentStudentProfileId(context.userId))) {
      throw new Error("REQUEST_NOT_FOUND");
    }
    const canonical = req.request_type;
    if (!isStepUpSensitiveService(canonical)) {
      throw new Error("STEP_UP_NOT_REQUIRED_FOR_SERVICE");
    }
    if (!["draft", "returned", "returned_for_completion"].includes(req.status)) {
      throw new Error("REQUEST_NOT_SUBMITTABLE");
    }

    // Fresh password re-authentication for the web channel.
    const email = context.claims?.email ?? context.user?.email;
    if (!email) throw new Error("AUTH_EMAIL_REQUIRED");
    const { error: authError } = await context.supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (authError) throw new Error("REAUTHENTICATION_FAILED");

    // Build the same canonical hash the native signing path binds to.
    const { data: attachments } = await supabaseAdmin
      .from("student_request_attachments")
      .select("attachment_id:id")
      .eq("student_request_id", data.requestId)
      .is("rejected_at", null);
    const attachmentIds = ((attachments ?? []) as { id: string }[])
      .map((a) => a.id)
      .sort();
    const formData = (req.form_data as Record<string, unknown> | null) ?? {};
    const payloadHash = await hashStepUpPayload({
      requestId: data.requestId,
      canonicalCode: canonical,
      formData,
      attachmentIds,
    });

    const descriptor = getStepUpDescriptor(canonical)!;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiresAt = new Date(Date.now() + 120_000).toISOString();

    const { error: insertError } = await supabaseAdmin.from("step_up_proofs").insert({
      proof_token: token,
      challenge_id: null as unknown as string,
      user_id: context.userId,
      device_id: "web",
      action_code: descriptor.actionCode,
      request_id: data.requestId,
      payload_hash: payloadHash,
      expires_at: expiresAt,
    });
    if (insertError) throw new Error(insertError.message);

    return { proofToken: token };
  });

/** Canonical list of services that require a step-up proof before submit. */
export const STEP_UP_REQUIRED_SERVICES = [...STEP_UP_SENSITIVE_SERVICES] as const;
