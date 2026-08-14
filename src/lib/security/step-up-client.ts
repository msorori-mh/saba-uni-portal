/**
 * Step-up orchestration (client side).
 *
 * The client CANNOT authorise anything: it only obtains a server-issued
 * challenge, has it signed by the Keystore-held private key after a successful
 * biometric prompt, and exchanges the signature for a single-use, short-lived
 * server proof token. The final authority is the submit RPC, which consumes the
 * proof atomically inside the same transaction as the submit.
 */

import {
  BiometricError,
  ensureDeviceKey,
  isBiometricRuntimeAvailable,
  signStepUpChallenge,
} from "@/lib/native/biometrics";
import {
  buildStepUpSigningMessage,
  getStepUpDescriptor,
  hashStepUpPayload,
  STEP_UP_MESSAGES_AR,
} from "./step-up-contract";

export type StepUpRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type StepUpOutcome =
  | { readonly status: "proof"; readonly proofToken: string }
  | { readonly status: "canceled"; readonly messageAr: string }
  | { readonly status: "failed"; readonly messageAr: string }
  | { readonly status: "unavailable"; readonly messageAr: string }
  | { readonly status: "trust_revoked"; readonly messageAr: string };

export type StepUpRequest = {
  readonly serviceCode: string;
  readonly requestId: string;
  readonly userId: string;
  /** Exact operation payload that will be submitted (bound into the signature). */
  readonly payload: unknown;
};

type ChallengeRow = {
  challenge_id?: string;
  nonce?: string;
  expires_at?: string;
  device_id?: string;
};

function first<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

/**
 * Returns a proof token, or a terminal non-proof outcome.
 * Callers MUST NOT invoke the sensitive RPC unless `status === "proof"`.
 */
export async function performStepUp(
  client: StepUpRpcClient,
  input: StepUpRequest,
  deps: {
    biometricsAvailable?: () => boolean;
    ensureKey?: typeof ensureDeviceKey;
    sign?: typeof signStepUpChallenge;
  } = {},
): Promise<StepUpOutcome> {
  const descriptor = getStepUpDescriptor(input.serviceCode);
  if (!descriptor) {
    return { status: "unavailable", messageAr: STEP_UP_MESSAGES_AR.unavailable };
  }

  const available = (deps.biometricsAvailable ?? isBiometricRuntimeAvailable)();
  if (!available) {
    return { status: "unavailable", messageAr: STEP_UP_MESSAGES_AR.unavailable };
  }

  const ensureKeyFn = deps.ensureKey ?? ensureDeviceKey;
  const signFn = deps.sign ?? signStepUpChallenge;

  let deviceId: string;
  try {
    deviceId = (await ensureKeyFn()).deviceId;
  } catch (error) {
    if (error instanceof BiometricError && error.code === "KEY_INVALIDATED") {
      return { status: "trust_revoked", messageAr: STEP_UP_MESSAGES_AR.deviceUntrusted };
    }
    return { status: "unavailable", messageAr: STEP_UP_MESSAGES_AR.unavailable };
  }

  const payloadHash = await hashStepUpPayload(input.payload);

  const issued = await client.rpc("issue_step_up_challenge", {
    p_device_id: deviceId,
    p_action_code: descriptor.actionCode,
    p_request_id: input.requestId,
    p_payload_hash: payloadHash,
  });
  if (issued.error) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }
  const challenge = first<ChallengeRow>(issued.data);
  if (!challenge?.challenge_id || !challenge.nonce || !challenge.expires_at) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }

  const message = buildStepUpSigningMessage({
    challengeId: challenge.challenge_id,
    nonce: challenge.nonce,
    userId: input.userId,
    deviceId,
    actionCode: descriptor.actionCode,
    requestId: input.requestId,
    payloadHash,
    expiresAt: challenge.expires_at,
  });

  let signature: string;
  try {
    signature = (await signFn(message, descriptor.titleAr)).signature;
  } catch (error) {
    if (error instanceof BiometricError) {
      if (error.code === "USER_CANCELED") {
        return { status: "canceled", messageAr: STEP_UP_MESSAGES_AR.canceled };
      }
      if (error.code === "KEY_INVALIDATED") {
        return { status: "trust_revoked", messageAr: STEP_UP_MESSAGES_AR.deviceUntrusted };
      }
    }
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }

  const verified = await client.rpc("verify_step_up_assertion", {
    p_challenge_id: challenge.challenge_id,
    p_signature: signature,
  });
  if (verified.error) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }
  const proof = first<{ proof_token?: string }>(verified.data);
  if (!proof?.proof_token) {
    return { status: "failed", messageAr: STEP_UP_MESSAGES_AR.failed };
  }
  return { status: "proof", proofToken: proof.proof_token };
}
