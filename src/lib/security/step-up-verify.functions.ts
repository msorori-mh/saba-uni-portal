/**
 * Server-side step-up assertion verification.
 *
 * Postgres cannot verify ECDSA P-256 signatures (no such primitive in
 * pgcrypto), so the signature check happens here, on the server, and the proof
 * is minted by a `service_role`-only SQL function. The client never sees the
 * verification decision as a boolean it could forge: it only receives an opaque
 * single-use proof token, which the submit RPC consumes atomically.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildStepUpSigningMessage } from "./step-up-contract";
import { base64ToBytes, derToRawEcdsaSignature } from "./ecdsa-der";

const schema = z
  .object({
    challengeId: z.string().uuid(),
    signature: z.string().min(16).max(2048),
  })
  .strict();

export type StepUpVerifyResult =
  | { readonly ok: true; readonly proofToken: string }
  | { readonly ok: false; readonly reason: "invalid" | "expired" | "untrusted" };

export async function verifyEcdsaAssertion(input: {
  publicKeyDer: string;
  signatureDer: string;
  message: string;
}): Promise<boolean> {
  const raw = derToRawEcdsaSignature(base64ToBytes(input.signatureDer));
  if (!raw) return false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      base64ToBytes(input.publicKeyDer) as unknown as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      raw as unknown as ArrayBuffer,
      new TextEncoder().encode(input.message) as unknown as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

export const verifyStepUpAssertionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }): Promise<StepUpVerifyResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: challenge, error } = await supabaseAdmin
      .from("step_up_challenges")
      .select(
        "id, user_id, device_id, action_code, request_id, payload_hash, nonce, expires_at, consumed_at",
      )
      .eq("id", data.challengeId)
      .maybeSingle();

    if (error || !challenge) return { ok: false, reason: "invalid" };
    if (challenge.user_id !== context.userId) return { ok: false, reason: "invalid" };
    if (challenge.consumed_at) return { ok: false, reason: "invalid" };
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }

    const { data: device } = await supabaseAdmin
      .from("student_trusted_devices")
      .select("device_id, public_key, revoked_at")
      .eq("user_id", context.userId)
      .eq("device_id", challenge.device_id)
      .maybeSingle();

    if (!device || device.revoked_at) return { ok: false, reason: "untrusted" };

    const message = buildStepUpSigningMessage({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      userId: challenge.user_id,
      deviceId: challenge.device_id,
      actionCode: challenge.action_code,
      requestId: challenge.request_id,
      payloadHash: challenge.payload_hash,
      expiresAt: challenge.expires_at,
    });

    const valid = await verifyEcdsaAssertion({
      publicKeyDer: device.public_key,
      signatureDer: data.signature,
      message,
    });
    if (!valid) return { ok: false, reason: "invalid" };

    const { data: minted, error: mintError } = await supabaseAdmin.rpc("mint_step_up_proof", {
      p_challenge_id: challenge.id,
    });
    const token = (minted as { proof_token?: string } | null)?.proof_token;
    if (mintError || !token) return { ok: false, reason: "invalid" };

    return { ok: true, proofToken: token };
  });
