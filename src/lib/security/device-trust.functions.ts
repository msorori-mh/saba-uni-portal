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
import { buildB1StepUpPayload } from "@/lib/student-requests/student-request-submit-contract";
import { verifyEcdsaAssertion } from "./step-up-verify.functions";

const beginDeviceRegistrationSchema = z
  .object({
    deviceId: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type DeviceRegistrationChallenge = {
  nonce: string;
  expiresAt: string;
  mac: string;
  userId: string;
};

/**
 * Issues a short-lived (~2 min) registration nonce bound to the authenticated
 * user and the device id. Stateless: integrity comes from a server-only HMAC.
 */
export const beginDeviceRegistrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => beginDeviceRegistrationSchema.parse(input))
  .handler(async ({ data, context }): Promise<DeviceRegistrationChallenge> => {
    const { issueDeviceRegistrationNonce } = await import("./device-registration.server");
    const issued = await issueDeviceRegistrationNonce({
      userId: context.userId,
      deviceId: data.deviceId,
    });
    return { ...issued, userId: context.userId };
  });

const registerDeviceSchema = z
  .object({
    password: z.string().min(1),
    deviceId: z.string().regex(/^[0-9a-f]{64}$/),
    publicKey: z.string().min(64).max(4096),
    algorithm: z.string().min(1).max(64),
    platform: z.string().min(1).max(64),
    // Proof of possession of the private key for `publicKey`.
    nonce: z.string().regex(/^[0-9a-f]{48}$/),
    expiresAt: z.string().regex(/^[0-9]{1,16}$/),
    mac: z.string().regex(/^[0-9a-f]{64}$/),
    signature: z.string().min(16).max(2048),
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

    // Proof of possession: the nonce must be one this server issued to this
    // user for this device (HMAC + expiry), the device id must be the SHA-256
    // of the submitted public key, and the nonce message must be signed by the
    // matching private key. Without this any public key could be registered.
    const { verifyDeviceRegistrationNonce } = await import("./device-registration.server");
    const proof = await verifyDeviceRegistrationNonce({
      userId: context.userId,
      deviceId: data.deviceId,
      publicKeyDer: data.publicKey,
      nonce: data.nonce,
      expiresAt: data.expiresAt,
      mac: data.mac,
    });
    if (!proof.ok) throw new Error(proof.reason);
    const possessionProven = await verifyEcdsaAssertion({
      publicKeyDer: data.publicKey,
      signatureDer: data.signature,
      message: proof.message,
    });
    if (!possessionProven) throw new Error("DEVICE_KEY_PROOF_INVALID");

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
  /** Server-built hash the client must include in the signed message. */
  payloadHash: string;
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
    // Accept canonical and legacy stored codes (e.g. absence_excuse).
    const formData = (req.form_data as Record<string, unknown> | null) ?? {};
    const stepUpPayload = buildB1StepUpPayload(data.requestId, String(req.request_type), formData);
    const canonical = stepUpPayload.canonicalCode;
    if (!isStepUpSensitiveService(canonical)) {
      throw new Error("STEP_UP_NOT_REQUIRED_FOR_SERVICE");
    }
    if (!["draft", "returned", "returned_for_completion"].includes(req.status)) {
      throw new Error("REQUEST_NOT_SUBMITTABLE");
    }

    // Same payload the submit caller hashes (attachment ids from form_data).
    const payloadHash = await hashStepUpPayload(stepUpPayload);

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
      .select("id, nonce, expires_at, device_id, payload_hash")
      .single();
    if (insertError || !inserted) throw new Error(insertError?.message ?? "CHALLENGE_CREATE_FAILED");

    return {
      challengeId: String(inserted.id),
      nonce: String(inserted.nonce),
      expiresAt: String(inserted.expires_at),
      deviceId: String(inserted.device_id),
      payloadHash: String(inserted.payload_hash),
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
    // Accept canonical and legacy stored codes (e.g. absence_excuse).
    const formData = (req.form_data as Record<string, unknown> | null) ?? {};
    const stepUpPayload = buildB1StepUpPayload(data.requestId, String(req.request_type), formData);
    const canonical = stepUpPayload.canonicalCode;
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

    // Same payload the submit caller hashes (attachment ids from form_data).
    const payloadHash = await hashStepUpPayload(stepUpPayload);

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
